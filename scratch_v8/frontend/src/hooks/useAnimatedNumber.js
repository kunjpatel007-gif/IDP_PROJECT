import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Damped-spring numeric tween.
 *
 * Counters do not jump. A meter needle has mass, so the displayed value is
 * integrated toward the target each frame rather than assigned. Slightly
 * under-damped so values arrive with one small overshoot — the way a moving
 * coil instrument settles.
 *
 * @param {number} target
 * @param {{stiffness?: number, damping?: number, precision?: number}} opts
 * @returns {number} the current animated value
 */
export function useAnimatedNumber(target, opts = {}) {
  const { stiffness = 130, damping = 20, precision = 0.05 } = opts;

  const reduced = useReducedMotion();
  const safeTarget = Number.isFinite(target) ? target : 0;

  const [display, setDisplay] = useState(safeTarget);
  const motion = useRef({ value: safeTarget, velocity: 0 });

  useEffect(() => {
    if (reduced) {
      motion.current.value = safeTarget;
      motion.current.velocity = 0;
      setDisplay(safeTarget);
      return undefined;
    }

    let frame;
    let last = performance.now();

    const tick = (nowTs) => {
      // Clamp dt so a backgrounded tab does not detonate the integrator.
      const dt = Math.min((nowTs - last) / 1000, 1 / 20);
      last = nowTs;

      const state = motion.current;
      const displacement = state.value - safeTarget;
      const accel = -stiffness * displacement - damping * state.velocity;

      state.velocity += accel * dt;
      state.value += state.velocity * dt;

      if (Math.abs(state.value - safeTarget) < precision && Math.abs(state.velocity) < precision) {
        state.value = safeTarget;
        state.velocity = 0;
        setDisplay(safeTarget);
        return;
      }

      setDisplay(state.value);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [safeTarget, stiffness, damping, precision, reduced]);

  return display;
}
