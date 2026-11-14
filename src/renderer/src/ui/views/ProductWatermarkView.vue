<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, FolderOpen, ImagePlus, Images, Layers3, LoaderCircle, Pencil, Play, RefreshCcw, Save, SlidersHorizontal, Trash2, Upload, X } from 'lucide-vue-next'
import { thumbnailUrl } from '@/lib/localMedia'
import { openAssetLibraryPicker } from '@/lib/assetLibraryPicker'

type Template = { id: string; name: string; width: number; height: number; filePath: string }
type Result = { successCount: number; failedCount: number; success: string[]; failed: Array<{ name: string; reason: string }> }
const router = useRouter()
const { t } = useI18n()
const templates = ref<Template[]>([])
const selectedId = ref('')
const templatePath = ref('')
const templateName = ref('')
const sourcePaths = ref<string[]>([])
const selectedImages = ref<string[]>([])
const outputDir = ref('')
const busy = ref(false)
const draggingTemplate = ref(false)
const draggingImages = ref(false)
const notice = ref('')
const errorText = ref('')
const result = ref<Result | null>(null)
const selectedTemplate = computed(() => templates.value.find((item) => item.id === selectedId.value) || null)
const fileName = (path: string) => path.split(/[\\/]/).pop() || path

async function loadTemplates() {
  templates.value = await window.api.productWatermark.listTemplates() as Template[]
  if (!selectedId.value && templates.value[0]) selectedId.value = templates.value[0].id
}
function addTemplateFile(path: string) {
  if (!path) return
  if (!/\.(png|webp)$/i.test(path)) { errorText.value = t('productWatermark.errors.templateFormat'); return }
  templatePath.value = path
  errorText.value = ''
}
async function chooseTemplate() {
  const paths = await window.api.pickFiles({ title: t('productWatermark.pickers.template'), multiple: false, filters: [{ name: 'PNG or WebP', extensions: ['png', 'webp'] }] })
  addTemplateFile(paths[0] || '')
}
function onTemplateDrop(event: DragEvent) {
  draggingTemplate.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) addTemplateFile(window.api.getPathForFile(file))
}
async function saveTemplate() {
  errorText.value = ''; notice.value = ''
  if (!templatePath.value || !templateName.value.trim()) { errorText.value = t('productWatermark.errors.templateNameAndFile'); return }
  try {
    const item = await window.api.productWatermark.saveTemplate({ filePath: templatePath.value, name: templateName.value }) as Template
    await loadTemplates(); selectedId.value = item.id; templatePath.value = ''; templateName.value = ''; notice.value = t('productWatermark.messages.templateSaved')
  } catch (error: any) { errorText.value = error?.message || String(error) }
}
function addImagePaths(paths: string[]) {
  const accepted = paths.filter((path) => /\.(jpe?g|png|webp)$/i.test(path))
  sourcePaths.value = [...new Set([...sourcePaths.value, ...accepted])]
  selectedImages.value = [...new Set([...selectedImages.value, ...accepted])]
  errorText.value = paths.length && !accepted.length ? t('productWatermark.errors.noSupportedImages') : ''
}
async function chooseImages() {
  const paths = await window.api.pickFiles({ title: t('productWatermark.pickers.images'), multiple: true, filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] })
  addImagePaths(paths)
}
async function chooseLibraryImages() {
  const selected = await openAssetLibraryPicker({ type: 'image', multiple: true, usagePlugin: 'product-watermark' })
  if (selected) addImagePaths(selected.map((item) => item.filePath))
}
function onImagesDrop(event: DragEvent) {
  draggingImages.value = false
  const paths = Array.from(event.dataTransfer?.files || []).map((file) => window.api.getPathForFile(file)).filter(Boolean)
  addImagePaths(paths)
}
async function chooseOutput() { outputDir.value = await window.api.pickDir({ title: t('productWatermark.pickers.output') }) || '' }
async function processPaths(paths: string[]) {
  const sourcePaths = Array.from(paths || [], (path) => String(path))
  errorText.value = ''; notice.value = ''; result.value = null
  if (!selectedId.value) { errorText.value = t('productWatermark.errors.selectTemplate'); return }
  if (!sourcePaths.length) { errorText.value = t('productWatermark.errors.selectImages'); return }
  if (!outputDir.value) { errorText.value = t('productWatermark.errors.selectOutput'); return }
  busy.value = true
  try {
    result.value = await window.api.productWatermark.processBatch({ templateId: String(selectedId.value), sourcePaths, outputDir: String(outputDir.value) }) as Result
    notice.value = t('productWatermark.messages.processed', { success: result.value.successCount, failed: result.value.failedCount })
  } catch (error: any) { errorText.value = error?.message || String(error) } finally { busy.value = false }
}
function renameTemplate() {
  if (!selectedTemplate.value) return
  const name = window.prompt(t('productWatermark.prompts.rename'), selectedTemplate.value.name)
  if (name?.trim()) void window.api.productWatermark.renameTemplate({ id: selectedTemplate.value.id, name }).then(loadTemplates)
}
async function deleteTemplate() {
  if (!selectedId.value || !window.confirm(t('productWatermark.prompts.delete'))) return
  await window.api.productWatermark.deleteTemplate(selectedId.value); selectedId.value = ''; await loadTemplates()
}
function clearImages() { sourcePaths.value = []; selectedImages.value = []; result.value = null }
function toggleImage(path: string) {
  selectedImages.value = selectedImages.value.includes(path) ? selectedImages.value.filter((item) => item !== path) : [...selectedImages.value, path]
}
function removeImage(path: string) {
  sourcePaths.value = sourcePaths.value.filter((item) => item !== path)
  selectedImages.value = selectedImages.value.filter((item) => item !== path)
}
function toggleAllImages() {
  selectedImages.value = selectedImages.value.length === sourcePaths.value.length ? [] : [...sourcePaths.value]
}
const previewSrc = (path: string) => `vg://file?path=${encodeURIComponent(path)}`
onMounted(loadTemplates)
</script>

<template>
  <div class="vg-scope vg-page wm">
    <header class="vg-page-head">
      <button class="vg-icon-btn" type="button" :title="t('productWatermark.actions.back')" @click="router.push('/plugins')"><ChevronLeft :size="18" /></button>
      <span class="vg-page-head__icon"><Images :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('plugins.catalog.product-watermark.name') }}</h1>
        <p>{{ t('productWatermark.hero.description') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <span class="vg-pill vg-pill--accent">{{ t('plugins.detail.eyebrow') }}</span>
      </div>
    </header>

    <div v-if="notice" class="vg-notice vg-notice--accent"><CheckCircle2 :size="16" /><span>{{ notice }}</span></div>
    <div v-if="errorText" class="vg-notice vg-notice--danger"><AlertTriangle :size="16" /><span>{{ errorText }}</span></div>

    <section class="wm-grid">
      <!-- 1. Template -->
      <article class="vg-card wm-panel">
        <div class="vg-card__head">
          <span class="vg-card__title"><span class="wm-step">1</span><Layers3 :size="16" /> {{ t('productWatermark.sections.template') }}</span>
          <span class="vg-chip">{{ t('productWatermark.labels.savedTemplates', { count: templates.length }) }}</span>
        </div>
        <div class="vg-stack">
          <div class="vg-field">
            <label for="wm-template">{{ t('productWatermark.labels.chooseSaved') }}</label>
            <select id="wm-template" v-model="selectedId" class="vg-select">
              <option value="">{{ t('productWatermark.placeholders.template') }}</option>
              <option v-for="item in templates" :key="item.id" :value="item.id">{{ item.name }} ({{ item.width }} x {{ item.height }})</option>
            </select>
          </div>

          <div v-if="selectedTemplate" class="wm-selected">
            <div class="wm-checker wm-selected__thumb"><img :src="previewSrc(selectedTemplate.filePath)" alt="" /></div>
            <div class="wm-selected__copy">
              <strong>{{ selectedTemplate.name }}</strong>
              <small>{{ selectedTemplate.width }} x {{ selectedTemplate.height }} · {{ t('productWatermark.labels.transparent') }}</small>
            </div>
            <button class="vg-icon-btn" type="button" :title="t('productWatermark.actions.rename')" @click="renameTemplate"><Pencil :size="15" /></button>
            <button class="vg-icon-btn vg-icon-btn--danger" type="button" :title="t('productWatermark.actions.delete')" @click="deleteTemplate"><Trash2 :size="15" /></button>
          </div>

          <div class="vg-field">
            <label>{{ t('productWatermark.labels.newTemplate') }}</label>
            <div
              class="wm-drop"
              :class="{ 'is-dragging': draggingTemplate, 'has-file': templatePath }"
              @dragover.prevent="draggingTemplate = true"
              @dragleave.prevent="draggingTemplate = false"
              @drop.prevent="onTemplateDrop"
            >
              <Upload :size="20" />
              <strong>{{ templatePath ? fileName(templatePath) : t('productWatermark.labels.dropTemplate') }}</strong>
              <small>{{ t('productWatermark.labels.templateRules') }}</small>
              <button class="vg-btn vg-btn--sm" type="button" @click="chooseTemplate">{{ t('productWatermark.actions.chooseTemplate') }}</button>
            </div>
          </div>
          <div class="vg-row wm-inline">
            <input v-model="templateName" class="vg-input" :placeholder="t('productWatermark.placeholders.templateName')" />
            <button class="vg-btn vg-btn--primary" type="button" :disabled="!templatePath || !templateName.trim()" @click="saveTemplate">
              <Save :size="15" /> {{ t('productWatermark.actions.saveTemplate') }}
            </button>
          </div>
        </div>
      </article>

      <!-- 2. Images -->
      <article class="vg-card wm-panel">
        <div class="vg-card__head">
          <span class="vg-card__title"><span class="wm-step">2</span><Images :size="16" /> {{ t('productWatermark.sections.images') }}</span>
          <span class="vg-chip">{{ t('productWatermark.labels.selected', { selected: selectedImages.length, total: sourcePaths.length }) }}</span>
        </div>
        <div
          class="wm-drop wm-drop--images"
          :class="{ 'is-dragging': draggingImages }"
          @dragover.prevent="draggingImages = true"
          @dragleave.prevent="draggingImages = false"
          @drop.prevent="onImagesDrop"
        >
          <ImagePlus :size="22" />
          <strong>{{ t('productWatermark.labels.dropImages') }}</strong>
          <small>{{ t('productWatermark.labels.supportedImages') }}</small>
          <div class="vg-row">
            <button class="vg-btn vg-btn--sm" type="button" @click="chooseImages"><Images :size="14" /> {{ t('productWatermark.actions.chooseImages') }}</button>
            <button class="vg-btn vg-btn--sm" type="button" @click="chooseLibraryImages"><FolderOpen :size="14" /> {{ t('productWatermark.actions.chooseFromLibrary') }}</button>
          </div>
        </div>

        <template v-if="sourcePaths.length">
          <div class="wm-queue-head">
            <span class="vg-muted">{{ t('productWatermark.labels.queue') }}</span>
            <div class="vg-row">
              <button class="vg-link" type="button" @click="toggleAllImages">{{ selectedImages.length === sourcePaths.length ? t('productWatermark.actions.clearSelection') : t('productWatermark.actions.selectAll') }}</button>
              <button class="vg-link vg-link--muted" type="button" @click="clearImages">{{ t('productWatermark.actions.clear') }}</button>
            </div>
          </div>
          <div class="wm-images">
            <button
              v-for="path in sourcePaths"
              :key="path"
              class="wm-image"
              :class="{ 'is-selected': selectedImages.includes(path) }"
              type="button"
              :title="fileName(path)"
              @click="toggleImage(path)"
            >
              <img :src="thumbnailUrl(path, 160)" alt="" loading="lazy" decoding="async" />
              <span class="wm-image__check"><Check :size="12" /></span>
              <span class="wm-image__remove" :title="t('productWatermark.actions.removeImage')" @click.stop="removeImage(path)"><X :size="12" /></span>
              <span class="wm-image__label">{{ fileName(path) }}</span>
            </button>
          </div>
        </template>
        <div v-else class="vg-empty wm-empty"><p>{{ t('productWatermark.empty.images') }}</p></div>
      </article>

      <!-- 3. Export -->
      <article class="vg-card wm-panel">
        <div class="vg-card__head">
          <span class="vg-card__title"><span class="wm-step">3</span><SlidersHorizontal :size="16" /> {{ t('productWatermark.sections.export') }}</span>
        </div>
        <div class="vg-stack">
          <div class="vg-field">
            <label>{{ t('productWatermark.labels.outputFolder') }}</label>
            <div class="wm-output">
              <button class="vg-btn vg-btn--sm" type="button" @click="chooseOutput"><FolderOpen :size="14" /> {{ t('productWatermark.actions.chooseFolder') }}</button>
              <span :title="outputDir" :class="{ 'vg-muted': !outputDir }">{{ outputDir || t('productWatermark.placeholders.outputFolder') }}</span>
            </div>
          </div>
          <dl class="vg-kv wm-spec">
            <dt>{{ t('productWatermark.labels.format') }}</dt><dd>JPEG</dd>
            <dt>{{ t('productWatermark.labels.crop') }}</dt><dd>{{ t('productWatermark.labels.centerSquare') }}</dd>
            <dt>{{ t('productWatermark.labels.background') }}</dt><dd>{{ t('productWatermark.labels.white') }}</dd>
          </dl>
          <button class="vg-btn vg-btn--primary vg-btn--lg vg-btn--block" type="button" :disabled="busy" @click="processPaths(selectedImages)">
            <LoaderCircle v-if="busy" :size="16" class="vg-spin" /><Play v-else :size="16" />
            {{ busy ? t('productWatermark.actions.processing') : t('productWatermark.actions.process') }}
          </button>
        </div>

        <div v-if="result" class="vg-stack wm-result">
          <div class="vg-row">
            <strong>{{ t('productWatermark.labels.results') }}</strong>
            <span class="vg-pill vg-pill--green">{{ t('productWatermark.labels.succeeded', { count: result.successCount }) }}</span>
            <span v-if="result.failedCount" class="vg-pill vg-pill--red">{{ t('productWatermark.labels.failed', { count: result.failedCount }) }}</span>
          </div>
          <ul v-if="result.failed.length" class="wm-list wm-list--failed">
            <li v-for="item in result.failed" :key="item.name"><span>{{ item.name }}</span><small>{{ item.reason }}</small></li>
          </ul>
          <button
            v-if="result.failed.length"
            class="vg-btn vg-btn--sm"
            type="button"
            @click="processPaths(sourcePaths.filter((path) => result?.failed.some((item) => item.name === fileName(path))))"
          >
            <RefreshCcw :size="14" /> {{ t('productWatermark.actions.retryFailed') }}
          </button>
          <ul v-if="result.success.length" class="wm-list">
            <li v-for="path in result.success" :key="path"><span>{{ fileName(path) }}</span></li>
          </ul>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.wm { width: min(1480px, 100%); margin: 0 auto; }
.wm-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, .9fr); gap: 14px; align-items: start; }
.wm-panel { display: flex; flex-direction: column; gap: 12px; }
.wm-panel .vg-card__head { margin-bottom: 0; }
.wm-step { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: var(--vg-accent); color: var(--theme-on-accent); font-size: 11px; font-weight: 800; }

/* Transparent PNG preview */
.wm-checker { background-color: var(--theme-panel); background-image: linear-gradient(45deg, var(--theme-panel-soft) 25%, transparent 25%), linear-gradient(-45deg, var(--theme-panel-soft) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--theme-panel-soft) 75%), linear-gradient(-45deg, transparent 75%, var(--theme-panel-soft) 75%); background-size: 12px 12px; background-position: 0 0, 0 6px, 6px -6px, -6px 0; }
.wm-selected { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--vg-accent-line); border-radius: var(--vg-radius-sm); background: var(--vg-accent-soft); }
.wm-selected__thumb { width: 52px; height: 52px; border-radius: 7px; border: 1px solid var(--theme-border); overflow: hidden; flex-shrink: 0; }
.wm-selected__thumb img { width: 100%; height: 100%; object-fit: contain; }
.wm-selected__copy { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.wm-selected__copy strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wm-selected__copy small { color: var(--theme-text-muted); }

/* Drop zones */
.wm-drop { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 14px; border: 1.5px dashed var(--theme-border-control); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); color: var(--theme-text-muted); text-align: center; transition: border-color .15s, background .15s; }
.wm-drop strong { font-size: 13px; color: var(--theme-text); overflow-wrap: anywhere; }
.wm-drop small { font-size: 11px; }
.wm-drop > svg { color: var(--vg-accent); }
.wm-drop.is-dragging, .wm-drop.has-file { border-color: var(--vg-accent); background: var(--vg-accent-soft); }
.wm-drop--images { padding: 22px 14px; }
.wm-inline { flex-wrap: nowrap; }
.wm-inline .vg-input { flex: 1; }

/* Image queue */
.wm-queue-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; }
.wm-images { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 8px; max-height: 420px; overflow-y: auto; }
.wm-image { position: relative; aspect-ratio: 1; padding: 0; border: 2px solid transparent; border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); overflow: hidden; cursor: pointer; outline: 1px solid var(--theme-border); outline-offset: -1px; }
.wm-image img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: .55; transition: opacity .15s; }
.wm-image.is-selected { border-color: var(--vg-accent); }
.wm-image.is-selected img { opacity: 1; }
.wm-image__check { position: absolute; top: 4px; left: 4px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 5px; border: 1px solid var(--theme-border-control); background: color-mix(in srgb, var(--theme-panel) 85%, transparent); color: transparent; }
.wm-image.is-selected .wm-image__check { background: var(--vg-accent); border-color: var(--vg-accent); color: var(--theme-on-accent); }
.wm-image__remove { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 5px; background: color-mix(in srgb, var(--theme-panel) 85%, transparent); color: var(--theme-text-secondary); opacity: 0; transition: opacity .15s; }
.wm-image:hover .wm-image__remove { opacity: 1; }
.wm-image__remove:hover { color: var(--vg-red); }
.wm-image__label { position: absolute; left: 0; right: 0; bottom: 0; padding: 3px 5px; background: color-mix(in srgb, var(--theme-root) 70%, transparent); color: var(--theme-text); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
.wm-empty { padding: 20px 12px; }

/* Export */
.wm-output { display: flex; align-items: center; gap: 8px; min-width: 0; }
.wm-output span { flex: 1; min-width: 0; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wm-spec { padding: 10px 12px; border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); font-size: 12px; }
.wm-result { padding-top: 12px; border-top: 1px solid var(--theme-divider); gap: 8px; }
.wm-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; font-size: 12px; }
.wm-list li { display: flex; flex-direction: column; padding: 6px 8px; border-radius: 6px; background: var(--theme-panel-soft); color: var(--theme-text-secondary); overflow-wrap: anywhere; }
.wm-list--failed li { background: color-mix(in srgb, var(--vg-red) 8%, transparent); color: var(--vg-red); }
.wm-list small { color: var(--theme-text-muted); }

@media (max-width: 1240px) { .wm-grid { grid-template-columns: 1fr 1fr; } .wm-grid > :last-child { grid-column: 1 / -1; } }
@media (max-width: 860px) { .wm-grid { grid-template-columns: 1fr; } }
</style>
