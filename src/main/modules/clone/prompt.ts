import type { CloneBlueprint, CloneProductType, CloneQualityMode, ReferenceLock, ShotSpec } from './types'

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
    .replace(/\.\./g, '.')
    .replace(/\btraceid\s*:\s*\S+/gi, '')
    .replace(/\bhttp\s*(400|401|403|404|429|500|502|503)\s*:\s*.*$/gi, '')
    .replace(/[;,:-]?\s*(script confidence|analysis notes|script negative|reference lock mode)\s*:?.*$/i, '')
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

function composePromptParagraphs(sections: Array<string | null | undefined>, maxChars = 1800) {
  const parts = sections
    .map((item) => sanitizeGeneratedVideoPrompt(item || '', 600))
    .map((item) => item.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((item) => sentenceCase(item.endsWith('.') ? item : `${item}.`))
  const compact = Array.from(new Set(parts)).join('\n\n')
  return sanitizeGeneratedVideoPrompt(compact, maxChars)
}

function buildAccessorLockedText(input: { productType: string; base: string; earrings: string }) {
  const normalized = String(input.productType || '').trim().toLowerCase()
  return /earrings?/.test(normalized) ? input.earrings : input.base
}

export function sanitizeGeneratedVideoPrompt(value: unknown, maxChars = 1800) {
  const lines = dedupePromptLines(normalizePromptLine(value))
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
  return deduped.join(', ').slice(0, maxChars)
}

export function buildNoSpeakingInstruction() {
  return 'Silent performance only: no speaking, no dialogue, no lip-sync, no visible speech articulation, lips closed or naturally relaxed, mouth stays closed unless breathing naturally, and no presenter-style talking pose.'
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
  if (motion === 'zoom_out') {
    const isEarring = /earrings?/.test(productType)
    const startState = isEarring ? 'extreme close-up of earring and ear' : 'tight close-up of the product anchor area'
    const endState = isEarring
      ? 'slightly wider close-up including ear and partial neck'
      : 'slightly wider close-up of the same subject area'
    return [
      'CAMERA MOTION LOCK:',
      'The zoom out must be a CONTINUOUS camera movement from the initial close-up frame.',
      `Start state: ${startState}.`,
      `End state: ${endState}.`,
      'The motion must feel like a single uninterrupted camera pull-back.',
      'DO NOT cut to a new shot, regenerate a new framing, change subject scale abruptly, or reset composition.',
    ].join(' ')
  }
  return [
    'CAMERA MOTION LOCK:',
    'Keep camera motion continuous within the same shot.',
    'Do NOT cut to a new shot, regenerate a new framing, or reset composition.',
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
    'No noticeable swinging, no exaggerated motion.',
  ].join(' ')
}

export function buildSilentCommercialGlobalRule() {
  return '[Global Rule: Silent visual commercial. Human models must be faceless with head out of frame whenever possible, no speaking or dialogue is allowed, no presenter-to-camera delivery is allowed, and focus 100% on product angles.]'
}

export function prependSilentCommercialGlobalRule(parts: Array<string | null | undefined>, maxChars = 1800) {
  return sanitizeGeneratedVideoPrompt([buildSilentCommercialGlobalRule(), ...parts.filter(Boolean)].join('\n\n'), maxChars)
}

function movementLabel(shot: ShotSpec) {
  const motion = String(shot.cameraMovement || shot.motion || shot.prompt?.cameraMotion || 'static')
  const map: Record<string, string> = {
    static: 'mostly static handheld shot with tiny natural micro movement',
    zoom_in: 'slow push-in following the same reference movement path',
    zoom_out: 'slow pull-back following the same reference movement path',
    pan_left: 'small handheld pan left matching the reference direction',
    pan_right: 'small handheld pan right matching the reference direction',
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
  const scriptText = keepEnglishLikeText(shot.scriptText, 'Maintain the original shot selling logic and timing.')
  const narrationText = keepEnglishLikeText(shot.narrationText, '')
  const onScreenText = keepEnglishLikeText(shot.onScreenText, '')
  const visualDescription = keepEnglishLikeText(
    shot.visualDescription,
    keepEnglishLikeText(shot.visualPrompt || shot.visual, 'Real social-commerce product demonstration in a believable environment.'),
  )
  const actionDescription = keepEnglishLikeText(
    shot.actionDescription,
    keepEnglishLikeText(shot.action || shot.visualPrompt, 'Natural product demonstration with believable hand movement.'),
  )
  const cameraDescription = keepEnglishLikeText(
    shot.cameraDescription,
    `${shot.framing || 'closeup'} framing, ${shot.cameraMovement || shot.motion || 'static'} movement`,
  )
  const productFocus = keepEnglishLikeText(shot.productFocus, 'Keep the product clearly visible and commercially relevant.')
  const generationPrompt = keepEnglishLikeText(
    shot.generationPrompt,
    shot.aiPrompt || shot.prompt?.positive || 'Follow the original shot motion and selling logic.',
  )
  return composePromptParagraphs(
    [
      `Preserve this exact shot logic. ${scriptText}`,
      narrationText ? `The spoken meaning should remain aligned with this shot: ${narrationText}.` : '',
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
      'Keep earring shape, metal color, dangling structure, pearl or zircon placement, and left-right wearing proportion.',
      'Keep the exact hook shape, pendant count, pendant spacing, stone size, stone position and metal thickness.',
      'If the model originally wears different earrings, remove them and replace them with the uploaded earrings only.',
      'Do not add chains, stones, logo, extra charms, or alter the hook and pendant structure.',
      'Keep gemstone and metal reflections realistic and restrained. Do not add exaggerated sparkle effects, starburst highlights, fantasy glow, or fake luxury VFX.',
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
    'Lighting: natural premium light, soft highlights, visible texture and depth',
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
