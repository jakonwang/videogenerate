<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, FolderOpen, ImagePlus, Images, Layers3, LoaderCircle, Pencil, Play, RefreshCcw, Save, SlidersHorizontal, Trash2, Upload } from 'lucide-vue-next'
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
  <div class="watermark-workspace plugin-workspace-standard">
    <section class="workspace-head">
      <div class="workspace-intro">
        <div class="workspace-icon"><Images class="h-5 w-5" /></div>
        <div class="workspace-copy">
          <div class="workspace-eyebrow">{{ t('plugins.detail.eyebrow') }}</div>
          <h1>{{ t('plugins.catalog.product-watermark.name') }}</h1>
          <p>{{ t('productWatermark.hero.description') }}</p>
        </div>
        <div class="workspace-actions">
          <button class="ghost-button" type="button" @click="router.push('/plugins')"><ChevronLeft class="h-4 w-4" />{{ t('productWatermark.actions.back') }}</button>
        </div>
      </div>
    </section>

    <div v-if="notice" class="banner banner-success">{{ notice }}</div>
    <div v-if="errorText" class="banner banner-error">{{ errorText }}</div>

    <section class="watermark-grid">
      <article class="watermark-panel">
        <div class="panel-head"><div class="panel-title-wrap"><span class="panel-icon"><Layers3 class="h-5 w-5" /></span><strong>{{ t('productWatermark.sections.template') }}</strong></div><span class="panel-head-note">{{ t('productWatermark.labels.savedTemplates', { count: templates.length }) }}</span></div>
        <div class="field-stack">
          <div class="field"><span>{{ t('productWatermark.labels.chooseSaved') }}</span><select v-model="selectedId" class="workspace-select"><option value="">{{ t('productWatermark.placeholders.template') }}</option><option v-for="item in templates" :key="item.id" :value="item.id">{{ item.name }} ({{ item.width }} x {{ item.height }})</option></select></div>
          <div v-if="selectedTemplate" class="selected-template"><div class="template-thumb"><img :src="previewSrc(selectedTemplate.filePath)" alt="" /></div><div class="template-copy"><strong>{{ selectedTemplate.name }}</strong><small>{{ selectedTemplate.width }} x {{ selectedTemplate.height }} - {{ t('productWatermark.labels.transparent') }}</small></div><button class="icon-action" type="button" :title="t('productWatermark.actions.rename')" @click="renameTemplate"><Pencil class="h-4 w-4" /></button><button class="icon-action danger-action" type="button" :title="t('productWatermark.actions.delete')" @click="deleteTemplate"><Trash2 class="h-4 w-4" /></button></div>
          <div class="field"><span>{{ t('productWatermark.labels.newTemplate') }}</span><div class="template-upload" :class="{ 'is-dragging': draggingTemplate }" @dragover.prevent="draggingTemplate = true" @dragleave.prevent="draggingTemplate = false" @drop.prevent="onTemplateDrop"><Upload class="h-5 w-5" /><strong>{{ templatePath ? fileName(templatePath) : t('productWatermark.labels.dropTemplate') }}</strong><small>{{ t('productWatermark.labels.templateRules') }}</small><button class="ghost-button" type="button" @click="chooseTemplate">{{ t('productWatermark.actions.chooseTemplate') }}</button></div></div>
          <div class="inline-form"><input v-model="templateName" class="workspace-input" :placeholder="t('productWatermark.placeholders.templateName')" /><button class="primary-button" type="button" :disabled="!templatePath || !templateName.trim()" @click="saveTemplate"><Save class="h-4 w-4" />{{ t('productWatermark.actions.saveTemplate') }}</button></div>
        </div>
      </article>

      <article class="watermark-panel">
        <div class="panel-head"><div class="panel-title-wrap"><span class="panel-icon"><Images class="h-5 w-5" /></span><strong>{{ t('productWatermark.sections.images') }}</strong></div><span class="panel-head-note">{{ t('productWatermark.labels.selected', { selected: selectedImages.length, total: sourcePaths.length }) }}</span></div>
        <div class="image-drop" :class="{ 'is-dragging': draggingImages }" @dragover.prevent="draggingImages = true" @dragleave.prevent="draggingImages = false" @drop.prevent="onImagesDrop"><ImagePlus class="h-6 w-6" /><strong>{{ t('productWatermark.labels.dropImages') }}</strong><small>{{ t('productWatermark.labels.supportedImages') }}</small><div class="image-drop-actions"><button class="ghost-button" type="button" @click="chooseImages"><Images class="h-4 w-4" />{{ t('productWatermark.actions.chooseImages') }}</button><button class="ghost-button" type="button" @click="chooseLibraryImages"><Images class="h-4 w-4" />{{ t('productWatermark.actions.chooseFromLibrary') }}</button></div></div>
        <div v-if="sourcePaths.length" class="queue-head"><span>{{ t('productWatermark.labels.queue') }}</span><div class="queue-actions"><button class="text-action" type="button" @click="toggleAllImages">{{ selectedImages.length === sourcePaths.length ? t('productWatermark.actions.clearSelection') : t('productWatermark.actions.selectAll') }}</button><button class="text-action" type="button" @click="clearImages">{{ t('productWatermark.actions.clear') }}</button></div></div>
        <div v-if="sourcePaths.length" class="image-grid"><button v-for="path in sourcePaths" :key="path" class="image-tile" :class="{ selected: selectedImages.includes(path) }" type="button" @click="toggleImage(path)"><img :src="previewSrc(path)" alt="" /><span class="image-check">{{ selectedImages.includes(path) ? 'x' : '' }}</span><span class="image-remove" :title="t('productWatermark.actions.removeImage')" @click.stop="removeImage(path)">x</span><span class="image-label">{{ fileName(path) }}</span></button></div>
        <div v-else class="empty-queue">{{ t('productWatermark.empty.images') }}</div>
      </article>

      <article class="watermark-panel export-panel">
        <div class="panel-head"><div class="panel-title-wrap"><span class="panel-icon"><SlidersHorizontal class="h-5 w-5" /></span><strong>{{ t('productWatermark.sections.export') }}</strong></div></div>
        <div class="field-stack">
          <div class="field"><span>{{ t('productWatermark.labels.outputFolder') }}</span><div class="output-picker"><button class="ghost-button" type="button" @click="chooseOutput"><FolderOpen class="h-4 w-4" />{{ t('productWatermark.actions.chooseFolder') }}</button><span :title="outputDir">{{ outputDir || t('productWatermark.placeholders.outputFolder') }}</span></div></div>
          <div class="export-spec"><div><span>{{ t('productWatermark.labels.format') }}</span><strong>JPEG</strong></div><div><span>{{ t('productWatermark.labels.crop') }}</span><strong>{{ t('productWatermark.labels.centerSquare') }}</strong></div><div><span>{{ t('productWatermark.labels.background') }}</span><strong>{{ t('productWatermark.labels.white') }}</strong></div></div>
          <button class="primary-button run-button" type="button" :disabled="busy" @click="processPaths(selectedImages)"><LoaderCircle v-if="busy" class="h-4 w-4 spin" /><Play v-else class="h-4 w-4" />{{ busy ? t('productWatermark.actions.processing') : t('productWatermark.actions.process') }}</button>
        </div>
        <div v-if="result" class="result-block"><div class="result-summary"><strong>{{ t('productWatermark.labels.results') }}</strong><span class="result-success">{{ t('productWatermark.labels.succeeded', { count: result.successCount }) }}</span><span v-if="result.failedCount" class="result-failed">{{ t('productWatermark.labels.failed', { count: result.failedCount }) }}</span></div><ul v-if="result.failed.length" class="failure-list"><li v-for="item in result.failed" :key="item.name"><span>{{ item.name }}</span><small>{{ item.reason }}</small></li></ul><button v-if="result.failed.length" class="ghost-button retry-button" type="button" @click="processPaths(sourcePaths.filter((path) => result?.failed.some((item) => item.name === fileName(path))))"><RefreshCcw class="h-4 w-4" />{{ t('productWatermark.actions.retryFailed') }}</button><ul v-if="result.success.length" class="success-list"><li v-for="path in result.success" :key="path">{{ fileName(path) }}</li></ul></div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.watermark-workspace { display:grid; align-content:start; gap:18px; padding:4px 12px 24px; color:var(--text-primary,#e8eef8); }
.workspace-head { display:grid; gap:14px; }
.workspace-intro { display:flex; align-items:center; gap:14px; min-width:0; }
.workspace-icon { width:76px; height:76px; flex:0 0 76px; display:grid; place-items:center; border-radius:16px; color:#39e0b1; background:linear-gradient(145deg,rgba(31,184,141,.35),rgba(5,73,69,.52)); border:1px solid rgba(57,224,177,.32); box-shadow:0 10px 28px rgba(9,190,149,.12); }
.workspace-icon svg { width:38px; height:38px; }
.workspace-copy { min-width:0; flex:1; }
.workspace-eyebrow { color:var(--text-muted,#8492a8); font-size:12px; margin-bottom:3px; }
.workspace-copy h1 { margin:0; font-size:28px; line-height:1.15; font-weight:800; letter-spacing:.01em; }
.workspace-copy p { margin:4px 0 0; color:var(--text-secondary,#9eabc0); font-size:13px; }
.workspace-actions { display:flex; gap:8px; }
.watermark-grid { display:grid !important; grid-template-columns:minmax(300px,1fr) minmax(340px,1.08fr) minmax(300px,.94fr); gap:16px; align-items:stretch; }
.watermark-panel { min-width:0; padding:0 16px 16px; border:1px solid #263d55; border-radius:16px; background:linear-gradient(180deg,#0e1b2b 0%,#0b1523 100%); overflow:hidden; }
.panel-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0 -16px 18px; padding:14px 16px; background:linear-gradient(180deg,rgba(42,61,83,.76),rgba(24,40,59,.7)); border-bottom:1px solid rgba(100,137,171,.16); }
.panel-title-wrap { display:flex; align-items:center; gap:9px; min-width:0; }
.panel-title-wrap strong { font-size:19px; font-weight:800; }
.panel-icon { width:34px; height:34px; display:grid; place-items:center; flex:none; color:#31e1b1; }
.panel-head-note { color:var(--text-muted,#8492a8); font-size:11px; white-space:nowrap; }
.field-stack { display:grid; gap:13px; }
.field { display:grid; gap:6px; min-width:0; }
.field>span { color:var(--text-secondary,#aab6c8); font-size:12px; font-weight:600; }
.workspace-select,.workspace-input { width:100%; min-width:0; height:48px; box-sizing:border-box; padding:0 13px; border-radius:10px; border:1px solid #304962; background:rgba(5,12,22,.66); color:var(--text-primary,#e8eef8); font:inherit; font-size:14px; }
.selected-template { display:flex; align-items:center; gap:9px; padding:8px; border:1px solid var(--border-subtle,#27364b); border-radius:8px; background:rgba(255,255,255,.025); }
.template-thumb { width:38px; height:38px; display:grid; place-items:center; overflow:hidden; border-radius:6px; background-color:#fff; background-image:linear-gradient(45deg,#ddd 25%,transparent 25%),linear-gradient(-45deg,#ddd 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ddd 75%),linear-gradient(-45deg,transparent 75%,#ddd 75%); background-size:10px 10px; background-position:0 0,0 5px,5px -5px,-5px 0; }
.template-thumb img { width:100%; height:100%; object-fit:contain; }
.template-copy { display:grid; gap:3px; flex:1; min-width:0; }
.template-copy strong { font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.template-copy small { color:var(--text-muted,#8492a8); font-size:10px; }
.icon-action { width:30px; height:30px; display:grid; place-items:center; flex:none; border:1px solid var(--border-subtle,#334155); border-radius:6px; color:var(--text-secondary,#aab6c8); background:transparent; cursor:pointer; }
.danger-action { color:#ed8f9a; }
.template-upload,.image-drop { display:grid; justify-items:center; gap:10px; padding:22px 10px; border:1px dashed #50718d; border-radius:12px; color:#31e1b1; background:rgba(21,55,77,.18); text-align:center; transition:background .15s,border-color .15s; }
.template-upload.is-dragging,.image-drop.is-dragging { border-color:#50c6a2; background:rgba(36,184,139,.1); }
.template-upload strong,.image-drop strong { color:var(--text-primary,#e8eef8); font-size:15px; max-width:100%; overflow-wrap:anywhere; }
.template-upload small,.image-drop small { color:var(--text-muted,#8492a8); font-size:10px; }
.ghost-button,.primary-button { min-height:40px; display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:0 14px; border-radius:10px; border:1px solid #30445b; background:linear-gradient(180deg,#24344b,#182638); color:var(--text-primary,#e8eef8); font:inherit; font-size:13px; font-weight:700; cursor:pointer; }
.ghost-button:hover { border-color:#4f7087; }
.primary-button { border-color:#17c8a3; background:linear-gradient(180deg,#1fd3b0,#0ea991); color:#fff; }
.primary-button:disabled { opacity:.5; cursor:not-allowed; }
.inline-form { display:flex; gap:7px; }
.inline-form .primary-button { flex:none; }
.image-drop { min-height:190px; align-content:center; padding:20px; }
.image-drop-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; }
.queue-head { display:flex; justify-content:space-between; align-items:center; margin:13px 0 5px; color:var(--text-secondary,#aab6c8); font-size:11px; font-weight:600; }
.queue-actions { display:flex; gap:10px; }
.text-action { padding:3px 0; border:0; background:none; color:#74c9e4; font:inherit; cursor:pointer; }
.image-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; max-height:280px; overflow:auto; }
.image-tile { position:relative; min-width:0; aspect-ratio:1; overflow:hidden; padding:0; border:1px solid var(--border-subtle,#334155); border-radius:8px; background:#111b2a; cursor:pointer; }
.image-tile.selected { border-color:#36c59b; box-shadow:0 0 0 1px #36c59b inset; }
.image-tile img { width:100%; height:100%; object-fit:cover; display:block; }
.image-check { position:absolute; top:5px; left:5px; width:18px; height:18px; display:grid; place-items:center; border-radius:50%; border:1px solid rgba(255,255,255,.7); background:rgba(5,12,20,.65); color:#fff; font-size:11px; }
.image-tile.selected .image-check { background:#21ae84; border-color:#21ae84; }
.image-remove { position:absolute; top:4px; right:5px; width:18px; height:18px; display:grid; place-items:center; border-radius:50%; background:rgba(5,12,20,.72); color:#fff; font-size:14px; line-height:1; }
.image-label { position:absolute; right:0; bottom:0; left:0; overflow:hidden; padding:12px 5px 4px; background:linear-gradient(transparent,rgba(0,0,0,.78)); color:#fff; font-size:9px; text-align:left; text-overflow:ellipsis; white-space:nowrap; }
.image-queue,.failure-list,.success-list { list-style:none; padding:0; margin:0; max-height:245px; overflow:auto; }
.image-queue li { display:flex; align-items:center; gap:8px; min-width:0; padding:7px 2px; border-bottom:1px solid rgba(137,158,181,.12); }
.file-mark { width:26px; height:23px; flex:none; display:grid; place-items:center; border-radius:5px; background:rgba(68,183,211,.12); color:#7dd2e7; font-size:8px; font-weight:700; }
.file-name { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-primary,#dce6f2); font-size:11px; }
.file-dimensions { color:var(--text-muted,#8492a8); font-size:10px; }
.empty-queue { display:grid; min-height:145px; place-items:center; color:var(--text-muted,#8492a8); font-size:12px; }
.output-picker { display:flex; align-items:center; gap:9px; min-width:0; }
.output-picker>span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-muted,#8492a8); font-size:11px; }
.export-spec { display:grid; gap:0; border:1px solid #263d55; border-radius:12px; overflow:hidden; }
.export-spec>div { display:flex; justify-content:space-between; gap:8px; padding:15px 14px; border-bottom:1px solid rgba(137,158,181,.14); font-size:14px; }
.export-spec>div:last-child { border:0; }
.export-spec span { color:var(--text-muted,#8492a8); }
.export-spec strong { color:var(--text-primary,#dce6f2); font-weight:600; }
.run-button { width:100%; min-height:52px; font-size:16px; }
.spin { animation:spin .9s linear infinite; }
.result-block { margin-top:15px; padding-top:13px; border-top:1px solid rgba(137,158,181,.16); }
.result-summary { display:flex; flex-wrap:wrap; gap:8px; align-items:center; font-size:11px; }
.result-summary strong { width:100%; font-size:12px; }
.result-success,.result-failed { padding:3px 6px; border-radius:5px; background:rgba(49,174,123,.12); color:#72d5a5; }
.result-failed { background:rgba(219,90,105,.13); color:#f39aa3; }
.failure-list,.success-list { margin-top:8px; max-height:110px; }
.failure-list li { display:grid; gap:3px; padding:6px 0; border-bottom:1px solid rgba(137,158,181,.1); font-size:10px; }
.failure-list small { color:#f39aa3; overflow-wrap:anywhere; }
.success-list li { padding:4px 0; color:#8d9cb1; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.retry-button { margin-top:9px; }
@keyframes spin { to { transform:rotate(360deg); } }
@media (max-width:1050px) { .watermark-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .export-panel { grid-column:1/-1; } }
@media (max-width:700px) { .watermark-workspace { padding:0 0 18px; } .watermark-grid { grid-template-columns:1fr; } .export-panel { grid-column:auto; } .workspace-intro { align-items:flex-start; flex-wrap:wrap; } .workspace-actions { width:100%; padding-left:56px; } .workspace-copy h1 { font-size:19px; } }
</style>
