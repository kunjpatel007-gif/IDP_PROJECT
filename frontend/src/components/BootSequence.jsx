import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Power-on self test.
 *
 * Runs once, on the first load of the session, for about two and a half
 * seconds. Instrument racks announce themselves when they come up, and this
 * is the console doing the same: checked lines scroll past, the last one
 * hands over to the live link, then it wipes.
 *
 * It is skippable on any key or click, because the second time you see it
 * during a rehearsal it stops being an entrance and starts being a delay.
 */

const LINES = [
  { t: 120, text: 'SMARTADAPTER CONSOLE · POST', tone: 'head' },
  { t: 420, text: 'chassis .................. ok' },
  { t: 640, text: 'display tokens ........... ok' },
  { t: 860, text: 'odometer strip ........... ok' },
  { t: 1080, text: 'oscillograph ............. ok' },
  { t: 1300, text: 'phasor engine ............ ok' },
  { t: 1540, text: 'firestore channel ........ opening', tone: 'pending' },
  { t: 1860, text: 'telemetry/socket1 ........ subscribed', tone: 'ok' },
  { t: 2100, text: 'console ready', tone: 'ok' },
];

const TOTAL = 2650;

export default function BootSequence() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(!reduced);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduced) {
      setVisible(false);
      return undefined;
    }

    const timers = LINES.map((line, index) =>
      setTimeout(() => setShown(index + 1), line.t)
    );
    const end = setTimeout(() => setVisible(false), TOTAL);

    const skip = () => {
      setVisible(false);
    };
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('pointerdown', skip, { once: true });

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(end);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [reduced]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-surface"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          {/* Scanlines */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to bottom, rgba(217,119,54,0.045) 0px, rgba(217,119,54,0.045) 1px, transparent 1px, transparent 3px)',
            }}
          />

          <motion.div
            className="relative w-[min(420px,calc(100vw-3rem))] font-mono text-[12px] leading-[20px]"
            exit={{ y: -14, opacity: 0 }}
            transition={{ duration: 0.34 }}
          >
            {LINES.slice(0, shown).map((line) => (
              <motion.p
                key={line.text}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.16 }}
                className={
                  line.tone === 'head'
                    ? 'mb-2 tracking-[0.12em] text-primary'
                    : line.tone === 'ok'
                      ? 'text-accent-green'
                      : line.tone === 'pending'
                        ? 'text-primary-soft'
                        : 'text-on-surface-muted'
                }
              >
                {line.text}
              </motion.p>
            ))}
            <motion.span
              className="mt-1 inline-block h-[13px] w-[7px] bg-primary align-middle"
              animate={{ opacity: [1, 1, 0, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
            />
          </motion.div>

        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
