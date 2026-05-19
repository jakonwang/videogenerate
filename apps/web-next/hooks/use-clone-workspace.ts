'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { readAppSettings } from '@/lib/app-settings'
import { apiClient } from '@/lib/api-client'
import { toFileName, toPreviewSrc } from '@/lib/utils'

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

export function useCloneWorkspace(projectId: string) {
  const queryClient = useQueryClient()
  const [consoleLines, setConsoleLines] = useState<string[]>([])
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [variantCount, setVariantCount] = useState(3)
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [polling, setPolling] = useState(true)
  const [composeOutputDir, setComposeOutputDir] = useState('')

  useEffect(() => {
    const settings = readAppSettings()
    setVariantCount(Math.max(1, Number(settings.defaultVariantCount || 3)))
    setPolling(settings.autoRefresh)
    if (settings.defaultOutputDir.trim()) {
      setComposeOutputDir(settings.defaultOutputDir.trim())
    }
  }, [])

  const pushLog = (message: string) => {
    const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setConsoleLines((current) => [`${stamp} ${message}`, ...current].slice(0, 120))
  }

  const projectQuery = useQuery({
    queryKey: ['clone-project', projectId],
    queryFn: () => apiClient.getCloneProject(projectId),
    enabled: Boolean(projectId),
    staleTime: 5_000,
    refetchInterval: polling ? 5000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  })

  const runtimeQuery = useQuery({
    queryKey: ['clone-runtime', projectId],
    queryFn: () => apiClient.getCloneRuntime(projectId),
    enabled: Boolean(projectId),
    staleTime: 5_000,
    refetchInterval: polling ? 5000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  })

  const modelsQuery = useQuery({
    queryKey: ['clone-models'],
    queryFn: () => apiClient.listCloneModelIdentities(),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  })

  const project = projectQuery.data?.project ?? null
  const runtime = runtimeQuery.data ?? null

  useEffect(() => {
    const nextSelected = String(project?.selectedScriptVariantId || project?.selectedVariantId || '').trim()
    if (nextSelected) {
      setSelectedVariantId(nextSelected)
    }
  }, [project?.selectedScriptVariantId, project?.selectedVariantId])

  const shots = useMemo(() => project?.blueprint?.shots || [], [project])
  const productImages = useMemo(() => project?.productReferenceImagePaths || [], [project])
  const storyboardFrames = useMemo(() => project?.storyboardFrames || [], [project])
  const shotVideoOutputs = useMemo(() => project?.shotVideoOutputs || [], [project])
  const scriptCandidates = useMemo(
    () => project?.scriptVariants || project?.executionBlueprint?.scriptCandidates || [],
    [project],
  )
  const selectedModelId = useMemo(
    () => String(project?.selectedModelIdentityId || project?.selectedModelIdentitySnapshot?.id || '').trim(),
    [project],
  )
  const allowMockWhenNoKey = Boolean(runtime?.pipeline?.credentials?.allowMockWhenNoKey ?? project?.allowMockWhenNoKey ?? false)
  const productionMode = !allowMockWhenNoKey

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['clone-project', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['clone-runtime', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['clone-projects'] }),
    ])
  }

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!referenceFile) throw new Error('请先选择参考视频')
      const base64Data = await fileToBase64(referenceFile)
      pushLog(`提交参考视频分析：${referenceFile.name}`)
      const uploadResult = await apiClient.uploadCloneReferenceVideo(projectId, {
        fileName: referenceFile.name,
        base64Data,
        mimeType: referenceFile.type || 'video/mp4',
      })
      const uploadedVideoPath = String(uploadResult?.asset?.filePath || uploadResult?.project?.referenceVideoPath || '').trim()
      if (!uploadedVideoPath) {
        throw new Error('参考视频上传成功，但未返回可分析的视频路径')
      }
      const settings = readAppSettings()
      return await apiClient.analyzeCloneReference(projectId, {
        videoPath: uploadedVideoPath,
        locale: settings.locale === 'vi-VN' ? 'vi-VN' : 'zh-CN',
      })
    },
    onSuccess: async () => {
      pushLog('参考视频分析已完成')
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`参考视频分析失败：${error.message}`),
  })

  const uploadProductsMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const payload = await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          base64Data: await fileToBase64(file),
          mimeType: file.type || 'image/jpeg',
        })),
      )
      pushLog(`上传商品图：${files.map((item) => item.name).join('、')}`)
      return await apiClient.uploadCloneProductImages(projectId, { files: payload })
    },
    onSuccess: async () => {
      pushLog('商品图已更新')
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`商品图上传失败：${error.message}`),
  })

  const saveProductPathsMutation = useMutation({
    mutationFn: async (paths: string[]) =>
      apiClient.saveCloneProjectProductImages(projectId, {
        productReferenceImagePaths: paths,
      }),
    onSuccess: async (_, paths) => {
      pushLog(`已回填商品素材：${paths.length} 张`)
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`商品素材回填失败：${error.message}`),
  })

  const selectModelMutation = useMutation({
    mutationFn: (identityId: string) => apiClient.selectCloneProjectModelIdentity(projectId, { identityId }),
    onSuccess: async (_, identityId) => {
      pushLog(`已切换模特：${identityId}`)
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`模特切换失败：${error.message}`),
  })

  const generateVariantsMutation = useMutation({
    mutationFn: () => apiClient.generateCloneScriptVariants(projectId, { variantCount }),
    onSuccess: async () => {
      pushLog(`脚本候选已生成，共 ${variantCount} 条`)
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`脚本候选生成失败：${error.message}`),
  })

  const chooseVariantMutation = useMutation({
    mutationFn: (variantId: string) => apiClient.selectCloneScriptVariant(projectId, { variantId }),
    onSuccess: async (_, variantId) => {
      setSelectedVariantId(variantId)
      pushLog(`已选中脚本候选：${variantId}`)
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`脚本候选选择失败：${error.message}`),
  })

  const generateImagesMutation = useMutation({
    mutationFn: () =>
      apiClient.generateStoryboardImages(projectId, {
        productReferenceImagePaths: productImages,
        selectedModelIdentityId: selectedModelId,
      }),
    onMutate: () => {
      pushLog(
        `提交分镜图片生成：project=${projectId} variant=${selectedVariantId || '未选择'} refs=${productImages.length} model=${selectedModelId || '未绑定'}`,
      )
    },
    onSuccess: async () => {
      pushLog('分镜图片生成请求已提交')
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`分镜图片生成失败：${error.message}`),
  })

  const regenerateImageMutation = useMutation({
    mutationFn: (shotId: string) =>
      apiClient.regenerateStoryboardImage(projectId, shotId, { productReferenceImagePaths: productImages }),
    onSuccess: async (_, shotId) => {
      pushLog(`已重新生成分镜图片：${shotId}`)
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`单镜图片重生失败：${error.message}`),
  })

  const generateVideosMutation = useMutation({
    mutationFn: () => apiClient.generateCloneShotVideos(projectId),
    onSuccess: async () => {
      pushLog('已提交分镜视频生成任务')
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`分镜视频生成失败：${error.message}`),
  })

  const syncVideoMutation = useMutation({
    mutationFn: (shotId: string) => apiClient.syncCloneShotVideoTask(projectId, shotId),
    onSuccess: async (_, shotId) => {
      pushLog(`已同步分镜视频状态：${shotId}`)
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`分镜视频状态同步失败：${error.message}`),
  })

  const toggleLockMutation = useMutation({
    mutationFn: async (input: { shotId: string; locked: boolean }) =>
      apiClient.updateCloneShot(projectId, input.shotId, { locked: input.locked }),
    onSuccess: async (_, input) => {
      pushLog(`${input.locked ? '已锁定' : '已解锁'}分镜：${input.shotId}`)
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`分镜锁定状态更新失败：${error.message}`),
  })

  const updateShotMutation = useMutation({
    mutationFn: async (input: {
      shotId: string
      scriptText?: string
      visualDescription?: string
      cameraDescription?: string
      cameraMovement?: string
      subtitleSuggestion?: string
      durationSec?: number
      materialNeed?: string
      order?: number
    }) => apiClient.updateCloneShot(projectId, input.shotId, input),
    onSuccess: async (_, input) => {
      pushLog(`已更新镜头：${input.shotId}`)
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`镜头更新失败：${error.message}`),
  })

  const regenerateVideoMutation = useMutation({
    mutationFn: (shotId: string) => apiClient.regenerateCloneShotVideo(projectId, shotId),
    onSuccess: async (_, shotId) => {
      pushLog(`已重新生成分镜视频：${shotId}`)
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`分镜视频重生失败：${error.message}`),
  })

  const composeMutation = useMutation({
    mutationFn: () => apiClient.composeCloneFinalVideo(projectId, { outputDir: composeOutputDir || undefined }),
    onSuccess: async () => {
      pushLog(`已提交最终成片合成${composeOutputDir ? `：${composeOutputDir}` : ''}`)
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`最终成片合成失败：${error.message}`),
  })

  const updateStageMutation = useMutation({
    mutationFn: (currentStep: 'upload_analyze_script' | 'generate_script_variants' | 'generate_storyboard_grids' | 'generate_shot_videos' | 'compose_final_video') =>
      apiClient.updateCloneProjectStage(projectId, { currentStep }),
    onSuccess: async (_, currentStep) => {
      pushLog(`已切换阶段：${currentStep}`)
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`阶段同步失败：${error.message}`),
  })

  const createShotMutation = useMutation({
    mutationFn: (afterShotId?: string) => apiClient.createCloneShot(projectId, { afterShotId }),
    onSuccess: async () => {
      pushLog('已新增镜头')
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`新增镜头失败：${error.message}`),
  })

  const removeShotMutation = useMutation({
    mutationFn: (shotId: string) => apiClient.removeCloneShot(projectId, shotId),
    onSuccess: async (_, shotId) => {
      pushLog(`已删除镜头：${shotId}`)
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`删除镜头失败：${error.message}`),
  })

  const reorderShotsMutation = useMutation({
    mutationFn: (shotIds: string[]) => apiClient.reorderCloneShots(projectId, { shotIds }),
    onSuccess: async () => {
      pushLog('镜头顺序已更新')
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`镜头排序失败：${error.message}`),
  })

  const getConsistencyReport = async (shotId: string) => {
    const res = await apiClient.getCloneShotConsistencyReport(projectId, shotId)
    return res?.result ?? res ?? null
  }

  const getShotImagePromptPreview = async (shotId: string) => {
    const res = await apiClient.getCloneShotImagePromptPreview(projectId, shotId)
    return res?.result ?? res ?? null
  }

  const getConsistencyAnchors = async (shotId: string) => {
    const res = await apiClient.getCloneShotConsistencyAnchors(projectId, shotId)
    return res?.result ?? res ?? []
  }

  const getConsistencyPatches = async (shotId: string) => {
    const res = await apiClient.getCloneShotConsistencyPatches(projectId, shotId)
    return res?.result ?? res ?? []
  }

  const recompileConsistencyMutation = useMutation({
    mutationFn: (shotId: string) => apiClient.recompileCloneShotConsistency(projectId, shotId),
    onSuccess: async (_, shotId) => {
      pushLog(`已重新编译一致性提示词：${shotId}`)
      await refreshAll()
    },
    onError: (error: Error) => pushLog(`一致性重编译失败：${error.message}`),
  })

  return {
    consoleLines,
    project,
    runtime,
    shots,
    productImages,
    storyboardFrames,
    shotVideoOutputs,
    scriptCandidates,
    selectedModelId,
    selectedVariantId,
    setSelectedVariantId,
    variantCount,
    setVariantCount,
    referenceFile,
    setReferenceFile,
    polling,
    setPolling,
    composeOutputDir,
    setComposeOutputDir,
    models: modelsQuery.data || [],
    loading: projectQuery.isLoading,
    error: projectQuery.error,
    runtimeError: runtimeQuery.error,
    modelsError: modelsQuery.error,
    refreshing: projectQuery.isRefetching || runtimeQuery.isRefetching,
    selectedCandidate:
      scriptCandidates.find((item: any) => String(item.id || item.variantId) === selectedVariantId) || null,
    canGenerateVariants: Boolean(projectId && productImages.length),
    canGenerateImages: Boolean(projectId && selectedVariantId && productImages.length && selectedModelId),
    canGenerateVideos: storyboardFrames.some((item: any) => Boolean(String(item?.imagePath || '').trim())),
    canCompose: shotVideoOutputs.some((item: any) => Boolean(String(item?.videoPath || item?.localPath || '').trim())),
    productionMode,
    allowMockWhenNoKey,
    projectQuery,
    runtimeQuery,
    refreshAll,
    analyzeMutation,
    uploadProductsMutation,
    saveProductPathsMutation,
    selectModelMutation,
    generateVariantsMutation,
    chooseVariantMutation,
    generateImagesMutation,
    regenerateImageMutation,
    generateVideosMutation,
    syncVideoMutation,
    toggleLockMutation,
    updateShotMutation,
    regenerateVideoMutation,
    composeMutation,
    updateStageMutation,
    createShotMutation,
    removeShotMutation,
    reorderShotsMutation,
    recompileConsistencyMutation,
    getConsistencyReport,
    getShotImagePromptPreview,
    getConsistencyAnchors,
    getConsistencyPatches,
    helpers: {
      shotTime(shot: any) {
        const start = Number(shot?.startSec ?? 0)
        const end = Number(shot?.endSec ?? start + Number(shot?.durationSec ?? 0))
        return `${start}s - ${end}s`
      },
      shotText(shot: any) {
        return String(shot?.scriptText || shot?.visualDescription || shot?.actionDescription || '').trim() || '暂无脚本内容'
      },
      frameForShot(shotId: string) {
        return storyboardFrames.find((item: any) => item.shotId === shotId) || null
      },
      videoForShot(shotId: string) {
        return shotVideoOutputs.find((item: any) => item.shotId === shotId) || null
      },
      fileName: toFileName,
      previewSrc: toPreviewSrc,
    },
  }
}
