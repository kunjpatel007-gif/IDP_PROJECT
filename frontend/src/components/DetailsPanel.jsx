import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SparklineChart from '@/components/SparklineChart';
import { useSparkline } from '@/hooks/useSparkline';
import PowerFactorGauge from '@/components/PowerFactorGauge';
import { IconClose } from '@/components/Icons';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DASH, fmt, fmtClock, fmtHeap, fmtSilence, rssiQuality } from '@/lib/format';
import { NOMINAL_FREQUENCY } from '@/lib/nominal';

/**
 * Extended telemetry.
 *
 * Everything the ESP32 sends that does not belong on the face of the card:
 * the register map, the radio link, and the heap. Frequency is shown against
 * its 50.00 Hz nominal rather than alone, because the deviation is the
 * interesting part and the absolute value almost never is.
 */

/** Flashes amber for a beat whenever the register behind it changes. */
function useChangeFlash(value) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return undefined;
    prev.current = value;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 420);
    return () => clearTimeout(t);
  }, [value]);
  return flash;
}

function Row({ label, value, tone = 'text-on-surface', hint, index = 0, trend, trendColor }) {
  const flash = useChangeFlash(typeof value === 'string' || typeof value === 'number' ? value : null);
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 + index * 0.035, duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-baseline justify-between gap-3 border-b border-border-subtle/50 py-2"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-on-surface-subtle">
        {label}
      </span>
      <span className="flex items-baseline gap-2 text-right">
        {trend && trend.length > 1 ? (
          <span className="hidden h-[14px] w-[52px] self-center sm:block">
            <SparklineChart values={trend} color={trendColor ?? '#9da2af'} height={14} capacity={10} />
          </span>
        ) : null}
        <span className={`font-mono text-[12px] font-medium ${flash ? 'data-pulse' : ''} ${tone}`}>
          {value}
        </span>
        {hint ? <span className="font-mono text-[10px] text-on-surface-subtle">{hint}</span> : null}
      </span>
    </motion.div>
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

export default function DetailsPanel({ device, voltageHistory = [], currentHistory = [] }) {
  const reduced = useReducedMotion();

  // Radio and heap get their own short windows — they are not on the card face.
  const rssiHistory = useSparkline(device.rssi, device.seq, 10);
  const heapHistory = useSparkline(device.freeHeap, device.seq, 10);

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
  const freqDelta = frequency != null ? Number(frequency) - NOMINAL_FREQUENCY : null;
  const freqTone =
    freqDelta == null
      ? 'text-on-surface-subtle'
      : Math.abs(freqDelta) > 0.5
        ? 'text-accent-red'
        : Math.abs(freqDelta) > 0.2
          ? 'text-primary-soft'
          : 'text-on-surface';

  return (
    <article className="overflow-hidden">
      <div className="flex h-9 items-center justify-between border-b border-border-subtle px-4">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-[13px] font-semibold tracking-tight text-on-surface">
            Extended telemetry
          </h3>
          <span className="font-mono text-[10px] tracking-[0.05em] text-on-surface-subtle">
            {deviceId}
          </span>
        </div>
      </div>

      <div className="grid gap-x-6 gap-y-1 p-4 md:grid-cols-[minmax(0,200px)_1fr]">
        <div className="pb-2 md:pb-0">
          <PowerFactorGauge value={offline ? null : powerFactor} dimmed={offline} />
        </div>

            <div className="grid gap-x-6 sm:grid-cols-2">
              <Row
                index={0}
                label="Energy"
                value={fmt(energy, 2)}
                hint="kWh"
                tone={offline ? 'text-on-surface-muted' : 'text-on-surface'}
              />
              <Row
                index={1}
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
                index={2}
                label="Radio"
                value={
                  <span className="inline-flex items-center gap-2">
                    <SignalBars bars={signal.bars} />
                    {rssi != null ? `${rssi}` : DASH}
                  </span>
                }
                hint={rssi != null ? `dBm · ${signal.label}` : 'dBm'}
                trend={rssiHistory}
              />
              <Row label="Free heap" value={fmtHeap(freeHeap)} trend={heapHistory} />
              <Row label="Firmware" value={fwVersion ?? DASH} />
              <Row label="Packet" value={seq != null ? String(seq).padStart(4, '0') : DASH} />
              <Row
                index={3}
                label="Last seen"
                value={fmtClock(lastSeenMs)}
                hint={fmtSilence(silentFor)}
                tone={offline ? 'text-accent-red' : 'text-on-surface'}
              />
            </div>
          </div>
    </article>
  );
}
