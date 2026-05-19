import { isDevelopmentEnv } from '../../lib/appEnv'

export type SendSmsCodeInput = {
  phone: string
  code: string
}

export type SendSmsCodeResult = {
  provider: 'console' | 'mock'
  requestId?: string
}

function resolveSmsProvider() {
  return String(process.env.VG_SMS_PROVIDER || '').trim().toLowerCase()
}

function isConsoleSmsEnabled() {
  return resolveSmsProvider() === 'console'
}

export async function sendSmsCode(input: SendSmsCodeInput): Promise<SendSmsCodeResult> {
  if (isDevelopmentEnv()) {
    return {
      provider: 'mock',
    }
  }

  if (isConsoleSmsEnabled()) {
    console.log(`[sms-provider] send code to ${input.phone}: ${input.code}`)
    return {
      provider: 'console',
      requestId: `console_${Date.now()}`,
    }
  }

  throw new Error('生产环境未配置可用短信服务，请设置 VG_SMS_PROVIDER')
}
