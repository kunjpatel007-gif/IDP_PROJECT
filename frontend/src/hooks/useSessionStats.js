import { useEffect, useRef, useReducer } from 'react';

/**
 * Session accumulator.
 *
 * The ESP32 publishes an instantaneous snapshot and nothing historical, and
 * there is no time-series store behind it. Rather than show zeros captioned
 * "requires a backend", this accumulates what the console has actually
 * witnessed since the page loaded: observed peak, running mean, energy
 * integrated from power over real elapsed time, and trips seen.
 *
 * Every figure is honestly scoped to the session and labelled as such. It is
 * a real measurement of a short window, not a fake measurement of a long one.
 *
 * Keyed on `seq` so the 1s stale ticker cannot double-count a packet.
 */
export function useSessionStats(device) {
  const state = useRef({
    samples: 0,
    sumPower: 0,
    peakPower: 0,
    peakAt: null,
    energyWh: 0,
    trips: 0,
    startedAt: Date.now(),
    lastAt: null,
    minVoltage: null,
    maxVoltage: null,
  });
  const lastSeq = useRef(null);
  const wasTripped = useRef(false);
  const [, bump] = useReducer((n) => n + 1, 0);

  const { seq, power, voltage, tripped, offline, connection } = device;

  useEffect(() => {
    if (tripped && !wasTripped.current) {
      state.current.trips += 1;
      bump();
    }
    wasTripped.current = tripped;
  }, [tripped]);

  useEffect(() => {
    if (offline || connection !== 'live' || seq == null || seq === lastSeq.current) return;
    lastSeq.current = seq;

    const s = state.current;
    const now = Date.now();
    const watts = Number(power) || 0;

    // Integrate over the interval actually observed, not an assumed period.
    if (s.lastAt) {
      const hours = (now - s.lastAt) / 3_600_000;
      if (hours > 0 && hours < 0.05) s.energyWh += watts * hours;
    }
    s.lastAt = now;

    s.samples += 1;
    s.sumPower += watts;
    if (watts > s.peakPower) {
      s.peakPower = watts;
      s.peakAt = now;
    }

    const v = Number(voltage);
    if (Number.isFinite(v) && v > 0) {
      s.minVoltage = s.minVoltage == null ? v : Math.min(s.minVoltage, v);
      s.maxVoltage = s.maxVoltage == null ? v : Math.max(s.maxVoltage, v);
    }

    bump();
  }, [seq, power, voltage, offline, connection]);

  const s = state.current;
  return {
    samples: s.samples,
    meanPower: s.samples ? s.sumPower / s.samples : null,
    peakPower: s.samples ? s.peakPower : null,
    peakAt: s.peakAt,
    energyWh: s.energyWh,
    trips: s.trips,
    minVoltage: s.minVoltage,
    maxVoltage: s.maxVoltage,
    durationMs: Date.now() - s.startedAt,
  };
}

/** Reset when the data source changes — the two streams are not one history. */
export function sessionKey(source) {
  return source;
}
