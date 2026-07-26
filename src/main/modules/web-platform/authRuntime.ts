import { sendSmsCode } from './sms'
import { webPlatformRepo } from './repo'
import type { UserSubscription, WalletAccount, WebAuthLoginInput, WebAuthSendCodeInput, WebUser } from './types'

type AuthRuntimeDeps = {
  now: () => number
  normalizePhone: (input: string) => string
  defaultDevCode: () => string
  isDevelopmentEnv: () => boolean
  isLiveAuthEnv: () => boolean
  sendCodeCooldownMs: () => number
  ensureSubscription: (userId: string) => Promise<UserSubscription>
  ensureWallet: (userId: string) => Promise<WalletAccount>
}

type AuthByTokenResult = {
  user: WebUser
  session: {
    token: string
    userId: string
    createdAt: number
    updatedAt: number
    expiresAt: number
  }
  subscription: UserSubscription
  wallet: WalletAccount
}

const DESKTOP_LOCAL_AUTH_PHONE = '00000000000'

async function ensureDesktopLocalAuth(deps: AuthRuntimeDeps): Promise<AuthByTokenResult> {
  const existing = await webPlatformRepo.getUserByPhone(DESKTOP_LOCAL_AUTH_PHONE)
  const user =
    existing ??
    (await webPlatformRepo.createUser({
      phone: DESKTOP_LOCAL_AUTH_PHONE,
      displayName: 'Desktop Local User',
    }))
  return {
    user,
    session: {
      token: '',
      userId: user.id,
      createdAt: 0,
      updatedAt: 0,
      expiresAt: Number.MAX_SAFE_INTEGER,
    },
    subscription: await deps.ensureSubscription(user.id),
    wallet: await deps.ensureWallet(user.id),
  }
}

function assertPhonePresent(phone: string) {
  if (!phone) throw new Error('手机号不能为空')
}

function assertSendCodeCooldown(updatedAt: number | undefined, deps: AuthRuntimeDeps) {
  const retryAfterMs = Number(updatedAt || 0) + deps.sendCodeCooldownMs() - deps.now()
  if (retryAfterMs > 0) {
    throw new Error(`验证码发送过于频繁，请 ${Math.ceil(retryAfterMs / 1000)} 秒后重试`)
  }
}

function assertSmsCode(record: { code: string; expiresAt: number } | null, code: string, deps: AuthRuntimeDeps) {
  const normalized = String(code || '').trim()
  if (!normalized) throw new Error('验证码不能为空')
  if (!record) {
    throw new Error(deps.isDevelopmentEnv() ? `请先发送验证码，开发环境默认验证码为 ${deps.defaultDevCode()}` : '请先发送验证码')
  }
  if (Number(record.expiresAt || 0) <= deps.now()) {
    throw new Error('验证码已过期，请重新发送')
  }
  if (normalized !== String(record.code || '').trim()) {
    throw new Error(deps.isDevelopmentEnv() ? `验证码错误，当前开发环境默认验证码为 ${deps.defaultDevCode()}` : '验证码错误')
  }
}

function buildSendCodeMessage(deps: AuthRuntimeDeps) {
  return deps.isLiveAuthEnv() ? '验证码已发送，请查收短信' : '开发环境验证码已生成，可直接使用'
}

async function authByToken(token: string, deps: AuthRuntimeDeps): Promise<AuthByTokenResult> {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken) return await ensureDesktopLocalAuth(deps)

  const session = await webPlatformRepo.getSession(normalizedToken)
  if (!session) return await ensureDesktopLocalAuth(deps)
  if (session.expiresAt <= deps.now()) {
    await webPlatformRepo.removeSession(session.token)
    return await ensureDesktopLocalAuth(deps)
  }
  const user = await webPlatformRepo.getUserById(session.userId)
  if (!user || user.status !== 'active') return await ensureDesktopLocalAuth(deps)
  return {
    user,
    session,
    subscription: await deps.ensureSubscription(user.id),
    wallet: await deps.ensureWallet(user.id),
  }
}

export function installWebPlatformAuthRuntime(
  target: {
    sendLoginCode: (input: WebAuthSendCodeInput) => Promise<unknown>
    login: (input: WebAuthLoginInput) => Promise<unknown>
    authByToken: (token: string) => Promise<unknown>
  },
  deps: AuthRuntimeDeps,
) {
  target.sendLoginCode = async function sendLoginCodeClean(input: WebAuthSendCodeInput) {
    const phone = deps.normalizePhone(input.phone)
    assertPhonePresent(phone)
    const existing = await webPlatformRepo.getLoginCode(phone)
    assertSendCodeCooldown(existing?.updatedAt, deps)
    const code = deps.isLiveAuthEnv()
      ? String(Math.floor(100000 + Math.random() * 900000))
      : deps.defaultDevCode()
    const expiresAt = deps.now() + 5 * 60 * 1000
    await webPlatformRepo.saveLoginCode({
      phone,
      code,
      channel: 'sms',
      expiresAt,
    })
    const smsResult = await sendSmsCode({ phone, code })
    return {
      ok: true as const,
      message: buildSendCodeMessage(deps),
      provider: smsResult.provider,
      devCode: deps.isLiveAuthEnv() ? undefined : code,
      expiresInSec: 300,
    }
  }

  target.login = async function loginClean(input: WebAuthLoginInput) {
    const phone = deps.normalizePhone(input.phone)
    assertPhonePresent(phone)
    const loginCode = await webPlatformRepo.getLoginCode(phone)
    assertSmsCode(loginCode, input.code, deps)
    await webPlatformRepo.removeLoginCode(phone)
    const existing = await webPlatformRepo.getUserByPhone(phone)
    const user =
      existing ??
      (await webPlatformRepo.createUser({
        phone,
        displayName: input.displayName,
      }))
    const subscription = await deps.ensureSubscription(user.id)
    const wallet = await deps.ensureWallet(user.id)
    const session = await webPlatformRepo.createSession({
      userId: user.id,
      expiresAt: deps.now() + 30 * 24 * 60 * 60 * 1000,
    })
    return {
      token: session.token,
      user,
      subscription,
      wallet,
    }
  }

  target.authByToken = async function authByTokenOverride(token: string) {
    return await authByToken(token, deps)
  }
}
