import type { Ref } from 'vue'

export type CloneProjectLike = {
  id: string
  referenceVideoPath: string
  storyboardFrames?: Array<{ shotId: string }>
  workflowV2?: { currentStep?: string }
  shotVideoOutputs?: Array<{ shotId: string; taskId?: string; videoPath?: string }>
  pipelineStatus?: unknown
  finalCompose?: { outputPath?: string; error?: string; status?: string }
  previewPipeline?: { lastError?: string }
  blueprint?: {
    scriptAnalysisError?: string
    shots?: Array<{
      id: string
      productReferenceImagePaths?: string[]
      gptFirstFramePath?: string
      generatedFirstFramePath?: string
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
  const savedRefs = Array.isArray(project.baseBlueprint?.consistencyAssets?.productReferenceImages)
    ? project.baseBlueprint?.consistencyAssets?.productReferenceImages
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    : []
  if (savedRefs.length) return Array.from(new Set(savedRefs)).slice(0, 9)
  const refs = new Set<string>()
  const shotGroups = [
    ...(project.blueprint?.shots ?? []),
    ...(project.baseBlueprint?.shots ?? []),
  ]
  for (const shot of shotGroups) {
    for (const item of shot.productReferenceImagePaths ?? []) {
      const text = String(item || '').trim()
      if (text) refs.add(text)
    }
  }
  for (const item of project.baseBlueprint?.consistencyAssets?.productReferenceImages ?? []) {
    const text = String(item || '').trim()
    if (text) refs.add(text)
  }
  return Array.from(refs).slice(0, 9)
}
