import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const filePath = join(process.cwd(), 'src', 'main', 'modules', 'clone', 'service.ts')
  const source = await readFile(filePath, 'utf8')

  assert.match(source, /await persistProjectProductRefsDirectly\(project, refs\)/)
  assert.match(source, /const refs = storyboardPrimaryProductRefs\(project\)/)
  assert.match(source, /return refs/)
  assert.match(source, /project\.sanitizedProductReferenceImagePaths = normalizedOriginals/)
  assert.doesNotMatch(source, /await sanitizeAndPersistProjectProductRefs\(project, refs\)/)

  console.log('clone product refs direct binding smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
