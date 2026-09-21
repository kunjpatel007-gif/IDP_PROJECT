import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Lenis from 'lenis';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Smooth scroll for the whole console.
 *
 * One Lenis instance, mounted once at the root, driving every screen. The
 * ScrollStack component from React Bits creates its own instance per mount —
 * which here would mean a fresh smooth-scroll engine every time you change
 * tab, four of them fighting over `window.scrollY` during the crossfade. It
 * consumes this one instead.
 *
 * Window scroll only, deliberately. Lenis can drive a nested `overflow: auto`
 * container, but this build has `position: fixed` on the backdrop canvases,
 * the sidebar, the trip overlay and the packet badge, plus `sticky` on the
 * mobile topbar. A scrolling ancestor with a transform on it becomes their
 * containing block and all of that breaks at once.
 *
 * Reduced motion gets no Lenis at all. Hijacking the scroll wheel is exactly
 * the kind of thing that setting exists to switch off, and native scrolling
 * is the correct fallback rather than a degraded imitation of one.
 */

const ScrollContext = createContext({
  lenis: null,
  subscribe: () => () => {},
  scrollTo: () => {},
});

export function useLenis() {
  return useContext(ScrollContext);
}

export default function SmoothScroll({
  children,
  lerp = 0.095,
  wheelMultiplier = 1,
}) {
  const reduced = useReducedMotion();
  const [lenis, setLenis] = useState(null);

  useEffect(() => {
    if (reduced) {
      setLenis(null);
      return undefined;
    }

    const instance = new Lenis({
      lerp,
      wheelMultiplier,
      touchMultiplier: 1.6,
      smoothWheel: true,
      // Touch is left native. Synthesised touch scrolling fights the OS
      // rubber-banding and reads as lag on a phone.
      syncTouch: false,
      autoRaf: false,
    });

    let frame = requestAnimationFrame(function raf(time) {
      instance.raf(time);
      frame = requestAnimationFrame(raf);
    });

    // A backgrounded tab should not be integrating scroll.
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) {
        frame = requestAnimationFrame(function raf(time) {
          instance.raf(time);
          frame = requestAnimationFrame(raf);
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    setLenis(instance);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      instance.destroy();
      setLenis(null);
    };
  }, [reduced, lerp, wheelMultiplier]);

  /** Subscribe to scroll, through Lenis when it exists and natively when it does not. */
  const subscribe = useCallback(
    (fn) => {
      if (lenis) {
        lenis.on('scroll', fn);
        return () => lenis.off('scroll', fn);
      }
      window.addEventListener('scroll', fn, { passive: true });
      return () => window.removeEventListener('scroll', fn);
    },
    [lenis]
  );

  /** Programmatic scroll has to go through Lenis or Lenis will drag it back. */
  const scrollTo = useCallback(
    (target, options = {}) => {
      if (lenis) {
        lenis.scrollTo(target, { immediate: true, force: true, ...options });
        return;
      }
      window.scrollTo({ top: typeof target === 'number' ? target : 0, behavior: 'auto' });
    },
    [lenis]
  );

  const value = useMemo(() => ({ lenis, subscribe, scrollTo }), [lenis, subscribe, scrollTo]);

  return <ScrollContext.Provider value={value}>{children}</ScrollContext.Provider>;
}
