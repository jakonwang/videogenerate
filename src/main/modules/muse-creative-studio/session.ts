export type MuseCookie = {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None'
}

const SESSION_COOKIE = 'hatch_sess'

export function isMuseDomain(domain: string) {
  const host = String(domain || '').trim().toLowerCase().replace(/^\./, '')
  return host === 'muse.ai' || host.endsWith('.muse.ai')
}

export const museSessionValue = (cookies: MuseCookie[]) => cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value || ''

function sameSite(value: unknown): MuseCookie['sameSite'] {
  const text = String(value || '').toLowerCase()
  if (text === 'strict') return 'Strict'
  return text === 'none' || text === 'no_restriction' ? 'None' : 'Lax'
}

/** Keeps muse.ai cookies only, so an export of the whole browser never ends up in the store. */
export function normalizeMuseCookies(input: unknown): MuseCookie[] {
  const cookies = (Array.isArray(input) ? input : []).flatMap((entry: any): MuseCookie[] => {
    const name = String(entry?.name || '').trim()
    const domain = String(entry?.domain || '').trim()
    if (!name || !isMuseDomain(domain)) return []
    const expires = Number(entry?.expirationDate ?? entry?.expires)
    return [{
      name,
      domain,
      value: String(entry?.value || ''),
      path: String(entry?.path || '/'),
      expires: Number.isFinite(expires) && expires > 0 ? expires : -1,
      httpOnly: Boolean(entry?.httpOnly),
      secure: entry?.secure !== false,
      sameSite: sameSite(entry?.sameSite),
    }]
  })
  if (!museSessionValue(cookies)) throw new Error('没有找到 Muse 登录会话，请确认已登录 muse.ai')
  return cookies
}
