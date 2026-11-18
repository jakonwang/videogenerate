import { normalizeSegments, normalizeSyncTemplate, segmentSpan } from '../../../shared/cloud/templates'
import type { SyncTemplate, SyncTemplateSegment } from '../../../shared/cloud/sync'
import type { Template } from '../templates/types'

/**
 * 模板库：电脑端模板 ↔ 云端同步记录。
 * 网页能编辑、云端混剪能执行的字段放到明面上；其余（配音、转场、LUT、贴纸、分段特效…）原样放进 desktop，
 * 网页改完传回来时再合并，电脑端独有的设置不会丢。
 */

export type TemplateStore = {
  list: () => Promise<Template[]>
  upsert: (payload: Partial<Template> & Pick<Template, 'name' | 'structure'>) => Promise<Template>
  remove: (id: string) => Promise<unknown>
}

export type TemplateLink = { localId: string; cloudUpdatedAt: number; localUpdatedAt: number }

export const defaultTemplateStore = async (): Promise<TemplateStore> => (await import('../templates/repo')).templatesRepo

const LOCAL_ONLY_KEYS = ['id', 'name', 'createdAt', 'updatedAt'] as const

/** Shot length the web shows: the span of all segment ranges. */
function pieceRange(template: Template) {
  const ranges = template.structure.map((seg) => template.segmentDurationSec?.[seg]).filter(Boolean) as Array<{ min: number; max: number }>
  if (!ranges.length) return { min: 2, max: 4 }
  return { min: Math.min(...ranges.map((r) => r.min)), max: Math.max(...ranges.map((r) => r.max)) }
}

function segmentsOf(template: Template): SyncTemplateSegment[] {
  const fallback = pieceRange(template)
  return template.structure.map((key) => {
    const dur = template.segmentDurationSec?.[key] ?? fallback
    const zoom = template.segmentFx?.[key]?.zoom ?? { min: 1, max: 1.06 }
    return { key, min: dur.min, max: dur.max, zoomMin: zoom.min, zoomMax: zoom.max }
  })
}

export function desktopOnlyFeatures(template: Template): string[] {
  const features: string[] = []
  if (template.tts?.enabled) features.push('配音')
  if (template.assSubtitle?.enabled) features.push('ASS 字幕')
  if (template.transition?.enabled) features.push('转场')
  if (template.lut3d?.fileName) features.push('LUT 滤镜')
  if (template.sticker?.fileName) features.push('贴纸')
  if (template.jitter?.speed?.enabled || template.jitter?.color?.enabled) features.push('速度 / 色彩微扰')
  if (template.audio?.source !== 'mute') features.push('保留原声')
  return features
}

export function toSyncTemplate(template: Template, bgmFileIds: string[]): SyncTemplate {
  const desktop: Record<string, unknown> = { ...(template as unknown as Record<string, unknown>) }
  for (const key of LOCAL_ONLY_KEYS) delete desktop[key]
  // Local file paths mean nothing on another device; the music travels as bgmFileIds.
  if (template.bgm) desktop.bgm = { volume: template.bgm.volume }
  return normalizeSyncTemplate({
    name: template.name,
    durationSec: template.totalDurationSec,
    pieceSec: pieceRange(template),
    titles: template.titleOverlay?.enabled ? template.titleOverlay.textPool : [],
    bgmFileIds,
    bgmVolume: template.bgm?.volume ?? 0.3,
    aspect: template.aspectUnifyMode === 'cover_crop' ? 'cover_crop' : 'contain_pad',
    colorGrade: template.colorGrade ?? undefined,
    hflip: template.structure.some((seg) => template.segmentFx?.[seg]?.allowHflip),
    structure: template.structure,
    segments: segmentsOf(template),
    desktopOnly: desktopOnlyFeatures(template),
    desktop,
    createdAt: template.createdAt,
  })
}

/** 云端模板 → 写回电脑端的字段（prev 为电脑上的旧版本，没有则按云端带回的 desktop 部分或默认结构） */
export function fromSyncTemplate(input: SyncTemplate, prev: Template | null, bgmPaths: string[]): Partial<Template> & Pick<Template, 'name' | 'structure'> {
  const sync = normalizeSyncTemplate(input)
  const base = (prev ?? (input.desktop as Partial<Template> | undefined) ?? {}) as Partial<Template>
  let structure: string[]
  let segmentDurationSec: Template['segmentDurationSec']
  let segmentFx: NonNullable<Template['segmentFx']>
  const segments = normalizeSegments(sync.segments)
  if (segments) {
    // 网页编辑过分镜结构：分段、每段时长和缩放以网页为准。只改了「每个镜头」的旧客户端 → 套到所有段。
    const span = segmentSpan(segments)
    const pieceOnly = span.min !== sync.pieceSec.min || span.max !== sync.pieceSec.max
    const rows = pieceOnly ? segments.map((s) => ({ ...s, ...sync.pieceSec })) : segments
    structure = rows.map((s) => s.key)
    segmentDurationSec = Object.fromEntries(rows.map((s) => [s.key, { min: s.min, max: s.max }]))
    segmentFx = Object.fromEntries(rows.map((s) => [s.key, { ...(base.segmentFx?.[s.key] ?? {}), zoom: { min: s.zoomMin, max: s.zoomMax }, allowHflip: sync.hflip }]))
  } else {
    structure = base.structure?.length ? base.structure : sync.structure?.length ? sync.structure : ['hook', 'show', 'detail']
    const basePiece = base.structure?.length ? pieceRange(base as Template) : null
    // Only rewrite per-segment lengths when the web actually changed the shot length.
    const pieceChanged = !basePiece || basePiece.min !== sync.pieceSec.min || basePiece.max !== sync.pieceSec.max
    segmentDurationSec = pieceChanged ? Object.fromEntries(structure.map((seg) => [seg, { ...sync.pieceSec }])) : base.segmentDurationSec ?? {}
    segmentFx = Object.fromEntries(structure.map((seg) => [seg, { ...(base.segmentFx?.[seg] ?? {}), allowHflip: sync.hflip }]))
  }
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = base as Template
  return {
    ...rest,
    name: sync.name,
    structure,
    totalDurationSec: sync.durationSec,
    segmentDurationSec,
    segmentFx,
    titleOverlay: sync.titles.length ? { enabled: true, textPool: sync.titles } : null,
    bgm: bgmPaths.length ? { filePaths: bgmPaths, volume: sync.bgmVolume } : null,
    aspectUnifyMode: sync.aspect,
    colorGrade: sync.colorGrade,
  }
}
