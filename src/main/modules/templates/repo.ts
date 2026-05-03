import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { resolveStickerByRefOrFileName, toStickerRef } from '../../lib/stickers'
import type { Template } from './types'
import {
  ASS_DEFAULT_FONT_FAMILY,
  ASS_DEFAULT_FONT_SIZE,
  ASS_DEFAULT_TITLE_MARGIN_V,
  ASS_DEFAULT_TTS_MARGIN_V,
} from '../../../shared/assDefaults'

type DbShape = { templates: Template[] }

const filePath = () => join(getAppPaths().dbDir, 'templates.json')

function now() {
  return Date.now()
}

function normalizeSegmentSyncMode(input: unknown): 'follow_product' | 'fixed' {
  return String(input ?? '').trim() === 'fixed' ? 'fixed' : 'follow_product'
}

function withTitleFromPoolWhenNoDub(t: Template): Template {
  const anyT = t as any
  const hasTitle = Array.isArray(anyT.titleOverlay?.textPool) && anyT.titleOverlay.textPool.length > 0
  if (!hasTitle && anyT.tts?.textPool?.length && !anyT.tts?.enabled) {
    return {
      ...t,
      titleOverlay: { enabled: true, textPool: [...anyT.tts.textPool] },
    } as Template
  }
  return t
}

function finalizeNormalize(t: Template): Template {
  let x: any = withTitleFromPoolWhenNoDub(t)
  const inferredMode =
    x.segmentSyncMode ??
    (/^爆款分析-/.test(String(x.name ?? '').trim()) ? 'fixed' : 'follow_product')
  x = { ...x, segmentSyncMode: normalizeSegmentSyncMode(inferredMode) }
  const aa = x.assSubtitle
  if (aa && typeof aa === 'object' && (aa.ttsMarginV == null || !Number.isFinite(Number(aa.ttsMarginV)))) {
    x = { ...x, assSubtitle: { ...aa, ttsMarginV: ASS_DEFAULT_TTS_MARGIN_V } }
  }
  return x as Template
}

function normalizeTemplate(t: Template): Template {
  // 兼容旧数据：bgm.filePath -> bgm.filePaths
  const bgmAny: any = (t as any).bgm
  if (bgmAny && typeof bgmAny === 'object') {
    if (typeof bgmAny.filePath === 'string' && !Array.isArray(bgmAny.filePaths)) {
      const fp = String(bgmAny.filePath).trim()
      return finalizeNormalize({
        ...t,
        bgm: fp ? ({ filePaths: [fp], volume: Number(bgmAny.volume ?? 0.25) } as any) : null,
      })
    }
    if (Array.isArray(bgmAny.filePaths)) {
      const filePaths = bgmAny.filePaths.map((x: any) => String(x)).filter(Boolean)
      return finalizeNormalize({
        ...t,
        bgm: filePaths.length ? ({ filePaths, volume: Number(bgmAny.volume ?? 0.25) } as any) : null,
      })
    }
  }
  // 兼容旧数据：将 subtitle.pool 迁移到 tts.textPool（作为带货文案池的默认来源）
  const anyT: any = t as any
  const tts = anyT.tts
  if (!tts || typeof tts !== 'object') {
    const pool = Array.isArray(anyT.subtitle?.pool) ? anyT.subtitle.pool.map((x: any) => String(x)).filter(Boolean) : []
    if (pool.length) {
      return finalizeNormalize({
        ...(t as any),
        titleOverlay: { enabled: true, textPool: pool },
        tts: {
          enabled: false,
          textPool: pool,
          voice: 'zh-CN-XiaoxiaoNeural',
          rate: 'default',
          pitch: 'default',
          ttsVolume: 'default',
          mixVolume: 0.9,
          keepOriginal: true,
        },
        assSubtitle:
          anyT.assSubtitle ??
          ({
            enabled: false,
            fontName: ASS_DEFAULT_FONT_FAMILY,
            fontSize: ASS_DEFAULT_FONT_SIZE,
            preset: 'yellow_box',
            marginV: ASS_DEFAULT_TITLE_MARGIN_V,
            ttsMarginV: ASS_DEFAULT_TTS_MARGIN_V,
          } as any),
      } as any)
    }
  }
  // 默认补齐 assSubtitle
  if (!anyT.assSubtitle) {
    return finalizeNormalize({
      ...(t as any),
      assSubtitle: {
        enabled: false,
        fontName: ASS_DEFAULT_FONT_FAMILY,
        fontSize: ASS_DEFAULT_FONT_SIZE,
        preset: 'yellow_box',
        marginV: ASS_DEFAULT_TITLE_MARGIN_V,
        ttsMarginV: ASS_DEFAULT_TTS_MARGIN_V,
      },
    } as any)
  }

  // 兼容/降噪：将“identity LUT”视为未选择（默认不启用风格滤镜）
  const lutName = String(anyT.lut3d?.fileName ?? '').trim()
  if (lutName) {
    const n = lutName.replace(/\\/g, '/').split('/').pop() ?? lutName
    if (/^00[_-]?identity(\.cube)?$/i.test(n)) {
      return finalizeNormalize({ ...(t as any), lut3d: null } as any)
    }
  }

  // 贴纸兼容：旧字段仅 fileName；新字段使用 ref（包含 scope）
  const st = anyT.sticker
  if (st && typeof st === 'object') {
    const fileName = String(st.fileName ?? '').trim()
    const ref = String(st.ref ?? '').trim()
    const heightPx = Math.max(40, Math.min(800, Math.round(Number(st.heightPx ?? 180) || 180)))
    const resolved = resolveStickerByRefOrFileName({ ref, fileName })
    if (resolved) {
      return finalizeNormalize({
        ...(t as any),
        sticker: {
          ref: toStickerRef(resolved.scope, resolved.fileName),
          fileName: resolved.fileName,
          heightPx,
        },
      } as any)
    }
    if (fileName) {
      return finalizeNormalize({
        ...(t as any),
        sticker: {
          ref: ref || toStickerRef('bundled', fileName),
          fileName,
          heightPx,
        },
      } as any)
    }
  }
  return finalizeNormalize(t)
}

export const templatesRepo = {
  async list(): Promise<Template[]> {
    const db = await readJsonFile<DbShape>(filePath(), { templates: [] })
    const normalized = db.templates.map(normalizeTemplate)
    // 有可能存在旧数据，顺手落盘一次（避免每次启动都做转换）
    const changed = normalized.some((t, i) => JSON.stringify(t) !== JSON.stringify(db.templates[i]))
    if (changed) {
      db.templates = normalized
      await writeJsonFile(filePath(), db)
    }
    return normalized
  },

  async upsert(payload: Partial<Template> & Pick<Template, 'name' | 'structure'>): Promise<Template> {
    const db = await readJsonFile<DbShape>(filePath(), { templates: [] })
    const ts = now()

    const normalizeTransition = (input: { prev?: any; incoming?: any }) => {
      const prevTransition: any = input.prev
      const incomingTransition: any = input.incoming
      const merged =
        incomingTransition != null
          ? incomingTransition
          : prevTransition != null
            ? prevTransition
            : {
                enabled: true,
                // 默认更简单：仅淡入淡出，且更短
                pool: ['fade'],
                durationSec: { min: 0.08, max: 0.16 },
              }
      // 兼容旧数据：type=fade -> pool 全选
      if (merged && typeof merged === 'object' && !Array.isArray(merged.pool)) {
        merged.pool = ['fade', 'slideleft', 'slideright', 'pixelize', 'circlecrop']
      }
      return merged
    }

    const mergedTransition = normalizeTransition({ incoming: (payload as any).transition })
    if (payload.id) {
      const idx = db.templates.findIndex((t) => t.id === payload.id)
      if (idx >= 0) {
        const prev = db.templates[idx]
        const mergedForUpdate = normalizeTransition({ prev: (prev as any).transition, incoming: (payload as any).transition })

        const next: Template = {
          ...prev,
          ...payload,
          meta: (payload as any).meta ?? (prev as any).meta,
          segmentSyncMode: normalizeSegmentSyncMode(
            (payload as any).segmentSyncMode ?? (prev as any).segmentSyncMode,
          ),
          totalDurationSec: payload.totalDurationSec ?? prev.totalDurationSec,
          skipStartSec: payload.skipStartSec ?? prev.skipStartSec,
          segmentDurationSec: payload.segmentDurationSec ?? prev.segmentDurationSec,
          segmentFx: payload.segmentFx ?? prev.segmentFx,
          randomizeOrder: payload.randomizeOrder ?? prev.randomizeOrder,
          bgm: payload.bgm ?? prev.bgm,
          subtitle: payload.subtitle ?? prev.subtitle,
          titleOverlay: (payload as any).titleOverlay ?? (prev as any).titleOverlay,
          tts: (payload as any).tts ?? (prev as any).tts,
          assSubtitle: (payload as any).assSubtitle ?? (prev as any).assSubtitle,
          transition: mergedForUpdate,
          audio: payload.audio ?? prev.audio,
          jitter: payload.jitter ?? prev.jitter,
          colorGrade: (payload as any).colorGrade ?? (prev as any).colorGrade,
          aspectUnifyMode: (payload as any).aspectUnifyMode ?? (prev as any).aspectUnifyMode,
          lut3d: (payload as any).lut3d ?? (prev as any).lut3d,
          sticker: (payload as any).sticker ?? (prev as any).sticker,
          updatedAt: ts,
        }
        db.templates[idx] = normalizeTemplate(next)
        await writeJsonFile(filePath(), db)
        return db.templates[idx]
      }
    }

    const created: Template = {
      id: randomUUID(),
      name: payload.name,
      meta: (payload as any).meta ?? undefined,
      structure: payload.structure,
      segmentSyncMode: normalizeSegmentSyncMode((payload as any).segmentSyncMode),
      totalDurationSec: payload.totalDurationSec ?? { min: 7, max: 15 },
      skipStartSec: payload.skipStartSec ?? 1.5,
      segmentDurationSec:
        payload.segmentDurationSec ?? {
          hook: { min: 2, max: 4 },
          show: { min: 2, max: 6 },
          detail: { min: 2, max: 6 },
        },
      segmentFx:
        payload.segmentFx ?? {
          // 默认更克制：减少夸张裁剪/大幅位移
          hook: { zoom: { min: 1.0, max: 1.03 }, move: { x: { min: -0.02, max: 0.02 }, y: { min: -0.015, max: 0.015 } } },
          show: { zoom: { min: 1.0, max: 1.04 }, move: { x: { min: -0.025, max: 0.025 }, y: { min: -0.02, max: 0.02 } } },
          detail: { zoom: { min: 1.0, max: 1.05 }, move: { x: { min: -0.03, max: 0.03 }, y: { min: -0.025, max: 0.025 } } },
        },
      randomizeOrder: payload.randomizeOrder ?? { mode: 'partial', keepFirstCount: 1 },
      bgm: payload.bgm ?? null,
      // 旧字段保留但默认关闭（drawtext 已废弃）
      subtitle: payload.subtitle ?? { enabled: false, pool: [], x: '(w-text_w)/2', y: '(h-text_h)/4', fontSize: 62 },
      titleOverlay: (payload as any).titleOverlay ?? null,
      tts:
        (payload as any).tts ?? ({
          enabled: false,
          textPool: [],
          voice: 'zh-CN-XiaoxiaoNeural',
          rate: 'default',
          pitch: 'default',
          ttsVolume: 'default',
          mixVolume: 0.9,
          keepOriginal: true,
        } as any),
      assSubtitle:
        (payload as any).assSubtitle ??
        ({
          enabled: false,
          fontName: ASS_DEFAULT_FONT_FAMILY,
          fontSize: ASS_DEFAULT_FONT_SIZE,
          preset: 'yellow_box',
          marginV: ASS_DEFAULT_TITLE_MARGIN_V,
          ttsMarginV: ASS_DEFAULT_TTS_MARGIN_V,
        } as any),
      transition: mergedTransition as any,
      audio: payload.audio ?? { source: 'keep', ducking: { enabled: true, amountDb: 14 } },
      jitter: payload.jitter ?? {
        speed: { enabled: true, range: { min: 0.99, max: 1.01 } },
        color: {
          enabled: true,
          brightness: { min: -0.01, max: 0.01 },
          contrast: { min: 0.99, max: 1.01 },
          saturation: { min: 0.99, max: 1.03 },
          hueDeg: { min: -1.2, max: 1.2 },
        },
      },
      colorGrade:
        (payload as any).colorGrade ??
        ({
          enabled: false,
          brightness: 0,
          contrast: 1,
          saturation: 1,
        } as any),
      aspectUnifyMode: (payload as any).aspectUnifyMode ?? 'contain_pad',
      lut3d: (payload as any).lut3d ?? null,
      sticker: (payload as any).sticker ?? null,
      createdAt: ts,
      updatedAt: ts,
    }
    db.templates.unshift(normalizeTemplate(created))
    await writeJsonFile(filePath(), db)
    return db.templates[0]
  },

  async remove(id: string): Promise<{ ok: true }> {
    const db = await readJsonFile<DbShape>(filePath(), { templates: [] })
    db.templates = db.templates.filter((t) => t.id !== id)
    await writeJsonFile(filePath(), db)
    return { ok: true }
  },

  async ensureSeed() {
    const db = await readJsonFile<DbShape>(filePath(), { templates: [] })
    if (db.templates.length > 0) return
    const ts = now()
    db.templates = [
      {
        id: randomUUID(),
        name: '基础模板',
        structure: ['hook', 'show', 'detail'],
        segmentSyncMode: 'follow_product',
        totalDurationSec: { min: 7, max: 15 },
        skipStartSec: 1.5,
        segmentDurationSec: {
          hook: { min: 2, max: 4 },
          show: { min: 2, max: 6 },
          detail: { min: 2, max: 6 },
        },
        segmentFx: {
          hook: { zoom: { min: 1.0, max: 1.06 }, move: { x: { min: -0.04, max: 0.04 }, y: { min: -0.03, max: 0.03 } } },
          show: { zoom: { min: 1.0, max: 1.08 }, move: { x: { min: -0.05, max: 0.05 }, y: { min: -0.04, max: 0.04 } } },
          detail: { zoom: { min: 1.0, max: 1.1 }, move: { x: { min: -0.06, max: 0.06 }, y: { min: -0.05, max: 0.05 } } },
        },
        randomizeOrder: { mode: 'partial', keepFirstCount: 1 },
        bgm: null,
        subtitle: { enabled: false, pool: [], x: '(w-text_w)/2', y: '(h-text_h)/4', fontSize: 62 },
        titleOverlay: null,
        tts: {
          enabled: false,
          textPool: [],
          voice: 'zh-CN-XiaoxiaoNeural',
          rate: 'default',
          pitch: 'default',
          ttsVolume: 'default',
          mixVolume: 0.9,
          keepOriginal: true,
        } as any,
        assSubtitle: {
          enabled: false,
          fontName: ASS_DEFAULT_FONT_FAMILY,
          fontSize: ASS_DEFAULT_FONT_SIZE,
          preset: 'yellow_box',
          marginV: ASS_DEFAULT_TITLE_MARGIN_V,
          ttsMarginV: ASS_DEFAULT_TTS_MARGIN_V,
        } as any,
        // 默认更简单：仅淡入淡出，且更短
        transition: { enabled: true, pool: ['fade'], durationSec: { min: 0.08, max: 0.16 } } as any,
        audio: { source: 'keep', ducking: { enabled: true, amountDb: 14 } },
        jitter: {
          speed: { enabled: true, range: { min: 0.99, max: 1.01 } },
          color: {
            enabled: true,
            brightness: { min: -0.01, max: 0.01 },
            contrast: { min: 0.99, max: 1.01 },
            saturation: { min: 0.99, max: 1.03 },
            hueDeg: { min: -1.2, max: 1.2 },
          },
        },
        colorGrade: { enabled: false, brightness: 0, contrast: 1, saturation: 1 },
        aspectUnifyMode: 'contain_pad',
        lut3d: null,
        sticker: null,
        createdAt: ts,
        updatedAt: ts,
      },
    ]
    await writeJsonFile(filePath(), db)
  },
}

