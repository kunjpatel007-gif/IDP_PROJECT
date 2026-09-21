import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Panel from '@/components/Panel';
import StatusOrb from '@/components/StatusOrb';
import SparklineChart from '@/components/SparklineChart';
import { useAnimatedNumber } from '@/hooks/useAnimatedNumber';
import { scaleWatts } from '@/lib/format';

/**
 * Summary bay.
 *
 * Every count is spring-integrated rather than assigned, so the row reads as
 * instrumentation settling rather than text being replaced. The power cell
 * carries a hairline trace welded to its bottom border — the card's own
 * recent history, with no chrome around it.
 */

function Well({ label, address, children, footer, alert = false, className = '' }) {
  return (
    <Panel
      label={label}
      meta={address}
      critical={alert}
      vignette={alert}
      shimmer
      footer={footer}
      className={className}
      bodyClassName="px-3.5 pb-3 pt-4"
    >
      {children}
    </Panel>
  );
}

function Counter({ value, className, pad = 2 }) {
  const animated = useAnimatedNumber(value, { stiffness: 170, damping: 24, precision: 0.02 });
  const rounded = Math.round(animated);

  // Crossing a state boundary rings outward from the numeral.
  const [pulse, setPulse] = useState(false);
  const [ripple, setRipple] = useState(0);
  const prev = useRef(rounded);

  useEffect(() => {
    if (prev.current === rounded) return undefined;
    prev.current = rounded;
    setPulse(true);
    setRipple((r) => r + 1);
    const t = setTimeout(() => setPulse(false), 440);
    return () => clearTimeout(t);
  }, [rounded]);

  return (
    <span className="relative inline-flex">
      {ripple > 0 ? (
        <span
          key={ripple}
          aria-hidden="true"
          className="ripple-expand pointer-events-none absolute inset-0 rounded-full border border-primary/45"
        />
      ) : null}
      <span className={`${className} ${pulse ? 'data-pulse' : ''}`}>
        {String(rounded).padStart(pad, '0')}
      </span>
    </span>
  );
}

export default function StatsRow({ device, powerHistory }) {
  const { online, tripped, offline, unreachable, loading, power, threshold, utilisation, connection } =
    device;

  const animatedPower = useAnimatedNumber(unreachable ? 0 : power, {
    stiffness: 120,
    damping: 21,
    precision: 0.4,
  });
  const scaled = scaleWatts(animatedPower);

  const headroom = Math.max(0, threshold - power);
  const powerTone = tripped
    ? 'text-accent-red'
    : unreachable
      ? 'text-on-surface-subtle'
      : utilisation >= 80
        ? 'text-primary-soft'
        : 'text-primary';

  return (
    <section
      className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
      aria-label="System summary"
    >
      <Well
        label="Line frequency"
        address={
          <span className="hidden font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle sm:inline">
            Hz
          </span>
        }
        className="min-h-[104px]"
      >
        <div className="flex items-baseline gap-1.5">
          <span className={`readout readout-xl font-mono ${unreachable ? 'text-on-surface-subtle' : 'text-on-surface'}`}>
            {device.frequency != null ? device.frequency.toFixed(1) : '—'}
          </span>
          <span className="font-mono text-[12px] text-on-surface-muted">Hz</span>
        </div>
      </Well>

      <Well
        label="Power factor"
        address={<StatusOrb status={loading ? 'loading' : online ? 'online' : 'offline'} size={7} />}
        className="min-h-[104px]"
      >
        <div className="flex items-baseline gap-1.5">
          <span className={`readout readout-xl font-mono ${
            unreachable ? 'text-on-surface-subtle' : device.powerFactor != null && device.powerFactor < 0.85 ? 'text-accent-amber' : 'text-on-surface'
          }`}>
            {device.powerFactor != null ? device.powerFactor.toFixed(2) : '—'}
          </span>
          <span className="font-mono text-[12px] text-on-surface-muted">cos φ</span>
        </div>
      </Well>

      <Well
        label="Current power"
        address={
          <span className="hidden whitespace-nowrap font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle sm:inline">
            {unreachable ? 'no link' : `${Math.round(headroom).toLocaleString('en-US')} W spare`}
          </span>
        }
        className="min-h-[104px]"
        footer={
          <div className="relative -mb-px h-[22px] w-full">
            <SparklineChart
              values={powerHistory}
              color={tripped ? '#ef4444' : '#d97736'}
              height={22}
              dimmed={unreachable}
            />
          </div>
        }
      >
        <div className="flex items-baseline gap-1.5">
          <span className={`readout readout-xl font-mono ${powerTone} ${unreachable ? '' : 'readout-lit'}`}>
            {scaled.value.toLocaleString('en-US', {
              minimumFractionDigits: scaled.decimals,
              maximumFractionDigits: scaled.decimals,
            })}
          </span>
          <span className="font-mono text-[13px] text-on-surface-muted">{scaled.unit}</span>
        </div>
      </Well>

      <Well
        label="Alerts"
        alert={tripped}
        address={<StatusOrb status={tripped ? 'tripped' : 'offline'} size={7} />}
        className="min-h-[104px]"
      >
        <div className="flex items-baseline justify-between gap-2">
          <Counter
            value={tripped ? 1 : 0}
            className={`readout readout-xl font-mono ${
              tripped ? 'text-accent-red readout-lit-critical' : 'text-on-surface'
            }`}
          />
          {tripped ? (
            <motion.span
              initial={{ opacity: 0, x: 6 }}
              animate={{
                opacity: 1,
                x: 0,
                scale: [1, 1.02, 1],
                boxShadow: [
                  '0 0 0 0 rgba(220,38,38,0)',
                  '0 0 14px 2px rgba(220,38,38,0.45)',
                  '0 0 0 0 rgba(220,38,38,0)',
                ],
              }}
              transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
              className="rounded bg-accent-red-bg px-2 py-0.5 font-mono text-[11px] text-accent-red"
            >
              breaker open
            </motion.span>
          ) : null}
        </div>
      </Well>
    </section>
  );
}
