/*
  Smart Adapter - ESP32 Firmware with REST API for Web Dashboard
  ----------------------------------------------------------------
  Exposes a local JSON REST API so a web dashboard frontend can:
    - Read live voltage/current/power/energy from the PZEM-004T
    - Get/set the trip threshold
    - Send ON / OFF / RESET commands
    - Identify this device among multiple deployed units (device_id)

  Multi-device support: each physical adapter runs this same sketch
  with a unique DEVICE_ID and DEVICE_NAME below. Your dashboard keeps
  a list of device IP addresses (or mDNS hostnames) and polls each
  one's /api/reading endpoint independently - no central server needed
  for a basic version.

  Libraries needed (Arduino Library Manager):
  - PZEM004Tv30 by Jakub Andrzejewski
  - ArduinoJson by Benoit Blanchon
  - ESPmDNS (bundled with ESP32 board package)
  - Preferences (bundled with ESP32 board package)
  - WebServer (bundled with ESP32 board package)
*/

#include <algorithm>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <PZEM004Tv30.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "secrets.h"
#include "google_root_cas.h"

// ---------- USER CONFIG (unique per device) ----------
const char* WIFI_SSID     = SECRET_WIFI_SSID;
const char* WIFI_PASSWORD = SECRET_WIFI_PASSWORD;

String DEVICE_ID;           // generated from MAC
String DEVICE_NAME;         // generated from MAC
String MDNS_HOSTNAME;       // generated from MAC

// ---------- CLOUD CONFIG ----------
#define FW_VERSION "0.2.0-cloud"
const char* CLOUD_INGEST_URL = SECRET_CLOUD_INGEST_URL;
const char* CLOUD_DEVICE_KEY = SECRET_CLOUD_DEVICE_KEY;
// Command poll URL: same Cloud Function, /commands sub-path
// e.g. https://us-central1-smart-adapter-backend.cloudfunctions.net/ingest/commands
#define CLOUD_COMMAND_PATH "/commands"

const uint32_t CLOUD_PUSH_INTERVAL_MS      = 5000;   // ← LOCKED: agreed 5 s push interval
const uint32_t CLOUD_CMD_POLL_INTERVAL_MS  = 2000;   // poll for commands every 2 s
const uint32_t CLOUD_MIN_SPACING_MS        = 2500;   // must exceed server MIN_PUSH_INTERVAL_S (2.0 s)
const uint32_t CLOUD_CONFIG_ERROR_DELAY_MS = 60000;  // after 400/401/403/413/415
const uint32_t CLOUD_MAX_BACKOFF_MS        = 60000;
const uint32_t CLOUD_CONNECT_TIMEOUT_MS    = 5000;
const uint16_t CLOUD_READ_TIMEOUT_MS       = 10000;  // covers Cloud Function cold starts
const uint32_t CLOUD_TLS_HANDSHAKE_TIMEOUT_S = 10;
const uint32_t CLOUD_MIN_FREE_BLOCK        = 45000;
const uint32_t CLOUD_TASK_STACK            = 12288;
const uint32_t WIFI_CHECK_INTERVAL_MS      = 10000;

// ---------- PIN CONFIG ----------
#define RELAY_PIN     4
#define PZEM_RX_PIN   16   // ESP32 RX2 <- PZEM TX
#define PZEM_TX_PIN   17   // ESP32 TX2 -> PZEM RX

// ---------- GLOBALS ----------
WebServer server(80);
PZEM004Tv30 pzem(Serial2, PZEM_RX_PIN, PZEM_TX_PIN);
Preferences prefs;

float powerThreshold = 1500.0;   // default, overridden by saved value on boot
bool tripped = false;
bool manuallyOff = false;

unsigned long lastReadTime = 0;
const unsigned long READ_INTERVAL = 1000; // ms between PZEM reads

// Debounce for trip logic
int overloadCounter = 0;
const int TRIP_DELAY_SAMPLES = 3;   // ~3 consecutive over-threshold reads before tripping

// Latest cached readings (served instantly to the dashboard without re-polling PZEM every request)
float lastVoltage = 0, lastCurrent = 0, lastPower = 0, lastEnergy = 0, lastFreq = 0, lastPF = 0;

// ---------- ADAPTIVE PREDICTIVE LOAD PROTECTION (idp_predictive_idea_add_on) ----------
#define MAX_APPLIANCE_PROFILES 8

struct PredictiveConfig {
  float hardSafetyLimit;       // Physical maximum ceiling (W) - dynamic threshold will never exceed this
  float kSensitivity;          // k: multiplier for normal variation sigma (T = P_normal + k*sigma + M)
  float safetyMarginM;         // M: configured safety margin (W)
  float degradationThreshPct;  // % increase from baseline indicating appliance degradation
  float minLoadStandbyW;       // Below this power level is considered idle/standby
  bool adaptiveEnabled;        // Enable/disable dynamic adaptive predictive tripping
};

struct ApplianceProfile {
  char id[16];
  char name[32];
  float nominalPower;          // P_normal (W) - learned steady-state mean
  float nominalCurrent;        // I_normal (A)
  float powerFactor;           // Learned typical power factor
  float startupPeakPower;      // Inrush peak power during startup (W)
  float startupPeakCurrent;    // Inrush peak current during startup (A)
  float startupDurationS;      // Duration of startup inrush spike (seconds)
  float powerStdDev;           // sigma: standard deviation of steady-state power (W)
  float baselinePower;         // Historical baseline power from initial learning (W)
  float degradationPct;        // ((nominalPower - baselinePower) / baselinePower) * 100
  uint32_t sessionCount;       // Number of times this appliance was used
  uint32_t sampleCount;        // Steady-state samples collected
  float m2;                    // Sum of squares for online Welford variance
  bool degradationAlert;       // True if persistent increase exceeds degradation threshold
  bool valid;
};

enum ApplianceState {
  APP_STANDBY,
  APP_STARTUP,
  APP_STEADY
};

static PredictiveConfig gPredConfig = {
  2500.0f,  // hardSafetyLimit (W)
  3.0f,     // kSensitivity
  50.0f,    // safetyMarginM (W)
  15.0f,    // degradationThreshPct (%)
  5.0f,     // minLoadStandbyW (W)
  true      // adaptiveEnabled
};

static ApplianceProfile gProfiles[MAX_APPLIANCE_PROFILES];
static int gActiveProfileIdx = -1;
static ApplianceState gAppState = APP_STANDBY;
static unsigned long gStartupStartMs = 0;
static float gCurrentStartupPeakPower = 0.0f;
static float gCurrentStartupPeakCurrent = 0.0f;
static float gCurrentStartupDurationS = 0.0f;
static float gDynamicThreshold = 2500.0f;
static float gRiskLevel = 0.0f;
static float gDegradationPct = 0.0f;
static bool gDegradationAlert = false;
static float gLearnedNormalPower = 0.0f;
static float gLearnedSigma = 0.0f;
static char gActiveApplianceName[32] = "None (Standby)";

struct TelemetrySnapshot {
  float voltage, current, power, energy, frequency, powerFactor, threshold;
  bool tripped;
  bool relayOn;
  bool valid;
  // Adaptive predictive fields
  float dynamicThreshold;
  float riskLevel;
  float degradationPct;
  bool degradationAlert;
  float inrushPower;
  float inrushCurrent;
  float startupDurationS;
  float pNormal;
  float sigma;
  char activeAppliance[32];
};
static TelemetrySnapshot gSnapshot = {};
static portMUX_TYPE gSnapshotMux = portMUX_INITIALIZER_UNLOCKED;
static TaskHandle_t gCloudTaskHandle = nullptr;
static bool gLastTrippedSeen = false;
static unsigned long gLastWifiCheckMs = 0;
static bool gWifiWasUp = false;
static uint8_t gWifiDownChecks = 0;

// ---------- HELPERS ----------
bool isRelayOn() {
  return digitalRead(RELAY_PIN) == LOW; // active LOW
}

void publishSnapshot() {
  portENTER_CRITICAL(&gSnapshotMux);
  gSnapshot.voltage = lastVoltage;
  gSnapshot.current = lastCurrent;
  gSnapshot.power = lastPower;
  gSnapshot.energy = lastEnergy;
  gSnapshot.frequency = lastFreq;
  gSnapshot.powerFactor = lastPF;
  gSnapshot.threshold = powerThreshold;
  gSnapshot.tripped = tripped;
  gSnapshot.relayOn = isRelayOn();
  gSnapshot.dynamicThreshold = gDynamicThreshold;
  gSnapshot.riskLevel = gRiskLevel;
  gSnapshot.degradationPct = gDegradationPct;
  gSnapshot.degradationAlert = gDegradationAlert;
  gSnapshot.inrushPower = gCurrentStartupPeakPower;
  gSnapshot.inrushCurrent = gCurrentStartupPeakCurrent;
  gSnapshot.startupDurationS = gCurrentStartupDurationS;
  gSnapshot.pNormal = gLearnedNormalPower;
  gSnapshot.sigma = gLearnedSigma;
  strncpy(gSnapshot.activeAppliance, gActiveApplianceName, sizeof(gSnapshot.activeAppliance) - 1);
  gSnapshot.activeAppliance[sizeof(gSnapshot.activeAppliance) - 1] = '\0';
  gSnapshot.valid = true;
  portEXIT_CRITICAL(&gSnapshotMux);
}

template <size_t N>
void setNumOrNull(StaticJsonDocument<N>& doc, const char* key, float value) {
  if (isnan(value)) {
    doc[key] = nullptr;
  } else {
    doc[key] = value;
  }
}

bool cloudConfigured() {
  if (String(CLOUD_INGEST_URL).indexOf("REGION-PROJECT") != -1) return false;
  if (String(CLOUD_DEVICE_KEY).indexOf("replace-with") != -1) return false;
  return true;
}

void superviseWifi() {
  if (millis() - gLastWifiCheckMs < WIFI_CHECK_INTERVAL_MS) return;
  gLastWifiCheckMs = millis();
  
  if (WiFi.status() == WL_CONNECTED) {
    gWifiWasUp = true;
    gWifiDownChecks = 0;
  } else {
    if (gWifiWasUp) {
      Serial.println("[wifi] connection lost, reconnecting...");
      gWifiWasUp = false;
    }
    gWifiDownChecks++;
    WiFi.reconnect();
    if (gWifiDownChecks > 3) {
      Serial.println("[wifi] hard reconnecting");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      gWifiDownChecks = 0;
    }
  }
}

void cloudTask(void* parameter) {
  uint32_t backoff = CLOUD_PUSH_INTERVAL_MS;
  uint32_t seq = 0;
  WiFiClientSecure client;
  HTTPClient http;
  
  client.setCACert(GOOGLE_ROOT_CAS);
  client.setHandshakeTimeout(CLOUD_TLS_HANDSHAKE_TIMEOUT_S);
  
  while (true) {
    ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(backoff));
    
    if (WiFi.status() != WL_CONNECTED) {
      backoff = CLOUD_PUSH_INTERVAL_MS;
      continue;
    }
    
    if (ESP.getMaxAllocHeap() < CLOUD_MIN_FREE_BLOCK) {
      Serial.println("[cloud] heap fragmented, skipping push");
      vTaskDelay(pdMS_TO_TICKS(5000));
      continue;
    }
    
    TelemetrySnapshot snap;
    portENTER_CRITICAL(&gSnapshotMux);
    snap = gSnapshot;
    portEXIT_CRITICAL(&gSnapshotMux);
    
    if (!snap.valid) continue;
    
    StaticJsonDocument<768> doc;
    doc["device_id"] = DEVICE_ID;
    doc["device_name"] = DEVICE_NAME;
    doc["fw_version"] = FW_VERSION;
    doc["rssi"] = WiFi.RSSI();
    doc["seq"] = seq;
    doc["free_heap"] = ESP.getFreeHeap();
    doc["threshold"] = snap.threshold;
    doc["tripped"] = snap.tripped;
    doc["relay_on"] = snap.relayOn;
    
    setNumOrNull(doc, "voltage", snap.voltage);
    setNumOrNull(doc, "current", snap.current);
    setNumOrNull(doc, "power", snap.power);
    setNumOrNull(doc, "energy", snap.energy);
    setNumOrNull(doc, "frequency", snap.frequency);
    setNumOrNull(doc, "power_factor", snap.powerFactor);
    
    // Predictive fields
    if (strlen(snap.activeAppliance) > 0) {
      doc["active_appliance"] = snap.activeAppliance;
    }
    doc["degradation_alert"] = snap.degradationAlert;
    setNumOrNull(doc, "dynamic_threshold", snap.dynamicThreshold);
    setNumOrNull(doc, "risk_level", snap.riskLevel);
    setNumOrNull(doc, "degradation_pct", snap.degradationPct);
    setNumOrNull(doc, "inrush_power", snap.inrushPower);
    setNumOrNull(doc, "inrush_current", snap.inrushCurrent);
    setNumOrNull(doc, "startup_duration_s", snap.startupDurationS);
    setNumOrNull(doc, "p_normal", snap.pNormal);
    setNumOrNull(doc, "sigma", snap.sigma);
    
    String payload;
    serializeJson(doc, payload);
    
    http.begin(client, CLOUD_INGEST_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Key", CLOUD_DEVICE_KEY);
    http.setConnectTimeout(CLOUD_CONNECT_TIMEOUT_MS);
    http.setTimeout(CLOUD_READ_TIMEOUT_MS);
    
    int code = http.POST(payload);
    http.end();
    
    if (code == 200 || code == 429) {
      Serial.printf("[cloud] ok seq=%lu\n", (unsigned long)seq);
      backoff = CLOUD_PUSH_INTERVAL_MS;
      seq++;
    } else if (code == 400 || code == 401 || code == 403 || code == 413 || code == 415) {
      Serial.printf("[cloud] config error %d\n", code);
      backoff = CLOUD_CONFIG_ERROR_DELAY_MS;
    } else {
      Serial.printf("[cloud] fail %d\n", code);
      backoff = (backoff == CLOUD_PUSH_INTERVAL_MS) ? 10000 : std::min(backoff * 2, CLOUD_MAX_BACKOFF_MS);
    }
    
    vTaskDelay(pdMS_TO_TICKS(CLOUD_MIN_SPACING_MS));
  }
}

// ---------- Execute a command received from the cloud ----------
void executeCloudCommand(const String& cmd) {
  Serial.printf("[cmd] executing cloud command: %s\n", cmd.c_str());
  if (cmd == "ON") {
    manuallyOff = false;
    tripped = false;
    overloadCounter = 0;
    setRelay(true);
  } else if (cmd == "OFF") {
    manuallyOff = true;
    setRelay(false);
  } else if (cmd == "RESET") {
    tripped = false;
    manuallyOff = false;
    overloadCounter = 0;
    setRelay(true);
  }
  // Force immediate cloud push so the new relay state is reflected globally within 5 s
  if (gCloudTaskHandle) xTaskNotifyGive(gCloudTaskHandle);
}

// ---------- Command poll task — runs every 2 s on core 0 ----------
void commandPollTask(void* parameter) {
  // Build the command URL: base ingest URL + /commands?device_id=<id>
  String baseUrl = String(CLOUD_INGEST_URL);
  String cmdUrl = baseUrl + CLOUD_COMMAND_PATH + "?device_id=" + String(DEVICE_ID);

  WiFiClientSecure client;
  HTTPClient http;
  client.setCACert(GOOGLE_ROOT_CAS);
  client.setHandshakeTimeout(CLOUD_TLS_HANDSHAKE_TIMEOUT_S);

  while (true) {
    vTaskDelay(pdMS_TO_TICKS(CLOUD_CMD_POLL_INTERVAL_MS));

    if (WiFi.status() != WL_CONNECTED) continue;
    if (ESP.getMaxAllocHeap() < CLOUD_MIN_FREE_BLOCK) continue;

    http.begin(client, cmdUrl);
    http.addHeader("X-Device-Key", CLOUD_DEVICE_KEY);
    http.setConnectTimeout(CLOUD_CONNECT_TIMEOUT_MS);
    http.setTimeout(CLOUD_READ_TIMEOUT_MS);

    int code = http.GET();
    if (code == 200) {
      String body = http.getString();
      http.end();

      StaticJsonDocument<128> doc;
      DeserializationError err = deserializeJson(doc, body);
      if (!err && !doc["command"].isNull()) {
        String cmd = doc["command"].as<String>();
        executeCloudCommand(cmd);
      }
    } else {
      http.end();
      if (code > 0) {
        Serial.printf("[cmd] poll returned %d\n", code);
      }
    }
  }
}

// ---------- ADAPTIVE PREDICTIVE ENGINE HELPERS ----------

void savePredictiveConfig() {
  prefs.putFloat("p_hard_limit", gPredConfig.hardSafetyLimit);
  prefs.putFloat("p_k_factor", gPredConfig.kSensitivity);
  prefs.putFloat("p_margin_m", gPredConfig.safetyMarginM);
  prefs.putFloat("p_deg_thresh", gPredConfig.degradationThreshPct);
  prefs.putFloat("p_min_load", gPredConfig.minLoadStandbyW);
  prefs.putBool("p_adaptive_en", gPredConfig.adaptiveEnabled);
}

void saveProfiles() {
  prefs.putInt("p_prof_count", MAX_APPLIANCE_PROFILES);
  for (int i = 0; i < MAX_APPLIANCE_PROFILES; i++) {
    char key[20];
    snprintf(key, sizeof(key), "p_val_%d", i);
    prefs.putBool(key, gProfiles[i].valid);
    if (gProfiles[i].valid) {
      snprintf(key, sizeof(key), "p_name_%d", i);
      prefs.putString(key, gProfiles[i].name);
      snprintf(key, sizeof(key), "p_nomP_%d", i);
      prefs.putFloat(key, gProfiles[i].nominalPower);
      snprintf(key, sizeof(key), "p_nomI_%d", i);
      prefs.putFloat(key, gProfiles[i].nominalCurrent);
      snprintf(key, sizeof(key), "p_pf_%d", i);
      prefs.putFloat(key, gProfiles[i].powerFactor);
      snprintf(key, sizeof(key), "p_pkP_%d", i);
      prefs.putFloat(key, gProfiles[i].startupPeakPower);
      snprintf(key, sizeof(key), "p_pkI_%d", i);
      prefs.putFloat(key, gProfiles[i].startupPeakCurrent);
      snprintf(key, sizeof(key), "p_dur_%d", i);
      prefs.putFloat(key, gProfiles[i].startupDurationS);
      snprintf(key, sizeof(key), "p_sig_%d", i);
      prefs.putFloat(key, gProfiles[i].powerStdDev);
      snprintf(key, sizeof(key), "p_baseP_%d", i);
      prefs.putFloat(key, gProfiles[i].baselinePower);
      snprintf(key, sizeof(key), "p_deg_%d", i);
      prefs.putFloat(key, gProfiles[i].degradationPct);
      snprintf(key, sizeof(key), "p_sess_%d", i);
      prefs.putUInt(key, gProfiles[i].sessionCount);
    }
  }
}

void resetProfiles() {
  for (int i = 0; i < MAX_APPLIANCE_PROFILES; i++) {
    gProfiles[i].valid = false;
    char key[20];
    snprintf(key, sizeof(key), "p_val_%d", i);
    prefs.putBool(key, false);
  }
  gActiveProfileIdx = -1;
  gAppState = APP_STANDBY;
  strncpy(gActiveApplianceName, "None (Standby)", sizeof(gActiveApplianceName) - 1);
  gDynamicThreshold = gPredConfig.hardSafetyLimit;
  gRiskLevel = 0.0f;
  gDegradationPct = 0.0f;
  gDegradationAlert = false;
}

void initPredictiveProtection() {
  gPredConfig.hardSafetyLimit = prefs.getFloat("p_hard_limit", 2500.0f);
  gPredConfig.kSensitivity = prefs.getFloat("p_k_factor", 3.0f);
  gPredConfig.safetyMarginM = prefs.getFloat("p_margin_m", 50.0f);
  gPredConfig.degradationThreshPct = prefs.getFloat("p_deg_thresh", 15.0f);
  gPredConfig.minLoadStandbyW = prefs.getFloat("p_min_load", 5.0f);
  gPredConfig.adaptiveEnabled = prefs.getBool("p_adaptive_en", true);

  for (int i = 0; i < MAX_APPLIANCE_PROFILES; i++) {
    char key[20];
    snprintf(key, sizeof(key), "p_val_%d", i);
    gProfiles[i].valid = prefs.getBool(key, false);
    if (gProfiles[i].valid) {
      snprintf(key, sizeof(key), "p_name_%d", i);
      String n = prefs.getString(key, "Appliance");
      strncpy(gProfiles[i].name, n.c_str(), sizeof(gProfiles[i].name) - 1);
      snprintf(key, sizeof(key), "p_nomP_%d", i);
      gProfiles[i].nominalPower = prefs.getFloat(key, 0.0f);
      snprintf(key, sizeof(key), "p_nomI_%d", i);
      gProfiles[i].nominalCurrent = prefs.getFloat(key, 0.0f);
      snprintf(key, sizeof(key), "p_pf_%d", i);
      gProfiles[i].powerFactor = prefs.getFloat(key, 1.0f);
      snprintf(key, sizeof(key), "p_pkP_%d", i);
      gProfiles[i].startupPeakPower = prefs.getFloat(key, 0.0f);
      snprintf(key, sizeof(key), "p_pkI_%d", i);
      gProfiles[i].startupPeakCurrent = prefs.getFloat(key, 0.0f);
      snprintf(key, sizeof(key), "p_dur_%d", i);
      gProfiles[i].startupDurationS = prefs.getFloat(key, 0.0f);
      snprintf(key, sizeof(key), "p_sig_%d", i);
      gProfiles[i].powerStdDev = prefs.getFloat(key, 2.0f);
      snprintf(key, sizeof(key), "p_baseP_%d", i);
      gProfiles[i].baselinePower = prefs.getFloat(key, gProfiles[i].nominalPower);
      snprintf(key, sizeof(key), "p_deg_%d", i);
      gProfiles[i].degradationPct = prefs.getFloat(key, 0.0f);
      snprintf(key, sizeof(key), "p_sess_%d", i);
      gProfiles[i].sessionCount = prefs.getUInt(key, 1);
      gProfiles[i].sampleCount = 10;
      gProfiles[i].m2 = 0.0f;
      gProfiles[i].degradationAlert = (gProfiles[i].sessionCount >= 2 && gProfiles[i].degradationPct >= gPredConfig.degradationThreshPct);
    }
  }
  gDynamicThreshold = gPredConfig.hardSafetyLimit;
}

int matchOrCreateProfile(float steadyPower, float steadyCurrent, float pf, float peakPower, float peakCurrent, float startupDur) {
  // Check for match against existing profiles
  for (int i = 0; i < MAX_APPLIANCE_PROFILES; i++) {
    if (gProfiles[i].valid) {
      float pDiff = fabs(steadyPower - gProfiles[i].nominalPower) / std::max(1.0f, gProfiles[i].nominalPower);
      float pfDiff = fabs(pf - gProfiles[i].powerFactor);
      if (pDiff < 0.25f && pfDiff < 0.20f) {
        // Matched existing appliance profile
        gProfiles[i].sessionCount++;
        gProfiles[i].startupPeakPower = (gProfiles[i].startupPeakPower + peakPower) * 0.5f;
        gProfiles[i].startupPeakCurrent = (gProfiles[i].startupPeakCurrent + peakCurrent) * 0.5f;
        gProfiles[i].startupDurationS = (gProfiles[i].startupDurationS + startupDur) * 0.5f;
        return i;
      }
    }
  }

  // Not matched: find an empty slot
  int freeSlot = -1;
  for (int i = 0; i < MAX_APPLIANCE_PROFILES; i++) {
    if (!gProfiles[i].valid) {
      freeSlot = i;
      break;
    }
  }
  if (freeSlot == -1) freeSlot = 0;

  ApplianceProfile& p = gProfiles[freeSlot];
  snprintf(p.id, sizeof(p.id), "app_%d", freeSlot + 1);
  snprintf(p.name, sizeof(p.name), "Load Profile #%d (%.0fW)", freeSlot + 1, steadyPower);
  p.nominalPower = steadyPower;
  p.nominalCurrent = steadyCurrent;
  p.powerFactor = pf;
  p.startupPeakPower = peakPower;
  p.startupPeakCurrent = peakCurrent;
  p.startupDurationS = startupDur;
  p.powerStdDev = 3.0f;
  p.baselinePower = steadyPower;
  p.degradationPct = 0.0f;
  p.sessionCount = 1;
  p.sampleCount = 1;
  p.m2 = 0.0f;
  p.degradationAlert = false;
  p.valid = true;

  saveProfiles();
  return freeSlot;
}

void updatePredictiveProtection(float voltage, float current, float power, float pf) {
  if (power <= gPredConfig.minLoadStandbyW) {
    if (gAppState == APP_STEADY) {
      saveProfiles();
    }
    gAppState = APP_STANDBY;
    gActiveProfileIdx = -1;
    strncpy(gActiveApplianceName, "Standby (No Load)", sizeof(gActiveApplianceName) - 1);
    gDynamicThreshold = gPredConfig.hardSafetyLimit;
    gRiskLevel = 0.0f;
    gDegradationPct = 0.0f;
    gDegradationAlert = false;
    gLearnedNormalPower = 0.0f;
    gLearnedSigma = 0.0f;
    return;
  }

  // Load is active (> minLoadStandbyW)
  if (gAppState == APP_STANDBY) {
    gAppState = APP_STARTUP;
    gStartupStartMs = millis();
    gCurrentStartupPeakPower = power;
    gCurrentStartupPeakCurrent = current;
    strncpy(gActiveApplianceName, "Detecting Inrush...", sizeof(gActiveApplianceName) - 1);
    gDynamicThreshold = gPredConfig.hardSafetyLimit;
    gRiskLevel = 25.0f;
    return;
  }

  if (gAppState == APP_STARTUP) {
    if (power > gCurrentStartupPeakPower) gCurrentStartupPeakPower = power;
    if (current > gCurrentStartupPeakCurrent) gCurrentStartupPeakCurrent = current;
    // Allow ~2 seconds for inrush to settle
    if (millis() - gStartupStartMs >= 2000) {
      gCurrentStartupDurationS = (millis() - gStartupStartMs) / 1000.0f;
      gAppState = APP_STEADY;
      gActiveProfileIdx = matchOrCreateProfile(power, current, pf, gCurrentStartupPeakPower, gCurrentStartupPeakCurrent, gCurrentStartupDurationS);
    } else {
      return;
    }
  }

  if (gAppState == APP_STEADY && gActiveProfileIdx >= 0) {
    ApplianceProfile& prof = gProfiles[gActiveProfileIdx];
    // Welford online update for mean and variance
    prof.sampleCount++;
    float delta = power - prof.nominalPower;
    prof.nominalPower += delta / (float)prof.sampleCount;
    float delta2 = power - prof.nominalPower;
    prof.m2 += delta * delta2;
    prof.powerStdDev = (prof.sampleCount > 1) ? sqrt(prof.m2 / (float)(prof.sampleCount - 1)) : 2.5f;
    prof.nominalCurrent = (prof.nominalCurrent * (prof.sampleCount - 1) + current) / (float)prof.sampleCount;
    prof.powerFactor = (prof.powerFactor * (prof.sampleCount - 1) + pf) / (float)prof.sampleCount;

    // Dynamic Threshold formula:
    // T = P_normal + k*sigma + M
    float dynT = prof.nominalPower + (gPredConfig.kSensitivity * prof.powerStdDev) + gPredConfig.safetyMarginM;
    // Constrained by hard safety limit
    gDynamicThreshold = std::min(dynT, gPredConfig.hardSafetyLimit);

    // Degradation detection across sessions
    if (prof.baselinePower > 0.0f) {
      prof.degradationPct = ((prof.nominalPower - prof.baselinePower) / prof.baselinePower) * 100.0f;
      if (prof.sessionCount >= 2 && prof.degradationPct >= gPredConfig.degradationThreshPct) {
        prof.degradationAlert = true;
      }
    }
    gDegradationPct = prof.degradationPct;
    gDegradationAlert = prof.degradationAlert;
    gLearnedNormalPower = prof.nominalPower;
    gLearnedSigma = prof.powerStdDev;
    strncpy(gActiveApplianceName, prof.name, sizeof(gActiveApplianceName) - 1);

    // Risk level calculation (0 to 100%)
    if (power <= prof.nominalPower) {
      gRiskLevel = (power / std::max(1.0f, gDynamicThreshold)) * 50.0f;
    } else {
      float excess = power - prof.nominalPower;
      float headroom = std::max(1.0f, gDynamicThreshold - prof.nominalPower);
      gRiskLevel = 50.0f + (excess / headroom) * 50.0f;
    }
    if (prof.degradationAlert) {
      gRiskLevel = std::min(100.0f, gRiskLevel + 12.0f);
    }
    gRiskLevel = std::max(0.0f, std::min(100.0f, gRiskLevel));
  }
}

// ---------- SETUP ----------
void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  setRelay(true); // start closed/ON

  prefs.begin("smartadapter", false);
  powerThreshold = prefs.getFloat("threshold", 1500.0);
  initPredictiveProtection();

  connectWiFi();

  String mac = WiFi.macAddress();
  mac.replace(":", "");
  String shortMac = mac.substring(mac.length() - 6);
  DEVICE_ID = "socket-" + shortMac;
  DEVICE_NAME = "Smart Socket " + shortMac;
  MDNS_HOSTNAME = "smartsocket-" + shortMac;

  if (MDNS.begin(MDNS_HOSTNAME.c_str())) {
    Serial.printf("mDNS ready: http://%s.local\n", MDNS_HOSTNAME.c_str());
  }

  setupRoutes();
  server.begin();
  Serial.println("Web server started.");

  WiFi.setAutoReconnect(true);
  if (cloudConfigured()) {
    xTaskCreatePinnedToCore(cloudTask, "cloudTask", CLOUD_TASK_STACK, nullptr,
                            1, &gCloudTaskHandle, 0 /*core 0*/);
    Serial.println("[cloud] task started");
    xTaskCreatePinnedToCore(commandPollTask, "cmdPollTask", CLOUD_TASK_STACK, nullptr,
                            1, nullptr, 0 /*core 0*/);
    Serial.println("[cmd] command poll task started");
  } else {
    Serial.println("[cloud] disabled: placeholder URL/key in secrets.h");
  }
}

// ---------- MAIN LOOP ----------
void loop() {
  server.handleClient();

  if (millis() - lastReadTime > READ_INTERVAL) {
    lastReadTime = millis();
    readSensorAndCheckBreaker();
    
    publishSnapshot();
    if (tripped != gLastTrippedSeen) {
      gLastTrippedSeen = tripped;
      if (gCloudTaskHandle) xTaskNotifyGive(gCloudTaskHandle);
    }
  }

  superviseWifi();
}

// ---------- WIFI ----------
void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected: " + WiFi.localIP().toString());
}

// ---------- CORS HELPER ----------
// Allows a dashboard hosted on a different origin (e.g. localhost:3000,
// or a separate web server) to call this device's API from the browser.
void addCORSHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void handleOptions() {
  addCORSHeaders();
  server.send(204);
}

// ---------- ROUTES ----------
void setupRoutes() {
  server.on("/api/reading", HTTP_GET, handleGetReading);
  server.on("/api/reading", HTTP_OPTIONS, handleOptions);

  server.on("/api/threshold", HTTP_GET, handleGetThreshold);
  server.on("/api/threshold", HTTP_POST, handleSetThreshold);
  server.on("/api/threshold", HTTP_OPTIONS, handleOptions);

  server.on("/api/control", HTTP_POST, handleControl);
  server.on("/api/control", HTTP_OPTIONS, handleOptions);

  server.on("/api/info", HTTP_GET, handleGetInfo);
  server.on("/api/info", HTTP_OPTIONS, handleOptions);

  server.on("/api/predictive", HTTP_GET, handleGetPredictive);
  server.on("/api/predictive", HTTP_OPTIONS, handleOptions);

  server.on("/api/predictive/config", HTTP_POST, handleSetPredictiveConfig);
  server.on("/api/predictive/config", HTTP_OPTIONS, handleOptions);

  server.on("/api/predictive/reset-profiles", HTTP_POST, handleResetProfiles);
  server.on("/api/predictive/reset-profiles", HTTP_OPTIONS, handleOptions);

  server.on("/", HTTP_GET, handleRoot);
}

// GET /api/reading -> live sensor data + breaker status + predictive fields
void handleGetReading() {
  addCORSHeaders();
  StaticJsonDocument<512> doc;
  doc["device_id"]   = DEVICE_ID;
  doc["device_name"] = DEVICE_NAME;
  doc["voltage"]      = lastVoltage;
  doc["current"]      = lastCurrent;
  doc["power"]        = lastPower;
  doc["energy"]       = lastEnergy;
  doc["frequency"]    = lastFreq;
  doc["power_factor"] = lastPF;
  doc["threshold"]    = powerThreshold;
  doc["tripped"]      = tripped;
  doc["relay_on"]     = !tripped && !manuallyOff;

  // Adaptive predictive fields
  doc["active_appliance"]   = gActiveApplianceName;
  doc["dynamic_threshold"]  = gDynamicThreshold;
  doc["risk_level"]         = gRiskLevel;
  doc["degradation_pct"]    = gDegradationPct;
  doc["degradation_alert"]  = gDegradationAlert;
  doc["inrush_power"]       = gCurrentStartupPeakPower;
  doc["inrush_current"]     = gCurrentStartupPeakCurrent;
  doc["startup_duration_s"] = gCurrentStartupDurationS;
  doc["p_normal"]           = gLearnedNormalPower;
  doc["sigma"]              = gLearnedSigma;

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// GET /api/threshold -> current threshold value
void handleGetThreshold() {
  addCORSHeaders();
  StaticJsonDocument<64> doc;
  doc["threshold"] = powerThreshold;
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// POST /api/threshold  body: {"threshold": 1500}
void handleSetThreshold() {
  addCORSHeaders();
  if (server.hasArg("plain")) {
    StaticJsonDocument<64> doc;
    DeserializationError err = deserializeJson(doc, server.arg("plain"));
    if (!err && doc.containsKey("threshold")) {
      powerThreshold = doc["threshold"];
      prefs.putFloat("threshold", powerThreshold); // persists across reboots
      server.send(200, "application/json", "{\"status\":\"ok\",\"threshold\":" + String(powerThreshold) + "}");
      return;
    }
  }
  server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"invalid body, expected {threshold: number}\"}");
}

// POST /api/control  body: {"command": "ON" | "OFF" | "RESET"}
void handleControl() {
  addCORSHeaders();
  if (server.hasArg("plain")) {
    StaticJsonDocument<64> doc;
    DeserializationError err = deserializeJson(doc, server.arg("plain"));
    if (!err && doc.containsKey("command")) {
      String cmd = doc["command"].as<String>();

      if (cmd == "ON") {
        manuallyOff = false;
        tripped = false;
        overloadCounter = 0;
        setRelay(true);
      } else if (cmd == "OFF") {
        manuallyOff = true;
        setRelay(false);
      } else if (cmd == "RESET") {
        tripped = false;
        manuallyOff = false;
        overloadCounter = 0;
        setRelay(true);
      } else {
        server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"unknown command\"}");
        return;
      }
      server.send(200, "application/json", "{\"status\":\"ok\"}");
      return;
    }
  }
  server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"invalid body, expected {command: string}\"}");
}

// GET /api/info -> device identity (for dashboard device discovery/labeling)
void handleGetInfo() {
  addCORSHeaders();
  StaticJsonDocument<200> doc;
  doc["device_id"]   = DEVICE_ID;
  doc["device_name"] = DEVICE_NAME;
  doc["ip"]           = WiFi.localIP().toString();
  doc["mdns"]         = MDNS_HOSTNAME + ".local";
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// GET /api/predictive -> full predictive protection diagnostic and profiles
void handleGetPredictive() {
  addCORSHeaders();
  StaticJsonDocument<1536> doc;
  doc["active_appliance"]          = gActiveApplianceName;
  doc["state"]                     = (gAppState == APP_STANDBY) ? "STANDBY" : (gAppState == APP_STARTUP) ? "STARTUP" : "STEADY";
  doc["adaptive_enabled"]          = gPredConfig.adaptiveEnabled;
  doc["dynamic_threshold"]         = gDynamicThreshold;
  doc["hard_safety_limit"]         = gPredConfig.hardSafetyLimit;
  doc["k_sensitivity"]             = gPredConfig.kSensitivity;
  doc["safety_margin_m"]           = gPredConfig.safetyMarginM;
  doc["degradation_threshold_pct"] = gPredConfig.degradationThreshPct;
  doc["p_normal"]                  = gLearnedNormalPower;
  doc["sigma"]                     = gLearnedSigma;
  doc["risk_level"]                = gRiskLevel;
  doc["degradation_pct"]           = gDegradationPct;
  doc["degradation_alert"]         = gDegradationAlert;
  doc["startup_peak_power"]        = gCurrentStartupPeakPower;
  doc["startup_peak_current"]      = gCurrentStartupPeakCurrent;
  doc["startup_duration_s"]        = gCurrentStartupDurationS;

  JsonArray profArray = doc.createNestedArray("profiles");
  for (int i = 0; i < MAX_APPLIANCE_PROFILES; i++) {
    if (gProfiles[i].valid) {
      JsonObject obj = profArray.createNestedObject();
      obj["id"]                   = gProfiles[i].id;
      obj["name"]                 = gProfiles[i].name;
      obj["nominal_power"]        = gProfiles[i].nominalPower;
      obj["nominal_current"]      = gProfiles[i].nominalCurrent;
      obj["power_factor"]         = gProfiles[i].powerFactor;
      obj["startup_peak_power"]   = gProfiles[i].startupPeakPower;
      obj["startup_peak_current"] = gProfiles[i].startupPeakCurrent;
      obj["startup_duration_s"]   = gProfiles[i].startupDurationS;
      obj["sigma"]                = gProfiles[i].powerStdDev;
      obj["baseline_power"]       = gProfiles[i].baselinePower;
      obj["degradation_pct"]      = gProfiles[i].degradationPct;
      obj["session_count"]        = gProfiles[i].sessionCount;
      obj["degradation_alert"]    = gProfiles[i].degradationAlert;
    }
  }

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// POST /api/predictive/config -> update adaptive thresholds and parameters
void handleSetPredictiveConfig() {
  addCORSHeaders();
  if (server.hasArg("plain")) {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, server.arg("plain"));
    if (!err) {
      if (doc.containsKey("k_factor")) gPredConfig.kSensitivity = doc["k_factor"];
      if (doc.containsKey("margin_m")) gPredConfig.safetyMarginM = doc["margin_m"];
      if (doc.containsKey("hard_limit")) gPredConfig.hardSafetyLimit = doc["hard_limit"];
      if (doc.containsKey("degradation_threshold")) gPredConfig.degradationThreshPct = doc["degradation_threshold"];
      if (doc.containsKey("adaptive_enabled")) gPredConfig.adaptiveEnabled = doc["adaptive_enabled"];
      savePredictiveConfig();
      server.send(200, "application/json", "{\"status\":\"ok\"}");
      return;
    }
  }
  server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"invalid json body\"}");
}

// POST /api/predictive/reset-profiles -> wipe learned appliance fingerprints
void handleResetProfiles() {
  addCORSHeaders();
  resetProfiles();
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"learned profiles reset\"}");
}

// GET / -> minimal built-in test page (handy while building the real frontend)
void handleRoot() {
  addCORSHeaders();
  String html = "<html><body style='font-family:sans-serif'>";
  html += "<h2>" + String(DEVICE_NAME) + " (" + String(DEVICE_ID) + ")</h2>";
  html += "<p>API endpoints:</p><ul>";
  html += "<li>GET /api/reading</li>";
  html += "<li>GET /api/threshold, POST /api/threshold</li>";
  html += "<li>POST /api/control</li>";
  html += "<li>GET /api/predictive, POST /api/predictive/config</li>";
  html += "<li>GET /api/info</li></ul>";
  html += "</body></html>";
  server.send(200, "text/html", html);
}

// ---------- RELAY CONTROL ----------
void setRelay(bool on) {
  // Adjust HIGH/LOW depending on your relay module's trigger logic (most are active LOW)
  digitalWrite(RELAY_PIN, on ? LOW : HIGH);
}

// ---------- READ SENSOR + BREAKER LOGIC ----------
void readSensorAndCheckBreaker() {
  float voltage = pzem.voltage();
  float current = pzem.current();
  float power    = pzem.power();
  float energy   = pzem.energy();
  float freq     = pzem.frequency();
  float pf       = pzem.pf();

  if (isnan(voltage)) {
    Serial.println("Error reading PZEM data");
    return;
  }

  lastVoltage = voltage;
  lastCurrent = current;
  lastPower   = power;
  lastEnergy  = energy;
  lastFreq    = freq;
  lastPF      = pf;

  if (manuallyOff || tripped) return; // don't re-evaluate trip logic if already off

  // Run the Adaptive Predictive Load Protection state machine
  updatePredictiveProtection(voltage, current, power, pf);

  // Dynamic Threshold constrained by hard safety limit:
  // T_effective = min(T_dynamic, P_hard_limit)
  float effectiveThreshold = powerThreshold;
  if (gPredConfig.adaptiveEnabled && gAppState == APP_STEADY && gDynamicThreshold > 0.0f) {
    effectiveThreshold = std::min(gDynamicThreshold, gPredConfig.hardSafetyLimit);
  } else if (gPredConfig.hardSafetyLimit > 0.0f) {
    effectiveThreshold = std::min(powerThreshold, gPredConfig.hardSafetyLimit);
  }

  if (power > effectiveThreshold) {
    overloadCounter++;
  } else {
    overloadCounter = 0;
  }

  // Predictive trip: trip if load breaches threshold for TRIP_DELAY_SAMPLES, or risk hits 100%
  if (overloadCounter >= TRIP_DELAY_SAMPLES || gRiskLevel >= 100.0f) {
    tripped = true;
    setRelay(false);
    Serial.printf("!!! ADAPTIVE PREDICTIVE TRIP !!! Load=%.1fW, Threshold=%.1fW, Risk=%.1f%%\n",
                  power, effectiveThreshold, gRiskLevel);
  }
}
