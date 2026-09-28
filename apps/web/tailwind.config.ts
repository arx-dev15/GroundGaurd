import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
      },
      screens: {
        '2xl': '1440px',
      },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Canonical Trust States (strictly separated from brand accent)
        status: {
          pending: {
            DEFAULT: 'hsl(var(--status-pending))',
            foreground: 'hsl(var(--status-pending-foreground))',
            bg: 'hsl(var(--status-pending-bg))',
            border: 'hsl(var(--status-pending-border))',
          },
          verified: {
            DEFAULT: 'hsl(var(--status-verified))',
            foreground: 'hsl(var(--status-verified-foreground))',
            bg: 'hsl(var(--status-verified-bg))',
            border: 'hsl(var(--status-verified-border))',
          },
          recovered: {
            DEFAULT: 'hsl(var(--status-recovered))',
            foreground: 'hsl(var(--status-recovered-foreground))',
            bg: 'hsl(var(--status-recovered-bg))',
            border: 'hsl(var(--status-recovered-border))',
          },
          flagged: {
            DEFAULT: 'hsl(var(--status-flagged))',
            foreground: 'hsl(var(--status-flagged-foreground))',
            bg: 'hsl(var(--status-flagged-bg))',
            border: 'hsl(var(--status-flagged-border))',
          },
          needs_review: {
            DEFAULT: 'hsl(var(--status-needs-review))',
            foreground: 'hsl(var(--status-needs-review-foreground))',
            bg: 'hsl(var(--status-needs-review-bg))',
            border: 'hsl(var(--status-needs-review-border))',
          },
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      width: {
        'sidebar-expanded': '260px',
        'sidebar-collapsed': '64px',
        'inspector-default': '420px',
      },
      maxWidth: {
        'prose-technical': '68ch',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'subtle-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'subtle-pulse': 'subtle-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
