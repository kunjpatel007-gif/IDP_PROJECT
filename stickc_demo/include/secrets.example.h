// secrets.example.h — Copy this file to secrets.h and fill in your values.
// secrets.h is gitignored and must NEVER be committed.

#pragma once

// Your WiFi network
#define WIFI_SSID     "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// The shared secret from the Cloud Function env var DEVICE_SHARED_SECRET
#define DEVICE_SHARED_SECRET "YOUR_SHARED_SECRET_HERE"

// The Cloud Function ingest URL (this never changes)
#define CLOUD_INGEST_URL "https://us-central1-smart-adapter-backend.cloudfunctions.net/ingest"
