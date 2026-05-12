import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { type CloneModelIdentitySummary, webApiClient } from '../services/webApi'

export function useWebCloneDetailWorkspace() {
  const route = useRoute()
  const router = useRouter()

  const loading = ref(false)
  const submitting = ref(false)
  const polling = ref(false)
  const project = ref<any | null>(null)
  const runtime = ref<any | null>(null)
  const models = ref<CloneModelIdentitySummary[]>([])
  const selectedVariantId = ref('')
  const variantCount = ref(3)
  const analyzeMessage = ref('')
  const scriptMessage = ref('')
  const imageMessage = ref('')
  const videoMessage = ref('')
  const composeMessage = ref('')
  const localReferenceName = ref('')
  const localReferenceBase64 = ref('')
  const localReferenceMime = ref('video/mp4')
  const productUploadNames = ref<string[]>([])
  const consoleLines = ref<string[]>([])

  let pollTimer: number | null = null

  const projectId = computed(() => String(route.params.projectId || '').trim())
  const shots = computed(() => project.value?.blueprint?.shots || [])
  const scriptCandidates = computed(
    () => project.value?.scriptVariants || project.value?.executionBlueprint?.scriptCandidates || [],
  )
  const selectedModelId = computed(
    () =>
      String(
        project.value?.selectedModelIdentityId || project.value?.selectedModelIdentitySnapshot?.id || '',
      ).trim(),
  )
  const productImages = computed(() => project.value?.productReferenceImagePaths || [])
  const storyboardFrames = computed(() => project.value?.storyboardFrames || [])
  const shotVideoOutputs = computed(() => project.value?.shotVideoOutputs || [])
  const finalOutputPath = computed(() => String(project.value?.finalCompose?.outputPath || '').trim())
  const selectedCandidate = computed(() =>
    scriptCandidates.value.find((item: any) => (item.id || item.variantId) === selectedVariantId.value),
  )

  const canGenerateVariants = computed(
    () => Boolean(projectId.value && productImages.value.length && selectedModelId.value),
  )
  const canGenerateImages = computed(
    () => Boolean(projectId.value && selectedVariantId.value && productImages.value.length && selectedModelId.value),
  )
  const canGenerateVideos = computed(() =>
    storyboardFrames.value.some((item: any) => Boolean(String(item?.imagePath || '').trim())),
  )
  const canCompose = computed(() =>
    shotVideoOutputs.value.some((item: any) => Boolean(String(item?.videoPath || item?.localPath || '').trim())),
  )

  function pushConsole(message: string) {
    const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    consoleLines.value = [`${stamp} ${message}`, ...consoleLines.value].slice(0, 80)
  }

  function basename(input: string) {
    return String(input || '').split(/[/\\]/).pop() || input
  }

  function formatTimeRange(shot: any) {
    const start = Number(shot?.startSec ?? 0)
    const end = Number(shot?.endSec ?? start + Number(shot?.durationSec ?? 0))
    return `${start}s - ${end}s`
  }

  function summarizeShotText(input: any) {
    return (
      String(input?.scriptText || input?.visualDescription || input?.actionDescription || '').trim() ||
      '暂无脚本内容'
    )
  }

  function resolveFrameForShot(shotId: string) {
    return storyboardFrames.value.find((item: any) => item.shotId === shotId) || null
  }

  function resolveVideoForShot(shotId: string) {
    return shotVideoOutputs.value.find((item: any) => item.shotId === shotId) || null
  }

  async function fileToBase64(file: File) {
    const buffer = await file.arrayBuffer()
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
  }

  async function refresh(options?: { silent?: boolean }) {
    if (!projectId.value) return
    const silent = Boolean(options?.silent)
    if (!silent) loading.value = true
    try {
      const [projectRes, runtimeRes, modelRows] = await Promise.all([
        webApiClient.getCloneProject(projectId.value),
        webApiClient.getCloneRuntime(projectId.value).catch(() => null),
        webApiClient.listCloneModelIdentities().catch(() => []),
      ])
      project.value = projectRes.project || null
      runtime.value = runtimeRes
      models.value = modelRows
      selectedVariantId.value = String(
        project.value?.selectedScriptVariantId ||
          project.value?.selectedVariantId ||
          selectedVariantId.value,
      ).trim()
    } catch (error: any) {
      pushConsole(`刷新任务失败：${error?.message ?? String(error)}`)
      throw error
    } finally {
      if (!silent) loading.value = false
    }
  }

  function startPolling() {
    if (pollTimer || !projectId.value) return
    polling.value = true
    pollTimer = window.setInterval(() => {
      void refresh({ silent: true }).catch(() => undefined)
    }, 5000)
  }

  function stopPolling() {
    polling.value = false
    if (pollTimer) {
      window.clearInterval(pollTimer)
      pollTimer = null
    }
  }

  async function onReferenceChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    localReferenceName.value = file.name
    localReferenceMime.value = file.type || 'video/mp4'
    localReferenceBase64.value = await fileToBase64(file)
    pushConsole(`已选择参考视频：${file.name}`)
  }

  async function onProductChange(event: Event) {
    const input = event.target as HTMLInputElement
    const files = Array.from(input.files || [])
    if (!files.length || !projectId.value) return
    submitting.value = true
    scriptMessage.value = ''
    try {
      const payloadFiles = await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          base64Data: await fileToBase64(file),
          mimeType: file.type || 'image/jpeg',
        })),
      )
      pushConsole(`上传商品图 ${files.length} 张`)
      await webApiClient.uploadCloneProductImages(projectId.value, { files: payloadFiles })
      productUploadNames.value = files.map((file) => file.name)
      await refresh()
      scriptMessage.value = '商品图已上传并绑定到当前任务'
    } catch (error: any) {
      scriptMessage.value = error?.message ?? String(error)
      pushConsole(`上传商品图失败：${scriptMessage.value}`)
    } finally {
      submitting.value = false
      input.value = ''
    }
  }

  async function submitAnalyze() {
    if (!projectId.value || !localReferenceBase64.value || !localReferenceName.value) return
    submitting.value = true
    analyzeMessage.value = ''
    try {
      pushConsole(`提交参考视频分析：${localReferenceName.value}`)
      await webApiClient.uploadCloneReferenceVideo(projectId.value, {
        fileName: localReferenceName.value,
        base64Data: localReferenceBase64.value,
        mimeType: localReferenceMime.value,
      })
      await webApiClient.analyzeCloneReference(projectId.value, {
        videoPath: '',
        locale: 'zh-CN',
      })
      await refresh()
      analyzeMessage.value = '参考视频已上传并完成分析'
      pushConsole(`参考视频分析完成：${localReferenceName.value}`)
    } catch (error: any) {
      analyzeMessage.value = error?.message ?? String(error)
      pushConsole(`参考视频分析失败：${analyzeMessage.value}`)
    } finally {
      submitting.value = false
    }
  }

  async function selectModel(identityId: string) {
    if (!projectId.value) return
    submitting.value = true
    try {
      pushConsole(`切换模特：${identityId}`)
      await webApiClient.selectCloneProjectModelIdentity(projectId.value, { identityId })
      await refresh()
    } finally {
      submitting.value = false
    }
  }

  async function generateVariants() {
    if (!projectId.value) return
    submitting.value = true
    scriptMessage.value = ''
    try {
      pushConsole(`生成脚本候选：${variantCount.value} 个`)
      await webApiClient.generateCloneScriptVariants(projectId.value, {
        variantCount: variantCount.value,
      })
      await refresh()
      scriptMessage.value = '脚本候选已生成'
    } catch (error: any) {
      scriptMessage.value = error?.message ?? String(error)
      pushConsole(`生成脚本候选失败：${scriptMessage.value}`)
    } finally {
      submitting.value = false
    }
  }

  async function chooseVariant(variantId: string) {
    if (!projectId.value || !variantId) return
    submitting.value = true
    try {
      pushConsole(`选中脚本候选：${variantId}`)
      await webApiClient.selectCloneScriptVariant(projectId.value, { variantId })
      selectedVariantId.value = variantId
      await refresh()
    } finally {
      submitting.value = false
    }
  }

  async function generateStoryboardImages() {
    if (!projectId.value) return
    submitting.value = true
    imageMessage.value = ''
    try {
      pushConsole(`提交分镜图片生成：project=${projectId.value} variant=${selectedVariantId.value}`)
      await webApiClient.generateStoryboardImages(projectId.value, {
        productReferenceImagePaths: productImages.value,
        selectedModelIdentityId: selectedModelId.value,
      })
      await refresh()
      startPolling()
      imageMessage.value = '分镜图片任务已提交，系统将持续刷新状态'
    } catch (error: any) {
      imageMessage.value = error?.message ?? String(error)
      pushConsole(`生成分镜图片失败：${imageMessage.value}`)
    } finally {
      submitting.value = false
    }
  }

  async function regenerateStoryboardImage(shotId: string) {
    if (!projectId.value) return
    submitting.value = true
    try {
      pushConsole(`重生成分镜图片：${shotId}`)
      await webApiClient.regenerateStoryboardImage(projectId.value, shotId, {
        productReferenceImagePaths: productImages.value,
      })
      await refresh()
      startPolling()
    } finally {
      submitting.value = false
    }
  }

  async function toggleShotLock(shot: any) {
    if (!projectId.value || !shot?.id) return
    submitting.value = true
    try {
      const nextLocked = !Boolean(shot?.locked)
      pushConsole(`${nextLocked ? '锁定' : '解除锁定'}分镜：${shot.id}`)
      await webApiClient.updateCloneShot(projectId.value, shot.id, { locked: nextLocked })
      await refresh()
    } finally {
      submitting.value = false
    }
  }

  async function generateShotVideos() {
    if (!projectId.value) return
    submitting.value = true
    videoMessage.value = ''
    try {
      pushConsole(`提交分镜视频生成：${projectId.value}`)
      await webApiClient.generateCloneShotVideos(projectId.value)
      await refresh()
      startPolling()
      videoMessage.value = '分镜视频任务已提交，系统将持续刷新状态'
    } catch (error: any) {
      videoMessage.value = error?.message ?? String(error)
      pushConsole(`生成分镜视频失败：${videoMessage.value}`)
    } finally {
      submitting.value = false
    }
  }

  async function syncShotVideo(shotId: string) {
    if (!projectId.value) return
    submitting.value = true
    try {
      pushConsole(`同步分镜视频状态：${shotId}`)
      await webApiClient.syncCloneShotVideoTask(projectId.value, shotId)
      await refresh()
    } finally {
      submitting.value = false
    }
  }

  async function regenerateShotVideo(shotId: string) {
    if (!projectId.value) return
    submitting.value = true
    try {
      pushConsole(`重生成分镜视频：${shotId}`)
      await webApiClient.regenerateCloneShotVideo(projectId.value, shotId)
      await refresh()
      startPolling()
    } finally {
      submitting.value = false
    }
  }

  async function composeFinalVideo() {
    if (!projectId.value) return
    submitting.value = true
    composeMessage.value = ''
    try {
      pushConsole(`提交最终成片合成：${projectId.value}`)
      await webApiClient.composeCloneFinalVideo(projectId.value)
      await refresh()
      startPolling()
      composeMessage.value = '最终成片任务已提交，系统将持续刷新状态'
    } catch (error: any) {
      composeMessage.value = error?.message ?? String(error)
      pushConsole(`合成最终成片失败：${composeMessage.value}`)
    } finally {
      submitting.value = false
    }
  }

  onMounted(async () => {
    try {
      await refresh()
      startPolling()
    } catch {
      await router.push('/clone')
    }
  })

  onUnmounted(stopPolling)

  return {
    analyzeMessage,
    basename,
    canCompose,
    canGenerateImages,
    canGenerateVariants,
    canGenerateVideos,
    chooseVariant,
    composeFinalVideo,
    composeMessage,
    consoleLines,
    finalOutputPath,
    formatTimeRange,
    generateShotVideos,
    generateStoryboardImages,
    generateVariants,
    imageMessage,
    loading,
    localReferenceBase64,
    localReferenceName,
    models,
    onProductChange,
    onReferenceChange,
    polling,
    productImages,
    productUploadNames,
    project,
    refresh,
    regenerateShotVideo,
    regenerateStoryboardImage,
    resolveFrameForShot,
    resolveVideoForShot,
    runtime,
    scriptCandidates,
    scriptMessage,
    selectedCandidate,
    selectedModelId,
    selectedVariantId,
    selectModel,
    shots,
    shotVideoOutputs,
    startPolling,
    stopPolling,
    storyboardFrames,
    submitAnalyze,
    submitting,
    summarizeShotText,
    syncShotVideo,
    toggleShotLock,
    variantCount,
    videoMessage,
  }
}
