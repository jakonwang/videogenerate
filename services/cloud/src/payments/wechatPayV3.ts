import { createDecipheriv, createPrivateKey, createPublicKey, randomBytes, sign, timingSafeEqual, verify } from 'node:crypto'
import { readKeyFile } from '../config'

/** 回调 / 应答时间戳允许的最大偏差（秒） */
export const WECHAT_MAX_CLOCK_SKEW_SECONDS = 300

export type WechatPayConfig = {
  mchid: string
  appid: string
  merchantSerialNo: string
  merchantPrivateKeyPath: string
  apiV3Key: string
  platformPublicKeyPath: string
  platformSerial: string
  apiBase: string
}

export type WechatSignatureHeaders = {
  timestamp: string
  nonce: string
  signature: string
  serial: string
}

export type WechatTransaction = {
  appid?: string
  mchid?: string
  out_trade_no?: string
  transaction_id?: string
  trade_state?: string
  amount?: { total?: number; currency?: string }
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function buildWechatRequestMessage(method: string, pathWithQuery: string, timestamp: string, nonce: string, body: string) {
  return `${method.toUpperCase()}\n${pathWithQuery}\n${timestamp}\n${nonce}\n${body}\n`
}

export function buildWechatResponseMessage(timestamp: string, nonce: string, body: string) {
  return `${timestamp}\n${nonce}\n${body}\n`
}

/**
 * 微信支付 APIv3：Native 扫码下单、查单、回调 / 应答验签、回调报文解密。
 */
export class WechatPayV3 {
  constructor(private readonly cfg: WechatPayConfig) {}

  isConfigured(): boolean {
    const c = this.cfg
    return Boolean(
      c.mchid && c.appid && c.merchantSerialNo && c.apiV3Key && readKeyFile(c.merchantPrivateKeyPath) && readKeyFile(c.platformPublicKeyPath),
    )
  }

  private key(path: string, label: string) {
    const pem = readKeyFile(path)
    if (!pem) throw new Error(`微信支付密钥文件缺失：${label}`)
    return pem
  }

  buildAuthorization(method: string, pathWithQuery: string, body: string, timestamp = String(Math.floor(Date.now() / 1000)), nonce = randomBytes(16).toString('hex')) {
    const message = buildWechatRequestMessage(method, pathWithQuery, timestamp, nonce, body)
    const signature = sign('sha256', Buffer.from(message), createPrivateKey(this.key(this.cfg.merchantPrivateKeyPath, '商户私钥'))).toString('base64')
    return `WECHATPAY2-SHA256-RSA2048 mchid="${this.cfg.mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${this.cfg.merchantSerialNo}"`
  }

  /** 校验微信支付回调或应答的签名（含时间戳防重放与平台公钥序列号校验） */
  verifySignature(headers: WechatSignatureHeaders, body: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
    const { timestamp, nonce, signature, serial } = headers
    if (!timestamp || !nonce || !signature || !/^\d+$/.test(timestamp)) return false
    if (Math.abs(nowSeconds - Number(timestamp)) > WECHAT_MAX_CLOCK_SKEW_SECONDS) return false
    if (this.cfg.platformSerial && !safeEqual(this.cfg.platformSerial, serial || '')) return false
    const pem = readKeyFile(this.cfg.platformPublicKeyPath)
    if (!pem) return false
    try {
      return verify('sha256', Buffer.from(buildWechatResponseMessage(timestamp, nonce, body)), createPublicKey(pem), Buffer.from(signature, 'base64'))
    } catch {
      return false
    }
  }

  /** 解密回调 resource（AEAD_AES_256_GCM） */
  decryptResource(resource: { algorithm?: string; ciphertext?: string; nonce?: string; associated_data?: string }): WechatTransaction {
    if (resource.algorithm !== 'AEAD_AES_256_GCM') throw new Error('不支持的回调加密算法')
    const key = Buffer.from(this.cfg.apiV3Key, 'utf8')
    if (key.length !== 32) throw new Error('APIv3 密钥长度必须为 32 字节')
    const raw = Buffer.from(String(resource.ciphertext || ''), 'base64')
    if (raw.length <= 16) throw new Error('回调密文无效')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(String(resource.nonce || ''), 'utf8'))
    decipher.setAuthTag(raw.subarray(raw.length - 16))
    decipher.setAAD(Buffer.from(String(resource.associated_data || ''), 'utf8'))
    const plain = Buffer.concat([decipher.update(raw.subarray(0, raw.length - 16)), decipher.final()]).toString('utf8')
    return JSON.parse(plain) as WechatTransaction
  }

  /** 交易是否为本订单的成功支付：商户号、AppID、订单号、金额、币种必须全部一致 */
  isPaidTransactionFor(tx: WechatTransaction, orderNo: string, amountFen: number): boolean {
    return (
      tx.trade_state === 'SUCCESS' &&
      safeEqual(this.cfg.mchid, String(tx.mchid || '')) &&
      safeEqual(this.cfg.appid, String(tx.appid || '')) &&
      safeEqual(orderNo, String(tx.out_trade_no || '')) &&
      Number(tx.amount?.total ?? -1) === amountFen &&
      String(tx.amount?.currency || 'CNY').toUpperCase() === 'CNY'
    )
  }

  private async request(method: 'GET' | 'POST', pathWithQuery: string, body: string): Promise<{ status: number; json: any }> {
    const res = await fetch(`${this.cfg.apiBase}${pathWithQuery}`, {
      method,
      headers: {
        Authorization: this.buildAuthorization(method, pathWithQuery, body),
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'videogen-cloud/1.0',
      },
      body: body || undefined,
      signal: AbortSignal.timeout(15_000),
    })
    const raw = await res.text()
    if (res.status >= 200 && res.status < 300) {
      const ok = this.verifySignature(
        {
          timestamp: res.headers.get('wechatpay-timestamp') || '',
          nonce: res.headers.get('wechatpay-nonce') || '',
          signature: res.headers.get('wechatpay-signature') || '',
          serial: res.headers.get('wechatpay-serial') || '',
        },
        raw,
      )
      if (!ok) throw new Error('微信支付应答验签失败')
    }
    let json: any = {}
    try {
      json = raw ? JSON.parse(raw) : {}
    } catch {
      json = {}
    }
    return { status: res.status, json }
  }

  async createNative(input: { orderNo: string; description: string; amountFen: number; expireAt: number; notifyUrl: string }) {
    const body = JSON.stringify({
      appid: this.cfg.appid,
      mchid: this.cfg.mchid,
      description: input.description.slice(0, 120),
      out_trade_no: input.orderNo,
      time_expire: new Date(input.expireAt).toISOString().replace(/\.\d{3}Z$/, '+00:00'),
      notify_url: input.notifyUrl,
      amount: { total: input.amountFen, currency: 'CNY' },
    })
    const { status, json } = await this.request('POST', '/v3/pay/transactions/native', body)
    if (status !== 200 || !json.code_url) throw new Error(`微信下单失败：${json.message || `HTTP ${status}`}`)
    return { codeUrl: String(json.code_url) }
  }

  /** 主动查单（回调丢失时兜底）。订单不存在返回 null */
  async queryByOrderNo(orderNo: string): Promise<WechatTransaction | null> {
    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${encodeURIComponent(this.cfg.mchid)}`
    const { status, json } = await this.request('GET', path, '')
    if (status === 404) return null
    if (status !== 200) throw new Error(`微信查单失败：${json.message || `HTTP ${status}`}`)
    return json as WechatTransaction
  }
}
