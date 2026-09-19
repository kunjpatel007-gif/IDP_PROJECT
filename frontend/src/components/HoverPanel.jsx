import { motion } from 'framer-motion';
import { usePointerGlow } from '@/hooks/usePointerGlow';
import { useTilt } from '@/hooks/useTilt';

/**
 * Instrument panel that reacts to the cursor.
 *
 * Three things layered, all of them subtle on purpose: the panel leans a few
 * degrees toward the pointer, a soft light tracks the cursor across its face,
 * and the hairline border warms where the light falls. Together they make the
 * surface read as a physical panel under a moving lamp rather than a div.
 *
 * Touch devices get none of it — there is no hover state to honour, and the
 * tilt would fire on every tap. Reduced motion flattens the tilt to zero but
 * keeps the light, which carries no motion of its own.
 */
export default function HoverPanel({
  children,
  className = '',
  tilt = 4.5,
  glowColor = '217, 119, 54',
  glowSize = 280,
  lift = true,
}) {
  const { ref, hovering, handlers: glowHandlers } = usePointerGlow();
  const { rotateX, rotateY, handlers: tiltHandlers, reduced } = useTilt({ max: tilt });

  const onPointerMove = (event) => {
    // Pointer-only: a finger has no hover, and tilting on tap feels broken.
    if (event.pointerType === 'touch') return;
    glowHandlers.onPointerMove(event);
    tiltHandlers.onPointerMove(event);
  };

  const onPointerEnter = (event) => {
    if (event.pointerType === 'touch') return;
    glowHandlers.onPointerEnter(event);
  };

  const onPointerLeave = () => {
    glowHandlers.onPointerLeave();
    tiltHandlers.onPointerLeave();
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1100,
        transformStyle: 'preserve-3d',
      }}
      animate={lift && hovering && !reduced ? { y: -2 } : { y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className={`relative ${className}`}
    >
      {children}

      {/* The lamp. Follows --px/--py, written outside React. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[3] transition-opacity duration-300"
        style={{
          opacity: hovering ? 1 : 0,
          background: `radial-gradient(${glowSize}px circle at var(--px, 50%) var(--py, 50%), rgba(${glowColor}, 0.1), transparent 68%)`,
        }}
      />

      {/* Border warms where the light falls across it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[4] rounded transition-opacity duration-300"
        style={{
          opacity: hovering ? 1 : 0,
          background: `radial-gradient(${glowSize * 0.7}px circle at var(--px, 50%) var(--py, 50%), rgba(${glowColor}, 0.55), transparent 62%)`,
          WebkitMask:
            'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          padding: 1,
        }}
      />
    </motion.div>
  );
}
