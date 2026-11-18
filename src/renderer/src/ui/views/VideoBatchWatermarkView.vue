<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { CheckCircle2, ChevronLeft, FolderOpen, Images, Loader2, Play, RotateCcw, Stamp, Trash2, X, XCircle } from 'lucide-vue-next'
import { openAssetLibraryPicker } from '@/lib/assetLibraryPicker'
import { localMediaUrl } from '@/lib/localMedia'

type Position = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
type Settings = { kind: 'text' | 'image'; text: string; imagePath: string; color: string; position: Position; opacity: number; scale: number; margin: number }
type Item = { id: string; sourcePath: string; outputPath?: string; status: 'queued' | 'running' | 'done' | 'failed'; error?: string }
type Batch = { id: string; createdAt: number; outputDir: string; items: Item[]; settings: Settings }

const { t } = useI18n()
const router = useRouter()
const videos = ref<string[]>([])
const settings = ref<Settings>({ kind: 'text', text: '', imagePath: '', color: '#FFFFFF', position: 'bottom-right', opacity: 0.8, scale: 0.22, margin: 0.04 })
const outputDir = ref('')
const archive = ref(true)
const batches = ref<Batch[]>([])
const previewPath = ref('')
const busy = ref(false)
const error = ref('')
let previewTimer = 0
let unsubscribe: (() => void) | null = null

const positions: Position[] = ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right']
const canStart = computed(() => videos.value.length > 0 && (settings.value.kind === 'text' ? settings.value.text.trim().length > 0 : Boolean(settings.value.imagePath)))
const previewStyle = computed(() => {
  const s = settings.value
  const margin = `${s.margin * 100}%`
  const style: Record<string, string> = { width: `${s.scale * 100}%`, opacity: String(s.opacity) }
  if (s.position.includes('top')) style.top = margin
  if (s.position.includes('bottom')) style.bottom = margin
  if (s.position.includes('left')) style.left = margin
  if (s.position.includes('right')) style.right = margin
  if (s.position === 'center') Object.assign(style, { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' })
  return style
})

function fileName(path: string) {
  return path.split(/[\\/]/).pop() || path
}

async function load() {
  const state = (await window.api.videoWatermark.getState()) as { batches: Batch[]; lastSettings: Settings }
  batches.value = state.batches
  settings.value = { ...settings.value, ...state.lastSettings }
}

async function refreshPreview() {
  window.clearTimeout(previewTimer)
  previewTimer = window.setTimeout(async () => {
    const s = settings.value
    if ((s.kind === 'text' && !s.text.trim()) || (s.kind === 'image' && !s.imagePath)) {
      previewPath.value = ''
      return
    }
    try {
      previewPath.value = ((await window.api.videoWatermark.preview({ ...s })) as { path: string }).path
    } catch {
      previewPath.value = ''
    }
  }, 300)
}

async function addFromLibrary() {
  const picked = await openAssetLibraryPicker({ type: 'video', multiple: true })
  if (picked?.length) videos.value = Array.from(new Set([...videos.value, ...picked.map((item) => item.filePath)]))
}

async function addFromDisk() {
  const picked = (await window.api.pickFiles({ multiple: true, filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'mkv', 'm4v'] }] })) as string[]
  if (picked?.length) videos.value = Array.from(new Set([...videos.value, ...picked]))
}

async function pickImage() {
  const picked = (await window.api.pickFiles({ multiple: false, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })) as string[]
  if (picked?.[0]) settings.value.imagePath = picked[0]
}

async function pickOutputDir() {
  const dir = (await window.api.pickDir({ title: t('ai.watermark.outputDir') })) as string | null
  if (dir) outputDir.value = dir
}

async function start() {
  if (!canStart.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const batch = (await window.api.videoWatermark.start({ videoPaths: [...videos.value], settings: { ...settings.value }, outputDir: outputDir.value || undefined, archiveToLibrary: archive.value })) as Batch
    batches.value = [batch, ...batches.value.filter((item) => item.id !== batch.id)]
    videos.value = []
  } catch (cause) {
    error.value = String((cause as Error)?.message || cause).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  } finally {
    busy.value = false
  }
}

async function retry(batch: Batch) {
  await window.api.videoWatermark.retryFailed(batch.id)
  await load()
}

async function remove(batch: Batch) {
  await window.api.videoWatermark.removeBatch(batch.id)
  batches.value = batches.value.filter((item) => item.id !== batch.id)
}

function openDir(path: string) {
  void window.api.shell.openPath(path)
}

watch(settings, refreshPreview, { deep: true })
onMounted(async () => {
  await load()
  void refreshPreview()
  unsubscribe = window.api.videoWatermark.onChanged((batch: Batch) => {
    const index = batches.value.findIndex((item) => item.id === batch.id)
    if (index >= 0) batches.value.splice(index, 1, batch)
    else batches.value.unshift(batch)
  })
})
onBeforeUnmount(() => unsubscribe?.())
</script>

<template>
  <main class="vg-scope vg-page wm" data-testid="video-watermark">
    <header class="vg-page-head">
      <button class="vg-icon-btn" type="button" :title="t('ai.tools.back')" @click="router.push('/plugins')"><ChevronLeft :size="18" /></button>
      <span class="vg-page-head__icon"><Stamp :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('ai.tools.items.video-batch-watermark.name') }}</h1>
        <p>{{ t('ai.tools.items.video-batch-watermark.desc') }}</p>
      </div>
    </header>

    <div class="vg-split wm__layout">
      <div class="vg-stack">
        <section class="vg-card">
          <div class="vg-card__head">
            <span class="vg-card__title">1. {{ t('ai.watermark.videos') }} <small>{{ t('ai.fields.selectedCount', { count: videos.length }) }}</small></span>
            <div class="vg-card__actions">
              <button type="button" class="vg-btn vg-btn--sm" @click="addFromLibrary"><Images :size="14" /> {{ t('ai.fields.fromLibrary') }}</button>
              <button type="button" class="vg-btn vg-btn--sm" @click="addFromDisk"><FolderOpen :size="14" /> {{ t('ai.fields.fromDisk') }}</button>
            </div>
          </div>
          <div v-if="videos.length" class="vg-list wm__videos">
            <div v-for="path in videos" :key="path" class="vg-list__item">
              <span class="vg-list__main"><span class="vg-list__title vg-ellipsis">{{ fileName(path) }}</span></span>
              <button type="button" class="vg-icon-btn vg-icon-btn--sm" :aria-label="t('common.remove')" @click="videos = videos.filter((item) => item !== path)"><X :size="14" /></button>
            </div>
          </div>
          <p v-else class="vg-muted wm__empty">{{ t('ai.watermark.noVideos') }}</p>
        </section>

        <section class="vg-card">
          <div class="vg-card__head"><span class="vg-card__title">2. {{ t('ai.watermark.style') }}</span></div>
          <div class="vg-seg wm__kind">
            <button type="button" class="vg-seg__btn" :class="{ 'is-active': settings.kind === 'text' }" @click="settings.kind = 'text'">{{ t('ai.watermark.kindText') }}</button>
            <button type="button" class="vg-seg__btn" :class="{ 'is-active': settings.kind === 'image' }" @click="settings.kind = 'image'">{{ t('ai.watermark.kindImage') }}</button>
          </div>
          <div class="vg-form-grid">
            <template v-if="settings.kind === 'text'">
              <label class="vg-field"><span class="vg-field__label">{{ t('ai.watermark.text') }}<span class="vg-req">*</span></span><input v-model="settings.text" class="vg-input" maxlength="60" data-testid="watermark-text" :placeholder="t('ai.watermark.textPlaceholder')" /></label>
              <label class="vg-field"><span class="vg-field__label">{{ t('ai.watermark.color') }}</span><input v-model="settings.color" class="vg-input wm__color" type="color" /></label>
            </template>
            <div v-else class="vg-field">
              <span class="vg-field__label">{{ t('ai.watermark.image') }}<span class="vg-req">*</span></span>
              <div class="vg-row">
                <button type="button" class="vg-btn vg-btn--sm" @click="pickImage"><FolderOpen :size="14" /> {{ t('ai.watermark.pickImage') }}</button>
                <span class="vg-muted vg-ellipsis">{{ settings.imagePath ? fileName(settings.imagePath) : t('ai.watermark.pngHint') }}</span>
              </div>
            </div>
            <div class="vg-field">
              <span class="vg-field__label">{{ t('ai.watermark.position') }}</span>
              <div class="wm__positions">
                <button v-for="position in positions" :key="position" type="button" class="vg-chip wm__position" :class="{ 'is-on': settings.position === position }" @click="settings.position = position">{{ t(`ai.watermark.positions.${position}`) }}</button>
              </div>
            </div>
            <label class="vg-field"><span class="vg-field__label">{{ t('ai.watermark.size') }} · {{ Math.round(settings.scale * 100) }}%</span><input v-model.number="settings.scale" type="range" min="0.05" max="0.6" step="0.01" /></label>
            <label class="vg-field"><span class="vg-field__label">{{ t('ai.watermark.opacity') }} · {{ Math.round(settings.opacity * 100) }}%</span><input v-model.number="settings.opacity" type="range" min="0.1" max="1" step="0.05" /></label>
            <label class="vg-field"><span class="vg-field__label">{{ t('ai.watermark.margin') }} · {{ Math.round(settings.margin * 100) }}%</span><input v-model.number="settings.margin" type="range" min="0" max="0.15" step="0.01" /></label>
          </div>
        </section>

        <section class="vg-card">
          <div class="vg-card__head"><span class="vg-card__title">3. {{ t('ai.watermark.output') }}</span></div>
          <div class="vg-row">
            <button type="button" class="vg-btn vg-btn--sm" @click="pickOutputDir"><FolderOpen :size="14" /> {{ t('ai.watermark.outputDir') }}</button>
            <span class="vg-muted vg-ellipsis">{{ outputDir || t('ai.watermark.outputDefault') }}</span>
          </div>
          <button type="button" class="vg-switch wm__switch" :class="{ 'is-on': archive }" @click="archive = !archive"><span class="vg-switch__track"></span>{{ t('ai.watermark.archive') }}</button>
          <div v-if="error" class="vg-notice vg-notice--danger">{{ error }}</div>
          <button type="button" class="vg-btn vg-btn--primary vg-btn--block" data-testid="watermark-start" :disabled="!canStart || busy" @click="start"><Play :size="15" /> {{ t('ai.watermark.start', { count: videos.length }) }}</button>
        </section>
      </div>

      <aside class="vg-stack">
        <section class="vg-card">
          <div class="vg-card__head"><span class="vg-card__title">{{ t('ai.watermark.preview') }}</span></div>
          <div class="wm__frame">
            <img v-if="previewPath" class="wm__mark" :src="localMediaUrl(previewPath)" :style="previewStyle" alt="" />
            <span v-else class="wm__frame-empty">{{ t('ai.watermark.previewEmpty') }}</span>
          </div>
        </section>
        <section class="vg-card">
          <div class="vg-card__head"><span class="vg-card__title">{{ t('ai.watermark.history') }}</span></div>
          <div v-for="batch in batches" :key="batch.id" class="wm__batch">
            <div class="wm__batch-head">
              <strong>{{ new Date(batch.createdAt).toLocaleString() }}</strong>
              <span class="vg-muted">{{ batch.items.filter((item) => item.status === 'done').length }}/{{ batch.items.length }}</span>
              <span class="vg-toolbar__spacer"></span>
              <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('ai.watermark.openDir')" @click="openDir(batch.outputDir)"><FolderOpen :size="14" /></button>
              <button v-if="batch.items.some((item) => item.status === 'failed')" type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('ai.watermark.retry')" @click="retry(batch)"><RotateCcw :size="14" /></button>
              <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('ai.watermark.removeBatch')" @click="remove(batch)"><Trash2 :size="14" /></button>
            </div>
            <div v-for="item in batch.items" :key="item.id" class="wm__item">
              <CheckCircle2 v-if="item.status === 'done'" :size="14" class="wm__ok" />
              <XCircle v-else-if="item.status === 'failed'" :size="14" class="wm__err" />
              <Loader2 v-else :size="14" :class="{ 'vg-spin': item.status === 'running' }" />
              <span class="vg-ellipsis" :title="item.error || item.outputPath || item.sourcePath">{{ fileName(item.sourcePath) }}</span>
              <small v-if="item.error" class="wm__err vg-ellipsis">{{ item.error }}</small>
            </div>
          </div>
          <p v-if="!batches.length" class="vg-muted wm__empty">{{ t('ai.watermark.noHistory') }}</p>
        </section>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.wm { width: min(1400px, 100%); margin: 0 auto; }
.wm input[type='range'] { accent-color: var(--vg-accent); width: 100%; }
.wm__layout { grid-template-columns: minmax(0, 1fr) 380px; }
.wm__videos { max-height: 240px; overflow: auto; }
.wm__empty { font-size: 12.5px; padding: 8px 0; }
.wm__kind { margin-bottom: 12px; }
.wm__color { width: 64px; padding: 2px; height: 34px; }
.wm__positions { display: flex; flex-wrap: wrap; gap: 6px; }
.wm__position { cursor: pointer; height: 28px; padding: 0 10px; font-size: 12px; }
.wm__position.is-on { background: var(--vg-accent-soft); border-color: var(--vg-accent-line); color: var(--vg-accent); }
.wm__switch { border: 0; background: transparent; padding: 0; margin: 12px 0; }
.wm__frame { position: relative; aspect-ratio: 9 / 16; max-height: 460px; margin: 0 auto; border-radius: var(--vg-radius-sm); overflow: hidden; background: linear-gradient(160deg, #2b3a55, #10151f 70%); }
.wm__mark { position: absolute; height: auto; }
.wm__frame-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 20px; text-align: center; color: rgba(255, 255, 255, .6); font-size: 12.5px; }
.wm__batch { padding: 8px 0; border-top: 1px solid var(--theme-divider); }
.wm__batch:first-of-type { border-top: 0; }
.wm__batch-head { display: flex; align-items: center; gap: 8px; font-size: 12.5px; margin-bottom: 4px; }
.wm__item { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 2px 6px; align-items: center; font-size: 12px; padding: 2px 0; }
.wm__item small { grid-column: 2; }
.wm__ok { color: var(--vg-green); }
.wm__err { color: var(--vg-red); }
@media (max-width: 1100px) { .wm__layout { grid-template-columns: minmax(0, 1fr); } }
</style>
