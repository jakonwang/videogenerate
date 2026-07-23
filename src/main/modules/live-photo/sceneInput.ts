import { existsSync } from 'node:fs'
import type { CreateReferenceLivePhotoInput, LivePhotoProductSnapshot } from './types'
import { resolveAuthoritativeLivePhotoProductRefs } from './productInput'

export function normalizeLivePhotoScenePaths(input: Pick<CreateReferenceLivePhotoInput, 'referenceImagePath' | 'referenceImagePaths'>) {
  const paths = Array.from(
    new Set(
      [
        String(input.referenceImagePath || '').trim(),
        ...(Array.isArray(input.referenceImagePaths) ? input.referenceImagePaths.map((item) => String(item || '').trim()) : []),
      ].filter(Boolean),
    ),
  )
  if (!paths.length) throw new Error('Reference image does not exist')
  const missingPath = paths.find((item) => !existsSync(item))
  if (missingPath) throw new Error(`Reference image does not exist: ${missingPath}`)
  return paths
}

export function bindLivePhotoReplacementInputs(input: {
  referenceImagePath: string
  product: Pick<LivePhotoProductSnapshot, 'authoritativeProductReferencePath' | 'imagePaths' | 'coverImagePath'>
}) {
  const referenceImagePath = String(input.referenceImagePath || '').trim()
  if (!referenceImagePath || !existsSync(referenceImagePath)) throw new Error('Reference image does not exist')
  const productReferenceImagePaths = resolveAuthoritativeLivePhotoProductRefs(input.product)
  if (!productReferenceImagePaths.length) throw new Error('Selected product does not have usable reference images')
  return {
    referenceImagePath,
    productReferenceImagePaths,
    imagePaths: [referenceImagePath, productReferenceImagePaths[0]!],
  }
}
