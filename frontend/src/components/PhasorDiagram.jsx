import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { fmt } from '@/lib/format';

/**
 * Rotating phasor diagram and power triangle.
 *
 * Straight out of a circuit-analysis lecture, driven by live hardware:
 *
 *   φ = arccos(PF)        the power factor angle
 *   S = V · I             apparent power, VA
 *   P = S · cos φ         real power, W       (agrees with the PZEM's own P)
 *   Q = S · sin φ         reactive power, VAR
 *   S = √(P² + Q²)        the triangle closes
 *
 * The V phasor leads, the I phasor trails it by φ, and both rotate together
 * at a legible fraction of 50 Hz. On a resistive load the two collapse onto
 * each other and Q falls to nothing; on an inductive one they split apart and
 * the triangle grows a vertical leg you can watch appear.
 */

const R = 58;
const CX = 74;
const CY = 74;

export default function PhasorDiagram({
  voltage = 0,
  current = 0,
  powerFactor = 1,
  energised = true,
  tripped = false,
}) {
  const reduced = useReducedMotion();
  const [theta, setTheta] = useState(0);
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);
  heldRef.current = held;
  const raf = useRef(null);

  useEffect(() => {
    if (reduced) return undefined;
    let last = performance.now();
    const tick = (ts) => {
      const dt = Math.min((ts - last) / 1000, 1 / 20);
      last = ts;
      // Hovering freezes the frame so the angle can actually be read.
      if (!heldRef.current) setTheta((t) => (t + dt * 0.55 * Math.PI * 2) % (Math.PI * 2));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [reduced]);

  const pf = Math.min(1, Math.max(0, Number(powerFactor) || 0));
  const phi = Math.acos(pf);
  const phiDeg = (phi * 180) / Math.PI;

  const live = energised && !tripped;
  const V = live ? Number(voltage) || 0 : 0;
  const I = live ? Number(current) || 0 : 0;

  const S = V * I;
  const P = S * Math.cos(phi);
  const Q = S * Math.sin(phi);

  // Phasor lengths: voltage pinned near full scale, current scaled beside it.
  const vLen = V > 0 ? R * 0.9 : 0;
  const iLen = I > 0 ? R * Math.min(0.82, 0.28 + (I / 12) * 0.54) : 0;

  const accent = tripped ? '#ef4444' : '#d97736';
  const tip = (len, angle) => [CX + len * Math.cos(angle), CY - len * Math.sin(angle)];

  const [vx, vy] = tip(vLen, theta);
  const [ix, iy] = tip(iLen, theta - phi);

  // Power triangle, scaled to whichever leg is longest.
  const tw = 128;
  const th = 46;
  const scale = S > 0 ? Math.min(tw / S, th / Math.max(Q, S * 0.001)) : 0;
  const pLen = P * scale;
  const qLen = Q * scale;

  return (
    <div
      className="flex flex-col overflow-hidden border border-border-subtle bg-surface-card"
      onPointerEnter={(e) => e.pointerType !== 'touch' && setHeld(true)}
      onPointerLeave={() => setHeld(false)}
    >
      <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-subtle px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-muted">
          Phasors
        </span>
        {held ? (
          <span className="font-mono text-[10px] tracking-[0.06em] text-primary-soft">HOLD</span>
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-1 p-2.5 sm:gap-2 sm:p-3">
        <svg viewBox="0 0 148 148" className="w-full max-w-[150px] sm:max-w-[168px]" role="img" aria-label={`Phasor diagram, phase angle ${phiDeg.toFixed(1)} degrees`}>
          {/* Unit circle and axes */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#2e313a" strokeWidth="1" />
          <circle cx={CX} cy={CY} r={R * 0.55} fill="none" stroke="#2e313a" strokeWidth="1" strokeDasharray="1 4" />
          <line x1={CX - R - 6} y1={CY} x2={CX + R + 6} y2={CY} stroke="#383c47" strokeWidth="1" />
          <line x1={CX} y1={CY - R - 6} x2={CX} y2={CY + R + 6} stroke="#383c47" strokeWidth="1" />

          {/* Angle sweep between the two phasors */}
          {live && phiDeg > 1.5 ? (
            <path
              d={`M${CX},${CY} L${CX + R * 0.34 * Math.cos(theta)},${CY - R * 0.34 * Math.sin(theta)} A${R * 0.34},${R * 0.34} 0 0 1 ${CX + R * 0.34 * Math.cos(theta - phi)},${CY - R * 0.34 * Math.sin(theta - phi)} Z`}
              fill={accent}
              fillOpacity="0.16"
              stroke={accent}
              strokeOpacity="0.4"
              strokeWidth="1"
            />
          ) : null}

          {/* Afterimages: four ghosts spaced behind the present angle, so the
              direction of rotation is readable from a still frame. */}
          {live && !reduced
            ? [1, 2, 3, 4].map((k) => {
                const ghost = theta - k * 0.085;
                const [gvx, gvy] = tip(vLen, ghost);
                const [gix, giy] = tip(iLen, ghost - phi);
                const fade = 0.3 - k * 0.062;
                return (
                  <g key={k} opacity={fade}>
                    <line x1={CX} y1={CY} x2={gvx} y2={gvy} stroke="#9da2af" strokeWidth="2" strokeLinecap="round" />
                    {iLen > 0 ? (
                      <line x1={CX} y1={CY} x2={gix} y2={giy} stroke={accent} strokeWidth="2" strokeLinecap="round" />
                    ) : null}
                  </g>
                );
              })
            : null}

          {/* Voltage phasor */}
          <line x1={CX} y1={CY} x2={vx} y2={vy} stroke="#9da2af" strokeWidth="2" strokeLinecap="round" />
          <circle cx={vx} cy={vy} r="3" fill="#9da2af" />

          {/* Current phasor, lagging by φ */}
          {iLen > 0 ? (
            <>
              <line x1={CX} y1={CY} x2={ix} y2={iy} stroke={accent} strokeWidth="2" strokeLinecap="round" />
              <circle cx={ix} cy={iy} r="3" fill={accent} />
            </>
          ) : null}

          <circle cx={CX} cy={CY} r="2.5" fill="#16171b" stroke="#4b5262" strokeWidth="1" />

          {/* Instantaneous magnitudes, riding along with each tip */}
          {live ? (
            <>
              <text
                x={vx + (vx > CX ? 5 : -5)}
                y={vy + (vy > CY ? 9 : -4)}
                fill="#9da2af"
                fontSize="7.5"
                textAnchor={vx > CX ? 'start' : 'end'}
                fontFamily="JetBrains Mono, monospace"
              >
                {V.toFixed(0)}V
              </text>
              {iLen > 0 ? (
                <text
                  x={ix + (ix > CX ? 5 : -5)}
                  y={iy + (iy > CY ? 9 : -4)}
                  fill={accent}
                  fontSize="7.5"
                  textAnchor={ix > CX ? 'start' : 'end'}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {I.toFixed(2)}A
                </text>
              ) : null}
            </>
          ) : null}
        </svg>

        {/* Power triangle */}
        <svg viewBox="0 0 148 62" className="w-full max-w-[150px] sm:max-w-[168px]" role="img" aria-label="Power triangle">
          {S > 0 ? (
            <>
              <line x1="8" y1="52" x2={8 + pLen} y2="52" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
              <line x1={8 + pLen} y1="52" x2={8 + pLen} y2={52 - qLen} stroke="#9da2af" strokeWidth="2" strokeLinecap="round" />
              <line x1="8" y1="52" x2={8 + pLen} y2={52 - qLen} stroke={accent} strokeWidth="2" strokeLinecap="round" />
            </>
          ) : (
            <line x1="8" y1="52" x2="140" y2="52" stroke="#383c47" strokeWidth="1" strokeDasharray="2 4" />
          )}
        </svg>

        <dl className="grid w-full grid-cols-3 gap-1 font-mono text-[10px]">
          <div className="flex flex-col">
            <dt className="tracking-[0.04em] text-on-surface-subtle">P · W</dt>
            <dd className="text-[12px] font-medium text-accent-green">{fmt(P, 0)}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="tracking-[0.04em] text-on-surface-subtle">Q · VAR</dt>
            <dd className="text-[12px] font-medium text-on-surface-muted">{fmt(Q, 0)}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="tracking-[0.04em] text-on-surface-subtle">S · VA</dt>
            <dd className="text-[12px] font-medium" style={{ color: accent }}>
              {fmt(S, 0)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
