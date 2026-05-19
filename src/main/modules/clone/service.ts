import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { canUseMockGeneration } from './mockPolicy'
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
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
  buildGptFramePrompt,
  defaultModelIdentityDescription,
  generateGptShotFrameImage,
  generateModelIdentityPackImages,
} from './gptImage'
import {
  buildCloneShotPrompt,
  buildCloneNegativePrompt,
  buildProductLockText,
  buildRealismInstruction,
  buildNoSpeakingInstruction,
  prependSilentCommercialGlobalRule,
  sanitizeGeneratedVideoPrompt,
  sanitizeNegativePrompt,
  buildTextSafetyInstruction,
  buildShotScriptConstraintText,
  expandCommercialVideoPrompt,
} from './prompt'
import { generateChatCompletion } from './unifiedChat'
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
  CloneProjectSummary,
  CloneRunMode,
} from './types'
import type { MediaAsset, Product } from '../products/types'
import { queryGrsCredits } from './grsai'
import { cleanAiText, extractJsonObjectText, extractModelMessageContent } from './aiResponse'
import { downloadAtlasToFile } from './atlasRetry'
import { promptConsistencyService } from './prompt-consistency/service'

function now() {
  return Date.now()
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

function isCompletedVideoShotStatus(value: unknown) {
  return ['done', 'success', 'completed'].includes(String(value ?? '').trim().toLowerCase())
}

const AUTO_CLONE_IMAGE_RETRY_LIMIT = 2
const AUTO_CLONE_VIDEO_RETRY_LIMIT = 2

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
  autoFlow.targetStage = project.runMode === 'auto' ? 'final_compose' : 'storyboard_video_generation'
  autoFlow.currentStage = stage
  if (status) autoFlow.status = status
  if (summary !== undefined) autoFlow.lastSummary = summary || undefined
  if (status === 'running') autoFlow.lastStartedAt = now()
  if (status === 'done' || status === 'partial_failed' || status === 'failed') autoFlow.lastCompletedAt = now()
}

const WORKFLOW_V2_STEPS: CloneWorkflowV2Step[] = [
  'upload_analyze_script',
  'model_product_consistency',
  'storyboard_video_generation',
  'export_final',
  'generate_script_variants',
  'select_script_variant',
  'generate_storyboard_grids',
  'generate_shot_videos',
  'review_replace_shots',
  'compose_final_video',
]

function defaultWorkflowV2() {
  const t = now()
  return {
    currentStep: 'upload_analyze_script' as CloneWorkflowV2Step,
    stepStatus: {
      upload_analyze_script: { status: 'idle' as const, updatedAt: t },
      model_product_consistency: { status: 'idle' as const, updatedAt: t },
      storyboard_video_generation: { status: 'idle' as const, updatedAt: t },
      export_final: { status: 'idle' as const, updatedAt: t },
      generate_script_variants: { status: 'idle' as const, updatedAt: t },
      select_script_variant: { status: 'idle' as const, updatedAt: t },
      generate_storyboard_grids: { status: 'idle' as const, updatedAt: t },
      generate_shot_videos: { status: 'idle' as const, updatedAt: t },
      review_replace_shots: { status: 'idle' as const, updatedAt: t },
      compose_final_video: { status: 'idle' as const, updatedAt: t },
    },
    updatedAt: t,
  }
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

function validateProjectReadyForFinalCompose(project: CloneProject) {
  const shots = project.blueprint?.shots ?? []
  const outputMap = getShotVideoOutputMap(project)
  if (!shots.length) return { ok: false as const, reason: '当前没有可用于成片的镜头' }
  const failed = shots.filter((shot) => {
    const shotStatus = String(shot.status || '').toLowerCase()
    const qualityStatus = String(shot.qualityStatus || '').toLowerCase()
    const hasRenderableClip = Boolean(
      String(shot.uploadedAssetPath || shot.generatedClipPath || outputMap.get(String(shot.id))?.videoPath || outputMap.get(String(shot.id))?.localPath || '').trim(),
    )
    const qualityReasons = Array.isArray(shot.qualityReasons) ? shot.qualityReasons.map((item) => String(item || '').trim()).filter(Boolean) : []
    const onlyDurationMismatch =
      qualityStatus === 'failed' &&
      qualityReasons.length > 0 &&
      qualityReasons.every((reason) => reason.includes('时长偏离目标')) &&
      hasRenderableClip
    return (
      (qualityStatus === 'failed' && !onlyDurationMismatch) ||
      (shot.canEnterRender !== true && !onlyDurationMismatch) ||
      shotStatus === 'failed' ||
      shotStatus === 'polling_timeout' ||
      Boolean(shot.error) ||
      (!String(shot.generatedClipPath || '').trim() && !String(shot.uploadedAssetPath || '').trim())
    )
  })
  if (!failed.length) return { ok: true as const }
  const first = failed[0]
  return {
    ok: false as const,
    reason: `最终门禁未通过：${failed.length} 个镜头未达标，首个失败镜头 #${Number(first.index ?? 0) + 1} ${String(first.error || first.qualityReasons?.join('；') || '未通过生产质检')}`.trim(),
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
  const workflowStep = project.workflowV2?.currentStep ?? 'upload_analyze_script'
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

function ensureProjectTitle(project: CloneProject) {
  const title = String(project.title || '').trim()
  if (title) return title
  const referenceTitle = String(project.referenceVideoName || '').trim().replace(/\.[^.]+$/, '')
  const blueprintTitle = String(project.blueprint?.title || project.baseBlueprint?.title || '').trim()
  return blueprintTitle || referenceTitle || '未命名项目'
}

function computeProjectProgress(project: CloneProject) {
  const step = project.workflowV2?.currentStep ?? 'upload_analyze_script'
  const order: CloneWorkflowV2Step[] = [
    'upload_analyze_script',
    'generate_script_variants',
    'select_script_variant',
    'generate_storyboard_grids',
    'generate_shot_videos',
    'compose_final_video',
  ]
  const index = Math.max(0, order.indexOf(step))
  const base = Math.round(((index + 1) / order.length) * 100)
  if (project.finalCompose?.outputPath) return 100
  if (project.shotVideoOutputs?.some((item) => item.videoPath)) return Math.max(base, 82)
  if (project.storyboardFrames?.some((item) => item.imagePath)) return Math.max(base, 64)
  if (project.selectedScriptVariantId) return Math.max(base, 48)
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
        ...(project.blueprint?.shots?.flatMap((shot) => shot.productReferenceImagePaths ?? []) ?? []),
        ...(project.baseBlueprint?.shots?.flatMap((shot) => shot.productReferenceImagePaths ?? []) ?? []),
      ]
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, 6)
  const productReferenceImageCount = productReferenceImagePaths.length
  const firstProductImage =
    String(
      productReferenceImagePaths[0] ||
      '',
    ).trim()
  const coverAssetPath =
    String(project.finalCompose?.coverImagePath || '').trim() ||
    firstProductImage ||
    String(project.finalCompose?.outputPath || '').trim() ||
    String(project.previewPipeline?.previewOutputPath || '').trim() ||
    String(project.referenceVideoPath || '').trim()

  return {
    id: project.id,
    title: ensureProjectTitle(project),
    description: String(project.description || '').trim() || undefined,
    groupId: String(project.groupId || '').trim() || undefined,
    groupName: String(project.groupName || '').trim() || undefined,
    archived: Boolean(project.archived ?? false),
    runMode: normalizeRunMode(project.runMode),
    createdAt: Number(project.createdAt || 0),
    updatedAt: project.updatedAt,
    currentStep: project.workflowV2?.currentStep ?? 'upload_analyze_script',
    progressPercent: computeProjectProgress(project),
    status: project.previewPipeline?.status || project.status,
    referenceVideoName: project.referenceVideoName,
    referenceVideoPath: project.referenceVideoPath,
    coverAssetPath,
    previewOutputPath: project.previewPipeline?.previewOutputPath || '',
    previewReportPath: project.previewPipeline?.previewReportPath || '',
    outputDir: project.outputDir || '',
    finalOutputPath: project.finalCompose?.outputPath || '',
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
  if (p === 'apifox_hub') return resolveApifoxHubProfile(credentials, 'video') === 'ai666' ? 'AI666' : 'VectorEngine'
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

function syncShotVideoOutput(project: CloneProject, output: CloneShotVideoOutput) {
  ensureCloneFlowState(project)
  const next = (project.shotVideoOutputs ?? []).filter((item) => item.shotId !== output.shotId)
  next.push(output)
  project.shotVideoOutputs = next.sort((a, b) => {
    const shots = projectBlueprintShots(project)
    const aIndex = shots.find((shot) => shot.id === a.shotId)?.index ?? 0
    const bIndex = shots.find((shot) => shot.id === b.shotId)?.index ?? 0
    return aIndex - bIndex
  })
  return project
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
    `Output language: ${input.locale === 'zh-CN' ? 'Chinese' : 'Vietnamese'}.`,
    `Variant count: ${input.variantCount}.`,
    'Every variant must keep shot order unchanged and output per-shot time-range script content.',
    'Each shotScripts item must explicitly describe what happens in that time range, in a form like "0s-3s 做什么".',
    'Every single shot must be 8.0 seconds or shorter. Never output any shot longer than 8 seconds.',
    'If a source beat feels longer than 8 seconds, split it into finer consecutive sub-shots while keeping the same story logic and shot order.',
    'Keep the same overall selling structure and shot count, but vary hook wording, scene framing, action details, transitions, persuasion style, and product emphasis.',
    'You must incorporate the bound model identity and product reference context when generating the variants.',
    'This is for product selling and visual demonstration. Keep human presence subordinate to product display.',
    'Do not remove shots. Do not change shot order. Do not add watermark, logo, subtitles, platform UI, or unrelated branding.',
    'Each shotScripts item must stay within its own time range, and that time range itself must not exceed 8 seconds.',
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
  productRefs: string[]
  modelPackRefs: string[]
  thumbnailPath?: string
  startFramePath?: string
  mode: 'start' | 'end'
}) {
  const productRefs = Array.from(new Set(input.productRefs.map((item) => String(item || '').trim()).filter(Boolean)))
  const modelPackRefs = Array.from(new Set(input.modelPackRefs.map((item) => String(item || '').trim()).filter(Boolean)))
  const thumbnailRefs = input.thumbnailPath ? [String(input.thumbnailPath).trim()].filter(Boolean) : []
  const startFrameRefs = input.startFramePath ? [String(input.startFramePath).trim()].filter(Boolean) : []
  if (input.mode === 'end') {
    return Array.from(new Set([...startFrameRefs, ...productRefs.slice(0, 2), ...modelPackRefs.slice(0, 1), ...thumbnailRefs])).slice(0, 5)
  }
  return Array.from(new Set([...productRefs.slice(0, 3), ...modelPackRefs.slice(0, 2), ...thumbnailRefs])).slice(0, 5)
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
  const providerText = String(provider || '').trim().toLowerCase()
  const modelText = String(model || '').trim().toLowerCase()
  return (
    taskText.startsWith('gpt_frame_') ||
    providerText.includes('image') ||
    modelText.includes('image')
  )
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
}) {
  const lines = [
    `Category: ${input.category}`,
    input.summary ? `Summary: ${input.summary}` : '',
    input.coreSubject ? `Core subject: ${input.coreSubject}` : '',
    input.connectionStructure ? `Connection structure: ${input.connectionStructure}` : '',
    input.materialDetails ? `Material details: ${input.materialDetails}` : '',
    input.wearingPosition ? `Wearing/display position: ${input.wearingPosition}` : '',
    input.surfaceDetails ? `Surface details: ${input.surfaceDetails}` : '',
    input.colorDetails ? `Color details: ${input.colorDetails}` : '',
    input.geometryDetails ? `Geometry details: ${input.geometryDetails}` : '',
    input.sizeScale ? `Size/scale: ${input.sizeScale}` : '',
    input.matchingRules?.length ? `Matching rules: ${input.matchingRules.join(' | ')}` : '',
  ]
  return lines.filter(Boolean).join('\n')
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
    zoom_in: 'very slow zoom in from 1.00 to 1.06, small change only',
    zoom_out: 'very slow zoom out from 1.06 to 1.00, small change only',
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
      productDescription: [buildProductLockText(productType, shot.productReferenceImagePaths ?? [], shot.materialNeed), input.productAnalysisText || ''].filter(Boolean).join('\n'),
      qualityMode: normalizeQualityMode(shot.qualityMode),
      productPoints: [input.productPoints || shot.materialNeed, input.productAnalysisText || ''].filter(Boolean).join('\n'),
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
  return 'cgi, 3d render, cartoon, anime, plastic toy, fake product, changed color, changed shape, changed pattern, extra logo, watermark, text, titles, subtitles, captions, labels, packaging text, slogans, random letters, browser UI, ChatGPT, software screen, screen recording, tutorial overlay, account name, platform controls, typographic elements, bad hands, deformed ear, blurry jewelry, low resolution, overexposed, duplicate earrings, wrong product, extra accessories, distorted face, unrealistic skin, floating object, messy background'
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
  const canEnterRender =
    typeof shot.canEnterRender === 'boolean'
      ? shot.canEnterRender
      : outputStatus === 'done' && Boolean(outputVideoPath)

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

function collectProjectProductReferenceImages(project: CloneProject): string[] {
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
  const existingVideoPath = String(existingOutput?.videoPath || input.shot.generatedClipPath || '').trim()
  if (existingVideoPath) {
    return {
      skip: true as const,
      status: 'done' as const,
      videoPath: existingVideoPath,
      taskId: String(existingOutput?.taskId ?? input.shot.generatedTaskId ?? '').trim() || undefined,
    }
  }
  const sceneVideoPath = join(getAppPaths().dataDir, 'viral-clone', input.project.id, 'scene_videos', `${input.shot.id}.mp4`)
  try {
    const fileStat = await stat(sceneVideoPath)
    if (fileStat.isFile() && fileStat.size > 0) {
      return {
        skip: true as const,
        status: 'done' as const,
        videoPath: sceneVideoPath,
        taskId: String(existingOutput?.taskId ?? input.shot.generatedTaskId ?? '').trim() || undefined,
      }
    }
  } catch {}
  return { skip: false as const }
}

function resolveShotVideoOutput(project: CloneProject, shot: ShotSpec): CloneShotVideoOutput {
  ensureCloneFlowState(project)
  const existing = project.shotVideoOutputs?.find((item) => item.shotId === shot.id)
  return {
    segmentId: existing?.segmentId || shot.id,
    index: Number(existing?.index ?? shot.index ?? 0),
    shotId: shot.id,
    source: existing?.source ?? 'generated',
    videoPath: existing?.videoPath || shot.generatedClipPath || undefined,
    localPath: existing?.localPath || existing?.videoPath || shot.generatedClipPath || undefined,
    videoUrl: existing?.videoUrl,
    taskId: existing?.taskId || shot.generatedTaskId || undefined,
    previousTaskIds: existing?.previousTaskIds ?? [],
    provider: existing?.provider || shot.generatedProvider || undefined,
    model: existing?.model || shot.generatedModel || undefined,
    requestCapability: existing?.requestCapability,
    endpointStyle: existing?.endpointStyle,
    remoteStatus: existing?.remoteStatus,
    remoteRaw: existing?.remoteRaw,
    durationSec: existing?.durationSec || shot.generatedClipDurationSec || undefined,
    status: existing?.status || (shot.generatedClipPath ? 'done' : 'idle'),
    error: existing?.error || shot.error || undefined,
    retryCount: existing?.retryCount ?? Number(shot.retryCount ?? 0),
    createdAt: existing?.createdAt ?? now(),
    lastPollAt: existing?.lastPollAt,
    completedAt: existing?.completedAt,
    updatedAt: existing?.updatedAt ?? now(),
  }
}

function isStaleImageTaskId(value: unknown) {
  const taskId = String(value ?? '').trim().toLowerCase()
  if (!taskId) return false
  return taskId.startsWith('gpt_frame_') || taskId.startsWith('mj_')
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
  return (
    isStaleImageTaskId(output.taskId) ||
    isStaleImageTaskId(shot.generatedTaskId) ||
    looksLikeImageProvider(output.provider) ||
    looksLikeImageProvider(shot.generatedProvider) ||
    looksLikeImageModel(output.model) ||
    looksLikeImageModel(shot.generatedModel)
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
  const hasLocalPath = Object.prototype.hasOwnProperty.call(patch, 'localPath')
  const hasVideoPath = Object.prototype.hasOwnProperty.call(patch, 'videoPath')
  const nextLocalPath = hasLocalPath
    ? patch.localPath
    : hasVideoPath
      ? patch.videoPath
      : (previous.localPath || previous.videoPath)
  const nextVideoPath = hasVideoPath
    ? patch.videoPath
    : hasLocalPath
      ? patch.localPath
      : previous.videoPath
  syncShotVideoOutput(project, {
    ...previous,
    ...patch,
    segmentId: patch.segmentId || previous.segmentId || shot.id,
    index: Number(patch.index ?? previous.index ?? shot.index ?? 0),
    shotId: shot.id,
    source: patch.source || previous.source || 'generated',
    localPath: nextLocalPath,
    videoPath: nextVideoPath,
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
  const path = String(output?.videoPath || output?.localPath || '').trim()
  try {
    const file = await stat(path)
    return file.isFile() && file.size > 0
  } catch {
    return false
  }
}

function isRecoverableVideoStatus(status: unknown) {
  return ['creating', 'remote_running', 'polling_timeout', 'generating', 'failed'].includes(String(status ?? '').toLowerCase())
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

async function saveSegmentDone(input: {
  project: CloneProject
  shot: ShotSpec
  taskId?: string
  provider?: string
  model?: string
  endpointStyle?: string
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
      generatedTaskId: input.taskId || input.shot.generatedTaskId,
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
    generatedTaskId: input.taskId || input.shot.generatedTaskId,
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
}) {
  const creds = await cloneRepo.getCredentials()
  const currentOutput = resolveShotVideoOutput(input.project, input.shot)
  const taskId = String(currentOutput.taskId || input.shot.generatedTaskId || '').trim()
  if (!taskId) throw new Error('当前分镜没有可继续查询的 taskId')
  const started = Date.now()
  const videoHub = resolveApifoxHubCredentials(creds, 'video')
  const pollMs = Math.max(1000, Number(videoHub?.defaultPollIntervalMs ?? 2000) || 2000)
  const waitMs = Math.max(0, Number(input.waitMs ?? 0))
  let lastTask: Awaited<ReturnType<typeof queryAi666Task>> | null = null
  do {
    const latestProject = (await cloneRepo.getProject(input.project.id)) || input.project
    ensureCloneFlowState(latestProject)
    const latestShot = projectBlueprintShots(latestProject).find((item) => item.id === input.shot.id) || input.shot
    try {
      syncSegmentVideoOutput(latestProject, latestShot, {
        status: 'remote_running',
        taskId,
        provider: currentOutput.provider || videoProviderLabel(creds),
        model: currentOutput.model || videoProviderModel(creds),
        endpointStyle: currentOutput.endpointStyle || videoHub?.videoEndpointStyle,
        requestCapability: currentOutput.requestCapability || 'video_start_end_to_video',
        lastPollAt: now(),
        error: undefined,
      })
      await cloneRepo.upsertProject(latestProject)
      lastTask = await queryAi666Task({ credentials: creds, taskId })
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
        replaceProjectShot(latestProject, latestShot.id, {
          status: 'failed',
          error: reason,
          generatedTaskId: missingRemoteTask ? undefined : taskId,
          generatedProvider: currentOutput.provider || videoProviderLabel(creds),
          generatedModel: currentOutput.model || videoProviderModel(creds),
        })
        syncSegmentVideoOutput(latestProject, latestShot, {
          status: 'failed',
          previousTaskIds: missingRemoteTask
            ? Array.from(new Set([...(currentOutput.previousTaskIds ?? []), taskId]))
            : currentOutput.previousTaskIds,
          taskId: missingRemoteTask ? undefined : taskId,
          remoteStatus,
          remoteRaw: lastTask.raw,
          error: reason,
          lastPollAt: now(),
          videoPath: missingRemoteTask ? undefined : currentOutput.videoPath,
          localPath: missingRemoteTask ? undefined : currentOutput.localPath,
          videoUrl: missingRemoteTask ? undefined : currentOutput.videoUrl,
        })
        latestProject.lastError = `[${videoProviderLabel(creds)} / ${videoProviderModel(creds)}] ${reason}`
        setProjectErrorContext(latestProject, {
          ...apifoxContextByCapability(creds, 'video_start_end_to_video'),
          action: 'poll_existing_segment_task',
          taskId,
          message: reason,
          responseSnippet: JSON.stringify(lastTask.raw).slice(0, 500),
        })
        const saved = await cloneRepo.upsertProject(latestProject)
        return { project: saved, task: lastTask, synced: false, status: 'failed' as const }
      }
      syncSegmentVideoOutput(latestProject, latestShot, {
        status: 'remote_running',
        taskId,
        remoteStatus,
        remoteRaw: lastTask.raw,
        lastPollAt: now(),
        error: undefined,
      })
      await cloneRepo.upsertProject(latestProject)
    } catch (error: any) {
      const reason = String(error?.message ?? error)
      syncSegmentVideoOutput(latestProject, latestShot, {
        status: 'polling_timeout',
        taskId,
        remoteStatus: 'remote_unknown',
        remoteRaw: { error: reason },
        lastPollAt: now(),
        error: `${ai666PollingTimeoutMessage()} taskId=${taskId}`,
      })
      setProjectErrorContext(latestProject, {
        ...apifoxContextByCapability(creds, 'video_start_end_to_video'),
        action: 'poll_existing_segment_task',
        taskId,
        message: ai666PollingTimeoutMessage(),
        responseSnippet: reason,
      })
      const saved = await cloneRepo.upsertProject(latestProject)
      return { project: saved, task: lastTask, synced: false, status: 'polling_timeout' as const }
    }
    if (Date.now() - started >= waitMs) break
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  } while (true)

  const latestProject = (await cloneRepo.getProject(input.project.id)) || input.project
  const latestShot = projectBlueprintShots(latestProject).find((item) => item.id === input.shot.id) || input.shot
  syncSegmentVideoOutput(latestProject, latestShot, {
    status: 'polling_timeout',
    taskId,
    remoteStatus: lastTask?.status || 'running',
    remoteRaw: lastTask?.raw,
    lastPollAt: now(),
    error: `${ai666PollingTimeoutMessage()} taskId=${taskId}`,
  })
  setProjectErrorContext(latestProject, {
    ...apifoxContextByCapability(creds, 'video_start_end_to_video'),
    action: 'poll_existing_segment_task',
    taskId,
    message: ai666PollingTimeoutMessage(),
    responseSnippet: JSON.stringify(lastTask?.raw ?? {}).slice(0, 500),
  })
  const saved = await cloneRepo.upsertProject(latestProject)
  return { project: saved, task: lastTask, synced: false, status: 'polling_timeout' as const }
}

async function reconcileRemoteStoryboardVideosInternal(projectId: string) {
  let project = await cloneRepo.getProject(projectId)
  if (!project) throw new Error('复刻项目不存在')
  ensureCloneFlowState(project)
  const results: Array<{ shotId: string; status: string; taskId?: string; synced?: boolean; error?: string }> = []
  const shots = projectBlueprintShots(project).sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
  for (const shot of shots) {
    const output = resolveShotVideoOutput(project, shot)
    const local = await checkLocalTaskStatus({ project, shot })
    if (local.skip) {
      syncSegmentVideoOutput(project, shot, {
        status: 'done',
        taskId: local.taskId || output.taskId,
        videoPath: local.videoPath,
        localPath: local.videoPath,
        error: undefined,
        completedAt: output.completedAt || now(),
      })
      replaceProjectShot(project, shot.id, {
        status: 'done',
        generatedClipPath: local.videoPath,
        generatedTaskId: local.taskId || output.taskId,
        error: '',
      })
      project = await cloneRepo.upsertProject(project)
      results.push({ shotId: shot.id, status: 'done', taskId: local.taskId || output.taskId, synced: true })
      continue
    }
    if (!output.taskId) continue
    if (output.status === 'done') continue
    if (!isRecoverableVideoStatus(output.status)) continue
    const polled = await pollExistingSegmentTask({ project, shot, waitMs: 0 })
    project = polled.project
    results.push({ shotId: shot.id, status: polled.status, taskId: output.taskId, synced: polled.synced })
  }
  const latest = (await cloneRepo.getProject(projectId)) || project
  return { project: latest, results }
}

function isMissingCloneProjectError(error: unknown) {
  const message = String((error as any)?.message ?? error ?? '').trim()
  return message.includes('复刻项目不存在')
}

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
}) {
  const creds = await cloneRepo.getCredentials()
  clearInvalidVideoTaskMapping(input.project, input.shot, 'before-vectorengine-create')
  const existing = resolveShotVideoOutput(input.project, input.shot)
  console.log('[clone-debug] ensure-vectorengine-task:existing-output', {
    projectId: input.project.id,
    shotId: input.shot.id,
    taskId: existing.taskId,
    videoPath: existing.videoPath,
    localPath: existing.localPath,
    remoteStatus: existing.remoteStatus,
    shotGeneratedClipPath: input.shot.generatedClipPath,
  })
  if (existing.videoPath || input.shot.generatedClipPath) {
    console.log('[clone-debug] ensure-vectorengine-task:reuse-existing-video', {
      projectId: input.project.id,
      shotId: input.shot.id,
      taskId: existing.taskId,
      videoPath: existing.videoPath || input.shot.generatedClipPath,
    })
    return await saveSegmentDone({
      project: input.project,
      shot: input.shot,
      taskId: existing.taskId,
      provider: existing.provider || 'apifox_hub',
      model: existing.model || videoProviderModel(creds),
      endpointStyle: existing.endpointStyle || resolveApifoxHubCredentials(creds, 'video')?.videoEndpointStyle,
      requestCapability: existing.requestCapability || 'video_start_end_to_video',
      localPath: existing.videoPath || input.shot.generatedClipPath || '',
    })
  }
  if (existing.taskId) {
    console.log('[clone-debug] ensure-vectorengine-task:poll-existing-task', {
      projectId: input.project.id,
      shotId: input.shot.id,
      taskId: existing.taskId,
      remoteStatus: existing.remoteStatus,
    })
    const polled = await pollExistingSegmentTask({ project: input.project, shot: input.shot, waitMs: 30000 })
    return polled.project
  }
  const startFrameUrl = await publicUrlForCloudFrame(creds, input.firstFramePath, 'apifox-first-frame')
  const endFrameUrl = input.lastFramePath
    ? await publicUrlForCloudFrame(creds, input.lastFramePath, 'apifox-last-frame')
    : undefined
  syncSegmentVideoOutput(input.project, input.shot, {
    status: 'creating',
    provider: 'apifox_hub',
    model: videoProviderModel(creds),
    endpointStyle: resolveApifoxHubCredentials(creds, 'video')?.videoEndpointStyle,
    requestCapability: endFrameUrl ? 'video_start_end_to_video' : 'video_image_to_video',
    error: undefined,
  })
  await cloneRepo.upsertProject(input.project)
  console.log('[clone-debug] create-vectorengine-video-task:start', {
    projectId: input.project.id,
    shotId: input.shot.id,
    capability: endFrameUrl ? 'video_start_end_to_video' : 'video_image_to_video',
    model: videoProviderModel(creds),
    firstFrameUrl: startFrameUrl,
    lastFrameUrl: endFrameUrl,
  })
  const created = await createAi666VideoTask({
    credentials: creds,
    capability: endFrameUrl ? 'video_start_end_to_video' : 'video_image_to_video',
    prompt: buildRealisticPrompt(input.shot, 'video'),
    image: startFrameUrl,
    lastImage: endFrameUrl,
  })
  if (created.directOutputUrl) {
    const outDir = join(getAppPaths().dataDir, 'viral-clone', input.project.id, 'shots', input.shot.id)
    await mkdir(outDir, { recursive: true })
    const outPath = join(outDir, 'generated_clip.mp4')
    await downloadAtlasToFile(created.directOutputUrl, outPath, 'VectorEngine 直接视频下载')
    return await saveSegmentDone({
      project: input.project,
      shot: input.shot,
      provider: created.provider,
      model: created.model,
      endpointStyle: created.endpointStyle,
      requestCapability: created.requestCapability,
      videoUrl: created.directOutputUrl,
      localPath: outPath,
      remoteStatus: 'succeeded',
      remoteRaw: created.raw,
    })
  }
  if (!created.taskId) throw new Error('VectorEngine 视频任务缺少 taskId')
  console.log('[clone-debug] create-vectorengine-video-task:done', {
    projectId: input.project.id,
    shotId: input.shot.id,
    taskId: created.taskId,
    provider: created.provider,
    model: created.model,
  })
  replaceProjectShot(input.project, input.shot.id, {
    status: 'generating',
    error: '',
    generatedProvider: created.provider,
    generatedModel: created.model,
    generatedTaskId: created.taskId,
  })
  syncSegmentVideoOutput(input.project, input.shot, {
    status: 'remote_running',
    provider: created.provider,
    model: created.model,
    endpointStyle: created.endpointStyle,
    requestCapability: created.requestCapability,
    taskId: created.taskId,
    remoteStatus: 'created',
    remoteRaw: created.raw,
    error: undefined,
  })
  const saved = await cloneRepo.upsertProject(input.project)
  const latestShot = projectBlueprintShots(saved).find((shot) => shot.id === input.shot.id) || input.shot
  const polled = await pollExistingSegmentTask({ project: saved, shot: latestShot, waitMs: 30000 })
  return polled.project
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
      project.status = 'analyzed'
      project.workflowV2 = defaultWorkflowV2()
      patchWorkflowV2(project, 'generate_script_variants', 'upload_analyze_script', 'done')
      patchWorkflowV2(project, 'generate_script_variants', 'generate_script_variants', 'running')
      syncProjectBlueprintLayers(project)
      const saved = await cloneRepo.upsertProject(project)
      const provider = summarizeProjectProviders(saved)
      return {
        project: saved,
        workflowStep: 'upload_analyze_script' as const,
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
    const project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project || !project.baseBlueprint) throw new Error('复刻项目或蓝图不存在')
    ensureCloneFlowState(project)
    patchWorkflowV2(project, 'generate_script_variants', 'generate_script_variants', 'running')
    const count = Math.max(1, Math.min(6, Math.floor(Number(input.variantCount || 3))))
    if (!project.selectedModelIdentitySnapshot?.id) throw new Error('请先选择模特。')
    const boundProductRefs = collectProjectProductReferenceImages(project)
    if (!boundProductRefs.length) throw new Error('请先上传商品图。')
    const productAnalysis = (project.baseBlueprint?.consistencyAssets as any)?.productAnalysis
    const productAnalysisText = buildProductStructureDescription({
      category: normalizeProductType(project.baseBlueprint?.productCategory || 'general'),
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
    let latest: CloneProject | null = null
    try {
      setProjectErrorContext(project, null)
      const rows = await generateWholeScriptVariantsWithAi({
        credentials: await cloneRepo.getCredentials(),
        locale: project.locale,
        shots: project.baseBlueprint.shots,
        variantCount: count,
        modelIdentity: {
          name: project.selectedModelIdentitySnapshot?.name,
          imagePaths: project.selectedModelIdentitySnapshot?.imagePaths,
          description: project.selectedModelIdentitySnapshot?.model,
        },
        productReferenceImagePaths: boundProductRefs,
        productAnalysisText,
      })
      const baseShots = [...project.baseBlueprint.shots].sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
      const candidates: CloneScriptVariantCandidate[] = rows.slice(0, count).map((item: any, index: number) => {
        const shotScripts = baseShots.map((shot, shotIndex) => {
          const hit =
            (item.shotScripts ?? []).find((row: any) => String(row?.shotId || '').trim() === shot.id) ||
            (item.shotScripts ?? []).find((row: any) => Number(row?.shotIndex ?? -1) === shotIndex) ||
            {}
          return {
            shotId: shot.id,
            shotIndex,
            timeRange:
              String(hit?.timeRange || hit?.time_range || '').trim() ||
              buildShotTimeRange(shot),
            scriptText: String(hit?.scriptText || shot.scriptText || '').trim(),
            scriptRole: (String(hit?.scriptRole || shot.scriptRole || 'unknown').trim() || 'unknown') as ShotSpec['scriptRole'],
            visualDescription: String(hit?.visualDescription || shot.visualDescription || '').trim(),
            actionDescription: String(hit?.actionDescription || shot.actionDescription || '').trim(),
            cameraDescription: String(hit?.cameraDescription || shot.cameraDescription || '').trim(),
            generationPrompt: String(hit?.generationPrompt || shot.generationPrompt || '').trim(),
          }
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
          reason: String(item.reason || '').trim() || (index === 0 ? '综合分最高，优先推荐' : '整片风格差异化候选'),
          selected: index === 0,
          createdAt: now() + index,
        }
      })
      project.scriptVariantCandidates = candidates
      project.selectedScriptVariantId = candidates[0]?.id
      project.lastError = ''
      patchWorkflowV2(project, 'generate_script_variants', 'generate_script_variants', 'done')
      patchWorkflowV2(project, 'select_script_variant', 'select_script_variant', 'running')
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
    const candidates: CloneScriptVariantCandidate[] = []
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
          return {
            shotId: shot.id,
            shotIndex: Number(shot.index || 0),
            timeRange: buildShotTimeRange(shot),
            scriptText: String(chosen?.scriptText || shot.scriptText || '').trim(),
            scriptRole: chosen?.scriptRole || shot.scriptRole || 'unknown',
            visualDescription: String(chosen?.visualDescription || shot.visualDescription || '').trim(),
            actionDescription: String(chosen?.actionDescription || shot.actionDescription || '').trim(),
            cameraDescription: String(chosen?.cameraDescription || shot.cameraDescription || '').trim(),
            generationPrompt: String(chosen?.generationPrompt || shot.generationPrompt || '').trim(),
          }
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
      candidates.push({
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
        reason: i === 0 ? '综合分最高，优先推荐' : i === 1 ? '节奏和转化更平衡' : '风格差异更大，适合试稿',
        selected: i === 0,
        createdAt: now(),
      })
    }
    latest.scriptVariantCandidates = candidates
    latest.selectedScriptVariantId = candidates[0]?.id
    patchWorkflowV2(latest, 'generate_script_variants', 'generate_script_variants', 'done')
    patchWorkflowV2(latest, 'select_script_variant', 'select_script_variant', 'running')
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
    patchWorkflowV2(project, 'select_script_variant', 'select_script_variant', 'done')
    patchWorkflowV2(project, 'generate_storyboard_grids', 'generate_storyboard_grids', 'running')
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
    let project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project) throw new Error('复刻项目不存在')
    ensureCloneFlowState(project)
    ensureAutoFlowStatus(project)
    setAutoFlowStage(project, 'analyze', 'running', '自动复制流程启动')
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
    if (input.productReferenceImagePaths?.length) {
      project = await this.saveProjectProductImages({
        cloneProjectId: project.id,
        productReferenceImagePaths: input.productReferenceImagePaths,
      })
    }

    setAutoFlowStage(project, 'materials', 'running', '自动准备一致性素材')
    await cloneRepo.upsertProject(project)
    project = (
      await this.prepareCloneMaterials({
        cloneProjectId: project.id,
        productReferenceImagePaths: input.productReferenceImagePaths,
        generateModelPack: input.autoBindModelPack ?? false,
      })
    ).project

    const boundProductRefs = collectProjectProductReferenceImages(project)
    if (!boundProductRefs.length) throw new Error('请先绑定商品图')
    if (!project.selectedModelIdentitySnapshot?.id) throw new Error('请先选择模特')

    setAutoFlowStage(project, 'script', 'running', '自动生成并选择最高分脚本')
    await cloneRepo.upsertProject(project)
    if (!project.scriptVariantCandidates?.length) {
      const variantResult = await this.generateScriptVariantsForProject({
        cloneProjectId: project.id,
        variantCount: Math.max(1, Math.min(6, Number(input.variantCount ?? 3) || 3)),
      })
      project = variantResult.project
    }
    const topCandidate = [...(project.scriptVariantCandidates ?? [])].sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0]
    if (!topCandidate?.id) throw new Error('脚本候选生成失败，未产出可用候选')
    const selectedResult = await this.selectScriptVariantForProject({
      cloneProjectId: project.id,
      variantId: topCandidate.id,
    })
    project = selectedResult.project

    setAutoFlowStage(project, 'storyboard_images', 'running', '自动生成分镜图片')
    await cloneRepo.upsertProject(project)
    const frameResult = await this.generateStoryboardGridsForProject({
      cloneProjectId: project.id,
      productReferenceImagePaths: boundProductRefs,
      selectedModelIdentityId: project.selectedModelIdentitySnapshot?.id,
    })
    project = frameResult.project

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
    const partialFailureCount = frameRetryErrors.length + Number(videoResult.queueSummary?.failed ?? 0) + Number(videoResult.queueSummary?.timeout ?? 0)
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
    setAutoFlowStage(project, 'quality_gate', 'running', '自动执行最终门禁检查')
    project = await cloneRepo.upsertProject(project)

    const latestShots = project.blueprint?.shots ?? []
    const blockedShots = latestShots
      .filter((shot) => shot.canEnterRender !== true || String(shot.qualityStatus || '').toLowerCase() === 'failed' || Boolean(shot.error))
      .map((shot) => ({
        shotId: shot.id,
        index: Number(shot.index ?? 0),
        reason: String(shot.error || shot.qualityReasons?.join('；') || '未通过最终门禁'),
      }))

    if (blockedShots.length) {
      const reason = `最终门禁未通过：${blockedShots.length} 个镜头需人工修复`
      setAutoFlowStage(project, 'quality_gate', 'failed', reason)
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
    patchWorkflowV2(project, 'model_product_consistency', 'model_product_consistency', 'done')
    syncProjectBlueprintLayers(project)
    const pipelineStatus = pipelineStatusFromProject(project)
    return {
      project,
      workflowStep: 'model_product_consistency' as const,
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
    const refs = (input.productReferenceImagePaths ?? []).map((item) => String(item || '').trim()).filter(Boolean)
    if (project.blueprint?.shots?.length) {
      project.blueprint = {
        ...project.blueprint,
        shots: project.blueprint.shots.map((shot) => replaceProductRefsIntoShot(shot, refs)),
      }
    }
    if (project.baseBlueprint?.shots?.length) {
      project.baseBlueprint = {
        ...project.baseBlueprint,
        shots: project.baseBlueprint.shots.map((shot) => replaceProductRefsIntoShot(shot, refs)),
      }
    }
    if (project.executionBlueprint?.shots?.length) {
      project.executionBlueprint = {
        ...project.executionBlueprint,
        shots: project.executionBlueprint.shots.map((shot) => replaceProductRefsIntoShot(shot, refs)),
      }
    }
    const previousAssets: Partial<CloneConsistencyAssetsSnapshot> & { updatedAt: number } =
      project.baseBlueprint?.consistencyAssets ??
      project.blueprint?.consistencyAssets ??
      { updatedAt: now() }
    const nextAssets = {
      ...previousAssets,
      productImageSetIds: refs.map((p) => basename(p)),
      referenceImages: refs,
      productReferenceImages: refs,
      productAnalysis: refs.length ? previousAssets.productAnalysis : undefined,
      updatedAt: now(),
    }
    if (project.baseBlueprint) {
      project.baseBlueprint = {
        ...project.baseBlueprint,
        consistencyAssets: nextAssets,
      }
    }
    if (project.blueprint) {
      project.blueprint = { ...project.blueprint, consistencyAssets: nextAssets }
    }
    syncProjectBlueprintLayers(project)
    console.log('[clone-debug] save-project-product-images', {
      cloneProjectId: project.id,
      refs,
    })
    return await cloneRepo.upsertProject(project)
  },

  async generateStoryboardGridsForProject(input: {
    cloneProjectId: string
    productReferenceImagePaths?: string[]
    selectedModelIdentityId?: string
  }) {
    console.log('[clone-debug] generate-storyboard-grids-service:start', {
      cloneProjectId: input.cloneProjectId,
      productReferenceImagePaths: input.productReferenceImagePaths ?? [],
      selectedModelIdentityId: input.selectedModelIdentityId ?? '',
    })
    const project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project) throw new Error('复刻项目不存在')
    ensureCloneFlowState(project)
    patchWorkflowV2(project, 'generate_storyboard_grids', 'generate_storyboard_grids', 'running')
    if (input.selectedModelIdentityId && project.selectedModelIdentityId !== input.selectedModelIdentityId) {
      await syncProjectSelectedIdentity(project, input.selectedModelIdentityId)
    }
    const refs = (input.productReferenceImagePaths ?? []).map((item) => String(item || '').trim()).filter(Boolean)
    if (!refs.length) throw new Error('请先上传商品参考图')
    const pack = selectedIdentityPack(project)
    if (!pack?.imagePaths?.length) throw new Error('请先选择模特')
    const shots = projectBlueprintShots(project).sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    if (!shots.length) throw new Error('没有可用分镜')
    for (const shot of shots) {
      replaceProjectShot(project, shot.id, {
        productReferenceImagePaths: Array.from(new Set([...(shot.productReferenceImagePaths ?? []), ...refs])),
      } as Partial<ShotSpec>)
    }
    await cloneRepo.upsertProject(project)
    const generated = await this.generateAllShotFrames({
      cloneProjectId: input.cloneProjectId,
      onlyMissing: false,
      which: 'start',
      shotIds: shots.map((shot) => shot.id),
      productReferenceImagePaths: refs,
    })
    console.log('[clone-debug] generate-storyboard-grids-service:generated', {
      cloneProjectId: input.cloneProjectId,
      totalShots: shots.length,
      queueSummary: generated.queueSummary,
      errors: generated.errors,
    })
    const latest = (await cloneRepo.getProject(input.cloneProjectId)) || generated.project
    if (!latest) throw new Error('复刻项目不存在')
    latest.storyboardGridBatches = []
    latest.storyboardFrames = projectBlueprintShots(latest)
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
    project.storyboardGridBatches = latest.storyboardGridBatches
    project.storyboardFrames = latest.storyboardFrames
    patchWorkflowV2(project, 'generate_storyboard_grids', 'generate_storyboard_grids', 'done')
    patchWorkflowV2(project, 'generate_shot_videos', 'generate_shot_videos', 'running')
    const saved = await cloneRepo.upsertProject({ ...latest, workflowV2: project.workflowV2 })
    console.log('[clone-debug] generate-storyboard-grids-service:done', {
      cloneProjectId: input.cloneProjectId,
      storyboardFrames: saved.storyboardFrames?.length ?? 0,
      workflowStep: saved.workflowV2?.currentStep ?? '',
    })
    return {
      project: saved,
      storyboardGridBatches: [],
      storyboardFrames: saved.storyboardFrames ?? [],
      queueSummary: generated.queueSummary,
      errors: generated.errors,
      imageProvider: imageProviderName(await cloneRepo.getCredentials()),
      imageModel: imageProviderModel(await cloneRepo.getCredentials()),
    }
  },

  async generateShotVideosFromStoryboardFrames(input: {
    cloneProjectId: string
    maxAutoRetryPerShot?: number
  }) {
    await reconcileRemoteStoryboardVideosInternal(input.cloneProjectId)
    let project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project) throw new Error('复刻项目不存在')
    ensureCloneFlowState(project)
    const projectProductAnalysis = (project.baseBlueprint?.consistencyAssets as any)?.productAnalysis
    const productAnalysisText = buildProductStructureDescription({
      category: normalizeProductType(project.baseBlueprint?.productCategory || 'general'),
      summary: String(projectProductAnalysis?.summary || '').trim(),
      coreSubject: String(projectProductAnalysis?.coreSubject || '').trim(),
      connectionStructure: String(projectProductAnalysis?.connectionStructure || '').trim(),
      materialDetails: String(projectProductAnalysis?.materialDetails || '').trim(),
      wearingPosition: String(projectProductAnalysis?.wearingPosition || '').trim(),
      surfaceDetails: String(projectProductAnalysis?.surfaceDetails || '').trim(),
      colorDetails: String(projectProductAnalysis?.colorDetails || '').trim(),
      geometryDetails: String(projectProductAnalysis?.geometryDetails || '').trim(),
      sizeScale: String(projectProductAnalysis?.sizeScale || '').trim(),
      matchingRules: Array.isArray(projectProductAnalysis?.matchingRules)
        ? projectProductAnalysis.matchingRules.map(String).filter(Boolean)
        : [],
    })
    const resolveStoryboardFramePath = (shot: ShotSpec) =>
      String(
        (shot as any).storyboardFramePath ||
          shot.gptFirstFramePath ||
          shot.generatedFirstFramePath ||
          shot.uploadedImagePath ||
          '',
      ).trim()
    const shots = projectBlueprintShots(project)
      .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
      .filter((shot) => resolveStoryboardFramePath(shot))
    if (!shots.length) throw new Error('请先生成分镜图片')
    let done = 0
    let failed = 0
    let skipped = 0
    let timeout = 0
    let pending = 0
    const maxAutoRetryPerShot = Math.max(0, Number(input.maxAutoRetryPerShot ?? 0))
    const errors: Array<{ shotId: string; index: number; reason: string }> = []
    for (const shot of shots) {
      clearInvalidVideoTaskMapping(project, shot, 'before-stage4-generate-loop')
      const framePath = resolveStoryboardFramePath(shot)
      if (isCompletedVideoShotStatus((shot as any).status)) {
        const existingOutput = project.shotVideoOutputs?.find((item) => item.shotId === shot.id)
        if (existingOutput?.videoPath || String((shot as any).generatedClipPath ?? '').trim()) {
          skipped += 1
          continue
        }
      }
      const localTask = await checkLocalTaskStatus({ project, shot })
      if (localTask.skip) {
        done += 1
        const existingOutput = project.shotVideoOutputs?.find((item) => item.shotId === shot.id)
        const finalTaskId = String(localTask.taskId ?? existingOutput?.taskId ?? (shot as any).generatedTaskId ?? '').trim() || undefined
        syncShotVideoOutput(project, {
          shotId: shot.id,
          source: existingOutput?.source ?? 'generated',
          videoPath: localTask.videoPath,
          taskId: finalTaskId,
          provider: existingOutput?.provider || String((shot as any).generatedProvider ?? '').trim() || undefined,
          model: existingOutput?.model || String((shot as any).generatedModel ?? '').trim() || undefined,
          durationSec: existingOutput?.durationSec || Number((shot as any).generatedClipDurationSec ?? 0) || undefined,
          status: 'done',
          error: undefined,
          updatedAt: existingOutput?.updatedAt ?? now(),
        })
        replaceProjectShot(project, shot.id, {
          generatedClipPath: localTask.videoPath,
          generatedSource: (shot as any).generatedSource === 'mock' ? 'mock' : 'cloud',
          generatedProvider: existingOutput?.provider || String((shot as any).generatedProvider ?? '').trim() || undefined,
          generatedModel: existingOutput?.model || String((shot as any).generatedModel ?? '').trim() || undefined,
          generatedTaskId: finalTaskId,
          generatedClipDurationSec: existingOutput?.durationSec || Number((shot as any).generatedClipDurationSec ?? 0) || undefined,
          status: 'done',
          error: '',
        })
        project = await cloneRepo.upsertProject(project)
        continue
      }
      if (!framePath) {
        const shotStatus = normalizeVideoShotStatus((shot as any).status)
        if (shotStatus === 'failed' || shotStatus === 'pending' || shotStatus === 'idle' || shotStatus === 'generating') {
          skipped += 1
          continue
        }
        skipped += 1
        continue
      }
      const existingBeforeCreate = resolveShotVideoOutput(project, shot)
      if (
        existingBeforeCreate.taskId &&
        existingBeforeCreate.status !== 'done' &&
        !isImageTaskMapping(existingBeforeCreate.taskId, existingBeforeCreate.provider, existingBeforeCreate.model)
      ) {
        console.log('[clone-debug] poll-existing-shot-video-task', {
          projectId: project.id,
          shotId: shot.id,
          taskId: existingBeforeCreate.taskId,
          provider: existingBeforeCreate.provider,
          model: existingBeforeCreate.model,
          status: existingBeforeCreate.status,
        })
        const polled = await pollExistingSegmentTask({ project, shot, waitMs: 30000 })
        project = polled.project
        if (polled.status === 'done') done += 1
        else if (polled.status === 'failed') failed += 1
        else {
          timeout += 1
          pending += 1
        }
        continue
      }
      try {
        const creds = await cloneRepo.getCredentials()
        const compiled = promptConsistencyService.compileAndPersist({
          projectId: project.id,
          shot,
          projectShotCount: shots.length,
          productReferenceImagePaths: shot.productReferenceImagePaths,
        })
        replaceProjectShot(project, shot.id, {
          compiledPrompt: compiled.finalPrompt,
          compiledNegativePrompt: compiled.finalNegativePrompt,
          promptCompilerVersion: compiled.compilerVersion,
          consistencyMode: compiled.strictConsistencyMode ? 'strict' : 'standard',
        })
        project = await cloneRepo.upsertProject(project)
        if (isLocalMockTestMode(creds)) {
          const shotDir = join(getAppPaths().dataDir, 'viral-clone', project.id, 'shots', shot.id, 'mock-video')
          await mkdir(shotDir, { recursive: true })
          const startFramePath = String(shot.gptFirstFramePath || shot.generatedFirstFramePath || framePath).trim()
          const endFramePath = String(shot.gptLastFramePath || shot.generatedLastFramePath || startFramePath).trim()
          const generated = await generateShotVideoByProviderChain({
            shot: {
              ...shot,
              compiledPrompt: compiled.finalPrompt,
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
            compiledPrompt: compiled.finalPrompt,
            compiledNegativePrompt: compiled.finalNegativePrompt,
          })
          replaceProjectShot(project, shot.id, {
            generatedClipPath: generated.outputFilePath,
            generatedSource: 'mock',
            generatedProvider: generated.provider,
            generatedModel: generated.model,
            generatedTaskId: generated.remoteTaskId,
            status: 'done',
            error: '',
          })
          syncShotVideoOutput(project, {
            shotId: shot.id,
            source: 'generated',
            videoPath: generated.outputFilePath,
            taskId: generated.remoteTaskId,
            provider: generated.provider,
            model: generated.model,
            status: 'done',
            error: undefined,
            updatedAt: now(),
          })
          project = await cloneRepo.upsertProject(project)
          done += 1
          continue
        }
        syncShotVideoOutput(project, {
          shotId: shot.id,
          source: 'generated',
          status: 'creating',
          provider: videoProviderLabel(creds),
          model: videoProviderModel(creds),
          updatedAt: now(),
        })
        await cloneRepo.upsertProject(project)
        await this.updateShotEnhanced({
          cloneProjectId: project.id,
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
        let latest: CloneProject | null = null
        let latestShot: ShotSpec | undefined
        let videoSucceeded = false
        for (let attempt = 0; attempt <= maxAutoRetryPerShot; attempt += 1) {
          await this.generateShotClip({
            cloneProjectId: project.id,
            shotId: shot.id,
            forceRegenerate: attempt > 0,
          })
          latest = await cloneRepo.getProject(project.id)
          latestShot = latest?.blueprint?.shots.find((item) => item.id === shot.id)
          if (latestShot) {
            replaceProjectShot(latest!, shot.id, { retryCount: attempt })
            syncShotVideoOutput(latest!, {
              shotId: shot.id,
              source: 'generated',
              retryCount: attempt,
              status: String(latestShot.generatedClipPath || '').trim() ? 'done' : 'polling_timeout',
              updatedAt: now(),
            })
            latest = await cloneRepo.upsertProject(latest!)
          }
          if (String(latestShot?.generatedClipPath || '').trim()) {
            videoSucceeded = true
            break
          }
          const taskId = String(latestShot?.generatedTaskId || '').trim()
          if (taskId) break
        }
        if (!latest) latest = await cloneRepo.getProject(project.id)
        project = latest ?? project
        ensureCloneFlowState(project)
        latestShot = project.blueprint?.shots.find((item) => item.id === shot.id)
        syncShotVideoOutput(project, {
          shotId: shot.id,
          source: 'generated',
          videoPath: String(latestShot?.generatedClipPath ?? '').trim() || undefined,
          taskId: String(latestShot?.generatedTaskId ?? '').trim() || undefined,
          provider: String(latestShot?.generatedProvider ?? '').trim() || undefined,
          model: String(latestShot?.generatedModel ?? '').trim() || undefined,
          durationSec: Number(latestShot?.generatedClipDurationSec ?? 0) || undefined,
          status: latestShot?.generatedClipPath ? 'done' : 'polling_timeout',
          error: String(latestShot?.error ?? '').trim() || undefined,
          retryCount: Number(latestShot?.retryCount ?? 0) || undefined,
          updatedAt: now(),
        })
        if (videoSucceeded && latestShot?.generatedClipPath) {
          done += 1
          replaceProjectShot(project, shot.id, {
            generatedClipPath: latestShot.generatedClipPath,
            generatedSource: latestShot.generatedSource,
            generatedProvider: latestShot.generatedProvider,
            generatedModel: latestShot.generatedModel,
            generatedTaskId: latestShot.generatedTaskId,
            generatedClipDurationSec: latestShot.generatedClipDurationSec,
            generatedClipWidth: latestShot.generatedClipWidth,
            generatedClipHeight: latestShot.generatedClipHeight,
            qualityStatus: latestShot.qualityStatus,
            qualityScore: latestShot.qualityScore,
            qualityReasons: latestShot.qualityReasons,
            canEnterRender: latestShot.canEnterRender,
            retrySuggestion: latestShot.retrySuggestion,
            freezeRatio: latestShot.freezeRatio,
            blackFrameRatio: latestShot.blackFrameRatio,
            productVisibilityScore: latestShot.productVisibilityScore,
            status: latestShot.status,
            error: latestShot.error,
            retryCount: latestShot.retryCount,
          })
          project = await cloneRepo.upsertProject(project)
        } else {
          const latestOutput = project.shotVideoOutputs?.find((item) => item.shotId === shot.id)
          if (latestOutput?.taskId) {
            timeout += 1
            pending += 1
          } else {
            failed += 1
          }
          const reason = latestShot?.error || '分镜视频生成后未返回可用视频文件'
          errors.push({ shotId: shot.id, index: Number(shot.index ?? 0), reason: latestOutput?.taskId ? `${ai666PollingTimeoutMessage()} taskId=${latestOutput.taskId}` : reason })
          replaceProjectShot(project, shot.id, {
            status: latestOutput?.taskId ? 'generating' : latestShot?.status ?? 'failed',
            error: latestOutput?.taskId ? `${ai666PollingTimeoutMessage()} taskId=${latestOutput.taskId}` : reason,
          })
          project = await cloneRepo.upsertProject(project)
        }
      } catch (error: any) {
        const reason = String(error?.message ?? error ?? '分镜视频生成失败')
        const latest = (await cloneRepo.getProject(project.id)) ?? project
        ensureCloneFlowState(latest)
        const latestOutput = resolveShotVideoOutput(latest, latest.blueprint?.shots.find((item) => item.id === shot.id) || shot)
        const nextRetryCount = Math.min(maxAutoRetryPerShot, Number(latest.blueprint?.shots.find((item) => item.id === shot.id)?.retryCount ?? shot.retryCount ?? 0))
        if (latestOutput.taskId) {
          timeout += 1
          pending += 1
        } else {
          failed += 1
        }
        errors.push({
          shotId: shot.id,
          index: Number(shot.index ?? 0),
          reason: latestOutput.taskId ? `${ai666PollingTimeoutMessage()} taskId=${latestOutput.taskId}` : reason,
        })
        replaceProjectShot(latest, shot.id, {
          status: latestOutput.taskId ? 'generating' : 'failed',
          error: latestOutput.taskId ? `${ai666PollingTimeoutMessage()} taskId=${latestOutput.taskId}` : reason,
          qualityStatus: latestOutput.taskId ? 'unchecked' : 'failed',
          qualityReasons: latestOutput.taskId ? [] : [reason],
          canEnterRender: false,
          generatedTaskId: latest.blueprint?.shots.find((item) => item.id === shot.id)?.generatedTaskId,
          retryCount: nextRetryCount,
        })
        syncShotVideoOutput(latest, {
          shotId: shot.id,
          source: 'generated',
          status: latestOutput.taskId ? 'polling_timeout' : 'failed',
          error: latestOutput.taskId ? `${ai666PollingTimeoutMessage()} taskId=${latestOutput.taskId}` : reason,
          taskId: latestOutput.taskId || latest.blueprint?.shots.find((item) => item.id === shot.id)?.generatedTaskId,
          provider: latestOutput.provider,
          model: latestOutput.model,
          remoteStatus: latestOutput.remoteStatus,
          remoteRaw: latestOutput.remoteRaw,
          retryCount: nextRetryCount,
          lastPollAt: latestOutput.lastPollAt,
          updatedAt: now(),
        })
        patchWorkflowV2(latest, 'generate_shot_videos', 'generate_shot_videos', 'running')
        project = await cloneRepo.upsertProject(latest)
      }
    }
    const summaryError = errors.length
      ? `已跳过 ${failed} 个失败分镜，可在分镜视频卡片点击重新生成。`
      : ''
    patchWorkflowV2(project, failed ? 'generate_shot_videos' : 'review_replace_shots', 'generate_shot_videos', failed ? 'failed' : 'done', summaryError)
    if (!failed) {
      patchWorkflowV2(project, 'review_replace_shots', 'review_replace_shots', 'running')
      syncFinalCompose(project, { status: 'ready' })
      project.lastError = ''
      setProjectErrorContext(project, null)
    } else {
      syncFinalCompose(project, { status: 'idle', error: summaryError })
      project.lastError = summaryError
    }
    const saved = await cloneRepo.upsertProject(project)
    return {
      project: saved,
      shotVideoOutputs: saved.shotVideoOutputs ?? [],
      queueSummary: { total: shots.length, done, failed, skipped, pending, timeout, doneCount: done, pendingCount: pending, failedCount: failed, timeoutCount: timeout },
      errors,
    }
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
      status: quality.canEnterRender ? 'done' : 'failed',
      error: quality.canEnterRender ? undefined : quality.qualityReasons.join('；'),
      updatedAt: now(),
    })
    patchWorkflowV2(project, 'review_replace_shots', 'review_replace_shots', 'done')
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
    const project = await cloneRepo.getProject(input.cloneProjectId)
    if (!project) throw new Error('复刻项目不存在')
    ensureCloneFlowState(project)
    const gate = validateProjectReadyForFinalCompose(project)
    if (!gate.ok) {
      patchWorkflowV2(project, 'review_replace_shots', 'review_replace_shots', 'failed', gate.reason)
      syncFinalCompose(project, { status: 'idle', error: gate.reason })
      project.lastError = gate.reason
      await cloneRepo.upsertProject(project)
      throw new Error(gate.reason)
    }
    patchWorkflowV2(project, 'compose_final_video', 'compose_final_video', 'running')
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
      patchWorkflowV2(latest, 'compose_final_video', 'compose_final_video', 'done')
      patchWorkflowV2(latest, 'compose_final_video', 'export_final', 'done')
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
      patchWorkflowV2(latest, 'compose_final_video', 'compose_final_video', 'failed', reason)
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
    patchWorkflowV2(project, 'storyboard_video_generation', 'storyboard_video_generation', 'running')
    syncProjectBlueprintLayers(project)
    return {
      project,
      workflowStep: 'storyboard_video_generation' as const,
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
      patchWorkflowV2(project, 'storyboard_video_generation', 'storyboard_video_generation', 'failed', reason)
      previewPipelinePatch(project, {
        status: 'failed',
        lastError: `[${provider} / ${model}] ${reason}`,
      })
      await cloneRepo.upsertProject(project)
      throw new Error(`[${provider} / ${model}] ${reason}`)
    }
    patchWorkflowV2(project, 'export_final', 'storyboard_video_generation', 'done')
    syncProjectBlueprintLayers(project)
    const saved = await cloneRepo.upsertProject(project)
    return {
      ...result,
      workflowStep: 'export_final' as const,
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
    const shot = item.blueprint.shots.find((x) => x.id === input.shotId)
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
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
    syncProjectBlueprintLayers(item)
    const recoveredProject = await recoverLocalStoryboardFrames(item)
    syncProjectBlueprintLayers(recoveredProject)
    await reconcileRemoteStoryboardVideosInternal(recoveredProject.id)
    const latest = (await cloneRepo.getProject(input.cloneProjectId)) || recoveredProject
    return {
      ...latest,
      pipelineStatus: pipelineStatusFromProject(latest),
    }
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
    const taskId = String(project.shotVideoOutputs?.find((item) => item.shotId === shot.id)?.taskId ?? shot.generatedTaskId ?? '').trim()
    if (!taskId) throw new Error('当前分镜没有可同步的 taskId')
    const result = await pollExistingSegmentTask({ project, shot, waitMs: 0, allowFailed: true })
    return { project: result.project, task: result.task, synced: result.synced, status: result.status }
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

    async listProjects() {
      return (await cloneRepo.listProjects())
        .slice()
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
        .map((project) => buildProjectSummary(project))
    },

  async listProjectSummaries(input?: { query?: string; status?: string; archived?: boolean }) {
    const query = String(input?.query ?? '').trim().toLowerCase()
    const status = String(input?.status ?? '').trim().toLowerCase()
    const archived = typeof input?.archived === 'boolean' ? input.archived : undefined
    return (await cloneRepo.listProjects())
      .slice()
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .map((project) => buildProjectSummary(project))
      .filter((item) => {
        if (typeof archived === 'boolean' && Boolean(item.archived) !== archived) return false
        if (status && status !== 'all' && String(item.status || '').toLowerCase() !== status) return false
        if (query) {
          const haystack = [item.title, item.description, item.referenceVideoName, item.selectedModelIdentityName, item.lastError]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(query)) return false
        }
        return true
      })
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
    return await cloneRepo.upsertProject(project)
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
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item) throw new Error('复刻项目不存在')
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
    assertImageProviderKey(creds, '生成新模特身份包')
    const productType = normalizeProductType(input.productType)
    const packId = randomUUID()
    const outDir = identityLibraryDir(packId)
    await mkdir(outDir, { recursive: true })
    const existingLibrary = await cloneRepo.listModelIdentityLibrary()
    const nextName = (() => {
      const used = new Set(existingLibrary.map((x) => String(x.name || '').trim()))
      let i = 1
      while (true) {
        const name = `AI模特 ${String(i).padStart(3, '0')}`
        if (!used.has(name)) return name
        i += 1
      }
    })()
    const profile = defaultModelIdentityDescription(productType)
    const pendingPack: ModelIdentityPack = {
      id: packId,
      createdAt: now(),
      updatedAt: now(),
      status: 'generating',
      confirmed: false,
      productType,
      ...profile,
      description: [
        'New virtual model for this clone project',
        `${profile.market}, ${profile.gender}, ${profile.ageRange}`,
        `${profile.hairStyle}, ${profile.skinTone}`,
        `${profile.outfitStyle}, ${profile.mood}`,
      ].join('. '),
      imagePaths: [],
      model: imageProviderModel(creds),
    }
    const pendingIdentity = toLibraryItemFromPack({ ...pendingPack, name: nextName })
    await cloneRepo.upsertModelIdentity(pendingIdentity)
    await syncProjectSelectedIdentity(item, packId)
    await cloneRepo.upsertProject(item)
    try {
      const generated = await generateModelIdentityPackImages({
        credentials: creds,
        outDir,
        productType,
        productPoints: input.productPoints,
        productReferenceImagePaths: (input.productReferenceImagePaths ?? []).map(String).filter(Boolean),
        onImageGenerated: async (filePath) => {
          const current = await cloneRepo.getModelIdentity(packId)
          if (!current) return
          const next = await cloneRepo.upsertModelIdentity({
            ...current,
            updatedAt: now(),
            status: 'generating',
            imagePaths: Array.from(new Set([...(current.imagePaths ?? []), filePath])),
            coverImagePath: current.coverImagePath || filePath,
          })
          const latest = await cloneRepo.getProject(input.cloneProjectId)
          if (!latest) return
          latest.selectedModelIdentitySnapshot = { ...next }
          latest.selectedModelIdentityId = next.id
          latest.selectedModelIdentityPackId = next.id
          latest.modelIdentityPacks = [toProjectPackFromLibrary(next)]
          await cloneRepo.upsertProject(latest)
        },
      })
      const donePack = toLibraryItemFromPack({
        ...pendingPack,
        ...generated.profile,
        updatedAt: now(),
        status: 'done',
        imagePaths: generated.imagePaths,
        model: generated.model,
        description: [
          'New virtual model for this clone project',
          `${generated.profile.market}, ${generated.profile.gender}, ${generated.profile.ageRange}`,
          `${generated.profile.hairStyle}, ${generated.profile.skinTone}`,
          `${generated.profile.outfitStyle}, ${generated.profile.mood}`,
          `${generated.profile.sceneStyle}`,
        ].join('. '),
        error: undefined,
        name: nextName,
        coverImagePath: generated.imagePaths[0],
      })
      if (!donePack.imagePaths.length) {
        throw new Error(`AI 模特身份包生成失败：model=${generated.model || pendingPack.model} 未返回任何图片`)
      }
      await cloneRepo.upsertModelIdentity(donePack)
      const latest = await cloneRepo.getProject(input.cloneProjectId)
      if (!latest) throw new Error('复刻项目不存在')
      await syncProjectSelectedIdentity(latest, packId)
      return await cloneRepo.upsertProject(latest)
    } catch (e: any) {
      const friendlyMessage = humanizeModelPackError(e, creds)
      const current = await cloneRepo.getModelIdentity(packId)
      if (current) {
        await cloneRepo.upsertModelIdentity({
          ...current,
          status: 'failed',
          updatedAt: now(),
          error: friendlyMessage,
        })
      }
      const latest = await cloneRepo.getProject(input.cloneProjectId)
      if (!latest) throw e
      await syncProjectSelectedIdentity(latest, packId)
      await cloneRepo.upsertProject(latest)
      throw new Error(friendlyMessage)
    }
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
    if (!product) throw new Error('锟斤拷锟斤拷失锟斤拷')
    const shot = item.blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('锟斤拷锟斤拷失锟斤拷')
    const paths = (input.filePaths ?? []).map((x) => String(x).trim()).filter(Boolean)
    if (!paths.length) throw new Error('鏈€夋嫨绱犳潗鏂囦欢')
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
    patchWorkflowV2(item, 'upload_analyze_script', 'upload_analyze_script', 'running')
    const scriptCandidates = buildScriptCandidatesFromBlueprint(item)
    item.baseBlueprint = { ...item.baseBlueprint, scriptCandidates }
    item.blueprint = item.blueprint ? { ...item.blueprint, scriptCandidates } : item.baseBlueprint
    patchWorkflowV2(item, 'model_product_consistency', 'upload_analyze_script', 'done')
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
    patchWorkflowV2(item, 'model_product_consistency', 'model_product_consistency', 'running')
    const refs = (input.productReferenceImagePaths ?? [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
    if (item.blueprint?.shots?.length) {
      item.blueprint = {
        ...item.blueprint,
        shots: item.blueprint.shots.map((shot) => replaceProductRefsIntoShot(shot, refs)),
      }
    }
    if (item.baseBlueprint?.shots?.length) {
      item.baseBlueprint = {
        ...item.baseBlueprint,
        shots: item.baseBlueprint.shots.map((shot) => replaceProductRefsIntoShot(shot, refs)),
      }
    }
    if (item.executionBlueprint?.shots?.length) {
      item.executionBlueprint = {
        ...item.executionBlueprint,
        shots: item.executionBlueprint.shots.map((shot) => replaceProductRefsIntoShot(shot, refs)),
      }
    }
    let snapshotProject = item
    const selectedId =
      item.selectedModelIdentityPackId ||
      item.selectedModelIdentityId ||
      item.selectedModelIdentitySnapshot?.id
    let reusable = false
    if (!input.forceRegenerateModelPack && selectedId) {
      const selectedIdentity = await cloneRepo.getModelIdentity(selectedId)
      if (selectedIdentity && selectedIdentity.status === 'done' && Array.isArray(selectedIdentity.imagePaths) && selectedIdentity.imagePaths.length) {
        reusable = true
      }
    }
    const shouldGenerateIdentityPack = Boolean(input.generateModelPack) && !reusable
    if (shouldGenerateIdentityPack) {
      const next = await this.generateModelIdentityPack({
        cloneProjectId: input.cloneProjectId,
        productType: input.productType,
        productPoints: input.productPoints,
        productReferenceImagePaths: refs,
      })
      snapshotProject = next as CloneProject
      if (refs.length) {
        snapshotProject = updateProjectShots(snapshotProject, (shot) => replaceProductRefsIntoShot(shot, refs))
      }
    }
    const selectedPackId = snapshotProject.selectedModelIdentityPackId || snapshotProject.selectedModelIdentityId
    const generatedPack = selectedPackId ? await cloneRepo.getModelIdentity(selectedPackId) : undefined
    if (shouldGenerateIdentityPack) {
      const generatedCount = Number(generatedPack?.imagePaths?.length ?? snapshotProject.selectedModelIdentitySnapshot?.imagePaths?.length ?? 0)
      if (!generatedCount) {
        throw new Error('一致性素材生成未产出任何模特图，请检查图片模型配置、产品参考图和 provider/model 参数后重试')
      }
    }
    const resolvedProductType = normalizeProductType(input.productType ?? snapshotProject.baseBlueprint?.productCategory)
    const consistencyAssets = {
      modelPackId: selectedPackId,
      productImageSetIds: refs.map((p) => basename(p)),
      referenceImages: refs,
      modelReferenceImages: generatedPack?.imagePaths ?? snapshotProject.selectedModelIdentitySnapshot?.imagePaths ?? [],
      productReferenceImages: refs,
      productAnalysis: refs.length ? snapshotProject.baseBlueprint?.consistencyAssets?.productAnalysis : undefined,
      status: (shouldGenerateIdentityPack ? 'generated' : 'saved') as 'generated' | 'saved',
      provider: generatedPack?.model,
      updatedAt: now(),
    }
    snapshotProject.baseBlueprint = {
      ...(snapshotProject.baseBlueprint || item.baseBlueprint),
      consistencyAssets,
    }
    snapshotProject.blueprint = snapshotProject.blueprint
      ? { ...snapshotProject.blueprint, consistencyAssets }
      : snapshotProject.baseBlueprint
    patchWorkflowV2(snapshotProject, 'storyboard_video_generation', 'model_product_consistency', 'done')
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
            productReferenceImages: refs,
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
    patchWorkflowV2(item, 'storyboard_video_generation', 'storyboard_video_generation', 'running')
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
        patchWorkflowV2(finalBackgroundProject, 'export_final', 'storyboard_video_generation', 'done', failed?.reason || '')
        await cloneRepo.upsertProject(finalBackgroundProject)
      })()
    }
    const finalProject = await cloneRepo.getProject(input.cloneProjectId)
    if (!finalProject) throw new Error('复刻项目不存在')
    if (!remainingPlans.length) patchWorkflowV2(finalProject, 'export_final', 'storyboard_video_generation', 'done')
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
    const shot = item.blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('锟斤拷锟斤拷失锟斤拷')
    const shotDir = join(getAppPaths().dataDir, 'viral-clone', item.id, 'shots', shot.id)
    await mkdir(shotDir, { recursive: true })
    const first = join(shotDir, 'first_frame.png')
    const last = join(shotDir, 'last_frame.png')
    const refs = input.productReferenceImagePaths?.length
      ? input.productReferenceImagePaths
      : shot.productReferenceImagePaths ?? []
    const productMainImage = shot.productMainImage || refs[0]
    const productDetailImages = shot.productDetailImages?.length ? shot.productDetailImages : refs.slice(1, 3)
    const productUsageImages = shot.productUsageImages ?? []
    const styleReferenceImages = shot.styleReferenceImages ?? []
    const mergedRefs = [productMainImage, ...productDetailImages, ...productUsageImages, ...styleReferenceImages].filter(Boolean).map(String)
    console.log('[clone-debug] generate-shot-frames:prepared', {
      projectId: item.id,
      shotId: shot.id,
      productMainImage,
      mergedReferenceImageCount: mergedRefs.length,
    })
    if (!hasProductLock(shot, mergedRefs)) throw new Error('请先上传产品参考图或填写产品锁定信息')
    const productAnalysisText = buildProductStructureDescription({
      category: normalizeProductType(item.baseBlueprint?.productCategory || shot.productType || 'general'),
      ...(((item.baseBlueprint?.consistencyAssets as any)?.productAnalysis ?? {}) as any),
    })
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

  async generateGptShotFrames(input: {
    cloneProjectId: string
    shotId: string
    which?: 'start' | 'end' | 'both'
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
  }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目或蓝图不存在')
    const shot = item.blueprint.shots.find((x) => x.id === input.shotId)
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
    if (!pack || pack.status !== 'done' || !pack.imagePaths.length) throw new Error('请先生成并确认新模特身份包')
    const refs = input.productReferenceImagePaths?.length
      ? input.productReferenceImagePaths
      : [
          shot.productMainImage,
          ...(shot.productDetailImages ?? []),
          ...(shot.productUsageImages ?? []),
          ...(shot.styleReferenceImages ?? []),
          ...(shot.productReferenceImagePaths ?? []),
        ].filter(Boolean).map(String)
    if (!hasProductLock(shot, refs)) throw new Error('请先上传产品参考图或填写产品锁定信息')

    await patchShotRuntimeState({
      project: item,
      shotId: shot.id,
      patch: { gptFrameStatus: 'generating', gptFrameError: '', gptFrameConfirmed: false },
    })

    const latest = await cloneRepo.getProject(input.cloneProjectId)
    if (!latest || !latest.blueprint) throw new Error('复刻项目或蓝图不存在')
    const latestShot = latest.blueprint.shots.find((x) => x.id === input.shotId) ?? shot
    const outDir = join(getAppPaths().dataDir, 'viral-clone', latest.id, 'shots', latestShot.id, 'gpt-frames')
    await mkdir(outDir, { recursive: true })
    const productType = normalizeProductType(latestShot.productType)
    const which = input.which ?? 'both'
    const compiled = promptConsistencyService.compileAndPersist({
      projectId: latest.id,
      shot: latestShot,
      projectShotCount: latest.blueprint.shots.length,
      productReferenceImagePaths: refs,
    })
    const promptHash = computePromptHash({
      shot: latestShot,
      productRefs: refs,
      productDescription: latestShot.materialNeed,
      model: imageProviderModel(creds),
      qualityMode: normalizeQualityMode(latestShot.qualityMode),
    })
    const imagePromptHash = computeImagePromptHash({
      promptHash,
      which,
      refs: [...refs, ...pack.imagePaths],
      model: imageProviderModel(creds),
    })
    const cachedFrame = getCachedFrameResult(latest, imagePromptHash)
    let firstPath = latestShot.gptFirstFramePath
    let lastPath = latestShot.gptLastFramePath
    try {
      if (cachedFrame?.imagePaths?.length) {
        firstPath = cachedFrame.imagePaths[0] || firstPath
        lastPath = cachedFrame.imagePaths[1] || firstPath || lastPath
      } else {
      if (which === 'start' || which === 'both') {
        const startRefs = compactStoryboardImageRefs({
          productRefs: refs,
          modelPackRefs: pack.imagePaths,
          thumbnailPath: latestShot.thumbnailPath,
          mode: 'start',
        })
        firstPath = await generateGptShotFrameImage({
          credentials: creds,
          outDir,
          filePrefix: `gpt_first_${latestShot.index + 1}`,
          prompt: buildGptFramePrompt({
            shot: latestShot,
            productType,
            modelPack: pack,
            productPoints: latestShot.aiPrompt || latestShot.materialNeed,
            which: 'start',
            compiledPrompt: compiled.finalPrompt,
          }),
          negativePrompt: compiled.finalNegativePrompt,
          imagePaths: startRefs,
        })
      }
      if (which === 'end' || which === 'both') {
        const endRefs = compactStoryboardImageRefs({
          productRefs: refs,
          modelPackRefs: pack.imagePaths,
          thumbnailPath: latestShot.thumbnailPath,
          startFramePath: firstPath,
          mode: 'end',
        })
        lastPath = await generateGptShotFrameImage({
          credentials: creds,
          outDir,
          filePrefix: `gpt_last_${latestShot.index + 1}`,
          prompt: buildGptFramePrompt({
            shot: latestShot,
            productType,
            modelPack: pack,
            productPoints: latestShot.aiPrompt || latestShot.materialNeed,
            which: 'end',
            compiledPrompt: compiled.finalPrompt,
          }),
          negativePrompt: compiled.finalNegativePrompt,
          imagePaths: endRefs,
        })
      }
        setCachedFrameResult(latest, {
          hash: imagePromptHash,
          shotId: latestShot.id,
          imagePaths: [firstPath, lastPath].filter(Boolean) as string[],
          provider: generatedImageProvider(creds),
          model: imageProviderModel(creds),
          createdAt: now(),
          sourceProductRefs: refs,
          promptHash,
        })
      }
      setCachedPromptResult(latest, {
        hash: promptHash,
        shotId: latestShot.id,
        positivePrompt: buildGptFramePrompt({
          shot: latestShot,
          productType,
          modelPack: pack,
          productPoints: latestShot.aiPrompt || latestShot.materialNeed,
          which: 'start',
          compiledPrompt: compiled.finalPrompt,
        }),
        negativePrompt: compiled.finalNegativePrompt || buildCloneNegativePrompt(productType, latestShot.shotType),
        model: imageProviderModel(creds),
        qualityMode: normalizeQualityMode(latestShot.qualityMode),
        createdAt: now(),
      })
      latest.blueprint = {
        ...latest.blueprint,
        shots: latest.blueprint.shots.map((s) =>
          s.id === latestShot.id
            ? {
                ...s,
                gptFirstFramePath: firstPath,
                gptLastFramePath: lastPath,
                gptFrameStatus: 'done',
                gptFrameError: '',
                gptFrameSource: 'gpt_image',
                gptFrameModel: imageProviderModel(creds),
                gptFrameConfirmed: false,
                productReferenceImagePaths: refs,
                productType,
                generatedFirstFramePath: firstPath || s.generatedFirstFramePath,
                generatedLastFramePath: lastPath || s.generatedLastFramePath,
                generatedSource: 'cloud',
                generatedProvider: generatedImageProvider(creds),
                generatedModel: imageProviderModel(creds),
                generatedTaskId: `gpt_frame_${randomUUID()}`,
                promptHash,
                imagePromptHash,
                compiledPrompt: compiled.finalPrompt,
                compiledNegativePrompt: compiled.finalNegativePrompt,
                promptCompilerVersion: compiled.compilerVersion,
                consistencyMode: compiled.strictConsistencyMode ? 'strict' : 'standard',
                qualityStatus: 'unchecked',
                qualityReasons: [],
                status: 'ready',
              }
            : s,
        ),
      }
      return await cloneRepo.upsertProject(latest)
    } catch (e: any) {
      const failed = await cloneRepo.getProject(input.cloneProjectId)
      if (failed?.blueprint) {
        failed.blueprint = {
          ...failed.blueprint,
          shots: failed.blueprint.shots.map((s) =>
            s.id === latestShot.id
              ? { ...s, gptFrameStatus: 'failed', gptFrameError: String(e?.message ?? e), gptFrameConfirmed: false, status: 'failed', error: String(e?.message ?? e) }
              : s,
          ),
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
    const shot = item.blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('锟斤拷锟斤拷失锟斤拷')
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
    const matchedLocalAsset = await matchLocalAssetsForShot(item, shot)
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
    const existingOutput = resolveShotVideoOutput(item, shot)
    if (existingOutput.taskId && !input.forceRegenerate) {
      console.log('[clone-debug] generate-shot-clip:reuse-existing-task', {
        projectId: item.id,
        shotId: shot.id,
        taskId: existingOutput.taskId,
        provider: existingOutput.provider,
        model: existingOutput.model,
        status: existingOutput.status,
      })
      const polled = await pollExistingSegmentTask({ project: item, shot, waitMs: 30000 })
      return polled.project
    }
    if (input.forceRegenerate && (existingOutput.taskId || existingOutput.videoPath || existingOutput.localPath || shot.generatedClipPath)) {
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
        status: 'creating',
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
      item.lastError = ''
      setProjectErrorContext(item, null)
      await cloneRepo.upsertProject(item)
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
        generatedTaskId: input.forceRegenerate ? undefined : shot.generatedTaskId,
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
    const productAnalysisText = buildProductStructureDescription({
      category: normalizeProductType(item.baseBlueprint?.productCategory || shot.productType || 'general'),
      ...(((item.baseBlueprint?.consistencyAssets as any)?.productAnalysis ?? {}) as any),
    })
    const compiled = promptConsistencyService.compileAndPersist({
      projectId: item.id,
      shot,
      projectShotCount: item.blueprint.shots.length,
      productReferenceImagePaths: shot.productReferenceImagePaths,
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
          productDescription: shot.materialNeed,
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
          aiPrompt: buildStructuredShotPrompt({
            shot,
            productType: shot.productType,
            productPoints: shot.aiPrompt,
            productAnalysisText,
            retryAttempt: attempt,
          }),
          negativePrompt: shot.negativePrompt || defaultQualityNegativePrompt(),
          compiledPrompt: compiled.finalPrompt,
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
                : shot.generatedLastFramePath || first
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
        if (videoProviderChain(creds)[0] === 'apifox_hub') {
          console.log('[clone-debug] generate-shot-clip:delegate-vectorengine', {
            projectId: item.id,
            shotId: shot.id,
            attempt,
            mode,
          })
          const latest = (await cloneRepo.getProject(input.cloneProjectId)) || item
          ensureCloneFlowState(latest)
          const latestShot = projectBlueprintShots(latest).find((x) => x.id === input.shotId) || strengthenedShot
          return await ensureAi666SegmentVideoTask({
            project: latest,
            shot: latestShot,
            firstFramePath: first,
            lastFramePath: last || first,
            mode,
          })
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
        const cachedClip = getCachedCloudClipResult(item, cloudClipHash)
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
          shot: strengthenedShot,
          outDir: shotDir,
          startFramePath: first,
          endFramePath: last || first,
          consistencyMode: mode === 'high' ? 'hard' : consistencyRuntimeMode(shot, compiled.strictConsistencyMode),
          credentials: creds,
          chain,
          compiledPrompt: compiled.finalPrompt,
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
        latest?.blueprint?.shots.find((x) => x.id === input.shotId)?.generatedTaskId ||
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
        syncShotVideoOutput(latest, {
          shotId: input.shotId,
          source: 'generated',
          status: 'failed',
          error: reason,
          taskId: preservedTaskId || undefined,
          provider: videoProviderLabel(creds),
          model: videoProviderModel(creds),
          updatedAt: now(),
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
      generatedTaskId: generatedTaskId || shot.generatedTaskId,
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
      compiledPrompt: compiled.finalPrompt,
      compiledNegativePrompt: compiled.finalNegativePrompt,
      promptCompilerVersion: compiled.compilerVersion,
      consistencyMode: compiled.strictConsistencyMode ? 'strict' : 'standard',
    }
    replaceProjectShot(item, shot.id, generatedShotPatch)
    syncShotVideoOutput(item, {
      shotId: shot.id,
      source: 'generated',
      videoPath: out,
      taskId: generatedShotPatch.generatedTaskId,
      provider: generatedShotPatch.generatedProvider,
      model: generatedShotPatch.generatedModel,
      durationSec: quality?.meta.durationSec,
      status: 'done',
      error: undefined,
      updatedAt: now(),
    })
    patchQueueJobStatus(item, shot.id, 'done', quality?.passed ? Number(shot.retryCount ?? 0) : maxAttempts - 1)
    return await cloneRepo.upsertProject(item)
  },

  async getShotConsistencyReport(input: { cloneProjectId: string; shotId: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目不存在')
    const shot = item.blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    return promptConsistencyService.getShotConsistencyReport(item.id, shot.id) || promptConsistencyService.previewShotConsistencyPrompt(item.id, shot)
  },

  async getShotImagePromptPreview(input: { cloneProjectId: string; shotId: string }) {
    const item = await cloneRepo.getProject(input.cloneProjectId)
    if (!item || !item.blueprint) throw new Error('复刻项目不存在')
    const shot = item.blueprint.shots.find((x) => x.id === input.shotId)
    if (!shot) throw new Error('分镜不存在')
    const pack = selectedIdentityPack(item)
    if (!pack || pack.status !== 'done' || !pack.imagePaths.length) {
      throw new Error('请先生成并确认新模特身份包')
    }
    const refs = [
      shot.productMainImage,
      ...(shot.productDetailImages ?? []),
      ...(shot.productUsageImages ?? []),
      ...(shot.styleReferenceImages ?? []),
      ...(shot.productReferenceImagePaths ?? []),
    ]
      .filter(Boolean)
      .map(String)
    if (!hasProductLock(shot, refs)) throw new Error('请先上传产品参考图或填写产品锁定信息')
    const productType = normalizeProductType(shot.productType)
    const compiled = promptConsistencyService.getShotConsistencyReport(item.id, shot.id) ||
      promptConsistencyService.previewShotConsistencyPrompt(item.id, shot)

    return {
      shotId: shot.id,
      promptCompilerVersion: compiled.compilerVersion,
      consistencyMode: compiled.strictConsistencyMode ? 'strict' : 'standard',
      productType,
      compiledPrompt: compiled.finalPrompt,
      compiledNegativePrompt: compiled.finalNegativePrompt,
      startPrompt: buildGptFramePrompt({
        shot,
        productType,
        modelPack: pack,
        productPoints: shot.aiPrompt || shot.materialNeed,
        which: 'start',
        compiledPrompt: compiled.finalPrompt,
      }),
      endPrompt: buildGptFramePrompt({
        shot,
        productType,
        modelPack: pack,
        productPoints: shot.aiPrompt || shot.materialNeed,
        which: 'end',
        compiledPrompt: compiled.finalPrompt,
      }),
      negativePrompt: compiled.finalNegativePrompt,
      referenceImageCount: refs.length,
      modelIdentityPackId: pack.id,
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
    })
    replaceProjectShot(item, shot.id, {
      compiledPrompt: compiled.finalPrompt,
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
  }) {
    const base = await cloneRepo.getProject(input.cloneProjectId)
    if (!base || !base.blueprint) throw new Error('复刻项目或蓝图不存在')
    const onlyMissing = input.onlyMissing !== false
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
    const envConcurrency = Number(process.env.CLONE_STORYBOARD_FRAME_CONCURRENCY || '')
    const requestedConcurrency = Number(input.concurrency ?? envConcurrency ?? 2)
    const frameConcurrency = Math.max(1, Math.min(3, Number.isFinite(requestedConcurrency) ? Math.floor(requestedConcurrency) : 2))
    const frameQueue = new PQueue({ concurrency: frameConcurrency })
    await Promise.all(
      shots.map((shot) =>
        frameQueue.add(async () => {
          try {
            await cloneService.generateGptShotFrames({
              cloneProjectId: input.cloneProjectId,
              shotId: shot.id,
              which,
              productReferenceImagePaths: input.productReferenceImagePaths,
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
    return {
      project: latest ?? base,
      queueSummary: { total, done, failed, skipped },
      errors,
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
    patchWorkflowV2(item, 'export_final', 'export_final', 'done')
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
        const next = await this.generateShotClip({ cloneProjectId: item.id, shotId: shot.id })
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
    if (!shot) throw new Error('锟斤拷锟斤拷失锟斤拷')
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
                    generatedTaskId: existing.taskId || s.generatedTaskId,
                    status: 'done',
                    error: '',
                  }
                : s,
            ),
          }
          syncSegmentVideoOutput(item, shot, {
            status: 'done',
            taskId: existing.taskId,
            provider: existing.provider,
            model: existing.model,
            endpointStyle: existing.endpointStyle,
            requestCapability: existing.requestCapability,
            remoteStatus: existing.remoteStatus || 'done',
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
      if ((existing.status === 'done' || existing.status === 'remote_running' || existing.status === 'downloading') && existing.taskId) {
        const recovered = await recoverAi666TaskById({ credentials: creds, taskId: existing.taskId, outDir })
        if (recovered.synced && recovered.outputPath) {
          const saved = await saveSegmentDone({
            project: item,
            shot,
            taskId: existing.taskId,
            provider: existing.provider || 'apifox_hub',
            model: existing.model || videoProviderModel(creds),
            endpointStyle: existing.endpointStyle || resolveApifoxHubCredentials(creds, 'video')?.videoEndpointStyle,
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
            status: 'failed',
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
      if (existing.status !== 'idle' && existing.status !== 'failed' && existing.status !== 'polling_timeout') {
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
        if (current.taskId) {
          const recovered = await recoverAi666TaskById({ credentials: creds, taskId: current.taskId, outDir })
          if (recovered.synced && recovered.outputPath) {
            const saved = await saveSegmentDone({
              project: item,
              shot: activeShot,
              taskId: current.taskId,
              provider: current.provider || 'apifox_hub',
              model: current.model || videoProviderModel(creds),
              endpointStyle: current.endpointStyle || resolveApifoxHubCredentials(creds, 'video')?.videoEndpointStyle,
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
          status: current.taskId ? 'polling_timeout' : 'failed',
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
    if (!targetProduct) throw new Error('锟斤拷锟斤拷失锟斤拷')

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
    if (!item) throw new Error('锟斤拷锟斤拷失锟斤拷')
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



