/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Surface ladder ────────────────────────────────────────
        surface: '#0d0e11',          // Canvas — deepened for card separation
        'surface-subtle': '#131519', // table headers, input fills, inset wells
        'surface-card': '#17191e',   // Level 1 — panels pop against canvas
        'surface-well': '#1e2027',   // Level 2 — metric cells, nested bays
        'surface-card-hover': '#24262d', // Level 3 — hover / active
        'surface-rail': '#111318',   // sidebar rail

        // ── Hairline framing ──────────────────────────────────────
        'border-subtle': '#2a2d36',  // 1px between adjacent panels
        'border-muted': '#353842',   // internal partitions
        'border-highlight': 'rgba(255, 255, 255, 0.06)', // top bevel
        'border-shadow': 'rgba(0, 0, 0, 0.4)',           // bottom bevel

        // ── Instrument Amber ──────────────────────────────────────
        primary: '#d97736',
        'primary-hover': '#e0833a',
        'primary-soft': '#ffb68c',
        'primary-glow': 'rgba(217, 119, 54, 0.18)',
        'primary-border': 'rgba(217, 119, 54, 0.35)',

        // ── Text ramp ─────────────────────────────────────────────
        'on-surface': '#f4f4f6',
        'on-surface-muted': '#9da2af',
        'on-surface-subtle': '#686d7c',

        // ── Operational state ─────────────────────────────────────
        'accent-green': '#22c55e',
        'accent-green-deep': '#16a34a',
        'accent-amber': '#f59e0b',
        'accent-amber-deep': '#d97706',
        'accent-red': '#ef4444',
        'accent-red-deep': '#dc2626',
        'accent-red-bg': 'rgba(239, 68, 68, 0.12)',
        'accent-offline': '#4b5262',
      },
      fontFamily: {
        display: ['Chivo', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '2px',
        md: '3px',
        lg: '4px',
        xl: '6px',
      },
      transitionTimingFunction: {
        detent: 'cubic-bezier(0.34, 1.42, 0.64, 1)',
        instrument: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      boxShadow: {
        well: 'inset 0 1px 3px rgba(0, 0, 0, 0.5)',
        flyout: '0 4px 16px rgba(0, 0, 0, 0.65)',
        chassis: '0 1px 3px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        'glow-amber': '0 0 12px rgba(217, 119, 54, 0.15)',
      },
    },
  },
  plugins: [],
};
