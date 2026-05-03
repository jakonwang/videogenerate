import { tokens } from './tokens'

export const theme = {
  tokens,
  classes: {
    app: 'ds-app',
    shell: 'ds-shell',
    workspace: 'ds-workspace',
    inspector: 'ds-inspector',
    card: 'ds-card',
    input: 'ds-input',
    button: 'ds-button',
    tag: 'ds-tag',
  },
} as const

export function applyDesignThemeVars(root: HTMLElement = document.documentElement) {
  root.style.setProperty('--ds-bg-primary', tokens.colors.bgPrimary)
  root.style.setProperty('--ds-bg-secondary', tokens.colors.bgSecondary)
  root.style.setProperty('--ds-bg-tertiary', tokens.colors.bgTertiary)
  root.style.setProperty('--ds-bg-hover', tokens.colors.bgHover)
  root.style.setProperty('--ds-primary', tokens.colors.primary)
  root.style.setProperty('--ds-primary-hover', tokens.colors.primaryHover)
  root.style.setProperty('--ds-success', tokens.colors.success)
  root.style.setProperty('--ds-warning', tokens.colors.warning)
  root.style.setProperty('--ds-error', tokens.colors.error)
  root.style.setProperty('--ds-info', tokens.colors.info)
  root.style.setProperty('--ds-text-primary', tokens.colors.textPrimary)
  root.style.setProperty('--ds-text-secondary', tokens.colors.textSecondary)
  root.style.setProperty('--ds-text-muted', tokens.colors.textMuted)
  root.style.setProperty('--ds-border', tokens.colors.border)
  root.style.setProperty('--ds-radius-sm', tokens.radius.sm)
  root.style.setProperty('--ds-radius-md', tokens.radius.md)
  root.style.setProperty('--ds-radius-lg', tokens.radius.lg)
}
