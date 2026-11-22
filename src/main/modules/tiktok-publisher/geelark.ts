/**
 * GeeLark 云手机发布通道：凭证、云手机列表（当成发布账号）、上传视频 + 创建发布任务、查询任务状态。
 * 鉴权：有 Access Token 用 Bearer；否则 appId + traceId + ts + nonce + API Key 做 SHA256 签名。
 */
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { decryptRuntimeString, encryptRuntimeString, isRuntimeEncryptionAvailable } from '../../lib/runtimeCrypto'
import {
  GEELARK_PLATFORMS,
  GEELARK_PLATFORM_KEYS,
  geelarkAccountUid,
  geelarkFailText,
  geelarkTaskState,
  isManualProductTitle,
  parseGeelarkAccountUid,
  type GeelarkPlatform,
} from '../../../shared/geelark'
import type { CreatokPublishTask } from './types'

export type GeelarkConfig = { baseUrl: string; appId?: string; apiKey?: string; accessToken?: string; platforms: GeelarkPlatform[] }
type StoredConfig = { baseUrl?: string; appId?: string; apiKey?: string; accessToken?: string; platforms?: GeelarkPlatform[] }

const DEFAULT_BASE_URL = 'https://openapi.geelark.com'
const configPath = () => join(getAppPaths().dbDir, 'geelark-publisher.json')

async function readConfig(): Promise<GeelarkConfig> {
  const raw = await readJsonFile<StoredConfig>(configPath(), {})
  const secret = (value?: string) => (value ? decryptRuntimeString(value) || '' : '')
  const platforms = (raw.platforms || ['tiktok']).filter((p) => p in GEELARK_PLATFORMS)
  return {
    baseUrl: String(raw.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '') || DEFAULT_BASE_URL,
    appId: String(raw.appId || '').trim() || undefined,
    apiKey: secret(raw.apiKey) || undefined,
    accessToken: secret(raw.accessToken) || undefined,
    platforms: platforms.length ? platforms : ['tiktok'],
  }
}
const isConfigured = (config: GeelarkConfig) => Boolean(config.accessToken || (config.appId && config.apiKey))
const mask = (value?: string) => (value ? `${value.slice(0, 4)}...${value.slice(-4)}` : '')

export function geelarkAuthHeaders(config: Pick<GeelarkConfig, 'appId' | 'apiKey' | 'accessToken'>, traceId: string, now = Date.now()) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', traceId }
  if (config.accessToken) {
    headers.Authorization = `Bearer ${config.accessToken}`
    return headers
  }
  const ts = String(now)
  const nonce = traceId.slice(0, 6)
  headers.appId = String(config.appId || '')
  headers.ts = ts
  headers.nonce = nonce
  headers.sign = createHash('sha256').update(`${config.appId}${traceId}${ts}${nonce}${config.apiKey}`).digest('hex').toUpperCase()
  return headers
}

async function call<T>(config: GeelarkConfig, path: string, body: unknown): Promise<T> {
  const traceId = randomUUID().replace(/-/g, '').toUpperCase()
  const response = await fetch(`${config.baseUrl}${path}`, { method: 'POST', headers: geelarkAuthHeaders(config, traceId), body: JSON.stringify(body ?? {}) })
  const payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string; data?: T }
  if (!response.ok || Number(payload.code ?? -1) !== 0) throw new Error(`GeeLark：${payload.msg || `请求失败（${response.status}）`}`)
  return payload.data as T
}

async function requireConfig() {
  const config = await readConfig()
  if (!isConfigured(config)) throw new Error('还没有连接 GeeLark，先在发布中心右上角填好 GeeLark 密钥')
  return config
}

export type GeelarkPhone = { id: string; name: string; status: number; group?: string }

async function listPhones(config: GeelarkConfig): Promise<GeelarkPhone[]> {
  const out: GeelarkPhone[] = []
  for (let page = 1; page <= 10; page += 1) {
    const data = await call<{ total?: number; items?: any[] }>(config, '/open/v1/phone/list', { page, pageSize: 100 })
    const items = (data?.items || []).map((item) => ({
      id: String(item?.id || '').trim(),
      name: String(item?.serialName || item?.serialNo || item?.id || '').trim(),
      status: Number(item?.status ?? 2),
      ...(item?.group?.name ? { group: String(item.group.name) } : {}),
    })).filter((item) => item.id)
    out.push(...items)
    if (items.length < 100 || out.length >= Number(data?.total || 0)) break
  }
  return out
}

async function uploadVideo(config: GeelarkConfig, filePath: string) {
  const fileType = extname(filePath).replace(/^\./, '').toLowerCase() || 'mp4'
  const { uploadUrl, resourceUrl } = await call<{ uploadUrl: string; resourceUrl: string }>(config, '/open/v1/upload/getUrl', { fileType })
  const response = await fetch(uploadUrl, { method: 'PUT', body: await readFile(filePath) })
  if (!response.ok) throw new Error(`GeeLark：视频上传失败（${response.status}）`)
  return resourceUrl
}

/** 发布文案：TikTok / Instagram / Facebook 用描述（标题 + 描述），YouTube 用标题 */
function caption(task: CreatokPublishTask) {
  return [task.videoTitle, task.description].map((value) => String(value || '').trim()).filter(Boolean).join('\n')
}

export function buildGeelarkPublishRequest(task: CreatokPublishTask, videoUrl: string, now = Date.now()): { path: string; body: Record<string, unknown> } {
  const target = parseGeelarkAccountUid(task.connectionUid)
  if (!target) throw new Error('不是 GeeLark 云手机账号')
  const scheduleAt = Math.floor((task.scheduleAt ? Math.max(Date.parse(task.scheduleAt), now) : now) / 1000)
  const name = `Klipmill ${GEELARK_PLATFORMS[target.platform].short}`.slice(0, 128)
  if (target.platform === 'tiktok') {
    return {
      path: '/open/v1/task/add',
      body: {
        planName: name,
        taskType: 1,
        list: [{
          scheduleAt,
          envId: target.phoneId,
          video: videoUrl,
          videoDesc: caption(task).slice(0, 4000),
          // 手填的商品 ID 没有真实商品名：只传 ID，商品链接文字留给 TikTok 默认
          ...(task.productId ? { productId: task.productId, ...(task.productLinkTitle || (task.productTitle && !isManualProductTitle(task.productTitle)) ? { productTitle: task.productLinkTitle || task.productTitle } : {}) } : {}),
          markAI: Boolean(task.aiGenerated),
          needShareLink: true,
        }],
      },
    }
  }
  if (target.platform === 'youtube') {
    return { path: '/open/v1/rpa/task/youtubePubShort', body: { name, scheduleAt, id: target.phoneId, title: String(task.videoTitle || task.description || '').slice(0, 100), video: videoUrl, sameStyleVoice: 0, originalVoice: 100 } }
  }
  if (target.platform === 'instagram') {
    return { path: '/open/v1/rpa/task/instagramPubReels', body: { name, scheduleAt, id: target.phoneId, description: caption(task).slice(0, 2200), video: [videoUrl], aiTag: Boolean(task.aiGenerated), needShareLink: true } }
  }
  return { path: '/open/v1/rpa/task/faceBookPubReels', body: { name, scheduleAt, id: target.phoneId, description: caption(task).slice(0, 500), video: videoUrl } }
}

/** 其他 GeeLark 接口（养号等）共用：带鉴权调一次，未连接时报错 */
export async function geelarkRequest<T>(path: string, body: unknown): Promise<T> {
  return call<T>(await requireConfig(), path, body)
}

export const geelarkPublisher = {
  async status() {
    const config = await readConfig()
    return { configured: isConfigured(config), baseUrl: config.baseUrl, appId: config.appId || '', maskedKey: mask(config.apiKey), maskedToken: mask(config.accessToken), platforms: config.platforms }
  },

  async save(input: { baseUrl?: string; appId?: string; apiKey?: string; accessToken?: string; platforms?: string[] }) {
    if (!isRuntimeEncryptionAvailable()) throw new Error('本机安全存储不可用，无法保存密钥')
    const current = await readJsonFile<StoredConfig>(configPath(), {})
    const keep = (incoming: string | undefined, stored: string | undefined) => {
      const value = String(incoming ?? '').trim()
      // 留空 = 不改；填了就加密保存
      return value ? encryptRuntimeString(value) || stored : stored
    }
    const platforms = (input.platforms || current.platforms || ['tiktok']).filter((p): p is GeelarkPlatform => p in GEELARK_PLATFORMS)
    await writeJsonFile(configPath(), {
      baseUrl: String(input.baseUrl || current.baseUrl || DEFAULT_BASE_URL).trim(),
      appId: input.appId !== undefined ? String(input.appId).trim() : current.appId,
      apiKey: keep(input.apiKey, current.apiKey),
      accessToken: keep(input.accessToken, current.accessToken),
      platforms: platforms.length ? platforms : ['tiktok'],
    } satisfies StoredConfig)
    return this.status()
  },

  async clear() {
    await writeJsonFile(configPath(), {})
    return this.status()
  },

  /** 测试连接：能拿到云手机列表就算通 */
  async test() {
    const phones = await listPhones(await requireConfig())
    return { phones: phones.length }
  },

  /** 云手机 × 开启的平台 = 发布账号 */
  async connections() {
    const config = await readConfig()
    if (!isConfigured(config)) return []
    const phones = await listPhones(config)
    return phones.flatMap((phone) => config.platforms.map((platform) => ({
      uid: geelarkAccountUid(phone.id, platform),
      name: `☁ ${phone.name} · ${GEELARK_PLATFORMS[platform].short}`,
      channel: 'geelark' as const,
      platform,
      phoneId: phone.id,
      ...(phone.group ? { group: phone.group } : {}),
    })))
  },

  validate(task: CreatokPublishTask) {
    const target = parseGeelarkAccountUid(task.connectionUid)
    if (!target) throw new Error('TikTok account is not selected')
    if (target.platform === 'youtube' && !String(task.videoTitle || task.description || '').trim()) throw new Error('Video title is required')
    if (target.platform !== 'youtube' && !caption(task)) throw new Error('Video title is required')
  },

  async submit(task: CreatokPublishTask): Promise<Partial<CreatokPublishTask>> {
    const config = await requireConfig()
    this.validate(task)
    const videoUrl = await uploadVideo(config, task.sourceVideoPath)
    const request = buildGeelarkPublishRequest(task, videoUrl)
    const data = await call<{ taskIds?: string[]; taskId?: string }>(config, request.path, request.body)
    const remoteJobId = String(data?.taskId || data?.taskIds?.[0] || '').trim()
    if (!remoteJobId) throw new Error('GeeLark 没有返回任务 ID')
    return { remoteJobId, assetId: videoUrl, state: 'scheduled', error: undefined }
  },

  /** 批量查任务状态，返回 taskId → 新状态 */
  async refresh(tasks: CreatokPublishTask[]) {
    const ids = tasks.map((task) => task.remoteJobId).filter((id): id is string => Boolean(id))
    const out = new Map<string, Partial<CreatokPublishTask>>()
    if (!ids.length) return out
    const config = await requireConfig()
    for (let i = 0; i < ids.length; i += 100) {
      const data = await call<{ items?: any[] }>(config, '/open/v1/task/query', { ids: ids.slice(i, i + 100) })
      for (const item of data?.items || []) {
        const state = geelarkTaskState(item?.status)
        if (!state) continue
        out.set(String(item.id), state === 'failed' || state === 'cancelled'
          ? { state, error: { message: geelarkFailText(Number(item.failCode) || undefined, String(item.failDesc || '') || undefined), reason: item.failCode ? String(item.failCode) : undefined, stage: 'geelark' } }
          : { state, error: undefined, ...(item.shareLink ? { geelarkShareLink: String(item.shareLink) } : {}) })
      }
    }
    return out
  },
}

export { GEELARK_PLATFORM_KEYS }
