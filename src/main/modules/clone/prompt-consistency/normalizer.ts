import type { ShotSpec } from '../types'
import { keepEnglishLikeText, sanitizeGeneratedVideoPrompt, sanitizeNegativePrompt } from '../prompt'

export function normalizeShotPromptBase(shot: ShotSpec) {
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
    styleDescription: keepEnglishLikeText(
      shot.generationPrompt || shot.aiPrompt || shot.prompt?.positive,
      'Premium realistic social commerce video.',
    ),
    negativeDescription: sanitizeNegativePrompt(shot.negativePrompt || ''),
  }
}

export function normalizeFinalPromptSections(sections: string[]) {
  return sanitizeGeneratedVideoPrompt(sections.filter(Boolean).join('\n\n'), 3200)
}
