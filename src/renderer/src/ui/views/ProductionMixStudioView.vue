<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bot,
  Check,
  Clapperboard,
  FileVideo,
  FolderOpen,
  Layers,
  Loader,
  Repeat,
  Rocket,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-vue-next'
import type { MixPoolOverview } from '../../../../shared/mixPool'
import type { MixLedgerEntry } from '../../../../shared/mixInsights'
import {
  MIX_VOICES,
  estimateSpeechSec,
  type MixDraft,
  type MixFormula,
  type MixJobInput,
  type MixLanguage,
  type MixMode,
  type MixPreviewResult,
} from '../../../../shared/mixFormula'

type Product = { id: string; name: string }
type Template = { id: string; name: string }

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const LANGUAGES: MixLanguage[] = ['vi-VN', 'zh-CN', 'en-US', 'th-TH', 'id-ID']

/** Starter lines for auto mode; the seller edits them. `{product}` → product name. */
const STARTER_LINES: Record<'vi-VN' | 'zh-CN' | 'en-US', { hooks: string[]; bodies: string[]; ctas: string[] }> = {
  'vi-VN': {
    hooks: [
      'Đừng mua {product} khi chưa xem video này!',
      'Ai cũng hỏi mình mua {product} ở đâu',
      'Giá này mà chất lượng thế này thì quá hời',
      'Mình đã tìm được {product} ưng nhất từ trước tới giờ',
    ],
    bodies: ['Nhìn cận cảnh mới thấy chi tiết làm rất kỹ.', 'Dùng hằng ngày mà vẫn rất bền đẹp.', 'Thiết kế đơn giản nhưng nhìn rất sang.', 'Phối đồ kiểu gì cũng hợp.'],
    ctas: ['Bấm vào giỏ hàng màu vàng để lấy ngay nhé!', 'Bấm giỏ hàng vàng bên dưới trước khi hết hàng nha!'],
  },
  'zh-CN': {
    hooks: ['别再乱买{product}了，先看这个！', '被问了无数次的{product}，今天说清楚', '这个价格能买到这种质感？', '姐妹们，这个{product}真的绝了'],
    bodies: ['近看细节做工非常细致。', '日常用了很久依然很新。', '简约设计但很显高级。', '怎么搭配都好看。'],
    ctas: ['喜欢的直接点左下角小黄车！', '库存不多，点小黄车带走吧！'],
  },
  'en-US': {
    hooks: [
      "Don't buy another {product} until you see this",
      'Everyone keeps asking where I got this {product}',
      "I can't believe this {product} is this good",
      'This is your sign to get the {product}',
    ],
    bodies: ['Look how clean the details are up close.', 'I use it every day and it still looks new.', 'Simple design but it looks so expensive.', 'Goes with literally everything.'],
    ctas: ['Tap the orange cart to grab yours!', 'Get it from the cart below before it sells out!'],
  },
}

const products = ref<Product[]>([])
const templates = ref<Template[]>([])
const formulas = ref<MixFormula[]>([])
const pool = ref<MixPoolOverview | null>(null)
const drafts = ref<MixDraft[]>([])
const previewWarnings = ref<string[]>([])
const scriptModel = ref('')
const busy = ref<'' | 'preview' | 'enqueue' | 'reference'>('')
const notice = ref<{ tone: 'accent' | 'danger'; text: string } | null>(null)
const referenceName = ref('')
const learned = ref<MixPreviewResult['learned'] | null>(null)
/** Winner remake: a ledger entry (S/A video) whose formula, opener and hook idea are reused. */
const winner = ref<MixLedgerEntry | null>(null)

const form = reactive({
  productId: '',
  mode: 'ai' as MixMode,
  formulaIds: [] as string[],
  count: 6,
  language: 'vi-VN' as MixLanguage,
  voice: MIX_VOICES['vi-VN'][0]!.id,
  templateId: '',
  outDir: '',
  keepOriginalAudio: false,
  allowAiClips: true,
  sellingPoints: '',
  useInsights: true,
  hookText: '',
  bodyText: '',
  ctaText: '',
})

const voices = computed(() => MIX_VOICES[form.language])
const poolStats = computed(() => pool.value?.stats)
const poolReady = computed(() => (poolStats.value?.taggedCount ?? 0) >= 3)
const selectedFormulas = computed(() => formulas.value.filter((f) => form.formulaIds.includes(f.id)))
const totalShots = computed(() => drafts.value.reduce((a, d) => a + d.shots.length, 0))

function fileUrl(filePath: string) {
  return `vg://file?path=${encodeURIComponent(filePath)}`
}
function roleLabel(role: string) {
  const key = `production.pool.roles.${role}`
  const v = t(key)
  return v === key ? role : v
}
function lines(text: string) {
  return text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
}
function speechSec(d: MixDraft) {
  return estimateSpeechSec(d.voiceover, form.language)
}
function flash(text: string, tone: 'accent' | 'danger' = 'accent') {
  notice.value = { tone, text }
}

function fillStarterLines(lang: MixLanguage) {
  const s = STARTER_LINES[lang as keyof typeof STARTER_LINES] ?? STARTER_LINES['en-US']
  form.hookText = s.hooks.join('\n')
  form.bodyText = s.bodies.join('\n')
  form.ctaText = s.ctas.join('\n')
}

function toggleFormula(id: string) {
  const i = form.formulaIds.indexOf(id)
  if (i >= 0) form.formulaIds.splice(i, 1)
  else form.formulaIds.push(id)
}

function buildInput(): MixJobInput {
  return {
    productId: form.productId,
    mode: form.mode,
    formulaIds: [...form.formulaIds],
    count: Math.max(1, Math.min(50, Math.floor(Number(form.count) || 1))),
    language: form.language,
    voice: form.voice,
    templateId: form.templateId || undefined,
    outDir: form.outDir.trim(),
    keepOriginalAudio: form.keepOriginalAudio,
    allowAiClips: form.allowAiClips,
    sellingPoints: form.sellingPoints,
    useInsights: form.useInsights,
    winnerOf: winner.value?.id,
    hookLines: lines(form.hookText),
    bodyLines: lines(form.bodyText),
    ctaLines: lines(form.ctaText),
  }
}

async function loadPool() {
  pool.value = form.productId ? await window.api.mixPool.overview(form.productId) : null
}

async function loadFormulas() {
  formulas.value = await window.api.mixStudio.listFormulas()
  form.formulaIds = form.formulaIds.filter((id) => formulas.value.some((f) => f.id === id))
  if (!form.formulaIds.length) form.formulaIds = formulas.value.filter((f) => f.source === 'builtin').slice(0, 3).map((f) => f.id)
}

async function extractFromReference() {
  busy.value = 'reference'
  notice.value = null
  try {
    const f = await window.api.mixStudio.formulaFromReference({ name: referenceName.value.trim() || undefined })
    if (!f) return
    referenceName.value = ''
    await loadFormulas()
    if (!form.formulaIds.includes(f.id)) form.formulaIds.unshift(f.id)
    flash(t('production.mix.formula.extracted', { name: f.name, count: f.beats.length }))
  } catch (e: any) {
    flash(String(e?.message ?? e), 'danger')
  } finally {
    busy.value = ''
  }
}

async function removeFormula(f: MixFormula) {
  if (!window.confirm(t('production.mix.formula.removeConfirm', { name: f.name }))) return
  await window.api.mixStudio.removeFormula(f.id)
  await loadFormulas()
}

async function generate() {
  notice.value = null
  if (!form.productId) return flash(t('production.mix.validation.product'), 'danger')
  if (!form.formulaIds.length && !winner.value) return flash(t('production.mix.validation.formula'), 'danger')
  busy.value = 'preview'
  try {
    const res = await window.api.mixStudio.preview(buildInput())
    drafts.value = res.drafts
    previewWarnings.value = res.warnings
    scriptModel.value = res.scriptModel ?? ''
    learned.value = res.learned ?? null
  } catch (e: any) {
    flash(String(e?.message ?? e), 'danger')
  } finally {
    busy.value = ''
  }
}

function clearWinner() {
  winner.value = null
  if (route.query.winner) void router.replace({ query: { ...route.query, winner: undefined } })
}

async function loadWinner(id: string, productId: string) {
  const list = await window.api.mixStudio.ledger(productId)
  const e = list.find((x) => x.id === id) ?? null
  winner.value = e
  if (e) {
    form.mode = 'ai'
    form.language = (e.language as MixLanguage) || form.language
    form.count = Math.min(form.count, 6)
  }
}

function removeDraft(id: string) {
  drafts.value = drafts.value.filter((d) => d.id !== id)
}

async function pickOutDir() {
  const dir = await window.api.pickDir({ title: t('production.create.pickOutputDir') })
  if (dir) form.outDir = dir
}

async function renderAll() {
  notice.value = null
  if (!form.outDir.trim()) return flash(t('production.mix.validation.outDir'), 'danger')
  busy.value = 'enqueue'
  try {
    // Plain clones: the drafts are reactive proxies and IPC needs structured-cloneable data.
    const payload = JSON.parse(JSON.stringify({ input: buildInput(), drafts: drafts.value }))
    const res = await window.api.mixStudio.enqueue(payload)
    if (!res.enqueued) return flash(t('production.mix.enqueueNone', { skipped: res.skipped }), 'danger')
    void router.push('/production/tasks')
  } catch (e: any) {
    flash(String(e?.message ?? e), 'danger')
  } finally {
    busy.value = ''
  }
}

watch(
  () => form.language,
  (lang) => {
    if (!voices.value.some((v) => v.id === form.voice)) form.voice = MIX_VOICES[lang][0]!.id
    fillStarterLines(lang)
  },
)
watch(
  () => form.productId,
  async (id) => {
    drafts.value = []
    if (winner.value && winner.value.productId !== id) clearWinner()
    await loadPool()
  },
)

onMounted(async () => {
  fillStarterLines(form.language)
  const [p, tpl] = await Promise.all([window.api.products.list(), window.api.templates.list(), loadFormulas()])
  products.value = (p as Product[]) ?? []
  templates.value = (tpl as Template[]) ?? []
  const wanted = String(route.query.productId || '')
  form.productId = products.value.find((x) => x.id === wanted)?.id ?? products.value[0]?.id ?? ''
  const winnerId = String(route.query.winner || '')
  if (winnerId && form.productId) await loadWinner(winnerId, form.productId)
  try {
    const paths = await window.api.getPaths()
    const base = String((paths as any)?.dataDir ?? '').replace(/[\\/]+$/, '')
    if (base) form.outDir = `${base}${base.includes('\\') ? '\\' : '/'}exports`
  } catch {
    /* user picks a folder */
  }
})
</script>

<template>
  <div class="vg-scope vg-page mix">
    <header class="vg-page-head">
      <button class="vg-icon-btn" type="button" :title="t('production.mix.back')" @click="router.push('/production')">
        <ArrowLeft :size="18" />
      </button>
      <div class="vg-page-head__text">
        <h1>{{ t('production.mix.title') }}</h1>
        <p>{{ t('production.mix.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button class="vg-btn vg-btn--ghost" type="button" @click="router.push('/production/create')">{{ t('production.mix.legacy') }}</button>
        <button class="vg-btn" type="button" @click="router.push({ path: '/production/mix/insights', query: { productId: form.productId } })">
          <BarChart3 :size="15" /> {{ t('production.mixInsights.title') }}
        </button>
        <button class="vg-btn" type="button" @click="router.push({ path: '/production/pool', query: { productId: form.productId } })">
          <Layers :size="15" /> {{ t('production.home.entries.pool.title') }}
        </button>
      </div>
    </header>

    <div v-if="winner" class="vg-notice vg-notice--accent mix__notice">
      <Repeat :size="16" />
      <span>
        <strong>{{ t('production.mix.winner.title') }}</strong>
        「{{ winner.title }}」<template v-if="winner.performance"> · {{ winner.performance.grade }}</template> · {{ winner.formulaName }} — {{ t('production.mix.winner.desc') }}
      </span>
      <button class="vg-btn vg-btn--sm" type="button" @click="clearWinner">{{ t('production.mix.winner.cancel') }}</button>
    </div>

    <!-- 1. Mode + product -->
    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><Clapperboard :size="16" /> {{ t('production.mix.step1') }}</span>
      </div>
      <div class="mix__modes">
        <button class="mix-mode" :class="{ 'is-active': form.mode === 'ai' }" type="button" @click="form.mode = 'ai'">
          <span class="mix-mode__icon"><Bot :size="18" /></span>
          <span><strong>{{ t('production.mix.mode.ai') }}</strong><small>{{ t('production.mix.mode.aiDesc') }}</small></span>
          <Check v-if="form.mode === 'ai'" :size="16" class="mix-mode__check" />
        </button>
        <button class="mix-mode" :class="{ 'is-active': form.mode === 'auto' }" type="button" @click="form.mode = 'auto'">
          <span class="mix-mode__icon"><Wand2 :size="18" /></span>
          <span><strong>{{ t('production.mix.mode.auto') }}</strong><small>{{ t('production.mix.mode.autoDesc') }}</small></span>
          <Check v-if="form.mode === 'auto'" :size="16" class="mix-mode__check" />
        </button>
      </div>
      <div class="vg-form-grid mix__grid">
        <div class="vg-field">
          <label for="mx-product">{{ t('production.create.product') }}<span class="vg-req">*</span></label>
          <select id="mx-product" v-model="form.productId" class="vg-select">
            <option v-for="item in products" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
          <span v-if="poolStats" class="vg-field__hint">
            {{ t('production.mix.poolLine', { clips: poolStats.clipCount, tagged: poolStats.taggedCount, real: poolStats.realCount, ai: poolStats.aiCount }) }}
          </span>
        </div>
        <div class="vg-field">
          <label for="mx-count">{{ t('production.create.quantity') }}</label>
          <input id="mx-count" v-model.number="form.count" class="vg-input" type="number" min="1" max="50" />
        </div>
        <div class="vg-field">
          <label for="mx-lang">{{ t('production.mix.language') }}</label>
          <select id="mx-lang" v-model="form.language" class="vg-select">
            <option v-for="l in LANGUAGES" :key="l" :value="l">{{ t(`production.mix.languages.${l}`) }}</option>
          </select>
        </div>
        <div class="vg-field">
          <label for="mx-voice">{{ t('production.mix.voice') }}</label>
          <select id="mx-voice" v-model="form.voice" class="vg-select">
            <option v-for="v in voices" :key="v.id" :value="v.id">{{ v.label }}</option>
          </select>
        </div>
      </div>
      <div v-if="!poolReady" class="vg-notice vg-notice--warning mix__notice">
        <AlertTriangle :size="16" />
        <span>{{ t('production.mix.poolEmpty') }}</span>
        <button class="vg-btn vg-btn--sm" type="button" @click="router.push({ path: '/production/pool', query: { productId: form.productId } })">
          {{ t('production.mix.goPool') }}
        </button>
      </div>
      <div v-else-if="poolStats?.missingRoles?.length" class="vg-notice vg-notice--warning mix__notice">
        <AlertTriangle :size="16" />
        <span>{{ t('production.pool.missing.title') }} {{ poolStats.missingRoles.map(roleLabel).join('、') }}</span>
      </div>
    </section>

    <!-- 2. Formulas -->
    <section class="vg-card" :class="{ 'mix__locked': winner }">
      <div class="vg-card__head">
        <span class="vg-card__title"><Sparkles :size="16" /> {{ t('production.mix.step2') }} <small>{{ t('production.mix.formula.hint') }}</small></span>
        <div class="vg-row">
          <input v-model="referenceName" class="vg-input vg-input--sm mix__refname" :placeholder="t('production.mix.formula.namePlaceholder')" />
          <button class="vg-btn vg-btn--sm" type="button" :disabled="busy !== ''" @click="extractFromReference">
            <Loader v-if="busy === 'reference'" :size="14" class="vg-spin" /><FileVideo v-else :size="14" />
            {{ busy === 'reference' ? t('production.mix.formula.extracting') : t('production.mix.formula.fromReference') }}
          </button>
        </div>
      </div>
      <div class="mix__formulas">
        <article
          v-for="f in formulas"
          :key="f.id"
          class="mix-formula"
          :class="{ 'is-active': form.formulaIds.includes(f.id) }"
          role="checkbox"
          :aria-checked="form.formulaIds.includes(f.id)"
          tabindex="0"
          @click="toggleFormula(f.id)"
          @keydown.enter.prevent="toggleFormula(f.id)"
          @keydown.space.prevent="toggleFormula(f.id)"
        >
          <div class="vg-row mix-formula__head">
            <strong>{{ f.name }}</strong>
            <span class="vg-pill" :class="f.source === 'reference' ? 'vg-pill--violet' : f.source === 'custom' ? 'vg-pill--blue' : ''">
              {{ t(`production.mix.formula.source.${f.source}`) }}
            </span>
            <span class="vg-toolbar__spacer" />
            <button
              v-if="f.source !== 'builtin'"
              class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger"
              type="button"
              :title="t('production.mix.formula.remove')"
              @click.stop="removeFormula(f)"
            >
              <Trash2 :size="13" />
            </button>
            <Check v-if="form.formulaIds.includes(f.id)" :size="16" class="mix-formula__check" />
          </div>
          <p class="mix-formula__desc">{{ f.description }}</p>
          <div class="mix-formula__beats">
            <span v-for="(b, i) in f.beats" :key="i" class="vg-chip" :class="{ 'is-optional': b.optional }">{{ roleLabel(b.role) }}</span>
          </div>
        </article>
      </div>
    </section>

    <!-- 3. Script + output -->
    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><Wand2 :size="16" /> {{ t('production.mix.step3') }}</span>
      </div>
      <div v-if="form.mode === 'ai'" class="vg-field">
        <label for="mx-sp">{{ t('production.mix.sellingPoints') }}</label>
        <textarea id="mx-sp" v-model="form.sellingPoints" class="vg-textarea" rows="3" :placeholder="t('production.mix.sellingPointsPlaceholder')" />
        <span class="vg-field__hint">{{ t('production.mix.sellingPointsHint') }}</span>
      </div>
      <div v-else class="vg-form-grid vg-form-grid--3">
        <div class="vg-field">
          <label for="mx-hooks">{{ t('production.mix.lines.hook') }}</label>
          <textarea id="mx-hooks" v-model="form.hookText" class="vg-textarea" rows="5" />
        </div>
        <div class="vg-field">
          <label for="mx-bodies">{{ t('production.mix.lines.body') }}</label>
          <textarea id="mx-bodies" v-model="form.bodyText" class="vg-textarea" rows="5" />
        </div>
        <div class="vg-field">
          <label for="mx-ctas">{{ t('production.mix.lines.cta') }}</label>
          <textarea id="mx-ctas" v-model="form.ctaText" class="vg-textarea" rows="5" />
        </div>
        <span class="vg-field__hint span-all">{{ t('production.mix.lines.hint') }}</span>
      </div>
      <div class="vg-form-grid mix__grid mix__grid--output">
        <div class="vg-field">
          <label for="mx-tpl">{{ t('production.mix.template') }}</label>
          <select id="mx-tpl" v-model="form.templateId" class="vg-select">
            <option value="">{{ t('production.mix.templateNone') }}</option>
            <option v-for="item in templates" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </div>
        <div class="vg-field mix__outdir">
          <label for="mx-out">{{ t('production.create.outputDir') }}<span class="vg-req">*</span></label>
          <div class="vg-row">
            <input id="mx-out" v-model="form.outDir" class="vg-input" />
            <button class="vg-btn" type="button" @click="pickOutDir"><FolderOpen :size="15" /></button>
          </div>
        </div>
        <label class="vg-row mix__check"><input v-model="form.keepOriginalAudio" type="checkbox" /> {{ t('production.mix.keepOriginalAudio') }}</label>
        <label class="vg-row mix__check"><input v-model="form.allowAiClips" type="checkbox" /> {{ t('production.mix.allowAiClips') }}</label>
        <label class="vg-row mix__check"><input v-model="form.useInsights" type="checkbox" /> {{ t('production.mix.useInsights') }}</label>
      </div>
      <div class="vg-row mix__go">
        <span class="vg-muted">{{ t('production.mix.summary', { count: form.count, formulas: selectedFormulas.length }) }}</span>
        <span class="vg-toolbar__spacer" />
        <button class="vg-btn vg-btn--primary vg-btn--lg" type="button" :disabled="busy !== '' || !poolReady" @click="generate">
          <Loader v-if="busy === 'preview'" :size="16" class="vg-spin" /><Sparkles v-else :size="16" />
          {{ busy === 'preview' ? t('production.mix.generating') : t('production.mix.generate') }}
        </button>
      </div>
      <div v-if="notice" class="vg-notice" :class="`vg-notice--${notice.tone}`">{{ notice.text }}</div>
    </section>

    <!-- 4. Drafts -->
    <section v-if="drafts.length" class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title">
          <Rocket :size="16" /> {{ t('production.mix.draftsTitle', { count: drafts.length }) }}
          <small>{{ t('production.mix.draftsDesc', { shots: totalShots }) }}<template v-if="scriptModel"> · {{ scriptModel }}</template></small>
        </span>
        <button class="vg-btn vg-btn--primary" type="button" :disabled="busy !== ''" @click="renderAll">
          <Loader v-if="busy === 'enqueue'" :size="15" class="vg-spin" /><Rocket v-else :size="15" />
          {{ t('production.mix.renderAll', { count: drafts.length }) }}
        </button>
      </div>
      <div v-if="learned" class="vg-notice vg-notice--accent mix__notice">
        <BarChart3 :size="16" />
        <span>
          {{ t('production.mix.learned', { measured: learned.measured, winners: learned.winnerRefs }) }}
          {{ learned.formulaShares.map((f) => `${f.formulaName} ×${f.count}`).join('，') }}
        </span>
      </div>
      <div v-if="previewWarnings.length" class="vg-notice vg-notice--warning mix__notice">
        <AlertTriangle :size="16" /><span>{{ previewWarnings.join('；') }}</span>
      </div>
      <div class="mix__drafts">
        <article v-for="(d, idx) in drafts" :key="d.id" class="mix-draft">
          <div class="vg-row mix-draft__head">
            <strong class="vg-num">#{{ idx + 1 }}</strong>
            <span class="vg-pill vg-pill--accent">{{ d.formulaName }}</span>
            <span class="vg-pill vg-num">{{ d.totalDurationSec.toFixed(1) }}s</span>
            <span v-if="d.scriptSource === 'ai'" class="vg-pill vg-pill--violet">AI</span>
            <span v-if="d.hookStyle && d.scriptSource === 'ai'" class="vg-muted mix-draft__style vg-ellipsis" :title="d.hookStyle">{{ d.hookStyle }}</span>
            <span class="vg-toolbar__spacer" />
            <button class="vg-icon-btn vg-icon-btn--sm" type="button" :title="t('production.mix.removeDraft')" @click="removeDraft(d.id)"><X :size="14" /></button>
          </div>
          <div class="mix-draft__strip">
            <figure v-for="(s, i) in d.shots" :key="i" class="mix-shot" :title="s.description">
              <img :src="fileUrl(s.thumbnailPath)" alt="" loading="lazy" />
              <figcaption>
                <span>{{ roleLabel(s.role) }}</span>
                <span class="vg-num">{{ s.durationSec.toFixed(1) }}s</span>
              </figcaption>
              <span v-if="s.origin === 'ai'" class="mix-shot__ai">AI</span>
            </figure>
          </div>
          <div class="vg-field">
            <label :for="`mx-title-${d.id}`">{{ t('production.mix.draftTitle') }}</label>
            <input :id="`mx-title-${d.id}`" v-model="d.title" class="vg-input" />
          </div>
          <div class="vg-field">
            <label :for="`mx-vo-${d.id}`">
              {{ t('production.mix.voiceover') }}
              <small class="vg-muted vg-num">≈ {{ speechSec(d).toFixed(1) }}s</small>
            </label>
            <textarea :id="`mx-vo-${d.id}`" v-model="d.voiceover" class="vg-textarea" rows="3" />
          </div>
          <p v-if="d.warnings.length" class="mix-draft__warn">{{ d.warnings.join('；') }}</p>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mix { width: min(1408px, 100%); margin: 0 auto; }
.mix__modes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.mix-mode { position: relative; display: flex; align-items: center; gap: 12px; padding: 14px; text-align: left; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); color: var(--theme-text); cursor: pointer; }
.mix-mode span:last-of-type { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.mix-mode small { font-size: 12px; color: var(--theme-text-muted); }
.mix-mode.is-active { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); }
.mix-mode__icon { width: 38px; height: 38px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); }
.mix-mode__check { position: absolute; top: 10px; right: 10px; color: var(--vg-accent); }
.mix__grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.mix__grid--output { margin-top: 12px; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); align-items: end; }
.mix__outdir .vg-row { flex-wrap: nowrap; }
.mix__outdir .vg-input { flex: 1; }
.mix__check { font-size: 13px; color: var(--theme-text-secondary); gap: 6px; cursor: pointer; }
.mix__notice { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.mix__notice span { flex: 1; }
.mix__refname { width: 180px; }
.mix__locked { opacity: 0.5; pointer-events: none; }
.mix__formulas { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.mix-formula { display: flex; flex-direction: column; gap: 6px; padding: 12px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); cursor: pointer; outline: none; }
.mix-formula:focus-visible { box-shadow: 0 0 0 2px var(--vg-accent-line); }
.mix-formula.is-active { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); }
.mix-formula__head { gap: 6px; flex-wrap: nowrap; }
.mix-formula__head strong { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mix-formula__check { color: var(--vg-accent); flex-shrink: 0; }
.mix-formula__desc { margin: 0; font-size: 12px; line-height: 1.5; color: var(--theme-text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.mix-formula__beats { display: flex; flex-wrap: wrap; gap: 4px; }
.mix-formula__beats .vg-chip { font-size: 11px; }
.mix-formula__beats .is-optional { opacity: 0.6; border-style: dashed; }
.mix__go { margin-top: 14px; }
.mix__drafts { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 12px; }
.mix-draft { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); min-width: 0; }
.mix-draft__head { gap: 6px; flex-wrap: nowrap; }
.mix-draft__style { font-size: 11px; min-width: 0; }
.mix-draft__strip { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.mix-shot { position: relative; margin: 0; flex: 0 0 64px; }
.mix-shot img { width: 64px; height: 114px; object-fit: cover; border-radius: 6px; border: 1px solid var(--theme-border); display: block; background: var(--theme-panel-soft); }
.mix-shot figcaption { display: flex; flex-direction: column; font-size: 10px; line-height: 1.3; color: var(--theme-text-muted); margin-top: 3px; }
.mix-shot figcaption span:first-child { color: var(--theme-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mix-shot__ai { position: absolute; top: 4px; left: 4px; padding: 0 4px; border-radius: 4px; font-size: 9px; font-weight: 700; background: var(--theme-solid-blue); color: #fff; }
.mix-draft__warn { margin: 0; font-size: 12px; color: var(--vg-amber); }
@media (max-width: 1100px) {
  .mix__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mix__grid--output { grid-template-columns: 1fr; }
  .mix__drafts { grid-template-columns: 1fr; }
}
</style>
