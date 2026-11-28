<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Images, Maximize, RefreshCcw, X, ZoomIn } from 'lucide-vue-next'

/**
 * 「挑图」：贴真实商品融合一次出几张图（主进程 integratePlacedProduct），用户挑一张再做视频。
 * 看图模型分不清这几张的好坏（2026-11-28 实测和人的判断只对上 1/12），所以交给人挑。
 * 默认放大看商品附近：商品在整张图里往往只有几十个像素。
 */
type Candidate = { index: number; path: string }
type StillData = {
  referenceImagePath: string
  region: { x: number; y: number; width: number; height: number } | null
  candidates: Candidate[]
  pickedIndex: number | null
}

/** 不传就是图生视频的任务；tk创意室 / Muse创意室传自己的接口 */
export type StillPickSource = {
  load: () => Promise<StillData>
  pick: (index: number) => Promise<unknown>
  regenerate: () => Promise<unknown>
}

const props = defineProps<{ itemId: string; title?: string; previewSrc: (path?: string) => string; source?: StillPickSource }>()
const api = () => props.source ?? {
  load: () => (window as any).api.livePhoto.getStillCandidates({ id: props.itemId }) as Promise<StillData>,
  pick: (index: number) => (window as any).api.livePhoto.pickStill({ id: props.itemId, index }),
  regenerate: () => (window as any).api.livePhoto.regenerateStills({ id: props.itemId }),
}
const emit = defineEmits<{ close: []; picked: [item: unknown]; regenerated: [item: unknown] }>()

const data = ref<StillData | null>(null)
const loadError = ref('')
const busy = ref(false)
const selected = ref<number | null>(null)
const zoomed = ref(true)
/** 参考图的宽高（按它算放大范围；融合图和它同比例） */
const natural = ref<{ w: number; h: number } | null>(null)

async function load() {
  data.value = null
  loadError.value = ''
  try {
    const result = await api().load()
    if (!result?.candidates?.length) {
      loadError.value = '图已经不在了，请点「都不行，重新生成」'
      data.value = result
      return
    }
    data.value = result
    selected.value = result.pickedIndex ?? null
  } catch (error: any) {
    loadError.value = error?.message ?? String(error)
  }
}
watch(() => props.itemId, () => void load(), { immediate: true })

function onReferenceLoad(event: Event) {
  const img = event.target as HTMLImageElement
  if (img.naturalWidth && img.naturalHeight) natural.value = { w: img.naturalWidth, h: img.naturalHeight }
}

/** 每格的显示方式：放大时只显示商品附近的一块正方形；看全图时整张缩进去 */
const imageStyle = computed(() => {
  const n = natural.value
  const r = data.value?.region
  if (!zoomed.value || !n || !r) return { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain' } as Record<string, string>
  const short = Math.min(n.w, n.h)
  const side = Math.min(short, Math.max(Math.max(r.width * n.w, r.height * n.h) * 3, short * 0.3))
  const vx = Math.min(n.w - side, Math.max(0, (r.x + r.width / 2) * n.w - side / 2))
  const vy = Math.min(n.h - side, Math.max(0, (r.y + r.height / 2) * n.h - side / 2))
  return {
    position: 'absolute',
    maxWidth: 'none',
    width: `${(n.w / side) * 100}%`,
    height: `${(n.h / side) * 100}%`,
    left: `${(-vx / side) * 100}%`,
    top: `${(-vy / side) * 100}%`,
    objectFit: 'fill',
  } as Record<string, string>
})

async function confirm() {
  if (selected.value === null || busy.value) return
  busy.value = true
  try {
    const item = await api().pick(selected.value)
    emit('picked', item)
  } catch (error: any) {
    loadError.value = error?.message ?? String(error)
  } finally {
    busy.value = false
  }
}

async function regenerate() {
  if (busy.value) return
  busy.value = true
  try {
    const item = await api().regenerate()
    emit('regenerated', item)
  } catch (error: any) {
    loadError.value = error?.message ?? String(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="spd vg-scope" data-testid="live-photo-still-pick-dialog" @click.self="!busy && emit('close')">
    <section class="spd__panel" role="dialog" aria-modal="true" aria-label="挑一张图">
      <header class="spd__head">
        <div>
          <strong>挑一张图</strong>
          <span v-if="title">{{ title }}</span>
        </div>
        <button class="vg-icon-btn" type="button" aria-label="关闭" :disabled="busy" @click="emit('close')"><X :size="16" /></button>
      </header>

      <div class="spd__bar">
        <p class="spd__tip"><Images :size="14" />挑款式最像、戴法或拿法最自然的一张，用它来做视频。</p>
        <div class="spd__view" role="group" aria-label="显示范围">
          <button type="button" :class="{ 'is-on': zoomed }" @click="zoomed = true"><ZoomIn :size="13" />放大看</button>
          <button type="button" :class="{ 'is-on': !zoomed }" @click="zoomed = false"><Maximize :size="13" />看全图</button>
        </div>
      </div>

      <p v-if="loadError" class="spd__error">{{ loadError }}</p>
      <div v-if="!data && !loadError" class="spd__loading">正在读取…</div>

      <div v-if="data" class="spd__grid">
        <figure class="spd__cell spd__cell--ref">
          <div class="spd__frame">
            <img :src="previewSrc(data.referenceImagePath)" :style="imageStyle" alt="" draggable="false" @load="onReferenceLoad" />
          </div>
          <figcaption>原图</figcaption>
        </figure>
        <button
          v-for="(candidate, order) in data.candidates"
          :key="candidate.index"
          type="button"
          class="spd__cell spd__pick"
          :class="{ 'is-on': selected === candidate.index }"
          :data-testid="`live-photo-still-candidate-${order + 1}`"
          :disabled="busy"
          @click="selected = candidate.index"
          @dblclick="selected = candidate.index; confirm()"
        >
          <div class="spd__frame">
            <img :src="previewSrc(candidate.path)" :style="imageStyle" alt="" draggable="false" />
            <span v-if="selected === candidate.index" class="spd__check"><Check :size="14" /></span>
          </div>
          <span class="spd__label">第 {{ order + 1 }} 张</span>
        </button>
      </div>

      <footer class="spd__actions">
        <button class="vg-btn" type="button" :disabled="busy" data-testid="live-photo-still-regenerate" @click="regenerate"><RefreshCcw :size="13" />都不行，重新生成</button>
        <span class="spd__spacer" />
        <button class="vg-btn" type="button" :disabled="busy" @click="emit('close')">取消</button>
        <button class="vg-btn vg-btn--primary" type="button" data-testid="live-photo-still-confirm" :disabled="busy || selected === null" @click="confirm">
          {{ busy ? '提交中…' : '用这张做视频' }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.spd { position: fixed; inset: var(--app-titlebar-height, 62px) 0 0; z-index: 90; display: grid; place-items: center; padding: 24px; background: color-mix(in srgb, var(--theme-input) 78%, transparent); backdrop-filter: blur(10px); }
.spd__panel { width: min(1100px, 100%); max-height: calc(100vh - var(--app-titlebar-height, 62px) - 48px); display: flex; flex-direction: column; gap: 14px; overflow: auto; padding: 18px; border: 1px solid var(--theme-border); border-radius: 14px; background: var(--theme-panel); }
.spd__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.spd__head > div { display: grid; gap: 3px; }
.spd__head strong { font-size: 16px; color: var(--theme-text); }
.spd__head span { font-size: 12px; color: var(--theme-text-muted); }
.spd__bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.spd__tip { display: flex; gap: 6px; align-items: center; margin: 0; font-size: 12.5px; color: var(--theme-text-secondary); }
.spd__tip svg { flex-shrink: 0; color: var(--vg-accent); }
.spd__view { display: inline-flex; padding: 2px; border: 1px solid var(--theme-border); border-radius: 8px; }
.spd__view button { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-secondary); font-size: 12px; cursor: pointer; }
.spd__view button.is-on { background: var(--vg-accent-soft); color: var(--vg-accent); }
.spd__error { margin: 0; padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, var(--vg-amber) 12%, transparent); color: var(--vg-amber); font-size: 13px; }
.spd__loading { padding: 40px; text-align: center; color: var(--theme-text-muted); font-size: 13px; }
.spd__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.spd__cell { display: grid; gap: 6px; margin: 0; min-width: 0; }
.spd__frame { position: relative; overflow: hidden; aspect-ratio: 1 / 1; border-radius: 10px; background: var(--theme-panel-soft); }
.spd__frame img { pointer-events: none; user-select: none; }
.spd__cell figcaption, .spd__label { font-size: 12px; color: var(--theme-text-muted); text-align: center; }
.spd__cell--ref .spd__frame { opacity: 0.92; }
.spd__pick { padding: 0; border: 0; background: transparent; cursor: pointer; font: inherit; }
.spd__pick .spd__frame { outline: 2px solid transparent; outline-offset: 2px; transition: outline-color 0.15s; }
.spd__pick:hover .spd__frame { outline-color: color-mix(in srgb, var(--vg-accent) 45%, transparent); }
.spd__pick.is-on .spd__frame { outline-color: var(--vg-accent); }
.spd__pick.is-on .spd__label { color: var(--vg-accent); font-weight: 600; }
.spd__check { position: absolute; top: 8px; right: 8px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--vg-accent); color: var(--theme-panel); }
.spd__actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.spd__spacer { flex: 1; }
</style>
