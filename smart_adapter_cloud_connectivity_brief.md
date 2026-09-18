# SmartAdapter — Cloud Connectivity Phase: Project Brief for Agent

> Scope note for whoever picks this up: this document exists to onboard you to the SmartAdapter project and hand you **one specific, bounded task** — get the existing ESP32 hardware talking to a cloud backend on Google Cloud, such that a human looking at the GCP Console can confirm (a) the device is online and (b) it is receiving live telemetry from the device. **No frontend/dashboard/mobile app work is in scope here.** That comes later, separately.

---

## 1. Project Summary

SmartAdapter is a retrofit IoT smart plug: it sits between a wall socket and an appliance, measures voltage/current/power/energy/frequency/power factor in real time via a PZEM-004T-100A sensor, and can automatically trip a relay (cut power) if consumption exceeds a user-set threshold. An ESP32 does the sensing, threshold logic, and relay control. The stated design goal (repeated across both review decks) is that **breaker/trip logic must run entirely locally on the ESP32** — it must keep protecting the appliance even if WiFi, the cloud, or any app is unreachable. Cloud/app connectivity is for monitoring and remote control convenience, not for safety-critical logic. Keep that invariant intact in everything you build.

Team split: hardware + firmware baseline (sensor wiring, relay, local REST API) is done by a teammate. **Ray owns the software/cloud side.**

---

## 2. What Actually Exists Right Now (verified from the firmware source, not the slides)

The current firmware (`smart_adapter_dashboard_api.ino`) runs a **local-only REST API** on the ESP32 — it does **not** talk to any cloud service today. Concretely:

- `WebServer` on port 80, reachable at the device's LAN IP or via mDNS (`http://smartsocket1.local` — hostname configurable per device via `MDNS_HOSTNAME`).
- Endpoints:
  - `GET /api/reading` → `{device_id, device_name, voltage, current, power, energy, frequency, power_factor, threshold, tripped, relay_on}`
  - `GET /api/threshold`, `POST /api/threshold` (body `{"threshold": <number>}`, persisted via `Preferences` under namespace `smartadapter`)
  - `POST /api/control` (body `{"command": "ON"|"OFF"|"RESET"}`)
  - `GET /api/info` → device_id, device_name, ip, mdns
  - `GET /` → a minimal built-in HTML test page listing the endpoints
- CORS is wide open (`Access-Control-Allow-Origin: *`) on every route — fine for a LAN dashboard prototype, **not** something to copy as-is for a public cloud endpoint.
- Sensor is read every 1000 ms (`READ_INTERVAL`) via `readSensorAndCheckBreaker()`, which also runs the trip logic: 3 consecutive over-threshold samples (`TRIP_DELAY_SAMPLES`) → `tripped = true` → relay opens. This runs independent of the web server and would run independent of any cloud call too.
- Multi-device design intent: each physical unit runs the same sketch with a unique `DEVICE_ID` / `DEVICE_NAME` / `MDNS_HOSTNAME`. The comment in the file says "your dashboard keeps a list of device IP addresses... no central server needed for a basic version" — i.e. the *original* plan was a dashboard polling multiple LAN IPs directly, not a cloud aggregation layer.
- Relay is active-LOW (`setRelay()` writes `LOW` to turn ON), wired Normally Open per the hardware slides (fail-safe: loses power → stays open/off).
- Pins: `RELAY_PIN = 4`, PZEM on `Serial2` via `PZEM_RX_PIN = 16`, `PZEM_TX_PIN = 17`.

**This local REST API is the foundation you build on. Don't replace it — add a second, outbound path from the ESP32 to the cloud alongside it.**

---

## 3. Gaps & Inconsistencies Found Across the Three Source Documents

Going through the hardware review deck, the software/IDP deck, and the actual firmware together surfaces several mismatches worth knowing about before you touch anything:

1. **MQTT is documented everywhere, implemented nowhere.** Both decks' architecture diagrams and bullet lists (e.g. "ESP32 sends live data to the MQTT broker," "MQTT publish/subscribe chosen over HTTP polling," "MQTT broker: HiveMQ / Mosquitto") describe the *intended* connectivity path as MQTT. The actual `.ino` file has no MQTT client library, no broker credentials, nothing — it's a plain HTTP REST server. Whatever you build for cloud connectivity is genuinely new work, not "wiring up something that's mostly there."
2. **No cloud/internet connectivity exists at all yet**, MQTT-based or otherwise. There's no outbound client code (no `PubSubClient`, no `HTTPClient`, no Firebase SDK). The device only *listens* on the LAN; it never *calls out*. This matters because a device behind home/campus WiFi + NAT can't be reached from the internet — the ESP32 has to be the one initiating the connection to the cloud, not the other way around.
3. **"Status Indicators: LEDs show the appliance and breaker status"** is a stated hardware design bullet, but there's no LED pin defined or LED logic anywhere in the firmware pin config or code. Not this phase's problem, but flag it — someone will need to add it.
4. **Simulation Plan mentions "reset-button debounce logic to be validated,"** implying a physical reset button, but the firmware has no reset-button GPIO input — `RESET` is only reachable via the `/api/control` REST call. Either the physical button was never wired into this version of the firmware, or the "reset button" in the simulation plan refers to something not reflected in this code. Worth Ray confirming with the hardware teammate at some point — not blocking for this phase.
5. **No cloud-side "online" concept exists**, and it can't be a value the device pushes (a dead/unplugged/unpowered device can't tell you it's dead). "Online" has to be *derived* on the receiving side from freshness of the last message received — see the architecture section below.
6. **`connectWiFi()` is blocking and only runs once, in `setup()`.** If WiFi drops mid-operation there's no reconnect logic in `loop()`. This wasn't a problem when the device only served a local API (a client just gets no response), but it will matter once the ESP32 is responsible for actively pushing data out — a silent, permanent WiFi drop should not be allowed to permanently kill cloud pushes without at least attempting to reconnect.
7. **Google Cloud IoT Core — the "obvious" native GCP service for this — was fully shut down on August 16, 2023.** (Confirmed via current sources; Google retired the device-manager APIs and MQTT/HTTP device bridges entirely and pointed customers to third-party IoT partners instead.) Any tutorial or your own training data describing "connect ESP32 to Google Cloud IoT Core" is dead. This is why the architecture below uses a plain HTTP endpoint + Firestore instead of a managed IoT/MQTT bridge from Google.
8. **Literature survey's own self-identified gaps** (from the hardware deck, not something to fix — just context): no reviewed prior work quantifies end-to-end trip latency, and "dashboard usability and end-user feedback design is largely unaddressed in existing student projects." The second one is relevant to Ray specifically since dashboard/UX will eventually be Ray's problem too — just not in this phase.

---

## 4. This Phase's Scope (explicit)

**Build:** a minimal path from the ESP32 to Google Cloud such that:
- The device periodically sends its live reading to a cloud endpoint.
- A human can open the Google Cloud Console and see, per device, that it's currently online (recently heard from) and see its latest telemetry values.

**Do not build in this phase:** any dashboard UI, mobile app, MQTT broker, multi-device management UI, alerting/notifications, or anything beyond "prove the pipe works and the data lands somewhere visible in the console."

---

## 5. Recommended Architecture

```
ESP32 (existing local REST API, unchanged)
   │
   └── NEW: periodic outbound HTTPS POST, every ~10s
              │
              ▼
   Cloud Function (HTTP trigger) — "ingest"
              │  validates a shared-secret header
              │  upserts one Firestore document per device
              ▼
   Firestore (Native mode) — collection "devices", doc ID = device_id
              │  fields: latest reading + last_seen (server timestamp)
              ▼
   Viewed directly in the Firestore console — "online" = last_seen is recent
```

**Why this, and not MQTT/Pub-Sub:** the decks call for an MQTT broker (HiveMQ/Mosquitto), but that's either a third-party managed broker or something you'd have to self-host — it isn't "a Google Cloud Console thing" and doesn't map onto a native GCP service anymore now that IoT Core (the thing that used to bridge MQTT into GCP) is gone. Cloud Pub/Sub *can* be made to accept device messages, but without IoT Core you'd need to build your own ingestion gateway in front of it anyway — which is extra moving parts for zero benefit at this stage. A plain authenticated HTTPS POST to a Cloud Function is the shortest path to "prove connectivity," is entirely clickable from the GCP Console, and doesn't require running or paying for a broker. It's also strictly additive — swapping in MQTT/Pub-Sub later doesn't require touching the Firestore data model, only what sits in front of it.

**Why "online" is derived, not pushed:** the device can only tell you "I'm alive" while it's alive. There's no reliable way for it to announce "I just went offline" (power loss, WiFi drop, crash — none of those let it send a final message). So online/offline is inferred from `last_seen` freshness: if the timestamp is advancing roughly every push interval, it's online; if it stops advancing, it's gone dark. For this phase, "checking" that just means looking at the Firestore console and watching the timestamp move (or stop moving when you unplug the device). Automatic stale-detection (a scheduled function that flips a `status: offline` flag) is a nice follow-up, not required now.

---

## 6. Data Contract

Reuse the exact field names already used by `/api/reading` so there's one consistent schema across the local API and the cloud payload:

```json
{
  "device_id": "socket1",
  "device_name": "Living Room Socket",
  "voltage": 230.1,
  "current": 1.42,
  "power": 326.7,
  "energy": 4.213,
  "frequency": 50.0,
  "power_factor": 0.98,
  "threshold": 1500.0,
  "tripped": false,
  "relay_on": true
}
```

Firestore stores this under `devices/{device_id}`, merged with a server-set `last_seen` timestamp on every write (`firestore.SERVER_TIMESTAMP` in Python, or `FieldValue.serverTimestamp()` in Node) — use the **server's** clock for this, not a timestamp generated on the ESP32, since the ESP32 has no RTC/NTP sync in the current firmware and its clock isn't trustworthy.

---

## 7. Task Breakdown

### GCP Console setup
1. Create or select the GCP project to use for this.
2. Enable the **Cloud Functions API** (or Cloud Run, if preferred — functionally interchangeable here; Cloud Functions is the more point-and-click path from the console) and the **Firestore API**.
3. Create a **Firestore database in Native mode**, pick a region.
4. Pick a shared-secret string for device authentication (simplest viable option for MVP — see security note below) and store it as an environment variable on the function.
5. Deploy an HTTP-triggered function named something like `ingest` (skeleton below).
6. Test it with `curl` or the Console's built-in test panel **before** touching the firmware, so you know the backend works in isolation.

Skeleton (Python, Cloud Functions 2nd gen):

```python
import os
import functions_framework
from flask import jsonify
from google.cloud import firestore

db = firestore.Client()
DEVICE_SHARED_SECRET = os.environ.get("DEVICE_SHARED_SECRET", "changeme")

@functions_framework.http
def ingest(request):
    if request.method != "POST":
        return ("Method not allowed", 405)

    if request.headers.get("X-Device-Key") != DEVICE_SHARED_SECRET:
        return ("Unauthorized", 401)

    data = request.get_json(silent=True)
    if not data or "device_id" not in data:
        return ("Bad request: missing device_id", 400)

    device_id = data["device_id"]
    db.collection("devices").document(device_id).set(
        {**data, "last_seen": firestore.SERVER_TIMESTAMP},
        merge=True,
    )
    return (jsonify({"status": "ok"}), 200)
```

Note: the function's runtime service account needs Firestore write access (the default Compute/App Engine service account usually has this already in a fresh project; otherwise grant it the **Cloud Datastore User** role in IAM).

### Firmware changes (`smart_adapter_dashboard_api.ino`)
7. Add `#include <HTTPClient.h>` and `#include <WiFiClientSecure.h>`.
8. Add two new `USER CONFIG` constants: the deployed function's URL, and the shared-secret string (must match the function's env var exactly).
9. Add a second, independent timer — don't reuse `READ_INTERVAL` (1s is fine for local sensing, too chatty for a cloud push). Something like a 10s `CLOUD_PUSH_INTERVAL`.
10. Add a `pushToCloud()` function that builds the same JSON shape as `/api/reading` and POSTs it, guarded so it never blocks or interferes with `readSensorAndCheckBreaker()` — a failed or slow cloud call must never delay or skip a breaker check.

```cpp
const char* CLOUD_INGEST_URL  = "https://REGION-PROJECT.cloudfunctions.net/ingest"; // fill in after deploy
const char* CLOUD_DEVICE_KEY  = "changeme"; // must match DEVICE_SHARED_SECRET on the function

unsigned long lastCloudPushTime = 0;
const unsigned long CLOUD_PUSH_INTERVAL = 10000; // ms

void pushToCloud() {
  if (WiFi.status() != WL_CONNECTED) return; // skip quietly, try again next interval

  WiFiClientSecure client;
  client.setInsecure(); // MVP only — skips TLS cert validation, see security note below

  HTTPClient http;
  http.begin(client, CLOUD_INGEST_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", CLOUD_DEVICE_KEY);
  http.setTimeout(5000);

  StaticJsonDocument<300> doc;
  doc["device_id"]    = DEVICE_ID;
  doc["device_name"]  = DEVICE_NAME;
  doc["voltage"]      = lastVoltage;
  doc["current"]      = lastCurrent;
  doc["power"]        = lastPower;
  doc["energy"]       = lastEnergy;
  doc["frequency"]    = lastFreq;
  doc["power_factor"] = lastPF;
  doc["threshold"]    = powerThreshold;
  doc["tripped"]      = tripped;
  doc["relay_on"]     = !tripped && !manuallyOff;

  String payload;
  serializeJson(doc, payload);

  int code = http.POST(payload);
  Serial.printf("Cloud push -> HTTP %d\n", code);
  http.end();
}
```

And in `loop()`, alongside the existing local-read check:

```cpp
if (millis() - lastCloudPushTime > CLOUD_PUSH_INTERVAL) {
  lastCloudPushTime = millis();
  pushToCloud();
}
```

11. Add basic WiFi reconnect handling in `loop()` (check `WiFi.status()`, call `WiFi.reconnect()` or re-run `connectWiFi()` if disconnected) — not strictly required for the demo to work once, but without it a single WiFi hiccup permanently kills cloud pushes until the device is power-cycled.

### Security note (be upfront about this, don't silently ship it)
- `client.setInsecure()` skips TLS certificate validation — acceptable to get something working end-to-end, not acceptable long-term. The correct fix later is pinning Google Trust Services' root CA. Flag this as known debt.
- The shared secret lives in plaintext in the firmware source. Fine for a single prototype in a private repo; not fine if this code is ever pushed somewhere public or scaled to multiple real devices without per-device credentials.

---

## 8. Acceptance Criteria (how you'll know this phase is actually done)

- Power on the ESP32 with real WiFi credentials filled in → Serial monitor shows a successful WiFi connect, followed by periodic `Cloud push -> HTTP 200` lines.
- Open the Firestore console → a `devices/socket1` (or whatever `DEVICE_ID` is set to) document exists, its reading fields update, and `last_seen` keeps advancing roughly every `CLOUD_PUSH_INTERVAL`.
- Disconnect the device's WiFi (or power it off) → `last_seen` stops advancing and stays stuck at its last value — that "stuck timestamp" *is* the offline signal for this phase.
- The existing local REST API (`/api/reading`, `/api/control`, etc.) still works exactly as before — the cloud push is additive and never blocks or breaks local behavior, and breaker trip logic still fires correctly with zero dependency on WiFi/cloud reachability.

---

## 9. Explicitly Out of Scope for This Phase
- Any web or mobile dashboard/frontend.
- MQTT broker setup (HiveMQ, Mosquitto, or otherwise).
- Full device provisioning / per-device credentials / Secret Manager — a single shared secret is fine for now.
- Multi-device UI or a device list beyond individual Firestore documents.
- Automatic offline detection/alerting (e.g. a Cloud Scheduler job that flags stale devices) — logical next step, not required now.
- LED status indicators, physical reset button wiring, trip-latency measurement, or anything else from the hardware review deck's simulation plan — those are the hardware teammate's track, not this one.

---

## 10. Open Decisions to Confirm With Ray Before/While Building
- GCP project to use (existing or new) and preferred region.
- Cloud Functions vs Cloud Run (this brief defaults to Cloud Functions for console-friendliness; either works).
- Node.js vs Python for the ingest function (skeleton above is Python).
- Exact `CLOUD_PUSH_INTERVAL` value (10s used as a starting default — trivial to change).
- Confirm `DEVICE_ID` / `DEVICE_NAME` to actually use for the physical prototype (firmware currently ships with placeholder values `"socket1"` / `"Living Room Socket"`).
