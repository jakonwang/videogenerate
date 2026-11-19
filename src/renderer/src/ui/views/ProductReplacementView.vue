<script setup lang="ts">
import { thumbnailUrl } from '@/lib/localMedia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Archive, ArrowLeft, Check, CheckCircle2, ChevronDown, CirclePause, Download, ImagePlus, Images, MoreHorizontal, Package, Play, Plus, RefreshCw, RotateCcw, Save, Sparkles, Upload, X } from 'lucide-vue-next'
import { openAssetLibraryPicker } from '@/lib/assetLibraryPicker'
import ProductSelectDialog from '@/ui/components/ProductSelectDialog.vue'
import { useRouter } from 'vue-router'

type Product = { id: string; name: string; coverImagePath?: string; images: Array<{ filePath: string; fileName: string }> }
type PromptVersion = { id: string; name: string; version: number; prompt: string; promptHash: string; active: boolean }
type ImageInput = { path: string; name: string }
type Batch = { id: string; status: string; productName: string; promptVersion: number; prompt: string; productImagePaths: string[]; items: Array<{ id: string; sourceName: string; status: string; outputPath?: string; exportedAt?: number; error?: string }> }

const { t } = useI18n()
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
const notice = ref('')
const error = ref('')
const promptLoadError = ref(false)
const activePrompt = computed(() => prompts.value.find((item) => item.id === promptId.value) || prompts.value.find((item) => item.active))
const selectedProduct = computed(() => products.value.find((item) => item.id === productId.value))
const totalJobs = computed(() => sourceImages.value.length * variantCount.value)
const resultCount = computed(() => batches.value.reduce((sum, batch) => sum + batch.items.filter((item) => item.status === 'completed').length, 0))
const resultTotal = computed(() => batches.value.reduce((sum, batch) => sum + batch.items.length, 0))
const resultImageCount = computed(() => batches.value.reduce((sum, batch) => sum + batch.items.filter((item) => item.outputPath).length, 0))
const exportableItems = computed(() => batches.value.flatMap((batch) => batch.items.filter((item) => item.outputPath).map((item) => ({ batch, item }))))
const selectedExportCount = computed(() => exportableItems.value.filter(({ item }) => selectedResultIds.value.includes(item.id)).length)
const allExportableSelected = computed(() => exportableItems.value.length > 0 && selectedExportCount.value === exportableItems.value.length)
const completedBatches = computed(() => batches.value.filter((batch) => batch.status === 'completed').length)

function src(path: string) { return /^(https?:|data:|blob:|vg:)/i.test(path) ? path : `vg://file?path=${encodeURIComponent(path)}` }
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
  <main class="replacement-page plugin-workspace-standard">
    <header class="page-header hero-banner">
      <button type="button" class="back-button" @click="router.push('/plugins')"><ArrowLeft :size="15" />{{ t('productReplacement.backToPlugins') }}</button>
      <div class="hero-copy"><span class="eyebrow" aria-hidden="true"><Sparkles :size="14" /></span><h1>{{ t('productReplacement.title') || '商品替换' }}</h1><p>{{ t('productReplacement.description') }}</p></div>
      <div class="hero-visual" aria-hidden="true">
        <span class="hero-frame hero-frame-source"><img v-if="productImages[0]" :src="src(productImages[0])" /></span>
        <span class="hero-arrow"><Sparkles :size="18" /></span>
        <span class="hero-frame hero-frame-result"><img v-if="productImages[1] || productImages[0]" :src="src(productImages[1] || productImages[0])" /></span>
      </div>
      <button class="icon-button hero-action" :title="t('productReplacement.promptManagement')" @click="showPrompts = !showPrompts"><Archive :size="17" /></button>
    </header>

    <div class="workspace-grid">
      <section class="setup-column">
        <section class="work-section content-card target-section">
          <div class="section-heading"><div><span class="step">01</span><h2>{{ t('productReplacement.targetProduct') }}</h2></div><span class="section-meta">{{ productImages.length }}/4</span></div>
          <div class="product-select-row">
            <button class="product-picker-card" type="button" @click="openProductDialog">
              <span v-if="selectedProduct?.coverImagePath" class="product-picker-cover"><img :src="src(selectedProduct.coverImagePath)" :alt="selectedProduct.name" /></span>
              <span v-else class="product-picker-cover product-picker-placeholder"><Package :size="19" /></span>
              <span class="product-picker-copy"><small>{{ t('productReplacement.systemProduct') }}</small><strong>{{ selectedProduct?.name || t('productReplacement.chooseProduct') }}</strong><em>{{ selectedProduct ? t('productReplacement.changeProduct') : t('productReplacement.selectFromProducts') }}</em></span>
              <ChevronDown :size="17" class="product-picker-chevron" />
            </button>
            <button type="button" class="secondary-button upload-product-button" @click="addProductImages"><span class="upload-product-icon"><Upload :size="16" /></span><span>{{ t('productReplacement.uploadProduct') }}</span></button>
          </div>
          <div v-if="selectedProduct" class="product-selection-meta"><span>{{ t('productReplacement.selectedProduct') }}</span><strong>{{ productImages.length }}/4 {{ t('productReplacement.referenceImagesShort') }}</strong><button type="button" class="text-button" @click="openProductDialog">{{ t('productReplacement.changeProduct') }}</button></div>
          <div class="thumb-strip">
            <div v-for="path in productImages" :key="path" class="thumb product-thumb"><img :src="thumbnailUrl(path, 160)" decoding="async" /><button :title="t('productReplacement.remove')" @click="productImages = productImages.filter((item) => item !== path)"><X :size="13" /></button></div>
            <button v-if="productImages.length < 4" type="button" class="add-thumb" @click="addProductImages"><Plus :size="17" /></button>
            <span v-if="!productImages.length" class="empty-inline"><Package :size="17" />{{ t('productReplacement.noProductImage') }}</span>
          </div>
        </section>

        <section class="work-section content-card scene-section">
          <div class="section-heading"><div><span class="step">02</span><h2>{{ t('productReplacement.sceneImages') }}</h2></div><span class="section-meta">{{ sourceImages.length }} {{ t('productReplacement.images') }}</span></div>
          <div class="drop-zone" @dragover.prevent @drop.prevent="onFiles"><div class="drop-icon"><ImagePlus :size="21" /></div><strong>{{ t('productReplacement.dropTitle') }}</strong><span>{{ t('productReplacement.dropDescription') }}</span><div class="drop-actions"><button class="primary-button" @click="addLocalImages"><Upload :size="15" />{{ t('productReplacement.uploadScenes') }}</button><button class="secondary-button" @click="addLibraryImages">{{ t('productReplacement.fromLibrary') }}</button></div></div>
          <div v-if="sourceImages.length" class="source-list"><div v-for="(item, index) in sourceImages" :key="item.path" class="source-row"><img :src="thumbnailUrl(item.path, 96)" loading="lazy" decoding="async" /><span>{{ item.name }}</span><small>{{ String(index + 1).padStart(2, '0') }}</small><button :title="t('productReplacement.remove')" @click="sourceImages.splice(index, 1)"><X :size="14" /></button></div></div>
        </section>

        <section class="work-section content-card prompt-section">
          <div class="section-heading"><div><span class="prompt-heading-icon"><Save :size="16" /></span><h2>{{ t('productReplacement.prompt') }}</h2></div><button class="text-button" @click="showPrompts = !showPrompts">{{ t('productReplacement.manageVersions') }}<ChevronDown :size="14" /></button></div>
          <div class="prompt-editor">
            <div class="prompt-settings">
              <label class="field-label">{{ t('productReplacement.activeVersion') }}<span class="prompt-select-wrap"><select v-model="promptId" :disabled="!prompts.length" @change="() => { const item = prompts.find((row) => row.id === promptId); if (item) { promptName = item.name; promptText = item.prompt } }"><option v-for="item in prompts" :key="item.id" :value="item.id">V{{ item.version }} · {{ item.name }}{{ item.active ? ` · ${t('productReplacement.active')}` : '' }}</option></select><ChevronDown :size="16" aria-hidden="true" /></span></label>
              <p v-if="promptLoadError" class="prompt-error">{{ t('productReplacement.promptLoadFailed') }}</p>
              <div class="prompt-actions"><input v-model="promptName" :placeholder="t('productReplacement.promptName')" /><button class="secondary-button" :disabled="busy" @click="savePrompt"><Save :size="14" />{{ t('productReplacement.saveVersion') }}</button></div>
            </div>
            <textarea v-model="promptText" rows="5" :placeholder="t('productReplacement.promptPlaceholder')" />
          </div>
        </section>
      </section>

      <aside class="confirm-column">
        <div class="confirm-sticky">
          <div class="confirm-title"><div><span class="step">03</span><span>{{ t('productReplacement.confirmTitle') }}</span></div><Sparkles :size="16" /></div>
          <div class="summary-row"><span>{{ t('productReplacement.product') }}</span><strong>{{ productName || t('productReplacement.notSelected') }}</strong></div>
          <div class="summary-row"><span>{{ t('productReplacement.referenceImages') }}</span><strong>{{ productImages.length }}</strong></div>
          <div class="summary-row"><span>{{ t('productReplacement.sceneImages') }}</span><strong>{{ sourceImages.length }}</strong></div>
          <label class="field-label variant-field">{{ t('productReplacement.variantsPerImage') }}<select v-model.number="variantCount"><option :value="1">1</option><option :value="2">2</option><option :value="3">3</option><option :value="4">4</option></select></label>
          <div class="estimate"><span>{{ t('productReplacement.estimatedTasks') }}</span><strong>{{ totalJobs }}</strong></div>
          <button class="run-button" :disabled="busy || !productImages.length || !sourceImages.length" @click="submit"><span>{{ busy ? t('productReplacement.processing') : t('productReplacement.start') }}</span><Sparkles :size="16" /></button>
          <p class="model-note">{{ t('productReplacement.modelNote') }}</p>
          <p v-if="notice" class="notice">{{ notice }}</p><p v-if="error" class="error">{{ error }}</p>
        </div>
      </aside>
    </div>

    <section class="results-section generation-history">
      <header class="history-heading"><div class="history-title"><span class="history-icon"><Images :size="25" /></span><div><h2>{{ t('productReplacement.taskHistory') }}</h2><p>{{ t('productReplacement.historyDescription') }}</p></div></div><div class="result-metric"><Check :size="15" />{{ resultTotal }} {{ t('productReplacement.historyRecords') }}</div></header>
      <div class="history-toolbar"><div class="history-tabs"><button class="is-active" type="button"><CheckCircle2 :size="18" /><span>{{ t('productReplacement.allResults') }}</span><strong>{{ resultTotal }}</strong></button><button type="button"><Images :size="18" /><span>{{ t('productReplacement.imageResults') }}</span><strong>{{ resultImageCount }}</strong></button><label class="select-exportable"><input type="checkbox" :checked="allExportableSelected" :disabled="!exportableItems.length" @change="toggleAllExportable" /><span>{{ t('productReplacement.selectExportable') }}</span><strong>{{ selectedExportCount }}</strong></label></div><div class="history-actions"><button type="button" title="刷新" @click="load"><RefreshCw :size="17" /><span>刷新</span></button><button type="button" title="批量导出" :disabled="!selectedExportCount" @click="exportSelectedResults"><Download :size="17" /><span>{{ t('productReplacement.batchExport') }} ({{ selectedExportCount }})</span></button></div></div>
      <div v-if="batches.length" class="batch-list">
        <article v-for="batch in batches" :key="batch.id" class="batch-block history-batch">
          <div v-for="item in batch.items" :key="item.id" class="history-result-card">
            <label v-if="item.outputPath" class="result-select"><input type="checkbox" :checked="selectedResultIds.includes(item.id)" :aria-label="`${t('productReplacement.selectResult')}: ${item.sourceName}`" @change="toggleResultSelection(item.id)" /></label>
            <span v-else class="result-select-placeholder" aria-hidden="true"></span>
            <div class="history-preview">
              <img v-if="item.outputPath" :src="thumbnailUrl(item.outputPath, 320)" loading="lazy" decoding="async" :title="t('productReplacement.openLocation')" @click="openLocation(item.outputPath)" />
              <div v-else class="result-placeholder"><span v-if="item.status === 'failed'">!</span><span v-else class="loader"></span></div>
            </div>
            <div class="history-product-info">
              <strong>{{ batch.productName }}</strong>
              <small>V{{ batch.promptVersion }} · {{ batch.items.length }} {{ t('productReplacement.tasks') }}</small>
            </div>
            <div class="history-result-info">
              <span class="status-label" :class="`status-${item.status}`">{{ t(`productReplacement.status.${item.status}`, item.status) }}</span>
              <strong>{{ item.sourceName }}</strong>
              <span v-if="item.exportedAt" class="exported-label"><Check :size="12" />{{ t('productReplacement.exported') }}</span>
              <small v-if="item.error" class="error">{{ item.error }}</small>
            </div>
            <div class="history-result-actions">
              <button v-if="batch.status === 'processing' || batch.status === 'queued'" :title="t('productReplacement.pause')" @click="batchAction('pauseBatch', batch.id)"><CirclePause :size="16" /></button>
              <button v-if="batch.status === 'paused'" :title="t('productReplacement.resume')" @click="batchAction('resumeBatch', batch.id)"><Play :size="16" /></button>
              <button v-if="['failed','partial_failed'].includes(batch.status)" :title="t('productReplacement.retryFailed')" @click="batchAction('retryFailed', batch.id)"><RotateCcw :size="16" /></button>
              <button v-if="item.outputPath" type="button" :title="t('productReplacement.openLocation')" @click="openLocation(item.outputPath)"><Images :size="17" /></button>
              <button v-if="item.outputPath" type="button" :title="t('productReplacement.export')" @click="exportBatch({ ...batch, items: [item] })"><Download :size="17" /></button>
              <button type="button" title="更多"><MoreHorizontal :size="18" /></button>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="empty-state"><Sparkles :size="22" /><span>{{ t('productReplacement.noBatches') }}</span></div>
    </section>

    <div v-if="showPrompts" class="prompt-drawer"><div class="drawer-head"><strong>{{ t('productReplacement.promptManagement') }}</strong><button class="icon-button" @click="showPrompts = false"><X :size="16" /></button></div><div v-for="item in prompts" :key="item.id" class="version-row"><div><strong>V{{ item.version }} · {{ item.name }}</strong><small>{{ item.promptHash.slice(0, 12) }}<span v-if="item.active"> · {{ t('productReplacement.active') }}</span></small></div><div><button :disabled="item.active" @click="activatePrompt(item)">{{ item.active ? t('productReplacement.active') : t('productReplacement.activate') }}</button><button @click="promptName = item.name; promptText = item.prompt; promptId = item.id">{{ t('productReplacement.edit') }}</button><button :title="t('productReplacement.copy')" @click="copyPrompt(item)"><Plus :size="14" /></button><button :title="t('productReplacement.rollback')" @click="rollbackPrompt(item)"><RotateCcw :size="14" /></button></div></div><button class="secondary-button drawer-new" @click="promptId = ''; promptName = `${t('productReplacement.promptName')} ${prompts.length + 1}`; promptText = ''; showPrompts = false"> <Plus :size="14" />{{ t('productReplacement.newPrompt') }}</button></div>
    <ProductSelectDialog :open="showProductDialog" :products="products" :selected-id="productId" @close="showProductDialog = false" @select="selectProduct" />
  </main>
</template>

<style scoped>
.replacement-page{--ink:var(--theme-text);--muted:var(--theme-text-muted);--line:var(--theme-border);--paper:var(--theme-panel);--wash:var(--theme-panel-soft);--green:var(--theme-accent);--green-soft:color-mix(in srgb, var(--theme-accent) 14%, transparent);max-width:1440px;margin:0 auto;padding:30px 34px 50px;color:var(--ink)}
.page-header,.results-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.eyebrow{display:flex;align-items:center;gap:7px;color:var(--green);font-size:11px;font-weight:750;text-transform:uppercase}.page-header h1{margin:9px 0 5px;font-size:27px;line-height:1.2}.page-header p{margin:0;color:var(--muted);font-size:13px}.icon-button,.batch-controls button{width:34px;height:34px;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px;background:var(--theme-panel);color:var(--theme-text-muted);cursor:pointer}.workspace-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;align-items:start;gap:30px;margin-top:27px}.setup-column{min-width:0}.work-section{padding:21px 0 22px;border-top:1px solid var(--line)}.section-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:17px}.section-heading>div{display:flex;align-items:center;gap:11px}.section-heading h2{margin:0;font-size:15px}.step{font-size:10px;color:var(--green);font-weight:800;letter-spacing:0}.section-meta{font-size:11px;color:var(--muted)}.product-select-row{display:flex;align-items:end;gap:12px}.field-label{display:grid;gap:7px;color:var(--theme-text-muted);font-size:11px;font-weight:650}.field-label select,.prompt-actions input,.variant-field select{min-height:39px;padding:0 11px;border:1px solid var(--line);border-radius:7px;background:var(--theme-panel);color:var(--ink);font-size:12px;outline:none}.product-select-row .field-label{flex:1}.secondary-button,.primary-button{min-height:37px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 12px;border:1px solid var(--line);border-radius:7px;background:white;color:var(--theme-text-muted);font-size:11px;font-weight:650;cursor:pointer}.primary-button{border-color:var(--green);background:var(--green);color:var(--theme-text)}.secondary-button:hover{background:var(--wash)}.thumb-strip{display:flex;align-items:center;gap:9px;min-height:93px;margin-top:14px}.thumb{position:relative;width:74px;height:74px;overflow:hidden;border:1px solid var(--line);border-radius:7px;background:var(--wash)}.thumb img,.source-row img,.result-item>img{width:100%;height:100%;object-fit:cover}.product-thumb button,.source-row button{position:absolute;right:4px;top:4px;width:22px;height:22px;display:grid;place-items:center;border:0;border-radius:5px;background:color-mix(in srgb, var(--theme-panel-soft) 80%, transparent);color:white;cursor:pointer}.add-thumb{width:74px;height:74px;display:grid;place-items:center;border:1px dashed var(--theme-border);border-radius:7px;background:var(--theme-panel);color:var(--green);cursor:pointer}.empty-inline{display:flex;align-items:center;gap:8px;color:var(--theme-text-secondary);font-size:11px}.drop-zone{min-height:190px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;border:1px dashed var(--theme-border);border-radius:9px;background:var(--theme-panel);text-align:center}.drop-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:10px;background:var(--green-soft);color:var(--green)}.drop-zone strong{font-size:12px}.drop-zone>span{color:var(--muted);font-size:11px}.drop-actions{display:flex;gap:8px;margin-top:7px}.source-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:12px}.source-row{position:relative;min-width:0;height:54px;display:flex;align-items:center;gap:9px;padding:6px 8px;border:1px solid var(--line);border-radius:7px}.source-row img{width:40px;height:40px;border-radius:4px}.source-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:11px}.source-row small{color:var(--theme-text-secondary);font-size:9px}.source-row button{position:static;background:transparent;color:var(--muted)}.text-button{display:flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--green);font-size:11px;cursor:pointer}.prompt-section textarea{width:100%;resize:vertical;padding:11px;border:1px solid var(--line);border-radius:7px;color:var(--theme-text);font:12px/1.6 inherit;outline-color:var(--green)}.prompt-section>.field-label{margin-bottom:12px}.prompt-actions{display:flex;gap:8px;margin-top:9px}.prompt-actions input{flex:1}.confirm-column{position:relative}.confirm-sticky{position:sticky;top:22px;padding:19px 18px;border:1px solid var(--line);border-radius:9px;background:var(--theme-panel);box-shadow:0 8px 25px #14251b0a}.confirm-title{display:flex;justify-content:space-between;align-items:center;padding-bottom:15px;border-bottom:1px solid var(--line);font-size:14px;font-weight:750}.confirm-title svg{color:var(--green)}.summary-row{display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid var(--theme-border);color:var(--muted);font-size:11px}.summary-row strong{max-width:165px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink);font-weight:650}.variant-field{margin-top:15px}.variant-field select{width:100%}.estimate{display:flex;justify-content:space-between;align-items:center;margin:17px 0 13px;padding:12px;border-radius:7px;background:var(--wash);color:var(--muted);font-size:11px}.estimate strong{color:var(--green);font-size:20px}.run-button{width:100%;height:43px;display:flex;align-items:center;justify-content:center;gap:10px;border:0;border-radius:7px;background:var(--green);color:var(--theme-text);font-size:12px;font-weight:750;cursor:pointer}.run-button:disabled{opacity:.45;cursor:not-allowed}.model-note{margin:11px 0 0;color:var(--theme-text-secondary);text-align:center;font-size:10px;line-height:1.5}.notice,.error{margin:9px 0 0;color:var(--green);font-size:11px}.error{color:var(--theme-tone-red)}.results-section{margin-top:16px;padding-top:24px;border-top:1px solid var(--line)}.results-header{align-items:end;margin-bottom:15px}.results-header h2{margin:5px 0 0;font-size:18px}.result-metric{display:flex;align-items:center;gap:5px;color:var(--green);font-size:11px}.batch-list{display:grid;gap:12px}.batch-block{border:1px solid var(--line);border-radius:8px;background:white}.batch-header{min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 14px;border-bottom:1px solid var(--theme-border)}.batch-identity,.batch-controls{display:flex;align-items:center;gap:10px}.batch-mark{width:32px;height:32px;display:grid;place-items:center;border-radius:7px;background:var(--green-soft);color:var(--green)}.batch-identity>div{display:grid;gap:3px}.batch-identity strong{font-size:12px}.batch-identity small{color:var(--muted);font-size:10px}.batch-controls{gap:5px}.batch-controls button{width:30px;height:30px}.status-label{padding:5px 8px;border-radius:5px;background:var(--wash);color:var(--theme-text-muted);font-size:10px}.status-completed{background:var(--green-soft);color:var(--green)}.status-failed,.status-partial_failed{background:var(--theme-panel);color:var(--theme-tone-red)}.result-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px;padding:13px}.result-item{min-width:0;display:grid;grid-template-columns:62px minmax(0,1fr);gap:9px;align-items:center}.result-item>img,.result-placeholder{width:62px;height:62px;border-radius:5px;background:var(--wash);object-fit:cover}.result-item>div:last-child{min-width:0;display:grid;gap:4px}.result-item strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.result-item small{color:var(--muted);font-size:9px}.result-item .error{white-space:normal;overflow-wrap:anywhere}.result-placeholder{display:grid;place-items:center;color:var(--theme-tone-red)}.loader{width:17px;height:17px;border:2px solid var(--theme-border);border-top-color:var(--green);border-radius:50%;animation:spin .8s linear infinite}.empty-state{min-height:130px;display:flex;align-items:center;justify-content:center;gap:9px;border:1px dashed var(--line);border-radius:8px;color:var(--muted);font-size:12px}.prompt-drawer{position:fixed;z-index:100;top:58px;right:20px;width:min(470px,calc(100vw - 30px));max-height:calc(100vh - 80px);overflow:auto;padding:16px;border:1px solid var(--line);border-radius:9px;background:var(--theme-panel);box-shadow:0 20px 60px #14251b24}.drawer-head,.version-row,.version-row>div:last-child{display:flex;align-items:center;justify-content:space-between;gap:8px}.drawer-head{margin-bottom:10px;font-size:13px}.version-row{padding:12px 0;border-top:1px solid var(--line)}.version-row>div:first-child{min-width:0;display:grid;gap:4px}.version-row strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.version-row small{color:var(--muted);font-size:9px}.version-row button{min-height:29px;display:flex;align-items:center;gap:4px;padding:0 7px;border:1px solid var(--line);border-radius:5px;background:var(--theme-panel);color:var(--theme-text-muted);font-size:9px;cursor:pointer}.version-row button:disabled{color:var(--green)}.drawer-new{width:100%;margin-top:10px}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:1000px){.workspace-grid{grid-template-columns:minmax(0,1fr) 280px;gap:18px}.result-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.replacement-page{padding:24px}}
@media(max-width:720px){.replacement-page{padding:18px 14px 35px}.page-header h1{font-size:23px}.workspace-grid{grid-template-columns:1fr}.confirm-column{grid-row:1}.confirm-sticky{position:static}.source-list{grid-template-columns:1fr}.result-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.batch-header{align-items:flex-start;flex-direction:column}.batch-controls{align-self:flex-end}.prompt-actions{flex-wrap:wrap}.prompt-actions input{min-width:100%}}
.replacement-page{--ink:var(--theme-text);--muted:var(--theme-text-muted);--line:var(--theme-border);--paper:var(--theme-panel);--wash:var(--theme-panel-soft);--green:var(--theme-accent);--green-soft:var(--theme-accent-soft);color:var(--theme-text)}
.icon-button,.batch-controls button{border-color:var(--theme-border-control);background:var(--theme-control);color:var(--theme-text-secondary)}
.icon-button:hover,.batch-controls button:hover{border-color:var(--theme-accent);background:var(--theme-control-hover);color:var(--theme-text)}
.field-label{color:var(--theme-text-secondary)}
.field-label select,.prompt-actions input,.variant-field select,.prompt-section textarea{border-color:var(--theme-border-control);background:var(--theme-input);color:var(--theme-text)}
.field-label select:focus,.prompt-actions input:focus,.prompt-section textarea:focus{border-color:var(--theme-accent);outline-color:var(--theme-accent)}
.field-label select option{background:var(--theme-panel);color:var(--theme-text)}
.secondary-button{border-color:var(--theme-border-control);background:var(--theme-control);color:var(--theme-text-secondary)}
.secondary-button:hover{border-color:var(--theme-accent);background:var(--theme-control-hover);color:var(--theme-text)}
.thumb,.add-thumb{border-color:var(--theme-border-control);background:var(--theme-panel-soft);color:var(--theme-text-secondary)}
.add-thumb:hover{border-color:var(--theme-accent);color:var(--theme-accent)}
.product-thumb button{background:var(--theme-overlay);color:var(--theme-text)}
.drop-zone{border-color:var(--theme-border-control);background:var(--theme-panel-soft);color:var(--theme-text)}
.drop-zone:hover{border-color:var(--theme-accent);background:var(--theme-control-hover)}
.drop-icon,.batch-mark{background:var(--theme-accent-soft);color:var(--theme-accent)}
.source-row,.batch-block{border-color:var(--theme-border);background:var(--theme-panel)}
.source-row button{color:var(--theme-text-muted)}
.source-row button:hover{color:var(--theme-text);background:var(--theme-control-hover)}
.prompt-section textarea::placeholder,.prompt-actions input::placeholder{color:var(--theme-text-muted)}
.confirm-sticky{border-color:var(--theme-border);background:var(--theme-panel);box-shadow:var(--theme-shadow-float)}
.confirm-title,.batch-header{border-color:var(--theme-divider)}
.summary-row{border-color:var(--theme-divider);color:var(--theme-text-muted)}
.summary-row strong,.batch-identity strong,.result-item strong,.version-row strong{color:var(--theme-text)}
.estimate{background:var(--theme-panel-soft);color:var(--theme-text-secondary)}
.model-note,.section-meta,.drop-zone>span,.batch-identity small,.result-item small,.version-row small{color:var(--theme-text-muted)}
.notice{color:var(--theme-success-text)}
.error,.status-failed,.status-partial_failed{color:var(--theme-danger-text)}
.status-failed,.status-partial_failed{background:var(--theme-danger-soft)}
.status-completed{background:var(--theme-success-soft);color:var(--theme-success-text)}
.status-label{background:var(--theme-control);color:var(--theme-text-secondary)}
.result-placeholder,.empty-state{background:var(--theme-panel-soft);color:var(--theme-text-muted)}
.empty-state{border-color:var(--theme-border-control)}
.loader{border-color:var(--theme-border-control);border-top-color:var(--theme-accent)}
.prompt-drawer{border-color:var(--theme-border);background:var(--theme-panel);box-shadow:var(--theme-shadow-dialog);color:var(--theme-text)}
.version-row{border-color:var(--theme-divider)}
.version-row button{border-color:var(--theme-border-control);background:var(--theme-control);color:var(--theme-text-secondary)}
.version-row button:hover:not(:disabled){border-color:var(--theme-accent);background:var(--theme-control-hover);color:var(--theme-text)}
.version-row button:disabled{color:var(--theme-control-selected-text)}
.product-picker-card{width:100%;min-width:0;min-height:82px;display:flex;align-items:center;gap:13px;padding:10px 14px;border:1px solid var(--theme-border-control);border-radius:10px;background:var(--theme-panel);color:var(--theme-text);text-align:left;cursor:pointer;transition:border-color .16s ease,background-color .16s ease}
.product-picker-card:hover{border-color:var(--theme-accent);background:var(--theme-control-hover)}
.product-picker-cover{width:58px;height:58px;flex:0 0 58px;display:grid;place-items:center;overflow:hidden;border-radius:7px;background:var(--theme-panel-soft);color:var(--theme-text-muted)}
.product-picker-cover img{width:100%;height:100%;object-fit:cover}
.product-picker-copy{min-width:0;flex:1;display:grid;gap:3px}
.product-picker-copy small,.product-picker-copy em{color:var(--theme-text-muted);font-size:10px;font-style:normal}
.product-picker-copy strong{overflow:hidden;color:var(--theme-text);font-size:13px;text-overflow:ellipsis;white-space:nowrap}
.product-picker-chevron{flex:none;color:var(--theme-text-muted)}
.product-selection-meta{display:flex;align-items:center;gap:8px;margin-top:10px;color:var(--theme-text-muted);font-size:11px}
.product-selection-meta strong{color:var(--theme-text-secondary);font-weight:650}
.product-selection-meta .text-button{margin-left:auto}
@media(max-width:640px){.product-select-row{align-items:stretch;flex-direction:column}.product-select-row>.secondary-button{align-self:flex-start}.product-selection-meta{flex-wrap:wrap}}
.replacement-page{width:100%;max-width:none;margin:0;padding:4px 0 28px;background:var(--theme-shell);color:var(--theme-text)}
.replacement-page .page-header{margin:0 0 14px}.replacement-page .workspace-grid{grid-template-columns:minmax(0,1fr) 360px;gap:14px;margin-top:0}.replacement-page .content-card{box-shadow:none;border-radius:14px}.replacement-page .content-card+.content-card{margin-top:14px}.replacement-page .confirm-sticky{box-shadow:none;border-radius:14px}.replacement-page .results-section{margin-top:14px}.replacement-page .hero-banner{border-radius:14px;box-shadow:none}
.replacement-page .hero-banner:after{opacity:.28}.replacement-page .hero-visual{right:86px}.replacement-page .page-header h1{font-size:30px}.replacement-page .page-header p{font-size:12px}
@media(max-width:1050px){.replacement-page .workspace-grid{grid-template-columns:minmax(0,1fr) 320px}.replacement-page .hero-visual{right:56px}}
@media(max-width:720px){.replacement-page{padding:0 0 22px}.replacement-page .workspace-grid{grid-template-columns:1fr}.replacement-page .hero-banner{margin-bottom:12px}.replacement-page .confirm-column{grid-row:1}}
.hero-banner{position:relative;min-height:164px;align-items:center;overflow:hidden;padding:26px 48px;border:1px solid var(--theme-border);border-radius:17px;background:var(--theme-panel-soft);box-shadow:var(--theme-shadow-float)}
.back-button{position:absolute;z-index:3;top:14px;left:16px;display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid var(--theme-border-control);border-radius:7px;background:var(--theme-control);color:var(--theme-text-secondary);font-size:11px;cursor:pointer}.back-button:hover{border-color:var(--theme-accent);background:var(--theme-control-hover);color:var(--theme-text)}
.hero-banner:after{content:"";position:absolute;right:9%;top:-52%;width:48%;height:210%;background:var(--theme-accent-soft);opacity:.42;transform:rotate(-25deg);pointer-events:none}
.hero-copy{position:relative;z-index:1;max-width:560px;padding-top:18px}.hero-copy h1{font-size:31px;font-weight:780;letter-spacing:-.5px}.hero-copy p{max-width:520px;line-height:1.6}
.hero-visual{position:absolute;z-index:1;right:100px;top:17px;width:330px;height:130px;transform:rotate(-2deg)}
.hero-frame{position:absolute;display:grid;place-items:center;overflow:hidden;border:2px solid var(--theme-text);border-radius:17px;background:var(--theme-control);box-shadow:0 12px 28px #0005;transform:rotate(-7deg)}.hero-frame img{width:100%;height:100%;object-fit:cover}.hero-frame-source{left:25px;top:17px;width:100px;height:108px}.hero-frame-result{right:10px;top:8px;width:125px;height:116px;transform:rotate(8deg);border-color:var(--theme-accent)}.hero-arrow{position:absolute;z-index:2;left:137px;top:48px;width:42px;height:42px;display:grid;place-items:center;border-radius:50%;background:var(--theme-accent);color:var(--theme-on-accent);box-shadow:0 8px 20px #0004}.hero-spark{position:absolute;z-index:3;color:var(--theme-accent);font-size:24px;font-weight:800}.hero-spark-one{left:1px;top:12px}.hero-spark-two{right:0;top:3px;font-size:18px}.hero-action{position:relative;z-index:2;align-self:flex-start}
.content-card{padding:20px 24px 22px;border:1px solid var(--theme-border);border-radius:17px;background:var(--theme-panel);box-shadow:var(--theme-shadow-float)}.content-card+.content-card{margin-top:18px}.content-card .section-heading{margin-bottom:18px}.step{width:29px;height:29px;display:grid;place-items:center;border-radius:50%;background:var(--theme-accent);color:var(--theme-on-accent);font-size:11px}.section-heading h2{font-size:17px;font-weight:760}.content-card .section-meta{font-size:12px;color:var(--theme-text-secondary)}
.product-picker-card{background:var(--theme-control);border-color:var(--theme-border-control)}.product-picker-card:hover{background:var(--theme-control-hover)}.thumb-strip{min-height:84px}.thumb,.add-thumb{width:82px;height:82px;border-radius:10px}.add-thumb{border-style:dashed}.drop-zone{min-height:198px;border-radius:13px;background:var(--theme-panel-soft)}.drop-icon{width:45px;height:45px;border-radius:12px}.drop-zone strong{font-size:14px}.drop-zone>span{font-size:12px}.primary-button{background:var(--theme-accent);border-color:var(--theme-accent);color:var(--theme-on-accent)}
.upload-product-button{width:128px;min-height:82px;flex:0 0 128px;flex-direction:column;gap:7px;border-radius:10px;background:var(--theme-control);border-color:var(--theme-border-control);color:var(--theme-text-secondary);font-size:11px;line-height:1.25}
.upload-product-button:hover{border-color:var(--theme-accent);background:var(--theme-control-hover);color:var(--theme-text)}
.upload-product-icon{width:28px;height:28px;display:grid;place-items:center;border:1px solid var(--theme-border-control);border-radius:8px;background:var(--theme-panel-soft);color:var(--theme-accent)}
.prompt-select-wrap{position:relative;display:block}.prompt-select-wrap select{width:100%;appearance:none;padding-right:38px;color:var(--theme-text)}.prompt-select-wrap svg{position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--theme-text-secondary);stroke-width:2.25}.prompt-actions .secondary-button svg{flex:none;color:var(--theme-text);stroke-width:2.25}.prompt-error{margin:0 0 10px;color:var(--theme-danger-text);font-size:12px}
.confirm-sticky{padding:22px 20px;border-radius:17px;background:var(--theme-panel);border-color:var(--theme-accent);box-shadow:var(--theme-shadow-dialog)}.confirm-title{font-size:18px}.confirm-title:before{content:"";width:23px;height:23px;margin-right:7px;border:2px solid var(--theme-accent);border-radius:50%}.confirm-title{justify-content:flex-start}.confirm-title svg{margin-left:auto}.summary-row{padding:14px 0;font-size:12px}.summary-row strong{font-size:12px}.estimate{padding:15px;border-radius:11px;background:var(--theme-accent-soft)}.run-button{height:51px;border-radius:26px;background:var(--theme-accent);color:var(--theme-on-accent);font-size:13px}.results-section{margin-top:22px}
@media(max-width:1100px){.hero-visual{right:60px;transform:scale(.84) rotate(-2deg);transform-origin:right center}.hero-copy{max-width:55%}}
@media(max-width:720px){.hero-banner{min-height:190px;padding:24px}.hero-visual{right:-30px;bottom:-12px;top:auto;opacity:.52;transform:scale(.72) rotate(-2deg)}.hero-copy{max-width:100%;position:relative;z-index:2}.hero-copy h1{font-size:27px}.hero-action{position:absolute;right:15px;top:15px}.content-card{padding:18px 16px;border-radius:13px}.upload-product-button{width:auto;min-height:42px;flex:0 0 auto;flex-direction:row;gap:7px}}
.replacement-page{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;padding:0;background:transparent}
.replacement-page .hero-banner{flex:0 0 auto;min-height:72px;margin-bottom:12px;padding:11px 16px 11px 172px;border-radius:10px;background:var(--theme-panel)}
.replacement-page .hero-banner:after{display:none}
.replacement-page .hero-copy{max-width:none;padding:0}
.replacement-page .hero-copy .eyebrow{display:none}
.replacement-page .hero-visual{display:none}
.replacement-page .page-header h1{margin:0 0 3px;font-size:19px;letter-spacing:0}
.replacement-page .page-header p{font-size:11px;line-height:1.35}
.replacement-page .back-button{top:50%;left:16px;transform:translateY(-50%)}
.replacement-page .hero-action{align-self:center;margin-left:auto}
.replacement-page .workspace-grid{flex:0 0 auto;grid-template-columns:minmax(0,1fr) 264px;gap:12px}
.replacement-page .setup-column{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:stretch}
.replacement-page .content-card{min-width:0;padding:13px 14px;border-radius:10px}
.replacement-page .content-card+.content-card{margin-top:0}
.replacement-page .content-card .section-heading{margin-bottom:10px}
.replacement-page .section-heading h2{font-size:13px}
.replacement-page .step{width:23px;height:23px;font-size:9px}
.replacement-page .product-select-row{gap:7px}
.replacement-page .product-picker-card{min-height:64px;gap:8px;padding:7px}
.replacement-page .product-picker-cover{width:45px;height:45px;flex-basis:45px}
.replacement-page .product-picker-copy strong{font-size:11px}
.replacement-page .product-picker-copy small,.replacement-page .product-picker-copy em{font-size:9px}
.replacement-page .product-picker-chevron{width:13px}
.replacement-page .upload-product-button{width:83px;min-height:64px;flex-basis:83px;gap:4px;padding:5px;font-size:10px}
.replacement-page .upload-product-icon{width:23px;height:23px}
.replacement-page .product-selection-meta{margin-top:6px;font-size:10px}
.replacement-page .thumb-strip{min-height:54px;gap:6px;margin-top:8px}
.replacement-page .thumb,.replacement-page .add-thumb{width:50px;height:50px;border-radius:7px}
.replacement-page .drop-zone{min-height:126px;gap:4px;padding:8px}
.replacement-page .drop-icon{width:27px;height:27px;border-radius:7px}
.replacement-page .drop-icon svg{width:16px}
.replacement-page .drop-zone strong{font-size:11px}
.replacement-page .drop-zone>span{font-size:10px}
.replacement-page .drop-actions{margin-top:3px;gap:6px}
.replacement-page .drop-actions button{min-height:29px;padding:0 8px;font-size:10px}
.replacement-page .source-list{max-height:60px;overflow:auto;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:7px}
.replacement-page .source-row{height:42px;padding:4px}
.replacement-page .source-row img{width:32px;height:32px}
.replacement-page .prompt-section{grid-column:1 / -1}
.replacement-page .prompt-editor{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:12px;align-items:stretch}
.replacement-page .prompt-settings{min-width:0;display:flex;flex-direction:column;gap:9px}
.replacement-page .prompt-actions{min-width:0;margin:0}
.replacement-page .prompt-actions input{min-width:0}
.replacement-page .prompt-actions button{white-space:nowrap}
.replacement-page .prompt-section textarea{height:89px;min-height:89px;resize:none;line-height:1.45}
.replacement-page .confirm-sticky{position:static;height:100%;padding:14px;border-radius:10px}
.replacement-page .confirm-title{padding-bottom:8px;font-size:14px}
.replacement-page .confirm-title:before{display:none}
.replacement-page .summary-row{padding:7px 0;font-size:10px}
.replacement-page .summary-row strong{font-size:11px}
.replacement-page .variant-field{margin-top:8px}
.replacement-page .variant-field select{min-height:32px}
.replacement-page .estimate{margin:9px 0;padding:8px 10px;border-radius:7px}
.replacement-page .estimate strong{font-size:16px}
.replacement-page .run-button{height:37px;border-radius:7px;font-size:11px}
.replacement-page .model-note{margin-top:7px;font-size:9px}
.replacement-page .results-section{flex:1;min-height:115px;display:flex;flex-direction:column;margin-top:12px;padding-top:12px;overflow:hidden}
.replacement-page .results-header{flex:none;margin-bottom:8px}
.replacement-page .results-header .eyebrow{display:none}
.replacement-page .results-header h2{margin:0;font-size:14px}
.replacement-page .batch-list{min-height:0;overflow:auto}
.replacement-page .empty-state{flex:1;min-height:0}
@media(max-width:1000px){.replacement-page .workspace-grid{grid-template-columns:minmax(0,1fr) 244px}.replacement-page .setup-column{gap:8px}.replacement-page .content-card{padding:11px}}
@media(max-width:800px){.replacement-page{height:auto;overflow:visible}.replacement-page .workspace-grid{grid-template-columns:1fr}.replacement-page .confirm-column{grid-row:auto}.replacement-page .results-section{min-height:180px;overflow:visible}.replacement-page .batch-list{max-height:300px}.replacement-page .hero-banner{padding-left:16px;padding-top:37px}.replacement-page .back-button{top:7px;transform:none}}
@media(max-width:560px){.replacement-page .setup-column{grid-template-columns:1fr}.replacement-page .prompt-section{grid-column:auto}.replacement-page .prompt-editor{grid-template-columns:1fr}.replacement-page .hero-banner{min-height:100px}.replacement-page .upload-product-button{width:90px;flex-basis:90px;min-height:64px;flex-direction:column}}
@media(min-width:1200px){
  .replacement-page .hero-banner{min-height:108px;padding:18px 24px 18px 202px;border-radius:16px;background:linear-gradient(112deg,var(--theme-panel) 0%,color-mix(in srgb,var(--theme-panel) 80%,var(--theme-control-hover)) 62%,var(--theme-panel) 100%);box-shadow:inset 0 1px 0 #ffffff0b,0 12px 30px #0003}
  .replacement-page .hero-copy{padding-top:2px}
  .replacement-page .hero-copy .eyebrow{display:flex;position:absolute;left:-30px;top:4px;margin:0;font-size:0;color:var(--theme-text)}
  .replacement-page .hero-copy .eyebrow svg{width:20px;height:20px;stroke-width:2.3;color:var(--theme-text)}
  .replacement-page .page-header h1{font-size:28px;margin-bottom:5px}
  .replacement-page .page-header p{font-size:13px}
  .replacement-page .back-button{left:24px;min-height:42px;padding:0 15px;border-radius:22px;font-size:12px}
  .replacement-page .hero-action{margin-right:0}
  .replacement-page .hero-visual{display:block;position:absolute;right:126px;top:5px;width:330px;height:98px;opacity:.95;transform:rotate(-2deg)}
  .replacement-page .hero-frame{position:absolute;display:grid;place-items:center;overflow:hidden;border:2px solid var(--theme-text);border-radius:15px;background:var(--theme-control);box-shadow:0 10px 24px #0005}
  .replacement-page .hero-frame img{width:100%;height:100%;object-fit:cover}
  .replacement-page .hero-frame-source{left:30px;top:3px;width:84px;height:88px;transform:rotate(-8deg)}
  .replacement-page .hero-frame-result{right:18px;top:0;width:98px;height:92px;transform:rotate(8deg);border-color:var(--theme-accent)}
  .replacement-page .hero-arrow{position:absolute;z-index:2;left:143px;top:32px;width:37px;height:37px;display:grid;place-items:center;border-radius:50%;background:var(--theme-accent);color:var(--theme-on-accent);box-shadow:0 7px 16px #0004}
  .replacement-page .workspace-grid{grid-template-columns:minmax(0,1fr) 352px;gap:16px;margin-top:18px}
  .replacement-page .setup-column{grid-template-columns:1.08fr 1fr}
  .replacement-page .setup-column{gap:14px}
  .replacement-page .content-card{padding:17px 20px;border-radius:15px;background:linear-gradient(135deg,var(--theme-panel) 0%,color-mix(in srgb,var(--theme-panel) 91%,var(--theme-control-hover)) 100%);box-shadow:inset 0 1px 0 #ffffff08,0 12px 28px #0002}
  .replacement-page .content-card .section-heading{margin-bottom:13px}
  .replacement-page .section-heading h2{font-size:16px}
  .replacement-page .step{width:28px;height:28px;font-size:10px}
  .replacement-page .product-picker-card{min-height:84px;padding:10px 13px}
  .replacement-page .product-picker-cover{width:58px;height:58px;flex-basis:58px}
  .replacement-page .product-picker-copy strong{font-size:13px}
  .replacement-page .upload-product-button{width:118px;min-height:84px;flex-basis:118px;font-size:11px}
  .replacement-page .thumb-strip{min-height:76px;margin-top:11px}
  .replacement-page .thumb,.replacement-page .add-thumb{width:72px;height:72px}
  .replacement-page .drop-zone{min-height:182px}
  .replacement-page .drop-icon{width:40px;height:40px}
  .replacement-page .drop-icon svg{width:20px}
  .replacement-page .drop-zone strong{font-size:13px}
  .replacement-page .drop-zone>span{font-size:11px}
  .replacement-page .prompt-section{min-height:192px}
  .replacement-page .prompt-section textarea{height:112px;min-height:112px}
  .replacement-page .confirm-sticky{padding:19px 20px;border-radius:15px;background:linear-gradient(145deg,color-mix(in srgb,var(--theme-panel) 88%,var(--theme-control-hover)),var(--theme-panel));border-color:var(--theme-accent);box-shadow:0 0 0 1px #31e8c22b,0 14px 32px #0003}
  .replacement-page .confirm-title{font-size:17px;padding-bottom:13px}
  .replacement-page .summary-row{padding:11px 0;font-size:12px}
  .replacement-page .summary-row strong{font-size:12px}
  .replacement-page .variant-field{margin-top:13px}
  .replacement-page .variant-field select{min-height:40px}
  .replacement-page .estimate{margin:14px 0;padding:12px 13px}
  .replacement-page .run-button{height:48px;border-radius:24px;font-size:13px}
  .replacement-page .results-section{position:relative;flex:0 0 174px;height:174px;min-height:0;margin-top:17px;padding:14px 16px 10px;border:1px solid var(--theme-border);border-radius:16px;background:linear-gradient(115deg,var(--theme-panel) 0%,color-mix(in srgb,var(--theme-panel) 88%,var(--theme-control-hover)) 100%);overflow:hidden;box-sizing:border-box}
  .replacement-page .results-header{margin-bottom:12px}
  .replacement-page .results-header h2{font-size:17px}
  .replacement-page .empty-state{position:relative;z-index:1;min-height:112px;border-color:var(--theme-border-control);background:linear-gradient(180deg,color-mix(in srgb, var(--theme-text) 1%, transparent),color-mix(in srgb, var(--theme-input) 3%, transparent))}
  .replacement-page .results-section:after{content:"";position:absolute;left:-5%;right:-5%;bottom:-92px;height:140px;border-radius:50% 50% 0 0/100% 100% 0 0;background:linear-gradient(90deg,color-mix(in srgb, var(--theme-control-hover) 19%, transparent),color-mix(in srgb, var(--theme-accent) 12%, transparent) 48%,color-mix(in srgb, var(--theme-control-hover) 19%, transparent));pointer-events:none}
}
.replacement-page .run-button{height:48px;border-radius:24px;background:var(--theme-accent);color:var(--theme-on-accent);font-size:13px}
.replacement-page .run-button:disabled{opacity:1;background:var(--theme-accent);color:var(--theme-on-accent);cursor:not-allowed;filter:saturate(.86)}
:global(.ds-workspace:has(.replacement-page)){overflow:auto!important;scrollbar-gutter:stable;padding:10px 12px 18px!important}
.replacement-page{height:auto;min-height:100%;overflow:visible;padding-bottom:22px}
.replacement-page .results-section{flex:0 0 auto;height:auto;min-height:174px;overflow:visible}
.replacement-page .batch-list{min-height:0;overflow:visible}
.replacement-page .batch-block{overflow:hidden}
.replacement-page .batch-controls button{min-width:32px;min-height:32px}
.generation-history{position:relative;overflow:hidden;border:1px solid var(--theme-border);border-radius:16px;background:linear-gradient(112deg,var(--theme-panel) 0%,color-mix(in srgb,var(--theme-panel) 88%,var(--theme-panel-soft)) 100%);padding:22px 22px 24px!important}
.generation-history:after{content:"";position:absolute;left:-4%;right:-4%;bottom:-118px;height:176px;border-radius:50% 50% 0 0/100% 100% 0 0;background:linear-gradient(90deg,color-mix(in srgb, var(--theme-control-hover) 14%, transparent),color-mix(in srgb, var(--theme-accent) 11%, transparent) 48%,color-mix(in srgb, var(--theme-control-hover) 14%, transparent));pointer-events:none}
.history-heading{position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:22px}
.history-title{display:flex;align-items:flex-start;gap:12px}.history-icon{display:grid;place-items:center;color:var(--theme-text-secondary);padding-top:2px}.history-title h2{margin:0;font-size:24px;font-weight:780}.history-title p{margin:5px 0 0;color:var(--theme-text-muted);font-size:12px}.generation-history .result-metric{padding-top:7px;font-size:12px}
.history-toolbar{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px;padding:10px 12px;border:1px solid var(--theme-border);border-radius:14px;background:color-mix(in srgb, var(--theme-text) 2%, transparent)}.history-tabs,.history-actions{display:flex;align-items:center;gap:10px}.history-tabs button,.history-actions button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 18px;border:1px solid var(--theme-border-control);border-radius:13px;background:var(--theme-control);color:var(--theme-text-secondary);font-size:13px;font-weight:700;cursor:pointer}.history-tabs button strong{color:var(--theme-text-muted);font-size:11px}.history-tabs button.is-active{border-color:var(--theme-accent);background:var(--theme-accent-soft);box-shadow:0 0 0 1px #31e8c21f;color:var(--theme-accent)}.history-tabs button.is-active strong{color:var(--theme-accent)}.history-tabs button:hover,.history-actions button:hover:not(:disabled){border-color:var(--theme-accent);color:var(--theme-text)}.history-actions button{min-height:40px;padding:0 14px;font-size:12px}.history-actions button:disabled{opacity:.45;cursor:not-allowed}
.history-batch{position:relative;z-index:1;border-color:var(--theme-border);border-radius:14px;background:color-mix(in srgb, var(--theme-panel) 60%, transparent);box-shadow:inset 0 1px 0 #ffffff06}.history-batch+.history-batch{margin-top:14px}.history-batch .batch-header{min-height:68px;padding:14px 18px;border-color:var(--theme-divider)}.history-result-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:0;border-top:1px solid var(--theme-divider)}.history-result-card{display:grid;grid-template-columns:78px minmax(0,1fr) auto;align-items:center;gap:14px;min-width:0;padding:16px;border-right:1px solid var(--theme-divider)}.history-result-card:last-child{border-right:0}.history-preview,.history-preview img{width:78px;height:78px;border-radius:10px}.history-preview{overflow:hidden;background:var(--theme-panel-soft)}.history-preview img{display:block;object-fit:cover;cursor:pointer}.history-result-info{min-width:0;display:grid;gap:7px}.history-result-info strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--theme-text);font-size:13px}.history-result-meta{display:flex;align-items:center;gap:8px;color:var(--theme-text-muted);font-size:11px}.history-result-actions{display:flex;align-items:center;gap:6px}.history-result-actions button{width:34px;height:34px;display:grid;place-items:center;border:1px solid var(--theme-border-control);border-radius:9px;background:var(--theme-control);color:var(--theme-text-secondary);cursor:pointer}.history-result-actions button:hover{border-color:var(--theme-accent);color:var(--theme-accent);background:var(--theme-control-hover)}
@media(max-width:760px){.generation-history{padding:16px 12px 18px!important}.history-heading,.history-toolbar{align-items:flex-start;flex-direction:column}.history-toolbar{gap:10px}.history-tabs{width:100%;overflow:auto}.history-tabs button{flex:0 0 auto;padding:0 13px}.history-actions{width:100%;justify-content:flex-end}.history-result-list{grid-template-columns:1fr}.history-result-card{border-right:0;border-bottom:1px solid var(--theme-divider)}.history-result-card:last-child{border-bottom:0}}
@media(max-width:800px){
  :global(.ds-workspace:has(.replacement-page)){padding:8px!important}
  .replacement-page .results-section{min-height:180px}
}
.replacement-page .hero-banner{min-height:116px;margin-bottom:16px;padding:18px 24px 18px 190px;border-radius:18px;background:linear-gradient(112deg,var(--theme-panel) 0%,color-mix(in srgb,var(--theme-panel) 76%,var(--theme-control-hover)) 70%,var(--theme-panel) 100%)}
.replacement-page .hero-copy{padding-top:0}.replacement-page .page-header h1{font-size:28px}.replacement-page .page-header p{font-size:13px}.replacement-page .back-button{left:20px;min-height:42px;padding:0 14px;border-radius:13px}.replacement-page .hero-visual{display:block;right:88px;top:7px;width:330px;height:102px}.replacement-page .hero-frame-source{left:34px;top:5px;width:86px;height:91px}.replacement-page .hero-frame-result{right:20px;top:3px;width:96px;height:94px}.replacement-page .hero-arrow{left:145px;top:32px;width:40px;height:40px}
.replacement-page .workspace-grid{display:grid;grid-template-columns:minmax(300px,.94fr) minmax(360px,1.12fr) minmax(300px,.8fr);grid-template-rows:auto auto;gap:16px;margin-top:0;align-items:start}.replacement-page .setup-column{display:contents}.replacement-page .target-section{grid-column:1;grid-row:1}.replacement-page .scene-section{grid-column:2;grid-row:1}.replacement-page .prompt-section{grid-column:1 / 3;grid-row:2}.replacement-page .confirm-column{grid-column:3;grid-row:1}.replacement-page .target-section,.replacement-page .scene-section,.replacement-page .confirm-sticky{height:274px;box-sizing:border-box}.replacement-page .content-card{padding:15px 18px;border-radius:16px;background:linear-gradient(135deg,var(--theme-panel),color-mix(in srgb,var(--theme-panel) 90%,var(--theme-control-hover)));box-shadow:inset 0 1px 0 #ffffff08}.replacement-page .content-card .section-heading{margin-bottom:12px}.replacement-page .section-heading h2{font-size:17px}.replacement-page .step{width:31px;height:31px;font-size:11px}.replacement-page .product-picker-card{min-height:84px}.replacement-page .upload-product-button{min-height:84px;width:126px;flex-basis:126px}.replacement-page .thumb-strip{min-height:72px}.replacement-page .thumb,.replacement-page .add-thumb{width:70px;height:70px}.replacement-page .drop-zone{min-height:191px}.replacement-page .prompt-section{min-height:166px}.replacement-page .prompt-editor{grid-template-columns:minmax(330px,.96fr) minmax(420px,1.04fr);gap:14px}.replacement-page .prompt-section textarea{height:92px;min-height:92px}.prompt-heading-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:var(--theme-accent-soft);color:var(--theme-accent)}
.replacement-page .confirm-sticky{padding:14px 18px;border-radius:17px;background:linear-gradient(150deg,color-mix(in srgb,var(--theme-panel) 86%,var(--theme-accent)),var(--theme-panel) 72%,color-mix(in srgb,var(--theme-panel) 88%,var(--theme-control-hover)));border-color:color-mix(in srgb,var(--theme-accent) 58%,var(--theme-border));box-shadow:inset 0 1px 0 #ffffff0b}.replacement-page .confirm-title{padding-bottom:10px;font-size:17px}.replacement-page .confirm-title>div{display:flex;align-items:center;gap:10px}.replacement-page .summary-row{padding:10px 4px;font-size:12px}.replacement-page .variant-field{margin-top:9px}.replacement-page .variant-field select{min-height:36px}.replacement-page .estimate{display:none}.replacement-page .run-button{height:45px;margin-top:9px}.replacement-page .model-note{margin-top:7px;font-size:9px}
.replacement-page .generation-history{margin-top:18px;padding:12px 18px 14px!important;border-radius:17px}.replacement-page .history-heading{align-items:center;margin-bottom:7px}.replacement-page .history-title{gap:9px}.replacement-page .history-icon{width:25px}.replacement-page .history-title h2{font-size:18px}.replacement-page .history-title p{margin-top:1px;font-size:10px}.replacement-page .generation-history .result-metric{padding:0;font-size:12px}.replacement-page .history-toolbar{margin-bottom:8px;padding:0;border:0;background:transparent}.replacement-page .history-tabs button{min-height:42px;padding:0 16px;border-radius:10px}.replacement-page .history-actions button{min-height:40px}.replacement-page .history-batch{border-radius:12px}.replacement-page .history-result-card{grid-template-columns:88px 160px minmax(0,1fr) auto;gap:16px;min-height:106px;padding:9px 14px}.replacement-page .history-preview,.replacement-page .history-preview img{width:88px;height:88px;border-radius:10px}.history-product-info{min-width:0;display:grid;align-content:center;gap:6px}.history-product-info strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--theme-text);font-size:14px}.history-product-info small{color:var(--theme-text-muted);font-size:10px}.replacement-page .history-result-info{align-content:center}.replacement-page .history-result-info .status-label{width:max-content}.replacement-page .history-result-info strong{font-size:12px}.replacement-page .history-result-actions{align-self:center}
.replacement-page .confirm-sticky{padding:12px 18px}.replacement-page .confirm-title{padding-bottom:4px}.replacement-page .summary-row{padding:4px}.replacement-page .variant-field{margin-top:5px}.replacement-page .variant-field select{min-height:34px}.replacement-page .run-button{height:41px;margin-top:6px}.replacement-page .model-note{margin-top:4px}.replacement-page .results-section{overflow:hidden}
@media(max-width:1180px){.replacement-page .workspace-grid{grid-template-columns:minmax(280px,1fr) minmax(320px,1fr)}.replacement-page .target-section{grid-column:1}.replacement-page .scene-section{grid-column:2}.replacement-page .prompt-section{grid-column:1 / 3}.replacement-page .confirm-column{grid-column:1 / 3;grid-row:3}.replacement-page .confirm-sticky{height:auto}.replacement-page .hero-visual{right:30px;opacity:.7}.replacement-page .history-result-card{grid-template-columns:78px 130px minmax(0,1fr) auto}.replacement-page .history-preview,.replacement-page .history-preview img{width:78px;height:78px}}
@media(max-width:760px){.replacement-page .hero-banner{padding:58px 16px 18px;min-height:146px}.replacement-page .hero-visual{display:none}.replacement-page .back-button{top:10px;left:12px;transform:none}.replacement-page .workspace-grid{grid-template-columns:1fr}.replacement-page .target-section,.replacement-page .scene-section,.replacement-page .prompt-section,.replacement-page .confirm-column{grid-column:1;grid-row:auto}.replacement-page .target-section,.replacement-page .scene-section{height:auto;min-height:250px}.replacement-page .prompt-editor{grid-template-columns:1fr}.replacement-page .history-result-card{grid-template-columns:68px minmax(0,1fr) auto}.replacement-page .history-preview,.replacement-page .history-preview img{width:68px;height:68px}.history-product-info{grid-column:2}.replacement-page .history-result-info{grid-column:2}.replacement-page .history-result-actions{grid-column:3;grid-row:1 / 3}}

/* Product replacement visual refinement: quiet surfaces, clear hierarchy, and consistent control geometry. */
.replacement-page {
  --replacement-accent: var(--theme-accent);
  --replacement-accent-soft: color-mix(in srgb, var(--theme-accent) 14%, transparent);
  --replacement-ink: var(--theme-text);
  --replacement-muted: var(--theme-text-muted);
  --replacement-line: var(--theme-border);
}
.replacement-page .hero-banner,
.replacement-page .content-card,
.replacement-page .confirm-sticky,
.replacement-page .generation-history {
  border-color: color-mix(in srgb, var(--replacement-line) 82%, transparent);
  box-shadow: inset 0 1px 0 #ffffff08, 0 10px 24px #0000001a;
}
.replacement-page .page-header h1,
.replacement-page .section-heading h2,
.replacement-page .history-title h2,
.replacement-page .confirm-title,
.replacement-page .drop-zone strong {
  color: var(--replacement-ink);
  letter-spacing: 0;
}
.replacement-page .page-header p,
.replacement-page .section-meta,
.replacement-page .history-title p,
.replacement-page .model-note,
.replacement-page .drop-zone > span {
  color: var(--replacement-muted);
}
.replacement-page .back-button,
.replacement-page .icon-button,
.replacement-page .secondary-button,
.replacement-page .history-actions button,
.replacement-page .history-tabs button {
  border-color: var(--replacement-line);
  background: var(--theme-panel-soft);
  color: var(--theme-text);
  box-shadow: inset 0 1px 0 #ffffff06;
}
.replacement-page .back-button:hover,
.replacement-page .icon-button:hover,
.replacement-page .secondary-button:hover,
.replacement-page .history-actions button:hover:not(:disabled),
.replacement-page .history-tabs button:hover {
  border-color: color-mix(in srgb, var(--replacement-accent) 55%, var(--replacement-line));
  background: var(--theme-panel-soft);
  color: var(--replacement-ink);
}
.replacement-page .step {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--replacement-accent);
  color: var(--theme-text);
  font-size: 10px;
  font-weight: 850;
  box-shadow: 0 0 0 4px #20c7ad18;
}
.replacement-page .prompt-heading-icon,
.replacement-page .drop-icon {
  background: var(--replacement-accent-soft);
  color: var(--replacement-accent);
  box-shadow: inset 0 1px 0 #ffffff0a;
}
.replacement-page .confirm-title > svg,
.replacement-page .history-icon,
.replacement-page .result-metric,
.replacement-page .text-button,
.replacement-page .product-picker-chevron {
  color: var(--replacement-accent);
}
.replacement-page .product-picker-card,
.replacement-page .upload-product-button,
.replacement-page .drop-zone,
.replacement-page .prompt-section textarea,
.replacement-page .prompt-actions input,
.replacement-page .variant-field select {
  border-color: var(--replacement-line);
  background: var(--theme-panel);
  color: var(--replacement-ink);
  box-shadow: inset 0 1px 0 #ffffff05;
}
.replacement-page .product-picker-card:hover,
.replacement-page .upload-product-button:hover,
.replacement-page .drop-zone:hover {
  border-color: color-mix(in srgb, var(--replacement-accent) 60%, var(--replacement-line));
  background: var(--theme-tone-blue);
}
.replacement-page .upload-product-icon,
.replacement-page .drop-actions .primary-button,
.replacement-page .run-button {
  color: var(--theme-text);
}
.replacement-page .upload-product-icon {
  color: var(--replacement-accent);
}
.replacement-page .drop-zone {
  border-style: dashed;
}
.replacement-page .drop-actions .primary-button,
.replacement-page .run-button {
  border-color: var(--replacement-accent);
  background: var(--replacement-accent);
  color: var(--theme-text);
  font-weight: 800;
  box-shadow: 0 8px 18px #20c7ad24;
}
.replacement-page .drop-actions .primary-button:hover,
.replacement-page .run-button:hover:not(:disabled) {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
  box-shadow: 0 10px 22px #20c7ad38;
}
.replacement-page .run-button:disabled {
  border-color: var(--theme-border);
  background: var(--theme-panel-soft);
  color: var(--theme-text-secondary);
  box-shadow: none;
}
.replacement-page .summary-row {
  border-bottom-color: var(--theme-border);
}
.replacement-page .summary-row span,
.replacement-page .field-label,
.replacement-page .history-product-info small,
.replacement-page .history-result-info small {
  color: var(--replacement-muted);
}
.replacement-page .summary-row strong,
.replacement-page .history-product-info strong,
.replacement-page .history-result-info strong {
  color: var(--replacement-ink);
}
.replacement-page .history-tabs button.is-active {
  border-color: var(--replacement-accent);
  background: var(--replacement-accent-soft);
  color: var(--replacement-accent);
  box-shadow: inset 0 0 0 1px #20c7ad35;
}
.replacement-page .history-tabs button.is-active strong {
  color: var(--replacement-accent);
}
.replacement-page .history-result-actions button {
  border-color: var(--replacement-line);
  background: var(--theme-panel-soft);
  color: var(--theme-text-secondary);
}
.replacement-page .history-result-actions button:hover {
  border-color: var(--replacement-accent);
  background: var(--replacement-accent-soft);
  color: var(--replacement-accent);
}
.replacement-page .exported-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: max-content;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 33%, transparent);
  border-radius: 999px;
  background: var(--theme-accent);
  color: var(--theme-accent);
  font-size: 10px;
  font-weight: 700;
}
.replacement-page :is(input, select, textarea):focus {
  border-color: var(--replacement-accent);
  box-shadow: 0 0 0 3px #20c7ad1c;
  outline: none;
}
.replacement-page .history-result-card {
  grid-template-columns: 24px 88px 160px minmax(0, 1fr) auto;
}
.replacement-page .result-select { display: grid; place-items: center; }
.replacement-page .result-select input,
.replacement-page .select-exportable input { width: 16px; height: 16px; accent-color: var(--replacement-accent); }
.replacement-page .result-select-placeholder { width: 16px; }
.replacement-page .select-exportable { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 0 12px; border: 1px solid var(--theme-border-control); border-radius: 10px; color: var(--theme-text-secondary); font-size: 12px; cursor: pointer; }
.replacement-page .select-exportable strong { color: var(--replacement-accent); }
@media (max-width: 1180px) {
  .replacement-page .history-result-card { grid-template-columns: 24px 78px 130px minmax(0, 1fr) auto; }
}
@media (max-width: 760px) {
  .replacement-page .history-result-card { grid-template-columns: 20px 68px minmax(0, 1fr) auto; }
  .replacement-page .history-result-info,
  .replacement-page .history-product-info { grid-column: 3; }
  .replacement-page .history-result-actions { grid-column: 4; grid-row: 1 / 3; }
  .replacement-page .select-exportable { width: 100%; justify-content: center; }
}
</style>
