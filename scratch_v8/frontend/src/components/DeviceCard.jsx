import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ACScope from '@/components/ACScope';
import ControlButton from '@/components/ControlButton';
import HoverPanel from '@/components/HoverPanel';
import DetailsPanel from '@/components/DetailsPanel';
import PhasorDiagram from '@/components/PhasorDiagram';
import PowerFlowRibbon from '@/components/PowerFlowRibbon';
import PowerMeter from '@/components/PowerMeter';
import SparklineChart from '@/components/SparklineChart';
import StatusOrb from '@/components/StatusOrb';
import TripCurve from '@/components/TripCurve';
import WaveformBar from '@/components/WaveformBar';
import { IconChevron } from '@/components/Icons';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DASH, fmt } from '@/lib/format';

/**
 * The adapter.
 *
 * On first data the card runs a hardware boot: a CRT line sweeps the chassis
 * top to bottom while each row clips into view behind it, then the odometer
 * rolls up from zero. After that the card never re-runs it — a boot sequence
 * that replays on every packet would be noise, not information.
 */

const BOOT_MS = 1350;

const chassis = {
  hidden: {},
  show: { transition: { staggerChildren: 0.085, delayChildren: 0.05 } },
};

const strip = {
  hidden: { opacity: 0, y: 3, clipPath: 'inset(0% 0% 100% 0%)' },
  show: {
    opacity: 1,
    y: 0,
    clipPath: 'inset(0% 0% 0% 0%)',
    transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
  },
};

const STATUS_BADGE = {
  online: {
    label: 'Online',
    wrap: 'border-accent-green/25 bg-[#132018] text-accent-green',
  },
  tripped: {
    label: 'Tripped',
    wrap: 'border-accent-red/35 bg-accent-red-bg text-accent-red',
  },
  offline: {
    label: 'Offline',
    wrap: 'border-border-subtle bg-surface-subtle text-on-surface-muted',
  },
  loading: {
    label: 'Linking…',
    wrap: 'border-border-subtle bg-surface-subtle text-on-surface-subtle',
  },
};

/** Recessed track with a mechanical rocker. No pill, no bubble. */
function RelayRocker({ on, offline }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-flex h-[18px] w-[34px] items-center border border-border-muted bg-surface px-[2px] shadow-well">
        <motion.span
          className="h-[12px] w-[14px]"
          animate={{
            x: on ? 14 : 0,
            backgroundColor: offline ? '#3a3d48' : on ? '#d97736' : '#2e313a',
          }}
          /* Underdamped on purpose: a rocker overshoots its detent and
             settles back in two or three diminishing bounces. */
          transition={{ type: 'spring', stiffness: 900, damping: 11, mass: 0.55 }}
        />
      </span>
      <span
        className={`font-mono text-[12px] font-semibold ${
          offline ? 'text-on-surface-subtle' : on ? 'text-accent-green' : 'text-on-surface-muted'
        }`}
      >
        {offline ? 'UNKNOWN' : on ? 'CLOSED' : 'OPEN'}
      </span>
    </span>
  );
}

function MetricWell({ label, value, unit, history, colour, tone, dimmed, scaleMax, tooltip, unitLabel }) {
  return (
    <HoverPanel tilt={0} lift={false} glowSize={200} className="flex flex-col overflow-hidden border border-border-subtle bg-surface-well shadow-well">
      <div className="flex items-baseline justify-between px-3 pt-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-on-surface-subtle">
          {label}
        </span>
        <span className="flex items-baseline gap-1">
          <span className={`font-mono text-[15px] font-medium ${tone}`}>{value}</span>
          <span className="font-mono text-[11px] text-on-surface-subtle">{unit}</span>
        </span>
      </div>
      <div className="mt-1.5 h-[26px]">
        <SparklineChart
          values={history}
          color={colour}
          height={26}
          dimmed={dimmed}
          scaleMax={scaleMax}
          tooltip={tooltip}
          unit={unitLabel}
        />
      </div>
    </HoverPanel>
  );
}

export default function DeviceCard({
  device,
  voltageHistory,
  currentHistory,
  onCommand,
  commandInFlight,
}) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState('idle'); // idle | booting | live
  const [detailsOpen, setDetailsOpen] = useState(false);

  const {
    status,
    loading,
    offline,
    unreachable,
    staleTripped,
    tripped,
    online,
    deviceName,
    deviceId,
    power,
    displayPower,
    voltage,
    current,
    threshold,
    utilisation,
    utilisationClamped,
    overloaded,
    relayOn,
    powerFactor,
    frequency,
  } = device;

  useEffect(() => {
    if (loading || phase !== 'idle') return undefined;
    if (reduced) {
      setPhase('live');
      return undefined;
    }
    setPhase('booting');
    const timer = setTimeout(() => setPhase('live'), BOOT_MS);
    return () => clearTimeout(timer);
  }, [loading, phase, reduced]);

  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.loading;
  const booted = phase !== 'idle';

  const powerTone = tripped ? 'critical' : offline ? 'muted' : 'normal';
  const currentTone = unreachable
    ? 'text-on-surface-subtle'
    : tripped
      ? 'text-accent-red'
      : 'text-on-surface';

  // Which command the one dynamic actuator carries right now.
  const command = tripped ? 'RESET' : relayOn ? 'OFF' : 'ON';

  const utilPct = Math.round(utilisation);
  const utilTone = overloaded || tripped ? 'text-accent-red' : offline ? 'text-on-surface-subtle' : 'text-on-surface-muted';

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
      {/* Breathing glow, sized to the card but outside its overflow clip. */}
      {!reduced ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded"
          animate={{
            boxShadow: tripped
              ? [
                  '0 0 0 0 rgba(220,38,38,0)',
                  '0 0 26px 2px rgba(220,38,38,0.32)',
                  '0 0 0 0 rgba(220,38,38,0)',
                ]
              : [
                  '0 0 0 0 rgba(217,119,54,0)',
                  `0 0 ${14 + utilisationClamped * 0.22}px 0 rgba(217,119,54,${
                    0.05 + (utilisationClamped / 100) * 0.22
                  })`,
                  '0 0 0 0 rgba(217,119,54,0)',
                ],
          }}
          transition={{ duration: tripped ? 1.5 : 4.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : null}

      <motion.article
        variants={chassis}
        initial="hidden"
        animate={booted ? 'show' : 'hidden'}
        className={`relative overflow-hidden rounded border bg-surface-card transition-colors ${
          tripped
            ? 'border-accent-red/35'
            : unreachable
              ? 'border-border-subtle opacity-90 saturate-[0.35]'
              : 'border-border-subtle hover:border-border-muted'
        }`}
      >
        {/* Trip rail */}
        <AnimatePresence>
          {tripped ? (
            <motion.div
              key="rail"
              className="absolute inset-x-0 top-0 z-10 h-[2px] origin-left bg-accent-red"
              initial={reduced ? { scaleX: 1 } : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            />
          ) : null}
        </AnimatePresence>

        {/* Sensor grain on the panel face */}
        {!reduced ? (
          <div
            className="pointer-events-none absolute inset-0 z-[1] opacity-[0.045] mix-blend-screen"
            style={{
              backgroundImage:
                'repeating-conic-gradient(rgba(255,255,255,0.7) 0% 25%, transparent 0% 50%)',
              backgroundSize: '3px 3px',
              animation: 'static-noise 900ms steps(4, end) infinite',
            }}
          />
        ) : null}

        {/* Signal loss: the panel stops being a live picture */}
        {unreachable && !reduced ? (
          <div
            className="pointer-events-none absolute inset-0 z-[2] opacity-40"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to bottom, rgba(150,153,166,0.09) 0px, rgba(150,153,166,0.09) 1px, transparent 1px, transparent 4px)',
            }}
          />
        ) : null}

        {/* CRT boot sweep */}
        {phase === 'booting' && !reduced ? (
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
            <div
              className="crt-sweep absolute inset-x-0 h-[36%]"
              style={{
                background:
                  'linear-gradient(to bottom, transparent 0%, rgba(217,119,54,0.05) 60%, rgba(217,119,54,0.22) 96%, rgba(255,182,140,0.9) 100%)',
              }}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-5 p-5 sm:p-6">
          {/* ── Identity ─────────────────────────────────────────── */}
          <motion.div variants={strip} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-display text-[16px] font-semibold tracking-tight text-on-surface">
                {deviceName}
              </h3>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              {staleTripped ? (
                <span className="rounded border border-border-muted bg-surface-subtle px-2 py-1 font-mono text-[10px] uppercase tracking-[0.05em] text-on-surface-muted">
                  link lost
                </span>
              ) : null}
              <span
                className={`flex items-center gap-2 rounded border px-2.5 py-1 text-[12px] font-medium ${badge.wrap}`}
              >
                <StatusOrb status={status} size={7} />
                {badge.label}
              </span>
            </span>
          </motion.div>

          {/* ── Focal readout ────────────────────────────────────── */}
          <motion.div variants={strip}>
            <span
              className={`mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] ${
                tripped ? 'text-accent-red/90' : 'text-on-surface-subtle'
              }`}
            >
              {tripped ? 'Peak trip load' : 'Current power'}
            </span>
            <PowerMeter
              valueClassName="font-mono text-[40px] font-light tracking-tight sm:text-5xl"
              value={offline ? 0 : displayPower}
              unit="W"
              tone={powerTone}
              countUpOnMount
              bootDelay={reduced ? 0 : 560}
              ariaLabel={
                tripped
                  ? `Peak trip load ${fmt(displayPower)} watts`
                  : `Current power ${fmt(power)} watts`
              }
            />
          </motion.div>

          {/* ── Rail metrics ─────────────────────────────────────── */}
          <motion.div variants={strip} className="grid grid-cols-2 gap-3">
            <MetricWell
              label="Voltage"
              value={voltage == null ? DASH : fmt(voltage, 1)}
              unit="V"
              history={voltageHistory}
              colour="#9da2af"
              tone={unreachable ? 'text-on-surface-subtle' : 'text-on-surface'}
              dimmed={unreachable}
            />
            <MetricWell
              label="Current"
              value={current == null ? DASH : fmt(current, 2)}
              unit="A"
              history={currentHistory}
              scaleMax={threshold / 230}
              tooltip
              unitLabel="A"
              colour={tripped ? '#ef4444' : '#d97736'}
              tone={currentTone}
              dimmed={unreachable}
            />
          </motion.div>

          {/* ── Energy flow through the relay ────────────────────── */}
          <motion.div variants={strip}>
            <PowerFlowRibbon
              current={current ?? 0}
              relayOn={relayOn}
              tripped={tripped}
              energised={!unreachable}
            />
          </motion.div>

          {/* ── Utilisation oscillograph ─────────────────────────── */}
          <motion.div variants={strip}>
            <div className="mb-2 flex items-baseline justify-between font-mono text-[12px]">
              <span className={utilTone}>
                {offline ? '0' : fmt(displayPower)} W of {fmt(threshold)} W limit
                {staleTripped ? (
                  <span className="ml-2 text-on-surface-subtle">last recorded</span>
                ) : null}
              </span>
              <span className={`font-medium ${utilTone}`}>
                {offline ? '0%' : overloaded ? `Overload · ${utilPct}%` : `${utilPct}%`}
              </span>
            </div>
            <WaveformBar
              pct={unreachable ? 0 : utilisationClamped === 100 ? utilisation : utilisationClamped}
              overloaded={(overloaded || tripped) && !unreachable}
              offline={unreachable}
              height={30}
            />
          </motion.div>

          {/* ── Actuator deck ────────────────────────────────────── */}
          <motion.div
            variants={strip}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-4 border-t border-border-subtle pt-4"
          >
            <span className="flex items-center gap-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-on-surface-subtle">
                Relay
              </span>
              <RelayRocker on={relayOn && !offline} offline={offline} />
            </span>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                aria-expanded={detailsOpen}
                className="actuator inline-flex h-10 items-center gap-1.5 rounded border border-border-subtle px-3.5 text-[13px] lg:h-8 lg:px-3 lg:text-[12px] font-medium text-on-surface-muted hover:border-border-muted hover:bg-surface-card-hover hover:text-on-surface"
              >
                Details
                <motion.span
                  animate={{ rotate: detailsOpen ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="inline-flex"
                >
                  <IconChevron width={13} height={13} />
                </motion.span>
              </button>

              {unreachable ? (
                <span className="font-mono text-[11px] tracking-[0.04em] text-on-surface-subtle">
                  {staleTripped ? 'no link — reset when it returns' : 'controls unavailable'}
                </span>
              ) : (
                <ControlButton
                  command={command}
                  onCommand={onCommand}
                  busy={commandInFlight}
                  disabled={!online && !tripped}
                />
              )}
            </div>
          </motion.div>
        </div>
      </motion.article>
      </div>

      <motion.div
        variants={strip}
        initial="hidden"
        animate={booted ? 'show' : 'hidden'}
        className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(0,1fr)]"
      >
        <HoverPanel className="min-w-0"><ACScope
          voltage={voltage ?? 0}
          current={current ?? 0}
          powerFactor={powerFactor ?? 1}
          frequency={frequency}
          energised={!unreachable}
          tripped={tripped}
        /></HoverPanel>
        <HoverPanel className="min-w-0"><PhasorDiagram
          voltage={voltage ?? 0}
          current={current ?? 0}
          powerFactor={powerFactor ?? 1}
          energised={!unreachable}
          tripped={tripped}
        /></HoverPanel>
        <HoverPanel className="min-w-0"><TripCurve
          current={current ?? 0}
          threshold={threshold}
          voltage={voltage ?? 230}
          powerFactor={powerFactor ?? 0.95}
          energised={!unreachable}
        /></HoverPanel>
      </motion.div>

      <DetailsPanel
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        device={device}
        voltageHistory={voltageHistory}
        currentHistory={currentHistory}
      />
    </div>
  );
}
