import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/main/modules/clone/service.ts', import.meta.url), 'utf8')

assert.match(
  source,
  /const cachedClip = input\.forceRegenerate \? null : getCachedCloudClipResult\(item, cloudClipHash\)/,
)

console.log('clone shot video force regenerate bypasses cloud cache smoke test passed')
