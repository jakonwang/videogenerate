<script setup lang="ts">
import { thumbnailUrl } from '@/lib/localMedia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Archive, ArrowLeft, Check, ChevronRight, CirclePause, Clock3, Copy, Download, FolderOpen, ImagePlus, Images, LoaderCircle, Package, Pencil, Play, Plus, RefreshCw, Replace, RotateCcw, Save, Sparkles, TriangleAlert, Upload, X } from 'lucide-vue-next'
import { openAssetLibraryPicker } from '@/lib/assetLibraryPicker'
import ProductSelectDialog from '@/ui/components/ProductSelectDialog.vue'
import { useRouter } from 'vue-router'

type Product = { id: string; name: string; coverImagePath?: string; images: Array<{ filePath: string; fileName: string }> }
type PromptVersion = { id: string; name: string; version: number; prompt: string; promptHash: string; active: boolean }
type ImageInput = { path: string; name: string }
type Batch = { id: string; status: string; createdAt: number; productName: string; promptVersion: number; prompt: string; productImagePaths: string[]; items: Array<{ id: string; sourceName: string; status: string; outputPath?: string; exportedAt?: number; error?: string }> }

const { t, locale } = useI18n()
const k = (key: string) => t(`productReplacement.${key}`)
const router = useRouter()
const products = ref<Product[]>([])
const batches = ref<Batch[]>([])
const selectedResultIds = ref<string[]>([])
const prompts = ref<PromptVersion[]>([])
const productId = ref('')
const productName = ref('')
const productImages = ref<string[]>([])
const productSource = ref<'system' | 'upload' | ''>('')
const sourceImages = ref<ImageInput[]>([])
const variantCount = ref(1)
const promptId = ref('')
const promptName = ref('')
const promptText = ref('')
const busy = ref(false)
const showPrompts = ref(false)
const showProductDialog = ref(false)
const dragging = ref(false)
const notice = ref('')
const error = ref('')
const promptLoadError = ref(false)
const activePrompt = computed(() => prompts.value.find((item) => item.id === promptId.value) || prompts.value.find((item) => item.active))
const totalJobs = computed(() => sourceImages.value.length * variantCount.value)
const exportableItems = computed(() => batches.value.flatMap((batch) => batch.items.filter((item) => item.outputPath).map((item) => ({ batch, item }))))
const selectedExportCount = computed(() => exportableItems.value.filter(({ item }) => selectedResultIds.value.includes(item.id)).length)
const allExportableSelected = computed(() => exportableItems.value.length > 0 && selectedExportCount.value === exportableItems.value.length)
const promptDirty = computed(() => {
  const saved = prompts.value.find((item) => item.id === promptId.value)
  return saved ? saved.prompt !== promptText.value || saved.name !== promptName.value : Boolean(promptText.value.trim())
})

const FILTERS = ['all', 'completed', 'processing', 'failed'] as const
type Filter = (typeof FILTERS)[number]
const filter = ref<Filter>('all')
function matchesFilter(status: string, name: Filter) {
  if (name === 'all') return true
  if (name === 'processing') return ['queued', 'processing', 'running', 'paused'].includes(status)
  return status === name
}
const filterCounts = computed(() => {
  const items = batches.value.flatMap((batch) => batch.items)
  return Object.fromEntries(FILTERS.map((name) => [name, items.filter((item) => matchesFilter(item.status, name)).length])) as Record<Filter, number>
})
const visibleBatches = computed(() => batches.value
  .map((batch) => ({ ...batch, total: batch.items.length, items: batch.items.filter((item) => matchesFilter(item.status, filter.value)) }))
  .filter((batch) => batch.items.length))
function statusTone(status: string) {
  if (status === 'completed') return 'vg-pill--green'
  if (status === 'failed') return 'vg-pill--red'
  if (status === 'partial_failed' || status === 'paused') return 'vg-pill--amber'
  return status === 'cancelled' ? '' : 'vg-pill--blue'
}
function formatTime(value: number) {
  return value ? new Date(value).toLocaleString(locale.value, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
}

function fileNameFromPath(path: string) {
  const normalized = String(path || '').replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1) || 'product-image'
}
function normalizeProducts(list: unknown): Product[] {
  if (!Array.isArray(list)) return []
  return list.map((item) => {
    const row = (item || {}) as {
      id?: string
      name?: string
      coverImagePath?: string
      images?: Array<{ filePath?: string; fileName?: string; isCover?: boolean }>
      assets?: Record<string, Array<{ filePath?: string; fileName?: string }>>
    }
    const rawImages = Array.isArray(row.images)
      ? row.images
      : Object.values(row.assets || {}).flat()
    const images = rawImages
      .filter((image) => Boolean(image?.filePath))
      .map((image) => ({ filePath: String(image.filePath), fileName: String(image.fileName || fileNameFromPath(String(image.filePath))) }))
    const coverImagePath = row.coverImagePath || images.find((image) => image.filePath)?.filePath
    return {
      id: String(row.id || ''),
      name: String(row.name || row.id || 'Unnamed product'),
      coverImagePath,
      images,
    }
  }).filter((item) => item.id)
}
async function load() {
  const [productResult, batchResult, promptResult] = await Promise.allSettled([
    window.api.products.list(),
    window.api.productReplacement.listBatches(),
    window.api.productReplacement.listPromptVersions(),
  ])
  if (productResult.status === 'fulfilled') products.value = normalizeProducts(productResult.value)
  if (batchResult.status === 'fulfilled') {
    batches.value = batchResult.value as Batch[]
    const availableIds = new Set(batches.value.flatMap((batch) => batch.items.filter((item) => item.outputPath).map((item) => item.id)))
    selectedResultIds.value = selectedResultIds.value.filter((id) => availableIds.has(id))
  }
  if (promptResult.status === 'rejected') {
    promptLoadError.value = true
    return
  }
  promptLoadError.value = false
  const promptList = promptResult.value as PromptVersion[]
  prompts.value = promptList
  if (!promptId.value) {
    let draft: { id?: string; name?: string; prompt?: string } = {}
    try { draft = JSON.parse(localStorage.getItem('product-replacement-prompt-draft') || '{}') } catch { /* Ignore invalid local drafts. */ }
    const selected = promptList.find((item) => item.id === draft.id) || promptList.find((item) => item.active) || promptList[0]
    if (selected) {
      promptId.value = selected.id
      promptName.value = draft.id === selected.id && draft.name ? draft.name : selected.name
      promptText.value = draft.id === selected.id && typeof draft.prompt === 'string' && draft.prompt.trim() ? draft.prompt : selected.prompt
    }
  }
  if (!products.value.length) {
    try { products.value = normalizeProducts(await window.api.productReplacement.listProducts()) }
    catch { /* Product loading must not block prompt versions. */ }
  }
}
watch([promptId, promptName, promptText], ([id, name, prompt]) => {
  localStorage.setItem('product-replacement-prompt-draft', JSON.stringify({ id, name, prompt }))
}, { flush: 'sync' })
function selectProduct(id: string) {
  const product = products.value.find((item) => item.id === id)
  if (!product) return
  productId.value = id
  productName.value = product.name
  productSource.value = 'system'
  const images = [...new Set([product.coverImagePath, ...product.images.map((item) => item.filePath)].filter((item): item is string => Boolean(item)))]
  productImages.value = images.slice(0, 4)
}
function openProductDialog() {
  showProductDialog.value = true
}
async function addLocalImages() {
  error.value = ''
  const items = await window.api.productReplacement.pickImages() as ImageInput[]
  sourceImages.value = [...sourceImages.value, ...items].filter((item, index, all) => all.findIndex((other) => other.path === item.path) === index)
}
async function addProductImages() {
  error.value = ''
  try {
    const items = await window.api.productReplacement.pickImages() as ImageInput[]
    if (!items.length) return
    const uploadedPaths = items.map((item) => item.path)
    const paths = productSource.value === 'upload' ? [...productImages.value, ...uploadedPaths] : uploadedPaths
    productImages.value = [...new Set(paths)].slice(0, 4)
    productId.value = ''
    productName.value = t('productReplacement.customProduct')
    productSource.value = 'upload'
  } catch (cause) {
    error.value = String((cause as Error)?.message || cause)
  }
}
async function addLibraryImages() {
  const selected = await openAssetLibraryPicker({ type: 'image', multiple: true, usagePlugin: 'product-replacement' })
  if (selected) sourceImages.value = [...sourceImages.value, ...selected.map((item) => ({ path: item.filePath, name: item.name }))]
    .filter((item, index, all) => all.findIndex((other) => other.path === item.path) === index)
}
async function submit() {
  error.value = ''; notice.value = ''
  if (!productImages.value.length || !sourceImages.value.length || !activePrompt.value) {
    error.value = t('productReplacement.validation')
    return
  }
  busy.value = true
  try {
    await window.api.productReplacement.createBatch({
      productId: productId.value || undefined,
      productName: String(productName.value || ''),
      productImagePaths: productImages.value.map((path) => String(path)),
      sourceImages: sourceImages.value.map((item) => ({ path: String(item.path), name: String(item.name) })),
      variantCount: Number(variantCount.value),
      promptVersionId: promptId.value || undefined,
    })
    sourceImages.value = []
    notice.value = t('productReplacement.batchCreated')
    await load()
  } catch (cause) { error.value = String((cause as Error)?.message || cause) }
  finally { busy.value = false }
}
async function savePrompt() {
  if (!promptText.value.trim()) return
  busy.value = true
  try {
    const saved = await window.api.productReplacement.savePromptVersion({ id: promptId.value || undefined, name: promptName.value, prompt: promptText.value }) as PromptVersion
    prompts.value = await window.api.productReplacement.listPromptVersions() as PromptVersion[]
    promptId.value = saved.id
    notice.value = t('productReplacement.promptSaved')
  } catch (cause) { error.value = String((cause as Error)?.message || cause) }
  finally { busy.value = false }
}
async function activatePrompt(item: PromptVersion) {
  await window.api.productReplacement.activatePromptVersion(item.id)
  promptId.value = item.id; promptName.value = item.name; promptText.value = item.prompt
  prompts.value = await window.api.productReplacement.listPromptVersions() as PromptVersion[]
}
function editPrompt(item: PromptVersion) {
  promptId.value = item.id; promptName.value = item.name; promptText.value = item.prompt
}
function newPrompt() {
  promptId.value = ''; promptName.value = `${k('promptName')} ${prompts.value.length + 1}`; promptText.value = ''
}
async function rollbackPrompt(item: PromptVersion) {
  const restored = await window.api.productReplacement.rollbackPromptVersion(item.id) as PromptVersion
  await load(); promptId.value = restored.id; promptName.value = restored.name; promptText.value = restored.prompt
}
async function copyPrompt(item: PromptVersion) {
  const copied = await window.api.productReplacement.savePromptVersion({ name: `${item.name} Copy`, prompt: item.prompt }) as PromptVersion
  await load(); promptId.value = copied.id; promptName.value = copied.name; promptText.value = copied.prompt
}
async function batchAction(action: 'pauseBatch' | 'resumeBatch' | 'cancelBatch' | 'retryFailed', id: string) {
  await window.api.productReplacement[action](id)
  await load()
}
async function exportBatch(batch: Batch) {
  const paths = batch.items.filter((item) => item.outputPath).map((item) => item.outputPath!)
  if (!paths.length) return
  const result = await window.api.productReplacement.exportResults(paths) as { canceled?: boolean }
  if (!result?.canceled) await load()
}
function toggleResultSelection(itemId: string) {
  selectedResultIds.value = selectedResultIds.value.includes(itemId)
    ? selectedResultIds.value.filter((id) => id !== itemId)
    : [...selectedResultIds.value, itemId]
}
function toggleAllExportable() {
  selectedResultIds.value = allExportableSelected.value ? [] : exportableItems.value.map(({ item }) => item.id)
}
async function exportSelectedResults() {
  const paths = exportableItems.value.filter(({ item }) => selectedResultIds.value.includes(item.id)).map(({ item }) => item.outputPath!)
  if (paths.length) {
    const result = await window.api.productReplacement.exportResults(paths) as { canceled?: boolean }
    if (!result?.canceled) await load()
  }
}
function onFiles(event: DragEvent) {
  dragging.value = false
  const files = [...(event.dataTransfer?.files || [])]
  const paths = files.map((file) => window.api.getPathForFile(file)).filter(Boolean)
  if (paths.length) void window.api.productReplacement.importPaths(paths).then((items: ImageInput[]) => { sourceImages.value = [...sourceImages.value, ...items] })
}
function openLocation(path: string) {
  void window.api.shell.showItemInFolder(path)
}
let refreshTimer: ReturnType<typeof setInterval> | null = null
function hasActiveReplacementWork() {
  return batches.value.some((batch) => ['queued', 'processing', 'running'].includes(batch.status)
    || batch.items.some((item) => ['queued', 'processing', 'running'].includes(item.status)))
}
onMounted(() => {
  void load()
  refreshTimer = window.setInterval(() => {
    if (document.hidden || !hasActiveReplacementWork()) return
    void load()
  }, 4000)
})
onUnmounted(() => { if (refreshTimer) window.clearInterval(refreshTimer) })
</script>

<template>
  <main class="vg-scope vg-page ps-page">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><Replace :size="20" /></span>
      <div class="vg-page-head__text"><h1>{{ k('title') }}</h1><p>{{ k('description') }}</p></div>
      <div class="vg-page-head__actions">
        <button type="button" class="vg-btn vg-btn--ghost" @click="router.push('/plugins')"><ArrowLeft :size="15" />{{ k('backToPlugins') }}</button>
        <button type="button" class="vg-btn" @click="showPrompts = true"><Archive :size="15" />{{ k('promptManagement') }}</button>
      </div>
    </header>

    <div class="ps-work">
      <section class="vg-card ps-card">
        <header class="ps-card__head"><span class="ps-step">1</span><h2>{{ k('targetProduct') }}</h2><span class="ps-card__meta">{{ productImages.length }} / 4</span></header>
        <button type="button" class="ps-product" @click="openProductDialog">
          <span class="ps-product__cover"><img v-if="productImages[0]" :src="thumbnailUrl(productImages[0], 120)" alt="" /><Package v-else :size="22" :stroke-width="1.5" /></span>
          <span class="ps-product__copy"><strong>{{ productName || k('chooseProduct') }}</strong><small>{{ productSource ? k('changeProduct') : k('selectFromProducts') }}</small></span>
          <ChevronRight :size="16" />
        </button>
        <div class="ps-card__label"><span>{{ k('referenceImages') }}</span><button type="button" class="vg-link" @click="addProductImages">{{ k('uploadProduct') }}</button></div>
        <div class="ps-refs">
          <div v-for="path in productImages" :key="path" class="ps-ref"><img :src="thumbnailUrl(path, 160)" decoding="async" alt="" /><button type="button" :aria-label="k('remove')" :title="k('remove')" @click="productImages = productImages.filter((item) => item !== path)"><X :size="12" /></button></div>
          <button v-for="slot in 4 - productImages.length" :key="`slot-${slot}`" type="button" class="ps-ref ps-ref--add" :aria-label="k('uploadProduct')" :title="k('uploadProduct')" @click="addProductImages"><Plus :size="16" /></button>
        </div>
        <p class="ps-hint">{{ k('noProductImage') }}</p>
      </section>

      <section class="vg-card ps-card">
        <header class="ps-card__head"><span class="ps-step">2</span><h2>{{ k('sceneImages') }}</h2><span class="ps-card__meta">{{ sourceImages.length }} {{ k('images') }}</span></header>
        <div class="ps-drop" :class="{ 'is-drop': dragging, 'is-filled': sourceImages.length }" @dragover.prevent="dragging = true" @dragleave.self="dragging = false" @drop.prevent="onFiles">
          <span v-if="!sourceImages.length" class="ps-drop__art"><ImagePlus :size="30" :stroke-width="1.5" /></span>
          <div class="ps-drop__copy"><strong>{{ k('dropTitle') }}</strong><small>{{ k('dropDescription') }}</small></div>
          <div class="ps-drop__actions">
            <button type="button" class="vg-btn vg-btn--soft" @click="addLocalImages"><Upload :size="15" />{{ k('uploadScenes') }}</button>
            <button type="button" class="vg-btn" @click="addLibraryImages"><Images :size="15" />{{ k('fromLibrary') }}</button>
          </div>
        </div>
        <div v-if="sourceImages.length" class="ps-scenes">
          <figure v-for="(item, index) in sourceImages" :key="item.path" class="ps-scene" :title="item.name"><img :src="thumbnailUrl(item.path, 160)" loading="lazy" decoding="async" :alt="item.name" /><button type="button" :aria-label="k('remove')" :title="k('remove')" @click="sourceImages.splice(index, 1)"><X :size="12" /></button></figure>
        </div>
      </section>

      <aside class="vg-card ps-card ps-confirm">
        <header class="ps-card__head"><span class="ps-step">3</span><h2>{{ k('confirmTitle') }}</h2></header>
        <dl class="ps-sum">
          <div><dt>{{ k('product') }}</dt><dd :class="{ 'is-empty': !productName }">{{ productName || k('notSelected') }}</dd></div>
          <div><dt>{{ k('referenceImages') }}</dt><dd>{{ productImages.length }}</dd></div>
          <div><dt>{{ k('sceneImages') }}</dt><dd>{{ sourceImages.length }}</dd></div>
          <div><dt>{{ k('prompt') }}</dt><dd><button type="button" class="vg-link ps-prompt-link" :title="activePrompt?.name" @click="showPrompts = true"><span>{{ activePrompt ? `V${activePrompt.version} · ${activePrompt.name}` : k('notSelected') }}</span><Pencil :size="12" /></button></dd></div>
        </dl>
        <div class="ps-card__label"><span>{{ k('variantsPerImage') }}</span></div>
        <div class="ps-seg" role="group" :aria-label="k('variantsPerImage')"><button v-for="count in 4" :key="count" type="button" :class="{ 'is-picked': variantCount === count }" :aria-pressed="variantCount === count" @click="variantCount = count">{{ count }}</button></div>
        <div class="ps-go">
          <div class="ps-total"><span>{{ k('estimatedTasks') }}</span><strong>{{ totalJobs }}</strong></div>
          <p v-if="promptLoadError" class="ps-msg ps-msg--error">{{ k('promptLoadFailed') }}</p>
          <p v-if="notice" class="ps-msg" role="status">{{ notice }}</p>
          <p v-if="error" class="ps-msg ps-msg--error" role="alert">{{ error }}</p>
          <button type="button" class="vg-btn vg-btn--primary ps-run" :disabled="busy || !productImages.length || !sourceImages.length" @click="submit"><LoaderCircle v-if="busy" :size="16" class="vg-spin" /><Sparkles v-else :size="16" />{{ busy ? k('processing') : k('start') }}</button>
          <p class="ps-hint">{{ k('modelNote') }}</p>
        </div>
      </aside>
    </div>

    <section class="vg-card ps-history">
      <header class="ps-history__head">
        <div><h2>{{ k('taskHistory') }}</h2><p>{{ k('historyDescription') }}</p></div>
        <div class="ps-history__actions">
          <label v-if="exportableItems.length" class="ps-check"><input type="checkbox" :checked="allExportableSelected" @change="toggleAllExportable" />{{ k('selectExportable') }}</label>
          <button type="button" class="vg-btn" @click="load"><RefreshCw :size="15" />{{ k('refresh') }}</button>
          <button type="button" class="vg-btn" :class="{ 'vg-btn--primary': selectedExportCount }" :disabled="!selectedExportCount" @click="exportSelectedResults"><Download :size="15" />{{ k('batchExport') }}<template v-if="selectedExportCount"> ({{ selectedExportCount }})</template></button>
        </div>
      </header>
      <nav class="vg-tabs">
        <button v-for="name in FILTERS" :key="name" type="button" class="vg-tabs__btn" :class="{ 'is-active': filter === name }" :aria-pressed="filter === name" @click="filter = name">{{ name === 'all' ? k('allResults') : k(`status.${name}`) }}<span class="vg-count">{{ filterCounts[name] }}</span></button>
      </nav>

      <article v-for="batch in visibleBatches" :key="batch.id" class="ps-batch">
        <header class="ps-batch__head">
          <span class="ps-batch__cover"><img v-if="batch.productImagePaths[0]" :src="thumbnailUrl(batch.productImagePaths[0], 80)" loading="lazy" decoding="async" alt="" /><Package v-else :size="16" /></span>
          <div class="ps-batch__copy"><strong>{{ batch.productName }}</strong><small>{{ formatTime(batch.createdAt) }} · V{{ batch.promptVersion }} · {{ batch.total }} {{ k('tasks') }}</small></div>
          <span class="vg-pill vg-pill--dot" :class="statusTone(batch.status)">{{ t(`productReplacement.status.${batch.status}`, batch.status) }}</span>
          <div class="ps-batch__actions">
            <button v-if="['processing', 'queued'].includes(batch.status)" type="button" class="vg-icon-btn" :title="k('pause')" :aria-label="k('pause')" @click="batchAction('pauseBatch', batch.id)"><CirclePause :size="16" /></button>
            <button v-if="batch.status === 'paused'" type="button" class="vg-icon-btn" :title="k('resume')" :aria-label="k('resume')" @click="batchAction('resumeBatch', batch.id)"><Play :size="16" /></button>
            <button v-if="['failed', 'partial_failed'].includes(batch.status)" type="button" class="vg-btn vg-btn--sm" @click="batchAction('retryFailed', batch.id)"><RotateCcw :size="13" />{{ k('retryFailed') }}</button>
            <button v-if="batch.items.some((item) => item.outputPath)" type="button" class="vg-icon-btn" :title="k('export')" :aria-label="k('export')" @click="exportBatch(batch)"><Download :size="16" /></button>
          </div>
        </header>
        <div class="ps-results">
          <figure v-for="item in batch.items" :key="item.id" class="ps-result" :class="{ 'is-picked': selectedResultIds.includes(item.id) }">
            <div class="ps-result__media">
              <img v-if="item.outputPath" :src="thumbnailUrl(item.outputPath, 320)" loading="lazy" decoding="async" :alt="item.sourceName" @click="toggleResultSelection(item.id)" />
              <div v-else class="ps-result__wait" :class="{ 'is-failed': item.status === 'failed' }">
                <TriangleAlert v-if="item.status === 'failed'" :size="20" :stroke-width="1.6" /><LoaderCircle v-else-if="item.status === 'processing'" :size="20" class="vg-spin" /><Clock3 v-else :size="20" :stroke-width="1.6" />
                <span>{{ t(`productReplacement.status.${item.status}`, item.status) }}</span><small v-if="item.error" :title="item.error">{{ item.error }}</small>
              </div>
              <template v-if="item.outputPath">
                <input type="checkbox" class="ps-result__check" :checked="selectedResultIds.includes(item.id)" :aria-label="`${k('selectResult')}: ${item.sourceName}`" @change="toggleResultSelection(item.id)" />
                <span class="ps-result__tools"><button type="button" :title="k('openLocation')" :aria-label="k('openLocation')" @click="openLocation(item.outputPath)"><FolderOpen :size="15" /></button><button type="button" :title="k('export')" :aria-label="k('export')" @click="exportBatch({ ...batch, items: [item] })"><Download :size="15" /></button></span>
                <span v-if="item.exportedAt" class="ps-result__badge"><Check :size="11" />{{ k('exported') }}</span>
              </template>
            </div>
            <figcaption :title="item.sourceName">{{ item.sourceName }}</figcaption>
          </figure>
        </div>
      </article>
      <div v-if="!visibleBatches.length" class="vg-empty"><span class="vg-empty__icon"><Images :size="24" /></span><p>{{ batches.length ? k('noFiltered') : k('noBatches') }}</p></div>
    </section>

    <div v-if="showPrompts" class="vg-backdrop ps-drawer-mask" @click.self="showPrompts = false" @keydown.esc="showPrompts = false">
      <section class="ps-drawer" role="dialog" aria-modal="true" :aria-label="k('promptManagement')">
        <header class="ps-drawer__head"><h2>{{ k('promptManagement') }}</h2><button type="button" class="vg-icon-btn" :aria-label="k('close')" @click="showPrompts = false"><X :size="16" /></button></header>
        <div class="ps-drawer__body">
          <label class="vg-field"><span class="vg-field__label">{{ k('promptName') }}</span><input v-model="promptName" class="vg-input" /></label>
          <label class="vg-field"><span class="vg-field__label">{{ k('prompt') }}</span><textarea v-model="promptText" class="vg-textarea" rows="11" :placeholder="k('promptPlaceholder')" /></label>
          <div class="ps-drawer__save"><small>{{ promptDirty ? k('promptDirty') : '' }}</small><button type="button" class="vg-btn" :class="{ 'vg-btn--primary': promptDirty }" :disabled="busy || !promptText.trim()" @click="savePrompt"><Save :size="14" />{{ k('saveVersion') }}</button></div>
          <p v-if="error" class="ps-msg ps-msg--error" role="alert">{{ error }}</p>
          <div class="ps-card__label ps-drawer__versions"><span>{{ k('manageVersions') }}</span><button type="button" class="vg-link" @click="newPrompt">{{ k('newPrompt') }}</button></div>
          <div v-for="item in prompts" :key="item.id" class="ps-version" :class="{ 'is-picked': item.id === promptId }">
            <button type="button" class="ps-version__main" :title="k('edit')" @click="editPrompt(item)"><strong>V{{ item.version }} · {{ item.name }}</strong><small>{{ item.promptHash.slice(0, 12) }}</small></button>
            <span v-if="item.active" class="vg-pill vg-pill--accent">{{ k('active') }}</span>
            <button v-else type="button" class="vg-btn vg-btn--xs" @click="activatePrompt(item)">{{ k('activate') }}</button>
            <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="k('copy')" :aria-label="k('copy')" @click="copyPrompt(item)"><Copy :size="13" /></button>
            <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="k('rollback')" :aria-label="k('rollback')" @click="rollbackPrompt(item)"><RotateCcw :size="13" /></button>
          </div>
        </div>
      </section>
    </div>
    <ProductSelectDialog :open="showProductDialog" :products="products" :selected-id="productId" @close="showProductDialog = false" @select="selectProduct" />
  </main>
</template>

<style scoped>
.ps-page { gap: 14px; }
.ps-work { display: grid; grid-template-columns: minmax(280px, .85fr) minmax(340px, 1.25fr) 320px; gap: 14px; align-items: stretch; }
.ps-card { display: flex; flex-direction: column; padding: 16px 18px 18px; }
.ps-card__head { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
.ps-page h2 { color: var(--theme-text); font-size: 15px; font-weight: 600; line-height: 1.3; }
.ps-step { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; background: color-mix(in srgb, var(--vg-accent) 16%, var(--theme-panel)); color: var(--vg-accent); font-size: 12px; font-weight: 700; }
.ps-card__meta { margin-left: auto; color: var(--theme-text-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.ps-card__label { display: flex; justify-content: space-between; align-items: center; margin: 16px 0 8px; color: var(--theme-text-secondary); font-size: 12.5px; }
.ps-hint { margin-top: 10px; color: var(--theme-text-muted); font-size: 12px; line-height: 1.6; }

.ps-product { display: flex; gap: 12px; align-items: center; width: 100%; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-input); color: var(--theme-text-muted); text-align: left; cursor: pointer; transition: border-color .15s, background .15s; }
.ps-product:hover { border-color: var(--vg-accent-line); background: var(--theme-panel-soft); }
.ps-product__cover { display: grid; place-items: center; flex: none; width: 56px; height: 56px; overflow: hidden; border-radius: 8px; background: var(--theme-panel-soft); color: var(--vg-accent); }
.ps-product__cover img, .ps-batch__cover img { width: 100%; height: 100%; object-fit: cover; }
.ps-product__copy { display: grid; flex: 1; gap: 3px; min-width: 0; }
.ps-product__copy strong { overflow: hidden; color: var(--theme-text); font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.ps-product__copy small { font-size: 12px; }
.ps-refs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.ps-ref, .ps-scene { position: relative; aspect-ratio: 1; min-width: 0; margin: 0; overflow: hidden; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-panel-soft); }
.ps-ref img, .ps-scene img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ps-ref > button, .ps-scene > button { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 5px; background: rgba(0, 0, 0, .62); color: #fff; cursor: pointer; opacity: 0; transition: opacity .15s; }
:is(.ps-ref, .ps-scene):hover > button, :is(.ps-ref, .ps-scene) > button:focus-visible { opacity: 1; }
.ps-ref--add { display: grid; place-items: center; padding: 0; border-style: dashed; border-color: var(--theme-border-control); background: transparent; color: var(--theme-text-muted); cursor: pointer; transition: border-color .15s, color .15s; }
.ps-ref--add:hover { border-color: var(--vg-accent); color: var(--vg-accent); }

.ps-drop { display: flex; flex: 1; flex-direction: column; gap: 14px; align-items: center; justify-content: center; min-height: 220px; padding: 20px 16px; border: 1px dashed color-mix(in srgb, var(--vg-accent) 30%, var(--theme-border)); border-radius: 10px; text-align: center; transition: border-color .15s, background .15s; }
.ps-drop.is-drop { border-color: var(--vg-accent); background: color-mix(in srgb, var(--vg-accent) 7%, transparent); }
.ps-drop__art { display: grid; place-items: center; width: 68px; height: 68px; border-radius: 20px; background: radial-gradient(circle, color-mix(in srgb, var(--vg-accent) 24%, transparent), transparent 72%); color: var(--vg-accent); }
.ps-drop__copy { display: grid; gap: 4px; }
.ps-drop__copy strong { color: var(--theme-text); font-size: 14px; font-weight: 600; }
.ps-drop__copy small { color: var(--theme-text-muted); font-size: 12px; }
.ps-drop__actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.ps-drop.is-filled { flex: none; flex-flow: row wrap; justify-content: space-between; min-height: 0; padding: 12px 14px; text-align: left; }
.ps-scenes { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; max-height: 260px; margin-top: 12px; overflow: auto; scrollbar-width: thin; }

.ps-confirm { background: linear-gradient(170deg, color-mix(in srgb, var(--vg-accent) 8%, var(--theme-panel)), var(--theme-panel) 46%); }
.ps-sum { margin: 0; }
.ps-sum > div { display: flex; gap: 16px; justify-content: space-between; align-items: center; min-height: 36px; border-bottom: 1px solid var(--theme-divider); }
.ps-sum dt { flex: none; color: var(--theme-text-muted); }
.ps-sum dd { min-width: 0; margin: 0; overflow: hidden; color: var(--theme-text); font-weight: 600; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
.ps-sum dd.is-empty { color: var(--theme-text-muted); font-weight: 400; }
.ps-prompt-link { display: flex; gap: 6px; align-items: center; max-width: 100%; font-size: 13px; }
.ps-prompt-link span { overflow: hidden; text-overflow: ellipsis; }
.ps-prompt-link svg { flex: none; }
.ps-seg { display: grid; grid-template-columns: repeat(4, 1fr); padding: 3px; border-radius: 8px; background: var(--theme-panel-soft); }
.ps-seg button { height: 28px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--theme-text-secondary); font-size: 13px; font-variant-numeric: tabular-nums; cursor: pointer; }
.ps-seg button:hover { color: var(--theme-text); }
.ps-seg button.is-picked { background: color-mix(in srgb, var(--vg-accent) 26%, var(--theme-panel)); box-shadow: 0 0 0 1px var(--vg-accent-line); color: var(--theme-text); font-weight: 600; }
.ps-go { margin-top: auto; padding-top: 16px; }
.ps-total { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; color: var(--theme-text-secondary); }
.ps-total strong { color: var(--theme-text); font-size: 22px; font-weight: 700; line-height: 1.2; font-variant-numeric: tabular-nums; }
.ps-run { width: 100%; height: 40px; font-size: 14px; }
.ps-run:disabled { border-color: transparent; background: var(--theme-control-hover); color: var(--theme-text-muted); opacity: 1; }
.ps-msg { margin-bottom: 8px; color: var(--vg-accent); font-size: 12px; }
.ps-msg--error { color: var(--vg-red); overflow-wrap: anywhere; }

.ps-history { padding: 16px 18px 18px; }
.ps-history__head { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center; }
.ps-history__head p { margin-top: 2px; color: var(--theme-text-muted); font-size: 12px; }
.ps-history__actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ps-check { display: inline-flex; gap: 8px; align-items: center; margin-right: 8px; color: var(--theme-text-secondary); cursor: pointer; }
.ps-history .vg-tabs { margin-top: 6px; overflow: visible; }
.ps-batch { padding: 16px 0 4px; }
.ps-batch + .ps-batch { margin-top: 14px; border-top: 1px solid var(--theme-divider); }
.ps-batch__head { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
.ps-batch__cover { display: grid; place-items: center; flex: none; width: 36px; height: 36px; overflow: hidden; border-radius: 8px; background: var(--theme-panel-soft); color: var(--theme-text-muted); }
.ps-batch__copy { display: grid; min-width: 0; }
.ps-batch__copy strong { overflow: hidden; font-size: 13.5px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.ps-batch__copy small { color: var(--theme-text-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.ps-batch__actions { display: flex; gap: 4px; align-items: center; margin-left: auto; }
.ps-results { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.ps-result { min-width: 0; margin: 0; }
.ps-result__media { position: relative; aspect-ratio: 3 / 4; overflow: hidden; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); transition: border-color .15s, box-shadow .15s; }
.ps-result:hover .ps-result__media { border-color: var(--theme-border-control); }
.ps-result.is-picked .ps-result__media { border-color: var(--vg-accent); box-shadow: 0 0 0 1px var(--vg-accent); }
.ps-result__media > img { display: block; width: 100%; height: 100%; object-fit: cover; cursor: pointer; }
.ps-result__wait { display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; height: 100%; padding: 12px; color: var(--theme-text-muted); font-size: 12px; text-align: center; }
.ps-result__wait.is-failed { color: var(--vg-red); }
.ps-result__wait small { display: -webkit-box; max-width: 100%; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 4; color: var(--theme-text-muted); font-size: 11px; overflow-wrap: anywhere; }
.ps-result .ps-result__check { position: absolute; top: 8px; left: 8px; width: 17px; height: 17px; opacity: 0; transition: opacity .15s; }
.ps-result:hover .ps-result__check, .ps-result.is-picked .ps-result__check, .ps-result .ps-result__check:focus-visible { opacity: 1; }
.ps-result__tools { position: absolute; top: 6px; right: 6px; display: flex; gap: 4px; opacity: 0; transition: opacity .15s; }
.ps-result:hover .ps-result__tools, .ps-result__tools:focus-within { opacity: 1; }
.ps-result__tools button { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: rgba(0, 0, 0, .62); color: #fff; cursor: pointer; }
.ps-result__tools button:hover { background: rgba(0, 0, 0, .85); }
.ps-result__badge { position: absolute; bottom: 8px; left: 8px; display: inline-flex; gap: 4px; align-items: center; padding: 2px 7px; border-radius: 5px; background: rgba(0, 0, 0, .62); color: #fff; font-size: 11px; }
.ps-result figcaption { margin-top: 6px; overflow: hidden; color: var(--theme-text-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }

.ps-drawer-mask { align-items: stretch; justify-content: flex-end; padding: var(--app-titlebar-height, 0) 0 0; }
.ps-drawer { display: flex; flex-direction: column; width: min(500px, 100%); border-left: 1px solid var(--theme-border-control); background: var(--theme-panel); box-shadow: var(--theme-shadow-dialog); }
.ps-drawer__head { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--theme-divider); }
.ps-drawer__body { display: flex; flex: 1; flex-direction: column; min-height: 0; padding: 18px 20px; overflow: auto; scrollbar-width: thin; }
.ps-drawer__body > * { flex: none; }
.ps-drawer__body .vg-field + .vg-field { margin-top: 14px; }
.ps-drawer__save { display: flex; gap: 12px; justify-content: space-between; align-items: center; margin-top: 12px; }
.ps-drawer__save small { color: var(--vg-amber); font-size: 12px; }
.ps-drawer__body .ps-drawer__versions { margin-top: 24px; }
.ps-version { display: flex; gap: 6px; align-items: center; padding: 8px 10px; border: 1px solid transparent; border-radius: 8px; }
.ps-version:hover { background: var(--theme-panel-soft); }
.ps-version.is-picked { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); }
.ps-version__main { display: grid; flex: 1; min-width: 0; padding: 0; border: 0; background: none; color: var(--theme-text); text-align: left; cursor: pointer; }
.ps-version__main strong { overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.ps-version__main small { color: var(--theme-text-muted); font-size: 11px; }
.ps-page button:focus-visible { outline: 2px solid var(--vg-accent); outline-offset: 2px; }

@media (max-width: 1180px) { .ps-work { grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); } .ps-confirm { grid-column: 1 / -1; } }
@media (max-width: 760px) { .ps-work { grid-template-columns: minmax(0, 1fr); } }
@media (hover: none) { .ps-ref > button, .ps-scene > button, .ps-result .ps-result__check, .ps-result__tools { opacity: 1; } }
</style>
