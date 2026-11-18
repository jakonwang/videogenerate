import type { SyncTemplate, SyncTemplateSegment } from './sync'
import type { VideoJobOptions } from './videoTools'

/** 混剪模板的默认值（网页新建 / 电脑端缺字段时用） */
export function defaultSyncTemplate(name = '新模板'): SyncTemplate {
  return {
    name,
    durationSec: { min: 12, max: 18 },
    pieceSec: { min: 2, max: 4 },
    titles: [],
    bgmFileIds: [],
    bgmVolume: 0.3,
    aspect: 'cover_crop',
    colorGrade: { enabled: false, brightness: 0, contrast: 1, saturation: 1 },
    hflip: false,
    createdAt: Date.now(),
  }
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

function range(input: { min?: unknown; max?: unknown } | undefined, lo: number, hi: number, fallback: { min: number; max: number }) {
  const min = clamp(input?.min, lo, hi, fallback.min)
  const max = clamp(input?.max, lo, hi, fallback.max)
  return { min: Math.min(min, max), max: Math.max(min, max) }
}

/** 默认分段 */
export const DEFAULT_SEGMENT_KEYS = ['hook', 'show', 'detail']

export function normalizeSegments(input: unknown): SyncTemplateSegment[] | undefined {
  if (!Array.isArray(input) || !input.length) return undefined
  const seen = new Set<string>()
  const out: SyncTemplateSegment[] = []
  for (const raw of input.slice(0, 12)) {
    const key = String((raw as SyncTemplateSegment)?.key ?? '').trim().toLowerCase().replace(/\s+/g, '_').slice(0, 24)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const dur = range(raw as { min?: unknown; max?: unknown }, 0.5, 8, { min: 2, max: 4 })
    const zoom = range({ min: (raw as SyncTemplateSegment).zoomMin, max: (raw as SyncTemplateSegment).zoomMax }, 1, 1.3, { min: 1, max: 1.06 })
    out.push({ key, min: dur.min, max: dur.max, zoomMin: zoom.min, zoomMax: zoom.max })
  }
  return out.length ? out : undefined
}

/** 所有分段时长的跨度（云端混剪按这个切镜头） */
export function segmentSpan(segments: SyncTemplateSegment[]) {
  return { min: Math.min(...segments.map((s) => s.min)), max: Math.max(...segments.map((s) => s.max)) }
}

/** 校正一份模板（来自网页表单或电脑端），保证云端能直接执行 */
export function normalizeSyncTemplate(input: Partial<SyncTemplate> | null | undefined): SyncTemplate {
  const base = defaultSyncTemplate()
  const t = input ?? {}
  const color = t.colorGrade ?? base.colorGrade
  return {
    ...t,
    name: String(t.name ?? '').trim().slice(0, 60) || base.name,
    durationSec: range(t.durationSec, 6, 60, base.durationSec),
    pieceSec: range(t.pieceSec, 1, 8, base.pieceSec),
    titles: (Array.isArray(t.titles) ? t.titles : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 50),
    bgmFileIds: (Array.isArray(t.bgmFileIds) ? t.bgmFileIds : []).map(String).filter(Boolean).slice(0, 20),
    bgmVolume: clamp(t.bgmVolume, 0, 1, base.bgmVolume),
    aspect: t.aspect === 'contain_pad' ? 'contain_pad' : 'cover_crop',
    colorGrade: {
      enabled: Boolean(color.enabled),
      brightness: clamp(color.brightness, -0.3, 0.3, 0),
      contrast: clamp(color.contrast, 0.5, 1.5, 1),
      saturation: clamp(color.saturation, 0, 2, 1),
    },
    hflip: Boolean(t.hflip),
    ...withSegments(t),
    createdAt: Number(t.createdAt) || Date.now(),
  }
}

function withSegments(t: Partial<SyncTemplate>): Pick<SyncTemplate, 'segments' | 'structure'> | Record<string, never> {
  const segments = normalizeSegments(t.segments)
  if (!segments) return {}
  return { segments, structure: segments.map((s) => s.key) }
}

/** 模板 → 云端混剪参数 */
export function templateMixOptions(template: SyncTemplate, count: number): VideoJobOptions {
  const t = normalizeSyncTemplate(template)
  return {
    count,
    durationSec: t.durationSec.min,
    durationMaxSec: t.durationSec.max,
    pieceSec: t.pieceSec.min,
    pieceMaxSec: t.pieceSec.max,
    titles: t.titles.length ? t.titles : undefined,
    bgmFileIds: t.bgmFileIds.length ? t.bgmFileIds : undefined,
    bgmVolume: t.bgmVolume,
    aspect: t.aspect,
    color: t.colorGrade.enabled ? { brightness: t.colorGrade.brightness, contrast: t.colorGrade.contrast, saturation: t.colorGrade.saturation } : undefined,
    hflip: t.hflip || undefined,
    templateName: t.name,
  }
}
