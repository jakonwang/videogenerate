import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildStyleReferenceMotionPrompt } from '../src/main/modules/style-reference/service'

const look = {
  camera: 'close-up, slow push-in, eye level',
  action: 'model turns head slightly to show the earring',
  lighting: 'hard side light, crisp metal highlights',
  background: 'dark velvet',
  style: 'premium macro jewelry close-up',
}

const twoFrames = buildStyleReferenceMotionPrompt({ ...look, durationSec: 9.6, hasLastFrame: true })
assert.match(twoFrames, /10-second shot/)
assert.match(twoFrames, /Camera: close-up, slow push-in, eye level\./)
assert.match(twoFrames, /Lighting: hard side light/)
assert.match(twoFrames, /second image is the exact closing frame/)
assert.match(twoFrames, /Keep the product identical in every frame/)

const oneFrame = buildStyleReferenceMotionPrompt({ ...look, durationSec: 6, hasLastFrame: false })
assert.doesNotMatch(oneFrame, /closing frame/)
assert.match(oneFrame, /Start exactly on the given image/)

const empty = buildStyleReferenceMotionPrompt({ camera: '', action: '', lighting: '', background: '', style: '', durationSec: 5, hasLastFrame: false })
assert.match(empty, /Camera: follow the framing of the first frame/)
assert.doesNotMatch(empty, /Lighting:|Background:|Action:/)

// 图生视频: the template branch must not reuse the default near-static negatives that ban camera moves.
const livePhoto = readFileSync('src/main/modules/live-photo/service.ts', 'utf-8')
const branch = livePhoto.slice(livePhoto.indexOf('function buildStyleReferenceLivePhotoVideoPrompts'), livePhoto.indexOf('function buildLivePhotoVideoPrompts'))
assert.ok(branch.length > 0)
assert.doesNotMatch(branch, /'camera orbit'|'rapid push in'|'handheld sway'/)
assert.match(livePhoto, /if \(input\.item\.styleReference\) return buildStyleReferenceLivePhotoVideoPrompts/)

console.log('style reference smoke test passed')
