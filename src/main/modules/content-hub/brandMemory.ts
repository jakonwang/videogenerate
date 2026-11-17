import { brandMemoryStore } from './stores'
import { REDO_REASON_LABEL } from './insights'
import { productPerformanceGuidance } from './performance'

/**
 * Renders brand + product memory as plain guidance for the AI producer's brain and planner.
 * Kept short so it fits comfortably into every planning prompt.
 */
export async function buildMemoryGuidance(productId?: string): Promise<string> {
  const db = await brandMemoryStore.read()
  const lines: string[] = []
  const brand = db.brand
  if (brand.brandName) lines.push(`Brand: ${brand.brandName}`)
  if (brand.tone) lines.push(`Brand tone: ${brand.tone}`)
  if (brand.audience) lines.push(`Target audience: ${brand.audience}`)
  if (brand.bannedWords.length) lines.push(`Never use these words: ${brand.bannedWords.join(', ')}`)
  if (brand.subtitleStyle) lines.push(`Subtitle style: ${brand.subtitleStyle}`)
  if (brand.notes) lines.push(`Brand notes: ${brand.notes}`)

  if (productId && db.products[productId]) {
    const product = db.products[productId]
    if (product.sellingPoints) lines.push(`Product selling points: ${product.sellingPoints}`)
    if (product.audience) lines.push(`Product audience: ${product.audience}`)
    if (product.avoid) lines.push(`Avoid for this product: ${product.avoid}`)
    if (product.notes) lines.push(`Product notes: ${product.notes}`)
  }

  const recent = db.feedback.filter((entry) => entry.decision !== 'approved' && entry.reason && (!productId || entry.productId === productId)).slice(-200)
  const counts = new Map<string, number>()
  for (const entry of recent) counts.set(entry.reason!, (counts.get(entry.reason!) || 0) + 1)
  const learned = [...counts.entries()].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4)
  if (learned.length) {
    lines.push(`Reviewer rejected past outputs for: ${learned.map(([reason, count]) => `${REDO_REASON_LABEL[reason] || reason} (${count}x)`).join('; ')}. Plan to avoid these.`)
  }
  const notes = recent.filter((entry) => entry.note).slice(-3).map((entry) => entry.note)
  if (notes.length) lines.push(`Recent reviewer notes: ${notes.join(' | ')}`)

  // What actually sold outranks what merely passed review.
  if (productId) {
    const proof = await productPerformanceGuidance(productId).catch(() => '')
    if (proof) lines.push(proof)
  }

  return lines.join('\n')
}
