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
        // Joey O Brand Colors - Quiet Luxury Palette
        mocha: {
          DEFAULT: '#A38A75',
          light: '#B3A394',
          dark: '#8B7461',
        },
        taupe: {
          DEFAULT: '#B3A394',
          light: '#C4B5A8',
          dark: '#9D8F82',
        },
        emerald: {
          DEFAULT: '#043927',
          light: '#065A3E',
          dark: '#032A1D',
        },
        // Legacy colors for compatibility
        primary: {
          DEFAULT: '#043927', // Emerald for CTAs
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#A38A75', // Mocha
          foreground: '#ffffff',
        },
        accent: {
          DEFAULT: '#043927', // Emerald
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: '#B3A394', // Warm Taupe
          foreground: '#1a1a1a',
        },
        border: '#C4B5A8',
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
