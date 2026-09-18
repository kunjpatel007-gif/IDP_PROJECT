#pragma once
// Copy to secrets.h (git-ignored) and fill in real values.

#define SECRET_WIFI_SSID      "your-ssid"
#define SECRET_WIFI_PASSWORD  "your-wifi-password"

// Leave the placeholder URL as-is to keep cloud push disabled until you deploy.
#define SECRET_CLOUD_INGEST_URL "https://REGION-PROJECT.cloudfunctions.net/ingest"
#define SECRET_CLOUD_DEVICE_KEY "replace-with-output-of-secret-generator"
