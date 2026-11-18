<script setup lang="ts">
/**
 * 图生图（商品图素材，网页版）：和电脑端 ProductImageMaterialsView 同样的四个分区和样式
 * （拆解视频 / 图生图 / 视频拆解图片库 / 衍生图素材），用电脑端的 product-materials.css。
 * 拆解视频和 AI 衍生图都在云端执行，记录多端同步。
 */
import '@desktop-src/design-system/product-materials.css'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Boxes,
  Check,
  CircleCheck,
  CloudUpload,
  Copy,
  Download,
  Eye,
  FileVideo,
  Film,
  FolderOpen,
  History,
  Image as ImageIcon,
  ImagePlus,
  Images,
  Layers,
  ListPlus,
  RefreshCcw,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-vue-next'
import MaterialPager from '@desktop-src/ui/components/product-materials/MaterialPager.vue'
import { DEFAULT_DERIVED_IMAGE_PROMPT, IMAGE_MATERIAL_CATEGORIES, IMAGE_MATERIAL_CATEGORY_LABEL, MAX_BACKGROUND_VARIANT_COUNT, type ImageMaterialCategory } from '@shared/imageMaterials'
import { SYNC_COLLECTIONS } from '@shared/cloud/sync'
import { activatePromptVersion, ensureDefaultPrompt, rollbackPromptVersion, savePromptVersion, usePromptVersions } from '@/lib/promptVersions'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import { useAssets } from '@/lib/assets'
import { fileBlob, uploadImage } from '@/lib/files'
import {
  BATCH_STATE_LABEL,
  batchState,
  bindProduct,
  createBackgroundVariants,
  createBatch,
  createImageVariants,
  refreshMaterials,
  removeMaterials,
  retryBatch,
  setUsage,
  startMaterialPolling,
  useImageMaterialBatches,
  useImageMaterials,
  type BatchState,
  type ImageMaterialBatchItem,
  type ImageMaterialItem,
} from '@/lib/imageMaterials'
import { useProducts } from '@/lib/library'
import { downloadBlob } from '@/lib/platform'
import { cloud, errorMessage } from '@/lib/session'
import { requestSync } from '@/lib/sync'
import { toast } from '@/lib/toast'
import { markRunUsed, useToolRuns } from '@/lib/videoTools'

const router = useRouter()
const tab = ref<'batch' | 'image-to-image' | 'background' | 'library'>('batch')
const materials = useImageMaterials()
const batches = useImageMaterialBatches()
const PROMPTS = SYNC_COLLECTIONS.imageMaterialPrompts
const prompts = usePromptVersions(PROMPTS)
const { items: products } = useProducts()
const { items: assetVideos } = useAssets((item) => item.kind === 'video')
const { items: assetImages } = useAssets((item) => item.kind === 'image')
const downloads = useToolRuns('parse-link')
const loading = ref(false)
const busy = ref('')
const categories = IMAGE_MATERIAL_CATEGORIES
const label = (c: ImageMaterialCategory) => IMAGE_MATERIAL_CATEGORY_LABEL[c] ?? c
const PAGING = { prev: '上一页', next: '下一页', perPage: '每页', items: '项' }

const originals = computed(() => materials.value.filter((m) => m.origin === 'original' && m.fileId))
const derived = computed(() => materials.value.filter((m) => m.origin === 'derived'))

onMounted(() => {
  startMaterialPolling()
})
watch(prompts, (list) => void ensureDefaultPrompt(PROMPTS, list, 'Default Lifestyle', DEFAULT_DERIVED_IMAGE_PROMPT), { once: true })

async function refresh() {
  loading.value = true
  try {
    await requestSync()
    await refreshMaterials()
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    loading.value = false
  }
}

/* ================================================================ 拆解视频 */
type PickedVideo = { name: string; fileId: string }
const category = ref<ImageMaterialCategory>('necklace')
const sourceMode = ref<'upload' | 'downloaded'>('upload')
const picked = ref<PickedVideo[]>([])
const uploadingVideos = ref(0)
const videoInput = ref<HTMLInputElement>()
const picking = ref<'' | 'asset-videos' | 'asset-images'>('')
const submitting = ref(false)

const downloadedVideos = computed(() =>
  downloads.value.flatMap((run) => (run.status === 'succeeded' ? run.outputs.map((o, i) => ({ id: `${run.id}_${i}`, fileId: o.fileId, name: run.title?.trim() || run.label, at: run.createdAt, posterFileId: o.posterFileId, used: run.used })) : [])),
)
const pickedDownloaded = ref<string[]>([])
const dlPage = ref(1)
const dlPageSize = ref(8)
const dlPages = computed(() => Math.max(1, Math.ceil(downloadedVideos.value.length / dlPageSize.value)))
const pagedDownloaded = computed(() => downloadedVideos.value.slice((dlPage.value - 1) * dlPageSize.value, dlPage.value * dlPageSize.value))

async function onVideoFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || []).filter((f) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(f.name))
  ;(event.target as HTMLInputElement).value = ''
  for (const file of files) {
    uploadingVideos.value += 1
    try {
      const { fileId } = await cloud.sync.uploadFile(file, file.type || 'video/mp4')
      picked.value = [...picked.value, { name: file.name, fileId }]
    } catch (error) {
      toast(`${file.name}：${errorMessage(error)}`)
    } finally {
      uploadingVideos.value -= 1
    }
  }
}
function toggleAssetVideo(item: { name: string; fileId: string }) {
  picked.value = picked.value.some((p) => p.fileId === item.fileId) ? picked.value.filter((p) => p.fileId !== item.fileId) : [...picked.value, { name: item.name, fileId: item.fileId }]
}
const queueVideos = computed<PickedVideo[]>(() =>
  sourceMode.value === 'upload' ? picked.value : downloadedVideos.value.filter((v) => pickedDownloaded.value.includes(v.id)).map((v) => ({ name: v.name, fileId: v.fileId })),
)
async function submitBatch() {
  if (!queueVideos.value.length) return
  submitting.value = true
  try {
    await createBatch(category.value, queueVideos.value)
    if (sourceMode.value === 'downloaded') {
      const runIds = new Set(pickedDownloaded.value.map((id) => id.replace(/_\d+$/, '')))
      for (const run of downloads.value.filter((r) => runIds.has(r.id))) await markRunUsed(run)
    }
    picked.value = []
    pickedDownloaded.value = []
    toast('批次已创建，并已加入处理队列。')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    submitting.value = false
  }
}

const latest = computed(() => batches.value[0] ?? null)
const older = computed(() => batches.value.slice(1, 6))
const stateClass = (state: BatchState | 'queued' | 'running' | 'succeeded' | 'failed') =>
  state === 'completed' || state === 'succeeded' ? 'pm-state--ok' : state === 'failed' ? 'pm-state--err' : state === 'partial_failed' ? 'pm-state--warn' : state === 'processing' || state === 'running' ? 'pm-state--run' : ''
const SOURCE_LABEL = { queued: '排队中', running: '处理中', succeeded: '已完成', failed: '失败' }
function metrics(batch: ImageMaterialBatchItem) {
  const done = batch.sources.filter((s) => s.status === 'succeeded').length
  const failed = batch.sources.filter((s) => s.status === 'failed').length
  return { total: batch.sources.length, done, failed, images: batch.sources.reduce((n, s) => n + s.generatedCount, 0), progress: batch.sources.length ? Math.round(((done + failed) / batch.sources.length) * 100) : 0 }
}
const timeOf = (at: number) => new Date(at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
async function retry(batch: ImageMaterialBatchItem) {
  busy.value = batch.id
  try {
    await retryBatch(batch)
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    busy.value = ''
  }
}

/* ================================================================ 提示词版本 */
const selectedPromptId = ref('')
const promptName = ref('')
const promptText = ref('')
const promptBusy = ref(false)
const promptPanelOpen = ref(false)
watch(
  prompts,
  (list) => {
    if (selectedPromptId.value && list.some((p) => p.id === selectedPromptId.value)) return
    const active = list.find((p) => p.active) ?? list[0]
    if (active) loadPrompt(active.id)
  },
  { immediate: true },
)
function loadPrompt(id: string) {
  const row = prompts.value.find((p) => p.id === id)
  if (!row) return
  selectedPromptId.value = row.id
  promptName.value = row.name
  promptText.value = row.prompt
}
const activePromptLabel = computed(() => {
  const row = prompts.value.find((p) => p.id === selectedPromptId.value)
  return row ? `V${row.version}` : '-'
})
async function onSavePrompt(asNew = false) {
  promptBusy.value = true
  try {
    const id = await savePromptVersion(PROMPTS, { id: asNew ? undefined : selectedPromptId.value, name: asNew ? `${promptName.value} copy` : promptName.value, prompt: promptText.value }, prompts.value)
    selectedPromptId.value = id
    toast('提示词版本已保存。')
  } finally {
    promptBusy.value = false
  }
}
async function onActivatePrompt() {
  promptBusy.value = true
  try {
    await activatePromptVersion(PROMPTS, selectedPromptId.value, prompts.value)
    toast('提示词版本已启用。')
  } finally {
    promptBusy.value = false
  }
}
/** 回滚为新版本：把当前选中版本的内容另存为新版本并启用 */
async function onRollbackPrompt() {
  promptBusy.value = true
  try {
    selectedPromptId.value = await rollbackPromptVersion(PROMPTS, selectedPromptId.value, prompts.value)
    toast('提示词版本已回滚为新的启用版本。')
  } finally {
    promptBusy.value = false
  }
}

/* ================================================================ 图生图 */
const sources = ref<Array<{ fileId: string; name: string }>>([])
const imageCategory = ref<ImageMaterialCategory>('necklace')
const variantCount = ref(1)
const generating = ref(false)
const uploadingImages = ref(0)
const imageInput = ref<HTMLInputElement>()
async function onImageFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || []).filter((f) => f.type.startsWith('image/'))
  ;(event.target as HTMLInputElement).value = ''
  for (const file of files) {
    uploadingImages.value += 1
    try {
      const image = await uploadImage(file)
      sources.value = [...sources.value, { fileId: image.fileId, name: file.name }]
    } catch (error) {
      toast(`${file.name}：${errorMessage(error)}`)
    } finally {
      uploadingImages.value -= 1
    }
  }
}
function toggleAssetImage(item: { name: string; fileId: string }) {
  sources.value = sources.value.some((s) => s.fileId === item.fileId) ? sources.value.filter((s) => s.fileId !== item.fileId) : [...sources.value, { fileId: item.fileId, name: item.name }]
}
async function generateFromImages() {
  if (!sources.value.length || !promptText.value.trim()) return
  generating.value = true
  try {
    const total = await createImageVariants(sources.value, imageCategory.value, variantCount.value, promptText.value.trim())
    toast(`已提交 ${total} 张衍生图，生成后进入「衍生图素材」`)
    sources.value = []
    tab.value = 'library'
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    generating.value = false
  }
}

/* ================================================================ 视频拆解图片库 */
const bgCount = ref(1)
const bgSelected = ref<string[]>([])
const libSelected = ref<string[]>([])
const bgPage = ref(1)
const pageSize = ref(24)
const bgPages = computed(() => Math.max(1, Math.ceil(originals.value.length / pageSize.value)))
const bgPaged = computed(() => originals.value.slice((bgPage.value - 1) * pageSize.value, bgPage.value * pageSize.value))
const bgAllSelected = computed(() => bgPaged.value.length > 0 && bgPaged.value.every((m) => bgSelected.value.includes(m.id)))
type ListName = 'bg' | 'lib' | 'dl'
const listOf = (name: ListName) => (name === 'bg' ? bgSelected : name === 'lib' ? libSelected : pickedDownloaded)
function toggleIn(name: ListName, id: string) {
  const list = listOf(name)
  list.value = list.value.includes(id) ? list.value.filter((x) => x !== id) : [...list.value, id]
}
function toggleAllPage(name: ListName, page: ImageMaterialItem[], all: boolean) {
  const list = listOf(name)
  const ids = page.map((m) => m.id)
  list.value = all ? list.value.filter((id) => !ids.includes(id)) : [...new Set([...list.value, ...ids])]
}
const bgSubmitting = ref(false)
async function generateBackground() {
  const chosen = originals.value.filter((m) => bgSelected.value.includes(m.id))
  if (!chosen.length) return
  bgSubmitting.value = true
  try {
    const total = await createBackgroundVariants(chosen, bgCount.value, promptText.value.trim())
    bgSelected.value = []
    toast(`已提交 ${total} 张衍生图，生成后进入「衍生图素材」`)
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    bgSubmitting.value = false
  }
}

/* ================================================================ 衍生图素材 */
const filterCategory = ref<'all' | ImageMaterialCategory>('all')
const filterUsage = ref<'all' | 'unused' | 'used'>('all')
const libPage = ref(1)
const filtered = computed(() => derived.value.filter((m) => (filterCategory.value === 'all' || m.category === filterCategory.value) && (filterUsage.value === 'all' || m.usage === filterUsage.value)))
const libPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
const libPaged = computed(() => filtered.value.slice((libPage.value - 1) * pageSize.value, libPage.value * pageSize.value))
const libAllSelected = computed(() => libPaged.value.length > 0 && libPaged.value.every((m) => libSelected.value.includes(m.id)))
watch([filterCategory, filterUsage], () => { libPage.value = 1; libSelected.value = [] })
const shortId = (id: string) => id.replace(/^imm_/, '').slice(-8)
const byId = (ids: string[]) => materials.value.filter((m) => ids.includes(m.id))

async function exportItems(items: ImageMaterialItem[]) {
  const ready = items.filter((m) => m.fileId).slice(0, 50)
  if (!ready.length) return
  busy.value = 'export'
  try {
    for (const [index, item] of ready.entries()) {
      const blob = await fileBlob(item.fileId!)
      downloadBlob(blob, `${String(index + 1).padStart(2, '0')}_${item.category}_${shortId(item.id)}.${blob.type.includes('png') ? 'png' : 'jpg'}`)
    }
    toast('素材已导出。')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    busy.value = ''
  }
}
async function deleteItems(items: ImageMaterialItem[], single = false) {
  if (!items.length) return
  if (!window.confirm(single ? '确定要删除这张素材图片吗？' : '确定要删除已选择的素材图片吗？')) return
  await removeMaterials(items)
  libSelected.value = libSelected.value.filter((id) => !items.some((m) => m.id === id))
  bgSelected.value = bgSelected.value.filter((id) => !items.some((m) => m.id === id))
  toast(single ? '素材已删除。' : '已批量删除所选素材图片。')
}

/* ================================================================ 预览 */
const preview = ref<ImageMaterialItem | null>(null)
</script>

<template>
  <div class="vg-scope pm" data-testid="web-image-materials">
    <section class="pm-top">
      <header class="pm-head">
        <div class="pm-head__icon"><Sparkles :size="20" /></div>
        <div class="pm-head__text">
          <h1>图生图</h1>
          <p>在批次处理与素材相册之间快速切换</p>
        </div>
        <div class="pm-head__actions">
          <button class="vg-btn" type="button" @click="router.push('/toolbox')"><X :size="15" />返回工具箱</button>
          <button class="vg-btn" type="button" :disabled="loading" @click="refresh"><RefreshCcw :size="14" :class="{ 'vg-spin': loading }" />刷新</button>
        </div>
      </header>
      <nav class="pm-tabs" role="tablist">
        <button class="pm-tab" :class="{ 'is-active': tab === 'batch' }" role="tab" type="button" @click="tab = 'batch'"><Film :size="15" />拆解视频</button>
        <button class="pm-tab" :class="{ 'is-active': tab === 'image-to-image' }" role="tab" type="button" @click="tab = 'image-to-image'"><Wand2 :size="15" />图生图</button>
        <button class="pm-tab" :class="{ 'is-active': tab === 'background' }" role="tab" type="button" data-testid="pm-tab-background" @click="tab = 'background'"><ImageIcon :size="15" />视频拆解图片库<em>{{ originals.length }}</em></button>
        <button class="pm-tab" :class="{ 'is-active': tab === 'library' }" role="tab" type="button" data-testid="pm-tab-library" @click="tab = 'library'"><Layers :size="15" />衍生图素材<em>{{ derived.length }}</em></button>
      </nav>
    </section>

    <!-- ============ 拆解视频 ============ -->
    <div v-if="tab === 'batch'" class="pm-split">
      <section class="pm-card">
        <header class="pm-card__head">
          <span class="pm-num">1</span>
          <div class="pm-card__title"><h2>创建批次</h2><p>选择固定分类后，将多个源视频加入处理队列。</p></div>
        </header>
        <div class="pm-field">
          <span class="pm-field__label">分类</span>
          <div class="pm-seg pm-seg--full">
            <button v-for="item in categories" :key="item" type="button" :class="{ 'is-on': category === item }" @click="category = item">{{ label(item) }}</button>
          </div>
        </div>
        <div class="pm-field">
          <span class="pm-field__label">视频来源</span>
          <div class="pm-source">
            <button class="pm-source__opt" :class="{ 'is-on': sourceMode === 'upload' }" type="button" @click="sourceMode = 'upload'"><CloudUpload :size="16" /><span>上传我的视频</span></button>
            <button class="pm-source__opt" :class="{ 'is-on': sourceMode === 'downloaded' }" type="button" @click="sourceMode = 'downloaded'"><Download :size="16" /><span>选择已下载视频</span><em>{{ downloadedVideos.length }}</em></button>
          </div>
        </div>

        <template v-if="sourceMode === 'upload'">
          <button class="pm-drop" type="button" @click="videoInput?.click()">
            <span class="pm-drop__icon"><RefreshCcw v-if="uploadingVideos" :size="22" class="vg-spin" /><CloudUpload v-else :size="22" /></span>
            <strong>{{ uploadingVideos ? `正在上传 ${uploadingVideos} 个视频` : '选择视频文件' }}</strong>
            <span>支持批量选择</span>
            <small>支持 MP4 / MOV / WEBM 等常见格式</small>
          </button>
          <input ref="videoInput" type="file" accept="video/*" multiple hidden data-testid="pm-video-input" @change="onVideoFiles" />
          <div class="pm-row">
            <button class="vg-btn" type="button" @click="videoInput?.click()"><FolderOpen :size="15" />选择视频</button>
            <button class="vg-btn" type="button" @click="picking = 'asset-videos'"><Images :size="15" />从素材库选择</button>
          </div>
          <div class="pm-files">
            <div v-if="!picked.length" class="pm-files__empty">暂未选择视频。</div>
            <div v-for="item in picked" :key="item.fileId" class="pm-file">
              <FileVideo :size="15" class="pm-file__icon" />
              <span class="pm-file__name" :title="item.name">{{ item.name }}</span>
              <button class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" type="button" title="移除" aria-label="移除" @click="picked = picked.filter((p) => p.fileId !== item.fileId)"><X :size="13" /></button>
            </div>
          </div>
        </template>
        <template v-else>
          <div v-if="!downloadedVideos.length" class="vg-empty pm-empty">
            <span class="vg-empty__icon"><Download :size="22" /></span>
            <p>暂无已完成下载的视频，请先使用「链接下载」。</p>
          </div>
          <template v-else>
            <div class="pm-videos">
              <button v-for="item in pagedDownloaded" :key="item.id" class="pm-video" :class="{ 'is-on': pickedDownloaded.includes(item.id) }" type="button" @click="toggleIn('dl', item.id)">
                <span class="pm-video__thumb">
                  <CloudImage v-if="item.posterFileId" :file-id="item.posterFileId" />
                  <Film v-else :size="20" />
                  <span class="pm-video__check"><Check v-if="pickedDownloaded.includes(item.id)" :size="12" :stroke-width="3" /></span>
                  <span v-if="item.used" class="pm-video__used">已使用</span>
                </span>
                <span class="pm-video__body"><strong :title="item.name">{{ item.name }}</strong><small>{{ timeOf(item.at) }}</small></span>
              </button>
            </div>
            <MaterialPager v-if="downloadedVideos.length > 8" v-model:page="dlPage" v-model:page-size="dlPageSize" :total-pages="dlPages" :total="downloadedVideos.length" :sizes="[8, 12, 16, 24]" :labels="PAGING" />
          </template>
        </template>

        <footer class="pm-card__foot">
          <span class="vg-muted">已选 <b class="vg-num">{{ queueVideos.length }}</b> 个视频</span>
          <button class="vg-btn vg-btn--primary" type="button" data-testid="pm-queue" :disabled="!queueVideos.length || submitting || uploadingVideos > 0" @click="submitBatch">
            <RefreshCcw v-if="submitting" :size="15" class="vg-spin" /><ListPlus v-else :size="15" />加入队列
          </button>
        </footer>
      </section>

      <section class="pm-card">
        <header class="pm-card__head">
          <span class="pm-num">2</span>
          <div class="pm-card__title"><h2>处理队列</h2><p>在云端处理，关掉网页也会继续，每 4 秒刷新一次状态。</p></div>
          <button class="vg-icon-btn" type="button" title="刷新" aria-label="刷新" :disabled="loading" @click="refresh"><RefreshCcw :size="15" :class="{ 'vg-spin': loading }" /></button>
        </header>
        <div v-if="!latest" class="vg-empty pm-empty">
          <span class="vg-empty__icon"><Boxes :size="22" /></span>
          <h3>暂无批次。</h3>
          <p>在左侧选择视频并加入队列，处理进度会在这里实时更新。</p>
        </div>
        <template v-else>
          <article class="pm-batch" data-testid="pm-latest-batch">
            <div class="pm-batch__head">
              <div class="pm-batch__title"><span class="vg-chip">{{ label(latest.category) }}</span><strong class="vg-num">{{ timeOf(latest.updatedAt) }}</strong></div>
              <span class="pm-state" :class="stateClass(batchState(latest))"><i />{{ BATCH_STATE_LABEL[batchState(latest)] }}</span>
            </div>
            <div class="vg-progress">
              <div class="vg-progress__bar"><div class="vg-progress__fill" :class="{ 'vg-progress__fill--fail': batchState(latest) === 'failed' }" :style="{ width: `${metrics(latest).progress}%` }" /></div>
              <span>{{ metrics(latest).progress }}%</span>
            </div>
            <div class="pm-metrics">
              <div class="pm-metric"><span>总数</span><strong>{{ metrics(latest).total }}</strong></div>
              <div class="pm-metric pm-metric--ok"><span>完成</span><strong>{{ metrics(latest).done }}</strong></div>
              <div class="pm-metric" :class="{ 'pm-metric--err': metrics(latest).failed > 0 }"><span>失败</span><strong>{{ metrics(latest).failed }}</strong></div>
              <div class="pm-metric"><span>图片</span><strong>{{ metrics(latest).images }}</strong></div>
            </div>
            <div class="pm-files pm-files--flat">
              <div v-for="item in latest.sources" :key="item.jobId" class="pm-file pm-file--queue">
                <FileVideo :size="15" class="pm-file__icon" />
                <div class="pm-file__main">
                  <span class="pm-file__text" :title="item.name">{{ item.name }}</span>
                  <small v-if="item.error" class="pm-file__err" :title="item.error">{{ item.error }}</small>
                  <small v-else class="vg-num">图片 {{ item.generatedCount }}</small>
                </div>
                <span class="pm-state" :class="stateClass(item.status)"><i />{{ SOURCE_LABEL[item.status] }}</span>
              </div>
            </div>
            <div v-if="batchState(latest) === 'failed' || batchState(latest) === 'partial_failed'" class="pm-row pm-row--end">
              <button class="vg-btn vg-btn--sm vg-btn--danger" type="button" :disabled="busy === latest.id" @click="retry(latest)"><RotateCcw :size="13" />重试失败项</button>
            </div>
          </article>
          <div v-if="older.length" class="pm-history">
            <div class="pm-history__title">最近批次</div>
            <div v-for="item in older" :key="item.id" class="pm-history__row">
              <span class="vg-chip">{{ label(item.category) }}</span>
              <span class="vg-num pm-history__time">{{ timeOf(item.updatedAt) }}</span>
              <span class="vg-num vg-muted">{{ metrics(item).done }}/{{ metrics(item).total }} · {{ metrics(item).images }} 张图</span>
              <span class="pm-state" :class="stateClass(batchState(item))"><i />{{ BATCH_STATE_LABEL[batchState(item)] }}</span>
              <button v-if="batchState(item) === 'failed' || batchState(item) === 'partial_failed'" class="vg-icon-btn vg-icon-btn--sm" type="button" title="重试失败项" :disabled="busy === item.id" @click="retry(item)"><RotateCcw :size="13" /></button>
            </div>
          </div>
          <div class="vg-notice pm-tip"><ShieldCheck :size="15" /><span>提示：拆出的图片会进入「视频拆解图片库」，可以继续生成衍生图。</span></div>
        </template>
      </section>
    </div>

    <!-- ============ 图生图 ============ -->
    <div v-else-if="tab === 'image-to-image'" class="pm-split pm-split--i2i">
      <section class="pm-card">
        <header class="pm-card__head">
          <span class="pm-num">1</span>
          <div class="pm-card__title"><h2>源图片</h2><p>新生成的图片会进入「衍生图素材库」，不再与源图混显。</p></div>
        </header>
        <div class="pm-source-img" :class="{ 'has-image': sources.length }">
          <button v-if="!sources.length" class="pm-source-img__preview" type="button" @click="imageInput?.click()">
            <span class="pm-source-img__empty">
              <span class="pm-drop__icon"><RefreshCcw v-if="uploadingImages" :size="22" class="vg-spin" /><ImagePlus v-else :size="22" /></span>
              <strong>尚未选择图片</strong>
              <small>支持 JPG、PNG 和 WEBP · 可一次选择多张</small>
            </span>
          </button>
          <div v-else class="pm-source-grid">
            <div v-for="item in sources" :key="item.fileId" class="pm-source-grid__item" :title="item.name">
              <CloudImage :file-id="item.fileId" :alt="item.name" />
              <button class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger pm-source-grid__remove" type="button" title="移除" aria-label="移除" :disabled="generating" @click="sources = sources.filter((s) => s.fileId !== item.fileId)"><X :size="12" /></button>
            </div>
            <button class="pm-source-grid__add" type="button" :disabled="generating" title="继续添加" @click="imageInput?.click()"><ImagePlus :size="18" /><small>继续添加</small></button>
          </div>
          <div v-if="sources.length" class="pm-source-img__bar">
            <ImageIcon :size="14" /><span>已选 {{ sources.length }} 张源图</span>
            <button class="vg-btn vg-btn--sm vg-btn--ghost" type="button" :disabled="generating" @click="sources = []"><X :size="13" />清空</button>
          </div>
        </div>
        <input ref="imageInput" type="file" accept="image/*" multiple hidden @change="onImageFiles" />
        <div class="pm-row pm-row--fill">
          <button class="vg-btn" type="button" @click="imageInput?.click()"><CloudUpload :size="15" /><span>本地选图</span></button>
          <button class="vg-btn" type="button" @click="picking = 'asset-images'"><Images :size="15" /><span>从素材库选图</span></button>
        </div>
        <div class="pm-field">
          <span class="pm-field__label">商品分类</span>
          <div class="pm-seg pm-seg--full"><button v-for="item in categories" :key="item" type="button" :class="{ 'is-on': imageCategory === item }" @click="imageCategory = item">{{ label(item) }}</button></div>
        </div>
        <div class="pm-field">
          <span class="pm-field__label">生成数量</span>
          <div class="pm-seg pm-seg--full"><button v-for="n in MAX_BACKGROUND_VARIANT_COUNT" :key="n" type="button" :class="{ 'is-on': variantCount === n }" @click="variantCount = n">{{ n }}</button></div>
        </div>
        <button class="vg-btn vg-btn--primary vg-btn--lg vg-btn--block" type="button" :disabled="!sources.length || generating || uploadingImages > 0" @click="generateFromImages">
          <RefreshCcw v-if="generating" :size="16" class="vg-spin" /><Wand2 v-else :size="16" />生成衍生图
          <em class="pm-btn-count">{{ sources.length > 1 ? `${sources.length} × ` : '× ' }}{{ variantCount }}</em>
        </button>
      </section>

      <section class="pm-card">
        <header class="pm-card__head">
          <span class="pm-num">2</span>
          <div class="pm-card__title"><h2>生成提示词版本</h2><p>生成时使用当前选中的版本，可保存、复制或回滚。</p></div>
        </header>
        <div class="vg-form-grid">
          <label class="vg-field">
            <span class="vg-field__label">提示词版本</span>
            <select :value="selectedPromptId" class="vg-select" @change="loadPrompt(($event.target as HTMLSelectElement).value)">
              <option v-for="v in prompts" :key="v.id" :value="v.id">V{{ v.version }} · {{ v.name }}{{ v.active ? ' · 已启用' : '' }}</option>
            </select>
          </label>
          <label class="vg-field"><span class="vg-field__label">版本名称</span><input v-model="promptName" class="vg-input" type="text" /></label>
        </div>
        <label class="vg-field pm-grow"><span class="vg-field__label">提示词内容</span><textarea v-model="promptText" class="vg-textarea pm-prompt" rows="12" spellcheck="false" /></label>
        <footer class="pm-card__foot">
          <button class="vg-btn vg-btn--sm vg-btn--ghost" type="button" :disabled="promptBusy || !selectedPromptId" @click="onRollbackPrompt"><History :size="13" />回滚为新版本</button>
          <div class="pm-row">
            <button class="vg-btn vg-btn--sm" type="button" :disabled="promptBusy || !promptText.trim()" @click="onSavePrompt(true)"><Copy :size="13" />复制为新版本</button>
            <button class="vg-btn vg-btn--sm" type="button" :disabled="promptBusy || !selectedPromptId" @click="onActivatePrompt"><CircleCheck :size="13" />启用版本</button>
            <button class="vg-btn vg-btn--sm vg-btn--primary" type="button" :disabled="promptBusy || !selectedPromptId" @click="onSavePrompt()"><Save :size="13" />保存更新</button>
          </div>
        </footer>
      </section>
    </div>

    <!-- ============ 视频拆解图片库 ============ -->
    <section v-else-if="tab === 'background'" class="pm-card pm-card--flush">
      <header class="pm-bar">
        <div class="pm-bar__title"><h2>视频拆解图片库</h2><p>浏览视频拆解得到的源图，选择素材生成衍生图。</p></div>
        <div class="pm-bar__tools">
          <span class="pm-inline-label">每张源图生成数量</span>
          <div class="pm-seg"><button v-for="n in MAX_BACKGROUND_VARIANT_COUNT" :key="n" type="button" :class="{ 'is-on': bgCount === n }" @click="bgCount = n">{{ n }}</button></div>
          <button class="vg-btn vg-btn--sm" :class="{ 'is-active': promptPanelOpen }" type="button" @click="promptPanelOpen = !promptPanelOpen"><SlidersHorizontal :size="13" />提示词版本<em class="pm-btn-count">{{ activePromptLabel }}</em></button>
        </div>
      </header>
      <div v-if="promptPanelOpen" class="pm-prompt-panel">
        <div class="vg-form-grid">
          <label class="vg-field">
            <span class="vg-field__label">提示词版本</span>
            <select :value="selectedPromptId" class="vg-select" @change="loadPrompt(($event.target as HTMLSelectElement).value)">
              <option v-for="v in prompts" :key="v.id" :value="v.id">V{{ v.version }} · {{ v.name }}{{ v.active ? ' · 已启用' : '' }}</option>
            </select>
          </label>
          <label class="vg-field"><span class="vg-field__label">版本名称</span><input v-model="promptName" class="vg-input" type="text" /></label>
        </div>
        <label class="vg-field"><span class="vg-field__label">提示词内容</span><textarea v-model="promptText" class="vg-textarea pm-prompt" rows="5" spellcheck="false" /></label>
        <div class="pm-row pm-row--end">
          <button class="vg-btn vg-btn--sm vg-btn--ghost" type="button" :disabled="promptBusy || !selectedPromptId" @click="onRollbackPrompt"><History :size="13" />回滚为新版本</button>
          <button class="vg-btn vg-btn--sm" type="button" :disabled="promptBusy || !promptText.trim()" @click="onSavePrompt(true)"><Copy :size="13" />复制为新版本</button>
          <button class="vg-btn vg-btn--sm" type="button" :disabled="promptBusy || !selectedPromptId" @click="onActivatePrompt"><CircleCheck :size="13" />启用版本</button>
          <button class="vg-btn vg-btn--sm vg-btn--primary" type="button" :disabled="promptBusy || !selectedPromptId" @click="onSavePrompt()"><Save :size="13" />保存更新</button>
        </div>
      </div>
      <div v-if="originals.length" class="pm-selbar" :class="{ 'is-live': bgSelected.length }">
        <label class="pm-check"><input type="checkbox" :checked="bgAllSelected" @change="toggleAllPage('bg', bgPaged, bgAllSelected)" /><span>全选</span></label>
        <span class="vg-muted">已选 <b class="vg-num">{{ bgSelected.length }}</b> · 总输出 <b class="vg-num">{{ bgSelected.length * bgCount }}</b></span>
        <button v-if="bgSelected.length" class="vg-link vg-link--muted" type="button" @click="bgSelected = []">清空选择</button>
        <span class="vg-toolbar__spacer" />
        <button class="vg-btn vg-btn--sm" type="button" :disabled="!bgSelected.length || busy === 'export'" @click="exportItems(byId(bgSelected))"><Download :size="13" />批量导出</button>
        <button class="vg-btn vg-btn--sm vg-btn--primary" type="button" data-testid="pm-generate-background" :disabled="!bgSelected.length || bgSubmitting" @click="generateBackground"><RefreshCcw v-if="bgSubmitting" :size="13" class="vg-spin" /><Wand2 v-else :size="13" />生成衍生图</button>
      </div>
      <div v-if="!originals.length" class="vg-empty pm-empty pm-empty--tall">
        <span class="vg-empty__icon"><ImageIcon :size="22" /></span>
        <h3>当前筛选条件下没有素材。</h3>
        <p>先在「拆解视频」中处理视频，拆解出的图片会出现在这里。</p>
        <button class="vg-btn vg-btn--primary" type="button" @click="tab = 'batch'"><Film :size="15" />拆解视频</button>
      </div>
      <div v-else class="pm-gallery-wrap">
        <div class="pm-gallery">
          <article v-for="item in bgPaged" :key="item.id" class="pm-tile" :class="{ 'is-on': bgSelected.includes(item.id) }">
            <div class="pm-tile__media">
              <button class="pm-tile__img" type="button" @click="preview = item"><CloudImage :file-id="item.fileId" /></button>
              <button class="pm-tile__check" type="button" :aria-pressed="bgSelected.includes(item.id)" @click.stop="toggleIn('bg', item.id)"><Check v-if="bgSelected.includes(item.id)" :size="12" :stroke-width="3" /></button>
              <div class="pm-tile__tools">
                <button class="pm-tool" type="button" title="查看" @click.stop="preview = item"><Eye :size="13" /></button>
                <button class="pm-tool pm-tool--danger" type="button" title="删除" @click.stop="deleteItems([item], true)"><Trash2 :size="13" /></button>
              </div>
            </div>
            <div class="pm-tile__body">
              <div class="pm-tile__title"><strong>{{ shortId(item.id) }}</strong><span class="vg-chip">{{ label(item.category) }}</span></div>
              <div class="pm-tile__meta">{{ item.sourceName || '源图' }} · <span class="vg-num">{{ (item.atSec ?? 0).toFixed(2) }}s</span></div>
            </div>
          </article>
        </div>
        <MaterialPager v-if="originals.length > 24" v-model:page="bgPage" v-model:page-size="pageSize" :total-pages="bgPages" :total="originals.length" :sizes="[24, 32, 48, 64]" :labels="PAGING" />
      </div>
    </section>

    <!-- ============ 衍生图素材 ============ -->
    <section v-else class="pm-card pm-card--flush">
      <header class="pm-bar">
        <div class="pm-bar__title"><h2>衍生图素材库</h2><p>只显示已衍生出来的图片，用于浏览、导出和管理。</p></div>
        <div class="pm-bar__tools">
          <div class="pm-seg">
            <button type="button" :class="{ 'is-on': filterCategory === 'all' }" @click="filterCategory = 'all'">全部</button>
            <button v-for="item in categories" :key="item" type="button" :class="{ 'is-on': filterCategory === item }" @click="filterCategory = item">{{ label(item) }}</button>
          </div>
          <div class="pm-seg">
            <button type="button" :class="{ 'is-on': filterUsage === 'all' }" @click="filterUsage = 'all'">全部</button>
            <button type="button" :class="{ 'is-on': filterUsage === 'unused' }" @click="filterUsage = 'unused'">未使用</button>
            <button type="button" :class="{ 'is-on': filterUsage === 'used' }" @click="filterUsage = 'used'">已使用</button>
          </div>
        </div>
      </header>
      <div v-if="filtered.length" class="pm-selbar" :class="{ 'is-live': libSelected.length }">
        <label class="pm-check"><input type="checkbox" :checked="libAllSelected" @change="toggleAllPage('lib', libPaged, libAllSelected)" /><span>全选</span></label>
        <span class="vg-muted">已选择 <b class="vg-num">{{ libSelected.length }}</b></span>
        <button v-if="libSelected.length" class="vg-link vg-link--muted" type="button" @click="libSelected = []">清空选择</button>
        <span class="vg-toolbar__spacer" />
        <button class="vg-btn vg-btn--sm vg-btn--danger" type="button" :disabled="!libSelected.length" @click="deleteItems(byId(libSelected))"><Trash2 :size="13" />批量删除</button>
        <button class="vg-btn vg-btn--sm vg-btn--primary" type="button" :disabled="!libSelected.length || busy === 'export'" @click="exportItems(byId(libSelected))"><Download :size="13" />批量导出</button>
      </div>
      <div v-if="!filtered.length" class="vg-empty pm-empty pm-empty--tall">
        <span class="vg-empty__icon"><Layers :size="22" /></span>
        <h3>当前筛选条件下没有素材。</h3>
        <p>当前素材库仅展示衍生图结果。</p>
      </div>
      <div v-else class="pm-gallery-wrap">
        <div class="pm-gallery" data-testid="pm-derived-gallery">
          <article v-for="item in libPaged" :key="item.id" class="pm-tile" :class="{ 'is-on': libSelected.includes(item.id) }">
            <div class="pm-tile__media">
              <button class="pm-tile__img" type="button" :disabled="!item.fileId" @click="preview = item">
                <CloudImage v-if="item.fileId" :file-id="item.fileId" />
                <span v-else class="pm-tile__pending"><RefreshCcw v-if="item.status !== 'failed'" :size="18" class="vg-spin" /><X v-else :size="18" /><small>{{ item.status === 'failed' ? item.error || '生成失败' : '生成中' }}</small></span>
              </button>
              <button class="pm-tile__check" type="button" :aria-pressed="libSelected.includes(item.id)" @click.stop="toggleIn('lib', item.id)"><Check v-if="libSelected.includes(item.id)" :size="12" :stroke-width="3" /></button>
              <span v-if="item.usage === 'used'" class="pm-tile__flag pm-tile__flag--warn">已使用</span>
              <div class="pm-tile__tools">
                <button class="pm-tool" type="button" title="查看" :disabled="!item.fileId" @click.stop="preview = item"><Eye :size="13" /></button>
                <button class="pm-tool pm-tool--danger" type="button" title="删除" @click.stop="deleteItems([item], true)"><Trash2 :size="13" /></button>
              </div>
            </div>
            <div class="pm-tile__body">
              <div class="pm-tile__title"><strong>{{ shortId(item.id) }}</strong><span class="vg-chip">{{ label(item.category) }}</span></div>
              <div class="pm-tile__meta">衍生自 <span class="vg-num">{{ item.derivedFromId ? shortId(item.derivedFromId) : item.sourceName || '上传图片' }}</span></div>
              <div class="pm-tile__row">
                <button class="pm-usage" :class="{ 'is-used': item.usage === 'used' }" type="button" :title="item.usage === 'used' ? '未使用' : '已使用'" @click="setUsage([item], item.usage === 'used' ? 'unused' : 'used')"><i />{{ item.usage === 'used' ? '已使用' : '未使用' }}</button>
                <select class="vg-select vg-select--sm pm-tile__bind" title="绑定商品" :value="item.boundProductId || ''" @change="bindProduct([item], ($event.target as HTMLSelectElement).value)">
                  <option value="">绑定商品 · 未绑定</option>
                  <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}{{ p.type ? ` (${p.type})` : '' }}</option>
                </select>
              </div>
            </div>
          </article>
        </div>
        <MaterialPager v-if="filtered.length > 24" v-model:page="libPage" v-model:page-size="pageSize" :total-pages="libPages" :total="filtered.length" :sizes="[24, 32, 48, 64]" :labels="PAGING" />
      </div>
    </section>

    <!-- 素材库选择 -->
    <div v-if="picking" class="vg-backdrop" @click.self="picking = ''">
      <section class="vg-dialog vg-dialog--wide">
        <header class="vg-dialog__head">
          <span class="vg-dialog__title">{{ picking === 'asset-videos' ? '从素材库选择视频' : '从素材库选图' }}</span>
          <button type="button" class="vg-icon-btn" aria-label="关闭" @click="picking = ''"><X :size="16" /></button>
        </header>
        <div class="vg-dialog__body">
          <div v-if="picking === 'asset-videos' ? assetVideos.length : assetImages.length" class="pmw-pick">
            <template v-if="picking === 'asset-videos'">
              <button v-for="a in assetVideos" :key="a.id" type="button" class="pmw-pick__item" :class="{ 'is-on': picked.some((p) => p.fileId === a.fileId) }" :title="a.name" @click="toggleAssetVideo(a)">
                <CloudImage v-if="a.posterFileId" :file-id="a.posterFileId" /><CloudVideo v-else :file-id="a.fileId" muted />
                <span>{{ a.name }}</span><Check v-if="picked.some((p) => p.fileId === a.fileId)" :size="14" class="pmw-pick__check" />
              </button>
            </template>
            <template v-else>
              <button v-for="a in assetImages" :key="a.id" type="button" class="pmw-pick__item" :class="{ 'is-on': sources.some((s) => s.fileId === a.fileId) }" :title="a.name" @click="toggleAssetImage(a)">
                <CloudImage :file-id="a.fileId" /><span>{{ a.name }}</span><Check v-if="sources.some((s) => s.fileId === a.fileId)" :size="14" class="pmw-pick__check" />
              </button>
            </template>
          </div>
          <p v-else class="vg-muted">素材库里还没有{{ picking === 'asset-videos' ? '视频' : '图片' }}。</p>
        </div>
        <footer class="vg-dialog__foot"><span class="vg-muted">已选 {{ picking === 'asset-videos' ? picked.length : sources.length }}</span><button type="button" class="vg-btn vg-btn--primary" @click="picking = ''">完成</button></footer>
      </section>
    </div>

    <!-- 预览 -->
    <div v-if="preview" class="vg-backdrop" @click.self="preview = null">
      <section class="vg-dialog vg-dialog--wide">
        <header class="vg-dialog__head">
          <span class="vg-dialog__title">{{ shortId(preview.id) }} · {{ label(preview.category) }}</span>
          <button type="button" class="vg-icon-btn" aria-label="关闭" @click="preview = null"><X :size="16" /></button>
        </header>
        <div class="vg-dialog__body pmw-preview"><CloudImage :file-id="preview.fileId" /></div>
        <footer class="vg-dialog__foot">
          <button type="button" class="vg-btn vg-btn--ghost" @click="deleteItems([preview], true); preview = null"><Trash2 :size="14" /> 删除</button>
          <button type="button" class="vg-btn vg-btn--primary" @click="exportItems([preview])"><Download :size="14" /> 下载</button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.pm-tile__img :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.pm-source-grid__item :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.pm-tile__pending { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; width: 100%; height: 100%; padding: 8px; color: var(--theme-text-muted); font-size: 11.5px; text-align: center; }
.pmw-pick { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; max-height: 60vh; overflow: auto; }
.pmw-pick__item { position: relative; display: flex; flex-direction: column; gap: 4px; padding: 6px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); color: var(--theme-text); cursor: pointer; }
.pmw-pick__item.is-on { border-color: var(--vg-accent); box-shadow: 0 0 0 1px var(--vg-accent) inset; }
.pmw-pick__item :deep(img), .pmw-pick__item :deep(video) { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; }
.pmw-pick__item span { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.pmw-pick__check { position: absolute; top: 10px; right: 10px; padding: 2px; border-radius: 50%; background: var(--vg-accent); color: #fff; }
.pmw-preview { display: grid; place-items: center; max-height: 70vh; }
.pmw-preview :deep(img) { max-width: 100%; max-height: 66vh; object-fit: contain; }
</style>
