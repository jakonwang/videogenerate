<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  AlertTriangle,
  Ban,
  Bot,
  Camera,
  Film,
  FolderInput,
  Layers,
  Loader,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-vue-next'
import {
  CLIP_ROLES,
  effectiveClipRole,
  type ClipOrigin,
  type ClipRole,
  type MixPoolOverview,
  type MixPoolProgress,
  type PoolClip,
  type PoolSource,
} from '../../../../shared/mixPool'

type Product = { id: string; name: string }
type Overview = MixPoolOverview & { running: boolean }
type RoleFilter = 'all' | 'untagged' | ClipRole
type OriginFilter = 'all' | 'real' | 'ai'
type SortKey = 'hook' | 'quality' | 'time'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const products = ref<Product[]>([])
const productId = ref('')
const overview = ref<Overview | null>(null)
const progress = ref<MixPoolProgress | null>(null)
const busy = ref(false)
const notice = ref<{ tone: 'accent' | 'danger'; text: string } | null>(null)
const roleFilter = ref<RoleFilter>('all')
const originFilter = ref<OriginFilter>('all')
const sortKey = ref<SortKey>('hook')
const showDisabled = ref(false)
const previewClip = ref<PoolClip | null>(null)
const previewVideo = ref<HTMLVideoElement | null>(null)

const running = computed(() => Boolean(overview.value?.running) || (progress.value != null && progress.value.phase !== 'done'))
const stats = computed(() => overview.value?.stats)
const sources = computed<PoolSource[]>(() => overview.value?.sources ?? [])
const sourceById = computed(() => new Map(sources.value.map((s) => [s.id, s])))
const pendingCount = computed(
  () => sources.value.filter((s) => s.status === 'pending').length + (overview.value?.clips.filter((c) => c.tagStatus === 'untagged').length ?? 0),
)

const roleCounts = computed(() => {
  const m = new Map<RoleFilter, number>()
  const clips = (overview.value?.clips ?? []).filter((c) => !c.disabled)
  m.set('all', clips.length)
  m.set('untagged', clips.filter((c) => !effectiveClipRole(c)).length)
  for (const r of stats.value?.byRole ?? []) m.set(r.role, r.count)
  return m
})

const visibleClips = computed(() => {
  let list = (overview.value?.clips ?? []).slice()
  if (!showDisabled.value) list = list.filter((c) => !c.disabled)
  if (originFilter.value !== 'all') list = list.filter((c) => c.origin === originFilter.value)
  if (roleFilter.value === 'untagged') list = list.filter((c) => !effectiveClipRole(c))
  else if (roleFilter.value !== 'all') list = list.filter((c) => effectiveClipRole(c) === roleFilter.value)
  if (sortKey.value === 'hook') list.sort((a, b) => (b.tags?.hookScore ?? -1) - (a.tags?.hookScore ?? -1))
  else if (sortKey.value === 'quality') list.sort((a, b) => (b.tags?.quality ?? -1) - (a.tags?.quality ?? -1))
  return list
})

const progressPercent = computed(() => {
  const p = progress.value
  if (!p || !p.total) return 0
  return Math.round((p.done / p.total) * 100)
})

function fileUrl(filePath: string) {
  return `vg://file?path=${encodeURIComponent(filePath)}`
}
function roleLabel(role: ClipRole | null | undefined) {
  return role ? t(`production.pool.roles.${role}`) : t('production.pool.clip.untagged')
}
function originLabel(origin: ClipOrigin) {
  return t(`production.pool.origin.${origin}`)
}
function scoreTone(n: number | undefined) {
  if (n == null) return 'gray'
  return n >= 70 ? 'green' : n >= 45 ? 'amber' : 'red'
}
function secs(n: number | undefined) {
  return `${(Number(n) || 0).toFixed(1)}s`
}
function flash(text: string, tone: 'accent' | 'danger' = 'accent') {
  notice.value = { tone, text }
}

async function loadOverview() {
  if (!productId.value) {
    overview.value = null
    return
  }
  overview.value = await window.api.mixPool.overview(productId.value)
}

async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
  busy.value = true
  notice.value = null
  try {
    return await fn()
  } catch (e: any) {
    flash(String(e?.message ?? e), 'danger')
    return undefined
  } finally {
    busy.value = false
  }
}

async function syncLinked() {
  const res = await run(() => window.api.mixPool.syncLinked(productId.value))
  if (!res) return
  if (res.added) flash(t('production.pool.toast.synced', { count: res.added }))
  // Nothing linked anywhere: say where we looked, so it's clear the product simply has no videos yet.
  else if (!res.found) flash(t('production.pool.toast.noneLinked'), 'danger')
  else flash(t('production.pool.toast.nothingNew'))
  await loadOverview()
  if (res.added) await startProcess()
}

async function importFiles(origin: ClipOrigin) {
  const res = await run(() => window.api.mixPool.importFiles({ productId: productId.value, origin }))
  if (!res) return
  if (res.added) flash(t('production.pool.toast.imported', { count: res.added }))
  await loadOverview()
  if (res.added) await startProcess()
}

async function startProcess() {
  progress.value = { productId: productId.value, phase: 'split', done: 0, total: 0 }
  await run(() => window.api.mixPool.process(productId.value))
}

async function retag(clipIds?: string[]) {
  progress.value = { productId: productId.value, phase: 'tag', done: 0, total: 0 }
  await run(() => window.api.mixPool.retag({ productId: productId.value, clipIds }))
}

function patchLocal(clip: PoolClip | null) {
  if (!clip || !overview.value) return
  const idx = overview.value.clips.findIndex((c) => c.id === clip.id)
  if (idx >= 0) overview.value.clips.splice(idx, 1, clip)
}

async function setRole(clip: PoolClip, value: string) {
  const roleOverride = value === '' ? null : (value as ClipRole)
  const next = await run(() => window.api.mixPool.updateClip({ id: clip.id, roleOverride }))
  patchLocal(next ?? null)
  await loadOverview()
}

async function toggleDisabled(clip: PoolClip) {
  const next = await run(() => window.api.mixPool.updateClip({ id: clip.id, disabled: !clip.disabled }))
  patchLocal(next ?? null)
  await loadOverview()
}

async function setSourceOrigin(source: PoolSource, origin: ClipOrigin) {
  await run(() => window.api.mixPool.setSourceOrigin({ sourceId: source.id, origin }))
  await loadOverview()
}

async function resplit(source: PoolSource) {
  progress.value = { productId: productId.value, phase: 'split', done: 0, total: 0 }
  await run(() => window.api.mixPool.resplitSource({ productId: productId.value, sourceId: source.id }))
  await loadOverview()
}

async function removeSource(source: PoolSource) {
  if (!window.confirm(t('production.pool.sources.removeConfirm', { name: source.fileName }))) return
  await run(() => window.api.mixPool.removeSource(source.id))
  await loadOverview()
}

function openPreview(clip: PoolClip) {
  previewClip.value = clip
}
function onPreviewLoaded() {
  const v = previewVideo.value
  const c = previewClip.value
  if (!v || !c) return
  v.currentTime = c.startSec
  void v.play().catch(() => undefined)
}
function onPreviewTime() {
  const v = previewVideo.value
  const c = previewClip.value
  if (v && c && v.currentTime >= c.endSec) v.currentTime = c.startSec
}

let offProgress: (() => void) | null = null
let reloadTimer: ReturnType<typeof setTimeout> | null = null

function scheduleReload() {
  if (reloadTimer) return
  reloadTimer = setTimeout(() => {
    reloadTimer = null
    void loadOverview()
  }, 600)
}

watch(productId, async (id) => {
  progress.value = null
  roleFilter.value = 'all'
  if (id && route.query.productId !== id) void router.replace({ query: { ...route.query, productId: id } })
  await loadOverview()
})

onMounted(async () => {
  offProgress = window.api.mixPool.onProgress((p) => {
    if (p.productId !== productId.value) return
    progress.value = p.phase === 'done' ? null : p
    scheduleReload()
  })
  products.value = ((await window.api.products.list()) as Product[]) ?? []
  const wanted = String(route.query.productId || '')
  productId.value = products.value.find((p) => p.id === wanted)?.id ?? products.value[0]?.id ?? ''
})

onBeforeUnmount(() => {
  offProgress?.()
  if (reloadTimer) clearTimeout(reloadTimer)
})
</script>

<template>
  <div class="vg-scope vg-page pool">
    <header class="vg-page-head">
      <div class="vg-page-head__text">
        <h1>{{ t('production.pool.title') }}</h1>
        <p>{{ t('production.pool.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <select v-model="productId" class="vg-select pool__product" :aria-label="t('production.pool.product')">
          <option v-if="!products.length" value="">{{ t('production.pool.noProducts') }}</option>
          <option v-for="item in products" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </div>
    </header>

    <section class="vg-card pool__actions">
      <div class="vg-toolbar">
        <button class="vg-btn" type="button" :disabled="!productId || busy || running" @click="syncLinked">
          <RefreshCw :size="15" /> {{ t('production.pool.sync') }}
        </button>
        <button class="vg-btn" type="button" :disabled="!productId || busy" @click="importFiles('real')">
          <Camera :size="15" /> {{ t('production.pool.importReal') }}
        </button>
        <button class="vg-btn" type="button" :disabled="!productId || busy" @click="importFiles('ai')">
          <Bot :size="15" /> {{ t('production.pool.importAi') }}
        </button>
        <span class="vg-toolbar__spacer" />
        <button class="vg-btn vg-btn--ghost" type="button" :disabled="!stats?.clipCount || busy || running" @click="retag()">
          <ScanSearch :size="15" /> {{ t('production.pool.retagAll') }}
        </button>
        <button class="vg-btn vg-btn--primary" type="button" :disabled="!productId || busy || running || !pendingCount" @click="startProcess">
          <Loader v-if="running" :size="15" class="vg-spin" /><Sparkles v-else :size="15" />
          {{ running ? t('production.pool.processing') : t('production.pool.process', { count: pendingCount }) }}
        </button>
      </div>
      <p class="vg-muted pool__hint">{{ t('production.pool.hint') }}</p>
      <div v-if="progress && progress.phase !== 'done'" class="pool__progress">
        <div class="vg-row">
          <span>{{ t(`production.pool.progress.${progress.phase}`, { done: progress.done, total: progress.total }) }}</span>
          <span v-if="progress.message" class="vg-muted vg-ellipsis">{{ progress.message }}</span>
        </div>
        <div class="vg-progress"><div class="vg-progress__bar"><div class="vg-progress__fill" :style="{ width: `${progressPercent}%` }" /></div></div>
      </div>
      <div v-if="notice" class="vg-notice" :class="`vg-notice--${notice.tone}`">{{ notice.text }}</div>
    </section>

    <section class="vg-stats">
      <div class="vg-stat">
        <span class="vg-stat__icon"><Film :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('production.pool.stats.clips') }}</span><span class="vg-stat__value">{{ stats?.clipCount ?? 0 }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--blue"><ScanSearch :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('production.pool.stats.tagged') }}</span><span class="vg-stat__value">{{ stats?.taggedCount ?? 0 }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--amber"><Camera :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('production.pool.stats.realVsAi') }}</span><span class="vg-stat__value">{{ stats?.realCount ?? 0 }} / {{ stats?.aiCount ?? 0 }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--violet"><Layers :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('production.pool.stats.sources') }}</span><span class="vg-stat__value">{{ stats?.sourceCount ?? 0 }}</span></span>
      </div>
    </section>

    <div v-if="stats?.mismatchCount" class="vg-notice vg-notice--danger pool__gap">
      <AlertTriangle :size="16" />
      <span>{{ t('production.pool.mismatch.notice', { count: stats.mismatchCount }) }}</span>
    </div>

    <div v-if="stats?.missingRoles?.length" class="vg-notice vg-notice--warning pool__gap">
      <AlertTriangle :size="16" />
      <span>
        <strong>{{ t('production.pool.missing.title') }}</strong>
        {{ stats.missingRoles.map((r) => roleLabel(r)).join('、') }} — {{ t('production.pool.missing.desc') }}
      </span>
    </div>

    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><Film :size="16" /> {{ t('production.pool.clipsTitle') }}</span>
        <div class="vg-row">
          <div class="vg-seg vg-seg--sm">
            <button
              v-for="o in (['all', 'real', 'ai'] as OriginFilter[])"
              :key="o"
              class="vg-seg__btn"
              :class="{ 'is-active': originFilter === o }"
              type="button"
              @click="originFilter = o"
            >
              {{ o === 'all' ? t('production.pool.filters.all') : originLabel(o) }}
            </button>
          </div>
          <select v-model="sortKey" class="vg-select vg-select--sm" :aria-label="t('production.pool.sort.label')">
            <option value="hook">{{ t('production.pool.sort.hook') }}</option>
            <option value="quality">{{ t('production.pool.sort.quality') }}</option>
            <option value="time">{{ t('production.pool.sort.time') }}</option>
          </select>
          <label class="vg-row pool__check"><input v-model="showDisabled" type="checkbox" /> {{ t('production.pool.showDisabled') }}</label>
        </div>
      </div>

      <div class="vg-seg vg-seg--sm pool__roles">
        <button class="vg-seg__btn" :class="{ 'is-active': roleFilter === 'all' }" type="button" @click="roleFilter = 'all'">
          {{ t('production.pool.filters.all') }} <span class="vg-count">{{ roleCounts.get('all') ?? 0 }}</span>
        </button>
        <button
          v-for="r in CLIP_ROLES"
          :key="r"
          class="vg-seg__btn"
          :class="{ 'is-active': roleFilter === r, 'is-missing': stats?.missingRoles.includes(r) }"
          type="button"
          @click="roleFilter = r"
        >
          {{ roleLabel(r) }} <span class="vg-count">{{ roleCounts.get(r) ?? 0 }}</span>
        </button>
        <button v-if="roleCounts.get('untagged')" class="vg-seg__btn" :class="{ 'is-active': roleFilter === 'untagged' }" type="button" @click="roleFilter = 'untagged'">
          {{ t('production.pool.clip.untagged') }} <span class="vg-count">{{ roleCounts.get('untagged') }}</span>
        </button>
      </div>

      <div v-if="visibleClips.length" class="pool__grid">
        <article v-for="clip in visibleClips" :key="clip.id" class="pool-clip" :class="{ 'is-disabled': clip.disabled }">
          <button class="vg-media pool-clip__media" type="button" :title="t('production.pool.preview')" @click="openPreview(clip)">
            <img :src="fileUrl(clip.thumbnailPath)" alt="" loading="lazy" />
            <span class="vg-media__badge vg-row pool-clip__badges">
              <span class="vg-pill vg-pill--solid" :class="clip.origin === 'ai' ? 'vg-pill--solid-blue' : clip.origin === 'real' ? '' : 'vg-pill--solid-amber'">
                {{ originLabel(clip.origin) }}
              </span>
            </span>
            <span class="pool-clip__dur vg-num">{{ secs(clip.durationSec) }}</span>
          </button>
          <div class="pool-clip__body">
            <div class="vg-row pool-clip__head">
              <span class="vg-pill vg-pill--accent">{{ roleLabel(effectiveClipRole(clip)) }}</span>
              <span v-if="clip.tags?.matchesProduct === false" class="vg-pill vg-pill--solid vg-pill--solid-red" :title="t('production.pool.mismatch.hint')">
                {{ t('production.pool.mismatch.badge') }}
              </span>
              <span v-if="clip.roleOverride" class="vg-muted pool-clip__tiny">{{ t('production.pool.clip.manual') }}</span>
              <span v-else-if="clip.tagProvider === 'heuristic'" class="vg-muted pool-clip__tiny">{{ t('production.pool.clip.heuristic') }}</span>
            </div>
            <div v-if="clip.tags" class="vg-row pool-clip__scores">
              <span class="vg-pill vg-pill--dot" :class="`vg-pill--${scoreTone(clip.tags.hookScore)}`">{{ t('production.pool.clip.hook') }} {{ clip.tags.hookScore }}</span>
              <span class="vg-pill vg-pill--dot" :class="`vg-pill--${scoreTone(clip.tags.quality)}`">{{ t('production.pool.clip.quality') }} {{ clip.tags.quality }}</span>
            </div>
            <p v-if="clip.tags?.description" class="pool-clip__desc">{{ clip.tags.description }}</p>
            <p v-if="clip.tags?.issues?.length" class="pool-clip__issues">{{ clip.tags.issues.join(' · ') }}</p>
            <p v-if="clip.tagStatus === 'failed'" class="pool-clip__issues" :title="clip.tagError">{{ t('production.pool.clip.failed') }}</p>
            <div class="vg-row pool-clip__foot">
              <select
                class="vg-select vg-select--sm"
                :value="clip.roleOverride ?? ''"
                :aria-label="t('production.pool.clip.override')"
                @change="setRole(clip, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">{{ t('production.pool.clip.auto') }}</option>
                <option v-for="r in CLIP_ROLES" :key="r" :value="r">{{ roleLabel(r) }}</option>
              </select>
              <button class="vg-icon-btn vg-icon-btn--sm" type="button" :title="t('production.pool.clip.retag')" :disabled="running" @click="retag([clip.id])">
                <ScanSearch :size="14" />
              </button>
              <button
                class="vg-icon-btn vg-icon-btn--sm"
                type="button"
                :title="clip.disabled ? t('production.pool.clip.enable') : t('production.pool.clip.disable')"
                @click="toggleDisabled(clip)"
              >
                <Undo2 v-if="clip.disabled" :size="14" /><Ban v-else :size="14" />
              </button>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="vg-empty">
        <span class="vg-empty__icon"><Film :size="24" /></span>
        <p>{{ overview?.clips.length ? t('production.pool.emptyFiltered') : t('production.pool.empty') }}</p>
      </div>
    </section>

    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><FolderInput :size="16" /> {{ t('production.pool.sources.title') }}</span>
      </div>
      <div v-if="sources.length" class="vg-table-wrap">
        <table class="vg-table vg-table--compact">
          <thead>
            <tr>
              <th>{{ t('production.pool.sources.file') }}</th>
              <th>{{ t('production.pool.sources.kind') }}</th>
              <th>{{ t('production.pool.sources.origin') }}</th>
              <th>{{ t('production.pool.sources.status') }}</th>
              <th>{{ t('production.pool.sources.clips') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in sources" :key="s.id">
              <td class="pool__file" :title="s.filePath">
                <span class="vg-ellipsis">{{ s.fileName }}</span>
                <small v-if="s.durationSec" class="vg-muted vg-num">{{ secs(s.durationSec) }}</small>
              </td>
              <td>{{ t(`production.pool.sourceKind.${s.kind}`) }}<small v-if="s.kind === 'product_asset' && s.ref" class="vg-muted"> · {{ s.ref }}</small></td>
              <td>
                <select class="vg-select vg-select--sm" :value="s.origin" @change="setSourceOrigin(s, ($event.target as HTMLSelectElement).value as ClipOrigin)">
                  <option value="real">{{ originLabel('real') }}</option>
                  <option value="ai">{{ originLabel('ai') }}</option>
                  <option value="unknown">{{ originLabel('unknown') }}</option>
                </select>
              </td>
              <td>
                <span
                  class="vg-pill vg-pill--dot"
                  :class="s.status === 'ready' ? 'vg-pill--green' : s.status === 'failed' ? 'vg-pill--red' : s.status === 'splitting' ? 'vg-pill--blue' : 'vg-pill--amber'"
                  :title="s.error"
                >
                  {{ t(`production.pool.sourceStatus.${s.status}`) }}
                </span>
              </td>
              <td class="vg-num">{{ s.clipCount }}</td>
              <td>
                <div class="vg-row pool__row-actions">
                  <button class="vg-icon-btn vg-icon-btn--sm" type="button" :title="t('production.pool.sources.resplit')" :disabled="running" @click="resplit(s)">
                    <RefreshCw :size="14" />
                  </button>
                  <button class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" type="button" :title="t('production.pool.sources.remove')" @click="removeSource(s)">
                    <Trash2 :size="14" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="vg-empty">
        <span class="vg-empty__icon"><FolderInput :size="24" /></span>
        <p>{{ t('production.pool.sources.empty') }}</p>
      </div>
    </section>

    <div v-if="previewClip" class="vg-backdrop" @click.self="previewClip = null">
      <div class="vg-dialog pool__dialog" role="dialog" aria-modal="true">
        <div class="vg-dialog__head">
          <span class="vg-dialog__title">{{ roleLabel(effectiveClipRole(previewClip)) }} · {{ secs(previewClip.startSec) }}–{{ secs(previewClip.endSec) }}</span>
          <button class="vg-icon-btn" type="button" :aria-label="t('production.pool.close')" @click="previewClip = null"><X :size="16" /></button>
        </div>
        <div class="vg-dialog__body">
          <video
            ref="previewVideo"
            class="pool__video"
            :src="fileUrl(previewClip.filePath)"
            muted
            playsinline
            controls
            @loadedmetadata="onPreviewLoaded"
            @timeupdate="onPreviewTime"
          />
          <p v-if="previewClip.tags?.description">{{ previewClip.tags.description }}</p>
          <p class="vg-muted pool-clip__tiny">{{ sourceById.get(previewClip.sourceId)?.fileName }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pool { width: min(1408px, 100%); margin: 0 auto; }
.pool__product { min-width: 220px; }
.pool__actions { display: flex; flex-direction: column; gap: 10px; }
.pool__hint { font-size: 12px; margin: 0; }
.pool__progress { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.pool__gap { display: flex; align-items: center; gap: 8px; }
.pool__roles { margin-bottom: 12px; }
.pool__roles .vg-seg__btn.is-missing:not(.is-active) { border-color: color-mix(in srgb, var(--vg-amber) 50%, transparent); color: var(--vg-amber); }
.pool__check { font-size: 12px; color: var(--theme-text-muted); gap: 6px; cursor: pointer; }
.pool__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 12px; }
.pool__file { max-width: 280px; }
.pool__file .vg-ellipsis { display: block; }
.pool__row-actions { justify-content: flex-end; flex-wrap: nowrap; }
.pool__dialog { width: min(440px, calc(100vw - 32px)); }
.pool__video { width: 100%; max-height: 62vh; border-radius: var(--vg-radius-sm); background: #000; display: block; margin-bottom: 10px; }

.pool-clip { display: flex; flex-direction: column; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); overflow: hidden; min-width: 0; }
.pool-clip.is-disabled { opacity: 0.45; }
.pool-clip__media { --vg-media-ratio: 9 / 16; border: 0; border-radius: 0; padding: 0; cursor: pointer; }
.pool-clip__badges { gap: 4px; }
.pool-clip__dur { position: absolute; right: 6px; bottom: 6px; padding: 1px 6px; border-radius: 6px; font-size: 11px; background: rgb(0 0 0 / 0.62); color: #fff; }
.pool-clip__body { display: flex; flex-direction: column; gap: 6px; padding: 8px; flex: 1; }
.pool-clip__head { gap: 6px; }
.pool-clip__scores { gap: 4px; }
.pool-clip__scores .vg-pill { font-size: 11px; }
.pool-clip__tiny { font-size: 11px; }
.pool-clip__desc { margin: 0; font-size: 12px; line-height: 1.45; color: var(--theme-text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pool-clip__issues { margin: 0; font-size: 11px; color: var(--vg-amber); }
.pool-clip__foot { margin-top: auto; gap: 4px; flex-wrap: nowrap; }
.pool-clip__foot .vg-select { flex: 1; min-width: 0; }
</style>
