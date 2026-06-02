import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const filePath = join(process.cwd(), 'src', 'renderer', 'src', 'ui', 'views', 'CloneView.vue')
  const source = await readFile(filePath, 'utf8')

  assert.match(source, /const AUTO_REMOTE_SYNC_INTERVAL_MS = 25_000/)
  assert.match(source, /let autoRemoteSyncInFlight = false/)
  assert.match(source, /video-stage:auto-remote-sync-dispatch/)
  assert.match(source, /visibleStageKey\.value === 'video' \|\| hasRemotePendingShotSync\.value \|\| autoVideoPendingCount\.value > 0/)
  assert.match(source, /syncPendingShotVideos\('auto_timer_sync'\)/)
  assert.match(source, /refreshRemoteStatus\('auto_timer_sync'\)/)
  assert.match(source, /mode: hasRemotePendingShotSync\.value \|\| autoVideoPendingCount\.value > 0 \? 'pending_shot_sync' : 'project_reconcile'/)
  assert.doesNotMatch(source, /shouldAutoSyncRemote[\s\S]*!loading\.value[\s\S]*AUTO_REMOTE_SYNC_INTERVAL_MS/)

  console.log('clone shot video auto remote sync smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
