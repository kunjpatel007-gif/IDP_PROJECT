import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { clamp } from '@/lib/format';

/**
 * Utilisation drawn as a live oscillograph rather than a filled bar.
 *
 *   amplitude ∝ load        a socket at 8% barely ripples; at 90% it swings
 *   frequency ∝ load        and it swings faster
 *   hue       ∝ load        amber through to crimson past ~60%
 *   >100%     → the trace tears into broadband noise and the panel flashes red
 *
 * Canvas, not SVG: this repaints at 60fps and a canvas costs one draw call
 * instead of a DOM mutation per frame.
 */

const AMBER = [217, 119, 54];
const CRIMSON = [239, 68, 68];
const IDLE = [104, 109, 124];

function mix(a, b, t) {
  const k = clamp(t, 0, 1);
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

const rgba = ([r, g, b], alpha = 1) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

/** Deterministic value noise — chaotic to the eye, stable frame to frame. */
function hashNoise(x, seed) {
  const s = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

export default function WaveformBar({
  pct = 0,
  overloaded = false,
  offline = false,
  height = 30,
  className = '',
}) {
  const reduced = useReducedMotion();
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  // Live values read inside the animation loop without restarting it.
  const live = useRef({ pct, overloaded, offline });
  live.current = { pct, overloaded, offline };

  // Amplitude eases toward its target so a step change in load looks like a
  // physical response, not a jump cut.
  const eased = useRef(pct);
  // Last drawn polyline, kept so the trip edge has something to break apart.
  const lastTrace = useRef([]);
  const shards = useRef([]);
  const wasTripped = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    const ctx = canvas.getContext('2d');
    let width = 0;
    let frame;
    let phase = 0;
    let lastTs = performance.now();

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
      const dt = Math.min((ts - lastTs) / 1000, 1 / 20);
      lastTs = ts;

      const state = live.current;
      const target = clamp(state.pct, 0, 118);
      eased.current += (target - eased.current) * Math.min(1, dt * 5);
      const load = eased.current;

      const mid = height / 2;
      const usable = height / 2 - 3;

      ctx.clearRect(0, 0, width, height);

      // ── Graticule: a tick every 10% of the threshold ─────────────
      ctx.fillStyle = 'rgba(56, 60, 71, 0.55)';
      for (let i = 1; i < 10; i += 1) {
        ctx.fillRect(Math.round((width * i) / 10), height - 4, 1, 4);
      }

      // ── Dormant baseline across the untravelled span ─────────────
      ctx.fillStyle = 'rgba(56, 60, 71, 0.75)';
      ctx.fillRect(0, Math.round(mid), width, 1);

      if (state.offline) {
        ctx.fillStyle = rgba(IDLE, 0.45);
        ctx.fillRect(0, Math.round(mid), width, 1);
        if (!reduced) frame = requestAnimationFrame(render);
        return;
      }

      const progress = clamp(load / 100, 0, 1);
      const travelled = Math.max(2, width * progress);

      // Faster and angrier the closer the socket is to its trip limit.
      const speed = 1.1 + (load / 100) * 5.2;
      if (!reduced) phase += dt * speed * Math.PI * 2;

      const amplitude = usable * (0.1 + Math.min(load, 100) / 100 * 0.86);
      const wavelength = Math.max(26, 78 - (load / 100) * 42);
      const colour = mix(AMBER, CRIMSON, (load - 55) / 45);

      // ── The trace ────────────────────────────────────────────────
      // ── Shatter on the trip edge ────────────────────────────────
      const nowTripped = state.overloaded || live.current.tripped === true;
      if (nowTripped && !wasTripped.current && lastTrace.current.length > 8 && !reduced) {
        const src = lastTrace.current;
        const pieces = 22;
        const per = Math.max(2, Math.floor(src.length / pieces));
        shards.current = [];
        for (let i = 0; i < src.length; i += per) {
          const slice = src.slice(i, i + per);
          if (slice.length < 2) continue;
          const cx = slice.reduce((a, pt) => a + pt[0], 0) / slice.length;
          const cy = slice.reduce((a, pt) => a + pt[1], 0) / slice.length;
          shards.current.push({
            pts: slice.map(([px, py]) => [px - cx, py - cy]),
            x: cx,
            y: cy,
            vx: (Math.random() - 0.5) * 70,
            vy: -30 - Math.random() * 60,
            rot: 0,
            rotV: (Math.random() - 0.5) * 7,
            life: 1,
          });
        }
      }
      wasTripped.current = nowTripped;

      // Fragments fall, spin and fade. Gravity is the only force acting.
      if (shards.current.length) {
        shards.current = shards.current.filter((sh) => {
          sh.vy += 150 * dt;
          sh.x += sh.vx * dt;
          sh.y += sh.vy * dt;
          sh.rot += sh.rotV * dt;
          sh.life -= dt * 0.36;
          if (sh.life <= 0) return false;

          ctx.save();
          ctx.translate(sh.x, sh.y);
          ctx.rotate(sh.rot);
          ctx.strokeStyle = `rgba(239, 68, 68, ${sh.life})`;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          sh.pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
          ctx.stroke();
          ctx.restore();
          return true;
        });
      }

      const clips = [];
      const captured = [];
      ctx.beginPath();
      for (let x = 0; x <= travelled; x += 1) {
        const k = (x / wavelength) * Math.PI * 2;
        // Envelope keeps the trace pinned to the axis at both ends.
        const envelope = Math.min(1, x / 14) * Math.min(1, (travelled - x) / 10 + 0.35);
        let y = Math.sin(k - phase) * amplitude * envelope;

        // Second harmonic: a pure sine reads synthetic, mains never is.
        y += Math.sin(k * 2.17 - phase * 1.31) * amplitude * 0.16 * envelope;

        // Past ~70% the supply starts looking distorted: odd harmonics grow
        // in, the way a real circuit near its limit fills with 3rd and 5th.
        if (load > 70) {
          const thd = Math.min(1, (load - 70) / 30);
          y += Math.sin(k * 3 - phase * 3) * amplitude * 0.3 * thd * envelope;
          y += Math.sin(k * 5 - phase * 5) * amplitude * 0.17 * thd * envelope;
        }

        if (state.overloaded) {
          y += hashNoise(x * 0.9, phase * 3) * usable * 0.72;
        }

        // Hard clip against the rails past 90%, with the flat tops a real
        // saturating waveform gets — and a bright artefact at each clip point.
        const ceiling = usable * 0.94;
        let py = mid + y;
        if (load > 90 && Math.abs(y) > ceiling) {
          py = mid + Math.sign(y) * ceiling;
          clips.push([x, py]);
        }
        if (x === 0) ctx.moveTo(x, py);
        else ctx.lineTo(x, py);
        if (x % 4 === 0) captured.push([x, py]);
      }
      lastTrace.current = captured;

      // Bloom underneath, sharp trace on top.
      ctx.strokeStyle = rgba(colour, 0.2);
      ctx.lineWidth = (state.overloaded ? 1.4 : 1.25) + 3.5;
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.strokeStyle = rgba(colour, state.overloaded ? 0.95 : 0.9);
      ctx.lineWidth = state.overloaded ? 1.4 : 1.25;
      ctx.stroke();

      // Clip artefacts
      for (const [cx, cy] of clips) {
        ctx.fillStyle = `rgba(255, 236, 220, ${0.5 + Math.random() * 0.4})`;
        ctx.fillRect(cx - 0.5, cy - 1, 1.5, 2);
      }

      // ── Phosphor fill under the trace ────────────────────────────
      ctx.lineTo(travelled, mid);
      ctx.lineTo(0, mid);
      ctx.closePath();
      ctx.fillStyle = rgba(colour, state.overloaded ? 0.2 : 0.11);
      ctx.fill();

      // ── Playhead at the current load position ────────────────────
      if (progress < 1) {
        ctx.fillStyle = rgba(colour, 0.85);
        ctx.fillRect(Math.round(travelled), 2, 1, height - 4);
      }

      // ── Overload: the whole well flashes ─────────────────────────
      if (state.overloaded) {
        const strobe = reduced ? 0.1 : (Math.sin(phase * 2.4) * 0.5 + 0.5) * 0.16 + 0.05;
        ctx.fillStyle = `rgba(220, 38, 38, ${strobe})`;
        ctx.fillRect(0, 0, width, height);
      }

      if (!reduced) frame = requestAnimationFrame(render);
    };

    if (reduced) {
      render(performance.now());
    } else {
      frame = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [height, reduced]);

  return (
    <div
      ref={wrapRef}
      className={`relative w-full overflow-hidden border bg-surface-subtle shadow-well ${
        overloaded ? 'border-accent-red/40' : 'border-border-subtle'
      } ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
