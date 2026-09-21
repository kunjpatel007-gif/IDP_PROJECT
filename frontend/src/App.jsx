import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import Backdrop from '@/components/Backdrop';
import BootSequence from '@/components/BootSequence';
import CommandPipeline from '@/components/CommandPipeline';
import DeviceCard from '@/components/DeviceCard';
import DetailsPanel from '@/components/DetailsPanel';
import HoverPanel from '@/components/HoverPanel';
import LinkTrace from '@/components/LinkTrace';
import LiveDataBadge from '@/components/LiveDataBadge';
import PageHeader, { HeaderMeta } from '@/components/PageHeader';
import Panel, { PanelState, Readout } from '@/components/Panel';
import ScrollStack, { ScrollStackItem } from '@/components/ScrollStack';
import Sidebar from '@/components/Sidebar';
import SourceSwitch from '@/components/SourceSwitch';
import SparklineChart from '@/components/SparklineChart';
import StatsRow from '@/components/StatsRow';
import TabView, { Strip } from '@/components/TabView';
import TargetCursor from '@/components/TargetCursor';
import ACScope from '@/components/ACScope';
import PhasorDiagram from '@/components/PhasorDiagram';
import TripCurve from '@/components/TripCurve';
import TripOverlay from '@/components/TripOverlay';
import WaveformBar from '@/components/WaveformBar';
import { useToast } from '@/components/ToastNotification';
import { IconWarning } from '@/components/Icons';

import { useDevice } from '@/hooks/useDevice';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useSessionStats } from '@/hooks/useSessionStats';
import { useSparkline } from '@/hooks/useSparkline';
import { useLenis } from '@/components/SmoothScroll';
import { initialSource, sendCommand } from '@/firebase';
import { fmt, fmtClock, fmtDuration, rssiQuality } from '@/lib/format';

const COMMAND_COPY = {
  ON: {
    title: 'Close relay queued',
    detail: 'The adapter polls every 2 seconds. Relay state below is the confirmation.',
  },
  OFF: {
    title: 'Open relay queued',
    detail: 'The adapter polls every 2 seconds. Relay state below is the confirmation.',
  },
  RESET: {
    title: 'Breaker reset queued',
    detail: 'If the overload is still on the socket it will trip straight back out.',
  },
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

/** WiFi strength as four bars rather than a number nobody reads in dBm. */
function SignalBars({ bars = 0, tone = '#9da2af' }) {
  return (
    <span className="inline-flex items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="sig-bar w-[3px] rounded-[1px]"
          style={{
            height: 5 + i * 3,
            background: i < bars ? tone : '#2e313a',
            opacity: i < bars ? 1 : 0.7,
          }}
        />
      ))}
    </span>
  );
}

export default function App() {
  const [source, setSource] = useState(initialSource);
  const device = useDevice(source);
  const session = useSessionStats(device);
  const reduced = useReducedMotion();
  const { push } = useToast();
  const { scrollTo } = useLenis();

  const [commandInFlight, setCommandInFlight] = useState(false);
  const [pipeline, setPipeline] = useState(null); // { run, command, expectRelay }
  const [activeTab, setActiveTab] = useState('overview');

  // Traces are keyed on `seq` so the 1s stale ticker cannot inject phantom points.
  const powerHistory = useSparkline(device.offline ? 0 : device.power, device.seq, 20);
  const voltageHistory = useSparkline(device.voltage, device.seq, 20);
  const currentHistory = useSparkline(device.current, device.seq, 20);

  /* The whole console takes the hit when the breaker opens. One shake on the
     rising edge only — a chassis that rattled on every render would be noise,
     and the point of the shake is that it means exactly one thing. */
  const [shake, setShake] = useState(false);
  const wasTripped = useRef(device.tripped);
  useEffect(() => {
    if (device.tripped && !wasTripped.current && !reduced) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 640);
      wasTripped.current = device.tripped;
      return () => clearTimeout(t);
    }
    wasTripped.current = device.tripped;
    return undefined;
  }, [device.tripped, reduced]);

  /* Switching to a short screen while scrolled deep into a long one used to
     land you on blank space below the content. The console returns to the top
     of the new screen, instantly rather than smoothly — a 600ms glide fighting
     the tab's own transition reads as lag.

     This goes through Lenis rather than `window.scrollTo`. Lenis holds its own
     idea of the scroll position and animates towards it, so a raw window call
     gets dragged straight back on the next frame. */
  useEffect(() => {
    scrollTo(0, { immediate: true });
  }, [activeTab, scrollTo]);

  /* The tab strip is often the only part of the browser visible when the
     console is projected. It carries the fault. */
  useEffect(() => {
    document.title = device.tripped
      ? 'TRIPPED — SmartAdapter'
      : device.unreachable
        ? 'No link — SmartAdapter'
        : 'SmartAdapter';
  }, [device.tripped, device.unreachable]);

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
  const radio = rssiQuality(device.rssi);

  /* Backdrop intensity is the socket's own utilisation, not a decoration
     parameter. The room gets busier because the load did. */
  const intensity = Math.min(1, (device.unreachable ? 0 : device.utilisationClamped) / 100);

  const headerMeta = (
    <>
      <HeaderMeta label="Session" value={fmtDuration(session.durationMs)} />
      <HeaderMeta
        label="Clock"
        value={fmtClock(device.now)}
        tone={device.connected ? 'text-on-surface' : 'text-on-surface-subtle'}
      />
    </>
  );

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <TargetCursor
        spinDuration={2}
        hideDefaultCursor
        parallaxOn
        hoverDuration={0.2}
        cursorColor="#9da2af"
        cursorColorOnTarget="#d97736"
      />

      <Backdrop
        intensity={intensity}
        overloaded={device.overloaded}
        tripped={device.tripped}
      />

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

      <div className={`relative z-10 lg:pl-60 ${shake ? 'chassis-shake' : ''}`}>
        <main className="px-4 pb-20 pt-6 sm:px-6 lg:px-10 lg:pt-9">
          <div className="mb-6 flex flex-col gap-4">
            <div>
              <SourceSwitch
                source={source}
                onChange={setSource}
                live={device.connection === 'live'}
              />
            </div>

            {/* Mobile-only mock scenario links (Desktop has them in the sidebar) */}
            {source === 'mock' ? (
              <div className="flex flex-wrap items-center gap-2 lg:hidden">
                <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-on-surface-subtle">
                  Scenario:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'trip', label: 'Trip', href: '/?mock=trip' },
                    { id: 'cycling', label: 'Cycling', href: '/?mock=cycling' },
                    { id: 'offline', label: 'Offline', href: '/?mock=offline' },
                  ].map((m) => (
                    <a
                      key={m.id}
                      href={m.href}
                      className="rounded border border-border-subtle bg-surface-subtle px-2 py-1 font-mono text-[10px] tracking-[0.04em] text-on-surface-muted transition-colors hover:border-border-muted hover:bg-surface-card-hover hover:text-on-surface cursor-target"
                    >
                      {m.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {/* ── Live overview ──────────────────────────────────── */}
            {activeTab === 'overview' ? (
              <TabView key="overview">
                <Strip>
                  <PageHeader
                    title="Dashboard"
                    lede="Live readings from the adapter, straight off the PZEM-004T. Every figure on this screen is measured — nothing here is modelled or filled in."
                    meta={headerMeta}
                  />
                </Strip>

                {device.connection === 'error' ? (
                  <Strip>
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
                        <p className="font-mono text-[12px] text-accent-red">
                          Firestore subscription failed
                        </p>
                        <p className="mt-1 text-[12px] leading-[17px] text-on-surface-muted">
                          Cannot read telemetry. Check firebase config and Firestore rules.
                        </p>
                      </div>
                    </motion.div>
                  </Strip>
                ) : null}

                {device.connection === 'empty' ? (
                  <Strip>
                    <div className="mb-5 rounded border border-border-muted bg-surface-card px-4 py-3">
                      <p className="font-mono text-[12px] text-primary-soft">
                        Waiting for the first packet
                      </p>
                      <p className="mt-1 text-[12px] leading-[17px] text-on-surface-muted">
                        Link active — waiting for first telemetry packet.
                      </p>
                    </div>
                  </Strip>
                ) : null}

                <Strip>
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
                </Strip>

                <ScrollStack className="mt-7">
                  <ScrollStackItem>
                    <Strip>
                      <StatsRow device={device} powerHistory={powerHistory} />
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <DeviceCard
                        device={device}
                        voltageHistory={voltageHistory}
                        currentHistory={currentHistory}
                        onCommand={handleCommand}
                        commandInFlight={commandInFlight}
                      />
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <HoverPanel className="min-w-0 bg-surface-card rounded-[10px] border border-border-subtle">
                        <DetailsPanel
                          device={device}
                          voltageHistory={voltageHistory}
                          currentHistory={currentHistory}
                        />
                      </HoverPanel>
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <HoverPanel className="min-w-0 bg-surface-card rounded-[10px] p-1">
                        <ACScope
                          voltage={device.voltage ?? 0}
                          current={device.current ?? 0}
                          powerFactor={device.powerFactor ?? 1}
                          frequency={device.frequency}
                          energised={!device.unreachable}
                          tripped={device.tripped}
                        />
                      </HoverPanel>
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <HoverPanel className="min-w-0 bg-surface-card rounded-[10px] p-1">
                        <PhasorDiagram threshold={device.threshold}
                          voltage={device.voltage ?? 0}
                          current={device.current ?? 0}
                          powerFactor={device.powerFactor ?? 1}
                          energised={!device.unreachable}
                          tripped={device.tripped}
                        />
                      </HoverPanel>
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <HoverPanel className="min-w-0 bg-surface-card rounded-[10px] p-1">
                        <TripCurve
                          current={device.current ?? 0}
                          threshold={device.threshold}
                          voltage={device.voltage}
                          powerFactor={device.powerFactor}
                          energised={!device.unreachable}
                        />
                      </HoverPanel>
                    </Strip>
                  </ScrollStackItem>
                </ScrollStack>
              </TabView>
            ) : null}

            {/* ── Historical ─────────────────────────────────────── */}
            {activeTab === 'historical' ? (
              <TabView key="historical">
                <Strip>
                  <PageHeader
                    title="Historical"
                    lede="Accumulated since this console loaded. The adapter keeps no history of its own, so this window is exactly what has been witnessed live."
                    meta={headerMeta}
                  />
                </Strip>

                <ScrollStack>
                  <ScrollStackItem>
                    <Strip>
                      <Panel label="Energy this session" accent="amber" hero bodyClassName="px-4 py-5">
                        <Readout layout="spread"
                          size="xl"
                          lit
                          value={
                            session.energyWh >= 1000
                              ? (session.energyWh / 1000).toFixed(3)
                              : session.energyWh.toFixed(2)
                          }
                          unit={session.energyWh >= 1000 ? 'kWh' : 'Wh'}
                          caption={`integrated over ${fmtDuration(session.durationMs)}`}
                        />
                      </Panel>
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <Panel label="Peak observed" accent="amber" hero bodyClassName="px-4 py-5">
                        <Readout layout="spread"
                          size="xl"
                          lit
                          tone="text-primary"
                          value={session.peakPower != null ? fmt(session.peakPower) : '—'}
                          unit="W"
                          caption={session.peakAt ? `at ${fmtClock(session.peakAt)}` : 'no samples yet'}
                        />
                      </Panel>
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <Panel
                        label="Power trace"
                        meta={
                          <span className="font-mono text-[10px] tracking-[0.04em] text-on-surface-subtle">
                            last {powerHistory.length} samples
                          </span>
                        }
                        bodyClassName="px-1 pb-1 pt-3"
                      >
                        <div className="h-[180px] w-full">
                          <SparklineChart
                            values={powerHistory}
                            color={device.tripped ? '#ef4444' : '#d97736'}
                            height={180}
                            dimmed={device.unreachable}
                            tooltip
                            unit=" W"
                            decimals={0}
                          />
                        </div>
                      </Panel>
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <Panel label="Mean power">
                        <Readout layout="spread"
                          value={session.meanPower != null ? fmt(session.meanPower) : '—'}
                          unit="W"
                          caption={`${session.samples} samples`}
                        />
                      </Panel>
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <Panel label="Rail excursion">
                        <Readout layout="spread"
                          value={
                            session.minVoltage != null
                              ? `${session.minVoltage.toFixed(1)}\u2013${session.maxVoltage.toFixed(1)}`
                              : '—'
                          }
                          unit="V"
                          caption={
                            session.minVoltage != null
                              ? `${(session.maxVoltage - session.minVoltage).toFixed(1)} V spread`
                              : 'no samples yet'
                          }
                        />
                      </Panel>
                    </Strip>
                  </ScrollStackItem>
                </ScrollStack>
              </TabView>
            ) : null}

            {/* ── Protection ─────────────────────────────────────── */}
            {activeTab === 'protection' ? (
              <TabView key="protection">
                <Strip>
                  <PageHeader
                    title="Protection"
                    lede="The relay acts as the breaker. It latches open on overcurrent and stays open — including through a power or WiFi loss — until the adapter comes back and reports itself clear."
                    meta={headerMeta}
                  />
                </Strip>

                <ScrollStack>
                  <ScrollStackItem>
                    <Strip>
                      <Panel
                        label="Breaker state"
                        accent={device.tripped ? 'red' : 'green'}
                        critical={device.tripped}
                        hero
                        meta={<PanelState ok={!device.tripped} />}
                        bodyClassName="px-4 py-5"
                      >
                        <div className="flex flex-wrap items-end justify-between gap-4">
                          <Readout
                            size="hero"
                            lit
                            critical={device.tripped}
                            tone={device.tripped ? 'text-accent-red' : 'text-accent-green'}
                            value={device.tripped ? 'OPEN' : device.relayOn ? 'CLOSED' : 'OPEN'}
                            caption={
                              device.tripped ? 'latched on overcurrent' : 'no active fault'
                            }
                          />
                          <Readout
                            size="md"
                            className="text-right"
                            tone="text-on-surface"
                            value={device.thresholdKnown ? fmt(device.threshold) : '—'}
                            unit="W"
                            caption="trip threshold"
                          />
                        </div>

                        <div className="mt-5">
                          <div className="mb-2 flex items-baseline justify-between font-mono text-[11px] text-on-surface-muted">
                            <span>Load against limit</span>
                            <span className={device.overloaded ? 'text-accent-red' : ''}>
                              {device.thresholdKnown ? `${Math.round(device.utilisation)}%` : '—'}
                            </span>
                          </div>
                          <WaveformBar
                            pct={device.unreachable ? 0 : device.utilisationClamped}
                            overloaded={(device.overloaded || device.tripped) && !device.unreachable}
                            offline={device.unreachable}
                            height={30}
                          />
                        </div>
                      </Panel>
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <Panel label="Trips this session" critical={session.trips > 0}>
                        <Readout layout="spread"
                          value={session.trips}
                          unit={session.trips === 1 ? 'event' : 'events'}
                          tone={session.trips > 0 ? 'text-accent-red' : 'text-on-surface'}
                        />
                      </Panel>
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <Panel label="Present load">
                        <Readout layout="spread"
                          value={device.thresholdKnown ? Math.round(device.utilisation) : '—'}
                          unit="%"
                          tone={
                            device.overloaded
                              ? 'text-accent-red'
                              : device.utilisation > 80
                                ? 'text-accent-amber'
                                : 'text-on-surface'
                          }
                          caption={
                            device.thresholdKnown
                              ? `${fmt(Math.max(0, device.threshold - device.power))} W headroom`
                              : 'threshold not published'
                          }
                        />
                      </Panel>
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <Panel label="Peak trip load">
                        <Readout layout="spread"
                          value={device.peakTripWatts != null ? fmt(device.peakTripWatts) : '—'}
                          unit="W"
                          tone={device.peakTripWatts != null ? 'text-accent-red' : 'text-on-surface-subtle'}
                          caption={device.peakTripWatts != null ? 'at the moment of trip' : 'no trip recorded'}
                        />
                      </Panel>
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <HoverPanel className="min-w-0 bg-surface-card rounded-[10px] p-1">
                        <TripCurve
                          current={device.current ?? 0}
                          threshold={device.threshold}
                          voltage={device.voltage}
                          powerFactor={device.powerFactor}
                          energised={!device.unreachable}
                        />
                      </HoverPanel>
                    </Strip>
                  </ScrollStackItem>
                </ScrollStack>
              </TabView>
            ) : null}

            {/* ── Network ────────────────────────────────────────── */}
            {activeTab === 'network' ? (
              <TabView key="network">
                <Strip>
                  <PageHeader
                    title="Network"
                    lede="What the ESP32 reports about itself. A field reads as a dash when the adapter has not published it — nothing on this screen is defaulted."
                    meta={headerMeta}
                  />
                </Strip>

                <ScrollStack>
                  <ScrollStackItem>
                    <Strip>
                      <Panel
                        label="Identity"
                        accent="amber"
                        hero
                        meta={
                          <LinkTrace
                            alive={device.connected}
                            colour={device.connected ? '#22c55e' : '#4b5262'}
                            width={54}
                          />
                        }
                        bodyClassName="px-4 py-5"
                      >
                        <div className="flex flex-wrap items-end justify-between gap-4">
                          <div className="min-w-0">
                            <p className="truncate font-display text-[26px] font-semibold leading-none tracking-tight text-on-surface lg:text-[30px]">
                              {device.deviceName ?? 'unnamed'}
                            </p>
                            <p className="panel-caption mt-2 font-mono text-on-surface-subtle">
                              {device.deviceId ?? 'MAC unreported'}
                            </p>
                          </div>
                            <Readout
                              size="md"
                              className="text-right"
                              value={device.fwVersion ?? '—'}
                              caption="firmware"
                            />
                        </div>
                      </Panel>
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <Panel
                        label="Radio"
                        meta={
                          <SignalBars
                            bars={radio.bars}
                            tone={radio.bars >= 3 ? '#22c55e' : radio.bars === 2 ? '#d97736' : '#ef4444'}
                          />
                        }
                      >
                        <Readout layout="spread"
                          value={device.rssi != null ? device.rssi : '—'}
                          unit="dBm"
                          caption={radio.label}
                        />
                      </Panel>
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <Panel label="Free heap">
                        <Readout layout="spread"
                          value={device.freeHeap != null ? (device.freeHeap / 1024).toFixed(1) : '—'}
                          unit="kB"
                          caption={device.freeHeap != null ? 'reported this packet' : 'not published'}
                        />
                      </Panel>
                    </Strip>
                  </ScrollStackItem>

                  <ScrollStackItem>
                    <Strip>
                      <Panel label="Packets">
                        <Readout layout="spread"
                          value={session.samples}
                          unit="rx"
                          caption={device.seq != null ? `seq ${String(device.seq).padStart(4, '0')}` : 'no sequence'}
                        />
                      </Panel>
                    </Strip>
                  </ScrollStackItem>
                </ScrollStack>
              </TabView>
            ) : null}
          </AnimatePresence>
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
