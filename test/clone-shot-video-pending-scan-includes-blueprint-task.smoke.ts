import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const filePath = join(process.cwd(), 'src', 'renderer', 'src', 'composables', 'useCloneProjectWorkspace.video.ts')
  const source = await readFile(filePath, 'utf8')

  assert.match(source, /const collectPendingSyncItems = \(project: TProject \| null \| undefined\) =>/)
  assert.match(source, /for \(const shot of project\.blueprint\?\.shots \?\? \[\]\)/)
  assert.match(source, /taskId: String\(output\?\.taskId \|\| ''\)\.trim\(\) \|\| String\(blueprintShot\?\.generatedTaskId \|\| ''\)\.trim\(\) \|\| undefined/)
  assert.match(source, /const pendingItems = collectPendingSyncItems\(options\.current\.value\)/)
  assert.match(source, /const shouldToggleLoading = !isAutomaticSyncSource\(source\)/)

  console.log('clone shot video pending scan includes blueprint task smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
