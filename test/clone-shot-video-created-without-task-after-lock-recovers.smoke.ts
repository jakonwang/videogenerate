import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const filePath = join(process.cwd(), 'src', 'main', 'modules', 'clone', 'service.ts')
  const source = await readFile(filePath, 'utf8')

  assert.match(source, /shot-video-reconcile:missing-task-force-regenerate/)
  assert.match(source, /String\(output\.sourceEvent \|\| ''\)\.trim\(\) === 'segment_submit_started'/)
  assert.match(source, /currentRetryCount < AUTO_CLONE_VIDEO_RETRY_LIMIT/)
  assert.match(source, /forceRegenerate: true/)
  assert.match(source, /const createdRemoteStatus =/)
  assert.match(source, /remoteStatus: createdRemoteStatus/)
  assert.match(source, /sourceEvent: 'segment_submit_started'/)
  assert.doesNotMatch(source, /sourceEvent: 'segment_submit_missing_task_id'/)

  console.log('clone shot video created without task after lock recovers smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
