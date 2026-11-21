/**
 * AI 制片人 / 下载复刻 starts a clone with no model. The auto run must pick one before drawing the
 * identity grid; otherwise it stops at "请先选择模特" with no script and placeholder shots.
 */
import assert from 'node:assert/strict'
import { pickAutoRunModelIdentity } from '../src/main/modules/clone/service'
import type { ModelIdentityLibraryItem } from '../src/main/modules/clone/types'

function model(id: string, updatedAt: number, patch: Partial<ModelIdentityLibraryItem> = {}) {
  return { id, name: id, status: 'done', updatedAt, createdAt: 1, imagePaths: [`D:/m/${id}.png`], productType: 'general', ...patch } as ModelIdentityLibraryItem
}
const project = (id: string, productId: string, modelId: string, updatedAt: number) =>
  ({ id, productId, updatedAt, selectedModelIdentityId: modelId }) as never

const library = [model('newest', 30), model('old', 10), model('mid', 20), model('broken', 99, { status: 'failed' })]
const self = { id: 'p-new', productId: 'A-264' } as never

// The same product keeps the model its earlier videos used
assert.equal(
  pickAutoRunModelIdentity(self, library, [project('p1', 'other', 'mid', 50), project('p2', 'A-264', 'old', 40)])?.id,
  'old',
)
console.log('✓ a product keeps the model of its earlier videos')

// Otherwise the model used most recently; a deleted or unfinished model is skipped
assert.equal(
  pickAutoRunModelIdentity(self, library, [project('p1', 'other', 'gone', 90), project('p2', 'x', 'broken', 80), project('p3', 'y', 'mid', 50)])?.id,
  'mid',
)
console.log('✓ otherwise the model used most recently')

// Otherwise the newest finished model in the library
assert.equal(pickAutoRunModelIdentity(self, library, [])?.id, 'newest')
assert.equal(pickAutoRunModelIdentity(self, [model('x', 1, { imagePaths: [] })], []), null)
assert.equal(pickAutoRunModelIdentity(self, [], []), null)
console.log('✓ otherwise the newest finished model; none when the library has no usable model')
console.log('clone auto model pick smoke passed')
