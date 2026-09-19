import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Cloud link carrier.
 *
 * A dot that is either green or grey tells you the state but not the life of
 * the connection. This draws the carrier instead: a 50 Hz mains sine runs
 * while packets are arriving, and the moment Firestore drops it collapses to
 * a flat DC line. You can tell across the room whether the link is alive.
 */

// Two cycles of a sine across 68px, sampled at 4px and stitched as a polyline.
const SINE =
  'M0,10 L4,6.1 L8,2.9 L12,1.4 L16,2 L20,4.6 L24,8.2 L28,11.8 L32,15.4 L36,18 L40,18.6 L44,17.1 L48,13.9 L52,10 L56,6.1 L60,2.9 L64,1.4 L68,2';

const FLAT =
  'M0,10 L4,10 L8,10 L12,10 L16,10 L20,10 L24,10 L28,10 L32,10 L36,10 L40,10 L44,10 L48,10 L52,10 L56,10 L60,10 L64,10 L68,10';

export default function LinkTrace({ alive = false, colour = '#22c55e', width = 68 }) {
  const reduced = useReducedMotion();
  const stroke = alive ? colour : '#4b4e5c';

  return (
    <svg
      width={width}
      height="20"
      viewBox="0 0 68 20"
      fill="none"
      className="overflow-visible"
      aria-hidden="true"
    >
      {/* Zero-volt reference */}
      <path d="M0,10 H68" stroke="#353742" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 3" />

      {/* Resting carrier */}
      <motion.path
        d={alive ? SINE : FLAT}
        stroke={stroke}
        strokeOpacity="0.32"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={{ d: alive ? SINE : FLAT }}
        transition={reduced ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* Sweep: a short bright segment chasing along the same geometry */}
      {alive && !reduced ? (
        <path
          d={SINE}
          stroke={colour}
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="100"
          strokeDasharray="18 82"
          style={{ animation: 'carrier-sweep 1.7s linear infinite' }}
        />
      ) : null}
    </svg>
  );
}
