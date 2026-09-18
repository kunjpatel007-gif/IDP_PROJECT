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

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <PZEM004Tv30.h>

// ---------- USER CONFIG (unique per device) ----------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* DEVICE_ID     = "socket1";           // must be unique per device
const char* DEVICE_NAME   = "Living Room Socket"; // friendly name shown on dashboard
const char* MDNS_HOSTNAME = "smartsocket1";       // reachable at http://smartsocket1.local

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
}

// ---------- MAIN LOOP ----------
void loop() {
  server.handleClient();

  if (millis() - lastReadTime > READ_INTERVAL) {
    lastReadTime = millis();
    readSensorAndCheckBreaker();
  }
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
