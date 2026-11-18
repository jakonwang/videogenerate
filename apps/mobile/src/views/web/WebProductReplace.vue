<script setup lang="ts">
/**
 * 商品替换（网页版，按电脑端 ProductReplacementView 的版式）：
 * 01 目标商品（最多 4 张参考图）· 02 待替换图片 · 提示词（版本管理）· 03 确认任务 · 批次记录。
 * 在云端生成，结果同时进审核收件箱。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Archive, ArrowLeft, Check, CheckCircle2, ChevronDown, Download, ImagePlus, Images, Package, Plus, RefreshCw, RotateCcw, Save, Sparkles, Upload, X } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncProduct } from '@shared/cloud/sync'
import { PRODUCT_REPLACEMENT_PROMPT } from '@shared/productReplacementPrompt'
import CloudImage from '@/components/CloudImage.vue'
import ProductPicker from '@/components/ProductPicker.vue'
import { useAssets } from '@/lib/assets'
import { fileBlob, uploadImage } from '@/lib/files'
import { closestAspect, refreshPending, startPolling, useGenerations, type GenerationItem } from '@/lib/generate'
import { coverOf, type ProductItem } from '@/lib/library'
import { downloadBlob } from '@/lib/platform'
import { activatePromptVersion, ensureDefaultPrompt, rollbackPromptVersion, savePromptVersion, usePromptVersions } from '@/lib/promptVersions'
import { MAX_PRODUCT_REFS, createReplaceBatch, markExported, replaceBatchStatus, retryFailedItems, useReplaceBatches, type ReplaceBatchItem } from '@/lib/replace'
import { errorMessage } from '@/lib/session'
import { getRecord, requestSync } from '@/lib/sync'
import { toast } from '@/lib/toast'
import { useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const PROMPTS = SYNC_COLLECTIONS.replacePrompts
const prompts = usePromptVersions(PROMPTS)
const batches = useReplaceBatches()
const results = useGenerations((item) => item.purpose === 'product-replace')
const genById = computed(() => new Map(results.value.map((item) => [item.id, item])))
const { items: libraryImages } = useAssets((item) => item.kind === 'image')

/* ---------------------------------------------------------------- 01 目标商品 */
const product = ref<ProductItem | null>(null)
const productImages = ref<string[]>([])
const showProductDialog = ref(false)
const productInput = ref<HTMLInputElement>()
const productName = computed(() => product.value?.name || (productImages.value.length ? '自定义商品' : ''))

function selectProduct(item: ProductItem) {
  showProductDialog.value = false
  product.value = item
  productImages.value = item.images.slice(0, MAX_PRODUCT_REFS).map((image) => image.fileId)
  if (!productImages.value.length) toast('这个商品还没有图片，请上传商品图')
}
onMounted(async () => {
  startPolling()
  const id = typeof route.query.product === 'string' ? route.query.product : ''
  if (!id) return
  const record = await getRecord<SyncProduct>(SYNC_COLLECTIONS.products, id)
  if (record?.data) selectProduct({ ...record.data, id, updatedAt: record.updatedAt, pending: false })
})
async function onProductFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? []).slice(0, MAX_PRODUCT_REFS - productImages.value.length)
  ;(event.target as HTMLInputElement).value = ''
  for (const file of files) {
    try {
      productImages.value = [...productImages.value, (await uploadImage(file)).fileId].slice(0, MAX_PRODUCT_REFS)
    } catch (error) {
      toast(`上传失败：${errorMessage(error)}`)
    }
  }
}

/* ---------------------------------------------------------------- 02 待替换图片 */
type Scene = { fileId: string; name: string; aspectRatio: '1:1' | '9:16' | '16:9' }
const sourceImages = ref<Scene[]>([])
const sceneInput = ref<HTMLInputElement>()
const uploading = ref(0)
const pickingLibrary = ref(false)
async function addSceneFiles(files: File[]) {
  for (const file of files.filter((f) => f.type.startsWith('image/'))) {
    uploading.value += 1
    try {
      const image = await uploadImage(file)
      sourceImages.value = [...sourceImages.value, { fileId: image.fileId, name: file.name, aspectRatio: closestAspect(image.width, image.height) }]
    } catch (error) {
      toast(`上传失败：${errorMessage(error)}`)
    } finally {
      uploading.value -= 1
    }
  }
}
function onSceneFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? [])
  ;(event.target as HTMLInputElement).value = ''
  void addSceneFiles(files)
}
function onDrop(event: DragEvent) {
  void addSceneFiles(Array.from(event.dataTransfer?.files ?? []))
}
function toggleLibraryImage(item: { fileId: string; name: string; width?: number; height?: number }) {
  sourceImages.value = sourceImages.value.some((s) => s.fileId === item.fileId)
    ? sourceImages.value.filter((s) => s.fileId !== item.fileId)
    : [...sourceImages.value, { fileId: item.fileId, name: item.name, aspectRatio: closestAspect(item.width, item.height) }]
}

/* ---------------------------------------------------------------- 提示词 */
const promptId = ref('')
const promptName = ref('')
const promptText = ref('')
const showPrompts = ref(false)
const busy = ref(false)
watch(prompts, (list) => void ensureDefaultPrompt(PROMPTS, list, 'Basic Product Replacement', PRODUCT_REPLACEMENT_PROMPT), { once: true })
watch(
  prompts,
  (list) => {
    if (promptId.value && list.some((p) => p.id === promptId.value)) return
    const active = list.find((p) => p.active) ?? list[0]
    if (active) editPrompt(active.id)
  },
  { immediate: true },
)
function editPrompt(id: string) {
  const row = prompts.value.find((p) => p.id === id)
  if (!row) return
  promptId.value = row.id
  promptName.value = row.name
  promptText.value = row.prompt
}
const promptVersion = computed(() => prompts.value.find((p) => p.id === promptId.value)?.version ?? 0)
async function savePrompt() {
  if (!promptText.value.trim()) return
  busy.value = true
  try {
    promptId.value = await savePromptVersion(PROMPTS, { id: promptId.value || undefined, name: promptName.value, prompt: promptText.value }, prompts.value)
    toast('提示词版本已保存。')
  } finally {
    busy.value = false
  }
}
async function activate(id: string) {
  await activatePromptVersion(PROMPTS, id, prompts.value)
}
async function copyPrompt(id: string) {
  const row = prompts.value.find((p) => p.id === id)
  if (!row) return
  promptId.value = await savePromptVersion(PROMPTS, { name: `${row.name} copy`, prompt: row.prompt }, prompts.value)
}
async function rollback(id: string) {
  promptId.value = await rollbackPromptVersion(PROMPTS, id, prompts.value)
}
function newPrompt() {
  promptId.value = ''
  promptName.value = `版本名称 ${prompts.value.length + 1}`
  promptText.value = ''
  showPrompts.value = false
}

/* ---------------------------------------------------------------- 03 确认任务 */
const variantCount = ref(1)
const totalJobs = computed(() => sourceImages.value.length * variantCount.value)
const submitting = ref(false)
async function submit() {
  if (!productImages.value.length || !sourceImages.value.length || !promptText.value.trim()) return toast('请先选择商品参考图、场景图片和提示词版本。')
  submitting.value = true
  try {
    await createReplaceBatch({
      productId: product.value?.id,
      productName: productName.value,
      productFileIds: productImages.value,
      scenes: sourceImages.value,
      prompt: promptText.value.trim(),
      promptVersion: promptVersion.value,
      variantCount: variantCount.value,
    })
    sourceImages.value = []
    toast('批次已创建并开始处理。')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    submitting.value = false
  }
}

/* ---------------------------------------------------------------- 批次记录 */
const historyTab = ref<'all' | 'image'>('all')
const selected = ref<string[]>([])
const STATUS_LABEL: Record<string, string> = { queued: '等待中', running: '处理中', processing: '处理中', succeeded: '已完成', completed: '已完成', partial_failed: '部分失败', failed: '失败' }
const rows = computed(() =>
  batches.value.flatMap((batch) =>
    batch.items.map((item) => ({ batch, item, gen: genById.value.get(item.generationId) as GenerationItem | undefined })),
  ),
)
const shownRows = computed(() => (historyTab.value === 'image' ? rows.value.filter((r) => r.gen?.outputFileId) : rows.value))
const resultImageCount = computed(() => rows.value.filter((r) => r.gen?.outputFileId).length)
const exportable = computed(() => rows.value.filter((r) => r.gen?.outputFileId))
const allExportableSelected = computed(() => exportable.value.length > 0 && exportable.value.every((r) => selected.value.includes(r.item.generationId)))
function toggleAllExportable() {
  selected.value = allExportableSelected.value ? [] : exportable.value.map((r) => r.item.generationId)
}
function toggleSelect(id: string) {
  selected.value = selected.value.includes(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id]
}
async function exportRows(list: typeof rows.value) {
  const ready = list.filter((r) => r.gen?.outputFileId).slice(0, 50)
  for (const [index, row] of ready.entries()) {
    try {
      const blob = await fileBlob(row.gen!.outputFileId!)
      downloadBlob(blob, `${String(index + 1).padStart(2, '0')}_${row.batch.productName || 'product'}_${row.item.sourceName.replace(/\.[^.]+$/, '')}.${blob.type.includes('png') ? 'png' : 'jpg'}`)
    } catch (error) {
      toast(errorMessage(error))
    }
  }
  const byBatch = new Map<string, { batch: ReplaceBatchItem; ids: string[] }>()
  for (const row of ready) {
    const entry = byBatch.get(row.batch.id) ?? { batch: row.batch, ids: [] }
    entry.ids.push(row.item.generationId)
    byBatch.set(row.batch.id, entry)
  }
  for (const { batch, ids } of byBatch.values()) await markExported(batch, ids)
  if (ready.length) toast(`已导出 ${ready.length} 张`)
}
async function refresh() {
  await requestSync()
  await refreshPending().catch(() => 0)
}
async function retry(batch: ReplaceBatchItem) {
  try {
    await retryFailedItems(batch, genById.value)
    startPolling()
  } catch (error) {
    toast(errorMessage(error))
  }
}
const previewFile = ref('')
</script>

<template>
  <main class="replacement-page" data-testid="web-product-replace">
    <header class="page-header hero-banner">
      <button type="button" class="back-button" @click="router.push('/toolbox')"><ArrowLeft :size="15" />返回工具箱</button>
      <div class="hero-copy"><span class="eyebrow" aria-hidden="true"><Sparkles :size="14" /></span><h1>商品替换</h1><p>使用商品参考图批量替换场景图片中的商品，同时保留原图环境与构图。</p></div>
      <div class="hero-visual" aria-hidden="true">
        <span class="hero-frame hero-frame-source"><CloudImage v-if="productImages[0]" :file-id="productImages[0]" /></span>
        <span class="hero-arrow"><Sparkles :size="18" /></span>
        <span class="hero-frame hero-frame-result"><CloudImage v-if="productImages[1] || productImages[0]" :file-id="productImages[1] || productImages[0]" /></span>
      </div>
      <button class="icon-button hero-action" title="提示词版本管理" @click="showPrompts = !showPrompts"><Archive :size="17" /></button>
    </header>

    <div class="workspace-grid">
      <section class="setup-column">
        <section class="work-section content-card target-section">
          <div class="section-heading"><div><span class="step">01</span><h2>目标商品</h2></div><span class="section-meta">{{ productImages.length }}/{{ MAX_PRODUCT_REFS }}</span></div>
          <div class="product-select-row">
            <button class="product-picker-card" type="button" data-testid="replace-pick-product" @click="showProductDialog = true">
              <span class="product-picker-cover" :class="{ 'product-picker-placeholder': !product }"><CloudImage v-if="product && coverOf(product)" :file-id="coverOf(product)" /><Package v-else :size="19" /></span>
              <span class="product-picker-copy"><small>系统商品</small><strong>{{ product?.name || '选择商品' }}</strong><em>{{ product ? '更换商品' : '点击打开商品库' }}</em></span>
              <ChevronDown :size="17" class="product-picker-chevron" />
            </button>
            <button type="button" class="secondary-button upload-product-button" :disabled="productImages.length >= MAX_PRODUCT_REFS" @click="productInput?.click()"><span class="upload-product-icon"><Upload :size="16" /></span><span>上传商品图</span></button>
            <input ref="productInput" type="file" accept="image/*" multiple hidden @change="onProductFiles" />
          </div>
          <div v-if="product" class="product-selection-meta"><span>已选择商品</span><strong>{{ productImages.length }}/{{ MAX_PRODUCT_REFS }} 张参考图</strong><button type="button" class="text-button" @click="showProductDialog = true">更换商品</button></div>
          <div class="thumb-strip">
            <div v-for="fileId in productImages" :key="fileId" class="thumb product-thumb"><CloudImage :file-id="fileId" /><button title="移除" @click="productImages = productImages.filter((item) => item !== fileId)"><X :size="13" /></button></div>
            <button v-if="productImages.length < MAX_PRODUCT_REFS" type="button" class="add-thumb" @click="productInput?.click()"><Plus :size="17" /></button>
            <span v-if="!productImages.length" class="empty-inline"><Package :size="17" />添加一至四张商品参考图</span>
          </div>
        </section>

        <section class="work-section content-card scene-section">
          <div class="section-heading"><div><span class="step">02</span><h2>待替换图片</h2></div><span class="section-meta">{{ sourceImages.length }} 张图片</span></div>
          <div class="drop-zone" @dragover.prevent @drop.prevent="onDrop">
            <div class="drop-icon"><RefreshCw v-if="uploading" :size="21" class="vg-spin" /><ImagePlus v-else :size="21" /></div>
            <strong>{{ uploading ? `正在上传 ${uploading} 张` : '拖放场景图片到这里' }}</strong>
            <span>支持 JPG、PNG、WebP 和 GIF</span>
            <div class="drop-actions">
              <button class="primary-button" data-testid="replace-upload-scenes" @click="sceneInput?.click()"><Upload :size="15" />上传图片</button>
              <button class="secondary-button" @click="pickingLibrary = true">从素材库选择</button>
            </div>
            <input ref="sceneInput" type="file" accept="image/*" multiple hidden data-testid="replace-scene-input" @change="onSceneFiles" />
          </div>
          <div v-if="sourceImages.length" class="source-list">
            <div v-for="(item, index) in sourceImages" :key="item.fileId" class="source-row"><CloudImage :file-id="item.fileId" /><span>{{ item.name }}</span><small>{{ String(index + 1).padStart(2, '0') }}</small><button title="移除" @click="sourceImages.splice(index, 1)"><X :size="14" /></button></div>
          </div>
        </section>

        <section class="work-section content-card prompt-section">
          <div class="section-heading"><div><span class="prompt-heading-icon"><Save :size="16" /></span><h2>提示词</h2></div><button class="text-button" @click="showPrompts = !showPrompts">版本管理<ChevronDown :size="14" /></button></div>
          <div class="prompt-editor">
            <div class="prompt-settings">
              <label class="field-label">当前提示词版本<span class="prompt-select-wrap"><select :value="promptId" :disabled="!prompts.length" @change="editPrompt(($event.target as HTMLSelectElement).value)"><option v-for="item in prompts" :key="item.id" :value="item.id">V{{ item.version }} · {{ item.name }}{{ item.active ? ' · 使用中' : '' }}</option></select><ChevronDown :size="16" aria-hidden="true" /></span></label>
              <div class="prompt-actions"><input v-model="promptName" placeholder="版本名称" /><button class="secondary-button" :disabled="busy || !promptText.trim()" @click="savePrompt"><Save :size="14" />保存版本</button></div>
            </div>
            <textarea v-model="promptText" rows="5" placeholder="描述商品替换规则。第一张为场景图，其余为商品参考图。" />
          </div>
        </section>
      </section>

      <aside class="confirm-column">
        <div class="confirm-sticky">
          <div class="confirm-title"><div><span class="step">03</span><span>确认任务</span></div><Sparkles :size="16" /></div>
          <div class="summary-row"><span>目标商品</span><strong>{{ productName || '未选择' }}</strong></div>
          <div class="summary-row"><span>商品参考图</span><strong>{{ productImages.length }}</strong></div>
          <div class="summary-row"><span>待替换图片</span><strong>{{ sourceImages.length }}</strong></div>
          <label class="field-label variant-field">每张图片生成数量<select v-model.number="variantCount"><option v-for="n in 4" :key="n" :value="n">{{ n }}</option></select></label>
          <div class="estimate"><span>预计生成任务</span><strong>{{ totalJobs }}</strong></div>
          <button class="run-button" data-testid="replace-start" :disabled="submitting || uploading > 0 || !productImages.length || !sourceImages.length" @click="submit"><span>{{ submitting ? '正在创建...' : '开始批量替换' }}</span><Sparkles :size="16" /></button>
          <p class="model-note">在云端用管理员配置的图片编辑模型生成，关掉网页也会继续；结果同时进审核收件箱。</p>
        </div>
      </aside>
    </div>

    <section class="results-section generation-history">
      <header class="history-heading">
        <div class="history-title"><span class="history-icon"><Images :size="25" /></span><div><h2>批次记录</h2><p>查看与管理你的生成记录</p></div></div>
        <div class="result-metric"><Check :size="15" />{{ rows.length }} 条记录</div>
      </header>
      <div class="history-toolbar">
        <div class="history-tabs">
          <button :class="{ 'is-active': historyTab === 'all' }" type="button" @click="historyTab = 'all'"><CheckCircle2 :size="18" /><span>全部</span><strong>{{ rows.length }}</strong></button>
          <button :class="{ 'is-active': historyTab === 'image' }" type="button" @click="historyTab = 'image'"><Images :size="18" /><span>图片</span><strong>{{ resultImageCount }}</strong></button>
          <label class="select-exportable"><input type="checkbox" :checked="allExportableSelected" :disabled="!exportable.length" @change="toggleAllExportable" /><span>全选可导出</span><strong>{{ selected.length }}</strong></label>
        </div>
        <div class="history-actions">
          <button type="button" title="刷新" @click="refresh"><RefreshCw :size="17" /><span>刷新</span></button>
          <button type="button" title="批量导出" :disabled="!selected.length" @click="exportRows(rows.filter((r) => selected.includes(r.item.generationId)))"><Download :size="17" /><span>批量导出 ({{ selected.length }})</span></button>
        </div>
      </div>
      <div v-if="shownRows.length" class="batch-list">
        <div v-for="row in shownRows" :key="row.item.generationId" class="history-result-card" data-testid="replace-history-row">
          <label v-if="row.gen?.outputFileId" class="result-select"><input type="checkbox" :checked="selected.includes(row.item.generationId)" :aria-label="`选择结果: ${row.item.sourceName}`" @change="toggleSelect(row.item.generationId)" /></label>
          <span v-else class="result-select-placeholder" aria-hidden="true"></span>
          <div class="history-preview">
            <CloudImage v-if="row.gen?.outputFileId" :file-id="row.gen.outputFileId" @click="previewFile = row.gen.outputFileId" />
            <div v-else class="result-placeholder"><span v-if="row.gen?.status === 'failed'">!</span><span v-else class="loader"></span></div>
          </div>
          <div class="history-product-info"><strong>{{ row.batch.productName }}</strong><small>V{{ row.batch.promptVersion }} · {{ row.batch.items.length }} 项任务</small></div>
          <div class="history-result-info">
            <span class="status-label" :class="`status-${row.gen?.status === 'succeeded' ? 'completed' : row.gen?.status || 'queued'}`">{{ STATUS_LABEL[row.gen?.status || 'queued'] }}</span>
            <strong>{{ row.item.sourceName }}</strong>
            <span v-if="row.item.exportedAt" class="exported-label"><Check :size="12" />已导出</span>
            <small v-if="row.gen?.error" class="error">{{ row.gen.error }}</small>
          </div>
          <div class="history-result-actions">
            <button v-if="['failed', 'partial_failed'].includes(replaceBatchStatus(row.batch, genById))" title="重试失败项" @click="retry(row.batch)"><RotateCcw :size="16" /></button>
            <button v-if="row.gen?.outputFileId" type="button" title="查看" @click="previewFile = row.gen.outputFileId"><Images :size="17" /></button>
            <button v-if="row.gen?.outputFileId" type="button" title="导出结果" @click="exportRows([row])"><Download :size="17" /></button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state"><Sparkles :size="22" /><span>还没有商品替换任务</span></div>
    </section>

    <div v-if="showPrompts" class="prompt-drawer">
      <div class="drawer-head"><strong>提示词版本管理</strong><button class="icon-button" @click="showPrompts = false"><X :size="16" /></button></div>
      <div v-for="item in prompts" :key="item.id" class="version-row">
        <div><strong>V{{ item.version }} · {{ item.name }}</strong><small>{{ item.prompt.length }} 字<span v-if="item.active"> · 使用中</span></small></div>
        <div>
          <button :disabled="item.active" @click="activate(item.id)">{{ item.active ? '使用中' : '启用' }}</button>
          <button @click="editPrompt(item.id); showPrompts = false">编辑</button>
          <button title="复制" @click="copyPrompt(item.id)"><Plus :size="14" /></button>
          <button title="回滚为新版本" @click="rollback(item.id)"><RotateCcw :size="14" /></button>
        </div>
      </div>
      <button class="secondary-button drawer-new" @click="newPrompt"><Plus :size="14" />新建版本</button>
    </div>

    <ProductPicker v-if="showProductDialog" @close="showProductDialog = false" @pick="selectProduct" />

    <div v-if="pickingLibrary" class="vg-backdrop" @click.self="pickingLibrary = false">
      <section class="vg-dialog vg-dialog--wide">
        <header class="vg-dialog__head"><span class="vg-dialog__title">从素材库选择</span><button type="button" class="vg-icon-btn" aria-label="关闭" @click="pickingLibrary = false"><X :size="16" /></button></header>
        <div class="vg-dialog__body">
          <div v-if="libraryImages.length" class="rp-pick">
            <button v-for="a in libraryImages" :key="a.id" type="button" class="rp-pick__item" :class="{ 'is-on': sourceImages.some((s) => s.fileId === a.fileId) }" :title="a.name" @click="toggleLibraryImage(a)">
              <CloudImage :file-id="a.fileId" /><span>{{ a.name }}</span><Check v-if="sourceImages.some((s) => s.fileId === a.fileId)" :size="14" class="rp-pick__check" />
            </button>
          </div>
          <p v-else class="vg-muted">素材库里还没有图片。</p>
        </div>
        <footer class="vg-dialog__foot"><span class="vg-muted">已选 {{ sourceImages.length }} 张</span><button type="button" class="vg-btn vg-btn--primary" @click="pickingLibrary = false">完成</button></footer>
      </section>
    </div>

    <div v-if="previewFile" class="vg-backdrop" @click.self="previewFile = ''">
      <section class="vg-dialog vg-dialog--wide">
        <header class="vg-dialog__head"><span class="vg-dialog__title">生成结果</span><button type="button" class="vg-icon-btn" aria-label="关闭" @click="previewFile = ''"><X :size="16" /></button></header>
        <div class="vg-dialog__body rp-preview"><CloudImage :file-id="previewFile" /></div>
      </section>
    </div>
  </main>
</template>

<style scoped>
/* Same look as the desktop ProductReplacementView. */
.replacement-page { --ink: var(--theme-text); --muted: var(--theme-text-muted); --line: var(--theme-border); --wash: var(--theme-panel-soft); --green: var(--theme-accent, var(--vg-accent)); --green-soft: var(--theme-accent-soft, var(--vg-accent-soft)); max-width: 1440px; margin: 0 auto; padding: 18px 20px 50px; color: var(--ink); }
.page-header { position: relative; display: flex; align-items: center; gap: 20px; min-height: 116px; padding: 18px 22px; overflow: hidden; border: 1px solid var(--line); border-radius: 14px; background: var(--theme-panel); }
.back-button { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; border: 1px solid var(--theme-border-control, var(--line)); border-radius: 8px; background: var(--theme-control, var(--wash)); color: var(--theme-text-secondary); font-size: 12px; font-weight: 650; cursor: pointer; }
.hero-copy { flex: 1; min-width: 0; }
.hero-copy .eyebrow { display: inline-flex; color: var(--green); }
.hero-copy h1 { display: inline; margin: 0 0 0 8px; font-size: 24px; font-weight: 800; }
.hero-copy p { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
.hero-visual { display: flex; align-items: center; gap: 14px; }
.hero-frame { display: grid; place-items: center; width: 84px; height: 84px; overflow: hidden; border: 2px solid var(--line); border-radius: 16px; background: var(--wash); }
.hero-frame-source { transform: rotate(-8deg); }
.hero-frame-result { transform: rotate(6deg); border-color: var(--green); }
.hero-frame :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.hero-arrow { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--green); color: #fff; }
.icon-button { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid var(--theme-border-control, var(--line)); border-radius: 8px; background: var(--theme-control, var(--theme-panel)); color: var(--theme-text-secondary); cursor: pointer; }
.icon-button:hover { border-color: var(--green); color: var(--ink); }
.workspace-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; align-items: start; gap: 16px; margin-top: 16px; }
.setup-column { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; min-width: 0; }
.prompt-section { grid-column: 1 / -1; }
.content-card { padding: 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--theme-panel); }
.section-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.section-heading > div { display: flex; align-items: center; gap: 11px; }
.section-heading h2 { margin: 0; font-size: 16px; font-weight: 800; }
.step { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--green-soft); color: var(--green); font-size: 10px; font-weight: 800; }
.prompt-heading-icon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: var(--wash); color: var(--muted); }
.section-meta { color: var(--muted); font-size: 12px; }
.product-select-row { display: flex; align-items: stretch; gap: 10px; }
.product-picker-card { display: flex; flex: 1; align-items: center; gap: 12px; min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--wash); color: var(--ink); text-align: left; cursor: pointer; }
.product-picker-cover { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; overflow: hidden; border-radius: 9px; background: var(--theme-panel); color: var(--muted); }
.product-picker-cover :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.product-picker-copy { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
.product-picker-copy small, .product-picker-copy em { color: var(--muted); font-size: 11px; font-style: normal; }
.product-picker-copy strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.product-picker-chevron { color: var(--green); }
.secondary-button, .primary-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 37px; padding: 0 12px; border: 1px solid var(--theme-border-control, var(--line)); border-radius: 8px; background: var(--theme-control, var(--wash)); color: var(--theme-text-secondary); font-size: 12px; font-weight: 650; cursor: pointer; }
.secondary-button:hover { border-color: var(--green); color: var(--ink); }
.secondary-button:disabled { opacity: .5; cursor: not-allowed; }
.primary-button { border-color: var(--green); background: var(--green); color: #fff; }
.upload-product-button { flex-direction: column; width: 120px; }
.product-selection-meta { display: flex; align-items: center; gap: 10px; margin-top: 10px; color: var(--muted); font-size: 12px; }
.product-selection-meta strong { color: var(--ink); }
.text-button { display: inline-flex; align-items: center; gap: 5px; border: 0; background: transparent; color: var(--green); font-size: 12px; cursor: pointer; }
.thumb-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; min-height: 80px; margin-top: 12px; }
.thumb { position: relative; width: 74px; height: 74px; overflow: hidden; border: 1px solid var(--line); border-radius: 8px; background: var(--wash); }
.thumb :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.product-thumb button { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 5px; background: var(--theme-overlay, rgba(0, 0, 0, .55)); color: #fff; cursor: pointer; }
.add-thumb { display: grid; place-items: center; width: 74px; height: 74px; border: 1px dashed var(--theme-border-control, var(--line)); border-radius: 8px; background: var(--wash); color: var(--green); cursor: pointer; }
.empty-inline { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
.drop-zone { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; min-height: 190px; border: 1px dashed var(--theme-border-control, var(--line)); border-radius: 10px; background: var(--wash); text-align: center; }
.drop-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 10px; background: var(--green-soft); color: var(--green); }
.drop-zone strong { font-size: 13px; }
.drop-zone > span { color: var(--muted); font-size: 12px; }
.drop-actions { display: flex; gap: 8px; margin-top: 7px; }
.source-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 12px; }
.source-row { display: flex; align-items: center; gap: 9px; min-width: 0; height: 54px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; }
.source-row :deep(img) { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; }
.source-row span { flex: 1; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.source-row small { color: var(--muted); font-size: 10px; }
.source-row button { display: grid; place-items: center; border: 0; background: transparent; color: var(--muted); cursor: pointer; }
.prompt-editor { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 14px; }
.field-label { display: grid; gap: 7px; color: var(--theme-text-secondary); font-size: 12px; font-weight: 650; }
.prompt-select-wrap { position: relative; display: block; }
.prompt-select-wrap select { width: 100%; appearance: none; padding-right: 30px; }
.prompt-select-wrap svg { position: absolute; top: 50%; right: 10px; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.field-label select, .prompt-actions input, .variant-field select, .prompt-section textarea { min-height: 39px; padding: 0 11px; border: 1px solid var(--theme-border-control, var(--line)); border-radius: 8px; background: var(--theme-input, var(--wash)); color: var(--ink); font-size: 13px; outline: none; }
.field-label select option { background: var(--theme-panel); color: var(--ink); }
.prompt-section textarea { width: 100%; padding: 11px; font: 13px/1.6 inherit; resize: vertical; }
.prompt-actions { display: flex; gap: 8px; margin-top: 9px; }
.prompt-actions input { flex: 1; }
.confirm-column { position: relative; }
.confirm-sticky { position: sticky; top: 16px; padding: 19px 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--theme-panel); }
.confirm-title { display: flex; align-items: center; justify-content: space-between; padding-bottom: 15px; border-bottom: 1px solid var(--line); font-size: 14px; font-weight: 750; }
.confirm-title > div { display: flex; align-items: center; gap: 10px; }
.confirm-title svg { color: var(--green); }
.summary-row { display: flex; justify-content: space-between; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; }
.summary-row strong { max-width: 165px; overflow: hidden; color: var(--ink); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.variant-field { margin-top: 15px; }
.variant-field select { width: 100%; }
.estimate { display: flex; align-items: center; justify-content: space-between; margin: 17px 0 13px; padding: 12px; border-radius: 8px; background: var(--wash); color: var(--muted); font-size: 12px; }
.estimate strong { color: var(--green); font-size: 20px; }
.run-button { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 43px; border: 0; border-radius: 8px; background: var(--green); color: #fff; font-size: 13px; font-weight: 750; cursor: pointer; }
.run-button:disabled { opacity: .45; cursor: not-allowed; }
.model-note { margin: 11px 0 0; color: var(--muted); font-size: 11px; line-height: 1.5; text-align: center; }
.results-section { margin-top: 16px; padding: 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--theme-panel); }
.history-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.history-title { display: flex; align-items: center; gap: 12px; }
.history-title h2 { margin: 0; font-size: 17px; font-weight: 800; }
.history-title p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
.history-icon { color: var(--green); }
.result-metric { display: flex; align-items: center; gap: 5px; color: var(--green); font-size: 12px; }
.history-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin: 14px 0; }
.history-tabs, .history-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.history-tabs button, .history-actions button, .select-exportable { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--wash); color: var(--theme-text-secondary); font-size: 13px; font-weight: 650; cursor: pointer; }
.history-tabs button.is-active { border-color: var(--green); background: var(--green-soft); color: var(--green); }
.history-tabs strong, .select-exportable strong { color: var(--green); }
.history-actions button:disabled { opacity: .5; cursor: not-allowed; }
.batch-list { display: grid; gap: 8px; }
.history-result-card { display: grid; grid-template-columns: 24px 72px minmax(0, 1fr) minmax(0, 1.2fr) auto; align-items: center; gap: 14px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; }
.history-preview { width: 72px; height: 72px; overflow: hidden; border-radius: 8px; background: var(--wash); cursor: zoom-in; }
.history-preview :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.result-placeholder { display: grid; place-items: center; width: 100%; height: 100%; color: var(--theme-tone-red, #ef4444); font-weight: 800; }
.loader { width: 17px; height: 17px; border: 2px solid var(--line); border-top-color: var(--green); border-radius: 50%; animation: spin .8s linear infinite; }
.history-product-info, .history-result-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.history-product-info strong, .history-result-info strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.history-product-info small { color: var(--muted); font-size: 11px; }
.status-label { align-self: flex-start; padding: 3px 8px; border-radius: 5px; background: var(--wash); color: var(--muted); font-size: 11px; }
.status-completed { background: var(--green-soft); color: var(--green); }
.status-failed, .status-partial_failed { color: var(--theme-tone-red, #ef4444); }
.exported-label { display: inline-flex; align-items: center; gap: 4px; color: var(--green); font-size: 11px; }
.history-result-info .error { color: var(--theme-tone-red, #ef4444); font-size: 11px; overflow-wrap: anywhere; }
.history-result-actions { display: flex; gap: 6px; }
.history-result-actions button { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 8px; background: var(--wash); color: var(--theme-text-secondary); cursor: pointer; }
.empty-state { display: flex; align-items: center; justify-content: center; gap: 9px; min-height: 130px; border: 1px dashed var(--line); border-radius: 10px; color: var(--muted); font-size: 13px; }
.prompt-drawer { position: fixed; z-index: 100; top: 58px; right: 20px; width: min(470px, calc(100vw - 30px)); max-height: calc(100vh - 80px); overflow: auto; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--theme-panel); box-shadow: 0 20px 60px rgba(0, 0, 0, .35); }
.drawer-head, .version-row, .version-row > div:last-child { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.drawer-head { margin-bottom: 10px; font-size: 14px; }
.version-row { padding: 12px 0; border-top: 1px solid var(--line); }
.version-row > div:first-child { display: grid; gap: 4px; min-width: 0; }
.version-row strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.version-row small { color: var(--muted); font-size: 11px; }
.version-row button { display: flex; align-items: center; gap: 4px; min-height: 29px; padding: 0 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--wash); color: var(--theme-text-secondary); font-size: 11px; cursor: pointer; }
.version-row button:disabled { color: var(--green); }
.drawer-new { width: 100%; margin-top: 10px; }
.rp-pick { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; max-height: 60vh; overflow: auto; }
.rp-pick__item { position: relative; display: flex; flex-direction: column; gap: 4px; padding: 6px; border: 1px solid var(--line); border-radius: 10px; background: var(--wash); color: var(--ink); cursor: pointer; }
.rp-pick__item.is-on { border-color: var(--green); box-shadow: 0 0 0 1px var(--green) inset; }
.rp-pick__item :deep(img) { width: 100%; aspect-ratio: 1; border-radius: 6px; object-fit: cover; }
.rp-pick__item span { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.rp-pick__check { position: absolute; top: 10px; right: 10px; padding: 2px; border-radius: 50%; background: var(--green); color: #fff; }
.rp-preview { display: grid; place-items: center; }
.rp-preview :deep(img) { max-width: 100%; max-height: 66vh; object-fit: contain; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1100px) { .workspace-grid { grid-template-columns: minmax(0, 1fr); } .setup-column { grid-template-columns: minmax(0, 1fr); } .confirm-sticky { position: static; } .hero-visual { display: none; } .prompt-editor { grid-template-columns: minmax(0, 1fr); } .history-result-card { grid-template-columns: 24px 64px minmax(0, 1fr) auto; } .history-product-info { display: none; } }
</style>
