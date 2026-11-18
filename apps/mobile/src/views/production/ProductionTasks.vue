<script setup lang="ts">
/** 混剪任务（网页版，对应电脑端 TasksView）：每个生产单一行，展开看每条视频的进度和成片。 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, CheckCircle2, Cloud, Download, ListChecks, ListVideo, Loader, Monitor, Plus } from 'lucide-vue-next'
import { MIX_ORDER_STATE_LABEL, type MixOrderResult } from '@shared/cloud/production'
import CloudVideo from '@/components/CloudVideo.vue'
import PageHeader from '@/components/PageHeader.vue'
import { fileBlob } from '@/lib/files'
import { downloadBlob } from '@/lib/platform'
import { relativeTime } from '@/lib/library'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'
import { useTemplates } from '@/lib/templates'
import { TASK_STATUS_LABEL, switchOrderToCloud, useDesktopOnline, useOrders, type OrderItem } from '@/lib/production'

const route = useRoute()
const router = useRouter()
const orders = useOrders()
const templates = useTemplates()
const { online } = useDesktopOnline()
const openId = ref(typeof route.query.id === 'string' ? route.query.id : '')
const statusFilter = ref<'all' | 'running' | 'done' | 'error'>('all')

const isRunning = (o: OrderItem) => o.state === 'pending' || o.state === 'running'
const runningCount = computed(() => orders.value.filter(isRunning).length)
const doneCount = computed(() => orders.value.filter((o) => o.state === 'completed').length)
const failCount = computed(() => orders.value.filter((o) => o.state === 'failed').length)
const filtered = computed(() =>
  orders.value.filter((o) => statusFilter.value === 'all' || (statusFilter.value === 'running' ? isRunning(o) : statusFilter.value === 'done' ? o.state === 'completed' : o.state === 'failed')),
)
const tone = (state: string) => (state === 'completed' || state === 'done' ? 'green' : state === 'failed' || state === 'error' ? 'red' : state === 'running' ? 'blue' : state === 'skipped' ? '' : 'amber')
const progressOf = (o: OrderItem) => {
  const results = o.results ?? []
  if (!results.length) return 0
  return Math.round(results.reduce((sum, r) => sum + (r.status === 'done' || r.status === 'error' || r.status === 'skipped' ? 100 : r.progress ?? 0), 0) / results.length)
}
const doneVideos = (o: OrderItem) => (o.results ?? []).filter((r) => r.status === 'done').length
const resultOf = (o: OrderItem, index: number): MixOrderResult => o.results?.[index] ?? { status: o.state === 'pending' ? 'queued' : 'queued' }
const switching = ref('')

async function toCloud(order: OrderItem) {
  if (!window.confirm('改用云端简版成片？只有镜头剪辑、标题和模板的音乐 / 画面，不含配音和字幕。')) return
  switching.value = order.id
  try {
    const id = await switchOrderToCloud(order, templates.value.find((t) => t.id === order.input.templateId) ?? null)
    openId.value = id
    toast('已改用云端简版成片')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    switching.value = ''
  }
}

async function download(fileId: string, name: string) {
  try {
    downloadBlob(await fileBlob(fileId), `${name}.mp4`)
  } catch (error) {
    toast(errorMessage(error))
  }
}
</script>

<template>
  <PageHeader title="混剪任务" back="/production" :icon="ListVideo" description="查看任务信息、筛选执行状态并进入任务详情。">
    <template #actions>
      <button class="vg-btn vg-btn--primary" type="button" @click="router.push('/production/mix')"><Plus :size="15" /> 新建任务</button>
    </template>
  </PageHeader>
  <main class="vg-page tasks" data-testid="web-production-tasks">
    <section class="vg-stats">
      <div class="vg-stat"><span class="vg-stat__icon"><ListChecks :size="17" /></span><span class="vg-stat__body"><span class="vg-stat__label">总任务</span><span class="vg-stat__value">{{ orders.length }}</span></span></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--blue"><Loader :size="17" /></span><span class="vg-stat__body"><span class="vg-stat__label">运行中</span><span class="vg-stat__value">{{ runningCount }}</span></span></div>
      <div class="vg-stat"><span class="vg-stat__icon"><CheckCircle2 :size="17" /></span><span class="vg-stat__body"><span class="vg-stat__label">已完成</span><span class="vg-stat__value">{{ doneCount }}</span></span></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--red"><AlertTriangle :size="17" /></span><span class="vg-stat__body"><span class="vg-stat__label">失败</span><span class="vg-stat__value">{{ failCount }}</span></span></div>
    </section>

    <section class="vg-card vg-card--flush">
      <div class="vg-card__head tasks__toolbar">
        <div class="vg-seg vg-seg--sm">
          <button class="vg-seg__btn" :class="{ 'is-active': statusFilter === 'all' }" type="button" @click="statusFilter = 'all'">全部 <span class="vg-count">{{ orders.length }}</span></button>
          <button class="vg-seg__btn" :class="{ 'is-active': statusFilter === 'running' }" type="button" @click="statusFilter = 'running'">运行中 <span class="vg-count">{{ runningCount }}</span></button>
          <button class="vg-seg__btn" :class="{ 'is-active': statusFilter === 'done' }" type="button" @click="statusFilter = 'done'">已完成 <span class="vg-count">{{ doneCount }}</span></button>
          <button class="vg-seg__btn" :class="{ 'is-active': statusFilter === 'error' }" type="button" @click="statusFilter = 'error'">失败 <span class="vg-count">{{ failCount }}</span></button>
        </div>
        <span class="vg-pill vg-pill--dot" :class="online ? 'vg-pill--green' : 'vg-pill--amber'"><Monitor :size="12" /> {{ online ? '电脑端在线' : '电脑端不在线' }}</span>
      </div>

      <div v-if="!filtered.length" class="vg-empty">
        <span class="vg-empty__icon"><ListVideo :size="24" /></span>
        <h3>当前没有任务</h3>
        <p>在 AI 混剪工作台出方案后下单，任务会出现在这里。</p>
      </div>

      <div v-else class="tasks__table">
        <table class="vg-table">
          <thead><tr><th>ID</th><th>商品</th><th>成片方式</th><th>进度</th><th>创建时间</th><th>状态</th></tr></thead>
          <tbody>
            <template v-for="order in filtered" :key="order.id">
              <tr class="tasks__row" :class="{ 'is-open': openId === order.id }" @click="openId = openId === order.id ? '' : order.id">
                <td class="vg-num tasks__id">#{{ order.id.slice(-8) }}</td>
                <td>
                  <div class="tasks__product">{{ order.productName }} · {{ order.drafts.length }} 条</div>
                  <div class="tasks__path">{{ [...new Set(order.drafts.map((d) => d.formulaName))].join('、') }}</div>
                  <div v-if="order.error" class="tasks__error">{{ order.error }}</div>
                </td>
                <td class="vg-secondary">
                  <span class="tasks__runner"><Monitor v-if="order.runner === 'desktop'" :size="13" /><Cloud v-else :size="13" /> {{ order.runner === 'desktop' ? '电脑完整成片' : '云端简版' }}</span>
                </td>
                <td>
                  <span class="vg-progress">
                    <span class="vg-progress__bar"><span class="vg-progress__fill" :class="{ 'vg-progress__fill--fail': order.state === 'failed' }" :style="{ width: `${progressOf(order)}%` }"></span></span>
                    <span>{{ progressOf(order) }}%</span>
                  </span>
                </td>
                <td class="vg-secondary vg-num">{{ relativeTime(order.createdAt) }}</td>
                <td><span class="vg-pill vg-pill--dot" :class="`vg-pill--${tone(order.state)}`">{{ MIX_ORDER_STATE_LABEL[order.state] }}</span></td>
              </tr>
              <tr v-if="openId === order.id" class="tasks__detail-row">
                <td colspan="6">
                  <div class="tasks__detail">
                    <div class="vg-row tasks__detail-head">
                      <span class="vg-muted">{{ doneVideos(order) }} / {{ order.drafts.length }} 条已出片<template v-if="order.reportedAt"> · 电脑 {{ relativeTime(order.reportedAt) }}更新</template></span>
                      <span class="vg-toolbar__spacer" />
                      <button v-if="order.runner === 'desktop' && order.state === 'pending'" class="vg-btn vg-btn--sm" type="button" :disabled="switching === order.id" @click.stop="toCloud(order)"><Cloud :size="14" /> 改用云端简版</button>
                      <button class="vg-btn vg-btn--sm" type="button" @click.stop="router.push('/review')">审核收件箱</button>
                    </div>
                    <div class="tasks__videos">
                      <article v-for="(draft, index) in order.drafts" :key="draft.id" class="tasks__video">
                        <div class="tasks__player">
                          <CloudVideo v-if="resultOf(order, index).outputFileId" :file-id="resultOf(order, index).outputFileId" controls />
                          <span v-else class="tasks__placeholder"><Loader v-if="resultOf(order, index).status === 'running'" :size="18" class="vg-spin" /><span>{{ TASK_STATUS_LABEL[resultOf(order, index).status] }}<template v-if="resultOf(order, index).progress"> {{ resultOf(order, index).progress }}%</template></span></span>
                        </div>
                        <div class="tasks__video-meta">
                          <strong class="vg-ellipsis" :title="draft.title">#{{ index + 1 }} {{ draft.title || draft.formulaName }}</strong>
                          <span class="vg-pill vg-pill--dot" :class="`vg-pill--${tone(resultOf(order, index).status)}`">{{ TASK_STATUS_LABEL[resultOf(order, index).status] }}</span>
                        </div>
                        <p v-if="resultOf(order, index).error" class="tasks__error">{{ resultOf(order, index).error }}</p>
                        <button v-if="resultOf(order, index).outputFileId" class="vg-btn vg-btn--xs" type="button" @click.stop="download(resultOf(order, index).outputFileId!, `${order.productName}-${index + 1}`)"><Download :size="12" /> 下载</button>
                      </article>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<style scoped>
.tasks { display: flex; flex-direction: column; gap: 14px; width: min(1408px, 100%); margin: 0 auto; }
.tasks__toolbar { gap: 10px; }
.tasks__table { overflow-x: auto; }
.tasks__row { cursor: pointer; }
.tasks__row:hover td, .tasks__row.is-open td { background: var(--theme-panel-soft); }
.tasks__id { color: var(--theme-text-muted); }
.tasks__product { font-weight: 600; }
.tasks__path { font-size: 12px; color: var(--theme-text-muted); }
.tasks__error { font-size: 12px; color: var(--vg-red); margin: 0; }
.tasks__runner { display: inline-flex; align-items: center; gap: 5px; }
.tasks__detail-row td { background: var(--theme-panel-soft); }
.tasks__detail { display: flex; flex-direction: column; gap: 10px; padding: 4px 0 8px; }
.tasks__detail-head { gap: 8px; }
.tasks__videos { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.tasks__video { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.tasks__player { aspect-ratio: 9 / 16; overflow: hidden; border-radius: 10px; border: 1px solid var(--theme-border); background: var(--theme-panel); }
.tasks__placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; height: 100%; font-size: 12px; color: var(--theme-text-muted); }
.tasks__video-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px; min-width: 0; }
.tasks__video-meta strong { min-width: 0; }
</style>
