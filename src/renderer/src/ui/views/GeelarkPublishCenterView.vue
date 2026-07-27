<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  LoaderCircle,
  Music4,
  Package2,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  Wand2,
  Wrench,
} from 'lucide-vue-next'
import {
  webApiClient,
  type CloneProjectSummary,
  type GeelarkClonePublishCandidate,
  type GeelarkMusicPreset,
  type GeelarkPublishAccount,
  type GeelarkPublishTaskSummary,
} from '@/lib/webApiClient'

const router = useRouter()
const { t } = useI18n()

const LOCAL_GEELARK_ACCOUNTS_KEY = 'videogen-geelark-accounts'
const LOCAL_GEELARK_TASKS_KEY = 'videogen-geelark-tasks'
const LOCAL_GEELARK_MUSIC_PRESETS_KEY = 'videogen-geelark-music-presets'
const LOCAL_GEELARK_PUBLISH_DRAFT_KEY = 'videogen-geelark-publish-draft'
const REQUEST_TIMEOUT_MS = 5000

const loading = ref(false)
const pluginReady = ref(false)
const candidateRefreshing = ref(false)
const publishing = ref(false)
const generatingTitle = ref(false)
const savingMusicPreset = ref(false)
const syncingTaskId = ref('')
const notice = ref('')
const errorText = ref('')
const publishCandidates = ref<GeelarkClonePublishCandidate[]>([])
const tasks = ref<GeelarkPublishTaskSummary[]>([])
const accounts = ref<GeelarkPublishAccount[]>([])
const musicPresets = ref<GeelarkMusicPreset[]>([])
const selectedCandidateId = ref('')
const editingMusicPresetId = ref('')
const candidatePage = ref(1)
const activePublishStep = ref<'content' | 'goods' | 'music' | 'options'>('content')

const CANDIDATE_PAGE_SIZE = 8
const PUBLISH_LANGUAGE_OPTIONS = computed(() => [
  { value: 'zh-CN', label: t('autoUi.k_93659150d0e5') },
  { value: 'en-US', label: 'English' },
  { value: 'vi-VN', label: 'Tiếng Việt' },
  { value: 'th-TH', label: 'ไทย' },
  { value: 'id-ID', label: 'Bahasa Indonesia' },
  { value: 'ms-MY', label: 'Bahasa Melayu' },
] as const)

const publishForm = reactive({
  publishAccountId: '',
  contentLanguage: 'zh-CN',
  videoDesc: '',
  productId: '',
  productTitle: '',
  refVideoId: '',
  sameVideoVolume: 30,
  sourceVideoVolume: 30,
  markAI: false,
  musicMode: 'volume_only' as 'library_ref' | 'manual_ref' | 'volume_only',
  musicPresetId: '',
  musicLabel: '',
  needShareLink: false,
})

const musicPresetForm = reactive({
  label: '',
  refVideoId: '',
  remark: '',
})

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function isApiNotFoundError(error: unknown) {
  const message = String((error as { message?: string } | undefined)?.message ?? error ?? '').trim()
  return message.includes('\u63a5\u53e3\u4e0d\u5b58\u5728')
}

function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)?.trim()
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeLocalJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

function readLocalGeelarkAccounts() {
  return ensureArray<GeelarkPublishAccount>(readLocalJson<GeelarkPublishAccount[]>(LOCAL_GEELARK_ACCOUNTS_KEY, []))
}

function writeLocalGeelarkAccounts(items: GeelarkPublishAccount[]) {
  writeLocalJson(LOCAL_GEELARK_ACCOUNTS_KEY, ensureArray(items))
}

function readLocalGeelarkTasks() {
  return ensureArray<GeelarkPublishTaskSummary>(readLocalJson<GeelarkPublishTaskSummary[]>(LOCAL_GEELARK_TASKS_KEY, []))
}

function writeLocalGeelarkTasks(items: GeelarkPublishTaskSummary[]) {
  writeLocalJson(LOCAL_GEELARK_TASKS_KEY, ensureArray(items))
}

function readLocalMusicPresets() {
  return ensureArray<GeelarkMusicPreset>(readLocalJson<GeelarkMusicPreset[]>(LOCAL_GEELARK_MUSIC_PRESETS_KEY, []))
}

function writeLocalMusicPresets(items: GeelarkMusicPreset[]) {
  writeLocalJson(LOCAL_GEELARK_MUSIC_PRESETS_KEY, ensureArray(items))
}

async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label + t('autoUi.k_a9d49c7d6b95'))), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const selectedCandidate = computed(
  () => ensureArray<GeelarkClonePublishCandidate>(publishCandidates.value).find((item) => item.cloneProjectId === selectedCandidateId.value) || null,
)
const candidateTotalPages = computed(() => Math.max(1, Math.ceil(publishCandidates.value.length / CANDIDATE_PAGE_SIZE)))
const visibleCandidates = computed(() => {
  const start = (candidatePage.value - 1) * CANDIDATE_PAGE_SIZE
  return publishCandidates.value.slice(start, start + CANDIDATE_PAGE_SIZE)
})
const selectedMusicPreset = computed(
  () => ensureArray<GeelarkMusicPreset>(musicPresets.value).find((item) => item.id === publishForm.musicPresetId) || null,
)
const activeAccounts = computed(() => ensureArray<GeelarkPublishAccount>(accounts.value).filter((item) => item.status === 'active'))
const publishSteps = computed(() => [
  { key: 'content', index: '01', title: t('autoUi.k_882d03bcf21c'), description: t('autoUi.k_9d5af0919383') },
  { key: 'goods', index: '02', title: t('autoUi.k_751c5853892e'), description: t('autoUi.k_dc81cf3d2a9c') },
  { key: 'music', index: '03', title: t('autoUi.k_f99830ac6219'), description: t('autoUi.k_971714bb3171') },
  { key: 'options', index: '04', title: t('autoUi.k_dc7f89c5e018'), description: t('autoUi.k_3e517eca98f7') },
] as const)
const currentStepIndex = computed(() => publishSteps.value.findIndex((item) => item.key === activePublishStep.value))
const lastRefreshText = computed(() => {
  const latest = Math.max(
    0,
    ...publishCandidates.value.map((item) => Number(item.updatedAt || 0)),
    ...tasks.value.map((item) => Number(item.updatedAt || 0)),
    ...accounts.value.map((item) => Number(item.updatedAt || 0)),
  )
  return latest ? t('autoUi.k_842292abaac4', { p0: formatTime(latest) }) : t('autoUi.k_fc1ac38a2f82')
})

watch(
  () => publishCandidates.value.length,
  () => {
    if (candidatePage.value > candidateTotalPages.value) {
      candidatePage.value = candidateTotalPages.value
    }
  },
)

watch(selectedCandidateId, (value) => {
  const index = publishCandidates.value.findIndex((item) => item.cloneProjectId === value)
  if (index < 0) return
  const nextPage = Math.floor(index / CANDIDATE_PAGE_SIZE) + 1
  if (candidatePage.value !== nextPage) {
    candidatePage.value = nextPage
  }
})

function changeCandidatePage(nextPage: number) {
  candidatePage.value = Math.min(candidateTotalPages.value, Math.max(1, nextPage))
}

function shortPath(input?: string) {
  const text = String(input || '').trim()
  if (!text) return '--'
  const parts = text.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) || text
}

function formatTime(value?: number) {
  if (!value) return '--'
  const d = new Date(value)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function mediaUrl(path?: string) {
  const text = String(path || '').trim()
  if (!text) return ''
  const previewMediaPath = (window.api as { previewMediaPath?: (value: string) => string } | undefined)?.previewMediaPath
  if (typeof previewMediaPath === 'function') {
    try {
      return String(previewMediaPath(text) || '').trim()
    } catch {
      return ''
    }
  }
  return ''
}

function candidateStatusText(status: GeelarkClonePublishCandidate['publishedStatus']) {
  if (status === 'published') return t('autoUi.k_176a2eb4eb17')
  if (status === 'failed') return t('autoUi.k_7e7f5d44c467')
  return t('autoUi.k_0654678dec5f')
}

function taskStatusText(status: GeelarkPublishTaskSummary['status']) {
  if (status === 'waiting') return t('autoUi.k_bd3488d0a929')
  if (status === 'in_progress') return t('autoUi.k_7e4da0f6e774')
  if (status === 'completed') return t('autoUi.k_e99b48a29bdf')
  if (status === 'failed') return t('autoUi.k_3e3c8068bb0e')
  if (status === 'cancelled') return t('autoUi.k_a5ffdc95eeb0')
  return t('autoUi.k_d9c32a4c3dda')
}

function taskFailHint(item: GeelarkPublishTaskSummary) {
  const code = Number(item.failCode || 0)
  if ([20243, 20244, 20252, 20253].includes(code)) {
    return t('autoUi.k_294bd298ff0b')
  }
  if ([20232, 20233, 20234, 20236, 20241, 20256, 20266, 20702, 20703].includes(code)) {
    return t('autoUi.k_1fb52b54daec')
  }
  return ''
}

function resetPublishForm() {
  publishForm.videoDesc = ''
  publishForm.productId = ''
  publishForm.productTitle = ''
  publishForm.refVideoId = ''
  publishForm.sameVideoVolume = 30
  publishForm.sourceVideoVolume = 30
  publishForm.markAI = false
  publishForm.musicMode = 'volume_only'
  publishForm.musicPresetId = ''
  publishForm.musicLabel = ''
  publishForm.needShareLink = false
}

function restorePublishDraft() {
  const draft = readLocalJson<Partial<typeof publishForm>>(LOCAL_GEELARK_PUBLISH_DRAFT_KEY, {})
  if (!draft || typeof draft !== 'object') return
  publishForm.publishAccountId = String(draft.publishAccountId || '')
  publishForm.contentLanguage = String(draft.contentLanguage || 'zh-CN')
  publishForm.videoDesc = String(draft.videoDesc || '')
  publishForm.productId = String(draft.productId || '')
  publishForm.productTitle = String(draft.productTitle || '')
  publishForm.refVideoId = String(draft.refVideoId || '')
  publishForm.sameVideoVolume = Number(draft.sameVideoVolume ?? 30)
  publishForm.sourceVideoVolume = Number(draft.sourceVideoVolume ?? 30)
  publishForm.markAI = Boolean(draft.markAI)
  publishForm.musicMode = (draft.musicMode === 'library_ref' || draft.musicMode === 'manual_ref' ? draft.musicMode : 'volume_only')
  publishForm.musicPresetId = String(draft.musicPresetId || '')
  publishForm.musicLabel = String(draft.musicLabel || '')
  publishForm.needShareLink = Boolean(draft.needShareLink)
}

function savePublishDraft() {
  writeLocalJson(LOCAL_GEELARK_PUBLISH_DRAFT_KEY, { ...publishForm })
  notice.value = t('autoUi.k_65eedfe4ddcc')
  errorText.value = ''
}

function resetMusicPresetForm() {
  editingMusicPresetId.value = ''
  musicPresetForm.label = ''
  musicPresetForm.refVideoId = ''
  musicPresetForm.remark = ''
}

function applySelectedCandidate(candidate: GeelarkClonePublishCandidate | null) {
  if (!candidate) return
  publishForm.videoDesc = candidate.title
  publishForm.productTitle = candidate.title
  publishForm.refVideoId = ''
  publishForm.musicPresetId = ''
  publishForm.musicLabel = ''
  publishForm.musicMode = 'volume_only'
}

function syncSelectedCandidate() {
  if (!selectedCandidateId.value && publishCandidates.value.length) {
    selectedCandidateId.value = publishCandidates.value[0].cloneProjectId
    applySelectedCandidate(selectedCandidate.value)
  } else if (selectedCandidateId.value && !publishCandidates.value.some((item) => item.cloneProjectId === selectedCandidateId.value)) {
    selectedCandidateId.value = publishCandidates.value[0]?.cloneProjectId || ''
    applySelectedCandidate(selectedCandidate.value)
  }
}

function buildLocalCandidateList(projects: CloneProjectSummary[], taskItems: GeelarkPublishTaskSummary[]) {
  const safeProjects = ensureArray<CloneProjectSummary>(projects)
  const safeTaskItems = ensureArray<GeelarkPublishTaskSummary>(taskItems)
  const publishedTaskMap = new Map<string, GeelarkPublishTaskSummary>()

  for (const item of safeTaskItems) {
    if (!item?.cloneProjectId) continue
    if (!['waiting', 'in_progress', 'completed'].includes(item.status)) continue
    const prev = publishedTaskMap.get(item.cloneProjectId)
    if (!prev || item.updatedAt > prev.updatedAt) {
      publishedTaskMap.set(item.cloneProjectId, item)
    }
  }

  return safeProjects
    .filter((item) => String(item?.finalOutputPath || '').trim())
    .filter((item) => !publishedTaskMap.has(item.id))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map<GeelarkClonePublishCandidate>((item) => {
      const related = safeTaskItems.filter((task) => task?.cloneProjectId === item.id).sort((a, b) => b.updatedAt - a.updatedAt)
      const latest = related[0]
      return {
        cloneProjectId: item.id,
        title: item.title,
        coverAssetPath: item.coverAssetPath,
        finalOutputPath: item.finalOutputPath,
        referenceVideoName: item.referenceVideoName,
        referenceVideoPath: item.referenceVideoPath,
        productReferenceImagePaths: ensureArray<string>(item.productReferenceImagePaths).slice(0, 6),
        updatedAt: item.updatedAt,
        publishedStatus: latest?.status === 'failed' ? 'failed' : 'unpublished',
        lastPublishTaskId: latest?.id,
        lastPublishStatus: latest?.status,
      }
    })
}

async function loadCandidatesWithFallback(taskItems: GeelarkPublishTaskSummary[]) {
  const buildFallback = async () => {
    const projects = ensureArray<CloneProjectSummary>(await webApiClient.listCloneProjects().catch(() => []))
    return buildLocalCandidateList(projects, taskItems)
  }

  try {
    const remoteItems = ensureArray<GeelarkClonePublishCandidate>(await webApiClient.listGeelarkPublishCandidates())
    publishCandidates.value = remoteItems.length ? remoteItems : await buildFallback()
  } catch (error: any) {
    if (!isApiNotFoundError(error)) {
      errorText.value = error?.message ?? String(error)
    }
    publishCandidates.value = await buildFallback()
  }
}

async function refreshCandidates(taskItems: GeelarkPublishTaskSummary[] = tasks.value) {
  candidateRefreshing.value = true
  try {
    await withTimeout(loadCandidatesWithFallback(taskItems), t('autoUi.k_f109b5c73a8f'))
  } catch (error: any) {
    if (!isApiNotFoundError(error)) {
      errorText.value = error?.message ?? String(error)
    }
  } finally {
    candidateRefreshing.value = false
    syncSelectedCandidate()
  }
}

async function loadAll() {
  loading.value = true
  errorText.value = ''
  pluginReady.value = false
  publishCandidates.value = []

  try {
    const plugin = await webApiClient.getPlugin('geelark-publisher')
    pluginReady.value = plugin.status === 'installed' && plugin.runtimeState === 'enabled'
    if (!pluginReady.value) {
      errorText.value = t('geelarkPublishCenter.gate.error')
      accounts.value = []
      tasks.value = []
      musicPresets.value = []
      return
    }

    accounts.value = readLocalGeelarkAccounts()
    tasks.value = readLocalGeelarkTasks()
    musicPresets.value = readLocalMusicPresets()

    const [accountsResult, tasksResult, musicResult] = await Promise.allSettled([
      withTimeout(webApiClient.listGeelarkPublisherAccounts(), t('autoUi.k_f6afab4f2d29')),
      withTimeout(webApiClient.listGeelarkPublishTasks(), t('autoUi.k_81e993ba8045')),
      withTimeout(webApiClient.listGeelarkMusicPresets(), t('autoUi.k_6bcc3e938805')),
    ])

    if (accountsResult.status === 'fulfilled') {
      accounts.value = ensureArray<GeelarkPublishAccount>(accountsResult.value)
      writeLocalGeelarkAccounts(accounts.value)
    } else if (!isApiNotFoundError(accountsResult.reason) && !errorText.value) {
      errorText.value = String(accountsResult.reason?.message || accountsResult.reason || '')
    }

    if (tasksResult.status === 'fulfilled') {
      tasks.value = ensureArray<GeelarkPublishTaskSummary>(tasksResult.value)
      writeLocalGeelarkTasks(tasks.value)
    } else if (!isApiNotFoundError(tasksResult.reason) && !errorText.value) {
      errorText.value = String(tasksResult.reason?.message || tasksResult.reason || '')
    }

    if (musicResult.status === 'fulfilled') {
      musicPresets.value = ensureArray<GeelarkMusicPreset>(musicResult.value)
      writeLocalMusicPresets(musicPresets.value)
    } else if (!isApiNotFoundError(musicResult.reason) && !errorText.value) {
      errorText.value = String(musicResult.reason?.message || musicResult.reason || '')
    }

    try {
      const remoteCandidates = ensureArray<GeelarkClonePublishCandidate>(
        await withTimeout(webApiClient.listGeelarkPublishCandidates(), t('autoUi.k_f109b5c73a8f')),
      )
      if (remoteCandidates.length) {
        publishCandidates.value = remoteCandidates
      }
    } catch (error: any) {
      if (!isApiNotFoundError(error) && !errorText.value) {
        errorText.value = String(error?.message || error || '')
      }
    }
  } catch (error: any) {
    accounts.value = []
    tasks.value = []
    musicPresets.value = []
    errorText.value = error?.message ?? String(error)
  } finally {
    loading.value = false
    syncSelectedCandidate()
  }

  if (pluginReady.value && !publishCandidates.value.length) {
    void refreshCandidates(tasks.value)
  }
}

function selectCandidate(item: GeelarkClonePublishCandidate) {
  selectedCandidateId.value = item.cloneProjectId
  applySelectedCandidate(item)
  activePublishStep.value = 'content'
}

function buildFallbackTitle() {
  const sourceTitle = String(selectedCandidate.value?.title || '').trim()
  const productTitle = String(publishForm.productTitle || '').trim()
  const productId = String(publishForm.productId || '').trim()
  const language = publishForm.contentLanguage
  if (language === 'en-US') {
    return [productTitle || sourceTitle, productId ? `Product ${productId}` : '', 'Shop now'].filter(Boolean).join(' · ')
  }
  if (language === 'vi-VN') {
    return [productTitle || sourceTitle, productId ? `San pham ${productId}` : '', 'Mua ngay'].filter(Boolean).join(' · ')
  }
  if (language === 'th-TH') {
    return [productTitle || sourceTitle, productId ? `สินค้า ${productId}` : '', 'ช้อปเลย'].filter(Boolean).join(' · ')
  }
  if (language === 'id-ID' || language === 'ms-MY') {
    return [productTitle || sourceTitle, productId ? `Produk ${productId}` : '', 'Belanja sekarang'].filter(Boolean).join(' · ')
  }
  return [productTitle || sourceTitle, productId ? (t('autoUi.k_03d27561da75') + productId) : '', t('autoUi.k_5aa53645b92e')].filter(Boolean).join(' · ')
}

function containsCjk(text: string) {
  return /[\u4e00-\u9fff]/.test(text)
}

function containsThai(text: string) {
  return /[\u0e00-\u0e7f]/.test(text)
}

function isPublishTitleLanguageMatched(title: string) {
  const text = String(title || '').trim()
  if (!text) return false
  const language = publishForm.contentLanguage
  if (language === 'zh-CN') return containsCjk(text)
  if (language === 'th-TH') return containsThai(text) && !containsCjk(text)
  if (language === 'en-US') return !containsCjk(text) && !containsThai(text)
  if (language === 'vi-VN' || language === 'id-ID' || language === 'ms-MY') return !containsCjk(text) && !containsThai(text)
  return true
}

async function generateTitle() {
  if (!selectedCandidate.value) return
  generatingTitle.value = true
  errorText.value = ''
  notice.value = ''
  try {
    const result = await webApiClient.generateGeelarkPublishTitle({
      cloneProjectId: selectedCandidate.value.cloneProjectId,
      contentLanguage: publishForm.contentLanguage,
      productTitle: publishForm.productTitle || undefined,
      productId: publishForm.productId || undefined,
      productReferenceImagePaths: ensureArray<string>(selectedCandidate.value.productReferenceImagePaths).slice(0, 6),
    })
    const primary = String(result.content || result.candidates?.[0] || '').trim()
    const matched = isPublishTitleLanguageMatched(primary)
    publishForm.videoDesc = matched ? primary : buildFallbackTitle()
    notice.value = matched ? t('autoUi.k_0b82f85b5790') : t('autoUi.k_e96f223e487f')
  } catch (error: any) {
    publishForm.videoDesc = buildFallbackTitle()
    if (isApiNotFoundError(error)) {
      notice.value = t('autoUi.k_b0a9036d5d90')
      errorText.value = ''
    } else {
      errorText.value = error?.message ?? String(error)
    }
  } finally {
    generatingTitle.value = false
  }
}

function activateStep(step: 'content' | 'goods' | 'music' | 'options') {
  activePublishStep.value = step
}

function goNextStep() {
  const next = publishSteps.value[currentStepIndex.value + 1]
  if (next) {
    activePublishStep.value = next.key
    return
  }
  void publishSelected()
}

function importFromTemplate() {
  if (!selectedCandidate.value) return
  applySelectedCandidate(selectedCandidate.value)
  const latestTask = tasks.value.find((item) => item.cloneProjectId === selectedCandidate.value?.cloneProjectId)
  if (latestTask) {
    publishForm.publishAccountId = latestTask.publishAccountId || publishForm.publishAccountId
    publishForm.videoDesc = latestTask.videoDesc || publishForm.videoDesc
    publishForm.productId = latestTask.productId || publishForm.productId
    publishForm.productTitle = latestTask.productTitle || publishForm.productTitle
    publishForm.refVideoId = latestTask.refVideoId || publishForm.refVideoId
  }
  notice.value = t('autoUi.k_001646c3c0a0')
  errorText.value = ''
}

function onMusicPresetChange() {
  const preset = selectedMusicPreset.value
  if (!preset) return
  publishForm.refVideoId = preset.refVideoId
  publishForm.musicLabel = preset.label
}

function editMusicPreset(item: GeelarkMusicPreset) {
  editingMusicPresetId.value = item.id
  musicPresetForm.label = item.label
  musicPresetForm.refVideoId = item.refVideoId
  musicPresetForm.remark = item.remark || ''
}

async function saveMusicPreset() {
  savingMusicPreset.value = true
  errorText.value = ''
  notice.value = ''
  try {
    await webApiClient.saveGeelarkMusicPreset({
      id: editingMusicPresetId.value || undefined,
      label: musicPresetForm.label,
      refVideoId: musicPresetForm.refVideoId,
      remark: musicPresetForm.remark || undefined,
    })
    musicPresets.value = ensureArray<GeelarkMusicPreset>(await webApiClient.listGeelarkMusicPresets())
    writeLocalMusicPresets(musicPresets.value)
    resetMusicPresetForm()
    notice.value = t('autoUi.k_4d42b62a6f5c')
  } catch (error: any) {
    if (isApiNotFoundError(error)) {
      const now = Date.now()
      const nextItems = [...readLocalMusicPresets()]
      const id = editingMusicPresetId.value || ('music-' + now)
      const index = nextItems.findIndex((item) => item.id === id)
      const nextItem: GeelarkMusicPreset = {
        id,
        label: musicPresetForm.label,
        refVideoId: musicPresetForm.refVideoId,
        remark: musicPresetForm.remark || undefined,
        createdAt: index >= 0 ? nextItems[index].createdAt : now,
        updatedAt: now,
      }
      if (index >= 0) nextItems[index] = nextItem
      else nextItems.unshift(nextItem)
      writeLocalMusicPresets(nextItems)
      musicPresets.value = nextItems
      resetMusicPresetForm()
      notice.value = t('autoUi.k_ace216fc653e')
      errorText.value = ''
    } else {
      errorText.value = error?.message ?? String(error)
    }
  } finally {
    savingMusicPreset.value = false
  }
}

async function removeMusicPreset(id: string) {
  errorText.value = ''
  notice.value = ''
  try {
    await webApiClient.deleteGeelarkMusicPreset(id)
    musicPresets.value = ensureArray<GeelarkMusicPreset>(await webApiClient.listGeelarkMusicPresets())
    writeLocalMusicPresets(musicPresets.value)
    if (editingMusicPresetId.value === id) resetMusicPresetForm()
    notice.value = t('autoUi.k_1706c28c3c1e')
  } catch (error: any) {
    if (isApiNotFoundError(error)) {
      const nextItems = readLocalMusicPresets().filter((item) => item.id !== id)
      writeLocalMusicPresets(nextItems)
      musicPresets.value = nextItems
      if (editingMusicPresetId.value === id) resetMusicPresetForm()
      notice.value = t('autoUi.k_c9b9addcd24e')
      errorText.value = ''
    } else {
      errorText.value = error?.message ?? String(error)
    }
  } finally {
    savingMusicPreset.value = false
  }
}

async function publishSelected() {
  if (!selectedCandidate.value) {
    errorText.value = t('autoUi.k_0b1146f9f41d')
    return
  }
  if (!publishForm.publishAccountId) {
    errorText.value = t('autoUi.k_0f8c6014d29e')
    return
  }

  publishing.value = true
  errorText.value = ''
  notice.value = ''
  try {
    const item = await webApiClient.publishGeelarkVideo({
      cloneProjectId: selectedCandidate.value.cloneProjectId,
      videoPath: selectedCandidate.value.finalOutputPath,
      publishAccountId: publishForm.publishAccountId,
      videoDesc: publishForm.videoDesc || undefined,
      productId: publishForm.productId || undefined,
      productTitle: publishForm.productTitle || undefined,
      refVideoId: publishForm.refVideoId || undefined,
      sameVideoVolume: Number(publishForm.sameVideoVolume || 0),
      sourceVideoVolume: Number(publishForm.sourceVideoVolume || 0),
      markAI: publishForm.markAI,
      musicMode: publishForm.musicMode,
      musicLabel: publishForm.musicLabel || undefined,
      needShareLink: publishForm.needShareLink,
    })
    tasks.value = [item, ...tasks.value.filter((task) => task.id !== item.id)]
    writeLocalGeelarkTasks(tasks.value)
    notice.value = t('autoUi.k_5a7fbde7268c')
    resetPublishForm()
    await refreshCandidates(tasks.value)
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    publishing.value = false
  }
}

async function syncTask(id: string) {
  syncingTaskId.value = id
  errorText.value = ''
  notice.value = ''
  try {
    const item = await webApiClient.syncGeelarkPublishTask(id)
    tasks.value = tasks.value.map((task) => (task.id === id ? item : task))
    writeLocalGeelarkTasks(tasks.value)
    notice.value = t('autoUi.k_6935a97cbc8c')
  } catch (error: any) {
    if (isApiNotFoundError(error)) {
      notice.value = t('autoUi.k_07701b9cb7ce')
      errorText.value = ''
    } else {
      errorText.value = error?.message ?? String(error)
    }
  } finally {
    syncingTaskId.value = ''
  }
}

function openSettings() {
  void router.push('/plugins')
}

onMounted(() => {
  restorePublishDraft()
  void loadAll()
})
</script>

<template>
  <div class="publish-center-page">
    <section class="hero-card">
      <div class="hero-main">
        <button class="back-link" type="button" @click="openSettings">
          <ArrowLeft class="h-4 w-4" />
          {{ t('geelarkPublishCenter.hero.back') }}
        </button>
        <div class="hero-title-row">
          <div class="hero-copy">
            <h1>{{ t('geelarkPublishCenter.hero.title') }}</h1>
            <p>{{ t('geelarkPublishCenter.hero.desc') }}</p>
          </div>
          <div v-if="pluginReady" class="hero-stats">
            <span class="hero-stat hero-stat--purple">
              <span class="hero-stat__icon"><Sparkles class="h-4 w-4" /></span>
              <div>
                <strong>{{ publishCandidates.length }}</strong>
                <small>{{ t('autoUi.k_0654678dec5f') }}</small>
              </div>
            </span>
            <span class="hero-stat hero-stat--blue">
              <span class="hero-stat__icon"><UserRound class="h-4 w-4" /></span>
              <div>
                <strong>{{ activeAccounts.length }}</strong>
                <small>{{ t('autoUi.k_901384917949') }}</small>
              </div>
            </span>
            <span class="hero-stat hero-stat--green">
              <span class="hero-stat__icon"><ShieldCheck class="h-4 w-4" /></span>
              <div>
                <strong>{{ tasks.length }}</strong>
                <small>{{ t('autoUi.k_3172b317f9fc') }}</small>
              </div>
            </span>
          </div>
        </div>
      </div>
      <div v-if="pluginReady" class="hero-actions">
        <span class="hero-refresh-meta">{{ t('autoUi.k_aacd708347a8') }}{{ lastRefreshText }}</span>
        <button class="ghost-button hero-refresh-button" type="button" @click="loadAll">
          <RefreshCw class="h-4 w-4" /> {{ t('autoUi.k_048f7692c8a0') }} </button>
      </div>
    </section>

    <div v-if="notice" class="banner banner--success">{{ notice }}</div>
    <div v-if="errorText" class="banner banner--error">{{ errorText }}</div>

    <section v-if="loading" class="loading-card">
      <LoaderCircle class="h-5 w-5 spin" />
      <span>{{ t('geelarkPublishCenter.hero.loading') }}</span>
    </section>

    <template v-else-if="pluginReady">
      <section class="workspace-layout">
        <article class="panel-card candidate-panel">
          <div class="panel-head">
            <div class="panel-head__copy">
              <h2>{{ t('autoUi.k_4f1be97c3e3d') }}</h2>
            </div>
            <div class="candidate-panel__summary">
              <span class="count-badge">{{ publishCandidates.length }}</span>
              <span v-if="candidateRefreshing" class="summary-hint">{{ t('autoUi.k_1751688d9519') }}</span>
            </div>
          </div>

          <div v-if="!publishCandidates.length" class="empty-inline">
            <Upload class="h-5 w-5" />
            <span>{{ t('autoUi.k_40ffcf85da2d') }}</span>
          </div>

          <div v-else class="candidate-list">
            <button
              v-for="item in visibleCandidates"
              :key="item.cloneProjectId"
              class="candidate-item"
              :class="{ active: selectedCandidateId === item.cloneProjectId }"
              type="button"
              @click="selectCandidate(item)"
            >
              <div class="candidate-item__cover">
                <img v-if="mediaUrl(item.coverAssetPath)" :src="mediaUrl(item.coverAssetPath)" :alt="item.title" />
                <div v-else class="candidate-item__cover-empty"><Wrench class="h-5 w-5" /></div>
              </div>
              <div class="candidate-item__body">
                <div class="candidate-item__topline">
                  <span class="candidate-item__state">{{ candidateStatusText(item.publishedStatus) }}</span>
                  <small>{{ formatTime(item.updatedAt) }}</small>
                </div>
                <strong>{{ shortPath(item.finalOutputPath) }}</strong>
                <p>{{ t('autoUi.k_2629bbb744ec') }}{{ item.referenceVideoName || shortPath(item.referenceVideoPath) }}</p>
              </div>
              <div class="candidate-item__meta">
                <ChevronRight class="h-4 w-4" />
              </div>
            </button>
          </div>

          <div v-if="publishCandidates.length > CANDIDATE_PAGE_SIZE" class="candidate-pagination">
            <button class="ghost-button candidate-pagination__button" type="button" :disabled="candidatePage <= 1" @click="changeCandidatePage(candidatePage - 1)">
              <ArrowLeft class="h-4 w-4" />
            </button>
            <span class="candidate-pagination__text">{{ candidatePage }} / {{ candidateTotalPages }} {{ t('autoUi.k_73422182ab45') }}</span>
            <button class="ghost-button candidate-pagination__button" type="button" :disabled="candidatePage >= candidateTotalPages" @click="changeCandidatePage(candidatePage + 1)"> {{ t('autoUi.k_67a246a344ae') }} </button>
          </div>
        </article>

        <article class="panel-card publish-panel">
          <div class="panel-head">
            <div class="panel-head__copy">
              <h2>{{ t('autoUi.k_c2903ef9f803') }}</h2>
              <p class="panel-subcopy">{{ t('autoUi.k_e332ee564757') }}</p>
            </div>
          </div>

          <div class="publish-steps">
            <button
              v-for="(step, index) in publishSteps"
              :key="step.key"
              class="publish-step"
              :class="{ active: activePublishStep === step.key, done: currentStepIndex > index }"
              type="button"
              @click="activateStep(step.key)"
            >
              <span class="publish-step__index">{{ step.index }}</span>
              <div class="publish-step__copy">
                <strong>{{ step.title }}</strong>
                <small>{{ step.description }}</small>
              </div>
              <ChevronRight v-if="index < publishSteps.length - 1" class="publish-step__arrow h-4 w-4" />
            </button>
          </div>

          <div v-if="selectedCandidate" class="selected-preview">
            <div class="selected-preview__cover selected-preview__cover--media">
              <img v-if="mediaUrl(selectedCandidate.coverAssetPath)" :src="mediaUrl(selectedCandidate.coverAssetPath)" :alt="selectedCandidate.title" />
              <div v-else class="candidate-item__cover-empty"><Play class="h-6 w-6" /></div>
            </div>
            <div class="selected-preview__content">
              <div class="selected-preview__headline">
                <span class="selected-preview__count">{{ currentStepIndex + 1 }}</span>
                <strong>{{ shortPath(selectedCandidate.finalOutputPath) }}</strong>
              </div>
              <div class="selected-preview__chips">
                <span>{{ shortPath(selectedCandidate.finalOutputPath) }}</span>
                <span>MP4</span>
                <span>{{ formatTime(selectedCandidate.updatedAt) }}</span>
              </div>
              <small>{{ selectedCandidate.referenceVideoName || shortPath(selectedCandidate.referenceVideoPath) }}</small>
            </div>
            <div class="selected-preview__action">
              <button class="ghost-button ai-button" type="button" :disabled="generatingTitle || !selectedCandidate" @click="generateTitle">
                <Sparkles class="h-4 w-4" />
                {{ generatingTitle ? t('autoUi.k_26eab253a08e') : t('autoUi.k_5adc2759b4bb') }}
              </button>
            </div>
          </div>

          <div class="publish-workbench">
            <div class="publish-form-stack">
              <section v-if="activePublishStep === 'content'" class="form-section workspace-card">
                <div class="workspace-card__head">
                  <div>
                    <strong>{{ t('autoUi.k_cf7e1fa5b337') }}</strong>
                    <p>{{ t('autoUi.k_c55065c0e8c5') }}</p>
                  </div>
                </div>
                <div class="field-grid">
                  <label class="field field--full">
                    <span>{{ t('autoUi.k_f6afab4f2d29') }}</span>
                    <select v-model="publishForm.publishAccountId">
                      <option value="">{{ t('autoUi.k_88a6f17b9a1d') }}</option>
                      <option v-for="item in activeAccounts" :key="item.id" :value="item.id">{{ item.name }} / {{ item.cloudPhoneName }}</option>
                    </select>
                  </label>
                  <label class="field">
                    <span>{{ t('autoUi.k_d7b1b6f1a6a7') }}</span>
                    <select v-model="publishForm.contentLanguage">
                      <option v-for="item in PUBLISH_LANGUAGE_OPTIONS" :key="item.value" :value="item.value">{{ item.label }}</option>
                    </select>
                  </label>
                  <label class="field field--full">
                    <span>{{ t('autoUi.k_d3c2609020fc') }}</span>
                    <textarea v-model="publishForm.videoDesc" rows="4" :placeholder="t('autoUi.k_da110e3d2cc6')"></textarea>
                  </label>
                </div>
              </section>

              <section v-if="activePublishStep === 'goods'" class="form-section workspace-card">
                <div class="workspace-card__head">
                  <div>
                    <strong>{{ t('autoUi.k_751c5853892e') }}</strong>
                    <p>{{ t('autoUi.k_c8e13b4cf69f') }}</p>
                  </div>
                </div>
                <div class="field-grid">
                  <label class="field">
                    <span>{{ t('autoUi.k_dffd0cb74c18') }}</span>
                    <input v-model="publishForm.productId" type="text" :placeholder="t('autoUi.k_cb6fc8edd673')" />
                  </label>
                  <label class="field">
                    <span>{{ t('autoUi.k_7cb2abcdb2fe') }}</span>
                    <input v-model="publishForm.productTitle" type="text" :placeholder="t('autoUi.k_5d32389a465a')" />
                  </label>
                </div>
              </section>

              <section v-if="activePublishStep === 'music'" class="form-section workspace-card">
                <div class="workspace-card__head">
                  <div>
                    <strong>{{ t('autoUi.k_f99830ac6219') }}</strong>
                    <p>{{ t('autoUi.k_3e23e3529066') }}</p>
                  </div>
                </div>
                <div class="field-grid">
                  <label class="field">
                    <span>{{ t('autoUi.k_4f562ba4d396') }}</span>
                    <select v-model="publishForm.musicMode">
                      <option value="volume_only">{{ t('autoUi.k_266fcbae3a07') }}</option>
                      <option value="library_ref">{{ t('autoUi.k_ee6d8a648daa') }}</option>
                      <option value="manual_ref">{{ t('autoUi.k_d41002fbce28') }}</option>
                    </select>
                  </label>
                  <label v-if="publishForm.musicMode === 'library_ref'" class="field">
                    <span>{{ t('autoUi.k_c6d3aa28f8c7') }}</span>
                    <select v-model="publishForm.musicPresetId" @change="onMusicPresetChange">
                      <option value="">{{ t('autoUi.k_b7fabc277ec5') }}</option>
                      <option v-for="item in musicPresets" :key="item.id" :value="item.id">{{ item.label }} / {{ item.refVideoId }}</option>
                    </select>
                  </label>
                  <label v-if="publishForm.musicMode !== 'volume_only'" class="field field--full">
                    <span>{{ t('autoUi.k_9932971b51b4') }}</span>
                    <input v-model="publishForm.refVideoId" type="text" :placeholder="t('autoUi.k_c968a13f3c79')" />
                  </label>
                  <label class="field">
                    <span>{{ t('autoUi.k_fb134163e07a') }}</span>
                    <input v-model.number="publishForm.sameVideoVolume" type="number" min="0" max="100" step="1" />
                  </label>
                  <label class="field">
                    <span>{{ t('autoUi.k_4a40016f6b0e') }}</span>
                    <input v-model.number="publishForm.sourceVideoVolume" type="number" min="0" max="100" step="1" />
                  </label>
                </div>
              </section>

              <section v-if="activePublishStep === 'options'" class="form-section workspace-card">
                <div class="workspace-card__head">
                  <div>
                    <strong>{{ t('autoUi.k_dc7f89c5e018') }}</strong>
                    <p>{{ t('autoUi.k_6c33094bcd3a') }}</p>
                  </div>
                </div>
                <div class="meta-row">
                  <label class="check-row">
                    <input v-model="publishForm.markAI" type="checkbox" />
                    <span>{{ t('autoUi.k_a6973340dd3d') }}</span>
                  </label>
                  <label class="check-row">
                    <input v-model="publishForm.needShareLink" type="checkbox" />
                    <span>{{ t('autoUi.k_a100f3f1b07e') }}</span>
                  </label>
                </div>
                <div class="hint-card"> {{ t('autoUi.k_60f1c166ff50') }} </div>
              </section>
            </div>

            <aside class="publish-sidebar">
              <section class="side-card quick-card">
                <div class="workspace-card__head">
                  <div>
                    <strong>{{ t('autoUi.k_309c0a9e6282') }}</strong>
                    <p>{{ t('autoUi.k_41723d5cfa5d') }}</p>
                  </div>
                </div>
                <button class="shortcut-button" type="button" :disabled="!selectedCandidate" @click="importFromTemplate">
                  <span class="shortcut-button__icon"><Package2 class="h-4 w-4" /></span>
                  <span class="shortcut-button__copy">
                    <strong>{{ t('autoUi.k_721aa05e33b1') }}</strong>
                    <small>{{ t('autoUi.k_ac6f9e6169ad') }}</small>
                  </span>
                  <ChevronRight class="h-4 w-4" />
                </button>
                <button class="shortcut-button" type="button" @click="savePublishDraft">
                  <span class="shortcut-button__icon"><Save class="h-4 w-4" /></span>
                  <span class="shortcut-button__copy">
                    <strong>{{ t('autoUi.k_7320d8885687') }}</strong>
                    <small>{{ t('autoUi.k_878590943b3f') }}</small>
                  </span>
                  <ChevronRight class="h-4 w-4" />
                </button>
              </section>

              <button class="primary-button primary-button--wide next-step-button" type="button" :disabled="publishing || !selectedCandidate" @click="goNextStep">
                {{ currentStepIndex < publishSteps.length - 1 ? t('autoUi.k_646598c361ae', { p0: publishSteps[currentStepIndex + 1].title }) : (publishing ? t('autoUi.k_3a1624e3e681') : t('autoUi.k_e9d29123e9e3')) }}
              </button>
            </aside>
          </div>
        </article>
      </section>

      <section class="bottom-layout">
        <article class="panel-card utility-panel">
          <div class="panel-head">
            <div>
              <h2>{{ t('autoUi.k_3f0fedc0b717') }}</h2>
              <p class="panel-subcopy">{{ t('autoUi.k_fd86b1a290b2') }}</p>
            </div>
            <Music4 class="h-5 w-5 panel-icon" />
          </div>

          <div class="field-grid">
            <label class="field">
              <span>{{ t('autoUi.k_34b3071ebd12') }}</span>
              <input v-model="musicPresetForm.label" type="text" :placeholder="t('autoUi.k_79969aa2f219')" />
            </label>
            <label class="field">
              <span>{{ t('autoUi.k_9932971b51b4') }}</span>
              <input v-model="musicPresetForm.refVideoId" type="text" :placeholder="t('autoUi.k_02c1fe03182e')" />
            </label>
            <label class="field field--full">
              <span>{{ t('autoUi.k_e0361480e3a5') }}</span>
              <input v-model="musicPresetForm.remark" type="text" :placeholder="t('autoUi.k_5a487d29f33d')" />
            </label>
          </div>

          <div class="inline-actions">
            <button class="primary-button" type="button" :disabled="savingMusicPreset || !musicPresetForm.label || !musicPresetForm.refVideoId" @click="saveMusicPreset">
              {{ editingMusicPresetId ? t('autoUi.k_2f511e66fbf9') : t('autoUi.k_b1cee46d8b79') }}
            </button>
            <button v-if="editingMusicPresetId" class="ghost-button" type="button" @click="resetMusicPresetForm">{{ t('autoUi.k_c698df948dd9') }}</button>
          </div>

          <div v-if="musicPresets.length" class="mini-list">
            <div v-for="item in musicPresets" :key="item.id" class="mini-item">
              <div>
                <strong>{{ item.label }}</strong>
                <p>{{ item.refVideoId }}</p>
                <small>{{ item.remark || t('autoUi.k_4823293f83bd') }}</small>
              </div>
              <div class="mini-item__actions">
                <button class="ghost-button" type="button" @click="editMusicPreset(item)">{{ t('autoUi.k_a7f814c0a40d') }}</button>
                <button class="danger-button" type="button" @click="removeMusicPreset(item.id)">{{ t('autoUi.k_3755f56f2f83') }}</button>
              </div>
            </div>
          </div>
          <div v-else class="empty-card">{{ t('autoUi.k_2ee61c8e2044') }}</div>
        </article>

        <article class="panel-card record-panel">
          <div class="panel-head">
            <div>
              <h2>{{ t('autoUi.k_f37ecd8ac3d6') }}</h2>
              <p class="panel-subcopy">{{ t('autoUi.k_862dcc21e281') }}</p>
            </div>
            <Wand2 class="h-5 w-5 panel-icon" />
          </div>

          <div v-if="!tasks.length" class="empty-inline">
            <Wrench class="h-5 w-5" />
            <span>{{ t('autoUi.k_240518e498a1') }}</span>
          </div>

          <div v-else class="task-list">
            <div v-for="item in tasks" :key="item.id" class="task-row">
              <div class="task-row__main">
                <strong>{{ item.cloudPhoneName || item.cloudPhoneId }}</strong>
                <p>{{ item.videoDesc || t('autoUi.k_4402f7ddf2bc') }}</p>
                <small>{{ shortPath(item.sourceVideoPath) }}</small>
                <small v-if="item.productId || item.refVideoId">{{ t('autoUi.k_d051be6685c1') }}{{ item.productId || '--' }} {{ t('autoUi.k_4c4b93b79f55') }}{{ item.refVideoId || '--' }}</small>
                <small v-if="taskFailHint(item)" class="status-fail">{{ taskFailHint(item) }}</small>
              </div>
              <div class="task-row__meta">
                <span class="status-pill">{{ taskStatusText(item.status) }}</span>
                <span v-if="item.failDesc" class="status-fail">{{ item.failDesc }}</span>
                <button class="ghost-button" type="button" :disabled="syncingTaskId === item.id" @click="syncTask(item.id)">
                  {{ syncingTaskId === item.id ? t('autoUi.k_ed1af5ec30c4') : t('autoUi.k_7cc7f07a2c03') }}
                </button>
              </div>
            </div>
          </div>
        </article>
      </section>
    </template>
    <section v-else class="loading-card">
      <ShieldCheck class="h-5 w-5" />
      <div>
        <strong>{{ t('geelarkPublishCenter.gate.title') }}</strong>
        <p>{{ t('geelarkPublishCenter.gate.desc') }}</p>
      </div>
      <button class="primary-button" type="button" @click="openSettings">{{ t('geelarkPublishCenter.gate.back') }}</button>
    </section>
  </div>
</template>

<style scoped>
.publish-center-page {
  --pc-border: rgba(148, 163, 184, 0.12);
  --pc-border-soft: rgba(148, 163, 184, 0.08);
  --pc-bg: linear-gradient(180deg, rgba(11, 18, 32, 0.98), rgba(9, 15, 28, 0.96));
  --pc-bg-soft: rgba(255, 255, 255, 0.025);
  --pc-bg-elevated: rgba(255, 255, 255, 0.035);
  --pc-text: #f8fbff;
  --pc-text-muted: rgba(203, 213, 225, 0.76);
  --pc-text-soft: rgba(148, 163, 184, 0.82);
  --pc-purple: #7757ff;
  --pc-purple-soft: rgba(119, 87, 255, 0.18);
  --pc-blue: #4d86ff;
  --pc-blue-soft: rgba(77, 134, 255, 0.18);
  --pc-green: #2fd28d;
  --pc-green-soft: rgba(47, 210, 141, 0.18);
  display: grid;
  gap: 18px;
  max-width: 1540px;
  margin: 0 auto;
  padding: 10px 12px 20px;
}

.hero-card,
.panel-card,
.loading-card {
  border: 1px solid var(--pc-border);
  border-radius: 18px;
  background: var(--pc-bg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 18px 44px rgba(0, 0, 0, 0.22);
}

.hero-card,
.panel-card,
.loading-card {
  padding: 18px 20px;
}

.hero-card,
.panel-head,
.hero-actions,
.inline-actions,
.mini-item__actions,
.task-row__meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hero-card,
.panel-head {
  justify-content: space-between;
}

.hero-main,
.hero-copy,
.panel-head__copy,
.workspace-card__head {
  display: grid;
  gap: 6px;
}

.hero-main {
  flex: 1;
}

.hero-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.hero-copy p,
.panel-subcopy,
.hero-refresh-meta,
.candidate-item__body p,
.task-row__main p,
.task-row__main small,
.mini-item p,
.mini-item small,
.empty-inline,
.empty-card,
.hint-card {
  color: var(--pc-text-soft);
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 1fr));
  gap: 14px;
}

.hero-stat {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 74px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--pc-border-soft);
  background: rgba(255, 255, 255, 0.02);
}

.hero-stat__icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  color: #fff;
}

.hero-stat--purple .hero-stat__icon {
  background: var(--pc-purple-soft);
  color: #cdbfff;
}

.hero-stat--blue .hero-stat__icon {
  background: var(--pc-blue-soft);
  color: #bad0ff;
}

.hero-stat--green .hero-stat__icon {
  background: var(--pc-green-soft);
  color: #b6f3d4;
}

.hero-stat strong {
  display: block;
  color: var(--pc-text);
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
}

.hero-stat small {
  color: var(--pc-text-soft);
  font-size: 12px;
}

.hero-actions {
  align-self: stretch;
  justify-content: flex-end;
  gap: 16px;
}

.hero-refresh-meta {
  font-size: 12px;
  white-space: nowrap;
}

.hero-refresh-button {
  min-width: 118px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  padding: 0;
  border: 0;
  background: transparent;
  color: #d7def0;
  font-size: 13px;
  font-weight: 700;
}

h1,
h2,
strong {
  margin: 0;
  color: var(--pc-text);
}

h1 {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.03em;
}

h2 {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

p,
small {
  margin: 0;
}

.workspace-layout,
.bottom-layout {
  display: grid;
  gap: 16px;
}

.workspace-layout {
  grid-template-columns: 400px minmax(0, 1fr);
  align-items: start;
}

.bottom-layout {
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  align-items: start;
}

.panel-card {
  display: grid;
  gap: 16px;
}

.candidate-panel {
  height: 648px;
  min-height: 0;
}

.candidate-panel__summary {
  display: flex;
  align-items: center;
  gap: 10px;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #f8fbff;
  font-size: 14px;
  font-weight: 800;
}

.summary-hint {
  color: #9bb7ff;
  font-size: 11px;
  font-weight: 700;
}

.candidate-list,
.mini-list,
.task-list,
.publish-form-stack {
  display: grid;
  gap: 12px;
}

.candidate-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
  align-content: start;
}

.candidate-item,
.mini-item,
.task-row,
.selected-preview,
.shortcut-button,
.hint-card,
.empty-card {
  border: 1px solid var(--pc-border-soft);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.02);
}

.candidate-item {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) 18px;
  gap: 14px;
  align-items: center;
  padding: 14px;
  text-align: left;
  color: inherit;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.candidate-item:hover {
  border-color: rgba(119, 87, 255, 0.34);
  background: rgba(255, 255, 255, 0.034);
}

.candidate-item.active {
  border-color: rgba(119, 87, 255, 0.72);
  box-shadow: 0 0 0 1px rgba(119, 87, 255, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.candidate-item__cover,
.selected-preview__cover {
  overflow: hidden;
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)),
    rgba(22, 31, 49, 0.98);
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.candidate-item__cover {
  width: 58px;
  height: 58px;
}

.candidate-item__cover img,
.selected-preview__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.candidate-item__cover-empty {
  color: rgba(203, 213, 225, 0.4);
}

.candidate-item__body,
.selected-preview__content,
.task-row__main,
.shortcut-button__copy {
  min-width: 0;
}

.candidate-item__body {
  display: grid;
  gap: 6px;
}

.candidate-item__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.candidate-item__state {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(47, 210, 141, 0.14);
  color: #67efaa;
  font-size: 11px;
  font-weight: 800;
}

.candidate-item__body strong {
  font-size: 14px;
  line-height: 1.4;
}

.candidate-item__body p {
  font-size: 12px;
}

.candidate-item__meta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(203, 213, 225, 0.5);
}

.candidate-pagination {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) 110px;
  gap: 12px;
  align-items: center;
}

.candidate-pagination__text {
  text-align: center;
  color: var(--pc-text-muted);
  font-size: 13px;
  font-weight: 700;
}

.candidate-pagination__button {
  min-height: 40px;
}

.publish-panel {
  position: relative;
}

.publish-steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--pc-border-soft);
  background: rgba(255, 255, 255, 0.02);
}

.publish-step {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 68px;
  padding: 0 16px;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--pc-text-soft);
}

.publish-step.active {
  background: linear-gradient(90deg, rgba(119, 87, 255, 0.34), rgba(119, 87, 255, 0.08));
  color: #fff;
}

.publish-step__index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #eef2ff;
  font-size: 12px;
  font-weight: 800;
}

.publish-step.done .publish-step__index,
.publish-step.active .publish-step__index {
  background: linear-gradient(135deg, #6f58ff, #8d6aff);
}

.publish-step__copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.publish-step__copy strong {
  font-size: 14px;
}

.publish-step__copy small {
  font-size: 11px;
  color: rgba(203, 213, 225, 0.64);
}

.publish-step__arrow {
  color: rgba(203, 213, 225, 0.34);
}

.selected-preview {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr) auto;
  gap: 16px;
  padding: 16px;
}

.selected-preview__cover--media {
  width: 78px;
  height: 78px;
}

.selected-preview__content {
  display: grid;
  gap: 10px;
  align-content: center;
}

.selected-preview__headline {
  display: flex;
  align-items: center;
  gap: 12px;
}

.selected-preview__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-weight: 800;
}

.selected-preview__headline strong {
  font-size: 16px;
}

.selected-preview__chips {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.selected-preview__chips span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(148, 163, 184, 0.1);
  color: #dce4f3;
  font-size: 12px;
  font-weight: 700;
}

.selected-preview__action {
  display: flex;
  align-items: center;
}

.publish-workbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}

.workspace-card,
.side-card {
  border-radius: 18px;
  border: 1px solid var(--pc-border-soft);
  background: rgba(255, 255, 255, 0.015);
}

.workspace-card__head strong {
  font-size: 16px;
}

.workspace-card__head p {
  color: var(--pc-text-soft);
  font-size: 12px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.form-section {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.field {
  display: grid;
  gap: 8px;
}

.field--full {
  grid-column: 1 / -1;
}

.field span {
  color: #dbe7f7;
  font-size: 13px;
  font-weight: 700;
}

.field input,
.field select,
.field textarea {
  min-height: 48px;
  padding: 12px 14px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 12px;
  background: rgba(7, 13, 24, 0.74);
  color: var(--pc-text);
  outline: none;
}

.field textarea {
  min-height: 120px;
  resize: vertical;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: rgba(119, 87, 255, 0.5);
  box-shadow: 0 0 0 3px rgba(119, 87, 255, 0.14);
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.check-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--pc-border-soft);
  background: rgba(255, 255, 255, 0.02);
  color: #e6eefb;
  font-size: 13px;
  font-weight: 700;
}

.publish-sidebar {
  display: grid;
  gap: 16px;
}

.quick-card {
  display: grid;
  gap: 12px;
  padding: 16px;
}

.shortcut-button {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-height: 74px;
  padding: 0 14px;
  text-align: left;
  color: #eff4ff;
}

.shortcut-button__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(119, 87, 255, 0.16);
  color: #c9bbff;
}

.shortcut-button__copy {
  display: grid;
  gap: 4px;
}

.shortcut-button__copy strong {
  font-size: 14px;
}

.shortcut-button__copy small {
  color: var(--pc-text-soft);
  font-size: 12px;
}

.primary-button,
.ghost-button,
.danger-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 800;
  transition: transform 0.18s ease, opacity 0.18s ease, border-color 0.18s ease;
}

.primary-button {
  border: 1px solid rgba(119, 87, 255, 0.4);
  background: linear-gradient(135deg, #6f58ff, #7f5dff);
  color: #fff;
  box-shadow: 0 16px 34px rgba(96, 69, 255, 0.24);
}

.primary-button--wide {
  width: 100%;
  min-height: 54px;
  border-radius: 14px;
  font-size: 18px;
}

.ghost-button {
  border: 1px solid var(--pc-border-soft);
  background: rgba(255, 255, 255, 0.02);
  color: #eef5ff;
}

.danger-button {
  border: 1px solid rgba(248, 113, 113, 0.22);
  background: rgba(239, 68, 68, 0.12);
  color: #ffd5d5;
}

.ai-button {
  min-width: 144px;
}

.primary-button:hover,
.ghost-button:hover,
.danger-button:hover {
  transform: translateY(-1px);
}

.primary-button:disabled,
.ghost-button:disabled,
.danger-button:disabled,
.shortcut-button:disabled {
  opacity: 0.56;
  cursor: not-allowed;
  transform: none;
}

.hint-card {
  padding: 14px 16px;
  font-size: 12px;
  line-height: 1.65;
}

.mini-item,
.task-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
}

.mini-item__actions {
  align-self: center;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(119, 87, 255, 0.26);
  background: rgba(119, 87, 255, 0.12);
  color: #e5deff;
  font-size: 11px;
  font-weight: 800;
}

.status-fail {
  color: #ffb4b4;
  font-size: 12px;
}

.panel-icon {
  color: rgba(205, 218, 236, 0.56);
}

.banner {
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 600;
}

.banner--success {
  border: 1px solid rgba(74, 222, 128, 0.18);
  background: rgba(34, 197, 94, 0.12);
  color: #ddffe7;
}

.banner--error {
  border: 1px solid rgba(248, 113, 113, 0.18);
  background: rgba(239, 68, 68, 0.12);
  color: #ffd8d8;
}

.loading-card,
.empty-inline,
.empty-card {
  display: flex;
  align-items: center;
  gap: 10px;
}

.empty-card {
  padding: 18px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1380px) {
  .workspace-layout,
  .bottom-layout,
  .publish-workbench {
    grid-template-columns: 1fr;
  }

  .candidate-panel {
    height: auto;
  }

  .candidate-list {
    max-height: 560px;
  }

  .hero-card,
  .hero-title-row {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 920px) {
  .hero-stats,
  .publish-steps,
  .field-grid {
    grid-template-columns: 1fr;
  }

  .selected-preview {
    grid-template-columns: 1fr;
  }

  .selected-preview__cover--media {
    width: 100%;
    height: 220px;
  }

  .selected-preview__action {
    justify-content: stretch;
  }

  .ai-button,
  .hero-refresh-button {
    width: 100%;
  }

  .candidate-pagination {
    grid-template-columns: 1fr;
  }
}
</style>

