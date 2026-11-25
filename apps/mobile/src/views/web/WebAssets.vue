<script setup lang="ts">
/**
 * 素材库 for the web version — same layout as the desktop AssetLibraryView: folder pane, toolbar with
 * breadcrumb / zoom / view switch, type filter, folder cards, tiles or list, status bar and a floating
 * selection bar. Click selects, Ctrl+click adds, double-click previews, drag tiles onto a folder to move.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  RotateCcw,
  Clock,
  Download,
  Film,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  Music,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import { ASSET_ACCEPT, ASSET_KIND_LABEL, formatBytes, formatDuration, removeAsset, setTrashed, updateAsset, uploadAsset, useAssets, type AssetItem, type AssetKind } from '@/lib/assets'
import { fileBlob, fileUrl } from '@/lib/files'
import { relativeTime } from '@/lib/library'
import { downloadBlob, fileNameFor } from '@/lib/platform'
import { cloud, errorMessage } from '@/lib/session'
import { requestSync } from '@/lib/sync'
import { toast } from '@/lib/toast'

type Scope = { kind: 'all' } | { kind: 'recent' } | { kind: 'folder'; name: string }

const { all, trashed, folders } = useAssets()
const scope = ref<Scope>({ kind: 'all' })
const trashOpen = ref(false)

/* 后退 / 前进 / 上一级：和电脑端素材库一样记住走过的位置 */
const places = ref<Scope[]>([{ kind: 'all' }])
const placeIndex = ref(0)
let travelling = false
const sameScope = (a: Scope, b: Scope) => a.kind === b.kind && (a.kind !== 'folder' || a.name === (b as { name: string }).name)
watch(scope, (next) => {
  if (travelling) {
    travelling = false
    return
  }
  if (sameScope(next, places.value[placeIndex.value])) return
  places.value = places.value.slice(0, placeIndex.value + 1).concat(next)
  placeIndex.value = places.value.length - 1
})
function travel(step: number) {
  const target = placeIndex.value + step
  if (target < 0 || target >= places.value.length) return
  placeIndex.value = target
  travelling = true
  scope.value = places.value[target]
}
const filter = ref<'all' | AssetKind>('all')
const keyword = ref('')
const sort = ref<'time' | 'name' | 'size'>('time')
const view = ref<'grid' | 'list'>('grid')
const zoom = ref(172)
const selected = ref<Set<string>>(new Set())
const anchor = ref<string | null>(null)
const preview = ref<AssetItem | null>(null)
const previewAudio = ref('')
const extraFolders = ref<string[]>([])
const uploading = ref(0)
const uploadErrors = ref<string[]>([])
const usage = ref<{ fileBytes: number; quotaBytes: number } | null>(null)
const moveOpen = ref(false)
const dropFolder = ref<string | null>(null)
const input = ref<HTMLInputElement>()

const PREFS = 'tiktokcut:web-assets-view'
try {
  const saved = JSON.parse(localStorage.getItem(PREFS) || '{}')
  if (saved.view === 'list' || saved.view === 'grid') view.value = saved.view
  if (Number(saved.zoom) >= 120 && Number(saved.zoom) <= 260) zoom.value = Number(saved.zoom)
} catch {
  // first visit / storage unavailable
}
watch([view, zoom], () => {
  try {
    localStorage.setItem(PREFS, JSON.stringify({ view: view.value, zoom: zoom.value }))
  } catch {
    // ignore
  }
})

const folderList = computed(() => [...new Set([...folders.value, ...extraFolders.value])].sort((a, b) => a.localeCompare(b, 'zh-CN')))
const folderCount = (name: string) => all.value.filter((item) => (item.folder || '') === name).length
const RECENT_MS = 7 * 86_400_000

const inScope = computed(() => {
  const s = scope.value
  if (s.kind === 'recent') return all.value.filter((item) => Date.now() - item.createdAt < RECENT_MS)
  if (s.kind === 'folder') return all.value.filter((item) => (item.folder || '') === s.name)
  return all.value
})
const counts = computed(() => ({
  all: inScope.value.length,
  video: inScope.value.filter((item) => item.kind === 'video').length,
  image: inScope.value.filter((item) => item.kind === 'image').length,
  audio: inScope.value.filter((item) => item.kind === 'audio').length,
}))
const shown = computed(() => {
  const word = keyword.value.trim().toLowerCase()
  const list = inScope.value.filter((item) => (filter.value === 'all' || item.kind === filter.value) && (!word || item.name.toLowerCase().includes(word)))
  const sorted = [...list]
  if (sort.value === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  else if (sort.value === 'size') sorted.sort((a, b) => (b.size || 0) - (a.size || 0))
  else sorted.sort((a, b) => b.createdAt - a.createdAt)
  return sorted
})
// Like the desktop root folder: sub folders shown as cards above the files.
const folderCards = computed(() => (scope.value.kind === 'all' && !keyword.value.trim() && filter.value === 'all' ? folderList.value : []))
const shownBytes = computed(() => shown.value.reduce((sum, item) => sum + (item.size || 0), 0))
const selectedItems = computed(() => all.value.filter((item) => selected.value.has(item.id)))
const scopeTitle = computed(() => (scope.value.kind === 'recent' ? '最近添加' : scope.value.kind === 'folder' ? scope.value.name : '全部素材'))
const uploadFolder = computed(() => (scope.value.kind === 'folder' ? scope.value.name : ''))

watch([scope, filter, keyword], () => clearSelection())
watch(preview, async (item) => {
  previewAudio.value = ''
  if (item?.kind === 'audio') previewAudio.value = await fileUrl(item.fileId).catch(() => '')
})

async function loadUsage() {
  usage.value = await cloud.sync.usage().catch(() => null)
}

/* ------------------------------------------------------------ selection */
function clearSelection() {
  selected.value = new Set()
  anchor.value = null
  moveOpen.value = false
}
function onTileClick(item: AssetItem, event: MouseEvent) {
  const next = new Set(event.ctrlKey || event.metaKey ? selected.value : [])
  if (event.shiftKey && anchor.value) {
    const ids = shown.value.map((row) => row.id)
    const [from, to] = [ids.indexOf(anchor.value), ids.indexOf(item.id)].sort((a, b) => a - b)
    if (from >= 0) ids.slice(from, to + 1).forEach((id) => next.add(id))
  } else if ((event.ctrlKey || event.metaKey) && next.has(item.id)) {
    next.delete(item.id)
  } else {
    next.add(item.id)
    anchor.value = item.id
  }
  selected.value = next
}
function toggleMark(item: AssetItem) {
  const next = new Set(selected.value)
  if (next.has(item.id)) next.delete(item.id)
  else next.add(item.id)
  selected.value = next
  anchor.value = item.id
}

/* ------------------------------------------------------------ actions */
async function onFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || [])
  ;(event.target as HTMLInputElement).value = ''
  if (!files.length) return
  uploadErrors.value = []
  uploading.value += files.length
  let ok = 0
  for (const file of files) {
    try {
      await uploadAsset(file, uploadFolder.value)
      ok += 1
    } catch (error) {
      uploadErrors.value = [...uploadErrors.value, errorMessage(error)]
    } finally {
      uploading.value -= 1
    }
  }
  if (ok) toast(`已上传 ${ok} 个素材${uploadFolder.value ? `到「${uploadFolder.value}」` : ''}`)
  if (uploadErrors.value.length) toast(uploadErrors.value[0])
  void loadUsage()
}

function newFolder() {
  const name = window.prompt('新文件夹名称')?.trim().slice(0, 40)
  if (!name) return
  if (!folderList.value.includes(name)) extraFolders.value = [...extraFolders.value, name]
  scope.value = { kind: 'folder', name }
}

async function moveTo(items: AssetItem[], folder: string) {
  moveOpen.value = false
  const targets = items.filter((item) => (item.folder || '') !== folder)
  if (!targets.length) return
  for (const item of targets) await updateAsset(item, { folder })
  toast(`已移动 ${targets.length} 个到「${folder || '未分类'}」`)
  clearSelection()
}

async function moveToNew(items: AssetItem[]) {
  const name = window.prompt('新文件夹名称')?.trim().slice(0, 40)
  if (!name) return
  if (!folderList.value.includes(name)) extraFolders.value = [...extraFolders.value, name]
  await moveTo(items, name)
}

async function rename(item: AssetItem) {
  const name = window.prompt('素材名称', item.name)?.trim()
  if (!name || name === item.name) return
  await updateAsset(item, { name })
  if (preview.value?.id === item.id) preview.value = { ...item, name }
}

async function download(items: AssetItem[]) {
  for (const item of items.slice(0, 20)) {
    try {
      downloadBlob(await fileBlob(item.fileId), fileNameFor(item.name, item.mime))
    } catch (error) {
      toast(errorMessage(error))
    }
  }
}

async function remove(items: AssetItem[]) {
  if (!items.length) return
  const label = items.length === 1 ? `「${items[0].name}」` : `${items.length} 个素材`
  for (const item of items) await setTrashed(item, true)
  if (preview.value && items.some((item) => item.id === preview.value!.id)) preview.value = null
  clearSelection()
  toast(`已将${label}移入回收站，可在回收站恢复`)
}

/* ------------------------------------------------------------ trash / backup */
function trashAge(at?: number) {
  const days = Math.floor((Date.now() - (at || 0)) / 86_400_000)
  return days <= 0 ? '今天删除' : `${days} 天前删除`
}
async function restore(item: AssetItem) {
  await setTrashed(item, false)
  toast(`已恢复「${item.name}」`)
}
async function purge(items: AssetItem[]) {
  if (!items.length) return
  const label = items.length === 1 ? `「${items[0].name}」` : `回收站中的 ${items.length} 项`
  if (!window.confirm(`彻底删除${label}？删除后无法恢复（已经用到它们的项目和成片不受影响）。`)) return
  for (const item of items) await removeAsset(item)
  toast(`已彻底删除${label}`)
  void loadUsage()
}
/** 导出备份：素材清单（名称、文件夹、类型、云端文件 id），可以留档或交给电脑端核对 */
function exportBackup() {
  const rows = all.value.map(({ pending: _p, ...item }) => item)
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  downloadBlob(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), count: rows.length, assets: rows }, null, 2)], { type: 'application/json' }), `素材库备份-${stamp}.json`)
  toast(`已导出 ${rows.length} 项素材的备份清单`)
}

async function refresh() {
  await requestSync()
  await loadUsage()
}

/* ------------------------------------------------------------ drag tiles onto folders */
function onDragStart(item: AssetItem, event: DragEvent) {
  if (!selected.value.has(item.id)) selected.value = new Set([item.id])
  event.dataTransfer?.setData('application/x-tiktokcut-assets', [...selected.value].join(','))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function onFolderDragOver(name: string, event: DragEvent) {
  if (!event.dataTransfer?.types.includes('application/x-tiktokcut-assets')) return
  event.preventDefault()
  dropFolder.value = name
}
function onFolderDrop(name: string, event: DragEvent) {
  const ids = (event.dataTransfer?.getData('application/x-tiktokcut-assets') || '').split(',').filter(Boolean)
  dropFolder.value = null
  if (!ids.length) return
  event.preventDefault()
  void moveTo(all.value.filter((item) => ids.includes(item.id)), name)
}

/* ------------------------------------------------------------ keyboard */
function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  if (preview.value) {
    if (event.key === 'Escape') preview.value = null
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    selected.value = new Set(shown.value.map((item) => item.id))
  } else if (event.key === 'Delete' && selectedItems.value.length) {
    void remove(selectedItems.value)
  } else if (event.key === 'Escape') {
    clearSelection()
  } else if ((event.key === ' ' || event.key === 'Enter') && selectedItems.value.length === 1) {
    event.preventDefault()
    preview.value = selectedItems.value[0]
  } else if (event.key === 'F2' && selectedItems.value.length === 1) {
    event.preventDefault()
    void rename(selectedItems.value[0])
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  void loadUsage()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const KIND_ICON = { video: Film, image: ImageIcon, audio: Music }
</script>

<template>
  <main class="asset-page" data-testid="web-assets">
    <header class="asset-head">
      <span class="asset-head__icon"><FolderOpen :size="22" /></span>
      <div class="asset-head__text">
        <h1>素材库</h1>
        <p>统一管理图片、视频和音乐素材，各个工具都可以直接从这里选用。上传的文件也会同步到电脑端素材库的「网页素材库」文件夹。</p>
      </div>
      <div class="asset-head__actions">
        <button type="button" class="vg-btn vg-btn--primary" data-testid="assets-upload" @click="input?.click()"><Upload :size="15" /> 上传素材</button>
      </div>
      <input ref="input" type="file" :accept="ASSET_ACCEPT" multiple hidden @change="onFiles" />
    </header>

    <section class="asset-bench">
      <!-- Folder pane -->
      <aside class="lib-side">
        <div class="lib-side__group">
          <button type="button" class="lib-side__item" :class="{ active: scope.kind === 'all' }" @click="scope = { kind: 'all' }">
            <LayoutGrid :size="15" /><span>全部素材</span><em>{{ all.length }}</em>
          </button>
          <button type="button" class="lib-side__item" :class="{ active: scope.kind === 'recent' }" @click="scope = { kind: 'recent' }">
            <Clock :size="15" /><span>最近添加</span><em>{{ all.filter((item) => Date.now() - item.createdAt < RECENT_MS).length }}</em>
          </button>
        </div>
        <div class="lib-side__label">
          <span>文件夹</span>
          <button type="button" class="vg-icon-btn vg-icon-btn--sm" title="新建文件夹" @click="newFolder"><FolderPlus :size="14" /></button>
        </div>
        <div class="lib-side__tree">
          <button
            type="button"
            class="lib-side__item"
            :class="{ active: scope.kind === 'folder' && scope.name === '', 'is-drop': dropFolder === '' }"
            @click="scope = { kind: 'folder', name: '' }"
            @dragover="onFolderDragOver('', $event)"
            @dragleave="dropFolder = null"
            @drop="onFolderDrop('', $event)"
          >
            <Folder :size="15" class="lib-side__root-icon" /><span>未分类</span><em>{{ folderCount('') }}</em>
          </button>
          <button
            v-for="name in folderList"
            :key="name"
            type="button"
            class="lib-side__item"
            :class="{ active: scope.kind === 'folder' && scope.name === name, 'is-drop': dropFolder === name }"
            @click="scope = { kind: 'folder', name }"
            @dragover="onFolderDragOver(name, $event)"
            @dragleave="dropFolder = null"
            @drop="onFolderDrop(name, $event)"
          >
            <Folder :size="15" class="lib-side__folder-icon" /><span>{{ name }}</span><em>{{ folderCount(name) }}</em>
          </button>
        </div>
        <div class="lib-side__foot">
          <button type="button" class="lib-side__item" data-testid="assets-trash" @click="trashOpen = true"><Trash2 :size="15" /><span>回收站</span><em v-if="trashed.length">{{ trashed.length }}</em></button>
          <button type="button" class="lib-side__item" :disabled="!all.length" @click="exportBackup"><Download :size="15" /><span>导出备份</span></button>
          <div class="lib-side__storage" :title="usage ? `已用 ${formatBytes(usage.fileBytes)}，共 ${formatBytes(usage.quotaBytes)}` : ''">
            <HardDrive :size="13" />
            <span v-if="usage">{{ formatBytes(usage.fileBytes) || '0 KB' }} / {{ formatBytes(usage.quotaBytes) }}</span>
            <span v-else>同步空间</span>
          </div>
          <div v-if="usage" class="lib-side__meter"><span :style="{ width: `${Math.min(100, (usage.fileBytes / Math.max(1, usage.quotaBytes)) * 100)}%` }"></span></div>
        </div>
      </aside>

      <!-- Main pane -->
      <div class="lib-main">
        <div class="lib-bar">
          <div class="asset-nav">
            <button type="button" class="vg-icon-btn vg-icon-btn--sm" title="后退" :disabled="placeIndex <= 0" @click="travel(-1)"><ArrowLeft :size="15" /></button>
            <button type="button" class="vg-icon-btn vg-icon-btn--sm" title="前进" :disabled="placeIndex >= places.length - 1" @click="travel(1)"><ArrowRight :size="15" /></button>
            <button type="button" class="vg-icon-btn vg-icon-btn--sm" title="上一级" :disabled="scope.kind === 'all'" @click="scope = { kind: 'all' }"><ArrowUp :size="15" /></button>
          </div>
          <nav class="asset-breadcrumbs" aria-label="位置">
            <button type="button" :class="{ current: scope.kind === 'all' }" @click="scope = { kind: 'all' }"><FolderOpen :size="15" /> 素材库</button>
            <template v-if="scope.kind !== 'all'">
              <ChevronRight :size="14" class="asset-breadcrumbs__sep" />
              <span class="asset-breadcrumbs__current">{{ scope.kind === 'folder' && !scope.name ? '未分类' : scopeTitle }}</span>
            </template>
          </nav>
          <div class="lib-bar__tools">
            <label v-if="view === 'grid'" class="asset-zoom" title="缩略图大小">
              <ImageIcon :size="13" />
              <input v-model.number="zoom" type="range" min="120" max="260" step="4" />
              <ImageIcon :size="16" />
            </label>
            <div class="asset-view-toggle">
              <button type="button" :class="{ active: view === 'grid' }" title="网格" @click="view = 'grid'"><LayoutGrid :size="15" /></button>
              <button type="button" :class="{ active: view === 'list' }" title="列表" @click="view = 'list'"><List :size="15" /></button>
            </div>
            <span class="lib-bar__divider"></span>
            <button type="button" class="vg-btn vg-btn--sm" @click="newFolder"><FolderPlus :size="14" /> 新建文件夹</button>
            <button type="button" class="vg-icon-btn" title="刷新" @click="refresh"><RefreshCw :size="15" /></button>
          </div>
        </div>
        <div class="lib-bar lib-bar--filters">
          <label class="vg-search asset-search">
            <Search :size="14" />
            <input v-model="keyword" class="vg-input vg-input--sm" placeholder="搜索素材名称" />
          </label>
          <div class="asset-filter">
            <button v-for="key in (['all', 'image', 'video', 'audio'] as const)" :key="key" type="button" :class="{ active: filter === key }" @click="filter = key">
              {{ key === 'all' ? '全部' : ASSET_KIND_LABEL[key] }} <em>{{ counts[key] }}</em>
            </button>
          </div>
          <span class="lib-bar__spacer"></span>
          <label class="asset-sort">
            <ArrowDownUp :size="14" />
            <select v-model="sort" class="vg-select vg-select--sm">
              <option value="time">添加时间</option>
              <option value="name">名称</option>
              <option value="size">大小</option>
            </select>
          </label>
        </div>

        <div class="lib-body" @click.self="clearSelection">
          <template v-if="folderCards.length">
            <div class="asset-section-title">文件夹 <em>{{ folderCards.length }}</em></div>
            <div class="asset-folder-grid">
              <button
                v-for="name in folderCards"
                :key="name"
                type="button"
                class="asset-folder"
                :class="{ 'is-drop': dropFolder === name }"
                @dblclick="scope = { kind: 'folder', name }"
                @click="scope = { kind: 'folder', name }"
                @dragover="onFolderDragOver(name, $event)"
                @dragleave="dropFolder = null"
                @drop="onFolderDrop(name, $event)"
              >
                <span class="asset-folder__icon"><Folder :size="18" /></span>
                <span class="asset-folder__text"><strong>{{ name }}</strong><small>{{ folderCount(name) }} 项</small></span>
              </button>
            </div>
            <div v-if="shown.length" class="asset-section-title">素材 <em>{{ shown.length }}</em></div>
          </template>

          <div v-if="shown.length && view === 'grid'" class="asset-grid__items" :style="{ '--tile': `${zoom}px` }" data-testid="web-assets-grid" @click.self="clearSelection">
            <div
              v-for="item in shown"
              :key="item.id"
              class="asset-tile"
              :class="{ selected: selected.has(item.id) }"
              draggable="true"
              :title="item.name"
              @click="onTileClick(item, $event)"
              @dblclick="preview = item"
              @dragstart="onDragStart(item, $event)"
            >
              <div class="asset-thumb">
                <CloudImage v-if="item.kind === 'image'" :file-id="item.fileId" :alt="item.name" />
                <CloudImage v-else-if="item.posterFileId" :file-id="item.posterFileId" :alt="item.name" />
                <span v-else class="asset-thumb__icon"><component :is="KIND_ICON[item.kind]" :size="26" /></span>
                <span v-if="item.kind === 'video'" class="asset-thumb__play"><Play :size="16" /></span>
                <span v-if="item.durationSec" class="asset-thumb__badge">{{ formatDuration(item.durationSec) }}</span>
                <button type="button" class="asset-select-mark" :aria-pressed="selected.has(item.id)" title="选择" @click.stop="toggleMark(item)">✓</button>
                <div class="asset-tile-actions" @click.stop>
                  <button type="button" title="预览" @click="preview = item"><Play :size="13" /></button>
                  <button type="button" title="下载" @click="download([item])"><Download :size="13" /></button>
                </div>
              </div>
              <div class="asset-meta">
                <strong>{{ item.name }}</strong>
                <small>{{ ASSET_KIND_LABEL[item.kind] }}<template v-if="item.size"><span class="asset-meta__dot">·</span>{{ formatBytes(item.size) }}</template><span class="asset-meta__dot">·</span>{{ relativeTime(item.createdAt) }}</small>
              </div>
            </div>
          </div>

          <div v-else-if="shown.length" class="asset-list" data-testid="web-assets-list">
            <div class="asset-list__head">
              <span></span><span>名称</span><span>类型</span><span class="num">时长</span><span class="num">大小</span><span>文件夹</span><span>添加时间</span>
            </div>
            <div
              v-for="item in shown"
              :key="item.id"
              class="asset-row"
              :class="{ selected: selected.has(item.id) }"
              draggable="true"
              @click="onTileClick(item, $event)"
              @dblclick="preview = item"
              @dragstart="onDragStart(item, $event)"
            >
              <span class="asset-row__thumb">
                <CloudImage v-if="item.kind === 'image'" :file-id="item.fileId" :alt="item.name" />
                <CloudImage v-else-if="item.posterFileId" :file-id="item.posterFileId" :alt="item.name" />
                <component :is="KIND_ICON[item.kind]" v-else :size="16" />
              </span>
              <span class="asset-row__name">{{ item.name }}</span>
              <span class="asset-row__muted">{{ ASSET_KIND_LABEL[item.kind] }}</span>
              <span class="asset-row__muted num">{{ formatDuration(item.durationSec) || '—' }}</span>
              <span class="asset-row__muted num">{{ formatBytes(item.size) || '—' }}</span>
              <span class="asset-row__muted">{{ item.folder || '未分类' }}</span>
              <span class="asset-row__muted">{{ new Date(item.createdAt).toLocaleString() }}</span>
            </div>
          </div>

          <div v-else-if="!folderCards.length" class="asset-empty">
            <span class="asset-empty__art"><FolderOpen :size="30" /></span>
            <strong>{{ all.length ? '没有符合条件的素材' : '素材库还是空的' }}</strong>
            <span>{{ all.length ? '换个文件夹、类型或关键词试试' : '把图片、视频或音乐拖到这里，或者点「上传素材」。支持 JPG、PNG、WEBP、MP4、MOV、WEBM、MP3 等，单个文件最大 200MB。' }}</span>
            <div class="asset-empty__actions">
              <button type="button" class="vg-btn vg-btn--primary" @click="input?.click()"><Upload :size="15" /> 上传素材</button>
            </div>
          </div>
        </div>

        <!-- Selection bar -->
        <div v-if="selectedItems.length" class="asset-selection-bar" data-testid="assets-selection-bar">
          <span class="asset-selection-bar__count"><b>{{ selectedItems.length }}</b> 已选</span>
          <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm" @click="download(selectedItems)"><Download :size="14" /> 下载</button>
          <div class="vg-menu-wrap">
            <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm" @click="moveOpen = !moveOpen"><FolderInput :size="14" /> 移动到</button>
            <div v-if="moveOpen" class="vg-menu vg-menu--up vg-menu--left asset-move-menu">
              <button type="button" @click="moveTo(selectedItems, '')"><Folder :size="14" /> 未分类</button>
              <button v-for="name in folderList" :key="name" type="button" @click="moveTo(selectedItems, name)"><Folder :size="14" /> {{ name }}</button>
              <button type="button" @click="moveToNew(selectedItems)"><FolderPlus :size="14" /> 新建文件夹…</button>
            </div>
          </div>
          <button v-if="selectedItems.length === 1" type="button" class="vg-btn vg-btn--ghost vg-btn--sm" @click="rename(selectedItems[0])"><Pencil :size="14" /> 重命名</button>
          <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm asset-danger" @click="remove(selectedItems)"><Trash2 :size="14" /> 删除</button>
          <button type="button" class="vg-icon-btn vg-icon-btn--sm" title="取消选择" @click="clearSelection"><X :size="14" /></button>
        </div>

        <footer class="lib-status">
          <span>{{ scopeTitle }} · {{ shown.length }} 项<template v-if="shownBytes"> · {{ formatBytes(shownBytes) }}</template></span>
          <span v-if="uploading" class="lib-status__busy"><Loader2 :size="12" class="vg-spin" /> 正在上传 {{ uploading }} 个</span>
          <span class="lib-status__keys"><kbd>双击</kbd> 预览 <kbd>F2</kbd> 重命名 <kbd>Del</kbd> 移入回收站 <kbd>Ctrl</kbd>+<kbd>A</kbd> 全选 · 可把文件直接拖进来</span>
        </footer>
      </div>
    </section>

    <!-- Preview -->
    <div v-if="preview" class="vg-backdrop" @click.self="preview = null">
      <section class="vg-dialog vg-dialog--wide asset-preview" data-testid="asset-preview">
        <header class="vg-dialog__head">
          <span class="vg-dialog__title"><component :is="KIND_ICON[preview.kind]" :size="16" /> {{ preview.name }}</span>
          <button type="button" class="vg-icon-btn" aria-label="关闭" @click="preview = null"><X :size="16" /></button>
        </header>
        <div class="vg-dialog__body asset-preview__body">
          <div class="asset-preview__media" :class="`is-${preview.kind}`">
            <CloudImage v-if="preview.kind === 'image'" :file-id="preview.fileId" :alt="preview.name" />
            <CloudVideo v-else-if="preview.kind === 'video'" :file-id="preview.fileId" controls autoplay />
            <div v-else class="asset-preview__audio"><Music :size="34" /><audio v-if="previewAudio" :src="previewAudio" controls autoplay /></div>
          </div>
          <dl class="vg-kv asset-preview__info">
            <dt>类型</dt><dd>{{ ASSET_KIND_LABEL[preview.kind] }}</dd>
            <template v-if="preview.durationSec"><dt>时长</dt><dd>{{ formatDuration(preview.durationSec) }}</dd></template>
            <template v-if="preview.width"><dt>尺寸</dt><dd>{{ preview.width }} × {{ preview.height }}</dd></template>
            <template v-if="preview.size"><dt>大小</dt><dd>{{ formatBytes(preview.size) }}</dd></template>
            <dt>文件夹</dt><dd>{{ preview.folder || '未分类' }}</dd>
            <dt>添加时间</dt><dd>{{ new Date(preview.createdAt).toLocaleString() }}</dd>
          </dl>
        </div>
        <footer class="vg-dialog__foot">
          <button type="button" class="vg-btn vg-btn--ghost asset-danger" @click="remove([preview])"><Trash2 :size="14" /> 移入回收站</button>
          <div class="vg-dialog__foot-actions">
            <button type="button" class="vg-btn" @click="rename(preview)"><Pencil :size="14" /> 重命名</button>
            <button type="button" class="vg-btn vg-btn--primary" @click="download([preview])"><Download :size="14" /> 下载</button>
          </div>
        </footer>
      </section>
    </div>

    <!-- Trash -->
    <div v-if="trashOpen" class="vg-backdrop" @click.self="trashOpen = false">
      <section class="vg-dialog vg-dialog--wide" data-testid="assets-trash-dialog">
        <header class="vg-dialog__head">
          <span class="vg-dialog__title"><Trash2 :size="16" /> 回收站 <em class="asset-trash__count">{{ trashed.length }}</em></span>
          <button type="button" class="vg-icon-btn" aria-label="关闭" @click="trashOpen = false"><X :size="16" /></button>
        </header>
        <div class="vg-dialog__body">
          <ul v-if="trashed.length" class="asset-trash">
            <li v-for="item in trashed" :key="item.id">
              <span class="asset-trash__thumb">
                <CloudImage v-if="item.kind === 'image' || item.posterFileId" :file-id="item.posterFileId || item.fileId" :alt="item.name" />
                <component :is="KIND_ICON[item.kind]" v-else :size="16" />
              </span>
              <span class="asset-trash__text"><strong>{{ item.name }}</strong><small>{{ item.folder || '未分类' }} · {{ trashAge(item.trashedAt) }}<template v-if="item.size"> · {{ formatBytes(item.size) }}</template></small></span>
              <button type="button" class="vg-btn vg-btn--sm" @click="restore(item)"><RotateCcw :size="13" /> 恢复</button>
              <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm asset-danger" @click="purge([item])">彻底删除</button>
            </li>
          </ul>
          <div v-else class="vg-empty"><span class="vg-empty__icon"><Trash2 :size="20" /></span><p>回收站是空的</p></div>
        </div>
        <footer class="vg-dialog__foot">
          <span class="vg-muted asset-trash__hint">移入回收站的素材不会在各处显示，恢复后回到原文件夹</span>
          <button type="button" class="vg-btn vg-btn--ghost asset-danger" :disabled="!trashed.length" @click="purge(trashed)">清空回收站</button>
        </footer>
      </section>
    </div>
  </main>
</template>

<style scoped>
/* Mirrors src/renderer/src/ui/views/AssetLibraryView.vue. */
.asset-page { display: flex; flex-direction: column; gap: 12px; height: calc(100vh - 48px); min-height: 520px; padding: 14px 20px 16px; }
.asset-head { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
.asset-head__icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); flex-shrink: 0; }
.asset-head__text { flex: 1; min-width: 0; }
.asset-head__text h1 { font-size: 20px; font-weight: 800; line-height: 1.25; }
.asset-head__text p { margin-top: 2px; font-size: 13px; color: var(--theme-text-muted); }
.asset-head__actions { display: flex; gap: 8px; }

.asset-bench { position: relative; display: grid; grid-template-columns: 204px minmax(0, 1fr); flex: 1; min-height: 0; overflow: hidden; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-lg); background: var(--theme-panel); }

.lib-side { display: flex; flex-direction: column; gap: 4px; min-height: 0; padding: 12px 10px; border-right: 1px solid var(--theme-divider); background: color-mix(in srgb, var(--theme-panel-soft) 45%, var(--theme-panel)); }
.lib-side__group { display: flex; flex-direction: column; gap: 2px; }
.lib-side__label { display: flex; align-items: center; justify-content: space-between; padding: 14px 4px 4px 10px; font-size: 11px; font-weight: 700; letter-spacing: .04em; color: var(--theme-text-muted); }
.lib-side__tree { display: flex; flex-direction: column; gap: 1px; flex: 1; min-height: 60px; overflow-y: auto; }
.lib-side__item { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--theme-text-secondary); font-size: 13px; text-align: left; cursor: pointer; transition: background .12s, color .12s, border-color .12s; }
.lib-side__item > svg { flex-shrink: 0; color: var(--theme-text-muted); }
.lib-side__item > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lib-side__item > em { flex-shrink: 0; font-style: normal; font-size: 11px; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; }
.lib-side__item:hover { background: var(--theme-panel-soft); color: var(--theme-text); }
.lib-side__item.active { background: var(--vg-accent-soft); color: var(--vg-accent); font-weight: 600; }
.lib-side__item.active > svg, .lib-side__item.active > em { color: var(--vg-accent); }
.lib-side__item.is-drop { border-color: var(--vg-accent); background: var(--vg-accent-soft); color: var(--vg-accent); }
.lib-side__item > .lib-side__folder-icon { color: var(--vg-amber); }
.lib-side__item > .lib-side__root-icon { color: var(--theme-text-muted); }
.lib-side__foot { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; border-top: 1px solid var(--theme-divider); }
.lib-side__storage { display: flex; align-items: center; gap: 7px; padding: 4px 10px 0; font-size: 11px; color: var(--theme-text-muted); }
.lib-side__storage svg { flex-shrink: 0; color: var(--vg-accent); }
.lib-side__meter { height: 4px; margin: 0 10px 2px; overflow: hidden; border-radius: 4px; background: var(--theme-control); }
.lib-side__meter span { display: block; height: 100%; border-radius: 4px; background: var(--vg-accent); }

.lib-main { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.lib-bar { display: flex; align-items: center; gap: 8px; min-height: 46px; padding: 7px 12px; border-bottom: 1px solid var(--theme-divider); }
.lib-bar--filters { min-height: 44px; }
.lib-bar__tools { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.lib-bar__spacer { flex: 1; }
.lib-bar__divider { width: 1px; height: 20px; margin: 0 6px; background: var(--theme-divider); }
.asset-nav { display: flex; gap: 2px; margin-right: 4px; }
.asset-trash { display: flex; flex-direction: column; gap: 6px; max-height: 56vh; margin: 0; padding: 0; overflow: auto; list-style: none; }
.asset-trash li { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--theme-border); border-radius: 10px; }
.asset-trash__thumb { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; overflow: hidden; border-radius: 8px; background: var(--theme-panel-soft); color: var(--theme-text-muted); }
.asset-trash__thumb :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.asset-trash__text { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
.asset-trash__text strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.asset-trash__text small, .asset-trash__hint { color: var(--theme-text-muted); font-size: 12px; }
.asset-trash__count { margin-left: 4px; color: var(--theme-text-muted); font-style: normal; font-weight: 500; }
.asset-breadcrumbs { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; overflow: hidden; }
.asset-breadcrumbs button, .asset-breadcrumbs__current { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 8px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--theme-text-secondary); font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
.asset-breadcrumbs button { cursor: pointer; }
.asset-breadcrumbs button svg { color: var(--vg-accent); }
.asset-breadcrumbs button:hover { background: var(--theme-panel-soft); color: var(--theme-text); }
.asset-breadcrumbs button.current, .asset-breadcrumbs__current { color: var(--theme-text); font-weight: 700; }
.asset-breadcrumbs__sep { flex-shrink: 0; color: var(--theme-text-muted); }
.asset-search { flex: 1 1 220px; max-width: 340px; min-width: 160px; }
.asset-filter, .asset-view-toggle { display: inline-flex; padding: 2px; gap: 2px; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-panel-soft); }
.asset-filter button, .asset-view-toggle button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-secondary); font-size: 12px; font-weight: 500; cursor: pointer; transition: background .12s, color .12s; }
.asset-view-toggle button { width: 30px; padding: 0; }
.asset-filter button em { font-style: normal; font-size: 11px; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; }
.asset-filter button:hover, .asset-view-toggle button:hover { color: var(--theme-text); }
.asset-filter button.active, .asset-view-toggle button.active { background: var(--theme-panel); color: var(--vg-accent); font-weight: 600; box-shadow: 0 0 0 1px var(--vg-accent-line); }
.asset-filter button.active em { color: var(--vg-accent); }
.asset-sort { display: inline-flex; align-items: center; gap: 6px; color: var(--theme-text-muted); }
.asset-zoom { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 4px; color: var(--theme-text-muted); }
.asset-zoom input { width: 96px; accent-color: var(--vg-accent); cursor: pointer; }

.lib-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px; }
.asset-section-title { display: flex; align-items: center; gap: 8px; margin: 2px 2px 10px; font-size: 12px; font-weight: 700; color: var(--theme-text-secondary); }
.asset-section-title em { font-style: normal; font-weight: 500; color: var(--theme-text-muted); }
.asset-folder-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 20px; }
.asset-folder { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 10px 8px 10px 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel); color: var(--theme-text); text-align: left; cursor: pointer; transition: border-color .15s, background .15s, box-shadow .15s; }
.asset-folder:hover { border-color: var(--theme-border-control); background: var(--theme-panel-soft); }
.asset-folder.is-drop { border-color: var(--vg-accent); background: var(--vg-accent-soft); box-shadow: 0 0 0 3px var(--vg-accent-soft); }
.asset-folder__icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 9px; background: color-mix(in srgb, var(--vg-amber) 14%, transparent); color: var(--vg-amber); flex-shrink: 0; }
.asset-folder__text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.asset-folder__text strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-folder__text small { font-size: 11px; color: var(--theme-text-muted); }

.asset-grid__items { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--tile, 172px), 1fr)); gap: 10px; }
.asset-tile { position: relative; display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 6px 6px 8px; border: 1px solid transparent; border-radius: 12px; cursor: default; transition: background .12s, border-color .12s; user-select: none; }
.asset-tile:hover { background: var(--theme-panel-soft); }
.asset-tile.selected { background: var(--vg-accent-soft); border-color: var(--vg-accent-line); }
.asset-tile.selected .asset-thumb { box-shadow: 0 0 0 2px var(--vg-accent); }
.asset-thumb { position: relative; display: grid; place-items: center; aspect-ratio: 1; overflow: hidden; border-radius: 8px; background: var(--theme-panel-soft); box-shadow: inset 0 0 0 1px var(--theme-border); }
.asset-thumb :deep(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
.asset-thumb__icon { display: grid; place-items: center; width: 100%; height: 100%; color: var(--theme-text-muted); }
.asset-thumb__play { position: absolute; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; background: rgba(0, 0, 0, .55); color: #fff; backdrop-filter: blur(4px); pointer-events: none; }
.asset-thumb__play svg { margin-left: 2px; fill: currentColor; }
.asset-thumb__badge { position: absolute; right: 6px; bottom: 6px; height: 18px; padding: 0 6px; border-radius: 5px; background: rgba(0, 0, 0, .58); color: #fff; font-size: 10px; font-weight: 600; line-height: 18px; pointer-events: none; }
.asset-select-mark { position: absolute; z-index: 2; top: 7px; left: 7px; display: grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 1.5px solid rgba(255, 255, 255, .9); border-radius: 6px; background: rgba(0, 0, 0, .28); color: transparent; font-size: 13px; font-weight: 800; cursor: pointer; opacity: 0; transition: opacity .12s, background .12s; }
.asset-tile:hover .asset-select-mark, .asset-tile.selected .asset-select-mark { opacity: 1; }
.asset-tile.selected .asset-select-mark { border-color: var(--vg-accent); background: var(--vg-accent); color: var(--theme-on-accent, #fff); }
.asset-tile-actions { position: absolute; z-index: 2; top: 7px; right: 7px; display: flex; gap: 4px; opacity: 0; transform: translateY(-3px); transition: opacity .12s, transform .12s; }
.asset-tile:hover .asset-tile-actions { opacity: 1; transform: none; }
.asset-tile-actions button { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 7px; background: rgba(0, 0, 0, .55); color: #fff; cursor: pointer; backdrop-filter: blur(4px); }
.asset-tile-actions button:hover { background: var(--vg-accent); }
.asset-meta { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 0 3px; }
.asset-meta strong { font-size: 12.5px; font-weight: 600; color: var(--theme-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-meta small { display: flex; align-items: center; gap: 4px; min-width: 0; font-size: 11px; color: var(--theme-text-muted); white-space: nowrap; overflow: hidden; }
.asset-meta__dot { opacity: .6; }

.asset-list { display: flex; flex-direction: column; --cols: 44px minmax(180px, 1fr) 64px 70px 84px 120px 150px; }
.asset-list__head, .asset-row { display: grid; grid-template-columns: var(--cols); align-items: center; gap: 12px; padding: 0 10px; }
.asset-list__head { height: 34px; margin-bottom: 6px; border-bottom: 1px solid var(--theme-divider); font-size: 11px; font-weight: 600; color: var(--theme-text-muted); }
.asset-list .num { justify-content: flex-end; text-align: right; }
.asset-row { min-height: 50px; border: 1px solid transparent; border-radius: 9px; cursor: default; user-select: none; }
.asset-row:hover { background: var(--theme-panel-soft); }
.asset-row.selected { background: var(--vg-accent-soft); border-color: var(--vg-accent-line); }
.asset-row__thumb { display: grid; place-items: center; width: 40px; height: 40px; overflow: hidden; border-radius: 7px; background: var(--theme-panel-soft); color: var(--theme-text-muted); box-shadow: inset 0 0 0 1px var(--theme-border); }
.asset-row__thumb :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.asset-row__name { min-width: 0; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-row__muted { display: flex; align-items: center; min-width: 0; font-size: 12px; color: var(--theme-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }

.asset-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 100%; padding: 40px 16px; text-align: center; color: var(--theme-text-muted); font-size: 13px; }
.asset-empty__art { display: grid; place-items: center; width: 72px; height: 72px; margin-bottom: 6px; border-radius: 20px; background: var(--vg-accent-soft); border: 1px dashed var(--vg-accent-line); color: var(--vg-accent); }
.asset-empty strong { color: var(--theme-text); font-size: 16px; }
.asset-empty span { max-width: 440px; line-height: 1.6; }
.asset-empty__actions { display: flex; gap: 8px; margin-top: 6px; }

.asset-selection-bar { position: absolute; z-index: 20; left: 50%; bottom: 46px; transform: translateX(-50%); display: flex; align-items: center; gap: 2px; max-width: calc(100% - 28px); padding: 5px 6px 5px 14px; border: 1px solid var(--theme-border-control); border-radius: 12px; background: var(--theme-panel); box-shadow: var(--theme-shadow-dialog); white-space: nowrap; }
.asset-selection-bar__count { display: inline-flex; align-items: center; gap: 6px; margin-right: 8px; font-size: 12px; color: var(--theme-text-muted); }
.asset-selection-bar__count b { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: var(--vg-accent); color: var(--theme-on-accent, #fff); font-size: 12px; }
.asset-move-menu { max-height: 280px; overflow-y: auto; }
.asset-danger { color: var(--vg-red); }

.lib-status { display: flex; align-items: center; gap: 14px; height: 32px; padding: 0 14px; border-top: 1px solid var(--theme-divider); font-size: 11px; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.lib-status__busy { display: inline-flex; align-items: center; gap: 5px; color: var(--vg-accent); }
.lib-status__keys { margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lib-status kbd { display: inline-block; min-width: 18px; padding: 0 4px; margin: 0 2px 0 6px; border: 1px solid var(--theme-border); border-bottom-width: 2px; border-radius: 4px; background: var(--theme-panel-soft); font-family: inherit; font-size: 10px; line-height: 15px; text-align: center; color: var(--theme-text-secondary); }

.asset-preview__body { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 18px; align-items: start; }
.asset-preview__media { display: grid; place-items: center; min-height: 320px; max-height: 64vh; overflow: hidden; border-radius: 10px; background: #000; }
.asset-preview__media :deep(img), .asset-preview__media :deep(video) { max-width: 100%; max-height: 64vh; object-fit: contain; }
.asset-preview__media.is-audio { background: var(--theme-panel-soft); }
.asset-preview__audio { display: flex; flex-direction: column; align-items: center; gap: 14px; width: 100%; padding: 24px; color: var(--theme-text-muted); }
.asset-preview__audio audio { width: 100%; }
.asset-preview__info { align-content: start; }

@media (max-width: 1180px) {
  .asset-bench { grid-template-columns: 172px minmax(0, 1fr); }
  .lib-status__keys { display: none; }
}
</style>
