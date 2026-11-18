import { createHmac, randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import type { ModelCredentials } from './types'

const publicUrlCache = new Map<string, string>()

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
}

function cleanDomain(domain: string) {
  const raw = String(domain || '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

function cleanUploadHost(host: string) {
  const raw = String(host || '').trim().replace(/\/+$/, '')
  if (!raw) return 'https://upload.qiniup.com'
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

function pickRegionUploadHost(text: string) {
  const match = String(text || '').match(/please use\s+([a-z0-9.-]+qiniup\.com)/i)
  return match?.[1] ? cleanUploadHost(match[1]) : ''
}

function mimeByPath(filePath: string) {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.mkv') return 'video/x-matroska'
  return 'image/png'
}

/**
 * 商业版托管模式：七牛 AK/SK 只在云端，电脑端每次上传前向云端要「只能写这一个文件」的上传凭证。
 * 由 cloudLicense 在托管模式下注册；云端 / 内部版不注册，继续用本地 AK/SK 签名。
 */
export type QiniuUploadGrant = { token: string; key: string; uploadHost: string; domain: string }
type QiniuUploadGrantProvider = (input: { fileName: string; keyPrefix?: string }) => Promise<QiniuUploadGrant>
let uploadGrantProvider: QiniuUploadGrantProvider | null = null

export function setQiniuUploadGrantProvider(next: QiniuUploadGrantProvider | null) {
  uploadGrantProvider = next
  publicUrlCache.clear()
}

function requireQiniuConfig(credentials: ModelCredentials) {
  const accessKey = String(credentials.qiniuAccessKey || '').trim()
  const secretKey = String(credentials.qiniuSecretKey || '').trim()
  const bucket = String(credentials.qiniuBucket || '').trim()
  const domain = cleanDomain(String(credentials.qiniuDomain || '').trim())
  if (!accessKey || !secretKey || !bucket || !domain) {
    throw new Error('GRS.AI 需要公网输入 URL，请先在模型设置中配置七牛云 AccessKey、SecretKey、Bucket 和外链域名，或直接使用公网素材 URL。')
  }
  return {
    accessKey,
    secretKey,
    bucket,
    domain,
    uploadHost: cleanUploadHost(String(credentials.qiniuUploadHost || '').trim()),
    prefix: qiniuPrefixOf(credentials.qiniuPrefix),
  }
}

export function qiniuPrefixOf(prefix: unknown) {
  return String(prefix || '').trim().replace(/^\/+|\/+$/g, '') || 'videogenerate/clone'
}

/** 生成对象名：前缀 / 子目录 / 时间_随机_文件名（云端签发上传凭证时也用这个规则） */
export function qiniuObjectKey(input: { prefix: string; keyPrefix?: string; fileName: string }) {
  const ext = extname(input.fileName).toLowerCase() || '.png'
  const safeName = basename(input.fileName).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)
  const keyPrefix = String(input.keyPrefix || '').replace(/[^a-zA-Z0-9/_-]+/g, '_').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/').slice(0, 80)
  return [input.prefix, keyPrefix, `${Date.now()}_${randomUUID()}_${safeName || `asset${ext}`}`].filter(Boolean).join('/')
}

export function qiniuDomainOf(domain: unknown) {
  return cleanDomain(String(domain || ''))
}

export function qiniuUploadHostOf(host: unknown) {
  return cleanUploadHost(String(host || ''))
}

export function qiniuUploadToken(input: { accessKey: string; secretKey: string; bucket: string; key: string }) {
  const deadline = Math.floor(Date.now() / 1000) + 3600
  const policy = base64Url(JSON.stringify({ scope: `${input.bucket}:${input.key}`, deadline }))
  const sign = createHmac('sha1', input.secretKey).update(policy).digest()
  return `${input.accessKey}:${base64Url(sign)}:${policy}`
}

export async function uploadToQiniu(input: { credentials: ModelCredentials; filePath: string; keyPrefix?: string }) {
  const ext = extname(input.filePath).toLowerCase() || '.png'
  const safeName = basename(input.filePath).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)
  let key: string
  let token: string
  let domain: string
  let cfg: { uploadHost: string }
  if (uploadGrantProvider && !String(input.credentials.qiniuSecretKey || '').trim()) {
    const grant = await uploadGrantProvider({ fileName: safeName || `asset${ext}`, keyPrefix: input.keyPrefix })
    key = grant.key
    token = grant.token
    domain = cleanDomain(grant.domain)
    cfg = { uploadHost: cleanUploadHost(grant.uploadHost) }
  } else {
    const local = requireQiniuConfig(input.credentials)
    key = qiniuObjectKey({ prefix: local.prefix, keyPrefix: input.keyPrefix, fileName: safeName || `asset${ext}` })
    token = qiniuUploadToken({ accessKey: local.accessKey, secretKey: local.secretKey, bucket: local.bucket, key })
    domain = local.domain
    cfg = local
  }
  const buf = await readFile(input.filePath)

  const makeForm = () => {
    const form = new FormData()
    form.append('token', token)
    form.append('key', key)
    form.append('file', new Blob([buf], { type: mimeByPath(input.filePath) }), safeName || `asset${ext}`)
    return form
  }

  const upload = async (uploadHost: string) => {
    const res = await fetch(uploadHost, { method: 'POST', body: makeForm() })
    const text = await res.text().catch(() => '')
    return { res, text, uploadHost }
  }

  let result = await upload(cfg.uploadHost)
  if (!result.res.ok) {
    const regionHost = pickRegionUploadHost(result.text)
    if (regionHost && regionHost !== cfg.uploadHost) result = await upload(regionHost)
  }

  const { res, text, uploadHost } = result
  if (!res.ok) throw new Error(`七牛云上传失败 ${res.status} ${text || res.statusText}（上传域名：${uploadHost}）`)

  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  const returnedKey = String(json?.key || key)
  return `${domain}/${returnedKey.split('/').map(encodeURIComponent).join('/')}`
}

export async function toPublicUrlViaQiniu(credentials: ModelCredentials, value: string, keyPrefix?: string) {
  if (/^https?:\/\//i.test(String(value || '').trim())) return value
  const filePath = resolve(String(value || '').trim())
  const fileStat = await stat(filePath)
  const cacheKey = [filePath, fileStat.size, fileStat.mtimeMs, String(keyPrefix || '')].join('|')
  const cached = publicUrlCache.get(cacheKey)
  if (cached) return cached
  const uploaded = await uploadToQiniu({ credentials, filePath, keyPrefix })
  publicUrlCache.set(cacheKey, uploaded)
  return uploaded
}
