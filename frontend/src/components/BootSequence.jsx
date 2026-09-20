import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Power-on self test, rendered as a serial terminal on a tired CRT.
 *
 * Lines do not appear — they arrive, character by character, at a jittered
 * rate that imitates bytes landing over a 115200 baud link. Each line blooms
 * with phosphor as it lands and decays to its resting brightness a beat later.
 *
 * The tube is doing its own thing underneath: a curvature vignette, tracking
 * bars that tear across at random intervals, and a single-pixel mains hum band
 * drifting down the screen on a slow loop. The cursor leaves an afterimage
 * when it blinks off, because phosphor does not switch.
 *
 * Runs once per session, skippable on any key or pointer press.
 */

const LINES = [
  { text: 'SMARTADAPTER CONSOLE · POST', tone: 'head' },
  { text: 'chassis .................. ok' },
  { text: 'display tokens ........... ok' },
  { text: 'odometer strip ........... ok' },
  { text: 'oscillograph ............. ok' },
  { text: 'phasor engine ............ ok' },
  { text: 'field solver ............. ok' },
  { text: 'firestore channel ........ opening', tone: 'pending' },
  { text: 'telemetry/socket1 ........ subscribed', tone: 'ok' },
  { text: 'console ready', tone: 'ok' },
];

const CHAR_MS = 11;
const LINE_GAP = 95;

export default function BootSequence() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(() => {
    if (reduced) return false;
    if (typeof window === 'undefined') return true;
    if (sessionStorage.getItem('booted')) return false;
    return true;
  });
  const [typed, setTyped] = useState([]);
  const [flash, setFlash] = useState(false);
  const [bars, setBars] = useState([]);
  const timers = useRef([]);

  useEffect(() => {
    if (reduced || !visible) {
      setVisible(false);
      return undefined;
    }

    sessionStorage.setItem('booted', 'true');

    let clock = 220;
    LINES.forEach((line, li) => {
      for (let ci = 1; ci <= line.text.length; ci += 1) {
        // Jitter each character so the cadence never sounds metronomic.
        clock += CHAR_MS * (0.45 + Math.random() * 1.5);
        const at = clock;
        timers.current.push(
          setTimeout(() => {
            setTyped((prev) => {
              const next = [...prev];
              next[li] = ci;
              return next;
            });
          }, at)
        );
      }
      clock += LINE_GAP;
    });

    // Final line lands, the tube flashes, then we dissolve.
    timers.current.push(setTimeout(() => setFlash(true), clock + 60));
    timers.current.push(setTimeout(() => setFlash(false), clock + 230));
    timers.current.push(setTimeout(() => setVisible(false), clock + 520));

    // Tracking errors at irregular intervals.
    const scheduleBar = () => {
      const delay = 400 + Math.random() * 1100;
      timers.current.push(
        setTimeout(() => {
          const id = Math.random();
          setBars((b) => [...b, { id, top: Math.random() * 80, h: 1 + Math.random() * 3 }]);
          timers.current.push(
            setTimeout(() => setBars((b) => b.filter((x) => x.id !== id)), 420)
          );
          scheduleBar();
        }, delay)
      );
    };
    scheduleBar();

    const skip = () => setVisible(false);
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('pointerdown', skip, { once: true });

    return () => {
      timers.current.forEach(clearTimeout);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [reduced]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="fixed inset-0 z-[95] flex items-center justify-center overflow-hidden bg-surface"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, filter: 'brightness(2.4)' }}
          transition={{ duration: 0.42, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          {/* Scanlines */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.38]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to bottom, rgba(217,119,54,0.05) 0px, rgba(217,119,54,0.05) 1px, transparent 1px, transparent 3px)',
            }}
          />

          {/* Mains hum band */}
          <div
            className="pointer-events-none absolute inset-x-0 h-[2px] bg-white/[0.07]"
            style={{ animation: 'hum-drift 7s linear infinite' }}
          />

          {/* Tracking errors */}
          {bars.map((b) => (
            <div
              key={b.id}
              className="pointer-events-none absolute inset-x-0 bg-primary-soft/20"
              style={{
                top: `${b.top}%`,
                height: b.h,
                animation: 'crt-interference 420ms linear forwards',
                mixBlendMode: 'screen',
              }}
            />
          ))}

          <div className="relative w-[min(430px,calc(100vw-3rem))] font-mono text-[12px] leading-[21px]">
            {LINES.map((line, li) => {
              const count = typed[li] ?? 0;
              if (count === 0) return null;
              const complete = count >= line.text.length;
              return (
                <p
                  key={line.text}
                  className={
                    line.tone === 'head'
                      ? 'mb-2 tracking-[0.12em] text-primary'
                      : line.tone === 'ok'
                        ? 'text-accent-green'
                        : line.tone === 'pending'
                          ? 'text-primary-soft'
                          : 'text-on-surface-muted'
                  }
                  style={{
                    // Phosphor bloom while the line is still landing.
                    textShadow: complete
                      ? 'none'
                      : '0 0 9px rgba(255,182,140,0.75), 0 0 2px rgba(255,255,255,0.5)',
                    transition: 'text-shadow 340ms ease-out',
                  }}
                >
                  {line.text.slice(0, count)}
                </p>
              );
            })}

            {/* Cursor with its afterimage */}
            <span className="relative mt-1 inline-block align-middle">
              <motion.span
                className="block h-[13px] w-[7px] bg-primary"
                animate={{ opacity: [1, 1, 0, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
              />
              <motion.span
                className="absolute inset-0 block bg-primary/30 blur-[1px]"
                animate={{ opacity: [0.45, 0.45, 0.22, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, times: [0, 0.5, 0.62, 1] }}
              />
            </span>
          </div>

          {/* Tube curvature */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 78% 68% at 50% 50%, transparent 42%, rgba(0,0,0,0.55) 82%, rgba(0,0,0,0.9) 100%)',
            }}
          />

          {/* Ready flash */}
          <AnimatePresence>
            {flash ? (
              <motion.div
                className="pointer-events-none absolute inset-0 bg-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.4, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
              />
            ) : null}
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
