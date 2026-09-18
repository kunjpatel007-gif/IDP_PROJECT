# SmartAdapter Cloud Backend

This is the backend for the SmartAdapter IoT project. It receives telemetry from the ESP32 firmware, validates it, rate-limits it, and stores the latest state in Firestore.

## Deployment Runbook (Phase 6)

Follow these steps exactly in your terminal to deploy the Cloud Function and generate the device key.

### 1. Initial Setup
```bash
# Set your active project
gcloud config set project YOUR_PROJECT_ID

# Enable all required APIs
gcloud services enable cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com

# Create the Firestore database (Native Mode)
gcloud firestore databases create --location=YOUR_REGION --type=firestore-native
```

### 2. Create the Device Secret
Run this Python snippet to generate a secure 32-byte key:
```bash
python -c "import secrets; open('secret.txt','w',newline='').write(secrets.token_urlsafe(32))"
```
Upload it to Google Secret Manager:
```bash
gcloud secrets create device-shared-secret --data-file=secret.txt
```
**CRITICAL:** Open `secret.txt`, copy the string, and paste it into `secrets.h` in your firmware folder as `SECRET_CLOUD_DEVICE_KEY`. After doing this, immediately delete `secret.txt`.

### 3. Deploy the Cloud Function
```bash
gcloud functions deploy ingest \
  --gen2 --runtime=python312 --region=YOUR_REGION \
  --source=cloud_backend --entry-point=ingest \
  --trigger-http --allow-unauthenticated \
  --memory=256Mi --timeout=15s --max-instances=2 \
  --set-secrets=DEVICE_SHARED_SECRET=device-shared-secret:latest \
  --set-env-vars=ALLOWED_DEVICE_IDS=socket1,MIN_PUSH_INTERVAL_S=2
```

### 4. Update Firmware
After deploying, the output will give you a Trigger URL (e.g., `https://REGION-PROJECT.cloudfunctions.net/ingest`).
1. Open `secrets.h`
2. Update `SECRET_CLOUD_INGEST_URL` with this real URL.
3. Compile and flash the ESP32 via VS Code / PlatformIO.

## Local Development & Tests
```bash
cd cloud_backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
pytest -v
```

## Payload Schema
`json
{
  "device_id": "socket1",
  "device_name": "Living Room Socket",
  "fw_version": "0.2.0-cloud",
  "rssi": -65,
  "seq": 142,
  "free_heap": 214000,
  "voltage": 120.5,
  "current": 2.1,
  "power": 253.05,
  "energy": 12.4,
  "frequency": 60.0,
  "power_factor": 0.95,
  "threshold": 1500.0,
  "tripped": false,
  "relay_on": true
}
``n
## Firmware Status-Code Policy
| Code | Meaning | Firmware Behavior |
|---|---|---|
| 200 | OK | Reset backoff to 5s. Increment seq. |
| 400 | Bad Request (schema/types) | Freeze pushes for 60s (requires code fix). |
| 401 | Missing/bad X-Device-Key | Freeze pushes for 60s (requires secrets.h fix). |
| 403 | device_id not in allowlist | Freeze pushes for 60s. |
| 413 | Payload too large | Freeze pushes for 60s. |
| 415 | Unsupported Media Type | Freeze pushes for 60s. |
| 429 | Too Many Requests (rate limit) | Accept gracefully. Reset backoff to 5s. |
| 500 | Server Error | Exponential backoff up to 60s. |
| 503 | Firestore overload | Exponential backoff up to 60s. |
