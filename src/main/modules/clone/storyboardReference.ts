import type {
  CloneProductType,
  ShotSpec,
  StoryboardReferenceConfidence,
  StoryboardReferenceMode,
  StoryboardSubjectType,
} from './types'

type StoryboardReferenceSignals = {
  productOnlySignal: boolean
  handOnlyProductSignal: boolean
  localWearableSignal: boolean
  modelVisibleSignal: boolean
  hasNonHandBodyPartSignal: boolean
  explicitNoPersonSignal: boolean
  explicitNoFaceSignal: boolean
  wearableProductSignal: boolean
  conflictSignal: boolean
}

export type StoryboardReferenceDecision = {
  subjectType: StoryboardSubjectType
  mode: StoryboardReferenceMode
  confidence: StoryboardReferenceConfidence
  reasons: string[]
  signals: StoryboardReferenceSignals
}

function normalizeTextParts(parts: unknown[]) {
  return parts
    .map((item) => String(item ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join('\n')
}

function uniqueReasons(reasons: string[]) {
  return Array.from(new Set(reasons.map((item) => String(item || '').trim()).filter(Boolean)))
}

function hasVisibleBodyPart(text: string, pattern: RegExp) {
  if (!pattern.test(text)) return false
  const negatedPattern =
    /\bno ear\b|\bno face\b|\bno neck\b|\bno clavicle\b|\bno shoulder\b|\bno upper body\b|\bno half-body\b|\bwithout face\b|\bno full-face presentation\b|\bface not visible\b|\bbody not visible\b|\bno body visible\b/.test(
      text,
    )
  return !negatedPattern
}

function computeSignals(text: string, productType: CloneProductType | 'general') {
  const productOnlySignal =
    /\bproduct only\b|\bproduct itself\b|\bisolated product\b|\bno person\b|\bwithout person\b|\bno model\b|\bwithout model\b|\bobject only\b|\bpackaging\b|\btabletop\b|\bflat lay\b|\bdisplay card\b|\bproduct card\b/.test(
      text,
    )
  const explicitNoPersonSignal =
    /\bno person\b|\bwithout person\b|\bno model\b|\bwithout model\b|\bobject only\b/.test(text)
  const explicitNoFaceSignal =
    /\bno face visible\b|\bwithout face\b|\bno full-face presentation\b|\bface not visible\b|\bidentity is not visible\b|\bno portrait\b|\bno person identity\b/.test(
      text,
    )
  const genericHandSignal = /\bhand\b|\bhands\b|\bfinger\b|\bfingers\b|\bpalm\b|\bpinch\b/.test(text)
  const explicitHandheldProductSignal =
    /\bholding the\b|\bheld in hand\b|\bhand-held\b|\bhand held\b|\bhand holding\b|\bproduct in hand\b|\bproduct in the hand\b|\bfingers holding\b|\bfinger holding\b|\bholding product\b|\bhand-held product\b|\bhand only\b|\bfingers only\b|\bpalm holding\b|\bpalm supporting\b|\bpinch holding\b/.test(
      text,
    )
  const nonHandBodyPartSignal = hasVisibleBodyPart(
    text,
    /\bear\b|\bearlobe\b|\bear area\b|\bearring area\b|\bjawline\b|\bneck\b|\bclavicle\b|\bshoulder\b|\bupper body\b|\bhalf-body\b|\bface\b|\bhead\b|\bportrait\b|\bwrist\b|\bworn on wrist\b|\bworn on finger\b|\bfinger wearing\b|\bwrist wearing\b/,
  )
  const handOnlyProductSignal =
    (explicitHandheldProductSignal ||
      (
        genericHandSignal &&
        /\bonly\b|\bclose-up of fingers\b|\bcloseup of fingers\b|\btight close-up of fingers\b|\bhand product display\b|\bhand display\b/.test(
          text,
        )
      )) &&
    !nonHandBodyPartSignal &&
    !/\bwearing\b|\bworn\b|\btry-on\b|\btry on\b|\bpresenting to camera\b|\bportrait\b|\bface\b|\bhead\b|\bupper body\b|\bhalf-body\b/.test(
      text,
    )
  const localWearableSignal =
    /\bear\b|\bearlobe\b|\bear area\b|\bearring area\b|\bjawline\b|\bneck\b|\bclavicle\b|\bwrist\b|\bfinger\b/.test(text)
  const modelVisibleSignal =
    (hasVisibleBodyPart(text, /\bface\b|\bhead\b|\bportrait\b|\bshoulder\b|\bupper body\b|\bhalf-body\b|\bfull face\b|\bface-centered\b/) ||
      /\bpresenting to camera\b|\bwearing scene\b|\bmodel presentation\b|\bwoman\b|\bman\b|\bfemale\b|\bmale\b|\bperson\b|\bpresenter\b|\bcreator\b|\binfluencer\b/.test(
        text,
      )) &&
    !explicitNoFaceSignal
  const wearableProductSignal =
    productType === 'earrings' ||
    /\bearrings?\b|\bearring\b|\bhoop\b|\bdangle\b|\bdrop earring\b|\bstud\b|\bear jewelry\b|\bnecklace\b|\bbracelet\b|\bring\b|\bpendant\b/.test(
      text,
    )
  const conflictSignal =
    (productOnlySignal || handOnlyProductSignal) &&
    (modelVisibleSignal || (localWearableSignal && !explicitNoFaceSignal))

  return {
    productOnlySignal,
    handOnlyProductSignal,
    localWearableSignal,
    modelVisibleSignal,
    hasNonHandBodyPartSignal: nonHandBodyPartSignal,
    explicitNoPersonSignal,
    explicitNoFaceSignal,
    wearableProductSignal,
    conflictSignal,
  }
}

export function inferStoryboardReferenceDecision(input: {
  productType?: CloneProductType | 'general'
  shot?: Partial<ShotSpec> | null
  extraTexts?: unknown[]
}): StoryboardReferenceDecision {
  const productType = (input.productType || input.shot?.productType || 'general') as CloneProductType | 'general'
  const text = normalizeTextParts([
    productType,
    input.shot?.role,
    input.shot?.shotRole,
    input.shot?.purpose,
    input.shot?.shotType,
    input.shot?.framing,
    input.shot?.visualPrompt,
    input.shot?.visualDescription,
    input.shot?.actionDescription,
    input.shot?.cameraDescription,
    input.shot?.productFocus,
    input.shot?.scriptText,
    input.shot?.onScreenText,
    input.shot?.narrationText,
    ...(input.extraTexts ?? []),
  ])
  const signals = computeSignals(text, productType)
  const reasons: string[] = []

  if (signals.handOnlyProductSignal) {
    reasons.push('hand-only product signal detected')
    reasons.push('no non-hand body part detected')
    return {
      subjectType: 'hand_only_product',
      mode: 'product_closeup',
      confidence: 'high',
      reasons: uniqueReasons(reasons),
      signals,
    }
  }

  if (signals.productOnlySignal) {
    reasons.push('product-only scene signal detected')
    return {
      subjectType: 'product_only',
      mode: 'product_closeup',
      confidence: 'high',
      reasons: uniqueReasons(reasons),
      signals,
    }
  }

  if (signals.modelVisibleSignal) {
    reasons.push('clear model-visible signal detected')
    return {
      subjectType: 'model_visible',
      mode: 'model_presentation',
      confidence: 'high',
      reasons: uniqueReasons(reasons),
      signals,
    }
  }

  if (signals.localWearableSignal) {
    reasons.push('local wearable close-up signal detected')
    if (signals.hasNonHandBodyPartSignal && !/\bwrist\b|\bfinger\b/.test(text)) {
      reasons.push('non-hand body part detected')
      return {
        subjectType: 'local_wearable_closeup',
        mode: 'model_presentation',
        confidence: signals.explicitNoFaceSignal ? 'low' : 'medium',
        reasons: uniqueReasons(reasons),
        signals,
      }
    }
    return {
      subjectType: 'local_wearable_closeup',
      mode: 'product_closeup',
      confidence: 'medium',
      reasons: uniqueReasons(reasons),
      signals,
    }
  }

  reasons.push('insufficient subject evidence')
  if (signals.conflictSignal) reasons.push('conflicting model/product signals detected')
  return {
    subjectType: 'unknown',
    mode: 'model_presentation',
    confidence: 'low',
    reasons: uniqueReasons(reasons),
    signals,
  }
}
