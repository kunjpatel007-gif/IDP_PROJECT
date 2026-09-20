import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Command round trip, drawn as it happens.
 *
 * The backend is one Cloud Function and one document, which sells itself
 * badly in a viva. So when an operator presses a control, the four hops the
 * command actually takes are staged on screen with their real budgets:
 *
 *   write to Firestore   ~200ms   (resolved — we await the setDoc)
 *   adapter polls        ≤2000ms  (the ESP32 command poll interval)
 *   relay actuates       ~120ms   (mechanical)
 *   telemetry confirms   ≤5000ms  (the next push carries relay_on)
 *
 * The last stage does not run on a timer: it closes when a snapshot actually
 * arrives reporting the commanded relay state, so the tick is a real
 * confirmation from the hardware rather than an animation that always
 * succeeds. If nothing comes back inside the window it says so.
 */

const STAGES = [
  { id: 'write', label: 'Write command', node: 'Firestore', budget: 600 },
  { id: 'poll', label: 'Adapter polls', node: 'ESP32', budget: 2000 },
  { id: 'actuate', label: 'Relay actuates', node: 'Contact', budget: 700 },
  { id: 'confirm', label: 'Telemetry confirms', node: 'Dashboard', budget: 5200 },
];

export default function CommandPipeline({ run, command, confirmed, onDone }) {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(-1);
  const [outcome, setOutcome] = useState(null); // 'confirmed' | 'timeout'
  const timers = useRef([]);

  const clearAll = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    if (!run) return undefined;
    clearAll();
    setOutcome(null);
    setStage(0);

    let elapsed = 0;
    STAGES.slice(0, 3).forEach((s, index) => {
      elapsed += s.budget;
      timers.current.push(setTimeout(() => setStage(index + 1), elapsed));
    });

    // Hard stop: the confirmation window closes whether or not it lands.
    timers.current.push(
      setTimeout(() => {
        setOutcome((prev) => prev ?? 'timeout');
      }, elapsed + STAGES[3].budget)
    );

    return clearAll;
  }, [run]);

  // Real hardware confirmation closes the last stage early.
  useEffect(() => {
    if (!run || stage < 3 || !confirmed) return;
    setOutcome('confirmed');
  }, [run, stage, confirmed]);

  useEffect(() => {
    if (!outcome) return undefined;
    const t = setTimeout(() => {
      setStage(-1);
      setOutcome(null);
      onDone?.();
    }, 1800);
    return () => clearTimeout(t);
  }, [outcome, onDone]);

  useEffect(() => clearAll, []);

  const visible = run && stage >= 0;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="mb-4 border border-border-muted bg-surface-card">
            <div className="flex h-7 items-center justify-between border-b border-border-subtle px-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-muted">
                Command in flight
              </span>
              <span className="font-mono text-[10px] tracking-[0.05em] text-primary-soft">
                {command}
              </span>
            </div>

            <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center">
              {STAGES.map((s, index) => {
                const done =
                  index < stage || (index === 3 && outcome === 'confirmed');
                const active = index === stage && !outcome;
                const failed = index === 3 && outcome === 'timeout';

                return (
                  <div key={s.id} className="flex flex-1 items-center gap-2">
                    <div
                      className={`flex flex-1 flex-col gap-1.5 ${
                        index === 3 && active && !reduced ? 'anxious-jitter' : ''
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`font-mono text-[10px] tracking-[0.04em] ${
                            failed
                              ? 'text-accent-red'
                              : done
                                ? 'text-on-surface'
                                : active
                                  ? 'text-primary-soft'
                                  : 'text-on-surface-subtle'
                          }`}
                        >
                          {s.label}
                        </span>
                        <span className="font-mono text-[9px] tracking-[0.04em] text-on-surface-subtle">
                          {s.node}
                        </span>
                      </div>

                      <div className="relative h-[3px] overflow-hidden bg-surface-subtle shadow-well">
                        <motion.div
                          className="absolute inset-y-0 left-0 origin-left"
                          style={{
                            background: failed ? '#ef4444' : done ? '#22c55e' : '#d97736',
                          }}
                          initial={{ scaleX: done ? 1 : 0 }}
                          animate={{ scaleX: done || failed ? 1 : active ? 1 : 0 }}
                          transition={{
                            duration: reduced ? 0 : active ? s.budget / 1000 : 0.2,
                            ease: active ? 'linear' : 'easeOut',
                          }}
                        />
                      </div>
                    </div>

                    {index < STAGES.length - 1 ? (
                      <span className="hidden h-px w-4 shrink-0 self-center overflow-hidden sm:block">
                        <motion.span
                          className="block h-px w-[300%]"
                          style={{
                            backgroundImage:
                              'repeating-linear-gradient(90deg, #d97736 0 4px, transparent 4px 9px)',
                          }}
                          animate={done ? { x: ['0%', '-66%'] } : { x: '0%' }}
                          transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                        />
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Overall progress with a glowing leading edge */}
            <div className="relative mx-3 mb-3 h-[2px] overflow-hidden bg-surface-subtle">
              <motion.div
                className="absolute inset-y-0 left-0 bg-primary shadow-[0_0_8px_1px_rgba(217,119,54,0.8)]"
                animate={{
                  width: `${((outcome ? 4 : Math.max(0, stage)) / STAGES.length) * 100}%`,
                }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>

            {outcome ? (
              <div
                className={`border-t px-3 py-2 font-mono text-[11px] ${
                  outcome === 'confirmed'
                    ? 'border-accent-green/25 text-accent-green'
                    : 'border-accent-red/30 text-accent-red'
                }`}
              >
                {outcome === 'confirmed'
                  ? 'Hardware confirmed the new relay state.'
                  : 'No confirmation inside the window — the command may still land on the next poll.'}
              </div>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
