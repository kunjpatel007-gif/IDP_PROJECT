import { useEffect, useReducer, useRef } from 'react';

/**
 * Rolling window of the last N readings, held in a ref so the buffer survives
 * re-renders without being rebuilt. A version counter forces the redraw.
 *
 * `sampleKey` (the telemetry `seq` field) de-duplicates: the 1s stale ticker
 * re-renders this tree every second, but only a genuine new packet from the
 * ESP32 should push a point.
 *
 * @param {number|null} value       latest reading
 * @param {number|string|null} sampleKey  monotonic packet id
 * @param {number} size             window length
 * @returns {number[]}
 */
export function useSparkline(value, sampleKey, size = 20) {
  const bufferRef = useRef([]);
  const lastKeyRef = useRef(null);
  const [, bump] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    if (value == null || Number.isNaN(Number(value))) return;

    // Same packet as last time → nothing new happened on the wire.
    if (sampleKey != null && sampleKey === lastKeyRef.current) return;
    lastKeyRef.current = sampleKey;

    const next = [...bufferRef.current, Number(value)];
    bufferRef.current = next.length > size ? next.slice(next.length - size) : next;
    bump();
  }, [value, sampleKey, size]);

  return bufferRef.current;
}
