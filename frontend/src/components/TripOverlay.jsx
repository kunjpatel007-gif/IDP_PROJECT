import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ArcDischarge from '@/components/ArcDischarge';
import FaultRecord from '@/components/FaultRecord';
import ScrambleText from '@/components/ScrambleText';
import { usePrevious } from '@/hooks/usePrevious';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { fmt } from '@/lib/format';

/**
 * Breaker operation, staged as a relay event rather than an alert box.
 *
 *   collapse   0–200ms    supply sags, the console folds to a scan line
 *   arc        200–700ms  dielectric breakdown across the field
 *   report     700ms+     the oscillographic event report resolves in
 *   clear      ~4.4s      shutter wipe back to the console
 *
 * Fires strictly on the false → true edge of `tripped`, never on a load that
 * happens to find the breaker already open — the event is the transition.
 *
 * There is no emoji and no exclamation mark. A protection device that has
 * just interrupted a fault reports what it measured; the drama comes from the
 * measurement arriving, not from punctuation.
 */

const PHASES = { collapse: 200, arc: 500, hold: 2700 };
const TOTAL = PHASES.collapse + PHASES.arc + PHASES.hold;

export default function TripOverlay({
  tripped,
  peakWatts,
  threshold,
  voltage,
  powerFactor,
  onShake,
}) {
  const reduced = useReducedMotion();
  const previous = usePrevious(tripped);
  const [phase, setPhase] = useState(null); // collapse | arc | report
  const timers = useRef([]);

  useEffect(() => {
    if (previous !== false || tripped !== true) return;

    timers.current.forEach(clearTimeout);
    timers.current = [];

    setPhase('collapse');
    if (!reduced && typeof onShake === 'function') onShake();

    // Timers live in a ref: `previous` flips true on the next render, and an
    // effect-scoped cleanup would cancel the sequence before it ever ran.
    timers.current.push(setTimeout(() => setPhase('arc'), PHASES.collapse));
    timers.current.push(setTimeout(() => setPhase('report'), PHASES.collapse + PHASES.arc));
    timers.current.push(setTimeout(() => setPhase(null), reduced ? 2200 : TOTAL));
  }, [tripped, previous, onShake, reduced]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const overshoot =
    peakWatts != null && threshold ? Math.round((peakWatts / threshold) * 100) : null;

  return (
    <AnimatePresence>
      {phase ? (
        <motion.div
          key="trip"
          role="alert"
          aria-live="assertive"
          className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center overflow-hidden px-4"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
        >
          {/* Field collapse: everything folds to a scan line, then reopens */}
          <motion.div
            className="absolute inset-0 origin-center bg-[#0a0406]"
            initial={{ scaleY: 1 }}
            animate={
              reduced
                ? { scaleY: 1, opacity: 0.94 }
                : { scaleY: [1, 0.004, 1], opacity: [1, 1, 0.94] }
            }
            transition={{ duration: 0.42, times: [0, 0.35, 1], ease: 'easeInOut' }}
          />

          {/* The scan line, with the red/blue fringing of a misconverged tube */}
          {!reduced ? (
            <>
              <motion.div
                className="absolute inset-x-0 top-1/2 h-[2px] bg-white"
                initial={{ opacity: 0, scaleX: 0.2 }}
                animate={{ opacity: [0, 1, 0], scaleX: [0.2, 1, 1] }}
                transition={{ duration: 0.4, times: [0, 0.35, 1] }}
              />
              <motion.div
                className="absolute inset-x-0 top-1/2 h-[2px] bg-[#ff2d2d] mix-blend-screen"
                style={{ marginTop: -2 }}
                initial={{ opacity: 0, scaleX: 0.2 }}
                animate={{ opacity: [0, 0.8, 0], scaleX: [0.2, 1, 1], x: [-3, -3, 0] }}
                transition={{ duration: 0.4, times: [0, 0.35, 1] }}
              />
              <motion.div
                className="absolute inset-x-0 top-1/2 h-[2px] bg-[#2d6bff] mix-blend-screen"
                style={{ marginTop: 2 }}
                initial={{ opacity: 0, scaleX: 0.2 }}
                animate={{ opacity: [0, 0.8, 0], scaleX: [0.2, 1, 1], x: [3, 3, 0] }}
                transition={{ duration: 0.4, times: [0, 0.35, 1] }}
              />
              {/* Horizontal tearing during the collapse */}
              {phase === 'collapse'
                ? Array.from({ length: 7 }, (_, i) => (
                    <motion.div
                      key={i}
                      className="absolute inset-x-0 bg-accent-red/20 mix-blend-screen"
                      style={{ top: `${8 + i * 13}%`, height: `${2 + Math.random() * 5}%` }}
                      animate={{ x: [0, (Math.random() - 0.5) * 90, 0] }}
                      transition={{ duration: 0.16, repeat: 1 }}
                    />
                  ))
                : null}
            </>
          ) : null}

          {phase === 'arc' ? <ArcDischarge active intensity={1} /> : null}

          {/* Rack rails */}
          <motion.div
            className="absolute inset-x-0 top-0 h-[2px] origin-left bg-accent-red"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 h-[2px] origin-right bg-accent-red"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* Embers rising off the interruption */}
          {phase === 'report' && !reduced
            ? Array.from({ length: 22 }, (_, i) => (
                <span
                  key={i}
                  className="ember pointer-events-none absolute bottom-[18%] h-[3px] w-[3px] rounded-full bg-[#ff9d5c]"
                  style={{
                    left: `${8 + Math.random() * 84}%`,
                    '--ember-x': `${(Math.random() - 0.5) * 70}px`,
                    '--ember-dur': `${2 + Math.random() * 2.4}s`,
                    animationDelay: `${Math.random() * 1.6}s`,
                  }}
                />
              ))
            : null}

          <AnimatePresence>
            {phase === 'report' ? (
              <motion.div
                key="report"
                className="aftershock relative flex w-full max-w-[860px] flex-col items-stretch"
                initial={reduced ? { opacity: 1 } : { opacity: 0, y: 18, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 190, damping: 22 }}
              >
                {/* Verdict */}
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <ScrambleText
                    as="h2"
                    text="BREAKER OPEN"
                    duration={560}
                    className="font-display text-[30px] font-bold uppercase leading-none tracking-[0.16em] text-[#ffe9e9] sm:text-[42px]"
                  />
                  <div className="flex items-baseline gap-2 font-mono">
                    <span className="text-[26px] font-medium text-accent-red sm:text-[32px]">
                      {peakWatts != null ? fmt(peakWatts) : '—'}
                    </span>
                    <span className="text-[13px] text-on-surface-muted">W</span>
                    {overshoot != null ? (
                      <span className="ml-2 border border-accent-red/40 px-2 py-0.5 text-[12px] text-accent-red">
                        {overshoot}% of rated
                      </span>
                    ) : null}
                  </div>
                </div>

                <FaultRecord
                  peakWatts={peakWatts}
                  threshold={threshold}
                  voltage={voltage}
                  powerFactor={powerFactor}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Shutter wipe on the way out */}
          <motion.div
            className="absolute inset-x-0 bottom-0 origin-bottom bg-[#0a0406]"
            initial={{ height: 0 }}
            exit={{ height: '100%' }}
            transition={{ duration: 0.4, ease: [0.76, 0, 0.24, 1] }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
