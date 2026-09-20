import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import { IconCheck } from '@/components/Icons';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Hardware actuator.
 *
 * The button carries a miniature of the thing it operates: a relay whose
 * contact arm lifts off its terminal when you open the circuit and drops back
 * when you close it, or a breaker lever that snaps over on a reset. Pressing
 * it sinks the surface by a pixel. The mechanism is the feedback — you should
 * be able to tell what happened at the socket without reading the label.
 */

const COPY = {
  ON: {
    idle: 'Turn On',
    busy: 'Closing…',
    done: 'Command sent',
    tooltip: 'Closes the relay and re-energises the socket. The adapter picks this up within 2 seconds.',
  },
  OFF: {
    idle: 'Turn Off',
    busy: 'Opening…',
    done: 'Command sent',
    tooltip: 'Opens the relay and cuts power at the socket. Anything plugged in loses power immediately.',
  },
  RESET: {
    idle: 'Reset Breaker',
    busy: 'Resetting…',
    done: 'Reset sent',
    tooltip:
      'Clears the trip latch and re-closes the breaker. If the overload is still connected it will trip straight back out.',
  },
};

function RelayGlyph({ phase, tone }) {
  return (
    <svg
      width="18"
      height="13"
      viewBox="0 0 18 13"
      fill="none"
      aria-hidden="true"
      className={phase === 'open' ? 'contact-open' : phase === 'close' ? 'contact-close' : ''}
    >
      <circle cx="2.5" cy="9.5" r="1.6" fill={tone} />
      <circle cx="15.5" cy="9.5" r="1.6" fill={tone} fillOpacity="0.55" />
      <path d="M2.5 12.5v-3M15.5 12.5v-3" stroke={tone} strokeOpacity="0.4" strokeWidth="1" />
      <g className="contact-arm" style={{ transformOrigin: '2.5px 9.5px' }}>
        <path d="M2.5 9.5H15" stroke={tone} strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function BreakerGlyph({ flipping, tone }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={flipping ? 'breaker-flip' : ''}
    >
      <rect x="1" y="1" width="12" height="12" rx="1.5" stroke={tone} strokeOpacity="0.55" strokeWidth="1" />
      <g className="breaker-lever" style={{ transformOrigin: '7px 10px' }}>
        <path d="M7 10V3.5" stroke={tone} strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="7" cy="3.2" r="1.35" fill={tone} />
      </g>
    </svg>
  );
}

export default function ControlButton({
  command,
  onCommand,
  disabled = false,
  busy: externalBusy = false,
  className = '',
}) {
  const reduced = useReducedMotion();
  const tooltipId = useId();
  const [phase, setPhase] = useState('idle'); // idle | busy | done
  const [glyphPhase, setGlyphPhase] = useState(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [ripple, setRipple] = useState(null);

  // Magnetic pull: the actuator drifts a couple of pixels toward the cursor,
  // enough that it feels like it wants to be pressed, not enough to move the
  // hit area out from under the pointer.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 300, damping: 20, mass: 0.4 });
  const sy = useSpring(my, { stiffness: 300, damping: 20, mass: 0.4 });

  const onMagnet = (event) => {
    if (reduced || event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    mx.set((event.clientX - (rect.left + rect.width / 2)) * 0.16);
    my.set((event.clientY - (rect.top + rect.height / 2)) * 0.22);
  };
  const releaseMagnet = () => {
    mx.set(0);
    my.set(0);
  };
  const timers = useRef([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    []
  );

  const copy = COPY[command] ?? COPY.OFF;
  const isReset = command === 'RESET';
  const busy = phase === 'busy' || externalBusy;
  const done = phase === 'done';

  const handleClick = async (event) => {
    if (busy || disabled) return;

    // Light spreads from where the cap was actually struck.
    const rect = event.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setRipple({ id, x: event.clientX - rect.left, y: event.clientY - rect.top });
    setTimeout(() => setRipple((r) => (r && r.id === id ? null : r)), 620);

    setPhase('busy');
    // Fire the mechanism immediately — the user acted, the UI acknowledges now.
    setGlyphPhase(command === 'OFF' ? 'open' : command === 'ON' ? 'close' : 'flip');

    try {
      await onCommand(command);
      setPhase('done');
      timers.current.push(setTimeout(() => setPhase('idle'), 1900));
    } catch {
      // The toast carries the error; the button just returns to rest.
      setPhase('idle');
      setGlyphPhase(command === 'OFF' ? 'close' : 'open');
    } finally {
      timers.current.push(setTimeout(() => setGlyphPhase(null), 600));
    }
  };

  const palette = isReset
    ? {
        base: 'bg-surface-well text-accent-red border-accent-red-deep hover:bg-accent-red-deep hover:text-on-surface hover:border-accent-red',
        glyph: 'currentColor',
      }
    : {
        base: 'bg-surface-well text-on-surface border-border-muted hover:bg-surface-card-hover hover:border-on-surface-muted',
        glyph: 'currentColor',
      };

  const label = busy ? copy.busy : done ? copy.done : copy.idle;

  return (
    <div className="relative">
      <motion.button
        type="button"
        style={{ x: sx, y: sy }}
        onPointerMove={onMagnet}
        onClick={handleClick}
        disabled={disabled || busy}
        aria-describedby={tipOpen ? tooltipId : undefined}
        aria-busy={busy}
        onMouseEnter={() => setTipOpen(true)}
        onMouseLeave={() => {
          setTipOpen(false);
          releaseMagnet();
        }}
        onFocus={() => setTipOpen(true)}
        onBlur={() => setTipOpen(false)}
        className={`actuator relative isolate inline-flex h-10 items-center gap-2 overflow-hidden rounded border px-3.5 font-body text-[13px] font-medium shadow-[0_2px_0_0_rgba(0,0,0,0.45)] active:shadow-none lg:h-8 lg:px-3 lg:text-[12px] ${palette.base} ${className}`}
      >
        {/* Textured cap */}
        <span
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-conic-gradient(rgba(255,255,255,0.8) 0% 25%, transparent 0% 50%)',
            backgroundSize: '3px 3px',
          }}
        />
        {ripple ? (
          <motion.span
            key={ripple.id}
            className="pointer-events-none absolute -z-10 h-2 w-2 rounded-full bg-current"
            style={{ left: ripple.x, top: ripple.y }}
            initial={{ scale: 0, opacity: 0.45 }}
            animate={{ scale: 26, opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        ) : null}
        {done ? (
          <motion.span
            className="pointer-events-none absolute inset-0 -z-10 border border-accent-green"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.9 }}
          />
        ) : null}
        <span className="flex w-[18px] items-center justify-center">
          {busy ? (
            <span className="btn-spinner" />
          ) : done ? (
            <IconCheck width={13} height={13} />
          ) : isReset ? (
            <BreakerGlyph flipping={glyphPhase === 'flip'} tone={palette.glyph} />
          ) : (
            <RelayGlyph phase={glyphPhase} tone={palette.glyph} />
          )}
        </span>
        <span className="tabular-nums">{label}</span>
      </motion.button>

      <AnimatePresence>
        {tipOpen && !busy ? (
          <motion.div
            id={tooltipId}
            role="tooltip"
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-[min(15rem,calc(100vw-3rem))] rounded border border-border-muted bg-surface-subtle px-3 py-2 text-[11px] leading-[16px] text-on-surface-muted shadow-flyout"
          >
            {copy.tooltip}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
