<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

type VideoTask = {
  id: string
  createdAt: number
  productId: string
  templateId: string
  outDir: string
  outPath: string
  status: 'queued' | 'running' | 'paused' | 'done' | 'error' | 'skipped' | 'cancelled'
  progress: number
  reportPath?: string
  error?: string
  logs: string[]
}

const route = useRoute()
const router = useRouter()
const task = ref<VideoTask | null>(null)

const progressLabel = computed(() => `${Math.round(Number(task.value?.progress ?? 0) * 100)}%`)

async function refresh() {
  const taskId = String(route.params.taskId || '').trim()
  const list = (await window.api.tasks.list()) as VideoTask[]
  task.value = list.find((item) => item.id === taskId) ?? null
}

async function showInFolder(path: string) {
  if (!path) return
  await window.api.shell.showItemInFolder(path)
}

async function openPath(path: string) {
  if (!path) return
  await window.api.shell.openPath(path)
}

onMounted(refresh)
</script>

<template>
  <div class="task-detail-page">
    <section class="task-detail-hero">
      <div class="task-detail-hero__copy">
        <span class="task-detail-hero__tag">生产 / 任务详情</span>
        <h1>{{ task ? `任务 ${task.id.slice(0, 8)}` : '未找到任务' }}</h1>
        <p>这里统一处理任务日志、失败原因、输出文件和报告，不再放在任务列表页里。</p>
      </div>
      <button class="app-ghost px-4 py-2 text-sm" @click="router.push('/production/tasks')">返回任务列表</button>
    </section>

    <section v-if="task" class="task-detail-card">
      <div class="task-detail-grid">
        <div class="task-detail-metric">
          <span>状态</span>
          <strong>{{ task.status }}</strong>
        </div>
        <div class="task-detail-metric">
          <span>进度</span>
          <strong>{{ progressLabel }}</strong>
        </div>
        <div class="task-detail-metric">
          <span>输出目录</span>
          <strong>{{ task.outDir || '-' }}</strong>
        </div>
      </div>

      <div v-if="task.error" class="task-detail-error">
        <strong>错误详情</strong>
        <p>{{ task.error }}</p>
      </div>

      <div class="task-detail-actions">
        <button class="app-ghost px-4 py-2 text-sm" :disabled="!task.outPath" @click="showInFolder(task.outPath)">定位输出文件</button>
        <button class="app-ghost px-4 py-2 text-sm" :disabled="!task.reportPath" @click="openPath(task.reportPath || '')">打开报告</button>
        <button class="app-ghost px-4 py-2 text-sm" :disabled="!task.outDir" @click="openPath(task.outDir)">打开输出目录</button>
      </div>

      <div class="task-detail-logs">
        <div class="task-detail-section__head">
          <strong>运行日志</strong>
          <button class="app-ghost px-3 py-2 text-xs" @click="refresh">刷新</button>
        </div>
        <div class="task-log-list">
          <div v-if="!task.logs.length" class="task-log-empty">暂无日志</div>
          <pre v-for="(log, index) in task.logs" :key="`${task.id}-${index}`" class="task-log-item">{{ log }}</pre>
        </div>
      </div>
    </section>

    <section v-else class="task-detail-card task-detail-card--empty">
      <p>当前任务不存在，可能已被清理或尚未写入本地队列。</p>
    </section>
  </div>
</template>

<style scoped>
.task-detail-page {
  display: grid;
  gap: 14px;
}

.task-detail-hero,
.task-detail-card {
  border: 1px solid rgba(119, 137, 198, 0.14);
  background: rgba(10, 16, 29, 0.92);
  border-radius: 18px;
}

.task-detail-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
}

.task-detail-hero__copy {
  display: grid;
  gap: 6px;
}

.task-detail-hero__tag {
  color: #8ea6ff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.task-detail-hero__copy h1 {
  margin: 0;
  color: #f8fbff;
  font-size: 24px;
  font-weight: 800;
}

.task-detail-hero__copy p,
.task-detail-metric span,
.task-detail-error p,
.task-log-empty,
.task-detail-card--empty p {
  margin: 0;
  color: #98a6c7;
  font-size: 12px;
  line-height: 1.5;
}

.task-detail-card {
  display: grid;
  gap: 18px;
  padding: 18px;
}

.task-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.task-detail-metric {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.025);
}

.task-detail-metric strong,
.task-detail-error strong,
.task-detail-section__head strong {
  color: #eef3ff;
}

.task-detail-error {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(248, 113, 113, 0.2);
  background: rgba(239, 68, 68, 0.08);
}

.task-detail-actions,
.task-detail-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.task-log-list {
  display: grid;
  gap: 8px;
}

.task-log-item {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.025);
  color: #d8e2fb;
  font-size: 12px;
}

.task-detail-card--empty {
  place-items: center;
}

@media (max-width: 900px) {
  .task-detail-grid,
  .task-detail-actions,
  .task-detail-hero {
    grid-template-columns: 1fr;
    display: grid;
  }
}
</style>
