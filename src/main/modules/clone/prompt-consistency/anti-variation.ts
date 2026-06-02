export function generateAntiVariationRules(productType: string, strict: boolean) {
  const base = [
    'Do not change product category.',
    'Do not mutate the shape, geometry, proportions, or structure.',
    'Do not add extra decorative elements, extra charms, extra stones, extra pendants, extra chains, or duplicated product parts.',
    'Do not change material type, color family, or reflective behavior.',
    'Do not create a second version of the product during motion.',
  ]
  if (/earrings?/.test(productType)) {
    base.push('Keep exactly one matching pair of earrings. Do not add a second butterfly, a second pendant cluster, or any extra ear accessory.')
    base.push('Do not exaggerate gem sparkle, glow, bloom, or starburst highlights beyond realistic camera reflections.')
    base.push('Do not make earrings stand upright by themselves. Preserve believable gravity, hanging direction, and support contact.')
  }
  if (strict) {
    base.push('Across all frames, product identity consistency is more important than cinematic creativity.')
  }
  return base.join(' ')
}
