/**
 * 网页交给电脑的调用里带着服务器引擎的文件（发布中心选「复刻成片」）：先换成云端文件引用，电脑才能下载；
 * 电脑自己的路径、普通文字原样不动，同一个文件只上传一次。
 */
import assert from 'node:assert/strict'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { engineFilesToCloudRefs } from '../services/cloud/src/cloneEngine'

const root = resolve(join(tmpdir(), 'clone-engine', 'u1'))
const finalVideo = join(root, 'data', 'viral-clone', 'p1', 'final.mp4')
const published: string[] = []
const engine = {
  ownsPath: (_userId: string, path: unknown) => {
    const full = resolve(String(path))
    return full === root || full.startsWith(root + sep)
  },
  call: async (_userId: string, ns: string, method: string, args: unknown[]) => {
    assert.equal(`${ns}.${method}`, 'media.publish')
    published.push((args[0] as { path: string }).path)
    return { result: { fileId: 'f123', mime: 'video/mp4' } }
  },
}

async function main() {
  const desktopPath = process.platform === 'win32' ? 'C:\\Users\\me\\Videos\\a.mp4' : '/home/me/a.mp4'
  const args = [{ paths: [finalVideo, desktopPath, 'cloudfile:abc/x.mp4'], defaults: { videoTitle: '标题' } }, { again: finalVideo }]
  const out = (await engineFilesToCloudRefs(engine as never, 'u1', args)) as typeof args
  assert.deepEqual(out[0]!.paths, ['cloudfile:f123/final.mp4', desktopPath, 'cloudfile:abc/x.mp4'])
  assert.deepEqual(out[0]!.defaults, { videoTitle: '标题' })
  assert.equal(out[1]!.again, 'cloudfile:f123/final.mp4')
  assert.deepEqual(published, [finalVideo], 'the same file is uploaded once')
  console.log('cloud-engine-files-to-desktop smoke ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
