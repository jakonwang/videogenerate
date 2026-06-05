const run = async () => {
  const { cloneService } = await import('./src/main/modules/clone/service.ts')
  const projectId = '5cf466a0-87db-4383-9853-05d69e58516c'
  const productImage = 'C:/Users/Administrator/Desktop/注册公司/姑公司/1.jpg'
  await cloneService.saveProjectProductImages({
    cloneProjectId: projectId,
    productReferenceImagePaths: [productImage],
  })
  const result = await cloneService.autoRunCloneToStoryboardVideos({
    cloneProjectId: projectId,
    variantCount: 3,
    productReferenceImagePaths: [productImage],
  })
  console.log(JSON.stringify({
    projectId: result.project?.id,
    autoFlowStatus: result.project?.autoFlowStatus,
    workflowStep: result.project?.workflowV2?.currentStep,
    selectedScriptVariantId: result.project?.selectedScriptVariantId,
    scriptVariantCount: result.project?.scriptVariantCandidates?.length ?? 0,
    storyboardFrameCount: result.project?.storyboardFrames?.length ?? 0,
    failedStoryboardFrames: (result.project?.storyboardFrames ?? []).filter(item => !item.imagePath && item.error).map(item => ({ shotId: item.shotId, error: item.error, retryCount: item.retryCount })),
    shotVideoCount: result.project?.shotVideoOutputs?.length ?? 0,
    queueSummary: result.queueSummary,
    failedShotVideos: (result.project?.shotVideoOutputs ?? []).filter(item => item.status === 'failed' || item.status === 'polling_timeout' || item.error).map(item => ({ shotId: item.shotId, status: item.status, error: item.error, retryCount: item.retryCount, taskId: item.taskId })),
    lastError: result.project?.lastError ?? ''
  }, null, 2))
}
run().catch((error) => { console.error(error); process.exit(1) })
