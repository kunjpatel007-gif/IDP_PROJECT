import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Rolling trace of the last N readings. Hand-rolled SVG — no chart library.
 *
 * New samples enter at the right and the whole trace slides left by exactly
 * one sample width, which is what makes it read as a strip-chart recorder
 * rather than a graph that redraws itself.
 *
 * The vertical band is padded relative to the mean, so a rail sitting at a
 * steady 230.4 V draws a flat line instead of magnifying quantisation noise
 * into a mountain range.
 */

function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      setWidth(Math.max(0, Math.round(w)));
    });
    observer.observe(node);
    setWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

export default function SparklineChart({
  values = [],
  color = '#d97736',
  height = 26,
  capacity = 20,
  flatTolerance = 0.01,
  dimmed = false,
  className = '',
  scaleMax = null,
  tooltip = false,
  unit = '',
  decimals = 2,
}) {
  const [hover, setHover] = useState(null);
  const reduced = useReducedMotion();
  const [wrapRef, width] = useElementWidth();
  const [entering, setEntering] = useState(false);
  const prevValues = useRef(values);

  useLayoutEffect(() => {
    if (prevValues.current === values) return undefined;
    prevValues.current = values;
    if (reduced) return undefined;

    setEntering(true);
    let inner;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntering(false));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [values, reduced]);

  // Colour tracks the reading against its own headroom: calm green through
  // amber to red as the trace approaches the limit it is measured against.
  const latest = values.length ? values[values.length - 1] : 0;
  const ratio = scaleMax ? Math.min(1, Math.max(0, latest / scaleMax)) : null;
  const dynamicColor =
    ratio == null
      ? color
      : ratio < 0.5
        ? '#22c55e'
        : ratio < 0.8
          ? '#d97736'
          : '#ef4444';
  const stroke = dynamicColor;

  const step = width > 0 ? width / Math.max(1, capacity - 1) : 0;
  const pad = 3;
  const plotHeight = height - pad * 2;

  if (width === 0 || values.length === 0) {
    return <div ref={wrapRef} className={className} style={{ height }} aria-hidden="true" />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  // Keep genuinely steady signals visually steady.
  const floorRange = Math.max(Math.abs(mean) * flatTolerance, 0.05);
  const range = Math.max(max - min, floorRange);
  const mid = (max + min) / 2;
  const low = mid - range / 2;

  const toY = (v) => pad + plotHeight - ((v - low) / range) * plotHeight;

  // Right-align the trace so the newest sample always sits on the right edge.
  const offset = width - (values.length - 1) * step;
  const points = values.map((v, i) => [offset + i * step, toY(v)]);

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${width},${height} L${points[0][0].toFixed(2)},${height} Z`;

  const [lastX, lastY] = points[points.length - 1];
  const gradientId = `spark-${stroke.replace('#', '')}-${Math.round(height)}-${capacity}`;

  const onMove = (event) => {
    if (!tooltip) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    let nearest = 0;
    let best = Infinity;
    points.forEach(([px], i) => {
      const d = Math.abs(px - x);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHover(nearest);
  };

  return (
    <div
      ref={wrapRef}
      className={`relative w-full ${className}`}
      style={{ height }}
      aria-hidden="true"
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      {/* Readout follows the pointer; pointer-only, so touch is unaffected. */}
      {tooltip && hover != null && points[hover] ? (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap border border-border-muted bg-surface-subtle px-1.5 py-0.5 font-mono text-[9px] text-on-surface shadow-flyout"
          style={{ left: points[hover][0], top: -4 }}
        >
          {values[hover].toFixed(decimals)}
          {unit}
        </div>
      ) : null}
      <svg width={width} height={height} className="block overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={dimmed ? 0.14 : 0.3} />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        <g
          style={{
            transform: entering ? `translateX(${step}px)` : 'translateX(0px)',
            transition: entering ? 'none' : 'transform 460ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke={stroke}
            strokeOpacity={dimmed ? 0.4 : 0.95}
            strokeWidth="1.25"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Live head: the sample that just landed. */}
          <circle cx={lastX} cy={lastY} r="2.4" fill={stroke} fillOpacity={dimmed ? 0.5 : 1} />
          {!dimmed && !reduced ? (
            <circle cx={lastX} cy={lastY} r="2.4" fill="none" stroke={stroke} strokeWidth="1">
              <animate attributeName="r" values="2.4;7;2.4" dur="1.9s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.7;0;0.7" dur="1.9s" repeatCount="indefinite" />
            </circle>
          ) : null}
          {tooltip && hover != null && points[hover] ? (
            <g>
              <line
                x1={points[hover][0]}
                y1={0}
                x2={points[hover][0]}
                y2={height}
                stroke={stroke}
                strokeOpacity="0.45"
                strokeWidth="1"
              />
              <circle cx={points[hover][0]} cy={points[hover][1]} r="2.6" fill={stroke} />
            </g>
          ) : null}
        </g>
      </svg>
    </div>
  );
}
