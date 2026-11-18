<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Inbox,
  Keyboard,
  RefreshCcw,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-vue-next'
import { localMediaUrl, thumbnailUrl } from '@/lib/localMedia'
import { useAiProducerStore } from '@/stores/aiProducer'

type Decision = 'pending' | 'approved' | 'redo' | 'discarded'
type ReviewItem = {
  ref: string
  line: 'clone' | 'creative' | 'livephoto'
  title: string
  productId?: string
  productName?: string
  mediaPath?: string
  previewPath?: string
  route: string
  updatedAt: number
  review: { decision: Decision; reason?: string; note?: string; decidedAt?: number }
}

const REDO_REASONS = ['product_mismatch', 'weird_motion', 'blurry', 'bad_composition', 'off_brand', 'subtitle_issue', 'other'] as const

const { t, locale } = useI18n()
const router = useRouter()
const ai = useAiProducerStore()

const decision = ref<Decision>('pending')
const line = ref<'' | ReviewItem['line']>('')
const items = ref<ReviewItem[]>([])
const counts = ref<Record<Decision, number>>({ pending: 0, approved: 0, redo: 0, discarded: 0 })
const index = ref(0)
const loading = ref(false)
const busy = ref(false)
const redoOpen = ref(false)
const redoReason = ref<(typeof REDO_REASONS)[number]>('product_mismatch')
const redoNote = ref('')
const lastDecided = ref<string[]>([])
const shortcutsOpen = ref(false)
const toast = ref('')
let unsubscribe: (() => void) | null = null

const current = computed(() => items.value[index.value] || null)
const isVideo = computed(() => /\.(mp4|mov|webm|mkv|m4v)$/i.test(current.value?.mediaPath || ''))

async function load(keepIndex = false) {
  loading.value = true
  try {
    const [rows, nextCounts] = await Promise.all([
      window.api.contentHub.listReviews({ decision: decision.value, ...(line.value ? { line: line.value } : {}) }),
      window.api.contentHub.reviewCounts(),
    ])
    items.value = rows as ReviewItem[]
    counts.value = nextCounts as Record<Decision, number>
    if (!keepIndex) index.value = 0
    index.value = Math.min(index.value, Math.max(0, items.value.length - 1))
  } finally {
    loading.value = false
  }
}

function flash(text: string) {
  toast.value = text
  window.setTimeout(() => {
    if (toast.value === text) toast.value = ''
  }, 2600)
}

async function decide(next: Exclude<Decision, 'pending'>, reason?: string, note?: string) {
  const item = current.value
  if (!item || busy.value) return
  busy.value = true
  try {
    await window.api.contentHub.decideReview({ ref: item.ref, decision: next, reason, note })
    lastDecided.value = [item.ref, ...lastDecided.value].slice(0, 20)
    flash(t(`ai.inbox.decided.${next}`))
    redoOpen.value = false
    redoNote.value = ''
    await load(true)
  } catch (error) {
    flash(String((error as Error)?.message || error))
  } finally {
    busy.value = false
  }
}

async function undo() {
  const ref = lastDecided.value[0]
  if (!ref) return
  await window.api.contentHub.reopenReview(ref)
  lastDecided.value = lastDecided.value.slice(1)
  flash(t('ai.inbox.undone'))
  await load(true)
}

function move(delta: number) {
  if (!items.value.length) return
  index.value = (index.value + delta + items.value.length) % items.value.length
}

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  if (event.ctrlKey || event.metaKey || event.altKey) return
  const key = event.key.toLowerCase()
  if (key === 'arrowright' || key === 'j') move(1)
  else if (key === 'arrowleft' || key === 'k') move(-1)
  else if (decision.value === 'pending' && key === 'a') void decide('approved')
  else if (decision.value === 'pending' && key === 'r') redoOpen.value = true
  else if (decision.value === 'pending' && key === 'd') void decide('discarded')
  else if (key === 'z') void undo()
  else if (key === '?') shortcutsOpen.value = !shortcutsOpen.value
  else if (key === 'escape') redoOpen.value = false
  else return
  event.preventDefault()
}

function convertToLivePhoto(item: ReviewItem) {
  void ai.open({
    fresh: true,
    send: true,
    prompt: t('ai.inbox.toLivePhotoPrompt', { title: item.title }),
    context: { refs: [item.ref], productId: item.productId },
    plan: { intents: ['Intent.LivePhotoFromVideo'], summary: t('ai.inbox.toLivePhotoPrompt', { title: item.title }) },
  })
}

function createPublishDrafts(refs: string[]) {
  void ai.open({
    fresh: true,
    send: true,
    prompt: t('ai.inbox.publishPrompt', { count: refs.length }),
    context: { refs },
    plan: { intents: ['Intent.PublishDraft'], summary: t('ai.inbox.publishPrompt', { count: refs.length }) },
  })
}

function formatTime(value?: number) {
  return value ? new Date(value).toLocaleString(locale.value, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
}

watch([decision, line], () => void load())

onMounted(() => {
  void load()
  window.addEventListener('keydown', onKeydown)
  unsubscribe = window.api.contentHub.onChanged(() => void load(true))
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  unsubscribe?.()
})
</script>

<template>
  <main class="vg-scope vg-page inbox" data-testid="review-inbox">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><Inbox :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('ai.inbox.title') }}</h1>
        <p>{{ t('ai.inbox.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button type="button" class="vg-btn vg-btn--sm" :disabled="!lastDecided.length" @click="undo"><Undo2 :size="14" /> {{ t('ai.inbox.undo') }}</button>
        <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" @click="shortcutsOpen = !shortcutsOpen"><Keyboard :size="14" /></button>
        <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" :disabled="loading" @click="load(true)"><RefreshCcw :size="14" :class="{ 'vg-spin': loading }" /></button>
      </div>
    </header>

    <div class="vg-toolbar">
      <div class="vg-seg">
        <button v-for="key in (['pending', 'approved', 'redo', 'discarded'] as Decision[])" :key="key" type="button" class="vg-seg__btn" :class="{ 'is-active': decision === key }" @click="decision = key">
          {{ t(`ai.inbox.tabs.${key}`) }} <span class="vg-count">{{ counts[key] }}</span>
        </button>
      </div>
      <span class="vg-toolbar__spacer"></span>
      <select v-model="line" class="vg-select vg-select--sm inbox__line">
        <option value="">{{ t('ai.inbox.allLines') }}</option>
        <option value="clone">{{ t('ai.line.clone') }}</option>
        <option value="creative">{{ t('ai.line.creative') }}</option>
        <option value="livephoto">{{ t('ai.line.livephoto') }}</option>
      </select>
      <button v-if="decision === 'approved' && items.length" type="button" class="vg-btn vg-btn--sm vg-btn--primary" @click="createPublishDrafts(items.filter((item) => item.line !== 'livephoto').map((item) => item.ref))">
        <SendHorizontal :size="14" /> {{ t('ai.inbox.publishAll') }}
      </button>
    </div>

    <div v-if="shortcutsOpen" class="vg-notice vg-notice--accent inbox__shortcuts">
      <span><kbd>A</kbd> {{ t('ai.inbox.approve') }}</span>
      <span><kbd>R</kbd> {{ t('ai.inbox.redo') }}</span>
      <span><kbd>D</kbd> {{ t('ai.inbox.discard') }}</span>
      <span><kbd>←</kbd><kbd>→</kbd> {{ t('ai.inbox.switch') }}</span>
      <span><kbd>Z</kbd> {{ t('ai.inbox.undo') }}</span>
    </div>

    <div v-if="!items.length && !loading" class="vg-card inbox__empty">
      <div class="vg-empty">
        <span class="vg-empty__icon"><Sparkles :size="24" /></span>
        <h3>{{ decision === 'pending' ? t('ai.inbox.emptyPending') : t('ai.inbox.empty') }}</h3>
        <p>{{ t('ai.inbox.emptyHint') }}</p>
        <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" @click="ai.open({ recipeId: 'product-content-pack' })">{{ t('ai.inbox.startRecipe') }}</button>
      </div>
    </div>

    <section v-else class="inbox__body">
      <div class="inbox__stage vg-card">
        <div class="inbox__media">
          <video v-if="current && isVideo" :key="current.ref" :src="localMediaUrl(current.mediaPath)" :poster="current.previewPath ? thumbnailUrl(current.previewPath, 720) : undefined" controls autoplay muted loop playsinline></video>
          <img v-else-if="current?.mediaPath" :src="localMediaUrl(current.mediaPath)" alt="" />
          <button type="button" class="inbox__nav inbox__nav--prev" :aria-label="t('ai.inbox.prev')" @click="move(-1)"><ChevronLeft :size="20" /></button>
          <button type="button" class="inbox__nav inbox__nav--next" :aria-label="t('ai.inbox.next')" @click="move(1)"><ChevronRight :size="20" /></button>
        </div>
        <aside v-if="current" class="inbox__meta">
          <div class="inbox__meta-head">
            <span class="vg-pill vg-pill--accent">{{ t(`ai.line.${current.line}`) }}</span>
            <span class="vg-muted">{{ index + 1 }} / {{ items.length }}</span>
          </div>
          <h2 class="inbox__title">{{ current.title }}</h2>
          <dl class="vg-kv">
            <dt>{{ t('ai.inbox.product') }}</dt>
            <dd>
              <button v-if="current.productId" type="button" class="vg-link" @click="router.push(`/products/${current.productId}`)">{{ current.productName || current.productId }}</button>
              <span v-else>-</span>
            </dd>
            <dt>{{ t('ai.inbox.finishedAt') }}</dt>
            <dd>{{ formatTime(current.updatedAt) }}</dd>
            <template v-if="current.review.decidedAt">
              <dt>{{ t('ai.inbox.decision') }}</dt>
              <dd>{{ t(`ai.inbox.tabs.${current.review.decision}`) }}<template v-if="current.review.reason"> · {{ t(`ai.redo.${current.review.reason}`) }}</template></dd>
            </template>
            <template v-if="current.review.note">
              <dt>{{ t('ai.inbox.note') }}</dt>
              <dd>{{ current.review.note }}</dd>
            </template>
          </dl>

          <div v-if="decision === 'pending'" class="inbox__decide">
            <button type="button" class="vg-btn vg-btn--primary" data-testid="inbox-approve" :disabled="busy" @click="decide('approved')"><Check :size="15" /> {{ t('ai.inbox.approve') }} <kbd>A</kbd></button>
            <button type="button" class="vg-btn" :disabled="busy" @click="redoOpen = !redoOpen"><RotateCcw :size="15" /> {{ t('ai.inbox.redo') }} <kbd>R</kbd></button>
            <button type="button" class="vg-btn vg-btn--ghost" :disabled="busy" @click="decide('discarded')"><Trash2 :size="15" /> {{ t('ai.inbox.discard') }} <kbd>D</kbd></button>
          </div>

          <div v-if="redoOpen" class="inbox__redo">
            <span class="vg-field__label">{{ t('ai.inbox.redoReason') }}</span>
            <div class="inbox__reasons">
              <button v-for="reason in REDO_REASONS" :key="reason" type="button" class="vg-chip inbox__reason" :class="{ 'is-on': redoReason === reason }" @click="redoReason = reason">{{ t(`ai.redo.${reason}`) }}</button>
            </div>
            <textarea v-model="redoNote" class="vg-textarea" rows="2" :placeholder="t('ai.inbox.notePlaceholder')"></textarea>
            <p class="vg-field__hint">{{ t('ai.inbox.redoHint') }}</p>
            <button type="button" class="vg-btn vg-btn--sm vg-btn--primary" :disabled="busy" @click="decide('redo', redoReason, redoNote)">{{ t('ai.inbox.confirmRedo') }}</button>
          </div>

          <div class="inbox__more">
            <button type="button" class="vg-btn vg-btn--sm vg-btn--soft" @click="router.push(current.route)"><ExternalLink :size="14" /> {{ t('ai.inbox.openProject') }}</button>
            <button v-if="isVideo && current.line !== 'livephoto'" type="button" class="vg-btn vg-btn--sm vg-btn--soft" @click="convertToLivePhoto(current)"><Sparkles :size="14" /> {{ t('ai.inbox.toLivePhoto') }}</button>
            <button v-if="decision === 'approved' && current.line !== 'livephoto'" type="button" class="vg-btn vg-btn--sm vg-btn--soft" @click="createPublishDrafts([current.ref])"><SendHorizontal :size="14" /> {{ t('ai.inbox.publishOne') }}</button>
          </div>
        </aside>
      </div>

      <div class="inbox__strip">
        <button
          v-for="(item, itemIndex) in items"
          :key="item.ref"
          type="button"
          class="inbox__thumb"
          :class="{ 'is-active': itemIndex === index }"
          :title="item.title"
          @click="index = itemIndex"
        >
          <img v-if="item.previewPath" :src="thumbnailUrl(item.previewPath, 160)" alt="" loading="lazy" />
          <span v-else class="inbox__thumb-empty">{{ t(`ai.line.${item.line}`) }}</span>
        </button>
      </div>
    </section>

    <Transition name="vg-toast">
      <div v-if="toast" class="vg-toast vg-toast--success inbox__toast">{{ toast }}</div>
    </Transition>
  </main>
</template>

<style scoped>
.inbox { width: min(1400px, 100%); margin: 0 auto; }
.inbox__line { width: 150px; }
.inbox__shortcuts { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12.5px; }
.inbox__empty { padding: 40px 0; }
.inbox__body { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.inbox__stage { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 0; padding: 0; overflow: hidden; }
.inbox__media { position: relative; min-height: 460px; height: calc(100vh - 330px); max-height: 760px; background: #000; display: flex; align-items: center; justify-content: center; }
.inbox__media video, .inbox__media img { max-width: 100%; max-height: 100%; object-fit: contain; }
.inbox__nav { position: absolute; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .14); color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.inbox__nav:hover { background: rgba(255, 255, 255, .26); }
.inbox__nav--prev { left: 12px; }
.inbox__nav--next { right: 12px; }
.inbox__meta { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-left: 1px solid var(--theme-divider); overflow: auto; }
.inbox__meta-head { display: flex; justify-content: space-between; align-items: center; }
.inbox__title { margin: 0; font-size: 16px; line-height: 1.4; }
.inbox__decide { display: flex; flex-direction: column; gap: 8px; }
.inbox__decide .vg-btn { justify-content: flex-start; }
.inbox__decide kbd { margin-left: auto; }
.inbox__redo { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); }
.inbox__reasons { display: flex; flex-wrap: wrap; gap: 6px; }
.inbox__reason { cursor: pointer; height: 26px; padding: 0 10px; font-size: 12px; }
.inbox__reason.is-on { background: var(--vg-accent-soft); border-color: var(--vg-accent-line); color: var(--vg-accent); }
.inbox__more { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; }
.inbox__strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.inbox__thumb { flex: 0 0 auto; width: 72px; height: 96px; padding: 0; border: 2px solid transparent; border-radius: 8px; overflow: hidden; background: var(--theme-panel-soft); cursor: pointer; }
.inbox__thumb.is-active { border-color: var(--vg-accent); }
.inbox__thumb img { width: 100%; height: 100%; object-fit: cover; }
.inbox__thumb-empty { font-size: 10px; color: var(--theme-text-muted); }
.inbox__toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 50; }
kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 4px; border: 1px solid var(--theme-border); border-radius: 4px; background: var(--theme-panel-soft); font-size: 10.5px; font-family: inherit; color: var(--theme-text-secondary); }
@media (max-width: 1100px) {
  .inbox__stage { grid-template-columns: minmax(0, 1fr); }
  .inbox__meta { border-left: 0; border-top: 1px solid var(--theme-divider); }
  .inbox__media { height: 420px; }
}
</style>
