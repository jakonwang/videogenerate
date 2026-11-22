<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  AlertTriangle,
  AudioLines,
  CheckCircle2,
  ChevronsLeftRight,
  ClipboardCopy,
  CloudUpload,
  Combine,
  Crop,
  FileVideo,
  Film,
  Flag,
  FolderOpen,
  Folder,
  Hand,
  Loader2,
  Merge,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Rows3,
  Scissors,
  SkipBack,
  SkipForward,
  Sparkles,
  SplitSquareHorizontal,
  Timer,
  Trash2,
  Upload,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-vue-next'
import LiveSlicerTimeline from '@/ui/components/live-slicer/LiveSlicerTimeline.vue'
// The page brings its own stylesheet so the web version (which reuses this page) gets it too.
import '@/design-system/live-slicer.css'
import {
  buildSegments,
  formatDuration,
  formatTime,
  newSegmentId,
  type LiveSegment,
  type Signals,
  type SliceMode,
  type SliceParams,
} from '@/ui/components/live-slicer/segmentEngine'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const sendingToPublish = ref(false)

/** 导出好的高光片段 → 发布中心草稿（标题用片段名），跳过去并打开「分发到多个号」 */
async function sendClipsToPublish() {
  const ok = exportResults.value.filter((r) => r.ok && r.outputPath)
  if (!ok.length || sendingToPublish.value) return
  sendingToPublish.value = true
  try {
    const titleOf = (id: string) => segments.value.find((s) => s.id === id)?.title || ''
    const created: Array<{ id: string }> = []
    for (const result of ok) {
      const title = titleOf(result.id).trim().slice(0, 150)
      const drafts = await window.api.tiktokPublisher.createDraftsFromPaths({ paths: [result.outputPath!], defaults: title ? { videoTitle: title } : {} })
      created.push(...drafts)
    }
    await router.push({ path: '/publish', query: { select: created.map((item) => item.id).join(','), distribute: '1' } })
  } catch (error: any) {
    notify('error', String(error?.message || error))
  } finally {
    sendingToPublish.value = false
  }
}

type Source = {
  path: string
  fileName: string
  fileSize: number
  durationSec: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
  videoCodec: string | null
  audioCodec: string | null
  bitRate: number
}
type CutMode = 'precise' | 'fast'
type Aspect = 'original' | '9:16-crop' | '9:16-blur' | '1:1' | '16:9'
type Resolution = 'source' | '1080' | '720'
type ExportResult = { id: string; ok: boolean; outputPath?: string; sizeBytes?: number; error?: string }

const SETTINGS_KEY = 'vg.liveSlicer.settings.v1'
const PROJECT_KEY = 'vg.liveSlicer.project.v1:'
const PROJECT_INDEX_KEY = 'vg.liveSlicer.projects.v1'
const MAX_PROJECTS = 6
const VIDEO_EXT = ['mp4', 'mov', 'mkv', 'webm', 'flv', 'ts', 'm4v']

// ---------------- state ----------------
const source = ref<Source | null>(null)
const loadingSource = ref(false)
const dragOver = ref(false)

const videoEl = ref<HTMLVideoElement | null>(null)
const timelineRef = ref<InstanceType<typeof LiveSlicerTimeline> | null>(null)
const currentTime = ref(0)
const playing = ref(false)
const playbackRate = ref(1)
const loopClip = ref(false)
const clipRange = ref<{ start: number; end: number } | null>(null)
let rafId = 0

const analysis = ref<Signals | null>(null)
const analyzing = ref(false)
const analyzeProgress = ref(0)
const analyzeJobId = ref('')

const mode = ref<SliceMode>('highlight')
const params = reactive<SliceParams>({ minSec: 15, maxSec: 60, maxClips: 20, sensitivity: 0.5, intervalSec: 30, skipSilence: true })

const segments = ref<LiveSegment[]>([])
const activeId = ref('')
const inPoint = ref<number | null>(null)
const outPoint = ref<number | null>(null)
const zoom = ref(1)
const sortBy = ref<'time' | 'score'>('time')
const thumbs = reactive<Record<string, string>>({})

const exportOpts = reactive({
  outputDir: '',
  cutMode: 'precise' as CutMode,
  aspect: 'original' as Aspect,
  resolution: '1080' as Resolution,
  fade: true,
  normalizeAudio: true,
  padding: 0,
  namePrefix: '',
  subFolder: true,
})
const exporting = ref(false)
const exportJobId = ref('')
const exportProgress = reactive({ index: 0, total: 0, fraction: 0 })
const exportResults = ref<ExportResult[]>([])
const exportDir = ref('')

const toast = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
let toastTimer = 0
let offProgress: (() => void) | null = null

// ---------------- derived ----------------
const duration = computed(() => source.value?.durationSec || 0)
const videoUrl = computed(() => (source.value ? `vg://file?path=${encodeURIComponent(source.value.path)}` : ''))
const activeSegment = computed(() => segments.value.find((s) => s.id === activeId.value) || null)
const selectedSegments = computed(() => [...segments.value].filter((s) => s.selected).sort((a, b) => a.start - b.start))
const selectedDuration = computed(() => selectedSegments.value.reduce((sum, s) => sum + (s.end - s.start), 0))
const allSelected = computed(() => segments.value.length > 0 && segments.value.every((s) => s.selected))
const listed = computed(() => {
  const list = [...segments.value]
  if (sortBy.value === 'score') list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.start - b.start)
  else list.sort((a, b) => a.start - b.start)
  return list
})
const indexOf = computed(() => {
  const map: Record<string, number> = {}
  ;[...segments.value].sort((a, b) => a.start - b.start).forEach((s, i) => (map[s.id] = i + 1))
  return map
})
const timelineSegments = computed(() => [...segments.value].sort((a, b) => a.start - b.start))
const fastMode = computed(() => exportOpts.cutMode === 'fast')
const exportOverall = computed(() =>
  exportProgress.total ? Math.round(((exportProgress.index + exportProgress.fraction) / exportProgress.total) * 100) : 0,
)
const exportOk = computed(() => exportResults.value.filter((r) => r.ok))
const exportFailed = computed(() => exportResults.value.filter((r) => !r.ok))

const statusPill = computed(() => {
  if (exporting.value) return { tone: 'vg-pill--blue', text: t('slicer.status.exporting', { n: exportProgress.index + 1, total: exportProgress.total }) }
  if (analyzing.value) return { tone: 'vg-pill--blue', text: t('slicer.status.analyzing', { pct: Math.round(analyzeProgress.value * 100) }) }
  if (!source.value) return { tone: '', text: t('slicer.status.idle') }
  if (segments.value.length) return { tone: 'vg-pill--green', text: t('slicer.status.clips', { n: segments.value.length }) }
  if (analysis.value) return { tone: 'vg-pill--green', text: t('slicer.status.analyzed') }
  return { tone: 'vg-pill--amber', text: t('slicer.status.ready') }
})

const modeCards = computed(() => [
  { id: 'highlight' as const, icon: Sparkles, title: t('slicer.mode.highlight'), desc: t('slicer.mode.highlightDesc') },
  { id: 'pause' as const, icon: AudioLines, title: t('slicer.mode.pause'), desc: t('slicer.mode.pauseDesc') },
  { id: 'interval' as const, icon: Timer, title: t('slicer.mode.interval'), desc: t('slicer.mode.intervalDesc') },
  { id: 'manual' as const, icon: Hand, title: t('slicer.mode.manual'), desc: t('slicer.mode.manualDesc') },
])

const aspectOptions = computed(() => [
  { id: 'original' as const, label: t('slicer.export.aspectOriginal') },
  { id: '9:16-crop' as const, label: t('slicer.export.aspectCrop916') },
  { id: '9:16-blur' as const, label: t('slicer.export.aspectBlur916') },
  { id: '1:1' as const, label: '1:1' },
  { id: '16:9' as const, label: '16:9' },
])

const sourceFacts = computed(() => {
  const s = source.value
  if (!s) return []
  return [
    { k: t('slicer.source.duration'), v: formatTime(s.durationSec) },
    { k: t('slicer.source.resolution'), v: s.width && s.height ? `${s.width}×${s.height}` : '—' },
    { k: t('slicer.source.fps'), v: s.fps ? `${Math.round(s.fps * 100) / 100} fps` : '—' },
    { k: t('slicer.source.size'), v: formatBytes(s.fileSize) },
    { k: t('slicer.source.codec'), v: [s.videoCodec, s.hasAudio ? s.audioCodec : t('slicer.source.noAudio')].filter(Boolean).join(' / ') || '—' },
  ]
})

// ---------------- helpers ----------------
function notify(kind: 'success' | 'error', text: string) {
  toast.value = { kind, text }
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = null), kind === 'error' ? 6000 : 3000)
}

function formatBytes(n: number) {
  if (!n) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`
}

function basename(p: string) {
  return String(p || '').split(/[/\\]/).pop() || p
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or unavailable: the page keeps working without persistence */
  }
}

function clampTime(v: number) {
  return Math.max(0, Math.min(duration.value, Math.round(v * 10) / 10))
}

// ---------------- persistence ----------------
function saveSettings() {
  writeJson(SETTINGS_KEY, { mode: mode.value, params: { ...params }, exportOpts: { ...exportOpts } })
}

function loadSettings() {
  const s = readJson<{ mode?: SliceMode; params?: Partial<SliceParams>; exportOpts?: Partial<typeof exportOpts> }>(SETTINGS_KEY)
  if (!s) return
  if (s.mode) mode.value = s.mode
  if (s.params) Object.assign(params, s.params)
  if (s.exportOpts) Object.assign(exportOpts, s.exportOpts)
}

function saveProject() {
  const s = source.value
  if (!s) return
  const key = PROJECT_KEY + s.path
  writeJson(key, {
    size: s.fileSize,
    segments: segments.value,
    analysis: analysis.value
      ? { ...analysis.value, energy: analysis.value.energy.map((v) => Math.round(v * 10) / 10) }
      : null,
  })
  const index = (readJson<string[]>(PROJECT_INDEX_KEY) || []).filter((p) => p !== s.path)
  index.unshift(s.path)
  for (const stale of index.splice(MAX_PROJECTS)) {
    try {
      localStorage.removeItem(PROJECT_KEY + stale)
    } catch {
      /* ignore */
    }
  }
  writeJson(PROJECT_INDEX_KEY, index)
}

function restoreProject(s: Source) {
  const saved = readJson<{ size: number; segments: LiveSegment[]; analysis: Signals | null }>(PROJECT_KEY + s.path)
  if (!saved || saved.size !== s.fileSize) return false
  segments.value = Array.isArray(saved.segments) ? saved.segments : []
  analysis.value = saved.analysis
  return segments.value.length > 0 || Boolean(saved.analysis)
}

let saveTimer = 0
watch(
  segments,
  () => {
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(saveProject, 400)
    queueThumbs()
  },
  { deep: true },
)
watch([mode, params, exportOpts], saveSettings, { deep: true })

// ---------------- source ----------------
async function openSource(path: string) {
  if (!path) return
  if (analyzing.value) await cancelAnalyze()
  loadingSource.value = true
  try {
    const res = await window.api.liveSlicer.probe(path)
    if (!res.ok) {
      notify('error', res.error)
      return
    }
    pause()
    source.value = res.source
    segments.value = []
    analysis.value = null
    activeId.value = ''
    inPoint.value = null
    outPoint.value = null
    zoom.value = 1
    currentTime.value = 0
    exportResults.value = []
    exportDir.value = ''
    for (const k of Object.keys(thumbs)) delete thumbs[k]
    if (restoreProject(res.source)) notify('success', t('slicer.toast.restored'))
  } catch (e: any) {
    notify('error', e?.message ?? String(e))
  } finally {
    loadingSource.value = false
  }
}

async function pickVideo() {
  const files = await window.api.pickFiles({
    title: t('slicer.pickers.video'),
    multiple: false,
    filters: [{ name: 'Video', extensions: VIDEO_EXT }],
  })
  if (files?.[0]) await openSource(files[0])
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  const path = window.api.getPathForFile(file)
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (!VIDEO_EXT.includes(ext)) {
    notify('error', t('slicer.toast.unsupported'))
    return
  }
  void openSource(path)
}

async function pickOutputDir() {
  const dir = await window.api.pickDir({ title: t('slicer.pickers.outputDir') })
  if (dir) exportOpts.outputDir = String(dir)
}

async function initDefaultOutputDir() {
  if (exportOpts.outputDir) return
  try {
    const paths = (await window.api.getPaths()) as { dataDir?: string }
    const base = String(paths?.dataDir || '').trim()
    if (base) exportOpts.outputDir = `${base}\\exports\\live_slicer`
  } catch {
    /* keep empty */
  }
}

// ---------------- player ----------------
function tick() {
  const v = videoEl.value
  if (v) {
    currentTime.value = v.currentTime
    if (clipRange.value && v.currentTime >= clipRange.value.end) {
      if (loopClip.value) v.currentTime = clipRange.value.start
      else {
        v.pause()
        clipRange.value = null
      }
    }
  }
  rafId = playing.value ? requestAnimationFrame(tick) : 0
}

function onPlay() {
  playing.value = true
  if (!rafId) rafId = requestAnimationFrame(tick)
}
function onPause() {
  playing.value = false
  if (videoEl.value) currentTime.value = videoEl.value.currentTime
}

function play() {
  void videoEl.value?.play().catch(() => {})
}
function pause() {
  videoEl.value?.pause()
}
function togglePlay() {
  if (!videoEl.value) return
  if (videoEl.value.paused) {
    clipRange.value = null
    play()
  } else pause()
}

function seek(sec: number) {
  const v = videoEl.value
  const tt = Math.max(0, Math.min(duration.value, sec))
  currentTime.value = tt
  if (v) v.currentTime = tt
  if (clipRange.value && (tt < clipRange.value.start || tt > clipRange.value.end)) clipRange.value = null
}

function nudge(delta: number) {
  seek(currentTime.value + delta)
}

function playSegment(seg: LiveSegment) {
  activeId.value = seg.id
  clipRange.value = { start: seg.start, end: seg.end }
  seek(seg.start)
  timelineRef.value?.scrollToTime(seg.start)
  play()
}

watch(playbackRate, (r) => {
  if (videoEl.value) videoEl.value.playbackRate = r
})

// ---------------- in / out marking ----------------
function markIn() {
  inPoint.value = clampTime(currentTime.value)
  if (outPoint.value != null && outPoint.value <= inPoint.value) outPoint.value = null
}
function markOut() {
  outPoint.value = clampTime(currentTime.value)
  if (inPoint.value != null && inPoint.value >= outPoint.value) inPoint.value = null
}
function clearMarks() {
  inPoint.value = null
  outPoint.value = null
}

const canAddFromMarks = computed(() => inPoint.value != null && outPoint.value != null && outPoint.value - inPoint.value >= 0.5)

function addSegment(start: number, end: number) {
  const seg: LiveSegment = {
    id: newSegmentId(),
    start: clampTime(start),
    end: clampTime(end),
    title: t('slicer.clipPrefix') + ' ' + (segments.value.length + 1),
    score: null,
    origin: 'manual',
    selected: true,
  }
  segments.value = [...segments.value, seg]
  activeId.value = seg.id
  return seg
}

function addFromMarks() {
  if (inPoint.value == null) return
  const end = outPoint.value ?? Math.min(duration.value, inPoint.value + params.minSec)
  if (end - inPoint.value < 0.5) return
  addSegment(inPoint.value, end)
  clearMarks()
}

function addAtPlayhead() {
  const start = clampTime(currentTime.value)
  addSegment(start, Math.min(duration.value, start + Math.max(5, params.minSec)))
}

// ---------------- auto slicing ----------------
function signalsForBuild(): Signals | null {
  if (analysis.value) return analysis.value
  if (mode.value === 'interval' && duration.value > 0) return { durationSec: duration.value, step: 0.5, energy: [], scenes: [] }
  return null
}

function generate() {
  if (mode.value === 'manual') {
    notify('success', t('slicer.toast.manualHint'))
    return
  }
  const sig = signalsForBuild()
  if (!sig) {
    void runAnalyze(true)
    return
  }
  const auto = buildSegments(mode.value, sig, params, t('slicer.clipPrefix'))
  const manual = segments.value.filter((s) => s.origin === 'manual')
  segments.value = [...manual, ...auto]
  activeId.value = auto[0]?.id || manual[0]?.id || ''
  if (!auto.length) notify('error', t('slicer.toast.noneFound'))
  else notify('success', t('slicer.toast.generated', { n: auto.length }))
}

async function runAnalyze(thenGenerate = false) {
  const s = source.value
  if (!s || analyzing.value) return
  analyzing.value = true
  analyzeProgress.value = 0
  const jobId = `analyze_${Date.now()}`
  analyzeJobId.value = jobId
  try {
    const res = await window.api.liveSlicer.analyze({ jobId, inputPath: s.path })
    if (source.value?.path !== s.path) return
    if (!res.ok) {
      if (!res.cancelled) notify('error', t('slicer.toast.analyzeFailed', { error: res.error.split('\n')[0] }))
      return
    }
    analysis.value = res.analysis
    analyzeProgress.value = 1
    saveProject()
    if (thenGenerate || !segments.value.length) generate()
  } finally {
    analyzing.value = false
    analyzeJobId.value = ''
  }
}

async function cancelAnalyze() {
  if (analyzeJobId.value) await window.api.liveSlicer.cancel(analyzeJobId.value)
}

function resetParams() {
  Object.assign(params, { minSec: 15, maxSec: 60, maxClips: 20, sensitivity: 0.5, intervalSec: 30, skipSilence: true })
}

// ---------------- segment editing ----------------
function selectSegment(id: string) {
  activeId.value = id
}

function updateRange(id: string, range: { start: number; end: number }) {
  const seg = segments.value.find((s) => s.id === id)
  if (!seg) return
  seg.start = range.start
  seg.end = range.end
}

function setActiveEdge(edge: 'start' | 'end', value: number) {
  const seg = activeSegment.value
  if (!seg) return
  const v = clampTime(value)
  if (edge === 'start') seg.start = Math.min(v, seg.end - 0.5)
  else seg.end = Math.max(v, seg.start + 0.5)
}

function removeSegment(id: string) {
  segments.value = segments.value.filter((s) => s.id !== id)
  if (activeId.value === id) activeId.value = ''
}

function removeSelected() {
  const n = selectedSegments.value.length
  if (!n) return
  segments.value = segments.value.filter((s) => !s.selected)
  if (!segments.value.some((s) => s.id === activeId.value)) activeId.value = ''
  notify('success', t('slicer.toast.removed', { n }))
}

function clearAll() {
  segments.value = []
  activeId.value = ''
}

function toggleAll() {
  const next = !allSelected.value
  segments.value.forEach((s) => (s.selected = next))
}

function mergeSelected() {
  const list = selectedSegments.value
  if (list.length < 2) return
  const merged: LiveSegment = {
    id: newSegmentId(),
    start: list[0].start,
    end: Math.max(...list.map((s) => s.end)),
    title: list[0].title,
    score: list.some((s) => s.score != null) ? Math.max(...list.map((s) => s.score ?? 0)) : null,
    origin: 'manual',
    selected: true,
  }
  const ids = new Set(list.map((s) => s.id))
  segments.value = [...segments.value.filter((s) => !ids.has(s.id)), merged]
  activeId.value = merged.id
}

function splitActive() {
  const seg = activeSegment.value
  const at = clampTime(currentTime.value)
  if (!seg || at <= seg.start + 0.5 || at >= seg.end - 0.5) {
    notify('error', t('slicer.toast.splitHint'))
    return
  }
  const second: LiveSegment = { ...seg, id: newSegmentId(), start: at, title: `${seg.title} B`, origin: 'manual' }
  seg.end = at
  segments.value = [...segments.value, second]
}

async function copyTimecodes() {
  const lines = selectedSegments.value.map(
    (s, i) => `${String(i + 1).padStart(2, '0')}  ${formatTime(s.start, true)} - ${formatTime(s.end, true)}  (${formatDuration(s.end - s.start)})  ${s.title}`,
  )
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    notify('success', t('slicer.toast.copied', { n: lines.length }))
  } catch {
    notify('error', t('slicer.toast.copyFailed'))
  }
}

// ---------------- thumbnails ----------------
let thumbBusy = false
async function queueThumbs() {
  const s = source.value
  if (!s || thumbBusy) return
  thumbBusy = true
  try {
    const landscape = (s.width || 16) >= (s.height || 9)
    const w = landscape ? 192 : Math.round((108 * (s.width || 9)) / (s.height || 16))
    const h = landscape ? Math.round((192 * (s.height || 9)) / (s.width || 16)) : 192
    for (;;) {
      const next = segments.value.find((seg) => !thumbs[thumbKey(seg)])
      if (!next || source.value?.path !== s.path) break
      const key = thumbKey(next)
      thumbs[key] = 'pending'
      const path = await window.api.liveSlicer.thumbnail({ inputPath: s.path, atSec: next.start + Math.min(2, (next.end - next.start) / 3), width: w, height: h })
      if (source.value?.path !== s.path) break
      thumbs[key] = path ? `vg://file?path=${encodeURIComponent(path)}` : 'none'
    }
  } finally {
    thumbBusy = false
  }
}

function thumbKey(seg: LiveSegment) {
  return String(Math.round((seg.start + Math.min(2, (seg.end - seg.start) / 3)) * 10))
}

function thumbOf(seg: LiveSegment) {
  const v = thumbs[thumbKey(seg)]
  return v && v !== 'pending' && v !== 'none' ? v : ''
}

// ---------------- export ----------------
async function startExport() {
  const s = source.value
  const list = selectedSegments.value
  if (!s || !list.length || exporting.value) return
  if (!exportOpts.outputDir) {
    notify('error', t('slicer.toast.noOutputDir'))
    return
  }
  exporting.value = true
  exportResults.value = []
  exportDir.value = ''
  Object.assign(exportProgress, { index: 0, total: list.length, fraction: 0 })
  const jobId = `export_${Date.now()}`
  exportJobId.value = jobId
  try {
    const res = await window.api.liveSlicer.export({
      jobId,
      inputPath: s.path,
      segments: list.map((x) => ({ id: x.id, start: x.start, end: x.end, title: x.title })),
      options: { ...exportOpts },
    })
    if (!res.ok) {
      notify('error', res.cancelled ? t('slicer.toast.exportCancelled') : res.error.split('\n')[0])
      return
    }
    exportResults.value = res.results
    exportDir.value = res.outputDir
    const failed = res.results.filter((r) => !r.ok).length
    notify(failed ? 'error' : 'success', failed ? t('slicer.toast.exportPartial', { ok: res.results.length - failed, failed }) : t('slicer.toast.exported', { n: res.results.length }))
  } finally {
    exporting.value = false
    exportJobId.value = ''
  }
}

async function cancelExport() {
  if (exportJobId.value) await window.api.liveSlicer.cancel(exportJobId.value)
}

async function openPath(path: string) {
  if (!path) return
  try {
    await window.api.shell.openPath(path)
  } catch (e: any) {
    notify('error', e?.message ?? String(e))
  }
}

async function showInFolder(path: string) {
  if (path) await window.api.shell.showItemInFolder(path)
}

function resultFor(id: string) {
  return exportResults.value.find((r) => r.id === id) || null
}

// ---------------- keyboard ----------------
function onKey(e: KeyboardEvent) {
  if (!source.value) return
  const target = e.target as HTMLElement | null
  if (target && (target.closest('input, textarea, select, [contenteditable="true"]') || e.ctrlKey || e.metaKey || e.altKey)) return
  const k = e.key.toLowerCase()
  const handled = (() => {
    if (k === ' ') togglePlay()
    else if (k === 'arrowleft') nudge(e.shiftKey ? -5 : -1)
    else if (k === 'arrowright') nudge(e.shiftKey ? 5 : 1)
    else if (k === 'i') markIn()
    else if (k === 'o') markOut()
    else if (k === 'enter') addFromMarks()
    else if (k === 's') splitActive()
    else if (k === 'escape') clearMarks()
    else if (k === 'delete' || k === 'backspace') activeId.value && removeSegment(activeId.value)
    else if (k === '=' || k === '+') zoom.value = Math.min(32, zoom.value * 2)
    else if (k === '-') zoom.value = Math.max(1, zoom.value / 2)
    else return false
    return true
  })()
  if (handled) e.preventDefault()
}

// ---------------- lifecycle ----------------
onMounted(async () => {
  loadSettings()
  await initDefaultOutputDir()
  window.addEventListener('keydown', onKey)
  // Deep link: /live-slicer?path=<video> opens that file straight away.
  const linked = String(route.query.path || '').trim()
  if (linked) void openSource(linked)
  offProgress = window.api.liveSlicer.onProgress((p) => {
    if (p.kind === 'analyze' && p.jobId === analyzeJobId.value) analyzeProgress.value = Number(p.fraction) || 0
    if (p.kind === 'export' && p.jobId === exportJobId.value) {
      exportProgress.index = Number(p.index) || 0
      exportProgress.total = Number(p.total) || exportProgress.total
      exportProgress.fraction = Number(p.fraction) || 0
      if (p.result) exportResults.value = [...exportResults.value.filter((r) => r.id !== p.result.id), p.result]
    }
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  offProgress?.()
  cancelAnimationFrame(rafId)
  window.clearTimeout(toastTimer)
  window.clearTimeout(saveTimer)
  saveProject()
  void cancelAnalyze()
})

watch(activeId, async (id) => {
  if (!id) return
  await nextTick()
  document.querySelector(`[data-seg-row="${id}"]`)?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <div class="live-slicer-page ls" data-testid="live-slicer-page">
    <div class="vg-scope ls-main">
      <!-- ============ head ============ -->
      <header class="ls-head">
        <div class="ls-head__icon"><Scissors :size="20" /></div>
        <div class="ls-head__text">
          <h1>{{ t('slicer.title') }}</h1>
          <p>{{ t('slicer.desc') }}</p>
        </div>
        <div class="ls-head__actions">
          <span class="vg-pill vg-pill--dot" :class="statusPill.tone" data-testid="live-slicer-status">{{ statusPill.text }}</span>
          <button v-if="source" class="vg-btn" type="button" :disabled="loadingSource || exporting" @click="pickVideo">
            <Upload :size="14" />{{ t('slicer.actions.changeVideo') }}
          </button>
        </div>
      </header>

      <!-- ============ empty state: import ============ -->
      <section
        v-if="!source"
        class="ls-drop"
        :class="{ 'is-over': dragOver }"
        data-testid="live-slicer-drop"
        @click="pickVideo"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
      >
        <div class="ls-drop__icon">
          <Loader2 v-if="loadingSource" :size="34" class="vg-spin" />
          <CloudUpload v-else :size="34" />
        </div>
        <h2>{{ t('slicer.upload.title') }}</h2>
        <p>{{ t('slicer.upload.formats') }}</p>
        <button class="vg-btn vg-btn--primary vg-btn--lg" type="button" :disabled="loadingSource" @click.stop="pickVideo">
          <FileVideo :size="16" />{{ t('slicer.upload.choose') }}
        </button>
        <div class="ls-steps">
          <div class="ls-step">
            <span class="ls-step__num">1</span>
            <div><b>{{ t('slicer.steps.analyzeTitle') }}</b><small>{{ t('slicer.steps.analyzeDesc') }}</small></div>
          </div>
          <div class="ls-step">
            <span class="ls-step__num">2</span>
            <div><b>{{ t('slicer.steps.editTitle') }}</b><small>{{ t('slicer.steps.editDesc') }}</small></div>
          </div>
          <div class="ls-step">
            <span class="ls-step__num">3</span>
            <div><b>{{ t('slicer.steps.exportTitle') }}</b><small>{{ t('slicer.steps.exportDesc') }}</small></div>
          </div>
        </div>
      </section>

      <!-- ============ workspace ============ -->
      <div v-else class="ls-grid">
        <div class="ls-col">
          <!-- player -->
          <article class="ls-box ls-player">
            <div class="ls-video" @click="togglePlay">
              <video
                ref="videoEl"
                :src="videoUrl"
                preload="metadata"
                @play="onPlay"
                @pause="onPause"
                @seeked="currentTime = videoEl?.currentTime ?? currentTime"
                @loadedmetadata="videoEl && (videoEl.playbackRate = playbackRate)"
              />
              <div v-if="activeSegment && clipRange" class="ls-video__flag">
                <Film :size="12" />{{ activeSegment.title }}
              </div>
            </div>

            <div class="ls-transport">
              <div class="ls-transport__group">
                <button class="vg-icon-btn" type="button" :title="t('slicer.player.back5')" @click="nudge(-5)"><SkipBack :size="16" /></button>
                <button class="ls-play" type="button" :title="t('slicer.player.playPause')" data-testid="live-slicer-play" @click="togglePlay">
                  <Pause v-if="playing" :size="18" /><Play v-else :size="18" />
                </button>
                <button class="vg-icon-btn" type="button" :title="t('slicer.player.fwd5')" @click="nudge(5)"><SkipForward :size="16" /></button>
                <span class="ls-time vg-num">{{ formatTime(currentTime, true) }} <em>/ {{ formatTime(duration) }}</em></span>
              </div>

              <div class="ls-transport__group">
                <button class="vg-btn vg-btn--sm" :class="{ 'is-active': inPoint != null }" type="button" :title="t('slicer.player.markInKey')" @click="markIn">
                  <Flag :size="13" />{{ t('slicer.player.markIn') }}<em v-if="inPoint != null" class="ls-kbd-val">{{ formatTime(inPoint, true) }}</em>
                </button>
                <button class="vg-btn vg-btn--sm" :class="{ 'is-active': outPoint != null }" type="button" :title="t('slicer.player.markOutKey')" @click="markOut">
                  <Flag :size="13" />{{ t('slicer.player.markOut') }}<em v-if="outPoint != null" class="ls-kbd-val">{{ formatTime(outPoint, true) }}</em>
                </button>
                <button class="vg-btn vg-btn--sm vg-btn--primary" type="button" :disabled="!canAddFromMarks && inPoint == null" data-testid="live-slicer-add-marks" @click="addFromMarks">
                  <Plus :size="13" />{{ t('slicer.player.addClip') }}
                </button>
                <button class="vg-btn vg-btn--sm" type="button" :title="t('slicer.player.addAtPlayheadHint')" @click="addAtPlayhead">
                  <Plus :size="13" />{{ t('slicer.player.addAtPlayhead') }}
                </button>
              </div>

              <div class="ls-transport__group">
                <button class="vg-icon-btn" :class="{ 'is-active': loopClip }" type="button" :title="t('slicer.player.loop')" @click="loopClip = !loopClip"><Repeat :size="15" /></button>
                <select v-model.number="playbackRate" class="vg-select vg-select--sm ls-rate" :title="t('slicer.player.speed')">
                  <option v-for="r in [0.5, 1, 1.5, 2, 4]" :key="r" :value="r">{{ r }}×</option>
                </select>
              </div>
            </div>
          </article>

          <!-- timeline -->
          <article class="ls-box ls-box--flush">
            <div class="ls-bar">
              <h3><Rows3 :size="15" />{{ t('slicer.timeline.title') }}</h3>
              <div class="ls-legend">
                <span><i class="ls-legend__energy" />{{ t('slicer.timeline.energy') }}</span>
                <span><i class="ls-legend__scene" />{{ t('slicer.timeline.scene') }}</span>
                <span><i class="ls-legend__clip" />{{ t('slicer.timeline.clip') }}</span>
              </div>
              <div class="ls-bar__actions">
                <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="zoom <= 1" :title="t('slicer.timeline.zoomOut')" @click="zoom = Math.max(1, zoom / 2)"><ZoomOut :size="14" /></button>
                <span class="ls-zoom vg-num">{{ zoom }}×</span>
                <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="zoom >= 32" :title="t('slicer.timeline.zoomIn')" @click="zoom = Math.min(32, zoom * 2)"><ZoomIn :size="14" /></button>
              </div>
            </div>
            <div class="ls-tl-wrap">
              <LiveSlicerTimeline
                ref="timelineRef"
                :duration="duration"
                :energy="analysis?.energy || []"
                :scenes="analysis?.scenes || []"
                :segments="timelineSegments"
                :active-id="activeId"
                :current-time="currentTime"
                :in-point="inPoint"
                :out-point="outPoint"
                :zoom="zoom"
                :playing="playing"
                @seek="seek"
                @select="selectSegment"
                @update="updateRange"
              />
              <div v-if="!analysis && !analyzing" class="ls-tl-hint">
                <Wand2 :size="14" />{{ t('slicer.timeline.noAnalysis') }}
              </div>
            </div>
            <div class="ls-shortcuts">
              <span><kbd>Space</kbd>{{ t('slicer.keys.play') }}</span>
              <span><kbd>←</kbd><kbd>→</kbd>{{ t('slicer.keys.seek') }}</span>
              <span><kbd>I</kbd><kbd>O</kbd>{{ t('slicer.keys.mark') }}</span>
              <span><kbd>Enter</kbd>{{ t('slicer.keys.add') }}</span>
              <span><kbd>S</kbd>{{ t('slicer.keys.split') }}</span>
              <span><kbd>Del</kbd>{{ t('slicer.keys.delete') }}</span>
              <span><kbd>+</kbd><kbd>-</kbd>{{ t('slicer.keys.zoom') }}</span>
            </div>
          </article>

          <!-- active clip editor -->
          <article v-if="activeSegment" class="ls-box ls-editor" data-testid="live-slicer-editor">
            <span class="ls-editor__idx">{{ indexOf[activeSegment.id] }}</span>
            <input v-model="activeSegment.title" class="vg-input ls-editor__title" :placeholder="t('slicer.editor.titlePlaceholder')" />
            <div class="ls-edge">
              <label>{{ t('slicer.editor.start') }}</label>
              <button class="vg-icon-btn vg-icon-btn--sm" type="button" @click="setActiveEdge('start', activeSegment.start - 0.5)">−</button>
              <span class="vg-num">{{ formatTime(activeSegment.start, true) }}</span>
              <button class="vg-icon-btn vg-icon-btn--sm" type="button" @click="setActiveEdge('start', activeSegment.start + 0.5)">+</button>
              <button class="vg-btn vg-btn--xs" type="button" :title="t('slicer.editor.fromPlayhead')" @click="setActiveEdge('start', currentTime)"><ChevronsLeftRight :size="12" />{{ t('slicer.editor.playhead') }}</button>
            </div>
            <div class="ls-edge">
              <label>{{ t('slicer.editor.end') }}</label>
              <button class="vg-icon-btn vg-icon-btn--sm" type="button" @click="setActiveEdge('end', activeSegment.end - 0.5)">−</button>
              <span class="vg-num">{{ formatTime(activeSegment.end, true) }}</span>
              <button class="vg-icon-btn vg-icon-btn--sm" type="button" @click="setActiveEdge('end', activeSegment.end + 0.5)">+</button>
              <button class="vg-btn vg-btn--xs" type="button" :title="t('slicer.editor.fromPlayhead')" @click="setActiveEdge('end', currentTime)"><ChevronsLeftRight :size="12" />{{ t('slicer.editor.playhead') }}</button>
            </div>
            <span class="vg-chip vg-num">{{ formatDuration(activeSegment.end - activeSegment.start) }}</span>
            <div class="ls-editor__actions">
              <button class="vg-btn vg-btn--sm" type="button" @click="playSegment(activeSegment)"><Play :size="13" />{{ t('slicer.editor.preview') }}</button>
              <button class="vg-btn vg-btn--sm" type="button" :title="t('slicer.keys.split')" @click="splitActive"><SplitSquareHorizontal :size="13" />{{ t('slicer.editor.split') }}</button>
              <button class="vg-icon-btn vg-icon-btn--danger" type="button" :title="t('slicer.editor.delete')" @click="removeSegment(activeSegment.id)"><Trash2 :size="15" /></button>
            </div>
          </article>

          <!-- clip list -->
          <article class="ls-box ls-box--flush" data-testid="live-slicer-clips">
            <div class="ls-bar">
              <h3>
                <Film :size="15" />{{ t('slicer.clips.title') }}<em>{{ segments.length }}</em>
              </h3>
              <span class="ls-bar__meta vg-num">{{ t('slicer.clips.selectedMeta', { n: selectedSegments.length, dur: formatDuration(selectedDuration) }) }}</span>
              <div class="ls-bar__actions">
                <div class="ls-seg">
                  <button type="button" :class="{ 'is-active': sortBy === 'time' }" @click="sortBy = 'time'">{{ t('slicer.clips.sortTime') }}</button>
                  <button type="button" :class="{ 'is-active': sortBy === 'score' }" @click="sortBy = 'score'">{{ t('slicer.clips.sortScore') }}</button>
                </div>
              </div>
            </div>

            <div v-if="segments.length" class="ls-listbar">
              <label class="ls-check">
                <input type="checkbox" :checked="allSelected" @change="toggleAll" />{{ t('slicer.clips.selectAll') }}
              </label>
              <span class="vg-toolbar__spacer" />
              <button class="vg-btn vg-btn--xs" type="button" :disabled="selectedSegments.length < 2" @click="mergeSelected"><Merge :size="12" />{{ t('slicer.clips.merge') }}</button>
              <button class="vg-btn vg-btn--xs" type="button" :disabled="!selectedSegments.length" @click="copyTimecodes"><ClipboardCopy :size="12" />{{ t('slicer.clips.copyTimecodes') }}</button>
              <button class="vg-btn vg-btn--xs vg-btn--danger" type="button" :disabled="!selectedSegments.length" @click="removeSelected"><Trash2 :size="12" />{{ t('slicer.clips.removeSelected') }}</button>
              <button class="vg-btn vg-btn--xs vg-btn--ghost" type="button" @click="clearAll"><X :size="12" />{{ t('slicer.clips.clear') }}</button>
            </div>

            <div v-if="!segments.length" class="vg-empty">
              <div class="vg-empty__icon"><Combine :size="24" /></div>
              <h3>{{ t('slicer.clips.emptyTitle') }}</h3>
              <p>{{ t('slicer.clips.emptyDesc') }}</p>
            </div>
            <div v-else class="ls-rows">
              <div
                v-for="seg in listed"
                :key="seg.id"
                class="ls-row"
                :class="{ 'is-active': seg.id === activeId, 'is-off': !seg.selected }"
                :data-seg-row="seg.id"
                @click="selectSegment(seg.id); seek(seg.start)"
              >
                <input v-model="seg.selected" type="checkbox" @click.stop />
                <div class="ls-thumb" @click.stop="playSegment(seg)">
                  <img v-if="thumbOf(seg)" :src="thumbOf(seg)" alt="" loading="lazy" />
                  <Film v-else :size="16" />
                  <span class="ls-thumb__play"><Play :size="14" /></span>
                  <span class="ls-thumb__dur vg-num">{{ formatDuration(seg.end - seg.start) }}</span>
                </div>
                <div class="ls-row__main">
                  <div class="ls-row__title">
                    <span class="ls-row__idx">{{ indexOf[seg.id] }}</span>
                    <input v-model="seg.title" class="ls-row__name" @click.stop />
                    <span v-if="seg.origin === 'manual'" class="vg-pill vg-pill--violet ls-row__origin">{{ t('slicer.clips.manual') }}</span>
                  </div>
                  <div class="ls-row__sub vg-num">
                    {{ formatTime(seg.start, true) }} → {{ formatTime(seg.end, true) }}
                    <template v-if="resultFor(seg.id)">
                      <span v-if="resultFor(seg.id)?.ok" class="ls-row__done"><CheckCircle2 :size="12" />{{ t('slicer.clips.exported') }}</span>
                      <span v-else class="ls-row__fail" :title="resultFor(seg.id)?.error"><AlertTriangle :size="12" />{{ t('slicer.clips.failed') }}</span>
                    </template>
                  </div>
                </div>
                <div v-if="seg.score != null" class="ls-score" :title="t('slicer.clips.scoreHint')">
                  <div class="ls-score__bar"><i :style="{ width: `${seg.score}%` }" /></div>
                  <b class="vg-num">{{ seg.score }}</b>
                </div>
                <div class="ls-row__actions">
                  <button v-if="resultFor(seg.id)?.ok" class="vg-icon-btn vg-icon-btn--sm" type="button" :title="t('slicer.clips.openFile')" @click.stop="openPath(resultFor(seg.id)?.outputPath || '')"><FolderOpen :size="14" /></button>
                  <button class="vg-icon-btn vg-icon-btn--sm" type="button" :title="t('slicer.editor.preview')" @click.stop="playSegment(seg)"><Play :size="14" /></button>
                  <button class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" type="button" :title="t('slicer.editor.delete')" @click.stop="removeSegment(seg.id)"><Trash2 :size="14" /></button>
                </div>
              </div>
            </div>
          </article>
        </div>

        <!-- ============ sidebar ============ -->
        <aside class="ls-col ls-side">
          <!-- source -->
          <article class="ls-box">
            <div class="ls-box__head">
              <h2><FileVideo :size="16" />{{ t('slicer.source.title') }}</h2>
              <button class="vg-link" type="button" @click="openPath(source.path)">{{ t('slicer.source.open') }}</button>
            </div>
            <div class="ls-file" :title="source.path">{{ source.fileName }}</div>
            <dl class="ls-facts">
              <template v-for="f in sourceFacts" :key="f.k">
                <dt>{{ f.k }}</dt>
                <dd class="vg-num">{{ f.v }}</dd>
              </template>
            </dl>
            <div v-if="!source.hasAudio" class="vg-notice vg-notice--warning">
              <AlertTriangle :size="14" /><span>{{ t('slicer.source.noAudioHint') }}</span>
            </div>
          </article>

          <!-- detection -->
          <article class="ls-box">
            <div class="ls-box__head">
              <h2><Sparkles :size="16" />{{ t('slicer.analysis.title') }}</h2>
              <button class="vg-link vg-link--muted" type="button" @click="resetParams"><RotateCcw :size="11" />{{ t('slicer.analysis.reset') }}</button>
            </div>

            <div class="ls-modes">
              <button
                v-for="m in modeCards"
                :key="m.id"
                type="button"
                class="ls-mode"
                :class="{ 'is-active': mode === m.id }"
                :data-testid="`live-slicer-mode-${m.id}`"
                @click="mode = m.id"
              >
                <component :is="m.icon" :size="16" />
                <b>{{ m.title }}</b>
                <small>{{ m.desc }}</small>
              </button>
            </div>

            <template v-if="mode === 'highlight' || mode === 'pause'">
              <div class="vg-form-grid">
                <div class="vg-field">
                  <label>{{ t('slicer.analysis.minDuration') }}</label>
                  <input v-model.number="params.minSec" class="vg-input" type="number" min="3" max="600" />
                </div>
                <div class="vg-field">
                  <label>{{ t('slicer.analysis.maxDuration') }}</label>
                  <input v-model.number="params.maxSec" class="vg-input" type="number" min="3" max="900" />
                </div>
              </div>
              <div class="ls-presets">
                <button v-for="p in [[8, 20], [15, 60], [30, 90], [60, 180]]" :key="p.join('-')" type="button" :class="{ 'is-active': params.minSec === p[0] && params.maxSec === p[1] }" @click="params.minSec = p[0]; params.maxSec = p[1]">
                  {{ p[0] }}–{{ p[1] }}s
                </button>
              </div>
            </template>

            <template v-if="mode === 'highlight'">
              <div class="vg-field">
                <label class="ls-field-label">{{ t('slicer.analysis.maxClips') }}<b class="vg-num">{{ params.maxClips }}</b></label>
                <input v-model.number="params.maxClips" class="ls-range" type="range" min="1" max="100" step="1" />
              </div>
              <div class="vg-field">
                <label class="ls-field-label">{{ t('slicer.analysis.sensitivity') }}<b>{{ params.sensitivity < 0.34 ? t('slicer.analysis.low') : params.sensitivity < 0.67 ? t('slicer.analysis.medium') : t('slicer.analysis.high') }}</b></label>
                <input v-model.number="params.sensitivity" class="ls-range" type="range" min="0" max="1" step="0.05" />
                <span class="vg-field__hint">{{ t('slicer.analysis.sensitivityHint') }}</span>
              </div>
            </template>

            <template v-if="mode === 'interval'">
              <div class="vg-field">
                <label>{{ t('slicer.analysis.interval') }}</label>
                <input v-model.number="params.intervalSec" class="vg-input" type="number" min="3" max="900" />
              </div>
              <label class="vg-switch" :class="{ 'is-on': params.skipSilence }" @click.prevent="params.skipSilence = !params.skipSilence">
                <span class="vg-switch__track" />{{ t('slicer.analysis.skipSilence') }}
              </label>
            </template>

            <div v-if="mode === 'manual'" class="vg-notice">
              <Hand :size="14" /><span>{{ t('slicer.analysis.manualTip') }}</span>
            </div>

            <div v-if="analyzing" class="ls-analyzing">
              <div class="vg-progress">
                <div class="vg-progress__bar"><div class="vg-progress__fill" :style="{ width: `${Math.round(analyzeProgress * 100)}%` }" /></div>
                <span>{{ Math.round(analyzeProgress * 100) }}%</span>
              </div>
              <small>{{ t('slicer.analysis.analyzingHint') }}</small>
              <button class="vg-btn vg-btn--sm vg-btn--block" type="button" @click="cancelAnalyze"><X :size="13" />{{ t('slicer.actions.cancel') }}</button>
            </div>
            <template v-else>
              <button
                v-if="mode !== 'manual'"
                class="vg-btn vg-btn--primary vg-btn--block"
                type="button"
                data-testid="live-slicer-generate"
                @click="generate"
              >
                <Wand2 :size="15" />{{ analysis || mode === 'interval' ? t('slicer.analysis.generate') : t('slicer.analysis.start') }}
              </button>
              <button v-if="analysis && mode !== 'interval'" class="vg-link vg-link--muted ls-reanalyze" type="button" @click="runAnalyze(false)">
                <RotateCcw :size="11" /> {{ t('slicer.analysis.reanalyze') }}
              </button>
              <small v-if="segments.some((s) => s.origin === 'manual') && mode !== 'manual'" class="vg-field__hint">{{ t('slicer.analysis.keepManual') }}</small>
            </template>
          </article>

          <!-- export -->
          <article class="ls-box" data-testid="live-slicer-export">
            <div class="ls-box__head">
              <h2><Crop :size="16" />{{ t('slicer.export.title') }}</h2>
            </div>

            <div class="vg-field">
              <label>{{ t('slicer.export.cutMode') }}</label>
              <div class="ls-seg ls-seg--fill">
                <button type="button" :class="{ 'is-active': exportOpts.cutMode === 'precise' }" @click="exportOpts.cutMode = 'precise'">{{ t('slicer.export.precise') }}</button>
                <button type="button" :class="{ 'is-active': exportOpts.cutMode === 'fast' }" @click="exportOpts.cutMode = 'fast'">{{ t('slicer.export.fast') }}</button>
              </div>
              <span class="vg-field__hint">{{ fastMode ? t('slicer.export.fastHint') : t('slicer.export.preciseHint') }}</span>
            </div>

            <template v-if="!fastMode">
              <div class="vg-field">
                <label>{{ t('slicer.export.aspect') }}</label>
                <div class="ls-aspects">
                  <button v-for="a in aspectOptions" :key="a.id" type="button" :class="{ 'is-active': exportOpts.aspect === a.id }" @click="exportOpts.aspect = a.id">
                    <i :class="`ls-ar ls-ar--${a.id.replace(':', 'x').replace('-', '_')}`" />{{ a.label }}
                  </button>
                </div>
              </div>
              <div class="vg-form-grid">
                <div class="vg-field">
                  <label>{{ t('slicer.export.resolution') }}</label>
                  <select v-model="exportOpts.resolution" class="vg-select">
                    <option value="1080">1080P</option>
                    <option value="720">720P</option>
                    <option value="source">{{ t('slicer.export.sourceQuality') }}</option>
                  </select>
                </div>
                <div class="vg-field">
                  <label>{{ t('slicer.export.padding') }}</label>
                  <select v-model.number="exportOpts.padding" class="vg-select">
                    <option v-for="p in [0, 0.5, 1, 2, 3]" :key="p" :value="p">{{ p ? `± ${p}s` : t('slicer.export.noPadding') }}</option>
                  </select>
                </div>
              </div>
              <div class="ls-switches">
                <label class="vg-switch" :class="{ 'is-on': exportOpts.fade }" @click.prevent="exportOpts.fade = !exportOpts.fade">
                  <span class="vg-switch__track" />{{ t('slicer.export.fade') }}
                </label>
                <label class="vg-switch" :class="{ 'is-on': exportOpts.normalizeAudio }" @click.prevent="exportOpts.normalizeAudio = !exportOpts.normalizeAudio">
                  <span class="vg-switch__track" />{{ t('slicer.export.loudnorm') }}
                </label>
              </div>
            </template>

            <div class="vg-field">
              <label>{{ t('slicer.export.namePrefix') }}</label>
              <input v-model="exportOpts.namePrefix" class="vg-input" :placeholder="source.fileName.replace(/\.[^.]+$/, '')" />
            </div>

            <div class="vg-field">
              <label>{{ t('slicer.export.outputDir') }}</label>
              <div class="ls-dir">
                <input v-model="exportOpts.outputDir" class="vg-input" />
                <button class="vg-btn" type="button" :title="t('slicer.pickers.outputDir')" @click="pickOutputDir"><Folder :size="14" /></button>
              </div>
              <label class="vg-switch" :class="{ 'is-on': exportOpts.subFolder }" @click.prevent="exportOpts.subFolder = !exportOpts.subFolder">
                <span class="vg-switch__track" /><small>{{ t('slicer.export.subFolder') }}</small>
              </label>
            </div>

            <div v-if="exporting" class="ls-analyzing">
              <div class="ls-progress-head vg-num">
                <span>{{ t('slicer.export.progress', { n: exportProgress.index + 1, total: exportProgress.total }) }}</span>
                <b>{{ exportOverall }}%</b>
              </div>
              <div class="vg-progress">
                <div class="vg-progress__bar"><div class="vg-progress__fill" :style="{ width: `${exportOverall}%` }" /></div>
              </div>
              <button class="vg-btn vg-btn--sm vg-btn--block" type="button" @click="cancelExport"><X :size="13" />{{ t('slicer.actions.cancel') }}</button>
            </div>
            <button
              v-else
              class="vg-btn vg-btn--primary vg-btn--block vg-btn--lg"
              type="button"
              data-testid="live-slicer-export-btn"
              :disabled="!selectedSegments.length"
              @click="startExport"
            >
              <Scissors :size="16" />{{ t('slicer.export.start', { n: selectedSegments.length }) }}
            </button>

            <div v-if="exportDir && !exporting" class="ls-result">
              <div class="ls-result__line">
                <CheckCircle2 :size="15" />
                <span>{{ t('slicer.export.resultLine', { ok: exportOk.length, failed: exportFailed.length }) }}</span>
              </div>
              <div class="ls-result__path" :title="exportDir">{{ basename(exportDir) }}</div>
              <button class="vg-btn vg-btn--sm vg-btn--block" type="button" @click="openPath(exportDir)"><FolderOpen :size="13" />{{ t('slicer.export.openDir') }}</button>
              <button v-if="exportOk.length" class="vg-btn vg-btn--sm vg-btn--primary vg-btn--block" type="button" :disabled="sendingToPublish" data-testid="live-slicer-send-publish" @click="sendClipsToPublish">
                <Loader2 v-if="sendingToPublish" :size="13" class="ls-spin" /><CloudUpload v-else :size="13" />{{ t('slicer.export.sendToPublish', { n: exportOk.length }) }}
              </button>
              <small class="ls-result__hint">{{ t('slicer.export.sendToPublishHint') }}</small>
            </div>
          </article>
        </aside>
      </div>
    </div>

    <transition name="vg-toast">
      <div v-if="toast" class="vg-scope vg-toast" :class="toast.kind === 'error' ? 'vg-toast--error' : 'vg-toast--success'">
        <AlertTriangle v-if="toast.kind === 'error'" :size="15" /><CheckCircle2 v-else :size="15" />
        <span>{{ toast.text }}</span>
      </div>
    </transition>
  </div>
</template>
