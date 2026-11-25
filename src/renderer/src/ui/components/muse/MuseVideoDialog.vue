<script setup lang="ts">
/** Player of Muse 创意室: video on the left, file info and actions on the right, like tk创意室. */
import { m } from './museText'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Captions, Download, FolderOpen, Trash2, Undo2, X } from 'lucide-vue-next'
import type { MuseJob } from '../../../../../main/modules/muse-creative-studio/types'

const props = defineProps<{ job: MuseJob | null; title: string; busy?: boolean }>()
const emit = defineEmits<{ close: []; subtitle: []; revert: []; export: []; reveal: []; remove: [] }>()

const original = ref(false)
watch(() => props.job?.id, () => { original.value = false })

const path = computed(() => (original.value ? '' : props.job?.subtitleVideoPath) || props.job?.result?.videoPath || '')
const src = computed(() => (path.value ? `vg://file?path=${encodeURIComponent(path.value)}` : ''))
const fileName = computed(() => path.value.split(/[\\/]/).pop() || '--')
const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && props.job) emit('close') }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="job?.result" class="vg-scope vg-backdrop" data-testid="muse-video" @click.self="emit('close')">
    <section class="mv" role="dialog" aria-modal="true" :aria-label="title">
      <video :key="src" class="mv__player" :src="src" controls autoplay playsinline />
      <aside class="mv__side">
        <header class="mv__head">
          <div><strong :title="title">{{ title }}</strong><p>{{ job.subtitleVideoPath && !original ? m('字幕版') : m('原片') }} · {{ new Date(job.createdAt).toLocaleString() }}</p></div>
          <button class="vg-icon-btn" type="button" :aria-label="m('关闭')" @click="emit('close')"><X :size="18" /></button>
        </header>
        <div v-if="job.subtitleVideoPath" class="ts-seg ts-seg--full" role="group" :aria-label="m('版本')">
          <button type="button" :class="{ 'is-on': !original }" @click="original = false">{{ m('字幕版') }}</button>
          <button type="button" :class="{ 'is-on': original }" @click="original = true">{{ m('原片') }}</button>
        </div>
        <dl class="mv__info">
          <div><dt>{{ m('文件名') }}</dt><dd>{{ fileName }}</dd></div>
          <div><dt>{{ m('画面') }}</dt><dd>{{ job.result.width }}×{{ job.result.height }}</dd></div>
          <div><dt>{{ m('时长') }}</dt><dd>{{ job.result.durationSec.toFixed(1) }} {{ m('秒（请求') }} {{ job.durationSec }} {{ m('秒）') }}</dd></div>
          <div><dt>{{ m('原片大小') }}</dt><dd>{{ (job.result.bytes / 1048576).toFixed(1) }} MB</dd></div>
          <div v-if="job.exportedAt"><dt>{{ m('已导出') }}</dt><dd :title="job.exportedVideoPath">{{ new Date(job.exportedAt).toLocaleString() }}</dd></div>
        </dl>
        <div class="mv__actions">
          <button class="vg-btn" type="button" :disabled="busy" @click="emit('subtitle')"><Captions :size="14" />{{ job.subtitleVideoPath ? m('重做字幕') : m('添加字幕') }}</button>
          <button v-if="job.subtitleVideoPath" class="vg-btn" type="button" :disabled="busy" @click="emit('revert')"><Undo2 :size="14" />{{ m('撤销字幕') }}</button>
          <button class="vg-btn" type="button" @click="emit('reveal')"><FolderOpen :size="14" />{{ m('打开位置') }}</button>
          <button class="vg-btn vg-btn--primary" type="button" :disabled="busy" @click="emit('export')"><Download :size="14" />{{ m('导出') }}</button>
          <button class="vg-btn vg-btn--danger" type="button" :disabled="busy" @click="emit('remove')"><Trash2 :size="14" />{{ m('删除') }}</button>
        </div>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.mv { display: grid; grid-template-columns: minmax(0, auto) 320px; max-width: 94vw; max-height: 88vh; overflow: hidden; border: 1px solid var(--theme-border); border-radius: 16px; background: var(--theme-panel); }
.mv__player { display: block; max-width: 100%; height: min(760px, 88vh); min-width: 280px; background: #000; object-fit: contain; }
.mv__side { display: flex; flex-direction: column; gap: 14px; min-height: 0; padding: 18px; overflow-y: auto; border-left: 1px solid var(--theme-divider); }
.mv__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.mv__head div { min-width: 0; }
.mv__head strong { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: 15px; }
.mv__head p { margin-top: 4px; font-size: 12px; color: var(--theme-text-muted); }
.mv__info { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 12px; border: 1px solid var(--theme-border); border-radius: 10px; font-size: 12.5px; }
.mv__info div { display: flex; justify-content: space-between; gap: 12px; }
.mv__info dt { flex-shrink: 0; color: var(--theme-text-muted); }
.mv__info dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.mv__actions { display: flex; flex-direction: column; gap: 8px; margin-top: auto; }
@media (max-width: 900px) {
  .mv { grid-template-columns: minmax(0, 1fr); overflow-y: auto; }
  .mv__player { width: 100%; height: 50vh; }
  .mv__side { border-left: 0; }
}
</style>
