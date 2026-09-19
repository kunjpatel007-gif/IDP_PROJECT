import { motion } from 'framer-motion';
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
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded border bg-surface-card ${
        alert ? 'border-accent-red/35' : 'border-border-subtle'
      } ${className}`}
    >
      {alert ? (
        <div
          className="alert-vignette pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 90% 120% at 50% 100%, rgba(220,38,38,0.16) 0%, transparent 70%)',
          }}
          aria-hidden="true"
        />
      ) : null}

      <div className="relative flex h-7 items-center justify-between border-b border-border-subtle px-3.5">
        <span className="truncate whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.05em] text-on-surface-muted sm:text-[11px]">
          {label}
        </span>
        <span className="flex shrink-0 items-center">{address}</span>
      </div>

      <div className="relative flex flex-1 flex-col justify-end px-3.5 pb-3 pt-4">{children}</div>
      {footer}
    </div>
  );
}

function Counter({ value, className, pad = 2 }) {
  const animated = useAnimatedNumber(value, { stiffness: 170, damping: 24, precision: 0.02 });
  const rounded = Math.round(animated);
  return <span className={className}>{String(rounded).padStart(pad, '0')}</span>;
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
        label="Devices"
        address={
          <span className="hidden font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle sm:inline">
            bench
          </span>
        }
        className="min-h-[104px]"
      >
        <div className="flex items-baseline gap-2">
          <Counter value={1} className="font-mono text-[26px] font-medium tracking-tight text-on-surface sm:text-[30px]" />
          <span className="font-mono text-[11px] text-on-surface-subtle">provisioned</span>
        </div>
      </Well>

      <Well
        label="Online"
        address={<StatusOrb status={loading ? 'loading' : online ? 'online' : 'offline'} size={7} />}
        className="min-h-[104px]"
      >
        <div className="flex items-baseline gap-2">
          <Counter
            value={online ? 1 : 0}
            className={`font-mono text-[26px] font-medium tracking-tight sm:text-[30px] ${
              online ? 'text-on-surface' : 'text-on-surface-subtle'
            }`}
          />
          <span className="font-mono text-[11px] text-on-surface-subtle">
            {connection === 'error' ? 'link down' : online ? 'reporting' : 'silent'}
          </span>
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
              color={tripped ? '#f87171' : '#d97736'}
              height={22}
              dimmed={unreachable}
            />
          </div>
        }
      >
        <div className="flex items-baseline gap-1.5">
          <span className={`font-mono text-[26px] font-medium tracking-tight sm:text-[30px] ${powerTone}`}>
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
            className={`font-mono text-[26px] font-medium tracking-tight sm:text-[30px] ${
              tripped ? 'text-accent-red' : 'text-on-surface'
            }`}
          />
          {tripped ? (
            <motion.span
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded bg-accent-red-bg px-2 py-0.5 font-mono text-[11px] text-accent-red"
            >
              breaker open
            </motion.span>
          ) : (
            <span className="font-mono text-[11px] text-on-surface-subtle">clear</span>
          )}
        </div>
      </Well>
    </section>
  );
}
