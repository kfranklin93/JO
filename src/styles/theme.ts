export const theme = {
  colors: {
    background: '#f8fafc',
    foreground: '#0f172a',
    primary: '#0f766e',
    secondary: '#1e293b',
    accent: '#f59e0b',
    border: '#e2e8f0',
    surface: '#ffffff',
  },
  spacing: {
    section: '6rem',
    container: '80rem',
  },
} as const;

export type AppTheme = typeof theme;
