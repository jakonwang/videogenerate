import type { GmvMaxAccountBinding, GmvMaxPortfolioPlan } from './types'

function localDate(timezone: string | undefined, now: number) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now))
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${values.year}-${values.month}-${values.day}`
  } catch {
    return localDate('UTC', now)
  }
}

export function previousCompleteDate(timezone: string | undefined, now: number) {
  const date = new Date(`${localDate(timezone, now)}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

export function assertGmvMaxPortfolioEvidenceFresh(input: {
  plan: GmvMaxPortfolioPlan
  donorBinding: GmvMaxAccountBinding
  receiverBinding: GmvMaxAccountBinding
  now: number
}) {
  const donorDate = previousCompleteDate(input.donorBinding.timezone, input.now)
  const receiverDate = previousCompleteDate(input.receiverBinding.timezone, input.now)
  if (donorDate !== receiverDate) throw new Error('Portfolio campaigns do not share the same complete reporting day.')
  if (!input.plan.evidenceEndDate || input.plan.evidenceEndDate !== donorDate) {
    throw new Error(`Portfolio evidence is stale. Expected complete day ${donorDate}.`)
  }
  return donorDate
}
