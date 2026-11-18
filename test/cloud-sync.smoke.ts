/**
 * 多端同步冒烟测试：真实 HTTP 服务 + 临时数据库。
 * 覆盖：手机端登录、记录推送 / 增量拉取、最后写入者胜、墓碑删除、文件上传去重与下载、用户隔离。
 * 运行：npx tsx test/cloud-sync.smoke.ts
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { createCloudApp } from '../services/cloud/src/app'

const dir = mkdtempSync(join(tmpdir(), 'vg-cloud-sync-'))
const keyPath = join(dir, 'ent.pem')
writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())

async function main() {
const app = createCloudApp({ dataDir: dir, dbPath: join(dir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true })
await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/v1`

async function call(method: string, path: string, token: string | null, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
  })
  const type = res.headers.get('content-type') || ''
  return { status: res.status, json: type.includes('json') ? await res.json() : null, bytes: type.includes('json') ? null : new Uint8Array(await res.arrayBuffer()), headers: res.headers }
}

async function account(name: string) {
  await call('POST', '/auth/register', null, { account: `${name}@example.com`, password: 'password-123' })
  const login = await call('POST', '/auth/login', null, { account: `${name}@example.com`, password: 'password-123', client: 'mobile', machineId: `${name}-phone` })
  assert.equal(login.status, 200, JSON.stringify(login.json))
  return login.json.sessionToken as string
}

async function subscribe(token: string) {
  const plans = await call('GET', '/plans', null)
  const order = await call('POST', '/orders', token, { planCode: plans.json.plans[0].code, channel: 'mock' })
  assert.equal((await call('POST', `/orders/${order.json.order.orderNo}/mock-pay`, token)).json.order.status, 'paid')
}

try {
  let alice = await account('alice')
  const bob = await account('bob')

  assert.equal((await call('GET', '/sync/changes', null)).status, 401)

  // writes need an active membership; reads do not
  assert.equal((await call('POST', '/sync/push', alice, { changes: [{ collection: 'products', id: 'x', updatedAt: 1, data: {} }] })).status, 402)
  assert.equal((await call('PUT', '/files', alice, new Uint8Array([1]), { 'Content-Type': 'image/png' })).status, 402)
  assert.equal((await call('GET', '/sync/changes?since=0', alice)).status, 200)
  await subscribe(alice)

  // push + pull
  const push = await call('POST', '/sync/push', alice, {
    changes: [
      { collection: 'products', id: 'p1', updatedAt: 1000, data: { name: '耳环 A' } },
      { collection: 'models', id: 'm1', updatedAt: 1000, data: { name: '模特 A' } },
    ],
  })
  assert.equal(push.status, 200, JSON.stringify(push.json))
  assert.equal(push.json.applied.length, 2)
  let pull = await call('GET', '/sync/changes?since=0', alice)
  assert.equal(pull.json.changes.length, 2)
  const cursor = pull.json.cursor
  assert.equal((await call('GET', '/sync/changes?since=0&collections=models', alice)).json.changes.length, 1)

  // older write loses and is reported as a conflict carrying the current record
  const stale = await call('POST', '/sync/push', alice, { changes: [{ collection: 'products', id: 'p1', updatedAt: 500, data: { name: 'old' } }] })
  assert.equal(stale.json.applied.length, 0)
  assert.equal(stale.json.conflicts[0].data.name, '耳环 A')

  // newer write wins; incremental pull sees only it
  await call('POST', '/sync/push', alice, { changes: [{ collection: 'products', id: 'p1', updatedAt: 2000, data: { name: '耳环 B' } }] })
  pull = await call('GET', `/sync/changes?since=${cursor}`, alice)
  assert.deepEqual(pull.json.changes.map((c: any) => c.data.name), ['耳环 B'])

  // tombstone
  await call('POST', '/sync/push', alice, { changes: [{ collection: 'models', id: 'm1', updatedAt: 3000, deleted: true }] })
  pull = await call('GET', `/sync/changes?since=${pull.json.cursor}`, alice)
  assert.equal(pull.json.changes[0].deleted, true)
  assert.equal(pull.json.changes[0].data, null)

  // paging
  const many = Array.from({ length: 30 }, (_, i) => ({ collection: 'products', id: `bulk-${i}`, updatedAt: 5000, data: { i } }))
  await call('POST', '/sync/push', alice, { changes: many })
  const page = await call('GET', '/sync/changes?since=0&limit=10', alice)
  assert.equal(page.json.changes.length, 10)
  assert.equal(page.json.hasMore, true)

  // validation
  assert.equal((await call('POST', '/sync/push', alice, { changes: [{ collection: 'Bad Name', id: 'x', updatedAt: 1 }] })).status, 400)

  // isolation
  assert.equal((await call('GET', '/sync/changes?since=0', bob)).json.changes.length, 0)

  // files: upload, dedupe, download, isolation, type check
  const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])
  const up = await call('PUT', '/files', alice, image, { 'Content-Type': 'image/png' })
  assert.equal(up.status, 200, JSON.stringify(up.json))
  assert.match(up.json.fileId, /^[a-f0-9]{64}$/)
  assert.equal((await call('PUT', '/files', alice, image, { 'Content-Type': 'image/png' })).json.fileId, up.json.fileId)
  const down = await call('GET', `/files/${up.json.fileId}`, alice)
  assert.equal(down.status, 200)
  assert.equal(down.headers.get('content-type'), 'image/png')
  assert.deepEqual(Array.from(down.bytes!), Array.from(image))
  assert.equal((await call('GET', `/files/${up.json.fileId}`, bob)).status, 404)
  assert.equal((await call('PUT', '/files', alice, image, { 'Content-Type': 'application/x-msdownload' })).status, 400)

  // device slots: computers and phones are counted separately; a new phone replaces the old one
  const activate = (token: string, machineId: string, platform: string) => call('POST', '/devices/activate', token, { machineId, platform, deviceName: machineId })
  assert.equal((await activate(alice, 'pc-1', 'win32')).status, 200)
  const secondPc = await activate(alice, 'pc-2', 'win32')
  assert.equal(secondPc.status, 409)
  assert.match(secondPc.json.error, /电脑/)
  assert.equal((await activate(alice, 'alice-phone', 'android')).status, 200, 'phone does not use the computer slot')
  const plans = await call('GET', '/plans', null)
  assert.equal(plans.json.maxMobileDevices, 1)
  const newPhone = (await call('POST', '/auth/login', null, { account: 'alice@example.com', password: 'password-123', client: 'mobile', machineId: 'alice-phone-2' })).json.sessionToken
  assert.equal((await activate(newPhone, 'alice-phone-2', 'android')).status, 200, 'new phone takes over')
  assert.equal((await call('GET', '/sync/changes?since=0', alice)).status, 401, 'old phone session is signed out')
  const devices = (await call('GET', '/me', newPhone)).json.devices as Array<{ machineId: string; kind: string }>
  assert.deepEqual(devices.map((d) => `${d.kind}:${d.machineId}`).sort(), ['computer:pc-1', 'mobile:alice-phone-2'])
  alice = newPhone

  const usage = await call('GET', '/sync/usage', alice)
  assert.equal(usage.json.fileBytes, image.length)

  console.log('cloud sync smoke: ok')
} finally {
  app.server.close()
  app.db.close()
  rmSync(dir, { recursive: true, force: true })
}
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
