export const tokens = {
  colors: {
    bgPrimary: '#0D1117',
    bgSecondary: '#111827',
    bgTertiary: '#1F2937',
    bgHover: '#273244',

    primary: '#6366F1',
    primaryHover: '#7C3AED',

    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',

    textPrimary: '#E5E7EB',
    textSecondary: '#9CA3AF',
    textMuted: '#6B7280',

    border: 'rgba(255,255,255,0.06)',
  },

  radius: {
    sm: '6px',
    md: '10px',
    lg: '12px',
  },

  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },

  motion: {
    fast: '120ms',
    normal: '200ms',
    slow: '300ms',
  },
} as const

export type DesignTokens = typeof tokens
