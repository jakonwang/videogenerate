import type { CloneProjectLike, UseCloneProjectWorkspaceOptions } from './useCloneProjectWorkspace.shared'

type ComposeProjectActions<TProject extends CloneProjectLike> = {
  applyProject: (next: TProject | null) => void
  ensureCurrentProjectReady: () => Promise<TProject | null>
  refreshProjectAfterFailure: () => Promise<void>
}

export function useCloneProjectWorkspaceCompose<TProject extends CloneProjectLike>(
  options: UseCloneProjectWorkspaceOptions<TProject>,
  projectActions: ComposeProjectActions<TProject>,
) {
  const composeFinalVideo = async () => {
    const projectId =
      options.resolveActiveProjectId?.(options.current.value?.id) || String(options.current.value?.id || '').trim()
    if (!projectId) {
      options.markError?.('请先完成前面的步骤。', '请先完成前面的步骤。')
      return
    }
    if (options.loading) options.loading.value = true
    options.errorText.value = ''
    if (options.composeLocalError) options.composeLocalError.value = ''
    options.setStageLog?.('正在合成最终成片。')
    try {
      const ensuredProject = await projectActions.ensureCurrentProjectReady()
      if (!ensuredProject?.id) {
        throw new Error('当前复刻项目未找到，请先重新载入任务后再合成。')
      }
      const readyVideoCount = options.getReadyVideoCount?.() ?? 0
      const outputCount = options.getShotVideoOutputCount?.() ?? 0
      options.pushRuntimeLog?.(
        `提交最终成片合成：project=${ensuredProject.id} readyVideos=${readyVideoCount} outputs=${outputCount}`,
        'info',
      )
      if (!readyVideoCount) {
        throw new Error('当前没有可用于合成的分镜视频文件。请先在“分镜视频生成”阶段继续查询或重新生成，直到至少有一条分镜出现真实视频。')
      }
      const res = (await window.api.clone.composeCloneVideo({
        cloneProjectId: ensuredProject.id,
        outputDir: options.composeOutputDir.value || undefined,
      })) as { project?: TProject }
      projectActions.applyProject((res.project || options.current.value) as TProject)
      if (options.composeLocalError) options.composeLocalError.value = ''
      const finalOutputPath = options.getFinalOutputPath?.() || String(res.project?.finalCompose?.outputPath || '').trim()
      options.pushRuntimeLog?.(
        `最终成片合成返回：output=${String(res.project?.finalCompose?.outputPath || '--')} status=${String(res.project?.finalCompose?.status || '--')}`,
        finalOutputPath ? 'success' : 'info',
      )
      options.setStageLog?.(
        finalOutputPath ? '最终视频已合成并写入历史记录。' : '合成已结束，等待结果回写。',
        finalOutputPath ? 'success' : 'info',
      )
    } catch (error: any) {
      if (options.composeLocalError) {
        options.composeLocalError.value = String(error?.message ?? error ?? '最终成片合成失败。')
      }
      options.pushRuntimeLog?.(`最终成片合成异常：${String(error?.message ?? error ?? '未知错误')}`, 'error')
      options.markError?.(error?.message ?? error, '最终成片合成失败。')
      await projectActions.refreshProjectAfterFailure()
      options.setStageLog?.('最终成片合成失败，请检查错误信息后重试。', 'error')
    } finally {
      if (options.loading) options.loading.value = false
    }
  }

  return {
    composeFinalVideo,
  }
}
