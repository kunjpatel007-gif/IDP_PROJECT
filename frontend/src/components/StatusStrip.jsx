import { DASH, fmt, fmtClock, fmtSilence } from '@/lib/format';
import StatusOrb from '@/components/StatusOrb';

/**
 * Rack status ribbon.
 *
 * The strip along the top of an instrument bay that tells you what is mounted
 * and whether it is talking, before you read a single measurement. Strictly
 * rectilinear — zero radius, 1px hairline partitions between cells, labels in
 * uppercase tracking over tabular values, per the status-strip rule in the
 * design system.
 *
 * Everything here is identity and link state. No measurements: those belong on
 * the instrument faces, and repeating them would make the strip another card.
 */

function Cell({ label, children, className = '' }) {
  return (
    <div
      className={`flex min-w-0 flex-col justify-center gap-0.5 border-r border-border-subtle px-3.5 py-2 last:border-r-0 ${className}`}
    >
      <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.08em] text-on-surface-subtle">
        {label}
      </span>
      <span className="truncate font-mono text-[12px] leading-[15px] text-on-surface">
        {children}
      </span>
    </div>
  );
}

const LINK = {
  live: { orb: 'online', text: 'Subscribed', tone: 'text-accent-green' },
  connecting: { orb: 'loading', text: 'Opening', tone: 'text-on-surface-muted' },
  empty: { orb: 'caution', text: 'No data', tone: 'text-accent-amber' },
  error: { orb: 'tripped', text: 'Fault', tone: 'text-accent-red' },
};

export default function StatusStrip({ device }) {
  const {
    deviceId,
    fwVersion,
    connection,
    frequency,
    voltage,
    lastSeenMs,
    silentFor,
    unreachable,
    threshold,
  } = device;

  const link = LINK[connection] ?? LINK.connecting;

  return (
    <section
      className="mb-6 flex flex-wrap items-stretch border border-border-subtle bg-surface-subtle shadow-well"
      aria-label="Bay status"
    >
      <Cell label="Node">{deviceId ?? DASH}</Cell>
      <Cell label="Sensor">PZEM-004T</Cell>
      <Cell label="Firmware">{fwVersion ?? DASH}</Cell>

      <div className="flex min-w-0 flex-col justify-center gap-0.5 border-r border-border-subtle px-3.5 py-2">
        <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.08em] text-on-surface-subtle">
          Channel
        </span>
        <span className={`flex items-center gap-2 font-mono text-[12px] leading-[15px] ${link.tone}`}>
          <StatusOrb status={link.orb} size={6} />
          {link.text}
        </span>
      </div>

      <Cell label="Rail">
        {unreachable || voltage == null ? DASH : `${fmt(voltage, 1)} V`}
      </Cell>
      <Cell label="Line">
        {unreachable || frequency == null ? DASH : `${fmt(frequency, 2)} Hz`}
      </Cell>
      <Cell label="Trip set">{fmt(threshold)} W</Cell>

      <Cell label="Last packet" className="flex-1">
        <span className={unreachable ? 'text-accent-red' : undefined}>
          {fmtClock(lastSeenMs)}
          <span className="ml-2 text-on-surface-subtle">{fmtSilence(silentFor)}</span>
        </span>
      </Cell>
    </section>
  );
}
