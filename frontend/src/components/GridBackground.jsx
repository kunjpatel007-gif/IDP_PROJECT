/**
 * Console backdrop.
 *
 * Graph paper, 24px sub-grid inside a 96px major grid, at very low contrast.
 * It is pure CSS gradients — no elements, no repaint, no cost. The only motion
 * is a 20-second two-pixel drift, which you notice about as much as you notice
 * a rack fan: not at all until it stops.
 *
 * `alert` swaps in a red vignette when the breaker is open, so the whole room
 * changes temperature rather than just one card.
 */
export default function GridBackground({ alert = false }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="console-grid console-grid-hum absolute -inset-[3%]" />

      {/* Corner falloff — keeps the eye in the middle third of the console. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 120% 90% at 50% 0%, transparent 35%, rgba(18,19,22,0.85) 100%)',
        }}
      />

      <div
        className={`absolute inset-0 transition-opacity duration-700 ${
          alert ? 'alert-vignette opacity-100' : 'opacity-0'
        }`}
        style={{
          background:
            'radial-gradient(ellipse 100% 80% at 50% 50%, transparent 40%, rgba(220,38,38,0.13) 100%)',
        }}
      />
    </div>
  );
}
