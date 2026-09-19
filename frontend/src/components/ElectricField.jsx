import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The console sits inside a live electrostatic field.
 *
 * Four point charges are placed around the viewport and their magnitudes
 * oscillate sinusoidally, out of phase with each other. The field at any
 * point is the superposition:
 *
 *   E(p) = Σ qᵢ · (p − rᵢ) / |p − rᵢ|³
 *
 * A few hundred massless tracers are integrated along E every frame, which
 * means they are not following a scripted path — they are drawing the field
 * lines of an actual (if invented) charge configuration, and when the charges
 * reverse the whole field turns itself inside out.
 *
 * It is wired to the socket. Idle: slow, sparse, cold drift. Loaded: the
 * charges swell, tracers accelerate and the field brightens to amber. Past
 * the trip threshold it goes crimson and incoherent.
 *
 * Trails come from compositing — the canvas is never cleared, only veiled
 * with a translucent wash each frame, so every tracer smears into a streak.
 */

const CHARGES = [
  { x: 0.18, y: 0.24, q: 1, phase: 0 },
  { x: 0.82, y: 0.3, q: -1, phase: 1.9 },
  { x: 0.3, y: 0.82, q: -1, phase: 3.4 },
  { x: 0.76, y: 0.74, q: 1, phase: 5.0 },
];

export default function ElectricField({ intensity = 0, overloaded = false, tripped = false }) {
  const reduced = useReducedMotion();
  const canvasRef = useRef(null);
  const live = useRef({ intensity, overloaded, tripped });
  live.current = { intensity, overloaded, tripped };
  const eased = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');

    let w = 0;
    let h = 0;
    let frame;
    let t = 0;
    let last = performance.now();
    let tracers = [];

    const spawn = () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      life: 0,
      max: 90 + Math.random() * 190,
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
      ctx.fillStyle = '#121316';
      ctx.fillRect(0, 0, w, h);

      const target = Math.round(Math.min(560, (w * h) / 3800));
      tracers = Array.from({ length: target }, spawn);
    };

    resize();
    window.addEventListener('resize', resize);

    const field = (px, py, time) => {
      let ex = 0;
      let ey = 0;
      for (let i = 0; i < CHARGES.length; i += 1) {
        const c = CHARGES[i];
        const cx = c.x * w;
        const cy = c.y * h;
        const dx = px - cx;
        const dy = py - cy;
        const d2 = dx * dx + dy * dy + 900; // softening, keeps it finite at the core
        const d = Math.sqrt(d2);
        const q = c.q * (0.55 + 0.45 * Math.sin(time * 0.55 + c.phase));
        const k = (q * 26000) / (d2 * d);
        ex += dx * k;
        ey += dy * k;
      }
      return [ex, ey];
    };

    const render = (ts) => {
      const dt = Math.min((ts - last) / 1000, 1 / 20);
      last = ts;
      t += dt;

      const s = live.current;
      const target = Math.min(1, Math.max(0, s.intensity));
      eased.current += (target - eased.current) * Math.min(1, dt * 1.6);
      const load = eased.current;

      // Veil rather than clear: this is what leaves the streaks.
      ctx.fillStyle = `rgba(18, 19, 22, ${0.085 - load * 0.038})`;
      ctx.fillRect(0, 0, w, h);

      const speed = 32 + load * 124;
      const alpha = 0.14 + load * 0.42;
      const colour = s.tripped || s.overloaded ? [248, 113, 113] : [217, 119, 54];
      const cold = [120, 126, 144];

      ctx.lineWidth = 1;

      for (let i = 0; i < tracers.length; i += 1) {
        const p = tracers[i];
        const [ex, ey] = field(p.x, p.y, t);

        let vx = ex;
        let vy = ey;
        const mag = Math.hypot(vx, vy) || 1;
        vx /= mag;
        vy /= mag;

        if (s.overloaded || s.tripped) {
          // The field loses coherence past the threshold.
          vx += (Math.random() - 0.5) * 1.5;
          vy += (Math.random() - 0.5) * 1.5;
        }

        const nx = p.x + vx * speed * dt;
        const ny = p.y + vy * speed * dt;

        // Warmer where the field is strong — the tracer reports its own E.
        const strength = Math.min(1, mag / 0.9);
        const mixed = [
          cold[0] + (colour[0] - cold[0]) * strength,
          cold[1] + (colour[1] - cold[1]) * strength,
          cold[2] + (colour[2] - cold[2]) * strength,
        ];

        ctx.strokeStyle = `rgba(${mixed[0] | 0}, ${mixed[1] | 0}, ${mixed[2] | 0}, ${
          alpha * (0.35 + strength * 0.65)
        })`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        ctx.stroke();

        p.x = nx;
        p.y = ny;
        p.life += 1;

        if (p.life > p.max || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
          tracers[i] = spawn();
        }
      }

      frame = requestAnimationFrame(render);
    };

    if (!reduced) frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [reduced]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <canvas ref={canvasRef} className="block" />

      {/* Faint graticule over the field */}
      <div className="console-grid absolute inset-0 opacity-30" />

      {/* Falloff, so the field never competes with the readouts */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 120% 95% at 50% 40%, rgba(18,19,22,0.18) 20%, rgba(18,19,22,0.62) 78%, rgba(18,19,22,0.88) 100%)',
        }}
      />
    </div>
  );
}
