import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const gptImagePath = join(process.cwd(), 'src', 'main', 'modules', 'clone', 'gptImage.ts')
  const providersPath = join(process.cwd(), 'src', 'main', 'modules', 'clone', 'providers.ts')
  const gptImageSource = await readFile(gptImagePath, 'utf8')
  const providersSource = await readFile(providersPath, 'utf8')

  assert.match(gptImageSource, /json\?\.data\?\.record_id/)
  assert.match(gptImageSource, /json\?\.data\?\.trace_id/)
  assert.match(gptImageSource, /json\?\.uuid/)
  assert.match(providersSource, /json\?\.data\?\.record_id/)
  assert.match(providersSource, /json\?\.data\?\.trace_id/)
  assert.match(providersSource, /json\?\.uuid/)

  console.log('clone storyboard image pick task id fallbacks smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
