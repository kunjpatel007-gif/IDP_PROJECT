import { useCallback } from 'react';
import { useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Panels that lean toward the cursor.
 *
 * Kept deliberately shallow — a few degrees. A steep tilt turns a readout
 * into a novelty and makes tabular figures harder to read at a glance, which
 * is the opposite of what an instrument panel is for. This is just enough
 * parallax that the surface feels like a physical face catching light.
 *
 * Springs, not raw values, so the panel has some mass and keeps moving for a
 * beat after the cursor stops.
 */
export function useTilt({ max = 4.5 } = {}) {
  const reduced = useReducedMotion();
  const limit = reduced ? 0 : max;

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const spring = { stiffness: 170, damping: 18, mass: 0.6 };
  const sx = useSpring(px, spring);
  const sy = useSpring(py, spring);

  const rotateY = useTransform(sx, [0, 1], [-limit, limit]);
  const rotateX = useTransform(sy, [0, 1], [limit, -limit]);

  const onPointerMove = useCallback(
    (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      px.set((event.clientX - rect.left) / Math.max(1, rect.width));
      py.set((event.clientY - rect.top) / Math.max(1, rect.height));
    },
    [px, py]
  );

  const onPointerLeave = useCallback(() => {
    px.set(0.5);
    py.set(0.5);
  }, [px, py]);

  return { rotateX, rotateY, handlers: { onPointerMove, onPointerLeave }, reduced };
}
