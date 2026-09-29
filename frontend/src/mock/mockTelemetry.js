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
 * Scenarios (append to the URL):
 *   ?mock=steady         a settled load, mild drift            (default)
 *   ?mock=trip           ramps past the hard threshold (1500W) and trips at ~10s
 *   ?mock=offline        stops transmitting after 4s
 *   ?mock=faultdrop      trips at ~10s, then loses the link
 *   ?mock=cycling        a compressor duty-cycling on and off
 *   ?mock=predictive     adaptive profile learning: ~90W load with dynamic threshold ~145W
 *   ?mock=degradation    persistent motor drift: 800W -> 1000W -> 1100W -> 1200W with degradation alert
 *   ?mock=predictivetrip abnormal 200W surge trips a 90W device at dynamic threshold long before 1500W
 */

import { DEVICE_ID } from '@/firebase';

const PUSH_MS = 2000;
const HARD_THRESHOLD = 1500;

function scenarioFromUrl() {
  if (typeof window === 'undefined') return 'steady';
  const rawValue = new URLSearchParams(window.location.search).get('mock');
  const value = (rawValue || '').replace(/[^a-zA-Z]/g, '').toLowerCase();
  const validScenarios = ['steady', 'trip', 'offline', 'cycling', 'faultdrop', 'predictive', 'degradation', 'predictivetrip'];
  return validScenarios.includes(value) ? value : 'steady';
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
        // Someone plugs in a heat gun and leans on it past hard limit (1500W)
        return elapsed < 4 ? 240 : 240 + (elapsed - 4) * 240;
      case 'cycling':
        return (elapsed % 12) < 6 ? 1120 : 62;
      case 'offline':
        return 253;
      case 'predictive':
        // Laptop profile: inrush spike on first sample, settling to ~90W
        return elapsed < 3 ? 142 : 90 + Math.sin(elapsed / 5) * 4;
      case 'degradation':
        // Degraded heating/compressor coil drifting from 800W up to 1200W
        return Math.min(1240, 800 + Math.min(400, elapsed * 25));
      case 'predictivetrip':
        // Normal 90W load that develops internal short and surges to 220W at elapsed >= 6s
        return elapsed < 6 ? 90 + jitter(3) : 90 + (elapsed - 6) * 45;
      default:
        return 253 + Math.sin(elapsed / 7) * 90;
    }
  };

  const emit = () => {
    elapsed += PUSH_MS / 1000;

    if (scenario === 'offline' && elapsed > 4) silent = true;
    if (scenario === 'faultdrop' && tripped && elapsed > 14) silent = true;
    if (silent) return; // device stopped transmitting

    let rawTarget = targetFor();
    let power = tripped || !relayOn ? 0 : Math.max(0, rawTarget + jitter(scenario === 'predictive' ? 2 : 12));

    // Dynamic Threshold parameters (T = P_normal + k*sigma + M)
    let pNormal = 250;
    let sigma = 10;
    const kSensitivity = 3.0;
    const marginM = 50.0;
    let activeAppliance = 'Office Workstation';
    let inrushPower = 320.0;
    let degradationPct = 0.0;
    let degradationAlert = false;

    if (scenario === 'predictive' || scenario === 'predictivetrip') {
      activeAppliance = 'Ultrabook Charger (90W)';
      pNormal = 90.0;
      sigma = 3.2;
      inrushPower = 145.0;
      degradationPct = 2.4;
    } else if (scenario === 'degradation') {
      activeAppliance = 'Induction Motor / Pump';
      const baseline = 800.0;
      pNormal = Math.round(power);
      sigma = 18.0;
      inrushPower = 1250.0;
      degradationPct = Number((((power - baseline) / baseline) * 100).toFixed(1));
      degradationAlert = degradationPct >= 15.0;
    } else if (scenario === 'cycling') {
      activeAppliance = 'Refrigeration Compressor';
      pNormal = power > 500 ? 1120.0 : 62.0;
      sigma = 15.0;
      inrushPower = 1650.0;
      degradationPct = 5.1;
    }

    const dynamicThreshold = Math.min(HARD_THRESHOLD, Math.round(pNormal + kSensitivity * sigma + marginM));

    // Risk Level (0 to 100%)
    let riskLevel = 0;
    if (power > 0) {
      if (power <= pNormal) {
        riskLevel = Math.round((power / dynamicThreshold) * 45);
      } else {
        const excess = power - pNormal;
        const headroom = Math.max(1, dynamicThreshold - pNormal);
        riskLevel = Math.min(100, Math.round(45 + (excess / headroom) * 55));
      }
      if (degradationAlert) {
        riskLevel = Math.min(100, riskLevel + 18);
      }
    }

    // Adaptive Predictive Trip condition
    const effectiveLimit = (scenario === 'predictivetrip' || scenario === 'predictive') ? dynamicThreshold : HARD_THRESHOLD;
    if (!tripped && power > effectiveLimit) {
      tripped = true;
      relayOn = false;
      riskLevel = 100;
      power = Math.round(power);
      setTimeout(() => emit(), 400);
    }

    const voltage = 230.4 + jitter(0.9);
    const powerFactor = power > 40 ? 0.94 + jitter(0.03) : 0.5 + jitter(0.2);
    const current = power > 0 ? power / (voltage * powerFactor) : 0;

    energy += (power / 1000) * (PUSH_MS / 3600000);
    lastSeen = Date.now();
    seq += 1;

    onData({
      device_id: DEVICE_ID || 'mock-device',
      device_name: 'Mock SmartSocket',
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
      threshold: HARD_THRESHOLD,
      tripped,
      relay_on: relayOn,
      last_seen: new Date(lastSeen).toISOString(),

      // Predictive fields
      active_appliance: activeAppliance,
      dynamic_threshold: dynamicThreshold,
      risk_level: riskLevel,
      degradation_pct: degradationPct,
      degradation_alert: degradationAlert,
      inrush_power: inrushPower,
      inrush_current: Number((inrushPower / (voltage * powerFactor)).toFixed(2)),
      startup_duration_s: 1.8,
      p_normal: pNormal,
      sigma: sigma,
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
