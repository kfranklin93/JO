import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
    './src/config/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',
        // Property Guys Atlanta Inspired - Clean Monochrome Palette
        neutral: {
          50: '#FAFAFA',
          100: '#F5F5F5',
          200: '#E5E5E5',
          300: '#D4D4D4',
          400: '#A3A3A3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0A0A0A',
        },
        // Brand colors
        primary: {
          DEFAULT: '#000000', // Pure black for text and primary elements
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#F5F5F5', // Light neutral for backgrounds
          foreground: '#000000',
        },
        accent: {
          DEFAULT: '#000000', // Black for CTAs
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: '#737373', // Mid-gray for secondary text
          foreground: '#ffffff',
        },
        border: '#E5E5E5',
        surface: '#ffffff',
      },
      fontFamily: {
        serif: ['var(--font-bellefair)', 'Georgia', 'serif'],
        sans: ['var(--font-montserrat)', 'Arial', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      boxShadow: {
        soft: '0 10px 30px rgba(15, 23, 42, 0.08)',
      },
      borderRadius: {
        xl: '1rem',
      },
      maxWidth: {
        content: '80rem',
      },
    },
  },
};

export default config;
