/**
 * Firebase wiring for the SmartAdapter console.
 *
 * Data flow:
 *   ESP32 --POST--> Cloud Function --write--> telemetry/socket1 --onSnapshot--> this app
 *   this app --setDoc--> commands/socket1 --poll--> Cloud Function --> ESP32 relay
 *
 * The command path is why the buttons work from any network on earth: the
 * dashboard never talks to the device directly, it just leaves a note in
 * Firestore that the ESP32 picks up within two seconds.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

/** Document id of the target physical adapter. */
export const DEVICE_ID = import.meta.env.VITE_DEVICE_ID || 'UNCONFIGURED_DEVICE';

/** No telemetry for this long → the device is considered Offline. */
export const STALE_MS = 15_000;

/** Worst-case round trip: 2s command poll + 5s telemetry push. */
export const COMMAND_ROUNDTRIP_MS = 7_000;

/**
 * Rehearsal mode. `npm run dev:mock` only — never on in a normal build, and
 * the mock module is dynamically imported so it stays out of the prod bundle.
 */
/**
 * Which source the console starts on. The URL and the env var only choose the
 * *initial* value — the live source is switchable at runtime, so the console
 * can never end up latched to rehearsal data with no way back to the adapter.
 */
export function initialSource() {
  if (import.meta.env.VITE_MOCK === '1') return 'mock';
  if (typeof window !== 'undefined' && window.location.search.includes('mock=')) return 'mock';
  return 'live';
}

/** Drop `?mock=` from the address bar so a reload does not snap back. */
export function clearMockFromUrl() {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('mock')) return;
  url.searchParams.delete('mock');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const telemetryRef = doc(db, 'telemetry', DEVICE_ID);
export const commandRef = doc(db, 'commands', DEVICE_ID);

/**
 * Subscribe to the live telemetry document.
 *
 * Normalises the Firestore snapshot away so callers deal in plain data:
 * `onData(payload | null)` where null means the document does not exist yet.
 *
 * @param {(data: object|null) => void} onData
 * @param {(error: Error) => void} onError
 * @returns {() => void} unsubscribe
 */
export function subscribeTelemetry(onData, onError, source = 'live') {
  if (source === 'mock') {
    let stop = () => {};
    let cancelled = false;
    import('@/mock/mockTelemetry').then(({ startMockTelemetry }) => {
      if (cancelled) return;
      stop = startMockTelemetry(onData);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }

  return onSnapshot(
    telemetryRef,
    (snapshot) => onData(snapshot.exists() ? snapshot.data() : null),
    onError
  );
}

/**
 * Queue a relay command for the device.
 *
 * This is the whole control path: one document write. The ESP32 polls the
 * Cloud Function, which reads and atomically deletes the command, so the
 * dashboard never needs a route to the hardware.
 *
 * @param {'ON'|'OFF'|'RESET'} command
 */
export async function sendCommand(command, source = 'live') {
  if (!['ON', 'OFF', 'RESET'].includes(command)) {
    throw new Error(`Unsupported relay command: ${command}`);
  }

  if (source === 'mock') {
    const { mockSendCommand } = await import('@/mock/mockTelemetry');
    return mockSendCommand(command);
  }

  await setDoc(commandRef, {
    command,
    issued_at: serverTimestamp(),
  });
  return command;
}

/**
 * `last_seen` arrives as a Firestore Timestamp, a raw {seconds,nanoseconds}
 * object, or an ISO 8601 string depending on how it was written. Normalise
 * all three to epoch milliseconds.
 * @returns {number|null}
 */
export function parseLastSeen(raw) {
  if (raw == null) return null;

  if (typeof raw === 'object') {
    if (typeof raw.toMillis === 'function') return raw.toMillis();
    if (raw.seconds != null) {
      return raw.seconds * 1000 + Math.floor((raw.nanoseconds || 0) / 1e6);
    }
    return null;
  }

  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}
