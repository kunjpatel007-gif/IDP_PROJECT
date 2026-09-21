import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useLenis } from '@/components/SmoothScroll';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import './ScrollStack.css';

/**
 * Pinned card stack, adapted from React Bits.
 *
 * Six things had to change before this could drive a live instrument panel
 * rather than a marketing page:
 *
 * 1. It made its own Lenis. Four tabs mounting and unmounting meant four
 *    engines contending for `window.scrollY`. It takes the app-wide one now.
 * 2. Its window-scroll path measured cards with `getBoundingClientRect()`,
 *    which reports the *post-transform* rect. Once a card was pinned, its
 *    measured top included the translate it had just been given, which fed
 *    straight back into the next frame's translate. Layout offsets come off
 *    the `offsetTop` chain instead, which transforms do not touch.
 * 3. It queried `document.querySelectorAll('.scroll-stack-card')` — every
 *    card on the page, including any belonging to another instance. Scoped
 *    to its own subtree now.
 * 4. It re-measured every card every frame. Metrics are cached and refreshed
 *    on resize, which matters here because panels change height when a fault
 *    banner appears or the adapter card finishes its boot.
 * 5. A card taller than the viewport cannot be pinned — you would never be
 *    able to reach its bottom edge. Those are left to scroll normally, and
 *    the cards after them still stack.
 * 6. The end spacer was a flat `50rem` of padding, which on a short screen is
 *    half a page of nothing. It is sized from the content now, and is zero
 *    when the content does not overflow.
 */

export const ScrollStackItem = ({ children, className = '', pin = true }) => (
  <div className={`scroll-stack-card ${className}`.trim()} data-pin={pin ? 'true' : 'false'}>
    {children}
  </div>
);

/** Document-relative top, immune to any transform applied to the element. */
function layoutTop(element) {
  let y = 0;
  let node = element;
  while (node) {
    y += node.offsetTop;
    node = node.offsetParent;
  }
  return y;
}

function parseLength(value, basis) {
  if (typeof value === 'string' && value.trim().endsWith('%')) {
    return (parseFloat(value) / 100) * basis;
  }
  if (typeof value === 'string' && value.trim().endsWith('vh')) {
    return (parseFloat(value) / 100) * basis;
  }
  return parseFloat(value) || 0;
}

export default function ScrollStack({
  children,
  className = '',
  /** Gap between cards before any stacking happens. */
  itemDistance = 16,
  /** How much larger each successive card ends up, so the stack reads as depth. */
  itemScale = 0.018,
  /** Vertical offset between pinned cards — the visible lip of each one. */
  itemStackDistance = 10,
  /** Where a card locks, as a fraction of viewport height from the top. */
  stackPosition = '15%',
  /** Where its scale-down finishes. */
  scaleEndPosition = '8%',
  /** Scale of the deepest card in the stack. */
  baseScale = 0.93,
  rotationAmount = 0,
  blurAmount = 0,
  /** Cards taller than this fraction of the viewport are never pinned. */
  maxPinRatio = 0.7,
  /** Scroll runway after the last card, so its pin has room to release. */
  endSpacer = '44vh',
  onStackComplete,
}) {
  const reduced = useReducedMotion();
  const { lenis, subscribe } = useLenis();

  const rootRef = useRef(null);
  const endRef = useRef(null);
  const cardsRef = useRef([]);
  const metricsRef = useRef([]);
  const endTopRef = useRef(0);
  const lastRef = useRef(new Map());
  const completedRef = useRef(false);
  const frameRef = useRef(null);
  const onCompleteRef = useRef(onStackComplete);
  onCompleteRef.current = onStackComplete;

  /* ── Measure ──────────────────────────────────────────────────
     Layout only. Runs on mount, on resize, and whenever a panel
     inside the stack changes height. Never per frame. */
  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const inner = root.querySelector('.scroll-stack-inner');
    const cards = inner ? Array.from(inner.children).filter((n) =>
      n.classList.contains('scroll-stack-card')
    ) : [];
    cardsRef.current = cards;

    const vh = window.innerHeight;

    metricsRef.current = cards.map((card, i) => {
      if (i < cards.length - 1) card.style.marginBottom = `${itemDistance}px`;
      else card.style.marginBottom = '0px';

      // Later cards sit on top of earlier ones — this is what prevents
      // cards from bleeding through each other when scrolling back up.
      card.style.zIndex = String(i + 1);

      const height = card.offsetHeight;
      return {
        top: layoutTop(card),
        height,
        // A card you cannot see the bottom of is a card you cannot read.
        pinnable: card.dataset.pin !== 'false' && height <= vh * maxPinRatio,
      };
    });

    // Runway is only worth paying for if there is something to release.
    const end = endRef.current;
    if (end) {
      const pinnedCount = metricsRef.current.filter((m) => m.pinnable).length;
      const contentHeight = inner ? inner.offsetHeight : 0;
      const needsRunway = pinnedCount >= 2 && contentHeight > vh;
      end.style.height = needsRunway ? `${parseLength(endSpacer, vh)}px` : '0px';
      endTopRef.current = layoutTop(end);
    }
  }, [itemDistance, maxPinRatio, endSpacer]);

  /* ── Apply ────────────────────────────────────────────────────
     Runs on every scroll frame. Reads no layout, writes only when a
     value has actually moved. */
  const apply = useCallback(() => {
    const cards = cardsRef.current;
    const metrics = metricsRef.current;
    if (!cards.length) return;

    const scrollTop = window.scrollY;
    const vh = window.innerHeight;
    const stackPx = parseLength(stackPosition, vh);
    const scaleEndPx = parseLength(scaleEndPosition, vh);
    const releaseAt = endTopRef.current - vh * 0.5;

    // Which card currently sits on top, for depth-ordered blur.
    let topIndex = 0;
    for (let j = 0; j < metrics.length; j += 1) {
      if (metrics[j].pinnable && scrollTop >= metrics[j].top - stackPx - itemStackDistance * j) {
        topIndex = j;
      }
    }

    for (let i = 0; i < cards.length; i += 1) {
      const card = cards[i];
      const m = metrics[i];
      if (!card || !m) continue;

      let translateY = 0;
      let scale = 1;
      let rotation = 0;
      let blur = 0;

      if (m.pinnable) {
        const pinTop = m.top - stackPx - itemStackDistance * i;
        const scaleEnd = m.top - scaleEndPx;

        const span = scaleEnd - pinTop;
        const progress = span > 0 ? Math.min(1, Math.max(0, (scrollTop - pinTop) / span)) : 0;

        const targetScale = baseScale + i * itemScale;
        scale = 1 - progress * (1 - targetScale);
        rotation = rotationAmount ? i * rotationAmount * progress : 0;

        if (scrollTop >= pinTop && releaseAt > pinTop) {
          translateY = Math.min(scrollTop, releaseAt) - pinTop;
        }

        if (blurAmount && i < topIndex) {
          blur = (topIndex - i) * blurAmount;
        }
      }

      const next = {
        y: Math.round(translateY * 100) / 100,
        s: Math.round(scale * 1000) / 1000,
        r: Math.round(rotation * 100) / 100,
        b: Math.round(blur * 100) / 100,
      };

      const prev = lastRef.current.get(i);
      const changed =
        !prev ||
        Math.abs(prev.y - next.y) > 0.1 ||
        Math.abs(prev.s - next.s) > 0.001 ||
        Math.abs(prev.r - next.r) > 0.1 ||
        Math.abs(prev.b - next.b) > 0.1;

      if (changed) {
        card.style.transform = `translate3d(0, ${next.y}px, 0) scale(${next.s})${
          next.r ? ` rotate(${next.r}deg)` : ''
        }`;
        card.style.filter = next.b > 0 ? `blur(${next.b}px)` : '';
        lastRef.current.set(i, next);
      }
    }

    // Completion fires on the last pinnable card reaching its lock point.
    const lastPinnable = metrics.reduce((acc, m, i) => (m.pinnable ? i : acc), -1);
    if (lastPinnable >= 0) {
      const m = metrics[lastPinnable];
      const pinTop = m.top - stackPx - itemStackDistance * lastPinnable;
      const inView = scrollTop >= pinTop && scrollTop <= releaseAt;
      if (inView && !completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      } else if (!inView && completedRef.current) {
        completedRef.current = false;
      }
    }
  }, [
    stackPosition,
    scaleEndPosition,
    itemStackDistance,
    itemScale,
    baseScale,
    rotationAmount,
    blurAmount,
  ]);

  /** Coalesce to one write per frame regardless of how the scroll arrived. */
  const schedule = useCallback(() => {
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      apply();
    });
  }, [apply]);

  useLayoutEffect(() => {
    if (reduced) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;

    const cache = lastRef.current;
    measure();
    apply();

    const inner = root.querySelector('.scroll-stack-inner');
    const observer = new ResizeObserver(() => {
      measure();
      apply();
    });
    if (inner) observer.observe(inner);

    const onResize = () => {
      measure();
      apply();
    };
    window.addEventListener('resize', onResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      // Hand the cards back the way they were found.
      cardsRef.current.forEach((card) => {
        card.style.transform = '';
        card.style.filter = '';
        card.style.marginBottom = '';
        card.style.zIndex = '';
      });
      cardsRef.current = [];
      metricsRef.current = [];
      cache.clear();
      completedRef.current = false;
    };
  }, [reduced, measure, apply]);

  useEffect(() => {
    if (reduced) return undefined;
    /* Lenis already emits from inside its own rAF, so applying directly keeps
       the cards on the same frame as the scroll. Routing that through another
       requestAnimationFrame would put them one frame behind, which at 60Hz is
       visible as the stack dragging slightly after the page. The coalescing
       path is only for the native-scroll fallback, where events can arrive
       several times per frame. */
    return subscribe(lenis ? apply : schedule);
  }, [reduced, subscribe, lenis, apply, schedule]);

  // Reduced motion: the cards are the content, so they still render — they
  // simply never move.
  if (reduced) {
    return (
      <div className={`scroll-stack ${className}`.trim()}>
        <div className="scroll-stack-inner scroll-stack-static">{children}</div>
      </div>
    );
  }

  return (
    <div className={`scroll-stack ${className}`.trim()} ref={rootRef}>
      <div className="scroll-stack-inner">
        {children}
        <div className="scroll-stack-end" ref={endRef} aria-hidden="true" />
      </div>
    </div>
  );
}
