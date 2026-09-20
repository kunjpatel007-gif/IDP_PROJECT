import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { fmt } from '@/lib/format';

/**
 * Oscillographic event report.
 *
 * Modelled on what a protection relay hands you after an operation: a
 * pre-trigger window of healthy load, the fault inception, the interruption,
 * and a sequential events recorder alongside.
 *
 * The fault current is asymmetrical, as a real one is. Closing into a fault
 * at an arbitrary point on the wave leaves a decaying DC component:
 *
 *   i(t) = √2·If·[ sin(ωt − φ) + sin(φ)·e^(−t/τ) ]
 *
 * which is why the first loop after inception is visibly taller than the
 * ones after it and the trace rides above the axis before settling. Getting
 * that offset right is the difference between a waveform and a decoration.
 *
 * Honest framing, stated on the panel: the PZEM reports RMS registers, not a
 * sampled waveform, so this is reconstructed from the recorded peak — not a
 * captured COMTRADE record. It shows the shape of what happened, at the
 * magnitude that actually happened.
 */

const SAMPLES_PER_CYCLE = 64;
const PRE_CYCLES = 3;
const FAULT_CYCLES = 2.25;
const POST_CYCLES = 1.75;
const TAU = 0.9; // DC decay time constant, in cycles

const SER = [
  { t: '+0.000 s', label: 'Load steady', tone: 'idle' },
  { t: '+0.060 s', label: 'Overcurrent pickup', tone: 'warn' },
  { t: '+0.105 s', label: 'Trip asserted', tone: 'trip' },
  { t: '+0.112 s', label: 'Contact travel', tone: 'trip' },
  { t: '+0.119 s', label: 'Arc extinguished', tone: 'trip' },
  { t: '+0.120 s', label: 'Load de-energised', tone: 'done' },
];

export default function FaultRecord({ peakWatts, threshold, voltage = 230, powerFactor = 0.95 }) {
  const reduced = useReducedMotion();
  const [revealed, setRevealed] = useState(reduced ? SER.length : 0);

  useEffect(() => {
    if (reduced) return undefined;
    const timers = SER.map((_, i) => setTimeout(() => setRevealed(i + 1), 520 + i * 105));
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  const model = useMemo(() => {
    const V = Number(voltage) || 230;
    const pf = Math.min(1, Math.max(0.3, Number(powerFactor) || 0.95));
    const phi = Math.acos(pf);

    const faultRms = peakWatts && V ? peakWatts / (V * pf) : 0;
    const loadRms = threshold ? (threshold * 0.16) / (V * pf) : faultRms * 0.15;

    const total = PRE_CYCLES + FAULT_CYCLES + POST_CYCLES;
    const count = Math.round(total * SAMPLES_PER_CYCLE);
    const points = [];
    let peakInstant = 0;

    for (let n = 0; n <= count; n += 1) {
      const c = (n / SAMPLES_PER_CYCLE); // time in cycles
      const w = 2 * Math.PI * c;
      let i;

      if (c < PRE_CYCLES) {
        i = Math.SQRT2 * loadRms * Math.sin(w - phi);
      } else if (c < PRE_CYCLES + FAULT_CYCLES) {
        const tf = c - PRE_CYCLES;
        // Symmetrical term plus the decaying DC offset from the inception angle.
        const ac = Math.sin(w - phi);
        const dc = Math.sin(phi) * Math.exp(-tf / TAU);
        i = Math.SQRT2 * faultRms * (ac + dc);
      } else {
        // Current chopped at interruption; short arc tail, then nothing.
        const tp = c - (PRE_CYCLES + FAULT_CYCLES);
        i = tp < 0.16 ? Math.SQRT2 * faultRms * 0.22 * Math.exp(-tp * 28) * Math.sin(w * 3) : 0;
      }

      peakInstant = Math.max(peakInstant, Math.abs(i));
      points.push(i);
    }

    // I²t let-through over the fault window, trapezoidal, at 50 Hz.
    const dt = 1 / (SAMPLES_PER_CYCLE * 50);
    let i2t = 0;
    for (let n = PRE_CYCLES * SAMPLES_PER_CYCLE; n < points.length; n += 1) {
      i2t += points[n] * points[n] * dt;
    }

    const pickup = threshold && V ? threshold / (V * pf) : 0;

    return { points, peakInstant, i2t, faultRms, pickup, phi, total, count };
  }, [peakWatts, threshold, voltage, powerFactor]);

  const W = 720;
  const H = 180;
  const mid = H / 2;
  const scale = model.peakInstant > 0 ? (H / 2 - 12) / model.peakInstant : 0;

  const path = model.points
    .map((v, n) => {
      const x = (n / model.count) * W;
      const y = mid - v * scale;
      return `${n === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const triggerX = (PRE_CYCLES / model.total) * W;
  const interruptX = ((PRE_CYCLES + FAULT_CYCLES) / model.total) * W;
  const pickupY = model.pickup * Math.SQRT2 * scale;

  return (
    <div className="w-full border border-border-subtle bg-surface-subtle">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-on-surface-muted">
          OSCILLOGRAPHIC EVENT REPORT
        </span>
        <span className="font-mono text-[9px] tracking-[0.06em] text-on-surface-subtle">
          64 sa/cycle · reconstructed from RMS record
        </span>
      </div>

      <div className="px-3 pt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-[132px] w-full sm:h-[160px]"
          role="img"
          aria-label="Fault current oscillogram"
        >
          {/* Graticule */}
          {Array.from({ length: 14 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={(W * i) / 14}
              y1="0"
              x2={(W * i) / 14}
              y2={H}
              stroke="#2e313a"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line x1="0" y1={mid} x2={W} y2={mid} stroke="#4b5262" strokeWidth="1" vectorEffect="non-scaling-stroke" />

          {/* Pickup thresholds */}
          {pickupY > 0 ? (
            <>
              <line x1="0" y1={mid - pickupY} x2={W} y2={mid - pickupY} stroke="#f59e0b" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1={mid + pickupY} x2={W} y2={mid + pickupY} stroke="#f59e0b" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
            </>
          ) : null}

          {/* Pre-trigger shading */}
          <rect x="0" y="0" width={triggerX} height={H} fill="#ffffff" fillOpacity="0.02" />

          {/* Trigger and interruption cursors */}
          <line x1={triggerX} y1="0" x2={triggerX} y2={H} stroke="#ffb68c" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <line x1={interruptX} y1="0" x2={interruptX} y2={H} stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />

          {/* The trace, drawn on */}
          <motion.path
            d={path}
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.6"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pathLength={1}
            initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduced ? 0 : 1.15, ease: 'linear' }}
          />
        </svg>

        <div className="mt-1 flex justify-between font-mono text-[9px] tracking-[0.05em] text-on-surface-subtle">
          <span>PRE-TRIGGER</span>
          <span className="text-primary-soft">INCEPTION</span>
          <span className="text-accent-green">INTERRUPTION</span>
        </div>
      </div>

      <div className="grid gap-x-5 gap-y-3 px-3 pb-3 pt-3 sm:grid-cols-[1fr_auto]">
        {/* Sequential events recorder */}
        <ol className="flex flex-col gap-[3px]">
          {SER.slice(0, revealed).map((e) => (
            <motion.li
              key={e.label}
              initial={reduced ? { opacity: 1 } : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18 }}
              className="flex items-baseline gap-3 font-mono text-[10px] tracking-[0.03em]"
            >
              <span className="text-on-surface-subtle">{e.t}</span>
              <span
                className={
                  e.tone === 'trip'
                    ? 'text-accent-red'
                    : e.tone === 'warn'
                      ? 'text-primary-soft'
                      : e.tone === 'done'
                        ? 'text-accent-green'
                        : 'text-on-surface-muted'
                }
              >
                {e.label}
              </span>
            </motion.li>
          ))}
        </ol>

        <dl className="grid grid-cols-3 gap-x-5 self-end font-mono sm:grid-cols-1 sm:gap-y-1.5">
          <div>
            <dt className="text-[9px] tracking-[0.06em] text-on-surface-subtle">PEAK LET-THROUGH</dt>
            <dd className="text-[13px] font-medium text-accent-red">
              {fmt(model.peakInstant, 1)} <span className="text-[10px] text-on-surface-muted">A</span>
            </dd>
          </div>
          <div>
            <dt className="text-[9px] tracking-[0.06em] text-on-surface-subtle">I²t</dt>
            <dd className="text-[13px] font-medium text-on-surface">
              {fmt(model.i2t, 2)} <span className="text-[10px] text-on-surface-muted">A²s</span>
            </dd>
          </div>
          <div>
            <dt className="text-[9px] tracking-[0.06em] text-on-surface-subtle">PICKUP</dt>
            <dd className="text-[13px] font-medium text-primary-soft">
              {fmt(model.pickup, 2)} <span className="text-[10px] text-on-surface-muted">A</span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
