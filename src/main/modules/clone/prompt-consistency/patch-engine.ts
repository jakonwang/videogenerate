import type { ConsistencyPatchSet, IdentityAnchor } from './types'

export function generateConsistencyPatches(input: {
  productType: string
  anchors: IdentityAnchor[]
  strictConsistencyMode: boolean
  referencePriorityMode: 'standard' | 'hard'
}) {
  const anchorPatch = input.anchors.length
    ? `Preserve these key identity anchors exactly: ${input.anchors.map((item) => `${item.key}=${item.value}`).join('; ')}.`
    : 'Preserve the exact product identity anchors from the reference.'
  const identityPatch = `Product identity lock for ${input.productType}: preserve exact structure, silhouette, proportions, materials, attachment logic, and category.`
  const consistencyPatch =
    input.referencePriorityMode === 'hard'
      ? 'Reference authority is hard-locked. Do not let styling, motion, or camera language override product identity.'
      : 'Reference authority remains above styling instructions.'
  const antiVariationPatch = input.strictConsistencyMode
    ? 'Strict anti-variation mode: no geometry drift, no extra decorative units, no category switch, no duplicate product parts.'
    : 'Prevent product drift, redesign, and extra decorative elements.'
  const negativePatch =
    'no duplicate product, no extra decorations, no redesigned product, no added charms, no category mutation, no geometry drift, no material drift'
  const out: ConsistencyPatchSet = {
    identityPatch,
    anchorPatch,
    consistencyPatch,
    antiVariationPatch,
    negativePatch,
  }
  return out
}
