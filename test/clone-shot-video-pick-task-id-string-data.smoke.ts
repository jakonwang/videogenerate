import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const filePath = join(process.cwd(), 'src', 'main', 'modules', 'clone', 'unifiedVideo.ts')
  const source = await readFile(filePath, 'utf8')

  assert.match(source, /typeof json\?\.data === 'string'/)
  assert.match(source, /const candidates = \[/)
  assert.match(source, /json\?\.id/)
  assert.match(source, /for \(const candidate of candidates\)/)
  assert.doesNotMatch(source, /directDataValue \?\?/)

  console.log('clone shot video pick task id string data smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
