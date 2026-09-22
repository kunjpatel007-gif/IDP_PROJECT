import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, serverTimestamp } from 'firebase/database';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

export const DEVICE_ID = import.meta.env.VITE_DEVICE_ID || 'UNCONFIGURED_DEVICE';
export const STALE_MS = 15_000;
export const COMMAND_ROUNDTRIP_MS = 7_000;

export function initialSource() {
  if (import.meta.env.VITE_MOCK === '1') return 'mock';
  if (typeof window !== 'undefined' && window.location.search.includes('mock=')) return 'mock';
  return 'live';
}

export function clearMockFromUrl() {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('mock')) return;
  url.searchParams.delete('mock');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

export const telemetryRef = ref(db, 'telemetry/' + DEVICE_ID);
export const commandRef = ref(db, 'commands/' + DEVICE_ID);

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

  const unsubscribe = onValue(
    telemetryRef,
    (snapshot) => onData(snapshot.exists() ? snapshot.val() : null),
    onError
  );
  return () => unsubscribe();
}

export async function sendCommand(command, source = 'live') {
  if (!['ON', 'OFF', 'RESET'].includes(command)) {
    throw new Error(`Unsupported relay command: ${command}`);
  }

  if (source === 'mock') {
    const { mockSendCommand } = await import('@/mock/mockTelemetry');
    return mockSendCommand(command);
  }

  await set(commandRef, {
    command,
    issued_at: serverTimestamp(),
  });
  return command;
}

export function parseLastSeen(raw) {
  if (raw == null) return null;
  // RTDB serverTimestamp is directly in epoch milliseconds
  if (typeof raw === 'number') return raw;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}
