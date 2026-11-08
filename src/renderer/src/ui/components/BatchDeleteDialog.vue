<script setup lang="ts">
import { LoaderCircle, Trash2, X } from 'lucide-vue-next'

defineProps<{
  open: boolean
  count: number
  busy?: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const labels = {
  title: '\u6279\u91cf\u5220\u9664\u4efb\u52a1',
  description: '\u9009\u4e2d\u7684\u4efb\u52a1\u5c06\u4ece\u5f53\u524d\u4efb\u52a1\u5e93\u4e2d\u79fb\u9664\u3002',
  selectedPrefix: '\u5df2\u9009\u62e9',
  selectedSuffix: '\u4e2a\u4efb\u52a1',
  fileNote: '\u672c\u5730\u5df2\u751f\u6210\u6216\u4e0b\u8f7d\u7684\u5a92\u4f53\u6587\u4ef6\u4e0d\u4f1a\u81ea\u52a8\u5220\u9664\u3002',
  cancel: '\u53d6\u6d88',
  confirm: '\u786e\u8ba4\u6279\u91cf\u5220\u9664',
  deleting: '\u6b63\u5728\u5220\u9664...',
} as const
</script>

<template>
  <div v-if="open" class="batch-delete-dialog" @click.self="!busy && emit('close')">
    <section class="batch-delete-dialog__panel">
      <header class="batch-delete-dialog__header">
        <div>
          <strong>{{ labels.title }}</strong>
          <p>{{ labels.description }}</p>
        </div>
        <button type="button" :disabled="busy" @click="emit('close')"><X class="h-4 w-4" /></button>
      </header>
      <div class="batch-delete-dialog__body">
        <div class="batch-delete-dialog__icon"><Trash2 class="h-5 w-5" /></div>
        <div>
          <strong>{{ labels.selectedPrefix }} {{ count }} {{ labels.selectedSuffix }}</strong>
          <p>{{ labels.fileNote }}</p>
        </div>
      </div>
      <footer class="batch-delete-dialog__actions">
        <button type="button" class="batch-delete-dialog__cancel" :disabled="busy" @click="emit('close')">{{ labels.cancel }}</button>
        <button type="button" class="batch-delete-dialog__confirm" :disabled="busy || !count" @click="emit('confirm')">
          <LoaderCircle v-if="busy" class="h-4 w-4 animate-spin" />
          <Trash2 v-else class="h-4 w-4" />
          {{ busy ? labels.deleting : labels.confirm }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.batch-delete-dialog{position:fixed;inset:0;z-index:130;display:grid;place-items:center;padding:18px;background:color-mix(in srgb,var(--theme-root) 76%,transparent);backdrop-filter:blur(9px);color:var(--theme-text)}
.batch-delete-dialog__panel{width:min(520px,100%);display:grid;gap:14px;padding:18px;border:1px solid var(--theme-border);border-radius:16px;background:var(--theme-panel);box-shadow:0 24px 64px color-mix(in srgb,var(--theme-text) 18%,transparent)}
.batch-delete-dialog__header{display:flex;align-items:center;justify-content:space-between;gap:12px}.batch-delete-dialog__header strong{font-size:20px}.batch-delete-dialog__header p{margin:5px 0 0;color:var(--theme-text-muted);font-size:12px}.batch-delete-dialog__header button{width:38px;height:38px;display:grid;place-items:center;border:1px solid var(--theme-border-control);border-radius:10px;background:var(--theme-control);color:var(--theme-text-secondary)}
.batch-delete-dialog__body{display:grid;grid-template-columns:44px minmax(0,1fr);gap:12px;align-items:start;padding:14px;border:1px solid color-mix(in srgb,var(--theme-danger) 28%,var(--theme-border));border-radius:12px;background:var(--theme-danger-soft)}.batch-delete-dialog__icon{width:44px;height:44px;display:grid;place-items:center;border-radius:12px;background:color-mix(in srgb,var(--theme-danger) 14%,transparent);color:var(--theme-danger-text)}.batch-delete-dialog__body p{margin:5px 0 0;color:var(--theme-text-muted);font-size:11px;line-height:1.5}
.batch-delete-dialog__actions{display:flex;justify-content:flex-end;gap:8px}.batch-delete-dialog__cancel,.batch-delete-dialog__confirm{min-height:38px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:0 14px;border-radius:10px;color:var(--theme-text-secondary);font-size:12px;font-weight:700}.batch-delete-dialog__cancel{border:1px solid var(--theme-border-control);background:var(--theme-control)}.batch-delete-dialog__confirm{border:1px solid var(--theme-danger);background:var(--theme-danger);color:var(--theme-on-danger)}button:disabled{opacity:.48;cursor:not-allowed}
</style>
