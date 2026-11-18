import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, sep } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { SYNC_COLLECTIONS, SYNC_MAX_FILE_BYTES, SYNC_MAX_PUSH, type SyncChange } from '../../../shared/cloud/sync'
import type { CloneWorkspaceDoc, SyncCloneWorkspace } from '../../../shared/cloud/cloneWorkspace'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type { CloneProject, CloneProjectGroup, CloneProjectSummary } from '../clone/types'

/**
 * 复刻项目同步：电脑端和服务器上的复刻引擎是同一套代码，项目在两边双向同步。
 * 在哪一端做就在哪一端生成；另一端拿到的是同一个项目（同 id），可以接着做。
 *
 * - 推送：本机改过的项目 → 上传用到的文件 + 压缩的完整项目 → 同步记录（摘要 + 文件清单）
 * - 拉取：云端更新的项目 → 下载文件（放到本机对应的数据目录下）→ 路径换成本机路径后导入
 * - 冲突：项目自己的 updatedAt 谁新用谁
 * - 商品 / 模特 id：两端各有本地 id，经同步层的对照表换算
 */

const COLLECTION = SYNC_COLLECTIONS.cloneWorkspaces
/** 生成中的项目每次轮询都会更新：同一个项目最快每隔这么久推送一次 */
const MIN_PUSH_INTERVAL_MS = 15_000
/** 第一次同步只带最近改过的项目（老项目连同视频全部上传太占空间）；老项目再次打开改动后会同步 */
const RECENT_MS = 30 * 24 * 60 * 60 * 1000

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.json': 'application/json', '.srt': 'text/plain', '.ass': 'text/plain', '.txt': 'text/plain', '.vtt': 'text/plain',
}
const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|\/(?!\/))/

type Session = {
  client: ReturnType<typeof import('../../../shared/cloud/client').createCloudClient>
  userId: string
  canWrite: boolean
}

type Link = { cloudUpdatedAt: number; localUpdatedAt: number; pushedAt?: number }
type BridgeState = {
  userId: string
  cursor: number
  links: Record<string, Link>
  fileHashes: Record<string, { size: number; mtimeMs: number; fileId: string }>
  uploaded: Record<string, true>
}

/** 本机上的复刻引擎（电脑端的 cloneRepo / cloneService）。测试可以替换 */
export type CloneStore = {
  listProjects(): Promise<CloneProject[]>
  getProject(id: string): Promise<CloneProject | null>
  importProject(project: CloneProject): Promise<CloneProject | null>
  removeProject(id: string): Promise<void>
  summary(project: CloneProject): Promise<Pick<CloneProjectSummary, 'coverAssetPath' | 'finalOutputPath'>>
  listGroups(): Promise<CloneProjectGroup[]>
  createGroup(name: string): Promise<CloneProjectGroup>
}

export async function defaultCloneStore(): Promise<CloneStore> {
  const [{ cloneRepo }, { cloneService }] = await Promise.all([import('../clone/repo'), import('../clone/service')])
  return {
    listProjects: () => cloneRepo.listRawProjects(),
    getProject: (id) => cloneRepo.getProject(id),
    importProject: (project) => cloneRepo.importSyncedProject(project),
    removeProject: async (id) => void (await cloneRepo.removeProject(id)),
    summary: async (project) => {
      const summary = await cloneService.getProjectSummary({ cloneProjectId: project.id }).catch(() => null)
      return { coverAssetPath: summary?.coverAssetPath || project.coverAssetPath || '', finalOutputPath: summary?.finalOutputPath || '' }
    },
    listGroups: () => cloneRepo.listProjectGroups(),
    createGroup: (name) => cloneRepo.createProjectGroup({ name }),
  }
}

/** 本机商品 / 模特 id 与云端 id 的对照（同步层的 links 表） */
export type CloneIdMaps = {
  productToCloud(localId: string): string | undefined
  productToLocal(cloudId: string): string | undefined
  modelToCloud(localId: string): string | undefined
  modelToLocal(cloudId: string): string | undefined
}

export type CloneBridgeOptions = {
  origin: SyncCloneWorkspace['origin']
  store: CloneStore
  ids: CloneIdMaps
  /** 只推送这些项目（服务器上调用后立即推送用；拉取总是全部）；不传 = 全部 */
  only?: string[]
}

const statePath = () => join(getAppPaths().dbDir, 'cloud-sync-clone.json')
const roots = () => {
  const paths = getAppPaths()
  return [...new Set([paths.dataDir, paths.userData].filter(Boolean).map((root) => root.replace(/[\\/]+$/, '')))]
}

async function loadState(userId: string): Promise<BridgeState> {
  const saved = await readJsonFile<BridgeState | null>(statePath(), null)
  const empty: BridgeState = { userId, cursor: 0, links: {}, fileHashes: {}, uploaded: {} }
  if (!saved || saved.userId !== userId) return empty
  return { ...empty, ...saved }
}

let inflight: Promise<{ pushed: number; pulled: number }> | null = null

/** 同步一次复刻项目（推送本机改动，再拉取另一端的改动）。同一时间只跑一轮 */
export async function syncCloneWorkspaces(session: Session, options: CloneBridgeOptions): Promise<{ pushed: number; pulled: number }> {
  while (inflight) await inflight.catch(() => undefined)
  inflight = (async () => {
    const state = await loadState(session.userId)
    try {
      const pushed = session.canWrite ? await push(session, state, options) : 0
      const pulled = await pull(session, state, options)
      return { pushed, pulled }
    } finally {
      await writeJsonFile(statePath(), state)
    }
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

/* ------------------------------------------------------------------ 推送 */

async function fileIdOf(state: BridgeState, path: string): Promise<{ fileId: string; size: number } | null> {
  try {
    const info = await stat(path)
    if (!info.isFile() || !info.size || info.size > SYNC_MAX_FILE_BYTES) return null
    const cached = state.fileHashes[path]
    if (cached && cached.size === info.size && cached.mtimeMs === info.mtimeMs) return { fileId: cached.fileId, size: info.size }
    const fileId = createHash('sha256').update(await readFile(path)).digest('hex')
    state.fileHashes[path] = { size: info.size, mtimeMs: info.mtimeMs, fileId }
    return { fileId, size: info.size }
  } catch {
    return null
  }
}

/** 项目里所有像本地文件路径的字符串 */
function collectPaths(value: unknown, out: Set<string>) {
  if (typeof value === 'string') {
    if (value.length < 1024 && ABSOLUTE_PATH.test(value)) out.add(value)
  } else if (Array.isArray(value)) {
    for (const item of value) collectPaths(item, out)
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectPaths(item, out)
  }
}

/** 商品 / 模特 id 换算（字段名约定：productId / targetProductId / selectedModelIdentityId / modelIdentityId） */
const PRODUCT_KEYS = new Set(['productId', 'targetProductId', 'boundProductId'])
const MODEL_KEYS = new Set(['selectedModelIdentityId', 'modelIdentityId'])
function mapIds(value: unknown, product: (id: string) => string | undefined, model: (id: string) => string | undefined): unknown {
  if (Array.isArray(value)) return value.map((item) => mapIds(item, product, model))
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && item && PRODUCT_KEYS.has(key)) out[key] = product(item) ?? item
    else if (typeof item === 'string' && item && MODEL_KEYS.has(key)) out[key] = model(item) ?? item
    else out[key] = mapIds(item, product, model)
  }
  return out
}

async function upload(session: Session, state: BridgeState, path: string): Promise<{ fileId: string; mime: string } | null> {
  const mime = MIME[extname(path).toLowerCase()]
  if (!mime) return null
  const id = await fileIdOf(state, path)
  if (!id) return null
  if (!state.uploaded[id.fileId]) {
    const result = await session.client.sync.uploadFile(await readFile(path), mime)
    state.uploaded[result.fileId] = true
  }
  return { fileId: id.fileId, mime }
}

async function push(session: Session, state: BridgeState, options: CloneBridgeOptions): Promise<number> {
  const projects = await options.store.listProjects()
  const groups = new Map((await options.store.listGroups()).map((group) => [group.id, group.name]))
  const changes: Array<SyncChange<SyncCloneWorkspace | null> & { localUpdatedAt: number }> = []
  const present = new Set(projects.map((project) => project.id))

  for (const project of projects) {
    if (options.only && !options.only.includes(project.id)) continue
    const link = state.links[project.id]
    const localUpdatedAt = Number(project.updatedAt || 0)
    if (link && localUpdatedAt <= link.localUpdatedAt) continue
    if (!link && Date.now() - localUpdatedAt > RECENT_MS) continue
    if (!options.only && link?.pushedAt && Date.now() - link.pushedAt < MIN_PUSH_INTERVAL_MS) continue
    try {
      const paths = new Set<string>()
      collectPaths(project, paths)
      const files: CloneWorkspaceDoc['files'] = {}
      for (const path of paths) {
        const ref = await upload(session, state, path)
        if (ref) files[path] = ref
      }
      const doc: CloneWorkspaceDoc = {
        version: 1,
        roots: roots(),
        project: mapIds(project, options.ids.productToCloud, options.ids.modelToCloud) as Record<string, unknown>,
        files,
      }
      const docUpload = await session.client.sync.uploadFile(gzipSync(Buffer.from(JSON.stringify(doc))), 'application/gzip')
      const summary = await options.store.summary(project)
      const record: SyncCloneWorkspace = {
        title: String(project.title || project.referenceVideoName || '复刻项目').slice(0, 200),
        status: String(project.status || 'draft'),
        projectUpdatedAt: localUpdatedAt,
        createdAt: Number(project.createdAt || localUpdatedAt),
        docFileId: docUpload.fileId,
        files: [...new Set(Object.values(files).map((file) => file.fileId))],
        coverFileId: summary.coverAssetPath ? files[summary.coverAssetPath]?.fileId : undefined,
        finalVideoFileId: summary.finalOutputPath ? files[summary.finalOutputPath]?.fileId : undefined,
        groupName: project.groupId ? groups.get(project.groupId) : undefined,
        origin: options.origin,
      }
      const updatedAt = Math.max(localUpdatedAt, (link?.cloudUpdatedAt ?? 0) + 1)
      changes.push({ collection: COLLECTION, id: project.id, updatedAt, deleted: false, data: record, localUpdatedAt })
    } catch (error) {
      console.warn('[cloud-sync] 复刻项目上传失败', project.id, (error as Error).message)
    }
  }

  // Linked projects that are gone here were deleted here. An empty project list is treated as unreadable, never as "delete everything".
  if (!options.only && projects.length) {
    for (const [id, link] of Object.entries(state.links)) {
      if (present.has(id)) continue
      changes.push({ collection: COLLECTION, id, updatedAt: Math.max(Date.now(), link.cloudUpdatedAt + 1), deleted: true, data: null, localUpdatedAt: 0 })
    }
  }

  let applied = 0
  for (let index = 0; index < changes.length; index += SYNC_MAX_PUSH) {
    const batch = changes.slice(index, index + SYNC_MAX_PUSH)
    const result = await session.client.sync.push(batch.map(({ localUpdatedAt: _local, ...change }) => change))
    for (const change of result.applied) {
      const entry = batch.find((item) => item.id === change.id)
      if (!entry) continue
      if (change.deleted) delete state.links[change.id]
      else state.links[change.id] = { cloudUpdatedAt: change.updatedAt, localUpdatedAt: entry.localUpdatedAt, pushedAt: Date.now() }
      applied += 1
    }
    // Conflicts (cloud newer) are handled by the pull that follows.
  }
  return applied
}

/* ------------------------------------------------------------------ 拉取 */

const downloadDir = () => join(getAppPaths().dataDir, 'cloud-sync', 'clone-files')

/** 来源机器上的路径 → 本机路径：在来源数据目录下的放到本机数据目录的同一位置，其余放到同步下载目录 */
function localPathFor(original: string, sourceRoots: string[], fileId?: string, mime?: string): string | null {
  const normalized = original.replace(/\\/g, '/')
  const localRoots = roots()
  for (const [index, root] of sourceRoots.entries()) {
    const prefix = root.replace(/\\/g, '/').replace(/\/+$/, '') + '/'
    if (!normalized.toLowerCase().startsWith(prefix.toLowerCase())) continue
    const rel = normalized.slice(prefix.length)
    if (!rel || rel.split('/').includes('..')) return null
    const base = localRoots[Math.min(index, localRoots.length - 1)]!
    return join(base, ...rel.split('/'))
  }
  if (!fileId) return null
  const ext = extname(basename(normalized)) || Object.entries(MIME).find(([, value]) => value === mime)?.[0] || ''
  return join(downloadDir(), `${fileId}${ext}`)
}

/** 本机路径分隔符下，把项目里的来源路径全部换成本机路径 */
function rewritePaths(value: unknown, swap: (path: string) => string | null): unknown {
  if (typeof value === 'string') {
    if (value.length < 1024 && ABSOLUTE_PATH.test(value)) return swap(value) ?? value
    return value
  }
  if (Array.isArray(value)) return value.map((item) => rewritePaths(item, swap))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewritePaths(item, swap)]))
  return value
}

async function ensureFile(session: Session, state: BridgeState, target: string, fileId: string) {
  if (existsSync(target)) {
    const current = await fileIdOf(state, target)
    if (current?.fileId === fileId) return
  }
  const blob = await session.client.sync.downloadFile(fileId)
  await mkdir(dirname(target), { recursive: true })
  const temp = `${target}.${process.pid}.part`
  await writeFile(temp, Buffer.from(await blob.arrayBuffer()))
  const { rename } = await import('node:fs/promises')
  await rename(temp, target)
  state.uploaded[fileId] = true
}

async function applyChange(session: Session, state: BridgeState, options: CloneBridgeOptions, change: SyncChange<SyncCloneWorkspace>): Promise<boolean> {
  const link = state.links[change.id]
  const local = await options.store.getProject(change.id)
  if (change.deleted) {
    if (local) await options.store.removeProject(change.id)
    delete state.links[change.id]
    return Boolean(local)
  }
  const data = change.data!
  // Local edits newer than this version win; the next push sends them.
  if (local && Number(local.updatedAt || 0) > (link?.localUpdatedAt ?? 0) && Number(local.updatedAt || 0) > Number(data.projectUpdatedAt || 0)) return false

  const blob = await session.client.sync.downloadFile(data.docFileId)
  const doc = JSON.parse(gunzipSync(Buffer.from(await blob.arrayBuffer())).toString('utf8')) as CloneWorkspaceDoc
  const targets = new Map<string, string>()
  for (const [original, file] of Object.entries(doc.files || {})) {
    const target = localPathFor(original, doc.roots || [], file.fileId, file.mime)
    if (!target) continue
    await ensureFile(session, state, target, file.fileId)
    targets.set(original, target)
  }
  const swapped = rewritePaths(doc.project, (path) => targets.get(path) ?? localPathFor(path, doc.roots || [])) as Record<string, unknown>
  const project = mapIds(swapped, options.ids.productToLocal, options.ids.modelToLocal) as unknown as CloneProject
  project.id = change.id
  project.updatedAt = Number(data.projectUpdatedAt || change.updatedAt)
  if (data.groupName) {
    const groups = await options.store.listGroups()
    const group = groups.find((item) => item.name === data.groupName) ?? (await options.store.createGroup(data.groupName))
    project.groupId = group.id
    project.groupName = group.name
  } else {
    delete project.groupId
    delete project.groupName
  }
  const saved = await options.store.importProject(project)
  if (!saved) return false
  state.links[change.id] = { cloudUpdatedAt: change.updatedAt, localUpdatedAt: Number(saved.updatedAt || project.updatedAt), pushedAt: link?.pushedAt }
  return true
}

async function pull(session: Session, state: BridgeState, options: CloneBridgeOptions): Promise<number> {
  let pulled = 0
  for (;;) {
    const page = await session.client.sync.pull(state.cursor, [COLLECTION])
    for (const change of page.changes as Array<SyncChange<SyncCloneWorkspace>>) {
      const link = state.links[change.id]
      if (link && change.updatedAt <= link.cloudUpdatedAt) continue // our own push or already applied
      try {
        if (await applyChange(session, state, options, change)) pulled += 1
      } catch (error) {
        console.warn('[cloud-sync] 复刻项目导入失败', change.id, (error as Error).message)
      }
    }
    state.cursor = page.cursor
    if (!page.hasMore) break
  }
  return pulled
}

/** 仅测试使用 */
export const __test = { localPathFor, collectPaths, mapIds, sep }
