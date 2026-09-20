/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'surface': '#121316',
        'surface-subtle': '#16171c',
        'surface-card': '#1a1b20',
        'surface-card-hover': '#212228',
        'surface-rail': '#141519',
        'border-subtle': '#292a32',
        'border-muted': '#353742',
        'primary': '#d97736',
        'primary-soft': '#ffb68c',
        'on-surface': '#e4e5ea',
        'on-surface-muted': '#9699a6',
        'on-surface-subtle': '#696c7a',
        'accent-green': '#22c55e',
        'accent-red': '#f87171',
        'accent-red-bg': 'rgba(239, 68, 68, 0.12)',
      },
      fontFamily: {
        body: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        display: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
      },
      boxShadow: {
        well: 'inset 0 1px 2px rgba(0, 0, 0, 0.2)',
      },
      backgroundImage: {
        'surface-gradient': 'linear-gradient(180deg, #16171c 0%, #121316 100%)',
      },
    },
  },
  plugins: [],
};
