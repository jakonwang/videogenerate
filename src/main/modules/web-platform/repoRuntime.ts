import { randomUUID } from 'node:crypto'
import type { SubscriptionPlan, WebUser } from './types'

export function buildDefaultPlans(): SubscriptionPlan[] {
  return [
    {
      id: 'starter-monthly',
      name: '基础会员',
      priceCny: 99,
      durationDays: 30,
      monthlyComputeCredits: 120,
      enabled: true,
    },
    {
      id: 'pro-monthly',
      name: '专业会员',
      priceCny: 299,
      durationDays: 30,
      monthlyComputeCredits: 420,
      enabled: true,
    },
  ]
}

export function buildDefaultWebUser(input: { phone: string; displayName?: string; createdAt: number }): WebUser {
  return {
    id: randomUUID(),
    phone: String(input.phone || '').trim(),
    displayName: String(input.displayName || '').trim() || `用户${String(input.phone || '').slice(-4)}`,
    status: 'active',
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  }
}
