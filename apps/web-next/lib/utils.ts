import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
