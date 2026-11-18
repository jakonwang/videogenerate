import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { CloudErrorCode } from '../../../src/shared/cloud/types'

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>

const SCRYPT_PARAMS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export class CloudError extends Error {
  constructor(
    public readonly code: CloudErrorCode,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

export const unauthorized = (message = '请先登录') => new CloudError('UNAUTHORIZED', message, 401)
export const forbidden = (message = '没有权限') => new CloudError('FORBIDDEN', message, 403)
export const notFound = (message = '资源不存在') => new CloudError('NOT_FOUND', message, 404)
export const badRequest = (message: string) => new CloudError('BAD_REQUEST', message, 400)

/** 密码哈希：scrypt$N$r$p$salt$hash */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, 32, SCRYPT_PARAMS)
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltB64, hashB64] = parts
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT_PARAMS.maxmem,
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** 用于账号不存在时也消耗同样时间，防止通过响应时间枚举账号 */
let dummyHash: Promise<string> | null = null
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword(randomBytes(12).toString('hex'))
  await verifyPassword(password, await dummyHash)
}

export function validatePassword(password: string) {
  if (password.length < 8) throw badRequest('密码至少 8 位')
  if (password.length > 128) throw badRequest('密码过长')
}

/** 账号：手机号或邮箱，统一小写 */
export function normalizeAccount(raw: string): string {
  const account = String(raw || '').trim().toLowerCase()
  const isPhone = /^\+?\d{6,20}$/.test(account)
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account) && account.length <= 120
  if (!isPhone && !isEmail) throw badRequest('请输入手机号或邮箱')
  return account
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** 兑换码：XXXX-XXXX-XXXX-XXXX，去掉易混字符，约 80 bit 熵 */
export function newRedeemCode(): string {
  const segments: string[] = []
  for (let s = 0; s < 4; s++) {
    let part = ''
    for (let i = 0; i < 4; i++) part += CODE_CHARS[randomInt(CODE_CHARS.length)]
    segments.push(part)
  }
  return segments.join('-')
}

export function newOrderNo(now: number): string {
  const d = new Date(now + 8 * 60 * 60 * 1000)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  return `VG${stamp}${pad(randomInt(1_000_000), 6)}`
}

/** 简单的内存登录失败限流（单实例部署） */
export class LoginThrottle {
  private readonly failures = new Map<string, { count: number; lockedUntil: number; firstAt: number }>()

  constructor(
    private readonly maxFailures: number,
    private readonly lockMs: number,
  ) {}

  assertAllowed(key: string, now: number) {
    const entry = this.failures.get(key)
    if (entry && entry.lockedUntil > now) {
      const minutes = Math.ceil((entry.lockedUntil - now) / 60000)
      throw new CloudError('RATE_LIMITED', `登录失败次数过多，请 ${minutes} 分钟后再试`, 429)
    }
  }

  fail(key: string, now: number) {
    const entry = this.failures.get(key)
    const fresh = !entry || now - entry.firstAt > this.lockMs
    const count = fresh ? 1 : entry!.count + 1
    this.failures.set(key, {
      count,
      firstAt: fresh ? now : entry!.firstAt,
      lockedUntil: count >= this.maxFailures ? now + this.lockMs : 0,
    })
    if (this.failures.size > 50_000) this.failures.clear()
  }

  succeed(key: string) {
    this.failures.delete(key)
  }
}
