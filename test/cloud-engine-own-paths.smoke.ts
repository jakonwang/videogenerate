/**
 * 服务器复刻引擎的路径检查：网页传来的路径只能落在用户自己的目录里，
 * ffmpeg 的协议写法（concat: / subfile: / file://localhost/…）也不能拿来读服务器文件。
 */
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertOwnPaths } from '../services/cloud/engine/ownPaths'

const root = join(tmpdir(), 'vg-own-paths', 'user-a')
const own = join(root, 'data', 'ref.mp4')
const denied = /只能使用自己上传的文件/

// 自己目录里的路径、普通文案、网址都放行
for (const ok of [
  own,
  pathToFileURL(own).href,
  { nested: [own, { title: '标题', script: 'Data: 50% off, tcp: fast' }] },
  'https://cdn.example.com/a.jpg',
  'data:image/png;base64,AAAA',
  'cloudfile:abc123/ref.mp4',
  'pipe:0',
  'hook',
]) {
  assert.doesNotThrow(() => assertOwnPaths(ok, root), JSON.stringify(ok))
}

const outside = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd'
const outsideUrl = pathToFileURL(outside).href
for (const bad of [
  outside,
  join(root, '..', 'user-b', 'data', 'x.mp4'),
  `${own}/../../../../cloud.sqlite`,
  outsideUrl,
  outsideUrl.replace('file:///', 'file://localhost/'),
  `${pathToFileURL(root).href}/%2e%2e/%2e%2e/cloud.sqlite`,
  'file://evil-host/share/x.mp4',
  `concat:${outside}|${own}`,
  `subfile,,start,0,end,0,,:${outside}`,
  `cache:file:${outside}`,
  `CONCAT:${outside}`,
  `crypto:${outside}`,
  'tcp://169.254.169.254:80/',
  [{ deep: { list: ['ok', outside] } }],
]) {
  assert.throws(() => assertOwnPaths(bad, root), denied, JSON.stringify(bad))
}

console.log('cloud engine own-paths smoke test passed')
