import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';

import BootSequence from '@/components/BootSequence';
import CommandPipeline from '@/components/CommandPipeline';
import DeviceCard from '@/components/DeviceCard';


import LiveDataBadge from '@/components/LiveDataBadge';
import Sidebar from '@/components/Sidebar';
import StatsRow from '@/components/StatsRow';
import TripOverlay from '@/components/TripOverlay';
import { useToast } from '@/components/ToastNotification';
import { IconWarning } from '@/components/Icons';

import { useDevice } from '@/hooks/useDevice';
import { useSessionStats } from '@/hooks/useSessionStats';
import SourceSwitch from '@/components/SourceSwitch';
import { useSparkline } from '@/hooks/useSparkline';
import { initialSource, sendCommand } from '@/firebase';
import { fmt, fmtClock, rssiQuality } from '@/lib/format';

const COMMAND_COPY = {
  ON: { title: 'Close relay queued', detail: 'The adapter polls every 2 seconds. Relay state below is the confirmation.' },
  OFF: { title: 'Open relay queued', detail: 'The adapter polls every 2 seconds. Relay state below is the confirmation.' },
  RESET: { title: 'Breaker reset queued', detail: 'If the overload is still on the socket it will trip straight back out.' },
};

/** Turn a Firebase error into something that says what to do next. */
function describeError(error) {
  const code = error?.code ?? '';
  if (code.includes('permission-denied')) {
    return 'Firestore rejected the write. The commands/socket1 rule needs to allow writes.';
  }
  if (code.includes('unavailable') || code.includes('network')) {
    return 'No route to Firestore. Check this machine’s connection and try again.';
  }
  if (code.includes('unauthenticated')) {
    return 'Firestore refused the request as unauthenticated. Check the project config in src/firebase.js.';
  }
  return error?.message ?? 'The write did not complete.';
}

export default function App() {
  const [source, setSource] = useState(initialSource);
  const device = useDevice(source);
  const session = useSessionStats(device);
  const { push } = useToast();

  const [commandInFlight, setCommandInFlight] = useState(false);
  const [pipeline, setPipeline] = useState(null); // { run, command, expectRelay }

  // Traces are keyed on `seq` so the 1s stale ticker cannot inject phantom points.
  const powerHistory = useSparkline(device.offline ? 0 : device.power, device.seq, 20);
  const voltageHistory = useSparkline(device.voltage, device.seq, 20);
  const currentHistory = useSparkline(device.current, device.seq, 20);

  const handleCommand = useCallback(
    async (command) => {
      setCommandInFlight(true);
      try {
        await sendCommand(command, source);
        // Stage the round trip; the last hop closes on a real snapshot.
        setPipeline({ run: Date.now(), command, expectRelay: command !== 'OFF' });
        const copy = COMMAND_COPY[command];
        push({ tone: 'ok', title: copy.title, detail: copy.detail });
      } catch (error) {
        console.error('[SmartAdapter] command write failed:', error);
        push({ tone: 'error', title: 'Command not sent', detail: describeError(error), ttl: 8000 });
        throw error;
      } finally {
        setCommandInFlight(false);
      }
    },
    [push, source]
  );

  const alertCount = device.tripped ? 1 : 0;
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      

      

      <TripOverlay
        tripped={device.tripped}
        peakWatts={device.peakTripWatts ?? device.power}
        voltage={device.faultVoltage ?? device.voltage}
        powerFactor={device.faultPowerFactor ?? device.powerFactor}
        frequency={device.frequency}
        threshold={device.threshold}
      />

      <Sidebar
        connection={device.connection}
        alertCount={alertCount}
        fwVersion={device.fwVersion}
        deviceId={device.deviceId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <BootSequence />

      <div className={`relative z-10 lg:pl-60 `}>
        <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">

          <div className="mb-6">
            <SourceSwitch source={source} onChange={setSource} live={device.connection === 'live'} />
          </div>

          {/* ── Tabs ─────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="animate-fade-in">
              {/* ── Header ─────────────────────────────────────────────── */}
          <header className="mb-7">
            <h1 className="font-display text-[22px] font-semibold tracking-tight text-on-surface lg:text-[26px]">Dashboard</h1>
          </header>

          {/* ── Link fault banner ──────────────────────────────────── */}
          {device.connection === 'error' ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 flex items-start gap-3 rounded border border-accent-red/35 bg-accent-red-bg px-4 py-3"
              role="alert"
            >
              <span className="mt-[2px] text-accent-red">
                <IconWarning width={15} height={15} />
              </span>
              <div>
                <p className="font-mono text-[12px] text-accent-red">Firestore subscription failed</p>
                <p className="mt-1 text-[12px] leading-[17px] text-on-surface-muted">
                  Cannot read telemetry. Check firebase config and Firestore rules.
                </p>
              </div>
            </motion.div>
          ) : null}

          {device.connection === 'empty' ? (
            <div className="mb-5 rounded border border-border-muted bg-surface-card px-4 py-3">
              <p className="font-mono text-[12px] text-primary-soft">Waiting for the first packet</p>
              <p className="mt-1 text-[12px] leading-[17px] text-on-surface-muted">
                Link active — waiting for first telemetry packet.
              </p>
            </div>
          ) : null}

          <CommandPipeline
            run={pipeline?.run}
            command={pipeline?.command}
            confirmed={
              pipeline
                ? pipeline.command === 'RESET'
                  ? !device.tripped
                  : device.relayOn === pipeline.expectRelay
                : false
            }
            onDone={() => setPipeline(null)}
          />

          <StatsRow device={device} powerHistory={powerHistory} />

          {/* ── Adapter bay ────────────────────────────────────────── */}
          <section className="mt-7">
            <div>
              <DeviceCard
                device={device}
                voltageHistory={voltageHistory}
                currentHistory={currentHistory}
                onCommand={handleCommand}
                commandInFlight={commandInFlight}
              />

            </div>
          </section>
            </div>
          )}

          {activeTab === 'historical' && (
            <div className="animate-fade-in">
              <header className="mb-5">
                <h1 className="font-display text-[22px] font-semibold tracking-tight text-on-surface lg:text-[26px]">Historical</h1>
              </header>

              {/* Hero row */}
              <div className="grid gap-3 md:grid-cols-2 mb-3">
                <div className="border border-border-subtle bg-surface-card shadow-chassis transition-all duration-300 hover:bg-surface-card-hover hover:shadow-glow-amber" style={{ borderLeft: '2px solid rgba(217, 119, 54, 0.5)' }}>
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-well/40 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Energy this session</span>
                  </div>
                  <div className="px-3 py-5">
                    <p className="font-mono text-[32px] leading-none tracking-tight text-on-surface">{session.energyWh >= 1000 ? (session.energyWh / 1000).toFixed(3) : session.energyWh.toFixed(2)}<span className="ml-1.5 text-[13px] text-on-surface-muted">{session.energyWh >= 1000 ? "kWh" : "Wh"}</span></p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card shadow-chassis transition-all duration-300 hover:bg-surface-card-hover hover:shadow-glow-amber" style={{ borderLeft: '2px solid rgba(217, 119, 54, 0.5)' }}>
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-well/40 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Peak observed</span>
                  </div>
                  <div className="px-3 py-5">
                    <p className="font-mono text-[32px] leading-none tracking-tight text-primary">{session.peakPower != null ? fmt(session.peakPower) : "\u2014"}<span className="ml-1.5 text-[13px] text-on-surface-muted">W</span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">{session.peakAt ? `at ${fmtClock(session.peakAt)}` : ""}</p>
                  </div>
                </div>
              </div>

              {/* Secondary row */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="border border-border-subtle bg-surface-card transition-colors duration-300 hover:border-border-muted hover:bg-surface-card-hover">
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-well/40 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Mean power</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[24px] leading-none tracking-tight text-on-surface">{session.meanPower != null ? fmt(session.meanPower) : "\u2014"}<span className="ml-1.5 text-[12px] text-on-surface-muted">W</span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">{`${session.samples} samples`}</p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card transition-colors duration-300 hover:border-border-muted hover:bg-surface-card-hover">
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-well/40 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Rail excursion</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[24px] leading-none tracking-tight text-on-surface">{session.minVoltage != null ? `${session.minVoltage.toFixed(1)}\u2013${session.maxVoltage.toFixed(1)}` : "\u2014"}<span className="ml-1.5 text-[12px] text-on-surface-muted">V</span></p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'protection' && (
            <div className="animate-fade-in">
              <header className="mb-5">
                <h1 className="font-display text-[22px] font-semibold tracking-tight text-on-surface lg:text-[26px]">Protection</h1>
              </header>

              {/* Hero: Breaker State */}
              <div className={`mb-3 border bg-surface-card shadow-chassis transition-all duration-300 hover:bg-surface-card-hover ${device.tripped ? 'border-accent-red/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.15)]' : 'border-border-subtle hover:shadow-glow-amber'}`} style={{ borderLeft: device.tripped ? '2px solid #ef4444' : '2px solid #22c55e' }}>
                <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-well/40 px-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Breaker state</span>
                  <span className={`inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.05em] ${device.tripped ? 'text-accent-red' : 'text-accent-green'}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${device.tripped ? 'bg-accent-red' : 'bg-accent-green'}`} />
                    {device.tripped ? 'FAULT' : 'NOMINAL'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-5">
                  <div>
                    <p className={`font-mono text-[36px] font-medium leading-none tracking-tight ${device.tripped ? "text-accent-red" : "text-accent-green"}`}>{device.tripped ? "OPEN" : device.relayOn ? "CLOSED" : "OPEN"}</p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">{device.tripped ? "latched on overcurrent" : "no active fault"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[11px] text-on-surface-muted">Threshold</p>
                    <p className="font-mono text-[18px] text-on-surface">{device.thresholdKnown ? `${fmt(device.threshold)} W` : '—'}</p>
                  </div>
                </div>
              </div>

              {/* Secondary metrics */}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="border border-border-subtle bg-surface-card transition-colors duration-300 hover:border-border-muted hover:bg-surface-card-hover">
                  <div className="flex h-7 items-center border-b border-border-subtle bg-surface-well/40 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Trips this session</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className={`font-mono text-[26px] leading-none tracking-tight ${session.trips > 0 ? "text-accent-red" : "text-on-surface"}`}>{session.trips}<span className="ml-1.5 text-[12px] text-on-surface-muted">{session.trips === 1 ? "event" : "events"}</span></p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card transition-colors duration-300 hover:border-border-muted hover:bg-surface-card-hover">
                  <div className="flex h-7 items-center border-b border-border-subtle bg-surface-well/40 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Present load</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className={`font-mono text-[26px] leading-none tracking-tight ${device.overloaded ? "text-accent-red" : device.utilisation > 80 ? "text-accent-amber" : "text-on-surface"}`}>{device.thresholdKnown ? Math.round(device.utilisation) : "\u2014"}<span className="ml-1.5 text-[12px] text-on-surface-muted">%</span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">{device.thresholdKnown ? `${fmt(Math.max(0, device.threshold - device.power))} W headroom` : ""}</p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card transition-colors duration-300 hover:border-border-muted hover:bg-surface-card-hover">
                  <div className="flex h-7 items-center border-b border-border-subtle bg-surface-well/40 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Peak trip load</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[26px] leading-none tracking-tight text-accent-red">{device.peakTripWatts != null ? fmt(device.peakTripWatts) : "\u2014"}<span className="ml-1.5 text-[12px] text-on-surface-muted">W</span></p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'network' && (
            <div className="animate-fade-in">
              <header className="mb-5">
                <h1 className="font-display text-[22px] font-semibold tracking-tight text-on-surface lg:text-[26px]">Network</h1>
              </header>

              {/* Identity hero */}
              <div className="mb-3 border border-border-subtle bg-surface-card shadow-chassis transition-all duration-300 hover:bg-surface-card-hover hover:shadow-glow-amber" style={{ borderLeft: '2px solid rgba(217, 119, 54, 0.5)' }}>
                <div className="flex h-7 items-center border-b border-border-subtle bg-surface-well/40 px-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Identity</span>
                </div>
                <div className="flex items-center justify-between px-4 py-5">
                  <div>
                    <p className="font-display text-[28px] font-semibold leading-none tracking-tight text-on-surface">{device.deviceName ?? "unnamed"}</p>
                    <p className="mt-2 font-mono text-[11px] tracking-[0.04em] text-on-surface-subtle">{device.deviceId ? `${device.deviceId}` : "unreported"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[11px] text-on-surface-muted">Firmware</p>
                    <p className="font-mono text-[16px] text-on-surface">{device.fwVersion ?? "—"}</p>
                  </div>
                </div>
              </div>

              {/* Secondary diagnostics */}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="border border-border-subtle bg-surface-card transition-colors duration-300 hover:border-border-muted hover:bg-surface-card-hover">
                  <div className="flex h-7 items-center border-b border-border-subtle bg-surface-well/40 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Radio</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[26px] leading-none tracking-tight text-on-surface">{device.rssi != null ? device.rssi : "\u2014"}<span className="ml-1.5 text-[12px] text-on-surface-muted">dBm</span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">{rssiQuality(device.rssi).label}</p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card transition-colors duration-300 hover:border-border-muted hover:bg-surface-card-hover">
                  <div className="flex h-7 items-center border-b border-border-subtle bg-surface-well/40 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Free heap</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[26px] leading-none tracking-tight text-on-surface">{device.freeHeap != null ? (device.freeHeap / 1024).toFixed(1) : "\u2014"}<span className="ml-1.5 text-[12px] text-on-surface-muted">kB</span></p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card transition-colors duration-300 hover:border-border-muted hover:bg-surface-card-hover">
                  <div className="flex h-7 items-center border-b border-border-subtle bg-surface-well/40 px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Packets</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[26px] leading-none tracking-tight text-on-surface">{session.samples}<span className="ml-1.5 text-[12px] text-on-surface-muted">rx</span></p>
                  </div>
                </div>
              </div>
            </div>
          )}

</main>
      </div>

      <LiveDataBadge
        seq={device.seq}
        snapshotCount={device.snapshotCount}
        connected={device.connected}
        silentFor={device.silentFor}
      />
    </div>
  );
}
