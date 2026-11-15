/**
 * 授权令牌：base64url(JSON payload) + "." + base64url(Ed25519 签名)
 * 服务端用私钥签发，桌面端用内置公钥验证。仅在 Node 环境（云端服务 / Electron 主进程）使用。
 */
import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto'
import type { EntitlementTokenPayload } from './types'

export function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

export function signEntitlementToken(payload: EntitlementTokenPayload, privateKeyPem: string | KeyObject): string {
  const key = typeof privateKeyPem === 'string' ? createPrivateKey(privateKeyPem) : privateKeyPem
  const body = base64UrlEncode(JSON.stringify(payload))
  const signature = sign(null, Buffer.from(body), key)
  return `${body}.${base64UrlEncode(signature)}`
}

/** 校验签名并解析载荷；签名不对或格式错误返回 null。不检查过期。 */
export function verifyEntitlementToken(token: string, publicKeyPem: string | KeyObject): EntitlementTokenPayload | null {
  const parts = String(token || '').split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  try {
    const key = typeof publicKeyPem === 'string' ? createPublicKey(publicKeyPem) : publicKeyPem
    const ok = verify(null, Buffer.from(parts[0]), key, base64UrlDecode(parts[1]))
    if (!ok) return null
    const payload = JSON.parse(base64UrlDecode(parts[0]).toString('utf8')) as EntitlementTokenPayload
    if (!payload || payload.v !== 1 || typeof payload.exp !== 'number' || typeof payload.mid !== 'string') return null
    return payload
  } catch {
    return null
  }
}

/** 令牌签发时间允许比本地时钟超前的量（毫秒），容忍轻微时钟偏差 */
export const ENTITLEMENT_CLOCK_SKEW_MS = 5 * 60 * 1000

export type EntitlementCheck =
  | { ok: true; payload: EntitlementTokenPayload }
  | { ok: false; reason: 'invalid' | 'machine_mismatch' | 'expired' | 'clock_rollback' }

/**
 * 离线判断令牌是否可用。
 * lastSeenAt：本机上次确认过的时间，用来发现「把系统时间往回调」以延长离线授权的行为。
 */
export function checkEntitlementToken(input: {
  token: string
  publicKeyPem: string | KeyObject
  machineId: string
  now: number
  lastSeenAt?: number
}): EntitlementCheck {
  const payload = verifyEntitlementToken(input.token, input.publicKeyPem)
  if (!payload) return { ok: false, reason: 'invalid' }
  if (payload.mid !== input.machineId) return { ok: false, reason: 'machine_mismatch' }
  const lastSeen = Math.max(input.lastSeenAt ?? 0, payload.iat - ENTITLEMENT_CLOCK_SKEW_MS)
  if (input.now < lastSeen - ENTITLEMENT_CLOCK_SKEW_MS) return { ok: false, reason: 'clock_rollback' }
  if (input.now >= payload.exp) return { ok: false, reason: 'expired' }
  return { ok: true, payload }
}
