import type { ShotSpec } from '../types'
import { keepEnglishLikeText, sanitizeGeneratedVideoPrompt, sanitizeNegativePrompt } from '../prompt'

function compactPromptClauses(value: string) {
  const seen = new Set<string>()
  return value
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/(redesign|reinterpret|beautify|overstyle|over-style|style makeover|editorial fashion|surreal|fantasy glow)/i.test(item))
    .filter((item) => !/(dramatic movement|whip pan|extreme motion blur|hidden product|product occlusion)/i.test(item))
    .filter((item) => {
      const key = item.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join(' ')
}

export function normalizeShotPromptBase(shot: ShotSpec) {
  const normalizedStyle = compactPromptClauses(
    keepEnglishLikeText(
      shot.generationPrompt || shot.aiPrompt || shot.prompt?.positive,
      'Premium realistic social commerce video.',
    ),
  )
  return {
    scriptText: keepEnglishLikeText(shot.scriptText, 'Maintain the original shot selling logic and timing.'),
    visualDescription: keepEnglishLikeText(
      shot.visualDescription || shot.visualPrompt || shot.visual,
      'Real social-commerce product demonstration in a believable environment.',
    ),
    actionDescription: keepEnglishLikeText(
      shot.actionDescription || shot.action || shot.visualPrompt,
      'Natural product demonstration with believable hand movement.',
    ),
    cameraDescription: keepEnglishLikeText(
      shot.cameraDescription || `${shot.framing || 'closeup'} framing, ${shot.cameraMovement || shot.motion || 'static'} movement`,
      'Closeup framing with controlled camera continuity.',
    ),
    styleDescription: sanitizeGeneratedVideoPrompt(normalizedStyle, 320),
    negativeDescription: sanitizeNegativePrompt(shot.negativePrompt || ''),
  }
}

export function normalizeFinalPromptSections(sections: string[]) {
  return sanitizeGeneratedVideoPrompt(sections.filter(Boolean).join('\n\n'), 3200)
}
