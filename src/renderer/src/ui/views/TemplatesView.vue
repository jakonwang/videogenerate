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
  // 旧字段（已废弃）：drawtext 随机字幕池
  subtitle?: { enabled: boolean; pool: string[]; x?: string; y?: string; fontSize?: number }
  // 画面标题（无配音）
  titleOverlay?: { enabled: boolean; textPool: string[] } | null
  // Edge-TTS 配音（可选）
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
  // ASS 字幕（高级排版）
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
  /** 画面调色（全局基础值） */
  colorGrade?: { enabled: boolean; brightness: number; contrast: number; saturation: number } | null
  /** 画幅统一模式 */
  aspectUnifyMode?: 'contain_pad' | 'cover_crop' | null
  /** 3D LUT（.cube）滤镜 */
  lut3d?: { fileName: string } | null
  /** 彩色贴纸（PNG/WebP） */
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
/** 画面标题：每组 = 标题行 + 符号行（结构化编辑，避免单文本框误合并多组） */
const titleGroupDraft = reactive<Record<string, TitleOverlayGroupRow[]>>({})
/** 文案池失焦整理时的短暂 UI 反馈 */
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
  { key: 'structure', label: '结构规则' },
  { key: 'audio', label: '音频规则' },
  { key: 'subtitle_voice', label: '字幕与配音' },
  { key: 'visual', label: '视觉输出' },
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
  if (workspace.value === 'structure') return '维护模板结构、时长和分镜段参数。'
  if (workspace.value === 'audio') return '维护原声、BGM 和混音相关规则。'
  if (workspace.value === 'subtitle_voice') return '维护字幕样式、文案池和 Edge-TTS 配音。'
  return '维护 LUT、贴纸、颜色和画面输出规则。'
})

async function refreshLuts() {
  try {
    lutOptions.value = (await window.api.luts.list()) ?? []
    // 确保“无 LUT”不会因为异步 option 渲染被浏览器默认选中第一项
    // 强制触发一次响应式刷新，不修改持久化数据
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

  // 便捷处理：若当前模板字体仍是默认值，且本次仅导入 1 个字体，则自动回填解析到的 familyName
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
      .filter((x) => x.length > 0 && /woff2|寤鸿鏀圭敤 ttf\/otf\/ttc/i.test(x))
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
  // 使用分隔符行切分，避免空行被“解析规则”吞掉导致看起来无法回车或空行
  // 规则：一行仅包含 "---"（3 个 "-"）时，视为分隔符；同一条字幕内部允许回车与空行
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
  // 閬垮厤鎶?Vue Proxy 鐩存帴璺?IPC 浼犻€掑鑷存綔鍦ㄥ簭鍒楀寲闂
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
  // 初始化 Tab，避免在渲染阶段写入 reactive 状态导致递归更新
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
  const ok = window.confirm(`确认删除模板「${target?.name ?? id}」？`)
  if (!ok) return
  await window.api.templates.remove(id)
  await refresh()
}

function templateHookTypeLabel(type?: string) {
  const map: Record<string, string> = {
    price: '价格驱动',
    pain_point: '痛点切入',
    before_after: '前后对比',
    curiosity: '好奇驱动',
    visual_impact: '视觉冲击',
    social_proof: '社会证明',
    style_showcase: '风格展示',
    unknown: '待识别',
  }
  return map[String(type || '')] || '待识别'
}

function templateProductTypeLabel(type?: string) {
  const map: Record<string, string> = {
    earrings: '耳饰',
    phone_case: '手机壳',
    clothes: '服饰',
    toy: '玩具',
    general: '通用商品',
  }
  return map[String(type || '')] || '通用商品'
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
      name: String(suggested.name ?? '').trim() || `鐖嗘鍒嗘瀽-${Date.now()}`,
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
  // 淇濇寔椤哄簭鍘婚噸
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
  // 先本地更新（保证输入即时回显），再防抖保存
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
  // 淇濇寔椤哄簭鍘婚噸
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

// 已废弃：配音文件夹（voicePool）。已升级为 Edge-TTS 动态配音。

function currentTab(id: string) {
  const raw = activeTab.value[id] ?? 'global'
  // 鍏煎鏃у€?
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
        <div class="text-xs font-black uppercase tracking-[0.22em] text-violet-300">模板中心</div>
        <h1 class="mt-2 text-2xl font-black text-white">模板结构</h1>
        <p class="mt-2 text-sm text-slate-400">选择模板，查看分镜结构、每段时长、镜头运动和转场。</p>
      </div>
      <button class="app-ghost px-4 py-2 text-sm" @click="templateAdvancedOpen = !templateAdvancedOpen">
        {{ templateAdvancedOpen ? '收起高级设置' : '高级设置' }}
      </button>
    </header>

    <section class="app-card px-4 py-3">
      <div class="flex flex-wrap items-center gap-2">
        <div class="mr-2 shrink-0 text-xs font-black uppercase tracking-[0.18em] text-slate-500">工具</div>
        <input v-model="templateNewSegName" class="ui-input h-9 min-w-[180px] flex-[1_1_220px]" placeholder="新增分镜 proof / cta" @keydown.enter.prevent="selectedTemplate && addSegment(selectedTemplate)" />
        <button class="app-primary h-9 px-3 text-xs" :disabled="!selectedTemplate" @click="selectedTemplate && addSegment(selectedTemplate)">新增分镜</button>
        <div class="mx-1 hidden h-5 w-px bg-white/10 lg:block"></div>
        <input v-model="styleAnalyzeDir" class="ui-input h-9 min-w-[180px] flex-[1_1_260px]" placeholder="样片目录，例如 video" />
        <button class="app-ghost h-9 px-3 text-xs" :disabled="styleAnalyzing" @click="analyzeVideosAndCreateTemplate">
          {{ styleAnalyzing ? '分析中...' : '分析生成模板' }}
        </button>
        <div v-if="styleSummary" class="ml-auto min-w-0 truncate text-xs text-slate-500">
          {{ styleSummary.fileCount }} 个样片 · {{ styleSummary.mainResolution }} · {{ styleSummary.cutTendency }}
        </div>
      </div>
    </section>

    <div class="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
      <aside class="app-card space-y-3 p-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-black text-white">模板列表</h2>
            <p class="mt-1 text-xs text-slate-500">{{ list.length }} 个模板</p>
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
              <strong class="block truncate text-sm text-white">{{ tpl.name }}</strong>
              <small class="mt-1 block text-xs text-slate-500">{{ tr('tpl.totalDur', { min: tpl.totalDurationSec.min, max: tpl.totalDurationSec.max }) }}</small>
              <div v-if="tpl.meta?.source === 'clone_blueprint'" class="mt-2 flex flex-wrap gap-1">
                <span class="rounded-full bg-violet-500/15 px-2 py-1 text-[10px] font-bold text-violet-200">爆款结构模板</span>
                <span class="rounded-full bg-white/8 px-2 py-1 text-[10px] text-slate-300">{{ templateHookTypeLabel(tpl.meta?.hookType) }}</span>
                <span class="rounded-full bg-white/8 px-2 py-1 text-[10px] text-slate-300">{{ templateProductTypeLabel(tpl.meta?.productCategory) }}</span>
              </div>
            </div>
            <button
              class="shrink-0 rounded-md border border-red-400/25 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-200 opacity-80 transition hover:bg-red-500/20 group-hover:opacity-100"
              title="删除模板"
              @click.stop="removeTemplate(tpl.id)"
            >
              删除
            </button>
          </div>
        </button>
        <div v-if="!list.length" class="app-soft-card p-5 text-sm text-slate-400">选择一个模板，或从爆款视频分析生成模板。</div>
      </aside>

      <main class="app-card min-w-0 p-5">
        <div class="mb-5 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-black text-white">分镜结构</h2>
            <p class="mt-1 text-xs text-slate-500">{{ selectedTemplate?.name || '未选择模板' }}</p>
          </div>
          <button v-if="selectedTemplate" class="app-ghost px-3 py-2 text-xs" @click="openPresetPicker(selectedTemplate)">预设</button>
        </div>
        <div v-if="selectedTemplate" class="flex flex-wrap items-center gap-3">
          <template v-for="(seg, idx) in selectedTemplate.structure" :key="`${selectedTemplate.id}-${seg}-${idx}`">
            <div class="app-flow-node">
              <strong>{{ seg.toUpperCase() }}</strong>
              <span>{{ tr('tpl.segDur', { min: segDur(selectedTemplate, seg).min, max: segDur(selectedTemplate, seg).max }) }}</span>
              <small>运动 {{ segFx(selectedTemplate, seg).zoom?.min ?? 1 }} - {{ segFx(selectedTemplate, seg).zoom?.max ?? 1.06 }}</small>
            </div>
            <span v-if="idx < selectedTemplate.structure.length - 1" class="text-white/25">→</span>
          </template>
        </div>
        <div v-else class="app-soft-card grid min-h-[420px] place-items-center p-8 text-center text-sm text-slate-400">
          选择一个模板，或从爆款视频分析生成模板。
        </div>

        <div v-if="selectedTemplate" class="mt-6 overflow-hidden rounded-xl border border-white/10">
          <table class="w-full text-left text-sm">
            <thead class="bg-white/[0.04] text-xs text-slate-500">
              <tr>
                <th class="px-4 py-3">段位</th>
                <th class="px-4 py-3">时长</th>
                <th class="px-4 py-3">镜头运动</th>
                <th class="px-4 py-3">转场</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="seg in selectedTemplate.structure" :key="seg" class="border-t border-white/10 text-slate-300">
                <td class="px-4 py-3 font-bold text-white">{{ seg.toUpperCase() }}</td>
                <td class="px-4 py-3">{{ segDur(selectedTemplate, seg).min }} - {{ segDur(selectedTemplate, seg).max }}s</td>
                <td class="px-4 py-3">Zoom {{ segFx(selectedTemplate, seg).zoom?.min ?? 1 }} - {{ segFx(selectedTemplate, seg).zoom?.max ?? 1.06 }}</td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1">
                    <button class="app-ghost px-2 py-1 text-[10px]" @click="moveSegment(selectedTemplate, seg, -1)">上移</button>
                    <button class="app-ghost px-2 py-1 text-[10px]" @click="moveSegment(selectedTemplate, seg, 1)">下移</button>
                    <button class="rounded-md border border-red-400/30 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-200" @click="removeSegment(selectedTemplate, seg)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <section v-if="selectedTemplate?.meta?.source === 'clone_blueprint'" class="mt-6 grid gap-3 md:grid-cols-2">
          <div class="app-soft-card p-4">
            <div class="text-sm font-black text-white">爆款结构元信息</div>
            <div class="mt-3 space-y-2 text-sm text-slate-300">
              <div>模板来源：爆款结构模板</div>
              <div>钩子类型：{{ templateHookTypeLabel(selectedTemplate.meta?.hookType) }}</div>
              <div>商品类目：{{ templateProductTypeLabel(selectedTemplate.meta?.productCategory) }}</div>
              <div>切镜密度：{{ selectedTemplate.meta?.rhythm?.cutDensity || 'medium' }}</div>
              <div>前三秒镜头数：{{ selectedTemplate.meta?.rhythm?.first3SecShotCount ?? 0 }}</div>
              <div>适合复用：同类商品、相近卖点、相近镜头节奏</div>
            </div>
          </div>
          <div class="app-soft-card p-4">
            <div class="text-sm font-black text-white">视觉风格</div>
            <div class="mt-3 space-y-2 text-sm text-slate-300">
              <div>场景：{{ selectedTemplate.meta?.visualStyle?.scene || '未标注' }}</div>
              <div>光线：{{ selectedTemplate.meta?.visualStyle?.lighting || '未标注' }}</div>
              <div>镜头风格：{{ selectedTemplate.meta?.visualStyle?.cameraStyle || '未标注' }}</div>
              <div>运动方式：{{ selectedTemplate.meta?.visualStyle?.movementStyle || '未标注' }}</div>
              <div>真实感：{{ selectedTemplate.meta?.visualStyle?.realismStyle || 'ugc' }}</div>
              <div>不会复用：原视频人物身份、水印、字幕原文、账号信息</div>
            </div>
          </div>
        </section>
        <section v-if="selectedTemplate?.meta?.source === 'clone_blueprint'" class="mt-3">
          <div class="app-soft-card p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="text-sm font-black text-white">换产品复用说明</div>
                <div class="mt-1 text-xs text-slate-500">从这里直接进入复刻工坊，会带上当前结构模板的上下文提示。</div>
              </div>
              <button class="app-ghost px-3 py-2 text-xs" @click="openCloneWithTemplate(selectedTemplate)">前往复刻工坊使用</button>
            </div>
            <div class="mt-3 space-y-2 text-sm text-slate-300">
              <div>1. 先在产品页准备同类商品的主图、细节图、使用图或真实视频。</div>
              <div>2. 再进入复刻工坊，选择该模板对应的节奏和镜头结构。</div>
              <div>3. 系统会继续保留镜头角色、时长、运动和 Prompt 框架，但商品锁定会按新产品重新生成。</div>
            </div>
          </div>
        </section>

        <section v-if="selectedTemplate && expanded[selectedTemplate.id]" class="mt-6 space-y-4 rounded-xl bg-white/[0.035] p-4 ring-1 ring-white/10">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-black text-white">模板编辑</h3>
              <p class="mt-1 text-xs text-slate-500">这里恢复为宽工作区编辑，不再挤在右侧窄栏。</p>
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
                  <div class="text-sm font-black text-white">模板结构</div>
                  <p class="mt-1 text-sm leading-6 text-slate-400">模板只负责结构和输出规则，不再跟随商品段位联动。</p>
                </div>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <label class="block text-xs font-bold text-slate-500">
                  新增段位
                  <input v-model="templateNewSegName" class="ui-input mt-2 h-10 w-full" placeholder="proof / cta" @keydown.enter.prevent="addSegment(selectedTemplate)" />
                </label>
                <div class="flex items-end gap-2">
                  <button class="app-primary h-10 px-4 text-xs" @click="addSegment(selectedTemplate)">新增到模板</button>
                </div>
              </div>
            </section>

            <section v-if="workspace === 'structure'" class="app-soft-card p-4">
              <div class="mb-3 text-sm font-black text-white">基础参数</div>
              <div class="grid gap-3 md:grid-cols-2">
                <label class="block text-xs font-bold text-slate-500">
                  最小时长
                  <input
                    :value="selectedTemplate.totalDurationSec.min"
                    type="number"
                    min="3"
                    max="60"
                    class="ui-input mt-2 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { totalDurationSec: { ...selectedTemplate.totalDurationSec, min: Number(($event.target as HTMLInputElement).value) || 3 } })"
                  />
                </label>
                <label class="block text-xs font-bold text-slate-500">
                  最大时长
                  <input
                    :value="selectedTemplate.totalDurationSec.max"
                    type="number"
                    min="3"
                    max="60"
                    class="ui-input mt-2 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { totalDurationSec: { ...selectedTemplate.totalDurationSec, max: Number(($event.target as HTMLInputElement).value) || selectedTemplate.totalDurationSec.min } })"
                  />
                </label>
                <label class="block text-xs font-bold text-slate-500">
                  跳过片头秒数
                  <input
                    :value="selectedTemplate.skipStartSec ?? 0"
                    type="number"
                    min="0"
                    max="30"
                    step="0.1"
                    class="ui-input mt-2 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { skipStartSec: Number(($event.target as HTMLInputElement).value) || 0 })"
                  />
                </label>
                <label class="block text-xs font-bold text-slate-500">
                  随机保留前 N 段
                  <input
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
                  />
                  启用转场
                </label>
                <label class="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    :checked="selectedTemplate.randomizeOrder?.mode === 'partial'"
                    @change="updateTemplate(selectedTemplate, { randomizeOrder: { mode: ($event.target as HTMLInputElement).checked ? 'partial' : 'none', keepFirstCount: selectedTemplate.randomizeOrder?.keepFirstCount ?? 1 } })"
                  />
                  随机分镜顺序
                </label>
              </div>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <label class="block text-xs font-bold text-slate-500">
                  转场最短
                  <input
                    :value="selectedTemplate.transition?.durationSec?.min ?? 0.2"
                    type="number"
                    min="0"
                    max="3"
                    step="0.05"
                    class="ui-input mt-2 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { transition: { enabled: selectedTemplate.transition?.enabled ?? true, type: 'fade', durationSec: { min: Number(($event.target as HTMLInputElement).value) || 0, max: selectedTemplate.transition?.durationSec?.max ?? 0.45 } } })"
                  />
                </label>
                <label class="block text-xs font-bold text-slate-500">
                  转场最长
                  <input
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
              <div class="mb-3 text-sm font-black text-white">音频与画幅</div>
              <div class="grid gap-3 md:grid-cols-2">
                <label class="block text-xs font-bold text-slate-500">
                  原声策略
                  <select
                    class="ui-select mt-2 h-10 w-full"
                    :value="(selectedTemplate.audio as any)?.source ?? 'keep'"
                    @change="updateTemplate(selectedTemplate, { audio: { ...((selectedTemplate.audio as any) ?? {}), source: ($event.target as HTMLSelectElement).value, ducking: selectedTemplate.audio?.ducking ?? { enabled: false, amountDb: 12 } } as any })"
                  >
                    <option value="keep">保留原声</option>
                    <option value="mute">静音原声</option>
                  </select>
                </label>
                <label class="block text-xs font-bold text-slate-500">
                  画幅统一
                  <select
                    class="ui-select mt-2 h-10 w-full"
                    :value="selectedTemplate.aspectUnifyMode ?? 'cover_crop'"
                    @change="updateTemplate(selectedTemplate, { aspectUnifyMode: ($event.target as HTMLSelectElement).value as any })"
                  >
                    <option value="cover_crop">裁切填满</option>
                    <option value="contain_pad">留边适配</option>
                  </select>
                </label>
              </div>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <label class="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    :checked="selectedTemplate.audio?.ducking?.enabled ?? false"
                    @change="updateTemplate(selectedTemplate, { audio: { ...((selectedTemplate.audio as any) ?? {}), ducking: { enabled: ($event.target as HTMLInputElement).checked, amountDb: selectedTemplate.audio?.ducking?.amountDb ?? 12 } } as any })"
                  />
                  启用配音压低原声
                </label>
                <label class="block text-xs font-bold text-slate-500">
                  压低 dB
                  <input
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
              <div class="mb-3 text-sm font-black text-white">分镜段参数</div>
              <div class="space-y-3">
                <div v-for="seg in selectedTemplate.structure" :key="`edit-${seg}`" class="rounded-xl bg-black/20 p-3">
                  <div class="mb-3 flex items-center justify-between gap-3">
                    <div class="text-sm font-black text-white">{{ seg.toUpperCase() }}</div>
                    <div class="flex gap-1">
                      <button class="app-ghost px-2 py-1 text-[10px]" @click="moveSegment(selectedTemplate, seg, -1)">上移</button>
                      <button class="app-ghost px-2 py-1 text-[10px]" @click="moveSegment(selectedTemplate, seg, 1)">下移</button>
                    </div>
                  </div>
                  <div class="grid gap-2 md:grid-cols-4">
                    <label class="text-xs font-bold text-slate-500">
                      段最短
                      <input
                        :value="segDur(selectedTemplate, seg).min"
                        type="number"
                        step="0.1"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentDurationSec: { ...(selectedTemplate.segmentDurationSec ?? {}), [seg]: { ...segDur(selectedTemplate, seg), min: Number(($event.target as HTMLInputElement).value) || 0.1 } } })"
                      />
                    </label>
                    <label class="text-xs font-bold text-slate-500">
                      段最长
                      <input
                        :value="segDur(selectedTemplate, seg).max"
                        type="number"
                        step="0.1"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentDurationSec: { ...(selectedTemplate.segmentDurationSec ?? {}), [seg]: { ...segDur(selectedTemplate, seg), max: Number(($event.target as HTMLInputElement).value) || 0.1 } } })"
                      />
                    </label>
                    <label class="text-xs font-bold text-slate-500">
                      Zoom 最小
                      <input
                        :value="segFx(selectedTemplate, seg).zoom?.min ?? 1"
                        type="number"
                        step="0.01"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentFx: { ...(selectedTemplate.segmentFx ?? {}), [seg]: { ...segFx(selectedTemplate, seg), zoom: { min: Number(($event.target as HTMLInputElement).value) || 1, max: segFx(selectedTemplate, seg).zoom?.max ?? 1.06 } } } })"
                      />
                    </label>
                    <label class="text-xs font-bold text-slate-500">
                      Zoom 最大
                      <input
                        :value="segFx(selectedTemplate, seg).zoom?.max ?? 1.06"
                        type="number"
                        step="0.01"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentFx: { ...(selectedTemplate.segmentFx ?? {}), [seg]: { ...segFx(selectedTemplate, seg), zoom: { min: segFx(selectedTemplate, seg).zoom?.min ?? 1, max: Number(($event.target as HTMLInputElement).value) || 1.06 } } } })"
                      />
                    </label>
                  </div>
                  <div class="mt-2 grid gap-2 md:grid-cols-4">
                    <label class="text-xs font-bold text-slate-500">
                      X 移动最小
                      <input
                        :value="segFx(selectedTemplate, seg).move?.x?.min ?? -0.02"
                        type="number"
                        step="0.01"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentFx: { ...(selectedTemplate.segmentFx ?? {}), [seg]: { ...segFx(selectedTemplate, seg), move: { x: { min: Number(($event.target as HTMLInputElement).value) || 0, max: segFx(selectedTemplate, seg).move?.x?.max ?? 0.02 }, y: segFx(selectedTemplate, seg).move?.y ?? { min: -0.015, max: 0.015 } } } } })"
                      />
                    </label>
                    <label class="text-xs font-bold text-slate-500">
                      X 移动最大
                      <input
                        :value="segFx(selectedTemplate, seg).move?.x?.max ?? 0.02"
                        type="number"
                        step="0.01"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentFx: { ...(selectedTemplate.segmentFx ?? {}), [seg]: { ...segFx(selectedTemplate, seg), move: { x: { min: segFx(selectedTemplate, seg).move?.x?.min ?? -0.02, max: Number(($event.target as HTMLInputElement).value) || 0 }, y: segFx(selectedTemplate, seg).move?.y ?? { min: -0.015, max: 0.015 } } } } })"
                      />
                    </label>
                    <label class="text-xs font-bold text-slate-500">
                      Y 移动最小
                      <input
                        :value="segFx(selectedTemplate, seg).move?.y?.min ?? -0.015"
                        type="number"
                        step="0.01"
                        class="ui-input mt-1 h-9 w-full"
                        @input="updateTemplate(selectedTemplate, { segmentFx: { ...(selectedTemplate.segmentFx ?? {}), [seg]: { ...segFx(selectedTemplate, seg), move: { x: segFx(selectedTemplate, seg).move?.x ?? { min: -0.02, max: 0.02 }, y: { min: Number(($event.target as HTMLInputElement).value) || 0, max: segFx(selectedTemplate, seg).move?.y?.max ?? 0.015 } } } } })"
                      />
                    </label>
                    <label class="text-xs font-bold text-slate-500">
                      Y 移动最大
                      <input
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
              <div class="mb-3 text-sm font-black text-white">速度与画面微扰</div>
              <label class="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  :checked="selectedTemplate.jitter?.speed?.enabled ?? false"
                  @change="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), speed: { enabled: ($event.target as HTMLInputElement).checked, range: selectedTemplate.jitter?.speed?.range ?? { min: 0.99, max: 1.01 } } } })"
                />
                启用速度微扰
              </label>
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
                />
                启用颜色微扰
              </label>
              <div class="mt-3 grid gap-2 md:grid-cols-4">
                <label class="text-xs font-bold text-slate-500">
                  亮度最小
                  <input
                    :value="selectedTemplate.jitter?.color?.brightness?.min ?? -0.02"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: { min: Number(($event.target as HTMLInputElement).value) || 0, max: selectedTemplate.jitter?.color?.brightness?.max ?? 0.02 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500">
                  亮度最大
                  <input
                    :value="selectedTemplate.jitter?.color?.brightness?.max ?? 0.02"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: { min: selectedTemplate.jitter?.color?.brightness?.min ?? -0.02, max: Number(($event.target as HTMLInputElement).value) || 0 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500">
                  对比最小
                  <input
                    :value="selectedTemplate.jitter?.color?.contrast?.min ?? 0.98"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: { min: Number(($event.target as HTMLInputElement).value) || 0.98, max: selectedTemplate.jitter?.color?.contrast?.max ?? 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500">
                  对比最大
                  <input
                    :value="selectedTemplate.jitter?.color?.contrast?.max ?? 1.02"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: { min: selectedTemplate.jitter?.color?.contrast?.min ?? 0.98, max: Number(($event.target as HTMLInputElement).value) || 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500">
                  饱和最小
                  <input
                    :value="selectedTemplate.jitter?.color?.saturation?.min ?? 0.98"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: { min: Number(($event.target as HTMLInputElement).value) || 0.98, max: selectedTemplate.jitter?.color?.saturation?.max ?? 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500">
                  饱和最大
                  <input
                    :value="selectedTemplate.jitter?.color?.saturation?.max ?? 1.02"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: { min: selectedTemplate.jitter?.color?.saturation?.min ?? 0.98, max: Number(($event.target as HTMLInputElement).value) || 1.02 }, hueDeg: selectedTemplate.jitter?.color?.hueDeg ?? { min: -1, max: 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500">
                  色相最小
                  <input
                    :value="selectedTemplate.jitter?.color?.hueDeg?.min ?? -1"
                    type="number"
                    step="0.1"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { jitter: { ...(selectedTemplate.jitter ?? {}), color: { enabled: selectedTemplate.jitter?.color?.enabled ?? true, brightness: selectedTemplate.jitter?.color?.brightness ?? { min: -0.02, max: 0.02 }, contrast: selectedTemplate.jitter?.color?.contrast ?? { min: 0.98, max: 1.02 }, saturation: selectedTemplate.jitter?.color?.saturation ?? { min: 0.98, max: 1.02 }, hueDeg: { min: Number(($event.target as HTMLInputElement).value) || 0, max: selectedTemplate.jitter?.color?.hueDeg?.max ?? 1 } } } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500">
                  色相最大
                  <input
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
              <div class="mb-3 text-sm font-black text-white">调色</div>
              <label class="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  :checked="selectedTemplate.colorGrade?.enabled ?? false"
                  @change="updateTemplate(selectedTemplate, { colorGrade: { ...(selectedTemplate.colorGrade ?? { brightness: 0, contrast: 1, saturation: 1 }), enabled: ($event.target as HTMLInputElement).checked } })"
                />
                启用基础调色
              </label>
              <div class="mt-3 grid gap-2 md:grid-cols-3">
                <label class="text-xs font-bold text-slate-500">
                  亮度
                  <input
                    :value="selectedTemplate.colorGrade?.brightness ?? 0"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { colorGrade: { enabled: selectedTemplate.colorGrade?.enabled ?? true, brightness: Number(($event.target as HTMLInputElement).value) || 0, contrast: selectedTemplate.colorGrade?.contrast ?? 1, saturation: selectedTemplate.colorGrade?.saturation ?? 1 } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500">
                  对比
                  <input
                    :value="selectedTemplate.colorGrade?.contrast ?? 1"
                    type="number"
                    step="0.01"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { colorGrade: { enabled: selectedTemplate.colorGrade?.enabled ?? true, brightness: selectedTemplate.colorGrade?.brightness ?? 0, contrast: Number(($event.target as HTMLInputElement).value) || 1, saturation: selectedTemplate.colorGrade?.saturation ?? 1 } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500">
                  饱和
                  <input
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
                <div class="text-sm font-black text-white">画面标题</div>
                <label class="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    :checked="selectedTemplate.titleOverlay?.enabled ?? false"
                    @change="updateTemplate(selectedTemplate, { titleOverlay: { enabled: ($event.target as HTMLInputElement).checked, textPool: selectedTemplate.titleOverlay?.textPool ?? groupRowsToPool(getTitleRows(selectedTemplate)) } })"
                  />
                  启用画面标题
                </label>
              </div>
              <div class="space-y-3">
                <div v-for="(row, idx) in getTitleRows(selectedTemplate)" :key="`title-${selectedTemplate.id}-${idx}`" class="rounded-xl bg-black/20 p-3">
                  <div class="mb-2 flex items-center justify-between gap-2">
                    <div class="text-xs font-bold text-slate-400">标题组 {{ idx + 1 }}</div>
                    <button class="text-xs font-bold text-red-300" @click="removeTitleGroup(selectedTemplate, idx)">删除</button>
                  </div>
                  <input v-model="row.title" class="ui-input h-10 w-full" placeholder="标题文案" @input="flushTitleGroups(selectedTemplate)" />
                  <textarea v-model="row.symbol" class="ui-input mt-2 min-h-[68px] w-full resize-y py-2" placeholder="符号行，可多行" @input="flushTitleGroups(selectedTemplate)"></textarea>
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
                <button class="app-ghost px-3 py-2 text-xs" @click="addTitleGroup(selectedTemplate)">添加标题组</button>
                <button class="app-ghost px-3 py-2 text-xs" @click="insertOverlayGroup(selectedTemplate, defaultOverlayGroupSymbol)">插入默认符号组</button>
                <button class="app-ghost px-3 py-2 text-xs" @click="openSymbolLibModal">管理符号库</button>
              </div>
            </section>

            <section v-if="workspace === 'subtitle_voice'" class="app-soft-card p-4">
              <div class="mb-3 text-sm font-black text-white">ASS 字幕与字体</div>
              <label class="mb-3 flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  :checked="selectedTemplate.assSubtitle?.enabled ?? false"
                  @change="updateTemplate(selectedTemplate, { assSubtitle: { enabled: ($event.target as HTMLInputElement).checked, fontName: selectedTemplate.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY, fontSize: selectedTemplate.assSubtitle?.fontSize ?? ASS_DEFAULT_FONT_SIZE, preset: selectedTemplate.assSubtitle?.preset ?? 'white_shadow', marginV: selectedTemplate.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V, ttsMarginV: selectedTemplate.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V } })"
                />
                启用配音字幕
              </label>
              <div class="grid gap-2 md:grid-cols-2">
                <button class="app-ghost px-3 py-2 text-xs" @click="applySubtitlePresetToSelected('white_shadow')">白字阴影</button>
                <button class="app-ghost px-3 py-2 text-xs" @click="applySubtitlePresetToSelected('yellow_box')">黄底字幕</button>
              </div>
              <select
                class="ui-select mt-3 h-10 w-full"
                :value="selectedTemplate.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY"
                @change="updateTemplate(selectedTemplate, { assSubtitle: { enabled: true, fontName: ($event.target as HTMLSelectElement).value, fontSize: selectedTemplate.assSubtitle?.fontSize ?? ASS_DEFAULT_FONT_SIZE, preset: selectedTemplate.assSubtitle?.preset ?? 'white_shadow', marginV: selectedTemplate.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V, ttsMarginV: selectedTemplate.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V } })"
              >
                <option v-for="font in assFontChoices" :key="font.familyName" :value="font.familyName">{{ font.familyName }}</option>
              </select>
              <div class="mt-3 grid gap-2 md:grid-cols-3">
                <label class="text-xs font-bold text-slate-500">
                  字号
                  <input
                    :value="selectedTemplate.assSubtitle?.fontSize ?? ASS_DEFAULT_FONT_SIZE"
                    type="number"
                    min="24"
                    max="160"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { assSubtitle: { enabled: selectedTemplate.assSubtitle?.enabled ?? true, fontName: selectedTemplate.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY, fontSize: Number(($event.target as HTMLInputElement).value) || ASS_DEFAULT_FONT_SIZE, preset: selectedTemplate.assSubtitle?.preset ?? 'white_shadow', marginV: selectedTemplate.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V, ttsMarginV: selectedTemplate.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500">
                  标题上距
                  <input
                    :value="selectedTemplate.assSubtitle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V"
                    type="number"
                    min="0"
                    max="900"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { assSubtitle: { enabled: selectedTemplate.assSubtitle?.enabled ?? true, fontName: selectedTemplate.assSubtitle?.fontName ?? ASS_DEFAULT_FONT_FAMILY, fontSize: selectedTemplate.assSubtitle?.fontSize ?? ASS_DEFAULT_FONT_SIZE, preset: selectedTemplate.assSubtitle?.preset ?? 'white_shadow', marginV: Number(($event.target as HTMLInputElement).value) || 0, ttsMarginV: selectedTemplate.assSubtitle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500">
                  配音下距
                  <input
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
                <button class="app-ghost px-3 py-2 text-xs" @click="importFontsFromDialog">导入字体</button>
              </div>
            </section>

            <section v-if="workspace === 'subtitle_voice'" class="app-soft-card p-4 xl:col-span-2">
              <div class="mb-3 text-sm font-black text-white">配音角色</div>
              <div class="grid gap-2 md:grid-cols-[1fr_auto]">
                <select v-model="voiceDraft" class="ui-select h-10">
                  <option v-for="voice in voiceQuickOptions" :key="voice" :value="voice">{{ voice }}</option>
                </select>
                <button class="app-primary px-4 text-xs" @click="applyVoiceToSelected">应用角色</button>
              </div>
              <label class="mt-3 flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  :checked="selectedTemplate.tts?.enabled ?? false"
                  @change="updateTemplate(selectedTemplate, { tts: { enabled: ($event.target as HTMLInputElement).checked, textPool: selectedTemplate.tts?.textPool ?? [], voice: selectedTemplate.tts?.voice ?? voiceDraft, mixVolume: selectedTemplate.tts?.mixVolume ?? 0.8, keepOriginal: selectedTemplate.tts?.keepOriginal ?? true } })"
                />
                启用 Edge-TTS 配音
              </label>
              <textarea
                :value="ensureCopyDraft(selectedTemplate)"
                class="ui-input mt-3 min-h-[180px] w-full resize-y py-3 text-sm leading-6"
                placeholder="每行一条配音文案；可用 --- 分隔文案块。"
                @focus="copyEditing[selectedTemplate.id] = true"
                @input="copyDraft[selectedTemplate.id] = ($event.target as HTMLTextAreaElement).value"
                @blur="blurCopyPool(selectedTemplate)"
              ></textarea>
              <div class="mt-3 grid gap-2 md:grid-cols-5">
                <label class="text-xs font-bold text-slate-500">
                  语速
                  <input
                    :value="selectedTemplate.tts?.rate ?? 'default'"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { tts: { enabled: selectedTemplate.tts?.enabled ?? true, textPool: selectedTemplate.tts?.textPool ?? [], voice: selectedTemplate.tts?.voice ?? voiceDraft, rate: ($event.target as HTMLInputElement).value, pitch: selectedTemplate.tts?.pitch ?? 'default', ttsVolume: selectedTemplate.tts?.ttsVolume ?? 'default', mixVolume: selectedTemplate.tts?.mixVolume ?? 0.9, keepOriginal: selectedTemplate.tts?.keepOriginal ?? true } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500">
                  音调
                  <input
                    :value="selectedTemplate.tts?.pitch ?? 'default'"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { tts: { enabled: selectedTemplate.tts?.enabled ?? true, textPool: selectedTemplate.tts?.textPool ?? [], voice: selectedTemplate.tts?.voice ?? voiceDraft, rate: selectedTemplate.tts?.rate ?? 'default', pitch: ($event.target as HTMLInputElement).value, ttsVolume: selectedTemplate.tts?.ttsVolume ?? 'default', mixVolume: selectedTemplate.tts?.mixVolume ?? 0.9, keepOriginal: selectedTemplate.tts?.keepOriginal ?? true } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500">
                  TTS 音量
                  <input
                    :value="selectedTemplate.tts?.ttsVolume ?? 'default'"
                    class="ui-input mt-1 h-10 w-full"
                    @input="updateTemplate(selectedTemplate, { tts: { enabled: selectedTemplate.tts?.enabled ?? true, textPool: selectedTemplate.tts?.textPool ?? [], voice: selectedTemplate.tts?.voice ?? voiceDraft, rate: selectedTemplate.tts?.rate ?? 'default', pitch: selectedTemplate.tts?.pitch ?? 'default', ttsVolume: ($event.target as HTMLInputElement).value, mixVolume: selectedTemplate.tts?.mixVolume ?? 0.9, keepOriginal: selectedTemplate.tts?.keepOriginal ?? true } })"
                  />
                </label>
                <label class="text-xs font-bold text-slate-500">
                  混音比例
                  <input
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
                  />
                  保留原声
                </label>
              </div>
              <div v-if="copyPoolBusy[selectedTemplate.id]" class="mt-2 text-xs text-violet-200">正在同步文案池...</div>
            </section>

            <section v-if="workspace === 'audio'" class="app-soft-card p-4">
              <div class="mb-3 text-sm font-black text-white">BGM</div>
              <div class="flex gap-2">
                <button class="app-ghost flex-1 px-3 py-2 text-xs" @click="pickBgm(selectedTemplate)">添加 BGM</button>
                <button class="app-ghost px-3 py-2 text-xs" @click="clearBgm(selectedTemplate)">清空</button>
              </div>
              <div v-if="selectedTemplate.bgm?.filePaths?.length" class="mt-3 space-y-2">
                <div v-for="path in selectedTemplate.bgm.filePaths" :key="path" class="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2 text-xs text-slate-400">
                  <span class="truncate">{{ path }}</span>
                  <button class="text-red-300" @click="removeBgmItem(selectedTemplate, path)">移除</button>
                </div>
              </div>
              <div v-else class="mt-3 text-xs text-slate-500">未添加 BGM。</div>
              <label class="mt-3 block text-xs font-bold text-slate-500">
                BGM 音量
                <input
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
              <div class="mb-3 text-sm font-black text-white">LUT 与贴纸</div>
              <div class="grid gap-3 md:grid-cols-2">
                <select
                  class="ui-select h-10 w-full"
                  :value="selectedTemplate.lut3d?.fileName ?? ''"
                  @change="updateTemplate(selectedTemplate, { lut3d: ($event.target as HTMLSelectElement).value ? { fileName: ($event.target as HTMLSelectElement).value } : null })"
                >
                  <option value="">不使用 LUT</option>
                  <option v-for="lut in lutOptions" :key="lut.fileName" :value="lut.fileName">{{ lut.displayName }}</option>
                </select>
                <select
                  class="ui-select h-10 w-full"
                  :value="getStickerRefFromTemplate(selectedTemplate)"
                  @change="(() => { const opt = findStickerOptionByRef(($event.target as HTMLSelectElement).value); updateTemplate(selectedTemplate, { sticker: opt ? { ref: opt.ref, fileName: opt.fileName, heightPx: selectedTemplate.sticker?.heightPx ?? 180 } : null }) })()"
                >
                  <option value="">不使用贴纸</option>
                  <option v-for="sticker in stickerOptions" :key="sticker.ref" :value="sticker.ref">{{ sticker.displayName }}</option>
                </select>
              </div>
              <label class="mt-3 block text-xs font-bold text-slate-500">
                贴纸高度
                <input
                  :value="selectedTemplate.sticker?.heightPx ?? 180"
                  type="number"
                  min="40"
                  max="720"
                  class="ui-input mt-1 h-10 w-full"
                  @input="selectedTemplate.sticker && updateTemplate(selectedTemplate, { sticker: { ...selectedTemplate.sticker, heightPx: Number(($event.target as HTMLInputElement).value) || 180 } })"
                />
              </label>
              <button class="app-ghost mt-3 px-3 py-2 text-xs" @click="importStickersFromDialog">导入贴纸</button>
            </section>
          </div>
        </section>
      </main>

      <aside class="app-card space-y-4 p-4">
        <div>
          <h2 class="text-lg font-black text-white">当前段设置</h2>
          <p class="mt-1 text-xs text-slate-500">低频参数默认折叠。</p>
        </div>
        <template v-if="selectedTemplate">
          <div class="app-soft-card p-3 text-xs text-slate-300">
            <div>总时长：{{ selectedTemplate.totalDurationSec.min }} - {{ selectedTemplate.totalDurationSec.max }}s</div>
            <div class="mt-1">转场：{{ selectedTemplate.transition?.enabled ? '已启用' : '未启用' }}</div>
          </div>
          <button class="app-ghost w-full px-3 py-2 text-xs" @click="expanded[selectedTemplate.id] = !expanded[selectedTemplate.id]">
            {{ expanded[selectedTemplate.id] ? '收起当前模板编辑' : '编辑当前模板' }}
          </button>
          <button class="app-ghost w-full px-3 py-2 text-xs" @click="templateAdvancedOpen = !templateAdvancedOpen">
            {{ templateAdvancedOpen ? '收起高级分类' : '显示高级分类' }}
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
  <!-- 模板预设选择 -->
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

  <!-- 符号模板库（可增删改，持久化到 localStorage） -->
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


