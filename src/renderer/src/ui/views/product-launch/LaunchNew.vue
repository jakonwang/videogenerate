<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Clapperboard, FileText, Globe, ImagePlus, Images, LoaderCircle, Minus, Package, Plus, Search, Upload, X, Zap } from 'lucide-vue-next'
import ProductSelectDialog from '@/ui/components/ProductSelectDialog.vue'
import { thumbnailUrl } from '@/lib/localMedia'
import { productCategoryLabel, productCategoryOptions } from '../../../../../shared/productCategories'
import { LAUNCH_LISTING_IMAGES, LAUNCH_VIDEO_ENGINES, LAUNCH_MARKETS, LAUNCH_MAX_ITEMS, LAUNCH_MAX_TITLES, LAUNCH_MAX_VIDEOS, launchCostEstimate, launchSummary, normalizeLaunchOptions, type LaunchMarket, type LaunchVideoEngine } from '../../../../../shared/productLaunch'

type Draft = { key: string; source: 'upload' | 'library'; productId?: string; path: string; name: string; price: string; sellingPoints: string }
type Product = { id: string; name: string; type?: string; coverImagePath?: string; images?: Array<{ filePath: string; isCover?: boolean }> }

const emit = defineEmits<{ created: [jobId: string] }>()
const { t, locale } = useI18n()
const k = (key: string, params: Record<string, unknown> = {}) => t(`ai.launch.${key}`, params)

const source = ref<'upload' | 'library'>('upload')
const drafts = ref<Draft[]>([])
const category = ref('general')
const products = ref<Product[]>([])
const pickerOpen = ref(false)
const markets = ref<LaunchMarket[]>(['VN'])
const doImages = ref(true)
const doCopy = ref(true)
const doVideos = ref(true)
const titleCount = ref(2)
const videoCount = ref(3)
const videoEngine = ref<LaunchVideoEngine>('creative')
/** 这里能用的出视频方式（网页版在服务器上跑，没有 tk创意室） */
const engines = ref<LaunchVideoEngine[]>([...LAUNCH_VIDEO_ENGINES])
const busy = ref(false)
const error = ref('')
const dragging = ref(false)

const options = computed(() => normalizeLaunchOptions({ images: doImages.value, copy: doCopy.value, videos: doVideos.value, titleCount: titleCount.value, videoCount: videoCount.value, videoEngine: videoEngine.value }))
const summary = computed(() => launchSummary({ itemCount: drafts.value.length, markets: markets.value.length, options: options.value }))
/** 出图模型的单价（云端价目表）；没登录拿不到就只写「按实际扣点」 */
const imagePoints = ref<number[]>([])
const videoPoints = ref<number[]>([])
const balance = ref<{ balance: number; unlimited: boolean } | null>(null)
const estimate = computed(() => launchCostEstimate({ products: drafts.value.length, options: options.value, imagePoints: imagePoints.value, videoPoints: videoPoints.value }))
const estimateText = computed(() => {
  const { min, max } = estimate.value
  if (min === null || max === null) return ''
  return min === max ? k('pointsAbout', { points: min }) : k('pointsRange', { min, max })
})
const short = computed(() => Boolean(balance.value && !balance.value.unlimited && estimate.value.min !== null && balance.value.balance < estimate.value.min))
const categories = computed(() => productCategoryOptions(products.value.map((product) => product.type)))
const canStart = computed(() => drafts.value.length > 0 && !busy.value && (doImages.value || doCopy.value || doVideos.value) && (!doCopy.value || markets.value.length > 0))
const blockedReason = computed(() => {
  if (!drafts.value.length) return k('needProduct')
  if (!doImages.value && !doCopy.value && !doVideos.value) return k('needOutput')
  if (doCopy.value && !markets.value.length) return k('needMarket')
  return ''
})

let seq = 0
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i
const baseName = (path: string) => (path.split(/[\\/]/).pop() || '').replace(/\.[^.]+$/, '')
const cover = (product: Product) => product.coverImagePath || product.images?.find((image) => image.isCover)?.filePath || product.images?.[0]?.filePath || ''
const messageOf = (cause: unknown) => String((cause as Error)?.message || cause).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')

function addUploads(paths: string[]) {
  error.value = ''
  const images = paths.filter((path) => IMAGE_EXT.test(path))
  if (paths.length && !images.length) error.value = k('onlyImages')
  const room = LAUNCH_MAX_ITEMS - drafts.value.length
  if (images.length > room) error.value = k('tooMany', { max: LAUNCH_MAX_ITEMS })
  drafts.value.push(...images.slice(0, Math.max(0, room)).map((path) => ({ key: `d${(seq += 1)}`, source: 'upload' as const, path, name: baseName(path), price: '', sellingPoints: '' })))
}

async function pickImages() {
  const paths = (await window.api.pickFiles({ title: k('pickTitle'), filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], multiple: true })) as string[]
  addUploads(paths || [])
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const files = Array.from(event.dataTransfer?.files || [])
  addUploads(files.map((file) => window.api.getPathForFile(file)).filter(Boolean))
}

function pickProducts(ids: string[]) {
  pickerOpen.value = false
  const kept = drafts.value.filter((draft) => draft.source === 'upload' || ids.includes(draft.productId || ''))
  const have = new Set(kept.map((draft) => draft.productId))
  const added = ids
    .filter((id) => !have.has(id))
    .map((id) => products.value.find((product) => product.id === id))
    .filter((product): product is Product => Boolean(product))
    .map((product) => ({ key: `d${(seq += 1)}`, source: 'library' as const, productId: product.id, path: cover(product), name: product.name, price: '', sellingPoints: '' }))
  drafts.value = [...kept, ...added].slice(0, LAUNCH_MAX_ITEMS)
}

function remove(key: string) {
  drafts.value = drafts.value.filter((draft) => draft.key !== key)
}

function toggleMarket(code: LaunchMarket) {
  markets.value = markets.value.includes(code) ? markets.value.filter((item) => item !== code) : [...markets.value, code]
}

const step = (value: number, delta: number, max: number) => Math.min(max, Math.max(1, value + delta))

async function start() {
  if (!canStart.value) return
  busy.value = true
  error.value = ''
  try {
    const job = await window.api.productLaunch.create({
      markets: [...markets.value],
      options: { ...options.value },
      items: drafts.value.map((draft) => ({
        source: draft.source,
        productId: draft.productId,
        imagePath: draft.source === 'upload' ? draft.path : undefined,
        name: draft.name.trim(),
        category: category.value,
        price: draft.price.trim(),
        sellingPoints: draft.sellingPoints.trim(),
      })),
    })
    drafts.value = []
    emit('created', job.id)
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  const [rows, info, pricing, credits] = await Promise.all([
    window.api.products.list().catch(() => []),
    window.api.productLaunch.info().catch(() => null),
    window.api.cloud.pricing().catch(() => null),
    window.api.cloud.credits().catch(() => null),
  ])
  products.value = Array.isArray(rows) ? rows : []
  if (info?.videoEngines?.length) {
    engines.value = info.videoEngines
    if (!engines.value.includes(videoEngine.value)) videoEngine.value = engines.value[0]!
  }
  if (pricing?.ok) {
    const models = pricing.models.filter((model) => model.capability === 'image' && model.enabled).map((model) => model.points)
    imagePoints.value = models.length ? models : [pricing.defaults.points.image]
    const videos = pricing.models.filter((model) => model.capability === 'video' && model.enabled).map((model) => model.points)
    videoPoints.value = videos.length ? videos : [pricing.defaults.points.video]
  }
  if (credits?.ok) balance.value = { balance: credits.balance, unlimited: credits.unlimited }
})
</script>

<template>
  <div class="ln">
    <div class="ln__main">
      <div v-if="error" class="vg-notice vg-notice--danger" role="alert"><span>{{ error }}</span><button type="button" class="vg-icon-btn vg-icon-btn--sm" :aria-label="k('close')" @click="error = ''"><X :size="14" /></button></div>

      <!-- 1 选商品 -->
      <section class="vg-card ln__card">
        <div class="ln__step"><span class="ln__no">1</span><h2>{{ k('step1') }}</h2><p>{{ k('step1Hint') }}</p></div>
        <nav class="gs-tabs" :aria-label="k('step1')">
          <button type="button" class="gs-tab" :class="{ 'is-active': source === 'upload' }" @click="source = 'upload'"><Upload :size="15" />{{ k('fromUpload') }}</button>
          <button type="button" class="gs-tab" :class="{ 'is-active': source === 'library' }" @click="source = 'library'"><Package :size="15" />{{ k('fromLibrary') }}</button>
        </nav>

        <div v-if="source === 'upload'" class="ln__drop" :class="{ 'is-over': dragging }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
          <ImagePlus :size="22" />
          <span>{{ k('dropHint') }}</span>
          <button type="button" class="vg-btn vg-btn--sm" @click="pickImages"><Plus :size="14" />{{ k('pickImages') }}</button>
        </div>
        <div v-else class="ln__drop">
          <Search :size="22" />
          <span>{{ k('libraryHint') }}</span>
          <button type="button" class="vg-btn vg-btn--sm" @click="pickerOpen = true"><Package :size="14" />{{ k('pickProducts') }}</button>
        </div>

        <ul v-if="drafts.length" class="ln__items">
          <li v-for="draft in drafts" :key="draft.key" class="ln__item">
            <span class="ln__thumb"><img v-if="draft.path" :src="thumbnailUrl(draft.path, 96)" alt="" /><Package v-else :size="22" /></span>
            <div class="ln__fields">
              <label class="ln__field ln__field--name"><span>{{ k('name') }}</span><input v-model="draft.name" class="vg-input vg-input--sm" :disabled="draft.source === 'library'" maxlength="60" /></label>
              <label class="ln__field"><span>{{ k('price') }}</span><input v-model="draft.price" class="vg-input vg-input--sm" :placeholder="k('pricePlaceholder')" maxlength="40" /></label>
              <label class="ln__field ln__field--wide"><span>{{ k('sellingPoints') }}</span><input v-model="draft.sellingPoints" class="vg-input vg-input--sm" :placeholder="k('sellingPointsPlaceholder')" maxlength="300" /></label>
            </div>
            <span class="vg-chip">{{ draft.source === 'upload' ? k('tagUpload') : k('tagLibrary') }}</span>
            <button type="button" class="vg-icon-btn vg-icon-btn--sm" :aria-label="k('remove')" @click="remove(draft.key)"><X :size="14" /></button>
          </li>
        </ul>
        <label v-if="drafts.some((draft) => draft.source === 'upload')" class="ln__category">
          <span>{{ k('category') }}</span>
          <select v-model="category" class="vg-select vg-select--sm">
            <option v-for="item in categories" :key="item" :value="item">{{ productCategoryLabel(item, String(locale)) }}</option>
          </select>
          <small>{{ k('categoryHint') }}</small>
        </label>
      </section>

      <!-- 2 要做什么 -->
      <section class="vg-card ln__card">
        <div class="ln__step"><span class="ln__no">2</span><h2>{{ k('step2') }}</h2><p>{{ k('step2Hint') }}</p></div>
        <div class="ln__tiles">
          <div class="ln__tile" :class="{ 'is-on': doImages }">
            <button type="button" class="ln__tile-head" :aria-pressed="doImages" @click="doImages = !doImages"><span class="ln__icon"><Images :size="18" /></span><b>{{ k('outImages') }}</b><span class="ln__check" :class="{ 'is-on': doImages }"><Check v-if="doImages" :size="11" /></span></button>
            <span class="ln__tile-desc">{{ k('outImagesDesc') }}</span>
            <div class="ln__tile-foot"><span>{{ k('perProduct') }}</span><b>{{ k('imagesFixed', { count: LAUNCH_LISTING_IMAGES }) }}</b></div>
          </div>
          <div class="ln__tile" :class="{ 'is-on': doCopy }">
            <button type="button" class="ln__tile-head" :aria-pressed="doCopy" @click="doCopy = !doCopy"><span class="ln__icon"><Globe :size="18" /></span><b>{{ k('outCopy') }}</b><span class="ln__check" :class="{ 'is-on': doCopy }"><Check v-if="doCopy" :size="11" /></span></button>
            <span class="ln__tile-desc">{{ k('outCopyDesc') }}</span>
            <div class="ln__tile-foot"><span>{{ k('perMarket') }}</span>
              <span class="ln__stepper"><button type="button" :aria-label="k('less')" :disabled="!doCopy || titleCount <= 1" @click="titleCount = step(titleCount, -1, LAUNCH_MAX_TITLES)"><Minus :size="13" /></button><b>{{ k('titlesCount', { count: titleCount }) }}</b><button type="button" :aria-label="k('more')" :disabled="!doCopy || titleCount >= LAUNCH_MAX_TITLES" @click="titleCount = step(titleCount, 1, LAUNCH_MAX_TITLES)"><Plus :size="13" /></button></span>
            </div>
          </div>
          <div class="ln__tile" :class="{ 'is-on': doVideos }">
            <button type="button" class="ln__tile-head" :aria-pressed="doVideos" @click="doVideos = !doVideos"><span class="ln__icon"><Clapperboard :size="18" /></span><b>{{ k('outVideos') }}</b><span class="ln__check" :class="{ 'is-on': doVideos }"><Check v-if="doVideos" :size="11" /></span></button>
            <span class="ln__tile-desc">{{ k(videoEngine === 'livePhoto' ? 'outVideosDescLivePhoto' : 'outVideosDesc') }}</span>
            <div class="vg-seg vg-seg--sm ln__engine" role="radiogroup" :aria-label="k('videoEngine')">
              <button v-for="engine in LAUNCH_VIDEO_ENGINES" :key="engine" type="button" role="radio" class="vg-seg__btn" :class="{ 'is-active': videoEngine === engine }" :aria-checked="videoEngine === engine" :disabled="!doVideos || !engines.includes(engine)" :title="engines.includes(engine) ? undefined : k('engineUnavailable')" @click="videoEngine = engine">{{ k(`engine.${engine}`) }}</button>
            </div>
            <small v-if="engines.length < LAUNCH_VIDEO_ENGINES.length" class="ln__engine-note">{{ k('engineUnavailable') }}</small>
            <div class="ln__tile-foot"><span>{{ k('perProduct') }}</span>
              <span class="ln__stepper"><button type="button" :aria-label="k('less')" :disabled="!doVideos || videoCount <= 1" @click="videoCount = step(videoCount, -1, LAUNCH_MAX_VIDEOS)"><Minus :size="13" /></button><b>{{ k('videosCount', { count: videoCount }) }}</b><button type="button" :aria-label="k('more')" :disabled="!doVideos || videoCount >= LAUNCH_MAX_VIDEOS" @click="videoCount = step(videoCount, 1, LAUNCH_MAX_VIDEOS)"><Plus :size="13" /></button></span>
            </div>
          </div>
        </div>
      </section>

      <!-- 3 国家 -->
      <section class="vg-card ln__card">
        <div class="ln__step"><span class="ln__no">3</span><h2>{{ k('step3') }}</h2><p>{{ k('step3Hint') }}</p></div>
        <div class="ln__markets">
          <button v-for="market in LAUNCH_MARKETS" :key="market.code" type="button" class="ln__market" :class="{ 'is-on': markets.includes(market.code) }" :aria-pressed="markets.includes(market.code)" @click="toggleMarket(market.code)">
            <span class="ln__cc">{{ market.code }}</span>
            <span class="ln__market-text"><b>{{ k(`market.${market.code}`) }}</b><small>{{ k(`lang.${market.code}`) }}</small></span>
            <span class="ln__check" :class="{ 'is-on': markets.includes(market.code) }"><Check v-if="markets.includes(market.code)" :size="11" /></span>
          </button>
        </div>
      </section>

      <!-- 4 怎么发 -->
      <section class="vg-card ln__card">
        <div class="ln__step"><span class="ln__no">4</span><h2>{{ k('step4') }}</h2><p>{{ k('step4Hint') }}</p></div>
        <div class="ln__modes">
          <div class="ln__mode is-on"><span class="ln__mode-head"><span class="ln__radio" /><b>{{ k('modeDraft') }}</b><span class="vg-pill vg-pill--accent">{{ k('recommended') }}</span></span><span>{{ k('modeDraftDesc') }}</span></div>
          <div class="ln__mode is-off" :aria-disabled="true"><span class="ln__mode-head"><span class="ln__radio" /><b>{{ k('modeAfterReview') }}</b><span class="vg-pill">{{ k('comingSoon') }}</span></span><span>{{ k('modeAfterReviewDesc') }}</span></div>
          <div class="ln__mode is-off" :aria-disabled="true"><span class="ln__mode-head"><span class="ln__radio" /><b>{{ k('modeAuto') }}</b><span class="vg-pill">{{ k('comingSoon') }}</span></span><span>{{ k('modeAutoDesc') }}</span></div>
        </div>
      </section>
    </div>

    <aside class="ln__side">
      <section class="vg-card ln__card ln__summary">
        <h2>{{ k('summaryTitle') }}</h2>
        <div class="ln__row"><span>{{ k('sumProducts') }}</span><b>{{ summary.products }}</b></div>
        <div class="ln__row"><span>{{ k('sumImages') }}</span><b>{{ summary.images }}</b></div>
        <div class="ln__row"><span>{{ k('sumDetails') }}</span><b>{{ summary.details }}</b></div>
        <div class="ln__row"><span>{{ k('sumTitles') }}</span><b>{{ summary.titles }}</b></div>
        <div class="ln__row"><span>{{ k('sumVideos') }}</span><b>{{ summary.videos }}</b></div>
        <div v-if="estimateText && drafts.length" class="ln__estimate" :class="{ 'is-short': short }" data-testid="launch-estimate">
          <span>{{ k('estimate') }}</span>
          <b>{{ estimateText }}</b>
          <small v-if="balance">{{ balance.unlimited ? k('balanceUnlimited') : k('balance', { points: balance.balance }) }}<template v-if="short"> · {{ k('balanceShort') }}</template></small>
        </div>
        <p class="ln__cost"><FileText :size="14" />{{ estimateText && drafts.length ? k(estimate.videoCalls ? 'costDetailLivePhoto' : 'costDetail', { calls: estimate.imageCalls, videos: estimate.videoCalls }) : k('costHint') }}</p>
        <button type="button" class="vg-btn vg-btn--primary vg-btn--lg vg-btn--block" :disabled="!canStart" @click="start"><LoaderCircle v-if="busy" :size="16" class="vg-spin" /><Zap v-else :size="16" />{{ k('start') }}</button>
        <small class="ln__foot">{{ blockedReason || k('startHint') }}</small>
      </section>
      <section class="vg-card ln__card">
        <h2>{{ k('howTitle') }}</h2>
        <ol class="ln__how">
          <li v-for="n in 5" :key="n"><span class="ln__no ln__no--sm">{{ n }}</span>{{ k(`how${n}`) }}</li>
        </ol>
      </section>
    </aside>

    <ProductSelectDialog :open="pickerOpen" :products="products" multiple :selected-ids="drafts.filter((draft) => draft.productId).map((draft) => draft.productId!)" @close="pickerOpen = false" @select="pickProducts([$event])" @select-many="pickProducts" />
  </div>
</template>

<style scoped>
.ln { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; min-height: 0; }
.ln__main { flex: 999 1 620px; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.ln__side { flex: 1 1 280px; max-width: 340px; min-width: 260px; display: flex; flex-direction: column; gap: 14px; position: sticky; top: 0; }
.ln__card { display: flex; flex-direction: column; gap: 14px; padding: 16px 18px; }
.ln__card h2 { margin: 0; font-size: 15px; font-weight: 600; color: var(--theme-text); }
.ln__step { display: flex; align-items: center; gap: 10px; }
.ln__step p { margin: 0 0 0 auto; font-size: 12px; color: var(--theme-text-muted); }
.ln__no { display: inline-grid; place-items: center; width: 22px; height: 22px; flex-shrink: 0; border-radius: 50%; background: var(--theme-accent-soft); color: var(--theme-control-selected-text); font-size: 12px; font-weight: 700; }
.ln__no--sm { width: 18px; height: 18px; font-size: 10.5px; }

.ln__drop { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1.5px dashed var(--theme-border-control); border-radius: 10px; background: var(--theme-input); color: var(--theme-text-muted); font-size: 13px; }
.ln__drop > svg { color: var(--theme-accent); flex-shrink: 0; }
.ln__drop > span { flex: 1; min-width: 0; }
.ln__drop.is-over { border-color: var(--theme-accent); background: color-mix(in srgb, var(--theme-accent) 8%, var(--theme-input)); }

.ln__items { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.ln__item { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); }
.ln__thumb { display: grid; place-items: center; width: 56px; height: 56px; flex-shrink: 0; overflow: hidden; border-radius: 8px; background: #fff; color: var(--theme-text-muted); }
.ln__thumb img { width: 100%; height: 100%; object-fit: contain; }
.ln__fields { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.ln__field { display: flex; flex-direction: column; gap: 3px; flex: 1 1 120px; min-width: 0; font-size: 11.5px; color: var(--theme-text-muted); }
.ln__field--name { flex-basis: 160px; }
.ln__field--wide { flex: 2 1 220px; }
.ln__category { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--theme-text-secondary); flex-wrap: wrap; }
.ln__category select { width: auto; min-width: 140px; }
.ln__category small { color: var(--theme-text-muted); font-size: 12px; }

.ln__tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.ln__tile { display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); }
.ln__tile.is-on { border-color: color-mix(in srgb, var(--theme-accent) 55%, transparent); background: linear-gradient(150deg, color-mix(in srgb, var(--theme-accent) 9%, var(--theme-panel)), var(--theme-panel) 70%); }
.ln__tile-head { display: flex; align-items: center; gap: 10px; padding: 0; border: 0; background: none; color: var(--theme-text); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
.ln__icon { display: grid; place-items: center; width: 38px; height: 38px; flex-shrink: 0; border: 1px solid color-mix(in srgb, var(--theme-accent) 22%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--theme-accent) 14%, var(--theme-panel)); color: var(--theme-accent); }
.ln__check { display: grid; place-items: center; width: 16px; height: 16px; margin-left: auto; flex-shrink: 0; border: 1.5px solid var(--theme-border-control); border-radius: 4px; }
.ln__check.is-on { border-color: var(--theme-accent); background: var(--theme-accent); color: var(--theme-on-accent); }
.ln__tile-desc { font-size: 12px; color: var(--theme-text-muted); }
.ln__engine-note { font-size: 11.5px; color: var(--theme-text-muted); }
.ln__engine .vg-seg__btn { height: 28px; padding: 0 10px; font-size: 12px; }
.ln__tile-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; font-size: 12px; color: var(--theme-text-secondary); }
.ln__tile-foot > b { font-size: 13px; color: var(--theme-text); }
.ln__stepper { display: inline-flex; align-items: center; height: 30px; overflow: hidden; border: 1px solid var(--theme-border-control); border-radius: 8px; }
.ln__stepper button { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; background: var(--theme-control); color: var(--theme-text-secondary); cursor: pointer; }
.ln__stepper button:disabled { opacity: .4; cursor: default; }
.ln__stepper b { min-width: 44px; text-align: center; font-size: 13px; color: var(--theme-text); font-variant-numeric: tabular-nums; }

.ln__markets { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.ln__market { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel); color: var(--theme-text); font: inherit; text-align: left; cursor: pointer; }
.ln__market.is-on { border-color: color-mix(in srgb, var(--theme-accent) 55%, transparent); background: color-mix(in srgb, var(--theme-accent) 8%, var(--theme-panel)); }
.ln__cc { display: grid; place-items: center; width: 30px; height: 30px; flex-shrink: 0; border-radius: 8px; background: var(--theme-panel-soft); color: var(--theme-text-secondary); font-size: 11px; font-weight: 700; letter-spacing: .04em; }
.ln__market.is-on .ln__cc { background: var(--theme-accent-soft); color: var(--theme-control-selected-text); }
.ln__market-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ln__market-text b { font-size: 13.5px; }
.ln__market-text small { font-size: 11.5px; color: var(--theme-text-muted); }

.ln__modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; }
.ln__mode { display: flex; flex-direction: column; gap: 6px; padding: 14px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); font-size: 12px; color: var(--theme-text-muted); }
.ln__mode > span:last-child { padding-left: 24px; }
.ln__mode-head { display: flex; align-items: center; gap: 8px; color: var(--theme-text); font-size: 14px; }
.ln__mode.is-on { border-color: var(--theme-accent); background: color-mix(in srgb, var(--theme-accent) 8%, var(--theme-panel)); box-shadow: inset 0 0 0 1px var(--theme-accent); }
.ln__mode.is-off { opacity: .55; }
.ln__radio { width: 16px; height: 16px; flex-shrink: 0; box-sizing: border-box; border: 1.5px solid var(--theme-border-control); border-radius: 50%; }
.ln__mode.is-on .ln__radio { border: 5px solid var(--theme-accent); }

.ln__summary { gap: 4px; }
.ln__summary h2 { margin-bottom: 6px; }
.ln__row { display: flex; justify-content: space-between; align-items: baseline; padding: 9px 0; border-bottom: 1px solid var(--theme-divider); font-size: 13px; color: var(--theme-text-secondary); }
.ln__row b { font-size: 15px; color: var(--theme-text); font-variant-numeric: tabular-nums; }
.ln__estimate { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--theme-accent) 35%, transparent); border-radius: 10px; background: linear-gradient(150deg, color-mix(in srgb, var(--theme-accent) 10%, var(--theme-panel)), var(--theme-panel)); }
.ln__estimate span, .ln__estimate small { font-size: 12px; color: var(--theme-text-muted); }
.ln__estimate b { font-size: 22px; font-weight: 700; color: var(--theme-control-selected-text); font-variant-numeric: tabular-nums; }
.ln__estimate.is-short { border-color: color-mix(in srgb, var(--theme-warning-text) 45%, transparent); }
.ln__estimate.is-short small { color: var(--theme-warning-text); }
.ln__cost { display: flex; gap: 6px; align-items: flex-start; margin: 8px 0; font-size: 12px; line-height: 1.5; color: var(--theme-text-muted); }
.ln__cost svg { flex-shrink: 0; margin-top: 2px; }
.ln__foot { margin-top: 6px; text-align: center; font-size: 11.5px; color: var(--theme-text-muted); }
.ln__how { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; font-size: 12.5px; color: var(--theme-text-secondary); }
.ln__how li { display: flex; align-items: center; gap: 8px; }

@media (max-width: 900px) { .ln__side { position: static; max-width: none; } }
</style>
