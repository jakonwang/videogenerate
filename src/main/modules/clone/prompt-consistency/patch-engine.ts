import type { ConsistencyPatchSet, IdentityAnchor } from './types'

export function generateConsistencyPatches(input: {
  productType: string
  anchors: IdentityAnchor[]
  strictConsistencyMode: boolean
  referencePriorityMode: 'standard' | 'hard'
  modelIdentity?: {
    name?: string
    description?: string
    market?: string
    gender?: string
    ageRange?: string
    hairStyle?: string
    skinTone?: string
    outfitStyle?: string
    mood?: string
    sceneStyle?: string
  }
}) {
  const modelIdentityBits = [
    input.modelIdentity?.name ? `name=${input.modelIdentity.name}` : '',
    input.modelIdentity?.description ? `description=${input.modelIdentity.description}` : '',
    input.modelIdentity?.market ? `market=${input.modelIdentity.market}` : '',
    input.modelIdentity?.gender ? `gender=${input.modelIdentity.gender}` : '',
    input.modelIdentity?.ageRange ? `age_range=${input.modelIdentity.ageRange}` : '',
    input.modelIdentity?.hairStyle ? `hair=${input.modelIdentity.hairStyle}` : '',
    input.modelIdentity?.skinTone ? `skin=${input.modelIdentity.skinTone}` : '',
    input.modelIdentity?.outfitStyle ? `outfit=${input.modelIdentity.outfitStyle}` : '',
    input.modelIdentity?.mood ? `mood=${input.modelIdentity.mood}` : '',
    input.modelIdentity?.sceneStyle ? `scene=${input.modelIdentity.sceneStyle}` : '',
  ].filter(Boolean)
  const anchorPatch = input.anchors.length
    ? `Preserve these key identity anchors exactly: ${input.anchors.map((item) => `${item.key}=${item.value}`).join('; ')}.`
    : 'Preserve the exact product identity anchors from the reference.'
  const identityPatch = `Product identity lock for ${input.productType}: preserve exact structure, silhouette, proportions, materials, attachment logic, and category.`
  const modelIdentityPatch = modelIdentityBits.length
    ? `Selected model identity lock: keep the same bound model across every storyboard frame. Treat this model identity as the only valid human identity source. Bound model profile: ${modelIdentityBits.join('; ')}. Exactly one human model is allowed when a human is required. Never use any person identity from product references, reference video, source footage, scene references, reflections, or background extras.`
    : 'Selected model identity lock: keep the same bound model across every storyboard frame. Treat the selected model as the only valid human identity source. Exactly one human model is allowed when a human is required. Never use any person identity from product references, reference video, source footage, scene references, reflections, or background extras.'
  const consistencyPatch =
    input.referencePriorityMode === 'hard'
      ? 'Reference authority is hard-locked. Do not let styling, motion, or camera language override product identity. Selected model identity overrides any person appearing in product references, source footage, scene references, or decorative human imagery. The reference video may guide motion and camera only; it must never replace model identity or alter product structure.'
      : 'Reference authority remains above styling instructions. Selected model identity remains above any person shown in product references. The reference video may guide motion and camera only; it must never replace model identity or alter product structure.'
  const antiVariationPatch = input.strictConsistencyMode
    ? 'Strict anti-variation mode: no geometry drift, no extra decorative units, no category switch, no duplicate product parts.'
    : 'Prevent product drift, redesign, and extra decorative elements.'
  const negativePatch =
    'no duplicate product, no extra decorations, no redesigned product, no added charms, no category mutation, no geometry drift, no material drift, no person identity drift, no face swap from product reference people, no mixed model identity, no second model, no extra person, no cloned person, no background model, no product-reference person as model'
  const out: ConsistencyPatchSet = {
    identityPatch,
    modelIdentityPatch,
    anchorPatch,
    consistencyPatch,
    antiVariationPatch,
    negativePatch,
  }
  return out
}
