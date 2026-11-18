<script setup lang="ts">
/**
 * 处理记录（网页版批量水印 / 批量字幕共用，按电脑端的批次列表）：每批一行，可下载全部、重试失败项、删除；
 * 下面列出每个视频的状态。
 */
import { computed } from 'vue'
import { CheckCircle2, Download, Loader2, RotateCcw, Trash2, XCircle } from 'lucide-vue-next'
import type { VideoToolKind } from '@shared/cloud/videoTools'
import { fileBlob } from '@/lib/files'
import { downloadBlob, fileNameFor } from '@/lib/platform'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'
import { queuePositions, removeRuns, retryRun, useToolRuns, type VideoToolRunItem } from '@/lib/videoTools'

const props = defineProps<{ kind: VideoToolKind; title?: string }>()
const runs = useToolRuns(props.kind)

const batches = computed(() => {
  const map = new Map<string, VideoToolRunItem[]>()
  for (const run of runs.value) {
    const key = run.batchId || run.id
    map.set(key, [...(map.get(key) ?? []), run])
  }
  return [...map.entries()].map(([id, items]) => ({ id, items, createdAt: Math.max(...items.map((r) => r.createdAt)) })).sort((a, b) => b.createdAt - a.createdAt)
})
const nameOf = (run: VideoToolRunItem) => run.inputNames?.[0] || run.label
const done = (items: VideoToolRunItem[]) => items.filter((r) => r.status === 'succeeded').length

async function downloadAll(items: VideoToolRunItem[]) {
  for (const run of items.filter((r) => r.status === 'succeeded')) {
    for (const [index, output] of run.outputs.entries()) {
      try {
        const base = nameOf(run).replace(/\.[^.]+$/, '')
        downloadBlob(await fileBlob(output.fileId), fileNameFor(`${base}_${props.kind}${run.outputs.length > 1 ? `_${index + 1}` : ''}`, output.mime))
      } catch (error) {
        toast(errorMessage(error))
      }
    }
  }
}
async function retry(items: VideoToolRunItem[]) {
  for (const run of items.filter((r) => r.status === 'failed')) await retryRun(run).catch((error) => toast(errorMessage(error)))
}
async function remove(items: VideoToolRunItem[]) {
  if (!window.confirm('删除这批处理记录？已存进素材库的成片不受影响。')) return
  await removeRuns(items)
}
</script>

<template>
  <section class="vg-card th">
    <div class="vg-card__head"><span class="vg-card__title">{{ title || '处理记录' }}</span></div>
    <div v-for="batch in batches" :key="batch.id" class="th__batch" data-testid="tool-batch">
      <div class="th__head">
        <strong>{{ new Date(batch.createdAt).toLocaleString() }}</strong>
        <span class="vg-muted">{{ done(batch.items) }}/{{ batch.items.length }}</span>
        <span class="vg-toolbar__spacer"></span>
        <button v-if="done(batch.items)" type="button" class="vg-icon-btn vg-icon-btn--sm" title="下载全部" @click="downloadAll(batch.items)"><Download :size="14" /></button>
        <button v-if="batch.items.some((r) => r.status === 'failed')" type="button" class="vg-icon-btn vg-icon-btn--sm" title="重试失败项" @click="retry(batch.items)"><RotateCcw :size="14" /></button>
        <button type="button" class="vg-icon-btn vg-icon-btn--sm" title="删除这批记录" @click="remove(batch.items)"><Trash2 :size="14" /></button>
      </div>
      <div v-for="run in batch.items" :key="run.id" class="th__item">
        <CheckCircle2 v-if="run.status === 'succeeded'" :size="14" class="th__ok" />
        <XCircle v-else-if="run.status === 'failed'" :size="14" class="th__err" />
        <Loader2 v-else :size="14" :class="{ 'vg-spin': run.status === 'running' }" />
        <span class="vg-ellipsis" :title="run.error || nameOf(run)">{{ nameOf(run) }}<template v-if="run.status === 'queued' && queuePositions[run.jobId]"> · 排队第 {{ queuePositions[run.jobId] }} 位</template></span>
        <small v-if="run.error" class="th__err vg-ellipsis">{{ run.error }}</small>
      </div>
    </div>
    <p v-if="!batches.length" class="vg-muted th__empty">还没有处理记录</p>
  </section>
</template>

<style scoped>
.th__empty { padding: 8px 0; font-size: 12.5px; }
.th__batch { padding: 8px 0; border-top: 1px solid var(--theme-divider); }
.th__batch:first-of-type { border-top: 0; }
.th__head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 12.5px; }
.th__item { display: grid; grid-template-columns: 16px minmax(0, 1fr); align-items: center; gap: 2px 6px; padding: 2px 0; font-size: 12px; }
.th__item small { grid-column: 2; }
.th__ok { color: var(--vg-green); }
.th__err { color: var(--vg-red); }
</style>
