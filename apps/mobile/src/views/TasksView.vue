<script setup lang="ts">
import { isWeb } from '@/lib/platform'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertCircle, ChevronRight, LoaderCircle, Trash2 } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { refreshPending, startPolling } from '@/lib/generate'
import { relativeTime } from '@/lib/library'
import { removeTask, useTasks, type TaskEntry } from '@/lib/tasks'
import { startToolPolling } from '@/lib/videoTools'
import { toast } from '@/lib/toast'
import { useInWebShell } from '@/lib/layout'
import WebStep from '@/components/web/WebStep.vue'
import WebResults from '@/components/web/WebResults.vue'
const inWebShell = useInWebShell()

/** 任务中心：各模块正在跑和失败的任务 */

const router = useRouter()
const tasks = useTasks()
const tab = ref<'running' | 'failed'>('running')
const running = computed(() => tasks.value.filter((task) => task.state === 'running'))
const failed = computed(() => tasks.value.filter((task) => task.state === 'failed'))
const shown = computed(() => (tab.value === 'running' ? running.value : failed.value))

onMounted(() => {
  if (!running.value.length && failed.value.length) tab.value = 'failed'
  // 打开页面时顺便刷新一次进度
  void refreshPending().catch(() => undefined)
  startPolling()
  startToolPolling()
})

async function remove(task: TaskEntry) {
  await removeTask(task)
  toast('已删除')
}
</script>

<template>
  <template v-if="inWebShell">
    <PageHeader title="任务中心" description="生成、复刻、视频工具和选品任务汇总。任务在云端运行，关掉网页也会继续。" />
    <main class="vg-page tk" data-testid="web-tasks">
      <div class="tk-bar">
        <nav class="rv-tabs">
          <button type="button" class="rv-tab" :class="{ 'is-active': tab === 'running' }" @click="tab = 'running'"><LoaderCircle :size="13" /> 进行中 <span class="rv-tab__count">{{ running.length }}</span></button>
          <button type="button" class="rv-tab" :class="{ 'is-active': tab === 'failed' }" @click="tab = 'failed'"><AlertCircle :size="13" /> 失败 <span class="rv-tab__count">{{ failed.length }}</span></button>
        </nav>
      </div>
      <div v-if="shown.length" class="vg-table-wrap tk-table">
        <table class="vg-table">
          <thead><tr><th style="width: 96px">状态</th><th>任务</th><th style="width: 130px">模块</th><th>详情</th><th style="width: 120px">时间</th><th style="width: 120px"></th></tr></thead>
          <tbody>
            <tr v-for="task in shown" :key="task.key">
              <td><span class="vg-pill vg-pill--dot" :class="task.state === 'running' ? 'vg-pill--blue' : 'vg-pill--red'">{{ task.state === 'running' ? '进行中' : '失败' }}</span></td>
              <td class="tk-title">{{ task.title }}</td>
              <td class="vg-muted">{{ task.module }}</td>
              <td class="tk-detail" :class="{ 'is-error': task.state === 'failed' }">{{ task.detail }}</td>
              <td class="vg-muted">{{ relativeTime(task.at) }}</td>
              <td class="tk-actions">
                <button type="button" class="vg-btn vg-btn--xs" @click="router.push(task.route)">打开</button>
                <button v-if="task.remove" type="button" class="vg-icon-btn vg-icon-btn--sm" title="删除" @click="remove(task)"><Trash2 :size="14" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="vg-empty tk-empty">
        <span class="vg-empty__icon"><LoaderCircle :size="20" /></span>
        <h3>{{ tab === 'running' ? '没有进行中的任务' : '没有失败的任务' }}</h3>
        <p>生成、复刻、视频工具、选品的任务都会汇总在这里</p>
      </div>
    </main>
  </template>
  <template v-else>
  <PageHeader title="任务中心" back />
  <main class="m-page m-page--no-tabs">
    <div class="seg">
      <button type="button" :class="{ 'is-active': tab === 'running' }" @click="tab = 'running'">进行中 <small>{{ running.length }}</small></button>
      <button type="button" :class="{ 'is-active': tab === 'failed' }" @click="tab = 'failed'">失败 <small>{{ failed.length }}</small></button>
    </div>

    <div v-if="shown.length" class="m-card m-list">
      <div v-for="task in shown" :key="task.key" class="m-row task">
        <LoaderCircle v-if="task.state === 'running'" :size="20" class="m-spin running" />
        <AlertCircle v-else :size="20" class="failed" />
        <button type="button" class="m-row__main task__main" @click="router.push(task.route)">
          <span class="m-row__title">{{ task.title }}</span>
          <span class="m-row__sub">{{ task.module }} · {{ relativeTime(task.at) }}</span>
          <span class="task__detail" :class="{ 'is-error': task.state === 'failed' }">{{ task.detail }}</span>
        </button>
        <button v-if="task.remove" type="button" class="m-icon-btn" aria-label="删除" @click="remove(task)"><Trash2 :size="18" /></button>
        <ChevronRight v-else :size="18" class="m-muted" />
      </div>
    </div>
    <div v-else class="m-card m-empty">
      <span class="m-empty__title">{{ tab === 'running' ? '没有进行中的任务' : '没有失败的任务' }}</span>
      <span class="m-empty__text">生成、复刻、视频工具、选品的任务都会汇总在这里</span>
    </div>
    <p class="m-muted note">{{ isWeb ? '关掉网页后任务在云端继续跑，再打开时自动刷新。' : '手机退到后台时任务在云端继续跑，回来后自动刷新。' }}</p>
  </main>
  </template>
</template>

<style scoped>
.seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 14px; padding: 4px; border-radius: 14px; background: var(--theme-panel); border: 1px solid var(--theme-border); }
.seg button { height: 36px; border: 0; border-radius: 10px; background: none; color: var(--theme-text-muted); font-size: 13px; font-weight: 700; }
.seg button small { font-weight: 600; opacity: 0.8; }
.seg button.is-active { background: var(--theme-control-hover); color: var(--theme-text); }
.task { align-items: flex-start; }
.task__main { min-width: 0; padding: 0; border: 0; background: none; color: inherit; text-align: left; }
.task__detail { margin-top: 4px; color: var(--theme-text-muted); font-size: 12px; line-height: 1.5; word-break: break-word; }
.task__detail.is-error { color: var(--theme-danger-text); }
.running { color: var(--m-accent-2); flex: none; margin-top: 2px; }
.failed { color: var(--theme-danger-text); flex: none; margin-top: 2px; }
.note { margin: 12px 4px 0; font-size: 12px; }
</style>
