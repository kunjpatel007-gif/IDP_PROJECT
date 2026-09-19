import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Energy flow through the adapter.
 *
 * Charge carriers run left to right along three conductors, from the grid
 * feed to the load. Emission rate and velocity both scale with the measured
 * current, so the ribbon visibly thickens as load comes on.
 *
 * The relay sits in the middle of the run. When it opens the contact gap
 * appears, particles pile up against the break and the downstream half of the
 * ribbon drains — the socket going dead, drawn as it happens. On a trip the
 * whole run goes crimson and the gap arcs once.
 */

const LANES = 3;
const MAX_PARTICLES = 220;

export default function PowerFlowRibbon({
  current = 0,
  relayOn = true,
  tripped = false,
  energised = true,
  height = 64,
}) {
  const reduced = useReducedMotion();
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const particles = useRef([]);
  const live = useRef({ current, relayOn, tripped, energised });
  live.current = { current, relayOn, tripped, energised };
  const arc = useRef(0);
  const wasClosed = useRef(relayOn);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    const ctx = canvas.getContext('2d');
    let width = 0;
    let frame;
    let last = performance.now();
    let emitAccumulator = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = wrap.clientWidth || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    const render = (ts) => {
      const dt = Math.min((ts - last) / 1000, 1 / 20);
      last = ts;

      const s = live.current;
      const gate = width * 0.5;
      const closed = s.relayOn && !s.tripped && s.energised;

      // One arc flash on the opening edge.
      if (wasClosed.current && !closed) arc.current = 1;
      wasClosed.current = closed;
      arc.current = Math.max(0, arc.current - dt * 2.6);

      const amps = s.energised ? Math.max(0, Number(s.current) || 0) : 0;
      const speed = 34 + Math.min(amps, 12) * 15;
      const rate = closed ? Math.min(58, 5 + amps * 8) : 0;

      const accent = s.tripped ? [248, 113, 113] : [217, 119, 54];

      ctx.clearRect(0, 0, width, height);

      const laneY = (i) => (height / (LANES + 1)) * (i + 1);

      // ── Conductors ──────────────────────────────────────────────
      for (let i = 0; i < LANES; i += 1) {
        const y = Math.round(laneY(i)) + 0.5;
        ctx.strokeStyle = 'rgba(53, 55, 66, 0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(closed ? width : gate - 7, y);
        ctx.stroke();

        if (!closed) {
          // Downstream side, de-energised.
          ctx.strokeStyle = 'rgba(53, 55, 66, 0.45)';
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(gate + 7, y);
          ctx.lineTo(width, y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // ── Emit ────────────────────────────────────────────────────
      if (!reduced && rate > 0) {
        emitAccumulator += rate * dt;
        while (emitAccumulator >= 1 && particles.current.length < MAX_PARTICLES) {
          emitAccumulator -= 1;
          particles.current.push({
            x: -4,
            lane: Math.floor(Math.random() * LANES),
            v: speed * (0.82 + Math.random() * 0.36),
            size: 0.9 + Math.random() * 1.3,
          });
        }
      }

      // ── Advance and draw ────────────────────────────────────────
      const next = [];
      for (const p of particles.current) {
        if (!reduced) p.x += p.v * dt;
        // An open contact is a wall: carriers bunch against it and fade.
        if (!closed && p.x > gate - 8) {
          p.x = gate - 8 - Math.random() * 6;
          p.fade = (p.fade ?? 1) - dt * 1.7;
          if (p.fade <= 0) continue;
        }
        if (p.x > width + 4) continue;

        const alpha = (p.fade ?? 1) * (p.x < 6 ? p.x / 6 : 1);
        ctx.fillStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${0.85 * alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, laneY(p.lane), p.size, 0, Math.PI * 2);
        ctx.fill();

        // Motion streak — velocity made visible.
        ctx.strokeStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${0.3 * alpha})`;
        ctx.lineWidth = p.size * 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x - p.v * 0.022, laneY(p.lane));
        ctx.lineTo(p.x, laneY(p.lane));
        ctx.stroke();

        next.push(p);
      }
      particles.current = next;

      // ── Relay contact ───────────────────────────────────────────
      const gapTop = height * 0.18;
      const gapBottom = height * 0.82;
      ctx.strokeStyle = closed ? `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.9)` : '#4b4e5c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gate - 7, gapTop);
      ctx.lineTo(gate - 7, gapBottom);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gate + 7, gapTop);
      ctx.lineTo(gate + 7, gapBottom);
      ctx.stroke();

      if (closed) {
        ctx.beginPath();
        ctx.moveTo(gate - 7, height / 2);
        ctx.lineTo(gate + 7, height / 2);
        ctx.stroke();
      }

      // Arc flash across the opening gap.
      if (arc.current > 0) {
        ctx.strokeStyle = `rgba(255, 220, 190, ${arc.current})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        let x = gate - 7;
        ctx.moveTo(x, height / 2);
        while (x < gate + 7) {
          x += 2;
          ctx.lineTo(x, height / 2 + (Math.random() - 0.5) * 9 * arc.current);
        }
        ctx.stroke();
      }

      if (!reduced) frame = requestAnimationFrame(render);
    };

    if (reduced) render(performance.now());
    else frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [height, reduced]);

  const closed = relayOn && !tripped && energised;

  return (
    <div className="overflow-hidden border border-border-subtle bg-surface-card">
      <div className="flex h-7 items-center justify-between border-b border-border-subtle px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-muted">
          Energy flow
        </span>
        <span className="font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">
          grid → relay → load
        </span>
      </div>
      <div ref={wrapRef} className="relative bg-surface-subtle shadow-well" style={{ height }}>
        <canvas ref={canvasRef} className="block" />
        <span className="pointer-events-none absolute left-2 top-1 font-mono text-[9px] uppercase tracking-[0.06em] text-on-surface-subtle">
          mains
        </span>
        <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.06em] text-on-surface-subtle">
          {closed ? 'closed' : 'open'}
        </span>
        <span className="pointer-events-none absolute right-2 top-1 font-mono text-[9px] uppercase tracking-[0.06em] text-on-surface-subtle">
          socket
        </span>
      </div>
    </div>
  );
}
