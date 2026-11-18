import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { analyzeReferenceVideo } from '../clone/analyzer'
import { cloneService } from '../clone/service'
import type { CloneLocale, ScriptRole } from '../clone/types'
import { CLIP_ROLES, type ClipRole } from '../../../shared/mixPool'
import { BUILTIN_FORMULAS, type FormulaBeat, type MixFormula } from '../../../shared/mixFormula'

type DbShape = { formulas: MixFormula[] }

const filePath = () => join(getAppPaths().dbDir, 'mix-formulas.json')

const SCRIPT_ROLE_TO_CLIP: Record<ScriptRole, ClipRole> = {
  hook: 'hook',
  pain_point: 'pain_point',
  solution: 'demo',
  show: 'wear',
  detail: 'detail',
  proof: 'proof',
  offer: 'cta',
  cta: 'cta',
  transition: 'broll',
  unknown: 'demo',
}

const FALLBACK_ALT: Partial<Record<ClipRole, ClipRole[]>> = {
  hook: ['wear', 'demo'],
  pain_point: ['comparison', 'demo'],
  demo: ['wear', 'detail'],
  wear: ['demo', 'detail'],
  detail: ['demo', 'proof'],
  proof: ['detail', 'demo'],
  cta: ['wear', 'detail'],
  unboxing: ['detail'],
  comparison: ['detail'],
  broll: ['detail', 'wear'],
}

const round1 = (n: number) => Math.round(n * 10) / 10

function sanitizeBeats(beats: unknown): FormulaBeat[] {
  const list = Array.isArray(beats) ? beats : []
  const out: FormulaBeat[] = []
  for (const b of list) {
    const role = String((b as any)?.role ?? '') as ClipRole
    if (!(CLIP_ROLES as readonly string[]).includes(role)) continue
    const min = Math.max(0.6, Number((b as any)?.durationSec?.min) || 1.5)
    const max = Math.max(min, Number((b as any)?.durationSec?.max) || min + 1)
    out.push({
      role,
      altRoles: Array.isArray((b as any)?.altRoles)
        ? (b as any).altRoles.filter((r: string) => (CLIP_ROLES as readonly string[]).includes(r))
        : undefined,
      durationSec: { min: round1(min), max: round1(Math.min(max, 8)) },
      optional: Boolean((b as any)?.optional),
      scriptHint: String((b as any)?.scriptHint ?? '').slice(0, 200) || undefined,
    })
  }
  return out.slice(0, 16)
}

export const formulaRepo = {
  async list(): Promise<MixFormula[]> {
    const db = await readJsonFile<DbShape>(filePath(), { formulas: [] })
    const custom = (db.formulas ?? []).slice().sort((a, b) => b.updatedAt - a.updatedAt)
    return [...custom, ...BUILTIN_FORMULAS]
  },

  async get(id: string) {
    return (await this.list()).find((f) => f.id === id) ?? null
  },

  async save(input: Partial<MixFormula> & { name: string; beats: FormulaBeat[] }): Promise<MixFormula> {
    if (String(input.id || '').startsWith('builtin:')) throw new Error('内置公式不能修改，请另存为新公式')
    const beats = sanitizeBeats(input.beats)
    if (!beats.length) throw new Error('公式至少需要一个镜头')
    const db = await readJsonFile<DbShape>(filePath(), { formulas: [] })
    const nowTs = Date.now()
    const existing = input.id ? db.formulas.find((f) => f.id === input.id) : undefined
    const next: MixFormula = {
      id: existing?.id ?? randomUUID(),
      name: String(input.name || '').trim().slice(0, 60) || '未命名公式',
      angle: input.angle ?? existing?.angle ?? 'custom',
      description: String(input.description ?? existing?.description ?? '').slice(0, 300),
      beats,
      source: existing?.source ?? input.source ?? 'custom',
      referenceVideoPath: input.referenceVideoPath ?? existing?.referenceVideoPath,
      referenceScript: input.referenceScript ?? existing?.referenceScript,
      createdAt: existing?.createdAt ?? nowTs,
      updatedAt: nowTs,
    }
    db.formulas = [next, ...db.formulas.filter((f) => f.id !== next.id)]
    await writeJsonFile(filePath(), db)
    return next
  },

  async remove(id: string) {
    const db = await readJsonFile<DbShape>(filePath(), { formulas: [] })
    db.formulas = db.formulas.filter((f) => f.id !== id)
    await writeJsonFile(filePath(), db)
    return { ok: true }
  },

  /**
   * Turns a high-performing reference video into a beat sheet: scene-cut + AI script analysis
   * (the same analyzer the clone module uses), then shot roles/durations become formula beats.
   */
  async fromReferenceVideo(input: { videoPath: string; name?: string; locale?: CloneLocale }): Promise<MixFormula> {
    const workDir = join(getAppPaths().dataDir, 'mix-formulas', randomUUID())
    await mkdir(workDir, { recursive: true })
    try {
      const credentials = await cloneService.getModelCredentials()
      const { blueprint, referenceVideoName } = await analyzeReferenceVideo({
        videoPath: input.videoPath,
        locale: input.locale,
        outputDir: workDir,
        credentials,
      })
      const shots = (blueprint.shots ?? []).filter((s) => s.cloneEligible !== false)
      const beats: FormulaBeat[] = []
      for (const shot of shots) {
        const role = SCRIPT_ROLE_TO_CLIP[(shot.scriptRole as ScriptRole) ?? 'unknown'] ?? 'demo'
        const dur = Math.max(0.6, Number(shot.durationSec || 0))
        const prev = beats[beats.length - 1]
        // Consecutive shots with the same role and short length become one beat (fast cut stays inside it).
        if (prev && prev.role === role && prev.durationSec.max + dur <= 4.5) {
          prev.durationSec = { min: round1(prev.durationSec.min + dur * 0.8), max: round1(prev.durationSec.max + dur) }
          continue
        }
        beats.push({
          role,
          altRoles: FALLBACK_ALT[role],
          durationSec: { min: round1(Math.max(0.8, dur * 0.8)), max: round1(Math.max(1, Math.min(dur * 1.2, 6))) },
          optional: role === 'broll' || role === 'pain_point',
          scriptHint: String(shot.narrationText || shot.scriptText || shot.onScreenText || '').slice(0, 160) || undefined,
        })
      }
      if (beats[0] && beats[0].role !== 'hook') beats[0] = { ...beats[0], altRoles: ['hook', ...(beats[0].altRoles ?? [])] }
      if (!beats.length) throw new Error('参考视频没有分析出可用镜头')
      const g = blueprint.globalScript
      const voiceover = shots
        .map((s) => String(s.narrationText || '').trim())
        .filter(Boolean)
        .join(' ')
      return await this.save({
        name: input.name?.trim() || `参考-${referenceVideoName.replace(/\.[^.]+$/, '')}`.slice(0, 60),
        angle: 'custom',
        description: String(g?.summary || blueprint.videoSummary || '').slice(0, 300),
        beats,
        source: 'reference',
        referenceVideoPath: input.videoPath,
        referenceScript: {
          hook: g?.hook || blueprint.scriptFrame?.hook,
          cta: g?.cta || blueprint.scriptFrame?.cta,
          voiceover: voiceover.slice(0, 1200) || undefined,
          sellingLogic: g?.sellingLogic,
        },
      })
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    }
  },
}
