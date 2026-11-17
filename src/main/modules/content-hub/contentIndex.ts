import { existsSync } from 'node:fs'
import { cloneRepo } from '../clone/repo'
import { livePhotoService } from '../live-photo/service'
import { tiktokCreativeStudioRepo } from '../tiktok-creative-studio/repo'
import { creatokPublisherRepo } from '../tiktok-publisher/repo'
import { taskQueue } from '../tasks/queue'
import { productsRepo } from '../products/repo'
import type { ContentItem, ContentLine, ContentStatus, ProjectSummary } from './types'

function text(value: unknown) {
  return String(value ?? '').trim()
}

function firstExisting(...paths: unknown[]) {
  for (const candidate of paths) {
    const value = text(candidate)
    if (value && existsSync(value)) return value
  }
  return ''
}

const CLONE_STAGE_LABEL: Record<string, string> = {
  draft: '参考分析',
  analyzed: '脚本生成',
  materials_ready: '分镜设计',
}

async function productNameMap() {
  try {
    const products = await productsRepo.list()
    return new Map(products.map((item) => [item.id, item.name]))
  } catch {
    return new Map<string, string>()
  }
}

async function cloneItems(names: Map<string, string>): Promise<ContentItem[]> {
  let projects: any[] = []
  try {
    projects = await cloneRepo.listProjects()
  } catch {
    return []
  }
  return projects.map((project) => {
    const compose = project.finalCompose || {}
    const outputPath = firstExisting(compose.outputPath)
    const rawStatus = text(project.status)
    let status: ContentStatus = 'running'
    if (outputPath && compose.status !== 'failed') status = 'ready'
    else if (compose.status === 'failed' || /fail|error/i.test(rawStatus)) status = 'failed'
    else if (rawStatus === 'draft' && !project.blueprint) status = 'draft'
    const productId = text(project.productId) || undefined
    return {
      ref: `clone:${project.id}`,
      line: 'clone' as const,
      projectRef: `clone:${project.id}`,
      productId,
      productName: productId ? names.get(productId) : undefined,
      title: text(project.title) || text(project.referenceVideoName) || `复刻 ${String(project.id).slice(0, 6)}`,
      status,
      stage: status === 'ready' ? '成片合成' : compose.status === 'composing' ? '成片合成' : CLONE_STAGE_LABEL[rawStatus] || '分镜视频',
      error: status === 'failed' ? text(compose.error) || undefined : undefined,
      mediaPath: outputPath || undefined,
      mediaType: 'video' as const,
      previewPath: firstExisting(compose.coverImagePath, project.coverAssetPath) || undefined,
      route: `/clone/${project.id}`,
      createdAt: Number(project.createdAt || 0),
      updatedAt: Number(project.updatedAt || project.createdAt || 0),
    }
  })
}

async function livePhotoItems(names: Map<string, string>): Promise<ContentItem[]> {
  let items: any[] = []
  try {
    items = (await livePhotoService.list()) as any[]
  } catch {
    return []
  }
  return items.map((item) => {
    const mediaPath = firstExisting(item.subtitleOutputPath, item.previewVideoPath, item.livePhotoVideoPath, item.motionVideoPath)
    const auto = item.autoFlowStatus || {}
    let status: ContentStatus = 'running'
    if (item.packagingStatus === 'completed' && mediaPath) status = 'ready'
    else if (item.packagingStatus === 'failed' || /^failed/.test(text(auto.status)) || (text(item.error) && !mediaPath)) status = 'failed'
    else if (!auto.enabled && !item.workflow) status = 'draft'
    const productId = text(item.productId) || undefined
    const sourceRef = item.sourceType === 'clone_shot' && item.sourceProjectId ? `clone:${item.sourceProjectId}` : undefined
    return {
      ref: `livephoto:${item.id}`,
      line: 'livephoto' as const,
      projectRef: `livephoto:${item.id}`,
      productId,
      productName: productId ? names.get(productId) || item.productSnapshot?.name : undefined,
      title: text(item.sourceShotLabel) || text(item.productSnapshot?.name) || `Live Photo ${String(item.id).slice(0, 6)}`,
      status,
      stage: text(item.workflow?.currentStep) || undefined,
      error: status === 'failed' ? text(item.error) || undefined : undefined,
      mediaPath: mediaPath || undefined,
      mediaType: 'livephoto' as const,
      previewPath: firstExisting(item.subtitleCoverImagePath, item.posterPath, item.livePhotoImagePath, item.generatedStillPath, item.referenceImagePath) || undefined,
      route: `/plugins/live-photo-generator?item=${encodeURIComponent(item.id)}`,
      sourceRef,
      createdAt: Number(item.createdAt || 0),
      updatedAt: Number(item.updatedAt || item.createdAt || 0),
    }
  })
}

async function creativeItems(names: Map<string, string>): Promise<ContentItem[]> {
  let tasks: any[] = []
  try {
    tasks = await tiktokCreativeStudioRepo.list()
  } catch {
    return []
  }
  const out: ContentItem[] = []
  for (const task of tasks) {
    const productId = text(task.productId) || undefined
    for (const shot of Array.isArray(task.shots) ? task.shots : []) {
      const mediaPath = firstExisting(shot.subtitleVideoPath, shot.resultVideoPath)
      let status: ContentStatus = 'running'
      if (shot.status === 'completed' && mediaPath) status = 'ready'
      else if (shot.status === 'failed') status = 'failed'
      else if (shot.status === 'draft') status = 'draft'
      out.push({
        ref: `creative:${task.id}:${shot.shotId}`,
        line: 'creative',
        projectRef: `creative:${task.id}`,
        productId,
        productName: productId ? names.get(productId) || text(task.productName) || undefined : undefined,
        title: `${text(task.productName) || text(task.sourceCloneProjectTitle) || '创意任务'} · #${Number(shot.shotIndex || 0) + 1}`,
        status,
        stage: shot.status === 'requires_manual' ? '等待人工处理' : text(shot.remoteStatus) || undefined,
        error: status === 'failed' ? text(shot.lastError) || undefined : undefined,
        mediaPath: mediaPath || undefined,
        mediaType: 'video',
        previewPath: firstExisting(shot.subtitleCoverImagePath, shot.posterPath, shot.preparedImagePath, shot.imagePath) || undefined,
        route: `/plugins/tiktok-creative-studio?task=${encodeURIComponent(task.id)}`,
        sourceRef: task.sourceCloneProjectId ? `clone:${task.sourceCloneProjectId}` : undefined,
        createdAt: Number(shot.createdAt || task.createdAt || 0),
        updatedAt: Number(shot.updatedAt || task.updatedAt || 0),
      })
    }
  }
  return out
}

function productionItems(names: Map<string, string>): ContentItem[] {
  let tasks: any[] = []
  try {
    tasks = taskQueue.list() as any[]
  } catch {
    return []
  }
  return tasks.map((task) => {
    const mediaPath = firstExisting(task.outPath)
    let status: ContentStatus = 'running'
    if (task.status === 'done' && mediaPath) status = 'ready'
    else if (task.status === 'error') status = 'failed'
    else if (task.status === 'cancelled' || task.status === 'skipped') status = 'draft'
    const productId = text(task.productId) || undefined
    return {
      ref: `production:${task.id}`,
      line: 'production' as const,
      projectRef: `production:${task.id}`,
      productId,
      productName: productId ? names.get(productId) : undefined,
      title: `${(productId && names.get(productId)) || '混剪任务'} · ${String(task.id).slice(0, 6)}`,
      status,
      progress: Math.round(Number(task.progress || 0) * 100),
      error: status === 'failed' ? text(task.error) || undefined : undefined,
      mediaPath: mediaPath || undefined,
      mediaType: 'video' as const,
      route: `/production/tasks/${task.id}`,
      createdAt: Number(task.createdAt || 0),
      updatedAt: Number(task.createdAt || 0),
    }
  })
}

async function publishItems(names: Map<string, string>): Promise<ContentItem[]> {
  let tasks: any[] = []
  try {
    tasks = await creatokPublisherRepo.list()
  } catch {
    return []
  }
  return tasks.map((task) => {
    let status: ContentStatus = 'running'
    if (task.state === 'published') status = 'ready'
    else if (task.state === 'failed' || task.state === 'result_unknown') status = 'failed'
    else if (task.state === 'draft' || task.state === 'ready' || task.state === 'cancelled') status = 'draft'
    const productId = text(task.localProductId) || undefined
    return {
      ref: `publish:${task.id}`,
      line: 'publish' as const,
      projectRef: `publish:${task.id}`,
      productId,
      productName: productId ? names.get(productId) : undefined,
      title: text(task.videoTitle) || text(task.productTitle) || '发布任务',
      status,
      stage: text(task.state),
      error: status === 'failed' ? text(task.error?.message) || undefined : undefined,
      mediaPath: firstExisting(task.sourceVideoPath) || undefined,
      mediaType: 'video' as const,
      previewPath: firstExisting(task.posterPath) || undefined,
      route: '/publish',
      sourceRef: text(task.sourceRef) || (task.sourceTaskId && task.sourceShotId ? `creative:${task.sourceTaskId}:${task.sourceShotId}` : undefined),
      createdAt: Number(task.createdAt || 0),
      updatedAt: Number(task.updatedAt || task.createdAt || 0),
    }
  })
}

let cache: { at: number; items: ContentItem[] } | null = null
const CACHE_MS = 4_000

export const contentIndex = {
  invalidate() {
    cache = null
  },

  async listAll(): Promise<ContentItem[]> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.items
    const names = await productNameMap()
    const groups = await Promise.all([
      cloneItems(names),
      creativeItems(names),
      livePhotoItems(names),
      Promise.resolve(productionItems(names)),
      publishItems(names),
    ])
    const items = groups.flat().sort((a, b) => b.updatedAt - a.updatedAt)
    cache = { at: Date.now(), items }
    return items
  },

  async list(filter: { productId?: string; line?: ContentLine; status?: ContentStatus; limit?: number } = {}) {
    const items = await this.listAll()
    const limit = Math.max(1, Math.min(1000, Number(filter.limit || 500)))
    return items
      .filter((item) => (!filter.productId || item.productId === filter.productId)
        && (!filter.line || item.line === filter.line)
        && (!filter.status || item.status === filter.status))
      .slice(0, limit)
  },

  async get(ref: string) {
    return (await this.listAll()).find((item) => item.ref === ref) || null
  },

  /** Recent projects across all lines for "continue where you left off". */
  async recentProjects(limit = 8): Promise<ProjectSummary[]> {
    const items = (await this.listAll()).filter((item) => item.line !== 'publish')
    const byProject = new Map<string, ContentItem[]>()
    for (const item of items) {
      const list = byProject.get(item.projectRef) || []
      list.push(item)
      byProject.set(item.projectRef, list)
    }
    const summaries: ProjectSummary[] = []
    for (const [ref, group] of byProject) {
      const head = group.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0]
      const readyCount = group.filter((item) => item.status === 'ready').length
      const failedCount = group.filter((item) => item.status === 'failed').length
      const runningCount = group.filter((item) => item.status === 'running').length
      const status: ContentStatus = runningCount ? 'running' : failedCount ? 'failed' : readyCount ? 'ready' : 'draft'
      summaries.push({
        ref,
        line: head.line,
        title: head.line === 'creative' ? head.title.replace(/ · #\d+$/, '') : head.title,
        productId: head.productId,
        productName: head.productName,
        status,
        stage: head.stage,
        progress: group.length > 1 ? Math.round((readyCount / group.length) * 100) : head.progress,
        readyCount,
        failedCount,
        route: head.route,
        previewPath: group.find((item) => item.previewPath)?.previewPath,
        updatedAt: head.updatedAt,
      })
    }
    return summaries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, Math.max(1, limit))
  },
}
