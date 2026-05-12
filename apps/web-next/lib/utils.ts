import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateTime(value?: number | string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function formatStepLabel(step?: string) {
  switch (step) {
    case 'upload_analyze_script':
      return '参考分析'
    case 'generate_script_variants':
    case 'select_script_variant':
      return '脚本生成'
    case 'generate_storyboard_grids':
      return '分镜图片'
    case 'generate_shot_videos':
    case 'review_replace_shots':
      return '分镜视频'
    case 'compose_final_video':
    case 'export_final':
      return '成片输出'
    default:
      return '待开始'
  }
}

export function formatStatusLabel(status?: string) {
  const value = String(status || '').toLowerCase()
  if (!value) return '草稿'
  if (value.includes('active')) return '进行中'
  if (value.includes('completed') || value.includes('done') || value.includes('success')) return '已完成'
  if (value.includes('pending') || value.includes('processing') || value.includes('running')) return '运行中'
  if (value.includes('failed') || value.includes('error')) return '失败'
  if (value.includes('paid')) return '已支付'
  if (value.includes('expired')) return '已过期'
  if (value.includes('disabled')) return '已停用'
  return status || '草稿'
}

export function formatStatusTone(status?: string) {
  const value = String(status || '').toLowerCase()
  if (['done', 'completed', 'success', 'paid', 'active', 'locked'].some((item) => value.includes(item))) {
    return 'success'
  }
  if (['failed', 'error', 'disabled', 'expired', 'refunded'].some((item) => value.includes(item))) {
    return 'danger'
  }
  if (['analyzing', 'generating', 'processing', 'running', 'pending'].some((item) => value.includes(item))) {
    return 'running'
  }
  return 'idle'
}

export function toFileName(input?: string | null) {
  if (!input) return '--'
  return String(input).split(/[\/\\]/).pop() || '--'
}

export function toPreviewSrc(input?: string | null) {
  const raw = String(input || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || /^data:/i.test(raw) || /^blob:/i.test(raw)) return raw

  const normalized = raw.replace(/\\/g, '/')
  const mediaBaseUrl = (process.env.NEXT_PUBLIC_WEB_MEDIA_BASE_URL || '').trim()
  if (mediaBaseUrl) {
    return `${mediaBaseUrl.replace(/\/$/, '')}/file?path=${encodeURIComponent(normalized)}`
  }

  if (typeof window !== 'undefined') {
    const apiBase = String(window.localStorage.getItem('videogen.web.apiBaseUrl') || '').trim()
    const runtimeBase = apiBase || process.env.NEXT_PUBLIC_WEB_API_BASE_URL?.trim() || 'http://127.0.0.1:18080'
    if (runtimeBase) {
      return `${runtimeBase.replace(/\/$/, '')}/media/file?path=${encodeURIComponent(normalized)}`
    }
  }

  if (/^file:\/\//i.test(raw)) return raw
  const encodedPath = normalized
    .split('/')
    .map((segment, index) => {
      if (index === 0 && /^[A-Za-z]:$/.test(segment)) return segment
      return encodeURIComponent(segment)
    })
    .join('/')

  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encodedPath}`
  }
  if (normalized.startsWith('/')) {
    return `file://${encodedPath}`
  }
  return raw
}

export function formatPercent(value?: number | null) {
  const safe = Number(value || 0)
  return `${Math.max(0, Math.min(100, Math.round(safe)))}%`
}

export function compactText(input?: string | null, fallback = '--') {
  const value = String(input || '').trim()
  return value || fallback
}
