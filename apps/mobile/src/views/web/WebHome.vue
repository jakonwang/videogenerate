<script setup lang="ts">
/**
 * 工作台 for the web version — same structure and look as the desktop HomeView (hero with goal input,
 * production lines, today's to-dos, continue where you left off, toolbox), built on the desktop ui-kit
 * and the data the web version has (synced products, generations, clone projects, tool runs).
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Copy,
  ImagePlus,
  Inbox,
  LayoutGrid,
  Loader2,
  Plus,
  Sparkles,
  Wand2,
  XCircle,
} from 'lucide-vue-next'
import heroImage from '@/assets/home-hero.webp'
import CloudImage from '@/components/CloudImage.vue'
import { MODULES } from '@/lib/modules'
import { useGenerations } from '@/lib/generate'
import { coverOf, relativeTime, useProducts } from '@/lib/library'
import { session } from '@/lib/session'
import { useTasks } from '@/lib/tasks'
import { useCloneProjects } from '@/lib/clone'

const router = useRouter()
const goal = ref('')
const { items: products } = useProducts()
const tasks = useTasks()
const pendingReviews = useGenerations((item) => item.status === 'succeeded' && item.review === 'pending')

const greeting = computed(() => {
  const hour = new Date().getHours()
  return hour < 6 ? '夜深了，' : hour < 12 ? '早上好，' : hour < 18 ? '下午好，' : '晚上好，'
})

function askGoal() {
  const text = goal.value.trim()
  void router.push(text ? { path: '/producer', query: { prompt: text } } : '/producer')
}

const lines = [
  { key: 'clone', title: '复刻', desc: '照着爆款视频的结构，做一条带你商品的完整成片', icon: Copy, tone: 'accent', to: '/clone', prompt: '帮我找一条爆款视频，换成我的商品复刻一条成片' },
  { key: 'live-photo', title: '图生视频', desc: '用商品图直接生成会动的短视频，适合主图视频和种草', icon: Sparkles, tone: 'violet', to: '/image-to-video', prompt: '用我的商品图做 3 条图生视频' },
  { key: 'product-images', title: '商品图素材', desc: 'AI 生成主图、上身图、细节特写，一次出一整套', icon: ImagePlus, tone: 'red', to: '/product-images', prompt: '给我的新商品做一套主图和上身图' },
]

type Todo = { key: string; level: 'ok' | 'warning' | 'error'; title: string; detail: string; to: string }
const todos = computed<Todo[]>(() => {
  const list: Todo[] = []
  if (pendingReviews.value.length) list.push({ key: 'review', level: 'warning', title: `${pendingReviews.value.length} 条内容待你审核`, detail: 'AI 已经生成完成，等你通过或丢弃', to: '/review' })
  const failed = tasks.value.filter((task) => task.state === 'failed')
  if (failed.length) list.push({ key: 'failed', level: 'error', title: `${failed.length} 个任务失败`, detail: failed.slice(0, 3).map((task) => task.module).join(' · '), to: '/tasks' })
  const running = tasks.value.filter((task) => task.state === 'running')
  if (running.length) list.push({ key: 'running', level: 'ok', title: `${running.length} 个任务正在生成`, detail: '在云端运行，关掉网页也会继续', to: '/tasks' })
  const e = session.entitlement
  if (e?.active && !e.unlimited && e.expiresAt) {
    const days = Math.ceil((e.expiresAt - Date.now()) / 86_400_000)
    if (days <= 7) list.push({ key: 'plan', level: 'warning', title: `会员还剩 ${Math.max(0, days)} 天`, detail: '到期后无法继续生成和同步新内容', to: '/membership' })
  } else if (e && !e.active) {
    list.push({ key: 'plan', level: 'error', title: '会员未开通或已过期', detail: '开通后才能使用 AI 生成和视频工具', to: '/membership' })
  }
  if (!products.value.length) list.push({ key: 'product', level: 'warning', title: '还没有商品', detail: '先建一个商品，所有内容都挂在商品下面', to: '/library/products/new' })
  if (!list.some((item) => item.level !== 'ok')) list.push({ key: 'ok', level: 'ok', title: '一切正常', detail: '给 AI 制片人一个目标，比如为一个商品做一套内容', to: '/producer' })
  return list
})

const finished = useGenerations((item) => item.status === 'succeeded' && Boolean(item.outputFileId))
const cloneProjects = useCloneProjects()
const PURPOSE: Record<string, string> = {
  'product-image': '商品图素材', 'image-to-video': '图生视频', clone: '复刻', watermark: '批量水印', subtitle: '批量字幕',
  slice: '直播切片', mix: '批量混剪', 'parse-link': '链接下载', 'product-replace': '商品替换', 'product-watermark': '商品图水印', creative: 'tk创意室', model: 'AI 模特',
}
type RecentRow = { key: string; title: string; sub: string; state: 'running' | 'failed' | 'done' | 'review'; route: string; at: number; imageFileId?: string }
/** Running / failed work first, then the latest clone projects and finished results — like the desktop 「继续上次」. */
const recent = computed<RecentRow[]>(() => {
  const rows: RecentRow[] = tasks.value
    .filter((task) => task.state !== 'done')
    .map((task) => ({ key: task.key, title: task.title, sub: task.module, state: task.state, route: task.route, at: task.at }))
  for (const project of cloneProjects.value.slice(0, 4)) {
    if (rows.some((row) => row.route === `/clone/${project.id}`)) continue
    rows.push({ key: `clone:${project.id}`, title: project.name, sub: `复刻${project.productName ? ` · ${project.productName}` : ''}`, state: project.finalFileId ? 'done' : 'running', route: `/clone/${project.id}`, at: project.updatedAt })
  }
  for (const item of finished.value.slice(0, 6)) {
    rows.push({
      key: `gen:${item.id}`,
      title: item.productName ? `${item.productName} · ${item.label}` : item.label,
      sub: PURPOSE[item.purpose] || '作品',
      state: item.review === 'pending' ? 'review' : 'done',
      route: item.review === 'pending' ? '/review' : '/works',
      at: item.createdAt,
      imageFileId: item.kind === 'image' ? item.outputFileId : undefined,
    })
  }
  const order = { running: 0, failed: 0, review: 1, done: 2 }
  return rows.sort((a, b) => order[a.state] - order[b.state] || b.at - a.at).slice(0, 6)
})
const STATE_LABEL = { running: '生成中', failed: '失败', review: '待审核', done: '已完成' }

const toolKeys = ['mix', 'subtitle', 'watermark', 'live-slicer', 'download', 'product-replace', 'product-watermark', 'listing', 'publish', 'assets']
const TONES = ['accent', 'blue', 'amber', 'violet', 'green', 'gray']
const tools = toolKeys
  .map((key) => MODULES.find((item) => item.key === key))
  .filter((item): item is NonNullable<typeof item> => Boolean(item?.route))
  .map((item, index) => ({ ...item, tone: TONES[index % TONES.length] }))
</script>

<template>
  <main class="vg-page home" data-testid="web-home">
    <section class="home-hero" :style="{ '--hero-image': `url(${heroImage})` }">
      <div class="home-hero__copy">
        <span class="vg-pill vg-pill--accent"><Sparkles :size="12" /> AI 带货内容团队</span>
        <h1>{{ greeting }}<strong>今天卖什么？</strong></h1>
        <p>告诉 AI 制片人你的目标，它会规划、调度复刻 / 图生视频 / 商品图素材，并把产出交给你挑选。</p>
        <form class="home-goal" @submit.prevent="askGoal">
          <Wand2 :size="16" class="home-goal__icon" />
          <input v-model="goal" class="home-goal__input" data-testid="web-home-goal" placeholder="例如：这周给新到的耳环做 6 条视频和一组图生视频" />
          <button type="submit" class="vg-btn vg-btn--primary vg-btn--sm">交给 AI <ArrowRight :size="14" /></button>
        </form>
      </div>
    </section>

    <section class="home-lines">
      <article v-for="line in lines" :key="line.key" class="vg-card home-line" :class="`home-line--${line.tone}`">
        <span class="home-line__icon"><component :is="line.icon" :size="20" /></span>
        <div class="home-line__copy">
          <strong>{{ line.title }}</strong>
          <small>{{ line.desc }}</small>
        </div>
        <div class="home-line__actions">
          <button type="button" class="vg-btn vg-btn--sm" @click="router.push(line.to)">打开工作台</button>
          <button type="button" class="vg-btn vg-btn--sm vg-btn--soft" @click="router.push({ path: '/producer', query: { prompt: line.prompt } })"><Wand2 :size="13" /> 让 AI 来做</button>
        </div>
      </article>
    </section>

    <section class="home-lower">
      <div class="vg-card home-brief">
        <div class="vg-card__head">
          <span class="vg-card__title"><Sparkles :size="16" /> 今日待办 <small>{{ todos.filter((t) => t.level !== 'ok').length ? `有 ${todos.filter((t) => t.level !== 'ok').length} 件事需要你处理` : '今天一切就绪' }}</small></span>
        </div>
        <div class="vg-list">
          <button v-for="item in todos" :key="item.key" type="button" class="vg-list__item vg-list__item--button" @click="router.push(item.to)">
            <CheckCircle2 v-if="item.level === 'ok'" :size="16" class="home-brief__ok" />
            <AlertTriangle v-else-if="item.level === 'warning'" :size="16" class="home-brief__warn" />
            <XCircle v-else :size="16" class="home-brief__err" />
            <span class="vg-list__main">
              <span class="vg-list__title">{{ item.title }}</span>
              <span class="vg-list__sub">{{ item.detail }}</span>
            </span>
            <ArrowRight :size="14" class="home-brief__arrow" />
          </button>
        </div>
      </div>

      <div class="vg-card home-continue">
        <div class="vg-card__head">
          <span class="vg-card__title"><Inbox :size="16" /> 继续上次</span>
          <div class="vg-card__actions">
            <button type="button" class="vg-btn vg-btn--sm" @click="router.push('/review')">审核收件箱 <span v-if="pendingReviews.length" class="vg-count">{{ pendingReviews.length }}</span></button>
          </div>
        </div>
        <div v-if="recent.length" class="vg-list">
          <button v-for="row in recent" :key="row.key" type="button" class="vg-list__item vg-list__item--button" @click="router.push(row.route)">
            <span class="vg-thumb home-continue__thumb">
              <CloudImage v-if="row.imageFileId" :file-id="row.imageFileId" />
              <Loader2 v-else-if="row.state === 'running'" :size="16" class="vg-spin" />
              <XCircle v-else-if="row.state === 'failed'" :size="16" />
              <Clapperboard v-else :size="16" />
            </span>
            <span class="vg-list__main">
              <span class="vg-list__title">{{ row.title }}</span>
              <span class="vg-list__sub">{{ row.sub }} · {{ relativeTime(row.at) }}</span>
            </span>
            <span class="vg-pill vg-pill--dot" :class="{ 'vg-pill--green': row.state === 'done', 'vg-pill--blue': row.state === 'running', 'vg-pill--red': row.state === 'failed', 'vg-pill--amber': row.state === 'review' }">
              {{ STATE_LABEL[row.state] }}
            </span>
          </button>
        </div>
        <div v-else class="vg-empty">
          <span class="vg-empty__icon"><Clapperboard :size="22" /></span>
          <h3>还没有项目</h3>
          <p>从上面三条生产线或「交给 AI」开始</p>
        </div>
      </div>
    </section>

    <section class="vg-card home-products">
      <div class="vg-card__head">
        <span class="vg-card__title"><LayoutGrid :size="16" /> 最近的商品 <small>{{ products.length }} 个</small></span>
        <div class="vg-card__actions">
          <button type="button" class="vg-btn vg-btn--sm" @click="router.push('/library?tab=products')">全部商品</button>
          <button type="button" class="vg-btn vg-btn--sm vg-btn--primary" @click="router.push('/library/products/new')"><Plus :size="14" /> 新建商品</button>
        </div>
      </div>
      <div v-if="products.length" class="home-products__grid">
        <button v-for="product in products.slice(0, 6)" :key="product.id" type="button" class="home-product" @click="router.push(`/library/products/${product.id}`)">
          <span class="home-product__img"><CloudImage :file-id="coverOf(product)" :alt="product.name" /></span>
          <span class="home-product__name">{{ product.name }}</span>
          <small>{{ (product.images || []).length }} 张图 · {{ relativeTime(product.updatedAt) }}</small>
        </button>
      </div>
      <div v-else class="vg-empty">
        <span class="vg-empty__icon"><Plus :size="22" /></span>
        <h3>还没有商品</h3>
        <p>在电脑端添加的商品会自动出现在这里，也可以直接上传图片新建</p>
      </div>
    </section>

    <section class="vg-stack">
      <h2 class="vg-section-title"><LayoutGrid :size="16" /> 工具箱</h2>
      <div class="home-tools">
        <button v-for="tool in tools" :key="tool.key" type="button" class="vg-card vg-card--interactive home-tool" :class="`home-tool--${tool.tone}`" :title="tool.description" @click="router.push(tool.route!)">
          <span class="home-tool__icon"><component :is="tool.icon" :size="18" /></span>
          <span class="home-tool__copy"><strong>{{ tool.name }}</strong><small>{{ tool.description }}</small></span>
          <ArrowRight class="home-tool__arrow" :size="16" />
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
/* Mirrors src/renderer/src/ui/views/HomeView.vue so the web 工作台 looks like the desktop one. */
.home { width: min(1408px, 100%); margin: 0 auto; gap: 16px; }

.home-hero {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--vg-accent-line);
  border-radius: var(--vg-radius-lg);
  background:
    linear-gradient(90deg, var(--theme-panel) 0%, color-mix(in srgb, var(--theme-panel) 94%, transparent) 46%, color-mix(in srgb, var(--theme-panel) 25%, transparent) 78%, transparent 100%),
    radial-gradient(120% 140% at 0% 0%, var(--vg-accent-soft), transparent 60%),
    var(--hero-image) right center / cover no-repeat,
    var(--theme-panel);
}
.home-hero__copy { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; max-width: 720px; padding: 26px 32px; }
.home-hero h1 { font-size: clamp(22px, 2.3vw, 30px); font-weight: 800; line-height: 1.25; color: var(--theme-text); }
.home-hero h1 strong { color: var(--vg-accent); }
.home-hero p { font-size: 14px; color: var(--theme-text-secondary); }
.home-goal { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 6px; padding: 6px 6px 6px 12px; border: 1px solid var(--theme-border-control); border-radius: 12px; background: var(--theme-shell); box-shadow: 0 6px 20px rgba(0, 0, 0, .08); }
.home-goal:focus-within { border-color: var(--vg-accent-line); box-shadow: 0 0 0 3px var(--vg-accent-soft); }
.home-goal__icon { color: var(--vg-accent); flex-shrink: 0; }
.home-goal__input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--theme-text); font-size: 14px; }

.home-lines { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.home-line { --tone: var(--vg-accent); display: flex; flex-direction: column; gap: 10px; padding: 16px; }
.home-line--violet { --tone: var(--vg-violet); }
.home-line--red { --tone: var(--vg-red); }
.home-line__icon { width: 40px; height: 40px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--tone) 14%, transparent); border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent); color: var(--tone); }
.home-line__copy { display: flex; flex-direction: column; gap: 4px; }
.home-line__copy strong { font-size: 15px; }
.home-line__copy small { font-size: 12.5px; color: var(--theme-text-secondary); line-height: 1.55; }
.home-line__actions { display: flex; gap: 8px; margin-top: auto; }

.home-lower { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.home-brief__ok { color: var(--vg-green); flex-shrink: 0; }
.home-brief__warn { color: var(--vg-amber); flex-shrink: 0; }
.home-brief__err { color: var(--vg-red); flex-shrink: 0; }
.home-brief__arrow { color: var(--theme-text-muted); flex-shrink: 0; }
.home-continue__thumb { display: inline-flex; align-items: center; justify-content: center; overflow: hidden; color: var(--theme-text-muted); }
.home-continue__thumb :deep(img) { width: 100%; height: 100%; object-fit: cover; }

.home-products__grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
.home-product { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 0; border: 0; background: transparent; color: var(--theme-text); text-align: left; cursor: pointer; }
.home-product__img { aspect-ratio: 1; overflow: hidden; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-control); transition: border-color .15s; }
.home-product:hover .home-product__img { border-color: var(--vg-accent-line); }
.home-product__img :deep(img), .home-product__img :deep(.cloud-img) { width: 100%; height: 100%; object-fit: cover; }
.home-product__name { overflow: hidden; font-size: 12.5px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.home-product small { font-size: 11px; color: var(--theme-text-muted); }

.home-tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.home-tool { --tone: var(--vg-accent); display: flex; align-items: center; gap: 12px; min-width: 0; padding: 12px 14px; color: var(--theme-text); text-align: left; cursor: pointer; }
.home-tool--blue { --tone: var(--vg-blue); }
.home-tool--amber { --tone: var(--vg-amber); }
.home-tool--violet { --tone: var(--vg-violet); }
.home-tool--green { --tone: var(--vg-green); }
.home-tool--gray { --tone: var(--vg-gray); }
.home-tool__icon { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; flex-shrink: 0; border-radius: 10px; background: color-mix(in srgb, var(--tone) 14%, transparent); border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent); color: var(--tone); }
.home-tool__copy { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.home-tool__copy strong { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-tool__copy small { font-size: 11.5px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-tool__arrow { color: var(--theme-text-muted); flex-shrink: 0; transition: transform .15s, color .15s; }
.home-tool:hover .home-tool__arrow { color: var(--tone); transform: translateX(2px); }

@media (max-width: 1240px) {
  .home-products__grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 1120px) {
  .home-lower { grid-template-columns: 1fr; }
}
</style>
