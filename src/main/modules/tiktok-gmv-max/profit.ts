import type { GmvMaxCostInput, GmvMaxCreativeMetric, GmvMaxDailyMetric, GmvMaxProductCost, GmvMaxProfitGuard, GmvMaxStoreCost } from './types'

const SCALE = 10_000n

function parse(value: unknown): bigint | null {
  const text = String(value ?? '').trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null
  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  const [whole, fraction = ''] = unsigned.split('.')
  const result = BigInt(whole || '0') * SCALE + BigInt((fraction + '0000').slice(0, 4))
  return negative ? -result : result
}

function format(value: bigint) {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const whole = absolute / SCALE
  const fraction = String(absolute % SCALE).padStart(4, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

function validCost(input: GmvMaxCostInput) {
  return COST_FIELDS.every((field) => parse(input[field]) !== null)
}

const COST_FIELDS = [
  'purchaseCost',
  'firstMileCost',
  'lastMileCost',
  'warehousingCost',
  'platformCommissionRate',
  'creatorCommissionRate',
  'expectedReturnRate',
  'returnLossRate',
] as const

export function resolveGmvMaxCost(...sources: Array<Partial<GmvMaxCostInput> | null | undefined>) {
  const resolved = Object.fromEntries(COST_FIELDS.map((field) => [
    field,
    sources.map((source) => String(source?.[field] ?? '').trim()).find(Boolean) || '',
  ])) as GmvMaxCostInput
  return validCost(resolved) ? resolved : null
}

export function selectGmvMaxCampaignProductCosts(input: {
  campaignId: string
  productIds: string[]
  metrics: GmvMaxCreativeMetric[]
  productCosts: GmvMaxProductCost[]
}) {
  const evidencedProductIds = [...new Set((input.productIds.length
    ? input.productIds
    : input.metrics.map((item) => item.itemGroupId || '').filter(Boolean)))]
  const productCosts = evidencedProductIds.map((productId) => input.productCosts.find((item) => item.productId === productId
    && item.campaignId === input.campaignId)
    || input.productCosts.find((item) => item.productId === productId && !item.campaignId))
    .filter((item): item is GmvMaxProductCost => Boolean(item))
  return { productIds: evidencedProductIds, productCosts }
}

export function calculateGmvMaxProfitGuard(input: {
  sellingPrice: string
  sellingPriceSource?: GmvMaxProfitGuard['sellingPriceSource']
  minRoi: string
  safetyMarginPercent?: number
  cost: GmvMaxCostInput | null
}): GmvMaxProfitGuard {
  const price = parse(input.sellingPrice)
  const minRoi = parse(input.minRoi) || 0n
  if (!input.cost || price === null || price <= 0n || !validCost(input.cost)) {
    return { complete: false, contributionMarginRate: '0', breakEvenRoi: '0', effectiveRoiFloor: format(minRoi), reason: 'Cost data is incomplete.' }
  }
  const fixedCost = [input.cost.purchaseCost, input.cost.firstMileCost, input.cost.lastMileCost, input.cost.warehousingCost]
    .reduce((sum, value) => sum + (parse(value) || 0n), 0n)
  const platformRate = parse(input.cost.platformCommissionRate) || 0n
  const creatorRate = parse(input.cost.creatorCommissionRate) || 0n
  const returnRate = parse(input.cost.expectedReturnRate) || 0n
  const returnLossRate = parse(input.cost.returnLossRate) || 0n
  const returnLossRateWeighted = (returnRate * returnLossRate) / SCALE
  const variableCost = (price * (platformRate + creatorRate + returnLossRateWeighted)) / SCALE
  const contribution = price - fixedCost - variableCost
  if (contribution <= 0n) {
    return { complete: false, contributionMarginRate: '0', breakEvenRoi: '0', effectiveRoiFloor: format(minRoi), reason: 'Contribution profit is not positive.' }
  }
  const contributionMarginRate = (contribution * SCALE) / price
  const breakEvenRoi = (price * SCALE) / contribution
  const safetyMultiplier = SCALE + BigInt(Math.max(0, Math.round(input.safetyMarginPercent ?? 15))) * 100n
  const protectedRoi = (breakEvenRoi * safetyMultiplier) / SCALE
  const effectiveRoiFloor = protectedRoi > minRoi ? protectedRoi : minRoi
  return {
    complete: true,
    sellingPrice: format(price),
    sellingPriceSource: input.sellingPriceSource,
    contributionMarginRate: format(contributionMarginRate),
    breakEvenRoi: format(breakEvenRoi),
    effectiveRoiFloor: format(effectiveRoiFloor),
  }
}

export function calculateGmvMaxConfiguredProductProfitGuard(input: {
  product?: GmvMaxProductCost
  storeCost?: GmvMaxStoreCost
  fallbackSellingPrice?: string
  fallbackSellingPriceSource?: GmvMaxProfitGuard['sellingPriceSource']
  minRoi: string
  safetyMarginPercent?: number
}): GmvMaxProfitGuard {
  const product = input.product
  const variants = product?.variants || []
  const catalogMin = parse(product?.catalogMinPrice)
  const catalogMax = parse(product?.catalogMaxPrice)
  const hasMultipleSkus = Number(product?.skuCount || 0) > 1
    || (catalogMin !== null && catalogMax !== null && catalogMin !== catalogMax)
  const priceRange = {
    priceRangeMin: catalogMin !== null ? format(catalogMin) : undefined,
    priceRangeMax: catalogMax !== null ? format(catalogMax) : undefined,
  }

  if (variants.length) {
    const guards = variants.map((variant) => calculateGmvMaxProfitGuard({
      sellingPrice: variant.sellingPrice,
      sellingPriceSource: 'product',
      minRoi: input.minRoi,
      safetyMarginPercent: input.safetyMarginPercent,
      cost: resolveGmvMaxCost(variant, product, input.storeCost),
    }))
    const complete = guards.filter((guard) => guard.complete)
    if (complete.length !== variants.length) {
      return {
        complete: false,
        contributionMarginRate: '0',
        breakEvenRoi: '0',
        effectiveRoiFloor: input.minRoi,
        variantCount: variants.length,
        coveredVariantCount: complete.length,
        ...priceRange,
        reason: 'SKU-level price or cost data is incomplete.',
      }
    }
    const worst = [...complete].sort((left, right) => {
      const leftFloor = parse(left.effectiveRoiFloor) || 0n
      const rightFloor = parse(right.effectiveRoiFloor) || 0n
      return leftFloor === rightFloor ? 0 : leftFloor > rightFloor ? -1 : 1
    })[0]
    return {
      ...worst,
      variantCount: variants.length,
      coveredVariantCount: variants.length,
      ...priceRange,
    }
  }

  if (hasMultipleSkus) {
    return {
      complete: false,
      contributionMarginRate: '0',
      breakEvenRoi: '0',
      effectiveRoiFloor: input.minRoi,
      variantCount: 0,
      coveredVariantCount: 0,
      ...priceRange,
      reason: 'SKU-level prices and costs are required for a multi-SKU product.',
    }
  }

  return {
    ...calculateGmvMaxProfitGuard({
      sellingPrice: product?.sellingPrice || input.fallbackSellingPrice || '',
      sellingPriceSource: product?.sellingPrice ? 'product' : input.fallbackSellingPriceSource,
      minRoi: input.minRoi,
      safetyMarginPercent: input.safetyMarginPercent,
      cost: resolveGmvMaxCost(product, input.storeCost),
    }),
    ...priceRange,
  }
}

export function calculateGmvMaxCampaignProfitGuard(input: {
  minRoi: string
  safetyMarginPercent?: number
  metrics: GmvMaxCreativeMetric[]
  productCosts: GmvMaxProductCost[]
  storeCost?: GmvMaxStoreCost
  currency?: string
  fallbackSellingPrice?: string
}): GmvMaxProfitGuard {
  const grouped = new Map<string, GmvMaxCreativeMetric[]>()
  for (const metric of input.metrics) {
    if (!metric.itemGroupId) continue
    grouped.set(metric.itemGroupId, [...(grouped.get(metric.itemGroupId) || []), metric])
  }
  if (!grouped.size) {
    const product = input.productCosts.length === 1 ? input.productCosts[0] : undefined
    const currencyMismatch = Boolean((product?.currency || input.storeCost?.currency) && input.currency
      && (product?.currency || input.storeCost?.currency) !== input.currency)
    const guard: GmvMaxProfitGuard = currencyMismatch
      ? { complete: false, contributionMarginRate: '0', breakEvenRoi: '0', effectiveRoiFloor: input.minRoi, reason: 'Product cost currency does not match the advertiser currency.' }
      : calculateGmvMaxConfiguredProductProfitGuard({
        product,
        storeCost: input.storeCost,
        fallbackSellingPrice: input.fallbackSellingPrice,
        fallbackSellingPriceSource: input.fallbackSellingPrice ? 'campaign' : undefined,
        minRoi: input.minRoi,
        safetyMarginPercent: input.safetyMarginPercent,
      })
    return { ...guard, productCount: product ? 1 : 0, coveredProductCount: guard.complete ? 1 : 0, productCoveragePercent: guard.complete ? 100 : 0, uncoveredSpendShare: guard.complete ? '0' : '1' }
  }

  const totalSpend = sumMetrics(input.metrics, 'cost')
  const totalRevenue = sumMetrics(input.metrics, 'grossRevenue')
  const totalOrders = sumMetrics(input.metrics, 'orders')
  let coveredSpend = 0n
  let coveredProducts = 0
  let weightedContribution = 0n
  let coveredRevenue = 0n
  for (const [productId, metrics] of grouped) {
    const product = input.productCosts.find((item) => item.productId === productId)
    const productSpend = sumMetrics(metrics, 'cost')
    const productRevenue = sumMetrics(metrics, 'grossRevenue')
    const productOrders = sumMetrics(metrics, 'orders')
    const observedPrice = productOrders > 0n && productRevenue > 0n ? format((productRevenue * SCALE) / productOrders) : ''
    const currencyMismatch = Boolean((product?.currency || input.storeCost?.currency) && input.currency
      && (product?.currency || input.storeCost?.currency) !== input.currency)
    const fallbackSellingPrice = observedPrice || (grouped.size === 1 ? input.fallbackSellingPrice || '' : '')
    const guard: GmvMaxProfitGuard = currencyMismatch
      ? { complete: false, contributionMarginRate: '0', breakEvenRoi: '0', effectiveRoiFloor: input.minRoi, reason: 'Product cost currency does not match the advertiser currency.' }
      : calculateGmvMaxConfiguredProductProfitGuard({
        product,
        storeCost: input.storeCost,
        fallbackSellingPrice,
        fallbackSellingPriceSource: observedPrice ? 'observed' : grouped.size === 1 && input.fallbackSellingPrice ? 'campaign' : undefined,
        minRoi: input.minRoi,
        safetyMarginPercent: input.safetyMarginPercent,
      })
    if (!guard.complete) continue
    coveredProducts += 1
    coveredSpend += productSpend
    if (productRevenue > 0n) {
      weightedContribution += productRevenue * (parse(guard.contributionMarginRate) || 0n)
      coveredRevenue += productRevenue
    }
  }
  const coverage = totalSpend > 0n
    ? (coveredSpend * 100n) / totalSpend
    : BigInt(grouped.size ? Math.round((coveredProducts / grouped.size) * 100) : 0)
  const uncoveredSpendShare = totalSpend > 0n ? ((totalSpend - coveredSpend) * SCALE) / totalSpend : coveredProducts === grouped.size ? 0n : SCALE
  const metadata = {
    productCount: grouped.size,
    coveredProductCount: coveredProducts,
    productCoveragePercent: Number(coverage),
    uncoveredSpendShare: format(uncoveredSpendShare),
  }
  if (coverage < 95n) {
    return { complete: false, contributionMarginRate: '0', breakEvenRoi: '0', effectiveRoiFloor: format(parse(input.minRoi) || 0n), ...metadata, reason: 'Product cost coverage is below 95 percent of campaign spend.' }
  }
  if (totalRevenue <= 0n || totalOrders <= 0n || coveredRevenue <= 0n) {
    return { complete: false, contributionMarginRate: '0', breakEvenRoi: '0', effectiveRoiFloor: format(parse(input.minRoi) || 0n), ...metadata, reason: 'Product revenue is unavailable for the weighted profit model.' }
  }
  const contributionMarginRate = weightedContribution / coveredRevenue
  if (contributionMarginRate <= 0n) {
    return { complete: false, contributionMarginRate: '0', breakEvenRoi: '0', effectiveRoiFloor: format(parse(input.minRoi) || 0n), ...metadata, reason: 'Weighted contribution profit is not positive.' }
  }
  const breakEvenRoi = (SCALE * SCALE) / contributionMarginRate
  const safetyMultiplier = SCALE + BigInt(Math.max(0, Math.round(input.safetyMarginPercent ?? 15))) * 100n
  const protectedRoi = (breakEvenRoi * safetyMultiplier) / SCALE
  const minRoi = parse(input.minRoi) || 0n
  const effectiveRoiFloor = protectedRoi > minRoi ? protectedRoi : minRoi
  return {
    complete: true,
    sellingPrice: totalOrders > 0n ? format((totalRevenue * SCALE) / totalOrders) : undefined,
    sellingPriceSource: 'observed',
    contributionMarginRate: format(contributionMarginRate),
    breakEvenRoi: format(breakEvenRoi),
    effectiveRoiFloor: format(effectiveRoiFloor),
    ...metadata,
  }
}

function sumMetrics(metrics: GmvMaxCreativeMetric[], field: 'cost' | 'grossRevenue' | 'orders') {
  return metrics.reduce((total, item) => total + (parse(item[field]) || 0n), 0n)
}

export function deriveGmvMaxObservedSellingPrice(metrics: GmvMaxDailyMetric[], maxDays = 7) {
  const window = [...metrics].sort((a, b) => a.statDate.localeCompare(b.statDate)).slice(-Math.max(1, maxDays))
  const revenue = window.reduce((total, item) => total + (parse(item.grossRevenue) || 0n), 0n)
  const orders = window.reduce((total, item) => total + (parse(item.orders) || 0n), 0n)
  return orders > 0n && revenue > 0n ? format((revenue * SCALE) / orders) : ''
}

export function estimateGmvMaxNetProfit(input: {
  cost: string
  grossRevenue: string
  contributionMarginRate: string
}) {
  const cost = parse(input.cost) || 0n
  const revenue = parse(input.grossRevenue) || 0n
  const margin = parse(input.contributionMarginRate) || 0n
  return format((revenue * margin) / SCALE - cost)
}

export const gmvMaxProfitDecimal = { parse, format }
