<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArchiveRestore, ArrowLeft, ArrowRight, ArrowUp, CheckSquare, ChevronLeft, ChevronRight, ChevronRight as BreadcrumbSeparator, Clipboard, Copy, Crop, Download, Folder, FolderOpen, FolderPlus, ImagePlus, Images, List, MoreHorizontal, Pencil, RefreshCw, Search, ShieldCheck, Smartphone, Trash2, Video, X, Grid2X2 } from 'lucide-vue-next'
import QRCode from 'qrcode'
import type { AssetFolder, AssetLibraryAudit, AssetLibraryTrash, LibraryAsset } from '../../../../shared/assetLibrary'

const { t } = useI18n()
const assets = ref<LibraryAsset[]>([])
const folders = ref<AssetFolder[]>([])
const folderPath = ref<AssetFolder[]>([])
const currentFolderId = ref<string | null>(null)
const dropActive = ref(false)
const dropFolderId = ref<string | null>(null)
const draggedAssetIds = ref<string[]>([])
const movingAssets = ref(false)
const folderDialog = ref<{ mode: 'create' | 'rename'; folder: AssetFolder | null } | null>(null)
const folderName = ref('')
const folderBusy = ref(false)
const folderError = ref('')
const query = ref('')
const filter = ref<'all' | 'image' | 'video'>('all')
const loading = ref(false)
const error = ref('')
const qrOpen = ref(false)
const qrImage = ref('')
const uploadUrl = ref('')
const expiresAt = ref(0)
const now = ref(Date.now())
const preview = ref<{ asset: LibraryAsset; src: string } | null>(null)
const layout = ref<'grid' | 'list'>('grid')
const density = ref<'comfortable' | 'compact'>('comfortable')
const sortBy = ref<'createdAt' | 'name' | 'size' | 'type'>('createdAt')
const sortDirection = ref<'asc' | 'desc'>('desc')
const selectedAssetIds = ref<string[]>([])
const selectionAnchor = ref<string | null>(null)
const clipboard = ref<{ mode: 'copy' | 'cut'; ids: string[] } | null>(null)
const navigationHistory = ref<Array<string | null>>([null])
const navigationIndex = ref(0)
const assetRename = ref<LibraryAsset | null>(null)
const assetRenameValue = ref('')
const contextMenu = ref<{ x: number; y: number; asset: LibraryAsset | null; folder: AssetFolder | null } | null>(null)
const draggedFolderId = ref<string | null>(null)
const trashOpen = ref(false)
const trash = ref<AssetLibraryTrash>({ assets: [], folders: [] })
const safetyBusy = ref(false)
const auditResult = ref<AssetLibraryAudit | null>(null)
const undoAction = ref<{ label: string; run: () => Promise<void> } | null>(null)
const assetGrid = ref<HTMLElement | null>(null)
const marquee = ref<{ startX: number; startY: number; left: number; top: number; width: number; height: number } | null>(null)
const currentPage = ref(1)
const pageSize = 24
const thumbnails = ref<Record<string, string>>({})
let thumbnailLoadGeneration = 0
const editAsset = ref<LibraryAsset | null>(null)
const editMode = ref<'resize' | 'crop' | 'watermark'>('resize')
const editBusy = ref(false)
const editError = ref('')
const editForm = ref({ left: 0, top: 0, width: 1000, height: 1000, blur: 18, resizeWidth: 1080, resizeHeight: 1080 })
const cropStage = ref<HTMLElement | null>(null)
const cropImage = ref<HTMLImageElement | null>(null)
const cropNatural = ref({ width: 1, height: 1 })
const cropSelection = ref({ left: 0.1, top: 0.1, width: 0.8, height: 0.8 })
const cropDragging = ref(false)
const cropStart = ref({ x: 0, y: 0 })
let timer: ReturnType<typeof setInterval> | null = null

const remaining = computed(() => Math.max(0, Math.ceil((expiresAt.value - now.value) / 1000)))
const imageCount = computed(() => assets.value.filter((item) => item.type === 'image').length)
const videoCount = computed(() => assets.value.filter((item) => item.type === 'video').length)
const sortedAssets = computed(() => [...assets.value].sort((a, b) => {
  let result = 0
  if (sortBy.value === 'name') result = a.name.localeCompare(b.name)
  else if (sortBy.value === 'size') result = a.size - b.size
  else if (sortBy.value === 'type') result = a.type.localeCompare(b.type)
  else result = a.createdAt - b.createdAt
  return sortDirection.value === 'asc' ? result : -result
}))
const totalPages = computed(() => Math.max(1, Math.ceil(sortedAssets.value.length / pageSize)))
const paginatedAssets = computed(() => {
  const page = Math.min(currentPage.value, totalPages.value)
  return sortedAssets.value.slice((page - 1) * pageSize, page * pageSize)
})
const selectedSize = computed(() => assets.value.filter((item) => selectedAssetIds.value.includes(item.id)).reduce((sum, item) => sum + item.size, 0))
const selectedEditableAsset = computed(() => {
  if (selectedAssetIds.value.length !== 1) return null
  const asset = assets.value.find((item) => item.id === selectedAssetIds.value[0])
  return asset?.type === 'image' ? asset : null
})
const visiblePages = computed(() => {
  const start = Math.max(1, Math.min(currentPage.value - 2, totalPages.value - 4))
  const end = Math.min(totalPages.value, start + 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})

async function loadVisibleThumbnails() {
  const generation = ++thumbnailLoadGeneration
  const pending = paginatedAssets.value.filter((item) => !thumbnails.value[item.id])
  const concurrency = 3
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    while (cursor < pending.length && generation === thumbnailLoadGeneration) {
      const item = pending[cursor++]
      try {
        const thumbnail = await window.api.assetLibrary.thumbnail(item.id) as string
        if (generation === thumbnailLoadGeneration) thumbnails.value[item.id] = thumbnail
      } catch {
        // Keep the media placeholder when thumbnail generation fails.
      }
    }
  })
  await Promise.all(workers)
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [listedAssets, listedFolders, listedPath] = await Promise.all([
      window.api.assetLibrary.list({ query: query.value, type: filter.value, folderId: currentFolderId.value }) as Promise<LibraryAsset[]>,
      window.api.assetLibrary.listFolders(currentFolderId.value) as Promise<AssetFolder[]>,
      window.api.assetLibrary.getFolderPath(currentFolderId.value) as Promise<AssetFolder[]>,
    ])
    assets.value = listedAssets
    folders.value = listedFolders
    folderPath.value = listedPath
    currentPage.value = Math.min(currentPage.value, totalPages.value)
    await loadVisibleThumbnails()
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { loading.value = false }
}

function searchAssets() {
  currentPage.value = 1
  void load()
}

function selectFilter(type: 'all' | 'image' | 'video') {
  filter.value = type
  currentPage.value = 1
  void load()
}

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
  void loadVisibleThumbnails()
  document.querySelector('.asset-library-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function upload() {
  try { await window.api.assetLibrary.upload(currentFolderId.value); await load() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
}

function openFolder(folderId: string | null, recordHistory = true) {
  currentFolderId.value = folderId
  currentPage.value = 1
  selectedAssetIds.value = []
  if (recordHistory && navigationHistory.value[navigationIndex.value] !== folderId) {
    navigationHistory.value = navigationHistory.value.slice(0, navigationIndex.value + 1).concat(folderId)
    navigationIndex.value = navigationHistory.value.length - 1
  }
  void load()
}

function navigateHistory(offset: number) {
  const next = navigationIndex.value + offset
  if (next < 0 || next >= navigationHistory.value.length) return
  navigationIndex.value = next
  openFolder(navigationHistory.value[next], false)
}

function openParentFolder() { openFolder(folderPath.value.at(-1)?.parentId || null) }

function selectAsset(event: MouseEvent, asset: LibraryAsset) {
  const visibleIds = paginatedAssets.value.map((item) => item.id)
  if (event.shiftKey && selectionAnchor.value) {
    const start = visibleIds.indexOf(selectionAnchor.value)
    const end = visibleIds.indexOf(asset.id)
    if (start >= 0 && end >= 0) selectedAssetIds.value = visibleIds.slice(Math.min(start, end), Math.max(start, end) + 1)
  } else if (event.ctrlKey || event.metaKey) {
    selectedAssetIds.value = selectedAssetIds.value.includes(asset.id) ? selectedAssetIds.value.filter((id) => id !== asset.id) : selectedAssetIds.value.concat(asset.id)
    selectionAnchor.value = asset.id
  } else {
    selectedAssetIds.value = [asset.id]
    selectionAnchor.value = asset.id
  }
}

function toggleAssetSelection(asset: LibraryAsset) {
  selectedAssetIds.value = selectedAssetIds.value.includes(asset.id)
    ? selectedAssetIds.value.filter((id) => id !== asset.id)
    : selectedAssetIds.value.concat(asset.id)
  selectionAnchor.value = asset.id
}

function selectAllAssets() { selectedAssetIds.value = paginatedAssets.value.map((item) => item.id) }
function clearSelection() { selectedAssetIds.value = [] }

function startMarquee(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (event.button !== 0 || target?.closest('.asset-tile') || !assetGrid.value) return
  const rect = assetGrid.value.getBoundingClientRect()
  marquee.value = { startX: event.clientX - rect.left, startY: event.clientY - rect.top, left: event.clientX - rect.left, top: event.clientY - rect.top, width: 0, height: 0 }
  selectedAssetIds.value = []
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
  selectedAssetIds.value = Array.from(assetGrid.value.querySelectorAll<HTMLElement>('[data-asset-id]')).filter((element) => {
    const rect = element.getBoundingClientRect()
    return rect.right >= gridRect.left + left && rect.left <= gridRect.left + left + width && rect.bottom >= gridRect.top + top && rect.top <= gridRect.top + top + height
  }).map((element) => String(element.dataset.assetId || '')).filter(Boolean)
}

function endMarquee() {
  marquee.value = null
  window.removeEventListener('pointermove', moveMarquee)
  window.removeEventListener('pointerup', endMarquee)
  window.removeEventListener('pointercancel', endMarquee)
}

function copySelection(mode: 'copy' | 'cut') {
  if (!selectedAssetIds.value.length) return
  clipboard.value = { mode, ids: [...selectedAssetIds.value] }
}

async function pasteClipboard() {
  if (!clipboard.value?.ids.length) return
  movingAssets.value = true
  try {
    const ids = [...clipboard.value.ids]
    if (clipboard.value.mode === 'copy') await window.api.assetLibrary.copyAssets({ ids, folderId: currentFolderId.value })
    else { await window.api.assetLibrary.moveAssets({ ids, folderId: currentFolderId.value }); clipboard.value = null }
    selectedAssetIds.value = []
    await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { movingAssets.value = false }
}

function openAssetRename(asset: LibraryAsset) { assetRename.value = asset; assetRenameValue.value = asset.name; contextMenu.value = null }
async function saveAssetRename() {
  if (!assetRename.value || !assetRenameValue.value.trim()) return
  const asset = assetRename.value
  const previousName = asset.name
  await window.api.assetLibrary.renameAsset({ id: asset.id, name: assetRenameValue.value.trim() })
  undoAction.value = { label: `\u5df2\u91cd\u547d\u540d\u4e3a "${assetRenameValue.value.trim()}"`, run: async () => { await window.api.assetLibrary.renameAsset({ id: asset.id, name: previousName }); await load() } }
  assetRename.value = null
  await load()
}

async function removeSelectedAssets() {
  if (!selectedAssetIds.value.length || !window.confirm(`\u5220\u9664\u9009\u4e2d\u7684 ${selectedAssetIds.value.length} \u9879\u7d20\u6750\uff1f\u5c06\u91ca\u653e ${formatBytes(selectedSize.value)} \u7a7a\u95f4\u3002`)) return
  const ids = [...selectedAssetIds.value]
  await window.api.assetLibrary.trashAssets(ids)
  undoAction.value = { label: `\u5df2\u5c06 ${ids.length} \u9879\u7d20\u6750\u79fb\u5165\u56de\u6536\u7ad9`, run: async () => { for (const id of ids) await window.api.assetLibrary.restoreTrash({ kind: 'asset', id }); await load() } }
  selectedAssetIds.value = []
  await load()
}

function showAssetMenu(event: MouseEvent, asset: LibraryAsset) { event.preventDefault(); if (!selectedAssetIds.value.includes(asset.id)) selectedAssetIds.value = [asset.id]; contextMenu.value = { x: event.clientX, y: event.clientY, asset, folder: null } }
function showFolderMenu(event: MouseEvent, folder: AssetFolder) { event.preventDefault(); contextMenu.value = { x: event.clientX, y: event.clientY, asset: null, folder } }

function createFolder() {
  folderName.value = ''
  folderError.value = ''
  folderDialog.value = { mode: 'create', folder: null }
}

function renameFolder(folder: AssetFolder) {
  folderName.value = folder.name
  folderError.value = ''
  folderDialog.value = { mode: 'rename', folder }
}

function closeFolderDialog() {
  if (!folderBusy.value) folderDialog.value = null
}

async function saveFolder() {
  const dialog = folderDialog.value
  const name = folderName.value.trim()
  if (!dialog || !name) {
    folderError.value = '\u8bf7\u8f93\u5165\u6587\u4ef6\u5939\u540d\u79f0'
    return
  }
  folderBusy.value = true
  folderError.value = ''
  try {
    if (dialog.mode === 'create') await window.api.assetLibrary.createFolder({ name, parentId: currentFolderId.value })
    else if (dialog.folder && name !== dialog.folder.name) await window.api.assetLibrary.renameFolder({ id: dialog.folder.id, name })
    folderDialog.value = null
    await load()
  } catch (cause) { folderError.value = cause instanceof Error ? cause.message : String(cause) }
  finally { folderBusy.value = false }
}

async function removeFolder(folder: AssetFolder) {
  const stats = await window.api.assetLibrary.folderStats(folder.id) as { folderCount: number; assetCount: number; totalSize: number }
  if (!window.confirm(`\u5c06\u6587\u4ef6\u5939 "${folder.name}" \u79fb\u5165\u56de\u6536\u7ad9\uff1f\u5171 ${stats.folderCount} \u4e2a\u6587\u4ef6\u5939\u3001${stats.assetCount} \u9879\u7d20\u6750\uff0c${formatBytes(stats.totalSize)}\u3002`)) return
  try { await window.api.assetLibrary.trashFolder(folder.id); undoAction.value = { label: `\u5df2\u5c06\u6587\u4ef6\u5939 "${folder.name}" \u79fb\u5165\u56de\u6536\u7ad9`, run: async () => { await window.api.assetLibrary.restoreTrash({ kind: 'folder', id: folder.id }); await load() } }; await load() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
}

function onAssetDragStart(event: DragEvent, asset: LibraryAsset) {
  draggedAssetIds.value = selectedAssetIds.value.includes(asset.id) ? [...selectedAssetIds.value] : [asset.id]
  if (event.dataTransfer) {
    const payload = JSON.stringify(draggedAssetIds.value)
    event.dataTransfer.setData('application/x-videogenerate-asset-ids', payload)
    event.dataTransfer.setData('text/plain', `videogenerate-assets:${payload}`)
    event.dataTransfer.effectAllowed = 'move'
  }
}

function onFolderDragStart(event: DragEvent, folder: AssetFolder) {
  draggedFolderId.value = folder.id
  event.dataTransfer?.setData('application/x-videogenerate-folder-id', folder.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onAssetDragEnd() {
  draggedAssetIds.value = []
  clearDropState()
}

function onDragOver(event: DragEvent, folderId: string | null) {
  if (!event.dataTransfer) return
  event.preventDefault()
  event.dataTransfer.dropEffect = event.dataTransfer.types.includes('Files') ? 'copy' : 'move'
  dropActive.value = true
  dropFolderId.value = folderId
}

function clearDropState() {
  dropActive.value = false
  dropFolderId.value = null
}

function onFolderDragLeave(event: DragEvent) {
  const current = event.currentTarget as HTMLElement | null
  const next = event.relatedTarget as Node | null
  if (current && next && current.contains(next)) return
  clearDropState()
}

function onLibraryDragLeave(event: DragEvent) {
  if (!event.relatedTarget) clearDropState()
}

async function onDrop(event: DragEvent, folderId: string | null) {
  event.preventDefault()
  clearDropState()
  error.value = ''
  try {
    const customPayload = event.dataTransfer?.getData('application/x-videogenerate-asset-ids') || ''
    const textPayload = event.dataTransfer?.getData('text/plain') || ''
    const serializedIds = customPayload || (textPayload.startsWith('videogenerate-assets:') ? textPayload.slice('videogenerate-assets:'.length) : '')
    const transferredIds = serializedIds ? JSON.parse(serializedIds) as string[] : []
    const assetIds = transferredIds.length ? transferredIds : draggedAssetIds.value
    const folderToMove = event.dataTransfer?.getData('application/x-videogenerate-folder-id') || draggedFolderId.value
    if (folderToMove) {
      movingAssets.value = true
      await window.api.assetLibrary.moveFolder({ id: folderToMove, parentId: folderId })
    } else if (assetIds.length) {
      movingAssets.value = true
      await window.api.assetLibrary.moveAssets({ ids: [...assetIds], folderId })
    }
    else {
      const paths = Array.from(event.dataTransfer?.files || []).map((file) => window.api.getPathForFile(file)).filter(Boolean)
      if (!paths.length) throw new Error('\u672a\u8bc6\u522b\u5230\u53ef\u5bfc\u5165\u7684\u56fe\u7247\u6216\u89c6\u9891\u6587\u4ef6\u3002')
      movingAssets.value = true
      await window.api.assetLibrary.importPaths({ paths, folderId })
    }
    await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
  finally { movingAssets.value = false; draggedAssetIds.value = []; draggedFolderId.value = null }
}

function handleKeyboard(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.matches('input, textarea, select')) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); selectAllAssets() }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') copySelection('copy')
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'x') copySelection('cut')
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') void pasteClipboard()
  else if (event.key === 'Delete') void removeSelectedAssets()
  else if (event.key === 'Escape') { clearSelection(); contextMenu.value = null }
}

function closeContextMenu() { contextMenu.value = null }

async function createQr() {
  error.value = ''
  try {
    const session = await window.api.assetLibrary.createUploadSession() as { url: string; expiresAt: number }
    uploadUrl.value = session.url
    expiresAt.value = session.expiresAt
    qrImage.value = await QRCode.toDataURL(session.url, { width: 240, margin: 2 })
    qrOpen.value = true
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause) }
}

async function removeAsset(asset: LibraryAsset) {
  if (!window.confirm(`\u5c06 "${asset.name}" \u79fb\u5165\u56de\u6536\u7ad9\uff1f`)) return
  await window.api.assetLibrary.trashAssets([asset.id])
  undoAction.value = { label: `\u5df2\u5c06 "${asset.name}" \u79fb\u5165\u56de\u6536\u7ad9`, run: async () => { await window.api.assetLibrary.restoreTrash({ kind: 'asset', id: asset.id }); await load() } }
  await load()
}

async function openTrash() { trash.value = await window.api.assetLibrary.listTrash() as AssetLibraryTrash; trashOpen.value = true }
async function restoreTrashItem(kind: 'asset' | 'folder', id: string) { await window.api.assetLibrary.restoreTrash({ kind, id }); trash.value = await window.api.assetLibrary.listTrash() as AssetLibraryTrash; await load() }
async function purgeTrashItem(kind?: 'asset' | 'folder', id?: string) {
  if (!window.confirm(kind ? '\u5f7b\u5e95\u5220\u9664\u8be5\u9879\uff1f\u6b64\u64cd\u4f5c\u65e0\u6cd5\u64a4\u9500\u3002' : '\u6e05\u7a7a\u56de\u6536\u7ad9\uff1f\u6b64\u64cd\u4f5c\u65e0\u6cd5\u64a4\u9500\u3002')) return
  await window.api.assetLibrary.purgeTrash(kind && id ? { kind, id } : undefined)
  trash.value = await window.api.assetLibrary.listTrash() as AssetLibraryTrash
}
async function runAudit(repair = false) { safetyBusy.value = true; try { auditResult.value = await window.api.assetLibrary.audit(repair) as AssetLibraryAudit; if (repair) await load() } finally { safetyBusy.value = false } }
async function exportBackup() { safetyBusy.value = true; try { const path = await window.api.assetLibrary.exportBackup() as string | null; if (path) window.alert(`\u5907\u4efd\u5df2\u5bfc\u51fa\u5230\uff1a${path}`) } finally { safetyBusy.value = false } }
async function undoLastAction() { const action = undoAction.value; if (!action) return; undoAction.value = null; await action.run() }

function openPreview(asset: LibraryAsset) {
  preview.value = { asset, src: `vg://file?path=${encodeURIComponent(asset.filePath)}` }
}

function closePreview() { preview.value = null }

function openEditor(asset: LibraryAsset) {
  if (asset.type !== 'image') return
  contextMenu.value = null
  editAsset.value = asset
  editMode.value = 'resize'
  editError.value = ''
  editForm.value = { left: 0, top: 0, width: 1000, height: 1000, blur: 18, resizeWidth: 1080, resizeHeight: 1080 }
  cropSelection.value = { left: 0.1, top: 0.1, width: 0.8, height: 0.8 }
}

function closeEditor() { if (!editBusy.value) editAsset.value = null }

function syncSelectionForm() {
  const selection = cropSelection.value
  const stageRect = cropStage.value?.getBoundingClientRect()
  const imageRect = cropImage.value?.getBoundingClientRect()
  if (!stageRect || !imageRect || !imageRect.width || !imageRect.height) return

  const imageLeft = (imageRect.left - stageRect.left) / stageRect.width
  const imageTop = (imageRect.top - stageRect.top) / stageRect.height
  const imageWidth = imageRect.width / stageRect.width
  const imageHeight = imageRect.height / stageRect.height
  const left = Math.max(0, Math.min(1, (selection.left - imageLeft) / imageWidth))
  const top = Math.max(0, Math.min(1, (selection.top - imageTop) / imageHeight))
  const right = Math.max(left, Math.min(1, (selection.left + selection.width - imageLeft) / imageWidth))
  const bottom = Math.max(top, Math.min(1, (selection.top + selection.height - imageTop) / imageHeight))
  editForm.value.left = Math.round(left * cropNatural.value.width)
  editForm.value.top = Math.round(top * cropNatural.value.height)
  editForm.value.width = Math.max(1, Math.round((right - left) * cropNatural.value.width))
  editForm.value.height = Math.max(1, Math.round((bottom - top) * cropNatural.value.height))
}

function onCropImageLoad() {
  if (!cropImage.value) return
  cropNatural.value = { width: cropImage.value.naturalWidth || 1, height: cropImage.value.naturalHeight || 1 }
  syncSelectionForm()
}

function selectEditMode(mode: 'resize' | 'crop' | 'watermark') {
  editMode.value = mode
  if (mode === 'crop') cropSelection.value = { left: 0.1, top: 0.1, width: 0.8, height: 0.8 }
  if (mode === 'watermark') cropSelection.value = { left: 0.6, top: 0.72, width: 0.3, height: 0.18 }
}

function cropPoint(event: PointerEvent) {
  const stageRect = cropStage.value?.getBoundingClientRect()
  const imageRect = cropImage.value?.getBoundingClientRect()
  if (!stageRect || !imageRect) return { x: 0, y: 0 }

  // Normalize against the rendered image so object-fit or letterboxing cannot skew source pixels.
  const imageX = Math.max(0, Math.min(imageRect.width, event.clientX - imageRect.left))
  const imageY = Math.max(0, Math.min(imageRect.height, event.clientY - imageRect.top))
  const x = (imageRect.left - stageRect.left + imageX) / stageRect.width
  const y = (imageRect.top - stageRect.top + imageY) / stageRect.height
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
}

function startCrop(event: PointerEvent) {
  if (!cropStage.value) return
  cropDragging.value = true
  cropStart.value = cropPoint(event)
  cropSelection.value = { left: cropStart.value.x, top: cropStart.value.y, width: 0, height: 0 }
  cropStage.value.setPointerCapture(event.pointerId)
}

function moveCrop(event: PointerEvent) {
  if (!cropDragging.value) return
  const point = cropPoint(event)
  const left = Math.min(cropStart.value.x, point.x)
  const top = Math.min(cropStart.value.y, point.y)
  cropSelection.value = { left, top, width: Math.max(0.01, Math.abs(point.x - cropStart.value.x)), height: Math.max(0.01, Math.abs(point.y - cropStart.value.y)) }
  syncSelectionForm()
}

function endCrop() { cropDragging.value = false }

async function saveEdit() {
  if (!editAsset.value) return
  editBusy.value = true
  editError.value = ''
  try {
    const editedAssetId = editAsset.value.id
    const form = editForm.value
    if (editMode.value !== 'resize') syncSelectionForm()
    const input = editMode.value === 'crop'
      ? { crop: { left: form.left, top: form.top, width: form.width, height: form.height } }
      : editMode.value === 'watermark'
        ? { removeWatermark: { left: form.left, top: form.top, width: form.width, height: form.height, blur: form.blur } }
        : { resize: { width: form.resizeWidth, height: form.resizeHeight, fit: 'contain' as const } }
    await window.api.assetLibrary.editImage({ id: editedAssetId, input })
    editAsset.value = null
    delete thumbnails.value[editedAssetId]
    await load()
  } catch (cause) { editError.value = cause instanceof Error ? cause.message : String(cause) }
  finally { editBusy.value = false }
}

onMounted(() => {
  void load()
  timer = setInterval(() => {
    now.value = Date.now()
    if (qrOpen.value && remaining.value === 0) qrOpen.value = false
    else if (qrOpen.value) void load()
  }, 3000)
  window.addEventListener('asset-library:uploaded', load)
  window.addEventListener('keydown', handleKeyboard)
  window.addEventListener('click', closeContextMenu)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('asset-library:uploaded', load)
  window.removeEventListener('keydown', handleKeyboard)
  window.removeEventListener('click', closeContextMenu)
  endMarquee()
})
</script>

<template>
  <div class="vg-scope asset-library-page" @dragenter.prevent="onDragOver($event, currentFolderId)" @dragover="onDragOver($event, currentFolderId)" @dragleave="onLibraryDragLeave" @drop="onDrop($event, currentFolderId)">
    <header class="asset-library-hero">
      <div class="asset-library-hero__copy">
        <div class="asset-library-hero__title"><FolderOpen :size="34" stroke-width="1.8" /><h1>{{ t('nav.assetLibrary') }}</h1></div>
        <p>本机统一管理的图片和视频素材，桌面插件可以从这里选择。</p>
        <div class="asset-library-stats">
          <span><Images :size="17" /> {{ assets.length }} 项素材</span><span><ImagePlus :size="17" /> {{ imageCount }} 张图片</span><span><Video :size="17" /> {{ videoCount }} 个视频</span>
        </div>
      </div>
      <div class="asset-library-hero__art" aria-hidden="true"><div class="asset-art-card asset-art-card--back"></div><div class="asset-art-card asset-art-card--middle"></div><div class="asset-art-card asset-art-card--front"><Images :size="42" /></div></div>
      <div class="asset-library-actions">
        <button type="button" class="asset-btn asset-btn--quiet" @click="createQr"><Smartphone :size="16" /> 手机扫码上传</button>
        <button type="button" class="asset-btn asset-btn--primary" @click="upload"><ImagePlus :size="16" /> 上传素材</button>
      </div>
    </header>

    <section class="asset-folder-toolbar">
      <div class="asset-nav-buttons"><button type="button" :disabled="navigationIndex === 0" title="Back" @click="navigateHistory(-1)"><ArrowLeft :size="15" /></button><button type="button" :disabled="navigationIndex >= navigationHistory.length - 1" title="Forward" @click="navigateHistory(1)"><ArrowRight :size="15" /></button><button type="button" :disabled="!currentFolderId" title="Up" @click="openParentFolder"><ArrowUp :size="15" /></button></div>
      <nav class="asset-breadcrumbs" aria-label="Folder path">
        <button type="button" @click="openFolder(null)"><FolderOpen :size="16" /> &#32032;&#26448;&#24211;</button>
        <template v-for="folder in folderPath" :key="folder.id"><BreadcrumbSeparator :size="14" /><button type="button" @click="openFolder(folder.id)">{{ folder.name }}</button></template>
      </nav>
      <button type="button" class="asset-new-folder" @click="createFolder"><FolderPlus :size="16" /> &#26032;&#24314;&#25991;&#20214;&#22841;</button>
    </section>

    <section class="asset-library-toolbar asset-library-toolbar--compact">
      <label class="asset-search"><Search :size="17" /><input v-model="query" placeholder="搜索素材名称..." @input="searchAssets"></label>
      <div class="asset-filter" role="group" aria-label="素材类型">
        <button v-for="item in ([['all', '全部'], ['image', '图片'], ['video', '视频']] as const)" :key="item[0]" type="button" :class="{ active: filter === item[0] }" @click="selectFilter(item[0])">{{ item[1] }}</button>
      </div>
      <button type="button" class="asset-icon-btn" title="刷新素材" @click="load"><RefreshCw :size="16" /></button>
      <select v-model="sortBy" class="asset-sort" title="Sort"><option value="createdAt">&#26102;&#38388;</option><option value="name">&#21517;&#31216;</option><option value="size">&#22823;&#23567;</option><option value="type">&#31867;&#22411;</option></select>
      <button type="button" class="asset-icon-btn" :title="sortDirection === 'asc' ? 'Ascending' : 'Descending'" @click="sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'"><ArrowUp v-if="sortDirection === 'asc'" :size="16" /><ArrowUp v-else :size="16" style="transform:rotate(180deg)" /></button>
      <div class="asset-view-toggle" role="group" aria-label="视图模式"><button type="button" :class="{ active: layout === 'grid' }" title="网格视图" @click="layout = 'grid'"><Grid2X2 :size="17" /></button><button type="button" :class="{ active: layout === 'list' }" title="列表视图" @click="layout = 'list'"><List :size="17" /></button></div>
      <button type="button" class="asset-icon-btn" title="Density" @click="density = density === 'comfortable' ? 'compact' : 'comfortable'"><MoreHorizontal :size="17" /></button>
      <button type="button" class="asset-icon-btn" title="Recycle bin" @click="openTrash"><Trash2 :size="16" /></button>
      <button type="button" class="asset-icon-btn" title="Check library" :disabled="safetyBusy" @click="runAudit(false)"><ShieldCheck :size="16" /></button>
      <button type="button" class="asset-icon-btn" title="Export backup" :disabled="safetyBusy" @click="exportBackup"><Download :size="16" /></button>
    </section>

    <div v-if="selectedAssetIds.length" class="asset-selection-bar"><CheckSquare :size="17" /><strong>&#24050;&#36873; {{ selectedAssetIds.length }} &#39033;</strong><span>{{ formatBytes(selectedSize) }}</span><button type="button" @click="selectAllAssets">&#20840;&#36873;&#26412;&#39029;</button><button v-if="selectedEditableAsset" type="button" @click="openEditor(selectedEditableAsset)"><Crop :size="14" /> &#32534;&#36753;</button><button type="button" @click="copySelection('copy')"><Copy :size="14" /> &#22797;&#21046;</button><button type="button" @click="copySelection('cut')"><Clipboard :size="14" /> &#21098;&#20999;</button><button type="button" class="danger" @click="removeSelectedAssets"><Trash2 :size="14" /> &#21024;&#38500;</button><button type="button" @click="clearSelection"><X :size="14" /></button></div>
    <div v-else-if="clipboard" class="asset-selection-bar asset-selection-bar--clipboard"><Clipboard :size="17" /><span><template v-if="clipboard.mode === 'copy'">&#24050;&#22797;&#21046;</template><template v-else>&#24050;&#21098;&#20999;</template> {{ clipboard.ids.length }} &#39033;</span><button type="button" @click="pasteClipboard">&#31896;&#36148;&#21040;&#24403;&#21069;&#30446;&#24405;</button><button type="button" @click="clipboard = null"><X :size="14" /></button></div>

    <section
      v-if="dropActive && dropFolderId === currentFolderId"
      class="asset-drop-zone"
      :class="{ active: true }"
      @dragenter.prevent="onDragOver($event, currentFolderId)"
      @dragover="onDragOver($event, currentFolderId)"
      @drop="onDrop($event, currentFolderId)"
    ><ImagePlus :size="18" /> &#25226;&#22270;&#29255;&#25110;&#35270;&#39057;&#25209;&#37327;&#25302;&#21040;&#36825;&#37324;&#65292;&#25110;&#25302;&#21040;&#19979;&#26041;&#25991;&#20214;&#22841;</section>

    <div v-if="folders.length" class="asset-folder-grid">
      <article
        v-for="folder in folders"
        :key="folder.id"
        class="asset-folder"
        :class="{ active: dropActive && dropFolderId === folder.id }"
        draggable="true"
        @dblclick="openFolder(folder.id)"
        @dragstart="onFolderDragStart($event, folder)"
        @dragend="draggedFolderId = null"
        @contextmenu="showFolderMenu($event, folder)"
        @dragenter.prevent.stop="onDragOver($event, folder.id)"
        @dragover.stop="onDragOver($event, folder.id)"
        @dragleave.stop="onFolderDragLeave"
        @drop.prevent.stop="onDrop($event, folder.id)"
      >
        <button type="button" class="asset-folder__open" @click="openFolder(folder.id)"><Folder :size="28" /><span>{{ folder.name }}</span></button>
        <div class="asset-folder__actions"><button type="button" title="Rename folder" @click="renameFolder(folder)"><Pencil :size="14" /></button><button type="button" title="Delete folder" @click="removeFolder(folder)"><Trash2 :size="14" /></button></div>
      </article>
    </div>

    <p v-if="error" class="asset-error">{{ error }}</p>
    <div v-if="movingAssets" class="asset-moving-status"><RefreshCw :size="16" /> &#27491;&#22312;&#25972;&#29702;&#32032;&#26448;...</div>
    <div v-if="loading" class="asset-empty">正在读取素材...</div>
    <div v-else-if="!assets.length" class="asset-empty"><Images :size="24" /><strong>素材库为空</strong><span>从电脑上传，或使用手机扫描二维码发送到此电脑。</span></div>
    <div v-else ref="assetGrid" class="asset-grid" :class="{ 'asset-grid--list': layout === 'list', 'asset-grid--compact': density === 'compact' }" @pointerdown="startMarquee">
      <div v-if="marquee" class="asset-marquee" :style="{ left: `${marquee.left}px`, top: `${marquee.top}px`, width: `${marquee.width}px`, height: `${marquee.height}px` }"></div>
      <article v-for="asset in paginatedAssets" :key="asset.id" :data-asset-id="asset.id" class="asset-tile" :class="{ selected: selectedAssetIds.includes(asset.id), cut: clipboard?.mode === 'cut' && clipboard.ids.includes(asset.id), 'asset-tile--image': asset.type === 'image' }" draggable="true" @click="selectAsset($event, asset)" @dblclick="openPreview(asset)" @contextmenu="showAssetMenu($event, asset)" @dragstart="onAssetDragStart($event, asset)" @dragend="onAssetDragEnd">
        <button type="button" class="asset-select-mark" :aria-label="selectedAssetIds.includes(asset.id) ? 'Deselect asset' : 'Select asset'" @click.stop="toggleAssetSelection(asset)"><CheckSquare :size="17" /></button>
        <button type="button" class="asset-thumb" @click.stop="selectAsset($event, asset)" @dblclick.stop="openPreview(asset)">
          <img v-if="thumbnails[asset.id]" :src="thumbnails[asset.id]" :alt="asset.name" loading="lazy" draggable="false" />
          <ImagePlus v-else-if="asset.type === 'image'" :size="30" />
          <Video v-else :size="30" />
          <span>{{ asset.type === 'image' ? '图片' : '视频' }}</span>
        </button>
        <div class="asset-meta"><strong :title="asset.name">{{ asset.name }}</strong><small>{{ formatBytes(asset.size) }} · {{ asset.source === 'mobile' ? '手机上传' : '电脑上传' }} · {{ asset.qiniuUrl ? '云端已备份' : '本地存储' }}</small></div>
        <div class="asset-tile-actions"><button v-if="asset.type === 'image'" type="button" class="asset-action" title="Edit image" @click.stop="openEditor(asset)"><Crop :size="14" /></button><button type="button" class="asset-action" title="Rename" @click.stop="openAssetRename(asset)"><Pencil :size="14" /></button><button type="button" class="asset-action asset-action--danger" :title="`Delete ${asset.name}`" @click.stop="removeAsset(asset)"><Trash2 :size="14" /></button></div>
      </article>
    </div>

    <nav v-if="!loading && assets.length > pageSize" class="asset-pagination" aria-label="素材分页">
      <span class="asset-pagination__summary">共 {{ assets.length }} 项，第 {{ currentPage }} / {{ totalPages }} 页</span>
      <div class="asset-pagination__controls">
        <button type="button" class="asset-pagination__button" :disabled="currentPage === 1" aria-label="上一页" @click="goToPage(currentPage - 1)"><ChevronLeft :size="17" /></button>
        <button v-for="page in visiblePages" :key="page" type="button" class="asset-pagination__button" :class="{ active: currentPage === page }" :aria-current="currentPage === page ? 'page' : undefined" @click="goToPage(page)">{{ page }}</button>
        <button type="button" class="asset-pagination__button" :disabled="currentPage === totalPages" aria-label="下一页" @click="goToPage(currentPage + 1)"><ChevronRight :size="17" /></button>
      </div>
    </nav>

    <div v-if="qrOpen" class="asset-modal-backdrop" @click.self="qrOpen = false">
      <section class="asset-modal" role="dialog" aria-modal="true" aria-label="手机扫码上传">
        <button class="asset-modal-close" type="button" aria-label="关闭" @click="qrOpen = false">×</button>
        <Smartphone :size="22" /><h2>手机扫码上传</h2><p>请让手机和电脑连接同一 Wi-Fi，再扫描二维码。</p>
        <img :src="qrImage" alt="扫码打开手机上传页" />
        <code>{{ uploadUrl }}</code><small>二维码将在 {{ Math.floor(remaining / 60) }} 分钟后失效</small>
      </section>
    </div>

    <div v-if="preview" class="asset-modal-backdrop" @click.self="closePreview">
      <section class="asset-preview" role="dialog" aria-modal="true"><button class="asset-modal-close" type="button" aria-label="关闭" @click="closePreview">×</button>
        <img v-if="preview.asset.type === 'image'" :src="preview.src" :alt="preview.asset.name" />
        <video v-else :src="preview.src" controls autoplay playsinline />
        <strong>{{ preview.asset.name }}</strong>
      </section>
    </div>

    <div v-if="editAsset" class="asset-modal-backdrop" @click.self="closeEditor">
      <section class="asset-editor" role="dialog" aria-modal="true" aria-label="编辑图片">
        <button class="asset-modal-close" type="button" aria-label="关闭" @click="closeEditor"><X :size="18" /></button>
        <div class="asset-editor-head"><Pencil :size="18" /><div><h2>编辑原图</h2><p :title="editAsset.name">{{ editAsset.name }}</p></div></div>
        <div class="asset-editor-tabs"><button type="button" :class="{ active: editMode === 'resize' }" @click="selectEditMode('resize')">修改尺寸</button><button type="button" :class="{ active: editMode === 'crop' }" @click="selectEditMode('crop')">裁剪</button><button type="button" :class="{ active: editMode === 'watermark' }" @click="selectEditMode('watermark')">去水印</button></div>
        <div v-if="editMode === 'resize'" class="asset-editor-fields"><label>宽度<input v-model.number="editForm.resizeWidth" type="number" min="1" max="12000" /></label><label>高度<input v-model.number="editForm.resizeHeight" type="number" min="1" max="12000" /></label><small>保持原图比例适配到指定尺寸，结果会覆盖当前图片。</small></div>
        <div v-else-if="editMode === 'crop'" class="asset-editor-fields"><div ref="cropStage" class="crop-stage" style="border-radius:7px!important;clip-path:none!important;mask:none!important;-webkit-mask:none!important" @pointerdown="startCrop" @pointermove="moveCrop" @pointerup="endCrop" @pointercancel="endCrop"><img ref="cropImage" :src="`vg://file?path=${encodeURIComponent(editAsset.filePath)}`" style="border-radius:0!important;clip-path:none!important;mask:none!important;-webkit-mask:none!important" alt="裁剪预览" @load="onCropImageLoad" /><div class="crop-selection" :style="{ left: `${cropSelection.left * 100}%`, top: `${cropSelection.top * 100}%`, width: `${cropSelection.width * 100}%`, height: `${cropSelection.height * 100}%` }"><span>拖拽选择区域</span></div></div><div class="crop-readout">{{ editForm.width }} × {{ editForm.height }} px</div><small>直接在图片上拖拽选择裁剪区域，坐标会自动换算为原图像素。</small></div>
        <div v-else class="asset-editor-fields"><div ref="cropStage" class="crop-stage" style="border-radius:7px!important;clip-path:none!important;mask:none!important;-webkit-mask:none!important" @pointerdown="startCrop" @pointermove="moveCrop" @pointerup="endCrop" @pointercancel="endCrop"><img ref="cropImage" :src="`vg://file?path=${encodeURIComponent(editAsset.filePath)}`" style="border-radius:0!important;clip-path:none!important;mask:none!important;-webkit-mask:none!important" alt="去水印预览" @load="onCropImageLoad" /><div class="crop-selection crop-selection--watermark" :style="{ left: `${cropSelection.left * 100}%`, top: `${cropSelection.top * 100}%`, width: `${cropSelection.width * 100}%`, height: `${cropSelection.height * 100}%` }"><span>拖拽选择水印区域</span></div></div><div class="crop-readout">水印区域 {{ editForm.width }} × {{ editForm.height }} px</div><label>模糊强度<input v-model.number="editForm.blur" type="number" min="1" max="100" /></label><small>直接在图片上框选水印区域，保存后使用局部模糊覆盖原图。</small></div>
        <p v-if="editError" class="asset-error">{{ editError }}</p>
        <footer class="asset-editor-footer"><span>保存后覆盖本地原图，并更新云端版本</span><button type="button" class="asset-btn asset-btn--quiet" :disabled="editBusy" @click="closeEditor">取消</button><button type="button" class="asset-btn asset-btn--primary" :disabled="editBusy" @click="saveEdit">{{ editBusy ? '处理中…' : '保存覆盖' }}</button></footer>
      </section>
    </div>

    <div v-if="folderDialog" class="asset-modal-backdrop" @click.self="closeFolderDialog">
      <form class="asset-folder-dialog" role="dialog" aria-modal="true" @submit.prevent="saveFolder">
        <button class="asset-modal-close" type="button" aria-label="Close" @click="closeFolderDialog"><X :size="18" /></button>
        <div class="asset-folder-dialog__icon"><FolderPlus :size="22" /></div>
        <div><h2><span v-if="folderDialog.mode === 'create'">&#26032;&#24314;&#25991;&#20214;&#22841;</span><span v-else>&#37325;&#21629;&#21517;&#25991;&#20214;&#22841;</span></h2><p><span v-if="folderDialog.mode === 'create'">&#22312;&#24403;&#21069;&#30446;&#24405;&#20013;&#21019;&#24314;&#25991;&#20214;&#22841;</span><span v-else>&#20462;&#25913;&#25991;&#20214;&#22841;&#21517;&#31216;</span></p></div>
        <label><span>&#25991;&#20214;&#22841;&#21517;&#31216;</span><input v-model="folderName" autofocus maxlength="180" placeholder="Folder name" /></label>
        <p v-if="folderError" class="asset-error">{{ folderError }}</p>
        <footer><button type="button" class="asset-btn asset-btn--quiet" :disabled="folderBusy" @click="closeFolderDialog">&#21462;&#28040;</button><button type="submit" class="asset-btn asset-btn--primary" :disabled="folderBusy"><span v-if="folderBusy">&#20445;&#23384;&#20013;...</span><span v-else>&#20445;&#23384;</span></button></footer>
      </form>
    </div>

    <div v-if="assetRename" class="asset-modal-backdrop" @click.self="assetRename = null"><form class="asset-folder-dialog asset-rename-dialog" role="dialog" aria-modal="true" @submit.prevent="saveAssetRename"><button class="asset-modal-close" type="button" @click="assetRename = null"><X :size="18" /></button><div class="asset-folder-dialog__icon"><Pencil :size="22" /></div><div class="asset-rename-dialog__heading"><h2>&#37325;&#21629;&#21517;&#32032;&#26448;</h2><p :title="assetRename.name">{{ assetRename.name }}</p></div><label><span>&#32032;&#26448;&#21517;&#31216;</span><input v-model="assetRenameValue" autofocus maxlength="180" /></label><footer><button type="button" class="asset-btn asset-btn--quiet" @click="assetRename = null">&#21462;&#28040;</button><button type="submit" class="asset-btn asset-btn--primary">&#20445;&#23384;</button></footer></form></div>

    <div v-if="contextMenu" class="asset-context-menu" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop>
      <template v-if="contextMenu.asset"><button type="button" @click="openPreview(contextMenu.asset); contextMenu = null">&#39044;&#35272;</button><button v-if="contextMenu.asset.type === 'image'" type="button" @click="openEditor(contextMenu.asset)">&#32534;&#36753;&#22270;&#29255;</button><button type="button" @click="openAssetRename(contextMenu.asset)">&#37325;&#21629;&#21517;</button><button type="button" @click="copySelection('copy'); contextMenu = null">&#22797;&#21046;</button><button type="button" @click="copySelection('cut'); contextMenu = null">&#21098;&#20999;</button><button type="button" class="danger" @click="removeSelectedAssets(); contextMenu = null">&#21024;&#38500;</button></template>
      <template v-else-if="contextMenu.folder"><button type="button" @click="openFolder(contextMenu.folder.id); contextMenu = null">&#25171;&#24320;</button><button type="button" @click="renameFolder(contextMenu.folder); contextMenu = null">&#37325;&#21629;&#21517;</button><button type="button" class="danger" @click="removeFolder(contextMenu.folder); contextMenu = null">&#21024;&#38500;</button></template>
    </div>

    <div v-if="trashOpen" class="asset-modal-backdrop" @click.self="trashOpen = false"><section class="asset-trash-dialog"><header><div><h2>&#22238;&#25910;&#31449;</h2><p>&#21024;&#38500;&#30340;&#32032;&#26448;&#21644;&#25991;&#20214;&#22841;&#21487;&#20197;&#22312;&#36825;&#37324;&#24674;&#22797;</p></div><button type="button" class="asset-modal-close" @click="trashOpen = false"><X :size="18" /></button></header><div v-if="!trash.assets.length && !trash.folders.length" class="asset-empty"><Trash2 :size="28" /><strong>&#22238;&#25910;&#31449;&#20026;&#31354;</strong></div><div v-else class="asset-trash-list"><article v-for="folder in trash.folders" :key="folder.id"><Folder :size="20" /><div><strong>{{ folder.name }}</strong><small>&#25991;&#20214;&#22841;</small></div><button type="button" @click="restoreTrashItem('folder', folder.id)"><ArchiveRestore :size="15" /> &#24674;&#22797;</button><button type="button" class="danger" @click="purgeTrashItem('folder', folder.id)"><Trash2 :size="15" /></button></article><article v-for="asset in trash.assets" :key="asset.id"><ImagePlus v-if="asset.type === 'image'" :size="20" /><Video v-else :size="20" /><div><strong>{{ asset.name }}</strong><small>{{ formatBytes(asset.size) }}</small></div><button type="button" @click="restoreTrashItem('asset', asset.id)"><ArchiveRestore :size="15" /> &#24674;&#22797;</button><button type="button" class="danger" @click="purgeTrashItem('asset', asset.id)"><Trash2 :size="15" /></button></article></div><footer v-if="trash.assets.length || trash.folders.length"><button type="button" class="asset-btn asset-btn--quiet" @click="purgeTrashItem()">&#28165;&#31354;&#22238;&#25910;&#31449;</button></footer></section></div>

    <div v-if="auditResult" class="asset-modal-backdrop" @click.self="auditResult = null"><section class="asset-audit-dialog"><button type="button" class="asset-modal-close" @click="auditResult = null"><X :size="18" /></button><ShieldCheck :size="30" /><h2>&#32032;&#26448;&#24211;&#26816;&#26597;</h2><p>&#32570;&#22833;&#25991;&#20214; {{ auditResult.missingAssetIds.length }} &#39033;&#65292;&#23396;&#31435;&#32032;&#26448; {{ auditResult.orphanAssetIds.length }} &#39033;&#65292;&#23396;&#31435;&#25991;&#20214;&#22841; {{ auditResult.orphanFolderIds.length }} &#39033;&#12290;</p><button v-if="!auditResult.repaired && (auditResult.missingAssetIds.length || auditResult.orphanAssetIds.length || auditResult.orphanFolderIds.length)" type="button" class="asset-btn asset-btn--primary" @click="runAudit(true)">&#33258;&#21160;&#20462;&#22797;</button></section></div>

    <div v-if="undoAction" class="asset-undo"><span>{{ undoAction.label }}</span><button type="button" @click="undoLastAction">&#25764;&#38144;</button><button type="button" @click="undoAction = null"><X :size="14" /></button></div>
  </div>
</template>

<style scoped>
/* Asset library — vg- design language, colours from --theme-* tokens only. */
.asset-library-page { display: flex; flex-direction: column; gap: 12px; min-height: 100%; padding: 14px 20px 20px; width: min(1408px, 100%); margin: 0 auto; }

/* Header (same anatomy as vg-page-head) */
.asset-library-hero { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.asset-library-hero__copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.asset-library-hero__title { display: flex; align-items: center; gap: 12px; }
.asset-library-hero__title svg { width: 40px; height: 40px; padding: 9px; border-radius: 11px; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); flex-shrink: 0; }
.asset-library-hero__title h1 { font-size: 20px; font-weight: 800; color: var(--theme-text); }
.asset-library-hero__copy > p { color: var(--theme-text-muted); font-size: 13px; padding-left: 52px; }
.asset-library-stats { display: flex; flex-wrap: wrap; gap: 6px; padding-left: 52px; margin-top: 6px; }
.asset-library-stats span { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px; border-radius: 999px; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); color: var(--theme-text-secondary); font-size: 12px; }
.asset-library-stats svg { width: 14px; height: 14px; color: var(--vg-accent); }
.asset-library-hero__art { display: none; }
.asset-library-actions { display: inline-flex; gap: 8px; margin-left: auto; }

/* Buttons */
.asset-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 14px; border: 1px solid var(--theme-border-control); border-radius: var(--vg-radius-sm); background: var(--theme-control); color: var(--theme-text); font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: background .15s, border-color .15s, color .15s; }
.asset-btn:hover:not(:disabled) { background: var(--theme-control-hover); border-color: var(--vg-accent); color: var(--vg-accent); }
.asset-btn:disabled { opacity: .5; cursor: not-allowed; }
.asset-btn--primary { background: var(--vg-accent); border-color: var(--vg-accent); color: var(--theme-on-accent); font-weight: 600; }
.asset-btn--primary:hover:not(:disabled) { background: var(--theme-accent-hover, var(--vg-accent)); border-color: var(--theme-accent-hover, var(--vg-accent)); color: var(--theme-on-accent); }
.asset-btn--quiet { background: transparent; }
.asset-icon-btn, .asset-nav-buttons button { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel); color: var(--theme-text-secondary); cursor: pointer; transition: all .15s; flex-shrink: 0; }
.asset-nav-buttons button { width: 30px; height: 30px; border-radius: 7px; }
.asset-icon-btn:hover:not(:disabled), .asset-nav-buttons button:hover:not(:disabled) { border-color: var(--vg-accent-line); color: var(--vg-accent); }
.asset-icon-btn:disabled, .asset-nav-buttons button:disabled { opacity: .35; cursor: not-allowed; }
.asset-nav-buttons { display: flex; gap: 4px; }

/* Folder path bar */
.asset-folder-toolbar { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); }
.asset-breadcrumbs { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; overflow: hidden; color: var(--theme-text-muted); }
.asset-breadcrumbs button { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-secondary); font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; }
.asset-breadcrumbs button:last-child { color: var(--theme-text); font-weight: 600; }
.asset-breadcrumbs button:hover { background: var(--theme-panel-soft); color: var(--vg-accent); }
.asset-new-folder { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border: 1px solid var(--vg-accent-line); border-radius: 7px; background: var(--vg-accent-soft); color: var(--vg-accent); font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0; }
.asset-new-folder:hover { border-color: var(--vg-accent); }

/* Filters toolbar */
.asset-library-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.asset-search { position: relative; display: flex; align-items: center; flex: 1 1 260px; min-width: 200px; }
.asset-search svg { position: absolute; left: 10px; color: var(--theme-text-muted); pointer-events: none; }
.asset-search input { width: 100%; height: 34px; padding: 0 10px 0 34px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-input); color: var(--theme-text); font-size: 13px; outline: none; }
.asset-search input::placeholder { color: var(--theme-text-muted); }
.asset-search input:focus, .asset-sort:focus { border-color: var(--vg-accent); box-shadow: 0 0 0 3px var(--vg-accent-soft); }
.asset-filter, .asset-view-toggle { display: inline-flex; padding: 3px; gap: 2px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel); }
.asset-filter button, .asset-view-toggle button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 26px; min-width: 30px; padding: 0 12px; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-secondary); font-size: 12px; font-weight: 500; cursor: pointer; }
.asset-view-toggle button { padding: 0 6px; }
.asset-filter button:hover, .asset-view-toggle button:hover { color: var(--theme-text); }
.asset-filter button.active, .asset-view-toggle button.active { background: var(--vg-accent-soft); color: var(--vg-accent); font-weight: 600; }
.asset-sort { height: 34px; padding: 0 8px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-input); color: var(--theme-text); font-size: 12px; outline: none; cursor: pointer; }

/* Selection / clipboard bar */
.asset-selection-bar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 12px; border: 1px solid var(--vg-accent-line); border-radius: var(--vg-radius); background: color-mix(in srgb, var(--vg-accent) 8%, var(--theme-panel)); color: var(--theme-text); font-size: 13px; box-shadow: var(--theme-shadow-float); }
.asset-selection-bar > svg { color: var(--vg-accent); }
.asset-selection-bar > span { color: var(--theme-text-muted); font-size: 12px; margin-right: auto; }
.asset-selection-bar button { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border: 1px solid var(--theme-border-control); border-radius: 7px; background: var(--theme-control); color: var(--theme-text); font-size: 12px; cursor: pointer; }
.asset-selection-bar button:hover { border-color: var(--vg-accent); color: var(--vg-accent); }
.asset-selection-bar button.danger { border-color: color-mix(in srgb, var(--vg-red) 45%, transparent); background: transparent; color: var(--vg-red); }
.asset-selection-bar button.danger:hover { background: color-mix(in srgb, var(--vg-red) 12%, transparent); }
.asset-selection-bar--clipboard { border-color: color-mix(in srgb, var(--vg-blue) 40%, transparent); background: color-mix(in srgb, var(--vg-blue) 8%, var(--theme-panel)); }
.asset-selection-bar--clipboard > svg { color: var(--vg-blue); }

/* Drop zone */
.asset-drop-zone { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 64px; border: 2px dashed var(--vg-accent); border-radius: var(--vg-radius); background: var(--vg-accent-soft); color: var(--vg-accent); font-size: 13px; font-weight: 600; }

/* Folders */
.asset-folder-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.asset-folder { position: relative; display: flex; align-items: center; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); transition: border-color .15s, background .15s; }
.asset-folder:hover { border-color: var(--vg-accent-line); }
.asset-folder.active { border-color: var(--vg-accent); background: var(--vg-accent-soft); }
.asset-folder__open { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; padding: 12px 14px; border: 0; background: transparent; color: var(--theme-text); font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; }
.asset-folder__open svg { color: var(--vg-amber); flex-shrink: 0; }
.asset-folder__open span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-folder__actions { display: flex; gap: 2px; padding-right: 8px; opacity: 0; transition: opacity .15s; }
.asset-folder:hover .asset-folder__actions { opacity: 1; }
.asset-folder__actions button { display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-muted); cursor: pointer; }
.asset-folder__actions button:hover { background: var(--theme-panel-soft); color: var(--vg-accent); }

/* Status / empty */
.asset-error { padding: 9px 12px; border: 1px solid color-mix(in srgb, var(--vg-red) 45%, transparent); border-radius: var(--vg-radius-sm); background: color-mix(in srgb, var(--vg-red) 8%, transparent); color: var(--vg-red); font-size: 12px; }
.asset-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 48px 16px; border: 1px dashed var(--theme-border-control); border-radius: var(--vg-radius); color: var(--theme-text-muted); text-align: center; font-size: 13px; }
.asset-empty svg { width: 54px; height: 54px; padding: 14px; border-radius: 14px; background: var(--vg-accent-soft); color: var(--vg-accent); }
.asset-empty strong { color: var(--theme-text); font-size: 15px; }
.asset-moving-status { position: fixed; z-index: 1100; right: 24px; bottom: 24px; display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid var(--vg-accent-line); border-radius: var(--vg-radius); background: var(--theme-panel); color: var(--theme-text); font-size: 12px; box-shadow: var(--theme-shadow-float); }
.asset-moving-status svg { color: var(--vg-accent); animation: asset-spin .8s linear infinite; }
@keyframes asset-spin { to { transform: rotate(360deg); } }

/* Asset grid */
.asset-grid { position: relative; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; user-select: none; }
.asset-grid--compact { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.asset-marquee { position: absolute; z-index: 15; border: 1px solid var(--vg-accent); background: var(--vg-accent-soft); pointer-events: none; }
.asset-tile { position: relative; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); transition: border-color .15s, box-shadow .15s, transform .15s; }
.asset-tile:hover { border-color: var(--vg-accent-line); box-shadow: var(--theme-shadow-float); }
.asset-tile.selected { border-color: var(--vg-accent); box-shadow: 0 0 0 3px var(--vg-accent-soft); }
.asset-tile.cut { opacity: .45; }
.asset-thumb { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 4 / 3; padding: 0; border: 0; border-bottom: 1px solid var(--theme-border); background: var(--theme-panel-soft); color: var(--theme-text-muted); cursor: pointer; overflow: hidden; }
.asset-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.asset-thumb > span { position: absolute; left: 8px; bottom: 8px; height: 20px; padding: 0 7px; border-radius: 5px; background: color-mix(in srgb, var(--theme-root) 72%, transparent); color: var(--theme-text); font-size: 11px; line-height: 20px; }
.asset-select-mark { position: absolute; z-index: 2; top: 8px; left: 8px; display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 1px solid var(--theme-border-control); border-radius: 6px; background: color-mix(in srgb, var(--theme-panel) 88%, transparent); color: var(--theme-text-muted); cursor: pointer; opacity: 0; transition: opacity .15s; }
.asset-tile:hover .asset-select-mark, .asset-tile.selected .asset-select-mark { opacity: 1; }
.asset-tile.selected .asset-select-mark { background: var(--vg-accent); border-color: var(--vg-accent); color: var(--theme-on-accent); }
.asset-meta { display: flex; flex-direction: column; gap: 2px; padding: 9px 11px 10px; min-width: 0; }
.asset-meta strong { font-size: 13px; font-weight: 600; color: var(--theme-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-meta small { font-size: 11px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-tile-actions { position: absolute; z-index: 2; top: 8px; right: 8px; display: flex; gap: 4px; opacity: 0; transition: opacity .15s; }
.asset-tile:hover .asset-tile-actions { opacity: 1; }
.asset-action { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid var(--theme-border-control); border-radius: 6px; background: color-mix(in srgb, var(--theme-panel) 90%, transparent); color: var(--theme-text-secondary); cursor: pointer; }
.asset-action:hover { color: var(--vg-accent); border-color: var(--vg-accent); }
.asset-action--danger:hover { color: var(--vg-red); border-color: var(--vg-red); }

/* List layout */
.asset-grid--list { grid-template-columns: 1fr; gap: 6px; }
.asset-grid--list .asset-tile { flex-direction: row; align-items: center; }
.asset-grid--list .asset-thumb { width: 72px; height: 54px; aspect-ratio: auto; border-bottom: 0; border-right: 1px solid var(--theme-border); flex-shrink: 0; }
.asset-grid--list .asset-thumb > span { display: none; }
.asset-grid--list .asset-meta { flex: 1; padding: 8px 140px 8px 14px; }
.asset-grid--list .asset-select-mark { top: 50%; left: 22px; transform: translateY(-50%); }
.asset-grid--list .asset-tile-actions { top: 50%; transform: translateY(-50%); opacity: 1; }

/* Pagination */
.asset-pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 10px; border-top: 1px solid var(--theme-divider); flex-wrap: wrap; }
.asset-pagination__summary { font-size: 12px; color: var(--theme-text-muted); }
.asset-pagination__controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.asset-pagination__button { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 30px; padding: 0 6px; border: 1px solid var(--theme-border); border-radius: 6px; background: transparent; color: var(--theme-text-secondary); font-size: 12px; cursor: pointer; }
.asset-pagination__button:hover:not(:disabled) { border-color: var(--vg-accent); color: var(--vg-accent); }
.asset-pagination__button.active { background: var(--vg-accent); border-color: var(--vg-accent); color: var(--theme-on-accent); font-weight: 700; }
.asset-pagination__button:disabled { opacity: .35; cursor: not-allowed; }

/* Dialogs (shared shell) */
.asset-modal-backdrop { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 20px; background: var(--theme-overlay); }
.asset-modal, .asset-editor, .asset-folder-dialog, .asset-trash-dialog, .asset-audit-dialog, .asset-preview { position: relative; max-width: calc(100vw - 40px); max-height: 92vh; border: 1px solid var(--theme-border-control); border-radius: var(--vg-radius-lg); background: var(--theme-panel); color: var(--theme-text); box-shadow: var(--theme-shadow-dialog); }
.asset-modal h2, .asset-editor h2, .asset-folder-dialog h2, .asset-trash-dialog h2, .asset-audit-dialog h2 { font-size: 18px; font-weight: 800; }
.asset-modal p, .asset-editor-head p, .asset-folder-dialog p, .asset-trash-dialog header p, .asset-audit-dialog p { font-size: 12px; color: var(--theme-text-muted); }
.asset-modal-close { position: absolute; top: 12px; right: 12px; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--theme-text-muted); font-size: 20px; line-height: 1; cursor: pointer; }
.asset-modal-close:hover { background: var(--theme-panel-soft); color: var(--theme-text); }

/* QR dialog */
.asset-modal { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 380px; padding: 26px 24px 22px; text-align: center; }
.asset-modal > svg { color: var(--vg-accent); }
.asset-modal img { width: 220px; height: 220px; margin: 8px 0; padding: 10px; border-radius: var(--vg-radius); background: #fff; border: 1px solid var(--theme-border); }
.asset-modal code { max-width: 100%; padding: 6px 10px; border-radius: 6px; background: var(--theme-panel-soft); color: var(--theme-text-secondary); font-size: 11px; overflow-wrap: anywhere; }
.asset-modal small { color: var(--theme-text-muted); font-size: 11px; }

/* Preview */
.asset-preview { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 16px; }
.asset-preview img, .asset-preview video { max-width: min(1100px, 86vw); max-height: 76vh; border-radius: var(--vg-radius-sm); background: var(--theme-root); }
.asset-preview strong { font-size: 13px; color: var(--theme-text-secondary); }

/* Editor */
.asset-editor { display: flex; flex-direction: column; gap: 14px; width: min(560px, calc(100vw - 40px)); padding: 22px; overflow-y: auto; }
.asset-editor-head { display: flex; align-items: center; gap: 12px; min-width: 0; padding-right: 32px; }
.asset-editor-head > svg { width: 40px; height: 40px; padding: 10px; border-radius: 10px; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); flex-shrink: 0; }
.asset-editor-head > div { min-width: 0; }
.asset-editor-head p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-editor-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; padding: 3px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); }
.asset-editor-tabs button { height: 30px; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-secondary); font-size: 13px; cursor: pointer; }
.asset-editor-tabs button.active { background: var(--theme-panel); color: var(--vg-accent); font-weight: 600; box-shadow: 0 1px 2px color-mix(in srgb, var(--theme-root) 40%, transparent); }
.asset-editor-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-width: 0; }
.asset-editor-fields label { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-size: 13px; font-weight: 600; color: var(--theme-text); }
.asset-editor-fields small { grid-column: 1 / -1; font-size: 12px; color: var(--theme-text-muted); }
.asset-editor-fields input, .asset-folder-dialog input { width: 100%; height: 34px; padding: 0 10px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-input); color: var(--theme-text); font-size: 13px; outline: none; }
.asset-editor-fields input:focus, .asset-folder-dialog input:focus { border-color: var(--vg-accent); box-shadow: 0 0 0 3px var(--vg-accent-soft); }
.asset-editor-fields:has(.crop-stage) { grid-template-columns: 1fr; }
.crop-stage { position: relative; justify-self: center; width: fit-content; max-width: 100%; overflow: hidden; border-radius: 7px; background: var(--theme-root); cursor: crosshair; touch-action: none; }
.crop-stage img { display: block; width: auto; max-width: 100%; max-height: 52vh; user-select: none; pointer-events: none; }
.crop-selection { position: absolute; border: 2px solid var(--vg-accent); background: color-mix(in srgb, var(--vg-accent) 16%, transparent); box-shadow: 0 0 0 9999px rgba(0, 0, 0, .45); }
.crop-selection span { position: absolute; left: 6px; top: 6px; padding: 2px 6px; border-radius: 4px; background: var(--vg-accent); color: var(--theme-on-accent); font-size: 11px; white-space: nowrap; }
.crop-selection--watermark { border-color: var(--vg-amber); background: color-mix(in srgb, var(--vg-amber) 16%, transparent); }
.crop-selection--watermark span { background: var(--vg-amber); }
.crop-readout { justify-self: center; font-size: 12px; color: var(--theme-text-secondary); font-variant-numeric: tabular-nums; }
.asset-editor-footer { display: flex; align-items: center; gap: 10px; padding-top: 12px; border-top: 1px solid var(--theme-divider); }
.asset-editor-footer span { margin-right: auto; font-size: 12px; color: var(--theme-text-muted); }

/* Folder / rename dialog */
.asset-folder-dialog { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px 12px; width: min(460px, calc(100vw - 40px)); padding: 22px; }
.asset-rename-dialog { width: min(540px, calc(100vw - 40px)); }
.asset-folder-dialog__icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); }
.asset-folder-dialog > div:not(.asset-folder-dialog__icon), .asset-rename-dialog__heading { min-width: 0; padding-right: 28px; }
.asset-rename-dialog__heading p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-folder-dialog label { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
.asset-folder-dialog .asset-error { grid-column: 1 / -1; }
.asset-folder-dialog footer { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 10px; padding-top: 12px; border-top: 1px solid var(--theme-divider); }

/* Context menu */
.asset-context-menu { position: fixed; z-index: 2100; display: flex; flex-direction: column; min-width: 160px; padding: 5px; border: 1px solid var(--theme-border-control); border-radius: 9px; background: var(--theme-panel); box-shadow: var(--theme-shadow-float); }
.asset-context-menu button { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text); font-size: 12px; text-align: left; cursor: pointer; }
.asset-context-menu button:hover { background: var(--theme-panel-soft); color: var(--vg-accent); }
.asset-context-menu button.danger { color: var(--vg-red); }

/* Trash */
.asset-trash-dialog { display: flex; flex-direction: column; gap: 14px; width: min(720px, 94vw); padding: 22px; }
.asset-trash-dialog header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-right: 32px; }
.asset-trash-list { display: flex; flex-direction: column; gap: 6px; overflow: auto; }
.asset-trash-list article { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); }
.asset-trash-list article > svg { color: var(--theme-text-muted); flex-shrink: 0; }
.asset-trash-list article > div { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.asset-trash-list strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-trash-list small { font-size: 11px; color: var(--theme-text-muted); }
.asset-trash-list button { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border: 1px solid var(--theme-border-control); border-radius: 7px; background: var(--theme-control); color: var(--theme-text); font-size: 12px; cursor: pointer; }
.asset-trash-list button:hover { border-color: var(--vg-accent); color: var(--vg-accent); }
.asset-trash-list button.danger { color: var(--vg-red); border-color: color-mix(in srgb, var(--vg-red) 45%, transparent); background: transparent; }
.asset-trash-dialog footer { display: flex; justify-content: flex-end; padding-top: 12px; border-top: 1px solid var(--theme-divider); }

/* Audit */
.asset-audit-dialog { display: flex; flex-direction: column; align-items: center; gap: 10px; width: min(440px, 94vw); padding: 28px 24px 22px; text-align: center; }
.asset-audit-dialog > svg { color: var(--vg-accent); }

/* Undo toast */
.asset-undo { position: fixed; z-index: 1100; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 16px; border: 1px solid var(--theme-border-control); border-radius: var(--vg-radius); background: var(--theme-panel); color: var(--theme-text); font-size: 13px; box-shadow: var(--theme-shadow-float); }
.asset-undo button { display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--vg-accent); font-size: 12px; font-weight: 600; cursor: pointer; }
.asset-undo button:hover { background: var(--theme-panel-soft); }
.asset-undo button:last-child { color: var(--theme-text-muted); }

@media (max-width: 800px) {
  .asset-library-hero__copy > p, .asset-library-stats { padding-left: 0; }
  .asset-library-actions { margin-left: 0; }
  .asset-editor-fields { grid-template-columns: 1fr; }
}
</style>
