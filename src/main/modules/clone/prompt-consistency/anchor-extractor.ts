import type { ShotSpec } from '../types'
import type { IdentityAnchor } from './types'

function push(out: IdentityAnchor[], key: IdentityAnchor['key'], value: string, confidence: number, source: IdentityAnchor['source']) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return
  if (out.some((item) => item.key === key && item.value === trimmed)) return
  out.push({ key, value: trimmed, confidence, source })
}

export function extractIdentityAnchors(shot: ShotSpec, productType: string) {
  const out: IdentityAnchor[] = []
  push(out, 'shape', shot.productFocus || shot.materialNeed || shot.visualDescription, 0.72, 'shot_field')
  push(out, 'silhouette', shot.visualDescription || shot.visual, 0.68, 'shot_field')
  push(out, 'material', shot.materialNeed || shot.productFocus, 0.66, 'shot_field')
  push(out, 'structure', shot.productFocus || shot.materialNeed, 0.74, 'shot_field')
  push(out, 'color', shot.materialNeed || shot.visualDescription, 0.61, 'shot_field')
  push(out, 'proportion', shot.productFocus || 'preserve exact proportions from reference', 0.6, 'product_type_rule')
  if (/earrings?/.test(productType)) {
    push(out, 'count', 'exactly one matching pair of earrings; no extra earring units', 0.95, 'product_type_rule')
    push(out, 'attachment', 'preserve exact hook and dangling attachment structure', 0.93, 'product_type_rule')
    push(out, 'reflective_behavior', 'preserve metal reflection and stone placement without creating new ornaments', 0.84, 'product_type_rule')
  } else if (/ring/.test(productType)) {
    push(out, 'count', 'exactly one ring structure with no extra band or stone cluster', 0.94, 'product_type_rule')
    push(out, 'attachment', 'preserve exact stone-to-band mounting structure', 0.9, 'product_type_rule')
  } else if (/necklace|bracelet/.test(productType)) {
    push(out, 'count', 'keep exact chain and pendant unit count with no extra charms', 0.92, 'product_type_rule')
    push(out, 'attachment', 'preserve exact clasp, chain thickness, and pendant connection points', 0.91, 'product_type_rule')
  } else if (/bag/.test(productType)) {
    push(out, 'structure', 'preserve exact bag outline, handle structure, seams, and hardware placement', 0.9, 'product_type_rule')
  } else if (/shoes/.test(productType)) {
    push(out, 'structure', 'preserve exact shoe silhouette, sole shape, lace structure, and upper panel layout', 0.9, 'product_type_rule')
  } else if (/beauty/.test(productType)) {
    push(out, 'structure', 'preserve exact packaging cap, tube or bottle geometry, and label placement', 0.9, 'product_type_rule')
  }
  return out
}
