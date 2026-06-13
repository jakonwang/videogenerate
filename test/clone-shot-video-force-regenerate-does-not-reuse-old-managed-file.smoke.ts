import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function main() {
  const source = await readFile('src/main/modules/clone/service.ts', 'utf8')

  assert.match(
    source,
    /const shouldSkipManagedArtifactReuse =[\s\S]*shouldBlockLocalReuseDuringCurrentDownload[\s\S]*if \(shouldSkipManagedArtifactReuse\) \{\s*return \{ skip: false as const \}\s*\}/,
  )

  console.log('clone shot video force regenerate does not reuse old managed file smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
