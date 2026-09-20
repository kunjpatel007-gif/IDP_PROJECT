import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';

import BootSequence from '@/components/BootSequence';
import ScrambleText from '@/components/ScrambleText';
import CommandPipeline from '@/components/CommandPipeline';
import DeviceCard from '@/components/DeviceCard';
import ElectricField from '@/components/ElectricField';
import ParticleBackground from '@/components/ParticleBackground';
import StatusStrip from '@/components/StatusStrip';


import LiveDataBadge from '@/components/LiveDataBadge';
import Sidebar from '@/components/Sidebar';
import StatsRow from '@/components/StatsRow';
import TripOverlay from '@/components/TripOverlay';
import { useToast } from '@/components/ToastNotification';
import { IconWarning } from '@/components/Icons';

import { useDevice } from '@/hooks/useDevice';
import { useSparkline } from '@/hooks/useSparkline';
import { sendCommand } from '@/firebase';
import { fmtClock } from '@/lib/format';

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
  const device = useDevice();
  const { push } = useToast();

  const [commandInFlight, setCommandInFlight] = useState(false);
  const [pipeline, setPipeline] = useState(null); // { run, command, expectRelay }
  const [shaking, setShaking] = useState(false);
  const shakeTimer = useRef(null);

  // Traces are keyed on `seq` so the 1s stale ticker cannot inject phantom points.
  const powerHistory = useSparkline(device.offline ? 0 : device.power, device.seq, 20);
  const voltageHistory = useSparkline(device.voltage, device.seq, 20);
  const currentHistory = useSparkline(device.current, device.seq, 20);

  const handleShake = useCallback(() => {
    clearTimeout(shakeTimer.current);
    setShaking(true);
    shakeTimer.current = setTimeout(() => setShaking(false), 650);
  }, []);

  const handleCommand = useCallback(
    async (command) => {
      setCommandInFlight(true);
      try {
        await sendCommand(command);
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
    [push]
  );

  const alertCount = device.tripped ? 1 : 0;
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <ParticleBackground
        intensity={device.unreachable ? 0 : Math.min(1, device.utilisation / 100)}
        scatter={device.tripped}
      />

      <ElectricField
        intensity={device.unreachable ? 0 : Math.min(1, device.utilisation / 100)}
        overloaded={device.overloaded}
        tripped={device.tripped}
      />

      

      

      <TripOverlay
        tripped={device.tripped}
        peakWatts={device.peakTripWatts ?? device.power}
        voltage={device.faultVoltage ?? device.voltage ?? 230}
        powerFactor={device.faultPowerFactor ?? device.powerFactor ?? 0.95}
        threshold={device.threshold}
        onShake={handleShake}
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

      <div className={`relative z-10 lg:pl-60 ${shaking ? 'chassis-shake' : ''}`}>
        <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">

          {/* ── Tabs ─────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="animate-fade-in">
              {/* ── Header ─────────────────────────────────────────────── */}
          <header className="mb-7">
            <ScrambleText
              as="h1"
              text="DASHBOARD"
              duration={760}
              delay={120}
              className="block font-display text-[26px] font-bold uppercase tracking-[0.1em] text-on-surface lg:text-[30px]"
            />
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

          <StatusStrip device={device} />
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
              <header className="mb-7">
                <ScrambleText as="h1" text="HISTORICAL & ANALYTICS" duration={760} className="block font-display text-[26px] font-bold uppercase tracking-[0.1em] text-on-surface lg:text-[30px]" />
              </header>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-2">Daily Energy Consumption</h3>
                  <p className="text-3xl font-mono text-on-surface tracking-tight">0.00 <span className="text-sm text-on-surface-muted">kWh</span></p>
                  <p className="text-xs text-on-surface-muted mt-2">Requires backend time-series accumulator</p>
                </div>
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-2">Peak Power Recorded</h3>
                  <p className="text-3xl font-mono text-on-surface tracking-tight">0.0 <span className="text-sm text-on-surface-muted">W</span></p>
                  <p className="text-xs text-on-surface-muted mt-2">Requires backend historical peak tracking</p>
                </div>
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-2">Average Power</h3>
                  <p className="text-3xl font-mono text-on-surface tracking-tight">0.0 <span className="text-sm text-on-surface-muted">W</span></p>
                  <p className="text-xs text-on-surface-muted mt-2">Requires backend rolling aggregation</p>
                </div>
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-2">Usage Patterns</h3>
                  <p className="text-sm text-on-surface-muted">Historical patterns not available. Require time-series database integration.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'protection' && (
            <div className="animate-fade-in">
              <header className="mb-7">
                <ScrambleText as="h1" text="PROTECTION & ALERTS" duration={760} className="block font-display text-[26px] font-bold uppercase tracking-[0.1em] text-on-surface lg:text-[30px]" />
              </header>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-4">Hardware Threshold</h3>
                  <div className="flex items-center gap-4">
                    <input type="number" disabled value={device.threshold || 0} className="bg-surface-subtle border border-border-muted rounded px-4 py-2 font-mono text-on-surface flex-1" />
                    <button disabled className="bg-border-muted text-on-surface-muted px-4 py-2 rounded font-medium text-sm">Edit (Requires FW Update)</button>
                  </div>
                  <p className="text-xs text-on-surface-muted mt-3">Currently read-only. A SET_THRESHOLD command must be added to the ESP32 code to enable edits.</p>
                </div>
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-2">Overload Trips</h3>
                  <p className="text-3xl font-mono text-accent-red tracking-tight">0 <span className="text-sm text-on-surface-muted">events</span></p>
                  <p className="text-xs text-on-surface-muted mt-2">Persistent trip logging requires Firestore history array.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'network' && (
            <div className="animate-fade-in">
              <header className="mb-7">
                <ScrambleText as="h1" text="NETWORK & DEVICE" duration={760} className="block font-display text-[26px] font-bold uppercase tracking-[0.1em] text-on-surface lg:text-[30px]" />
              </header>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-4">Device Identity</h3>
                  <div className="space-y-3 font-mono text-sm">
                    <div className="flex justify-between border-b border-border-muted pb-2"><span className="text-on-surface-muted">Name:</span> <span className="text-on-surface">Living Room Socket</span></div>
                    <div className="flex justify-between border-b border-border-muted pb-2"><span className="text-on-surface-muted">ID:</span> <span className="text-on-surface">{device.deviceId || 'socket1'}</span></div>
                    <div className="flex justify-between border-b border-border-muted pb-2"><span className="text-on-surface-muted">Status:</span> <span className={device.connection === 'live' ? 'text-accent-green' : 'text-accent-red'}>{device.connection === 'live' ? 'ONLINE' : 'OFFLINE'}</span></div>
                    <div className="flex justify-between pb-2"><span className="text-on-surface-muted">IP Address:</span> <span className="text-on-surface">N/A (Update FW)</span></div>
                  </div>
                </div>
                <div className="rounded border border-border-subtle bg-surface-card p-6">
                  <h3 className="font-display text-sm font-semibold text-primary mb-4">Diagnostics</h3>
                  <div className="space-y-3 font-mono text-sm">
                    <div className="flex justify-between border-b border-border-muted pb-2"><span className="text-on-surface-muted">FW Version:</span> <span className="text-on-surface">{device.fwVersion || 'Unknown'}</span></div>
                    <div className="flex justify-between border-b border-border-muted pb-2"><span className="text-on-surface-muted">RSSI:</span> <span className="text-on-surface">{device.rssi || 0} dBm</span></div>
                    <div className="flex justify-between pb-2"><span className="text-on-surface-muted">Free Heap:</span> <span className="text-on-surface">{device.freeHeap || 0} bytes</span></div>
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
