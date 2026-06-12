import assert from 'node:assert/strict'
import { __test_bindProjectProductSnapshot } from '../src/main/modules/clone/service'
import type { CloneProject } from '../src/main/modules/clone/types'
import type { Product } from '../src/main/modules/products/types'

const project = {
  id: 'clone-project-bind-1',
  baseBlueprint: {
    productCategory: 'jewelry',
    consistencyAssets: {},
  },
  blueprint: {
    productCategory: 'jewelry',
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

const bound = __test_bindProjectProductSnapshot({
  project,
  product,
})

assert.equal(bound.productReferenceImagePaths?.[0], 'D:/product/analysis-board.png')
assert.equal(bound.sanitizedProductReferenceImagePaths?.[0], 'D:/product/analysis-board.png')
assert.equal(bound.boundProductSnapshot?.analysisBoardPath, 'D:/product/analysis-board.png')
assert.equal(bound.boundProductSnapshot?.canonicalSourcePath, 'D:/product/analysis-board.png')
assert.equal(bound.boundProductSnapshot?.frozenReferenceImagePaths?.[0], 'D:/product/analysis-board.png')

console.log('clone project binding prefers analysis board smoke test passed')
