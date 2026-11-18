import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { productsRepo } from '../products/repo'
import { templatesRepo } from '../templates/repo'
import { probeMedia } from '../ffmpeg/probe'
import { computePlanHash } from '../dedupe/hash'
import { dedupeRepo } from '../dedupe/repo'
import { taskQueue } from '../tasks/queue'
import { cloneService } from '../clone/service'
import { buildTemplateFinishing, type SegmentPlan, type VideoPlan } from '../random/engine'
import { mixPoolService } from '../mix-pool/service'
import { effectiveModel, resolveVisionTarget } from '../mix-pool/tagger'
import type { Product } from '../products/types'
import {
  ASS_DEFAULT_FONT_FAMILY,
  ASS_DEFAULT_FONT_SIZE,
  ASS_DEFAULT_TITLE_MARGIN_V,
  ASS_DEFAULT_TTS_MARGIN_V,
} from '../../../shared/assDefaults'
import { effectiveClipRole } from '../../../shared/mixPool'
import {
  MIX_VOICES,
  estimateSpeechSec,
  type MixDraft,
  type MixFormula,
  type MixJobInput,
  type MixLanguage,
  type MixPreviewResult,
} from '../../../shared/mixFormula'
import { formulaRepo } from './formulas'
import { allocateFormulas, commitUsage, createBatchUsage, fitDraftToDuration, newDraft, planDraftShots, totalOf, type PlannerPool } from './planner'
import { pickHookStyles, scriptFromPools, writeScriptsWithAi } from './scriptWriter'
import { creativeOptions, mixLedger, type CreativeVideoLike, type MixLearnedWeights, type PublishTaskLike } from './insights'
import type { MixCreativeOption, MixRefreshResult } from '../../../shared/mixInsights'

// Every finished mix render goes into the ledger so its TikTok results can be traced back later.
taskQueue.onEvent((evt) => {
  if (evt.type === 'task:update' && evt.task.mix && evt.task.status === 'done') void mixLedger.recordRender(evt.task).catch(() => undefined)
})

async function readCreatives(): Promise<{ creatives: CreativeVideoLike[]; available: boolean; message?: string }> {
  try {
    const { gmvMaxService } = await import('../tiktok-gmv-max/service')
    const ws = await gmvMaxService.getSopWorkspace()
    // The same creative can appear under several SOP instances; keep the copy with the most data.
    const best = new Map<string, CreativeVideoLike & { samples: number }>()
    for (const c of ws.creativeVideos ?? []) {
      const samples = Number(c.performance?.samples || 0)
      const prev = best.get(c.creativeId)
      if (!prev || samples > prev.samples) best.set(c.creativeId, { ...c, samples })
    }
    return { creatives: [...best.values()], available: (ws.instances ?? []).length > 0 }
  } catch (e: any) {
    return { creatives: [], available: false, message: String(e?.message ?? e).slice(0, 200) }
  }
}

async function readPublishTasks(): Promise<PublishTaskLike[]> {
  try {
    const { creatokPublisherRepo } = await import('../tiktok-publisher/repo')
    return (await creatokPublisherRepo.list()) as PublishTaskLike[]
  } catch {
    return []
  }
}

const SCRIPT_BATCH = 4
const MAX_COUNT = 50

/**
 * ASS is rendered with WrapStyle 2 (no auto wrap), so long hook titles run off the frame.
 * Break into lines of ~TITLE_LINE_UNITS width (CJK/Thai/full-width count double), at spaces when possible.
 */
const TITLE_LINE_UNITS = 26
function wrapTitle(text: string) {
  const width = (ch: string) => (/[\u2E80-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF\u0E00-\u0E7F]/.test(ch) ? 2 : 1)
  const tokens = String(text || '').replace(/\s+/g, ' ').trim().match(/[\u2E80-\u9FFF\uFF00-\uFFEF]|[^\s\u2E80-\u9FFF\uFF00-\uFFEF]+|\s/g) ?? []
  const lines: string[] = []
  let line = ''
  let w = 0
  for (const tok of tokens) {
    const tw = [...tok].reduce((a, c) => a + width(c), 0)
    if (tok === ' ') {
      if (line) {
        line += ' '
        w += 1
      }
      continue
    }
    if (w + tw > TITLE_LINE_UNITS && line.trim()) {
      lines.push(line.trim())
      line = ''
      w = 0
    }
    line += tok
    w += tw
  }
  if (line.trim()) lines.push(line.trim())
  return lines.slice(0, 3).join('\n')
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 40)
const rand = (min: number, max: number) => min + Math.random() * (max - min)

function normalizeInput(raw: MixJobInput): MixJobInput {
  const language = (Object.keys(MIX_VOICES) as MixLanguage[]).includes(raw.language) ? raw.language : 'vi-VN'
  const voices = MIX_VOICES[language].map((v) => v.id)
  return {
    ...raw,
    productId: String(raw.productId || '').trim(),
    mode: raw.mode === 'ai' ? 'ai' : 'auto',
    formulaIds: Array.isArray(raw.formulaIds) ? raw.formulaIds.map(String).filter(Boolean) : [],
    count: Math.max(1, Math.min(MAX_COUNT, Math.floor(Number(raw.count) || 1))),
    language,
    voice: voices.includes(raw.voice) ? raw.voice : voices[0]!,
    outDir: String(raw.outDir || '').trim(),
    keepOriginalAudio: Boolean(raw.keepOriginalAudio),
    allowAiClips: raw.allowAiClips !== false,
  }
}

async function loadProduct(productId: string): Promise<Product> {
  const product = (await productsRepo.list()).find((p) => p.id === productId)
  if (!product) throw new Error('未找到商品')
  return product
}

async function loadFormulas(ids: string[]): Promise<MixFormula[]> {
  const all = await formulaRepo.list()
  const picked = ids.length ? ids.map((id) => all.find((f) => f.id === id)).filter((f): f is MixFormula => Boolean(f)) : []
  return picked.length ? picked : all.filter((f) => f.source === 'builtin')
}

async function loadPool(productId: string): Promise<PlannerPool> {
  const overview = await mixPoolService.overview(productId)
  const clips = overview.clips.filter((c) => !c.disabled && effectiveClipRole(c))
  if (clips.length < 3) throw new Error('素材池里已识别的镜头少于 3 个，请先到「混剪素材池」同步素材并完成切镜识别')
  return { clips, sourceById: new Map(overview.sources.map((s) => [s.id, s])) }
}

export const mixStudioService = {
  listFormulas: () => formulaRepo.list(),
  saveFormula: (f: Parameters<typeof formulaRepo.save>[0]) => formulaRepo.save(f),
  removeFormula: (id: string) => formulaRepo.remove(id),
  formulaFromReference: (input: { videoPath: string; name?: string }) => formulaRepo.fromReferenceVideo(input),

  /** Plans shots for every video, writes scripts, sizes each cut to its voiceover. Nothing is rendered yet. */
  async preview(raw: MixJobInput): Promise<MixPreviewResult> {
    const input = normalizeInput(raw)
    const winner = input.winnerOf ? await mixLedger.get(input.winnerOf) : null
    if (input.winnerOf && !winner) throw new Error('找不到要复刻的爆款视频记录')
    const formulaIds = winner ? [winner.formulaId] : input.formulaIds
    const [product, formulas, pool] = await Promise.all([loadProduct(input.productId), loadFormulas(formulaIds), loadPool(input.productId)])
    const formulaById = new Map(formulas.map((f) => [f.id, f]))
    const warnings: string[] = []
    const usage = createBatchUsage()

    const learned: MixLearnedWeights | null = input.useInsights !== false ? await mixLedger.learnedWeights(input.productId).catch(() => null) : null
    const useLearned = Boolean(learned && learned.measured > 0)
    const { seq, counts } = allocateFormulas(formulas, input.count, useLearned ? learned!.formula : null)
    const bias = {
      hookWeights: useLearned ? learned!.hookClip : undefined,
      pinHookClipId: winner?.hookClipId,
    }

    const drafts: MixDraft[] = []
    for (let i = 0; i < seq.length; i++) {
      const formula = seq[i]!
      const planned = planDraftShots({ pool, formula, usage, allowAi: input.allowAiClips, bias })
      if (!planned) {
        warnings.push(`第 ${i + 1} 条：素材不足，无法按「${formula.name}」拼出视频`)
        continue
      }
      commitUsage(usage, planned.shots)
      drafts.push(newDraft(formula, planned.shots, planned.warnings))
    }
    if (!drafts.length) throw new Error('素材池镜头不足，没有生成任何方案')

    let scriptModel: string | undefined
    let winnerRefs = 0
    if (input.mode === 'ai') {
      const target = resolveVisionTarget(await cloneService.getModelCredentials().catch(() => null))
      if (!target) throw new Error('AI 混剪需要先在设置里配置对话模型（VectorEngine 或 GRS.AI），或改用自动混剪')
      scriptModel = target.model
      const styles = winner?.hookStyle ? drafts.map(() => winner.hookStyle!) : pickHookStyles(drafts.length, useLearned ? learned!.hookStyle : null)
      const winners = useLearned ? await mixLedger.winners(input.productId, 3) : []
      winnerRefs = winners.length
      for (let i = 0; i < drafts.length; i += SCRIPT_BATCH) {
        const batch = drafts.slice(i, i + SCRIPT_BATCH)
        try {
          const scripts = await writeScriptsWithAi({
            target,
            product,
            drafts: batch,
            formulas: formulaById,
            language: input.language,
            sellingPoints: input.sellingPoints,
            styles: styles.slice(i, i + batch.length),
            winners: winners.map((w) => ({ grade: w.performance!.grade, title: w.title, voiceover: w.voiceover })),
            keepHookFrom: winner ? { title: winner.title, voiceover: winner.voiceover } : undefined,
          })
          batch.forEach((d, k) => {
            const s = scripts[k]
            if (!s) return
            Object.assign(d, { title: s.title, voiceover: s.voiceover, hookStyle: s.hookStyle, scriptSource: 'ai' as const })
          })
        } catch (e: any) {
          warnings.push(`AI 文案生成失败（第 ${i + 1}-${i + batch.length} 条）：${String(e?.message ?? e).slice(0, 160)}`)
        }
      }
      // Report the model that actually answered (a maintenance fallback may have taken over).
      scriptModel = effectiveModel(target)
    }
    drafts.forEach((d, i) => {
      if (d.voiceover) return
      const s = scriptFromPools({ product, index: i, hookLines: input.hookLines, bodyLines: input.bodyLines, ctaLines: input.ctaLines, language: input.language })
      if (s) Object.assign(d, { title: s.title, voiceover: s.voiceover, hookStyle: s.hookStyle, scriptSource: 'pool' as const })
    })

    // Size every cut to its voiceover (or keep the formula length when silent).
    for (const d of drafts) {
      if (!d.voiceover) {
        d.warnings.push('没有配音文案，只会输出画面 + 标题')
        continue
      }
      const speech = estimateSpeechSec(d.voiceover, input.language)
      const fitted = fitDraftToDuration({ shots: d.shots, targetSec: Math.max(6, speech + 0.8), pool, usage, allowAi: input.allowAiClips })
      d.shots = fitted.shots
      d.totalDurationSec = totalOf(d.shots)
      if (fitted.added) d.warnings.push(`配音较长，已补 ${fitted.added} 个镜头`)
      if (d.totalDurationSec < speech) d.warnings.push(`镜头总长 ${d.totalDurationSec.toFixed(1)}s 短于预计配音 ${speech.toFixed(1)}s，渲染时会自动延长镜头`)
    }

    return {
      drafts,
      warnings,
      scriptModel,
      learned: useLearned
        ? {
            measured: learned!.measured,
            formulaShares: formulas.map((f, i) => ({ formulaId: f.id, formulaName: f.name, count: counts[i]!, weight: learned!.formula.get(f.id) ?? 1 })),
            winnerRefs,
          }
        : undefined,
    }
  },

  ledger: (productId?: string) => mixLedger.list(productId),
  insights: (productId?: string) => mixLedger.insights(productId),
  removeLedgerEntry: (id: string) => mixLedger.remove(id),

  /** Pulls the latest GMV Max creative results, refreshes linked videos and auto-links new ones. */
  async refreshPerformance(): Promise<MixRefreshResult> {
    const [{ creatives, available, message }, publishTasks] = await Promise.all([readCreatives(), readPublishTasks()])
    if (!creatives.length) return { creatives: 0, newlyLinked: 0, updated: 0, gmvMaxAvailable: available, message }
    const res = await mixLedger.applyCreatives(creatives, publishTasks)
    return { creatives: creatives.length, ...res, gmvMaxAvailable: true }
  },

  async listCreatives(): Promise<MixCreativeOption[]> {
    const { creatives } = await readCreatives()
    return creativeOptions(creatives, await mixLedger.list())
  },

  async linkCreative(entryId: string, creativeId: string | null) {
    if (!creativeId) return mixLedger.setLink(entryId, null)
    const { creatives } = await readCreatives()
    const c = creatives.find((x) => x.creativeId === creativeId)
    if (!c) throw new Error('GMV Max 中找不到这条素材，请先同步 GMV Max 数据')
    return mixLedger.setLink(entryId, c)
  },

  /** Creates publish-center drafts for rendered mix videos, tagged so their TikTok results link back automatically. */
  async sendToPublish(entryIds: string[]) {
    const { creatokPublisherService } = await import('../tiktok-publisher/service')
    const links: Array<{ entryId: string; publishTaskId: string }> = []
    for (const id of entryIds) {
      const e = await mixLedger.get(id)
      if (!e) continue
      const [draft] = await creatokPublisherService.createDraftsFromPaths({
        paths: [e.outPath],
        defaults: {
          videoTitle: e.title.replace(/\s+/g, ' ').slice(0, 150),
          localProductId: e.productId,
          sourceRef: `mix:${e.id}`,
        },
      })
      if (draft) links.push({ entryId: e.id, publishTaskId: draft.id })
    }
    await mixLedger.addPublishTasks(links)
    return { created: links.length }
  },

  /** Turns reviewed drafts into render tasks on the existing queue. */
  async enqueue(raw: MixJobInput, drafts: MixDraft[]) {
    const input = normalizeInput(raw)
    if (!input.outDir) throw new Error('输出目录不能为空')
    await mkdir(input.outDir, { recursive: true })
    const product = await loadProduct(input.productId)
    const template = input.templateId ? (await templatesRepo.list()).find((t) => t.id === input.templateId) ?? null : null

    const probeCache = new Map<string, Awaited<ReturnType<typeof probeMedia>>>()
    const probe = async (fp: string) => {
      if (!probeCache.has(fp)) probeCache.set(fp, await probeMedia(fp))
      return probeCache.get(fp)!
    }

    let enqueued = 0
    let skipped = 0
    for (const d of drafts) {
      if (!Array.isArray(d.shots) || d.shots.length < 2) {
        skipped++
        continue
      }
      const segments: SegmentPlan[] = []
      for (const s of d.shots) {
        const meta = await probe(s.filePath)
        const dur = Math.max(0.3, Number(s.durationSec) || 1)
        segments.push({
          segment: s.role,
          assetId: s.clipId,
          filePath: s.filePath,
          startSec: Math.max(0, Number(s.startSec) || 0),
          durationSec: Number(dur.toFixed(3)),
          inputDurationSec: Number(dur.toFixed(3)),
          hasAudio: meta.hasAudio,
          ...(meta.audioStreamIndex !== undefined ? { audioStreamIndex: meta.audioStreamIndex } : {}),
          sourceDurationSec: Number(meta.durationSec || s.sourceDurationSec || 0) || undefined,
          // Slow push-in keeps static shots alive and makes each render pixel-distinct.
          fx: { zoom: Number(rand(1.0, 1.05).toFixed(4)), moveX: Number(rand(-0.02, 0.02).toFixed(4)), moveY: Number(rand(-0.015, 0.015).toFixed(4)) },
        })
      }

      const finishing = template
        ? buildTemplateFinishing(template, segments)
        : {
            colorGrade: null,
            aspectUnifyMode: 'cover_crop' as const,
            lut3d: null,
            sticker: null,
            bgm: null,
            voice: null,
            ass: null,
            // Selling edits use hard cuts; transitions read as slideshow.
            transition: { enabled: false, durationsSec: [], transitions: [] },
            assStyle: null,
            audio: { source: 'keep' as const, ducking: { enabled: true, amountDb: 14 } },
          }
      const voiceover = String(d.voiceover || '').trim()
      const title = String(d.title || '').trim()
      const plan: VideoPlan = {
        ...finishing,
        totalDurationSec: Number(segments.reduce((a, s) => a + s.durationSec, 0).toFixed(3)),
        segments,
        fitToVoice: true,
        audio: {
          ...(finishing.audio ?? { ducking: { enabled: true, amountDb: 14 } }),
          source: input.keepOriginalAudio ? 'keep' : 'mute',
        },
        // Voiceover subtitles are the main conversion text, so ASS stays on whenever there is a voiceover.
        assStyle: {
          enabled: Boolean(voiceover) || Boolean(finishing.assStyle?.enabled),
          fontName: finishing.assStyle?.fontName ?? ASS_DEFAULT_FONT_FAMILY,
          fontSize: finishing.assStyle?.fontSize ?? ASS_DEFAULT_FONT_SIZE,
          preset: finishing.assStyle?.preset ?? 'yellow_box',
          marginV: finishing.assStyle?.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V,
          ttsMarginV: finishing.assStyle?.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V,
        },
        titleOverlay: title ? { text: wrapTitle(title) } : null,
        tts: voiceover
          ? { text: voiceover, voice: input.voice, mixVolume: 1, keepOriginal: input.keepOriginalAudio }
          : null,
      }

      const templateKey = `mix:${d.formulaId}`
      const hash = computePlanHash({ productId: product.id, templateId: templateKey, plan })
      if (await dedupeRepo.has(hash)) {
        skipped++
        continue
      }
      await dedupeRepo.add(hash)
      const outPath = join(input.outDir, `${safeName(product.name)}_${safeName(d.formulaName)}_${Date.now()}_${randomUUID().slice(0, 8)}.mp4`)
      taskQueue.enqueue({
        productId: product.id,
        templateId: input.templateId || templateKey,
        outDir: input.outDir,
        outPath,
        plan,
        hash,
        mix: {
          mode: input.mode,
          formulaId: d.formulaId,
          formulaName: d.formulaName,
          hookClipId: d.shots[0]!.clipId,
          clipIds: d.shots.map((s) => s.clipId),
          title,
          voiceover,
          hookStyle: d.hookStyle,
          language: input.language,
        },
      })
      enqueued++
    }
    return { enqueued, skipped }
  },
}
