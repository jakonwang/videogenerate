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
  return 'image/png'
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
    prefix: String(credentials.qiniuPrefix || '').trim().replace(/^\/+|\/+$/g, '') || 'videogenerate/clone',
  }
}

function uploadToken(input: { accessKey: string; secretKey: string; bucket: string; key: string }) {
  const deadline = Math.floor(Date.now() / 1000) + 3600
  const policy = base64Url(JSON.stringify({ scope: `${input.bucket}:${input.key}`, deadline }))
  const sign = createHmac('sha1', input.secretKey).update(policy).digest()
  return `${input.accessKey}:${base64Url(sign)}:${policy}`
}

export async function uploadToQiniu(input: { credentials: ModelCredentials; filePath: string; keyPrefix?: string }) {
  const cfg = requireQiniuConfig(input.credentials)
  const ext = extname(input.filePath).toLowerCase() || '.png'
  const safeName = basename(input.filePath).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80)
  const key = [cfg.prefix, input.keyPrefix, `${Date.now()}_${randomUUID()}_${safeName || `asset${ext}`}`]
    .filter(Boolean)
    .join('/')
  const token = uploadToken({ accessKey: cfg.accessKey, secretKey: cfg.secretKey, bucket: cfg.bucket, key })
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
  return `${cfg.domain}/${returnedKey.split('/').map(encodeURIComponent).join('/')}`
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
