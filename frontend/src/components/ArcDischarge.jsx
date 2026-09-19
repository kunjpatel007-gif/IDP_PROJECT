import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Dielectric breakdown, generated rather than drawn.
 *
 * Each bolt is built by recursive midpoint displacement: take the segment
 * between two electrodes, push its midpoint sideways by a random offset,
 * recurse into both halves with the offset halved. Seven levels gives 128
 * segments of convincing fractal jitter. At each level there is a chance the
 * path forks, and the fork inherits the parent's direction with a bias — that
 * is what produces the branching that makes an arc read as an arc rather than
 * a jagged line.
 *
 * Every bolt lives about 90ms and is then rebuilt from scratch, so the
 * discharge never repeats a shape. Three passes per bolt — a wide dim corona,
 * a mid glow, then a near-white core — do the work a blur filter would, at a
 * fraction of the cost.
 */

const DEPTH = 7;
const LIFE_MS = 90;

function displace(x1, y1, x2, y2, offset, depth, out, branches) {
  if (depth === 0) {
    out.push([x1, y1, x2, y2]);
    return;
  }

  let mx = (x1 + x2) / 2;
  let my = (y1 + y2) / 2;

  // Displace perpendicular to the segment, not along an axis.
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const push = (Math.random() - 0.5) * offset;
  mx += nx * push;
  my += ny * push;

  if (depth > 2 && Math.random() < 0.28) {
    const bl = 0.45 + Math.random() * 0.45;
    const angle = (Math.random() - 0.5) * 1.1;
    const bx = mx + (dx * bl * Math.cos(angle) - dy * bl * Math.sin(angle)) * 0.5;
    const by = my + (dx * bl * Math.sin(angle) + dy * bl * Math.cos(angle)) * 0.5;
    branches.push([mx, my, bx, by, offset * 0.55, depth - 2]);
  }

  displace(x1, y1, mx, my, offset / 2, depth - 1, out, branches);
  displace(mx, my, x2, y2, offset / 2, depth - 1, out, branches);
}

function buildBolt(x1, y1, x2, y2, offset) {
  const segments = [];
  const branches = [];
  displace(x1, y1, x2, y2, offset, DEPTH, segments, branches);

  // Resolve forks one generation deep — enough to look organic, bounded cost.
  for (const [bx1, by1, bx2, by2, boff, bdepth] of branches) {
    displace(bx1, by1, bx2, by2, boff, Math.max(1, bdepth), segments, []);
  }
  return segments;
}

export default function ArcDischarge({ active = false, intensity = 1 }) {
  const reduced = useReducedMotion();
  const canvasRef = useRef(null);
  const state = useRef({ bolts: [], nextAt: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active || reduced) return undefined;

    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    let frame;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const regenerate = (now) => {
      const count = 2 + Math.floor(Math.random() * 3);
      const bolts = [];
      for (let i = 0; i < count; i += 1) {
        // Strike between opposite edges, passing through the middle third.
        const vertical = Math.random() > 0.45;
        const x1 = vertical ? Math.random() * w : -30;
        const y1 = vertical ? -30 : Math.random() * h;
        const x2 = vertical ? Math.random() * w : w + 30;
        const y2 = vertical ? h + 30 : Math.random() * h;
        bolts.push({
          segments: buildBolt(x1, y1, x2, y2, (vertical ? w : h) * 0.42 * intensity),
          born: now,
        });
      }
      state.current.bolts = bolts;
      state.current.nextAt = now + LIFE_MS + Math.random() * 70;
    };

    const render = (now) => {
      ctx.clearRect(0, 0, w, h);

      if (now >= state.current.nextAt) regenerate(now);

      for (const bolt of state.current.bolts) {
        const age = (now - bolt.born) / LIFE_MS;
        if (age > 1) continue;
        const fade = 1 - age * age;

        const passes = [
          { width: 9, colour: `rgba(220, 38, 38, ${0.16 * fade})` },
          { width: 3.5, colour: `rgba(248, 150, 120, ${0.4 * fade})` },
          { width: 1.1, colour: `rgba(255, 240, 230, ${0.95 * fade})` },
        ];

        for (const pass of passes) {
          ctx.strokeStyle = pass.colour;
          ctx.lineWidth = pass.width;
          ctx.lineCap = 'round';
          ctx.beginPath();
          for (const [sx, sy, ex, ey] of bolt.segments) {
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
          }
          ctx.stroke();
        }
      }

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      state.current.bolts = [];
    };
  }, [active, reduced, intensity]);

  if (!active || reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[92] block"
      aria-hidden="true"
    />
  );
}
