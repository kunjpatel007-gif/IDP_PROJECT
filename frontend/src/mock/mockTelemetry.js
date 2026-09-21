/**
 * Rehearsal mode. Off unless you ask for it.
 *
 * `npm run dev:mock` feeds the console a synthetic adapter so you can walk
 * through the trip sequence without tripping an actual breaker, and so a
 * demo still runs if the bench hardware sulks. Nothing here ships in a normal
 * production build: the module is dynamically imported and only when
 * VITE_MOCK=1 is set at build time.
 *
 * Scenarios (append to the URL):
 *   ?mock=steady   a settled load, mild drift            (default)
 *   ?mock=trip     ramps past the threshold and trips at ~10s
 *   ?mock=offline  stops transmitting after 4s
 *   ?mock=faultdrop trips at ~10s, then loses the link — the latched fault case
 *   ?mock=cycling  a compressor duty-cycling on and off
 */

import { DEVICE_ID } from '@/firebase';

const PUSH_MS = 2000;
const THRESHOLD = 1500;

function scenarioFromUrl() {
  if (typeof window === 'undefined') return 'steady';
  const rawValue = new URLSearchParams(window.location.search).get('mock');
  const value = (rawValue || '').replace(/[^a-zA-Z]/g, '');
  return ['steady', 'trip', 'offline', 'cycling', 'faultdrop'].includes(value)
    ? value
    : 'steady';
}

const jitter = (spread) => (Math.random() - 0.5) * 2 * spread;

export function startMockTelemetry(onData) {
  const scenario = scenarioFromUrl();

  let seq = 1;
  let elapsed = 0;
  let energy = 12.4;
  let tripped = false;
  let relayOn = true;
  let silent = false;
  let lastSeen = Date.now();

  const targetFor = () => {
    switch (scenario) {
      case 'faultdrop':
      case 'trip':
        // Someone plugs in a heat gun and leans on it.
        return elapsed < 4 ? 240 : 240 + (elapsed - 4) * 240;
      case 'cycling':
        return (elapsed % 12) < 6 ? 1120 : 62;
      case 'offline':
        return 253;
      default:
        return 253 + Math.sin(elapsed / 7) * 90;
    }
  };

  const emit = () => {
    elapsed += PUSH_MS / 1000;

    if (scenario === 'offline' && elapsed > 4) silent = true;
    // Breaker opens, then the adapter loses power or WiFi a few seconds later.
    if (scenario === 'faultdrop' && tripped && elapsed > 14) silent = true;
    if (silent) return; // the device simply stops talking

    let power = tripped || !relayOn ? 0 : Math.max(0, targetFor() + jitter(14));

    if (!tripped && power > THRESHOLD) {
      tripped = true;
      relayOn = false;
      // The recorded peak is the load that opened the breaker.
      power = Math.round(power);
      setTimeout(() => emit(), 400);
    }

    const voltage = 230.4 + jitter(0.9);
    const powerFactor = power > 40 ? 0.93 + jitter(0.05) : 0.5 + jitter(0.2);
    const current = power > 0 ? power / (voltage * powerFactor) : 0;

    energy += (power / 1000) * (PUSH_MS / 3600000);
    lastSeen = Date.now();
    seq += 1;

    onData({
      device_id: DEVICE_ID || 'mock-device',
      device_name: 'Mock Socket',
      fw_version: '0.2.0-mock',
      rssi: Math.round(-62 + jitter(7)),
      seq,
      free_heap: Math.round(214000 + jitter(9000)),
      voltage: Number(voltage.toFixed(1)),
      current: Number(current.toFixed(2)),
      power: Number(power.toFixed(1)),
      energy: Number(energy.toFixed(3)),
      frequency: Number((50 + jitter(0.06)).toFixed(2)),
      power_factor: Number(Math.min(1, powerFactor).toFixed(3)),
      threshold: THRESHOLD,
      tripped,
      relay_on: relayOn,
      last_seen: new Date(lastSeen).toISOString(),
    });
  };

  emit();
  const timer = setInterval(emit, PUSH_MS);

  // Commands loop back through the same simulated device.
  const applyCommand = (command) => {
    setTimeout(() => {
      if (command === 'RESET') {
        tripped = false;
        relayOn = true;
        elapsed = 0;
      } else if (command === 'OFF') {
        relayOn = false;
      } else if (command === 'ON') {
        relayOn = true;
      }
      emit();
    }, 1200);
  };

  if (typeof window !== 'undefined') {
    window.__smartAdapterMock = { applyCommand };
  }

  return () => clearInterval(timer);
}

export function mockSendCommand(command) {
  return new Promise((resolve) => {
    setTimeout(() => {
      window.__smartAdapterMock?.applyCommand(command);
      resolve(command);
    }, 220);
  });
}
