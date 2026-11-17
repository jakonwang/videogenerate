<script setup lang="ts">
/**
 * "替换视频" for one clone shot: pick a local file, reuse a video tk创意室 / 图生视频 already made for
 * this shot, or hand the shot to tk创意室 (its result is swapped in automatically when it finishes).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, FolderOpen, Loader2, Play, Replace, Wand2 } from 'lucide-vue-next'
import VideoPreviewModal from '../VideoPreviewModal.vue'

type Alternative = {
  ref: string
  line: 'creative' | 'livephoto'
  shotId: string
  status: 'ready' | 'running' | 'failed'
  videoPath?: string
  posterPath?: string
  durationSec?: number
  error?: string
  autoReplace: boolean
  inUse: boolean
  createdAt: number
}

const props = defineProps<{ cloneProjectId: string; shotId: string; disabled?: boolean }>()
const emit = defineEmits<{
  (e: 'pick-file'): void
  (e: 'replaced', project: unknown): void
  (e: 'error', message: string): void
}>()

const { t } = useI18n()
const open = ref(false)
const busy = ref(false)
const all = ref<Alternative[]>([])
const preview = ref<Alternative | null>(null)
const menuError = ref('')
const root = ref<HTMLElement | null>(null)
let timer: number | null = null

const forShot = computed(() => all.value.filter((item) => item.shotId === props.shotId))
const ready = computed(() => forShot.value.filter((item) => item.status === 'ready'))
const running = computed(() => forShot.value.find((item) => item.line === 'creative' && item.status === 'running'))
const lastFailed = computed(() => forShot.value.find((item) => item.line === 'creative' && item.status === 'failed'))

function fileUrl(path?: string) {
  return path ? `vg://file?path=${encodeURIComponent(path)}` : ''
}

function errorText(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

async function load() {
  if (!props.cloneProjectId) return
  try {
    all.value = (await window.api.clone.listShotAlternatives({ cloneProjectId: props.cloneProjectId })) as Alternative[]
  } catch {
    all.value = []
  }
}

function lineLabel(item: Alternative) {
  return item.line === 'creative' ? t('ai.cloneShot.lineCreative') : t('ai.cloneShot.lineLivePhoto')
}

async function use(item: Alternative) {
  busy.value = true
  menuError.value = ''
  try {
    const result = (await window.api.clone.useShotAlternative({ cloneProjectId: props.cloneProjectId, shotId: props.shotId, ref: item.ref })) as { project?: unknown }
    emit('replaced', result?.project)
    open.value = false
    await load()
  } catch (error) {
    menuError.value = errorText(error)
    emit('error', menuError.value)
  } finally {
    busy.value = false
  }
}

async function sendToCreative() {
  busy.value = true
  menuError.value = ''
  try {
    await window.api.clone.sendShotToCreative({ cloneProjectId: props.cloneProjectId, shotId: props.shotId })
    await load()
  } catch (error) {
    menuError.value = errorText(error)
    emit('error', menuError.value)
  } finally {
    busy.value = false
  }
}

function pickFile() {
  open.value = false
  emit('pick-file')
}

function onDocClick(event: MouseEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false
}

// A video may be swapped in while the page is open (tk创意室 finished): tell the parent to reload.
watch(
  () => forShot.value.filter((item) => item.inUse && item.line === 'creative').map((item) => item.ref).join(','),
  (next, prev) => {
    if (prev !== undefined && next && next !== prev) emit('replaced', null)
  },
)
watch(() => [props.cloneProjectId, props.shotId], () => void load())
watch(open, (value) => {
  if (!value) return
  menuError.value = ''
  void load()
})

onMounted(() => {
  void load()
  document.addEventListener('mousedown', onDocClick)
  timer = window.setInterval(() => {
    if (running.value || open.value) void load()
  }, 15_000)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div ref="root" class="vg-menu-wrap csr" data-testid="clone-shot-replace">
    <button class="vg-btn vg-btn--sm" type="button" :disabled="disabled" data-testid="clone-shot-replace-toggle" @click="open = !open">
      <Replace :size="13" />{{ t('ai.cloneShot.replace') }}
      <span v-if="ready.length" class="csr__count">{{ ready.length }}</span>
      <ChevronDown :size="12" />
    </button>
    <span v-if="running" class="vg-pill vg-pill--amber csr__state" data-testid="clone-shot-creative-running">
      <Loader2 :size="12" class="vg-spin" /> {{ running.autoReplace ? t('ai.cloneShot.runningAuto') : t('ai.cloneShot.running') }}
    </span>
    <div v-if="open" class="vg-menu vg-menu--up csr__menu" data-testid="clone-shot-replace-menu">
      <button type="button" :disabled="busy" @click="pickFile"><FolderOpen :size="14" /> {{ t('ai.cloneShot.fromDisk') }}</button>

      <div v-if="ready.length" class="csr__section">
        <span class="csr__title">{{ t('ai.cloneShot.madeElsewhere') }}</span>
        <div v-for="item in ready" :key="item.ref" class="csr__item" data-testid="clone-shot-alternative">
          <span class="csr__thumb" @click="preview = item">
            <img v-if="item.posterPath" :src="fileUrl(item.posterPath)" alt="" loading="lazy" />
            <Play :size="14" />
          </span>
          <span class="csr__meta">
            <strong>{{ lineLabel(item) }}</strong>
            <small>{{ item.durationSec ? `${item.durationSec}s · ` : '' }}{{ new Date(item.createdAt).toLocaleString() }}</small>
          </span>
          <span v-if="item.inUse" class="vg-pill vg-pill--green">{{ t('ai.cloneShot.inUse') }}</span>
          <button v-else type="button" class="csr__use" :disabled="busy || disabled" @click="use(item)">{{ t('ai.cloneShot.use') }}</button>
        </div>
      </div>

      <div class="csr__section">
        <button type="button" :disabled="busy || Boolean(running)" data-testid="clone-shot-send-creative" @click="sendToCreative">
          <Wand2 :size="14" /> {{ t('ai.cloneShot.sendCreative') }}
        </button>
        <small class="csr__hint">{{ running ? t('ai.cloneShot.running') : t('ai.cloneShot.sendCreativeHint') }}</small>
        <small v-if="menuError" class="csr__error" data-testid="clone-shot-replace-error">{{ menuError }}</small>
        <small v-else-if="!running && lastFailed?.error" class="csr__error">{{ t('ai.cloneShot.lastFailed', { error: lastFailed.error }) }}</small>
      </div>
    </div>
    <VideoPreviewModal :open="Boolean(preview)" :src="fileUrl(preview?.videoPath)" :poster="fileUrl(preview?.posterPath)" :title="preview ? lineLabel(preview) : ''" @close="preview = null" />
  </div>
</template>

<style scoped>
.csr { align-items: center; gap: 8px; }
.csr__count { min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--theme-accent-soft); color: var(--theme-accent); font-size: 11px; line-height: 16px; text-align: center; }
.csr__state { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.csr__menu { left: 0; right: auto; width: 300px; max-height: 360px; overflow-y: auto; gap: 2px; }
.csr__section { display: flex; flex-direction: column; gap: 4px; padding-top: 6px; margin-top: 4px; border-top: 1px solid var(--theme-divider); }
.csr__title { padding: 0 10px; font-size: 11px; color: var(--theme-text-muted); }
.csr__item { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 6px; }
.csr__item:hover { background: var(--theme-panel-soft); }
.csr__thumb { position: relative; width: 40px; height: 52px; flex-shrink: 0; border-radius: 5px; overflow: hidden; background: var(--theme-control); display: grid; place-items: center; cursor: pointer; color: var(--theme-text-secondary); }
.csr__thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.csr__thumb svg { position: relative; }
.csr__meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.csr__meta strong { font-size: 12px; }
.csr__meta small { font-size: 11px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vg-menu button.csr__use { height: 26px; padding: 0 10px; border: 1px solid var(--theme-border-control); color: var(--theme-accent); }
.csr__hint, .csr__error { padding: 0 10px 4px; font-size: 11px; line-height: 1.4; color: var(--theme-text-muted); white-space: normal; }
.csr__error { color: var(--vg-red); }
</style>
