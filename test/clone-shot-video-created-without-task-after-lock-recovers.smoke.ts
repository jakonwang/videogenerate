import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const filePath = join(process.cwd(), 'src', 'main', 'modules', 'clone', 'service.ts')
  const source = await readFile(filePath, 'utf8')

  assert.match(source, /const SHOT_VIDEO_MISSING_TASK_GRACE_MS = 10 \* 60 \* 1000/)
  assert.match(source, /function isShotVideoMissingTaskGraceActive/)
  assert.match(source, /event === 'segment_submit_missing_task'/)
  assert.match(source, /status: 'submitting'/)
  assert.match(source, /sourceEvent: 'segment_submit_missing_task'/)
  assert.match(source, /const createdRemoteStatus =/)
  assert.match(source, /remoteStatus: createdRemoteStatus/)
  assert.doesNotMatch(source, /sourceEvent: 'segment_submit_missing_task_id'/)

  console.log('clone shot video created without task after lock recovers smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
