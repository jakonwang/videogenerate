import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function main() {
  const source = await readFile('src/main/modules/clone/service.ts', 'utf8')

  assert.match(
    source,
    /const primaryVideoProvider = videoProviderChain\(creds\)\[0\]/,
  )
  assert.match(
    source,
    /mode === 'high' && !last && primaryVideoProvider !== 'apifox_hub'/,
  )
  assert.match(
    source,
    /usedFirstFrameAsLastFrame: mode === 'high' && !last/,
  )
  assert.match(
    source,
    /lastFramePath: last \|\| first,/,
  )

  console.log('clone shot video retry limit manual regenerate apifox last frame fallback smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
