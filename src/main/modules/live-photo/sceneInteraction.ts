import type { LivePhotoSceneInteraction, LivePhotoSceneInteractionMode } from './types'

const MODES = new Set<LivePhotoSceneInteractionMode>([
  'worn',
  'held',
  'placed',
  'hanging',
  'attached',
  'none',
  'unknown',
])

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

export function normalizeLivePhotoSceneInteraction(
  input: Partial<LivePhotoSceneInteraction> | null | undefined,
  fallback?: Pick<LivePhotoSceneInteraction, 'revision' | 'updatedAt'>,
): LivePhotoSceneInteraction | null {
  if (!input) return null
  const rawMode = String(input.mode || '').trim().toLowerCase() as LivePhotoSceneInteractionMode
  const mode = MODES.has(rawMode) ? rawMode : 'unknown'
  const confidenceValue = Number(input.confidence)
  const confidence = Number.isFinite(confidenceValue) ? clamp(confidenceValue, 0, 1) : 0
  const support = String(input.support || '').trim()
  const occlusion = String(input.occlusion || '').trim()
  return {
    mode: confidence >= 0.7 ? mode : 'unknown',
    confidence,
    support: support || undefined,
    occlusion: occlusion || undefined,
    revision: Math.max(1, Math.floor(Number(input.revision || fallback?.revision || 1))),
    updatedAt: Math.max(1, Number(input.updatedAt || fallback?.updatedAt || Date.now())),
  }
}

export function buildLivePhotoSceneInteractionPromptRules(input?: LivePhotoSceneInteraction | null): string[] {
  const interaction = normalizeLivePhotoSceneInteraction(input)
  const shared = [
    '',
    'SCENE INTERACTION LOCK:',
    '- Determine how the original product physically interacts with the scene before replacing it.',
    '- Preserve the exact support, contact points, orientation, depth order, and occlusion from Image 1.',
    '- Do not convert between worn, held, placed, hanging, attached, or unsupported presentation states.',
  ]
  if (!interaction || interaction.mode === 'unknown') {
    return [
      ...shared,
      '- If the interaction is uncertain, infer it from visible contact and occlusion in Image 1 and keep it unchanged.',
    ]
  }
  const details = [
    interaction.support ? `- Scene support relation: ${interaction.support}.` : '',
    interaction.occlusion ? `- Required occlusion relation: ${interaction.occlusion}.` : '',
  ].filter(Boolean)
  const modeRules: Record<LivePhotoSceneInteractionMode, string[]> = {
    worn: [
      '- The product is worn on the body. Keep the same body location, wrap or attachment path, and skin contact.',
      '- Do not turn the worn product into a hand-held, pinched, floating, or surface-placed product.',
    ],
    held: [
      '- The product is held or pinched for display. Keep the same fingers or hand contact and the same visible occlusion.',
      '- Do not put the product on a finger, ear, wrist, neck, or other body part unless Image 1 already shows it worn there.',
    ],
    placed: [
      '- The product is resting on a surface or support. Keep the same support plane, contact shadow, and orientation.',
      '- Do not turn the placed product into a worn, held, hanging, attached, or floating product.',
    ],
    hanging: [
      '- The product is hanging from a visible suspension point. Keep the same suspension point, gravity direction, and overlap.',
      '- Do not turn the hanging product into a worn, held, placed, attached, or floating product.',
    ],
    attached: [
      '- The product is attached to another object. Keep the same connector, mounting point, contact direction, and overlap.',
      '- Do not detach, hand-hold, wear, or float the product.',
    ],
    none: [
      '- No physical support is visible. Keep the same unsupported presentation without adding hands, body contact, or fixtures.',
    ],
    unknown: [],
  }
  return [...shared, ...modeRules[interaction.mode], ...details]
}

export function buildLivePhotoSceneInteractionNegativeTerms(input?: LivePhotoSceneInteraction | null): string[] {
  const interaction = normalizeLivePhotoSceneInteraction(input)
  if (!interaction) return []
  if (interaction.mode === 'held') return ['product worn on body', 'ring worn on finger', 'product detached from holding fingers']
  if (interaction.mode === 'worn') return ['product held for display', 'pinched product', 'product detached from body anchor']
  if (interaction.mode === 'placed') return ['product worn on body', 'product held in hand', 'floating product']
  if (interaction.mode === 'hanging') return ['product worn on body', 'product held in hand', 'product placed flat', 'missing suspension point']
  if (interaction.mode === 'attached') return ['product held in hand', 'floating product', 'missing attachment point']
  if (interaction.mode === 'none') return ['added hands', 'added body contact', 'added mounting fixture']
  return []
}
