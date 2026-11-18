<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Cloud, CloudOff, Copy, CopyPlus, Crop, ExternalLink, Eye, FolderInput, FolderOpen, HardDrive, Image as ImageIcon, Images, Link, Pencil, Play, Trash2, Video } from 'lucide-vue-next'
import type { AssetFolder, LibraryAsset } from '../../../../../shared/assetLibrary'
import { assetFileUrl, fileExtension, formatBytes, formatDateTime, formatDuration } from './assetFormat'

const props = defineProps<{
  selected: LibraryAsset[]
  thumbnails: Record<string, string>
  folderPath: (folderId: string | null | undefined) => AssetFolder[]
  library: { count: number; images: number; videos: number; size: number; backedUp: number }
}>()
const emit = defineEmits<{
  preview: [asset: LibraryAsset]
  edit: [asset: LibraryAsset]
  rename: [asset: LibraryAsset]
  open: [asset: LibraryAsset]
  reveal: [asset: LibraryAsset]
  copyPath: [asset: LibraryAsset]
  copyLink: [asset: LibraryAsset]
  openFolder: [folderId: string | null]
  move: []
  duplicate: []
  remove: []
}>()

const single = computed(() => (props.selected.length === 1 ? props.selected[0] : null))
const totalSize = computed(() => props.selected.reduce((sum, item) => sum + item.size, 0))
const dims = ref('')
const duration = ref('')

watch(() => single.value?.id, () => { dims.value = ''; duration.value = '' })

function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  dims.value = `${img.naturalWidth} × ${img.naturalHeight} px`
}
function onVideoMeta(event: Event) {
  const video = event.target as HTMLVideoElement
  if (video.videoWidth) dims.value = `${video.videoWidth} × ${video.videoHeight} px`
  duration.value = formatDuration(video.duration)
}

const location = computed(() => (single.value ? props.folderPath(single.value.folderId) : []))
const usage = computed(() => Object.entries(single.value?.pluginUsage || {}).filter(([, status]) => status === 'used').length)
const backupRate = computed(() => (props.library.count ? Math.round((props.library.backedUp / props.library.count) * 100) : 0))
</script>

<template>
  <aside class="inspector" aria-label="素材详情">
    <!-- Single asset -->
    <template v-if="single">
      <div class="inspector__media" :class="{ 'is-video': single.type === 'video' }">
        <img v-if="single.type === 'image'" :key="single.id" :src="assetFileUrl(single.filePath)" :alt="single.name" draggable="false" @load="onImageLoad" @dblclick="emit('preview', single)" />
        <video v-else :key="single.id" :src="assetFileUrl(single.filePath)" :poster="thumbnails[single.id]" muted controls preload="metadata" @loadedmetadata="onVideoMeta" />
      </div>

      <div class="inspector__head">
        <div class="inspector__name">
          <strong :title="single.name">{{ single.name }}</strong>
          <button type="button" class="vg-icon-btn vg-icon-btn--sm" title="重命名 (F2)" @click="emit('rename', single)"><Pencil :size="14" /></button>
        </div>
        <div class="inspector__tags">
          <span class="vg-pill" :class="single.type === 'image' ? 'vg-pill--blue' : 'vg-pill--violet'">
            <ImageIcon v-if="single.type === 'image'" :size="12" /><Video v-else :size="12" />{{ single.type === 'image' ? '图片' : '视频' }}
          </span>
          <span class="vg-pill">{{ fileExtension(single) }}</span>
          <span v-if="single.qiniuUrl" class="vg-pill vg-pill--accent"><Cloud :size="12" />已备份</span>
          <span v-else-if="single.qiniuError" class="vg-pill vg-pill--red" :title="single.qiniuError"><CloudOff :size="12" />备份失败</span>
        </div>
      </div>

      <div class="inspector__quick">
        <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" @click="emit('preview', single)"><Play v-if="single.type === 'video'" :size="14" /><Eye v-else :size="14" />{{ single.type === 'video' ? '播放' : '预览' }}</button>
        <button v-if="single.type === 'image'" type="button" class="vg-btn vg-btn--sm" @click="emit('edit', single)"><Crop :size="14" />编辑</button>
        <button type="button" class="vg-btn vg-btn--sm" @click="emit('move')"><FolderInput :size="14" />移动</button>
      </div>

      <dl class="inspector__info">
        <div><dt>尺寸</dt><dd>{{ dims || '—' }}</dd></div>
        <div v-if="single.type === 'video'"><dt>时长</dt><dd>{{ duration || '—' }}</dd></div>
        <div><dt>大小</dt><dd>{{ formatBytes(single.size) }}</dd></div>
        <div><dt>来源</dt><dd>{{ single.source === 'mobile' ? '手机扫码上传' : '电脑上传' }}</dd></div>
        <div><dt>添加时间</dt><dd>{{ formatDateTime(single.createdAt) }}</dd></div>
        <div>
          <dt>位置</dt>
          <dd class="inspector__path">
            <button type="button" @click="emit('openFolder', null)">素材库</button>
            <template v-for="folder in location" :key="folder.id"><span>/</span><button type="button" @click="emit('openFolder', folder.id)">{{ folder.name }}</button></template>
          </dd>
        </div>
        <div><dt>插件使用</dt><dd>{{ usage ? `已被 ${usage} 个插件使用` : '未使用' }}</dd></div>
      </dl>

      <div class="inspector__links">
        <button type="button" @click="emit('open', single)"><ExternalLink :size="14" />用默认程序打开</button>
        <button type="button" @click="emit('reveal', single)"><FolderOpen :size="14" />在文件夹中显示</button>
        <button type="button" @click="emit('copyPath', single)"><Copy :size="14" />复制文件路径</button>
        <button v-if="single.qiniuUrl" type="button" @click="emit('copyLink', single)"><Link :size="14" />复制云端链接</button>
        <button type="button" @click="emit('duplicate')"><CopyPlus :size="14" />创建副本</button>
        <button type="button" class="danger" @click="emit('remove')"><Trash2 :size="14" />移入回收站</button>
      </div>
    </template>

    <!-- Multiple assets -->
    <template v-else-if="selected.length > 1">
      <div class="inspector__stack">
        <div v-for="(item, index) in selected.slice(0, 3)" :key="item.id" class="inspector__stack-card" :style="{ '--i': index }">
          <img v-if="thumbnails[item.id]" :src="thumbnails[item.id]" alt="" draggable="false" />
          <ImageIcon v-else :size="26" />
        </div>
      </div>
      <div class="inspector__multi">
        <strong>已选择 {{ selected.length }} 项</strong>
        <span>{{ selected.filter((item) => item.type === 'image').length }} 张图片 · {{ selected.filter((item) => item.type === 'video').length }} 个视频 · {{ formatBytes(totalSize) }}</span>
      </div>
      <div class="inspector__links">
        <button type="button" @click="emit('move')"><FolderInput :size="14" />移动到文件夹…</button>
        <button type="button" @click="emit('duplicate')"><CopyPlus :size="14" />创建副本</button>
        <button type="button" class="danger" @click="emit('remove')"><Trash2 :size="14" />移入回收站</button>
      </div>
    </template>

    <!-- Nothing selected: library overview -->
    <template v-else>
      <div class="inspector__empty">
        <div class="inspector__empty-icon"><Images :size="26" /></div>
        <strong>选择素材查看详情</strong>
        <span>单击选中，双击或按空格预览。按住 Ctrl / Shift 可多选，也可以在空白处拖拽框选。</span>
      </div>
      <div class="inspector__overview">
        <div class="inspector__overview-title"><HardDrive :size="14" />素材库概览</div>
        <dl class="inspector__info">
          <div><dt>素材总数</dt><dd>{{ library.count }}</dd></div>
          <div><dt>图片</dt><dd>{{ library.images }}</dd></div>
          <div><dt>视频</dt><dd>{{ library.videos }}</dd></div>
          <div><dt>占用空间</dt><dd>{{ formatBytes(library.size) }}</dd></div>
        </dl>
        <div class="inspector__meter">
          <div class="inspector__meter-head"><span>云端备份</span><strong>{{ backupRate }}%</strong></div>
          <div class="vg-progress"><div class="vg-progress__bar"><div class="vg-progress__fill" :style="{ width: `${backupRate}%` }" /></div></div>
          <small>{{ library.backedUp }} / {{ library.count }} 项已同步到七牛云存储</small>
        </div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.inspector { display: flex; flex-direction: column; gap: 16px; min-height: 0; padding: 14px; overflow-y: auto; scrollbar-width: thin; }
.inspector > * { flex-shrink: 0; }
.inspector__media { position: relative; display: grid; place-items: center; aspect-ratio: 4 / 3; overflow: hidden; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background:
  repeating-conic-gradient(color-mix(in srgb, var(--theme-text) 5%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px, var(--theme-panel-soft); }
.inspector__media img { max-width: 100%; max-height: 100%; object-fit: contain; cursor: zoom-in; }
.inspector__media video { width: 100%; height: 100%; object-fit: contain; background: #000; }
.inspector__head { display: flex; flex-direction: column; gap: 8px; }
.inspector__name { display: flex; align-items: flex-start; gap: 6px; }
.inspector__name strong { flex: 1; min-width: 0; font-size: 14px; font-weight: 700; line-height: 1.45; word-break: break-all; }
.inspector__tags { display: flex; flex-wrap: wrap; gap: 6px; }
.inspector__tags .vg-pill { gap: 4px; }
.inspector__quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 6px; }
.inspector__info { display: flex; flex-direction: column; margin: 0; border-top: 1px solid var(--theme-divider); }
.inspector__info > div { display: flex; align-items: baseline; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--theme-divider); font-size: 12px; }
.inspector__info dt { width: 64px; flex-shrink: 0; color: var(--theme-text-muted); }
.inspector__info dd { flex: 1; min-width: 0; margin: 0; color: var(--theme-text); font-variant-numeric: tabular-nums; text-align: right; overflow-wrap: anywhere; }
.inspector__path { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 2px; }
.inspector__path span { color: var(--theme-text-muted); }
.inspector__path button { padding: 0 2px; border: 0; background: transparent; color: var(--vg-accent); font-size: 12px; cursor: pointer; }
.inspector__path button:hover { text-decoration: underline; }
.inspector__links { display: flex; flex-direction: column; gap: 2px; }
.inspector__links button { display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: var(--theme-text-secondary); font-size: 12px; text-align: left; cursor: pointer; transition: background .12s, color .12s; }
.inspector__links button svg { color: var(--theme-text-muted); }
.inspector__links button:hover { background: var(--theme-panel-soft); color: var(--theme-text); }
.inspector__links button:hover svg { color: var(--vg-accent); }
.inspector__links button.danger, .inspector__links button.danger svg { color: var(--vg-red); }
.inspector__links button.danger:hover { background: color-mix(in srgb, var(--vg-red) 10%, transparent); }

.inspector__stack { position: relative; height: 170px; margin: 6px 0 0; }
.inspector__stack-card { position: absolute; left: 50%; top: 8px; display: grid; place-items: center; width: 150px; height: 150px; overflow: hidden; border: 2px solid var(--theme-panel); border-radius: 12px; background: var(--theme-panel-soft); color: var(--theme-text-muted); box-shadow: var(--theme-shadow-float); transform: translateX(calc(-50% + (var(--i) - 1) * 26px)) rotate(calc((var(--i) - 1) * 6deg)); }
.inspector__stack-card:nth-child(2) { z-index: 2; }
.inspector__stack-card img { width: 100%; height: 100%; object-fit: cover; }
.inspector__multi { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
.inspector__multi strong { font-size: 15px; }
.inspector__multi span { font-size: 12px; color: var(--theme-text-muted); }

.inspector__empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 26px 8px 8px; text-align: center; }
.inspector__empty-icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 16px; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); }
.inspector__empty strong { font-size: 14px; }
.inspector__empty span { font-size: 12px; line-height: 1.6; color: var(--theme-text-muted); }
.inspector__overview { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel-soft); }
.inspector__overview .inspector__info { border-top: 0; }
.inspector__overview .inspector__info > div:last-child { border-bottom: 0; }
.inspector__overview-title { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--theme-text-secondary); }
.inspector__overview-title svg { color: var(--vg-accent); }
.inspector__meter { display: flex; flex-direction: column; gap: 6px; }
.inspector__meter-head { display: flex; justify-content: space-between; font-size: 12px; color: var(--theme-text-muted); }
.inspector__meter-head strong { color: var(--theme-text); font-variant-numeric: tabular-nums; }
.inspector__meter small { font-size: 11px; color: var(--theme-text-muted); }
</style>
