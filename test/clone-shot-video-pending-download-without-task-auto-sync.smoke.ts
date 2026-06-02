import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const videoComposablePath = join(process.cwd(), 'src', 'renderer', 'src', 'composables', 'useCloneProjectWorkspace.video.ts')
  const cloneViewPath = join(process.cwd(), 'src', 'renderer', 'src', 'ui', 'views', 'CloneView.vue')
  const composableSource = await readFile(videoComposablePath, 'utf8')
  const cloneViewSource = await readFile(cloneViewPath, 'utf8')

  assert.match(composableSource, /normalizedStatus === 'remote_succeeded_pending_download' \|\| normalizedStatus === 'downloading'/)
  assert.match(composableSource, /String\(item\.videoUrl \|\| ''\)\.trim\(\)/)
  assert.match(composableSource, /\? await resolved\?\.client\.forceDownloadShotVideoResult\(projectId, shotId\)/)

  assert.match(cloneViewSource, /status === 'remote_succeeded_pending_download' \|\| status === 'downloading'/)
  assert.match(cloneViewSource, /Boolean\(String\(item\.videoUrl \|\| ''\)\.trim\(\)\)/)

  console.log('clone shot video pending download without task auto sync smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
