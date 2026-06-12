import assert from 'node:assert/strict'
import { __test_storyboardPrimaryProductRefs } from '../src/main/modules/clone/service'
import type { CloneProject } from '../src/main/modules/clone/types'

const project = {
  id: 'clone-project-1',
  productReferenceImagePaths: ['D:/product/original-front.png', 'D:/product/original-side.png'],
  sanitizedProductReferenceImagePaths: ['D:/product/original-front.png', 'D:/product/original-side.png'],
  originalProductReferenceImagePaths: ['D:/product/original-front.png', 'D:/product/original-side.png'],
  boundProductSnapshot: {
    name: 'Demo Product',
    canonicalSourcePath: 'D:/product/canonical-source.png',
    analysisBoardPath: 'D:/product/analysis-board.png',
  },
  baseBlueprint: {
    consistencyAssets: {},
  },
  blueprint: {
    consistencyAssets: {},
  },
} as unknown as CloneProject

const refs = __test_storyboardPrimaryProductRefs(project)

assert.equal(refs[0], 'D:/product/analysis-board.png')
assert.equal(refs[1], 'D:/product/canonical-source.png')
assert.ok(refs.includes('D:/product/original-front.png'))
assert.ok(refs.includes('D:/product/original-side.png'))

console.log('clone identity grid prefers analysis board smoke test passed')
