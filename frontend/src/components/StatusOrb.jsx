import { useEffect, useRef, useState } from 'react';

/**
 * Annunciator LED.
 *
 * Not a flat circle. A radial gradient puts a specular highlight at the
 * upper-left so the pip reads as a physical dome, and layered box-shadows
 * give it the bloom a real panel lamp throws onto the bezel around it.
 *
 * Each state has its own pulse rhythm, because on a hardware panel the
 * cadence carries as much information as the colour:
 *   nominal  — slow calm breathing, once every 2.4s
 *   critical — hard two-beat strobe, no easing
 *   dormant  — dim, very slow fade
 */

const SPEC = {
  online: {
    core: '#4ade80',
    edge: '#15803d',
    animation: 'orb-nominal 2.4s ease-in-out infinite',
    className: 'orb-nominal',
  },
  tripped: {
    core: '#fca5a5',
    edge: '#b91c1c',
    animation: 'orb-critical 900ms steps(1, end) infinite',
    className: 'orb-critical',
  },
  caution: {
    core: '#ffb68c',
    edge: '#a3521d',
    animation: 'orb-caution 1.4s ease-in-out infinite',
    className: 'orb-caution',
  },
  offline: {
    core: '#8b8f9e',
    edge: '#3a3d48',
    animation: 'orb-dormant 3.6s ease-in-out infinite',
    className: 'orb-dormant',
  },
  loading: {
    core: '#8b8f9e',
    edge: '#3a3d48',
    animation: 'orb-dormant 1.8s ease-in-out infinite',
    className: 'orb-dormant',
  },
};

export default function StatusOrb({ status = 'offline', size = 8, className = '' }) {
  const spec = SPEC[status] ?? SPEC.offline;
  const [inrush, setInrush] = useState(false);
  const prev = useRef(status);

  // A real lamp overshoots on switch-on before the filament settles.
  useEffect(() => {
    if (prev.current === status) return undefined;
    prev.current = status;
    setInrush(true);
    const t = setTimeout(() => setInrush(false), 400);
    return () => clearTimeout(t);
  }, [status]);

  return (
    <span
      className={`relative inline-block shrink-0 rounded-full ${spec.className} ${
        inrush ? 'orb-inrush' : ''
      } ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 32% 28%, ${spec.core} 0%, ${spec.core} 34%, ${spec.edge} 100%)`,
        // Halo ring seats the pip into the panel it is mounted on.
        outline: '1px solid #1a1b1f',
        animation: spec.animation,
      }}
    >
      {/* Convex glass over the die, and the highlight it catches at 10 o'clock. */}
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 30% 24%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 26%, transparent 52%)',
        }}
      />
    </span>
  );
}
