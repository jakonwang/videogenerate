import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const filePath = join(process.cwd(), 'src', 'main', 'modules', 'clone', 'unifiedVideo.ts')
  const source = await readFile(filePath, 'utf8')
  const servicePath = join(process.cwd(), 'src', 'main', 'modules', 'clone', 'service.ts')
  const serviceSource = await readFile(servicePath, 'utf8')

  assert.match(source, /json\?\.id/)
  assert.match(source, /json\?\.uuid/)
  assert.match(source, /json\?\.data\?\.record_id/)
  assert.match(source, /const taskId = String\(candidate \?\? ''\)\.trim\(\)/)
  assert.match(source, /if \(taskId\) return taskId/)
  assert.match(serviceSource, /function pickRecoverableTaskHandle/)
  assert.match(serviceSource, /shot-video-reconcile:recovered-task-handle-from-raw/)

  console.log('clone shot video pick task id top level id smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
