import assert from 'node:assert/strict'
import { createCloneProductBindingService } from '../src/main/modules/clone/productBinding'

const service = createCloneProductBindingService({
  async bindProjectProductFromLibrary(project, productId) {
    ;(project as any).productId = productId
  },
  async refreshProductCanonicalSourceFromLibrary(input) {
    return { ok: true, input }
  },
  async refreshProductAnalysisFromLibrary(input) {
    return { ok: true, input }
  },
})

assert.ok(service)
assert.equal(typeof service.bindProjectProduct, 'function')
assert.equal(typeof service.refreshLibraryProductAnalysis, 'function')
console.log('clone product binding smoke test passed')
