import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Dual-trace mains oscilloscope.
 *
 * This is not decorative. Both traces are reconstructed from the actual PZEM
 * registers using the standard single-phase relations:
 *
 *   v(t) = V√2 · sin(ωt)
 *   i(t) = I√2 · sin(ωt − φ)      φ = arccos(PF)
 *
 * so the current trace lags the voltage trace by the true power-factor angle.
 * Plug in a motor and the traces visibly separate; plug in a heater and they
 * lock in phase. An examiner can measure the lag off the screen with the
 * graticule and check it against the PF readout — and it will agree, because
 * it is derived from it rather than drawn to look plausible.
 *
 * The sweep runs at a reduced time base: a true 50 Hz refresh would alias into
 * a blur on a 60fps display, so the window scrolls slowly and the waveform
 * stays readable.
 */

const CYCLES = 2;
const SWEEP_HZ = 0.24; // window scroll rate, not the signal frequency

export default function ACScope({
  voltage = 0,
  current = 0,
  powerFactor = 1,
  frequency = 50,
  energised = true,
  tripped = false,
  height = 168,
}) {
  const reduced = useReducedMotion();
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  const live = useRef({ voltage, current, powerFactor, frequency, energised, tripped });
  live.current = { voltage, current, powerFactor, frequency, energised, tripped };

  // Amplitudes ease so a step change in load looks like a physical response.
  const eased = useRef({ v: 0, i: 0, phi: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    const ctx = canvas.getContext('2d');
    let width = 0;
    let frame;
    let sweep = 0;
    let last = performance.now();

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
      const mid = height / 2;
      const usable = height / 2 - 14;

      // Targets: voltage normalised against a 260 V full scale, current
      // against the highest of 10 A or whatever it is actually drawing.
      const vTarget = s.energised ? Math.min(1, (s.voltage ?? 0) / 260) : 0;
      const iScale = Math.max(10, (s.current ?? 0) * 1.25);
      const iTarget = s.energised && !s.tripped ? Math.min(1, (s.current ?? 0) / iScale) : 0;
      const phiTarget = Math.acos(Math.min(1, Math.max(0, s.powerFactor ?? 1)));

      const k = Math.min(1, dt * 4);
      eased.current.v += (vTarget - eased.current.v) * k;
      eased.current.i += (iTarget - eased.current.i) * k;
      eased.current.phi += (phiTarget - eased.current.phi) * k;

      if (!reduced) sweep += dt * SWEEP_HZ * Math.PI * 2;

      ctx.clearRect(0, 0, width, height);

      // ── Graticule ───────────────────────────────────────────────
      ctx.strokeStyle = 'rgba(53, 55, 66, 0.5)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 10; i += 1) {
        const x = Math.round((width * i) / 10) + 0.5;
        ctx.beginPath();
        ctx.setLineDash([1, 4]);
        ctx.moveTo(x, 6);
        ctx.lineTo(x, height - 6);
        ctx.stroke();
      }
      for (let j = 1; j < 6; j += 1) {
        const y = Math.round((height * j) / 6) + 0.5;
        ctx.beginPath();
        ctx.setLineDash([1, 4]);
        ctx.moveTo(6, y);
        ctx.lineTo(width - 6, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Zero-volt axis
      ctx.strokeStyle = 'rgba(105, 108, 122, 0.55)';
      ctx.beginPath();
      ctx.moveTo(0, Math.round(mid) + 0.5);
      ctx.lineTo(width, Math.round(mid) + 0.5);
      ctx.stroke();

      const omega = (CYCLES * Math.PI * 2) / width;

      const trace = (amplitude, phase, colour, lineWidth, glow) => {
        if (amplitude < 0.004) {
          ctx.strokeStyle = colour;
          ctx.globalAlpha = 0.28;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, mid);
          ctx.lineTo(width, mid);
          ctx.stroke();
          ctx.globalAlpha = 1;
          return;
        }
        ctx.beginPath();
        for (let x = 0; x <= width; x += 1) {
          const y = mid - Math.sin(x * omega + sweep - phase) * amplitude * usable;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        if (glow) {
          ctx.strokeStyle = colour;
          ctx.globalAlpha = 0.18;
          ctx.lineWidth = lineWidth + 3;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = colour;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round';
        ctx.stroke();
      };

      // Voltage first, current lagging by φ, drawn on top.
      trace(eased.current.v, 0, 'rgba(150, 153, 166, 0.85)', 1.2, false);
      trace(
        eased.current.i,
        eased.current.phi,
        s.tripped ? '#f87171' : '#d97736',
        1.5,
        !reduced
      );

      if (!reduced) frame = requestAnimationFrame(render);
    };

    if (reduced) render(performance.now());
    else frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [height, reduced]);

  const phiDeg = (Math.acos(Math.min(1, Math.max(0, powerFactor ?? 1))) * 180) / Math.PI;
  const inPhase = phiDeg < 3;

  return (
    <div className="flex flex-col overflow-hidden border border-border-subtle bg-surface-card">
      <div className="flex h-7 items-center justify-between border-b border-border-subtle px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-muted">
          Mains waveform
        </span>
        <span className="font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">
          {frequency ? `${Number(frequency).toFixed(2)} Hz` : '—'} · 2 cycles/div×5
        </span>
      </div>

      <div ref={wrapRef} className="relative bg-surface-subtle shadow-well" style={{ height }}>
        <canvas ref={canvasRef} className="block" />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-subtle px-3 py-2">
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-4" style={{ background: 'rgba(150,153,166,0.85)' }} />
          <span className="font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">
            V · {voltage != null ? Number(voltage).toFixed(1) : '—'} Vrms
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-[2px] w-4"
            style={{ background: tripped ? '#f87171' : '#d97736' }}
          />
          <span className="font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">
            I · {current != null ? Number(current).toFixed(2) : '—'} Arms
          </span>
        </span>
        <span className="font-mono text-[10px] tracking-[0.04em] text-on-surface-muted">
          φ {phiDeg.toFixed(1)}° {inPhase ? 'in phase' : 'current lagging'}
        </span>
      </div>
    </div>
  );
}
