export function generateReferencePriorityRules(referencePriorityMode: 'standard' | 'hard') {
  if (referencePriorityMode === 'hard') {
    return 'REFERENCE IMAGE PRIORITY: The reference images define the product identity. They override all textual descriptions. The model must strictly follow the reference images and must not reinterpret them. If any conflict occurs, follow the reference images, not the prompt. If any cinematic instruction conflicts with product identity, silhouette, structure, geometry, proportions, scale, component count, material response, reflection behavior, or accessory category, always follow the reference images. Cinematic treatment must never override identity.'
  }
  return 'REFERENCE IMAGE PRIORITY: Keep the generated product aligned to the uploaded reference images and preserve the same silhouette, structure, proportions, scale, component count, and product category.'
}
