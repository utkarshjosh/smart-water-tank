/** @type {import('tailwindcss').Config} */
// Every colour, radius and duration resolves to a token in src/styles/tokens.css.
// Light only - there is no `dark` variant to write against on purpose.
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'hsl(var(--canvas))',
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          sunk: 'hsl(var(--surface-sunk))',
          hover: 'hsl(var(--surface-hover))',
        },
        hairline: 'hsl(var(--hairline))',
        'line-strong': 'hsl(var(--line-strong))',
        ink: {
          1: 'hsl(var(--ink-1))',
          2: 'hsl(var(--ink-2))',
          3: 'hsl(var(--ink-3))',
        },
        brand: {
          DEFAULT: 'hsl(var(--brand))',
          press: 'hsl(var(--brand-press))',
          wash: 'hsl(var(--brand-wash))',
          ink: 'hsl(var(--brand-ink))',
        },
        good: {
          DEFAULT: 'hsl(var(--good))',
          wash: 'hsl(var(--good-wash))',
          text: 'hsl(var(--good-text))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          wash: 'hsl(var(--warning-wash))',
          text: 'hsl(var(--warning-text))',
        },
        serious: {
          DEFAULT: 'hsl(var(--serious))',
          wash: 'hsl(var(--serious-wash))',
          text: 'hsl(var(--serious-text))',
        },
        critical: {
          DEFAULT: 'hsl(var(--critical))',
          wash: 'hsl(var(--critical-wash))',
          text: 'hsl(var(--critical-text))',
        },
        series: {
          level: 'var(--series-level)',
          volume: 'var(--series-volume)',
          temperature: 'var(--series-temperature)',
          battery: 'var(--series-battery)',
        },
      },
      borderColor: { DEFAULT: 'hsl(var(--hairline))' },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        raised: 'var(--shadow-raised)',
        overlay: 'var(--shadow-overlay)',
        none: 'none',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        // [size, { lineHeight, letterSpacing, fontWeight }]
        display: ['2rem', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '600' }],
        title: ['1.25rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        body: ['0.9375rem', { lineHeight: '1.5' }],
        label: ['0.8125rem', { lineHeight: '1.4', fontWeight: '500' }],
        caption: ['0.75rem', { lineHeight: '1.35' }],
        metric: ['1.75rem', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '600' }],
        'metric-sm': ['1.25rem', { lineHeight: '1', letterSpacing: '-0.01em', fontWeight: '600' }],
      },
      maxWidth: { content: 'var(--content-max)' },
      spacing: {
        header: 'var(--header-h)',
        tabbar: 'var(--tabbar-h)',
        sidebar: 'var(--sidebar-w)',
        'sidebar-rail': 'var(--sidebar-w-rail)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        emphasized: 'var(--ease-emphasized)',
      },
      transitionDuration: {
        instant: 'var(--duration-instant)',
        quick: 'var(--duration-quick)',
        smooth: 'var(--duration-smooth)',
      },
      keyframes: {
        'fade-rise': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise var(--duration-smooth) var(--ease-emphasized)',
        'fade-in': 'fade-in var(--duration-quick) var(--ease-out)',
        shimmer: 'shimmer 1.6s infinite',
        'sheet-up': 'sheet-up var(--duration-smooth) var(--ease-emphasized)',
      },
    },
  },
  plugins: [],
};
