import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const source = await readFile(join(process.cwd(), 'src/renderer/src/lib/cloneWorkspaceClient.ts'), 'utf8')

  assert.match(source, /const ownership = await desktopClient\.getOwnership\(projectId\)/)
  assert.match(source, /if \(ownership === 'web'\)/)
  assert.match(source, /ownership: ownership === 'unknown' \? 'local' : ownership/)
  assert.match(source, /channel: 'electron-ipc'/)
  assert.doesNotMatch(source, /const result = await webClient\.getProject\(projectId\)/)

  console.log('clone workspace client local preferred when token exists smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
