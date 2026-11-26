import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-lp-prompt-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, 'data')
  await mkdir(join(root, 'data', 'db'), { recursive: true })
  const { DEFAULT_LIVE_PHOTO_VIDEO_PROMPT, GENTLE_LIVE_PHOTO_VIDEO_PROMPT_ID, isStillLivePhotoVideoPrompt, fillLivePhotoVideoPrompt, livePhotoPromptVersionService } = await import('../src/main/modules/live-photo/promptVersions')
  const short = 'Create a realistic six-second product close-up video with subtle natural motion while preserving the exact product identity and composition.'

  // 默认就是真正在用的完整提示词；旧的占位短句读出来自动换成它
  assert.equal(livePhotoPromptVersionService.getActive('video').prompt, DEFAULT_LIVE_PHOTO_VIDEO_PROMPT)
  const old = livePhotoPromptVersionService.save({ name: 'old', prompt: short, kind: 'video' })
  livePhotoPromptVersionService.activate(old.id)
  assert.equal(livePhotoPromptVersionService.getActive('video').prompt, DEFAULT_LIVE_PHOTO_VIDEO_PROMPT)
  assert.ok(DEFAULT_LIVE_PHOTO_VIDEO_PROMPT.startsWith('ROLE:') && DEFAULT_LIVE_PHOTO_VIDEO_PROMPT.length > 7000)

  // 自己写的会真的用上，商品特征照样带上
  const mine = livePhotoPromptVersionService.save({ name: 'mine', prompt: 'Slow push-in.', kind: 'video' })
  livePhotoPromptVersionService.activate(mine.id)
  assert.equal(livePhotoPromptVersionService.getActive('video').prompt, 'Slow push-in.')
  // 没写 {product_rules} 就原样发送，不在后面追加系统文字
  assert.equal(fillLivePhotoVideoPrompt('Slow push-in.', 'RULES'), 'Slow push-in.')
  assert.equal(fillLivePhotoVideoPrompt('a\n\n{product_rules}\n\nb', 'RULES'), 'a\n\nRULES\n\nb')
  assert.equal(fillLivePhotoVideoPrompt('a\n\n{product_rules}\n\nb', ''), 'a\n\nb')
  // 短版：自带一条、默认不启用；改过之后不会被盖回去
  const versions = livePhotoPromptVersionService.list('video')
  const gentle = versions.find((item) => item.id === GENTLE_LIVE_PHOTO_VIDEO_PROMPT_ID)!
  assert.deepEqual([gentle.active, versions.filter((item) => item.id === gentle.id).length, versions.filter((item) => item.active).length], [false, 1, 1])
  assert.equal(new Set(versions.map((item) => item.version)).size, versions.length)
  assert.ok(gentle.prompt.includes('{product_rules}') && gentle.prompt.length < 2000)
  livePhotoPromptVersionService.save({ id: gentle.id, name: gentle.name, prompt: 'changed', kind: 'video' })
  assert.equal(livePhotoPromptVersionService.list('video').find((item) => item.id === gentle.id)!.prompt, 'changed')
  assert.deepEqual([isStillLivePhotoVideoPrompt(DEFAULT_LIVE_PHOTO_VIDEO_PROMPT), isStillLivePhotoVideoPrompt(gentle.prompt)], [true, false])
  // 图片提示词不受影响
  assert.match(livePhotoPromptVersionService.getActive('image').prompt, /Replace the product in Image 1/)
  console.log('live photo video prompt smoke ok')
  process.exit(0)
}
void main().catch((error) => { console.error(error); process.exit(1) })
