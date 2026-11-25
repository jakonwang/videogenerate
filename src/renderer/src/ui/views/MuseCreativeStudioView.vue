<script setup lang="ts">
/** Muse 创意室. Layout and classes follow tk创意室 (TiktokCreativeStudioView.vue, design-system/creative-studio.css). */
import { m } from '../components/muse/museText'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  AlertTriangle, Captions, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, FileImage, LayoutGrid, Logs, ScanLine, SendHorizontal, FolderOpen, Grid2x2, ImagePlus, KeyRound, List,
  LoaderCircle, Package, Pause, Play, Plus, RefreshCcw, RotateCcw, ShieldCheck, Sparkles, Square, Trash2, X,
} from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { openAssetLibraryPicker } from '@/lib/assetLibraryPicker'
import SubtitleStudioDialog, { type SubtitleDialogSubmit } from '../components/subtitle/SubtitleStudioDialog.vue'
import StyleReferenceCard, { type StyleReference } from '../components/StyleReferenceCard.vue'
import MuseImageReviewDialog from '../components/muse/MuseImageReviewDialog.vue'
import MuseMaterialDialog from '../components/muse/MuseMaterialDialog.vue'
import MusePromptCard from '../components/muse/MusePromptCard.vue'
import MuseDetailDialog from '../components/muse/MuseDetailDialog.vue'
import MuseVideoDialog from '../components/muse/MuseVideoDialog.vue'
import ProductSelectDialog from '../components/ProductSelectDialog.vue'
import MuseAccountDialog from '../components/muse/MuseAccountDialog.vue'
import { museError, museJobState, museQuotaPaused } from '../components/muse/museLabels'
import type { MuseAccount, MuseJob, MuseQueue } from '../../../../main/modules/muse-creative-studio/types'

type Filter = 'all' | 'active' | 'image_review' | 'needs_review' | 'completed' | 'not_subtitled' | 'not_exported' | 'failed'
type Ask = { title: string; text: string; label: string; danger?: boolean; work: () => Promise<unknown> }

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'image_review', label: '待确认换图' },
  { key: 'needs_review', label: '待人工确认' },
  { key: 'completed', label: '完成' },
  { key: 'not_subtitled', label: '未加字幕' },
  { key: 'not_exported', label: '未导出' },
  { key: 'failed', label: '失败/取消' },
]
const PAGE_SIZE = 20
const MAX_IMAGES = 50
const MAX_DETAILS = 4
const RULES = [
  '换图后先由你确认，通过才发给 Muse',
  '每个账号同时只跑 1 条，走自己的代理',
  '提示词只发送一次，结果不明转人工确认，不自动重发',
  '额度不足时换下一个账号；代理断开时等待恢复',
  '重启后自动找回已发送的，未发送的要手动继续',
]

const api = window.api.museCreative
const route = useRoute()
const router = useRouter()
const activeTab = ref<'reference' | 'library'>('reference')
const accounts = ref<MuseAccount[]>([])
const encryptionAvailable = ref(true)
const remote = ref(false)
const queue = ref<MuseQueue>({ jobs: [], paused: false, concurrency: 2, settings: { imageRetryLimit: 0, autoLocate: true } })
const products = ref<any[]>([])
const loading = ref(false)
const working = ref(false)
const error = ref('')
const accountsOpen = ref(false)
const productOpen = ref(false)
const ask = ref<Ask | null>(null)
const notice = ref('')
const playingId = ref('')
const detailId = ref('')
const selectedIds = ref<string[]>([])
const subtitleIds = ref<string[]>([])
const subtitleBusy = ref(false)
const filter = ref<Filter>('all')
const view = ref<'grid' | 'list'>('grid')
const page = ref(1)
const styleReference = ref<StyleReference | null>(null)
const styleProductIds = ref<string[]>([])
const materialsOpen = ref(false)
const reviewId = ref('')
const settingsOpen = ref(false)
const publishedRefs = ref(new Set<string>())
const settingsForm = reactive({ imageRetryLimit: 0, autoLocate: true })
const form = reactive({ accountId: '', imagePaths: [] as string[], prompt: '', durationSec: 10, aspect: '9:16', productId: '', swapProduct: false, detailImagePaths: [] as string[], useProductImages: false, reviewImage: true, mode: 'reference' as 'reference' | 'first_last', zoomPercent: 20 })

const inFilter = (job: MuseJob, key: Filter) =>
  key === 'all' || job.status === key
  || (key === 'active' && ['running', 'queued', 'swapping'].includes(job.status))
  || (key === 'failed' && job.status === 'cancelled')
  || (key === 'not_subtitled' && job.status === 'completed' && !job.subtitleVideoPath)
  || (key === 'not_exported' && job.status === 'completed' && !job.exportedAt)
const count = (key: Filter) => queue.value.jobs.filter((job) => inFilter(job, key)).length
const filtered = computed(() => queue.value.jobs.filter((job) => inFilter(job, filter.value)))
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const runningCount = computed(() => queue.value.jobs.filter((job) => job.status === 'running' || job.status === 'swapping').length)
const waitingSwap = (job: MuseJob) => job.status === 'swapping' && !job.image?.submitting && !job.image?.waiting
const queuedToSend = computed(() => queue.value.jobs.filter((job) => (job.status === 'queued' && !job.collect) || waitingSwap(job)).length)
const ready = computed(() => accounts.value.filter((item) => item.enabled && item.state === 'ready'))
const withQuota = computed(() => ready.value.filter((item) => !museQuotaPaused(item)))
const jobById = (id: string) => queue.value.jobs.find((job) => job.id === id) || null
const playing = computed(() => jobById(playingId.value))
const selectedJobs = computed(() => queue.value.jobs.filter((job) => selectedIds.value.includes(job.id)))
const selectedDone = computed(() => selectedJobs.value.filter((job) => job.status === 'completed' && job.result))
const selectedSubtitled = computed(() => selectedDone.value.filter((job) => job.subtitleVideoPath))
const selectedRemovable = computed(() => selectedJobs.value.filter((job) => !['running', 'queued', 'swapping'].includes(job.status)))
const selectedApprovable = computed(() => selectedJobs.value.filter((job) => job.status === 'image_review' && job.preparedImagePath))
const reviewing = computed(() => { const job = jobById(reviewId.value); return job?.status === 'image_review' ? job : null })
const allSelected = computed(() => Boolean(filtered.value.length) && filtered.value.every((job) => selectedIds.value.includes(job.id)))
const subtitlePreview = computed(() => { const job = jobById(subtitleIds.value[0] || ''); return job?.posterPath || job?.imagePath || '' })
const selectedProduct = computed(() => products.value.find((item) => item.id === form.productId))
const createCount = computed(() => (styleReference.value ? styleProductIds.value.length : form.imagePaths.length))
const swaps = computed(() => Boolean(styleReference.value) || form.swapProduct)
const canCreate = computed(() => Boolean(createCount.value && (styleReference.value || (form.prompt.trim() && ((!form.swapProduct && !form.useProductImages) || form.productId)))) && !working.value)
const waitingReason = computed(() => {
  if (!queuedToSend.value) return ''
  if (queue.value.paused) return m('队列已暂停，点「继续队列」后才会发送。')
  if (!queue.value.jobs.some((job) => job.status === 'queued')) return ''
  if (!ready.value.length) return m('没有可用账号，任务在等待。')
  if (!withQuota.value.length) return m('可用账号额度都不足，任务在等待；在账号管理里点「检测」可立即重试。')
  return ''
})

watch(pages, (total) => { if (page.value > total) page.value = total })
watch(filter, () => { page.value = 1; selectedIds.value = [] })

const previewSrc = (path?: string, width?: number) => (path ? `vg://file?path=${encodeURIComponent(path)}${width ? `&w=${width}` : ''}` : '')
const fileName = (path: string) => path.split(/[\\/]/).pop() || path
const accountName = (id: string) => accounts.value.find((item) => item.id === id)?.name || ''
const jobTitle = (job: MuseJob) => job.productName || job.prompt
const time = (value: number) => new Date(value).toLocaleString()
const seconds = (from?: number, to?: number) => (from && to ? m('{0} 秒', Math.round((to - from) / 1000)) : '')
const timing = (job: MuseJob) => [
  [m('拿到对话'), seconds(job.timeline?.sentAt, job.timeline?.threadAt)],
  [m('出现视频'), seconds(job.timeline?.sentAt, job.timeline?.videoAt)],
].filter(([, value]) => value).map(([label, value]) => `${label} ${value}`).join(' · ')

async function refreshAccounts() {
  const result = await api.listAccounts()
  accounts.value = result.accounts
  encryptionAvailable.value = result.encryptionAvailable
  remote.value = Boolean(result.remote)
}

let lastRunning = 0
async function refreshQueue() {
  queue.value = await api.listJobs()
  if (runningCount.value !== lastRunning) await refreshAccounts()
  lastRunning = runningCount.value
}

async function refresh() {
  loading.value = true
  try {
    await Promise.all([refreshAccounts(), refreshQueue()])
  } catch (e) {
    error.value = museError(e)
  } finally {
    loading.value = false
  }
}

async function refreshPublished() {
  const tasks: any[] = await window.api.tiktokPublisher.listTasks().catch(() => [])
  publishedRefs.value = new Set(tasks.filter((task) => task.state === 'published' && task.sourceRef).map((task) => String(task.sourceRef)))
}
const isPublished = (job: MuseJob) => publishedRefs.value.has(`muse:${job.id}`)

const publish = (jobs: MuseJob[]) => act(async () => {
  const drafts: any[] = []
  for (const job of jobs) {
    drafts.push(...await window.api.tiktokPublisher.createDraftsFromPaths({
      paths: [job.subtitleVideoPath || job.result!.videoPath],
      defaults: { sourceRef: `muse:${job.id}`, posterPath: job.subtitleCoverPath || job.posterPath },
    }))
  }
  await router.push({ path: '/publish', query: { select: drafts.map((item) => item.id).join(',') } })
})

/** `?job=` from the content hub: show that job in the library. */
function showLinkedJob() {
  const id = String(route.query.job || '')
  if (!id || !jobById(id)) return
  showLibrary('all')
  detailId.value = id
  void router.replace({ path: route.path })
}

const accountsChanged = () => refreshAccounts().catch((e) => { error.value = museError(e) })

async function act(work: () => Promise<unknown>) {
  if (working.value) return
  working.value = true
  error.value = ''
  notice.value = ''
  try {
    await work()
    await refreshQueue()
  } catch (e) {
    error.value = museError(e)
  } finally {
    working.value = false
  }
}

async function confirmed() {
  const current = ask.value
  ask.value = null
  if (current) await act(current.work)
}

function addImages(paths: string[]) {
  form.imagePaths = Array.from(new Set([...form.imagePaths, ...paths])).slice(0, MAX_IMAGES)
}

async function pickImages() {
  addImages(await window.api.pickFiles({ title: m('选择参考图'), filters: [{ name: m('图片'), extensions: ['jpg', 'jpeg', 'png', 'webp'] }], multiple: true }) || [])
}

async function pickDetails() {
  const paths = await window.api.pickFiles({ title: m('选择商品细节图'), filters: [{ name: m('图片'), extensions: ['jpg', 'jpeg', 'png', 'webp'] }], multiple: true }) || []
  const all = Array.from(new Set([...form.detailImagePaths, ...paths]))
  form.detailImagePaths = all.slice(0, MAX_DETAILS)
  notice.value = all.length > MAX_DETAILS ? m('商品细节图最多 {0} 张', MAX_DETAILS) : ''
}

async function pickFromLibrary() {
  const selected = await openAssetLibraryPicker({ type: 'image', multiple: true })
  if (selected?.length) addImages(selected.map((item) => item.filePath))
}

async function openProducts() {
  try {
    const rows = await window.api.products.list()
    products.value = Array.isArray(rows) ? rows : []
    productOpen.value = true
  } catch (e) {
    error.value = museError(e)
  }
}

function pickProduct(id: string) {
  form.productId = id
  productOpen.value = false
}

function pickStyleProducts(ids: string[]) {
  styleProductIds.value = ids
  productOpen.value = false
}

function openSettings() {
  Object.assign(settingsForm, queue.value.settings)
  settingsOpen.value = true
}

const saveSettings = () => act(async () => {
  await api.saveSettings({ ...settingsForm })
  settingsOpen.value = false
})

const approve = (jobs: MuseJob[]) => {
  ask.value = {
    title: m('通过 {0} 张换图', jobs.length),
    text: m('通过后会发给 Muse 生成 {0} 条视频，消耗 Muse 额度。{1}', jobs.length, queue.value.paused ? m('队列已暂停，要点「继续队列」才开始。') : ''),
    label: m('确定生成'),
    work: async () => {
      await api.approveImages(jobs.map((job) => job.id))
      reviewId.value = ''
      selectedIds.value = []
    },
  }
}

const redoImage = (region: { x: number; y: number; width: number; height: number } | undefined, closing: boolean) => act(async () => {
  await api.redoImage({ id: reviewId.value, region, closing })
  reviewId.value = ''
})

function showLibrary(key: Filter) {
  filter.value = key
  activeTab.value = 'library'
}

function askCreate() {
  const total = createCount.value
  const what = styleReference.value ? m('每个商品生成 1 条同款，共 {0} 条。', total) : m('每张参考图生成 1 条，共 {0} 条。', total)
  const cost = swaps.value
    ? m('会先换图 {0} 次，产生图片模型费用；{1}', styleReference.value && form.mode === 'first_last' ? total * 2 : total, form.reviewImage ? m('你确认换图后才发给 Muse。') : m('换图后直接发给 Muse，消耗 {0} 次额度。', total))
    : m('会发送 {0} 次并消耗 Muse 额度。', total)
  ask.value = {
    title: m('加入 {0} 条任务', total),
    text: `${what}${cost}${queue.value.paused ? m('队列已暂停，加入后要点「继续队列」才开始。') : ''}`,
    label: m('确定加入 {0} 条', total),
    work: async () => {
      await api.createJobs({ ...form, imagePaths: [...form.imagePaths], detailImagePaths: [...form.detailImagePaths], styleReferenceId: styleReference.value?.id, productIds: [...styleProductIds.value] })
      form.imagePaths = []
      form.detailImagePaths = []
      styleProductIds.value = []
      showLibrary('all')
    },
  }
}

function askResume() {
  ask.value = { title: m('继续队列'), text: m('会处理等待中的 {0} 条，消耗 Muse 额度；需要换图的会先产生图片费用。', queuedToSend.value), label: m('继续'), work: () => api.setQueuePaused(false) }
}

function askRetry(job: MuseJob) {
  ask.value = { title: m('重试任务'), text: job.image && !job.preparedImagePath ? m('会重新换图，产生图片模型费用。') : m('会重新发送 1 次，消耗 Muse 额度。'), label: m('确定重试'), work: () => api.retryJob(job.id) }
}

function askDismiss(job: MuseJob) {
  ask.value = { title: m('确认没有结果'), text: m('请先到 Muse 网页确认没有结果。标记后任务变成失败，可以重试。'), label: m('确认没有结果'), work: () => api.dismissJob(job.id) }
}

function askRemove(jobs: MuseJob[]) {
  const videos = jobs.filter((job) => job.result).length
  const what = jobs.length === 1 ? `「${jobTitle(jobs[0]).slice(0, 24)}」` : m('{0} 条任务', jobs.length)
  ask.value = {
    title: m('删除任务'),
    text: m('删除{0}{1}，不能恢复。已导出的文件会保留。', what, videos ? m('，包括 {0} 个视频文件和字幕版', videos) : ''),
    label: m('删除'),
    danger: true,
    work: async () => {
      const ids = jobs.map((job) => job.id)
      await api.removeJobs(ids)
      if (ids.includes(playingId.value)) playingId.value = ''
      selectedIds.value = selectedIds.value.filter((id) => !ids.includes(id))
    },
  }
}

function toggleSelected(id: string) {
  selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter((item) => item !== id) : [...selectedIds.value, id]
}

function toggleAll() {
  selectedIds.value = allSelected.value ? [] : filtered.value.map((job) => job.id)
}

function openSubtitles(jobs: MuseJob[]) {
  playingId.value = ''
  subtitleIds.value = jobs.map((job) => job.id)
}

async function submitSubtitles(payload: SubtitleDialogSubmit) {
  subtitleBusy.value = true
  await act(async () => {
    const style = { ...payload.captionStyle }
    const result = await api.addSubtitles({
      ids: [...subtitleIds.value],
      titleConfig: { ...payload.titleConfig, titlePool: [...payload.titleConfig.titlePool] },
      captionStyle: style,
      layoutPolicy: { maxLines: style.maxLines, maxWidthRatio: style.maxWidthRatio, reflowStrategy: 'balanced', avoidPosition: 'auto' },
    })
    notice.value = m('已给 {0} 条视频添加字幕{1}', result.done, result.failed ? m('，{0} 条失败', result.failed) : '')
    selectedIds.value = []
  })
  subtitleBusy.value = false
  subtitleIds.value = []
}

const revertSubtitles = (jobs: MuseJob[]) => act(async () => {
  const { done } = await api.revertSubtitles(jobs.map((job) => job.id))
  notice.value = m('已撤销 {0} 条字幕', done)
})

async function exportVideos(jobs: MuseJob[]) {
  const outputDir = await window.api.pickDir({ title: m('选择导出文件夹') })
  if (!outputDir) return
  await act(async () => {
    const { done } = await api.exportJobs({ ids: jobs.map((job) => job.id), outputDir })
    notice.value = m('已导出 {0} 条视频', done)
    selectedIds.value = []
  })
}

const play = (job: MuseJob) => { if (job.result) playingId.value = job.id }
const reveal = (job: MuseJob) => job.result && window.api.shell.showItemInFolder(job.subtitleVideoPath || job.result.videoPath)
const cover = (job: MuseJob) => job.subtitleCoverPath || job.posterPath || job.preparedImagePath || job.imagePath

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void refresh().then(showLinkedJob)
  void refreshPublished()
  timer = setInterval(() => void refreshQueue().catch(() => undefined), 2000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="tiktok-page plugin-workspace-standard ts-page" data-testid="muse-page">
    <section class="vg-scope ts-top">
      <header class="ts-head">
        <div class="ts-head__icon"><Sparkles :size="22" /></div>
        <div class="ts-head__text">
          <h1>{{ m('Muse创意室') }}</h1>
          <p>{{ m('用参考图批量生成短视频，每个 Muse 账号走自己的美国代理。') }}</p>
        </div>
        <div class="ts-head__actions">
          <button class="ts-util" type="button" data-testid="muse-open-accounts" @click="accountsOpen = true"><KeyRound :size="14" />{{ m('账号管理') }}<em>{{ accounts.length }}</em></button>
          <button class="ts-util" type="button" data-testid="muse-settings" @click="openSettings"><ShieldCheck :size="14" />{{ m('换图设置') }}<em>{{ queue.settings.imageRetryLimit }}</em></button>
          <button v-if="queue.paused" class="ts-util" type="button" data-testid="muse-resume" @click="askResume"><Play :size="14" />{{ m('继续队列') }}<em>{{ queuedToSend }}</em></button>
          <button v-else class="ts-util" type="button" :title="m('不再发送新的，已在运行的会跑完')" data-testid="muse-pause" @click="act(() => api.setQueuePaused(true))"><Pause :size="14" />{{ m('暂停队列') }}<em>{{ queuedToSend }}</em></button>
          <button class="ts-util ts-util--icon" type="button" :title="m('刷新')" :aria-label="m('刷新')" :disabled="loading" @click="refresh"><RefreshCcw :size="14" :class="{ 'vg-spin': loading }" /></button>
        </div>
      </header>
      <nav class="ts-tabs" :aria-label="m('Muse创意室')">
        <button class="ts-tab" :class="{ 'is-active': activeTab === 'reference' }" type="button" @click="activeTab = 'reference'"><ImagePlus :size="15" />{{ m('从参考图创建') }}</button>
        <button class="ts-tab" :class="{ 'is-active': activeTab === 'library' }" type="button" data-testid="muse-tab-library" @click="activeTab = 'library'"><FolderOpen :size="15" />{{ m('任务与成片') }}<em>{{ count('completed') }}</em></button>
      </nav>
    </section>

    <div v-if="error || notice || waitingReason" class="vg-scope mu-notices">
      <p v-if="error" class="vg-notice vg-notice--danger" role="alert">{{ m(error) }}</p>
      <p v-if="notice" class="vg-notice vg-notice--accent" data-testid="muse-notice">{{ notice }}</p>
      <p v-if="waitingReason" class="vg-notice vg-notice--warning" data-testid="muse-waiting">{{ waitingReason }}</p>
    </div>

    <section v-if="activeTab === 'reference'" class="vg-scope ts-create">
      <div class="ts-main">
        <StyleReferenceCard v-model="styleReference" :uses-last-frame="form.mode === 'first_last'" />

        <article v-if="!styleReference" class="ts-card ts-block">
          <header class="ts-block__head">
            <div class="ts-block__title">
              <h2>{{ m('参考图片') }}<em v-if="form.imagePaths.length">{{ form.imagePaths.length }}</em></h2>
              <p>{{ m('支持 JPG、PNG、WEBP，可多选，最多') }} {{ MAX_IMAGES }} {{ m('张，每张生成 1 条视频') }}</p>
            </div>
            <div class="ts-block__tools">
              <button class="vg-btn vg-btn--sm" type="button" data-testid="muse-pick" @click="pickImages"><ImagePlus :size="14" />{{ m('上传参考图') }}</button>
              <button class="vg-btn vg-btn--sm" type="button" @click="pickFromLibrary"><FolderOpen :size="14" />{{ m('从素材库选图') }}</button>
              <button class="vg-btn vg-btn--sm" type="button" data-testid="muse-open-materials" @click="materialsOpen = true"><LayoutGrid :size="14" />{{ m('从衍生图选图') }}</button>
            </div>
          </header>
          <div v-if="form.imagePaths.length" class="ts-refs">
            <figure v-for="path in form.imagePaths" :key="path" class="ts-ref" :title="path">
              <img :src="previewSrc(path, 240)" :alt="m('参考图')" loading="lazy" />
              <figcaption>{{ fileName(path) }}</figcaption>
              <button type="button" class="ts-ref__remove" :title="m('移除')" :aria-label="m('移除')" @click="form.imagePaths = form.imagePaths.filter((item) => item !== path)"><X :size="12" /></button>
            </figure>
            <button type="button" class="ts-ref ts-ref--add" @click="pickImages"><span><Plus :size="20" /></span><small>{{ m('上传参考图') }}</small></button>
          </div>
          <button v-else class="ts-dropzone" type="button" @click="pickImages">
            <span class="ts-dropzone__icon"><ImagePlus :size="22" /></span>
            <span class="ts-dropzone__copy"><strong>{{ m('上传参考图') }}</strong><small>{{ m('支持 JPG、PNG、WEBP，可多选 · 也可以从素材库选择') }}</small></span>
          </button>
          <footer v-if="form.imagePaths.length" class="ts-block__foot">
            <span>{{ form.imagePaths.length }} {{ m('张参考图') }}</span>
            <button type="button" class="ts-link" @click="form.imagePaths = []"><Trash2 :size="12" />{{ m('清空') }}</button>
          </footer>
        </article>

        <article class="ts-card ts-block">
          <header class="ts-block__head"><div class="ts-block__title"><h2>{{ m('生成设置') }}</h2><p>{{ m('批量创建 Muse 图生视频任务') }}</p></div></header>
          <div class="ts-form">
            <div class="ts-form__row">
              <span class="ts-form__label">{{ m('生成模式') }}</span>
              <div class="ts-form__control">
                <div class="ts-seg" role="group" :aria-label="m('生成模式')"><button type="button" :class="{ 'is-on': form.mode === 'reference' }" @click="form.mode = 'reference'">{{ m('参考图生视频') }}</button><button type="button" :class="{ 'is-on': form.mode === 'first_last' }" data-testid="muse-first-last" @click="form.mode = 'first_last'">{{ m('首尾帧') }}</button></div>
                <div v-if="form.mode === 'first_last' && !styleReference" class="ts-seg" role="group" :aria-label="m('推近比例')"><button v-for="n in [10, 20, 30, 40, 50]" :key="n" type="button" :class="{ 'is-on': form.zoomPercent === n }" @click="form.zoomPercent = n">{{ n }}%</button></div>
                <small v-if="form.mode === 'first_last' && styleReference" class="ts-form__hint">{{ m('参考视频的首帧和尾帧都会换上商品，每条换图 2 次；尾帧失败时用首帧放大') }}</small>
                <small v-else-if="form.mode === 'first_last'" class="ts-form__hint">{{ m('自动把首帧放大作为尾帧，一起发给 Muse；Muse 不一定严格遵守') }}</small>
              </div>
            </div>
            <div v-if="!styleReference" class="ts-form__row">
              <span class="ts-form__label">{{ m('视频时长') }}</span>
              <div class="ts-form__control"><div class="ts-seg" role="group" :aria-label="m('视频时长')"><button v-for="n in [5, 6, 8, 10]" :key="n" type="button" :class="{ 'is-on': form.durationSec === n }" @click="form.durationSec = n">{{ n }} {{ m('秒') }}</button></div></div>
            </div>
            <div v-if="!styleReference" class="ts-form__row">
              <span class="ts-form__label">{{ m('画面比例') }}</span>
              <div class="ts-form__control">
                <div class="ts-seg" role="group" :aria-label="m('画面比例')"><button v-for="a in ['9:16', '16:9', '1:1']" :key="a" type="button" :class="{ 'is-on': form.aspect === a }" @click="form.aspect = a">{{ a }}</button></div>
                <small class="ts-form__hint">{{ m('时长和比例写在提示词里，以 Muse 实际输出为准') }}</small>
              </div>
            </div>
            <div class="ts-form__row">
              <span class="ts-form__label">{{ m('商品') }}</span>
              <div class="ts-form__control">
                <button class="ts-product" type="button" @click="openProducts">
                  <span class="ts-product__thumb"><img v-if="selectedProduct?.coverImagePath" :src="previewSrc(selectedProduct.coverImagePath, 80)" alt="" /><Package v-else :size="16" /></span>
                  <span v-if="styleReference" class="ts-product__name" :class="{ 'is-empty': !styleProductIds.length }">{{ styleProductIds.length ? m('已选 {0} 个商品', styleProductIds.length) : m('选择商品（可多选）') }}</span>
                  <span v-else class="ts-product__name" :class="{ 'is-empty': !selectedProduct }">{{ selectedProduct?.name || (form.swapProduct ? m('选择要换上的商品') : m('选择商品（可选）')) }}</span>
                  <ChevronDown :size="15" />
                </button>
                <small v-if="styleReference" class="ts-form__hint">{{ m('每个商品生成 1 条同款视频，参考画面里的商品会换成它') }}</small>
                <small v-else class="ts-form__hint">{{ form.swapProduct ? m('参考图里的商品会换成它') : form.useProductImages ? m('用于归类成片和提供细节图') : m('只用于归类成片') }} <button v-if="form.productId" type="button" class="ts-link" @click="form.productId = ''">{{ m('清除') }}</button></small>
              </div>
            </div>
            <div v-if="!styleReference" class="ts-form__row">
              <span class="ts-form__label">{{ m('商品换图') }}</span>
              <div class="ts-form__control">
                <div class="ts-seg" role="group" :aria-label="m('商品换图')"><button type="button" :class="{ 'is-on': !form.swapProduct }" @click="form.swapProduct = false">{{ m('不换图') }}</button><button type="button" :class="{ 'is-on': form.swapProduct }" data-testid="muse-swap" @click="form.swapProduct = true">{{ m('换成所选商品') }}</button></div>
                <small class="ts-form__hint">{{ m('参考图里已经是你的商品就不用换图；换图会调用图片模型并产生费用') }}</small>
              </div>
            </div>
            <div class="ts-form__row" data-testid="muse-details">
              <span class="ts-form__label">{{ m('商品细节图') }}</span>
              <div class="ts-form__control">
                <div class="ts-seg" role="group" :aria-label="m('商品细节图')"><button type="button" :class="{ 'is-on': !form.useProductImages }" :aria-pressed="!form.useProductImages" @click="form.useProductImages = false">{{ m('不用商品库图片') }}</button><button type="button" :class="{ 'is-on': form.useProductImages }" :aria-pressed="form.useProductImages" data-testid="muse-use-product-images" @click="form.useProductImages = true">{{ m('用商品库图片') }}</button></div>
                <div v-if="!styleReference" class="ts-refs mu-details">
                  <figure v-for="path in form.detailImagePaths" :key="path" class="ts-ref" :title="path">
                    <img :src="previewSrc(path, 160)" :alt="m('商品细节图')" loading="lazy" />
                    <button type="button" class="ts-ref__remove" :title="m('移除')" :aria-label="m('移除')" @click="form.detailImagePaths = form.detailImagePaths.filter((item) => item !== path)"><X :size="12" /></button>
                  </figure>
                  <button v-if="form.detailImagePaths.length < MAX_DETAILS" type="button" class="ts-ref ts-ref--add" data-testid="muse-pick-details" @click="pickDetails"><span><Plus :size="18" /></span><small>{{ m('上传细节图') }}</small></button>
                </div>
                <small v-if="form.useProductImages && !styleReference && !form.productId" class="ts-form__hint">{{ m('请先在上面选择商品') }}</small>
                <small v-else class="ts-form__hint">{{ styleReference ? m('可选。每个商品的视频各带自己的商品库图片，最多 4 张') : m('可选。仍是每张参考图生成 1 条；这批每条都会带上这些图（最多 4 张），请只放同一个商品') }}</small>
              </div>
            </div>
            <div v-if="swaps" class="ts-form__row">
              <span class="ts-form__label">{{ m('换图确认') }}</span>
              <div class="ts-form__control">
                <div class="ts-seg" role="group" :aria-label="m('换图确认')"><button type="button" :class="{ 'is-on': form.reviewImage }" @click="form.reviewImage = true">{{ m('我确认后再生成') }}</button><button type="button" :class="{ 'is-on': !form.reviewImage }" @click="form.reviewImage = false">{{ m('直接生成') }}</button></div>
                <small class="ts-form__hint">{{ m('建议先确认，避免商品不准时浪费 Muse 额度') }}</small>
              </div>
            </div>
            <div class="ts-form__row">
              <span class="ts-form__label">{{ m('账号') }}</span>
              <div class="ts-form__control">
                <select v-model="form.accountId" class="vg-input vg-select mu-select" :aria-label="m('账号')">
                  <option value="">{{ m('自动分配') }}</option>
                  <option v-for="item in accounts" :key="item.id" :value="item.id">{{ item.name }}</option>
                </select>
              </div>
            </div>
          </div>
        </article>

        <div class="ts-actionbar">
          <div class="ts-actionbar__summary">
            <template v-if="styleReference">
              <span class="is-ok"><Check :size="13" />{{ m('同款参考视频') }}</span>
              <span :class="{ 'is-ok': styleProductIds.length }"><Check v-if="styleProductIds.length" :size="13" /><i v-else />{{ m('商品') }} {{ styleProductIds.length }}</span>
            </template>
            <template v-else>
              <span :class="{ 'is-ok': form.imagePaths.length }"><Check v-if="form.imagePaths.length" :size="13" /><i v-else />{{ m('参考图片') }} {{ form.imagePaths.length }}</span>
              <span v-if="form.swapProduct || form.useProductImages" :class="{ 'is-ok': form.productId }"><Check v-if="form.productId" :size="13" /><i v-else />{{ m('商品') }}</span>
              <span :class="{ 'is-ok': form.prompt.trim() }"><Check v-if="form.prompt.trim()" :size="13" /><i v-else />{{ m('提示词') }}</span>
            </template>
            <span :class="{ 'is-ok': withQuota.length }"><Check v-if="withQuota.length" :size="13" /><i v-else />{{ m('可用账号') }} {{ withQuota.length }}</span>
            <small><ShieldCheck :size="13" />{{ m('每条只发送一次，加入前会再确认') }}</small>
          </div>
          <button class="vg-btn vg-btn--primary vg-btn--lg ts-create-btn" type="button" :disabled="!canCreate" data-testid="muse-start" @click="askCreate">
            <LoaderCircle v-if="working" :size="16" class="vg-spin" /><Sparkles v-else :size="16" />{{ m('创建任务 (') }}{{ createCount }})
          </button>
        </div>
      </div>

      <aside class="ts-side">
        <section class="ts-card ts-block ts-block--compact">
          <header class="ts-block__head">
            <div class="ts-block__title"><h2>{{ m('账号调度') }}</h2><p>{{ m('按可用账号自动分配') }}</p></div>
            <button class="vg-btn vg-btn--sm" type="button" @click="accountsOpen = true"><KeyRound :size="13" />{{ m('账号管理') }}</button>
          </header>
          <div class="ts-stats">
            <div><strong>{{ ready.length }}<small>/{{ accounts.length }}</small></strong><span>{{ m('可用账号') }}</span></div>
            <button type="button" @click="showLibrary('active')"><strong :class="{ 'is-live': runningCount > 0 }">{{ runningCount }}</strong><span>{{ m('处理中') }}</span></button>
            <button type="button" @click="showLibrary('needs_review')"><strong>{{ count('needs_review') }}</strong><span>{{ m('待人工确认') }}</span></button>
          </div>
          <div class="mu-concurrency">
            <span>{{ m('同时运行') }}</span>
            <div class="ts-seg" role="group" :aria-label="m('同时运行')"><button v-for="n in [1, 2]" :key="n" type="button" :class="{ 'is-on': queue.concurrency === n }" @click="act(() => api.setQueueConcurrency(n))">{{ n }} {{ m('条') }}</button></div>
          </div>
          <details class="ts-rules">
            <summary>{{ m('执行规则') }}<ChevronDown :size="14" /></summary>
            <ul><li v-for="rule in RULES" :key="rule"><Check :size="13" />{{ m(rule) }}</li></ul>
          </details>
        </section>

        <MusePromptCard v-model="form.prompt" :style-active="Boolean(styleReference)" />
      </aside>
    </section>

    <section v-else class="vg-scope ts-library" data-testid="muse-library">
      <div class="ts-card ts-card--flush">
        <header class="ts-toolbar">
          <label class="ts-check ts-toolbar__all"><input type="checkbox" :checked="allSelected" :disabled="!filtered.length" :aria-label="m('全选')" :title="m('全选')" data-testid="muse-select-all" @change="toggleAll" /></label>
          <nav class="ts-filters" :aria-label="m('任务筛选')">
            <button v-for="item in FILTERS" :key="item.key" type="button" class="ts-filter" :class="{ 'is-active': filter === item.key }" :aria-pressed="filter === item.key" @click="filter = item.key">{{ m(item.label) }}<em>{{ count(item.key) }}</em></button>
          </nav>
          <button class="vg-btn vg-btn--sm" type="button" :disabled="!queuedToSend" @click="act(() => api.cancelQueuedJobs())">{{ m('取消排队') }} {{ queuedToSend }}</button>
          <div class="ts-viewtoggle" role="group">
            <button type="button" :class="{ 'is-on': view === 'grid' }" :aria-label="m('网格')" :aria-pressed="view === 'grid'" @click="view = 'grid'"><Grid2x2 :size="14" /></button>
            <button type="button" :class="{ 'is-on': view === 'list' }" :aria-label="m('列表')" :aria-pressed="view === 'list'" @click="view = 'list'"><List :size="14" /></button>
          </div>
        </header>

        <div v-if="selectedJobs.length" class="ts-actionsbar" data-testid="muse-selection">
          <span>{{ m('已选') }} <b class="vg-num">{{ selectedJobs.length }}</b> / {{ filtered.length }}</span>
          <span class="ts-actionsbar__spacer" />
          <button v-if="selectedApprovable.length" class="vg-btn vg-btn--sm" type="button" :disabled="working" @click="approve(selectedApprovable)"><Check :size="13" />{{ m('通过换图 (') }}{{ selectedApprovable.length }})</button>
          <button class="vg-btn vg-btn--sm" type="button" :disabled="working || !selectedSubtitled.length" @click="revertSubtitles(selectedSubtitled)"><Captions :size="13" />{{ m('撤销字幕 (') }}{{ selectedSubtitled.length }})</button>
          <button class="vg-btn vg-btn--sm" type="button" :disabled="working || !selectedDone.length" data-testid="muse-batch-subtitle" @click="openSubtitles(selectedDone)"><Captions :size="13" />{{ m('批量添加字幕 (') }}{{ selectedDone.length }})</button>
          <button class="vg-btn vg-btn--sm vg-btn--danger" type="button" :disabled="working || !selectedRemovable.length" @click="askRemove(selectedRemovable)"><Trash2 :size="13" />{{ m('批量删除 (') }}{{ selectedRemovable.length }})</button>
          <button class="vg-btn vg-btn--sm" type="button" :disabled="working || !selectedDone.length" data-testid="muse-publish" @click="publish(selectedDone)"><SendHorizontal :size="13" />{{ m('去发布 (') }}{{ selectedDone.length }})</button>
          <button class="vg-btn vg-btn--sm vg-btn--primary" type="button" :disabled="working || !selectedDone.length" @click="exportVideos(selectedDone)"><Download :size="13" />{{ m('导出 (') }}{{ selectedDone.length }})</button>
        </div>

        <div v-if="!paged.length" class="ts-empty">
          <span class="ts-empty__icon"><FileImage :size="26" /></span>
          <strong>{{ m('还没有任务') }}</strong>
          <p>{{ m('上传参考图并创建任务后，进度和成片会显示在这里。') }}</p>
          <button class="vg-btn vg-btn--primary" type="button" @click="activeTab = 'reference'"><Sparkles :size="15" />{{ m('从参考图创建') }}</button>
        </div>

        <div v-else :class="view === 'grid' ? 'ts-grid' : 'ts-list'">
          <article v-for="job in paged" :key="job.id" :class="[view === 'grid' ? 'ts-item' : 'ts-row mu-row', { 'is-selected': selectedIds.includes(job.id) }]" data-testid="muse-job">
            <label v-if="view === 'list'" class="ts-check"><input type="checkbox" :checked="selectedIds.includes(job.id)" :aria-label="m('选择')" @change="toggleSelected(job.id)" /></label>
            <div :class="{ 'ts-item__media': view === 'grid' }">
              <button :class="view === 'grid' ? 'ts-item__preview' : 'ts-row__thumb'" type="button" :disabled="!job.result" :aria-label="job.result ? m('播放') : m('参考图')" @click="play(job)">
                <img :src="previewSrc(cover(job), view === 'grid' ? 480 : 160)" alt="" loading="lazy" decoding="async" />
                <span v-if="view === 'grid' && job.result" class="ts-item__play"><Play :size="16" /></span>
              </button>
              <label v-if="view === 'grid'" class="ts-check ts-item__check"><input type="checkbox" :checked="selectedIds.includes(job.id)" :aria-label="m('选择')" @change="toggleSelected(job.id)" /></label>
              <span v-if="view === 'grid'" class="ts-state ts-item__state" :class="museJobState(job).tone"><i />{{ museJobState(job).label }}</span>
            </div>
            <div class="ts-item__body">
              <div class="ts-item__title"><strong :title="job.prompt">{{ jobTitle(job) }}</strong></div>
              <div class="ts-item__marks">
                <span v-if="view === 'list'" class="ts-state" :class="museJobState(job).tone"><i />{{ museJobState(job).label }}</span>
                <span v-if="job.zoomPercent" class="ts-mark">{{ m('首尾帧') }}{{ job.preparedLastFramePath ? '' : ` ${job.zoomPercent}%` }}</span>
                <span v-if="job.detailImagePaths?.length" class="ts-mark">{{ m('细节图 {0} 张', job.detailImagePaths.length) }}</span>
                <span class="ts-mark">{{ job.durationSec }} {{ m('秒') }}</span><span class="ts-mark">{{ job.aspect }}</span>
                <span v-if="accountName(job.accountId)" class="ts-mark">{{ accountName(job.accountId) }}</span>
                <span v-if="job.result" class="ts-mark ts-mark--ok">{{ job.result.width }}×{{ job.result.height }} · {{ job.result.durationSec.toFixed(1) }} {{ m('秒') }}</span>
                <span v-if="job.subtitleVideoPath" class="ts-mark"><Captions :size="11" />{{ m('字幕版') }}</span>
                <span v-if="isPublished(job)" class="ts-mark ts-mark--ok"><SendHorizontal :size="11" />{{ m('已发布') }}</span>
                <span v-if="job.clone" class="ts-mark">{{ job.clone.status === 'done' ? m('已换入复刻') : job.clone.status === 'skipped' ? m('复刻未自动替换') : m('来自复刻') }}</span>
                <span v-if="job.exportedAt" class="ts-mark ts-mark--ok" :title="job.exportedVideoPath"><Download :size="11" />{{ m('已导出') }}</span>
              </div>
              <div class="ts-item__meta"><Clock3 :size="12" />{{ time(job.createdAt) }}</div>
              <div v-if="timing(job)" class="ts-item__meta">{{ m('发出后：') }}{{ timing(job) }}</div>
              <div v-if="job.error" class="ts-item__error" :title="m(job.error)"><AlertTriangle :size="12" /><span>{{ m(job.error) }}</span></div>
              <div v-if="job.status === 'image_review'" class="ts-decision"><button class="vg-btn vg-btn--sm vg-btn--primary" type="button" data-testid="muse-open-review" @click="reviewId = job.id"><ScanLine :size="13" />{{ job.preparedImagePath ? m('确认换图') : m('处理换图') }}</button></div>
              <div v-if="job.status === 'needs_review'" class="ts-decision">
                <button v-if="job.threadPath" class="vg-btn vg-btn--sm vg-btn--primary" type="button" @click="act(() => api.collectJob(job.id))"><RefreshCcw :size="13" />{{ m('找回') }}</button>
                <button class="vg-btn vg-btn--sm" type="button" @click="askDismiss(job)">{{ m('没有结果') }}</button>
              </div>
            </div>
            <footer :class="view === 'grid' ? 'ts-item__foot' : 'ts-row__actions'">
              <button v-if="['running', 'queued', 'swapping', 'image_review'].includes(job.status)" class="vg-btn vg-btn--sm" type="button" @click="act(() => api.cancelJob(job.id))"><Square :size="12" />{{ m('停止') }}</button>
              <button v-if="job.result" class="vg-btn vg-btn--sm" type="button" @click="play(job)"><Play :size="13" />{{ m('播放') }}</button>
              <button v-if="job.result" class="vg-btn vg-btn--sm" type="button" :disabled="working" @click="openSubtitles([job])"><Captions :size="13" />{{ m('字幕') }}</button>
              <button v-if="job.status === 'failed' || job.status === 'cancelled'" class="vg-btn vg-btn--sm" type="button" @click="askRetry(job)"><RotateCcw :size="13" />{{ m('重试') }}</button>
              <span class="ts-item__spacer" />
              <button class="vg-icon-btn vg-icon-btn--sm" type="button" :title="m('详情与日志')" :aria-label="m('详情与日志')" @click="detailId = job.id"><Logs :size="14" /></button>
              <button v-if="job.result" class="vg-icon-btn vg-icon-btn--sm" type="button" :title="m('打开位置')" :aria-label="m('打开位置')" @click="reveal(job)"><FolderOpen :size="14" /></button>
              <button v-if="!['running', 'queued', 'swapping'].includes(job.status)" class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" type="button" :title="m('删除')" :aria-label="m('删除')" @click="askRemove([job])"><Trash2 :size="14" /></button>
            </footer>
          </article>
        </div>

        <footer v-if="paged.length" class="ts-pager">
          <span>{{ page }} / {{ pages }}</span>
          <div>
            <button class="vg-icon-btn" type="button" :aria-label="m('上一页')" :disabled="page <= 1" @click="page--"><ChevronLeft :size="16" /></button>
            <button class="vg-icon-btn" type="button" :aria-label="m('下一页')" :disabled="page >= pages" @click="page++"><ChevronRight :size="16" /></button>
          </div>
        </footer>
      </div>
    </section>

    <MuseAccountDialog :open="accountsOpen" :accounts="accounts" :encryption-available="encryptionAvailable" :remote="remote" @close="accountsOpen = false" @changed="accountsChanged" />
    <ProductSelectDialog :open="productOpen" :products="products" :selected-id="form.productId" :multiple="Boolean(styleReference)" :selected-ids="styleProductIds" @close="productOpen = false" @select="pickProduct" @select-many="pickStyleProducts" />
    <MuseMaterialDialog :open="materialsOpen" @close="materialsOpen = false" @pick="addImages" />
    <MuseImageReviewDialog :job="reviewing" :title="reviewing ? jobTitle(reviewing) : ''" :busy="working" @close="reviewId = ''" @approve="reviewing && approve([reviewing])" @redo="redoImage" />

    <div v-if="settingsOpen" class="vg-scope vg-backdrop" @click.self="settingsOpen = false">
      <form class="vg-dialog mu-ask" role="dialog" aria-modal="true" aria-labelledby="mu-set-title" @submit.prevent="saveSettings">
        <header class="vg-dialog__head"><div class="vg-dialog__title"><span class="vg-dialog__title-icon"><ShieldCheck :size="20" /></span><div><h2 id="mu-set-title">{{ m('换图设置') }}</h2><p>{{ m('对之后新建的任务生效') }}</p></div></div></header>
        <div class="vg-dialog__body mu-settings">
          <label class="vg-field"><span class="vg-field__label">{{ m('换图失败自动重试次数（0–5）') }}</span><input v-model.number="settingsForm.imageRetryLimit" class="vg-input" type="number" min="0" max="5" step="1" /></label>
          <p class="vg-muted">{{ m('每次重试都可能产生图片费用，默认不自动重试。') }}</p>
          <label class="ts-check"><input v-model="settingsForm.autoLocate" type="checkbox" />{{ m('自动识别参考图里的商品位置（会调用 AI 分析）') }}</label>
          <p class="vg-muted">{{ m('关闭后按画面中央区域替换，可在确认时手动框选。') }}</p>
        </div>
        <footer class="vg-dialog__foot"><span /><div class="vg-dialog__foot-actions"><button class="vg-btn" type="button" @click="settingsOpen = false">{{ m('取消') }}</button><button class="vg-btn vg-btn--primary" type="submit" :disabled="working">{{ m('保存') }}</button></div></footer>
      </form>
    </div>

    <MuseVideoDialog :job="playing" :title="playing ? jobTitle(playing) : ''" :busy="working" @close="playingId = ''" @subtitle="playing && openSubtitles([playing])" @revert="playing && revertSubtitles([playing])" @export="playing && exportVideos([playing])" @reveal="playing && reveal(playing)" @remove="playing && askRemove([playing])" />
    <MuseDetailDialog :job-id="detailId" :account-name="accountName(jobById(detailId)?.accountId || '')" @close="detailId = ''" />
    <SubtitleStudioDialog :open="Boolean(subtitleIds.length)" :mode="subtitleIds.length > 1 ? 'batch' : 'single'" :count="subtitleIds.length" :busy="subtitleBusy" :preview-image="subtitlePreview" @close="subtitleIds = []" @submit="submitSubtitles" />

    <div v-if="ask" class="vg-scope vg-backdrop mu-ask-mask" @click.self="ask = null">
      <section class="vg-dialog mu-ask" role="alertdialog" aria-modal="true" aria-labelledby="mu-ask-title">
        <header class="vg-dialog__head"><div class="vg-dialog__title"><div><h2 id="mu-ask-title">{{ ask.title }}</h2><p>{{ ask.text }}</p></div></div></header>
        <footer class="vg-dialog__foot"><span />
          <div class="vg-dialog__foot-actions">
            <button class="vg-btn" type="button" @click="ask = null">{{ m('取消') }}</button>
            <button class="vg-btn" :class="ask.danger ? 'vg-btn--danger' : 'vg-btn--primary'" type="button" data-testid="muse-confirm" @click="confirmed">{{ ask.label }}</button>
          </div>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.mu-notices { display: flex; flex-direction: column; gap: 8px; }
.mu-select { max-width: 520px; }
.mu-concurrency { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--theme-text-secondary); }
.mu-details { grid-template-columns: repeat(auto-fill, 72px); margin-top: 8px; }
.mu-ask-mask { z-index: 2300; }
.mu-row { grid-template-columns: 22px 44px minmax(0, 1fr) auto; }
.mu-row .ts-item__body { padding: 0; }
.mu-ask { width: min(460px, 100%); }
.mu-settings { display: flex; flex-direction: column; gap: 10px; }
.mu-settings p { margin: 0; font-size: 12px; }
</style>
