import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function main() {
  const source = await readFile('src/main/modules/clone/service.ts', 'utf8')

  assert.match(
    source,
    /const savedProject = await cloneRepo\.upsertProject\(latestProject\)\s*scheduleRemoteStoryboardVideoReconcile\(savedProject\.id, 0\)\s*return savedProject/,
  )

  console.log('clone shot video force regenerate schedules reconcile smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
