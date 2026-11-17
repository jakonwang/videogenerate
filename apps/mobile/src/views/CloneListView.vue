<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, Copy, LoaderCircle, Plus } from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import PageHeader from '@/components/PageHeader.vue'
import { createProject, useCloneProjects, type CloneProjectItem } from '@/lib/clone'
import { relativeTime } from '@/lib/library'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'

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
      <p class="m-muted small note">支持 3 分钟以内、200MB 以内的视频，从相册选择。</p>
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
        <span class="m-empty__text">先在 TikTok / 抖音保存一条想模仿的爆款视频，再从相册选它</span>
      </div>
    </section>
  </main>
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
