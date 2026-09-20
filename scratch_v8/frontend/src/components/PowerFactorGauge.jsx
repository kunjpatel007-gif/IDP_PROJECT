import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { clamp, fmt } from '@/lib/format';

/**
 * Moving-coil power factor meter.
 *
 * Power factor is the one telemetry field a number alone communicates badly —
 * 0.71 means nothing until you see where it sits between "this load is a
 * resistor" and "this load is mostly reactive". So it gets a needle, a
 * banded scale, and a spring that lets it overshoot once before it settles.
 */

const CX = 84;
const CY = 82;
const R = 62;

const polar = (radius, deg) => {
  const rad = (deg * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
};

const arcPath = (radius, from, to) => {
  const [x0, y0] = polar(radius, from);
  const [x1, y1] = polar(radius, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${radius},${radius} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
};

const toAngle = (value) => 180 + clamp(value, 0, 1) * 180;

function zoneOf(value) {
  if (value == null) return { colour: '#686d7c', label: 'No signal' };
  if (value > 0.85) return { colour: '#22c55e', label: 'Resistive' };
  if (value >= 0.6) return { colour: '#d97736', label: 'Reactive' };
  return { colour: '#ef4444', label: 'Poor' };
}

export default function PowerFactorGauge({ value = null, dimmed = false }) {
  const reduced = useReducedMotion();
  const known = value != null && Number.isFinite(Number(value));
  const pf = known ? clamp(Number(value), 0, 1) : 0;
  const zone = zoneOf(known ? pf : null);

  // Needle drawn pointing straight up = mid-scale (0.5), so rotate from there.
  const rotation = (pf - 0.5) * 180;

  return (
    <div className={`flex flex-col ${dimmed ? 'opacity-55' : ''}`}>
      <svg viewBox="0 0 168 104" className="w-full max-w-[200px]" role="img" aria-label={`Power factor ${known ? pf.toFixed(3) : 'unavailable'}`}>
        {/* Scale bands — the meaning of the scale, not decoration */}
        <path d={arcPath(R, 180, 288)} stroke="#ef4444" strokeOpacity="0.28" strokeWidth="7" fill="none" strokeLinecap="butt" />
        <path d={arcPath(R, 288, 333)} stroke="#d97736" strokeOpacity="0.34" strokeWidth="7" fill="none" strokeLinecap="butt" />
        <path d={arcPath(R, 333, 360)} stroke="#22c55e" strokeOpacity="0.34" strokeWidth="7" fill="none" strokeLinecap="butt" />

        {/* Outer bezel */}
        <path d={arcPath(R + 5.5, 180, 360)} stroke="#2e313a" strokeWidth="1" fill="none" />
        <path d={arcPath(R - 5.5, 180, 360)} stroke="#2e313a" strokeWidth="1" fill="none" />

        {/* Graduations every 0.1 */}
        {Array.from({ length: 11 }, (_, i) => {
          const angle = toAngle(i / 10);
          const major = i % 5 === 0;
          const [x0, y0] = polar(R - 6.5, angle);
          const [x1, y1] = polar(R - (major ? 14 : 10.5), angle);
          return (
            <line
              key={i}
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke={major ? '#9da2af' : '#4b5262'}
              strokeWidth={major ? 1.25 : 1}
            />
          );
        })}

        {/* Travelled arc */}
        {known ? (
          <motion.path
            d={arcPath(R, 180, 360)}
            stroke={zone.colour}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            pathLength={1}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: pf }}
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 60, damping: 16 }}
          />
        ) : null}

        {/* Needle */}
        <motion.g
          style={{ transformOrigin: `${CX}px ${CY}px` }}
          animate={{ rotate: known ? rotation : -90 }}
          initial={{ rotate: -90 }}
          transition={
            reduced ? { duration: 0 } : { type: 'spring', stiffness: 42, damping: 9, mass: 0.9 }
          }
        >
          <line
            x1={CX}
            y1={CY + 6}
            x2={CX}
            y2={CY - R + 12}
            stroke={zone.colour}
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <circle cx={CX} cy={CY} r="5" fill="#16171b" stroke="#383c47" strokeWidth="1" />
          <circle cx={CX} cy={CY} r="1.75" fill={zone.colour} />
        </motion.g>

        {/* Endpoint labels */}
        <text x="20" y="98" fill="#686d7c" fontSize="8.5" fontFamily="JetBrains Mono, monospace">
          0.0
        </text>
        <text x="136" y="98" fill="#686d7c" fontSize="8.5" fontFamily="JetBrains Mono, monospace">
          1.0
        </text>
      </svg>

      <div className="mt-1 flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-on-surface-subtle">
          Power factor
        </span>
        <span className="font-mono text-[15px] font-medium" style={{ color: zone.colour }}>
          {known ? fmt(pf, 3) : '—'}
        </span>
      </div>
      <span className="font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">
        {zone.label}
      </span>
    </div>
  );
}
