import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Dust in the air of the room.
 *
 * Motes drift upward with a slow horizontal wobble, at an opacity low enough
 * that you register depth rather than dots. Density and rise rate scale with
 * socket utilisation, so the air over a loaded socket is visibly busier.
 *
 * On a trip they scatter — each mote takes a radial impulse from the centre
 * of the viewport and then damps back to its calm drift over a couple of
 * seconds, which reads as the pressure wave of the interruption.
 *
 * Sits behind ElectricField. Count adapts to viewport and core count, and the
 * loop parks itself entirely when the tab is hidden.
 */
export default function ParticleBackground({ intensity = 0, scatter = false }) {
  const reduced = useReducedMotion();
  const canvasRef = useRef(null);
  const live = useRef({ intensity, scatter });
  live.current = { intensity, scatter };
  const wasScattering = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduced) return undefined;
    const ctx = canvas.getContext('2d');

    let w = 0;
    let h = 0;
    let frame;
    let last = performance.now();
    let motes = [];

    const budget = () => {
      const cores = navigator.hardwareConcurrency || 4;
      const area = w * h;
      let n = Math.round(area / 9000);
      if (cores < 4) n = Math.round(n * 0.45);
      if (w < 640) n = Math.round(n * 0.5);
      return Math.max(24, Math.min(190, n));
    };

    const make = () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.5 + Math.random() * 1.2,
      rise: 5 + Math.random() * 14,
      wobble: Math.random() * Math.PI * 2,
      wobbleRate: 0.3 + Math.random() * 0.7,
      vx: 0,
      vy: 0,
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      motes = Array.from({ length: budget() }, make);
    };

    resize();
    window.addEventListener('resize', resize);

    const render = (ts) => {
      const dt = Math.min((ts - last) / 1000, 1 / 20);
      last = ts;

      const s = live.current;
      const load = Math.min(1, Math.max(0, s.intensity));

      // Impulse on the rising edge of a trip.
      if (s.scatter && !wasScattering.current) {
        for (const m of motes) {
          const dx = m.x - w / 2;
          const dy = m.y - h / 2;
          const d = Math.hypot(dx, dy) || 1;
          const force = 320 * (1 - Math.min(1, d / (Math.max(w, h) * 0.7)));
          m.vx += (dx / d) * force;
          m.vy += (dy / d) * force;
        }
      }
      wasScattering.current = s.scatter;

      ctx.clearRect(0, 0, w, h);

      const visible = Math.round(motes.length * (0.45 + load * 0.55));

      for (let i = 0; i < visible; i += 1) {
        const m = motes[i];

        m.vx *= 0.94;
        m.vy *= 0.94;
        m.wobble += m.wobbleRate * dt;

        m.x += (Math.sin(m.wobble) * 5 + m.vx) * dt;
        m.y += (-m.rise * (0.5 + load) + m.vy) * dt;

        if (m.y < -10) {
          m.y = h + 8;
          m.x = Math.random() * w;
        }
        if (m.x < -10) m.x = w + 8;
        if (m.x > w + 10) m.x = -8;

        ctx.fillStyle = `rgba(232, 236, 245, ${0.035 + load * 0.055})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }

      frame = requestAnimationFrame(render);
    };

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) {
        last = performance.now();
        frame = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 block"
      aria-hidden="true"
    />
  );
}
