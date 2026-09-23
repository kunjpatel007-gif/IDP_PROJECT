/**
 * SmartAdapter IDP — M5StickC Plus 2 Demo Firmware
 *
 * What it does:
 *   1. Connects to WiFi on boot.
 *   2. Every 2 seconds reads the built-in MPU6886 IMU (accel + gyro)
 *      and AXP192 battery gauge.
 *   3. POSTs a JSON payload to the Google Cloud Function, which writes
 *      it into the Firebase Realtime Database → frontend updates live.
 *   4. Shows connection status + live data on the built-in LCD.
 *
 * PlatformIO board: m5stick-c  (m5stack/M5StickCPlus2 lib)
 * Requires: include/secrets.h  (copy from secrets.example.h)
 */

#include <M5Unified.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "secrets.h"

// ── Config ────────────────────────────────────────────────────────────────
static const char* DEVICE_NAME = "StickC Demo";
static const char* FW_VERSION  = "1.0.0-m5uni";
static const uint32_t PUSH_INTERVAL_MS = 2000;

// ── State ─────────────────────────────────────────────────────────────────
static String   g_deviceId;
static uint32_t g_seq       = 0;
static int      g_cloudCode = 0;
static int      g_lastRssi  = 0;
static float    g_accelX    = 0, g_accelY = 0, g_accelZ = 0;
static float    g_gyroX     = 0, g_gyroY  = 0, g_gyroZ  = 0;
static float    g_batV      = 0;
static int      g_batPct    = 0;
static uint32_t g_uptimeS   = 0;

// ── Helpers ───────────────────────────────────────────────────────────────

/** Derive a stable device ID from the MAC address. */
String macToDeviceId() {
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char buf[20];
  snprintf(buf, sizeof(buf), "stickc_%02X%02X%02X", mac[3], mac[4], mac[5]);
  return String(buf);
}

void drawScreen() {
  M5.Display.fillScreen(BLACK);
  M5.Display.setTextSize(1);
  M5.Display.setCursor(2, 2);

  // Header
  M5.Display.setTextColor(ORANGE);
  M5.Display.println("SmartAdapter Demo");
  M5.Display.setTextColor(WHITE);
  M5.Display.println(g_deviceId);

  // Cloud status
  M5.Display.println("");
  M5.Display.setTextColor(g_cloudCode == 200 ? GREEN : RED);
  M5.Display.printf("Cloud: %s (%d)\n", g_cloudCode == 200 ? "OK" : "ERR", g_cloudCode);

  // WiFi RSSI
  M5.Display.setTextColor(WHITE);
  M5.Display.printf("WiFi:  %d dBm\n", g_lastRssi);
  M5.Display.printf("Bat:   %d%%  %.2fV\n", g_batPct, g_batV);
  M5.Display.printf("Seq:   %lu\n", (unsigned long)g_seq);

  // IMU
  M5.Display.println("");
  M5.Display.setTextColor(CYAN);
  M5.Display.println("Accel (g):");
  M5.Display.setTextColor(WHITE);
  M5.Display.printf(" X: %+.3f\n", g_accelX);
  M5.Display.printf(" Y: %+.3f\n", g_accelY);
  M5.Display.printf(" Z: %+.3f\n", g_accelZ);
}

#include <WiFiClientSecure.h>

int pushToCloud() {
  if (WiFi.status() != WL_CONNECTED) return -99;

  WiFiClientSecure client;
  // For a quick demo we bypass CA cert validation. 
  // In production we would use client.setCACert(GOOGLE_ROOT_CAS);
  client.setInsecure();

  HTTPClient http;
  http.begin(client, CLOUD_INGEST_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_SHARED_SECRET);
  http.setTimeout(5000);

  // Build JSON payload
  JsonDocument doc;
  doc["device_id"]   = g_deviceId;
  doc["device_name"] = DEVICE_NAME;
  doc["fw_version"]  = FW_VERSION;
  doc["seq"]         = (int)g_seq;
  doc["rssi"]        = g_lastRssi;
  doc["free_heap"]   = (int)ESP.getFreeHeap();
  doc["uptime_s"]    = (int)g_uptimeS;
  doc["accel_x"]     = round(g_accelX * 1000.0f) / 1000.0f;
  doc["accel_y"]     = round(g_accelY * 1000.0f) / 1000.0f;
  doc["accel_z"]     = round(g_accelZ * 1000.0f) / 1000.0f;
  doc["gyro_x"]      = round(g_gyroX * 10.0f) / 10.0f;
  doc["gyro_y"]      = round(g_gyroY * 10.0f) / 10.0f;
  doc["gyro_z"]      = round(g_gyroZ * 10.0f) / 10.0f;
  doc["battery_v"]   = round(g_batV * 100.0f) / 100.0f;
  doc["battery_pct"] = g_batPct;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  http.end();

  return code;
}

// ── Setup ─────────────────────────────────────────────────────────────────
void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(3);
  M5.Display.fillScreen(BLACK);
  M5.Display.setTextColor(ORANGE);
  M5.Display.setCursor(2, 2);
  M5.Display.println("Booting...");

  // Use 'socket1' so it matches the cloud allowed list and the frontend .env
  g_deviceId = "socket1";

  // Connect WiFi
  M5.Display.println("WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 15000) {
    delay(300);
    M5.Display.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    M5.Display.setTextColor(GREEN);
    M5.Display.println("\nWiFi OK");
  } else {
    M5.Display.setTextColor(RED);
    M5.Display.println("\nWiFi FAIL");
  }

  delay(800);
}

// ── Loop ──────────────────────────────────────────────────────────────────
void loop() {
  static uint32_t lastPush = 0;
  M5.update();

  uint32_t now = millis();

  if (now - lastPush >= PUSH_INTERVAL_MS) {
    lastPush = now;
    g_seq++;
    g_uptimeS = now / 1000;
    g_lastRssi = WiFi.RSSI();

    // Read IMU via M5Unified API
    auto imu = M5.Imu.getImuData();
    g_accelX = imu.accel.x;
    g_accelY = imu.accel.y;
    g_accelZ = imu.accel.z;
    g_gyroX = imu.gyro.x;
    g_gyroY = imu.gyro.y;
    g_gyroZ = imu.gyro.z;

    // Read battery via M5Unified API (returns mV)
    g_batV   = M5.Power.getBatteryVoltage() / 1000.0f;
    g_batPct = M5.Power.getBatteryLevel();

    // Push to cloud
    g_cloudCode = pushToCloud();

    // Update screen
    drawScreen();
  }
}

