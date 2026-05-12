<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronDown, Clock3, Grid2X2, LoaderCircle, MoreVertical, Play, Plus, Search, Trash2, Video, Wand2 } from 'lucide-vue-next'
import UiCard from '../components/UiCard.vue'
import UiButton from '../components/UiButton.vue'

type CloneProjectSummary = {
  id: string
  title: string
  description?: string
  archived?: boolean
  status: string
  createdAt: number
  updatedAt: number
  currentStep: string
  progressPercent: number
  referenceVideoName: string
  referenceVideoPath: string
  coverAssetPath: string
  previewOutputPath: string
  previewReportPath: string
  outputDir: string
  finalOutputPath: string
  selectedModelIdentityName: string
  productReferenceImageCount: number
  shotCount: number
  generatedImageCount: number
  generatedVideoCount: number
  lastError: string
}

const router = useRouter()
const loading = ref(false)
const creating = ref(false)
const removingId = ref('')
const rows = ref<CloneProjectSummary[]>([])
const query = ref('')
const statusFilter = ref<'all' | 'draft' | 'running' | 'ready_for_review' | 'completed' | 'failed'>('all')

const filteredRows = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return rows.value.filter((item) => {
    const statusText = String(item.status || '').toLowerCase()
    if (statusFilter.value === 'draft' && statusText !== 'draft') return false
    if (statusFilter.value === 'running' && !(statusText.includes('running') || statusText.includes('generating') || statusText === 'analyzed' || statusText === 'materials_ready')) return false
    if (statusFilter.value === 'ready_for_review' && statusText !== 'ready_for_review') return false
    if (statusFilter.value === 'completed' && !(statusText.includes('done') || statusText.includes('complete') || statusText === 'completed')) return false
    if (statusFilter.value === 'failed' && !(statusText.includes('fail') || statusText.includes('error'))) return false
    if (!keyword) return true
    const haystack = [item.title, item.description, item.referenceVideoName, item.selectedModelIdentityName, item.lastError].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(keyword)
  })
})

const stats = computed(() => ({
  all: rows.value.length,
  draft: rows.value.filter((item) => String(item.status || '').toLowerCase() === 'draft').length,
  running: rows.value.filter((item) => {
    const status = String(item.status || '').toLowerCase()
    return status.includes('running') || status.includes('generating') || status === 'analyzed' || status === 'materials_ready'
  }).length,
  completed: rows.value.filter((item) => {
    const status = String(item.status || '').toLowerCase()
    return status.includes('done') || status.includes('complete') || status === 'completed'
  }).length,
  failed: rows.value.filter((item) => {
    const status = String(item.status || '').toLowerCase()
    return status.includes('fail') || status.includes('error')
  }).length,
}))

const statusTabs = computed(() => [
  { key: 'all' as const, label: `全部 (${stats.value.all})` },
  { key: 'draft' as const, label: `草稿 (${stats.value.draft})` },
  { key: 'running' as const, label: `进行中 (${stats.value.running})` },
  { key: 'completed' as const, label: `已完成 (${stats.value.completed})` },
  { key: 'failed' as const, label: `失败 (${stats.value.failed})` },
])

const recentRows = computed(() => rows.value.slice().sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 4))

function humanStep(step?: string) {
  if (step === 'upload_analyze_script') return '分析参考视频'
  if (step === 'generate_script_variants' || step === 'select_script_variant') return '脚本生成'
  if (step === 'generate_storyboard_grids') return '分镜视频生成'
  if (step === 'generate_shot_videos' || step === 'review_replace_shots') return '脚本生成'
  if (step === 'compose_final_video' || step === 'export_final') return '成片合成'
  return '待开始'
}

function humanStatus(status?: string) {
  const text = String(status || '').toLowerCase()
  if (text === 'draft') return '草稿'
  if (text.includes('done') || text.includes('complete')) return '完成'
  if (text.includes('fail') || text.includes('error')) return '失败'
  if (text.includes('running') || text.includes('generating') || text === 'analyzed' || text === 'materials_ready') return '进行中'
  if (text === 'ready_for_review') return '待检查'
  return '进行中'
}

function statusTone(status?: string) {
  const text = String(status || '').toLowerCase()
  if (text.includes('done') || text.includes('complete')) return 'is-success'
  if (text.includes('fail') || text.includes('error')) return 'is-danger'
  if (text === 'draft') return 'is-draft'
  return 'is-running'
}

function stepTone(step?: string) {
  if (step === 'upload_analyze_script') return 'tone-analyze'
  if (step === 'generate_script_variants' || step === 'select_script_variant') return 'tone-script'
  if (step === 'generate_storyboard_grids') return 'tone-storyboard'
  if (step === 'generate_shot_videos' || step === 'review_replace_shots') return 'tone-video'
  if (step === 'compose_final_video' || step === 'export_final') return 'tone-compose'
  return 'tone-neutral'
}

function shortPath(input?: string) {
  const text = String(input || '').trim()
  if (!text) return '--'
  const parts = text.split(/[/\\]/).filter(Boolean)
  return parts.slice(-1)[0] || '--'
}

function toFileSrc(input?: string) {
  const text = String(input || '').trim()
  if (!text) return ''
  if (/^(https?:|data:|file:)/i.test(text)) return text
  return `file:///${text.replace(/\\/g, '/')}`
}

function formatTime(value?: number) {
  if (!value) return '--'
  const d = new Date(value)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function stepIndex(step?: string) {
  if (step === 'upload_analyze_script') return 0
  if (step === 'generate_script_variants' || step === 'select_script_variant') return 1
  if (step === 'generate_storyboard_grids') return 2
  if (step === 'generate_shot_videos' || step === 'review_replace_shots') return 3
  if (step === 'compose_final_video' || step === 'export_final') return 4
  return 0
}

async function refresh() {
  loading.value = true
  try {
    rows.value = (await window.api.clone.listProjectSummaries()) as CloneProjectSummary[]
  } finally {
    loading.value = false
  }
}

async function createTask() {
  if (creating.value) return
  creating.value = true
  try {
    const res = (await window.api.clone.createDraftProject({ locale: 'zh-CN', strength: 'structure' })) as { project?: { id?: string } }
    const id = String(res?.project?.id || '').trim()
    if (id) {
      void router.push(`/clone/${id}`)
      return
    }
    console.error('[clone-task-list] create-task-missing-id', res)
  } catch (error) {
    console.error('[clone-task-list] create-task-error', error)
  } finally {
    creating.value = false
  }
}

async function removeTask(id: string) {
  if (!id) return
  removingId.value = id
  try {
    await window.api.clone.removeProject({ cloneProjectId: id })
    await refresh()
  } finally {
    removingId.value = ''
  }
}

function openTask(id: string) {
  if (!id) return
  void router.push(`/clone/${id}`)
}

onMounted(refresh)
</script>

<template>
  <div class="clone-task-list-page">
    <section class="clone-task-list-shell">
      <div class="clone-task-list-main">
        <header class="clone-list-head">
          <div class="clone-list-head__copy">
            <div class="clone-list-head__title">
              <h1>爆款视频复刻</h1>
              <span class="clone-list-head__spark">✦</span>
            </div>
            <p>从参考视频到成片输出，AI 帮你高效复刻爆款内容</p>
          </div>
          <div class="clone-list-head__actions">
            <UiButton variant="secondary" disabled>
              批量导出
            </UiButton>
            <UiButton :disabled="creating" @click="createTask">
              <Plus class="h-4 w-4" />
              {{ creating ? '创建中...' : '新建任务' }}
            </UiButton>
          </div>
        </header>

        <section class="clone-list-filters">
          <div class="clone-list-tabs">
            <button
              v-for="tab in statusTabs"
              :key="tab.key"
              class="clone-list-tab"
              :class="{ 'is-active': statusFilter === tab.key }"
              type="button"
              @click="statusFilter = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>
          <div class="clone-list-toolbar">
            <button class="clone-list-sort" type="button">
              更新时间
              <ChevronDown class="h-4 w-4" />
            </button>
            <button class="clone-list-view" type="button" aria-label="卡片视图">
              <Grid2X2 class="h-4 w-4" />
            </button>
          </div>
        </section>

        <section class="clone-content-grid">
          <div class="clone-grid-main">
            <div v-if="filteredRows.length" class="clone-task-grid">
              <article v-for="item in filteredRows" :key="item.id" class="clone-task-card">
                <div class="clone-task-card__top">
                  <div class="clone-task-card__cover">
                    <img v-if="item.coverAssetPath" :src="toFileSrc(item.coverAssetPath)" :alt="item.title" />
                    <div v-else class="clone-task-card__cover-empty">
                      <Video class="h-7 w-7" />
                    </div>
                  </div>
                  <div class="clone-task-card__top-right">
                    <span class="clone-task-card__step-tag" :class="stepTone(item.currentStep)">
                      {{ humanStep(item.currentStep) }}
                    </span>
                    <button class="clone-task-card__more" type="button" aria-label="更多操作">
                      <MoreVertical class="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div class="clone-task-card__body">
                  <div class="clone-task-card__head">
                    <h3>{{ item.title }}</h3>
                    <span class="clone-task-card__status" :class="statusTone(item.status)">{{ humanStatus(item.status) }}</span>
                  </div>

                  <div class="clone-task-card__meta">
                    <span>模特：{{ item.selectedModelIdentityName || '未绑定' }}</span>
                    <span>素材：{{ item.productReferenceImageCount }} 张图片 / {{ item.generatedVideoCount || 0 }} 个视频</span>
                  </div>

                  <div class="clone-task-card__progress">
                    <strong>{{ item.progressPercent }}%</strong>
                  </div>
                  <div class="clone-task-card__track">
                    <span :style="{ width: `${item.progressPercent}%` }"></span>
                  </div>

                  <div class="clone-task-card__steps">
                    <span
                      v-for="(_, index) in 5"
                      :key="`${item.id}-${index}`"
                      class="clone-task-card__step"
                      :class="{ 'is-active': index === Math.max(0, Math.min(4, stepIndex(item.currentStep))), 'is-done': index < stepIndex(item.currentStep) }"
                    >
                      {{ index + 1 }}
                    </span>
                  </div>

                  <div class="clone-task-card__footer">
                    <div class="clone-task-card__time">
                      <Clock3 class="h-4 w-4" />
                      <span>{{ formatTime(item.updatedAt) }}</span>
                    </div>
                    <div class="clone-task-card__actions">
                      <button class="clone-task-card__action clone-task-card__action--play" type="button" @click="openTask(item.id)">
                        <Play class="h-4 w-4" />
                      </button>
                      <button class="clone-task-card__action clone-task-card__action--danger" type="button" :disabled="removingId === item.id" @click="removeTask(item.id)">
                        <Trash2 class="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <p v-if="item.lastError" class="clone-task-card__error">错误：{{ item.lastError }}</p>
                </div>
              </article>
            </div>

            <div v-else class="clone-list-empty">
              <LoaderCircle v-if="loading" class="h-5 w-5 is-spinning" />
              <Wand2 v-else class="h-5 w-5" />
              <strong>{{ loading ? '正在读取任务列表' : '还没有复刻任务' }}</strong>
              <span>{{ loading ? '请稍候...' : '点击右上角“新建任务”，创建第一个复刻项目。' }}</span>
            </div>

            <div class="clone-list-pagination">
              <span>共 {{ filteredRows.length }} 条任务</span>
              <div class="clone-list-pagination__controls">
                <button type="button" disabled>‹</button>
                <button type="button" class="is-active">1</button>
                <button type="button" disabled>›</button>
                <button type="button" class="clone-list-page-size">12 条/页</button>
              </div>
            </div>
          </div>

          <aside class="clone-task-list-side">
            <UiCard class="clone-side-card">
              <div class="clone-side-card__head">
                <strong>任务说明</strong>
                <small>右侧只保留轻量提示和最近切换列表，不再占用主业务高度。</small>
              </div>
              <div class="clone-side-feature-list">
                <article class="clone-side-feature">
                  <div class="clone-side-feature__icon tone-violet">◈</div>
                  <div>
                    <strong>后台持续运行</strong>
                    <span>任务在后台执行，离开列表页不会中断。</span>
                  </div>
                </article>
                <article class="clone-side-feature">
                  <div class="clone-side-feature__icon tone-purple">⌘</div>
                  <div>
                    <strong>详情页职责</strong>
                    <span>详情页负责脚本、分镜、视频、查错日志。</span>
                  </div>
                </article>
                <article class="clone-side-feature">
                  <div class="clone-side-feature__icon tone-cyan">⬢</div>
                  <div>
                    <strong>快捷入口</strong>
                    <span>状态筛选和最近切换可以快速回到待推进项目。</span>
                  </div>
                </article>
              </div>
            </UiCard>

            <UiCard class="clone-side-card clone-side-card--recent">
              <div class="clone-side-card__row">
                <strong>最近切换</strong>
                <button type="button" class="clone-side-clear">清空</button>
              </div>
              <div class="clone-recent-list">
                <button v-for="item in recentRows" :key="item.id" type="button" class="clone-recent-item" @click="openTask(item.id)">
                  <span class="clone-recent-item__thumb">
                    <img v-if="item.coverAssetPath" :src="toFileSrc(item.coverAssetPath)" :alt="item.title" />
                    <Video v-else class="h-4 w-4" />
                  </span>
                  <span class="clone-recent-item__copy">
                    <strong>{{ item.title }}</strong>
                    <em>{{ formatTime(item.updatedAt) }}</em>
                  </span>
                </button>
              </div>
              <button type="button" class="clone-side-all">查看全部任务 →</button>
            </UiCard>
          </aside>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.clone-task-list-page {
  min-height: 100%;
  padding: 18px 18px 24px;
  color: #eef3ff;
  background: transparent;
}

.clone-task-list-shell {
  background: transparent;
}

.clone-task-list-shell,
.clone-task-list-main,
.clone-list-head__copy,
.clone-content-grid,
.clone-grid-main,
.clone-side-feature-list,
.clone-recent-list {
  display: grid;
}

.clone-task-list-main {
  gap: 18px;
}

.clone-list-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-top: 2px;
}

.clone-list-head__copy {
  gap: 10px;
}

.clone-list-head__title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clone-list-head__title h1 {
  margin: 0;
  font-size: 30px;
  line-height: 1.15;
  font-weight: 800;
}

.clone-list-head__spark {
  color: #8f7cff;
  font-size: 18px;
}

.clone-list-head__copy p {
  margin: 0;
  color: #9aaccc;
  font-size: 15px;
}

.clone-list-head__actions,
.clone-list-filters,
.clone-list-tabs,
.clone-list-toolbar,
.clone-task-card__top,
.clone-task-card__top-right,
.clone-task-card__head,
.clone-task-card__footer,
.clone-task-card__actions,
.clone-list-pagination,
.clone-list-pagination__controls,
.clone-side-card__row,
.clone-recent-item {
  display: flex;
}

.clone-list-head__actions {
  align-items: center;
  gap: 12px;
}

.clone-list-filters {
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: -2px;
}

.clone-list-tabs {
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.clone-list-tab {
  min-height: 44px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(15, 24, 43, 0.92);
  color: #cad5f3;
  font-size: 14px;
}

.clone-list-tab.is-active {
  border-color: rgba(109, 93, 255, 0.48);
  background: linear-gradient(135deg, rgba(109, 93, 255, 0.95), rgba(133, 92, 246, 0.9));
  color: #fff;
  box-shadow: 0 14px 28px rgba(109, 93, 255, 0.2);
}

.clone-list-toolbar {
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.clone-list-sort,
.clone-list-view {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(13, 21, 38, 0.92);
  color: #d2dcf6;
  font-size: 14px;
}

.clone-list-view {
  width: 44px;
  padding: 0;
  color: #9f90ff;
}

.clone-content-grid {
  grid-template-columns: minmax(0, 1fr) 256px;
  gap: 16px;
  align-items: start;
  background: transparent;
}

.clone-grid-main {
  gap: 18px;
  background: transparent;
}

.clone-task-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.clone-task-card {
  display: grid;
  gap: 12px;
  min-height: 336px;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid rgba(118, 136, 196, 0.12);
  background:
    radial-gradient(circle at top right, rgba(109, 93, 255, 0.1), transparent 30%),
    linear-gradient(180deg, rgba(15, 23, 40, 0.98), rgba(10, 17, 30, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.clone-task-card__top {
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.clone-task-card__cover {
  width: 86px;
  height: 74px;
  overflow: hidden;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  flex: 0 0 auto;
}

.clone-task-card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.clone-task-card__cover-empty {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: #89a0c8;
}

.clone-task-card__top-right {
  align-items: flex-start;
  justify-content: flex-end;
  gap: 8px;
  flex: 1;
}

.clone-task-card__step-tag,
.clone-task-card__status {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.clone-task-card__step-tag.tone-analyze {
  background: rgba(59, 130, 246, 0.16);
  color: #a9c6ff;
}

.clone-task-card__step-tag.tone-script {
  background: rgba(52, 211, 153, 0.14);
  color: #8ce6bb;
}

.clone-task-card__step-tag.tone-storyboard {
  background: rgba(59, 130, 246, 0.16);
  color: #8cd2ff;
}

.clone-task-card__step-tag.tone-video {
  background: rgba(95, 122, 255, 0.18);
  color: #c7d1ff;
}

.clone-task-card__step-tag.tone-compose {
  background: rgba(34, 197, 94, 0.16);
  color: #86efac;
}

.clone-task-card__status.is-running {
  background: rgba(59, 130, 246, 0.16);
  color: #a9c6ff;
}

.clone-task-card__status.is-draft {
  background: rgba(148, 163, 184, 0.14);
  color: #d3d9e6;
}

.clone-task-card__status.is-success {
  background: rgba(34, 197, 94, 0.16);
  color: #86efac;
}

.clone-task-card__status.is-danger {
  background: rgba(239, 68, 68, 0.16);
  color: #fda4af;
}

.clone-task-card__more {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: #cbd5e1;
}

.clone-task-card__body {
  display: grid;
  gap: 10px;
  align-content: start;
}

.clone-task-card__head {
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.clone-task-card__head h3 {
  margin: 0;
  font-size: 18px;
  line-height: 1.3;
  font-weight: 800;
}

.clone-task-card__meta {
  display: grid;
  gap: 4px;
  color: #99a7c4;
  font-size: 13px;
  line-height: 1.45;
}

.clone-task-card__progress strong {
  font-size: 26px;
  line-height: 1;
}

.clone-task-card__track {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.clone-task-card__track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #7b61ff 0%, #3fb8ff 100%);
}

.clone-task-card__steps {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.clone-task-card__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin: 0 auto;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  color: #98a6c3;
  font-size: 12px;
}

.clone-task-card__step.is-active {
  border-color: rgba(109, 93, 255, 0.52);
  color: #fff;
  box-shadow: 0 0 0 3px rgba(109, 93, 255, 0.15);
}

.clone-task-card__step.is-done {
  border-color: rgba(34, 197, 94, 0.36);
  color: #86efac;
}

.clone-task-card__footer {
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.clone-task-card__time {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #9aa7c4;
  font-size: 12px;
}

.clone-task-card__actions {
  align-items: center;
  gap: 8px;
}

.clone-task-card__action {
  width: 38px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.clone-task-card__action--play {
  color: #7fb9ff;
}

.clone-task-card__action--danger {
  color: #ffb3bb;
}

.clone-task-card__error {
  margin: 0;
  color: #ffb1b8;
  font-size: 12px;
  line-height: 1.4;
}

.clone-list-empty {
  min-height: 320px;
  display: grid;
  place-items: center;
  gap: 6px;
  color: #97a5c4;
  text-align: center;
}

.clone-list-empty strong {
  color: #eef3ff;
  font-size: 14px;
}

.clone-list-pagination {
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  color: #93a2c0;
  font-size: 13px;
  padding-top: 6px;
}

.clone-list-pagination__controls {
  align-items: center;
  gap: 8px;
}

.clone-list-pagination__controls button {
  min-width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(12, 19, 34, 0.9);
  color: #c9d4f2;
}

.clone-list-pagination__controls button.is-active {
  background: linear-gradient(135deg, #6d5dff, #8b5cf6);
  color: #fff;
}

.clone-list-page-size {
  padding: 0 14px;
}

.clone-task-list-side {
  display: grid;
  gap: 18px;
  align-content: start;
}

.clone-side-card {
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(118, 136, 196, 0.14);
  background:
    radial-gradient(circle at top right, rgba(109, 93, 255, 0.08), transparent 34%),
    linear-gradient(180deg, rgba(12, 20, 36, 0.98), rgba(9, 15, 27, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.clone-side-card__head {
  display: grid;
  gap: 10px;
  margin-bottom: 16px;
}

.clone-side-card__head strong,
.clone-side-card__row strong {
  font-size: 13px;
}

.clone-side-card__head small {
  color: #96a6c5;
  font-size: 12px;
  line-height: 1.6;
}

.clone-side-feature-list {
  gap: 14px;
}

.clone-side-feature {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.025);
}

.clone-side-feature__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  font-size: 14px;
}

.clone-side-feature__icon.tone-violet {
  color: #d7c7ff;
  background: rgba(139, 92, 246, 0.16);
}

.clone-side-feature__icon.tone-purple {
  color: #d9ccff;
  background: rgba(109, 93, 255, 0.16);
}

.clone-side-feature__icon.tone-cyan {
  color: #9fe8ff;
  background: rgba(34, 211, 238, 0.16);
}

.clone-side-feature strong {
  display: block;
  font-size: 13px;
  margin-bottom: 4px;
}

.clone-side-feature span {
  color: #96a6c5;
  font-size: 12px;
  line-height: 1.5;
}

.clone-side-card__row {
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.clone-side-clear {
  color: #8f7cff;
  font-size: 12px;
}

.clone-recent-list {
  gap: 12px;
}

.clone-recent-item {
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.025);
  text-align: left;
}

.clone-recent-item__thumb {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: #8fa1c8;
  flex: 0 0 auto;
}

.clone-recent-item__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.clone-recent-item__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.clone-recent-item__copy strong,
.clone-recent-item__copy em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clone-recent-item__copy strong {
  color: #eef3ff;
  font-size: 12px;
  font-style: normal;
}

.clone-recent-item__copy em {
  color: #96a6c5;
  font-size: 11px;
  font-style: normal;
}

.clone-side-all {
  width: 100%;
  min-height: 50px;
  margin-top: 16px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: #d8e0f1;
  font-size: 14px;
}

.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1500px) {
  .clone-task-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1320px) {
  .clone-content-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .clone-task-list-side {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1180px) {
  .clone-list-filters {
    flex-direction: column;
    align-items: stretch;
  }

  .clone-list-toolbar {
    justify-content: flex-start;
  }

  .clone-task-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .clone-list-head,
  .clone-list-head__actions,
  .clone-list-pagination {
    flex-direction: column;
    align-items: stretch;
  }

  .clone-task-grid,
  .clone-task-list-side {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
