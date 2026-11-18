<script setup lang="ts">
/** 批量混剪首页（网页版，对应电脑端 ProductionHomeView）。 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, BarChart3, Clapperboard, Film, FolderKanban, LayoutTemplate, ListChecks, Loader, Monitor, PlayCircle, PlusCircle, Shuffle, Sparkles } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { relativeTime } from '@/lib/library'
import { useDesktopOnline, useOrders } from '@/lib/production'
import { useTemplates } from '@/lib/templates'
import { MIX_ORDER_STATE_LABEL } from '@shared/cloud/production'

const router = useRouter()
const orders = useOrders()
const templates = useTemplates()
const { online } = useDesktopOnline()

const running = computed(() => orders.value.filter((o) => o.state === 'pending' || o.state === 'running').length)
const failed = computed(() => orders.value.filter((o) => o.state === 'failed').length)
const recent = computed(() => orders.value.slice(0, 6))
const tone = (state: string) => (state === 'completed' ? 'green' : state === 'failed' ? 'red' : state === 'running' ? 'blue' : 'amber')

const entries = computed(() => [
  { title: 'AI 混剪工作台', desc: '按爆款公式从素材池选镜头，AI 写口播，批量出带货视频。', metric: '开始混剪', route: '/production/mix', icon: Sparkles },
  { title: '混剪素材池', desc: '把实拍和 AI 视频切成镜头，AI 识别每个镜头的用途。', metric: '管理素材', route: '/production/pool', icon: Film },
  { title: '任务列表', desc: '查看任务队列、执行进度和最近结果。', metric: `${orders.value.length} 个任务`, route: '/production/tasks', icon: FolderKanban },
  { title: '模板中心', desc: '维护模板结构、字幕、音频和输出规则。', metric: `${templates.value.length} 个模板`, route: '/templates', icon: LayoutTemplate },
])
</script>

<template>
  <PageHeader title="批量混剪" :icon="Clapperboard" description="用商品素材和模板批量剪辑出视频，统一管理任务与模板。">
    <template #actions>
      <button class="vg-btn" type="button" @click="router.push('/production/mix/insights')"><BarChart3 :size="15" /> 混剪数据洞察</button>
      <button class="vg-btn" type="button" @click="router.push('/tools/mix')"><Shuffle :size="15" /> 旧版模板随机混剪</button>
      <button class="vg-btn vg-btn--primary" type="button" @click="router.push('/production/mix')"><PlusCircle :size="15" /> AI 混剪工作台</button>
    </template>
  </PageHeader>
  <main class="vg-page prod-home" data-testid="web-production">
    <div class="vg-notice" :class="online ? 'vg-notice--accent' : 'vg-notice--warning'">
      <Monitor :size="15" />
      <span v-if="online">电脑端在线：生产单会交给电脑完整成片（配音、字幕、包装模板）。</span>
      <span v-else>电脑端不在线：可以照常整理素材池、出方案；下单后等电脑打开再成片，或改用云端简版（镜头剪辑 + 标题 + 音乐，不含配音字幕）。</span>
    </div>

    <section class="vg-stats">
      <div class="vg-stat">
        <span class="vg-stat__icon"><ListChecks :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">任务总数</span><span class="vg-stat__value">{{ orders.length }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--blue"><Loader :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">运行中</span><span class="vg-stat__value">{{ running }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--red"><AlertTriangle :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">失败任务</span><span class="vg-stat__value">{{ failed }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--violet"><LayoutTemplate :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">模板总数</span><span class="vg-stat__value">{{ templates.length }}</span></span>
      </div>
    </section>

    <section class="vg-grid vg-grid--4 prod-home__entries">
      <button v-for="item in entries" :key="item.title" class="vg-card vg-card--interactive prod-entry" type="button" @click="router.push(item.route)">
        <span class="prod-entry__icon"><component :is="item.icon" :size="20" /></span>
        <span class="prod-entry__copy"><strong>{{ item.title }}</strong><span>{{ item.desc }}</span></span>
        <span class="vg-chip">{{ item.metric }}</span>
      </button>
    </section>

    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><PlayCircle :size="16" /> 最近任务 <small>继续查看最近执行结果或失败任务。</small></span>
        <button class="vg-btn vg-btn--sm" type="button" @click="router.push('/production/tasks')">任务列表</button>
      </div>
      <div v-if="recent.length" class="vg-list">
        <button v-for="order in recent" :key="order.id" class="vg-list__item vg-list__item--button" type="button" @click="router.push({ path: '/production/tasks', query: { id: order.id } })">
          <span class="vg-list__main">
            <span class="vg-list__title">{{ order.productName }} · {{ order.drafts.length }} 条</span>
            <span class="vg-list__sub">{{ order.runner === 'desktop' ? '电脑成片' : '云端简版' }} · {{ relativeTime(order.createdAt) }}</span>
          </span>
          <span class="vg-pill vg-pill--dot" :class="`vg-pill--${tone(order.state)}`">{{ MIX_ORDER_STATE_LABEL[order.state] }}</span>
        </button>
      </div>
      <div v-else class="vg-empty">
        <span class="vg-empty__icon"><PlayCircle :size="24" /></span>
        <p>还没有任务，进入 AI 混剪工作台出第一批方案。</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.prod-home { display: flex; flex-direction: column; gap: 14px; width: min(1408px, 100%); margin: 0 auto; }
.prod-entry { display: flex; align-items: center; gap: 12px; text-align: left; color: var(--theme-text); }
.prod-entry__icon { width: 44px; height: 44px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); }
.prod-entry__copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.prod-entry__copy strong { font-size: 14px; font-weight: 700; }
.prod-entry__copy span { font-size: 12px; color: var(--theme-text-muted); }
.vg-notice { display: flex; align-items: center; gap: 8px; }
@media (max-width: 1100px) { .prod-home__entries { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
