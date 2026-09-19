import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePrevious } from '@/hooks/usePrevious';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { fmt } from '@/lib/format';

/**
 * The money moment.
 *
 * Fires strictly on the false → true edge of `tripped`, never on a page load
 * that happens to find the breaker already open — the event is the transition,
 * not the state. Holds for 1.5s: strobe, chassis shake, verdict, then clears
 * to the normal tripped card so the console is readable again.
 */

const HOLD_MS = 1500;

export default function TripOverlay({ tripped, peakWatts, threshold, onShake }) {
  const reduced = useReducedMotion();
  const previous = usePrevious(tripped);
  const [active, setActive] = useState(false);
  const dismiss = useRef(null);

  useEffect(() => {
    if (previous !== false || tripped !== true) return;
    setActive(true);
    if (!reduced && typeof onShake === 'function') onShake();
    // The timer lives in a ref: `previous` flips to true on the very next
    // render, and an effect-scoped cleanup would cancel the dismissal before
    // it ever fired, pinning the overlay over the console for good.
    clearTimeout(dismiss.current);
    dismiss.current = setTimeout(() => setActive(false), HOLD_MS);
  }, [tripped, previous, onShake, reduced]);

  useEffect(() => () => clearTimeout(dismiss.current), []);

  const overshoot =
    peakWatts != null && threshold ? Math.round((peakWatts / threshold) * 100) : null;

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          key="trip"
          role="alert"
          aria-live="assertive"
          className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.42, ease: 'easeOut' }}
        >
          {/* Field flash */}
          <div className="absolute inset-0 bg-[#2a0708]/85 backdrop-blur-[2px]" />
          {!reduced ? (
            <div
              className="trip-strobe absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 50% 45%, rgba(220,38,38,0.55) 0%, rgba(220,38,38,0.1) 45%, transparent 72%)',
              }}
            />
          ) : null}

          {/* Rack rails snapping in from both edges */}
          <motion.div
            className="absolute left-0 right-0 top-0 h-[3px] origin-left bg-accent-red"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: reduced ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.div
            className="absolute bottom-0 left-0 right-0 h-[3px] origin-right bg-accent-red"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: reduced ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }}
          />

          <motion.div
            className="relative flex flex-col items-center px-6 text-center"
            initial={reduced ? { opacity: 1 } : { scale: 0.86, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            <motion.span
              className="mb-3 text-[42px] leading-none"
              animate={reduced ? {} : { scale: [1, 1.18, 1] }}
              transition={{ duration: 0.5, repeat: 2, ease: 'easeInOut' }}
              aria-hidden="true"
            >
              ⚡
            </motion.span>

            <h2 className="font-display text-[34px] font-bold uppercase leading-none tracking-[0.14em] text-[#ffe4e4] sm:text-[46px]">
              Circuit Tripped
            </h2>

            <div className="mt-4 border border-accent-red/45 bg-black/35 px-4 py-2">
              <p className="font-mono text-[13px] tracking-[0.02em] text-accent-red">
                {peakWatts != null && threshold
                  ? `${fmt(peakWatts)} W drawn against a ${fmt(threshold)} W limit`
                  : 'Load exceeded the configured limit'}
              </p>
              {overshoot != null ? (
                <p className="mt-1 font-mono text-[11px] tracking-[0.05em] text-[#ffb4ab]/80">
                  {overshoot}% of rated — relay opened, socket de-energised
                </p>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
