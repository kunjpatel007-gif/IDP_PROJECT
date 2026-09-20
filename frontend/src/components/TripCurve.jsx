import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { clamp } from '@/lib/format';
import { NOMINAL_VOLTAGE, RECONSTRUCTION_FALLBACK_PF } from '@/lib/nominal';

/**
 * Inverse time-current characteristic, with the socket plotted on it live.
 *
 * The IEC 60255 standard-inverse curve:
 *
 *   t(M) = k·TMS / (M^α − 1)        k = 0.14,  α = 0.02,  M = I / Is
 *
 * Log-log, because that is the only way this curve is ever drawn — decades
 * on both axes, trip time falling away as the multiple of pickup rises.
 *
 * The marker is the socket right now. Below pickup it sits left of the knee
 * in the no-operate region and the readout says so. Cross into M > 1 and it
 * slides onto the characteristic and reports how long the breaker would
 * tolerate that current before operating. Watching the dot walk up the curve
 * as a load ramps is the whole of protection coordination in one picture.
 */

const K = 0.14;
const ALPHA = 0.02;
const TMS = 0.1;

const W = 260;
const H = 168;
const PAD = { l: 34, r: 8, t: 10, b: 22 };

const M_MIN = 0.4;
const M_MAX = 20;
const T_MIN = 0.02;
const T_MAX = 200;

const tripTime = (m) => (m <= 1 ? Infinity : (K * TMS) / (m ** ALPHA - 1));

const xOf = (m) =>
  PAD.l +
  ((Math.log10(clamp(m, M_MIN, M_MAX)) - Math.log10(M_MIN)) /
    (Math.log10(M_MAX) - Math.log10(M_MIN))) *
    (W - PAD.l - PAD.r);

const yOf = (t) =>
  PAD.t +
  ((Math.log10(T_MAX) - Math.log10(clamp(t, T_MIN, T_MAX))) /
    (Math.log10(T_MAX) - Math.log10(T_MIN))) *
    (H - PAD.t - PAD.b);

export default function TripCurve({ current = 0, threshold = 0, voltage, powerFactor, energised = true }) {
  const reduced = useReducedMotion();
  const [probe, setProbe] = useState(null);

  const { curve, pickup, multiple, predicted } = useMemo(() => {
    const V = Number(voltage) || NOMINAL_VOLTAGE;
    const pf = clamp(Number(powerFactor) || RECONSTRUCTION_FALLBACK_PF, 0.3, 1);
    const Is = threshold / (V * pf);

    const pts = [];
    for (let i = 0; i <= 120; i += 1) {
      const m = 1.02 * (M_MAX / 1.02) ** (i / 120);
      pts.push(`${i === 0 ? 'M' : 'L'}${xOf(m).toFixed(1)},${yOf(tripTime(m)).toFixed(1)}`);
    }

    const I = energised ? Math.max(0, Number(current) || 0) : 0;
    const m = Is > 0 ? I / Is : 0;
    return { curve: pts.join(' '), pickup: Is, multiple: m, predicted: tripTime(m) };
  }, [current, threshold, voltage, powerFactor, energised]);

  const willTrip = multiple > 1;
  const px = xOf(Math.max(multiple, M_MIN));
  const py = willTrip ? yOf(predicted) : H - PAD.b - 6;
  const accent = willTrip ? '#ef4444' : '#d97736';

  return (
    <div className="overflow-hidden border border-border-subtle bg-surface-card">
      <div className="flex h-7 items-center justify-between border-b border-border-subtle px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-muted">
          Trip curve
        </span>
        <span className="font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">
          IEC SI
        </span>
      </div>

      <div className="p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full cursor-crosshair"
          role="img"
          aria-label="Inverse time current characteristic"
          onPointerMove={(event) => {
            if (event.pointerType === 'touch') return;
            const rect = event.currentTarget.getBoundingClientRect();
            const sx = ((event.clientX - rect.left) / rect.width) * W;
            if (sx < PAD.l || sx > W - PAD.r) return setProbe(null);
            // Invert the log mapping to recover the current multiple.
            const frac = (sx - PAD.l) / (W - PAD.l - PAD.r);
            const m =
              10 ** (Math.log10(M_MIN) + frac * (Math.log10(M_MAX) - Math.log10(M_MIN)));
            return setProbe({ x: sx, m });
          }}
          onPointerLeave={() => setProbe(null)}
        >
          {/* Decade grid */}
          {[0.4, 1, 2, 5, 10, 20].map((m) => (
            <g key={`x${m}`}>
              <line x1={xOf(m)} y1={PAD.t} x2={xOf(m)} y2={H - PAD.b} stroke="#2e313a" strokeWidth="1" />
              <text x={xOf(m)} y={H - PAD.b + 11} fill="#686d7c" fontSize="7.5" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
                {m}
              </text>
            </g>
          ))}
          {[0.02, 0.2, 2, 20, 200].map((t) => (
            <g key={`y${t}`}>
              <line x1={PAD.l} y1={yOf(t)} x2={W - PAD.r} y2={yOf(t)} stroke="#2e313a" strokeWidth="1" />
              <text x={PAD.l - 4} y={yOf(t) + 2.5} fill="#686d7c" fontSize="7.5" textAnchor="end" fontFamily="JetBrains Mono, monospace">
                {t}
              </text>
            </g>
          ))}

          {/* No-operate region, left of pickup */}
          <rect x={PAD.l} y={PAD.t} width={xOf(1) - PAD.l} height={H - PAD.t - PAD.b} fill="#22c55e" fillOpacity="0.05" />
          <line x1={xOf(1)} y1={PAD.t} x2={xOf(1)} y2={H - PAD.b} stroke="#22c55e" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 3" />

          {/* The characteristic */}
          <motion.path
            d={curve}
            fill="none"
            stroke="#9da2af"
            strokeWidth="1.6"
            strokeLinecap="round"
            pathLength={1}
            initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduced ? 0 : 1.1, ease: 'easeOut' }}
          />

          {/* Operating point */}
          <motion.g
            animate={{ x: px, y: py }}
            initial={false}
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 15 }}
          >
            {!reduced ? (
              <circle r="4" fill="none" stroke={accent} strokeWidth="1">
                <animate attributeName="r" values="4;13;4" dur="1.8s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.8;0;0.8" dur="1.8s" repeatCount="indefinite" />
              </circle>
            ) : null}
            <circle r="3.5" fill={accent} />
          </motion.g>

          {/* Coordination probe: read the operate time anywhere on the curve */}
          {probe ? (
            <g pointerEvents="none">
              <line
                x1={probe.x}
                y1={PAD.t}
                x2={probe.x}
                y2={H - PAD.b}
                stroke="#ffb68c"
                strokeOpacity="0.7"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {probe.m > 1 ? (
                <circle cx={probe.x} cy={yOf(tripTime(probe.m))} r="3" fill="#ffb68c" />
              ) : null}
              <rect
                x={Math.min(probe.x + 5, W - 74)}
                y={PAD.t + 2}
                width="68"
                height="26"
                fill="#0d0e11"
                fillOpacity="0.93"
                stroke="#383c47"
              />
              <text
                x={Math.min(probe.x + 10, W - 69)}
                y={PAD.t + 13}
                fill="#f4f4f6"
                fontSize="8"
                fontFamily="JetBrains Mono, monospace"
              >
                {probe.m.toFixed(2)}× pickup
              </text>
              <text
                x={Math.min(probe.x + 10, W - 69)}
                y={PAD.t + 23}
                fill={probe.m > 1 ? '#ffb68c' : '#22c55e'}
                fontSize="8"
                fontFamily="JetBrains Mono, monospace"
              >
                {probe.m > 1 ? `${tripTime(probe.m).toFixed(2)} s` : 'no operate'}
              </text>
            </g>
          ) : null}

          <text x={PAD.l} y={H - 3} fill="#686d7c" fontSize="7" fontFamily="JetBrains Mono, monospace">
            × pickup
          </text>
        </svg>

        <dl className="mt-1 grid grid-cols-3 gap-2 px-1 font-mono">
          <div>
            <dt className="text-[9px] tracking-[0.05em] text-on-surface-subtle">PICKUP</dt>
            <dd className="text-[12px] text-on-surface">{pickup.toFixed(2)} A</dd>
          </div>
          <div>
            <dt className="text-[9px] tracking-[0.05em] text-on-surface-subtle">MULTIPLE</dt>
            <dd className="text-[12px]" style={{ color: accent }}>{multiple.toFixed(2)}×</dd>
          </div>
          <div>
            <dt className="text-[9px] tracking-[0.05em] text-on-surface-subtle">OPERATE</dt>
            <dd className="text-[12px]" style={{ color: willTrip ? accent : '#22c55e' }}>
              {willTrip ? `${predicted.toFixed(2)} s` : 'no trip'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
