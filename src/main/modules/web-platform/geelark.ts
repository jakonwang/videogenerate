import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type {
  GeelarkClonePublishCandidate,
  GeelarkCloudPhoneSummary,
  GeelarkMusicPreset,
  GeelarkMusicMode,
  GeelarkPluginConfigPayload,
  GeelarkPluginConfigSummary,
  GeelarkPublishAccount,
  GeelarkPublishTaskDetail,
  GeelarkPublishTaskSummary,
  GeelarkTaskStatus,
} from './types'

type GeelarkStoredConfig = Required<Pick<GeelarkPluginConfigPayload, 'baseUrl' | 'appId' | 'requestTimeoutMs'>> &
  Pick<GeelarkPluginConfigPayload, 'appSecret' | 'accessToken'>

type GeelarkConfigRecord = {
  userId: string
  config: GeelarkStoredConfig
  updatedAt: number
}

type GeelarkDb = {
  configs: GeelarkConfigRecord[]
  accounts: Array<GeelarkPublishAccount & { userId: string }>
  tasks: Array<GeelarkPublishTaskDetail & { userId: string }>
  musicPresets: Array<GeelarkMusicPreset & { userId: string }>
}

const DEFAULT_BASE_URL = 'https://openapi.geelark.com'
const DEFAULT_TIMEOUT_MS = 30_000

function now() {
  return Date.now()
}

function geelarkDbPath() {
  return join(getAppPaths().dbDir, 'geelark-publisher.json')
}

function emptyDb(): GeelarkDb {
  return { configs: [], accounts: [], tasks: [], musicPresets: [] }
}

function normalizeDb(input: Partial<GeelarkDb> | null | undefined): GeelarkDb {
  return {
    configs: Array.isArray(input?.configs) ? input.configs : [],
    accounts: Array.isArray(input?.accounts) ? input.accounts : [],
    tasks: Array.isArray(input?.tasks) ? input.tasks : [],
    musicPresets: Array.isArray(input?.musicPresets) ? input.musicPresets : [],
  }
}

async function readDb(): Promise<GeelarkDb> {
  const raw = await readJsonFile<Partial<GeelarkDb>>(geelarkDbPath(), emptyDb())
  return normalizeDb(raw)
}

async function writeDb(db: GeelarkDb) {
  await writeJsonFile(geelarkDbPath(), db)
}

function normalizeBaseUrl(input?: string) {
  return String(input || DEFAULT_BASE_URL).trim().replace(/\/+$/, '') || DEFAULT_BASE_URL
}

function normalizeConfig(input?: GeelarkPluginConfigPayload | null): GeelarkStoredConfig {
  return {
    baseUrl: normalizeBaseUrl(input?.baseUrl),
    appId: String(input?.appId || '').trim(),
    appSecret: String(input?.appSecret || '').trim() || undefined,
    accessToken: String(input?.accessToken || '').trim() || undefined,
    requestTimeoutMs: Number(input?.requestTimeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  }
}

function sanitizeConfig(config: GeelarkStoredConfig, updatedAt: number): GeelarkPluginConfigSummary {
  return {
    baseUrl: config.baseUrl,
    appId: config.appId,
    requestTimeoutMs: config.requestTimeoutMs,
    hasAppSecret: Boolean(String(config.appSecret || '').trim()),
    hasAccessToken: Boolean(String(config.accessToken || '').trim()),
    updatedAt,
  }
}

function mapTaskStatus(value: unknown): GeelarkTaskStatus {
  const raw = String(value ?? '').trim()
  if (raw === '1' || raw.toLowerCase() === 'waiting') return 'waiting'
  if (raw === '2' || raw.toLowerCase() === 'in progress' || raw.toLowerCase() === 'in_progress') return 'in_progress'
  if (raw === '3' || raw.toLowerCase() === 'completed' || raw.toLowerCase() === 'done') return 'completed'
  if (raw === '4' || raw.toLowerCase() === 'failed') return 'failed'
  if (raw === '7' || raw.toLowerCase() === 'cancelled' || raw.toLowerCase() === 'canceled') return 'cancelled'
  return 'unknown'
}

function platformTagName(value: unknown) {
  return String(value || '').trim()
}

function toCloudPhoneSummary(item: any): GeelarkCloudPhoneSummary {
  return {
    id: String(item?.id || '').trim(),
    serialName: String(item?.serialName || '').trim(),
    serialNo: String(item?.serialNo || '').trim() || undefined,
    status: Number(item?.status || 0),
    rpaStatus: typeof item?.rpaStatus === 'number' ? Number(item.rpaStatus) : undefined,
    remark: String(item?.remark || '').trim() || undefined,
    groupName: String(item?.group?.name || '').trim() || undefined,
    tags: Array.isArray(item?.tags) ? item.tags.map((tag: unknown) => platformTagName((tag as { name?: unknown })?.name || tag)).filter(Boolean) : undefined,
    proxyServer: String(item?.proxy?.server || '').trim() || undefined,
  }
}

function authHeaders(config: GeelarkStoredConfig, traceId: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    traceId,
  }
  const accessToken = String(config.accessToken || '').trim()
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
    return headers
  }
  const appId = String(config.appId || '').trim()
  const appSecret = String(config.appSecret || '').trim()
  const ts = String(Date.now())
  const nonce = traceId.slice(0, 6)
  const sign = createHash('sha256').update(`${appId}${traceId}${ts}${nonce}${appSecret}`).digest('hex').toUpperCase()
  headers.appId = appId
  headers.ts = ts
  headers.nonce = nonce
  headers.sign = sign
  return headers
}

async function requestGeelark<T>(config: GeelarkStoredConfig, path: string, body?: unknown): Promise<T> {
  const traceId = randomUUID().toUpperCase()
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: authHeaders(config, traceId),
    body: JSON.stringify(body ?? {}),
  })
  const payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string; data?: T }
  if (!response.ok || Number(payload.code || 0) !== 0) {
    throw new Error(String(payload.msg || `Geelark 请求失败: ${response.status}`))
  }
  return payload.data as T
}

async function resolveConfig(userId: string) {
  const db = await readDb()
  const record = db.configs.find((item) => item.userId === userId) ?? null
  if (!record) return null
  return record
}

async function requireConfig(userId: string) {
  const record = await resolveConfig(userId)
  if (!record) throw new Error('请先配置 Geelark 插件')
  const config = normalizeConfig(record.config)
  if (!String(config.appId || '').trim() && !String(config.accessToken || '').trim()) {
    throw new Error('Geelark 凭证未配置')
  }
  return config
}

async function resolveCloudPhoneMap(userId: string) {
  const config = await requireConfig(userId)
  const items: GeelarkCloudPhoneSummary[] = []
  let page = 1
  const pageSize = 100
  while (page <= 10) {
    const res = await requestGeelark<{ total?: number; page?: number; pageSize?: number; items?: any[] }>(
      config,
      '/open/v1/phone/list',
      { page, pageSize },
    )
    const current = Array.isArray(res.items) ? res.items.map(toCloudPhoneSummary).filter((item) => item.id) : []
    items.push(...current)
    const total = Number(res.total || 0)
    if (!total || items.length >= total || current.length < pageSize) break
    page += 1
  }
  return items
}

async function syncTaskDetail(userId: string, task: GeelarkPublishTaskDetail & { userId: string }) {
  const config = await requireConfig(userId)
  if (!String(task.geelarkTaskId || '').trim()) {
    return task
  }
  let searchAfter: number[] | undefined
  const logs: string[] = []
  const resultImages: string[] = []
  let remote: any = null
  for (let round = 0; round < 8; round += 1) {
    const res = await requestGeelark<any>(config, '/open/v1/task/detail', {
      id: task.geelarkTaskId,
      ...(searchAfter ? { searchAfter } : {}),
    })
    remote = res
    if (Array.isArray(res.logs)) logs.push(...res.logs.map((item: unknown) => String(item || '').trim()).filter(Boolean))
    if (Array.isArray(res.resultImages)) resultImages.splice(0, resultImages.length, ...res.resultImages.map((item: unknown) => String(item || '').trim()).filter(Boolean))
    const nextSearchAfter = Array.isArray(res.searchAfter) ? res.searchAfter : undefined
    if (!res.logContinue || !nextSearchAfter || !nextSearchAfter.length) {
      task.status = mapTaskStatus(res.status)
      task.failCode = typeof res.failCode === 'number' ? Number(res.failCode) : undefined
      task.failDesc = String(res.failDesc || '').trim() || undefined
      task.cloudPhoneName = String(res.serialName || task.cloudPhoneName || '').trim() || undefined
      task.resultImages = resultImages
      task.logs = logs
      task.raw = remote
      task.lastSyncAt = now()
      task.updatedAt = now()
      return task
    }
    searchAfter = nextSearchAfter
  }
  task.resultImages = resultImages
  task.logs = logs
  task.raw = remote
  task.lastSyncAt = now()
  task.updatedAt = now()
  task.status = mapTaskStatus(remote?.status)
  task.failCode = typeof remote?.failCode === 'number' ? Number(remote.failCode) : undefined
  task.failDesc = String(remote?.failDesc || '').trim() || undefined
  return task
}

async function uploadTempMedia(userId: string, filePath: string) {
  const config = await requireConfig(userId)
  const ext = extname(String(filePath || '').trim()).replace(/^\./, '').toLowerCase() || 'mp4'
  const uploadInfo = await requestGeelark<{ uploadUrl: string; resourceUrl: string }>(config, '/open/v1/upload/getUrl', {
    fileType: ext,
  })
  const bytes = await readFile(filePath)
  const response = await fetch(uploadInfo.uploadUrl, {
    method: 'PUT',
    body: bytes,
  })
  if (!response.ok) {
    throw new Error(`Geelark 临时文件上传失败: ${response.status}`)
  }
  return uploadInfo.resourceUrl
}

async function createPublishTask(userId: string, input: {
  videoUrl: string
  cloudPhoneId: string
  videoDesc?: string
  productId?: string
  productTitle?: string
  refVideoId?: string
  sameVideoVolume?: number
  sourceVideoVolume?: number
  markAI?: boolean
  scheduleAt?: number
  needShareLink?: boolean
}) {
  const config = await requireConfig(userId)
  const payload = {
    planName: 'VideoGenerate 发布任务',
    taskType: 1,
    list: [
      {
        scheduleAt: Math.floor(Number(input.scheduleAt || Date.now()) > 1e12 ? Number(input.scheduleAt || Date.now()) / 1000 : Number(input.scheduleAt || Date.now())),
        envId: input.cloudPhoneId,
        video: input.videoUrl,
        videoDesc: input.videoDesc || '',
        productId: input.productId || '',
        productTitle: input.productTitle || '',
        refVideoId: input.refVideoId || '',
        sameVideoVolume:
          typeof input.sameVideoVolume === 'number' && Number.isFinite(input.sameVideoVolume)
            ? Math.max(0, Math.min(100, Math.round(input.sameVideoVolume)))
            : undefined,
        sourceVideoVolume:
          typeof input.sourceVideoVolume === 'number' && Number.isFinite(input.sourceVideoVolume)
            ? Math.max(0, Math.min(100, Math.round(input.sourceVideoVolume)))
            : undefined,
        markAI: typeof input.markAI === 'boolean' ? input.markAI : undefined,
        needShareLink: Boolean(input.needShareLink),
      },
    ],
  }
  const response = await requestGeelark<{ taskIds?: string[] }>(config, '/open/v1/task/add', payload)
  return String(response.taskIds?.[0] || '').trim()
}

export const geelarkPublisher = {
  async getConfig(userId: string) {
    const record = await resolveConfig(userId)
    const normalized = normalizeConfig(record?.config)
    return sanitizeConfig(normalized, record?.updatedAt || 0)
  },

  async setConfig(userId: string, input: GeelarkPluginConfigPayload) {
    const db = await readDb()
    const updatedAt = now()
    const normalized = normalizeConfig(input)
    const next = { userId, config: normalized, updatedAt }
    const idx = db.configs.findIndex((item) => item.userId === userId)
    if (idx >= 0) db.configs[idx] = next
    else db.configs.unshift(next)
    await writeDb(db)
    return sanitizeConfig(normalized, updatedAt)
  },

  async listCloudPhones(userId: string) {
    return await resolveCloudPhoneMap(userId)
  },

  async listAccounts(userId: string) {
    const db = await readDb()
    return db.accounts
      .filter((item) => item.userId === userId)
      .map(({ userId: _userId, ...rest }) => rest)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  },

  async upsertAccount(userId: string, input: Partial<GeelarkPublishAccount> & { name: string; cloudPhoneId: string; cloudPhoneName: string }) {
    const db = await readDb()
    const updatedAt = now()
    const existing = db.accounts.find((item) => item.userId === userId && item.id === input.id)
    const item: GeelarkPublishAccount & { userId: string } = {
      id: existing?.id || input.id || randomUUID(),
      name: String(input.name || '').trim(),
      platform: 'tiktok',
      geelarkAccountId: String(input.geelarkAccountId || existing?.geelarkAccountId || '').trim() || undefined,
      cloudPhoneId: String(input.cloudPhoneId || existing?.cloudPhoneId || '').trim(),
      cloudPhoneName: String(input.cloudPhoneName || existing?.cloudPhoneName || '').trim(),
      remark: String(input.remark || existing?.remark || '').trim() || undefined,
      status: input.status === 'disabled' ? 'disabled' : 'active',
      createdAt: existing?.createdAt || updatedAt,
      updatedAt,
      userId,
    }
    const index = db.accounts.findIndex((entry) => entry.userId === userId && entry.id === item.id)
    if (index >= 0) db.accounts[index] = item
    else db.accounts.unshift(item)
    await writeDb(db)
    const { userId: _userId, ...rest } = item
    return rest
  },

  async deleteAccount(userId: string, id: string) {
    const db = await readDb()
    db.accounts = db.accounts.filter((item) => !(item.userId === userId && item.id === id))
    await writeDb(db)
  },

  async listTasks(userId: string) {
    const db = await readDb()
    return db.tasks
      .filter((item) => item.userId === userId)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .map(({ userId: _userId, ...rest }) => rest)
  },

  async listMusicPresets(userId: string) {
    const db = await readDb()
    return db.musicPresets
      .filter((item) => item.userId === userId)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .map(({ userId: _userId, ...rest }) => rest)
  },

  async upsertMusicPreset(userId: string, input: Partial<GeelarkMusicPreset> & { label: string; refVideoId: string }) {
    const db = await readDb()
    const updatedAt = now()
    const existing = db.musicPresets.find((item) => item.userId === userId && item.id === input.id)
    const item: GeelarkMusicPreset & { userId: string } = {
      id: existing?.id || input.id || randomUUID(),
      label: String(input.label || existing?.label || '').trim(),
      refVideoId: String(input.refVideoId || existing?.refVideoId || '').trim(),
      remark: String(input.remark || existing?.remark || '').trim() || undefined,
      createdAt: existing?.createdAt || updatedAt,
      updatedAt,
      userId,
    }
    const index = db.musicPresets.findIndex((entry) => entry.userId === userId && entry.id === item.id)
    if (index >= 0) db.musicPresets[index] = item
    else db.musicPresets.unshift(item)
    await writeDb(db)
    const { userId: _userId, ...rest } = item
    return rest
  },

  async deleteMusicPreset(userId: string, id: string) {
    const db = await readDb()
    db.musicPresets = db.musicPresets.filter((item) => !(item.userId === userId && item.id === id))
    await writeDb(db)
  },

  async getTask(userId: string, id: string) {
    const db = await readDb()
    const found = db.tasks.find((item) => item.userId === userId && item.id === id) ?? null
    if (!found) return null
    const { userId: _userId, ...rest } = found
    return rest
  },

  async publish(userId: string, input: {
    cloneProjectId?: string
    videoPath: string
    publishAccountId: string
    videoDesc?: string
    productId?: string
    productTitle?: string
    refVideoId?: string
    sameVideoVolume?: number
    sourceVideoVolume?: number
    markAI?: boolean
    musicMode?: GeelarkMusicMode
    musicLabel?: string
    scheduleAt?: number
    needShareLink?: boolean
  }) {
    const db = await readDb()
    const account = db.accounts.find((item) => item.userId === userId && item.id === input.publishAccountId)
    if (!account) throw new Error('请选择已绑定的发布账号')
    if (account.status !== 'active') throw new Error('当前发布账号已停用')
    if (!String(account.cloudPhoneId || '').trim()) throw new Error('发布账号未绑定云手机')
    const videoUrl = await uploadTempMedia(userId, input.videoPath)
    const geelarkTaskId = await createPublishTask(userId, {
      videoUrl,
      cloudPhoneId: account.cloudPhoneId,
      videoDesc: input.videoDesc,
      productId: input.productId,
      productTitle: input.productTitle,
      refVideoId: input.refVideoId,
      sameVideoVolume: input.sameVideoVolume,
      sourceVideoVolume: input.sourceVideoVolume,
      markAI: input.markAI,
      scheduleAt: input.scheduleAt,
      needShareLink: input.needShareLink,
    })
    const createdAt = now()
    const task: GeelarkPublishTaskDetail & { userId: string } = {
      id: randomUUID(),
      userId,
      pluginId: 'geelark-publisher',
      cloneProjectId: input.cloneProjectId,
      publishAccountId: account.id,
      cloudPhoneId: account.cloudPhoneId,
      cloudPhoneName: account.cloudPhoneName,
      sourceVideoPath: input.videoPath,
      videoDesc: input.videoDesc,
      productId: input.productId,
      productTitle: input.productTitle,
      refVideoId: input.refVideoId,
      sameVideoVolume:
        typeof input.sameVideoVolume === 'number' && Number.isFinite(input.sameVideoVolume)
          ? Math.max(0, Math.min(100, Math.round(input.sameVideoVolume)))
          : undefined,
      sourceVideoVolume:
        typeof input.sourceVideoVolume === 'number' && Number.isFinite(input.sourceVideoVolume)
          ? Math.max(0, Math.min(100, Math.round(input.sourceVideoVolume)))
          : undefined,
      markAI: typeof input.markAI === 'boolean' ? input.markAI : undefined,
      musicMode: input.musicMode || undefined,
      musicLabel: String(input.musicLabel || '').trim() || undefined,
      scheduleAt: Number(input.scheduleAt || createdAt),
      geelarkTaskId,
      status: 'waiting',
      createdAt,
      updatedAt: createdAt,
      resultImages: [],
      logs: [],
      raw: { videoUrl },
    }
    db.tasks.unshift(task)
    await writeDb(db)
    const { userId: _userId, ...rest } = task
    return rest
  },

  buildPublishCandidates(
    projects: Array<{
      id: string
      title?: string
      coverAssetPath?: string
      finalOutputPath?: string
      referenceVideoName?: string
      referenceVideoPath?: string
      productReferenceImagePaths?: string[]
      updatedAt?: number
    }>,
    tasks: GeelarkPublishTaskSummary[],
  ): GeelarkClonePublishCandidate[] {
    const taskMap = new Map<string, GeelarkPublishTaskSummary[]>()
    for (const task of tasks) {
      const projectId = String(task.cloneProjectId || '').trim()
      if (!projectId) continue
      const list = taskMap.get(projectId) || []
      list.push(task)
      taskMap.set(projectId, list)
    }

    return projects
      .filter((project) => String(project.finalOutputPath || '').trim())
      .map((project) => {
        const projectId = String(project.id || '').trim()
        const related = (taskMap.get(projectId) || []).slice().sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
        const latest = related[0]
        const hasPublished = related.some((item) => item.status === 'completed' || item.status === 'waiting' || item.status === 'in_progress')
        const status: GeelarkClonePublishCandidate['publishedStatus'] = hasPublished
          ? 'published'
          : latest?.status === 'failed'
            ? 'failed'
            : 'unpublished'
        return {
          cloneProjectId: projectId,
          title: String(project.title || '').trim() || projectId,
          coverAssetPath: String(project.coverAssetPath || '').trim(),
          finalOutputPath: String(project.finalOutputPath || '').trim(),
          referenceVideoName: String(project.referenceVideoName || '').trim(),
          referenceVideoPath: String(project.referenceVideoPath || '').trim(),
          productReferenceImagePaths: Array.isArray(project.productReferenceImagePaths)
            ? project.productReferenceImagePaths.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
            : [],
          updatedAt: Number(project.updatedAt || 0),
          publishedStatus: status,
          lastPublishTaskId: latest?.id,
          lastPublishStatus: latest?.status,
        }
      })
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  },

  async syncTask(userId: string, id: string) {
    const db = await readDb()
    const current = db.tasks.find((item) => item.userId === userId && item.id === id)
    if (!current) throw new Error('发布记录不存在')
    const synced = await syncTaskDetail(userId, current)
    const index = db.tasks.findIndex((item) => item.userId === userId && item.id === id)
    db.tasks[index] = synced
    await writeDb(db)
    const { userId: _userId, ...rest } = synced
    return rest
  },
}
