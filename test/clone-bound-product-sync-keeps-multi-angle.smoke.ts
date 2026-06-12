import assert from 'node:assert/strict'
import { __test_syncBoundProductSnapshotFromLibrary } from '../src/main/modules/clone/service'
import type { CloneProject } from '../src/main/modules/clone/types'
import type { Product } from '../src/main/modules/products/types'

const project = {
  id: 'clone-project-sync-1',
  productId: 'product-1',
  boundProductSnapshot: {
    id: 'product-1',
    name: 'Old Product',
    type: 'jewelry',
    originalImagePaths: ['D:/product/original-front.png'],
    frozenReferenceImagePaths: ['D:/product/original-front.png'],
    boundAt: 1,
    updatedAt: 1,
  },
  baseBlueprint: {
    consistencyAssets: {},
  },
  blueprint: {
    consistencyAssets: {},
  },
} as unknown as CloneProject

const product = {
  id: 'product-1',
  name: 'Demo Product',
  type: 'jewelry',
  coverImagePath: 'D:/product/cover.png',
  canonicalSourcePath: 'D:/product/canonical-source.png',
  analysisBoardPath: 'D:/product/analysis-board.png',
  images: [
    { filePath: 'D:/product/original-front.png' },
    { filePath: 'D:/product/original-side.png' },
  ],
} as unknown as Product

const synced = __test_syncBoundProductSnapshotFromLibrary(project, product)

assert.equal(synced.boundProductSnapshot?.analysisBoardPath, 'D:/product/analysis-board.png')
assert.equal(synced.boundProductSnapshot?.canonicalSourcePath, 'D:/product/analysis-board.png')
assert.deepEqual(synced.boundProductSnapshot?.frozenReferenceImagePaths, [
  'D:/product/analysis-board.png',
])

console.log('clone bound product sync keeps multi-angle refs smoke test passed')
