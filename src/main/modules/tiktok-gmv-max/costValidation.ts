import type { GmvMaxAccountBinding, GmvMaxCampaign, GmvMaxCostInput } from './types'

const FIXED_COST_FIELDS = ['purchaseCost', 'firstMileCost', 'lastMileCost', 'warehousingCost'] as const
const RATE_FIELDS = ['platformCommissionRate', 'creatorCommissionRate', 'expectedReturnRate', 'returnLossRate'] as const

function decimal(value: unknown) {
  const normalized = String(value ?? '').trim()
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function validateGmvMaxCostInput(input: GmvMaxCostInput) {
  for (const field of FIXED_COST_FIELDS) {
    const value = decimal(input[field])
    if (value === null || value < 0) return `${field} must be a non-negative decimal.`
  }
  for (const field of RATE_FIELDS) {
    const value = decimal(input[field])
    if (value === null || value < 0 || value > 1) return `${field} must be a decimal between zero and one.`
  }
  return null
}

export function validateGmvMaxOptionalCostInput(input: Partial<GmvMaxCostInput>) {
  for (const field of FIXED_COST_FIELDS) {
    if (!String(input[field] ?? '').trim()) continue
    const value = decimal(input[field])
    if (value === null || value < 0) return `${field} must be a non-negative decimal.`
  }
  for (const field of RATE_FIELDS) {
    if (!String(input[field] ?? '').trim()) continue
    const value = decimal(input[field])
    if (value === null || value < 0 || value > 1) return `${field} must be a decimal between zero and one.`
  }
  return null
}

export function validateGmvMaxProductSellingPrice(value: unknown) {
  const parsed = decimal(value)
  return parsed !== null && parsed > 0 ? null : 'sellingPrice must be a positive decimal.'
}

export function resolveGmvMaxProductCostScope(input: {
  storeId: string
  campaignId?: string
  campaigns: GmvMaxCampaign[]
  bindings: GmvMaxAccountBinding[]
}) {
  const campaign = input.campaignId ? input.campaigns.find((item) => item.id === input.campaignId) : undefined
  if (input.campaignId && !campaign) return { error: 'GMV MAX campaign does not exist.' }
  if (campaign && campaign.storeId !== input.storeId) return { error: 'GMV MAX product cost store does not match the campaign store.' }
  const binding = campaign
    ? input.bindings.find((item) => item.id === campaign.bindingId)
    : input.bindings.find((item) => item.storeId === input.storeId)
  return binding ? { campaign, binding } : { error: 'GMV MAX store binding does not exist.' }
}
