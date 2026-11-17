// Creator contacts (pure, unit tested): bio parsing, phone normalisation, Zalo links and message templates.
import type { CreatorHubContact, CreatorHubContactInput, CreatorHubMessageTemplate } from './creatorHub'

// Vietnamese mobile numbers: 0 / 84 / +84, then 3|5|7|8|9 and 8 more digits; separators allowed.
const VN_PHONE = /(?:\+?84|0)[\s.\-]?[35789](?:[\s.\-]?\d){8}(?!\d)/g
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const ZALO_HINT = /(zalo|zalô|za\s?lo|\bzl\b|\bzlo\b)/i

/** `+84 912.345.678` -> `0912345678`; anything that is not a Vietnamese mobile number -> undefined. */
export function normalizeVnPhone(raw?: string | null) {
  if (!raw) return undefined
  let digits = String(raw).replace(/[^\d+]/g, '').replace(/^\+/, '')
  if (digits.startsWith('84')) digits = '0' + digits.slice(2)
  return /^0[35789]\d{8}$/.test(digits) ? digits : undefined
}

/**
 * Pulls a Zalo number, phone and email out of a creator bio. A number is treated as Zalo when the
 * bio mentions Zalo (zalo / zl / za lo) anywhere before it on the same line, or the bio names Zalo
 * and has exactly one number.
 */
export function extractContacts(bio?: string | null) {
  const text = String(bio || '')
  const result: { zalo?: string; phone?: string; email?: string } = {}
  const email = text.match(EMAIL)?.[0]
  if (email) result.email = email.toLowerCase()
  const numbers: Array<{ phone: string; zaloHint: boolean }> = []
  for (const line of text.split(/\n|\r/)) {
    for (const match of line.matchAll(VN_PHONE)) {
      const phone = normalizeVnPhone(match[0])
      if (!phone || numbers.some((item) => item.phone === phone)) continue
      numbers.push({ phone, zaloHint: ZALO_HINT.test(line.slice(0, match.index ?? 0)) })
    }
  }
  const zalo = numbers.find((item) => item.zaloHint) || (numbers.length === 1 && ZALO_HINT.test(text) ? numbers[0] : undefined)
  if (zalo) result.zalo = zalo.phone
  const other = numbers.find((item) => item.phone !== result.zalo)
  if (other) result.phone = other.phone
  else if (!result.zalo && numbers[0]) result.phone = numbers[0].phone
  return result
}

/** The number to open in Zalo: the Zalo number, else the phone (most Vietnamese numbers are on Zalo). */
export function zaloNumber(contact?: Pick<CreatorHubContact, 'zalo' | 'phone'> | null) {
  return normalizeVnPhone(contact?.zalo) || normalizeVnPhone(contact?.phone)
}

export function zaloLink(phone: string) {
  return `https://zalo.me/${encodeURIComponent(phone)}`
}

/** Replaces {name} {handle} {shop} {followers} placeholders; unknown placeholders are left as they are. */
export function renderTemplate(body: string, vars: Record<string, string | number | undefined>) {
  return String(body || '').replace(/\{(\w+)\}/g, (whole, key: string) => (vars[key] != null && vars[key] !== '' ? String(vars[key]) : whole))
}

export const DEFAULT_TEMPLATES: Array<Pick<CreatorHubMessageTemplate, 'id' | 'name' | 'body'>> = [
  {
    id: 'default-invite',
    name: 'Mời hợp tác (VI)',
    body: 'Chào {name} ạ! Mình là bên {shop} trên TikTok Shop. Bên mình thấy kênh @{handle} rất hợp với sản phẩm trang sức của shop, muốn gửi mẫu miễn phí và hợp tác hoa hồng với bạn. Bạn quan tâm thì nhắn lại mình nhé, cảm ơn bạn!',
  },
  {
    id: 'default-follow-up',
    name: 'Nhắc lại (VI)',
    body: 'Chào {name}, mình bên {shop} nhắn lại về lời mời hợp tác hôm trước. Bạn đã nhận được thông tin chưa ạ? Nếu cần thêm mẫu hay mức hoa hồng cao hơn thì cứ báo mình nhé!',
  },
]

/**
 * Merges contacts found in a bio into the stored record without overwriting numbers the user
 * entered by hand.
 */
export function mergeBioContact(previous: CreatorHubContact | undefined, input: { shopId: string; creatorId: string; handle: string; bio?: string; contactInfoAvailable?: boolean; now: number }): CreatorHubContact {
  const found = extractContacts(input.bio)
  return {
    id: `${input.shopId}:${input.creatorId}`,
    shopId: input.shopId,
    creatorId: input.creatorId,
    handle: input.handle || previous?.handle || '',
    zalo: previous?.zalo || found.zalo,
    phone: previous?.phone || found.phone,
    email: previous?.email || found.email,
    bio: input.bio ?? previous?.bio,
    contactInfoAvailable: input.contactInfoAvailable ?? previous?.contactInfoAvailable,
    bioFetchedAt: input.now,
    status: previous?.status || 'none',
    lastContactAt: previous?.lastContactAt,
    log: previous?.log || [],
    updatedAt: input.now,
  }
}

/** Applies a manual edit; empty strings clear a field, invalid phone numbers are rejected. */
export function applyContactInput(previous: CreatorHubContact | undefined, input: CreatorHubContactInput, now: number): CreatorHubContact {
  const phoneField = (value: string | null | undefined, current?: string) => {
    if (value === undefined) return current
    if (value === null || !String(value).trim()) return undefined
    const phone = normalizeVnPhone(value)
    if (!phone) throw new Error('CREATOR_HUB_PHONE_INVALID')
    return phone
  }
  const email = input.email === undefined ? previous?.email : (String(input.email || '').trim().toLowerCase() || undefined)
  if (email && !EMAIL.test(email)) throw new Error('CREATOR_HUB_EMAIL_INVALID')
  return {
    id: `${input.shopId}:${input.creatorId}`,
    shopId: input.shopId,
    creatorId: input.creatorId,
    handle: input.handle || previous?.handle || '',
    zalo: phoneField(input.zalo, previous?.zalo),
    phone: phoneField(input.phone, previous?.phone),
    email,
    bio: previous?.bio,
    contactInfoAvailable: previous?.contactInfoAvailable,
    bioFetchedAt: previous?.bioFetchedAt,
    status: input.status || previous?.status || 'none',
    lastContactAt: previous?.lastContactAt,
    log: previous?.log || [],
    updatedAt: now,
  }
}
