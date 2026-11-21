<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import CloneConsoleSidebar from '../components/clone/CloneConsoleSidebar.vue'
import CloneDataCard from '../components/clone/CloneDataCard.vue'
import CloneMediaCard from '../components/clone/CloneMediaCard.vue'
import CloneShotReplaceMenu from '../components/clone/CloneShotReplaceMenu.vue'
import CloneStageHeader from '../components/clone/CloneStageHeader.vue'
import CloneStateCard from '../components/clone/CloneStateCard.vue'
import RuntimeLogDialog from '../components/RuntimeLogDialog.vue'
import ClonePromptManager from '../components/clone/ClonePromptManager.vue'
import CloneSimplePanel, { type CloneSimplePhase, type CloneSimpleState } from '../components/clone/CloneSimplePanel.vue'
import { useCloneProjectWorkspace } from '@/composables/useCloneProjectWorkspace'
import { useCloneRouteProject } from '@/composables/useCloneRouteProject'
import { resolveCloneWorkspaceClient } from '@/lib/cloneWorkspaceClient'
import { hasStoredWebToken, webApiClient } from '@/lib/webApiClient'
import { useCloneTopbarStore } from '@/stores/cloneTopbar'
import { storeToRefs } from 'pinia'
import { AlertTriangle, ArrowRight, Check, ChevronLeft, ChevronRight, Clapperboard, Copy, Download, Eye, FileText, Film, FolderOpen, Hand, Image as ImageIcon, Info, Lightbulb, Link2, LoaderCircle, Lock, LockOpen, Maximize2, Package, Play, RefreshCw, RotateCw, Save, Search, Send, SlidersHorizontal, Sparkles, Trash2, Upload, UserRound, X } from 'lucide-vue-next'

const { t: tr } = useI18n()
const route = useRoute()
const router = useRouter()
const { routeProjectId, resolveActiveProjectId } = useCloneRouteProject()
const cloneTopbar = useCloneTopbarStore()
const { requestedStageKey } = storeToRefs(cloneTopbar)

type StoryBeat = {
  id: string
  purpose: string
  shotType: string
  productRole: string
  index?: number
  startSec?: number
  endSec?: number
  voiceover?: string
  onScreenText?: string
  visualDescription?: string
  scriptSegment?: string
}

type ScriptVariantCandidate = {
  id: string
  title: string
  summary: string
  fullScript: string
  shotScripts?: Array<{
    shotId: string
    shotIndex: number
    timeRange?: string
    scriptText: string
    scriptRole?: string
    visualDescription?: string
    actionDescription?: string
    cameraDescription?: string
    generationPrompt?: string
  }>
  score: number
  reason: string
  selected?: boolean
}

type StoryboardGridBatch = {
  id: string
  frameCount: number
  gridType: 'grid-6' | 'grid-9'
  imagePath?: string
  croppedFramePaths: string[]
  status: string
}

type StoryboardFrame = {
  id: string
  shotId: string
  batchId?: string
  frameIndex?: number
  imagePath?: string
  status: string
  error?: string
  retryCount?: number
  updatedAt?: number
}

type BlueprintShot = {
  id: string
  index?: number
  startSec?: number
  endSec?: number
  durationSec?: number
  scriptRole?: string
  scriptText?: string
  generationPrompt?: string
  visualDescription?: string
  actionDescription?: string
  cameraDescription?: string
  shotType?: string
  purpose?: string
  status?: string
  error?: string
  gptFrameStatus?: string
  gptFrameError?: string
  gptFirstFramePath?: string
  gptLastFramePath?: string
  generatedFirstFramePath?: string
  generatedLastFramePath?: string
  generatedClipPath?: string
  generatedTaskId?: string
  qualityStatus?: 'unchecked' | 'pending' | 'passed' | 'warning' | 'failed'
  qualityReasons?: string[]
  canEnterRender?: boolean
  locked?: boolean
  retryCount?: number
}

type ShotVideoOutput = {
  segmentId?: string
  index?: number
  shotId: string
  source: 'generated' | 'uploaded_replacement'
  videoPath?: string
  localPath?: string
  videoUrl?: string
  taskId?: string
  previousTaskIds?: string[]
  provider?: string
  model?: string
  requestCapability?: string
  endpointStyle?: string
  remoteStatus?: string
  remoteRaw?: unknown
  durationSec?: number
  status: string
  error?: string
  retryCount?: number
  lastPollAt?: number
  completedAt?: number
}

type ShotImagePromptPreview = {
  shotId: string
  storyboardSubjectType?: 'product_only' | 'hand_only_product' | 'local_wearable_closeup' | 'model_visible' | 'unknown'
  storyboardReferenceMode?: 'product_closeup' | 'model_presentation'
  storyboardReferenceConfidence?: 'high' | 'medium' | 'low'
  storyboardReferenceReason?: string[]
  referenceModeLocked?: boolean
  referenceModeLockReason?: string
  promptBuildSentinel?: string
  promptCompilerVersion?: string
  consistencyMode?: string
  productType?: string
  compiledPrompt?: string
  compiledNegativePrompt?: string
  productDescriptionText?: string
  productDescriptionBlock?: string
  productReferenceUsageSummary?: string
  primaryProductReferenceImagePath?: string
  sceneAtmosphereBlock?: string
  modelIdentityBlock?: string
  referenceResponsibilityBlock?: string
  hasCompiledProductLock?: boolean
  hasProductDescriptionBlock?: boolean
  hasDirectProductReuseLock?: boolean
  hasSceneAtmosphereBlock?: boolean
  hasModelIdentityBlock?: boolean
  startPrompt?: string
  endPrompt?: string
  negativePrompt?: string
  referenceImageCount?: number
  modelIdentityPackId?: string
  productReferenceImagePaths?: string[]
  productReferenceImageCount?: number
  modelReferenceImagePaths?: string[]
  modelReferenceImageCount?: number
  requestProvider?: string
  requestModel?: string
  requestJsonStart?: string
  requestJsonEnd?: string
  sceneReferenceImagePath?: string
  identityGridReferenceImagePath?: string
}

type ShotVideoPromptPreview = {
  shotId: string
  promptBuildSentinel?: string
  promptCompilerVersion?: string
  consistencyMode?: string
  productType?: string
  productDescriptionText?: string
  productDescriptionBlock?: string
  storyboardProductDescriptionBlock?: string
  productReferenceUsageSummary?: string
  primaryProductReferenceImagePath?: string
  hasCompiledProductLock?: boolean
  hasProductDescriptionBlock?: boolean
  hasScriptText?: boolean
  hasGenerationPrompt?: boolean
  scriptText?: string
  generationPrompt?: string
  visualDescription?: string
  actionDescription?: string
  cameraDescription?: string
  compiledPrompt?: string
  startFramePrompt?: string
  endFramePrompt?: string
  compiledNegativePrompt?: string
  positivePrompt?: string
  negativePrompt?: string
  productReferenceImagePaths?: string[]
  productReferenceImageCount?: number
  modelReferenceImagePaths?: string[]
  modelReferenceImageCount?: number
  scriptSpliceText?: string
  requestPayloadPreview?: string
  requestDebugLogPreview?: string
  requestProvider?: string
  requestModel?: string
  requestCapability?: string
  requestEndpointStyle?: string
  requestCreateUrl?: string
  localFirstFramePath?: string
  localLastFramePath?: string
  requestJson?: string
}

type IdentityGridPromptPreview = {
  profile?: Record<string, unknown>
  description?: string
  prompt?: string
  productType?: string
  productPoints?: string
  productReferenceImageCount?: number
  productReferenceImagePaths?: string[]
  modelReferenceImageCount?: number
  modelReferenceImagePaths?: string[]
  gridUsagePlan?: string[]
  requestProvider?: string
  requestModel?: string
  requestJson?: string
}

type PromptParamRow = {
  key: string
  value: string
  uploadPaths?: string[]
}

type PromptPreviewStat = {
  label: string
  value: string
}

type FinalCompose = {
  status: string
  outputPath?: string
  error?: string
  composeHealth?: {
    verdict?: 'balanced' | 'needs_tuning'
    flags?: string[]
    recommendations?: string[]
  }
  composeSummary?: {
    totalShots?: number
    stageCounts?: Partial<Record<'hook' | 'body' | 'close', number>>
    aggressiveShotCount?: number
    readabilityProtectedCount?: number
    productPriorityCount?: number
    averageClipDurationSec?: number
    strongHookCount?: number
  }
}

type CloneProject = {
  id: string
  status: string
  runMode?: 'auto' | 'manual'
  referenceVideoPath: string
  referenceVideoName: string
  productReferenceImagePaths?: string[]
  originalProductReferenceImagePaths?: string[]
  sanitizedProductReferenceImagePaths?: string[]
  productImageSanitizationStatus?: 'idle' | 'processing' | 'done' | 'failed'
  productImageSanitizationError?: string
  selectedModelIdentitySnapshot?: {
    id: string
    name?: string
    model?: string
    imagePaths?: string[]
    coverImagePath?: string
  }
  blueprint?: {
    title?: string
    scriptAnalysisError?: string
    duration?: number
    category?: string
    market?: string
    visualStyle?: string
    hookType?: string
    rhythm?: string
    globalScript?: {
      content?: string
      cameraMotion?: string
      shotScale?: string
      lighting?: string
      colorTone?: string
      subjectAction?: string
      environment?: string
      reversePrompt?: string
    }
    shots?: BlueprintShot[]
    localization?: { language?: string }
    renderHints?: { aspectRatio?: '9:16' | '16:9'; pacing?: string; resolution?: string }
    storyBeats?: StoryBeat[]
  } | null
  scriptVariantCandidates?: ScriptVariantCandidate[]
  selectedScriptVariantId?: string
  storyboardGridBatches?: StoryboardGridBatch[]
  storyboardFrames?: StoryboardFrame[]
  projectIdentityGridPath?: string
  projectIdentityGridStatus?: 'idle' | 'generating' | 'done' | 'failed'
  projectIdentityGridUpdatedAt?: number
  projectIdentityGridPromptPreview?: IdentityGridPromptPreview
  shotVideoOutputs?: ShotVideoOutput[]
  finalCompose?: FinalCompose
  lastError?: string
  workflowV2?: {
    currentStep?: string
  }
  autoFlowStatus?: {
    enabled?: boolean
    status?: string
    targetStage?: 'storyboard_videos' | 'final_compose'
    currentStage?: string
    imageRetryLimit?: number
    videoRetryLimit?: number
    lastSummary?: string
    lastHeartbeatAt?: number
    lastProgressAt?: number
    idleHeartbeatCount?: number
  }
  generationQueue?: {
    runtime?: {
      submitActive?: number
      pollActive?: number
      downloadActive?: number
      submitQueued?: number
      pollQueued?: number
      downloadQueued?: number
    }
    lastShotVideoSummary?: {
      total?: number
      done?: number
      failed?: number
      skipped?: number
      pending?: number
      timeout?: number
      creating?: number
      remoteRunning?: number
      downloading?: number
      retryableFailed?: number
    }
    lastShotVideoFailureBreakdown?: {
      missingTask?: number
      remoteTimeout?: number
      downloadFailed?: number
      remoteFailed?: number
      localFailed?: number
    }
  }
  previewPipeline?: {
    status?: 'idle' | 'running' | 'preview_ready' | 'background_running' | 'done' | 'failed'
    previewOutputPath?: string
    previewReportPath?: string
    lastError?: string
  }
  pipelineStatus?: {
    activeProviderSummary?: {
      image?: {
        provider?: string
        model?: string
      }
    }
    errorContext?: {
      provider?: string
      model?: string
      endpointStyle?: string
      baseUrl?: string
      requestCapability?: string
      taskId?: string
      responseSnippet?: string
      action?: string
      message?: string
    }
  }
}

type ModelItem = {
  id: string
  name: string
  status: string
  model?: string
  imagePaths?: string[]
  coverImagePath?: string
  gender?: string
  ageRange?: string
  sceneStyle?: string
}

type ProductLibraryItem = {
  id: string
  name: string
  type: string
  coverImagePath?: string
  images?: Array<{ filePath?: string; isCover?: boolean }>
  canonicalSourcePath?: string
  canonicalSourceStatus?: 'idle' | 'processing' | 'done' | 'failed'
  canonicalSourceUpdatedAt?: number
  assets?: Record<string, Array<{ filePath?: string }>>
}

type StageItem = {
  key: string
  title: string
  desc: string
  done: boolean
  active: boolean
}

type RuntimeLogItem = { id: string; level: 'info' | 'success' | 'error'; message: string; time: number }

type ComposeAspectRatio = '9:16' | '1:1' | '16:9'
type ComposeQuality = 'hd' | 'standard' | 'ultra'
type ComposeStyle = 'default' | 'sharp' | 'cinematic'
type VideoRenderAspectRatio = '9:16' | '16:9'
type VideoRenderResolution = '720x1280' | '1280x720' | '1080x1920' | '1920x1080'

const current = ref<CloneProject | null>(null)
const models = ref<ModelItem[]>([])
const products = ref<ProductLibraryItem[]>([])
const loading = ref(false)
const modelLoading = ref(false)
const referenceVideoPath = ref('')
const productRefs = ref<string[]>([])
const productRefsDraft = ref<string[] | null>(null)
const productRefPreviewMode = ref<'sanitized' | 'original'>('sanitized')
const selectedProductId = ref('')
const productQuery = ref('')
const selectedModelId = ref('')
const errorText = ref('')
const stageLog = ref(tr('autoUi.k_4498055b51f3'))
const runtimeLogs = ref<RuntimeLogItem[]>([])
const runtimeDialogOpen = ref(false)
const autoBootstrapSignature = ref('')
const autoRunRequestedAfterAnalyze = ref(false)
const autoStoryboardVideoDispatching = ref(false)
const autoRunIntentArmed = ref(false)
const storyboardBatchSummary = ref<{ total: number; done: number; failed: number; skipped: number } | null>(null)
const modelModalOpen = ref(false)
const productModalOpen = ref(false)
const framePreviewOpen = ref(false)
const framePreviewPath = ref('')
const framePreviewTitle = ref('')
const shotPromptPreviewOpen = ref(false)
const shotVideoPromptPreviewOpen = ref(false)
const promptManagerOpen = ref(false)
type PromptManagerKind = 'script_analysis' | 'storyboard_model' | 'storyboard_product' | 'shot_video'
const PROMPT_KINDS_BY_STEP: Record<'all' | 'analyze' | 'grid' | 'video', PromptManagerKind[]> = {
  all: ['script_analysis', 'storyboard_model', 'storyboard_product', 'shot_video'],
  analyze: ['script_analysis'],
  grid: ['storyboard_model', 'storyboard_product'],
  video: ['shot_video'],
}
const promptManagerKinds = ref<PromptManagerKind[]>(PROMPT_KINDS_BY_STEP.video)
const promptManagerKind = ref<PromptManagerKind>('shot_video')
const promptManagerProductType = ref('all')
/** Category of the bound product, so the dialog opens on the templates this project actually uses. */
function projectPromptProductType() {
  const project = current.value as any
  const candidates = [project?.boundProductSnapshot?.type, project?.blueprint?.productCategory, project?.baseBlueprint?.productCategory]
  for (const candidate of candidates) {
    const normalized = candidate ? normalizeCloneProductType(candidate) : 'general'
    if (normalized !== 'general') return normalized
  }
  return 'all'
}
function openPromptManager(step: 'all' | 'analyze' | 'grid' | 'video', options?: { kind?: PromptManagerKind; productType?: unknown }) {
  promptManagerKinds.value = PROMPT_KINDS_BY_STEP[step]
  promptManagerKind.value = options?.kind && PROMPT_KINDS_BY_STEP[step].includes(options.kind) ? options.kind : PROMPT_KINDS_BY_STEP[step][0]
  const explicit = options?.productType ? normalizeCloneProductType(options.productType) : 'general'
  promptManagerProductType.value = explicit !== 'general' ? explicit : projectPromptProductType()
  promptManagerOpen.value = true
}
const identityGridPromptPreviewOpen = ref(false)
const composeOutputDir = ref('')
const composeLocalError = ref('')
const shotPromptCopyMessage = ref('')
const regeneratingShotVideoIds = ref<string[]>([])
const forceDownloadingShotVideoIds = ref<string[]>([])
const regeneratingFailedShotVideos = ref(false)
const regeneratingStoryboardShotIds = ref<string[]>([])
const regeneratingFailedStoryboardFrames = ref(false)
const selectedStoryboardShotIds = ref<string[]>([])
const queryingStoryboardFrames = ref(false)
const variantCount = ref(3)
const selectedStageKey = ref<StageItem['key'] | ''>('')
const selectedShotId = ref('')
const selectedShotFilter = ref<'all' | 'ready' | 'failed' | 'pending'>('all')
const composeAspectRatio = ref<ComposeAspectRatio>('9:16')
const composeQuality = ref<ComposeQuality>('hd')
const composeStyle = ref<ComposeStyle>('default')
const videoRenderAspectRatio = ref<VideoRenderAspectRatio>('9:16')
const videoRenderResolution = ref<VideoRenderResolution>('1080x1920')
const savingVideoRenderHints = ref(false)
const shotImagePromptPreviewLoading = ref(false)
const shotImagePromptPreviewError = ref('')
const shotImagePromptPreview = ref<ShotImagePromptPreview | null>(null)
const shotImagePromptPreviewLoadedShotId = ref('')
const shotVideoPromptPreviewLoading = ref(false)
const shotVideoPromptPreviewError = ref('')
const shotVideoPromptPreview = ref<ShotVideoPromptPreview | null>(null)
const shotVideoPromptPreviewLoadedShotId = ref('')
const identityGridPromptPreviewLoading = ref(false)
const identityGridPromptPreviewError = ref('')
const identityGridPromptPreview = ref<IdentityGridPromptPreview | null>(null)
function closeTransientModalOverlays() {
  modelModalOpen.value = false
  productModalOpen.value = false
}

function closePromptPreviewOverlays() {
  shotPromptPreviewOpen.value = false
  shotVideoPromptPreviewOpen.value = false
  identityGridPromptPreviewOpen.value = false
}

function closeFramePreviewOverlay() {
  framePreviewOpen.value = false
  framePreviewPath.value = ''
  framePreviewTitle.value = ''
}

function closeAllModalOverlays() {
  closeTransientModalOverlays()
  closePromptPreviewOverlays()
  closeFramePreviewOverlay()
}

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

const currentModel = computed(() => models.value.find((item) => item.id === selectedModelId.value) || null)
const modelSnapshot = computed(() => currentModel.value || current.value?.selectedModelIdentitySnapshot || null)
const storyBeats = computed(() => safeArray(current.value?.blueprint?.storyBeats))
const scriptVariants = computed(() => safeArray(current.value?.scriptVariantCandidates))
const storyboardBatches = computed(() => safeArray(current.value?.storyboardGridBatches))
const blueprintShots = computed<BlueprintShot[]>(() => safeArray(current.value?.blueprint?.shots))
const storyboardFrames = computed<StoryboardFrame[]>(() => {
  const rawFrames = safeArray(current.value?.storyboardFrames)
  const rawMap = new Map(rawFrames.map((item) => [item.shotId, item]))
  const shots = [...blueprintShots.value].sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
  if (!shots.length) return rawFrames
  return shots.map((shot, index) => {
    const raw = rawMap.get(shot.id)
    const isGenerating = safeText(shot.gptFrameStatus, '').toLowerCase() === 'generating'
    const imagePath =
      safeText(shot.gptFirstFramePath, '') ||
      safeText(shot.generatedFirstFramePath, '') ||
      safeText(raw?.imagePath, '') ||
      undefined
    const error = imagePath
      ? undefined
      : safeText(shot.gptFrameError, '') ||
        safeText(shot.error, '') ||
        safeText(raw?.error, '') ||
        undefined
    const status = !imagePath && isGenerating
      ? 'generating'
      : imagePath
        ? 'cropped'
        : safeText(shot.gptFrameStatus, '') || safeText(shot.status, '') || safeText(raw?.status, 'failed')
    return {
      id: raw?.id || `${shot.id}-${index}`,
      shotId: shot.id,
      batchId: raw?.batchId,
      frameIndex: typeof raw?.frameIndex === 'number' ? raw.frameIndex : index,
      imagePath,
      status,
      error,
      updatedAt: raw?.updatedAt,
    }
  })
})
const rawShotVideoOutputs = computed(() => safeArray(current.value?.shotVideoOutputs))
const rawShotVideoOutputMap = computed(() => new Map(rawShotVideoOutputs.value.map((item) => [item.shotId, item] as const)))
const shotVideoOutputs = computed<ShotVideoOutput[]>(() =>
  blueprintShots.value
    .filter((shot) => Boolean(
      String(
        shot.gptFirstFramePath ||
          shot.generatedFirstFramePath ||
          shot.uploadedImagePath ||
          shot.generatedClipPath ||
          shot.generatedTaskId ||
          '',
      ).trim(),
    ))
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    .map((shot) => {
      const existing = rawShotVideoOutputMap.value.get(shot.id)
      const normalizedStatus = String(existing?.status || 'idle').toLowerCase()
      const existingHasLocalVideo = Boolean(String(existing?.videoPath || existing?.localPath || shot.generatedClipPath || '').trim())
      const isReplacementRun =
        !existingHasLocalVideo &&
        (Array.isArray(existing?.previousTaskIds) && existing.previousTaskIds.length > 0) ||
        (
          !existingHasLocalVideo &&
          (
            Boolean((existing as any)?.submissionStartedAt) ||
            Boolean((existing as any)?.submissionLockedUntil) ||
            ['force_regenerate_reset', 'segment_submit_started', 'segment_submit_succeeded', 'storyboard_video_batch_submit_started'].includes(
              String((existing as any)?.sourceEvent || '').trim().toLowerCase(),
            )
          )
        )
      const resolvedVideoPath = String(existing?.videoPath || existing?.localPath || (!isReplacementRun ? shot.generatedClipPath : '') || '').trim()
      const isResolvedLocalVideoReady = Boolean(resolvedVideoPath)
      const resolvedStatus =
        isResolvedLocalVideoReady && (
          normalizedStatus === 'downloading' ||
          normalizedStatus === 'remote_succeeded_pending_download' ||
          normalizedStatus === 'remote_running' ||
          normalizedStatus === 'remote_pending' ||
          normalizedStatus === 'failed_retryable' ||
          normalizedStatus === 'failed_terminal' ||
          normalizedStatus === 'done'
        )
          ? 'done'
          : (existing?.status || 'idle')
      const shouldIgnoreShotError =
        String(resolvedStatus).toLowerCase() === 'submitting' ||
        String(resolvedStatus).toLowerCase() === 'remote_pending' ||
        String(resolvedStatus).toLowerCase() === 'remote_running' ||
        String(resolvedStatus).toLowerCase() === 'remote_succeeded_pending_download' ||
        String(resolvedStatus).toLowerCase() === 'downloading' ||
        String(resolvedStatus).toLowerCase() === 'done'
      const resolvedRemoteStatus =
        isResolvedLocalVideoReady && String(existing?.remoteStatus || '').trim().toLowerCase() === 'succeeded'
          ? 'succeeded'
          : existing?.remoteStatus
      return {
        segmentId: existing?.segmentId || shot.id,
        index: typeof existing?.index === 'number' ? existing.index : Number(shot.index ?? 0),
        shotId: shot.id,
        source: existing?.source || 'generated',
        videoPath: resolvedVideoPath || undefined,
        localPath: String(existing?.localPath || existing?.videoPath || (!isReplacementRun ? shot.generatedClipPath : '') || '').trim() || undefined,
        videoUrl: resolveShotRemoteVideoUrl(existing),
        taskId:
          existing?.taskId && !String(existing.taskId).trim().toLowerCase().startsWith('gpt_frame_') && !String(existing.taskId).trim().toLowerCase().startsWith('mj_')
            ? existing.taskId
            : shot.generatedTaskId || undefined,
        previousTaskIds: existing?.previousTaskIds,
        provider:
          existing?.provider && !String(existing.provider).trim().toLowerCase().includes('image')
            ? existing.provider
            : shot.generatedProvider || undefined,
        model:
          existing?.model &&
          !String(existing.model).trim().toLowerCase().includes('image') &&
          !String(existing.model).trim().toLowerCase().includes('dall-e') &&
          !String(existing.model).trim().toLowerCase().includes('/edit')
            ? existing.model
            : shot.generatedModel || undefined,
        requestCapability: existing?.requestCapability,
        endpointStyle: existing?.endpointStyle,
        remoteStatus: resolvedRemoteStatus,
        remoteRaw: existing?.remoteRaw,
        durationSec: existing?.durationSec || shot.generatedClipDurationSec || shot.durationSec || undefined,
        status: resolvedStatus as ShotVideoOutput['status'],
        error: shouldIgnoreShotError ? undefined : existing?.error || shot.error || undefined,
        retryCount: typeof existing?.retryCount === 'number' ? existing.retryCount : shot.retryCount,
        lastPollAt: existing?.lastPollAt,
        completedAt: existing?.completedAt,
      } satisfies ShotVideoOutput
    }).map((item) => {
      if (['shot_2', 'shot_3', 'shot_4'].includes(String(item.shotId || ''))) {
        console.log(
          '[clone-debug] renderer-shot-video-output ' +
            JSON.stringify({
              shotId: item.shotId,
              status: item.status,
              videoPath: item.videoPath,
              localPath: item.localPath,
              remoteStatus: item.remoteStatus,
              taskId: item.taskId,
              previousTaskIds: item.previousTaskIds,
            }),
        )
      }
      return item
    }),
)
const shotVideoOutputIndexMap = computed<Record<string, number>>(() =>
  Object.fromEntries(shotVideoOutputs.value.map((item, index) => [item.shotId, index])),
)
function resolveShotOutputVideoPath(item?: ShotVideoOutput | null) {
  return String(item?.videoPath || item?.localPath || '').trim()
}

function resolveShotRemoteVideoUrl(item?: Partial<ShotVideoOutput> | null) {
  const raw = item?.remoteRaw && typeof item.remoteRaw === 'object' ? (item.remoteRaw as Record<string, any>) : {}
  const data = raw.data && typeof raw.data === 'object' ? raw.data : {}
  const result = raw.result && typeof raw.result === 'object' ? raw.result : {}
  const output = raw.output && typeof raw.output === 'object' ? raw.output : {}
  const candidates = [
    item?.videoUrl,
    raw.video_url,
    raw.videoUrl,
    raw.url,
    raw.output_url,
    raw.outputUrl,
    raw.metadata?.video_url,
    raw.metadata?.videoUrl,
    raw.metadata?.url,
    data.video_url,
    data.videoUrl,
    data.url,
    data.metadata?.video_url,
    data.metadata?.videoUrl,
    data.metadata?.url,
    result.video_url,
    result.videoUrl,
    result.url,
    result.metadata?.video_url,
    result.metadata?.videoUrl,
    result.metadata?.url,
    output.video_url,
    output.videoUrl,
    output.url,
    output.metadata?.video_url,
    output.metadata?.videoUrl,
    output.metadata?.url,
  ]
  return candidates.map((value) => String(value || '').trim()).find((value) => /^https?:\/\//i.test(value)) || ''
}

function hasReadyShotOutputVideo(item?: ShotVideoOutput | null) {
  return Boolean(resolveShotOutputVideoPath(item))
}

const filteredShotOutputs = computed(() => {
  switch (selectedShotFilter.value) {
    case 'ready':
      return shotVideoOutputs.value.filter((item) => hasReadyShotOutputVideo(item))
    case 'failed':
      return shotVideoOutputs.value.filter((item) => item.status === 'failed_retryable' || item.status === 'failed_terminal' || Boolean(item.error))
    case 'pending':
      return shotVideoOutputs.value.filter((item) => !hasReadyShotOutputVideo(item) && !(item.status === 'failed_retryable' || item.status === 'failed_terminal' || Boolean(item.error)))
    default:
      return shotVideoOutputs.value
  }
})
const selectedShotOutput = computed<ShotVideoOutput | null>(
  () => shotVideoOutputs.value.find((item) => item.shotId === selectedShotId.value) || shotVideoOutputs.value[0] || null,
)
const selectedShotIndex = computed(() => shotVideoOutputs.value.findIndex((item) => item.shotId === selectedShotOutput.value?.shotId))
const selectedStoryBeat = computed<StoryBeat | null>(
  () => storyBeats.value.find((item) => item.id === selectedShotOutput.value?.shotId) || null,
)
const storyBeatMap = computed<Record<string, StoryBeat>>(() =>
  Object.fromEntries(storyBeats.value.map((item) => [item.id, item])),
)
const shotFrameMap = computed<Record<string, StoryboardFrame>>(() =>
  Object.fromEntries(storyboardFrames.value.map((item) => [item.shotId, item])),
)
const blueprintShotMap = computed<Record<string, BlueprintShot>>(() =>
  Object.fromEntries(blueprintShots.value.map((item) => [item.id, item])),
)
const selectedVariantShotScripts = computed(
  () => safeArray(scriptVariants.value.find((item) => item.id === selectedVariantId.value)?.shotScripts),
)
const storyboardDesignRows = computed(() =>
  selectedVariantShotScripts.value.map((shot, index) => {
    const beat = storyBeatMap.value[shot.shotId]
    const blueprintShot = blueprintShotMap.value[shot.shotId]
    const frame = shotFrameMap.value[shot.shotId]
    const durationSec = Number(
      blueprintShot?.durationSec ??
        ((Number.isFinite(Number(beat?.endSec)) && Number.isFinite(Number(beat?.startSec)))
          ? Number(beat?.endSec) - Number(beat?.startSec)
          : 0),
    )
    const frameStatus = safeText(frame?.status || blueprintShot?.gptFrameStatus || blueprintShot?.status, '').toLowerCase()
    const hasImage = Boolean(frame?.imagePath)
    const isRegenerating =
      !hasImage && (
        safeText(blueprintShot?.gptFrameStatus, '').toLowerCase() === 'generating' ||
        frameStatus === 'generating' ||
        regeneratingStoryboardShotIds.value.includes(shot.shotId)
      )
    return {
      shotId: shot.shotId,
      shotIndex: typeof shot.shotIndex === 'number' ? shot.shotIndex + 1 : index + 1,
      scriptCode: `脚本-${typeof shot.shotIndex === 'number' ? shot.shotIndex + 1 : index + 1}`,
      imagePath: frame?.imagePath || '',
      statusText: isRegenerating
        ? tr('autoUi.k_487e1c4e2927')
        : blueprintShot?.locked
          ? tr('autoUi.k_3cc7a5af4c19')
          : frame?.imagePath
            ? tr('autoUi.k_79c74f41ca9e')
            : humanStatus(frame?.status || blueprintShot?.status || 'idle'),
      retryCount: typeof frame?.retryCount === 'number' ? frame.retryCount : 0,
      promptText: safeText(shot.scriptText, safeText(blueprintShot?.scriptText, '等待脚本内容')),
      tags: [
        localizeShotField(beat?.shotType || blueprintShot?.shotType),
        localizePurpose(beat?.purpose),
        localizeShotField(beat?.productRole),
      ].filter((item, rowIndex, arr) => item && item !== '--' && arr.indexOf(item) === rowIndex).slice(0, 3),
      durationText: durationSec > 0 ? formatDuration(durationSec) : safeText(shot.timeRange, '--'),
      sceneText: localizeShotField(beat?.shotType || blueprintShot?.shotType),
      cameraText: safeText(blueprintShot?.cameraDescription, localizeShotField(beat?.productRole)),
      voiceText: safeText(beat?.voiceover || beat?.onScreenText, '--'),
      locked: Boolean(blueprintShot?.locked),
      error: safeText(frame?.error || blueprintShot?.gptFrameError, ''),
      updatedAt: Number(frame?.updatedAt || 0),
      isRegenerating,
      }
    }),
)
const selectedStoryboardErrorText = computed(() => safeText(selectedStoryboardRow.value?.error, ''))
const selectedStoryboardErrorAdvice = computed(() => {
  const errorText = selectedStoryboardErrorText.value.toLowerCase()
  if (!errorText) return ''
  if (errorText.includes('请先生成并确认新模特身份包')) return tr('autoUi.k_7d6ec4c16873')
  if (errorText.includes('请先生成身份定妆图')) return tr('autoUi.k_2595f165df6d')
  if (errorText.includes('请先选择商品库商品')) return tr('autoUi.k_d04f83a22556')
  if (errorText.includes('请先完成参考视频分析')) return tr('autoUi.k_b52ccf3a734a')
  if (errorText.includes('产品标准源生成失败')) return tr('autoUi.k_e2dd92ea09a9')
  if (errorText.includes('未配置') || errorText.includes('api key') || errorText.includes('provider')) {
    return tr('autoUi.k_d976a74c2018')
  }
  return tr('autoUi.k_565c73bcd588')
})
const selectedStoryboardErrorTitle = computed(() => {
  const errorText = selectedStoryboardErrorText.value.toLowerCase()
  if (!errorText) return ''
  if (errorText.includes('请先生成并确认新模特身份包')) return tr('autoUi.k_018019407fe3')
  if (errorText.includes('请先生成身份定妆图')) return tr('autoUi.k_fd3602ad3c58')
  if (errorText.includes('请先选择商品库商品')) return tr('autoUi.k_dcc251d28547')
  if (errorText.includes('请先完成参考视频分析')) return tr('autoUi.k_b45cb3fa2725')
  if (errorText.includes('产品标准源生成失败')) return tr('autoUi.k_d9217cf4da0a')
  if (errorText.includes('未配置') || errorText.includes('api key') || errorText.includes('provider')) return tr('autoUi.k_1e5403fc012d')
  return tr('autoUi.k_5c52a00786ec')
})
const selectedStoryboardErrorAction = computed(() => {
  const errorText = selectedStoryboardErrorText.value.toLowerCase()
  if (!errorText) return ''
  if (errorText.includes('请先生成身份定妆图')) return 'go-identity-grid'
  return ''
})
const selectedShotVideoErrorText = computed(() => safeText(selectedShotOutput.value?.error, ''))
const selectedShotVideoErrorAdvice = computed(() => {
  const errorText = selectedShotVideoErrorText.value.toLowerCase()
  if (!errorText) return ''
  if (errorText.includes('请先生成并确认新模特身份包')) return tr('autoUi.k_81d2f34a4e28')
  if (errorText.includes('请先生成身份定妆图')) return tr('autoUi.k_3451d3693625')
  if (errorText.includes('请先选择商品库商品')) return tr('autoUi.k_d04f83a22556')
  if (errorText.includes('请先完成参考视频分析')) return tr('autoUi.k_a82292641219')
  if (errorText.includes('产品标准源生成失败')) return tr('autoUi.k_e2dd92ea09a9')
  if (errorText.includes('未配置') || errorText.includes('api key') || errorText.includes('provider')) {
    return tr('autoUi.k_b64f448aea45')
  }
  return tr('autoUi.k_c3dd8ab992f6')
})
const selectedShotVideoErrorTitle = computed(() => {
  const errorText = selectedShotVideoErrorText.value.toLowerCase()
  if (!errorText) return ''
  if (errorText.includes('请先生成并确认新模特身份包')) return tr('autoUi.k_018019407fe3')
  if (errorText.includes('请先生成身份定妆图')) return tr('autoUi.k_fd3602ad3c58')
  if (errorText.includes('请先选择商品库商品')) return tr('autoUi.k_dcc251d28547')
  if (errorText.includes('请先完成参考视频分析')) return tr('autoUi.k_b45cb3fa2725')
  if (errorText.includes('产品标准源生成失败')) return tr('autoUi.k_d9217cf4da0a')
  if (errorText.includes('未配置') || errorText.includes('api key') || errorText.includes('provider')) return tr('autoUi.k_1e5403fc012d')
  return tr('autoUi.k_2752ffaa75a4')
})
const selectedShotVideoErrorAction = computed(() => {
  const errorText = selectedShotVideoErrorText.value.toLowerCase()
  if (!errorText) return ''
  if (errorText.includes('请先生成身份定妆图')) return 'go-identity-grid'
  return ''
})
const shotVideoOutputStateSignature = computed(() =>
  shotVideoOutputs.value.reduce(
    (acc, item) => {
      const status = String(item.status || '').toLowerCase()
      const remoteStatus = String(item.remoteStatus || '').toLowerCase()
      if (String(item.taskId || '').trim()) acc.taskBound += 1
      if (String(item.videoPath || item.localPath || '').trim()) acc.localReady += 1
      if (String(item.videoUrl || '').trim()) acc.remoteReady += 1
      if (status === 'downloading') acc.downloading += 1
      if (status === 'remote_succeeded_pending_download') acc.pendingDownload += 1
      if (status === 'remote_running' || status === 'remote_pending' || status === 'submitting') acc.running += 1
      if (remoteStatus === 'succeeded') acc.remoteSucceeded += 1
      acc.updatedAtMax = Math.max(acc.updatedAtMax, Number(item.updatedAt || item.lastPollAt || 0))
      return acc
    },
    {
      total: shotVideoOutputs.value.length,
      taskBound: 0,
      localReady: 0,
      remoteReady: 0,
      downloading: 0,
      pendingDownload: 0,
      running: 0,
      remoteSucceeded: 0,
      updatedAtMax: 0,
    },
  ),
)
const storyboardFrameStateSignature = computed(() =>
  storyboardFrames.value.reduce(
    (acc, item) => {
      if (String(item.imagePath || '').trim()) acc.ready += 1
      else if (String(item.error || '').trim()) acc.failed += 1
      else acc.pending += 1
      acc.retryableFailed += !String(item.imagePath || '').trim() && String(item.error || '').trim() && Number(item.retryCount || 0) < 2 ? 1 : 0
      acc.updatedAtMax = Math.max(acc.updatedAtMax, Number(item.updatedAt || 0))
      return acc
    },
    {
      total: storyboardFrames.value.length,
      ready: 0,
      pending: 0,
      failed: 0,
      retryableFailed: 0,
      updatedAtMax: 0,
    },
  ),
)
const finalOutputPath = computed(() => current.value?.finalCompose?.outputPath || '')
const finalOutputDirText = computed(() => safeText(shortPath(composeOutputDir.value || current.value?.outputDir || ''), tr('autoUi.k_1507374d9548')))
const localComposeErrorText = computed(() => safeText(current.value?.finalCompose?.error || composeLocalError.value, ''))
const composeHealthFlagLabelMap: Record<string, string> = {
  hook_overloaded: tr('autoUi.k_68540c8d27cf'),
  weak_opening_signal: tr('autoUi.k_a2cdfd8d707e'),
  cta_heavy: tr('autoUi.k_e05805410133'),
  too_many_aggressive_shots: tr('autoUi.k_7977c650ffb7'),
  product_focus_weak: tr('autoUi.k_e2627d4a83fc'),
  text_heavy: tr('autoUi.k_0c4c5f0d21f5'),
  low_variation_signal: tr('autoUi.k_04c1e8f2adb6'),
}
const composeHealthFlags = computed(() => safeArray(current.value?.finalCompose?.composeHealth?.flags).map((item) => safeText(item)).filter(Boolean))
const composeHealthFlagLabels = computed(() =>
  composeHealthFlags.value.map((item) => composeHealthFlagLabelMap[item] || item),
)
const composeHealthVerdictText = computed(() => {
  const verdict = safeText(current.value?.finalCompose?.composeHealth?.verdict)
  if (verdict === 'balanced') return tr('autoUi.k_61204fe5bd72')
  if (verdict === 'needs_tuning') return tr('autoUi.k_0a530aedca0e')
  return ''
})
const composeHealthRecommendationLabelMap: Record<string, string> = {
  'Reduce hook-like shots or soften the first sequence to avoid front-loaded fatigue.': tr('autoUi.k_cb9194270b22'),
  'Strengthen the opening with a clearer product hero, action reveal, or more direct payoff shot.': tr('autoUi.k_19d05e948f5b'),
  'Reduce close-stage density so the ending feels cleaner and less sales-heavy.': tr('autoUi.k_f4beebb4909e'),
  'Soften consecutive aggressive shots or add steadier product moments between them.': tr('autoUi.k_eb07b4f34412'),
  'Increase product-priority shots so the video spends more time on clear product value.': tr('autoUi.k_ae7fc61a1b0d'),
  'Reduce text density or split long selling lines so rhythm stays natural.': tr('autoUi.k_fbda7b0b1703'),
  'Consider adding more variation in framing or motion if the middle feels flat.': tr('autoUi.k_e13bc676b50e'),
}
const composeHealthRecommendations = computed(() =>
  safeArray(current.value?.finalCompose?.composeHealth?.recommendations)
    .map((item) => safeText(item))
    .filter(Boolean)
    .map((item) => composeHealthRecommendationLabelMap[item] || item),
)
const composeSummaryStats = computed(() => current.value?.finalCompose?.composeSummary || null)
const composeStageCountText = computed(() => {
  const stats = composeSummaryStats.value
  if (!stats?.stageCounts) return ''
  return tr('autoUi.k_264ddb5d7604', { p0: Number(stats.stageCounts.hook || 0), p1: Number(stats.stageCounts.body || 0), p2: Number(stats.stageCounts.close || 0) })
})
const composeAverageClipDurationText = computed(() => {
  const avg = Number(composeSummaryStats.value?.averageClipDurationSec || 0)
  if (!avg) return ''
  return tr('autoUi.k_aab248bb2e03', { p0: avg.toFixed(2) })
})
const pipelineErrorContext = computed(() => current.value?.pipelineStatus?.errorContext || null)
const configuredVideoProvider = computed(() => safeText(current.value?.pipelineStatus?.configuredProviderSummary?.video?.provider, '--'))
const configuredVideoModel = computed(() => safeText(current.value?.pipelineStatus?.configuredProviderSummary?.video?.model, '--'))
const activeImageProvider = computed(() => safeText(current.value?.pipelineStatus?.activeProviderSummary?.image?.provider, '--'))
const activeImageModel = computed(() => safeText(current.value?.pipelineStatus?.activeProviderSummary?.image?.model, '--'))
const workflowStep = computed(() => current.value?.workflowV2?.currentStep || 'reference_analysis')
const selectedVariantId = computed(() => current.value?.selectedScriptVariantId || scriptVariants.value.find((item) => item.selected)?.id || '')
const referenceSourcePath = computed(() => current.value?.referenceVideoPath || referenceVideoPath.value)
const productSanitizationStatus = computed(() => current.value?.productImageSanitizationStatus || 'idle')
const sanitizedProductRefs = computed(() => safeArray(current.value?.sanitizedProductReferenceImagePaths))
const originalProductRefs = computed(() => safeArray(current.value?.originalProductReferenceImagePaths))
const analysisBoardProductRefs = computed(() => {
  const snapshot = current.value?.boundProductSnapshot as any
  return Array.from(
    new Set([String(snapshot?.analysisBoardPath || '').trim(), String(snapshot?.canonicalSourcePath || '').trim()].filter(Boolean)),
  )
})
const hasDraftProductRefs = computed(() => Array.isArray(productRefsDraft.value) && productRefsDraft.value.length > 0)
const identityGridProductRefs = computed(() => {
  if (Array.isArray(productRefsDraft.value)) return productRefsDraft.value
  return effectiveProductRefs.value
})
const effectiveProductRefs = computed(() => {
  if (Array.isArray(productRefsDraft.value)) return productRefsDraft.value
  if (analysisBoardProductRefs.value.length) return analysisBoardProductRefs.value
  if (sanitizedProductRefs.value.length) return sanitizedProductRefs.value
  if (safeArray(productRefs.value).length) return safeArray(productRefs.value)
  return originalProductRefs.value
})
const visibleProductThumbs = computed(() =>
  (productRefPreviewMode.value === 'original' ? originalProductRefs.value : effectiveProductRefs.value).slice(0, 9),
)
const productSanitizationStatusLabel = computed(() => {
  if (hasDraftProductRefs.value && !current.value?.productImageSanitizationStatus) return tr('autoUi.k_143b1332cb1f')
  if (productSanitizationStatus.value === 'processing') return tr('autoUi.k_57c08c730a51')
  if (productSanitizationStatus.value === 'done') return tr('autoUi.k_2ff97308c65a')
  if (productSanitizationStatus.value === 'failed') return tr('autoUi.k_64ba75d9d600')
  return tr('autoUi.k_aef4104370ae')
})
const productSanitizationStatusClass = computed(() => {
  if (hasDraftProductRefs.value && !current.value?.productImageSanitizationStatus) return 'working'
  if (productSanitizationStatus.value === 'processing') return 'working'
  if (productSanitizationStatus.value === 'done') return 'success'
  if (productSanitizationStatus.value === 'failed') return 'danger'
  return ''
})
const boundProductLibraryItem = computed<ProductLibraryItem | null>(() => {
  const targetId = String(current.value?.productId || '').trim()
  if (!targetId) return null
  return products.value.find((item) => item.id === targetId) || null
})
const selectedProductLibraryItem = computed<ProductLibraryItem | null>(() => {
  const targetId = String(selectedProductId.value || '').trim()
  if (!targetId) return null
  return products.value.find((item) => item.id === targetId) || null
})
const filteredProducts = computed(() => {
  const query = String(productQuery.value || '').trim().toLowerCase()
  if (!query) return products.value
  return products.value.filter((item) => {
    const haystack = [item.name, item.type, item.id].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(query)
  })
})
const selectedProductPreview = computed(() =>
  previewImage(selectedProductLibraryItem.value?.coverImagePath || selectedProductLibraryItem.value?.images?.[0]?.filePath || ''),
)
const boundProductDisplayName = computed(() => {
  if (boundProductLibraryItem.value?.name) {
    return `${boundProductLibraryItem.value.name} · ${boundProductLibraryItem.value.id}`
  }
  if (current.value?.productId) {
    return tr('autoUi.k_9fccd6defd22', { p0: current.value.productId })
  }
  return tr('autoUi.k_ab8274a60c22')
})
const selectedProductDisplayName = computed(() => {
  if (selectedProductLibraryItem.value?.name) {
    return `${selectedProductLibraryItem.value.name} · ${selectedProductLibraryItem.value.id}`
  }
  if (selectedProductId.value) {
    return tr('autoUi.k_9fccd6defd22', { p0: selectedProductId.value })
  }
  return tr('autoUi.k_53e2db70167f')
})
const cloneProductBindingHint = computed(() => {
  if (hasDraftProductRefs.value && !current.value?.productImageSanitizationStatus) {
    return tr('autoUi.k_e63d8c73eb95')
  }
  if (productSanitizationStatus.value === 'processing') {
    return tr('autoUi.k_f6baf6358fe8')
  }
  if (productSanitizationStatus.value === 'failed') {
    return safeText(current.value?.productImageSanitizationError, tr('autoUi.k_a36330265a32'))
  }
  if (effectiveProductRefs.value.length) {
    return tr('autoUi.k_49014a7b907c')
  }
  return tr('autoUi.k_5767b8b4dc21')
})
const selectedProductBindingHint = computed(() => {
  const selectedId = String(selectedProductId.value || '').trim()
  const boundId = String(current.value?.productId || '').trim()
  if (!selectedId) return tr('autoUi.k_5767b8b4dc21')
  if (selectedId === boundId && boundId) return tr('autoUi.k_bd138daf17d4')
  return tr('autoUi.k_20fdc505f2be')
})
const cloneProductSnapshotLabel = computed(() =>
  productRefPreviewMode.value === 'original' ? tr('autoUi.k_5dcee54a4ce1') : tr('autoUi.k_4fc382794fd5'),
)
const cloneProductSnapshotHint = computed(() => {
  if (productRefPreviewMode.value === 'original') {
    return tr('autoUi.k_3cc0a5df1118')
  }
  return tr('autoUi.k_354f98fde2e0')
})
const activeProjectId = computed(() => resolveActiveProjectId(current.value?.id))
const isDraftingNewProject = computed(() => Boolean(referenceVideoPath.value.trim()) && !current.value?.id)
const hasSelectedProductBinding = computed(() => Boolean(String(selectedProductId.value || current.value?.productId || '').trim()))
const hasBoundModel = computed(() => Boolean(selectedModelId.value || current.value?.selectedModelIdentitySnapshot?.id))
const hasProjectIdentityGrid = computed(() => Boolean(String(current.value?.projectIdentityGridPath || '').trim()))
const hasUsableStoryboardProductRefs = computed(() => originalProductRefs.value.length > 0)
const hasUsableExtractedProductRefs = computed(() => sanitizedProductRefs.value.length > 0 || originalProductRefs.value.length > 0)
const canGenerateStoryboardFrames = computed(
  () =>
    Boolean(
      activeProjectId.value &&
        selectedVariantId.value &&
        hasUsableStoryboardProductRefs.value &&
        hasUsableExtractedProductRefs.value &&
        hasBoundModel.value &&
        hasProjectIdentityGrid.value,
    ),
)
const storyboardFrameBlockReason = computed(() => {
  if (!activeProjectId.value) return tr('autoUi.k_190f82ef0fe5')
  if (!selectedVariantId.value) return tr('autoUi.k_c447a40c6d1a')
  if (!hasUsableStoryboardProductRefs.value) return tr('autoUi.k_ad0bfd1c4686')
  if (!hasUsableExtractedProductRefs.value) {
    return safeText(current.value?.productImageSanitizationError, tr('autoUi.k_4c20ac1302eb'))
  }
  if (!hasBoundModel.value) return tr('autoUi.k_c8e1546a1f2e')
  if (!hasProjectIdentityGrid.value) return tr('autoUi.k_32f267a0db30')
  return ''
})
const failedShotOutputs = computed(() =>
  shotVideoOutputs.value.filter((item) => item.status === 'failed_retryable' || item.status === 'failed_terminal' || Boolean(item.error)),
)
const failedStoryboardFrames = computed(() => storyboardFrames.value.filter((item) => !item.imagePath && Boolean(item.error)))
const autoRetryableFailedStoryboardFrames = computed(() =>
  failedStoryboardFrames.value.filter((item) => Number(item.retryCount || 0) < 2),
)
const runModeLabel = computed(() => (current.value?.runMode === 'auto' ? tr('autoUi.k_3736f7e25eb4') : tr('autoUi.k_dca303282767')))
const autoFlowCurrentStageLabel = computed(() => {
  const stage = String(current.value?.autoFlowStatus?.currentStage || '').trim()
  if (stage === 'reference_analysis') return tr('autoUi.k_d224e7c027df')
  if (stage === 'script_generation') return tr('autoUi.k_6766ae37d5ac')
  if (stage === 'identity_grid') return tr('autoUi.k_54f65b6b0c67')
  if (stage === 'storyboard_design') return tr('autoUi.k_3a87e98554a1')
  if (stage === 'storyboard_videos') return tr('autoUi.k_4fe061c7ebff')
  if (stage === 'final_compose') return tr('autoUi.k_47badcfc4cad')
  return tr('autoUi.k_5349eb3e5762')
})
const autoFlowTargetLabel = computed(() => (current.value?.autoFlowStatus?.targetStage === 'final_compose' ? tr('autoUi.k_780ee868bcca') : tr('autoUi.k_4fe061c7ebff')))
const shotVideoOutputById = computed<Record<string, ShotVideoOutput>>(() =>
  Object.fromEntries(shotVideoOutputs.value.map((item) => [String(item.shotId || '').trim(), item])),
)
const gateBlockedShots = computed(() =>
  blueprintShots.value.filter((shot) => {
    const shotStatus = String(shot.status || '').toLowerCase()
    const qualityStatus = String(shot.qualityStatus || '').toLowerCase()
    const output = shotVideoOutputById.value[String(shot.id || '').trim()]
    const hasClip = Boolean(String(output?.videoPath || output?.localPath || shot.generatedClipPath || shot.uploadedAssetPath || '').trim())
    const hasUsableOutput = Boolean(output?.status === 'done' && hasClip)
    const canEnterRender =
      typeof shot.canEnterRender === 'boolean' && !(shot.canEnterRender === false && hasUsableOutput && qualityStatus !== 'failed')
        ? shot.canEnterRender
        : hasUsableOutput
    const hasRecoveredRenderableOutput = hasClip && canEnterRender && qualityStatus !== 'failed'
    const qualityReasons = Array.isArray(shot.qualityReasons) ? shot.qualityReasons.map((item) => String(item || '').trim()).filter(Boolean) : []
    const onlyDurationMismatch =
      qualityStatus === 'failed' &&
      qualityReasons.length > 0 &&
      qualityReasons.every((reason) => reason.includes('时长偏离目标')) &&
      hasClip
    if (hasRecoveredRenderableOutput || onlyDurationMismatch) return false
    return qualityStatus === 'failed'
      ? true
      : !canEnterRender
        ? true
        : shotStatus === 'failed' || Boolean(shot.error) || !hasClip
  }),
)
const gatePassAllowed = computed(() => Boolean(blueprintShots.value.length) && gateBlockedShots.value.length === 0)
const gateFailureSummary = computed(() => {
  const first = gateBlockedShots.value[0]
  if (!first) return tr('autoUi.k_e4af82ef053a')
  const reason = first.error || first.qualityReasons?.join('；') || tr('autoUi.k_ec3a7f693919')
  return tr('autoUi.k_1fcaf64e3385', { p0: gateBlockedShots.value.length, p1: Number(first.index ?? 0) + 1, p2: reason })
})
const generationQueueRuntime = computed(() => current.value?.generationQueue?.runtime || null)
const lastShotVideoSummary = computed(() => current.value?.generationQueue?.lastShotVideoSummary || null)
const lastShotVideoFailureBreakdown = computed(() => current.value?.generationQueue?.lastShotVideoFailureBreakdown || null)
const videoDispatchSummary = computed(() => {
  const runtime = generationQueueRuntime.value
  if (!runtime) return tr('autoUi.k_cedc39b86013')
  return tr('autoUi.k_8c424b0d9548', { p0: runtime.submitActive || 0, p1: runtime.submitQueued || 0, p2: runtime.pollActive || 0, p3: runtime.pollQueued || 0, p4: runtime.downloadActive || 0, p5: runtime.downloadQueued || 0 })
})
const videoFailureSummary = computed(() => {
  const breakdown = lastShotVideoFailureBreakdown.value
  if (!breakdown) return ''
  const parts: string[] = []
  if (Number(breakdown.remoteTimeout || 0) > 0) parts.push(tr('autoUi.k_7c9474742cbe', { p0: Number(breakdown.remoteTimeout || 0) }))
  if (Number(breakdown.downloadFailed || 0) > 0) parts.push(tr('autoUi.k_e020ec7e37a3', { p0: Number(breakdown.downloadFailed || 0) }))
  if (Number(breakdown.missingTask || 0) > 0) parts.push(tr('autoUi.k_7fb50c4c7d35', { p0: Number(breakdown.missingTask || 0) }))
  if (Number(breakdown.remoteFailed || 0) > 0) parts.push(tr('autoUi.k_8ec9d192d406', { p0: Number(breakdown.remoteFailed || 0) }))
  if (Number(breakdown.localFailed || 0) > 0) parts.push(tr('autoUi.k_aa621628d6f9', { p0: Number(breakdown.localFailed || 0) }))
  return parts.length ? tr('autoUi.k_f60106caf2a0', { p0: parts.join('，') }) : ''
})
const videoStageDescription = computed(() =>
  `${tr('cloneView.videoStage.description')} ${gatePassAllowed.value ? tr('autoUi.k_80333f7a00b2') : tr('autoUi.k_baab4b989c76')} ${videoDispatchSummary.value} ${videoFailureSummary.value} ${autoFlowHeartbeatSummary.value}`,
)
const videoRenderResolutionOptions = computed<Array<{ value: VideoRenderResolution; label: string; aspectRatio: VideoRenderAspectRatio }>>(() => [
  { value: '720x1280', label: '720x1280 (9:16, 720p)', aspectRatio: '9:16' },
  { value: '1080x1920', label: '1080x1920 (9:16, 1080p)', aspectRatio: '9:16' },
  { value: '1280x720', label: '1280x720 (16:9, 720p)', aspectRatio: '16:9' },
  { value: '1920x1080', label: '1920x1080 (16:9, 1080p)', aspectRatio: '16:9' },
])
const filteredVideoRenderResolutionOptions = computed(() =>
  videoRenderResolutionOptions.value.filter((item) => item.aspectRatio === videoRenderAspectRatio.value),
)

function syncVideoRenderHintsFromProject(project?: CloneProject | null) {
  const aspectRatio = project?.blueprint?.renderHints?.aspectRatio === '16:9' ? '16:9' : '9:16'
  const currentResolution = String(project?.blueprint?.renderHints?.resolution || '').trim()
  const allowedResolution =
    currentResolution === '720x1280' ||
    currentResolution === '1280x720' ||
    currentResolution === '1080x1920' ||
    currentResolution === '1920x1080'
      ? (currentResolution as VideoRenderResolution)
      : aspectRatio === '16:9'
        ? '1280x720'
        : '1080x1920'
  videoRenderAspectRatio.value = aspectRatio
  videoRenderResolution.value = allowedResolution
}
const autoFlowSummary = computed(() =>
  safeText(current.value?.autoFlowStatus?.lastSummary, current.value?.runMode === 'auto' ? tr('autoUi.k_f5d27fe35cd8') : tr('autoUi.k_201587ca1c9e')),
)
const autoFlowHeartbeatSummary = computed(() => {
  const autoFlow = current.value?.autoFlowStatus
  if (!autoFlow || String(autoFlow.currentStage || '') !== 'storyboard_videos' || autoFlow.status !== 'running') return ''
  const idleCount = Number(autoFlow.idleHeartbeatCount ?? 0)
  const lastProgressAt = Number(autoFlow.lastProgressAt ?? 0)
  const lastSummary = String(autoFlow.lastSummary || '')
  if (lastSummary.includes('已触发自动纠偏')) return tr('autoUi.k_027476505316')
  const parts: string[] = []
  if (idleCount > 0) parts.push(tr('autoUi.k_ddf6184c90e2', { p0: idleCount }))
  if (lastProgressAt > 0) {
    const deltaSec = Math.max(0, Math.floor((Date.now() - lastProgressAt) / 1000))
    parts.push(tr('autoUi.k_bf968d17ac74', { p0: deltaSec }))
  }
  return parts.length ? tr('autoUi.k_2d896055c8ec', { p0: parts.join('，') }) : ''
})
const autoFlowRunning = computed(() => current.value?.autoFlowStatus?.status === 'running')
const retryableShotOutputs = computed(() =>
  shotVideoOutputs.value.filter((item) => {
    const status = String(item.status || '').toLowerCase()
    return status === 'failed_retryable' || status === 'idle' || status === 'remote_pending' || status === 'remote_running' || status === 'remote_succeeded_pending_download' || status === 'downloading'
  }),
)
const generationFailureText = computed(
  () =>
    errorText.value ||
    failedShotOutputs.value[0]?.error ||
    current.value?.finalCompose?.error ||
    current.value?.previewPipeline?.lastError ||
    current.value?.lastError ||
    '',
)
const hasGenerationFailure = computed(() => Boolean(generationFailureText.value || failedShotOutputs.value.length))
const canRetryShotVideos = computed(() => Boolean(activeProjectId.value && retryableShotOutputs.value.length))
const completedShotCount = computed(() => shotVideoOutputs.value.filter((item) => hasReadyShotOutputVideo(item)).length)
const remotePendingShotStatuses = new Set([
  'idle',
  'submitting',
  'remote_pending',
  'remote_running',
  'remote_succeeded_pending_download',
  'downloading',
  'polling_timeout',
  'failed_retryable',
])
function isRemotePendingShot(item?: ShotVideoOutput | null) {
  if (!item) return false
  if (hasReadyShotOutputVideo(item)) return false
  const status = String(item.status || '').toLowerCase()
  if ((status === 'remote_succeeded_pending_download' || status === 'downloading') && Boolean(String(item.videoUrl || '').trim())) {
    return true
  }
  if (!effectiveShotTaskId(item.shotId)) return false
  return remotePendingShotStatuses.has(status)
}
const pendingShotCount = computed(
  () =>
    shotVideoOutputs.value.filter(
      (item) => !hasReadyShotOutputVideo(item) && !(item.status === 'failed_terminal' || Boolean(item.error)),
    ).length,
)
type ShotVideoRowTone = 'ok' | 'err' | 'run' | 'idle'
type ShotVideoRowView = { title: string; detail: string; tone: ShotVideoRowTone; summary: string; motion: string; index: number; continuity: string; continuityHint: string }

// How this shot joins its neighbours (main process: continuity.ts): one long take, or end frame = next start frame.
function shotContinuityLabel(shotId: string) {
  const shot = blueprintShotMap.value[shotId] as (BlueprintShot & { longTake?: { shotIds?: string[] }; continuityRelayToShotId?: string }) | undefined
  const takeIds = Array.isArray(shot?.longTake?.shotIds) ? shot!.longTake!.shotIds! : []
  if (takeIds.length > 1) {
    return {
      label: tr('cloneUi.video.longTake', { n: takeIds.indexOf(shotId) + 1, total: takeIds.length }),
      hint: tr('cloneUi.video.longTakeHint'),
    }
  }
  if (shot?.continuityRelayToShotId) return { label: tr('cloneUi.video.relay'), hint: tr('cloneUi.video.relayHint') }
  return { label: '', hint: '' }
}
// Everything a row of the shot video table shows, worked out once per project update instead of
// several times per row on every render.
const shotVideoRowViews = computed<Record<string, ShotVideoRowView>>(() => {
  const views: Record<string, ShotVideoRowView> = {}
  shotVideoOutputs.value.forEach((item, index) => {
    const state = describeShotSyncState(item)
    const tone: ShotVideoRowTone =
      state.tone === 'success' ? 'ok' : state.tone === 'danger' ? 'err' : state.tone === 'warning' ? 'run' : 'idle'
    views[item.shotId] = {
      title: state.title,
      detail: state.detail,
      tone,
      summary: shotScriptSummary(item.shotId),
      motion: shotReferenceLabel(storyBeatMap.value[item.shotId]),
      index,
      continuity: shotContinuityLabel(item.shotId).label,
      continuityHint: shotContinuityLabel(item.shotId).hint,
    }
  })
  return views
})
const shotVideoProgress = computed(() => {
  const total = shotVideoOutputs.value.length
  let done = 0
  let running = 0
  let failed = 0
  for (const item of shotVideoOutputs.value) {
    const tone = shotVideoRowViews.value[item.shotId]?.tone
    if (tone === 'ok') done += 1
    else if (tone === 'err') failed += 1
    else if (tone === 'run') running += 1
  }
  const waiting = Math.max(0, total - done - running - failed)
  return { total, done, running, failed, waiting, percent: total ? Math.round((done / total) * 100) : 0 }
})
const shotVideoProgressHint = computed(() => {
  const progress = shotVideoProgress.value
  if (progress.total && progress.done === progress.total) return tr('cloneUi.video.allDone')
  if (progress.running) return tr('cloneUi.video.runningHint')
  if (progress.failed) return tr('cloneUi.video.failedHint')
  return tr('cloneUi.video.idleHint')
})
const selectedShotView = computed(() => (selectedShotOutput.value ? shotVideoRowViews.value[selectedShotOutput.value.shotId] || null : null))
const autoVideoPendingCount = computed(() => {
  const summary = lastShotVideoSummary.value
  if (summary) {
    return Number(summary.pending || 0)
  }
  return shotVideoOutputs.value.filter((item) => isRemotePendingShot(item)).length
})
const processingShotCount = computed(
  () =>
    shotVideoOutputs.value.filter((item) => {
      const status = String(item.status || '').toLowerCase()
      return !hasReadyShotOutputVideo(item) && !item.error && (status.includes('running') || status.includes('processing') || status.includes('pending'))
    }).length,
)
const hasRemotePendingShotSync = computed(() => shotVideoOutputs.value.some((item) => isRemotePendingShot(item)))
const missingTaskIdShotCount = computed(() =>
  shotVideoOutputs.value.filter((item) => {
    if (hasReadyShotOutputVideo(item)) return false
    const status = String(item.status || '').toLowerCase()
    if (status === 'submitting' || status === 'remote_pending' || status === 'remote_running' || status === 'remote_succeeded_pending_download' || status === 'downloading') return false
    return !effectiveShotTaskId(item.shotId)
  }).length,
)
const continueQueryableShotCount = computed(() => filteredShotOutputs.value.filter((item) => canContinueSyncShot(item)).length)
const composeTotalDuration = computed(() =>
  shotVideoOutputs.value.reduce((total, item) => total + Number(item.durationSec || 0), 0),
)
const composeAiScore = computed(() => {
  const total = Math.max(shotVideoOutputs.value.length, 1)
  const success = completedShotCount.value / total
  const failurePenalty = failedShotOutputs.value.length / total
  return Math.max(62, Math.min(98, Math.round(78 + success * 18 - failurePenalty * 12)))
})
const composeQualityLabel = computed(() => {
  if (composeAiScore.value >= 92) return tr('autoUi.k_0ee20648be03')
  if (composeAiScore.value >= 84) return tr('autoUi.k_336628cd2566')
  if (composeAiScore.value >= 76) return tr('autoUi.k_582996bf3983')
  return tr('autoUi.k_36c5aa8cd8c3')
})
const composeScoreChecklist = computed(() => [
  { label: tr('autoUi.k_f8963baf3033'), value: composeAiScore.value >= 90 ? tr('autoUi.k_3e61f3679297') : composeAiScore.value >= 80 ? tr('autoUi.k_9d2c3d1616d2') : tr('autoUi.k_9ce7235cccfa') },
  { label: tr('autoUi.k_baf8fc779be0'), value: gatePassAllowed.value ? tr('autoUi.k_3e61f3679297') : tr('autoUi.k_15ccba3a57d1') },
  { label: tr('autoUi.k_12ba96716460'), value: hasFreshFinalCompose.value ? tr('autoUi.k_3e61f3679297') : tr('autoUi.k_942a589f6e38') },
])
const composeAspectClass = computed(() => {
  if (composeAspectRatio.value === '1:1') return 'is-square'
  if (composeAspectRatio.value === '16:9') return 'is-landscape'
  return 'is-portrait'
})
const composeEstimatedSize = computed(() => {
  const qualityFactorMap: Record<ComposeQuality, number> = {
    standard: 0.56,
    hd: 0.75,
    ultra: 1.08,
  }
  const aspectFactorMap: Record<ComposeAspectRatio, number> = {
    '9:16': 1,
    '1:1': 0.88,
    '16:9': 1.12,
  }
  const styleFactorMap: Record<ComposeStyle, number> = {
    default: 1,
    sharp: 1.04,
    cinematic: 1.12,
  }
  const size = composeTotalDuration.value * qualityFactorMap[composeQuality.value] * aspectFactorMap[composeAspectRatio.value] * styleFactorMap[composeStyle.value]
  return `${Math.max(8, Math.round(size))}MB`
})
const latestShotVideoUpdatedAt = computed(() =>
  shotVideoOutputs.value.reduce((max, item) => Math.max(max, Number(item.updatedAt || 0) || 0), 0),
)
const finalComposeUpdatedAt = computed(() => Number(current.value?.finalCompose?.updatedAt || 0) || 0)
const finalComposeCoverPath = computed(() => String(current.value?.finalCompose?.coverImagePath || '').trim())
const previewPipelineOutputPath = computed(() => String(current.value?.previewPipeline?.previewOutputPath || '').trim())
const previewPipelineReportPath = computed(() => String(current.value?.previewPipeline?.previewReportPath || '').trim())
const hasFreshFinalCompose = computed(() => {
  if (!finalOutputPath.value) return false
  return finalComposeUpdatedAt.value >= latestShotVideoUpdatedAt.value
})
const firstReadyShotOutput = computed<ShotVideoOutput | null>(
  () => shotVideoOutputs.value.find((item) => hasReadyShotOutputVideo(item)) || null,
)
const composePreviewPosterPath = computed(() => {
  if (finalComposeCoverPath.value) return finalComposeCoverPath.value
  const selectedFramePath = String(shotFrameMap.value[selectedShotOutput.value?.shotId || '']?.imagePath || '').trim()
  if (selectedFramePath) return selectedFramePath
  const firstReadyFramePath = String(shotFrameMap.value[firstReadyShotOutput.value?.shotId || '']?.imagePath || '').trim()
  if (firstReadyFramePath) return firstReadyFramePath
  return ''
})
const composePreviewPath = computed(() => {
  if (hasFreshFinalCompose.value && finalOutputPath.value) return finalOutputPath.value
  if (previewPipelineOutputPath.value) return previewPipelineOutputPath.value
  const selectedVideoPath = resolveShotOutputVideoPath(selectedShotOutput.value)
  if (selectedVideoPath) return selectedVideoPath
  const readyShotVideoPath = resolveShotOutputVideoPath(firstReadyShotOutput.value)
  if (readyShotVideoPath) return readyShotVideoPath
  return String(finalOutputPath.value || '').trim()
})
const composePreviewMediaVersion = computed(() => {
  if (hasFreshFinalCompose.value && finalOutputPath.value) return finalComposeUpdatedAt.value || Date.now()
  if (previewPipelineOutputPath.value) return Number(current.value?.previewPipeline?.updatedAt || current.value?.updatedAt || Date.now())
  return Number(selectedShotOutput.value?.updatedAt || firstReadyShotOutput.value?.updatedAt || Date.now())
})
const composePreviewMediaUrl = computed(() => mediaUrl(composePreviewPath.value, composePreviewMediaVersion.value))
const composePreviewPosterUrl = computed(() => previewImage(composePreviewPosterPath.value, finalComposeUpdatedAt.value || Date.now()))
const selectedShotVideoMediaUrl = computed(() =>
  mediaUrl(resolveShotOutputVideoPath(selectedShotOutput.value), Number(selectedShotOutput.value?.updatedAt || Date.now())),
)
const composePreviewLabel = computed(() => {
  if (hasFreshFinalCompose.value && finalOutputPath.value) return tr('autoUi.k_f0f714654722')
  if (previewPipelineOutputPath.value) return tr('autoUi.k_2a1336483535')
  if (finalOutputPath.value) return tr('autoUi.k_76917c58e1ee')
  if (hasReadyShotOutputVideo(selectedShotOutput.value)) return tr('autoUi.k_ec5d4fe89c92', { p0: safeText(shotLabel(selectedShotOutput.value?.shotId || ''), '当前镜头') })
  if (hasReadyShotOutputVideo(firstReadyShotOutput.value)) return tr('autoUi.k_ec5d4fe89c92', { p0: safeText(shotLabel(firstReadyShotOutput.value?.shotId || ''), '可用镜头') })
  return tr('autoUi.k_0ac754b27412')
})
const composePreviewHint = computed(() => {
  if (hasFreshFinalCompose.value && finalOutputPath.value) return tr('autoUi.k_ecbd831cbadd')
  if (previewPipelineOutputPath.value) return tr('autoUi.k_b4b04cf7ca9b')
  if (finalOutputPath.value) return tr('autoUi.k_c09224264123')
  if (hasReadyShotOutputVideo(selectedShotOutput.value)) return tr('autoUi.k_d58579f4bd5a')
  if (hasReadyShotOutputVideo(firstReadyShotOutput.value)) return tr('autoUi.k_541ffadc27e2')
  return tr('autoUi.k_f53112a0d4a1')
})
const composeExportStatusLabel = computed(() => {
  if (hasFreshFinalCompose.value) return tr('autoUi.k_19f0c32ce11b')
  if (finalOutputPath.value) return tr('autoUi.k_60f05c3dac9c')
  if (loading.value) return tr('autoUi.k_fcb979ef0b91')
  if (failedShotOutputs.value.length) return tr('autoUi.k_15ccba3a57d1')
  return tr('autoUi.k_2c843fe0b39d')
})
const composeExportTimeText = computed(() => {
  const totalSeconds = Math.max(20, Math.round(composeTotalDuration.value || 0))
  const qualityBaseMap: Record<ComposeQuality, number> = {
    standard: 0.9,
    hd: 1.2,
    ultra: 1.6,
  }
  const styleExtraMap: Record<ComposeStyle, number> = {
    default: 0,
    sharp: 0.2,
    cinematic: 0.45,
  }
  const minutes = Math.max(1, Math.round((totalSeconds / 30) * qualityBaseMap[composeQuality.value] + styleExtraMap[composeStyle.value]))
  return tr('autoUi.k_06ad4b20f387', { p0: minutes })
})
const composeDurationDisplay = computed(() => {
  const total = Number(composeTotalDuration.value || 0)
  if (!total) return '--'
  if (total < 60) return tr('autoUi.k_ad7dee82f450', { p0: Math.round(total) })
  const minutes = Math.floor(total / 60)
  const seconds = Math.round(total % 60)
  return tr('autoUi.k_b54206bf2a1c', { p0: minutes, p1: seconds })
})
const composeExportActionLabel = computed(() => (hasFreshFinalCompose.value && finalOutputPath.value ? tr('autoUi.k_2571de3c4132') : finalButtonLabel.value))
const hasGeneratedStoryboardFrames = computed(() => storyboardFrames.value.some((item) => Boolean(String(item.imagePath || '').trim())))
const canBootstrapAutoRun = computed(() => {
  if (!current.value?.id) return false
  if (current.value.runMode !== 'auto' && !autoRunIntentArmed.value) return false
  if (!autoRunRequestedAfterAnalyze.value && !autoRunIntentArmed.value) return false
  if (!referenceSourcePath.value) return false
  if (!effectiveProductRefs.value.length) return false
  if (!hasBoundModel.value) return false
  if (loading.value || autoFlowRunning.value) return false
  if (!scriptVariants.value.length) return false
  if (hasGeneratedStoryboardFrames.value) return false
  if (shotVideoOutputs.value.length) return false
  if (finalOutputPath.value) return false
  const autoStage = String(current.value?.autoFlowStatus?.currentStage || '').trim()
  if (autoStage && autoStage !== 'reference_analysis') return false
  return true
})
const autoBootstrapKey = computed(() => {
  if (!canBootstrapAutoRun.value) return ''
  const projectId = String(current.value?.id || '').trim()
  const modelId = String(selectedModelId.value || current.value?.selectedModelIdentitySnapshot?.id || '').trim()
  const refs = [...effectiveProductRefs.value].map((item) => String(item || '').trim()).filter(Boolean).sort().join('|')
  return [projectId, referenceSourcePath.value, modelId, refs].join('::')
})
const analyzeStageProgress = computed(() => {
  if (loading.value && workflowStep.value === 'reference_analysis') return 72
  if (storyBeats.value.length) return 100
  if (current.value?.blueprint) return 82
  if (referenceSourcePath.value) return 28
  return 0
})
const analyzeSummaryCards = computed(() => [
  {
    key: 'structure',
    title: tr('autoUi.k_c9a4640d399f'),
    desc: storyBeats.value.length ? tr('autoUi.k_da5c7643b3e8', { p0: storyBeats.value.length }) : tr('autoUi.k_d573d9481294'),
  },
  {
    key: 'style',
    title: tr('autoUi.k_97779e2726fc'),
    desc: safeText(current.value?.blueprint?.visualStyle || current.value?.blueprint?.renderHints?.resolution, tr('autoUi.k_ffa0f44b3a67')),
  },
  {
    key: 'hook',
    title: tr('autoUi.k_9044a92e7bea'),
    desc: safeText(current.value?.blueprint?.hookType || current.value?.blueprint?.rhythm, tr('autoUi.k_1f445e9fdc10')),
  },
])
const analyzeScriptPreview = computed(() => {
  const blueprintShotPreview = (current.value?.blueprint?.shots || [])
    .slice()
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    .map((shot) => String(shot.scriptText || shot.visualDescription || shot.actionDescription || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('\n')
  if (blueprintShotPreview) return blueprintShotPreview
  const globalScript = String(current.value?.blueprint?.globalScript?.content || '').trim()
  if (globalScript) return globalScript
  const beatScript = storyBeats.value
    .map((item) => String(item.voiceover || item.onScreenText || item.purpose || '').trim())
    .filter(Boolean)
    .slice(0, 4)
    .join('\n')
  return beatScript || tr('autoUi.k_ccca0a00408c')
})
const analyzeGlobalSections = computed(() => {
  const global = current.value?.blueprint?.globalScript
  if (!global) return []
  return [
    { key: 'cameraMotion', title: tr('autoUi.k_0118461d56e8'), desc: safeText(global.cameraMotion, '') },
    { key: 'shotScale', title: tr('autoUi.k_636d5b60dc0a'), desc: safeText(global.shotScale, '') },
    { key: 'lighting', title: tr('autoUi.k_e985d7b043d5'), desc: safeText(global.lighting, '') },
    { key: 'colorTone', title: tr('autoUi.k_aa3b2a6bf406'), desc: safeText(global.colorTone, '') },
    { key: 'subjectAction', title: tr('autoUi.k_81bbe719239f'), desc: safeText(global.subjectAction, '') },
    { key: 'environment', title: tr('autoUi.k_2a4e5414b520'), desc: safeText(global.environment, '') },
  ].filter((item) => item.desc)
})
const analyzeReversePrompt = computed(() => safeText(current.value?.blueprint?.globalScript?.reversePrompt, ''))
/** "01  0.0s-3.2s Close-up…" → { time: '0.0s-3.2s', text: 'Close-up…' } for the script list. */
function splitScriptLine(line: string) {
  const body = String(line || '').replace(/^\s*\d{1,3}\s+/, '').trim()
  const match = /^(\d+(?:\.\d+)?s\s*[-–~]\s*\d+(?:\.\d+)?s)\s*(.*)$/.exec(body)
  return match ? { time: match[1].replace(/\s+/g, ''), text: match[2] || body } : { time: '', text: body }
}

const analyzeScriptLines = computed(() => {
  const blueprintShotLines = (current.value?.blueprint?.shots || [])
    .slice()
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    .map((shot, index) => {
      const content = String(shot.scriptText || shot.generationPrompt || shot.visualDescription || '').trim()
      if (!content) return ''
      return `${String(index + 1).padStart(2, '0')}  ${content}`
    })
    .filter(Boolean)
  if (blueprintShotLines.length) return blueprintShotLines
  const globalScript = String(current.value?.blueprint?.globalScript?.content || '').trim()
  if (globalScript) {
    return globalScript
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
  }
  return storyBeats.value
    .map((item, index) => {
      const content = String(item.voiceover || item.onScreenText || item.scriptSegment || item.visualDescription || item.purpose || '').trim()
      if (!content) return ''
      return `${String(index + 1).padStart(2, '0')}  ${content}`
    })
    .filter(Boolean)
})
const productAnalysisSnapshot = computed(() => {
  const analysis =
    current.value?.boundProductSnapshot?.productAnalysis ||
    current.value?.baseBlueprint?.consistencyAssets?.productAnalysis ||
    current.value?.blueprint?.consistencyAssets?.productAnalysis
  if (!analysis) return null
  return {
    category: safeText(analysis.category, ''),
    summary: safeText(analysis.summary, ''),
    coreSubject: safeText(analysis.coreSubject, ''),
    connectionStructure: safeText(analysis.connectionStructure, ''),
    materialDetails: safeText(analysis.materialDetails, ''),
    wearingPosition: safeText(analysis.wearingPosition, ''),
    surfaceDetails: safeText(analysis.surfaceDetails, ''),
    colorDetails: safeText(analysis.colorDetails, ''),
    geometryDetails: safeText(analysis.geometryDetails, ''),
    sizeScale: safeText(analysis.sizeScale, ''),
    matchingRules: Array.isArray(analysis.matchingRules) ? analysis.matchingRules.map((item) => safeText(item, '')).filter(Boolean) : [],
  }
})
const productAnalysisSections = computed(() => {
  const analysis = productAnalysisSnapshot.value
  if (!analysis) return []
  return [
    { key: 'summary', title: tr('autoUi.k_54984046a18e'), desc: analysis.summary },
    { key: 'coreSubject', title: tr('autoUi.k_4958b1a96d65'), desc: analysis.coreSubject },
    { key: 'connectionStructure', title: tr('autoUi.k_2b1340f7dddc'), desc: analysis.connectionStructure },
    { key: 'materialDetails', title: tr('autoUi.k_d954ac6ba742'), desc: analysis.materialDetails },
    { key: 'wearingPosition', title: tr('autoUi.k_1113c2d96ce4'), desc: analysis.wearingPosition },
    { key: 'surfaceDetails', title: tr('autoUi.k_5d621e22d50d'), desc: analysis.surfaceDetails },
    { key: 'colorDetails', title: tr('autoUi.k_564b2da8f4cb'), desc: analysis.colorDetails },
    { key: 'geometryDetails', title: tr('autoUi.k_2f7852d6419c'), desc: analysis.geometryDetails },
    { key: 'sizeScale', title: tr('autoUi.k_a640c6c16bb5'), desc: analysis.sizeScale },
  ].filter((item) => item.desc)
})
const shotProgressPercent = computed(() => {
  const total = shotVideoOutputs.value.length
  if (!total) return 0
  return Math.round((completedShotCount.value / total) * 100)
})

const statusTone = computed(() => {
  if (errorText.value) return 'danger'
  if (finalOutputPath.value) return 'success'
  if (loading.value) return 'working'
  return 'idle'
})

const workflowStageKey = computed<StageItem['key']>(() => {
  if (workflowStep.value === 'reference_analysis') return 'analyze'
  if (workflowStep.value === 'script_generation') return 'variant'
  if (workflowStep.value === 'identity_grid') return 'identity-grid'
  if (workflowStep.value === 'storyboard_design') return 'grid'
  if (workflowStep.value === 'storyboard_videos') return 'video'
  if (workflowStep.value === 'final_compose') return 'compose'
  return 'analyze'
})
const visibleStageKey = computed<StageItem['key']>(() => (selectedStageKey.value || workflowStageKey.value) as StageItem['key'])
const stageItems = computed<StageItem[]>(() => {
  const hasBlueprint = Boolean(current.value?.blueprint)
  const hasVariants = scriptVariants.value.length > 0
  const hasSelectedVariant = Boolean(selectedVariantId.value)
  const hasIdentityGrid = hasProjectIdentityGrid.value
  const hasFrames = storyboardFrames.value.some((item) => item.imagePath)
  const hasVideos = shotVideoOutputs.value.some((item) => hasReadyShotOutputVideo(item))
  const hasFinal = Boolean(finalOutputPath.value)
  return [
    {
      key: 'analyze',
      title: tr('autoUi.k_d224e7c027df'),
      desc: hasBlueprint ? tr('autoUi.k_96b8424c5232') : tr('autoUi.k_f743536d6df3'),
      done: hasBlueprint,
      active: visibleStageKey.value === 'analyze',
    },
    {
      key: 'variant',
      title: tr('autoUi.k_6766ae37d5ac'),
      desc: hasVariants
        ? hasSelectedVariant
          ? tr('autoUi.k_20a7e875601d')
          : tr('autoUi.k_01a6255884d5', { p0: scriptVariants.value.length })
        : tr('autoUi.k_3866455ca578'),
      done: hasVariants && hasSelectedVariant,
      active: visibleStageKey.value === 'variant',
    },
    {
      key: 'identity-grid',
      title: tr('autoUi.k_54f65b6b0c67'),
      desc: hasIdentityGrid ? tr('autoUi.k_b94a67221100') : tr('autoUi.k_326c6105a5b3'),
      done: hasIdentityGrid,
      active: visibleStageKey.value === 'identity-grid',
    },
    {
      key: 'grid',
      title: tr('autoUi.k_3a87e98554a1'),
      desc: hasFrames ? tr('autoUi.k_58ca945c1f62') : tr('autoUi.k_509197ea2eba'),
      done: hasFrames,
      active: visibleStageKey.value === 'grid',
    },
    {
      key: 'video',
      title: tr('autoUi.k_4fe061c7ebff'),
      desc: hasVideos ? tr('autoUi.k_056ecad4b6ca') : tr('autoUi.k_972994f9d113'),
      done: hasVideos,
      active: visibleStageKey.value === 'video',
    },
    {
      key: 'compose',
      title: tr('autoUi.k_47badcfc4cad'),
      desc: hasFinal ? tr('autoUi.k_d259ac0b3bea') : tr('autoUi.k_2b0761c3d37e'),
      done: hasFinal,
      active: visibleStageKey.value === 'compose',
    },
  ]
})

const currentStageTitle = computed(() => stageItems.value.find((item) => item.active)?.title || stageItems.value.find((item) => !item.done)?.title || tr('autoUi.k_ef471c838309'))
const nextStageTitle = computed(() => stageItems.value.find((item) => !item.done)?.title || tr('autoUi.k_3b2b6e963eb3'))
const finalButtonLabel = computed(() => {
  if (loading.value && workflowStep.value === 'final_compose') return tr('autoUi.k_8f3d9b05c960')
  return shotVideoOutputs.value.length ? tr('autoUi.k_bcad6ee34bb4') : tr('autoUi.k_74a000b7ac6e')
})
const analyzePrimaryButtonLabel = computed(() => (referenceSourcePath.value ? tr('autoUi.k_a363213d1869') : tr('autoUi.k_f743536d6df3')))
const selectedVariantCandidate = computed(
  () => scriptVariants.value.find((item) => item.id === selectedVariantId.value) || scriptVariants.value.find((item) => item.selected) || scriptVariants.value[0] || null,
)
const failedShotActionText = computed(() => {
  if (regeneratingFailedShotVideos.value) return tr('autoUi.k_891f59779865', { p0: failedShotOutputs.value.length })
  return failedShotOutputs.value.length ? tr('autoUi.k_f16863b53694', { p0: failedShotOutputs.value.length }) : tr('autoUi.k_09b0c0e25169')
})
const failedStoryboardActionText = computed(() => {
  if (regeneratingFailedStoryboardFrames.value) return tr('autoUi.k_eb1e40090567', { p0: failedStoryboardFrames.value.length })
  return failedStoryboardFrames.value.length ? tr('autoUi.k_616a0f7ede80', { p0: failedStoryboardFrames.value.length }) : tr('autoUi.k_c888e7e154e8')
})
const selectedStoryboardActionText = computed(() => {
  const count = selectedStoryboardShotIds.value.length
  const regeneratingCount = selectedStoryboardShotIds.value.filter((shotId) =>
    regeneratingStoryboardShotIds.value.includes(shotId),
  ).length
  if (regeneratingCount) return tr('autoUi.k_332a68dd23a4', { p0: regeneratingCount })
  return count ? tr('autoUi.k_47645262d471', { p0: count }) : tr('autoUi.k_8e7bc9c65072')
})
const pendingStoryboardFrames = computed(() =>
  storyboardFrames.value.filter((item) => !item.imagePath && !item.error),
)
const pendingStoryboardActionText = computed(() => {
  if (queryingStoryboardFrames.value) return tr('autoUi.k_9827ba1c3829', { p0: pendingStoryboardFrames.value.length })
  return pendingStoryboardFrames.value.length ? tr('autoUi.k_ea68fc6bdc62', { p0: pendingStoryboardFrames.value.length }) : tr('autoUi.k_8f72ce7045e3')
})
const selectedShotFrame = computed<StoryboardFrame | null>(() =>
  selectedShotOutput.value ? shotFrameMap.value[selectedShotOutput.value.shotId] || null : null,
)
const selectedStoryboardRow = computed(
  () => storyboardDesignRows.value.find((item) => item.shotId === selectedShotId.value) || storyboardDesignRows.value[0] || null,
)
const selectedStoryboardBeat = computed<StoryBeat | null>(
  () => storyBeats.value.find((item) => item.id === selectedStoryboardRow.value?.shotId) || null,
)
const selectedStoryboardFrame = computed<StoryboardFrame | null>(
  () => (selectedStoryboardRow.value ? shotFrameMap.value[selectedStoryboardRow.value.shotId] || null : null),
)

watch(
  storyboardFrames,
  (frames) => {
    if (!regeneratingStoryboardShotIds.value.length) return
    const settledShotIds = new Set(
      frames
        .filter((frame) => {
          const status = safeText(frame.status, '').toLowerCase()
          return status === 'cropped' || status === 'failed'
        })
        .map((frame) => frame.shotId),
    )
    if (!settledShotIds.size) return
    regeneratingStoryboardShotIds.value = regeneratingStoryboardShotIds.value.filter((shotId) => !settledShotIds.has(shotId))
  },
  { deep: true },
)

watch(
  shotVideoOutputs,
  (items) => {
    if (!items.length) {
      selectedShotId.value = ''
      return
    }
    const exists = items.some((item) => item.shotId === selectedShotId.value)
    if (!exists) {
      selectedShotId.value = items.find((item) => hasReadyShotOutputVideo(item))?.shotId || items[0]?.shotId || ''
    }
  },
  { immediate: true },
)

watch(
  storyboardDesignRows,
  (items) => {
    if (!items.length) return
    if (!items.some((item) => item.shotId === selectedShotId.value)) {
      selectedShotId.value = items[0]?.shotId || ''
    }
  },
  { immediate: true },
)

watch(
  [selectedStageKey, workflowStageKey, visibleStageKey],
  ([selected, workflow, visible]) => {
    console.log('[clone-debug] stage-state', {
      selectedStageKey: selected || '',
      workflowStageKey: workflow,
      visibleStageKey: visible,
      workflowStep: workflowStep.value,
      currentId: current.value?.id || '',
      loading: loading.value,
    })
  },
  { immediate: true },
)

function mediaUrl(filePath?: string, version?: string | number) {
  const normalized = String(filePath || '').trim()
  if (!normalized) return ''
  const versionText = String(version ?? '').trim()
  return versionText
    ? `vg://file?path=${encodeURIComponent(normalized)}&v=${encodeURIComponent(versionText)}`
    : `vg://file?path=${encodeURIComponent(normalized)}`
}

function previewImage(path?: string, version?: string | number) {
  const normalized = String(path || '').trim()
  if (!normalized) return ''
  const versionText = String(version ?? '').trim()
  return versionText
    ? `vg://file?path=${encodeURIComponent(normalized)}&v=${encodeURIComponent(versionText)}`
    : mediaUrl(normalized)
}

function promptReferencePaths(paths?: string[]) {
  return (paths ?? []).map((item) => String(item || '').trim()).filter(Boolean)
}

function modelPreview(item?: { coverImagePath?: string; imagePaths?: string[] } | null) {
  return previewImage(item?.coverImagePath || item?.imagePaths?.[0] || '')
}

function shortPath(value: string) {
  const text = String(value || '').trim()
  if (!text) return '--'
  const parts = text.split(/[\\/]/).filter(Boolean)
  return parts.slice(-2).join('/')
}

function formatTime(ts: number) {
  if (!ts) return '--'
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(
    d.getHours(),
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDuration(value?: number) {
  const duration = Number(value || 0)
  if (!duration) return '--'
  if (duration < 60) return `${duration.toFixed(1)}s`
  const minutes = Math.floor(duration / 60)
  const seconds = Math.round(duration % 60)
  return `${minutes}m ${seconds}s`
}

function formatRelativeSeconds(ts?: number) {
  const value = Number(ts || 0)
  if (!value) return ''
  const deltaSec = Math.max(0, Math.floor((Date.now() - value) / 1000))
  if (deltaSec < 60) return tr('autoUi.k_186d77cad7f8', { p0: deltaSec })
  const minutes = Math.floor(deltaSec / 60)
  const seconds = deltaSec % 60
  return seconds ? tr('autoUi.k_096a68d68f6c', { p0: minutes, p1: seconds }) : tr('autoUi.k_c915422eaaf8', { p0: minutes })
}

function humanWorkflowStep(step: string) {
  switch (step) {
    case 'reference_analysis':
      return tr('autoUi.k_d224e7c027df')
    case 'script_generation':
      return tr('autoUi.k_19b125a3c592')
    case 'identity_grid':
      return tr('autoUi.k_54f65b6b0c67')
    case 'storyboard_design':
      return tr('autoUi.k_3a87e98554a1')
    case 'storyboard_videos':
      return tr('autoUi.k_4fe061c7ebff')
    case 'final_compose':
      return tr('autoUi.k_47badcfc4cad')
    default:
      return step || '--'
  }
}

function humanStatus(status?: string) {
  switch (status) {
    case 'idle':
      return tr('autoUi.k_5349eb3e5762')
    case 'running':
      return tr('autoUi.k_1f425b6bf0a4')
    case 'done':
      return tr('autoUi.k_e99b48a29bdf')
    case 'failed_terminal':
      return tr('autoUi.k_3e3c8068bb0e')
    case 'failed_retryable':
      return tr('autoUi.k_cbd2eed80315')
    case 'background_running':
      return tr('autoUi.k_fea652be3320')
    case 'preview_ready':
      return tr('autoUi.k_3d27c264c271')
    case 'cropped':
      return tr('autoUi.k_79c74f41ca9e')
    case 'remote_pending':
      return tr('autoUi.k_57c08c730a51')
    case 'submitting':
      return tr('autoUi.k_2e4171e1affa')
    case 'remote_running':
      return tr('autoUi.k_e13e1d9b03d2')
    case 'remote_succeeded_pending_download':
      return tr('autoUi.k_d8819ff6c2da')
    case 'polling_timeout':
      return tr('autoUi.k_01a763c21a01')
    case 'downloading':
      return tr('autoUi.k_327d59b5bd11')
    case 'ready':
      return tr('autoUi.k_f2afde8960a6')
    case 'composing':
      return tr('autoUi.k_459388d36a3f')
    case 'uploaded_replacement':
      return tr('autoUi.k_fae3a27e128a')
    default:
      return status || '--'
  }
}

function safeText(value: unknown, fallback: string) {
  const text = String(value ?? '').replace(/\uFFFD/g, '').trim()
  return text || fallback
}

function normalizeCloneProductType(value: unknown) {
  const text = String(value || '').trim().toLowerCase()
  // Keep in sync with src/main/modules/clone/productCategory.ts.
  // Whole-word matching only: colour words ("gold", "silver") or fragments
  // ("stud" in "studio") must never turn a product into earrings.
  if (text === 'earring') return 'earrings'
  if (
    text === 'earrings' || text === 'necklace' || text === 'ring' || text === 'bracelet' || text === 'phone_case' ||
    text === 'clothes' || text === 'bag' || text === 'shoes' || text === 'toy'
  ) return text
  if (/\b(?:earrings?|ear[\s-]?(?:studs?|cuffs?|jewelry|jewellery))\b/.test(text)) return 'earrings'
  if (/\b(?:necklaces?|pendants?|chokers?)\b/.test(text)) return 'necklace'
  if (/\b(?:bracelets?|bangles?)\b/.test(text)) return 'bracelet'
  if (/\brings?\b(?!\s+lights?)/.test(text)) return 'ring'
  if (/\b(?:phone\s*cases?|mobile cases?|iphone cases?)\b/.test(text)) return 'phone_case'
  if (/\b(?:dress(?:es)?|shirts?|t-shirts?|hoodies?|jackets?|pants|skirts?|garments?|clothes|clothing)\b/.test(text)) return 'clothes'
  if (/\b(?:handbags?|tote bags?|backpacks?|bags?)\b/.test(text)) return 'bag'
  if (/\b(?:shoes?|sneakers?|boots?|sandals?|heels)\b/.test(text)) return 'shoes'
  if (/\b(?:toys?|figurines?|dolls?|plush(?:ies)?)\b/.test(text)) return 'toy'
  return 'general'
}

function pushRuntimeLog(message: string, level: RuntimeLogItem['level'] = 'info') {
  const text = safeText(message, '')
  if (!text) return
  const last = runtimeLogs.value[0]
  if (last?.message === text && last.level === level) return
  runtimeLogs.value = [{ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, level, message: text, time: Date.now() }, ...runtimeLogs.value].slice(0, 200)
}

function openRuntimeDialog() {
  runtimeDialogOpen.value = true
}

function closeRuntimeDialog() {
  runtimeDialogOpen.value = false
}

function handleStoryboardErrorAction() {
  if (selectedStoryboardErrorAction.value === 'go-models' || selectedShotVideoErrorAction.value === 'go-models') {
    void router.push('/models')
    return
  }
  if (selectedStoryboardErrorAction.value === 'go-identity-grid' || selectedShotVideoErrorAction.value === 'go-identity-grid') {
    visibleStageKey.value = 'identity-grid'
  }
}

function extractFailureTag(errorText: string) {
  const matched = errorText.match(/^\[([a-z_]+)\]/i)
  return matched?.[1]?.toLowerCase() || ''
}

function effectiveShotTaskId(shotId?: string) {
  const id = String(shotId || '').trim()
  if (!id) return ''
  const outputTaskId = String(shotVideoOutputs.value.find((item) => item.shotId === id)?.taskId || '').trim()
  if (outputTaskId && !outputTaskId.toLowerCase().startsWith('gpt_frame_')) return outputTaskId
  const blueprintTaskId = String(blueprintShotMap.value[id]?.generatedTaskId || '').trim()
  if (blueprintTaskId.toLowerCase().startsWith('gpt_frame_')) return ''
  return blueprintTaskId
}

function describeShotSyncState(item?: ShotVideoOutput | null) {
  if (!item) return { title: '--', detail: '--', tone: 'idle' as 'idle' | 'success' | 'warning' | 'danger' }
  const shotTaskId = effectiveShotTaskId(item.shotId)
  const status = String(item.status || '').toLowerCase()
  const remoteStatus = String(item.remoteStatus || '').toLowerCase()
  const errorText = safeText(item.error, '')
  const hasVideo = hasReadyShotOutputVideo(item)
  const resolvedVideoUrl = resolveShotRemoteVideoUrl(item)
  const isActiveRemoteTask =
    status === 'submitting' ||
    status === 'remote_pending' ||
    status === 'remote_running' ||
    status === 'remote_succeeded_pending_download' ||
    status === 'downloading'
  const failureTag = extractFailureTag(errorText)

  if (status === 'submitting') {
    return {
      title: tr('autoUi.k_2e4171e1affa'),
      detail: shotTaskId ? tr('autoUi.k_7e49a7c09a59', { p0: shotTaskId }) : tr('autoUi.k_e7823e38b055'),
      tone: 'warning' as const,
    }
  }
  if (status === 'remote_pending' || status === 'remote_running') {
    return {
      title: tr('autoUi.k_e13e1d9b03d2'),
      detail: shotTaskId ? tr('autoUi.k_587e7ed345bb', { p0: shotTaskId }) : remoteStatus || tr('autoUi.k_59e4656c796e'),
      tone: 'warning' as const,
    }
  }
  if (status === 'remote_succeeded_pending_download' || (status === 'done' && !isActiveRemoteTask)) {
    return {
      title: status === 'done' && hasVideo ? tr('autoUi.k_e99b48a29bdf') : tr('autoUi.k_d8819ff6c2da'),
      detail:
        status === 'done' && hasVideo
          ? 'succeeded'
          : shotTaskId
            ? tr('autoUi.k_0f1fc958755b', { p0: shotTaskId })
            : tr('autoUi.k_2301a62b4b86'),
      tone: status === 'done' && hasVideo ? ('success' as const) : ('warning' as const),
    }
  }
  if (hasVideo && !isActiveRemoteTask) {
    return {
      title: tr('autoUi.k_e99b48a29bdf'),
      detail: 'succeeded',
      tone: 'success' as const,
    }
  }
  if (status === 'downloading') {
    const waitText = formatRelativeSeconds(item.updatedAt || item.lastPollAt)
    return {
      title: tr('autoUi.k_f0743b71d2a2'),
      detail: shotTaskId
        ? `${waitText ? tr('autoUi.k_23defe089283', { p0: waitText }) : ''}taskId=${shotTaskId}`
        : waitText
          ? tr('autoUi.k_4c51748c989d', { p0: waitText })
          : tr('autoUi.k_7624b9af025c'),
      tone: 'warning' as const,
    }
  }
  if (resolvedVideoUrl && remoteStatus === 'succeeded' && (status === 'failed_retryable' || status === 'failed_terminal' || errorText === 'succeeded')) {
    return {
      title: tr('autoUi.k_f0743b71d2a2'),
      detail: shotTaskId ? tr('autoUi.k_5995a41d68d7', { p0: shotTaskId }) : tr('autoUi.k_2e2672e6532a'),
      tone: 'warning' as const,
    }
  }
  if (errorText || status === 'failed_retryable' || status === 'failed_terminal') {
    if (failureTag === 'retry_limit') {
      return {
        title: tr('autoUi.k_91b396071dc6'),
        detail: tr('autoUi.k_5dc5e08fdd77'),
        tone: 'danger' as const,
      }
    }
    if (failureTag === 'missing_task') {
      return {
        title: tr('autoUi.k_50dca2f1dd40'),
        detail: tr('autoUi.k_875f93981c83'),
        tone: 'danger' as const,
      }
    }
    if (failureTag === 'remote_timeout') {
      return {
        title: tr('autoUi.k_981ab43e70c0'),
        detail: shotTaskId ? tr('autoUi.k_587e7ed345bb', { p0: shotTaskId }) : tr('autoUi.k_0a51ed7857af'),
        tone: 'warning' as const,
      }
    }
    if (failureTag === 'download_failed') {
      return {
        title: tr('autoUi.k_8c44c3a90ad0'),
        detail: shotTaskId ? tr('autoUi.k_8e227973c1e7', { p0: shotTaskId }) : tr('autoUi.k_41a6838bb73a'),
        tone: 'danger' as const,
      }
    }
    if (failureTag === 'remote_failed') {
      return {
        title: tr('autoUi.k_f707d4fab78e'),
        detail: shotTaskId ? `taskId=${shotTaskId}` : tr('autoUi.k_9328a9c2b8e0'),
        tone: 'danger' as const,
      }
    }
    if (failureTag === 'local_failed') {
      return {
        title: tr('autoUi.k_1c5c2e4b4892'),
        detail: errorText.replace(/^\[[a-z_]+\]\s*/i, '') || tr('autoUi.k_02c5be5b1f6d'),
        tone: 'danger' as const,
      }
    }
    return {
      title: shotTaskId ? tr('autoUi.k_6c9bf5912809') : tr('autoUi.k_b0a06a532b0f'),
      detail: errorText || remoteStatus || (shotTaskId ? 'task failed' : tr('autoUi.k_d2c4105f29f6')),
      tone: 'danger' as const,
    }
  }
  if (status === 'remote_pending' || status === 'remote_running' || remoteStatus === 'processing' || remoteStatus === 'running') {
    return {
      title: status === 'remote_pending' ? tr('autoUi.k_92c4d69c411e') : tr('autoUi.k_e13e1d9b03d2'),
      detail: shotTaskId ? `taskId=${shotTaskId}` : tr('autoUi.k_5e790f0645e5'),
      tone: 'warning' as const,
    }
  }
  if (status === 'failed_retryable') {
    return {
      title: shotTaskId ? tr('autoUi.k_abc5c3e95c85') : tr('autoUi.k_dc61f4f0fcef'),
      detail: shotTaskId ? `taskId=${shotTaskId}` : tr('autoUi.k_91b5d84ab92e'),
      tone: shotTaskId ? ('warning' as const) : ('danger' as const),
    }
  }
  if (status === 'submitting') {
    return {
      title: tr('autoUi.k_2e4171e1affa'),
      detail: shotTaskId ? `taskId=${shotTaskId}` : tr('autoUi.k_01cd8b497828'),
      tone: 'warning' as const,
    }
  }
  if (status === 'pending' || status === 'idle') {
    return {
      title: shotTaskId ? tr('autoUi.k_01a763c21a01') : tr('autoUi.k_dc61f4f0fcef'),
      detail: shotTaskId ? `taskId=${shotTaskId}` : tr('autoUi.k_91b5d84ab92e'),
      tone: shotTaskId ? ('warning' as const) : ('danger' as const),
    }
  }
  return {
    title: humanStatus(item.status),
    detail: remoteStatus || shotTaskId || tr('autoUi.k_f9ddfd643456'),
    tone: 'idle' as const,
  }
}

function hasShotRetryLimitStopped(item?: ShotVideoOutput | null) {
  if (!item) return false
  const errorText = safeText(item.error, '')
  if (extractFailureTag(errorText) === 'retry_limit') return true
  const retryCount = typeof item.retryCount === 'number' ? item.retryCount : 0
  const status = String(item.status || '').toLowerCase()
  return retryCount >= 2 && status === 'failed_terminal' && errorText.includes('已停止继续查询和处理')
}

function shotRetryStatusText(item?: ShotVideoOutput | null) {
  if (!item || typeof item.retryCount !== 'number') return ''
  const currentRetryCount = Math.max(0, Math.min(item.retryCount, 2))
  if (hasShotRetryLimitStopped(item)) {
    return tr('autoUi.k_585767963b43', { p0: currentRetryCount })
  }
  return tr('autoUi.k_0c11c453e1b6', { p0: item.retryCount })
}

function setStageLog(message: string, level: RuntimeLogItem['level'] = 'info') {
  stageLog.value = message
  pushRuntimeLog(message, level)
}

async function copyPromptText(text: string, successMessage: string) {
  const value = String(text || '').trim()
  if (!value) return
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      shotPromptCopyMessage.value = successMessage
      return
    }
  } catch {}
  const ok = window.prompt(tr('autoUi.k_5120a5920064'), value)
  if (ok !== null) {
    shotPromptCopyMessage.value = successMessage
  }
}

async function loadIdentityGridPromptPreview(force = false, openModal = false) {
  if (!current.value?.id) return
  if (!force && identityGridPromptPreview.value) {
    if (openModal) identityGridPromptPreviewOpen.value = true
    return
  }
  identityGridPromptPreviewLoading.value = true
  identityGridPromptPreviewError.value = ''
  try {
    const plainProductRefs = [...identityGridProductRefs.value].map((item) => String(item || '').trim()).filter(Boolean)
    const result = await window.api.clone.getProjectIdentityGridPromptPreview({
      cloneProjectId: String(current.value.id || '').trim(),
      productType: normalizeCloneProductType(current.value?.blueprint?.productCategory || current.value?.blueprint?.category || current.value?.title || 'general'),
      productReferenceImagePaths: plainProductRefs,
    })
    identityGridPromptPreview.value = (result as IdentityGridPromptPreview) || null
    if (openModal) identityGridPromptPreviewOpen.value = true
  } catch (error: any) {
    identityGridPromptPreview.value = null
    identityGridPromptPreviewError.value = safeText(error?.message ?? error, tr('autoUi.k_414871055dc1'))
    if (openModal) identityGridPromptPreviewOpen.value = true
  } finally {
    identityGridPromptPreviewLoading.value = false
  }
}

async function generateProjectIdentityGrid() {
  const projectId = String(current.value?.id || '').trim()
  if (!projectId) {
    const message = tr('autoUi.k_190f82ef0fe5')
    markError(message, message)
    setStageLog(message, 'error')
    return
  }
  if (!identityGridProductRefs.value.length) {
    const message = tr('autoUi.k_ad0bfd1c4686')
    markError(message, message)
    setStageLog(message, 'error')
    return
  }
  if (!hasBoundModel.value) {
    const message = tr('autoUi.k_c8e1546a1f2e')
    markError(message, message)
    setStageLog(message, 'error')
    return
  }

  loading.value = true
  errorText.value = ''
  setStageLog(tr('autoUi.k_bcb32bb42d36'))

  try {
    const result = (await window.api.clone.generateModelIdentityPack({
      cloneProjectId: projectId,
      productType: normalizeCloneProductType(current.value?.blueprint?.productCategory || current.value?.blueprint?.category || current.value?.title || 'general'),
      productReferenceImagePaths: [...identityGridProductRefs.value].map((item) => String(item || '').trim()).filter(Boolean),
    })) as CloneProject
    applyProject((result || current.value) as CloneProject)
    await loadIdentityGridPromptPreview(true, false)
    setStageLog(tr('autoUi.k_37e73b7c6dbd'), 'success')
  } catch (error: any) {
    const message = safeText(error?.message ?? error, tr('autoUi.k_5ca86d35dfb0'))
    markError(message, message)
    setStageLog(message, 'error')
  } finally {
    loading.value = false
  }
}

async function copyAllShotPrompts() {
  if (!shotImagePromptPreview.value) return
  const parts = [`Image Request JSON:\n${safeText(shotImagePromptPreview.value.requestJsonStart, '--')}`]
  await copyPromptText(parts.join('\n\n'), tr('autoUi.k_1ed7cccea774'))
}

function promptParamRowsFromJson(raw?: string) {
  const text = safeText(raw, '').trim()
  if (!text) return [] as PromptParamRow[]
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    return Object.entries(parsed).map(([key, value]) => ({
      key,
      value:
        typeof value === 'string'
          ? value
          : Array.isArray(value) || (value && typeof value === 'object')
            ? JSON.stringify(value, null, 2)
            : String(value ?? ''),
    }))
  } catch {
    return [{ key: 'raw', value: text }]
  }
}

function promptJsonUrls(raw?: string) {
  const text = safeText(raw, '').trim()
  if (!text) return [] as string[]
  try {
    const parsed = JSON.parse(text) as {
      urls?: unknown
      images?: unknown
      image?: unknown
      last_image?: unknown
      image_url?: unknown
      last_image_url?: unknown
      content?: Array<{ type?: unknown; image_url?: { url?: unknown } | unknown }>
    }
    const values: string[] = []
    const pushValue = (value: unknown) => {
      const normalized = String(value || '').trim()
      if (!normalized) return
      if (values.includes(normalized)) return
      values.push(normalized)
    }
    const pushList = (value: unknown) => {
      if (!Array.isArray(value)) return
      value.forEach((item) => pushValue(item))
    }
    pushList(parsed?.urls)
    pushList(parsed?.images)
    pushValue(parsed?.image)
    pushValue(parsed?.last_image)
    pushValue(parsed?.image_url)
    pushValue(parsed?.last_image_url)
    if (Array.isArray(parsed?.content)) {
      parsed.content.forEach((item) => {
        if (String(item?.type || '').trim() !== 'image_url') return
        const imageUrlValue =
          item?.image_url && typeof item.image_url === 'object' ? (item.image_url as { url?: unknown }).url : item?.image_url
        pushValue(imageUrlValue)
      })
    }
    return values
  } catch {
    return []
  }
}

function detectBlock(promptText: string, marker: string) {
  return String(promptText || '').includes(marker)
}

function isUploadOnSubmitPlaceholder(value?: string) {
  return String(value || '').trim().startsWith('UPLOAD_ON_SUBMIT::')
}

const UPLOAD_ON_SUBMIT_PATTERN = /UPLOAD_ON_SUBMIT::([^\s"',\]}]+)/g

// The video request preview uses `UPLOAD_ON_SUBMIT::<file name>` for frames that are only
// uploaded on submit. Map those back to the local frame files so the preview shows and copies
// something usable instead of the raw token.
function shotVideoLocalFramePaths(preview?: ShotVideoPromptPreview | null) {
  return [preview?.localFirstFramePath, preview?.localLastFramePath].map((item) => String(item || '').trim()).filter(Boolean)
}

// Works on the JSON text, so the substituted path is JSON-escaped (Windows backslashes).
function shotVideoPayloadText(preview?: ShotVideoPromptPreview | null) {
  const raw = safeText(preview?.requestPayloadPreview || preview?.requestJson, '')
  const localPaths = shotVideoLocalFramePaths(preview)
  return raw.replace(UPLOAD_ON_SUBMIT_PATTERN, (token, name: string) => {
    const match = localPaths.find((item) => item.split(/[\\/]/).pop() === name)
    return match ? JSON.stringify(match).slice(1, -1) : token
  })
}

function resolveShotVideoReferencePaths(preview?: ShotVideoPromptPreview | null) {
  const rawValues = promptJsonUrls(preview?.requestPayloadPreview || preview?.requestJson)
  const values: string[] = []
  const pushValue = (value?: string) => {
    const normalized = String(value || '').trim()
    if (!normalized) return
    if (isUploadOnSubmitPlaceholder(normalized)) return
    if (values.includes(normalized)) return
    values.push(normalized)
  }
  rawValues.forEach((item) => pushValue(item))
  pushValue(preview?.localFirstFramePath)
  pushValue(preview?.localLastFramePath)
  return values
}

async function downloadMediaFile(path: string) {
  const sourcePath = String(path || '').trim()
  if (!sourcePath) return
  try {
    const result = await window.api.saveFileAs({
      sourcePath,
      defaultFileName: sourcePath.split(/[\\/]/).pop() || 'download',
      title: tr('autoUi.k_3ad9ac92d390'),
    })
    if (!result?.ok || result?.canceled) return
    setStageLog(tr('autoUi.k_6a08605c3c79', { p0: shortPath(result.filePath || '') }), 'success')
  } catch (error: any) {
    const message = safeText(error?.message ?? error, tr('autoUi.k_40525a732872'))
    markError(message, message)
    setStageLog(message, 'error')
    window.alert(message)
  }
}

async function copyAllShotVideoPrompts() {
  if (!shotVideoPromptPreview.value) return
  const parts = [`Video Request Payload:\n${shotVideoPayloadText(shotVideoPromptPreview.value) || '--'}`]
  await copyPromptText(parts.join('\n\n'), tr('autoUi.k_3fb911525325'))
}

function resetShotImagePromptPreviewState(clearLoadedShotId = false) {
  shotImagePromptPreview.value = null
  shotImagePromptPreviewError.value = ''
  if (clearLoadedShotId) shotImagePromptPreviewLoadedShotId.value = ''
}

function resetShotVideoPromptPreviewState(clearLoadedShotId = false) {
  shotVideoPromptPreview.value = null
  shotVideoPromptPreviewError.value = ''
  if (clearLoadedShotId) shotVideoPromptPreviewLoadedShotId.value = ''
}

async function loadShotImagePromptPreview(shotId?: string, force = false, openModal = false) {
  const projectId = String(current.value?.id || '').trim()
  const nextShotId = String(shotId || '').trim()
  if (!projectId || !nextShotId) {
    resetShotImagePromptPreviewState(true)
    return
  }
  if (!force && shotImagePromptPreviewLoadedShotId.value === nextShotId && shotImagePromptPreview.value) return
  shotImagePromptPreviewLoading.value = true
  shotImagePromptPreviewError.value = ''
  try {
    const result = (await window.api.clone.getShotImagePromptPreview({
      cloneProjectId: projectId,
      shotId: nextShotId,
      selectedModelIdentityId: selectedModelId.value || current.value?.selectedModelIdentitySnapshot?.id,
    })) as ShotImagePromptPreview
    shotImagePromptPreview.value = result || null
    shotImagePromptPreviewLoadedShotId.value = nextShotId
    if (openModal) shotPromptPreviewOpen.value = true
  } catch (error: any) {
    resetShotImagePromptPreviewState(true)
    shotImagePromptPreviewError.value = safeText(error?.message ?? error, tr('autoUi.k_91fe0c0e014c'))
    if (openModal) shotPromptPreviewOpen.value = true
  } finally {
    shotImagePromptPreviewLoading.value = false
  }
}

async function loadShotVideoPromptPreview(shotId?: string, force = false, openModal = false) {
  const projectId = String(current.value?.id || '').trim()
  const nextShotId = String(shotId || '').trim()
  if (!projectId || !nextShotId) {
    resetShotVideoPromptPreviewState(true)
    return
  }
  if (!force && shotVideoPromptPreviewLoadedShotId.value === nextShotId && shotVideoPromptPreview.value) return
  shotVideoPromptPreviewLoading.value = true
  shotVideoPromptPreviewError.value = ''
  try {
    const result = (await window.api.clone.getShotVideoPromptPreview({
      cloneProjectId: projectId,
      shotId: nextShotId,
    })) as ShotVideoPromptPreview
    shotVideoPromptPreview.value = result || null
    shotVideoPromptPreviewLoadedShotId.value = nextShotId
    if (openModal) shotVideoPromptPreviewOpen.value = true
  } catch (error: any) {
    resetShotVideoPromptPreviewState(true)
    shotVideoPromptPreviewError.value = safeText(error?.message ?? error, tr('autoUi.k_749e3bb62514'))
    if (openModal) shotVideoPromptPreviewOpen.value = true
  } finally {
    shotVideoPromptPreviewLoading.value = false
  }
}

const highlightedStartProductDescription = computed(() => safeText(shotImagePromptPreview.value?.productDescriptionBlock, ''))
const highlightedEndProductDescription = computed(() => safeText(shotImagePromptPreview.value?.productDescriptionBlock, ''))
const highlightedSceneAtmosphere = computed(() => safeText(shotImagePromptPreview.value?.sceneAtmosphereBlock, ''))
const shotImageReferenceMode = computed<'product_closeup' | 'model_presentation'>(() => {
  const preview = shotImagePromptPreview.value
  if (preview?.storyboardReferenceMode === 'product_closeup' || preview?.storyboardReferenceMode === 'model_presentation') {
    return preview.storyboardReferenceMode
  }
  return detectBlock(
    preview?.referenceResponsibilityBlock,
    'Do not infer or recreate a specific person identity',
  )
    ? 'product_closeup'
    : 'model_presentation'
})
const shotImageReferenceLockSummary = computed(() => {
  const preview = shotImagePromptPreview.value
  if (!preview?.referenceModeLocked) return ''
  if (preview.referenceModeLockReason === 'manual') {
    return tr('autoUi.k_b52d117b2925')
  }
  return tr('autoUi.k_15d1e137c315')
})
const shotImageReferenceReasonSummary = computed(() => {
  const preview = shotImagePromptPreview.value
  if (!preview) return ''
  if (shotImageReferenceMode.value === 'product_closeup' && preview.storyboardSubjectType === 'hand_only_product') {
    return tr('autoUi.k_071f23ff6388')
  }
  if (shotImageReferenceMode.value === 'model_presentation' && preview.storyboardReferenceConfidence === 'low') {
    return tr('autoUi.k_0c63b580c7ae')
  }
  const reasons = Array.isArray(preview.storyboardReferenceReason) ? preview.storyboardReferenceReason.filter(Boolean) : []
  return reasons.join('；')
})
const shotImageDisplayRefs = computed(() => {
  const preview = shotImagePromptPreview.value
  if (!preview) return [] as Array<{ label: string; path: string }>
  const refs: Array<{ label: string; path: string }> = []
  const requestUrlPaths = promptJsonUrls(preview.requestJsonStart)
  const referenceMode = shotImageReferenceMode.value
  const primaryProductPath = String(preview.productReferenceImagePaths?.[0] || '').trim()
  const identityGridPath = String(preview.identityGridReferenceImagePath || '').trim() || String(preview.modelReferenceImagePaths?.[0] || '').trim()
  const scenePath = String(preview.sceneReferenceImagePath || '').trim()
  if (referenceMode === 'product_closeup') {
    if (primaryProductPath) refs.push({ label: tr('autoUi.k_6a54e4d57fb7'), path: primaryProductPath })
    if (scenePath) refs.push({ label: tr('autoUi.k_60c1dec32afc'), path: scenePath })
    if (!refs.length) {
      if (requestUrlPaths[0]) refs.push({ label: tr('autoUi.k_2d235592bfbb'), path: requestUrlPaths[0] })
      if (requestUrlPaths[1]) refs.push({ label: tr('autoUi.k_953ee99a8643'), path: requestUrlPaths[1] })
    }
    return refs
  }
  if (identityGridPath) refs.push({ label: tr('autoUi.k_54f65b6b0c67'), path: identityGridPath })
  if (scenePath) refs.push({ label: tr('autoUi.k_60c1dec32afc'), path: scenePath })
  if (!refs.length) {
    if (requestUrlPaths[0]) refs.push({ label: tr('autoUi.k_2d235592bfbb'), path: requestUrlPaths[0] })
    if (requestUrlPaths[1]) refs.push({ label: tr('autoUi.k_953ee99a8643'), path: requestUrlPaths[1] })
  }
  console.log('[clone-debug] renderer-shot-image-display-refs', {
    shotId: preview.shotId,
    referenceMode,
    productReferenceImagePaths: preview.productReferenceImagePaths ?? [],
    modelReferenceImagePaths: preview.modelReferenceImagePaths ?? [],
    sceneReferenceImagePath: preview.sceneReferenceImagePath || '',
    identityGridReferenceImagePath: preview.identityGridReferenceImagePath || '',
    requestUrlPaths,
    refs,
  })
  return refs
})
const safeShotImageDisplayRefs = computed(() => Array.isArray(shotImageDisplayRefs.value) ? shotImageDisplayRefs.value : [])
const shotImageRequestParamRows = computed(() => promptParamRowsFromJson(shotImagePromptPreview.value?.requestJsonStart))
const shotVideoRequestParamRows = computed(() => {
  const preview = shotVideoPromptPreview.value
  const raw = safeText(preview?.requestPayloadPreview || preview?.requestJson, '')
  const localPaths = shotVideoLocalFramePaths(preview)
  const placeholderKeys = new Set(
    promptParamRowsFromJson(raw)
      .filter((row) => row.value.includes('UPLOAD_ON_SUBMIT::'))
      .map((row) => row.key),
  )
  return promptParamRowsFromJson(shotVideoPayloadText(preview)).map((row) => {
    if (!placeholderKeys.has(row.key)) return row
    const uploadPaths = localPaths.filter((item) => row.value.includes(item) || row.value.includes(JSON.stringify(item).slice(1, -1)))
    return uploadPaths.length ? { ...row, uploadPaths } : row
  })
})
const identityGridRequestParamRows = computed(() =>
  promptParamRowsFromJson(identityGridPromptPreview.value?.requestJson || current.value?.projectIdentityGridPromptPreview?.requestJson),
)
const identityGridRequestParamRowsCompact = computed(() =>
  identityGridRequestParamRows.value.filter((row) => row.key !== 'prompt' && row.key !== 'negativePrompt' && row.key !== 'urls' && row.key !== 'content'),
)
const identityGridRequestParamRowsExpanded = computed(() =>
  identityGridRequestParamRows.value.filter((row) => row.key === 'negativePrompt' || row.key === 'urls' || row.key === 'content'),
)
const identityGridPromptSource = computed(
  () => identityGridPromptPreview.value || current.value?.projectIdentityGridPromptPreview || null,
)
const identityGridReferencePaths = computed(() => {
  const values: string[] = []
  for (const item of identityGridPromptSource.value?.productReferenceImagePaths || []) {
    const normalized = String(item || '').trim()
    if (!normalized || values.includes(normalized)) continue
    values.push(normalized)
  }
  return values
})
const identityGridModelReferencePaths = computed(() => {
  const values: string[] = []
  for (const item of identityGridPromptSource.value?.modelReferenceImagePaths || []) {
    const normalized = String(item || '').trim()
    if (!normalized || values.includes(normalized)) continue
    values.push(normalized)
  }
  return values
})
const identityGridResolvedProductType = computed(() => {
  const candidates = [
    identityGridPromptSource.value?.productType,
    current.value?.boundProductSnapshot?.productAnalysis?.category,
    current.value?.boundProductSnapshot?.type,
    current.value?.blueprint?.productCategory,
    current.value?.blueprint?.category,
    current.value?.title,
  ]
  for (const item of candidates) {
    const normalized = normalizeCloneProductType(item)
    if (normalized !== 'general') return normalized
  }
  return normalizeCloneProductType(identityGridPromptSource.value?.productType || 'general')
})
const identityGridPreviewStats = computed<PromptPreviewStat[]>(() => [
  {
    label: tr('autoUi.k_8c0e804b9002'),
    value: safeText(identityGridResolvedProductType.value, '--'),
  },
  {
    label: tr('autoUi.k_efb5568d1e87'),
    value: String(Number(identityGridPromptSource.value?.productReferenceImageCount || identityGridReferencePaths.value.length || 0)),
  },
  {
    label: tr('autoUi.k_72167c6e8717'),
    value: String(Number(identityGridPromptSource.value?.modelReferenceImageCount || identityGridModelReferencePaths.value.length || 0)),
  },
  {
    label: tr('autoUi.k_4eec0f4d40fe'),
    value: safeText(identityGridPromptSource.value?.requestModel || identityGridPromptSource.value?.requestProvider, '--'),
  },
])
const shotVideoReferencePaths = computed(() => resolveShotVideoReferencePaths(shotVideoPromptPreview.value))
const promptDiagnosticSummary = computed(() => {
  const startPrompt = safeText(shotImagePromptPreview.value?.startPrompt, '')
  const preview = shotImagePromptPreview.value
  const startStats = {
    length: startPrompt.length,
    hasCompiledLock: Boolean(preview?.hasCompiledProductLock) || detectBlock(startPrompt, 'STRICT PRODUCT IDENTITY LOCK FOR THIS FRAME'),
    hasProductDescription: Boolean(preview?.hasProductDescriptionBlock) || detectBlock(startPrompt, 'TEXT PRODUCT DESCRIPTION LOCK'),
    hasDirectProductReuse: Boolean(preview?.hasDirectProductReuseLock) || detectBlock(startPrompt, 'PRODUCT VISUAL ANCHOR LOCK'),
    hasSceneAtmosphere: Boolean(preview?.hasSceneAtmosphereBlock) || detectBlock(startPrompt, 'FRAME SCENE ATMOSPHERE LOCK'),
    hasModelLock: Boolean(preview?.hasModelIdentityBlock) || detectBlock(startPrompt, 'STRICT MODEL IDENTITY LOCK'),
    hasReferenceResponsibility: Boolean(preview?.referenceResponsibilityBlock) || detectBlock(startPrompt, 'PRODUCT REFERENCES LOCK PRODUCT ONLY'),
  }
  return { start: startStats }
})
const promptHealthStatus = computed(() => {
  const start = promptDiagnosticSummary.value.start
  const startCoreReady = start.hasCompiledLock && start.hasProductDescription && start.hasDirectProductReuse && start.hasModelLock
  const hasMissingScene = !start.hasSceneAtmosphere
  const hasMissingCore = !startCoreReady
  const hasHighLength = start.length > 2450
  if (hasMissingScene) {
    return {
      tone: 'danger',
      label: tr('autoUi.k_7828a37a6196'),
      message: tr('autoUi.k_fd16551ef572'),
    }
  }
  if (hasMissingCore) {
    return {
      tone: 'danger',
      label: tr('autoUi.k_1cfc8d5ed626'),
      message: tr('autoUi.k_415a479f14c6'),
    }
  }
  if (hasHighLength) {
    return {
      tone: 'warning',
      label: tr('autoUi.k_b376caf2d8fc'),
      message: tr('autoUi.k_19b502ee1ae9'),
    }
  }
  return {
    tone: 'success',
    label: tr('autoUi.k_cafb86248dd0'),
    message: tr('autoUi.k_c7733bb92e22'),
  }
})

watch(shotPromptPreviewOpen, (open) => {
  if (!open && !shotImagePromptPreviewLoading.value) {
    resetShotImagePromptPreviewState()
  }
})

watch(shotVideoPromptPreviewOpen, (open) => {
  if (!open && !shotVideoPromptPreviewLoading.value) {
    resetShotVideoPromptPreviewState()
  }
})

function markError(message: unknown, fallback: string) {
  errorText.value = safeText(message, fallback)
  pushRuntimeLog(errorText.value, 'error')
}

const applyRuntimePipelineStatus = (project: CloneProject, runtimeRes: { pipeline?: CloneProject['pipelineStatus'] }) => {
  const next = { ...project }
  if (runtimeRes?.pipeline) {
    next.pipelineStatus = runtimeRes.pipeline
  }
  return next
}

const {
  applyProject,
  refreshCurrentProject,
  refreshRuntimeProject,
  ensureCurrentProjectReady,
  refreshProjectAfterFailure,
  loadProject,
  pickReferenceVideo: bindReferenceVideoToWorkspace,
  bindLibraryProduct,
  bindProductImages,
  bindModelIdentity,
  createBlueprint: createBlueprintInWorkspace,
  generateScriptVariants: generateScriptVariantsInWorkspace,
  selectScriptVariant: selectScriptVariantInWorkspace,
  syncProductImagesToProject: syncProductImagesToProjectInWorkspace,
  removeProductImage: removeProductImageInWorkspace,
  clearProductImages: clearProductImagesInWorkspace,
  generateStoryboardGrids: generateStoryboardGridsInWorkspace,
  batchQueryStoryboardImages: batchQueryStoryboardImagesInWorkspace,
  regenerateStoryboardFrame: regenerateStoryboardFrameInWorkspace,
  regenerateStoryboardFrames: regenerateStoryboardFramesInWorkspace,
  generateShotVideos: generateShotVideosInWorkspace,
  autoRunToStoryboardVideos: autoRunToStoryboardVideosInWorkspace,
  syncFailedShotVideo: syncFailedShotVideoInWorkspace,
  forceDownloadShotVideoResult: forceDownloadShotVideoResultInWorkspace,
  replaceShotVideo: replaceShotVideoInWorkspace,
  regenerateShotClip: regenerateShotClipInWorkspace,
  refreshRemoteStatus: refreshRemoteStatusInWorkspace,
  syncPendingShotVideos: syncPendingShotVideosInWorkspace,
  composeFinalVideo: composeFinalVideoInWorkspace,
} = useCloneProjectWorkspace<CloneProject>({
  current,
  loading,
  referenceVideoPath,
  productRefs,
  productRefsDraft,
  selectedProductId,
  selectedModelId,
  storyboardBatchSummary,
  variantCount,
  errorText,
  composeOutputDir,
  composeLocalError,
  modelModalOpen,
  markError,
  readFileAsBase64: (filePath) => window.api.readFileAsBase64({ path: filePath }) as Promise<string>,
  fileNameFromPath,
  mimeTypeFromPath,
  resolveActiveProjectId,
  applyPipelineStatus: applyRuntimePipelineStatus,
  getActiveImageProvider: () => activeImageProvider.value,
  getActiveImageModel: () => activeImageModel.value,
  shotLabel,
  getStoryboardFrameCount: () => storyboardFrames.value.length,
  getReadyVideoCount: () => shotVideoOutputs.value.filter((item) => hasReadyShotOutputVideo(item)).length,
  getShotVideoOutputCount: () => shotVideoOutputs.value.length,
  getFinalOutputPath: () => finalOutputPath.value,
  setStageLog,
  pushRuntimeLog,
})

watch(
  () => current.value,
  (project, previousProject) => {
    const nextId = String(project?.id || '').trim()
    const prevId = String(previousProject?.id || '').trim()
    if (prevId && nextId && prevId !== nextId) {
      closeAllModalOverlays()
    }
    syncVideoRenderHintsFromProject(project)
  },
  { immediate: true },
)

function startNewDraft() {
  closeAllModalOverlays()
  current.value = null
  referenceVideoPath.value = ''
  errorText.value = ''
  selectedStageKey.value = ''
  setStageLog(tr('autoUi.k_9cb25b9d849e'))
}

function selectStage(key: StageItem['key']) {
  closeTransientModalOverlays()
  console.log('[clone-debug] select-stage-click', {
    targetStage: key,
    previousSelectedStageKey: selectedStageKey.value || '',
    workflowStageKey: workflowStageKey.value,
    visibleStageKey: visibleStageKey.value,
    workflowStep: workflowStep.value,
    currentId: current.value?.id || '',
    loading: loading.value,
  })
  selectedStageKey.value = key
}

function readyStoryboardFrameCount() {
  const fromFrames = storyboardFrames.value.filter((item) => Boolean(String(item.imagePath || '').trim())).length
  const fromBlueprint = blueprintShots.value.filter((item) =>
    Boolean(String(item.gptFirstFramePath || item.generatedFirstFramePath || '').trim()),
  ).length
  return Math.max(fromFrames, fromBlueprint)
}

async function enterVideoStageAndAutoSubmit(reason: 'storyboard_done' | 'manual_next_step') {
  void window.api.clone.debugLog({
    message: `[clone-debug] renderer:enter-video-stage:start ${JSON.stringify({
      reason,
      projectId: current.value?.id || '',
      selectedStageKey: selectedStageKey.value,
      visibleStageKey: visibleStageKey.value,
      loading: loading.value,
    })}`,
  })
  selectStage('video')
  if (current.value?.id) {
    try {
      await loadProject(current.value.id, { updateStageLog: false })
    } catch (error: any) {
      pushRuntimeLog(
        `[clone-debug] video-stage:entry-load-project-failed ${JSON.stringify({
          reason,
          projectId: current.value?.id || '',
          message: String(error?.message ?? error ?? 'unknown error'),
        })}`,
        'error',
      )
    }
  }
  await nextTick()
  const readyFrameCount = readyStoryboardFrameCount()
  void window.api.clone.debugLog({
    message: `[clone-debug] renderer:enter-video-stage:ready-count ${JSON.stringify({
      reason,
      projectId: current.value?.id || '',
      readyFrameCount,
      storyboardFrameCount: storyboardFrames.value.length,
      blueprintShotCount: blueprintShots.value.length,
    })}`,
  })
  if (!readyFrameCount) return
  const hasSubmittedShotVideos = shotVideoOutputs.value.some((item) => {
    const status = String(item.status || '').toLowerCase()
    const taskId = String(item.taskId || '').trim()
    const videoPath = String(item.videoPath || '').trim()
    return Boolean(
      videoPath ||
        taskId ||
        (status && status !== 'idle' && status !== 'failed_retryable' && status !== 'failed_terminal'),
    )
  })
  console.log('[clone-debug] video-stage:entry-auto-submit-check', {
    reason,
    projectId: current.value?.id || '',
    readyFrameCount,
    shotVideoCount: shotVideoOutputs.value.length,
    hasSubmittedShotVideos,
  })
  if (hasSubmittedShotVideos) return
  autoVideoSubmitSignature = `${current.value?.id || ''}:${readyFrameCount}:entry:${reason}`
  pushRuntimeLog(
    `[clone-debug] video-stage:entry-auto-submit ${JSON.stringify({
      reason,
      projectId: current.value?.id || '',
      readyFrameCount,
      shotVideoCount: shotVideoOutputs.value.length,
    })}`,
    'info',
  )
  await generateShotVideos()
}

function shotLabel(shotId: string) {
  const beat = storyBeats.value.find((item) => item.id === shotId)
  if (beat) return beat.purpose
  const frame = storyboardFrames.value.find((item) => item.shotId === shotId)
  return tr('autoUi.k_65f2f856e95d', { p0: Number(frame?.frameIndex ?? 0) + 1 })
}

function openFramePreview(frameOrPath: StoryboardFrame | string, title?: string) {
  if (typeof frameOrPath === 'string') {
    const directPath = String(frameOrPath || '').trim()
    if (!directPath) return
    framePreviewPath.value = directPath
    framePreviewTitle.value = safeText(title, tr('autoUi.k_feabb054e58a'))
    framePreviewOpen.value = true
    return
  }
  const frame = frameOrPath
  if (!frame.imagePath) return
  const shot = blueprintShots.value.find((item) => item.id === frame.shotId)
  framePreviewPath.value = frame.imagePath
  framePreviewTitle.value = `${safeText(shotLabel(frame.shotId), tr('autoUi.k_fcad7fe371b8'))} ${shot ? `· ${storyBeatRangeText(shot as StoryBeat, Number(frame.frameIndex ?? 0))}` : ''}`.trim()
  framePreviewOpen.value = true
}

function openIdentityGridPreview() {
  const imagePath = String(current.value?.projectIdentityGridPath || '').trim()
  if (!imagePath) return
  framePreviewPath.value = imagePath
  framePreviewTitle.value = tr('autoUi.k_393c5c3a5168')
  framePreviewOpen.value = true
}

async function toggleFrameLock(shotId: string) {
  if (!current.value?.id) return
  const shot = blueprintShots.value.find((item) => item.id === shotId)
  if (!shot) return
  loading.value = true
  errorText.value = ''
  setStageLog(tr('autoUi.k_ea60dd8a8659', { p0: shot.locked ? '解除锁定' : '锁定', p1: shotLabel(shotId) }))
  try {
    const resolved = await resolveCloneWorkspaceClient<CloneProject>(current.value.id)
    const project = ((await resolved.client.updateShot(current.value.id, shotId, {
      locked: !shot.locked,
    }))?.project || current.value) as CloneProject
    applyProject(project || current.value)
    setStageLog(tr('autoUi.k_5a9dd00d57ff', { p0: shotLabel(shotId), p1: shot.locked ? '解除锁定' : '锁定', p2: resolved.channel }), 'success')
  } catch (error: any) {
    markError(error?.message ?? error, tr('autoUi.k_ec45ef305a36'))
    await refreshProjectAfterFailure()
    setStageLog(tr('autoUi.k_8ff7a7be0616'), 'error')
  } finally {
    loading.value = false
  }
}

function canContinueSyncShot(item?: ShotVideoOutput | null) {
  if (isRemotePendingShot(item)) return true
  const remoteStatus = String(item?.remoteStatus || '').toLowerCase()
  return (
    Boolean(item) &&
    !hasReadyShotOutputVideo(item) &&
    (
      Boolean(effectiveShotTaskId(item?.shotId)) ||
      Boolean(String(item?.videoUrl || '').trim())
    ) &&
    remoteStatus === 'succeeded'
  )
}

function canForceDownloadShot(item?: ShotVideoOutput | null) {
  if (!item) return false
  if (hasReadyShotOutputVideo(item)) return false
  const status = String(item.status || '').toLowerCase()
  const remoteStatus = String(item.remoteStatus || '').toLowerCase()
  const hasRemoteUrl = Boolean(resolveShotRemoteVideoUrl(item))
  if (status !== 'downloading' && status !== 'remote_succeeded_pending_download' && !(hasRemoteUrl && remoteStatus === 'succeeded')) return false
  return hasRemoteUrl
}

function canRepairShotTaskId(item?: ShotVideoOutput | null) {
  if (!item) return false
  if (hasReadyShotOutputVideo(item)) return false
  const status = String(item.status || '').toLowerCase()
  if (status === 'submitting' || status === 'remote_pending' || status === 'remote_running' || status === 'remote_succeeded_pending_download' || status === 'downloading') return false
  return !effectiveShotTaskId(item.shotId)
}

function storyBeatDisplayIndex(beat: StoryBeat, fallbackIndex = 0) {
  if (Number.isFinite(beat.index)) return Number(beat.index) + 1
  const frame = storyboardFrames.value.find((item) => item.shotId === beat.id)
  if (typeof frame?.frameIndex === 'number') return frame.frameIndex + 1
  return fallbackIndex + 1
}

function storyBeatRangeText(beat: StoryBeat, fallbackIndex = 0) {
  const start = Number(beat.startSec)
  const end = Number(beat.endSec)
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return `${formatDuration(start)}-${formatDuration(end)}`
  }
  return tr('autoUi.k_7a27f4893bf7', { p0: String(storyBeatDisplayIndex(beat, fallbackIndex)).padStart(2, '0') })
}

function localizeShotField(value?: string) {
  const text = String(value || '').trim()
  if (!text) return '--'
  const normalized = text.toLowerCase()
  const map: Record<string, string> = {
    'close-up': tr('autoUi.k_5a380a0ace9b'),
    closeup: tr('autoUi.k_5a380a0ace9b'),
    'medium shot': tr('autoUi.k_a0e85a087553'),
    medium: tr('autoUi.k_a0e85a087553'),
    'wide shot': tr('autoUi.k_b015efa6512f'),
    wide: tr('autoUi.k_b015efa6512f'),
    'top shot': tr('autoUi.k_99e2de994bf1'),
    top: tr('autoUi.k_99e2de994bf1'),
    'tracking shot': tr('autoUi.k_ebee67cfd6cc'),
    tracking: tr('autoUi.k_ebee67cfd6cc'),
    pan: tr('autoUi.k_0e855ea2fda6'),
    tilt: tr('autoUi.k_f17b90b1c5e4'),
    dolly: tr('autoUi.k_4c6e41056f1e'),
    zoom: tr('autoUi.k_a462c30c725f'),
    hook: tr('autoUi.k_f8728da14917'),
    demo: tr('autoUi.k_4209499b7b3b'),
    product: tr('autoUi.k_40cd73364d18'),
    model: tr('autoUi.k_f69382f26e8a'),
    hand: tr('autoUi.k_5b98cb5f608e'),
  }
  return map[normalized] || text
}

function fileNameFromPath(filePath: string) {
  const normalized = String(filePath || '').replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] || normalized
}

function mimeTypeFromPath(filePath: string) {
  const normalized = String(filePath || '').toLowerCase()
  if (/\.(png)$/i.test(normalized)) return 'image/png'
  if (/\.(jpg|jpeg)$/i.test(normalized)) return 'image/jpeg'
  if (/\.(webp)$/i.test(normalized)) return 'image/webp'
  if (/\.(gif)$/i.test(normalized)) return 'image/gif'
  if (/\.(mov)$/i.test(normalized)) return 'video/quicktime'
  if (/\.(mkv)$/i.test(normalized)) return 'video/x-matroska'
  if (/\.(webm)$/i.test(normalized)) return 'video/webm'
  return 'video/mp4'
}

function localizePurpose(value?: string) {
  const text = String(value || '').trim()
  if (!text) return tr('autoUi.k_9c1d5accb8ef')
  const normalized = text.toLowerCase()
  const map: Record<string, string> = {
    hook: tr('autoUi.k_7d0694653644'),
    problem: tr('autoUi.k_b6bbb1a7609c'),
    proof: tr('autoUi.k_efa6b43dae6c'),
    offer: tr('autoUi.k_0bb69cfc6f36'),
    cta: tr('autoUi.k_af490f0044c3'),
    benefit: tr('autoUi.k_e7616a4eadcf'),
    demo: tr('autoUi.k_ff5c9efb002a'),
  }
  return map[normalized] || text
}

function localizeReferenceMode(value?: string) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'product_closeup') return tr('autoUi.k_7b569a67abe5')
  if (normalized === 'model_presentation') return tr('autoUi.k_420b23e27c6d')
  return ''
}

function shotReferenceLabel(input?: { storyboardReferenceMode?: string; shotType?: string; productRole?: string }) {
  return localizeReferenceMode(input?.storyboardReferenceMode) || localizeShotField(input?.shotType || input?.productRole)
}

function shotScriptSummary(shotId?: string) {
  const beat = storyBeats.value.find((item) => item.id === shotId)
  if (!beat) return tr('autoUi.k_94606e0c0a67')
  const parts = [
    beat.purpose,
    shotReferenceLabel({
      storyboardReferenceMode: beat.storyboardReferenceMode,
      shotType: beat.shotType,
      productRole: beat.productRole,
    }),
    localizeShotField(beat.productRole),
  ].map((item) => String(item || '').trim()).filter(Boolean)
  return parts.join(' · ') || tr('autoUi.k_94606e0c0a67')
}

function selectAdjacentShot(offset: number) {
  if (!shotVideoOutputs.value.length) return
  const currentIndex = selectedShotIndex.value >= 0 ? selectedShotIndex.value : 0
  const nextIndex = Math.min(Math.max(currentIndex + offset, 0), shotVideoOutputs.value.length - 1)
  selectedShotId.value = shotVideoOutputs.value[nextIndex]?.shotId || selectedShotId.value
}

async function refreshModels() {
  modelLoading.value = true
  try {
    models.value = (await window.api.clone.listModelIdentityLibrary()) as ModelItem[]
  } finally {
    modelLoading.value = false
  }
}

async function refreshProducts() {
  products.value = (await window.api.products.list()) as ProductLibraryItem[]
  if (!selectedProductId.value) {
    selectedProductId.value = String(current.value?.productId || products.value[0]?.id || '')
  }
}

async function pickReferenceVideo() {
  const files = await window.api.pickFiles({
    title: tr('autoUi.k_4cd75c868c2e'),
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v'] }],
    multiple: false,
  })
  const file = String(files?.[0] || '')
  if (!file) return
  await bindReferenceVideoToWorkspace(file)
}

async function pickProductImages() {
  const files = await window.api.pickFiles({
    title: tr('autoUi.k_2edd0e805bf7'),
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    multiple: true,
  })
  const next = (files || []).map(String).filter(Boolean)
  if (!next.length) return
  await bindProductImages(next, effectiveProductRefs.value)
}

async function bindSelectedProduct() {
  const productId = String(selectedProductId.value || '').trim()
  pushRuntimeLog(`[clone-debug] bind-selected-product:click productId=${productId || 'empty'} currentId=${String(current.value?.id || '').trim() || 'empty'}`, 'info')
  if (!productId) {
    markError(tr('autoUi.k_049be83c03c5'), tr('autoUi.k_049be83c03c5'))
    window.alert(tr('autoUi.k_049be83c03c5'))
    return
  }
  try {
    await bindLibraryProduct(productId)
    const boundProductId = String(current.value?.productId || '').trim()
    if (boundProductId === productId) {
      window.alert(tr('autoUi.k_809ff6b760b0'))
      return
    }
    window.alert(tr('autoUi.k_1f60d1240791'))
  } catch (error: any) {
    const message = safeText(error?.message ?? error, tr('autoUi.k_6cc953df3eed'))
    markError(message, message)
    window.alert(message)
  }
}

async function removeProductImage(imagePath: string) {
  await removeProductImageInWorkspace(imagePath, effectiveProductRefs.value)
}

async function clearProductImages() {
  await clearProductImagesInWorkspace(effectiveProductRefs.value)
}

async function createBlueprint() {
  const boundProductId = String(current.value?.productId || '').trim()
  const selectedProductIdText = String(selectedProductId.value || '').trim()
  if (!boundProductId) {
    const message = selectedProductIdText
      ? tr('autoUi.k_2ef3076b44c5')
      : tr('autoUi.k_79d220908086')
    markError(message, message)
    setStageLog(message, 'error')
    window.alert(message)
    return
  }
  const sourcePath = safeText(referenceSourcePath.value, '')
  await createBlueprintInWorkspace(sourcePath)
  const canContinueToScript = Boolean(effectiveProductRefs.value.length) && Boolean(hasBoundModel.value)
  if (!canContinueToScript) {
    setStageLog(tr('autoUi.k_6fce855845a4'), 'info')
    return
  }
  if (current.value?.runMode === 'auto') {
    autoRunIntentArmed.value = true
    autoRunRequestedAfterAnalyze.value = true
  } else if (autoRunIntentArmed.value) {
    autoRunRequestedAfterAnalyze.value = true
  }
  await generateScriptVariants()
}

async function generateScriptVariants() {
  const selectedProduct = String(selectedProductId.value || '').trim()
  const boundProduct = String(current.value?.productId || '').trim()
  if (selectedProduct && selectedProduct !== boundProduct && current.value?.id) {
    await bindLibraryProduct(selectedProduct)
  }
  console.log('[clone-debug] generate-script-click', {
    currentId: activeProjectId.value || '',
    effectiveProductRefs: [...effectiveProductRefs.value],
    savedProductRefs: [...productRefs.value],
    draftProductRefs: productRefsDraft.value ? [...productRefsDraft.value] : null,
    selectedModelId: selectedModelId.value || current.value?.selectedModelIdentitySnapshot?.id || '',
    variantCount: variantCount.value,
  })
  pushRuntimeLog(tr('autoUi.k_70d5d79b2bf6', { p0: variantCount.value }), 'info')
  await generateScriptVariantsInWorkspace(effectiveProductRefs.value, hasBoundModel.value)
  await nextTick()
  if (scriptVariants.value.length) {
    selectStage('variant')
  }
  const shouldAutoContinueAfterScript =
    Boolean(scriptVariants.value.length) &&
    !hasGeneratedStoryboardFrames.value &&
    !shotVideoOutputs.value.length &&
    !finalOutputPath.value
  if (!shouldAutoContinueAfterScript) return
  await nextTick()
  const nextKey = autoBootstrapKey.value
  if (nextKey) {
    if (nextKey === autoBootstrapSignature.value) return
    autoBootstrapSignature.value = nextKey
  } else {
    autoBootstrapSignature.value = `script-auto-continue:${String(current.value?.id || '').trim()}:${Date.now()}`
  }
  selectStage('identity-grid')
  setStageLog(tr('autoUi.k_55c2c7bc1576'))
  try {
    await autoRunToStoryboardVideos()
    selectedStageKey.value = ''
    autoRunRequestedAfterAnalyze.value = false
    autoRunIntentArmed.value = false
  } catch (error: any) {
    autoBootstrapSignature.value = ''
    autoRunRequestedAfterAnalyze.value = false
    autoRunIntentArmed.value = false
    markError(error?.message ?? error, tr('autoUi.k_ac380d4b486d'))
    await refreshProjectAfterFailure()
    setStageLog(tr('autoUi.k_d66752d60d33'), 'error')
  }
}

async function selectScriptVariant(variantId: string) {
  await selectScriptVariantInWorkspace(variantId)
}

async function selectModel(item: ModelItem) {
  await bindModelIdentity(item.id)
}

function selectProduct(item: ProductLibraryItem) {
  const nextId = String(item?.id || '').trim()
  if (!nextId) return
  selectedProductId.value = nextId
  simpleProductPicked.value = true
  productQuery.value = ''
  productModalOpen.value = false
}

function toggleStoryboardShotSelection(shotId: string) {
  const normalizedShotId = String(shotId || '').trim()
  if (!normalizedShotId) return
  if (selectedStoryboardShotIds.value.includes(normalizedShotId)) {
    selectedStoryboardShotIds.value = selectedStoryboardShotIds.value.filter((id) => id !== normalizedShotId)
    return
  }
  selectedStoryboardShotIds.value = [...selectedStoryboardShotIds.value, normalizedShotId]
}

function toggleSelectAllStoryboardShots() {
  const allShotIds = storyboardDesignRows.value.map((row) => row.shotId).filter(Boolean)
  if (!allShotIds.length) return
  if (selectedStoryboardShotIds.value.length === allShotIds.length) {
    selectedStoryboardShotIds.value = []
    return
  }
  selectedStoryboardShotIds.value = allShotIds
}

async function generateStoryboardGrids() {
  if (storyboardFrameBlockReason.value) {
    markError(storyboardFrameBlockReason.value, storyboardFrameBlockReason.value)
    setStageLog(storyboardFrameBlockReason.value, 'error')
    return
  }
  await generateStoryboardGridsInWorkspace({
    effectiveProductRefs: effectiveProductRefs.value,
    hasBoundModel: hasBoundModel.value,
    selectedVariantId: selectedVariantId.value,
  })
  await enterVideoStageAndAutoSubmit('storyboard_done')
}

async function regenerateStoryboardFrame(shotId: string) {
  const normalizedShotId = String(shotId || '').trim()
  if (!normalizedShotId) return
  if (storyboardFrameBlockReason.value) {
    markError(storyboardFrameBlockReason.value, storyboardFrameBlockReason.value)
    setStageLog(storyboardFrameBlockReason.value, 'error')
    return
  }
  if (regeneratingStoryboardShotIds.value.includes(normalizedShotId)) {
    setStageLog(tr('autoUi.k_88481b5b3996', { p0: shotLabel(normalizedShotId) }))
    return
  }
  regeneratingStoryboardShotIds.value = [...regeneratingStoryboardShotIds.value, normalizedShotId]
  setStageLog(tr('autoUi.k_8fc5b7c8f4a3', { p0: shotLabel(normalizedShotId) }))
  try {
    await regenerateStoryboardFrameInWorkspace(normalizedShotId, effectiveProductRefs.value)
  } finally {
    regeneratingStoryboardShotIds.value = regeneratingStoryboardShotIds.value.filter((id) => id !== normalizedShotId)
  }
}

async function regenerateUnlockedStoryboardFrames() {
  if (storyboardFrameBlockReason.value) {
    markError(storyboardFrameBlockReason.value, storyboardFrameBlockReason.value)
    setStageLog(storyboardFrameBlockReason.value, 'error')
    return
  }
  const targets = blueprintShots.value
    .filter((shot) => !shot.locked)
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
  if (!targets.length) {
    setStageLog(tr('autoUi.k_dbc0b80307e9'))
    return
  }
  regeneratingStoryboardShotIds.value = Array.from(new Set([...regeneratingStoryboardShotIds.value, ...targets.map((shot) => shot.id)]))
  try {
    await regenerateStoryboardFramesInWorkspace({
      shotIds: targets.map((shot) => shot.id),
      effectiveProductRefs: effectiveProductRefs.value,
      stageLogLabel: tr('autoUi.k_936d826201d2', { p0: targets.length }),
    })
  } finally {
    regeneratingStoryboardShotIds.value = regeneratingStoryboardShotIds.value.filter((id) => !targets.some((shot) => shot.id === id))
  }
}

async function regenerateFailedStoryboardFrames() {
  if (storyboardFrameBlockReason.value) {
    markError(storyboardFrameBlockReason.value, storyboardFrameBlockReason.value)
    setStageLog(storyboardFrameBlockReason.value, 'error')
    return
  }
  if (regeneratingFailedStoryboardFrames.value) {
    setStageLog(tr('autoUi.k_be58d1215366'))
    return
  }
  const targets = failedStoryboardFrames.value
    .map((item) => item.shotId)
    .filter(Boolean)
  if (!targets.length) {
    setStageLog(tr('autoUi.k_5afee0cb377d'))
    return
  }
  regeneratingFailedStoryboardFrames.value = true
  regeneratingStoryboardShotIds.value = Array.from(new Set([...regeneratingStoryboardShotIds.value, ...targets]))
  setStageLog(tr('autoUi.k_0a9ffccc5b2e', { p0: targets.length }))
  try {
    await regenerateStoryboardFramesInWorkspace({
      shotIds: targets,
      effectiveProductRefs: effectiveProductRefs.value,
      stageLogLabel: tr('autoUi.k_0a9ffccc5b2e', { p0: targets.length }),
    })
    setStageLog(tr('autoUi.k_1802d02893eb', { p0: targets.length }), 'success')
  } finally {
    regeneratingStoryboardShotIds.value = regeneratingStoryboardShotIds.value.filter((id) => !targets.includes(id))
    regeneratingFailedStoryboardFrames.value = false
  }
}

async function regenerateSelectedStoryboardFrames() {
  if (storyboardFrameBlockReason.value) {
    markError(storyboardFrameBlockReason.value, storyboardFrameBlockReason.value)
    setStageLog(storyboardFrameBlockReason.value, 'error')
    return
  }
  const targets = storyboardDesignRows.value
    .map((row) => row.shotId)
    .filter((shotId) => selectedStoryboardShotIds.value.includes(shotId))
  if (!targets.length) {
    setStageLog(tr('autoUi.k_2f5f2efc257f'))
    return
  }
  regeneratingStoryboardShotIds.value = Array.from(new Set([...regeneratingStoryboardShotIds.value, ...targets]))
  setStageLog(tr('autoUi.k_5107f362963f', { p0: targets.length }))
  try {
    await regenerateStoryboardFramesInWorkspace({
      shotIds: targets,
      effectiveProductRefs: effectiveProductRefs.value,
      stageLogLabel: tr('autoUi.k_5107f362963f', { p0: targets.length }),
    })
    setStageLog(tr('autoUi.k_a9718812998f', { p0: targets.length }), 'success')
  } finally {
    regeneratingStoryboardShotIds.value = regeneratingStoryboardShotIds.value.filter((id) => !targets.includes(id))
  }
}

async function batchQueryPendingStoryboardFrames() {
  if (queryingStoryboardFrames.value) {
    setStageLog(tr('autoUi.k_c72e6e721b6e'))
    return
  }
  const targets = pendingStoryboardFrames.value
    .map((item) => item.shotId)
    .filter(Boolean)
  if (!targets.length) {
    setStageLog(tr('autoUi.k_682bce8f1ee5'))
    return
  }
  queryingStoryboardFrames.value = true
  setStageLog(tr('autoUi.k_c956a341ab26', { p0: targets.length }))
  try {
    await batchQueryStoryboardImagesInWorkspace({
      effectiveProductRefs: effectiveProductRefs.value,
      shotIds: targets,
    })
    setStageLog(tr('autoUi.k_06258768d7ef', { p0: targets.length }), 'success')
  } finally {
    queryingStoryboardFrames.value = false
  }
}

async function generateShotVideos() {
  void window.api.clone.debugLog({
    message: `[clone-debug] renderer:generate-shot-videos:before ${JSON.stringify({
      projectId: current.value?.id || '',
      visibleStageKey: visibleStageKey.value,
      readyFrameCount: readyStoryboardFrameCount(),
      shotVideoCount: shotVideoOutputs.value.length,
      loading: loading.value,
    })}`,
  })
  pushRuntimeLog(
    `[clone-debug] generate-shot-videos:invoke ${JSON.stringify({
      projectId: current.value?.id || '',
      visibleStageKey: visibleStageKey.value,
      storyboardReadyCount: storyboardFrames.value.filter((item) => Boolean(String(item.imagePath || '').trim())).length,
      shotVideoCount: shotVideoOutputs.value.length,
    })}`,
    'info',
  )
  await generateShotVideosInWorkspace()
}

async function saveVideoRenderHints(input?: { aspectRatio?: VideoRenderAspectRatio; resolution?: VideoRenderResolution }) {
  if (!current.value?.id || savingVideoRenderHints.value) return
  const aspectRatio = input?.aspectRatio || videoRenderAspectRatio.value
  const resolution = input?.resolution || videoRenderResolution.value
  savingVideoRenderHints.value = true
  try {
    const result = await window.api.clone.updateProjectRenderHints({
      cloneProjectId: current.value.id,
      aspectRatio,
      resolution,
    })
    const project = ((result as any)?.project || current.value) as CloneProject
    applyProject(project)
    syncVideoRenderHintsFromProject(project)
    setStageLog(tr('autoUi.k_10c60e23161d', { p0: resolution }), 'success')
  } catch (error: any) {
    markError(error?.message ?? error, tr('autoUi.k_26786a46f372'))
    syncVideoRenderHintsFromProject(current.value)
    setStageLog(tr('autoUi.k_523cdae527c8'), 'error')
  } finally {
    savingVideoRenderHints.value = false
  }
}

async function handleVideoAspectRatioChange(value: VideoRenderAspectRatio) {
  videoRenderAspectRatio.value = value
  const fallbackResolution = value === '16:9' ? '1280x720' : '1080x1920'
  if (!filteredVideoRenderResolutionOptions.value.some((item) => item.value === videoRenderResolution.value)) {
    videoRenderResolution.value = fallbackResolution
  }
  await saveVideoRenderHints({
    aspectRatio: videoRenderAspectRatio.value,
    resolution: videoRenderResolution.value,
  })
}

async function handleVideoResolutionChange(value: VideoRenderResolution) {
  videoRenderResolution.value = value
  videoRenderAspectRatio.value = value === '1280x720' || value === '1920x1080' ? '16:9' : '9:16'
  await saveVideoRenderHints({
    aspectRatio: videoRenderAspectRatio.value,
    resolution: videoRenderResolution.value,
  })
}

async function autoRunToStoryboardVideos() {
  autoRunIntentArmed.value = true
  selectStage('identity-grid')
  await autoRunToStoryboardVideosInWorkspace({
    variantCount: variantCount.value,
    productReferenceImagePaths: [...effectiveProductRefs.value],
    selectedModelIdentityId: selectedModelId.value || current.value?.selectedModelIdentitySnapshot?.id,
  })
  selectedStageKey.value = ''
}

async function syncFailedShotVideo(shotId: string) {
  await syncFailedShotVideoInWorkspace(shotId)
}

async function forceDownloadShotVideoResult(shotId: string) {
  if (!shotId || forceDownloadingShotVideoIds.value.includes(shotId)) return
  forceDownloadingShotVideoIds.value = [...forceDownloadingShotVideoIds.value, shotId]
  try {
    await forceDownloadShotVideoResultInWorkspace(shotId)
  } finally {
    forceDownloadingShotVideoIds.value = forceDownloadingShotVideoIds.value.filter((item) => item !== shotId)
  }
}

async function replaceShotVideo(shotId: string) {
  const files = await window.api.pickFiles({
    title: tr('autoUi.k_c6835c4750fa'),
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v'] }],
    multiple: false,
  })
  const file = String(files?.[0] || '')
  if (!file) return
  await replaceShotVideoInWorkspace(shotId, file)
}

async function regenerateShotClip(shotId: string) {
  const normalizedShotId = String(shotId || '').trim()
  if (!normalizedShotId) return
  if (regeneratingShotVideoIds.value.includes(normalizedShotId)) {
    setStageLog(tr('autoUi.k_88481b5b3996', { p0: shotLabel(normalizedShotId) }))
    return
  }
  regeneratingShotVideoIds.value = [...regeneratingShotVideoIds.value, normalizedShotId]
  setStageLog(tr('autoUi.k_6605b1571733', { p0: shotLabel(normalizedShotId) }))
  try {
    await regenerateShotClipInWorkspace(normalizedShotId)
    if (current.value?.id) {
      await loadProject(current.value.id, { updateStageLog: false })
    }
  } finally {
    regeneratingShotVideoIds.value = regeneratingShotVideoIds.value.filter((id) => id !== normalizedShotId)
  }
}

async function regenerateFailedShotVideos() {
  if (!failedShotOutputs.value.length) return
  if (regeneratingFailedShotVideos.value) {
    setStageLog(tr('autoUi.k_be58d1215366'))
    return
  }
  regeneratingFailedShotVideos.value = true
  setStageLog(tr('autoUi.k_8fb7aad7fd28', { p0: failedShotOutputs.value.length }))
  try {
    for (const item of failedShotOutputs.value) {
      await regenerateShotClip(item.shotId)
    }
  } finally {
    regeneratingFailedShotVideos.value = false
  }
}

async function refreshRemoteStatus(source: 'manual_sync' | 'auto_timer_sync' | 'auto_download_recovery' = 'manual_sync') {
  await refreshRemoteStatusInWorkspace(source)
}

async function syncPendingShotVideos(source: 'manual_pending_sync' | 'auto_timer_sync' = 'manual_pending_sync') {
  await syncPendingShotVideosInWorkspace(source)
}

async function composeFinalVideo() {
  console.log('[clone-debug] compose-final-click', {
    visibleStageKey: visibleStageKey.value,
    selectedStageKey: selectedStageKey.value || '',
    workflowStageKey: workflowStageKey.value,
    workflowStep: workflowStep.value,
    currentId: current.value?.id || '',
    shotVideoCount: shotVideoOutputs.value.length,
    loading: loading.value,
  })
  if (!gatePassAllowed.value) {
    const message = gateFailureSummary.value || tr('autoUi.k_ee3f5a9629c5')
    composeLocalError.value = message
    setStageLog(message, 'error')
    markError(message, message)
    return
  }
  await composeFinalVideoInWorkspace()
}

async function pickComposeOutputDir() {
  const dir = await window.api.pickDir({ title: tr('autoUi.k_ebcc859bd923') })
  if (!dir) return
  composeOutputDir.value = dir
  composeLocalError.value = ''
  setStageLog(tr('autoUi.k_899dd08ab96f', { p0: shortPath(dir) }), 'success')
}

async function openFinalOutput() {
  if (!finalOutputPath.value) return
  await window.api.shell.openPath(finalOutputPath.value)
}

async function revealFinalOutput() {
  if (!finalOutputPath.value) return
  await window.api.shell.showItemInFolder(finalOutputPath.value)
}

async function openTiktokCreativeStudio() {
  if (!current.value?.id) return
  try {
    const result = await window.api.clone.sendProjectToCreative({ cloneProjectId: current.value.id })
    setStageLog(tr('ai.cloneShot.projectSent', { count: result.shotCount }), 'success')
    void router.push({ path: '/plugins/tiktok-creative-studio' })
  } catch (error: any) {
    onShotAlternativeError(String(error?.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
  }
}

function onShotAlternativeReplaced(project: unknown) {
  if (project) {
    applyProject(project as CloneProject)
    setStageLog(tr('ai.cloneShot.replaced'), 'success')
  } else {
    void refreshCurrentProject()
  }
}

function onShotAlternativeError(message: string) {
  errorText.value = message
  setStageLog(message, 'error')
}

let timer: number | null = null
let offRuntimeLog: (() => void) | null = null
let refreshTick = 0
let autoVideoSubmitSignature = ''
let autoVideoDownloadRecoverySignature = ''
let autoRemoteSyncInFlight = false
let projectPollInFlight = false
let autoRemoteSyncLastAt = 0
let autoStoryboardQuerySignature = ''
let autoStoryboardRetrySignature = ''
const AUTO_REMOTE_SYNC_INTERVAL_MS = 25_000

function buildAutoVideoSubmitSignature(projectId: string, readyFrameCount: number, phase: 'timer' | 'watch') {
  const state = shotVideoOutputStateSignature.value
  return [
    projectId,
    readyFrameCount,
    phase,
    state.total,
    state.taskBound,
    state.localReady,
    state.running,
    state.pendingDownload,
    state.downloading,
    state.updatedAtMax,
  ].join(':')
}

function buildAutoStoryboardRecoverySignature(projectId: string, kind: 'query' | 'retry') {
  const state = storyboardFrameStateSignature.value
  return [
    projectId,
    kind,
    state.total,
    state.ready,
    state.pending,
    state.failed,
    state.retryableFailed,
    state.updatedAtMax,
  ].join(':')
}


// ---------------------------------------------------------------------------
// Simple view: the default face of a task for everyday users.
// Three inputs, one button, four plain-language phases, then the video.
// All pipeline logic stays in the functions above; this only maps state.
// ---------------------------------------------------------------------------
const LAST_MODEL_STORAGE_KEY = 'clone.simple.lastModelId'
const viewModeOverride = ref<'simple' | 'advanced' | ''>('')
const viewMode = computed<'simple' | 'advanced'>(() => {
  if (viewModeOverride.value) return viewModeOverride.value
  // Tasks created as "manual" were opened by someone who wants the step-by-step workspace.
  return current.value?.runMode === 'manual' ? 'advanced' : 'simple'
})
const showSimpleView = computed(() => Boolean(current.value?.id) && viewMode.value === 'simple')
const simpleStarting = ref(false)
// The view mode and the "user picked a product" flag belong to one task, not to the page.
watch(
  () => String(current.value?.id || ''),
  () => {
    viewModeOverride.value = ''
    simpleProductPicked.value = false
  },
)
const simpleBusy = computed(() => loading.value || autoFlowRunning.value || simpleStarting.value)
const simpleState = computed<CloneSimpleState>(() => {
  if (finalOutputPath.value) return 'done'
  const started = Boolean(current.value?.blueprint?.shots?.length) || simpleStarting.value
  if (!started) return 'setup'
  if (simpleBusy.value) return 'running'
  if (generationFailureText.value) return 'error'
  return 'paused'
})
const simplePhases = computed<CloneSimplePhase[]>(() => {
  const stage = workflowStageKey.value
  const activeIndex = finalOutputPath.value ? 4 : stage === 'analyze' ? 0 : stage === 'video' ? 2 : stage === 'compose' ? 3 : 1
  return ['analyze', 'visuals', 'videos', 'compose'].map((key, index) => ({
    key,
    state: index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending',
  }))
})
// A draft can carry a placeholder name before any video is chosen, so only the path counts as "chosen".
const simpleReferenceName = computed(() =>
  referenceSourcePath.value ? safeText(current.value?.referenceVideoName, '') || shortPath(referenceSourcePath.value) : '',
)
// The workspace preselects the first library product. With several products that is a guess,
// so the simple page only shows a product the user picked, one already bound, or the only one there is.
const simpleProductPicked = ref(false)
const simpleProductChosen = computed(
  () => Boolean(selectedProductId.value) && (simpleProductPicked.value || Boolean(current.value?.productId) || products.value.length === 1),
)
const simpleReferenceUrl = computed(() => (referenceSourcePath.value ? mediaUrl(referenceSourcePath.value) : ''))
const simpleFinalVideoUrl = computed(() => (finalOutputPath.value ? mediaUrl(finalOutputPath.value, finalComposeUpdatedAt.value || undefined) : ''))

async function startSimpleClone() {
  if (simpleBusy.value) return
  if (!referenceSourcePath.value || !simpleProductChosen.value || !hasBoundModel.value) return
  simpleStarting.value = true
  errorText.value = ''
  try {
    const productId = String(selectedProductId.value || '').trim()
    if (productId && productId !== String(current.value?.productId || '').trim()) {
      await bindLibraryProduct(productId)
    }
    // One button means the whole pipeline, whatever run mode the task was created with.
    autoRunIntentArmed.value = true
    await createBlueprint()
  } catch (error: any) {
    markError(error?.message ?? error, tr('cloneUi.simple.startFailed'))
  } finally {
    simpleStarting.value = false
  }
}

async function resumeSimpleClone() {
  if (simpleBusy.value) return
  if (!current.value?.blueprint?.shots?.length) {
    await startSimpleClone()
    return
  }
  errorText.value = ''
  try {
    autoRunIntentArmed.value = true
    if (workflowStageKey.value === 'compose') await composeFinalVideo()
    else if (workflowStageKey.value === 'video') await generateShotVideos()
    else await autoRunToStoryboardVideos()
  } catch (error: any) {
    markError(error?.message ?? error, tr('cloneUi.simple.startFailed'))
  }
}

// Remember the model, and offer it again on the next task so step 3 is usually already done.
watch(
  () => String(current.value?.selectedModelIdentitySnapshot?.id || selectedModelId.value || '').trim(),
  (modelId) => {
    if (!modelId) return
    try {
      window.localStorage.setItem(LAST_MODEL_STORAGE_KEY, modelId)
    } catch {
      // Storage can be unavailable; remembering the model is only a convenience.
    }
  },
)
let simpleModelPrefillProjectId = ''
watch(
  () => [String(current.value?.id || ''), models.value.length, simpleState.value, hasBoundModel.value] as const,
  async ([projectId, modelCount, state, bound]) => {
    if (!projectId || !modelCount || state !== 'setup' || bound) return
    if (simpleModelPrefillProjectId === projectId) return
    simpleModelPrefillProjectId = projectId
    let lastModelId = ''
    try {
      lastModelId = String(window.localStorage.getItem(LAST_MODEL_STORAGE_KEY) || '').trim()
    } catch {
      lastModelId = ''
    }
    if (!lastModelId || !models.value.some((item) => item.id === lastModelId)) return
    try {
      await bindModelIdentity(lastModelId)
    } catch {
      // The user can still pick a model by hand.
    }
  },
)

onMounted(async () => {
  cloneTopbar.show(showSimpleView.value ? [] : stageItems.value.map(({ key, title, desc, done, active }) => ({ key, title, desc, done, active })))
  pushRuntimeLog(stageLog.value)
  offRuntimeLog = window.api.clone.onRuntimeLog?.((payload) => {
    const text = safeText(payload?.message, '')
    if (!text) return
    pushRuntimeLog(text, payload?.level || 'info')
  })
  await refreshProducts()
  await refreshModels()
  const projectId = routeProjectId.value
  if (!projectId) {
    void router.replace('/clone')
    return
  }
  try {
    await loadProject(projectId)
  } catch (error: any) {
    pushRuntimeLog(tr('autoUi.k_17ff59cc5738', { p0: safeText(error?.message ?? error, '未知错误') }), 'error')
    markError(error?.message ?? error, tr('autoUi.k_eb84ac0a09a1'))
    setStageLog(tr('autoUi.k_cebbe58c734b'), 'error')
    return
  }
  timer = window.setInterval(() => {
    if (document.hidden) return
    if (current.value?.id && !isDraftingNewProject.value) {
      refreshTick += 1
      if (visibleStageKey.value === 'video' && !loading.value) {
        const readyFrameCount = storyboardFrames.value.filter((item) => Boolean(String(item.imagePath || '').trim())).length
        const hasSubmittedShotVideos = shotVideoOutputs.value.some((item) => {
          const status = String(item.status || '').toLowerCase()
          const taskId = String(item.taskId || '').trim()
          const videoPath = String(item.videoPath || '').trim()
          return Boolean(
            videoPath ||
              taskId ||
              (status && status !== 'idle' && status !== 'failed_retryable' && status !== 'failed_terminal'),
          )
        })
        if (readyFrameCount > 0 && !hasSubmittedShotVideos) {
          const nextSignature = buildAutoVideoSubmitSignature(current.value.id, readyFrameCount, 'timer')
          if (autoVideoSubmitSignature !== nextSignature) {
            autoVideoSubmitSignature = nextSignature
            pushRuntimeLog(
              `[clone-debug] video-stage:timer-auto-submit ${JSON.stringify({
                projectId: current.value.id,
                readyFrameCount,
                shotVideoCount: shotVideoOutputs.value.length,
              })}`,
              'info',
            )
            void generateShotVideos()
          }
        } else if (autoRetryableFailedStoryboardFrames.value.length > 0 && !regeneratingFailedStoryboardFrames.value) {
          const nextSignature = buildAutoStoryboardRecoverySignature(current.value.id, 'retry')
          if (autoStoryboardRetrySignature !== nextSignature) {
            autoStoryboardRetrySignature = nextSignature
            pushRuntimeLog(
              `[clone-debug] storyboard-grid:timer-auto-retry ${JSON.stringify({
                projectId: current.value.id,
                retryableFailedCount: autoRetryableFailedStoryboardFrames.value.length,
                failedCount: storyboardState.failed,
              })}`,
              'info',
            )
            void regenerateFailedStoryboardFrames()
          }
        }
      }
      if (visibleStageKey.value === 'grid' && !loading.value) {
        const storyboardState = storyboardFrameStateSignature.value
        if (storyboardState.pending > 0 && !queryingStoryboardFrames.value) {
          const nextSignature = buildAutoStoryboardRecoverySignature(current.value.id, 'query')
          if (autoStoryboardQuerySignature !== nextSignature) {
            autoStoryboardQuerySignature = nextSignature
            pushRuntimeLog(
              `[clone-debug] storyboard-grid:timer-auto-query ${JSON.stringify({
                projectId: current.value.id,
                pendingCount: storyboardState.pending,
                failedCount: storyboardState.failed,
              })}`,
              'info',
            )
            void batchQueryPendingStoryboardFrames()
          }
        }
      }
      const shouldAutoSyncRemote =
        visibleStageKey.value === 'video' || hasRemotePendingShotSync.value || autoVideoPendingCount.value > 0
      if (shouldAutoSyncRemote && !autoRemoteSyncInFlight && Date.now() - autoRemoteSyncLastAt >= AUTO_REMOTE_SYNC_INTERVAL_MS) {
        autoRemoteSyncInFlight = true
        autoRemoteSyncLastAt = Date.now()
        pushRuntimeLog(
          `[clone-debug] video-stage:auto-remote-sync-dispatch ${JSON.stringify({
            projectId: current.value.id,
            visibleStageKey: visibleStageKey.value,
            pendingCount: autoVideoPendingCount.value,
            hasRemotePendingShotSync: hasRemotePendingShotSync.value,
            mode: hasRemotePendingShotSync.value || autoVideoPendingCount.value > 0 ? 'pending_shot_sync' : 'project_reconcile',
          })}`,
          'info',
        )
        const autoSyncJob =
          hasRemotePendingShotSync.value || autoVideoPendingCount.value > 0
            ? syncPendingShotVideos('auto_timer_sync')
            : refreshRemoteStatus('auto_timer_sync')
        void autoSyncJob.catch((error: any) => {
          pushRuntimeLog(
            `[clone-debug] video-stage:auto-remote-sync-failed ${JSON.stringify({
              projectId: current.value?.id || '',
              message: String(error?.message ?? error ?? 'unknown error'),
            })}`,
            'error',
          )
        }).finally(() => {
          autoRemoteSyncInFlight = false
        })
      }
      // One poll at a time: on a slow network (web) the next tick must not stack another request,
      // and the auto sync above already fetches the project when it ran this tick.
      if (!projectPollInFlight && !autoRemoteSyncInFlight) {
        projectPollInFlight = true
        const pollJob =
          visibleStageKey.value === 'video' || hasRemotePendingShotSync.value || autoVideoPendingCount.value > 0 || refreshTick % 10 === 0
            ? loadProject(current.value.id, { updateStageLog: false, background: true })
            : refreshRuntimeProject()
        void pollJob
          .catch((error: any) => {
            pushRuntimeLog(`[clone-debug] project-poll-failed ${safeText(error?.message ?? error, 'unknown error')}`, 'error')
          })
          .finally(() => {
            projectPollInFlight = false
          })
      }
    }
  }, 6000)
})

watch(
  () => current.value?.productId,
  (next) => {
    const normalized = String(next || '').trim()
    if (normalized) selectedProductId.value = normalized
  },
)

watch(
  autoBootstrapKey,
  async (key) => {
    if (!key || key === autoBootstrapSignature.value) return
    autoBootstrapSignature.value = key
    setStageLog(tr('autoUi.k_16239dc8cae5'))
    try {
      await nextTick()
      if (!current.value?.blueprint?.shots?.length && referenceSourcePath.value) {
        await createBlueprint()
      }
      await autoRunToStoryboardVideos()
      autoRunRequestedAfterAnalyze.value = false
      autoRunIntentArmed.value = false
    } catch (error: any) {
      autoBootstrapSignature.value = ''
      autoRunRequestedAfterAnalyze.value = false
      autoRunIntentArmed.value = false
      markError(error?.message ?? error, tr('autoUi.k_0fb571537a10'))
      await refreshProjectAfterFailure()
      setStageLog(tr('autoUi.k_92662ff96cf1'), 'error')
    }
  },
  { immediate: true },
)

watch(
  () => current.value?.id || '',
  () => {
    autoVideoSubmitSignature = ''
    autoVideoDownloadRecoverySignature = ''
    autoRemoteSyncInFlight = false
    autoRemoteSyncLastAt = 0
    autoStoryboardQuerySignature = ''
    autoStoryboardRetrySignature = ''
    autoBootstrapSignature.value = ''
    autoRunRequestedAfterAnalyze.value = false
    autoRunIntentArmed.value = false
  },
)

watch(
  () => [current.value?.id || '', selectedStoryboardRow.value?.shotId || '', visibleStageKey.value] as const,
  ([projectId, shotId, stageKey]) => {
    if (stageKey !== 'grid') return
    if (!projectId || !shotId) return
    void loadShotImagePromptPreview(shotId)
  },
  { immediate: true },
)

watch(
  () => [current.value?.id || '', visibleStageKey.value, workflowStageKey.value, loading.value ? 'loading' : 'idle', readyStoryboardFrameCount()] as const,
  async ([projectId, stageKey, workflowStage, loadingState, readyFrameCount]) => {
    if (stageKey !== 'grid') return
    if (workflowStage !== 'grid') return
    if (!projectId) return
    if (!readyFrameCount) return
    if (loadingState === 'loading') return
    const nextSignature = `${projectId}:${readyFrameCount}:grid-auto-enter-video`
    if (autoVideoSubmitSignature === nextSignature) return
    autoVideoSubmitSignature = nextSignature
    pushRuntimeLog(
      `[clone-debug] storyboard-grid:auto-enter-video ${JSON.stringify({
        projectId,
        readyFrameCount,
      })}`,
      'info',
    )
    await enterVideoStageAndAutoSubmit('storyboard_done')
  },
)

watch(
  () =>
    [
      current.value?.id || '',
      visibleStageKey.value,
      loading.value ? 'loading' : 'idle',
      storyboardFrames.value.filter((item) => Boolean(String(item.imagePath || '').trim())).length,
      shotVideoOutputStateSignature.value.total,
      shotVideoOutputStateSignature.value.taskBound,
      shotVideoOutputStateSignature.value.localReady,
      shotVideoOutputStateSignature.value.running,
      shotVideoOutputStateSignature.value.updatedAtMax,
    ] as const,
  async ([projectId, stageKey, loadingState, readyFrameCount]) => {
    if (stageKey !== 'video') return
    if (!projectId) return
    if (!readyFrameCount) return
    if (loadingState === 'loading') return
    const hasSubmittedShotVideos = shotVideoOutputs.value.some((item) => {
      const status = String(item.status || '').toLowerCase()
      const taskId = String(item.taskId || '').trim()
      const videoPath = String(item.videoPath || '').trim()
      return Boolean(
        videoPath ||
          taskId ||
          (status && status !== 'idle' && status !== 'failed_retryable' && status !== 'failed_terminal'),
      )
    })
    if (hasSubmittedShotVideos) return
    const nextSignature = buildAutoVideoSubmitSignature(projectId, readyFrameCount, 'watch')
    if (autoVideoSubmitSignature === nextSignature) return
    autoVideoSubmitSignature = nextSignature
    console.log('[clone-debug] video-stage:auto-submit-dispatch', {
      projectId,
      readyFrameCount,
      shotVideoCount: shotVideoOutputs.value.length,
    })
    try {
      await generateShotVideos()
    } catch (error) {
      autoVideoSubmitSignature = ''
      throw error
    }
  },
  { immediate: true },
)

watch(
  () =>
    [
      current.value?.id || '',
      visibleStageKey.value,
      loading.value ? 'loading' : 'idle',
      shotVideoOutputStateSignature.value.downloading,
      shotVideoOutputStateSignature.value.pendingDownload,
      shotVideoOutputStateSignature.value.remoteReady,
      shotVideoOutputStateSignature.value.remoteSucceeded,
      shotVideoOutputStateSignature.value.updatedAtMax,
    ] as const,
  async ([projectId, stageKey, loadingState]) => {
    if (stageKey !== 'video') return
    if (!projectId) return
    if (loadingState === 'loading') return
    const stuckDownloadingItems = shotVideoOutputs.value.filter((item) => {
      const status = String(item.status || '').toLowerCase()
      const remoteStatus = String(item.remoteStatus || '').toLowerCase()
      const hasLocalVideo = Boolean(String(item.videoPath || item.localPath || '').trim())
      const hasVideoUrl = Boolean(String(item.videoUrl || '').trim())
      if (hasLocalVideo || !hasVideoUrl) return false
      if (status !== 'downloading' && status !== 'remote_succeeded_pending_download' && remoteStatus !== 'succeeded') return false
      const lastTouchedAt = Number(item.updatedAt || item.lastPollAt || 0)
      if (!lastTouchedAt) return false
      return Date.now() - lastTouchedAt >= 30_000
    })
    if (!stuckDownloadingItems.length) return
    const nextSignature = `${projectId}:${stuckDownloadingItems.map((item) => `${item.shotId}:${Number(item.updatedAt || item.lastPollAt || 0)}`).join(',')}`
    if (autoVideoDownloadRecoverySignature === nextSignature) return
    autoVideoDownloadRecoverySignature = nextSignature
    console.log('[clone-debug] video-stage:auto-download-recovery-dispatch', {
      projectId,
      shotIds: stuckDownloadingItems.map((item) => item.shotId),
    })
    try {
      await refreshRemoteStatus('auto_download_recovery')
    } catch (error) {
      autoVideoDownloadRecoverySignature = ''
      throw error
    }
  },
  { immediate: true },
)

watch(
  [stageItems, showSimpleView] as const,
  ([items, simple]) => {
    if (!route.path.includes('/clone/')) return
    cloneTopbar.show(simple ? [] : items.map(({ key, title, desc, done, active }) => ({ key, title, desc, done, active })))
  },
  { immediate: true, deep: true },
)

watch(
  requestedStageKey,
  (key) => {
    const nextKey = String(key || '').trim() as StageItem['key']
    if (!nextKey) return
    if (['analyze', 'variant', 'identity-grid', 'grid', 'video', 'compose'].includes(nextKey)) {
      selectStage(nextKey)
    }
    cloneTopbar.consumeRequestedStage()
  },
)

watch(
  [workflowStageKey, selectedStageKey],
  ([workflow, selected]) => {
    if (!autoRunIntentArmed.value) return
    if (selected !== 'identity-grid') return
    if (!['grid', 'video', 'compose'].includes(workflow)) return
    selectedStageKey.value = ''
  },
  { immediate: true },
)

watch(
  pipelineErrorContext,
  (next, prev) => {
    const text = [next?.provider, next?.model, next?.requestCapability, next?.responseSnippet].filter(Boolean).join(' / ')
    const prevText = [prev?.provider, prev?.model, prev?.requestCapability, prev?.responseSnippet].filter(Boolean).join(' / ')
    if (text && text !== prevText) pushRuntimeLog(tr('autoUi.k_7d3344fb9024', { p0: text }), 'info')
  },
  { deep: true },
)

onUnmounted(() => {
  cloneTopbar.hide()
  if (timer) window.clearInterval(timer)
  offRuntimeLog?.()
  offRuntimeLog = null
})
</script>

<template>
  <div class="clone-page">
    <section class="workspace-grid cw-shell">
      <CloneSimplePanel
        v-if="showSimpleView"
        :state="simpleState"
        :busy="simpleBusy"
        :reference-video-name="simpleReferenceName"
        :reference-video-url="simpleReferenceUrl"
        :product-name="simpleProductChosen ? selectedProductLibraryItem?.name || '' : ''"
        :product-image-url="simpleProductChosen ? selectedProductPreview : ''"
        :model-name="modelSnapshot?.name || ''"
        :model-image-url="modelPreview(modelSnapshot)"
        :phases="simplePhases"
        :status-text="simpleState === 'running' ? stageLog : ''"
        :error-text="simpleState === 'setup' ? errorText : generationFailureText"
        :final-video-url="simpleFinalVideoUrl"
        :final-poster-url="composePreviewPosterUrl"
        @pick-video="pickReferenceVideo"
        @pick-product="productModalOpen = true"
        @pick-model="modelModalOpen = true"
        @start="startSimpleClone"
        @resume="resumeSimpleClone"
        @open-advanced="viewModeOverride = 'advanced'"
        @reveal-output="revealFinalOutput"
        @open-output="openFinalOutput"
        @new-task="router.push('/clone')"
        @back="router.push('/clone')"
      />
      <div v-else class="main-column vg-scope cw">
        <div v-if="current?.id" class="cw-modebar" data-testid="clone-advanced-bar">
          <span class="cw-modebar__label"><SlidersHorizontal :size="14" />{{ tr('cloneUi.simple.advancedLabel') }}</span>
          <span class="cw-modebar__hint">{{ tr('cloneUi.simple.advancedHint') }}</span>
          <button class="vg-btn vg-btn--sm vg-btn--ghost" type="button" data-testid="clone-advanced-prompts" @click="openPromptManager('all')">{{ tr('cloneUi.promptManager.entry') }}</button>
          <button class="vg-btn vg-btn--sm" type="button" data-testid="clone-back-to-simple" @click="viewModeOverride = 'simple'">{{ tr('cloneUi.simple.backToSimple') }}</button>
        </div>
        <!-- ================= 01 参考分析 ================= -->
        <article v-if="visibleStageKey === 'analyze'" class="cw-step-view">
          <header class="cw-head">
            <span class="cw-head__no">01</span>
            <div class="cw-head__text">
              <h2>{{ tr('autoUi.k_070160e04cfa') }}</h2>
              <p>{{ tr('autoUi.k_3e20340c353f') }}</p>
            </div>
            <div class="cw-head__actions">
              <button class="vg-btn" type="button" :disabled="loading" @click="pickReferenceVideo">
                <Upload :size="15" />{{ referenceSourcePath ? tr('autoUi.k_afe2bfaa6eee') : tr('autoUi.k_f743536d6df3') }}
              </button>
              <button class="vg-btn vg-btn--primary" type="button" :disabled="loading" @click="referenceSourcePath ? createBlueprint() : pickReferenceVideo()">
                <Sparkles :size="15" />{{ analyzePrimaryButtonLabel }}
              </button>
            </div>
          </header>

          <div class="cw-analyze">
            <!-- reference video -->
            <section class="cw-card cw-analyze__video">
              <header class="cw-card__head">
                <h3>{{ tr('autoUi.k_ce9406ae8fc8') }}</h3>
                <span class="cw-card__hint" :title="referenceSourcePath ? tr('autoUi.k_c9ad1436b751') : tr('autoUi.k_607204bff35a')">{{ referenceSourcePath ? tr('autoUi.k_c9ad1436b751') : tr('autoUi.k_607204bff35a') }}</span>
              </header>
              <div class="cw-player cw-player--portrait">
                <video v-if="referenceSourcePath" :src="mediaUrl(referenceSourcePath)" controls preload="metadata"></video>
                <button v-else class="cw-drop" type="button" :disabled="loading" @click="pickReferenceVideo">
                  <span class="cw-drop__icon"><Upload :size="22" /></span>
                  <strong>{{ tr('autoUi.k_8704840e5b6a') }}</strong>
                  <small>{{ tr('autoUi.k_8542c9c4c761') }}</small>
                </button>
              </div>
              <dl class="cw-kv">
                <div><dt>{{ tr('autoUi.k_1275f6feb703') }}</dt><dd :title="isDraftingNewProject ? referenceVideoPath : current?.referenceVideoName">{{ safeText(isDraftingNewProject ? shortPath(referenceVideoPath) : current?.referenceVideoName, tr('autoUi.k_937d465574eb')) }}</dd></div>
                <div><dt>{{ tr('autoUi.k_3c7800e243ac') }}</dt><dd>{{ storyBeats.length || 0 }}</dd></div>
                <div>
                  <dt>{{ tr('autoUi.k_62e951a692ff') }}</dt>
                  <dd><span class="cw-state" :class="analyzeStageProgress >= 100 ? 'cw-state--ok' : loading ? 'cw-state--run' : 'cw-state--idle'"><i />{{ analyzeStageProgress >= 100 ? tr('autoUi.k_1f481168be32') : loading ? tr('autoUi.k_2c2a1493ca90') : tr('autoUi.k_605dc7e35e02') }}</span></dd>
                </div>
              </dl>
            </section>

            <!-- analysis -->
            <div class="cw-stack cw-analyze__result">
              <section class="cw-card">
                <header class="cw-card__head">
                  <h3>{{ tr('autoUi.k_ed3891236489') }}</h3>
                  <span class="cw-card__hint">{{ storyBeats.length ? tr('autoUi.k_411bdad5dc98', { p0: storyBeats.length }) : tr('autoUi.k_28bbf71875ea') }}</span>
                </header>
                <div v-if="storyBeats.length" class="cw-beats">
                  <div v-for="(item, index) in storyBeats" :key="item.id" class="cw-beat">
                    <div class="cw-beat__top">
                      <span class="cw-beat__no">{{ storyBeatDisplayIndex(item, index) }}</span>
                      <span class="cw-beat__time">{{ storyBeatRangeText(item, index) }}</span>
                    </div>
                    <strong>{{ localizePurpose(item.purpose) }}</strong>
                    <small>{{ shotReferenceLabel(item) }}</small>
                  </div>
                </div>
                <CloneStateCard v-else class="empty-state small-empty" :title="tr('autoUi.k_6390364017f6')" :description="tr('autoUi.k_7db04ef30936')" />
              </section>

              <section class="cw-card cw-card--grow">
                <header class="cw-card__head">
                  <h3>{{ tr('autoUi.k_2a33eaa96d0e') }}</h3>
                  <span class="cw-card__hint">{{ analyzeScriptLines.length ? tr('autoUi.k_75f7d1c9ae4f', { p0: analyzeScriptLines.length }) : tr('autoUi.k_472b66a0f2d0') }}</span>
                </header>
                <ol v-if="analyzeScriptLines.length" class="cw-script">
                  <li v-for="(line, index) in analyzeScriptLines" :key="`${index}-${line}`">
                    <span class="cw-script__no">{{ String(index + 1).padStart(2, '0') }}</span>
                    <div>
                      <span v-if="splitScriptLine(line).time" class="cw-script__time">{{ splitScriptLine(line).time }}</span>
                      <p>{{ splitScriptLine(line).text }}</p>
                    </div>
                  </li>
                </ol>
                <p v-else class="cw-muted-copy">{{ analyzeScriptPreview }}</p>
              </section>
            </div>

            <!-- project side -->
            <aside class="cw-stack cw-analyze__side">
              <section class="cw-card">
                <header class="cw-card__head"><h3>{{ tr('autoUi.k_4166d1b1467c') }}</h3></header>
                <div class="cw-field">
                  <span>{{ tr('autoUi.k_3e7255522b33') }}</span>
                  <strong>{{ safeText(current?.blueprint?.title || current?.referenceVideoName, tr('autoUi.k_96cb64ae6045')) }}</strong>
                </div>
                <div class="cw-flags">
                  <span class="cw-flag" :class="current?.runMode === 'auto' ? 'is-on' : ''"><Sparkles v-if="current?.runMode === 'auto'" :size="12" /><Hand v-else :size="12" />{{ current?.runMode === 'auto' ? tr('autoUi.k_49c1cdf32be8') : tr('autoUi.k_e1a420acee0f') }}</span>
                  <span class="cw-flag" :class="hasBoundModel ? 'is-on' : 'is-off'"><UserRound :size="12" />{{ hasBoundModel ? tr('autoUi.k_9fa4faa55db6') : tr('autoUi.k_ca3dd55eb098') }}</span>
                  <span class="cw-flag" :class="effectiveProductRefs.length ? 'is-on' : 'is-off'"><ImageIcon :size="12" />{{ effectiveProductRefs.length ? tr('autoUi.k_c8b458421614', { p0: effectiveProductRefs.length }) : tr('autoUi.k_ab8274a60c22') }}</span>
                </div>
              </section>

              <section class="cw-card">
                <header class="cw-card__head">
                  <h3>{{ tr('autoUi.k_77c468a45a48') }}</h3>
                  <button class="vg-btn vg-btn--sm" type="button" :disabled="modelLoading" @click="modelModalOpen = true">{{ tr('autoUi.k_be7dc2544329') }}</button>
                </header>
                <div class="cw-entity">
                  <span class="cw-entity__media">
                    <img v-if="modelPreview(modelSnapshot)" :src="modelPreview(modelSnapshot)" alt="model-preview" />
                    <UserRound v-else :size="22" />
                  </span>
                  <div class="cw-entity__copy">
                    <small>{{ tr('autoUi.k_200b9dbfd963') }}</small>
                    <strong>{{ safeText(modelSnapshot?.name, tr('autoUi.k_53e2db70167f')) }}</strong>
                    <span>{{ modelSnapshot?.id ? tr('autoUi.k_4d9e8c358e49') : tr('autoUi.k_b1a363b419c5') }}</span>
                  </div>
                </div>
              </section>

              <section class="cw-card">
                <header class="cw-card__head">
                  <h3>{{ tr('autoUi.k_188d1e2d5f79') }}</h3>
                  <span class="cw-state" :class="productSanitizationStatusClass === 'success' ? 'cw-state--ok' : productSanitizationStatusClass === 'danger' ? 'cw-state--err' : productSanitizationStatusClass === 'working' ? 'cw-state--run' : 'cw-state--idle'"><i />{{ productSanitizationStatusLabel }}</span>
                </header>
                <div class="cw-entity">
                  <span class="cw-entity__media">
                    <img v-if="selectedProductPreview" :src="selectedProductPreview" alt="product-preview" />
                    <Package v-else :size="22" />
                  </span>
                  <div class="cw-entity__copy">
                    <small>{{ tr('autoUi.k_caa411888696') }}</small>
                    <strong :title="boundProductDisplayName">{{ boundProductDisplayName }}</strong>
                    <span>{{ cloneProductBindingHint }}</span>
                  </div>
                </div>
                <div class="cw-subtle">
                  <small>{{ tr('autoUi.k_b609537c0a3f') }}</small>
                  <strong :title="selectedProductDisplayName">{{ selectedProductDisplayName }}</strong>
                  <span>{{ selectedProductBindingHint }}</span>
                </div>
                <div class="cw-btnrow">
                  <button class="vg-btn vg-btn--sm" type="button" @click="productModalOpen = true"><Package :size="14" />{{ tr('autoUi.k_f4d8d03ce5b4') }}</button>
                  <button class="vg-btn vg-btn--sm vg-btn--soft" type="button" :disabled="loading || !selectedProductId || !current?.id" @click="bindSelectedProduct"><Link2 :size="14" />{{ tr('autoUi.k_4f59a65e8f54') }}</button>
                </div>
                <div class="cw-field cw-field--row">
                  <span>{{ tr('autoUi.k_c417c63c9408') }}</span>
                  <strong>{{ cloneProductSnapshotLabel }}</strong>
                </div>
                <p v-if="originalProductRefs.length || effectiveProductRefs.length" class="cw-note">{{ cloneProductSnapshotHint }}</p>
                <div v-if="originalProductRefs.length || effectiveProductRefs.length" class="cw-seg">
                  <button type="button" :class="{ 'is-on': productRefPreviewMode === 'sanitized' }" :disabled="!effectiveProductRefs.length" @click="productRefPreviewMode = 'sanitized'">{{ tr('autoUi.k_7f3a812a9479') }}</button>
                  <button type="button" :class="{ 'is-on': productRefPreviewMode === 'original' }" :disabled="!originalProductRefs.length" @click="productRefPreviewMode = 'original'">{{ tr('autoUi.k_a0217cd1e435') }}</button>
                </div>
                <div v-if="visibleProductThumbs.length" class="cw-thumbs">
                  <span v-for="item in visibleProductThumbs.slice(0, 8)" :key="item" class="cw-thumbs__item" :title="item.split(/[/\\\\]/).pop()">
                    <img :src="previewImage(item)" alt="product-reference" />
                    <button v-if="productRefPreviewMode !== 'original'" class="cw-thumbs__remove" type="button" :disabled="loading" :title="tr('autoUi.k_3755f56f2f83')" @click.stop.prevent="removeProductImage(item)"><X :size="12" /></button>
                  </span>
                </div>
                <button class="vg-btn vg-btn--sm vg-btn--ghost cw-danger-link" type="button" :disabled="loading || !effectiveProductRefs.length" @click.stop.prevent="clearProductImages"><Trash2 :size="14" />{{ tr('autoUi.k_f8290c92d783') }}</button>
              </section>

              <section class="cw-card">
                <header class="cw-card__head">
                  <h3>{{ tr('autoUi.k_8f1a3358e56e') }}</h3>
                  <span class="cw-card__hint">{{ productAnalysisSections.length ? tr('autoUi.k_00f111551681') : tr('autoUi.k_86ba72ec4975') }}</span>
                </header>
                <template v-if="productAnalysisSnapshot">
                  <div class="cw-field cw-field--row">
                    <span>{{ tr('autoUi.k_8c0e804b9002') }}</span>
                    <strong>{{ safeText(productAnalysisSnapshot.category, tr('autoUi.k_face982a4aae')) }}</strong>
                  </div>
                  <dl class="cw-kv cw-kv--stack">
                    <div v-for="item in productAnalysisSections" :key="item.key"><dt>{{ item.title }}</dt><dd>{{ item.desc }}</dd></div>
                  </dl>
                  <div v-if="productAnalysisSnapshot.matchingRules.length" class="cw-rules">
                    <small>{{ tr('autoUi.k_f1c3fed4770a') }}</small>
                    <div><span v-for="rule in productAnalysisSnapshot.matchingRules" :key="rule">{{ rule }}</span></div>
                  </div>
                </template>
                <CloneStateCard v-else class="empty-state small-empty" :title="tr('autoUi.k_f372a7d84008')" :description="tr('autoUi.k_d650f5947a1e')" />
              </section>
            </aside>
          </div>
        </article>

        <!-- ================= 02 脚本生成 ================= -->
        <article v-if="visibleStageKey === 'variant'" class="cw-step-view">
          <header class="cw-head">
            <span class="cw-head__no">02</span>
            <div class="cw-head__text">
              <h2>{{ tr('autoUi.k_239d48dea044') }}</h2>
              <p>{{ tr('autoUi.k_e48255e2ceca') }}</p>
            </div>
            <div class="cw-head__actions">
              <button class="vg-btn" type="button" :disabled="loading || !current?.id || !effectiveProductRefs.length || !hasBoundModel" @click="autoRunToStoryboardVideos">
                <Play :size="15" />{{ autoFlowRunning ? tr('autoUi.k_fb63b65d5637') : current?.runMode === 'auto' ? tr('autoUi.k_263d2e2109a4') : tr('autoUi.k_df815f635a0d') }}
              </button>
              <label class="cw-count">
                <span>{{ tr('autoUi.k_b9ae89319036') }}</span>
                <input v-model.number="variantCount" type="number" min="1" max="6" />
              </label>
              <button class="vg-btn vg-btn--primary" type="button" :disabled="loading || !current?.id" @click="generateScriptVariants"><Sparkles :size="15" />{{ tr('autoUi.k_ed70ccdd3b92') }}</button>
            </div>
          </header>

          <div class="cw-split">
            <section class="cw-stack">
              <div class="cw-metrics">
                <div class="cw-metric"><span>{{ tr('autoUi.k_4a2fcce5030a') }}</span><strong>{{ scriptVariants.length }}</strong><small>{{ tr('autoUi.k_79c74f41ca9e') }} {{ scriptVariants.length }} {{ tr('autoUi.k_98c1b3e34c1b') }}</small></div>
                <div class="cw-metric"><span>{{ tr('autoUi.k_7f06ec27ae46') }}</span><strong :class="selectedVariantId ? 'is-ok' : ''">{{ selectedVariantId ? tr('autoUi.k_0a3020158512') : tr('autoUi.k_53e2db70167f') }}</strong><small>{{ selectedVariantId ? tr('autoUi.k_a53e25aa8df1') : tr('autoUi.k_e96de04f49c6') }}</small></div>
              </div>

              <div v-if="scriptVariants.length" class="cw-variants">
                <button
                  v-for="item in scriptVariants"
                  :key="item.id"
                  class="cw-variant"
                  :class="{ 'is-selected': selectedVariantId === item.id }"
                  type="button"
                  @click="selectScriptVariant(item.id)"
                >
                  <span class="cw-score" :style="{ '--score': Math.max(0, Math.min(10, item.score)) * 10 }"><b>{{ item.score.toFixed(1) }}</b></span>
                  <div class="cw-variant__body">
                    <div class="cw-variant__title">
                      <strong>{{ item.title }}</strong>
                      <span class="cw-state" :class="selectedVariantId === item.id ? 'cw-state--ok' : 'cw-state--idle'"><i />{{ selectedVariantId === item.id ? tr('autoUi.k_0a3020158512') : tr('autoUi.k_ed15fd8c6ccb') }}</span>
                    </div>
                    <p>{{ item.summary }}</p>
                    <small class="cw-variant__reason">{{ item.reason }}</small>
                    <ol v-if="item.shotScripts?.length && selectedVariantId === item.id" class="cw-variant__shots">
                      <li v-for="shot in item.shotScripts" :key="`${item.id}-${shot.shotId}`">
                        <span>{{ safeText(shot.timeRange, tr('autoUi.k_65f2f856e95d', { p0: shot.shotIndex + 1 })) }}</span>
                        <p>{{ String(shot.scriptText || '').startsWith(String(shot.timeRange || '~')) ? String(shot.scriptText).slice(String(shot.timeRange).length).trim() : shot.scriptText }}</p>
                      </li>
                    </ol>
                    <small v-else-if="item.shotScripts?.length" class="cw-variant__more">{{ item.shotScripts.length }} {{ tr('autoUi.k_bce2ef61514a') }}</small>
                  </div>
                </button>
              </div>
              <CloneStateCard v-else class="empty-state section-empty" :title="tr('autoUi.k_1f81d16ba9a3')" :description="tr('autoUi.k_bd3fa57462c3')" />
            </section>

            <aside class="cw-stack cw-sticky">
              <section class="cw-card cw-card--accent">
                <header class="cw-card__head"><h3>{{ tr('autoUi.k_8221bf9d729f') }}</h3></header>
                <div class="cw-hero-score">
                  <span class="cw-score cw-score--lg" :style="{ '--score': Math.max(0, Math.min(10, selectedVariantCandidate?.score || 0)) * 10 }"><b>{{ selectedVariantCandidate?.score?.toFixed(1) || '0.0' }}</b></span>
                  <strong>{{ safeText(selectedVariantCandidate?.title, tr('autoUi.k_758dc6dc197b')) }}</strong>
                </div>
                <p class="cw-body-copy">{{ safeText(selectedVariantCandidate?.summary, tr('autoUi.k_75bafc33692e')) }}</p>
                <p class="cw-note">{{ safeText(selectedVariantCandidate?.reason, tr('autoUi.k_b413cad5257d')) }}</p>
                <button class="vg-btn vg-btn--primary vg-btn--block" type="button" :disabled="!selectedVariantCandidate" @click="selectedVariantCandidate ? selectScriptVariant(selectedVariantCandidate.id) : undefined">
                  <Check :size="15" />{{ tr('autoUi.k_96fe1ffdfa89') }}
                </button>
              </section>
            </aside>
          </div>
        </article>

        <!-- ================= 03 身份定妆图 ================= -->
        <article v-if="visibleStageKey === 'identity-grid'" class="cw-step-view">
          <header class="cw-head">
            <span class="cw-head__no">03</span>
            <div class="cw-head__text">
              <h2>{{ tr('autoUi.k_54f65b6b0c67') }}</h2>
              <p>{{ tr('autoUi.k_4da3b7faacaa') }}</p>
            </div>
            <div class="cw-head__actions">
              <button class="vg-btn" type="button" :disabled="identityGridPromptPreviewLoading || !current?.id" @click="loadIdentityGridPromptPreview(true, true)">
                <FileText :size="15" />{{ identityGridPromptPreviewLoading ? tr('autoUi.k_ce56f617e402') : tr('autoUi.k_896a398739bb') }}
              </button>
              <button class="vg-btn" type="button" :disabled="!(identityGridPromptPreview?.prompt || current?.projectIdentityGridPromptPreview?.prompt)" @click="copyPromptText(identityGridPromptPreview?.prompt || current?.projectIdentityGridPromptPreview?.prompt || '', tr('autoUi.k_abc7750ecb1f'))">
                <Copy :size="15" />{{ tr('autoUi.k_57459c07244a') }}
              </button>
              <button class="vg-btn vg-btn--primary" type="button" :disabled="loading || !current?.id || !hasBoundModel || !effectiveProductRefs.length" @click="generateProjectIdentityGrid">
                <Sparkles :size="15" />{{ hasProjectIdentityGrid ? tr('autoUi.k_e33a423416a9') : tr('autoUi.k_7d1e8e131273') }}
              </button>
            </div>
          </header>
          <p class="cw-banner"><Info :size="14" />{{ tr('autoUi.k_5467275a0a9c') }}</p>

          <div class="cw-identity">
            <section class="cw-card">
              <header class="cw-card__head">
                <h3>{{ tr('autoUi.k_ca9a6d04438b') }}</h3>
                <span class="cw-state" :class="current?.projectIdentityGridStatus === 'done' ? 'cw-state--ok' : current?.projectIdentityGridStatus === 'generating' ? 'cw-state--run' : current?.projectIdentityGridStatus === 'failed' ? 'cw-state--err' : 'cw-state--idle'"><i />{{ current?.projectIdentityGridStatus === 'done' ? tr('autoUi.k_f2afde8960a6') : current?.projectIdentityGridStatus === 'generating' ? tr('autoUi.k_57c08c730a51') : current?.projectIdentityGridStatus === 'failed' ? tr('autoUi.k_64ba75d9d600') : tr('autoUi.k_aef4104370ae') }}</span>
              </header>
              <button class="cw-canvas" type="button" :disabled="!current?.projectIdentityGridPath" @click="openIdentityGridPreview">
                <img v-if="current?.projectIdentityGridPath" :src="previewImage(current.projectIdentityGridPath, current.projectIdentityGridUpdatedAt)" :alt="tr('autoUi.k_54f65b6b0c67')">
                <span v-else class="cw-canvas__empty"><ImageIcon :size="26" /><strong>{{ tr('autoUi.k_be185dd5a7c7') }}</strong><small>{{ tr('autoUi.k_4e8bd6a46ac7') }}</small></span>
                <span v-if="current?.projectIdentityGridPath" class="cw-canvas__zoom"><Maximize2 :size="13" />{{ tr('autoUi.k_f27060c8e9f6') }}</span>
              </button>
            </section>
            <aside class="cw-stack">
              <section class="cw-card">
                <header class="cw-card__head"><h3>{{ tr('autoUi.k_a2645b7a4aea') }}</h3></header>
                <p class="cw-body-copy">{{ tr('autoUi.k_c2d8cda2bae5') }}</p>
                <dl class="cw-kv">
                  <div><dt>{{ tr('autoUi.k_1b089e8482c7') }}</dt><dd>{{ effectiveProductRefs.length }}</dd></div>
                  <div><dt>{{ tr('autoUi.k_39dab49974bf') }}</dt><dd><span class="cw-state" :class="hasBoundModel ? 'cw-state--ok' : 'cw-state--err'"><i />{{ hasBoundModel ? tr('autoUi.k_b3addb5e3f54') : tr('autoUi.k_143b1332cb1f') }}</span></dd></div>
                </dl>
                <div v-if="(current?.projectIdentityGridPromptPreview?.gridUsagePlan || []).length" class="cw-usage">
                  <small>{{ tr('autoUi.k_7c49c8f25a7a') }}</small>
                  <ul><li v-for="plan in current?.projectIdentityGridPromptPreview?.gridUsagePlan || []" :key="plan">{{ plan }}</li></ul>
                </div>
              </section>
              <button class="vg-btn vg-btn--primary vg-btn--block vg-btn--lg" type="button" :disabled="!hasProjectIdentityGrid" @click="selectStage('grid')">{{ tr('autoUi.k_c5f3b41eeba8') }}<ArrowRight :size="16" /></button>
            </aside>
          </div>
        </article>

        <!-- ================= 04 分镜设计 ================= -->
        <article v-if="visibleStageKey === 'grid'" class="cw-step-view">
          <header class="cw-head">
            <span class="cw-head__no">04</span>
            <div class="cw-head__text">
              <h2>{{ tr('autoUi.k_3a87e98554a1') }}</h2>
              <p>{{ tr('autoUi.k_37f4224e223f') }}</p>
            </div>
            <div class="cw-head__actions">
              <button class="vg-btn" type="button" :disabled="loading || !current?.id" @click="refreshCurrentProject"><Save :size="15" />{{ tr('autoUi.k_61bc0b0ca8b1') }}</button>
              <button class="vg-btn vg-btn--primary" type="button" :disabled="loading || !canGenerateStoryboardFrames" @click="storyboardFrames.length ? enterVideoStageAndAutoSubmit('manual_next_step') : generateStoryboardGrids()">
                {{ storyboardFrames.length ? tr('autoUi.k_ea0ef2ae7245') : tr('autoUi.k_266542f0ab19') }}<ArrowRight :size="15" />
              </button>
            </div>
          </header>

          <div class="cw-split cw-split--wide">
            <section class="cw-card cw-card--flush">
              <div class="cw-toolbar">
                <label class="cw-check">
                  <input type="checkbox" :checked="storyboardDesignRows.length > 0 && selectedStoryboardShotIds.length === storyboardDesignRows.length" @change="toggleSelectAllStoryboardShots" />
                  <span>{{ selectedStoryboardShotIds.length ? `${selectedStoryboardShotIds.length} / ${storyboardDesignRows.length}` : `${storyboardDesignRows.length} ${tr('autoUi.k_bce2ef61514a')}` }}</span>
                </label>
                <span class="cw-toolbar__spacer" />
                <button class="vg-btn vg-btn--sm" type="button" :disabled="loading || regeneratingFailedStoryboardFrames || !failedStoryboardFrames.length" @click="regenerateFailedStoryboardFrames"><RotateCw :size="13" />{{ failedStoryboardActionText }}</button>
                <button class="vg-btn vg-btn--sm" type="button" :disabled="loading || !selectedStoryboardShotIds.length || selectedStoryboardShotIds.every((shotId) => regeneratingStoryboardShotIds.includes(shotId))" @click="regenerateSelectedStoryboardFrames"><RotateCw :size="13" />{{ selectedStoryboardActionText }}</button>
                <button class="vg-btn vg-btn--sm" type="button" :disabled="loading || queryingStoryboardFrames || !pendingStoryboardFrames.length" @click="batchQueryPendingStoryboardFrames"><Search :size="13" />{{ pendingStoryboardActionText }}</button>
              </div>
              <p class="cw-banner cw-banner--inset"><Info :size="14" />{{ tr('autoUi.k_a2480e598930') }}</p>

              <div class="cw-table cw-table--frames">
                <div class="cw-table__head">
                  <span />
                  <span>{{ tr('autoUi.k_c7d1925fd5af') }}</span>
                  <span>{{ tr('autoUi.k_695dd5f4b7d4') }}</span>
                  <span>{{ tr('autoUi.k_29d0552d2e4c') }}</span>
                  <span>{{ tr('autoUi.k_6867f7b4537a') }}</span>
                  <span>{{ tr('autoUi.k_3be5bb46d065') }}</span>
                  <span>{{ tr('autoUi.k_5e64b9174ce0') }}</span>
                  <span class="is-end">{{ tr('autoUi.k_f3ea6d345e2a') }}</span>
                </div>
                <div
                  v-for="row in storyboardDesignRows"
                  :key="row.shotId"
                  class="cw-row"
                  :class="{ 'is-active': selectedShotId === row.shotId, 'is-working': row.isRegenerating, 'is-failed': Boolean(row.error) }"
                  role="button"
                  tabindex="0"
                  @click="selectedShotId = row.shotId"
                  @keydown.enter.prevent="selectedShotId = row.shotId"
                  @keydown.space.prevent="selectedShotId = row.shotId"
                >
                  <span class="cw-row__check" @click.stop><input type="checkbox" :checked="selectedStoryboardShotIds.includes(row.shotId)" @change="toggleStoryboardShotSelection(row.shotId)" /></span>
                  <span class="cw-index"><b>{{ String(row.shotIndex).padStart(2, '0') }}</b><small>{{ row.scriptCode }}</small></span>
                  <span class="cw-frame">
                    <span class="cw-frame__thumb">
                      <img v-if="row.imagePath" :src="previewImage(row.imagePath, row.updatedAt)" :alt="safeText(shotLabel(row.shotId), tr('autoUi.k_fcad7fe371b8'))">
                      <span v-else class="cw-frame__empty">{{ row.isRegenerating ? tr('autoUi.k_57c08c730a51') : row.error ? tr('autoUi.k_3e3c8068bb0e') : tr('autoUi.k_aef4104370ae') }}</span>
                    </span>
                    <span class="cw-frame__copy">
                      <strong :title="row.promptText">{{ row.promptText }}</strong>
                      <span class="cw-words"><em v-for="word in row.tags" :key="`${row.shotId}-${word}`">{{ word }}</em></span>
                      <small v-if="row.isRegenerating" class="is-run">{{ tr('autoUi.k_b99b4b26222c') }}</small>
                      <small v-if="row.retryCount > 0">{{ tr('autoUi.k_a3477f849226') }} {{ row.retryCount }} {{ tr('autoUi.k_5e5b8169eee6') }}</small>
                    </span>
                  </span>
                  <span><span class="cw-state" :class="row.isRegenerating ? 'cw-state--run' : row.error ? 'cw-state--err' : row.imagePath ? 'cw-state--ok' : 'cw-state--idle'"><i />{{ row.statusText }}</span></span>
                  <span class="cw-cell">{{ row.sceneText }}</span>
                  <span class="cw-cell">{{ row.cameraText }}</span>
                  <span class="cw-cell cw-cell--muted">{{ row.voiceText }}</span>
                  <span class="cw-actions">
                    <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="!shotFrameMap[row.shotId]?.imagePath" :title="tr('autoUi.k_de61aa8e1cbc')" @click.stop="shotFrameMap[row.shotId] && openFramePreview(shotFrameMap[row.shotId])"><Maximize2 :size="14" /></button>
                    <button class="vg-icon-btn vg-icon-btn--sm" :class="{ 'is-on': row.locked }" type="button" :disabled="loading" :title="row.locked ? tr('autoUi.k_eafaffdf18b7') : tr('autoUi.k_8a91cefeb3fb')" @click.stop="toggleFrameLock(row.shotId)"><Lock v-if="row.locked" :size="14" /><LockOpen v-else :size="14" /></button>
                    <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="shotImagePromptPreviewLoading || row.isRegenerating" :title="tr('autoUi.k_ca445a4a0ad9')" @click.stop="selectedShotId = row.shotId; loadShotImagePromptPreview(row.shotId, true, true)"><FileText :size="14" /></button>
                    <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="loading || row.isRegenerating || regeneratingFailedStoryboardFrames" :title="row.isRegenerating ? tr('autoUi.k_487e1c4e2927') : tr('autoUi.k_2e19057052a3')" @click.stop="regenerateStoryboardFrame(row.shotId)"><LoaderCircle v-if="row.isRegenerating" :size="14" class="vg-spin" /><RotateCw v-else :size="14" /></button>
                  </span>
                </div>
              </div>
            </section>

            <aside class="cw-stack cw-sticky">
              <section class="cw-card">
                <header class="cw-card__head">
                  <h3>{{ tr('autoUi.k_76917c58e1ee') }}</h3>
                  <span class="cw-card__hint">{{ selectedStoryboardRow ? tr('autoUi.k_24f7d6982256', { p0: String(selectedStoryboardRow.shotIndex).padStart(2, '0') }) : tr('autoUi.k_0601c4d9d5c0') }}</span>
                  <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="!selectedStoryboardFrame?.imagePath" :title="tr('autoUi.k_c5d7f819baf3')" @click="selectedStoryboardFrame && openFramePreview(selectedStoryboardFrame)"><Maximize2 :size="14" /></button>
                </header>
                <div class="cw-player cw-player--portrait cw-player--image">
                  <img v-if="selectedStoryboardFrame?.imagePath" :src="previewImage(selectedStoryboardFrame.imagePath, selectedStoryboardFrame.updatedAt)" :alt="safeText(shotLabel(selectedStoryboardFrame.shotId), tr('autoUi.k_76917c58e1ee'))">
                  <span v-else class="cw-canvas__empty"><ImageIcon :size="24" /><strong>{{ selectedStoryboardRow?.error ? tr('autoUi.k_64ba75d9d600') : tr('autoUi.k_4363468b43bf') }}</strong><small>{{ selectedStoryboardRow?.error || tr('autoUi.k_961be9633733') }}</small></span>
                </div>
                <p v-if="selectedStoryboardRow" class="cw-body-copy cw-body-copy--strong">{{ selectedStoryboardRow.promptText }}</p>
                <dl class="cw-kv">
                  <div><dt>{{ tr('autoUi.k_29d0552d2e4c') }}</dt><dd>{{ selectedStoryboardRow?.durationText || '--' }}</dd></div>
                  <div><dt>{{ tr('autoUi.k_6867f7b4537a') }}</dt><dd>{{ selectedStoryboardRow?.sceneText || '--' }}</dd></div>
                  <div><dt>{{ tr('autoUi.k_3be5bb46d065') }}</dt><dd>{{ selectedStoryboardRow?.cameraText || '--' }}</dd></div>
                </dl>
                <div v-if="selectedStoryboardRow?.tags?.length" class="cw-words"><em v-for="word in selectedStoryboardRow?.tags || []" :key="`preview-${word}`">{{ word }}</em></div>
                <div v-if="selectedStoryboardErrorText" class="cw-alert">
                  <strong><AlertTriangle :size="14" />{{ tr('autoUi.k_ce8a92e25f09') }} · {{ selectedStoryboardErrorTitle }}</strong>
                  <p>{{ selectedStoryboardErrorText }}</p>
                  <small>{{ tr('autoUi.k_aba23c4b2667') }}：{{ selectedStoryboardErrorAdvice }}</small>
                  <button v-if="selectedStoryboardErrorAction === 'go-models' || selectedStoryboardErrorAction === 'go-identity-grid'" class="vg-btn vg-btn--sm" type="button" @click="handleStoryboardErrorAction">{{ selectedStoryboardErrorAction === 'go-identity-grid' ? tr('autoUi.k_c02ac22e1593') : tr('autoUi.k_5d3cd4e394f6') }}</button>
                </div>
              </section>
              <section class="cw-card">
                <header class="cw-card__head">
                  <h3>{{ tr('autoUi.k_79d85c0b1ac0') }}</h3>
                  <span class="cw-card__hint">{{ selectedStoryboardBeat ? storyBeatRangeText(selectedStoryboardBeat, Number((selectedStoryboardRow?.shotIndex || 1) - 1)) : tr('autoUi.k_104ca25508ce') }}</span>
                </header>
                <p class="cw-body-copy">{{ selectedStoryboardBeat?.scriptSegment || selectedStoryboardRow?.voiceText || tr('autoUi.k_aa90b861324e') }}</p>
                <button class="vg-btn vg-btn--sm" type="button" :disabled="shotImagePromptPreviewLoading || !selectedStoryboardRow" @click="loadShotImagePromptPreview(selectedStoryboardRow?.shotId, true, true)"><FileText :size="14" />{{ shotImagePromptPreviewLoading ? tr('autoUi.k_ce56f617e402') : tr('autoUi.k_ca445a4a0ad9') }}</button>
              </section>
            </aside>
          </div>
        </article>

        <!-- ================= 05 分镜视频 ================= -->
        <article v-if="visibleStageKey === 'video'" class="cw-step-view">
          <header class="cw-head">
            <span class="cw-head__no">05</span>
            <div class="cw-head__text">
              <h2>{{ tr('cloneView.videoStage.title') }}</h2>
              <p :title="videoStageDescription">{{ shotVideoProgressHint }}</p>
            </div>
            <div class="cw-head__actions">
              <button class="vg-btn" type="button" :disabled="loading" @click="selectStage('compose')">{{ tr('autoUi.k_15d0c050b154') }}<ArrowRight :size="14" /></button>
              <button class="vg-btn vg-btn--primary" type="button" :disabled="loading || !current?.id" @click="generateShotVideos"><LoaderCircle v-if="loading" :size="15" class="vg-spin" /><Clapperboard v-else :size="15" />{{ tr('cloneView.videoStage.primaryAction') }}</button>
            </div>
          </header>

          <section v-if="shotVideoOutputs.length" class="cw-vprog" :class="{ 'is-done': shotVideoProgress.total && shotVideoProgress.done === shotVideoProgress.total }">
            <div class="cw-vprog__ring" :style="{ '--p': `${shotVideoProgress.percent}%` }">
              <strong>{{ shotVideoProgress.percent }}<small>%</small></strong>
            </div>
            <div class="cw-vprog__body">
              <div class="cw-vprog__line">
                <strong>{{ tr('cloneUi.video.progress', { done: shotVideoProgress.done, total: shotVideoProgress.total }) }}</strong>
                <span v-if="shotVideoProgress.running" class="cw-state cw-state--run"><i />{{ tr('cloneUi.video.running', { n: shotVideoProgress.running }) }}</span>
                <span v-if="shotVideoProgress.failed" class="cw-state cw-state--err"><i />{{ tr('cloneUi.video.failed', { n: shotVideoProgress.failed }) }}</span>
                <span v-if="shotVideoProgress.waiting" class="cw-state"><i />{{ tr('cloneUi.video.waiting', { n: shotVideoProgress.waiting }) }}</span>
              </div>
              <div class="cw-vprog__track" role="list">
                <button
                  v-for="item in shotVideoOutputs"
                  :key="`seg-${item.shotId}`"
                  type="button"
                  role="listitem"
                  class="cw-vprog__seg"
                  :class="[`is-${shotVideoRowViews[item.shotId]?.tone || 'idle'}`, { 'is-active': selectedShotOutput?.shotId === item.shotId }]"
                  :title="`${tr('cloneUi.video.jumpTo', { n: (shotVideoRowViews[item.shotId]?.index ?? 0) + 1 })} · ${shotVideoRowViews[item.shotId]?.title || ''}`"
                  @click="selectedShotId = item.shotId"
                />
              </div>
            </div>
          </section>

          <div class="cw-settings">
            <div class="cw-settings__copy">
              <strong><SlidersHorizontal :size="14" />{{ tr('autoUi.k_0b14bbf64906') }}</strong>
              <span>{{ tr('autoUi.k_7fb18dbeec08') }}</span>
            </div>
            <span class="cw-settings__meta">{{ tr('autoUi.k_d7f0f988776f') }}{{ runModeLabel }} · {{ tr('autoUi.k_75d859e8ba00') }}{{ shotVideoOutputs.length }} {{ tr('autoUi.k_7800d67eeb34') }}{{ failedShotOutputs.length }}</span>
            <label class="cw-select">
              <span>{{ tr('autoUi.k_c27f341ce598') }}</span>
              <select class="vg-input vg-select vg-input--sm" :value="videoRenderAspectRatio" :disabled="loading || !current?.id || savingVideoRenderHints" @change="handleVideoAspectRatioChange(($event.target as HTMLSelectElement).value as VideoRenderAspectRatio)">
                <option value="9:16">9:16</option>
                <option value="16:9">16:9</option>
              </select>
            </label>
            <label class="cw-select">
              <span>{{ tr('autoUi.k_94a6711f2408') }}</span>
              <select class="vg-input vg-select vg-input--sm" :value="videoRenderResolution" :disabled="loading || !current?.id || savingVideoRenderHints" @change="handleVideoResolutionChange(($event.target as HTMLSelectElement).value as VideoRenderResolution)">
                <option v-for="item in filteredVideoRenderResolutionOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
          </div>

          <div v-if="shotVideoOutputs.length" class="cw-split cw-split--wide">
            <section class="cw-card cw-card--flush">
              <div class="cw-toolbar">
                <div class="cw-seg cw-seg--inline">
                  <button type="button" :class="{ 'is-on': selectedShotFilter === 'all' }" @click="selectedShotFilter = 'all'">{{ tr('cloneView.videoStage.filters.all') }} <em>{{ shotVideoOutputs.length }}</em></button>
                  <button type="button" :class="{ 'is-on': selectedShotFilter === 'ready' }" @click="selectedShotFilter = 'ready'">{{ tr('cloneView.videoStage.filters.ready') }} <em>{{ completedShotCount }}</em></button>
                  <button type="button" :class="{ 'is-on': selectedShotFilter === 'failed' }" @click="selectedShotFilter = 'failed'">{{ tr('cloneView.videoStage.filters.failed') }} <em>{{ failedShotOutputs.length }}</em></button>
                  <button type="button" :class="{ 'is-on': selectedShotFilter === 'pending' }" @click="selectedShotFilter = 'pending'">{{ tr('cloneView.videoStage.filters.pending') }} <em>{{ pendingShotCount }}</em></button>
                </div>
                <span class="cw-toolbar__spacer" />
                <button class="vg-btn vg-btn--sm" type="button" :disabled="loading || regeneratingFailedShotVideos || !failedShotOutputs.length" @click="regenerateFailedShotVideos"><RotateCw :size="13" />{{ failedShotActionText }}</button>
                <button class="vg-btn vg-btn--sm" type="button" :disabled="loading || !hasRemotePendingShotSync" @click="syncPendingShotVideos()"><Search :size="13" />{{ tr('autoUi.k_cc874aad6450') }}</button>
                <button class="vg-btn vg-btn--sm" type="button" :disabled="loading || !current?.id" @click="refreshRemoteStatus()"><RefreshCw :size="13" :class="{ 'vg-spin': loading }" />{{ tr('autoUi.k_b89f115ab421') }}</button>
              </div>
              <div v-if="failedShotOutputs.length || continueQueryableShotCount || missingTaskIdShotCount || Number(lastShotVideoFailureBreakdown?.remoteTimeout || 0) > 0 || Number(lastShotVideoFailureBreakdown?.downloadFailed || 0) > 0" class="cw-statline">
                <span v-if="failedShotOutputs.length">{{ tr('cloneView.videoStage.stats.failedPending') }} <b>{{ failedShotOutputs.length }}</b></span>
                <span v-if="continueQueryableShotCount">{{ tr('autoUi.k_e4baf28f5192') }}<b>{{ continueQueryableShotCount }}</b></span>
                <span v-if="missingTaskIdShotCount">{{ tr('autoUi.k_366462f4d6fb') }}<b>{{ missingTaskIdShotCount }}</b></span>
                <span v-if="Number(lastShotVideoFailureBreakdown?.remoteTimeout || 0) > 0">{{ tr('autoUi.k_76a00d6e4987') }}<b>{{ Number(lastShotVideoFailureBreakdown?.remoteTimeout || 0) }}</b></span>
                <span v-if="Number(lastShotVideoFailureBreakdown?.downloadFailed || 0) > 0">{{ tr('autoUi.k_b0578cac28c2') }}<b>{{ Number(lastShotVideoFailureBreakdown?.downloadFailed || 0) }}</b></span>
              </div>

              <div class="cw-table cw-table--videos">
                <div class="cw-table__head" role="row">
                  <span>{{ tr('cloneView.videoStage.columns.shot') }}</span>
                  <span>{{ tr('cloneView.videoStage.columns.frame') }}</span>
                  <span>{{ tr('cloneView.videoStage.columns.script') }}</span>
                  <span>{{ tr('cloneView.videoStage.columns.duration') }}</span>
                  <span>{{ tr('cloneView.videoStage.columns.motion') }}</span>
                  <span>{{ tr('cloneView.videoStage.columns.status') }}</span>
                  <span class="is-end">{{ tr('cloneView.videoStage.columns.actions') }}</span>
                </div>
                <div
                  v-for="item in filteredShotOutputs"
                  :key="item.shotId"
                  v-memo="[item.shotId, item.status, item.videoPath, item.videoUrl, item.taskId, item.error, item.remoteStatus, item.retryCount, item.durationSec, shotFrameMap[item.shotId]?.imagePath, shotFrameMap[item.shotId]?.updatedAt, shotVideoRowViews[item.shotId]?.title, shotVideoRowViews[item.shotId]?.detail, shotVideoRowViews[item.shotId]?.tone, shotVideoRowViews[item.shotId]?.summary, shotVideoRowViews[item.shotId]?.motion, shotVideoRowViews[item.shotId]?.continuity, selectedShotOutput?.shotId === item.shotId, regeneratingShotVideoIds.includes(item.shotId), forceDownloadingShotVideoIds.includes(item.shotId), shotVideoPromptPreviewLoading, loading]"
                  class="cw-row"
                  :class="{ 'is-active': selectedShotOutput?.shotId === item.shotId, 'is-failed': shotVideoRowViews[item.shotId]?.tone === 'err', 'is-working': shotVideoRowViews[item.shotId]?.tone === 'run' }"
                  role="button"
                  tabindex="0"
                  @click="selectedShotId = item.shotId"
                  @keydown.enter.prevent="selectedShotId = item.shotId"
                  @keydown.space.prevent="selectedShotId = item.shotId"
                >
                  <span class="cw-index"><b>{{ String((shotVideoOutputIndexMap[item.shotId] ?? 0) + 1).padStart(2, '0') }}</b><small>{{ tr('autoUi.k_21468aa05330', { p0: (shotVideoOutputIndexMap[item.shotId] ?? 0) + 1 }) }}</small></span>
                  <span class="cw-frame__thumb cw-frame__thumb--sm cw-vthumb" :class="`is-${shotVideoRowViews[item.shotId]?.tone || 'idle'}`">
                    <img v-if="shotFrameMap[item.shotId]?.imagePath" :src="previewImage(shotFrameMap[item.shotId]?.imagePath, shotFrameMap[item.shotId]?.updatedAt)" :alt="safeText(shotLabel(item.shotId), tr('autoUi.k_fcad7fe371b8'))" loading="lazy" decoding="async" />
                    <span v-else class="cw-frame__empty">{{ tr('cloneView.videoStage.noFrame') }}</span>
                    <span v-if="shotVideoRowViews[item.shotId]?.tone === 'run'" class="cw-vthumb__veil"><LoaderCircle :size="16" class="vg-spin" /></span>
                    <span v-else-if="shotVideoRowViews[item.shotId]?.tone === 'err'" class="cw-vthumb__veil is-err"><AlertTriangle :size="15" /></span>
                    <span v-else-if="item.videoPath" class="cw-frame__play"><Play :size="12" /></span>
                  </span>
                  <span class="cw-frame__copy">
                    <strong :title="shotVideoRowViews[item.shotId]?.summary">{{ shotVideoRowViews[item.shotId]?.summary }}</strong>
                    <small>{{ safeText(shotLabel(item.shotId), tr('autoUi.k_fcad7fe371b8')) }}<em v-if="shotVideoRowViews[item.shotId]?.continuity" class="cw-vlink" :title="shotVideoRowViews[item.shotId]?.continuityHint"><Link2 :size="11" />{{ shotVideoRowViews[item.shotId]?.continuity }}</em></small>
                  </span>
                  <span class="cw-cell cw-num">{{ formatDuration(item.durationSec) }}</span>
                  <span class="cw-cell">{{ shotVideoRowViews[item.shotId]?.motion }}</span>
                  <span class="cw-shotstate">
                    <span class="cw-state" :class="`cw-state--${shotVideoRowViews[item.shotId]?.tone || 'idle'}`"><i />{{ shotVideoRowViews[item.shotId]?.title }}</span>
                    <small :title="shotVideoRowViews[item.shotId]?.detail">{{ shotVideoRowViews[item.shotId]?.detail }}<template v-if="typeof item.retryCount === 'number'"> · {{ shotRetryStatusText(item) }}</template></small>
                  </span>
                  <span class="cw-actions">
                    <button class="vg-icon-btn vg-icon-btn--sm" type="button" :title="tr('autoUi.k_de61aa8e1cbc')" @click.stop="selectedShotId = item.shotId"><Eye :size="14" /></button>
                    <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="shotVideoPromptPreviewLoading" :title="tr('autoUi.k_2f0bb1238738')" @click.stop="selectedShotId = item.shotId; loadShotVideoPromptPreview(item.shotId, true, true)"><FileText :size="14" /></button>
                    <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="!current?.id || regeneratingShotVideoIds.includes(item.shotId)" :title="regeneratingShotVideoIds.includes(item.shotId) ? tr('autoUi.k_7038c8e1829a') : tr('autoUi.k_2e19057052a3')" @click.stop="regenerateShotClip(item.shotId)"><LoaderCircle v-if="regeneratingShotVideoIds.includes(item.shotId)" :size="14" class="vg-spin" /><RotateCw v-else :size="14" /></button>
                    <button v-if="canForceDownloadShot(item)" class="vg-btn vg-btn--sm" type="button" :disabled="forceDownloadingShotVideoIds.includes(item.shotId)" @click.stop="forceDownloadShotVideoResult(item.shotId)">{{ forceDownloadingShotVideoIds.includes(item.shotId) ? tr('autoUi.k_8185f33c5e78') : tr('autoUi.k_ef3781caac2d') }}</button>
                    <button v-if="canContinueSyncShot(item)" class="vg-btn vg-btn--sm" type="button" :disabled="loading" @click.stop="syncFailedShotVideo(item.shotId)">{{ tr('autoUi.k_59588f0c7deb') }}</button>
                    <button v-else-if="canRepairShotTaskId(item)" class="vg-btn vg-btn--sm" type="button" :disabled="loading || !current?.id" @click.stop="refreshRemoteStatus()">{{ tr('autoUi.k_c669d0d0cdfc') }}</button>
                  </span>
                </div>
              </div>
            </section>

            <aside class="cw-stack cw-sticky">
              <section class="cw-card">
                <header class="cw-card__head">
                  <h3>{{ tr('cloneView.videoStage.previewTitle') }}</h3>
                  <span v-if="selectedShotOutput" class="cw-card__hint">{{ `${tr('cloneView.videoStage.columns.shot')} ${String((selectedShotIndex >= 0 ? selectedShotIndex : 0) + 1).padStart(2, '0')}` }} · {{ formatDuration(selectedShotOutput?.durationSec) }}</span>
                  <span v-if="shotVideoOutputs.length > 1" class="cw-vnav">
                    <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="selectedShotIndex <= 0" :title="tr('cloneUi.video.prevShot')" @click="selectAdjacentShot(-1)"><ChevronLeft :size="14" /></button>
                    <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="selectedShotIndex >= shotVideoOutputs.length - 1" :title="tr('cloneUi.video.nextShot')" @click="selectAdjacentShot(1)"><ChevronRight :size="14" /></button>
                  </span>
                </header>
                <div class="cw-player cw-player--portrait cw-vscreen">
                  <video
                    v-if="selectedShotOutput?.videoPath"
                    :key="selectedShotOutput.videoPath"
                    :src="mediaUrl(selectedShotOutput.videoPath)"
                    :poster="selectedShotFrame?.imagePath ? previewImage(selectedShotFrame.imagePath, selectedShotFrame.updatedAt) : undefined"
                    controls
                    playsinline
                    preload="metadata"
                  ></video>
                  <template v-else-if="selectedShotFrame?.imagePath">
                    <img class="cw-vscreen__poster" :src="previewImage(selectedShotFrame.imagePath, selectedShotFrame.updatedAt)" :alt="safeText(shotLabel(selectedShotOutput?.shotId || ''), tr('autoUi.k_5f35462af301'))" />
                    <span class="cw-vscreen__veil" :class="`is-${selectedShotView?.tone || 'idle'}`">
                      <LoaderCircle v-if="selectedShotView?.tone === 'run'" :size="26" class="vg-spin" />
                      <AlertTriangle v-else-if="selectedShotView?.tone === 'err'" :size="24" />
                      <Clapperboard v-else :size="24" />
                      <strong>{{ selectedShotView?.tone === 'run' ? tr('cloneUi.video.overlayRunning') : selectedShotView?.tone === 'err' ? tr('cloneUi.video.overlayFailed') : tr('cloneUi.video.overlayWaiting') }}</strong>
                      <small v-if="selectedShotView?.tone === 'run'">{{ tr('cloneUi.video.runningHint') }}</small>
                      <button v-if="selectedShotView?.tone === 'err' && selectedShotOutput" class="vg-btn vg-btn--sm vg-btn--primary" type="button" :disabled="!current?.id || regeneratingShotVideoIds.includes(selectedShotOutput.shotId)" @click="regenerateShotClip(selectedShotOutput.shotId)"><RotateCw :size="13" />{{ tr('cloneUi.video.retryThis') }}</button>
                    </span>
                  </template>
                  <span v-else class="cw-canvas__empty"><Clapperboard :size="24" /><strong>{{ tr('cloneView.videoStage.emptyPreviewTitle') }}</strong><small>{{ tr('cloneView.videoStage.emptyPreviewDescription') }}</small></span>
                </div>
                <div class="cw-field">
                  <span>{{ tr('cloneView.videoStage.currentShot') }}</span>
                  <strong>{{ safeText(shotLabel(selectedShotOutput?.shotId || ''), tr('cloneView.videoStage.notSelected')) }}</strong>
                  <small>{{ selectedShotView?.summary || shotScriptSummary(selectedShotOutput?.shotId) }}</small>
                </div>
                <div class="cw-field">
                  <span>{{ tr('cloneView.videoStage.scriptTitle') }}</span>
                  <strong>{{ safeText(selectedStoryBeat?.purpose, tr('cloneView.videoStage.noScript')) }}</strong>
                  <small>{{ tr('cloneView.videoStage.motionLabel') }}：{{ shotReferenceLabel(selectedStoryBeat) }} · {{ tr('cloneView.videoStage.productRoleLabel') }}：{{ localizeShotField(selectedStoryBeat?.productRole) }}</small>
                </div>
                <div v-if="selectedShotView" class="cw-vstatus">
                  <span class="cw-state" :class="`cw-state--${selectedShotView.tone}`"><i />{{ selectedShotView.title }}</span>
                  <small :title="selectedShotView.detail">{{ selectedShotView.detail }}</small>
                </div>
                <details class="cw-vdetails">
                  <summary>{{ tr('cloneUi.video.details') }}</summary>
                  <dl class="cw-kv">
                    <div><dt>{{ tr('autoUi.k_9d2c439d0b11') }}</dt><dd>{{ configuredVideoProvider }} / {{ configuredVideoModel }}</dd></div>
                    <div><dt>{{ tr('cloneView.videoStage.modelLabel') }}</dt><dd>{{ safeText(selectedShotOutput?.provider, '--') }} / {{ safeText(selectedShotOutput?.model, '--') }}</dd></div>
                    <div><dt>{{ tr('cloneView.videoStage.taskIdLabel') }}</dt><dd class="cw-mono" :title="safeText(selectedShotOutput ? effectiveShotTaskId(selectedShotOutput.shotId) : '', '')">{{ safeText(selectedShotOutput ? effectiveShotTaskId(selectedShotOutput.shotId) : '', '--') }}</dd></div>
                  </dl>
                  <p class="cw-vdetails__note">{{ videoStageDescription }}</p>
                </details>
                <div v-if="selectedShotVideoErrorText" class="cw-alert">
                  <strong><AlertTriangle :size="14" />{{ tr('autoUi.k_ce8a92e25f09') }} · {{ selectedShotVideoErrorTitle }}</strong>
                  <p>{{ selectedShotVideoErrorText }}</p>
                  <small>{{ tr('autoUi.k_aba23c4b2667') }}：{{ selectedShotVideoErrorAdvice }}</small>
                  <button v-if="selectedShotVideoErrorAction === 'go-models' || selectedShotVideoErrorAction === 'go-identity-grid'" class="vg-btn vg-btn--sm" type="button" @click="handleStoryboardErrorAction">{{ selectedShotVideoErrorAction === 'go-identity-grid' ? tr('autoUi.k_c02ac22e1593') : tr('autoUi.k_5d3cd4e394f6') }}</button>
                </div>
              </section>
            </aside>
          </div>

          <div v-if="shotVideoOutputs.length" class="cw-nextbar">
            <div><strong>{{ tr('autoUi.k_1099e21fef55') }}</strong><span>{{ tr('autoUi.k_b4618efa3ca7') }}</span></div>
            <button class="vg-btn vg-btn--primary" type="button" :disabled="loading" @click.stop="selectStage('compose')">{{ tr('autoUi.k_6a9b747fac2c') }}<ArrowRight :size="15" /></button>
          </div>
          <CloneStateCard v-else class="empty-state section-empty" :title="tr('autoUi.k_b7ec5f2532fc')" :description="tr('autoUi.k_7b060ff47103')" />
        </article>

        <!-- ================= 06 成片合成 ================= -->
        <article v-if="visibleStageKey === 'compose'" class="cw-step-view">
          <header class="cw-head">
            <span class="cw-head__no">06</span>
            <div class="cw-head__text">
              <h2>{{ tr('autoUi.k_780ee868bcca') }}</h2>
              <p>{{ tr('autoUi.k_302215860a11') }}</p>
            </div>
            <div class="cw-head__meta">
              <span class="cw-state" :class="gatePassAllowed ? 'cw-state--ok' : 'cw-state--run'"><i />{{ tr('autoUi.k_794c95d23fb2') }}{{ gatePassAllowed ? tr('autoUi.k_dcc4233255ab') : tr('autoUi.k_a00db105bd49') }}</span>
              <span class="cw-state" :class="finalOutputPath ? 'cw-state--ok' : 'cw-state--idle'"><i />{{ finalOutputPath ? tr('autoUi.k_26876a1765af') : tr('autoUi.k_942a589f6e38') }}</span>
            </div>
          </header>

          <div class="cw-split cw-split--compose">
            <div class="cw-stack">
              <section class="cw-card cw-card--theater">
                <div class="cw-theater" :class="composeAspectClass" @contextmenu.prevent="hasFreshFinalCompose && finalOutputPath && revealFinalOutput()">
                  <video v-if="composePreviewPath" :src="composePreviewMediaUrl" :poster="composePreviewPosterUrl || undefined" controls preload="metadata"></video>
                  <span v-else class="cw-canvas__empty"><Film :size="26" /><strong>{{ tr('autoUi.k_0ac754b27412') }}</strong><small>{{ composePreviewHint }}</small></span>
                </div>
              </section>

              <section class="cw-card">
                <header class="cw-card__head">
                  <h3>{{ tr('autoUi.k_ab7bce9cbbe7') }}</h3>
                  <span class="cw-card__hint">{{ tr('autoUi.k_4cdcbc82fa16') }}</span>
                  <span class="cw-count-mark">{{ shotVideoOutputs.length }} {{ tr('autoUi.k_bce2ef61514a') }}</span>
                </header>
                <div v-if="shotVideoOutputs.length" class="cw-strip">
                  <div
                    v-for="item in shotVideoOutputs"
                    :key="`${item.shotId}-studio`"
                    v-memo="[item.shotId, item.videoPath, item.status, item.error, item.durationSec, selectedShotOutput?.shotId === item.shotId, shotFrameMap[item.shotId]?.imagePath]"
                    class="cw-strip__item"
                    :class="{ 'is-active': selectedShotOutput?.shotId === item.shotId }"
                    role="button"
                    tabindex="0"
                    @click="selectedShotId = item.shotId"
                    @keydown.enter.prevent="selectedShotId = item.shotId"
                    @keydown.space.prevent="selectedShotId = item.shotId"
                  >
                    <span class="cw-strip__media">
                      <img v-if="shotFrameMap[item.shotId]?.imagePath" :src="previewImage(shotFrameMap[item.shotId]?.imagePath, shotFrameMap[item.shotId]?.updatedAt)" alt="shot-frame" loading="lazy" />
                      <span v-else class="cw-frame__empty">{{ tr('autoUi.k_6fd0592e6878') }}</span>
                      <b>{{ (shotVideoOutputIndexMap[item.shotId] ?? 0) + 1 }}</b>
                    </span>
                    <strong>{{ safeText(shotLabel(item.shotId), tr('autoUi.k_24f7d6982256', { p0: (shotVideoOutputIndexMap[item.shotId] ?? 0) + 1 })) }}</strong>
                    <small>{{ formatDuration(item.durationSec) }}</small>
                  </div>
                </div>
                <div v-if="selectedShotOutput" class="cw-detailbar">
                  <div>
                    <small>{{ tr('autoUi.k_103c08e0b996') }}</small>
                    <strong>{{ safeText(shotLabel(selectedShotOutput.shotId), tr('autoUi.k_103c08e0b996')) }}</strong>
                    <span>{{ shotScriptSummary(selectedShotOutput.shotId) }}</span>
                  </div>
                  <div class="cw-btnrow">
                    <CloneShotReplaceMenu
                      v-if="current?.id"
                      :clone-project-id="current.id"
                      :shot-id="selectedShotOutput.shotId"
                      :disabled="loading"
                      @pick-file="replaceShotVideo(selectedShotOutput.shotId)"
                      @replaced="onShotAlternativeReplaced"
                      @error="onShotAlternativeError"
                    />
                    <button class="vg-btn vg-btn--sm" type="button" :disabled="loading || !canContinueSyncShot(selectedShotOutput)" @click="selectedShotOutput && syncFailedShotVideo(selectedShotOutput.shotId)"><Search :size="13" />{{ tr('autoUi.k_0f80598c1ffa') }}</button>
                    <button v-if="canRepairShotTaskId(selectedShotOutput)" class="vg-btn vg-btn--sm" type="button" :disabled="loading || !current?.id" @click="refreshRemoteStatus">{{ tr('autoUi.k_c669d0d0cdfc') }}</button>
                  </div>
                </div>
                <CloneStateCard v-else class="empty-state section-empty" :title="tr('autoUi.k_52198bfdbee3')" :description="tr('autoUi.k_fcdc361d35ed')" />
              </section>
            </div>

            <aside class="cw-stack cw-sticky">
              <section class="cw-card cw-card--accent">
                <header class="cw-card__head"><h3>{{ tr('autoUi.k_09d1dbd189c8') }}</h3></header>
                <div class="cw-metrics cw-metrics--3">
                  <div class="cw-metric"><span>{{ tr('autoUi.k_29d0552d2e4c') }}</span><strong>{{ composeDurationDisplay }}</strong></div>
                  <div class="cw-metric"><span>{{ tr('autoUi.k_fd20702c73d1') }}</span><strong>{{ composeEstimatedSize }}</strong></div>
                  <div class="cw-metric"><span>{{ tr('autoUi.k_a9704e1997b9') }}</span><strong :title="composeExportTimeText">{{ composeExportTimeText }}</strong></div>
                </div>
                <button class="vg-btn vg-btn--primary vg-btn--block vg-btn--lg" type="button" :disabled="!hasFreshFinalCompose || !finalOutputPath" @click="revealFinalOutput"><Download :size="16" />{{ composeExportActionLabel }}</button>
                <div class="cw-btnrow cw-btnrow--fill">
                  <button class="vg-btn" :class="{ 'cw-warn': !gatePassAllowed }" type="button" :disabled="loading" @click="composeFinalVideo"><RefreshCw :size="14" />{{ finalButtonLabel }}</button>
                  <button class="vg-btn" type="button" :disabled="loading || !current?.id" @click="openTiktokCreativeStudio"><Send :size="14" />{{ tr('autoUi.k_f0effeae0cf7') }}</button>
                </div>
              </section>

              <section class="cw-card">
                <header class="cw-card__head">
                  <h3>{{ tr('autoUi.k_7aaa2f87edf4') }}</h3>
                  <span class="cw-card__hint">{{ tr('autoUi.k_df429736ba90') }}</span>
                </header>
                <div class="cw-field">
                  <span>{{ tr('autoUi.k_305c965ad310') }}</span>
                  <div class="cw-path">
                    <FolderOpen :size="14" /><strong :title="finalOutputDirText">{{ finalOutputDirText }}</strong>
                    <button class="vg-btn vg-btn--sm" type="button" :disabled="loading" @click="pickComposeOutputDir">{{ tr('autoUi.k_ed358091bc9c') }}</button>
                  </div>
                </div>
              </section>

              <div v-if="localComposeErrorText" class="cw-alert">
                <strong><AlertTriangle :size="14" />{{ tr('autoUi.k_408228b05be1') }}</strong>
                <p>{{ localComposeErrorText }}</p>
              </div>

              <section v-if="composeSummaryStats || composeHealthFlags.length || composeHealthRecommendations.length || composeHealthVerdictText" class="cw-card">
                <header class="cw-card__head">
                  <h3>{{ tr('autoUi.k_906e2b8b14d2') }}</h3>
                  <span class="cw-state" :class="composeHealthFlagLabels.length ? 'cw-state--run' : 'cw-state--ok'"><i />{{ composeHealthFlagLabels.length ? composeHealthFlagLabels.length : '✓' }}</span>
                </header>
                <p v-if="composeHealthVerdictText" class="cw-body-copy cw-body-copy--strong">{{ composeHealthVerdictText }}</p>
                <div class="cw-words"><em v-for="label in composeHealthFlagLabels.length ? composeHealthFlagLabels : [tr('autoUi.k_438a2458e735')]" :key="label">{{ label }}</em></div>
                <dl class="cw-kv">
                  <div v-if="composeSummaryStats?.totalShots"><dt>{{ tr('autoUi.k_e3c71dbd0f6e').replace(/[:：]\s*$/, '') }}</dt><dd>{{ composeSummaryStats.totalShots }}{{ tr('autoUi.k_bfbf845243b4') }}{{ composeStageCountText }}</dd></div>
                  <div v-if="composeAverageClipDurationText"><dt>{{ tr('autoUi.k_5b8be1da2596').replace(/[:：]\s*$/, '') }}</dt><dd>{{ composeAverageClipDurationText }}</dd></div>
                </dl>
                <small v-if="composeSummaryStats" class="cw-note">{{ tr('autoUi.k_c6965fe469f4') }}{{ Number(composeSummaryStats.aggressiveShotCount || 0) }}{{ tr('autoUi.k_112fd0c2aff9') }}{{ Number(composeSummaryStats.readabilityProtectedCount || 0) }}{{ tr('autoUi.k_e30d73d034d5') }}{{ Number(composeSummaryStats.productPriorityCount || 0) }}{{ tr('autoUi.k_e985a4d66628') }}{{ Number(composeSummaryStats.strongHookCount || 0) }}</small>
                <ul v-if="composeHealthRecommendations.length" class="cw-advice"><li v-for="item in composeHealthRecommendations" :key="item">{{ item }}</li></ul>
              </section>

              <div v-if="previewPipelineReportPath" class="cw-field cw-field--row cw-field--plain">
                <span>{{ tr('autoUi.k_68ad7f89e687') }}</span>
                <strong class="cw-mono" :title="previewPipelineReportPath">{{ shortPath(previewPipelineReportPath) }}</strong>
              </div>
              <p class="cw-banner"><Lightbulb :size="14" />{{ tr('autoUi.k_f5d8e9430ad5') }} {{ tr('autoUi.k_34be97c09b46') }}</p>
            </aside>
          </div>
        </article>
      </div>
    </section>

    <RuntimeLogDialog
      v-model="runtimeDialogOpen"
      :logs="runtimeLogs"
      :title="'\u8fd0\u884c\u65e5\u5fd7'"
      :description="'\u5b9e\u65f6\u67e5\u770b /clone \u7684\u63d0\u4ea4\u65e5\u5fd7\u3001\u63a5\u53e3\u8fd4\u56de\u3001\u9636\u6bb5\u5207\u6362\u4e0e\u9519\u8bef\u4fe1\u606f\u3002'"
      :hint="'\u4ec5\u663e\u793a /clone \u8fd0\u884c\u76f8\u5173\u65e5\u5fd7'"
      :empty-description="'\u5728 /clone \u5185\u6267\u884c\u5206\u6790\u3001\u751f\u6210\u3001\u540c\u6b65\u3001\u5408\u6210\u7b49\u64cd\u4f5c\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u6700\u65b0\u8fd0\u884c\u4fe1\u606f\u3002'"
    />

    <div v-if="framePreviewOpen" class="modal-mask" @click.self="framePreviewOpen = false">
      <div class="modal-panel modal-panel--frame-preview">
        <div class="panel-head">
          <div>
            <span class="panel-tag">{{ tr('autoUi.k_76917c58e1ee') }}</span>
            <h2>{{ safeText(framePreviewTitle, tr('autoUi.k_daa6ea9a0eb4')) }}</h2>
          </div>
          <button class="ghost-button small" type="button" @click="framePreviewOpen = false">{{ tr('autoUi.k_6c14bd7f6f9e') }}</button>
        </div>
        <div class="frame-preview-shell">
          <img v-if="framePreviewPath" :src="previewImage(framePreviewPath, Date.now())" alt="frame-preview" />
        </div>
      </div>
    </div>

    <div v-if="identityGridPromptPreviewOpen" class="modal-mask" @click.self="identityGridPromptPreviewOpen = false">
      <div class="modal-card prompt-preview-modal prompt-preview-modal--identity-grid">
        <div class="modal-card__header">
          <div class="prompt-preview-modal__title">
            <span class="panel-tag">{{ tr('autoUi.k_54f65b6b0c67') }}</span>
            <strong>{{ tr('autoUi.k_ed96bfd66e94') }}</strong>
            <p>{{ tr('autoUi.k_021b8a7dec6e') }}</p>
          </div>
          <div class="modal-card__actions">
            <button class="ghost-button small" type="button" :disabled="!(identityGridPromptPreview?.prompt || current?.projectIdentityGridPromptPreview?.prompt)" @click="copyPromptText(identityGridPromptPreview?.prompt || current?.projectIdentityGridPromptPreview?.prompt || '', tr('autoUi.k_abc7750ecb1f'))">{{ tr('autoUi.k_55f59bc2f0c3') }}</button>
            <button class="ghost-button small" type="button" @click="identityGridPromptPreviewOpen = false">{{ tr('autoUi.k_6c14bd7f6f9e') }}</button>
          </div>
        </div>
        <div v-if="identityGridPromptSource" class="prompt-preview-card prompt-preview-card--identity-grid">
          <div class="identity-grid-preview-summary identity-grid-preview-summary--compact">
            <div v-for="item in identityGridPreviewStats" :key="item.label" class="identity-grid-preview-stat identity-grid-preview-stat--compact">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
          <div class="identity-grid-preview-main">
            <div class="identity-grid-preview-column">
              <div v-if="identityGridReferencePaths.length || identityGridModelReferencePaths.length" class="prompt-preview-section identity-grid-preview-section">
                <div class="prompt-preview-section__header">
                  <strong>{{ tr('autoUi.k_a4c9a83772b3') }}</strong>
                  <span>{{ tr('autoUi.k_e2efc3482a19') }}</span>
                </div>
                <div class="identity-grid-asset-pair">
                  <div class="identity-grid-asset-group">
                    <div class="identity-grid-asset-group__head">
                      <strong>{{ tr('autoUi.k_9ae39426bcca') }}</strong>
                      <span>{{ identityGridReferencePaths.length ? tr('autoUi.k_30a97706c37b', { p0: identityGridReferencePaths.length }) : tr('autoUi.k_5dbd015496af') }}</span>
                    </div>
                    <div v-if="identityGridReferencePaths.length" class="prompt-reference-grid prompt-reference-grid--identity-grid">
                      <div v-for="(item, index) in identityGridReferencePaths" :key="`identity-ref-${item}`" class="prompt-reference-card prompt-reference-card--compact prompt-reference-card--identity-grid">
                        <button class="prompt-reference-card__thumb" type="button" @click="openFramePreview(item, tr('autoUi.k_c8b458421614', { p0: index + 1 }))">
                          <img :src="previewImage(item)" alt="identity-grid-reference" />
                        </button>
                        <div class="prompt-reference-card__actions">
                          <button class="ghost-button tiny" type="button" @click="openFramePreview(item, tr('autoUi.k_c8b458421614', { p0: index + 1 }))">{{ tr('autoUi.k_d7f48a059cf3') }}</button>
                          <button class="ghost-button tiny" type="button" @click="downloadMediaFile(item)">{{ tr('autoUi.k_2b9d013177da') }}</button>
                        </div>
                      </div>
                    </div>
                    <div v-else class="prompt-reference-empty">{{ tr('autoUi.k_b7da8f65d973') }}</div>
                  </div>
                  <div class="identity-grid-asset-group">
                    <div class="identity-grid-asset-group__head">
                      <strong>{{ tr('autoUi.k_63b2cf7794b3') }}</strong>
                      <span>{{ identityGridModelReferencePaths.length ? tr('autoUi.k_30a97706c37b', { p0: identityGridModelReferencePaths.length }) : tr('autoUi.k_5dbd015496af') }}</span>
                    </div>
                    <div v-if="identityGridModelReferencePaths.length" class="prompt-reference-grid prompt-reference-grid--identity-grid">
                      <div v-for="(item, index) in identityGridModelReferencePaths" :key="`identity-model-ref-${item}`" class="prompt-reference-card prompt-reference-card--compact prompt-reference-card--identity-grid">
                        <button class="prompt-reference-card__thumb" type="button" @click="openFramePreview(item, tr('autoUi.k_52b08e4bfe85', { p0: index + 1 }))">
                          <img :src="previewImage(item)" alt="identity-grid-model-reference" />
                        </button>
                        <div class="prompt-reference-card__actions">
                          <button class="ghost-button tiny" type="button" @click="openFramePreview(item, tr('autoUi.k_52b08e4bfe85', { p0: index + 1 }))">{{ tr('autoUi.k_d7f48a059cf3') }}</button>
                          <button class="ghost-button tiny" type="button" @click="downloadMediaFile(item)">{{ tr('autoUi.k_2b9d013177da') }}</button>
                        </div>
                      </div>
                    </div>
                    <div v-else class="prompt-reference-empty">{{ tr('autoUi.k_87c3e289a734') }}</div>
                  </div>
                </div>
              </div>
              <div v-else class="prompt-preview-section identity-grid-preview-section">
                <div class="prompt-preview-section__header">
                  <strong>{{ tr('autoUi.k_a4c9a83772b3') }}</strong>
                  <span>{{ tr('autoUi.k_e370cdaf4557') }}</span>
                </div>
                <div class="prompt-reference-empty">{{ tr('autoUi.k_06a6c7335e59') }}</div>
              </div>
            </div>
            <div class="identity-grid-preview-column">
              <div class="prompt-preview-section prompt-preview-section--textarea prompt-preview-section--identity-grid-prompt">
                <div class="prompt-preview-section__header">
                  <strong>{{ tr('autoUi.k_63b7e2717fbb') }}</strong>
                  <span>{{ tr('autoUi.k_ee92e0cae58d') }}</span>
                </div>
                <div class="prompt-preview-code-shell prompt-preview-code-shell--identity-grid-top">
                  <pre class="prompt-preview-code prompt-preview-code--identity-grid">{{ identityGridPromptSource.prompt || '' }}</pre>
                </div>
              </div>
              <div v-if="safeArray(identityGridPromptSource?.gridUsagePlan).length" class="prompt-preview-section identity-grid-preview-usage">
                <div class="prompt-preview-section__header">
                  <strong>{{ tr('autoUi.k_b06c340dc0e4') }}</strong>
                  <span>{{ tr('autoUi.k_f2d06a139c22', { p0: safeArray(identityGridPromptSource?.gridUsagePlan).length }) }}</span>
                </div>
                <div class="prompt-preview-paths prompt-preview-paths--chips">
                  <span v-for="item in safeArray(identityGridPromptSource?.gridUsagePlan)" :key="item">{{ item }}</span>
                </div>
              </div>
              <div class="prompt-preview-section identity-grid-preview-section">
                <div class="prompt-preview-section__header">
                  <strong>{{ tr('autoUi.k_08dca24f2c10') }}</strong>
                  <span>{{ tr('autoUi.k_203dfc5a8216') }}</span>
                </div>
                <div v-if="identityGridRequestParamRowsCompact.length" class="prompt-param-table prompt-param-table--compact">
                  <div class="prompt-param-table__head">
                    <span>{{ tr('autoUi.k_ecb6c72b4c56') }}</span>
                    <span>{{ tr('autoUi.k_b9e8f6fc752b') }}</span>
                    <span>{{ tr('autoUi.k_f3ea6d345e2a') }}</span>
                  </div>
                  <div v-for="row in identityGridRequestParamRowsCompact" :key="`identity-grid-compact-${row.key}`" class="prompt-param-table__row">
                    <strong>{{ row.key }}</strong>
                    <pre>{{ row.value }}</pre>
                    <button class="ghost-button tiny" type="button" @click="copyPromptText(row.value, tr('autoUi.k_b2a92ec67b81', { p0: row.key }))">{{ tr('autoUi.k_4edd1d00875d') }}</button>
                  </div>
                </div>
                <div v-else class="prompt-preview-empty">{{ tr('autoUi.k_95eb81c7b494') }}</div>
              </div>
            </div>
          </div>
          <div class="prompt-preview-block prompt-preview-block--identity-grid">
            <div class="prompt-preview-block__head">
              <strong>{{ tr('autoUi.k_5cf0f59c3cd1') }}</strong>
              <button
                class="ghost-button small"
                type="button"
                :disabled="!(identityGridPromptPreview?.requestJson || current?.projectIdentityGridPromptPreview?.requestJson)"
                @click="copyPromptText(safeText(identityGridPromptPreview?.requestJson || current?.projectIdentityGridPromptPreview?.requestJson, ''), tr('autoUi.k_8a2f4f1fa013'))"
              > {{ tr('autoUi.k_55f59bc2f0c3') }} </button>
            </div>
            <div v-if="identityGridRequestParamRowsExpanded.length" class="prompt-param-table prompt-param-table--expanded">
              <div class="prompt-param-table__head">
                <span>{{ tr('autoUi.k_ecb6c72b4c56') }}</span>
                <span>{{ tr('autoUi.k_b9e8f6fc752b') }}</span>
                <span>{{ tr('autoUi.k_f3ea6d345e2a') }}</span>
              </div>
              <div v-for="row in identityGridRequestParamRowsExpanded" :key="`identity-grid-expanded-${row.key}`" class="prompt-param-table__row">
                <strong>{{ row.key }}</strong>
                <pre>{{ row.value }}</pre>
                <button class="ghost-button tiny" type="button" @click="copyPromptText(row.value, tr('autoUi.k_b2a92ec67b81', { p0: row.key }))">{{ tr('autoUi.k_4edd1d00875d') }}</button>
              </div>
            </div>
            <div v-else class="prompt-preview-empty">{{ tr('autoUi.k_fb1b15f4a1c9') }}</div>
          </div>
          <div v-if="identityGridPromptSource.description" class="prompt-preview-section identity-grid-preview-section">
            <div class="prompt-preview-section__header">
              <strong>{{ tr('autoUi.k_2564f3578ec4') }}</strong>
              <span>{{ tr('autoUi.k_9c72a5cd5060') }}</span>
            </div>
            <div class="prompt-highlight-card__block">
              <pre>{{ identityGridPromptSource.description }}</pre>
            </div>
          </div>
          <div class="prompt-preview-section prompt-preview-section--textarea">
            <div class="prompt-preview-section__header">
              <strong>{{ tr('autoUi.k_63b7e2717fbb') }}</strong>
              <span>{{ tr('autoUi.k_2d0a5be2d7a0') }}</span>
            </div>
            <div class="prompt-preview-code-shell">
              <pre class="prompt-preview-code prompt-preview-code--identity-grid">{{ identityGridPromptSource.prompt || '' }}</pre>
            </div>
          </div>
        </div>
        <div v-else-if="identityGridPromptPreviewError" class="prompt-preview-empty prompt-preview-empty--error">
          {{ identityGridPromptPreviewError }}
        </div>
      </div>
    </div>

    <div v-if="shotPromptPreviewOpen" class="modal-mask" @click.self="shotPromptPreviewOpen = false">
      <div class="modal-panel modal-panel--prompt-preview">
        <div class="panel-head">
          <div>
            <span class="panel-tag">{{ tr('autoUi.k_ca445a4a0ad9') }}</span>
            <h2>{{ selectedStoryboardRow ? tr('autoUi.k_24f7d6982256', { p0: String(selectedStoryboardRow.shotIndex).padStart(2, '0') }) : tr('autoUi.k_9fec4d6ec5ef') }}</h2>
          </div>
          <div class="panel-actions">
            <button class="ghost-button small" type="button" data-testid="clone-shot-image-open-prompt-manager" @click="openPromptManager('grid', { kind: shotImageReferenceMode === 'product_closeup' ? 'storyboard_product' : 'storyboard_model', productType: shotImagePromptPreview?.productType })">{{ tr('cloneUi.promptManager.entry') }}</button>
            <button class="ghost-button small" type="button" :disabled="!shotImagePromptPreview" @click="copyAllShotPrompts">{{ tr('autoUi.k_55f59bc2f0c3') }}</button>
            <button class="ghost-button small" type="button" @click="shotPromptPreviewOpen = false">{{ tr('autoUi.k_6c14bd7f6f9e') }}</button>
          </div>
        </div>
        <div v-if="shotImagePromptPreview" class="prompt-preview-card">
          <div class="prompt-preview-meta">
            <span>{{ tr('autoUi.k_04dc94e11529') }}{{ safeText(shotImagePromptPreview.consistencyMode, '--') }}</span>
            <span>{{ tr('autoUi.k_abd5bce91f06') }}{{ safeText(shotImagePromptPreview.productType, '--') }}</span>
            <span>{{ tr('autoUi.k_f20d9f75fb6a') }}{{ Number(shotImagePromptPreview.referenceImageCount || 0) }}</span>
            <span>{{ tr('autoUi.k_439f5ea210cc') }}{{ shotImageReferenceMode === 'product_closeup' ? tr('autoUi.k_4d17c549bcdc') : tr('autoUi.k_646cba661d87') }}</span>
            <span v-if="shotImageReferenceReasonSummary">{{ shotImageReferenceReasonSummary }}</span>
            <span v-if="shotImageReferenceLockSummary">{{ shotImageReferenceLockSummary }}</span>
            <span v-if="shotPromptCopyMessage">{{ shotPromptCopyMessage }}</span>
          </div>
          <div class="prompt-preview-block">
            <div class="prompt-preview-block__head">
              <strong>Image Request Params</strong>
              <button class="ghost-button small" type="button" @click="copyPromptText(safeText(shotImagePromptPreview.requestJsonStart, ''), tr('autoUi.k_8a2f4f1fa013'))">{{ tr('autoUi.k_55f59bc2f0c3') }}</button>
            </div>
            <div v-if="shotImageRequestParamRows.length" class="prompt-param-table">
              <div class="prompt-param-table__head">
                <span>{{ tr('autoUi.k_ecb6c72b4c56') }}</span>
                <span>{{ tr('autoUi.k_b9e8f6fc752b') }}</span>
                <span>{{ tr('autoUi.k_f3ea6d345e2a') }}</span>
              </div>
              <div v-for="row in shotImageRequestParamRows" :key="row.key" class="prompt-param-table__row">
                <strong>{{ row.key }}</strong>
                <pre>{{ row.value }}</pre>
                <button class="ghost-button tiny" type="button" @click="copyPromptText(row.value, tr('autoUi.k_b2a92ec67b81', { p0: row.key }))">{{ tr('autoUi.k_4edd1d00875d') }}</button>
              </div>
            </div>
            <div v-else class="prompt-preview-empty">{{ tr('autoUi.k_b56039e4f65c') }}</div>
          </div>
          <div class="prompt-highlight-card">
            <div class="prompt-highlight-card__head">
              <strong>{{ tr('autoUi.k_5149ae9c3017') }}</strong>
              <span>{{ tr('autoUi.k_32ad59d1654e') }}</span>
            </div>
            <div v-if="safeShotImageDisplayRefs.length" class="prompt-reference-grid">
              <div v-for="item in safeShotImageDisplayRefs" :key="`image-ref-${item.path}`" class="prompt-reference-card">
                <a :href="mediaUrl(item.path)" target="_blank" rel="noreferrer">
                  <img :src="previewImage(item.path)" alt="image-product-reference" />
                </a>
                <span>{{ item.label }}</span>
                <div class="prompt-reference-card__actions">
                  <button class="ghost-button tiny" type="button" @click="copyPromptText(item.path, tr('autoUi.k_d14d5d43036b'))">{{ tr('autoUi.k_e0c29eaeb30b') }}</button>
                  <button class="ghost-button tiny" type="button" @click="downloadMediaFile(item.path)">{{ tr('autoUi.k_2b9d013177da') }}</button>
                </div>
              </div>
            </div>
            <div v-else class="prompt-reference-empty">{{ tr('autoUi.k_53bbf3d53751') }}</div>
          </div>
        </div>
        <div v-else-if="shotImagePromptPreviewError" class="prompt-preview-empty prompt-preview-empty--error">
          {{ shotImagePromptPreviewError }}
        </div>
        <div v-else class="prompt-preview-empty"> {{ tr('autoUi.k_5aaf25feec91') }} </div>
      </div>
    </div>

    <div v-if="shotVideoPromptPreviewOpen" class="modal-mask" @click.self="shotVideoPromptPreviewOpen = false">
      <div class="modal-panel modal-panel--prompt-preview">
        <div class="panel-head">
          <div>
            <span class="panel-tag">{{ tr('autoUi.k_161657ad1c55') }}</span>
            <h2>{{ selectedShotOutput ? tr('autoUi.k_24f7d6982256', { p0: String((selectedShotIndex >= 0 ? selectedShotIndex : 0) + 1).padStart(2, '0') }) : tr('autoUi.k_589157bc90cb') }}</h2>
          </div>
          <div class="panel-actions">
            <button class="ghost-button small" type="button" data-testid="clone-shot-video-open-prompt-manager" @click="openPromptManager('video', { productType: shotVideoPromptPreview?.productType })">{{ tr('cloneUi.promptManager.entry') }}</button>
            <button class="ghost-button small" type="button" :disabled="!shotVideoPromptPreview" @click="copyAllShotVideoPrompts">{{ tr('autoUi.k_55f59bc2f0c3') }}</button>
            <button class="ghost-button small" type="button" @click="shotVideoPromptPreviewOpen = false">{{ tr('autoUi.k_6c14bd7f6f9e') }}</button>
          </div>
        </div>
        <div v-if="shotVideoPromptPreview" class="prompt-preview-card">
          <div class="prompt-preview-meta">
            <span>{{ tr('autoUi.k_abd5bce91f06') }}{{ safeText(shotVideoPromptPreview.productType, '--') }}</span>
          </div>
          <div class="prompt-highlight-card">
            <div class="prompt-highlight-card__head">
              <strong>{{ tr('autoUi.k_bb8ed1a96b33') }}</strong>
              <span>{{ tr('autoUi.k_b00a94cc6010') }}</span>
            </div>
            <div v-if="shotVideoReferencePaths.length" class="prompt-reference-grid">
              <div v-for="(item, index) in shotVideoReferencePaths" :key="`video-ref-${item}`" class="prompt-reference-card">
                <a :href="mediaUrl(item)" target="_blank" rel="noreferrer">
                  <img :src="previewImage(item)" alt="video-request-reference" />
                </a>
                <span>{{ tr('autoUi.k_038c4864181e', { p0: index + 1, p1: shortPath(item) }) }}</span>
                <div class="prompt-reference-card__actions">
                  <button class="ghost-button tiny" type="button" @click="copyPromptText(item, tr('autoUi.k_d14d5d43036b'))">{{ tr('autoUi.k_e0c29eaeb30b') }}</button>
                  <button class="ghost-button tiny" type="button" @click="downloadMediaFile(item)">{{ tr('autoUi.k_2b9d013177da') }}</button>
                </div>
              </div>
            </div>
            <div v-else class="prompt-reference-empty">{{ tr('autoUi.k_a6dfe908a7d4') }}</div>
          </div>
          <div class="prompt-preview-block">
            <div class="prompt-preview-block__head">
              <strong>Video Request Params</strong>
              <button class="ghost-button small" type="button" @click="copyPromptText(shotVideoPayloadText(shotVideoPromptPreview), tr('autoUi.k_368cd625a419'))">{{ tr('autoUi.k_55f59bc2f0c3') }}</button>
            </div>
            <div v-if="shotVideoRequestParamRows.length" class="prompt-param-table">
              <div class="prompt-param-table__head">
                <span>{{ tr('autoUi.k_ecb6c72b4c56') }}</span>
                <span>{{ tr('autoUi.k_b9e8f6fc752b') }}</span>
                <span>{{ tr('autoUi.k_f3ea6d345e2a') }}</span>
              </div>
              <div v-for="row in shotVideoRequestParamRows" :key="`video-${row.key}`" class="prompt-param-table__row">
                <strong>{{ row.key }}</strong>
                <div v-if="row.uploadPaths?.length" class="prompt-param-upload">
                  <a v-for="path in row.uploadPaths" :key="path" :href="mediaUrl(path)" target="_blank" rel="noreferrer" class="prompt-param-upload__thumb">
                    <img :src="previewImage(path)" alt="upload-on-submit" />
                  </a>
                  <div class="prompt-param-upload__copy">
                    <pre>{{ row.value }}</pre>
                    <span>{{ tr('cloneUi.uploadOnSubmit') }}</span>
                  </div>
                </div>
                <pre v-else>{{ row.value }}</pre>
                <button class="ghost-button tiny" type="button" @click="copyPromptText(row.value, tr('autoUi.k_b2a92ec67b81', { p0: row.key }))">{{ tr('autoUi.k_4edd1d00875d') }}</button>
              </div>
            </div>
            <div v-else class="prompt-preview-empty">{{ tr('autoUi.k_80ee3f68f9ff') }}</div>
          </div>
        </div>
        <div v-else-if="shotVideoPromptPreviewError" class="prompt-preview-empty prompt-preview-empty--error">
          {{ shotVideoPromptPreviewError }}
        </div>
        <div v-else class="prompt-preview-empty"> {{ tr('autoUi.k_a91b1682f300') }} </div>
      </div>
    </div>

    <div v-if="modelModalOpen" class="modal-mask" @click.self="modelModalOpen = false">
      <div class="modal-panel">
        <div class="panel-head">
          <div>
            <span class="panel-tag">{{ tr('autoUi.k_d6c594acfe3a') }}</span>
            <h2>{{ tr('autoUi.k_e7365a7456ac') }}</h2>
          </div>
          <div class="panel-actions">
            <button class="ghost-button small" type="button" @click="modelModalOpen = false">{{ tr('autoUi.k_6c14bd7f6f9e') }}</button>
          </div>
        </div>

        <div class="model-grid">
          <CloneMediaCard v-for="item in models" :key="item.id" as="button" class="model-card" type="button" @click="selectModel(item)">
            <div class="model-card-cover">
              <img v-if="modelPreview(item)" :src="modelPreview(item)" alt="model-preview" />
              <div v-else class="empty-state small-empty">{{ tr('autoUi.k_a42d709dc06f') }}</div>
            </div>
            <div class="model-card-copy data-card-copy">
              <strong>{{ safeText(item.name, tr('autoUi.k_524ed3a52e93')) }}</strong>
              <span>{{ safeText(item.sceneStyle || item.model, tr('autoUi.k_a5890121d6e5')) }}</span>
            </div>
          </CloneMediaCard>
        </div>
      </div>
    </div>

    <div v-if="productModalOpen" class="modal-mask" @click.self="productModalOpen = false">
      <div class="modal-panel">
        <div class="panel-head">
          <div>
            <span class="panel-tag">{{ tr('autoUi.k_b69b999b0e86') }}</span>
            <h2>{{ tr('autoUi.k_ed1d3b8effdf') }}</h2>
          </div>
          <div class="panel-actions">
            <button class="ghost-button small" type="button" @click="productModalOpen = false">{{ tr('autoUi.k_6c14bd7f6f9e') }}</button>
          </div>
        </div>

        <input v-model="productQuery" class="field-control" type="text" :placeholder="tr('autoUi.k_5f35074561bb')" />

        <div v-if="filteredProducts.length" class="model-grid">
          <CloneMediaCard
            v-for="item in filteredProducts"
            :key="item.id"
            as="button"
            class="model-card"
            :class="{
              'model-card--selected': selectedProductId === item.id,
              'model-card--bound': current?.productId === item.id,
            }"
            type="button"
            @click="selectProduct(item)"
          >
            <div class="model-card-cover">
              <img v-if="previewImage(item.coverImagePath || item.images?.[0]?.filePath)" :src="previewImage(item.coverImagePath || item.images?.[0]?.filePath)" alt="product-preview" />
              <div v-else class="empty-state small-empty">{{ tr('autoUi.k_a42d709dc06f') }}</div>
            </div>
            <div class="model-card-copy data-card-copy">
              <strong>{{ safeText(item.name, tr('autoUi.k_81918f2f9c19')) }}</strong>
              <span>{{ safeText(item.type, tr('autoUi.k_004922066efd')) }} · {{ item.id }}</span>
              <span v-if="current?.productId === item.id" class="model-card-badge">{{ tr('autoUi.k_6956b88d0e95') }}</span>
              <span v-else-if="selectedProductId === item.id" class="model-card-badge model-card-badge--selected">{{ tr('autoUi.k_230e98fe5340') }}</span>
            </div>
          </CloneMediaCard>
        </div>
        <div v-else class="prompt-preview-empty"> {{ tr('autoUi.k_4638e45ae2ad') }} </div>
      </div>
    </div>

    <ClonePromptManager
      :open="promptManagerOpen"
      :kinds="promptManagerKinds"
      :initial-kind="promptManagerKind"
      :initial-product-type="promptManagerProductType"
      @close="promptManagerOpen = false"
    />
  </div>
</template>

<style scoped>
.clone-page {
  min-height: 100%;
  padding: 4px 12px 72px;
  background: linear-gradient(180deg, var(--theme-panel) 0%, var(--theme-panel) 100%);
  color: var(--theme-text);
}

.hero-shell,
.workspace-grid,
.reference-layout,
.meta-grid,
.beats-grid,
.asset-grid,
.storyboard-layout,
.storyboard-batch-list,
.frame-grid,
.review-grid,
.final-layout,
.feedback-stack,
.history-list,
.model-grid {
  display: grid;
}

.panel-head,
.panel-actions,
.selected-model,
.review-head {
  display: flex;
}

.eyebrow,
.panel-tag {
  display: inline-block;
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--theme-tone-blue);
  font-weight: 700;
}

.panel h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.15;
  font-weight: 800;
}

.status-pill,
.mini-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  color: var(--theme-text);
  font-size: 12px;
  font-weight: 700;
}

.status-pill.success {
  color: var(--theme-accent);
  border-color: color-mix(in srgb, var(--theme-accent) 28%, transparent);
  background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
}

.status-pill.danger {
  color: var(--theme-tone-red);
  border-color: color-mix(in srgb, var(--theme-tone-red) 28%, transparent);
  background: color-mix(in srgb, var(--theme-tone-red) 10%, transparent);
}

.status-pill.working {
  color: var(--theme-text);
  border-color: color-mix(in srgb, var(--theme-tone-blue) 26%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 12%, transparent);
}

.panel,
.meta-card,
.ghost-button,
.primary-button,
.count-input,
.variant-card,
.storyboard-batch-card,
.frame-card,
.review-card,
.advanced-toggle {
  border: 1px solid color-mix(in srgb, var(--theme-tone-blue) 14%, transparent);
  background: color-mix(in srgb, var(--theme-panel) 94%, transparent);
  border-radius: 18px;
}

.meta-card strong,
.variant-copy strong,
.batch-meta strong,
.selected-model-copy strong,
.review-head strong,
.history-copy strong {
  display: block;
  font-size: 12px;
  line-height: 1.3;
}

.meta-card span,
.meta-card em,
.variant-copy span,
.variant-copy p,
.batch-meta span,
.panel-tip,
.selected-model-copy span,
.shot-meta span,
.history-copy span,
.history-copy small,
.frame-card span {
  color: var(--theme-text-secondary);
  font-size: 10px;
  line-height: 1.3;
}

.stage-summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 2px 2px;
  border-top: 1px solid var(--theme-border);
}

.stage-summary-copy {
  display: grid;
  gap: 4px;
}

.stage-summary-copy strong {
  color: var(--theme-text);
  font-size: 14px;
  font-weight: 700;
}

.stage-summary-copy span:last-child,
.stage-summary-meta span {
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.stage-summary-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.meta-card em {
  display: block;
  font-style: normal;
  margin-top: 6px;
}

.workspace-grid {
  position: relative;
  z-index: 5;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  margin-top: 0;
}

.main-column {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 10px;
}

.panel {
  position: relative;
  z-index: 1;
  padding: 10px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
}

.panel-storyboard-design {
  padding-top: 8px;
}

.storyboard-stage-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 2px 2px 14px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--theme-border);
}

.storyboard-stage-hero__copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.storyboard-stage-hero__copy strong {
  color: var(--theme-text);
  font-size: 19px;
  line-height: 1.12;
  font-weight: 800;
}

.storyboard-stage-hero__copy p {
  margin: 0;
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.storyboard-stage-hero__hint {
  display: block;
  margin-top: 6px;
  color: var(--theme-text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.storyboard-stage-hero__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.storyboard-stage-hero__button {
  min-width: 116px;
  min-height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
}

.storyboard-stage-hero__button--primary {
  min-width: 124px;
}

.panel-reference {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 98%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent)),
    radial-gradient(circle at top left, color-mix(in srgb, var(--theme-tone-blue) 12%, transparent), transparent 28%);
}

.analyze-workbench {
  display: grid;
  gap: 0;
}

.analyze-topbar,
.analyze-topbar__actions,
.analyze-hero-card__head,
.analyze-hero-card__controls,
.analyze-footer,
.analyze-footer__actions,
.analyze-panel-card__head {
  display: flex;
  align-items: center;
}

.analyze-topbar,
.analyze-hero-card,
.analyze-panel-card,
.analyze-project-card {
  border: 1px solid color-mix(in srgb, var(--theme-tone-blue) 14%, transparent);
  background: color-mix(in srgb, var(--theme-panel) 92%, transparent);
}

.analyze-topbar {
  justify-content: space-between;
  gap: 10px;
  min-height: 42px;
  padding: 0 10px;
  border-radius: 14px;
}

.analyze-breadcrumb {
  color: var(--theme-text);
  font-size: 14px;
  font-weight: 700;
}

.analyze-topbar__actions,
.analyze-hero-card__controls,
.analyze-footer__actions {
  gap: 8px;
}

.analyze-hero-card {
  display: grid;
  gap: 8px;
  padding: 10px 12px 12px;
  border-radius: 16px;
}

.analyze-hero-card__head,
.analyze-panel-card__head,
.analyze-footer {
  justify-content: space-between;
  gap: 10px;
}

.analyze-hero-card__copy,
.analyze-project-card__copy {
  display: grid;
  gap: 3px;
}

.analyze-hero-card__copy h2 {
  margin: 0;
  color: var(--theme-text);
  font-size: 20px;
  line-height: 1.2;
}

.analyze-hero-card__copy p,
.analyze-project-card__copy span,
.analyze-engine-meta,
.analyze-summary-item span,
.analyze-structure-node small,
.analyze-structure-node span,
.analyze-script-card p {
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.analyze-main-grid,
.analyze-bottom-grid {
  display: grid;
  gap: 12px;
}

.analyze-main-grid {
  grid-template-columns: minmax(280px, 0.78fr) minmax(360px, 1.02fr) minmax(260px, 0.72fr);
  align-items: start;
}

.analyze-bottom-grid {
  grid-template-columns: minmax(0, 1fr) 208px;
}

.analyze-video-card,
.analyze-results-card,
.analyze-project-info-card,
.analyze-structure-card,
.analyze-panel-card {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.analyze-video-card__head,
.analyze-structure-card__head {
  display: grid;
  gap: 4px;
}

.analyze-results-card,
.analyze-project-info-card {
  padding: 12px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-blue) 14%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 92%, transparent), color-mix(in srgb, var(--theme-panel) 94%, transparent)),
    color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.analyze-results-card__head,
.analyze-results-card__section-head,
.analyze-project-info-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.analyze-results-card__head strong,
.analyze-results-card__section-head strong,
.analyze-project-info-card__head strong,
.analyze-project-field strong {
  color: var(--theme-text);
}

.analyze-results-card__head span,
.analyze-results-card__section-head span,
.analyze-project-field span,
.analyze-results-card__empty-copy {
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.analyze-results-card__section,
.analyze-project-info-card__section {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.analyze-project-info-card__section + .analyze-project-info-card__section {
  margin-top: 2px;
}

.analyze-results-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 2px 2px;
}

.analyze-results-tabs__item {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--theme-text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.analyze-results-tabs__item.is-active {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 22%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 8%, transparent);
  color: var(--theme-text);
}

.analyze-project-field {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.analyze-project-field strong {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.analyze-video-card__head strong,
.analyze-structure-card__head strong,
.analyze-panel-card__head strong,
.analyze-project-card__copy strong,
.analyze-engine-title,
.analyze-summary-item strong {
  color: var(--theme-text);
}

.analyze-video-card__head span {
  color: var(--theme-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.analyze-video-shell {
  min-height: 260px;
  max-height: 320px;
}

.analyze-video-card__actions {
  display: flex;
  justify-content: flex-start;
  margin-top: 8px;
}

.analyze-video-meta-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.analyze-video-meta-card > strong {
  color: var(--theme-text);
  font-size: 13px;
}

.analyze-video-meta-card__grid {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 10px;
  align-items: center;
}

.analyze-video-meta-card__grid span {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.analyze-video-meta-card__grid strong {
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1.45;
  text-align: right;
  word-break: break-word;
}

.analyze-script-lines--compact {
  max-height: none;
  padding-right: 0;
}

.analyze-structure-card {
  padding: 10px;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
  align-content: start;
}

.analyze-structure-card__head strong span {
  color: var(--theme-text-secondary);
  font-weight: 500;
}

.analyze-structure-track {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  align-items: stretch;
  margin-top: 0;
}

.analyze-structure-node {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 88%, transparent);
}

.analyze-structure-node.is-highlight {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 42%, transparent);
  box-shadow: inset 0 0 0 1px rgba(109, 93, 255, 0.18);
}

.analyze-project-card__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.analyze-materials-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.analyze-material-card {
  display: grid;
  gap: 12px;
}

.analyze-material-card__head {
  display: grid;
  gap: 4px;
}

.analyze-material-card__head strong {
  color: var(--theme-text);
  font-size: 14px;
}

.analyze-material-card__head span {
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.analyze-project-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.analyze-project-pills em {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-blue) 20%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 8%, transparent);
  color: var(--theme-text);
  font-size: 11px;
  font-style: normal;
}

.analyze-footer,
.analyze-materials-grid,
.analyze-bottom-grid {
  display: none;
}

.analyze-hero-card__controls {
  align-self: flex-start;
  padding-top: 2px;
}

.analyze-structure-card__head {
  min-height: 24px;
  align-items: center;
}

.analyze-structure-node__index {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  color: var(--theme-text);
  font-size: 13px;
  font-weight: 800;
}

.analyze-structure-node strong {
  font-size: 13px;
}

.analyze-panel-card {
  padding: 12px;
  border-radius: 16px;
}

.analyze-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.analyze-summary-item {
  display: grid;
  gap: 4px;
  min-height: 76px;
  padding: 10px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.analyze-insights-panel {
  gap: 12px;
}

.analyze-insights-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(280px, 0.82fr);
  gap: 10px;
  min-width: 0;
}

.analyze-script-card {
  display: grid;
  gap: 10px;
  min-height: 240px;
  padding: 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.analyze-script-card__head,
.analyze-structure-mini__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.analyze-script-card__head span,
.analyze-structure-mini__head span,
.analyze-structure-mini__empty {
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.analyze-script-card p {
  margin: 0;
  white-space: pre-line;
}

.analyze-global-sections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.analyze-global-section,
.analyze-reverse-prompt {
  display: grid;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.analyze-global-section strong,
.analyze-reverse-prompt strong {
  color: var(--theme-text);
  font-size: 13px;
}

.analyze-global-section p,
.analyze-reverse-prompt p {
  color: var(--theme-text-secondary);
  line-height: 1.62;
}

.analyze-script-lines {
  display: grid;
  gap: 6px;
  max-height: 320px;
  overflow: auto;
  padding-right: 4px;
}

.analyze-script-lines p {
  padding: 8px 9px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
  line-height: 1.5;
}

.analyze-structure-mini {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.analyze-structure-mini__list {
  display: grid;
  gap: 6px;
}

.analyze-structure-mini__item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 8px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.analyze-structure-mini__item > span {
  display: grid;
  place-items: center;
  min-height: 32px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 88%, transparent);
  color: var(--theme-text);
  font-size: 12px;
  font-weight: 800;
}

.analyze-structure-mini__item div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.analyze-structure-mini__item strong {
  color: var(--theme-text);
  font-size: 12px;
}

.analyze-structure-mini__item small {
  color: var(--theme-text-secondary);
  line-height: 1.45;
}

.analyze-engine-card {
  justify-items: center;
  align-content: center;
  text-align: center;
  min-width: 0;
}

.analyze-engine-ring {
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  border-radius: 999px;
  border: 7px solid color-mix(in srgb, var(--theme-tone-blue) 18%, transparent);
  border-top-color: color-mix(in srgb, var(--theme-tone-blue) 90%, transparent);
  border-right-color: color-mix(in srgb, var(--theme-tone-blue) 64%, transparent);
}

.analyze-engine-ring span {
  color: var(--theme-text);
  font-size: 22px;
  font-weight: 800;
}

.analyze-footer {
  align-items: stretch;
  gap: 10px;
}

.analyze-project-card {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 1 auto;
  min-width: 0;
  padding: 10px;
  border-radius: 14px;
}

.analyze-project-card__thumb {
  flex: 0 0 auto;
  width: 86px;
  height: 58px;
  overflow: hidden;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
}

.analyze-project-card__thumb span {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--theme-text);
  font-size: 12px;
}

.analyze-primary-button {
  min-width: 220px;
}

.analyze-secondary-button {
  min-width: 160px;
}

.panel-head {
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.panel-head > div:first-child {
  display: grid;
  gap: 8px;
}

.stage-head {
  margin-bottom: 6px;
}

.stage-head__main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.stage-head__aux {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 26px;
  padding: 0 2px 6px;
  border-bottom: 1px solid var(--theme-border);
}

.stage-head__aux span {
  color: var(--theme-text-secondary);
  font-size: 10px;
  line-height: 1.4;
}

.panel-actions {
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.inline-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 9px;
  border-radius: 10px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
}

.inline-control span {
  color: var(--theme-text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.reference-layout {
  grid-template-columns: minmax(320px, 0.92fr) minmax(320px, 1.08fr);
  gap: 10px;
  margin-top: 8px;
}

.video-shell {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
}

.video-shell video {
  width: auto;
  max-width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: var(--theme-panel);
}

.product-thumb img,
.model-cover img,
.model-card-cover img,
.batch-cover img,
.frame-card img,
.history-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tall-video {
  max-height: 600px;
  min-height: 420px;
}

.history-thumb video {
  width: auto;
  max-width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  margin: 0 auto;
  background: var(--theme-panel);
}

.reference-side,
.final-side {
  display: grid;
  gap: 12px;
}

.subtle-panel {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 4%, transparent), color-mix(in srgb, var(--theme-text) 2%, transparent));
}

.history-panel {
  margin-bottom: 2px;
}

.history-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.history-panel__copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.history-panel__copy strong {
  color: var(--theme-text);
  font-size: 13px;
  line-height: 1.35;
}

.history-panel__list {
  display: grid;
  gap: 8px;
}

.history-panel__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
  color: var(--theme-text);
  text-align: left;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.history-panel__item:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--theme-tone-blue) 28%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 8%, transparent);
}

.history-panel__item.is-active {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 42%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 14%, transparent);
  box-shadow: inset 0 0 0 1px rgba(109, 93, 255, 0.18);
}

.history-panel__item-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.history-panel__item-copy strong,
.history-panel__item-copy span,
.history-panel__item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-panel__item-copy strong {
  color: var(--theme-text);
  font-size: 13px;
}

.history-panel__item-copy span,
.history-panel__item small {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.meta-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.meta-card {
  padding: 10px;
  border-radius: 14px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 4%, transparent), color-mix(in srgb, var(--theme-text) 2%, transparent));
}

.data-card {
  border-radius: 14px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 4%, transparent), color-mix(in srgb, var(--theme-text) 2%, transparent));
}

.data-card-copy {
  display: grid;
  gap: 6px;
}

.media-card {
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-blue) 18%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel-soft) 96%, transparent), color-mix(in srgb, var(--theme-panel) 96%, transparent)),
    color-mix(in srgb, var(--theme-panel) 94%, transparent);
}

.large-card {
  min-height: 132px;
}

.danger-card {
  border-color: color-mix(in srgb, var(--theme-tone-red) 28%, transparent);
  background: color-mix(in srgb, var(--theme-tone-red) 12%, transparent);
}

.context-card {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 20%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 18%, transparent);
}

.failure-card {
  display: grid;
  gap: 8px;
}

.failure-card strong,
.failure-card em {
  word-break: break-word;
}

.failure-card em {
  font-style: normal;
}

.failure-action {
  min-width: 0;
}

.secondary-action {
  opacity: 0.9;
}


.beats-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.beat-card {
  min-height: 88px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
}

.beat-card strong {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  text-transform: lowercase;
}

.variant-workbench {
  display: grid;
  gap: 10px;
}

.clone-run-mode-banner,
.clone-gate-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 78%, transparent);
}

.clone-run-mode-banner.is-auto {
  border-color: color-mix(in srgb, var(--theme-accent) 34%, transparent);
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-accent) 18%, transparent), color-mix(in srgb, var(--theme-panel) 88%, transparent));
}

.clone-run-mode-banner.is-manual {
  border-color: var(--theme-border);
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-control-hover) 20%, transparent), color-mix(in srgb, var(--theme-panel) 90%, transparent));
}

.clone-run-mode-banner__main,
.clone-gate-summary {
  display: grid;
  gap: 6px;
}

.clone-run-mode-banner__badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-panel) 48%, transparent);
}

.clone-run-mode-banner__main strong,
.clone-gate-summary strong {
  font-size: 14px;
  color: var(--theme-text);
}

.clone-run-mode-banner__main span,
.clone-run-mode-banner__stats span,
.clone-gate-summary span {
  font-size: 12px;
  line-height: 1.6;
  color: var(--theme-text);
}

.clone-run-mode-banner__stats {
  display: grid;
  gap: 6px;
  min-width: 124px;
  justify-items: end;
}

.clone-gate-summary.is-pass {
  border-color: color-mix(in srgb, var(--theme-accent) 32%, transparent);
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-accent) 22%, transparent), color-mix(in srgb, var(--theme-panel) 90%, transparent));
}

.clone-gate-summary.is-blocked {
  border-color: color-mix(in srgb, var(--theme-tone-red) 30%, transparent);
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-tone-red) 24%, transparent), color-mix(in srgb, var(--theme-panel) 92%, transparent));
}

.primary-button.is-warning {
  background: linear-gradient(135deg, var(--theme-tone-amber), var(--theme-tone-red));
  box-shadow: 0 14px 30px rgba(185, 28, 28, 0.25);
}

.variant-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 10px;
}

.variant-summary-panel {
  display: grid;
  gap: 8px;
  align-content: start;
}

.variant-summary-card {
  padding: 12px;
}

.variant-summary-card__copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.variant-summary-card__copy span {
  color: var(--theme-tone-blue);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.variant-summary-card__copy strong {
  font-size: 24px;
  line-height: 1;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.variant-summary-card__copy p {
  margin: 0;
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.45;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.variant-summary-card--asset {
  gap: 12px;
}

.variant-asset-card {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.variant-asset-card__media {
  width: 88px;
  height: 112px;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
}

.variant-asset-card__media img,
.variant-product-strip__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.variant-asset-card__media span {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--theme-text);
  font-size: 13px;
  font-weight: 700;
}

.variant-product-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding-top: 2px;
}

.variant-product-toggle {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.variant-product-toggle .ghost-button.active {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 42%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 22%, transparent);
  color: var(--theme-text);
}

.variant-product-strip__item {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
}

.variant-product-strip__remove {
  position: absolute;
  right: 6px;
  top: 6px;
  border: 0;
  padding: 4px 8px;
  background: color-mix(in srgb, var(--theme-panel) 88%, transparent);
  color: var(--theme-text);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.variant-product-meta {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.variant-product-meta span {
  color: var(--theme-text-secondary);
  font-size: 12px;
}

.variant-product-meta strong {
  color: var(--theme-text);
  font-size: 13px;
  line-height: 1.45;
  word-break: break-all;
}

.variant-product-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.variant-product-actions > * {
  min-width: 0;
}

.variant-product-actions .field-control {
  flex: 1 1 220px;
  min-width: 0;
  max-width: 100%;
}

.danger-action {
  border-color: color-mix(in srgb, var(--theme-tone-red) 26%, transparent);
  color: var(--theme-tone-red);
}

.variant-summary-card--highlight {
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-tone-blue) 18%, transparent), color-mix(in srgb, var(--theme-panel) 94%, transparent));
  border-color: color-mix(in srgb, var(--theme-tone-blue) 22%, transparent);
}

.variant-main-panel {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.variant-hero-card {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-blue) 18%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-tone-blue) 98%, transparent), color-mix(in srgb, var(--theme-panel) 96%, transparent));
}

.variant-hero-card__score {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  border-radius: 20px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-tone-blue) 96%, transparent), color-mix(in srgb, var(--theme-tone-blue) 82%, transparent));
  color: var(--theme-text);
  font-size: 22px;
  font-weight: 800;
}

.variant-hero-card__copy {
  display: grid;
  gap: 6px;
}

.variant-hero-card__copy strong {
  font-size: 16px;
  line-height: 1.25;
}

.variant-hero-card__copy p {
  margin: 0;
  color: var(--theme-text);
  line-height: 1.6;
}

.variant-hero-card__copy small {
  color: var(--theme-tone-blue);
}

.variant-list-panel {
  display: grid;
  gap: 8px;
}

.variant-card {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
  text-align: left;
  cursor: pointer;
  border-radius: 14px;
  align-items: start;
}

.variant-card--row.selected {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 38%, transparent);
  box-shadow: 0 0 0 1px rgba(138, 156, 255, 0.22) inset;
}

.variant-score {
  width: 68px;
  height: 68px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-tone-blue) 94%, transparent), color-mix(in srgb, var(--theme-tone-blue) 84%, transparent));
  color: var(--theme-text);
  font-weight: 800;
  font-size: 20px;
}

.variant-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.variant-copy__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.variant-copy__head span {
  color: var(--theme-tone-blue);
  font-size: 12px;
}

.prompt-param-table {
  display: grid;
  gap: 8px;
}

.prompt-param-table__head,
.prompt-param-table__row {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) 72px;
  gap: 10px;
  align-items: start;
}

.prompt-param-table__head {
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  color: var(--theme-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.prompt-param-table__row {
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.prompt-param-table__row strong {
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
}

.prompt-param-table__row pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1.6;
}

.prompt-param-upload {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  min-width: 0;
}

.prompt-param-upload__thumb img {
  display: block;
  width: 48px;
  height: 64px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--theme-border);
}

.prompt-param-upload__copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.prompt-param-upload__copy span {
  color: var(--theme-text-secondary);
  font-size: 12px;
}

.prompt-reference-card__actions {
  display: flex;
  gap: 6px;
  justify-content: center;
  flex-wrap: wrap;
}

.variant-shot-lines {
  display: grid;
  gap: 5px;
  margin-top: 4px;
}

.variant-shot-line {
  display: grid;
  grid-template-columns: 98px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 8px 9px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.variant-shot-line strong {
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1.45;
}

.variant-shot-line span {
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.variant-copy p {
  margin: 0;
  color: var(--theme-text);
  line-height: 1.55;
}

.variant-copy small {
  color: var(--theme-text-secondary);
  line-height: 1.5;
}

.asset-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

.selected-model {
  gap: 12px;
  align-items: center;
  margin-top: 12px;
  padding: 12px;
  min-height: 0;
}

.model-cover,
.model-card-cover {
  width: 116px;
  height: 116px;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
}

.selected-model-copy {
  display: grid;
  gap: 6px;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
  margin-top: 12px;
}

.product-thumb {
  aspect-ratio: 0.92;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
}

.add-thumb {
  display: grid;
  place-items: center;
  color: var(--theme-tone-blue);
  font-size: 32px;
  cursor: pointer;
}

.storyboard-layout,
.storyboard-design-layout {
  display: grid;
  gap: 10px;
  margin-top: 8px;
  align-items: start;
}

.storyboard-layout {
  grid-template-columns: 320px minmax(0, 1fr);
}

.storyboard-design-layout {
  grid-template-columns: minmax(0, 1fr) 304px;
}

.storyboard-column {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.storyboard-column__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 2px 0;
}

.storyboard-column__copy {
  display: grid;
  gap: 3px;
}

.storyboard-column__copy:empty {
  display: none;
}

.storyboard-column__copy strong {
  color: var(--theme-text);
  font-size: 14px;
  line-height: 1.2;
}

.storyboard-column__copy span,
.storyboard-column__head em {
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.45;
  font-style: normal;
}

.storyboard-batch-list,
.frame-grid,
.shot-video-grid,
.review-grid,
.feedback-stack,
.history-list,
.model-grid {
  gap: 8px;
}

.batch-cover {
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 16px;
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
}

.storyboard-batch-card,
.frame-card,
.shot-card,
.review-card {
  padding: 10px;
}

.storyboard-batch-card {
  padding: 9px;
}

.batch-meta {
  display: grid;
  gap: 3px;
  margin-top: 8px;
}

.batch-meta strong,
.selected-model-copy strong,
.data-card strong,
.meta-card strong {
  color: var(--theme-text);
}

.panel-tip {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px dashed var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.frame-grid,
.review-grid,
.model-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.frame-card {
  display: grid;
  gap: 8px;
}

.frame-card__media {
  min-width: 0;
}

.frame-card img {
  aspect-ratio: 9 / 16;
  border-radius: 14px;
  width: 100%;
  object-fit: cover;
}

.frame-card__copy {
  display: grid;
  gap: 2px;
}

.frame-card__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.frame-card__actions .ghost-button {
  min-width: 88px;
}

.storyboard-design-table {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 10px 12px 12px;
  border-radius: 18px;
  border: 1px solid var(--theme-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 96%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent)),
    color-mix(in srgb, var(--theme-text) 2%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 16px 42px rgba(0, 0, 0, 0.18);
}

.storyboard-design-table__head,
.storyboard-design-row {
  display: grid;
  grid-template-columns: 28px 76px minmax(340px, 2.7fr) 78px 64px 70px minmax(138px, 1.1fr) 72px;
  gap: 10px;
  align-items: center;
}

.storyboard-design-table__head {
  padding: 0 8px 4px;
  color: var(--theme-text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.storyboard-design-table__body {
  display: grid;
  gap: 8px;
}

.storyboard-design-row {
  min-width: 0;
  padding: 8px 10px;
  border-radius: 14px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 90%, transparent), color-mix(in srgb, var(--theme-panel) 96%, transparent));
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.storyboard-design-row:hover,
.storyboard-design-row:focus-visible {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 36%, transparent);
  box-shadow: 0 10px 22px rgba(2, 6, 16, 0.22);
  outline: none;
}

.storyboard-design-row.is-active {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 52%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 98%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent)),
    radial-gradient(circle at top left, color-mix(in srgb, var(--theme-tone-blue) 14%, transparent), transparent 40%);
  box-shadow: inset 0 0 0 1px rgba(109, 93, 255, 0.16);
}

.storyboard-design-row.is-working {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 34%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel-soft) 98%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent)),
    radial-gradient(circle at top left, color-mix(in srgb, var(--theme-tone-blue) 12%, transparent), transparent 42%);
}

.storyboard-design-cell {
  min-width: 0;
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1.55;
}

.storyboard-design-cell--select {
  display: flex;
  align-items: center;
  justify-content: center;
}

.storyboard-design-cell--index {
  display: grid;
  gap: 4px;
  align-content: center;
  min-height: 96px;
  padding: 12px 8px;
  border-radius: 14px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  text-align: center;
}

.storyboard-design-cell--index strong {
  color: var(--theme-text);
  font-size: 24px;
  line-height: 1;
  font-weight: 800;
}

.storyboard-design-cell--index small {
  color: var(--theme-text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.storyboard-design-cell--prompt {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}

.storyboard-design-thumb,
.storyboard-design-thumb__empty {
  width: 72px;
  aspect-ratio: 9 / 16;
  border-radius: 14px;
}

.storyboard-design-thumb {
  overflow: hidden;
  border: 1px solid var(--theme-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 95%, transparent), color-mix(in srgb, var(--theme-panel) 95%, transparent)),
    color-mix(in srgb, var(--theme-text) 3%, transparent);
}

.storyboard-design-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: var(--theme-input);
}

.storyboard-design-thumb__empty {
  display: grid;
  place-items: center;
  color: var(--theme-text-secondary);
  font-size: 12px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--theme-text) 4%, transparent), color-mix(in srgb, var(--theme-text) 1%, transparent)),
    color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.storyboard-design-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.storyboard-design-copy strong {
  color: var(--theme-text);
  font-size: 13px;
  line-height: 1.55;
  font-weight: 600;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.storyboard-design-copy small {
  color: var(--theme-text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.storyboard-design-copy__status--working {
  color: var(--theme-tone-blue);
}

.storyboard-design-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.storyboard-design-tags em {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  color: var(--theme-tone-blue);
  font-style: normal;
  font-size: 11px;
  line-height: 1;
}

.storyboard-design-cell--voice {
  color: var(--theme-tone-blue);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.storyboard-design-status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  color: var(--theme-text);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.storyboard-design-status-pill--working {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 28%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 62%, transparent);
  color: var(--theme-tone-blue);
}

.storyboard-design-cell--actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.storyboard-design-cell--actions .icon-button {
  min-width: 30px;
  width: 30px;
  height: 30px;
  padding: 0;
}

.storyboard-preview-panel {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.storyboard-preview-card {
  display: grid;
  gap: 12px;
  padding: 12px;
  border-radius: 18px;
  border: 1px solid var(--theme-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 96%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent)),
    color-mix(in srgb, var(--theme-text) 2%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 16px 42px rgba(0, 0, 0, 0.16);
}

.storyboard-preview-card--script {
  gap: 10px;
}

.storyboard-preview-card--identity-grid {
  gap: 16px;
  padding: 18px;
}

.storyboard-preview-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.storyboard-preview-card__head > div {
  display: grid;
  gap: 4px;
}

.storyboard-preview-card__head strong {
  color: var(--theme-text);
  font-size: 14px;
}

.storyboard-preview-card__head span {
  color: var(--theme-text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.storyboard-preview-media {
  aspect-ratio: 9 / 16;
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 96%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent)),
    color-mix(in srgb, var(--theme-text) 3%, transparent);
}

.storyboard-preview-media img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: var(--theme-input);
}

.identity-grid-preview-layout {
  display: grid;
  grid-template-columns: minmax(0, 520px) minmax(260px, 1fr);
  gap: 18px;
  align-items: start;
}

.storyboard-preview-media--identity-grid {
  aspect-ratio: 16 / 10;
  width: 100%;
  min-height: 220px;
  max-height: 220px;
  padding: 0;
}

.storyboard-preview-media--identity-grid img {
  object-fit: contain;
  object-position: center;
}

.storyboard-preview-media--clickable {
  cursor: pointer;
  transition: border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}

.storyboard-preview-media--clickable:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--theme-tone-blue) 32%, transparent);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22);
}

.storyboard-preview-media--clickable:disabled {
  cursor: default;
}

.storyboard-preview-media__hint {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-panel) 74%, transparent);
  border: 1px solid var(--theme-border);
  color: var(--theme-text);
  font-size: 11px;
  line-height: 1;
  backdrop-filter: blur(10px);
}

.storyboard-preview-media__empty {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  padding: 20px;
  text-align: center;
  color: var(--theme-tone-blue);
}

.storyboard-preview-media__empty strong {
  color: var(--theme-text);
  font-size: 14px;
}

.storyboard-preview-media__empty span {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
}

.storyboard-preview-media__empty--identity-grid {
  padding: 28px;
}

.identity-grid-preview-aside {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.identity-grid-preview-copy {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.identity-grid-preview-copy strong {
  color: var(--theme-text);
  font-size: 14px;
}

.identity-grid-preview-copy p {
  margin: 0;
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.65;
}

.storyboard-preview-meta--identity-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.storyboard-preview-copy {
  display: grid;
  gap: 6px;
}

.storyboard-preview-copy strong {
  color: var(--theme-text);
  font-size: 13px;
  line-height: 1.6;
}

@media (max-width: 1180px) {
  .identity-grid-preview-layout {
    grid-template-columns: 1fr;
  }

  .storyboard-preview-media--identity-grid {
    min-height: 200px;
    max-height: 200px;
  }
}

.storyboard-preview-copy span,
.storyboard-preview-script p {
  color: var(--theme-tone-blue);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-line;
}

.storyboard-preview-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.storyboard-preview-meta__item {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.storyboard-preview-meta__item span {
  color: var(--theme-text-secondary);
  font-size: 10px;
  line-height: 1.2;
}

.storyboard-preview-meta__item strong {
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1.4;
}

.storyboard-preview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.storyboard-preview-tags em {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  color: var(--theme-tone-blue);
  font-style: normal;
  font-size: 11px;
}

.storyboard-preview-error {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-red) 22%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-tone-red) 66%, transparent), color-mix(in srgb, var(--theme-panel) 78%, transparent));
}

.storyboard-preview-error__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.storyboard-preview-error__head strong {
  color: var(--theme-text);
  font-size: 13px;
}

.storyboard-preview-error__head span {
  color: var(--theme-tone-red);
  font-size: 11px;
}

.storyboard-preview-error__body,
.storyboard-preview-error__advice {
  display: grid;
  gap: 6px;
}

.storyboard-preview-error__body p,
.storyboard-preview-error__advice p {
  margin: 0;
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-line;
  word-break: break-word;
}

.storyboard-preview-error__advice span {
  color: var(--theme-tone-red);
  font-size: 11px;
}

.storyboard-preview-error__actions {
  display: flex;
  justify-content: flex-start;
}

.storyboard-preview-script {
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.modal-panel--frame-preview {
  width: min(1080px, calc(100vw - 40px));
}

.modal-panel--prompt-preview {
  width: min(1080px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  overflow: auto;
}

.prompt-preview-modal {
  width: min(1120px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  overflow: hidden;
}

.prompt-preview-modal--identity-grid {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(980px, calc(100vw - 48px));
  padding: 18px;
  border-radius: 22px;
  border: 1px solid var(--theme-border);
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--theme-tone-blue) 20%, transparent), transparent 34%),
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 98%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent));
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
}

.modal-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--theme-border);
}

.modal-card__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.prompt-preview-modal__title {
  display: grid;
  gap: 6px;
}

.prompt-preview-modal__title strong {
  color: var(--theme-text);
  font-size: 24px;
  font-weight: 800;
  line-height: 1.1;
}

.prompt-preview-modal__title p {
  margin: 0;
  color: var(--theme-tone-blue);
  font-size: 13px;
  line-height: 1.5;
}

.frame-preview-shell {
  display: grid;
  place-items: center;
  min-height: 520px;
  padding: 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 88%, transparent);
}

.frame-preview-shell img {
  max-width: 100%;
  max-height: 76vh;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
}

.compose-preview-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 10px;
  flex-wrap: wrap;
}

.compose-side-card__head small {
  color: var(--theme-text-secondary);
  font-size: 11px;
  line-height: 1.4;
  min-width: 0;
  text-align: right;
}

.compose-output-dir {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.compose-output-dir strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compose-side-actions {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  min-width: 0;
}

.publish-modal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.publish-field {
  display: grid;
  gap: 6px;
}

.publish-field--full {
  grid-column: 1 / -1;
}

.publish-field span {
  color: var(--theme-text);
  font-size: 12px;
  font-weight: 700;
}

.publish-field strong {
  min-height: 42px;
  padding: 10px 14px;
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  color: var(--theme-text);
  line-height: 1.5;
}

.inline-form-message {
  margin-top: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 18%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  color: var(--theme-text);
  font-size: 13px;
}

.frame-card strong {
  display: block;
  font-size: 13px;
}

.review-card {
  display: grid;
  grid-template-rows: auto auto auto auto auto 1fr;
  gap: 10px;
  align-content: start;
  min-width: 0;
  overflow: hidden;
  min-height: 452px;
}

.review-head {
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  min-height: 40px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--theme-border);
}

.review-shell {
  aspect-ratio: 9 / 16;
}

.mini-pill {
  min-height: 28px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 700;
}

.mini-pill.replaced {
  color: var(--theme-tone-blue);
  background: color-mix(in srgb, var(--theme-tone-blue) 16%, transparent);
  border-color: color-mix(in srgb, var(--theme-tone-blue) 22%, transparent);
}

.mini-pill--ghost {
  color: var(--theme-tone-blue);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  border-color: var(--theme-border);
}

.review-card .mini-pill {
  justify-self: end;
}

.shot-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  min-height: 18px;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
}

.task-meta {
  padding-top: 6px;
  border-top: 1px dashed var(--theme-border);
}

.task-meta span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shot-error {
  padding: 10px 11px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-red) 18%, transparent);
  background: color-mix(in srgb, var(--theme-tone-red) 8%, transparent);
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1.55;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.shot-workbench {
  display: grid;
  gap: 12px;
  margin-top: 10px;
}

.shot-workbench--reference {
  gap: 10px;
}

.panel-video-stage {
  position: relative;
  z-index: 0;
  padding: 6px;
}

.panel-video-stage :deep(.clone-stage-header) {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 6px 8px 12px;
  border-bottom: 1px solid var(--theme-border);
}

.panel-video-stage :deep(.stage-head) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 24px;
  margin: 0;
}

.video-render-hints-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  margin: 10px 8px 0;
  border: 1px solid var(--theme-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--theme-panel) 82%, transparent);
}

.video-render-hints-card__copy {
  display: grid;
  gap: 4px;
}

.video-render-hints-card__copy strong {
  color: var(--theme-text);
  font-size: 13px;
}

.video-render-hints-card__copy span {
  color: var(--theme-tone-blue);
  font-size: 12px;
  line-height: 1.5;
}

.video-render-hints-card__controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.video-render-hints-card__field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.video-render-hints-card__field span {
  color: var(--theme-text);
  font-size: 11px;
  font-weight: 700;
}

.video-render-hints-card__field select {
  min-width: 180px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--theme-border);
  background: var(--theme-panel);
  color: var(--theme-text);
  padding: 0 12px;
}

.panel-video-stage :deep(.stage-head__main) {
  display: grid;
  gap: 8px;
  padding: 4px 0 2px;
}

.panel-video-stage :deep(.stage-head__main h2) {
  font-size: 18px;
  line-height: 1.12;
  letter-spacing: 0.01em;
}

.panel-video-stage :deep(.stage-head__main p) {
  max-width: 560px;
  color: var(--theme-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.panel-video-stage :deep(.stage-head__actions) {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  align-self: center;
  min-height: 100%;
  margin-left: 0;
  padding: 0 0 0 24px;
  border-left: 1px solid var(--theme-border);
}

.panel-video-stage :deep(.stage-head__actions .primary-button) {
  min-width: 220px;
  height: 42px;
  padding: 0 18px;
}

.panel-video-stage :deep(.stage-head__aux) {
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: 24px;
  padding: 6px 0 0;
  border-bottom: 0;
}

.panel-video-stage :deep(.stage-head__aux span) {
  color: var(--theme-text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.video-stage-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 268px;
  gap: 12px;
  align-items: start;
}

.video-stage-layout--workarea {
  gap: 10px;
  padding: 6px;
  border-radius: 0;
  border: 1px solid var(--theme-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 96%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent)),
    color-mix(in srgb, var(--theme-text) 2%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 16px 42px rgba(0, 0, 0, 0.18);
}

.video-stage-main {
  min-width: 0;
  display: grid;
  gap: 0;
}

.video-stage-preview {
  min-width: 0;
  min-height: 100%;
  max-width: 268px;
  overflow: hidden;
}

.compose-fallback-bar {
  position: relative;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 92%, transparent), color-mix(in srgb, var(--theme-panel) 96%, transparent));
}

.compose-fallback-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
  pointer-events: none;
}

.compose-fallback-copy strong {
  color: var(--theme-text);
  font-size: 13px;
  line-height: 1.35;
}

.compose-fallback-copy span {
  color: var(--theme-text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.video-stage-preview :deep(.console-sidebar) {
  position: relative;
  top: auto;
  min-height: 100%;
  z-index: 0;
  min-width: 0;
  overflow: hidden;
}

.shot-overview-panel,
.shot-table-panel {
  min-width: 0;
  min-height: 0;
  border-radius: 0;
  border: 1px solid var(--theme-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel-soft) 98%, transparent), color-mix(in srgb, var(--theme-panel) 96%, transparent)),
    color-mix(in srgb, var(--theme-text) 2%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.shot-overview-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) repeat(4, minmax(0, 0.7fr)) auto;
  gap: 8px;
  padding: 12px 14px;
  align-items: center;
  border-color: var(--theme-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel-soft) 98%, transparent), color-mix(in srgb, var(--theme-panel) 96%, transparent)),
    color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.shot-overview-progress {
  display: grid;
  gap: 10px;
}

.shot-overview-progress__copy {
  display: grid;
  gap: 4px;
}

.shot-overview-progress__copy strong {
  color: var(--theme-text);
  font-size: 16px;
}

.shot-overview-progress__copy small {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.shot-overview-progress__meter {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.shot-progress-track {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-text) 5%, transparent);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
}

.shot-progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--theme-tone-blue), var(--theme-tone-violet));
  box-shadow: 0 0 20px rgba(109, 93, 255, 0.35);
}

.shot-overview-progress__meter strong {
  color: var(--theme-text);
  font-size: 14px;
}

.shot-overview-stats {
  display: contents;
}

.shot-stat-card {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.shot-stat-card span {
  color: var(--theme-text-secondary);
  font-size: 10px;
  text-transform: uppercase;
}

.shot-stat-card strong {
  color: var(--theme-text);
  font-size: 15px;
}

.shot-stat-card--danger strong {
  color: var(--theme-tone-red);
}

.shot-overview-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.shot-reference-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  min-height: min(57vh, 780px);
}

.shot-table-panel {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  overflow: hidden;
  min-height: 100%;
  border-color: var(--theme-border);
  padding-top: 4px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel-soft) 98%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent)),
    color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.shot-reference-scroll {
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.shot-table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--theme-border);
}

.shot-table-tabs {
  display: flex;
  align-items: center;
  gap: 10px;
}

.shot-table-tab {
  min-height: 40px;
  padding: 0 18px;
  border-radius: 0;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  color: var(--theme-tone-blue);
  font-size: 14px;
  font-weight: 700;
}

.shot-table-tab--active {
  color: var(--theme-text);
  border-color: color-mix(in srgb, var(--theme-tone-blue) 36%, transparent);
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-tone-blue) 42%, transparent), color-mix(in srgb, var(--theme-tone-blue) 18%, transparent));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.shot-table-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shot-table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 1%, transparent);
}

.shot-table-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  color: var(--theme-text);
  font-size: 14px;
  font-weight: 700;
}

.shot-summary-link {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--theme-tone-blue);
  font-size: 13px;
  font-weight: 700;
}

.shot-summary-link.active {
  color: var(--theme-text);
  border-color: color-mix(in srgb, var(--theme-tone-blue) 26%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 14%, transparent);
}

.shot-reference-header,
.shot-reference-row {
  min-width: 1100px;
  display: grid;
  grid-template-columns: 64px 96px minmax(220px, 1.65fr) 72px 96px 116px 340px;
  gap: 8px;
  align-items: center;
}

.shot-reference-header {
  padding: 10px 12px;
  color: var(--theme-text-secondary);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  white-space: nowrap;
}

.shot-reference-header > span:nth-child(2) {
  justify-self: center;
}

.shot-reference-header > span:nth-child(4),
.shot-reference-header > span:nth-child(5) {
  justify-self: start;
}

.shot-reference-header > span:nth-child(6) {
  justify-self: start;
}

.shot-reference-header > span:nth-child(7) {
  justify-self: end;
}

.shot-table-body--reference {
  padding: 0;
  gap: 0;
  overflow: auto;
  min-width: max-content;
}

.shot-reference-row {
  width: 100%;
  padding: 10px 12px;
  color: var(--theme-text);
  text-align: left;
  border-bottom: 1px solid var(--theme-border);
  background: transparent;
  transition: background 160ms ease, border-color 160ms ease;
}

.shot-reference-row:hover {
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
}

.shot-reference-row.active {
  background: linear-gradient(90deg, color-mix(in srgb, var(--theme-tone-blue) 34%, transparent), color-mix(in srgb, var(--theme-tone-blue) 16%, transparent));
  box-shadow:
    inset 3px 0 0 rgba(74, 230, 158, 0.9),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.shot-reference-row.failed {
  box-shadow: inset 2px 0 0 rgba(239, 68, 68, 0.8);
}

.shot-reference-row.ready:not(.failed) {
  box-shadow: none;
}

.shot-reference-cell {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.shot-reference-cell--metric strong {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 0;
  background: color-mix(in srgb, var(--theme-text) 5%, transparent);
  color: var(--theme-text);
  font-size: 11px;
  font-weight: 700;
}

.shot-reference-cell--thumb {
  justify-items: center;
}

.shot-reference-cell:not(.shot-reference-cell--copy):not(.shot-reference-cell--status):not(.shot-reference-cell--actions) {
  white-space: nowrap;
}

.shot-reference-cell--index strong {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 0;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 6%, transparent), color-mix(in srgb, var(--theme-text) 3%, transparent));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.shot-reference-cell--index small,
.shot-reference-cell--copy small,
.shot-reference-status-copy small {
  color: var(--theme-text-secondary);
  font-size: 10px;
  line-height: 1.45;
}

.shot-reference-cell--copy strong,
.shot-reference-status-copy strong {
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1.45;
}

.shot-reference-cell--copy strong,
.shot-reference-cell--copy small {
  min-width: 0;
}

.shot-reference-cell--copy strong {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.shot-reference-cell--copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shot-reference-cell--status {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.shot-reference-status-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.shot-reference-status-copy strong,
.shot-reference-status-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shot-reference-cell--actions {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
  white-space: nowrap;
  min-width: 340px;
  flex-wrap: nowrap;
  overflow: visible;
}

.shot-thumb--large {
  width: 84px;
  height: 52px;
  border-radius: 0;
  border: 1px solid var(--theme-border);
  overflow: hidden;
}

.icon-button {
  min-width: 32px;
  min-height: 32px;
  flex: 0 0 32px;
  padding: 0;
  border-radius: 0;
  border-color: var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  color: var(--theme-text);
}

.icon-button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 22%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 12%, transparent);
}

.action-button {
  min-width: 58px;
  min-height: 32px;
  padding: 0 8px;
  border-radius: 0;
  white-space: nowrap;
  font-size: 12px;
}

.shot-preview-side {
  min-width: 0;
}

.shot-preview-card {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel-soft) 98%, transparent), color-mix(in srgb, var(--theme-panel) 96%, transparent)),
    color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.shot-preview-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.shot-preview-card__title {
  display: grid;
  gap: 4px;
}

.shot-preview-card__head strong {
  color: var(--theme-text);
  font-size: 15px;
}

.shot-preview-card__title small {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.shot-preview-card__shell {
  aspect-ratio: 9 / 16;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
}

.shot-preview-card__shell video {
  background: var(--theme-panel);
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  min-height: 0;
}

.shot-preview-card__hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  pointer-events: none;
}

.shot-preview-card__hud span {
  padding: 6px 10px;
  border-radius: 0;
  color: var(--theme-text);
  font-size: 10px;
  background: color-mix(in srgb, var(--theme-panel) 72%, transparent);
  border: 1px solid var(--theme-border);
}

.shot-preview-empty {
  min-height: 100%;
}

.shot-preview-card__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.shot-preview-card__status-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shot-preview-card__status-copy {
  display: grid;
  gap: 2px;
}

.shot-preview-card__status-copy strong {
  color: var(--theme-text);
  font-size: 12px;
}

.shot-preview-card__status-copy small {
  color: var(--theme-text-secondary);
  font-size: 10px;
}

.shot-preview-card__meta {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 12px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 1%, transparent);
}

.shot-preview-card__meta span {
  color: var(--theme-text-secondary);
  font-size: 10px;
  text-transform: uppercase;
}

.shot-preview-card__meta strong {
  color: var(--theme-text);
  font-size: 11px;
  line-height: 1.55;
  word-break: break-word;
}

.shot-thumb {
  width: 72px;
  height: 56px;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 95%, transparent), color-mix(in srgb, var(--theme-panel) 95%, transparent));
}

.shot-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.shot-thumb--empty {
  display: grid;
  place-items: center;
  color: var(--theme-text-secondary);
  font-size: 9px;
  letter-spacing: 0.08em;
}

.queue-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.03);
}

.queue-dot--success {
  background: var(--theme-accent);
}

.queue-dot--danger {
  background: var(--theme-tone-red);
}

.queue-dot--working {
  background: var(--theme-accent);
}

.queue-dot--idle {
  background: var(--theme-control-hover);
}

.state-card {
  display: grid;
  align-content: center;
  gap: 6px;
}

.state-card strong {
  color: var(--theme-text);
  font-size: 13px;
  font-weight: 700;
}

.state-card span {
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.state-card--empty {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 3%, transparent), color-mix(in srgb, var(--theme-text) 2%, transparent)),
    color-mix(in srgb, var(--theme-text) 2%, transparent);
  border: 1px dashed color-mix(in srgb, var(--theme-tone-blue) 18%, transparent);
}

.state-card--pending {
  background: color-mix(in srgb, var(--theme-tone-blue) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-tone-blue) 16%, transparent);
}

.state-card--danger {
  background: color-mix(in srgb, var(--theme-tone-red) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-tone-red) 18%, transparent);
}

.compose-studio {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(300px, 340px);
  gap: 28px;
  margin-top: 14px;
  align-items: start;
}

.compose-studio__main,
.compose-studio__side {
  display: grid;
  gap: 22px;
  min-width: 0;
}

.compose-stage-card,
.compose-sequence-card,
.compose-side-card {
  padding: 20px;
  border-radius: 22px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 96%, transparent), color-mix(in srgb, var(--theme-panel) 99%, transparent));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.compose-stage-card {
  padding: 0;
  overflow: hidden;
}

.compose-stage-card__media {
  width: 100%;
  min-height: 480px;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--theme-input);
}

.compose-stage-card__media video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  background: var(--theme-input);
}

.compose-stage-card__media.is-portrait video,
.compose-stage-card__media.is-square video {
  object-fit: contain;
}

.compose-sequence-card {
  display: grid;
  gap: 18px;
}

.compose-sequence-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.compose-sequence-strip {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(116px, 132px);
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 6px;
}

.compose-sequence-item {
  display: grid;
  gap: 10px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 78%, transparent);
  cursor: pointer;
  min-width: 0;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.compose-sequence-item:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--theme-tone-blue) 28%, transparent);
}

.compose-sequence-item.active {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 62%, transparent);
  box-shadow: 0 0 0 1px rgba(112, 92, 255, 0.22);
  background: color-mix(in srgb, var(--theme-panel-soft) 88%, transparent);
}

.compose-sequence-item__index {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-text) 8%, transparent);
  color: var(--theme-text);
  font-size: 12px;
  font-weight: 800;
}

.compose-sequence-item__thumb {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
}

.compose-sequence-item__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.compose-sequence-item__meta {
  display: grid;
  gap: 4px;
}

.compose-sequence-item__meta strong {
  color: var(--theme-text);
  font-size: 13px;
  line-height: 1.25;
}

.compose-sequence-item__meta small {
  color: var(--theme-tone-blue);
  font-size: 12px;
}

.compose-sequence-detail {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding-top: 2px;
}

.compose-sequence-detail__copy {
  display: grid;
  gap: 6px;
}

.compose-sequence-detail__copy strong {
  color: var(--theme-text);
  font-size: 16px;
}

.compose-sequence-detail__copy small {
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.compose-sequence-detail__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.compose-score-card {
  display: grid;
  gap: 18px;
}

.compose-score-panel {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
}

.compose-score-ring {
  display: grid;
  place-items: center;
  width: 86px;
  height: 86px;
  border-radius: 999px;
  border: 6px solid color-mix(in srgb, var(--theme-tone-blue) 20%, transparent);
  border-top-color: color-mix(in srgb, var(--theme-tone-blue) 95%, transparent);
  border-right-color: color-mix(in srgb, var(--theme-tone-blue) 88%, transparent);
}

.compose-score-ring span {
  color: var(--theme-text);
  font-size: 22px;
  font-weight: 800;
}

.compose-score-copy {
  display: grid;
  gap: 6px;
}

.compose-score-copy span {
  color: var(--theme-text-secondary);
  font-size: 12px;
}

.compose-score-copy strong {
  color: var(--theme-tone-violet);
  font-size: 18px;
  line-height: 1.2;
}

.compose-score-list {
  display: grid;
  gap: 10px;
}

.compose-score-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--theme-text);
  font-size: 13px;
}

.compose-score-list__item::before {
  content: '';
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--theme-accent);
  box-shadow: 0 0 0 4px rgba(82, 214, 143, 0.12);
}

.compose-score-list__item span {
  flex: 1 1 auto;
  color: var(--theme-text);
}

.compose-score-list__item strong {
  color: var(--theme-text);
  font-size: 12px;
}

.compose-score-optimize {
  min-height: 46px;
  justify-content: center;
}

.compose-score-card small {
  color: var(--theme-text-secondary);
  font-size: 11px;
  line-height: 1.6;
}

.compose-estimate-card {
  display: grid;
  gap: 18px;
}

.compose-estimate-card .compose-export-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.panel-reference :deep(.stage-head__main p),
.variant-workbench :deep(.stage-head__main p),
.panel-compose-stage :deep(.stage-head__main p),
.panel-final-stage :deep(.stage-head__main p) {
  max-width: 520px;
  color: var(--theme-tone-blue);
  font-size: 11px;
  line-height: 1.5;
}

.panel-reference :deep(.stage-head__main h2),
.variant-workbench :deep(.stage-head__main h2),
.panel-compose-stage :deep(.stage-head__main h2),
.panel-final-stage :deep(.stage-head__main h2) {
  font-size: 18px;
  line-height: 1.12;
  letter-spacing: 0.01em;
}

.panel-compose-stage :deep(.stage-head__aux),
.panel-final-stage :deep(.stage-head__aux) {
  display: none;
}

.panel-reference :deep(.stage-head__main),
.variant-workbench :deep(.stage-head__main),
.panel-compose-stage :deep(.stage-head__main) {
  gap: 4px;
  padding: 0;
}

.product-analysis-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 86%, transparent);
}

.product-analysis-card__summary,
.product-analysis-card__item,
.product-analysis-card__rules {
  display: grid;
  gap: 4px;
}

.product-analysis-card__summary span,
.product-analysis-card__item span,
.product-analysis-card__rules span {
  font-size: 11px;
  color: var(--theme-tone-blue);
}

.product-analysis-card__summary strong,
.product-analysis-card__item strong {
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1.55;
  font-weight: 500;
}

.product-analysis-card__list {
  display: grid;
  gap: 10px;
}

.product-analysis-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.product-analysis-card__tags em {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-blue) 18%, transparent);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  color: var(--theme-text);
  font-size: 11px;
  font-style: normal;
  line-height: 1;
}

.prompt-highlight-card {
  display: grid;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-amber) 26%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-tone-amber) 42%, transparent), color-mix(in srgb, var(--theme-panel) 54%, transparent));
  box-shadow: inset 0 1px 0 rgba(255, 220, 140, 0.08);
}

.prompt-highlight-card__head,
.prompt-highlight-card__block {
  display: grid;
  gap: 6px;
}

.prompt-highlight-card__head strong,
.prompt-highlight-card__block span {
  color: var(--theme-tone-amber);
}

.prompt-highlight-card__head span {
  font-size: 11px;
  color: color-mix(in srgb, var(--theme-tone-amber) 78%, transparent);
}

.prompt-highlight-card__block pre {
  margin: 0;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-amber) 14%, transparent);
  background: color-mix(in srgb, var(--theme-input) 42%, transparent);
  color: var(--theme-text);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  font-size: 12px;
}

.prompt-reference-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.prompt-reference-grid--single {
  grid-template-columns: minmax(0, 220px);
}

.prompt-reference-card {
  display: grid;
  gap: 8px;
  text-decoration: none;
  color: var(--theme-text);
}

.prompt-reference-card img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-amber) 16%, transparent);
  background: color-mix(in srgb, var(--theme-input) 70%, transparent);
}

.prompt-reference-card span,
.prompt-reference-empty {
  font-size: 11px;
  line-height: 1.45;
  color: color-mix(in srgb, var(--theme-tone-amber) 82%, transparent);
  word-break: break-word;
}

.prompt-reference-empty {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px dashed color-mix(in srgb, var(--theme-tone-amber) 18%, transparent);
  background: color-mix(in srgb, var(--theme-input) 28%, transparent);
}

.prompt-diagnostic-card {
  display: grid;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 88%, transparent);
}

.prompt-diagnostic-card__head,
.prompt-diagnostic-item {
  display: grid;
  gap: 4px;
}

.prompt-diagnostic-card__head span,
.prompt-diagnostic-item span,
.prompt-diagnostic-item small {
  font-size: 11px;
  color: var(--theme-tone-blue);
}

.prompt-diagnostic-item strong {
  color: var(--theme-text);
  font-size: 18px;
  line-height: 1.1;
}

.prompt-diagnostic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.prompt-health-banner {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
}

.prompt-health-banner strong {
  font-size: 13px;
  line-height: 1.2;
}

.prompt-health-banner span {
  font-size: 11px;
  line-height: 1.5;
}

.prompt-health-banner.is-success {
  border-color: color-mix(in srgb, var(--theme-accent) 24%, transparent);
  background: color-mix(in srgb, var(--theme-panel-soft) 88%, transparent);
}

.prompt-health-banner.is-success strong {
  color: var(--theme-accent);
}

.prompt-health-banner.is-success span {
  color: color-mix(in srgb, var(--theme-accent) 82%, transparent);
}

.prompt-health-banner.is-warning {
  border-color: color-mix(in srgb, var(--theme-tone-amber) 26%, transparent);
  background: color-mix(in srgb, var(--theme-panel-soft) 88%, transparent);
}

.prompt-health-banner.is-warning strong {
  color: var(--theme-tone-amber);
}

.prompt-health-banner.is-warning span {
  color: color-mix(in srgb, var(--theme-tone-amber) 84%, transparent);
}

.prompt-health-banner.is-danger {
  border-color: color-mix(in srgb, var(--theme-tone-red) 26%, transparent);
  background: color-mix(in srgb, var(--theme-tone-red) 88%, transparent);
}

.prompt-health-banner.is-danger strong {
  color: var(--theme-tone-red);
}

.prompt-health-banner.is-danger span {
  color: color-mix(in srgb, var(--theme-tone-red) 84%, transparent);
}

.panel-compose-stage {
  margin-top: -2px;
}

.panel-compose-stage :deep(.stage-head),
.panel-compose-stage :deep(.stage-head__actions),
.panel-compose-stage :deep(.stage-head__actions .primary-button) {
  position: relative;
  z-index: 20;
  pointer-events: auto;
}

.compose-workbench {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.15fr) minmax(300px, 356px);
  gap: 16px;
  margin-top: 6px;
  align-items: start;
  min-width: 0;
}

.compose-canvas-panel,
.compose-timeline-panel,
.compose-side-card {
  display: grid;
  gap: 14px;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 96%, transparent), color-mix(in srgb, var(--theme-panel) 99%, transparent));
  min-width: 0;
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.compose-canvas-panel {
  align-items: start;
}

.compose-panel-head {
  width: 100%;
}

.compose-timeline-panel {
  align-content: start;
}

.compose-list-head,
.compose-side-card__head,
.compose-score-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}

.compose-list-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.compose-list-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.compose-list-copy strong {
  color: var(--theme-text);
  font-size: 15px;
  line-height: 1.3;
}

.compose-list-copy p {
  margin: 0;
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.compose-canvas-shell {
  position: relative;
  width: 100%;
  height: clamp(460px, 58vh, 760px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 98%, transparent), var(--theme-panel));
}

.compose-canvas-shell video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  background: var(--theme-panel);
}

.compose-canvas-frame {
  width: min(100%, 360px);
  height: 100%;
  max-width: 100%;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 98%, transparent);
}

.compose-canvas-frame.is-portrait {
  aspect-ratio: 9 / 16;
}

.compose-canvas-frame.is-square {
  aspect-ratio: 1 / 1;
}

.compose-canvas-frame.is-landscape {
  aspect-ratio: 16 / 9;
}

.compose-timeline-list {
  display: contents;
}

.compose-timeline-stage {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.compose-shot-strip {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(132px, 156px);
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 4px;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  will-change: scroll-position;
}

.compose-shot-strip__item {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 94%, transparent);
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
  min-width: 0;
}

.compose-shot-strip__item:hover {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 22%, transparent);
}

.compose-shot-strip__item.active {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 58%, transparent);
  background: color-mix(in srgb, var(--theme-panel-soft) 94%, transparent);
}

.compose-shot-strip__index {
  color: var(--theme-text);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.compose-shot-strip__thumb {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 9 / 16;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
}

.compose-shot-strip__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.compose-shot-strip__thumb span {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.compose-shot-strip__meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.compose-shot-strip__meta strong {
  color: var(--theme-text);
  font-size: 13px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.compose-shot-strip__meta small {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.compose-shot-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  gap: 16px;
  min-width: 0;
}

.compose-shot-preview__media,
.compose-shot-preview__side,
.compose-shot-info-card,
.compose-shot-tip-card {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.compose-shot-preview__head,
.compose-shot-info-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.compose-shot-preview__copy {
  display: grid;
  gap: 4px;
}

.compose-shot-preview__copy strong,
.compose-shot-info-card__head strong {
  color: var(--theme-text);
  font-size: 15px;
  line-height: 1.35;
}

.compose-shot-info-card__head small {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.compose-shot-preview__frame {
  width: 100%;
  min-height: 440px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 96%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent));
}

.compose-shot-preview__frame video,
.compose-shot-preview__frame img {
  width: min(100%, 380px);
  height: auto;
  aspect-ratio: 9 / 16;
  object-fit: cover;
  display: block;
  border-radius: 14px;
  border: 1px solid var(--theme-border);
}

.compose-shot-detail__empty {
  color: var(--theme-text-secondary);
  font-size: 14px;
}

.compose-shot-info-card,
.compose-shot-tip-card {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.compose-shot-info-grid {
  display: grid;
  gap: 10px;
}

.compose-shot-info-item {
  display: grid;
  gap: 4px;
}

.compose-shot-info-item span,
.compose-shot-tip-card small {
  color: var(--theme-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.compose-shot-info-item strong,
.compose-shot-tip-card strong {
  color: var(--theme-text);
  font-size: 13px;
  line-height: 1.5;
}

.compose-shot-tip-card p {
  margin: 0;
  color: var(--theme-tone-blue);
  font-size: 13px;
  line-height: 1.6;
}

.compose-timeline-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.compose-timeline-copy__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.compose-timeline-copy__head strong {
  color: var(--theme-text);
  font-size: 13px;
  line-height: 1.35;
}

.compose-timeline-copy p {
  margin: 0;
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.compose-timeline-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.compose-timeline-actions .icon-button {
  min-width: 34px;
  height: 34px;
  padding: 0;
}

.compose-bottom-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.compose-side-rail,
.compose-score-copy,
.compose-check-list,
.compose-option-group {
  display: grid;
}

.compose-side-rail {
  gap: 12px;
  min-width: 0;
  width: 100%;
  max-width: none;
  align-content: start;
}

.compose-status-ok {
  color: var(--theme-accent);
}

.compose-option-group small {
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.compose-option-group--select strong::after {
  content: '⌄';
  margin-left: 10px;
  color: var(--theme-tone-blue);
}

.compose-score-card {
  gap: 16px;
}

.compose-score-body {
  justify-content: flex-start;
}

.compose-score-ring {
  display: grid;
  place-items: center;
  width: 92px;
  height: 92px;
  border-radius: 50%;
  border: 6px solid color-mix(in srgb, var(--theme-tone-blue) 88%, transparent);
  box-shadow: 0 0 0 6px rgba(109, 93, 255, 0.08);
}

.compose-score-ring span {
  color: var(--theme-text);
  font-size: 28px;
  font-weight: 700;
}

.compose-score-copy {
  gap: 6px;
}

.compose-score-copy span,
.compose-option-group > span,
.compose-export-stat span {
  color: var(--theme-tone-blue);
  font-size: 12px;
}

.compose-score-copy strong {
  color: var(--theme-tone-blue);
  font-size: 28px;
  line-height: 1.1;
}

.compose-check-list {
  gap: 10px;
}

.compose-check-list span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--theme-tone-blue);
  font-size: 13px;
}

.compose-check-list i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--theme-accent);
  box-shadow: 0 0 0 4px rgba(81, 208, 143, 0.12);
}

.compose-side-button,
.compose-export-button {
  width: 100%;
}

.compose-export-button {
  min-height: 54px;
  border-radius: 18px;
  font-size: 17px;
  font-weight: 800;
}

.compose-side-button {
  min-height: 42px;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
  color: var(--theme-text);
  font-size: 13px;
  font-weight: 700;
  box-shadow: none;
}

.compose-side-button:hover {
  background: color-mix(in srgb, var(--theme-text) 6%, transparent);
}

.compose-option-group {
  gap: 8px;
  min-width: 0;
}

.compose-chip-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.compose-chip {
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  color: var(--theme-tone-blue);
  font-size: 13px;
}

.compose-chip.is-active {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 52%, transparent);
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-tone-blue) 90%, transparent), color-mix(in srgb, var(--theme-tone-violet) 90%, transparent));
  color: var(--theme-text);
}

.compose-export-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

.compose-export-stat {
  display: grid;
  gap: 4px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 4%, transparent), color-mix(in srgb, var(--theme-text) 2%, transparent));
  min-width: 0;
  overflow: hidden;
}

.compose-export-stat strong {
  color: var(--theme-text);
  font-size: 18px;
  line-height: 1.2;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compose-tip-card {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 12px;
  margin-top: 16px;
  padding: 18px;
  border-radius: 22px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 92%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent));
}

.compose-tip-card__icon {
  color: var(--theme-tone-violet);
  font-size: 18px;
  line-height: 1.2;
}

.compose-tip-card strong {
  color: var(--theme-text);
  font-size: 14px;
}

.compose-tip-card p {
  margin: 6px 0 0;
  color: var(--theme-tone-blue);
  font-size: 13px;
  line-height: 1.6;
}

.sticky-panel {
  position: relative;
}

.console-sidebar {
  padding: 14px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 98%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent));
}

.console-sidebar .panel-head {
  margin-bottom: 2px;
}

.feedback-stack--preview {
  display: grid;
}

.sidebar-section--preview {
  gap: 7px;
}

.video-stage-preview :deep(.console-sidebar__body) {
  gap: 8px;
}

.video-stage-preview :deep(.console-sidebar .panel-head) {
  padding-bottom: 4px;
}

.sidebar-preview-shell {
  min-height: 0;
  aspect-ratio: 9 / 16;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
  overflow: hidden;
  border-radius: 0;
  border: 1px solid var(--theme-border);
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--theme-tone-blue) 16%, transparent), transparent 34%),
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 96%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.video-stage-preview :deep(.console-sidebar) {
  padding: 9px;
  border-radius: 0;
  border: 1px solid var(--theme-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel-soft) 98%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent)),
    color-mix(in srgb, var(--theme-text) 2%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.sidebar-preview-shell video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: var(--theme-panel);
}

.sidebar-preview-shell__hud {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 10px 0;
  pointer-events: none;
  min-width: 0;
}

.sidebar-preview-shell__hud span {
  min-width: 0;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 0;
  color: var(--theme-text);
  font-size: 9px;
  background: color-mix(in srgb, var(--theme-panel) 74%, transparent);
  border: 1px solid var(--theme-border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-section {
  display: grid;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--theme-border);
}

.sidebar-section:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.sidebar-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.sidebar-section__head strong {
  color: var(--theme-text);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-section__head small {
  color: var(--theme-text-secondary);
  font-size: 9px;
  flex: 0 0 auto;
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-meta-grid {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 10px;
  align-items: center;
}

.compact-meta-grid span {
  margin: 0;
}

.compact-meta-grid strong {
  margin: 0;
  text-align: right;
  word-break: break-word;
}

.prompt-preview-card {
  display: grid;
  gap: 10px;
}

.prompt-preview-card--identity-grid {
  min-height: 0;
  gap: 14px;
  overflow: auto;
  padding-right: 4px;
}

.prompt-preview-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.prompt-preview-card__head > span {
  color: var(--theme-text);
  font-size: 12px;
  font-weight: 700;
}

.prompt-preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--theme-tone-blue);
  font-size: 11px;
}

.identity-grid-preview-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.identity-grid-preview-summary--compact {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.identity-grid-preview-stat {
  display: grid;
  gap: 8px;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 4%, transparent), color-mix(in srgb, var(--theme-text) 2%, transparent));
}

.identity-grid-preview-stat span {
  color: var(--theme-tone-blue);
  font-size: 12px;
  line-height: 1.4;
}

.identity-grid-preview-stat strong {
  color: var(--theme-text);
  font-size: 22px;
  font-weight: 800;
  line-height: 1.1;
  text-transform: none;
  word-break: break-word;
}

.identity-grid-preview-stat--compact {
  gap: 6px;
  padding: 12px 14px;
  border-radius: 16px;
}

.identity-grid-preview-stat--compact strong {
  font-size: 15px;
  line-height: 1.35;
}

.identity-grid-preview-main {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: 14px;
  align-items: start;
}

.identity-grid-preview-column {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.identity-grid-preview-section {
  padding: 14px 16px 16px;
  border-radius: 20px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 4%, transparent), color-mix(in srgb, var(--theme-text) 2%, transparent)),
    color-mix(in srgb, var(--theme-text) 2%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.identity-grid-asset-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}

.identity-grid-asset-group {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.identity-grid-asset-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.identity-grid-asset-group__head strong {
  color: var(--theme-text);
  font-size: 13px;
  font-weight: 800;
}

.identity-grid-asset-group__head span {
  color: var(--theme-tone-blue);
  font-size: 11px;
}

.prompt-preview-section {
  display: grid;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 20px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.prompt-preview-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.prompt-preview-section__header strong {
  color: var(--theme-text);
  font-size: 14px;
  font-weight: 800;
}

.prompt-preview-section__header span {
  color: var(--theme-tone-blue);
  font-size: 12px;
  line-height: 1.5;
  text-align: right;
}

.identity-grid-preview-usage {
  gap: 14px;
}

.prompt-preview-paths {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.prompt-preview-paths--chips span {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-blue) 18%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 16%, transparent);
  color: var(--theme-text);
  font-size: 13px;
  line-height: 1.5;
}

.prompt-preview-section--textarea {
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.prompt-preview-section--textarea .prompt-preview-section__header {
  padding: 16px 18px 0;
}

.prompt-preview-code-shell {
  min-height: 0;
  max-height: min(38vh, 440px);
  overflow: auto;
  border-top: 1px solid var(--theme-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 96%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent));
}

.prompt-preview-code-shell--identity-grid-top {
  max-height: 220px;
}

.prompt-preview-code {
  margin: 0;
  padding: 18px 20px 24px;
  white-space: pre-wrap;
  word-break: break-word;
}

.prompt-preview-code--identity-grid {
  color: var(--theme-text);
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 12px;
  line-height: 1.68;
}

.prompt-preview-block--identity-grid {
  gap: 10px;
}

.prompt-param-table--compact .prompt-param-table__head,
.prompt-param-table--compact .prompt-param-table__row,
.prompt-param-table--expanded .prompt-param-table__head,
.prompt-param-table--expanded .prompt-param-table__row {
  grid-template-columns: 120px minmax(0, 1fr) 64px;
  gap: 8px;
}

.prompt-param-table--compact .prompt-param-table__head,
.prompt-param-table--expanded .prompt-param-table__head {
  padding: 8px 10px;
}

.prompt-param-table--compact .prompt-param-table__row,
.prompt-param-table--expanded .prompt-param-table__row {
  padding: 10px;
}

.prompt-reference-grid--identity-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.prompt-reference-card--compact {
  gap: 10px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-blue) 10%, transparent);
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--theme-tone-blue) 6%, transparent), transparent 42%),
    color-mix(in srgb, var(--theme-panel) 82%, transparent);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.14);
}

.prompt-reference-card--identity-grid {
  align-content: start;
}

.prompt-reference-card__thumb {
  display: grid;
  place-items: center;
  width: 100%;
  height: 220px;
  padding: 12px;
  border: 0;
  border-radius: 16px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 2%, transparent), color-mix(in srgb, var(--theme-text) 1%, transparent)),
    color-mix(in srgb, var(--theme-input) 84%, transparent);
  cursor: pointer;
  overflow: hidden;
  transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
  border: 1px solid var(--theme-border);
}

.prompt-reference-card__thumb:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--theme-tone-blue) 26%, transparent);
  box-shadow: 0 10px 24px rgba(42, 73, 160, 0.12);
}

.prompt-reference-card--compact img {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: auto;
  object-fit: contain;
  object-position: center center;
}

.prompt-reference-card__actions {
  justify-content: center;
  gap: 8px;
}

.prompt-preview-textarea {
  width: 100%;
  min-height: 360px;
  resize: vertical;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 88%, transparent);
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1.7;
  padding: 16px 18px;
  white-space: pre-wrap;
  word-break: break-word;
}

.prompt-preview-textarea--identity-grid {
  min-height: 420px;
  border: 0;
  border-top: 1px solid var(--theme-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel) 96%, transparent), color-mix(in srgb, var(--theme-panel) 98%, transparent));
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 12.5px;
}

.prompt-preview-textarea--tall {
  min-height: 420px;
}

.prompt-preview-block {
  display: grid;
  gap: 6px;
}

.prompt-preview-block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.prompt-preview-block strong {
  color: var(--theme-text);
  font-size: 11px;
}

.prompt-preview-block pre {
  margin: 0;
  padding: 10px;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-panel) 88%, transparent);
  color: var(--theme-text);
  font-size: 11px;
  line-height: 1.55;
}

.prompt-preview-empty {
  color: var(--theme-tone-blue);
  font-size: 12px;
  line-height: 1.6;
}

.prompt-preview-empty--error {
  color: var(--theme-tone-red);
}

@media (max-width: 900px) {
  .modal-card__header,
  .prompt-preview-section__header {
    grid-template-columns: 1fr;
    display: grid;
  }

  .modal-card__actions {
    justify-content: flex-start;
  }

  .identity-grid-preview-summary {
    grid-template-columns: 1fr;
  }

  .identity-grid-preview-summary--compact,
  .identity-grid-preview-main,
  .identity-grid-asset-pair,
  .prompt-reference-grid--identity-grid {
    grid-template-columns: 1fr;
  }

  .prompt-preview-code-shell--identity-grid-top {
    max-height: 180px;
  }

  .prompt-preview-modal--identity-grid {
    padding: 18px;
    border-radius: 20px;
  }

  .prompt-preview-modal__title strong {
    font-size: 22px;
  }

  .prompt-preview-section__header span {
    text-align: left;
  }

  .prompt-preview-code-shell {
    max-height: min(48vh, 520px);
  }
}

.sidebar-script-card,
.sidebar-frame-card {
  gap: 5px;
}

.sidebar-script-card strong {
  line-height: 1.55;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-stage-preview :deep(.console-sidebar__title),
.video-stage-preview :deep(.console-sidebar__tag),
.video-stage-preview :deep(.console-sidebar .panel-head),
.video-stage-preview :deep(.console-sidebar .panel-head > div) {
  min-width: 0;
}

.video-stage-preview :deep(.console-sidebar__title) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-stage-preview :deep(.console-sidebar__tag) {
  display: inline-flex;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-frame-thumb {
  width: 100%;
  aspect-ratio: 16 / 7;
  overflow: hidden;
  border-radius: 0;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
}

.sidebar-frame-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sidebar-frame-thumb--empty {
  display: grid;
  place-items: center;
  color: var(--theme-text-secondary);
  font-size: 12px;
}

.console-sidebar--history {
  padding-top: 12px;
}

.history-item {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 10px;
  padding: 11px;
  text-align: left;
  cursor: pointer;
}

.history-thumb {
  width: 68px;
  height: 88px;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
}

.history-fallback,
.empty-state {
  display: grid;
  place-items: center;
  color: var(--theme-text-secondary);
  text-align: center;
}

.history-copy {
  display: grid;
  gap: 4px;
}

.model-card {
  padding: 11px;
  text-align: left;
  cursor: pointer;
}

.model-card--selected {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 75%, transparent);
  box-shadow: 0 0 0 1px rgba(86, 165, 255, 0.28);
}

.model-card--bound {
  border-color: color-mix(in srgb, var(--theme-accent) 72%, transparent);
  box-shadow: 0 0 0 1px rgba(62, 201, 142, 0.24);
}

.model-card-copy {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}

.model-card-badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  justify-content: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
  color: var(--theme-accent);
  font-size: 11px;
  line-height: 1.2;
}

.model-card-badge--selected {
  background: color-mix(in srgb, var(--theme-tone-blue) 18%, transparent);
  color: var(--theme-tone-blue);
}

.empty-state {
  min-height: 100%;
  padding: 16px;
  font-size: 12px;
  line-height: 1.6;
}

.small-empty {
  min-height: 116px;
}

.section-empty {
  min-height: 150px;
  border-radius: 18px;
  border: 1px dashed var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 2%, transparent);
}

.ghost-button,
.primary-button,
.count-input {
  min-height: 38px;
  padding: 0 12px;
  color: var(--theme-text);
}

.count-input {
  width: 84px;
  text-align: center;
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
}

.ghost-button,
.primary-button,
.history-item,
.variant-card,
.model-card,
.add-thumb {
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.ghost-button:hover,
.primary-button:hover,
.history-item:hover,
.variant-card:hover,
.model-card:hover,
.add-thumb:hover {
  transform: translateY(-1px);
}

.primary-button {
  cursor: pointer;
  background: linear-gradient(135deg, var(--theme-tone-blue), var(--theme-tone-blue));
  color: var(--theme-text);
  font-weight: 800;
  box-shadow: 0 10px 24px rgba(96, 95, 255, 0.24);
}

.ghost-button {
  cursor: pointer;
  background: color-mix(in srgb, var(--theme-text) 4%, transparent);
}

.small {
  min-height: 34px;
  font-size: 11px;
}

.full-width {
  width: 100%;
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 140;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--theme-input) 74%, transparent);
  padding: 24px;
}

.modal-panel {
  width: min(1120px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 18px;
  border-radius: 24px;
  border: 1px solid var(--theme-border);
  background: linear-gradient(180deg, var(--theme-panel-soft), var(--theme-panel));
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.42);
}

@media (max-width: 1460px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .sticky-panel {
    position: static;
  }
}

@media (max-width: 1220px) {
  .reference-layout,
  .storyboard-layout,
  .storyboard-design-layout,
  .final-layout,
  .asset-grid,
  .frame-grid,
  .review-grid,
  .model-grid {
    grid-template-columns: 1fr 1fr;
  }

  .variant-layout {
    grid-template-columns: 1fr;
  }

  .shot-overview-panel {
    grid-template-columns: 1fr 1fr 1fr;
    align-items: stretch;
  }

  .shot-overview-progress,
  .shot-overview-actions {
    grid-column: 1 / -1;
  }

  .shot-reference-layout {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .video-stage-layout {
    grid-template-columns: 1fr;
  }

  .video-stage-preview :deep(.console-sidebar) {
    position: static;
  }

  .shot-reference-header,
  .shot-reference-row {
    grid-template-columns: 58px 88px minmax(180px, 1.25fr) 64px 84px 112px 196px;
  }

  .compose-workbench {
    grid-template-columns: 1fr;
  }

  .compose-studio {
    grid-template-columns: 1fr;
  }

  .compose-studio__side {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }

  .compose-timeline-stage {
    grid-template-columns: 1fr;
  }

  .compose-shot-preview {
    grid-template-columns: 1fr;
  }

  .storyboard-preview-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1280px) {
  .analyze-main-grid {
    grid-template-columns: 1fr;
  }

  .analyze-insights-layout,
  .analyze-structure-track {
    grid-template-columns: 1fr;
  }

  .analyze-summary-grid {
    grid-template-columns: 1fr;
  }

  .analyze-global-sections {
    grid-template-columns: 1fr;
  }

  .analyze-footer {
    flex-direction: column;
  }

  .analyze-footer__actions {
    width: 100%;
  }

  .analyze-primary-button,
  .analyze-secondary-button {
    min-width: 0;
    flex: 1 1 0;
  }
}

@media (max-width: 980px) {
  .analyze-main-grid {
    grid-template-columns: 1fr;
  }

  .storyboard-stage-hero {
    flex-direction: column;
    align-items: stretch;
  }

  .storyboard-stage-hero__actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .analyze-topbar,
  .analyze-hero-card__head,
  .analyze-footer,
  .analyze-footer__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .analyze-structure-track,
  .analyze-summary-grid,
  .meta-grid,
  .beats-grid,
  .model-grid {
    grid-template-columns: 1fr;
  }

  .product-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .storyboard-design-table__head,
  .storyboard-design-row {
    grid-template-columns: 72px minmax(260px, 2.2fr) 70px 58px 62px minmax(120px, 1fr) 68px;
    gap: 8px;
  }

  .storyboard-design-cell--prompt {
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 8px;
  }

  .storyboard-design-thumb,
  .storyboard-design-thumb__empty {
    width: 64px;
  }

  .storyboard-preview-panel {
    grid-template-columns: 1fr;
  }

  .compose-shot-strip {
    grid-auto-columns: minmax(124px, 142px);
  }

  .compose-shot-preview__frame {
    min-height: 420px;
  }
}

@media (max-width: 860px) {
  .clone-page {
    padding: 12px;
  }

  .hero-shell {
    padding: 12px;
  }

  .hero-main,
  .panel-head,
  .workspace-grid,
  .reference-layout,
  .storyboard-layout,
  .storyboard-design-layout,
  .final-layout,
  .compose-studio,
  .compose-studio__main,
  .compose-studio__side,
  .asset-grid,
  .meta-grid,
  .beats-grid,
  .frame-grid,
  .review-grid,
  .model-grid,
  .product-grid {
    grid-template-columns: 1fr;
  }

  .selected-model {
    flex-direction: column;
    align-items: stretch;
  }

  .frame-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .variant-hero-card,
  .variant-copy__head {
    flex-direction: column;
    align-items: stretch;
  }

  .variant-hero-card {
    grid-template-columns: 1fr;
  }

  .panel-head {
    flex-direction: column;
    align-items: stretch;
  }

  .panel-actions {
    justify-content: flex-start;
  }

  .compose-canvas-panel,
  .compose-timeline-panel,
  .compose-side-card,
  .final-preview-panel,
  .compose-stage-card,
  .compose-sequence-card {
    padding: 12px;
  }

  .compose-sequence-card__head,
  .compose-sequence-detail,
  .compose-score-panel {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }

  .compose-stage-card {
    padding: 0;
  }

  .compose-stage-card__media {
    min-height: 320px;
  }

  .compose-studio__side {
    grid-template-columns: 1fr;
  }

  .compose-timeline-stage {
    grid-template-columns: 1fr;
  }

  .compose-shot-rail {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    max-height: none;
    overflow: visible;
    padding-right: 0;
  }

  .compose-shot-detail__preview {
    min-height: 420px;
  }

  .compose-export-grid,
  .compose-chip-row {
    grid-template-columns: 1fr;
  }

  .compose-score-body,
  .compose-bottom-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .review-head {
    flex-direction: column;
    align-items: stretch;
  }

  .shot-overview-panel,
  .shot-reference-layout,
  .shot-reference-row {
    grid-template-columns: 1fr;
  }

  .panel-video-stage {
    padding: 10px;
  }

  .panel-video-stage :deep(.clone-stage-header) {
    padding: 2px 2px 10px;
  }

  .panel-video-stage :deep(.stage-head) {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .panel-video-stage :deep(.stage-head__actions) {
    justify-content: flex-start;
    padding-left: 0;
    border-left: 0;
  }

  .panel-video-stage :deep(.stage-head__actions .primary-button) {
    min-width: 0;
    width: 100%;
  }

  .panel-video-stage :deep(.stage-head__aux) {
    gap: 10px 14px;
    padding-top: 8px;
  }

  .video-stage-layout {
    gap: 12px;
  }

  .shot-table-toolbar,
  .shot-table-head,
  .shot-overview-panel {
    padding-left: 12px;
    padding-right: 12px;
  }

  .shot-overview-actions {
    justify-content: flex-start;
  }

  .shot-reference-header {
    display: none;
  }

  .shot-table-body--reference {
    padding: 8px;
    gap: 8px;
  }

  .shot-reference-row {
    border: 1px solid var(--theme-border);
    border-radius: 14px;
  }

  .shot-reference-cell--actions {
    justify-content: flex-start;
  }

  .shot-thumb--large {
    width: 100%;
    max-width: 180px;
  }

  .tall-video,
  .final-video {
    min-height: 320px;
  }
}
</style>
