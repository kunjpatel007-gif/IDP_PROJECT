import { AnimatePresence, motion } from 'framer-motion';
import PowerFactorGauge from '@/components/PowerFactorGauge';
import { IconClose } from '@/components/Icons';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DASH, fmt, fmtClock, fmtHeap, fmtSilence, rssiQuality } from '@/lib/format';

/**
 * Extended telemetry.
 *
 * Everything the ESP32 sends that does not belong on the face of the card:
 * the register map, the radio link, and the heap. Frequency is shown against
 * its 50.00 Hz nominal rather than alone, because the deviation is the
 * interesting part and the absolute value almost never is.
 */

function Row({ label, value, tone = 'text-on-surface', hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle/50 py-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-on-surface-subtle">
        {label}
      </span>
      <span className="flex items-baseline gap-1.5 text-right">
        <span className={`font-mono text-[12px] font-medium ${tone}`}>{value}</span>
        {hint ? <span className="font-mono text-[10px] text-on-surface-subtle">{hint}</span> : null}
      </span>
    </div>
  );
}

function SignalBars({ bars }) {
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden="true">
      {[1, 2, 3, 4].map((level) => (
        <span
          key={level}
          className={`w-[3px] ${level <= bars ? 'bg-on-surface-muted' : 'bg-border-muted'}`}
          style={{ height: 3 + level * 2 }}
        />
      ))}
    </span>
  );
}

export default function DetailsPanel({ open, onClose, device }) {
  const reduced = useReducedMotion();

  const {
    energy,
    frequency,
    powerFactor,
    threshold,
    rssi,
    freeHeap,
    fwVersion,
    seq,
    lastSeenMs,
    silentFor,
    offline,
    deviceId,
  } = device;

  const signal = rssiQuality(rssi);
  const freqDelta = frequency != null ? Number(frequency) - 50 : null;
  const freqTone =
    freqDelta == null
      ? 'text-on-surface-subtle'
      : Math.abs(freqDelta) > 0.5
        ? 'text-accent-red'
        : Math.abs(freqDelta) > 0.2
          ? 'text-primary-soft'
          : 'text-on-surface';

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.article
          key="details"
          initial={reduced ? { opacity: 1 } : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden rounded border border-border-subtle bg-surface-card"
        >
          <div className="flex h-9 items-center justify-between border-b border-border-subtle px-4">
            <div className="flex items-baseline gap-2">
              <h3 className="font-display text-[13px] font-semibold tracking-tight text-on-surface">
                Extended telemetry
              </h3>
              <span className="font-mono text-[10px] tracking-[0.05em] text-on-surface-subtle">
                {deviceId}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close extended telemetry"
              className="text-on-surface-subtle transition-colors hover:text-on-surface"
            >
              <IconClose width={15} height={15} />
            </button>
          </div>

          <div className="grid gap-x-6 gap-y-1 p-4 md:grid-cols-[minmax(0,200px)_1fr]">
            <div className="pb-2 md:pb-0">
              <PowerFactorGauge value={offline ? null : powerFactor} dimmed={offline} />
            </div>

            <div className="grid gap-x-6 sm:grid-cols-2">
              <Row
                label="Energy"
                value={fmt(energy, 2)}
                hint="kWh"
                tone={offline ? 'text-on-surface-muted' : 'text-on-surface'}
              />
              <Row
                label="Frequency"
                value={frequency != null ? fmt(frequency, 2) : DASH}
                hint={
                  freqDelta == null
                    ? 'Hz'
                    : `Hz · ${freqDelta >= 0 ? '+' : '−'}${Math.abs(freqDelta).toFixed(2)}`
                }
                tone={freqTone}
              />
              <Row label="Trip threshold" value={fmt(threshold)} hint="W" />
              <Row
                label="Radio"
                value={
                  <span className="inline-flex items-center gap-2">
                    <SignalBars bars={signal.bars} />
                    {rssi != null ? `${rssi}` : DASH}
                  </span>
                }
                hint={rssi != null ? `dBm · ${signal.label}` : 'dBm'}
              />
              <Row label="Free heap" value={fmtHeap(freeHeap)} />
              <Row label="Firmware" value={fwVersion ?? DASH} />
              <Row label="Packet" value={seq != null ? String(seq).padStart(4, '0') : DASH} />
              <Row
                label="Last seen"
                value={fmtClock(lastSeenMs)}
                hint={fmtSilence(silentFor)}
                tone={offline ? 'text-accent-red' : 'text-on-surface'}
              />
            </div>
          </div>
        </motion.article>
      ) : null}
    </AnimatePresence>
  );
}
