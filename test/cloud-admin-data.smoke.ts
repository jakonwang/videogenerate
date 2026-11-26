/**
 * 总后台「用户数据」冒烟测试：真实 HTTP 云端 + 假 AI 平台 + 临时数据库。
 * 覆盖：电脑端经 AI 代理的生成留记录（提示词、成功 / 失败、异步任务查询后补结果、缩略图）、
 * 超级管理员看用户数据汇总 / 同步记录 / 文件 / 全站生成记录、签名链接按 Range 播放、
 * 普通管理员无权查看、查看留操作日志。
 * 运行：npx tsx test/cloud-admin-data.smoke.ts
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCloudApp } from '../services/cloud/src/app'
import { MANAGED_SETTINGS_KEY } from '../services/cloud/src/service'
import { hashPassword, newId } from '../services/cloud/src/security'
import { extractOutput, extractPrompt, isPublicUrl } from '../services/cloud/src/generationLog'
import { CloudClientError, createCloudClient } from '../src/shared/cloud/client'
import { createDefaultManagedSettings } from '../src/shared/cloud/managedSettings'

const dir = mkdtempSync(join(tmpdir(), 'vg-admin-data-'))
const keyPath = join(dir, 'ent.pem')
writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())

const tasks = new Map<string, string>()
const upstream = http.createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    const parsed = body ? JSON.parse(body) : {}
    const p = new URL(req.url || '/', 'http://up.local').pathname
    const json = (status: number, payload: unknown) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(payload))
    }
    if (req.method === 'POST' && p === '/ve/v1/images/generations') {
      if (parsed.prompt === 'bad') return json(500, { error: { message: 'content blocked' } })
      return json(200, { data: [{ url: 'https://cdn.example.com/out.png' }] })
    }
    if (req.method === 'POST' && p === '/ve/v1/video/generations') {
      const id = `task-${tasks.size + 1}`
      tasks.set(id, 'processing')
      return json(200, { id, status: 'queued' })
    }
    const q = /^\/ve\/v1\/video\/generations\/([^/]+)$/.exec(p)
    if (q) {
      tasks.set(q[1], 'completed')
      return json(200, { id: q[1], status: 'completed', video_url: 'https://cdn.example.com/out.mp4' })
    }
    json(404, { error: 'nope' })
  })
})

let app: ReturnType<typeof createCloudApp>
const thumbSources: string[] = []

async function main() {
  // ---- 纯函数
  assert.equal(extractPrompt(Buffer.from(JSON.stringify({ model: 'x', prompt: '红色连衣裙' }))), '红色连衣裙')
  assert.equal(extractPrompt(Buffer.from(JSON.stringify({ model: 'x', messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: [{ type: 'text', text: '一只猫' }] }] }))), '一只猫')
  assert.equal(extractPrompt(Buffer.from(JSON.stringify({ contents: [{ parts: [{ text: '海边' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] }] }))), '海边')
  assert.deepEqual(extractOutput({ data: [{ url: 'https://a.com/x.png?sig=1' }] }, 'image'), { kind: 'url', url: 'https://a.com/x.png?sig=1', video: false })
  assert.equal(extractOutput({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'x'.repeat(200) } }] } }] }, 'image')?.kind, 'base64')
  assert.equal(await isPublicUrl('http://127.0.0.1/x.png'), false)
  assert.equal(await isPublicUrl('http://192.168.1.2/x.png'), false)
  assert.equal(await isPublicUrl('file:///etc/passwd'), false)
  console.log('  ✓ 提示词 / 产出解析，内网地址不截图')

  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const up = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
  app = createCloudApp(
    { dataDir: dir, dbPath: join(dir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true, isProduction: false },
    {
      genLogThumbnailer: async (source) => {
        thumbSources.push(source.kind === 'url' ? source.url : 'base64')
        return Buffer.from(`thumb-${thumbSources.length}`)
      },
    },
  )
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  const clientFor = () => {
    let token = ''
    const client = createCloudClient({ getBaseUrl: () => base, getToken: () => token })
    return { client, setToken: (t: string) => (token = t) }
  }

  // ---- 账号：超级管理员、普通管理员、用户 alice
  const now = Date.now()
  app.repo.insertUser({ id: newId('u'), account: 'owner@example.com', passwordHash: await hashPassword('owner-pass-123'), displayName: 'owner', role: 'super_admin', now })
  app.repo.insertUser({ id: newId('u'), account: 'staff@example.com', passwordHash: await hashPassword('staff-pass-123'), displayName: 'staff', role: 'admin', now })
  const ownerC = clientFor()
  ownerC.setToken((await ownerC.client.login({ account: 'owner@example.com', password: 'owner-pass-123', client: 'admin' })).sessionToken)
  const owner = ownerC.client
  const staffC = clientFor()
  staffC.setToken((await staffC.client.login({ account: 'staff@example.com', password: 'staff-pass-123', client: 'admin' })).sessionToken)

  await owner.admin.savePlan({ code: 'pro', name: '专业版', days: 30, amountFen: 100, maxDevices: 2, features: ['*'], credits: 100, quotas: { video: { mode: 'credits', freePerMonth: 0 }, image: { mode: 'credits', freePerMonth: 0 } } })
  await owner.admin.saveBillingDefaults({ points: { video: 10, image: 2 }, refundPerDay: 50 })
  const managed = createDefaultManagedSettings()
  managed.enabled = true
  managed.platforms.ai666 = { apiKey: 'sk-REAL', baseUrl: `${up}/ve` }
  managed.capabilities.video = { platform: 'ai666', model: 'veo3.1-fast' }
  managed.capabilities.image = { platform: 'ai666', model: 'gpt-image-1', quality: 'high' }
  app.repo.upsertConfig({ key: MANAGED_SETTINGS_KEY, value: managed, scope: 'private', description: '', updatedBy: null, now })

  const reg = clientFor()
  const registered = await reg.client.register({ account: 'alice@example.com', password: 'password-123' })
  reg.setToken(registered.sessionToken)
  const aliceId = registered.user.id
  await reg.client.mockPay((await reg.client.createOrder({ planCode: 'pro', channel: 'mock' })).order.orderNo)
  const desk = clientFor()
  desk.setToken((await desk.client.login({ account: 'alice@example.com', password: 'password-123', client: 'desktop', machineId: 'm-1' })).sessionToken)
  await desk.client.activateDevice({ machineId: 'm-1', deviceName: 'pc', platform: 'win32', appVersion: '9.9.9' })
  const proxyToken = (await desk.client.getManagedSettings('m-1')).proxyToken!
  const post = (path: string, body: unknown) =>
    fetch(`${base}/api/v1/ai-proxy/ai666${path}`, { method: 'POST', headers: { Authorization: `Bearer ${proxyToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const get = (path: string) => fetch(`${base}/api/v1/ai-proxy/ai666${path}`, { headers: { Authorization: `Bearer ${proxyToken}` } })

  // ---- 电脑端生成：图片成功、图片失败、视频异步任务
  assert.equal((await post('/v1/images/generations', { model: 'gpt-image-1', prompt: '白底连衣裙主图' })).status, 200)
  assert.equal((await post('/v1/images/generations', { model: 'gpt-image-1', prompt: 'bad' })).status, 500)
  const submitted = (await (await post('/v1/video/generations', { model: 'veo3.1-fast', prompt: '模特转身展示' })).json()) as { id: string }
  let logs = app.db.prepare('SELECT prompt, status, error, task_id, capability FROM ai_gen_logs ORDER BY created_at, rowid').all() as any[]
  assert.equal(logs.length, 3)
  assert.equal(logs.find((l) => l.prompt === '白底连衣裙主图').status, 'succeeded')
  assert.match(logs.find((l) => l.prompt === 'bad').error, /content blocked/)
  const video = logs.find((l) => l.capability === 'video')
  assert.equal(video.status, 'running')
  assert.equal(video.task_id, submitted.id)
  assert.equal((await get(`/v1/video/generations/${submitted.id}`)).status, 200)
  await app.genLog.idle()
  logs = app.db.prepare('SELECT prompt, status, output_url, thumb_file_id, capability FROM ai_gen_logs').all() as any[]
  const doneVideo = logs.find((l) => l.capability === 'video')
  assert.equal(doneVideo.status, 'succeeded')
  assert.equal(doneVideo.output_url, 'https://cdn.example.com/out.mp4')
  assert.ok(doneVideo.thumb_file_id, '视频有缩略图')
  assert.ok(logs.find((l) => l.prompt === '白底连衣裙主图').thumb_file_id, '图片有缩略图')
  assert.deepEqual(thumbSources.sort(), ['https://cdn.example.com/out.mp4', 'https://cdn.example.com/out.png'])
  console.log('  ✓ 电脑端生成留记录：提示词、失败原因、异步任务查询后补结果和缩略图')

  // ---- 网页 / 手机端数据：同步记录、文件、服务器生成任务
  const upload = await desk.client.sync.uploadFile(new Blob([Buffer.from('0123456789abcdef')]), 'video/mp4')
  await desk.client.sync.push([
    { collection: 'products', id: 'p1', updatedAt: now, deleted: false, data: { name: '碎花裙', images: [] } },
    { collection: 'products', id: 'p2', updatedAt: now, deleted: false, data: { name: '牛仔裤', images: [] } },
    { collection: 'assets', id: 'a1', updatedAt: now, deleted: false, data: { name: '开箱视频', fileId: upload.fileId } },
  ])
  await desk.client.sync.push([{ collection: 'products', id: 'p2', updatedAt: now + 10, deleted: true, data: null }])
  app.db
    .prepare('INSERT INTO ai_jobs (id, user_id, kind, status, input, output_file_id, output_mime, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('job-1', aliceId, 'video', 'succeeded', JSON.stringify({ kind: 'video', prompt: '手机端图生视频' }), upload.fileId, 'video/mp4', now - 1000, now)

  // ---- 普通管理员看不到
  for (const call of [() => staffC.client.admin.userDataSummary(aliceId), () => staffC.client.admin.listGenerations({})]) {
    await assert.rejects(call(), (error: unknown) => error instanceof CloudClientError && error.status === 403)
  }
  console.log('  ✓ 普通管理员无权查看用户数据')

  // ---- 超级管理员
  const { summary } = await owner.admin.userDataSummary(aliceId)
  assert.equal(summary.collections.find((c) => c.collection === 'products')?.count, 1)
  assert.equal(summary.collections.find((c) => c.collection === 'products')?.deleted, 1)
  assert.equal(summary.generations.proxy.total, 3)
  assert.equal(summary.generations.proxy.failed, 1)
  assert.equal(summary.generations.job.total, 1)
  assert.ok(summary.files.videos >= 1 && summary.files.images >= 2, '缩略图也是该用户的文件')

  const products = await owner.admin.userDataRecords(aliceId, { collection: 'products' })
  assert.deepEqual(products.items.map((r) => (r.data as any).name), ['碎花裙'])
  const withDeleted = await owner.admin.userDataRecords(aliceId, { collection: 'products', includeDeleted: '1' })
  assert.equal(withDeleted.total, 2)
  assert.equal((await owner.admin.userDataRecords(aliceId, { collection: 'products', keyword: '碎花' })).total, 1)
  assert.equal((await owner.admin.userDataFiles(aliceId, { kind: 'video' })).total, 1)

  const all = await owner.admin.listGenerations({})
  assert.equal(all.total, 4)
  assert.deepEqual([...new Set(all.items.map((g) => g.source))].sort(), ['job', 'proxy'])
  assert.equal((await owner.admin.listGenerations({ source: 'proxy', status: 'failed' })).items[0].error.includes('content blocked'), true)
  assert.equal((await owner.admin.listGenerations({ kind: 'video' })).total, 2)
  assert.equal((await owner.admin.listGenerations({ keyword: '连衣裙' })).total, 1)
  assert.equal((await owner.admin.listGenerations({ userId: 'nobody' })).total, 0)
  console.log('  ✓ 超级管理员看汇总、同步记录（含已删除）、文件、全站生成记录和筛选')

  // ---- 签名链接：流式 + Range
  const { links } = await owner.admin.fileLinks([{ userId: aliceId, fileId: upload.fileId }, { userId: aliceId, fileId: 'f'.repeat(64) }])
  const link = links[`${aliceId}:${upload.fileId}`]
  assert.ok(link && !links[`${aliceId}:${'f'.repeat(64)}`])
  const full = await fetch(`${base}${link}`)
  assert.equal(full.status, 200)
  assert.equal(await full.text(), '0123456789abcdef')
  const part = await fetch(`${base}${link}`, { headers: { Range: 'bytes=4-7' } })
  assert.equal(part.status, 206)
  assert.equal(part.headers.get('content-range'), 'bytes 4-7/16')
  assert.equal(await part.text(), '4567')
  assert.equal((await fetch(`${base}${link.replace(/s=[a-f0-9]+/, 's=00')}`)).status, 403)
  console.log('  ✓ 文件签名链接支持 Range（视频可拖动），篡改无效')

  const audit = await owner.admin.listAudit({ keyword: 'admin.userdata.view' })
  assert.ok(audit.items.some((entry) => entry.target === aliceId), '查看用户数据留痕')
  console.log('  ✓ 查看用户数据写进操作日志')

  console.log('\ncloud admin-data smoke passed')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    upstream.close()
    try {
      await app?.close()
    } catch {
      // ignore
    }
    rmSync(dir, { recursive: true, force: true })
  })
