<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Brain, Clapperboard, GitBranch, Images, Inbox, Lightbulb, PlaySquare, Save, Send, Wand2 } from 'lucide-vue-next'
import { thumbnailUrl } from '@/lib/localMedia'
import { useAiProducerStore } from '@/stores/aiProducer'
import ProductChainPanel, { type ProductSpine } from './ProductChainPanel.vue'
import ProductPerformancePanel, { type ContentPerformance, type ProductPerformance } from './ProductPerformancePanel.vue'

type Line = 'clone' | 'creative' | 'livephoto' | 'production' | 'publish'
type Item = {
  ref: string
  line: Line
  title: string
  status: 'running' | 'failed' | 'ready' | 'draft'
  stage?: string
  error?: string
  previewPath?: string
  route: string
  /** Content this item was made from, e.g. the clone project behind a creative-studio shot. */
  sourceRef?: string
  updatedAt: number
  review?: { decision: string; reason?: string }
  performance?: ContentPerformance
}
type Overview = {
  items: Item[]
  stats: Record<Line, { total: number; ready: number; running: number; failed: number; approved: number }>
  lineage: Array<{ id: string; fromRef: string; toRef: string; relation: string; createdAt: number }>
  memory: { sellingPoints: string; audience: string; avoid: string; notes: string; updatedAt: number }
  spine?: ProductSpine
  performance?: ProductPerformance
}

const props = defineProps<{ productId: string; productName: string }>()
const { t } = useI18n()
const router = useRouter()
const ai = useAiProducerStore()

const overview = ref<Overview | null>(null)
const lineFilter = ref<'' | Line>('')
const memory = ref({ sellingPoints: '', audience: '', avoid: '', notes: '' })
const memorySaved = ref(false)
const savingMemory = ref(false)
let unsubscribe: (() => void) | null = null

const lineIcon = { clone: Clapperboard, creative: Wand2, livephoto: PlaySquare, production: Images, publish: Send }
const items = computed(() => (overview.value?.items || []).filter((item) => !lineFilter.value || item.line === lineFilter.value))
const pendingReview = computed(() => (overview.value?.items || []).filter((item) => item.review?.decision === 'pending').length)
const approvedUnpublished = computed(() => {
  const all = overview.value?.items || []
  return all.filter((item) => item.review?.decision === 'approved' && item.line !== 'livephoto').length - (overview.value?.stats.publish.total || 0)
})
const failedCount = computed(() => (overview.value?.items || []).filter((item) => item.status === 'failed' && item.line !== 'publish').length)
const contentReady = computed(() => (overview.value?.items || []).filter((item) => item.line !== 'publish' && item.status === 'ready').length)
const contentRunning = computed(() => (overview.value?.items || []).filter((item) => item.line !== 'publish' && item.status === 'running').length)
const totalContent = computed(() => (overview.value?.items || []).filter((item) => item.line !== 'publish').length)

const suggestions = computed(() => {
  const list: Array<{ key: string; text: string; action: () => void }> = []
  if (!totalContent.value) list.push({ key: 'first', text: t('ai.space.suggestFirst'), action: makeContent })
  if (pendingReview.value) list.push({ key: 'review', text: t('ai.space.suggestReview', { count: pendingReview.value }), action: () => void router.push('/inbox') })
  if (failedCount.value) list.push({ key: 'failed', text: t('ai.space.suggestFailed', { count: failedCount.value }), action: () => void ai.open({ fresh: true, send: true, prompt: t('ai.space.failedPrompt', { name: props.productName }), context: { productId: props.productId } }) })
  if (approvedUnpublished.value > 0) list.push({ key: 'publish', text: t('ai.space.suggestPublish', { count: approvedUnpublished.value }), action: publishApproved })
  if (totalContent.value && !pendingReview.value && !failedCount.value) list.push({ key: 'more', text: t('ai.space.suggestMore'), action: makeContent })
  return list
})

async function load() {
  overview.value = (await window.api.contentHub.productOverview(props.productId)) as Overview
  const saved = overview.value.memory
  memory.value = { sellingPoints: saved.sellingPoints || '', audience: saved.audience || '', avoid: saved.avoid || '', notes: saved.notes || '' }
}

async function saveMemory() {
  savingMemory.value = true
  try {
    await window.api.contentHub.saveProductMemory({ productId: props.productId, ...memory.value })
    memorySaved.value = true
    window.setTimeout(() => (memorySaved.value = false), 2000)
  } finally {
    savingMemory.value = false
  }
}

function makeContent() {
  void ai.open({ recipeId: 'product-content-pack', context: { recipePreset: { productId: props.productId } } })
}

/** The ad creative whose original video is being downloaded for cloning (shown in the performance table). */
const cloning = ref<{ creativeId: string; name: string; state: 'downloading' | 'failed'; error?: string } | null>(null)

/**
 * Clone an ad creative that was not made here (often a creator's post): rebuild its TikTok link,
 * download it with the video download interface, then plan clone variants from that video.
 */
async function cloneFromCreative(creativeId: string, name: string) {
  if (cloning.value?.state === 'downloading') return
  cloning.value = { creativeId, name, state: 'downloading' }
  try {
    const video = await window.api.contentHub.downloadCreativeVideo(creativeId)
    if (video.status !== 'completed' || !video.localVideoPath) {
      cloning.value = { creativeId, name, state: 'failed', error: video.error || video.status }
      return
    }
    cloning.value = null
    const stats = { product: props.productName, name, author: video.creatorHandle ? `@${video.creatorHandle}` : video.author || '-', count: VARIANT_CLONES }
    void ai.open({
      fresh: true,
      send: true,
      prompt: t('ai.perf.clonePlanPrompt', stats),
      attachments: [{ id: `creative-${creativeId}`, name: video.title || `${creativeId}.mp4`, path: video.localVideoPath, mediaType: 'video' }],
      context: { productId: props.productId, referenceVideoPath: video.localVideoPath, quantity: VARIANT_CLONES, sourceCreativeId: creativeId },
      plan: { intents: ['Intent.CommerceVideoCreate', 'Intent.ReviewSubmit'], summary: t('ai.perf.clonePlanSummary', stats) },
    })
  } catch (cause) {
    cloning.value = { creativeId, name, state: 'failed', error: cause instanceof Error ? cause.message : String(cause) }
  }
}

/**
 * A winning ad creative: when it is matched to a video made here, plan variants from that project;
 * otherwise download the ad's own video and clone it.
 */
function makeVariant(name: string, creativeId = '') {
  const source = creativeId ? (overview.value?.items || []).find((item) => item.performance?.creativeId === creativeId) : undefined
  if (source) return makeVariantFrom(source)
  if (/^\d{8,25}$/.test(creativeId)) return void cloneFromCreative(creativeId, name)
  void ai.open({ fresh: true, prompt: t('ai.spine.variantNeedVideoPrompt', { product: props.productName, name }), context: { productId: props.productId } })
}

const VARIANT_PROJECTS = 2
/** Clone variants made from a downloaded ad video. */
const VARIANT_CLONES = 3

/**
 * Variants of a proven video. When it came from a clone project, this becomes a real plan: new
 * projects on the same reference video, product and model, with scripts that differ from the ones
 * already made. The plan card still has to be approved before anything is generated.
 */
function makeVariantFrom(item: Item) {
  const cloneRef = [item.ref, item.sourceRef || ''].find((ref) => ref.startsWith('clone:'))
  const stats = { product: props.productName, title: item.title, line: t(`ai.line.${item.line}`), roi: item.performance?.roi ?? 0, orders: item.performance?.orders ?? 0, count: VARIANT_PROJECTS }
  if (!cloneRef) {
    void ai.open({ fresh: true, prompt: t('ai.perf.variantPrompt', stats), context: { productId: props.productId, sourceRef: item.ref } })
    return
  }
  void ai.open({
    fresh: true,
    send: true,
    prompt: t('ai.perf.variantPlanPrompt', stats),
    context: { productId: props.productId, variantOfProjectId: cloneRef.slice('clone:'.length), variantProjects: VARIANT_PROJECTS },
    plan: { intents: ['Intent.CommerceVideoCreate', 'Intent.ReviewSubmit'], summary: t('ai.perf.variantPlanSummary', stats) },
  })
}

function sceneImages() {
  void ai.open({ recipeId: 'scene-images', context: { recipePreset: { productId: props.productId } } })
}

function publishApproved() {
  void ai.open({ recipeId: 'publish-approved', context: { recipePreset: { productId: props.productId } } })
}

function relationLabel(relation: string) {
  return t(`ai.space.relation.${relation}`)
}

function refLabel(ref: string) {
  const [kind] = ref.split(':')
  return t(`ai.space.refKind.${kind}`, kind)
}

function formatTime(value: number) {
  return new Date(value).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

watch(() => props.productId, () => void load())
onMounted(() => {
  void load()
  unsubscribe = window.api.contentHub.onChanged(() => void load())
})
onBeforeUnmount(() => unsubscribe?.())

defineExpose({ makeContent })
</script>

<template>
  <div class="ps" data-testid="product-space">
    <section class="ps__top">
      <div class="vg-card ps__actions">
        <div class="vg-card__head"><span class="vg-card__title"><Wand2 :size="16" /> {{ t('ai.space.makeTitle') }}</span></div>
        <p class="vg-muted ps__lead">{{ t('ai.space.makeDesc') }}</p>
        <div class="ps__make">
          <button type="button" class="vg-btn vg-btn--primary" data-testid="product-space-make" @click="makeContent"><Clapperboard :size="15" /> {{ t('ai.recipes.pack.title') }}</button>
          <button type="button" class="vg-btn" @click="sceneImages"><Images :size="15" /> {{ t('ai.recipes.scene.title') }}</button>
          <button type="button" class="vg-btn vg-btn--ghost" @click="ai.open({ fresh: true, prompt: t('ai.space.askPrompt', { name: productName }), context: { productId } })"><Wand2 :size="15" /> {{ t('ai.space.askAi') }}</button>
        </div>
      </div>
      <div class="vg-card ps__suggest">
        <div class="vg-card__head"><span class="vg-card__title"><Lightbulb :size="16" /> {{ t('ai.space.nextSteps') }}</span></div>
        <button v-for="item in suggestions" :key="item.key" type="button" class="ps__suggestion" @click="item.action()">{{ item.text }}</button>
      </div>
    </section>

    <ProductChainPanel
      v-if="overview?.spine"
      :product-id="productId"
      :product-name="productName"
      :spine="overview.spine"
      :content-ready="contentReady"
      :content-running="contentRunning"
      :published="overview.stats.publish?.ready || 0"
      @make-content="makeContent"
      @make-variant="makeVariant"
      @changed="load"
    />

    <section class="vg-stats ps__stats">
      <button v-for="line in (['clone', 'creative', 'livephoto', 'publish'] as Line[])" :key="line" type="button" class="vg-stat ps__stat" :class="{ 'is-active': lineFilter === line }" @click="lineFilter = lineFilter === line ? '' : line">
        <span class="vg-stat__icon"><component :is="lineIcon[line]" :size="17" /></span>
        <span class="vg-stat__body">
          <span class="vg-stat__label">{{ t(`ai.line.${line}`) }}</span>
          <span class="vg-stat__value">{{ overview?.stats[line]?.ready || 0 }} <small>{{ t('ai.space.statDetail', { running: overview?.stats[line]?.running || 0, approved: overview?.stats[line]?.approved || 0 }) }}</small></span>
        </span>
      </button>
    </section>

    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><Inbox :size="16" /> {{ t('ai.space.content') }} <small>{{ items.length }}</small></span>
        <div class="vg-card__actions">
          <button v-if="lineFilter" type="button" class="vg-btn vg-btn--xs" @click="lineFilter = ''">{{ t('ai.space.clearFilter') }}</button>
        </div>
      </div>
      <div v-if="items.length" class="ps__grid">
        <button v-for="item in items" :key="item.ref" type="button" class="ps__item" @click="router.push(item.route)">
          <span class="vg-media ps__media">
            <img v-if="item.previewPath" :src="thumbnailUrl(item.previewPath, 240)" alt="" loading="lazy" />
            <span v-else class="vg-media__empty"><component :is="lineIcon[item.line]" :size="20" /></span>
            <span class="vg-media__badge vg-pill" :class="{ 'vg-pill--green': item.status === 'ready', 'vg-pill--blue': item.status === 'running', 'vg-pill--red': item.status === 'failed' }">{{ t(`ai.contentStatus.${item.status}`) }}</span>
          </span>
          <span class="ps__item-title vg-ellipsis">{{ item.title }}</span>
          <span class="ps__item-sub">
            {{ t(`ai.line.${item.line}`) }}
            <template v-if="item.review"> · {{ t(`ai.inbox.tabs.${item.review.decision}`) }}</template>
          </span>
          <span v-if="item.performance && item.performance.verdict !== 'unproven'" class="ps__item-perf" :class="`is-${item.performance.verdict}`" :data-testid="`product-content-perf-${item.ref}`">
            {{ t(`ai.perf.verdict.${item.performance.verdict}`) }} · ROI {{ item.performance.roi }} · {{ t('ai.perf.orders', { count: item.performance.orders }) }}
          </span>
        </button>
      </div>
      <div v-else class="vg-empty">
        <span class="vg-empty__icon"><Clapperboard :size="22" /></span>
        <p>{{ t('ai.space.noContent') }}</p>
      </div>
    </section>

    <ProductPerformancePanel
      v-if="overview?.performance && overview.spine?.tiktokProductIds.length"
      :items="overview.items"
      :performance="overview.performance"
      :cloning="cloning"
      @make-variant="makeVariantFrom($event as Item)"
      @clone-creative="cloneFromCreative($event.creativeId, $event.name)"
      @changed="load"
    />

    <div class="ps__bottom">
      <section class="vg-card">
        <div class="vg-card__head">
          <span class="vg-card__title"><Brain :size="16" /> {{ t('ai.space.memory') }}</span>
          <span class="vg-muted ps__memory-hint">{{ t('ai.space.memoryHint') }}</span>
        </div>
        <div class="vg-form-grid">
          <label class="vg-field"><span class="vg-field__label">{{ t('ai.space.sellingPoints') }}</span><textarea v-model="memory.sellingPoints" class="vg-textarea" rows="3"></textarea></label>
          <label class="vg-field"><span class="vg-field__label">{{ t('ai.space.audience') }}</span><textarea v-model="memory.audience" class="vg-textarea" rows="3"></textarea></label>
          <label class="vg-field"><span class="vg-field__label">{{ t('ai.space.avoid') }}</span><textarea v-model="memory.avoid" class="vg-textarea" rows="3"></textarea></label>
          <label class="vg-field"><span class="vg-field__label">{{ t('ai.space.notes') }}</span><textarea v-model="memory.notes" class="vg-textarea" rows="3"></textarea></label>
        </div>
        <div class="vg-row ps__memory-actions">
          <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="savingMemory" @click="saveMemory"><Save :size="14" /> {{ t('common.save') }}</button>
          <span v-if="memorySaved" class="vg-pill vg-pill--green">{{ t('ai.space.saved') }}</span>
        </div>
      </section>

      <section class="vg-card">
        <div class="vg-card__head"><span class="vg-card__title"><GitBranch :size="16" /> {{ t('ai.space.lineage') }}</span></div>
        <ol v-if="overview?.lineage.length" class="ps__lineage">
          <li v-for="edge in overview.lineage.slice().reverse().slice(0, 12)" :key="edge.id">
            <span class="ps__lineage-dot"></span>
            <span>{{ refLabel(edge.fromRef) }} → {{ relationLabel(edge.relation) }} → {{ refLabel(edge.toRef) }}</span>
            <time>{{ formatTime(edge.createdAt) }}</time>
          </li>
        </ol>
        <p v-else class="vg-muted ps__empty">{{ t('ai.space.noLineage') }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ps { display: flex; flex-direction: column; gap: 12px; }
.ps__top { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 12px; }
.ps__lead { margin: 0 0 12px; font-size: 12.5px; }
.ps__make { display: flex; flex-wrap: wrap; gap: 8px; }
.ps__suggest { display: flex; flex-direction: column; gap: 6px; }
.ps__suggestion { padding: 8px 10px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); color: var(--theme-text); font-size: 12.5px; text-align: left; cursor: pointer; }
.ps__suggestion:hover { border-color: var(--vg-accent-line); }
.ps__stat { cursor: pointer; text-align: left; border: 1px solid transparent; }
.ps__stat.is-active { border-color: var(--vg-accent-line); }
.ps__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.ps__item { display: flex; flex-direction: column; gap: 6px; padding: 0; border: 0; background: transparent; color: var(--theme-text); text-align: left; cursor: pointer; min-width: 0; }
.ps__media { --vg-media-ratio: 3 / 4; }
.ps__item:hover .ps__media { border-color: var(--vg-accent-line); }
.ps__item-title { font-size: 12.5px; font-weight: 600; }
.ps__item-sub { font-size: 11.5px; color: var(--theme-text-muted); }
.ps__item-perf { font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--vg-blue); }
.ps__item-perf.is-winner { color: var(--vg-green); }
.ps__item-perf.is-weak { color: var(--vg-red); }
.ps__bottom { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 12px; }
.ps__memory-hint { font-size: 11.5px; }
.ps__memory-actions { margin-top: 10px; }
.ps__lineage { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
.ps__lineage li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 8px; align-items: center; color: var(--theme-text-secondary); }
.ps__lineage time { color: var(--theme-text-muted); font-size: 11px; }
.ps__lineage-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--vg-accent); }
.ps__empty { font-size: 12.5px; }
@media (max-width: 1100px) {
  .ps__top, .ps__bottom { grid-template-columns: minmax(0, 1fr); }
}
</style>
