export const tokens = {
  colors: {
    bgPrimary: '#060B16',
    bgSecondary: '#08111F',
    bgTertiary: '#0D1729',
    bgPanel: '#111C31',
    bgCard: '#121F35',
    bgHover: '#172642',
    bgInput: '#0A1324',

    primary: '#6D5DFF',
    primaryHover: '#7C6BFF',
    primaryActive: '#5948E8',
    primarySoft: 'rgba(109, 93, 255, 0.14)',
    primaryBorder: 'rgba(109, 93, 255, 0.42)',
    aiBlue: '#22D3EE',
    aiPurple: '#8B5CF6',

    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#38BDF8',

    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textMuted: '#64748B',
    textDisabled: '#475569',

    border: 'rgba(148, 163, 184, 0.16)',
    borderStrong: 'rgba(148, 163, 184, 0.28)',
  },

  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
  },

  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '24px',
    '2xl': '32px',
  },

  motion: {
    fast: '120ms',
    normal: '200ms',
    slow: '300ms',
  },
} as const

export type DesignTokens = typeof tokens
