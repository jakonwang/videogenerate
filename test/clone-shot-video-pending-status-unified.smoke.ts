import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const viewPath = join(process.cwd(), 'src', 'renderer', 'src', 'ui', 'views', 'CloneView.vue')
  const composablePath = join(process.cwd(), 'src', 'renderer', 'src', 'composables', 'useCloneProjectWorkspace.video.ts')
  const viewSource = await readFile(viewPath, 'utf8')
  const composableSource = await readFile(composablePath, 'utf8')

  assert.match(viewSource, /const remotePendingShotStatuses = new Set\(\[/)
  assert.match(viewSource, /'polling_timeout'/)
  assert.match(viewSource, /'failed_retryable'/)
  assert.match(viewSource, /function isRemotePendingShot/)
  assert.match(viewSource, /return shotVideoOutputs\.value\.filter\(\(item\) => isRemotePendingShot\(item\)\)\.length/)
  assert.match(viewSource, /const hasRemotePendingShotSync = computed\(\(\) => shotVideoOutputs\.value\.some\(\(item\) => isRemotePendingShot\(item\)\)\)/)
  assert.match(viewSource, /if \(isRemotePendingShot\(item\)\) return true/)

  assert.match(composableSource, /const pendingStatuses = new Set\(\[/)
  assert.match(composableSource, /'polling_timeout'/)
  assert.match(composableSource, /const isPendingSyncItem =/)

  console.log('clone shot video pending status unified smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
