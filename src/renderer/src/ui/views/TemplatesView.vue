<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import UiCard from '../components/UiCard.vue'
import UiButton from '../components/UiButton.vue'
import UiChip from '../components/UiChip.vue'
import UiWorkspaceSidebar from '../components/UiWorkspaceSidebar.vue'
import RangeInput from '../components/RangeInput.vue'
import ProductionTabs from '../components/ProductionTabs.vue'
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  Loader2,
  Music2,
  Plus,
  Trash2,
  Wand2,
  X,
} from 'lucide-vue-next'
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

const { t: tr } = useI18n()
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
    source?: 'clone_blueprint'
    cloneProjectId?: string
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
  const next = (['library', 'studio', 'subtitle_presets', 'voice_library'].includes(mode) ? mode : 'studio') as TemplateWorkspace
  workspace.value = next
  const t = selectedTemplate.value
  if (!t) return
  expanded.value[t.id] = true
  if (next === 'subtitle_presets' || next === 'voice_library') {
    activeTab.value[t.id] = 'av_text'
  } else if (next === 'studio') {
    activeTab.value[t.id] = currentTab(t.id) as any
  }
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
  const base = productSegments.value.length ? productSegments.value : (['hook', 'show', 'detail'] as string[])
  try {
    await window.api.templates.upsert({ name, structure: base })
    form.name = ''
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
    window.alert(tr('tpl.styleAnalyzeDone'))
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
</script>

<template>
  <div class="app-page space-y-5">
    <ProductionTabs />
    <header class="app-card flex flex-wrap items-start justify-between gap-4 p-5">
      <div>
        <div class="text-xs font-black uppercase tracking-[0.22em] text-violet-300">{{ tr('autoUi.k_42bae137bfd0') }}</div>
        <h1 class="mt-2 text-2xl font-black text-white">{{ tr('autoUi.k_508b6f10d1f6') }}</h1>
        <p class="mt-2 text-sm text-slate-400">{{ tr('autoUi.k_c5d58c4a6e65') }}</p>
      </div>
      <button class="app-ghost px-4 py-2 text-sm" @click="templateAdvancedOpen = !templateAdvancedOpen">
        {{ templateAdvancedOpen ? tr('autoUi.k_3d70d528e945') : tr('autoUi.k_dd07e641ca66') }}
      </button>
    </header>

    <section class="app-card px-4 py-3">
      <div class="flex flex-wrap items-center gap-2">
        <div class="mr-2 shrink-0 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{{ tr('autoUi.k_a72ef18d9a0e') }}</div>
        <input v-model="templateNewSegName" class="ui-input h-9 min-w-[180px] flex-[1_1_220px]" :placeholder="tr('autoUi.k_61609bd83fa0')" @keydown.enter.prevent="selectedTemplate && addSegment(selectedTemplate)" />
        <button class="app-primary h-9 px-3 text-xs" :disabled="!selectedTemplate" @click="selectedTemplate && addSegment(selectedTemplate)">{{ tr('autoUi.k_b416e5df78b8') }}</button>
        <div class="mx-1 hidden h-5 w-px bg-white/10 lg:block"></div>
        <input v-model="styleAnalyzeDir" class="ui-input h-9 min-w-[180px] flex-[1_1_260px]" :placeholder="tr('autoUi.k_8bfe156bb4b6')" />
        <button class="app-ghost h-9 px-3 text-xs" :disabled="styleAnalyzing" @click="analyzeVideosAndCreateTemplate">
          {{ styleAnalyzing ? tr('autoUi.k_4e9160839cf4') : tr('autoUi.k_cdcb894c06b1') }}
        </button>
        <div v-if="styleSummary" class="ml-auto min-w-0 truncate text-xs text-slate-500">
          {{ styleSummary.fileCount }} {{ tr('autoUi.k_bdfbf23831cb') }} {{ styleSummary.mainResolution }} · {{ styleSummary.cutTendency }}
        </div>
      </div>
    </section>

    <div class="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
      <aside class="app-card space-y-3 p-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-black text-white">{{ tr('autoUi.k_14c9bcea5e35') }}</h2>
            <p class="mt-1 text-xs text-slate-500">{{ list.length }} {{ tr('autoUi.k_8cf9d07d6288') }}</p>
          </div>
        </div>
        <div class="flex gap-2">
          <input v-model="form.name" class="ui-input h-10 min-w-0 flex-1" :placeholder="tr('tpl.newNamePh')" />
          <UiButton variant="accent" @click="createTemplate"><Plus class="h-4 w-4" /></UiButton>
        </div>
        <button
          v-for="tpl in list"
          :key="tpl.id"
          class="app-soft-card group w-full p-3 text-left transition hover:bg-white/[0.06]"
          :class="{ 'ring-1 ring-violet-400/50 bg-violet-500/15': selectedTemplate?.id === tpl.id }"
          @click="selectTemplate(tpl.id)"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <strong class="block truncate text-sm text-white">{{ templateDisplayName(tpl) }}</strong>
              <small class="mt-1 block text-xs text-slate-500">{{ tr('tpl.totalDur', { min: tpl.totalDurationSec.min, max: tpl.totalDurationSec.max }) }}</small>
              <div v-if="tpl.meta?.source === 'clone_blueprint'" class="mt-2 flex flex-wrap gap-1">
                <span class="rounded-full bg-violet-500/15 px-2 py-1 text-[10px] font-bold text-violet-200">{{ tr('autoUi.k_7cf5da95058a') }}</span>
                <span class="rounded-full bg-white/8 px-2 py-1 text-[10px] text-slate-300">{{ templateHookTypeLabel(tpl.meta?.hookType) }}</span>
                <span class="rounded-full bg-white/8 px-2 py-1 text-[10px] text-slate-300">{{ templateProductTypeLabel(tpl.meta?.productCategory) }}</span>
              </div>
            </div>
            <button
              class="shrink-0 rounded-md border border-red-400/25 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-200 opacity-80 transition hover:bg-red-500/20 group-hover:opacity-100"
              :title="tr('autoUi.k_b31745bdff4e')"
              @click.stop="removeTemplate(tpl.id)"
            > {{ tr('autoUi.k_3755f56f2f83') }} </button>
          </div>
        </button>
        <div v-if="!list.length" class="app-soft-card p-5 text-sm text-slate-400">{{ tr('autoUi.k_71af99620e73') }}</div>
      </aside>

      <main class="app-card min-w-0 p-5">
        <div class="mb-5 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-black text-white">{{ tr('autoUi.k_ebe5d70f9a14') }}</h2>
            <p class="mt-1 text-xs text-slate-500">{{ templateDisplayName(selectedTemplate) || tr('autoUi.k_371fb3fb7ae6') }}</p>
          </div>
          <button v-if="selectedTemplate" class="app-ghost px-3 py-2 text-xs" @click="openPresetPicker(selectedTemplate)">{{ tr('autoUi.k_9a0158b486f8') }}</button>
        </div>
        <div v-if="selectedTemplate" class="flex flex-wrap items-center gap-3">
          <template v-for="(seg, idx) in selectedTemplate.structure" :key="`${selectedTemplate.id}-${seg}-${idx}`">
            <div class="app-flow-node">
              <strong>{{ seg.toUpperCase() }}</strong>
              <span>{{ tr('tpl.segDur', { min: segDur(selectedTemplate, seg).min, max: segDur(selectedTemplate, seg).max }) }}</span>
              <small>{{ tr('autoUi.k_9d99dac5fbcf') }} {{ segFx(selectedTemplate, seg).zoom?.min ?? 1 }} - {{ segFx(selectedTemplate, seg).zoom?.max ?? 1.06 }}</small>
            </div>
            <span v-if="idx < selectedTemplate.structure.length - 1" class="text-white/25">→</span>
          </template>
        </div>
        <div v-else class="app-soft-card grid min-h-[420px] place-items-center p-8 text-center text-sm text-slate-400"> {{ tr('autoUi.k_71af99620e73') }} </div>

        <div v-if="selectedTemplate" class="mt-6 overflow-hidden rounded-xl border border-white/10">
          <table class="w-full text-left text-sm">
            <thead class="bg-white/[0.04] text-xs text-slate-500">
              <tr>
                <th class="px-4 py-3">{{ tr('autoUi.k_1279939a7427') }}</th>
                <th class="px-4 py-3">{{ tr('autoUi.k_29d0552d2e4c') }}</th>
                <th class="px-4 py-3">{{ tr('autoUi.k_0118461d56e8') }}</th>
                <th class="px-4 py-3">{{ tr('autoUi.k_82b64f9960a8') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="seg in selectedTemplate.structure" :key="seg" class="border-t border-white/10 text-slate-300">
                <td class="px-4 py-3 font-bold text-white">{{ seg.toUpperCase() }}</td>
                <td class="px-4 py-3">{{ segDur(selectedTemplate, seg).min }} - {{ segDur(selectedTemplate, seg).max }}s</td>
                <td class="px-4 py-3">Zoom {{ segFx(selectedTemplate, seg).zoom?.min ?? 1 }} - {{ segFx(selectedTemplate, seg).zoom?.max ?? 1.06 }}</td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1">
                    <button class="app-ghost px-2 py-1 text-[10px]" @click="moveSegment(selectedTemplate, seg, -1)">{{ tr('autoUi.k_8a0c839791d3') }}</button>
                    <button class="app-ghost px-2 py-1 text-[10px]" @click="moveSegment(selectedTemplate, seg, 1)">{{ tr('autoUi.k_05c46fa3b77c') }}</button>
                    <button class="rounded-md border border-red-400/30 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-200" @click="removeSegment(selectedTemplate, seg)">{{ tr('autoUi.k_3755f56f2f83') }}</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <section v-if="selectedTemplate?.meta?.source === 'clone_blueprint'" class="mt-6 grid gap-3 md:grid-cols-2">
          <div class="app-soft-card p-4">
            <div class="text-sm font-black text-white">{{ tr('autoUi.k_8222dbd32528') }}</div>
            <div class="mt-3 space-y-2 text-sm text-slate-300">
              <div>{{ tr('autoUi.k_e6bb01c6f837') }}</div>
              <div>{{ tr('autoUi.k_af0970740161') }}{{ templateHookTypeLabel(selectedTemplate.meta?.hookType) }}</div>
              <div>{{ tr('autoUi.k_f4595798fb69') }}{{ templateProductTypeLabel(selectedTemplate.meta?.productCategory) }}</div>
              <div>{{ tr('autoUi.k_98737ae281d9') }}{{ selectedTemplate.meta?.rhythm?.cutDensity || 'medium' }}</div>
              <div>{{ tr('autoUi.k_51e5c2043884') }}{{ selectedTemplate.meta?.rhythm?.first3SecShotCount ?? 0 }}</div>
              <div>{{ tr('autoUi.k_0649f0de72f8') }}</div>
            </div>
          </div>
          <div class="app-soft-card p-4">
            <div class="text-sm font-black text-white">{{ tr('autoUi.k_97779e2726fc') }}</div>
            <div class="mt-3 space-y-2 text-sm text-slate-300">
              <div>{{ tr('autoUi.k_f14e1e658c86') }}{{ selectedTemplate.meta?.visualStyle?.scene || tr('autoUi.k_86f9195e25e4') }}</div>
              <div>{{ tr('autoUi.k_79241900d773') }}{{ selectedTemplate.meta?.visualStyle?.lighting || tr('autoUi.k_86f9195e25e4') }}</div>
              <div>{{ tr('autoUi.k_da56d654f05a') }}{{ selectedTemplate.meta?.visualStyle?.cameraStyle || tr('autoUi.k_86f9195e25e4') }}</div>
              <div>{{ tr('autoUi.k_51d8c0b478c8') }}{{ selectedTemplate.meta?.visualStyle?.movementStyle || tr('autoUi.k_86f9195e25e4') }}</div>
              <div>{{ tr('autoUi.k_332a9a0d569c') }}{{ selectedTemplate.meta?.visualStyle?.realismStyle || 'ugc' }}</div>
              <div>{{ tr('autoUi.k_ba60c24a47d5') }}</div>
            </div>
          </div>
        </section>
        <section v-if="selectedTemplate?.meta?.source === 'clone_blueprint'" class="mt-3">
          <div class="app-soft-card p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="text-sm font-black text-white">{{ tr('autoUi.k_1df6f3e6e92d') }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ tr('autoUi.k_74878d8853ce') }}</div>
              </div>
              <button class="app-ghost px-3 py-2 text-xs" @click="openCloneWithTemplate(selectedTemplate)">{{ tr('autoUi.k_228cbba7e92f') }}</button>
            </div>
            <div class="mt-3 space-y-2 text-sm text-slate-300">
              <div>{{ tr('autoUi.k_dff042c80c67') }}</div>
              <div>{{ tr('autoUi.k_a3250c3a1e1e') }}</div>
              <div>{{ tr('autoUi.k_c7bc58485c48') }}</div>
            </div>
          </div>
        </section>

        <section v-if="selectedTemplate && expanded[selectedTemplate.id]" class="mt-6 space-y-4 rounded-xl bg-white/[0.035] p-4 ring-1 ring-white/10">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-black text-white">{{ tr('autoUi.k_8e67f2128b9b') }}</h3>
              <p class="mt-1 text-xs text-slate-500">{{ tr('autoUi.k_ee9684155466') }}</p>
            </div>
            <div class="app-tabs">
              <button v-for="item in workspaceItems" :key="item.key" class="app-tab" :class="{ 'is-active': workspace === item.key }" @click="activateWorkspace(String(item.key))">
                {{ item.label }}
              </button>
            </div>
          </div>

          <div class="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <section v-if="workspace === 'structure'" class="app-soft-card p-4 xl:col-span-2">
              <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div class="text-sm font-black text-white">{{ tr('autoUi.k_508b6f10d1f6') }}</div>
                  <p class="mt-1 text-sm leading-6 text-slate-400">{{ tr('autoUi.k_be017ffd92fd') }}</p>
                </div>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_c0c31eb37b19') }} <input v-model="templateNewSegName" class="ui-input mt-2 h-10 w-full" placeholder="proof / cta" @keydown.enter.prevent="addSegment(selectedTemplate)" />
                </label>
                <div class="flex items-end gap-2">
                  <button class="app-primary h-10 px-4 text-xs" @click="addSegment(selectedTemplate)">{{ tr('autoUi.k_80be7ec3cff8') }}</button>
                </div>
              </div>
            </section>

            <section v-if="workspace === 'structure'" class="app-soft-card p-4">
              <div class="mb-3 text-sm font-black text-white">{{ tr('autoUi.k_39e0624819a0') }}</div>
              <div class="grid gap-3 md:grid-cols-2">
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_6f11716bec3f') }} <input
                    :value="selectedTemplate.totalDurationSec.min"
                    type="number"
                    min="3"
                    max="60"
                    class="ui-input mt-2 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { totalDurationSec: { ...selectedTemplate.totalDurationSec, min: Number(($event.target as HTMLInputElement).value) || 3 } })"
                  />
                </label>
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_a99e0085ce67') }} <input
                    :value="selectedTemplate.totalDurationSec.max"
                    type="number"
                    min="3"
                    max="60"
                    class="ui-input mt-2 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { totalDurationSec: { ...selectedTemplate.totalDurationSec, max: Number(($event.target as HTMLInputElement).value) || selectedTemplate.totalDurationSec.min } })"
                  />
                </label>
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_85736c94a112') }} <input
                    :value="selectedTemplate.skipStartSec ?? 0"
                    type="number"
                    min="0"
                    max="30"
                    step="0.1"
                    class="ui-input mt-2 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { skipStartSec: Number(($event.target as HTMLInputElement).value) || 0 })"
                  />
                </label>
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_5b63183a8d2a') }} <input
                    :value="selectedTemplate.randomizeOrder?.keepFirstCount ?? 1"
                    type="number"
                    min="0"
                    :max="selectedTemplate.structure.length"
                    class="ui-input mt-2 h-10 w-full"
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
                    class="ui-input mt-2 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { transition: { enabled: selectedTemplate.transition?.enabled ?? true, type: 'fade', durationSec: { min: Number(($event.target as HTMLInputElement).value) || 0, max: selectedTemplate.transition?.durationSec?.max ?? 0.45 } } })"
                  />
                </label>
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_66bca9b92773') }} <input
                    :value="selectedTemplate.transition?.durationSec?.max ?? 0.45"
                    type="number"
                    min="0"
                    max="3"
                    step="0.05"
                    class="ui-input mt-2 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { transition: { enabled: selectedTemplate.transition?.enabled ?? true, type: 'fade', durationSec: { min: selectedTemplate.transition?.durationSec?.min ?? 0.2, max: Number(($event.target as HTMLInputElement).value) || 0.45 } } })"
                  />
                </label>
              </div>
            </section>

            <section v-if="workspace === 'audio'" class="app-soft-card p-4">
              <div class="mb-3 text-sm font-black text-white">{{ tr('autoUi.k_7f87addec71e') }}</div>
              <div class="grid gap-3 md:grid-cols-2">
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_ed6eca3bfb96') }} <select
                    class="ui-select mt-2 h-10 w-full"
                    :value="(selectedTemplate.audio as any)?.source ?? 'keep'"
                    @change="updateTemplate(selectedTemplate, { audio: { ...((selectedTemplate.audio as any) ?? {}), source: ($event.target as HTMLSelectElement).value, ducking: selectedTemplate.audio?.ducking ?? { enabled: false, amountDb: 12 } } as any })"
                  >
                    <option value="keep">{{ tr('autoUi.k_1d7df020475d') }}</option>
                    <option value="mute">{{ tr('autoUi.k_f93150b2636d') }}</option>
                  </select>
                </label>
                <label class="block text-xs font-bold text-slate-500"> {{ tr('autoUi.k_d0b4e58a0845') }} <select
                    class="ui-select mt-2 h-10 w-full"
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
                    class="ui-input mt-2 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { audio: { ...((selectedTemplate.audio as any) ?? {}), ducking: { enabled: selectedTemplate.audio?.ducking?.enabled ?? true, amountDb: Number(($event.target as HTMLInputElement).value) || 0 } } as any })"
                  />
                </label>
              </div>
            </section>

            <section v-if="workspace === 'structure'" class="app-soft-card p-4 xl:col-span-2">
              <div class="mb-3 text-sm font-black text-white">{{ tr('autoUi.k_a939e16b1711') }}</div>
              <div class="space-y-3">
                <div v-for="seg in selectedTemplate.structure" :key="`edit-${seg}`" class="rounded-xl bg-black/20 p-3">
                  <div class="mb-3 flex items-center justify-between gap-3">
                    <div class="text-sm font-black text-white">{{ seg.toUpperCase() }}</div>
                    <div class="flex gap-1">
                      <button class="app-ghost px-2 py-1 text-[10px]" @click="moveSegment(selectedTemplate, seg, -1)">{{ tr('autoUi.k_8a0c839791d3') }}</button>
                      <button class="app-ghost px-2 py-1 text-[10px]" @click="moveSegment(selectedTemplate, seg, 1)">{{ tr('autoUi.k_05c46fa3b77c') }}</button>
                    </div>
                  </div>
                  <div class="grid gap-2 md:grid-cols-4">
                    <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_18f363d298c3') }} <input
                        :value="segDur(selectedTemplate, seg).min"
                        type="number"
                        step="0.1"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentDurationSec: { ...(selectedTemplate.segmentDurationSec ?? {}), [seg]: { ...segDur(selectedTemplate, seg), min: Number(($event.target as HTMLInputElement).value) || 0.1 } } })"
                      />
                    </label>
                    <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_f9bca0e0632a') }} <input
                        :value="segDur(selectedTemplate, seg).max"
                        type="number"
                        step="0.1"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentDurationSec: { ...(selectedTemplate.segmentDurationSec ?? {}), [seg]: { ...segDur(selectedTemplate, seg), max: Number(($event.target as HTMLInputElement).value) || 0.1 } } })"
                      />
                    </label>
                    <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_aedba82cb73e') }} <input
                        :value="segFx(selectedTemplate, seg).zoom?.min ?? 1"
                        type="number"
                        step="0.01"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentFx: { ...(selectedTemplate.segmentFx ?? {}), [seg]: { ...segFx(selectedTemplate, seg), zoom: { min: Number(($event.target as HTMLInputElement).value) || 1, max: segFx(selectedTemplate, seg).zoom?.max ?? 1.06 } } } })"
                      />
                    </label>
                    <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_94d1144a92c2') }} <input
                        :value="segFx(selectedTemplate, seg).zoom?.max ?? 1.06"
                        type="number"
                        step="0.01"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentFx: { ...(selectedTemplate.segmentFx ?? {}), [seg]: { ...segFx(selectedTemplate, seg), zoom: { min: segFx(selectedTemplate, seg).zoom?.min ?? 1, max: Number(($event.target as HTMLInputElement).value) || 1.06 } } } })"
                      />
                    </label>
                  </div>
                  <div class="mt-2 grid gap-2 md:grid-cols-4">
                    <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_6e84cb33295a') }} <input
                        :value="segFx(selectedTemplate, seg).move?.x?.min ?? -0.02"
                        type="number"
                        step="0.01"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentFx: { ...(selectedTemplate.segmentFx ?? {}), [seg]: { ...segFx(selectedTemplate, seg), move: { x: { min: Number(($event.target as HTMLInputElement).value) || 0, max: segFx(selectedTemplate, seg).move?.x?.max ?? 0.02 }, y: segFx(selectedTemplate, seg).move?.y ?? { min: -0.015, max: 0.015 } } } } })"
                      />
                    </label>
                    <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_a7949d6b9cfb') }} <input
                        :value="segFx(selectedTemplate, seg).move?.x?.max ?? 0.02"
                        type="number"
                        step="0.01"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentFx: { ...(selectedTemplate.segmentFx ?? {}), [seg]: { ...segFx(selectedTemplate, seg), move: { x: { min: segFx(selectedTemplate, seg).move?.x?.min ?? -0.02, max: Number(($event.target as HTMLInputElement).value) || 0 }, y: segFx(selectedTemplate, seg).move?.y ?? { min: -0.015, max: 0.015 } } } } })"
                      />
                    </label>
                    <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_c7095093be28') }} <input
                        :value="segFx(selectedTemplate, seg).move?.y?.min ?? -0.015"
                        type="number"
                        step="0.01"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentFx: { ...(selectedTemplate.segmentFx ?? {}), [seg]: { ...segFx(selectedTemplate, seg), move: { x: segFx(selectedTemplate, seg).move?.x ?? { min: -0.02, max: 0.02 }, y: { min: Number(($event.target as HTMLInputElement).value) || 0, max: segFx(selectedTemplate, seg).move?.y?.max ?? 0.015 } } } } })"
                      />
                    </label>
                    <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_23e6b2dd8b83') }} <input
                        :value="segFx(selectedTemplate, seg).move?.y?.max ?? 0.015"
                        type="number"
                        step="0.01"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentFx: { ...(selectedTemplate.segmentFx ?? {}), [seg]: { ...segFx(selectedTemplate, seg), move: { x: segFx(selectedTemplate, seg).move?.x ?? { min: -0.02, max: 0.02 }, y: { min: segFx(selectedTemplate, seg).move?.y?.min ?? -0.015, max: Number(($event.target as HTMLInputElement).value) || 0 } } } } })"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <section v-if="workspace === 'visual'" class="app-soft-card p-4">
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
                  class="ui-input h-10"
                  @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), speed: { enabled: selectedTemplate.jitter?.speed?.enabled ?? true, range: { min: Number(($event.target as HTMLInputElement).value) || 0.99, max: selectedTemplate.jitter?.speed?.range?.max ?? 1.01 } } } })"
                />
                <input
                  :value="selectedTemplate.jitter?.speed?.range?.max ?? 1.01"
                  type="number"
                  step="0.01"
                  class="ui-input h-10"
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
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: { min: Number(($event.target as HTMLInputElement).value) || 0, max: selectedTemplate.jitter?.color?.brightness?.max ?? 0.02 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_3d516ad44285') }} <input
                    :value="selectedTemplate.jitter?.color?.brightness?.max ?? 0.02"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: { min: selectedTemplate.jitter?.color?.brightness?.min ?? -0.02, max: Number(($event.target as HTMLInputElement).value) || 0 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_c10851872a65') }} <input
                    :value="selectedTemplate.jitter?.color?.contrast?.min ?? 0.98"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: { min: Number(($event.target as HTMLInputElement).value) || 0.98, max: selectedTemplate.jitter?.color?.contrast?.max ?? 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_0a61baa70d12') }} <input
                    :value="selectedTemplate.jitter?.color?.contrast?.max ?? 1.02"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: { min: selectedTemplate.jitter?.color?.contrast?.min ?? 0.98, max: Number(($event.target as HTMLInputElement).value) || 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_46ebbffc3c83') }} <input
                    :value="selectedTemplate.jitter?.color?.saturation?.min ?? 0.98"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: { min: Number(($event.target as HTMLInputElement).value) || 0.98, max: selectedTemplate.jitter?.color?.saturation?.max ?? 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_a868dd9ae4b7') }} <input
                    :value="selectedTemplate.jitter?.color?.saturation?.max ?? 1.02"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: { min: selectedTemplate.jitter?.color?.saturation?.min ?? 0.98, max: Number(($event.target as HTMLInputElement).value) || 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_794db55352e8') }} <input
                    :value="selectedTemplate.jitter?.color?.hueDeg?.min ?? -1"
                    type="number"
                    step="0.1"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: { min: Number(($event.target as HTMLInputElement).value) || 0, max: selectedTemplate.jitter?.color?.hueDeg?.max ?? 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_c260a24fd66b') }} <input
                    :value="selectedTemplate.jitter?.color?.hueDeg?.max ?? 1"
                    type="number"
                    step="0.1"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: { min: selectedTemplate.jitter?.color?.hueDeg?.min ?? -1, max: Number(($event.target as HTMLInputElement).value) || 0 } } } })"
                  />
                </label>
              </div>
            </section>

            <section v-if="workspace === 'visual'" class="app-soft-card p-4">
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
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { colorGrade: { enabled: selectedTemplate.colorGrade?.enabled ?? true, brightness: Number(($event.target as HTMLInputElement).value) || 0, contrast: selectedTemplate.colorGrade?.contrast ?? 1, saturation: selectedTemplate.colorGrade?.saturation ?? 1 } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_ef765015feb4') }} <input
                    :value="selectedTemplate.colorGrade?.contrast ?? 1"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { colorGrade: { enabled: selectedTemplate.colorGrade?.enabled ?? true, brightness: selectedTemplate.colorGrade?.brightness ?? 0, contrast: Number(($event.target as HTMLInputElement).value) || 1, saturation: selectedTemplate.colorGrade?.saturation ?? 1 } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_a0ff816aaed7') }} <input
                    :value="selectedTemplate.colorGrade?.saturation ?? 1"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { colorGrade: { enabled: selectedTemplate.colorGrade?.enabled ?? true, brightness: selectedTemplate.colorGrade?.brightness ?? 0, contrast: selectedTemplate.colorGrade?.contrast ?? 1, saturation: Number(($event.target as HTMLInputElement).value) || 1 } })"
                  />
                </label>
              </div>
            </section>

            <section v-if="workspace === 'subtitle_voice'" class="app-soft-card p-4">
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
                  <input v-model="row.title" class="ui-input h-10 w-full" :placeholder="tr('autoUi.k_d9846fcfc125')" @input="flushTitleGroups(selectedTemplate)" />
                  <textarea v-model="row.symbol" class="ui-input mt-2 min-h-[68px] w-full resize-y py-2" :placeholder="tr('autoUi.k_4acfa404e48e')" @input="flushTitleGroups(selectedTemplate)"></textarea>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <button
                      v-for="symbol in overlaySymbolTemplates.slice(0, 4)"
                      :key="symbol.id"
                      class="app-ghost px-2 py-1 text-[10px]"
                      @click="insertOverlaySymbol(selectedTemplate, symbol.text)"
                    >
                      {{ symbol.label }}
                    </button>
                  </div>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button class="app-ghost px-3 py-2 text-xs" @click="addTitleGroup(selectedTemplate)">{{ tr('autoUi.k_f3105664e9ff') }}</button>
                <button class="app-ghost px-3 py-2 text-xs" @click="insertOverlayGroup(selectedTemplate, defaultOverlayGroupSymbol)">{{ tr('autoUi.k_6bbb51e9104e') }}</button>
                <button class="app-ghost px-3 py-2 text-xs" @click="openSymbolLibModal">{{ tr('autoUi.k_9f28c9cba327') }}</button>
              </div>
            </section>

            <section v-if="workspace === 'subtitle_voice'" class="app-soft-card p-4">
              <div class="mb-3 text-sm font-black text-white">{{ tr('autoUi.k_892c93095f5c') }}</div>
              <label class="mb-3 flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  :checked="selectedTemplate.assSubtitle?.enabled ?? false"
                  @change="updateTemplate(selectedTemplate, { assSubtitle: { enabled: ($event.target as HTMLInputElement).checked, fontName: selectedTemplate.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY, fontSize: selectedTemplate.assSubtitle?.fontSize ?? ASS_DEFAULT_FONT_SIZE, preset: selectedTemplate.assSubtitle?.preset ?? 'white_shadow', marginV: selectedTemplate.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V, ttsMarginV: selectedTemplate.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V } })"
                /> {{ tr('autoUi.k_51b82e4e0729') }} </label>
              <div class="grid gap-2 md:grid-cols-2">
                <button class="app-ghost px-3 py-2 text-xs" @click="applySubtitlePresetToSelected('white_shadow')">{{ tr('autoUi.k_746988aa01cf') }}</button>
                <button class="app-ghost px-3 py-2 text-xs" @click="applySubtitlePresetToSelected('yellow_box')">{{ tr('autoUi.k_e0f3337364c8') }}</button>
              </div>
              <select
                class="ui-select mt-3 h-10 w-full"
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
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { assSubtitle: { enabled: selectedTemplate.assSubtitle?.enabled ?? true, fontName: selectedTemplate.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY, fontSize: Number(($event.target as HTMLInputElement).value) || ASS_DEFAULT_FONT_SIZE, preset: selectedTemplate.assSubtitle?.preset ?? 'white_shadow', marginV: selectedTemplate.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V, ttsMarginV: selectedTemplate.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_39437b1b484c') }} <input
                    :value="selectedTemplate.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V"
                    type="number"
                    min="0"
                    max="900"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { assSubtitle: { enabled: selectedTemplate.assSubtitle?.enabled ?? true, fontName: selectedTemplate.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY, fontSize: selectedTemplate.assSubtitle?.fontSize ?? ASS_DEFAULT_FONT_SIZE, preset: selectedTemplate.assSubtitle?.preset ?? 'white_shadow', marginV: Number(($event.target as HTMLInputElement).value) || 0, ttsMarginV: selectedTemplate.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_4d35645f092b') }} <input
                    :value="selectedTemplate.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V"
                    type="number"
                    min="0"
                    max="900"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { assSubtitle: { enabled: selectedTemplate.assSubtitle?.enabled ?? true, fontName: selectedTemplate.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY, fontSize: selectedTemplate.assSubtitle?.fontSize ?? ASS_DEFAULT_FONT_SIZE, preset: selectedTemplate.assSubtitle?.preset ?? 'white_shadow', marginV: selectedTemplate.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V, ttsMarginV: Number(($event.target as HTMLInputElement).value) || 0 } })"
                  />
                </label>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button class="app-ghost px-3 py-2 text-xs" @click="importFontsFromDialog">{{ tr('autoUi.k_4a9676baeb93') }}</button>
              </div>
            </section>

            <section v-if="workspace === 'subtitle_voice'" class="app-soft-card p-4 xl:col-span-2">
              <div class="mb-3 text-sm font-black text-white">{{ tr('autoUi.k_cc09cb34dcb9') }}</div>
              <div class="grid gap-2 md:grid-cols-[1fr_auto]">
                <select v-model="voiceDraft" class="ui-select h-10">
                  <option v-for="voice in voiceQuickOptions" :key="voice" :value="voice">{{ voice }}</option>
                </select>
                <button class="app-primary px-4 text-xs" @click="applyVoiceToSelected">{{ tr('autoUi.k_db062db6b3e9') }}</button>
              </div>
              <label class="mt-3 flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  :checked="selectedTemplate.tts?.enabled ?? false"
                  @change="updateTemplate(selectedTemplate, { tts: { enabled: ($event.target as HTMLInputElement).checked, textPool: selectedTemplate.tts?.textPool ?? [], voice: selectedTemplate.tts?.voice ?? voiceDraft, mixVolume: selectedTemplate.tts?.mixVolume ?? 0.8, keepOriginal: selectedTemplate.tts?.keepOriginal ?? true } })"
                /> {{ tr('autoUi.k_fc54679205d9') }} </label>
              <textarea
                :value="ensureCopyDraft(selectedTemplate)"
                class="ui-input mt-3 min-h-[180px] w-full resize-y py-3 text-sm leading-6"
                :placeholder="tr('autoUi.k_8285c0e23b75')"
                @focus="copyEditing[selectedTemplate.id] = true"
                @input="copyDraft[selectedTemplate.id] = ($event.target as HTMLTextAreaElement).value"
                @blur="blurCopyPool(selectedTemplate)"
              ></textarea>
              <div class="mt-3 grid gap-2 md:grid-cols-5">
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_747374775d00') }} <input
                    :value="selectedTemplate.tts?.rate ?? 'default'"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { tts: { enabled: selectedTemplate.tts?.enabled ?? true, textPool: selectedTemplate.tts?.textPool ?? [], voice: selectedTemplate.tts?.voice ?? voiceDraft, rate: ($event.target as HTMLInputElement).value, pitch: selectedTemplate.tts?.pitch ?? 'default', ttsVolume: selectedTemplate.tts?.ttsVolume ?? 'default', mixVolume: selectedTemplate.tts?.mixVolume ?? 0.9, keepOriginal: selectedTemplate.tts?.keepOriginal ?? true } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_bf36f9d87a1d') }} <input
                    :value="selectedTemplate.tts?.pitch ?? 'default'"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { tts: { enabled: selectedTemplate.tts?.enabled ?? true, textPool: selectedTemplate.tts?.textPool ?? [], voice: selectedTemplate.tts?.voice ?? voiceDraft, rate: selectedTemplate.tts?.rate ?? 'default', pitch: ($event.target as HTMLInputElement).value, ttsVolume: selectedTemplate.tts?.ttsVolume ?? 'default', mixVolume: selectedTemplate.tts?.mixVolume ?? 0.9, keepOriginal: selectedTemplate.tts?.keepOriginal ?? true } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_9a5425489f7f') }} <input
                    :value="selectedTemplate.tts?.ttsVolume ?? 'default'"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { tts: { enabled: selectedTemplate.tts?.enabled ?? true, textPool: selectedTemplate.tts?.textPool ?? [], voice: selectedTemplate.tts?.voice ?? voiceDraft, rate: selectedTemplate.tts?.rate ?? 'default', pitch: selectedTemplate.tts?.pitch ?? 'default', ttsVolume: ($event.target as HTMLInputElement).value, mixVolume: selectedTemplate.tts?.mixVolume ?? 0.9, keepOriginal: selectedTemplate.tts?.keepOriginal ?? true } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500"> {{ tr('autoUi.k_97f500d19d6b') }} <input
                    :value="selectedTemplate.tts?.mixVolume ?? 0.9"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    class="ui-input mt-1 h-10 w-full"
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

            <section v-if="workspace === 'audio'" class="app-soft-card p-4">
              <div class="mb-3 text-sm font-black text-white">BGM</div>
              <div class="flex gap-2">
                <button class="app-ghost flex-1 px-3 py-2 text-xs" @click="pickBgm(selectedTemplate)">{{ tr('autoUi.k_77185fecef31') }}</button>
                <button class="app-ghost px-3 py-2 text-xs" @click="clearBgm(selectedTemplate)">{{ tr('autoUi.k_84fcd70d4280') }}</button>
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
                  class="ui-input mt-1 h-10 w-full"
                  @input="updateTemplate(selectedTemplate, { bgm: { filePaths: selectedTemplate.bgm?.filePaths ?? [], volume: Number(($event.target as HTMLInputElement).value) || 0 } })"
                />
              </label>
            </section>

            <section v-if="workspace === 'visual'" class="app-soft-card p-4">
              <div class="mb-3 text-sm font-black text-white">{{ tr('autoUi.k_47838bf03ebc') }}</div>
              <div class="grid gap-3 md:grid-cols-2">
                <select
                  class="ui-select h-10 w-full"
                  :value="selectedTemplate.lut3d?.fileName ?? ''"
                  @change="updateTemplate(selectedTemplate, { lut3d: ($event.target as HTMLSelectElement).value ? { fileName: ($event.target as HTMLSelectElement).value } : null })"
                >
                  <option value="">{{ tr('autoUi.k_2fe9072dd04d') }}</option>
                  <option v-for="lut in lutOptions" :key="lut.fileName" :value="lut.fileName">{{ lut.displayName }}</option>
                </select>
                <select
                  class="ui-select h-10 w-full"
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
                  class="ui-input mt-1 h-10 w-full"
                  @input="selectedTemplate.sticker && updateTemplate(selectedTemplate, { sticker: { ...selectedTemplate.sticker, heightPx: Number(($event.target as HTMLInputElement).value) || 180 } })"
                />
              </label>
              <button class="app-ghost mt-3 px-3 py-2 text-xs" @click="importStickersFromDialog">{{ tr('autoUi.k_2e73d9d19058') }}</button>
            </section>
          </div>
        </section>
      </main>

      <aside class="app-card space-y-4 p-4">
        <div>
          <h2 class="text-lg font-black text-white">{{ tr('autoUi.k_187677d07af7') }}</h2>
          <p class="mt-1 text-xs text-slate-500">{{ tr('autoUi.k_58f6dff9dd38') }}</p>
        </div>
        <template v-if="selectedTemplate">
          <div class="app-soft-card p-3 text-xs text-slate-300">
            <div>{{ tr('autoUi.k_e2ceac018cc0') }}{{ selectedTemplate.totalDurationSec.min }} - {{ selectedTemplate.totalDurationSec.max }}s</div>
            <div class="mt-1">{{ tr('autoUi.k_15f6addc1021') }}{{ selectedTemplate.transition?.enabled ? tr('autoUi.k_25d284315063') : tr('autoUi.k_8bb38ef00ccc') }}</div>
          </div>
          <button class="app-ghost w-full px-3 py-2 text-xs" @click="expanded[selectedTemplate.id] = !expanded[selectedTemplate.id]">
            {{ expanded[selectedTemplate.id] ? tr('autoUi.k_56af34e7c5b6') : tr('autoUi.k_af5a5bd865cd') }}
          </button>
          <button class="app-ghost w-full px-3 py-2 text-xs" @click="templateAdvancedOpen = !templateAdvancedOpen">
            {{ templateAdvancedOpen ? tr('autoUi.k_c5f6a2584003') : tr('autoUi.k_706c47870ca5') }}
          </button>
          <div v-if="templateAdvancedOpen" class="app-soft-card p-3">
            <UiWorkspaceSidebar
              :model-value="workspace"
              :title="tr('tpl.sidebarTitle')"
              :subtitle="tr('tpl.pageSub')"
              :items="workspaceItems"
              :footer-text="workspaceHint"
              @update:model-value="activateWorkspace"
            />
          </div>
        </template>
      </aside>
    </div>
  </div>
            <!-- Template preset selection -->
  <div
    v-if="presetPickerOpen"
    class="fixed inset-0 z-[101] flex items-center justify-center bg-black/60 p-4"
    @click.self="closePresetPicker"
  >
    <div class="w-full max-w-2xl rounded-xl border border-white/10 bg-[#18181B] p-4 shadow-2xl shadow-black/50" @click.stop>
      <div class="text-sm font-semibold text-white/90">{{ tr('tpl.presetModalTitle') }}</div>
      <div class="mt-1 text-[11px] text-white/45">
        {{ tr('tpl.presetModalDesc', { name: presetTarget?.name ?? '-' }) }}
      </div>
      <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <button
          v-for="item in presetChoices"
          :key="item.key"
          type="button"
          class="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-indigo-300/30 hover:bg-indigo-400/10"
          @click="applyTemplatePreset(item.key)"
        >
          <div class="text-sm font-semibold text-white/90">{{ item.title }}</div>
          <div class="mt-1 text-[11px] text-white/50">{{ item.desc }}</div>
        </button>
      </div>
      <div class="mt-4 flex justify-end">
        <UiButton class="h-9 px-3 text-[13px]" variant="ghost" @click="closePresetPicker">{{ tr('common.cancel') }}</UiButton>
      </div>
    </div>
  </div>

            <!-- Editable symbol template library persisted in localStorage. -->
  <div
    v-if="symbolLibOpen"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
    @click.self="cancelSymbolLibModal"
  >
    <div
      class="flex max-h-[min(560px,85vh)] w-full max-w-lg flex-col rounded-xl border border-white/10 bg-[#18181B] p-4 shadow-2xl shadow-black/50"
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
          <input v-model="row.label" class="ui-input h-9 px-2 text-[13px]" maxlength="64" />
          <input v-model="row.text" class="ui-input h-9 px-2 text-[13px]" />
          <UiButton class="h-9 px-2" variant="ghost" :title="tr('common.remove')" @click="removeSymbolLibRow(row.id)">
            <Trash2 class="h-4 w-4" />
          </UiButton>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <UiButton class="h-9 px-3 text-[13px]" variant="ghost" @click="addSymbolLibRow">{{ tr('tpl.symbolLibAdd') }}</UiButton>
        <UiButton class="h-9 px-3 text-[13px]" variant="ghost" @click="resetSymbolLibModalDraft">{{
          tr('tpl.symbolLibReset')
        }}</UiButton>
        <div class="min-w-[8px] flex-1"></div>
        <UiButton class="h-9 px-3 text-[13px]" variant="ghost" @click="cancelSymbolLibModal">{{ tr('common.cancel') }}</UiButton>
        <UiButton class="h-9 px-3 text-[13px]" variant="accent" @click="saveSymbolLibModal">{{ tr('common.save') }}</UiButton>
      </div>
    </div>
  </div>
</template>
