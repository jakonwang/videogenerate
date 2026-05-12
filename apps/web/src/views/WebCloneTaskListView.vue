<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { type CloneProjectSummary, webApiClient } from '../services/webApi'

const router = useRouter()
const loading = ref(false)
const creating = ref(false)
const rows = ref<CloneProjectSummary[]>([])
const query = ref('')

const filteredRows = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return rows.value
  return rows.value.filter((item) =>
    [item.title, item.description, item.referenceVideoName, item.selectedModelIdentityName, item.lastError]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword),
  )
})

const stats = computed(() => {
  const items = rows.value
  return {
    total: items.length,
    running: items.filter((item) =>
      ['analyzing', 'generating', 'processing', 'running'].some((key) =>
        String(item.status || '').toLowerCase().includes(key),
      ),
    ).length,
    completed: items.filter((item) =>
      ['done', 'completed', 'success'].some((key) => String(item.status || '').toLowerCase().includes(key)),
    ).length,
    draft: items.filter((item) => item.progressPercent <= 10).length,
  }
})

function humanStep(step?: string) {
  if (step === 'upload_analyze_script') return '参考分析'
  if (step === 'generate_script_variants' || step === 'select_script_variant') return '脚本变体'
  if (step === 'generate_storyboard_grids') return '分镜图片'
  if (step === 'generate_shot_videos' || step === 'review_replace_shots') return '分镜视频'
  if (step === 'compose_final_video' || step === 'export_final') return '最终成片'
  return '待开始'
}

function statusTone(status?: string) {
  const value = String(status || '').toLowerCase()
  if (['done', 'completed', 'success'].some((key) => value.includes(key))) return 'is-success'
  if (['failed', 'error'].some((key) => value.includes(key))) return 'is-danger'
  if (['analyzing', 'generating', 'processing', 'running'].some((key) => value.includes(key))) return 'is-running'
  return 'is-idle'
}

async function refresh() {
  loading.value = true
  try {
    rows.value = await webApiClient.listCloneProjects()
  } finally {
    loading.value = false
  }
}

async function createTask() {
  if (creating.value) return
  creating.value = true
  try {
    const result = await webApiClient.createCloneProject({
      locale: 'zh-CN',
    })
    if (result.project?.id) {
      await router.push(`/clone/${result.project.id}`)
    }
  } finally {
    creating.value = false
  }
}

async function removeTask(projectId: string) {
  await webApiClient.removeCloneProject(projectId)
  await refresh()
}

onMounted(refresh)
</script>

<template>
  <section class="task-list-page">
    <header class="web-card page-hero">
      <div class="page-hero__copy">
        <span class="page-tag">Clone Tasks</span>
        <h1>复刻任务列表</h1>
        <p>统一管理浏览器端的爆款复刻任务，支持多任务进入、续跑、检查和删除。</p>
      </div>
      <div class="page-hero__actions">
        <button class="web-button web-button--ghost" type="button" @click="refresh">
          {{ loading ? '刷新中...' : '刷新列表' }}
        </button>
        <button class="web-button web-button--lg" type="button" :disabled="creating" @click="createTask">
          {{ creating ? '创建中...' : '新建复刻任务' }}
        </button>
      </div>
    </header>

    <section class="task-stats">
      <article class="web-card stat-card">
        <span>任务总数</span>
        <strong>{{ stats.total }}</strong>
      </article>
      <article class="web-card stat-card">
        <span>运行中</span>
        <strong>{{ stats.running }}</strong>
      </article>
      <article class="web-card stat-card">
        <span>已完成</span>
        <strong>{{ stats.completed }}</strong>
      </article>
      <article class="web-card stat-card">
        <span>草稿</span>
        <strong>{{ stats.draft }}</strong>
      </article>
    </section>

    <section class="web-card task-toolbar">
      <div class="task-toolbar__copy">
        <strong>任务检索</strong>
        <small>按任务标题、参考视频、模特或错误信息搜索当前列表。</small>
      </div>
      <input
        v-model="query"
        class="web-input task-toolbar__search"
        type="text"
        placeholder="搜索任务标题、参考视频、模特或错误信息"
      />
    </section>

    <section class="web-card task-board">
      <div class="task-board__head">
        <span>任务</span>
        <span>阶段与状态</span>
        <span>素材概览</span>
        <span>进度</span>
        <span>操作</span>
      </div>

      <div v-if="filteredRows.length" class="task-board__body">
        <article v-for="item in filteredRows" :key="item.id" class="task-item">
          <div class="task-item__main">
            <strong>{{ item.title }}</strong>
            <small>{{ item.description || item.referenceVideoName || '尚未上传参考视频' }}</small>
            <em v-if="item.lastError">{{ item.lastError }}</em>
          </div>

          <div class="task-item__stage">
            <span class="status-chip" :class="statusTone(item.status)">{{ item.status || 'draft' }}</span>
            <strong>{{ humanStep(item.currentStep) }}</strong>
            <small>{{ new Date(item.updatedAt).toLocaleString('zh-CN', { hour12: false }) }}</small>
          </div>

          <div class="task-item__assets">
            <span>模特：{{ item.selectedModelIdentityName || '未绑定' }}</span>
            <span>商品图：{{ item.productReferenceImageCount }} 张</span>
            <span>分镜：{{ item.shotCount }} 镜</span>
            <span>图片 / 视频：{{ item.generatedImageCount }} / {{ item.generatedVideoCount }}</span>
          </div>

          <div class="task-item__progress">
            <div class="progress-track">
              <span :style="{ width: `${item.progressPercent}%` }"></span>
            </div>
            <strong>{{ item.progressPercent }}%</strong>
          </div>

          <div class="task-item__actions">
            <button class="web-button web-button--ghost" type="button" @click="router.push(`/clone/${item.id}`)">
              进入任务
            </button>
            <button class="web-button web-button--ghost" type="button" @click="removeTask(item.id)">
              删除任务
            </button>
          </div>
        </article>
      </div>

      <div v-else class="task-empty">
        <strong>{{ loading ? '正在加载任务...' : '还没有复刻任务' }}</strong>
        <span>{{ loading ? '请稍候。' : '点击右上角“新建复刻任务”，创建第一条浏览器复刻任务。' }}</span>
      </div>
    </section>
  </section>
</template>

<style scoped>
.task-list-page {
  display: grid;
  gap: 12px;
}

.page-hero,
.task-toolbar,
.task-board {
  padding: 16px;
}

.page-hero {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.page-hero__copy,
.task-toolbar__copy {
  display: grid;
  gap: 4px;
}

.page-hero__copy h1,
.page-hero__copy p {
  margin: 0;
}

.page-hero__copy h1 {
  font-size: 30px;
  line-height: 1.14;
}

.page-hero__copy p,
.task-toolbar__copy small,
.stat-card span,
.task-board__head,
.task-item__main small,
.task-item__stage small,
.task-item__assets span,
.task-empty span {
  color: var(--web-text-soft);
  font-size: 12px;
  line-height: 1.6;
}

.page-hero__actions {
  display: flex;
  gap: 8px;
}

.task-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stat-card {
  padding: 14px 16px;
  display: grid;
  gap: 6px;
}

.stat-card strong {
  font-size: 28px;
  line-height: 1;
}

.task-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 420px);
  gap: 16px;
  align-items: center;
}

.task-toolbar__search {
  justify-self: end;
}

.task-board {
  display: grid;
  gap: 12px;
}

.task-board__head,
.task-item {
  display: grid;
  grid-template-columns: 1.3fr 0.9fr 1fr 0.8fr 0.8fr;
  gap: 14px;
  align-items: center;
}

.task-board__head {
  padding: 0 2px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.task-board__body {
  display: grid;
  gap: 10px;
}

.task-item {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.02));
}

.task-item__main,
.task-item__stage,
.task-item__assets,
.task-item__progress {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.task-item__main strong,
.task-item__stage strong,
.task-item__progress strong {
  color: #f2f6ff;
}

.task-item__main em {
  color: #ff9ab0;
  font-size: 12px;
  line-height: 1.5;
  font-style: normal;
}

.task-item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.progress-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #7c3aed, #00d7ff);
}

.status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.04);
}

.status-chip.is-success {
  color: #7ef3ba;
  border-color: rgba(97, 227, 154, 0.2);
  background: rgba(97, 227, 154, 0.08);
}

.status-chip.is-danger {
  color: #ff9db4;
  border-color: rgba(255, 140, 167, 0.2);
  background: rgba(255, 140, 167, 0.08);
}

.status-chip.is-running {
  color: #93edff;
  border-color: rgba(0, 232, 255, 0.2);
  background: rgba(0, 232, 255, 0.08);
}

.task-empty {
  padding: 16px;
  display: grid;
  gap: 6px;
  justify-items: center;
  text-align: center;
}

@media (max-width: 1180px) {
  .task-stats,
  .task-toolbar,
  .task-board__head,
  .task-item {
    grid-template-columns: 1fr;
  }

  .page-hero {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
