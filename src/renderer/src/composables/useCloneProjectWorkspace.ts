import { resolveCloneWorkspaceClient } from '@/lib/cloneWorkspaceClient'
import { useCloneProjectWorkspaceCompose } from './useCloneProjectWorkspace.compose'
import { useCloneProjectWorkspaceMaterials } from './useCloneProjectWorkspace.materials'
import { useCloneProjectWorkspaceProject } from './useCloneProjectWorkspace.project'
import { useCloneProjectWorkspaceScript } from './useCloneProjectWorkspace.script'
import { useCloneProjectWorkspaceStoryboard } from './useCloneProjectWorkspace.storyboard'
import { useCloneProjectWorkspaceVideo } from './useCloneProjectWorkspace.video'
import type { CloneProjectLike, UseCloneProjectWorkspaceOptions } from './useCloneProjectWorkspace.shared'

export type { CloneProjectLike, UseCloneProjectWorkspaceOptions } from './useCloneProjectWorkspace.shared'

export function useCloneProjectWorkspace<TProject extends CloneProjectLike>(
  options: UseCloneProjectWorkspaceOptions<TProject>,
) {
  const resolvedOptions: UseCloneProjectWorkspaceOptions<TProject> = {
    ...options,
    getWorkspaceClient:
      options.getWorkspaceClient ||
      (async (projectId?: string) => await resolveCloneWorkspaceClient<TProject>(projectId)),
  }

  const projectLayer = useCloneProjectWorkspaceProject(resolvedOptions)
  const {
    applyProject,
    refreshCurrentProject,
    refreshRuntimeProject,
    ensureCurrentProjectReady,
    refreshProjectAfterFailure,
    loadProject,
    waitForStoryboardFrames,
  } = projectLayer

  const materialsLayer = useCloneProjectWorkspaceMaterials(resolvedOptions, {
    applyProject,
    loadProject,
    refreshProjectAfterFailure,
  })
  const { pickReferenceVideo, bindProductImages, bindModelIdentity } = materialsLayer

  const scriptLayer = useCloneProjectWorkspaceScript(resolvedOptions, {
    applyProject,
    refreshProjectAfterFailure,
  })
  const { createBlueprint, generateScriptVariants, selectScriptVariant } = scriptLayer

  const storyboardLayer = useCloneProjectWorkspaceStoryboard(resolvedOptions, {
    applyProject,
    refreshProjectAfterFailure,
    waitForStoryboardFrames,
  })
  const {
    syncProductImagesToProject,
    removeProductImage,
    clearProductImages,
    generateStoryboardGrids,
    regenerateStoryboardFrame,
  } = storyboardLayer

  const videoLayer = useCloneProjectWorkspaceVideo(resolvedOptions, {
    applyProject,
    ensureCurrentProjectReady,
    refreshProjectAfterFailure,
  })
  const {
    generateShotVideos,
    autoRunToStoryboardVideos,
    syncFailedShotVideo,
    replaceShotVideo,
    regenerateShotClip,
    refreshRemoteStatus,
    syncPendingShotVideos,
  } = videoLayer

  const composeLayer = useCloneProjectWorkspaceCompose(resolvedOptions, {
    applyProject,
    ensureCurrentProjectReady,
    refreshProjectAfterFailure,
  })
  const { composeFinalVideo } = composeLayer

  return {
    applyProject,
    refreshCurrentProject,
    refreshRuntimeProject,
    ensureCurrentProjectReady,
    refreshProjectAfterFailure,
    loadProject,
    pickReferenceVideo,
    bindProductImages,
    bindModelIdentity,
    createBlueprint,
    generateScriptVariants,
    selectScriptVariant,
    syncProductImagesToProject,
    removeProductImage,
    clearProductImages,
    generateStoryboardGrids,
    regenerateStoryboardFrame,
    generateShotVideos,
    autoRunToStoryboardVideos,
    syncFailedShotVideo,
    replaceShotVideo,
    regenerateShotClip,
    refreshRemoteStatus,
    syncPendingShotVideos,
    composeFinalVideo,
  }
}
