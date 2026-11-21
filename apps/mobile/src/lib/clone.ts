import { ref, watch } from 'vue'
import { SYNC_COLLECTIONS, type SyncCloneProject, type SyncCloneShotState, type SyncGeneration, type SyncJobState } from '@shared/cloud/sync'
import { buildCloneFramePrompt, buildCloneShotVideoPrompt, type CloneAnalysis, type CloneAnalysisShot, type CloneComposeClip } from '@shared/cloud/clone'
import { buildLongTakeMemberships, buildLongTakePrompt, planLongTakeGroups } from '@shared/cloud/cloneContinuity'
import type { AiGenerationJob } from '@shared/cloud/ai'
import { cloud } from './session'
import { deleteRecord, getRecord, listRecords, newId, saveRecord, syncState } from './sync'

/**
 * 手机端复刻：所有重活都在云端任务里跑（拆解、分镜图、分镜视频、合成），
 * 项目进度存在 clone-projects 集合里，多端同步；页面打开时轮询未完成的任务。
 */

export type CloneProjectItem = SyncCloneProject & { id: string; updatedAt: number }

const MAX_VIDEO_BYTES = 200 * 1024 * 1024

export function useCloneProjects() {
  const items = ref<CloneProjectItem[]>([])
  watch(
    () => syncState.version,
    async () => {
      const records = await listRecords<SyncCloneProject>(SYNC_COLLECTIONS.cloneProjects)
      items.value = records
        .filter((record) => record.data)
        .map((record) => ({ ...(record.data as SyncCloneProject), id: record.id, updatedAt: record.updatedAt }))
        .sort((a, b) => b.createdAt - a.createdAt)
    },
    { immediate: true },
  )
  return items
}

export async function loadProject(id: string): Promise<SyncCloneProject | null> {
  return (await getRecord<SyncCloneProject>(SYNC_COLLECTIONS.cloneProjects, id))?.data ?? null
}

async function save(id: string, project: SyncCloneProject) {
  await saveRecord<SyncCloneProject>(SYNC_COLLECTIONS.cloneProjects, id, project)
}

/** 上传对标视频并开始拆解 */
export async function createProject(file: File, locale: SyncCloneProject['locale']) {
  const uploaded = await uploadVideo(file)
  return createProjectFromVideo({ videoFileId: uploaded.fileId, name: file.name.replace(/\.[^.]+$/, ''), locale })
}

export async function uploadVideo(file: File) {
  if (file.size > MAX_VIDEO_BYTES) throw new Error('视频太大（最多 200MB），请先剪短')
  const mime = file.type && file.type.startsWith('video/') ? file.type : 'video/mp4'
  return cloud.sync.uploadFile(file, mime)
}

/** 用已上传的对标视频建项目并开始拆解（可直接带上商品，AI 制片人用） */
export async function createProjectFromVideo(input: {
  videoFileId: string
  name: string
  locale: SyncCloneProject['locale']
  product?: Pick<SyncCloneProject, 'productId' | 'productName' | 'productImageFileId'>
}) {
  const id = newId('clone')
  const project: SyncCloneProject = {
    name: input.name.slice(0, 40) || '复刻项目',
    referenceVideoFileId: input.videoFileId,
    locale: input.locale,
    ...input.product,
    shots: {},
    createdAt: Date.now(),
  }
  await save(id, project)
  try {
    await analyze(id, project)
  } catch (error) {
    // Keep the uploaded video; the project page shows the reason and a retry button.
    await save(id, { ...project, analyzeStatus: 'failed', analyzeError: (error as Error).message })
  }
  return id
}

export async function analyze(id: string, project: SyncCloneProject) {
  const { job } = await cloud.ai.createJob({ kind: 'analyze-video', videoFileId: project.referenceVideoFileId, locale: project.locale, purpose: 'clone-analyze' })
  await save(id, { ...project, analyzeJobId: job.id, analyzeStatus: job.status, analyzeError: undefined, analysis: undefined, shots: {} })
}

export function usableShots(project: SyncCloneProject): CloneAnalysisShot[] {
  return (project.analysis?.shots ?? []).filter((shot) => shot.eligible && shot.frameFileId)
}

/** 生成分镜图：参考帧 + 自己的商品（+ 模特）→ 同构图的新画面 */
export async function generateFrames(id: string, project: SyncCloneProject, shotIds: string[]) {
  if (!project.productImageFileId) throw new Error('请先选择商品')
  const shots = { ...project.shots }
  for (const shot of usableShots(project).filter((item) => shotIds.includes(item.id))) {
    const { job } = await cloud.ai.createJob({
      kind: 'image',
      prompt: buildCloneFramePrompt(shot, { hasModel: Boolean(project.modelImageFileId) }),
      imageFileIds: [shot.frameFileId!, project.productImageFileId, ...(project.modelImageFileId ? [project.modelImageFileId] : [])],
      aspectRatio: project.analysis?.aspectRatio ?? '9:16',
      purpose: 'clone-frame',
    })
    shots[shot.id] = { ...shots[shot.id], frameJobId: job.id, frameStatus: job.status, frameFileId: undefined, frameError: undefined, videoJobId: undefined, videoStatus: undefined, videoFileId: undefined, videoError: undefined }
  }
  await save(id, { ...project, shots })
}

/**
 * 衔接计划：原片里连着拍的相邻镜头（拆解时标了 continuousWithNext）合成一段长镜头一起生成；
 * 每段视频的结尾画面用下一段开头的分镜图，拼起来不跳。跳过的、没分镜图的镜头前后算剪切。
 */
function planContinuity(project: SyncCloneProject) {
  const shots = usableShots(project).filter((shot) => !project.shots[shot.id]?.skip && project.shots[shot.id]?.frameFileId)
  const continuous = (shot: CloneAnalysisShot, index: number) => {
    const next = shots[index + 1]
    return Boolean(shot.continuousWithNext && next && next.index === shot.index + 1)
  }
  const groups = planLongTakeGroups(shots.map((shot, index) => ({ id: shot.id, durationSec: shot.durationSec, continuousWithNext: continuous(shot, index) })))
  const memberships = buildLongTakeMemberships(groups, Object.fromEntries(shots.map((shot) => [shot.id, shot.durationSec])))
  const byId = new Map(shots.map((shot) => [shot.id, shot]))
  return groups.map((ids, groupIndex) => {
    const members = ids.map((shotId) => byId.get(shotId)!)
    const tail = members[members.length - 1]!
    const nextGroup = groups[groupIndex + 1]
    const relayTo = nextGroup && continuous(tail, shots.indexOf(tail)) ? nextGroup[0] : undefined
    return { ids, members, memberships, relayTo }
  })
}

/** 生成分镜视频：以分镜图为首帧，按原片这一镜的动作和运镜动起来；连着拍的镜头一起生成、首尾衔接 */
export async function generateShotVideos(id: string, project: SyncCloneProject, shotIds: string[]) {
  const shots = { ...project.shots }
  for (const group of planContinuity(project)) {
    // Asking for any shot of a long take regenerates the whole take, so its parts stay continuous.
    if (!group.ids.some((shotId) => shotIds.includes(shotId))) continue
    const leader = group.members[0]!
    const leaderState = shots[leader.id]
    if (!leaderState?.frameFileId) continue
    const isTake = group.ids.length > 1
    const groupDurationSec = group.members.reduce((sum, shot) => sum + shot.durationSec, 0)
    const basePrompt = buildCloneShotVideoPrompt({ ...leader, durationSec: isTake ? groupDurationSec : leader.durationSec })
    const prompt = isTake
      ? buildLongTakePrompt(
          basePrompt,
          group.members.map((shot) => ({
            offsetSec: group.memberships[shot.id]?.offsetSec ?? 0,
            durationSec: shot.durationSec,
            text: [shot.action, shot.camera].filter(Boolean).join('. '),
          })),
        )
      : basePrompt
    const endImageFileId = group.relayTo ? shots[group.relayTo]?.frameFileId : undefined
    const { job } = await cloud.ai.createJob({
      kind: 'video',
      prompt,
      imageFileIds: [leaderState.frameFileId],
      ...(endImageFileId ? { endImageFileId } : {}),
      aspectRatio: project.analysis?.aspectRatio ?? '9:16',
      durationSec: Math.max(4, Math.min(10, Math.ceil(isTake ? groupDurationSec : leader.durationSec))),
      purpose: 'clone-shot',
    })
    for (const shot of group.members) {
      const membership = group.memberships[shot.id]
      shots[shot.id] = {
        ...shots[shot.id],
        videoJobId: job.id,
        videoStatus: job.status,
        videoFileId: undefined,
        videoError: undefined,
        take: isTake && membership
          ? { leaderShotId: leader.id, jobId: job.id, offsetSec: membership.offsetSec, durationSec: membership.durationSec, groupDurationSec: membership.groupDurationSec }
          : undefined,
        relayToShotId: shot.id === group.ids[group.ids.length - 1] && endImageFileId ? group.relayTo : undefined,
      }
    }
  }
  await save(id, { ...project, shots })
}

/** 合成成片：按原片顺序和每镜时长拼接；没有视频的镜头用分镜图（或原片参考帧）做静帧；长镜头只取本镜那一截 */
export async function compose(id: string, project: SyncCloneProject) {
  const used = usableShots(project).filter((shot) => !project.shots[shot.id]?.skip)
  const clips = used.map((shot, index) => {
    const state = project.shots[shot.id] ?? {}
    const next = used[index + 1]
    const nextState = next ? project.shots[next.id] ?? {} : undefined
    const hasVideo = Boolean(state.videoFileId)
    const take = hasVideo && state.take && state.take.jobId === state.videoJobId ? state.take : undefined
    const sameTake = Boolean(take && nextState?.take && nextState.videoFileId && nextState.take.jobId === take.jobId)
    const relayed = Boolean(hasVideo && next && state.relayToShotId === next.id && nextState?.videoFileId)
    const joinNext: CloneComposeClip['joinNext'] = sameTake || relayed ? 'locked' : next && shot.continuousWithNext && next.index === shot.index + 1 ? 'continuous' : undefined
    return {
      fileId: state.videoFileId || state.frameFileId || shot.frameFileId!,
      durationSec: shot.durationSec,
      ...(take ? { take: { offsetSec: take.offsetSec, durationSec: take.durationSec, groupDurationSec: take.groupDurationSec } } : {}),
      ...(joinNext ? { joinNext } : {}),
    }
  })
  if (!clips.length) throw new Error('没有可合成的镜头')
  const { job } = await cloud.ai.createJob({ kind: 'compose', clips, aspectRatio: project.analysis?.aspectRatio ?? '9:16', purpose: 'clone-compose' })
  await save(id, { ...project, composeJobId: job.id, composeStatus: job.status, composeError: undefined, finalFileId: undefined })
}

export async function toggleSkip(id: string, project: SyncCloneProject, shotId: string) {
  const state = project.shots[shotId] ?? {}
  await save(id, { ...project, shots: { ...project.shots, [shotId]: { ...state, skip: !state.skip } } })
}

export async function setSource(id: string, project: SyncCloneProject, patch: Pick<SyncCloneProject, 'productId' | 'productName' | 'productImageFileId' | 'modelId' | 'modelImageFileId'>) {
  await save(id, { ...project, ...patch })
}

/* ------------------------------------------------------------------ 进度 */

const pending = (status?: SyncJobState) => status === 'queued' || status === 'running'

export function hasPendingJobs(project: SyncCloneProject) {
  return pending(project.analyzeStatus) || pending(project.composeStatus) || Object.values(project.shots).some((shot) => pending(shot.frameStatus) || pending(shot.videoStatus))
}

/** 查询项目里所有未完成的任务并写回进度；返回是否还有进行中的任务 */
export async function refreshProject(id: string): Promise<boolean> {
  const project = await loadProject(id)
  if (!project || !hasPendingJobs(project)) return false
  const ids = [
    pending(project.analyzeStatus) ? project.analyzeJobId : undefined,
    pending(project.composeStatus) ? project.composeJobId : undefined,
    ...Object.values(project.shots).flatMap((shot) => [pending(shot.frameStatus) ? shot.frameJobId : undefined, pending(shot.videoStatus) ? shot.videoJobId : undefined]),
  ].filter((value): value is string => Boolean(value))
  const { jobs } = await cloud.ai.listJobs(ids)
  const byId = new Map<string, AiGenerationJob>(jobs.map((job) => [job.id, job]))
  let changed = false
  const next: SyncCloneProject = { ...project, shots: { ...project.shots } }

  const analyzeJob = project.analyzeJobId ? byId.get(project.analyzeJobId) : undefined
  if (analyzeJob && analyzeJob.status !== project.analyzeStatus) {
    next.analyzeStatus = analyzeJob.status
    next.analyzeError = analyzeJob.error
    if (analyzeJob.status === 'succeeded') next.analysis = analyzeJob.result as CloneAnalysis
    changed = true
  }
  for (const [shotId, state] of Object.entries(project.shots)) {
    const frame = state.frameJobId ? byId.get(state.frameJobId) : undefined
    const video = state.videoJobId ? byId.get(state.videoJobId) : undefined
    const updated: SyncCloneShotState = { ...state }
    if (frame && frame.status !== state.frameStatus) Object.assign(updated, { frameStatus: frame.status, frameFileId: frame.outputFileId, frameError: frame.error })
    if (video && video.status !== state.videoStatus) Object.assign(updated, { videoStatus: video.status, videoFileId: video.outputFileId, videoError: video.error })
    if (updated.frameStatus !== state.frameStatus || updated.videoStatus !== state.videoStatus) {
      next.shots[shotId] = updated
      changed = true
    }
  }
  const composeJob = project.composeJobId ? byId.get(project.composeJobId) : undefined
  if (composeJob && composeJob.status !== project.composeStatus) {
    next.composeStatus = composeJob.status
    next.composeError = composeJob.error
    next.finalFileId = composeJob.outputFileId
    changed = true
    // The finished video also lands in the review inbox next to other AI material.
    if (composeJob.status === 'succeeded' && composeJob.outputFileId) {
      await saveRecord<SyncGeneration>(SYNC_COLLECTIONS.generations, newId('gen'), {
        kind: 'video',
        purpose: 'clone',
        jobId: composeJob.id,
        status: 'succeeded',
        productId: project.productId,
        productName: project.productName,
        sourceFileId: usableShots(project)[0]?.frameFileId || project.productImageFileId || '',
        label: '复刻成片',
        outputFileId: composeJob.outputFileId,
        outputMime: composeJob.outputMime,
        review: 'pending',
        createdAt: Date.now(),
      })
    }
  }
  if (changed) await save(id, next)
  return hasPendingJobs(next)
}

/* ------------------------------------------------------------------ 列表管理（分组、改名、删除、步骤进度） */

export const CLONE_STEPS = ['参考分析', '选择商品', '分镜图', '分镜视频', '成片合成'] as const

/** 第几步（1 起）、完成了几步，用于列表进度条 */
export function cloneProgress(project: SyncCloneProject) {
  const shots = project.analysis ? usableShots(project) : []
  const done = [
    project.analyzeStatus === 'succeeded' && Boolean(project.analysis),
    Boolean(project.productImageFileId),
    shots.length > 0 && shots.every((shot) => project.shots[shot.id]?.frameFileId),
    shots.length > 0 && shots.every((shot) => project.shots[shot.id]?.videoFileId),
    Boolean(project.finalFileId),
  ]
  const finished = done.filter(Boolean).length
  const current = Math.min(CLONE_STEPS.length, done.findIndex((ok) => !ok) + 1 || CLONE_STEPS.length)
  return {
    done,
    current,
    label: CLONE_STEPS[current - 1],
    pct: Math.round((finished / CLONE_STEPS.length) * 100),
    frames: shots.filter((shot) => project.shots[shot.id]?.frameFileId).length,
    videos: shots.filter((shot) => project.shots[shot.id]?.videoFileId).length,
  }
}

export type CloneStage = 'draft' | 'running' | 'done' | 'failed'
export function cloneStage(project: SyncCloneProject): CloneStage {
  if (project.finalFileId) return 'done'
  if (project.analyzeStatus === 'failed' || project.composeStatus === 'failed') return 'failed'
  if (hasPendingJobs(project)) return 'running'
  if (!project.analysis || !project.productImageFileId) return 'draft'
  return 'running'
}
export const CLONE_STAGE_LABEL: Record<CloneStage, { label: string; tone: string }> = {
  draft: { label: '草稿', tone: '' },
  running: { label: '进行中', tone: 'blue' },
  done: { label: '已完成', tone: 'green' },
  failed: { label: '失败', tone: 'red' },
}

export async function updateProjectMeta(id: string, patch: Partial<Pick<SyncCloneProject, 'name' | 'group'>>) {
  const project = await loadProject(id)
  if (project) await save(id, { ...project, ...patch })
}

export async function removeProject(id: string) {
  await deleteRecord(SYNC_COLLECTIONS.cloneProjects, id)
}

/** 分组名单（全账号一条），删分组时项目回到「未分组」 */
export function useCloneGroups() {
  const names = ref<string[]>([])
  watch(
    () => syncState.version,
    async () => {
      names.value = (await getRecord<{ names: string[] }>(SYNC_COLLECTIONS.cloneGroups, 'groups'))?.data?.names ?? []
    },
    { immediate: true },
  )
  return names
}

export async function saveCloneGroups(names: string[]) {
  await saveRecord<{ names: string[] }>(SYNC_COLLECTIONS.cloneGroups, 'groups', { names: [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 50) })
}
