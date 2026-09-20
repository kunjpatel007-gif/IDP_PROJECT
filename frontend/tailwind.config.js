/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Surface ladder (DESIGN.md) ────────────────────────────
        surface: '#121316', // Canvas Base — viewport backdrop, unpanelled zones
        'surface-subtle': '#16171b', // table headers, input fills, inset wells
        'surface-card': '#1a1b1f', // Level 1 — machine panel base
        'surface-well': '#22242a', // Level 2 — elevated chassis cells
        'surface-card-hover': '#2a2d35', // Level 3 — hover / active channel
        'surface-rail': '#16171b',

        // ── Hairline framing ──────────────────────────────────────
        'border-subtle': '#2e313a', // 1px between adjacent panels
        'border-muted': '#383c47', // internal partitions, tick marks

        // ── Instrument Amber — the only accent ────────────────────
        primary: '#d97736',
        'primary-hover': '#e0833a',
        'primary-soft': '#ffb68c',

        // ── Text ramp ─────────────────────────────────────────────
        'on-surface': '#f4f4f6', // absolute readout values, major headers
        'on-surface-muted': '#9da2af', // parameter labels, units, column heads
        'on-surface-subtle': '#686d7c', // inactive slots, timestamps, ticks

        // ── Operational state ─────────────────────────────────────
        'accent-green': '#22c55e', // nominal, energised
        'accent-green-deep': '#16a34a',
        'accent-amber': '#f59e0b', // caution, approaching limit
        'accent-amber-deep': '#d97706',
        'accent-red': '#ef4444', // critical, breaker open
        'accent-red-deep': '#dc2626',
        'accent-red-bg': 'rgba(239, 68, 68, 0.12)',
        'accent-offline': '#4b5262', // de-energised, unassigned
      },
      fontFamily: {
        body: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        display: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
      },
      transitionTimingFunction: {
        // Mechanical settle — overshoots once, then locks.
        detent: 'cubic-bezier(0.34, 1.42, 0.64, 1)',
        instrument: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      boxShadow: {
        well: 'inset 0 1px 2px rgba(0, 0, 0, 0.45)',
        flyout: '0 4px 16px rgba(0, 0, 0, 0.65)',
      },
    },
  },
  plugins: [],
};

