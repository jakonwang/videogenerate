// Parses a Cookie-Editor JSON export into Electron `cookies.set` details.
// Pure module (no electron import) so it can be unit tested.

export type ElectronCookieDetails = {
  url: string
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
}

export type ParsedCookies = { cookies: ElectronCookieDetails[]; skipped: number; expiresAt?: number; hasSession: boolean }

const ALLOWED_DOMAINS = ['tiktok.com', 'tiktokshop.com', 'tiktokglobalshop.com', 'tiktok-shops.com']
const SESSION_COOKIE = /^(sessionid|sessionid_ss|sid_tt|sid_guard|uid_tt|sid_ucp_v1|ssid_ucp_v1|SHOP_ID|sso_uid_tt)$/i

function isAllowedDomain(domain: string) {
  const host = domain.replace(/^\./, '').toLowerCase()
  return ALLOWED_DOMAINS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

function mapSameSite(value: unknown): ElectronCookieDetails['sameSite'] {
  const text = String(value || '').toLowerCase()
  if (text === 'no_restriction' || text === 'none') return 'no_restriction'
  if (text === 'lax') return 'lax'
  if (text === 'strict') return 'strict'
  return 'unspecified'
}

export function parseCookieEditorJson(input: string, now = Date.now()): ParsedCookies {
  let raw: unknown
  try {
    raw = JSON.parse(String(input || '').trim())
  } catch {
    throw new Error('CREATOR_HUB_COOKIE_JSON_INVALID')
  }
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.cookies) ? (raw as any).cookies : null
  if (!list) throw new Error('CREATOR_HUB_COOKIE_JSON_INVALID')

  const cookies: ElectronCookieDetails[] = []
  let skipped = 0
  let expiresAt: number | undefined
  let hasSession = false
  for (const item of list as any[]) {
    const name = String(item?.name || '')
    const domain = String(item?.domain || '')
    if (!name || !domain || !isAllowedDomain(domain)) { skipped += 1; continue }
    const expirationDate = Number(item.expirationDate || item.expires || 0) || undefined
    if (expirationDate && expirationDate * 1000 < now) { skipped += 1; continue }
    const host = domain.replace(/^\./, '')
    const path = String(item.path || '/')
    let sameSite = mapSameSite(item.sameSite)
    const secure = Boolean(item.secure)
    // Chromium rejects SameSite=None cookies that are not secure.
    if (sameSite === 'no_restriction' && !secure) sameSite = 'unspecified'
    const details: ElectronCookieDetails = {
      url: `https://${host}${path.startsWith('/') ? path : `/${path}`}`,
      name,
      value: String(item.value ?? ''),
      path,
      secure,
      httpOnly: Boolean(item.httpOnly),
      sameSite,
    }
    if (!item.hostOnly) details.domain = domain.startsWith('.') ? domain : `.${domain}`
    if (expirationDate && !item.session) details.expirationDate = expirationDate
    cookies.push(details)
    if (SESSION_COOKIE.test(name)) {
      hasSession = true
      if (expirationDate) expiresAt = Math.min(expiresAt ?? Infinity, expirationDate * 1000)
    }
  }
  if (!cookies.length) throw new Error('CREATOR_HUB_COOKIE_EMPTY')
  return { cookies, skipped, expiresAt, hasSession }
}
