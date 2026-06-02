import { randomUUID } from 'node:crypto'
import { cloneRepo } from './repo'
import type { ShotSpec } from './types'

export type CloneStoryboardGridWorkflowDeps = {
  ensureCloneFlowState: (project: any) => void
  patchWorkflowV2: (project: any, currentStep: any, step: any, status: any) => void
  syncProjectSelectedIdentity: (project: any, identityId: string) => Promise<unknown>
  assertStoryboardExtractionReady: (project: any) => void
  selectedIdentityPack: (project: any) => any
  projectBlueprintShots: (project: any) => any[]
  replaceProjectShot: (project: any, shotId: string, patch: Partial<ShotSpec>) => void
  now: () => number
  generateAllShotFrames: (input: {
    cloneProjectId: string
    onlyMissing?: boolean
    which?: 'start' | 'end' | 'both'
    shotIds?: string[]
    productReferenceImagePaths?: string[]
  }) => Promise<any>
  imageProviderName: (credentials: any) => string
  imageProviderModel: (credentials: any) => string
}

export function createCloneStoryboardGridWorkflow(deps: CloneStoryboardGridWorkflowDeps) {
  return {
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
      deps.ensureCloneFlowState(project)
      deps.patchWorkflowV2(project, 'generate_storyboard_grids', 'generate_storyboard_grids', 'running')
      if (input.selectedModelIdentityId && project.selectedModelIdentityId !== input.selectedModelIdentityId) {
        await deps.syncProjectSelectedIdentity(project, input.selectedModelIdentityId)
      }
      const refs = (input.productReferenceImagePaths ?? []).map((item) => String(item || '').trim()).filter(Boolean)
      if (!refs.length) throw new Error('请先上传商品参考图')
      deps.assertStoryboardExtractionReady(project)
      const pack = deps.selectedIdentityPack(project)
      if (!pack?.imagePaths?.length) throw new Error('请先选择模特')
      const shots = deps.projectBlueprintShots(project).sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
      if (!shots.length) throw new Error('没有可用分镜')
      for (const shot of shots) {
        deps.replaceProjectShot(project, shot.id, {
          productReferenceImagePaths: Array.from(new Set([...(shot.productReferenceImagePaths ?? []), ...refs])),
        } as Partial<ShotSpec>)
      }
      await cloneRepo.upsertProject(project)
      const generated = await deps.generateAllShotFrames({
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
      latest.storyboardFrames = deps.projectBlueprintShots(latest)
        .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
        .map((shot, index) => ({
          id: randomUUID(),
          shotId: shot.id,
          imagePath: String(shot.gptFirstFramePath || shot.generatedFirstFramePath || '').trim() || undefined,
          aspectRatio: '9:16' as const,
          status: String(shot.gptFirstFramePath || shot.generatedFirstFramePath || '').trim() ? 'cropped' : 'failed',
          error: String(shot.gptFrameError || shot.error || '').trim() || undefined,
          frameIndex: index,
          updatedAt: deps.now(),
        }))
      project.storyboardGridBatches = latest.storyboardGridBatches
      project.storyboardFrames = latest.storyboardFrames
      deps.patchWorkflowV2(project, 'generate_storyboard_grids', 'generate_storyboard_grids', 'done')
      deps.patchWorkflowV2(project, 'generate_shot_videos', 'generate_shot_videos', 'running')
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
        imageProvider: deps.imageProviderName(await cloneRepo.getCredentials()),
        imageModel: deps.imageProviderModel(await cloneRepo.getCredentials()),
      }
    },
  }
}
