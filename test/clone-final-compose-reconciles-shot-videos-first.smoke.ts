import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function main() {
  const source = await readFile('src/main/modules/clone/service.ts', 'utf8')

  assert.match(
    source,
    /async composeCloneFinalVideo\(input:[\s\S]*await reconcileRemoteStoryboardVideosInternal\(input\.cloneProjectId\)[\s\S]*const loadedProject = await cloneRepo\.getProject\(input\.cloneProjectId\)/,
  )

  console.log('clone final compose reconciles shot videos first smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
