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
        // Quiet Luxury Palette
        mocha: '#1C1917',   // Warm near-black — body background
        linen: '#FAF9F6',   // Light surface canvas
        navy: '#1C2A39',    // Dark surface & deep primary text
        onyx: '#0D1117',    // Deep dark sections
        champagne: '#C5A059', // Accent gold
        stone: '#707070',   // Secondary light-mode body text
        silver: '#8E8E93',  // Secondary dark-mode body text
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
        // Brand semantic tokens
        primary: {
          DEFAULT: '#1C2A39', // Midnight Navy
          foreground: '#FAF9F6',
        },
        secondary: {
          DEFAULT: '#FAF9F6', // Linen
          foreground: '#1C2A39',
        },
        accent: {
          DEFAULT: '#0A7EA4', // Cerulean — single source of truth for accent
          foreground: '#ffffff',
          hover: '#086d8f',
        },
        muted: {
          DEFAULT: '#707070', // Stone gray
          foreground: '#FAF9F6',
        },
        cerulean: '#0A7EA4',  // Cerulean blue — active states, focus rings, info badges
        bronze: '#A0522D',    // Bronze — CTA accents, logout, hover states
        border: '#E5E5E5',
        surface: '#FAF9F6',
      },
      fontFamily: {
        serif: ['var(--font-bellefair)', 'Playfair Display', 'Georgia', 'serif'],
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
