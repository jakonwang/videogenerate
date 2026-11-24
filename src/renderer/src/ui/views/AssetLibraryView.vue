<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArchiveRestore, ArrowDownWideNarrow, ArrowLeft, ArrowRight, ArrowUp, ArrowUpNarrowWide, Check, ChevronDown, ChevronRight, CircleAlert,
  Clipboard, ClipboardPaste, Clock, Cloud, Copy, CopyPlus, Crop, Download, ExternalLink, Eye, Folder, FolderInput, FolderOpen, FolderPlus,
  HardDrive, Image as ImageIcon, Images, LayoutGrid, Link, List, MoreHorizontal, PanelRightClose, PanelRightOpen, Pencil, Play,
  RefreshCw, Scissors, Search, ShieldCheck, Smartphone, Trash2, Upload, Video, X,
} from 'lucide-vue-next'
import QRCode from 'qrcode'
import type { AssetFolder, AssetLibraryAudit, AssetLibraryTrash, LibraryAsset } from '../../../../shared/assetLibrary'
import AssetImageEditor from '../components/asset-library/AssetImageEditor.vue'
import AssetLightbox from '../components/asset-library/AssetLightbox.vue'
import AssetInspector from '../components/asset-library/AssetInspector.vue'
import AssetFolderPicker from '../components/asset-library/AssetFolderPicker.vue'
import { descendantFolderIds, folderPathOf, formatBytes, formatDateTime, formatShortDate } from '../components/asset-library/assetFormat'

type Scope = 'folder' | 'all' | 'recent'
type SortKey = 'createdAt' | 'name' | 'size' | 'type'
type Place = { scope: Scope; folderId: string | null }

const { t } = useI18n()
const ROOT = '__root__'
const PAGE = 60
const RECENT_DAYS = 7
const PREFS_KEY = 'tiktokcut.assetLibrary.view'

function readPrefs(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Record<string, unknown> } catch { return {} }
}
const prefs = readPrefs()

/* ---------- data ---------- */
const allAssets = ref<LibraryAsset[]>([])
const allFolders = ref<AssetFolder[]>([])
const trashCount = ref(0)
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const thumbnails = ref<Record<string, string>>({})
const now = ref(Date.now())

/* ---------- navigation ---------- */
const scope = ref<Scope>('folder')
const currentFolderId = ref<string | null>(null)
const history = ref<Place[]>([{ scope: 'folder', folderId: null }])
const historyIndex = ref(0)
const collapsedFolders = ref(new Set<string>())
const query = ref('')
const filter = ref<'all' | 'image' | 'video'>('all')

/* ---------- view prefs ---------- */
const layout = ref<'grid' | 'list'>(prefs.layout === 'list' ? 'list' : 'grid')
const tileSize = ref(Math.min(300, Math.max(130, Number(prefs.tileSize) || 172)))
const thumbFit = ref<'cover' | 'contain'>(prefs.thumbFit === 'contain' ? 'contain' : 'cover')
const sortBy = ref<SortKey>((['createdAt', 'name', 'size', 'type'] as const).includes(prefs.sortBy as SortKey) ? prefs.sortBy as SortKey : 'createdAt')
const sortDirection = ref<'asc' | 'desc'>(prefs.sortDirection === 'asc' ? 'asc' : 'desc')
const inspectorOpen = ref(typeof prefs.inspectorOpen === 'boolean' ? prefs.inspectorOpen : window.innerWidth >= 1500)
watch([layout, tileSize, thumbFit, sortBy, sortDirection, inspectorOpen], () => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ layout: layout.value, tileSize: tileSize.value, thumbFit: thumbFit.value, sortBy: sortBy.value, sortDirection: sortDirection.value, inspectorOpen: inspectorOpen.value })) } catch { /* preferences are optional */ }
})

/* ---------- selection & interaction ---------- */
const selectedAssetIds = ref<string[]>([])
const selectionAnchor = ref<string | null>(null)
const clipboard = ref<{ mode: 'copy' | 'cut'; ids: string[] } | null>(null)
const visibleCount = ref(PAGE)
const scroller = ref<HTMLElement | null>(null)
const assetGrid = ref<HTMLElement | null>(null)
const sentinel = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const marquee = ref<{ startX: number; startY: number; left: number; top: number; width: number; height: number } | null>(null)
const viewMenuOpen = ref(false)
const contextMenu = ref<{ x: number; y: number; kind: 'asset' | 'folder' | 'blank'; asset?: LibraryAsset; folder?: AssetFolder } | null>(null)
const contextMenuEl = ref<HTMLElement | null>(null)

/* ---------- drag & drop ---------- */
const draggedAssetIds = ref<string[]>([])
const draggedFolderId = ref<string | null>(null)
const dropTarget = ref<string | null>(null)
const fileDragActive = ref(false)
let fileDragDepth = 0
const busyLabel = ref('')

/* ---------- dialogs ---------- */
const lightboxIndex = ref<number | null>(null)
const editAsset = ref<LibraryAsset | null>(null)
const folderDialog = ref<{ mode: 'create' | 'rename'; folder: AssetFolder | null; parentId: string | null } | null>(null)
const folderName = ref('')
const folderBusy = ref(false)
const folderError = ref('')
const assetRename = ref<LibraryAsset | null>(null)
const assetRenameValue = ref('')
const picker = ref<{ title: string; subtitle: string; confirmText: string; disabledIds?: Set<string>; initialId: string | null; onPick: (folderId: string | null) => Promise<void> } | null>(null)
const confirmState = ref<{ title: string; message: string; confirmText: string; danger?: boolean } | null>(null)
let confirmResolve: ((value: boolean) => void) | null = null
const trashOpen = ref(false)
const trash = ref<AssetLibraryTrash>({ assets: [], folders: [] })
const safetyBusy = ref(false)
const auditResult = ref<AssetLibraryAudit | null>(null)
const qrOpen = ref(false)
const qrImage = ref('')
const uploadUrl = ref('')
const expiresAt = ref(0)
const notice = ref<{ text: string; kind: 'success' | 'error'; action?: { label: string; run: () => Promise<void> } } | null>(null)
let noticeTimer: ReturnType<typeof setTimeout> | null = null
let ticker: ReturnType<typeof setInterval> | null = null
let observer: IntersectionObserver | null = null

/* ================= derived ================= */
const recentCutoff = computed(() => now.value - RECENT_DAYS * 86400000)
const isSearching = computed(() => query.value.trim().length > 0)
const foldersByParent = computed(() => {
  const map = new Map<string | null, AssetFolder[]>()
  for (const folder of allFolders.value) {
    const list = map.get(folder.parentId) || []
    list.push(folder)
    map.set(folder.parentId, list)
  }
  for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name))
  return map
})
/** Recursive asset count per folder (key ROOT = assets directly in root). */
const folderCounts = computed(() => {
  const counts = new Map<string, number>()
  const parentOf = new Map(allFolders.value.map((folder) => [folder.id, folder.parentId]))
  for (const asset of allAssets.value) {
    let id = asset.folderId || null
    if (!id) { counts.set(ROOT, (counts.get(ROOT) || 0) + 1); continue }
    const seen = new Set<string>()
    while (id && !seen.has(id)) { seen.add(id); counts.set(id, (counts.get(id) || 0) + 1); id = parentOf.get(id) ?? null }
  }
  return counts
})
const treeRows = computed(() => {
  const rows: Array<{ folder: AssetFolder; depth: number; hasChildren: boolean; open: boolean }> = []
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of foldersByParent.value.get(parentId) || []) {
      const hasChildren = Boolean(foldersByParent.value.get(folder.id)?.length)
      const open = hasChildren && !collapsedFolders.value.has(folder.id)
      rows.push({ folder, depth, hasChildren, open })
      if (open) walk(folder.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
})
const folderPath = computed(() => folderPathOf(allFolders.value, currentFolderId.value))
const recentCount = computed(() => allAssets.value.filter((item) => item.createdAt >= recentCutoff.value).length)
const library = computed(() => ({
  count: allAssets.value.length,
  images: allAssets.value.filter((item) => item.type === 'image').length,
  videos: allAssets.value.filter((item) => item.type === 'video').length,
  size: allAssets.value.reduce((sum, item) => sum + item.size, 0),
  backedUp: allAssets.value.filter((item) => item.qiniuUrl).length,
}))
const scopedAssets = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (needle) return allAssets.value.filter((item) => item.name.toLocaleLowerCase().includes(needle))
  if (scope.value === 'all') return allAssets.value
  if (scope.value === 'recent') return allAssets.value.filter((item) => item.createdAt >= recentCutoff.value)
  return allAssets.value.filter((item) => (item.folderId || null) === currentFolderId.value)
})
const typeCounts = computed(() => ({
  all: scopedAssets.value.length,
  image: scopedAssets.value.filter((item) => item.type === 'image').length,
  video: scopedAssets.value.filter((item) => item.type === 'video').length,
}))
const sortedAssets = computed(() => {
  const items = filter.value === 'all' ? [...scopedAssets.value] : scopedAssets.value.filter((item) => item.type === filter.value)
  const direction = sortDirection.value === 'asc' ? 1 : -1
  return items.sort((a, b) => {
    let result = 0
    if (sortBy.value === 'name') result = a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
    else if (sortBy.value === 'size') result = a.size - b.size
    else if (sortBy.value === 'type') result = a.type.localeCompare(b.type) || b.createdAt - a.createdAt
    else result = a.createdAt - b.createdAt
    return result * direction
  })
})
const visibleAssets = computed(() => sortedAssets.value.slice(0, visibleCount.value))
const visibleFolders = computed(() => (scope.value === 'folder' && !isSearching.value ? foldersByParent.value.get(currentFolderId.value) || [] : []))
const scopedSize = computed(() => sortedAssets.value.reduce((sum, item) => sum + item.size, 0))
const selectedAssets = computed(() => {
  const ids = new Set(selectedAssetIds.value)
  return allAssets.value.filter((item) => ids.has(item.id))
})
const selectedSize = computed(() => selectedAssets.value.reduce((sum, item) => sum + item.size, 0))
const pasteTarget = computed(() => (scope.value === 'folder' && !isSearching.value ? currentFolderId.value : null))
const canPaste = computed(() => Boolean(clipboard.value?.ids.length) && scope.value === 'folder' && !isSearching.value)
const uploadTargetName = computed(() => (scope.value === 'folder' && folderPath.value.length ? folderPath.value.at(-1)!.name : '素材库'))
const placeTitle = computed(() => {
  if (isSearching.value) return `搜索“${query.value.trim()}”`
  if (scope.value === 'all') return '全部素材'
  if (scope.value === 'recent') return `最近 ${RECENT_DAYS} 天添加`
  return folderPath.value.at(-1)?.name || '素材库'
})
const qrRemaining = computed(() => Math.max(0, Math.ceil((expiresAt.value - now.value) / 1000)))
const sortLabel = computed(() => ({ createdAt: '添加时间', name: '名称', size: '大小', type: '类型' })[sortBy.value])
const anyDialogOpen = computed(() => Boolean(lightboxIndex.value !== null || editAsset.value || folderDialog.value || assetRename.value || picker.value || confirmState.value || trashOpen.value || auditResult.value || qrOpen.value))
const lightboxAssets = computed(() => sortedAssets.value)

/* ================= loading ================= */
async function load() {
  refreshing.value = true
  error.value = ''
  try {
    const [assets, folders, trashed] = await Promise.all([
      window.api.assetLibrary.list({}) as Promise<LibraryAsset[]>,
      window.api.assetLibrary.listAllFolders() as Promise<AssetFolder[]>,
      window.api.assetLibrary.listTrash() as Promise<AssetLibraryTrash>,
    ])
    allAssets.value = assets
    allFolders.value = folders
    trashCount.value = trashed.assets.length + trashed.folders.length
    if (currentFolderId.value && !folders.some((folder) => folder.id === currentFolderId.value)) currentFolderId.value = null
    const alive = new Set(assets.map((item) => item.id))
    selectedAssetIds.value = selectedAssetIds.value.filter((id) => alive.has(id))
    if (clipboard.value) {
      const ids = clipboard.value.ids.filter((id) => alive.has(id))
      clipboard.value = ids.length ? { ...clipboard.value, ids } : null
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

/* Thumbnails: a small worker pool that always serves what is on screen first. */
const thumbInflight = new Set<string>()
const thumbFailed = new Set<string>()
let thumbQueue: string[] = []
function queueThumbnails() {
  thumbQueue = visibleAssets.value.map((item) => item.id).filter((id) => !thumbnails.value[id] && !thumbInflight.has(id) && !thumbFailed.has(id))
  pumpThumbnails()
}
function pumpThumbnails() {
  while (thumbInflight.size < 4 && thumbQueue.length) {
    const id = thumbQueue.shift()!
    thumbInflight.add(id)
    ;(window.api.assetLibrary.thumbnail(id) as Promise<string>)
      .then((data) => { thumbnails.value[id] = data })
      .catch(() => { thumbFailed.add(id) })
      .finally(() => { thumbInflight.delete(id); pumpThumbnails() })
  }
}
function invalidateThumbnail(id: string) { delete thumbnails.value[id]; thumbFailed.delete(id) }
watch(() => visibleAssets.value.map((item) => item.id).join(','), () => queueThumbnails())

watch([scope, currentFolderId, query, filter, sortBy, sortDirection, layout], () => {
  visibleCount.value = PAGE
  scroller.value?.scrollTo({ top: 0 })
})

/* ================= navigation ================= */
function go(place: Place, record = true) {
  scope.value = place.scope
  currentFolderId.value = place.scope === 'folder' ? place.folderId : null
  query.value = ''
  selectedAssetIds.value = []
  contextMenu.value = null
  if (place.scope === 'folder' && place.folderId) {
    const next = new Set(collapsedFolders.value)
    for (const folder of folderPathOf(allFolders.value, place.folderId).slice(0, -1)) next.delete(folder.id)
    collapsedFolders.value = next
  }
  if (record) {
    const current = history.value[historyIndex.value]
    if (!current || current.scope !== place.scope || current.folderId !== place.folderId) {
      history.value = history.value.slice(0, historyIndex.value + 1).concat(place)
      historyIndex.value = history.value.length - 1
    }
  }
}
function openFolder(folderId: string | null) { go({ scope: 'folder', folderId }) }
function navigateHistory(offset: number) {
  const next = historyIndex.value + offset
  if (next < 0 || next >= history.value.length) return
  historyIndex.value = next
  go(history.value[next], false)
}
function openParentFolder() {
  if (scope.value !== 'folder') return openFolder(null)
  openFolder(folderPath.value.at(-1)?.parentId || null)
}
function toggleFolderOpen(id: string) {
  const next = new Set(collapsedFolders.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  collapsedFolders.value = next
}
function setFilter(type: 'all' | 'image' | 'video') { filter.value = type }
function setSort(key: SortKey) {
  if (sortBy.value === key) sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  else { sortBy.value = key; sortDirection.value = key === 'name' || key === 'type' ? 'asc' : 'desc' }
}

/* ================= selection ================= */
function selectAsset(event: MouseEvent, asset: LibraryAsset) {
  const ids = sortedAssets.value.map((item) => item.id)
  if (event.shiftKey && selectionAnchor.value) {
    const start = ids.indexOf(selectionAnchor.value)
    const end = ids.indexOf(asset.id)
    if (start >= 0 && end >= 0) { selectedAssetIds.value = ids.slice(Math.min(start, end), Math.max(start, end) + 1); return }
  }
  if (event.ctrlKey || event.metaKey) toggleAssetSelection(asset)
  else { selectedAssetIds.value = [asset.id]; selectionAnchor.value = asset.id }
}
function toggleAssetSelection(asset: LibraryAsset) {
  selectedAssetIds.value = selectedAssetIds.value.includes(asset.id) ? selectedAssetIds.value.filter((id) => id !== asset.id) : selectedAssetIds.value.concat(asset.id)
  selectionAnchor.value = asset.id
}
function selectAll() { selectedAssetIds.value = sortedAssets.value.map((item) => item.id) }
function clearSelection() { selectedAssetIds.value = [] }

function startMarquee(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (event.button !== 0 || !assetGrid.value || target?.closest('.asset-tile, .asset-folder, button, input, a')) return
  const rect = assetGrid.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  marquee.value = { startX: x, startY: y, left: x, top: y, width: 0, height: 0 }
  if (!event.ctrlKey && !event.metaKey) selectedAssetIds.value = []
  window.addEventListener('pointermove', moveMarquee)
  window.addEventListener('pointerup', endMarquee, { once: true })
  window.addEventListener('pointercancel', endMarquee, { once: true })
  event.preventDefault()
}
function moveMarquee(event: PointerEvent) {
  if (!marquee.value || !assetGrid.value) return
  const gridRect = assetGrid.value.getBoundingClientRect()
  const x = event.clientX - gridRect.left
  const y = event.clientY - gridRect.top
  const left = Math.min(marquee.value.startX, x)
  const top = Math.min(marquee.value.startY, y)
  const width = Math.abs(x - marquee.value.startX)
  const height = Math.abs(y - marquee.value.startY)
  marquee.value = { ...marquee.value, left, top, width, height }
  if (width < 4 && height < 4) return
  selectedAssetIds.value = Array.from(assetGrid.value.querySelectorAll<HTMLElement>('[data-asset-id]')).filter((element) => {
    const r = element.getBoundingClientRect()
    return r.right >= gridRect.left + left && r.left <= gridRect.left + left + width && r.bottom >= gridRect.top + top && r.top <= gridRect.top + top + height
  }).map((element) => String(element.dataset.assetId || '')).filter(Boolean)
}
function endMarquee() {
  marquee.value = null
  window.removeEventListener('pointermove', moveMarquee)
  window.removeEventListener('pointerup', endMarquee)
  window.removeEventListener('pointercancel', endMarquee)
}

function moveSelectionBy(key: string) {
  const items = sortedAssets.value
  if (!items.length) return
  const columns = layout.value === 'grid' && assetGrid.value
    ? Math.max(1, getComputedStyle(assetGrid.value.querySelector('.asset-grid__items') || assetGrid.value).gridTemplateColumns.split(' ').length)
    : 1
  const delta = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : key === 'ArrowUp' ? -columns : columns
  const current = items.findIndex((item) => item.id === (selectionAnchor.value || selectedAssetIds.value[0]))
  const next = current < 0 ? 0 : Math.max(0, Math.min(items.length - 1, current + delta))
  if (next >= visibleCount.value) visibleCount.value = next + PAGE
  selectedAssetIds.value = [items[next].id]
  selectionAnchor.value = items[next].id
  void nextTick(() => document.querySelector(`[data-asset-id="${items[next].id}"]`)?.scrollIntoView({ block: 'nearest' }))
}

/* ================= feedback ================= */
function showNotice(text: string, kind: 'success' | 'error' = 'success', action?: { label: string; run: () => Promise<void> }) {
  notice.value = { text, kind, action }
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = null }, action ? 7000 : 2600)
}
async function runNoticeAction() {
  const action = notice.value?.action
  notice.value = null
  if (action) await guard(action.run)
}
async function guard(task: () => Promise<unknown>, label = '') {
  if (label) busyLabel.value = label
  try { await task() }
  catch (cause) { showNotice(cause instanceof Error ? cause.message : String(cause), 'error') }
  finally { if (label) busyLabel.value = '' }
}
function askConfirm(options: { title: string; message: string; confirmText: string; danger?: boolean }) {
  confirmState.value = options
  return new Promise<boolean>((resolve) => { confirmResolve = resolve })
}
function settleConfirm(value: boolean) {
  confirmResolve?.(value)
  confirmResolve = null
  confirmState.value = null
}

/* ================= asset operations ================= */
function upload() {
  return guard(async () => {
    await window.api.assetLibrary.upload(scope.value === 'folder' ? currentFolderId.value : null)
    await load()
  })
}

async function createQr() {
  await guard(async () => {
    const session = await window.api.assetLibrary.createUploadSession() as { url: string; expiresAt: number }
    uploadUrl.value = session.url
    expiresAt.value = session.expiresAt
    qrImage.value = await QRCode.toDataURL(session.url, { width: 260, margin: 1 })
    qrOpen.value = true
  })
}

function openPreview(asset: LibraryAsset) {
  contextMenu.value = null
  const index = lightboxAssets.value.findIndex((item) => item.id === asset.id)
  if (index >= 0) lightboxIndex.value = index
}
function openEditor(asset: LibraryAsset) {
  if (asset.type !== 'image') return
  contextMenu.value = null
  lightboxIndex.value = null
  editAsset.value = asset
}
async function onEdited(id: string) {
  editAsset.value = null
  invalidateThumbnail(id)
  await load()
  queueThumbnails()
  showNotice('图片已保存')
}

function openAssetRename(asset: LibraryAsset) {
  contextMenu.value = null
  assetRename.value = asset
  assetRenameValue.value = asset.name
}
async function saveAssetRename() {
  const asset = assetRename.value
  const name = assetRenameValue.value.trim()
  if (!asset || !name) return
  assetRename.value = null
  if (name === asset.name) return
  const previous = asset.name
  await guard(async () => {
    await window.api.assetLibrary.renameAsset({ id: asset.id, name })
    await load()
    showNotice(`已重命名为“${name}”`, 'success', { label: '撤销', run: async () => { await window.api.assetLibrary.renameAsset({ id: asset.id, name: previous }); await load() } })
  })
}

async function trashAssets(input: readonly string[]) {
  const ids = [...input]
  if (!ids.length) return
  const items = allAssets.value.filter((item) => ids.includes(item.id))
  const size = items.reduce((sum, item) => sum + item.size, 0)
  const ok = await askConfirm({
    title: items.length === 1 ? '移入回收站' : `将 ${items.length} 项素材移入回收站`,
    message: items.length === 1 ? `“${items[0].name}”会移入回收站，可在回收站中恢复。` : `共 ${formatBytes(size)}，可在回收站中恢复。`,
    confirmText: '移入回收站',
    danger: true,
  })
  if (!ok) return
  lightboxIndex.value = null
  await guard(async () => {
    await window.api.assetLibrary.trashAssets(ids)
    selectedAssetIds.value = selectedAssetIds.value.filter((id) => !ids.includes(id))
    await load()
    showNotice(`已将 ${ids.length} 项素材移入回收站`, 'success', { label: '撤销', run: async () => { for (const id of ids) await window.api.assetLibrary.restoreTrash({ kind: 'asset', id }); await load() } })
  })
}

async function duplicateAssets(input: readonly string[]) {
  const ids = [...input]
  if (!ids.length) return
  await guard(async () => {
    const groups = new Map<string | null, string[]>()
    for (const asset of allAssets.value.filter((item) => ids.includes(item.id))) {
      const key = asset.folderId || null
      groups.set(key, (groups.get(key) || []).concat(asset.id))
    }
    for (const [folderId, groupIds] of groups) await window.api.assetLibrary.copyAssets({ ids: groupIds, folderId })
    await load()
    showNotice(`已创建 ${ids.length} 个副本`)
  }, '正在创建副本…')
}

function moveAssetsDialog(input: readonly string[]) {
  const ids = [...input]
  if (!ids.length) return
  contextMenu.value = null
  const first = allAssets.value.find((item) => item.id === ids[0])
  picker.value = {
    title: '移动到文件夹',
    subtitle: `将 ${ids.length} 项素材移动到…`,
    confirmText: '移动到这里',
    initialId: first?.folderId || null,
    onPick: async (folderId) => {
      await window.api.assetLibrary.moveAssets({ ids, folderId })
      await load()
      const name = folderId ? allFolders.value.find((folder) => folder.id === folderId)?.name : '素材库'
      showNotice(`已移动 ${ids.length} 项到“${name}”`, 'success', { label: '打开', run: async () => openFolder(folderId) })
    },
  }
}

async function pickFolder(folderId: string | null) {
  const current = picker.value
  picker.value = null
  if (current) await guard(() => current.onPick(folderId), '正在整理素材…')
}

function copySelection(mode: 'copy' | 'cut') {
  if (!selectedAssetIds.value.length) return
  clipboard.value = { mode, ids: [...selectedAssetIds.value] }
  showNotice(mode === 'copy' ? `已复制 ${clipboard.value.ids.length} 项，进入文件夹后粘贴` : `已剪切 ${clipboard.value.ids.length} 项，进入文件夹后粘贴`)
}
async function pasteClipboard() {
  if (!clipboard.value?.ids.length || !canPaste.value) return
  const mode = clipboard.value.mode
  const ids = [...clipboard.value.ids]
  await guard(async () => {
    if (mode === 'copy') await window.api.assetLibrary.copyAssets({ ids, folderId: pasteTarget.value })
    else { await window.api.assetLibrary.moveAssets({ ids, folderId: pasteTarget.value }); clipboard.value = null }
    selectedAssetIds.value = []
    await load()
    showNotice(`已粘贴 ${ids.length} 项`)
  }, '正在整理素材…')
}

function revealAsset(asset: LibraryAsset) { void guard(() => window.api.shell.showItemInFolder(asset.filePath)) }
function openAssetExternally(asset: LibraryAsset) { void guard(() => window.api.shell.openPath(asset.filePath)) }
async function copyText(text: string, label: string) {
  await guard(async () => { await navigator.clipboard.writeText(text); showNotice(label) })
}

/* ================= folder operations ================= */
function createFolder(parentId: string | null = scope.value === 'folder' ? currentFolderId.value : null) {
  contextMenu.value = null
  folderName.value = ''
  folderError.value = ''
  folderDialog.value = { mode: 'create', folder: null, parentId }
}
function renameFolder(folder: AssetFolder) {
  contextMenu.value = null
  folderName.value = folder.name
  folderError.value = ''
  folderDialog.value = { mode: 'rename', folder, parentId: folder.parentId }
}
async function saveFolder() {
  const dialog = folderDialog.value
  const name = folderName.value.trim()
  if (!dialog) return
  if (!name) { folderError.value = '请输入文件夹名称'; return }
  folderBusy.value = true
  folderError.value = ''
  try {
    if (dialog.mode === 'create') {
      const created = await window.api.assetLibrary.createFolder({ name, parentId: dialog.parentId }) as AssetFolder | undefined
      if (dialog.parentId) { const next = new Set(collapsedFolders.value); next.delete(dialog.parentId); collapsedFolders.value = next }
      folderDialog.value = null
      await load()
      showNotice(`已创建文件夹“${created?.name || name}”`)
    } else if (dialog.folder && name !== dialog.folder.name) {
      await window.api.assetLibrary.renameFolder({ id: dialog.folder.id, name })
      folderDialog.value = null
      await load()
    } else folderDialog.value = null
  } catch (cause) { folderError.value = cause instanceof Error ? cause.message : String(cause) }
  finally { folderBusy.value = false }
}
async function trashFolder(folder: AssetFolder) {
  contextMenu.value = null
  const stats = await window.api.assetLibrary.folderStats(folder.id) as { folderCount: number; assetCount: number; totalSize: number }
  const ok = await askConfirm({
    title: `删除文件夹“${folder.name}”`,
    message: `包含 ${stats.folderCount - 1} 个子文件夹、${stats.assetCount} 项素材（${formatBytes(stats.totalSize)}），会一起移入回收站，可随时恢复。`,
    confirmText: '移入回收站',
    danger: true,
  })
  if (!ok) return
  await guard(async () => {
    await window.api.assetLibrary.trashFolder(folder.id)
    if (currentFolderId.value && descendantFolderIds(allFolders.value, folder.id).has(currentFolderId.value)) openFolder(folder.parentId)
    await load()
    showNotice(`已将文件夹“${folder.name}”移入回收站`, 'success', { label: '撤销', run: async () => { await window.api.assetLibrary.restoreTrash({ kind: 'folder', id: folder.id }); await load() } })
  })
}
function moveFolderDialog(folder: AssetFolder) {
  contextMenu.value = null
  picker.value = {
    title: '移动文件夹',
    subtitle: `将“${folder.name}”移动到…`,
    confirmText: '移动到这里',
    disabledIds: descendantFolderIds(allFolders.value, folder.id),
    initialId: folder.parentId,
    onPick: async (parentId) => {
      await window.api.assetLibrary.moveFolder({ id: folder.id, parentId })
      await load()
      showNotice(`已移动文件夹“${folder.name}”`)
    },
  }
}

/* ================= trash / safety ================= */
async function openTrash() {
  await guard(async () => { trash.value = await window.api.assetLibrary.listTrash() as AssetLibraryTrash; trashOpen.value = true })
}
async function restoreTrashItem(kind: 'asset' | 'folder', id: string) {
  await guard(async () => {
    await window.api.assetLibrary.restoreTrash({ kind, id })
    trash.value = await window.api.assetLibrary.listTrash() as AssetLibraryTrash
    await load()
  })
}
async function purgeTrashItem(kind?: 'asset' | 'folder', id?: string) {
  const ok = await askConfirm({
    title: kind ? '彻底删除' : '清空回收站',
    message: kind ? '该项会从电脑上彻底删除，无法恢复。' : `回收站中的 ${trash.value.assets.length + trash.value.folders.length} 项会从电脑上彻底删除，无法恢复。`,
    confirmText: kind ? '彻底删除' : '清空回收站',
    danger: true,
  })
  if (!ok) return
  await guard(async () => {
    await window.api.assetLibrary.purgeTrash(kind && id ? { kind, id } : undefined)
    trash.value = await window.api.assetLibrary.listTrash() as AssetLibraryTrash
    trashCount.value = trash.value.assets.length + trash.value.folders.length
  })
}
async function runAudit(repair = false) {
  safetyBusy.value = true
  try {
    auditResult.value = await window.api.assetLibrary.audit(repair) as AssetLibraryAudit
    if (repair) await load()
  } catch (cause) { showNotice(cause instanceof Error ? cause.message : String(cause), 'error') }
  finally { safetyBusy.value = false }
}
async function exportBackup() {
  safetyBusy.value = true
  try {
    const path = await window.api.assetLibrary.exportBackup() as string | null
    if (path) showNotice(`备份已导出到 ${path}`)
  } catch (cause) { showNotice(cause instanceof Error ? cause.message : String(cause), 'error') }
  finally { safetyBusy.value = false }
}
const auditIssues = computed(() => (auditResult.value ? auditResult.value.missingAssetIds.length + auditResult.value.orphanAssetIds.length + auditResult.value.orphanFolderIds.length : 0))
function trashAge(timestamp?: number) {
  if (!timestamp) return ''
  const days = Math.floor((now.value - timestamp) / 86400000)
  return days <= 0 ? '今天删除' : `${days} 天前删除`
}

/* ================= context menu ================= */
function openMenu(event: MouseEvent, kind: 'asset' | 'folder' | 'blank', payload?: { asset?: LibraryAsset; folder?: AssetFolder }) {
  event.preventDefault()
  event.stopPropagation()
  viewMenuOpen.value = false
  if (kind === 'asset' && payload?.asset && !selectedAssetIds.value.includes(payload.asset.id)) {
    selectedAssetIds.value = [payload.asset.id]
    selectionAnchor.value = payload.asset.id
  }
  contextMenu.value = { x: event.clientX, y: event.clientY, kind, ...payload }
  void nextTick(() => {
    const el = contextMenuEl.value
    if (!el || !contextMenu.value) return
    const rect = el.getBoundingClientRect()
    contextMenu.value = {
      ...contextMenu.value,
      x: Math.max(8, Math.min(contextMenu.value.x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(contextMenu.value.y, window.innerHeight - rect.height - 8)),
    }
  })
}
function openMenuFromButton(event: MouseEvent, asset: LibraryAsset) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  openMenu(new MouseEvent('contextmenu', { clientX: rect.left, clientY: rect.bottom + 4 }), 'asset', { asset })
}
function closeMenus() { contextMenu.value = null; viewMenuOpen.value = false }
function menu(action: () => unknown) { const result = action(); contextMenu.value = null; void result }

/* ================= drag & drop ================= */
function dragKind(event: DragEvent): 'files' | 'internal' | null {
  const types = Array.from(event.dataTransfer?.types || [])
  if (draggedAssetIds.value.length || draggedFolderId.value || types.includes('application/x-videogenerate-asset-ids') || types.includes('application/x-videogenerate-folder-id')) return 'internal'
  if (types.includes('Files')) return 'files'
  return null
}
function onAssetDragStart(event: DragEvent, asset: LibraryAsset) {
  draggedAssetIds.value = selectedAssetIds.value.includes(asset.id) ? [...selectedAssetIds.value] : [asset.id]
  if (!event.dataTransfer) return
  const payload = JSON.stringify(draggedAssetIds.value)
  event.dataTransfer.setData('application/x-videogenerate-asset-ids', payload)
  event.dataTransfer.setData('text/plain', `videogenerate-assets:${payload}`)
  event.dataTransfer.effectAllowed = 'copyMove'
}
function onFolderDragStart(event: DragEvent, folder: AssetFolder) {
  draggedFolderId.value = folder.id
  event.dataTransfer?.setData('application/x-videogenerate-folder-id', folder.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function onDragEnd() {
  draggedAssetIds.value = []
  draggedFolderId.value = null
  dropTarget.value = null
}
function onTargetDragOver(event: DragEvent, folderId: string | null) {
  const kind = dragKind(event)
  if (!kind || !event.dataTransfer) return
  if (kind === 'internal' && draggedFolderId.value && folderId && descendantFolderIds(allFolders.value, draggedFolderId.value).has(folderId)) return
  event.preventDefault()
  event.stopPropagation()
  event.dataTransfer.dropEffect = kind === 'files' ? 'copy' : 'move'
  dropTarget.value = folderId ?? ROOT
}
function onTargetDragLeave(event: DragEvent) {
  const current = event.currentTarget as HTMLElement | null
  const next = event.relatedTarget as Node | null
  if (current && next && current.contains(next)) return
  dropTarget.value = null
}
function onPageDragEnter(event: DragEvent) {
  if (dragKind(event) !== 'files') return
  event.preventDefault()
  fileDragDepth += 1
  fileDragActive.value = true
}
function onPageDragOver(event: DragEvent) {
  if (dragKind(event) !== 'files' || !event.dataTransfer) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}
function onPageDragLeave() {
  fileDragDepth = Math.max(0, fileDragDepth - 1)
  if (!fileDragDepth) fileDragActive.value = false
}
function resetFileDrag() { fileDragDepth = 0; fileDragActive.value = false; dropTarget.value = null }

async function onDrop(event: DragEvent, folderId: string | null) {
  event.preventDefault()
  event.stopPropagation()
  resetFileDrag()
  const customPayload = event.dataTransfer?.getData('application/x-videogenerate-asset-ids') || ''
  const textPayload = event.dataTransfer?.getData('text/plain') || ''
  const serialized = customPayload || (textPayload.startsWith('videogenerate-assets:') ? textPayload.slice('videogenerate-assets:'.length) : '')
  const assetIds = serialized ? JSON.parse(serialized) as string[] : [...draggedAssetIds.value]
  const folderToMove = event.dataTransfer?.getData('application/x-videogenerate-folder-id') || draggedFolderId.value
  const files = Array.from(event.dataTransfer?.files || [])
  onDragEnd()
  await guard(async () => {
    if (folderToMove) {
      if (folderToMove === folderId) return
      await window.api.assetLibrary.moveFolder({ id: folderToMove, parentId: folderId })
    } else if (assetIds.length) {
      const moving = assetIds.filter((id) => (allAssets.value.find((item) => item.id === id)?.folderId || null) !== folderId)
      if (!moving.length) return
      await window.api.assetLibrary.moveAssets({ ids: moving, folderId })
      showNotice(`已移动 ${moving.length} 项素材`)
    } else {
      const paths = files.map((file) => window.api.getPathForFile(file)).filter(Boolean)
      if (!paths.length) throw new Error('未识别到可导入的图片或视频文件。')
      await window.api.assetLibrary.importPaths({ paths, folderId })
      showNotice(`已导入 ${paths.length} 个文件`)
    }
    await load()
  }, '正在整理素材…')
}
function onPageDrop(event: DragEvent) {
  if (dragKind(event) !== 'files') { resetFileDrag(); return }
  void onDrop(event, scope.value === 'folder' ? currentFolderId.value : null)
}

/* ================= keyboard ================= */
function handleKeyboard(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (event.key === 'Escape' && contextMenu.value) { contextMenu.value = null; return }
  if (confirmState.value) {
    if (event.key === 'Escape') settleConfirm(false)
    else if (event.key === 'Enter') { event.preventDefault(); settleConfirm(true) }
    return
  }
  if (anyDialogOpen.value) return
  const mod = event.ctrlKey || event.metaKey
  if (mod && event.key.toLowerCase() === 'f') { event.preventDefault(); searchInput.value?.focus(); searchInput.value?.select(); return }
  if (target?.matches('input, textarea, select, [contenteditable="true"]')) {
    if (event.key === 'Escape' && target === searchInput.value) { query.value = ''; target.blur() }
    return
  }
  const single = selectedAssets.value.length === 1 ? selectedAssets.value[0] : null
  if (mod && event.key.toLowerCase() === 'a') { event.preventDefault(); selectAll() }
  else if (mod && event.key.toLowerCase() === 'c') copySelection('copy')
  else if (mod && event.key.toLowerCase() === 'x') copySelection('cut')
  else if (mod && event.key.toLowerCase() === 'v') void pasteClipboard()
  else if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); void duplicateAssets(selectedAssetIds.value) }
  else if (event.key === 'Delete') void trashAssets(selectedAssetIds.value)
  else if (event.key === 'Escape') clearSelection()
  else if ((event.key === ' ' || event.key === 'Enter') && selectedAssets.value.length) { event.preventDefault(); openPreview(selectedAssets.value[0]) }
  else if (event.key === 'F2' && single) openAssetRename(single)
  else if (event.altKey && event.key === 'ArrowUp') { event.preventDefault(); openParentFolder() }
  else if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); navigateHistory(-1) }
  else if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); navigateHistory(1) }
  else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); moveSelectionBy(event.key) }
}

/* ================= lifecycle ================= */
watch(sentinel, (el, previous) => { if (previous) observer?.unobserve(previous); if (el) observer?.observe(el) })

onMounted(async () => {
  observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting) && visibleCount.value < sortedAssets.value.length) visibleCount.value += PAGE
  }, { root: scroller.value, rootMargin: '600px 0px' })
  await load()
  ticker = setInterval(() => {
    now.value = Date.now()
    if (qrOpen.value && qrRemaining.value === 0) qrOpen.value = false
    else if (qrOpen.value) void load()
  }, 3000)
  window.addEventListener('asset-library:uploaded', load)
  window.addEventListener('keydown', handleKeyboard)
  window.addEventListener('click', closeMenus)
  if (sentinel.value) observer?.observe(sentinel.value)
})
onUnmounted(() => {
  if (ticker) clearInterval(ticker)
  if (noticeTimer) clearTimeout(noticeTimer)
  observer?.disconnect()
  window.removeEventListener('asset-library:uploaded', load)
  window.removeEventListener('keydown', handleKeyboard)
  window.removeEventListener('click', closeMenus)
  endMarquee()
})
</script>

<template>
  <div class="vg-scope asset-page" @dragenter="onPageDragEnter" @dragover="onPageDragOver" @dragleave="onPageDragLeave" @drop="onPageDrop">
    <!-- Page head -->
    <header class="asset-head">
      <div class="asset-head__icon"><FolderOpen :size="22" /></div>
      <div class="asset-head__text">
        <h1>{{ t('nav.assetLibrary') }}</h1>
        <p>统一管理图片和视频素材，所有插件都可以直接从这里选用。</p>
      </div>
      <div class="asset-head__actions">
        <button type="button" class="vg-btn" @click="createQr"><Smartphone :size="16" />手机扫码上传</button>
        <button type="button" class="vg-btn vg-btn--primary" @click="upload"><Upload :size="16" />上传素材</button>
      </div>
    </header>

    <div class="asset-bench" :class="{ 'has-inspector': inspectorOpen }">
      <!-- ============ Library sidebar ============ -->
      <aside class="lib-side" aria-label="素材库导航">
        <div class="lib-side__group">
          <button type="button" class="lib-side__item" :class="{ active: scope === 'all' && !isSearching }" @click="go({ scope: 'all', folderId: null })">
            <LayoutGrid :size="16" /><span>全部素材</span><em>{{ library.count }}</em>
          </button>
          <button type="button" class="lib-side__item" :class="{ active: scope === 'recent' && !isSearching }" @click="go({ scope: 'recent', folderId: null })">
            <Clock :size="16" /><span>最近添加</span><em>{{ recentCount }}</em>
          </button>
        </div>

        <div class="lib-side__label"><span>文件夹</span><button type="button" class="vg-icon-btn vg-icon-btn--sm" title="新建文件夹" @click="createFolder(null)"><FolderPlus :size="14" /></button></div>
        <div class="lib-side__tree">
          <button
            type="button"
            class="lib-side__item lib-side__node"
            :class="{ active: scope === 'folder' && currentFolderId === null && !isSearching, 'is-drop': dropTarget === ROOT }"
            @click="openFolder(null)"
            @contextmenu="openMenu($event, 'blank')"
            @dragover="onTargetDragOver($event, null)"
            @dragleave="onTargetDragLeave"
            @drop="onDrop($event, null)"
          >
            <span class="lib-side__twisty" /><FolderOpen :size="16" class="lib-side__root-icon" /><span>素材库</span><em>{{ folderCounts.get(ROOT) || 0 }}</em>
          </button>
          <button
            v-for="row in treeRows"
            :key="row.folder.id"
            type="button"
            class="lib-side__item lib-side__node"
            :class="{ active: scope === 'folder' && currentFolderId === row.folder.id && !isSearching, 'is-drop': dropTarget === row.folder.id }"
            :style="{ paddingLeft: `${8 + (row.depth + 1) * 14}px` }"
            draggable="true"
            @click="openFolder(row.folder.id)"
            @contextmenu="openMenu($event, 'folder', { folder: row.folder })"
            @dragstart="onFolderDragStart($event, row.folder)"
            @dragend="onDragEnd"
            @dragover="onTargetDragOver($event, row.folder.id)"
            @dragleave="onTargetDragLeave"
            @drop="onDrop($event, row.folder.id)"
          >
            <span class="lib-side__twisty" :class="{ 'is-open': row.open }" @click.stop="row.hasChildren && toggleFolderOpen(row.folder.id)"><ChevronRight v-if="row.hasChildren" :size="13" /></span>
            <FolderOpen v-if="scope === 'folder' && currentFolderId === row.folder.id" :size="16" class="lib-side__folder-icon" />
            <Folder v-else :size="16" class="lib-side__folder-icon" />
            <span>{{ row.folder.name }}</span><em>{{ folderCounts.get(row.folder.id) || 0 }}</em>
          </button>
        </div>

        <div class="lib-side__foot">
          <button type="button" class="lib-side__item" @click="openTrash"><Trash2 :size="16" /><span>回收站</span><em v-if="trashCount">{{ trashCount }}</em></button>
          <button type="button" class="lib-side__item" :disabled="safetyBusy" @click="runAudit(false)"><ShieldCheck :size="16" /><span>检查与修复</span></button>
          <button type="button" class="lib-side__item" :disabled="safetyBusy" @click="exportBackup"><Download :size="16" /><span>导出备份</span></button>
          <div class="lib-side__storage">
            <HardDrive :size="14" />
            <span>{{ formatBytes(library.size) }} · {{ library.images }} 图 · {{ library.videos }} 视频</span>
          </div>
        </div>
      </aside>

      <!-- ============ Main pane ============ -->
      <section class="lib-main" @contextmenu="openMenu($event, 'blank')">
        <div class="lib-bar">
          <div class="asset-nav-buttons">
            <button type="button" class="vg-icon-btn" :disabled="historyIndex === 0" title="后退 (Alt+←)" @click="navigateHistory(-1)"><ArrowLeft :size="16" /></button>
            <button type="button" class="vg-icon-btn" :disabled="historyIndex >= history.length - 1" title="前进 (Alt+→)" @click="navigateHistory(1)"><ArrowRight :size="16" /></button>
            <button type="button" class="vg-icon-btn" :disabled="scope === 'folder' && !currentFolderId && !isSearching" title="上一级 (Alt+↑)" @click="openParentFolder"><ArrowUp :size="16" /></button>
          </div>
          <nav class="asset-breadcrumbs" aria-label="当前位置">
            <template v-if="isSearching || scope !== 'folder'">
              <span class="asset-breadcrumbs__current"><Search v-if="isSearching" :size="15" /><LayoutGrid v-else-if="scope === 'all'" :size="15" /><Clock v-else :size="15" />{{ placeTitle }}</span>
            </template>
            <template v-else>
              <button type="button" :class="{ 'is-drop': dropTarget === ROOT, current: !folderPath.length }" @click="openFolder(null)" @dragover="onTargetDragOver($event, null)" @dragleave="onTargetDragLeave" @drop="onDrop($event, null)">素材库</button>
              <template v-for="(folder, index) in folderPath" :key="folder.id">
                <ChevronRight :size="14" class="asset-breadcrumbs__sep" />
                <button type="button" :class="{ 'is-drop': dropTarget === folder.id, current: index === folderPath.length - 1 }" @click="openFolder(folder.id)" @dragover="onTargetDragOver($event, folder.id)" @dragleave="onTargetDragLeave" @drop="onDrop($event, folder.id)">{{ folder.name }}</button>
              </template>
            </template>
          </nav>
          <div class="lib-bar__tools">
            <label v-if="layout === 'grid'" class="asset-zoom" title="缩略图大小">
              <ImageIcon :size="12" />
              <input v-model.number="tileSize" type="range" min="130" max="300" step="2" aria-label="缩略图大小" />
              <ImageIcon :size="16" />
            </label>
            <div class="asset-view-toggle" role="group" aria-label="视图模式">
              <button type="button" :class="{ active: layout === 'grid' }" title="网格视图" @click="layout = 'grid'"><LayoutGrid :size="15" /></button>
              <button type="button" :class="{ active: layout === 'list' }" title="列表视图" @click="layout = 'list'"><List :size="15" /></button>
            </div>
            <span class="lib-bar__divider" />
            <button type="button" class="vg-btn vg-btn--sm" :disabled="scope !== 'folder' || isSearching" title="在当前位置新建文件夹" @click="createFolder()"><FolderPlus :size="14" /><span>新建文件夹</span></button>
            <button type="button" class="vg-icon-btn" title="刷新" :disabled="refreshing" @click="load"><RefreshCw :size="16" :class="{ 'vg-spin': refreshing }" /></button>
            <button type="button" class="vg-icon-btn" :class="{ 'is-on': inspectorOpen }" :title="inspectorOpen ? '隐藏详情面板' : '显示详情面板'" @click="inspectorOpen = !inspectorOpen"><PanelRightClose v-if="inspectorOpen" :size="16" /><PanelRightOpen v-else :size="16" /></button>
          </div>
        </div>

        <div class="lib-bar lib-bar--filters">
          <label class="vg-search asset-search">
            <Search :size="15" />
            <input ref="searchInput" v-model="query" class="vg-input vg-input--sm" placeholder="搜索全部素材名称  Ctrl+F" />
            <button v-if="query" type="button" class="asset-search__clear" aria-label="清空搜索" @click="query = ''"><X :size="13" /></button>
          </label>
          <div class="asset-filter" role="group" aria-label="素材类型">
            <button v-for="item in ([['all', '全部'], ['image', '图片'], ['video', '视频']] as const)" :key="item[0]" type="button" :class="{ active: filter === item[0] }" @click="setFilter(item[0])">{{ item[1] }}<em>{{ typeCounts[item[0]] }}</em></button>
          </div>
          <span class="lib-bar__spacer" />
          <div class="vg-menu-wrap">
            <button type="button" class="vg-btn vg-btn--sm asset-view-btn" :class="{ 'is-open': viewMenuOpen }" @click.stop="viewMenuOpen = !viewMenuOpen; contextMenu = null">
              <ArrowDownWideNarrow v-if="sortDirection === 'desc'" :size="14" /><ArrowUpNarrowWide v-else :size="14" />{{ sortLabel }}<ChevronDown :size="13" />
            </button>
            <div v-if="viewMenuOpen" class="vg-menu asset-view-menu" @click.stop>
              <div class="asset-view-menu__label">排序方式</div>
              <button v-for="item in ([['createdAt', '添加时间'], ['name', '名称'], ['size', '文件大小'], ['type', '类型']] as const)" :key="item[0]" type="button" class="asset-sort-option" :class="{ 'is-checked': sortBy === item[0] }" @click="sortBy = item[0]"><Check :size="14" />{{ item[1] }}</button>
              <div class="asset-view-menu__divider" />
              <button type="button" :class="{ 'is-checked': sortDirection === 'asc' }" @click="sortDirection = 'asc'"><Check :size="14" />升序</button>
              <button type="button" :class="{ 'is-checked': sortDirection === 'desc' }" @click="sortDirection = 'desc'"><Check :size="14" />降序</button>
              <div class="asset-view-menu__divider" />
              <div class="asset-view-menu__label">缩略图</div>
              <button type="button" :class="{ 'is-checked': thumbFit === 'cover' }" @click="thumbFit = 'cover'"><Check :size="14" />裁切填满</button>
              <button type="button" :class="{ 'is-checked': thumbFit === 'contain' }" @click="thumbFit = 'contain'"><Check :size="14" />完整显示</button>
            </div>
          </div>
        </div>

        <div ref="scroller" class="lib-scroll">
          <div v-if="error" class="vg-notice vg-notice--danger asset-error"><CircleAlert :size="16" />{{ error }}<button type="button" class="vg-btn vg-btn--sm" @click="load">重试</button></div>

          <!-- Loading skeleton -->
          <div v-if="loading" class="asset-grid__items" :style="{ '--tile': `${tileSize}px` }">
            <div v-for="index in 12" :key="index" class="asset-skeleton"><div class="vg-skeleton" /><div class="vg-skeleton" /><div class="vg-skeleton" /></div>
          </div>

          <!-- Empty states -->
          <div v-else-if="!sortedAssets.length && !visibleFolders.length" class="asset-empty">
            <div class="asset-empty__art"><Images :size="30" /></div>
            <template v-if="isSearching">
              <strong>没有找到“{{ query.trim() }}”</strong>
              <span>换个关键词试试，搜索会覆盖所有文件夹。</span>
              <button type="button" class="vg-btn vg-btn--sm" @click="query = ''">清空搜索</button>
            </template>
            <template v-else-if="scopedAssets.length">
              <strong>没有{{ filter === 'image' ? '图片' : '视频' }}</strong>
              <span>当前位置有 {{ scopedAssets.length }} 项素材，但都不是{{ filter === 'image' ? '图片' : '视频' }}。</span>
              <button type="button" class="vg-btn vg-btn--sm" @click="filter = 'all'">显示全部类型</button>
            </template>
            <template v-else>
              <strong>{{ library.count ? (scope === 'recent' ? `最近 ${RECENT_DAYS} 天没有新素材` : '这个文件夹是空的') : '素材库还是空的' }}</strong>
              <span>把图片或视频拖到这里，或者从电脑、手机上传。支持 JPG、PNG、WEBP、GIF、MP4、MOV、WEBM、MKV。</span>
              <div class="asset-empty__actions">
                <button type="button" class="vg-btn vg-btn--primary" @click="upload"><Upload :size="16" />上传素材</button>
                <button type="button" class="vg-btn" @click="createQr"><Smartphone :size="16" />手机扫码上传</button>
              </div>
            </template>
          </div>

          <!-- Grid view -->
          <div v-else-if="layout === 'grid'" ref="assetGrid" class="asset-grid" :class="`asset-grid--${thumbFit}`" :style="{ '--tile': `${tileSize}px` }" @pointerdown="startMarquee">
            <div v-if="marquee && (marquee.width > 3 || marquee.height > 3)" class="asset-marquee" :style="{ left: `${marquee.left}px`, top: `${marquee.top}px`, width: `${marquee.width}px`, height: `${marquee.height}px` }" />

            <template v-if="visibleFolders.length">
              <div class="asset-section-title">文件夹<em>{{ visibleFolders.length }}</em></div>
              <div class="asset-folder-grid">
                <article
                  v-for="folder in visibleFolders"
                  :key="folder.id"
                  class="asset-folder"
                  :class="{ 'is-drop': dropTarget === folder.id }"
                  draggable="true"
                  @click="openFolder(folder.id)"
                  @contextmenu="openMenu($event, 'folder', { folder })"
                  @dragstart="onFolderDragStart($event, folder)"
                  @dragend="onDragEnd"
                  @dragover="onTargetDragOver($event, folder.id)"
                  @dragleave="onTargetDragLeave"
                  @drop="onDrop($event, folder.id)"
                >
                  <span class="asset-folder__icon"><Folder :size="20" /></span>
                  <span class="asset-folder__text"><strong :title="folder.name">{{ folder.name }}</strong><small>{{ folderCounts.get(folder.id) || 0 }} 项</small></span>
                  <button type="button" class="vg-icon-btn vg-icon-btn--sm asset-folder__more" title="更多操作" @click.stop="openMenu($event, 'folder', { folder })"><MoreHorizontal :size="15" /></button>
                </article>
              </div>
            </template>

            <template v-if="sortedAssets.length">
              <div v-if="visibleFolders.length" class="asset-section-title">素材<em>{{ sortedAssets.length }}</em></div>
              <div class="asset-grid__items">
                <article
                  v-for="asset in visibleAssets"
                  :key="asset.id"
                  :data-asset-id="asset.id"
                  class="asset-tile"
                  :class="{ selected: selectedAssetIds.includes(asset.id), cut: clipboard?.mode === 'cut' && clipboard.ids.includes(asset.id) }"
                  draggable="true"
                  @click="selectAsset($event, asset)"
                  @dblclick="openPreview(asset)"
                  @contextmenu="openMenu($event, 'asset', { asset })"
                  @dragstart="onAssetDragStart($event, asset)"
                  @dragend="onDragEnd"
                >
                  <div class="asset-thumb">
                    <img v-if="thumbnails[asset.id]" :src="thumbnails[asset.id]" :alt="asset.name" draggable="false" />
                    <span v-else class="asset-thumb__placeholder"><Video v-if="asset.type === 'video'" :size="26" /><ImageIcon v-else :size="26" /></span>
                    <span v-if="asset.type === 'video'" class="asset-thumb__play"><Play :size="16" /></span>
                    <span v-if="asset.type === 'video'" class="asset-thumb__badge">视频</span>
                    <button type="button" class="asset-select-mark" :aria-label="selectedAssetIds.includes(asset.id) ? '取消选择' : '选择'" @click.stop="toggleAssetSelection(asset)"><Check :size="14" /></button>
                    <div class="asset-tile-actions">
                      <button type="button" title="预览 (空格)" @click.stop="openPreview(asset)"><Eye :size="14" /></button>
                      <button type="button" title="更多操作" @click.stop="openMenuFromButton($event, asset)"><MoreHorizontal :size="14" /></button>
                    </div>
                  </div>
                  <div class="asset-meta">
                    <strong :title="asset.name">{{ asset.name }}</strong>
                    <small>
                      <span>{{ formatBytes(asset.size) }}</span><span class="asset-meta__dot">·</span><span>{{ formatShortDate(asset.createdAt) }}</span>
                      <span class="asset-meta__icons">
                        <Smartphone v-if="asset.source === 'mobile'" :size="12" title="手机上传" />
                        <Cloud v-if="asset.qiniuUrl" :size="12" class="is-cloud" title="云端已备份" />
                      </span>
                    </small>
                  </div>
                </article>
              </div>
            </template>
            <div ref="sentinel" class="asset-sentinel" />
          </div>

          <!-- List view -->
          <div v-else ref="assetGrid" class="asset-list asset-grid--list" @pointerdown="startMarquee">
            <div v-if="marquee && (marquee.width > 3 || marquee.height > 3)" class="asset-marquee" :style="{ left: `${marquee.left}px`, top: `${marquee.top}px`, width: `${marquee.width}px`, height: `${marquee.height}px` }" />
            <div class="asset-list__head">
              <span />
              <button type="button" :class="{ sorted: sortBy === 'name' }" @click="setSort('name')">名称<ArrowUp v-if="sortBy === 'name'" :size="12" :class="{ desc: sortDirection === 'desc' }" /></button>
              <button type="button" :class="{ sorted: sortBy === 'type' }" @click="setSort('type')">类型<ArrowUp v-if="sortBy === 'type'" :size="12" :class="{ desc: sortDirection === 'desc' }" /></button>
              <button type="button" class="num" :class="{ sorted: sortBy === 'size' }" @click="setSort('size')">大小<ArrowUp v-if="sortBy === 'size'" :size="12" :class="{ desc: sortDirection === 'desc' }" /></button>
              <span>来源</span>
              <button type="button" :class="{ sorted: sortBy === 'createdAt' }" @click="setSort('createdAt')">添加时间<ArrowUp v-if="sortBy === 'createdAt'" :size="12" :class="{ desc: sortDirection === 'desc' }" /></button>
              <span />
            </div>
            <article
              v-for="folder in visibleFolders"
              :key="folder.id"
              class="asset-row asset-folder"
              :class="{ 'is-drop': dropTarget === folder.id }"
              draggable="true"
              @dblclick="openFolder(folder.id)"
              @click="openFolder(folder.id)"
              @contextmenu="openMenu($event, 'folder', { folder })"
              @dragstart="onFolderDragStart($event, folder)"
              @dragend="onDragEnd"
              @dragover="onTargetDragOver($event, folder.id)"
              @dragleave="onTargetDragLeave"
              @drop="onDrop($event, folder.id)"
            >
              <span class="asset-row__thumb asset-row__thumb--folder"><Folder :size="18" /></span>
              <strong class="asset-row__name">{{ folder.name }}</strong>
              <span class="asset-row__muted">文件夹</span>
              <span class="asset-row__muted num">{{ folderCounts.get(folder.id) || 0 }} 项</span>
              <span class="asset-row__muted">—</span>
              <span class="asset-row__muted">{{ formatDateTime(folder.createdAt) }}</span>
              <button type="button" class="vg-icon-btn vg-icon-btn--sm" title="更多操作" @click.stop="openMenu($event, 'folder', { folder })"><MoreHorizontal :size="15" /></button>
            </article>
            <article
              v-for="asset in visibleAssets"
              :key="asset.id"
              :data-asset-id="asset.id"
              class="asset-tile asset-row"
              :class="{ selected: selectedAssetIds.includes(asset.id), cut: clipboard?.mode === 'cut' && clipboard.ids.includes(asset.id) }"
              draggable="true"
              @click="selectAsset($event, asset)"
              @dblclick="openPreview(asset)"
              @contextmenu="openMenu($event, 'asset', { asset })"
              @dragstart="onAssetDragStart($event, asset)"
              @dragend="onDragEnd"
            >
              <span class="asset-row__thumb">
                <img v-if="thumbnails[asset.id]" :src="thumbnails[asset.id]" alt="" draggable="false" />
                <Video v-else-if="asset.type === 'video'" :size="16" /><ImageIcon v-else :size="16" />
                <button type="button" class="asset-select-mark" :aria-label="selectedAssetIds.includes(asset.id) ? '取消选择' : '选择'" @click.stop="toggleAssetSelection(asset)"><Check :size="12" /></button>
              </span>
              <strong class="asset-row__name" :title="asset.name">{{ asset.name }}</strong>
              <span class="asset-row__muted"><span class="vg-pill" :class="asset.type === 'image' ? 'vg-pill--blue' : 'vg-pill--violet'">{{ asset.type === 'image' ? '图片' : '视频' }}</span></span>
              <span class="asset-row__muted num">{{ formatBytes(asset.size) }}</span>
              <span class="asset-row__muted asset-row__source"><Smartphone v-if="asset.source === 'mobile'" :size="13" />{{ asset.source === 'mobile' ? '手机' : '电脑' }}<Cloud v-if="asset.qiniuUrl" :size="13" class="is-cloud" title="云端已备份" /></span>
              <span class="asset-row__muted">{{ formatDateTime(asset.createdAt) }}</span>
              <button type="button" class="vg-icon-btn vg-icon-btn--sm" title="更多操作" @click.stop="openMenuFromButton($event, asset)"><MoreHorizontal :size="15" /></button>
            </article>
            <div ref="sentinel" class="asset-sentinel" />
          </div>
        </div>

        <!-- Floating selection bar -->
        <transition name="asset-bar">
          <div v-if="selectedAssetIds.length" class="asset-selection-bar">
            <span class="asset-selection-bar__count"><b>{{ selectedAssetIds.length }}</b><span>已选 · {{ formatBytes(selectedSize) }}</span></span>
            <button type="button" title="全选 (Ctrl+A)" @click="selectAll">全选</button>
            <span class="asset-selection-bar__sep" />
            <button v-if="selectedAssets.length === 1 && selectedAssets[0].type === 'image'" type="button" @click="openEditor(selectedAssets[0])"><Crop :size="14" /><span class="lbl">编辑</span></button>
            <button type="button" @click="moveAssetsDialog(selectedAssetIds)"><FolderInput :size="14" /><span class="lbl">移动到</span></button>
            <button type="button" title="Ctrl+D" @click="duplicateAssets(selectedAssetIds)"><CopyPlus :size="14" /><span class="lbl">副本</span></button>
            <button type="button" title="Ctrl+C" @click="copySelection('copy')"><Copy :size="14" /><span class="lbl">复制</span></button>
            <button type="button" title="Ctrl+X" @click="copySelection('cut')"><Scissors :size="14" /><span class="lbl">剪切</span></button>
            <button type="button" class="danger" title="Delete" @click="trashAssets(selectedAssetIds)"><Trash2 :size="14" /><span class="lbl">删除</span></button>
            <button type="button" class="asset-selection-bar__close" title="取消选择 (Esc)" @click="clearSelection"><X :size="15" /></button>
          </div>
          <div v-else-if="clipboard" class="asset-selection-bar asset-selection-bar--clipboard">
            <span class="asset-selection-bar__count"><Clipboard :size="15" />{{ clipboard.mode === 'copy' ? '已复制' : '已剪切' }} {{ clipboard.ids.length }} 项</span>
            <button type="button" :disabled="!canPaste" @click="pasteClipboard"><ClipboardPaste :size="14" />{{ canPaste ? `粘贴到“${uploadTargetName}”` : '进入文件夹后粘贴' }}</button>
            <button type="button" class="asset-selection-bar__close" title="清除" @click="clipboard = null"><X :size="15" /></button>
          </div>
        </transition>

        <footer class="lib-status">
          <span>{{ placeTitle }} · {{ sortedAssets.length }} 项<template v-if="visibleFolders.length"> · {{ visibleFolders.length }} 个文件夹</template> · {{ formatBytes(scopedSize) }}</span>
          <span v-if="busyLabel" class="lib-status__busy"><RefreshCw :size="12" class="vg-spin" />{{ busyLabel }}</span>
          <span class="lib-status__keys"><kbd>空格</kbd>预览 <kbd>F2</kbd>重命名 <kbd>Del</kbd>删除 <kbd>Ctrl</kbd>+<kbd>A</kbd>全选</span>
        </footer>

        <!-- External file drop overlay -->
        <div v-if="fileDragActive" class="asset-drop-overlay">
          <div><Upload :size="30" /><strong>松开即可导入到“{{ uploadTargetName }}”</strong><span>也可以拖到左侧或网格中的文件夹上，直接放进对应文件夹</span></div>
        </div>
      </section>

      <!-- ============ Inspector ============ -->
      <AssetInspector
        v-if="inspectorOpen"
        class="lib-inspector"
        :class="{ 'is-idle': !selectedAssets.length }"
        :selected="selectedAssets"
        :thumbnails="thumbnails"
        :folder-path="(id) => folderPathOf(allFolders, id)"
        :library="library"
        @preview="openPreview"
        @edit="openEditor"
        @rename="openAssetRename"
        @open="openAssetExternally"
        @reveal="revealAsset"
        @copy-path="(asset) => copyText(asset.filePath, '已复制文件路径')"
        @copy-link="(asset) => asset.qiniuUrl && copyText(asset.qiniuUrl, '已复制云端链接')"
        @open-folder="openFolder"
        @move="moveAssetsDialog(selectedAssetIds)"
        @duplicate="duplicateAssets(selectedAssetIds)"
        @remove="trashAssets(selectedAssetIds)"
      />
    </div>

    <!-- ============ Context menu ============ -->
    <div v-if="contextMenu" ref="contextMenuEl" class="vg-menu asset-context-menu" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop @contextmenu.prevent>
      <template v-if="contextMenu.kind === 'asset' && contextMenu.asset">
        <template v-if="selectedAssetIds.length <= 1">
          <button type="button" @click="menu(() => openPreview(contextMenu!.asset!))"><Eye :size="14" />预览<kbd>空格</kbd></button>
          <button v-if="contextMenu.asset.type === 'image'" type="button" @click="menu(() => openEditor(contextMenu!.asset!))"><Crop :size="14" />编辑图片</button>
          <button type="button" @click="menu(() => openAssetExternally(contextMenu!.asset!))"><ExternalLink :size="14" />用默认程序打开</button>
          <button type="button" @click="menu(() => revealAsset(contextMenu!.asset!))"><FolderOpen :size="14" />在文件夹中显示</button>
          <button type="button" @click="menu(() => copyText(contextMenu!.asset!.filePath, '已复制文件路径'))"><Link :size="14" />复制文件路径</button>
          <div class="asset-context-menu__divider" />
          <button type="button" @click="menu(() => openAssetRename(contextMenu!.asset!))"><Pencil :size="14" />重命名<kbd>F2</kbd></button>
        </template>
        <div v-else class="asset-context-menu__title">已选 {{ selectedAssetIds.length }} 项</div>
        <button type="button" @click="menu(() => moveAssetsDialog(selectedAssetIds))"><FolderInput :size="14" />移动到…</button>
        <button type="button" @click="menu(() => duplicateAssets(selectedAssetIds))"><CopyPlus :size="14" />创建副本<kbd>Ctrl+D</kbd></button>
        <button type="button" @click="menu(() => copySelection('copy'))"><Copy :size="14" />复制<kbd>Ctrl+C</kbd></button>
        <button type="button" @click="menu(() => copySelection('cut'))"><Scissors :size="14" />剪切<kbd>Ctrl+X</kbd></button>
        <div class="asset-context-menu__divider" />
        <button type="button" class="danger" @click="menu(() => trashAssets(selectedAssetIds))"><Trash2 :size="14" />移入回收站<kbd>Del</kbd></button>
      </template>
      <template v-else-if="contextMenu.kind === 'folder' && contextMenu.folder">
        <button type="button" @click="menu(() => openFolder(contextMenu!.folder!.id))"><FolderOpen :size="14" />打开</button>
        <button type="button" @click="menu(() => createFolder(contextMenu!.folder!.id))"><FolderPlus :size="14" />新建子文件夹</button>
        <button type="button" @click="menu(() => renameFolder(contextMenu!.folder!))"><Pencil :size="14" />重命名</button>
        <button type="button" @click="menu(() => moveFolderDialog(contextMenu!.folder!))"><FolderInput :size="14" />移动到…</button>
        <div class="asset-context-menu__divider" />
        <button type="button" class="danger" @click="menu(() => trashFolder(contextMenu!.folder!))"><Trash2 :size="14" />删除文件夹</button>
      </template>
      <template v-else>
        <button type="button" @click="menu(upload)"><Upload :size="14" />上传素材</button>
        <button type="button" :disabled="scope !== 'folder' || isSearching" @click="menu(() => createFolder())"><FolderPlus :size="14" />新建文件夹</button>
        <button type="button" :disabled="!canPaste" @click="menu(pasteClipboard)"><ClipboardPaste :size="14" />粘贴<kbd>Ctrl+V</kbd></button>
        <div class="asset-context-menu__divider" />
        <button type="button" :disabled="!sortedAssets.length" @click="menu(selectAll)"><Check :size="14" />全选<kbd>Ctrl+A</kbd></button>
        <button type="button" @click="menu(load)"><RefreshCw :size="14" />刷新</button>
      </template>
    </div>

    <!-- ============ Dialogs ============ -->
    <AssetLightbox
      v-if="lightboxIndex !== null"
      :assets="lightboxAssets"
      :index="lightboxIndex"
      @update:index="(value) => { lightboxIndex = value; const item = lightboxAssets[value]; if (item) { selectedAssetIds = [item.id]; selectionAnchor = item.id } }"
      @close="lightboxIndex = null"
      @edit="openEditor"
      @reveal="revealAsset"
      @remove="(asset) => { lightboxIndex = null; trashAssets([asset.id]) }"
    />

    <AssetImageEditor v-if="editAsset" :asset="editAsset" @close="editAsset = null" @saved="onEdited" />

    <AssetFolderPicker
      v-if="picker"
      :title="picker.title"
      :subtitle="picker.subtitle"
      :confirm-text="picker.confirmText"
      :folders="allFolders"
      :disabled-ids="picker.disabledIds"
      :initial-id="picker.initialId"
      @close="picker = null"
      @pick="pickFolder"
    />

    <div v-if="qrOpen" class="vg-backdrop" @click.self="qrOpen = false">
      <section class="vg-dialog asset-qr" role="dialog" aria-modal="true" aria-label="手机扫码上传">
        <header class="vg-dialog__head">
          <div class="vg-dialog__title"><span class="vg-dialog__title-icon"><Smartphone :size="20" /></span><div><h2>手机扫码上传</h2><p>手机和电脑连接同一个 Wi-Fi，扫码后即可选择相册里的图片和视频</p></div></div>
          <button type="button" class="vg-icon-btn" aria-label="关闭" @click="qrOpen = false"><X :size="18" /></button>
        </header>
        <div class="vg-dialog__body asset-qr__body">
          <img :src="qrImage" alt="扫码打开手机上传页" />
          <div class="asset-qr__meta">
            <span>上传到：<b>{{ uploadTargetName }}</b></span>
            <span>{{ Math.floor(qrRemaining / 60) }} 分 {{ qrRemaining % 60 }} 秒后失效</span>
          </div>
          <button type="button" class="asset-qr__url" title="复制链接" @click="copyText(uploadUrl, '已复制上传链接')"><code>{{ uploadUrl }}</code><Copy :size="13" /></button>
          <small>上传完成的素材会自动出现在列表中。</small>
        </div>
      </section>
    </div>

    <div v-if="folderDialog" class="vg-backdrop" @click.self="!folderBusy && (folderDialog = null)">
      <form class="vg-dialog asset-folder-dialog" role="dialog" aria-modal="true" @submit.prevent="saveFolder">
        <header class="vg-dialog__head">
          <div class="vg-dialog__title">
            <span class="vg-dialog__title-icon"><FolderPlus v-if="folderDialog.mode === 'create'" :size="20" /><Pencil v-else :size="20" /></span>
            <div>
              <h2>{{ folderDialog.mode === 'create' ? '新建文件夹' : '重命名文件夹' }}</h2>
              <p>{{ folderDialog.mode === 'create' ? `创建在“${folderDialog.parentId ? folderPathOf(allFolders, folderDialog.parentId).map((item) => item.name).join(' / ') : '素材库'}”中` : folderDialog.folder?.name }}</p>
            </div>
          </div>
          <button type="button" class="vg-icon-btn" aria-label="关闭" :disabled="folderBusy" @click="folderDialog = null"><X :size="18" /></button>
        </header>
        <div class="vg-dialog__body">
          <label class="vg-field"><span class="vg-field__label">文件夹名称</span><input v-model="folderName" class="vg-input" autofocus maxlength="180" placeholder="例如：项链主图" /></label>
          <p v-if="folderError" class="vg-field__error">{{ folderError }}</p>
        </div>
        <footer class="vg-dialog__foot"><div class="vg-dialog__foot-actions"><button type="button" class="vg-btn" :disabled="folderBusy" @click="folderDialog = null">取消</button><button type="submit" class="vg-btn vg-btn--primary" :disabled="folderBusy">{{ folderBusy ? '保存中…' : '保存' }}</button></div></footer>
      </form>
    </div>

    <div v-if="assetRename" class="vg-backdrop" @click.self="assetRename = null">
      <form class="vg-dialog asset-folder-dialog asset-rename-dialog" role="dialog" aria-modal="true" @submit.prevent="saveAssetRename">
        <header class="vg-dialog__head">
          <div class="vg-dialog__title"><span class="vg-dialog__title-icon"><Pencil :size="20" /></span><div class="asset-rename-dialog__heading"><h2>重命名素材</h2><p :title="assetRename.name">{{ assetRename.name }}</p></div></div>
          <button type="button" class="vg-icon-btn" aria-label="关闭" @click="assetRename = null"><X :size="18" /></button>
        </header>
        <div class="vg-dialog__body"><label class="vg-field"><span class="vg-field__label">素材名称</span><input v-model="assetRenameValue" class="vg-input" autofocus maxlength="180" @focus="($event.target as HTMLInputElement).setSelectionRange(0, assetRenameValue.lastIndexOf('.') > 0 ? assetRenameValue.lastIndexOf('.') : assetRenameValue.length)" /></label></div>
        <footer class="vg-dialog__foot"><div class="vg-dialog__foot-actions"><button type="button" class="vg-btn" @click="assetRename = null">取消</button><button type="submit" class="vg-btn vg-btn--primary">保存</button></div></footer>
      </form>
    </div>

    <div v-if="confirmState" class="vg-backdrop asset-confirm-backdrop" @click.self="settleConfirm(false)">
      <section class="vg-dialog asset-confirm" role="alertdialog" aria-modal="true" :aria-label="confirmState.title">
        <div class="asset-confirm__body">
          <span class="asset-confirm__icon" :class="{ danger: confirmState.danger }"><Trash2 v-if="confirmState.danger" :size="20" /><CircleAlert v-else :size="20" /></span>
          <div><h2>{{ confirmState.title }}</h2><p>{{ confirmState.message }}</p></div>
        </div>
        <footer class="vg-dialog__foot"><div class="vg-dialog__foot-actions">
          <button type="button" class="vg-btn" @click="settleConfirm(false)">取消</button>
          <button type="button" class="vg-btn" :class="confirmState.danger ? 'vg-btn--danger' : 'vg-btn--primary'" autofocus @click="settleConfirm(true)">{{ confirmState.confirmText }}</button>
        </div></footer>
      </section>
    </div>

    <div v-if="trashOpen" class="vg-backdrop" @click.self="trashOpen = false">
      <section class="vg-dialog vg-dialog--wide asset-trash-dialog" role="dialog" aria-modal="true" aria-label="回收站">
        <header class="vg-dialog__head">
          <div class="vg-dialog__title"><span class="vg-dialog__title-icon"><Trash2 :size="20" /></span><div><h2>回收站</h2><p>删除的素材和文件夹会保留在这里，可以随时恢复</p></div></div>
          <button type="button" class="vg-icon-btn" aria-label="关闭" @click="trashOpen = false"><X :size="18" /></button>
        </header>
        <div class="vg-dialog__body">
          <div v-if="!trash.assets.length && !trash.folders.length" class="vg-empty"><Trash2 :size="26" /><strong>回收站是空的</strong></div>
          <div v-else class="asset-trash-list">
            <article v-for="folder in trash.folders" :key="folder.id">
              <span class="asset-trash-list__icon is-folder"><Folder :size="17" /></span>
              <div><strong>{{ folder.name }}</strong><small>文件夹 · {{ trashAge(folder.deletedAt) }}</small></div>
              <button type="button" class="vg-btn vg-btn--sm" @click="restoreTrashItem('folder', folder.id)"><ArchiveRestore :size="14" />恢复</button>
              <button type="button" class="vg-icon-btn vg-icon-btn--danger" title="彻底删除" @click="purgeTrashItem('folder', folder.id)"><Trash2 :size="15" /></button>
            </article>
            <article v-for="asset in trash.assets" :key="asset.id">
              <span class="asset-trash-list__icon"><Video v-if="asset.type === 'video'" :size="17" /><ImageIcon v-else :size="17" /></span>
              <div><strong>{{ asset.name }}</strong><small>{{ formatBytes(asset.size) }} · {{ trashAge(asset.deletedAt) }}</small></div>
              <button type="button" class="vg-btn vg-btn--sm" @click="restoreTrashItem('asset', asset.id)"><ArchiveRestore :size="14" />恢复</button>
              <button type="button" class="vg-icon-btn vg-icon-btn--danger" title="彻底删除" @click="purgeTrashItem('asset', asset.id)"><Trash2 :size="15" /></button>
            </article>
          </div>
        </div>
        <footer v-if="trash.assets.length || trash.folders.length" class="vg-dialog__foot">
          <span class="vg-muted">共 {{ trash.assets.length + trash.folders.length }} 项 · {{ formatBytes(trash.assets.reduce((sum, item) => sum + item.size, 0)) }}</span>
          <div class="vg-dialog__foot-actions"><button type="button" class="vg-btn vg-btn--danger" @click="purgeTrashItem()">清空回收站</button></div>
        </footer>
      </section>
    </div>

    <div v-if="auditResult" class="vg-backdrop" @click.self="auditResult = null">
      <section class="vg-dialog asset-audit-dialog" role="dialog" aria-modal="true" aria-label="素材库检查">
        <header class="vg-dialog__head">
          <div class="vg-dialog__title"><span class="vg-dialog__title-icon"><ShieldCheck :size="20" /></span><div><h2>素材库检查</h2><p>{{ auditResult.repaired ? '已完成修复' : auditIssues ? `发现 ${auditIssues} 个问题` : '一切正常，没有发现问题' }}</p></div></div>
          <button type="button" class="vg-icon-btn" aria-label="关闭" @click="auditResult = null"><X :size="18" /></button>
        </header>
        <div class="vg-dialog__body">
          <dl class="asset-audit-list">
            <div><dt>文件丢失的素材</dt><dd :class="{ bad: auditResult.missingAssetIds.length }">{{ auditResult.missingAssetIds.length }}</dd></div>
            <div><dt>找不到所属文件夹的素材</dt><dd :class="{ bad: auditResult.orphanAssetIds.length }">{{ auditResult.orphanAssetIds.length }}</dd></div>
            <div><dt>找不到上级的文件夹</dt><dd :class="{ bad: auditResult.orphanFolderIds.length }">{{ auditResult.orphanFolderIds.length }}</dd></div>
          </dl>
        </div>
        <footer class="vg-dialog__foot"><div class="vg-dialog__foot-actions">
          <button type="button" class="vg-btn" @click="auditResult = null">关闭</button>
          <button v-if="!auditResult.repaired && auditIssues" type="button" class="vg-btn vg-btn--primary" :disabled="safetyBusy" @click="runAudit(true)">自动修复</button>
        </div></footer>
      </section>
    </div>

    <transition name="vg-toast">
      <div v-if="notice" class="vg-toast asset-undo" :class="notice.kind === 'error' ? 'vg-toast--error' : 'vg-toast--success'">
        <CircleAlert v-if="notice.kind === 'error'" :size="16" /><Check v-else :size="16" />
        <span>{{ notice.text }}</span>
        <button v-if="notice.action" type="button" @click="runNoticeAction">{{ notice.action.label }}</button>
        <button type="button" class="asset-undo__close" aria-label="关闭" @click="notice = null"><X :size="14" /></button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* Asset library workbench — vg design language, colours from theme tokens only. */
.asset-page { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 520px; padding: 14px 20px 16px; container-type: inline-size; container-name: libpage; }

/* ---------- head ---------- */
.asset-head { position: relative; isolation: isolate; display: flex; align-items: center; gap: 13px; flex-shrink: 0; }
html[data-app-theme='dark-teal'] .asset-head::before { content: ''; position: absolute; z-index: -1; right: 130px; bottom: -8px; width: min(380px, 38%); height: 70px; background: url(../../assets/hero-frames.svg) right bottom / auto 100% no-repeat; pointer-events: none; }
@media (max-width: 1100px) { html[data-app-theme='dark-teal'] .asset-head::before { display: none; } }
.asset-head__icon { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; border: 1px solid color-mix(in srgb, var(--vg-accent) 30%, transparent); border-radius: 12px; background: linear-gradient(145deg, color-mix(in srgb, var(--vg-accent) 46%, var(--theme-panel)), color-mix(in srgb, var(--vg-accent) 10%, var(--theme-panel))); color: color-mix(in srgb, var(--vg-accent) 80%, #fff); }
.asset-head__icon svg { width: 20px; height: 20px; stroke-width: 1.7; }
.asset-head__text { flex: 1; min-width: 0; }
.asset-head__text h1 { font-size: 19px; font-weight: 700; letter-spacing: -.01em; line-height: 1.25; }
.asset-head__text p { margin-top: 2px; font-size: 12.5px; color: var(--theme-text-muted); }
.asset-head__actions { display: flex; gap: 8px; }

/* ---------- workbench frame ---------- */
.asset-bench { position: relative; display: grid; grid-template-columns: 204px minmax(0, 1fr); flex: 1; min-height: 0; overflow: hidden; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-lg); background: var(--theme-panel); }
.asset-bench.has-inspector { grid-template-columns: 204px minmax(0, 1fr) 288px; }
.lib-inspector { border-left: 1px solid var(--theme-divider); background: color-mix(in srgb, var(--theme-panel-soft) 45%, var(--theme-panel)); }

/* ---------- sidebar ---------- */
.lib-side { display: flex; flex-direction: column; gap: 4px; min-height: 0; padding: 12px 10px; border-right: 1px solid var(--theme-divider); background: color-mix(in srgb, var(--theme-panel-soft) 45%, var(--theme-panel)); }
.lib-side__group { display: flex; flex-direction: column; gap: 2px; }
.lib-side__label { display: flex; align-items: center; justify-content: space-between; padding: 14px 8px 4px 10px; font-size: 11px; font-weight: 700; letter-spacing: .04em; color: var(--theme-text-muted); }
.lib-side__tree { display: flex; flex-direction: column; gap: 1px; flex: 1; min-height: 60px; overflow-y: auto; scrollbar-width: thin; }
.lib-side__item { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--theme-text-secondary); font-size: 13px; text-align: left; cursor: pointer; transition: background .12s, color .12s, border-color .12s; }
.lib-side__item > svg { flex-shrink: 0; color: var(--theme-text-muted); }
.lib-side__item > span:not(.lib-side__twisty) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lib-side__item > em { flex-shrink: 0; font-style: normal; font-size: 11px; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; }
.lib-side__item:hover:not(:disabled) { background: var(--theme-panel-soft); color: var(--theme-text); }
.lib-side__item:disabled { opacity: .5; cursor: progress; }
.lib-side__item.active { background: var(--vg-accent-soft); color: var(--vg-accent); font-weight: 600; }
.lib-side__item.active > svg, .lib-side__item.active > em { color: var(--vg-accent); }
.lib-side__item.is-drop { border-color: var(--vg-accent); background: var(--vg-accent-soft); color: var(--vg-accent); }
.lib-side__node { padding-left: 8px; }
.lib-side__twisty { display: grid; place-items: center; width: 16px; height: 16px; flex-shrink: 0; border-radius: 4px; color: var(--theme-text-muted); transition: transform .15s; }
.lib-side__twisty:hover { background: var(--theme-control-hover); }
.lib-side__twisty.is-open { transform: rotate(90deg); }
.lib-side__item > .lib-side__folder-icon { color: var(--vg-amber); }
.lib-side__item > .lib-side__root-icon { color: var(--vg-accent); }
.lib-side__foot { display: flex; flex-direction: column; gap: 2px; padding-top: 8px; border-top: 1px solid var(--theme-divider); }
.lib-side__storage { display: flex; align-items: center; gap: 7px; padding: 8px 10px 2px; font-size: 11px; color: var(--theme-text-muted); }
.lib-side__storage svg { flex-shrink: 0; color: var(--vg-accent); }

/* ---------- main pane ---------- */
.lib-main { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; container-type: inline-size; container-name: libmain; }
.lib-bar { display: flex; align-items: center; gap: 8px; min-height: 46px; padding: 7px 12px; border-bottom: 1px solid var(--theme-divider); }
.lib-bar--filters { min-height: 44px; }
.lib-bar__tools { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.lib-bar__spacer { flex: 1; }
.lib-bar__divider { width: 1px; height: 20px; margin: 0 6px; background: var(--theme-divider); }
.asset-nav-buttons { display: flex; gap: 2px; }
.vg-icon-btn:disabled { opacity: .35; cursor: not-allowed; }
.vg-icon-btn.is-on { color: var(--vg-accent); background: var(--vg-accent-soft); }
.asset-breadcrumbs { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; overflow: hidden; }
.asset-breadcrumbs button, .asset-breadcrumbs__current { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 8px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--theme-text-secondary); font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; flex-shrink: 1; }
.asset-breadcrumbs button { cursor: pointer; }
.asset-breadcrumbs button:hover { background: var(--theme-panel-soft); color: var(--theme-text); }
.asset-breadcrumbs button.current, .asset-breadcrumbs__current { color: var(--theme-text); font-weight: 700; flex-shrink: 0; }
.asset-breadcrumbs__current svg { color: var(--vg-accent); }
.asset-breadcrumbs button.is-drop { border-color: var(--vg-accent); background: var(--vg-accent-soft); color: var(--vg-accent); }
.asset-breadcrumbs__sep { flex-shrink: 0; color: var(--theme-text-muted); }

.asset-search { flex: 1 1 220px; max-width: 340px; min-width: 160px; }
.asset-search .vg-input { padding-right: 28px; }
.asset-search__clear { position: absolute; right: 6px; display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: var(--theme-control); color: var(--theme-text-muted); cursor: pointer; }
.asset-search__clear:hover { color: var(--theme-text); }
.asset-filter, .asset-view-toggle { display: inline-flex; padding: 2px; gap: 2px; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-panel-soft); }
.asset-filter button, .asset-view-toggle button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-secondary); font-size: 12px; font-weight: 500; cursor: pointer; transition: background .12s, color .12s; }
.asset-view-toggle button { width: 30px; padding: 0; }
.asset-filter button em { font-style: normal; font-size: 11px; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; }
.asset-filter button:hover, .asset-view-toggle button:hover { color: var(--theme-text); }
.asset-filter button.active, .asset-view-toggle button.active { background: var(--theme-panel); color: var(--vg-accent); font-weight: 600; box-shadow: 0 1px 2px color-mix(in srgb, var(--theme-root) 35%, transparent), 0 0 0 1px var(--vg-accent-line); }
.asset-filter button.active em { color: var(--vg-accent); }
.asset-view-btn.is-open { border-color: var(--vg-accent); color: var(--vg-accent); }
.asset-view-menu { min-width: 170px; }
.asset-view-menu button svg { opacity: 0; color: var(--vg-accent); }
.asset-view-menu button.is-checked { color: var(--theme-text); font-weight: 600; }
.asset-view-menu button.is-checked svg { opacity: 1; }
.asset-view-menu__label { padding: 6px 10px 4px; font-size: 11px; font-weight: 600; color: var(--theme-text-muted); }
.asset-view-menu__divider { height: 1px; margin: 4px 6px; background: var(--theme-divider); }
.asset-zoom { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 4px; color: var(--theme-text-muted); }
.asset-zoom input { width: 96px; accent-color: var(--vg-accent); cursor: pointer; }

.lib-scroll { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0; padding: 14px 14px 0; overflow-y: auto; scrollbar-width: thin; }
.lib-scroll > .asset-grid, .lib-scroll > .asset-list, .lib-scroll > .asset-empty { flex: 1 0 auto; }
.lib-scroll > .asset-grid, .lib-scroll > .asset-list { padding-bottom: 84px; }
.lib-scroll > .asset-empty { padding-bottom: 60px; }
.asset-error { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.asset-error .vg-btn { margin-left: auto; }

/* ---------- grid ---------- */
.asset-grid { position: relative; user-select: none; }
.asset-section-title { display: flex; align-items: center; gap: 8px; margin: 2px 2px 10px; font-size: 12px; font-weight: 700; color: var(--theme-text-secondary); }
.asset-section-title em { font-style: normal; font-weight: 500; color: var(--theme-text-muted); }
.asset-folder-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 20px; }
.asset-folder { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 10px 8px 10px 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel); cursor: pointer; transition: border-color .15s, background .15s, box-shadow .15s; }
.asset-folder:hover { border-color: var(--theme-border-control); background: var(--theme-panel-soft); }
.asset-folder.is-drop { border-color: var(--vg-accent); background: var(--vg-accent-soft); box-shadow: 0 0 0 3px var(--vg-accent-soft); }
.asset-folder__icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 9px; background: color-mix(in srgb, var(--vg-amber) 14%, transparent); color: var(--vg-amber); flex-shrink: 0; }
.asset-folder__text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.asset-folder__text strong { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-folder__text small { font-size: 11px; color: var(--theme-text-muted); }
.asset-folder__more { opacity: 0; }
.asset-folder:hover .asset-folder__more { opacity: 1; }

.asset-grid__items { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--tile, 172px), 1fr)); gap: 10px; }
.asset-marquee { position: absolute; z-index: 15; border: 1px solid var(--vg-accent); border-radius: 3px; background: color-mix(in srgb, var(--vg-accent) 12%, transparent); pointer-events: none; }
.asset-tile { position: relative; display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 6px 6px 8px; border: 1px solid transparent; border-radius: 12px; cursor: default; transition: background .12s, border-color .12s; }
.asset-tile:hover { background: var(--theme-panel-soft); }
.asset-tile.selected { background: var(--vg-accent-soft); border-color: var(--vg-accent-line); }
.asset-tile.cut { opacity: .45; }
.asset-thumb { position: relative; display: grid; place-items: center; aspect-ratio: 1; overflow: hidden; border-radius: 8px; background: var(--theme-panel-soft); box-shadow: inset 0 0 0 1px var(--theme-border); }
.asset-tile.selected .asset-thumb { box-shadow: 0 0 0 2px var(--vg-accent); }
.asset-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .25s ease; }
.asset-grid--contain .asset-thumb img { object-fit: contain; }
.asset-grid--contain .asset-thumb { background: repeating-conic-gradient(color-mix(in srgb, var(--theme-text) 5%, transparent) 0 25%, transparent 0 50%) 0 0 / 14px 14px, var(--theme-panel-soft); }
.asset-thumb__placeholder { display: grid; place-items: center; width: 100%; height: 100%; color: var(--theme-text-muted); animation: asset-pulse 1.4s ease-in-out infinite; }
@keyframes asset-pulse { 50% { opacity: .45; } }
.asset-thumb__play { position: absolute; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; background: rgba(0, 0, 0, .55); color: #fff; backdrop-filter: blur(4px); pointer-events: none; }
.asset-thumb__play svg { margin-left: 2px; fill: currentColor; }
.asset-thumb__badge { position: absolute; right: 6px; bottom: 6px; height: 18px; padding: 0 6px; border-radius: 5px; background: rgba(0, 0, 0, .58); color: #fff; font-size: 10px; font-weight: 600; line-height: 18px; pointer-events: none; }
.asset-select-mark { position: absolute; z-index: 2; top: 7px; left: 7px; display: grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 1.5px solid rgba(255, 255, 255, .9); border-radius: 6px; background: rgba(0, 0, 0, .28); color: transparent; cursor: pointer; opacity: 0; transition: opacity .12s, background .12s; box-shadow: 0 1px 3px rgba(0, 0, 0, .3); }
.asset-tile:hover .asset-select-mark, .asset-tile.selected .asset-select-mark, .asset-grid:has(.asset-tile.selected) .asset-select-mark { opacity: 1; }
.asset-tile.selected .asset-select-mark { border-color: var(--vg-accent); background: var(--vg-accent); color: var(--theme-on-accent); }
.asset-tile-actions { position: absolute; z-index: 2; top: 7px; right: 7px; display: flex; gap: 4px; opacity: 0; transform: translateY(-3px); transition: opacity .12s, transform .12s; }
.asset-tile:hover .asset-tile-actions { opacity: 1; transform: none; }
.asset-tile-actions button { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 7px; background: rgba(0, 0, 0, .55); color: #fff; cursor: pointer; backdrop-filter: blur(4px); }
.asset-tile-actions button:hover { background: var(--vg-accent); color: var(--theme-on-accent); }
.asset-meta { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 0 3px; }
.asset-meta strong { font-size: 12.5px; font-weight: 600; color: var(--theme-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-meta small { display: flex; align-items: center; gap: 4px; min-width: 0; font-size: 11px; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.asset-meta__dot { opacity: .6; }
.asset-meta__icons { display: inline-flex; gap: 4px; margin-left: auto; }
.is-cloud { color: var(--vg-accent); }
.asset-sentinel { height: 1px; }
.asset-skeleton { display: flex; flex-direction: column; gap: 8px; padding: 6px; }
.asset-skeleton .vg-skeleton:first-child { aspect-ratio: 1; border-radius: 8px; }
.asset-skeleton .vg-skeleton:nth-child(2) { height: 12px; width: 80%; }
.asset-skeleton .vg-skeleton:nth-child(3) { height: 10px; width: 50%; }

/* ---------- list ---------- */
.asset-list { position: relative; display: flex; flex-direction: column; user-select: none; --cols: 44px minmax(180px, 1fr) 76px 84px 82px 140px 34px; }
.asset-list__head, .asset-row { display: grid; grid-template-columns: var(--cols); align-items: center; gap: 12px; padding: 0 10px; }
.asset-list__head { position: sticky; top: -14px; z-index: 3; height: 34px; margin: -14px -14px 6px; padding: 0 24px; border-bottom: 1px solid var(--theme-divider); background: var(--theme-panel); font-size: 11px; font-weight: 600; color: var(--theme-text-muted); }
.asset-list__head button { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.asset-list__head button:hover, .asset-list__head button.sorted { color: var(--theme-text); }
.asset-list__head button svg { color: var(--vg-accent); transition: transform .15s; }
.asset-list__head button svg.desc { transform: rotate(180deg); }
.asset-list .num { justify-content: flex-end; text-align: right; }
.asset-row { min-height: 50px; border: 1px solid transparent; border-radius: 9px; cursor: default; }
.asset-row:hover { background: var(--theme-panel-soft); }
.asset-row.selected { background: var(--vg-accent-soft); border-color: var(--vg-accent-line); }
.asset-row.asset-folder { padding: 0 10px; border-radius: 9px; background: transparent; cursor: pointer; }
.asset-row.asset-folder:hover { background: var(--theme-panel-soft); }
.asset-row__thumb { position: relative; display: grid; place-items: center; width: 40px; height: 40px; overflow: hidden; border-radius: 7px; background: var(--theme-panel-soft); color: var(--theme-text-muted); box-shadow: inset 0 0 0 1px var(--theme-border); }
.asset-row__thumb img { width: 100%; height: 100%; object-fit: cover; }
.asset-row__thumb--folder { background: color-mix(in srgb, var(--vg-amber) 14%, transparent); color: var(--vg-amber); box-shadow: none; }
.asset-row__thumb .asset-select-mark { top: 50%; left: 50%; width: 20px; height: 20px; transform: translate(-50%, -50%); }
.asset-row:hover .asset-select-mark, .asset-row.selected .asset-select-mark { opacity: 1; }
.asset-row__name { min-width: 0; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-row__muted { display: flex; align-items: center; gap: 5px; min-width: 0; font-size: 12px; color: var(--theme-text-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.asset-row__source .is-cloud { margin-left: 4px; }
.asset-row .vg-icon-btn { opacity: 0; }
.asset-row:hover .vg-icon-btn, .asset-row.selected .vg-icon-btn { opacity: 1; }

/* ---------- empty ---------- */
.asset-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 40px 16px; text-align: center; color: var(--theme-text-muted); font-size: 13px; }
.asset-empty__art { display: grid; place-items: center; width: 72px; height: 72px; margin-bottom: 6px; border-radius: 20px; background: var(--vg-accent-soft); border: 1px dashed var(--vg-accent-line); color: var(--vg-accent); }
.asset-empty strong { color: var(--theme-text); font-size: 16px; }
.asset-empty span { max-width: 420px; line-height: 1.6; }
.asset-empty__actions { display: flex; gap: 8px; margin-top: 6px; }

/* ---------- selection bar ---------- */
.asset-selection-bar { position: absolute; z-index: 20; left: 50%; bottom: 46px; transform: translateX(-50%); display: flex; align-items: center; gap: 2px; max-width: calc(100% - 28px); padding: 5px 6px 5px 14px; border: 1px solid var(--theme-border-control); border-radius: 12px; background: var(--theme-panel); box-shadow: var(--theme-shadow-dialog); white-space: nowrap; }
.asset-selection-bar__count { display: inline-flex; align-items: center; gap: 6px; margin-right: 8px; font-size: 12px; color: var(--theme-text-muted); }
.asset-selection-bar__count b { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: var(--vg-accent); color: var(--theme-on-accent); font-size: 12px; }
.asset-selection-bar__count svg { color: var(--vg-blue); }
.asset-selection-bar__sep { width: 1px; height: 18px; margin: 0 4px; background: var(--theme-divider); }
.asset-selection-bar button { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: var(--theme-text-secondary); font-size: 12px; font-weight: 500; cursor: pointer; }
.asset-selection-bar button:hover:not(:disabled) { background: var(--theme-panel-soft); color: var(--theme-text); }
.asset-selection-bar button:disabled { opacity: .5; cursor: not-allowed; }
.asset-selection-bar button.danger { color: var(--vg-red); }
.asset-selection-bar button.danger:hover { background: color-mix(in srgb, var(--vg-red) 12%, transparent); color: var(--vg-red); }
.asset-selection-bar__close { width: 30px; justify-content: center; padding: 0 !important; margin-left: 4px; }
@container libmain (max-width: 720px) {
  .asset-selection-bar .lbl, .asset-selection-bar__count span { display: none; }
  .asset-selection-bar button { padding: 0 8px; }
  .lib-bar__tools .vg-btn--sm span, .asset-zoom { display: none; }
}
.asset-bar-enter-active, .asset-bar-leave-active { transition: opacity .16s, transform .16s; }
.asset-bar-enter-from, .asset-bar-leave-to { opacity: 0; transform: translate(-50%, 8px); }

/* ---------- status bar ---------- */
.lib-status { display: flex; align-items: center; gap: 14px; height: 32px; padding: 0 14px; border-top: 1px solid var(--theme-divider); font-size: 11px; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.lib-status__busy { display: inline-flex; align-items: center; gap: 5px; color: var(--vg-accent); }
.lib-status__keys { margin-left: auto; white-space: nowrap; overflow: hidden; }
.lib-status kbd, .asset-context-menu kbd { display: inline-block; min-width: 18px; padding: 0 4px; margin: 0 2px 0 6px; border: 1px solid var(--theme-border); border-bottom-width: 2px; border-radius: 4px; background: var(--theme-panel-soft); font-family: inherit; font-size: 10px; line-height: 15px; text-align: center; color: var(--theme-text-secondary); }

/* ---------- drop overlay ---------- */
.asset-drop-overlay { position: absolute; inset: 8px; z-index: 30; display: grid; place-items: center; border: 2px dashed var(--vg-accent); border-radius: 12px; background: color-mix(in srgb, var(--vg-accent) 10%, color-mix(in srgb, var(--theme-panel) 82%, transparent)); backdrop-filter: blur(2px); pointer-events: none; }
.asset-drop-overlay > div { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--vg-accent); text-align: center; }
.asset-drop-overlay strong { font-size: 16px; color: var(--theme-text); }
.asset-drop-overlay span { font-size: 12px; color: var(--theme-text-muted); }

/* ---------- context menu ---------- */
.asset-context-menu { position: fixed; right: auto; top: auto; z-index: 2100; min-width: 200px; }
.asset-context-menu button svg { color: var(--theme-text-muted); }
.asset-context-menu button:hover:not(:disabled) svg { color: var(--vg-accent); }
.asset-context-menu button.danger svg { color: var(--vg-red); }
.asset-context-menu kbd { margin-left: auto; }
.asset-context-menu__divider { height: 1px; margin: 4px 6px; background: var(--theme-divider); }
.asset-context-menu__title { padding: 6px 10px 4px; font-size: 11px; font-weight: 600; color: var(--theme-text-muted); }

/* ---------- dialogs ---------- */
.asset-folder-dialog { max-width: 460px; }
.asset-rename-dialog { max-width: 540px; }
.asset-rename-dialog__heading { min-width: 0; }
.asset-rename-dialog__heading p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 380px; }
.asset-qr { max-width: 420px; }
.asset-qr__body { align-items: center; text-align: center; }
.asset-qr__body img { width: 220px; height: 220px; padding: 10px; border-radius: 14px; background: #fff; box-shadow: 0 0 0 1px var(--theme-border); }
.asset-qr__meta { display: flex; justify-content: center; gap: 14px; font-size: 12px; color: var(--theme-text-muted); }
.asset-qr__meta b { color: var(--theme-text); }
.asset-qr__url { display: flex; align-items: center; gap: 8px; max-width: 100%; padding: 6px 10px; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-panel-soft); color: var(--theme-text-muted); cursor: pointer; }
.asset-qr__url code { font-size: 11px; overflow-wrap: anywhere; text-align: left; }
.asset-qr__url:hover { border-color: var(--vg-accent-line); color: var(--vg-accent); }
.asset-qr__body small { font-size: 11px; color: var(--theme-text-muted); }
.asset-confirm-backdrop { z-index: 2600; }
.asset-confirm { max-width: 440px; }
.asset-confirm__body { display: flex; gap: 14px; padding: 22px 22px 18px; }
.asset-confirm__body h2 { margin-bottom: 6px; font-size: 16px; font-weight: 800; }
.asset-confirm__body p { font-size: 13px; line-height: 1.6; color: var(--theme-text-secondary); overflow-wrap: anywhere; }
.asset-confirm__icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--vg-accent-soft); color: var(--vg-accent); flex-shrink: 0; }
.asset-confirm__icon.danger { background: color-mix(in srgb, var(--vg-red) 14%, transparent); color: var(--vg-red); }
.asset-trash-list { display: flex; flex-direction: column; gap: 6px; }
.asset-trash-list article { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); }
.asset-trash-list article > div { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.asset-trash-list strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-trash-list small { font-size: 11px; color: var(--theme-text-muted); }
.asset-trash-list__icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 8px; background: var(--theme-panel); color: var(--theme-text-muted); flex-shrink: 0; }
.asset-trash-list__icon.is-folder { color: var(--vg-amber); }
.asset-audit-dialog { max-width: 460px; }
.asset-audit-list { display: flex; flex-direction: column; margin: 0; }
.asset-audit-list > div { display: flex; justify-content: space-between; padding: 10px 2px; border-bottom: 1px solid var(--theme-divider); font-size: 13px; }
.asset-audit-list dt { color: var(--theme-text-secondary); }
.asset-audit-list dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--vg-accent); }
.asset-audit-list dd.bad { color: var(--vg-amber); }

/* ---------- toast ---------- */
.asset-undo { gap: 10px; padding: 8px 8px 8px 14px; }
.asset-undo button { display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--vg-accent); font-size: 12px; font-weight: 700; cursor: pointer; }
.asset-undo button:hover { background: var(--theme-panel-soft); }
.asset-undo__close { color: var(--theme-text-muted) !important; padding: 0 6px !important; }

/* ---------- responsive (container = workbench) ---------- */
@container libpage (max-width: 1160px) {
  .asset-bench.has-inspector { grid-template-columns: 200px minmax(0, 1fr) 280px; }
  .lib-status__keys { display: none; }
}
@container libpage (max-width: 900px) {
  .asset-bench, .asset-bench.has-inspector { grid-template-columns: minmax(0, 1fr); }
  .lib-side { display: none; }
  .lib-inspector { position: absolute; top: 91px; right: 0; bottom: 0; z-index: 25; width: min(300px, 86%); border-top: 1px solid var(--theme-divider); box-shadow: var(--theme-shadow-dialog); }
  .lib-inspector.is-idle { display: none; }
}
@media (max-width: 900px) {
  .asset-page { padding: 12px; }
  .asset-head__text p { display: none; }
}
</style>
