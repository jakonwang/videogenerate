import type { GmvMaxRecommendation } from './types'

function candidatePriority(item: GmvMaxRecommendation) {
  const operation = String(item.actionPayload?.operation || '').toUpperCase()
  if (item.actionType === 'status') return 0
  if ((item.actionType === 'budget' || item.actionType === 'roi') && item.kind === 'scale_down') return 1
  if (item.actionType === 'creative' && ['REMOVE', 'ROTATE'].includes(operation)) return 2
  if ((item.actionType === 'budget' || item.actionType === 'roi') && item.kind === 'scale_up') return 3
  if (item.actionType === 'creative') return 4
  if (item.actionType === 'session') return 5
  return 6
}

function rankedCandidates(candidates: GmvMaxRecommendation[]) {
  return [...candidates].sort((left, right) => {
    const priority = candidatePriority(left) - candidatePriority(right)
    if (priority) return priority
    const riskOrder = { high: 0, medium: 1, low: 2 }
    const risk = riskOrder[left.risk] - riskOrder[right.risk]
    return risk || left.id.localeCompare(right.id)
  })
}

export function selectGmvMaxCampaignCandidate(candidates: GmvMaxRecommendation[]) {
  return rankedCandidates(candidates)[0]
}

export function selectGmvMaxCampaignCandidates(candidates: GmvMaxRecommendation[]) {
  const ranked = rankedCandidates(candidates)
  const campaignAction = ranked.find((item) => ['status', 'budget', 'roi'].includes(item.actionType || 'budget'))
  const creativeActions = ranked.filter((item) => item.actionType === 'creative').slice(0, 5)
  const sessionAction = ranked.find((item) => item.actionType === 'session')
  return [campaignAction, ...creativeActions, sessionAction]
    .filter((item): item is GmvMaxRecommendation => Boolean(item))
}
