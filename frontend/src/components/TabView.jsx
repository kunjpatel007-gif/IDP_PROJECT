import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Tab change, as one event rather than four.
 *
 * Switching tabs used to cut: the old panel vanished on the same frame the
 * new one appeared, and the new one faded in as a single block. Now the
 * outgoing screen clears first and the incoming rows arrive in sequence
 * behind a single scan line — the way a channel change looks on a CRT that
 * has to retrace before it can paint.
 *
 * That sweep is the only non-user-triggered motion added at page level. Every
 * other animation in this build is driven by a reading changing, which is
 * where motion earns its keep on an instrument.
 */

const screen = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.2, staggerChildren: 0.055, delayChildren: 0.08 },
  },
  exit: {
    opacity: 0,
    y: -5,
    transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
  },
};

/** Rows arrive from below, each a beat after the one above it. */
export const strip = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.44, ease: [0.22, 1, 0.36, 1] },
  },
};

/** Convenience: a staggered row inside a TabView. */
export function Strip({ children, className = '' }) {
  return (
    <motion.div variants={strip} className={className}>
      {children}
    </motion.div>
  );
}

export default function TabView({ children, className = '' }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      variants={screen}
      initial="initial"
      animate="animate"
      exit="exit"
      className={`relative ${className}`}
    >
      {!reduced ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-30 h-px overflow-visible"
          aria-hidden="true"
        >
          <div
            className="tab-sweep h-[2px] w-full"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(217,119,54,0.5) 18%, rgba(255,182,140,0.85) 50%, rgba(217,119,54,0.5) 82%, transparent)',
              boxShadow: '0 0 18px 1px rgba(217,119,54,0.4)',
            }}
          />
        </div>
      ) : null}

      {children}
    </motion.div>
  );
}
