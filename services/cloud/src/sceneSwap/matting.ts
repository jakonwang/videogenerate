import { createHash, createHmac, randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import sharp from 'sharp'
import type { ManagedMatting } from '../../../../src/shared/cloud/managedSettings'

export type Matting = { available: () => boolean; run: (input: string, output: string) => Promise<unknown> }

const TIMEOUT_MS = 60_000
const ATTEMPTS = 3
/** 腾讯云抠图默认 5 QPS，这里同时最多 2 张 */
const PARALLEL = 2

const hmac = (key: string, text: string) => createHmac('sha1', key).update(text, 'utf8').digest('hex')
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const listOf = (values: Record<string, string>) => {
  const pairs = Object.entries(values).map(([k, v]) => [encode(k).toLowerCase(), encode(v)] as const).sort((a, b) => (a[0] < b[0] ? -1 : 1))
  return { keys: pairs.map((p) => p[0]).join(';'), text: pairs.map((p) => p.join('=')).join('&') }
}

/** 腾讯云 COS 请求签名（HMAC-SHA1）：https://cloud.tencent.com/document/product/436/7778 */
export function cosAuthorization(input: { secretId: string; secretKey: string; method: string; path: string; params: Record<string, string>; headers: Record<string, string>; now: number }) {
  const start = Math.floor(input.now / 1000) - 60
  const keyTime = `${start};${start + 660}`
  const params = listOf(input.params)
  const headers = listOf(input.headers)
  const httpString = `${input.method.toLowerCase()}\n${input.path}\n${params.text}\n${headers.text}\n`
  const digest = createHash('sha1').update(httpString, 'utf8').digest('hex')
  const signature = hmac(hmac(input.secretKey, keyTime), `sha1\n${keyTime}\n${digest}\n`)
  return `q-sign-algorithm=sha1&q-ak=${input.secretId}&q-sign-time=${keyTime}&q-key-time=${keyTime}&q-header-list=${headers.keys}&q-url-param-list=${params.keys}&q-signature=${signature}`
}

class CosError extends Error {
  constructor(message: string, readonly retry: boolean) {
    super(message)
  }
}

function explain(status: number, code: string) {
  if (code === 'InvalidAccessKeyId' || code === 'SignatureDoesNotMatch') return '密钥不正确'
  if (code === 'AccessDenied' || code === 'NoProcessAuthority') return '密钥没有权限，或存储桶没有绑定数据万象'
  if (code === 'NoSuchBucket') return '存储桶或地域填错了'
  if (code === 'RequestTimeTooSkewed') return '服务器时间不准'
  if (status === 451 || status === 402) return '腾讯云账号欠费'
  return `${status} ${code}`.trim()
}

/**
 * 抠图走腾讯云数据万象（按张收费），服务器只转发：原图临时传到私有存储桶 → 下载时抠图 → 删掉原图。
 * 输出和输入同尺寸的灰度蒙版 PNG（白 = 人物）。
 */
export function createMatting(options: { settings: () => ManagedMatting; fetchImpl?: typeof fetch; now?: () => number; retryMs?: number }): Matting {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  let active = 0
  const waiting: Array<() => void> = []

  async function request(cfg: ManagedMatting, method: string, key: string, params: Record<string, string> = {}, body?: Buffer) {
    const host = `${cfg.bucket}.cos.${cfg.region}.myqcloud.com`
    const path = `/${key}`
    const type: Record<string, string> = body ? { 'content-type': 'image/jpeg' } : {}
    const authorization = cosAuthorization({ ...cfg, method, path, params, headers: { host, ...type }, now: now() })
    const query = listOf(params).text
    let res: Response
    let data: Buffer
    try {
      res = await fetchImpl(`https://${host}${path}${query ? `?${query}` : ''}`, {
        method,
        headers: { authorization, ...type },
        body: body ? new Uint8Array(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      data = Buffer.from(await res.arrayBuffer())
    } catch {
      throw new CosError('连不上腾讯云', true)
    }
    if (res.ok) return data
    const code = /<Code>([^<]*)<\/Code>/.exec(data.toString('utf8'))?.[1] ?? ''
    throw new CosError(explain(res.status, code), res.status >= 500 || res.status === 429)
  }

  async function retrying<T>(work: () => Promise<T>) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await work()
      } catch (error) {
        if (attempt >= ATTEMPTS || !(error instanceof CosError) || !error.retry) throw error
        await sleep((options.retryMs ?? 1000) * attempt)
      }
    }
  }

  async function once(input: string, output: string) {
    const cfg = options.settings()
    const { data: photo, info } = await sharp(input).flatten({ background: '#ffffff' }).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer({ resolveWithObject: true })
    const key = `scene-swap-temp/${randomUUID()}.jpg`
    let cut: Buffer
    try {
      await retrying(() => request(cfg, 'PUT', key, {}, photo))
      cut = await retrying(() => request(cfg, 'GET', key, { 'ci-process': cfg.type }))
    } catch (error) {
      throw new Error(`抠图失败：${(error as Error).message}`)
    } finally {
      // 删失败不影响出图；存储桶上另设 1 天自动清理
      await request(cfg, 'DELETE', key).catch(() => undefined)
    }
    const meta = await sharp(cut).metadata()
    if (!meta.hasAlpha) throw new Error('抠图失败：返回的图没有透明通道')
    // 尺寸不同说明被裁过，硬拉伸会和原图错位
    if (meta.width !== info.width || meta.height !== info.height) throw new Error(`抠图失败：返回尺寸 ${meta.width}×${meta.height} 和原图 ${info.width}×${info.height} 不一致`)
    await sharp(cut).extractChannel('alpha').toColourspace('b-w').png().toFile(output)
  }

  return {
    available: () => {
      const cfg = options.settings()
      return Boolean(cfg.secretId && cfg.secretKey && cfg.bucket && cfg.region)
    },
    run: async (input, output) => {
      if (active >= PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve))
      else active += 1
      try {
        await once(input, output)
      } finally {
        const next = waiting.shift()
        if (next) next()
        else active -= 1
      }
    },
  }
}
