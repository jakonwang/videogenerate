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
  <div class="asset-library-page" @dragenter.prevent="onDragOver($event, currentFolderId)" @dragover="onDragOver($event, currentFolderId)" @dragleave="onLibraryDragLeave" @drop="onDrop($event, currentFolderId)">
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
.asset-library-page{height:100%;overflow:auto;padding:28px 32px;color:var(--theme-text,#edf2f5)}.asset-library-header{display:flex;align-items:center;justify-content:space-between;gap:20px}.asset-library-header h1{margin:0;font-size:24px;font-weight:700}.asset-library-header p{margin:7px 0 0;color:var(--theme-text-secondary,#8c9ba5);font-size:13px}.asset-library-actions{display:flex;gap:9px}.asset-btn,.asset-icon-btn,.asset-filter button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:0 13px;border:1px solid var(--theme-border,rgba(255,255,255,.12));border-radius:6px;background:var(--theme-control,#151e24);color:var(--theme-text,#edf2f5);font:600 13px inherit;cursor:pointer}.asset-btn--primary{background:var(--theme-accent,#23aa91);border-color:var(--theme-accent,#23aa91);color:#071c19}.asset-library-stats{display:flex;gap:24px;margin:28px 0 18px;color:var(--theme-text-secondary,#a7b3ba);font-size:13px}.asset-library-stats span{display:flex;align-items:center;gap:8px}.asset-library-toolbar{display:flex;align-items:center;gap:12px;margin-bottom:18px}.asset-search{display:flex;align-items:center;gap:9px;max-width:380px;min-width:220px;flex:1;padding:0 12px;border:1px solid var(--theme-border,rgba(255,255,255,.12));border-radius:6px;background:var(--theme-control,#11191f)}.asset-search input{width:100%;height:38px;border:0;outline:0;background:transparent;color:inherit;font-size:13px}.asset-filter{display:flex;gap:4px;padding:3px;border:1px solid var(--theme-border,rgba(255,255,255,.12));border-radius:7px}.asset-filter button{min-height:30px;padding:0 11px;border:0;background:transparent;color:var(--theme-text-secondary,#a7b3ba)}.asset-filter button.active{background:var(--theme-control-selected,rgba(36,170,145,.18));color:var(--theme-text,#edf2f5)}.asset-icon-btn{width:38px;padding:0}.asset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}.asset-tile{position:relative;overflow:hidden;border:1px solid var(--theme-border,rgba(255,255,255,.1));border-radius:7px;background:var(--theme-surface,#11191f)}.asset-thumb{position:relative;display:flex;width:100%;aspect-ratio:4/3;align-items:center;justify-content:center;border:0;background:var(--theme-control,#0b1115);color:var(--theme-accent,#23aa91);cursor:pointer}.asset-thumb img{width:100%;height:100%;object-fit:cover}.asset-thumb span{position:absolute;right:8px;bottom:8px;padding:4px 7px;border-radius:4px;background:#071116d9;color:white;font-size:11px}.asset-meta{display:grid;gap:5px;padding:11px 40px 11px 12px}.asset-meta strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.asset-meta small{color:var(--theme-text-secondary,#94a2ab);font-size:11px}.asset-delete,.asset-modal-close{position:absolute;top:8px;right:8px;display:grid;width:30px;height:30px;place-items:center;border:0;border-radius:5px;background:#071116a8;color:white;cursor:pointer}.asset-empty{display:grid;min-height:260px;place-content:center;justify-items:center;gap:10px;color:var(--theme-text-secondary,#94a2ab);font-size:13px}.asset-empty strong{color:var(--theme-text,#edf2f5);font-size:15px}.asset-error{color:#e47777}.asset-modal-backdrop{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;padding:20px;background:#0009}.asset-modal,.asset-preview{position:relative;display:grid;justify-items:center;gap:12px;width:min(420px,100%);padding:28px;border:1px solid var(--theme-border,rgba(255,255,255,.15));border-radius:9px;background:var(--theme-surface,#151e24);text-align:center}.asset-modal h2{margin:0;font-size:18px}.asset-modal p{margin:0;color:var(--theme-text-secondary,#9caab2);font-size:13px}.asset-modal img{width:240px;height:240px;border-radius:6px;background:white}.asset-modal code{max-width:100%;overflow-wrap:anywhere;color:var(--theme-text-secondary,#9caab2);font-size:11px}.asset-modal small{color:#d4a34a}.asset-preview{width:min(900px,96vw);max-height:90vh}.asset-preview img,.asset-preview video{max-width:100%;max-height:75vh;object-fit:contain}.asset-modal-close{top:9px;right:9px;font-size:22px}@media(max-width:650px){.asset-library-page{padding:20px 14px}.asset-library-header{align-items:flex-start;flex-direction:column}.asset-library-actions{width:100%}.asset-library-actions button{flex:1}.asset-library-stats{gap:12px;flex-wrap:wrap}.asset-library-toolbar{flex-wrap:wrap}.asset-search{max-width:none;flex-basis:100%}}
 .asset-meta{padding-right:72px}.asset-tile--image .asset-meta{padding-right:108px}.asset-tile-actions{position:absolute;top:8px;right:8px;display:flex;gap:5px}.asset-action,.asset-modal-close{display:grid;width:30px;height:30px;place-items:center;border:0;border-radius:5px;background:#071116a8;color:white;cursor:pointer}.asset-action--danger{color:#ffaaa0}.asset-editor{position:relative;display:grid;justify-items:stretch;gap:14px;width:min(520px,96vw);padding:26px;border:1px solid var(--theme-border,rgba(255,255,255,.15));border-radius:9px;background:var(--theme-surface,#151e24);text-align:left}.asset-editor-head{display:flex;align-items:center;gap:10px;color:var(--theme-accent,#23aa91)}.asset-editor-head h2{margin:0;color:var(--theme-text,#edf2f5);font-size:18px}.asset-editor-head p{margin:3px 0 0;color:var(--theme-text-secondary,#9caab2);font-size:12px}.asset-editor-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.asset-editor-tabs button{min-height:34px;border:1px solid var(--theme-border,rgba(255,255,255,.12));border-radius:5px;background:transparent;color:var(--theme-text-secondary,#a7b3ba);cursor:pointer}.asset-editor-tabs button.active{border-color:var(--theme-accent,#23aa91);background:var(--theme-control-selected,rgba(35,170,145,.18));color:var(--theme-text,#edf2f5)}.asset-editor-fields{display:grid;gap:11px}.asset-editor-fields label{display:grid;gap:5px;color:var(--theme-text-secondary,#a7b3ba);font-size:12px}.asset-editor-fields input{width:100%;height:36px;padding:0 9px;border:1px solid var(--theme-border,rgba(255,255,255,.12));border-radius:5px;background:var(--theme-control,#0d151a);color:var(--theme-text,#edf2f5)}.asset-editor-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}.asset-editor-fields small{color:#d4a34a;font-size:11px}.asset-editor-footer{display:flex;align-items:center;gap:8px;padding-top:5px;border-top:1px solid var(--theme-border,rgba(255,255,255,.1));font-size:11px;color:var(--theme-text-secondary,#94a2ab)}.asset-editor-footer span{margin-right:auto}.asset-editor-footer .asset-btn{min-height:34px}.crop-stage{position:relative;display:grid;place-items:center;overflow:hidden;max-height:340px;border:1px solid var(--theme-border,rgba(255,255,255,.12));border-radius:7px;background:#081014;touch-action:none;user-select:none;cursor:crosshair}.crop-stage img{display:block;width:100%;max-height:340px;object-fit:contain;pointer-events:none}.crop-selection{position:absolute;border:2px solid var(--theme-accent,#23aa91);background:color-mix(in srgb,var(--theme-accent,#23aa91) 16%,transparent);box-shadow:0 0 0 9999px rgba(0,0,0,.45);pointer-events:none}.crop-selection span{position:absolute;left:7px;top:5px;color:#fff;font-size:10px;text-shadow:0 1px 2px #000;white-space:nowrap}.crop-readout{color:var(--theme-accent,#23aa91);font-size:12px;font-weight:700}@media(max-width:650px){.asset-editor{padding:20px}.asset-editor-footer{flex-wrap:wrap}.asset-editor-footer span{flex-basis:100%}}
/* Keep the crop canvas aligned to the rendered image instead of the editor width. */
.crop-stage{justify-self:center;width:fit-content;max-width:100%;border-radius:7px!important;}
.crop-stage img{width:auto;max-width:100%;border-radius:0!important;clip-path:none!important;}
.asset-editor{box-sizing:border-box;width:min(520px,calc(100vw - 40px));max-width:100%}.asset-editor-head{min-width:0;padding-right:28px}.asset-editor-head>div{min-width:0}.asset-editor-head p{overflow:hidden;max-width:100%;text-overflow:ellipsis;white-space:nowrap}.asset-editor-tabs{min-width:0;grid-template-columns:repeat(3,minmax(0,1fr))}.asset-editor-tabs button,.asset-editor-fields,.asset-editor-fields label{min-width:0}.asset-editor-fields input{box-sizing:border-box;min-width:0}.asset-editor-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.asset-editor-footer{min-width:0}.asset-editor-footer span{min-width:0}.asset-editor-footer .asset-btn{flex:0 0 auto}
/* Content area follows the dense dark workspace layout used by the desktop shell. */
.asset-library-page{padding:0 0 28px;max-width:none}
.asset-library-hero{position:relative;display:flex;align-items:center;min-height:182px;margin:-1px 0 18px;padding:26px 34px;overflow:hidden;border:1px solid rgba(58,91,107,.38);border-radius:22px;background:radial-gradient(ellipse at 72% 20%,rgba(19,129,117,.2),transparent 44%),linear-gradient(105deg,#102a31 0%,#0d1824 46%,#07131b 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
.asset-library-hero:after{content:"";position:absolute;right:-8%;bottom:-65%;width:68%;height:190%;border:1px solid rgba(30,202,178,.22);border-radius:50%;transform:rotate(-22deg);pointer-events:none}
.asset-library-hero__copy{position:relative;z-index:2;min-width:420px}.asset-library-hero__title{display:flex;align-items:center;gap:15px;color:#4cebd1}.asset-library-hero__title h1{margin:0;color:#f4f8fc;font-size:28px;font-weight:750}.asset-library-hero p{margin:8px 0 16px;color:#aebdc9;font-size:14px}.asset-library-hero .asset-library-stats{margin:0;display:inline-flex;gap:25px;padding:11px 20px;border:1px solid rgba(105,155,170,.2);border-radius:22px;background:rgba(23,38,50,.75);color:#eef5f8}.asset-library-hero .asset-library-stats span{gap:7px}.asset-library-hero__art{position:absolute;right:29%;top:16px;width:230px;height:150px;transform:rotate(-8deg);opacity:.9}.asset-art-card{position:absolute;width:135px;height:92px;border:2px solid #38dcc7;border-radius:16px;background:linear-gradient(140deg,rgba(102,193,189,.36),rgba(19,48,57,.72));box-shadow:0 10px 30px rgba(25,205,181,.15)}.asset-art-card--back{left:18px;top:26px;transform:rotate(-19deg)}.asset-art-card--middle{left:54px;top:14px;transform:rotate(-7deg)}.asset-art-card--front{left:94px;top:43px;display:grid;place-items:center;color:#9dffe9;transform:rotate(17deg);background:linear-gradient(145deg,rgba(127,225,211,.6),rgba(36,92,96,.64))}.asset-library-hero__art svg{filter:drop-shadow(0 0 6px rgba(77,255,211,.65))}.asset-library-actions{position:relative;z-index:2;margin-left:auto;align-self:flex-start;padding-top:22px}.asset-btn{border-radius:24px!important;min-height:42px!important;padding:0 19px!important}.asset-btn--quiet{border-color:rgba(28,201,176,.52)!important;background:rgba(11,31,38,.68)!important}.asset-btn--primary{background:linear-gradient(100deg,#55e8dd,#1dd47a)!important;border-color:transparent!important;color:#06231f!important;box-shadow:0 6px 18px rgba(30,211,149,.2)}.asset-library-toolbar{margin:0 0 18px;padding:0 34px;gap:14px}.asset-search{max-width:none;height:47px;min-width:280px;border-radius:25px;background:rgba(13,19,30,.72);border-color:rgba(42,211,193,.45)}.asset-search input{height:45px}.asset-filter{margin-left:auto;padding:4px;border-radius:24px;background:rgba(23,29,42,.9);border-color:transparent}.asset-filter button{min-height:37px;padding:0 18px;border-radius:20px!important}.asset-filter button.active{background:linear-gradient(100deg,#4ce7db,#51edac);color:#06231f}.asset-icon-btn{width:58px;height:47px;border-radius:24px!important}.asset-view-toggle{display:flex;padding:4px;border-radius:24px;background:rgba(23,29,42,.9);margin-left:auto}.asset-view-toggle button{display:grid;place-items:center;width:42px;height:37px;border:0;border-radius:20px;background:transparent;color:#9daab8;cursor:pointer}.asset-view-toggle button.active{background:rgba(17,197,168,.2);color:#53ecd0}.asset-grid{padding:0 34px;grid-template-columns:repeat(6,minmax(0,1fr));gap:16px}.asset-tile{border-color:rgba(61,104,115,.46);border-radius:15px;background:linear-gradient(180deg,rgba(17,37,42,.95),rgba(14,30,36,.95));box-shadow:0 8px 20px rgba(0,0,0,.12)}.asset-thumb{aspect-ratio:1.32;background:#17242a}.asset-thumb img{object-fit:cover}.asset-thumb span{right:10px;bottom:10px;border:1px solid rgba(78,226,198,.45);border-radius:6px;background:rgba(8,40,43,.9);color:#d1fff4}.asset-meta{gap:6px;padding:11px 72px 13px 12px}.asset-tile--image .asset-meta{padding-right:108px}.asset-meta strong{font-size:13px;color:#edf5f4}.asset-meta small{font-size:11px;line-height:1.35;color:#8ea6ad}.asset-tile-actions{top:9px;right:9px}.asset-action{width:31px;height:31px;border-radius:9px;background:rgba(10,17,27,.9);border:1px solid rgba(255,255,255,.1)}.asset-grid--list{grid-template-columns:1fr}.asset-grid--list .asset-tile{display:flex;align-items:center}.asset-grid--list .asset-thumb{width:150px;flex:0 0 150px}.asset-grid--list .asset-meta{flex:1}.asset-grid--list .asset-tile-actions{position:static;margin-right:12px}
.asset-pagination{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:22px 34px 0;padding:16px 0 2px;border-top:1px solid rgba(61,104,115,.34)}.asset-pagination__summary{color:#8ea6ad;font-size:12px}.asset-pagination__controls{display:flex;align-items:center;gap:7px}.asset-pagination__button{display:grid;min-width:36px;height:36px;padding:0 9px;place-items:center;border:1px solid rgba(61,104,115,.5);border-radius:10px;background:rgba(14,30,36,.86);color:#aebdc9;font:600 12px inherit;cursor:pointer}.asset-pagination__button:hover:not(:disabled){border-color:rgba(76,235,209,.65);color:#d1fff4}.asset-pagination__button.active{border-color:transparent;background:linear-gradient(100deg,#4ce7db,#51edac);color:#06231f}.asset-pagination__button:disabled{opacity:.35;cursor:not-allowed}
@media(max-width:1200px){.asset-library-hero__art{right:22%}.asset-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:800px){.asset-library-hero{padding:24px;align-items:flex-start}.asset-library-hero__copy{min-width:0}.asset-library-hero__art{display:none}.asset-library-actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:0}.asset-library-toolbar{padding:0;flex-wrap:wrap}.asset-search{flex-basis:100%}.asset-filter{margin-left:0}.asset-view-toggle{margin-left:auto}.asset-grid{padding:0;grid-template-columns:repeat(2,minmax(0,1fr))}.asset-pagination{margin:20px 0 0;align-items:flex-start;flex-direction:column}.asset-pagination__controls{flex-wrap:wrap}}
.asset-folder-toolbar{display:flex;align-items:center;gap:12px;margin:0 34px 8px}.asset-breadcrumbs{display:flex;min-width:0;align-items:center;gap:5px;flex:1;color:#8299a2}.asset-breadcrumbs button,.asset-new-folder{display:inline-flex;align-items:center;gap:7px;min-height:32px;padding:0 9px;border:0;border-radius:8px;background:transparent;color:#b7c8cd;font:600 12px inherit;cursor:pointer}.asset-breadcrumbs button:hover{background:rgba(54,213,190,.1);color:#62ead3}.asset-new-folder{flex:0 0 auto;padding:0 13px;border:1px solid rgba(54,213,190,.3);color:#62ead3;background:rgba(13,35,40,.38)}.asset-library-toolbar--compact{margin-bottom:8px}.asset-drop-zone{display:flex;align-items:center;justify-content:center;gap:9px;min-height:34px;margin:0 34px 10px;border:1px dashed rgba(84,151,157,.45);border-radius:10px;background:rgba(13,35,40,.42);color:#8ea6ad;font-size:12px;transition:.16s ease}.asset-drop-zone.active{border-color:#4cebd1;background:rgba(37,187,164,.14);color:#cafff5}.asset-folder-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:13px;margin:0 34px 14px}.asset-folder{position:relative;display:flex;align-items:center;min-width:0;min-height:62px;border:1px solid rgba(61,104,115,.5);border-radius:13px;background:linear-gradient(145deg,rgba(19,43,49,.96),rgba(12,27,34,.96));transition:.16s ease}.asset-folder:hover,.asset-folder.active{border-color:#3edbc4;background:rgba(26,83,78,.78);transform:translateY(-1px)}.asset-folder__open{display:flex;align-items:center;gap:10px;min-width:0;flex:1;height:60px;padding:0 58px 0 15px;border:0;background:transparent;color:#57e3cc;cursor:pointer}.asset-folder__open span{overflow:hidden;color:#e9f3f2;font-size:13px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.asset-folder__actions{position:absolute;right:7px;display:flex;gap:3px}.asset-folder__actions button{display:grid;width:25px;height:25px;padding:0;place-items:center;border:0;border-radius:6px;background:transparent;color:#8299a2;cursor:pointer}.asset-folder__actions button:hover{background:rgba(255,255,255,.08);color:#eef7f5}.asset-folder-dialog{position:relative;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:15px;width:min(430px,100%);padding:25px;border:1px solid rgba(86,145,153,.4);border-radius:16px;background:linear-gradient(145deg,#17262d,#101a21);box-shadow:0 24px 70px rgba(0,0,0,.45)}.asset-folder-dialog__icon{display:grid;width:46px;height:46px;place-items:center;border-radius:13px;background:rgba(76,235,209,.12);color:#4cebd1}.asset-folder-dialog h2{margin:0;color:#eff8f7;font-size:18px}.asset-folder-dialog p{margin:5px 0 0;color:#8ea6ad;font-size:12px}.asset-folder-dialog label{display:grid;grid-column:1/-1;gap:7px;color:#b7c8cd;font-size:12px}.asset-folder-dialog input{height:42px;padding:0 12px;border:1px solid rgba(76,235,209,.35);border-radius:9px;outline:0;background:#0b151b;color:#eff8f7;font:500 13px inherit}.asset-folder-dialog input:focus{border-color:#4cebd1;box-shadow:0 0 0 3px rgba(76,235,209,.1)}.asset-folder-dialog .asset-error{grid-column:1/-1;margin:0}.asset-folder-dialog footer{display:flex;grid-column:1/-1;justify-content:flex-end;gap:8px;margin-top:3px}.asset-tile[draggable=true]{cursor:grab}.asset-tile[draggable=true]:active{cursor:grabbing}@media(max-width:1200px){.asset-folder-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:800px){.asset-folder-toolbar,.asset-drop-zone,.asset-folder-grid{margin-left:0;margin-right:0}.asset-folder-toolbar{align-items:flex-start;flex-wrap:wrap}.asset-breadcrumbs{flex-basis:100%;flex-wrap:wrap}.asset-folder-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.asset-rename-dialog{box-sizing:border-box;grid-template-columns:auto minmax(0,1fr);width:min(540px,calc(100vw - 40px));max-width:100%}.asset-rename-dialog__heading{min-width:0;padding-right:28px}.asset-rename-dialog__heading p{overflow:hidden;max-width:100%;text-overflow:ellipsis;white-space:nowrap}.asset-rename-dialog label,.asset-rename-dialog input{box-sizing:border-box;min-width:0;width:100%}.asset-rename-dialog footer{min-width:0;flex-wrap:wrap}
.asset-moving-status{position:fixed;z-index:1100;right:26px;bottom:26px;display:flex;align-items:center;gap:9px;padding:12px 16px;border:1px solid rgba(76,235,209,.35);border-radius:11px;background:#10252a;color:#cafff5;font-size:12px;box-shadow:0 14px 40px rgba(0,0,0,.35)}.asset-moving-status svg{animation:asset-spin .8s linear infinite}@keyframes asset-spin{to{transform:rotate(360deg)}}
.asset-nav-buttons{display:flex;gap:3px}.asset-nav-buttons button{display:grid;width:30px;height:30px;padding:0;place-items:center;border:1px solid rgba(61,104,115,.45);border-radius:7px;background:#101b22;color:#a8bbc0;cursor:pointer}.asset-nav-buttons button:disabled{opacity:.3;cursor:not-allowed}.asset-sort{height:38px;padding:0 27px 0 10px;border:1px solid rgba(61,104,115,.5);border-radius:9px;background:#111d25;color:#b9c9cd;font:600 12px inherit;outline:0}.asset-selection-bar{position:sticky;z-index:20;top:0;display:flex;align-items:center;gap:10px;margin:0 34px 10px;padding:8px 10px;border:1px solid rgba(76,235,209,.32);border-radius:10px;background:rgba(16,43,47,.96);color:#cafff5;font-size:12px;box-shadow:0 8px 22px rgba(0,0,0,.18)}.asset-selection-bar span{color:#8ea6ad}.asset-selection-bar button{display:inline-flex;align-items:center;gap:5px;min-height:28px;padding:0 9px;border:0;border-radius:7px;background:rgba(255,255,255,.07);color:#c5d5d8;font:600 11px inherit;cursor:pointer}.asset-selection-bar button:first-of-type{margin-left:auto}.asset-selection-bar button.danger,.asset-context-menu button.danger{color:#ff9898}.asset-select-mark{position:absolute;z-index:4;top:10px;left:10px;display:grid;width:25px;height:25px;padding:0;place-items:center;border:1px solid rgba(255,255,255,.25);border-radius:7px;background:rgba(8,16,24,.75);color:transparent;opacity:.58;cursor:pointer;transition:.14s}.asset-tile:hover .asset-select-mark,.asset-tile.selected .asset-select-mark{opacity:1}.asset-tile.selected{border-color:#4cebd1;box-shadow:0 0 0 2px rgba(76,235,209,.18),0 8px 20px rgba(0,0,0,.12)}.asset-tile.selected .asset-select-mark{background:#28cdb2;color:#06231f}.asset-tile.cut{opacity:.52}.asset-grid--compact{grid-template-columns:repeat(8,minmax(0,1fr));gap:10px}.asset-grid--compact .asset-meta{padding:8px 9px 9px}.asset-grid--compact .asset-meta small{display:none}.asset-grid--compact .asset-tile-actions{display:none}.asset-context-menu{position:fixed;z-index:1300;display:grid;min-width:150px;padding:5px;border:1px solid rgba(85,130,139,.5);border-radius:10px;background:#111d25;box-shadow:0 16px 45px rgba(0,0,0,.45)}.asset-context-menu button{min-height:33px;padding:0 11px;border:0;border-radius:6px;background:transparent;color:#d4e0e2;text-align:left;font:500 12px inherit;cursor:pointer}.asset-context-menu button:hover{background:rgba(76,235,209,.1);color:#bafff2}@media(max-width:1200px){.asset-grid--compact{grid-template-columns:repeat(6,minmax(0,1fr))}}@media(max-width:800px){.asset-selection-bar{margin-left:0;margin-right:0;flex-wrap:wrap}.asset-selection-bar button:first-of-type{margin-left:0}.asset-grid--compact{grid-template-columns:repeat(3,minmax(0,1fr))}}
.asset-grid{position:relative;user-select:none}.asset-marquee{position:absolute;z-index:15;border:1px solid #4cebd1;background:rgba(76,235,209,.13);pointer-events:none}
/* Compact library chrome keeps the media workspace above the fold. */
.asset-library-hero{min-height:96px;margin-bottom:8px;padding:14px 24px;border-radius:15px}.asset-library-hero__copy{display:flex;min-width:0;align-items:center;gap:20px}.asset-library-hero__title{gap:10px;white-space:nowrap}.asset-library-hero__title h1{font-size:22px}.asset-library-hero__title svg{width:27px;height:27px}.asset-library-hero__copy>p,.asset-library-hero__art{display:none}.asset-library-hero .asset-library-stats{gap:16px;padding:7px 13px;border-radius:10px;font-size:12px}.asset-library-actions{align-self:center;padding-top:0}.asset-btn{min-height:36px!important;padding:0 14px!important}.asset-folder-toolbar{margin-bottom:5px}.asset-library-toolbar--compact{margin-bottom:6px}.asset-drop-zone{position:fixed;z-index:1200;inset:86px 24px 24px 236px;min-height:0;margin:0;border:2px dashed #4cebd1;border-radius:18px;background:rgba(7,25,30,.88);color:#cafff5;font-size:15px;pointer-events:none;backdrop-filter:blur(3px)}.asset-folder-grid{margin-bottom:10px}.asset-selection-bar{margin-bottom:6px}@media(max-width:800px){.asset-library-hero{min-height:82px;padding:12px 14px}.asset-library-hero__copy{align-items:flex-start;flex-direction:column;gap:8px}.asset-library-hero .asset-library-stats{gap:9px;flex-wrap:wrap}.asset-library-actions{display:none}.asset-drop-zone{inset:80px 10px 10px}.asset-folder-toolbar{margin-bottom:5px}}
.asset-trash-dialog{position:relative;display:flex;width:min(720px,94vw);max-height:82vh;flex-direction:column;padding:24px;border:1px solid rgba(85,130,139,.5);border-radius:16px;background:#111d25;box-shadow:0 24px 70px rgba(0,0,0,.48)}.asset-trash-dialog header{display:flex;align-items:flex-start;justify-content:space-between}.asset-trash-dialog h2,.asset-audit-dialog h2{margin:0;color:#edf7f5;font-size:20px}.asset-trash-dialog header p,.asset-audit-dialog p{margin:6px 0 0;color:#8ea6ad;font-size:12px}.asset-trash-list{display:grid;gap:7px;margin-top:18px;overflow:auto}.asset-trash-list article{display:flex;align-items:center;gap:11px;padding:10px;border:1px solid rgba(61,104,115,.38);border-radius:10px;background:rgba(7,20,26,.55);color:#58e1cb}.asset-trash-list article>div{display:grid;min-width:0;flex:1;gap:3px}.asset-trash-list strong{overflow:hidden;color:#dce9e8;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.asset-trash-list small{color:#80969d;font-size:10px}.asset-trash-list button{display:inline-flex;align-items:center;gap:5px;min-height:29px;padding:0 9px;border:0;border-radius:7px;background:rgba(76,235,209,.09);color:#9cebdc;font:600 11px inherit;cursor:pointer}.asset-trash-list button.danger{color:#ff9898}.asset-trash-dialog footer{display:flex;justify-content:flex-end;margin-top:16px}.asset-audit-dialog{position:relative;display:grid;justify-items:center;gap:12px;width:min(430px,94vw);padding:28px;border:1px solid rgba(85,130,139,.5);border-radius:16px;background:#111d25;text-align:center}.asset-audit-dialog>svg{color:#4cebd1}.asset-undo{position:fixed;z-index:1400;right:24px;bottom:24px;display:flex;align-items:center;gap:12px;max-width:520px;padding:11px 12px 11px 16px;border:1px solid rgba(76,235,209,.35);border-radius:11px;background:#10252a;color:#d9efeb;font-size:12px;box-shadow:0 16px 45px rgba(0,0,0,.4)}.asset-undo button{min-height:27px;padding:0 8px;border:0;border-radius:6px;background:rgba(76,235,209,.12);color:#69ead4;font:700 11px inherit;cursor:pointer}.asset-undo button:last-child{display:grid;width:27px;padding:0;place-items:center;background:transparent}
</style>
