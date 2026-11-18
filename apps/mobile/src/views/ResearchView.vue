<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Accessibility, ChevronRight, Keyboard, LoaderCircle, Monitor, QrCode, ScanSearch, Search, Smartphone, Unplug, X } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncResearchTask } from '@shared/cloud/sync'
import PageHeader from '@/components/PageHeader.vue'
import CloudImage from '@/components/CloudImage.vue'
import { Check, Plus } from 'lucide-vue-next'
import { useInWebShell } from '@/lib/layout'
import { addResearchToLibrary, formatSales, useResearchResults, type ResearchItem } from '@/lib/researchResults'
import { relativeTime } from '@/lib/library'
import {
  cancelTask,
  connectionLabel,
  friendlyError,
  openAccessibilitySettings,
  pairManual,
  refreshResearch,
  research,
  researchAvailable,
  scanPairing,
  startLocalTask,
  unpair,
} from '@/lib/research'
import { errorMessage } from '@/lib/session'
import { listRecords, syncState } from '@/lib/sync'
import { toast } from '@/lib/toast'

const router = useRouter()
const inWebShell = useInWebShell()
const tab = ref<'phone' | 'desktop'>(localStorage.getItem('research.tab') === 'desktop' ? 'desktop' : 'phone')
watch(tab, (value) => localStorage.setItem('research.tab', value))

/* ---------------------------------------------------------------- 手机采集 */
const keyword = ref('')
const count = ref(50)
const counts = [20, 50, 100, 200]
const starting = ref(false)
const tasks = ref<(SyncResearchTask & { id: string })[]>([])

const localTask = computed(() => (research.task?.origin === 'local' ? research.task : null))
const running = computed(() => research.task?.status === 'running')
const progress = computed(() => {
  const t = research.task
  if (!t?.targetCount) return 0
  return Math.min(100, Math.round(((t.collected || 0) / t.targetCount) * 100))
})
const ready = computed(() => research.accessibilityEnabled && research.douyinInstalled)

async function loadTasks() {
  const records = await listRecords<SyncResearchTask>(SYNC_COLLECTIONS.researchTasks)
  tasks.value = records
    .filter((record) => record.data)
    .map((record) => ({ ...(record.data as SyncResearchTask), id: record.id }))
    .sort((a, b) => b.startedAt - a.startedAt)
}
watch(() => syncState.version, loadTasks, { immediate: true })

async function start() {
  const value = keyword.value.trim()
  if (!value) {
    toast('请输入要搜索的商品关键词')
    return
  }
  starting.value = true
  try {
    await startLocalTask(value, count.value)
    toast('正在打开抖音采集，完成后会自动回到这里')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    starting.value = false
  }
}

async function stop() {
  if (!research.task) return
  await cancelTask(research.task.id)
  toast('已发送取消')
}

const taskStatus = (task: SyncResearchTask) =>
  ({ running: { label: '采集中', tone: 'blue' }, completed: { label: '已完成', tone: 'green' }, failed: { label: '失败', tone: 'red' }, cancelled: { label: '已取消', tone: 'muted' } })[task.status]

/* ---------------------------------------------------------------- 网页：看采集结果、加入商品库 */
const selectedId = ref<string | null>(null)
const selectedTask = computed(() => tasks.value.find((task) => task.id === selectedId.value) ?? tasks.value[0] ?? null)
const { sorted: picked, sort: pickedSort } = useResearchResults(computed(() => selectedTask.value?.id ?? null))
const adding = ref<string | null>(null)
const PILL: Record<string, string> = { blue: 'vg-pill--blue', green: 'vg-pill--green', red: 'vg-pill--red', muted: '' }
async function addPicked(item: ResearchItem) {
  if (item.productId) {
    router.push(`/library/products/${item.productId}`)
    return
  }
  adding.value = item.id
  try {
    await addResearchToLibrary(item)
    toast('已加入商品库')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    adding.value = null
  }
}

/* ---------------------------------------------------------------- 连接电脑 */
const manual = ref(false)
const endpointDraft = ref('')
const codeDraft = ref('')
const pairing = ref(false)
const conn = computed(() => connectionLabel(research.connection))
const desktopTask = computed(() => (research.task?.origin === 'desktop' ? research.task : null))

async function scan() {
  pairing.value = true
  try {
    await scanPairing()
    toast('配对成功')
  } catch (error) {
    const message = errorMessage(error)
    if (message !== '已取消扫码') toast(message)
  } finally {
    pairing.value = false
  }
}

async function submitManual() {
  pairing.value = true
  try {
    await pairManual(endpointDraft.value.trim(), codeDraft.value.trim())
    manual.value = false
    toast('配对成功')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    pairing.value = false
  }
}

async function disconnect() {
  if (!window.confirm('解除与电脑的配对？之后需要重新扫码才能接收电脑下发的任务。')) return
  await unpair()
}

/* ---------------------------------------------------------------- 状态刷新 */
function onVisible() {
  if (document.visibilityState === 'visible') void refreshResearch()
}
onMounted(() => {
  void refreshResearch()
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))
</script>

<template>
  <template v-if="inWebShell">
    <PageHeader title="选品" :icon="ScanSearch" description="手机 App 按销量采集的抖音商品会同步到这里；挑中的一键加入商品库，再去复刻或做素材。" />
    <main class="vg-page rs" data-testid="web-research">
      <div class="vg-notice vg-notice--accent"><Smartphone :size="14" /> 采集需要在手机上操作抖音：打开 TiktokCut 手机版 → 选品，输入关键词按销量采集，完成后结果自动出现在这里。</div>
      <div v-if="tasks.length" class="rs-body">
        <nav class="rs-tasks">
          <span class="rs-tasks__head">采集记录 <small>{{ tasks.length }}</small></span>
          <button v-for="task in tasks" :key="task.id" type="button" class="rs-task" :class="{ 'is-active': selectedTask?.id === task.id }" @click="selectedId = task.id">
            <span class="rs-task__main"><strong>{{ task.keyword }}</strong><small>{{ task.collected }} 个商品 · {{ relativeTime(task.startedAt) }}</small></span>
            <span class="vg-pill vg-pill--dot" :class="PILL[taskStatus(task).tone]">{{ taskStatus(task).label }}</span>
          </button>
        </nav>
        <section class="rs-results">
          <div class="vg-toolbar">
            <strong class="rs-results__title">「{{ selectedTask?.keyword }}」 <small class="vg-muted">共 {{ picked.length }} 个商品</small></strong>
            <span class="vg-toolbar__spacer"></span>
            <div class="vg-seg vg-seg--sm">
              <button type="button" class="vg-seg__btn" :class="{ 'is-active': pickedSort === 'rank' }" @click="pickedSort = 'rank'">默认</button>
              <button type="button" class="vg-seg__btn" :class="{ 'is-active': pickedSort === 'sales' }" @click="pickedSort = 'sales'">销量</button>
              <button type="button" class="vg-seg__btn" :class="{ 'is-active': pickedSort === 'price' }" @click="pickedSort = 'price'">价格</button>
            </div>
          </div>
          <div v-if="picked.length" class="vg-table-wrap">
            <table class="vg-table">
              <thead><tr><th style="width: 52px">#</th><th style="width: 72px">主图</th><th>商品</th><th style="width: 110px">价格</th><th style="width: 110px">销量</th><th style="width: 130px"></th></tr></thead>
              <tbody>
                <tr v-for="item in picked" :key="item.id">
                  <td class="vg-muted">{{ item.rank }}</td>
                  <td><span class="rs-thumb"><CloudImage :file-id="item.image?.fileId" :alt="item.title" /></span></td>
                  <td class="rs-title">{{ item.title }}</td>
                  <td class="rs-price">{{ item.priceText || '-' }}</td>
                  <td class="rs-sales">{{ formatSales(item.salesValue, item.salesText) }}</td>
                  <td class="rs-actions">
                    <button v-if="item.productId" type="button" class="vg-btn vg-btn--xs" @click="addPicked(item)"><Check :size="13" /> 已在商品库</button>
                    <button v-else type="button" class="vg-btn vg-btn--xs vg-btn--primary" :disabled="adding === item.id" data-testid="research-add" @click="addPicked(item)"><Plus :size="13" /> 加入商品库</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="vg-empty rs-empty">
            <span class="vg-empty__icon"><ScanSearch :size="20" /></span>
            <h3>{{ selectedTask?.status === 'running' ? '正在采集…' : '没有采集到商品' }}</h3>
            <p>{{ selectedTask?.status === 'running' ? '手机采集完成后结果会出现在这里' : '在手机上换个关键词再试一次' }}</p>
          </div>
        </section>
      </div>
      <div v-else class="vg-empty rs-empty">
        <span class="vg-empty__icon"><ScanSearch :size="20" /></span>
        <h3>还没有采集记录</h3>
        <p>在 TiktokCut 手机版的「选品」里输入关键词开始第一次采集</p>
      </div>
    </main>
  </template>
  <template v-else>
  <PageHeader title="选品" />
  <main class="m-page">
    <div class="seg" role="tablist">
      <button type="button" role="tab" :class="{ 'is-active': tab === 'phone' }" @click="tab = 'phone'"><Smartphone :size="16" /> 手机采集</button>
      <button type="button" role="tab" :class="{ 'is-active': tab === 'desktop' }" @click="tab = 'desktop'">
        <Monitor :size="16" /> 连接电脑<span v-if="research.connection === 'connected'" class="dot" />
      </button>
    </div>

    <div v-if="!researchAvailable" class="m-card m-empty">
      <span class="m-empty__title">请在手机 App 中使用</span>
      <span class="m-empty__text">选品采集需要操作手机上的抖音，浏览器里无法使用</span>
    </div>

    <!-- ============================================================ 手机采集 -->
    <template v-else-if="tab === 'phone'">
      <section v-if="localTask && (running || localTask.status !== 'completed' || research.ingesting)" class="task m-card">
        <div class="task__head">
          <span class="task__icon"><LoaderCircle v-if="running || research.ingesting" :size="20" class="m-spin" /><ScanSearch v-else :size="20" /></span>
          <div class="task__main">
            <strong>「{{ localTask.keyword }}」</strong>
            <span v-if="running">已采集 {{ localTask.collected || 0 }} / {{ localTask.targetCount }}</span>
            <span v-else-if="research.ingesting">正在保存到云端…</span>
            <span v-else-if="localTask.status === 'failed'" class="err">{{ friendlyError(localTask.error) }}</span>
          </div>
          <button v-if="running" type="button" class="m-btn m-btn--sm" @click="stop"><X :size="14" /> 停止</button>
        </div>
        <div v-if="running" class="bar"><span :style="{ width: `${progress}%` }" /></div>
      </section>

      <section v-if="!ready" class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">开始前需要</h2></div>
        <div class="m-card m-list">
          <button type="button" class="m-row" @click="openAccessibilitySettings()">
            <span class="icon" :class="{ 'is-done': research.accessibilityEnabled }"><Accessibility :size="20" /></span>
            <span class="m-row__main">
              <span class="m-row__title">开启无障碍服务</span>
              <span class="m-row__sub">在「已下载的应用」里找到「TiktokCut 选品采集」并打开</span>
            </span>
            <span v-if="research.accessibilityEnabled" class="m-badge m-badge--green">已开启</span>
            <ChevronRight v-else :size="18" class="m-muted" />
          </button>
          <div class="m-row">
            <span class="icon" :class="{ 'is-done': research.douyinInstalled }"><Smartphone :size="20" /></span>
            <span class="m-row__main">
              <span class="m-row__title">安装抖音</span>
              <span class="m-row__sub">采集会自动打开抖音搜索商品</span>
            </span>
            <span class="m-badge" :class="research.douyinInstalled ? 'm-badge--green' : 'm-badge--amber'">{{ research.douyinInstalled ? '已安装' : '未安装' }}</span>
          </div>
        </div>
      </section>

      <section class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">搜索商品</h2></div>
        <div class="m-card m-card--pad">
          <label class="m-search">
            <Search :size="18" />
            <input v-model="keyword" type="search" enterkeyhint="search" placeholder="例如：耳环、手机壳" :disabled="running" @keydown.enter="start" />
          </label>
          <div class="counts">
            <span class="m-muted">采集数量</span>
            <button v-for="n in counts" :key="n" type="button" class="m-chip" :class="{ 'is-active': count === n }" :disabled="running" @click="count = n">{{ n }}</button>
          </div>
          <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="!ready || running || starting" @click="start">
            <LoaderCircle v-if="starting" :size="18" class="m-spin" />
            {{ running ? '正在采集…' : '按销量采集' }}
          </button>
          <p class="hint">采集时会自动打开抖音，请保持亮屏、不要操作手机，完成后自动回到 TiktokCut。</p>
        </div>
      </section>

      <section class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">采集记录</h2><span class="m-muted small">与电脑端同步</span></div>
        <div v-if="tasks.length" class="m-card m-list">
          <button v-for="task in tasks" :key="task.id" type="button" class="m-row" @click="router.push(`/research/${task.id}`)">
            <span class="icon"><ScanSearch :size="20" /></span>
            <span class="m-row__main">
              <span class="m-row__title">{{ task.keyword }}</span>
              <span class="m-row__sub">{{ task.collected }} 个商品 · {{ relativeTime(task.startedAt) }}</span>
            </span>
            <span class="m-badge" :class="`m-badge--${taskStatus(task).tone}`">{{ taskStatus(task).label }}</span>
            <ChevronRight :size="18" class="m-muted" />
          </button>
        </div>
        <div v-else class="m-card m-empty">
          <span class="m-empty__title">还没有采集记录</span>
          <span class="m-empty__text">输入关键词开始第一次采集</span>
        </div>
      </section>
    </template>

    <!-- ============================================================ 连接电脑 -->
    <template v-else>
      <section class="conn m-card">
        <div class="conn__top">
          <span class="conn__icon"><Monitor :size="24" /></span>
          <span class="m-badge" :class="`m-badge--${conn.tone}`">{{ conn.label }}</span>
        </div>
        <h2>{{ research.paired ? (research.connection === 'connected' ? '已连接电脑' : '正在连接电脑…') : '连接电脑采集' }}</h2>
        <p v-if="research.paired" class="mono">{{ research.endpoint.replace(/^https?:\/\//, '') }}</p>
        <p v-else>在电脑端「选品」页点「连接手机」，扫描弹出的二维码。连接后电脑下发的采集任务会自动在这台手机上执行，结果回传电脑。</p>
      </section>

      <section v-if="desktopTask" class="task m-card m-section">
        <div class="task__head">
          <span class="task__icon"><LoaderCircle v-if="desktopTask.status === 'running'" :size="20" class="m-spin" /><ScanSearch v-else :size="20" /></span>
          <div class="task__main">
            <strong>电脑任务「{{ desktopTask.keyword }}」</strong>
            <span v-if="desktopTask.status === 'running'">已采集 {{ desktopTask.collected || 0 }} / {{ desktopTask.targetCount }}</span>
            <span v-else-if="desktopTask.status === 'failed'" class="err">{{ friendlyError(desktopTask.error) }}</span>
            <span v-else>已完成，结果已回传电脑</span>
          </div>
        </div>
        <div v-if="desktopTask.status === 'running'" class="bar"><span :style="{ width: `${progress}%` }" /></div>
      </section>

      <section class="m-section actions">
        <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="pairing" @click="scan">
          <LoaderCircle v-if="pairing" :size="18" class="m-spin" /><QrCode v-else :size="18" />
          {{ research.paired ? '重新扫码配对' : '扫描电脑二维码' }}
        </button>
        <button type="button" class="m-btn m-btn--block" @click="manual = !manual"><Keyboard :size="18" /> 手动输入配对码</button>
        <div v-if="manual" class="m-card m-card--pad manual">
          <label class="m-field">
            <span class="m-field__label">服务地址</span>
            <input v-model="endpointDraft" class="m-input mono" type="url" inputmode="url" placeholder="http://192.168.1.10:41688" />
          </label>
          <label class="m-field">
            <span class="m-field__label">配对码</span>
            <input v-model="codeDraft" class="m-input mono" type="text" inputmode="numeric" placeholder="电脑上显示的 6 位数字" />
          </label>
          <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="pairing" @click="submitManual">连接</button>
        </div>
      </section>

      <section class="m-section">
        <div class="m-card m-list">
          <button type="button" class="m-row" @click="openAccessibilitySettings()">
            <span class="icon" :class="{ 'is-done': research.accessibilityEnabled }"><Accessibility :size="20" /></span>
            <span class="m-row__main"><span class="m-row__title">无障碍服务</span><span class="m-row__sub">执行电脑任务也需要开启</span></span>
            <span class="m-badge" :class="research.accessibilityEnabled ? 'm-badge--green' : 'm-badge--amber'">{{ research.accessibilityEnabled ? '已开启' : '去开启' }}</span>
          </button>
          <button v-if="research.paired" type="button" class="m-row danger" @click="disconnect">
            <span class="icon"><Unplug :size="20" /></span>
            <span class="m-row__main"><span class="m-row__title">解除配对</span></span>
          </button>
        </div>
      </section>
    </template>
  </main>
  </template>
</template>

<style scoped>
.rs { display: flex; flex-direction: column; gap: 14px; }
.rs-body { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 14px; align-items: start; }
.rs-tasks { display: flex; flex-direction: column; gap: 2px; max-height: calc(100vh - 220px); overflow: auto; padding: 10px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); }
.rs-tasks__head { padding: 4px 8px 8px; font-size: 12px; font-weight: 700; color: var(--theme-text-muted); }
.rs-task { display: flex; align-items: center; gap: 8px; padding: 9px 8px; border: 0; border-radius: 9px; background: transparent; color: var(--theme-text); text-align: left; cursor: pointer; }
.rs-task:hover { background: var(--theme-panel-soft); }
.rs-task.is-active { background: var(--vg-accent-soft); }
.rs-task__main { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.rs-task__main strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.rs-task__main small { font-size: 11px; color: var(--theme-text-muted); }
.rs-results { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 14px 16px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); }
.rs-results__title { font-size: 14px; }
.rs-thumb { display: block; width: 48px; height: 48px; overflow: hidden; border-radius: 8px; background: var(--theme-panel-soft); }
.rs-title { line-height: 1.45; }
.rs-price { font-weight: 700; color: var(--vg-red); }
.rs-sales { font-weight: 700; color: var(--vg-green); }
.rs-actions { text-align: right; }
.rs-empty { padding: 48px 16px; }

.seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 4px; padding: 4px; border-radius: 14px; background: var(--theme-panel); border: 1px solid var(--theme-border); }
.seg button { position: relative; display: flex; align-items: center; justify-content: center; gap: 6px; height: 38px; border: 0; border-radius: 10px; background: none; color: var(--theme-text-muted); font-size: 14px; font-weight: 700; }
.seg button.is-active { background: var(--theme-control-hover); color: var(--theme-text); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--m-green); }
.task { margin-top: 16px; padding: 14px 16px; border-color: color-mix(in srgb, var(--m-blue) 30%, var(--theme-border)); background: linear-gradient(140deg, color-mix(in srgb, var(--m-blue) 10%, var(--theme-panel)), var(--theme-panel) 70%); }
.task__head { display: flex; align-items: center; gap: 12px; }
.task__icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: color-mix(in srgb, var(--m-blue) 16%, transparent); color: var(--m-blue); }
.task__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.task__main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task__main span { color: var(--theme-text-muted); font-size: 13px; }
.task__main .err { color: var(--m-red); }
.bar { height: 6px; margin-top: 12px; border-radius: 999px; background: var(--theme-control-hover); overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--m-accent), var(--m-accent-2)); transition: width .3s; }
.icon { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--theme-control); color: var(--theme-text-secondary); }
.icon.is-done { background: var(--m-accent-soft); color: var(--m-accent-2); }
.counts { display: flex; align-items: center; gap: 8px; margin: 14px 0 16px; font-size: 13px; }
.counts span { margin-right: 4px; }
.hint { margin: 12px 2px 0; color: var(--theme-text-muted); font-size: 12px; line-height: 1.6; }
.small { font-size: 12px; }
.conn { margin-top: 16px; padding: 20px 18px; background: linear-gradient(140deg, color-mix(in srgb, var(--m-accent) 14%, var(--theme-panel)), var(--theme-panel) 65%); }
.conn__top { display: flex; align-items: center; justify-content: space-between; }
.conn__icon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: var(--m-accent-soft); color: var(--m-accent-2); }
.conn h2 { margin: 16px 0 6px; font-size: 20px; }
.conn p { margin: 0; color: var(--theme-text-muted); font-size: 13px; line-height: 1.6; }
.mono { font-family: ui-monospace, 'SFMono-Regular', monospace; }
.actions { display: flex; flex-direction: column; gap: 10px; }
.manual { margin-top: 2px; }
.danger .m-row__title { color: var(--m-red); }
.danger .icon { color: var(--m-red); background: color-mix(in srgb, var(--m-red) 10%, transparent); }
</style>
