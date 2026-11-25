<script setup lang="ts">
import { m } from './museText'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Code2, Copy, X } from 'lucide-vue-next'
import type { MuseJob } from '../../../../../main/modules/muse-creative-studio/types'
import { museError, museJobState } from './museLabels'

const props = defineProps<{ jobId: string; accountName: string }>()
const emit = defineEmits<{ close: [] }>()

const job = ref<MuseJob | null>(null)
const error = ref('')
const tab = ref<'overview' | 'prompt' | 'logs'>('overview')

async function load() {
  if (!props.jobId) return
  try {
    job.value = await window.api.museCreative.getJob(props.jobId)
    error.value = ''
  } catch (e) {
    error.value = museError(e)
  }
}
watch(() => props.jobId, () => { job.value = null; tab.value = 'overview'; void load() }, { immediate: true })

const time = (value?: number) => (value ? new Date(value).toLocaleString() : '--')
const logs = computed(() => [...(job.value?.logs || [])].reverse())
const rows = computed<Array<[string, string]>>(() => {
  const item = job.value
  if (!item) return []
  return [
    [m('状态'), museJobState(item).label],
    [m('账号'), props.accountName || '--'],
    [m('商品'), item.productName || '--'],
    [m('请求'), m('{0} 秒 {1}', item.durationSec, item.aspect)],
    [m('创建时间'), time(item.createdAt)],
    [m('更新时间'), time(item.updatedAt)],
    [m('开始处理'), time(item.timeline?.startedAt)],
    [m('提示词发出'), time(item.timeline?.sentAt)],
    [m('拿到对话'), time(item.timeline?.threadAt)],
    [m('出现视频'), time(item.timeline?.videoAt)],
    [m('未发出重试'), m('{0} 次', item.attempts ?? 0)],
    [m('额度换号'), m('{0} 次', item.quotaSwitches ?? 0)],
    [m('原片'), item.result?.videoPath || '--'],
    [m('字幕版'), item.subtitleVideoPath || '--'],
    [m('导出'), item.exportedVideoPath || '--'],
    [m('参考图'), item.imagePath],
    [m('商品细节图'), item.detailImagePaths?.join('\n') || m('未使用')],
    [m('换图'), item.image ? m('{0}（{1} 次，提示词 V{2}）', item.preparedImagePath || m('还没有结果'), item.image.attempts ?? 0, item.image.promptVersion ?? '-') : m('未使用')],
    [m('错误'), (item.error && m(item.error)) || '--'],
  ]
})
const copy = () => navigator.clipboard.writeText(job.value?.sentPrompt || '').catch((e) => { error.value = museError(e) })

let timer: ReturnType<typeof setInterval> | undefined
const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && props.jobId) emit('close') }
onMounted(() => {
  timer = setInterval(() => void load(), 3000)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div v-if="jobId" class="vg-scope vg-backdrop" data-testid="muse-detail" @click.self="emit('close')">
    <section class="vg-dialog vg-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="md-title">
      <header class="vg-dialog__head">
        <div class="vg-dialog__title"><span class="vg-dialog__title-icon"><Code2 :size="20" /></span><div><h2 id="md-title">{{ m('任务详情') }}</h2><p>{{ jobId }}</p></div></div>
        <button class="vg-icon-btn" type="button" :aria-label="m('关闭')" @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="vg-dialog__body md__body">
        <div class="ts-seg" role="tablist">
          <button type="button" role="tab" :class="{ 'is-on': tab === 'overview' }" :aria-selected="tab === 'overview'" @click="tab = 'overview'">{{ m('概览') }}</button>
          <button type="button" role="tab" :class="{ 'is-on': tab === 'prompt' }" :aria-selected="tab === 'prompt'" @click="tab = 'prompt'">{{ m('发送内容') }}</button>
          <button type="button" role="tab" :class="{ 'is-on': tab === 'logs' }" :aria-selected="tab === 'logs'" data-testid="muse-detail-logs" @click="tab = 'logs'">{{ m('运行日志') }} {{ logs.length }}</button>
        </div>
        <p v-if="error" class="vg-notice vg-notice--danger" role="alert">{{ m(error) }}</p>
        <dl v-if="tab === 'overview'" class="md__grid"><div v-for="[label, value] in rows" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl>
        <div v-else-if="tab === 'prompt'" class="md__prompt">
          <pre>{{ job?.sentPrompt }}</pre>
          <button class="vg-btn vg-btn--sm" type="button" @click="copy"><Copy :size="13" />{{ m('复制') }}</button>
        </div>
        <ul v-else class="md__logs">
          <li v-for="log in logs" :key="log.id" :class="`is-${log.level}`"><time>{{ time(log.time) }}</time><span>{{ m(log.message) }}</span></li>
          <li v-if="!logs.length" class="vg-muted">{{ m('这条任务没有日志（旧版本创建的）') }}</li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.md__body { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
.md__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; width: 100%; margin: 0; }
.md__grid div { display: flex; flex-direction: column; gap: 3px; padding: 9px 12px; border: 1px solid var(--theme-border); border-radius: 9px; }
.md__grid dt { font-size: 11.5px; color: var(--theme-text-muted); }
.md__grid dd { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
.md__grid div:nth-last-child(-n+7) { grid-column: 1 / -1; }
.md__prompt { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; width: 100%; }
.md__prompt pre { width: 100%; margin: 0; padding: 12px; border: 1px solid var(--theme-border); border-radius: 9px; font-size: 12.5px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.md__logs { display: flex; flex-direction: column; gap: 6px; width: 100%; margin: 0; padding: 0; list-style: none; font-size: 12.5px; }
.md__logs li { display: flex; gap: 12px; }
.md__logs time { flex-shrink: 0; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; }
.md__logs .is-error span { color: var(--vg-red); }
.md__logs .is-success span { color: var(--vg-green); }
</style>
