import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Text that resolves out of noise.
 *
 * Each character cycles through junk glyphs before locking to its real value,
 * with the lock front sweeping left to right. Characters near the front
 * churn fastest and settle as the front passes them, which is what makes it
 * read as a signal being acquired rather than a typewriter effect.
 *
 * Spaces never scramble — keeping word boundaries fixed stops the line
 * reflowing mid-animation, and the shape of the phrase stays readable the
 * whole way through.
 */

const GLYPHS = '▚▞█▓▒░#%&@$/\\|<>=+*ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

export default function ScrambleText({
  text = '',
  duration = 700,
  delay = 0,
  className = '',
  as: Tag = 'span',
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? text : '');
  const frame = useRef(null);

  useEffect(() => {
    if (reduced) {
      setDisplay(text);
      return undefined;
    }

    let start = null;
    const run = (ts) => {
      if (start === null) start = ts;
      const elapsed = ts - start - delay;

      if (elapsed < 0) {
        setDisplay('');
        frame.current = requestAnimationFrame(run);
        return;
      }

      const progress = Math.min(1, elapsed / duration);
      // Front runs slightly ahead of linear so the tail settles decisively.
      const front = progress * progress * text.length;

      let out = '';
      for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (char === ' ') {
          out += ' ';
        } else if (i < front) {
          out += char;
        } else if (i < front + 6) {
          out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
        } else {
          out += ' ';
        }
      }
      setDisplay(out);

      if (progress < 1) frame.current = requestAnimationFrame(run);
      else setDisplay(text);
    };

    frame.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame.current);
  }, [text, duration, delay, reduced]);

  return (
    <Tag className={className} aria-label={text}>
      <span aria-hidden="true">{display}</span>
    </Tag>
  );
}
