import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function main() {
  const source = await readFile('src/main/modules/clone/service.ts', 'utf8')

  assert.match(
    source,
    /const resetSubmissionLockOnly =[\s\S]*input\.forceRegenerate[\s\S]*sourceEvent \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'force_regenerate_reset'[\s\S]*!String\(existing\.taskId \|\| ''\)\.trim\(\)/,
  )
  assert.match(
    source,
    /if \(!resetSubmissionLockOnly && isShotVideoSubmissionLocked\(existing, submissionFingerprint\)\)/,
  )

  console.log('clone shot video force regenerate reset lock does not block submit smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
