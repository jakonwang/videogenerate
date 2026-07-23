import { existsSync } from 'node:fs'
import type { LivePhotoProductSnapshot } from './types'

type ProductReferenceInput = Pick<
  LivePhotoProductSnapshot,
  'authoritativeProductReferencePath' | 'imagePaths' | 'coverImagePath'
>

export function resolveAuthoritativeProductReferencePath(product: ProductReferenceInput) {
  const candidates = [
    String(product.authoritativeProductReferencePath || '').trim(),
    ...(Array.isArray(product.imagePaths) ? product.imagePaths.map((item) => String(item || '').trim()) : []),
    String(product.coverImagePath || '').trim(),
  ].filter(Boolean)
  return candidates.find((item) => existsSync(item)) || ''
}

export function resolveAuthoritativeLivePhotoProductRefs(product: ProductReferenceInput) {
  const path = resolveAuthoritativeProductReferencePath(product)
  return path ? [path] : []
}
