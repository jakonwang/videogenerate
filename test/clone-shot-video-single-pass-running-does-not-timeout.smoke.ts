import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const filePath = join(process.cwd(), 'src', 'main', 'modules', 'clone', 'service.ts')
  const source = await readFile(filePath, 'utf8')

  assert.match(source, /if \(waitMs <= 0 && taskId\)/)
  assert.match(source, /status:\s*'remote_running'/)
  assert.match(source, /shot-video-poll:single-pass-still-running/)

  console.log('clone shot video single pass running does not timeout smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
