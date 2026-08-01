const CNY_CURRENCIES = new Set(['CNY', 'RMB', 'CNH'])
const RATE_SCALE_DIGITS = 12
const RATE_SCALE = 10n ** BigInt(RATE_SCALE_DIGITS)
const EXCHANGE_RATE_SOURCE = 'ExchangeRate-API'

export type GmvMaxExchangeRateResult = {
  rate?: string
  source?: string
  updatedAt?: number
  error?: string
}

export function parseGmvMaxExchangeRate(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return 0n
  const [whole, fraction = ''] = raw.split('.')
  const normalized = `${whole}${fraction.padEnd(RATE_SCALE_DIGITS, '0').slice(0, RATE_SCALE_DIGITS)}`
  return BigInt(normalized || '0')
}

export function normalizeGmvMaxExchangeRate(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined
  const normalized = numeric.toFixed(RATE_SCALE_DIGITS).replace(/0+$/, '').replace(/\.$/, '')
  return parseGmvMaxExchangeRate(normalized) > 0n ? normalized : undefined
}

export function convertGmvMaxMoneyToCny(value: unknown, rate: unknown) {
  const money = String(value ?? '').trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(money)) return undefined
  const negative = money.startsWith('-')
  const unsigned = negative ? money.slice(1) : money
  const [whole, fraction = ''] = unsigned.split('.')
  const moneyScaled = BigInt(`${whole}${fraction.padEnd(4, '0').slice(0, 4)}` || '0')
  const rateScaled = parseGmvMaxExchangeRate(rate)
  if (rateScaled <= 0n) return undefined
  const converted = (moneyScaled * rateScaled) / RATE_SCALE
  const signed = negative ? -converted : converted
  const absolute = signed < 0n ? -signed : signed
  const outputWhole = absolute / 10_000n
  const outputFraction = (absolute % 10_000n).toString().padStart(4, '0').replace(/0+$/, '')
  return `${signed < 0n ? '-' : ''}${outputWhole}${outputFraction ? `.${outputFraction}` : ''}`
}

export async function fetchGmvMaxCnyExchangeRate(
  currency: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; now?: number } = {},
): Promise<GmvMaxExchangeRateResult> {
  const normalizedCurrency = String(currency || '').trim().toUpperCase()
  if (!normalizedCurrency) return { error: 'Account currency is unavailable.' }
  if (CNY_CURRENCIES.has(normalizedCurrency)) {
    return { rate: '1', source: 'Native CNY', updatedAt: options.now ?? Date.now() }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000)
  try {
    const response = await (options.fetchImpl || fetch)(
      `https://open.er-api.com/v6/latest/${encodeURIComponent(normalizedCurrency)}`,
      { signal: controller.signal },
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json() as { result?: string; rates?: Record<string, unknown>; time_last_update_unix?: number }
    if (payload.result && payload.result !== 'success') throw new Error(`Provider result: ${payload.result}`)
    const rate = normalizeGmvMaxExchangeRate(payload.rates?.CNY)
    if (!rate) throw new Error('CNY rate is missing or invalid')
    const providerUpdatedAt = Number(payload.time_last_update_unix) * 1_000
    return {
      rate,
      source: EXCHANGE_RATE_SOURCE,
      updatedAt: Number.isFinite(providerUpdatedAt) && providerUpdatedAt > 0 ? providerUpdatedAt : options.now ?? Date.now(),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { source: EXCHANGE_RATE_SOURCE, error: `Automatic exchange-rate sync failed: ${message}` }
  } finally {
    clearTimeout(timer)
  }
}

export function createGmvMaxExchangeRateLoader(
  fetcher: (currency: string) => Promise<GmvMaxExchangeRateResult> = fetchGmvMaxCnyExchangeRate,
) {
  const requests = new Map<string, Promise<GmvMaxExchangeRateResult>>()
  return (currency: string) => {
    const normalizedCurrency = String(currency || '').trim().toUpperCase()
    let request = requests.get(normalizedCurrency)
    if (!request) {
      request = fetcher(normalizedCurrency)
      requests.set(normalizedCurrency, request)
    }
    return request
  }
}
