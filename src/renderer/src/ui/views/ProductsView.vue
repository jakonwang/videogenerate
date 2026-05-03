<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import UiCard from '../components/UiCard.vue'
import UiButton from '../components/UiButton.vue'
import UiChip from '../components/UiChip.vue'
import VideoPreviewModal from '../components/VideoPreviewModal.vue'
import PaginationBar from '../components/PaginationBar.vue'
import UiWorkspaceSidebar from '../components/UiWorkspaceSidebar.vue'
import ProductionTabs from '../components/ProductionTabs.vue'
import { ChevronRight, FolderOpen, Plus, Trash2, Video, FileVideo, X, Grid3X3, Scissors } from 'lucide-vue-next'

const { t } = useI18n()
const route = useRoute()

type ProductType = 'phone_case' | 'earring'
type SegmentKey = string
type ProductsWorkspace = 'media_library' | 'ai_tools' | 'timeline' | 'cloud' | 'assets'
const PRODUCTS_WORKSPACES: ProductsWorkspace[] = ['media_library', 'ai_tools', 'timeline', 'cloud', 'assets']

type MediaAsset = {
  id: string
  filePath: string
  fileName: string
  fileSize: number
  durationSec: number
  width?: number
  height?: number
  fps?: number
  bitRate?: number
  qualityScore?: number
  qualityIssues?: string[]
  thumbnailPath?: string | null
  thumbnailDataUrl?: string | null
  createdAt: number
}
type DisplayAsset = MediaAsset & { __segmentKey?: string }
type Product = {
  id: string
  name: string
  type: ProductType
  assets: Record<SegmentKey, MediaAsset[]>
  createdAt: number
  updatedAt: number
}

const list = ref<Product[]>([])
const form = reactive<{ name: string; type: ProductType }>({ name: '', type: 'phone_case' })
const selectedId = ref<string | null>(null)
const adding = ref<Record<string, boolean>>({})
const activeSeg = ref<SegmentKey>('hook')
const segAddingMode = ref(false)
const newSegName = ref('')
const pendingDeleteSeg = ref<SegmentKey | null>(null)
const previewOpen = ref(false)
const previewSrc = ref<string | null>(null)
const previewTitle = ref<string>('')
const multiMode = ref(false)
const selectedAssetIds = ref<Set<string>>(new Set())
const currentPage = ref(1)
const pageSize = ref(24)
const gridWrap = ref<HTMLDivElement | null>(null)
const backfillBusy = ref<Record<string, boolean>>({})
const advancedOpen = ref(false)
/** 闀胯棰戝垏鐗囧鍏?*/
const splitModalOpen = ref(false)
const splitPendingPath = ref('')
const splitSec = ref(3)
const splitImportBusy = ref(false)
const splitPhase = ref<'idle' | 'ffmpeg' | 'collect' | 'done' | 'enrich'>('idle')
const splitEnrichCurrent = ref(0)
const splitEnrichTotal = ref(0)

const splitPendingBasename = computed(() => {
  const p = splitPendingPath.value
  if (!p) return ''
  return p.split(/[/\\]/).pop() ?? p
})

/** 绱犳潗鍖烘嫋鏀撅細钃濊壊钂欏眰 */
const assetDropOverlay = ref(false)
const assetDropZoneRef = ref<HTMLElement | null>(null)
const workspace = ref<ProductsWorkspace>('media_library')

const workspaceItems = computed(() => [
  { key: 'media_library', label: t('products.navMediaLibrary') },
  { key: 'ai_tools', label: t('products.navAiTools') },
  { key: 'timeline', label: t('products.navTimeline') },
  { key: 'cloud', label: t('products.navCloud') },
  { key: 'assets', label: t('products.navAssets') },
])

const selected = computed(() => list.value.find((p) => p.id === selectedId.value) ?? null)

function cleanSegKey(s: string) {
  return (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-]/g, '')
}

const segments = computed(() => {
  const p = selected.value
  if (!p) return [] as SegmentKey[]
  const keys = Object.keys(p.assets ?? {})
  // 纭繚榛樿娈垫帓鍦ㄥ墠闈紙濡傛灉瀛樺湪锛?
  const order = ['hook', 'show', 'detail']
  const rest = keys.filter((k) => !order.includes(k)).sort()
  const base = order.filter((k) => keys.includes(k))
  const out = [...base, ...rest]
  return out.length ? out : ['hook']
})

const segmentAssets = computed<DisplayAsset[]>(() => selected.value?.assets?.[activeSeg.value] ?? [])

function assetNeedsAiFix(a: MediaAsset) {
  const scoreBad = typeof a.qualityScore !== 'number' || a.qualityScore < 70
  const metaMissing = !a.thumbnailDataUrl || !a.durationSec || !a.fileSize
  const issueMarked = Array.isArray(a.qualityIssues) && a.qualityIssues.length > 0
  return scoreBad || metaMissing || issueMarked
}

function isCloudAssetPath(filePath: string) {
  const raw = String(filePath ?? '')
  return raw.startsWith('\\\\') || /^(smb|nfs):/i.test(raw)
}

const aiIssueCount = computed(() => segmentAssets.value.filter(assetNeedsAiFix).length)
const cloudAssets = computed(() => segmentAssets.value.filter((a) => isCloudAssetPath(a.filePath)))
const productAllAssets = computed<DisplayAsset[]>(() => {
  const p = selected.value
  if (!p) return []
  const out: DisplayAsset[] = []
  for (const [seg, arr] of Object.entries(p.assets ?? {})) {
    for (const a of arr ?? []) out.push({ ...(a as DisplayAsset), __segmentKey: seg })
  }
  return out
})
const allAssets = computed(() => {
  if (workspace.value === 'ai_tools') return segmentAssets.value.filter(assetNeedsAiFix)
  if (workspace.value === 'cloud') return cloudAssets.value
  if (workspace.value === 'assets') return productAllAssets.value
  return segmentAssets.value
})
const totalPages = computed(() => Math.max(1, Math.ceil(allAssets.value.length / pageSize.value)))
const pagedAssets = computed(() => {
  const p = Math.min(Math.max(1, currentPage.value), totalPages.value)
  const start = (p - 1) * pageSize.value
  return allAssets.value.slice(start, start + pageSize.value)
})

const selectedCount = computed(() => selectedAssetIds.value.size)
const totalAssetsForSelected = computed(() =>
  Object.values(selected.value?.assets ?? {}).reduce((acc, arr) => acc + (arr?.length ?? 0), 0),
)
const cloudPathCount = computed(() => cloudAssets.value.length)
const workspaceHint = computed(() => {
  if (workspace.value === 'ai_tools') return t('products.wsHintAiTools')
  if (workspace.value === 'timeline') return t('products.wsHintTimeline')
  if (workspace.value === 'cloud') return t('products.wsHintCloud')
  if (workspace.value === 'assets') return t('products.wsHintAssets')
  return t('products.wsHintMedia')
})
const pageAllSelected = computed(() => {
  const page = pagedAssets.value
  if (!page.length) return false
  for (const a of page) if (!selectedAssetIds.value.has(a.id)) return false
  return true
})

function scrollGridTop() {
  try {
    gridWrap.value?.scrollTo({ top: 0, behavior: 'smooth' })
  } catch {
    // ignore
  }
}

watch([activeSeg, pageSize], () => {
  currentPage.value = 1
  scrollGridTop()
  selectedAssetIds.value = new Set()
})
watch(
  () => allAssets.value.length,
  () => {
    if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
  },
)
watch(selectedId, () => {
  selectedAssetIds.value = new Set()
  multiMode.value = false
})
watch(workspace, () => {
  currentPage.value = 1
  selectedAssetIds.value = new Set()
})
watch(
  () => route.query.ws,
  () => {
    applyWorkspaceFromRoute()
  },
)

function nextSceneName() {
  const used = new Set(segments.value)
  for (let i = 1; i <= 99; i++) {
    const n = `scene${i}`
    if (!used.has(n)) return n
  }
  return `scene_${Date.now()}`
}

function cloneProduct(p: Product): Product {
  // Vue 鐨勫搷搴斿紡瀵硅薄鏄?Proxy锛宻tructuredClone 浼氭姤閿欙紱鍏?toRaw 鍐嶅厠闅?
  const raw = toRaw(p) as any
  try {
    return structuredClone(raw)
  } catch {
    return JSON.parse(JSON.stringify(raw)) as Product
  }
}

async function refresh() {
  try {
    await window.api.products.ensureSegmentBucketsFromTemplates()
  } catch {
    /* ignore */
  }
  list.value = await window.api.products.list()
  if (!selectedId.value && list.value[0]) selectedId.value = list.value[0].id
  if (selected.value) {
    const segs = Object.keys(selected.value.assets ?? {})
    if (!segs.length) {
      // 鍏滃簳锛氳嚦灏戞湁 hook
      const next = cloneProduct(selected.value)
      next.assets = { ...(next.assets ?? {}), hook: next.assets?.hook ?? [] }
      await window.api.products.upsert(next)
      list.value = await window.api.products.list()
    }
    if (!selected.value.assets?.[activeSeg.value]) activeSeg.value = segments.value[0] ?? 'hook'
  }

  // 鍒锋柊鍚庯細瀵瑰綋鍓嶆鍋氫竴娆℃噿琛ュ叏锛堥伩鍏嶅叾瀹冩姘歌繙涓嶈ˉ鍏級
  void backfillActiveSegmentMedia()
}

function getAssetSegment(a: DisplayAsset) {
  return String(a.__segmentKey ?? activeSeg.value)
}

function applyWorkspaceFromRoute() {
  const q = String(route.query.ws ?? '').trim()
  if (!q) return
  if (PRODUCTS_WORKSPACES.includes(q as ProductsWorkspace)) {
    workspace.value = q as ProductsWorkspace
  }
}

async function backfillActiveSegmentMedia() {
  const p = selected.value
  const seg = activeSeg.value
  if (!p || !seg) return
  if (backfillBusy.value[seg]) return

  const assets = p.assets?.[seg] ?? []
  if (!assets.length) return

  // 浠呰ˉ鍏ㄥ綋鍓嶉〉(鏈€澶?24 鏉?缂哄け淇℃伅锛岄伩鍏嶄竴娆℃€ц窇澶瀵艰嚧鍗￠】
  const candidates = assets
    .filter((a) => a?.filePath && (!a.thumbnailDataUrl || !a.durationSec || !a.fileSize))
    .slice(0, Math.max(24, pageSize.value))
  if (!candidates.length) return

  backfillBusy.value[seg] = true
  try {
    const latest = (await window.api.products.list()).find((x: Product) => x.id === p.id) ?? p
    const patched: Product = cloneProduct(latest as Product)
    const byId = new Map<string, any>()

    await Promise.all(
      candidates.map(async (a) => {
        try {
          const info = await window.api.media.getInfo(a.filePath)
          byId.set(a.id, {
            fileName: info.fileName ?? a.fileName,
            fileSize: Number(info.fileSize ?? a.fileSize ?? 0),
            durationSec: Number(info.durationSec ?? a.durationSec ?? 0),
            width: typeof info.width === 'number' ? info.width : a.width,
            height: typeof info.height === 'number' ? info.height : a.height,
            fps: typeof info.fps === 'number' ? info.fps : a.fps,
            bitRate: typeof info.bitRate === 'number' ? info.bitRate : a.bitRate,
            qualityScore: typeof info.qualityScore === 'number' ? info.qualityScore : a.qualityScore,
            qualityIssues: Array.isArray(info.qualityIssues) ? info.qualityIssues : a.qualityIssues,
            thumbnailPath: info.thumbnailPath ?? a.thumbnailPath ?? null,
            thumbnailDataUrl: info.thumbnailDataUrl ?? a.thumbnailDataUrl ?? null,
          })
        } catch {
          // ignore
        }
      }),
    )

    if (byId.size) {
      patched.assets[seg] = (patched.assets[seg] ?? []).map((a) => (byId.has(a.id) ? { ...a, ...byId.get(a.id) } : a))
      await window.api.products.upsert(patched)
      list.value = await window.api.products.list()
    }
  } catch {
    // ignore
  } finally {
    backfillBusy.value[seg] = false
  }
}

async function createProduct() {
  if (!form.name.trim()) return
  await window.api.products.upsert({ name: form.name.trim(), type: form.type })
  form.name = ''
  await refresh()
}

async function removeProduct(id: string) {
  await window.api.products.remove(id)
  if (selectedId.value === id) selectedId.value = null
  await refresh()
}

function ensureAdding(seg: SegmentKey) {
  if (adding.value[seg] === undefined) adding.value[seg] = false
  return adding.value[seg]
}

async function addSegment() {
  if (!selected.value) return
  const key = cleanSegKey(newSegName.value)
  if (!key) return
  const next = cloneProduct(selected.value)
  next.assets = { ...(next.assets ?? {}) }
  if (next.assets[key]) {
    window.alert(t('products.segExists'))
    return
  }
  next.assets[key] = []
  await window.api.products.upsert(next)
  await refresh()
  activeSeg.value = key
  segAddingMode.value = false
  newSegName.value = ''
}

async function quickAddSegment() {
  if (!newSegName.value.trim()) newSegName.value = nextSceneName()
  if (!cleanSegKey(newSegName.value)) {
    window.alert(t('products.invalidSegName'))
    return
  }
  await addSegment()
}

async function removeSegment(seg: SegmentKey) {
  if (!selected.value) return
  const keys = Object.keys(selected.value.assets ?? {})
  if (keys.length <= 1) {
    window.alert(t('products.minOneSeg'))
    return
  }
  // 椤甸潰鍐呯‘璁わ紙閬垮厤 Electron 鐜 prompt/confirm 寮圭獥涓嶇ǔ瀹氾級
  pendingDeleteSeg.value = seg
}

async function confirmRemoveSegment() {
  const seg = pendingDeleteSeg.value
  if (!seg) return
  const next = cloneProduct(selected.value)
  next.assets = { ...(next.assets ?? {}) }
  delete (next.assets as any)[seg]
  await window.api.products.upsert(next)
  await refresh()
  activeSeg.value = segments.value[0] ?? 'hook'
  pendingDeleteSeg.value = null
}

/** 涓庛€屾坊鍔犵礌鏉愩€嶅叡鐢細涔愯鍏ュ簱 + ffprobe/缂╃暐鍥惧洖濉紙涓嶇鐞?adding 鐘舵€侊級 */
async function importVideoPathsToSegmentCore(segment: SegmentKey, paths: string[]) {
  if (!selected.value || !paths.length) return

  const now = Date.now()
  const optimistic = paths.map((p) => {
    const fileName = p.split(/[/\\]/).pop() ?? p
    return {
      id: crypto.randomUUID(),
      filePath: p,
      fileName,
      fileSize: 0,
      durationSec: 0,
      thumbnailPath: null,
      thumbnailDataUrl: null,
      createdAt: now,
    } satisfies MediaAsset
  })

  const next: Product = cloneProduct(selected.value)
  next.assets = { ...(next.assets ?? {}) }
  next.assets[segment] = next.assets[segment] ?? []
  next.assets[segment] = [...optimistic, ...next.assets[segment]]
  await window.api.products.upsert(next)
  await refresh()

  const enriched = await Promise.all(
    optimistic.map(async (a) => {
      try {
        const info = await window.api.media.getInfo(a.filePath)
        return {
          ...a,
          fileName: info.fileName ?? a.fileName,
          fileSize: Number(info.fileSize ?? 0),
          durationSec: Number(info.durationSec ?? 0),
          width: typeof info.width === 'number' ? info.width : undefined,
          height: typeof info.height === 'number' ? info.height : undefined,
          fps: typeof info.fps === 'number' ? info.fps : undefined,
          bitRate: typeof info.bitRate === 'number' ? info.bitRate : undefined,
          qualityScore: typeof info.qualityScore === 'number' ? info.qualityScore : undefined,
          qualityIssues: Array.isArray(info.qualityIssues) ? info.qualityIssues : undefined,
          thumbnailPath: info.thumbnailPath ?? null,
          thumbnailDataUrl: info.thumbnailDataUrl ?? null,
        }
      } catch {
        return a
      }
    }),
  )

  const latest = (await window.api.products.list()).find((p: Product) => p.id === next.id) ?? next
  const patched: Product = cloneProduct(latest as Product)
  const byId = new Map(enriched.map((x) => [x.id, x]))
  patched.assets[segment] = patched.assets[segment].map((a) => byId.get(a.id) ?? a)
  await window.api.products.upsert(patched)
  await refresh()
}

async function importVideoPathsToSegment(segment: SegmentKey, paths: string[]) {
  if (!selected.value || !paths.length) return
  ensureAdding(segment)
  adding.value[segment] = true
  try {
    await importVideoPathsToSegmentCore(segment, paths)
  } catch (e: any) {
    window.alert(e?.message ?? String(e))
  } finally {
    adding.value[segment] = false
  }
}

async function addAssets(segment: SegmentKey) {
  if (!selected.value) return
  ensureAdding(segment)
  adding.value[segment] = true
  try {
    const paths = await window.api.pickFiles({
      title: t('dialog.pickVideoMaterial'),
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] }],
    })
    if (!paths.length) return
    await importVideoPathsToSegmentCore(segment, paths)
  } catch (e: any) {
    window.alert(e?.message ?? String(e))
  } finally {
    adding.value[segment] = false
  }
}

function canDropAssets() {
  ensureAdding(activeSeg.value)
  return Boolean(
    selected.value && !splitImportBusy.value && !adding.value[activeSeg.value] && !splitModalOpen.value,
  )
}

function dataTransferHasFiles(dt: DataTransfer | null) {
  if (!dt?.types) return false
  const types = dt.types
  if (typeof types.contains === 'function') return types.contains('Files')
  return Array.from(types as unknown as string[]).includes('Files')
}

function onAssetDragEnter(e: DragEvent) {
  if (!canDropAssets() || !dataTransferHasFiles(e.dataTransfer)) return
  e.preventDefault()
  assetDropOverlay.value = true
}

function onAssetDragLeave(e: DragEvent) {
  const cur = e.currentTarget as HTMLElement
  const rel = e.relatedTarget as Node | null
  if (rel && cur.contains(rel)) return
  assetDropOverlay.value = false
}

function onAssetDragOver(e: DragEvent) {
  if (!canDropAssets() || !dataTransferHasFiles(e.dataTransfer)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  assetDropOverlay.value = true
}

/** Electron 涓?File 甯?path锛涙枃浠跺す鐢变富杩涚▼閫掑綊鏀堕泦瑙嗛 */
async function collectVideoPathsFromDataTransfer(dt: DataTransfer | null): Promise<string[]> {
  if (!dt?.files?.length) return []
  const roots: string[] = []
  for (let i = 0; i < dt.files.length; i++) {
    const f = dt.files[i] as File & { path?: string }
    if (typeof f.path === 'string' && f.path.trim()) roots.push(f.path.trim())
  }
  if (!roots.length) return []
  return await window.api.collectVideoFilesFromDrop(roots)
}

async function onAssetDrop(e: DragEvent) {
  assetDropOverlay.value = false
  e.preventDefault()
  if (!canDropAssets()) return
  const segment = activeSeg.value
  let paths: string[] = []
  try {
    paths = await collectVideoPathsFromDataTransfer(e.dataTransfer)
  } catch (err: any) {
    window.alert(err?.message ?? String(err))
    return
  }
  if (!paths.length) {
    window.alert(t('products.dropNoVideos'))
    return
  }
  await importVideoPathsToSegment(segment, paths)
}

async function removeAsset(segment: SegmentKey, assetId: string) {
  if (!selected.value) return
  const next: Product = cloneProduct(selected.value)
  next.assets = { ...(next.assets ?? {}) }
  next.assets[segment] = next.assets[segment] ?? []
  next.assets[segment] = next.assets[segment].filter((a) => a.id !== assetId)
  await window.api.products.upsert(next)
  await refresh()
}

onMounted(async () => {
  applyWorkspaceFromRoute()
  await refresh()
})

// 鍒囨崲娈垫椂锛氳嚜鍔ㄨˉ鍏ㄨ娈电殑缂╃暐鍥?鏃堕暱锛堝惁鍒欏彧鏈夌涓€涓鍦?refresh 鏃惰ˉ鍏級
watch(activeSeg, () => {
  void backfillActiveSegmentMedia()
})

function fmtDuration(sec: number) {
  const s = Math.max(0, Math.floor(sec || 0))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
}

const thumbError = ref<Record<string, boolean>>({})

function openPreview(a: MediaAsset) {
  previewTitle.value = a.fileName
  // 閫氳繃涓昏繘绋嬫敞鍐岀殑瀹夊叏鍗忚鎾斁鏈湴瑙嗛锛堥伩鍏?file:// 琚嫤鎴級
  previewSrc.value = `vg://file?path=${encodeURIComponent(a.filePath)}`
  previewOpen.value = true
}

function closePreview() {
  previewOpen.value = false
  previewSrc.value = null
  previewTitle.value = ''
}

function toggleMultiMode() {
  multiMode.value = !multiMode.value
  selectedAssetIds.value = new Set()
}

function toggleSelectAsset(id: string) {
  const next = new Set(selectedAssetIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedAssetIds.value = next
}

function selectAllOnPage() {
  const next = new Set(selectedAssetIds.value)
  for (const a of pagedAssets.value) next.add(a.id)
  selectedAssetIds.value = next
}

function clearSelection() {
  selectedAssetIds.value = new Set()
}

async function removeSelectedAssets() {
  if (!selected.value) return
  if (!selectedAssetIds.value.size) return
  const next: Product = cloneProduct(selected.value)
  next.assets = { ...(next.assets ?? {}) }
  next.assets[activeSeg.value] = (next.assets[activeSeg.value] ?? []).filter((a) => !selectedAssetIds.value.has(a.id))
  await window.api.products.upsert(next)
  selectedAssetIds.value = new Set()
  await refresh()
}

async function startLongVideoSplitPick() {
  if (!selected.value) return
  try {
    const paths = await window.api.pickFiles({
      multiple: false,
      title: t('dialog.pickLongVideo'),
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] }],
    })
    if (!paths.length) return
    splitPendingPath.value = paths[0]!
    splitSec.value = 3
    splitModalOpen.value = true
  } catch (e: any) {
    window.alert(e?.message ?? String(e))
  }
}

function cancelSplitModal() {
  splitModalOpen.value = false
  splitPendingPath.value = ''
}

async function appendVideoPathsToSegment(segment: SegmentKey, paths: string[]) {
  if (!selected.value || !paths.length) return
  const product = selected.value
  const now = Date.now()
  const optimistic = paths.map((p) => ({
    id: crypto.randomUUID(),
    filePath: p,
    fileName: p.split(/[/\\]/).pop() ?? p,
    fileSize: 0,
    durationSec: 0,
    thumbnailPath: null,
    thumbnailDataUrl: null,
    createdAt: now,
  }))

  const next: Product = cloneProduct(product)
  next.assets = { ...(next.assets ?? {}) }
  next.assets[segment] = [...optimistic, ...(next.assets[segment] ?? [])]
  await window.api.products.upsert(next)
  await refresh()

  const enriched: MediaAsset[] = []
  for (let i = 0; i < optimistic.length; i++) {
    splitEnrichCurrent.value = i + 1
    const a = optimistic[i]!
    try {
      const info = await window.api.media.getInfo(a.filePath)
      enriched.push({
        ...a,
        fileName: info.fileName ?? a.fileName,
        fileSize: Number(info.fileSize ?? 0),
        durationSec: Number(info.durationSec ?? 0),
        width: typeof info.width === 'number' ? info.width : undefined,
        height: typeof info.height === 'number' ? info.height : undefined,
        fps: typeof info.fps === 'number' ? info.fps : undefined,
        bitRate: typeof info.bitRate === 'number' ? info.bitRate : undefined,
        qualityScore: typeof info.qualityScore === 'number' ? info.qualityScore : undefined,
        qualityIssues: Array.isArray(info.qualityIssues) ? info.qualityIssues : undefined,
        thumbnailPath: info.thumbnailPath ?? null,
        thumbnailDataUrl: info.thumbnailDataUrl ?? null,
      })
    } catch {
      enriched.push(a)
    }
  }

  const latest = (await window.api.products.list()).find((p: Product) => p.id === next.id) ?? next
  const patched: Product = cloneProduct(latest as Product)
  const byId = new Map(enriched.map((x) => [x.id, x]))
  patched.assets[segment] = (patched.assets[segment] ?? []).map((x) => byId.get(x.id) ?? x)
  await window.api.products.upsert(patched)
  await refresh()
}

async function confirmSplitModal() {
  const inputPath = splitPendingPath.value
  const sec = Math.max(1, Math.min(600, Math.round(Number(splitSec.value) || 3)))
  if (!inputPath || !selected.value) return
  const segment = activeSeg.value
  splitModalOpen.value = false
  splitImportBusy.value = true
  splitPhase.value = 'ffmpeg'
  splitEnrichCurrent.value = 0
  splitEnrichTotal.value = 0

  let offProgress: (() => void) | null = null
  try {
    offProgress = window.api.media.onSegmentSplitProgress((p) => {
      const ph = p.phase
      if (ph === 'ffmpeg' || ph === 'collect') splitPhase.value = ph
      if (ph === 'done') splitPhase.value = 'done'
    })
    const res = await window.api.media.segmentSplit({ inputPath, segmentTimeSec: sec })
    offProgress()
    offProgress = null
    if (!res.ok) {
      window.alert(res.error)
      return
    }
    splitPhase.value = 'enrich'
    splitEnrichTotal.value = res.outputPaths.length
    await appendVideoPathsToSegment(segment, res.outputPaths)
  } catch (e: any) {
    window.alert(e?.message ?? String(e))
  } finally {
    offProgress?.()
    splitImportBusy.value = false
    splitPendingPath.value = ''
    splitPhase.value = 'idle'
    splitEnrichCurrent.value = 0
    splitEnrichTotal.value = 0
  }
}

const splitProgressPercent = computed(() => {
  if (splitPhase.value !== 'enrich' || !splitEnrichTotal.value) return 0
  return Math.min(100, Math.round((splitEnrichCurrent.value / splitEnrichTotal.value) * 100))
})

const splitProgressIndeterminate = computed(
  () => splitImportBusy.value && (splitPhase.value === 'ffmpeg' || splitPhase.value === 'collect' || splitPhase.value === 'done'),
)
</script>

<template>
  <div class="app-page space-y-4">
    <ProductionTabs />
    <div class="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside class="app-card p-4">
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-black text-white">产品列表</h2>
          <p class="mt-1 text-xs text-slate-500">素材容器</p>
        </div>
        <UiChip tone="neutral">{{ list.length }}</UiChip>
      </div>

      <div class="mb-3 flex gap-2">
        <input v-model="form.name" class="ui-input h-10 min-w-0 flex-1" placeholder="搜索/新产品名称" />
        <button class="app-primary px-3 text-sm" @click="createProduct">+ 新建产品</button>
      </div>
      <select v-model="form.type" class="ui-select mb-4 h-10">
        <option value="phone_case">手机壳</option>
        <option value="earring">耳环</option>
      </select>

      <div class="space-y-2">
        <button
          v-for="p in list"
          :key="p.id"
          class="app-soft-card flex w-full items-center justify-between gap-3 p-3 text-left transition hover:bg-white/[0.06]"
          :class="selectedId === p.id ? 'ring-1 ring-violet-400/50 bg-violet-500/15' : ''"
          @click="selectedId = p.id"
        >
          <div class="min-w-0">
            <div class="truncate text-sm font-black text-white">{{ p.name }}</div>
            <div class="mt-1 text-xs text-slate-500">素材 {{ Object.values(p.assets ?? {}).reduce((a, arr) => a + (arr?.length ?? 0), 0) }}</div>
          </div>
          <div class="text-xs text-slate-400">{{ p.type === 'phone_case' ? '手机壳' : '耳环' }}</div>
        </button>
      </div>
      </aside>

      <main class="app-card min-w-0 p-5">
      <div class="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-black text-white">{{ selected?.name || '请选择产品' }}</h1>
          <p class="mt-2 text-sm text-slate-400">按段管理素材，支持拖入视频/文件夹或使用工具条导入。</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="app-ghost px-3 py-2 text-xs" @click="toggleMultiMode">{{ multiMode ? '退出多选' : '多选' }}</button>
          <button class="app-ghost px-3 py-2 text-xs" :disabled="!selected" @click="advancedOpen = !advancedOpen">{{ advancedOpen ? '收起更多' : '更多功能' }}</button>
          <button class="app-ghost px-3 py-2 text-xs" :disabled="!selected || splitImportBusy" @click="startLongVideoSplitPick">长视频切分导入</button>
          <button class="app-primary px-4 py-2 text-sm" :disabled="!selected || ensureAdding(activeSeg) || splitImportBusy" @click="addAssets(activeSeg)">添加素材</button>
          <button v-if="selected" class="rounded-lg border border-red-400/35 bg-red-500/15 px-3 py-2 text-xs font-bold text-red-200" @click="removeProduct(selected.id)">删除产品</button>
        </div>
      </div>

      <div v-if="!selected" class="grid min-h-[480px] place-items-center rounded-2xl border border-dashed border-slate-700/70 bg-black/10 text-slate-500">
        选择左侧产品，或新建一个产品后添加素材。
      </div>

      <div v-else ref="assetDropZoneRef" class="relative" @dragenter.prevent="onAssetDragEnter" @dragleave.prevent="onAssetDragLeave" @dragover.prevent="onAssetDragOver" @drop.prevent="onAssetDrop">
        <section v-if="advancedOpen" class="app-soft-card mb-5 space-y-4 p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="text-sm font-black text-white">高级素材工具</div>
              <p class="mt-1 text-xs text-slate-500">{{ workspaceHint }}</p>
            </div>
            <div class="app-tabs">
              <button v-for="item in workspaceItems" :key="item.key" class="app-tab" :class="{ 'is-active': workspace === item.key }" @click="workspace = item.key as any">
                {{ item.label }}
              </button>
            </div>
          </div>

          <div class="grid gap-3 lg:grid-cols-4">
            <button class="app-soft-card p-3 text-left" :disabled="!selected || backfillBusy[activeSeg]" @click="backfillActiveSegmentMedia">
              <div class="text-sm font-bold text-white">AI 质量补全</div>
              <p class="mt-1 text-xs text-slate-500">补齐缩略图、时长、分辨率和质量标记。</p>
              <div class="mt-2 text-xs text-amber-300">问题素材 {{ aiIssueCount }}</div>
            </button>
            <button class="app-soft-card p-3 text-left" :disabled="!selected" @click="segAddingMode = !segAddingMode">
              <div class="text-sm font-bold text-white">新增分镜段位</div>
              <p class="mt-1 text-xs text-slate-500">为当前产品增加自定义 scene 段。</p>
              <div class="mt-2 text-xs text-slate-400">当前 {{ segments.length }} 段</div>
            </button>
            <button class="app-soft-card p-3 text-left" :disabled="!selected || segments.length <= 1" @click="removeSegment(activeSeg)">
              <div class="text-sm font-bold text-white">删除当前段位</div>
              <p class="mt-1 text-xs text-slate-500">删除 {{ activeSeg.toUpperCase() }} 及其素材。</p>
              <div class="mt-2 text-xs text-red-300">谨慎操作</div>
            </button>
            <button class="app-soft-card p-3 text-left" @click="workspace = 'assets'">
              <div class="text-sm font-bold text-white">跨段资产视图</div>
              <p class="mt-1 text-xs text-slate-500">查看当前产品所有段位素材。</p>
              <div class="mt-2 text-xs text-violet-300">总素材 {{ totalAssetsForSelected }}</div>
            </button>
          </div>

          <div v-if="segAddingMode" class="flex flex-wrap items-center gap-2">
            <input v-model="newSegName" class="ui-input h-10 min-w-[180px]" placeholder="scene4 / proof / cta" @keydown.enter.prevent="quickAddSegment" />
            <button class="app-primary px-4 py-2 text-sm" @click="quickAddSegment">确认新增</button>
            <button class="app-ghost px-4 py-2 text-sm" @click="segAddingMode = false">取消</button>
          </div>

          <div class="grid gap-3 text-xs text-slate-400 md:grid-cols-3">
            <div class="app-soft-card p-3">云路径素材：<b class="text-white">{{ cloudPathCount }}</b></div>
            <div class="app-soft-card p-3">当前视图素材：<b class="text-white">{{ allAssets.length }}</b></div>
            <div class="app-soft-card p-3">当前页：<b class="text-white">{{ currentPage }} / {{ totalPages }}</b></div>
          </div>
        </section>

        <div class="app-tabs mb-5">
          <button v-for="seg in segments" :key="seg" class="app-tab" :class="activeSeg === seg ? 'is-active' : ''" @click="activeSeg = seg">
            {{ seg.toUpperCase() }} <span class="ml-1 text-slate-500">{{ selected.assets?.[seg]?.length ?? 0 }}</span>
          </button>
        </div>

        <div v-if="multiMode" class="app-soft-card mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
          <div class="text-sm text-slate-300">已选择 {{ selectedCount }} 个素材</div>
          <div class="flex gap-2">
            <button class="app-ghost px-3 py-2 text-xs" :disabled="!pagedAssets.length || pageAllSelected" @click="selectAllOnPage">选择本页</button>
            <button class="app-ghost px-3 py-2 text-xs" :disabled="!selectedCount" @click="clearSelection">清空</button>
            <button class="rounded-lg border border-red-400/35 bg-red-500/15 px-3 py-2 text-xs font-bold text-red-200" :disabled="!selectedCount" @click="removeSelectedAssets">删除所选</button>
          </div>
        </div>

        <div v-if="allAssets.length === 0" class="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-slate-700/70 bg-black/10 p-8 text-center">
          <div>
            <FolderOpen class="mx-auto h-12 w-12 text-slate-500" />
            <div class="mt-5 text-lg font-black text-white">当前段位暂无素材</div>
            <p class="mt-2 text-sm text-slate-500">可拖入视频/文件夹，或使用「添加素材」「长视频切分导入」。</p>
          </div>
        </div>

        <div v-else class="grid grid-cols-3 gap-4 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          <button v-for="a in pagedAssets" :key="a.id" class="group overflow-hidden rounded-xl bg-slate-950/80 text-left ring-1 ring-white/10 transition hover:-translate-y-1 hover:ring-violet-400/40" @click="multiMode ? toggleSelectAsset(a.id) : openPreview(a)">
            <div class="relative aspect-[9/12] overflow-hidden bg-slate-800">
              <img v-if="a.thumbnailDataUrl && !thumbError[a.id]" :src="a.thumbnailDataUrl" class="h-full w-full object-cover" @error="thumbError[a.id] = true" />
              <div v-else class="grid h-full place-items-center"><FileVideo class="h-7 w-7 text-slate-500" /></div>
              <span class="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">{{ fmtDuration(a.durationSec) }}</span>
              <span v-if="multiMode" class="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">{{ selectedAssetIds.has(a.id) ? '已选' : '选择' }}</span>
            </div>
            <div class="p-2">
              <div class="truncate text-xs font-bold text-white">{{ a.fileName }}</div>
              <div class="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                <span>{{ getAssetSegment(a).toUpperCase() }}</span>
                <button class="text-red-300" @click.stop="removeAsset(getAssetSegment(a), a.id)">删除</button>
              </div>
            </div>
          </button>
        </div>

        <PaginationBar
          v-if="allAssets.length > pageSize"
          v-model:page="currentPage"
          v-model:page-size="pageSize"
          :total-pages="totalPages"
          :page-size-options="[12, 24, 48, 96]"
        />

        <div v-show="assetDropOverlay" class="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-2xl border border-violet-400/50 bg-violet-500/20 backdrop-blur-sm">
          <p class="text-sm font-black text-white">释放后导入到当前段位</p>
        </div>
      </div>
      </main>
    </div>
  </div>

  <VideoPreviewModal :open="previewOpen" :src="previewSrc" :title="previewTitle" @close="closePreview" />

  <div
    v-if="pendingDeleteSeg"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
    @click.self="pendingDeleteSeg = null"
  >
    <div class="w-full max-w-sm rounded-xl border border-white/10 bg-[#18181B] p-4 shadow-2xl shadow-black/50" @click.stop>
      <div class="text-sm font-semibold text-white/90">删除分镜段位</div>
      <div class="mt-2 text-sm leading-6 text-white/55">确认删除 {{ pendingDeleteSeg.toUpperCase() }}？该段位下的素材会一起移除。</div>
      <div class="mt-4 flex justify-end gap-2">
        <button class="app-ghost px-4 py-2 text-sm" @click="pendingDeleteSeg = null">取消</button>
        <button class="rounded-lg border border-red-400/35 bg-red-500/15 px-4 py-2 text-sm font-bold text-red-200" @click="confirmRemoveSegment">确认删除</button>
      </div>
    </div>
  </div>

  <!-- 闀胯棰戝垏鍒嗭細鏃堕暱纭 -->
  <div
    v-if="splitModalOpen"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
    @click.self="cancelSplitModal"
  >
    <div
      class="w-full max-w-md rounded-xl border border-white/10 bg-[#18181B] p-4 shadow-2xl shadow-black/50"
      @click.stop
    >
      <div class="text-sm font-semibold text-white/90">{{ t('products.splitModalTitle') }}</div>
      <div class="mt-1 truncate text-[11px] text-white/45" :title="splitPendingPath">{{ splitPendingBasename }}</div>
      <div class="mt-3 text-[11px] text-white/50">{{ t('products.splitModalHint') }}</div>
      <div class="mt-2 flex items-center gap-2">
        <label class="text-sm text-white/70">{{ t('products.splitSecLabel') }}</label>
        <input v-model.number="splitSec" type="number" min="1" max="600" class="ui-input h-9 w-24 px-2 text-sm" />
        <span class="text-[11px] text-white/40">{{ t('products.splitSecUnit') }}</span>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <UiButton variant="ghost" @click="cancelSplitModal">{{ t('common.cancel') }}</UiButton>
        <UiButton variant="accent" @click="confirmSplitModal">{{ t('common.confirm') }}</UiButton>
      </div>
    </div>
  </div>

  <!-- 闀胯棰戝垏鍒嗭細杩涘害 -->
  <div
    v-if="splitImportBusy"
    class="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-4"
  >
    <div class="w-full max-w-sm rounded-xl border border-white/10 bg-[#18181B] p-4 shadow-xl">
      <div class="text-sm font-medium text-white/90">{{ t('products.splitProgressTitle') }}</div>
      <div class="mt-1 text-[11px] text-white/50">
        {{
          splitPhase === 'enrich'
            ? t('products.splitProgressEnrich', { cur: splitEnrichCurrent, total: splitEnrichTotal })
            : t('products.splitProgressFfmpeg')
        }}
      </div>
      <div class="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          v-if="splitProgressIndeterminate"
          class="split-shimmy absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
        />
        <div
          v-else
          class="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-[width] duration-200"
          :style="{ width: splitProgressPercent + '%' }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.split-shimmy {
  animation: splitShimmy 1.25s ease-in-out infinite;
}
@keyframes splitShimmy {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(320%);
  }
}
</style>


