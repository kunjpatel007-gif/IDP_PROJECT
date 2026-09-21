/** Shared readout formatting. Units are never merged into the integer. */

const DASH = '—';

export function fmt(value, decimals = 0) {
  if (value == null || Number.isNaN(Number(value))) return DASH;
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Watts → { value, unit } with an automatic kW step at 1000. */
export function scaleWatts(watts) {
  const w = Number(watts ?? 0);
  if (Math.abs(w) >= 1000) {
    return { value: w / 1000, unit: 'kW', decimals: 2 };
  }
  return { value: w, unit: 'W', decimals: 0 };
}

export function fmtHeap(bytes) {
  if (bytes == null) return DASH;
  return `${(bytes / 1024).toFixed(1)} kB`;
}

export function fmtClock(ms) {
  if (!ms) return DASH;
  return new Date(ms).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** "4s ago" / "2m 13s ago" — how long the device has been silent. */
export function fmtSilence(ms) {
  if (ms == null) return DASH;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) return `${minutes}m ${String(rem).padStart(2, '0')}s ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m ago`;
}

/** WiFi RSSI in dBm → a plain-language bucket. */
export function rssiQuality(rssi) {
  if (rssi == null) return { label: DASH, bars: 0 };
  if (rssi >= -55) return { label: 'Strong', bars: 4 };
  if (rssi >= -67) return { label: 'Good', bars: 3 };
  if (rssi >= -78) return { label: 'Fair', bars: 2 };
  return { label: 'Weak', bars: 1 };
}

/** Elapsed session time as hh:mm:ss — monotonic, never rounded to words. */
export function fmtDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return DASH;
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export { DASH };
