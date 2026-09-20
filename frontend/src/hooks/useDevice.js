import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeTelemetry, parseLastSeen, STALE_MS } from '@/firebase';
import { NOMINAL_VOLTAGE, RECONSTRUCTION_FALLBACK_PF } from '@/lib/nominal';

/**
 * Device status is derived, never stored.
 *
 *   stale (>15s since last_seen) → 'offline'
 *   tripped === true             → 'tripped'
 *   otherwise                    → 'online'
 *
 * Staleness is time-based, so a 1s ticker re-derives it even when Firestore
 * sends nothing. A device that dies silently must still go grey on its own.
 */
export function useDevice(source = 'live') {
  const [raw, setRaw] = useState(null);
  const [connection, setConnection] = useState('connecting'); // connecting | live | empty | error
  const [error, setError] = useState(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [lastSnapshotAt, setLastSnapshotAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const seenFirst = useRef(false);
  // Last few readings while energised — the source of the peak trip load.
  const recentPower = useRef([]);
  // Power factor and voltage while the socket is actually carrying load.
  const lastEnergised = useRef({ voltage: NOMINAL_VOLTAGE, powerFactor: RECONSTRUCTION_FALLBACK_PF });
  const [tripPeak, setTripPeak] = useState(null);
  const [tripContext, setTripContext] = useState(null);

  // ── Live subscription ───────────────────────────────────────────
  useEffect(() => {
    // A source switch must not carry the other source's history across.
    setRaw(null);
    setConnection('connecting');
    setError(null);
    setTripPeak(null);
    setTripContext(null);
    recentPower.current = [];
    seenFirst.current = false;
    const unsubscribe = subscribeTelemetry(
      (data) => {
        if (!data) {
          setConnection('empty');
          setRaw(null);
          return;
        }

        // A tripped relay reads ~0 W, so the load that actually opened the
        // breaker is already gone by the time `tripped` arrives. Freeze the
        // highest of the last few energised readings and hold it until reset.
        const watts = Number(data.power ?? 0);
        if (data.tripped === true) {
          setTripPeak((prev) => prev ?? Math.max(watts, ...recentPower.current, 0));
          // Freeze the conditions at inception too. An open relay reports a
          // meaningless power factor (~0.5 with no load), and reconstructing
          // the fault from that puts the pickup current out by a factor of two.
          setTripContext((prev) => prev ?? { ...lastEnergised.current });
        } else {
          setTripPeak(null);
          setTripContext(null);
          recentPower.current = [...recentPower.current, watts].slice(-3);
          if (watts > 40) {
            lastEnergised.current = {
              voltage: Number(data.voltage) || NOMINAL_VOLTAGE,
              powerFactor: Number(data.power_factor) || RECONSTRUCTION_FALLBACK_PF,
            };
          }
        }

        seenFirst.current = true;
        setRaw(data);
        setConnection('live');
        setError(null);
        setLastSnapshotAt(Date.now());
        setSnapshotCount((c) => c + 1);
      },
      (err) => {
        console.error('[SmartAdapter] Firestore subscription error:', err);
        setConnection('error');
        setError(err);
      },
      source
    );
    return unsubscribe;
    // Re-subscribing on source change is the whole point: flipping back to
    // live tears down the mock generator and reconnects to Firestore.
  }, [source]);

  // ── Stale-detection ticker ──────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const device = useMemo(() => {
    const lastSeenMs = parseLastSeen(raw?.last_seen);
    const silentFor = lastSeenMs == null ? null : Math.max(0, now - lastSeenMs);
    const isStale = lastSeenMs == null || silentFor > STALE_MS;

    // Tripped beats stale, deliberately. A breaker that opens and then loses
    // power or WiFi died in a fault state, and that is precisely the thing an
    // operator must still be able to see. The fault latches red until the
    // device comes back and reports itself clear.
    let status;
    if (!raw) status = 'loading';
    else if (raw.tripped === true) status = 'tripped';
    else if (isStale) status = 'offline';
    else status = 'online';

    const offline = status === 'offline';
    const tripped = status === 'tripped';
    const online = status === 'online';

    // Latched red is not the same as live. `unreachable` is the separate fact
    // that nothing is arriving, and it governs anything that would otherwise
    // present stale numbers as current or offer controls that cannot land.
    const unreachable = raw != null && isStale;
    const staleTripped = tripped && unreachable;

    const publishedThreshold = Number(raw?.threshold);
    const thresholdKnown = Number.isFinite(publishedThreshold) && publishedThreshold > 0;
    // Scaling still needs a number; the flag is what the UI reads before
    // presenting it as though the adapter had said so.
    const threshold = thresholdKnown ? publishedThreshold : 0;
    const power = offline ? 0 : Number(raw?.power ?? 0);

    // The card headline and the utilisation trace show the load that opened
    // the breaker, not the ~0 W a de-energised socket reports afterwards.
    const peakTripWatts = tripped ? (tripPeak ?? power) : null;
    const displayPower = tripped ? peakTripWatts : power;
    const utilisation = threshold > 0 ? Math.max(0, (displayPower / threshold) * 100) : 0;

    return {
      raw,
      status,
      online,
      tripped,
      offline,
      unreachable,
      staleTripped,
      loading: status === 'loading',

      deviceName: raw?.device_name ?? null,
      deviceId: raw?.device_id ?? null,
      fwVersion: raw?.fw_version ?? null,

      power,
      displayPower,
      peakTripWatts,
      faultVoltage: tripContext?.voltage ?? null,
      faultPowerFactor: tripContext?.powerFactor ?? null,
      voltage: unreachable ? null : (raw?.voltage ?? null),
      current: unreachable ? null : (raw?.current ?? null),
      energy: raw?.energy ?? null,
      frequency: raw?.frequency ?? null,
      powerFactor: raw?.power_factor ?? null,
      threshold,
      thresholdKnown,
      utilisation,
      utilisationClamped: Math.min(100, utilisation),
      overloaded: utilisation >= 100,

      relayOn: raw?.relay_on === true,
      rssi: raw?.rssi ?? null,
      freeHeap: raw?.free_heap ?? null,
      seq: raw?.seq ?? null,

      lastSeenMs,
      silentFor,
      isStale,
    };
  }, [raw, now, tripPeak, tripContext]);

  return {
    ...device,
    connection,
    connected: connection === 'live',
    error,
    snapshotCount,
    lastSnapshotAt,
    hasEverConnected: seenFirst.current,
    now,
  };
}
