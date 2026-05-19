import type { IdentityAnchor } from './types'

export function generateIdentityLock(productType: string, anchors: IdentityAnchor[]) {
  const anchorText = anchors
    .slice(0, 6)
    .map((item) => `${item.key}: ${item.value}`)
    .join('; ')
  return [
    'STRICT PRODUCT IDENTITY LOCK (HIGHEST PRIORITY): This is a product replication task, NOT a creative task.',
    'The product must remain EXACTLY identical to the reference images.',
    'The uploaded reference images define the product identity and have higher authority than creative prompt styling.',
    `Identify the product as ${productType || 'the uploaded product'} and preserve the exact product identity across all frames.`,
    'Preserve exact silhouette and outline, exact geometry and structure, exact proportions and scale, exact number of elements and components, exact material and reflection behavior, exact design details without simplification, and exact accessory type and category.',
    'DO NOT redesign, reinterpret, or improve the product, change shape, thickness, or proportions, add or remove any elements, generate similar but different variations, or switch to other product styles.',
    'KEY IDENTITY ANCHOR: The product silhouette and structure must remain visually identical at all times.',
    anchorText ? `Key identity anchors: ${anchorText}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}
