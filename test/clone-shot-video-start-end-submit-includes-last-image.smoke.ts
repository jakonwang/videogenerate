import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const servicePath = join(process.cwd(), 'src', 'main', 'modules', 'clone', 'service.ts')
  const source = await readFile(servicePath, 'utf8')

  const ensureSegmentTaskBlockMatch = source.match(
    /async function ensureAi666SegmentVideoTask[\s\S]*?const created = await createAi666VideoTask\(\{([\s\S]*?)\}\)/,
  )
  assert.ok(ensureSegmentTaskBlockMatch, '未找到 ensureAi666SegmentVideoTask 的提交代码块')

  const submitBlock = ensureSegmentTaskBlockMatch[1]
  assert.match(submitBlock, /lastImage:\s*uploadedLastFrameImage/)
  assert.doesNotMatch(submitBlock, /lastImage:\s*undefined/)

  assert.match(source, /uploadedLastFrameImage/)
  assert.match(source, /hasLastFramePath:\s*Boolean\(input\.lastFramePath\)/)
  assert.match(source, /lastImageSent:\s*Boolean\(uploadedLastFrameImage\)/)

  console.log('clone shot video start-end submit includes last image smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
