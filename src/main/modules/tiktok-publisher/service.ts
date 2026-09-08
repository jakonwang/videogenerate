import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { decryptRuntimeString, encryptRuntimeString, isRuntimeEncryptionAvailable } from '../../lib/runtimeCrypto'
import { tiktokCreativeStudioRepo } from '../tiktok-creative-studio/repo'
import { generateThumbnailJpg } from '../media/thumbnail'
import { creatokPublisherRepo } from './repo'
import { createCreatokClient, newOperationKeys } from './creatokClient'
import type { CreatokPublishTask } from './types'

const credentialPath = () => join(getAppPaths().dbDir, 'tiktok-creatok-credentials.json')
const queuedPosterTaskIds = new Set<string>()
let posterQueue = Promise.resolve()

function queuePosterGeneration(tasks: CreatokPublishTask[]) {
  for (const task of tasks) {
    if (task.posterPath || !task.sourceVideoPath || queuedPosterTaskIds.has(task.id)) continue
    queuedPosterTaskIds.add(task.id)
    posterQueue = posterQueue.then(async () => {
      try {
        const posterPath = await generateThumbnailJpg({ filePath: task.sourceVideoPath, atSec: 0.5 })
        if (!posterPath) return
        const latest = await creatokPublisherRepo.get(task.id)
        if (latest && !latest.posterPath) {
          await creatokPublisherRepo.upsert({ ...latest, posterPath })
        }
      } finally {
        queuedPosterTaskIds.delete(task.id)
      }
    }).catch((error) => {
      queuedPosterTaskIds.delete(task.id)
      console.error('[tiktok-publisher] poster generation failed', { taskId: task.id, error })
    })
  }
}
function payload<T extends Record<string, any>>(result: T) { return (result?.data && typeof result.data === 'object' ? result.data : result) as T }
function listFrom(result: any, ...keys: string[]) {
  const data = payload(result)
  for (const source of [data, result, data?.data]) for (const key of keys) if (Array.isArray(source?.[key])) return source[key]
  return []
}
function normalizeConnection(item: any) { return { ...item, uid: String(item?.uid || item?.id || item?.connection_uid || ''), name: String(item?.name || item?.title || item?.display_name || item?.username || item?.uid || item?.id || 'Unnamed account'), timezone: item?.timezone || item?.time_zone } }
function normalizeProduct(item: any) {
  const imageUrl = item?.imageUrl || item?.image_url || item?.coverImagePath || item?.cover_image_url || item?.cover_url || item?.thumbnail || item?.thumbnail_url || item?.image || item?.main_image || item?.mainImage || item?.product_image || item?.product_image_url || ''
  return {
    ...item,
    id: String(item?.id || item?.product_id || item?.sku_id || ''),
    title: String(item?.title || item?.name || item?.product_title || item?.id || 'Unnamed product'),
    imageUrl: String(imageUrl || ''),
    image: String(item?.image || imageUrl || ''),
  }
}
async function getKey() { const data = await readJsonFile<{ value?: string }>(credentialPath(), {}); return data.value ? decryptRuntimeString(data.value) : null }
function findVideoAsset(value: any): any {
  if (!value || typeof value !== 'object') return null
  const objectKey = value.object_key || value.objectKey || value.asset_key || value.assetKey || value.key
  if (typeof objectKey === 'string' && objectKey) return { ...value, object_key: objectKey }
  for (const child of Object.values(value)) {
    const found = findVideoAsset(child)
    if (found) return found
  }
  return null
}
async function normalizeVideoAsset(uploaded: any, sourcePath: string) {
  const found = findVideoAsset(uploaded)
  if (!found) return null
  const file = await stat(sourcePath)
  const fileSize = Number(found.file_size ?? found.fileSize ?? found.size ?? found.bytes ?? file.size)
  const fileName = String(found.file_name || found.fileName || found.filename || found.name || basename(sourcePath))
  const contentType = String(found.content_type || found.contentType || found.mime_type || found.mimeType || 'video/mp4')
  if (!Number.isFinite(fileSize) || fileSize <= 0 || !fileName) return null
  return { object_key: String(found.object_key), file_size: fileSize, file_name: fileName, content_type: contentType }
}
function buildProductLinkTitle(task: CreatokPublishTask) {
  const customTitle = String(task.productLinkTitle || '')
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[^a-z0-9 -]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30)
    .trim()
  return customTitle || 'Featured Product'
}
function toCreatokEnvelope(task: CreatokPublishTask, preparedVideo?: any) {
  const videoFileId = preparedVideo?.file_id || preparedVideo?.fileId || preparedVideo?.data?.file_id || preparedVideo?.data?.fileId
  const scheduleTime = task.scheduleAt ? Date.parse(task.scheduleAt) : undefined
  const providerOptions: Record<string, any> = {
    product_id: task.productId,
    product_title: buildProductLinkTitle(task),
    title: task.videoTitle,
    description: task.description,
  }
  if (task.music?.id) {
    providerOptions.selected_music = {
      id: String(task.music.id),
      title: String(task.music.title || ''),
      ...(task.music.author ? { author: String(task.music.author) } : {}),
      ...(task.music.duration !== undefined ? { duration: task.music.duration } : {}),
      ...(task.music.cover_url ? { cover_url: String(task.music.cover_url) } : {}),
      ...(task.music.play_url ? { play_url: String(task.music.play_url) } : {}),
    }
  }
  return {
    kind: 'tiktok_shop_video',
    connection_uid: task.connectionUid,
    idempotency_key: task.idempotencyKey,
    ...(task.precheckEnabled === true ? { precheck_enabled: true } : {}),
    media: videoFileId ? { file_id: videoFileId, file_kind: 'video_file' } : undefined,
    provider_options: providerOptions,
    schedule: Number.isFinite(scheduleTime) ? { at: scheduleTime } : undefined,
    timezone: task.timezone || 'EST',
  }
}
function resolvePublishState(status: unknown, current: CreatokPublishTask['state']): CreatokPublishTask['state'] {
  const normalized = String(status || '').trim().toLowerCase()
  if (['completed', 'succeeded', 'success', 'published'].includes(normalized)) return 'published'
  if (['failed', 'error'].includes(normalized)) return 'failed'
  if (['cancelled', 'canceled'].includes(normalized)) return 'cancelled'
  if (['processing', 'running', 'publishing'].includes(normalized)) return 'publishing'
  if (normalized === 'scheduled') return 'scheduled'
  if (['queued', 'pending', 'created'].includes(normalized)) return 'queued'
  return current
}
function responseStatus(response: any, job: any) {
  return response?.status || response?.data?.status || job?.state || job?.status || response?.data?.job?.state || response?.data?.job?.status
}
function errorDetails(error: any, fallback = 'CreatOK publish failed') {
  const metadata = error?.metadata && typeof error.metadata === 'object' ? error.metadata : {}
  return {
    message: String(metadata.message || error?.message || fallback),
    reason: metadata.reason,
    stage: metadata.stage,
    requestId: metadata.request_id || metadata.requestId,
    resultUnknown: metadata.result_unknown ?? metadata.resultUnknown,
  }
}
export const creatokPublisherService = {
  async credentialStatus() { const key = await getKey(); return { configured: Boolean(key), masked: key ? `${key.slice(0, 4)}...${key.slice(-4)}` : '' } },
  async saveCredential(apiKey: string) { if (!isRuntimeEncryptionAvailable()) throw new Error('Secure storage is unavailable'); const value = encryptRuntimeString(String(apiKey || '').trim()); if (!value) throw new Error('Secure storage is unavailable'); await writeJsonFile(credentialPath(), { value }); return this.credentialStatus() },
  async clearCredential() { await writeJsonFile(credentialPath(), {}); return { configured: false, masked: '' } },
  async testCredential() { const key = await getKey(); if (!key) throw new Error('Creatok API key is not configured'); return await createCreatokClient(key).doctor() },
  async connections() {
    const key = await getKey(); if (!key) throw new Error('Creatok API key is not configured')
    const client = createCreatokClient(key)
    try {
      return listFrom(await client.connections(), 'connections', 'items', 'accounts').map(normalizeConnection).filter((item: any) => item.uid)
    } catch (filteredError: any) {
      // Some Creatok API versions reject capability filtering although they support connection discovery.
      try {
        return listFrom(await client.connections(''), 'connections', 'items', 'accounts').map(normalizeConnection).filter((item: any) => item.uid)
      } catch (fallbackError: any) {
        throw new Error(fallbackError?.message || filteredError?.message || 'Unable to load Creatok connections')
      }
    }
  },
  async products(connection?: string) { const key = await getKey(); if (!key) throw new Error('Creatok API key is not configured'); if (!connection) return []; const result = await createCreatokClient(key).products(connection); return listFrom(result, 'products', 'items').map(normalizeProduct).filter((item: any) => item.id) },
  async music(query: string, connection?: string) { const key = await getKey(); if (!key) throw new Error('Creatok API key is not configured'); if (!connection) return []; const result = await createCreatokClient(key).music(query, connection); return listFrom(result, 'music', 'items') },
  async listTasks() { const tasks = await creatokPublisherRepo.list(); queuePosterGeneration(tasks); return tasks },
  async removeTask(id: string) {
    const normalizedId = String(id || '').trim()
    if (!normalizedId) throw new Error('Publisher task id is required')
    return { removed: await creatokPublisherRepo.remove(normalizedId) }
  },
  async updateTask(id: string, patch: Partial<CreatokPublishTask>) { const task = await creatokPublisherRepo.get(id); if (!task || ['published', 'queued', 'scheduled', 'publishing'].includes(task.state)) throw new Error('Only draft or failed tasks can be edited'); return creatokPublisherRepo.upsert({ ...task, ...patch, updatedAt: Date.now() }) },
  async createDrafts(input: { items: Array<{ taskId: string; shotId: string }>; defaults?: Partial<CreatokPublishTask> }) { const created: CreatokPublishTask[] = []; for (const item of input.items) { const task = await tiktokCreativeStudioRepo.get(item.taskId); const shot = task?.shots.find((s) => s.shotId === item.shotId); const source = shot?.subtitleVideoPath || shot?.resultVideoPath; if (!task || !shot || shot.status !== 'completed' || !source || !existsSync(source)) throw new Error(`Video is not ready: ${item.shotId}`); const keys = newOperationKeys(); created.push({ id: randomUUID(), sourceTaskId: task.id, sourceShotId: shot.shotId, sourceVideoPath: source, posterPath: shot.posterPath, operationId: keys.operationId, idempotencyKey: keys.idempotencyKey, state: 'draft', createdAt: Date.now(), updatedAt: Date.now(), ...input.defaults }) } const saved = await creatokPublisherRepo.upsertMany(created); queuePosterGeneration(saved); return saved },
  async createDraftsFromPaths(input: { paths: string[]; defaults?: Partial<CreatokPublishTask> }) { const created: CreatokPublishTask[] = []; for (const source of input.paths || []) { if (!existsSync(source)) throw new Error(`Video is not available: ${source}`); const keys = newOperationKeys(); created.push({ id: randomUUID(), sourceVideoPath: source, operationId: keys.operationId, idempotencyKey: keys.idempotencyKey, state: 'draft', createdAt: Date.now(), updatedAt: Date.now(), ...input.defaults }) } const saved = await creatokPublisherRepo.upsertMany(created); queuePosterGeneration(saved); return saved },
  async precheck(ids: string[]) { const key = await getKey(); if (!key) throw new Error('Creatok API key is not configured'); const result = []; for (const id of ids) { const task = await creatokPublisherRepo.get(id); if (!task || task.state === 'published') continue; const next = { ...task, state: 'prechecking' as const, updatedAt: Date.now() }; await creatokPublisherRepo.upsert(next); try { if (!task.sourceVideoPath || !existsSync(task.sourceVideoPath)) throw new Error('Video source is not available'); if (!task.connectionUid) throw new Error('TikTok account is not selected'); if (!task.productId) throw new Error('TikTok Shop product is not selected'); if (!task.videoTitle?.trim()) throw new Error('Video title is required'); if (task.scheduleAt) { const scheduleTime = Date.parse(task.scheduleAt); if (!Number.isFinite(scheduleTime) || scheduleTime <= Date.now()) throw new Error('Scheduled publish time must be in the future') } result.push(await creatokPublisherRepo.upsert({ ...next, state: 'ready', precheck: { ok: true }, updatedAt: Date.now() })) } catch (error: any) { result.push(await creatokPublisherRepo.upsert({ ...next, state: 'failed', error: { message: error.message, ...(error.metadata || {}) }, updatedAt: Date.now() })) } } return result },
  async submit(ids: string[]) { const key = await getKey(); if (!key) throw new Error('Creatok API key is not configured'); const client = createCreatokClient(key); const result = []; for (const id of ids) { const task = await creatokPublisherRepo.get(String(id)); if (!task || ['published', 'queued', 'scheduled', 'publishing', 'result_unknown'].includes(task.state)) continue; if (task.state === 'failed' || task.state === 'cancelled') { const keys = newOperationKeys(); Object.assign(task, keys, { remoteJobId: undefined, assetId: undefined, preparedVideo: undefined, error: undefined, updatedAt: Date.now() }); await creatokPublisherRepo.upsert(task) } try { if (task.scheduleAt) { const scheduleTime = Date.parse(task.scheduleAt); if (!Number.isFinite(scheduleTime) || scheduleTime <= Date.now()) throw new Error('Scheduled publish time must be in the future') } const uploaded = await client.asset(task.sourceVideoPath); const asset = await normalizeVideoAsset(uploaded, task.sourceVideoPath); if (!asset) throw new Error('CreatOK asset upload did not return a usable object_key'); const prepared = task.connectionUid ? await client.prepareVideo(task.connectionUid, JSON.stringify(asset), task.operationId) : undefined; const response = await client.submit(JSON.stringify(toCreatokEnvelope(task, prepared)), task.operationId); const job = response?.data?.job || response?.job || {}; const jobId = response?.job_id || response?.jobId || response?.id || response?.task_id || response?.data?.job_id || response?.data?.jobId || response?.data?.id || response?.data?.task_id || job.job_id || job.jobId; if (!jobId) throw new Error('CreatOK submit returned no job_id'); const remoteState = String(responseStatus(response, job) || '').toLowerCase(); if (remoteState === 'failed' || remoteState === 'cancelled' || remoteState === 'canceled') { const details = errorDetails({ message: job.fail_reason || job.reason || response?.message, metadata: { ...(response?.error || {}), request_id: response?.request_id, reason: job.reason || response?.error?.reason, stage: job.stage || response?.error?.stage, result_unknown: job.result_unknown || response?.error?.result_unknown } }); result.push(await creatokPublisherRepo.upsert({ ...task, assetId: asset.object_key, preparedVideo: prepared, remoteJobId: String(jobId), state: details.resultUnknown ? 'result_unknown' : 'failed', error: details, updatedAt: Date.now() })); continue } result.push(await creatokPublisherRepo.upsert({ ...task, assetId: asset.object_key, preparedVideo: prepared, remoteJobId: String(jobId), state: 'published', updatedAt: Date.now() })) } catch (error: any) { const details = errorDetails(error); console.error('[tiktok-publisher] submit failed', { taskId: task.id, operationId: task.operationId, remoteJobId: task.remoteJobId, error: details }); result.push(await creatokPublisherRepo.upsert({ ...task, state: details.resultUnknown ? 'result_unknown' : 'failed', error: details, updatedAt: Date.now() })) } } return result },
  async refresh() { const key = await getKey(); if (!key) { const tasks = await creatokPublisherRepo.list(); queuePosterGeneration(tasks); return tasks } const client = createCreatokClient(key); const tasks = await creatokPublisherRepo.list(); queuePosterGeneration(tasks); for (const task of tasks) if (task.remoteJobId && !['published', 'failed', 'cancelled', 'result_unknown'].includes(task.state)) { try { const response = await client.status(task.remoteJobId, task.operationId); const job = response?.data?.job || response?.job || {}; const remote = String(responseStatus(response, job) || '').toLowerCase(); const state = ['queued', 'pending', 'created', 'scheduled', 'processing', 'running', 'publishing'].includes(remote) ? 'published' : resolvePublishState(remote, task.state); const error = state === 'failed' || state === 'cancelled' ? errorDetails({ message: job.fail_reason || job.reason || response?.message, metadata: { ...(response?.error || {}), request_id: response?.request_id, reason: job.reason || response?.error?.reason, stage: job.stage || response?.error?.stage, result_unknown: job.result_unknown || response?.error?.result_unknown } }) : state === 'published' ? undefined : task.error; await creatokPublisherRepo.upsert({ ...task, state, error, updatedAt: Date.now() }) } catch (error: any) { const details = errorDetails(error, 'Unable to refresh CreatOK publish status'); console.error('[tiktok-publisher] refresh failed', { taskId: task.id, operationId: task.operationId, remoteJobId: task.remoteJobId, error: details }); await creatokPublisherRepo.upsert({ ...task, state: 'failed', error: details, updatedAt: Date.now() }) } } return creatokPublisherRepo.list() },
}
