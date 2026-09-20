import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import FaultRecord from '@/components/FaultRecord';
import { usePrevious } from '@/hooks/usePrevious';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { fmt } from '@/lib/format';

/**
 * Breaker operation report.
 *
 * Fires strictly on the false → true edge of `tripped` — the event is the
 * transition, not the state, so a page load that finds the breaker already
 * open shows nothing.
 *
 * Deliberately undramatic. The console dims, a rule draws across the top, and
 * the event report settles in; the oscillogram draws itself on because that is
 * the measurement arriving, and that is the only motion here that carries
 * information. No arc, no tearing, no shake. A protection device that has just
 * interrupted a fault states what it recorded — the seriousness is in the
 * numbers, and anything staged on top of them undercuts it.
 */

const HOLD_MS = 4200;

export default function TripOverlay({ tripped, peakWatts, threshold, voltage, powerFactor }) {
  const reduced = useReducedMotion();
  const previous = usePrevious(tripped);
  const [open, setOpen] = useState(false);
  const dismiss = useRef(null);

  useEffect(() => {
    if (previous !== false || tripped !== true) return;
    setOpen(true);
    // Timer in a ref: `previous` flips true on the next render and an
    // effect-scoped cleanup would cancel the dismissal before it fired.
    clearTimeout(dismiss.current);
    dismiss.current = setTimeout(() => setOpen(false), reduced ? 2600 : HOLD_MS);
  }, [tripped, previous, reduced]);

  useEffect(() => () => clearTimeout(dismiss.current), []);

  const overshoot =
    peakWatts != null && threshold ? Math.round((peakWatts / threshold) * 100) : null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="trip"
          role="alert"
          aria-live="assertive"
          className="fixed inset-0 z-[90] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.28, ease: 'easeOut' }}
          onClick={() => setOpen(false)}
        >
          {/* Console recedes rather than flashing. */}
          <div className="absolute inset-0 bg-surface/92 backdrop-blur-[3px]" />

          <motion.div
            className="relative w-full max-w-[880px] border border-border-muted bg-surface-card"
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Fault rule across the head of the panel */}
            <motion.div
              className="h-[2px] origin-left bg-accent-red-deep"
              initial={reduced ? { scaleX: 1 } : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            />

            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-border-subtle px-4 py-3">
              <div className="flex items-baseline gap-3">
                <span className="h-[7px] w-[7px] shrink-0 self-center rounded-full bg-accent-red outline outline-1 outline-surface-card" />
                <h2 className="font-display text-[17px] font-semibold uppercase tracking-[0.1em] text-on-surface">
                  Breaker open
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-on-surface-subtle">
                  overcurrent
                </span>
              </div>

              <div className="flex items-baseline gap-2 font-mono">
                <span className="text-[22px] font-medium text-accent-red">
                  {peakWatts != null ? fmt(peakWatts) : '—'}
                </span>
                <span className="text-[12px] text-on-surface-muted">W</span>
                {overshoot != null ? (
                  <span className="ml-2 border border-accent-red-deep px-2 py-0.5 text-[11px] text-accent-red">
                    {overshoot}% of rated
                  </span>
                ) : null}
              </div>
            </div>

            <div className="p-4">
              <FaultRecord
                peakWatts={peakWatts}
                threshold={threshold}
                voltage={voltage}
                powerFactor={powerFactor}
              />
            </div>

            <div className="border-t border-border-subtle px-4 py-2">
              <span className="font-mono text-[10px] tracking-[0.05em] text-on-surface-subtle">
                Dismisses automatically · click to close
              </span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
