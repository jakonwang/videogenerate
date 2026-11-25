/**
 * Capabilities that connect the three production lines, the review inbox, publishing and
 * insights so the AI producer can organise the whole system.
 */
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { assetLibraryService } from '../asset-library/service'
import { cloneRepo } from '../clone/repo'
import { livePhotoService } from '../live-photo/service'
import { packageLivePhoto } from '../live-photo/packager'
import { runFfmpeg } from '../ffmpeg/runner'
import { generateThumbnailJpg } from '../media/thumbnail'
import { productsRepo } from '../products/repo'
import { productResearchService } from '../product-research/service'
import { tiktokCreativeStudioService } from '../tiktok-creative-studio/service'
import { creatokPublisherService } from '../tiktok-publisher/service'
import { contentIndex } from '../content-hub/contentIndex'
import { reviewInbox } from '../content-hub/reviewInbox'
import { lineage } from '../content-hub/stores'
import { runHealthCheck } from '../content-hub/healthCheck'
import { buildInsights } from '../content-hub/insights'
import { videoParserDownloadRepo } from '../video-parser-download/repo'
import { agentOsStore } from './store'
import { pipelineApprovedRefs, pipelineContentRefs } from './pipelineContext'
import type {
  AgentCapabilityBinding,
  AgentCapabilityDefinition,
  AgentCapabilityId,
  AgentIntentType,
  AgentToolResult,
} from './types'

function text(value: unknown) {
  return String(value ?? '').trim()
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []
}

function completed(input?: Partial<AgentToolResult>): AgentToolResult {
  return { success: true, status: 'completed', artifactIds: [], logs: [], warnings: [], cost: {}, retryable: false, externalRefs: {}, ...input }
}

function failed(code: string, message: string, retryable = false): AgentToolResult {
  return { success: false, status: 'failed', artifactIds: [], logs: [], warnings: [], cost: {}, retryable, externalRefs: {}, error: { code, message } }
}

const IMAGE_EXT = /\.(png|jpe?g|webp|bmp|gif|avif)$/i
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)$/i

/** Media paths from explicit input, attachments and earlier steps' artifacts. */
function collectPaths(input: Record<string, unknown>, dependencyArtifacts: Array<{ localPath?: string }>, kind: 'image' | 'video' | 'any') {
  const candidates = [
    ...strings(input.paths),
    ...strings(input.imagePaths),
    ...strings(input.referenceImagePaths),
    ...strings(input.videoPaths),
    ...strings(input.artifactPaths),
    text(input.videoPath),
    ...dependencyArtifacts.map((artifact) => text(artifact.localPath)),
  ].filter(Boolean)
  const unique = Array.from(new Set(candidates)).filter((path) => existsSync(path))
  if (kind === 'image') return unique.filter((path) => IMAGE_EXT.test(path))
  if (kind === 'video') return unique.filter((path) => VIDEO_EXT.test(path))
  return unique
}

async function resolveProductId(input: Record<string, unknown>) {
  const explicit = text(input.productId)
  const products = await productsRepo.list()
  if (explicit) return products.find((item) => item.id === explicit) ? explicit : ''
  const request = text(input.request).toLowerCase()
  return products.find((item) => item.name && request.includes(item.name.toLowerCase()))?.id || ''
}

async function assetIdsToPaths(input: Record<string, unknown>) {
  const ids = strings(input.assetIds)
  if (!ids.length) return []
  const assets = await assetLibraryService.list('', 'all')
  return assets.filter((asset) => ids.includes(asset.id)).map((asset) => asset.filePath)
}

function base(id: string, capabilityId: AgentCapabilityId, lockMode: 'read' | 'write', resourceType?: AgentCapabilityBinding['resourceType']) {
  return {
    id,
    capabilityId,
    capabilityVersion: 1,
    adapterVersion: '1.0.0',
    priority: 100,
    lockMode,
    resourceType,
    isHealthy: async () => true,
  } as const
}

// ------------------------------------------------------------------ System.HealthCheck
const healthCheckBinding: AgentCapabilityBinding = {
  ...base('binding.system.health.local.v1', 'System.HealthCheck', 'read'),
  estimateCost: async () => ({ credits: 0 }),
  execute: async (_input, context) => {
    const report = await runHealthCheck()
    const artifactId = context.registerArtifact({
      kind: 'report',
      name: '系统体检',
      uri: 'content-hub://health',
      metadata: { level: report.level, items: report.items },
      sourceArtifactIds: [],
      lifecycle: 'referenced',
    })
    const problems = report.items.filter((item) => item.level !== 'ok')
    return completed({
      artifactIds: [artifactId],
      logs: report.items.map((item) => `${item.title}: ${item.detail}`),
      warnings: problems.map((item) => `${item.title}: ${item.detail}`),
    })
  },
}

// ------------------------------------------------------------------ Asset.Search
const assetSearchBinding: AgentCapabilityBinding = {
  ...base('binding.asset.search.local.v1', 'Asset.Search', 'read'),
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const query = text(input.query || input.keyword)
    const type = ['image', 'video'].includes(text(input.assetType)) ? text(input.assetType) as 'image' | 'video' : 'all'
    const limit = Math.max(1, Math.min(60, Number(input.limit || 24) || 24))
    const assets = (await assetLibraryService.list(query, type)).slice(0, limit)
    const artifactIds = assets.map((asset) => context.registerArtifact({
      kind: asset.type === 'image' ? 'image' : 'video',
      name: asset.name,
      uri: `asset://${asset.id}`,
      localPath: asset.filePath,
      mimeType: asset.mimeType,
      size: asset.size,
      metadata: { assetId: asset.id, folderId: asset.folderId || null },
      sourceArtifactIds: [],
      lifecycle: 'referenced',
    }))
    return completed({
      artifactIds,
      logs: [`Found ${assets.length} assets${query ? ` for "${query}"` : ''}`],
      warnings: assets.length ? [] : ['素材库里没有匹配的素材。'],
      externalRefs: { assetIds: assets.map((asset) => asset.id).join(',') },
    })
  },
}

// ------------------------------------------------------------------ Asset.Archive
const assetArchiveBinding: AgentCapabilityBinding = {
  ...base('binding.asset.archive.local.v1', 'Asset.Archive', 'write', 'Artifact'),
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const paths = collectPaths(input, context.dependencyArtifacts, 'any').filter((path) => IMAGE_EXT.test(path) || VIDEO_EXT.test(path))
    if (!paths.length) return failed('missing_media', '没有可归档的图片或视频。')
    const folders = await assetLibraryService.listAllFolders()
    let root = folders.find((folder) => (folder.parentId ?? null) === null && folder.name === 'AI 成片')
    if (!root) root = await assetLibraryService.createFolder('AI 成片', null)
    const all = await assetLibraryService.listAllFolders()
    let folder = all.find((item) => item.parentId === root!.id && item.name === 'AI 制片人')
    if (!folder) folder = await assetLibraryService.createFolder('AI 制片人', root.id)
    const productId = await resolveProductId(input)
    const artifactIds: string[] = []
    for (const path of paths) {
      const asset = await assetLibraryService.importFile(path, 'desktop', basename(path), folder.id)
      await lineage.record({ fromRef: `file:${path}`, toRef: `asset:${asset.id}`, relation: 'archived_as', productId: productId || undefined, meta: { runId: context.run.id } })
      artifactIds.push(context.registerArtifact({
        kind: asset.type === 'image' ? 'image' : 'video',
        name: asset.name,
        uri: `asset://${asset.id}`,
        localPath: asset.filePath,
        mimeType: asset.mimeType,
        metadata: { assetId: asset.id },
        sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
        lifecycle: 'referenced',
      }))
    }
    return completed({ artifactIds, logs: [`Archived ${paths.length} files to the asset library`] })
  },
}

// ------------------------------------------------------------------ Clone.SendShots
async function cloneShotIds(projectId: string, requested: string[]) {
  const project: any = await cloneRepo.getProject(projectId)
  if (!project) return { project: null, shotIds: [] as string[], framePaths: [] as string[] }
  const frames = (Array.isArray(project.storyboardFrames) ? project.storyboardFrames : [])
    .filter((frame: any) => text(frame?.imagePath) && existsSync(text(frame.imagePath)))
  const selected = requested.length ? frames.filter((frame: any) => requested.includes(text(frame.shotId))) : frames
  return {
    project,
    shotIds: selected.map((frame: any) => text(frame.shotId)),
    framePaths: selected.map((frame: any) => text(frame.imagePath)),
  }
}

const cloneSendShotsBinding: AgentCapabilityBinding = {
  ...base('binding.clone.send-shots.local.v1', 'Clone.SendShots', 'write', 'Project'),
  estimateCost: async (input) => ({ quantity: Math.max(1, strings(input.shotIds).length), unit: 'shot' }),
  execute: async (input, context) => {
    // Projects created by an earlier step (e.g. a recipe's clone step) come first.
    const upstream = Array.from(new Set(context.dependencyArtifacts
      .filter((artifact) => artifact.kind === 'project')
      .map((artifact) => text(artifact.metadata?.projectId))
      .filter(Boolean)))
    if (upstream.length > 1) {
      const results: AgentToolResult[] = []
      for (const cloneProjectId of upstream) {
        results.push(await cloneSendShotsBinding.execute({ ...input, cloneProjectId, shotIds: [] }, { ...context, dependencyArtifacts: [] }))
      }
      const ok = results.filter((result) => result.success)
      return completed({
        success: ok.length > 0,
        status: ok.length === results.length ? 'accepted' : ok.length ? 'partial' : 'failed',
        artifactIds: results.flatMap((result) => result.artifactIds),
        logs: results.flatMap((result) => result.logs),
        warnings: results.flatMap((result) => result.error ? [result.error.message] : result.warnings),
        ...(ok.length ? {} : { error: results[0]?.error }),
      })
    }
    let projectId = text(input.cloneProjectId || input.projectId) || upstream[0] || ''
    if (!projectId) {
      const productId = await resolveProductId(input)
      const projects = (await cloneRepo.listProjects()).filter((item: any) => !productId || item.productId === productId)
      projectId = projects.sort((a: any, b: any) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0]?.id || ''
    }
    if (!projectId) return failed('missing_clone_project', '请指定要使用的复刻项目。')
    const { project, shotIds, framePaths } = await cloneShotIds(projectId, strings(input.shotIds))
    if (!project) return failed('clone_project_not_found', '复刻项目不存在。')
    if (!shotIds.length) return failed('no_storyboard_frames', '该复刻项目还没有可用的分镜图，请先完成分镜设计。')
    const targets = strings(input.targets).length ? strings(input.targets) : [text(input.target) || 'livephoto']
    const artifactIds: string[] = []
    const logs: string[] = []
    if (targets.includes('livephoto')) {
      const motionTemplate = ['push_in', 'push_out', 'ambient_sway'].includes(text(input.motionTemplate)) ? text(input.motionTemplate) as any : undefined
      const created = (await livePhotoService.createFromCloneShots({ cloneProjectId: projectId, shotIds, motionTemplate })) as any[]
      for (const item of created) {
        await lineage.record({ fromRef: `clone:${projectId}`, toRef: `livephoto:${item.id}`, relation: 'sent_to', productId: text(project.productId) || undefined, meta: { shotId: item.sourceShotId, runId: context.run.id } })
        artifactIds.push(context.registerArtifact({
          kind: 'task',
          name: `Live Photo · ${text(item.sourceShotLabel) || item.id.slice(0, 6)}`,
          uri: `livephoto://${item.id}`,
          metadata: { livePhotoId: item.id, cloneProjectId: projectId, shotId: item.sourceShotId },
          sourceArtifactIds: [],
          lifecycle: 'referenced',
        }))
      }
      logs.push(`Queued ${created.length} Live Photo items from clone shots`)
    }
    if (targets.includes('creative')) {
      const productId = text(project.productId)
      if (!productId) return failed('clone_project_without_product', '该复刻项目没有绑定商品，无法送去tk创意室。')
      const task: any = await tiktokCreativeStudioService.createFromReference({ referenceImagePaths: framePaths, productId, mode: text(input.mode) === 'image_to_video' ? 'image_to_video' : undefined })
      const { tagCreativeTaskWithCloneShots } = await import('../clone/crossLineShots')
      await tagCreativeTaskWithCloneShots(task.id, projectId, shotIds, text(project.title))
      for (const shot of task.shots || []) {
        await lineage.record({ fromRef: `clone:${projectId}`, toRef: `creative:${task.id}:${shot.shotId}`, relation: 'sent_to', productId, meta: { runId: context.run.id } })
      }
      artifactIds.push(context.registerArtifact({
        kind: 'task',
        name: `tk创意室 · ${(task.shots || []).length} 个分镜`,
        uri: `creative://${task.id}`,
        metadata: { creativeTaskId: task.id, cloneProjectId: projectId },
        sourceArtifactIds: [],
        lifecycle: 'referenced',
      }))
      logs.push(`Queued ${(task.shots || []).length} creative studio shots from clone frames`)
    }
    if (targets.includes('muse')) {
      const { sendCloneShotsToMuse } = await import('../clone/crossLineShots')
      try {
        const { jobIds } = await sendCloneShotsToMuse({ cloneProjectId: projectId, shotIds })
        for (const jobId of jobIds) {
          artifactIds.push(context.registerArtifact({ kind: 'task', name: 'Muse创意室 · 分镜', uri: `muse://${jobId}`, metadata: { museJobId: jobId, cloneProjectId: projectId }, sourceArtifactIds: [], lifecycle: 'referenced' }))
        }
        logs.push(`Queued ${jobIds.length} Muse videos from clone frames`)
      } catch (error) {
        if (!artifactIds.length) return failed('muse_unavailable', error instanceof Error ? error.message : String(error))
        logs.push(`Muse skipped: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    contentIndex.invalidate()
    return completed({ status: 'accepted', artifactIds, logs, externalRefs: { cloneProjectId: projectId } })
  },
}


// ------------------------------------------------------------------ CreativeStudio.CreateFromImages
const creativeFromImagesBinding: AgentCapabilityBinding = {
  ...base('binding.creative.from-images.local.v1', 'CreativeStudio.CreateFromImages', 'write', 'Product'),
  estimateCost: async (input) => ({ quantity: Math.max(1, strings(input.imagePaths).length), unit: 'creative_shot' }),
  execute: async (input, context) => {
    const productId = await resolveProductId(input)
    if (!productId) return failed('missing_product', '请先选择要换上的商品。')
    const images = Array.from(new Set([...collectPaths(input, context.dependencyArtifacts, 'image'), ...(await assetIdsToPaths(input))]))
    if (!images.length) return failed('missing_reference_images', '请提供至少一张参考场景图（上传或从素材库选择）。')
    const task: any = await tiktokCreativeStudioService.createFromReference({
      referenceImagePaths: images.slice(0, 50),
      productId,
      mode: text(input.mode) === 'image_to_video' ? 'image_to_video' : undefined,
      durationSec: Number(input.durationSec) || undefined,
    })
    for (const shot of task.shots || []) {
      await lineage.record({ fromRef: `product:${productId}`, toRef: `creative:${task.id}:${shot.shotId}`, relation: 'product_of', productId, meta: { runId: context.run.id, referenceImagePath: shot.referenceImagePath } })
    }
    contentIndex.invalidate()
    const artifactId = context.registerArtifact({
      kind: 'task',
      name: `tk创意室 · ${(task.shots || []).length} 张场景图`,
      uri: `creative://${task.id}`,
      metadata: { creativeTaskId: task.id, productId },
      sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
      lifecycle: 'referenced',
    })
    return completed({ status: 'accepted', artifactIds: [artifactId], logs: [`Queued ${(task.shots || []).length} creative studio shots`], externalRefs: { creativeTaskId: task.id } })
  },
}

// ------------------------------------------------------------------ MuseStudio.CreateFromImages
const museFromImagesBinding: AgentCapabilityBinding = {
  ...base('binding.muse.from-images.local.v1', 'MuseStudio.CreateFromImages', 'write', 'Product'),
  estimateCost: async (input) => ({ quantity: Math.max(1, strings(input.imagePaths).length), unit: 'muse_video' }),
  execute: async (input, context) => {
    const { museCreativeStudioService } = await import('../muse-creative-studio/service')
    if (!(await museCreativeStudioService.list()).accounts.some((account) => account.enabled)) return failed('muse_not_configured', '还没有启用的 Muse 账号，请先在 Muse创意室添加。')
    const productId = await resolveProductId(input)
    if (!productId) return failed('missing_product', '请先选择要换上的商品。')
    const images = Array.from(new Set([...collectPaths(input, context.dependencyArtifacts, 'image'), ...(await assetIdsToPaths(input))])).slice(0, 50)
    if (!images.length) return failed('missing_reference_images', '请提供至少一张参考场景图（上传或从素材库选择）。')
    const prompt = text(input.prompt) || (await museCreativeStudioService.listPrompts('video')).find((item) => item.active)?.prompt || ''
    // The user always checks the swapped picture before any Muse quota is spent.
    const jobs = await museCreativeStudioService.createJobs({
      imagePaths: images,
      prompt,
      durationSec: Number(input.durationSec) || 10,
      aspect: text(input.aspect) || '9:16',
      productId,
      swapProduct: true,
      reviewImage: true,
    })
    for (const job of jobs) await lineage.record({ fromRef: `product:${productId}`, toRef: `muse:${job.id}`, relation: 'product_of', productId, meta: { runId: context.run.id } })
    contentIndex.invalidate()
    const artifactIds = jobs.map((job) => context.registerArtifact({
      kind: 'task',
      name: `Muse创意室 · ${job.productName || '商品'}`,
      uri: `muse://${job.id}`,
      metadata: { museJobId: job.id, productId },
      sourceArtifactIds: context.dependencyArtifacts.map((artifact) => artifact.id),
      lifecycle: 'referenced',
    }))
    return completed({ status: 'accepted', artifactIds, logs: [`Queued ${jobs.length} Muse videos; swapped pictures wait for the user's approval`], externalRefs: { museJobIds: jobs.map((job) => job.id).join(',') } })
  },
}

// ------------------------------------------------------------------ LivePhoto.FromVideo
const livePhotoFromVideoBinding: AgentCapabilityBinding = {
  ...base('binding.livephoto.from-video.local.v1', 'LivePhoto.FromVideo', 'write', 'Artifact'),
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const refs = strings(input.refs)
    const fromRefs: Array<{ path: string; ref?: string; productId?: string; title?: string }> = []
    for (const ref of refs) {
      const item = await contentIndex.get(ref)
      if (item?.mediaPath && VIDEO_EXT.test(item.mediaPath)) fromRefs.push({ path: item.mediaPath, ref, productId: item.productId, title: item.title })
    }
    const sources = fromRefs.length ? fromRefs : collectPaths(input, context.dependencyArtifacts, 'video').map((path) => ({ path, ref: undefined, productId: undefined, title: basename(path, extname(path)) }))
    if (!sources.length) return failed('missing_video', '没有可转换的视频。请选择已完成的视频或附上视频文件。')
    const folders = await assetLibraryService.listAllFolders()
    let root = folders.find((folder) => (folder.parentId ?? null) === null && folder.name === 'AI 成片')
    if (!root) root = await assetLibraryService.createFolder('AI 成片', null)
    const all = await assetLibraryService.listAllFolders()
    let folder = all.find((item) => item.parentId === root!.id && item.name === 'Live Photo')
    if (!folder) folder = await assetLibraryService.createFolder('Live Photo', root.id)
    const artifactIds: string[] = []
    for (const source of sources) {
      const itemId = randomUUID()
      const exportDir = join(getAppPaths().dataDir, 'live-photo-from-video', itemId)
      await mkdir(exportDir, { recursive: true })
      const still = await generateThumbnailJpg({ filePath: source.path, atSec: 0.1 })
      if (!still) return failed('frame_extract_failed', `无法从视频中截取封面帧：${basename(source.path)}`, true)
      const packaged = await packageLivePhoto({ runFfmpeg }, {
        itemId,
        sourceStillPath: still,
        sourceVideoPath: source.path,
        exportDir,
        baseName: source.title || itemId,
      })
      const imageAsset = await assetLibraryService.importFile(packaged.imagePath, 'desktop', basename(packaged.imagePath), folder.id)
      const videoAsset = await assetLibraryService.importFile(packaged.videoPath, 'desktop', basename(packaged.videoPath), folder.id)
      if (source.ref) {
        await lineage.record({ fromRef: source.ref, toRef: `asset:${videoAsset.id}`, relation: 'derived_from', productId: source.productId, meta: { kind: 'live_photo', imageAssetId: imageAsset.id, runId: context.run.id } })
      }
      artifactIds.push(context.registerArtifact({
        kind: 'video',
        name: `${source.title || 'Live Photo'}.mov`,
        uri: `asset://${videoAsset.id}`,
        localPath: videoAsset.filePath,
        mimeType: 'video/quicktime',
        metadata: { imageAssetId: imageAsset.id, videoAssetId: videoAsset.id, bundlePath: packaged.bundlePath, sourceRef: source.ref },
        sourceArtifactIds: [],
        lifecycle: 'referenced',
      }))
    }
    return completed({ artifactIds, logs: [`Packaged ${sources.length} Live Photos from existing videos`] })
  },
}

// ------------------------------------------------------------------ Review.Submit
const reviewSubmitBinding: AgentCapabilityBinding = {
  ...base('binding.review.submit.local.v1', 'Review.Submit', 'read'),
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const result = await reviewInbox.sync()
    // Autopilot may approve on the user's behalf, but only the outputs this very run produced.
    const approvedRefs: string[] = []
    if (input.autoApprove === true) {
      const scope = new Set(pipelineContentRefs(context))
      if (scope.size) {
        for (const item of await reviewInbox.list({ decision: 'pending' })) {
          if (!scope.has(item.ref) && !scope.has(item.projectRef)) continue
          await reviewInbox.decide({ ref: item.ref, decision: 'approved', note: '全自动流水线自动通过', learn: false })
          approvedRefs.push(item.ref)
        }
      }
    }
    const counts = await reviewInbox.counts()
    const artifactId = context.registerArtifact({
      kind: 'report',
      name: '审核收件箱',
      uri: 'content-hub://inbox',
      metadata: { added: result.added, pending: counts.pending, approvedRefs },
      sourceArtifactIds: [],
      lifecycle: 'referenced',
    })
    return completed({
      artifactIds: [artifactId],
      logs: [
        `${result.added} new outputs sent to review; ${counts.pending} pending in total`,
        ...(input.autoApprove === true ? [`Auto-approved ${approvedRefs.length} outputs of this run`] : []),
      ],
      warnings: input.autoApprove === true && !approvedRefs.length ? ['本次流水线没有可自动通过的成片，请到审核收件箱查看。'] : [],
    })
  },
}

// ------------------------------------------------------------------ Product.ImportFromLink
function metaContent(html: string, key: string) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (match?.[1]) return match[1]
  }
  return ''
}

function decodeEntities(value: string) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function importProductFromLink(input: { url: string; name?: string; type?: string }) {
  const url = text(input.url)
  if (!/^https?:\/\//i.test(url)) throw new Error('请输入以 http(s):// 开头的商品链接')
  let title = ''
  let imageUrl = ''
  let description = ''
  try {
    const response = await fetchWithTimeout(url, 15_000)
    if (response.ok) {
      const html = (await response.text()).slice(0, 2_000_000)
      title = decodeEntities(metaContent(html, 'og:title') || /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1] || '')
      imageUrl = decodeEntities(metaContent(html, 'og:image'))
      description = decodeEntities(metaContent(html, 'og:description') || metaContent(html, 'description'))
    }
  } catch {
    // Many shop pages block automated fetches; fall back to the user-supplied name.
  }
  const name = text(input.name) || title.slice(0, 80)
  if (!name) throw new Error('无法从链接读取商品标题，请补充商品名称')
  const images: any[] = []
  if (imageUrl) {
    try {
      const absolute = new URL(imageUrl, url).toString()
      const response = await fetchWithTimeout(absolute, 20_000)
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer())
        if (buffer.length > 0 && buffer.length < 20 * 1024 * 1024) {
          const type = response.headers.get('content-type') || ''
          const extension = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg'
          const dir = join(getAppPaths().dataDir, 'products', 'link-imports')
          await mkdir(dir, { recursive: true })
          const filePath = join(dir, `${randomUUID()}${extension}`)
          await writeFile(filePath, buffer)
          const timestamp = Date.now()
          images.push({ id: randomUUID(), productId: '', filePath, fileName: basename(filePath), fileSize: buffer.length, thumbnailPath: filePath, createdAt: timestamp, updatedAt: timestamp, isCover: true })
        }
      }
    } catch {
      // Image download is best-effort.
    }
  }
  const remark = [`来源链接：${url}`, description ? `页面描述：${description.slice(0, 500)}` : ''].filter(Boolean).join('\n')
  const saved = await productsRepo.upsert({
    name,
    type: (text(input.type) || 'general') as any,
    remark,
    ...(images.length ? { images, coverImagePath: images[0].filePath, livePhotoReferenceImagePath: images[0].filePath } : {}),
  } as any)
  return { product: saved, fetchedTitle: Boolean(title), imageCount: images.length }
}

const productImportFromLinkBinding: AgentCapabilityBinding = {
  ...base('binding.product.import-link.local.v1', 'Product.ImportFromLink', 'write', 'Product'),
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const url = text(input.url || input.productUrl) || (/(https?:\/\/\S+)/.exec(text(input.request))?.[1] || '')
    if (!url) return failed('missing_url', '请提供商品链接。')
    try {
      const result = await importProductFromLink({ url, name: text(input.productName || input.name), type: text(input.productType) })
      await lineage.record({ fromRef: `url:${url}`, toRef: `product:${result.product.id}`, relation: 'derived_from', productId: result.product.id, meta: { runId: context.run.id } })
      const artifactId = context.registerArtifact({
        kind: 'product',
        name: result.product.name,
        uri: `agent-product://${result.product.id}`,
        metadata: { productId: result.product.id, imageCount: result.imageCount, fetchedTitle: result.fetchedTitle },
        sourceArtifactIds: [],
        lifecycle: 'referenced',
      })
      return completed({
        artifactIds: [artifactId],
        logs: [`Created product ${result.product.id} from link`],
        warnings: result.imageCount ? [] : ['没能从链接下载商品图，请在商品空间补充商品图片。'],
        externalRefs: { productId: result.product.id },
      })
    } catch (error) {
      return failed('import_failed', String((error as Error)?.message || error))
    }
  },
}

// ------------------------------------------------------------------ ProductResearch.PromoteWinner
const promoteWinnerBinding: AgentCapabilityBinding = {
  ...base('binding.product-research.promote.local.v1', 'ProductResearch.PromoteWinner', 'write', 'Product'),
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const schemes = await productResearchService.listSchemes()
    const schemeId = text(input.schemeId) || schemes.find((item) => text(input.request).includes(item.name))?.id || schemes.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id
    if (!schemeId) return failed('missing_scheme', '没有找到选品方案。')
    const scheme = schemes.find((item) => item.id === schemeId)
    const state = await productResearchService.getSchemeState(schemeId)
    const snapshot = await productResearchService.snapshot(schemeId)
    const tiers = new Set(strings(input.conclusions).length ? strings(input.conclusions) : ['excellent'])
    const winners = (state?.liveTestRecords || []).filter((record) => tiers.has(record.conclusion))
    if (!winners.length) return failed('no_winners', '该方案还没有达到「爆品」结论的商品，请先完成直播测款。')
    const existing = new Map((await productsRepo.list()).map((item) => [item.name, item.id]))
    const artifactIds: string[] = []
    let created = 0
    for (const record of winners) {
      const result = snapshot.results.find((item) => item.id === record.resultId)
      if (!result) continue
      const name = result.title.trim().slice(0, 80)
      if (!name) continue
      const existingId = existing.get(name)
      if (existingId) {
        // Already promoted earlier: still hand the product on so a pipeline can keep working with it.
        artifactIds.push(context.registerArtifact({ kind: 'product', name, uri: `agent-product://${existingId}`, metadata: { productId: existingId, existing: true }, sourceArtifactIds: [], lifecycle: 'referenced' }))
        continue
      }
      const edit = state?.productEdits.find((item) => item.resultId === record.resultId)
      const timestamp = Date.now()
      const saved = await productsRepo.upsert({
        name,
        type: 'general' as any,
        remark: [`来源：选品方案「${scheme?.name || ''}」`, edit?.sellingPoint ? `卖点：${edit.sellingPoint}` : '', `测款：${record.sessions} 场，成交 ${record.revenue}`].filter(Boolean).join('\n'),
        images: result.imagePath && existsSync(result.imagePath) ? [{ id: `pr-${result.id}`, productId: '', filePath: result.imagePath, fileName: basename(result.imagePath), fileSize: 0, createdAt: timestamp, updatedAt: timestamp, isCover: true }] as any : [],
      } as any)
      existing.set(name, saved.id)
      created += 1
      await lineage.record({ fromRef: `research:${schemeId}:${result.id}`, toRef: `product:${saved.id}`, relation: 'derived_from', productId: saved.id, meta: { runId: context.run.id } })
      artifactIds.push(context.registerArtifact({ kind: 'product', name: saved.name, uri: `agent-product://${saved.id}`, metadata: { productId: saved.id }, sourceArtifactIds: [], lifecycle: 'referenced' }))
    }
    return completed({
      artifactIds,
      logs: [`Promoted ${created} winning products to the product library`],
      warnings: created ? [] : ['爆品已全部在商品库中，直接沿用已有商品。'],
    })
  },
}

// ------------------------------------------------------------------ Publish.Draft
const publishDraftBinding: AgentCapabilityBinding = {
  ...base('binding.publish.draft.creatok.v1', 'Publish.Draft', 'write', 'Publish'),
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const productId = await resolveProductId(input)
    let sources: Array<{ path: string; ref?: string; productId?: string; title?: string; posterPath?: string }> = []
    // scope "run": only what this run's review step approved (autopilot), never the whole library.
    const runScoped = text(input.scope) === 'run'
    const refs = strings(input.refs).length ? strings(input.refs) : pipelineApprovedRefs(context)
    if (runScoped && !refs.length) return failed('nothing_to_publish', '本次流水线还没有审核通过的视频：请先在审核收件箱通过内容，再生成发布草稿。')
    if (refs.length) {
      for (const ref of refs) {
        const item = await contentIndex.get(ref)
        if (item?.mediaPath && VIDEO_EXT.test(item.mediaPath) && item.line !== 'livephoto') sources.push({ path: item.mediaPath, ref, productId: item.productId, title: item.productName || item.title, posterPath: item.previewPath })
      }
    } else if (productId || input.useApproved !== false) {
      const approved = await reviewInbox.list({ decision: 'approved', productId: productId || undefined })
      const published = new Set((await contentIndex.list({ line: 'publish' })).map((item) => item.sourceRef).filter(Boolean))
      sources = approved
        .filter((item) => item.mediaPath && VIDEO_EXT.test(item.mediaPath) && item.line !== 'livephoto' && !published.has(item.ref))
        .slice(0, Math.max(1, Math.min(50, Number(input.quantity || 20) || 20)))
        .map((item) => ({ path: item.mediaPath!, ref: item.ref, productId: item.productId, title: item.productName || item.title, posterPath: item.previewPath }))
    }
    if (!sources.length && !runScoped) {
      sources = collectPaths(input, context.dependencyArtifacts, 'video').map((path) => ({ path, productId: productId || undefined, title: basename(path, extname(path)) }))
    }
    if (!sources.length) return failed('nothing_to_publish', '没有可发布的视频：请先在审核收件箱通过内容，或指定要发布的视频。')
    const startAt = Date.parse(text(input.startAt)) || 0
    const intervalHours = Math.max(0, Math.min(72, Number(input.intervalHours || 0) || 0))
    const artifactIds: string[] = []
    let index = 0
    for (const source of sources) {
      const scheduleAt = startAt && startAt > Date.now() ? new Date(startAt + index * intervalHours * 3_600_000).toISOString() : undefined
      const [task] = await creatokPublisherService.createDraftsFromPaths({
        paths: [source.path],
        defaults: {
          videoTitle: text(input.videoTitle) || source.title,
          posterPath: source.posterPath,
          aiGenerated: true,
          ...(scheduleAt ? { scheduleAt } : {}),
          localProductId: source.productId,
          sourceRef: source.ref,
          createdBy: 'ai_producer',
        } as any,
      })
      if (source.ref) await lineage.record({ fromRef: source.ref, toRef: `publish:${task.id}`, relation: 'published_as', productId: source.productId, meta: { runId: context.run.id } })
      artifactIds.push(context.registerArtifact({
        kind: 'publish_receipt',
        name: `发布草稿 · ${source.title || basename(source.path)}`,
        uri: `publish://${task.id}`,
        localPath: source.path,
        metadata: { publishTaskId: task.id, scheduleAt, state: task.state },
        sourceArtifactIds: [],
        lifecycle: 'referenced',
      }))
      index += 1
    }
    contentIndex.invalidate()
    return completed({
      artifactIds,
      logs: [`Created ${sources.length} publish drafts`],
      warnings: ['发布草稿已生成：请在「发布中心」补充账号与 TikTok Shop 商品后确认发布。'],
    })
  },
}

// ------------------------------------------------------------------ Insights.Read
const insightsReadBinding: AgentCapabilityBinding = {
  ...base('binding.insights.read.local.v1', 'Insights.Read', 'read'),
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const days = Math.max(1, Math.min(90, Number(input.rangeDays || 7) || 7))
    const report = await buildInsights(days)
    const artifactId = context.registerArtifact({
      kind: 'report',
      name: `近 ${days} 天内容复盘`,
      uri: 'content-hub://insights',
      metadata: report as unknown as Record<string, unknown>,
      sourceArtifactIds: [],
      lifecycle: 'referenced',
    })
    return completed({ artifactIds: [artifactId], logs: report.recommendations })
  },
}

// ------------------------------------------------------------------ Reference.Discover
const REFERENCE_HINT = /参考|爆款|对标|跟拍|reference|viral|benchmark|trend/i

type ReferenceCandidate = { path: string; name: string; origin: 'download' | 'asset' | 'explicit'; id: string; meta: Record<string, unknown> }

/** Viral videos the user already saved: video-parser downloads first, then asset-library items marked as references. */
async function discoverReferenceVideos(limit: number) {
  const picked: ReferenceCandidate[] = []
  const seen = new Set<string>()
  const add = (entry: ReferenceCandidate) => {
    if (picked.length >= limit || seen.has(entry.path) || !existsSync(entry.path)) return
    seen.add(entry.path)
    picked.push(entry)
  }
  try {
    const downloads = (await videoParserDownloadRepo.listItems('desktop-local'))
      .filter((item) => item.status === 'completed' && text(item.localVideoPath))
      .sort((a, b) => Number(a.usedStatus === 'used') - Number(b.usedStatus === 'used') || b.createdAt - a.createdAt)
    for (const item of downloads) {
      add({
        path: text(item.localVideoPath),
        name: text(item.title) || basename(text(item.localVideoPath)),
        origin: 'download',
        id: item.id,
        meta: { sourceId: item.id, author: item.author, usedStatus: item.usedStatus, thumbnailPath: item.thumbnailPath },
      })
    }
  } catch {
    // The downloader store is optional.
  }
  if (picked.length < limit) {
    try {
      const folders = await assetLibraryService.listAllFolders()
      const referenceFolderIds = new Set<string>()
      for (const folder of folders) if (REFERENCE_HINT.test(text(folder.name))) referenceFolderIds.add(folder.id)
      // Sub-folders of a reference folder count too.
      let grew = true
      while (grew) {
        grew = false
        for (const folder of folders) {
          if (folder.parentId && referenceFolderIds.has(folder.parentId) && !referenceFolderIds.has(folder.id)) {
            referenceFolderIds.add(folder.id)
            grew = true
          }
        }
      }
      const assets = (await assetLibraryService.list('', 'video'))
        .filter((asset) => (asset.folderId && referenceFolderIds.has(asset.folderId)) || REFERENCE_HINT.test(text(asset.name)))
      for (const asset of assets) add({ path: asset.filePath, name: asset.name, origin: 'asset', id: asset.id, meta: { assetId: asset.id } })
    } catch {
      // The asset library is optional.
    }
  }
  return picked
}

const referenceDiscoverBinding: AgentCapabilityBinding = {
  ...base('binding.reference.discover.local.v1', 'Reference.Discover', 'read'),
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const limit = Math.max(1, Math.min(6, Number(input.referenceCount || 1) || 1))
    const explicit = strings(input.referenceVideoPaths).filter((path) => existsSync(path) && VIDEO_EXT.test(path))
    const found: ReferenceCandidate[] = explicit.length
      ? explicit.slice(0, limit).map((path) => ({ path, name: basename(path), origin: 'explicit', id: path, meta: {} }))
      : await discoverReferenceVideos(limit)
    if (!found.length) {
      return failed('no_reference_video', '没有找到可用的参考视频：请贴上爆款视频链接，或先用「视频解析下载」保存几条爆款，或把参考视频放进素材库里名字带「参考 / 爆款」的文件夹。')
    }
    const artifactIds = found.map((entry) => context.registerArtifact({
      kind: 'source_video',
      name: entry.name,
      uri: entry.origin === 'asset' ? `asset://${entry.id}` : entry.origin === 'download' ? `agent-source-video://${entry.id}` : `vg-file://${encodeURIComponent(entry.path)}`,
      localPath: entry.path,
      metadata: { ...entry.meta, origin: entry.origin },
      sourceArtifactIds: [],
      lifecycle: 'referenced',
    }))
    return completed({
      artifactIds,
      logs: found.map((entry) => `Reference video (${entry.origin}): ${entry.name}`),
      warnings: found.length < limit ? [`只找到 ${found.length} 条参考视频（期望 ${limit} 条）。`] : [],
    })
  },
}

// ------------------------------------------------------------------ Outputs.Await
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const outputsAwaitBinding: AgentCapabilityBinding = {
  ...base('binding.outputs.await.local.v1', 'Outputs.Await', 'read'),
  estimateCost: async () => ({ credits: 0 }),
  execute: async (input, context) => {
    const refs = new Set(pipelineContentRefs(context))
    if (!refs.size) return completed({ logs: ['No outputs were started earlier in this run.'], warnings: ['前面的步骤没有启动任何出片任务。'] })
    const deadline = Date.now() + Math.max(1, Math.min(360, Number(input.awaitMinutes || 120) || 120)) * 60_000
    const pollMs = Math.max(20, Math.min(60_000, Number(input.awaitPollMs || 5_000) || 5_000))
    let mine: Awaited<ReturnType<typeof contentIndex.listAll>> = []
    let timedOut = false
    while (true) {
      contentIndex.invalidate()
      mine = (await contentIndex.listAll()).filter((item) => refs.has(item.ref) || refs.has(item.projectRef))
      if (!mine.some((item) => item.status === 'running')) break
      if (Date.now() >= deadline) {
        timedOut = true
        break
      }
      const run = (await agentOsStore.read()).runs.find((item) => item.id === context.run.id)
      if (run && run.status !== 'running') return failed('run_stopped', '流水线已暂停或取消，停止等待出片。')
      await sleep(pollMs)
    }
    const ready = mine.filter((item) => item.status === 'ready' && item.mediaPath)
    const broken = mine.filter((item) => item.status === 'failed')
    const running = mine.filter((item) => item.status === 'running')
    if (!ready.length) {
      const reason = broken[0]?.error || broken[0]?.stage
      return failed('no_outputs', timedOut ? '等待出片超时，还没有任何成片完成，可稍后重试这一步。' : `没有成片完成${reason ? `：${reason}` : ''}。请打开对应项目查看原因。`, timedOut)
    }
    const artifactIds = ready.map((item) => context.registerArtifact({
      kind: item.mediaType === 'image' ? 'image' : 'video',
      name: `${item.productName ? `${item.productName} · ` : ''}${item.title}`,
      uri: `content-hub://item/${encodeURIComponent(item.ref)}`,
      localPath: item.mediaPath,
      metadata: { ref: item.ref, line: item.line, productId: item.productId || null },
      sourceArtifactIds: [],
      lifecycle: 'referenced',
    }))
    return completed({
      status: broken.length || running.length ? 'partial' : 'completed',
      artifactIds,
      logs: [`${ready.length} outputs ready, ${broken.length} failed, ${running.length} still running`],
      warnings: [
        ...broken.map((item) => `${item.title}：${item.error || item.stage || '生成失败'}`),
        ...(running.length ? [`还有 ${running.length} 个任务在生成中，完成后会进入审核收件箱。`] : []),
      ],
    })
  },
}

export const contentHubIntentCapabilities: Partial<Record<AgentIntentType, AgentCapabilityId>> = {
  'Intent.SystemHealthCheck': 'System.HealthCheck',
  'Intent.AssetSearch': 'Asset.Search',
  'Intent.AssetArchive': 'Asset.Archive',
  'Intent.CloneShotsSend': 'Clone.SendShots',
  'Intent.CreativeFromImages': 'CreativeStudio.CreateFromImages',
  'Intent.MuseFromImages': 'MuseStudio.CreateFromImages',
  'Intent.LivePhotoFromVideo': 'LivePhoto.FromVideo',
  'Intent.ReviewSubmit': 'Review.Submit',
  'Intent.ProductImportFromLink': 'Product.ImportFromLink',
  'Intent.ProductResearchPromote': 'ProductResearch.PromoteWinner',
  'Intent.PublishDraft': 'Publish.Draft',
  'Intent.InsightsRead': 'Insights.Read',
  'Intent.ReferenceDiscover': 'Reference.Discover',
  'Intent.OutputsAwait': 'Outputs.Await',
}

export const contentHubCapabilityDefinitions: AgentCapabilityDefinition[] = [
  { id: 'System.HealthCheck', version: 1, title: 'System health check', description: 'Check model, account, publishing and disk readiness.', intentType: 'Intent.SystemHealthCheck', expectedArtifacts: ['report'], bindings: [healthCheckBinding] },
  { id: 'Asset.Search', version: 1, title: 'Search asset library', description: 'Find images and videos in the asset library.', intentType: 'Intent.AssetSearch', expectedArtifacts: ['image', 'video'], bindings: [assetSearchBinding] },
  { id: 'Asset.Archive', version: 1, title: 'Archive to asset library', description: 'Save produced media into the asset library.', intentType: 'Intent.AssetArchive', expectedArtifacts: ['image', 'video'], bindings: [assetArchiveBinding] },
  { id: 'Clone.SendShots', version: 1, title: 'Send clone shots to Live Photo / Creative Studio', description: 'Reuse clone storyboard frames in other production lines.', intentType: 'Intent.CloneShotsSend', expectedArtifacts: ['task'], bindings: [cloneSendShotsBinding] },
  { id: 'CreativeStudio.CreateFromImages', version: 1, title: 'Creative Studio from scene images', description: 'Swap the product into scene images and render short videos with TikTok creative accounts.', intentType: 'Intent.CreativeFromImages', expectedArtifacts: ['task'], bindings: [creativeFromImagesBinding] },
  { id: 'MuseStudio.CreateFromImages', version: 1, title: 'Muse from scene images', description: 'Swap the product into scene images and, after the user approves each picture, render short videos with Muse accounts.', intentType: 'Intent.MuseFromImages', expectedArtifacts: ['task'], bindings: [museFromImagesBinding] },
  { id: 'LivePhoto.FromVideo', version: 1, title: 'Live Photo from video', description: 'Package an existing video into an Apple Live Photo.', intentType: 'Intent.LivePhotoFromVideo', expectedArtifacts: ['video'], bindings: [livePhotoFromVideoBinding] },
  { id: 'Review.Submit', version: 1, title: 'Send outputs to review', description: 'Collect finished outputs into the review inbox.', intentType: 'Intent.ReviewSubmit', expectedArtifacts: ['report'], bindings: [reviewSubmitBinding] },
  { id: 'Product.ImportFromLink', version: 1, title: 'Create product from link', description: 'Create a product from a shop link.', intentType: 'Intent.ProductImportFromLink', expectedArtifacts: ['product'], bindings: [productImportFromLinkBinding] },
  { id: 'ProductResearch.PromoteWinner', version: 1, title: 'Promote winners to products', description: 'Turn winning research products into product records.', intentType: 'Intent.ProductResearchPromote', expectedArtifacts: ['product'], bindings: [promoteWinnerBinding] },
  { id: 'Publish.Draft', version: 1, title: 'Create publish drafts', description: 'Create publishing drafts and schedules; publishing itself is confirmed by the user.', intentType: 'Intent.PublishDraft', expectedArtifacts: ['publish_receipt'], bindings: [publishDraftBinding] },
  { id: 'Insights.Read', version: 1, title: 'Content insights', description: 'Summarise production, review and publishing results.', intentType: 'Intent.InsightsRead', expectedArtifacts: ['report'], bindings: [insightsReadBinding] },
  { id: 'Reference.Discover', version: 1, title: 'Find reference videos', description: 'Pick viral reference videos the user already saved (downloads, reference folders).', intentType: 'Intent.ReferenceDiscover', expectedArtifacts: ['source_video'], bindings: [referenceDiscoverBinding] },
  { id: 'Outputs.Await', version: 1, title: 'Wait for outputs', description: 'Wait until the videos and Live Photos started earlier in this run are finished.', intentType: 'Intent.OutputsAwait', expectedArtifacts: ['video'], bindings: [outputsAwaitBinding] },
]

export const contentHubIntentDescriptions: Record<string, { description: string; requirements: string[]; title: string; employeeId: string }> = {
  'Intent.SystemHealthCheck': { title: 'System health check', description: 'Check whether models, TikTok creative accounts, publishing and disk space are ready.', requirements: [], employeeId: 'employee.package' },
  'Intent.AssetSearch': { title: 'Search asset library', description: 'Find images or videos in the asset library by keyword or type.', requirements: [], employeeId: 'employee.material' },
  'Intent.AssetArchive': { title: 'Archive to asset library', description: 'Save produced or attached media into the asset library.', requirements: ['Media from attachments or an earlier step.'], employeeId: 'employee.material' },
  'Intent.CloneShotsSend': { title: 'Send clone shots', description: 'Send storyboard frames of a clone project to Live Photo and/or TikTok Creative Studio (context.targets: livephoto, creative; muse only when the user asks for Muse).', requirements: ['A clone project, or a product that has one.'], employeeId: 'employee.clone' },
  'Intent.CreativeFromImages': { title: 'Creative Studio from scene images', description: 'Swap a product into scene images and render short videos with TikTok creative accounts.', requirements: ['A product.', 'One or more scene images (attachments or asset library).'], employeeId: 'employee.clone' },
  'Intent.MuseFromImages': { title: 'Muse from scene images', description: 'Only when the user explicitly asks for Muse: swap a product into scene images and render short videos with Muse accounts. The user approves every swapped picture first.', requirements: ['A product.', 'One or more scene images (attachments or asset library).', 'The user asked for Muse.'], employeeId: 'employee.clone' },
  'Intent.LivePhotoFromVideo': { title: 'Live Photo from video', description: 'Package already finished videos into Apple Live Photos without regenerating them.', requirements: ['One or more finished videos.'], employeeId: 'employee.package' },
  'Intent.ReviewSubmit': { title: 'Send to review inbox', description: 'Collect finished outputs into the review inbox for the user to approve.', requirements: [], employeeId: 'employee.package' },
  'Intent.ProductImportFromLink': { title: 'Create product from link', description: 'Create a product record from a shop or product page link.', requirements: ['A product link.'], employeeId: 'employee.material' },
  'Intent.ProductResearchPromote': { title: 'Promote research winners', description: 'Turn products concluded as winners in product research into product records.', requirements: ['A product research scheme with winners.'], employeeId: 'employee.material' },
  'Intent.PublishDraft': { title: 'Create publish drafts', description: 'Create publishing drafts (optionally scheduled) for approved videos; the user confirms the actual publishing.', requirements: ['Approved videos, a product, or explicit videos.'], employeeId: 'employee.package' },
  'Intent.InsightsRead': { title: 'Content insights', description: 'Summarise what was produced, approved and published, and recommend next steps.', requirements: [], employeeId: 'employee.package' },
  'Intent.ReferenceDiscover': { title: 'Find reference videos', description: 'Pick viral reference videos the user already saved (video downloads or asset-library reference folders) when the request gives none.', requirements: [], employeeId: 'employee.material' },
  'Intent.OutputsAwait': { title: 'Wait for outputs', description: 'Wait until videos and Live Photos started by earlier steps of the same plan are finished, before reviewing or publishing them.', requirements: ['Earlier steps in the same plan that start video or Live Photo generation.'], employeeId: 'employee.package' },
}
