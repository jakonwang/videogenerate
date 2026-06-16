import type { CloneBlueprint, CloneProductMode, CloneProductType, CloneQualityMode, ReferenceLock, ShotSpec } from './types'

function cleanText(value: unknown, fallback: string) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text || fallback
}

function containsCjk(value: string) {
  return /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(value)
}

export function keepEnglishLikeText(value: unknown, fallback = '') {
  const text = String(value ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u3000-\u303f\uff00-\uffef]/g, ' ')
    .replace(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || fallback
}

function extractEnglishSegments(value: unknown) {
  const normalized = keepEnglishLikeText(value)
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => /[a-z]{3,}/i.test(item))
}

function normalizePromptLine(value: unknown) {
  return String(value ?? '')
    .replace(/\r/g, '\n')
    .split('\n')
    .flatMap((item) => extractEnglishSegments(item))
    .filter(Boolean)
}

function shouldDropPromptLine(line: string) {
  const lowered = line.toLowerCase()
  return (
    lowered === '[lighting]' ||
    lowered === '[lighting].' ||
    lowered === 'lighting' ||
    lowered === 'lighting.' ||
    lowered === 'lighting:' ||
    lowered === 'lighting:.' ||
    lowered.startsWith('script confidence:') ||
    lowered.startsWith('analysis notes:') ||
    lowered.startsWith('script negative:') ||
    lowered.startsWith('reference lock mode:') ||
    lowered.startsWith('must preserve:') ||
    lowered.includes('script analysis failed') ||
    lowered.includes('aggregate chat model not enabled') ||
    lowered.includes('model not register:') ||
    lowered.includes('traceid:') ||
    lowered.includes('http 400:') ||
    lowered.includes('http 500:') ||
    lowered.includes('error invoking remote method') ||
    lowered.includes('fetch failed')
  )
}

function stripBrokenTail(line: string) {
  return line
    .replace(/^remium\b/i, 'Premium')
    .replace(/slow push-i$/i, 'slow push-in')
    .replace(/\bzoom_in\s+\d+\s*\./gi, 'zoom_in.')
    .replace(/\b(reference video|action|scene|lighting|camera|style|quality)\s+\d+\b/gi, '$1')
    .replace(/\b(static|closeup|close-up|no redesign|high fidelity|stable)\s+\d+\b/gi, '$1')
    .replace(/\s+\d+\s*$/g, '')
    .replace(/\.\./g, '.')
    .replace(/\btraceid\s*:\s*\S+/gi, '')
    .replace(/\bhttp\s*(400|401|403|404|429|500|502|503)\s*:\s*.*$/gi, '')
    .replace(/[;,:-]?\s*(script confidence|analysis notes|script negative|reference lock mode)\s*:?.*$/i, '')
    .trim()
}

function stripPromptTimelineArtifacts(line: string) {
  return line
    .replace(/\b\d+(?:\.\d+)?\s*s\s*-\s*\d+(?:\.\d+)?\s*s\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:seconds?|secs?)\s*-\s*\d+(?:\.\d+)?\s*(?:seconds?|secs?)\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*s\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:seconds?|secs?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupePromptLines(lines: string[]) {
  const kept: string[] = []
  const seen = new Set<string>()
  for (const raw of lines) {
    const line = stripBrokenTail(raw)
    if (!line || shouldDropPromptLine(line)) continue
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(line)
  }
  return kept
}

function sentenceCase(value: string) {
  const text = value.trim()
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function pickPromptLinesByKeywords(value: unknown, keywords: string[]) {
  const lines = dedupePromptLines(normalizePromptLine(value))
  return lines.filter((line) => {
    const lowered = line.toLowerCase()
    return keywords.some((keyword) => lowered.includes(keyword))
  })
}

function normalizeLightingHint(line: string) {
  const normalized = sentenceCase(
    line
      .replace(/^\[lighting\]\.?\s*/i, '')
      .replace(/^lighting\s*:?\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  if (!normalized) return ''
  const lowered = normalized.toLowerCase()
  if (lowered === 'flat diffuse lighting.' || lowered === 'flat diffuse lighting') return ''
  return normalized.endsWith('.') ? normalized : `${normalized}.`
}

function normalizeCameraHint(line: string) {
  const normalized = sentenceCase(
    stripPromptTimelineArtifacts(line)
      .replace(/^\[camera\]\.?\s*/i, '')
      .replace(/^camera\s*:?\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  if (!normalized) return ''
  const lowered = normalized.toLowerCase()
  if (lowered === 'static camera.' || lowered === 'static camera') return ''
  return normalized.endsWith('.') ? normalized : `${normalized}.`
}

function inferCameraFramingFromScript(input: {
  scriptText?: unknown
  cameraDescription?: unknown
  framing?: unknown
  shotType?: unknown
}) {
  const candidates = [
    keepEnglishLikeText(input.scriptText || '', '').trim(),
    keepEnglishLikeText(input.cameraDescription || '', '').trim(),
    keepEnglishLikeText(input.framing || '', '').trim(),
    keepEnglishLikeText(input.shotType || '', '').trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (!candidates) return ''
  if (candidates.includes('extreme close-up') || candidates.includes('extreme closeup') || candidates.includes('extreme_closeup')) {
    return 'Extreme close-up.'
  }
  if (candidates.includes('close-up') || candidates.includes('closeup') || candidates.includes('detail shot')) {
    return 'Close-up.'
  }
  if (candidates.includes('medium shot') || candidates.includes('mid shot') || candidates.includes('waist shot')) {
    return 'Medium shot.'
  }
  if (candidates.includes('wide shot') || candidates.includes('full shot')) {
    return 'Wide shot.'
  }
  if (candidates.includes('overhead') || candidates.includes('top-down') || candidates.includes('top down')) {
    return 'Overhead shot.'
  }
  return ''
}

function extractCameraMovementOnlySentenceList(input: {
  scriptText?: unknown
  cameraDescription?: unknown
  motion?: unknown
}) {
  const corpus = [input.scriptText, input.cameraDescription]
    .map((item) => stripSpeechCueText(item || ''))
    .map((item) => keepEnglishLikeText(item || '', '').trim())
    .filter(Boolean)
    .join('\n')

  const normalized = corpus
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => stripPromptTimelineArtifacts(line).trim())
    .map((line) => line.replace(/^\[camera\]\.?\s*/i, '').trim())
    .map((line) => line.replace(/^\d+(?:\.\d+)?s\s*-\s*\d+(?:\.\d+)?s\s*/i, '').trim())
    .map((line) =>
      line
        .replace(/^(?:extreme\s+close-?up|close-?up|medium|wide|overhead)\s+shot\.?\s*/i, '')
        .replace(/^(?:extreme\s+close-?up|close-?up|medium|wide|overhead)\.?\s*/i, '')
        .trim(),
    )
    .map((line) => sentenceCase(line))
    .filter(Boolean)

  const movementOnly = normalized.filter((line) =>
    /\b(camera|pan|tilt|zoom|push|pull|track|dolly|slide|glide|move|moving|movement|static|steady|handheld)\b/i.test(line),
  )

  if (movementOnly.length) {
    return Array.from(new Set(movementOnly.map((line) => (line.endsWith('.') ? line : `${line}.`))))
  }

  const fallback = keepEnglishLikeText(input.motion || '', '').trim()
  return fallback ? [sentenceCase(fallback.endsWith('.') ? fallback : `${fallback}.`)] : []
}

function composePromptParagraphs(sections: Array<string | null | undefined>, maxChars = 1800) {
  const parts = sections
    .map((item) => sanitizeGeneratedVideoPrompt(item || '', 600))
    .map((item) => item.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((item) => sentenceCase(item.endsWith('.') ? item : `${item}.`))
  const compact = Array.from(new Set(parts)).join('\n\n')
  return sanitizeGeneratedVideoPrompt(compact, maxChars)
}

const PHYSICAL_LIGHTING_LOCK_VIDEO_TEMPLATE = `Main Instruction: A natural, crisp, high-definition (HD) 60fps video with a handheld smartphone shooting look, customized for a realistic social media product review. The overall dynamic movement must be extremely subtle, organic, and everyday lifestyle-oriented. Absolutely PROHIBIT cinematic studio setups, heavy commercial color grading, and robotic PPT-style panning/zooming.

1. THE COMPOSITION CORE (Ref. Base Image):
- Timeline Initiation: Seamlessly initiate the video timeline directly from the provided base image.
- NO INFERENCE RULE: Do not infer, reconstruct, redesign, or generate unseen parts of the {{productName}}.
- STRUCTURE LOCK: Preserve the exact visible structure, silhouette, proportions, connection points, and orientation from the reference image.

2. REALISTIC LIFESTYLE LIGHT:
- Ambient Light Shift: Keep natural, soft everyday ambient light matching the lifestyle environment in the background.
- Shadow Response: Keep realistic micro-shadows consistent with the scene and product placement.

3. HANDHELD CAMERA MECHANICS:
- Micro-Handheld Shake: Implement {{cameraMovement}} with highly controlled subtle handheld movement to simulate natural smartphone filming in real life.
- Spatial Parallax: Keep a subtle spatial parallax effect so the {{productName}} remains grounded in a believable 3D scene.

4. BIOMETRIC INTERACTION & ABSOLUTE ANONYMITY:
- Micro-Action: {{specificMicroAction}}
- Absolute Anonymity: The camera angle remains tightly cropped on the {{targetBodyPart}}, keeping the model's eyes, nose, and lips completely out of the frame or naturally turned away to maintain absolute privacy and anonymity.
- Silent Performance Lock: The model must remain completely silent. No talking, no speaking voice, no lip-sync, no mouth performance, no vocalization, no open-mouth speaking expression, no speech-like lip shapes, and no presenter-style delivery. Keep lips closed or only minimally relaxed at all times. Every visible frame must read as fully silent, never mid-speech, never about to speak, and never finishing a spoken line.

Visual Aesthetic: Casual everyday smartphone video, natural organic color tones, realistic skin textures, soft focused background, authentic lifestyle product showcase. No AI synthetic glossiness, no commercial render look. Single panel only.`

type PhysicalLightingLockVideoSlotCategory = 'handheld_interaction' | 'wearable_jewelry' | 'worn_accessory'

function normalizeTemplateText(value: unknown, fallback = '') {
  return sanitizeGeneratedVideoPrompt(keepEnglishLikeText(value, fallback), 220).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim() || fallback
}

function inferPhysicalLightingLockVideoCategory(input: {
  productType?: unknown
  scriptText?: unknown
  generationPrompt?: unknown
  visualDescription?: unknown
  actionDescription?: unknown
  cameraDescription?: unknown
  productFocus?: unknown
  materialNeed?: unknown
  productIdentityText?: unknown
}) {
  const explicitType = String(input.productType || '').trim().toLowerCase()
  if (explicitType === 'earrings') return 'wearable_jewelry' as const
  if (explicitType === 'phone_case') return 'handheld_interaction' as const
  if (explicitType === 'clothes') return 'worn_accessory' as const
  if (explicitType === 'toy') return 'handheld_interaction' as const

  const corpus = [
    input.scriptText,
    input.generationPrompt,
    input.visualDescription,
    input.actionDescription,
    input.cameraDescription,
    input.productFocus,
    input.materialNeed,
    input.productIdentityText,
  ]
    .map((item) => keepEnglishLikeText(item, '').toLowerCase())
    .join(' ')

  if (/(earring|necklace|pendant|headpiece|headwear|headband|jewelry|jewellery)/i.test(corpus)) return 'wearable_jewelry'
  if (/(ring|bracelet|watch|cufflink|wrist|finger)/i.test(corpus)) return 'worn_accessory'
  if (/(keychain|key chain|plush toy|toy|serum|bottle|3c|device|electronics|phone case|phonecase|beauty|cosmetic)/i.test(corpus)) {
    return 'handheld_interaction'
  }
  return 'handheld_interaction'
}

function inferPhysicalLightingLockBodyPart(input: { productType?: unknown; productText: string }) {
  const explicitType = String(input.productType || '').trim().toLowerCase()
  const corpus = `${explicitType} ${input.productText}`.toLowerCase()
  if (explicitType === 'earrings') return 'Ear lobe'
  if (explicitType === 'phone_case') return 'Hands and Fingers'
  if (explicitType === 'toy') return 'Hands and Fingers'
  if (explicitType === 'clothes') return 'Wrist and Fingers'
  if (/(necklace|pendant|choker)/i.test(corpus)) return 'Collarbone and Neck'
  if (/(earring|headpiece|headwear|hair clip|hairclip|barrette)/i.test(corpus)) return 'Ear lobe and Neck area'
  if (/(ring|bracelet|watch|cufflink|wrist|finger)/i.test(corpus)) return 'Wrist and Fingers'
  return 'Hands and Fingers'
}

function inferPhysicalLightingLockProductName(input: {
  category: PhysicalLightingLockVideoSlotCategory
  productType?: unknown
  productText: string
}) {
  const explicitType = String(input.productType || '').trim().toLowerCase()
  const corpus = `${explicitType} ${input.productText}`.toLowerCase()
  if (input.category === 'wearable_jewelry') {
    if (explicitType === 'earrings') return 'Earring'
    if (/(necklace|pendant|choker)/i.test(corpus)) return 'Necklace'
    if (/(earring|stud|hoop|drop earring|dangle)/i.test(corpus)) return 'Earring'
    return 'Jewelry Piece'
  }
  if (input.category === 'worn_accessory') {
    if (/\bring\b/i.test(corpus)) return 'Ring'
    if (/(bracelet|bangle)/i.test(corpus)) return 'Bracelet'
    if (/\bwatch\b/i.test(corpus)) return 'Watch'
    return 'Accessory'
  }
  if (/(plush toy|toy)/i.test(corpus)) return 'Plush Toy'
  if (/(serum|essence|lotion|perfume|foundation|lip gloss|liquid|glass bottle|glass container|bottle|cosmetic|skincare)/i.test(corpus)) {
    return 'Serum Bottle'
  }
  return 'Product'
}

function inferPhysicalLightingLockCameraMovement(input: {
  category: PhysicalLightingLockVideoSlotCategory
  scriptText?: unknown
  cameraDescription?: unknown
  generationPrompt?: unknown
}) {
  const corpus = [input.scriptText, input.cameraDescription, input.generationPrompt]
    .map((item) => normalizeTemplateText(item, '').toLowerCase())
    .join(' ')
  if (input.category === 'wearable_jewelry') return 'Subtle handheld close-up on the ear area'
  if (input.category === 'worn_accessory') return 'Subtle handheld sliding tilt across the fingers'
  if (input.category === 'handheld_interaction') return 'Micro-handheld camera movement focusing on the hands'
  if (/(ear|earring|earlobe|necklace|jewelry|jewellery)/i.test(corpus)) return 'Subtle handheld close-up on the ear area'
  if (/(wrist|fingers|ring|bracelet|watch|sliding tilt|sliding pan|across)/i.test(corpus)) return 'Subtle handheld sliding tilt across the fingers'
  return 'Micro-handheld camera movement focusing on the hands'
}

function inferPhysicalLightingLockSpecificMicroAction(input: {
  category: PhysicalLightingLockVideoSlotCategory
  productType?: unknown
  scriptText?: unknown
  actionDescription?: unknown
  visualDescription?: unknown
  productText: string
}) {
  const corpus = [input.scriptText, input.actionDescription, input.visualDescription, input.productText]
    .map((item) => normalizeTemplateText(item, '').toLowerCase())
    .join(' ')
  if (input.category === 'wearable_jewelry') {
    return 'The earring sways naturally under gravity with minimal realistic movement.'
  }
  if (input.category === 'worn_accessory') {
    return 'The accessory moves minimally and naturally with realistic micro-shadows.'
  }
  return 'The product moves minimally and naturally with realistic micro-shadows.'
}

export const VIDEO_PROMPT_TEMPLATE = `
[TYPE]
Realistic ecommerce video

[ABSOLUTE RULES]
{{absoluteRules}}

[ROLE MAP]
{{roleMap}}

[SHOT CONTROL]
{{shotControl}}

[FACE CONTROL]
{{faceControl}}

[ENVIRONMENT CONTROL]
{{environmentControl}}

[LIGHTING CONTROL]
{{lightingControl}}

[RESTRICTIONS]
{{restrictions}}

[OUTPUT]
{{output}}
`.trim()

export function fillVideoPromptTemplate(template: string, variables: Record<string, string>) {
  return Object.entries(variables).reduce((text, [key, value]) => {
    return text.replace(new RegExp(`{{${key}}}`, 'g'), String(value || '').trim())
  }, template)
}

function buildAccessorLockedText(input: { productType: string; base: string; earrings: string }) {
  const normalized = String(input.productType || '').trim().toLowerCase()
  return /earrings?/.test(normalized) ? input.earrings : input.base
}

export function sanitizeGeneratedVideoPrompt(value: unknown, maxChars = 1800) {
  const lines = dedupePromptLines(normalizePromptLine(value))
    .map((line) => stripPromptTimelineArtifacts(line))
    .filter(Boolean)
    .filter((line) => !containsCjk(line))
    .filter((line) => /[a-z]{3,}/i.test(line))
  const compact = lines.join('\n')
  if (compact.length <= maxChars) return compact
  const shortened: string[] = []
  let total = 0
  for (const line of lines) {
    if (total + line.length + 1 > maxChars) break
    shortened.push(line)
    total += line.length + 1
  }
  return shortened.join('\n')
}

export function sanitizeNegativePrompt(value: unknown, maxChars = 400) {
  const items = keepEnglishLikeText(value)
    .split(/[,\n]/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const deduped = Array.from(new Set(items.map((item) => item.toLowerCase()))).map((key) =>
    items.find((item) => item.toLowerCase() === key) || key,
  )
  const kept: string[] = []
  let total = 0
  for (const item of deduped) {
    const nextLength = total + item.length + (kept.length ? 2 : 0)
    if (nextLength > maxChars) break
    kept.push(item)
    total = nextLength
  }
  return kept.join(', ')
}

export function buildNoSpeakingInstruction() {
  return 'Silent visual performance only: no vocal performance, no conversation scene, no singing scene, no host-style delivery pose, no exaggerated mouth movement, no open-mouth speaking expression, no speech-like lip shapes, and keep lips closed or only minimally relaxed with a calm visually neutral facial expression. Every frame must read as silent, never mid-speech, never about to speak, and never finishing a spoken line.'
}

export function buildViralRhythmShotGuidance(shot: Pick<
  ShotSpec,
  | 'scriptRole'
  | 'scriptText'
  | 'generationPrompt'
  | 'visualDescription'
  | 'actionDescription'
  | 'cameraDescription'
  | 'productFocus'
  | 'motion'
  | 'framing'
  | 'shotType'
>) {
  const role = String(shot.scriptRole || '').trim().toLowerCase()
  const visualDescription = keepEnglishLikeText(shot.visualDescription || '', '').toLowerCase()
  const actionDescription = keepEnglishLikeText(shot.actionDescription || '', '').toLowerCase()
  const generationPrompt = keepEnglishLikeText(shot.generationPrompt || '', '').toLowerCase()
  const motion = keepEnglishLikeText(shot.motion || '', '').toLowerCase()
  const framing = keepEnglishLikeText(shot.framing || '', '').toLowerCase()
  const semanticText = `${visualDescription} ${actionDescription} ${generationPrompt}`
  const closeupLike = /\bclose\b|\bcloseup\b|\bclose-up\b|\bmacro\b|\bdetail\b/.test(`${visualDescription} ${generationPrompt} ${framing}`)
  const hasExplicitMissingPayoffSignal = /\bwithout\s+(?:explicit\s+)?result\b|\bno\s+(?:clear\s+)?result\b|\bbefore\s+the\s+product\s+moment\b|\bbefore\s+anything\s+specific\s+happens\b|\bdelayed\s+reveal\b|\bsetup\s+before\s+payoff\b|\bsoft\s+setup\b|\bambient\s+opener\b/.test(
    semanticText,
  )
  const resultLike = !hasExplicitMissingPayoffSignal && /\bresult\b|\bproof\b|\breveal\b|\bshow\b|\bvisible\b|\bclear\b|\bconfirm\b/.test(
    semanticText,
  )
  const repeatedStaticLike = (motion === 'static' || motion === '') && !/\bpan\b|\btilt\b|\bpush\b|\bpull\b|\bslide\b|\bglide\b/.test(
    `${actionDescription} ${generationPrompt}`,
  )
  const lines: string[] = []

  if (role === 'hook') {
    lines.push('Hook Rhythm: The first beat must communicate product value immediately, not after a soft setup.')
    if (!closeupLike) {
      lines.push('Hook Framing: Tighten the composition so the payoff reads instantly on a vertical short-video screen.')
    }
    if (!resultLike) {
      lines.push('Hook Payoff Clarity: Make the visible result or hero product confirmation unmistakable inside this shot.')
    }
  }

  if (role === 'solution' || role === 'show' || role === 'detail' || role === 'proof') {
    lines.push('Middle Rhythm: Keep the shot commercially readable and moving forward. Avoid flat filler energy.')
    if (repeatedStaticLike) {
      lines.push('Momentum Lift: Add one realistic emphasis shift in motion, framing, or reveal timing so the middle section does not feel dead.')
      lines.push('Variation Break: Do not repeat the same static close-up coverage. Introduce a clear angle, framing, hand-demo, or motion change that earns the next beat.')
    }
    if (closeupLike) {
      lines.push('Body Progression: If this is a close-up proof or detail shot, make sure the next visual idea can escalate into a wider use case, hand interaction, or cleaner product-context reveal.')
    }
  }

  if (role === 'proof') {
    lines.push('Proof Rhythm: This shot must feel like visible confirmation, not generic coverage.')
    lines.push('Proof-to-Action Bridge: Let the proof already lean toward purchase intent and closing momentum.')
  }

  if (role === 'cta' || role === 'offer') {
    lines.push('Closing Rhythm: End on a decisive action frame with direct decision pressure, not a soft fade-out feeling.')
    lines.push('CTA Pressure: Make urgency, action, or buy-now intent visually clear without becoming spammy.')
  }

  return lines.join(' ')
}

function stripSpeechCueText(value: unknown) {
  const text = keepEnglishLikeText(value, '').trim()
  if (!text) return ''
  return text
    .replace(/\b(talk|talks|talked|talking|speak|speaks|speaking|say|says|saying|voice|voiceover|narrate|narrates|narrating|narration|dialog|dialogue|monolog|monologue|converse|conversation|host|hosts|hosting|present|presents|presenter|presenting|explain|explains|explainer|explaining|introduce|introduces|introducing|lip-?sync|lip-?syncing|speaker)\b/gi, ' ')
    .replace(/\b(open mouth|mouth open|speaking to camera|talking to camera|speaks to camera|says to camera)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildReferenceImageLockText() {
  return [
    'REFERENCE IMAGE LOCK (CRITICAL):',
    'The provided product reference image is the ONLY valid source for product identity.',
    'The product MUST be directly reused or strictly derived from this reference image.',
    'Do NOT recreate, approximate, reinterpret, or infer a similar product from text.',
    'If the exact product cannot be preserved, generation MUST fail instead of replacing it with a lookalike.',
  ].join(' ')
}

export function buildFrameContinuityLockText(input: { isEnd: boolean; shotIndex: number }) {
  if (!input.isEnd) {
    return [
      'FRAME CONTINUITY LOCK:',
      `Shot ${input.shotIndex + 1} start frame establishes the locked base frame for this shot.`,
      'Keep the same product instance, same model instance, and same scene setup as the continuation source for the ending frame.',
      'Do not introduce a reset composition, regenerated scene, or substituted product.',
    ].join(' ')
  }
  return [
    'FRAME CONTINUITY LOCK:',
    'The ending keyframe MUST be a direct continuation of the provided starting frame.',
    'Maintain the same product instance, same model instance, and same scene setup.',
    'Only allow minimal natural motion and slight camera shift.',
    'Do NOT reset composition or regenerate the scene.',
  ].join(' ')
}

export function buildHumanPriorityRuleText() {
  return [
    'HUMAN PRIORITY RULE:',
    'The human MUST adapt to the product.',
    'Do NOT modify, resize, reshape, bend, simplify, or restyle the product to fit the human body.',
    'If any conflict occurs, adjust human pose, hand placement, ear position, neck angle, or body framing, not the product.',
  ].join(' ')
}

export function buildNoSubstituteRuleText() {
  return [
    'NO SUBSTITUTE RULE:',
    'If exact consistency cannot be maintained, DO NOT generate a similar, alternative, generic, or lookalike product.',
    'Never replace the locked product with a substitute.',
    'Discard the generation instead of correcting it.',
  ].join(' ')
}

export function buildFailInsteadRuleText() {
  return 'If any forbidden condition is triggered, discard the generation instead of correcting it.'
}

export function buildJewelryLightEffectBanText(productType?: string) {
  const normalizedType = String(productType || '').trim().toLowerCase()
  if (!/earrings?|ear jewelry|jewelry|jewellery|diamond|zircon|crystal|gem|gemstone|silver|gold|ring|necklace|bracelet/.test(normalizedType)) {
    return ''
  }
  return [
    'ABSOLUTE JEWELRY LIGHT EFFECT BAN:',
    'Jewelry must never become a light source.',
    'Keep stones and metal passive, dim, non-emissive, and physically dull when needed.',
    'No sparkle, no star glint, no lens flare, no bloom, no glowing white core, no flash hotspot, no detached bright spot, and no self-luminous shine.',
    'No point-like sparkle, white-hot pixel cluster, rainbow flare, radial rays, magical shine, or luxury-ad jewelry effect.',
    'If any highlight starts to look flashy, glowing, explosive, premium-VFX, or brighter than realistic skin specular, suppress it immediately.',
    'Only allow weak, flat, surface-attached reflections. Prefer slightly darker, quieter metal and stone response over any dramatic shine.',
    'If the jewelry appears self-luminous in any frame, treat that result as invalid and discard it.',
  ].join(' ')
}

export function buildAntiGlowLightingEnvironmentText(productType?: string) {
  const normalizedType = String(productType || '').trim().toLowerCase()
  if (!/earrings?|ear jewelry|jewelry|jewellery|diamond|zircon|crystal|gem|gemstone|silver|gold|ring|necklace|bracelet/.test(normalizedType)) {
    return ''
  }
  return [
    'ANTI-GLOW LIGHTING ENVIRONMENT:',
    'Use soft diffused lighting, matte lighting, studio flat lighting, low contrast lighting, and overcast lighting behavior.',
    'Use diffuse soft source only, with flat studio diffusion and low contrast exposure.',
    'No specular highlights, no hard key light, no point light reflections, and no glossy jewelry rendering.',
    'Treat metal and stones as optically quiet materials with dimmer, flatter, non-emissive material response.',
    'Remove specular edge pops and bright jewelry hotspots.',
    'Prefer flat studio diffusion or overcast softness over realistic shiny reflections.',
    'If reference lighting creates jewelry sparkle, override it with flatter, softer, dimmer lighting immediately.',
    'Lighting control overrides reference lighting when anti-glow conflicts occur.',
  ].join(' ')
}

function inferJewelryLikePromptContext(input: {
  productType?: string
  generationPrompt?: string
  visualDescription?: string
  productIdentityText?: string
  materialNeed?: string
}) {
  const haystack = [
    input.productType,
    input.generationPrompt,
    input.visualDescription,
    input.productIdentityText,
    input.materialNeed,
  ]
    .map((item) => keepEnglishLikeText(item, ''))
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
  return /earrings?|ear jewelry|jewelry|jewellery|diamond|zircon|crystal|gem|gemstone|silver|gold|ring|necklace|bracelet|stud|hoop|drop earring|dangle earring/.test(
    haystack,
  )
}

export function buildShotAntiGlowPromptBlock(input: {
  productType?: string
  generationPrompt?: string
  visualDescription?: string
  productIdentityText?: string
  materialNeed?: string
}) {
  const inferredType = inferJewelryLikePromptContext(input) ? 'jewelry' : String(input.productType || '').trim()
  return sanitizeGeneratedVideoPrompt(buildJewelryLightEffectBanText(inferredType), 520)
}

export function buildSpatialAnchorLockText(productType: string) {
  const base = [
    'SPATIAL ANCHOR LOCK:',
    'Maintain the same attachment point, same relative placement, same orientation, and same distance to the body support region as the locked reference state.',
    'Do NOT reposition, rotate, detach, reattach, or structurally shift the product for styling convenience.',
    'Camera may move, but product placement MUST remain physically consistent.',
  ].join(' ')
  const earrings = `${base} For earrings, keep the same ear side, same piercing point, same hanging direction, and same distance from the ear.`
  return buildAccessorLockedText({ productType, base, earrings })
}

export function buildPhysicsConsistencyText(productType: string) {
  const base = [
    'PHYSICS CONSISTENCY:',
    'The product must obey believable real-world support and gravity.',
    'Allow only minimal natural swing or settle motion when motion is required.',
    'No floating, no rigid sculpture pose, no impossible balance, and no unnatural angles.',
  ].join(' ')
  const earrings = `${base} Earrings must hang downward naturally due to gravity and may only show minimal realistic swing.`
  return buildAccessorLockedText({ productType, base, earrings })
}

export function buildCompositionLockText(productType: string) {
  const base = [
    'COMPOSITION LOCK:',
    'Maintain the same framing intent, same crop ratio, same subject scale, and same focal composition as the locked reference shot.',
    'Do NOT zoom drastically, reframe aggressively, reset composition, or rebuild the scene from a new layout.',
  ].join(' ')
  const earrings = `${base} For earrings, preserve the same close-up relationship between ear, neck, and product display area.`
  return buildAccessorLockedText({ productType, base, earrings })
}

export function buildCameraMotionLockText(input: { motion?: string; framing?: string; productType?: string }) {
  const motion = String(input.motion || '').trim().toLowerCase()
  const productType = String(input.productType || '').trim().toLowerCase()
  if (motion === 'zoom_in') {
    const startState = 'initial close-up frame'
    const endState = 'slightly tighter close-up within the same framing family'
    return [
      'CAMERA MOTION LOCK:',
      'The zoom in must be a VERY SLOW, SMOOTH, CONTINUOUS camera movement from the initial close-up frame.',
      `Start state: ${startState}.`,
      `End state: ${endState}.`,
      'The motion must feel like a single uninterrupted gentle push-in with stable camera speed.',
      'Do NOT accelerate suddenly, snap forward, cut to a new shot, regenerate a new framing, change subject scale abruptly, or reset composition.',
    ].join(' ')
  }
  if (motion === 'zoom_out') {
    const isEarring = /earrings?/.test(productType)
    const startState = isEarring ? 'extreme close-up of earring and ear' : 'tight close-up of the product anchor area'
    const endState = isEarring
      ? 'slightly wider close-up including ear and partial neck'
      : 'slightly wider close-up of the same subject area'
    return [
      'CAMERA MOTION LOCK:',
      'The zoom out must be a VERY SLOW, SMOOTH, CONTINUOUS camera movement from the initial close-up frame.',
      `Start state: ${startState}.`,
      `End state: ${endState}.`,
      'The motion must feel like a single uninterrupted gentle camera pull-back with stable camera speed.',
      'DO NOT accelerate suddenly, rush the pull-back, cut to a new shot, regenerate a new framing, change subject scale abruptly, or reset composition.',
    ].join(' ')
  }
  return [
    'CAMERA MOTION LOCK:',
    'Keep camera motion smooth and continuous within the same shot.',
    'Do NOT accelerate suddenly, cut to a new shot, regenerate a new framing, or reset composition.',
  ].join(' ')
}

export function buildScaleConsistencyLockText(productType: string, motion?: string) {
  const normalizedType = String(productType || '').trim().toLowerCase()
  const normalizedMotion = String(motion || '').trim().toLowerCase()
  const base = [
    'SCALE CONSISTENCY LOCK:',
    normalizedMotion === 'zoom_out'
      ? 'The product must maintain the same real-world scale relative to the body anchor during zoom out.'
      : 'The product must maintain the same real-world scale relative to the body anchor.',
    'Do NOT enlarge, shrink, or rescale the product.',
    normalizedMotion === 'zoom_out' ? 'Only camera distance changes, not the object size.' : 'Camera changes must not alter object scale.',
  ].join(' ')
  const earrings = `${base} For earrings, keep the same real-world scale relative to the earlobe, piercing point, and visible ear contour.`
  return buildAccessorLockedText({ productType: normalizedType, base, earrings })
}

export function buildMotionLimitText(productType: string, motion?: string) {
  const normalizedType = String(productType || '').trim().toLowerCase()
  if (!/earrings?/.test(normalizedType)) return ''
  const normalizedMotion = String(motion || '').trim().toLowerCase()
  return [
    'MOTION LIMIT:',
    normalizedMotion === 'zoom_out'
      ? 'The earring may have extremely subtle micro-movements caused by breathing during the continuous pull-back.'
      : 'The earring may have extremely subtle micro-movements caused by breathing.',
    'Amplitude must be minimal and physically plausible.',
    'No noticeable swinging, no exaggerated motion, no sudden motion burst.',
  ].join(' ')
}

export function buildSilentCommercialGlobalRule() {
  return '[Global Rule: Silent visual commercial. No vocal-performance scene, no presenter-to-camera delivery, no host-style selling posture, and no talking-head composition. Keep product-led framing. For earrings or worn accessories, the ear area and part of the face/jawline may be visible but the face must not dominate.]'
}

export function prependSilentCommercialGlobalRule(parts: Array<string | null | undefined>, maxChars = 1800) {
  return sanitizeGeneratedVideoPrompt([buildSilentCommercialGlobalRule(), ...parts.filter(Boolean)].join('\n\n'), maxChars)
}

function movementLabel(shot: ShotSpec) {
  const motion = String(shot.cameraMovement || shot.motion || shot.prompt?.cameraMotion || 'static')
  const map: Record<string, string> = {
    static: 'mostly static handheld shot with tiny natural micro movement',
    zoom_in: 'very slow smooth push-in following the same reference movement path',
    zoom_out: 'very slow smooth pull-back following the same reference movement path',
    pan_left: 'small smooth handheld pan left matching the reference direction',
    pan_right: 'small smooth handheld pan right matching the reference direction',
    shake: 'controlled handheld movement matching the reference energy',
    fast_cut: 'brief practical reveal motion matching the reference cut rhythm',
  }
  return map[motion] || motion
}

export function buildReferenceLock(shot: ShotSpec, sceneFallback?: string): ReferenceLock {
  const role = String(shot.role || shot.shotRole || shot.purpose || 'detail')
  const shotType = String(shot.shotType || shot.cloneClass || 'real_product')
  const visual = keepEnglishLikeText(
    shot.visualPrompt || shot.visual || shot.promptHint || shot.prompt?.positive,
    'short social-commerce product demonstration',
  )
  const isModel = role === 'model_scene' || shotType === 'model_demo'
  const isCloseup = role === 'product_closeup' || shot.framing === 'extreme_closeup' || shotType === 'closeup'
  const sceneEnvironment = cleanText(
    keepEnglishLikeText(shot.referenceLock?.sceneEnvironment),
    isModel
      ? sceneFallback || 'same lifestyle background category as the reference shot'
      : isCloseup
        ? 'same close product-demo background category as the reference shot'
        : sceneFallback || 'same social-commerce scene category as the reference shot',
  )
  const subjectPose = cleanText(
    keepEnglishLikeText(shot.referenceLock?.subjectPose),
    isModel
      ? 'keep the same body angle, face direction, hand position and distance from camera as the reference shot'
      : isCloseup
        ? 'keep the same hand and product position and product-to-camera distance as the reference shot'
        : 'keep the same subject placement and product handling posture as the reference shot',
  )
  const productAction = cleanText(
    keepEnglishLikeText(shot.referenceLock?.productAction),
    keepEnglishLikeText(shot.action, isModel ? 'demonstrate the product on or near the body in the same way as the reference' : visual),
  )
  const cameraComposition = cleanText(
    keepEnglishLikeText(shot.referenceLock?.cameraComposition),
    `${shot.framing || 'closeup'} framing; preserve product screen position, subject crop, camera distance and product size ratio from the reference shot`,
  )
  const motionPath = cleanText(keepEnglishLikeText(shot.referenceLock?.motionPath), movementLabel(shot))
  const mustPreserve = [
    ...(shot.referenceLock?.mustPreserve ?? []),
    `background category and atmosphere: ${sceneEnvironment}`,
    `subject pose and hand placement: ${subjectPose}`,
    `product demonstration action: ${productAction}`,
    `camera composition: ${cameraComposition}`,
    `motion path and rhythm: ${motionPath}`,
  ]
    .map((x) => keepEnglishLikeText(x))
    .filter(Boolean)
  const mayReplace = [
    ...(shot.referenceLock?.mayReplace ?? []),
    'replace the original person with the selected new model identity',
    'change gender, age, skin tone, hair style and outfit only as required by the selected model',
    'replace the original product with the uploaded user product while keeping the same demonstration action',
  ]
    .map((x) => keepEnglishLikeText(x))
    .filter(Boolean)
  const mustAvoid = [
    ...(shot.referenceLock?.mustAvoid ?? []),
    'do not copy the original person face, identity, account, watermark, subtitles, stickers or platform UI',
    'do not invent a different background, new pose, unrelated action, new camera angle or different product-display method',
    'do not turn model demo shots into tabletop product shots, and do not turn product closeups into selfies',
  ]
    .map((x) => keepEnglishLikeText(x))
    .filter(Boolean)
  return {
    sceneEnvironment,
    subjectPose,
    productAction,
    cameraComposition,
    motionPath,
    mustPreserve: Array.from(new Set(mustPreserve)),
    mayReplace: Array.from(new Set(mayReplace)),
    mustAvoid: Array.from(new Set(mustAvoid)),
    strength: 'hard_reference_motion',
  }
}

export function buildReferenceLockText(shot: ShotSpec, sceneFallback?: string) {
  const lock = buildReferenceLock(shot, sceneFallback)
  return composePromptParagraphs(
    [
      `Keep the same background category and atmosphere as the reference shot: ${lock.sceneEnvironment}. Keep the same subject pose and hand placement: ${lock.subjectPose}. Keep the same product action: ${lock.productAction}.`,
      `Preserve the same camera composition and motion path as the reference shot: ${lock.cameraComposition}. ${lock.motionPath}.`,
      `Do NOT replace or regenerate product or model identity. Only adapt camera and motion while preserving the locked demonstration structure. ${lock.mayReplace.join('; ')}.`,
      `Do not drift away from the reference shot. ${lock.mustAvoid.join('; ')}.`,
    ],
    900,
  )
}

export function buildShotScriptConstraintText(shot: ShotSpec) {
  const scriptText = stripSpeechCueText(shot.scriptText) || 'Maintain the original shot selling logic and timing.'
  const narrationText = stripSpeechCueText(shot.narrationText)
  const onScreenText = keepEnglishLikeText(shot.onScreenText, '')
  const visualDescription = keepEnglishLikeText(
    shot.visualDescription,
    keepEnglishLikeText(shot.visualPrompt || shot.visual, 'Real social-commerce product demonstration in a believable environment.'),
  )
  const actionDescription =
    stripSpeechCueText(shot.actionDescription) ||
    keepEnglishLikeText(shot.action || shot.visualPrompt, 'Natural product demonstration with believable hand movement.')
  const cameraDescription = keepEnglishLikeText(
    shot.cameraDescription,
    `${shot.framing || 'closeup'} framing, ${shot.cameraMovement || shot.motion || 'static'} movement`,
  )
  const productFocus = keepEnglishLikeText(shot.productFocus, 'Keep the product clearly visible and commercially relevant.')
  const generationPrompt =
    stripSpeechCueText(shot.generationPrompt) ||
    stripSpeechCueText(shot.aiPrompt || shot.prompt?.positive) ||
    'Follow the original shot motion and selling logic.'
  return composePromptParagraphs(
    [
      buildNoSpeakingInstruction(),
      `Preserve this exact shot logic. ${scriptText}`,
      narrationText ? `The intended selling message for this shot should remain aligned with: ${narrationText}.` : '',
      onScreenText ? `Any implied on-screen message should mean: ${onScreenText}.` : '',
      `Visual direction: ${visualDescription}. Action direction: ${actionDescription}. Camera direction: ${cameraDescription}.`,
      `Keep the product clearly visible and commercially relevant. ${productFocus}.`,
      generationPrompt ? `Core generation guidance: ${generationPrompt.slice(0, 320)}.` : '',
      'The first frame must already match the shot setup, and the final frame must complete the same shot beat without changing scene, product, action type, or person identity.',
    ],
    1000,
  )
}

export function buildProductLockText(
  productType: CloneProductType,
  productRefs: string[],
  productDescription?: string,
) {
  const lines = [
    'Product lock: keep the exact product identity from the uploaded references.',
    'The uploaded product reference images are the single source of truth.',
    'First identify what the uploaded product actually is and preserve that exact category and structure in the final image.',
    'Product fidelity has higher priority than model styling, outfit styling, decorative atmosphere and background beauty.',
    'Do not redesign, stylize, simplify, beautify, or replace the product with a generic equivalent.',
    'Do not generate a similar product. Reproduce the exact same product only.',
    'Do not generate a substitute product or lookalike product.',
    'Discard the generation instead of correcting it if exact consistency fails.',
    'If the reference shot contains another accessory or another worn item, replace that item with the uploaded user product only.',
    'Do not keep the original accessory if it conflicts with the uploaded user product.',
    productDescription ? `Product description: ${keepEnglishLikeText(productDescription)}` : '',
    productRefs.length ? `Reference count: ${productRefs.length}` : '',
  ]
  const specific: Record<CloneProductType, string[]> = {
    earrings: [
      'Identify the product as earrings or ear jewelry first, then place only this exact product on the ear or in the hand display.',
      'Keep earring shape, dangling structure, left-right wearing proportion, connector relation, and component placement unchanged.',
      'Keep the exact hook shape, pendant count, pendant spacing, visible geometry, and thickness proportion.',
      'If the model originally wears different earrings, remove them and replace them with the uploaded earrings only.',
      'Do not add chains, stones, logo, extra charms, or alter the hook and pendant structure.',
      'Preserve structure only. Do not reinterpret jewelry material behavior or add reflective enhancement, sparkle, starburst highlights, fantasy glow, or fake luxury VFX.',
      'Earrings cannot stand upright by themselves like a rigid figurine or tabletop sculpture. Show them only as worn on the ear, held by hand, laid flat, or supported by a physically believable display/contact point.',
    ],
    phone_case: [
      'Identify the product as a phone case first, then ensure the visible case is the uploaded case only.',
      'Keep case pattern, color, camera hole placement, edge shape, and printed graphic unchanged.',
      'If the reference shot contains a different phone accessory, replace only the case layer with the uploaded case.',
      'Do not redesign the print or change the phone model appearance.',
    ],
    clothes: [
      'Identify the product as clothing first, then keep that exact clothing item as the hero product.',
      'Keep clothing silhouette, color, fabric texture, neckline, sleeves, cuffs, and print unchanged.',
      'If the model outfit conflicts with the uploaded clothing product, replace only the relevant clothing piece with the uploaded product.',
      'Do not alter the cut, fit, or fabric category.',
    ],
    toy: [
      'Identify the product as a toy or figurine first, then keep that exact character or object identity.',
      'Keep toy shape, facial details, color blocks, proportions, and material feel unchanged.',
      'Do not turn it into a different character or change the face.',
    ],
    general: [
      'Identify the exact product category from the uploaded references before generating the image.',
      'Keep the main product appearance consistent with the references.',
      'If another object occupies the same display position in the reference shot, replace that object with the uploaded product only.',
    ],
  }
  return sanitizeGeneratedVideoPrompt([...lines, ...specific[productType]].filter(Boolean).join('\n'), 900)
}

export function buildCloneNegativePrompt(productType: CloneProductType, shotType?: string) {
  const shared = [
    'no watermark',
    'no platform UI',
    'no account handle',
    'no random subtitles',
    'no garbled text',
    'no plastic CGI texture',
    'no AI face',
    'no extra fingers',
    'no deformed hands',
    'no duplicate product',
    'no product redesign',
    'no changed product category',
    'no changed product color',
    'no changed product structure',
    'no exaggerated sparkle',
    'no sparkle VFX',
    'no fantasy glow',
    'no bloom effect',
    'no bloom-heavy highlights',
    'no starburst highlights',
    'no magical glitter',
    'no luxury VFX',
    'no glowing product',
    'no dramatic reflective flare',
    'no overexposed highlights',
    'discard the generation instead of correcting it',
  ]
  const productSpecific: Record<CloneProductType, string[]> = {
    earrings: [
      'no wrong earring structure',
      'no extra gemstone',
      'no extra chain',
      'no ear deformation',
      'no exaggerated sparkle effect',
      'no fantasy glow',
      'no standing upright earring',
      'no floating earring',
      'no unsupported rigid earring pose',
    ],
    phone_case: ['no wrong camera hole', 'no changed print', 'no changed frame shape'],
    clothes: ['no changed collar', 'no changed sleeve', 'no changed pattern'],
    toy: ['no changed face', 'no changed proportions', 'no changed color blocks'],
    general: ['no wrong product shape'],
  }
  const shotSpecific =
    shotType === 'screen_recording'
      ? ['no browser window', 'no software overlay']
      : shotType === 'model_demo'
        ? ['no uncanny face', 'no broken anatomy']
        : ['no fake background']
  return [...shared, ...productSpecific[productType], ...shotSpecific].join(', ')
}

export function buildRealismInstruction(shotType: string | undefined, qualityMode: CloneQualityMode) {
  const base =
    shotType === 'model_demo'
      ? 'real TikTok-native smartphone capture, natural skin texture, believable handheld motion'
      : 'real product footage feel, social-commerce native framing, practical handheld micro motion'
  if (qualityMode === 'fast') return `${base}, simple scene, fast practical execution`
  if (qualityMode === 'standard') return `${base}, cleaner composition, stable realism`
  return `${base}, high realism priority, natural lighting, no synthetic gloss`
}

export function buildTextSafetyInstruction() {
  return 'Do not generate watermark, account names, platform UI, logos, subtitles, captions, stickers, or random characters.'
}

export function buildGenerationPromptRestraintText() {
  return sanitizeGeneratedVideoPrompt(
    [
      'Keep the generation prompt realistic and commercially usable.',
      'Product appearance must stay natural, restrained, and physically believable.',
      'Do not overdramatize the product with luxury-ad style exaggeration, fantasy polish, or glamorized rendering.',
      'If the product includes diamond, zircon, crystal, gemstone, glossy metal, mirror, or reflective details, keep highlights subtle and camera-realistic only.',
      'Allow only tiny low-intensity real specular edges that stay inside the material surface. Do not add exaggerated sparkle, over-flashing shine, glow, bloom, starburst highlights, magical glitter, lens flare, radial light rays, glowing white cores, rainbow flares, or visual-effect style product shine.',
      'Do not make the product look self-luminous, overly glossy, overexposed, or artificially premium through effects.',
    ].join('\n'),
    700,
  )
}

export function sanitizeJewelryGenerationPrompt(value: unknown, productType?: string) {
  const text = keepEnglishLikeText(value, '').trim()
  if (!text) return ''
  const normalizedType = String(productType || '').trim().toLowerCase()
  const looksJewelry =
    /earrings?|ear jewelry|jewelry|jewellery|diamond|zircon|crystal|gem|gemstone|silver|gold|ring|necklace|bracelet/.test(
      `${normalizedType} ${text}`.toLowerCase(),
    )
  if (!looksJewelry) return sanitizeGeneratedVideoPrompt(text, 700)
  const replacements: Array<[RegExp, string]> = [
    [/\bvisual impact\b/gi, 'refined product presence'],
    [/\bsparkling stones?\b/gi, 'realistic stone surface detail'],
    [/\bsparkling\b/gi, 'realistic material detail'],
    [/\bhigh-polish\b/gi, 'natural'],
    [/\bglittering\b/gi, 'realistic'],
    [/\bdazzling\b/gi, 'refined'],
    [/\bshimmering\b/gi, 'realistic'],
    [/\bbrilliant shine\b/gi, 'subtle material detail'],
    [/\bintense shine\b/gi, 'subtle material detail'],
  ]
  let next = text
  for (const [pattern, replacement] of replacements) next = next.replace(pattern, replacement)
  next = next
    .replace(/\bhigh-polish silver texture\b/gi, 'natural silver texture')
    .replace(/\bhigh-polish gold texture\b/gi, 'natural gold texture')
    .replace(/\bsparkle(?:\s+effect)?\b/gi, 'realistic material detail')
    .replace(/\s+/g, ' ')
    .trim()
  const restraint = [
    'Keep jewelry highlights tiny, low-intensity, realistic, and restrained.',
    'Jewelry must not become a light source.',
    'No star-shaped flare, no radial light rays, no lens flare, no glowing white core, no rainbow flare, no sparkle points, no bloom-heavy shine, no fantasy glow, and no luxury VFX polish.',
  ].join(' ')
  return sanitizeGeneratedVideoPrompt([next, restraint].filter(Boolean).join('\n'), 700)
}

export function buildVideoAntiSparkleNegativePrompt(base?: unknown, productMode: CloneProductMode = 'STRICT') {
  const hardVfxBan = [
    'no sparkle',
    'no starburst',
    'no lens flare',
    'no radial light rays',
    'no light burst',
    'no glowing white core',
    'no rainbow flare',
    'no bloom blob',
    'no glitter VFX',
    'no magical shine',
    'no flash hotspot',
    'no self-luminous product',
    'no overexposed shine',
    'no flashy visual effects',
    'no strobe-like highlights',
    'no explosive jewelry glint',
    'no glowing gemstone',
    'no bright white hotspot on jewelry',
    'no detached highlight orb',
    'no emissive reflection',
    'no luxury ad shine effect',
  ].join(', ')
  const identityBan =
    productMode === 'STRICT'
      ? 'no duplicate product, no extra product, no redesigned product, no added details, no second person, no mixed model identity, no product-reference person as model'
      : productMode === 'BALANCED'
        ? 'no duplicate product, no redesigned product, no added details, no second person, no mixed model identity'
        : 'no wrong product category, no second person, no severe product distortion'
  return sanitizeNegativePrompt([hardVfxBan, identityBan, String(base || '').trim()].filter(Boolean).join(', '), 520)
}

type ProductModeConfig = {
  useIdentical: boolean
  consistencyWord: 'visually identical' | 'visually consistent'
  allowUnseenParts: boolean | 'partial'
  cameraHardLimit: boolean
  sanitizerLevel: 'high' | 'medium' | 'low'
  styleWordsAllowed: boolean | 'limited'
  motionFallback: 'hard' | 'soft' | 'minimal'
  keepCenteredDominant: boolean
  consistencyPriority: 'highest' | 'balanced' | 'secondary'
  allowPerspectiveVariation: boolean
}

const PRODUCT_MODE_CONFIG: Record<CloneProductMode, ProductModeConfig> = {
  STRICT: {
    useIdentical: true,
    consistencyWord: 'visually identical',
    allowUnseenParts: false,
    cameraHardLimit: true,
    sanitizerLevel: 'high',
    styleWordsAllowed: false,
    motionFallback: 'hard',
    keepCenteredDominant: true,
    consistencyPriority: 'highest',
    allowPerspectiveVariation: false,
  },
  BALANCED: {
    useIdentical: false,
    consistencyWord: 'visually consistent',
    allowUnseenParts: 'partial',
    cameraHardLimit: false,
    sanitizerLevel: 'medium',
    styleWordsAllowed: 'limited',
    motionFallback: 'soft',
    keepCenteredDominant: false,
    consistencyPriority: 'balanced',
    allowPerspectiveVariation: true,
  },
  EXPRESSIVE: {
    useIdentical: false,
    consistencyWord: 'visually consistent',
    allowUnseenParts: true,
    cameraHardLimit: false,
    sanitizerLevel: 'low',
    styleWordsAllowed: true,
    motionFallback: 'minimal',
    keepCenteredDominant: false,
    consistencyPriority: 'secondary',
    allowPerspectiveVariation: true,
  },
}

export function detectProductMode(productType?: string): CloneProductMode {
  const normalized = String(productType || '').trim().toLowerCase()
  if (/earrings?|ring|necklace|bracelet|jewelry|jewellery|fashion_accessory/.test(normalized)) return 'STRICT'
  if (/phone_case|bag|bags|shoes|shoe|general/.test(normalized)) return 'BALANCED'
  if (/clothes|beauty|perfume|fragrance|home|furniture|decor/.test(normalized)) return 'EXPRESSIVE'
  return 'BALANCED'
}

export function getProductModeConfig(mode: CloneProductMode) {
  return PRODUCT_MODE_CONFIG[mode]
}

function normalizeVideoCameraInstruction(value: unknown) {
  const raw = keepEnglishLikeText(value, '').trim()
  const lowered = raw.toLowerCase()
  if (!raw) return 'Subtle camera movement only. Keep the product as the visual anchor.'
  if (lowered.includes('zoom_out') || lowered.includes('zoom out') || lowered.includes('pull-back') || lowered.includes('pull back')) {
    return 'Subtle camera movement only. Keep the product as the visual anchor with gentle perspective change only.'
  }
  if (/(fast_cut|whip|spin|dramatic|aggressive|rapid)/i.test(raw)) {
    return 'Subtle camera movement only. Keep the product as the visual anchor.'
  }
  return sanitizeGeneratedVideoPrompt(`${raw}. Keep the product as the visual anchor. Gentle perspective change only.`, 240)
}

function buildLockedProductSceneText(productType: string) {
  const normalizedType = String(productType || '').trim().toLowerCase()
  if (/earrings?/.test(normalizedType)) return 'Extreme close-up of ear wearing the earring.'
  return 'Keep the product clearly visible in the same locked scene.'
}

function buildLockedProductActionText(productType: string, actionDescription?: unknown) {
  const normalizedType = String(productType || '').trim().toLowerCase()
  if (/earrings?/.test(normalizedType)) {
    const action = keepEnglishLikeText(actionDescription, '').toLowerCase()
    if (/\bfinger|touch|hand\b/.test(action)) return 'Minimal finger interaction below the ear.'
    return 'Very subtle movement only.'
  }
  return keepEnglishLikeText(actionDescription, 'Natural product demonstration with believable movement.')
}

function buildLockedProductFocusText(productType: string, productFocus?: unknown) {
  const normalizedType = String(productType || '').trim().toLowerCase()
  if (/earrings?/.test(normalizedType)) {
    return 'Preserve shape, proportions, and structure. Avoid deformation or redesign.'
  }
  return keepEnglishLikeText(productFocus, 'Keep the product clearly visible and commercially relevant.')
}

function isHighRiskJewelryVideoPrompt(input: {
  productType?: string
  generationPrompt?: string
  visualDescription?: string
  productIdentityText?: string
  materialNeed?: string
}) {
  return inferJewelryLikePromptContext(input)
}

export function buildOptimizedVideoPrompt(input: {
  shot: Pick<
    ShotSpec,
    | 'id'
    | 'index'
    | 'productType'
    | 'scriptText'
    | 'generationPrompt'
    | 'visualDescription'
    | 'actionDescription'
    | 'cameraDescription'
    | 'productFocus'
    | 'materialNeed'
    | 'motion'
    | 'framing'
    | 'shotType'
    | 'compiledPrompt'
  >
  modelIdentityText?: string
  productIdentityText?: string
  productMode?: CloneProductMode
}) {
  return buildVideoExecutionStackPrompt(input)
}

function buildVideoExecutionStackPrompt(input: {
  shot: Pick<
    ShotSpec,
    | 'id'
    | 'index'
    | 'productType'
    | 'scriptText'
    | 'generationPrompt'
    | 'visualDescription'
    | 'actionDescription'
    | 'cameraDescription'
    | 'productFocus'
    | 'materialNeed'
    | 'motion'
    | 'framing'
    | 'shotType'
    | 'compiledPrompt'
  >
  modelIdentityText?: string
  productIdentityText?: string
  productMode?: CloneProductMode
}) {
  const shot = input.shot
  const productText = [shot.materialNeed, shot.productFocus, shot.generationPrompt, shot.visualDescription, input.productIdentityText]
    .map((item) => normalizeTemplateText(item, ''))
    .filter(Boolean)
    .join(' ')
  const category = inferPhysicalLightingLockVideoCategory({
    productType: shot.productType,
    scriptText: shot.scriptText,
    generationPrompt: shot.generationPrompt,
    visualDescription: shot.visualDescription,
    actionDescription: shot.actionDescription,
    cameraDescription: shot.cameraDescription,
    productFocus: shot.productFocus,
    materialNeed: shot.materialNeed,
    productIdentityText: input.productIdentityText,
  })
  const productName = inferPhysicalLightingLockProductName({ category, productType: shot.productType, productText })
  const targetBodyPart = inferPhysicalLightingLockBodyPart({ productType: shot.productType, productText })
  const cameraMovement = inferPhysicalLightingLockCameraMovement({
    category,
    scriptText: shot.scriptText,
    cameraDescription: shot.cameraDescription,
    generationPrompt: shot.generationPrompt,
  })
  const extraCameraMovement = extractCameraMovementOnlySentenceList({
    scriptText: shot.scriptText,
    cameraDescription: shot.cameraDescription,
    motion: shot.motion,
  }).join(' ')
  const specificMicroAction = inferPhysicalLightingLockSpecificMicroAction({
    category,
    productType: shot.productType,
    scriptText: shot.scriptText,
    actionDescription: shot.actionDescription,
    visualDescription: shot.visualDescription,
    productText,
  })
  return fillVideoPromptTemplate(PHYSICAL_LIGHTING_LOCK_VIDEO_TEMPLATE, {
    productName,
    targetBodyPart,
    cameraMovement: [cameraMovement, extraCameraMovement].filter(Boolean).join(' '),
    specificMicroAction,
  })
}

export function buildFinalShotVideoPositivePrompt(input: {
  shot: Pick<
    ShotSpec,
    | 'id'
    | 'index'
    | 'productType'
    | 'scriptText'
    | 'generationPrompt'
    | 'visualDescription'
    | 'actionDescription'
    | 'cameraDescription'
    | 'productFocus'
    | 'materialNeed'
    | 'motion'
    | 'framing'
    | 'shotType'
    | 'compiledPrompt'
  >
  modelIdentityText?: string
  productIdentityText?: string
  productMode?: CloneProductMode
  composeOptimizationPatch?: {
    tightenOpening?: boolean
    addImmediatePayoff?: boolean
    increaseMidVariation?: boolean
    strengthenCtaUrgency?: boolean
    preferSnapClose?: boolean
  }
  composeBodyUpgradePlan?: {
    proofUpgrade?: boolean
    showUpgrade?: boolean
    preferredMoves?: string[]
  }
}) {
  return applyComposeOptimizationPatchToPrompt(buildVideoExecutionStackPrompt(input), {
    shot: input.shot,
    patch: input.composeOptimizationPatch,
    bodyUpgradePlan: input.composeBodyUpgradePlan,
  })
}

export function applyComposeOptimizationPatchToPrompt(
  prompt: string,
  input: {
    shot: Pick<
      ShotSpec,
      | 'scriptRole'
      | 'scriptText'
      | 'generationPrompt'
      | 'visualDescription'
      | 'actionDescription'
      | 'cameraDescription'
      | 'productFocus'
      | 'motion'
      | 'framing'
      | 'shotType'
    >
    patch?: {
      tightenOpening?: boolean
      addImmediatePayoff?: boolean
      increaseMidVariation?: boolean
      strengthenCtaUrgency?: boolean
      preferSnapClose?: boolean
    }
    bodyUpgradePlan?: {
      proofUpgrade?: boolean
      showUpgrade?: boolean
      preferredMoves?: string[]
    }
  },
) {
  const basePrompt = String(prompt || '').trim()
  if (!basePrompt) return ''
  const patch = input.patch
  const bodyUpgradePlan = input.bodyUpgradePlan
  if (!patch && !bodyUpgradePlan) return basePrompt

  const role = String(input.shot.scriptRole || '').trim().toLowerCase()
  const sections: string[] = []
  const rhythmGuidance = buildViralRhythmShotGuidance(input.shot)
  const preferredMoves = Array.isArray(bodyUpgradePlan?.preferredMoves)
    ? bodyUpgradePlan?.preferredMoves.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  const moveText = preferredMoves
    .map((item) => {
      if (item === 'hand_demo') return 'hand demo'
      if (item === 'wider_usage_context') return 'wider usage context'
      if (item === 'angle_shift') return 'angle shift'
      if (item === 'momentum_lift') return 'momentum lift'
      return item.replace(/_/g, ' ')
    })
    .filter(Boolean)

  if (patch?.tightenOpening && role === 'hook') {
    sections.push(
      'Opening Hook Priority: Reveal the product payoff in the first beat. Start on the clearest hero result or unmistakable product value frame, not on soft atmosphere setup.',
    )
  }
  if (patch?.addImmediatePayoff && (role === 'hook' || role === 'proof' || role === 'show' || role === 'solution')) {
    sections.push(
      'Immediate Payoff: Move straight from the opening into visible proof, product result, or close-up confirmation. Avoid filler before the first payoff moment.',
    )
  }
  if (patch?.increaseMidVariation && (role === 'detail' || role === 'show' || role === 'solution' || role === 'proof')) {
    sections.push(
      'Mid-Sequence Variation: Introduce one clear change in framing, motion, or emphasis so the middle section does not feel visually repetitive.',
    )
    if ((role === 'proof' || role === 'detail') && bodyUpgradePlan?.proofUpgrade) {
      sections.push(
        `Proof Move Priority: Favor ${moveText.length ? moveText.join(', ') : 'hand demo, wider usage context, angle shift, or momentum lift'} before repeating another static close-up proof beat.`,
      )
    }
    if ((role === 'show' || role === 'solution') && bodyUpgradePlan?.showUpgrade) {
      sections.push(
        `Show Move Priority: Favor ${moveText.length ? moveText.join(', ') : 'wider usage context, body interaction, angle shift, or momentum lift'} so the middle keeps opening out instead of repeating the same usage beat.`,
      )
    }
    if (role === 'proof' || role === 'detail') {
      sections.push(
        'Proof Upgrade: Do not stay on repeated static close-up coverage. Escalate into a clearer hand demo, wider usage context, angle shift, or motion lift so the proof feels stronger and more purchase-ready.',
      )
    } else {
      sections.push(
        'Show Upgrade: Move beyond generic usage coverage. Let the next beat open into a clearer real-use context, body interaction, or perspective lift so the middle keeps gaining momentum.',
      )
    }
  }
  if (patch?.strengthenCtaUrgency && (role === 'offer' || role === 'cta' || role === 'proof')) {
    sections.push(
      'Conversion Pressure: Make the action outcome immediate and direct. Emphasize urgency, limited availability, or fast decision pressure without sounding spammy.',
    )
  }
  if (patch?.preferSnapClose && (role === 'cta' || role === 'offer' || role === 'proof')) {
    sections.push(
      'Snap Close: End with a decisive final action beat or clean proof-to-action handoff. Avoid drifting into a soft lingering finish.',
    )
  }
  if (rhythmGuidance) sections.push(rhythmGuidance)

  if (!sections.length) return basePrompt
  return `${sections.join('\n')}\n\n${basePrompt}`.trim()
}

export function buildCloneShotPrompt(input: {
  blueprint: CloneBlueprint
  shot: ShotSpec
  productRefs: string[]
  options: {
    productType: CloneProductType
    productDescription?: string
    qualityMode: CloneQualityMode
    productPoints?: string
  }
}) {
  const { blueprint, shot, productRefs, options } = input
  const rhythm = blueprint.rhythm
  const visualStyle = blueprint.visualStyle
  const shotRole = keepEnglishLikeText(shot.shotRole || shot.role || shot.purpose || 'detail', 'detail')
  const cameraFraming = keepEnglishLikeText(shot.framing || 'closeup', 'closeup')
  const cameraMovement = keepEnglishLikeText(shot.cameraMovement || shot.motion || 'static', 'static')
  const action = keepEnglishLikeText(shot.action || shot.visualPrompt || 'natural product demonstration', 'natural product demonstration')
  const negative = buildCloneNegativePrompt(options.productType, shot.shotType)
  const referenceLock = buildReferenceLockText(shot, visualStyle?.scene)
  const scriptLock = buildShotScriptConstraintText(shot)
  const sellingPoints = keepEnglishLikeText(
    options.productPoints || shot.materialNeed || '',
    'clear product visibility and purchase reason',
  )

  const sections = [
    `Create a premium realistic social-commerce short video shot. Use ${buildRealismInstruction(shot.shotType, options.qualityMode)}. Keep the scene in ${keepEnglishLikeText(visualStyle?.scene || 'social commerce scene', 'social commerce scene')} with ${keepEnglishLikeText(visualStyle?.lighting || 'soft natural daylight', 'soft natural daylight')}.`,
    `Use ${cameraFraming} framing and ${cameraMovement} camera movement. The action should stay focused on ${action}. The target duration is ${Number(shot.durationSec || 3).toFixed(1)} seconds.`,
    scriptLock,
    referenceLock,
    buildProductLockText(options.productType, productRefs, options.productDescription),
    `The selling focus must stay on: ${sellingPoints}. The average shot rhythm is ${Number(rhythm?.avgShotDurationSec ?? shot.durationSec ?? 1.5).toFixed(1)} seconds with ${rhythm?.cutDensity ?? 'medium'} cut density.`,
    buildTextSafetyInstruction(),
  ]
  return {
    positive: composePromptParagraphs(sections, 1800),
    negative: sanitizeNegativePrompt(negative),
  }
}

export function expandCommercialVideoPrompt(input: {
  title?: string
  hook?: string
  storyBeats?: Array<{ purpose: string; shotType?: string; productRole?: string }>
  productType?: CloneProductType
  productPoints?: string
  sceneHint?: string
  styleHint?: string
  durationSec?: number
  qualityMode?: CloneQualityMode
}) {
  const title = keepEnglishLikeText(input.title, 'short-form commercial video')
  const hook = keepEnglishLikeText(input.hook, 'strong first-3-seconds hook with clear product value')
  const sceneHint = keepEnglishLikeText(input.sceneHint, 'premium commercial social-video scene')
  const styleHint = keepEnglishLikeText(input.styleHint, 'high-end realistic TikTok style')
  const productPoints = keepEnglishLikeText(input.productPoints, 'clear product value, texture, usage and buying reason')
  const beats = Array.isArray(input.storyBeats) ? input.storyBeats.slice(0, 6) : []
  const beatText = beats.length
    ? beats
        .map((beat, index) => {
          const purpose = keepEnglishLikeText(beat.purpose, 'demo')
          const shotType = keepEnglishLikeText(beat.shotType, 'social commerce close-up')
          const productRole = keepEnglishLikeText(beat.productRole, 'product focus')
          return `${index + 1}. ${purpose} - ${shotType} - ${productRole}`
        })
        .join('\n')
    : '1. hook - strong opening with product impact\n2. demo - clear product usage and texture\n3. proof - believable benefit and result\n4. cta - concise call to action'
  const duration = Number(input.durationSec ?? 15) || 15
  const qualityLine =
    input.qualityMode === 'fast'
      ? 'fast but realistic execution, avoid overlong setup'
      : input.qualityMode === 'standard'
        ? 'balanced realism and clarity'
        : 'maximum realism, premium commercial finish'
  const positive = [
    `Title: ${title}`,
    `Hook: ${hook}`,
    `Scene: ${sceneHint}`,
    `Style: ${styleHint}`,
    `Product focus: ${productPoints}`,
    `Duration target: ${duration.toFixed(1)} seconds`,
    `Execution quality: ${qualityLine}`,
    'Camera: mix of close-up, medium shot and detail shot, with clean composition and stable framing',
    'Lighting: soft diffused lighting, even illumination, controlled reflections, no harsh highlights',
    'Motion: subtle handheld motion, smooth transition, no jarring cuts',
    'Subject: clear model or product presence, believable body language, no awkward pose',
    'Editing: concise rhythm, strong hook, clear middle section, clean ending',
    'Constraints: remove watermark, subtitles, UI noise, logo contamination and low-quality artifacts',
    `Story beats:\n${beatText}`,
  ]
    .filter(Boolean)
    .join('\n')
  const negative = [
    'watermark',
    'subtitle',
    'logo',
    'platform ui',
    'garbled text',
    'uncanny face',
    'extra fingers',
    'deformed hands',
    'plastic texture',
    'overexposed highlights',
    'muddy background',
  ].join(', ')
  return {
    positive: sanitizeGeneratedVideoPrompt(positive),
    negative: sanitizeNegativePrompt(negative),
  }
}
