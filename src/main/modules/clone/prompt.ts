import type { CloneBlueprint, CloneProductType, CloneQualityMode, ReferenceLock, ShotSpec } from './types'

function cleanText(value: unknown, fallback: string) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text || fallback
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
  const visual = cleanText(shot.visualPrompt || shot.visual || shot.promptHint || shot.prompt?.positive, 'short social-commerce product demonstration')
  const isModel = role === 'model_scene' || shotType === 'model_demo'
  const isCloseup = role === 'product_closeup' || shot.framing === 'extreme_closeup' || shotType === 'closeup'
  const sceneEnvironment = cleanText(
    shot.referenceLock?.sceneEnvironment,
    isModel
      ? sceneFallback || 'same lifestyle background category as the reference shot'
      : isCloseup
        ? 'same close product-demo background category as the reference shot'
        : sceneFallback || 'same social-commerce scene category as the reference shot',
  )
  const subjectPose = cleanText(
    shot.referenceLock?.subjectPose,
    isModel
      ? 'keep the same body angle, face direction, hand position and distance from camera as the reference shot'
      : isCloseup
        ? 'keep the same hand/product position and product-to-camera distance as the reference shot'
        : 'keep the same subject placement and product handling posture as the reference shot',
  )
  const productAction = cleanText(
    shot.referenceLock?.productAction,
    shot.action || (isModel ? 'demonstrate the product on or near the body in the same way as the reference' : visual),
  )
  const cameraComposition = cleanText(
    shot.referenceLock?.cameraComposition,
    `${shot.framing || 'closeup'} framing; preserve product screen position, subject crop, camera distance and product size ratio from the reference shot`,
  )
  const motionPath = cleanText(shot.referenceLock?.motionPath, movementLabel(shot))
  const mustPreserve = [
    ...(shot.referenceLock?.mustPreserve ?? []),
    `background category and atmosphere: ${sceneEnvironment}`,
    `subject pose and hand placement: ${subjectPose}`,
    `product demonstration action: ${productAction}`,
    `camera composition: ${cameraComposition}`,
    `motion path and rhythm: ${motionPath}`,
  ].map((x) => cleanText(x, '')).filter(Boolean)
  const mayReplace = [
    ...(shot.referenceLock?.mayReplace ?? []),
    'replace the original person with the selected new model identity',
    'change gender, age, skin tone, hair style and outfit only as required by the selected model',
    'replace the original product with the uploaded user product while keeping the same demonstration action',
  ].map((x) => cleanText(x, '')).filter(Boolean)
  const mustAvoid = [
    ...(shot.referenceLock?.mustAvoid ?? []),
    'do not copy the original person face, identity, account, watermark, subtitles, stickers or platform UI',
    'do not invent a different background, new pose, unrelated action, new camera angle or different product-display method',
    'do not turn model demo shots into tabletop product shots, and do not turn product closeups into selfies',
  ].map((x) => cleanText(x, '')).filter(Boolean)
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
  return [
    'Reference lock mode: hard_reference_motion.',
    `Scene/background: ${lock.sceneEnvironment}.`,
    `Subject pose: ${lock.subjectPose}.`,
    `Product action: ${lock.productAction}.`,
    `Camera composition: ${lock.cameraComposition}.`,
    `Motion path: ${lock.motionPath}.`,
    `Must preserve: ${lock.mustPreserve.join('; ')}.`,
    `May replace: ${lock.mayReplace.join('; ')}.`,
    `Must avoid: ${lock.mustAvoid.join('; ')}.`,
  ].join('\n')
}

export function buildShotScriptConstraintText(shot: ShotSpec) {
  const lines = [
    'Shot script lock: preserve this specific shot logic.',
    `Script role: ${cleanText(shot.scriptRole, 'unknown')}.`,
    `Script text: ${cleanText(shot.scriptText, 'no reliable narration detected; infer from visual action')}.`,
    shot.narrationText ? `Narration meaning: ${cleanText(shot.narrationText, '')}.` : '',
    shot.onScreenText ? `On-screen text meaning: ${cleanText(shot.onScreenText, '')}.` : '',
    `Visual description: ${cleanText(shot.visualDescription, shot.visualPrompt || shot.visual || 'reference visual')}.`,
    `Action description: ${cleanText(shot.actionDescription, shot.action || shot.visualPrompt || 'reference action')}.`,
    `Camera description: ${cleanText(shot.cameraDescription, `${shot.framing || 'closeup'} framing, ${shot.cameraMovement || shot.motion || 'static'} movement`)}.`,
    `Product focus: ${cleanText(shot.productFocus, 'clear product demonstration purpose')}.`,
    `Generation prompt: ${cleanText(shot.generationPrompt, shot.aiPrompt || shot.prompt?.positive || 'follow the reference shot script and motion')}.`,
    `Start-frame constraint: first frame must already match the shot script role, scene, product placement and action setup.`,
    `End-frame constraint: last frame must naturally complete the same script beat without changing scene, action type, product or person identity.`,
    `Script confidence: ${Number(shot.scriptConfidence ?? 0).toFixed(2)}.`,
    shot.analysisNotes?.length ? `Analysis notes: ${shot.analysisNotes.join('; ')}.` : '',
    `Script negative: ${cleanText(shot.negativePrompt, 'no watermark, account name, platform UI, copied face identity, subtitles, stickers or brand logo')}.`,
  ]
  return lines.filter(Boolean).join('\n')
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
    'If the reference shot contains another accessory or another worn item, replace that item with the uploaded user product only.',
    'Do not keep the original accessory if it conflicts with the uploaded user product.',
    productDescription ? `Product description: ${productDescription.trim()}` : '',
    productRefs.length ? `Reference count: ${productRefs.length}` : '',
  ]
  const specific: Record<CloneProductType, string[]> = {
    earrings: [
      'Identify the product as earrings or ear jewelry first, then place only this exact product on the ear or in the hand display.',
      'Keep earring shape, metal color, dangling structure, pearl or zircon placement, and left-right wearing proportion.',
      'Keep the exact hook shape, pendant count, pendant spacing, stone size, stone position and metal thickness.',
      'If the model originally wears different earrings, remove them and replace them with the uploaded earrings only.',
      'Do not add chains, stones, logo, extra charms, or alter the hook and pendant structure.',
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
      'Identify the product as a toy or figurine first, then keep that exact character/object identity.',
      'Keep toy shape, facial details, color blocks, proportions, and material feel unchanged.',
      'Do not turn it into a different character or change the face.',
    ],
    general: [
      'Identify the exact product category from the uploaded references before generating the image.',
      'Keep the main product appearance consistent with the references.',
      'If another object occupies the same display position in the reference shot, replace that object with the uploaded product only.',
    ],
  }
  return [...lines, ...specific[productType]].filter(Boolean).join('\n')
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
  ]
  const productSpecific: Record<CloneProductType, string[]> = {
    earrings: ['no wrong earring structure', 'no extra gemstone', 'no extra chain', 'no ear deformation'],
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
  const shotRole = shot.shotRole || shot.role || shot.purpose || 'detail'
  const cameraFraming = shot.framing || 'closeup'
  const cameraMovement = shot.cameraMovement || shot.motion || 'static'
  const action = shot.action || shot.visualPrompt || 'natural product demonstration'
  const negative = buildCloneNegativePrompt(options.productType, shot.shotType)
  const referenceLock = buildReferenceLockText(shot, visualStyle?.scene)
  const scriptLock = buildShotScriptConstraintText(shot)

  const sections = [
    `shot role: ${shotRole}`,
    scriptLock,
    referenceLock,
    `product lock: ${buildProductLockText(options.productType, productRefs, options.productDescription)}`,
    `reference rhythm: avg shot ${Number(rhythm?.avgShotDurationSec ?? shot.durationSec ?? 1.5).toFixed(1)}s, cut density ${rhythm?.cutDensity ?? 'medium'}, movement ${cameraMovement}`,
    `scene: ${visualStyle?.scene || 'social commerce scene'}`,
    `camera framing: ${cameraFraming}`,
    `camera movement: ${cameraMovement}`,
    `action: ${action}`,
    `lighting: ${visualStyle?.lighting || 'soft daylight'}`,
    `realism style: ${buildRealismInstruction(shot.shotType, options.qualityMode)}`,
    `duration target: ${Number(shot.durationSec || 3).toFixed(1)} seconds`,
    `selling points: ${String(options.productPoints || shot.materialNeed || '').trim() || 'clear product visibility and purchase reason'}`,
    `text safety: ${buildTextSafetyInstruction()}`,
    `negative prompt: ${negative}`,
  ]
  return {
    positive: sections.join('\n'),
    negative,
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
  const title = cleanText(input.title, 'short-form commercial video')
  const hook = cleanText(input.hook, 'strong first-3-seconds hook with clear product value')
  const sceneHint = cleanText(input.sceneHint, 'premium commercial social-video scene')
  const styleHint = cleanText(input.styleHint, 'high-end realistic TikTok style')
  const productPoints = cleanText(input.productPoints, 'clear product value, texture, usage and buying reason')
  const beats = Array.isArray(input.storyBeats) ? input.storyBeats.slice(0, 6) : []
  const beatText = beats.length
    ? beats
        .map((beat, index) => {
          const purpose = cleanText(beat.purpose, 'demo')
          const shotType = cleanText(beat.shotType, 'social commerce close-up')
          const productRole = cleanText(beat.productRole, 'product focus')
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
    `title: ${title}`,
    `hook: ${hook}`,
    `scene: ${sceneHint}`,
    `style: ${styleHint}`,
    `product focus: ${productPoints}`,
    `duration target: ${duration.toFixed(1)} seconds`,
    `execution quality: ${qualityLine}`,
    'camera: mix of close-up, medium shot and detail shot, with clean composition and stable framing',
    'lighting: natural premium light, soft highlights, visible texture and depth',
    'motion: subtle handheld motion, smooth transition, no jarring cuts',
    'subject: clear model or product presence, believable body language, no awkward pose',
    'editing: concise rhythm, strong hook, clear middle section, clean ending',
    'constraints: remove watermark, subtitles, UI noise, logo contamination and low-quality artifacts',
    `story beats:\n${beatText}`,
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
  return { positive, negative }
}
