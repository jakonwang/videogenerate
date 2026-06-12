import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { canUseMockGeneration } from './mockPolicy'
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import PQueue from 'p-queue'
import { getFfmpegExecutable } from '../../lib/binariesPath'
import { getAppPaths } from '../../lib/paths'
import { cloneRepo } from './repo'
import { resolveApifoxHubCredentials, resolveApifoxHubProfile } from './apifoxProfile'
import { analyzeReferenceVideo } from './analyzer'
import { analyzeProductStructureWithGrs, analyzeReferenceScriptWithGrs, applyScriptAnalysisToShots } from './aiScriptAnalyzer'
import { generateShotVariantsWithAi } from './variantGenerator'
import { scoreShotVariantsWithAi } from './variantScorer'
import { buildVideoPlans } from './videoPlanBuilder'
import {
  generateShotByProviderChain,
  buildVideoNegativePrompt,
  generateShotKeyframesByProviderChain,
  generateShotVideoByProviderChain,
  buildRealisticPrompt,
  publicUrlForCloudFrame,
  regenerateOneShotKeyframeByProviderChain,
} from './providers'
import {
  Ai666TaskTimeoutError,
  createVideoTask as createAi666VideoTask,
  pollTask as pollAi666Task,
  queryAsyncTask as queryAi666Task,
  recoverTaskById as recoverAi666TaskById,
  syncRemoteTaskResult as syncAi666RemoteTaskResult,
  submitTask as submitAi666Task,
} from './unifiedVideo'
import { productsRepo } from '../products/repo'
import { templatesRepo } from '../templates/repo'
import { getMediaInfo } from '../media/info'
import { generateThumbnailJpg } from '../media/thumbnail'
import { createBatchTasks } from '../tasks/createBatchTasks'
import { taskQueue } from '../tasks/queue'
import { probeMedia } from '../ffmpeg/probe'
import { renderViralCloneBatch } from './renderViralCloneBatch'
import {
  buildModelLibraryPromptPreview,
  buildModelIdentityPackPromptPreview,
  buildFrameSceneAtmosphereText,
  buildGptFramePrompt,
  buildModelIdentityLockText,
  buildProductDescriptionLockText,
  buildReferenceResponsibilityText,
  defaultModelIdentityDescription,
  generateGptShotFrameImage,
  generateModelIdentityPackImages,
} from './gptImage'
import { buildProductAnalysisBoard } from './productAnalysisBoard'
import {
  buildCloneShotPrompt,
  buildCloneNegativePrompt,
  detectProductMode,
  buildFinalShotVideoPositivePrompt,
  buildOptimizedVideoPrompt,
  buildProductLockText,
  buildRealismInstruction,
  buildNoSpeakingInstruction,
  buildVideoAntiSparkleNegativePrompt,
  keepEnglishLikeText,
  prependSilentCommercialGlobalRule,
  sanitizeGeneratedVideoPrompt,
  sanitizeNegativePrompt,
  buildTextSafetyInstruction,
  buildShotScriptConstraintText,
  expandCommercialVideoPrompt,
} from './prompt'
import { generateChatCompletion } from './unifiedChat'
import { getProductCanonicalSourcePrompt, sanitizeProductReferenceImages } from './productImageSanitizer'
import {
  computeCloudClipHash,
  computeImagePromptHash,
  computePromptHash,
  getCachedCloudClipResult,
  getCachedFrameResult,
  getCachedPromptResult,
  setCachedCloudClipResult,
  setCachedFrameResult,
  setCachedPromptResult,
} from './cache'
import { productionQualityCheckShot, shouldRetryByQualityMode } from './quality'
import {
  createCloneGenerationQueue,
  enqueueCloneShotJob,
  pauseCloneGenerationQueue,
  resumeCloneGenerationQueue,
} from './cloud-queue'
import { computeGenerationQueueRuntimeSummary, summarizeVideoDispatchCounts } from './videoGenerationQueueSummary'
import {
  GLOBAL_VIDEO_TASK_LIMITS,
  globalVideoTaskPoolState,
  refreshGenerationQueueRuntime as refreshGenerationQueueRuntimeBase,
  runVideoTaskPoolJob as runVideoTaskPoolJobBase,
} from './videoTaskPoolRuntime'
import { GLOBAL_STORYBOARD_FRAME_TASK_LIMIT, runStoryboardFrameTaskPoolJob } from './storyboardFrameTaskPoolRuntime'
import { createShotVideoOrchestrator } from './shotVideoOrchestrator'
import type {
  CloneLocale,
  CloneExecutionBlueprint,
  CloneFinalComposeStatus,
  ClonePipelineStatus,
  ClonePreviewPipelineStatus,
  CloneBlueprint,
  CloneConsistencyAssetsSnapshot,
  CloneProject,
  CloneReviewStatus,
  CloneScriptVariantCandidate,
  CloneShotVideoOutput,
  CloneStoryboardFrame,
  CloneStoryboardGridBatch,
  ModelCredentials,
  ModelIdentityLibraryItem,
  ModelIdentityPack,
  ReplicaSession,
  SessionResult,
  ShotKeyframeAsset,
  ShotSourceMode,
  ShotSpec,
  ConsistencyMode,
  CloneProductType,
  CloneQualityMode,
  AiProviderName,
  ImageProviderName,
  ProductionQualityCheckResult,
  ShotVariant,
  ShotVariantScore,
  VideoPlan,
  CloneScriptCandidate,
  CloneWorkflowV2Step,
  CloneWorkflowV2Status,
  CloneProjectSummary,
  CloneRunMode,
  CloneShotVideoFailureBreakdown,
  CloneShotVideoSubmissionAuditLog,
} from './types'
import type { MediaAsset, Product, ProductCanonicalSourceDiagnostic } from '../products/types'
import { queryGrsCredits } from './grsai'
import { cleanAiText, extractJsonObjectText, extractModelMessageContent } from './aiResponse'
import { downloadAtlasToFile } from './atlasRetry'
import { promptConsistencyService } from './prompt-consistency/service'
import { createCloneProjectWorkspaceService } from './projectWorkspace'
import { createCloneProductBindingService } from './productBinding'
import { createCloneStoryboardGridWorkflow } from './storyboardGridWorkflow'

const SHOT_IMAGE_PROMPT_PREVIEW_SENTINEL = 'shot-image-prompt-2026-05-23-product-analysis-refresh-v10'
const SHOT_VIDEO_PROMPT_PREVIEW_SENTINEL = 'shot-video-prompt-2026-05-23-rollback-fused-v7'
const storyboardVideoReconcileInFlight = new Set<string>()
const storyboardVideoReconcilePending = new Set<string>()
const shotVideoSyncInFlight = new Map<string, Promise<void>>()
const shotVideoCreateInFlight = new Map<string, Promise<CloneProject>>()
const autoRunStoryboardVideosInFlight = new Map<string, Promise<any>>()
const storyboardBatchVideoGenerationInFlight = new Map<string, Promise<any>>()
const SHOT_VIDEO_SUBMISSION_LOCK_MS = 2 * 60 * 1000
const SHOT_VIDEO_MISSING_TASK_GRACE_MS = 10 * 60 * 1000
const SHOT_VIDEO_RECONCILE_RETRY_DELAY_MS = 5_000
const shotVideoOrchestrator = createShotVideoOrchestrator()
let storyboardVideoReconcileTimer: NodeJS.Timeout | null = null

function now() {
  return Date.now()
}

function isShotVideoSubmitStartedEvent(value: unknown) {
  const event = String(value ?? '').trim()
  return (
    event === 'segment_submit_started' ||
    event === 'storyboard_video_batch_submit_started' ||
    event === 'segment_submit_missing_task'
  )
}

function isShotVideoMissingTaskGraceActive(output: Partial<CloneShotVideoOutput> | undefined, currentTime = now()) {
  if (!output) return false
  const sourceEvent = String(output.sourceEvent || '').trim()
  if (sourceEvent !== 'segment_submit_missing_task' && sourceEvent !== 'segment_submit_started') return false
  const submissionStartedAt = Number(output.submissionStartedAt ?? 0)
  if (!submissionStartedAt) return false
  return currentTime - submissionStartedAt < SHOT_VIDEO_MISSING_TASK_GRACE_MS
}

function sanitizeLegacyShotPromptText(value: unknown, productType?: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const normalizedType = String(productType || '').trim().toLowerCase()
  const earringLike =
    /earrings?/.test(normalizedType) ||
    /silver hoop earring|star-shaped dangles|drop earring|dangle earring|ear wearing|ear jewelry|zircon|stud earring/i.test(text)
  if (!earringLike) return text
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/TEXT PRODUCT DESCRIPTION LOCK/i.test(line))
    .filter((line) => !/^Subject:/i.test(line))
    .filter((line) => !/camera presence|Chinese-speaking social-commerce expression style|calm confident expression|presenter|host-style|spokesperson|talking-head/i.test(line))
    .filter((line) => !/silver hoop earring|star-shaped dangles|drop earring|dangle earring/i.test(line))
    .map((line) =>
      /Preserve original storyboard\/reference scene:/i.test(line)
        ? 'Preserve original storyboard/reference scene: Extreme close-up of ear wearing the earring.'
        : line,
    )
  return lines.join('\n').trim()
}

function inferEarringLikePromptTarget(input: {
  productType?: unknown
  visualDescription?: unknown
  generationPrompt?: unknown
  actionDescription?: unknown
  productFocus?: unknown
  materialNeed?: unknown
  productIdentityText?: unknown
}) {
  const haystack = [
    input.productType,
    input.visualDescription,
    input.generationPrompt,
    input.actionDescription,
    input.productFocus,
    input.materialNeed,
    input.productIdentityText,
  ]
    .map((item) => String(item || '').toLowerCase())
    .join('\n')
  return /earrings?|earring|ear jewelry|jewelry|jewellery|ear\s|hoop|dangle|drop earring|stud|silver|gold|zircon|star-shaped dangles/.test(
    haystack,
  )
}

function resolveProjectIdentityGridProductType(project: CloneProject, fallback?: CloneProductType) {
  const candidates = [
    fallback,
    project.boundProductSnapshot?.productAnalysis?.category,
    project.boundProductSnapshot?.type,
    project.baseBlueprint?.productCategory,
    project.blueprint?.productCategory,
    project.baseBlueprint?.category,
    project.blueprint?.category,
    project.title,
  ]
  for (const item of candidates) {
    const normalized = normalizeProductType(item as any)
    if (normalized !== 'general') return normalized
  }
  const shotLike = project.blueprint?.shots?.find((shot) =>
    inferEarringLikePromptTarget({
      productType: shot.productType,
      visualDescription: shot.visualDescription,
      generationPrompt: shot.generationPrompt,
      actionDescription: shot.actionDescription,
      productFocus: shot.productFocus,
      materialNeed: shot.materialNeed,
      productIdentityText: shot.productIdentityText,
    }),
  )
  if (shotLike) return 'earrings'
  return normalizeProductType(fallback)
}

function shotVideoSyncKey(projectId: string, shotId: string, action: 'sync' | 'download') {
  return `${action}:${String(projectId || '').trim()}:${String(shotId || '').trim()}`
}

function shotVideoCreateKey(projectId: string, shotId: string) {
  return `submit:${String(projectId || '').trim()}:${String(shotId || '').trim()}`
}

function autoRunStoryboardVideosKey(projectId: string) {
  return `autorun-storyboard-videos:${String(projectId || '').trim()}`
}

function storyboardBatchVideoGenerationKey(projectId: string) {
  return `storyboard-video-batch:${String(projectId || '').trim()}`
}

function canStartBackgroundAutoRun(project: CloneProject) {
  if (project.runMode !== 'auto') return false
  if (!String(project.referenceVideoPath || '').trim()) return false
  if (!project.baseBlueprint?.shots?.length) return false
  if (!collectProjectProductReferenceImages(project).length) return false
  if (!String(project.selectedModelIdentitySnapshot?.id || '').trim()) return false
  return true
}

async function dispatchBackgroundAutoRunIfReady(service: any, projectId: string, reason: string) {
  const latest = await cloneRepo.getProject(projectId)
  if (!latest || !canStartBackgroundAutoRun(latest)) return
  const productReferenceImagePaths = [...collectProjectProductReferenceImages(latest)]
  const selectedModelIdentityId = String(latest.selectedModelIdentitySnapshot?.id || latest.selectedModelIdentityId || '').trim() || undefined
  console.log('[clone-debug] background-auto-run:ready', {
    cloneProjectId: latest.id,
    reason,
    productReferenceCount: productReferenceImagePaths.length,
    selectedModelIdentityId,
  })
  void service.autoRunCloneToStoryboardVideos({
    cloneProjectId: latest.id,
    variantCount: 3,
    productReferenceImagePaths,
    selectedModelIdentityId,
    autoBindModelPack: false,
  }).catch(async (error: any) => {
    const retryLatest = await cloneRepo.getProject(latest.id)
    if (!retryLatest) return
    const message = String(error?.message ?? error ?? '自动后台续跑失败').trim() || '自动后台续跑失败'
    retryLatest.lastError = message
        setAutoFlowStage(retryLatest, 'script_generation', 'failed', message)
    await cloneRepo.upsertProject(retryLatest)
    console.error('[clone-debug] background-auto-run:failed', {
      cloneProjectId: latest.id,
      reason,
      message,
    })
  })
}

function dispatchShotVideoBackgroundSync(input: {
  projectId: string
  shotId: string
  action: 'sync' | 'download'
}) {
  const key = shotVideoSyncKey(input.projectId, input.shotId, input.action)
  const existing = shotVideoSyncInFlight.get(key)
  if (existing) return existing
  const task = (async () => {
    const currentProject = await cloneRepo.getProject(input.projectId)
    if (!currentProject?.blueprint) return
    ensureCloneFlowState(currentProject)
    const currentShot = currentProject.blueprint.shots.find((item) => item.id === input.shotId)
    if (!currentShot) return
    await continueShotVideoResultFlow({
      project: currentProject,
      shot: currentShot,
      allowFailed: true,
    })
    await refreshGenerationQueueRuntime(input.projectId)
  })()
    .catch((error) => {
      console.warn('[clone-debug] shot-video-background-sync:failed', {
        projectId: input.projectId,
        shotId: input.shotId,
        action: input.action,
        message: String((error as any)?.message ?? error ?? ''),
      })
    })
    .finally(() => {
      shotVideoSyncInFlight.delete(key)
    })
  shotVideoSyncInFlight.set(key, task)
  return task
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function ensureUniqueExportPath(outputDir: string, preferredName: string) {
  const safeName = String(preferredName || 'final.mp4').trim() || 'final.mp4'
  const extIndex = safeName.lastIndexOf('.')
  const baseName = extIndex > 0 ? safeName.slice(0, extIndex) : safeName
  const extName = extIndex > 0 ? safeName.slice(extIndex) : ''
  let candidate = join(outputDir, safeName)
  let cursor = 1
  while (await fileExists(candidate)) {
    candidate = join(outputDir, `${baseName}_${String(cursor).padStart(2, '0')}${extName}`)
    cursor += 1
  }
  return candidate
}

function normalizeVideoShotStatus(value: unknown) {
  const status = String(value ?? '').trim().toLowerCase()
  if (status === 'success' || status === 'completed') return 'done'
  if (
    status === 'done' ||
    status === 'submitting' ||
    status === 'remote_pending' ||
    status === 'remote_succeeded_pending_download' ||
    status === 'failed_retryable' ||
    status === 'failed_terminal' ||
    status === 'failed' ||
    status === 'pending' ||
    status === 'generating' ||
    status === 'idle' ||
    status === 'creating' ||
    status === 'remote_running' ||
    status === 'polling_timeout' ||
    status === 'downloading'
  )
    return status
  return 'pending'
}

function hasPendingRemoteStoryboardVideoWork(project: CloneProject) {
  const shots = projectBlueprintShots(project)
  return shots.some((shot) => {
    const output = resolveShotVideoOutput(project, shot)
    if (String(output.videoPath || output.localPath || shot.generatedClipPath || '').trim()) return false
    const status = String(output.status || '').trim().toLowerCase()
    const taskId = resolveEffectiveVideoTaskId(output.taskId, shot.generatedTaskId)
    const retryCount = Number(output.retryCount ?? shot.retryCount ?? 0)
    const failureType = classifyShotVideoFailure({
      status: output.status,
      taskId: taskId || undefined,
      error: output.error || shot.error,
      videoUrl: output.videoUrl,
    })
    const pendingRemoteState = resolvePendingRemoteState(output.remoteStatus, output.remoteRaw)
    if (status === 'remote_succeeded_pending_download' || status === 'downloading') {
      return Boolean(String(output.videoUrl || '').trim()) || Boolean(taskId)
    }
    if (
      status === 'idle' ||
      status === 'remote_running' ||
      status === 'remote_pending' ||
      status === 'submitting' ||
      status === 'failed_retryable'
    ) {
      if (status === 'failed_retryable' && hasReachedShotVideoRetryLimit(retryCount)) return false
      return Boolean(taskId)
    }
    if (
      status === 'failed_terminal' &&
      failureType === 'missing_task' &&
      pendingRemoteState &&
      isShotVideoSubmitStartedEvent(output.sourceEvent)
    ) {
      return true
    }
    return false
  })
}

function shouldKeepStoryboardVideoAutoRecoveryRunning(project: CloneProject) {
  if (!project?.blueprint) return false
  if (hasPendingRemoteStoryboardVideoWork(project)) return true
  const autoFlow = ensureAutoFlowStatus(project)
  return autoFlow.status === 'running' && autoFlow.currentStage === 'storyboard_videos'
}

function isCompletedVideoShotStatus(value: unknown) {
  return ['done', 'success', 'completed'].includes(String(value ?? '').trim().toLowerCase())
}

function pendingRemoteStateFromStatus(status: unknown) {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (!normalized) return ''
  if (['created', 'queued', 'pending', 'submitted'].includes(normalized)) return 'remote_pending'
  if (['processing', 'running', 'in_progress', 'in-progress'].includes(normalized)) return 'remote_running'
  return ''
}

function resolvePendingRemoteState(remoteStatus?: unknown, remoteRaw?: any) {
  return (
    pendingRemoteStateFromStatus(remoteStatus) ||
    pendingRemoteStateFromStatus(remoteRaw?.status) ||
    pendingRemoteStateFromStatus(remoteRaw?.data?.status) ||
    ''
  )
}

function pickRecoverableTaskHandle(raw: any) {
  const directDataValue =
    typeof raw?.data === 'string' || typeof raw?.data === 'number'
      ? String(raw.data).trim()
      : ''
  const candidates = [
    directDataValue,
    raw?.data?.task_uuid,
    raw?.data?.taskUuid,
    raw?.data?.task_id,
    raw?.data?.taskId,
    raw?.data?.task?.uuid,
    raw?.data?.task?.id,
    raw?.data?.task?.task_id,
    raw?.data?.task?.taskId,
    raw?.data?.record_id,
    raw?.data?.recordId,
    raw?.data?.uuid,
    raw?.data?.trace_id,
    raw?.data?.traceId,
    raw?.data?.job_id,
    raw?.data?.jobId,
    raw?.data?.prediction_id,
    raw?.data?.predictionId,
    raw?.data?.prediction?.uuid,
    raw?.data?.prediction?.id,
    raw?.data?.prediction?.task_id,
    raw?.data?.prediction?.taskId,
    raw?.data?.result?.uuid,
    raw?.data?.result?.id,
    raw?.data?.result?.task_id,
    raw?.data?.result?.taskId,
    raw?.data?.video_id,
    raw?.data?.videoId,
    raw?.data?.request_id,
    raw?.data?.requestId,
    raw?.data?.id,
    raw?.task?.uuid,
    raw?.task?.id,
    raw?.task?.task_id,
    raw?.task?.taskId,
    raw?.record_id,
    raw?.recordId,
    raw?.trace_id,
    raw?.traceId,
    raw?.job_id,
    raw?.jobId,
    raw?.prediction_id,
    raw?.predictionId,
    raw?.prediction?.uuid,
    raw?.prediction?.id,
    raw?.prediction?.task_id,
    raw?.prediction?.taskId,
    raw?.result?.uuid,
    raw?.result?.id,
    raw?.result?.task_id,
    raw?.result?.taskId,
    raw?.video_id,
    raw?.videoId,
    raw?.task_id,
    raw?.taskId,
    raw?.request_id,
    raw?.requestId,
    raw?.uuid,
    raw?.id,
  ]
  for (const candidate of candidates) {
    const taskHandle = String(candidate ?? '').trim()
    if (taskHandle) return taskHandle
  }
  return ''
}

function isShotVideoLocalPreconditionError(error: unknown) {
  const message = String(error ?? '').trim()
  if (!message) return false
  return (
    message.includes('[未提交视频模型请求]') ||
    message.includes('请先上传产品参考图') ||
    message.includes('填写产品锁定信息') ||
    message.includes('缺少首帧') ||
    message.includes('缺少尾帧') ||
    message.includes('高质量模式缺少尾帧')
  )
}

const AUTO_CLONE_IMAGE_RETRY_LIMIT = 2

type GenerateGptShotFramesInput = {
  cloneProjectId: string
  shotId: string
  which?: 'start' | 'end' | 'both'
  forceRegenerate?: boolean
  selectedModelIdentityId?: string
  productReferenceImagePaths?: string[]
  imageProviderPrimary?: ImageProviderName
  openaiApiKey?: string
  openaiImageModel?: string
  openaiImageQuality?: 'low' | 'medium' | 'high'
  klingApiKey?: string
  klingHost?: string
  klingImageModel?: string
  grsaiApiKey?: string
  grsaiHost?: string
  grsaiImageModel?: string
  imageProviderCredentials?: Partial<ModelCredentials>
}
const AUTO_CLONE_VIDEO_RETRY_LIMIT = 2
const AUTO_CLONE_VIDEO_IDLE_HEARTBEAT_THRESHOLD = 3

function ensureAutoFlowStatus(project: CloneProject) {
  project.autoFlowStatus ??= {
    enabled: false,
    targetStage: 'final_compose',
    status: 'idle',
    imageRetryLimit: AUTO_CLONE_IMAGE_RETRY_LIMIT,
    videoRetryLimit: AUTO_CLONE_VIDEO_RETRY_LIMIT,
  }
  if (!project.autoFlowStatus.imageRetryLimit) project.autoFlowStatus.imageRetryLimit = AUTO_CLONE_IMAGE_RETRY_LIMIT
  if (!project.autoFlowStatus.videoRetryLimit) project.autoFlowStatus.videoRetryLimit = AUTO_CLONE_VIDEO_RETRY_LIMIT
  return project.autoFlowStatus
}

function setAutoFlowStage(
  project: CloneProject,
  stage: NonNullable<CloneProject['autoFlowStatus']>['currentStage'],
  status?: NonNullable<CloneProject['autoFlowStatus']>['status'],
  summary?: string,
) {
  const autoFlow = ensureAutoFlowStatus(project)
  autoFlow.enabled = true
  autoFlow.targetStage = project.runMode === 'auto' ? 'final_compose' : 'storyboard_videos'
  autoFlow.currentStage = stage
  if (status) autoFlow.status = status
  if (summary !== undefined) autoFlow.lastSummary = summary || undefined
  if (status === 'running') autoFlow.lastStartedAt = now()
  if (status === 'done' || status === 'partial_failed' || status === 'failed') autoFlow.lastCompletedAt = now()
}

function shouldContinueAutoStoryboardVideos(project: CloneProject | null | undefined) {
  if (!project?.autoFlowStatus) return false
  if (project.autoFlowStatus.status !== 'running') return false
  if (project.autoFlowStatus.currentStage !== 'storyboard_videos') return false
  const outputs = Array.isArray(project.shotVideoOutputs) ? project.shotVideoOutputs : []
  return outputs.some((item) => {
    const status = String(item.status || '').trim().toLowerCase()
    const pendingRemoteState = resolvePendingRemoteState(item.remoteStatus, item.remoteRaw)
    const failureType = classifyShotVideoFailure({
      status: item.status,
      taskId: item.taskId,
      error: item.error,
      videoUrl: item.videoUrl,
    })
    return !String(item.videoPath || '').trim() && (
      status === 'submitting' ||
      status === 'remote_pending' ||
      status === 'creating' ||
      status === 'generating' ||
      status === 'remote_running' ||
      status === 'remote_succeeded_pending_download' ||
      status === 'downloading' ||
      status === 'failed_retryable' ||
      status === 'polling_timeout' ||
      status === 'failed' ||
      (
        status === 'failed_terminal' &&
        failureType === 'missing_task' &&
        pendingRemoteState &&
        isShotVideoSubmitStartedEvent(item.sourceEvent)
      )
    )
  })
}

function buildAutoStoryboardHeartbeatSignature(input: {
  done: number
  failed: number
  pending: number
  submitActive: number
  pollActive: number
  downloadActive: number
}) {
  return [
    input.done,
    input.failed,
    input.pending,
    input.submitActive,
    input.pollActive,
    input.downloadActive,
  ].join(':')
}

function applyAutoStoryboardHeartbeat(project: CloneProject, input: {
  done: number
  failed: number
  pending: number
  submitActive: number
  pollActive: number
  downloadActive: number
}) {
  const autoFlow = ensureAutoFlowStatus(project)
  const signature = buildAutoStoryboardHeartbeatSignature(input)
  const previousSignature = String(autoFlow.lastProgressSignature || '').trim()
  const changed = previousSignature !== signature
  autoFlow.lastHeartbeatAt = now()
  autoFlow.lastProgressSignature = signature
  if (changed) {
    autoFlow.lastProgressAt = autoFlow.lastHeartbeatAt
    autoFlow.idleHeartbeatCount = 0
  } else {
    autoFlow.idleHeartbeatCount = Number(autoFlow.idleHeartbeatCount ?? 0) + 1
  }
  return {
    changed,
    idleHeartbeatCount: Number(autoFlow.idleHeartbeatCount ?? 0),
    lastProgressAt: autoFlow.lastProgressAt,
    lastHeartbeatAt: autoFlow.lastHeartbeatAt,
  }
}

async function kickAutoStoryboardVideoRecovery(projectId: string) {
  const latest = await cloneRepo.getProject(projectId)
  if (!latest?.blueprint) return latest
  const pendingShots = projectBlueprintShots(latest)
    .filter((shot) => {
      const output = resolveShotVideoOutput(latest, shot)
      if (String(output.videoPath || '').trim()) return false
      return Boolean(resolveEffectiveVideoTaskId(output.taskId, shot.generatedTaskId))
    })
    .sort((a, b) => {
      const aOutput = resolveShotVideoOutput(latest, a)
      const bOutput = resolveShotVideoOutput(latest, b)
      const rank = (status: string) => {
        const normalized = String(status || '').trim().toLowerCase()
        if (normalized === 'downloading') return 0
        if (normalized === 'remote_succeeded_pending_download') return 1
        if (normalized === 'failed_retryable' || normalized === 'polling_timeout') return 2
        if (normalized === 'remote_running' || normalized === 'remote_pending' || normalized === 'submitting' || normalized === 'generating') return 3
        return 4
      }
      const aRank = rank(String(aOutput.status || ''))
      const bRank = rank(String(bOutput.status || ''))
      if (aRank !== bRank) return aRank - bRank
      return Number(a.index || 0) - Number(b.index || 0)
    })
  console.log('[clone-debug] shot-video-auto-recovery:kick', {
    projectId,
    pendingShotIds: pendingShots.slice(0, 6).map((shot) => {
      const output = resolveShotVideoOutput(latest, shot)
      return {
        shotId: shot.id,
        status: output.status,
        taskId: resolveEffectiveVideoTaskId(output.taskId, shot.generatedTaskId) || undefined,
        hasVideoUrl: Boolean(String(output.videoUrl || '').trim()),
      }
    }),
  })
  for (const shot of pendingShots.slice(0, 6)) {
    await ensureShotVideoState(projectId, shot.id, 'recover_if_possible')
  }
  return await refreshGenerationQueueRuntime(projectId)
}

const WORKFLOW_V2_STEPS: CloneWorkflowV2Step[] = [
  'reference_analysis',
  'script_generation',
  'identity_grid',
  'storyboard_design',
  'storyboard_videos',
  'final_compose',
]

function defaultWorkflowV2() {
  const t = now()
  return {
    currentStep: 'reference_analysis' as CloneWorkflowV2Step,
    stepStatus: {
      reference_analysis: { status: 'idle' as const, updatedAt: t },
      script_generation: { status: 'idle' as const, updatedAt: t },
      identity_grid: { status: 'idle' as const, updatedAt: t },
      storyboard_design: { status: 'idle' as const, updatedAt: t },
      storyboard_videos: { status: 'idle' as const, updatedAt: t },
      final_compose: { status: 'idle' as const, updatedAt: t },
    } as Record<CloneWorkflowV2Step, CloneWorkflowV2Status>,
    updatedAt: t,
  }
}

function buildIdentityGridUsagePlan(productType: CloneProductType) {
  if (productType === 'earrings') {
    return [
      'Wear on ear with clear left and right angle coverage',
      'Close-up view of wearing area and metal details',
      'Half-body lifestyle panel with stable model identity',
    ]
  }
  if (productType === 'phone_case') {
    return [
      'Mounted on phone with full back view coverage',
      'Handheld use angle with camera-hole visibility',
      'Lifestyle panel showing natural daily phone usage',
    ]
  }
  if (productType === 'clothes') {
    return [
      'Front, side, and detail views of fit and fabric',
      'Half-body and full-body wear panels',
      'Close-up panel for texture and pattern details',
    ]
  }
  return [
    'Front and angle coverage for reusable product identity',
    'Hand interaction and close-up detail panels',
    'Lifestyle usage panels aligned with the product category',
  ]
}

function patchWorkflowV2(
  project: CloneProject,
  currentStep: CloneWorkflowV2Step,
  step: CloneWorkflowV2Step,
  status: 'idle' | 'running' | 'done' | 'failed',
  error = '',
) {
  const current = project.workflowV2 ?? defaultWorkflowV2()
  const next = {
    ...current,
    currentStep,
    stepStatus: {
      ...current.stepStatus,
      [step]: {
        status,
        error: status === 'failed' ? String(error || '') : '',
        updatedAt: now(),
      },
    },
    updatedAt: now(),
  }
  project.workflowV2 = next
  return next
}

function advanceAutoRunWorkflow(
  project: CloneProject,
  phase: 'script_generation' | 'storyboard_design',
) {
  if (phase === 'script_generation') {
    return patchWorkflowV2(project, 'script_generation', 'script_generation', 'running')
  }
  patchWorkflowV2(project, 'script_generation', 'script_generation', 'done')
  return patchWorkflowV2(project, 'storyboard_design', 'storyboard_design', 'running')
}

function executionBlueprintOf(project: CloneProject): CloneExecutionBlueprint | null {
  return project.executionBlueprint ?? (project.baseBlueprint ? {
    shots: project.baseBlueprint.shots,
    variants: project.baseBlueprint.variants ?? {},
    variantScores: project.baseBlueprint.variantScores ?? {},
    videoPlans: project.baseBlueprint.videoPlans ?? [],
    scriptCandidates: project.baseBlueprint.scriptCandidates ?? [],
    consistencyAssets: project.baseBlueprint.consistencyAssets,
    strategyNotes: project.baseBlueprint.strategyNotes ?? [],
  } : null)
}

function projectShots(project: CloneProject): ShotSpec[] {
  return executionBlueprintOf(project)?.shots ?? []
}

function trimText(value: unknown) {
  return String(value ?? '').trim()
}

function snippetText(value: unknown, limit = 320) {
  return trimText(value).slice(0, limit)
}

function normalizeRunMode(value: unknown): CloneRunMode {
  return value === 'auto' ? 'auto' : 'manual'
}

function inferProjectRunMode(projectLike: any): CloneRunMode {
  if (projectLike?.runMode === 'auto') return 'auto'
  const autoTargetStage = String(projectLike?.autoFlowStatus?.targetStage ?? '').trim()
  if (autoTargetStage === 'final_compose') return 'auto'
  const hasAutoRunSubmitAudit = Array.isArray(projectLike?.generationQueue?.submissionAuditLogs) &&
    projectLike.generationQueue.submissionAuditLogs.some((item: any) => String(item?.trigger ?? '').trim() === 'auto_run_submit')
  if (hasAutoRunSubmitAudit) return 'auto'
  return 'manual'
}

function validateProjectReadyForFinalCompose(project: CloneProject) {
  const shots = project.blueprint?.shots ?? []
  const outputMap = getShotVideoOutputMap(project)
  if (!shots.length) {
    return { ok: false as const, reason: '????????????' }
  }
  const failed = shots.filter((shot) => {
    const shotStatus = String(shot.status || '').toLowerCase()
    const qualityStatus = String(shot.qualityStatus || '').toLowerCase()
    const effective = getEffectiveShotState(shot, outputMap.get(String(shot.id)))
    const hasRenderableClip = Boolean(
      String(shot.uploadedAssetPath || effective.generatedClipPath || effective.outputVideoPath || '').trim(),
    )
    const hasRecoveredRenderableOutput = hasRenderableClip && effective.canEnterRender && qualityStatus !== 'failed'
    const qualityReasons = Array.isArray(shot.qualityReasons)
      ? shot.qualityReasons.map((item) => String(item || '').trim()).filter(Boolean)
      : []
    const onlyDurationMismatch =
      qualityStatus === 'failed' &&
      qualityReasons.length > 0 &&
      qualityReasons.every((reason) => reason.includes('??????')) &&
      hasRenderableClip
    if (hasRecoveredRenderableOutput || onlyDurationMismatch) return false
    return (
      qualityStatus === 'failed' ||
      !effective.canEnterRender ||
      shotStatus === 'failed' ||
      shotStatus === 'polling_timeout' ||
      Boolean(shot.error) ||
      !hasRenderableClip
    )
  })
  if (!failed.length) return { ok: true as const }
  const first = failed[0]
  const firstReason = String(first.error || first.qualityReasons?.join('?') || '???????').trim()
  return {
    ok: false as const,
    reason: `????????${failed.length} ????????????? #${Number(first.index ?? 0) + 1} ${firstReason}`.trim(),
  }
}

function buildErrorContext(input: {
  provider?: string
  model?: string
  endpointStyle?: string
  baseUrl?: string
  requestCapability?: string
  taskId?: string
  responseSnippet?: string
  action?: string
  message?: string
}) {
  return {
    provider: trimText(input.provider) || undefined,
    model: trimText(input.model) || undefined,
    endpointStyle: trimText(input.endpointStyle) || undefined,
    baseUrl: trimText(input.baseUrl) || undefined,
    requestCapability: trimText(input.requestCapability) || undefined,
    taskId: trimText(input.taskId) || undefined,
    responseSnippet: snippetText(input.responseSnippet) || undefined,
    action: trimText(input.action) || undefined,
    message: trimText(input.message) || undefined,
  }
}

function setProjectErrorContext(project: CloneProject, input: Parameters<typeof buildErrorContext>[0] | null) {
  project.lastErrorContext = input ? buildErrorContext(input) : undefined
  return project.lastErrorContext
}

function apifoxContextByCapability(credentials: ModelCredentials, capability: 'chat_completion' | 'image_generate' | 'image_edit' | 'video_image_to_video' | 'video_start_end_to_video' | 'video_reference_to_video' | 'video_text_to_video') {
  const cfg =
    capability === 'chat_completion'
      ? resolveApifoxHubCredentials(credentials, 'chat')
      : capability === 'image_generate' || capability === 'image_edit'
        ? resolveApifoxHubCredentials(credentials, 'image')
        : resolveApifoxHubCredentials(credentials, 'video')
  if (!cfg?.enabled) return {}
  if (capability === 'chat_completion') {
    return {
      provider: 'apifox_hub',
      model: cfg.chatModel,
      endpointStyle: cfg.chatEndpointStyle,
      baseUrl: cfg.baseUrl,
      requestCapability: capability,
    }
  }
  if (capability === 'image_generate' || capability === 'image_edit') {
    return {
      provider: 'apifox_hub',
      model: capability === 'image_edit' ? (cfg.imageEditModel || cfg.imageModel) : cfg.imageModel,
      endpointStyle: cfg.imageEndpointStyle,
      baseUrl: cfg.baseUrl,
      requestCapability: capability,
    }
  }
  return {
    provider: 'apifox_hub',
    model:
      capability === 'video_text_to_video'
        ? cfg.textToVideoModel
        : capability === 'video_image_to_video'
          ? cfg.imageToVideoModel
          : capability === 'video_start_end_to_video'
            ? cfg.startEndVideoModel
            : cfg.referenceVideoModel,
    endpointStyle: cfg.videoEndpointStyle,
    baseUrl: cfg.baseUrl,
    requestCapability: capability,
  }
}

function normalizePipelineErrorContext(
  project: CloneProject,
  errorContext?: ClonePipelineStatus['errorContext'],
): ClonePipelineStatus['errorContext'] {
  if (!errorContext) return undefined
  const capability = String(errorContext.requestCapability || '').trim().toLowerCase()
  const taskId = String(errorContext.taskId || '').trim()
  if (!capability.startsWith('video_') || !taskId) return errorContext
  const outputs = project.shotVideoOutputs ?? []
  const hasActiveTask = outputs.some((item) => String(item.taskId || '').trim() === taskId)
  if (hasActiveTask) return errorContext
  const hasShotTask = (project.blueprint?.shots ?? []).some((item) => String(item.generatedTaskId || '').trim() === taskId)
  if (hasShotTask) return errorContext
  return undefined
}

function pipelineStatusFromProject(project: CloneProject, errorContext?: ClonePipelineStatus['errorContext']): ClonePipelineStatus {
  const workflowStep = project.workflowV2?.currentStep ?? 'reference_analysis'
  const providerSummary = summarizeProjectProviders(project)
  return {
    workflowStep,
    previewPipeline: project.previewPipeline,
    activeProviderSummary: providerSummary.activeProviderSummary,
    activeModelSummary: providerSummary.activeModelSummary,
    configuredProviderSummary: providerSummary.configuredProviderSummary,
    errorContext: normalizePipelineErrorContext(project, errorContext ?? project.lastErrorContext),
  }
}

function summarizeProjectProviders(project: CloneProject) {
  const credentials = cloneRepo.getCredentialsSync()
  const videoProvider = project.policy?.fallbackChain?.[0] ?? videoProviderChain(credentials)[0] ?? 'seedance'
  const imageProvider = project.baseBlueprint?.consistencyAssets?.provider === 'ai666'
    ? ('apifox_hub' as ImageProviderName)
    : 'openai'
  const videoModel = project.shotVideoOutputs?.find((item) => item.model)?.model
    || project.baseBlueprint?.shots.find((item) => item.generatedModel)?.generatedModel
    || project.finalCompose?.outputPath
    || ''
  const imageModel = project.storyboardGridBatches?.find((item) => item.model)?.model
    || project.selectedModelIdentitySnapshot?.model
    || ''
  const scriptModel = project.scriptVariantCandidates?.length
    ? 'script-variant-pipeline'
    : String(project.baseBlueprint?.globalScript?.language ?? '')
  const configuredVideoProvider = videoProviderChain(credentials)[0] ?? 'seedance'
  const configuredVideoModel = videoProviderModel(credentials)
  const configuredImageProvider = generatedImageProvider(credentials)
  const configuredImageModel = imageProviderModel(credentials)
  const configuredScriptProvider = credentials.chatProviderPrimary === 'apifox_hub' ? 'apifox_hub' : 'grsai'
  const configuredScriptModel = configuredScriptProvider === 'apifox_hub'
    ? String(resolveApifoxHubCredentials(credentials, 'chat')?.chatModel ?? '').trim()
    : String(credentials.grsaiAnalysisModel ?? '').trim()
  return {
    activeProviderSummary: {
      video: {
        provider: videoProvider,
        model: String(videoModel || ''),
      },
      image: {
        provider: imageProvider,
        model: String(imageModel || ''),
      },
      script: {
        provider: project.lastErrorContext?.provider && project.lastErrorContext.requestCapability === 'chat_completion'
          ? project.lastErrorContext.provider
          : 'grsai',
        model: String(scriptModel || ''),
      },
    },
    activeModelSummary: {
      video: String(videoModel || ''),
      image: String(imageModel || ''),
      script: String(scriptModel || ''),
    },
    configuredProviderSummary: {
      video: {
        provider: configuredVideoProvider,
        model: String(configuredVideoModel || ''),
      },
      image: {
        provider: configuredImageProvider,
        model: String(configuredImageModel || ''),
      },
      script: {
        provider: configuredScriptProvider,
        model: String(configuredScriptModel || ''),
      },
    },
  }
}

function syncProjectBlueprintLayers(project: CloneProject) {
  const execution = executionBlueprintOf(project)
  if (execution) {
    project.executionBlueprint = execution
  }
  if (project.baseBlueprint && execution) {
    project.baseBlueprint = {
      ...project.baseBlueprint,
      shots: execution.shots,
      variants: execution.variants,
      variantScores: execution.variantScores,
      videoPlans: execution.videoPlans,
      scriptCandidates: execution.scriptCandidates,
      consistencyAssets: execution.consistencyAssets,
      strategyNotes: execution.strategyNotes,
    }
  }
  if (project.blueprint) {
    project.blueprint = {
      ...project.blueprint,
      storyBeats:
        project.blueprint.storyBeats?.length
          ? project.blueprint.storyBeats
          : projectShots(project).map((shot) => ({
              id: shot.id,
              start: Number(shot.startSec ?? 0),
              end: Number(shot.endSec ?? Number(shot.startSec ?? 0) + Number(shot.durationSec ?? 0)),
              purpose:
                shot.scriptRole === 'hook'
                  ? 'hook'
                  : shot.scriptRole === 'pain_point'
                    ? 'problem'
                    : shot.scriptRole === 'proof'
                      ? 'proof'
                      : shot.scriptRole === 'offer'
                        ? 'offer'
                        : shot.scriptRole === 'cta'
                          ? 'cta'
                          : shot.scriptRole === 'detail'
                            ? 'benefit'
                            : 'demo',
              shotType: String(shot.shotType ?? shot.cloneClass ?? shot.visualType ?? 'other'),
              productRole: String(shot.shotRole ?? shot.role ?? shot.scriptRole ?? 'demo'),
              riskLevel: shot.realismRisk === 'high' ? 'high' : shot.realismRisk === 'medium' ? 'medium' : 'low',
              recommendedMaterialType: shot.uploadedAssetPath ? 'real' : shot.aiEnabled ? 'ai' : 'mixed',
            })),
      updatedAt: new Date().toISOString(),
    }
  }
  return project
}

function buildScriptCandidatesFromBlueprint(project: CloneProject): CloneScriptCandidate[] {
  const bp = project.baseBlueprint ?? project.blueprint
  const shots = bp?.shots ?? []
  const hook = shots.find((s) => s.scriptRole === 'hook')?.scriptText || bp?.globalScript?.hook || ''
  const cta = shots.find((s) => s.scriptRole === 'cta')?.scriptText || bp?.globalScript?.cta || ''
  const summary = bp?.globalScript?.summary || bp?.videoSummary || '基于爆款节奏生成'
  const base = [
    {
      id: randomUUID(),
      summary: `高留存版：${summary}`.slice(0, 220),
      score: 9.1,
      reason: '优先强化前3秒钩子和情绪对比',
      shotPlanRef: `Hook: ${hook || '快速痛点切入'} | CTA: ${cta || '立即行动'}`,
      selected: true,
    },
    {
      id: randomUUID(),
      summary: `高转化版：${summary}`.slice(0, 220),
      score: 8.8,
      reason: '优先展示产品细节与使用结果',
      shotPlanRef: '结构：痛点 -> 展示 -> 细节 -> 证据 -> 行动',
      selected: true,
    },
    {
      id: randomUUID(),
      summary: `低重复版：${summary}`.slice(0, 220),
      score: 8.5,
      reason: '增强场景和镜头差异，降低重复风险',
      shotPlanRef: '结构：场景差异化 -> 产品近景 -> 对比展示 -> 收口',
      selected: true,
    },
  ] satisfies CloneScriptCandidate[]
  return base
}

function uniqueTags(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((item) => String(item || '').trim()).filter(Boolean)))
}

function createLocalShotVariants(shot: ShotSpec, variantsPerShot: number): ShotVariant[] {
  const total = Math.max(1, Math.min(6, Math.floor(Number(variantsPerShot) || 3)))
  const baseScript = String(shot.scriptText || shot.generationPrompt || shot.visualDescription || '').trim()
  const baseVisual = String(shot.visualDescription || shot.visual || '').trim()
  const baseAction = String(shot.actionDescription || shot.action || '').trim()
  const baseCamera = String(shot.cameraDescription || shot.cameraMovement || '').trim()
  const baseFocus = String(shot.productFocus || shot.materialNeed || '').trim()
  const presets: Array<{
    styleType: ShotVariant['styleType']
    tag: string
    scriptSuffix: string
    visualPrefix: string
    actionPrefix: string
    cameraPrefix: string
  }> = [
    {
      styleType: 'real_person',
      tag: 'high-retention',
      scriptSuffix: '前3秒直接抛出痛点与结果反差，语气更像真实带货口播。',
      visualPrefix: '真实生活场景中的人物带货镜头，',
      actionPrefix: '人物自然演示产品并快速给出结果反馈，',
      cameraPrefix: '手机手持近景快速切入，',
    },
    {
      styleType: 'product_closeup',
      tag: 'high-conversion',
      scriptSuffix: '增加产品细节、材质、使用结果和购买理由。',
      visualPrefix: '产品特写与细节展示镜头，',
      actionPrefix: '突出佩戴、触摸、开合或使用动作，',
      cameraPrefix: '微距推近与平稳移动镜头，',
    },
    {
      styleType: 'aesthetic',
      tag: 'anti-duplicate',
      scriptSuffix: '保留卖点不变，但换成更强场景氛围和视觉差异。',
      visualPrefix: '更强氛围感与高级感的商业短视频画面，',
      actionPrefix: '动作更克制，突出氛围、质感和使用瞬间，',
      cameraPrefix: '更有层次的构图与轻运动镜头，',
    },
    {
      styleType: 'no_person',
      tag: 'product-only',
      scriptSuffix: '弱化人物，强调产品本身、材质、细节和场景关系。',
      visualPrefix: '弱人物或无人空镜商品展示画面，',
      actionPrefix: '通过转动、摆放、局部细节展示卖点，',
      cameraPrefix: '稳定近景与产品转场镜头，',
    },
  ]
  return presets.slice(0, total).map((preset, index) => {
    const scriptText = `${baseScript} ${preset.scriptSuffix}`.trim()
    const visualDescription = `${preset.visualPrefix}${baseVisual}`.trim()
    const actionDescription = `${preset.actionPrefix}${baseAction}`.trim()
    const cameraDescription = `${preset.cameraPrefix}${baseCamera}`.trim()
    const generationPrompt = [
      visualDescription,
      actionDescription,
      cameraDescription,
      `Product focus: ${baseFocus || 'clear product visibility and authentic ecommerce presentation'}.`,
      'Commercial short-video realism, no watermark, no subtitles, no UI, no logo, 9:16 vertical frame.',
    ].join(' ')
    return {
      id: randomUUID(),
      shotId: shot.id,
      scriptRole: shot.scriptRole,
      styleType: preset.styleType,
      scriptText,
      visualDescription,
      sceneDescription: String(shot.sceneDescription?.location || shot.sceneDescription?.background || '').trim(),
      actionDescription,
      cameraDescription,
      productDisplay: baseFocus,
      textOverlay: {
        content: String(shot.textOverlay?.content || shot.onScreenText || '').trim(),
        position: String(shot.textOverlay?.position || 'center').trim(),
        fontSize: String(shot.textOverlay?.fontSize || 'medium').trim(),
        style: String(shot.textOverlay?.style || 'clean').trim(),
      },
      generationPrompt,
      negativePrompt: String(shot.negativePrompt || 'blurry, fake hands, broken product, watermark, subtitle, logo, UI').trim(),
      variationTags: uniqueTags([preset.tag, shot.scriptRole, shot.shotType, shot.realismStyle]),
      isSelected: index === 0,
      createdAt: now() + index,
    }
  })
}

function createLocalVariantScores(shot: ShotSpec, variants: ShotVariant[]): ShotVariantScore[] {
  return variants.map((variant, index) => {
    const base =
      variant.styleType === 'real_person'
        ? { hook: 8.9, engagement: 8.8, conversion: 8.4, gmv: 8.4, realism: 8.7, duplicate: 4.1 }
        : variant.styleType === 'product_closeup'
          ? { hook: 8.1, engagement: 8.0, conversion: 9.1, gmv: 8.9, realism: 8.5, duplicate: 4.4 }
          : variant.styleType === 'aesthetic'
            ? { hook: 7.8, engagement: 8.4, conversion: 8.0, gmv: 7.9, realism: 8.2, duplicate: 3.2 }
            : { hook: 7.6, engagement: 7.5, conversion: 8.5, gmv: 8.2, realism: 8.4, duplicate: 3.5 }
    const totalScore = Number(
      (
        0.25 * base.hook +
        0.15 * base.engagement +
        0.3 * base.conversion +
        0.2 * base.gmv +
        0.1 * base.realism -
        0.15 * base.duplicate
      ).toFixed(2),
    )
    return {
      variantId: variant.id,
      hookScore: base.hook,
      engagementScore: base.engagement,
      conversionScore: base.conversion,
      gmvScore: base.gmv,
      realismScore: base.realism,
      duplicateRiskScore: base.duplicate,
      totalScore,
      reason:
        index === 0
          ? `本地兜底候选：优先保留 ${shot.scriptRole || '原始'} 分镜的卖点结构，并增强前3秒和真实感。`
          : `本地兜底候选：保留原始卖点逻辑，改变镜头风格与画面组织，避免整片空白。`,
      suggestion:
        variant.styleType === 'product_closeup'
          ? '适合强调细节、材质和转化展示。'
          : variant.styleType === 'no_person'
            ? '适合弱人物镜头或高频商品展示。'
            : '适合继续生成并观察转化效果。',
    }
  })
}

const SCRIPT_VARIANT_BANNED_PATTERNS = [
  /\bturn(?:s|ing)?\b/i,
  /\brotate(?:s|d|ing)?\b/i,
  /\bswing(?:s|ing)?\b/i,
  /\bshake(?:s|n|ing)?\b/i,
  /\btouch(?:es|ed|ing)?\b/i,
  /\bhold(?:s|ing)?\b/i,
  /\bwear(?:s|ing)?\b/i,
  /\breveal(?:s|ed|ing)?\b/i,
  /\bhidden parts?\b/i,
  /\binside\b/i,
  /\bback side\b/i,
  /\bstructure\b/i,
  /\bhinged?\b/i,
  /\bcurved post\b/i,
  /\bshine(?:s|d|ing)?\b/i,
  /\bglow(?:s|ed|ing)?\b/i,
  /\bsparkle(?:s|d|ing)?\b/i,
  /\bhighlight(?:s|ed|ing)?\b/i,
  /\bluxury\b/i,
  /\bbeautiful\b/i,
  /\bpremium\b/i,
  /\bstunning\b/i,
]

const SCRIPT_VARIANT_SAFE_FALLBACKS = [
  'Close-up shot of the earring.',
  'Camera slowly zooms in.',
  'No angle change.',
].join(' ')

function sanitizeSafeVariantText(value: unknown, fallback = SCRIPT_VARIANT_SAFE_FALLBACKS) {
  let text = keepEnglishLikeText(String(value || '').replace(/\s+/g, ' ').trim(), '').trim()
  if (!text) return fallback
  text = text
    .replace(/\bmodel turns? head\b/gi, '')
    .replace(/\bshow product details\b/gi, 'camera slowly zooms in')
    .replace(/\bearring shines\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  for (const pattern of SCRIPT_VARIANT_BANNED_PATTERNS) {
    text = text.replace(pattern, '').replace(/\s+/g, ' ').trim()
  }
  return text || fallback
}

function scriptVariantSafetyPenalty(input: {
  scriptText?: string
  visualDescription?: string
  actionDescription?: string
  cameraDescription?: string
}) {
  const text = [
    input.scriptText,
    input.visualDescription,
    input.actionDescription,
    input.cameraDescription,
  ].map((item) => keepEnglishLikeText(item || '', '').toLowerCase()).join(' ')
  let penalty = 0
  for (const pattern of SCRIPT_VARIANT_BANNED_PATTERNS) {
    if (pattern.test(text)) penalty += 2.5
  }
  if (!/\b(zoom|pan|static|close-?up|focus|centered|camera|framing)\b/i.test(text)) penalty += 2
  return Number(penalty.toFixed(2))
}

function sanitizeVariantShotScriptRow<T extends {
  scriptText: string
  visualDescription: string
  actionDescription: string
  cameraDescription: string
  generationPrompt: string
}>(row: T): T {
  const scriptText = sanitizeSafeVariantText(row.scriptText)
  const visualDescription = 'Keep the exact reference composition.'
  const actionDescription = 'No subject motion.'
  const cameraDescription = sanitizeSafeVariantText(row.cameraDescription, 'Slow stable camera movement.')
  return {
    ...row,
    scriptText,
    visualDescription,
    actionDescription,
    cameraDescription,
    generationPrompt: [
      'Only camera movement is allowed.',
      'No subject movement.',
      'No product motion.',
      'No interaction.',
      scriptText,
      visualDescription,
      cameraDescription,
    ].join(' '),
  }
}

function applyScriptVariantSafetyToCandidate(candidate: CloneScriptVariantCandidate) {
  const shotScripts = (candidate.shotScripts ?? []).map((row) => sanitizeVariantShotScriptRow(row))
  const penalty = shotScripts.reduce((sum, row) => sum + scriptVariantSafetyPenalty(row), 0)
  return {
    ...candidate,
    shotScripts,
    score: Number(Math.max(0, Number(candidate.score || 0) - penalty).toFixed(2)),
    summary: String(candidate.summary || '').trim() || shotScripts.map((row) => row.scriptText).filter(Boolean).slice(0, 3).join(' / ').slice(0, 220),
    fullScript: shotScripts
      .slice()
      .sort((a, b) => Number(a.shotIndex || 0) - Number(b.shotIndex || 0))
      .map((row, rowIndex) => `#${rowIndex + 1} ${row.scriptRole || 'unknown'}\n${String(row.scriptText || '').trim()}`)
      .join('\n\n'),
    reason: [String(candidate.reason || '').trim(), penalty > 0 ? `Safety penalty ${penalty.toFixed(2)}` : 'Safety cleared'].filter(Boolean).join(' | '),
  }
}

function ensureProjectTitle(project: CloneProject) {
  const title = String(project.title || '').trim()
  if (title) return title
  const referenceTitle = String(project.referenceVideoName || '').trim().replace(/\.[^.]+$/, '')
  const blueprintTitle = String(project.blueprint?.title || project.baseBlueprint?.title || '').trim()
  return blueprintTitle || referenceTitle || '未命名项目'
}

function computeProjectProgress(project: CloneProject) {
  const step = project.workflowV2?.currentStep ?? 'reference_analysis'
  const order: CloneWorkflowV2Step[] = [
    'reference_analysis',
    'script_generation',
    'identity_grid',
    'storyboard_design',
    'storyboard_videos',
    'final_compose',
  ]
  const index = Math.max(0, order.indexOf(step))
  const base = Math.round(((index + 1) / order.length) * 100)
  if (project.finalCompose?.outputPath) return 100
  if (project.shotVideoOutputs?.some((item) => item.videoPath)) return Math.max(base, 82)
  if (project.storyboardFrames?.some((item) => item.imagePath)) return Math.max(base, 64)
  if (String(project.projectIdentityGridPath || '').trim()) return Math.max(base, 52)
  if (project.selectedScriptVariantId) return Math.max(base, 36)
  if (project.blueprint?.shots?.length) return Math.max(base, 24)
  return Math.max(base, project.referenceVideoPath ? 8 : 0)
}

function buildProjectSummary(project: CloneProject): CloneProjectSummary {
  const selectedModelIdentityName =
    String(project.selectedModelIdentitySnapshot?.name || '').trim() ||
    String(project.selectedModelIdentityPackId || '').trim()
  const shotCount = project.blueprint?.shots?.length ?? project.baseBlueprint?.shots?.length ?? 0
  const generatedImageCount = (project.storyboardFrames ?? []).filter((item) => Boolean(item.imagePath)).length
  const generatedVideoCount = (project.shotVideoOutputs ?? []).filter((item) => Boolean(item.videoPath)).length
  const productReferenceImagePaths = Array.from(
    new Set(
      [
        ...(project.blueprint?.consistencyAssets?.productReferenceImages ?? []),
        ...(project.baseBlueprint?.consistencyAssets?.productReferenceImages ?? []),
      ]
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, 3)
  const productReferenceImageCount =
    Math.max(
      productReferenceImagePaths.length,
      Number(project.productReferenceImagePaths?.length ?? 0) || 0,
      Number(project.originalProductReferenceImagePaths?.length ?? 0) || 0,
    )
  const firstProductImage =
    String(
      productReferenceImagePaths[0] ||
      project.productReferenceImagePaths?.[0] ||
      project.originalProductReferenceImagePaths?.[0] ||
      '',
    ).trim()
  const coverAssetPath =
    String(project.finalCompose?.coverImagePath || '').trim() ||
    String(project.coverAssetPath || '').trim() ||
    firstProductImage ||
    String(project.finalCompose?.outputPath || '').trim() ||
    String(project.previewPipeline?.previewOutputPath || '').trim() ||
    String(project.referenceVideoPath || '').trim()

  return {
    id: project.id,
    ownership: 'local',
    sourceType: 'local',
    ownerUserId: undefined,
    title: ensureProjectTitle(project),
    description: String(project.description || '').trim() || undefined,
    groupId: String(project.groupId || '').trim() || undefined,
    groupName: String(project.groupName || '').trim() || undefined,
    archived: Boolean(project.archived ?? false),
    runMode: inferProjectRunMode(project),
    createdAt: Number(project.createdAt || 0),
    updatedAt: project.updatedAt,
    currentStep: project.workflowV2?.currentStep ?? 'reference_analysis',
    progressPercent: computeProjectProgress(project),
    status: project.previewPipeline?.status || project.status,
    referenceVideoName: project.referenceVideoName,
    referenceVideoPath: project.referenceVideoPath,
    coverAssetPath,
    previewOutputPath: project.previewPipeline?.previewOutputPath || '',
    previewReportPath: project.previewPipeline?.previewReportPath || '',
    outputDir: project.outputDir || '',
    finalOutputPath: project.finalCompose?.outputPath || '',
    subtitleOverlayActive: Boolean(project.finalCompose?.subtitleOverlay?.active),
    subtitleOriginalOutputPath: String(project.finalCompose?.subtitleOverlay?.originalOutputPath || '').trim() || '',
    subtitleOutputPath: String(project.finalCompose?.subtitleOverlay?.subtitleOutputPath || '').trim() || '',
    selectedModelIdentityName,
    productReferenceImageCount,
    productReferenceImagePaths,
    shotCount,
    generatedImageCount,
    generatedVideoCount,
    lastError: project.lastError || project.previewPipeline?.lastError || '',
  }
}

function videoProviderChain(credentials?: ModelCredentials) {
  const p = credentials?.videoProviderPrimary
  return [p === 'kling' || p === 'grsai' || p === 'apifox_hub' ? p : 'seedance'] as AiProviderName[]
}

function hasCloudVideoKey(credentials: ModelCredentials) {
  const p = videoProviderChain(credentials)[0]
  if (p === 'kling') return Boolean(String(credentials.klingApiKey ?? '').trim())
  if (p === 'grsai') return Boolean(String(credentials.grsaiApiKey ?? '').trim())
  if (p === 'apifox_hub') return Boolean(String(resolveApifoxHubCredentials(credentials, 'video')?.apiKey ?? '').trim())
  return Boolean(String(credentials.seedanceApiKey ?? '').trim())
}

function videoProviderLabel(credentials: ModelCredentials) {
  const p = videoProviderChain(credentials)[0]
  if (p === 'kling') return 'AtlasCloud'
  if (p === 'grsai') return 'GRS.AI'
  if (p === 'apifox_hub') {
    const profile = resolveApifoxHubProfile(credentials, 'video')
    if (profile === 'ai666') return 'AI666'
    if (profile === 'xibapi') return 'XIBAPI'
    return 'VectorEngine'
  }
  return 'Seedance'
}

function videoProviderModel(credentials: ModelCredentials) {
  const p = videoProviderChain(credentials)[0]
  if (p === 'kling') return String(credentials.videoModelPrimary ?? '').trim() || 'google/veo3.1-lite/start-end-frame-to-video'
  if (p === 'grsai') return String(credentials.grsaiVideoModel ?? '').trim() || 'grsai-video'
  if (p === 'apifox_hub') {
    const hub = resolveApifoxHubCredentials(credentials, 'video')
    return (
      String(
        hub?.referenceVideoModel ||
          hub?.startEndVideoModel ||
          hub?.imageToVideoModel ||
          hub?.textToVideoModel ||
          '',
      ).trim() || 'apifox-video'
    )
  }
  return String(credentials.videoModelPrimary ?? '').trim() || 'bytedance/seedance-2.0/reference-to-video'
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const size = Math.max(1, Math.min(items.length || 1, Math.floor(Number(concurrency) || 1)))
  const results = new Array<R>(items.length)
  let cursor = 0
  const runWorker = async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: size }, () => runWorker()))
  return results
}

function previewPipelinePatch(
  project: CloneProject,
  patch: Partial<ClonePreviewPipelineStatus> & { status: ClonePreviewPipelineStatus['status'] },
) {
  project.previewPipeline = {
    status: patch.status,
    previewOutputPath: patch.previewOutputPath ?? project.previewPipeline?.previewOutputPath,
    previewReportPath: patch.previewReportPath ?? project.previewPipeline?.previewReportPath,
    foregroundPlanId: patch.foregroundPlanId ?? project.previewPipeline?.foregroundPlanId,
    remainingPlanIds: patch.remainingPlanIds ?? project.previewPipeline?.remainingPlanIds ?? [],
    lastError: patch.lastError ?? (patch.status === 'failed' ? project.previewPipeline?.lastError : undefined),
    updatedAt: now(),
  }
  return project.previewPipeline
}

function ensureCloneFlowState(project: CloneProject) {
  project.scriptVariantCandidates ??= []
  project.storyboardGridBatches ??= []
  project.storyboardFrames ??= []
  project.shotVideoOutputs ??= []
  project.finalCompose ??= {
    status: 'idle',
    updatedAt: now(),
  } satisfies CloneFinalComposeStatus
  return project
}

function chunkArray<T>(items: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function projectBlueprintShots(project: CloneProject) {
  return project.blueprint?.shots ?? project.baseBlueprint?.shots ?? []
}

function updateProjectShots(project: CloneProject, updater: (shot: ShotSpec) => ShotSpec) {
  if (project.blueprint) {
    project.blueprint = {
      ...project.blueprint,
      shots: project.blueprint.shots.map(updater),
    }
  }
  if (project.baseBlueprint) {
    project.baseBlueprint = {
      ...project.baseBlueprint,
      shots: project.baseBlueprint.shots.map(updater),
    }
  }
  if (project.executionBlueprint) {
    project.executionBlueprint = {
      ...project.executionBlueprint,
      shots: project.executionBlueprint.shots.map(updater),
    }
  }
  return project
}

function replaceProjectShot(project: CloneProject, shotId: string, patch: Partial<ShotSpec>) {
  return updateProjectShots(project, (shot) => (shot.id === shotId ? { ...shot, ...patch } : shot))
}

function rebuildProjectStoryboardFrames(project: CloneProject) {
  const shots = projectBlueprintShots(project).sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
  project.storyboardFrames = shots.map((shot, index) => {
    const existing = Array.isArray(project.storyboardFrames)
      ? project.storyboardFrames.find((frame) => frame.shotId === shot.id)
      : undefined
    const imagePath = String(shot.gptFirstFramePath || shot.generatedFirstFramePath || '').trim() || undefined
    const error = imagePath ? undefined : String(shot.gptFrameError || shot.error || '').trim() || undefined
    const isGenerating = String(shot.gptFrameStatus || '').trim().toLowerCase() === 'generating'
    return {
      id: existing?.id || randomUUID(),
      shotId: shot.id,
      batchId: existing?.batchId,
      imagePath,
      aspectRatio: '9:16' as const,
      status: isGenerating ? 'generating' : imagePath ? 'cropped' : 'failed',
      error,
      frameIndex: typeof existing?.frameIndex === 'number' ? existing.frameIndex : index,
      updatedAt: now(),
    }
  })
  return project
}

function syncShotVideoOutput(project: CloneProject, output: CloneShotVideoOutput) {
  ensureCloneFlowState(project)
  const next = (project.shotVideoOutputs ?? []).filter((item) => item.shotId !== output.shotId)
  next.push({
    ...output,
    sourceEvent: String(output.sourceEvent || 'unspecified').trim() || 'unspecified',
    updatedAt: Number(output.updatedAt || now()) || now(),
  })
  project.shotVideoOutputs = next.sort((a, b) => {
    const shots = projectBlueprintShots(project)
    const aIndex = shots.find((shot) => shot.id === a.shotId)?.index ?? 0
    const bIndex = shots.find((shot) => shot.id === b.shotId)?.index ?? 0
    return aIndex - bIndex
  })
  return project
}

function appendShotVideoSubmissionAuditLog(
  project: CloneProject,
  entry: Omit<CloneShotVideoSubmissionAuditLog, 'id' | 'createdAt'> & { createdAt?: number },
) {
  ensureCloneFlowState(project)
  const queue = (project.generationQueue ||= createCloneGenerationQueue(project))
  const current = Array.isArray(queue.submissionAuditLogs) ? queue.submissionAuditLogs : []
  queue.submissionAuditLogs = [
    {
      id: randomUUID(),
      createdAt: Number(entry.createdAt ?? now()) || now(),
      ...entry,
    },
    ...current,
  ].slice(0, 200)
  return queue.submissionAuditLogs
}

function syncFinalCompose(project: CloneProject, patch: Partial<CloneFinalComposeStatus> & { status: CloneFinalComposeStatus['status'] }) {
  ensureCloneFlowState(project)
  project.finalCompose = {
    status: patch.status,
    outputPath: patch.outputPath ?? project.finalCompose?.outputPath,
    coverImagePath: patch.coverImagePath ?? project.finalCompose?.coverImagePath,
    error: patch.status === 'done' ? patch.error : patch.error ?? project.finalCompose?.error,
    updatedAt: now(),
  }
  return project.finalCompose
}

function resetFinalComposeArtifacts(project: CloneProject, reason?: string) {
  ensureCloneFlowState(project)
  syncFinalCompose(project, {
    status: 'idle',
    outputPath: undefined,
    coverImagePath: undefined,
    error: reason || undefined,
  })
  previewPipelinePatch(project, {
    status: 'idle',
    previewOutputPath: undefined,
    previewReportPath: undefined,
    foregroundPlanId: undefined,
    remainingPlanIds: [],
    lastError: reason || undefined,
  })
  return project
}

async function ensureVideoCoverImage(videoPath?: string) {
  const source = String(videoPath || '').trim()
  if (!source) return undefined
  return (await generateThumbnailJpg({ filePath: source, atSec: 1 })) || undefined
}

function gridTypeForCount(count: number): 'grid-6' | 'grid-9' {
  return count <= 6 ? 'grid-6' : 'grid-9'
}

function buildVariantCandidateTitle(index: number, scoreHint: number) {
  return `脚本变体 ${index + 1} · ${scoreHint.toFixed(1)}`
}

function buildReferenceScriptCandidate(baseShots: ShotSpec[]): CloneScriptVariantCandidate {
  const orderedShots = [...baseShots].sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
  const shotScripts = orderedShots.map((shot, shotIndex) => ({
    shotId: shot.id,
    shotIndex,
    timeRange: buildShotTimeRange(shot),
    scriptText: String(shot.scriptText || '').trim(),
    scriptRole: (String(shot.scriptRole || 'unknown').trim() || 'unknown') as ShotSpec['scriptRole'],
    visualDescription: String(shot.visualDescription || '').trim(),
    actionDescription: String(shot.actionDescription || '').trim(),
    cameraDescription: String(shot.cameraDescription || '').trim(),
    generationPrompt: String(shot.generationPrompt || '').trim(),
  }))
  return {
    id: randomUUID(),
    title: '参考视频原脚本',
    summary:
      shotScripts
        .map((row) => row.scriptText)
        .filter(Boolean)
        .slice(0, 3)
        .join(' / ')
        .slice(0, 220) || '沿用参考视频拆解出的原始脚本内容',
    fullScript: composeWholeScriptFromShots(
      orderedShots.map((shot) => ({
        ...shot,
        scriptText: String(shot.scriptText || '').trim(),
        scriptRole: shot.scriptRole,
        visualDescription: String(shot.visualDescription || '').trim(),
        actionDescription: String(shot.actionDescription || '').trim(),
        cameraDescription: String(shot.cameraDescription || '').trim(),
        generationPrompt: String(shot.generationPrompt || '').trim(),
      })),
    ),
    shotScripts,
    score: 10,
    reason: '默认沿用参考视频原始脚本，不自动切换到高分变体',
    selected: true,
    createdAt: now(),
  }
}

function normalizeCandidateText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function isLightRewriteCandidate(base: string, candidate: string) {
  const baseText = normalizeCandidateText(base).toLowerCase()
  const candidateText = normalizeCandidateText(candidate).toLowerCase()
  if (!candidateText) return false
  if (!baseText) return true
  if (candidateText === baseText) return true
  if (candidateText.includes(baseText) || baseText.includes(candidateText)) return true
  const baseTokens = new Set(baseText.split(/[^a-z0-9\u4e00-\u9fa5]+/i).filter(Boolean))
  const candidateTokens = candidateText.split(/[^a-z0-9\u4e00-\u9fa5]+/i).filter(Boolean)
  if (!baseTokens.size || !candidateTokens.length) return false
  const overlap = candidateTokens.filter((token) => baseTokens.has(token)).length
  return overlap / Math.max(1, candidateTokens.length) >= 0.45
}

function shouldKeepVariantField(base: string, candidate: string, options?: { allowBroaderRewrite?: boolean }) {
  const baseText = normalizeCandidateText(base)
  const candidateText = normalizeCandidateText(candidate)
  if (!candidateText) return false
  if (!baseText) return true
  if (candidateText === baseText) return true
  if (options?.allowBroaderRewrite) {
    if (candidateText.length >= Math.min(12, Math.max(6, Math.floor(baseText.length * 0.2)))) return true
  }
  return isLightRewriteCandidate(baseText, candidateText)
}

function alignVariantShotToBase(input: {
  baseShot: ShotSpec
  shotIndex: number
  raw: any
}) {
  const baseTimeRange = buildShotTimeRange(input.baseShot)
  const rawRole = String(input.raw?.scriptRole || '').trim()
  const rawTimeRange = String(input.raw?.timeRange || input.raw?.time_range || '').trim()
  const baseScriptText = String(input.baseShot.scriptText || '').trim()
  const baseVisualDescription = String(input.baseShot.visualDescription || '').trim()
  const baseActionDescription = String(input.baseShot.actionDescription || '').trim()
  const baseCameraDescription = String(input.baseShot.cameraDescription || '').trim()
  const baseGenerationPrompt = String(input.baseShot.generationPrompt || '').trim()
  const candidateScriptText = keepEnglishLikeText(String(input.raw?.scriptText || '').trim(), '').trim()
  const candidateVisualDescription = String(input.raw?.visualDescription || '').trim()
  const candidateActionDescription = String(input.raw?.actionDescription || '').trim()
  const candidateCameraDescription = String(input.raw?.cameraDescription || '').trim()
  const candidateGenerationPrompt = String(input.raw?.generationPrompt || '').trim()

  return {
    shotId: input.baseShot.id,
    shotIndex: input.shotIndex,
    timeRange: rawTimeRange && rawTimeRange === baseTimeRange ? rawTimeRange : baseTimeRange,
    scriptText: shouldKeepVariantField(baseScriptText, candidateScriptText, { allowBroaderRewrite: true }) ? candidateScriptText : baseScriptText,
    scriptRole:
      rawRole && rawRole === String(input.baseShot.scriptRole || 'unknown').trim()
        ? (rawRole as ShotSpec['scriptRole'])
        : ((String(input.baseShot.scriptRole || 'unknown').trim() || 'unknown') as ShotSpec['scriptRole']),
    visualDescription: shouldKeepVariantField(baseVisualDescription, candidateVisualDescription, { allowBroaderRewrite: true })
      ? candidateVisualDescription
      : baseVisualDescription,
    actionDescription: shouldKeepVariantField(baseActionDescription, candidateActionDescription, { allowBroaderRewrite: true })
      ? candidateActionDescription
      : baseActionDescription,
    cameraDescription: shouldKeepVariantField(baseCameraDescription, candidateCameraDescription, { allowBroaderRewrite: true })
      ? candidateCameraDescription
      : baseCameraDescription,
    generationPrompt: shouldKeepVariantField(baseGenerationPrompt, candidateGenerationPrompt, { allowBroaderRewrite: true })
      ? candidateGenerationPrompt
      : baseGenerationPrompt || [baseScriptText, baseVisualDescription, baseActionDescription, baseCameraDescription].filter(Boolean).join('\n'),
  }
}

function pickHighestScoreCandidate(candidates: CloneScriptVariantCandidate[]) {
  return candidates
    .slice()
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0] || null
}

const SCRIPT_VARIANT_AUTO_SELECT_THRESHOLD = 8.5

function pickDefaultScriptVariantCandidate(input: {
  referenceCandidate: CloneScriptVariantCandidate
  generatedCandidates: CloneScriptVariantCandidate[]
}) {
  const bestGeneratedCandidate = pickHighestScoreCandidate(input.generatedCandidates)
  if (!bestGeneratedCandidate) return input.referenceCandidate
  return Number(bestGeneratedCandidate.score || 0) > SCRIPT_VARIANT_AUTO_SELECT_THRESHOLD
    ? bestGeneratedCandidate
    : input.referenceCandidate
}

function normalizeVariantComparisonText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function areVariantCandidatesNearDuplicate(a: CloneScriptVariantCandidate, b: CloneScriptVariantCandidate) {
  const aSummary = normalizeVariantComparisonText(a.summary)
  const bSummary = normalizeVariantComparisonText(b.summary)
  const aShots = (a.shotScripts ?? []).map((row) => normalizeVariantComparisonText(row.scriptText)).join(' | ')
  const bShots = (b.shotScripts ?? []).map((row) => normalizeVariantComparisonText(row.scriptText)).join(' | ')
  return Boolean(aSummary && bSummary && aSummary === bSummary) || Boolean(aShots && bShots && aShots === bShots)
}

function hasEnoughVariantDiversity(candidates: CloneScriptVariantCandidate[]) {
  const generated = candidates.filter((item) => item.title !== '参考视频原脚本')
  if (generated.length <= 1) return generated.length === 1
  for (let i = 0; i < generated.length; i += 1) {
    for (let j = i + 1; j < generated.length; j += 1) {
      if (!areVariantCandidatesNearDuplicate(generated[i], generated[j])) return true
    }
  }
  return false
}

function scriptVariantThemePreset(index: number, locale: CloneLocale) {
  if (locale === 'zh-CN') {
    const presets = [
      {
        title: '潮流前卫',
        summaryPrefix: '强调个性表达与视觉冲击，突出潮流佩戴氛围。',
        reason: '偏潮流前卫角度，强化第一眼吸引力',
        shotPrefix: '潮流感表达：',
      },
      {
        title: '日常百搭',
        summaryPrefix: '强调日常佩戴与轻松搭配，降低决策门槛。',
        reason: '偏日常百搭角度，突出通勤与日常适配',
        shotPrefix: '日常感表达：',
      },
      {
        title: '礼物心动',
        summaryPrefix: '强调精致细节与礼物感受，突出心动氛围。',
        reason: '偏礼赠心动角度，强化精致与惊喜感',
        shotPrefix: '礼物感表达：',
      },
      {
        title: '质感细节',
        summaryPrefix: '强调材质、做工与局部细节，突出高级感。',
        reason: '偏质感细节角度，强化材质与工艺卖点',
        shotPrefix: '质感向表达：',
      },
    ]
    return presets[index % presets.length]
  }
  const presets = [
    { title: 'Trend Focus', summaryPrefix: 'Lean into trend expression and visual punch.', reason: 'Trend-led angle with stronger first-glance impact', shotPrefix: 'Trend angle: ' },
    { title: 'Daily Match', summaryPrefix: 'Lean into daily wear and easy matching.', reason: 'Daily-wear angle with lower decision pressure', shotPrefix: 'Daily angle: ' },
    { title: 'Gift Mood', summaryPrefix: 'Lean into refined details and giftable mood.', reason: 'Gift-led angle with stronger emotional appeal', shotPrefix: 'Gift angle: ' },
    { title: 'Detail Craft', summaryPrefix: 'Lean into material, finish, and crafted details.', reason: 'Detail-led angle with stronger craftsmanship focus', shotPrefix: 'Detail angle: ' },
  ]
  return presets[index % presets.length]
}

function applyVariantTheme(candidate: CloneScriptVariantCandidate, themeIndex: number, locale: CloneLocale) {
  if (candidate.title === '参考视频原脚本') return candidate
  const preset = scriptVariantThemePreset(themeIndex, locale)
  const shotScripts = (candidate.shotScripts ?? []).map((row, shotIndex) => {
    const baseScriptText = normalizeCandidateText(row.scriptText)
    const nextScriptText = `${preset.shotPrefix}${baseScriptText || `分镜 ${shotIndex + 1} 围绕 ${preset.title} 角度表达`}`.trim()
    return {
      ...row,
      scriptText: nextScriptText,
      visualDescription: row.visualDescription ? `${preset.title}风格下，${row.visualDescription}` : row.visualDescription,
      actionDescription: row.actionDescription ? `${preset.title}重点下，${row.actionDescription}` : row.actionDescription,
      cameraDescription: row.cameraDescription ? `${preset.title}表达方式，${row.cameraDescription}` : row.cameraDescription,
      generationPrompt: row.generationPrompt ? `${preset.summaryPrefix}\n${row.generationPrompt}` : row.generationPrompt,
    }
  })
  return {
    ...candidate,
    title: `${preset.title} · ${candidate.title}`,
    summary: `${preset.summaryPrefix} ${candidate.summary || ''}`.trim().slice(0, 220),
    reason: preset.reason,
    shotScripts,
    fullScript: shotScripts
      .slice()
      .sort((a, b) => Number(a.shotIndex || 0) - Number(b.shotIndex || 0))
      .map((row, rowIndex) => `#${rowIndex + 1} ${row.scriptRole || 'unknown'}\n${String(row.scriptText || row.generationPrompt || row.visualDescription || '').trim()}`)
      .join('\n\n'),
  }
}

function enforceVariantCandidateDiversity(candidates: CloneScriptVariantCandidate[], locale: CloneLocale) {
  return candidates.map((candidate, index) => {
    if (index === 0 || !candidates.slice(0, index).some((prev) => areVariantCandidatesNearDuplicate(prev, candidate))) {
      return applyScriptVariantSafetyToCandidate(candidate)
    }
    return applyScriptVariantSafetyToCandidate(applyVariantTheme(candidate, index - 1, locale))
  })
}

function composeWholeScriptFromShots(shots: ShotSpec[]) {
  return shots
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    .map((shot, idx) => `#${idx + 1} ${shot.scriptRole || 'unknown'}\n${String(shot.scriptText || shot.generationPrompt || shot.visualDescription || '').trim()}`)
    .join('\n\n')
}

function buildShotTimeRange(shot: Pick<ShotSpec, 'startSec' | 'endSec' | 'durationSec'>) {
  const startSec = Number(shot.startSec || 0)
  const fallbackEnd = startSec + Number(shot.durationSec || 0)
  const requestedEnd = Number(shot.endSec ?? fallbackEnd)
  const clampedEnd = Math.max(startSec + 0.5, Math.min(requestedEnd, startSec + 8))
  return `${startSec.toFixed(1)}s-${clampedEnd.toFixed(1)}s`
}

async function generateWholeScriptVariantsWithAi(input: {
  credentials: ModelCredentials
  locale: CloneLocale
  shots: ShotSpec[]
  variantCount: number
  modelIdentity?: { name?: string; imagePaths?: string[]; description?: string }
  productReferenceImagePaths?: string[]
  productAnalysisText?: string
}) {
  const key = String(input.credentials.grsaiApiKey || '').trim()
  if (!key) throw new Error('未配置 GRS.AI API Key，无法生成整片脚本变体')
  const host = String(input.credentials.grsaiHost || 'https://grsaiapi.com').trim().replace(/\/+$/, '') || 'https://grsaiapi.com'
  const model = String(input.credentials.grsaiAnalysisModel || 'gemini-3.1-pro').trim() || 'gemini-3.1-pro'
  const orderedShots = [...input.shots].sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
  const sourceScript = orderedShots
    .map((shot, idx) => {
      return JSON.stringify({
        shotId: shot.id,
        shotIndex: idx,
        timeRange: `${Number(shot.startSec || 0).toFixed(1)}s-${Number(shot.endSec ?? Number(shot.startSec || 0) + Number(shot.durationSec || 0)).toFixed(1)}s`,
        scriptRole: shot.scriptRole || 'unknown',
        scriptText: String(shot.scriptText || '').trim(),
        visualDescription: String(shot.visualDescription || '').trim(),
        actionDescription: String(shot.actionDescription || '').trim(),
        cameraDescription: String(shot.cameraDescription || '').trim(),
        generationPrompt: String(shot.generationPrompt || '').trim(),
      })
    })
    .join('\n')
  const assetContext = JSON.stringify({
    modelName: String(input.modelIdentity?.name || '').trim(),
    modelImageCount: Number(input.modelIdentity?.imagePaths?.length ?? 0),
    modelDescription: String(input.modelIdentity?.description || '').trim(),
    productImageCount: Number(input.productReferenceImagePaths?.length ?? 0),
    productAnalysis: String(input.productAnalysisText || '').trim(),
  })
  const prompt = [
    prependSilentCommercialGlobalRule(['You are an elite TikTok ecommerce script strategist.'], 400),
    'Generate multiple full-video script variants for the same product video blueprint.',
    'Output language: English.',
    `Variant count: ${input.variantCount}.`,
    'The reconstructed source shots below are the base script. Every variant should stay generally aligned to them shot by shot.',
    'Every variant must keep shot order unchanged and output per-shot time-range script content.',
    'Do not change shot count. Do not change shot order. Keep the role and broad purpose of each shot generally consistent.',
    'Each shotScripts item must explicitly describe only camera guidance in natural English, for example "0.0s-3.0s Close-up shot. Camera slowly zooms in. No angle change."',
    'Every single shot must be 8.0 seconds or shorter. Never output any shot longer than 8 seconds.',
    'If a source beat feels longer than 8 seconds, split it into finer consecutive sub-shots while keeping the same story logic and shot order.',
    'Allow noticeable but still related variation in wording, hook tone, selling emphasis order, transition phrasing, CTA phrasing, and micro-level presentation details.',
    'You may adjust per-shot expression, focus point, and descriptive detail as long as the whole variant still feels like the same product video idea.',
    'Do not rewrite the video into a completely different concept. Do not replace the product category, the model-presented context, or the overall shot sequence.',
    'Script is only for camera guidance. Script cannot modify objects, model pose, product structure, or scene layout.',
    'Only camera movement is allowed. No subject movement, no product motion, no interaction, no lighting effects, no sparkle language.',
    'visualDescription, actionDescription, cameraDescription, and generationPrompt should stay broadly aligned with the corresponding source shot, but they do not need to be near-identical.',
    'You must incorporate the bound model identity and product reference context when generating the variants.',
    'This is for product selling and visual demonstration. Keep human presence subordinate to product display.',
    'Do not remove shots. Do not add watermark, logo, subtitles, platform UI, or unrelated branding.',
    'Each shotScripts item must stay within its own time range, and that time range itself must not exceed 8 seconds.',
    'All `scriptText` values must be English only. Do not output Chinese or Vietnamese in `scriptText`.',
    'Return JSON only.',
    'JSON shape:',
    '{"variants":[{"title":"","summary":"","reason":"","score":8.6,"shotScripts":[{"shotId":"","shotIndex":0,"timeRange":"0.0s-3.0s","scriptText":"","scriptRole":"hook","visualDescription":"","actionDescription":"","cameraDescription":"","generationPrompt":""}]}]}',
    'Bound asset context:',
    assetContext,
    'Source shots:',
    sourceScript,
  ].join('\n')

  if (input.credentials.chatProviderPrimary === 'apifox_hub') {
    const apifox = await generateChatCompletion({
      credentials: input.credentials,
      system: 'You are a strict JSON-only full-video script variant generator.',
      prompt,
    })
    if (!apifox.content) throw new Error(`整片脚本变体生成失败。provider=${apifox.provider} model=${apifox.model} response为空`)
    const jsonText = extractJsonObjectText(apifox.content)
    let parsed: any
    try {
      parsed = JSON.parse(jsonText)
    } catch (error: any) {
      throw new Error(
        `整片脚本变体解析失败。provider=${apifox.provider} model=${apifox.model} endpointStyle=${apifox.endpointStyle} response=${cleanAiText(apifox.content).slice(0, 320)} reason=${String(error?.message || error)}`,
      )
    }
    const rawVariants = Array.isArray(parsed?.variants) ? parsed.variants : []
    if (!rawVariants.length) {
      throw new Error(`整片脚本变体结果为空。provider=${apifox.provider} model=${apifox.model} response=${cleanAiText(apifox.content).slice(0, 320)}`)
    }
    return rawVariants.map((item: any, index: number) => ({
      id: randomUUID(),
      title: String(item?.title || `脚本变体 ${index + 1}`).trim(),
      summary: String(item?.summary || '').trim(),
      reason: String(item?.reason || '').trim(),
      score: Number(item?.score || 0) || 0,
      shotScripts: Array.isArray(item?.shotScripts) ? item.shotScripts : [],
    }))
  }

  const res = await fetch(`${host}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'You are a strict JSON-only full-video script variant generator.' },
        { role: 'user', content: prompt },
      ],
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`整片脚本变体生成失败 HTTP ${res.status}: ${text.slice(0, 500)}`)
  const content = extractModelMessageContent(text)
  const jsonText = extractJsonObjectText(content)
  let parsed: any
  try {
    parsed = JSON.parse(jsonText)
  } catch (error: any) {
    throw new Error(`整片脚本变体解析失败。provider=grsai model=${model} response=${cleanAiText(content).slice(0, 320)} reason=${String(error?.message || error)}`)
  }
  const rawVariants = Array.isArray(parsed?.variants) ? parsed.variants : []
  if (!rawVariants.length) throw new Error(`整片脚本变体结果为空。provider=grsai model=${model} response=${cleanAiText(content).slice(0, 320)}`)
  return rawVariants.map((item: any, index: number) => ({
    id: randomUUID(),
    title: String(item?.title || `脚本变体 ${index + 1}`).trim(),
    summary: String(item?.summary || '').trim(),
    reason: String(item?.reason || '').trim(),
    score: Number(item?.score || 0) || 0,
    shotScripts: Array.isArray(item?.shotScripts) ? item.shotScripts : [],
  }))
}

async function cropStoryboardGridBatch(input: {
  sourcePath: string
  outDir: string
  batchId: string
  shotIds: string[]
  gridType: 'grid-6' | 'grid-9'
}) {
  const meta = await probeMedia(input.sourcePath)
  const width = Math.max(1, Number(meta.width || 0))
  const height = Math.max(1, Number(meta.height || 0))
  const cols = 3
  const rows = input.gridType === 'grid-6' ? 2 : 3
  const gutter = Math.max(0, Math.round(Math.min(width, height) * 0.008))
  const cellWidth = Math.floor((width - gutter * (cols - 1)) / cols)
  const cellHeight = Math.floor((height - gutter * (rows - 1)) / rows)
  const outputs: string[] = []
  await mkdir(input.outDir, { recursive: true })
  for (let index = 0; index < input.shotIds.length; index += 1) {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = col * (cellWidth + gutter)
    const y = row * (cellHeight + gutter)
    const outPath = join(input.outDir, `${input.batchId}_frame_${index + 1}.png`)
    await new Promise<void>((resolve, reject) => {
      const exe = getFfmpegExecutable()
      const args = [
        '-y',
        '-i',
        input.sourcePath,
        '-frames:v',
        '1',
        '-vf',
        `crop=${cellWidth}:${cellHeight}:${x}:${y},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`,
        outPath,
      ]
      const child = spawn(exe, args, { windowsHide: true })
      let stderr = ''
      child.stderr.on('data', (c: Buffer) => {
        stderr += c.toString('utf8')
      })
      child.on('error', reject)
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr || `ffmpeg crop failed: ${code}`))))
    })
    outputs.push(outPath)
  }
  return outputs
}

function imageProviderName(credentials: ModelCredentials): ImageProviderName {
  if (credentials.imageProviderPrimary === 'kling' || credentials.imageProviderPrimary === 'grsai' || credentials.imageProviderPrimary === 'apifox_hub') {
    return credentials.imageProviderPrimary
  }
  return 'apifox_hub'
}

function imageProviderLabel(credentials: ModelCredentials) {
  const p = imageProviderName(credentials)
  if (p === 'kling') return 'AtlasCloud 图片'
  if (p === 'grsai') return 'GRS.AI 图片'
  if (p === 'apifox_hub') return `${resolveApifoxHubProfile(credentials, 'image') === 'ai666' ? 'AI666' : 'VectorEngine'} 图片`
  return 'VectorEngine 图片'
}

function imageProviderModel(credentials: ModelCredentials) {
  const p = imageProviderName(credentials)
  if (p === 'kling') return String(credentials.klingImageModel ?? '').trim() || 'openai/gpt-image-1/edit'
  if (p === 'grsai') return String(credentials.grsaiImageModel ?? '').trim() || 'gpt-image-2'
  if (p === 'apifox_hub') return String(resolveApifoxHubCredentials(credentials, 'image')?.imageModel ?? '').trim() || 'apifox-image'
  return String(resolveApifoxHubCredentials(credentials, 'image')?.imageModel ?? credentials.openaiImageModel ?? '').trim() || 'apifox-image'
}

function compactStoryboardImageRefs(input: {
  productRefs?: string[]
  modelPackRefs?: string[]
  identityGridPath?: string
  thumbnailPath?: string
  startFramePath?: string
  continuityAnchorPath?: string
  mode: 'start' | 'end'
}) {
  const productRefs = Array.from(new Set((input.productRefs ?? []).map((item) => String(item || '').trim()).filter(Boolean)))
  const modelPackRefs = Array.from(new Set((input.modelPackRefs ?? []).map((item) => String(item || '').trim()).filter(Boolean)))
  const identityGridRef = String(input.identityGridPath || '').trim()
  const primaryProductRefs = productRefs.slice(0, 1)
  const primaryModelRefs = modelPackRefs.slice(0, 1)
  const storyboardAuthorityRefs =
    input.mode === 'end'
      ? [String(input.startFramePath || input.continuityAnchorPath || input.thumbnailPath || '').trim()].filter(Boolean)
      : [String(input.thumbnailPath || input.continuityAnchorPath || '').trim()].filter(Boolean)
  if (identityGridRef) {
    return Array.from(
      new Set([
        identityGridRef,
        ...storyboardAuthorityRefs,
      ]),
    ).slice(0, 3)
  }
  return Array.from(
    new Set([
      ...primaryProductRefs,
      ...primaryModelRefs,
      ...storyboardAuthorityRefs,
    ]),
  ).slice(0, 3)
}

function resolveStoryboardSceneFitRefs(project: CloneProject, shot: ShotSpec, pack?: ModelIdentityPack | null, mode: 'start' | 'end' = 'start') {
  const identityGridPath = String(project.projectIdentityGridPath || '').trim()
  const sceneReferencePath =
    String(shot.thumbnailPath || '').trim() ||
    (mode === 'end' ? previousShotContinuityAnchor(project, shot) : '') ||
    previousShotContinuityAnchor(project, shot)
  return [identityGridPath, sceneReferencePath].map((item) => String(item || '').trim()).filter(Boolean)
}

function previousShotContinuityAnchor(project: CloneProject, shot: ShotSpec) {
  const sortedShots = (project.blueprint?.shots ?? []).slice().sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
  const currentIndex = sortedShots.findIndex((item) => item.id === shot.id)
  if (currentIndex <= 0) return ''
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = sortedShots[index]
    const anchor = String(candidate.gptFirstFramePath || candidate.generatedFirstFramePath || candidate.gptLastFramePath || candidate.generatedLastFramePath || '').trim()
    if (anchor && existsSync(anchor)) return anchor
  }
  return ''
}

function generatedImageProvider(credentials: ModelCredentials) {
  const p = imageProviderName(credentials)
  if (p === 'kling') return 'kling-image'
  if (p === 'grsai') return 'grsai-image'
  if (p === 'apifox_hub') return 'apifox-image'
  return 'apifox-image'
}

function assertImageProviderKey(credentials: ModelCredentials, action: string) {
  if (
    canUseMockGeneration(credentials) &&
    !String(credentials.klingApiKey ?? '').trim() &&
    !String(credentials.grsaiApiKey ?? '').trim() &&
    !String(resolveApifoxHubCredentials(credentials, 'image')?.apiKey ?? '').trim() &&
    !String(credentials.openaiApiKey ?? '').trim()
  ) {
    return
  }
  const p = imageProviderName(credentials)
  if (p === 'kling') {
    if (String(credentials.klingApiKey ?? '').trim()) return
    throw new Error(`未配置 AtlasCloud API Key，无法${action}`)
  }
  if (p === 'grsai') {
    if (String(credentials.grsaiApiKey ?? '').trim()) return
    throw new Error(`未配置 GRS.AI API Key，无法${action}`)
  }
  if (String(resolveApifoxHubCredentials(credentials, 'image')?.apiKey ?? '').trim()) return
  if (String(credentials.openaiApiKey ?? '').trim()) return
  throw new Error(`未配置 VectorEngine API Key，无法${action}。当前图片供应商解析为 ${p}。`)
}

function isLocalMockTestMode(credentials: ModelCredentials) {
  return (
    canUseMockGeneration(credentials) &&
    !String(credentials.klingApiKey ?? '').trim() &&
    !String(credentials.grsaiApiKey ?? '').trim() &&
    !String(credentials.seedanceApiKey ?? '').trim() &&
    !String(resolveApifoxHubCredentials(credentials, 'image')?.apiKey ?? '').trim() &&
    !String(credentials.openaiApiKey ?? '').trim()
  )
}

function isImageTaskMapping(taskId?: string, provider?: string, model?: string) {
  const taskText = String(taskId || '').trim().toLowerCase()
  if (!taskText) return false
  return taskText.startsWith('gpt_frame_') || taskText.startsWith('mj_')
}

function assertAnalysisBoardImageProviderReady(credentials: ModelCredentials) {
  if (
    canUseMockGeneration(credentials) &&
    !String(credentials.klingApiKey ?? '').trim() &&
    !String(credentials.grsaiApiKey ?? '').trim() &&
    !String(resolveApifoxHubCredentials(credentials, 'image')?.apiKey ?? '').trim() &&
    !String(credentials.openaiApiKey ?? '').trim()
  ) {
    throw new Error('当前处于本地 mock 图片模式，商品分析画板不会调用真实模型。请先配置可用的图片模型供应商和 API Key。')
  }
  const provider = imageProviderName(credentials)
  if (provider === 'kling' && !String(credentials.klingApiKey ?? '').trim()) {
    throw new Error('当前图片供应商为 AtlasCloud，但未配置 Kling API Key，无法生成商品分析画板。')
  }
  if (provider === 'grsai' && !String(credentials.grsaiApiKey ?? '').trim()) {
    throw new Error('当前图片供应商为 GRS.AI，但未配置 GRS.AI API Key，无法生成商品分析画板。')
  }
  if (provider === 'apifox_hub' && !String(resolveApifoxHubCredentials(credentials, 'image')?.apiKey ?? '').trim()) {
    throw new Error('当前图片供应商为 VectorEngine/AI666，但未配置图片 API Key，无法生成商品分析画板。')
  }
  if (provider === 'openai' && !String(credentials.openaiApiKey ?? '').trim()) {
    throw new Error('当前图片供应商为 OpenAI，但未配置 OpenAI API Key，无法生成商品分析画板。')
  }
}

function mergeImageProviderOverrides(credentials: ModelCredentials, input: Partial<ModelCredentials>): ModelCredentials {
  return {
    ...credentials,
    imageProviderPrimary:
      input.imageProviderPrimary === 'kling' || input.imageProviderPrimary === 'grsai' || input.imageProviderPrimary === 'apifox_hub' || input.imageProviderPrimary === 'openai'
        ? input.imageProviderPrimary
        : credentials.imageProviderPrimary,
    openaiApiKey: input.openaiApiKey ?? credentials.openaiApiKey,
    openaiImageModel: input.openaiImageModel ?? credentials.openaiImageModel,
    openaiImageQuality: input.openaiImageQuality ?? credentials.openaiImageQuality,
    klingApiKey: input.klingApiKey ?? credentials.klingApiKey,
    klingHost: input.klingHost ?? credentials.klingHost,
    klingImageModel: input.klingImageModel ?? credentials.klingImageModel,
    grsaiApiKey: input.grsaiApiKey ?? credentials.grsaiApiKey,
    grsaiHost: input.grsaiHost ?? credentials.grsaiHost,
    grsaiImageModel: input.grsaiImageModel ?? credentials.grsaiImageModel,
    apifoxHub: input.apifoxHub
      ? {
          ...(resolveApifoxHubCredentials(credentials, 'image') ?? {}),
          ...input.apifoxHub,
        }
      : resolveApifoxHubCredentials(credentials, 'image'),
    qiniuAccessKey: input.qiniuAccessKey ?? credentials.qiniuAccessKey,
    qiniuSecretKey: input.qiniuSecretKey ?? credentials.qiniuSecretKey,
    qiniuBucket: input.qiniuBucket ?? credentials.qiniuBucket,
    qiniuDomain: input.qiniuDomain ?? credentials.qiniuDomain,
    qiniuUploadHost: input.qiniuUploadHost ?? credentials.qiniuUploadHost,
    qiniuPrefix: input.qiniuPrefix ?? credentials.qiniuPrefix,
  }
}


function normalizeProductType(v?: string): CloneProductType {
  if (v === 'earrings' || v === 'phone_case' || v === 'clothes' || v === 'toy') return v
  return 'general'
}

function resolveProjectLevelProductType(project?: CloneProject) {
  return normalizeProductType(
    project?.baseBlueprint?.productCategory ||
      project?.blueprint?.productCategory ||
      project?.boundProductSnapshot?.productAnalysis?.category ||
      project?.boundProductSnapshot?.type ||
      'general',
  )
}

function resolveProjectStoryboardTemplateType(project?: CloneProject) {
  const value =
    project?.boundProductSnapshot?.storyboardTemplateType ||
    project?.baseBlueprint?.consistencyAssets?.boundProductSnapshot?.storyboardTemplateType ||
    project?.blueprint?.consistencyAssets?.boundProductSnapshot?.storyboardTemplateType
  return value === 'general' || value === 'jewelry' || value === 'ecommerce_packaging' || value === 'lifestyle_interaction'
    ? value
    : undefined
}

function resolveShotPromptProductType(project: CloneProject | undefined, shot: Pick<ShotSpec, 'productType'>) {
  const shotType = normalizeProductType(shot.productType)
  if (shotType !== 'general') return shotType
  return resolveProjectLevelProductType(project)
}

function consistencyRuntimeMode(shot: ShotSpec, strictConsistencyMode?: boolean): ConsistencyMode {
  if (shot.consistencyMode === 'strict' || strictConsistencyMode) return 'hard'
  return 'soft'
}

function normalizeQualityMode(v?: string): CloneQualityMode {
  if (v === 'fast' || v === 'standard') return v
  return 'high'
}

function identityLibraryDir(identityId?: string) {
  const base = join(getAppPaths().dataDir, 'viral-clone', 'identity-library')
  return identityId ? join(base, identityId) : base
}

function selectedIdentityPack(project: CloneProject): ModelIdentityPack | null {
  const snapshot = project.selectedModelIdentitySnapshot
  if (snapshot) return toProjectPackFromLibrary(snapshot)
  const packs = project.modelIdentityPacks ?? []
  return (
    packs.find((x) => x.id === project.selectedModelIdentityPackId) ??
    packs.find((x) => x.id === project.selectedModelIdentityId) ??
    packs.find((x) => x.confirmed) ??
    packs[0] ??
    null
  )
}

function toLibraryItemFromPack(input: ModelIdentityPack & { name?: string; coverImagePath?: string }): ModelIdentityLibraryItem {
  return {
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    status: input.status,
    name: String(input.name ?? '').trim() || 'AI模特',
    productType: input.productType,
    market: input.market,
    gender: input.gender,
    ageRange: input.ageRange,
    hairStyle: input.hairStyle,
    skinTone: input.skinTone,
    outfitStyle: input.outfitStyle,
    mood: input.mood,
    sceneStyle: input.sceneStyle,
    description: input.description,
    imagePaths: input.imagePaths,
    coverImagePath: input.coverImagePath || input.imagePaths?.[0],
    model: input.model,
    error: input.error,
  }
}

function toProjectPackFromLibrary(item: ModelIdentityLibraryItem): ModelIdentityPack {
  return {
    id: item.id,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    status: item.status,
    confirmed: item.status === 'done',
    productType: item.productType,
    market: item.market,
    gender: item.gender,
    ageRange: item.ageRange,
    hairStyle: item.hairStyle,
    skinTone: item.skinTone,
    outfitStyle: item.outfitStyle,
    mood: item.mood,
    sceneStyle: item.sceneStyle,
    description: item.description,
    imagePaths: item.imagePaths,
    model: item.model,
    error: item.error,
  }
}

async function syncProjectSelectedIdentity(project: CloneProject, identityId?: string) {
  if (!identityId) {
    project.selectedModelIdentityId = undefined
    project.selectedModelIdentitySnapshot = undefined
    project.selectedModelIdentityPackId = undefined
    project.modelIdentityPacks = []
    return project
  }
  const identity = await cloneRepo.getModelIdentity(identityId)
  if (!identity) {
    project.selectedModelIdentityId = undefined
    project.selectedModelIdentitySnapshot = undefined
    project.selectedModelIdentityPackId = undefined
    project.modelIdentityPacks = []
    return project
  }
  project.selectedModelIdentityId = identity.id
  project.selectedModelIdentitySnapshot = { ...identity }
  project.selectedModelIdentityPackId = identity.id
  project.modelIdentityPacks = [toProjectPackFromLibrary(identity)]
  return project
}

function normalizeIdentityDescription(pack: ModelIdentityPack) {
  return [
    pack.description,
    `${pack.market}, ${pack.gender}, ${pack.ageRange}`,
    `${pack.hairStyle}, ${pack.skinTone}, ${pack.outfitStyle}`,
    `${pack.mood}, ${pack.sceneStyle}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

function productTypeLockPrompt(productType: CloneProductType) {
  const base = [
    'Product lock: the product must match the user uploaded reference images.',
    'First identify the uploaded product category correctly and treat the uploaded product as the only source of truth.',
    'Product fidelity has higher priority than model styling, outfit styling, composition polish and decorative atmosphere.',
    'Do not change product color, shape, material, pattern, holes, pins, layout, decorative details or surface finish.',
    'Do not add any logo, text, new charm, new pattern or non-existing accessory.',
    'The product must be sharp, realistic, clearly visible and occupy the main visual area, not tiny in the frame.',
  ]
  const specific: Record<CloneProductType, string[]> = {
    earrings: [
      'If the original shot contains another earring or jewelry item, replace that item with the uploaded earrings only.',
      'Earrings must keep the same shape, dangling structure, metal material, color, pearl or zircon details if present.',
      'Use close-up on ear or hand display; jewelry must be crisp, realistic and in focus.',
      'Do not generate duplicate earrings, wrong jewelry, deformed ear or extra accessories.',
    ],
    phone_case: [
      'If the original shot contains another phone case, replace that case with the uploaded case only.',
      'Phone case pattern, color, camera hole, border thickness and layout must match the reference image.',
      'The case must be clearly visible on the phone; do not redesign the case.',
    ],
    clothes: [
      'If the original outfit conflicts with the uploaded clothing product, replace only the relevant clothing item with the uploaded product.',
      'Clothing color, fabric, cut, collar, sleeve shape and pattern must match the reference image.',
      'Do not redesign the clothes or change the silhouette.',
    ],
    toy: [
      'Toy shape, color blocks, material, face details and proportions must match the reference image.',
      'Do not turn the toy into another character or change its scale.',
    ],
    general: [
      'Keep the exact product identity from the reference image and avoid replacing it with a similar generic item.',
      'If another object occupies the same display position in the reference shot, replace that object with the uploaded product only.',
    ],
  }
  return [...base, ...(specific[productType] ?? specific.general)].join(' ')
}

function toPromptModelIdentity(pack: ModelIdentityPack | null | undefined) {
  if (!pack) return undefined
  return {
    id: pack.id,
    description: pack.description,
    market: pack.market,
    gender: pack.gender,
    ageRange: pack.ageRange,
    hairStyle: pack.hairStyle,
    skinTone: pack.skinTone,
    outfitStyle: pack.outfitStyle,
    mood: pack.mood,
    sceneStyle: pack.sceneStyle,
    imagePaths: pack.imagePaths,
  }
}

function buildStoryboardImageNegativePrompt(base?: string) {
  const fixed = [
    'text',
    'logo',
    'watermark',
    'subtitles',
    'caption',
    'typography',
    'letters',
    'numbers',
    'brand mark',
    'ui overlay',
  ]
  return sanitizeNegativePrompt([String(base || '').trim(), ...fixed].filter(Boolean).join(', '), 520)
}

function buildProductStructureDescription(input: {
  category: CloneProductType
  summary?: string
  coreSubject?: string
  connectionStructure?: string
  materialDetails?: string
  wearingPosition?: string
  surfaceDetails?: string
  colorDetails?: string
  geometryDetails?: string
  sizeScale?: string
  matchingRules?: string[]
  compact?: boolean
}) {
  const asciiText = (value: unknown, fallback: string) => {
    const text = keepEnglishLikeText(value, '').trim()
    return text || fallback
  }
  const isReflectiveAccessory =
    normalizeProductType(input.category || 'general') === 'earrings' ||
    /earrings?|ear jewelry|jewelry|jewellery|diamond|zircon|crystal|gem|gemstone|silver|gold|ring|necklace|bracelet/i.test(
      [
        input.category,
        input.summary,
        input.coreSubject,
        input.materialDetails,
        input.surfaceDetails,
        input.colorDetails,
      ]
        .map((item) => String(item || ''))
        .join(' '),
    )
  if (isReflectiveAccessory) {
    const lines = input.compact
      ? [
          `Category: ${input.category}`,
          `Core subject: ${asciiText(input.coreSubject || input.summary, 'same exact object from Product Canonical Source')}`,
          `Connection structure: ${asciiText(input.connectionStructure, 'keep every attachment, connection point, and component relation unchanged')}`,
          `Wearing/display position: ${asciiText(input.wearingPosition, 'keep the same wearing or display position')}`,
          `Geometry details: ${asciiText(input.geometryDetails, 'preserve silhouette, proportions, component count, and hanging structure')}`,
          `Size/scale: ${asciiText(input.sizeScale, 'keep object scale consistent with the reference images')}`,
        ]
      : [
          `Category: ${input.category}`,
          `Summary: ${asciiText(input.summary, 'use the bound product snapshot as the only product fact source')}`,
          `Core subject: ${asciiText(input.coreSubject, 'same exact object from Product Canonical Source')}`,
          `Connection structure: ${asciiText(input.connectionStructure, 'keep every attachment, connection point, and component relation unchanged')}`,
          `Wearing/display position: ${asciiText(input.wearingPosition, 'keep the same wearing or display position')}`,
          'Material handling: preserve only the visible structure and color grouping; do not instruct reflective, metallic, crystal, gemstone, glossy, transparent, or high-specular rendering.',
          `Surface details: ${asciiText(input.surfaceDetails, 'preserve only stable visible surface pattern and micro structure')}`,
          `Color details: ${asciiText(input.colorDetails, 'preserve the exact visible color family without material enhancement')}`,
          `Geometry details: ${asciiText(input.geometryDetails, 'preserve silhouette, proportions, component count, and hanging structure')}`,
          `Size/scale: ${asciiText(input.sizeScale, 'keep object scale consistent with the reference images')}`,
          `Matching rules: ${input.matchingRules?.length ? input.matchingRules.join(' | ') : 'no redesign | no extra parts | no missing parts'}`,
        ]
    return lines.filter(Boolean).join('\n')
  }
  const lines = input.compact
    ? [
        `Category: ${input.category}`,
        `Core subject: ${asciiText(input.coreSubject || input.summary, 'same exact product instance from Product Canonical Source')}`,
        `Connection structure: ${asciiText(input.connectionStructure, 'keep every attachment and connection point unchanged')}`,
        `Material details: ${asciiText(input.materialDetails, 'preserve the exact visible material family and finish')}`,
        `Wearing/display position: ${asciiText(input.wearingPosition, 'keep the same wearing or display position')}`,
        `Color details: ${asciiText(input.colorDetails, 'preserve the exact visible color family')}`,
        `Geometry details: ${asciiText(input.geometryDetails, 'preserve silhouette, shape, proportions, and component count')}`,
        `Size/scale: ${asciiText(input.sizeScale, 'keep product scale consistent with the reference images')}`,
      ]
    : [
        `Category: ${input.category}`,
        `Summary: ${asciiText(input.summary, 'use the bound product snapshot as the only product fact source')}`,
        `Core subject: ${asciiText(input.coreSubject, 'same exact product instance from Product Canonical Source')}`,
        `Connection structure: ${asciiText(input.connectionStructure, 'keep every attachment and connection point unchanged')}`,
        `Material details: ${asciiText(input.materialDetails, 'preserve the exact visible material family and finish')}`,
        `Wearing/display position: ${asciiText(input.wearingPosition, 'keep the same wearing or display position')}`,
        `Surface details: ${asciiText(input.surfaceDetails, 'preserve the same surface texture and micro details')}`,
        `Color details: ${asciiText(input.colorDetails, 'preserve the exact visible color family')}`,
        `Geometry details: ${asciiText(input.geometryDetails, 'preserve silhouette, shape, proportions, and component count')}`,
        `Size/scale: ${asciiText(input.sizeScale, 'keep product scale consistent with the reference images')}`,
        `Matching rules: ${input.matchingRules?.length ? input.matchingRules.join(' | ') : 'no redesign | no extra parts | no missing parts'}`,
      ]
  return lines.filter(Boolean).join('\n')
}

function buildProjectProductAnalysisText(project: CloneProject, fallbackProductType?: CloneProductType) {
  const productAnalysis =
    normalizeStoredProductAnalysis((project as any).boundProductSnapshot?.productAnalysis, normalizeProductType(fallbackProductType || 'general')) ||
    (project.baseBlueprint?.consistencyAssets as any)?.productAnalysis ||
    (project.blueprint?.consistencyAssets as any)?.productAnalysis
  return buildProductStructureDescription({
    category: normalizeProductType(project.baseBlueprint?.productCategory || fallbackProductType || 'general'),
    summary: String(productAnalysis?.summary || '').trim(),
    coreSubject: String(productAnalysis?.coreSubject || '').trim(),
    connectionStructure: String(productAnalysis?.connectionStructure || '').trim(),
    materialDetails: String(productAnalysis?.materialDetails || '').trim(),
    wearingPosition: String(productAnalysis?.wearingPosition || '').trim(),
    surfaceDetails: String(productAnalysis?.surfaceDetails || '').trim(),
    colorDetails: String(productAnalysis?.colorDetails || '').trim(),
    geometryDetails: String(productAnalysis?.geometryDetails || '').trim(),
    sizeScale: String(productAnalysis?.sizeScale || '').trim(),
    matchingRules: Array.isArray(productAnalysis?.matchingRules) ? productAnalysis.matchingRules.map(String).filter(Boolean) : [],
  })
}

function buildIdentityGridProductPoints(project: CloneProject, fallbackProductType?: CloneProductType) {
  const productAnalysis =
    normalizeStoredProductAnalysis((project as any).boundProductSnapshot?.productAnalysis, normalizeProductType(fallbackProductType || 'general')) ||
    (project.baseBlueprint?.consistencyAssets as any)?.productAnalysis ||
    (project.blueprint?.consistencyAssets as any)?.productAnalysis
  const parts = [
    String(project.boundProductSnapshot?.name || '').trim(),
    String(productAnalysis?.category || '').trim(),
    String(productAnalysis?.summary || '').trim(),
    String(productAnalysis?.coreSubject || '').trim(),
    String(productAnalysis?.wearingPosition || '').trim(),
    String(productAnalysis?.rawDescription || '').trim(),
  ].filter(Boolean)
  return parts.join(' | ')
}

function buildEffectiveVideoCompiledPrompt(input: {
  shot: ShotSpec
  project?: CloneProject
  productType?: CloneProductType
  productIdentityText?: string
}) {
  const resolvedProductType =
    input.productType && input.productType !== 'general'
      ? normalizeProductType(input.productType)
      : resolveShotPromptProductType(input.project, input.shot)
  const productIdentityText = ''
  const modelIdentityText = 'Use the storyboard reference image directly. Do not restate product identity or model identity in text.'
  const earringLike = inferEarringLikePromptTarget({
    productType: resolvedProductType,
    visualDescription: input.shot.visualDescription,
    generationPrompt: input.shot.generationPrompt,
    actionDescription: input.shot.actionDescription,
    productFocus: input.shot.productFocus,
    materialNeed: input.shot.materialNeed,
    productIdentityText,
  })
  const normalizedShot = earringLike
    ? {
        ...input.shot,
        productType: 'earrings' as CloneProductType,
        visualDescription: 'Extreme close-up of ear wearing the earring.',
        generationPrompt: sanitizeLegacyShotPromptText(String(input.shot.generationPrompt || '').trim(), 'earrings'),
        actionDescription: sanitizeLegacyShotPromptText(String(input.shot.actionDescription || '').trim(), 'earrings'),
        productFocus: 'Preserve shape, proportions, and structure. Avoid deformation or redesign.',
      }
    : input.shot
  return buildFinalShotVideoPositivePrompt({
    shot: normalizedShot,
    modelIdentityText,
    productIdentityText,
    productMode: detectProductMode(resolvedProductType),
  })
}

function buildBoundProductSnapshotText(project: CloneProject) {
  const snapshot = project.boundProductSnapshot || project.baseBlueprint?.consistencyAssets?.boundProductSnapshot || project.blueprint?.consistencyAssets?.boundProductSnapshot
  if (!snapshot) return ''
  return [
    'BOUND PRODUCT SNAPSHOT (PRIMARY PRODUCT FACT SOURCE):',
    `Product ID: ${snapshot.id}`,
    `Product Name: ${snapshot.name}`,
    `Product Type: ${snapshot.type}`,
    snapshot.storyboardTemplateType ? `Storyboard Template Type: ${snapshot.storyboardTemplateType}` : '',
    snapshot.remark ? `Product Remark: ${snapshot.remark}` : '',
    snapshot.coverImagePath ? `Product Cover: ${snapshot.coverImagePath}` : '',
    snapshot.canonicalSourcePath ? `Canonical Source: ${snapshot.canonicalSourcePath}` : '',
    `Canonical Source Status: ${snapshot.canonicalSourceStatus || 'idle'}`,
    snapshot.originalImagePaths.length ? `Original Image Count: ${snapshot.originalImagePaths.length}` : '',
    snapshot.frozenReferenceImagePaths.length ? `Frozen Reference Count: ${snapshot.frozenReferenceImagePaths.length}` : '',
    'This snapshot is frozen at binding time. If any later text conflicts with it, the snapshot and its reference images win.',
  ]
    .filter(Boolean)
    .join('\n')
}

async function syncProjectBoundProductSnapshotFromLibrary(project: CloneProject) {
  if (!project.productId) return project
  const product = await getProductById(project.productId)
  if (!product) return project
  const originalRefs = collectCloneProductImageRefs(product)
  const normalizedProductAnalysis = normalizeStoredProductAnalysis((product as any).productAnalysis, normalizeProductType(String(product.type || 'general')))
  const analysisBoardPath = String((product as any).analysisBoardPath || '').trim()
  const canonicalSourcePath = String((product as any).canonicalSourcePath || '').trim()
  const frozenReferenceImagePaths = analysisBoardPath
    ? [analysisBoardPath]
    : Array.from(new Set([canonicalSourcePath].filter(Boolean)))
  const boundAt = project.boundProductSnapshot?.boundAt || project.baseBlueprint?.consistencyAssets?.boundProductSnapshot?.boundAt || project.blueprint?.consistencyAssets?.boundProductSnapshot?.boundAt || now()
  const nextSnapshot: NonNullable<CloneProject['boundProductSnapshot']> = {
    id: product.id,
    name: String(product.name || '').trim(),
    type: String(product.type || '').trim(),
    storyboardTemplateType:
      (product as any).storyboardTemplateType === 'general' ||
      (product as any).storyboardTemplateType === 'jewelry' ||
      (product as any).storyboardTemplateType === 'ecommerce_packaging' ||
      (product as any).storyboardTemplateType === 'lifestyle_interaction'
        ? (product as any).storyboardTemplateType
        : undefined,
    remark: String(product.remark || '').trim() || undefined,
    coverImagePath: String(product.coverImagePath || originalRefs[0] || '').trim() || undefined,
    analysisBoardPath: analysisBoardPath || undefined,
    analysisBoardStatus: analysisBoardPath ? 'done' : 'idle',
    canonicalSourcePath: analysisBoardPath ? analysisBoardPath : canonicalSourcePath || String(originalRefs[0] || '').trim() || undefined,
    canonicalSourceStatus: analysisBoardPath || canonicalSourcePath ? 'done' : 'idle',
    productAnalysis: normalizedProductAnalysis,
    originalImagePaths: originalRefs,
    frozenReferenceImagePaths: frozenReferenceImagePaths.length ? frozenReferenceImagePaths : originalRefs,
    boundAt,
    updatedAt: now(),
  }
  const next = { ...project, boundProductSnapshot: nextSnapshot }
  if (next.baseBlueprint?.consistencyAssets) {
    next.baseBlueprint = {
      ...next.baseBlueprint,
      consistencyAssets: {
        ...next.baseBlueprint.consistencyAssets,
        boundProductSnapshot: nextSnapshot,
        originalProductReferenceImages: originalRefs,
        sanitizedProductReferenceImages: frozenReferenceImagePaths.length ? frozenReferenceImagePaths : originalRefs,
        productReferenceImages: frozenReferenceImagePaths.length ? frozenReferenceImagePaths : originalRefs,
        productAnalysis: normalizedProductAnalysis,
        productImageSanitization: {
          ...(next.baseBlueprint.consistencyAssets.productImageSanitization ?? {
            status: 'idle',
            originalPaths: [],
            sanitizedPaths: [],
            failedPaths: [],
            diagnostics: [],
            updatedAt: now(),
          }),
          status: 'done',
          originalPaths: originalRefs,
          sanitizedPaths: frozenReferenceImagePaths.length ? frozenReferenceImagePaths : originalRefs,
          failedPaths: [],
          updatedAt: now(),
        },
        updatedAt: now(),
      },
    }
  }
  if (next.blueprint?.consistencyAssets) {
    next.blueprint = {
      ...next.blueprint,
      consistencyAssets: {
        ...next.blueprint.consistencyAssets,
        boundProductSnapshot: nextSnapshot,
        originalProductReferenceImages: originalRefs,
        sanitizedProductReferenceImages: frozenReferenceImagePaths.length ? frozenReferenceImagePaths : originalRefs,
        productReferenceImages: frozenReferenceImagePaths.length ? frozenReferenceImagePaths : originalRefs,
        productAnalysis: normalizedProductAnalysis,
        productImageSanitization: {
          ...(next.blueprint.consistencyAssets.productImageSanitization ?? {
            status: 'idle',
            originalPaths: [],
            sanitizedPaths: [],
            failedPaths: [],
            diagnostics: [],
            updatedAt: now(),
          }),
          status: 'done',
          originalPaths: originalRefs,
          sanitizedPaths: frozenReferenceImagePaths.length ? frozenReferenceImagePaths : originalRefs,
          failedPaths: [],
          updatedAt: now(),
        },
        updatedAt: now(),
      },
    }
  }
  next.originalProductReferenceImagePaths = originalRefs
  next.sanitizedProductReferenceImagePaths = frozenReferenceImagePaths.length ? frozenReferenceImagePaths : originalRefs
  next.productReferenceImagePaths = frozenReferenceImagePaths.length ? frozenReferenceImagePaths : originalRefs
  return next
}

function resolveBoundCanonicalSourcePath(project: CloneProject) {
  const snapshot = project.boundProductSnapshot || project.baseBlueprint?.consistencyAssets?.boundProductSnapshot || project.blueprint?.consistencyAssets?.boundProductSnapshot
  const snapshotBoard = String((snapshot as any)?.analysisBoardPath || '').trim()
  if (snapshotBoard) return snapshotBoard
  const snapshotCanonical = String(snapshot?.canonicalSourcePath || '').trim()
  if (snapshotCanonical) return snapshotCanonical

  const candidates = [
    ...(project.sanitizedProductReferenceImagePaths ?? []),
    ...(project.baseBlueprint?.consistencyAssets?.sanitizedProductReferenceImages ?? []),
    ...(project.blueprint?.consistencyAssets?.sanitizedProductReferenceImages ?? []),
    ...(project.productReferenceImagePaths ?? []),
    ...(project.blueprint?.shots?.flatMap((shot) => shot.sanitizedProductReferenceImagePaths ?? []) ?? []),
    ...(project.blueprint?.shots?.flatMap((shot) => shot.productReferenceImagePaths ?? []) ?? []),
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)

  const canonicalLike = candidates.find((item) => item.toLowerCase().includes('canonical_source'))
  if (canonicalLike) return canonicalLike
  return candidates[0] || ''
}

function hasReusableBoundProductSnapshot(project: CloneProject) {
  return Boolean(resolveBoundCanonicalSourcePath(project) && resolveProductSnapshotText(project))
}

function resolveProductSnapshotText(project: CloneProject, fallbackProductType?: CloneProductType) {
  const snapshotText = buildBoundProductSnapshotText(project)
  if (snapshotText) return snapshotText
  return buildProjectProductAnalysisText(project, fallbackProductType)
}

function buildPromptProductDescriptionText(project: CloneProject, fallbackProductType?: CloneProductType) {
  const snapshot = project.boundProductSnapshot || project.baseBlueprint?.consistencyAssets?.boundProductSnapshot || project.blueprint?.consistencyAssets?.boundProductSnapshot
  if (snapshot) {
    const category = normalizeProductType(snapshot.type || fallbackProductType || 'general')
    const name = keepEnglishLikeText(snapshot.name, 'bound product') || 'the bound product'
    const remark = keepEnglishLikeText(snapshot.remark, '').trim()
    const analysisText = buildCompactProjectProductAnalysisText(project, category)
    return [
      `Product source: Product Canonical Source only. Category: ${category}.`,
      `Product instance: exact same single product as ${name}.`,
      analysisText || 'Preserve structure, attachments, material, color, geometry, component count, and real wearing/display scale.',
      remark ? `Bound note: ${remark}.` : '',
      'No redesign, no substitute, no extra parts, no missing parts.',
    ]
      .filter(Boolean)
      .join('\n')
  }
  return buildProjectProductAnalysisText(project, fallbackProductType)
}

function buildCompactProjectProductAnalysisText(project: CloneProject, fallbackProductType?: CloneProductType) {
  const productAnalysis =
    normalizeStoredProductAnalysis((project as any).boundProductSnapshot?.productAnalysis, normalizeProductType(fallbackProductType || 'general')) ||
    (project.baseBlueprint?.consistencyAssets as any)?.productAnalysis ||
    (project.blueprint?.consistencyAssets as any)?.productAnalysis
  return buildProductStructureDescription({
    category: normalizeProductType(project.baseBlueprint?.productCategory || fallbackProductType || 'general'),
    summary: String(productAnalysis?.summary || '').trim(),
    coreSubject: String(productAnalysis?.coreSubject || '').trim(),
    connectionStructure: String(productAnalysis?.connectionStructure || '').trim(),
    materialDetails: String(productAnalysis?.materialDetails || '').trim(),
    wearingPosition: String(productAnalysis?.wearingPosition || '').trim(),
    surfaceDetails: String(productAnalysis?.surfaceDetails || '').trim(),
    colorDetails: String(productAnalysis?.colorDetails || '').trim(),
    geometryDetails: String(productAnalysis?.geometryDetails || '').trim(),
    sizeScale: String(productAnalysis?.sizeScale || '').trim(),
    matchingRules: Array.isArray(productAnalysis?.matchingRules) ? productAnalysis.matchingRules.map(String).filter(Boolean) : [],
    compact: true,
  })
}

function storyboardPrimaryProductRefs(project: CloneProject): string[] {
  const snapshot = project.boundProductSnapshot || project.baseBlueprint?.consistencyAssets?.boundProductSnapshot || project.blueprint?.consistencyAssets?.boundProductSnapshot
  const analysisBoardPath = String((snapshot as any)?.analysisBoardPath || '').trim()
  const canonicalSourcePath = String(snapshot?.canonicalSourcePath || '').trim()
  const preferred = [
    analysisBoardPath,
    canonicalSourcePath,
    ...(project.sanitizedProductReferenceImagePaths ?? []),
    ...(project.baseBlueprint?.consistencyAssets?.sanitizedProductReferenceImages ?? []),
    ...(project.blueprint?.consistencyAssets?.sanitizedProductReferenceImages ?? []),
    ...(project.originalProductReferenceImagePaths ?? []),
    ...(project.baseBlueprint?.consistencyAssets?.originalProductReferenceImages ?? []),
    ...(project.blueprint?.consistencyAssets?.originalProductReferenceImages ?? []),
    ...(project.productReferenceImagePaths ?? []),
  ]
  return Array.from(new Set(preferred.map((item) => String(item || '').trim()).filter(Boolean)))
}

function analysisProductRefs(project: CloneProject): string[] {
  const preferred = [
    ...(project.sanitizedProductReferenceImagePaths ?? []),
    ...(project.baseBlueprint?.consistencyAssets?.sanitizedProductReferenceImages ?? []),
    ...(project.blueprint?.consistencyAssets?.sanitizedProductReferenceImages ?? []),
    ...(project.originalProductReferenceImagePaths ?? []),
    ...(project.baseBlueprint?.consistencyAssets?.originalProductReferenceImages ?? []),
    ...(project.blueprint?.consistencyAssets?.originalProductReferenceImages ?? []),
  ]
  return Array.from(new Set(preferred.map((item) => String(item || '').trim()).filter(Boolean)))
}

function isImageFilePath(filePath: string) {
  return /\.(png|jpe?g|webp|bmp)$/i.test(String(filePath || '').trim())
}

function collectCloneProductImageRefs(product: Product): string[] {
  const imageRefs = Array.isArray((product as any).images)
    ? ((product as any).images as Array<{ filePath?: string }>).map((item) => String(item?.filePath || '').trim())
    : []
  const legacyRefs = Object.values(product.assets ?? {})
    .flatMap((assets) => (assets ?? []).map((asset) => String(asset?.filePath || '').trim()))
  const refs = [...imageRefs, ...legacyRefs].filter((filePath) => filePath && isImageFilePath(filePath))
  return Array.from(new Set(refs))
}

function computeProductReferenceSignature(refs: string[]) {
  return refs
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .sort()
    .join('|')
}

async function getProductById(productId: string) {
  const products = await productsRepo.list()
  return products.find((item) => item.id === productId) || null
}

function normalizeStoredProductAnalysis(productAnalysis: any, fallbackProductType: CloneProductType) {
  if (!productAnalysis || typeof productAnalysis !== 'object') return undefined
  return {
    category: normalizeProductType(productAnalysis.category || fallbackProductType),
    summary: String(productAnalysis.summary || '').trim(),
    coreSubject: String(productAnalysis.coreSubject || '').trim(),
    connectionStructure: String(productAnalysis.connectionStructure || '').trim(),
    materialDetails: String(productAnalysis.materialDetails || '').trim(),
    wearingPosition: String(productAnalysis.wearingPosition || '').trim(),
    surfaceDetails: String(productAnalysis.surfaceDetails || '').trim(),
    colorDetails: String(productAnalysis.colorDetails || '').trim(),
    geometryDetails: String(productAnalysis.geometryDetails || '').trim(),
    sizeScale: String(productAnalysis.sizeScale || '').trim(),
    matchingRules: Array.isArray(productAnalysis.matchingRules) ? productAnalysis.matchingRules.map(String).filter(Boolean) : [],
    rawDescription: String(productAnalysis.rawDescription || '').trim(),
    updatedAt: Number(productAnalysis.updatedAt ?? now()) || now(),
  }
}

function buildBoardGenerationDiagnostics(input: {
  productRefs: string[]
  canonicalPath?: string
  boardPath?: string
  prompt: string
  boardSourceDiagnostics?: ProductCanonicalSourceDiagnostic[]
}): ProductCanonicalSourceDiagnostic[] {
  const canonicalDiagnostics: ProductCanonicalSourceDiagnostic[] = input.productRefs.map((originalPath) => ({
    originalPath,
    sanitizedPath: input.canonicalPath || undefined,
    status: input.canonicalPath ? 'sanitized' : 'failed',
    note: input.canonicalPath ? 'Canonical product source generated successfully' : 'Canonical product source generation failed',
    prompt: input.prompt,
    fallbackToOriginal: !input.canonicalPath,
  }))
  const boardDiagnostics: ProductCanonicalSourceDiagnostic[] = input.productRefs.map((originalPath) => ({
    originalPath,
    sanitizedPath: input.boardPath || undefined,
    status: input.boardPath ? 'sanitized' : 'failed',
    note: input.boardPath ? 'Multi-angle product board generated successfully' : 'Multi-angle product board generation failed',
    prompt: input.prompt,
    fallbackToOriginal: !input.boardPath,
  }))
  const sourceDiagnostics: ProductCanonicalSourceDiagnostic[] = (input.boardSourceDiagnostics ?? []).map((item) => ({
    originalPath: item.originalPath,
    sanitizedPath: item.sanitizedPath,
    status: item.status,
    note: item.note || 'Board source sanitization result',
    prompt: item.prompt,
    fallbackToOriginal: item.fallbackToOriginal,
  }))
  return [...canonicalDiagnostics, ...boardDiagnostics, ...sourceDiagnostics]
}

/* Legacy canonical-source extraction path retired in favor of direct product refs.
async function ensureProductCanonicalSourceCache(input: {
  product: Product
  productRefs: string[]
  productType: CloneProductType
}) {
  const productRefs = Array.from(new Set(input.productRefs.map((item) => String(item || '').trim()).filter(Boolean)))
  const signature = computeProductReferenceSignature(productRefs)
  const prompt = getProductCanonicalSourcePrompt()
  const existingBoardPath = String(input.product.analysisBoardPath || '').trim()
  const existingProductAnalysis = normalizeStoredProductAnalysis((input.product as any).productAnalysis, input.productType)
  const hasReadyBoardAndAnalysis =
    String(input.product.analysisBoardStatus || '').trim() === 'done' &&
    Boolean(existingBoardPath) &&
    Boolean(existingProductAnalysis)

  if (hasReadyBoardAndAnalysis) {
    const reusedProduct = await productsRepo.upsert({
      ...input.product,
      analysisSourceSignature: signature,
      canonicalSourceSourceSignature: String(input.product.canonicalSourceSourceSignature || signature).trim() || signature,
    })
    return {
      product: reusedProduct,
      canonicalRefs: [existingBoardPath],
      fallbackToOriginal: false,
    }
  }

  const cacheValid =
    (input.product.analysisBoardStatus === 'done' || input.product.canonicalSourceStatus === 'done') &&
    String(input.product.analysisBoardPath || input.product.canonicalSourcePath || '').trim() &&
    String(input.product.analysisSourceSignature || input.product.canonicalSourceSourceSignature || '').trim() === signature

  if (cacheValid) {
    const boardPath = String(input.product.analysisBoardPath || '').trim()
    const canonicalPath = String(input.product.canonicalSourcePath || '').trim()
    return {
      product: input.product,
      canonicalRefs: [boardPath || canonicalPath].filter(Boolean),
      fallbackToOriginal: false,
    }
  }

  const processingProduct = await productsRepo.upsert({
    ...input.product,
    analysisBoardStatus: 'processing',
    analysisBoardPrompt: prompt,
    analysisBoardDiagnostics: [],
    analysisBoardUpdatedAt: now(),
    analysisSourceSignature: signature,
    canonicalSourceStatus: 'processing',
    canonicalSourcePrompt: prompt,
    canonicalSourceDiagnostics: [],
    canonicalSourceUpdatedAt: now(),
    canonicalSourceSourceSignature: signature,
  })
  let latestProductState = processingProduct

  try {
    const creds = await cloneRepo.getCredentials()
    assertAnalysisBoardImageProviderReady(creds)
    const existingCanonicalPath = String((latestProductState as any).canonicalSourcePath || '').trim()
    const existingCanonicalReady = String((latestProductState as any).canonicalSourceStatus || '').trim() === 'done'
    if (existingCanonicalReady && existingCanonicalPath) {
      const boardPath = await buildProductAnalysisBoard({
        credentials: creds,
        imagePaths: [existingCanonicalPath],
        outDir: join(getAppPaths().tmpDir, 'product-library-analysis-board', processingProduct.id),
        filePrefix: processingProduct.id,
        allowFallback: false,
      })
      const nextProduct = await productsRepo.upsert({
        ...latestProductState,
        analysisBoardPath: boardPath || undefined,
        analysisBoardStatus: boardPath ? 'done' : 'failed',
        analysisBoardPrompt: prompt,
        analysisBoardDiagnostics: [
          {
            originalPath: existingCanonicalPath,
            sanitizedPath: boardPath || undefined,
            status: boardPath ? 'kept' : 'failed',
            note: boardPath
              ? '标准图已存在，已直接重试多角度分析画板。'
              : '标准图已生成成功，但多角度分析画板生成失败，可直接重试画板阶段。',
            prompt,
            fallbackToOriginal: false,
          },
        ],
        analysisBoardUpdatedAt: now(),
        analysisSourceSignature: signature,
        canonicalSourceStatus: 'done',
        canonicalSourceUpdatedAt: now(),
        canonicalSourceSourceSignature: signature,
      })
      latestProductState = nextProduct
      return {
        product: nextProduct,
        canonicalRefs: boardPath ? [boardPath] : [],
        fallbackToOriginal: !boardPath,
      }
    }
    const directWhiteProduct = await tryUseDirectWhiteBackgroundProduct({
      productId: processingProduct.id,
      productType: input.productType,
      productRefs,
      processingProduct,
      prompt,
      signature,
    })
    if (directWhiteProduct) {
      latestProductState = directWhiteProduct
      return {
        product: directWhiteProduct,
        canonicalRefs: directWhiteProduct.analysisBoardPath ? [directWhiteProduct.analysisBoardPath] : [],
        fallbackToOriginal: false,
      }
    }
    const canonicalSourceSanitization = await sanitizeProductReferenceImages({
      cloneProjectId: processingProduct.id,
      productType: input.productType,
      originalPaths: productRefs,
      outDir: join(getAppPaths().tmpDir, 'product-library-canonical-source', processingProduct.id),
    })
    const canonicalSourceRefs = Array.from(
      new Set(canonicalSourceSanitization.sanitizedPaths.map((item) => String(item || '').trim()).filter(Boolean)),
    )
    const canonicalPath = canonicalSourceRefs[0] || ''
    if (!canonicalPath) {
      throw new Error('商品标准图生成失败：未能抽离出纯商品图，请优先上传清晰无遮挡的单张商品图。')
    }
    let productAnalysis =
      normalizeStoredProductAnalysis((processingProduct as any).productAnalysis, input.productType) ||
      {
        ...buildFallbackProductAnalysis(input.productType),
        updatedAt: now(),
      }
    if (canonicalPath) {
      try {
        const analyzedResult = await analyzeProductStructureWithGrs({
          credentials: await cloneRepo.getCredentials(),
          productReferenceImagePaths: [canonicalPath, ...productRefs].filter(Boolean),
          productCategory: input.productType,
          locale: 'zh-CN',
        })
        productAnalysis = {
          ...analyzedResult,
          category: normalizeProductType(analyzedResult.category || input.productType),
          updatedAt: now(),
        }
      } catch (error: any) {
        console.warn('[product-library] product-analysis-fallback', {
          productId: processingProduct.id,
          message: String(error?.message ?? error ?? ''),
        })
        productAnalysis = {
          ...productAnalysis,
          updatedAt: now(),
        }
      }
    }
    const canonicalSuccessProduct = await productsRepo.upsert({
      ...processingProduct,
      canonicalSourcePath: canonicalPath || undefined,
      canonicalSourceStatus: canonicalPath ? 'done' : 'failed',
      canonicalSourcePrompt: prompt,
      canonicalSourceDiagnostics: buildBoardGenerationDiagnostics({
        productRefs,
        canonicalPath: canonicalPath || undefined,
        boardPath: undefined,
        prompt,
        boardSourceDiagnostics: canonicalSourceSanitization.diagnostics,
      }),
      canonicalSourceUpdatedAt: now(),
      canonicalSourceSourceSignature: signature,
      analysisBoardPath: undefined,
      analysisBoardStatus: 'processing',
      analysisBoardPrompt: prompt,
      analysisBoardDiagnostics: [],
      analysisBoardUpdatedAt: now(),
      analysisSourceSignature: signature,
      productAnalysis,
    })
    latestProductState = canonicalSuccessProduct
    const boardPath = await buildProductAnalysisBoard({
      credentials: creds,
      imagePaths: [canonicalPath],
      outDir: join(getAppPaths().tmpDir, 'product-library-analysis-board', processingProduct.id),
      filePrefix: processingProduct.id,
      allowFallback: false,
    })
    const nextProduct = await productsRepo.upsert({
      ...canonicalSuccessProduct,
      analysisBoardPath: boardPath || undefined,
      analysisBoardStatus: boardPath ? 'done' : 'failed',
      analysisBoardPrompt: prompt,
      analysisBoardDiagnostics: buildBoardGenerationDiagnostics({
        productRefs,
        canonicalPath: canonicalPath || undefined,
        boardPath: boardPath || undefined,
        prompt,
        boardSourceDiagnostics: canonicalSourceSanitization.diagnostics,
      }),
      analysisBoardUpdatedAt: now(),
      analysisSourceSignature: signature,
    })
    latestProductState = nextProduct
    return {
      product: nextProduct,
      canonicalRefs: boardPath ? [boardPath] : [],
      fallbackToOriginal: !boardPath,
    }
  } catch (error: any) {
    const preserveCanonical =
      String((latestProductState as any).canonicalSourcePath || '').trim() ||
      ((latestProductState as any).canonicalSourceStatus === 'done')
    const failedProduct = await productsRepo.upsert({
      ...latestProductState,
      analysisBoardPath: undefined,
      analysisBoardStatus: 'failed',
      analysisBoardPrompt: prompt,
      analysisBoardDiagnostics: [
        {
          originalPath: productRefs[0] || '',
          status: 'failed',
          note: String(error?.message ?? error ?? 'Product analysis board generation failed'),
          prompt,
          fallbackToOriginal: true,
        },
      ],
      analysisBoardUpdatedAt: now(),
      analysisSourceSignature: signature,
      canonicalSourcePath: preserveCanonical ? latestProductState.canonicalSourcePath : undefined,
      canonicalSourceStatus: preserveCanonical ? latestProductState.canonicalSourceStatus ?? 'done' : 'failed',
      canonicalSourcePrompt: prompt,
      canonicalSourceDiagnostics: preserveCanonical
        ? latestProductState.canonicalSourceDiagnostics ?? []
        : [
            {
              originalPath: productRefs[0] || '',
              status: 'failed',
              note: String(error?.message ?? error ?? 'Product analysis board generation failed'),
              prompt,
              fallbackToOriginal: true,
            },
          ],
      canonicalSourceUpdatedAt: now(),
      canonicalSourceSourceSignature: signature,
    })
    return {
      product: failedProduct,
      canonicalRefs: [],
      fallbackToOriginal: true,
    }
  }
}
*/

const productCanonicalSourceRefreshJobs = new Set<string>()

async function refreshProductCanonicalSourceFromLibrary(input: { productId: string; force?: boolean }) {
  const product = await getProductById(input.productId)
  if (!product) throw new Error('商品库商品不存在')
  const productRefs = collectCloneProductImageRefs(product)
  if (!productRefs.length) throw new Error('当前商品没有可用于生成标准源的图片')
  const productKey = String(product.id || input.productId).trim()
  const signature = computeProductReferenceSignature(productRefs)
  const prompt = getProductCanonicalSourcePrompt()
  const directPath = String(productRefs[0] || '').trim()
  const boardFilePrefix = input.force ? `${product.id}_analysis_board_${now()}` : product.id
  const processingProduct = await productsRepo.upsert({
    ...product,
    analysisBoardPath: undefined,
    analysisBoardStatus: 'processing',
    analysisBoardPrompt: prompt,
    analysisBoardDiagnostics: [],
    analysisBoardUpdatedAt: now(),
    analysisSourceSignature: signature,
    canonicalSourcePath: directPath || undefined,
    canonicalSourceStatus: directPath ? 'done' : 'failed',
    canonicalSourcePrompt: prompt,
    canonicalSourceDiagnostics: directPath
      ? [
          {
            originalPath: directPath,
            sanitizedPath: directPath,
            status: 'kept',
            note: '已按手动直通模式使用原图，不再执行标准图提纯。',
            prompt,
            fallbackToOriginal: false,
          },
        ]
      : [],
    canonicalSourceUpdatedAt: now(),
    canonicalSourceSourceSignature: signature,
  })
  let latestProductState = processingProduct

  if (!productCanonicalSourceRefreshJobs.has(productKey)) {
    productCanonicalSourceRefreshJobs.add(productKey)
    void (async () => {
      try {
        const creds = await cloneRepo.getCredentials()
        assertAnalysisBoardImageProviderReady(creds)
        if (!directPath) {
          throw new Error('当前商品没有可用于生成多角度画板的图片。')
        }
        let productAnalysis =
          normalizeStoredProductAnalysis((latestProductState as any).productAnalysis, normalizeProductType(String(product.type || 'general'))) ||
          {
            ...buildFallbackProductAnalysis(normalizeProductType(String(product.type || 'general'))),
            updatedAt: now(),
          }
        try {
          const analyzedResult = await analyzeProductStructureWithGrs({
            credentials: creds,
            productReferenceImagePaths: [directPath],
            productCategory: normalizeProductType(String(product.type || 'general')),
            locale: 'zh-CN',
          })
          productAnalysis = {
            ...analyzedResult,
            category: normalizeProductType(analyzedResult.category || String(product.type || 'general')),
            updatedAt: now(),
          }
        } catch (error: any) {
          console.warn('[product-library] refresh-product-analysis-fallback', {
            productId: processingProduct.id,
            message: String(error?.message ?? error ?? ''),
          })
          productAnalysis = {
            ...productAnalysis,
            updatedAt: now(),
          }
        }
        const boardPath = await buildProductAnalysisBoard({
          credentials: creds,
          imagePaths: [directPath],
          outDir: join(getAppPaths().tmpDir, 'product-library-analysis-board', processingProduct.id),
          filePrefix: boardFilePrefix,
          allowFallback: false,
        })
        latestProductState = await productsRepo.upsert({
          ...latestProductState,
          analysisBoardPath: boardPath || undefined,
          analysisBoardStatus: boardPath ? 'done' : 'failed',
          analysisBoardPrompt: prompt,
          analysisBoardDiagnostics: [
            {
              originalPath: directPath,
              sanitizedPath: boardPath || undefined,
              status: boardPath ? 'kept' : 'failed',
              note: boardPath
                ? '已按手动直通模式从上传图直接生成多角度分析画板。'
                : '多角度分析画板生成失败，可直接重试画板阶段。',
              prompt,
              fallbackToOriginal: false,
            },
          ],
          analysisBoardUpdatedAt: now(),
          analysisSourceSignature: signature,
          productAnalysis,
        })
      } catch (error: any) {
        await productsRepo.upsert({
          ...latestProductState,
          analysisBoardPath: undefined,
          analysisBoardStatus: 'failed',
          analysisBoardPrompt: prompt,
          analysisBoardDiagnostics: [
            {
              originalPath: productRefs[0] || '',
              status: 'failed',
              note: String(error?.message ?? error ?? 'Product analysis board generation failed'),
              prompt,
              fallbackToOriginal: true,
            },
          ],
          analysisBoardUpdatedAt: now(),
          analysisSourceSignature: signature,
          canonicalSourcePath: directPath || latestProductState.canonicalSourcePath || undefined,
          canonicalSourceStatus: directPath ? 'done' : latestProductState.canonicalSourceStatus ?? 'failed',
          canonicalSourcePrompt: prompt,
          canonicalSourceDiagnostics: directPath
            ? latestProductState.canonicalSourceDiagnostics ?? [
                {
                  originalPath: directPath,
                  sanitizedPath: directPath,
                  status: 'kept',
                  note: '已按手动直通模式使用原图，不再执行标准图提纯。',
                  prompt,
                  fallbackToOriginal: false,
                },
              ]
            : latestProductState.canonicalSourceDiagnostics ?? [],
          canonicalSourceUpdatedAt: now(),
          canonicalSourceSourceSignature: signature,
          productAnalysis:
            normalizeStoredProductAnalysis((latestProductState as any).productAnalysis, normalizeProductType(String(product.type || 'general'))) ||
            latestProductState.productAnalysis,
        })
      } finally {
        productCanonicalSourceRefreshJobs.delete(productKey)
      }
    })()
  }

  return processingProduct
}

async function refreshProductAnalysisFromLibrary(input: { productId: string }) {
  const product = await getProductById(input.productId)
  if (!product) throw new Error('商品库商品不存在')
  const productRefs = collectCloneProductImageRefs(product)
  const canonicalPath = String(product.canonicalSourcePath || '').trim()
  const analysisBoardPath = String((product as any).analysisBoardPath || '').trim()
  const refs = [analysisBoardPath, canonicalPath, ...productRefs].filter(Boolean)
  if (!refs.length) throw new Error('当前商品没有可用于分析 Product DNA 的图片')

  const productType = normalizeProductType(String(product.type || 'general'))
  let productAnalysis =
    normalizeStoredProductAnalysis((product as any).productAnalysis, productType) ||
    {
      ...buildFallbackProductAnalysis(productType),
      updatedAt: now(),
    }

  console.log('[product-library] refresh-product-dna:start', {
    productId: product.id,
    refs,
    productType,
  })
  const analyzedResult = await analyzeProductStructureWithGrs({
    credentials: await cloneRepo.getCredentials(),
    productReferenceImagePaths: refs,
    productCategory: productType,
    locale: 'zh-CN',
  })
  productAnalysis = {
    ...analyzedResult,
    category: normalizeProductType(analyzedResult.category || productType),
    updatedAt: now(),
  }
  console.log('[product-library] refresh-product-dna:done', {
    productId: product.id,
    category: productAnalysis.category,
    summary: String(productAnalysis.summary || '').slice(0, 120),
  })

  return await productsRepo.upsert({
    ...product,
    productAnalysis,
    updatedAt: now(),
  })
}

async function tryUseDirectWhiteBackgroundProduct(input: {
  productId: string
  productType: CloneProductType
  productRefs: string[]
  processingProduct: Product
  prompt: string
  signature: string
}) {
  const directPath = String(input.productRefs[0] || '').trim()
  if (!directPath) return null

  const auditNote = '已按手动直通模式跳过白底校验，直接使用上传图生成多角度分析画板。'

  const creds = await cloneRepo.getCredentials()
  assertAnalysisBoardImageProviderReady(creds)
  let productAnalysis =
    normalizeStoredProductAnalysis((input.processingProduct as any).productAnalysis, input.productType) ||
    {
      ...buildFallbackProductAnalysis(input.productType),
      updatedAt: now(),
    }
  try {
    const analyzedResult = await analyzeProductStructureWithGrs({
      credentials: await cloneRepo.getCredentials(),
      productReferenceImagePaths: [directPath],
      productCategory: input.productType,
      locale: 'zh-CN',
    })
    productAnalysis = {
      ...analyzedResult,
      category: normalizeProductType(analyzedResult.category || input.productType),
      updatedAt: now(),
    }
  } catch (error: any) {
    console.warn('[product-library] direct-white-product-analysis-fallback', {
      productId: input.productId,
      message: String(error?.message ?? error ?? ''),
    })
    productAnalysis = {
      ...productAnalysis,
      updatedAt: now(),
    }
  }

  const canonicalSuccessProduct = await productsRepo.upsert({
    ...input.processingProduct,
    canonicalSourcePath: directPath,
    canonicalSourceStatus: 'done',
    canonicalSourcePrompt: input.prompt,
    canonicalSourceDiagnostics: [
      {
        originalPath: directPath,
        sanitizedPath: directPath,
        status: 'kept',
        note: auditNote || 'Detected clean white-background product image; used original image directly as canonical source.',
        prompt: input.prompt,
        fallbackToOriginal: false,
      },
    ],
    canonicalSourceUpdatedAt: now(),
    canonicalSourceSourceSignature: input.signature,
    analysisBoardPath: undefined,
    analysisBoardStatus: 'processing',
    analysisBoardPrompt: input.prompt,
    analysisBoardDiagnostics: [],
    analysisBoardUpdatedAt: now(),
    analysisSourceSignature: input.signature,
    productAnalysis,
  })

  const boardPath = await buildProductAnalysisBoard({
    credentials: creds,
    imagePaths: [directPath],
    outDir: join(getAppPaths().tmpDir, 'product-library-analysis-board', input.processingProduct.id),
    filePrefix: input.processingProduct.id,
    allowFallback: false,
  })

  const nextProduct = await productsRepo.upsert({
    ...canonicalSuccessProduct,
    analysisBoardPath: boardPath || undefined,
    analysisBoardStatus: boardPath ? 'done' : 'failed',
    analysisBoardPrompt: input.prompt,
    analysisBoardDiagnostics: [
      {
        originalPath: directPath,
        sanitizedPath: boardPath || undefined,
        status: boardPath ? 'kept' : 'failed',
        note: boardPath
          ? 'Detected clean white-background product image; skipped canonical extraction and generated analysis board directly from the uploaded image.'
          : 'Direct white-background product path failed during analysis board generation.',
        prompt: input.prompt,
        fallbackToOriginal: false,
      },
    ],
    analysisBoardUpdatedAt: now(),
    analysisSourceSignature: input.signature,
  })
  return nextProduct
}

function hasUsableSanitizedProductRefs(project: CloneProject): boolean {
  return analysisProductRefs(project).some((item) =>
    (project.sanitizedProductReferenceImagePaths ?? []).includes(item) ||
    (project.baseBlueprint?.consistencyAssets?.sanitizedProductReferenceImages ?? []).includes(item) ||
    (project.blueprint?.consistencyAssets?.sanitizedProductReferenceImages ?? []).includes(item),
  )
}

function assertStoryboardExtractionReady(project: CloneProject) {
  const refs = Array.from(
    new Set(
      [
        ...(project.originalProductReferenceImagePaths ?? []),
        ...(project.sanitizedProductReferenceImagePaths ?? []),
        ...(project.baseBlueprint?.consistencyAssets?.originalProductReferenceImages ?? []),
        ...(project.baseBlueprint?.consistencyAssets?.sanitizedProductReferenceImages ?? []),
        ...(project.blueprint?.consistencyAssets?.originalProductReferenceImages ?? []),
        ...(project.blueprint?.consistencyAssets?.sanitizedProductReferenceImages ?? []),
      ]
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  )
  if (!refs.length) {
    throw new Error('请先上传商品参考图')
  }
  return
}

function resolveStoryboardProductRefs(project: CloneProject, shot?: ShotSpec, requestedRefs?: string[]): string[] {
  const refs = storyboardPrimaryProductRefs(project)
  if (!refs.length) {
    throw new Error('请先为绑定商品生成标准源')
  }
  return refs
}

async function persistProjectProductRefsDirectly(project: CloneProject, originalRefs: string[]) {
  const normalizedOriginals = Array.from(new Set(originalRefs.map((item) => String(item || '').trim()).filter(Boolean)))
  if (!normalizedOriginals.length) return project
  project.originalProductReferenceImagePaths = normalizedOriginals
  project.sanitizedProductReferenceImagePaths = normalizedOriginals
  project.productReferenceImagePaths = normalizedOriginals
  project.productImageSanitizationStatus = 'done'
  project.productImageSanitizationError = undefined
  if (project.blueprint?.shots?.length) {
    project.blueprint = {
      ...project.blueprint,
      shots: project.blueprint.shots.map((shot) => replaceProductRefsIntoShotWithTracking(shot, normalizedOriginals, normalizedOriginals)),
    }
  }
  if (project.baseBlueprint?.shots?.length) {
    project.baseBlueprint = {
      ...project.baseBlueprint,
      shots: project.baseBlueprint.shots.map((shot) => replaceProductRefsIntoShotWithTracking(shot, normalizedOriginals, normalizedOriginals)),
    }
  }
  if (project.executionBlueprint?.shots?.length) {
    project.executionBlueprint = {
      ...project.executionBlueprint,
      shots: project.executionBlueprint.shots.map((shot) => replaceProductRefsIntoShotWithTracking(shot, normalizedOriginals, normalizedOriginals)),
    }
  }
  const previousAssets: Partial<CloneConsistencyAssetsSnapshot> & { updatedAt: number } =
    project.baseBlueprint?.consistencyAssets ??
    project.blueprint?.consistencyAssets ??
    { updatedAt: now() }
  const nextAssets = {
    ...previousAssets,
    productImageSetIds: normalizedOriginals.map((p) => basename(p)),
    referenceImages: normalizedOriginals,
    productReferenceImages: normalizedOriginals,
    originalProductReferenceImages: normalizedOriginals,
    sanitizedProductReferenceImages: normalizedOriginals,
    productImageSanitization: {
      status: 'done' as const,
      originalPaths: normalizedOriginals,
      sanitizedPaths: normalizedOriginals,
      failedPaths: [],
      diagnostics: [],
      error: undefined,
      updatedAt: now(),
    },
    updatedAt: now(),
  }
  if (project.baseBlueprint) {
    project.baseBlueprint = { ...project.baseBlueprint, consistencyAssets: nextAssets }
  }
  if (project.blueprint) {
    project.blueprint = { ...project.blueprint, consistencyAssets: nextAssets }
  }
  syncProjectBlueprintLayers(project)
  return project
}

/* Legacy project-level product sanitization path retired in favor of direct product refs.
async function sanitizeAndPersistProjectProductRefs(project: CloneProject, originalRefs: string[]) {
  const normalizedOriginals = Array.from(new Set(originalRefs.map((item) => String(item || '').trim()).filter(Boolean)))
  const sanitizationStartedAt = now()
  const processingAssets = {
    ...(project.baseBlueprint?.consistencyAssets ?? project.blueprint?.consistencyAssets ?? { updatedAt: sanitizationStartedAt }),
    originalProductReferenceImages: normalizedOriginals,
    sanitizedProductReferenceImages: [],
    productImageSanitization: {
      status: 'processing' as const,
      originalPaths: normalizedOriginals,
      sanitizedPaths: [],
      failedPaths: [],
      diagnostics: [],
      error: undefined,
      updatedAt: sanitizationStartedAt,
    },
    updatedAt: sanitizationStartedAt,
  }
  project.originalProductReferenceImagePaths = normalizedOriginals
  project.sanitizedProductReferenceImagePaths = []
  project.productReferenceImagePaths = normalizedOriginals
  project.productImageSanitizationStatus = 'processing'
  project.productImageSanitizationError = undefined
  if (project.baseBlueprint) {
    project.baseBlueprint = { ...project.baseBlueprint, consistencyAssets: processingAssets }
  }
  if (project.blueprint) {
    project.blueprint = { ...project.blueprint, consistencyAssets: processingAssets }
  }
  syncProjectBlueprintLayers(project)
  await cloneRepo.upsertProject(project)

  const productType = normalizeProductType(project.baseBlueprint?.productCategory || project.blueprint?.productCategory || 'general')
  const sanitization = await sanitizeProductReferenceImages({
    cloneProjectId: project.id,
    productType,
    originalPaths: normalizedOriginals,
    outDir: join(getAppPaths().tmpDir, 'clone-product-sanitized', project.id),
  })
  const sanitizedRefs = Array.from(new Set(sanitization.sanitizedPaths.map((item) => String(item || '').trim()).filter(Boolean)))
  const failedPaths = sanitization.failed.map((item) => String(item || '').trim()).filter(Boolean)
  const hasAuxiliaryRefs = sanitizedRefs.length > 0
  const sanitizationStatus = (hasAuxiliaryRefs ? 'done' : 'failed') as 'done' | 'failed'
  const sanitizationError = hasAuxiliaryRefs ? undefined : '产品标准源生成失败，当前已回退原图继续。'
  project.productReferenceImagePaths = hasAuxiliaryRefs ? sanitizedRefs : normalizedOriginals
  project.sanitizedProductReferenceImagePaths = sanitizedRefs
  project.productImageSanitizationStatus = sanitizationStatus
  project.productImageSanitizationError = sanitizationError
  if (project.blueprint?.shots?.length) {
    project.blueprint = {
      ...project.blueprint,
      shots: project.blueprint.shots.map((shot) => replaceProductRefsIntoShotWithTracking(shot, normalizedOriginals, sanitizedRefs)),
    }
  }
  if (project.baseBlueprint?.shots?.length) {
    project.baseBlueprint = {
      ...project.baseBlueprint,
      shots: project.baseBlueprint.shots.map((shot) => replaceProductRefsIntoShotWithTracking(shot, normalizedOriginals, sanitizedRefs)),
    }
  }
  if (project.executionBlueprint?.shots?.length) {
    project.executionBlueprint = {
      ...project.executionBlueprint,
      shots: project.executionBlueprint.shots.map((shot) => replaceProductRefsIntoShotWithTracking(shot, normalizedOriginals, sanitizedRefs)),
    }
  }

  const previousAssets: Partial<CloneConsistencyAssetsSnapshot> & { updatedAt: number } =
    project.baseBlueprint?.consistencyAssets ??
    project.blueprint?.consistencyAssets ??
    { updatedAt: now() }
  const nextAssets = {
    ...previousAssets,
    productImageSetIds: normalizedOriginals.map((p) => basename(p)),
    referenceImages: normalizedOriginals,
    productReferenceImages: normalizedOriginals,
    originalProductReferenceImages: normalizedOriginals,
    sanitizedProductReferenceImages: sanitizedRefs,
    productImageSanitization: {
      status: sanitizationStatus,
      originalPaths: normalizedOriginals,
      sanitizedPaths: sanitizedRefs,
      failedPaths,
      diagnostics: sanitization.diagnostics.map((item) => ({
        ...item,
        fallbackToOriginal: Boolean(item.fallbackToOriginal ?? !hasAuxiliaryRefs),
      })),
      error: sanitizationError,
      updatedAt: now(),
    },
    productAnalysis: normalizedOriginals.length ? previousAssets.productAnalysis : undefined,
    updatedAt: now(),
  }
  if (project.baseBlueprint) {
    project.baseBlueprint = { ...project.baseBlueprint, consistencyAssets: nextAssets }
  }
  if (project.blueprint) {
    project.blueprint = { ...project.blueprint, consistencyAssets: nextAssets }
  }
  syncProjectBlueprintLayers(project)
  return project
}
*/

async function bindProjectProductFromLibrary(project: CloneProject, productId: string) {
  const targetProductId = String(productId || '').trim()
  if (!targetProductId) throw new Error('请选择商品库商品')
  const product = await getProductById(targetProductId)
  if (!product) throw new Error('商品库商品不存在')
  const originalRefs = collectCloneProductImageRefs(product)
  if (!originalRefs.length) throw new Error('当前商品没有可用于 /clone 的商品图片')

  const productType = normalizeProductType(project.baseBlueprint?.productCategory || project.blueprint?.productCategory || 'general')
  const cachedProduct = product
  const analysisBoardPath = String((cachedProduct as any).analysisBoardPath || '').trim()
  const canonicalSourcePath = String((cachedProduct as any).canonicalSourcePath || '').trim()
  const preferredRefs = analysisBoardPath
    ? [analysisBoardPath]
    : Array.from(new Set([canonicalSourcePath].filter(Boolean)))
  const effectiveRefs = preferredRefs.length ? preferredRefs : originalRefs
  const hasGeneratedReference = Boolean(analysisBoardPath || canonicalSourcePath)
  const sanitizationStatus: 'done' | 'idle' = hasGeneratedReference ? 'done' : 'idle'
  const fallbackToOriginal = !hasGeneratedReference
  const sanitizationError = fallbackToOriginal ? '产品标准源生成失败，当前已回退原图继续。' : undefined
  const sanitizationDiagnostics: any[] = []
  const coverAssetPath = String(cachedProduct.coverImagePath || originalRefs[0] || '').trim()
  const boundAt = now()
  const boundProductSnapshot: NonNullable<CloneProject['boundProductSnapshot']> = {
    id: cachedProduct.id,
    name: String(cachedProduct.name || '').trim(),
    type: String(cachedProduct.type || '').trim(),
    storyboardTemplateType:
      (cachedProduct as any).storyboardTemplateType === 'general' ||
      (cachedProduct as any).storyboardTemplateType === 'jewelry' ||
      (cachedProduct as any).storyboardTemplateType === 'ecommerce_packaging' ||
      (cachedProduct as any).storyboardTemplateType === 'lifestyle_interaction'
        ? (cachedProduct as any).storyboardTemplateType
        : undefined,
    remark: String(cachedProduct.remark || '').trim() || undefined,
    coverImagePath: coverAssetPath || undefined,
    analysisBoardPath: analysisBoardPath || undefined,
    analysisBoardStatus: analysisBoardPath ? 'done' : 'idle',
    canonicalSourcePath: analysisBoardPath ? analysisBoardPath : canonicalSourcePath || String(originalRefs[0] || '').trim() || undefined,
    canonicalSourceStatus: analysisBoardPath || canonicalSourcePath ? 'done' : 'idle',
    productAnalysis: normalizeStoredProductAnalysis((cachedProduct as any).productAnalysis, productType),
    originalImagePaths: originalRefs,
    frozenReferenceImagePaths: effectiveRefs,
    boundAt,
    updatedAt: boundAt,
  }

  project.productId = cachedProduct.id
  project.coverAssetPath = coverAssetPath || project.coverAssetPath
  project.boundProductSnapshot = boundProductSnapshot
  project.originalProductReferenceImagePaths = originalRefs
  project.sanitizedProductReferenceImagePaths = effectiveRefs
  project.productReferenceImagePaths = effectiveRefs
  project.productImageSanitizationStatus = sanitizationStatus
  project.productImageSanitizationError = sanitizationError

  if (project.blueprint?.shots?.length) {
    project.blueprint = {
      ...project.blueprint,
      shots: project.blueprint.shots.map((shot) => replaceProductRefsIntoShotWithTracking(shot, originalRefs, effectiveRefs)),
    }
  }
  if (project.baseBlueprint?.shots?.length) {
    project.baseBlueprint = {
      ...project.baseBlueprint,
      shots: project.baseBlueprint.shots.map((shot) => replaceProductRefsIntoShotWithTracking(shot, originalRefs, effectiveRefs)),
    }
  }
  if (project.executionBlueprint?.shots?.length) {
    project.executionBlueprint = {
      ...project.executionBlueprint,
      shots: project.executionBlueprint.shots.map((shot) => replaceProductRefsIntoShotWithTracking(shot, originalRefs, effectiveRefs)),
    }
  }

  const previousAssets: Partial<CloneConsistencyAssetsSnapshot> & { updatedAt: number } =
    project.baseBlueprint?.consistencyAssets ??
    project.blueprint?.consistencyAssets ??
    { updatedAt: now() }
  const nextAssets = {
    ...previousAssets,
    boundProductSnapshot,
    productImageSetIds: effectiveRefs.map((p) => basename(p)),
    referenceImages: originalRefs,
    productReferenceImages: effectiveRefs,
    originalProductReferenceImages: originalRefs,
    sanitizedProductReferenceImages: effectiveRefs,
    productImageSanitization: {
      status: sanitizationStatus,
      originalPaths: originalRefs,
      sanitizedPaths: effectiveRefs,
      failedPaths: [],
      diagnostics: sanitizationDiagnostics.map((item) => ({
        ...item,
        fallbackToOriginal: Boolean(item.fallbackToOriginal ?? fallbackToOriginal),
      })),
      error: sanitizationError,
      updatedAt: now(),
    },
    updatedAt: now(),
  }
  if (project.baseBlueprint) {
    project.baseBlueprint = { ...project.baseBlueprint, consistencyAssets: nextAssets }
  }
  if (project.blueprint) {
    project.blueprint = { ...project.blueprint, consistencyAssets: nextAssets }
  }
  syncProjectBlueprintLayers(project)
  return project
}

function buildShotVideoPromptPreviewText(input: {
  project: CloneProject
  shot: ShotSpec
  productType: CloneProductType
  productAnalysisText: string
}) {
  const productIdentityText = buildPromptProductDescriptionText(input.project, input.productType)
  const scriptSpliceText = [
    input.shot.scriptText,
    input.shot.generationPrompt,
    input.shot.visualDescription,
    input.shot.actionDescription,
    input.shot.cameraDescription,
    input.shot.materialNeed,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n')
  const compiled =
    promptConsistencyService.getShotConsistencyReport(input.project.id, input.shot.id) ||
    promptConsistencyService.previewShotConsistencyPrompt(
      input.project.id,
      input.shot,
      toPromptModelIdentity(selectedIdentityPack(input.project)),
      productIdentityText,
    )
  const effectiveShot: ShotSpec = {
    ...input.shot,
    productIdentityText: productIdentityText || input.productAnalysisText,
    aiPrompt: buildStructuredShotPrompt({
      shot: input.shot,
      productType: input.productType,
      productPoints: scriptSpliceText,
      productAnalysisText: productIdentityText || input.productAnalysisText,
    }),
    compiledPrompt: buildEffectiveVideoCompiledPrompt({
      shot: input.shot,
      project: input.project,
      productType: input.productType,
      productIdentityText: productIdentityText || input.productAnalysisText,
    }),
    compiledNegativePrompt: compiled.finalNegativePrompt,
    promptCompilerVersion: compiled.compilerVersion,
    consistencyMode: compiled.strictConsistencyMode ? 'strict' : 'standard',
  }
  const optimizedVideoPrompt = String(effectiveShot.compiledPrompt || '').trim()
  return {
    compiled,
    effectiveShot,
    prompt: optimizedVideoPrompt,
    scriptSpliceText,
  }
}

function buildShotVideoRequestPreview(input: {
  credentials: ModelCredentials
  capability: 'video_image_to_video' | 'video_start_end_to_video'
  positivePrompt: string
  negativePrompt: string
  firstFramePath: string
  lastFramePath?: string
  productReferenceImagePaths: string[]
  modelReferenceImagePaths?: string[]
}) {
  const cfg = resolveApifoxHubCredentials(input.credentials, 'video')
  const provider = String(cfg?.videoProvider || '').trim()
  const endpointStyle = String(cfg?.videoEndpointStyle || '').trim()
  const root = String(cfg?.baseUrl || '').trim().replace(/\/+$/, '')
  if (!root) {
    throw new Error(`${videoProviderLabel(input.credentials)} 视频 Base URL 未配置，无法创建分镜视频任务`)
  }
  const createUrl = provider === 'vidu'
    ? `${root}${input.capability === 'video_start_end_to_video' ? '/vidu/ent/v2/start-end2video' : '/vidu/ent/v2/img2video'}`
    : provider === 'veo'
      ? `${root}/v1/video/create`
      : provider === 'seedance2'
        ? `${root}/v1/video/generations`
        : provider === 'jimeng'
          ? `${root}/v1/video/generations`
          : provider === 'openai_video' || provider === 'sora' || provider === 'grok'
            ? provider === 'grok'
              ? `${root}/v1/video/create`
              : endpointStyle === 'openai_video'
              ? `${root}/v1/video/create`
              : /\/api\/v1\/?$/i.test(root)
                ? `${root}/model/prediction`
                : `${root}/api/v1/model/prediction`
            : provider === 'kling'
              ? /\/api\/v1\/?$/i.test(root)
                ? `${root}/model/prediction`
                : `${root}/api/v1/model/prediction`
              : /\/api\/v1\/?$/i.test(root)
                ? `${root}/model/prediction`
                : `${root}/api/v1/model/prediction`
  const modelCandidates = Array.from(
    new Set(
      [
        cfg?.startEndVideoModel,
        cfg?.imageToVideoModel,
        cfg?.textToVideoModel,
        input.credentials.videoModelPrimary,
        input.credentials.videoModelFallback,
        'veo_3_1',
        'veo3.1',
        'veo3.1-fast',
        'veo3.1-4k',
        'veo3-fast',
        'veo3',
        'veo2-fast',
        'veo2-pro',
        'veo3-pro',
        'veo_3_1-fast-4K',
        'veo_3_1-fast',
        'veo_3_1-lite',
      ]
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  )
  const model = modelCandidates[0] || 'unknown'
  const startFrameUploadUrl = input.firstFramePath ? `UPLOAD_ON_SUBMIT::${basename(input.firstFramePath)}` : ''
  const endFrameUploadUrl = input.lastFramePath ? `UPLOAD_ON_SUBMIT::${basename(input.lastFramePath)}` : undefined
  const orderedReferenceUploadUrls = startFrameUploadUrl ? [startFrameUploadUrl] : []
  let requestBody: Record<string, any> = {
    model,
    prompt: input.positivePrompt,
    negative_prompt: input.negativePrompt || undefined,
    aspect_ratio: '9:16',
    duration: 8,
    resolution: '720p',
    seed: -1,
  }

  if (provider === 'vidu') {
    requestBody = {
      model,
      prompt: input.positivePrompt,
      negative_prompt: input.negativePrompt || undefined,
      aspect_ratio: '9:16',
      duration: 8,
      ...(startFrameUploadUrl ? { image: startFrameUploadUrl } : {}),
      ...(endFrameUploadUrl ? { last_image: endFrameUploadUrl } : {}),
    }
  } else if (provider === 'veo') {
    requestBody = {
      model,
      prompt: input.positivePrompt,
      negative_prompt: input.negativePrompt || undefined,
      images: orderedReferenceUploadUrls.filter(Boolean),
      enhance_prompt: true,
      aspect_ratio: '9:16',
    }
  } else if (provider === 'jimeng') {
    requestBody = {
      model,
      prompt: input.positivePrompt,
      negative_prompt: input.negativePrompt || undefined,
      image_url: startFrameUploadUrl || undefined,
      last_image_url: endFrameUploadUrl || undefined,
      metadata: {
        aspect_ratio: '9:16',
        duration: 8,
      },
    }
  } else if (provider === 'seedance2') {
    requestBody = {
      model,
      content: [
        { type: 'text', text: input.positivePrompt },
        ...(input.negativePrompt ? [{ type: 'text', text: `Negative constraints: ${input.negativePrompt}` }] : []),
        ...orderedReferenceUploadUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
      ],
      metadata: {
        duration: 5,
        resolution: '720p',
        ratio: 'adaptive',
      },
    }
  } else if (provider === 'kling') {
    requestBody = {
      model,
      prompt: input.positivePrompt,
      negative_prompt: input.negativePrompt || undefined,
      ...(startFrameUploadUrl ? { image: startFrameUploadUrl } : {}),
      ...(endFrameUploadUrl ? { last_image: endFrameUploadUrl } : {}),
      aspect_ratio: '9:16',
      duration: 8,
      resolution: '720p',
      seed: -1,
    }
  } else if (provider === 'grok') {
    requestBody = {
      model,
      prompt: input.positivePrompt,
      images: orderedReferenceUploadUrls.filter(Boolean),
      aspect_ratio: '9:16',
      size: '1080P',
    }
  } else if (provider === 'openai_video' || provider === 'sora') {
    requestBody =
      endpointStyle === 'openai_video'
        ? {
            model,
            prompt: input.positivePrompt,
            negative_prompt: input.negativePrompt || undefined,
            images: orderedReferenceUploadUrls.filter(Boolean),
            aspect_ratio: '9:16',
            enhance_prompt: true,
          }
        : {
            model,
            prompt: input.positivePrompt,
            negative_prompt: input.negativePrompt || undefined,
            ...(startFrameUploadUrl ? { image: startFrameUploadUrl } : {}),
            ...(endFrameUploadUrl ? { last_image: endFrameUploadUrl } : {}),
            aspect_ratio: '9:16',
            duration: 8,
            resolution: '720p',
            seed: -1,
          }
  } else {
    if (startFrameUploadUrl) requestBody.image = startFrameUploadUrl
    if (endFrameUploadUrl) requestBody.last_image = endFrameUploadUrl
  }

  return {
    createUrl,
    requestBody,
    debugLog: {
      capability: input.capability,
      provider,
      endpointStyle,
      baseUrl: root,
      createUrl,
      model,
      hasImage: Boolean(startFrameUploadUrl),
      hasLastImage: Boolean(endFrameUploadUrl),
      referenceImageCount: orderedReferenceUploadUrls.length,
      fallbackCandidates: modelCandidates,
      localSourceFiles: {
        firstFramePath: input.firstFramePath || undefined,
        lastFramePath: input.lastFramePath || undefined,
        productReferenceImagePaths: input.productReferenceImagePaths,
        modelReferenceImagePaths: input.modelReferenceImagePaths ?? [],
      },
      uploadedUrlPreview: {
        image: startFrameUploadUrl || undefined,
        last_image: endFrameUploadUrl || undefined,
        referenceImages: orderedReferenceUploadUrls,
      },
    },
  }
}

function buildShotImageRequestPreview(input: {
  credentials: ModelCredentials
  startPrompt: string
  negativePrompt: string
  startRefs: string[]
}) {
  const provider = String(input.credentials.imageProviderPrimary || 'openai').trim() || 'openai'
  const model =
    provider === 'kling'
      ? String(input.credentials.klingImageModel || '').trim() || 'openai/gpt-image-1/edit'
      : provider === 'grsai'
        ? String(input.credentials.grsaiImageModel || '').trim() || 'gpt-image-2'
        : provider === 'apifox_hub'
        ? String(resolveApifoxHubCredentials(input.credentials, 'image')?.imageModel || '').trim() || 'apifox-image'
          : String(input.credentials.openaiImageModel || '').trim() || 'gpt-image-2'
  const quality = (() => {
    const value = String(input.credentials.openaiImageQuality || 'high').trim().toLowerCase()
    return value === 'low' || value === 'medium' || value === 'high' ? value : 'high'
  })()
  const toJson = (prompt: string, urls: string[]) =>
    JSON.stringify(
      {
        aspectRatio: '9:16',
        prompt,
        negativePrompt: input.negativePrompt || undefined,
        quality,
        urls,
        model,
        webHook: '-1',
      },
      null,
      2,
    )
  return {
    requestProvider: provider,
    requestModel: model,
    requestJsonStart: toJson(input.startPrompt, input.startRefs.map((item) => String(item || '').trim()).filter(Boolean)),
    requestJsonEnd: '',
  }
}

function normalizePreviewReferencePaths(paths: Array<string | undefined | null>) {
  return Array.from(
    new Set(
      paths
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  )
}

function resolveExistingLocalPath(...candidates: Array<string | undefined | null>) {
  for (const candidate of candidates) {
    const value = String(candidate || '').trim()
    if (!value) continue
    if (existsSync(value)) return value
  }
  return ''
}

function resolveShotVideoOrderedReferencePaths(project: CloneProject, shot: ShotSpec, firstFramePath: string) {
  const resolvedFirstFramePath = resolveExistingLocalPath(
    firstFramePath,
    shot.gptFirstFramePath,
    shot.generatedFirstFramePath,
    shot.uploadedImagePath,
    shot.gptLastFramePath,
    shot.generatedLastFramePath,
    resolveStoryboardFrameSource(shot),
  )
  if (!resolvedFirstFramePath) {
    throw new Error(`分镜视频缺少可用首帧文件: ${shot.id}`)
  }
  const storyboardReferenceImagePaths = normalizePreviewReferencePaths([resolvedFirstFramePath]).slice(0, 1)
  return {
    productReferenceImagePaths: [] as string[],
    modelReferenceImagePaths: [] as string[],
    storyboardReferenceImagePaths,
    orderedReferenceImagePaths: [...storyboardReferenceImagePaths],
  }
}

function containsCjkText(value: unknown) {
  return /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(String(value || ''))
}

function shouldRefreshProductAnalysis(productAnalysis: any) {
  if (!productAnalysis) return true
  const normalizedCategory = String(productAnalysis?.category || '').trim().toLowerCase()
  const normalizedSummary = String(productAnalysis?.summary || '').trim().toLowerCase()
  const normalizedCoreSubject = String(productAnalysis?.coreSubject || '').trim().toLowerCase()
  const normalizedConnection = String(productAnalysis?.connectionStructure || '').trim().toLowerCase()
  const normalizedGeometry = String(productAnalysis?.geometryDetails || '').trim().toLowerCase()
  const fields = [
    productAnalysis.summary,
    productAnalysis.coreSubject,
    productAnalysis.connectionStructure,
    productAnalysis.materialDetails,
    productAnalysis.wearingPosition,
    productAnalysis.surfaceDetails,
    productAnalysis.colorDetails,
    productAnalysis.geometryDetails,
    productAnalysis.sizeScale,
    productAnalysis.rawDescription,
    ...(Array.isArray(productAnalysis.matchingRules) ? productAnalysis.matchingRules : []),
  ]
  const joined = fields.map((item) => String(item || '').trim()).filter(Boolean).join('\n')
  if (!joined) return true
  const looksGenericFallback =
    normalizedCategory === 'general' &&
    (
      normalizedSummary.includes('use the uploaded reference images as the only valid product identity source') ||
      normalizedCoreSubject.includes('preserve the exact same single product instance shown in the uploaded reference images') ||
      normalizedConnection.includes('keep all connection points') ||
      normalizedGeometry.includes('keep the exact silhouette, geometry, component count')
    )
  if (looksGenericFallback) return true
  return containsCjkText(joined)
}

function buildFallbackProductAnalysis(productType: CloneProductType) {
  if (productType === 'earrings') {
    return {
      category: productType,
      summary: 'Single-source Product DNA for the same earring product.',
      coreSubject: 'The same single earring product instance with no replacement and no redesign.',
      connectionStructure: 'Keep the body, connector, clasp or hinge, dangling parts, chains, and attachment logic unchanged.',
      materialDetails: 'Preserve visible structure and color grouping only. Do not instruct reflective, metallic, crystal, gemstone, glossy, transparent, or high-specular material behavior.',
      wearingPosition: 'Keep the same real support logic, gravity direction, and ear-scale relation.',
      surfaceDetails: 'Keep stable visible texture, stone setting layout, edge treatment, and visible micro details without material enhancement.',
      colorDetails: 'Keep the same visible color family and brightness relation without reflected-light amplification.',
      geometryDetails: 'Keep silhouette, thickness, diameter, length, curvature, component count, and relative placement.',
      sizeScale: 'Keep the same realistic scale and thickness proportion shown across the references.',
      matchingRules: ['same single product instance', 'no redesign', 'no extra parts', 'no missing parts', 'follow the stable structure defined by the canonical product source'],
      rawDescription: 'Structured Product DNA inferred from the single canonical product source for the same earring product.',
    }
  }
  return {
    category: productType,
    summary: 'Single-source Product DNA for the same product.',
    coreSubject: 'The same single product instance with no replacement and no redesign.',
    connectionStructure: 'Keep all stable connection points, assembly relations, opening or closing structures, and component count unchanged.',
    materialDetails: 'Keep the same visible material family and finish. Avoid adding stronger reflectivity, transparency, or decorative material enhancement than shown in the references.',
    wearingPosition: 'Keep the original real-world display or wearing logic implied by the references.',
    surfaceDetails: 'Keep surface texture, polish, engraving, edge treatment, and micro details.',
    colorDetails: 'Keep the same main color family, brightness relation, contrast, and decorative color without reflective amplification.',
    geometryDetails: 'Keep silhouette, thickness, length, proportions, curvature, component count, and relative placement.',
    sizeScale: 'Keep the same realistic scale relation and display proportion shown across the references.',
    matchingRules: [
      'same single product instance',
      'no redesign',
      'no extra parts',
      'no missing parts',
      'follow the stable structure defined by the canonical product source',
    ],
    rawDescription: 'Structured Product DNA inferred from the single canonical product source for the same product.',
  }
}

async function ensureProjectProductAnalysis(project: CloneProject, refs: string[], productType: CloneProductType, locale: CloneLocale) {
  if (project.productId) {
    const boundProduct = await getProductById(project.productId)
    const storedProductAnalysis = normalizeStoredProductAnalysis((boundProduct as any)?.productAnalysis, productType)
    if (storedProductAnalysis && !shouldRefreshProductAnalysis(storedProductAnalysis)) {
      const nextAssets = {
        ...(project.baseBlueprint?.consistencyAssets ?? {}),
        productReferenceImages: refs,
        productAnalysis: storedProductAnalysis,
        updatedAt: now(),
      }
      if (project.baseBlueprint) {
        project.baseBlueprint = { ...project.baseBlueprint, consistencyAssets: nextAssets }
      }
      if (project.blueprint) {
        project.blueprint = { ...project.blueprint, consistencyAssets: nextAssets }
      }
      if (project.boundProductSnapshot) {
        ;(project.boundProductSnapshot as any).productAnalysis = storedProductAnalysis
      }
      return project
    }
  }
  const existing = (project.baseBlueprint?.consistencyAssets as any)?.productAnalysis
  if (existing && !shouldRefreshProductAnalysis(existing)) {
    return project
  }
  if (!refs.length) return project
  let analyzed = buildFallbackProductAnalysis(productType)
  try {
    const analyzedResult = await analyzeProductStructureWithGrs({
      credentials: await cloneRepo.getCredentials(),
      productReferenceImagePaths: refs,
      productCategory: productType,
      locale,
    })
    analyzed = {
      ...analyzedResult,
      category: normalizeProductType(analyzedResult.category || productType),
    }
    if (project.productId) {
      const product = await getProductById(project.productId)
      if (product) {
        await productsRepo.upsert({
          ...product,
          productAnalysis: {
            ...analyzed,
            updatedAt: now(),
          },
        })
      }
    }
  } catch (error) {
    console.warn('[clone] product-analysis-fallback', {
      projectId: project.id,
      productType,
      refs: refs.length,
      message: String((error as any)?.message ?? error ?? ''),
    })
  }
  const nextAssets = {
    ...(project.baseBlueprint?.consistencyAssets ?? {}),
    productReferenceImages: refs,
    productAnalysis: {
      ...analyzed,
      updatedAt: now(),
    },
    updatedAt: now(),
  }
  if (project.baseBlueprint) {
    project.baseBlueprint = {
      ...project.baseBlueprint,
      consistencyAssets: nextAssets,
    }
  }
  if (project.blueprint) {
    project.blueprint = {
      ...project.blueprint,
      consistencyAssets: nextAssets,
    }
  }
  project.productReferenceImagePaths = refs
  syncProjectBlueprintLayers(project)
  return await cloneRepo.upsertProject(project)
}

function shotRoleText(shot: ShotSpec) {
  const role = String(shot.role || shot.purpose || 'detail')
  const map: Record<string, string> = {
    hook: 'opening hook shot that reveals the product clearly in the first second',
    product_closeup: 'product close-up detail shot',
    model_scene: 'usage or wearing scene shot',
    detail: 'trust-building detail shot',
    price_offer: 'offer or value demonstration shot without generated text',
    social_proof: 'trust-building social proof shot',
    cta: 'closing CTA structure shot without text in image',
    problem: 'problem context shot',
    solution: 'solution demonstration shot',
    proof: 'proof and detail verification shot',
  }
  return map[role] ?? map.detail
}

function framingForShot(shot: ShotSpec, productType: CloneProductType) {
  if (productType === 'earrings') return 'tight close-up on ear or hand display, jewelry fills the central focus area'
  if (productType === 'phone_case') return 'close-up or medium close-up of the phone case, camera hole and border visible'
  if (productType === 'clothes') return 'medium shot or close-up showing fabric, cut and pattern clearly'
  if (shot.role === 'hook') return 'close-up with product immediately visible'
  if (shot.role === 'model_scene') return 'medium close-up lifestyle framing'
  return 'clean close-up product framing'
}

function movementForShot(shot: ShotSpec) {
  const motion = String(shot.motion || 'static')
  const map: Record<string, string> = {
    static: 'mostly static handheld shot with tiny natural micro movement',
    zoom_in: 'ultra-slow smooth zoom in from 1.00 to 1.04, tiny change only, with stable speed and no sudden forward motion',
    zoom_out: 'ultra-slow smooth zoom out from 1.04 to 1.00, tiny change only, as a single uninterrupted pull-back within the same close-up family with stable speed',
    pan_left: 'subtle pan left under 3 percent of frame width',
    pan_right: 'subtle pan right under 3 percent of frame width',
    shake: 'controlled handheld movement, no heavy shaking',
    fast_cut: 'brief practical reveal motion, no aggressive transition',
  }
  return map[motion] ?? map.static
}

function hasLegacyClonePromptArtifacts(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return false
  return (
    text.includes('shot script lock:') ||
    text.includes('script role:') ||
    text.includes('generation prompt:') ||
    text.includes('analysis notes:') ||
    text.includes('reference lock mode:') ||
    text.includes('must preserve:') ||
    text.includes('script confidence:') ||
    text.includes('aggregate chat model not enabled') ||
    /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text)
  )
}

function buildStructuredShotPrompt(input: {
  shot: ShotSpec
  productType?: CloneProductType
  productPoints?: string
  productAnalysisText?: string
  retryAttempt?: number
}) {
  const shot = input.shot
  const existingPrompt = String(shot.aiPrompt || '').trim()
  if (existingPrompt && !hasLegacyClonePromptArtifacts(existingPrompt)) {
    return sanitizeGeneratedVideoPrompt(existingPrompt)
  }
  const productType = normalizeProductType(input.productType ?? shot.productType)
  const blueprint = {
    totalDurationSec: Number(shot.durationSec || 3),
    referenceAspectRatio: (shot.prompt?.aspectRatio === '16:9' ? '16:9' : '9:16') as '16:9' | '9:16',
    scriptFrame: { hook: '', problem: '', solution: '', proof: '', cta: '' },
    scriptFramework: { hook: '', painPoint: '', solution: '', proof: '', offer: '', cta: '' },
    rhythm: {
      avgShotDurationSec: Number(shot.durationSec || 3),
      cutDensity: (shot.motion === 'fast_cut' ? 'high' : 'medium') as 'low' | 'medium' | 'high',
      first3SecShotCount: Number(shot.durationSec || 0) <= 3 ? 1 : 0,
      hasFastCut: shot.motion === 'fast_cut',
    },
    visualStyle: {
      scene: 'social commerce product demo scene',
      lighting: 'soft natural daylight',
      cameraStyle: 'smartphone framing',
      movementStyle: movementForShot(shot),
      realismStyle: shot.realismStyle || 'ugc',
    },
    shots: [shot],
    analysisNotes: [],
    transcript: '',
  }
  const prompt = buildCloneShotPrompt({
    blueprint,
    shot: {
      ...shot,
      shotType: shot.shotType ?? (shot.cloneClass === 'model_demo' ? 'model_demo' : 'real_product'),
      framing: shot.framing ?? 'closeup',
      cameraMovement: shot.cameraMovement ?? movementForShot(shot),
      action: shot.action ?? (String(shot.visualPrompt || '').trim() || 'natural product reveal action'),
    },
    productRefs: shot.productReferenceImagePaths ?? [],
    options: {
      productType,
      productDescription: [shot.materialNeed, input.productAnalysisText || ''].filter(Boolean).join('\n'),
      qualityMode: normalizeQualityMode(shot.qualityMode),
      productPoints: [
        input.productPoints || shot.materialNeed,
        input.productAnalysisText || '',
        'Keep product rendering natural and restrained. If the product has diamond, zircon, crystal, gemstone, glossy metal, mirror, or reflective details, suppress highlights aggressively and keep reflections weak, flat, and visually quiet. Prefer a dimmer near-matte look over any noticeable shine. Do not add sparkle, glow, bloom, starburst shine, glitter, luxury VFX, reflective emphasis, or overexposed flashy rendering.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  })
  return prependSilentCommercialGlobalRule([prompt.positive])
}

function normalizeLegacyShotPromptForPersistence(shot: ShotSpec) {
  const existingPrompt = String(shot.aiPrompt || '').trim()
  if (!existingPrompt) return undefined
  const cleaned = sanitizeGeneratedVideoPrompt(existingPrompt)
  if (!cleaned) return undefined
  if (hasLegacyClonePromptArtifacts(existingPrompt) || cleaned !== existingPrompt) {
    return cleaned
  }
  return existingPrompt
}

function buildVideoPlanShotPrompt(input: {
  shot: ShotSpec
  variant: ShotVariant
  productInfo: string
}) {
  const v = input.variant
  const role = v.scriptRole || input.shot.scriptRole || 'unknown'
  const overlay = v.textOverlay || { content: '', position: '', fontSize: 'medium', style: '' }
  return [
    'Create a realistic TikTok UGC ecommerce video shot.',
    '',
    'Shot role:',
    String(role),
    '',
    'Script:',
    String(v.scriptText || ''),
    '',
    'Visual scene:',
    String(v.visualDescription || ''),
    '',
    'Action:',
    String(v.actionDescription || ''),
    '',
    'Camera:',
    String(v.cameraDescription || ''),
    '',
    'Product display:',
    String(v.productDisplay || ''),
    '',
    'Text overlay:',
    `${String(overlay.content || '')}, position: ${String(overlay.position || '')}, size: ${String(overlay.fontSize || 'medium')}`,
    '',
    'Product:',
    input.productInfo,
    '',
    'Consistency:',
    'Use the provided product reference image.',
    'Maintain product shape, color, material and key design details.',
    'Follow the provided start frame and end frame when available.',
    '',
    'Style:',
    'Real handheld smartphone video, natural lighting, TikTok ecommerce style, 9:16 vertical, realistic human hands, natural motion, not cinematic CGI.',
    '',
    'Avoid:',
    'watermark, platform UI, account name, logo, distorted product, wrong text, unreadable text, extra fingers, fake jewelry material, over-polished 3D render.',
  ]
    .join('\n')
    .trim()
}

function defaultQualityNegativePrompt() {
  return buildVideoAntiSparkleNegativePrompt(
    'cgi, 3d render, cartoon, anime, plastic toy, fake product, changed color, changed shape, changed pattern, extra logo, watermark, text, titles, subtitles, captions, labels, packaging text, slogans, random letters, browser UI, ChatGPT, software screen, screen recording, tutorial overlay, account name, platform controls, typographic elements, bad hands, deformed ear, blurry jewelry, low resolution, overexposed, duplicate earrings, wrong product, extra accessories, distorted face, unrealistic skin, floating object, messy background',
  )
}

function segmentKeyByPurpose(purpose: ShotSpec['purpose']): string {
  if (purpose === 'hook') return 'hook'
  if (purpose === 'problem' || purpose === 'solution') return 'show'
  return 'detail'
}

function defaultOutputDirForProject(projectId: string) {
  return join(getAppPaths().dataDir, 'exports', 'clone', projectId)
}

function makeSessionOutputDir(projectId: string, sessionId: string, prefer?: string) {
  const base = String(prefer ?? '').trim() || defaultOutputDirForProject(projectId)
  return join(base, sessionId.slice(0, 8))
}

function extractAllAssets(product: Product): MediaAsset[] {
  const out: MediaAsset[] = []
  for (const seg of Object.keys(product.assets ?? {})) {
    out.push(...((product.assets as Record<string, MediaAsset[]>)[seg] ?? []))
  }
  return out
}

function findAssetById(product: Product, assetId: string): MediaAsset | null {
  for (const seg of Object.keys(product.assets ?? {})) {
    const hit = ((product.assets as Record<string, MediaAsset[]>)[seg] ?? []).find((x) => x.id === assetId)
    if (hit) return hit
  }
  return null
}

async function ensureProjectAssetBankProduct(project: CloneProject): Promise<Product> {
  const all = await productsRepo.list()
  if (project.productId) {
    const hit = all.find((x) => x.id === project.productId)
    if (hit) return hit
  }
  const created = await productsRepo.upsert({
    name: `clone-asset-bank-${project.referenceVideoName.replace(/\.[^.]+$/, '')}-${new Date().toISOString().slice(0, 10)}`,
    type: 'phone_case',
    assets: { hook: [], show: [], detail: [] },
  })
  project.productId = created.id
  return created
}

function inferShotSegmentKey(shot: ShotSpec) {
  const role = String(shot.shotRole || shot.role || shot.purpose || '').toLowerCase()
  if (role.includes('hook') || role.includes('price')) return 'hook'
  if (role.includes('detail') || role.includes('proof')) return 'detail'
  return 'show'
}

function scoreAssetMatch(input: { shot: ShotSpec; asset: MediaAsset; segmentKey: string }) {
  const { shot, asset, segmentKey } = input
  const reasons: string[] = []
  const expectedSegment = inferShotSegmentKey(shot)
  const role = segmentKey === expectedSegment ? 22 : 10
  if (segmentKey === expectedSegment) reasons.push(`段位匹配：${segmentKey}`)

  const clarity = Math.max(0, Math.min(18, Math.round(Number(asset.qualityScore ?? 60) / 5)))
  if ((asset.qualityScore ?? 0) >= 75) reasons.push('历史质量分较高')

  const durationRatio = Number(shot.durationSec || 0) > 0 ? Number(asset.durationSec || 0) / Number(shot.durationSec || 1) : 0
  const duration = durationRatio >= 1 ? 16 : durationRatio >= 0.75 ? 10 : durationRatio >= 0.5 ? 5 : 0
  if (duration >= 10) reasons.push('时长接近目标分镜')

  const width = Number(asset.width || 0)
  const height = Number(asset.height || 0)
  const aspect = width > 0 && height > 0 ? height / Math.max(width, 1) : 0
  const aspectRatio = aspect >= 1.5 ? 14 : aspect >= 1.2 ? 10 : 4
  if (aspectRatio >= 10) reasons.push('竖屏适配较好')

  const shortSide = Math.min(width || 0, height || 0)
  const resolution = shortSide >= 720 ? 12 : shortSide >= 540 ? 7 : 2
  if (resolution >= 10) reasons.push('分辨率满足生产要求')

  const fileName = String(asset.fileName || '').toLowerCase()
  const shotType = String(shot.shotType || shot.cloneClass || '').toLowerCase()
  const realism =
    shotType.includes('model') || shotType.includes('handheld')
      ? fileName.includes('wear') || fileName.includes('hand') || fileName.includes('model')
        ? 12
        : 7
      : shotType.includes('close')
        ? fileName.includes('detail') || fileName.includes('close') || fileName.includes('macro')
          ? 12
          : 7
        : 8
  if (realism >= 10) reasons.push('素材语义接近当前镜头')

  const history = Math.max(0, Math.min(6, Math.round(Number(asset.qualityScore ?? 60) / 16)))
  const total = role + clarity + duration + aspectRatio + resolution + realism + history
  return {
    score: Math.max(0, Math.min(100, total)),
    reasons,
    detail: { role, clarity, duration, aspectRatio, resolution, realism, history, total },
  }
}

function pickBestAssetCandidate(product: Product, shot: ShotSpec) {
  const ranked = Object.entries(product.assets ?? {})
    .flatMap(([segmentKey, assets]) =>
      (assets ?? [])
        .filter((asset) => Number(asset.durationSec || 0) > 0)
        .map((asset) => {
          const scored = scoreAssetMatch({ shot, asset, segmentKey })
          return {
            assetId: asset.id,
            filePath: asset.filePath,
            source: 'local_video' as const,
            score: scored.score,
            detail: scored.detail,
            reasons: scored.reasons,
          }
        }),
    )
    .sort((a, b) => b.score - a.score)
  return ranked[0] ?? null
}

async function matchLocalAssetsForShot(project: CloneProject, shot: ShotSpec) {
  if (!project.productId) return null
  const products = await productsRepo.list()
  const product = products.find((x) => x.id === project.productId)
  if (!product) return null
  const candidate = pickBestAssetCandidate(product, shot)
  if (!candidate || candidate.score < 68) return null
  const asset = findAssetById(product, candidate.assetId)
  if (!asset) return null
  return { candidate, asset, product }
}

async function upsertAssetToProduct(input: {
  product: Product
  segment: string
  filePath: string
}): Promise<{ product: Product; asset: MediaAsset }> {
  const info = await getMediaInfo(input.filePath)
  const ts = now()
  const asset: MediaAsset = {
    id: randomUUID(),
    filePath: input.filePath,
    fileName: info.fileName || basename(input.filePath),
    fileSize: Number(info.fileSize || 0),
    durationSec: Number(info.durationSec || 0),
    width: typeof info.width === 'number' ? info.width : undefined,
    height: typeof info.height === 'number' ? info.height : undefined,
    fps: typeof info.fps === 'number' ? info.fps : undefined,
    bitRate: typeof info.bitRate === 'number' ? info.bitRate : undefined,
    qualityScore: typeof info.qualityScore === 'number' ? info.qualityScore : undefined,
    qualityIssues: Array.isArray(info.qualityIssues) ? info.qualityIssues : undefined,
    thumbnailPath: info.thumbnailPath ?? null,
    thumbnailDataUrl: info.thumbnailDataUrl ?? null,
    createdAt: ts,
  }
  const nextAssets = { ...(input.product.assets ?? {}) }
  nextAssets[input.segment] = [...(nextAssets[input.segment] ?? []), asset]
  const nextProduct = await productsRepo.upsert({
    id: input.product.id,
    name: input.product.name,
    type: input.product.type,
    assets: nextAssets,
  })
  return { product: nextProduct, asset }
}

function buildVariantTitles(project: CloneProject, count: number, strength: 'low' | 'medium' | 'high') {
  const bp = project.baseBlueprint ?? project.blueprint
  if (!bp) return []
  const locale = project.locale
  const starters =
    locale === 'zh-CN'
      ? ['别划走', '看完这一条', '新手也能用', '同款爆款逻辑', '真实效果展示']
      : ['Dung luot qua', 'Xem het video nay', 'Lam nhanh va de', 'Cong thuc video viral', 'Meo nay chot don tot']
  const ctas =
    locale === 'zh-CN'
      ? ['评论领取模板', '需要清单请私信', '收藏后照着拍']
      : ['Comment de lay template', 'Nhan tin de lay checklist', 'Luu lai va quay ngay']
  const filler =
    strength === 'high'
      ? locale === 'zh-CN'
        ? ['开头突出利益点', '中段强化痛点和证明', '结尾给出明确行动']
        : ['Mo dau bang loi ich', 'Danh vao pain point', 'Ket thuc bang CTA manh']
      : strength === 'medium'
        ? locale === 'zh-CN'
          ? ['信息更紧凑', '保持口语感']
          : ['Thong tin gon hon', 'Van phong cach doi thoai']
        : locale === 'zh-CN'
          ? ['轻微改写']
          : ['Bien the nhe']
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const a = starters[i % starters.length]!
    const b = ctas[i % ctas.length]!
    const c = filler[i % filler.length]!
    out.push(`${a}\n${bp.scriptFrame.solution}\n${c}\n${b}`)
  }
  return out
}

async function ensureDerivedTemplate(input: {
  project: CloneProject
  sessionId: string
  count: number
  variantStrength: 'low' | 'medium' | 'high'
}) {
  const bp = input.project.baseBlueprint ?? input.project.blueprint
  if (!bp) throw new Error('蓝图不存在，无法创建会话模板')
  const structure = bp.shots.map((x) => segmentKeyByPurpose(x.purpose))
  const uniqStructure: string[] = []
  for (const seg of structure) if (!uniqStructure.includes(seg)) uniqStructure.push(seg)
  const titlePool = buildVariantTitles(input.project, Math.max(6, input.count), input.variantStrength)
  const minSec = Math.max(8, Math.floor(bp.totalDurationSec * 0.82))
  const maxSec = Math.max(minSec + 2, Math.ceil(bp.totalDurationSec * 1.12))
  return await templatesRepo.upsert({
    name: `clone-session-${input.project.referenceVideoName.replace(/\.[^.]+$/, '')}-${input.sessionId.slice(0, 6)}`,
    segmentSyncMode: 'fixed',
    structure: uniqStructure,
    totalDurationSec: { min: minSec, max: maxSec },
    randomizeOrder: { mode: 'none' },
    transition: { enabled: false, pool: ['hardcut'], durationSec: { min: 0.08, max: 0.14 } } as any,
    audio: { source: 'mute', ducking: { enabled: false, amountDb: 0 } },
    assSubtitle: {
      enabled: true,
      fontName: input.project.locale === 'zh-CN' ? 'Noto Sans SC' : 'Noto Sans',
      fontSize: 72,
      preset: 'white_shadow',
      marginV: 320,
      ttsMarginV: 260,
    } as any,
    titleOverlay: {
      enabled: true,
      textPool: titlePool,
    } as any,
    tts: {
      enabled: false,
      textPool: [],
      voice: input.project.locale === 'zh-CN' ? 'zh-CN-XiaoxiaoNeural' : 'vi-VN-HoaiMyNeural',
      rate: 'default',
      pitch: 'default',
      ttsVolume: 'default',
      mixVolume: 0.9,
      keepOriginal: false,
    } as any,
  } as any)
}

async function detectBlackFrameRatio(filePath: string): Promise<number> {
  return await new Promise<number>((resolve) => {
    let exe = ''
    try {
      exe = getFfmpegExecutable()
    } catch {
      return resolve(0)
    }
    const args = ['-hide_banner', '-i', filePath, '-vf', 'blackdetect=d=0.08:pic_th=0.98', '-an', '-f', 'null', '-']
    const child = spawn(exe, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8')
    })
    child.on('close', async () => {
      try {
        const meta = await probeMedia(filePath)
        const dur = Math.max(0.01, Number(meta.durationSec || 0))
        const matches = [...stderr.matchAll(/black_duration:(\d+(\.\d+)?)/g)]
        const blackDur = matches.reduce((s, m) => s + Number(m[1] || 0), 0)
        resolve(Math.max(0, Math.min(1, blackDur / dur)))
      } catch {
        resolve(0)
      }
    })
    child.on('error', () => resolve(0))
  })
}

async function assessOutputQuality(input: {
  outPath: string
  expectedDurationSec: number
  gate: CloneProject['policy']['qualityGate']
}): Promise<{ score: number; passed: boolean; reasons: string[] }> {
  const reasons: string[] = []
  let score = 100
  const meta = await probeMedia(input.outPath)
  const expected = Math.max(0.01, Number(input.expectedDurationSec || 0))
  const ratio = Number(meta.durationSec || 0) / expected
  if (ratio < input.gate.minDurationRatio || ratio > input.gate.maxDurationRatio) {
    score -= 24
    reasons.push(`duration_ratio:${ratio.toFixed(2)}`)
  }
  const shortSide = Math.min(Number(meta.width || 0), Number(meta.height || 0))
  if (shortSide > 0 && shortSide < input.gate.minShortSide) {
    score -= 20
    reasons.push(`resolution_short_side:${shortSide}`)
  }
  if (input.gate.requireAudio && !meta.hasAudio) {
    score -= 18
    reasons.push('missing_audio')
  }
  const blackRatio = await detectBlackFrameRatio(input.outPath)
  if (blackRatio > input.gate.maxBlackFrameRatio) {
    score -= 28
    reasons.push(`black_ratio:${blackRatio.toFixed(2)}`)
  }
  const passed = score >= 70 && reasons.length === 0
  return { score: Math.max(0, Math.min(100, score)), passed, reasons }
}

async function detectFreezeRatio(filePath: string, durationSec: number): Promise<number> {
  return await new Promise<number>((resolve) => {
    let exe = ''
    try {
      exe = getFfmpegExecutable()
    } catch {
      return resolve(0)
    }
    const args = ['-hide_banner', '-i', filePath, '-vf', 'freezedetect=n=-55dB:d=0.8', '-an', '-f', 'null', '-']
    const child = spawn(exe, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8')
    })
    child.on('close', () => {
      const freezes = [...stderr.matchAll(/freeze_duration:\s*([0-9.]+)/g)].map((m) => Number(m[1] || 0))
      const total = freezes.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0)
      resolve(Math.max(0, Math.min(1, total / Math.max(0.01, durationSec))))
    })
    child.on('error', () => resolve(0))
  })
}

async function qualityCheckShot(input: {
  shot: ShotSpec
  filePath: string
  firstFramePath?: string
  source?: 'cloud' | 'upload' | 'existing'
}): Promise<{
  passed: boolean
  score: number
  reasons: string[]
  meta: { durationSec?: number; width?: number; height?: number }
}> {
  const result = await productionQualityCheckShot({
    shot: input.shot,
    filePath: input.filePath,
    targetDurationSec: input.shot.durationSec,
  })
  return {
    passed: result.canEnterRender,
    score: result.qualityScore,
    reasons: result.qualityReasons,
    meta: {
      durationSec: result.generatedClipDurationSec,
      width: result.generatedClipWidth,
      height: result.generatedClipHeight,
    },
  }
}

function patchQueueJobStatus(
  project: CloneProject,
  shotId: string,
  status: 'queued' | 'running' | 'done' | 'failed' | 'skipped',
  retryCount?: number,
) {
  if (!project.generationQueue?.jobs?.length) return
  const ts = now()
  project.generationQueue = {
    ...createCloneGenerationQueue(project),
    jobs: project.generationQueue.jobs.map((job) =>
      job.shotId === shotId
        ? {
            ...job,
            status,
            retryCount: retryCount ?? job.retryCount,
            updatedAt: ts,
          }
        : job,
    ),
  }
}

function sortCloneShotsForBatch(shots: ShotSpec[]) {
  return [...shots].sort((a, b) => {
    const riskScore = (shot: ShotSpec) =>
      shot.realismRisk === 'low' ? 0 : shot.realismRisk === 'medium' ? 1 : 2
    const aRisk = riskScore(a)
    const bRisk = riskScore(b)
    if (aRisk !== bRisk) return aRisk - bRisk
    const aDuration = Number(a.durationSec || 0)
    const bDuration = Number(b.durationSec || 0)
    if (aDuration !== bDuration) return aDuration - bDuration
    return Number(b.assetMatchScore || 0) - Number(a.assetMatchScore || 0)
  })
}

function getShotVideoOutputMap(project?: CloneProject | null) {
  const map = new Map<string, CloneShotVideoOutput>()
  for (const item of project?.shotVideoOutputs ?? []) {
    const shotId = String(item?.shotId ?? '').trim()
    if (!shotId) continue
    map.set(shotId, item)
  }
  return map
}

function getEffectiveShotState(shot: ShotSpec, output?: CloneShotVideoOutput) {
  const outputVideoPath = String(output?.videoPath || output?.localPath || '').trim()
  const generatedClipPath = String(shot.generatedClipPath || outputVideoPath).trim()
  const generatedSource = String(shot.generatedSource || (outputVideoPath ? 'cloud' : '')).trim()
  const generatedProvider = String(shot.generatedProvider || output?.provider || '').trim()
  const generatedModel = String(shot.generatedModel || output?.model || '').trim()
  const status = String(shot.status || '').trim()
  const outputStatus = String(output?.status || '').trim()
  const qualityStatus = String(shot.qualityStatus || '').trim().toLowerCase()
  const hasUsableOutput = outputStatus === 'done' && Boolean(outputVideoPath)
  const canEnterRender =
    typeof shot.canEnterRender === 'boolean' && !(shot.canEnterRender === false && hasUsableOutput && qualityStatus !== 'failed')
      ? shot.canEnterRender
      : hasUsableOutput

  return {
    generatedClipPath,
    generatedSource,
    generatedProvider,
    generatedModel,
    canEnterRender,
    isOutputDone: outputStatus === 'done' && Boolean(outputVideoPath),
    outputVideoPath,
    status,
  }
}

async function reconcileRenderableShotsBeforeCompose(project: CloneProject) {
  const outputMap = getShotVideoOutputMap(project)
  let changed = false
  for (const shot of project.blueprint?.shots ?? []) {
    const output = outputMap.get(String(shot.id))
    const effective = getEffectiveShotState(shot, output)
    const renderablePath = String(shot.uploadedAssetPath || effective.generatedClipPath || effective.outputVideoPath || '').trim()
    if (!renderablePath) continue
    try {
      const file = await stat(renderablePath)
      if (!file.isFile() || file.size <= 0) continue
    } catch {
      continue
    }
    const shouldHydrateRenderableState =
      Boolean(output) &&
      String(output?.status || '').toLowerCase() === 'done' &&
      (
        String(shot.generatedClipPath || '').trim() !== renderablePath ||
        String(shot.status || '').toLowerCase() !== 'done' ||
        shot.canEnterRender !== true ||
        String(shot.qualityStatus || '').toLowerCase() === 'failed' ||
        String(shot.error || '').trim().length > 0
      )
    if (shouldHydrateRenderableState) {
      const ensuredOutput = output!
      replaceProjectShot(project, shot.id, {
        generatedClipPath: renderablePath,
        generatedSource: shot.uploadedAssetPath ? shot.generatedSource : (shot.generatedSource || 'cloud'),
        generatedProvider: shot.generatedProvider || ensuredOutput.provider,
        generatedModel: shot.generatedModel || ensuredOutput.model,
        generatedTaskId: sanitizeVideoTaskId(shot.generatedTaskId || ensuredOutput.taskId),
        status: 'done',
        error: '',
        qualityStatus: 'passed',
        qualityReasons: [],
        canEnterRender: true,
      })
      syncSegmentVideoOutput(project, shot, {
        status: 'done',
        error: undefined,
        taskId: ensuredOutput.taskId || shot.generatedTaskId,
        provider: ensuredOutput.provider || shot.generatedProvider,
        model: ensuredOutput.model || shot.generatedModel,
        localPath: ensuredOutput.localPath || ensuredOutput.videoPath || renderablePath,
        videoPath: ensuredOutput.videoPath || ensuredOutput.localPath || renderablePath,
        completedAt: ensuredOutput.completedAt || now(),
      })
      changed = true
      continue
    }
    const hasStaleFailure =
      String(shot.status || '').toLowerCase() === 'failed' ||
      String(shot.error || '').trim().length > 0 ||
      String(shot.qualityStatus || '').toLowerCase() === 'failed' ||
      (output ? String(output.status || '').toLowerCase() === 'failed' || String(output.error || '').trim().length > 0 : false)
    if (!hasStaleFailure) continue
    replaceProjectShot(project, shot.id, {
      generatedClipPath: renderablePath,
      generatedSource: shot.uploadedAssetPath ? shot.generatedSource : (shot.generatedSource || 'cloud'),
      generatedProvider: shot.generatedProvider || output?.provider,
      generatedModel: shot.generatedModel || output?.model,
      generatedTaskId: sanitizeVideoTaskId(shot.generatedTaskId || output?.taskId),
      status: 'done',
      error: '',
      qualityStatus: String(shot.qualityStatus || '').toLowerCase() === 'failed' ? 'passed' : shot.qualityStatus,
      qualityReasons: [],
      canEnterRender: true,
    })
    if (output) {
      syncSegmentVideoOutput(project, shot, {
        status: 'done',
        error: undefined,
        taskId: output.taskId || shot.generatedTaskId,
        provider: output.provider || shot.generatedProvider,
        model: output.model || shot.generatedModel,
        localPath: output.localPath || output.videoPath || renderablePath,
        videoPath: output.videoPath || output.localPath || renderablePath,
        completedAt: output.completedAt || now(),
      })
    }
    changed = true
  }
  if (!changed) return project
  project.lastError = ''
  setProjectErrorContext(project, null)
  return await cloneRepo.upsertProject(project)
}

async function refreshGenerationQueueRuntime(projectId: string, activePatch?: Partial<NonNullable<CloneProject['generationQueue']>['runtime']>) {
  return await refreshGenerationQueueRuntimeBase({
    projectId,
    activePatch,
    getProject: (targetProjectId) => cloneRepo.getProject(targetProjectId),
    upsertProject: (project) => cloneRepo.upsertProject(project),
    summarizeVideoDispatchCounts: (project) =>
      summarizeVideoDispatchCounts({
        project,
        shots: projectBlueprintShots(project),
        resolveShotVideoOutput,
      }),
    computeGenerationQueueRuntimeSummary,
  })
}

async function getReadonlyProjectWithRuntime(project: CloneProject) {
  const latest = (await cloneRepo.getProject(project.id)) || project
  ensureCloneFlowState(latest)
  const outputs = projectBlueprintShots(latest).map((shot) => resolveShotVideoOutput(latest, shot))
  const runtime = shotVideoOrchestrator.summarize(
    latest,
    outputs.map((item) => ({
      status: String(item.status || ''),
      taskId: item.taskId,
      videoUrl: item.videoUrl,
      videoPath: item.videoPath,
      localPath: item.localPath,
    })),
  )
  latest.generationQueue = {
    ...(latest.generationQueue || createCloneGenerationQueue(latest)),
    runtime,
  }
  return latest
}

async function runVideoTaskPoolJob<T>(input: {
  pool: 'submit' | 'poll' | 'download'
  project: CloneProject
  shotId?: string
  taskId?: string
  worker: () => Promise<T>
}) {
  const entry = input.shotId
    ? shotVideoOrchestrator.begin({
        projectId: input.project.id,
        shotId: input.shotId,
        pool: input.pool,
        taskId: input.taskId,
      })
    : null
  try {
    return await runVideoTaskPoolJobBase({
      ...input,
      refreshGenerationQueueRuntime: ({ projectId, activePatch }) => refreshGenerationQueueRuntime(projectId, activePatch),
      getProject: (projectId) => cloneRepo.getProject(projectId),
    })
  } finally {
    if (entry) {
      shotVideoOrchestrator.finish({
        projectId: entry.projectId,
        shotId: entry.shotId,
        version: entry.version,
      })
    }
  }
}

function buildPreflightIssues(shots: ShotSpec[], project?: CloneProject | null, options?: { allowMockCompose?: boolean }) {
  const issues: string[] = []
  const outputMap = getShotVideoOutputMap(project)
  for (const shot of shots) {
    const label = '分镜 #' + (Number(shot.index || 0) + 1)
    if (shot.cloneEligible === false) {
      if (!shot.locked && shot.replaceMode !== 'locked') issues.push(label + ': 已过滤但未跳过，' + (shot.filterReason || '该片段不适合真实商品复刻'))
      continue
    }
    if (shot.locked || shot.replaceMode === 'locked') continue
    const hasUpload = Boolean(shot.uploadedAssetPath)
    const effective = getEffectiveShotState(shot, outputMap.get(String(shot.id)))
    const cloudLikeShot = {
      ...shot,
      generatedClipPath: effective.generatedClipPath,
      generatedSource: effective.generatedSource as ShotSpec['generatedSource'],
      generatedProvider: effective.generatedProvider,
      generatedModel: effective.generatedModel,
      canEnterRender: effective.canEnterRender,
    }
    const hasCloud = isCloudGeneratedShot(cloudLikeShot)
    if (shot.status === 'failed') issues.push((label + ': 处于失败状态 ' + (shot.error || '')).trim())
    if ((shot.isMock || shot.generatedSource === 'mock') && !options?.allowMockCompose) {
      issues.push(label + ': mock 片段不可出片')
    }
    if (!hasUpload && !hasCloud) issues.push(label + ': 缺少可用视频')
    if (effective.generatedClipPath && !hasCloud && !hasUpload) issues.push(label + ': AI 片段不是合格云端结果')
    if (hasCloud && !effective.canEnterRender && !options?.allowMockCompose) issues.push(label + ': AI 片段未通过生产质检')
    // 合成阶段会按复刻分镜时长重新裁剪已有视频片段，因此时长偏差本身不再阻塞出片。
  }
  return issues
}

function patchShot(
  target: ShotSpec,
  patch: {
    sourceMode?: ShotSourceMode
    uploadedAssetIds?: string[]
    aiEnabled?: boolean
    promptOverrides?: Partial<ShotSpec['prompt']>
    reviewStatus?: CloneReviewStatus
  },
) {
  const sourceMode = patch.sourceMode ?? target.sourceMode
  const uploadedAssetIds = patch.uploadedAssetIds ?? target.uploadedAssetIds
  const aiEnabled = patch.aiEnabled ?? target.aiEnabled
  const prompt = patch.promptOverrides ? { ...target.prompt, ...patch.promptOverrides } : target.prompt
  const reviewStatus = patch.reviewStatus ?? target.reviewStatus
  return { ...target, sourceMode, uploadedAssetIds, aiEnabled, prompt, reviewStatus }
}

function patchShotKeyframe(target: ShotSpec, which: 'start' | 'end', nextAsset: ShotKeyframeAsset): ShotSpec {
  const prev = target.keyframes ?? { styleHints: [], consistencyMode: 'soft' as const }
  if (which === 'start') return { ...target, keyframes: { ...prev, startFrame: nextAsset } }
  return { ...target, keyframes: { ...prev, endFrame: nextAsset } }
}

function summarizeShotSources(shots: ShotSpec[]) {
  const pending = shots.filter((x) => x.sourceMode === 'pending').length
  const uploaded = shots.filter((x) => x.sourceMode === 'uploaded').length
  const ai = shots.filter((x) => x.sourceMode === 'ai').length
  return `U:${uploaded} AI:${ai} P:${pending}`
}

function summarizeProviders(project: CloneProject) {
  const done = (project.aiTasks ?? []).filter((x) => x.status === 'done')
  if (!done.length) return 'manual'
  const seedance = done.filter((x) => x.provider === 'seedance').length
  const kling = done.filter((x) => x.provider === 'kling').length
  const grsai = done.filter((x) => x.provider === 'grsai').length
  return `seedance:${seedance},atlascloud:${kling},grsai:${grsai}`
}

function buildSessionStats(session: ReplicaSession, reviewDecisions: Record<string, CloneReviewStatus>) {
  const resultList = Object.values(session.results)
  const total = session.taskIds.length
  const passed = resultList.filter((x) => x.status === 'passed').length
  const rejected = resultList.filter((x) => x.status === 'rejected').length
  const failed = resultList.filter((x) => x.status === 'failed').length
  const avgScore = resultList.length
    ? resultList.reduce((s, x) => s + Number(x.qualityScore || 0), 0) / resultList.length
    : 0
  let pending = 0
  let keep = 0
  let reject = 0
  for (const id of session.taskIds) {
    const r = reviewDecisions[id] ?? 'pending'
    if (r === 'keep') keep++
    else if (r === 'reject') reject++
    else pending++
  }
  return {
    qualityStats: {
      total,
      passed,
      rejected,
      failed,
      avgScore: Number(avgScore.toFixed(2)),
    },
    reviewStats: { pending, keep, reject },
  }
}

function mapRoleToTemplateSegment(role?: ShotSpec['role']): string {
  if (role === 'hook') return 'hook'
  if (role === 'product_closeup') return 'show'
  if (role === 'model_scene') return 'scene'
  if (role === 'detail') return 'detail'
  if (role === 'price_offer') return 'offer'
  if (role === 'social_proof') return 'proof'
  if (role === 'cta') return 'cta'
  return 'show'
}

function isCloudGeneratedShot(shot: ShotSpec) {
  const source = String(shot.generatedSource ?? '')
  const model = String(shot.generatedModel ?? '')
  return (
    Boolean(shot.generatedClipPath) &&
    source === 'cloud' &&
    !model.startsWith('mock-') &&
    model !== 'mock-i2v' &&
    model !== 'mock-image2video' &&
    model !== 'mock-reference'
  )
}

function isCloudProviderResult(shot: ShotSpec) {
  const source = String(shot.generatedSource ?? '')
  const model = String(shot.generatedModel ?? '')
  return (
    source === 'cloud' &&
    !shot.isMock &&
    !model.startsWith('mock-') &&
    model !== 'mock-i2v' &&
    model !== 'mock-image2video' &&
    model !== 'mock-reference'
  )
}

function mapCloneBlueprintToTemplate(item: CloneProject) {
  const blueprint = item.blueprint
  if (!blueprint) throw new Error('复刻项目或蓝图不存在')
  const structure = blueprint.shots
    .map((s) => mapRoleToTemplateSegment(s.role))
    .filter((x, idx, arr) => arr.indexOf(x) === idx)
  const total = Number(blueprint.totalDurationSec || 15)
  return {
    name: '复刻模板-' + item.referenceVideoName.replace(/\.[^.]+$/, ''),
    segmentSyncMode: 'fixed' as const,
    structure,
    totalDurationSec: { min: Math.max(6, Math.floor(total * 0.9)), max: Math.max(8, Math.ceil(total * 1.1)) },
    randomizeOrder: { mode: 'none' as const },
    transition: { enabled: true, pool: ['hardcut', 'fade'], durationSec: { min: 0.08, max: 0.2 } } as any,
    audio: { source: 'mute', ducking: { enabled: false, amountDb: 0 } },
    meta: {
      source: 'clone_blueprint' as const,
      cloneProjectId: item.id,
      hookType: blueprint.hookType,
      productCategory: blueprint.productCategory,
      rhythm: blueprint.rhythm,
      visualStyle: blueprint.visualStyle,
    },
  }
}

function isRenderableShot(shot: ShotSpec) {
  if (shot.cloneEligible === false) return false
  if (shot.isMock || shot.generatedSource === 'mock' || shot.generatedSource === 'local') return false
  if (shot.uploadedAssetPath) return true
  if (!isCloudGeneratedShot(shot)) return false
  return Boolean(shot.canEnterRender)
}

function toRenderableShot(shot: ShotSpec, project?: CloneProject | null) {
  const output = getShotVideoOutputMap(project).get(String(shot.id))
  const effective = getEffectiveShotState(shot, output)
  return {
    ...shot,
    uploadedAssetPath: shot.uploadedAssetPath || effective.outputVideoPath || shot.generatedClipPath,
    generatedClipPath: effective.generatedClipPath || shot.generatedClipPath,
    generatedSource: (effective.generatedSource || shot.generatedSource) as ShotSpec['generatedSource'],
    generatedProvider: effective.generatedProvider || shot.generatedProvider,
    generatedModel: effective.generatedModel || shot.generatedModel,
    canEnterRender: effective.canEnterRender,
  } satisfies ShotSpec
}

function assertShotEligibleForAi(shot: ShotSpec) {
  if (shot.cloneEligible === false) {
    throw new Error('分镜 #' + (Number(shot.index || 0) + 1) + ' 已过滤：' + (shot.filterReason || '该片段不适合参与真实商品复刻'))
  }
}

function assertShotHasScriptPrompt(shot: ShotSpec) {
  if (Number(shot.scriptConfidence ?? 0) <= 0 && !String(shot.generationPrompt || '').trim()) {
    throw new Error('分镜 #' + (Number(shot.index || 0) + 1) + ' 脚本分析失败，可手动填写或重新分析后再生成')
  }
}

function hasProductLock(shot: ShotSpec, refs?: string[]) {
  return Boolean(
    refs?.length ||
      shot.productReferenceImagePaths?.length ||
      shot.productMainImage ||
      String(shot.aiPrompt || '').includes('Product lock') ||
      String(shot.materialNeed || '').trim(),
  )
}

function renderableShots(shots: ShotSpec[], project?: CloneProject | null) {
  return shots
    .map((x) => toRenderableShot(x, project))
    .filter((x) => x.cloneEligible !== false && isRenderableShot(x))
}

function fallbackRenderableShots(shots: ShotSpec[], project?: CloneProject | null) {
  return shots
    .map((x) => toRenderableShot(x, project))
    .filter((x) => {
      if (x.cloneEligible === false) return false
      if (x.isMock || x.generatedSource === 'mock' || x.generatedSource === 'local') return false
      return Boolean(String(x.uploadedAssetPath || x.generatedClipPath || '').trim())
    })
}

function mergeProductRefsIntoShot(shot: ShotSpec, refs: string[]): ShotSpec {
  const normalizedRefs = refs.map((x) => String(x || '').trim()).filter(Boolean)
  if (!normalizedRefs.length) return shot
  const productMainImage = shot.productMainImage || normalizedRefs[0]
  const inheritedDetails = shot.productDetailImages?.length ? shot.productDetailImages : normalizedRefs.slice(1, 4)
  return {
    ...shot,
    forceAi: true,
    productMainImage,
    productDetailImages: inheritedDetails,
    productReferenceImagePaths: Array.from(
      new Set([
        productMainImage,
        ...inheritedDetails,
        ...(shot.productUsageImages ?? []),
        ...(shot.styleReferenceImages ?? []),
        ...(shot.productReferenceImagePaths ?? []),
        ...normalizedRefs,
      ].filter(Boolean).map(String)),
    ),
  }
}

function replaceProductRefsIntoShot(shot: ShotSpec, refs: string[]): ShotSpec {
  const normalizedRefs = refs.map((x) => String(x || '').trim()).filter(Boolean)
  const productMainImage = normalizedRefs[0]
  const productDetailImages = normalizedRefs.slice(1, 4)
  return {
    ...shot,
    forceAi: true,
    productMainImage,
    productDetailImages,
    productReferenceImagePaths: normalizedRefs,
  }
}

function effectiveProjectProductRefs(project: CloneProject): string[] {
  const preferred = [
    ...analysisProductRefs(project),
  ]
  return Array.from(new Set(preferred.map((item) => String(item || '').trim()).filter(Boolean)))
}

function replaceProductRefsIntoShotWithTracking(shot: ShotSpec, originalRefs: string[], sanitizedRefs: string[]): ShotSpec {
  const next = replaceProductRefsIntoShot(shot, originalRefs)
  return {
    ...next,
    originalProductReferenceImagePaths: originalRefs,
    sanitizedProductReferenceImagePaths: sanitizedRefs,
  }
}

function collectProjectProductReferenceImages(project: CloneProject): string[] {
  const effectiveRefs = storyboardPrimaryProductRefs(project)
  if (effectiveRefs.length) return effectiveRefs
  const refs = new Set<string>()
  for (const item of project.baseBlueprint?.consistencyAssets?.productReferenceImages ?? []) {
    const text = String(item || '').trim()
    if (text) refs.add(text)
  }
  for (const item of project.blueprint?.consistencyAssets?.productReferenceImages ?? []) {
    const text = String(item || '').trim()
    if (text) refs.add(text)
  }
  for (const shot of projectBlueprintShots(project)) {
    for (const item of shot.productReferenceImagePaths ?? []) {
      const text = String(item || '').trim()
      if (text) refs.add(text)
    }
  }
  return Array.from(refs)
}

async function assertCloudMotionVideo(filePath: string) {
  const meta = await probeMedia(filePath)
  const durationSec = Number(meta.durationSec || 0)
  const bitRate = Number(meta.bitRate || 0)
  if (durationSec <= 0.5) throw new Error('云端返回视频时长异常')
  if (bitRate > 0 && bitRate < 350000) {
    throw new Error('云端返回视频码率过低(' + Math.round(bitRate / 1000) + 'kbps)，疑似静态图/图片拼接')
  }

  await new Promise<void>((resolve, reject) => {
    let exe = ''
    try {
      exe = getFfmpegExecutable()
    } catch (e) {
      reject(e)
      return
    }
    const args = ['-hide_banner', '-i', filePath, '-vf', 'freezedetect=n=-55dB:d=0.8', '-an', '-f', 'null', '-']
    const child = spawn(exe, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', () => {
      const freezes = [...stderr.matchAll(/freeze_duration:\s*([0-9.]+)/g)].map((m) => Number(m[1] || 0))
      const longestFreeze = freezes.length ? Math.max(...freezes) : stderr.includes('freeze_start') ? durationSec : 0
      if (longestFreeze >= Math.max(1.2, durationSec * 0.72)) {
        reject(new Error('云端返回视频几乎无运动，冻结 ' + longestFreeze.toFixed(2) + 's/' + durationSec.toFixed(2) + 's，疑似图片拼接'))
        return
      }
      resolve()
    })
  })
}

async function patchShotRuntimeState(input: {
  project: CloneProject
  shotId: string
  patch: Partial<ShotSpec>
}) {
  if (!input.project.blueprint) return input.project
  input.project.blueprint = {
    ...input.project.blueprint,
    shots: input.project.blueprint.shots.map((s) => (s.id === input.shotId ? { ...s, ...input.patch } : s)),
  }
  input.project.baseBlueprint = input.project.baseBlueprint
    ? {
        ...input.project.baseBlueprint,
        shots: input.project.baseBlueprint.shots.map((s) => (s.id === input.shotId ? { ...s, ...input.patch } : s)),
      }
    : input.project.blueprint
  return await cloneRepo.upsertProject(input.project)
}

async function checkLocalTaskStatus(input: {
  project: CloneProject
  shot: ShotSpec
}) {
  const existingOutput = input.project.shotVideoOutputs?.find((item) => item.shotId === input.shot.id)
  const shotStatus = String(input.shot.status || '').trim().toLowerCase()
  const outputStatus = String(existingOutput?.status || '').trim().toLowerCase()
  const pendingRemoteState = resolvePendingRemoteState(existingOutput?.remoteStatus, existingOutput?.remoteRaw)
  const allowShotClipReuse = shotStatus !== 'generating' && outputStatus !== 'submitting'
  if (existingOutput && isImageTaskMapping(existingOutput.taskId, existingOutput.provider, existingOutput.model)) {
    syncShotVideoOutput(input.project, {
      ...existingOutput,
      taskId: undefined,
      provider: undefined,
      model: undefined,
      status: 'idle',
      error: undefined,
      updatedAt: now(),
    })
  }
  const effectiveTaskId = resolveEffectiveVideoTaskId(existingOutput?.taskId, input.shot.generatedTaskId)
  const managedSceneVideoPath = join(getAppPaths().dataDir, 'viral-clone', input.project.id, 'scene_videos', `${input.shot.id}.mp4`)
  const managedShotVideoPath = join(getAppPaths().dataDir, 'viral-clone', input.project.id, 'shots', input.shot.id, 'generated_clip.mp4')
  const existingManagedVideoPath = String(existingOutput?.videoPath || existingOutput?.localPath || '').trim()
  const hasManagedCompletedArtifact =
    existingManagedVideoPath === managedSceneVideoPath || existingManagedVideoPath === managedShotVideoPath
  const shouldBlockLocalReuseDuringCurrentDownload =
    Boolean(effectiveTaskId) &&
    (outputStatus === 'downloading' || outputStatus === 'remote_succeeded_pending_download') &&
    Boolean(String(existingOutput?.videoUrl || '').trim()) &&
    !hasManagedCompletedArtifact
  const shouldBlockLocalReuseDuringPendingRemoteTask =
    Boolean(effectiveTaskId) &&
    Boolean(pendingRemoteState) &&
    (
      Boolean(existingOutput?.previousTaskIds?.length) ||
      Boolean(existingOutput?.submissionStartedAt) ||
      Boolean(existingOutput?.submissionLockedUntil) ||
      outputStatus === 'done'
    )
  const shouldBlockLocalReuseDuringForcedReplacementWindow =
    Boolean(effectiveTaskId) &&
    (
      Boolean(existingOutput?.previousTaskIds?.length) ||
      Boolean(existingOutput?.submissionStartedAt) ||
      Boolean(existingOutput?.submissionLockedUntil)
    ) &&
    (
      shotStatus === 'generating' ||
      outputStatus === 'submitting' ||
      outputStatus === 'remote_pending' ||
      outputStatus === 'remote_running' ||
      outputStatus === 'downloading' ||
      outputStatus === 'remote_succeeded_pending_download' ||
      outputStatus === 'done'
    )
  const shouldBlockLegacyLocalReuse =
    Boolean(effectiveTaskId) &&
    isActiveShotVideoRemoteStatus(outputStatus || shotStatus) &&
    Boolean(existingOutput?.previousTaskIds?.length)
  if (
    shouldBlockLegacyLocalReuse ||
    shouldBlockLocalReuseDuringPendingRemoteTask ||
    shouldBlockLocalReuseDuringForcedReplacementWindow
  ) {
    return { skip: false as const }
  }
  const existingVideoPath = shouldBlockLegacyLocalReuse
    ? ''
    : shouldBlockLocalReuseDuringCurrentDownload
    ? ''
    : String(existingOutput?.videoPath || (allowShotClipReuse ? input.shot.generatedClipPath : '') || '').trim()
  if (existingVideoPath && (await fileExists(existingVideoPath))) {
    try {
      const fileStat = await stat(existingVideoPath)
      if (fileStat.isFile() && fileStat.size > 0) {
        return {
          skip: true as const,
          status: 'done' as const,
          videoPath: existingVideoPath,
          taskId: resolveEffectiveVideoTaskId(existingOutput?.taskId, input.shot.generatedTaskId) || undefined,
        }
      }
    } catch {}
  }
  try {
    const fileStat = await stat(managedSceneVideoPath)
    if (fileStat.isFile() && fileStat.size > 0) {
      return {
        skip: true as const,
        status: 'done' as const,
        videoPath: managedSceneVideoPath,
        taskId: resolveEffectiveVideoTaskId(existingOutput?.taskId, input.shot.generatedTaskId) || undefined,
      }
    }
  } catch {}
  try {
    const fileStat = await stat(managedShotVideoPath)
    if (fileStat.isFile() && fileStat.size > 0) {
      return {
        skip: true as const,
        status: 'done' as const,
        videoPath: managedShotVideoPath,
        taskId: resolveEffectiveVideoTaskId(existingOutput?.taskId, input.shot.generatedTaskId) || undefined,
      }
    }
  } catch {}
  return { skip: false as const }
}

function resolveShotVideoOutput(project: CloneProject, shot: ShotSpec): CloneShotVideoOutput {
  ensureCloneFlowState(project)
  const existing = project.shotVideoOutputs?.find((item) => item.shotId === shot.id)
  const existingStatus = String(existing?.status || '').trim().toLowerCase()
  const shotStatus = String(shot.status || '').trim().toLowerCase()
  const existingTaskId = String(existing?.taskId || '').trim()
  const shotTaskId = String(shot.generatedTaskId || '').trim()
  const resolvedTaskId = isStaleImageTaskId(existingTaskId)
    ? (isStaleImageTaskId(shotTaskId) ? undefined : shotTaskId || undefined)
    : existingTaskId || (isStaleImageTaskId(shotTaskId) ? undefined : shotTaskId || undefined)
  const existingHasLocalVideo = Boolean(String(existing?.videoPath || existing?.localPath || shot.generatedClipPath || '').trim())
  const hasActiveReplacementTask =
    !existingHasLocalVideo &&
    Boolean(resolvedTaskId) &&
    (isActiveShotVideoRemoteStatus(existingStatus || shotStatus) ||
      existingStatus === 'remote_succeeded_pending_download' ||
      existingStatus === 'downloading') &&
    (Boolean(existing?.previousTaskIds?.length) || Boolean((existing as any)?.submissionStartedAt) || Boolean((existing as any)?.submissionLockedUntil))
  const canHydrateFromShotClip =
    !hasActiveReplacementTask &&
    shotStatus !== 'generating' &&
    (!existing ||
      (!existing.videoPath &&
        !existing.localPath &&
        existingStatus !== 'submitting' &&
        existingStatus !== 'remote_pending' &&
        existingStatus !== 'remote_running' &&
        existingStatus !== 'remote_succeeded_pending_download' &&
        existingStatus !== 'downloading'))
  const resolvedProvider = looksLikeImageProvider(existing?.provider)
    ? (looksLikeImageProvider(shot.generatedProvider) ? undefined : shot.generatedProvider || undefined)
    : existing?.provider || (looksLikeImageProvider(shot.generatedProvider) ? undefined : shot.generatedProvider || undefined)
  const resolvedModel = looksLikeImageModel(existing?.model)
    ? (looksLikeImageModel(shot.generatedModel) ? undefined : shot.generatedModel || undefined)
    : existing?.model || (looksLikeImageModel(shot.generatedModel) ? undefined : shot.generatedModel || undefined)
  const resolvedVideoPath = hasActiveReplacementTask
    ? undefined
    : existing?.videoPath || (canHydrateFromShotClip ? shot.generatedClipPath : undefined) || undefined
  const resolvedLocalPath = hasActiveReplacementTask
    ? undefined
    : existing?.localPath || existing?.videoPath || (canHydrateFromShotClip ? shot.generatedClipPath : undefined) || undefined
  const hasResolvedLocalVideo = Boolean(String(resolvedVideoPath || resolvedLocalPath || '').trim())
  const resolvedStatus = hasActiveReplacementTask
    ? (
        existingStatus === 'remote_succeeded_pending_download'
          ? 'remote_succeeded_pending_download'
          : existingStatus === 'downloading'
            ? 'downloading'
            : existingStatus === 'remote_pending'
              ? 'remote_pending'
              : existingStatus === 'remote_running'
                ? 'remote_running'
                : existingStatus === 'submitting'
                  ? 'submitting'
                : shotStatus === 'generating'
                  ? 'remote_pending'
                  : 'remote_running'
      )
    : hasResolvedLocalVideo
      ? 'done'
      : existing?.status || (canHydrateFromShotClip && shot.generatedClipPath ? 'done' : 'idle')
  return {
    segmentId: existing?.segmentId || shot.id,
    index: Number(existing?.index ?? shot.index ?? 0),
    shotId: shot.id,
    source: existing?.source ?? 'generated',
    videoPath: resolvedVideoPath,
    localPath: resolvedLocalPath,
    videoUrl: existing?.videoUrl,
    taskId: resolvedTaskId,
    previousTaskIds: existing?.previousTaskIds ?? [],
    provider: resolvedProvider,
    model: resolvedModel,
    requestCapability: existing?.requestCapability,
    endpointStyle: existing?.endpointStyle,
    submissionFingerprint: existing?.submissionFingerprint,
    submissionStartedAt: existing?.submissionStartedAt,
    submissionLockedUntil: existing?.submissionLockedUntil,
    remoteStatus: existing?.remoteStatus,
    remoteRaw: existing?.remoteRaw,
    durationSec: existing?.durationSec || shot.generatedClipDurationSec || undefined,
    status: resolvedStatus,
    error: existing?.error || shot.error || undefined,
    retryCount: existing?.retryCount ?? Number(shot.retryCount ?? 0),
    createdAt: existing?.createdAt ?? now(),
    lastPollAt: existing?.lastPollAt,
    completedAt: existing?.completedAt,
    sourceEvent: existing?.sourceEvent,
    updatedAt: existing?.updatedAt ?? now(),
  }
}

function isActiveShotVideoRemoteStatus(status?: string) {
  const normalized = String(status || '').trim().toLowerCase()
  return (
    normalized === 'submitting' ||
    normalized === 'remote_pending' ||
    normalized === 'remote_running'
  )
}

function isStaleImageTaskId(value: unknown) {
  const taskId = String(value ?? '').trim().toLowerCase()
  if (!taskId) return false
  return taskId.startsWith('gpt_frame_') || taskId.startsWith('mj_')
}

function resolveEffectiveVideoTaskId(taskId?: unknown, fallbackTaskId?: unknown) {
  const primary = String(taskId ?? '').trim()
  if (primary && !isStaleImageTaskId(primary)) return primary
  const fallback = String(fallbackTaskId ?? '').trim()
  if (fallback && !isStaleImageTaskId(fallback)) return fallback
  return ''
}

function sanitizeVideoTaskId(value?: unknown) {
  const taskId = String(value ?? '').trim()
  if (!taskId || isStaleImageTaskId(taskId)) return undefined
  return taskId
}

function looksLikeImageProvider(value: unknown) {
  const provider = String(value ?? '').trim().toLowerCase()
  if (!provider) return false
  return provider.includes('image') || provider === 'openai'
}

function looksLikeImageModel(value: unknown) {
  const model = String(value ?? '').trim().toLowerCase()
  if (!model) return false
  return model.includes('image') || model.includes('dall-e') || model.includes('/edit')
}

function hasInvalidVideoTaskMapping(output: CloneShotVideoOutput, shot: ShotSpec) {
  const effectiveTaskId = resolveEffectiveVideoTaskId(output.taskId, shot.generatedTaskId)
  if (effectiveTaskId) {
    return isStaleImageTaskId(effectiveTaskId)
  }
  return (
    isStaleImageTaskId(output.taskId) ||
    isStaleImageTaskId(shot.generatedTaskId)
  )
}

function clearInvalidVideoTaskMapping(project: CloneProject, shot: ShotSpec, reason: string) {
  if (!hasInvalidVideoTaskMapping(resolveShotVideoOutput(project, shot), shot)) return project
  console.log('[clone-debug] clear-invalid-video-task-mapping', {
    projectId: project.id,
    shotId: shot.id,
    taskId: shot.generatedTaskId,
    provider: shot.generatedProvider,
    model: shot.generatedModel,
    reason,
  })
  replaceProjectShot(project, shot.id, {
    generatedTaskId: undefined,
    generatedProvider: undefined,
    generatedModel: undefined,
    generatedClipPath: undefined,
    generatedSource: undefined,
    error: '',
    status: 'ready',
  })
  syncSegmentVideoOutput(project, shot, {
    taskId: undefined,
    provider: undefined,
    model: undefined,
    endpointStyle: undefined,
    requestCapability: undefined,
    remoteStatus: undefined,
    remoteRaw: undefined,
    videoUrl: undefined,
    videoPath: undefined,
    localPath: undefined,
    error: undefined,
    status: 'idle',
    updatedAt: now(),
  })
  return project
}

async function normalizeShotVideoState(project: CloneProject, shot: ShotSpec) {
  const output = resolveShotVideoOutput(project, shot)
  const outputStatus = String(output.status || '').trim().toLowerCase()
  const effectiveTaskId = resolveEffectiveVideoTaskId(output.taskId, shot.generatedTaskId)
  const managedSceneVideoPath = join(getAppPaths().dataDir, 'viral-clone', project.id, 'scene_videos', `${shot.id}.mp4`)
  const managedShotVideoPath = join(getAppPaths().dataDir, 'viral-clone', project.id, 'shots', shot.id, 'generated_clip.mp4')
  const pendingRemoteState = resolvePendingRemoteState(output.remoteStatus, output.remoteRaw)
  const remoteRaw = (output.remoteRaw ?? {}) as Record<string, any>
  const remoteRawData =
    remoteRaw?.data && typeof remoteRaw.data === 'object' ? (remoteRaw.data as Record<string, any>) : {}
  const resolvedVideoUrl = String(output.videoUrl || remoteRaw?.video_url || remoteRawData?.video_url || '').trim()
  const existingManagedVideoPath = String(output.videoPath || output.localPath || shot.generatedClipPath || '').trim()
  const hasManagedCompletedArtifact =
    existingManagedVideoPath === managedSceneVideoPath || existingManagedVideoPath === managedShotVideoPath
  const shouldIgnoreCompletedArtifactsDuringPendingRemoteTask =
    Boolean(effectiveTaskId) &&
    Boolean(pendingRemoteState) &&
    (
      Boolean(output.previousTaskIds?.length) ||
      Boolean(output.submissionStartedAt) ||
      Boolean(output.submissionLockedUntil)
    )
  const shouldIgnoreCompletedVideoDuringDownloadPending =
    Boolean(effectiveTaskId) &&
    (outputStatus === 'downloading' || outputStatus === 'remote_succeeded_pending_download') &&
    Boolean(resolvedVideoUrl) &&
    !hasManagedCompletedArtifact
  const shouldIgnoreCompletedVideoDuringRemoteRun =
    Boolean(effectiveTaskId) &&
    isActiveShotVideoRemoteStatus(outputStatus) &&
    (Boolean(output.previousTaskIds?.length) || Boolean(output.submissionStartedAt) || Boolean(output.submissionLockedUntil))
  const shouldIgnoreCompletedVideoPath =
    shouldIgnoreCompletedArtifactsDuringPendingRemoteTask ||
    shouldIgnoreCompletedVideoDuringDownloadPending ||
    shouldIgnoreCompletedVideoDuringRemoteRun
  const candidateVideoPath = shouldIgnoreCompletedVideoPath
    ? ''
    : String(output.videoPath || output.localPath || shot.generatedClipPath || '').trim()
  const hasLocalVideo = Boolean(candidateVideoPath) && (await fileExists(candidateVideoPath))
  const hasVideoUrl = shouldIgnoreCompletedArtifactsDuringPendingRemoteTask ? false : Boolean(resolvedVideoUrl)
  const normalizedStatus =
    pendingRemoteState && shouldIgnoreCompletedArtifactsDuringPendingRemoteTask
      ? (pendingRemoteState as 'remote_pending' | 'remote_running')
      : mapLegacyShotVideoStatus({
          status: output.status,
          hasVideo: hasLocalVideo,
          hasTaskId: Boolean(effectiveTaskId),
          hasVideoUrl,
          error: output.error || shot.error,
          remoteStatus: String(output.remoteStatus || remoteRaw?.status || remoteRawData?.status || '').trim(),
        })

  if (candidateVideoPath && !hasLocalVideo) {
    syncSegmentVideoOutput(project, shot, {
      videoPath: undefined,
      localPath: undefined,
      completedAt: undefined,
    })
    replaceProjectShot(project, shot.id, {
      generatedClipPath: undefined,
    })
  }

  if (shouldIgnoreCompletedVideoPath) {
    syncSegmentVideoOutput(project, shot, {
      videoUrl: shouldIgnoreCompletedArtifactsDuringPendingRemoteTask ? undefined : resolvedVideoUrl || undefined,
      videoPath: undefined,
      localPath: undefined,
      completedAt: undefined,
    })
    replaceProjectShot(project, shot.id, {
      generatedClipPath: undefined,
    })
  }

  syncSegmentVideoOutput(project, shot, {
    status: normalizedStatus,
    taskId: effectiveTaskId || undefined,
    remoteStatus:
      normalizedStatus === 'done'
        ? 'succeeded'
        : normalizedStatus === 'remote_succeeded_pending_download'
          ? 'succeeded'
          : normalizedStatus === 'remote_pending'
            ? output.remoteStatus || 'created'
            : normalizedStatus === 'remote_running'
              ? output.remoteStatus || 'running'
              : output.remoteStatus,
    error:
      normalizedStatus === 'failed_retryable' || normalizedStatus === 'failed_terminal'
        ? output.error || shot.error
        : undefined,
    localPath: hasLocalVideo ? candidateVideoPath : undefined,
    videoPath: hasLocalVideo ? candidateVideoPath : undefined,
    completedAt: normalizedStatus === 'done' ? output.completedAt || now() : undefined,
  })
  if (
    normalizedStatus === 'done' &&
    hasLocalVideo &&
    (outputStatus === 'downloading' || outputStatus === 'remote_succeeded_pending_download')
  ) {
    console.log('[clone-debug] shot-video-local-self-heal:done', {
      projectId: project.id,
      shotId: shot.id,
      taskId: effectiveTaskId || undefined,
      fromStatus: outputStatus || undefined,
      videoPath: candidateVideoPath,
    })
  }
  replaceProjectShot(project, shot.id, {
    generatedClipPath:
      shouldIgnoreCompletedArtifactsDuringPendingRemoteTask
        ? undefined
        : normalizedStatus === 'done'
          ? candidateVideoPath
          : undefined,
    generatedTaskId: effectiveTaskId || undefined,
    generatedProvider: output.provider || shot.generatedProvider,
    generatedModel: output.model || shot.generatedModel,
    status:
      normalizedStatus === 'done'
        ? 'done'
        : normalizedStatus === 'failed_retryable' || normalizedStatus === 'failed_terminal'
          ? 'failed'
          : 'generating',
    error:
      normalizedStatus === 'failed_retryable' || normalizedStatus === 'failed_terminal'
        ? output.error || shot.error || ''
        : '',
  })
  return resolveShotVideoOutput(project, projectBlueprintShots(project).find((item) => item.id === shot.id) || shot)
}

async function normalizeProjectShotVideoStates(project: CloneProject) {
  const shots = projectBlueprintShots(project)
  for (const shot of shots) {
    await normalizeShotVideoState(project, shot)
  }
  return project
}

function reorderProjectCollections(project: CloneProject, shotIds: string[]) {
  const orderMap = new Map(shotIds.map((shotId, index) => [shotId, index]))
  const sortByShotOrder = <T extends { shotId: string }>(items: T[]) =>
    [...items].sort((a, b) => (orderMap.get(a.shotId) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b.shotId) ?? Number.MAX_SAFE_INTEGER))

  if (project.storyboardFrames) {
    project.storyboardFrames = sortByShotOrder(project.storyboardFrames)
  }
  if (project.shotVideoOutputs) {
    project.shotVideoOutputs = sortByShotOrder(project.shotVideoOutputs).map((item, index) => ({
      ...item,
      index,
      segmentId: item.segmentId ?? item.shotId,
    }))
  }
  return project
}

function syncSegmentVideoOutput(project: CloneProject, shot: ShotSpec, patch: Partial<CloneShotVideoOutput>) {
  const previous = resolveShotVideoOutput(project, shot)
  const previousStatus = String(previous.status || '').trim().toLowerCase()
  const incomingStatus = String(patch.status || '').trim().toLowerCase()
  const incomingSourceEvent = String(patch.sourceEvent || '').trim().toLowerCase()
  const hasExplicitTaskReset = Object.prototype.hasOwnProperty.call(patch, 'taskId') && patch.taskId === undefined
  const previousTaskId = sanitizeVideoTaskId(previous.taskId || shot.generatedTaskId)
  const incomingTaskId = sanitizeVideoTaskId(
    hasExplicitTaskReset ? undefined : Object.prototype.hasOwnProperty.call(patch, 'taskId') ? patch.taskId : previous.taskId || shot.generatedTaskId,
  )
  const explicitReset =
    hasExplicitTaskReset &&
    Object.prototype.hasOwnProperty.call(patch, 'videoPath') &&
    Object.prototype.hasOwnProperty.call(patch, 'localPath') &&
    patch.videoPath === undefined &&
    patch.localPath === undefined
  const previousHasVideo = Boolean(String(previous.videoPath || previous.localPath || '').trim())
  const incomingHasVideo = Boolean(String(patch.videoPath || patch.localPath || '').trim())
  const shouldInvalidatePreviousCompletedVideo =
    !incomingHasVideo &&
    isActiveShotVideoRemoteStatus(incomingStatus) &&
    (explicitReset ||
      (Boolean(incomingTaskId) && incomingTaskId !== previousTaskId) ||
      Boolean(patch.previousTaskIds?.length))
  const isForceRegenerateReplacement =
    Boolean(patch.previousTaskIds?.length) ||
    incomingSourceEvent === 'force_regenerate_reset' ||
    incomingSourceEvent === 'segment_submit_started' ||
    incomingSourceEvent === 'segment_submit_succeeded'
  const isStatusRegression =
    !isForceRegenerateReplacement &&
    !shouldInvalidatePreviousCompletedVideo &&
    !explicitReset &&
    (previousHasVideo || previousStatus === 'done' || previousStatus === 'downloading' || previousStatus === 'remote_succeeded_pending_download') &&
    !incomingHasVideo &&
    (incomingStatus === 'remote_running' || incomingStatus === 'submitting' || incomingStatus === 'remote_pending')
  const safePatch = isStatusRegression
    ? {
        ...patch,
        status: previousHasVideo || previousStatus === 'done' ? 'done' : previousStatus === 'remote_succeeded_pending_download' ? 'remote_succeeded_pending_download' : 'downloading',
        localPath: previous.localPath,
        videoPath: previous.videoPath,
        videoUrl: patch.videoUrl ?? previous.videoUrl,
      }
    : patch
  const hasLocalPath = Object.prototype.hasOwnProperty.call(patch, 'localPath')
  const hasVideoPath = Object.prototype.hasOwnProperty.call(patch, 'videoPath')
  const nextLocalPath = hasLocalPath
    ? safePatch.localPath
    : hasVideoPath
      ? safePatch.videoPath
      : shouldInvalidatePreviousCompletedVideo
        ? undefined
        : (previous.localPath || previous.videoPath)
  const nextVideoPath = hasVideoPath
    ? safePatch.videoPath
    : hasLocalPath
      ? safePatch.localPath
      : shouldInvalidatePreviousCompletedVideo
        ? undefined
        : previous.videoPath
  syncShotVideoOutput(project, {
    ...previous,
    ...safePatch,
    segmentId: safePatch.segmentId || previous.segmentId || shot.id,
    index: Number(safePatch.index ?? previous.index ?? shot.index ?? 0),
    shotId: shot.id,
    source: safePatch.source || previous.source || 'generated',
    taskId: incomingTaskId || undefined,
    localPath: nextLocalPath,
    videoPath: nextVideoPath,
    sourceEvent: String(safePatch.sourceEvent || previous.sourceEvent || 'unspecified').trim() || 'unspecified',
    updatedAt: now(),
  } as CloneShotVideoOutput)
}

function existingShotVideoOutput(project: CloneProject, shotId: string) {
  return project.shotVideoOutputs?.find((item) => item.shotId === shotId)
}

function shotVideoExistsLocally(output?: CloneShotVideoOutput) {
  const path = String(output?.videoPath || output?.localPath || '').trim()
  return Boolean(path)
}

async function canReuseShotVideo(output?: CloneShotVideoOutput) {
  if (!shotVideoExistsLocally(output)) return false
  const status = String(output?.status || '').trim().toLowerCase()
  if (
    Boolean(output?.taskId) &&
    isActiveShotVideoRemoteStatus(status) &&
    Boolean(output?.previousTaskIds?.length)
  ) return false
  const path = String(output?.videoPath || output?.localPath || '').trim()
  try {
    const file = await stat(path)
    return file.isFile() && file.size > 0
  } catch {
    return false
  }
}

function isRecoverableVideoStatus(status: unknown) {
  return ['idle', 'submitting', 'remote_pending', 'remote_running', 'remote_succeeded_pending_download', 'downloading', 'failed_retryable', 'failed_terminal', 'creating', 'generating', 'polling_timeout', 'failed'].includes(String(status ?? '').toLowerCase())
}

function isCloudTerminalFailure(status: unknown) {
  return ['failed', 'error', 'cancelled', 'canceled', 'expired'].includes(String(status ?? '').toLowerCase())
}

function isMissingRemoteVideoTask(input: { errorMessage?: string; raw?: any }) {
  const message = String(input.errorMessage || input.raw?.error || input.raw?.message || input.raw?.terminalError || '').trim()
  return /task_not_exist/i.test(message)
}

function ai666PollingTimeoutMessage() {
  return '本地等待超时，但 VectorEngine 云端任务可能仍在生成或已完成，可继续查询，不会重新扣费生成。'
}

function videoPollingTimeoutMessage(providerName = 'VectorEngine') {
  return `本地等待超时，但 ${providerName} 云端任务可能仍在生成或已完成，可继续查询，不会重新扣费生成。`
}

function hasReachedShotVideoRetryLimit(retryCount: unknown, limit = AUTO_CLONE_VIDEO_RETRY_LIMIT) {
  return Number(retryCount ?? 0) >= Math.max(0, Number(limit || 0))
}

function classifyShotVideoFailure(input: {
  status?: string
  taskId?: string
  error?: string
  videoUrl?: string
}) {
  const status = String(input.status || '').trim().toLowerCase()
  const taskId = String(input.taskId || '').trim()
  const error = String(input.error || '').trim()
  const hasVideoUrl = Boolean(String(input.videoUrl || '').trim())
  if (!taskId && (status === 'failed' || status === 'failed_terminal' || error.includes('缺少可继续查询的 taskId'))) {
    return 'missing_task'
  }
  if (status === 'downloading' && hasVideoUrl) {
    return 'download_pending'
  }
  if (status === 'polling_timeout' || status === 'failed_retryable' || error.includes('本地等待超时')) {
    return 'remote_timeout'
  }
  if (status === 'remote_running') {
    return 'remote_running'
  }
  if ((status === 'failed' || status === 'failed_retryable') && hasVideoUrl) {
    return 'download_failed'
  }
  if ((status === 'failed' || status === 'failed_terminal') && taskId) {
    return 'remote_failed'
  }
  if (status === 'failed' || status === 'failed_terminal') {
    return 'local_failed'
  }
  return 'unknown'
}

function canReuseExistingShotVideoTask(output: {
  status?: string
  taskId?: string
  error?: string
  videoUrl?: string
}) {
  const taskId = String(output.taskId || '').trim()
  if (!taskId) return false
  const status = String(output.status || '').trim().toLowerCase()
  if (status === 'idle') {
    return true
  }
  if (status === 'remote_running' || status === 'remote_pending' || status === 'submitting' || status === 'creating' || status === 'generating') {
    return true
  }
  if (status === 'downloading' && Boolean(String(output.videoUrl || '').trim())) {
    return true
  }
  const failureType = classifyShotVideoFailure(output)
  if (
    failureType === 'missing_task' ||
    failureType === 'remote_timeout' ||
    failureType === 'remote_failed' ||
    failureType === 'local_failed' ||
    failureType === 'download_failed'
  ) {
    return false
  }
  return false
}

function computeShotVideoSubmissionFingerprint(input: {
  project?: CloneProject
  shot: ShotSpec
  firstFramePath: string
  lastFramePath?: string
  provider: string
  model: string
  requestCapability: CloneShotVideoOutput['requestCapability']
}) {
  const explicitVideoSize = resolveShotRequestedVideoSize(input.project, input.shot)
  return computeCloudClipHash({
    promptHash: computePromptHash({
      shot: input.shot,
      productRefs: input.shot.productReferenceImagePaths ?? [],
      productDescription: [
        String((input.shot as any).productIdentityText || '').trim(),
        input.provider,
        String(input.requestCapability || '').trim(),
      ]
        .filter(Boolean)
        .join('|'),
      model: input.model,
      qualityMode: normalizeQualityMode(input.shot.qualityMode),
    }),
    firstFrame: String(input.firstFramePath || '').trim(),
    lastFrame: String(input.lastFramePath || input.firstFramePath || '').trim(),
    model: input.model,
    duration: Number(input.shot.durationSec || 0),
    aspectRatio: resolveProjectVideoAspectRatio(input.project, input.shot),
    resolution: `${explicitVideoSize || '720p'}|${input.provider}|${String(input.requestCapability || '').trim()}`,
  })
}

function isShotVideoSubmissionLocked(
  output: Partial<CloneShotVideoOutput> | undefined,
  fingerprint?: string,
  currentTime = now(),
) {
  if (!output) return false
  const status = String(output.status || '').trim().toLowerCase()
  if (status !== 'creating' && status !== 'submitting') return false
  const lockedUntil = Number(output.submissionLockedUntil ?? 0)
  if (!lockedUntil || lockedUntil <= currentTime) return false
  if (fingerprint && String(output.submissionFingerprint || '').trim() && String(output.submissionFingerprint).trim() !== fingerprint) {
    return false
  }
  return true
}

function buildShotVideoCreatingLockReason(output?: Partial<CloneShotVideoOutput>) {
  const lockedUntil = Number(output?.submissionLockedUntil ?? 0)
  if (lockedUntil > now()) {
    return `[submit_locked] 当前分镜视频任务已提交，等待任务号回写中，锁定至 ${new Date(lockedUntil).toISOString()}`
  }
  return '[submit_locked] 当前分镜视频任务正在提交中，等待任务号回写，不重复创建'
}

function normalizeXibapiVideoSize(size: unknown): '1280x720' | '720x1280' | '1920x1080' | '1080x1920' | undefined {
  const value = String(size || '').trim()
  if (value === '1280x720' || value === '720x1280' || value === '1920x1080' || value === '1080x1920') return value
  return undefined
}

function resolveShotRequestedVideoSize(
  project: CloneProject | undefined,
  shot: ShotSpec,
): '1280x720' | '720x1280' | '1920x1080' | '1080x1920' | undefined {
  return normalizeXibapiVideoSize(project?.blueprint?.renderHints?.resolution) || normalizeXibapiVideoSize((shot as any)?.resolution)
}

function resolveProjectVideoAspectRatio(project: CloneProject | undefined, shot: ShotSpec): '9:16' | '16:9' {
  if (project?.blueprint?.renderHints?.aspectRatio === '16:9') return '16:9'
  if (project?.blueprint?.renderHints?.aspectRatio === '9:16') return '9:16'
  return shot.prompt?.aspectRatio === '16:9' ? '16:9' : '9:16'
}

async function inferProjectRenderHintsFromStoryboardFrames(project: CloneProject) {
  const shots = projectBlueprintShots(project).sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
  for (const shot of shots) {
    const framePath = String(shot.gptFirstFramePath || shot.generatedFirstFramePath || shot.gptLastFramePath || shot.generatedLastFramePath || '').trim()
    if (!framePath) continue
    try {
      const meta = await probeMedia(framePath)
      const width = Number(meta.width || 0)
      const height = Number(meta.height || 0)
      if (!width || !height) continue
      const aspectRatio: '9:16' | '16:9' = width > height ? '16:9' : '9:16'
      const resolution: '720x1280' | '1280x720' | '1080x1920' | '1920x1080' =
        aspectRatio === '16:9'
          ? Math.max(width, height) >= 1920
            ? '1920x1080'
            : '1280x720'
          : Math.max(width, height) >= 1920
            ? '1080x1920'
            : '720x1280'
      return { aspectRatio, resolution }
    } catch {
      continue
    }
  }
  return undefined
}

type NormalizedShotVideoIntent =
  | 'submit_if_needed'
  | 'poll_only'
  | 'download_if_ready'
  | 'force_regenerate'
  | 'recover_if_possible'

function isRetryableShotVideoFailure(status: string, error?: string, taskId?: string, videoUrl?: string) {
  const failureType = classifyShotVideoFailure({
    status,
    taskId: taskId || undefined,
    error,
    videoUrl,
  })
  return failureType === 'remote_timeout' || failureType === 'download_failed'
}

function mapLegacyShotVideoStatus(input: {
  status?: string
  hasVideo: boolean
  hasTaskId: boolean
  hasVideoUrl: boolean
  error?: string
  remoteStatus?: string
}) {
  if (input.hasVideo) return 'done' as const
  const status = String(input.status || '').trim().toLowerCase()
  const remoteStatus = String(input.remoteStatus || '').trim().toLowerCase()
  const remoteSucceeded = input.hasVideoUrl && ['succeeded', 'success', 'completed', 'done', 'finished'].includes(remoteStatus)
  if (!status || status === 'idle') {
    if (String(input.error || '').trim()) return input.hasTaskId ? ('failed_retryable' as const) : ('failed_terminal' as const)
    return input.hasTaskId ? ('remote_running' as const) : ('idle' as const)
  }
  if (status === 'creating') return 'submitting' as const
  if (status === 'submitting') return 'submitting' as const
  if (status === 'generating') return input.hasTaskId ? ('remote_pending' as const) : ('submitting' as const)
  if (status === 'remote_pending') return 'remote_pending' as const
  if (status === 'remote_running') return 'remote_running' as const
  if (status === 'remote_succeeded_pending_download') return input.hasVideoUrl ? ('remote_succeeded_pending_download' as const) : ('failed_retryable' as const)
  if (status === 'downloading') return input.hasVideoUrl ? ('downloading' as const) : ('failed_retryable' as const)
  if (status === 'polling_timeout') return input.hasTaskId ? ('failed_retryable' as const) : ('failed_terminal' as const)
  if (status === 'done') return input.hasVideo ? ('done' as const) : input.hasVideoUrl ? ('remote_succeeded_pending_download' as const) : ('failed_retryable' as const)
  if ((status === 'failed_retryable' || status === 'failed' || status === 'polling_timeout') && remoteSucceeded) {
    return 'remote_succeeded_pending_download' as const
  }
  if (status === 'failed') return isRetryableShotVideoFailure(status, input.error, input.hasTaskId ? 'task' : '', input.hasVideoUrl ? 'url' : '') ? 'failed_retryable' as const : 'failed_terminal' as const
  if (status === 'failed_retryable') return 'failed_retryable' as const
  if (status === 'failed_terminal') return 'failed_terminal' as const
  if (status === 'pending') return input.hasTaskId ? ('remote_running' as const) : ('idle' as const)
  return input.hasTaskId ? ('remote_running' as const) : ('idle' as const)
}

function hasSucceededRemoteVideoResult(output: Partial<CloneShotVideoOutput> | undefined) {
  const remoteRaw = (output?.remoteRaw ?? {}) as Record<string, any>
  const remoteRawData = remoteRaw?.data && typeof remoteRaw.data === 'object' ? (remoteRaw.data as Record<string, any>) : {}
  const remoteStatus = String(output?.remoteStatus || remoteRaw?.status || remoteRawData?.status || '').trim().toLowerCase()
  const hasVideoUrl = Boolean(String(output?.videoUrl || remoteRaw?.video_url || remoteRawData?.video_url || '').trim())
  return hasVideoUrl && ['succeeded', 'success', 'completed', 'done', 'finished'].includes(remoteStatus)
}

function isShotVideoAwaitingReplacementTask(output: Partial<CloneShotVideoOutput> | undefined) {
  const status = String(output?.status || '').trim().toLowerCase()
  return (
    (status === 'submitting' || status === 'remote_pending' || status === 'remote_running') &&
    Boolean(output?.previousTaskIds?.length) &&
    !Boolean(String(output?.taskId || '').trim())
  )
}

function isStaleShotVideoDownloadBlocked(output: Partial<CloneShotVideoOutput> | undefined) {
  const taskId = String(output?.taskId || '').trim()
  const previousTaskIds = Array.isArray(output?.previousTaskIds) ? output.previousTaskIds.map((item) => String(item || '').trim()).filter(Boolean) : []
  return (
    isShotVideoAwaitingReplacementTask(output) ||
    (Boolean(taskId) && previousTaskIds.includes(taskId))
  )
}

function isSupersededShotVideoTaskBinding(input: {
  currentTaskId?: unknown
  activeTaskId?: unknown
  previousTaskIds?: unknown
}) {
  const currentTaskId = String(input.currentTaskId || '').trim()
  const activeTaskId = String(input.activeTaskId || '').trim()
  const previousTaskIds = Array.isArray(input.previousTaskIds)
    ? input.previousTaskIds.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  if (!currentTaskId || !activeTaskId) return false
  if (currentTaskId === activeTaskId) return false
  return previousTaskIds.includes(currentTaskId)
}

function resolveStoryboardFrameSource(shot: ShotSpec) {
  return resolveExistingLocalPath(
    (shot as any).storyboardFramePath ||
      shot.gptFirstFramePath ||
      shot.generatedFirstFramePath ||
      shot.uploadedImagePath ||
      shot.gptLastFramePath ||
      shot.generatedLastFramePath ||
      '',
  )
}

function summarizeShotVideoQueue(project: CloneProject, shots: ShotSpec[]) {
  const summary = {
    total: shots.length,
    done: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
    timeout: 0,
    creating: 0,
    remoteRunning: 0,
    downloading: 0,
    retryableFailed: 0,
  }
  const failureBreakdown: CloneShotVideoFailureBreakdown = {
    missingTask: 0,
    remoteTimeout: 0,
    downloadFailed: 0,
    remoteFailed: 0,
    localFailed: 0,
  }
  for (const shot of shots) {
    const output = resolveShotVideoOutput(project, shot)
    const hasVideo = Boolean(String(output.videoPath || shot.generatedClipPath || '').trim())
    const status = String(output.status || shot.status || '').trim().toLowerCase()
    const failureType = classifyShotVideoFailure({
      status,
      taskId: resolveEffectiveVideoTaskId(output.taskId, shot.generatedTaskId) || undefined,
      error: output.error || shot.error,
      videoUrl: output.videoUrl,
    })
    if (hasVideo || status === 'done') {
      summary.done += 1
      continue
    }
    if (!resolveStoryboardFrameSource(shot)) {
      summary.skipped += 1
      continue
    }
    if (status === 'submitting' || status === 'remote_pending' || status === 'idle') {
      summary.pending += 1
      summary.creating += 1
      continue
    }
    if (status === 'remote_running') {
      summary.pending += 1
      summary.remoteRunning += 1
      continue
    }
    if (status === 'remote_succeeded_pending_download' || status === 'downloading') {
      summary.pending += 1
      summary.downloading += 1
      continue
    }
    if ((status === 'failed_retryable' && failureType === 'remote_timeout') || failureType === 'remote_timeout') {
      summary.pending += 1
      summary.timeout += 1
      failureBreakdown.remoteTimeout += 1
      continue
    }
    if (status === 'failed_retryable') {
      if (failureType === 'download_failed') {
        summary.pending += 1
        summary.retryableFailed += 1
        failureBreakdown.downloadFailed += 1
        continue
      }
      summary.pending += 1
      summary.retryableFailed += 1
      continue
    }
    if (status === 'failed_terminal') {
      summary.failed += 1
      if (failureType === 'missing_task') failureBreakdown.missingTask += 1
      else if (failureType === 'remote_failed') failureBreakdown.remoteFailed += 1
      else if (failureType === 'local_failed') failureBreakdown.localFailed += 1
      continue
    }
    summary.pending += 1
  }
  return { queueSummary: summary, failureBreakdown }
}

async function saveSegmentDone(input: {
  project: CloneProject
  shot: ShotSpec
  taskId?: string
  provider?: string
  model?: string
  endpointStyle?: string
  baseUrl?: string
  requestCapability?: CloneShotVideoOutput['requestCapability']
  videoUrl?: string
  localPath: string
  remoteStatus?: string
  remoteRaw?: unknown
}) {
  const quality = await qualityCheckShot({
    shot: {
      ...input.shot,
      generatedSource: 'cloud',
      generatedProvider: input.provider || input.shot.generatedProvider,
      generatedModel: input.model || input.shot.generatedModel,
      generatedTaskId: sanitizeVideoTaskId(input.taskId) || sanitizeVideoTaskId(input.shot.generatedTaskId),
      isMock: false,
    },
    filePath: input.localPath,
    firstFramePath: input.shot.generatedFirstFramePath || input.shot.uploadedImagePath || input.shot.gptFirstFramePath,
    source: 'cloud',
  })
  replaceProjectShot(input.project, input.shot.id, {
    generatedClipPath: input.localPath,
    generatedSource: 'cloud',
    generatedProvider: input.provider || input.shot.generatedProvider,
    generatedModel: input.model || input.shot.generatedModel,
    generatedTaskId: sanitizeVideoTaskId(input.taskId) || sanitizeVideoTaskId(input.shot.generatedTaskId),
    status: 'done',
    error: '',
    qualityStatus: quality.passed ? 'passed' : 'warning',
    qualityScore: quality.score,
    qualityReasons: quality.reasons,
    generatedClipDurationSec: quality.meta.durationSec,
    generatedClipWidth: quality.meta.width,
    generatedClipHeight: quality.meta.height,
    canEnterRender: true,
  })
  syncSegmentVideoOutput(input.project, input.shot, {
    taskId: input.taskId,
    provider: input.provider,
    model: input.model,
    endpointStyle: input.endpointStyle,
    baseUrl: input.baseUrl,
    requestCapability: input.requestCapability,
    remoteStatus: input.remoteStatus || 'succeeded',
    remoteRaw: input.remoteRaw,
    videoUrl: input.videoUrl,
    localPath: input.localPath,
    videoPath: input.localPath,
    durationSec: quality.meta.durationSec,
    status: 'done',
    error: undefined,
    completedAt: now(),
  })
  patchQueueJobStatus(input.project, input.shot.id, 'done', Number(input.shot.retryCount ?? 0))
  input.project.lastError = ''
  setProjectErrorContext(input.project, null)
  return await cloneRepo.upsertProject(input.project)
}

async function pollExistingSegmentTask(input: {
  project: CloneProject
  shot: ShotSpec
  waitMs?: number
  allowFailed?: boolean
  skipDownload?: boolean
}) {
  const creds = await cloneRepo.getCredentials()
  const currentOutput = resolveShotVideoOutput(input.project, input.shot)
  const taskId = resolveEffectiveVideoTaskId(currentOutput.taskId, input.shot.generatedTaskId)
  if (!taskId) {
    const latestProject = (await cloneRepo.getProject(input.project.id)) || input.project
    ensureCloneFlowState(latestProject)
    const latestShot = projectBlueprintShots(latestProject).find((item) => item.id === input.shot.id) || input.shot
    const reason = '当前分镜缺少可继续查询的 taskId，已停止自动续查，请重新生成该分镜视频。'
    const classifiedReason = `[missing_task] ${reason}`
    syncSegmentVideoOutput(latestProject, latestShot, {
      status: 'failed_terminal',
      error: classifiedReason,
      lastPollAt: now(),
      taskId: undefined,
      remoteStatus: undefined,
      remoteRaw: undefined,
    })
    replaceProjectShot(latestProject, latestShot.id, {
      status: 'failed',
      error: classifiedReason,
      generatedClipPath: undefined,
      generatedTaskId: undefined,
    })
    latestProject.lastError = classifiedReason
    setProjectErrorContext(latestProject, {
      ...apifoxContextByCapability(creds, 'video_start_end_to_video'),
      action: 'poll_existing_segment_task_missing_task_id',
      message: reason,
      responseSnippet: JSON.stringify({
        shotId: latestShot.id,
        shotStatus: latestShot.status,
        outputStatus: currentOutput.status,
      }).slice(0, 500),
    })
    const saved = await cloneRepo.upsertProject(latestProject)
    return { project: saved, task: null, synced: false, status: 'failed_terminal' as const }
  }
  const started = Date.now()
  const videoHub = resolveApifoxHubCredentials(creds, 'video')
  const pollMs = Math.max(5000, Number(videoHub?.defaultPollIntervalMs ?? 2000) || 2000)
  const waitMs = Math.max(0, Number(input.waitMs ?? 0))
  const maxPollAttempts = waitMs > 0 ? Math.max(1, Math.ceil(waitMs / pollMs) + 1) : 1
  let attemptCount = 0
  let lastTask: Awaited<ReturnType<typeof queryAi666Task>> | null = null
  do {
    attemptCount += 1
    const latestProject = (await cloneRepo.getProject(input.project.id)) || input.project
    ensureCloneFlowState(latestProject)
    const latestShot = projectBlueprintShots(latestProject).find((item) => item.id === input.shot.id) || input.shot
    const latestOutputBeforePoll = resolveShotVideoOutput(latestProject, latestShot)
    const latestActiveTaskId = resolveEffectiveVideoTaskId(latestOutputBeforePoll.taskId, latestShot.generatedTaskId)
    if (
      isSupersededShotVideoTaskBinding({
        currentTaskId: taskId,
        activeTaskId: latestActiveTaskId,
        previousTaskIds: latestOutputBeforePoll.previousTaskIds,
      })
    ) {
      console.log('[clone-debug] shot-video-poll:skip-superseded-task', {
        projectId: latestProject.id,
        shotId: latestShot.id,
        taskId,
        activeTaskId: latestActiveTaskId || undefined,
        previousTaskIds: latestOutputBeforePoll.previousTaskIds ?? [],
      })
      return {
        project: latestProject,
        task: lastTask,
        synced: false,
        status: String(latestOutputBeforePoll.status || 'submitting') as CloneShotVideoOutput['status'],
      }
    }
    try {
      syncSegmentVideoOutput(latestProject, latestShot, {
        status: 'remote_running',
        taskId,
        provider: currentOutput.provider || videoProviderLabel(creds),
        model: currentOutput.model || videoProviderModel(creds),
        endpointStyle: currentOutput.endpointStyle || videoHub?.videoEndpointStyle,
        baseUrl: currentOutput.baseUrl || videoHub?.baseUrl,
        requestCapability: currentOutput.requestCapability || 'video_start_end_to_video',
        lastPollAt: now(),
        error: undefined,
      })
      if (String(latestProject.lastErrorContext?.taskId || '').trim() === taskId) {
        setProjectErrorContext(latestProject, null)
      }
      await cloneRepo.upsertProject(latestProject)
      lastTask = await queryAi666Task({
        credentials: creds,
        taskId,
        baseUrl: currentOutput.baseUrl || videoHub?.baseUrl,
        endpointStyle: currentOutput.endpointStyle || videoHub?.videoEndpointStyle,
        model: currentOutput.model || videoProviderModel(creds),
      })
      const remoteStatus = String(lastTask.status || '').trim()
      if (lastTask.status === 'succeeded' && lastTask.outputUrls[0]) {
        syncSegmentVideoOutput(latestProject, latestShot, {
          status: 'downloading',
          taskId,
          remoteStatus,
          remoteRaw: lastTask.raw,
          videoUrl: lastTask.outputUrls[0],
          lastPollAt: now(),
          error: undefined,
        })
        await cloneRepo.upsertProject(latestProject)
        scheduleRemoteStoryboardVideoReconcile(latestProject.id, SHOT_VIDEO_RECONCILE_RETRY_DELAY_MS)
        if (input.skipDownload) {
          return { project: latestProject, task: lastTask, synced: false, status: 'downloading' as const }
        }
        const outDir = join(getAppPaths().dataDir, 'viral-clone', latestProject.id, 'shots', latestShot.id)
        await mkdir(outDir, { recursive: true })
        const outPath = join(outDir, 'generated_clip.mp4')
        await downloadAtlasToFile(lastTask.outputUrls[0], outPath, 'VectorEngine 继续查询下载')
        const saved = await saveSegmentDone({
          project: latestProject,
          shot: latestShot,
          taskId,
          provider: currentOutput.provider || videoProviderLabel(creds),
          model: currentOutput.model || videoProviderModel(creds),
          endpointStyle: currentOutput.endpointStyle || videoHub?.videoEndpointStyle,
          baseUrl: currentOutput.baseUrl || videoHub?.baseUrl,
          requestCapability: currentOutput.requestCapability || 'video_start_end_to_video',
          videoUrl: lastTask.outputUrls[0],
          localPath: outPath,
          remoteStatus,
          remoteRaw: lastTask.raw,
        })
        return { project: saved, task: lastTask, synced: true, status: 'done' as const }
      }
      if (lastTask.status === 'failed' || isCloudTerminalFailure(lastTask.raw?.status ?? lastTask.raw?.data?.status)) {
        const reason = lastTask.errorMessage || `VectorEngine 视频任务失败: ${taskId}`
        const missingRemoteTask = isMissingRemoteVideoTask(lastTask)
        const classifiedReason = `[${missingRemoteTask ? 'missing_task' : 'remote_failed'}] ${reason}`
        replaceProjectShot(latestProject, latestShot.id, {
          status: 'failed',
          error: classifiedReason,
          generatedClipPath: undefined,
          generatedTaskId: missingRemoteTask ? undefined : taskId,
          generatedProvider: currentOutput.provider || videoProviderLabel(creds),
          generatedModel: currentOutput.model || videoProviderModel(creds),
        })
        syncSegmentVideoOutput(latestProject, latestShot, {
          status: 'failed_terminal',
          previousTaskIds: missingRemoteTask
            ? Array.from(new Set([...(currentOutput.previousTaskIds ?? []), taskId]))
            : currentOutput.previousTaskIds,
          taskId: missingRemoteTask ? undefined : taskId,
          remoteStatus,
          remoteRaw: lastTask.raw,
          error: classifiedReason,
          lastPollAt: now(),
          videoPath: missingRemoteTask ? undefined : currentOutput.videoPath,
          localPath: missingRemoteTask ? undefined : currentOutput.localPath,
          videoUrl: missingRemoteTask ? undefined : currentOutput.videoUrl,
        })
        latestProject.lastError = `[${videoProviderLabel(creds)} / ${videoProviderModel(creds)}] ${classifiedReason}`
        setProjectErrorContext(latestProject, {
          ...apifoxContextByCapability(creds, 'video_start_end_to_video'),
          action: 'poll_existing_segment_task',
          taskId,
          message: reason,
          responseSnippet: JSON.stringify(lastTask.raw).slice(0, 500),
        })
        const saved = await cloneRepo.upsertProject(latestProject)
        return { project: saved, task: lastTask, synced: false, status: 'failed_terminal' as const }
      }
      syncSegmentVideoOutput(latestProject, latestShot, {
        status: 'remote_running',
        taskId,
        remoteStatus,
        remoteRaw: lastTask.raw,
        lastPollAt: now(),
        error: undefined,
      })
      replaceProjectShot(latestProject, latestShot.id, {
        status: 'generating',
        error: '',
        generatedClipPath: undefined,
      })
      if (String(latestProject.lastErrorContext?.taskId || '').trim() === taskId) {
        setProjectErrorContext(latestProject, null)
      }
      await cloneRepo.upsertProject(latestProject)
    } catch (error: any) {
      const reason = String(error?.message ?? error)
      const classifiedReason = `[remote_timeout] ${videoPollingTimeoutMessage(videoProviderLabel(creds))} taskId=${taskId}`
      syncSegmentVideoOutput(latestProject, latestShot, {
        status: 'failed_retryable',
        taskId,
        remoteStatus: 'remote_unknown',
        remoteRaw: { error: reason },
        lastPollAt: now(),
        error: classifiedReason,
      })
      replaceProjectShot(latestProject, latestShot.id, {
        status: 'failed',
        error: classifiedReason,
        generatedClipPath: undefined,
      })
      setProjectErrorContext(latestProject, {
        ...apifoxContextByCapability(creds, 'video_start_end_to_video'),
        action: 'poll_existing_segment_task',
        taskId,
        message: videoPollingTimeoutMessage(videoProviderLabel(creds)),
        responseSnippet: reason,
      })
      const saved = await cloneRepo.upsertProject(latestProject)
      return { project: saved, task: lastTask, synced: false, status: 'failed_retryable' as const }
    }
    if (attemptCount >= maxPollAttempts || Date.now() - started >= waitMs) break
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  } while (true)

  const latestProject = (await cloneRepo.getProject(input.project.id)) || input.project
  const latestShot = projectBlueprintShots(latestProject).find((item) => item.id === input.shot.id) || input.shot
  if (waitMs <= 0 && taskId) {
    const latestRemoteStatus = String(lastTask?.status || '').trim() || 'running'
    syncSegmentVideoOutput(latestProject, latestShot, {
      status: 'remote_running',
      taskId,
      remoteStatus: latestRemoteStatus,
      remoteRaw: lastTask?.raw,
      lastPollAt: now(),
      error: undefined,
    })
    replaceProjectShot(latestProject, latestShot.id, {
      status: 'generating',
      error: '',
      generatedClipPath: undefined,
      generatedTaskId: taskId,
    })
    const saved = await cloneRepo.upsertProject(latestProject)
    console.log('[clone-debug] shot-video-poll:single-pass-still-running', {
      projectId: latestProject.id,
      shotId: latestShot.id,
      taskId,
      remoteStatus: latestRemoteStatus,
    })
    return { project: saved, task: lastTask, synced: false, status: 'remote_running' as const }
  }
  syncSegmentVideoOutput(latestProject, latestShot, {
    status: 'failed_retryable',
    taskId,
    remoteStatus: lastTask?.status || 'running',
    remoteRaw: lastTask?.raw,
    lastPollAt: now(),
    error: `${videoPollingTimeoutMessage(videoProviderLabel(creds))} taskId=${taskId} attempts=${attemptCount}/${maxPollAttempts}`,
  })
  replaceProjectShot(latestProject, latestShot.id, {
    status: 'failed',
    error: `${videoPollingTimeoutMessage(videoProviderLabel(creds))} taskId=${taskId} attempts=${attemptCount}/${maxPollAttempts}`,
    generatedClipPath: undefined,
  })
  setProjectErrorContext(latestProject, {
    ...apifoxContextByCapability(creds, 'video_start_end_to_video'),
    action: 'poll_existing_segment_task',
    taskId,
    message: `${videoPollingTimeoutMessage(videoProviderLabel(creds))} attempts=${attemptCount}/${maxPollAttempts}`,
    responseSnippet: JSON.stringify(lastTask?.raw ?? {}).slice(0, 500),
  })
  const saved = await cloneRepo.upsertProject(latestProject)
  return { project: saved, task: lastTask, synced: false, status: 'failed_retryable' as const }
}

async function downloadCompletedSegmentTask(input: {
  project: CloneProject
  shot: ShotSpec
}) {
  const latestProject = (await cloneRepo.getProject(input.project.id)) || input.project
  const latestShot = projectBlueprintShots(latestProject).find((item) => item.id === input.shot.id) || input.shot
  const currentOutput = resolveShotVideoOutput(latestProject, latestShot)
  const activeTaskId = resolveEffectiveVideoTaskId(currentOutput.taskId, latestShot.generatedTaskId)
  const currentTaskId = String(currentOutput.taskId || latestShot.generatedTaskId || '').trim()
  if (
    isSupersededShotVideoTaskBinding({
      currentTaskId,
      activeTaskId,
      previousTaskIds: currentOutput.previousTaskIds,
    })
  ) {
    console.log('[clone-debug] shot-video-download:skip-superseded-task', {
      projectId: latestProject.id,
      shotId: latestShot.id,
      taskId: currentTaskId || undefined,
      activeTaskId: activeTaskId || undefined,
      previousTaskIds: currentOutput.previousTaskIds ?? [],
      status: currentOutput.status,
    })
    return { project: latestProject, status: String(currentOutput.status || 'submitting') as 'submitting' }
  }
  if (isStaleShotVideoDownloadBlocked(currentOutput)) {
    console.log('[clone-debug] shot-video-download:skip-stale-replacement', {
      projectId: latestProject.id,
      shotId: latestShot.id,
      taskId: currentOutput.taskId || latestShot.generatedTaskId || undefined,
      previousTaskIds: currentOutput.previousTaskIds ?? [],
      status: currentOutput.status,
      sourceEvent: currentOutput.sourceEvent,
    })
    return { project: latestProject, status: String(currentOutput.status || 'submitting') as 'submitting' }
  }
  const remoteRaw = (currentOutput.remoteRaw ?? {}) as Record<string, any>
  const remoteRawData =
    remoteRaw?.data && typeof remoteRaw.data === 'object' ? (remoteRaw.data as Record<string, any>) : {}
  const videoUrl = String(currentOutput.videoUrl || remoteRaw?.video_url || remoteRawData?.video_url || '').trim()
  console.log('[clone-debug] shot-video-download:begin', {
    projectId: latestProject.id,
    shotId: latestShot.id,
    taskId: currentOutput.taskId || latestShot.generatedTaskId || undefined,
    status: currentOutput.status,
    remoteStatus: currentOutput.remoteStatus,
    hasVideoUrl: Boolean(videoUrl),
  })
  if (!videoUrl) {
    const reason = '[download_failed] 远端成功结果缺少视频地址'
    syncSegmentVideoOutput(latestProject, latestShot, {
      status: 'failed_retryable',
      error: reason,
      lastPollAt: now(),
    })
    replaceProjectShot(latestProject, latestShot.id, {
      status: 'failed',
      error: reason,
    })
    const saved = await cloneRepo.upsertProject(latestProject)
    console.log('[clone-debug] shot-video-download:missing-url', {
      projectId: latestProject.id,
      shotId: latestShot.id,
      taskId: currentOutput.taskId || latestShot.generatedTaskId || undefined,
      status: 'failed_retryable',
      reason,
    })
    return { project: saved, status: 'failed_retryable' as const, reason }
  }
  try {
    const outDir = join(getAppPaths().dataDir, 'viral-clone', latestProject.id, 'shots', latestShot.id)
    await mkdir(outDir, { recursive: true })
    const outPath = join(outDir, 'generated_clip.mp4')
    await downloadAtlasToFile(videoUrl, outPath, 'VectorEngine 下载收尾')
    const saved = await saveSegmentDone({
      project: latestProject,
      shot: latestShot,
      taskId: currentOutput.taskId || latestShot.generatedTaskId,
      provider: currentOutput.provider,
      model: currentOutput.model,
      endpointStyle: currentOutput.endpointStyle,
      requestCapability: currentOutput.requestCapability || 'video_start_end_to_video',
      videoUrl,
      localPath: outPath,
      remoteStatus: currentOutput.remoteStatus || 'succeeded',
      remoteRaw: currentOutput.remoteRaw,
    })
    console.log('[clone-debug] shot-video-download:done', {
      projectId: latestProject.id,
      shotId: latestShot.id,
      taskId: currentOutput.taskId || latestShot.generatedTaskId || undefined,
      outputPath: outPath,
    })
    scheduleRemoteStoryboardVideoReconcile(latestProject.id, SHOT_VIDEO_RECONCILE_RETRY_DELAY_MS)
    return { project: saved, status: 'done' as const }
  } catch (error: any) {
    const reason = `[download_failed] ${String(error?.message ?? error ?? '下载收尾失败')}`
    syncSegmentVideoOutput(latestProject, latestShot, {
      status: 'failed_retryable',
      error: reason,
      taskId: currentOutput.taskId || latestShot.generatedTaskId,
      videoUrl,
      remoteStatus: currentOutput.remoteStatus || 'succeeded',
      remoteRaw: currentOutput.remoteRaw,
      lastPollAt: now(),
    })
    replaceProjectShot(latestProject, latestShot.id, {
      status: 'failed',
      error: reason,
      generatedTaskId: currentOutput.taskId || latestShot.generatedTaskId,
    })
    const saved = await cloneRepo.upsertProject(latestProject)
    console.log('[clone-debug] shot-video-download:failed', {
      projectId: latestProject.id,
      shotId: latestShot.id,
      taskId: currentOutput.taskId || latestShot.generatedTaskId || undefined,
      reason,
    })
    scheduleRemoteStoryboardVideoReconcile(latestProject.id, SHOT_VIDEO_RECONCILE_RETRY_DELAY_MS)
    return { project: saved, status: 'failed_retryable' as const, reason }
  }
}

async function continueShotVideoResultFlow(input: {
  project: CloneProject
  shot: ShotSpec
  allowFailed?: boolean
}) {
  const currentProject = (await cloneRepo.getProject(input.project.id)) || input.project
  ensureCloneFlowState(currentProject)
  const currentShot = projectBlueprintShots(currentProject).find((item) => item.id === input.shot.id) || input.shot
  const currentOutput = resolveShotVideoOutput(currentProject, currentShot)
  const currentVideoPath = String(currentOutput.videoPath || currentOutput.localPath || currentShot.generatedClipPath || '').trim()
  if (currentVideoPath && !(await fileExists(currentVideoPath))) {
    syncSegmentVideoOutput(currentProject, currentShot, {
      videoPath: undefined,
      localPath: undefined,
    })
    replaceProjectShot(currentProject, currentShot.id, {
      generatedClipPath: undefined,
    })
    await cloneRepo.upsertProject(currentProject)
  }
  const repairedOutput = resolveShotVideoOutput(currentProject, currentShot)
  console.log('[clone-debug] shot-video-continue-flow:enter', {
    projectId: currentProject.id,
    shotId: currentShot.id,
    status: repairedOutput.status,
    taskId: resolveEffectiveVideoTaskId(repairedOutput.taskId, currentShot.generatedTaskId) || undefined,
    hasVideoUrl: Boolean(String(repairedOutput.videoUrl || '').trim()),
    hasLocalVideo: Boolean(String(repairedOutput.videoPath || repairedOutput.localPath || '').trim()),
  })
  if (isStaleShotVideoDownloadBlocked(repairedOutput)) {
    console.log('[clone-debug] shot-video-continue-flow:skip-stale-replacement', {
      projectId: currentProject.id,
      shotId: currentShot.id,
      status: repairedOutput.status,
      taskId: resolveEffectiveVideoTaskId(repairedOutput.taskId, currentShot.generatedTaskId) || undefined,
      previousTaskIds: repairedOutput.previousTaskIds ?? [],
    })
    return {
      project: currentProject,
      task: null,
      synced: false,
      status: String(repairedOutput.status || 'submitting') as CloneShotVideoOutput['status'],
    }
  }
  if (String(repairedOutput.videoUrl || '').trim() && !String(repairedOutput.videoPath || repairedOutput.localPath || '').trim()) {
    syncSegmentVideoOutput(currentProject, currentShot, {
      status: 'downloading',
      error: undefined,
    })
    await cloneRepo.upsertProject(currentProject)
    console.log('[clone-debug] shot-video-continue-flow:dispatch-download', {
      projectId: currentProject.id,
      shotId: currentShot.id,
      taskId: resolveEffectiveVideoTaskId(repairedOutput.taskId, currentShot.generatedTaskId) || undefined,
      reason: 'has_video_url_without_local_file',
    })
    return await runVideoTaskPoolJob({
      pool: 'download',
      project: currentProject,
      shotId: currentShot.id,
      taskId: resolveEffectiveVideoTaskId(repairedOutput.taskId, currentShot.generatedTaskId) || undefined,
      worker: () => downloadCompletedSegmentTask({ project: currentProject, shot: currentShot }),
    })
  }
  if (isDownloadReadyShotStatus(repairedOutput.status) && String(repairedOutput.videoUrl || '').trim()) {
    console.log('[clone-debug] shot-video-continue-flow:reuse-download', {
      projectId: currentProject.id,
      shotId: currentShot.id,
      taskId: resolveEffectiveVideoTaskId(repairedOutput.taskId, currentShot.generatedTaskId) || undefined,
      status: repairedOutput.status,
    })
    return await runVideoTaskPoolJob({
      pool: 'download',
      project: currentProject,
      shotId: currentShot.id,
      taskId: resolveEffectiveVideoTaskId(repairedOutput.taskId, currentShot.generatedTaskId) || undefined,
      worker: () => downloadCompletedSegmentTask({ project: currentProject, shot: currentShot }),
    })
  }
  const polled = await runVideoTaskPoolJob({
    pool: 'poll',
    project: currentProject,
    shotId: currentShot.id,
    taskId: resolveEffectiveVideoTaskId(repairedOutput.taskId, currentShot.generatedTaskId) || undefined,
    worker: () => pollExistingSegmentTask({ project: currentProject, shot: currentShot, waitMs: 0, allowFailed: input.allowFailed, skipDownload: true }),
  })
  console.log('[clone-debug] shot-video-continue-flow:polled', {
    projectId: currentProject.id,
    shotId: currentShot.id,
    status: polled.status,
    synced: polled.synced,
  })
  if (isDownloadReadyShotStatus(polled.status)) {
    const latestProject = (await cloneRepo.getProject(currentProject.id)) || polled.project || currentProject
    ensureCloneFlowState(latestProject)
    const latestShot = projectBlueprintShots(latestProject).find((item) => item.id === currentShot.id) || currentShot
    const latestOutput = resolveShotVideoOutput(latestProject, latestShot)
    const recoveredVideoUrl = String(
      latestOutput.videoUrl ||
        ((latestOutput.remoteRaw as any)?.video_url ?? (latestOutput.remoteRaw as any)?.data?.video_url ?? ''),
    ).trim()
    if (recoveredVideoUrl && !String(latestOutput.videoUrl || '').trim()) {
      syncSegmentVideoOutput(latestProject, latestShot, {
        videoUrl: recoveredVideoUrl,
        remoteStatus: latestOutput.remoteStatus || 'succeeded',
        status: String(latestOutput.status || '').trim().toLowerCase() === 'remote_succeeded_pending_download' ? 'remote_succeeded_pending_download' : 'downloading',
        error: undefined,
      })
      await cloneRepo.upsertProject(latestProject)
    }
    if (recoveredVideoUrl) {
      console.log('[clone-debug] shot-video-continue-flow:polled-dispatch-download', {
        projectId: latestProject.id,
        shotId: latestShot.id,
        taskId: resolveEffectiveVideoTaskId(latestOutput.taskId, latestShot.generatedTaskId) || undefined,
        recoveredVideoUrl: recoveredVideoUrl.slice(0, 180),
      })
      return await runVideoTaskPoolJob({
        pool: 'download',
        project: latestProject,
        shotId: latestShot.id,
        taskId: resolveEffectiveVideoTaskId(latestOutput.taskId, latestShot.generatedTaskId) || undefined,
        worker: () => downloadCompletedSegmentTask({ project: latestProject, shot: latestShot }),
      })
    }
  }
  return polled
}

async function clearShotVideoArtifacts(projectId: string, shotId: string) {
  const shotDir = join(getAppPaths().dataDir, 'viral-clone', projectId, 'shots', shotId)
  const candidates = [
    join(shotDir, 'generated_clip.mp4'),
    join(getAppPaths().dataDir, 'viral-clone', projectId, 'scene_videos', `${shotId}.mp4`),
  ]
  for (const filePath of candidates) {
    try {
      await rm(filePath, { force: true })
    } catch {}
  }
}

async function clearShotStoryboardArtifacts(projectId: string, shotId: string) {
  const shotDir = join(getAppPaths().dataDir, 'viral-clone', projectId, 'shots', shotId)
  const candidates = [
    join(shotDir, 'gpt-frames'),
    join(shotDir, 'first_frame.png'),
    join(shotDir, 'last_frame.png'),
  ]
  for (const filePath of candidates) {
    try {
      await rm(filePath, { recursive: true, force: true })
    } catch {}
  }
}

async function forceRecoverSingleShotVideoResult(input: {
  project: CloneProject
  shot: ShotSpec
}) {
  const latestProject = (await cloneRepo.getProject(input.project.id)) || input.project
  ensureCloneFlowState(latestProject)
  const latestShot = projectBlueprintShots(latestProject).find((item) => item.id === input.shot.id) || input.shot
  const latestOutput = resolveShotVideoOutput(latestProject, latestShot)
  const shouldBlockLegacyLocalReuse =
    Boolean(resolveEffectiveVideoTaskId(latestOutput.taskId, latestShot.generatedTaskId)) &&
    isActiveShotVideoRemoteStatus(String(latestOutput.status || '').trim().toLowerCase()) &&
    Boolean(latestOutput.previousTaskIds?.length)
  const local = shouldBlockLegacyLocalReuse
    ? { skip: false as const }
    : await checkLocalTaskStatus({ project: latestProject, shot: latestShot })
  if (local.skip && local.videoPath) {
    syncSegmentVideoOutput(latestProject, latestShot, {
      status: 'done',
      taskId: local.taskId || latestOutput.taskId,
      videoPath: local.videoPath,
      localPath: local.videoPath,
      error: undefined,
      completedAt: latestOutput.completedAt || now(),
    })
    replaceProjectShot(latestProject, latestShot.id, {
      status: 'done',
      generatedClipPath: local.videoPath,
      generatedTaskId: local.taskId || latestOutput.taskId,
      error: '',
    })
    const saved = await cloneRepo.upsertProject(latestProject)
    return { project: saved, status: 'done' as const, synced: true, taskId: local.taskId || latestOutput.taskId }
  }

  const creds = await cloneRepo.getCredentials()
  const taskId = resolveEffectiveVideoTaskId(latestOutput.taskId, latestShot.generatedTaskId)
  if (!taskId) {
    const reason = '[missing_task] 当前分镜没有可继续查询的 taskId'
    syncSegmentVideoOutput(latestProject, latestShot, {
      status: 'failed_terminal',
      error: reason,
      lastPollAt: now(),
    })
    replaceProjectShot(latestProject, latestShot.id, {
      status: 'failed',
      error: reason,
      generatedTaskId: undefined,
    })
    const saved = await cloneRepo.upsertProject(latestProject)
    return { project: saved, status: 'failed_terminal' as const, synced: false, taskId: undefined, error: reason }
  }

  const task = await queryAi666Task({
    credentials: creds,
    taskId,
    baseUrl: latestOutput.baseUrl || resolveApifoxHubCredentials(creds, 'video')?.baseUrl,
    endpointStyle: latestOutput.endpointStyle || resolveApifoxHubCredentials(creds, 'video')?.videoEndpointStyle,
    model: latestOutput.model || videoProviderModel(creds),
  })
  const remoteStatus = String(task.status || '').trim()
  if (task.status === 'succeeded' && task.outputUrls[0]) {
    const outDir = join(getAppPaths().dataDir, 'viral-clone', latestProject.id, 'shots', latestShot.id)
    await mkdir(outDir, { recursive: true })
    const outPath = join(outDir, 'generated_clip.mp4')
    await downloadAtlasToFile(task.outputUrls[0], outPath, 'VectorEngine 单镜头强制回写下载')
    const saved = await saveSegmentDone({
      project: latestProject,
      shot: latestShot,
      taskId,
      provider: latestOutput.provider || videoProviderLabel(creds),
      model: latestOutput.model || videoProviderModel(creds),
      endpointStyle: latestOutput.endpointStyle || resolveApifoxHubCredentials(creds, 'video')?.videoEndpointStyle,
      baseUrl: latestOutput.baseUrl || resolveApifoxHubCredentials(creds, 'video')?.baseUrl,
      requestCapability: latestOutput.requestCapability || 'video_start_end_to_video',
      videoUrl: task.outputUrls[0],
      localPath: outPath,
      remoteStatus,
      remoteRaw: task.raw,
    })
    return { project: saved, status: 'done' as const, synced: true, taskId }
  }

  if (task.status === 'failed' || isCloudTerminalFailure(task.raw?.status ?? task.raw?.data?.status)) {
    const reason = `[remote_failed] ${task.errorMessage || `VectorEngine 视频任务失败: ${taskId}`}`
    syncSegmentVideoOutput(latestProject, latestShot, {
      status: 'failed_terminal',
      taskId,
      remoteStatus,
      remoteRaw: task.raw,
      error: reason,
      lastPollAt: now(),
    })
    replaceProjectShot(latestProject, latestShot.id, {
      status: 'failed',
      error: reason,
      generatedTaskId: taskId,
    })
    const saved = await cloneRepo.upsertProject(latestProject)
    return { project: saved, status: 'failed_terminal' as const, synced: false, taskId, error: reason }
  }

  syncSegmentVideoOutput(latestProject, latestShot, {
    status: 'remote_running',
    taskId,
    remoteStatus,
    remoteRaw: task.raw,
    lastPollAt: now(),
    error: undefined,
  })
  const saved = await cloneRepo.upsertProject(latestProject)
  return { project: saved, status: 'remote_running' as const, synced: false, taskId }
}

async function ensureShotVideoState(projectId: string, shotId: string, intent: NormalizedShotVideoIntent) {
  let project = await cloneRepo.getProject(projectId)
  if (!project || !project.blueprint) throw new Error('澶嶅埢椤圭洰涓嶅瓨鍦?')
  ensureCloneFlowState(project)
  if (intent !== 'force_regenerate') {
    await normalizeProjectShotVideoStates(project)
  }
  project = await cloneRepo.upsertProject(project)
  const shot = projectBlueprintShots(project).find((item) => item.id === shotId)
  if (!shot) throw new Error('鍒嗛暅涓嶅瓨鍦?')
  const output = resolveShotVideoOutput(project, shot)
  const status = String(output.status || '').trim().toLowerCase()

  if (intent === 'force_regenerate') {
    const replacementStartedAt = now()
    await clearShotVideoArtifacts(projectId, shotId)
    syncSegmentVideoOutput(project, shot, {
      previousTaskIds: Array.from(
        new Set(
          [output.taskId, ...(output.previousTaskIds ?? [])].filter(
            (value): value is string => Boolean(String(value || '').trim()),
          ),
        ),
      ),
      retryCount: 0,
      taskId: undefined,
      provider: undefined,
      model: undefined,
      submissionFingerprint: undefined,
      submissionStartedAt: replacementStartedAt,
      submissionLockedUntil: replacementStartedAt + SHOT_VIDEO_SUBMISSION_LOCK_MS,
      videoPath: undefined,
      localPath: undefined,
      videoUrl: undefined,
      remoteRaw: undefined,
      completedAt: undefined,
      durationSec: undefined,
      status: 'submitting',
      remoteStatus: undefined,
      error: undefined,
      sourceEvent: 'force_regenerate_reset',
    })
    replaceProjectShot(project, shot.id, {
      generatedClipPath: undefined,
      generatedTaskId: undefined,
      generatedProvider: undefined,
      generatedModel: undefined,
      generatedSource: undefined,
      generatedClipDurationSec: undefined,
      uploadedAssetPath: undefined,
      error: '',
      status: 'generating',
      retryCount: 0,
      qualityStatus: 'unchecked',
      qualityReasons: [],
      canEnterRender: false,
    })
    project = await cloneRepo.upsertProject(project)
    try {
      return await cloneService.generateShotClip({
        cloneProjectId: projectId,
        shotId,
        forceRegenerate: true,
      })
    } catch (error) {
      const latestProject = (await cloneRepo.getProject(projectId)) || project
      const latestShot = projectBlueprintShots(latestProject).find((item) => item.id === shotId) || shot
      const reason = String((error as any)?.message ?? error ?? '强制重新生成失败')
      syncSegmentVideoOutput(latestProject, latestShot, {
        status: 'failed_terminal',
        error: reason,
        taskId: undefined,
        provider: undefined,
        model: undefined,
        videoPath: undefined,
        localPath: undefined,
        videoUrl: undefined,
      })
      replaceProjectShot(latestProject, latestShot.id, {
        generatedClipPath: undefined,
        status: 'failed',
        error: reason,
      })
      await cloneRepo.upsertProject(latestProject)
      throw error
    }
  }

  if (intent === 'download_if_ready') {
    if (isShotVideoAwaitingReplacementTask(output)) {
      return project
    }
    if (
      status === 'remote_succeeded_pending_download' ||
      (status === 'downloading' && hasSucceededRemoteVideoResult(output)) ||
      ((status === 'failed_retryable' || status === 'polling_timeout' || status === 'failed') && hasSucceededRemoteVideoResult(output))
    ) {
      return (await downloadCompletedSegmentTask({ project, shot })).project
    }
    return project
  }

  if (intent === 'poll_only') {
    const normalizedOutput = await normalizeShotVideoState(project, shot)
    const normalizedStatus = String(normalizedOutput.status || '').trim().toLowerCase()
    if (isShotVideoAwaitingReplacementTask(normalizedOutput)) {
      return await cloneRepo.upsertProject(project)
    }
    if (
      normalizedStatus === 'remote_pending' ||
      normalizedStatus === 'remote_running' ||
      normalizedStatus === 'remote_succeeded_pending_download' ||
      normalizedStatus === 'downloading' ||
      normalizedStatus === 'failed_retryable'
    ) {
      replaceProjectShot(project, shot.id, {
        generatedClipPath: undefined,
      })
      await cloneRepo.upsertProject(project)
    }
    if (String(normalizedOutput.videoPath || normalizedOutput.localPath || '').trim()) {
      return await cloneRepo.upsertProject(project)
    }
    if (
      String(normalizedOutput.videoUrl || '').trim() &&
      (
        normalizedStatus === 'remote_succeeded_pending_download' ||
        normalizedStatus === 'downloading' ||
        normalizedStatus === 'failed_retryable' ||
        normalizedStatus === 'polling_timeout' ||
        hasSucceededRemoteVideoResult(normalizedOutput)
      )
    ) {
      return (await downloadCompletedSegmentTask({ project, shot })).project
    }
    if (!resolveEffectiveVideoTaskId(output.taskId, shot.generatedTaskId)) return project
    return (await continueShotVideoResultFlow({ project, shot, allowFailed: true })).project
  }

  if (intent === 'recover_if_possible') {
    if (status === 'done') return project
    if (String(output.videoPath || output.localPath || '').trim()) {
      await normalizeShotVideoState(project, shot)
      return await cloneRepo.upsertProject(project)
    }
    if (isShotVideoAwaitingReplacementTask(output)) {
      return project
    }
    if (String(output.videoUrl || '').trim() || hasSucceededRemoteVideoResult(output)) {
      return (await downloadCompletedSegmentTask({ project, shot })).project
    }
    if (resolveEffectiveVideoTaskId(output.taskId, shot.generatedTaskId)) {
      return (await continueShotVideoResultFlow({ project, shot, allowFailed: true })).project
    }
    return project
  }

  if (intent === 'submit_if_needed') {
    if (status === 'done') return project
    if (isShotVideoAwaitingReplacementTask(output)) return project
    if (
      status === 'remote_succeeded_pending_download' ||
      status === 'downloading' ||
      ((status === 'failed_retryable' || status === 'polling_timeout' || status === 'failed') && hasSucceededRemoteVideoResult(output))
    ) {
      return (await downloadCompletedSegmentTask({ project, shot })).project
    }
    if (status === 'remote_running' || status === 'remote_pending' || status === 'submitting') {
      return (await continueShotVideoResultFlow({ project, shot, allowFailed: true })).project
    }
    return await cloneService.generateShotClip({
      cloneProjectId: projectId,
      shotId,
      forceRegenerate: false,
    })
  }

  return project
}

function normalizeContinuedShotVideoResult(result: Awaited<ReturnType<typeof continueShotVideoResultFlow>>) {
  return {
    project: result.project,
    status: result.status,
    synced: result.status === 'done' || Boolean((result as any).synced),
    task: 'task' in result ? result.task : undefined,
    reason: 'reason' in result ? result.reason : undefined,
  }
}

function isDownloadReadyShotStatus(status: unknown) {
  const normalized = String(status || '').trim().toLowerCase()
  return normalized === 'downloading' || normalized === 'remote_succeeded_pending_download'
}

async function reconcileRemoteStoryboardVideosInternal(projectId: string) {
  let project = await cloneRepo.getProject(projectId)
  if (!project) throw new Error('复刻项目不存在')
  ensureCloneFlowState(project)
  console.log('[clone-debug] shot-video-reconcile:start', { projectId })
  const results: Array<{ shotId: string; status: string; taskId?: string; synced?: boolean; error?: string }> = []
  const shots = projectBlueprintShots(project).sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
  await refreshGenerationQueueRuntime(project.id)
  await mapWithConcurrency(shots, Math.min(shots.length || 1, GLOBAL_VIDEO_TASK_LIMITS.poll + GLOBAL_VIDEO_TASK_LIMITS.download), async (shot) => {
    const latestProject = await cloneRepo.getProject(projectId)
    if (!latestProject) return
    project = latestProject
    const currentProject = latestProject
    const currentShot = projectBlueprintShots(currentProject).find((item) => item.id === shot.id) || shot
    const output = resolveShotVideoOutput(currentProject, currentShot)
    const recoveredTaskHandleFromRaw =
      !String(output.taskId || '').trim() && !String(currentShot.generatedTaskId || '').trim()
        ? pickRecoverableTaskHandle(output.remoteRaw)
        : ''
    if (recoveredTaskHandleFromRaw) {
      syncSegmentVideoOutput(currentProject, currentShot, {
        taskId: recoveredTaskHandleFromRaw,
        sourceEvent: 'segment_submit_missing_task',
        error: undefined,
      })
      replaceProjectShot(currentProject, currentShot.id, {
        generatedTaskId: recoveredTaskHandleFromRaw,
        error: '',
      })
      project = await cloneRepo.upsertProject(currentProject)
      console.log('[clone-debug] shot-video-reconcile:recovered-task-handle-from-raw', {
        projectId,
        shotId: currentShot.id,
        taskHandle: recoveredTaskHandleFromRaw,
      })
    }
    const effectiveTaskId = resolveEffectiveVideoTaskId(
      output.taskId || recoveredTaskHandleFromRaw,
      currentShot.generatedTaskId || recoveredTaskHandleFromRaw,
    )
    console.log('[clone-debug] shot-video-reconcile:inspect', {
      projectId,
      shotId: currentShot.id,
      status: output.status,
      outputTaskId: String(output.taskId || '').trim() || undefined,
      blueprintTaskId: String(currentShot.generatedTaskId || '').trim() || undefined,
      taskId: effectiveTaskId || undefined,
      hasVideoUrl: Boolean(String(output.videoUrl || '').trim()),
      hasLocalVideo: Boolean(String(output.videoPath || output.localPath || '').trim()),
    })
    const local = await checkLocalTaskStatus({ project: currentProject, shot: currentShot })
    if (local.skip) {
      console.log('[clone-debug] shot-video-reconcile:local-result-hit', {
        projectId,
        shotId: currentShot.id,
        taskId: local.taskId || output.taskId || undefined,
        videoPath: local.videoPath,
        previousStatus: output.status,
      })
      syncSegmentVideoOutput(currentProject, currentShot, {
        status: 'done',
        taskId: local.taskId || output.taskId,
        videoPath: local.videoPath,
        localPath: local.videoPath,
        error: undefined,
        completedAt: output.completedAt || now(),
      })
      replaceProjectShot(currentProject, currentShot.id, {
        status: 'done',
        generatedClipPath: local.videoPath,
        generatedTaskId: local.taskId || output.taskId,
        error: '',
      })
      project = await cloneRepo.upsertProject(currentProject)
      results.push({ shotId: currentShot.id, status: 'done', taskId: local.taskId || output.taskId, synced: true })
      await refreshGenerationQueueRuntime(project.id)
      return
    }
    if (output.status === 'done') return
    if (!isRecoverableVideoStatus(output.status)) return
    const recoverTaskId = isShotVideoAwaitingReplacementTask(output) ? '' : effectiveTaskId
    if (!recoverTaskId) {
      const pendingRemoteState = resolvePendingRemoteState(output.remoteStatus, output.remoteRaw)
      const currentRetryCount = Number(currentShot.retryCount ?? shot.retryCount ?? 0)
      if (Number(output.submissionLockedUntil ?? 0) > now()) {
        console.log('[clone-debug] shot-video-reconcile:missing-task-but-submit-locked', {
          projectId,
          shotId: currentShot.id,
          status: output.status,
          submissionLockedUntil: output.submissionLockedUntil,
          submissionStartedAt: output.submissionStartedAt,
          sourceEvent: output.sourceEvent,
        })
        results.push({ shotId: currentShot.id, status: String(output.status || 'submitting'), synced: false })
        await refreshGenerationQueueRuntime(project.id)
        return
      }
      if (
        false &&
        pendingRemoteState &&
        isShotVideoSubmitStartedEvent(output.sourceEvent) &&
        currentRetryCount < AUTO_CLONE_VIDEO_RETRY_LIMIT &&
        String(output.sourceEvent || '').trim() !== 'segment_submit_missing_task'
      ) {
        console.log('[clone-debug] shot-video-reconcile:missing-task-force-regenerate', {
          projectId,
          shotId: currentShot.id,
          status: output.status,
          remoteStatus: output.remoteStatus,
          sourceEvent: output.sourceEvent,
          retryCount: currentRetryCount,
        })
        try {
          const retryProject = await cloneService.generateShotClip({
            cloneProjectId: currentProject.id,
            shotId: currentShot.id,
            forceRegenerate: true,
          })
          const retryShot = retryProject.blueprint?.shots.find((item) => item.id === currentShot.id) || currentShot
          const retryOutput = resolveShotVideoOutput(retryProject, retryShot)
          const retriedTaskId = resolveEffectiveVideoTaskId(retryOutput.taskId, retryShot.generatedTaskId)
          results.push({
            shotId: currentShot.id,
            status: retriedTaskId ? String(retryOutput.status || 'submitting') : 'failed_retryable',
            taskId: retriedTaskId || undefined,
            synced: Boolean(String(retryOutput.videoPath || retryOutput.localPath || retryShot.generatedClipPath || '').trim()),
            error: retriedTaskId ? undefined : String(retryOutput.error || retryShot.error || 'missing task after force regenerate').trim(),
          })
          await refreshGenerationQueueRuntime(retryProject.id)
          return
        } catch (error: any) {
          if (isShotVideoLocalPreconditionError(error?.message ?? error)) {
            const localPreconditionReason = `[local_failed] ${String(error?.message ?? error ?? '本地前置条件不足').trim()}`
            syncSegmentVideoOutput(currentProject, currentShot, {
              status: 'failed_terminal',
              error: localPreconditionReason,
              remoteStatus: output.remoteStatus,
              remoteRaw: output.remoteRaw,
              lastPollAt: now(),
            })
            replaceProjectShot(currentProject, currentShot.id, {
              status: 'failed',
              error: localPreconditionReason,
              generatedTaskId: undefined,
            })
            currentProject.lastError = localPreconditionReason
            setProjectErrorContext(currentProject, {
              ...apifoxContextByCapability(await cloneRepo.getCredentials(), 'video_start_end_to_video'),
              action: 'reconcile_remote_storyboard_videos_missing_task_id_local_precondition',
              message: localPreconditionReason,
              responseSnippet: JSON.stringify({
                shotId: currentShot.id,
                outputStatus: output.status,
                remoteStatus: String(output.remoteStatus || '').trim() || undefined,
                sourceEvent: String(output.sourceEvent || '').trim() || undefined,
                regenerateError: String(error?.message ?? error ?? '').trim(),
              }).slice(0, 500),
            })
            project = await cloneRepo.upsertProject(currentProject)
            results.push({
              shotId: currentShot.id,
              status: 'failed_terminal',
              error: localPreconditionReason,
              synced: false,
            })
            await refreshGenerationQueueRuntime(project?.id || currentProject.id)
            return
          }
          console.error('[clone-debug] shot-video-reconcile:missing-task-force-regenerate-failed', {
            projectId,
            shotId: currentShot.id,
            message: String(error?.message ?? error ?? 'unknown error'),
          })
        }
      }
      if (hasReachedShotVideoRetryLimit(currentRetryCount)) {
        const terminalReason = `[retry_limit] 该分镜视频自动重新生成已达到 ${AUTO_CLONE_VIDEO_RETRY_LIMIT} 次，已停止继续查询和处理，请手动检查或更换素材后再重试`
        syncSegmentVideoOutput(currentProject, currentShot, {
          status: 'failed_terminal',
          error: terminalReason,
          remoteStatus: output.remoteStatus,
          remoteRaw: output.remoteRaw,
          lastPollAt: now(),
          retryCount: currentRetryCount,
        })
        replaceProjectShot(currentProject, currentShot.id, {
          status: 'failed',
          error: terminalReason,
          generatedTaskId: undefined,
          retryCount: currentRetryCount,
        })
        currentProject.lastError = terminalReason
        project = await cloneRepo.upsertProject(currentProject)
        results.push({
          shotId: currentShot.id,
          status: 'failed_terminal',
          error: terminalReason,
          synced: false,
        })
        await refreshGenerationQueueRuntime(project.id)
        return
      }
      const reason = '当前分镜缺少可继续查询的 taskId，已跳过远端续查，请重新生成该分镜视频。'
      const missingTaskGraceActive = isShotVideoMissingTaskGraceActive(output)
      if (missingTaskGraceActive) {
        syncSegmentVideoOutput(currentProject, currentShot, {
          status: 'submitting',
          error: '[missing_task] 当前分镜暂未回写 taskId，已锁定等待远端回写，期间不会重复创建视频任务',
          remoteStatus: output.remoteStatus,
          remoteRaw: output.remoteRaw,
          lastPollAt: now(),
          submissionLockedUntil: Math.max(
            Number(output.submissionLockedUntil ?? 0),
            Number(output.submissionStartedAt ?? 0) + SHOT_VIDEO_MISSING_TASK_GRACE_MS,
          ),
          sourceEvent: 'segment_submit_missing_task',
        })
        replaceProjectShot(currentProject, currentShot.id, {
          status: 'generating',
          error: '',
          generatedTaskId: undefined,
        })
        project = await cloneRepo.upsertProject(currentProject)
        results.push({
          shotId: currentShot.id,
          status: 'submitting',
          synced: false,
          error: '[missing_task] 当前分镜暂未回写 taskId，已锁定等待远端回写，期间不会重复创建视频任务',
        })
        await refreshGenerationQueueRuntime(project.id)
        return
      }
      const shouldKeepMissingTaskRetryable =
        Boolean(pendingRemoteState) ||
        isShotVideoSubmitStartedEvent(output.sourceEvent) ||
        String(output.remoteStatus || '').trim().length > 0
      const normalizedMissingTaskReason = shouldKeepMissingTaskRetryable
        ? '[missing_task] 当前分镜暂未回写 taskId，但远端可能仍在处理，可继续自动恢复或稍后重试'
        : reason
      syncSegmentVideoOutput(currentProject, currentShot, {
        status: shouldKeepMissingTaskRetryable ? 'failed_retryable' : 'failed_terminal',
        error: normalizedMissingTaskReason,
        remoteStatus: output.remoteStatus,
        remoteRaw: output.remoteRaw,
        lastPollAt: now(),
      })
      replaceProjectShot(currentProject, currentShot.id, {
        status: 'failed',
        error: normalizedMissingTaskReason,
        generatedTaskId: undefined,
      })
      currentProject.lastError = normalizedMissingTaskReason
      setProjectErrorContext(currentProject, {
        ...apifoxContextByCapability(await cloneRepo.getCredentials(), 'video_start_end_to_video'),
        action: 'reconcile_remote_storyboard_videos_missing_task_id',
        message: normalizedMissingTaskReason,
        responseSnippet: JSON.stringify({
          shotId: currentShot.id,
          shotStatus: currentShot.status,
          outputStatus: output.status,
          outputTaskId: String(output.taskId || '').trim() || undefined,
          blueprintTaskId: String(currentShot.generatedTaskId || '').trim() || undefined,
          remoteStatus: String(output.remoteStatus || '').trim() || undefined,
          sourceEvent: String(output.sourceEvent || '').trim() || undefined,
          keepRetryable: shouldKeepMissingTaskRetryable,
        }).slice(0, 500),
      })
      project = await cloneRepo.upsertProject(currentProject)
      results.push({
        shotId: currentShot.id,
        status: shouldKeepMissingTaskRetryable ? 'failed_retryable' : 'failed_terminal',
        error: normalizedMissingTaskReason,
        synced: false,
      })
      await refreshGenerationQueueRuntime(project.id)
      return
    }
    if (isDownloadReadyShotStatus(output.status) && String(output.videoUrl || '').trim()) {
      const downloaded = await runVideoTaskPoolJob({
        pool: 'download',
        project: currentProject,
        shotId: currentShot.id,
        taskId: recoverTaskId,
        worker: () => downloadCompletedSegmentTask({ project: currentProject, shot: currentShot }),
      })
      results.push({
        shotId: currentShot.id,
        status: downloaded.status,
        taskId: recoverTaskId,
        synced: downloaded.status === 'done',
        error: downloaded.status === 'failed_retryable' ? downloaded.reason : undefined,
      })
      await refreshGenerationQueueRuntime(project.id)
      return
    }
    const polled = normalizeContinuedShotVideoResult(await continueShotVideoResultFlow({
      project: currentProject,
      shot: currentShot,
      allowFailed: true,
    }))
    results.push({ shotId: currentShot.id, status: polled.status, taskId: recoverTaskId, synced: polled.synced })
    await refreshGenerationQueueRuntime(project.id)
  })
  const latest = await getReadonlyProjectWithRuntime((await cloneRepo.getProject(projectId)) || project)
  console.log('[clone-debug] shot-video-reconcile:done', {
    projectId,
    results,
    keepRunning: Boolean(latest?.blueprint && shouldKeepStoryboardVideoAutoRecoveryRunning(latest)),
  })
  if (latest?.blueprint && shouldKeepStoryboardVideoAutoRecoveryRunning(latest)) {
    storyboardVideoReconcilePending.add(projectId)
    scheduleRemoteStoryboardVideoReconcile(projectId, SHOT_VIDEO_RECONCILE_RETRY_DELAY_MS)
  }
  return { project: latest, results }
}

function flushScheduledRemoteStoryboardVideoReconcile() {
  storyboardVideoReconcileTimer = null
  const pendingProjectIds = Array.from(storyboardVideoReconcilePending)
  storyboardVideoReconcilePending.clear()
  for (const projectId of pendingProjectIds) {
    const safeProjectId = String(projectId || '').trim()
    if (!safeProjectId || storyboardVideoReconcileInFlight.has(safeProjectId)) continue
    storyboardVideoReconcileInFlight.add(safeProjectId)
    void reconcileRemoteStoryboardVideosInternal(safeProjectId)
      .catch(() => null)
      .finally(() => {
        storyboardVideoReconcileInFlight.delete(safeProjectId)
        if (storyboardVideoReconcilePending.has(safeProjectId)) {
          scheduleRemoteStoryboardVideoReconcile(safeProjectId, SHOT_VIDEO_RECONCILE_RETRY_DELAY_MS)
        }
      })
  }
}

function scheduleRemoteStoryboardVideoReconcile(projectId: string, delayMs = 0) {
  const safeProjectId = String(projectId || '').trim()
  if (!safeProjectId) return
  storyboardVideoReconcilePending.add(safeProjectId)
  console.log('[clone-debug] shot-video-reconcile:schedule', {
    projectId: safeProjectId,
    delayMs: Math.max(0, Number(delayMs || 0)),
    pendingProjectCount: storyboardVideoReconcilePending.size,
    inFlight: storyboardVideoReconcileInFlight.has(safeProjectId),
  })
  if (storyboardVideoReconcileTimer) return
  storyboardVideoReconcileTimer = setTimeout(() => {
    flushScheduledRemoteStoryboardVideoReconcile()
  }, Math.max(0, Number(delayMs || 0)))
}

function isMissingCloneProjectError(error: unknown) {
  const message = String((error as any)?.message ?? error ?? '').trim()
  return message.includes('复刻项目不存在')
}

const cloneProjectWorkspaceService = createCloneProjectWorkspaceService({
  syncProjectBoundProductSnapshotFromLibrary,
  syncProjectBlueprintLayers,
  recoverLocalStoryboardFrames,
  getReadonlyProjectWithRuntime,
  pipelineStatusFromProject,
  buildProjectSummary,
})

const cloneProductBindingService = createCloneProductBindingService({
  bindProjectProductFromLibrary,
  refreshProductCanonicalSourceFromLibrary,
  refreshProductAnalysisFromLibrary,
  onProjectBound: async (project) => {
    await dispatchBackgroundAutoRunIfReady(cloneService, project.id, 'after_bind_project_product')
  },
})

const cloneStoryboardGridWorkflow = createCloneStoryboardGridWorkflow({
  ensureCloneFlowState,
  patchWorkflowV2,
  syncProjectSelectedIdentity,
  assertStoryboardExtractionReady,
  selectedIdentityPack,
  projectBlueprintShots,
  replaceProjectShot,
  now,
  generateAllShotFrames: (input) => cloneService.generateAllShotFrames(input),
  imageProviderName,
  imageProviderModel,
})

async function recoverLocalStoryboardFrames(project: CloneProject) {
  if (!project.blueprint?.shots?.length) return project
  const projectRoot = join(getAppPaths().dataDir, 'viral-clone', project.id, 'shots')
  let changed = false
  const recoveredShots = await Promise.all(
    project.blueprint.shots.map(async (shot) => {
      const currentPath = String(shot.gptFirstFramePath || shot.generatedFirstFramePath || '').trim()
      if (currentPath) return shot
      const gptFrameDir = join(projectRoot, shot.id, 'gpt-frames')
      try {
        const files = await readdir(gptFrameDir, { withFileTypes: true })
        const candidates = await Promise.all(
          files
            .filter((entry) => entry.isFile())
            .map(async (entry) => {
              const name = entry.name.toLowerCase()
              if (!/\.(png|jpg|jpeg|webp)$/.test(name)) return null
              if (!name.includes('gpt_first_') || name.includes('_raw_')) return null
              const filePath = join(gptFrameDir, entry.name)
              const meta = await stat(filePath)
              return {
                filePath,
                mtimeMs: Number(meta.mtimeMs || 0),
              }
            }),
        )
        const latest = candidates
          .filter(Boolean)
          .sort((a, b) => Number(b?.mtimeMs || 0) - Number(a?.mtimeMs || 0))[0]
        if (!latest?.filePath) return shot
        changed = true
        return {
          ...shot,
          gptFirstFramePath: latest.filePath,
          generatedFirstFramePath: latest.filePath,
          gptFrameStatus: 'done' as const,
          gptFrameError: '',
          generatedSource: 'cloud' as const,
          status: 'ready' as const,
          error: '',
        }
      } catch {
        return shot
      }
    }),
  )
  if (!changed) return project
  project.blueprint = {
    ...project.blueprint,
    shots: recoveredShots,
  }
  project.storyboardFrames = recoveredShots
    .slice()
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    .map((shot, index) => ({
      id: randomUUID(),
      shotId: shot.id,
      imagePath: String(shot.gptFirstFramePath || shot.generatedFirstFramePath || '').trim() || undefined,
      aspectRatio: '9:16' as const,
      status: String(shot.gptFirstFramePath || shot.generatedFirstFramePath || '').trim() ? 'cropped' : 'failed',
      error: String(shot.gptFrameError || shot.error || '').trim() || undefined,
      frameIndex: index,
      updatedAt: now(),
    }))
  return await cloneRepo.upsertProject(project)
}

function humanizeModelPackError(error: unknown, credentials?: Partial<ModelCredentials>) {
  const message = String((error as any)?.message ?? error ?? '').trim()
  if (!message) return '模特生成失败，请稍后重试。'
  if (message.includes('连接超时')) {
    const provider = String(credentials?.imageProviderPrimary || '当前图片供应商').trim()
    return `${provider} 图片服务连接超时，请检查网络、代理或图片供应商配置后重试。`
  }
  if (message.includes('fetch failed')) {
    const provider = String(credentials?.imageProviderPrimary || '当前图片供应商').trim()
    return `${provider} 图片服务请求失败，请检查网络连通性与供应商服务状态。`
  }
  return message
}

async function ensureAi666SegmentVideoTask(input: {
  project: CloneProject
  shot: ShotSpec
  firstFramePath: string
  lastFramePath?: string
  mode: CloneQualityMode
  forceRegenerate?: boolean
}) {
  const key = shotVideoCreateKey(input.project.id, input.shot.id)
  const inFlight = shotVideoCreateInFlight.get(key)
  if (inFlight) {
    console.log('[clone-debug] ensure-apifox-video-task:reuse-inflight-submit', {
      projectId: input.project.id,
      shotId: input.shot.id,
    })
    return await inFlight
  }
  const task = (async () => {
    const creds = await cloneRepo.getCredentials()
    const capability = input.lastFramePath ? 'video_start_end_to_video' : 'video_image_to_video'
    const provider = 'apifox_hub'
    const model = videoProviderModel(creds)
    const endpointStyle = resolveApifoxHubCredentials(creds, 'video')?.videoEndpointStyle
    const latestProject = (await cloneRepo.getProject(input.project.id)) || input.project
    const submissionFingerprint = computeShotVideoSubmissionFingerprint({
      project: latestProject,
      shot: input.shot,
      firstFramePath: input.firstFramePath,
      lastFramePath: input.lastFramePath || input.firstFramePath,
      provider,
      model,
      requestCapability: capability,
    })
    ensureCloneFlowState(latestProject)
    let latestShot = projectBlueprintShots(latestProject).find((item) => item.id === input.shot.id) || input.shot
    clearInvalidVideoTaskMapping(latestProject, latestShot, 'before-apifox-video-create')
    let existing = resolveShotVideoOutput(latestProject, latestShot)
    if (input.forceRegenerate && (existing.videoPath || existing.localPath || existing.taskId || latestShot.generatedClipPath)) {
      syncSegmentVideoOutput(latestProject, latestShot, {
        previousTaskIds: Array.from(
          new Set(
            [...(existing.previousTaskIds ?? []), existing.taskId].filter(
              (value): value is string => Boolean(String(value || '').trim()),
            ),
          ),
        ),
        taskId: undefined,
        provider: undefined,
        model: undefined,
        videoPath: undefined,
        localPath: undefined,
        videoUrl: undefined,
        remoteStatus: undefined,
        remoteRaw: undefined,
        error: undefined,
        submissionFingerprint: undefined,
        submissionStartedAt: undefined,
        submissionLockedUntil: undefined,
        status: 'submitting',
        completedAt: undefined,
      })
      replaceProjectShot(latestProject, latestShot.id, {
        generatedClipPath: undefined,
        generatedTaskId: undefined,
        generatedProvider: undefined,
        generatedModel: undefined,
        generatedSource: undefined,
        error: '',
        status: 'generating',
        qualityStatus: 'unchecked',
        qualityReasons: [],
        canEnterRender: false,
      })
      await cloneRepo.upsertProject(latestProject)
      latestShot = projectBlueprintShots(latestProject).find((item) => item.id === input.shot.id) || {
        ...latestShot,
        generatedClipPath: undefined,
        generatedTaskId: undefined,
      }
      existing = resolveShotVideoOutput(latestProject, latestShot)
    }
    console.log('[clone-debug] ensure-apifox-video-task:existing-output', {
      projectId: latestProject.id,
      shotId: latestShot.id,
      taskId: existing.taskId,
      videoPath: existing.videoPath,
      localPath: existing.localPath,
      remoteStatus: existing.remoteStatus,
      shotGeneratedClipPath: latestShot.generatedClipPath,
      submissionFingerprint,
      submissionLockedUntil: existing.submissionLockedUntil,
      forceRegenerate: Boolean(input.forceRegenerate),
    })
    if (!input.forceRegenerate && (existing.videoPath || latestShot.generatedClipPath)) {
      console.log('[clone-debug] ensure-apifox-video-task:reuse-existing-video', {
        projectId: latestProject.id,
        shotId: latestShot.id,
        taskId: existing.taskId,
        videoPath: existing.videoPath || latestShot.generatedClipPath,
      })
      return await saveSegmentDone({
        project: latestProject,
        shot: latestShot,
        taskId: existing.taskId,
        provider: existing.provider || provider,
        model: existing.model || model,
        endpointStyle: existing.endpointStyle || endpointStyle,
        baseUrl: existing.baseUrl || resolveApifoxHubCredentials(creds, 'video')?.baseUrl,
        requestCapability: existing.requestCapability || capability,
        localPath: existing.videoPath || latestShot.generatedClipPath || '',
      })
    }
    if (existing.taskId) {
      console.log('[clone-debug] ensure-apifox-video-task:poll-existing-task', {
        projectId: latestProject.id,
        shotId: latestShot.id,
        taskId: existing.taskId,
        remoteStatus: existing.remoteStatus,
      })
      return await cloneRepo.upsertProject(latestProject)
    }
    const resetSubmissionLockOnly =
      Boolean(input.forceRegenerate) &&
      !String(existing.taskId || '').trim() &&
      !String(existing.videoPath || existing.localPath || latestShot.generatedClipPath || '').trim() &&
      (
        String(existing.sourceEvent || '').trim().toLowerCase() === 'force_regenerate_reset' ||
        String(existing.status || '').trim().toLowerCase() === 'submitting'
      )
    if (!resetSubmissionLockOnly && isShotVideoSubmissionLocked(existing, submissionFingerprint)) {
      console.log('[clone-debug] ensure-apifox-video-task:submission-locked', {
        projectId: latestProject.id,
        shotId: latestShot.id,
        submissionLockedUntil: existing.submissionLockedUntil,
        submissionFingerprint,
      })
      return await cloneRepo.upsertProject(latestProject)
    }
    const orderedRefs = resolveShotVideoOrderedReferencePaths(latestProject, latestShot, input.firstFramePath)
    const uploadedOrderedReferenceImages = (
      await Promise.all(
        orderedRefs.orderedReferenceImagePaths.map(async (path) => {
          return await publicUrlForCloudFrame(creds, path, 'apifox-storyboard-ref')
        }),
      )
    ).filter(Boolean)
    const uploadedLastFrameImage = input.lastFramePath
      ? input.lastFramePath === input.firstFramePath
        ? uploadedOrderedReferenceImages[0]
        : await publicUrlForCloudFrame(creds, input.lastFramePath, 'apifox-storyboard-last-frame')
      : undefined
    const submitStartedAt = now()
    syncSegmentVideoOutput(latestProject, latestShot, {
      status: 'submitting',
      provider,
      model,
      endpointStyle,
      baseUrl: resolveApifoxHubCredentials(creds, 'video')?.baseUrl,
      requestCapability: capability,
      error: undefined,
      submissionFingerprint,
      submissionStartedAt: submitStartedAt,
      submissionLockedUntil: submitStartedAt + SHOT_VIDEO_SUBMISSION_LOCK_MS,
      sourceEvent: 'segment_submit_started',
    })
    await cloneRepo.upsertProject(latestProject)
    console.log('[clone-debug] create-apifox-video-task:start', {
      projectId: latestProject.id,
      shotId: latestShot.id,
      capability,
      model,
      orderedReferenceImages: uploadedOrderedReferenceImages,
      productReferenceCount: orderedRefs.productReferenceImagePaths.length,
      modelReferenceCount: orderedRefs.modelReferenceImagePaths.length,
      storyboardReferenceCount: orderedRefs.storyboardReferenceImagePaths.length,
      hasLastFramePath: Boolean(input.lastFramePath),
      localLastFramePath: input.lastFramePath || undefined,
      uploadedLastImage: uploadedLastFrameImage || undefined,
      lastImageSent: Boolean(uploadedLastFrameImage),
      submissionFingerprint,
      submitStartedAt,
    })
    const finalApifoxPrompt = buildFinalShotVideoPositivePrompt({
      shot: latestShot,
      productIdentityText: String(latestShot.productIdentityText || latestShot.materialNeed || '').trim(),
      productMode: detectProductMode(String(latestShot.productType || '').trim()),
    })
    const finalApifoxNegativePrompt = buildVideoNegativePrompt(
      latestShot,
      String(latestShot.compiledNegativePrompt || '').trim(),
    )
    console.log('[clone-debug] final-shot-video-prompts', {
      projectId: latestProject.id,
      shotId: latestShot.id,
      provider: provider,
      capability,
      model,
      compiledPrompt: String(latestShot.compiledPrompt || '').trim(),
      finalPrompt: finalApifoxPrompt,
      compiledNegativePrompt: String(latestShot.compiledNegativePrompt || '').trim(),
      finalNegativePrompt: finalApifoxNegativePrompt,
    })
    const auditTrigger: CloneShotVideoSubmissionAuditLog['trigger'] =
      existing.sourceEvent === 'storyboard_video_batch_submit_started'
        ? 'batch_submit'
        : input.forceRegenerate
          ? 'force_regenerate_submit'
          : latestProject.autoFlowStatus?.status === 'running'
            ? 'auto_run_submit'
            : 'single_submit'
    appendShotVideoSubmissionAuditLog(latestProject, {
      shotId: latestShot.id,
      shotIndex: Number(latestShot.index ?? 0) || undefined,
      trigger: auditTrigger,
      provider,
      model,
      requestCapability: capability,
      submissionFingerprint,
      firstFramePath: String(input.firstFramePath || '').trim() || undefined,
      lastFramePath: String(input.lastFramePath || input.firstFramePath || '').trim() || undefined,
      sourceEvent: existing.sourceEvent || 'segment_submit_started',
      status: 'request_started',
    })
    await cloneRepo.upsertProject(latestProject)
    let created
    try {
      const requestedVideoSize = resolveShotRequestedVideoSize(latestProject, latestShot)
      const requestedAspectRatio = resolveProjectVideoAspectRatio(latestProject, latestShot)
      created = await createAi666VideoTask({
        credentials: creds,
        capability,
        prompt: finalApifoxPrompt,
        negativePrompt: finalApifoxNegativePrompt,
        image: uploadedOrderedReferenceImages[0],
        lastImage: uploadedLastFrameImage,
        referenceImages: [],
        aspectRatio: requestedAspectRatio,
        xibapiSize: requestedVideoSize,
      })
    } catch (error: any) {
      appendShotVideoSubmissionAuditLog(latestProject, {
        shotId: latestShot.id,
        shotIndex: Number(latestShot.index ?? 0) || undefined,
        trigger: auditTrigger,
        provider,
        model,
        requestCapability: capability,
        submissionFingerprint,
        firstFramePath: String(input.firstFramePath || '').trim() || undefined,
        lastFramePath: String(input.lastFramePath || input.firstFramePath || '').trim() || undefined,
        sourceEvent: 'segment_submit_request_failed',
        status: 'request_failed',
        error: String(error?.message ?? error ?? '').trim() || undefined,
      })
      await cloneRepo.upsertProject(latestProject)
      throw error
    }
    if (created.directOutputUrl) {
      appendShotVideoSubmissionAuditLog(latestProject, {
        shotId: latestShot.id,
        shotIndex: Number(latestShot.index ?? 0) || undefined,
        trigger: auditTrigger,
        provider: created.provider,
        model: created.model,
        requestCapability: created.requestCapability,
        submissionFingerprint,
        firstFramePath: String(input.firstFramePath || '').trim() || undefined,
        lastFramePath: String(input.lastFramePath || input.firstFramePath || '').trim() || undefined,
        remoteStatus: 'succeeded',
        sourceEvent: 'segment_submit_direct_output_received',
        status: 'direct_output',
      })
      const outDir = join(getAppPaths().dataDir, 'viral-clone', latestProject.id, 'shots', latestShot.id)
      await mkdir(outDir, { recursive: true })
      const outPath = join(outDir, 'generated_clip.mp4')
      await downloadAtlasToFile(created.directOutputUrl, outPath, `${videoProviderLabel(creds)} 直出结果下载`)
      syncSegmentVideoOutput(latestProject, latestShot, {
        submissionFingerprint: undefined,
        submissionStartedAt: undefined,
        submissionLockedUntil: undefined,
        sourceEvent: 'segment_submit_direct_output_received',
      })
      return await saveSegmentDone({
        project: latestProject,
        shot: latestShot,
        provider: created.provider,
        model: created.model,
        endpointStyle: created.endpointStyle,
        baseUrl: created.baseUrl,
        requestCapability: created.requestCapability,
        videoUrl: created.directOutputUrl,
        localPath: outPath,
        remoteStatus: 'succeeded',
        remoteRaw: created.raw,
      })
    }
    if (!created.taskId) {
      const reason = `[missing_task] ${videoProviderLabel(creds)} 返回结果缺少 taskId，无法继续查询云端视频任务`
      const createdRemoteStatus =
        String(created.raw?.data?.status || created.raw?.status || created.raw?.data?.state || created.raw?.state || 'created').trim() ||
        'created'
      appendShotVideoSubmissionAuditLog(latestProject, {
        shotId: latestShot.id,
        shotIndex: Number(latestShot.index ?? 0) || undefined,
        trigger: auditTrigger,
        provider,
        model,
        requestCapability: capability,
        submissionFingerprint,
        firstFramePath: String(input.firstFramePath || '').trim() || undefined,
        lastFramePath: String(input.lastFramePath || input.firstFramePath || '').trim() || undefined,
        remoteStatus: createdRemoteStatus,
        sourceEvent: 'segment_submit_missing_task',
        status: 'missing_task',
      })
      console.error('[clone-debug] ensure-apifox-video-task:missing-task-id', {
        projectId: latestProject.id,
        shotId: latestShot.id,
        capability,
        provider,
        model,
        remoteStatus: createdRemoteStatus,
        raw: created.raw,
      })
      replaceProjectShot(latestProject, latestShot.id, {
        status: 'generating',
        error: '',
        generatedTaskId: undefined,
      })
      syncSegmentVideoOutput(latestProject, latestShot, {
        status: 'submitting',
        error: reason,
        remoteStatus: createdRemoteStatus,
        remoteRaw: created.raw,
        submissionLockedUntil: Math.max(
          submitStartedAt + SHOT_VIDEO_SUBMISSION_LOCK_MS,
          submitStartedAt + SHOT_VIDEO_MISSING_TASK_GRACE_MS,
        ),
        sourceEvent: 'segment_submit_missing_task',
      })
      latestProject.lastError = ''
      await cloneRepo.upsertProject(latestProject)
      return latestProject
    }
    console.log('[clone-debug] create-apifox-video-task:done', {
      projectId: latestProject.id,
      shotId: latestShot.id,
      taskId: created.taskId,
      provider: created.provider,
      model: created.model,
      submissionFingerprint,
    })
    appendShotVideoSubmissionAuditLog(latestProject, {
      shotId: latestShot.id,
      shotIndex: Number(latestShot.index ?? 0) || undefined,
      trigger: auditTrigger,
      provider: created.provider,
      model: created.model,
      requestCapability: created.requestCapability,
      submissionFingerprint,
      firstFramePath: String(input.firstFramePath || '').trim() || undefined,
      lastFramePath: String(input.lastFramePath || input.firstFramePath || '').trim() || undefined,
      taskId: created.taskId,
      remoteStatus: 'created',
      sourceEvent: 'segment_submit_succeeded',
      status: 'task_accepted',
    })
    replaceProjectShot(latestProject, latestShot.id, {
      status: 'generating',
      error: '',
      generatedClipPath: undefined,
      generatedProvider: created.provider,
      generatedModel: created.model,
      generatedTaskId: created.taskId,
    })
    const refreshedShotAfterSubmit =
      projectBlueprintShots(latestProject).find((item) => item.id === latestShot.id) || latestShot
    syncSegmentVideoOutput(latestProject, refreshedShotAfterSubmit, {
      status: 'remote_running',
      provider: created.provider,
      model: created.model,
      endpointStyle: created.endpointStyle,
      baseUrl: created.baseUrl,
      requestCapability: created.requestCapability,
      taskId: created.taskId,
      videoPath: undefined,
      localPath: undefined,
      remoteStatus: 'created',
      remoteRaw: created.raw,
      error: undefined,
      submissionFingerprint,
      submissionStartedAt: submitStartedAt,
      submissionLockedUntil: submitStartedAt + SHOT_VIDEO_SUBMISSION_LOCK_MS,
      sourceEvent: 'segment_submit_succeeded',
    })
    return await cloneRepo.upsertProject(latestProject)
  })().finally(() => {
    shotVideoCreateInFlight.delete(key)
  })
  shotVideoCreateInFlight.set(key, task)
  return await task
}

export function __test_resolveStoryboardSceneFitRefs(input: {
  projectIdentityGridPath?: string
  productRefs?: string[]
  modelPackRefs?: string[]
  thumbnailPath?: string
  continuityAnchorPath?: string
  mode?: 'start' | 'end'
}) {
  return compactStoryboardImageRefs({
    identityGridPath: input.projectIdentityGridPath,
    productRefs: input.productRefs ?? [],
    modelPackRefs: input.modelPackRefs ?? [],
    thumbnailPath: input.thumbnailPath,
    continuityAnchorPath: input.continuityAnchorPath,
    mode: input.mode ?? 'start',
  })
}

export function __test_storyboardPrimaryProductRefs(project: CloneProject) {
  return storyboardPrimaryProductRefs(project)
}

export function __test_bindProjectProductSnapshot(input: {
  project: CloneProject
  product: Product
}) {
  const project = structuredClone(input.project) as CloneProject
  const cachedProduct = input.product
  const originalRefs = collectCloneProductImageRefs(cachedProduct)
  const analysisBoardPath = String((cachedProduct as any).analysisBoardPath || '').trim()
  const canonicalSourcePath = String((cachedProduct as any).canonicalSourcePath || '').trim()
  const preferredRefs = analysisBoardPath
    ? [analysisBoardPath]
    : Array.from(new Set([canonicalSourcePath].filter(Boolean)))
  const effectiveRefs = preferredRefs.length ? preferredRefs : originalRefs

  project.productId = cachedProduct.id
  project.originalProductReferenceImagePaths = originalRefs
  project.sanitizedProductReferenceImagePaths = effectiveRefs
  project.productReferenceImagePaths = effectiveRefs
  project.boundProductSnapshot = {
    id: cachedProduct.id,
    name: String(cachedProduct.name || '').trim(),
    type: String(cachedProduct.type || '').trim(),
    remark: String(cachedProduct.remark || '').trim() || undefined,
    coverImagePath: String(cachedProduct.coverImagePath || originalRefs[0] || '').trim() || undefined,
    analysisBoardPath: analysisBoardPath || undefined,
    analysisBoardStatus: analysisBoardPath ? 'done' : 'idle',
    canonicalSourcePath: analysisBoardPath ? analysisBoardPath : canonicalSourcePath || String(originalRefs[0] || '').trim() || undefined,
    canonicalSourceStatus: analysisBoardPath || canonicalSourcePath ? 'done' : 'idle',
    productAnalysis: normalizeStoredProductAnalysis((cachedProduct as any).productAnalysis, normalizeProductType(String(cachedProduct.type || 'general'))),
    originalImagePaths: originalRefs,
    frozenReferenceImagePaths: effectiveRefs,
    boundAt: now(),
    updatedAt: now(),
  }
  return project
}

export function __test_syncBoundProductSnapshotFromLibrary(project: CloneProject, product: Product) {
  const working = structuredClone(project) as CloneProject
  const originalRefs = collectCloneProductImageRefs(product)
  const normalizedProductAnalysis = normalizeStoredProductAnalysis((product as any).productAnalysis, normalizeProductType(String(product.type || 'general')))
  const analysisBoardPath = String((product as any).analysisBoardPath || '').trim()
  const canonicalSourcePath = String((product as any).canonicalSourcePath || '').trim()
  const frozenReferenceImagePaths = analysisBoardPath
    ? [analysisBoardPath]
    : Array.from(new Set([canonicalSourcePath].filter(Boolean)))
  const boundAt =
    working.boundProductSnapshot?.boundAt ||
    working.baseBlueprint?.consistencyAssets?.boundProductSnapshot?.boundAt ||
    working.blueprint?.consistencyAssets?.boundProductSnapshot?.boundAt ||
    now()
  const nextSnapshot: NonNullable<CloneProject['boundProductSnapshot']> = {
    id: product.id,
    name: String(product.name || '').trim(),
    type: String(product.type || '').trim(),
    storyboardTemplateType:
      (product as any).storyboardTemplateType === 'general' ||
      (product as any).storyboardTemplateType === 'jewelry' ||
      (product as any).storyboardTemplateType === 'ecommerce_packaging' ||
      (product as any).storyboardTemplateType === 'lifestyle_interaction'
        ? (product as any).storyboardTemplateType
        : undefined,
    remark: String(product.remark || '').trim() || undefined,
    coverImagePath: String(product.coverImagePath || originalRefs[0] || '').trim() || undefined,
    analysisBoardPath: analysisBoardPath || undefined,
    analysisBoardStatus: analysisBoardPath ? 'done' : 'idle',
    canonicalSourcePath: analysisBoardPath ? analysisBoardPath : canonicalSourcePath || String(originalRefs[0] || '').trim() || undefined,
    canonicalSourceStatus: analysisBoardPath || canonicalSourcePath ? 'done' : 'idle',
    productAnalysis: normalizedProductAnalysis,
    originalImagePaths: originalRefs,
    frozenReferenceImagePaths: frozenReferenceImagePaths.length ? frozenReferenceImagePaths : originalRefs,
    boundAt,
    updatedAt: now(),
  }
  working.boundProductSnapshot = nextSnapshot
  return working
}

export function __test_advanceAutoRunWorkflow(project: CloneProject, phase: 'script_generation' | 'storyboard_design') {
  return advanceAutoRunWorkflow(project, phase)
}

export const cloneService = {
  async createDraftProject(input?: { locale?: CloneLocale; strength?: 'structure'; title?: string; description?: string; runMode?: CloneRunMode }) {
    const locale: CloneLocale = input?.locale === 'zh-CN' ? 'zh-CN' : 'vi-VN'
    const project = await cloneRepo.createProject({
      locale,
      strength: input?.strength ?? 'structure',
      runMode: normalizeRunMode(input?.runMode),
      referenceVideoPath: '',
      referenceVideoName: '',
      title: input?.title,
      description: input?.description,
    })
    project.outputDir = join(getAppPaths().dataDir, 'viral-clone', project.id, 'outputs')
    project.workflowV2 = defaultWorkflowV2()
    const saved = await cloneRepo.upsertProject(project)
    return {
      project: saved,
      summary: buildProjectSummary(saved),
    }
  },

  async createCloneBlueprintFromReference(input: {
      videoPath: string
      locale?: CloneLocale
      strength?: 'structure'
      cloneProjectId?: string
  }) {
    const locale: CloneLocale = input.locale === 'zh-CN' ? 'zh-CN' : 'vi-VN'
    const existing = input.cloneProjectId ? await cloneRepo.getProject(input.cloneProjectId) : null
    const project =
      existing ??
      (await cloneRepo.createProject({
        locale,
        strength: 'structure',
        referenceVideoPath: input.videoPath,
        referenceVideoName: basename(String(input.videoPath || 'reference.mp4')),
      }))
    project.locale = locale
    project.strength = 'structure'
    project.referenceVideoPath = input.videoPath
    project.referenceVideoName = basename(String(input.videoPath || 'reference.mp4'))
    project.outputDir = join(getAppPaths().dataDir, 'viral-clone', project.id, 'outputs')
    const creds = await cloneRepo.getCredentials()
    let analyzed
    try {
      analyzed = await analyzeReferenceVideo({
        videoPath: input.videoPath,
        locale,
        outputDir: join(getAppPaths().dataDir, 'viral-clone', project.id),
        credentials: creds,
      })
      setProjectErrorContext(project, null)
    } catch (error: any) {
      setProjectErrorContext(
        project,
        creds.chatProviderPrimary === 'apifox_hub'
          ? {
              ...apifoxContextByCapability(creds, 'chat_completion'),
              action: 'create_blueprint',
              message: String(error?.message ?? error),
              responseSnippet: String(error?.message ?? error),
            }
          : {
              provider: 'grsai',
              model: trimText(creds.grsaiAnalysisModel) || 'grsai-analysis',
              action: 'create_blueprint',
              message: String(error?.message ?? error),
              responseSnippet: String(error?.message ?? error),
            },
      )
      project.lastError = String(error?.message ?? error)
      await cloneRepo.upsertProject(project)
      throw error
    }
    project.referenceVideoName = analyzed.referenceVideoName
    if (!String(project.title || '').trim() || String(project.title || '').startsWith('未命名复刻任务 ')) {
      project.title = analyzed.referenceVideoName.replace(/\.[^.]+$/, '') || project.title
    }
    project.baseBlueprint = analyzed.blueprint
    project.executionBlueprint = executionBlueprintOf({
      ...project,
      baseBlueprint: analyzed.blueprint,
    } as CloneProject)
    project.blueprint = {
      ...(project.blueprint ?? {}),
      ...analyzed.blueprint,
    }
      const initialProductRefs = collectProjectProductReferenceImages(project)
      if (initialProductRefs.length) {
        const analyzedProductType = normalizeProductType(
          project.baseBlueprint?.productCategory ||
          project.blueprint?.productCategory ||
          project.baseBlueprint?.shots?.[0]?.productType ||
          'general',
        )
        await ensureProjectProductAnalysis(project, initialProductRefs, analyzedProductType, locale)
      }
      project.status = 'analyzed'
      project.workflowV2 = defaultWorkflowV2()
      patchWorkflowV2(project, 'reference_analysis', 'reference_analysis', 'done')
      syncProjectBlueprintLayers(project)
      const saved = await cloneRepo.upsertProject(project)
      if (canStartBackgroundAutoRun(saved)) {
        await dispatchBackgroundAutoRunIfReady(this, saved.id, 'after_analyze')
      }
      const provider = summarizeProjectProviders(saved)
      return {
        project: saved,
        workflowStep: 'reference_analysis' as const,
        previewPipeline: saved.previewPipeline,
        activeProviderSummary: provider.activeProviderSummary,
        activeModelSummary: provider.activeModelSummary,
        errorContext: undefined,
        blueprintSummary: {
          id: saved.blueprint?.id || saved.id,
          title: saved.blueprint?.title || saved.referenceVideoName.replace(/\.[^.]+$/, ''),
          duration: Number(saved.blueprint?.duration || saved.baseBlueprint?.totalDurationSec || 0),
          market: saved.blueprint?.market || 'GLOBAL',
          category: saved.blueprint?.category || saved.baseBlueprint?.productCategory || 'general',
          hook: saved.blueprint?.hook,
          storyBeats: saved.blueprint?.storyBeats || [],
          localization: saved.blueprint?.localization,
          renderHints: saved.blueprint?.renderHints,
          createdAt: saved.blueprint?.createdAt || new Date(saved.createdAt).toISOString(),
          updatedAt: saved.blueprint?.updatedAt || new Date(saved.updatedAt).toISOString(),
        },
      }
    },

    async expandCommercialPrompt(input: {
      cloneProjectId: string
      prompt?: string
      sceneHint?: string
      styleHint?: string
    }) {
      const project = await cloneRepo.getProject(input.cloneProjectId)
      if (!project) throw new Error('复刻项目不存在')
      const blueprint = project.blueprint || project.baseBlueprint
      const shots = blueprint?.shots ?? []
      const promptSeed =
        String(input.prompt || '').trim() ||
        blueprint?.globalScript?.summary ||
        blueprint?.videoSummary ||
        project.referenceVideoName.replace(/\.[^.]+$/, '')
      const hook = blueprint?.hook?.textPattern || blueprint?.globalScript?.hook || promptSeed
      const beats = (blueprint?.storyBeats || []).map((beat) => ({
        purpose: beat.purpose,
        shotType: beat.shotType,
        productRole: beat.productRole,
      }))
      const result = expandCommercialVideoPrompt({
        title: blueprint?.title || project.referenceVideoName.replace(/\.[^.]+$/, ''),
        hook,
        storyBeats: beats.length
          ? beats
          : shots.slice(0, 6).map((shot) => ({
              purpose:
                shot.scriptRole === 'hook'
                  ? 'hook'
                  : shot.scriptRole === 'proof'
                    ? 'proof'
                    : shot.scriptRole === 'cta'
                      ? 'cta'
                      : 'demo',
              shotType: shot.shotType || shot.cloneClass || shot.visualType || 'other',
              productRole: shot.shotRole || shot.role || shot.scriptRole || 'demo',
            })),
        productType: project.baseBlueprint?.productCategory || 'general',
        productPoints: String(input.prompt || '').trim() || promptSeed,
        sceneHint:
          input.sceneHint ||
          blueprint?.hook?.visualPattern ||
          blueprint?.localization?.culturalNotes?.[0] ||
          'premium social commerce scene',
        styleHint: input.styleHint || blueprint?.renderHints?.bgmMood || 'high-end realistic short video',
        durationSec: Number(blueprint?.duration || project.baseBlueprint?.totalDurationSec || 15),
        qualityMode: project.defaultGenerationPolicy?.qualityProfile || 'high',
      })
      return {
        projectId: project.id,
        prompt: result.positive,
        negativePrompt: result.negative,
        provider: summarizeProjectProviders(project).activeProviderSummary,
      }
    },

  async analyzeReference(input: {
    videoPath: string
    locale?: CloneLocale
    strength?: 'structure'
  }) {
    return await this.createCloneBlueprintFromReference(input)
  },

  async generateScriptVariantsForProject(input: {
    cloneProjectId: string
    variantCount: number
  }) {
    let project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project || !project.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    ensureCloneFlowState(project)
    patchWorkflowV2(project, 'script_generation', 'script_generation', 'running')
    const count = Math.max(1, Math.min(6, Math.floor(Number(input.variantCount || 3))))
    if (!project.selectedModelIdentitySnapshot?.id) throw new Error('请先选择模特。')
    const boundProductRefs = collectProjectProductReferenceImages(project)
    if (!boundProductRefs.length) throw new Error('请先上传商品图。')
    const resolvedProductType = normalizeProductType(
      project.baseBlueprint?.productCategory ||
      project.blueprint?.productCategory ||
      project.baseBlueprint?.shots?.[0]?.productType ||
      'general',
    )
    project = await ensureProjectProductAnalysis(project, boundProductRefs, resolvedProductType, project.locale)
    await cloneRepo.upsertProject(project)
    const baseBlueprint = project.baseBlueprint
    if (!baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    const productAnalysisText = buildPromptProductDescriptionText(project, normalizeProductType(baseBlueprint.productCategory || 'general'))
    let latest: CloneProject | null = null
    try {
      setProjectErrorContext(project, null)
      const rows = await generateWholeScriptVariantsWithAi({
        credentials: await cloneRepo.getCredentials(),
        locale: project.locale,
        shots: baseBlueprint.shots,
        variantCount: count,
        modelIdentity: {
          name: project.selectedModelIdentitySnapshot?.name,
          imagePaths: project.selectedModelIdentitySnapshot?.imagePaths,
          description: project.selectedModelIdentitySnapshot?.model,
        },
        productReferenceImagePaths: boundProductRefs,
        productAnalysisText,
      })
      const baseShots = [...baseBlueprint.shots].sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
      const referenceCandidate = buildReferenceScriptCandidate(baseShots)
      const generatedCandidates: CloneScriptVariantCandidate[] = rows.slice(0, count).map((item: any, index: number) => {
        const shotScripts = baseShots.map((shot, shotIndex) => {
          const hit =
            (item.shotScripts ?? []).find((row: any) => String(row?.shotId || '').trim() === shot.id) ||
            (item.shotScripts ?? []).find((row: any) => Number(row?.shotIndex ?? -1) === shotIndex) ||
            {}
          return alignVariantShotToBase({ baseShot: shot, shotIndex, raw: hit })
        })
        return {
          id: item.id,
          title: item.title || buildVariantCandidateTitle(index, Number(item.score || 8)),
          summary: String(item.summary || '').trim() || shotScripts.map((row) => row.scriptText).filter(Boolean).slice(0, 3).join(' / ').slice(0, 220),
          fullScript: composeWholeScriptFromShots(
            shotScripts.map((row) => ({
              ...(baseShots.find((shot) => shot.id === row.shotId) as ShotSpec),
              scriptText: row.scriptText,
              scriptRole: row.scriptRole,
              visualDescription: row.visualDescription,
              actionDescription: row.actionDescription,
              cameraDescription: row.cameraDescription,
              generationPrompt: row.generationPrompt,
            })),
          ),
          shotScripts,
          score: Number(item.score || 8) || 8,
          reason: String(item.reason || '').trim() || '整片风格差异化候选',
          selected: false,
          createdAt: now() + index,
        }
      }).map((candidate: CloneScriptVariantCandidate, index: number) => applyScriptVariantSafetyToCandidate(applyVariantTheme(candidate, index, project.locale)))
      let candidates: CloneScriptVariantCandidate[] = [
        referenceCandidate,
        ...generatedCandidates.map((item) => ({ ...item, selected: false })),
      ]
      if (!hasEnoughVariantDiversity(candidates)) {
        candidates = enforceVariantCandidateDiversity(candidates, project.locale)
      }
      if (!hasEnoughVariantDiversity(candidates)) {
        throw new Error('整片脚本变体缺少有效差异，回退到逐镜候选组合。')
      }
      project.scriptVariantCandidates = candidates
      const defaultCandidate = pickDefaultScriptVariantCandidate({
        referenceCandidate,
        generatedCandidates,
      })
      project.selectedScriptVariantId = defaultCandidate.id
      project.scriptVariantCandidates = candidates.map((item) => ({
        ...item,
        selected: item.id === defaultCandidate.id,
      }))
      project.lastError = ''
      patchWorkflowV2(project, 'script_generation', 'script_generation', 'done')
      patchWorkflowV2(project, 'identity_grid', 'identity_grid', 'running')
      for (const shotScript of defaultCandidate.shotScripts) {
        replaceProjectShot(project, shotScript.shotId, {
          scriptText: shotScript.scriptText,
          scriptRole: shotScript.scriptRole,
          visualDescription: shotScript.visualDescription,
          actionDescription: shotScript.actionDescription,
          cameraDescription: shotScript.cameraDescription,
          generationPrompt: shotScript.generationPrompt,
          promptHint: shotScript.timeRange,
        })
      }
      latest = await cloneRepo.upsertProject(project)
    } catch (error: any) {
      const creds = await cloneRepo.getCredentials()
      setProjectErrorContext(
        project,
        creds.chatProviderPrimary === 'apifox_hub'
          ? {
              ...apifoxContextByCapability(creds, 'chat_completion'),
              action: 'generate_script_variants',
              message: String(error?.message ?? error),
              responseSnippet: String(error?.message ?? error),
            }
          : {
              provider: 'grsai',
              model: trimText(creds.grsaiAnalysisModel) || 'grsai-analysis',
              action: 'generate_script_variants',
              message: String(error?.message ?? error),
              responseSnippet: String(error?.message ?? error),
            },
      )
      const generated = await this.generateShotVariants({
        cloneProjectId: project.id,
        variantsPerShot: count,
        strategy: 'balanced',
      })
      const scored = await this.scoreShotVariants({
        cloneProjectId: project.id,
      })
      latest = (await cloneRepo.getProject(project.id)) || scored || generated
      if (latest) {
        latest.lastErrorContext = project.lastErrorContext
        latest.lastError = [String(error?.message || '').trim(), String(latest.lastError || '').trim()].filter(Boolean).join('；')
      }
    }
    if (!latest?.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    if ((latest.scriptVariantCandidates ?? []).length) {
      const saved = await cloneRepo.upsertProject(latest)
      return {
        project: saved,
        scriptVariantCandidates: saved.scriptVariantCandidates ?? [],
        selectedScriptVariantId: saved.selectedScriptVariantId,
      }
    }
    const shots = latest.baseBlueprint.shots
    const byShot = latest.baseBlueprint.variants ?? {}
    const scoreByShot = latest.baseBlueprint.variantScores ?? {}
    const referenceCandidate = buildReferenceScriptCandidate(shots)
    let candidates: CloneScriptVariantCandidate[] = [referenceCandidate]
    for (let i = 0; i < count; i += 1) {
      const candidateShotScripts = shots
        .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
        .map((shot) => {
          const variants = byShot[shot.id] ?? []
          const scores = new Map((scoreByShot[shot.id] ?? []).map((row) => [row.variantId, row]))
          const chosen =
            variants
              .slice()
              .sort((a, b) => (scores.get(b.id)?.totalScore || 0) - (scores.get(a.id)?.totalScore || 0))[i] ??
            variants[0]
          return alignVariantShotToBase({
            baseShot: shot,
            shotIndex: Number(shot.index || 0),
            raw: chosen || {},
          })
        })
      const score = candidateShotScripts.length
        ? Number(
            (
              candidateShotScripts.reduce((sum, row) => {
                const variants = byShot[row.shotId] ?? []
                const hit = variants.find((variant) => variant.scriptText === row.scriptText)
                const scores = scoreByShot[row.shotId] ?? []
                const scoreHit = scores.find((score) => score.variantId === hit?.id)
                return sum + Number(scoreHit?.totalScore || 7.5)
              }, 0) / candidateShotScripts.length
            ).toFixed(2),
          )
        : 0
      candidates.push(applyVariantTheme({
        id: randomUUID(),
        title: buildVariantCandidateTitle(i, score),
        summary: candidateShotScripts.map((row) => row.scriptText).filter(Boolean).slice(0, 3).join(' / ').slice(0, 220),
        fullScript: composeWholeScriptFromShots(
          candidateShotScripts.map((row) => ({
            ...(shots.find((shot) => shot.id === row.shotId) as ShotSpec),
            scriptText: row.scriptText,
            scriptRole: row.scriptRole,
            visualDescription: row.visualDescription,
            actionDescription: row.actionDescription,
            cameraDescription: row.cameraDescription,
            generationPrompt: row.generationPrompt,
          })),
        ),
        shotScripts: candidateShotScripts,
        score,
        reason: i === 0 ? '评分更高的备选脚本' : i === 1 ? '节奏和转化更平衡' : '风格差异更大，适合试稿',
        selected: false,
        createdAt: now(),
      }, i, latest.locale))
    }
    if (!hasEnoughVariantDiversity(candidates)) {
      candidates = enforceVariantCandidateDiversity(candidates, latest.locale)
    }
    latest.scriptVariantCandidates = candidates
    const generatedOnlyCandidates = candidates.filter((item) => item.id !== referenceCandidate.id)
    const defaultCandidate = pickDefaultScriptVariantCandidate({
      referenceCandidate,
      generatedCandidates: generatedOnlyCandidates,
    })
    latest.selectedScriptVariantId = defaultCandidate.id
    latest.scriptVariantCandidates = candidates.map((item) => ({
      ...item,
      selected: item.id === defaultCandidate.id,
    }))
    patchWorkflowV2(latest, 'script_generation', 'script_generation', 'done')
    patchWorkflowV2(latest, 'identity_grid', 'identity_grid', 'running')
    for (const shotScript of defaultCandidate.shotScripts) {
      replaceProjectShot(latest, shotScript.shotId, {
        scriptText: shotScript.scriptText,
        scriptRole: shotScript.scriptRole,
        visualDescription: shotScript.visualDescription,
        actionDescription: shotScript.actionDescription,
        cameraDescription: shotScript.cameraDescription,
        generationPrompt: shotScript.generationPrompt,
        promptHint: shotScript.timeRange,
      })
    }
    const saved = await cloneRepo.upsertProject(latest)
    return {
      project: saved,
      scriptVariantCandidates: saved.scriptVariantCandidates ?? [],
      selectedScriptVariantId: saved.selectedScriptVariantId,
    }
  },

  async selectScriptVariantForProject(input: {
    cloneProjectId: string
    variantId: string
  }) {
    const project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project) throw new Error('复刻项目不存在')
    ensureCloneFlowState(project)
    const candidate = (project.scriptVariantCandidates ?? []).find((item) => item.id === input.variantId)
    if (!candidate) throw new Error('脚本变体不存在')
    project.scriptVariantCandidates = (project.scriptVariantCandidates ?? []).map((item) => ({
      ...item,
      selected: item.id === input.variantId,
    }))
    project.selectedScriptVariantId = input.variantId
    for (const shotScript of candidate.shotScripts) {
      replaceProjectShot(project, shotScript.shotId, {
        scriptText: shotScript.scriptText,
        scriptRole: shotScript.scriptRole,
        visualDescription: shotScript.visualDescription,
        actionDescription: shotScript.actionDescription,
        cameraDescription: shotScript.cameraDescription,
        generationPrompt: shotScript.generationPrompt,
        promptHint: shotScript.timeRange,
      })
    }
    patchWorkflowV2(project, 'script_generation', 'script_generation', 'done')
    patchWorkflowV2(project, 'identity_grid', 'identity_grid', 'running')
    const saved = await cloneRepo.upsertProject(project)
    return {
      project: saved,
      selectedScriptVariantId: saved.selectedScriptVariantId,
    }
  },

  async autoRunCloneToStoryboardVideos(input: {
    cloneProjectId: string
    variantCount?: number
    selectedModelIdentityId?: string
    productReferenceImagePaths?: string[]
    autoBindModelPack?: boolean
  }) {
    const autoRunLockKey = autoRunStoryboardVideosKey(input.cloneProjectId)
    const existingAutoRun = autoRunStoryboardVideosInFlight.get(autoRunLockKey)
    if (existingAutoRun) {
      console.log('[clone-debug] auto-run-storyboard-videos:reuse-inflight', {
        cloneProjectId: input.cloneProjectId,
      })
      return await existingAutoRun
    }
    const autoRunTask = (async () => {
    let project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project) throw new Error('复刻项目不存在')
    ensureCloneFlowState(project)
    ensureAutoFlowStatus(project)
    setAutoFlowStage(project, 'reference_analysis', 'running', '自动复制流程启动')
    await cloneRepo.upsertProject(project)

    if (input.selectedModelIdentityId && project.selectedModelIdentityId !== input.selectedModelIdentityId) {
      project = await this.selectProjectModelIdentity({
        cloneProjectId: project.id,
        identityId: input.selectedModelIdentityId,
      })
    }
    if (!String(project.referenceVideoPath || '').trim()) throw new Error('请先绑定参考视频')
    if (!project.baseBlueprint?.shots?.length) {
      const analyzed = await this.createCloneBlueprintFromReference({
        cloneProjectId: project.id,
        videoPath: project.referenceVideoPath,
        locale: project.locale,
        strength: 'structure',
      })
      project = analyzed.project
    }
    const requestedProductRefs = Array.isArray(input.productReferenceImagePaths)
      ? Array.from(new Set(input.productReferenceImagePaths.map((item) => String(item || '').trim()).filter(Boolean)))
      : []
    const existingOriginalRefs = Array.from(
      new Set((project.originalProductReferenceImagePaths ?? []).map((item) => String(item || '').trim()).filter(Boolean)),
    )
    const shouldRefreshProductRefs =
      requestedProductRefs.length > 0 &&
      (!hasReusableBoundProductSnapshot(project) ||
        requestedProductRefs.length !== existingOriginalRefs.length ||
        requestedProductRefs.some((item, index) => item !== existingOriginalRefs[index]))
    if (shouldRefreshProductRefs) {
      project = await this.saveProjectProductImages({
        cloneProjectId: project.id,
        productReferenceImagePaths: requestedProductRefs,
      })
    }

    setAutoFlowStage(project, 'identity_grid', 'running', '自动准备身份定妆图')
    await cloneRepo.upsertProject(project)
    project = (
      await this.prepareCloneMaterials({
        cloneProjectId: project.id,
        productReferenceImagePaths: input.productReferenceImagePaths,
        generateModelPack: true,
        forceRegenerateModelPack: false,
      })
    ).project

    const boundProductRefs = collectProjectProductReferenceImages(project)
    if (!boundProductRefs.length) throw new Error('请先绑定商品图')
    if (!project.selectedModelIdentitySnapshot?.id) throw new Error('请先选择模特')

    advanceAutoRunWorkflow(project, 'script_generation')
    setAutoFlowStage(project, 'script_generation', 'running', `自动生成脚本变体并按 ${SCRIPT_VARIANT_AUTO_SELECT_THRESHOLD} 分阈值选择脚本`)
    await cloneRepo.upsertProject(project)
    if (!project.scriptVariantCandidates?.length) {
      const variantResult = await this.generateScriptVariantsForProject({
        cloneProjectId: project.id,
        variantCount: Math.max(1, Math.min(6, Number(input.variantCount ?? 3) || 3)),
      })
      project = variantResult.project
    }
    if (!project) throw new Error('复刻项目不存在')
    const currentProject = project
    const defaultCandidate =
      (currentProject.scriptVariantCandidates ?? []).find((item) => String(item.id || '').trim() === String(currentProject.selectedScriptVariantId || '').trim()) ||
      (currentProject.scriptVariantCandidates ?? []).find((item) => item.selected) ||
      currentProject.scriptVariantCandidates?.[0]
    if (!defaultCandidate?.id) throw new Error('脚本候选生成失败，未产出可用候选')
    const selectedResult = await this.selectScriptVariantForProject({
      cloneProjectId: currentProject.id,
      variantId: defaultCandidate.id,
    })
    project = selectedResult.project

    advanceAutoRunWorkflow(project, 'storyboard_design')
    setAutoFlowStage(project, 'storyboard_design', 'running', '自动生成分镜设计图')
    await cloneRepo.upsertProject(project)
    const frameResult = await this.generateStoryboardGridsForProject({
      cloneProjectId: project.id,
      productReferenceImagePaths: boundProductRefs,
      selectedModelIdentityId: project.selectedModelIdentitySnapshot?.id,
    })
    project = frameResult.project
    if (!project) throw new Error('分镜图片生成后未返回项目快照')

    const frameRetryErrors: Array<{ shotId: string; index: number; reason: string }> = []
    const frameRetryCandidates = (await cloneRepo.getProject(project.id))?.blueprint?.shots ?? []
    for (const shot of frameRetryCandidates) {
      const hasFrame = Boolean(String(shot.gptFirstFramePath || shot.generatedFirstFramePath || '').trim())
      if (hasFrame) continue
      let latestFrameError = String(shot.gptFrameError || shot.error || '分镜图片生成失败').trim()
      for (let attempt = 1; attempt <= AUTO_CLONE_IMAGE_RETRY_LIMIT; attempt += 1) {
        try {
          const retryProject = await this.generateGptShotFrames({
            cloneProjectId: project.id,
            shotId: shot.id,
            which: 'both',
            productReferenceImagePaths: boundProductRefs,
          })
          const latestShot = retryProject.blueprint?.shots.find((item) => item.id === shot.id)
          if (latestShot) {
            replaceProjectShot(retryProject, shot.id, {
              retryCount: attempt,
              error: String(latestShot.error || '').trim(),
              gptFrameError: String(latestShot.gptFrameError || '').trim(),
            })
          }
          project = await cloneRepo.upsertProject(retryProject)
          if (String(latestShot?.gptFirstFramePath || latestShot?.generatedFirstFramePath || '').trim()) {
            latestFrameError = ''
            break
          }
        } catch (error: any) {
          latestFrameError = String(error?.message ?? error ?? '分镜图片生成失败')
          const latest = (await cloneRepo.getProject(project.id)) || project
          replaceProjectShot(latest, shot.id, {
            retryCount: attempt,
            gptFrameError: latestFrameError,
            error: latestFrameError,
            status: 'failed',
          })
          project = await cloneRepo.upsertProject(latest)
        }
      }
      const latest = await cloneRepo.getProject(project.id)
      const latestShot = latest?.blueprint?.shots.find((item) => item.id === shot.id)
      const recovered = Boolean(String(latestShot?.gptFirstFramePath || latestShot?.generatedFirstFramePath || '').trim())
      if (!recovered) {
        frameRetryErrors.push({
          shotId: shot.id,
          index: Number(shot.index ?? 0),
          reason: latestFrameError || String(latestShot?.gptFrameError || latestShot?.error || '分镜图片生成失败'),
        })
      }
      if (latest) {
        latest.storyboardFrames = projectBlueprintShots(latest)
          .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
          .map((item, index) => ({
            id: latest.storyboardFrames?.find((frame) => frame.shotId === item.id)?.id || randomUUID(),
            shotId: item.id,
            imagePath: String(item.gptFirstFramePath || item.generatedFirstFramePath || '').trim() || undefined,
            aspectRatio: '9:16' as const,
            status: String(item.gptFirstFramePath || item.generatedFirstFramePath || '').trim() ? 'cropped' : 'failed',
            error: String(item.gptFrameError || item.error || '').trim() || undefined,
            retryCount: Number(item.retryCount ?? 0) || undefined,
            frameIndex: index,
            updatedAt: now(),
          }))
        project = await cloneRepo.upsertProject(latest)
      }
    }

    setAutoFlowStage(project, 'storyboard_videos', 'running', '自动生成分镜视频')
    await cloneRepo.upsertProject(project)
    const videoResult = await this.generateShotVideosFromStoryboardFrames({
      cloneProjectId: project.id,
      maxAutoRetryPerShot: AUTO_CLONE_VIDEO_RETRY_LIMIT,
    } as any)
    project = videoResult.project
    if (!project) throw new Error('分镜视频批量生成后未返回项目快照')
    const pendingVideoCount = Number(videoResult.queueSummary?.pending ?? 0) + Number(videoResult.queueSummary?.timeout ?? 0)
    const failedVideoCount = Number(videoResult.queueSummary?.failed ?? 0)
    const partialFailureCount = frameRetryErrors.length + failedVideoCount + Number(videoResult.queueSummary?.timeout ?? 0)
    const heartbeat = applyAutoStoryboardHeartbeat(project, {
      done: Number(videoResult.queueSummary?.done ?? 0),
      failed: failedVideoCount,
      pending: pendingVideoCount,
      submitActive: Number(videoResult.queueSummary?.submitActive ?? 0),
      pollActive: Number(videoResult.queueSummary?.pollActive ?? 0),
      downloadActive: Number(videoResult.queueSummary?.downloadActive ?? 0),
    })
    if (pendingVideoCount > 0) {
      let recoveredByIdleKick = false
      if (heartbeat.idleHeartbeatCount >= AUTO_CLONE_VIDEO_IDLE_HEARTBEAT_THRESHOLD) {
        const recoveredProject = await kickAutoStoryboardVideoRecovery(project.id)
        if (recoveredProject) {
          project = recoveredProject
          recoveredByIdleKick = true
        }
      }
      const runningSummary = heartbeat.changed
        ? `自动分镜视频持续推进中：已完成 ${Number(videoResult.queueSummary?.done ?? 0)} 条，待续查 ${pendingVideoCount} 条，提交中 ${Number(videoResult.queueSummary?.submitActive ?? 0)} 条，轮询中 ${Number(videoResult.queueSummary?.pollActive ?? 0)} 条，下载中 ${Number(videoResult.queueSummary?.downloadActive ?? 0)} 条`
        : recoveredByIdleKick
          ? `自动分镜视频连续空转 ${heartbeat.idleHeartbeatCount} 轮后已触发自动纠偏：优先续查超时镜头与下载待回写结果`
          : `自动分镜视频暂无新进展，已连续空转 ${heartbeat.idleHeartbeatCount} 轮：待续查 ${pendingVideoCount} 条，提交中 ${Number(videoResult.queueSummary?.submitActive ?? 0)} 条，轮询中 ${Number(videoResult.queueSummary?.pollActive ?? 0)} 条，下载中 ${Number(videoResult.queueSummary?.downloadActive ?? 0)} 条`
      setAutoFlowStage(project, 'storyboard_videos', 'running', runningSummary)
      project.lastError = failedVideoCount ? runningSummary : ''
      project = await cloneRepo.upsertProject(project)
      scheduleRemoteStoryboardVideoReconcile(project.id)
      return {
        project,
        queueSummary: videoResult.queueSummary,
        frameErrors: frameRetryErrors,
        videoErrors: videoResult.errors ?? [],
      }
    }
    const doneSummary = partialFailureCount
      ? `自动流程执行完成，分镜视频阶段部分失败：失败镜头 ${partialFailureCount} 个`
      : '自动流程已完成分镜视频生成，进入最终门禁检查'
    setAutoFlowStage(project, 'storyboard_videos', partialFailureCount ? 'partial_failed' : 'done', doneSummary)
    project.lastError = partialFailureCount ? doneSummary : ''
    project = await cloneRepo.upsertProject(project)
    if (!partialFailureCount && project.runMode === 'auto') {
      return await this.autoRunCloneToFinalGate({
        cloneProjectId: project.id,
        queueSummary: videoResult.queueSummary,
        frameErrors: frameRetryErrors,
        videoErrors: videoResult.errors ?? [],
      })
    }
    return {
      project,
      queueSummary: videoResult.queueSummary,
      frameErrors: frameRetryErrors,
      videoErrors: videoResult.errors ?? [],
    }
    })()
    autoRunStoryboardVideosInFlight.set(autoRunLockKey, autoRunTask)
    try {
      return await autoRunTask
    } finally {
      autoRunStoryboardVideosInFlight.delete(autoRunLockKey)
    }
  },

  async autoRunCloneToFinalGate(input: {
    cloneProjectId: string
    queueSummary?: any
    frameErrors?: Array<{ shotId: string; index: number; reason: string }>
    videoErrors?: Array<{ shotId: string; index: number; reason: string }>
  }) {
    let project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project) throw new Error('复刻项目不存在')
    ensureCloneFlowState(project)
    ensureAutoFlowStatus(project)
    setAutoFlowStage(project, 'final_compose', 'running', '自动执行成片前最终检查')
    project = await cloneRepo.upsertProject(project)

    const latestShots = project.blueprint?.shots ?? []
    const outputMap = getShotVideoOutputMap(project)
    const blockedShots = latestShots
      .filter((shot) => {
        const effective = getEffectiveShotState(shot, outputMap.get(String(shot.id)))
        return !effective.canEnterRender || String(shot.qualityStatus || '').toLowerCase() === 'failed' || Boolean(shot.error)
      })
      .map((shot) => ({
        shotId: shot.id,
        index: Number(shot.index ?? 0),
        reason: String(shot.error || shot.qualityReasons?.join('；') || '未通过最终门禁'),
      }))

    if (blockedShots.length) {
      const reason = `最终门禁未通过：${blockedShots.length} 个镜头需人工修复`
      setAutoFlowStage(project, 'final_compose', 'failed', reason)
      syncFinalCompose(project, { status: 'idle', error: reason })
      project.lastError = reason
      project = await cloneRepo.upsertProject(project)
      return {
        project,
        queueSummary: input.queueSummary,
        frameErrors: input.frameErrors ?? [],
        videoErrors: input.videoErrors ?? [],
        blockedShots,
      }
    }

    setAutoFlowStage(project, 'final_compose', 'running', '自动进入最终成片合成')
    project = await cloneRepo.upsertProject(project)
    const composed = await this.composeCloneFinalVideo({ cloneProjectId: project.id, outputDir: project.outputDir })
    const latest = composed.project
    setAutoFlowStage(
      latest,
      'final_compose',
      latest.finalCompose?.status === 'done' ? 'done' : 'failed',
      latest.finalCompose?.status === 'done' ? '自动流程已完成最终成片' : String(latest.finalCompose?.error || '最终合成失败'),
    )
    const saved = await cloneRepo.upsertProject(latest)
    return {
      project: saved,
      queueSummary: input.queueSummary,
      frameErrors: input.frameErrors ?? [],
      videoErrors: input.videoErrors ?? [],
      blockedShots: [],
      finalCompose: saved.finalCompose,
    }
  },

  async prepareCloneMaterials(input: {
    cloneProjectId: string
    productType?: CloneProductType
    productPoints?: string
    productReferenceImagePaths?: string[]
    generateModelPack?: boolean
    forceRegenerateModelPack?: boolean
  }) {
    const project = await this.generateConsistencyAssets({
      ...input,
      generateModelPack: input.generateModelPack ?? true,
    })
    patchWorkflowV2(project, 'identity_grid', 'identity_grid', 'done')
    syncProjectBlueprintLayers(project)
    const pipelineStatus = pipelineStatusFromProject(project)
    return {
      project,
      workflowStep: 'identity_grid' as const,
      previewPipeline: project.previewPipeline,
      activeProviderSummary: pipelineStatus.activeProviderSummary,
      activeModelSummary: pipelineStatus.activeModelSummary,
      materialSummary: {
        generatedImageCount: Number(project.baseBlueprint?.consistencyAssets?.modelReferenceImages?.length ?? 0),
        productReferenceImageCount: Number(project.baseBlueprint?.consistencyAssets?.productReferenceImages?.length ?? 0),
        provider: project.baseBlueprint?.consistencyAssets?.provider || pipelineStatus.activeProviderSummary.image.provider,
        model: pipelineStatus.activeModelSummary.image,
      },
    }
  },

  async saveProjectProductImages(input: {
    cloneProjectId: string
    productReferenceImagePaths?: string[]
  }) {
    const project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project || (!project.baseBlueprint && !project.blueprint)) throw new Error('复刻项目或蓝图不存在')
    const refs = Array.from(new Set((input.productReferenceImagePaths ?? []).map((item) => String(item || '').trim()).filter(Boolean)))
    if (!refs.length) throw new Error('请先上传商品图')
    await persistProjectProductRefsDirectly(project, refs)
    console.log('[clone-debug] save-project-product-images', {
      cloneProjectId: project.id,
      refs,
    })
    const saved = await cloneRepo.upsertProject(project)
    await dispatchBackgroundAutoRunIfReady(this, saved.id, 'after_save_product_images')
    return saved
  },

  async bindProjectProduct(input: {
    cloneProjectId: string
    productId: string
  }) {
    return await cloneProductBindingService.bindProjectProduct(input)
  },

  async refreshLibraryProductCanonicalSource(input: { productId: string; force?: boolean }) {
    return await cloneProductBindingService.refreshLibraryProductCanonicalSource(input)
  },

  async refreshLibraryProductAnalysis(input: { productId: string }) {
    return await cloneProductBindingService.refreshLibraryProductAnalysis(input)
  },

  async generateStoryboardGridsForProject(input: {
    cloneProjectId: string
    productReferenceImagePaths?: string[]
    selectedModelIdentityId?: string
  }) {
    const frameResult = await cloneStoryboardGridWorkflow.generateStoryboardGridsForProject(input)
    const latestProject = frameResult.project || (await cloneRepo.getProject(input.cloneProjectId))
    if (!latestProject) return frameResult
    const hasStoryboardFrames = projectBlueprintShots(latestProject).some((shot) =>
      Boolean(String(shot.gptFirstFramePath || shot.generatedFirstFramePath || '').trim()),
    )
    const hasSubmittedShotVideos = (latestProject.shotVideoOutputs ?? []).some((item) => {
      const status = String(item.status || '').trim().toLowerCase()
      const taskId = String(item.taskId || '').trim()
      const videoPath = String(item.videoPath || item.localPath || '').trim()
      return Boolean(
        videoPath ||
          taskId ||
          (status && status !== 'idle' && status !== 'failed_retryable' && status !== 'failed_terminal'),
      )
    })
    console.log('[clone-debug] generate-storyboard-grids-service:auto-video-check', {
      cloneProjectId: input.cloneProjectId,
      hasStoryboardFrames,
      hasSubmittedShotVideos,
      shotVideoOutputCount: latestProject.shotVideoOutputs?.length ?? 0,
    })
    if (!hasStoryboardFrames || hasSubmittedShotVideos) return frameResult
    console.log('[clone-debug] generate-storyboard-grids-service:auto-video-dispatch', {
      cloneProjectId: input.cloneProjectId,
    })
    return await this.generateShotVideosFromStoryboardFrames({
      cloneProjectId: input.cloneProjectId,
      maxAutoRetryPerShot: 0,
    })
  },

  async generateShotVideosFromStoryboardFrames(input: {
    cloneProjectId: string
    maxAutoRetryPerShot?: number
  }) {
    const batchKey = storyboardBatchVideoGenerationKey(input.cloneProjectId)
    const existingBatch = storyboardBatchVideoGenerationInFlight.get(batchKey)
    if (existingBatch) {
      console.log('[clone-debug] storyboard-video-batch:reuse-inflight', {
        projectId: input.cloneProjectId,
      })
      return await existingBatch
    }
    const batchTask = (async () => {
    scheduleRemoteStoryboardVideoReconcile(input.cloneProjectId)
    let project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project) throw new Error('复刻项目不存在')
    ensureCloneFlowState(project)
    assertStoryboardExtractionReady(project)
    const inferredRenderHints = await inferProjectRenderHintsFromStoryboardFrames(project)
    if (project.blueprint && inferredRenderHints) {
      project.blueprint = {
        ...project.blueprint,
        renderHints: {
          aspectRatio: inferredRenderHints.aspectRatio,
          resolution: inferredRenderHints.resolution,
          pacing: project.blueprint.renderHints?.pacing === 'slow' || project.blueprint.renderHints?.pacing === 'medium' ? project.blueprint.renderHints.pacing : 'fast',
          bgmMood: String(project.blueprint.renderHints?.bgmMood || '').trim(),
          ttsStyle: String(project.blueprint.renderHints?.ttsStyle || '').trim(),
        },
      }
    }
    const productAnalysisText = buildPromptProductDescriptionText(project, normalizeProductType(project.baseBlueprint?.productCategory || 'general'))
    const shots = projectBlueprintShots(project)
      .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
      .filter((shot) => resolveStoryboardFrameSource(shot))
    console.log('[clone-debug] storyboard-video-batch:start', {
      projectId: input.cloneProjectId,
      totalShots: projectBlueprintShots(project).length,
      eligibleShotIds: shots.map((shot) => shot.id),
    })
    if (!shots.length) throw new Error('请先生成分镜图片')
    const maxAutoRetryPerShot = Math.max(0, Number(input.maxAutoRetryPerShot ?? 0))
    const queueOptions = createCloneGenerationQueue(project).options
    const videoConcurrency = Math.max(1, Math.min(shots.length || 1, Number(queueOptions.maxConcurrentCloudJobs || project.policy.concurrency || 4)))
    const classification = summarizeVideoDispatchCounts({
      project,
      shots,
      resolveShotVideoOutput,
    })
    const initialShotVideoSummary = summarizeShotVideoQueue(project, shots)
    computeGenerationQueueRuntimeSummary({
      project,
      submitQueued: classification.submitQueued,
      pollQueued: classification.pollQueued,
      downloadQueued: classification.downloadQueued,
      submitActive: Number(project.generationQueue?.runtime?.submitActive ?? 0) || 0,
      pollActive: Number(project.generationQueue?.runtime?.pollActive ?? 0) || 0,
      downloadActive: Number(project.generationQueue?.runtime?.downloadActive ?? 0) || 0,
    })
    const initialGenerationQueue = (project.generationQueue ||= {} as any)
    initialGenerationQueue.lastShotVideoSummary = initialShotVideoSummary.queueSummary as any
    initialGenerationQueue.lastShotVideoFailureBreakdown = initialShotVideoSummary.failureBreakdown as any
    await cloneRepo.upsertProject(project)
    const results = await mapWithConcurrency(shots, videoConcurrency, async (baseShot) => {
      console.log('[clone-debug] storyboard-video-batch:shot-start', {
        projectId: input.cloneProjectId,
        shotId: baseShot.id,
        index: Number(baseShot.index ?? 0),
      })
      let workerProject = await cloneRepo.getProject(input.cloneProjectId)
      if (!workerProject) {
        return { shotId: baseShot.id, index: Number(baseShot.index ?? 0), status: 'failed' as const, reason: '复刻项目不存在' }
      }
      ensureCloneFlowState(workerProject)
      const shot = workerProject.blueprint?.shots.find((item) => item.id === baseShot.id) || baseShot
      clearInvalidVideoTaskMapping(workerProject, shot, 'before-stage4-generate-loop')
      const resolvedOutput = resolveShotVideoOutput(workerProject, shot)
      const shouldBlockLegacyDoneReuse =
        Boolean(resolveEffectiveVideoTaskId(resolvedOutput.taskId, shot.generatedTaskId)) &&
        isActiveShotVideoRemoteStatus(String(resolvedOutput.status || shot.status || '').trim().toLowerCase()) &&
        Boolean(resolvedOutput.previousTaskIds?.length)
      const framePath = resolveStoryboardFrameSource(shot)
      console.log('[clone-debug] storyboard-video-batch:shot-context', {
        projectId: workerProject.id,
        shotId: shot.id,
        index: Number(shot.index ?? 0),
        shotStatus: shot.status,
        outputStatus: resolvedOutput.status,
        taskId: resolvedOutput.taskId,
        generatedTaskId: shot.generatedTaskId,
        framePath,
      })
      if (!shouldBlockLegacyDoneReuse && isCompletedVideoShotStatus((shot as any).status)) {
        const existingOutput = workerProject.shotVideoOutputs?.find((item) => item.shotId === shot.id)
        if (existingOutput?.videoPath || String((shot as any).generatedClipPath ?? '').trim()) {
          return { shotId: shot.id, index: Number(shot.index ?? 0), status: 'skipped' as const }
        }
      }
      const localTask = await checkLocalTaskStatus({ project: workerProject, shot })
      if (localTask.skip) {
        const existingOutput = workerProject.shotVideoOutputs?.find((item) => item.shotId === shot.id)
        const finalTaskId = String(localTask.taskId ?? existingOutput?.taskId ?? (shot as any).generatedTaskId ?? '').trim() || undefined
        syncSegmentVideoOutput(workerProject, shot, {
          source: existingOutput?.source ?? 'generated',
          videoPath: localTask.videoPath,
          localPath: localTask.videoPath,
          taskId: finalTaskId,
          provider: existingOutput?.provider || String((shot as any).generatedProvider ?? '').trim() || undefined,
          model: existingOutput?.model || String((shot as any).generatedModel ?? '').trim() || undefined,
          durationSec: existingOutput?.durationSec || Number((shot as any).generatedClipDurationSec ?? 0) || undefined,
          status: 'done',
          error: undefined,
          completedAt: now(),
        })
        replaceProjectShot(workerProject, shot.id, {
          generatedClipPath: localTask.videoPath,
          generatedSource: (shot as any).generatedSource === 'mock' ? 'mock' : 'cloud',
          generatedProvider: existingOutput?.provider || String((shot as any).generatedProvider ?? '').trim() || undefined,
          generatedModel: existingOutput?.model || String((shot as any).generatedModel ?? '').trim() || undefined,
          generatedTaskId: finalTaskId,
          generatedClipDurationSec: existingOutput?.durationSec || Number((shot as any).generatedClipDurationSec ?? 0) || undefined,
          status: 'done',
          error: '',
        })
        await cloneRepo.upsertProject(workerProject)
        return { shotId: shot.id, index: Number(shot.index ?? 0), status: 'done' as const }
      }
      if (!framePath) {
        return { shotId: shot.id, index: Number(shot.index ?? 0), status: 'skipped' as const }
      }
      const existingBeforeCreate = resolveShotVideoOutput(workerProject, shot)
      const batchSubmissionFingerprint = computeShotVideoSubmissionFingerprint({
        shot,
        firstFramePath: framePath,
        lastFramePath: String(shot.generatedLastFramePath || shot.gptLastFramePath || framePath).trim() || framePath,
        provider: 'apifox_hub',
        model: videoProviderModel(await cloneRepo.getCredentials()),
        requestCapability: 'video_start_end_to_video',
      })
      if (isShotVideoSubmissionLocked(existingBeforeCreate, batchSubmissionFingerprint)) {
        return {
          shotId: shot.id,
          index: Number(shot.index ?? 0),
          status: 'timeout' as const,
          reason: buildShotVideoCreatingLockReason(existingBeforeCreate),
        }
      }
      if (isDownloadReadyShotStatus(existingBeforeCreate.status) && String(existingBeforeCreate.videoUrl || '').trim()) {
        const stableProject = workerProject
        const downloaded = await runVideoTaskPoolJob({
          pool: 'download',
          project: stableProject,
          shotId: shot.id,
          taskId: resolveEffectiveVideoTaskId(existingBeforeCreate.taskId, shot.generatedTaskId) || undefined,
          worker: () => downloadCompletedSegmentTask({ project: stableProject, shot }),
        })
      if (downloaded.status === 'done') {
        return { shotId: shot.id, index: Number(shot.index ?? 0), status: 'done' as const }
      }
      return {
        shotId: shot.id,
        index: Number(shot.index ?? 0),
        status: 'failed' as const,
        reason: `[download_failed] ${downloaded.reason || '下载收尾失败'}`,
      }
      }
      if (
        existingBeforeCreate.taskId &&
        existingBeforeCreate.status !== 'done' &&
        !isImageTaskMapping(existingBeforeCreate.taskId, existingBeforeCreate.provider, existingBeforeCreate.model)
      ) {
        const stableProject = workerProject
        const polled = await runVideoTaskPoolJob({
          pool: 'poll',
          project: stableProject,
          shotId: shot.id,
          taskId: resolveEffectiveVideoTaskId(existingBeforeCreate.taskId, shot.generatedTaskId) || undefined,
          worker: () => pollExistingSegmentTask({ project: stableProject, shot, waitMs: 30_000, skipDownload: true }),
        })
        if (polled.status === 'done') {
          return { shotId: shot.id, index: Number(shot.index ?? 0), status: 'done' as const }
        }
        if (isDownloadReadyShotStatus(polled.status)) {
          const downloadProject = polled.project || stableProject
          const downloaded = await runVideoTaskPoolJob({
            pool: 'download',
            project: downloadProject,
            shotId: shot.id,
            taskId: resolveEffectiveVideoTaskId(existingBeforeCreate.taskId, shot.generatedTaskId) || undefined,
            worker: () => downloadCompletedSegmentTask({ project: downloadProject, shot }),
          })
          if (downloaded.status === 'done') {
            return { shotId: shot.id, index: Number(shot.index ?? 0), status: 'done' as const }
          }
          return {
            shotId: shot.id,
            index: Number(shot.index ?? 0),
            status: 'failed' as const,
            reason: `[download_failed] ${downloaded.reason || '下载收尾失败'}`,
          }
        }
        if (polled.status === 'failed_retryable' || polled.status === 'failed_terminal') {
          const polledProject = polled.project
          const polledShot = polledProject.blueprint?.shots.find((item) => item.id === shot.id) || shot
          const polledOutput = resolveShotVideoOutput(polledProject, polledShot)
          const failureType = classifyShotVideoFailure({
            status: polledOutput.status,
            taskId: resolveEffectiveVideoTaskId(polledOutput.taskId, polledShot.generatedTaskId) || undefined,
            error: polledOutput.error || polledShot.error,
            videoUrl: polledOutput.videoUrl,
          })
          const currentRetryCount = Number(polledShot.retryCount ?? shot.retryCount ?? 0)
          if (failureType === 'remote_failed' && currentRetryCount < maxAutoRetryPerShot) {
            const retryProject = await this.generateShotClip({
              cloneProjectId: polledProject.id,
              shotId: shot.id,
              forceRegenerate: true,
            })
            const retryShot = retryProject.blueprint?.shots.find((item) => item.id === shot.id) || polledShot
            const retryOutput = resolveShotVideoOutput(retryProject, retryShot)
            if (String(retryShot.generatedClipPath || retryOutput.videoPath || '').trim()) {
              return { shotId: shot.id, index: Number(shot.index ?? 0), status: 'done' as const }
            }
            const retriedTaskId = resolveEffectiveVideoTaskId(retryOutput.taskId, retryShot.generatedTaskId)
            if (retriedTaskId) {
              return {
                shotId: shot.id,
                index: Number(shot.index ?? 0),
                status: 'timeout' as const,
                reason: `自动重试已重新提交，taskId=${retriedTaskId}`,
                }
              }
            }
          if (failureType === 'remote_failed' && hasReachedShotVideoRetryLimit(currentRetryCount, maxAutoRetryPerShot)) {
            const terminalReason = `[retry_limit] 该分镜视频自动重新生成已达到 ${maxAutoRetryPerShot} 次，已停止继续查询和处理，请手动检查或更换素材后再重试`
            syncSegmentVideoOutput(polledProject, polledShot, {
              status: 'failed_terminal',
              error: terminalReason,
              taskId: undefined,
              lastPollAt: now(),
              retryCount: currentRetryCount,
            })
            replaceProjectShot(polledProject, polledShot.id, {
              status: 'failed',
              error: terminalReason,
              generatedTaskId: undefined,
              retryCount: currentRetryCount,
            })
            await cloneRepo.upsertProject(polledProject)
            return {
              shotId: shot.id,
              index: Number(shot.index ?? 0),
              status: 'failed' as const,
              reason: terminalReason,
            }
          }
          return {
            shotId: shot.id,
            index: Number(shot.index ?? 0),
            status: 'failed' as const,
            reason: String(polled.project.blueprint?.shots.find((item) => item.id === shot.id)?.error || '分镜视频续查失败').trim(),
          }
        }
        return {
          shotId: shot.id,
          index: Number(shot.index ?? 0),
          status: 'timeout' as const,
          reason: `${videoPollingTimeoutMessage(videoProviderLabel(await cloneRepo.getCredentials()))} taskId=${existingBeforeCreate.taskId}`,
        }
      }
      try {
        const creds = await cloneRepo.getCredentials()
        const productIdentityText = buildPromptProductDescriptionText(workerProject, normalizeProductType(shot.productType))
        const compiled = promptConsistencyService.compileAndPersist({
          projectId: workerProject.id,
          shot,
          projectShotCount: shots.length,
          productReferenceImagePaths: shot.productReferenceImagePaths,
          productDescription: productIdentityText,
        })
        const effectiveVideoPrompt = buildEffectiveVideoCompiledPrompt({
          shot,
          project: workerProject,
          productType: normalizeProductType(shot.productType),
          productIdentityText,
        })
        replaceProjectShot(workerProject, shot.id, {
          compiledPrompt: effectiveVideoPrompt,
          compiledNegativePrompt: compiled.finalNegativePrompt,
          promptCompilerVersion: compiled.compilerVersion,
          consistencyMode: compiled.strictConsistencyMode ? 'strict' : 'standard',
        })
        await cloneRepo.upsertProject(workerProject)
        if (isLocalMockTestMode(creds)) {
          const shotDir = join(getAppPaths().dataDir, 'viral-clone', workerProject.id, 'shots', shot.id, 'mock-video')
          await mkdir(shotDir, { recursive: true })
          const startFramePath = String(shot.gptFirstFramePath || shot.generatedFirstFramePath || framePath).trim()
          const endFramePath = String(shot.gptLastFramePath || shot.generatedLastFramePath || startFramePath).trim()
          const generated = await generateShotVideoByProviderChain({
            project: workerProject,
            shot: {
              ...shot,
              compiledPrompt: effectiveVideoPrompt,
              compiledNegativePrompt: compiled.finalNegativePrompt,
              promptCompilerVersion: compiled.compilerVersion,
              consistencyMode: compiled.strictConsistencyMode ? 'strict' : 'standard',
            },
            outDir: shotDir,
            startFramePath,
            endFramePath,
            consistencyMode: consistencyRuntimeMode(shot, compiled.strictConsistencyMode),
            credentials: creds,
            chain: ['seedance'],
            compiledPrompt: effectiveVideoPrompt,
            compiledNegativePrompt: compiled.finalNegativePrompt,
          })
          replaceProjectShot(workerProject, shot.id, {
            generatedClipPath: generated.outputFilePath,
            generatedSource: 'mock',
            generatedProvider: generated.provider,
            generatedModel: generated.model,
            generatedTaskId: generated.remoteTaskId,
            status: 'done',
            error: '',
          })
          syncSegmentVideoOutput(workerProject, shot, {
            source: 'generated',
            videoPath: generated.outputFilePath,
            localPath: generated.outputFilePath,
            taskId: generated.remoteTaskId,
            provider: generated.provider,
            model: generated.model,
            status: 'done',
            error: undefined,
            remoteStatus: 'succeeded',
            completedAt: now(),
          })
          await cloneRepo.upsertProject(workerProject)
          return { shotId: shot.id, index: Number(shot.index ?? 0), status: 'done' as const }
        }
        const stableProject = workerProject
        console.log('[clone-debug] storyboard-video-batch:submit-dispatch', {
          projectId: stableProject.id,
          shotId: shot.id,
          framePath,
          providerChain: videoProviderChain(creds),
          model: videoProviderModel(creds),
        })
        await runVideoTaskPoolJob({
          pool: 'submit',
          project: stableProject,
          shotId: shot.id,
          worker: async () => {
            const submitStartedAt = now()
            syncSegmentVideoOutput(stableProject, shot, {
              source: 'generated',
              status: 'submitting',
              provider: videoProviderLabel(creds),
              model: videoProviderModel(creds),
              submissionFingerprint: batchSubmissionFingerprint,
              submissionStartedAt: submitStartedAt,
              submissionLockedUntil: submitStartedAt + SHOT_VIDEO_SUBMISSION_LOCK_MS,
              sourceEvent: 'storyboard_video_batch_submit_started',
            })
            replaceProjectShot(stableProject, shot.id, {
              status: 'generating',
              error: '',
            })
            await cloneRepo.upsertProject(stableProject)
            await this.updateShotEnhanced({
              cloneProjectId: stableProject.id,
              shotId: shot.id,
              replaceMode: 'upload_image_to_video',
              uploadedImagePath: framePath,
              forceAi: true,
              scriptText: shot.scriptText,
              generationPrompt: shot.generationPrompt,
              aiPrompt: buildStructuredShotPrompt({
                shot: {
                  ...shot,
                  uploadedImagePath: framePath,
                },
                productType: shot.productType,
                productPoints: shot.aiPrompt || shot.materialNeed,
                productAnalysisText,
              }),
            })
            const refreshedProject = (await cloneRepo.getProject(stableProject.id)) || stableProject
            ensureCloneFlowState(refreshedProject)
            const refreshedShot = projectBlueprintShots(refreshedProject).find((item) => item.id === shot.id)
            if (!refreshedShot) {
              throw new Error(`分镜不存在，无法提交视频任务: ${shot.id}`)
            }
            clearInvalidVideoTaskMapping(refreshedProject, refreshedShot, 'before-batch-submit-shot-video')
            const credsForSubmit = await cloneRepo.getCredentials()
            const firstFramePath = String(
              refreshedShot.uploadedImagePath && refreshedShot.replaceMode === 'upload_image_to_video'
                ? refreshedShot.uploadedImagePath
                : refreshedShot.gptFrameConfirmed && refreshedShot.gptFirstFramePath
                  ? refreshedShot.gptFirstFramePath
                  : refreshedShot.generatedFirstFramePath || refreshedShot.uploadedImagePath || framePath,
            ).trim()
            const lastFramePath = String(
              refreshedShot.uploadedImagePath && refreshedShot.replaceMode === 'upload_image_to_video'
                ? refreshedShot.uploadedImagePath
                : refreshedShot.gptFrameConfirmed && refreshedShot.gptLastFramePath
                  ? refreshedShot.gptLastFramePath
                  : refreshedShot.generatedLastFramePath || firstFramePath,
            ).trim()
            if (!firstFramePath) {
              throw new Error(`分镜缺少首帧，无法提交视频任务: ${shot.id}`)
            }
            if (videoProviderChain(credsForSubmit)[0] === 'apifox_hub') {
              console.log('[clone-debug] storyboard-video-batch:submit-apifox', {
                projectId: refreshedProject.id,
                shotId: refreshedShot.id,
                firstFramePath,
                lastFramePath: lastFramePath || firstFramePath,
                mode: normalizeQualityMode(refreshedShot.qualityMode),
              })
              await ensureAi666SegmentVideoTask({
                project: refreshedProject,
                shot: refreshedShot,
                firstFramePath,
                lastFramePath: lastFramePath || firstFramePath,
                mode: normalizeQualityMode(refreshedShot.qualityMode),
              })
              return
            }
            await this.generateShotClip({
              cloneProjectId: stableProject.id,
              shotId: shot.id,
            })
          },
        })
        const latest = (await refreshGenerationQueueRuntime(workerProject.id)) ?? (await cloneRepo.getProject(workerProject.id)) ?? workerProject
        const latestShot = latest.blueprint?.shots.find((item) => item.id === shot.id)
        const latestOutput = latest.shotVideoOutputs?.find((item) => item.shotId === shot.id)
        console.log('[clone-debug] storyboard-video-batch:shot-finish', {
          projectId: latest.id,
          shotId: shot.id,
          outputStatus: latestOutput?.status,
          taskId: latestOutput?.taskId || latestShot?.generatedTaskId,
          videoPath: latestOutput?.videoPath || latestShot?.generatedClipPath,
          error: latestOutput?.error || latestShot?.error,
        })
        if (String(latestShot?.generatedClipPath || latestOutput?.videoPath || '').trim()) {
          return { shotId: shot.id, index: Number(shot.index ?? 0), status: 'done' as const }
        }
        if (resolveEffectiveVideoTaskId(latestOutput?.taskId, latestShot?.generatedTaskId)) {
          return {
            shotId: shot.id,
            index: Number(shot.index ?? 0),
            status: 'timeout' as const,
            reason: `${videoPollingTimeoutMessage(videoProviderLabel(creds))} taskId=${resolveEffectiveVideoTaskId(latestOutput?.taskId, latestShot?.generatedTaskId)}`,
          }
        }
        const reason = String(latestShot?.error || latestOutput?.error || '分镜视频提交后未生成远端 taskId').trim()
        const classifiedReason = String(reason.startsWith('[') ? reason : `[local_failed] ${reason}`).trim()
        console.error('[clone-debug] storyboard-video-batch:shot-error', {
          projectId: latest.id,
          shotId: shot.id,
          reason,
          classifiedReason,
          taskId: latestOutput?.taskId,
          outputStatus: latestOutput?.status,
        })
        replaceProjectShot(latest, shot.id, {
          status: latestShot?.status ?? 'failed',
          error: classifiedReason,
        })
        await cloneRepo.upsertProject(latest)
        return { shotId: shot.id, index: Number(shot.index ?? 0), status: 'failed' as const, reason: classifiedReason }
      } catch (error: any) {
        const reason = String(error?.message ?? error ?? '分镜视频生成失败')
        const latest = (await cloneRepo.getProject(workerProject.id)) ?? workerProject
        ensureCloneFlowState(latest)
        const latestOutput = resolveShotVideoOutput(latest, latest.blueprint?.shots.find((item) => item.id === shot.id) || shot)
        const nextRetryCount = Math.min(maxAutoRetryPerShot, Number(latest.blueprint?.shots.find((item) => item.id === shot.id)?.retryCount ?? shot.retryCount ?? 0))
        const classifiedReason = latestOutput.taskId
          ? `[remote_timeout] ${videoPollingTimeoutMessage(videoProviderLabel(await cloneRepo.getCredentials()))} taskId=${latestOutput.taskId}`
          : `[local_failed] ${reason}`
        replaceProjectShot(latest, shot.id, {
          status: latestOutput.taskId ? 'generating' : 'failed',
          error: classifiedReason,
          qualityStatus: latestOutput.taskId ? 'unchecked' : 'failed',
          qualityReasons: latestOutput.taskId ? [] : [classifiedReason],
          canEnterRender: false,
          generatedTaskId: latest.blueprint?.shots.find((item) => item.id === shot.id)?.generatedTaskId,
          retryCount: nextRetryCount,
        })
        syncSegmentVideoOutput(latest, shot, {
          source: 'generated',
          status: latestOutput.taskId ? 'failed_retryable' : 'failed_terminal',
          error: classifiedReason,
          taskId: latestOutput.taskId || latest.blueprint?.shots.find((item) => item.id === shot.id)?.generatedTaskId,
          provider: latestOutput.provider,
          model: latestOutput.model,
          remoteStatus: latestOutput.remoteStatus,
          remoteRaw: latestOutput.remoteRaw,
          retryCount: nextRetryCount,
          lastPollAt: latestOutput.lastPollAt,
          sourceEvent: latestOutput.taskId ? 'storyboard_video_batch_submit_timeout' : 'storyboard_video_batch_submit_failed',
        })
        patchWorkflowV2(latest, 'storyboard_videos', 'storyboard_videos', 'running')
        await cloneRepo.upsertProject(latest)
        if (latestOutput.taskId) {
          return {
            shotId: shot.id,
            index: Number(shot.index ?? 0),
            status: 'timeout' as const,
            reason: classifiedReason,
          }
        }
        return { shotId: shot.id, index: Number(shot.index ?? 0), status: 'failed' as const, reason: classifiedReason }
      }
    })
    const errors = results
      .filter((item) => item.status === 'failed' || item.status === 'timeout')
      .map((item) => ({
        shotId: item.shotId,
        index: item.index,
        reason: String(item.reason || '').trim() || '分镜视频生成失败',
      }))
    project = (await cloneRepo.getProject(input.cloneProjectId)) || project
    ensureCloneFlowState(project)
    const summarized = summarizeShotVideoQueue(project, shots)
    const finalizedGenerationQueue = (project.generationQueue ||= {} as any)
    finalizedGenerationQueue.lastShotVideoSummary = summarized.queueSummary as any
    finalizedGenerationQueue.lastShotVideoFailureBreakdown = summarized.failureBreakdown as any
    const done = summarized.queueSummary.done
    const failed = summarized.queueSummary.failed
    const skipped = summarized.queueSummary.skipped
    const timeout = summarized.queueSummary.timeout
    const pending = summarized.queueSummary.pending
    const summaryError = errors.length
      ? `已跳过 ${failed} 个失败分镜，可在分镜视频卡片点击重新生成。`
      : ''
    patchWorkflowV2(project, 'storyboard_videos', 'storyboard_videos', failed ? 'failed' : 'done', summaryError)
    if (!failed) {
      patchWorkflowV2(project, 'final_compose', 'final_compose', 'running')
      syncFinalCompose(project, { status: 'ready' })
      project.lastError = ''
      setProjectErrorContext(project, null)
    } else {
      syncFinalCompose(project, { status: 'idle', error: summaryError })
      project.lastError = summaryError
    }
    const saved = await cloneRepo.upsertProject(project)
    const runtime = saved.generationQueue?.runtime
    return {
      project: saved,
      shotVideoOutputs: saved.shotVideoOutputs ?? [],
      queueSummary: {
        ...summarized.queueSummary,
        doneCount: done,
        pendingCount: pending,
        failedCount: failed,
        timeoutCount: timeout,
        submitActive: runtime?.submitActive ?? 0,
        pollActive: runtime?.pollActive ?? 0,
        downloadActive: runtime?.downloadActive ?? 0,
        submitQueued: runtime?.submitQueued ?? 0,
        pollQueued: runtime?.pollQueued ?? 0,
        downloadQueued: runtime?.downloadQueued ?? 0,
      },
      failureBreakdown: summarized.failureBreakdown,
      errors,
    }
    })().finally(() => {
      storyboardBatchVideoGenerationInFlight.delete(batchKey)
    })
    storyboardBatchVideoGenerationInFlight.set(batchKey, batchTask)
    return await batchTask
  },

  async replaceShotVideoForProject(input: {
    cloneProjectId: string
    shotId: string
    videoPath: string
  }) {
    const project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project) throw new Error('复刻项目不存在')
    ensureCloneFlowState(project)
    const shot = projectBlueprintShots(project).find((item) => item.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    const quality = await productionQualityCheckShot({
      shot: {
        ...shot,
        uploadedAssetPath: input.videoPath,
      },
      filePath: input.videoPath,
      targetDurationSec: shot.durationSec,
    })
    replaceProjectShot(project, shot.id, {
      uploadedAssetPath: input.videoPath,
      replacementMode: 'local_video',
      generatedClipPath: undefined,
      qualityStatus: quality.qualityStatus,
      qualityScore: quality.qualityScore,
      qualityReasons: quality.qualityReasons,
      generatedClipDurationSec: quality.generatedClipDurationSec,
      generatedClipWidth: quality.generatedClipWidth,
      generatedClipHeight: quality.generatedClipHeight,
      canEnterRender: quality.canEnterRender,
      status: quality.canEnterRender ? 'ready' : 'failed',
      error: quality.canEnterRender ? '' : quality.qualityReasons.join('；'),
    })
    syncShotVideoOutput(project, {
      shotId: shot.id,
      source: 'uploaded_replacement',
      videoPath: input.videoPath,
      provider: 'local-upload',
      model: 'uploaded-replacement',
      durationSec: quality.generatedClipDurationSec,
      status: quality.canEnterRender ? 'done' : 'failed_terminal',
      error: quality.canEnterRender ? undefined : quality.qualityReasons.join('；'),
      updatedAt: now(),
    })
    patchWorkflowV2(project, 'final_compose', 'final_compose', 'done')
    syncFinalCompose(project, { status: 'ready', error: undefined })
    const saved = await cloneRepo.upsertProject(project)
    return {
      project: saved,
      shotVideoOutputs: saved.shotVideoOutputs ?? [],
    }
  },

  async composeCloneFinalVideo(input: {
    cloneProjectId: string
    outputDir?: string
  }) {
    const loadedProject = await cloneRepo.getProject(input.cloneProjectId)
    const project = loadedProject ? await reconcileRenderableShotsBeforeCompose(loadedProject) : loadedProject
    if (!project) throw new Error('???????')
    ensureCloneFlowState(project)
    const gate = validateProjectReadyForFinalCompose(project)
    if (!gate.ok) {
      patchWorkflowV2(project, 'final_compose', 'final_compose', 'failed', gate.reason)
      syncFinalCompose(project, { status: 'idle', error: gate.reason })
      project.lastError = gate.reason
      await cloneRepo.upsertProject(project)
      throw new Error(gate.reason)
    }
    patchWorkflowV2(project, 'final_compose', 'final_compose', 'running')
    syncFinalCompose(project, { status: 'composing', error: undefined })
    await cloneRepo.upsertProject(project)
    try {
      const rendered = await this.renderPreview({
        cloneProjectId: project.id,
        outputDir: String(input.outputDir || '').trim() || undefined,
      })
      const latest = (await cloneRepo.getProject(project.id)) || project
      const finalOutputPath = String(rendered.output || '').trim() || undefined
      const coverImagePath = finalOutputPath ? await ensureVideoCoverImage(finalOutputPath) : undefined
      patchWorkflowV2(latest, 'final_compose', 'final_compose', 'done')
      patchWorkflowV2(latest, 'final_compose', 'final_compose', 'done')
      syncFinalCompose(latest, {
        status: finalOutputPath ? 'done' : 'failed',
        outputPath: finalOutputPath,
        coverImagePath,
        error: finalOutputPath ? undefined : '最终合成未产出视频文件',
      })
      previewPipelinePatch(latest, {
        status: finalOutputPath ? 'done' : 'failed',
        previewOutputPath: finalOutputPath,
        previewReportPath: String(rendered.reportPath || '').trim() || undefined,
        lastError: finalOutputPath ? undefined : '最终合成未产出视频文件',
      })
      if (finalOutputPath) {
        latest.lastError = ''
        setProjectErrorContext(latest, null)
      }
      latest.status = finalOutputPath ? 'completed' : latest.status
      const saved = await cloneRepo.upsertProject(latest)
      return {
        project: saved,
        finalCompose: saved.finalCompose,
        previewPipeline: saved.previewPipeline,
      }
    } catch (e: any) {
      const latest = (await cloneRepo.getProject(project.id)) || project
      const creds = await cloneRepo.getCredentials()
      const provider = videoProviderLabel(creds)
      const model = videoProviderModel(creds)
      const reason = String(e?.message ?? e)
      setProjectErrorContext(
        latest,
        videoProviderChain(creds)[0] === 'apifox_hub'
          ? {
              ...apifoxContextByCapability(creds, 'video_reference_to_video'),
              action: 'compose_final_video',
              message: reason,
              responseSnippet: reason,
            }
          : {
              provider,
              model,
              action: 'compose_final_video',
              message: reason,
              responseSnippet: reason,
            },
      )
      patchWorkflowV2(latest, 'final_compose', 'final_compose', 'failed', reason)
      syncFinalCompose(latest, {
        status: 'failed',
        error: `[${provider} / ${model}] ${reason}`,
      })
      previewPipelinePatch(latest, {
        status: 'failed',
        lastError: `[${provider} / ${model}] ${reason}`,
      })
      latest.lastError = `[${provider} / ${model}] ${reason}`
      await cloneRepo.upsertProject(latest)
      throw new Error(`[${provider} / ${model}] ${reason}`)
    }
  },

  async generateCloneVariants(input: {
    cloneProjectId: string
    targetProductId?: string
    variantsPerShot?: number
  }) {
    const generated = await this.generateShotVariants({
      cloneProjectId: input.cloneProjectId,
      targetProductId: input.targetProductId,
      variantsPerShot: input.variantsPerShot ?? 5,
      strategy: 'balanced',
    })
    await this.scoreShotVariants({
      cloneProjectId: input.cloneProjectId,
      targetProductId: input.targetProductId,
    })
    const project = await this.buildVideoPlans({
      cloneProjectId: input.cloneProjectId,
      targetProductId: input.targetProductId,
      planCount: 12,
      maxVideosToGenerate: 3,
      strategy: 'balanced',
    })
    patchWorkflowV2(project, 'storyboard_videos', 'storyboard_videos', 'running')
    syncProjectBlueprintLayers(project)
    return {
      project,
      workflowStep: 'storyboard_videos' as const,
      previewPipeline: project.previewPipeline,
      activeProviderSummary: pipelineStatusFromProject(project).activeProviderSummary,
      activeModelSummary: pipelineStatusFromProject(project).activeModelSummary,
      generatedProjectId: generated.id,
    }
  },

  async generateClonePreviewAndBatch(input: {
    cloneProjectId: string
    topN?: number
    onlyMissing?: boolean
    variantsPerShot?: number
    productReferenceImagePaths?: string[]
    targetProductId?: string
    previewFirst?: boolean
  }) {
    const result = await this.runStoryboardAndVideoBatch({
      ...input,
      previewFirst: input.previewFirst ?? true,
    })
    const project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project) throw new Error('复刻项目不存在')
    const previewOutput = String(result.summary?.previewOutput || project.previewPipeline?.previewOutputPath || '').trim()
    if (!previewOutput) {
      const creds = await cloneRepo.getCredentials()
      const provider = videoProviderLabel(creds)
      const model = videoProviderModel(creds)
      const reason =
        result.summary?.planResults?.find((x) => x.mode === 'preview' && x.status === 'failed')?.reason ||
        project.previewPipeline?.lastError ||
        project.lastError ||
        '首条预览未生成任何视频文件'
      patchWorkflowV2(project, 'storyboard_videos', 'storyboard_videos', 'failed', reason)
      previewPipelinePatch(project, {
        status: 'failed',
        lastError: `[${provider} / ${model}] ${reason}`,
      })
      await cloneRepo.upsertProject(project)
      throw new Error(`[${provider} / ${model}] ${reason}`)
    }
    patchWorkflowV2(project, 'final_compose', 'storyboard_videos', 'done')
    syncProjectBlueprintLayers(project)
    const saved = await cloneRepo.upsertProject(project)
    return {
      ...result,
      workflowStep: 'final_compose' as const,
      previewPipeline: saved.previewPipeline,
      activeProviderSummary: pipelineStatusFromProject(saved).activeProviderSummary,
      activeModelSummary: pipelineStatusFromProject(saved).activeModelSummary,
      errorContext: pipelineStatusFromProject(saved).errorContext,
    }
  },

  async reanalyzeShotScript(input: {
    cloneProjectId: string
    shotId: string
  }) {
    let item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目或蓝图不存在')
    const blueprint = item.blueprint
    const shot = blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    const creds = await cloneRepo.getCredentials()
    const result = await analyzeReferenceScriptWithGrs({
      videoPath: item.referenceVideoPath,
      locale: item.locale,
      credentials: creds,
      shots: [shot],
      targetMarket: item.locale,
      productCategory: shot.productType || item.baseBlueprint?.productCategory || 'general',
    })
    const [nextShot] = applyScriptAnalysisToShots([shot], result)
    if (!nextShot) throw new Error('脚本分析没有返回当前分镜')
    item.blueprint = {
      ...item.blueprint,
      globalScript: result.globalScript || item.blueprint.globalScript,
      scriptAnalysisError: undefined,
      shots: item.blueprint.shots.map((s) => (s.id === shot.id ? nextShot : s)),
    }
    item.baseBlueprint = item.baseBlueprint
      ? {
          ...item.baseBlueprint,
          globalScript: result.globalScript || item.baseBlueprint.globalScript,
          scriptAnalysisError: undefined,
          shots: item.baseBlueprint.shots.map((s) => (s.id === shot.id ? { ...s, ...nextShot } : s)),
        }
      : item.blueprint
    return await cloneRepo.upsertProject(item)
  },

  async getProject(input: { cloneProjectId: string }) {
    return await cloneProjectWorkspaceService.getProject(input)
  },

  async updateProjectMeta(input: { cloneProjectId: string; title?: string; description?: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    item.title = String(input.title ?? item.title ?? '').trim() || item.title
    item.description = String(input.description ?? item.description ?? '').trim() || undefined
    const saved = await cloneRepo.upsertProject(item)
    return {
      project: saved,
      summary: buildProjectSummary(saved),
    }
  },

  async applySubtitleVideoToProject(input: {
    cloneProjectId: string
    subtitleVideoPath: string
    subtitleCoverImagePath?: string
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    const subtitleVideoPath = String(input.subtitleVideoPath || '').trim()
    if (!subtitleVideoPath) throw new Error('字幕视频不存在')
    if (!existsSync(subtitleVideoPath)) throw new Error('字幕视频文件不存在')
    ensureCloneFlowState(item)
    const currentOutputPath = String(item.finalCompose?.outputPath || '').trim()
    if (!currentOutputPath) throw new Error('当前项目还没有可替换的成片')
    const currentCoverImagePath = String(item.finalCompose?.coverImagePath || '').trim() || undefined
    const previousOverlay = item.finalCompose?.subtitleOverlay
    const originalOutputPath =
      previousOverlay?.active && previousOverlay.originalOutputPath
        ? String(previousOverlay.originalOutputPath || '').trim()
        : currentOutputPath
    const originalCoverImagePath =
      previousOverlay?.active && previousOverlay.originalCoverImagePath
        ? String(previousOverlay.originalCoverImagePath || '').trim() || undefined
        : currentCoverImagePath
    const subtitleCoverImagePath =
      String(input.subtitleCoverImagePath || '').trim() || (await ensureVideoCoverImage(subtitleVideoPath))
    syncFinalCompose(item, {
      status: 'done',
      outputPath: subtitleVideoPath,
      coverImagePath: subtitleCoverImagePath,
      error: undefined,
    })
    if (!item.finalCompose) {
      throw new Error('当前项目成片状态异常')
    }
    item.finalCompose.subtitleOverlay = {
      active: true,
      originalOutputPath,
      originalCoverImagePath,
      subtitleOutputPath: subtitleVideoPath,
      subtitleCoverImagePath,
      appliedAt: now(),
    }
    const saved = await cloneRepo.upsertProject(item)
    return {
      project: saved,
      summary: buildProjectSummary(saved),
    }
  },

  async revertSubtitleVideoFromProject(input: { cloneProjectId: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    ensureCloneFlowState(item)
    const overlay = item.finalCompose?.subtitleOverlay
    if (!overlay?.active) throw new Error('当前项目没有可回退的字幕视频')
    const subtitleVideoPath = String(overlay.subtitleOutputPath || '').trim()
    const subtitleCoverImagePath = String(overlay.subtitleCoverImagePath || '').trim()
    syncFinalCompose(item, {
      status: 'done',
      outputPath: String(overlay.originalOutputPath || '').trim() || undefined,
      coverImagePath: String(overlay.originalCoverImagePath || '').trim() || undefined,
      error: undefined,
    })
    if (item.finalCompose) {
      item.finalCompose.subtitleOverlay = undefined
    }
    const saved = await cloneRepo.upsertProject(item)
    if (subtitleVideoPath) {
      await rm(subtitleVideoPath, { force: true }).catch(() => undefined)
    }
    if (subtitleCoverImagePath) {
      await rm(subtitleCoverImagePath, { force: true }).catch(() => undefined)
    }
    return {
      project: saved,
      summary: buildProjectSummary(saved),
    }
  },

  async updateProjectRenderHints(input: {
    cloneProjectId: string
    aspectRatio?: '9:16' | '16:9'
    resolution?: '720x1280' | '1280x720' | '1080x1920' | '1920x1080'
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('Project not found')
    if (!item.blueprint) throw new Error('Blueprint is not ready')
    const nextAspectRatio = input.aspectRatio === '16:9' ? '16:9' : '9:16'
    const nextResolution =
      input.resolution === '1280x720' ||
      input.resolution === '720x1280' ||
      input.resolution === '1920x1080' ||
      input.resolution === '1080x1920'
        ? input.resolution
        : nextAspectRatio === '16:9'
          ? '1280x720'
          : '1080x1920'
    item.blueprint = {
      ...item.blueprint,
      renderHints: {
        aspectRatio: nextAspectRatio,
        resolution: nextResolution,
        pacing: item.blueprint.renderHints?.pacing === 'slow' || item.blueprint.renderHints?.pacing === 'medium' ? item.blueprint.renderHints.pacing : 'fast',
        bgmMood: String(item.blueprint.renderHints?.bgmMood || '').trim(),
        ttsStyle: String(item.blueprint.renderHints?.ttsStyle || '').trim(),
      },
    }
    const saved = await cloneRepo.upsertProject(item)
    return {
      project: saved,
      summary: buildProjectSummary(saved),
    }
  },

  async listCloneGroups() {
    const groups = await cloneRepo.listProjectGroups()
    const summaries = await cloneRepo.listProjects()
    const countByGroupId = new Map<string, number>()
    let ungroupedCount = 0
    for (const project of summaries) {
      const groupId = String(project.groupId || '').trim()
      if (!groupId) {
        ungroupedCount += 1
        continue
      }
      countByGroupId.set(groupId, Number(countByGroupId.get(groupId) || 0) + 1)
    }
    return groups.map((group) => ({
      ...group,
      taskCount: Number(countByGroupId.get(group.id) || 0),
    })).concat([
      {
        id: '__ungrouped__',
        name: '未分组',
        createdAt: 0,
        updatedAt: 0,
        sortOrder: -1,
        taskCount: ungroupedCount,
      },
    ])
  },

  async createCloneGroup(input: { name: string }) {
    const name = String(input.name || '').trim()
    if (!name) throw new Error('请输入分组名称')
    const existing = await cloneRepo.listProjectGroups()
    if (existing.some((item) => String(item.name || '').trim() === name)) {
      throw new Error('分组名称已存在')
    }
    return await cloneRepo.createProjectGroup({ name })
  },

  async renameCloneGroup(input: { groupId: string; name: string }) {
    const groupId = String(input.groupId || '').trim()
    const name = String(input.name || '').trim()
    if (!groupId) throw new Error('分组不存在')
    if (!name) throw new Error('请输入分组名称')
    const current = await cloneRepo.getProjectGroup(groupId)
    if (!current) throw new Error('分组不存在')
    const existing = await cloneRepo.listProjectGroups()
    if (existing.some((item) => item.id !== groupId && String(item.name || '').trim() === name)) {
      throw new Error('分组名称已存在')
    }
    return await cloneRepo.upsertProjectGroup({ ...current, name })
  },

  async removeCloneGroup(input: { groupId: string }) {
    const groupId = String(input.groupId || '').trim()
    if (!groupId) throw new Error('分组不存在')
    const current = await cloneRepo.getProjectGroup(groupId)
    if (!current) throw new Error('分组不存在')
    return await cloneRepo.removeProjectGroup(groupId)
  },

  async assignCloneProjectsToGroup(input: { cloneProjectIds: string[]; groupId?: string }) {
    const cloneProjectIds = Array.isArray(input.cloneProjectIds)
      ? Array.from(new Set(input.cloneProjectIds.map((item) => String(item || '').trim()).filter(Boolean)))
      : []
    if (!cloneProjectIds.length) throw new Error('请选择要移动的任务')
    const groupId = String(input.groupId || '').trim() || undefined
    const group = groupId ? await cloneRepo.getProjectGroup(groupId) : null
    if (groupId && !group) throw new Error('目标分组不存在')
    const updated: Array<{ project: any; summary: any }> = []
    for (const cloneProjectId of cloneProjectIds) {
      const project = await cloneRepo.getProject(cloneProjectId)
      if (!project) continue
      project.groupId = group?.id
      project.groupName = group?.name
      const saved = await cloneRepo.upsertProject(project)
      updated.push({ project: saved, summary: buildProjectSummary(saved) })
    }
    return {
      group: group ?? undefined,
      updated,
    }
  },

  async bindProjectReferenceVideo(input: { cloneProjectId: string; videoPath: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    const videoPath = String(input.videoPath || '').trim()
    if (!videoPath) throw new Error('请先选择参考视频')
    item.referenceVideoPath = videoPath
    item.referenceVideoName = basename(videoPath)
    const saved = await cloneRepo.upsertProject(item)
    return {
      project: saved,
      summary: buildProjectSummary(saved),
    }
  },

  async getProjectSummary(input: { cloneProjectId: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    return buildProjectSummary(item)
  },

  async getClonePipelineStatus(input: { cloneProjectId: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    return pipelineStatusFromProject(item)
  },

  async syncShotVideoTask(input: { cloneProjectId: string; shotId: string }) {
    const project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project || !project.blueprint) throw new Error('复刻项目不存在')
    ensureCloneFlowState(project)
    const shot = project.blueprint.shots.find((item) => item.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    const taskId = resolveEffectiveVideoTaskId(
      project.shotVideoOutputs?.find((item) => item.shotId === shot.id)?.taskId,
      shot.generatedTaskId,
    )
    if (!taskId) throw new Error('当前分镜没有可同步的 taskId')
    const ensured = await ensureShotVideoState(project.id, shot.id, 'poll_only')
    const ensuredShot = ensured.blueprint?.shots.find((item) => item.id === shot.id) || shot
    const ensuredOutput = resolveShotVideoOutput(ensured, ensuredShot)
    const ensuredTaskId = resolveEffectiveVideoTaskId(ensuredOutput.taskId, ensuredShot.generatedTaskId)
    const ensuredStatus = String(ensuredOutput.status || '').trim().toLowerCase()
    const shouldReturnEnsuredDirectly =
      Boolean(ensuredTaskId) &&
      !String(ensuredOutput.videoPath || ensuredOutput.localPath || ensuredShot.generatedClipPath || '').trim() &&
      (
        ensuredStatus === 'submitting' ||
        ensuredStatus === 'remote_pending' ||
        ensuredStatus === 'remote_running'
      )
    let latest = shouldReturnEnsuredDirectly ? ensured : await getReadonlyProjectWithRuntime(ensured || project)
    let latestShot = latest.blueprint?.shots.find((item) => item.id === shot.id) || shot
    let latestOutput = resolveShotVideoOutput(latest, latestShot)
    const latestStatus = String(latestOutput.status || '').trim().toLowerCase()
    if (
      (
        latestStatus === 'remote_pending' ||
        latestStatus === 'remote_running' ||
        latestStatus === 'remote_succeeded_pending_download' ||
        latestStatus === 'downloading' ||
        latestStatus === 'failed_retryable'
      ) &&
      String(latestShot.generatedClipPath || latestOutput.videoPath || latestOutput.localPath || '').trim()
    ) {
      syncSegmentVideoOutput(latest, latestShot, {
        videoPath: undefined,
        localPath: undefined,
        completedAt: undefined,
      })
      replaceProjectShot(latest, latestShot.id, {
        generatedClipPath: undefined,
        status: latestStatus === 'failed_retryable' ? 'failed' : 'generating',
        error: latestStatus === 'failed_retryable' ? String(latestOutput.error || latestShot.error || '').trim() : '',
      })
      latest = await cloneRepo.upsertProject(latest)
      latestShot = latest.blueprint?.shots.find((item) => item.id === shot.id) || shot
      latestOutput = resolveShotVideoOutput(latest, latestShot)
    }
    if (['shot_2', 'shot_3', 'shot_4'].includes(String(latestShot.id || '').trim())) {
      console.log('[clone-debug] sync-shot-video-task:return-state', {
        projectId: latest.id,
        shotId: latestShot.id,
        taskId: resolveEffectiveVideoTaskId(latestOutput.taskId, latestShot.generatedTaskId) || taskId,
        latestStatus: latestOutput.status,
        latestVideoPath: latestOutput.videoPath,
        latestLocalPath: latestOutput.localPath,
        latestVideoUrl: latestOutput.videoUrl,
        latestRemoteStatus: latestOutput.remoteStatus,
        latestPreviousTaskIds: latestOutput.previousTaskIds,
        latestSubmissionLockedUntil: latestOutput.submissionLockedUntil,
      })
    }
    return {
      project: latest,
      task: {
        taskId: resolveEffectiveVideoTaskId(latestOutput.taskId, latestShot.generatedTaskId) || taskId,
        status: latestOutput.status || 'remote_running',
        errorMessage: latestOutput.error,
      },
      synced: Boolean(String(latestOutput.videoPath || latestOutput.localPath || '').trim()),
      status: latestOutput.status || 'remote_running',
    }
  },

  async forceDownloadShotVideoResult(input: { cloneProjectId: string; shotId: string }) {
    const project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project || !project.blueprint) throw new Error('复刻项目不存在')
    ensureCloneFlowState(project)
    const shot = project.blueprint.shots.find((item) => item.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    const ensured = await ensureShotVideoState(project.id, shot.id, 'download_if_ready')
    const latest = await getReadonlyProjectWithRuntime(ensured || project)
    const latestShot = latest.blueprint?.shots.find((item) => item.id === shot.id) || shot
    const latestOutput = resolveShotVideoOutput(latest, latestShot)
    if (['shot_2', 'shot_3', 'shot_4'].includes(String(latestShot.id || '').trim())) {
      console.log('[clone-debug] force-download-shot-video:return-state', {
        projectId: latest.id,
        shotId: latestShot.id,
        taskId: resolveEffectiveVideoTaskId(latestOutput.taskId, latestShot.generatedTaskId) || undefined,
        latestStatus: latestOutput.status,
        latestVideoPath: latestOutput.videoPath,
        latestLocalPath: latestOutput.localPath,
        latestVideoUrl: latestOutput.videoUrl,
        latestRemoteStatus: latestOutput.remoteStatus,
        latestPreviousTaskIds: latestOutput.previousTaskIds,
        latestSubmissionLockedUntil: latestOutput.submissionLockedUntil,
      })
    }
    return {
      project: latest,
      status: latestOutput.status || 'downloading',
      synced: Boolean(String(latestOutput.videoPath || latestOutput.localPath || '').trim()),
      task: {
        taskId: resolveEffectiveVideoTaskId(latestOutput.taskId, latestShot.generatedTaskId) || undefined,
        status: latestOutput.status || 'downloading',
        errorMessage: latestOutput.error,
      },
    }
  },
  async regenerateShotVideo(input: { cloneProjectId: string; shotId: string }) {
    const project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project || !project.blueprint) throw new Error('澶嶅埢椤圭洰涓嶅瓨鍦?')
    ensureCloneFlowState(project)
    const shot = project.blueprint.shots.find((item) => item.id === input.shotId)
    if (!shot) throw new Error('鍒嗛暅涓嶅瓨鍦?')
    const ensured = await ensureShotVideoState(project.id, shot.id, 'force_regenerate')
    const latest = await getReadonlyProjectWithRuntime(ensured || project)
    const latestShot = latest.blueprint?.shots.find((item) => item.id === shot.id) || shot
    const latestOutput = resolveShotVideoOutput(latest, latestShot)
    return {
      project: latest,
      status: latestOutput.status || 'submitting',
      synced: Boolean(String(latestOutput.videoPath || latestOutput.localPath || '').trim()),
      task: {
        taskId: resolveEffectiveVideoTaskId(latestOutput.taskId, latestShot.generatedTaskId) || undefined,
        status: latestOutput.status || 'submitting',
        errorMessage: latestOutput.error,
      },
    }
  },
  async reconcileRemoteStoryboardVideos(input: { cloneProjectId: string }) {
    try {
      return await reconcileRemoteStoryboardVideosInternal(input.cloneProjectId)
    } catch (error) {
      if (isMissingCloneProjectError(error)) {
        return { project: undefined, results: [], missing: true, error: '复刻项目不存在，可能已被删除或当前选择的是失效历史项目。' }
      }
      throw error
    }
  },

  async resumePendingRemoteStoryboardVideosOnStartup() {
    const projects = await cloneRepo.listProjects()
    const resumableProjects = projects
      .filter((project) => {
        if (!project?.blueprint) return false
        ensureCloneFlowState(project)
        return hasPendingRemoteStoryboardVideoWork(project)
      })
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))

    console.log('[clone-debug] startup-resume-shot-video-scan', {
      totalProjectCount: projects.length,
      resumableProjectCount: resumableProjects.length,
      projectIds: resumableProjects.map((project) => project.id),
    })

    resumableProjects.forEach((project, index) => {
      const delayMs = Math.min(index, 5) * 1200
      console.log('[clone-debug] startup-resume-shot-video-schedule', {
        cloneProjectId: project.id,
        delayMs,
      })
      scheduleRemoteStoryboardVideoReconcile(project.id, delayMs)
    })

    return {
      totalProjectCount: projects.length,
      resumableProjectCount: resumableProjects.length,
      projectIds: resumableProjects.map((project) => project.id),
    }
  },

    async listProjects() {
      return await cloneProjectWorkspaceService.listProjects()
    },

  async listProjectSummaries(input?: { query?: string; status?: string; archived?: boolean }) {
    return await cloneProjectWorkspaceService.listProjectSummaries(input)
  },

  async listModelIdentityLibrary() {
    return await cloneRepo.listModelIdentityLibrary()
  },

  async renameModelIdentity(input: { id: string; name: string }) {
    const item = await cloneRepo.getModelIdentity(input.id)
    if (!item) throw new Error('AI 模特不存在')
    const name = String(input.name || '').trim()
    if (!name) throw new Error('AI 模特名称不能为空')
    return await cloneRepo.upsertModelIdentity({
      ...item,
      name,
      updatedAt: now(),
    })
  },

  async deleteModelIdentity(input: { id: string }) {
    const item = await cloneRepo.getModelIdentity(input.id)
    if (!item) throw new Error('AI 模特不存在')
    await cloneRepo.deleteModelIdentity(input.id)
    await rm(identityLibraryDir(input.id), { recursive: true, force: true })
    return { ok: true }
  },

  async selectProjectModelIdentity(input: { cloneProjectId: string; identityId: string }) {
    const project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project) throw new Error('复刻项目不存在')
    await syncProjectSelectedIdentity(project, input.identityId)
    const saved = await cloneRepo.upsertProject(project)
    await dispatchBackgroundAutoRunIfReady(this, saved.id, 'after_select_model_identity')
    return saved
  },

  async exportFinalVideos(input: { cloneProjectIds: string[]; outputDir: string }) {
    const cloneProjectIds = Array.isArray(input.cloneProjectIds)
      ? input.cloneProjectIds.map((item) => String(item || '').trim()).filter(Boolean)
      : []
    const outputDir = String(input.outputDir || '').trim()
    if (!cloneProjectIds.length) throw new Error('请选择至少一个任务')
    if (!outputDir) throw new Error('导出目录不能为空')

    await mkdir(outputDir, { recursive: true })

    const exported: Array<{ cloneProjectId: string; title: string; sourcePath: string; targetPath: string }> = []
    const skipped: Array<{ cloneProjectId: string; title: string; reason: string }> = []

    for (const cloneProjectId of cloneProjectIds) {
      const project = await cloneRepo.getProject(cloneProjectId)
      if (!project) {
        skipped.push({ cloneProjectId, title: cloneProjectId, reason: '任务不存在' })
        continue
      }

      const sourcePath = String(project.finalCompose?.outputPath || '').trim()
      if (!sourcePath) {
        skipped.push({ cloneProjectId, title: project.title || cloneProjectId, reason: '暂无成片可导出' })
        continue
      }
      if (!(await fileExists(sourcePath))) {
        skipped.push({ cloneProjectId, title: project.title || cloneProjectId, reason: '成片文件不存在' })
        continue
      }

      const targetPath = await ensureUniqueExportPath(outputDir, basename(sourcePath))
      await copyFile(sourcePath, targetPath)
      exported.push({
        cloneProjectId,
        title: project.title || cloneProjectId,
        sourcePath,
        targetPath,
      })
    }

    return {
      outputDir,
      exported,
      skipped,
      total: cloneProjectIds.length,
    }
  },

  async removeProject(input: { cloneProjectId: string }) {
    return await cloneRepo.removeProject(input.cloneProjectId)
  },

  async getModelCredentials() {
    return await cloneRepo.getCredentials()
  },

  async setModelCredentials(input: ModelCredentials) {
    return await cloneRepo.setCredentials(input)
  },

  async getRuntimeOptions() {
    return await cloneRepo.getRuntimeOptions()
  },

  async setRuntimeOptions(input: { storyboardFrameConcurrency?: number; globalStoryboardFrameConcurrency?: number }) {
    return await cloneRepo.setRuntimeOptions(input)
  },

  async getGrsAiCredits() {
    const creds = await cloneRepo.getCredentials()
    return await queryGrsCredits(creds)
  },

  async updateShot(input: {
    cloneProjectId: string
    shotId: string
    sourceMode?: ShotSourceMode
    uploadedAssetIds?: string[]
    aiEnabled?: boolean
    promptOverrides?: Partial<ShotSpec['prompt']>
    reviewStatus?: CloneReviewStatus
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目或蓝图不存在')
    const shots = item.blueprint.shots.map((x) =>
      x.id === input.shotId
        ? patchShot(x, {
            sourceMode: input.sourceMode,
            uploadedAssetIds: input.uploadedAssetIds,
            aiEnabled: input.aiEnabled,
            promptOverrides: input.promptOverrides,
            reviewStatus: input.reviewStatus,
          })
        : x,
    )
    item.blueprint = { ...item.blueprint, shots }
    item.baseBlueprint = item.baseBlueprint ?? item.blueprint
    item.status = shots.every((x) => x.sourceMode !== 'pending' || x.aiEnabled) ? 'materials_ready' : item.status
    return await cloneRepo.upsertProject(item)
  },

  async generateModelIdentityPack(input: {
    cloneProjectId: string
    productType?: CloneProductType
    productPoints?: string
    modelProfileOptions?: import('./types').ModelProfileOptions
    productReferenceImagePaths?: string[]
    modelReferenceImagePaths?: string[]
    purpose?: 'model_library' | 'identity_grid'
    imageProviderPrimary?: ImageProviderName
    openaiApiKey?: string
    openaiImageModel?: string
    openaiImageQuality?: 'low' | 'medium' | 'high'
    klingApiKey?: string
    klingHost?: string
    klingImageModel?: string
    grsaiApiKey?: string
    grsaiHost?: string
    grsaiImageModel?: string
    imageProviderCredentials?: Partial<ModelCredentials>
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('Clone project does not exist')
    const creds = mergeImageProviderOverrides(await cloneRepo.getCredentials(), {
      ...(input.imageProviderCredentials ?? {}),
      imageProviderPrimary: input.imageProviderPrimary ?? input.imageProviderCredentials?.imageProviderPrimary,
      openaiApiKey: input.openaiApiKey ?? input.imageProviderCredentials?.openaiApiKey,
      openaiImageModel: input.openaiImageModel ?? input.imageProviderCredentials?.openaiImageModel,
      openaiImageQuality: input.openaiImageQuality ?? input.imageProviderCredentials?.openaiImageQuality,
      klingApiKey: input.klingApiKey ?? input.imageProviderCredentials?.klingApiKey,
      klingHost: input.klingHost ?? input.imageProviderCredentials?.klingHost,
      klingImageModel: input.klingImageModel ?? input.imageProviderCredentials?.klingImageModel,
      grsaiApiKey: input.grsaiApiKey ?? input.imageProviderCredentials?.grsaiApiKey,
      grsaiHost: input.grsaiHost ?? input.imageProviderCredentials?.grsaiHost,
      grsaiImageModel: input.grsaiImageModel ?? input.imageProviderCredentials?.grsaiImageModel,
    })
    assertImageProviderKey(creds, 'generate model identity pack')

    const productType = resolveProjectIdentityGridProductType(item, input.productType)
    const packId = randomUUID()
    const outDir = identityLibraryDir(packId)
    await mkdir(outDir, { recursive: true })
    const existingLibrary = await cloneRepo.listModelIdentityLibrary()
    const nextName = (() => {
      const used = new Set(existingLibrary.map((x) => String(x.name || '').trim()))
      let i = 1
      while (true) {
        const name = `AI Model ${String(i).padStart(3, '0')}`
        if (!used.has(name)) return name
        i += 1
      }
    })()
    const resolvedProductPoints = String(input.productPoints || '').trim() || buildIdentityGridProductPoints(item, productType)

    if (input.purpose === 'model_library') {
      const modelReferenceImagePaths = (input.modelReferenceImagePaths ?? []).map(String).filter(Boolean)
      const preview = buildModelLibraryPromptPreview({
        productType,
        productPoints: resolvedProductPoints,
        modelProfileOptions: input.modelProfileOptions,
        productReferenceImagePaths: [],
        modelReferenceImagePaths,
      })
      const generated = await generateModelIdentityPackImages({
        credentials: creds,
        outDir,
        productType,
        productPoints: resolvedProductPoints,
        modelProfileOptions: input.modelProfileOptions,
        productReferenceImagePaths: [],
        modelReferenceImagePaths,
        promptMode: 'model_library',
      })
      if (!generated.imagePaths.length) {
        throw new Error(`model identity generation failed: model=${generated.model || imageProviderModel(creds)} no images returned`)
      }
      const doneDescription = [
        'Selected model identity reused for this clone project',
        `${generated.profile.market}, ${generated.profile.gender}, ${generated.profile.ageRange}`,
        `${generated.profile.faceShape || 'oval face shape'}, ${generated.profile.hairStyle}, ${generated.profile.hairColor || 'natural dark black hair color'}`,
        `${generated.profile.skinTone}, ${generated.profile.bodyType || 'slim build'}`,
        `${generated.profile.outfitStyle}, ${generated.profile.mood}`,
        `${generated.profile.sceneStyle}`,
        `${generated.profile.languageStyle || 'Chinese-speaking social-commerce expression style'}`,
        `${generated.profile.cameraPresence || 'natural social-commerce camera presence'}, ${generated.profile.styleBias || 'conversion-focused product demo style'}`,
      ].join('. ')
      await cloneRepo.upsertModelIdentity({
        id: packId,
        createdAt: now(),
        updatedAt: now(),
        status: 'done',
        name: nextName,
        productType,
        market: generated.profile.market,
        gender: generated.profile.gender,
        ageRange: generated.profile.ageRange,
        hairStyle: generated.profile.hairStyle,
        skinTone: generated.profile.skinTone,
        outfitStyle: generated.profile.outfitStyle,
        mood: generated.profile.mood,
        sceneStyle: generated.profile.sceneStyle,
        faceShape: generated.profile.faceShape,
        hairColor: generated.profile.hairColor,
        bodyType: generated.profile.bodyType,
        languageStyle: generated.profile.languageStyle,
        cameraPresence: generated.profile.cameraPresence,
        styleBias: generated.profile.styleBias,
        description: doneDescription || preview.description || '',
        imagePaths: generated.imagePaths,
        coverImagePath: generated.imagePaths[0],
        model: generated.model || imageProviderModel(creds),
      })
      return item
    }

    const modelReferenceImagePaths = Array.from(
      new Set(
        [
          ...(item.selectedModelIdentitySnapshot?.imagePaths ?? []),
          item.selectedModelIdentitySnapshot?.coverImagePath || '',
        ]
          .map(String)
          .filter(Boolean),
      ),
    )
    const productReferenceImagePaths = (input.productReferenceImagePaths ?? []).map(String).filter(Boolean)
    const profile = defaultModelIdentityDescription(productType)
    const promptPreview = buildModelIdentityPackPromptPreview({
      productType,
      productPoints: resolvedProductPoints,
      modelProfileOptions: input.modelProfileOptions,
      productReferenceImagePaths,
      modelReferenceImagePaths,
    })
    const requestPreview = buildShotImageRequestPreview({
      credentials: creds,
      startPrompt: promptPreview.prompt || '',
      negativePrompt: '',
      startRefs: [...productReferenceImagePaths, ...modelReferenceImagePaths],
    })
    const pendingPack: ModelIdentityPack = {
      id: packId,
      createdAt: now(),
      updatedAt: now(),
      status: 'generating',
      confirmed: false,
      productType,
      ...profile,
      description: '',
      imagePaths: [],
      model: imageProviderModel(creds),
    }
    pendingPack.description = [
      'Selected model identity reused for this clone project',
      `${pendingPack.market}, ${pendingPack.gender}, ${pendingPack.ageRange}`,
      `${pendingPack.faceShape || 'oval face shape'}, ${pendingPack.hairStyle}, ${pendingPack.hairColor || 'natural dark black hair color'}`,
      `${pendingPack.skinTone}, ${pendingPack.bodyType || 'slim build'}`,
      `${pendingPack.outfitStyle}, ${pendingPack.mood}`,
      `${pendingPack.sceneStyle}`,
      `${pendingPack.languageStyle || 'Chinese-speaking social-commerce expression style'}`,
      `${pendingPack.cameraPresence || 'natural social-commerce camera presence'}, ${pendingPack.styleBias || 'conversion-focused product demo style'}`,
    ].join('. ')
    item.projectIdentityGridStatus = 'generating'
    item.projectIdentityGridPath = undefined
    item.projectIdentityGridUpdatedAt = now()
    item.projectIdentityGridPromptPreview = {
      ...promptPreview,
      gridUsagePlan: buildIdentityGridUsagePlan(productType),
      requestProvider: requestPreview.requestProvider,
      requestModel: requestPreview.requestModel,
      requestJson: requestPreview.requestJsonStart,
    }
    await cloneRepo.upsertProject(item)
    try {
      const generated = await generateModelIdentityPackImages({
        credentials: creds,
        outDir,
        productType,
        productPoints: resolvedProductPoints,
        modelProfileOptions: input.modelProfileOptions,
        productReferenceImagePaths,
        modelReferenceImagePaths,
        promptMode: 'identity_grid',
        onImageGenerated: async (filePath) => {
          const latest = await cloneRepo.getProject(input.cloneProjectId)
          if (!latest) return
          latest.projectIdentityGridPath = filePath
          latest.projectIdentityGridStatus = 'generating'
          latest.projectIdentityGridUpdatedAt = now()
          await cloneRepo.upsertProject(latest)
        },
      })
      const doneDescription = [
        'Selected model identity reused for this clone project',
        `${generated.profile.market}, ${generated.profile.gender}, ${generated.profile.ageRange}`,
        `${generated.profile.faceShape || 'oval face shape'}, ${generated.profile.hairStyle}, ${generated.profile.hairColor || 'natural dark black hair color'}`,
        `${generated.profile.skinTone}, ${generated.profile.bodyType || 'slim build'}`,
        `${generated.profile.outfitStyle}, ${generated.profile.mood}`,
        `${generated.profile.sceneStyle}`,
        `${generated.profile.languageStyle || 'Chinese-speaking social-commerce expression style'}`,
        `${generated.profile.cameraPresence || 'natural social-commerce camera presence'}, ${generated.profile.styleBias || 'conversion-focused product demo style'}`,
      ].join('. ')
      if (!generated.imagePaths.length) {
        throw new Error(`AI model identity pack generation failed: model=${generated.model || pendingPack.model} no images returned`)
      }
      const latest = await cloneRepo.getProject(input.cloneProjectId)
      if (!latest) throw new Error('Clone project does not exist')
      latest.projectIdentityGridPath = generated.imagePaths[0]
      latest.projectIdentityGridStatus = 'done'
      latest.projectIdentityGridUpdatedAt = now()
      latest.projectIdentityGridPromptPreview = {
        ...promptPreview,
        profile: { ...generated.profile },
        description: doneDescription,
        productType,
        productPoints: resolvedProductPoints,
        productReferenceImageCount: productReferenceImagePaths.length,
        productReferenceImagePaths,
        modelReferenceImageCount: modelReferenceImagePaths.length,
        modelReferenceImagePaths,
        gridUsagePlan: buildIdentityGridUsagePlan(productType),
        requestProvider: requestPreview.requestProvider,
        requestModel: requestPreview.requestModel,
        requestJson: requestPreview.requestJsonStart,
      }
      return await cloneRepo.upsertProject(latest)
    } catch (e) {
      const friendlyMessage = humanizeModelPackError(e, creds)
      const latest = await cloneRepo.getProject(input.cloneProjectId)
      if (!latest) throw e
      latest.projectIdentityGridPath = undefined
      latest.projectIdentityGridStatus = 'failed'
      latest.projectIdentityGridUpdatedAt = now()
      await cloneRepo.upsertProject(latest)
      throw new Error(friendlyMessage)
    }
  },

  async getModelIdentityPromptPreview(input: {
    cloneProjectId: string
    productType?: CloneProductType
    productPoints?: string
    modelProfileOptions?: import('./types').ModelProfileOptions
    productReferenceImagePaths?: string[]
    modelReferenceImagePaths?: string[]
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    const productType = resolveProjectIdentityGridProductType(item, input.productType)
    const resolvedProductPoints = String(input.productPoints || '').trim() || buildIdentityGridProductPoints(item, productType)
    return buildModelLibraryPromptPreview({
      productType,
      productPoints: resolvedProductPoints,
      modelProfileOptions: input.modelProfileOptions,
      productReferenceImagePaths: [],
      modelReferenceImagePaths: (input.modelReferenceImagePaths ?? []).map(String).filter(Boolean),
    })
  },

  async getProjectIdentityGridPromptPreview(input: {
    cloneProjectId: string
    productType?: CloneProductType
    productPoints?: string
    modelProfileOptions?: import('./types').ModelProfileOptions
    productReferenceImagePaths?: string[]
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('Clone project does not exist')
    const productType = resolveProjectIdentityGridProductType(item, input.productType)
    const productReferenceImagePaths = (input.productReferenceImagePaths ?? collectProjectProductReferenceImages(item)).map(String).filter(Boolean)
    const modelReferenceImagePaths = Array.from(
      new Set(
        [
          ...(item.selectedModelIdentitySnapshot?.imagePaths ?? []),
          item.selectedModelIdentitySnapshot?.coverImagePath || '',
        ]
          .map(String)
          .filter(Boolean),
      ),
    )
    const resolvedProductPoints = String(input.productPoints || '').trim() || buildIdentityGridProductPoints(item, productType)
    const preview = buildModelIdentityPackPromptPreview({
      productType,
      productPoints: resolvedProductPoints,
      modelProfileOptions: input.modelProfileOptions,
      productReferenceImagePaths,
      modelReferenceImagePaths,
    })
    const creds = await cloneRepo.getCredentials()
    const requestPreview = buildShotImageRequestPreview({
      credentials: creds,
      startPrompt: preview.prompt || '',
      negativePrompt: '',
      startRefs: [...productReferenceImagePaths, ...modelReferenceImagePaths],
    })
    const result = {
      ...preview,
      gridUsagePlan: buildIdentityGridUsagePlan(productType),
      requestProvider: requestPreview.requestProvider,
      requestModel: requestPreview.requestModel,
      requestJson: requestPreview.requestJsonStart,
    }
    item.projectIdentityGridPromptPreview = result
    item.projectIdentityGridUpdatedAt = now()
    await cloneRepo.upsertProject(item)
    return result
  },

  async selectModelIdentityPack(input: {
    cloneProjectId: string
    packId: string
    confirmed?: boolean
  }) {
    return await this.selectProjectModelIdentity({ cloneProjectId: input.cloneProjectId, identityId: input.packId })
  },

  async uploadShotAssets(input: {
    cloneProjectId: string
    shotId: string
    targetProductId: string
    filePaths: string[]
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目或蓝图不存在')
    let product = (await productsRepo.list()).find((x) => x.id === input.targetProductId)
    if (!product) throw new Error('目标商品不存在')
    const shotBlueprint = item.blueprint
    const shot = shotBlueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    const paths = (input.filePaths ?? []).map((x) => String(x).trim()).filter(Boolean)
    if (!paths.length) throw new Error('未选择素材文件')
    const segment = segmentKeyByPurpose(shot.purpose)
    const boundIds: string[] = [...(shot.uploadedAssetIds ?? [])]
    for (const p of paths) {
      const appended = await upsertAssetToProduct({ product, segment, filePath: p })
      product = appended.product
      boundIds.push(appended.asset.id)
    }
    item.blueprint = {
      ...item.blueprint,
      shots: item.blueprint.shots.map((s) =>
        s.id === shot.id ? { ...s, sourceMode: 'uploaded', uploadedAssetIds: Array.from(new Set(boundIds)) } : s,
      ),
    }
    return await cloneRepo.upsertProject(item)
  },

  async updateShotEnhanced(input: {
    cloneProjectId: string
    shotId: string
    replaceMode?: ShotSpec['replaceMode']
    uploadedAssetPath?: string
    uploadedImagePath?: string
    aiPrompt?: string
    negativePrompt?: string
    locked?: boolean
    qualityMode?: CloneQualityMode
    productType?: CloneProductType
    cloneEligible?: boolean
    filterReason?: string
    cloneClass?: ShotSpec['cloneClass']
    productMainImage?: string
    productDetailImages?: string[]
    productUsageImages?: string[]
    styleReferenceImages?: string[]
    forceAi?: boolean
    scriptText?: string
    scriptRole?: ShotSpec['scriptRole']
    narrationText?: string
    onScreenText?: string
    visualDescription?: string
    actionDescription?: string
    cameraDescription?: string
    productFocus?: string
    generationPrompt?: string
    scriptConfidence?: number
    analysisNotes?: string[]
    durationSec?: number
    cameraMovement?: string
    visual?: string
    subtitleSuggestion?: string
    materialNeed?: string
    promptHint?: string
    sceneDescription?: ShotSpec['sceneDescription']
    emotionDescription?: ShotSpec['emotionDescription']
    action?: string
    order?: number
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('澶嶅埢椤圭洰鎴栬摑鍥句笉瀛樺湪')
    const currentShot = item.blueprint.shots.find((shot) => shot.id === input.shotId)
    if (!currentShot) throw new Error('分镜不存在')
    item.blueprint = {
      ...item.blueprint,
      shots: item.blueprint.shots.map((s) =>
        s.id === input.shotId
          ? {
              ...s,
              replaceMode: input.replaceMode ?? s.replaceMode,
              uploadedAssetPath: input.uploadedAssetPath ?? s.uploadedAssetPath,
              uploadedImagePath: input.uploadedImagePath ?? s.uploadedImagePath,
              aiPrompt: input.aiPrompt ?? s.aiPrompt,
              negativePrompt: input.negativePrompt ?? s.negativePrompt,
              locked: typeof input.locked === 'boolean' ? input.locked : s.locked,
              cloneEligible: typeof input.cloneEligible === 'boolean' ? input.cloneEligible : s.cloneEligible,
              filterReason: typeof input.filterReason === 'string' ? input.filterReason : s.filterReason,
              cloneClass: input.cloneClass ?? s.cloneClass,
              qualityMode: input.qualityMode ? normalizeQualityMode(input.qualityMode) : s.qualityMode,
              productType: input.productType ? normalizeProductType(input.productType) : s.productType,
              productMainImage: input.productMainImage ?? s.productMainImage,
              productDetailImages: input.productDetailImages ?? s.productDetailImages,
              productUsageImages: input.productUsageImages ?? s.productUsageImages,
              styleReferenceImages: input.styleReferenceImages ?? s.styleReferenceImages,
              scriptText: input.scriptText ?? s.scriptText,
              scriptRole: input.scriptRole ?? s.scriptRole,
              narrationText: input.narrationText ?? s.narrationText,
              onScreenText: input.onScreenText ?? s.onScreenText,
              visualDescription: input.visualDescription ?? s.visualDescription,
              actionDescription: input.actionDescription ?? s.actionDescription,
              cameraDescription: input.cameraDescription ?? s.cameraDescription,
              cameraMovement: input.cameraMovement ?? s.cameraMovement,
              productFocus: input.productFocus ?? s.productFocus,
              generationPrompt: input.generationPrompt ?? s.generationPrompt,
              scriptConfidence: typeof input.scriptConfidence === 'number' ? input.scriptConfidence : s.scriptConfidence,
              analysisNotes: input.analysisNotes ?? s.analysisNotes,
              durationSec: typeof input.durationSec === 'number' ? Math.max(1, Number(input.durationSec)) : s.durationSec,
              visual: input.visual ?? s.visual,
              subtitleSuggestion: input.subtitleSuggestion ?? s.subtitleSuggestion,
              materialNeed: input.materialNeed ?? s.materialNeed,
              promptHint: input.promptHint ?? s.promptHint,
              sceneDescription: input.sceneDescription ?? s.sceneDescription,
              emotionDescription: input.emotionDescription ?? s.emotionDescription,
              action: input.action ?? s.action,
              productReferenceImagePaths:
                input.productMainImage || input.productDetailImages || input.productUsageImages || input.styleReferenceImages
                  ? [
                      input.productMainImage,
                      ...(input.productDetailImages ?? []),
                      ...(input.productUsageImages ?? []),
                      ...(input.styleReferenceImages ?? []),
                    ].filter(Boolean).map(String)
                  : s.productReferenceImagePaths,
              forceAi: typeof input.forceAi === 'boolean' ? input.forceAi : s.forceAi,
              qualityStatus: input.uploadedAssetPath ? 'passed' : input.uploadedImagePath ? 'unchecked' : s.qualityStatus,
              qualityReasons: input.uploadedAssetPath ? [] : s.qualityReasons,
              retryCount: input.uploadedAssetPath || input.uploadedImagePath ? 0 : s.retryCount,
              isMock: input.uploadedAssetPath ? false : s.isMock,
              status: (input.uploadedAssetPath || input.uploadedImagePath || s.generatedClipPath) ? 'ready' : s.status,
            }
          : s,
      ),
    }
    if (typeof input.order === 'number') {
      const targetOrder = Math.max(0, Math.min(item.blueprint.shots.length - 1, Math.floor(input.order)))
      const nextShots = [...item.blueprint.shots]
      const fromIndex = nextShots.findIndex((shot) => shot.id === input.shotId)
      const [moved] = nextShots.splice(fromIndex, 1)
      nextShots.splice(targetOrder, 0, moved)
      item.blueprint.shots = nextShots.map((shot, index) => ({ ...shot, index }))
    }
    if (item.baseBlueprint) {
      const updatedById = new Map(item.blueprint.shots.map((s) => [s.id, s]))
      item.baseBlueprint = {
        ...item.baseBlueprint,
        shots: item.baseBlueprint.shots.map((s) => (updatedById.has(s.id) ? { ...s, ...updatedById.get(s.id)! } : s)),
      }
    }
    if (item.executionBlueprint) {
      const updatedById = new Map(item.blueprint.shots.map((s) => [s.id, s]))
      item.executionBlueprint = {
        ...item.executionBlueprint,
        shots: item.executionBlueprint.shots.map((s) => (updatedById.has(s.id) ? { ...s, ...updatedById.get(s.id)! } : s)),
      }
    }
    if (typeof input.order === 'number') {
      const shotIds = item.blueprint.shots.map((shot) => shot.id)
      reorderProjectCollections(item, shotIds)
    }
    return await cloneRepo.upsertProject(item)
  },

  async updateProjectWorkflowStep(input: { cloneProjectId: string; currentStep: CloneWorkflowV2Step }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    const workflow = item.workflowV2 ?? defaultWorkflowV2()
    item.workflowV2 = {
      ...workflow,
      currentStep: input.currentStep,
      stepStatus: {
        ...workflow.stepStatus,
        [input.currentStep]: {
          ...workflow.stepStatus[input.currentStep],
          updatedAt: now(),
        },
      },
      updatedAt: now(),
    }
    return await cloneRepo.upsertProject(item)
  },

  async reorderProjectShots(input: { cloneProjectId: string; shotIds: string[] }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目或蓝图不存在')
    const existingShots = projectBlueprintShots(item)
    const existingIds = new Set(existingShots.map((shot) => shot.id))
    const normalized = input.shotIds.map((shotId) => String(shotId || '').trim()).filter(Boolean)
    if (!normalized.length) throw new Error('镜头顺序不能为空')
    if (normalized.length !== existingShots.length || normalized.some((shotId) => !existingIds.has(shotId))) {
      throw new Error('镜头顺序数据不完整')
    }
    const orderMap = new Map(normalized.map((shotId, index) => [shotId, index]))
    const reorderShots = (shots: ShotSpec[]) =>
      [...shots]
        .sort((a, b) => (orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER))
        .map((shot, index) => ({ ...shot, index }))
    if (item.blueprint) item.blueprint = { ...item.blueprint, shots: reorderShots(item.blueprint.shots) }
    if (item.baseBlueprint) item.baseBlueprint = { ...item.baseBlueprint, shots: reorderShots(item.baseBlueprint.shots) }
    if (item.executionBlueprint) item.executionBlueprint = { ...item.executionBlueprint, shots: reorderShots(item.executionBlueprint.shots) }
    reorderProjectCollections(item, normalized)
    syncProjectBlueprintLayers(item)
    return await cloneRepo.upsertProject(item)
  },

  async createProjectShot(input: { cloneProjectId: string; afterShotId?: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目或蓝图不存在')
    const shots = [...projectBlueprintShots(item)]
    const insertAt = input.afterShotId
      ? Math.max(0, shots.findIndex((shot) => shot.id === input.afterShotId) + 1)
      : shots.length
    const prevShot = shots[Math.max(0, insertAt - 1)]
    const nextShot = shots[insertAt]
    const startSec = Number(prevShot?.endSec ?? prevShot?.startSec ?? 0)
    const durationSec = Math.max(2, Number(prevShot?.durationSec ?? 3))
    const newShot: ShotSpec = {
      id: randomUUID(),
      index: insertAt,
      purpose: prevShot?.purpose ?? nextShot?.purpose ?? 'solution',
      startSec,
      endSec: startSec + durationSec,
      durationSec,
      scriptText: '',
      scriptRole: prevShot?.scriptRole ?? nextShot?.scriptRole ?? 'show',
      visualDescription: '',
      actionDescription: '',
      cameraDescription: '',
      productFocus: '',
      generationPrompt: '',
      scriptConfidence: 0,
      visual: '',
      subtitleSuggestion: '',
      materialNeed: '',
      sourceMode: 'pending',
      uploadedAssetIds: [],
      aiEnabled: true,
      prompt: {
        positive: '',
        negative: '',
        cameraMotion: '',
        aspectRatio: '9:16',
      },
      reviewStatus: 'pending',
      locked: false,
      status: 'empty',
    }
    shots.splice(insertAt, 0, newShot)
    const nextShots = shots.map((shot, index) => ({ ...shot, index }))
    if (item.blueprint) item.blueprint = { ...item.blueprint, shots: nextShots }
    if (item.baseBlueprint) item.baseBlueprint = { ...item.baseBlueprint, shots: nextShots }
    if (item.executionBlueprint) item.executionBlueprint = { ...item.executionBlueprint, shots: nextShots }
    reorderProjectCollections(item, nextShots.map((shot) => shot.id))
    syncProjectBlueprintLayers(item)
    return await cloneRepo.upsertProject(item)
  },

  async removeProjectShot(input: { cloneProjectId: string; shotId: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目或蓝图不存在')
    const currentShots = projectBlueprintShots(item)
    if (currentShots.length <= 1) throw new Error('至少保留一个镜头')
    const nextShots = currentShots
      .filter((shot) => shot.id !== input.shotId)
      .map((shot, index) => ({ ...shot, index }))
    if (nextShots.length === currentShots.length) throw new Error('分镜不存在')
    if (item.blueprint) item.blueprint = { ...item.blueprint, shots: nextShots }
    if (item.baseBlueprint) item.baseBlueprint = { ...item.baseBlueprint, shots: nextShots }
    if (item.executionBlueprint) item.executionBlueprint = { ...item.executionBlueprint, shots: nextShots }
    item.storyboardFrames = (item.storyboardFrames ?? []).filter((frame) => frame.shotId !== input.shotId)
    item.shotVideoOutputs = (item.shotVideoOutputs ?? []).filter((output) => output.shotId !== input.shotId)
    reorderProjectCollections(item, nextShots.map((shot) => shot.id))
    syncProjectBlueprintLayers(item)
    return await cloneRepo.upsertProject(item)
  },

  async generateShotVariants(input: {
    cloneProjectId: string
    shotIds?: string[]
    targetProductId?: string
    variantsPerShot?: number
    strategy?: 'balanced' | 'low_cost' | 'high_conversion' | 'anti_duplicate'
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    const creds = await cloneRepo.getCredentials()
    const targetIds = new Set((input.shotIds ?? item.baseBlueprint.shots.map((s) => s.id)).map(String))
    const variantsPerShot = Math.max(1, Math.min(12, Math.floor(Number(input.variantsPerShot ?? 5))))
    const nextVariants: Record<string, ShotVariant[]> = { ...(item.baseBlueprint.variants ?? {}) }
    const targets = item.baseBlueprint.shots.filter((shot) => targetIds.has(shot.id))
    const variantWarnings: string[] = []
    const generatedList = await mapWithConcurrency(targets, item.policy.concurrency, async (shot) => {
      try {
        const generated = await generateShotVariantsWithAi({
          credentials: creds,
          shot,
          variantsPerShot,
          strategy: input.strategy ?? 'balanced',
          targetMarket: item.locale,
          productCategory: shot.productType,
          productInfo: shot.productFocus,
        })
        return { shotId: shot.id, generated }
      } catch (error: any) {
        const reason = String(error?.message ?? error)
        variantWarnings.push(`分镜 #${Number(shot.index || 0) + 1} 变体生成降级：${reason}`)
        return {
          shotId: shot.id,
          generated: createLocalShotVariants(shot, Math.min(variantsPerShot, 4)),
        }
      }
    })
    for (const row of generatedList) nextVariants[row.shotId] = row.generated
    item.baseBlueprint = { ...item.baseBlueprint, variants: nextVariants }
    item.blueprint = item.blueprint ? { ...item.blueprint, variants: nextVariants } : item.baseBlueprint
    if (variantWarnings.length) {
      item.lastError = variantWarnings.slice(0, 4).join('；')
    }
    return await cloneRepo.upsertProject(item)
  },

  async scoreShotVariants(input: {
    cloneProjectId: string
    shotIds?: string[]
    targetProductId?: string
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    const creds = await cloneRepo.getCredentials()
    const targetIds = new Set((input.shotIds ?? item.baseBlueprint.shots.map((s) => s.id)).map(String))
    const variants = item.baseBlueprint.variants ?? {}
    const nextScores: Record<string, ShotVariantScore[]> = { ...(item.baseBlueprint.variantScores ?? {}) }
    const nextVariants: Record<string, ShotVariant[]> = { ...variants }
    const targets = item.baseBlueprint.shots.filter((shot) => targetIds.has(shot.id))
    const scoreWarnings: string[] = []
    const scoredList = await mapWithConcurrency(targets, item.policy.concurrency, async (shot) => {
      const list = variants[shot.id] ?? []
      if (!list.length) return { shotId: shot.id, scored: [] as ShotVariantScore[], topSet: new Set<string>() }
      try {
        const scored = await scoreShotVariantsWithAi({ credentials: creds, shot, variants: list, targetProductId: input.targetProductId })
        const scoreById = new Map(scored.map((s) => [s.variantId, s]))
        const top = [...list]
          .sort((a, b) => (scoreById.get(b.id)?.totalScore || 0) - (scoreById.get(a.id)?.totalScore || 0))
          .slice(0, 2)
        return { shotId: shot.id, scored, topSet: new Set(top.map((x) => x.id)) }
      } catch (error: any) {
        const reason = String(error?.message ?? error)
        scoreWarnings.push(`分镜 #${Number(shot.index || 0) + 1} 评分降级：${reason}`)
        const scored = createLocalVariantScores(shot, list)
        const scoreById = new Map(scored.map((s) => [s.variantId, s]))
        const top = [...list]
          .sort((a, b) => (scoreById.get(b.id)?.totalScore || 0) - (scoreById.get(a.id)?.totalScore || 0))
          .slice(0, 2)
        return { shotId: shot.id, scored, topSet: new Set(top.map((x) => x.id)) }
      }
    })
    for (const row of scoredList) {
      nextScores[row.shotId] = row.scored
      const list = variants[row.shotId] ?? []
      nextVariants[row.shotId] = list.map((v) => ({ ...v, isSelected: row.topSet.has(v.id) }))
    }
    item.baseBlueprint = { ...item.baseBlueprint, variants: nextVariants, variantScores: nextScores }
    item.blueprint = item.blueprint ? { ...item.blueprint, variants: nextVariants, variantScores: nextScores } : item.baseBlueprint
    if (scoreWarnings.length) {
      item.lastError = [String(item.lastError || '').trim(), scoreWarnings.slice(0, 4).join('；')].filter(Boolean).join('；')
    }
    return await cloneRepo.upsertProject(item)
  },

  async buildVideoPlans(input: {
    cloneProjectId: string
    targetProductId?: string
    planCount?: number
    maxVideosToGenerate?: number
    strategy?: 'balanced' | 'hook_first' | 'conversion_first' | 'anti_duplicate'
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    const plans = buildVideoPlans({
      cloneProjectId: item.id,
      shots: item.baseBlueprint.shots,
      variants: item.baseBlueprint.variants ?? {},
      variantScores: item.baseBlueprint.variantScores ?? {},
      targetProductId: input.targetProductId,
      planCount: Math.max(10, Math.min(20, Math.floor(Number(input.planCount ?? 12)))),
      maxVideosToGenerate: Math.max(1, Math.min(5, Math.floor(Number(input.maxVideosToGenerate ?? 3)))),
      strategy: input.strategy ?? 'balanced',
    })
    item.baseBlueprint = { ...item.baseBlueprint, videoPlans: plans }
    item.blueprint = item.blueprint ? { ...item.blueprint, videoPlans: plans } : item.baseBlueprint
    return await cloneRepo.upsertProject(item)
  },

  async buildScriptCandidates(input: {
    cloneProjectId: string
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    patchWorkflowV2(item, 'reference_analysis', 'reference_analysis', 'running')
    const scriptCandidates = buildScriptCandidatesFromBlueprint(item)
    item.baseBlueprint = { ...item.baseBlueprint, scriptCandidates }
    item.blueprint = item.blueprint ? { ...item.blueprint, scriptCandidates } : item.baseBlueprint
    patchWorkflowV2(item, 'reference_analysis', 'reference_analysis', 'done')
    return await cloneRepo.upsertProject(item)
  },

  async generateConsistencyAssets(input: {
    cloneProjectId: string
    productType?: CloneProductType
    productPoints?: string
    productReferenceImagePaths?: string[]
    generateModelPack?: boolean
    forceRegenerateModelPack?: boolean
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    patchWorkflowV2(item, 'identity_grid', 'identity_grid', 'running')
    const requestedRefs = (input.productReferenceImagePaths ?? [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
    const refs = requestedRefs.length ? requestedRefs : analysisProductRefs(item)
    const primaryRefs = storyboardPrimaryProductRefs(item)
    if (!refs.length) throw new Error('请先上传商品图')
    if (item.blueprint?.shots?.length) {
      item.blueprint = {
        ...item.blueprint,
        shots: item.blueprint.shots.map((shot) => replaceProductRefsIntoShotWithTracking(shot, primaryRefs.length ? primaryRefs : refs, refs)),
      }
    }
    if (item.baseBlueprint?.shots?.length) {
      item.baseBlueprint = {
        ...item.baseBlueprint,
        shots: item.baseBlueprint.shots.map((shot) => replaceProductRefsIntoShotWithTracking(shot, primaryRefs.length ? primaryRefs : refs, refs)),
      }
    }
    if (item.executionBlueprint?.shots?.length) {
      item.executionBlueprint = {
        ...item.executionBlueprint,
        shots: item.executionBlueprint.shots.map((shot) => replaceProductRefsIntoShotWithTracking(shot, primaryRefs.length ? primaryRefs : refs, refs)),
      }
    }
    let snapshotProject = item
    const existingIdentityGridPath = String(item.projectIdentityGridPath || '').trim()
    const reusable = !input.forceRegenerateModelPack && Boolean(existingIdentityGridPath)
    const shouldGenerateIdentityPack = Boolean(input.generateModelPack) && !reusable
    if (shouldGenerateIdentityPack) {
      const next = await this.generateModelIdentityPack({
        cloneProjectId: input.cloneProjectId,
        productType: input.productType,
        productPoints: input.productPoints,
        productReferenceImagePaths: primaryRefs.length ? primaryRefs : refs,
      })
      snapshotProject = next as CloneProject
      if (refs.length) {
        snapshotProject = updateProjectShots(
          snapshotProject,
          (shot) => replaceProductRefsIntoShotWithTracking(shot, primaryRefs.length ? primaryRefs : refs, refs),
        )
      }
    }
    const selectedPackId = snapshotProject.selectedModelIdentityPackId || snapshotProject.selectedModelIdentityId
    const generatedGridPath = String(snapshotProject.projectIdentityGridPath || '').trim()
    if (shouldGenerateIdentityPack) {
      const generatedCount = generatedGridPath ? 1 : 0
      if (!generatedCount) {
        throw new Error('一致性素材生成未产出任何模特图，请检查图片模型配置、产品参考图和 provider/model 参数后重试')
      }
    }
    const resolvedProductType = normalizeProductType(input.productType ?? snapshotProject.baseBlueprint?.productCategory)
    const consistencyAssets = {
      modelPackId: selectedPackId,
      productImageSetIds: (primaryRefs.length ? primaryRefs : refs).map((p) => basename(p)),
      referenceImages: primaryRefs.length ? primaryRefs : refs,
      modelReferenceImages: generatedGridPath ? [generatedGridPath] : [],
      productReferenceImages: primaryRefs.length ? primaryRefs : refs,
      originalProductReferenceImages: item.originalProductReferenceImagePaths ?? [],
      sanitizedProductReferenceImages: refs,
      productImageSanitization: {
        status: (item.productImageSanitizationStatus === 'failed' ? 'failed' : 'done') as 'failed' | 'done',
        originalPaths: item.originalProductReferenceImagePaths ?? [],
        sanitizedPaths: refs,
        failedPaths: [],
        diagnostics: item.baseBlueprint?.consistencyAssets?.productImageSanitization?.diagnostics ?? [],
        error: item.productImageSanitizationError,
        updatedAt: now(),
      },
      productAnalysis: refs.length ? snapshotProject.baseBlueprint?.consistencyAssets?.productAnalysis : undefined,
      status: (shouldGenerateIdentityPack ? 'generated' : 'saved') as 'generated' | 'saved',
      provider: snapshotProject.projectIdentityGridPromptPreview?.requestModel || snapshotProject.projectIdentityGridPromptPreview?.requestProvider,
      updatedAt: now(),
    }
    snapshotProject.baseBlueprint = {
      ...(snapshotProject.baseBlueprint || item.baseBlueprint),
      consistencyAssets,
    }
    snapshotProject.productReferenceImagePaths = refs
    snapshotProject.blueprint = snapshotProject.blueprint
      ? { ...snapshotProject.blueprint, consistencyAssets }
      : snapshotProject.baseBlueprint
    snapshotProject.projectIdentityGridStatus = snapshotProject.projectIdentityGridPath ? 'done' : 'idle'
    snapshotProject.projectIdentityGridUpdatedAt = now()
    patchWorkflowV2(snapshotProject, 'identity_grid', 'identity_grid', 'done')
    console.log('[clone-debug] prepare-materials-saved', {
      cloneProjectId: snapshotProject.id,
      refs,
      savedRefs: consistencyAssets.productReferenceImages ?? [],
      shotRefs: (snapshotProject.baseBlueprint?.shots ?? []).slice(0, 3).map((shot) => ({
        id: shot.id,
        refs: shot.productReferenceImagePaths ?? [],
      })),
    })
    const savedProject = await cloneRepo.upsertProject(snapshotProject)
    if (refs.length) {
      void (async () => {
        try {
          const analyzed = await analyzeProductStructureWithGrs({
            credentials: await cloneRepo.getCredentials(),
            productReferenceImagePaths: refs,
            productCategory: resolvedProductType,
            locale: savedProject.locale,
          })
          const latest = await cloneRepo.getProject(savedProject.id)
          if (!latest?.baseBlueprint) return
          const latestConsistencyAssets = {
            ...(latest.baseBlueprint.consistencyAssets ?? {}),
            productReferenceImages: primaryRefs.length ? primaryRefs : refs,
            productAnalysis: {
              ...analyzed,
              updatedAt: now(),
            },
            updatedAt: now(),
          }
          latest.baseBlueprint = {
            ...latest.baseBlueprint,
            consistencyAssets: latestConsistencyAssets,
          }
          latest.productReferenceImagePaths = refs
          latest.blueprint = latest.blueprint
            ? { ...latest.blueprint, consistencyAssets: latestConsistencyAssets }
            : latest.baseBlueprint
          await cloneRepo.upsertProject(latest)
          console.log('[clone-debug] product-analysis-saved', {
            cloneProjectId: latest.id,
            refs,
            category: analyzed.category,
          })
        } catch (error: any) {
          const latest = await cloneRepo.getProject(savedProject.id)
          if (!latest) return
          latest.lastError = [
            String(latest.lastError || '').trim(),
            `商品结构分析失败：${String(error?.message ?? error).trim()}`,
          ]
            .filter(Boolean)
            .join('；')
          await cloneRepo.upsertProject(latest)
        }
      })()
    }
    return savedProject
  },

  async runStoryboardAndVideoBatch(input: {
    cloneProjectId: string
    topN?: number
    onlyMissing?: boolean
    variantsPerShot?: number
    productReferenceImagePaths?: string[]
    targetProductId?: string
    previewFirst?: boolean
  }) {
    const topN = Math.max(1, Math.min(5, Math.floor(Number(input.topN ?? 3))))
    const inputRefs = (input.productReferenceImagePaths ?? []).map((x) => String(x || '').trim()).filter(Boolean)
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    if (inputRefs.length && item.blueprint?.shots?.length) {
      item.blueprint = {
        ...item.blueprint,
        shots: item.blueprint.shots.map((shot) => mergeProductRefsIntoShot(shot, inputRefs)),
      }
    }
    if (inputRefs.length && item.baseBlueprint?.shots?.length) {
      item.baseBlueprint = {
        ...item.baseBlueprint,
        shots: item.baseBlueprint.shots.map((shot) => mergeProductRefsIntoShot(shot, inputRefs)),
      }
    }
    const baseBlueprint = item.baseBlueprint
    patchWorkflowV2(item, 'storyboard_videos', 'storyboard_videos', 'running')
    previewPipelinePatch(item, { status: 'running', previewOutputPath: undefined, previewReportPath: undefined, foregroundPlanId: undefined, remainingPlanIds: [], lastError: undefined })
    await cloneRepo.upsertProject(item)
    let current: CloneProject = item
    if (!baseBlueprint.variants || !Object.keys(baseBlueprint.variants).length) {
      current = await this.generateShotVariants({
        cloneProjectId: input.cloneProjectId,
        variantsPerShot: Math.max(1, Math.min(12, Math.floor(Number(input.variantsPerShot ?? 5)))),
        targetProductId: input.targetProductId,
        strategy: 'balanced',
      })
    }
    if (!current.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    if (!current.baseBlueprint.variantScores || !Object.keys(current.baseBlueprint.variantScores).length) {
      current = await this.scoreShotVariants({
        cloneProjectId: input.cloneProjectId,
        targetProductId: input.targetProductId,
      })
    }
    if (!current.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    if (!current.baseBlueprint.videoPlans || !current.baseBlueprint.videoPlans.length) {
      current = await this.buildVideoPlans({
        cloneProjectId: input.cloneProjectId,
        targetProductId: input.targetProductId,
        planCount: 12,
        maxVideosToGenerate: topN,
        strategy: 'balanced',
      })
    }
    if (!current.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    const frameRes = await this.generateAllShotFrames({
      cloneProjectId: input.cloneProjectId,
      onlyMissing: input.onlyMissing !== false,
      productReferenceImagePaths: input.productReferenceImagePaths,
    })
    const latest = (await cloneRepo.getProject(input.cloneProjectId)) || frameRes.project
    if (!latest?.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    const plans = [...(latest.baseBlueprint.videoPlans ?? [])]
      .filter((x) => x.status !== 'rejected')
      .sort((a, b) => Number(b.score?.totalScore || 0) - Number(a.score?.totalScore || 0))
      .slice(0, topN)
    const previewFirst = input.previewFirst !== false
    const primaryPlan = previewFirst ? plans[0] : undefined
    const remainingPlans = previewFirst ? plans.slice(1) : plans.slice()
    const planResults: Array<{ planId: string; status: 'success' | 'failed'; reason?: string; mode?: 'preview' | 'background' }> = []
    let previewOutput = ''
    let previewReportPath = ''
    if (primaryPlan) {
      try {
        await this.generateAiShots({
          cloneProjectId: input.cloneProjectId,
          shotIds: primaryPlan.structure.map((x) => x.shotId),
          videoPlanId: primaryPlan.id,
          qualityProfile: 'high',
        })
        const renderRes = await this.renderPreview({
          cloneProjectId: input.cloneProjectId,
          shotIds: primaryPlan.structure.map((x) => x.shotId),
        })
        previewOutput = String(renderRes.output || '')
        previewReportPath = String(renderRes.reportPath || '')
        const latestAfterPreview = await cloneRepo.getProject(input.cloneProjectId)
        if (latestAfterPreview) {
          previewPipelinePatch(latestAfterPreview, {
            status: remainingPlans.length ? 'background_running' : 'done',
            previewOutputPath: previewOutput || undefined,
            previewReportPath: previewReportPath || undefined,
            foregroundPlanId: primaryPlan.id,
            remainingPlanIds: remainingPlans.map((x) => x.id),
            lastError: undefined,
          })
          await cloneRepo.upsertProject(latestAfterPreview)
        }
        planResults.push({ planId: primaryPlan.id, status: 'success', mode: 'preview' })
      } catch (e: any) {
        const latestAfterPreview = await cloneRepo.getProject(input.cloneProjectId)
        if (latestAfterPreview) {
          previewPipelinePatch(latestAfterPreview, {
            status: 'failed',
            foregroundPlanId: primaryPlan.id,
            remainingPlanIds: remainingPlans.map((x) => x.id),
            lastError: String(e?.message ?? e),
          })
          await cloneRepo.upsertProject(latestAfterPreview)
        }
        planResults.push({ planId: primaryPlan.id, status: 'failed', reason: String(e?.message ?? e), mode: 'preview' })
      }
    }
    if (remainingPlans.length) {
      void (async () => {
        const backgroundResults: Array<{ planId: string; status: 'success' | 'failed'; reason?: string; mode?: 'background' }> = []
        for (const plan of remainingPlans) {
          try {
            await this.generateAiShots({
              cloneProjectId: input.cloneProjectId,
              shotIds: plan.structure.map((x) => x.shotId),
              videoPlanId: plan.id,
              qualityProfile: 'high',
            })
            backgroundResults.push({ planId: plan.id, status: 'success', mode: 'background' })
          } catch (e: any) {
            backgroundResults.push({ planId: plan.id, status: 'failed', reason: String(e?.message ?? e), mode: 'background' })
          }
        }
        const finalBackgroundProject = await cloneRepo.getProject(input.cloneProjectId)
        if (!finalBackgroundProject) return
        const failed = backgroundResults.find((x) => x.status === 'failed')
        previewPipelinePatch(finalBackgroundProject, {
          status: failed ? 'failed' : 'done',
          lastError: failed?.reason,
        })
        patchWorkflowV2(finalBackgroundProject, 'final_compose', 'storyboard_videos', 'done', failed?.reason || '')
        await cloneRepo.upsertProject(finalBackgroundProject)
      })()
    }
    const finalProject = await cloneRepo.getProject(input.cloneProjectId)
    if (!finalProject) throw new Error('复刻项目不存在')
    if (!remainingPlans.length) patchWorkflowV2(finalProject, 'final_compose', 'storyboard_videos', 'done')
    const saved = await cloneRepo.upsertProject(finalProject)
    return {
      project: saved,
      summary: {
        frameQueue: frameRes.queueSummary,
        topPlans: plans.map((p) => p.id),
        previewFirst,
        previewOutput,
        previewReportPath,
        foregroundPlanId: primaryPlan?.id,
        remainingPlanIds: remainingPlans.map((x) => x.id),
        planResults,
      },
    }
  },

  async updateVariantReview(input: {
    cloneProjectId: string
    shotId: string
    variantId: string
    reviewStatus: CloneReviewStatus
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    const variants = { ...(item.baseBlueprint.variants ?? {}) }
    const list = variants[input.shotId] ?? []
    variants[input.shotId] = list.map((v) =>
      v.id === input.variantId
        ? {
            ...v,
            reviewStatus: input.reviewStatus,
            isSelected: input.reviewStatus === 'reject' ? false : v.isSelected,
          }
        : v,
    )
    item.baseBlueprint = { ...item.baseBlueprint, variants }
    item.blueprint = item.blueprint ? { ...item.blueprint, variants } : item.baseBlueprint
    return await cloneRepo.upsertProject(item)
  },

  async updateVideoPlanStatus(input: {
    cloneProjectId: string
    videoPlanId: string
    status: VideoPlan['status']
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    const plans = (item.baseBlueprint.videoPlans ?? []).map((p) =>
      p.id === input.videoPlanId ? { ...p, status: input.status } : p,
    )
    item.baseBlueprint = { ...item.baseBlueprint, videoPlans: plans }
    item.blueprint = item.blueprint ? { ...item.blueprint, videoPlans: plans } : item.baseBlueprint
    return await cloneRepo.upsertProject(item)
  },

  async generateShotFrames(input: {
    cloneProjectId: string
    shotId: string
    productReferenceImagePaths?: string[]
  }) {
    console.log('[clone-debug] generate-shot-frames:requested', {
      projectId: input.cloneProjectId,
      shotId: input.shotId,
      productReferenceImageCount: input.productReferenceImagePaths?.length ?? 0,
    })
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('澶嶅埢椤圭洰鎴栬摑鍥句笉瀛樺湪')
    let shot = item.blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    const shotDir = join(getAppPaths().dataDir, 'viral-clone', item.id, 'shots', shot.id)
    await mkdir(shotDir, { recursive: true })
    const first = join(shotDir, 'first_frame.png')
    const last = join(shotDir, 'last_frame.png')
    const refs = input.productReferenceImagePaths?.length
      ? input.productReferenceImagePaths
      : shot.productReferenceImagePaths ?? []
    const productMainImage = refs[0]
    const productDetailImages: string[] = []
    const productUsageImages: string[] = []
    const styleReferenceImages: string[] = []
    const mergedRefs = [productMainImage].filter(Boolean).map(String)
    console.log('[clone-debug] generate-shot-frames:prepared', {
      projectId: item.id,
      shotId: shot.id,
      productMainImage,
      mergedReferenceImageCount: mergedRefs.length,
    })
    if (!hasProductLock(shot, mergedRefs)) throw new Error('请先上传产品参考图或填写产品锁定信息')
    const productAnalysisText = buildPromptProductDescriptionText(item, normalizeProductType(item.baseBlueprint?.productCategory || shot.productType || 'general'))
    const creds = await cloneRepo.getCredentials()
    console.log('[clone-debug] generate-shot-frames:provider-check', {
      projectId: item.id,
      shotId: shot.id,
      videoProviderPrimary: creds.videoProviderPrimary,
      videoModelPrimary: creds.videoModelPrimary,
      hasCloudVideoKey: hasCloudVideoKey(creds),
    })
    if (!hasCloudVideoKey(creds)) throw new Error(`未配置 ${videoProviderLabel(creds)} API Key，正式生成不能使用本地 mock 或图片拼接`)
    let generatedProvider = ''
    let generatedModel = ''
    let generatedTaskId = ''
    try {
      const frames = await generateShotKeyframesByProviderChain({
        shot: {
          ...shot,
          productReferenceImagePaths: mergedRefs,
          productMainImage,
          productDetailImages,
          productUsageImages,
          styleReferenceImages,
          aiPrompt: buildStructuredShotPrompt({ shot, productType: shot.productType, productPoints: shot.aiPrompt, productAnalysisText }),
          negativePrompt: shot.negativePrompt || defaultQualityNegativePrompt(),
        },
        outDir: shotDir,
        referenceVideoPath: item.referenceVideoPath,
        credentials: creds,
        chain: videoProviderChain(creds) as any,
      })
      console.log('[clone-debug] generate-shot-frames:provider-generated', {
        projectId: item.id,
        shotId: shot.id,
        provider: frames.startFrame.provider,
        model: frames.startFrame.model,
        taskId: frames.startFrame.taskId,
        startFramePath: frames.startFrame.filePath,
        endFramePath: frames.endFrame.filePath,
      })
      generatedProvider = frames.startFrame.provider
      generatedModel = frames.startFrame.model
      generatedTaskId = frames.startFrame.taskId
      await mkdir(shotDir, { recursive: true })
      if (first !== frames.startFrame.filePath) await copyFile(frames.startFrame.filePath, first)
      if (last !== frames.endFrame.filePath) await copyFile(frames.endFrame.filePath, last)
    } catch (e: any) {
      console.log('[clone-debug] generate-shot-frames:failed', {
        projectId: item.id,
        shotId: shot.id,
        message: String(e?.message ?? e ?? ''),
      })
      throw new Error(`${videoProviderLabel(creds)} 首尾帧生成失败: ` + String(e?.message ?? e))
    }
    item.blueprint = {
      ...item.blueprint,
      shots: item.blueprint.shots.map((s) =>
        s.id === shot.id
          ? {
              ...s,
              generatedFirstFramePath: first,
              generatedLastFramePath: last,
              productReferenceImagePaths: mergedRefs,
              productMainImage,
              productDetailImages,
              productUsageImages,
              styleReferenceImages,
              generatedSource: 'cloud',
              generatedProvider,
              generatedModel,
              generatedTaskId,
              qualityStatus: 'unchecked',
              qualityReasons: [],
              status: 'ready',
            }
          : s,
      ),
    }
    return await cloneRepo.upsertProject(item)
  },

  async generateGptShotFrames(input: GenerateGptShotFramesInput) {
    let lastError: unknown = null
    for (let attempt = 0; attempt <= AUTO_CLONE_IMAGE_RETRY_LIMIT; attempt += 1) {
      try {
        const result = await this.generateGptShotFramesInternal(input)
        if (attempt > 0) {
          const latest = await cloneRepo.getProject(input.cloneProjectId)
          if (latest?.blueprint) {
            replaceProjectShot(latest, input.shotId, {
              retryCount: attempt,
              error: '',
              gptFrameError: '',
            })
            return await cloneRepo.upsertProject(latest)
          }
        }
        return result
      } catch (error: any) {
        lastError = error
        const latest = await cloneRepo.getProject(input.cloneProjectId)
        if (latest?.blueprint) {
          const message = String(error?.message ?? error ?? '')
          replaceProjectShot(latest, input.shotId, {
            retryCount: attempt + 1,
            gptFrameStatus: 'failed',
            gptFrameError: message,
            error: message,
            status: 'failed',
            gptFrameConfirmed: false,
          })
          if (Array.isArray(latest.storyboardFrames)) {
            latest.storyboardFrames = latest.storyboardFrames.map((frame) =>
              frame.shotId === input.shotId
                ? {
                    ...frame,
                    status: 'failed',
                    error: message,
                    updatedAt: now(),
                  }
                : frame,
            )
          }
          await cloneRepo.upsertProject(latest)
        }
        if (attempt >= AUTO_CLONE_IMAGE_RETRY_LIMIT) break
      }
    }
    throw lastError
  },

  async generateGptShotFramesInternal(input: GenerateGptShotFramesInput) {
    let item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目或蓝图不存在')
    if (input.forceRegenerate) {
      await clearShotStoryboardArtifacts(input.cloneProjectId, input.shotId)
      item.blueprint = {
        ...item.blueprint,
        shots: item.blueprint.shots.map((s) =>
          s.id === input.shotId
            ? {
                ...s,
                gptFirstFramePath: undefined,
                gptLastFramePath: undefined,
                generatedFirstFramePath: undefined,
                generatedLastFramePath: undefined,
                generatedTaskId: undefined,
                imagePromptHash: undefined,
                status: 'generating',
                error: '',
                gptFrameStatus: 'generating',
                gptFrameError: '',
                gptFrameConfirmed: false,
              }
            : s,
        ),
      }
      if (Array.isArray(item.storyboardFrames)) {
        item.storyboardFrames = item.storyboardFrames.map((frame) =>
          frame.shotId === input.shotId
            ? {
                ...frame,
                imagePath: undefined,
                status: 'generating',
                error: undefined,
                updatedAt: now(),
              }
            : frame,
        )
      }
      item = await cloneRepo.upsertProject(item)
      const refreshedProject = await cloneRepo.getProject(input.cloneProjectId)
      if (!refreshedProject || !refreshedProject.blueprint) throw new Error('澶嶅埢椤圭洰鎴栬摑鍥句笉瀛樺湪')
      item = refreshedProject
    }
    if (input.selectedModelIdentityId && item.selectedModelIdentityId !== input.selectedModelIdentityId) {
      await syncProjectSelectedIdentity(item, input.selectedModelIdentityId)
      item = await cloneRepo.getProject(input.cloneProjectId)
      if (!item || !item.blueprint) throw new Error('复刻项目或蓝图不存在')
    }
    const verifiedBlueprint = item.blueprint!
    const shot = verifiedBlueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    assertShotEligibleForAi(shot)
    const creds = mergeImageProviderOverrides(await cloneRepo.getCredentials(), {
      ...(input.imageProviderCredentials ?? {}),
      imageProviderPrimary: input.imageProviderPrimary ?? input.imageProviderCredentials?.imageProviderPrimary,
      openaiApiKey: input.openaiApiKey ?? input.imageProviderCredentials?.openaiApiKey,
      openaiImageModel: input.openaiImageModel ?? input.imageProviderCredentials?.openaiImageModel,
      openaiImageQuality: input.openaiImageQuality ?? input.imageProviderCredentials?.openaiImageQuality,
      klingApiKey: input.klingApiKey ?? input.imageProviderCredentials?.klingApiKey,
      klingHost: input.klingHost ?? input.imageProviderCredentials?.klingHost,
      klingImageModel: input.klingImageModel ?? input.imageProviderCredentials?.klingImageModel,
      grsaiApiKey: input.grsaiApiKey ?? input.imageProviderCredentials?.grsaiApiKey,
      grsaiHost: input.grsaiHost ?? input.imageProviderCredentials?.grsaiHost,
      grsaiImageModel: input.grsaiImageModel ?? input.imageProviderCredentials?.grsaiImageModel,
    })
    assertImageProviderKey(creds, '生成 AI 首尾帧')
    const pack = selectedIdentityPack(item)
    if (!String(item.projectIdentityGridPath || '').trim()) throw new Error('请先生成身份定妆图')
    const refs = resolveStoryboardProductRefs(item, shot)
    if (!hasProductLock(shot, refs)) throw new Error('请先为绑定商品生成标准源')

    await patchShotRuntimeState({
      project: item,
      shotId: shot.id,
      patch: { gptFrameStatus: 'generating', gptFrameError: '', gptFrameConfirmed: false, status: 'generating', error: '' },
    })

    let latest = await cloneRepo.getProject(input.cloneProjectId)
    if (!latest || !latest.blueprint) throw new Error('复刻项目或蓝图不存在')
    const latestShot = latest.blueprint.shots.find((x) => x.id === input.shotId) ?? shot
    const productType = normalizeProductType(latestShot.productType)
    latest = await ensureProjectProductAnalysis(latest, refs, productType, latest.locale)
    if (!latest.blueprint) throw new Error('复刻项目或蓝图不存在')
    const refreshedShot = latest.blueprint.shots.find((x) => x.id === input.shotId) ?? latestShot
    const outDir = join(getAppPaths().dataDir, 'viral-clone', latest.id, 'shots', refreshedShot.id, 'gpt-frames')
    await mkdir(outDir, { recursive: true })
    const which = input.which === 'end' ? 'end' : 'start'
    const compiled = promptConsistencyService.compileAndPersist({
      projectId: latest.id,
      shot: refreshedShot,
      projectShotCount: latest.blueprint.shots.length,
      productReferenceImagePaths: refs,
      modelIdentity: toPromptModelIdentity(pack),
    })
    const productIdentityText = buildPromptProductDescriptionText(latest, productType)
    const explicitTemplateType = resolveProjectStoryboardTemplateType(latest)
    const startPrompt = buildGptFramePrompt({
      shot: refreshedShot,
      productType,
      modelPack: pack ?? undefined,
      productPoints: refreshedShot.aiPrompt || refreshedShot.materialNeed,
      productDescription: productIdentityText,
      which: 'start',
      explicitTemplateType,
      compiledPrompt: compiled.finalPrompt,
    })
    const promptHash = computePromptHash({
      shot: refreshedShot,
      productRefs: refs,
      productDescription: [productIdentityText, latestShot.materialNeed].filter(Boolean).join('\n'),
      model: imageProviderModel(creds),
      qualityMode: normalizeQualityMode(latestShot.qualityMode),
    })
    const continuityAnchorPath = previousShotContinuityAnchor(latest, refreshedShot)
    const storyboardImageNegativePrompt = buildStoryboardImageNegativePrompt(compiled.finalNegativePrompt)
    const imagePromptHash = computeImagePromptHash({
      promptHash,
      which,
      refs: [...(pack?.imagePaths.slice(0, 1) ?? []), ...refs, continuityAnchorPath].filter(Boolean),
      model: imageProviderModel(creds),
      positivePrompt: startPrompt,
      negativePrompt: storyboardImageNegativePrompt,
    })
    const cachedFrame = input.forceRegenerate ? null : getCachedFrameResult(latest, imagePromptHash)
    let firstPath = refreshedShot.gptFirstFramePath
    let lastPath = ''
    try {
      if (cachedFrame?.imagePaths?.length) {
        firstPath = cachedFrame.imagePaths[0] || firstPath
      } else {
      if (which === 'start') {
        const startRefs = resolveStoryboardSceneFitRefs(latest, refreshedShot, pack ?? undefined, 'start')
        firstPath = await generateGptShotFrameImage({
          credentials: creds,
          outDir,
          filePrefix: `gpt_first_${refreshedShot.index + 1}`,
          prompt: startPrompt,
          negativePrompt: storyboardImageNegativePrompt,
          imagePaths: startRefs,
        })
      }
        setCachedFrameResult(latest, {
          hash: imagePromptHash,
          shotId: refreshedShot.id,
          imagePaths: [firstPath].filter(Boolean) as string[],
          provider: generatedImageProvider(creds),
          model: imageProviderModel(creds),
          createdAt: now(),
          sourceProductRefs: refs,
          promptHash,
        })
      }
      setCachedPromptResult(latest, {
        hash: promptHash,
        shotId: refreshedShot.id,
        positivePrompt: startPrompt,
        negativePrompt: storyboardImageNegativePrompt || buildCloneNegativePrompt(productType, refreshedShot.shotType),
        model: imageProviderModel(creds),
        qualityMode: normalizeQualityMode(latestShot.qualityMode),
        createdAt: now(),
      })
      const latestProjectForSave = await cloneRepo.getProject(input.cloneProjectId)
      if (!latestProjectForSave?.blueprint) throw new Error('澶嶅埢椤圭洰鎴栬摑鍥句笉瀛樺湪')
      latestProjectForSave.promptCache = latest.promptCache
      replaceProjectShot(latestProjectForSave, latestShot.id, {
        gptFirstFramePath: firstPath,
        gptLastFramePath: undefined,
        gptFrameStatus: 'done',
        gptFrameError: '',
        gptFrameSource: 'gpt_image',
        gptFrameModel: imageProviderModel(creds),
        gptFrameConfirmed: false,
        productReferenceImagePaths: refs,
        productType,
        generatedFirstFramePath: firstPath,
        generatedLastFramePath: undefined,
        generatedSource: 'cloud',
        generatedProvider: generatedImageProvider(creds),
        generatedModel: imageProviderModel(creds),
        generatedTaskId: `gpt_frame_${randomUUID()}`,
        promptHash,
        imagePromptHash,
        compiledPrompt: compiled.finalPrompt,
        compiledNegativePrompt: storyboardImageNegativePrompt,
        promptCompilerVersion: compiled.compilerVersion,
        consistencyMode: compiled.strictConsistencyMode ? 'strict' : 'standard',
        qualityStatus: 'unchecked',
        qualityReasons: [],
        status: 'ready',
        error: '',
      })
      rebuildProjectStoryboardFrames(latestProjectForSave)
      return await cloneRepo.upsertProject(latestProjectForSave)
    } catch (e: any) {
      const failed = await cloneRepo.getProject(input.cloneProjectId)
      if (failed?.blueprint) {
        failed.blueprint = {
          ...failed.blueprint,
          shots: failed.blueprint.shots.map((s) =>
            s.id === latestShot.id
              ? {
                  ...s,
                  gptFirstFramePath: undefined,
                  gptLastFramePath: undefined,
                  generatedFirstFramePath: undefined,
                  generatedLastFramePath: undefined,
                  generatedTaskId: undefined,
                  gptFrameStatus: 'failed',
                  gptFrameError: String(e?.message ?? e),
                  gptFrameConfirmed: false,
                  status: 'failed',
                  error: String(e?.message ?? e),
                }
              : s,
          ),
        }
        if (Array.isArray(failed.storyboardFrames)) {
          failed.storyboardFrames = failed.storyboardFrames.map((frame) =>
            frame.shotId === latestShot.id
              ? {
                  ...frame,
                  imagePath: undefined,
                  status: 'failed',
                  error: String(e?.message ?? e),
                  updatedAt: now(),
                }
              : frame,
          )
        }
        await cloneRepo.upsertProject(failed)
      }
      throw e
    }
  },

  async confirmGptShotFrames(input: {
    cloneProjectId: string
    shotId: string
    confirmed?: boolean
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目或蓝图不存在')
    const shot = item.blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    if (input.confirmed !== false && (!shot.gptFirstFramePath || !shot.gptLastFramePath)) {
      throw new Error('请先生成 GPT 首帧和尾帧')
    }
    item.blueprint = {
      ...item.blueprint,
      shots: item.blueprint.shots.map((s) =>
        s.id === shot.id
          ? {
              ...s,
              gptFrameConfirmed: input.confirmed !== false,
              generatedFirstFramePath: input.confirmed === false ? s.generatedFirstFramePath : s.gptFirstFramePath,
              generatedLastFramePath: input.confirmed === false ? s.generatedLastFramePath : s.gptLastFramePath,
              generatedProvider:
                input.confirmed === false
                  ? s.generatedProvider
                  : s.generatedProvider === 'grsai-image'
                    ? 'grsai-image'
                    : s.generatedProvider === 'kling-image'
                      ? 'kling-image'
                      : 'openai-gpt-image',
              generatedModel: input.confirmed === false ? s.generatedModel : s.gptFrameModel || 'gpt-image-2',
              generatedSource: input.confirmed === false ? s.generatedSource : 'cloud',
              qualityStatus: 'unchecked',
              qualityReasons: [],
              status: 'ready',
              error: '',
            }
          : s,
      ),
    }
    return await cloneRepo.upsertProject(item)
  },

  async generateShotClip(input: {
    cloneProjectId: string
    shotId: string
    forceRegenerate?: boolean
  }) {
    console.log('[clone-debug] generate-shot-clip:requested', {
      projectId: input.cloneProjectId,
      shotId: input.shotId,
      forceRegenerate: Boolean(input.forceRegenerate),
    })
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('澶嶅埢椤圭洰鎴栬摑鍥句笉瀛樺湪')
    let shot = item.blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    console.log('[clone-debug] generate-shot-clip:loaded-shot', {
      projectId: item.id,
      shotId: shot.id,
      realismRisk: shot.realismRisk,
      forceAi: Boolean(shot.forceAi),
      replaceMode: shot.replaceMode,
      gptFrameConfirmed: Boolean(shot.gptFrameConfirmed),
      generatedFirstFramePath: String(shot.generatedFirstFramePath || '').trim(),
      generatedLastFramePath: String(shot.generatedLastFramePath || '').trim(),
      gptFirstFramePath: String(shot.gptFirstFramePath || '').trim(),
      gptLastFramePath: String(shot.gptLastFramePath || '').trim(),
      uploadedImagePath: String(shot.uploadedImagePath || '').trim(),
      productReferenceImageCount: Array.isArray(shot.productReferenceImagePaths) ? shot.productReferenceImagePaths.length : 0,
    })
    clearInvalidVideoTaskMapping(item, shot, 'before-generate-shot-clip')
    assertShotEligibleForAi(shot)
    assertShotHasScriptPrompt(shot)
    let existingOutput = resolveShotVideoOutput(item, shot)
    if (input.forceRegenerate && (existingOutput.taskId || existingOutput.videoPath || existingOutput.localPath || shot.generatedClipPath)) {
      const replacementStartedAt = now()
      console.log('[clone-debug] generate-shot-clip:force-regenerate-clear-old-output', {
        projectId: item.id,
        shotId: shot.id,
        previousTaskId: existingOutput.taskId,
        previousVideoPath: existingOutput.videoPath,
        previousProvider: existingOutput.provider,
        previousModel: existingOutput.model,
      })
      syncSegmentVideoOutput(item, shot, {
        previousTaskIds: Array.from(
          new Set(
            [...(existingOutput.previousTaskIds ?? []), existingOutput.taskId].filter(
              (value): value is string => Boolean(String(value || '').trim()),
            ),
          ),
        ),
        taskId: undefined,
        provider: undefined,
        model: undefined,
        videoPath: undefined,
        localPath: undefined,
        videoUrl: undefined,
        remoteStatus: undefined,
        remoteRaw: undefined,
        error: undefined,
        submissionFingerprint: undefined,
        submissionStartedAt: replacementStartedAt,
        submissionLockedUntil: replacementStartedAt + SHOT_VIDEO_SUBMISSION_LOCK_MS,
        sourceEvent: 'force_regenerate_reset',
        status: 'submitting',
        completedAt: undefined,
      })
      replaceProjectShot(item, shot.id, {
        generatedClipPath: undefined,
        generatedTaskId: undefined,
        generatedProvider: undefined,
        generatedModel: undefined,
        generatedSource: undefined,
        error: '',
        status: 'generating',
      })
      resetFinalComposeArtifacts(item, '分镜视频已更新，需基于最新分镜重新合成成片。')
      item.lastError = ''
      setProjectErrorContext(item, null)
      await cloneRepo.upsertProject(item)
      shot = item.blueprint.shots.find((x) => x.id === input.shotId) || {
        ...shot,
        generatedClipPath: undefined,
        generatedTaskId: undefined,
        generatedProvider: undefined,
        generatedModel: undefined,
        generatedSource: undefined,
        error: '',
        status: 'generating',
      }
      existingOutput = resolveShotVideoOutput(item, shot)
    }
    const matchedLocalAsset = input.forceRegenerate ? null : await matchLocalAssetsForShot(item, shot)
    if (matchedLocalAsset) {
      console.log('[clone-debug] generate-shot-clip:matched-local-asset', {
        projectId: item.id,
        shotId: shot.id,
        assetId: matchedLocalAsset.asset.id,
        filePath: matchedLocalAsset.asset.filePath,
        score: matchedLocalAsset.candidate.score,
      })
      const localQuality = await productionQualityCheckShot({
        shot: {
          ...shot,
          uploadedAssetPath: matchedLocalAsset.asset.filePath,
          generatedSource: 'local',
          generatedProvider: 'local',
          generatedModel: 'local-real-video',
          isMock: false,
        },
        filePath: matchedLocalAsset.asset.filePath,
        targetDurationSec: shot.durationSec,
      })
      await patchShotRuntimeState({
        project: item,
        shotId: shot.id,
        patch: {
          uploadedAssetPath: matchedLocalAsset.asset.filePath,
          generatedClipPath: undefined,
          generatedSource: 'local',
          selectedAssetId: matchedLocalAsset.asset.id,
          assetMatchScore: matchedLocalAsset.candidate.score,
          assetMatchLabel: '已命中真实素材',
          assetMatchReasons: matchedLocalAsset.candidate.reasons,
          assetMatchDetail: matchedLocalAsset.candidate.detail,
          replacementMode: 'local_video',
          qualityStatus: localQuality.qualityStatus,
          qualityScore: Math.max(localQuality.qualityScore, matchedLocalAsset.candidate.score),
          qualityReasons: localQuality.qualityReasons.length
            ? localQuality.qualityReasons
            : ['已复用本地真实视频素材', ...matchedLocalAsset.candidate.reasons],
          retrySuggestion: localQuality.retrySuggestion,
          generatedClipDurationSec: localQuality.generatedClipDurationSec,
          generatedClipWidth: localQuality.generatedClipWidth,
          generatedClipHeight: localQuality.generatedClipHeight,
          freezeRatio: localQuality.freezeRatio,
          blackFrameRatio: localQuality.blackFrameRatio,
          productVisibilityScore: localQuality.productVisibilityScore,
          canEnterRender: localQuality.canEnterRender,
          status: 'ready',
          error: '',
          isMock: false,
        },
      })
      patchQueueJobStatus(item, shot.id, 'done', Number(shot.retryCount ?? 0))
      return (await cloneRepo.getProject(input.cloneProjectId)) as CloneProject
    }
    if (shot.realismRisk === 'high' && !shot.forceAi) {
      console.log('[clone-debug] generate-shot-clip:blocked-realism-risk', {
        projectId: item.id,
        shotId: shot.id,
        realismRisk: shot.realismRisk,
        forceAi: Boolean(shot.forceAi),
      })
      patchQueueJobStatus(item, shot.id, 'skipped', Number(shot.retryCount ?? 0))
      throw new Error('[未提交视频模型请求] 当前分镜真实感风险高，默认建议上传真实视频素材，不自动 AI 生成。若需继续，请先开启“强制 AI 生成”。')
    }
    if (!hasProductLock(shot, shot.productReferenceImagePaths)) {
      console.log('[clone-debug] generate-shot-clip:blocked-missing-product-lock', {
        projectId: item.id,
        shotId: shot.id,
        productReferenceImageCount: Array.isArray(shot.productReferenceImagePaths) ? shot.productReferenceImagePaths.length : 0,
      })
      throw new Error('[未提交视频模型请求] 请先上传产品参考图或填写产品锁定信息')
    }
    const activeShot = shot
    existingOutput = resolveShotVideoOutput(item, activeShot)
    const currentSubmissionFingerprint = computeShotVideoSubmissionFingerprint({
      shot: activeShot,
      firstFramePath: String(
        activeShot.uploadedImagePath && activeShot.replaceMode === 'upload_image_to_video'
          ? activeShot.uploadedImagePath
          : activeShot.gptFrameConfirmed && activeShot.gptFirstFramePath
            ? activeShot.gptFirstFramePath
            : activeShot.generatedFirstFramePath || activeShot.uploadedImagePath || '',
      ).trim(),
      lastFramePath: String(
        activeShot.uploadedImagePath && activeShot.replaceMode === 'upload_image_to_video'
          ? activeShot.uploadedImagePath
          : activeShot.gptFrameConfirmed && activeShot.gptLastFramePath
            ? activeShot.gptLastFramePath
            : activeShot.generatedLastFramePath || '',
      ).trim(),
      provider: 'apifox_hub',
      model: videoProviderModel(await cloneRepo.getCredentials()),
      requestCapability: 'video_image_to_video',
    })
    if (!input.forceRegenerate && isShotVideoSubmissionLocked(existingOutput, currentSubmissionFingerprint)) {
      console.log('[clone-debug] generate-shot-clip:submission-locked', {
        projectId: item.id,
        shotId: shot.id,
        forceRegenerate: Boolean(input.forceRegenerate),
        submissionLockedUntil: existingOutput.submissionLockedUntil,
      })
      const next = (await refreshGenerationQueueRuntime(input.cloneProjectId)) || item
      return {
        ...next,
        executionMode: 'background_dispatched' as const,
      }
    }
    if (existingOutput.taskId && !input.forceRegenerate) {
      console.log('[clone-debug] generate-shot-clip:reuse-existing-task', {
        projectId: item.id,
        shotId: shot.id,
        taskId: existingOutput.taskId,
        provider: existingOutput.provider,
        model: existingOutput.model,
        status: existingOutput.status,
        error: existingOutput.error,
      })
      if (isDownloadReadyShotStatus(existingOutput.status) && String(existingOutput.videoUrl || '').trim()) {
        const downloaded = await runVideoTaskPoolJob({
          pool: 'download',
          project: item,
          shotId: activeShot.id,
          taskId: resolveEffectiveVideoTaskId(existingOutput.taskId, activeShot.generatedTaskId) || undefined,
          worker: () => downloadCompletedSegmentTask({ project: item, shot: activeShot }),
        })
        const next = (await refreshGenerationQueueRuntime(input.cloneProjectId)) || downloaded.project
        return {
          ...next,
          executionMode: 'background_dispatched' as const,
        }
      }
      const polled = await runVideoTaskPoolJob({
        pool: 'poll',
        project: item,
        shotId: activeShot.id,
        taskId: resolveEffectiveVideoTaskId(existingOutput.taskId, activeShot.generatedTaskId) || undefined,
        worker: () => pollExistingSegmentTask({ project: item, shot: activeShot, waitMs: 0, allowFailed: true, skipDownload: true }),
      })
      const next = (await refreshGenerationQueueRuntime(input.cloneProjectId)) || polled.project
      return {
        ...next,
        executionMode: 'background_dispatched' as const,
      }
    }
    if (input.forceRegenerate) {
      item.lastError = ''
      setProjectErrorContext(item, null)
    }
    patchQueueJobStatus(item, shot.id, 'running', Number(shot.retryCount ?? 0))
    await patchShotRuntimeState({
      project: item,
      shotId: shot.id,
      patch: {
        status: 'generating',
        error: '',
        qualityStatus: 'unchecked',
        qualityScore: undefined,
        qualityReasons: [],
        generatedClipPath: undefined,
        generatedSource: undefined,
        generatedProvider: undefined,
        generatedModel: undefined,
        generatedTaskId: input.forceRegenerate ? undefined : sanitizeVideoTaskId(shot.generatedTaskId),
        isMock: false,
      },
    })
    const shotDir = join(getAppPaths().dataDir, 'viral-clone', item.id, 'shots', shot.id)
    await mkdir(shotDir, { recursive: true })
    let out = join(shotDir, 'generated_clip.mp4')
    let generatedProvider = ''
    let generatedModel = ''
    let generatedTaskId = ''
    let quality: Awaited<ReturnType<typeof qualityCheckShot>> | null = null
    const mode = normalizeQualityMode(shot.qualityMode)
    const maxAttempts = mode === 'high' ? 3 : 1
    const productType = normalizeProductType(shot.productType)
    const productAnalysisText = buildPromptProductDescriptionText(item, productType)
    const compiled = promptConsistencyService.compileAndPersist({
      projectId: item.id,
      shot,
      projectShotCount: item.blueprint.shots.length,
      productReferenceImagePaths: shot.productReferenceImagePaths,
      productDescription: productAnalysisText,
      modelIdentity: toPromptModelIdentity(selectedIdentityPack(item)),
    })
    console.log('[clone-debug] generate-shot-clip:product-snapshot', {
      projectId: item.id,
      shotId: shot.id,
      boundProductSnapshot: item.boundProductSnapshot || item.baseBlueprint?.consistencyAssets?.boundProductSnapshot || item.blueprint?.consistencyAssets?.boundProductSnapshot,
      productDescription: productAnalysisText,
    })
    try {
      const creds = await cloneRepo.getCredentials()
      const chain = videoProviderChain(creds) as any
      console.log('[clone-debug] generate-shot-clip:provider-chain', {
        projectId: item.id,
        shotId: shot.id,
        providerChain: chain,
        videoProviderPrimary: creds.videoProviderPrimary,
        videoModelPrimary: creds.videoModelPrimary,
      })
      let lastQualityReasons: string[] = []
      let lastFailure: Error | null = null
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const promptHash = computePromptHash({
          shot,
          productRefs: shot.productReferenceImagePaths ?? [],
          productDescription: productAnalysisText,
          model: String(
            videoProviderChain(creds)[0] === 'kling'
              ? creds.videoModelFallback
              : videoProviderChain(creds)[0] === 'grsai'
                ? creds.grsaiVideoModel
                : creds.videoModelPrimary,
          ),
          qualityMode: mode,
        })
        const strengthenedShot: ShotSpec = {
          ...shot,
          retryCount: attempt,
          productIdentityText: productAnalysisText,
          aiPrompt: buildStructuredShotPrompt({
            shot,
            productType: shot.productType,
            productPoints: [
              shot.generationPrompt,
              shot.scriptText,
              shot.visualDescription,
              shot.actionDescription,
              shot.cameraDescription,
              shot.aiPrompt,
              shot.materialNeed,
            ].filter(Boolean).join('\n'),
            productAnalysisText,
            retryAttempt: attempt,
          }),
          negativePrompt: shot.negativePrompt || defaultQualityNegativePrompt(),
          compiledPrompt: buildEffectiveVideoCompiledPrompt({
            shot,
            project: item,
            productType: normalizeProductType(shot.productType),
            productIdentityText: productAnalysisText,
          }),
          compiledNegativePrompt: compiled.finalNegativePrompt,
          promptCompilerVersion: compiled.compilerVersion,
          consistencyMode: compiled.strictConsistencyMode ? 'strict' : 'standard',
        }
        const first =
          shot.uploadedImagePath && shot.replaceMode === 'upload_image_to_video'
            ? shot.uploadedImagePath
            : shot.gptFrameConfirmed && shot.gptFirstFramePath
              ? shot.gptFirstFramePath
              : shot.generatedFirstFramePath
        const last =
          mode === 'fast'
            ? first
            : shot.uploadedImagePath && shot.replaceMode === 'upload_image_to_video'
              ? shot.uploadedImagePath
              : shot.gptFrameConfirmed && shot.gptLastFramePath
                ? shot.gptLastFramePath
                : shot.generatedLastFramePath || (mode === 'high' ? first : '')
        console.log('[clone-debug] generate-shot-clip:attempt-input', {
          projectId: item.id,
          shotId: shot.id,
          attempt,
          mode,
          firstFramePath: first,
          lastFramePath: last,
        })
        if (!first) throw new Error('[未提交视频模型请求] 缺少首帧，请先生成首帧或上传图片')
        if (mode === 'high' && !last) throw new Error('[未提交视频模型请求] 高质量模式缺少尾帧，请先生成首尾帧')
        const primaryVideoProvider = videoProviderChain(creds)[0]
        if (mode === 'high' && !last && primaryVideoProvider !== 'apifox_hub') throw new Error('[鏈彁浜よ棰戞ā鍨嬭姹俔 楂樿川閲忔ā寮忕己灏戝熬甯э紝璇峰厛鐢熸垚棣栧熬甯?')
        if (primaryVideoProvider === 'apifox_hub') {
          console.log('[clone-debug] generate-shot-clip:delegate-apifox-hub', {
            projectId: item.id,
            shotId: shot.id,
            attempt,
            mode,
            usedFirstFrameAsLastFrame: mode === 'high' && !last,
          })
          const latest = (await cloneRepo.getProject(input.cloneProjectId)) || item
          ensureCloneFlowState(latest)
          const latestShot = projectBlueprintShots(latest).find((x) => x.id === input.shotId) || strengthenedShot
          const submitted = await runVideoTaskPoolJob({
            pool: 'submit',
            project: latest,
            shotId: latestShot.id,
              worker: () => ensureAi666SegmentVideoTask({
                project: latest,
                shot: latestShot,
                firstFramePath: first,
                lastFramePath: last || first,
                mode,
                forceRegenerate: Boolean(input.forceRegenerate),
              }),
          })
          scheduleRemoteStoryboardVideoReconcile(input.cloneProjectId)
          const next = (await refreshGenerationQueueRuntime(input.cloneProjectId)) || submitted
          return {
            ...next,
            executionMode: 'background_dispatched' as const,
          }
        }
        const cloudClipHash = computeCloudClipHash({
          promptHash,
          firstFrame: first,
          lastFrame: last || first,
          model: String(
            videoProviderChain(creds)[0] === 'kling'
              ? creds.videoModelFallback
              : videoProviderChain(creds)[0] === 'grsai'
                ? creds.grsaiVideoModel
                : creds.videoModelPrimary,
          ),
          duration: Number(shot.durationSec || 0),
          aspectRatio: shot.prompt?.aspectRatio || '9:16',
          resolution: '720p',
        })
        const cachedClip = input.forceRegenerate ? null : getCachedCloudClipResult(item, cloudClipHash)
        if (cachedClip?.filePath) {
          out = cachedClip.filePath
          generatedProvider = cachedClip.provider
          generatedModel = cachedClip.model
          generatedTaskId = `cache_${cloudClipHash.slice(0, 8)}`
          quality = await qualityCheckShot({
            shot: {
              ...strengthenedShot,
              generatedSource: 'cloud',
              generatedProvider,
              generatedModel,
              generatedTaskId,
              isMock: false,
            },
            filePath: out,
            firstFramePath: first,
            source: 'cloud',
          })
          if (quality.passed) break
        }
        const generated = await generateShotVideoByProviderChain({
          project: item,
          shot: strengthenedShot,
          outDir: shotDir,
          startFramePath: first,
          endFramePath: last || first,
          consistencyMode: mode === 'high' ? 'hard' : consistencyRuntimeMode(shot, compiled.strictConsistencyMode),
          credentials: creds,
          chain,
          compiledPrompt: buildEffectiveVideoCompiledPrompt({
            shot: strengthenedShot,
            project: item,
            productType: normalizeProductType(strengthenedShot.productType),
          }),
          compiledNegativePrompt: compiled.finalNegativePrompt,
        })
        console.log('[clone-debug] generate-shot-clip:provider-generated', {
          projectId: item.id,
          shotId: shot.id,
          attempt,
          provider: generated.provider,
          model: generated.model,
          remoteTaskId: generated.remoteTaskId,
          outputFilePath: generated.outputFilePath,
        })
        out = generated.outputFilePath
        await assertCloudMotionVideo(out)
        const cloudQualityShot: ShotSpec = {
          ...strengthenedShot,
          generatedSource: 'cloud',
          generatedProvider: generated.provider,
          generatedModel: generated.model || generated.provider,
          generatedTaskId: generated.remoteTaskId || '',
          isMock: false,
        }
          quality = await qualityCheckShot({ shot: cloudQualityShot, filePath: out, firstFramePath: first, source: 'cloud' })
        setCachedPromptResult(item, {
          hash: promptHash,
          shotId: shot.id,
          positivePrompt: strengthenedShot.aiPrompt || '',
          negativePrompt: strengthenedShot.negativePrompt || '',
          model: generated.model || generated.provider,
          qualityMode: mode,
          createdAt: now(),
        })
        setCachedCloudClipResult(item, {
          hash: cloudClipHash,
          shotId: shot.id,
          filePath: out,
          provider: generated.provider,
          model: generated.model || generated.provider,
          createdAt: now(),
          promptHash,
        })
        if (mode !== 'high' || quality.passed) {
          generatedProvider = generated.provider
          generatedModel = generated.model || generated.provider
          generatedTaskId = generated.remoteTaskId || ''
          lastQualityReasons = quality.reasons
          break
        }
        lastQualityReasons = quality.reasons
        if (attempt >= maxAttempts - 1) {
          lastFailure = new Error('质检失败: ' + (lastQualityReasons.join('；') || '质量不足') + '。建议上传真实素材替换。')
          throw lastFailure
        }
      }
    } catch (e: any) {
      console.log('[clone-debug] generate-shot-clip:failed', {
        projectId: item.id,
        shotId: input.shotId,
        forceRegenerate: Boolean(input.forceRegenerate),
        message: String(e?.message ?? e ?? ''),
      })
      const creds = await cloneRepo.getCredentials()
      const hasKey = hasCloudVideoKey(creds)
      const latest = await cloneRepo.getProject(input.cloneProjectId)
      const preservedTaskId = String(
        (input.forceRegenerate ? '' : latest?.blueprint?.shots.find((x) => x.id === input.shotId)?.generatedTaskId) ||
          generatedTaskId ||
          '',
      ).trim()
      const reason = hasKey
        ? `${videoProviderLabel(creds)} 云端AI生成失败: ` + String(e?.message ?? e)
        : `未配置 ${videoProviderLabel(creds)} API Key，无法调用云端图生视频模型`
      if (latest) {
        await patchShotRuntimeState({
          project: latest,
          shotId: input.shotId,
          patch: {
            status: 'failed',
            error: reason,
            generatedClipPath: undefined,
            generatedSource: undefined,
            generatedProvider: undefined,
            generatedModel: undefined,
            generatedTaskId: preservedTaskId || undefined,
            isMock: false,
            qualityStatus: 'failed',
            qualityScore: quality?.score ?? 0,
            qualityReasons: quality?.reasons?.length ? quality.reasons : [reason],
            retryCount: maxAttempts - 1,
          },
        })
        syncSegmentVideoOutput(latest, shot, {
          source: 'generated',
          status: 'failed_terminal',
          error: reason,
          taskId: preservedTaskId || undefined,
          provider: videoProviderLabel(creds),
          model: videoProviderModel(creds),
        })
        latest.lastError = `[${videoProviderLabel(creds)} / ${videoProviderModel(creds)}] ${reason}`
        setProjectErrorContext(latest, {
          ...apifoxContextByCapability(creds, 'video_start_end_to_video'),
          action: 'generate_shot_clip',
          taskId: preservedTaskId || undefined,
          message: reason,
          responseSnippet: String(e?.message ?? e),
        })
        await cloneRepo.upsertProject(latest)
      }
      throw new Error(reason)
    }
    console.log('[clone-debug] generate-shot-clip:completed', {
      projectId: item.id,
      shotId: shot.id,
      generatedProvider,
      generatedModel,
      generatedTaskId,
      outputFilePath: out,
    })
    const generatedShotPatch: Partial<ShotSpec> = {
      generatedClipPath: out,
      status: 'done',
      sourceMode: 'ai',
      generatedProvider: generatedProvider || shot.generatedProvider,
      generatedModel: generatedModel || shot.generatedModel,
      generatedTaskId: sanitizeVideoTaskId(generatedTaskId) || sanitizeVideoTaskId(shot.generatedTaskId),
      generatedSource: 'cloud',
      isMock: false,
      qualityStatus: quality?.passed ? 'passed' : mode === 'high' ? 'failed' : 'warning',
      qualityScore: quality?.score,
      qualityReasons: quality?.reasons ?? [],
      retrySuggestion: quality?.reasons?.length ? (quality.passed ? '质量通过' : '建议优先替换真实视频素材或降低镜头复杂度') : undefined,
      retryCount: quality?.passed ? Math.max(0, Number(shot.retryCount || 0)) : maxAttempts - 1,
      generatedClipDurationSec: quality?.meta.durationSec,
      generatedClipWidth: quality?.meta.width,
      generatedClipHeight: quality?.meta.height,
      canEnterRender: Boolean(quality?.passed || mode !== 'high'),
      error: '',
      compiledPrompt: buildEffectiveVideoCompiledPrompt({
        shot,
        project: item,
        productType: normalizeProductType(shot.productType),
      }),
      compiledNegativePrompt: compiled.finalNegativePrompt,
      promptCompilerVersion: compiled.compilerVersion,
      consistencyMode: compiled.strictConsistencyMode ? 'strict' : 'standard',
    }
    replaceProjectShot(item, shot.id, generatedShotPatch)
    syncSegmentVideoOutput(item, shot, {
      source: 'generated',
      videoPath: out,
      localPath: out,
      taskId: generatedShotPatch.generatedTaskId,
      provider: generatedShotPatch.generatedProvider,
      model: generatedShotPatch.generatedModel,
      durationSec: quality?.meta.durationSec,
      remoteStatus: 'succeeded',
      status: 'done',
      error: undefined,
      completedAt: now(),
    })
    patchQueueJobStatus(item, shot.id, 'done', quality?.passed ? Number(shot.retryCount ?? 0) : maxAttempts - 1)
    const saved = await cloneRepo.upsertProject(item)
    return {
      ...saved,
      executionMode: 'blocking_completed' as const,
    }
  },

  async getShotConsistencyReport(input: { cloneProjectId: string; shotId: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目不存在')
    let shot = item.blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    return (
      promptConsistencyService.getShotConsistencyReport(item.id, shot.id) ||
      promptConsistencyService.previewShotConsistencyPrompt(
        item.id,
        shot,
        toPromptModelIdentity(selectedIdentityPack(item)),
        resolveProductSnapshotText(item, normalizeProductType(shot.productType)),
      )
    )
  },

  async getShotImagePromptPreview(input: {
    cloneProjectId: string
    shotId: string
    selectedModelIdentityId?: string
  }) {
    let item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目不存在')
    if (input.selectedModelIdentityId && item.selectedModelIdentityId !== input.selectedModelIdentityId) {
      await syncProjectSelectedIdentity(item, input.selectedModelIdentityId)
      item = await cloneRepo.getProject(input.cloneProjectId)
      if (!item || !item.blueprint) throw new Error('复刻项目不存在')
    }
    item = await syncProjectBoundProductSnapshotFromLibrary(item)
    const blueprint = item.blueprint
    if (!blueprint) throw new Error('复刻项目不存在')
    let shot = blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    const pack = selectedIdentityPack(item)
    if (!String(item.projectIdentityGridPath || '').trim()) throw new Error('请先生成身份定妆图')
    if (!String(item.projectIdentityGridPath || '').trim()) throw new Error('请先生成身份定妆图')
    const productReferenceImagePaths = normalizePreviewReferencePaths(resolveStoryboardProductRefs(item, shot))
    if (!hasProductLock(shot, productReferenceImagePaths)) throw new Error('请先为绑定商品生成标准源')
    const productType = normalizeProductType(shot.productType)
    shot = item.blueprint?.shots.find((x) => x.id === input.shotId) || shot
    const compiled =
      promptConsistencyService.getShotConsistencyReport(item.id, shot.id) ||
      promptConsistencyService.previewShotConsistencyPrompt(
        item.id,
        shot,
        toPromptModelIdentity(selectedIdentityPack(item)),
        resolveProductSnapshotText(item, productType),
      )

    const productDescriptionText = buildPromptProductDescriptionText(item, productType)
    const productDescriptionBlock = buildProductDescriptionLockText(productDescriptionText)
    const primaryProductReferenceImagePath = productReferenceImagePaths[0] || ''
    const productReferenceUsageSummary = [
      primaryProductReferenceImagePath
        ? `主商品图：第 1 张 Product Canonical Source，文件 ${basename(primaryProductReferenceImagePath)}。`
        : '主商品图：缺失。',
      productReferenceImagePaths.length > 1
        ? `辅助商品图：额外使用 ${productReferenceImagePaths.length - 1} 张商品参考图补充角度、结构和材质信息。`
        : '辅助商品图：无，仅使用主商品图。',
      '文字商品描述：使用当前绑定商品的最新 Product DNA，而不是旧的项目残留描述。',
      `DNA 来源：${item.boundProductSnapshot?.name ? `绑定商品 ${item.boundProductSnapshot.name}` : '当前绑定商品'}。`,
    ].join('\n')
    const sceneAtmosphereBlock = buildFrameSceneAtmosphereText(shot)
    const modelIdentityBlock = pack ? buildModelIdentityLockText(pack) : ''
    const referenceResponsibilityBlock = buildReferenceResponsibilityText()
    const modelReferenceImagePaths = normalizePreviewReferencePaths([String(item.projectIdentityGridPath || '').trim()])
    const sceneReferenceImagePaths = normalizePreviewReferencePaths(
      [String(shot.thumbnailPath || '').trim() || previousShotContinuityAnchor(item, shot)].filter(Boolean),
    )
    console.log('[clone-debug] shot-image-prompt-preview:refs', {
      projectId: item.id,
      shotId: shot.id,
      identityGridPath: modelReferenceImagePaths[0] || '',
      sceneReferencePath: sceneReferenceImagePaths[0] || '',
      missingIdentityGrid: !modelReferenceImagePaths[0],
    })
    const explicitTemplateType = resolveProjectStoryboardTemplateType(item)
    const startPrompt = buildGptFramePrompt({
      shot,
      productType,
      modelPack: pack ?? undefined,
      productPoints: shot.aiPrompt || shot.materialNeed,
      productDescription: productDescriptionText,
      which: 'start',
      compiledPrompt: compiled.finalPrompt,
      explicitTemplateType,
    })
    const continuityAnchorPath = previousShotContinuityAnchor(item, shot)
    const startRefs = resolveStoryboardSceneFitRefs(item, shot, pack ?? undefined, 'start')
    const storyboardImageNegativePrompt = buildStoryboardImageNegativePrompt(compiled.finalNegativePrompt)
    const requestPreview = buildShotImageRequestPreview({
      credentials: await cloneRepo.getCredentials(),
      startPrompt,
      negativePrompt: storyboardImageNegativePrompt,
      startRefs,
    })

    return {
      shotId: shot.id,
      promptBuildSentinel: SHOT_IMAGE_PROMPT_PREVIEW_SENTINEL,
      promptCompilerVersion: compiled.compilerVersion,
      consistencyMode: compiled.strictConsistencyMode ? 'strict' : 'standard',
      productType,
      compiledPrompt: compiled.finalPrompt,
      compiledNegativePrompt: storyboardImageNegativePrompt,
      productDescriptionText,
      productDescriptionBlock,
      productReferenceUsageSummary,
      primaryProductReferenceImagePath,
      sceneAtmosphereBlock,
      modelIdentityBlock,
      referenceResponsibilityBlock,
      hasCompiledProductLock: Boolean(String(compiled.finalPrompt || '').trim()),
      hasProductDescriptionBlock: Boolean(productDescriptionBlock),
      hasDirectProductReuseLock: startPrompt.includes('PRODUCT VISUAL ANCHOR LOCK'),
      hasSceneAtmosphereBlock: Boolean(sceneAtmosphereBlock),
      hasModelIdentityBlock: Boolean(modelIdentityBlock),
      startPrompt,
      endPrompt: '',
      negativePrompt: storyboardImageNegativePrompt,
      referenceImageCount: modelReferenceImagePaths.length + sceneReferenceImagePaths.length,
      modelIdentityPackId: pack?.id || '',
      productReferenceImagePaths: sceneReferenceImagePaths,
      productReferenceImageCount: sceneReferenceImagePaths.length,
      modelReferenceImagePaths,
      modelReferenceImageCount: modelReferenceImagePaths.length,
      sceneReferenceImagePath: sceneReferenceImagePaths[0] || '',
      identityGridReferenceImagePath: modelReferenceImagePaths[0] || '',
      requestProvider: requestPreview.requestProvider,
      requestModel: requestPreview.requestModel,
      requestJsonStart: requestPreview.requestJsonStart,
      requestJsonEnd: '',
      boundProductSnapshot: item.boundProductSnapshot || item.baseBlueprint?.consistencyAssets?.boundProductSnapshot || item.blueprint?.consistencyAssets?.boundProductSnapshot,
    }
  },

  async getShotVideoPromptPreview(input: { cloneProjectId: string; shotId: string }) {
    let item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目不存在')
    item = await syncProjectBoundProductSnapshotFromLibrary(item)
    const blueprint = item.blueprint
    if (!blueprint) throw new Error('复刻项目不存在')
    const shot = blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    const productReferenceImagePaths = normalizePreviewReferencePaths(resolveStoryboardProductRefs(item, shot))
    if (!hasProductLock(shot, productReferenceImagePaths)) {
      throw new Error('请先为绑定商品生成标准源')
    }
    const productType = resolveShotPromptProductType(item, shot)
    const productAnalysisText = buildPromptProductDescriptionText(item, productType)
    const primaryProductReferenceImagePath = productReferenceImagePaths[0] || ''
    const productReferenceUsageSummary = [
      primaryProductReferenceImagePath
        ? `主商品图：第 1 张 Product Canonical Source，文件 ${basename(primaryProductReferenceImagePath)}。`
        : '主商品图：缺失。',
      productReferenceImagePaths.length > 1
        ? `辅助商品图：额外使用 ${productReferenceImagePaths.length - 1} 张商品参考图补充结构和角度一致性。`
        : '辅助商品图：无，仅使用主商品图。',
      '文字商品描述：沿用当前绑定商品的最新 Product DNA，并同步给分镜视频 prompt。',
      `DNA 来源：${item.boundProductSnapshot?.name ? `绑定商品 ${item.boundProductSnapshot.name}` : '当前绑定商品'}。`,
    ].join('\n')
    const pack = selectedIdentityPack(item)
    const modelReferenceImagePaths = normalizePreviewReferencePaths([String(item.projectIdentityGridPath || '').trim()])
    console.log('[clone-debug] shot-video-prompt-preview:refs', {
      projectId: item.id,
      shotId: shot.id,
      shotProductType: String(shot.productType || '').trim(),
      resolvedProductType: productType,
      productCanonicalSourcePath: productReferenceImagePaths[0] || '',
      primaryModelReferenceImagePath: modelReferenceImagePaths[0] || '',
      missingCanonicalSource: !productReferenceImagePaths[0],
    })
    const { compiled, effectiveShot, prompt, scriptSpliceText } = buildShotVideoPromptPreviewText({
      project: item,
      shot,
      productType,
      productAnalysisText,
    })
    const explicitTemplateType = resolveProjectStoryboardTemplateType(item)
    const startFramePrompt = buildGptFramePrompt({
      shot: effectiveShot,
      productType,
      modelPack: pack ?? undefined,
      productPoints: effectiveShot.aiPrompt || effectiveShot.materialNeed,
      productDescription: productAnalysisText,
      which: 'start',
      compiledPrompt: compiled.finalPrompt,
      explicitTemplateType,
    })
    const endFramePrompt = buildGptFramePrompt({
      shot: effectiveShot,
      productType,
      modelPack: pack ?? undefined,
      productPoints: effectiveShot.aiPrompt || effectiveShot.materialNeed,
      productDescription: productAnalysisText,
      which: 'end',
      compiledPrompt: compiled.finalPrompt,
      explicitTemplateType,
    })
    const finalPositivePrompt = buildFinalShotVideoPositivePrompt({
      shot: { ...effectiveShot, productType },
      productIdentityText: String(effectiveShot.productIdentityText || effectiveShot.materialNeed || '').trim(),
      productMode: detectProductMode(String(productType || effectiveShot.productType || '').trim()),
    })
    const finalNegativePrompt = buildVideoNegativePrompt(effectiveShot, compiled.finalNegativePrompt || defaultQualityNegativePrompt())
    const firstFramePath = String(
      shot.gptFrameConfirmed && shot.gptFirstFramePath
        ? shot.gptFirstFramePath
        : shot.generatedFirstFramePath || shot.gptFirstFramePath || shot.uploadedImagePath || '',
    ).trim()
    const lastFramePath = String(
      shot.gptFrameConfirmed && shot.gptLastFramePath
        ? shot.gptLastFramePath
        : shot.generatedLastFramePath || shot.gptLastFramePath || '',
    ).trim()
    const requestCapability = lastFramePath ? 'video_start_end_to_video' : 'video_image_to_video'
    const requestCredentials = await cloneRepo.getCredentials()
    const requestPreview = buildShotVideoRequestPreview({
      credentials: requestCredentials,
      capability: requestCapability,
      positivePrompt: finalPositivePrompt,
      negativePrompt: finalNegativePrompt,
      firstFramePath,
      lastFramePath,
      productReferenceImagePaths,
      modelReferenceImagePaths,
    })
    const requestQuality = (() => {
      const value = String(requestCredentials.openaiImageQuality || 'high').trim().toLowerCase()
      return value === 'low' || value === 'medium' || value === 'high' ? value : 'high'
    })()
    return {
      shotId: shot.id,
      promptBuildSentinel: SHOT_VIDEO_PROMPT_PREVIEW_SENTINEL,
      promptCompilerVersion: compiled.compilerVersion,
      consistencyMode: compiled.strictConsistencyMode ? 'strict' : 'standard',
      productType,
      productMode: detectProductMode(productType),
      productDescriptionText: productAnalysisText,
      productDescriptionBlock: buildProductDescriptionLockText(productAnalysisText),
      storyboardProductDescriptionBlock: buildProductDescriptionLockText(productAnalysisText),
      productReferenceUsageSummary,
      primaryProductReferenceImagePath,
      hasCompiledProductLock: Boolean(String(compiled.finalPrompt || '').trim()),
      hasProductDescriptionBlock: Boolean(String(productAnalysisText || '').trim()),
      hasScriptText: Boolean(String(shot.scriptText || '').trim()),
      hasGenerationPrompt: Boolean(String(shot.generationPrompt || '').trim()),
      scriptText: String(shot.scriptText || '').trim(),
      generationPrompt: sanitizeLegacyShotPromptText(String(shot.generationPrompt || '').trim(), productType),
      visualDescription: sanitizeLegacyShotPromptText(String(shot.visualDescription || '').trim(), productType),
      actionDescription: String(shot.actionDescription || '').trim(),
      cameraDescription: String(shot.cameraDescription || '').trim(),
      compiledPrompt: sanitizeLegacyShotPromptText(prompt, productType),
      startFramePrompt,
      endFramePrompt,
      compiledNegativePrompt: compiled.finalNegativePrompt,
      positivePrompt: finalPositivePrompt,
      negativePrompt: finalNegativePrompt,
      productReferenceImagePaths,
      productReferenceImageCount: productReferenceImagePaths.length,
      modelReferenceImagePaths,
      modelReferenceImageCount: modelReferenceImagePaths.length,
      scriptSpliceText,
      requestPayloadPreview: JSON.stringify(requestPreview.requestBody, null, 2),
      requestDebugLogPreview: JSON.stringify(requestPreview.debugLog, null, 2),
      requestProvider: requestPreview.debugLog.provider,
      requestModel: requestPreview.debugLog.model,
      requestCapability,
      requestEndpointStyle: requestPreview.debugLog.endpointStyle,
      requestCreateUrl: requestPreview.createUrl,
      localFirstFramePath: firstFramePath || undefined,
      localLastFramePath: lastFramePath || undefined,
      requestJson: JSON.stringify(
        {
          aspectRatio: '9:16',
          prompt: finalPositivePrompt,
          negativePrompt: finalNegativePrompt || undefined,
          quality: requestQuality,
          urls: [firstFramePath].filter(Boolean),
          model: requestPreview.debugLog.model || undefined,
          webHook: '-1',
        },
        null,
        2,
      ),
    }
  },

  async recompileShotConsistency(input: { cloneProjectId: string; shotId: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目不存在')
    const shot = item.blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    const compiled = promptConsistencyService.compileAndPersist({
      projectId: item.id,
      shot,
      projectShotCount: item.blueprint.shots.length,
      productReferenceImagePaths: shot.productReferenceImagePaths,
      productDescription: buildPromptProductDescriptionText(item, normalizeProductType(shot.productType)),
      modelIdentity: toPromptModelIdentity(selectedIdentityPack(item)),
    })
    const effectiveVideoPrompt = buildEffectiveVideoCompiledPrompt({
      shot,
      project: item,
      productType: normalizeProductType(shot.productType),
    })
    replaceProjectShot(item, shot.id, {
      compiledPrompt: sanitizeLegacyShotPromptText(effectiveVideoPrompt, normalizeProductType(shot.productType)),
      compiledNegativePrompt: compiled.finalNegativePrompt,
      promptCompilerVersion: compiled.compilerVersion,
      consistencyMode: compiled.strictConsistencyMode ? 'strict' : 'standard',
    })
    await cloneRepo.upsertProject(item)
    return compiled
  },

  async listShotConsistencyAnchors(input: { cloneProjectId: string; shotId: string }) {
    return promptConsistencyService.listShotConsistencyAnchors(input.cloneProjectId, input.shotId)
  },

  async listShotConsistencyPatches(input: { cloneProjectId: string; shotId: string }) {
    return promptConsistencyService.listShotConsistencyPatches(input.cloneProjectId, input.shotId)
  },

  async generateAllShotFrames(input: {
    cloneProjectId: string
    onlyMissing?: boolean
    which?: 'start' | 'end' | 'both'
    shotIds?: string[]
    productReferenceImagePaths?: string[]
    concurrency?: number
    forceRegenerate?: boolean
  }) {
    const base = await cloneRepo.getProject(input.cloneProjectId)
    if (!base || !base.blueprint) throw new Error('复刻项目或蓝图不存在')
    const onlyMissing = input.forceRegenerate ? false : input.onlyMissing !== false
    const which = input.which ?? 'both'
    const wanted = new Set((input.shotIds ?? []).map((x) => String(x)).filter(Boolean))
    const shots = base.blueprint.shots.filter((shot) => {
      if (wanted.size && !wanted.has(String(shot.id))) return false
      if (shot.locked) return false
      if (!onlyMissing) return true
      if (which === 'start') return !shot.generatedFirstFramePath
      if (which === 'end') return !shot.generatedLastFramePath
      return !(shot.generatedFirstFramePath && shot.generatedLastFramePath)
    })
    let done = 0
    let failed = 0
    let skipped = 0
    const errors: Array<{ shotId: string; index: number; reason: string }> = []
    const runtimeOptions = await cloneRepo.getRuntimeOptions()
    const envConcurrency = Number(process.env.CLONE_STORYBOARD_FRAME_CONCURRENCY || '')
    const requestedConcurrency = Number(
      input.concurrency ?? runtimeOptions.storyboardFrameConcurrency ?? envConcurrency ?? 3,
    )
    const frameConcurrency = Math.max(1, Math.min(6, Number.isFinite(requestedConcurrency) ? Math.floor(requestedConcurrency) : 3))
    const envGlobalConcurrency = Number(process.env.CLONE_GLOBAL_STORYBOARD_FRAME_CONCURRENCY || '')
    const globalFrameConcurrency = Math.max(
      1,
      Math.min(
        6,
        Number.isFinite(Number(runtimeOptions.globalStoryboardFrameConcurrency))
          ? Math.floor(Number(runtimeOptions.globalStoryboardFrameConcurrency))
          : Number.isFinite(envGlobalConcurrency) && envGlobalConcurrency > 0
            ? Math.floor(envGlobalConcurrency)
            : GLOBAL_STORYBOARD_FRAME_TASK_LIMIT,
      ),
    )
    console.log('[clone-debug] storyboard-frame-concurrency', {
      cloneProjectId: input.cloneProjectId,
      requestedConcurrency,
      frameConcurrency,
      globalFrameConcurrency,
      source: {
        inputConcurrency: input.concurrency ?? null,
        savedStoryboardFrameConcurrency: runtimeOptions.storyboardFrameConcurrency,
        savedGlobalStoryboardFrameConcurrency: runtimeOptions.globalStoryboardFrameConcurrency,
      },
    })
    const frameQueue = new PQueue({ concurrency: frameConcurrency })
    await Promise.all(
      shots.map((shot) =>
        frameQueue.add(async () => {
          try {
            await runStoryboardFrameTaskPoolJob({
              globalLimit: globalFrameConcurrency,
              worker: async () =>
                await cloneService.generateGptShotFrames({
                  cloneProjectId: input.cloneProjectId,
                  shotId: shot.id,
                  which,
                  forceRegenerate: Boolean(input.forceRegenerate),
                  productReferenceImagePaths: input.productReferenceImagePaths,
                }),
            })
            done += 1
          } catch (e: any) {
            failed += 1
            errors.push({ shotId: shot.id, index: shot.index, reason: String(e?.message ?? e) })
          }
        }),
      ),
    )
    const latest = await cloneRepo.getProject(input.cloneProjectId)
    const total = shots.length
    if (onlyMissing && latest?.blueprint?.shots?.length) {
      const candidate = latest.blueprint.shots.filter((shot) => {
        if (wanted.size && !wanted.has(String(shot.id))) return false
        if (shot.locked) return false
        return true
      })
      const ready = candidate.filter((shot) => {
        if (which === 'start') return Boolean(shot.generatedFirstFramePath)
        if (which === 'end') return Boolean(shot.generatedLastFramePath)
        return Boolean(shot.generatedFirstFramePath && shot.generatedLastFramePath)
      }).length
      skipped = Math.max(0, candidate.length - ready - failed)
    }
    const normalizedLatest = latest?.blueprint ? rebuildProjectStoryboardFrames(latest) : latest
    const savedLatest = normalizedLatest?.blueprint ? await cloneRepo.upsertProject(normalizedLatest) : latest
    return {
      project: savedLatest ?? base,
      queueSummary: { total, done, failed, skipped },
      errors,
    }
  },

  async batchQueryStoryboardImages(input: {
    cloneProjectId: string
    shotIds?: string[]
    productReferenceImagePaths?: string[]
  }) {
    const base = await cloneRepo.getProject(input.cloneProjectId)
    const recoveredBase = base ? await recoverLocalStoryboardFrames(base) : base
    const currentBase = recoveredBase?.blueprint ? recoveredBase : base
    const targetShotIds = Array.from(new Set((input.shotIds ?? []).map((item) => String(item || '').trim()).filter(Boolean)))
    const targetShots =
      currentBase?.blueprint?.shots?.filter((shot) =>
        targetShotIds.length ? targetShotIds.includes(String(shot.id || '').trim()) : true,
      ) ?? []
    const allTargetShotsReady =
      targetShots.length > 0 &&
      targetShots.every((shot) => Boolean(String(shot.gptFirstFramePath || shot.generatedFirstFramePath || '').trim()))
    if (!base || !base.blueprint) throw new Error('澶嶅埢椤圭洰鎴栬摑鍥句笉瀛樺湪')
    if (allTargetShotsReady && currentBase?.blueprint) {
      currentBase.storyboardFrames = projectBlueprintShots(currentBase)
        .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
        .map((shot, index) => {
          const existing = Array.isArray(currentBase.storyboardFrames)
            ? currentBase.storyboardFrames.find((frame) => frame.shotId === shot.id)
            : undefined
          const imagePath = String(shot.gptFirstFramePath || shot.generatedFirstFramePath || '').trim() || undefined
          const error = imagePath ? undefined : String(shot.gptFrameError || shot.error || '').trim() || undefined
          const isGenerating = String(shot.gptFrameStatus || '').trim().toLowerCase() === 'generating'
          return {
            id: existing?.id || randomUUID(),
            shotId: shot.id,
            batchId: existing?.batchId,
            imagePath,
            aspectRatio: '9:16' as const,
            status: isGenerating ? 'generating' : imagePath ? 'cropped' : 'failed',
            error,
            frameIndex: typeof existing?.frameIndex === 'number' ? existing.frameIndex : index,
            updatedAt: now(),
          }
        })
      const saved = await cloneRepo.upsertProject(currentBase)
      return {
        project: saved,
        queueSummary: {
          total: targetShotIds.length || targetShots.length,
          done: targetShotIds.length || targetShots.length,
          failed: 0,
          skipped: 0,
        },
        errors: [],
        imageProvider: imageProviderName(await cloneRepo.getCredentials()),
        imageModel: imageProviderModel(await cloneRepo.getCredentials()),
      }
    }
    const result = await this.generateAllShotFrames({
      cloneProjectId: input.cloneProjectId,
      onlyMissing: true,
      which: 'start',
      shotIds: input.shotIds,
      productReferenceImagePaths: input.productReferenceImagePaths,
    })
    const latest = (await cloneRepo.getProject(input.cloneProjectId)) || result.project || base
    if (!latest?.blueprint) throw new Error('澶嶅埢椤圭洰鎴栬摑鍥句笉瀛樺湪')
    latest.storyboardFrames = projectBlueprintShots(latest)
      .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
      .map((shot, index) => {
        const existing = Array.isArray(latest.storyboardFrames)
          ? latest.storyboardFrames.find((frame) => frame.shotId === shot.id)
          : undefined
        const imagePath = String(shot.gptFirstFramePath || shot.generatedFirstFramePath || '').trim() || undefined
        const error = imagePath ? undefined : String(shot.gptFrameError || shot.error || '').trim() || undefined
        const isGenerating = String(shot.gptFrameStatus || '').trim().toLowerCase() === 'generating'
        return {
          id: existing?.id || randomUUID(),
          shotId: shot.id,
          batchId: existing?.batchId,
          imagePath,
          aspectRatio: '9:16' as const,
          status: isGenerating ? 'generating' : imagePath ? 'cropped' : 'failed',
          error,
          frameIndex: typeof existing?.frameIndex === 'number' ? existing.frameIndex : index,
          updatedAt: now(),
        }
      })
    const saved = await cloneRepo.upsertProject(latest)
    return {
      project: saved,
      queueSummary: result.queueSummary,
      errors: result.errors,
      imageProvider: imageProviderName(await cloneRepo.getCredentials()),
      imageModel: imageProviderModel(await cloneRepo.getCredentials()),
    }
  },

  async qualityCheckCurrentShot(input: { cloneProjectId: string; shotId: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目或蓝图不存在')
    const shot = item.blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    const filePath = shot.uploadedAssetPath || shot.generatedClipPath
    if (!filePath) throw new Error('当前分镜没有可质检的视频')
    const q = await productionQualityCheckShot({
      shot,
      filePath,
      targetDurationSec: shot.durationSec,
    })
    item.blueprint = {
      ...item.blueprint,
      shots: item.blueprint.shots.map((s) =>
        s.id === shot.id
          ? {
              ...s,
              qualityStatus: q.qualityStatus,
              qualityScore: q.qualityScore,
              qualityReasons: q.qualityReasons,
              generatedClipDurationSec: q.generatedClipDurationSec,
              generatedClipWidth: q.generatedClipWidth,
              generatedClipHeight: q.generatedClipHeight,
              freezeRatio: q.freezeRatio,
              blackFrameRatio: q.blackFrameRatio,
              productVisibilityScore: q.productVisibilityScore,
              isMock: q.isMock,
              canEnterRender: q.canEnterRender,
              retrySuggestion: q.retrySuggestion,
              status: q.qualityStatus === 'failed' ? 'failed' : s.status,
              error: q.qualityStatus === 'failed' ? q.qualityReasons.join('；') : '',
            }
          : s,
      ),
    }
    return await cloneRepo.upsertProject(item)
  },

  async diagnoseProductImages(input: { imagePaths: string[] }) {
    const items = []
    for (const p of (input.imagePaths ?? []).map(String).filter(Boolean)) {
      const reasons: string[] = []
      try {
        const meta = await probeMedia(p)
        const width = Number(meta.width || 0)
        const height = Number(meta.height || 0)
        if (Math.min(width, height) < 640) reasons.push('分辨率偏低')
        const s = await stat(p)
        if (s.size < 80 * 1024) reasons.push('文件过小，可能不清晰')
        if (/transparent|alpha|\.png$/i.test(p) && s.size < 300 * 1024) reasons.push('可能是透明图或主体信息不足')
        items.push({ path: p, width, height, ok: reasons.length === 0, reasons })
      } catch (e: any) {
        items.push({ path: p, ok: false, reasons: ['无法诊断: ' + String(e?.message ?? e)] })
      }
    }
    const bad = items.filter((x) => !x.ok)
    return {
      ok: bad.length === 0,
      message: bad.length
        ? '当前产品参考图不清晰，AI 可能无法稳定保持商品一致，建议上传白底主图 + 佩戴图 + 细节图。'
        : '产品参考图基础质量正常',
      items,
    }
  },

  async renderPreview(input: { cloneProjectId: string; outputDir?: string; shotIds?: string[] }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('澶嶅埢椤圭洰鎴栬摑鍥句笉瀛樺湪')
    const creds = await cloneRepo.getCredentials()
    const outDir = String(input.outputDir ?? '').trim() || join(getAppPaths().dataDir, 'viral-clone', item.id, 'outputs')
    const targetIds = new Set((input.shotIds ?? []).map((x) => String(x)).filter(Boolean))
    const scopedShots = targetIds.size ? item.blueprint.shots.filter((shot) => targetIds.has(String(shot.id))) : item.blueprint.shots
    const issues = buildPreflightIssues(scopedShots, item, { allowMockCompose: isLocalMockTestMode(creds) })
    if (issues.length) throw new Error('出片前检查失败：' + issues.slice(0, 8).join('；'))
    let shots = renderableShots(scopedShots, item)
    if (!shots.length) {
      shots = fallbackRenderableShots(scopedShots, item)
      console.log('[clone-debug] render-preview-fallback-renderable-shots', {
        cloneProjectId: item.id,
        scopedShotCount: scopedShots.length,
        fallbackCount: shots.length,
      })
    }
    if (!shots.length) throw new Error('没有可用于预览的分镜素材')
    const rendered = await renderViralCloneBatch({
      projectId: item.id,
      shots,
      outDir,
      count: 1,
      bgmPath: item.referenceVideoPath,
      maxRetry: item.policy.retries,
    })
    return { output: rendered.outputs[0] ?? '', outputs: rendered.outputs, reportPath: rendered.reportPath ?? '' }
  },

  async renderBatch(input: { cloneProjectId: string; count: number; outputDir?: string; retryFailed?: boolean }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目或蓝图不存在')
    const creds = await cloneRepo.getCredentials()
    const outDir = String(input.outputDir ?? '').trim() || join(getAppPaths().dataDir, 'viral-clone', item.id, 'outputs')
    const issues = buildPreflightIssues(item.blueprint.shots, item, { allowMockCompose: isLocalMockTestMode(creds) })
    if (issues.length) throw new Error('出片前检查失败：' + issues.slice(0, 10).join('；'))
    let shots = renderableShots(item.blueprint.shots, item)
    if (!shots.length) {
      shots = fallbackRenderableShots(item.blueprint.shots, item)
      console.log('[clone-debug] render-batch-fallback-renderable-shots', {
        cloneProjectId: item.id,
        scopedShotCount: item.blueprint.shots.length,
        fallbackCount: shots.length,
      })
    }
    const mergedShots = shots.sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    if (!mergedShots.length) throw new Error('没有可用于批量生成的分镜素材')
    const rendered = await renderViralCloneBatch({
      projectId: item.id,
      shots: mergedShots,
      outDir,
      count: Math.max(1, Math.floor(Number(input.count) || 1)),
      bgmPath: item.referenceVideoPath,
      maxRetry: input.retryFailed ? Math.max(1, item.policy.retries) : 0,
    })
    item.outputDir = outDir
    item.status = 'ready_for_review'
    patchWorkflowV2(item, 'final_compose', 'final_compose', 'done')
    await cloneRepo.upsertProject(item)
    return rendered
  },

  async getGenerationQueue(input: { cloneProjectId: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    return createCloneGenerationQueue(item)
  },

  async pauseGenerationQueue(input: { cloneProjectId: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    pauseCloneGenerationQueue(item)
    await cloneRepo.upsertProject(item)
    return item.generationQueue
  },

  async resumeGenerationQueue(input: { cloneProjectId: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    resumeCloneGenerationQueue(item)
    await cloneRepo.upsertProject(item)
    return item.generationQueue
  },

  async saveCloneTemplate(input: { cloneProjectId: string; name?: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('澶嶅埢椤圭洰鎴栬摑鍥句笉瀛樺湪')
    const created = await templatesRepo.upsert({
      ...mapCloneBlueprintToTemplate(item),
      name: String(input.name ?? '').trim() || mapCloneBlueprintToTemplate(item).name,
    } as any)
    item.templateId = created.id
    await cloneRepo.upsertProject(item)
    return { templateId: created.id, templateName: created.name }
  },

  async convertToNormalTemplate(input: { cloneProjectId: string; name?: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目或蓝图不存在')
    const segmentDurationSec: Record<string, { min: number; max: number }> = {}
    const structure: string[] = []
    for (const shot of item.blueprint.shots) {
      const seg = mapRoleToTemplateSegment(shot.role)
      if (!structure.includes(seg)) structure.push(seg)
      const dur = Number(shot.durationSec || 1.5)
      const existing = segmentDurationSec[seg]
      if (!existing) segmentDurationSec[seg] = { min: Math.max(0.8, dur * 0.9), max: Math.max(1.0, dur * 1.1) }
      else segmentDurationSec[seg] = { min: Math.min(existing.min, dur * 0.9), max: Math.max(existing.max, dur * 1.1) }
    }
    const total = Number(item.blueprint.totalDurationSec || 15)
    const converted = await templatesRepo.upsert({
      name: String(input.name ?? '').trim() || '普通模板-' + item.referenceVideoName.replace(/\.[^.]+$/, ''),
      segmentSyncMode: 'fixed',
      structure,
      totalDurationSec: { min: Math.max(6, Math.floor(total * 0.9)), max: Math.max(8, Math.ceil(total * 1.1)) },
      segmentDurationSec,
      transition: { enabled: true, pool: ['hardcut', 'fade'], durationSec: { min: 0.08, max: 0.2 } } as any,
      randomizeOrder: { mode: 'none' },
      audio: { source: 'mute', ducking: { enabled: false, amountDb: 0 } },
    } as any)
    item.templateId = converted.id
    await cloneRepo.upsertProject(item)
    return { templateId: converted.id, templateName: converted.name }
  },

  async generateAiShots(input: {
    cloneProjectId: string
    shotIds: string[]
    videoPlanId?: string
    providerPolicy?: { chain?: AiProviderName[] }
    qualityProfile?: 'high'
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('澶嶅埢椤圭洰鎴栬摑鍥句笉瀛樺湪')
    let blueprint = item.blueprint
    if (input.videoPlanId && item.baseBlueprint?.videoPlans?.length) {
      const plan = item.baseBlueprint.videoPlans.find((p) => p.id === input.videoPlanId)
      if (!plan) throw new Error('指定的视频方案不存在')
      const variantMap = new Map<string, ShotVariant>()
      const allVariants = item.baseBlueprint.variants ?? {}
      for (const row of plan.structure) {
        const hit = (allVariants[row.shotId] ?? []).find((v) => v.id === row.variantId)
        if (hit) variantMap.set(row.shotId, hit)
      }
        blueprint = {
          ...blueprint,
          shots: blueprint.shots.map((s) => {
            const v = variantMap.get(s.id)
            if (!v) return s
            const productInfo = String(s.materialNeed || s.productFocus || '').trim()
            return {
              ...s,
              scriptRole: v.scriptRole,
              scriptText: v.scriptText,
              visualDescription: v.visualDescription,
              actionDescription: v.actionDescription,
              cameraDescription: v.cameraDescription,
              productFocus: v.productDisplay,
              generationPrompt: v.generationPrompt,
              aiPrompt: buildVideoPlanShotPrompt({ shot: s, variant: v, productInfo }),
              negativePrompt: v.negativePrompt || s.negativePrompt,
              textOverlay: {
                ...s.textOverlay,
              content: v.textOverlay.content,
              position: v.textOverlay.position,
              fontSize:
                v.textOverlay.fontSize === 'small' ||
                v.textOverlay.fontSize === 'medium' ||
                v.textOverlay.fontSize === 'large' ||
                v.textOverlay.fontSize === 'extra_large'
                  ? v.textOverlay.fontSize
                  : s.textOverlay?.fontSize,
              style: v.textOverlay.style,
            },
          }
        }),
      }
      item.blueprint = blueprint
      if (item.baseBlueprint?.videoPlans) {
        item.baseBlueprint.videoPlans = item.baseBlueprint.videoPlans.map((p) =>
          p.id === plan.id ? { ...p, status: 'generating' } : p,
        )
      }
    }
    const creds = await cloneRepo.getCredentials()
    let product = await ensureProjectAssetBankProduct(item)
    const outDir = join(getAppPaths().tmpDir, 'clone-ai-shots', item.id)
    await mkdir(outDir, { recursive: true })

    const targetIds = new Set((input.shotIds ?? []).map((x) => String(x)))
    const targetShots = sortCloneShotsForBatch(blueprint.shots.filter((shot) => targetIds.has(shot.id)))
    for (const shot of targetShots) {
      const queueState = createCloneGenerationQueue(item)
      if (queueState.paused) {
        patchQueueJobStatus(item, shot.id, 'queued', Number(shot.retryCount ?? 0))
        continue
      }
      if (shot.qualityStatus === 'passed' && (shot.uploadedAssetPath || isCloudGeneratedShot(shot))) {
        patchQueueJobStatus(item, shot.id, 'skipped', Number(shot.retryCount ?? 0))
        continue
      }
      if (shot.realismRisk === 'high' && !shot.forceAi) {
        patchQueueJobStatus(item, shot.id, 'skipped', Number(shot.retryCount ?? 0))
        continue
      }
      if (Number(shot.retryCount ?? 0) >= (shot.qualityMode === 'high' ? 2 : shot.qualityMode === 'standard' ? 1 : 0)) {
        patchQueueJobStatus(item, shot.id, 'skipped', Number(shot.retryCount ?? 0))
        continue
      }
      if (!targetIds.has(shot.id)) continue
      const matchedLocalAsset = await matchLocalAssetsForShot(item, shot)
      if (matchedLocalAsset) {
        item.blueprint = {
          ...blueprint,
          shots: blueprint.shots.map((s) =>
            s.id === shot.id
              ? {
                  ...s,
                  uploadedAssetPath: matchedLocalAsset.asset.filePath,
                  generatedSource: 'local',
                  selectedAssetId: matchedLocalAsset.asset.id,
                  assetMatchScore: matchedLocalAsset.candidate.score,
                  assetMatchLabel: '已命中真实素材',
                  assetMatchReasons: matchedLocalAsset.candidate.reasons,
                  assetMatchDetail: matchedLocalAsset.candidate.detail,
                  replacementMode: 'local_video',
                  qualityStatus: 'passed',
                  qualityScore: Math.max(80, matchedLocalAsset.candidate.score),
                  qualityReasons: ['已复用本地真实视频素材', ...matchedLocalAsset.candidate.reasons],
                  canEnterRender: true,
                  status: 'ready',
                  error: '',
                }
              : s,
          ),
        }
        patchQueueJobStatus(item, shot.id, 'done', Number(shot.retryCount ?? 0))
        continue
      }
      enqueueCloneShotJob({
        project: item,
        shot,
        retryCount: Number(shot.retryCount ?? 0),
        priority:
          (shot.realismRisk === 'low' ? 0 : shot.realismRisk === 'medium' ? 10 : 20) +
          Math.round(Number(shot.durationSec || 0) * 10) +
          (100 - Math.round(Number(shot.assetMatchScore || 0))),
      })
      try {
        const next = await ensureShotVideoState(item.id, shot.id, 'submit_if_needed')
        item.blueprint = next.blueprint
        item.generationQueue = next.generationQueue
      } catch (e: any) {
        patchQueueJobStatus(item, shot.id, 'failed', Number(shot.retryCount ?? 0) + 1)
        item.lastError = String(e?.message ?? e)
      }
    }
    if (input.videoPlanId && item.baseBlueprint?.videoPlans) {
      item.baseBlueprint.videoPlans = item.baseBlueprint.videoPlans.map((p) =>
        p.id === input.videoPlanId ? { ...p, status: 'done' } : p,
      )
      item.blueprint = item.blueprint
        ? {
            ...item.blueprint,
            videoPlans: item.baseBlueprint.videoPlans,
          }
        : item.baseBlueprint
    }
    await cloneRepo.upsertProject(item)
    item.productId = product.id
    item.status = 'materials_ready'
    return await cloneRepo.upsertProject(item)
  },

  async generateShotKeyframes(input: {
    cloneProjectId: string
    shotIds: string[]
    targetProductId?: string
    providerPolicy?: { chain?: AiProviderName[] }
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('澶嶅埢椤圭洰鎴栬摑鍥句笉瀛樺湪')
    const creds = await cloneRepo.getCredentials()
    const outDir = join(getAppPaths().tmpDir, 'clone-keyframes', item.id)
    await mkdir(outDir, { recursive: true })
    const chain = videoProviderChain(creds) as any
    const targetIds = new Set((input.shotIds ?? []).map((x) => String(x)))
    for (const shot of item.blueprint.shots) {
      if (!targetIds.has(shot.id)) continue
      assertShotEligibleForAi(shot)
      assertShotHasScriptPrompt(shot)
      if (!hasProductLock(shot, shot.productReferenceImagePaths)) throw new Error('分镜 #' + (shot.index + 1) + ' 缺少产品参考图或产品锁定信息')
      const taskId = randomUUID()
      item.aiTasks.unshift({
        id: taskId,
        projectId: item.id,
        shotId: shot.id,
        taskType: 'keyframe_start',
        provider: chain[0] ?? 'seedance',
        status: 'running',
        createdAt: now(),
        updatedAt: now(),
      })
      await cloneRepo.upsertProject(item)
      try {
        const frames = await generateShotKeyframesByProviderChain({
          shot,
          outDir,
          referenceVideoPath: item.referenceVideoPath,
          credentials: creds,
          chain,
        })
        item.blueprint = {
          ...item.blueprint,
          shots: item.blueprint.shots.map((s) =>
            s.id === shot.id
              ? {
                  ...s,
                  keyframes: {
                    startFrame: frames.startFrame,
                    endFrame: frames.endFrame,
                    styleHints: s.keyframes?.styleHints ?? [s.visual, s.materialNeed],
                    consistencyMode: s.keyframes?.consistencyMode ?? 'soft',
                  },
                }
              : s,
          ),
        }
        item.aiTasks = item.aiTasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: 'done',
                provider: frames.startFrame.provider,
                remoteTaskId: frames.startFrame.taskId,
                outputFilePath: frames.startFrame.filePath + '|' + frames.endFrame.filePath,
                updatedAt: now(),
              }
            : t,
        )
      } catch (e: any) {
        item.aiTasks = item.aiTasks.map((t) =>
          t.id === taskId ? { ...t, status: 'error', error: String(e?.message ?? e), updatedAt: now() } : t,
        )
      }
    }
    return await cloneRepo.upsertProject(item)
  },

  async regenerateShotKeyframe(input: {
    cloneProjectId: string
    shotId: string
    which: 'start' | 'end'
    promptOverrides?: Partial<ShotSpec['prompt']>
    providerPolicy?: { chain?: AiProviderName[] }
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('澶嶅埢椤圭洰鎴栬摑鍥句笉瀛樺湪')
    const shot = item.blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    assertShotEligibleForAi(shot)
    const creds = await cloneRepo.getCredentials()
    const chain = videoProviderChain(creds) as any
    const taskId = randomUUID()
    const outDir = join(getAppPaths().tmpDir, 'clone-keyframes', item.id)
    await mkdir(outDir, { recursive: true })
    try {
      const regenerated = await regenerateOneShotKeyframeByProviderChain({
        shot: input.promptOverrides ? { ...shot, prompt: { ...shot.prompt, ...input.promptOverrides } } : shot,
        which: input.which,
        outDir,
        referenceVideoPath: item.referenceVideoPath,
        credentials: creds,
        chain,
      })
      item.blueprint = {
        ...item.blueprint,
        shots: item.blueprint.shots.map((s) => (s.id === input.shotId ? patchShotKeyframe(s, input.which, regenerated) : s)),
      }
      item.aiTasks.unshift({
        id: taskId,
        projectId: item.id,
        shotId: input.shotId,
        taskType: input.which === 'start' ? 'keyframe_start' : 'keyframe_end',
        provider: regenerated.provider,
        status: 'done',
        createdAt: now(),
        updatedAt: now(),
        remoteTaskId: regenerated.taskId,
        outputFilePath: regenerated.filePath,
      })
      return await cloneRepo.upsertProject(item)
    } catch (e: any) {
      throw new Error('关键帧重生失败: ' + String(e?.message ?? e))
    }
  },

  async generateShotVideos(input: {
    cloneProjectId: string
    sessionId?: string
    shotIds: string[]
    consistencyMode?: ConsistencyMode
    providerPolicy?: { chain?: AiProviderName[] }
  }) {
    let item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('澶嶅埢椤圭洰鎴栬摑鍥句笉瀛樺湪')
    let blueprint = item.blueprint
    const creds = await cloneRepo.getCredentials()
    let product = await ensureProjectAssetBankProduct(item)
    const outDir = join(getAppPaths().tmpDir, 'clone-shot-videos', item.id)
    await mkdir(outDir, { recursive: true })
    const chain = videoProviderChain(creds) as any
    const targetIds = new Set((input.shotIds ?? []).map((x) => String(x)))
    for (const shot of blueprint.shots) {
      if (!targetIds.has(shot.id)) continue
      assertShotEligibleForAi(shot)
      if (!hasProductLock(shot, shot.productReferenceImagePaths)) throw new Error('分镜 #' + (shot.index + 1) + ' 缺少产品参考图或产品锁定信息')
      const existing = resolveShotVideoOutput(item, shot)
      if (await canReuseShotVideo(existing)) {
        const reusedPath = String(existing.videoPath || existing.localPath || '').trim()
        if (reusedPath) {
          blueprint = {
            ...blueprint,
            shots: blueprint.shots.map((s) =>
              s.id === shot.id
                ? {
                    ...s,
                    generatedClipPath: reusedPath,
                    generatedSource: 'cloud',
                    generatedProvider: existing.provider || s.generatedProvider,
                    generatedModel: existing.model || s.generatedModel,
                    generatedTaskId: resolveEffectiveVideoTaskId(existing.taskId, s.generatedTaskId) || undefined,
                    status: 'done',
                    error: '',
                  }
                : s,
            ),
          }
          syncSegmentVideoOutput(item, shot, {
            status: 'done',
            taskId: resolveEffectiveVideoTaskId(existing.taskId, shot.generatedTaskId) || undefined,
            provider: existing.provider,
            model: existing.model,
            endpointStyle: existing.endpointStyle,
            requestCapability: existing.requestCapability,
            remoteStatus: existing.remoteStatus === 'created' ? 'succeeded' : existing.remoteStatus || 'succeeded',
            remoteRaw: existing.remoteRaw,
            videoUrl: existing.videoUrl || reusedPath,
            localPath: reusedPath,
            videoPath: reusedPath,
            error: undefined,
            completedAt: existing.completedAt || now(),
          })
          continue
        }
      }
      const reusableTaskId = resolveEffectiveVideoTaskId(existing.taskId, shot.generatedTaskId)
      if ((existing.status === 'done' || existing.status === 'remote_running' || isDownloadReadyShotStatus(existing.status)) && reusableTaskId) {
        const recovered = await recoverAi666TaskById({
          credentials: creds,
          taskId: reusableTaskId,
          outDir,
          baseUrl: existing.baseUrl,
          endpointStyle: existing.endpointStyle,
          model: existing.model,
        })
        if (recovered.synced && recovered.outputPath) {
          const saved = await saveSegmentDone({
            project: item,
            shot,
            taskId: reusableTaskId,
            provider: existing.provider || 'apifox_hub',
            model: existing.model || videoProviderModel(creds),
            endpointStyle: existing.endpointStyle || resolveApifoxHubCredentials(creds, 'video')?.videoEndpointStyle,
            baseUrl: existing.baseUrl || resolveApifoxHubCredentials(creds, 'video')?.baseUrl,
            requestCapability: existing.requestCapability || 'video_start_end_to_video',
            videoUrl: recovered.task.outputUrls[0],
            localPath: recovered.outputPath,
            remoteStatus: recovered.task.status,
            remoteRaw: recovered.task.raw,
          })
          item = saved
          blueprint = item.blueprint as CloneBlueprint
          product = await ensureProjectAssetBankProduct(item)
          continue
        }
        if (recovered.task.status === 'failed') {
          syncSegmentVideoOutput(item, shot, {
            status: 'failed_terminal',
            taskId: existing.taskId,
            provider: existing.provider,
            model: existing.model,
            endpointStyle: existing.endpointStyle,
            requestCapability: existing.requestCapability,
            remoteStatus: recovered.task.status,
            remoteRaw: recovered.task.raw,
            error: recovered.task.errorMessage || '云端任务失败',
            lastPollAt: now(),
          })
          item = await cloneRepo.upsertProject(item)
          blueprint = item.blueprint as CloneBlueprint
          continue
        }
      }
      if (existing.status !== 'idle' && existing.status !== 'failed_terminal' && existing.status !== 'failed_retryable') {
        continue
      }
      const startPath = shot.keyframes?.startFrame?.filePath
      const endPath = shot.keyframes?.endFrame?.filePath
      if (!startPath || !endPath) throw new Error('分镜 ' + (shot.index + 1) + ' 缺少首尾帧，无法生成视频')
      try {
        let activeShot = shot
        const normalizedAiPrompt = normalizeLegacyShotPromptForPersistence(activeShot)
        if (normalizedAiPrompt && normalizedAiPrompt !== String(activeShot.aiPrompt || '').trim()) {
          replaceProjectShot(item, activeShot.id, { aiPrompt: normalizedAiPrompt })
          item = await cloneRepo.upsertProject(item)
          blueprint = item.blueprint as CloneBlueprint
          const refreshedShot = blueprint.shots.find((s) => s.id === activeShot.id)
          if (refreshedShot) activeShot = refreshedShot
        }
        const current = resolveShotVideoOutput(item, activeShot)
        let generated = null as Awaited<ReturnType<typeof generateShotVideoByProviderChain>> | null
        const currentVideoTaskId = resolveEffectiveVideoTaskId(current.taskId, activeShot.generatedTaskId)
        if (currentVideoTaskId) {
          const recovered = await recoverAi666TaskById({
            credentials: creds,
            taskId: currentVideoTaskId,
            outDir,
            baseUrl: current.baseUrl,
            endpointStyle: current.endpointStyle,
            model: current.model,
          })
          if (recovered.synced && recovered.outputPath) {
            const saved = await saveSegmentDone({
              project: item,
              shot: activeShot,
              taskId: currentVideoTaskId,
              provider: current.provider || 'apifox_hub',
              model: current.model || videoProviderModel(creds),
              endpointStyle: current.endpointStyle || resolveApifoxHubCredentials(creds, 'video')?.videoEndpointStyle,
              baseUrl: current.baseUrl || resolveApifoxHubCredentials(creds, 'video')?.baseUrl,
              requestCapability: current.requestCapability || 'video_start_end_to_video',
              videoUrl: recovered.task.outputUrls[0],
              localPath: recovered.outputPath,
              remoteStatus: recovered.task.status,
              remoteRaw: recovered.task.raw,
            })
            item = saved
            product = await ensureProjectAssetBankProduct(item)
            continue
          }
        }
        generated = await generateShotVideoByProviderChain({
          project: item,
          shot: activeShot,
          outDir,
          startFramePath: startPath,
          endFramePath: endPath,
          consistencyMode: input.consistencyMode ?? activeShot.keyframes?.consistencyMode ?? 'soft',
          credentials: creds,
          chain,
        })
        const segment = segmentKeyByPurpose(activeShot.purpose)
        const appended = await upsertAssetToProduct({ product, segment, filePath: generated.outputFilePath })
        product = appended.product
        const taskId = String(generated.remoteTaskId || current.taskId || activeShot.generatedTaskId || '').trim()
        blueprint = {
          ...blueprint,
          shots: blueprint.shots.map((s) =>
            s.id === activeShot.id ? { ...s, sourceMode: 'ai', aiEnabled: true, aiGeneratedAssetId: appended.asset.id } : s,
          ),
        }
        item.aiTasks = item.aiTasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                provider: generated.provider,
                remoteTaskId: generated.remoteTaskId,
                outputFilePath: generated.outputFilePath,
                status: 'done',
                updatedAt: now(),
              }
            : t,
        )
      } catch (e: any) {
        const reason = String(e?.message ?? e)
        const current = resolveShotVideoOutput(item, shot)
        syncSegmentVideoOutput(item, shot, {
          status: current.taskId ? 'failed_retryable' : 'failed_terminal',
          taskId: current.taskId,
          provider: current.provider,
          model: current.model,
          endpointStyle: current.endpointStyle,
          requestCapability: current.requestCapability || 'video_start_end_to_video',
          remoteStatus: current.remoteStatus,
          remoteRaw: current.remoteRaw,
          error: reason,
          lastPollAt: now(),
        })
        item.lastError = reason
        setProjectErrorContext(item, {
          ...apifoxContextByCapability(creds, 'video_start_end_to_video'),
          action: 'generate_shot_clip',
          taskId: current.taskId,
          message: reason,
          responseSnippet: reason,
        })
        item = await cloneRepo.upsertProject(item)
      }
    }
    item.blueprint = blueprint
    item.productId = product.id
    item.status = 'materials_ready'
    return await cloneRepo.upsertProject(item)
  },

  async createSession(input: {
    cloneProjectId: string
    targetProductId: string
    count: number
    outputDir?: string
    qualityProfile?: 'high'
    variantStrength?: 'low' | 'medium' | 'high'
    pipelineMode?: 'keyframe_then_video'
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('澶嶅埢椤圭洰鎴栬摑鍥句笉瀛樺湪')
    const targetProduct = (await productsRepo.list()).find((x) => x.id === input.targetProductId)
    if (!targetProduct) throw new Error('目标商品不存在')

    const count = Math.max(1, Math.floor(Number(input.count) || 1))
    const sessionId = randomUUID()
    const outDir = makeSessionOutputDir(item.id, sessionId, input.outputDir || item.outputDir)
    await mkdir(outDir, { recursive: true })

    const missingShots: string[] = []
    for (const shot of item.blueprint.shots) {
      const seg = segmentKeyByPurpose(shot.purpose)
      const hasSegAsset = (targetProduct.assets[seg] ?? []).length > 0
      if (!hasSegAsset && !shot.aiEnabled) missingShots.push(shot.id)
    }
    if (missingShots.length) {
      throw new Error('目标产品素材不足，缺少分镜：' + missingShots.join(', '))
    }

    const template = await ensureDerivedTemplate({
      project: item,
      sessionId,
      count,
      variantStrength: input.variantStrength ?? item.defaultGenerationPolicy?.variantStrength ?? 'medium',
    })

    const built = await createBatchTasks({
      productId: targetProduct.id,
      templateId: template.id,
      count,
      outDir,
    })
    for (const t of built.tasks) taskQueue.enqueue(t)
    const taskIds = built.tasks.map((x: any) => String(x.id))
    const session: ReplicaSession = {
      sessionId,
      cloneProjectId: item.id,
      targetProductId: targetProduct.id,
      outputDir: outDir,
      qualityProfile: 'high',
      derivedTemplateId: template.id,
      taskIds,
      qualityStats: { total: taskIds.length, passed: 0, rejected: 0, failed: 0, avgScore: 0 },
      reviewStats: { pending: taskIds.length, keep: 0, reject: 0 },
      pipelineStats: { keyframePassRate: 0, shotPassRate: 0, regenCount: 0 },
      results: {},
      createdAt: now(),
      updatedAt: now(),
    }
    item.sessions = [...(item.sessions ?? []), session]
    item.outputDir = String(input.outputDir ?? '').trim() || item.outputDir
    item.status = 'generating'
    item.defaultGenerationPolicy = {
      qualityProfile: 'high',
      variantStrength: input.variantStrength ?? item.defaultGenerationPolicy?.variantStrength ?? 'medium',
    }
    const saved = await cloneRepo.upsertProject(item)
    return { project: saved, session, enqueueMeta: built.meta }
  },

  async listSessionResults(input: {
    cloneProjectId: string
    sessionId?: string
    filters?: { status?: Array<'pending' | 'passed' | 'rejected' | 'failed'>; onlyLowScore?: boolean; targetProductId?: string }
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    const tasks = await taskQueue.list()
    const bp = item.baseBlueprint ?? item.blueprint
    const expectedDur = Number(bp?.totalDurationSec ?? 15)
    const sourceSummary = summarizeShotSources(bp?.shots ?? [])
    const providerSummary = summarizeProviders(item)
    const sessions = (item.sessions ?? []).filter((s) => {
      if (input.sessionId && s.sessionId !== input.sessionId) return false
      if (input.filters?.targetProductId && s.targetProductId !== input.filters.targetProductId) return false
      return true
    })

    for (const session of sessions) {
      for (const taskId of session.taskIds) {
        const task = tasks.find((x) => String(x.id) === taskId)
        if (!task) continue
        const existing = session.results[taskId]
        if (task.status !== 'done') {
          session.results[taskId] = existing ?? {
            taskId,
            status: 'pending',
            qualityScore: 0,
            reasons: [],
            shotSourceSummary: sourceSummary,
            providerSummary,
            checkedAt: now(),
          }
          continue
        }
        if (existing && existing.status !== 'pending') continue
        try {
          const quality = await assessOutputQuality({
            outPath: String(task.outPath),
            expectedDurationSec: expectedDur,
            gate: item.policy.qualityGate,
          })
          session.results[taskId] = {
            taskId,
            status: quality.passed ? 'passed' : 'rejected',
            qualityScore: quality.score,
            reasons: quality.reasons,
            shotSourceSummary: sourceSummary,
            providerSummary,
            checkedAt: now(),
          }
        } catch (e: any) {
          session.results[taskId] = {
            taskId,
            status: 'failed',
            qualityScore: 0,
            reasons: [String(e?.message ?? e)],
            shotSourceSummary: sourceSummary,
            providerSummary,
            checkedAt: now(),
          }
        }
      }
      const stats = buildSessionStats(session, item.reviewDecisions ?? {})
      session.qualityStats = stats.qualityStats
      session.reviewStats = stats.reviewStats
      const allShots = bp?.shots ?? []
      const kfReady = allShots.filter((s) => s.keyframes?.startFrame && s.keyframes?.endFrame).length
      const shotReady = allShots.filter((s) => s.aiGeneratedAssetId || s.sourceMode === 'uploaded').length
      const denom = Math.max(1, allShots.length)
      session.pipelineStats = {
        keyframePassRate: Number((kfReady / denom).toFixed(2)),
        shotPassRate: Number((shotReady / denom).toFixed(2)),
        regenCount: (item.aiTasks ?? []).filter((t) => t.taskType === 'keyframe_start' || t.taskType === 'keyframe_end').length,
      }
      session.updatedAt = now()
    }

    item.sessions = item.sessions.map((x) => sessions.find((s) => s.sessionId === x.sessionId) ?? x)
    if (sessions.some((s) => s.qualityStats.total > 0)) item.status = 'ready_for_review'
    await cloneRepo.upsertProject(item)

    const statuses = new Set(input.filters?.status ?? [])
    const rows = sessions.flatMap((s) =>
      s.taskIds.map((taskId) => {
        const t = tasks.find((x) => String(x.id) === taskId)
        const result = s.results[taskId]
        return {
          sessionId: s.sessionId,
          targetProductId: s.targetProductId,
          ...(result ?? {
            status: 'pending',
            qualityScore: 0,
            reasons: [],
            shotSourceSummary: sourceSummary,
            providerSummary,
            checkedAt: now(),
          }),
          taskId: result?.taskId ?? taskId,
          outPath: String(t?.outPath ?? ''),
          taskStatus: String(t?.status ?? 'queued'),
          progress: Number(t?.progress ?? 0),
          reviewStatus: (item.reviewDecisions?.[taskId] ?? 'pending') as CloneReviewStatus,
        }
      }),
    )
    const filteredRows = rows.filter((x) => {
      if (statuses.size && !statuses.has(x.status as any)) return false
      if (input.filters?.onlyLowScore && Number(x.qualityScore || 0) >= 70) return false
      return true
    })
    return { project: item, sessions: item.sessions, results: filteredRows }
  },

  async updateSessionReview(input: {
    cloneProjectId: string
    taskId: string
    reviewStatus: CloneReviewStatus
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    item.reviewDecisions = {
      ...(item.reviewDecisions ?? {}),
      [String(input.taskId)]: input.reviewStatus,
    }
    for (const s of item.sessions ?? []) {
      const stats = buildSessionStats(s, item.reviewDecisions)
      s.reviewStats = stats.reviewStats
      s.updatedAt = now()
    }
    return await cloneRepo.upsertProject(item)
  },

  // Legacy compatibility
  async createReplicas(input: {
    cloneProjectId: string
    count: number
    outputDir?: string
    reviewMode?: 'manual'
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    const fallbackProductId = item.sessions?.[item.sessions.length - 1]?.targetProductId
    const targetProductId = fallbackProductId || item.productId
    if (!targetProductId) throw new Error('请先选择目标产品并使用 createSession')
    return await this.createSession({
      cloneProjectId: input.cloneProjectId,
      targetProductId,
      count: input.count,
      outputDir: input.outputDir,
      qualityProfile: 'high',
      variantStrength: item.defaultGenerationPolicy?.variantStrength ?? 'medium',
    })
  },

  async updateReplicaReview(input: {
    cloneProjectId: string
    taskId: string
    reviewStatus: CloneReviewStatus
  }) {
    return await this.updateSessionReview(input)
  },
}

export const __cloneServiceInternals = {
  ensureAi666SegmentVideoTask,
  isShotVideoSubmissionLocked,
  isShotVideoMissingTaskGraceActive,
  computeShotVideoSubmissionFingerprint,
  buildShotVideoCreatingLockReason,
  SHOT_VIDEO_SUBMISSION_LOCK_MS,
  SHOT_VIDEO_MISSING_TASK_GRACE_MS,
}
