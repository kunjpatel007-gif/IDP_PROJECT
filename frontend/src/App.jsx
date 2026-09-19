import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';

import BootSequence from '@/components/BootSequence';
import CommandPipeline from '@/components/CommandPipeline';
import DeviceCard from '@/components/DeviceCard';
import ElectricField from '@/components/ElectricField';
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

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <ElectricField
        intensity={device.unreachable ? 0 : Math.min(1, device.utilisation / 100)}
        overloaded={device.overloaded}
        tripped={device.tripped}
      />

      <TripOverlay
        tripped={device.tripped}
        peakWatts={device.peakTripWatts ?? device.power}
        threshold={device.threshold}
        onShake={handleShake}
      />

      <Sidebar
        connection={device.connection}
        alertCount={alertCount}
        fwVersion={device.fwVersion}
        deviceId={device.deviceId}
      />

      <BootSequence />

      <div className={`relative z-10 lg:pl-60 ${shaking ? 'chassis-shake' : ''}`}>
        <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          {/* ── Header ─────────────────────────────────────────────── */}
          <header className="mb-7">
            <h1 className="font-display text-[26px] font-bold uppercase tracking-[0.1em] text-on-surface lg:text-[30px]">
              Dashboard
            </h1>
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
