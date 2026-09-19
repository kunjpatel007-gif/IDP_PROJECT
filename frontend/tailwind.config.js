/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Surfaces (tonal layering — never shadows) ──────────────
        surface: '#121316',
        'surface-subtle': '#16171c',
        'surface-card': '#1a1b20',
        'surface-card-hover': '#212228',
        'surface-rail': '#141519',

        // ── Hairline framing ──────────────────────────────────────
        'border-subtle': '#292a32',
        'border-muted': '#353742',

        // ── The only accent. Amber. ───────────────────────────────
        primary: '#d97736',
        'primary-soft': '#ffb68c',
        'primary-hover': '#e0833a',

        // ── Text ramp ─────────────────────────────────────────────
        'on-surface': '#e4e5ea',
        'on-surface-muted': '#9699a6',
        'on-surface-subtle': '#696c7a',

        // ── Operational state ─────────────────────────────────────
        'accent-green': '#22c55e',
        'accent-green-deep': '#16a34a',
        'accent-red': '#f87171',
        'accent-red-deep': '#dc2626',
        'accent-red-bg': 'rgba(239, 68, 68, 0.12)',
      },
      fontFamily: {
        body: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Chivo', 'Inter', 'sans-serif'],
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
