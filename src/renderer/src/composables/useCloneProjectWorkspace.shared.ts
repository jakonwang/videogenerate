import type { Ref } from 'vue'
import type { CloneWorkspaceClient } from '../../../shared/clone-workspace/client'

export type CloneProjectLike = {
  id: string
  referenceVideoPath: string
  productReferenceImagePaths?: string[]
  storyboardFrames?: Array<{ shotId: string }>
  workflowV2?: { currentStep?: string }
  shotVideoOutputs?: Array<{ shotId: string; taskId?: string; videoPath?: string; status?: string; error?: string; retryCount?: number }>
  pipelineStatus?: unknown
  finalCompose?: { outputPath?: string; error?: string; status?: string }
  previewPipeline?: { lastError?: string }
  autoFlowStatus?: {
    enabled?: boolean
    status?: string
    currentStage?: string
    imageRetryLimit?: number
    videoRetryLimit?: number
    lastSummary?: string
  }
  blueprint?: {
    scriptAnalysisError?: string
    shots?: Array<{
      id: string
      generatedTaskId?: string
      productReferenceImagePaths?: string[]
      gptFirstFramePath?: string
      generatedFirstFramePath?: string
      gptFrameError?: string
      error?: string
      retryCount?: number
    }>
  } | null
  baseBlueprint?: {
    consistencyAssets?: { productReferenceImages?: string[] }
    shots?: Array<{
      id: string
      productReferenceImagePaths?: string[]
    }>
  } | null
  selectedModelIdentitySnapshot?: { id?: string }
  outputDir?: string
  lastError?: string
}

export type UseCloneProjectWorkspaceOptions<TProject extends CloneProjectLike> = {
  current: Ref<TProject | null>
  loading?: Ref<boolean>
  referenceVideoPath: Ref<string>
  productRefs: Ref<string[]>
  productRefsDraft: Ref<string[] | null>
  selectedModelId: Ref<string>
  storyboardBatchSummary?: Ref<{ total: number; done: number; failed: number; skipped: number } | null>
  variantCount?: Ref<number>
  errorText: Ref<string>
  composeOutputDir: Ref<string>
  composeLocalError?: Ref<string>
  modelModalOpen?: Ref<boolean>
  markError?: (detail: unknown, fallback: string) => void
  readFileAsBase64?: (filePath: string) => Promise<string>
  fileNameFromPath?: (filePath: string) => string
  mimeTypeFromPath?: (filePath: string) => string
  resolveActiveProjectId?: (currentProjectId?: string | null) => string
  applyPipelineStatus?: (project: TProject, runtime: any) => TProject
  getActiveImageProvider?: () => string
  getActiveImageModel?: () => string
  shotLabel?: (shotId: string) => string
  getStoryboardFrameCount?: () => number
  getReadyVideoCount?: () => number
  getShotVideoOutputCount?: () => number
  getFinalOutputPath?: () => string
  setStageLog?: (message: string, level?: 'info' | 'success' | 'error') => void
  pushRuntimeLog?: (message: string, level?: 'info' | 'success' | 'error') => void
  getWorkspaceClient?: (projectId?: string) => Promise<{
    client: CloneWorkspaceClient<TProject>
    ownership: 'web' | 'local' | 'unknown'
    channel: 'web-api' | 'electron-ipc'
  }>
}

export type StoryboardGenerateResponse<TProject extends CloneProjectLike> = {
  project?: TProject
  queueSummary?: { total: number; done: number; failed: number; skipped: number }
  imageProvider?: string
  imageModel?: string
}

export type ShotVideoGenerateResponse<TProject extends CloneProjectLike> = {
  project?: TProject
  queueSummary?: { total: number; done: number; failed: number; skipped: number; pending?: number; timeout?: number }
}

export type ShotVideoSyncResponse<TProject extends CloneProjectLike> = {
  project?: TProject
  task?: { taskId?: string; status?: string; errorMessage?: string }
  synced?: boolean
}

export function extractProjectProductRefs<TProject extends CloneProjectLike>(project: TProject | null) {
  if (!project) return []
  const asArray = <TItem>(value: TItem[] | null | undefined): TItem[] => (Array.isArray(value) ? value : [])
  const rootRefs = Array.isArray(project.productReferenceImagePaths)
    ? project.productReferenceImagePaths.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  if (rootRefs.length) return Array.from(new Set(rootRefs)).slice(0, 9)
  const savedRefs = Array.isArray(project.baseBlueprint?.consistencyAssets?.productReferenceImages)
    ? project.baseBlueprint?.consistencyAssets?.productReferenceImages
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    : []
  if (savedRefs.length) return Array.from(new Set(savedRefs)).slice(0, 9)
  const refs = new Set<string>()
  const shotGroups = [
    ...asArray(project.blueprint?.shots),
    ...asArray(project.baseBlueprint?.shots),
  ]
  for (const shot of shotGroups) {
    for (const item of asArray(shot.productReferenceImagePaths)) {
      const text = String(item || '').trim()
      if (text) refs.add(text)
    }
  }
  for (const item of asArray(project.baseBlueprint?.consistencyAssets?.productReferenceImages)) {
    const text = String(item || '').trim()
    if (text) refs.add(text)
  }
  return Array.from(refs).slice(0, 9)
}
