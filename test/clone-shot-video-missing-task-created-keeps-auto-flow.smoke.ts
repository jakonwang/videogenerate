import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const filePath = join(process.cwd(), 'src', 'main', 'modules', 'clone', 'service.ts')
  const source = await readFile(filePath, 'utf8')

  assert.match(source, /status: 'submitting'/)
  assert.match(source, /已锁定等待远端回写，期间不会重复创建视频任务/)
  assert.match(source, /isShotVideoSubmitStartedEvent\(output\.sourceEvent\)/)
  assert.match(source, /isShotVideoSubmitStartedEvent\(item\.sourceEvent\)/)
  assert.match(source, /resolvePendingRemoteState\(output\.remoteStatus, output\.remoteRaw\)/)
  assert.match(source, /resolvePendingRemoteState\(item\.remoteStatus, item\.remoteRaw\)/)

  console.log('clone shot video missing task created keeps auto flow smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
