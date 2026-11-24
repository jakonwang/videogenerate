import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { dedupeUserFiles } from '../services/cloud/src/dedupe'
import { replaceWithLink } from '../src/main/modules/live-photo/linkFile'

/** 云端合并重复文件：只合并同一用户、内容一致、允许的文件；内容和路径都不变 */
async function main() {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-dedupe-'))
  const old = new Date(Date.now() - 3 * 60 * 60_000)
  const put = (path: string, body: Buffer, at = old) => {
    const full = join(dataDir, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, body)
    utimesSync(full, at, at)
    return full
  }
  const ino = (path: string) => statSync(path, { bigint: true }).ino
  const image = randomBytes(80_000)
  const sameSize = randomBytes(80_000)
  const video = randomBytes(120_000)
  const sha = createHash('sha256').update(image).digest('hex')
  const task = 'clone-engine/u_1/data/plugin-live-photo/a'
  try {
    const blob = put(`files/u_1/${sha}`, image)
    const still = put(`${task}/still.png`, image)
    const live = put(`${task}/live-photo.jpg`, image)
    const generated = put(`${task}/generated-still/localized-replacement-r1-1795486835310-x.png`, image)
    const motion = put(`${task}/motion.mp4`, video)
    const generatedVideo = put(`${task}/generated-video/vectorengine_video_1795487624874_x.mp4`, video)
    const lookalike = put('clone-engine/u_1/data/plugin-live-photo/b/still.png', sameSize)
    const poster = put(`${task}/poster.jpg`, image)
    const preview = put(`${task}/preview.mp4`, video)
    const elsewhere = put('clone-engine/u_1/data/viral-clone/p/frame_1795486835310.png', image)
    const fresh = put('clone-engine/u_1/data/plugin-live-photo/c/still.png', image, new Date())
    const other = put('clone-engine/u_2/data/plugin-live-photo/a/still.png', image)
    const otherBlob = put('files/u_3/' + sha, image)

    const first = await dedupeUserFiles(dataDir)
    assert.equal(first.merged, 4)
    assert.equal(first.bytes, 80_000 * 3 + 120_000)
    for (const path of [still, live, generated]) assert.equal(ino(path), ino(blob))
    assert.equal(ino(motion), ino(generatedVideo))
    // 会被原地改写的、别的目录的、还没写完的、别人的，都不动
    for (const path of [poster, elsewhere, fresh, other, otherBlob, lookalike]) assert.equal(statSync(path).nlink, 1, path)
    assert.equal(statSync(preview).nlink, 1)
    for (const path of [blob, still, live, generated, poster, elsewhere, fresh, other]) assert.deepEqual(readFileSync(path), image)
    for (const path of [motion, generatedVideo, preview]) assert.deepEqual(readFileSync(path), video)
    assert.deepEqual(readFileSync(lookalike), sameSize)
    assert.equal(readdirSync(dataDir, { recursive: true }).filter((name) => String(name).endsWith('.dedupe')).length, 0)

    // 再跑一次没有事情可做；删掉一份不影响其他
    assert.deepEqual(await dedupeUserFiles(dataDir), { merged: 0, bytes: 0 })
    rmSync(blob)
    assert.deepEqual(readFileSync(still), image)
    // 新同步上来的同内容文件，并回已有的那一组
    const again = put(`files/u_1/${sha}`, image)
    assert.equal((await dedupeUserFiles(dataDir)).merged, 3)
    assert.equal(ino(again), ino(still))

    // 实况图写文件：云端链接、先删后写；不会连带改到共用内容的文件；电脑端照常复制
    const root = join(dataDir, 'clone-engine/u_1/data/plugin-live-photo')
    process.env.VIDEOGENERATE_CLONE_ENGINE = '1'
    const next = put(`${task}/generated-still/localized-replacement-r1-1795486999999-y.png`, sameSize)
    await replaceWithLink(next, still, root)
    assert.equal(ino(still), ino(next))
    assert.deepEqual(readFileSync(live), image)
    assert.deepEqual(readFileSync(again), image)
    await replaceWithLink(still, still, root)
    assert.deepEqual(readFileSync(still), sameSize)
    for (const source of [preview, elsewhere]) {
      await replaceWithLink(source, live, root)
      assert.notEqual(ino(live), ino(source))
      assert.deepEqual(readFileSync(live), readFileSync(source))
    }
    assert.deepEqual(readFileSync(again), image)
    delete process.env.VIDEOGENERATE_CLONE_ENGINE
    const copied = join(root, 'a', 'copied.png')
    await replaceWithLink(next, copied, root)
    assert.notEqual(ino(copied), ino(next))
    console.log('cloud-dedupe smoke ok')
  } finally {
    rmSync(dataDir, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
