type AccountMetadataSource = Record<string, unknown>

function value(source: AccountMetadataSource, keys: string[]) {
  for (const key of keys) {
    const current = String(source[key] ?? '').trim()
    if (current) return current
  }
  return ''
}

function nestedValue(source: AccountMetadataSource, keys: string[]): string {
  const direct = value(source, keys)
  if (direct) return direct
  for (const current of Object.values(source)) {
    if (!current || typeof current !== 'object') continue
    if (Array.isArray(current)) {
      for (const item of current) {
        if (item && typeof item === 'object') {
          const result: string = nestedValue(item as AccountMetadataSource, keys)
          if (result) return result
        }
      }
      continue
    }
    const result: string = nestedValue(current as AccountMetadataSource, keys)
    if (result) return result
  }
  return ''
}

function validTimezone(timezone: string) {
  if (!timezone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function mergeGmvMaxAccountMetadata(
  ...sources: Array<{ currency?: string; timezone?: string } | null | undefined>
) {
  const currency = sources
    .map((source) => String(source?.currency || '').trim().toUpperCase())
    .find(Boolean)
  const timezone = sources
    .map((source) => String(source?.timezone || '').trim())
    .find(validTimezone)
  return { currency: currency || undefined, timezone: timezone || undefined }
}

export function resolveGmvMaxAccountMetadata(
  advertiser: AccountMetadataSource,
  store: AccountMetadataSource = {},
) {
  const currency = nestedValue(advertiser, ['currency', 'currency_code', 'advertiser_currency'])
    || nestedValue(store, ['currency', 'currency_code'])
  const timezone = nestedValue(advertiser, ['timezone', 'time_zone', 'timezone_name', 'time_zone_name'])
    || nestedValue(store, ['timezone', 'time_zone', 'timezone_name', 'time_zone_name'])
  return mergeGmvMaxAccountMetadata({ currency, timezone })
}

export function resolveGmvMaxAccountMetadataRequest(
  toolSchemas: Record<string, unknown>,
  advertiserId: string,
) {
  const tool = ['advertiser_info_get', 'advertiser_get'].find((name) => toolSchemas[name])
    || Object.keys(toolSchemas).find((name) => name !== 'auth_advertiser_get' && /advertiser/i.test(name) && /info/i.test(name))
  if (!tool) return null
  const schema = toolSchemas[tool] as { properties?: Record<string, unknown> }
  if (schema?.properties?.advertiser_ids) {
    return { tool, args: { advertiser_ids: [advertiserId] } }
  }
  if (schema?.properties?.advertiser_id) {
    return { tool, args: { advertiser_id: advertiserId } }
  }
  return null
}
