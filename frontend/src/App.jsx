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

          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <SourceSwitch source={source} onChange={setSource} live={device.connection === 'live'} />
            {source === 'mock' ? (
              <span className="font-mono text-[11px] tracking-[0.04em] text-accent-amber">
                Rehearsal generator — switch to Adapter for ESP32 telemetry
              </span>
            ) : null}
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
                  The console cannot read telemetry/socket1. Readings below are the last known values.
                  Check the project config in src/firebase.js and the read rule on the telemetry
                  collection.
                </p>
              </div>
            </motion.div>
          ) : null}

          {device.connection === 'empty' ? (
            <div className="mb-5 rounded border border-border-muted bg-surface-card px-4 py-3">
              <p className="font-mono text-[12px] text-primary-soft">Waiting for the first packet</p>
              <p className="mt-1 text-[12px] leading-[17px] text-on-surface-muted">
                The link is up but telemetry/socket1 is empty. Power the adapter and it will publish
                within five seconds.
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
              <header className="mb-2">
                <h1 className="font-display text-[22px] font-semibold tracking-tight text-on-surface lg:text-[26px]">Historical &amp; Analytics</h1>
              </header>
              <p className="mb-6 max-w-[62ch] text-[12px] leading-[18px] text-on-surface-muted">
                Accumulated by this console since the page was opened. The adapter publishes an
                instantaneous snapshot and keeps no history, so everything here is scoped to the
                current session rather than to the device's lifetime.
              </p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="border border-border-subtle bg-surface-card">
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-subtle px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Energy this session</span>
                    <span className="font-mono text-[9px] tracking-[0.05em] text-on-surface-subtle">integrated</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[26px] leading-none tracking-tight text-on-surface">{session.energyWh >= 1000 ? (session.energyWh / 1000).toFixed(3) : session.energyWh.toFixed(2)}<span className="ml-1.5 text-[12px] text-on-surface-muted">{session.energyWh >= 1000 ? "kWh" : "Wh"}</span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">Power integrated over observed intervals</p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card">
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-subtle px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Peak observed</span>
                    <span className="font-mono text-[9px] tracking-[0.05em] text-on-surface-subtle">session max</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[26px] leading-none tracking-tight text-primary">{session.peakPower != null ? fmt(session.peakPower) : "—"}<span className="ml-1.5 text-[12px] text-on-surface-muted">W</span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">{session.peakAt ? `at ${fmtClock(session.peakAt)}` : "no samples yet"}</p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card">
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-subtle px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Mean power</span>
                    <span className="font-mono text-[9px] tracking-[0.05em] text-on-surface-subtle">arithmetic</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[26px] leading-none tracking-tight text-on-surface">{session.meanPower != null ? fmt(session.meanPower) : "—"}<span className="ml-1.5 text-[12px] text-on-surface-muted">W</span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">{`over ${session.samples} packets`}</p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card">
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-subtle px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Rail excursion</span>
                    <span className="font-mono text-[9px] tracking-[0.05em] text-on-surface-subtle">min / max</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[26px] leading-none tracking-tight text-on-surface">{session.minVoltage != null ? `${session.minVoltage.toFixed(1)}–${session.maxVoltage.toFixed(1)}` : "—"}<span className="ml-1.5 text-[12px] text-on-surface-muted">V</span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">Supply variation seen this session</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'protection' && (
            <div className="animate-fade-in">
              <header className="mb-2">
                <h1 className="font-display text-[22px] font-semibold tracking-tight text-on-surface lg:text-[26px]">Protection &amp; Alerts</h1>
              </header>
              <p className="mb-6 max-w-[62ch] text-[12px] leading-[18px] text-on-surface-muted">
                Present protection state and what this console has witnessed since it was opened.
              </p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="border border-border-subtle bg-surface-card">
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-subtle px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Breaker state</span>
                    <span className="font-mono text-[9px] tracking-[0.05em] text-on-surface-subtle">relay</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className={`font-mono text-[26px] leading-none tracking-tight ${device.tripped ? "text-accent-red" : "text-accent-green"}`}>{device.tripped ? "OPEN" : device.relayOn ? "CLOSED" : "OPEN"}<span className="ml-1.5 text-[12px] text-on-surface-muted"></span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">{device.tripped ? "latched on overcurrent" : "no active fault"}</p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card">
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-subtle px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Trips this session</span>
                    <span className="font-mono text-[9px] tracking-[0.05em] text-on-surface-subtle">observed</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className={`font-mono text-[26px] leading-none tracking-tight ${session.trips > 0 ? "text-accent-red" : "text-on-surface"}`}>{session.trips}<span className="ml-1.5 text-[12px] text-on-surface-muted">{session.trips === 1 ? "event" : "events"}</span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">Counted from live transitions</p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card">
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-subtle px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Present load</span>
                    <span className="font-mono text-[9px] tracking-[0.05em] text-on-surface-subtle">of threshold</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className={`font-mono text-[26px] leading-none tracking-tight ${device.overloaded ? "text-accent-red" : device.utilisation > 80 ? "text-accent-amber" : "text-on-surface"}`}>{device.thresholdKnown ? Math.round(device.utilisation) : "—"}<span className="ml-1.5 text-[12px] text-on-surface-muted">%</span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">{device.thresholdKnown ? `${fmt(Math.max(0, device.threshold - device.power))} W headroom` : "threshold unknown"}</p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card">
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-subtle px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Peak trip load</span>
                    <span className="font-mono text-[9px] tracking-[0.05em] text-on-surface-subtle">latched</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[26px] leading-none tracking-tight text-accent-red">{device.peakTripWatts != null ? fmt(device.peakTripWatts) : "—"}<span className="ml-1.5 text-[12px] text-on-surface-muted">W</span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">Frozen at the last inception</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 border border-border-subtle bg-surface-card">
                <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-subtle px-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Trip setting</span>
                  <span className="font-mono text-[9px] tracking-[0.05em] text-on-surface-subtle">read-only</span>
                </div>
                <div className="flex flex-wrap items-center gap-4 px-3 py-4">
                  <span className="font-mono text-[18px] text-on-surface">
                    {device.thresholdKnown ? `${fmt(device.threshold)} W` : 'not published'}
                  </span>
                  <p className="max-w-[54ch] text-[11px] leading-[16px] text-on-surface-muted">
                    The threshold lives in firmware. Changing it from here needs a SET_THRESHOLD
                    command added to the ESP32 sketch and the command handler, which is outside this
                    dashboard.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'network' && (
            <div className="animate-fade-in">
              <header className="mb-2">
                <h1 className="font-display text-[22px] font-semibold tracking-tight text-on-surface lg:text-[26px]">Network &amp; Device</h1>
              </header>
              <p className="mb-6 max-w-[62ch] text-[12px] leading-[18px] text-on-surface-muted">
                Identity and link quality as reported by the adapter. Fields the firmware does not
                publish are shown as unreported rather than filled in.
              </p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="border border-border-subtle bg-surface-card">
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-subtle px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Identity</span>
                    <span className="font-mono text-[9px] tracking-[0.05em] text-on-surface-subtle">device_name</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[26px] leading-none tracking-tight text-on-surface">{device.deviceName ?? "unnamed"}<span className="ml-1.5 text-[12px] text-on-surface-muted"></span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">{device.deviceId ? `id ${device.deviceId}` : "id unreported"}</p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card">
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-subtle px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Firmware</span>
                    <span className="font-mono text-[9px] tracking-[0.05em] text-on-surface-subtle">fw_version</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[26px] leading-none tracking-tight text-on-surface">{device.fwVersion ?? "unreported"}<span className="ml-1.5 text-[12px] text-on-surface-muted"></span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">{source === "mock" ? "rehearsal generator" : "ESP32 + PZEM-004T"}</p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card">
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-subtle px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Radio</span>
                    <span className="font-mono text-[9px] tracking-[0.05em] text-on-surface-subtle">rssi</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[26px] leading-none tracking-tight text-on-surface">{device.rssi != null ? device.rssi : "—"}<span className="ml-1.5 text-[12px] text-on-surface-muted">dBm</span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">{rssiQuality(device.rssi).label}</p>
                  </div>
                </div>
                <div className="border border-border-subtle bg-surface-card">
                  <div className="flex h-7 items-center justify-between border-b border-border-subtle bg-surface-subtle px-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-muted">Free heap</span>
                    <span className="font-mono text-[9px] tracking-[0.05em] text-on-surface-subtle">free_heap</span>
                  </div>
                  <div className="px-3 py-4">
                    <p className="font-mono text-[26px] leading-none tracking-tight text-on-surface">{device.freeHeap != null ? (device.freeHeap / 1024).toFixed(1) : "—"}<span className="ml-1.5 text-[12px] text-on-surface-muted">kB</span></p>
                    <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">{`${session.samples} packets this session`}</p>
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
