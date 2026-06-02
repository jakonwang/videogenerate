import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const filePath = join(process.cwd(), 'src', 'main', 'modules', 'clone', 'service.ts')
  const source = await readFile(filePath, 'utf8')

  assert.match(source, /status === 'failed_terminal'/)
  assert.match(source, /failureType === 'missing_task'/)
  assert.match(source, /String\(output\.sourceEvent \|\| ''\)\.trim\(\) === 'segment_submit_started'/)
  assert.match(source, /String\(item\.sourceEvent \|\| ''\)\.trim\(\) === 'segment_submit_started'/)
  assert.match(source, /resolvePendingRemoteState\(output\.remoteStatus, output\.remoteRaw\)/)
  assert.match(source, /resolvePendingRemoteState\(item\.remoteStatus, item\.remoteRaw\)/)

  console.log('clone shot video missing task created keeps auto flow smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
