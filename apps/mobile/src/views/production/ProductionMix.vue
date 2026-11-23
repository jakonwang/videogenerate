<script setup lang="ts">
import { isWeb } from '@/lib/platform'
/**
 * AI 混剪工作台（网页版，对应电脑端 ProductionMixStudioView）。
 * 方案在网页上用和电脑端同一套逻辑生成；成片交给电脑（完整：配音、字幕、包装模板）或云端（简版）。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, BarChart3, Bot, Check, Clapperboard, Cloud, Layers, Loader, Monitor, Repeat, Rocket, Sparkles, Wand2, X } from 'lucide-vue-next'
import type { MixLedgerEntry } from '@shared/mixInsights'
import { MIX_VOICES, estimateSpeechSec, type MixDraft, type MixLanguage } from '@shared/mixFormula'
import CloudImage from '@/components/CloudImage.vue'
import PageHeader from '@/components/PageHeader.vue'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'
import { useTemplates } from '@/lib/templates'
import {
  FORMULA_SOURCE_LABEL,
  LANGUAGE_LABEL,
  ROLE_LABEL,
  WEB_MAX_COUNT,
  cloudReady,
  previewDrafts,
  submitOrder,
  useDesktopOnline,
  useFormulas,
  usePool,
  useProductOptions,
} from '@/lib/production'

const route = useRoute()
const router = useRouter()
const products = useProductOptions()
const formulas = useFormulas()
const templates = useTemplates()
const { online } = useDesktopOnline()
const LANGUAGES = Object.keys(MIX_VOICES) as MixLanguage[]

const STORE_KEY = 'production.mix.form'
const saved = (() => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
})()
const form = reactive({
  productId: typeof route.query.productId === 'string' ? route.query.productId : '',
  mode: (saved.mode === 'auto' ? 'auto' : 'ai') as 'ai' | 'auto',
  count: Number(saved.count) || 6,
  language: (LANGUAGES.includes(saved.language) ? saved.language : 'zh-CN') as MixLanguage,
  voice: String(saved.voice || ''),
  formulaIds: (Array.isArray(saved.formulaIds) && saved.formulaIds.length ? saved.formulaIds : ['builtin:problem_solution', 'builtin:result_first']) as string[],
  sellingPoints: '',
  hookText: String(saved.hookText || ''),
  bodyText: String(saved.bodyText || ''),
  ctaText: String(saved.ctaText || ''),
  templateId: String(saved.templateId || ''),
  keepOriginalAudio: Boolean(saved.keepOriginalAudio),
  allowAiClips: saved.allowAiClips !== false,
})
watch(form, (value) => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...value, productId: undefined, sellingPoints: undefined })) } catch { /* private mode */ }
}, { deep: true })
watch(products, (list) => { if (!form.productId && list.length) form.productId = list[0]!.id }, { immediate: true })
const voices = computed(() => MIX_VOICES[form.language])
watch(() => form.language, () => { if (!voices.value.some((v) => v.id === form.voice)) form.voice = voices.value[0]!.id }, { immediate: true })

const productIdRef = computed(() => form.productId)
const pool = usePool(productIdRef)
const stats = computed(() => pool.value.stats)
const poolReady = computed(() => stats.value.taggedCount >= 3)
const product = computed(() => products.value.find((p) => p.id === form.productId) ?? null)
const selectedFormulas = computed(() => formulas.value.filter((f) => form.formulaIds.includes(f.id)))
const template = computed(() => templates.value.find((t) => t.id === form.templateId) ?? null)

/* 复刻爆款：从「混剪数据洞察」带过来的成片（台账在电脑上，经电脑代办读取） */
const winner = ref<MixLedgerEntry | null>(null)
async function loadWinner() {
  const id = String(route.query.winner || '')
  if (!id || !form.productId) return
  try {
    const entries = (await window.api.mixStudio.ledger(form.productId)) as MixLedgerEntry[]
    winner.value = entries.find((entry) => entry.id === id) ?? null
    if (!winner.value) notice.value = { tone: 'danger', text: '找不到要复刻的爆款视频记录' }
  } catch (error) {
    notice.value = { tone: 'danger', text: `读取爆款记录失败：${errorMessage(error)}` }
  }
}
function clearWinner() {
  winner.value = null
  if (route.query.winner) void router.replace({ query: { ...route.query, winner: undefined } })
}
watch(() => [route.query.winner, form.productId], () => void loadWinner())
onMounted(() => void loadWinner())

function toggleFormula(id: string) {
  form.formulaIds = form.formulaIds.includes(id) ? form.formulaIds.filter((x) => x !== id) : [...form.formulaIds, id]
}

const busy = ref<'' | 'preview' | 'desktop' | 'cloud'>('')
const drafts = ref<MixDraft[]>([])
const previewWarnings = ref<string[]>([])
const scriptModel = ref<string>()
const notice = ref<{ tone: 'danger' | 'accent'; text: string } | null>(null)
const totalShots = computed(() => drafts.value.reduce((sum, d) => sum + d.shots.length, 0))
const cloudCount = computed(() => drafts.value.filter(cloudReady).length)
const lines = (text: string) => text.split('\n').map((x) => x.trim()).filter(Boolean)
const orderInput = () => ({
  mode: form.mode,
  formulaIds: form.formulaIds,
  count: Math.max(1, Math.min(WEB_MAX_COUNT, Math.floor(form.count) || 1)),
  language: form.language,
  voice: form.voice,
  templateId: form.templateId || undefined,
  keepOriginalAudio: form.keepOriginalAudio,
  allowAiClips: form.allowAiClips,
  sellingPoints: form.sellingPoints.trim() || undefined,
})

async function generate() {
  notice.value = null
  if (!product.value) return void (notice.value = { tone: 'danger', text: '请选择商品' })
  if (!form.formulaIds.length && !winner.value) return void (notice.value = { tone: 'danger', text: '请至少选择一个公式' })
  busy.value = 'preview'
  try {
    const w = winner.value
    const result = await previewDrafts(
      { ...orderInput(), hookLines: lines(form.hookText), bodyLines: lines(form.bodyText), ctaLines: lines(form.ctaText), winner: w ? { formulaId: w.formulaId, hookClipId: w.hookClipId, hookStyle: w.hookStyle, title: w.title, voiceover: w.voiceover } : undefined },
      product.value,
      pool.value,
      formulas.value,
    )
    drafts.value = result.drafts
    previewWarnings.value = result.warnings
    scriptModel.value = result.scriptModel
  } catch (error) {
    notice.value = { tone: 'danger', text: errorMessage(error) }
  } finally {
    busy.value = ''
  }
}

const speechSec = (d: MixDraft) => estimateSpeechSec(d.voiceover, form.language)
function removeDraft(id: string) {
  drafts.value = drafts.value.filter((d) => d.id !== id)
}

async function render(runner: 'desktop' | 'cloud') {
  if (!product.value || !drafts.value.length) return
  busy.value = runner
  try {
    await submitOrder({ product: product.value, orderInput: { ...orderInput(), count: drafts.value.length }, drafts: drafts.value, runner, template: template.value })
    toast(runner === 'desktop' ? (online.value ? '已交给电脑成片' : '已下单，电脑端打开后开始成片') : '云端开始成片（简版）')
    drafts.value = []
    router.push('/production/tasks')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <PageHeader title="AI 混剪工作台" :back="isWeb ? undefined : '/production'" description="按爆款公式从素材池挑选真实镜头，配上钩子标题和口播字幕，每条视频的开头、镜头和文案都不同。">
    <template #actions>
      <button class="vg-btn" type="button" @click="router.push({ path: '/production/mix/insights', query: { productId: form.productId } })"><BarChart3 :size="15" /> 混剪数据洞察</button>
      <button class="vg-btn" type="button" @click="router.push({ path: '/production/pool', query: { productId: form.productId } })"><Layers :size="15" /> 混剪素材池</button>
    </template>
  </PageHeader>
  <main class="vg-page mix" data-testid="web-mix-studio">
    <div v-if="winner" class="vg-notice vg-notice--accent mix__notice">
      <Repeat :size="16" />
      <span><strong>复刻爆款：</strong>「{{ winner.title }}」<template v-if="winner.performance"> · {{ winner.performance.grade }}</template> · {{ winner.formulaName }} — 沿用它的公式、开头镜头和钩子思路，换中段镜头和文案做变体。</span>
      <button class="vg-btn vg-btn--sm" type="button" @click="clearWinner">取消复刻</button>
    </div>
    <!-- 1. Mode + product -->
    <section class="vg-card">
      <div class="vg-card__head"><span class="vg-card__title"><Clapperboard :size="16" /> 1. 模式与商品</span></div>
      <div class="mix__modes">
        <button class="mix-mode" :class="{ 'is-active': form.mode === 'ai' }" type="button" @click="form.mode = 'ai'">
          <span class="mix-mode__icon"><Bot :size="18" /></span>
          <span><strong>AI 混剪</strong><small>AI 按镜头内容为每条视频写不同的钩子和口播</small></span>
          <Check v-if="form.mode === 'ai'" :size="16" class="mix-mode__check" />
        </button>
        <button class="mix-mode" :class="{ 'is-active': form.mode === 'auto' }" type="button" @click="form.mode = 'auto'">
          <span class="mix-mode__icon"><Wand2 :size="18" /></span>
          <span><strong>自动混剪</strong><small>不调用大模型，用你的文案池轮换组合，零成本</small></span>
          <Check v-if="form.mode === 'auto'" :size="16" class="mix-mode__check" />
        </button>
      </div>
      <div class="vg-form-grid mix__grid">
        <div class="vg-field">
          <label for="mx-product">商品<span class="vg-req">*</span></label>
          <select id="mx-product" v-model="form.productId" class="vg-select">
            <option v-for="item in products" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
          <span class="vg-field__hint">素材池：{{ stats.clipCount }} 个镜头，已识别 {{ stats.taggedCount }}，实拍 {{ stats.realCount }} / AI {{ stats.aiCount }}</span>
        </div>
        <div class="vg-field">
          <label for="mx-count">数量</label>
          <input id="mx-count" v-model.number="form.count" class="vg-input" type="number" min="1" :max="WEB_MAX_COUNT" />
        </div>
        <div class="vg-field">
          <label for="mx-lang">口播语言</label>
          <select id="mx-lang" v-model="form.language" class="vg-select">
            <option v-for="l in LANGUAGES" :key="l" :value="l">{{ LANGUAGE_LABEL[l] }}</option>
          </select>
        </div>
        <div class="vg-field">
          <label for="mx-voice">配音音色</label>
          <select id="mx-voice" v-model="form.voice" class="vg-select">
            <option v-for="v in voices" :key="v.id" :value="v.id">{{ v.label }}</option>
          </select>
        </div>
      </div>
      <div v-if="!poolReady" class="vg-notice vg-notice--warning mix__notice">
        <AlertTriangle :size="16" />
        <span>这个商品的素材池还没有足够的已识别镜头（至少 3 个）。</span>
        <button class="vg-btn vg-btn--sm" type="button" @click="router.push({ path: '/production/pool', query: { productId: form.productId } })">去素材池</button>
      </div>
      <div v-else-if="stats.missingRoles.length" class="vg-notice vg-notice--warning mix__notice">
        <AlertTriangle :size="16" />
        <span>镜头缺口： {{ stats.missingRoles.map((r) => ROLE_LABEL[r]).join('、') }}</span>
      </div>
    </section>

    <!-- 2. Formulas -->
    <section class="vg-card" :class="{ mix__locked: winner }">
      <div class="vg-card__head">
        <span class="vg-card__title"><Sparkles :size="16" /> 2. 爆款公式 <small>多选时轮流使用，一批视频覆盖多个内容角度</small></span>
        <span class="vg-muted mix__tiny">从参考视频提取公式请在电脑端操作，提取后会同步过来</span>
      </div>
      <div class="mix__formulas">
        <article v-for="f in formulas" :key="f.id" class="mix-formula" :class="{ 'is-active': form.formulaIds.includes(f.id) }" role="checkbox" :aria-checked="form.formulaIds.includes(f.id)" tabindex="0" @click="toggleFormula(f.id)" @keydown.enter.prevent="toggleFormula(f.id)" @keydown.space.prevent="toggleFormula(f.id)">
          <div class="vg-row mix-formula__head">
            <strong>{{ f.name }}</strong>
            <span class="vg-pill" :class="f.source === 'reference' ? 'vg-pill--violet' : f.source === 'custom' ? 'vg-pill--blue' : ''">{{ FORMULA_SOURCE_LABEL[f.source] }}</span>
            <span class="vg-toolbar__spacer" />
            <Check v-if="form.formulaIds.includes(f.id)" :size="16" class="mix-formula__check" />
          </div>
          <p class="mix-formula__desc">{{ f.description }}</p>
          <div class="mix-formula__beats">
            <span v-for="(b, i) in f.beats" :key="i" class="vg-chip" :class="{ 'is-optional': b.optional }">{{ ROLE_LABEL[b.role] }}</span>
          </div>
        </article>
      </div>
    </section>

    <!-- 3. Script + output -->
    <section class="vg-card">
      <div class="vg-card__head"><span class="vg-card__title"><Wand2 :size="16" /> 3. 文案与输出</span></div>
      <div v-if="form.mode === 'ai'" class="vg-field">
        <label for="mx-sp">卖点 / 价格 / 优惠 / 目标人群</label>
        <textarea id="mx-sp" v-model="form.sellingPoints" class="vg-textarea" rows="3" placeholder="例：925 银不过敏；原价 199k 今天 99k；买二送一；适合送女朋友" />
        <span class="vg-field__hint">AI 只会使用这里写明的价格和优惠，不会编造。</span>
      </div>
      <div v-else class="vg-form-grid vg-form-grid--3">
        <div class="vg-field"><label for="mx-hooks">钩子开头（每行一条）</label><textarea id="mx-hooks" v-model="form.hookText" class="vg-textarea" rows="5" /></div>
        <div class="vg-field"><label for="mx-bodies">卖点句（每行一条）</label><textarea id="mx-bodies" v-model="form.bodyText" class="vg-textarea" rows="5" /></div>
        <div class="vg-field"><label for="mx-ctas">结尾催单（每行一条）</label><textarea id="mx-ctas" v-model="form.ctaText" class="vg-textarea" rows="5" /></div>
        <span class="vg-field__hint span-all">每条视频轮换组合：1 条钩子 + 1~2 条卖点 + 1 条催单。{product} 会替换成商品名。</span>
      </div>
      <div class="vg-form-grid mix__grid mix__grid--output">
        <div class="vg-field">
          <label for="mx-tpl">包装模板（可选）</label>
          <select id="mx-tpl" v-model="form.templateId" class="vg-select">
            <option value="">不用模板（硬切 + 黄底字幕，带货默认）</option>
            <option v-for="item in templates" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </div>
        <div class="mix__checks">
          <label class="vg-row mix__check"><input v-model="form.keepOriginalAudio" type="checkbox" /> 保留镜头原声（压低在配音下）</label>
          <label class="vg-row mix__check"><input v-model="form.allowAiClips" type="checkbox" /> 实拍不够时允许用 AI 镜头</label>
        </div>
      </div>
      <div class="vg-row mix__go">
        <span class="vg-muted">将生成 {{ Math.min(form.count, WEB_MAX_COUNT) }} 条，轮流使用 {{ selectedFormulas.length }} 个公式</span>
        <span class="vg-toolbar__spacer" />
        <button class="vg-btn vg-btn--primary vg-btn--lg" type="button" :disabled="busy !== '' || !poolReady" data-testid="mix-generate" @click="generate">
          <Loader v-if="busy === 'preview'" :size="16" class="vg-spin" /><Sparkles v-else :size="16" />
          {{ busy === 'preview' ? '正在选镜头和写文案…' : '生成方案' }}
        </button>
      </div>
      <div v-if="notice" class="vg-notice" :class="`vg-notice--${notice.tone}`">{{ notice.text }}</div>
    </section>

    <!-- 4. Drafts -->
    <section v-if="drafts.length" class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title">
          <Rocket :size="16" /> 方案预览（{{ drafts.length }} 条）
          <small>共 {{ totalShots }} 个镜头，可修改标题和口播后再渲染<template v-if="scriptModel"> · {{ scriptModel }}</template></small>
        </span>
        <div class="vg-row">
          <button class="vg-btn" type="button" :disabled="busy !== '' || !cloudCount" :title="cloudCount < drafts.length ? `${drafts.length - cloudCount} 条用到的原视频太大，没有上传云端，只能在电脑上成片` : ''" @click="render('cloud')">
            <Loader v-if="busy === 'cloud'" :size="15" class="vg-spin" /><Cloud v-else :size="15" /> 云端简版成片（{{ cloudCount }} 条）
          </button>
          <button class="vg-btn vg-btn--primary" type="button" :disabled="busy !== ''" data-testid="mix-render-desktop" @click="render('desktop')">
            <Loader v-if="busy === 'desktop'" :size="15" class="vg-spin" /><Monitor v-else :size="15" /> 交给电脑全部渲染（{{ drafts.length }} 条）
          </button>
        </div>
      </div>
      <div class="vg-notice mix__notice" :class="online ? 'vg-notice--accent' : 'vg-notice--warning'">
        <Monitor :size="16" />
        <span v-if="online">电脑端在线：完整成片（配音、字幕、包装模板），完成后进作品库和审核收件箱。</span>
        <span v-else>电脑端不在线：交给电脑的单会等电脑打开再成片；急用可以选云端简版（镜头剪辑 + 标题 + 模板音乐和画面，不含配音字幕）。</span>
      </div>
      <div v-if="previewWarnings.length" class="vg-notice vg-notice--warning mix__notice"><AlertTriangle :size="16" /><span>{{ previewWarnings.join('；') }}</span></div>
      <div class="mix__drafts">
        <article v-for="(d, idx) in drafts" :key="d.id" class="mix-draft">
          <div class="vg-row mix-draft__head">
            <strong class="vg-num">#{{ idx + 1 }}</strong>
            <span class="vg-pill vg-pill--accent">{{ d.formulaName }}</span>
            <span class="vg-pill vg-num">{{ d.totalDurationSec.toFixed(1) }}s</span>
            <span v-if="d.scriptSource === 'ai'" class="vg-pill vg-pill--violet">AI</span>
            <span v-if="d.hookStyle && d.scriptSource === 'ai'" class="vg-muted mix-draft__style vg-ellipsis" :title="d.hookStyle">{{ d.hookStyle }}</span>
            <span class="vg-toolbar__spacer" />
            <button class="vg-icon-btn vg-icon-btn--sm" type="button" title="删除这条" @click="removeDraft(d.id)"><X :size="14" /></button>
          </div>
          <div class="mix-draft__strip">
            <figure v-for="(s, i) in d.shots" :key="i" class="mix-shot" :title="s.description">
              <span class="mix-shot__img"><CloudImage :file-id="s.thumbnailPath" /></span>
              <figcaption><span>{{ ROLE_LABEL[s.role] }}</span><span class="vg-num">{{ s.durationSec.toFixed(1) }}s</span></figcaption>
              <span v-if="s.origin === 'ai'" class="mix-shot__ai">AI</span>
            </figure>
          </div>
          <div class="vg-field"><label :for="`mx-title-${d.id}`">画面钩子标题</label><input :id="`mx-title-${d.id}`" v-model="d.title" class="vg-input" /></div>
          <div class="vg-field">
            <label :for="`mx-vo-${d.id}`">口播文案（自动生成配音和字幕） <small class="vg-muted vg-num">≈ {{ speechSec(d).toFixed(1) }}s</small></label>
            <textarea :id="`mx-vo-${d.id}`" v-model="d.voiceover" class="vg-textarea" rows="3" />
          </div>
          <p v-if="d.warnings.length" class="mix-draft__warn">{{ d.warnings.join('；') }}</p>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.mix { display: flex; flex-direction: column; gap: 14px; width: min(1408px, 100%); margin: 0 auto; }
.mix__modes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.mix-mode { position: relative; display: flex; align-items: center; gap: 12px; padding: 14px; text-align: left; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); color: var(--theme-text); cursor: pointer; }
.mix-mode span:last-of-type { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.mix-mode small { font-size: 12px; color: var(--theme-text-muted); }
.mix-mode.is-active { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); }
.mix-mode__icon { width: 38px; height: 38px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); }
.mix-mode__check { position: absolute; top: 10px; right: 10px; color: var(--vg-accent); }
.mix__grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.mix__grid--output { margin-top: 12px; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); align-items: end; }
.mix__checks { display: flex; flex-wrap: wrap; gap: 16px; padding-bottom: 8px; }
.mix__check { font-size: 13px; color: var(--theme-text-secondary); gap: 6px; cursor: pointer; }
.mix__notice { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.mix__notice span { flex: 1; }
.mix__tiny { font-size: 12px; }
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
.mix__drafts { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 12px; margin-top: 12px; }
.mix-draft { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); min-width: 0; }
.mix-draft__head { gap: 6px; flex-wrap: nowrap; }
.mix-draft__style { font-size: 11px; min-width: 0; }
.mix-draft__strip { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.mix-shot { position: relative; margin: 0; flex: 0 0 64px; }
.mix-shot__img { display: block; width: 64px; height: 114px; overflow: hidden; border-radius: 6px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); }
.mix-shot__img :deep(img) { width: 100%; height: 100%; object-fit: cover; }
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
