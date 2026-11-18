/**
 * ELECTRON_RUN_AS_NODE=1 npx electron --import tsx test/ass-caption-chunk.smoke.ts
 */
import assert from 'node:assert/strict'

async function main() {
  const { chunkTimedCaption } = await import('../src/main/modules/subtitle/ass')
  const en = chunkTimedCaption('Look how clean the details are up close. I wear it every day and it still looks new.', 1, 6)
  console.log(en)
  assert.ok(en.length >= 3)
  assert.equal(en[0]!.start, 1)
  assert.equal(en[en.length - 1]!.end, 6)
  assert.ok(en.every((c) => c.text.length <= 26))
  const zh = chunkTimedCaption('近看细节做工非常细致，日常用了很久依然很新，简约设计但很显高级。', 0, 5)
  console.log(zh)
  assert.ok(zh.length >= 2 && zh.every((c) => [...c.text].length <= 13))
  assert.deepEqual(chunkTimedCaption('Short one.', 0, 1), [{ text: 'Short one.', start: 0, end: 1 }])
  console.log('chunk ok')
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
