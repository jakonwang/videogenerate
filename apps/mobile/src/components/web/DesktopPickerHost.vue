<script setup lang="ts">
/**
 * 电脑端页面里的「从素材库选择」（openAssetLibraryPicker 发出的 asset-library:pick 事件）在网页上的弹窗：
 * 从网页的素材库 / 作品库挑，返回 `cloudfile:` 引用——经「电脑代办」交给电脑时，电脑先下载再用。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, Film, X } from 'lucide-vue-next'
import { cloudFileRef } from '@shared/cloud/relay'
import CloudImage from '@/components/CloudImage.vue'
import { useAssets } from '@/lib/assets'
import { useGenerations } from '@/lib/generate'

type Options = { type?: 'all' | 'image' | 'video'; multiple?: boolean }
type Picked = { id: string; name: string; filePath: string; type: 'image' | 'video'; mimeType: string }
type Request = { options: Options; resolve: (items: Picked[] | null) => void }

const request = ref<Request | null>(null)
const tab = ref<'assets' | 'works'>('assets')
const picked = ref<Picked[]>([])
const { items: assets } = useAssets()
const works = useGenerations((g) => g.status === 'succeeded' && Boolean(g.outputFileId))

const wants = (kind: string) => !request.value || request.value.options.type === 'all' || !request.value.options.type || request.value.options.type === kind
const rows = computed<Array<Picked & { poster?: string }>>(() =>
  tab.value === 'assets'
    ? assets.value
        .filter((a) => a.kind !== 'audio' && wants(a.kind))
        .map((a) => ({ id: a.id, name: a.name, filePath: cloudFileRef(a.fileId, `${a.name}${a.kind === 'video' ? '.mp4' : '.jpg'}`), type: a.kind as 'image' | 'video', mimeType: a.mime, poster: a.kind === 'image' ? a.fileId : a.posterFileId }))
    : works.value
        .filter((g) => wants(g.kind))
        .map((g) => ({ id: g.id, name: g.label || '作品', filePath: cloudFileRef(g.outputFileId!, `${g.label || g.id}${g.kind === 'video' ? '.mp4' : '.png'}`), type: g.kind, mimeType: g.outputMime || (g.kind === 'video' ? 'video/mp4' : 'image/png'), poster: g.kind === 'image' ? g.outputFileId : undefined })),
)
const isPicked = (row: Picked) => picked.value.some((p) => p.filePath === row.filePath)
function toggle(row: Picked & { poster?: string }) {
  const { poster: _p, ...item } = row
  if (isPicked(item)) picked.value = picked.value.filter((p) => p.filePath !== item.filePath)
  else picked.value = request.value?.options.multiple === false ? [item] : [...picked.value, item]
}
function finish(ok: boolean) {
  request.value?.resolve(ok && picked.value.length ? picked.value : null)
  request.value = null
  picked.value = []
}
function onPick(event: Event) {
  const detail = (event as CustomEvent<Request>).detail
  if (!detail?.resolve) return
  request.value?.resolve(null)
  picked.value = []
  request.value = detail
}
onMounted(() => window.addEventListener('asset-library:pick', onPick))
onBeforeUnmount(() => {
  window.removeEventListener('asset-library:pick', onPick)
  finish(false)
})
</script>

<template>
  <div v-if="request" class="vg-backdrop" @click.self="finish(false)">
    <section class="vg-dialog vg-dialog--wide" data-testid="desktop-picker">
      <header class="vg-dialog__head">
        <span class="vg-dialog__title">从素材库选择</span>
        <button type="button" class="vg-icon-btn" aria-label="关闭" @click="finish(false)"><X :size="16" /></button>
      </header>
      <div class="vg-dialog__body">
        <div class="vg-seg vg-seg--sm dp-tabs">
          <button type="button" class="vg-seg__btn" :class="{ 'is-active': tab === 'assets' }" @click="tab = 'assets'">素材库</button>
          <button type="button" class="vg-seg__btn" :class="{ 'is-active': tab === 'works' }" @click="tab = 'works'">作品库</button>
        </div>
        <div v-if="rows.length" class="dp-grid">
          <button v-for="row in rows" :key="row.filePath" type="button" class="dp-item" :class="{ 'is-on': isPicked(row) }" :title="row.name" @click="toggle(row)">
            <span class="dp-item__media"><CloudImage v-if="row.poster" :file-id="row.poster" /><Film v-else :size="20" /></span>
            <span class="dp-item__name">{{ row.name }}</span>
            <Check v-if="isPicked(row)" :size="14" class="dp-item__check" />
          </button>
        </div>
        <p v-else class="vg-muted">这里还没有可选的{{ request.options.type === 'image' ? '图片' : request.options.type === 'video' ? '视频' : '素材' }}。</p>
        <p class="vg-muted dp-note">选中的文件会由电脑先下载，再交给电脑端处理。</p>
      </div>
      <footer class="vg-dialog__foot">
        <span class="vg-muted">已选 {{ picked.length }}</span>
        <button type="button" class="vg-btn vg-btn--primary" data-testid="desktop-picker-done" :disabled="!picked.length" @click="finish(true)">确定</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.dp-tabs { margin-bottom: 10px; }
.dp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 10px; max-height: 56vh; overflow: auto; }
.dp-item { position: relative; display: flex; flex-direction: column; gap: 4px; padding: 6px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); color: var(--theme-text); cursor: pointer; }
.dp-item.is-on { border-color: var(--vg-accent); box-shadow: 0 0 0 1px var(--vg-accent) inset; }
.dp-item__media { display: grid; place-items: center; aspect-ratio: 1; overflow: hidden; border-radius: 6px; background: #000; color: var(--theme-text-muted); }
.dp-item__media :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.dp-item__name { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.dp-item__check { position: absolute; top: 10px; right: 10px; padding: 2px; border-radius: 50%; background: var(--vg-accent); color: #fff; }
.dp-note { margin-top: 10px; font-size: 12px; }
</style>
