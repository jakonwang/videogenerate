<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Accessibility, ChevronRight, Keyboard, LoaderCircle, Monitor, QrCode, ScanSearch, Search, Smartphone, Unplug, X } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncResearchTask } from '@shared/cloud/sync'
import PageHeader from '@/components/PageHeader.vue'
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

<style scoped>
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
