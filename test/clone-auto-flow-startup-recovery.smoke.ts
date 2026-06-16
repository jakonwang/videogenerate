import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const filePath = join(process.cwd(), 'src', 'main', 'modules', 'clone', 'service.ts')
  const source = await readFile(filePath, 'utf8')

  assert.match(source, /function isBackgroundAutoRunRecoverable\(project: CloneProject\)/)
  assert.match(source, /function resolveAutoRunModelIdentityId\(project: CloneProject\): string/)
  assert.match(source, /async function scheduleStartupCloneAutoFlowRecovery\(service: any, project: CloneProject, delayMs: number, reason: string\)/)
  assert.match(source, /const AUTO_FLOW_PROJECT_QUEUE_CONCURRENCY = 2/)
  assert.match(source, /const AUTO_FLOW_PROJECT_REQUEUE_COOLDOWN_MS = 12_000/)
  assert.match(source, /const autoFlowProjectQueue = new PQueue\(\{ concurrency: AUTO_FLOW_PROJECT_QUEUE_CONCURRENCY \}\)/)
  assert.match(source, /function enqueueBackgroundAutoRunIfReady\(service: any, projectId: string, reason: string\)/)
  assert.match(source, /background-auto-run:cooldown-skip/)
  assert.match(source, /const resolvedModelIdentityId = resolveAutoRunModelIdentityId\(project\)/)
  assert.match(source, /resumableAutoFlowProjects = projects/)
  assert.match(source, /startup-resume-auto-flow-dispatch/)
  assert.match(source, /startup_auto_flow_resume/)

  console.log('clone auto flow startup recovery smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
