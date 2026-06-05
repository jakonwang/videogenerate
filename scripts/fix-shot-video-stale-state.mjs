import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const projectId = process.argv[2] || '961e993c-acf9-4670-ac31-4141850e2132'
const shotId = process.argv[3] || 'shot_2'
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'VideoGenerate', '.videogenerate', 'db', 'clone-projects.sqlite')

const db = new DatabaseSync(dbPath)
const row = db.prepare('SELECT id, payload FROM clone_projects WHERE id = ?').get(projectId)

if (!row) {
  console.error(`[fix-shot-video-stale-state] 未找到项目: ${projectId}`)
  process.exit(1)
}

const payload = JSON.parse(String(row.payload || '{}'))
const shots = Array.isArray(payload?.blueprint?.shots) ? payload.blueprint.shots : []
const outputs = Array.isArray(payload?.shotVideoOutputs) ? payload.shotVideoOutputs : []

const shot = shots.find((item) => String(item?.id || '').trim() === shotId)
const output = outputs.find((item) => String(item?.shotId || '').trim() === shotId)

if (!shot || !output) {
  console.error(`[fix-shot-video-stale-state] 未找到镜头或输出: project=${projectId} shot=${shotId}`)
  process.exit(1)
}

const remoteStatus = String(output.remoteStatus || '').trim().toLowerCase()
const remoteRawStatus = String(output?.remoteRaw?.status || '').trim().toLowerCase()
const isPendingRemote =
  ['created', 'queued', 'pending', 'processing', 'running'].includes(remoteStatus) ||
  ['created', 'queued', 'pending', 'processing', 'running'].includes(remoteRawStatus)

if (!isPendingRemote) {
  console.log(JSON.stringify({
    ok: true,
    skipped: true,
    reason: 'remote_not_pending',
    projectId,
    shotId,
    remoteStatus,
    remoteRawStatus,
  }, null, 2))
  process.exit(0)
}

shot.generatedClipPath = undefined
shot.status = 'failed'
shot.error = String(shot.error || output.error || '[stale_local_cleanup] 旧本地视频已清理，请继续查询或重新生成').trim()

output.videoPath = undefined
output.localPath = undefined
output.videoUrl = undefined
output.status = 'failed_retryable'
output.error = String(output.error || '[stale_local_cleanup] 旧本地视频已清理，请继续查询或重新生成').trim()
output.completedAt = undefined
output.lastPollAt = undefined

db.prepare('UPDATE clone_projects SET payload = ?, updated_at = ? WHERE id = ?').run(
  JSON.stringify(payload),
  Date.now(),
  projectId,
)

console.log(JSON.stringify({
  ok: true,
  fixed: true,
  dbPath,
  projectId,
  shotId,
  remoteStatus,
  remoteRawStatus,
  shot: {
    status: shot.status,
    generatedClipPath: shot.generatedClipPath ?? '',
    error: shot.error,
  },
  output: {
    status: output.status,
    videoPath: output.videoPath ?? '',
    localPath: output.localPath ?? '',
    videoUrl: output.videoUrl ?? '',
    completedAt: output.completedAt ?? '',
    lastPollAt: output.lastPollAt ?? '',
    error: output.error,
  },
}, null, 2))
