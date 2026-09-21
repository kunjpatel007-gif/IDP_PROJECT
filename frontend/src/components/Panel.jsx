import HoverPanel from '@/components/HoverPanel';

/**
 * The panel primitive.
 *
 * Before this existed, three of the four tabs were hand-written copies of the
 * same twenty lines of markup — which meant they drifted, and worse, none of
 * them picked up the tilt and pointer-lamp treatment the Overview cards had.
 * Half the console read as instrumentation and half read as a settings page.
 *
 * One component now, so every surface in the build is the same physical
 * object: a machined face with a bevel, a recessed header strip, an optional
 * accent rail down the left edge, and registration brackets at the corners
 * when it is carrying the primary reading on a screen.
 */

const ACCENT = {
  amber: 'rgba(217, 119, 54, 0.55)',
  green: '#22c55e',
  red: '#ef4444',
  grey: 'rgba(110, 116, 132, 0.45)',
};

const GLOW = {
  amber: '217, 119, 54',
  green: '34, 197, 94',
  red: '239, 68, 68',
  grey: '157, 162, 175',
};

export function Panel({
  label,
  meta,
  accent = null,
  hero = false,
  critical = false,
  children,
  footer,
  shimmer = false,
  vignette = false,
  className = '',
  bodyClassName = 'px-3.5 py-4',
}) {
  const key = critical ? 'red' : (accent ?? 'amber');

  return (
    <HoverPanel
      tilt={hero ? 3 : 4.5}
      glowColor={GLOW[key] ?? GLOW.amber}
      glowSize={hero ? 380 : 230}
      className={`panel ${hero ? 'panel-hero' : ''} ${
        hero && critical ? 'panel-hero-critical' : ''
      } flex flex-col overflow-hidden border bg-surface-card ${
        critical ? 'border-accent-red/35' : 'border-border-subtle'
      } ${hero ? 'shadow-chassis' : ''} ${className}`}
    >
      {accent || critical ? (
        <span
          className="panel-accent"
          style={{ background: critical ? ACCENT.red : ACCENT[accent] }}
          aria-hidden="true"
        />
      ) : null}

      {vignette ? (
        <div
          className="alert-vignette pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 90% 120% at 50% 100%, rgba(220,38,38,0.16) 0%, transparent 70%)',
          }}
          aria-hidden="true"
        />
      ) : null}

      {label ? (
        <div
          className={`panel-head border-b border-border-subtle ${shimmer ? 'holo-shimmer' : ''}`}
        >
          <span className="panel-label truncate text-on-surface-muted">{label}</span>
          {meta ? <span className="flex shrink-0 items-center gap-2">{meta}</span> : null}
        </div>
      ) : null}

      <div className={`relative flex flex-1 flex-col justify-end ${bodyClassName}`}>{children}</div>
      {footer}
    </HoverPanel>
  );
}

/**
 * A figure and the unit that qualifies it.
 *
 * The unit is always a separate span at 0.44em — merging it into the numeral
 * is what makes a readout look like body copy. `lit` puts a soft bloom behind
 * live figures so they read as illuminated; a stale or absent reading gets
 * none, which is a second channel of the same information the colour carries.
 */
export function Readout({
  value,
  unit,
  caption,
  size = 'lg',
  tone = 'text-on-surface',
  lit = false,
  critical = false,
  layout = 'stack',
  className = '',
}) {
  return (
    <div className={`${layout === 'spread' ? 'flex flex-col sm:flex-row sm:items-baseline sm:justify-between w-full' : ''} ${className}`}>
      <p
        className={`readout readout-${size} font-mono ${tone} ${
          lit ? (critical ? 'readout-lit-critical' : 'readout-lit') : ''
        }`}
      >
        {value}
        {unit ? <span className="readout-unit text-on-surface-muted">{unit}</span> : null}
      </p>
      {caption ? (
        <p className={`panel-caption font-mono text-on-surface-subtle ${layout === 'spread' ? 'mt-1 sm:mt-0 sm:text-right' : 'mt-2'}`}>
          {caption}
        </p>
      ) : null}
    </div>
  );
}

/** Header-strip state pip, sized to sit inside a 28px rule without crowding. */
export function PanelState({ ok, okLabel = 'NOMINAL', faultLabel = 'FAULT' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.05em] ${
        ok ? 'text-accent-green' : 'text-accent-red'
      }`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          ok ? 'bg-accent-green' : 'bg-accent-red'
        }`}
      />
      {ok ? okLabel : faultLabel}
    </span>
  );
}

export default Panel;
