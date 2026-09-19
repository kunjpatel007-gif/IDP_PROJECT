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

const char* DEVICE_ID     = "socket1";           // must be unique per device
const char* DEVICE_NAME   = "Living Room Socket"; // friendly name shown on dashboard
const char* MDNS_HOSTNAME = "smartsocket1";       // reachable at http://smartsocket1.local

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

struct TelemetrySnapshot {
  float voltage, current, power, energy, frequency, powerFactor, threshold;
  bool tripped;
  bool relayOn;
  bool valid;
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
  gSnapshot.valid = true;
  portEXIT_CRITICAL(&gSnapshotMux);
}

void setNumOrNull(StaticJsonDocument<300>& doc, const char* key, float value) {
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
    
    StaticJsonDocument<300> doc;
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

// ---------- SETUP ----------
void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  setRelay(true); // start closed/ON

  prefs.begin("smartadapter", false);
  powerThreshold = prefs.getFloat("threshold", 1500.0);

  connectWiFi();

  if (MDNS.begin(MDNS_HOSTNAME)) {
    Serial.printf("mDNS ready: http://%s.local\n", MDNS_HOSTNAME);
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

  server.on("/", HTTP_GET, handleRoot);
}

// GET /api/reading -> live sensor data + breaker status
void handleGetReading() {
  addCORSHeaders();
  StaticJsonDocument<300> doc;
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
  doc["mdns"]         = String(MDNS_HOSTNAME) + ".local";
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
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

  if (power > powerThreshold) {
    overloadCounter++;
  } else {
    overloadCounter = 0;
  }

  if (overloadCounter >= TRIP_DELAY_SAMPLES) {
    tripped = true;
    setRelay(false);
    Serial.println("!!! THRESHOLD EXCEEDED - RELAY TRIPPED !!!");
  }
}
