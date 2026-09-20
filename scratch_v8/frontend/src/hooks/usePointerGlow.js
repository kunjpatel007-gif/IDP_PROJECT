import { useCallback, useRef, useState } from 'react';

/**
 * Pointer-tracked light on a panel face.
 *
 * Writes the cursor position straight onto the element as `--px` / `--py`
 * custom properties rather than through React state. A spotlight that
 * re-rendered a subtree on every pointermove would cost more than everything
 * else on the page put together; this way the browser just recomputes one
 * gradient on the compositor.
 *
 * `hovering` is state, because it changes about twice per panel per minute.
 */
export function usePointerGlow() {
  const ref = useRef(null);
  const [hovering, setHovering] = useState(false);

  const onPointerMove = useCallback((event) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty('--px', `${event.clientX - rect.left}px`);
    node.style.setProperty('--py', `${event.clientY - rect.top}px`);
  }, []);

  const onPointerEnter = useCallback(
    (event) => {
      setHovering(true);
      onPointerMove(event);
    },
    [onPointerMove]
  );

  const onPointerLeave = useCallback(() => setHovering(false), []);

  return { ref, hovering, handlers: { onPointerMove, onPointerEnter, onPointerLeave } };
}
