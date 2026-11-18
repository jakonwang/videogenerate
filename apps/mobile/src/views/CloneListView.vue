<script setup lang="ts">
import { isWeb } from '@/lib/platform'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, Copy, LoaderCircle, Plus } from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import PageHeader from '@/components/PageHeader.vue'
import { createProject, useCloneProjects, type CloneProjectItem } from '@/lib/clone'
import { relativeTime } from '@/lib/library'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'
import { useInWebShell } from '@/lib/layout'
import WebStep from '@/components/web/WebStep.vue'
import WebResults from '@/components/web/WebResults.vue'
import { computed } from 'vue'
import { Search } from 'lucide-vue-next'
type CloneFilter = 'all' | 'analyzing' | 'working' | 'done' | 'failed'
const cloneFilter = ref<CloneFilter>('all')
const cloneQuery = ref('')
function cloneKey(project: CloneProjectItem): Exclude<CloneFilter, 'all'> {
  if (project.finalFileId) return 'done'
  if (project.analyzeStatus === 'failed' || project.composeStatus === 'failed') return 'failed'
  if (project.analyzeStatus !== 'succeeded') return 'analyzing'
  return 'working'
}
const cloneStats = computed(() => {
  const count = (key: CloneFilter) => (key === 'all' ? projects.value.length : projects.value.filter((p) => cloneKey(p) === key).length)
  return [
    { key: 'all' as const, label: '全部任务', hint: '总任务数', count: count('all') },
    { key: 'analyzing' as const, label: '拆解中', hint: 'AI 正在拆分镜', count: count('analyzing') },
    { key: 'working' as const, label: '制作中', hint: '生成分镜与视频', count: count('working') },
    { key: 'done' as const, label: '已出片', hint: '成片已合成', count: count('done') },
    { key: 'failed' as const, label: '失败任务', hint: '需要重试', count: count('failed') },
  ]
})
const shownProjects = computed(() => {
  const word = cloneQuery.value.trim().toLowerCase()
  return projects.value.filter((p) => (cloneFilter.value === 'all' || cloneKey(p) === cloneFilter.value) && (!word || `${p.name} ${p.productName || ''}`.toLowerCase().includes(word)))
})
const inWebShell = useInWebShell()

const router = useRouter()
const projects = useCloneProjects()
const input = ref<HTMLInputElement>()
const uploading = ref(false)
const locale = ref<'zh-CN' | 'en-US' | 'vi-VN'>('zh-CN')

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  uploading.value = true
  try {
    const id = await createProject(file, locale.value)
    router.push(`/clone/${id}`)
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    uploading.value = false
  }
}

function statusOf(project: CloneProjectItem) {
  if (project.finalFileId) return { label: '已出片', tone: 'green' }
  if (project.composeStatus === 'running' || project.composeStatus === 'queued') return { label: '合成中', tone: 'blue' }
  if (project.analyzeStatus === 'failed') return { label: '拆解失败', tone: 'red' }
  if (project.analyzeStatus !== 'succeeded') return { label: '拆解中', tone: 'blue' }
  return { label: '制作中', tone: 'amber' }
}
</script>

<template>
  <template v-if="inWebShell">
    <PageHeader title="爆款视频复刻" description="复刻参考视频并生成可管理的项目成片：拆分镜 → 换商品 → 逐镜生成 → 按原片节奏合成。">
      <template #actions>
        <select v-model="locale" class="vg-select vg-select--sm" title="脚本语言">
          <option value="zh-CN">脚本：中文</option>
          <option value="en-US">脚本：English</option>
          <option value="vi-VN">脚本：Tiếng Việt</option>
        </select>
        <button type="button" class="vg-btn vg-btn--primary" data-testid="web-clone-new" :disabled="uploading" @click="input?.click()">
          <LoaderCircle v-if="uploading" :size="15" class="vg-spin" /><Plus v-else :size="15" /> {{ uploading ? '正在上传…' : '新建任务' }}
        </button>
      </template>
    </PageHeader>
    <main class="vg-page cl" data-testid="web-clone-list">
      <input ref="input" type="file" accept="video/*" hidden @change="onFile" />
      <div class="cl-stats">
        <button v-for="stat in cloneStats" :key="stat.key" type="button" class="cl-stat" :class="{ 'is-active': cloneFilter === stat.key }" @click="cloneFilter = stat.key">
          <span class="cl-stat__label"><span class="cl-dot" :class="`cl-dot--${stat.key}`"></span>{{ stat.label }}</span>
          <strong>{{ stat.count }}</strong>
          <small>{{ stat.hint }}</small>
        </button>
      </div>
      <div class="cl-bar">
        <span class="vg-section-title">{{ cloneStats.find((s) => s.key === cloneFilter)?.label }} <small>{{ shownProjects.length }} 个</small></span>
        <span class="vg-toolbar__spacer"></span>
        <label class="vg-search cl-search"><Search :size="14" /><input v-model="cloneQuery" class="vg-input vg-input--sm" placeholder="搜索任务、商品名称" /></label>
      </div>

      <div v-if="shownProjects.length" class="cl-grid">
        <button v-for="project in shownProjects" :key="project.id" type="button" class="cl-card" @click="router.push(`/clone/${project.id}`)">
          <span class="cl-card__media">
            <CloudImage v-if="project.analysis?.shots[0]?.frameFileId" :file-id="project.analysis?.shots[0]?.frameFileId" />
            <Copy v-else :size="26" />
            <span class="vg-pill vg-pill--dot cl-card__status" :class="`vg-pill--${statusOf(project).tone}`">{{ statusOf(project).label }}</span>
          </span>
          <span class="cl-card__body">
            <strong>{{ project.name }}</strong>
            <small>{{ project.analysis ? `${project.analysis.shots.length} 个分镜` : '等待拆解' }}<template v-if="project.productName"> · {{ project.productName }}</template></small>
            <span class="cl-card__foot"><span>{{ relativeTime(project.updatedAt) }}</span><ChevronRight :size="14" /></span>
          </span>
        </button>
      </div>
      <div v-else class="vg-empty cl-empty">
        <span class="vg-empty__icon"><Copy :size="22" /></span>
        <h3>{{ projects.length ? '没有符合条件的任务' : '还没有复刻任务' }}</h3>
        <p>点「新建任务」或把一条对标视频拖到这里（3 分钟、200MB 以内），AI 会自动拆解。</p>
        <button v-if="!projects.length" type="button" class="vg-btn vg-btn--primary" :disabled="uploading" @click="input?.click()"><Plus :size="14" /> 新建任务</button>
      </div>
    </main>
  </template>
  <template v-else>
  <PageHeader title="复刻" back="/create" />
  <main class="m-page m-page--no-tabs">
    <section class="intro m-card">
      <span class="intro__icon"><Copy :size="24" /></span>
      <div>
        <strong>照着爆款，拍你的商品</strong>
        <p>上传一条对标视频，AI 拆成分镜，换成你的商品逐镜生成，再按原片节奏合成成片。</p>
      </div>
    </section>

    <section class="m-section">
      <div class="m-field">
        <span class="m-field__label">脚本语言</span>
        <div class="chips">
          <button v-for="[value, label] in [['zh-CN', '中文'], ['en-US', 'English'], ['vi-VN', 'Tiếng Việt']] as const" :key="value" type="button" class="m-chip" :class="{ 'is-active': locale === value }" @click="locale = value">{{ label }}</button>
        </div>
      </div>
      <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="uploading" @click="input?.click()">
        <LoaderCircle v-if="uploading" :size="18" class="m-spin" /><Plus v-else :size="18" />
        {{ uploading ? '正在上传视频…' : '选一条对标视频开始' }}
      </button>
      <p class="m-muted small note">支持 3 分钟以内、200MB 以内的视频，{{ isWeb ? '点击选择或直接拖进来' : '从相册选择' }}。</p>
      <input ref="input" type="file" accept="video/*" hidden @change="onFile" />
    </section>

    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">我的复刻</h2><span class="m-muted small">{{ projects.length }} 个</span></div>
      <div v-if="projects.length" class="m-card m-list">
        <button v-for="project in projects" :key="project.id" type="button" class="m-row" @click="router.push(`/clone/${project.id}`)">
          <span class="thumb"><CloudImage :file-id="project.analysis?.shots[0]?.frameFileId" /></span>
          <span class="m-row__main">
            <span class="m-row__title">{{ project.name }}</span>
            <span class="m-row__sub">{{ project.analysis ? `${project.analysis.shots.length} 个分镜` : '等待拆解' }}<template v-if="project.productName"> · {{ project.productName }}</template> · {{ relativeTime(project.updatedAt) }}</span>
          </span>
          <span class="m-badge" :class="`m-badge--${statusOf(project).tone}`">{{ statusOf(project).label }}</span>
          <ChevronRight :size="18" class="m-muted" />
        </button>
      </div>
      <div v-else class="m-card m-empty">
        <span class="m-empty__title">还没有复刻项目</span>
        <span class="m-empty__text">先保存一条想模仿的爆款视频，再{{ isWeb ? '上传或拖到这里' : '从相册选它' }}</span>
      </div>
    </section>
  </main>
  </template>
</template>

<style scoped>
.intro { display: flex; align-items: center; gap: 14px; padding: 16px; background: linear-gradient(140deg, color-mix(in srgb, var(--m-accent) 14%, var(--theme-panel)), var(--theme-panel) 70%); }
.intro__icon { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: var(--m-accent-soft); color: var(--m-accent-2); }
.intro strong { font-size: 16px; }
.intro p { margin: 4px 0 0; color: var(--theme-text-muted); font-size: 13px; line-height: 1.5; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.small { font-size: 12px; }
.note { margin: 10px 2px 0; }
.thumb { flex: none; width: 44px; height: 64px; border-radius: 8px; overflow: hidden; }
</style>
