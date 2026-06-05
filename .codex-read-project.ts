const run = async () => {
  const { cloneRepo } = await import('./src/main/modules/clone/repo.ts')
  const project = await cloneRepo.getProject('5cf466a0-87db-4383-9853-05d69e58516c')
  console.log(JSON.stringify({
    id: project?.id,
    status: project?.status,
    workflowStep: project?.workflowV2?.currentStep,
    autoFlowStatus: project?.autoFlowStatus,
    selectedScriptVariantId: project?.selectedScriptVariantId,
    scriptVariantCount: project?.scriptVariantCandidates?.length ?? 0,
    storyboardFrameCount: project?.storyboardFrames?.length ?? 0,
    storyboardFrames: (project?.storyboardFrames ?? []).map(item => ({ shotId: item.shotId, hasImage: Boolean(item.imagePath), error: item.error, retryCount: item.retryCount })),
    shotVideoCount: project?.shotVideoOutputs?.length ?? 0,
    shotVideos: (project?.shotVideoOutputs ?? []).map(item => ({ shotId: item.shotId, status: item.status, hasVideo: Boolean(item.videoPath), error: item.error, retryCount: item.retryCount, taskId: item.taskId })),
    lastError: project?.lastError ?? ''
  }, null, 2))
}
run().catch((error) => { console.error(error); process.exit(1) })
