import { randomUUID } from 'node:crypto'
import type { ShotSpec, ShotVariant, ShotVariantScore, VideoPlan } from './types'

type BuildInput = {
  cloneProjectId: string
  shots: ShotSpec[]
  variants: Record<string, ShotVariant[]>
  variantScores: Record<string, ShotVariantScore[]>
  targetProductId?: string
  planCount: number
  maxVideosToGenerate: number
  strategy: 'balanced' | 'hook_first' | 'conversion_first' | 'anti_duplicate'
}

function scoreByVariant(input: {
  shot: ShotSpec
  variant: ShotVariant
  score?: ShotVariantScore
  strategy: BuildInput['strategy']
}) {
  const s = input.score
  if (!s) return 0
  const hookWeight = input.strategy === 'hook_first' ? 0.45 : 0.25
  const conversionWeight = input.strategy === 'conversion_first' ? 0.45 : 0.30
  const duplicatePenalty = input.strategy === 'anti_duplicate' ? 0.3 : 0.15
  return (
    s.hookScore * hookWeight +
    s.engagementScore * 0.1 +
    s.conversionScore * conversionWeight +
    s.gmvScore * 0.2 +
    s.realismScore * 0.1 -
    s.duplicateRiskScore * duplicatePenalty
  )
}

function roleNeed(shot: ShotSpec['scriptRole']) {
  if (shot === 'hook') return 'hook'
  if (shot === 'show' || shot === 'detail' || shot === 'cta') return 'conversion'
  return 'balanced'
}

function uniqueDiversityScore(variantIds: string[]) {
  const uniq = new Set(variantIds).size
  return Number((uniq / Math.max(1, variantIds.length) * 10).toFixed(2))
}

export function buildVideoPlans(input: BuildInput): VideoPlan[] {
  const shots = input.shots
  const pool = shots.map((shot) => {
    const variants = (input.variants[shot.id] ?? []).filter((v) => v.reviewStatus !== 'reject')
    const scoreMap = new Map((input.variantScores[shot.id] ?? []).map((s) => [s.variantId, s]))
    const ranked = variants
      .map((v) => ({ v, s: scoreMap.get(v.id), fit: scoreByVariant({ shot, variant: v, score: scoreMap.get(v.id), strategy: input.strategy }) }))
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 3)
    return { shot, ranked }
  })
  const candidates: VideoPlan[] = []
  const rounds = Math.max(1, Math.min(30, input.planCount || 12))
  for (let i = 0; i < rounds; i += 1) {
    const structure: VideoPlan['structure'] = []
    const usedStyle = new Set<string>()
    for (const item of pool) {
      if (!item.ranked.length) continue
      const role = roleNeed(item.shot.scriptRole)
      let picks = item.ranked
      if (role === 'hook') picks = [...item.ranked].sort((a, b) => (b.s?.hookScore || 0) - (a.s?.hookScore || 0))
      if (role === 'conversion') picks = [...item.ranked].sort((a, b) => (b.s?.conversionScore || 0) - (a.s?.conversionScore || 0))
      const chosen = picks.find((x) => !usedStyle.has(x.v.styleType)) ?? picks[i % picks.length]
      usedStyle.add(chosen.v.styleType)
      structure.push({ shotId: item.shot.id, variantId: chosen.v.id, role: item.shot.scriptRole })
    }
    const hookScores = structure
      .map((x) => pool.find((p) => p.shot.id === x.shotId)?.ranked.find((r) => r.v.id === x.variantId)?.s?.hookScore || 0)
      .filter((_, idx) => structure[idx]?.role === 'hook')
    const convScores = structure
      .map((x) => pool.find((p) => p.shot.id === x.shotId)?.ranked.find((r) => r.v.id === x.variantId)?.s?.conversionScore || 0)
      .filter((_, idx) => ['show', 'detail', 'cta'].includes(structure[idx]?.role || ''))
    const hookScore = hookScores.length ? hookScores.reduce((a, b) => a + b, 0) / hookScores.length : 0
    const conversionScore = convScores.length ? convScores.reduce((a, b) => a + b, 0) / convScores.length : 0
    const duplicateSafetyScore = uniqueDiversityScore(structure.map((x) => x.variantId))
    const totalScore = Number((hookScore * 0.35 + conversionScore * 0.45 + duplicateSafetyScore * 0.2).toFixed(2))
    candidates.push({
      id: randomUUID(),
      name: `Plan ${String(i + 1).padStart(2, '0')}`,
      cloneProjectId: input.cloneProjectId,
      targetProductId: input.targetProductId,
      structure,
      score: {
        hookScore: Number(hookScore.toFixed(2)),
        conversionScore: Number(conversionScore.toFixed(2)),
        duplicateSafetyScore,
        totalScore,
        reason: `hook ${hookScore.toFixed(1)}, conversion ${conversionScore.toFixed(1)}, diversity ${duplicateSafetyScore.toFixed(1)}`,
      },
      status: 'draft',
      createdAt: Date.now() + i,
    })
  }
  const top = candidates.sort((a, b) => b.score.totalScore - a.score.totalScore).slice(0, Math.max(1, input.maxVideosToGenerate))
  return top.map((p, idx) => ({ ...p, status: idx === 0 ? 'selected' : 'draft' }))
}

