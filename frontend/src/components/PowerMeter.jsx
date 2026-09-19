import { useEffect, useRef, useState } from 'react';
import { usePrevious } from '@/hooks/usePrevious';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const ROLL_MS = 760;
const STAGGER_MS = 44;

/**
 * The strip carries three stacked copies of 0–9. A digit is always parked in
 * the middle copy, which leaves a full revolution of headroom in either
 * direction — so 9 → 0 on a rising value rolls *forward* through the wrap
 * instead of spinning backwards through 8,7,6. Once the transition lands, the
 * strip snaps silently back into the middle copy with the transition off.
 * The strip is periodic, so that snap is invisible.
 */
const STRIP = Array.from({ length: 30 }, (_, i) => i % 10);
const HOME = 10;

function RollingDigit({ digit, direction, delay, reduced }) {
  const [pos, setPos] = useState(() => HOME + digit);
  const [animating, setAnimating] = useState(true);
  const [rolling, setRolling] = useState(false);

  const posRef = useRef(HOME + digit);
  const prevDigit = useRef(digit);
  const snapTimer = useRef(null);
  const rollTimer = useRef(null);

  useEffect(() => {
    if (prevDigit.current === digit) return undefined;

    const from = prevDigit.current;
    prevDigit.current = digit;

    if (reduced) {
      const home = HOME + digit;
      posRef.current = home;
      setAnimating(false);
      setPos(home);
      return undefined;
    }

    // Travel in the direction the whole number moved, wrapping if needed.
    const forward = (digit - from + 10) % 10;
    const backward = (from - digit + 10) % 10;
    const step = direction >= 0 ? forward : -backward;

    const next = posRef.current + step;
    posRef.current = next;

    setAnimating(true);
    setPos(next);
    setRolling(true);

    clearTimeout(rollTimer.current);
    rollTimer.current = setTimeout(() => setRolling(false), ROLL_MS + delay);

    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      const home = HOME + (((next % 10) + 10) % 10);
      posRef.current = home;
      setAnimating(false);
      setPos(home);
      // Two frames: one to paint the un-transitioned snap, one to re-arm.
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    }, ROLL_MS + delay + 80);

    return () => {
      clearTimeout(snapTimer.current);
      clearTimeout(rollTimer.current);
    };
  }, [digit, direction, delay, reduced]);

  return (
    <span className="rd-slot">
      <span
        className={`rd-strip${rolling ? ' is-rolling' : ''}`}
        style={{
          transform: `translateY(-${(pos * 100) / STRIP.length}%)`,
          transition: animating ? undefined : 'none',
          transitionDelay: animating ? `${delay}ms` : undefined,
        }}
      >
        {STRIP.map((d, i) => (
          <span className="rd-cell" key={i}>
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * @param {number} value            the reading
 * @param {number} decimals         fixed decimal places
 * @param {string} unit             engineering unit, rendered separately
 * @param {'normal'|'critical'|'muted'} tone
 * @param {boolean} countUpOnMount  roll from zero on first paint (boot sequence)
 * @param {number} flashDelta       absolute change that triggers the flash pulse
 */
export default function PowerMeter({
  value = 0,
  decimals = 0,
  unit = 'W',
  tone = 'normal',
  countUpOnMount = true,
  flashDelta = 50,
  bootDelay = 520,
  valueClassName = 'font-mono text-5xl font-light tracking-tight',
  unitClassName = 'font-mono text-lg',
  ariaLabel,
}) {
  const reduced = useReducedMotion();
  const safeValue = Number.isFinite(value) ? value : 0;

  const [shown, setShown] = useState(() => (countUpOnMount && !reduced ? 0 : safeValue));
  const mounted = useRef(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (countUpOnMount && !reduced) {
        const t = setTimeout(() => setShown(safeValue), bootDelay);
        return () => clearTimeout(t);
      }
    }
    setShown(safeValue);
    return undefined;
  }, [safeValue, countUpOnMount, bootDelay, reduced]);

  const previous = usePrevious(shown);
  const delta = previous == null ? 0 : shown - previous;
  const direction = delta >= 0 ? 1 : -1;

  // A jump worth noticing gets a pulse before it settles.
  useEffect(() => {
    if (reduced) return undefined;
    if (previous == null || Math.abs(delta) < flashDelta) return undefined;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 480);
    return () => clearTimeout(t);
  }, [shown, delta, flashDelta, previous, reduced]);

  const text = shown.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const chars = text.split('');
  const toneClass =
    tone === 'critical'
      ? 'text-accent-red'
      : tone === 'muted'
        ? 'text-on-surface-subtle'
        : 'text-on-surface';

  const unitTone =
    tone === 'critical'
      ? 'text-accent-red/80'
      : tone === 'muted'
        ? 'text-on-surface-subtle'
        : 'text-on-surface-muted';

  const flashClass = flash ? (tone === 'critical' ? 'metric-flash-critical' : 'metric-flash') : '';

  return (
    <div className="flex items-baseline gap-2">
      <span
        className={`odometer ${valueClassName} ${toneClass} ${flashClass}`}
        role="status"
        aria-label={ariaLabel ?? `${text} ${unit}`}
      >
        {chars.map((char, index) => {
          // Key from the right: adding a digit must not remount the others.
          const keyFromRight = chars.length - index;
          if (char >= '0' && char <= '9') {
            const digitsRemaining = chars.slice(index + 1).filter((c) => c >= '0' && c <= '9').length;
            return (
              <RollingDigit
                key={`d${keyFromRight}`}
                digit={Number(char)}
                direction={direction}
                delay={digitsRemaining * STAGGER_MS}
                reduced={reduced}
              />
            );
          }
          return (
            <span
              key={`s${keyFromRight}`}
              className="rd-static"
              style={{ width: char === ',' ? '0.42ch' : '0.6ch' }}
            >
              {char}
            </span>
          );
        })}
      </span>
      {unit ? <span className={`${unitClassName} ${unitTone}`}>{unit}</span> : null}
    </div>
  );
}
