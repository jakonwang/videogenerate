import { createPrivateKey, createPublicKey, sign, timingSafeEqual, verify } from 'node:crypto'
import { readKeyFile } from '../config'

export type AlipayConfig = {
  appId: string
  appPrivateKeyPath: string
  alipayPublicKeyPath: string
  gateway: string
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** 待签名串：去掉 sign（通知验签时也去掉 sign_type）与空值，按键名 ASCII 升序拼 k=v&k=v */
export function buildAlipaySignContent(params: Record<string, unknown>, excludeSignType: boolean): string {
  return Object.keys(params)
    .filter((key) => key !== 'sign' && !(excludeSignType && key === 'sign_type'))
    .filter((key) => {
      const value = params[key]
      return value !== undefined && value !== null && value !== '' && typeof value !== 'object'
    })
    .sort()
    .map((key) => `${key}=${String(params[key])}`)
    .join('&')
}

export function yuanToFen(yuan: string): number {
  const [whole, fraction = ''] = yuan.split('.')
  return Number(whole) * 100 + Number(fraction.slice(0, 2).padEnd(2, '0'))
}

export function fenToYuan(fen: number): string {
  return `${Math.floor(fen / 100)}.${String(fen % 100).padStart(2, '0')}`
}

/** 从应答原文中截出 "<node>": {...} 的原始 JSON（支付宝对原文验签，不能 decode 后再 encode） */
export function extractAlipayNode(raw: string, nodeName: string): string | null {
  const pos = raw.indexOf(`"${nodeName}"`)
  if (pos < 0) return null
  const start = raw.indexOf('{', pos + nodeName.length + 2)
  if (start < 0) return null
  let depth = 0
  let inString = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return raw.slice(start, i + 1)
    }
  }
  return null
}

function formatBeijingTime(ms: number) {
  // 支付宝 timestamp / time_expire 均为北京时间 yyyy-MM-dd HH:mm:ss
  const d = new Date(ms + 8 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

/**
 * 支付宝开放平台（公钥模式，RSA2）：当面付扫码 precreate、查单、异步通知验签。
 */
export class AlipayGateway {
  constructor(private readonly cfg: AlipayConfig) {}

  isConfigured(): boolean {
    return Boolean(this.cfg.appId && readKeyFile(this.cfg.appPrivateKeyPath) && readKeyFile(this.cfg.alipayPublicKeyPath))
  }

  sign(params: Record<string, unknown>): string {
    const pem = readKeyFile(this.cfg.appPrivateKeyPath)
    if (!pem) throw new Error('支付宝应用私钥缺失')
    return sign('sha256', Buffer.from(buildAlipaySignContent(params, false)), createPrivateKey(pem)).toString('base64')
  }

  private verifyRaw(content: string, signatureB64: string): boolean {
    const pem = readKeyFile(this.cfg.alipayPublicKeyPath)
    if (!pem || !signatureB64) return false
    try {
      return verify('sha256', Buffer.from(content), createPublicKey(pem), Buffer.from(signatureB64, 'base64'))
    } catch {
      return false
    }
  }

  /** 异步通知验签：params 为已 URL 解码的 POST 表单 */
  verifyNotify(params: Record<string, string>): boolean {
    if (String(params.sign_type || 'RSA2').toUpperCase() !== 'RSA2') return false
    return this.verifyRaw(buildAlipaySignContent(params, true), String(params.sign || ''))
  }

  /** 通知 / 查单结果是否为本订单的成功支付 */
  isPaidTradeFor(data: Record<string, unknown>, orderNo: string, amountFen: number): boolean {
    const status = String(data.trade_status || '')
    const amount = String(data.total_amount || '')
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) return false
    const appIdOk = data.app_id === undefined || safeEqual(this.cfg.appId, String(data.app_id))
    return (
      (status === 'TRADE_SUCCESS' || status === 'TRADE_FINISHED') &&
      appIdOk &&
      safeEqual(orderNo, String(data.out_trade_no || '')) &&
      yuanToFen(amount) === amountFen
    )
  }

  private async call(method: string, bizContent: Record<string, unknown>, notifyUrl?: string): Promise<Record<string, any>> {
    const params: Record<string, string> = {
      app_id: this.cfg.appId,
      method,
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: formatBeijingTime(Date.now()),
      version: '1.0',
      biz_content: JSON.stringify(bizContent),
    }
    if (notifyUrl) params.notify_url = notifyUrl
    params.sign = this.sign(params)

    const res = await fetch(`${this.cfg.gateway}?charset=utf-8`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(15_000),
    })
    const raw = await res.text()
    const nodeRaw = extractAlipayNode(raw, `${method.replace(/\./g, '_')}_response`)
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
    if (!nodeRaw || !parsed) throw new Error('支付宝应答格式异常')
    const signature = String(parsed.sign || '')
    const node = JSON.parse(nodeRaw) as Record<string, any>
    if (signature) {
      if (!this.verifyRaw(nodeRaw, signature)) throw new Error('支付宝应答验签失败')
    } else if (node.code === '10000') {
      throw new Error('支付宝应答缺少签名')
    }
    return node
  }

  async precreate(input: { orderNo: string; subject: string; amountFen: number; expireAt: number; notifyUrl: string }) {
    const node = await this.call(
      'alipay.trade.precreate',
      {
        out_trade_no: input.orderNo,
        total_amount: fenToYuan(input.amountFen),
        subject: input.subject.slice(0, 120),
        time_expire: formatBeijingTime(input.expireAt),
      },
      input.notifyUrl,
    )
    if (node.code !== '10000' || !node.qr_code) throw new Error(`支付宝下单失败：${node.sub_msg || node.msg || '未知错误'}`)
    return { qrCode: String(node.qr_code) }
  }

  async query(orderNo: string): Promise<Record<string, any> | null> {
    const node = await this.call('alipay.trade.query', { out_trade_no: orderNo })
    if (node.code !== '10000') {
      if (node.sub_code === 'ACQ.TRADE_NOT_EXIST') return null
      throw new Error(`支付宝查单失败：${node.sub_msg || node.msg || '未知错误'}`)
    }
    return node
  }
}
