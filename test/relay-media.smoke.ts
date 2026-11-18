/**
 * 电脑代办 · 本地媒体：网页显示电脑端页面里的本地图片 / 视频。
 * 只放行软件数据目录；带宽度时图片给缩略图、视频给封面；同一文件不重复上传。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publishLocalMedia, type RelayMediaDeps } from '../src/main/modules/cloud-sync/relayMedia'

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'vg-relay-media-'))
  const data = join(root, 'data')
  mkdirSync(join(data, 'clone'), { recursive: true })
  writeFileSync(join(data, 'clone', 'frame.png'), Buffer.from('png-bytes'))
  writeFileSync(join(data, 'clone', 'shot.mp4'), Buffer.from('mp4-bytes'))
  writeFileSync(join(root, 'secret.png'), Buffer.from('nope'))
  const uploads: Array<{ mime: string; body: string }> = []
  const deps: RelayMediaDeps = {
    roots: () => [data],
    upload: async (body, mime) => {
      uploads.push({ mime, body: body.toString() })
      return { fileId: `f${uploads.length}` }
    },
    readFile: async (path) => Buffer.from(require('node:fs').readFileSync(path)),
    imageThumb: async () => {
      writeFileSync(join(root, 'thumb.webp'), Buffer.from('thumb'))
      return join(root, 'thumb.webp')
    },
    videoPoster: async () => {
      writeFileSync(join(root, 'poster.jpg'), Buffer.from('poster'))
      return join(root, 'poster.jpg')
    },
  }
  await assert.rejects(publishLocalMedia(deps, { path: join(root, 'secret.png') }), /数据目录/, 'files outside the data folder are refused')
  await assert.rejects(publishLocalMedia(deps, { path: join(data, 'clone', '..', '..', 'secret.png') }), /数据目录/, 'no escaping with ..')
  const full = await publishLocalMedia(deps, { path: join(data, 'clone', 'frame.png') })
  assert.deepEqual(full, { fileId: 'f1', mime: 'image/png' })
  const thumb = await publishLocalMedia(deps, { path: join(data, 'clone', 'frame.png'), width: 320 })
  assert.equal(thumb.mime, 'image/webp')
  assert.equal(uploads[1]!.body, 'thumb')
  const poster = await publishLocalMedia(deps, { path: join(data, 'clone', 'shot.mp4'), width: 200 })
  assert.equal(poster.mime, 'image/jpeg', 'video cards get a poster, not the whole video')
  const video = await publishLocalMedia(deps, { path: join(data, 'clone', 'shot.mp4') })
  assert.equal(video.mime, 'video/mp4')
  const again = await publishLocalMedia(deps, { path: join(data, 'clone', 'shot.mp4') })
  assert.equal(again.fileId, video.fileId)
  assert.equal(uploads.length, 4, 'the same file is uploaded once')
  console.log('relay media smoke: ok')
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
