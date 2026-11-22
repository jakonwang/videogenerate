<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ExternalLink, Flame, Loader2, Plus, Radar, RefreshCw, Trash2, Wand2, X } from 'lucide-vue-next'
import { useAiProducerStore } from '@/stores/aiProducer'
import { BREAKOUT_RULES, formatCount, videoUrl, type RadarBreakout, type RadarCompetitor } from '../../../../../shared/competitorRadar'

const ai = useAiProducerStore()
const competitors = ref<RadarCompetitor[]>([])
const breakouts = ref<RadarBreakout[]>([])
const lastRunAt = ref<number | undefined>()
const handle = ref('')
const note = ref('')
const busy = ref('')
const error = ref('')
const products = ref<Array<{ id: string; name: string }>>([])
const productFor = ref<Record<string, string>>({})
let unsubscribe: (() => void) | null = null

const clean = (cause: unknown) => String((cause as Error)?.message || cause).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const ago = (at?: number) => {
  if (!at) return '还没查过'
  const minutes = Math.round((Date.now() - at) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours} 小时前` : `${Math.round(hours / 24)} 天前`
}
const age = (at: number) => {
  const hours = Math.max(1, Math.round((Date.now() - at) / 3600_000))
  return hours < 48 ? `${hours} 小时前发` : `${Math.round(hours / 24)} 天前发`
}
const hasCompetitors = computed(() => competitors.value.length > 0)

function apply(state: { competitors: RadarCompetitor[]; breakouts: RadarBreakout[]; lastRunAt?: number }) {
  competitors.value = state.competitors
  breakouts.value = state.breakouts
  lastRunAt.value = state.lastRunAt
}
async function load() {
  try {
    apply(await window.api.contentHub.radarState())
  } catch (cause) {
    error.value = clean(cause)
  }
}
async function run(key: string, action: () => Promise<any>) {
  busy.value = key
  error.value = ''
  try {
    const state = await action()
    if (state?.competitors) apply(state)
  } catch (cause) {
    error.value = clean(cause)
  } finally {
    busy.value = ''
  }
}
const add = () => run('add', async () => {
  const state = await window.api.contentHub.radarAdd({ handle: handle.value, note: note.value })
  handle.value = ''
  note.value = ''
  return state
})
const remove = (h: string) => run(`rm:${h}`, () => window.api.contentHub.radarRemove(h))
const refresh = () => run('refresh', () => window.api.contentHub.radarRefresh())
const dismiss = (id: string) => run(`dismiss:${id}`, () => window.api.contentHub.radarDismiss(id))

const openVideo = (video: RadarBreakout) => void window.api.shell.openExternal(videoUrl(video))

async function cloneIt(video: RadarBreakout) {
  const productId = productFor.value[video.id] || ''
  await run(`clone:${video.id}`, async () => {
    const downloaded = await window.api.contentHub.radarDownload(video.id)
    const productName = products.value.find((item) => item.id === productId)?.name || ''
    const prompt = productName
      ? `竞品 @${video.handle} 的视频「${video.desc || video.id}」跑爆了（播放 ${formatCount(video.plays)}，是它平时的 ${video.multiple} 倍）。我已下载原视频（附件），请照着它的结构给商品「${productName}」复刻 3 条，做完送审。`
      : `竞品 @${video.handle} 的视频「${video.desc || video.id}」跑爆了（播放 ${formatCount(video.plays)}，是它平时的 ${video.multiple} 倍）。我已下载原视频（附件），请照着它的结构复刻，先问我要换成哪个商品。`
    void ai.open({
      fresh: true,
      send: Boolean(productId),
      prompt,
      attachments: [{ id: `radar-${video.id}`, name: `${video.handle}-${video.id}.mp4`, path: downloaded.localVideoPath, mediaType: 'video' }],
      context: { ...(productId ? { productId } : {}), referenceVideoPath: downloaded.localVideoPath, quantity: 3 },
      ...(productId ? { plan: { intents: ['Intent.CommerceVideoCreate', 'Intent.ReviewSubmit'], summary: `复刻竞品爆款 @${video.handle} → 3 条 → 审核` } } : {}),
    } as any)
  })
}

onMounted(async () => {
  await load()
  try {
    products.value = ((await window.api.products.list()) as Array<{ id: string; name: string }>).map((item) => ({ id: item.id, name: item.name }))
  } catch { /* product list is optional */ }
  unsubscribe = window.api.contentHub.onChanged((event: any) => { if (event?.kind === 'radar') void load() })
})
onBeforeUnmount(() => unsubscribe?.())
</script>

<template>
  <section class="cr" data-testid="competitor-radar">
    <div class="vg-card cr__intro">
      <div class="cr__intro-head">
        <span class="cr__icon"><Radar :size="20" /></span>
        <div>
          <strong>竞品爆款雷达</strong>
          <small>盯住竞品和对标账号，每 6 小时看一次它们最近的视频。哪条 {{ BREAKOUT_RULES.maxAgeDays }} 天内发的、播放过 {{ formatCount(BREAKOUT_RULES.minPlays) }}、又是它平时 {{ BREAKOUT_RULES.multiple }} 倍以上，就提醒你，可以一键下载原视频照着复刻。</small>
        </div>
        <button type="button" class="vg-btn vg-btn--sm" :disabled="!hasCompetitors || busy === 'refresh'" data-testid="radar-refresh" @click="refresh">
          <Loader2 v-if="busy === 'refresh'" :size="14" class="cr__spin" /><RefreshCw v-else :size="14" />立即刷新
        </button>
      </div>
      <form class="cr__add" @submit.prevent="add">
        <input v-model="handle" class="vg-input vg-input--sm" placeholder="竞品账号：@shopname 或主页链接" data-testid="radar-handle" />
        <input v-model="note" class="vg-input vg-input--sm cr__note" placeholder="备注（可选），比如 同款耳环店" />
        <button type="submit" class="vg-btn vg-btn--sm vg-btn--primary" :disabled="!handle.trim() || busy === 'add'" data-testid="radar-add"><Plus :size="14" />加入雷达</button>
      </form>
      <div v-if="hasCompetitors" class="cr__chips">
        <span v-for="item in competitors" :key="item.handle" class="cr__chip" :class="{ 'is-error': item.error }" :title="item.error || `上次查看：${ago(item.lastCheckedAt)}`" :data-testid="`radar-competitor-${item.handle}`">
          @{{ item.handle }}<small v-if="item.note"> · {{ item.note }}</small><small v-if="item.followers"> · {{ formatCount(item.followers) }} 粉</small><small v-if="item.error" class="cr__chip-error"> · 读取失败</small>
          <button type="button" class="cr__chip-x" :aria-label="`移除 @${item.handle}`" @click="remove(item.handle)"><Trash2 :size="11" /></button>
        </span>
      </div>
      <small class="vg-muted cr__meta">{{ hasCompetitors ? `上次刷新：${ago(lastRunAt)}` : '先加几个竞品账号。数据通过 TikHub 读取（和视频解析下载用同一个密钥）。' }}</small>
      <p v-if="error" class="cr__error" data-testid="radar-error">{{ error }}</p>
    </div>

    <div v-if="breakouts.length" class="cr__grid">
      <article v-for="video in breakouts" :key="video.id" class="vg-card cr__video" :data-testid="`radar-breakout-${video.id}`">
        <div class="cr__cover">
          <img v-if="video.cover" :src="video.cover" alt="" loading="lazy" referrerpolicy="no-referrer" />
          <span class="cr__multiple"><Flame :size="12" />{{ video.multiple }}×</span>
        </div>
        <div class="cr__body">
          <strong>@{{ video.handle }}</strong>
          <p class="cr__desc">{{ video.desc || '（没有文案）' }}</p>
          <small class="vg-muted">播放 {{ formatCount(video.plays) }} · 平时约 {{ formatCount(video.baseline) }} · 赞 {{ formatCount(video.likes) }} · {{ age(video.createdAt) }}</small>
          <select :value="productFor[video.id] || ''" class="vg-select vg-select--sm cr__product" @change="productFor[video.id] = ($event.target as HTMLSelectElement).value">
            <option value="">复刻成哪个商品？（可以之后再选）</option>
            <option v-for="product in products" :key="product.id" :value="product.id">{{ product.name }}</option>
          </select>
          <div class="cr__actions">
            <button type="button" class="vg-btn vg-btn--xs vg-btn--primary" :disabled="Boolean(busy)" :data-testid="`radar-clone-${video.id}`" @click="cloneIt(video)">
              <Loader2 v-if="busy === `clone:${video.id}`" :size="12" class="cr__spin" /><Wand2 v-else :size="12" />一键复刻
            </button>
            <button type="button" class="vg-btn vg-btn--xs" @click="openVideo(video)"><ExternalLink :size="12" />打开</button>
            <button type="button" class="vg-btn vg-btn--xs vg-btn--ghost" :disabled="Boolean(busy)" @click="dismiss(video.id)"><X :size="12" />忽略</button>
          </div>
        </div>
      </article>
    </div>
    <p v-else-if="hasCompetitors" class="vg-muted cr__empty">暂时没有发现爆款。竞品一有视频跑得比平时好很多，这里就会出现，并弹通知。</p>
  </section>
</template>

<style scoped>
.cr { display: flex; flex-direction: column; gap: 14px; }
.cr__intro { display: flex; flex-direction: column; gap: 10px; }
.cr__intro-head { display: flex; align-items: flex-start; gap: 12px; }
.cr__intro-head > div { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.cr__intro-head strong { font-size: 14px; color: var(--theme-text); }
.cr__intro-head small { font-size: 12px; color: var(--theme-text-muted); line-height: 1.6; }
.cr__icon { width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; background: var(--vg-accent-soft); color: var(--vg-accent); flex-shrink: 0; }
.cr__add { display: flex; gap: 8px; }
.cr__add .vg-input { flex: 1; }
.cr__note { max-width: 240px; }
.cr__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cr__chip { display: inline-flex; align-items: center; gap: 2px; padding: 4px 6px 4px 10px; border: 1px solid var(--theme-border); border-radius: 999px; background: var(--theme-panel-soft); font-size: 12px; color: var(--theme-text); }
.cr__chip small { color: var(--theme-text-muted); }
.cr__chip.is-error { border-color: var(--vg-red); }
.cr__chip-error { color: var(--vg-red) !important; }
.cr__chip-x { display: inline-flex; padding: 3px; margin-left: 4px; border: 0; border-radius: 50%; background: transparent; color: var(--theme-text-muted); cursor: pointer; }
.cr__chip-x:hover { color: var(--vg-red); }
.cr__meta { font-size: 11.5px; }
.cr__error { margin: 0; font-size: 12px; color: var(--vg-red); }
.cr__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.cr__video { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; padding: 12px; }
.cr__cover { position: relative; width: 96px; height: 170px; border-radius: 8px; overflow: hidden; background: var(--theme-panel-soft); }
.cr__cover img { width: 100%; height: 100%; object-fit: cover; }
.cr__multiple { position: absolute; left: 6px; top: 6px; display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; border-radius: 999px; background: rgba(220, 60, 40, 0.92); color: #fff; font-size: 11px; font-weight: 700; }
.cr__body { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.cr__body strong { font-size: 13px; color: var(--theme-text); }
.cr__desc { margin: 0; font-size: 12.5px; color: var(--theme-text); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.cr__body small { font-size: 11.5px; }
.cr__product { width: 100%; }
.cr__actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; }
.cr__empty { margin: 0; font-size: 12.5px; }
.cr__spin { animation: cr-spin 1s linear infinite; }
@keyframes cr-spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) { .cr__add { flex-direction: column; } .cr__note { max-width: none; } }
</style>
