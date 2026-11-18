<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Download, FolderInput, FolderPlus, Film, Image as ImageIcon, LoaderCircle, Music, Pencil, Play, Trash2, Upload, X } from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import PageHeader from '@/components/PageHeader.vue'
import WebAssets from './web/WebAssets.vue'
import { useInWebShell } from '@/lib/layout'
import { ASSET_ACCEPT, ASSET_KIND_LABEL, formatBytes, formatDuration, removeAsset, updateAsset, uploadAsset, useAssets, type AssetItem, type AssetKind } from '@/lib/assets'
import { fileBlob, fileUrl } from '@/lib/files'
import { downloadBlob, fileNameFor, isWeb } from '@/lib/platform'
import { cloud, errorMessage } from '@/lib/session'
import { relativeTime } from '@/lib/library'
import { toast } from '@/lib/toast'

/** 素材库：自己上传、可以反复用的视频 / 图片 / 音频，按文件夹整理。 */

const inWebShell = useInWebShell()
const { all, folders } = useAssets()
const kind = ref<'all' | AssetKind>('all')
const folder = ref<string>('')
const keyword = ref('')
const input = ref<HTMLInputElement>()
const uploading = ref<{ key: number; name: string; error?: string }[]>([])
let uploadSeq = 0
const selected = ref<AssetItem | null>(null)
const busy = ref('')
const usage = ref<{ fileBytes: number; quotaBytes: number } | null>(null)
const extraFolders = ref<string[]>([])
const audioSrc = ref('')
watch(selected, async (item) => {
  audioSrc.value = ''
  if (item?.kind === 'audio') audioSrc.value = await fileUrl(item.fileId).catch(() => '')
})

const folderList = computed(() => [...new Set([...folders.value, ...extraFolders.value])])
const shown = computed(() => {
  const word = keyword.value.trim().toLowerCase()
  return all.value.filter((item) =>
    (kind.value === 'all' || item.kind === kind.value) &&
    (!folder.value || (item.folder || '') === folder.value) &&
    (!word || item.name.toLowerCase().includes(word)),
  )
})
const counts = computed(() => ({
  all: all.value.length,
  video: all.value.filter((item) => item.kind === 'video').length,
  image: all.value.filter((item) => item.kind === 'image').length,
  audio: all.value.filter((item) => item.kind === 'audio').length,
}))

async function loadUsage() {
  usage.value = await cloud.sync.usage().catch(() => null)
}
onMounted(loadUsage)

async function onFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || [])
  ;(event.target as HTMLInputElement).value = ''
  if (!files.length) return
  const queue = files.map((file) => ({ key: ++uploadSeq, name: file.name }))
  uploading.value = [...uploading.value, ...queue]
  let ok = 0
  // One at a time: steady progress and no burst against the upload limit.
  for (const [index, file] of files.entries()) {
    try {
      await uploadAsset(file, folder.value)
      ok += 1
      uploading.value = uploading.value.filter((row) => row.key !== queue[index].key)
    } catch (error) {
      const message = errorMessage(error)
      uploading.value = uploading.value.map((row) => (row.key === queue[index].key ? { ...row, error: message } : row))
    }
  }
  if (ok) toast(`已上传 ${ok} 个素材`)
  void loadUsage()
}

function newFolder() {
  const name = window.prompt('新文件夹名称')?.trim().slice(0, 40)
  if (!name) return
  if (!folderList.value.includes(name)) extraFolders.value = [...extraFolders.value, name]
  folder.value = name
}

async function run(name: string, task: () => Promise<void>) {
  busy.value = name
  try {
    await task()
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    busy.value = ''
  }
}

function rename() {
  const item = selected.value
  if (!item) return
  const name = window.prompt('素材名称', item.name)?.trim()
  if (!name || name === item.name) return
  void run('rename', async () => {
    await updateAsset(item, { name })
    selected.value = { ...item, name }
  })
}

function move() {
  const item = selected.value
  if (!item) return
  const hint = folderList.value.length ? `已有：${folderList.value.join('、')}（留空 = 未分类）` : '留空 = 未分类'
  const target = window.prompt(`移到哪个文件夹？\n${hint}`, item.folder || '')
  if (target === null) return
  void run('move', async () => {
    await updateAsset(item, { folder: target })
    selected.value = { ...item, folder: target.trim() || undefined }
    toast(target.trim() ? `已移到「${target.trim()}」` : '已移到未分类')
  })
}

function download() {
  const item = selected.value
  if (!item) return
  void run('download', async () => {
    downloadBlob(await fileBlob(item.fileId), fileNameFor(item.name, item.mime))
  })
}

function remove() {
  const item = selected.value
  if (!item || !window.confirm(`从素材库删除「${item.name}」？已经用到它的项目和成片不受影响。`)) return
  void run('remove', async () => {
    await removeAsset(item)
    selected.value = null
    toast('已删除')
  })
}

const KIND_ICON = { video: Film, image: ImageIcon, audio: Music }
</script>

<template>
  <WebAssets v-if="inWebShell" />
  <template v-else>
  <PageHeader title="素材库" back>
    <template #actions>
      <button type="button" class="m-btn m-btn--sm m-btn--primary" @click="input?.click()"><Upload :size="15" /> 上传</button>
    </template>
  </PageHeader>
  <main class="m-page m-page--no-tabs assets">
    <section class="drop m-card" data-testid="assets-drop" @click="input?.click()">
      <Upload :size="20" />
      <span>{{ isWeb ? '点击上传，或把视频 / 图片 / 音频直接拖到这里（可多选）' : '点击从手机选择视频、图片或音频（可多选）' }}</span>
      <small v-if="usage">已用 {{ formatBytes(usage.fileBytes) || '0 KB' }} / {{ formatBytes(usage.quotaBytes) }}</small>
      <input ref="input" type="file" :accept="ASSET_ACCEPT" multiple hidden @change="onFiles" />
    </section>

    <div v-if="uploading.length" class="uploads m-card">
      <div v-for="row in uploading" :key="row.key" class="uploads__row">
        <LoaderCircle v-if="!row.error" :size="15" class="m-spin" />
        <X v-else :size="15" class="err" />
        <span class="uploads__name">{{ row.name }}</span>
        <small :class="{ err: row.error }">{{ row.error || '上传中' }}</small>
      </div>
      <button v-if="uploading.every((row) => row.error)" type="button" class="m-btn m-btn--sm" @click="uploading = []">清除</button>
    </div>

    <div class="bar">
      <label class="m-search">
        <input v-model="keyword" type="search" placeholder="搜索素材名称" />
      </label>
      <div class="m-chips kinds">
        <button v-for="key in (['all', 'video', 'image', 'audio'] as const)" :key="key" type="button" class="m-chip" :class="{ 'is-active': kind === key }" @click="kind = key">
          {{ key === 'all' ? '全部' : ASSET_KIND_LABEL[key] }} {{ counts[key] }}
        </button>
      </div>
    </div>
    <div class="m-chips folders">
      <button type="button" class="m-chip" :class="{ 'is-active': !folder }" @click="folder = ''">所有文件夹</button>
      <button v-for="name in folderList" :key="name" type="button" class="m-chip" :class="{ 'is-active': folder === name }" @click="folder = name">{{ name }}</button>
      <button type="button" class="m-chip" @click="newFolder"><FolderPlus :size="14" /> 新建</button>
    </div>

    <div v-if="shown.length" class="grid" data-testid="assets-grid">
      <button v-for="item in shown" :key="item.id" type="button" class="tile" @click="selected = item">
        <CloudImage v-if="item.kind === 'image'" :file-id="item.fileId" :alt="item.name" />
        <CloudImage v-else-if="item.posterFileId" :file-id="item.posterFileId" :alt="item.name" />
        <span v-else class="tile__icon"><component :is="KIND_ICON[item.kind]" :size="26" /></span>
        <span v-if="item.kind === 'video'" class="tile__play"><Play :size="12" /></span>
        <span class="tile__label">
          <strong>{{ item.name }}</strong>
          <small>{{ [formatDuration(item.durationSec), item.folder].filter(Boolean).join(' · ') || ASSET_KIND_LABEL[item.kind] }}</small>
        </span>
      </button>
    </div>
    <div v-else class="m-card m-empty">
      <span class="m-empty__title">{{ all.length ? '没有符合条件的素材' : '素材库还是空的' }}</span>
      <span class="m-empty__text">{{ all.length ? '换个文件夹或关键词试试' : '上传常用的产品视频、空镜、Logo、背景音乐，做视频时可以直接选用' }}</span>
    </div>
  </main>

  <Teleport to="body">
    <div v-if="selected" class="sheet-backdrop" @click.self="selected = null">
      <section class="sheet" data-testid="asset-detail">
        <header class="sheet__head">
          <h2>{{ selected.name }}</h2>
          <button type="button" class="m-icon-btn" aria-label="关闭" @click="selected = null"><X :size="20" /></button>
        </header>
        <p class="meta">
          {{ ASSET_KIND_LABEL[selected.kind] }}
          <template v-if="selected.durationSec"> · {{ formatDuration(selected.durationSec) }}</template>
          <template v-if="selected.width"> · {{ selected.width }}×{{ selected.height }}</template>
          <template v-if="selected.size"> · {{ formatBytes(selected.size) }}</template>
          · {{ selected.folder || '未分类' }} · {{ relativeTime(selected.createdAt) }}
        </p>
        <div class="preview" :class="`preview--${selected.kind}`">
          <CloudImage v-if="selected.kind === 'image'" :file-id="selected.fileId" :alt="selected.name" />
          <CloudVideo v-else-if="selected.kind === 'video'" :file-id="selected.fileId" controls autoplay />
          <span v-else class="preview__audio"><Music :size="28" /><audio v-if="audioSrc" :src="audioSrc" controls /></span>
        </div>
        <div class="actions">
          <button type="button" class="m-btn" :disabled="!!busy" @click="rename"><Pencil :size="16" /> 重命名</button>
          <button type="button" class="m-btn" :disabled="!!busy" @click="move"><FolderInput :size="16" /> 移动</button>
          <button type="button" class="m-btn" :disabled="!!busy" @click="download">
            <LoaderCircle v-if="busy === 'download'" :size="16" class="m-spin" /><Download v-else :size="16" /> 下载
          </button>
          <button type="button" class="m-btn m-btn--danger" :disabled="!!busy" @click="remove"><Trash2 :size="16" /> 删除</button>
        </div>
      </section>
    </div>
  </Teleport>
  </template>
</template>

<style scoped>
.drop { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 16px; border-style: dashed; color: var(--theme-text-secondary); text-align: center; cursor: pointer; }
.drop span { font-size: 14px; font-weight: 600; }
.drop small { color: var(--theme-text-muted); font-size: 12px; }
.uploads { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; padding: 10px 12px; }
.uploads__row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.uploads__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uploads small { color: var(--theme-text-muted); font-size: 12px; }
.err { color: var(--m-red) !important; }
.bar { display: flex; flex-direction: column; gap: 0; margin-top: 14px; }
.kinds { margin-top: 10px; }
.folders { margin-top: 8px; margin-bottom: 14px; }
.m-chip svg { vertical-align: -2px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.tile { position: relative; aspect-ratio: 3 / 4; overflow: hidden; padding: 0; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-control-hover); }
.tile :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.tile__icon { display: grid; place-items: center; width: 100%; height: 100%; color: var(--theme-text-muted); }
.tile__play { position: absolute; top: 6px; right: 6px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 999px; background: rgba(0, 0, 0, .55); color: #fff; }
.tile__label { position: absolute; inset: auto 0 0; display: flex; flex-direction: column; padding: 18px 8px 6px; background: linear-gradient(transparent, rgba(0, 0, 0, .75)); color: #fff; text-align: left; }
.tile__label strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.tile__label small { font-size: 10.5px; opacity: .8; }
.sheet-backdrop { position: fixed; inset: 0; z-index: 60; display: flex; align-items: flex-end; background: var(--theme-overlay); }
.sheet { width: 100%; max-height: 92vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 12px var(--m-gutter) calc(16px + var(--m-safe-bottom)); border-radius: 22px 22px 0 0; background: var(--theme-panel); }
.sheet__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sheet__head h2 { margin: 0; overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.meta { margin: -6px 0 0; color: var(--theme-text-muted); font-size: 12px; }
.preview { align-self: center; width: 70%; aspect-ratio: 1; overflow: hidden; border-radius: 12px; background: var(--theme-control-hover); }
.preview--video { width: 46%; aspect-ratio: 9 / 16; background: #000; }
.preview--audio { width: 100%; aspect-ratio: auto; padding: 18px; color: var(--theme-text-muted); }
.preview__audio { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.preview__audio audio { width: 100%; }
.preview :deep(img), .preview :deep(video) { width: 100%; height: 100%; object-fit: contain; }
.actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.actions .m-btn { height: 44px; padding: 0 6px; font-size: 13.5px; }
</style>
