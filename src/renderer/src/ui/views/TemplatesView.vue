<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import RangeInput from '../components/RangeInput.vue'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Film,
  FolderOpen,
  GripVertical,
  Layers,
  LayoutTemplate,
  Loader2,
  Play,
  Plus,
  Scissors,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-vue-next'
import { thumbnailUrl } from '@/lib/localMedia'
import {
  ASS_DEFAULT_FONT_FAMILY,
  ASS_DEFAULT_FONT_SIZE,
  ASS_DEFAULT_TITLE_MARGIN_V,
  ASS_DEFAULT_TTS_MARGIN_V,
} from '../../../../shared/assDefaults'
import {
  cloneDefaultOverlaySymbolTemplates,
  loadOverlaySymbolTemplates,
  normalizeOverlaySymbolTemplates,
  saveOverlaySymbolTemplates,
  type OverlaySymbolTemplateItem,
} from '@/lib/overlaySymbolTemplates'
import {
  groupRowsToPool,
  migratePoolToGroupRows,
  type TitleOverlayGroupRow,
} from '@/lib/titleOverlayGroups'

const { t: tr, locale } = useI18n()
const route = useRoute()
const router = useRouter()

type SegmentKey = string
type TemplateWorkspace = 'structure' | 'audio' | 'subtitle_voice' | 'visual'
const TEMPLATE_WORKSPACES: TemplateWorkspace[] = ['structure', 'audio', 'subtitle_voice', 'visual']
type TemplatePresetKey = 'natural' | 'fast' | 'cinematic'
type Template = {
  id: string
  name: string
  meta?: {
    source?: 'clone_blueprint' | 'video_ai'
    cloneProjectId?: string
    sourceVideoName?: string
    sourceDurationSec?: number
    aspectRatio?: string
    summary?: string
    sellingLogic?: string
    hookLine?: string
    ctaLine?: string
    referenceShots?: Array<{
      index: number
      segment: string
      startSec: number
      durationSec: number
      motion: string
      transitionIn: string
      scriptText: string
      onScreenText: string
      visual: string
      thumbnailPath?: string
    }>
    hookType?: string
    productCategory?: string
    rhythm?: {
      avgShotDurationSec?: number
      cutDensity?: string
      first3SecShotCount?: number
      hasFastCut?: boolean
    }
    visualStyle?: {
      scene?: string
      lighting?: string
      cameraStyle?: string
      movementStyle?: string
      realismStyle?: string
    }
  }
  structure: SegmentKey[]
  segmentSyncMode?: 'follow_product' | 'fixed'
  totalDurationSec: { min: number; max: number }
  skipStartSec?: number
  segmentDurationSec: Partial<Record<SegmentKey, { min: number; max: number }>>
  segmentFx?: Partial<
    Record<
      SegmentKey,
      {
        zoom?: { min: number; max: number }
        move?: { x: { min: number; max: number }; y: { min: number; max: number } }
      }
    >
  >
  randomizeOrder?: { mode: 'none' | 'partial'; keepFirstCount?: number }
  bgm?: { filePaths: string[]; volume: number } | null
  // Deprecated field: random drawtext subtitle pool.
  subtitle?: { enabled: boolean; pool: string[]; x?: string; y?: string; fontSize?: number }
  // On-screen title without narration.
  titleOverlay?: { enabled: boolean; textPool: string[] } | null
  // Optional Edge-TTS narration.
  tts?: {
    enabled: boolean
    textPool: string[]
    voice: string
    rate?: string
    pitch?: string
    ttsVolume?: string
    mixVolume: number
    keepOriginal: boolean
  }
  // ASS subtitles with advanced layout.
  assSubtitle?: {
    enabled: boolean
    fontName: string
    fontSize: number
    preset: 'yellow_box' | 'white_shadow'
    marginV: number
    ttsMarginV?: number
  }
  transition?: { enabled: boolean; type: 'fade'; durationSec: { min: number; max: number } }
  audio?: { ducking: { enabled: boolean; amountDb: number } }
  jitter?: {
    speed?: { enabled: boolean; range: { min: number; max: number } }
    color?: {
      enabled: boolean
      brightness: { min: number; max: number }
      contrast: { min: number; max: number }
      saturation: { min: number; max: number }
      hueDeg: { min: number; max: number }
    }
  }
  /** Global base color grading values. */
  colorGrade?: { enabled: boolean; brightness: number; contrast: number; saturation: number } | null
  /** Aspect-ratio normalization mode. */
  aspectUnifyMode?: 'contain_pad' | 'cover_crop' | null
  /** 3D LUT filter using .cube files. */
  lut3d?: { fileName: string } | null
  /** Color stickers using PNG or WebP files. */
  sticker?: { ref?: string; fileName: string; heightPx: number } | null
  createdAt: number
  updatedAt: number
}

type FontChoice = {
  fileName: string
  sourceFile?: string
  familyName: string
  renderReady?: boolean
  message?: string
}
type StyleAnalyzeSummary = {
  sourceDir: string
  fileCount: number
  sampledForCut: number
  durationAvgSec: number
  durationMedianSec: number
  durationMinSec: number
  durationMaxSec: number
  fpsAvg: number
  mainResolution: string
  vBitrateAvgKbps: number
  audioPresentRate: number
  cutsPer10sAvg: number
  cutTendency: 'steady_single_shot' | 'mixed' | 'fast_cut'
}

const list = ref<Template[]>([])
const form = reactive<{ name: string }>({ name: '' })
const styleAnalyzeDir = ref('video')
const styleAnalyzing = ref(false)
const styleSummary = ref<StyleAnalyzeSummary | null>(null)
const expanded = ref<Record<string, boolean>>({})
const saving = ref<Record<string, boolean>>({})
const saveTimers = new Map<string, number>()
const activeTab = ref<Record<string, 'global' | 'color' | 'av_mix' | 'av_text' | 'segments'>>({})
const draggingSeg = ref<{ templateId: string; seg: SegmentKey } | null>(null)
const copyDraft = reactive<Record<string, string>>({})
const copyEditing = reactive<Record<string, boolean>>({})
/** On-screen title groups contain one title line and one symbol line. */
const titleGroupDraft = reactive<Record<string, TitleOverlayGroupRow[]>>({})
/** Brief UI feedback while normalizing the copy pool on blur. */
const copyPoolBusy = reactive<Record<string, boolean>>({})
const POOL_BLUR_UI_MS = 340
const workspace = ref<TemplateWorkspace>('structure')
const selectedTemplateId = ref('')
const voiceDraft = ref('zh-CN-XiaoxiaoNeural')
const presetPickerOpen = ref(false)
const presetTargetId = ref('')
const templateAdvancedOpen = ref(false)
const templateNewSegName = ref('')

const workspaceItems = computed(() => [
  { key: 'structure', label: tr('autoUi.k_77f5e221cfdc') },
  { key: 'audio', label: tr('autoUi.k_4e9a1b662b43') },
  { key: 'subtitle_voice', label: tr('autoUi.k_eff745cfdf12') },
  { key: 'visual', label: tr('autoUi.k_bdbbdbf8d8c5') },
])

const voiceQuickOptions = [
  'zh-CN-XiaoxiaoNeural',
  'zh-CN-YunxiNeural',
  'en-US-JennyNeural',
  'en-US-GuyNeural',
  'vi-VN-HoaiMyNeural',
  'vi-VN-NamMinhNeural',
]

const presetChoices = computed<Array<{ key: TemplatePresetKey; title: string; desc: string }>>(() => [
  { key: 'natural', title: tr('tpl.presetNaturalTitle'), desc: tr('tpl.presetNaturalDesc') },
  { key: 'fast', title: tr('tpl.presetFastTitle'), desc: tr('tpl.presetFastDesc') },
  { key: 'cinematic', title: tr('tpl.presetCinematicTitle'), desc: tr('tpl.presetCinematicDesc') },
])

const overlaySymbolTemplates = ref(loadOverlaySymbolTemplates())
const symbolLibOpen = ref(false)
const symbolLibDraft = ref<OverlaySymbolTemplateItem[]>([])

const defaultOverlayGroupSymbol = computed(() => overlaySymbolTemplates.value[0]?.text ?? '* * *')

const lutOptions = ref<Array<{ fileName: string; displayName: string }>>([])
const stickerOptions = ref<Array<{ ref: string; fileName: string; displayName: string; scope?: 'bundled' | 'user' }>>([])
const userStickerDir = ref('')
const userFontDir = ref('')
const userFontFiles = ref<string[]>([])
const userFontChoices = ref<FontChoice[]>([])
const bundledFontDir = ref('')
const bundledFontFiles = ref<string[]>([])
const bundledFontChoices = ref<FontChoice[]>([])
const renderableFontChoices = ref<FontChoice[]>([])

const assFontChoices = computed<FontChoice[]>(() => {
  const first = renderableFontChoices.value.length
    ? renderableFontChoices.value
    : [...bundledFontChoices.value, ...userFontChoices.value]
  const out: FontChoice[] = []
  const seen = new Set<string>()
  for (const x of first) {
    const fam = String(x.familyName ?? '').trim()
    if (!fam) continue
    const key = fam.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(x)
  }
  return out
})

const selectedTemplate = computed<Template | null>(() => {
  const id = String(selectedTemplateId.value ?? '')
  if (id) {
    const matched = list.value.find((x) => x.id === id)
    if (matched) return matched
  }
  return list.value[0] ?? null
})

const workspaceHint = computed(() => {
  if (workspace.value === 'structure') return tr('autoUi.k_c77bd5927d25')
  if (workspace.value === 'audio') return tr('autoUi.k_a9e7c32d3d47')
  if (workspace.value === 'subtitle_voice') return tr('autoUi.k_8c3e7119d9cd')
  return tr('autoUi.k_7d77db14142f')
})

async function refreshLuts() {
  try {
    lutOptions.value = (await window.api.luts.list()) ?? []
    // Keep the no-LUT option selected while asynchronous options render.
    // Trigger a reactive refresh without changing persisted data.
    for (const t of list.value) {
      if (!t.lut3d) t.lut3d = null
    }
  } catch {
    lutOptions.value = []
  }
}

async function refreshStickers() {
  try {
    stickerOptions.value = (await window.api.stickers.list()) ?? []
  } catch {
    stickerOptions.value = []
  }
}

function getStickerRefFromTemplate(t: Template): string {
  const ref = String(t.sticker?.ref ?? '').trim()
  if (ref) return ref
  const fileName = String(t.sticker?.fileName ?? '').trim()
  if (!fileName) return ''
  const matched = stickerOptions.value.find((x) => x.fileName === fileName)
  return matched?.ref ?? fileName
}

function findStickerOptionByRef(ref: string) {
  const raw = String(ref ?? '').trim()
  if (!raw) return null
  const exact = stickerOptions.value.find((x) => x.ref === raw)
  if (exact) return exact
  return stickerOptions.value.find((x) => x.fileName === raw) ?? null
}

async function refreshUserStickers() {
  try {
    const res = await window.api.stickers.listUser()
    userStickerDir.value = res?.dir ?? ''
  } catch {
    userStickerDir.value = ''
  }
}

async function importStickersFromDialog() {
  const paths = await window.api.pickFiles({
    title: tr('dialog.pickStickerFiles'),
    filters: [{ name: 'Sticker', extensions: ['png', 'webp'] }],
  })
  if (!paths?.length) return
  await window.api.stickers.import(paths)
  await refreshStickers()
  await refreshUserStickers()
}

async function refreshUserFonts() {
  try {
    const res = await window.api.fonts.list()
    bundledFontDir.value = res?.bundledDir ?? ''
    bundledFontFiles.value = Array.isArray(res?.bundledFiles) ? res.bundledFiles : []
    userFontDir.value = res?.userDir ?? ''
    userFontFiles.value = Array.isArray(res?.userFiles) ? res.userFiles : []
    bundledFontChoices.value = Array.isArray((res as any)?.bundledFonts) ? (res as any).bundledFonts : []
    userFontChoices.value = Array.isArray((res as any)?.userFonts) ? (res as any).userFonts : []
    renderableFontChoices.value = Array.isArray((res as any)?.renderableFamilies) ? (res as any).renderableFamilies : []
  } catch {
    userFontDir.value = ''
    userFontFiles.value = []
    bundledFontDir.value = ''
    bundledFontFiles.value = []
    bundledFontChoices.value = []
    userFontChoices.value = []
    renderableFontChoices.value = []
  }
}

async function importFontsFromDialog() {
  const paths = await window.api.pickFiles({
    title: tr('dialog.pickFontFiles'),
    filters: [{ name: 'Font', extensions: ['ttf', 'otf', 'ttc', 'woff2'] }],
  })
  if (!paths?.length) return
  const res: any = await window.api.fonts.import(paths)
  await refreshUserFonts()

  // Apply the imported family automatically when the template still uses the default font.
  try {
    const importedFonts = Array.isArray(res?.fonts) ? (res.fonts as FontChoice[]) : []
    const t = selectedTemplate.value as any
    if (!t) return
    const cur = String(t.assSubtitle?.fontName ?? '').trim()
    const isDefault = !cur || cur === ASS_DEFAULT_FONT_FAMILY || cur === 'Noto Sans SC'
    if (isDefault && importedFonts.length === 1) {
      const fam = String(importedFonts[0]?.familyName ?? '').trim()
      if (fam) {
        updateTemplate(t, { assSubtitle: { ...(t.assSubtitle as any), fontName: fam } })
      }
    }

    const warns = importedFonts
      .map((x) => String(x.message ?? '').trim())
      .filter((x) => x.length > 0 && /woff2|\u5efa\u8bae\u6539\u7528 ttf\/otf\/ttc/i.test(x))
    if (warns.length) {
      window.alert(warns.join('\n'))
    }
  } catch {
    // ignore
  }
}

function openSymbolLibModal() {
  symbolLibDraft.value = overlaySymbolTemplates.value.map((x) => ({ ...x }))
  symbolLibOpen.value = true
}

function cancelSymbolLibModal() {
  symbolLibOpen.value = false
}

function saveSymbolLibModal() {
  const next = normalizeOverlaySymbolTemplates(symbolLibDraft.value)
  overlaySymbolTemplates.value = next
  saveOverlaySymbolTemplates(next)
  symbolLibOpen.value = false
}

function resetSymbolLibModalDraft() {
  symbolLibDraft.value = cloneDefaultOverlaySymbolTemplates()
}

function addSymbolLibRow() {
  symbolLibDraft.value.push({
    id: crypto.randomUUID(),
    label: tr('tpl.symbolLibNewLabel'),
    text: '*',
  })
}

function removeSymbolLibRow(id: string) {
  symbolLibDraft.value = symbolLibDraft.value.filter((x) => x.id !== id)
}

function getTitleRows(t: Template): TitleOverlayGroupRow[] {
  if (!titleGroupDraft[t.id]?.length) {
    titleGroupDraft[t.id] = migratePoolToGroupRows(t.titleOverlay?.textPool ?? [])
  }
  return titleGroupDraft[t.id]!
}

function syncTitleGroupsFromTemplate(t: Template) {
  titleGroupDraft[t.id] = migratePoolToGroupRows(t.titleOverlay?.textPool ?? [])
}

function flushTitleGroups(t: Template) {
  const rows = getTitleRows(t)
  updateTemplate(t, {
    titleOverlay: {
      enabled: Boolean(t.titleOverlay?.enabled),
      textPool: groupRowsToPool(rows),
    },
  })
}

function addTitleGroup(t: Template) {
  const rows = getTitleRows(t)
  rows.push({ title: '', symbol: '' })
  flushTitleGroups(t)
}

function removeTitleGroup(t: Template, idx: number) {
  const rows = [...getTitleRows(t)]
  rows.splice(idx, 1)
  titleGroupDraft[t.id] = rows.length ? rows : [{ title: '', symbol: '' }]
  flushTitleGroups(t)
}

function insertOverlaySymbol(t: Template, symbolText: string) {
  const rows = getTitleRows(t)
  const last = rows[rows.length - 1]!
  last.symbol = (last.symbol ? `${last.symbol} ` : '') + symbolText
  flushTitleGroups(t)
}

function insertOverlayGroup(t: Template, symbolText: string) {
  const rows = getTitleRows(t)
  rows.push({ title: tr('tpl.overlayGroupTitlePh'), symbol: symbolText })
  flushTitleGroups(t)
}

async function blurCopyPool(t: Template) {
  copyEditing[t.id] = false
  copyPoolBusy[t.id] = true
  commitCopyDraft(t)
  await new Promise((r) => setTimeout(r, POOL_BLUR_UI_MS))
  copyPoolBusy[t.id] = false
}

function poolToText(pool: string[]) {
  return (pool ?? []).join('\n\n')
}

function textToPool(text: string) {
  const src = String(text ?? '').replace(/\r\n/g, '\n')
  // Split on separator lines so blank lines remain part of a subtitle entry.
  // A line containing only three hyphens separates entries; entries may contain blank lines.
  const normalized = src
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
  return normalized
    .split(/\n\s*---{3,}\s*\n/g)
    .map((block) => block.replace(/^\n+|\n+$/g, ''))
    .filter((x) => x.trim().length > 0)
}

function ensureCopyDraft(t: Template) {
  if (copyDraft[t.id] == null) copyDraft[t.id] = poolToText(t.tts?.textPool ?? [])
  return copyDraft[t.id]
}

function syncCopyDraftFromTemplate(t: Template) {
  if (copyEditing[t.id]) return
  copyDraft[t.id] = poolToText(t.tts?.textPool ?? [])
}

function commitCopyDraft(t: Template) {
  const text = copyDraft[t.id] ?? poolToText(t.tts?.textPool ?? [])
  updateTemplate(t, {
    tts: {
      enabled: t.tts?.enabled ?? false,
      textPool: textToPool(text),
      voice: t.tts?.voice ?? 'zh-CN-XiaoxiaoNeural',
      rate: t.tts?.rate ?? 'default',
      pitch: t.tts?.pitch ?? 'default',
      ttsVolume: t.tts?.ttsVolume ?? 'default',
      mixVolume: Number(t.tts?.mixVolume ?? 0.9),
      keepOriginal: Boolean(t.tts?.keepOriginal ?? true),
    } as any,
  })
  syncCopyDraftFromTemplate(t)
}

function cloneTemplate(t: Template): Template {
  // Clone the raw value before IPC serialization to avoid passing a Vue proxy.
  const raw = toRaw(t) as any
  try {
    return structuredClone(raw)
  } catch {
    return JSON.parse(JSON.stringify(raw)) as Template
  }
}

async function refresh() {
  list.value = await window.api.templates.list()
  for (const t of list.value) {
    syncCopyDraftFromTemplate(t)
    syncTitleGroupsFromTemplate(t)
  }
  // Initialize tabs before rendering to avoid recursive reactive updates.
  for (const t of list.value) {
    if (!activeTab.value[t.id]) activeTab.value[t.id] = 'global'
  }
  if (!selectedTemplateId.value && list.value[0]) {
    selectedTemplateId.value = list.value[0].id
  }
}

function selectTemplate(id: string) {
  selectedTemplateId.value = id
}

function openCloneWithTemplate(tpl: Template) {
  void router.push({
    path: '/clone',
    query: {
      templateId: tpl.id,
      fromTemplate: tpl.id,
      templateName: tpl.name,
    },
  })
}

function activateWorkspace(mode: string) {
  workspace.value = (TEMPLATE_WORKSPACES.includes(mode as TemplateWorkspace) ? mode : 'structure') as TemplateWorkspace
}

function applyWorkspaceFromRoute() {
  const q = String(route.query.ws ?? '').trim()
  if (!q) return
  if (TEMPLATE_WORKSPACES.includes(q as TemplateWorkspace)) {
    activateWorkspace(q)
  }
}

function applySubtitlePresetToSelected(preset: 'white_shadow' | 'yellow_box') {
  const t = selectedTemplate.value
  if (!t) return
  expanded.value[t.id] = true
  activeTab.value[t.id] = 'av_text'
  updateTemplate(t, {
    assSubtitle: {
      enabled: true,
      fontName: t.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY,
      fontSize: t.assSubtitle?.fontSize ?? ASS_DEFAULT_FONT_SIZE,
      preset,
      marginV: t.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V,
      ttsMarginV: t.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V,
    },
  })
}

function applyVoiceToSelected() {
  const t = selectedTemplate.value
  if (!t) return
  const voice = String(voiceDraft.value ?? '').trim()
  if (!voice) return
  expanded.value[t.id] = true
  activeTab.value[t.id] = 'av_text'
  updateTemplate(t, {
    tts: {
      enabled: t.tts?.enabled ?? true,
      textPool: t.tts?.textPool ?? [],
      voice,
      rate: t.tts?.rate ?? 'default',
      pitch: t.tts?.pitch ?? 'default',
      ttsVolume: t.tts?.ttsVolume ?? 'default',
      mixVolume: Number(t.tts?.mixVolume ?? 0.9),
      keepOriginal: Boolean(t.tts?.keepOriginal ?? true),
    },
  })
}

const presetTarget = computed<Template | null>(() => {
  const id = String(presetTargetId.value ?? '')
  if (!id) return null
  return list.value.find((x) => x.id === id) ?? null
})

function openPresetPicker(t: Template) {
  presetTargetId.value = t.id
  presetPickerOpen.value = true
}

function closePresetPicker() {
  presetPickerOpen.value = false
  presetTargetId.value = ''
}

function buildSegmentDurPatch(structure: string[], min: number, max: number) {
  const out: Record<string, { min: number; max: number }> = {}
  for (const seg of structure) out[seg] = { min, max }
  return out
}

function buildSegmentFxPatch(
  structure: string[],
  cfg: {
    zoomMin: number
    zoomMax: number
    moveXMin: number
    moveXMax: number
    moveYMin: number
    moveYMax: number
    allowHflip: boolean
  },
) {
  const out: Record<string, any> = {}
  for (const seg of structure) {
    out[seg] = {
      zoom: { min: cfg.zoomMin, max: cfg.zoomMax },
      move: {
        x: { min: cfg.moveXMin, max: cfg.moveXMax },
        y: { min: cfg.moveYMin, max: cfg.moveYMax },
      },
      allowHflip: cfg.allowHflip,
    }
  }
  return out
}

function applyTemplatePreset(key: TemplatePresetKey) {
  const t = presetTarget.value
  if (!t) return
  const structure = ensureStructure(t)
  const presetCommon = {
    structure,
    segmentSyncMode: t.segmentSyncMode ?? 'follow_product',
  }

  if (key === 'natural') {
    updateTemplate(t, {
      ...(presetCommon as any),
      totalDurationSec: { min: 8, max: 13 },
      skipStartSec: 1.2,
      randomizeOrder: { mode: 'partial', keepFirstCount: 1 },
      segmentDurationSec: buildSegmentDurPatch(structure, 1.2, 2.6),
      segmentFx: buildSegmentFxPatch(structure, {
        zoomMin: 1.0,
        zoomMax: 1.05,
        moveXMin: -0.03,
        moveXMax: 0.03,
        moveYMin: -0.02,
        moveYMax: 0.02,
        allowHflip: true,
      }),
      jitter: {
        ...(t.jitter ?? {}),
        speed: { enabled: true, range: { min: 0.99, max: 1.01 } },
        color: {
          enabled: true,
          brightness: { min: -0.01, max: 0.01 },
          contrast: { min: 0.99, max: 1.01 },
          saturation: { min: 0.99, max: 1.03 },
          hueDeg: { min: -1.2, max: 1.2 },
        },
      },
      transition: {
        enabled: true,
        pool: ['fade', 'slideleft', 'slideright'],
        durationSec: { min: 0.08, max: 0.18 },
      } as any,
      audio: { source: 'keep', ducking: { enabled: true, amountDb: 14 } } as any,
      aspectUnifyMode: 'contain_pad',
      colorGrade: { enabled: false, brightness: 0, contrast: 1, saturation: 1 },
    } as any)
  } else if (key === 'fast') {
    updateTemplate(t, {
      ...(presetCommon as any),
      totalDurationSec: { min: 6, max: 10 },
      skipStartSec: 0.8,
      randomizeOrder: { mode: 'partial', keepFirstCount: 0 },
      segmentDurationSec: buildSegmentDurPatch(structure, 0.8, 1.8),
      segmentFx: buildSegmentFxPatch(structure, {
        zoomMin: 1.02,
        zoomMax: 1.1,
        moveXMin: -0.06,
        moveXMax: 0.06,
        moveYMin: -0.04,
        moveYMax: 0.04,
        allowHflip: true,
      }),
      jitter: {
        ...(t.jitter ?? {}),
        speed: { enabled: true, range: { min: 0.97, max: 1.03 } },
        color: {
          enabled: true,
          brightness: { min: -0.02, max: 0.02 },
          contrast: { min: 0.98, max: 1.04 },
          saturation: { min: 1.0, max: 1.08 },
          hueDeg: { min: -2.5, max: 2.5 },
        },
      },
      transition: {
        enabled: true,
        pool: ['hardcut', 'fade', 'wipeup', 'squeezev', 'squeezeh'],
        durationSec: { min: 0.05, max: 0.12 },
      } as any,
      audio: { source: 'mute', ducking: { enabled: false, amountDb: 12 } } as any,
      aspectUnifyMode: 'cover_crop',
      colorGrade: { enabled: false, brightness: 0, contrast: 1, saturation: 1 },
    } as any)
  } else {
    updateTemplate(t, {
      ...(presetCommon as any),
      totalDurationSec: { min: 10, max: 15 },
      skipStartSec: 1.8,
      randomizeOrder: { mode: 'partial', keepFirstCount: 1 },
      segmentDurationSec: buildSegmentDurPatch(structure, 1.8, 3.6),
      segmentFx: buildSegmentFxPatch(structure, {
        zoomMin: 1.0,
        zoomMax: 1.04,
        moveXMin: -0.02,
        moveXMax: 0.02,
        moveYMin: -0.015,
        moveYMax: 0.015,
        allowHflip: false,
      }),
      jitter: {
        ...(t.jitter ?? {}),
        speed: { enabled: true, range: { min: 0.995, max: 1.005 } },
        color: {
          enabled: true,
          brightness: { min: -0.01, max: 0.01 },
          contrast: { min: 0.99, max: 1.02 },
          saturation: { min: 0.98, max: 1.03 },
          hueDeg: { min: -0.8, max: 0.8 },
        },
      },
      transition: {
        enabled: true,
        pool: ['fade', 'circlecrop', 'pixelize'],
        durationSec: { min: 0.12, max: 0.28 },
      } as any,
      audio: { source: 'keep', ducking: { enabled: true, amountDb: 12 } } as any,
      aspectUnifyMode: 'contain_pad',
      colorGrade: { enabled: true, brightness: -0.03, contrast: 1.05, saturation: 0.96 },
      assSubtitle: {
        enabled: true,
        fontName: t.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY,
        fontSize: t.assSubtitle?.fontSize ?? ASS_DEFAULT_FONT_SIZE,
        preset: 'white_shadow',
        marginV: t.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V,
        ttsMarginV: t.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V,
      },
    } as any)
  }

  expanded.value[t.id] = true
  activeTab.value[t.id] = 'global'
  closePresetPicker()
}

async function createTemplate() {
  const name = form.name.trim()
  if (!name) return
  const base = ['hook', 'show', 'detail']
  try {
    const created = await window.api.templates.upsert({ name, structure: base })
    if (created?.id) selectedTemplateId.value = created.id
    form.name = ''
    creatingOpen.value = false
    await refresh()
  } catch (e: any) {
    window.alert(e?.message ?? String(e))
  }
}

async function removeTemplate(id: string) {
  const target = list.value.find((x) => x.id === id)
  const ok = window.confirm(tr('autoUi.k_675f8d89e5ab', { p0: target?.name ?? id }))
  if (!ok) return
  await window.api.templates.remove(id)
  await refresh()
}

function templateHookTypeLabel(type?: string) {
  const map: Record<string, string> = {
    price: tr('autoUi.k_c3dfe5d60d08'),
    pain_point: tr('autoUi.k_e712d79bc38b'),
    before_after: tr('autoUi.k_4526138616f3'),
    curiosity: tr('autoUi.k_9b8782814cb7'),
    visual_impact: tr('autoUi.k_fb23cb9024bb'),
    social_proof: tr('autoUi.k_aff6583ba6f4'),
    style_showcase: tr('autoUi.k_ca03e807122f'),
    unknown: tr('autoUi.k_a45979d6c133'),
  }
  return map[String(type || '')] || tr('autoUi.k_a45979d6c133')
}

function templateDisplayName(template?: Template | null) {
  const name = String(template?.name || '').trim()
  return name === '\u57fa\u7840\u6a21\u677f' ? tr('tpl.defaultName') : name
}

function templateProductTypeLabel(type?: string) {
  const map: Record<string, string> = {
    earrings: tr('autoUi.k_d8d2597fceac'),
    phone_case: tr('autoUi.k_afabad5de2c2'),
    clothes: tr('autoUi.k_c430623070e3'),
    toy: tr('autoUi.k_dc0613dae17b'),
    general: tr('autoUi.k_3843dd0edcb0'),
  }
  return map[String(type || '')] || tr('autoUi.k_3843dd0edcb0')
}

async function analyzeVideosAndCreateTemplate() {
  if (styleAnalyzing.value) return
  styleAnalyzing.value = true
  try {
    const res = await window.api.style.analyzeVideos({ dir: styleAnalyzeDir.value.trim() || 'video' })
    styleSummary.value = (res as any)?.summary ?? null
    const suggested = ((res as any)?.suggestedTemplatePayload ?? {}) as Partial<Template> & {
      name?: string
      structure?: string[]
    }
    const baseStructure = ['hook', 'show', 'detail'] as string[]
    await window.api.templates.upsert({
      ...suggested,
      name: String(suggested.name ?? '').trim() || tr('autoUi.k_c6e2948d940f', { p0: Date.now() }),
      structure: Array.isArray(suggested.structure) && suggested.structure.length ? suggested.structure : baseStructure,
    } as any)
    await refresh()
  } catch (e: any) {
    window.alert(`${tr('tpl.styleAnalyzeFailed')}: ${e?.message ?? String(e)}`)
  } finally {
    styleAnalyzing.value = false
  }
}

function defaultSegDuration() {
  return { min: 2, max: 4 }
}
function defaultSegFx() {
  return {
    zoom: { min: 1.0, max: 1.05 },
    move: { x: { min: -0.03, max: 0.03 }, y: { min: -0.02, max: 0.02 } },
  }
}

function segDur(t: Template, seg: SegmentKey) {
  return t.segmentDurationSec?.[seg] ?? { min: 2, max: 6 }
}

function segFx(t: Template, seg: SegmentKey) {
  return (
    t.segmentFx?.[seg] ?? {
      zoom: { min: 1.0, max: 1.06 },
      move: { x: { min: -0.04, max: 0.04 }, y: { min: -0.03, max: 0.03 } },
    }
  )
}

function cleanSegKey(s: string) {
  return (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-]/g, '')
}

function ensureStructure(t: Template) {
  const base =
    Array.isArray(t.structure) && t.structure.length
      ? t.structure
      : (['hook', 'show', 'detail'] as string[])
  const cleaned = base.map((x) => cleanSegKey(String(x)) || 'seg')
  // Remove duplicates while preserving order.
  const seen = new Set<string>()
  const uniq: string[] = []
  for (const k of cleaned) {
    if (seen.has(k)) continue
    seen.add(k)
    uniq.push(k)
  }
  if (uniq.length >= 1) return uniq
  return ['hook']
}

function addSegment(t: Template) {
  const draft = String(templateNewSegName.value ?? '').trim()
  const raw = draft || window.prompt(tr('tpl.newSegPrompt'), tr('tpl.newSegDefault'))
  if (!raw) return
  const key = cleanSegKey(raw)
  if (!key) return
  const next = ensureStructure(t)
  if (next.includes(key)) {
    window.alert(tr('tpl.segDup'))
    return
  }
  updateTemplate(t, { structure: [...next, key] })
  templateNewSegName.value = ''
}

function removeSegment(t: Template, seg: SegmentKey) {
  const next = ensureStructure(t).filter((s) => s !== seg)
  if (next.length < 2) {
    window.alert(tr('tpl.minTwoSeg'))
    return
  }
  const nextDur = { ...(t.segmentDurationSec ?? {}) }
  const nextFx = { ...(t.segmentFx ?? {}) }
  delete (nextDur as any)[seg]
  delete (nextFx as any)[seg]
  updateTemplate(t, { structure: next, segmentDurationSec: nextDur, segmentFx: nextFx })
}

function moveSegment(t: Template, seg: SegmentKey, delta: -1 | 1) {
  const arr = [...ensureStructure(t)]
  const i = arr.indexOf(seg)
  if (i < 0) return
  const j = i + delta
  if (j < 0 || j >= arr.length) return
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  updateTemplate(t, { structure: arr })
}

function onDragStartSegment(t: Template, seg: SegmentKey) {
  draggingSeg.value = { templateId: t.id, seg }
}

function onDropSegment(t: Template, overSeg: SegmentKey) {
  const from = draggingSeg.value
  draggingSeg.value = null
  if (!from || from.templateId !== t.id) return
  if (from.seg === overSeg) return

  const arr = [...ensureStructure(t)]
  const fromIdx = arr.indexOf(from.seg)
  const toIdx = arr.indexOf(overSeg)
  if (fromIdx < 0 || toIdx < 0) return

  const next = [...arr]
  const [item] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, item)
  updateTemplate(t, { structure: next })
}

function clampNum(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function scheduleSave(t: Template) {
  saving.value[t.id] = true
  const prev = saveTimers.get(t.id)
  if (prev) window.clearTimeout(prev)
  const timer = window.setTimeout(async () => {
    try {
      await window.api.templates.upsert(cloneTemplate(t))
    } finally {
      saving.value[t.id] = false
    }
  }, 350)
  saveTimers.set(t.id, timer)
}

function updateTemplate(t: Template, patch: Partial<Template>) {
  // Update locally for immediate feedback, then debounce persistence.
  Object.assign(t, patch)
  t.structure = ensureStructure(t)
  t.totalDurationSec = {
    min: clampNum(t.totalDurationSec.min, 3, 60),
    max: clampNum(t.totalDurationSec.max, t.totalDurationSec.min, 60),
  }
  if (t.randomizeOrder?.mode === 'partial') {
    const n = clampNum(Number(t.randomizeOrder.keepFirstCount ?? 1), 0, t.structure.length)
    t.randomizeOrder = { ...t.randomizeOrder, keepFirstCount: Math.floor(n) }
  }
  scheduleSave(t)
}

async function pickBgm(t: Template) {
  const paths = await window.api.pickFiles({
    title: tr('dialog.pickBgm'),
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac'] }],
  })
  if (!paths.length) return
  const prev = (t.bgm?.filePaths ?? []).map((x) => String(x)).filter(Boolean)
  const next = [...prev, ...paths.map((x) => String(x)).filter(Boolean)]
  // Remove duplicates while preserving order.
  const seen = new Set<string>()
  const uniq: string[] = []
  for (const p of next) {
    if (seen.has(p)) continue
    seen.add(p)
    uniq.push(p)
  }
  updateTemplate(t, { bgm: { filePaths: uniq, volume: t.bgm?.volume ?? 0.25 } })
}

function clearBgm(t: Template) {
  updateTemplate(t, { bgm: null })
}

function removeBgmItem(t: Template, filePath: string) {
  const left = (t.bgm?.filePaths ?? []).filter((x) => x !== filePath)
  updateTemplate(t, { bgm: left.length ? { filePaths: left, volume: t.bgm?.volume ?? 0.25 } : null })
}

// Deprecated voicePool folders were replaced by dynamic Edge-TTS narration.

function currentTab(id: string) {
  const raw = activeTab.value[id] ?? 'global'
  // Preserve compatibility with the legacy tab key.
  if ((raw as string) === 'av') return 'av_mix'
  return raw
}

onMounted(() => {
  applyWorkspaceFromRoute()
  void refreshLuts()
  void refreshStickers()
  void refreshUserStickers()
  void refreshUserFonts()
  void refresh()
})
watch(
  () => route.query.ws,
  () => {
    applyWorkspaceFromRoute()
  },
)
watch(
  list,
  (arr) => {
    if (!arr.length) {
      selectedTemplateId.value = ''
      return
    }
    if (!arr.some((x) => x.id === selectedTemplateId.value)) {
      selectedTemplateId.value = arr[0].id
    }
  },
  { deep: false },
)
watch(
  selectedTemplate,
  (tpl) => {
    if (!tpl) return
    voiceDraft.value = tpl.tts?.voice ?? 'zh-CN-XiaoxiaoNeural'
  },
  { immediate: true },
)

/* ------------------------------------------------------------------ 模板库：列表 / 时间线 / 段设置 */
const listQuery = ref('')
const creatingOpen = ref(false)
const selectedSeg = ref('')

const KNOWN_SEGMENTS = ['hook', 'pain', 'show', 'detail', 'scene', 'proof', 'offer', 'cta']
const KNOWN_MOTIONS = ['static', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'shake', 'fast_cut']

const filteredList = computed(() => {
  const q = listQuery.value.trim().toLowerCase()
  if (!q) return list.value
  return list.value.filter((t) =>
    [templateDisplayName(t), t.meta?.sourceVideoName ?? '', ...t.structure].some((x) => String(x).toLowerCase().includes(q)),
  )
})

function templateSource(t: Template): 'ai' | 'clone' | 'manual' {
  if (t.meta?.source === 'video_ai') return 'ai'
  if (t.meta?.source === 'clone_blueprint') return 'clone'
  return 'manual'
}

function sourceLabel(t: Template) {
  const s = templateSource(t)
  return s === 'ai' ? tr('tplx.sourceAi') : s === 'clone' ? tr('tplx.sourceClone') : tr('tplx.sourceManual')
}

function segLabel(seg: string) {
  return KNOWN_SEGMENTS.includes(seg) ? tr(`tplx.seg.${seg}`) : seg.toUpperCase()
}

function segToneClass(seg: string) {
  return `tone-${KNOWN_SEGMENTS.includes(seg) ? seg : 'other'}`
}

function motionLabel(m?: string) {
  const key = String(m || 'static')
  return KNOWN_MOTIONS.includes(key) ? tr(`tplx.motion.${key}`) : key
}

function segAvg(t: Template, seg: string) {
  const d = segDur(t, seg)
  return Math.max(0.3, (Number(d.min) + Number(d.max)) / 2)
}

function timelineItems(t: Template) {
  return ensureStructure(t).map((seg) => ({ seg, avg: segAvg(t, seg) }))
}

function timelineTotal(t: Template) {
  return Math.round(timelineItems(t).reduce((s, x) => s + x.avg, 0) * 10) / 10
}

function avgSegSec(t: Template) {
  const items = timelineItems(t)
  if (!items.length) return 0
  return Math.round((items.reduce((s, x) => s + x.avg, 0) / items.length) * 10) / 10
}

function transitionSummary(t: Template) {
  const tr0 = t.transition as any
  if (!tr0?.enabled) return tr('tplx.hardcut')
  const pool: string[] = Array.isArray(tr0.pool) ? tr0.pool.filter((x: string) => x !== 'hardcut') : ['fade']
  if (!pool.length) return tr('tplx.hardcut')
  return pool.length === 1 ? pool[0] : tr('tplx.transitionCount', { n: pool.length })
}

function motionSummary(t: Template, seg: string) {
  const fx = segFx(t, seg)
  const zoom = Number(fx.zoom?.max ?? 1) - 1
  const pan = Math.max(Math.abs(Number(fx.move?.x?.min ?? 0)), Math.abs(Number(fx.move?.x?.max ?? 0)))
  if (pan >= 0.05) return `${tr('tplx.segMoveX')} ±${pan}`
  if (zoom >= 0.06) return `${tr('tplx.motion.zoom_in')} ×${fx.zoom?.max}`
  return `${tr('tplx.segZoom')} ×${fx.zoom?.min ?? 1}–${fx.zoom?.max ?? 1.06}`
}

const activeSeg = computed(() => {
  const t = selectedTemplate.value
  if (!t) return ''
  const structure = ensureStructure(t)
  return structure.includes(selectedSeg.value) ? selectedSeg.value : (structure[0] ?? '')
})

const refShots = computed(() => selectedTemplate.value?.meta?.referenceShots ?? [])
const hasAiRead = computed(() => {
  const m = selectedTemplate.value?.meta
  return Boolean(m?.summary || m?.sellingLogic || m?.hookLine || m?.ctaLine)
})

function setSegDur(t: Template, seg: string, v: { min: number; max: number }) {
  const min = Math.max(0.1, Number(v.min) || 0.1)
  const max = Math.max(min, Number(v.max) || min)
  updateTemplate(t, { segmentDurationSec: { ...(t.segmentDurationSec ?? {}), [seg]: { min, max } } })
}

function setSegFx(t: Template, seg: string, patch: { zoom?: { min: number; max: number }; move?: { x: { min: number; max: number }; y: { min: number; max: number } } }) {
  updateTemplate(t, { segmentFx: { ...(t.segmentFx ?? {}), [seg]: { ...segFx(t, seg), ...patch } } })
}

function renameTemplate(t: Template, name: string) {
  const next = String(name ?? '').trim()
  if (!next || next === t.name) return
  updateTemplate(t, { name: next })
}

async function duplicateTemplate(t: Template) {
  const copy = cloneTemplate(t) as any
  delete copy.id
  delete copy.createdAt
  delete copy.updatedAt
  copy.name = `${templateDisplayName(t)} ${tr('tplx.copySuffix')}`
  const created = await window.api.templates.upsert(copy)
  await refresh()
  if (created?.id) selectedTemplateId.value = created.id
}

function useForMix(t: Template) {
  void router.push({ path: '/production/create', query: { templateId: t.id } })
}

const rulesOverview = computed(() => {
  const t = selectedTemplate.value
  if (!t) return []
  const shuffle = t.randomizeOrder?.mode === 'partial'
  const audioKeep = ((t.audio as any)?.source ?? 'keep') === 'keep'
  const bgmCount = t.bgm?.filePaths?.length ?? 0
  return [
    { label: tr('tplx.ruleSkip'), value: `${t.skipStartSec ?? 0}s`, on: Number(t.skipStartSec ?? 0) > 0 },
    {
      label: tr('tplx.ruleShuffle'),
      value: shuffle ? tr('tplx.shuffleKeep', { n: t.randomizeOrder?.keepFirstCount ?? 0 }) : tr('tplx.fixedOrder'),
      on: shuffle,
    },
    { label: tr('tplx.kpiTransition'), value: transitionSummary(t), on: Boolean(t.transition?.enabled) },
    { label: tr('tplx.ruleAudio'), value: audioKeep ? tr('tplx.keep') : tr('tplx.mute'), on: audioKeep },
    { label: tr('tplx.ruleBgm'), value: bgmCount ? tr('tplx.bgmCount', { n: bgmCount }) : tr('tplx.off'), on: bgmCount > 0 },
    { label: tr('tplx.ruleTts'), value: t.tts?.enabled ? tr('tplx.on') : tr('tplx.off'), on: Boolean(t.tts?.enabled) },
    { label: tr('tplx.ruleTitle'), value: t.titleOverlay?.enabled ? tr('tplx.on') : tr('tplx.off'), on: Boolean(t.titleOverlay?.enabled) },
    { label: tr('tplx.ruleSubtitle'), value: t.assSubtitle?.enabled ? tr('tplx.on') : tr('tplx.off'), on: Boolean(t.assSubtitle?.enabled) },
  ]
})

function formatSec(sec: number) {
  const s = Math.max(0, Number(sec) || 0)
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}

/* ------------------------------------------------------------------ 导入视频 → AI 识别模板 */
type VideoTemplateDraft = Awaited<ReturnType<typeof window.api.templates.analyzeVideo>>
type ImportStage = 'pick' | 'analyzing' | 'review' | 'error'

const importOpen = ref(false)
const importStage = ref<ImportStage>('pick')
const importFile = ref('')
const importDraft = ref<VideoTemplateDraft | null>(null)
const importName = ref('')
const importError = ref('')
const importSaving = ref(false)
const importKeepVoice = ref(true)
const importKeepCaption = ref(true)
const importElapsed = ref(0)
let importTimer = 0

const importFileName = computed(() => importFile.value.split(/[\\/]/).pop() || importFile.value)
const importStages = computed(() => [tr('tplx.stageCut'), tr('tplx.stageFrames'), tr('tplx.stageAi'), tr('tplx.stageBuild')])
/** 后端是一次调用，这里按经验耗时推进步骤提示 */
const importStageIndex = computed(() => (importElapsed.value < 4 ? 0 : importElapsed.value < 10 ? 1 : 2))

function openImport() {
  if (importStage.value !== 'analyzing') importStage.value = 'pick'
  importOpen.value = true
}

function closeImport() {
  if (importStage.value === 'analyzing') return
  importOpen.value = false
}

async function pickImportVideo() {
  const paths = await window.api.pickFiles({
    title: tr('tplx.pickVideo'),
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v'] }],
  })
  const file = String(paths?.[0] ?? '').trim()
  if (file) await runImport(file)
}

async function runImport(file: string) {
  if (typeof window.api.templates?.analyzeVideo !== 'function') {
    importError.value = tr('tplx.notSupported')
    importStage.value = 'error'
    return
  }
  importFile.value = file
  importStage.value = 'analyzing'
  importElapsed.value = 0
  window.clearInterval(importTimer)
  importTimer = window.setInterval(() => (importElapsed.value += 1), 1000)
  try {
    const draft = await window.api.templates.analyzeVideo({ videoPath: file, locale: String(locale.value) })
    importDraft.value = draft
    importName.value = String(draft.template.name ?? '')
    importKeepVoice.value = true
    importKeepCaption.value = true
    importStage.value = 'review'
  } catch (e: any) {
    importError.value = String(e?.message ?? e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
    importStage.value = 'error'
  } finally {
    window.clearInterval(importTimer)
  }
}

function draftSegAvg(seg: string) {
  const d = importDraft.value?.template.segmentDurationSec?.[seg]
  return d ? Math.max(0.3, (Number(d.min) + Number(d.max)) / 2) : 1
}

async function saveImport() {
  const draft = importDraft.value
  if (!draft || importSaving.value) return
  importSaving.value = true
  try {
    // 草稿在 ref 里是响应式代理，IPC 无法克隆，先转成纯对象
    const payload: any = JSON.parse(JSON.stringify(toRaw(draft.template)))
    payload.name = importName.value.trim() || draft.template.name
    if (!importKeepVoice.value) delete payload.tts
    if (!importKeepCaption.value) delete payload.titleOverlay
    const created = await window.api.templates.upsert(payload)
    await refresh()
    if (created?.id) selectedTemplateId.value = created.id
    selectedSeg.value = ''
    importOpen.value = false
    importStage.value = 'pick'
    importDraft.value = null
  } catch (e: any) {
    window.alert(e?.message ?? String(e))
  } finally {
    importSaving.value = false
  }
}

async function pickAnalyzeFolder() {
  const dir = await window.api.pickDir({ title: tr('tplx.folderTitle') })
  if (dir) styleAnalyzeDir.value = String(dir)
}

async function runFolderAnalyze() {
  const before = new Set(list.value.map((x) => x.id))
  await analyzeVideosAndCreateTemplate()
  const created = list.value.find((x) => !before.has(x.id))
  if (created) {
    selectedTemplateId.value = created.id
    importOpen.value = false
  }
}

onBeforeUnmount(() => window.clearInterval(importTimer))
</script>

<template>
  <div class="vg-scope vg-page tpl">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><LayoutTemplate :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ tr('ai.nav.templates') }}</h1>
        <p>{{ tr('tplx.pageSub') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button v-if="selectedTemplate" class="vg-btn" type="button" @click="openPresetPicker(selectedTemplate)">
          <SlidersHorizontal :size="15" /> {{ tr('tplx.presets') }}
        </button>
        <button class="vg-btn" type="button" @click="creatingOpen = !creatingOpen">
          <Plus :size="15" /> {{ tr('tplx.newBlank') }}
        </button>
        <button class="vg-btn vg-btn--primary" type="button" @click="openImport">
          <Sparkles :size="15" /> {{ tr('tplx.aiImport') }}
        </button>
      </div>
    </header>

    <div class="tpl-layout">
      <!-- 模板列表 -->
      <aside class="tpl-card tpl-side">
        <div class="tpl-side__head">
          <h2 class="tpl-h2">{{ tr('autoUi.k_14c9bcea5e35') }}</h2>
          <span class="tpl-count">{{ list.length }}</span>
        </div>
        <label class="tpl-search">
          <Search :size="14" />
          <input v-model="listQuery" :placeholder="tr('tplx.search')" />
        </label>
        <form v-if="creatingOpen" class="tpl-create" @submit.prevent="createTemplate">
          <input v-model="form.name" class="vg-input min-w-0 flex-1" :placeholder="tr('tplx.newNamePh')" autofocus />
          <button type="submit" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="!form.name.trim()">{{ tr('tplx.create') }}</button>
        </form>

        <div class="tpl-side__list">
          <button
            v-for="tpl in filteredList"
            :key="tpl.id"
            type="button"
            class="tpl-item"
            :class="{ 'is-active': selectedTemplate?.id === tpl.id }"
            @click="selectTemplate(tpl.id)"
          >
            <div class="tpl-item__top">
              <strong class="tpl-item__name">{{ templateDisplayName(tpl) }}</strong>
              <span class="tpl-src" :class="`tpl-src--${templateSource(tpl)}`">{{ sourceLabel(tpl) }}</span>
            </div>
            <div class="tpl-item__meta">
              {{ tr('tplx.segCount', { n: tpl.structure.length }) }} · {{ tpl.totalDurationSec.min }}–{{ tpl.totalDurationSec.max }}s
            </div>
            <div class="tpl-strip">
              <span
                v-for="item in timelineItems(tpl)"
                :key="item.seg"
                class="tpl-strip__bar"
                :class="segToneClass(item.seg)"
                :style="{ flexGrow: item.avg }"
              ></span>
            </div>
            <span
              class="tpl-item__del"
              role="button"
              :title="tr('tplx.delete')"
              @click.stop="removeTemplate(tpl.id)"
            ><Trash2 :size="14" /></span>
          </button>
          <div v-if="list.length && !filteredList.length" class="tpl-side__empty">{{ tr('tplx.emptyList') }}</div>
        </div>
      </aside>

      <!-- 主编辑区 -->
      <main class="tpl-main">
        <section v-if="!selectedTemplate" class="tpl-card tpl-hero">
          <span class="tpl-hero__icon"><Film :size="28" /></span>
          <h2>{{ tr('tplx.emptyTitle') }}</h2>
          <p>{{ tr('tplx.emptyDesc') }}</p>
          <ol class="tpl-hero__steps">
            <li><b>1</b>{{ tr('tplx.step1') }}</li>
            <li><b>2</b>{{ tr('tplx.step2') }}</li>
            <li><b>3</b>{{ tr('tplx.step3') }}</li>
          </ol>
          <button class="vg-btn vg-btn--primary" type="button" @click="openImport">
            <Sparkles :size="15" /> {{ tr('tplx.aiImport') }}
          </button>
        </section>

        <template v-else>
          <!-- 模板头 -->
          <section class="tpl-card tpl-head">
            <div class="tpl-head__title">
              <input
                class="tpl-name"
                :value="templateDisplayName(selectedTemplate)"
                @change="renameTemplate(selectedTemplate, ($event.target as HTMLInputElement).value)"
                @keydown.enter="($event.target as HTMLInputElement).blur()"
              />
              <div class="tpl-head__sub">
                <span class="tpl-src" :class="`tpl-src--${templateSource(selectedTemplate)}`">{{ sourceLabel(selectedTemplate) }}</span>
                <span v-if="selectedTemplate.meta?.sourceVideoName" class="tpl-muted truncate">{{ selectedTemplate.meta.sourceVideoName }}</span>
                <span class="tpl-save" :class="{ 'is-busy': saving[selectedTemplate.id] }">
                  <Loader2 v-if="saving[selectedTemplate.id]" :size="12" class="animate-spin" />
                  <CheckCircle2 v-else :size="12" />
                  {{ saving[selectedTemplate.id] ? tr('tplx.saving') : tr('tplx.saved') }}
                </span>
              </div>
            </div>
            <div class="tpl-head__actions">
              <button class="vg-btn vg-btn--sm" type="button" @click="duplicateTemplate(selectedTemplate)">
                <Copy :size="14" /> {{ tr('tplx.duplicate') }}
              </button>
              <button
                v-if="selectedTemplate.meta?.source === 'clone_blueprint'"
                class="vg-btn vg-btn--sm"
                type="button"
                @click="openCloneWithTemplate(selectedTemplate)"
              >{{ tr('autoUi.k_228cbba7e92f') }}</button>
              <button class="vg-btn vg-btn--primary vg-btn--sm" type="button" @click="useForMix(selectedTemplate)">
                <Play :size="14" /> {{ tr('tplx.useForMix') }}
              </button>
            </div>
          </section>

          <!-- 关键指标 -->
          <div class="vg-stats">
            <div class="vg-stat">
              <span class="vg-stat__icon"><Clock :size="17" /></span>
              <div class="vg-stat__body">
                <span class="vg-stat__label">{{ tr('tplx.kpiDuration') }}</span>
                <span class="vg-stat__value">{{ selectedTemplate.totalDurationSec.min }}–{{ selectedTemplate.totalDurationSec.max }}s</span>
              </div>
            </div>
            <div class="vg-stat">
              <span class="vg-stat__icon vg-stat__icon--blue"><Layers :size="17" /></span>
              <div class="vg-stat__body">
                <span class="vg-stat__label">{{ tr('tplx.kpiSegments') }}</span>
                <span class="vg-stat__value">{{ selectedTemplate.structure.length }}</span>
              </div>
            </div>
            <div class="vg-stat">
              <span class="vg-stat__icon vg-stat__icon--amber"><Scissors :size="17" /></span>
              <div class="vg-stat__body">
                <span class="vg-stat__label">{{ tr('tplx.kpiAvgShot') }}</span>
                <span class="vg-stat__value">{{ avgSegSec(selectedTemplate) }}s</span>
              </div>
            </div>
            <div class="vg-stat">
              <span class="vg-stat__icon vg-stat__icon--violet"><Shuffle :size="17" /></span>
              <div class="vg-stat__body">
                <span class="vg-stat__label">{{ tr('tplx.kpiTransition') }}</span>
                <span class="vg-stat__value">{{ transitionSummary(selectedTemplate) }}</span>
              </div>
            </div>
          </div>

          <!-- 分镜时间线 -->
          <section class="tpl-card tpl-section">
            <div class="tpl-section__head">
              <div>
                <h2 class="tpl-h2">{{ tr('tplx.timeline') }}</h2>
                <p class="tpl-muted">{{ tr('tplx.timelineHint') }}</p>
              </div>
              <form class="tpl-addseg" @submit.prevent="addSegment(selectedTemplate)">
                <input v-model="templateNewSegName" class="vg-input" :placeholder="tr('tplx.addSegPh')" />
                <button type="submit" class="vg-btn vg-btn--sm" :disabled="!templateNewSegName.trim()"><Plus :size="14" /> {{ tr('tplx.addSeg') }}</button>
              </form>
            </div>
            <div class="tpl-timeline">
              <button
                v-for="(item, idx) in timelineItems(selectedTemplate)"
                :key="`${selectedTemplate.id}-${item.seg}`"
                type="button"
                class="tpl-block"
                :class="[segToneClass(item.seg), { 'is-active': activeSeg === item.seg }]"
                :style="{ flexGrow: item.avg }"
                draggable="true"
                @click="selectedSeg = item.seg"
                @dragstart="onDragStartSegment(selectedTemplate, item.seg)"
                @dragover.prevent
                @drop.prevent="onDropSegment(selectedTemplate, item.seg)"
              >
                <span class="tpl-block__idx"><GripVertical :size="12" /> {{ String(idx + 1).padStart(2, '0') }}</span>
                <strong class="tpl-block__name">{{ segLabel(item.seg) }}</strong>
                <span class="tpl-block__key">{{ item.seg }}</span>
                <span class="tpl-block__dur">{{ segDur(selectedTemplate, item.seg).min }}–{{ segDur(selectedTemplate, item.seg).max }}s</span>
                <span class="tpl-block__fx">{{ motionSummary(selectedTemplate, item.seg) }}</span>
              </button>
            </div>
            <div class="tpl-ruler">
              <span>0s</span>
              <span>~{{ timelineTotal(selectedTemplate) }}s</span>
            </div>
          </section>

          <!-- 参考视频拆解（AI 识别模板） -->
          <section v-if="refShots.length" class="tpl-card tpl-section">
            <div class="tpl-section__head">
              <div>
                <h2 class="tpl-h2">{{ tr('tplx.refTitle') }}</h2>
                <p class="tpl-muted">{{ tr('tplx.refMeta', { name: selectedTemplate.meta?.sourceVideoName || '-', dur: selectedTemplate.meta?.sourceDurationSec ?? '-', n: refShots.length }) }}</p>
              </div>
              <div class="flex flex-wrap gap-1">
                <span v-if="selectedTemplate.meta?.hookType" class="vg-chip">{{ templateHookTypeLabel(selectedTemplate.meta?.hookType) }}</span>
                <span v-if="selectedTemplate.meta?.productCategory" class="vg-chip">{{ templateProductTypeLabel(selectedTemplate.meta?.productCategory) }}</span>
                <span v-if="selectedTemplate.meta?.aspectRatio" class="vg-chip">{{ selectedTemplate.meta.aspectRatio }}</span>
              </div>
            </div>
            <div v-if="hasAiRead" class="tpl-insight">
              <div class="tpl-insight__title"><Sparkles :size="14" /> {{ tr('tplx.aiSummary') }}</div>
              <p v-if="selectedTemplate.meta?.summary">{{ selectedTemplate.meta.summary }}</p>
              <dl>
                <template v-if="selectedTemplate.meta?.sellingLogic"><dt>{{ tr('tplx.sellingLogic') }}</dt><dd>{{ selectedTemplate.meta.sellingLogic }}</dd></template>
                <template v-if="selectedTemplate.meta?.hookLine"><dt>{{ tr('tplx.hookLine') }}</dt><dd>{{ selectedTemplate.meta.hookLine }}</dd></template>
                <template v-if="selectedTemplate.meta?.ctaLine"><dt>{{ tr('tplx.ctaLine') }}</dt><dd>{{ selectedTemplate.meta.ctaLine }}</dd></template>
              </dl>
            </div>
            <div class="tpl-shots">
              <article
                v-for="shot in refShots"
                :key="shot.index"
                class="tpl-shot"
                :class="{ 'is-active': activeSeg === shot.segment }"
                @click="selectedSeg = shot.segment"
              >
                <div class="tpl-shot__thumb">
                  <img v-if="shot.thumbnailPath" :src="thumbnailUrl(shot.thumbnailPath, 120)" alt="" loading="lazy" />
                  <Film v-else :size="18" />
                  <span class="tpl-shot__time">{{ formatSec(shot.startSec) }}</span>
                </div>
                <div class="tpl-shot__body">
                  <div class="tpl-shot__tags">
                    <span class="tpl-tag" :class="segToneClass(shot.segment)">{{ segLabel(shot.segment) }}</span>
                    <span class="tpl-muted">{{ shot.durationSec }}s · {{ motionLabel(shot.motion) }}</span>
                  </div>
                  <p v-if="shot.scriptText" class="tpl-shot__text"><b>{{ tr('tplx.shotVoice') }}</b>{{ shot.scriptText }}</p>
                  <p v-if="shot.onScreenText" class="tpl-shot__text"><b>{{ tr('tplx.shotCaption') }}</b>{{ shot.onScreenText }}</p>
                  <p v-if="!shot.scriptText && !shot.onScreenText && shot.visual" class="tpl-shot__text tpl-muted">{{ shot.visual }}</p>
                </div>
              </article>
            </div>
          </section>

          <!-- 复刻蓝图来源 -->
          <section v-if="selectedTemplate.meta?.source === 'clone_blueprint'" class="tpl-card tpl-section">
            <div class="grid gap-3 md:grid-cols-2">
              <div class="tpl-soft p-4">
                <div class="text-sm font-black text-white">{{ tr('autoUi.k_8222dbd32528') }}</div>
                <div class="mt-3 space-y-2 text-sm text-slate-300">
                  <div>{{ tr('autoUi.k_af0970740161') }}{{ templateHookTypeLabel(selectedTemplate.meta?.hookType) }}</div>
                  <div>{{ tr('autoUi.k_f4595798fb69') }}{{ templateProductTypeLabel(selectedTemplate.meta?.productCategory) }}</div>
                  <div>{{ tr('autoUi.k_98737ae281d9') }}{{ selectedTemplate.meta?.rhythm?.cutDensity || 'medium' }}</div>
                  <div>{{ tr('autoUi.k_51e5c2043884') }}{{ selectedTemplate.meta?.rhythm?.first3SecShotCount ?? 0 }}</div>
                </div>
              </div>
              <div class="tpl-soft p-4">
                <div class="text-sm font-black text-white">{{ tr('autoUi.k_97779e2726fc') }}</div>
                <div class="mt-3 space-y-2 text-sm text-slate-300">
                  <div>{{ tr('autoUi.k_f14e1e658c86') }}{{ selectedTemplate.meta?.visualStyle?.scene || tr('autoUi.k_86f9195e25e4') }}</div>
                  <div>{{ tr('autoUi.k_79241900d773') }}{{ selectedTemplate.meta?.visualStyle?.lighting || tr('autoUi.k_86f9195e25e4') }}</div>
                  <div>{{ tr('autoUi.k_da56d654f05a') }}{{ selectedTemplate.meta?.visualStyle?.cameraStyle || tr('autoUi.k_86f9195e25e4') }}</div>
                  <div>{{ tr('autoUi.k_332a9a0d569c') }}{{ selectedTemplate.meta?.visualStyle?.realismStyle || 'ugc' }}</div>
                </div>
              </div>
            </div>
          </section>

          <!-- 模板规则 -->
          <section class="tpl-card tpl-section">
            <div class="tpl-section__head">
              <div>
                <h2 class="tpl-h2">{{ tr('tplx.editorTitle') }}</h2>
                <p class="tpl-muted">{{ tr('tplx.editorDesc') }}</p>
              </div>
            </div>
            <div class="vg-tabs mb-4">
              <button
                v-for="item in workspaceItems"
                :key="item.key"
                type="button"
                class="vg-tabs__btn"
                :class="{ 'is-active': workspace === item.key }"
                @click="activateWorkspace(String(item.key))"
              >{{ item.label }}</button>
            </div>
            <div class="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <section v-if="workspace === 'structure'" class="tpl-soft p-4">
              <div class="mb-3 text-sm font-black text-white">{{ tr('autoUi.k_39e0624819a0') }}</div>
              <div class="grid gap-3 md:grid-cols-2">
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_6f11716bec3f') }} <input
                    :value="selectedTemplate.totalDurationSec.min"
                    type="number"
                    min="3"
                    max="60"
                    class="vg-input mt-2 w-full"
                    @input="updateTemplate(selectedTemplate, { totalDurationSec: { ...selectedTemplate.totalDurationSec, min: Number(($event.target as HTMLInputElement).value) || 3 } })"
                  />
                </label>
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_a99e0085ce67') }} <input
                    :value="selectedTemplate.totalDurationSec.max"
                    type="number"
                    min="3"
                    max="60"
                    class="vg-input mt-2 w-full"
                    @input="updateTemplate(selectedTemplate, { totalDurationSec: { ...selectedTemplate.totalDurationSec, max: Number(($event.target as HTMLInputElement).value) || selectedTemplate.totalDurationSec.min } })"
                  />
                </label>
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_85736c94a112') }} <input
                    :value="selectedTemplate.skipStartSec ?? 0"
                    type="number"
                    min="0"
                    max="30"
                    step="0.1"
                    class="vg-input mt-2 w-full"
                    @input="updateTemplate(selectedTemplate, { skipStartSec: Number(($event.target as HTMLInputElement).value) || 0 })"
                  />
                </label>
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_5b63183a8d2a') }} <input
                    :value="selectedTemplate.randomizeOrder?.keepFirstCount ?? 1"
                    type="number"
                    min="0"
                    :max="selectedTemplate.structure.length"
                    class="vg-input mt-2 w-full"
                    @input="updateTemplate(selectedTemplate, { randomizeOrder: { mode: selectedTemplate.randomizeOrder?.mode ?? 'partial', keepFirstCount: Number(($event.target as HTMLInputElement).value) || 0 } })"
                  />
                </label>
              </div>
              <div class="mt-4 flex flex-wrap gap-4">
                <label class="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    :checked="selectedTemplate.transition?.enabled ?? false"
                    @change="updateTemplate(selectedTemplate, { transition: { enabled: ($event.target as HTMLInputElement).checked, type: 'fade', durationSec: selectedTemplate.transition?.durationSec ?? { min: 0.2, max: 0.45 } } })"
                  /> {{ tr('autoUi.k_2d61959b868b') }} </label>
                <label class="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    :checked="selectedTemplate.randomizeOrder?.mode === 'partial'"
                    @change="updateTemplate(selectedTemplate, { randomizeOrder: { mode: ($event.target as HTMLInputElement).checked ? 'partial' : 'none', keepFirstCount: selectedTemplate.randomizeOrder?.keepFirstCount ?? 1 } })"
                  /> {{ tr('autoUi.k_aeae2daf2864') }} </label>
              </div>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_797b53b6badf') }} <input
                    :value="selectedTemplate.transition?.durationSec?.min ?? 0.2"
                    type="number"
                    min="0"
                    max="3"
                    step="0.05"
                    class="vg-input mt-2 w-full"
                    @input="updateTemplate(selectedTemplate, { transition: { enabled: selectedTemplate.transition?.enabled ?? true, type: 'fade', durationSec: { min: Number(($event.target as HTMLInputElement).value) || 0, max: selectedTemplate.transition?.durationSec?.max ?? 0.45 } } })"
                  />
                </label>
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_66bca9b92773') }} <input
                    :value="selectedTemplate.transition?.durationSec?.max ?? 0.45"
                    type="number"
                    min="0"
                    max="3"
                    step="0.05"
                    class="vg-input mt-2 w-full"
                    @input="updateTemplate(selectedTemplate, { transition: { enabled: selectedTemplate.transition?.enabled ?? true, type: 'fade', durationSec: { min: selectedTemplate.transition?.durationSec?.min ?? 0.2, max: Number(($event.target as HTMLInputElement).value) || 0.45 } } })"
                  />
                </label>
              </div>
            </section>

            <section v-if="workspace === 'audio'" class="tpl-soft p-4">
              <div class="mb-3 text-sm font-black text-white">{{ tr('autoUi.k_7f87addec71e') }}</div>
              <div class="grid gap-3 md:grid-cols-2">
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_ed6eca3bfb96') }} <select
                    class="vg-select mt-2 w-full"
                    :value="(selectedTemplate.audio as any)?.source ?? 'keep'"
                    @change="updateTemplate(selectedTemplate, { audio: { ...((selectedTemplate.audio as any) ?? {}), source: ($event.target as HTMLSelectElement).value, ducking: selectedTemplate.audio?.ducking ?? { enabled: false, amountDb: 12 } } as any })"
                  >
                    <option value="keep">{{ tr('autoUi.k_1d7df020475d') }}</option>
                    <option value="mute">{{ tr('autoUi.k_f93150b2636d') }}</option>
                  </select>
                </label>
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_d0b4e58a0845') }} <select
                    class="vg-select mt-2 w-full"
                    :value="selectedTemplate.aspectUnifyMode ?? 'cover_crop'"
                    @change="updateTemplate(selectedTemplate, { aspectUnifyMode: ($event.target as HTMLSelectElement).value as any })"
                  >
                    <option value="cover_crop">{{ tr('autoUi.k_89670d4f4334') }}</option>
                    <option value="contain_pad">{{ tr('autoUi.k_8caaababb438') }}</option>
                  </select>
                </label>
              </div>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <label class="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    :checked="selectedTemplate.audio?.ducking?.enabled ?? false"
                    @change="updateTemplate(selectedTemplate, { audio: { ...((selectedTemplate.audio as any) ?? {}), ducking: { enabled: ($event.target as HTMLInputElement).checked, amountDb: selectedTemplate.audio?.ducking?.amountDb ?? 12 } } as any })"
                  /> {{ tr('autoUi.k_413c6f5fd833') }} </label>
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_9828e4403587') }} <input
                    :value="selectedTemplate.audio?.ducking?.amountDb ?? 12"
                    type="number"
                    min="0"
                    max="30"
                    class="vg-input mt-2 w-full"
                    @input="updateTemplate(selectedTemplate, { audio: { ...((selectedTemplate.audio as any) ?? {}), ducking: { enabled: selectedTemplate.audio?.ducking?.enabled ?? true, amountDb: Number(($event.target as HTMLInputElement).value) || 0 } } as any })"
                  />
                </label>
              </div>
            </section>
            <section v-if="workspace === 'visual'" class="tpl-soft p-4">
              <div class="mb-3 text-sm font-black text-white">{{ tr('autoUi.k_f8f2e332da09') }}</div>
              <label class="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  :checked="selectedTemplate.jitter?.speed?.enabled ?? false"
                  @change="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), speed: { enabled: ($event.target as HTMLInputElement).checked, range: selectedTemplate.jitter?.speed?.range ?? { min: 0.99, max: 1.01 } } } })"
                /> {{ tr('autoUi.k_469e4af0e09a') }} </label>
              <div class="mt-3 grid gap-2 md:grid-cols-2">
                <input
                  :value="selectedTemplate.jitter?.speed?.range?.min ?? 0.99"
                  type="number"
                  step="0.01"
                  class="vg-input"
                  @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), speed: { enabled: selectedTemplate.jitter?.speed?.enabled ?? true, range: { min: Number(($event.target as HTMLInputElement).value) || 0.99, max: selectedTemplate.jitter?.speed?.range?.max ?? 1.01 } } } })"
                />
                <input
                  :value="selectedTemplate.jitter?.speed?.range?.max ?? 1.01"
                  type="number"
                  step="0.01"
                  class="vg-input"
                  @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), speed: { enabled: selectedTemplate.jitter?.speed?.enabled ?? true, range: { min: selectedTemplate.jitter?.speed?.range?.min ?? 0.99, max: Number(($event.target as HTMLInputElement).value) || 1.01 } } } })"
                />
              </div>
              <label class="mt-4 flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  :checked="selectedTemplate.jitter?.color?.enabled ?? false"
                  @change="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { ...(selectedTemplate.jitter?.color ?? { brightness: { min: -0.02, max: 0.02 }, contrast: { min: 0.98, max: 1.02 }, saturation: { min: 0.98, max: 1.02 }, hueDeg: { min: -1, max: 1 } }), enabled: ($event.target as HTMLInputElement).checked } } })"
                /> {{ tr('autoUi.k_eebeed545caf') }} </label>
              <div class="mt-3 grid gap-2 md:grid-cols-4">
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_f264f24ca232') }} <input
                    :value="selectedTemplate.jitter?.color?.brightness?.min ?? -0.02"
                    type="number"
                    step="0.01"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: { min: Number(($event.target as HTMLInputElement).value) || 0, max: selectedTemplate.jitter?.color?.brightness?.max ?? 0.02 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_3d516ad44285') }} <input
                    :value="selectedTemplate.jitter?.color?.brightness?.max ?? 0.02"
                    type="number"
                    step="0.01"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: { min: selectedTemplate.jitter?.color?.brightness?.min ?? -0.02, max: Number(($event.target as HTMLInputElement).value) || 0 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_c10851872a65') }} <input
                    :value="selectedTemplate.jitter?.color?.contrast?.min ?? 0.98"
                    type="number"
                    step="0.01"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: { min: Number(($event.target as HTMLInputElement).value) || 0.98, max: selectedTemplate.jitter?.color?.contrast?.max ?? 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_0a61baa70d12') }} <input
                    :value="selectedTemplate.jitter?.color?.contrast?.max ?? 1.02"
                    type="number"
                    step="0.01"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: { min: selectedTemplate.jitter?.color?.contrast?.min ?? 0.98, max: Number(($event.target as HTMLInputElement).value) || 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_46ebbffc3c83') }} <input
                    :value="selectedTemplate.jitter?.color?.saturation?.min ?? 0.98"
                    type="number"
                    step="0.01"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: { min: Number(($event.target as HTMLInputElement).value) || 0.98, max: selectedTemplate.jitter?.color?.saturation?.max ?? 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_a868dd9ae4b7') }} <input
                    :value="selectedTemplate.jitter?.color?.saturation?.max ?? 1.02"
                    type="number"
                    step="0.01"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: { min: selectedTemplate.jitter?.color?.saturation?.min ?? 0.98, max: Number(($event.target as HTMLInputElement).value) || 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_794db55352e8') }} <input
                    :value="selectedTemplate.jitter?.color?.hueDeg?.min ?? -1"
                    type="number"
                    step="0.1"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: { min: Number(($event.target as HTMLInputElement).value) || 0, max: selectedTemplate.jitter?.color?.hueDeg?.max ?? 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_c260a24fd66b') }} <input
                    :value="selectedTemplate.jitter?.color?.hueDeg?.max ?? 1"
                    type="number"
                    step="0.1"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: { min: selectedTemplate.jitter?.color?.hueDeg?.min ?? -1, max: Number(($event.target as HTMLInputElement).value) || 0 } } } })"
                  />
                </label>
              </div>
            </section>

            <section v-if="workspace === 'visual'" class="tpl-soft p-4">
              <div class="mb-3 text-sm font-black text-white">{{ tr('autoUi.k_d9a200c7212f') }}</div>
              <label class="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  :checked="selectedTemplate.colorGrade?.enabled ?? false"
                  @change="updateTemplate(selectedTemplate, { colorGrade: { ...(selectedTemplate.colorGrade ?? { brightness: 0, contrast: 1, saturation: 1 }), enabled: ($event.target as HTMLInputElement).checked } })"
                /> {{ tr('autoUi.k_83c5c36f37b0') }} </label>
              <div class="mt-3 grid gap-2 md:grid-cols-3">
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_5d419889c4a2') }} <input
                    :value="selectedTemplate.colorGrade?.brightness ?? 0"
                    type="number"
                    step="0.01"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { colorGrade: { enabled: selectedTemplate.colorGrade?.enabled ?? true, brightness: Number(($event.target as HTMLInputElement).value) || 0, contrast: selectedTemplate.colorGrade?.contrast ?? 1, saturation: selectedTemplate.colorGrade?.saturation ?? 1 } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_ef765015feb4') }} <input
                    :value="selectedTemplate.colorGrade?.contrast ?? 1"
                    type="number"
                    step="0.01"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { colorGrade: { enabled: selectedTemplate.colorGrade?.enabled ?? true, brightness: selectedTemplate.colorGrade?.brightness ?? 0, contrast: Number(($event.target as HTMLInputElement).value) || 1, saturation: selectedTemplate.colorGrade?.saturation ?? 1 } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_a0ff816aaed7') }} <input
                    :value="selectedTemplate.colorGrade?.saturation ?? 1"
                    type="number"
                    step="0.01"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { colorGrade: { enabled: selectedTemplate.colorGrade?.enabled ?? true, brightness: selectedTemplate.colorGrade?.brightness ?? 0, contrast: selectedTemplate.colorGrade?.contrast ?? 1, saturation: Number(($event.target as HTMLInputElement).value) || 1 } })"
                  />
                </label>
              </div>
            </section>

            <section v-if="workspace === 'subtitle_voice'" class="tpl-soft p-4">
              <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div class="text-sm font-black text-white">{{ tr('autoUi.k_3655f2d5b4ae') }}</div>
                <label class="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    :checked="selectedTemplate.titleOverlay?.enabled ?? false"
                    @change="updateTemplate(selectedTemplate, { titleOverlay: { enabled: ($event.target as HTMLInputElement).checked, textPool: selectedTemplate.titleOverlay?.textPool ?? groupRowsToPool(getTitleRows(selectedTemplate)) } })"
                  /> {{ tr('autoUi.k_af881aa96bb0') }} </label>
              </div>
              <div class="space-y-3">
                <div v-for="(row, idx) in getTitleRows(selectedTemplate)" :key="`title-${selectedTemplate.id}-${idx}`" class="rounded-xl bg-black/20 p-3">
                  <div class="mb-2 flex items-center justify-between gap-2">
                    <div class="text-xs font-bold text-slate-400">{{ tr('autoUi.k_580d9544c498') }} {{ idx + 1 }}</div>
                    <button class="text-xs font-bold text-red-300" @click="removeTitleGroup(selectedTemplate, idx)">{{ tr('autoUi.k_3755f56f2f83') }}</button>
                  </div>
                  <input v-model="row.title" class="vg-input w-full" :placeholder="tr('autoUi.k_d9846fcfc125')" @input="flushTitleGroups(selectedTemplate)" />
                  <textarea v-model="row.symbol" class="vg-input mt-2 min-h-[68px] w-full resize-y" :placeholder="tr('autoUi.k_4acfa404e48e')" @input="flushTitleGroups(selectedTemplate)"></textarea>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <button
                      v-for="symbol in overlaySymbolTemplates.slice(0, 4)"
                      :key="symbol.id"
                      class="vg-btn vg-btn--sm"
                      @click="insertOverlaySymbol(selectedTemplate, symbol.text)"
                    >
                      {{ symbol.label }}
                    </button>
                  </div>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button class="vg-btn vg-btn--sm" @click="addTitleGroup(selectedTemplate)">{{ tr('autoUi.k_f3105664e9ff') }}</button>
                <button class="vg-btn vg-btn--sm" @click="insertOverlayGroup(selectedTemplate, defaultOverlayGroupSymbol)">{{ tr('autoUi.k_6bbb51e9104e') }}</button>
                <button class="vg-btn vg-btn--sm" @click="openSymbolLibModal">{{ tr('autoUi.k_9f28c9cba327') }}</button>
              </div>
            </section>

            <section v-if="workspace === 'subtitle_voice'" class="tpl-soft p-4">
              <div class="mb-3 text-sm font-black text-white">{{ tr('autoUi.k_892c93095f5c') }}</div>
              <label class="mb-3 flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  :checked="selectedTemplate.assSubtitle?.enabled ?? false"
                  @change="updateTemplate(selectedTemplate, { assSubtitle: { enabled: ($event.target as HTMLInputElement).checked, fontName: selectedTemplate.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY, fontSize: selectedTemplate.assSubtitle?.fontSize ?? ASS_DEFAULT_FONT_SIZE, preset: selectedTemplate.assSubtitle?.preset ?? 'white_shadow', marginV: selectedTemplate.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V, ttsMarginV: selectedTemplate.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V } })"
                /> {{ tr('autoUi.k_51b82e4e0729') }} </label>
              <div class="grid gap-2 md:grid-cols-2">
                <button class="vg-btn vg-btn--sm" @click="applySubtitlePresetToSelected('white_shadow')">{{ tr('autoUi.k_746988aa01cf') }}</button>
                <button class="vg-btn vg-btn--sm" @click="applySubtitlePresetToSelected('yellow_box')">{{ tr('autoUi.k_e0f3337364c8') }}</button>
              </div>
              <select
                class="vg-select mt-3 w-full"
                :value="selectedTemplate.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY"
                @change="updateTemplate(selectedTemplate, { assSubtitle: { enabled: true, fontName: ($event.target as HTMLSelectElement).value, fontSize: selectedTemplate.assSubtitle?.fontSize ?? ASS_DEFAULT_FONT_SIZE, preset: selectedTemplate.assSubtitle?.preset ?? 'white_shadow', marginV: selectedTemplate.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V, ttsMarginV: selectedTemplate.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V } })"
              >
                <option v-for="font in assFontChoices" :key="font.familyName" :value="font.familyName">{{ font.familyName }}</option>
              </select>
              <div class="mt-3 grid gap-2 md:grid-cols-3">
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_576ccdb1f1c7') }} <input
                    :value="selectedTemplate.assSubtitle?.fontSize ?? ASS_DEFAULT_FONT_SIZE"
                    type="number"
                    min="24"
                    max="160"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { assSubtitle: { enabled: selectedTemplate.assSubtitle?.enabled ?? true, fontName: selectedTemplate.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY, fontSize: Number(($event.target as HTMLInputElement).value) || ASS_DEFAULT_FONT_SIZE, preset: selectedTemplate.assSubtitle?.preset ?? 'white_shadow', marginV: selectedTemplate.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V, ttsMarginV: selectedTemplate.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_39437b1b484c') }} <input
                    :value="selectedTemplate.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V"
                    type="number"
                    min="0"
                    max="900"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { assSubtitle: { enabled: selectedTemplate.assSubtitle?.enabled ?? true, fontName: selectedTemplate.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY, fontSize: selectedTemplate.assSubtitle?.fontSize ?? ASS_DEFAULT_FONT_SIZE, preset: selectedTemplate.assSubtitle?.preset ?? 'white_shadow', marginV: Number(($event.target as HTMLInputElement).value) || 0, ttsMarginV: selectedTemplate.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_4d35645f092b') }} <input
                    :value="selectedTemplate.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V"
                    type="number"
                    min="0"
                    max="900"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { assSubtitle: { enabled: selectedTemplate.assSubtitle?.enabled ?? true, fontName: selectedTemplate.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY, fontSize: selectedTemplate.assSubtitle?.fontSize ?? ASS_DEFAULT_FONT_SIZE, preset: selectedTemplate.assSubtitle?.preset ?? 'white_shadow', marginV: selectedTemplate.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V, ttsMarginV: Number(($event.target as HTMLInputElement).value) || 0 } })"
                  />
                </label>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button class="vg-btn vg-btn--sm" @click="importFontsFromDialog">{{ tr('autoUi.k_4a9676baeb93') }}</button>
              </div>
            </section>

            <section v-if="workspace === 'subtitle_voice'" class="tpl-soft p-4 xl:col-span-2">
              <div class="mb-3 text-sm font-black text-white">{{ tr('autoUi.k_cc09cb34dcb9') }}</div>
              <div class="grid gap-2 md:grid-cols-[1fr_auto]">
                <select v-model="voiceDraft" class="vg-select">
                  <option v-for="voice in voiceQuickOptions" :key="voice" :value="voice">{{ voice }}</option>
                </select>
                <button class="vg-btn vg-btn--primary vg-btn--sm" @click="applyVoiceToSelected">{{ tr('autoUi.k_db062db6b3e9') }}</button>
              </div>
              <label class="mt-3 flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  :checked="selectedTemplate.tts?.enabled ?? false"
                  @change="updateTemplate(selectedTemplate, { tts: { enabled: ($event.target as HTMLInputElement).checked, textPool: selectedTemplate.tts?.textPool ?? [], voice: selectedTemplate.tts?.voice ?? voiceDraft, mixVolume: selectedTemplate.tts?.mixVolume ?? 0.8, keepOriginal: selectedTemplate.tts?.keepOriginal ?? true } })"
                /> {{ tr('autoUi.k_fc54679205d9') }} </label>
              <textarea
                :value="ensureCopyDraft(selectedTemplate)"
                class="vg-input mt-3 min-h-[180px] w-full resize-y leading-6"
                :placeholder="tr('autoUi.k_8285c0e23b75')"
                @focus="copyEditing[selectedTemplate.id] = true"
                @input="copyDraft[selectedTemplate.id] = ($event.target as HTMLTextAreaElement).value"
                @blur="blurCopyPool(selectedTemplate)"
              ></textarea>
              <div class="mt-3 grid gap-2 md:grid-cols-5">
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_747374775d00') }} <input
                    :value="selectedTemplate.tts?.rate ?? 'default'"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { tts: { enabled: selectedTemplate.tts?.enabled ?? true, textPool: selectedTemplate.tts?.textPool ?? [], voice: selectedTemplate.tts?.voice ?? voiceDraft, rate: ($event.target as HTMLInputElement).value, pitch: selectedTemplate.tts?.pitch ?? 'default', ttsVolume: selectedTemplate.tts?.ttsVolume ?? 'default', mixVolume: selectedTemplate.tts?.mixVolume ?? 0.9, keepOriginal: selectedTemplate.tts?.keepOriginal ?? true } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_bf36f9d87a1d') }} <input
                    :value="selectedTemplate.tts?.pitch ?? 'default'"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { tts: { enabled: selectedTemplate.tts?.enabled ?? true, textPool: selectedTemplate.tts?.textPool ?? [], voice: selectedTemplate.tts?.voice ?? voiceDraft, rate: selectedTemplate.tts?.rate ?? 'default', pitch: ($event.target as HTMLInputElement).value, ttsVolume: selectedTemplate.tts?.ttsVolume ?? 'default', mixVolume: selectedTemplate.tts?.mixVolume ?? 0.9, keepOriginal: selectedTemplate.tts?.keepOriginal ?? true } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_9a5425489f7f') }} <input
                    :value="selectedTemplate.tts?.ttsVolume ?? 'default'"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { tts: { enabled: selectedTemplate.tts?.enabled ?? true, textPool: selectedTemplate.tts?.textPool ?? [], voice: selectedTemplate.tts?.voice ?? voiceDraft, rate: selectedTemplate.tts?.rate ?? 'default', pitch: selectedTemplate.tts?.pitch ?? 'default', ttsVolume: ($event.target as HTMLInputElement).value, mixVolume: selectedTemplate.tts?.mixVolume ?? 0.9, keepOriginal: selectedTemplate.tts?.keepOriginal ?? true } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_97f500d19d6b') }} <input
                    :value="selectedTemplate.tts?.mixVolume ?? 0.9"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    class="vg-input mt-1 w-full"
                    @input="updateTemplate(selectedTemplate, { tts: { enabled: selectedTemplate.tts?.enabled ?? true, textPool: selectedTemplate.tts?.textPool ?? [], voice: selectedTemplate.tts?.voice ?? voiceDraft, rate: selectedTemplate.tts?.rate ?? 'default', pitch: selectedTemplate.tts?.pitch ?? 'default', ttsVolume: selectedTemplate.tts?.ttsVolume ?? 'default', mixVolume: Number(($event.target as HTMLInputElement).value) || 0, keepOriginal: selectedTemplate.tts?.keepOriginal ?? true } })"
                  />
                </label>
                <label class="flex items-end gap-2 pb-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    :checked="selectedTemplate.tts?.keepOriginal ?? true"
                    @change="updateTemplate(selectedTemplate, { tts: { enabled: selectedTemplate.tts?.enabled ?? true, textPool: selectedTemplate.tts?.textPool ?? [], voice: selectedTemplate.tts?.voice ?? voiceDraft, rate: selectedTemplate.tts?.rate ?? 'default', pitch: selectedTemplate.tts?.pitch ?? 'default', ttsVolume: selectedTemplate.tts?.ttsVolume ?? 'default', mixVolume: selectedTemplate.tts?.mixVolume ?? 0.9, keepOriginal: ($event.target as HTMLInputElement).checked } })"
                  /> {{ tr('autoUi.k_1d7df020475d') }} </label>
              </div>
              <div v-if="copyPoolBusy[selectedTemplate.id]" class="mt-2 text-xs text-violet-200">{{ tr('autoUi.k_180a7b92dac2') }}</div>
            </section>

            <section v-if="workspace === 'audio'" class="tpl-soft p-4">
              <div class="mb-3 text-sm font-black text-white">BGM</div>
              <div class="flex gap-2">
                <button class="vg-btn vg-btn--sm flex-1" @click="pickBgm(selectedTemplate)">{{ tr('autoUi.k_77185fecef31') }}</button>
                <button class="vg-btn vg-btn--sm" @click="clearBgm(selectedTemplate)">{{ tr('autoUi.k_84fcd70d4280') }}</button>
              </div>
              <div v-if="selectedTemplate.bgm?.filePaths?.length" class="mt-3 space-y-2">
                <div v-for="path in selectedTemplate.bgm.filePaths" :key="path" class="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2 text-xs text-slate-400">
                  <span class="truncate">{{ path }}</span>
                  <button class="text-red-300" @click="removeBgmItem(selectedTemplate, path)">{{ tr('autoUi.k_2f752c005ec5') }}</button>
                </div>
              </div>
              <div v-else class="mt-3 text-xs text-slate-500">{{ tr('autoUi.k_2bbb3ef778c2') }}</div>
              <label class="mt-3 block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_26dba926b369') }} <input
                  :value="selectedTemplate.bgm?.volume ?? 0.25"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  class="vg-input mt-1 w-full"
                  @input="updateTemplate(selectedTemplate, { bgm: { filePaths: selectedTemplate.bgm?.filePaths ?? [], volume: Number(($event.target as HTMLInputElement).value) || 0 } })"
                />
              </label>
            </section>

            <section v-if="workspace === 'visual'" class="tpl-soft p-4">
              <div class="mb-3 text-sm font-black text-white">{{ tr('autoUi.k_47838bf03ebc') }}</div>
              <div class="grid gap-3 md:grid-cols-2">
                <select
                  class="vg-select w-full"
                  :value="selectedTemplate.lut3d?.fileName ?? ''"
                  @change="updateTemplate(selectedTemplate, { lut3d: ($event.target as HTMLSelectElement).value ? { fileName: ($event.target as HTMLSelectElement).value } : null })"
                >
                  <option value="">{{ tr('autoUi.k_2fe9072dd04d') }}</option>
                  <option v-for="lut in lutOptions" :key="lut.fileName" :value="lut.fileName">{{ lut.displayName }}</option>
                </select>
                <select
                  class="vg-select w-full"
                  :value="getStickerRefFromTemplate(selectedTemplate)"
                  @change="(() => { const opt = findStickerOptionByRef(($event.target as HTMLSelectElement).value); updateTemplate(selectedTemplate, { sticker: opt ? { ref: opt.ref, fileName: opt.fileName, heightPx: selectedTemplate.sticker?.heightPx ?? 180 } : null }) })()"
                >
                  <option value="">{{ tr('autoUi.k_7e1bc82ca787') }}</option>
                  <option v-for="sticker in stickerOptions" :key="sticker.ref" :value="sticker.ref">{{ sticker.displayName }}</option>
                </select>
              </div>
              <label class="mt-3 block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_84231f205c51') }} <input
                  :value="selectedTemplate.sticker?.heightPx ?? 180"
                  type="number"
                  min="40"
                  max="720"
                  class="vg-input mt-1 w-full"
                  @input="selectedTemplate.sticker && updateTemplate(selectedTemplate, { sticker: { ...selectedTemplate.sticker, heightPx: Number(($event.target as HTMLInputElement).value) || 180 } })"
                />
              </label>
              <button class="vg-btn vg-btn--sm mt-3" @click="importStickersFromDialog">{{ tr('autoUi.k_2e73d9d19058') }}</button>
            </section>
            </div>
          </section>
        </template>
      </main>

      <!-- 当前段设置 -->
      <aside v-if="selectedTemplate" class="tpl-card tpl-side tpl-inspector">
        <div>
          <h2 class="tpl-h2">{{ tr('tplx.segPanel') }}</h2>
          <p class="tpl-muted">{{ tr('tplx.segPanelHint') }}</p>
        </div>
        <template v-if="activeSeg">
          <div class="tpl-seg-pick">
            <button
              v-for="seg in selectedTemplate.structure"
              :key="`pick-${seg}`"
              type="button"
              class="tpl-tag"
              :class="[segToneClass(seg), { 'is-active': activeSeg === seg }]"
              @click="selectedSeg = seg"
            >{{ segLabel(seg) }}</button>
          </div>

          <div class="tpl-insp-block">
            <div class="tpl-insp-title">
              <span class="tpl-dot" :class="segToneClass(activeSeg)"></span>
              <strong>{{ segLabel(activeSeg) }}</strong>
              <code>{{ activeSeg }}</code>
            </div>
            <div class="vg-field">
              <span class="vg-field__label">{{ tr('tplx.segDur') }}</span>
              <RangeInput
                :model-value="segDur(selectedTemplate, activeSeg)"
                :step="0.1"
                :min="0.3"
                :max="30"
                unit="s"
                @update:model-value="(v) => setSegDur(selectedTemplate!, activeSeg, v)"
              />
            </div>
            <div class="vg-field">
              <span class="vg-field__label">{{ tr('tplx.segZoom') }}</span>
              <RangeInput
                :model-value="{ min: segFx(selectedTemplate, activeSeg).zoom?.min ?? 1, max: segFx(selectedTemplate, activeSeg).zoom?.max ?? 1.06 }"
                :step="0.01"
                :min="1"
                :max="1.3"
                unit="x"
                @update:model-value="(v) => setSegFx(selectedTemplate!, activeSeg, { zoom: v })"
              />
            </div>
            <div class="vg-field">
              <span class="vg-field__label">{{ tr('tplx.segMoveX') }}</span>
              <RangeInput
                :model-value="segFx(selectedTemplate, activeSeg).move?.x ?? { min: -0.02, max: 0.02 }"
                :step="0.01"
                :min="-0.2"
                :max="0.2"
                @update:model-value="(v) => setSegFx(selectedTemplate!, activeSeg, { move: { x: v, y: segFx(selectedTemplate!, activeSeg).move?.y ?? { min: -0.015, max: 0.015 } } })"
              />
            </div>
            <div class="vg-field">
              <span class="vg-field__label">{{ tr('tplx.segMoveY') }}</span>
              <RangeInput
                :model-value="segFx(selectedTemplate, activeSeg).move?.y ?? { min: -0.015, max: 0.015 }"
                :step="0.01"
                :min="-0.2"
                :max="0.2"
                @update:model-value="(v) => setSegFx(selectedTemplate!, activeSeg, { move: { x: segFx(selectedTemplate!, activeSeg).move?.x ?? { min: -0.02, max: 0.02 }, y: v } })"
              />
            </div>
            <div class="tpl-insp-actions">
              <button class="vg-btn vg-btn--sm" type="button" @click="moveSegment(selectedTemplate, activeSeg, -1)"><ChevronUp :size="14" /> {{ tr('tplx.moveUp') }}</button>
              <button class="vg-btn vg-btn--sm" type="button" @click="moveSegment(selectedTemplate, activeSeg, 1)"><ChevronDown :size="14" /> {{ tr('tplx.moveDown') }}</button>
              <button class="vg-btn vg-btn--danger vg-btn--sm" type="button" @click="removeSegment(selectedTemplate, activeSeg)"><Trash2 :size="14" /> {{ tr('tplx.removeSeg') }}</button>
            </div>
          </div>
        </template>

        <div class="tpl-insp-block">
          <div class="tpl-insp-title"><strong>{{ tr('tplx.rulesTitle') }}</strong></div>
          <dl class="tpl-rules">
            <template v-for="row in rulesOverview" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd :class="{ 'is-on': row.on }">{{ row.value }}</dd>
            </template>
          </dl>
        </div>
      </aside>
    </div>
  </div>

  <!-- AI 识别视频 → 模板 -->
  <div v-if="importOpen" class="vg-scope vg-backdrop" @click.self="closeImport">
    <div class="vg-dialog vg-dialog--wide tpl-modal tpl-import" @click.stop>
      <div class="tpl-import__head">
        <span class="tpl-hero__icon tpl-hero__icon--sm"><Wand2 :size="18" /></span>
        <div class="min-w-0 flex-1">
          <div class="tpl-h2">{{ tr('tplx.importTitle') }}</div>
          <p class="tpl-muted">{{ tr('tplx.importDesc') }}</p>
        </div>
        <button type="button" class="vg-btn vg-btn--sm" :disabled="importStage === 'analyzing'" @click="closeImport"><X :size="14" /></button>
      </div>

      <!-- 选择 -->
      <div v-if="importStage === 'pick'" class="tpl-import__body">
        <button type="button" class="tpl-drop" @click="pickImportVideo">
          <Upload :size="26" />
          <strong>{{ tr('tplx.pickVideo') }}</strong>
          <span>{{ tr('tplx.pickHint') }}</span>
        </button>
        <div class="tpl-soft tpl-folder">
          <div class="min-w-0 flex-1">
            <div class="text-sm font-bold text-white">{{ tr('tplx.folderTitle') }}</div>
            <div class="tpl-muted">{{ tr('tplx.folderDesc') }}</div>
          </div>
          <input v-model="styleAnalyzeDir" class="vg-input tpl-folder__input" :placeholder="tr('autoUi.k_8bfe156bb4b6')" />
          <button type="button" class="vg-btn vg-btn--sm" @click="pickAnalyzeFolder"><FolderOpen :size="14" /></button>
          <button type="button" class="vg-btn vg-btn--sm" :disabled="styleAnalyzing" @click="runFolderAnalyze">
            <Loader2 v-if="styleAnalyzing" :size="14" class="animate-spin" /> {{ tr('tplx.folderRun') }}
          </button>
        </div>
      </div>

      <!-- 识别中 -->
      <div v-else-if="importStage === 'analyzing'" class="tpl-import__body">
        <div class="tpl-analyzing">
          <Loader2 :size="22" class="animate-spin" />
          <div>
            <strong>{{ tr('tplx.analyzing', { name: importFileName }) }}</strong>
            <div class="tpl-muted">{{ tr('tplx.elapsed', { s: importElapsed }) }}</div>
          </div>
        </div>
        <ol class="tpl-stages">
          <li v-for="(label, i) in importStages" :key="label" :class="{ 'is-done': i < importStageIndex, 'is-active': i === importStageIndex }">
            <CheckCircle2 v-if="i < importStageIndex" :size="15" />
            <Loader2 v-else-if="i === importStageIndex" :size="15" class="animate-spin" />
            <span v-else class="tpl-stages__dot"></span>
            {{ label }}
          </li>
        </ol>
      </div>

      <!-- 失败 -->
      <div v-else-if="importStage === 'error'" class="tpl-import__body">
        <div class="tpl-alert">
          <AlertTriangle :size="16" />
          <div><strong>{{ tr('tplx.failed') }}</strong><div>{{ importError }}</div></div>
        </div>
        <div class="flex justify-end gap-2">
          <button type="button" class="vg-btn vg-btn--sm" @click="importStage = 'pick'">{{ tr('tplx.reselect') }}</button>
          <button v-if="importFile" type="button" class="vg-btn vg-btn--primary vg-btn--sm" @click="runImport(importFile)">{{ tr('tplx.retry') }}</button>
        </div>
      </div>

      <!-- 确认 -->
      <div v-else-if="importStage === 'review' && importDraft" class="tpl-import__body">
        <label class="vg-field">
          <span class="vg-field__label">{{ tr('tplx.reviewName') }}</span>
          <input v-model="importName" class="vg-input" />
        </label>
        <div class="tpl-review-kpis">
          <div><span>{{ tr('tplx.reviewDur') }}</span><b>{{ importDraft.durationSec }}s</b></div>
          <div><span>{{ tr('tplx.reviewShots') }}</span><b>{{ importDraft.shotCount }}</b></div>
          <div><span>{{ tr('tplx.reviewSegs') }}</span><b>{{ importDraft.template.structure.length }}</b></div>
          <div><span>{{ tr('tplx.reviewRatio') }}</span><b>{{ importDraft.aspectRatio || '-' }}</b></div>
        </div>
        <div class="tpl-timeline tpl-timeline--compact">
          <div
            v-for="seg in importDraft.template.structure"
            :key="`draft-${seg}`"
            class="tpl-block"
            :class="segToneClass(seg)"
            :style="{ flexGrow: draftSegAvg(seg) }"
          >
            <strong class="tpl-block__name">{{ segLabel(seg) }}</strong>
            <span class="tpl-block__dur">{{ importDraft.template.segmentDurationSec?.[seg]?.min }}–{{ importDraft.template.segmentDurationSec?.[seg]?.max }}s</span>
          </div>
        </div>
        <div v-if="importDraft.scriptAnalysisError" class="tpl-alert tpl-alert--warn">
          <AlertTriangle :size="16" />
          <div>{{ tr('tplx.scriptWarn', { msg: importDraft.scriptAnalysisError }) }}</div>
        </div>
        <div class="tpl-muted mt-1">{{ tr('tplx.shotsTitle') }}</div>
        <div class="tpl-shots tpl-shots--compact">
          <article v-for="shot in importDraft.shots" :key="`ds-${shot.index}`" class="tpl-shot">
            <div class="tpl-shot__thumb">
              <img v-if="shot.thumbnailPath" :src="thumbnailUrl(shot.thumbnailPath, 120)" alt="" />
              <Film v-else :size="18" />
              <span class="tpl-shot__time">{{ formatSec(shot.startSec) }}</span>
            </div>
            <div class="tpl-shot__body">
              <div class="tpl-shot__tags">
                <span class="tpl-tag" :class="segToneClass(shot.segment)">{{ segLabel(shot.segment) }}</span>
                <span class="tpl-muted">{{ shot.durationSec }}s · {{ motionLabel(shot.motion) }}</span>
              </div>
              <p v-if="shot.scriptText" class="tpl-shot__text">{{ shot.scriptText }}</p>
            </div>
          </article>
        </div>
        <div class="tpl-import__opts">
          <label v-if="importDraft.template.tts" class="vg-switch" :class="{ 'is-on': importKeepVoice }">
            <input v-model="importKeepVoice" type="checkbox" class="sr-only" />
            <span class="vg-switch__track"></span>
            <span>{{ tr('tplx.keepVoice') }} <small>{{ tr('tplx.keepVoiceHint') }}</small></span>
          </label>
          <label v-if="importDraft.template.titleOverlay" class="vg-switch" :class="{ 'is-on': importKeepCaption }">
            <input v-model="importKeepCaption" type="checkbox" class="sr-only" />
            <span class="vg-switch__track"></span>
            <span>{{ tr('tplx.keepCaption') }} <small>{{ tr('tplx.keepCaptionHint') }}</small></span>
          </label>
        </div>
        <div class="flex justify-end gap-2 border-t border-white/10 pt-3">
          <button type="button" class="vg-btn vg-btn--sm" @click="importStage = 'pick'">{{ tr('tplx.reselect') }}</button>
          <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="importSaving || !importName.trim()" @click="saveImport">
            <Loader2 v-if="importSaving" :size="14" class="animate-spin" /> {{ tr('tplx.saveTpl') }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Template preset selection -->
  <div
    v-if="presetPickerOpen"
    class="vg-scope vg-backdrop"
    @click.self="closePresetPicker"
  >
    <div class="vg-dialog vg-dialog--wide tpl-modal" @click.stop>
      <div class="text-sm font-semibold text-white/90">{{ tr('tpl.presetModalTitle') }}</div>
      <div class="mt-1 text-[11px] text-white/45">
        {{ tr('tpl.presetModalDesc', { name: presetTarget?.name ?? '-' }) }}
      </div>
      <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <button
          v-for="item in presetChoices"
          :key="item.key"
          type="button"
          class="vg-card vg-card--interactive tpl-preset"
          @click="applyTemplatePreset(item.key)"
        >
          <div class="text-sm font-semibold text-white/90">{{ item.title }}</div>
          <div class="mt-1 text-[11px] text-white/50">{{ item.desc }}</div>
        </button>
      </div>
      <div class="mt-4 flex justify-end">
        <button type="button" class="vg-btn vg-btn--sm" @click="closePresetPicker">{{ tr('common.cancel') }}</button>
      </div>
    </div>
  </div>

  <!-- Editable symbol template library persisted in localStorage. -->
  <div
    v-if="symbolLibOpen"
    class="vg-scope vg-backdrop"
    @click.self="cancelSymbolLibModal"
  >
    <div
      class="vg-dialog tpl-modal tpl-modal--scroll"
      @click.stop
    >
      <div class="text-sm font-semibold text-white/90">{{ tr('tpl.symbolLibModalTitle') }}</div>
      <div class="mt-1 text-[11px] text-white/45">{{ tr('tpl.symbolLibHint') }}</div>
      <div class="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <div class="grid grid-cols-[minmax(0,72px)_1fr_auto] gap-2 text-[11px] text-white/50">
          <span>{{ tr('tpl.symbolLibColLabel') }}</span>
          <span>{{ tr('tpl.symbolLibColText') }}</span>
          <span class="inline-block w-9 shrink-0" aria-hidden="true"></span>
        </div>
        <div
          v-for="row in symbolLibDraft"
          :key="row.id"
          class="grid grid-cols-[minmax(0,72px)_1fr_auto] items-start gap-2"
        >
          <input v-model="row.label" class="vg-input" maxlength="64" />
          <input v-model="row.text" class="vg-input" />
          <button type="button" class="vg-btn vg-btn--sm" :title="tr('common.remove')" @click="removeSymbolLibRow(row.id)">
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <button type="button" class="vg-btn vg-btn--sm" @click="addSymbolLibRow">{{ tr('tpl.symbolLibAdd') }}</button>
        <button type="button" class="vg-btn vg-btn--sm" @click="resetSymbolLibModalDraft">{{
          tr('tpl.symbolLibReset')
        }}</button>
        <div class="min-w-[8px] flex-1"></div>
        <button type="button" class="vg-btn vg-btn--sm" @click="cancelSymbolLibModal">{{ tr('common.cancel') }}</button>
        <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" @click="saveSymbolLibModal">{{ tr('common.save') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Templates page on the vg- kit.
 * The markup still uses Tailwind colour utilities written for the old dark-only
 * look; inside this page they are re-pointed at theme tokens so every theme
 * renders consistently. Scoped (unlayered) rules win over Tailwind's layer. */
.tpl { width: min(1480px, 100%); margin: 0 auto; }

/* Page surfaces */
.tpl-card { background: var(--theme-panel); border: 1px solid var(--theme-border); border-radius: var(--vg-radius); min-width: 0; }
.tpl-soft { background: var(--theme-panel-soft); border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); color: var(--theme-text); }
.tpl-h2 { font-size: 15px; font-weight: 700; color: var(--theme-text); line-height: 1.3; }
.tpl-muted { font-size: 12px; color: var(--theme-text-muted); line-height: 1.5; }
.tpl-count { min-width: 22px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); font-size: 11px; font-weight: 600; color: var(--theme-text-secondary); display: inline-flex; align-items: center; justify-content: center; }

/* Layout */
.tpl-layout { display: grid; gap: 16px; align-items: start; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1280px) { .tpl-layout { grid-template-columns: 272px minmax(0, 1fr) 300px; } }
.tpl-main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.tpl-side { display: flex; flex-direction: column; gap: 12px; padding: 14px; }
@media (min-width: 1280px) { .tpl-side { position: sticky; top: 12px; max-height: calc(100vh - 120px); overflow-y: auto; } }
.tpl-side__head { display: flex; align-items: center; justify-content: space-between; }
.tpl-side__list { display: flex; flex-direction: column; gap: 6px; }
.tpl-side__empty { padding: 16px 8px; text-align: center; font-size: 12px; color: var(--theme-text-muted); }
.tpl-search { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; border: 1px solid var(--theme-border-control); border-radius: var(--vg-radius-sm); background: var(--theme-input); color: var(--theme-text-muted); }
.tpl-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--theme-text); font-size: 13px; }
.tpl-search:focus-within { border-color: var(--vg-accent); }
.tpl-create { display: flex; gap: 6px; }

/* Template list items */
.tpl-item { position: relative; display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); text-align: left; cursor: pointer; transition: border-color .15s, background .15s; }
.tpl-item:hover { border-color: var(--vg-accent-line); }
.tpl-item.is-active { border-color: var(--vg-accent); background: var(--vg-accent-soft); }
.tpl-item__top { display: flex; align-items: center; gap: 6px; padding-right: 20px; }
.tpl-item__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; color: var(--theme-text); }
.tpl-item__meta { font-size: 11px; color: var(--theme-text-muted); }
.tpl-item__del { position: absolute; top: 9px; right: 8px; display: inline-flex; padding: 2px; border-radius: 6px; color: var(--theme-text-muted); opacity: 0; transition: opacity .15s, color .15s; }
.tpl-item:hover .tpl-item__del, .tpl-item.is-active .tpl-item__del { opacity: 1; }
.tpl-item__del:hover { color: var(--vg-red); }
.tpl-strip { display: flex; gap: 2px; height: 5px; }
.tpl-strip__bar { flex-basis: 0; border-radius: 3px; background: var(--seg); opacity: .85; }

/* Source badges */
.tpl-src { flex-shrink: 0; padding: 1px 7px; border-radius: 999px; font-size: 10.5px; font-weight: 600; line-height: 16px; border: 1px solid transparent; }
.tpl-src--ai { color: var(--vg-accent); background: var(--vg-accent-soft); border-color: var(--vg-accent-line); }
.tpl-src--clone { color: var(--vg-violet); background: color-mix(in srgb, var(--vg-violet) 12%, transparent); }
.tpl-src--manual { color: var(--theme-text-muted); background: var(--theme-panel); border-color: var(--theme-border); }

/* Segment tones */
.tone-hook { --seg: var(--vg-amber); }
.tone-pain { --seg: var(--vg-red); }
.tone-show { --seg: var(--vg-accent); }
.tone-detail { --seg: var(--vg-blue); }
.tone-scene { --seg: var(--vg-violet); }
.tone-proof { --seg: var(--vg-green); }
.tone-offer { --seg: color-mix(in srgb, var(--vg-red) 55%, var(--vg-amber)); }
.tone-cta { --seg: color-mix(in srgb, var(--vg-blue) 50%, var(--vg-violet)); }
.tone-other { --seg: var(--theme-text-muted); }
.tpl-tag { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 11.5px; font-weight: 600; color: var(--seg); background: color-mix(in srgb, var(--seg) 13%, transparent); border: 1px solid color-mix(in srgb, var(--seg) 30%, transparent); white-space: nowrap; }
button.tpl-tag { cursor: pointer; }
button.tpl-tag.is-active { background: var(--seg); color: var(--theme-panel); }
.tpl-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--seg); flex-shrink: 0; }

/* Empty hero */
.tpl-hero { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 56px 24px; text-align: center; }
.tpl-hero h2 { font-size: 20px; font-weight: 700; color: var(--theme-text); }
.tpl-hero p { max-width: 520px; font-size: 13px; line-height: 1.7; color: var(--theme-text-secondary); }
.tpl-hero__icon { display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; border-radius: 16px; background: var(--vg-accent-soft); color: var(--vg-accent); }
.tpl-hero__icon--sm { width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0; }
.tpl-hero__steps { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 20px; margin: 6px 0 8px; font-size: 12.5px; color: var(--theme-text-secondary); }
.tpl-hero__steps li { display: inline-flex; align-items: center; gap: 8px; }
.tpl-hero__steps b { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); font-size: 11px; color: var(--vg-accent); }

/* Template head */
.tpl-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; }
.tpl-head__title { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.tpl-head__sub { display: flex; align-items: center; gap: 10px; min-width: 0; }
.tpl-head__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.tpl-name { width: 100%; padding: 2px 6px; margin-left: -6px; border: 1px solid transparent; border-radius: 6px; background: transparent; font-size: 19px; font-weight: 700; color: var(--theme-text); outline: none; }
.tpl-name:hover { border-color: var(--theme-border); }
.tpl-name:focus { border-color: var(--vg-accent); background: var(--theme-input); }
.tpl-save { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; font-size: 11.5px; color: var(--theme-text-muted); white-space: nowrap; }
.tpl-save:not(.is-busy) svg { color: var(--vg-green); }

/* Sections */
.tpl-section { padding: 16px; }
.tpl-section__head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.tpl-addseg { display: flex; gap: 6px; }
.tpl-addseg .vg-input { width: 190px; height: 32px; }

/* Timeline */
.tpl-timeline { display: flex; gap: 6px; min-height: 108px; overflow-x: auto; padding-bottom: 2px; }
.tpl-timeline--compact { min-height: 58px; }
.tpl-block { position: relative; flex-basis: 0; min-width: 112px; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 10px 12px 10px 14px; border: 1px solid color-mix(in srgb, var(--seg) 28%, var(--theme-border)); border-radius: var(--vg-radius-sm); background: color-mix(in srgb, var(--seg) 9%, var(--theme-panel-soft)); text-align: left; cursor: pointer; transition: border-color .15s, box-shadow .15s, transform .15s; overflow: hidden; }
.tpl-block::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--seg); }
.tpl-block:hover { border-color: var(--seg); }
.tpl-block.is-active { border-color: var(--seg); box-shadow: 0 0 0 1px var(--seg) inset, 0 6px 18px -10px var(--seg); }
.tpl-timeline--compact .tpl-block { min-width: 84px; padding: 8px 10px 8px 12px; cursor: default; }
.tpl-block__idx { display: inline-flex; align-items: center; gap: 2px; font-size: 10.5px; color: var(--theme-text-muted); cursor: grab; }
.tpl-block__name { font-size: 13.5px; font-weight: 700; color: var(--theme-text); white-space: nowrap; }
.tpl-block__key { font-family: ui-monospace, monospace; font-size: 10.5px; color: var(--theme-text-muted); }
.tpl-block__dur { margin-top: auto; font-size: 12px; font-weight: 600; color: var(--seg); }
.tpl-block__fx { font-size: 11px; color: var(--theme-text-muted); white-space: nowrap; }
.tpl-ruler { display: flex; justify-content: space-between; margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--theme-border); font-size: 10.5px; color: var(--theme-text-muted); }

/* Reference breakdown */
.tpl-insight { margin-bottom: 14px; padding: 12px 14px; border-radius: var(--vg-radius-sm); border: 1px solid var(--vg-accent-line); background: var(--vg-accent-soft); font-size: 12.5px; line-height: 1.6; color: var(--theme-text-secondary); }
.tpl-insight__title { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-weight: 700; color: var(--vg-accent); }
.tpl-insight dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin-top: 6px; }
.tpl-insight dt { color: var(--theme-text-muted); white-space: nowrap; }
.tpl-insight dd { color: var(--theme-text); }
.tpl-shots { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.tpl-shots--compact { max-height: 240px; overflow-y: auto; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
.tpl-shot { display: flex; gap: 10px; padding: 8px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); cursor: pointer; transition: border-color .15s; min-width: 0; }
.tpl-shot:hover, .tpl-shot.is-active { border-color: var(--vg-accent-line); }
.tpl-shot__thumb { position: relative; flex-shrink: 0; width: 54px; height: 72px; border-radius: 6px; overflow: hidden; background: var(--theme-input); display: flex; align-items: center; justify-content: center; color: var(--theme-text-muted); }
.tpl-shot__thumb img { width: 100%; height: 100%; object-fit: cover; }
.tpl-shot__time { position: absolute; left: 3px; bottom: 3px; padding: 0 4px; border-radius: 4px; background: rgba(0, 0, 0, .65); font-size: 10px; line-height: 15px; color: #fff; font-variant-numeric: tabular-nums; }
.tpl-shot__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.tpl-shot__tags { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tpl-shot__text { font-size: 12px; line-height: 1.5; color: var(--theme-text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tpl-shot__text b { margin-right: 6px; font-weight: 600; color: var(--theme-text-muted); }

/* Inspector */
.tpl-seg-pick { display: flex; flex-wrap: wrap; gap: 6px; }
.tpl-insp-block { display: flex; flex-direction: column; gap: 12px; padding: 12px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); }
.tpl-insp-title { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--theme-text); }
.tpl-insp-title code { margin-left: auto; font-size: 11px; color: var(--theme-text-muted); }
.tpl-insp-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.tpl-rules { display: grid; grid-template-columns: 1fr auto; gap: 8px 10px; font-size: 12.5px; }
.tpl-rules dt { color: var(--theme-text-muted); }
.tpl-rules dd { text-align: right; color: var(--theme-text-secondary); }
.tpl-rules dd.is-on { color: var(--theme-text); font-weight: 600; }

/* Import dialog */
.tpl-import { display: flex; flex-direction: column; gap: 16px; max-height: min(760px, 90vh); }
.tpl-import__head { display: flex; align-items: flex-start; gap: 12px; }
.tpl-import__body { display: flex; flex-direction: column; gap: 14px; min-height: 0; overflow-y: auto; }
.tpl-import__opts { display: flex; flex-direction: column; gap: 10px; }
.tpl-drop { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 36px 16px; border: 1.5px dashed var(--vg-accent-line); border-radius: var(--vg-radius); background: var(--vg-accent-soft); color: var(--vg-accent); cursor: pointer; transition: border-color .15s, transform .15s; }
.tpl-drop:hover { border-color: var(--vg-accent); }
.tpl-drop strong { font-size: 15px; color: var(--theme-text); }
.tpl-drop span { font-size: 12px; color: var(--theme-text-muted); }
.tpl-folder { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px; }
.tpl-folder__input { width: 200px; height: 32px; }
.tpl-analyzing { display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: var(--vg-radius-sm); background: var(--vg-accent-soft); color: var(--vg-accent); }
.tpl-analyzing strong { color: var(--theme-text); font-size: 14px; }
.tpl-stages { display: flex; flex-direction: column; gap: 10px; padding: 0 4px; font-size: 13px; color: var(--theme-text-muted); }
.tpl-stages li { display: flex; align-items: center; gap: 10px; }
.tpl-stages li.is-active { color: var(--theme-text); font-weight: 600; }
.tpl-stages li.is-active svg { color: var(--vg-accent); }
.tpl-stages li.is-done { color: var(--theme-text-secondary); }
.tpl-stages li.is-done svg { color: var(--vg-green); }
.tpl-stages__dot { width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid var(--theme-border-control); }
.tpl-alert { display: flex; gap: 10px; padding: 12px 14px; border-radius: var(--vg-radius-sm); border: 1px solid color-mix(in srgb, var(--vg-red) 35%, transparent); background: color-mix(in srgb, var(--vg-red) 10%, transparent); color: var(--vg-red); font-size: 12.5px; line-height: 1.6; word-break: break-word; }
.tpl-alert strong { display: block; color: var(--theme-text); }
.tpl-alert > div { color: var(--theme-text-secondary); }
.tpl-alert--warn { border-color: color-mix(in srgb, var(--vg-amber) 35%, transparent); background: color-mix(in srgb, var(--vg-amber) 10%, transparent); color: var(--vg-amber); }
.tpl-review-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.tpl-review-kpis > div { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); }
.tpl-review-kpis span { font-size: 11.5px; color: var(--theme-text-muted); }
.tpl-review-kpis b { font-size: 16px; color: var(--theme-text); }
@media (max-width: 640px) { .tpl-review-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

/* Tables keep kit look even with Tailwind padding utilities */
.tpl .vg-table thead { background: var(--theme-panel-soft); }

/* Dialogs */
.tpl-modal { padding: 18px 20px; gap: 0; }
.tpl-modal--scroll { max-height: min(560px, 85vh); }
.tpl-preset { text-align: left; }

/* Colour utilities -> tokens */
.text-white, .text-white\/90 { color: var(--theme-text); }
.text-slate-300, .text-slate-400 { color: var(--theme-text-secondary); }
.text-slate-500, .text-white\/45, .text-white\/50 { color: var(--theme-text-muted); }
.text-white\/25 { color: var(--theme-border-control); }
.text-violet-200, .text-violet-300 { color: var(--vg-accent); }
.text-red-300 { color: var(--vg-red); }
.bg-black\/20 { background-color: var(--theme-input); }
.bg-white\/10 { background-color: var(--theme-divider); }
.bg-white\/\[0\.04\], .bg-white\/\[0\.035\] { background-color: var(--theme-panel-soft); }
.border-white\/10 { border-color: var(--theme-border); }
.ring-white\/10 { --tw-ring-color: var(--theme-border); }
</style>
