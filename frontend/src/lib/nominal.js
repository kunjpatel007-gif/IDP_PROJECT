/**
 * Declared constants.
 *
 * Nothing here is telemetry. These are display-scaling and modelling
 * assumptions that have to exist somewhere, and the point of collecting them
 * in one file is that they are visible and auditable rather than scattered
 * through components as bare literals.
 *
 * Rule for this codebase: a device fact is never defaulted. If the adapter
 * did not publish it, the UI says so. These values only ever set the scale of
 * an axis or seed a reconstruction, never stand in for a missing reading.
 */

/** Mains nominal, used only to size axes before any reading has arrived. */
export const NOMINAL_VOLTAGE = 230;
export const NOMINAL_FREQUENCY = 50;

/** Oscilloscope vertical full scale, in volts peak-equivalent. */
export const SCOPE_VOLTAGE_FULL_SCALE = 260;

/** Oscilloscope current full scale floor, so a small load is still visible. */
export const SCOPE_CURRENT_FLOOR = 10;

/**
 * Pre-fault load for the oscillogram reconstruction, as a fraction of the
 * trip threshold. The PZEM does not retain a pre-trigger buffer, so the
 * healthy portion of the trace is indicative only — this is what makes it so.
 */
export const RECONSTRUCTION_PRELOAD_RATIO = 0.16;

/** Power factor used only when reconstructing a fault with none recorded. */
export const RECONSTRUCTION_FALLBACK_PF = 0.95;
