import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const source = await readFile(join(process.cwd(), 'src/renderer/src/composables/useCloneProjectWorkspace.project.ts'), 'utf8')

  assert.match(source, /const applyProject = \(next: TProject \| null, mode: 'patch' \| 'replace' = 'patch'\)/)
  assert.match(source, /applyProject\(next, 'replace'\)/)
  assert.match(source, /applyProject\(project, 'replace'\)/)
  assert.match(source, /applyProject\(latestProject, 'replace'\)/)

  console.log('clone project refresh full project replaces stale shot state smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
