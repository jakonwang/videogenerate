<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Box, CheckSquare, Film, Layers3, PackagePlus, Sparkles, UploadCloud } from 'lucide-vue-next'

type TemplateLite = { id: string; name: string }
type VideoTaskLite = {
  id: string
  status: 'queued' | 'running' | 'paused' | 'done' | 'error' | 'skipped' | 'cancelled'
  outPath: string
  progress: number
  createdAt: number
}

const router = useRouter()
const templates = ref<TemplateLite[]>([])
const tasks = ref<VideoTaskLite[]>([])
const loading = ref(false)

const recentTasks = computed(() =>
  [...tasks.value].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 3),
)
const topTemplates = computed(() => templates.value.slice(0, 3))

function basename(p: string) {
  return (p ?? '').split(/[/\\]/).pop() ?? p
}

function formatTime(ts: number) {
  if (!ts) return '刚刚'
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (sameDay) return `今天 ${hh}:${mm}`
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hh}:${mm}`
}

function statusText(status: VideoTaskLite['status']) {
  if (status === 'done') return '已完成'
  if (status === 'error' || status === 'cancelled') return '失败'
  if (status === 'running' || status === 'queued') return '生成中'
  if (status === 'paused') return '已暂停'
  return '等待中'
}

function statusClass(status: VideoTaskLite['status']) {
  if (status === 'done') return 'is-done'
  if (status === 'error' || status === 'cancelled') return 'is-error'
  return 'is-running'
}

function progressValue(item: VideoTaskLite) {
  return Math.max(0, Math.min(100, Math.round((item.progress || 0) * 100)))
}

function go(path: string) {
  void router.push(path)
}

async function refresh() {
  loading.value = true
  try {
    templates.value = await window.api.templates.list()
    tasks.value = await window.api.tasks.list()
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="home-dashboard">
    <section class="home-dashboard-hero">
      <div class="home-hero-copy">
        <h1>欢迎回来，Creator 👋</h1>
        <p>选择一条视频工作流，从素材、复刻或切片开始生产。</p>
        <button class="home-hero-button" @click="go('/products')">
          <Sparkles class="h-5 w-5" />
          开始生成视频
        </button>
      </div>
      <div class="home-hero-visual" aria-hidden="true">
        <div class="home-orbit home-orbit-a"></div>
        <div class="home-orbit home-orbit-b"></div>
        <div class="home-play-pin">
          <div class="home-play-triangle"></div>
        </div>
        <div class="home-hero-base"></div>
        <span class="home-dot dot-a"></span>
        <span class="home-dot dot-b"></span>
        <span class="home-dot dot-c"></span>
      </div>
    </section>

    <section class="home-quick-grid">
      <button class="home-quick-card" @click="go('/products')">
        <span class="home-quick-icon is-purple"><Box class="h-8 w-8" /></span>
        <span class="home-quick-copy">
          <strong>新建产品</strong>
          <small>创建产品，管理素材与模板</small>
        </span>
        <ArrowRight class="home-arrow h-6 w-6" />
      </button>

      <button class="home-quick-card" @click="go('/clone')">
        <span class="home-quick-icon is-green"><UploadCloud class="h-8 w-8" /></span>
        <span class="home-quick-copy">
          <strong>上传爆款视频</strong>
          <small>上传参考视频，AI 拆解结构</small>
        </span>
        <ArrowRight class="home-arrow h-6 w-6" />
      </button>

      <button class="home-quick-card" @click="go('/tasks')">
        <span class="home-quick-icon is-gold"><Layers3 class="h-8 w-8" /></span>
        <span class="home-quick-copy">
          <strong>批量任务</strong>
          <small>批量生成多个视频</small>
        </span>
        <ArrowRight class="home-arrow h-6 w-6" />
      </button>
    </section>

    <section class="home-bottom-grid">
      <div class="home-panel">
        <div class="home-panel-head">
          <h2>最近任务</h2>
          <button @click="go('/tasks')">查看全部</button>
        </div>

        <div v-if="!recentTasks.length && !loading" class="home-empty">
          暂无任务记录。进入产品页选择素材和模板后即可开始批量生成。
        </div>
        <div v-else class="home-list">
          <article v-for="(item, idx) in recentTasks" :key="item.id" class="home-task-row">
            <div class="home-thumb" :class="`thumb-${idx + 1}`">
              <Film class="h-5 w-5" />
            </div>
            <div class="home-row-main">
              <strong>{{ basename(item.outPath) || item.id }}</strong>
              <small>{{ formatTime(item.createdAt) }}</small>
            </div>
            <div class="home-progress">
              <span :class="statusClass(item.status)" :style="{ width: progressValue(item) + '%' }"></span>
            </div>
            <div class="home-percent">{{ progressValue(item) }}%</div>
            <div class="home-status" :class="statusClass(item.status)">{{ statusText(item.status) }}</div>
          </article>
        </div>
      </div>

      <div class="home-panel">
        <div class="home-panel-head">
          <h2>最近模板</h2>
          <button @click="go('/templates')">查看全部</button>
        </div>

        <div v-if="!topTemplates.length && !loading" class="home-empty">
          暂无模板。可以从爆款视频分析生成模板，也可以在模板页手动新建。
        </div>
        <div v-else class="home-list">
          <article v-for="(item, idx) in topTemplates" :key="item.id" class="home-template-row">
            <div class="home-template-thumb" :class="`template-${idx + 1}`">
              <PackagePlus class="h-5 w-5" />
            </div>
            <div class="home-row-main">
              <strong>{{ item.name }}</strong>
              <div class="home-tags">
                <span>Hook</span>
                <span>Show</span>
                <span>Detail</span>
                <span>CTA</span>
              </div>
            </div>
            <div class="home-used">使用 {{ 128 - idx * 42 }} 次</div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>
