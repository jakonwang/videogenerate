/**
 * 云端 AI 代理冒烟测试：真实 HTTP 云端 + 假的 AI 平台服务器 + 临时数据库。
 * 覆盖：下发的设置不含任何密钥、代理令牌鉴权（退出 / 解绑 / 伪造立即失效）、平台只看到后台 Key、
 * 视频 / 图片提交在云端扣点、平台报错退点、查询进度时看到失败退点 / 成功确认、拿别的任务号骗退点无效、
 * 查询与普通对话不扣点、对话里用图片模型扣点、流式转发、未知接口与敏感接口被拒、
 * 电脑端真实适配器（grsai）走代理、七牛单次上传凭证、TikHub 代理。
 * 运行：npm run test:cloud-ai-proxy
 */
import assert from 'node:assert/strict'
import { createHmac, generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCloudApp } from '../services/cloud/src/app'
import { classifyProxyRequest, extractModelCandidates } from '../services/cloud/src/aiProxy'
import { MANAGED_SETTINGS_KEY } from '../services/cloud/src/service'
import { hashPassword, newId } from '../services/cloud/src/security'
import { CloudClientError, createCloudClient } from '../src/shared/cloud/client'
import { applyManagedSettings, createDefaultManagedSettings, toProxiedManagedSettings } from '../src/shared/cloud/managedSettings'
import { normalizeCredentials } from '../src/main/modules/clone/credentials'
import { createGrsVideoTask, queryGrsTask } from '../src/main/modules/clone/grsai'
import { setQiniuUploadGrantProvider, uploadToQiniu } from '../src/main/modules/clone/qiniu'
import { setTikhubBaseUrlOverride, tikhubFetchOneUrl } from '../src/main/modules/video-parser-download/tikhub'

const dir = mkdtempSync(join(tmpdir(), 'vg-ai-proxy-'))
const keyPath = join(dir, 'ent.pem')
writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())

/* ------------------------------------------------------------------ 假平台 */

type Seen = { method: string; path: string; auth: string; xApiKey: string; body: string }
const seen: Seen[] = []
const taskStatus = new Map<string, string>()
let taskSeq = 0

const upstream = http.createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    const url = new URL(req.url || '/', 'http://up.local')
    seen.push({ method: req.method || '', path: `${url.pathname}${url.search}`, auth: String(req.headers.authorization || ''), xApiKey: String(req.headers['x-api-key'] || ''), body })
    const json = (status: number, payload: unknown) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(payload))
    }
    const parsed = body && String(req.headers['content-type'] || '').includes('json') ? JSON.parse(body) : {}
    const p = url.pathname
    // AI666 风格
    if (req.method === 'POST' && p === '/ve/v1/video/generations') {
      if (parsed.model === 'hard-fail') return json(500, { error: { message: 'channel down' } })
      if (parsed.model === 'soft-fail') return json(200, { code: 500, msg: 'prompt rejected' })
      const id = `task-${++taskSeq}`
      taskStatus.set(id, 'processing')
      return json(200, { id, status: 'queued' })
    }
    const videoQuery = /^\/ve\/v1\/video\/generations\/([^/]+)$/.exec(p)
    if (req.method === 'GET' && videoQuery) {
      const id = decodeURIComponent(videoQuery[1])
      return json(200, { id, status: taskStatus.get(id) ?? 'failed', video_url: taskStatus.get(id) === 'completed' ? 'https://cdn.example.com/v.mp4' : '' })
    }
    if (req.method === 'POST' && p === '/ve/v1/images/generations') return json(200, { data: [{ url: 'https://cdn.example.com/a.png' }] })
    if (req.method === 'POST' && p === '/ve/v1/chat/completions') {
      if (parsed.stream) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/event-stream')
        res.write('data: {"choices":[{"delta":{"content":"你"}}]}\n\n')
        setTimeout(() => {
          res.write('data: {"choices":[{"delta":{"content":"好"}}]}\n\n')
          res.end('data: [DONE]\n\n')
        }, 30)
        return
      }
      return json(200, { id: 'chatcmpl-1', choices: [{ message: { content: String(parsed.model ?? '').includes('image') ? '![img](https://cdn.example.com/b.png)' : 'hello' } }] })
    }
    // GRS.AI 风格
    if (req.method === 'POST' && p === '/grs/v1/video/veo') {
      const id = `grs-${++taskSeq}`
      taskStatus.set(id, 'running')
      return json(200, { code: 0, data: { id, status: 'running' } })
    }
    if (req.method === 'POST' && p === '/grs/v1/draw/result') {
      const id = String(parsed.id)
      const status = taskStatus.get(id) ?? 'failed'
      return json(200, { code: 0, data: { id, status, results: status === 'succeeded' ? [{ url: 'https://cdn.example.com/g.mp4' }] : [], failure_reason: status === 'failed' ? 'nsfw' : '' } })
    }
    if (p === '/grs/client/grsai/getCredits') return json(200, { code: 0, data: { credits: 999999 } })
    // TikHub
    if (req.method === 'GET' && p === '/api/v1/tiktok/app/v3/fetch_one_video_by_share_url') return json(200, { code: 200, data: { aweme_id: '123' } })
    // 七牛上传
    if (req.method === 'POST' && p === '/qiniu-upload') {
      const key = /name="key"\r\n\r\n([^\r\n]+)/.exec(body)?.[1] ?? ''
      return json(200, { key })
    }
    json(404, { error: 'no route' })
  })
})

async function expectError(promise: Promise<unknown>, code: string, status: number) {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof CloudClientError, String(error))
    assert.equal(error.code, code, error.message)
    assert.equal(error.status, status, error.message)
    return error
  }
  assert.fail(`expected ${code}`)
}

let app: ReturnType<typeof createCloudApp>

async function main() {
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const up = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
  app = createCloudApp({ dataDir: dir, dbPath: join(dir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true, isProduction: false, tikhubBaseUrl: up })
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`

  const clientFor = () => {
    let token = ''
    const client = createCloudClient({ getBaseUrl: () => base, getToken: () => token })
    return { client, setToken: (t: string) => (token = t) }
  }

  // ---- 后台：平台 Key、七牛、TikHub；套餐：视频 / 图片都按次扣点
  app.repo.insertUser({ id: newId('u'), account: 'owner@example.com', passwordHash: await hashPassword('owner-pass-123'), displayName: 'owner', role: 'super_admin', now: Date.now() })
  const ownerC = clientFor()
  ownerC.setToken((await ownerC.client.login({ account: 'owner@example.com', password: 'owner-pass-123', client: 'admin' })).sessionToken)
  const owner = ownerC.client
  await owner.admin.savePlan({ code: 'pro', name: '专业版', days: 30, amountFen: 100, maxDevices: 2, features: ['*'], credits: 100, quotas: { video: { mode: 'credits', freePerMonth: 0 }, image: { mode: 'credits', freePerMonth: 0 } } })
  await owner.admin.saveBillingDefaults({ points: { video: 10, image: 2 }, refundPerDay: 50 })
  const managed = createDefaultManagedSettings()
  managed.enabled = true
  managed.platforms.ai666 = { apiKey: 'sk-REAL-VE-KEY', baseUrl: `${up}/ve` }
  managed.platforms.grsai = { apiKey: 'sk-REAL-GRS-KEY', baseUrl: `${up}/grs` }
  managed.tikhubApiKey = 'REAL-TIKHUB-KEY'
  managed.capabilities.video = { platform: 'ai666', model: 'veo3.1-fast' }
  managed.capabilities.image = { platform: 'ai666', model: 'gpt-image-1', quality: 'high' }
  managed.qiniu = { accessKey: 'REAL-AK', secretKey: 'REAL-SK', bucket: 'bkt', domain: 'cdn.example.com', uploadHost: `${up}/qiniu-upload`, prefix: 'vg' }
  app.repo.upsertConfig({ key: MANAGED_SETTINGS_KEY, value: managed, scope: 'private', description: '', updatedBy: null, now: Date.now() })

  // ---- 用户：注册、买套餐（100 点）、桌面端登录并激活本机
  const reg = clientFor()
  reg.setToken((await reg.client.register({ account: 'alice@example.com', password: 'password-123' })).sessionToken)
  const order = (await reg.client.createOrder({ planCode: 'pro', channel: 'mock' })).order
  await reg.client.mockPay(order.orderNo)
  const desk = clientFor()
  desk.setToken((await desk.client.login({ account: 'alice@example.com', password: 'password-123', client: 'desktop', machineId: 'machine-1' })).sessionToken)
  await desk.client.activateDevice({ machineId: 'machine-1', deviceName: 'pc', platform: 'win32', appVersion: '9.9.9' })
  const balance = async () => (await desk.client.credits()).balance
  assert.equal(await balance(), 100)

  // ---- 下发的设置不含任何密钥
  const synced = await desk.client.getManagedSettings('machine-1')
  const raw = JSON.stringify(synced)
  for (const secret of ['sk-REAL-VE-KEY', 'sk-REAL-GRS-KEY', 'REAL-TIKHUB-KEY', 'REAL-AK', 'REAL-SK', `${up}/ve`]) assert.ok(!raw.includes(secret), `不能下发 ${secret}`)
  assert.ok(synced.settings && synced.proxyToken)
  const token = synced.proxyToken!
  const proxied = toProxiedManagedSettings(synced.settings!, { cloudBaseUrl: base, token })
  const creds = normalizeCredentials(applyManagedSettings({}, proxied))
  assert.equal(creds.grsaiApiKey, token)
  assert.equal(creds.grsaiHost, `${base}/api/v1/ai-proxy/grsai`)
  assert.ok(!JSON.stringify(creds).includes('REAL'), '本机凭据里没有后台密钥')
  assert.equal((await desk.client.getConfig()).managedAi, true, '公开配置告诉各端：AI 由平台统一配置')
  console.log('  ✓ 下发的设置不含平台 Key / 七牛 / TikHub 密钥，本机只有代理地址和令牌')

  const proxy = (platform: string, path: string, init: RequestInit = {}, auth = token) =>
    fetch(`${base}/api/v1/ai-proxy/${platform}${path}`, { ...init, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json', ...(init.headers as any) } })
  const post = (platform: string, path: string, body: unknown, auth?: string) => proxy(platform, path, { method: 'POST', body: JSON.stringify(body) }, auth)

  // ---- 令牌鉴权
  assert.equal((await post('ai666', '/v1/video/generations', { model: 'veo3.1-fast' }, 'sk-whatever')).status, 401)
  const forged = token.split('.')
  forged[1] = Buffer.from(JSON.stringify({ v: 1, sub: 'u_x', sh: 'x', mid: 'machine-1', exp: Date.now() + 1e9 })).toString('base64url')
  assert.equal((await post('ai666', '/v1/video/generations', { model: 'veo3.1-fast' }, forged.join('.'))).status, 401)
  assert.equal((await post('xibapi', '/v1/videos', { model: 'x' })).status, 403, '后台没配 Key 的平台')
  assert.equal((await post('unknown', '/v1/videos', {})).status, 404)
  assert.equal((await proxy('ai666', '/v1/..%2f..%2fadmin')).status, 400)
  assert.equal(seen.length, 0, '鉴权失败的请求不会到平台')
  assert.equal(await balance(), 100)
  console.log('  ✓ 代理令牌：随便填 / 伪造 / 未配置平台 / 越界路径都被拒，不碰平台不扣点')

  // ---- 视频：提交扣点，平台只看到后台 Key
  let res = await post('ai666', '/v1/video/generations', { model: 'veo3.1-fast', prompt: 'cat' })
  assert.equal(res.status, 200)
  const t1 = (await res.json()).id as string
  assert.equal(seen.at(-1)!.auth, 'Bearer sk-REAL-VE-KEY')
  assert.ok(!seen.some((s) => s.auth.includes(token) || s.body.includes(token)), '令牌不会转发给平台')
  assert.equal(await balance(), 90)
  // 查询进度不扣点；成功 → 确认
  taskStatus.set(t1, 'completed')
  res = await proxy('ai666', `/v1/video/generations/${t1}`)
  assert.equal((await res.json()).status, 'completed')
  assert.equal(await balance(), 90)
  let holds = (await desk.client.credits()).ledger.items
  assert.equal(holds[0].kind, 'charge')
  let hold = app.db.prepare("SELECT status FROM usage_holds WHERE id = (SELECT hold_id FROM ai_proxy_tasks WHERE task_id = ?)").get(t1) as any
  assert.equal(hold.status, 'committed')
  console.log('  ✓ 视频提交在云端扣点，平台只看到后台 Key，查询进度免费，成功后确认')

  // 平台直接报错 / 2xx 但说失败 → 立即退点
  assert.equal((await post('ai666', '/v1/video/generations', { model: 'hard-fail' })).status, 500)
  assert.equal(await balance(), 90)
  assert.equal((await post('ai666', '/v1/video/generations', { model: 'soft-fail' })).status, 200)
  assert.equal(await balance(), 90)
  console.log('  ✓ 平台报错（HTTP 失败或返回体里说失败）立即退点')

  // 异步任务后来失败 → 查询时退点；拿别的失败任务号来骗退点无效
  const t2 = (await (await post('ai666', '/v1/video/generations', { model: 'veo3.1-fast' })).json()).id as string
  assert.equal(await balance(), 80)
  // 伪造：路径查一个不存在（平台说 failed）的任务，参数里塞上 t2
  await proxy('ai666', `/v1/video/generations/ghost-task?ref=${t2}`)
  assert.equal(await balance(), 80, '响应里没有 t2，不退点')
  taskStatus.set(t2, 'failed')
  await proxy('ai666', `/v1/video/generations/${t2}`)
  assert.equal(await balance(), 90, '任务失败退点')
  hold = app.db.prepare('SELECT status FROM usage_holds WHERE id = (SELECT hold_id FROM ai_proxy_tasks WHERE task_id = ?)').get(t2) as any
  assert.equal(hold.status, 'released')
  console.log('  ✓ 异步任务失败时查询进度自动退点，拿别的任务号骗退点无效')

  // ---- 图片：同步返回结果直接确认
  res = await post('ai666', '/v1/images/generations', { model: 'gpt-image-1', prompt: 'x' })
  assert.equal(res.status, 200)
  assert.equal(await balance(), 88)
  // 对话：普通模型免费，图片模型扣点；流式原样转发
  await (await post('ai666', '/v1/chat/completions', { model: 'gpt-4o-mini', messages: [] })).json()
  assert.equal(await balance(), 88)
  await (await post('ai666', '/v1/chat/completions', { model: 'gemini-2.5-flash-image', messages: [] })).json()
  assert.equal(await balance(), 86)
  res = await post('ai666', '/v1/chat/completions', { model: 'gpt-4o-mini', stream: true, messages: [] })
  assert.match(String(res.headers.get('content-type')), /event-stream/)
  const streamed = await res.text()
  assert.ok(streamed.includes('"你"') && streamed.includes('"好"') && streamed.includes('[DONE]'))
  assert.equal(await balance(), 86)
  console.log('  ✓ 图片扣点；普通对话免费，对话里用图片模型扣点；流式输出原样转发')

  // ---- 绕过扣点的尝试：去掉 / 改掉 Content-Type、模型写在查询串、多个模型字段打架、对话不写模型
  const imageBody = JSON.stringify({ model: 'gemini-2.5-flash-image', messages: [] })
  for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', '']) {
    res = await proxy('ai666', '/v1/chat/completions', { method: 'POST', body: imageBody, headers: { 'Content-Type': contentType } })
    await res.text()
  }
  assert.equal(await balance(), 80, '改 Content-Type 照样按图片模型扣点（3 次 × 2 点）')
  res = await post('ai666', '/v1/chat/completions?model=gemini-2.5-flash-image', { messages: [] })
  await res.text()
  assert.equal(await balance(), 78, '模型写在查询串里也扣点')
  const beforeConflict = seen.length
  res = await post('ai666', '/v1/chat/completions', { model: 'gpt-4o-mini', model_name: 'gemini-2.5-flash-image', messages: [] })
  assert.equal(res.status, 400)
  assert.match((await res.json()).error.message, /多个模型/)
  res = await post('ai666', '/v1/chat/completions', { messages: [] })
  assert.equal(res.status, 403, '对话不写模型：看不出是不是生成，拒绝')
  await res.text()
  assert.equal(seen.length, beforeConflict, '被拒的请求不会到平台')
  assert.equal(await balance(), 78)
  app.db.prepare('UPDATE users SET credits = 86 WHERE account = ?').run('alice@example.com')
  console.log('  ✓ 去掉 Content-Type / 查询串写模型 / 多个模型字段 / 不写模型都不能免费生成')

  // ---- 未知 / 敏感接口
  const before = seen.length
  res = await post('ai666', '/v1/some/new/generate', { model: 'x' })
  assert.equal(res.status, 403)
  assert.match((await res.json()).error.message, /暂不支持/)
  assert.equal((await post('grsai', '/client/grsai/getCredits', {})).status, 403)
  assert.equal(seen.length, before, '被拒的请求不会到平台')
  assert.equal(await balance(), 86)
  console.log('  ✓ 未识别的提交接口与查后台余额的接口被拒')

  // ---- 电脑端真实适配器：GRS.AI 视频提交 + 查询，走代理
  const created = await createGrsVideoTask({ credentials: creds, prompt: 'dog', firstFrameUrl: 'https://cdn.example.com/f.png', model: 'veo3.1-fast' })
  assert.ok(created.taskId)
  assert.equal(seen.at(-1)!.auth, 'Bearer sk-REAL-GRS-KEY')
  assert.equal(await balance(), 76)
  taskStatus.set(created.taskId, 'failed')
  const snap = await queryGrsTask(creds, created.taskId)
  assert.equal(snap.status, 'failed')
  assert.equal(await balance(), 86, 'GRS 任务失败退点')
  const created2 = await createGrsVideoTask({ credentials: creds, prompt: 'dog', firstFrameUrl: 'https://cdn.example.com/f.png', model: 'veo3.1-fast' })
  taskStatus.set(created2.taskId, 'succeeded')
  assert.equal((await queryGrsTask(creds, created2.taskId)).outputUrl, 'https://cdn.example.com/g.mp4')
  assert.equal(await balance(), 76)
  console.log('  ✓ 电脑端 GRS.AI 适配器原样可用：提交扣点、失败退点、成功出结果')

  // ---- 点数不足：代理直接拒绝，不碰平台
  app.db.prepare('UPDATE users SET credits = 3 WHERE account = ?').run('alice@example.com')
  const n = seen.length
  res = await post('ai666', '/v1/video/generations', { model: 'veo3.1-fast' })
  assert.equal(res.status, 402)
  assert.match((await res.json()).error.message, /点数不足/)
  assert.equal(seen.length, n)
  app.db.prepare('UPDATE users SET credits = 76 WHERE account = ?').run('alice@example.com')
  console.log('  ✓ 点数不足时代理直接拒绝，错误信息能显示给用户')

  // ---- 七牛：单次上传凭证，只能写云端指定的对象
  const grant = await desk.client.qiniuUploadGrant({ machineId: 'machine-1', fileName: 'ref image.png', keyPrefix: 'grsai-input/images' })
  assert.match(grant.key, /^vg\/grsai-input\/images\/\d+_[0-9a-f-]+_ref_image\.png$/)
  const [ak, sign, policyB64] = grant.token.split(':')
  assert.equal(ak, 'REAL-AK', '凭证里只有 AK（七牛协议需要），SK 不出服务器')
  const policy = JSON.parse(Buffer.from(policyB64, 'base64').toString('utf8'))
  assert.equal(policy.scope, `bkt:${grant.key}`)
  assert.equal(sign, createHmac('sha1', 'REAL-SK').update(policyB64).digest('base64').replace(/\+/g, '-').replace(/\//g, '_'))
  await expectError(desk.client.qiniuUploadGrant({ machineId: 'other-machine', fileName: 'a.png' }), 'FORBIDDEN', 403)
  setQiniuUploadGrantProvider((input) => desk.client.qiniuUploadGrant({ machineId: 'machine-1', ...input }))
  const localFile = join(dir, 'ref.png')
  writeFileSync(localFile, Buffer.from('89504e47', 'hex'))
  const publicUrl = await uploadToQiniu({ credentials: creds, filePath: localFile, keyPrefix: 'grsai-input/images' })
  assert.match(publicUrl, /^https:\/\/cdn\.example\.com\/vg\/grsai-input\/images\//)
  setQiniuUploadGrantProvider(null)
  console.log('  ✓ 七牛上传：电脑端向云端要单次凭证后直传，SK 不下发')

  // ---- TikHub：走代理，不扣点，平台只看到后台的 TikHub Key
  setTikhubBaseUrlOverride(`${base}/api/v1/ai-proxy/tikhub`)
  const tikUrl = new URL(tikhubFetchOneUrl())
  tikUrl.searchParams.set('share_url', 'https://vt.tiktok.com/abc')
  res = await fetch(tikUrl, { headers: { Authorization: `Bearer ${creds.tikhubApiKey}` } })
  assert.equal((await res.json()).data.aweme_id, '123')
  assert.equal(seen.at(-1)!.auth, 'Bearer REAL-TIKHUB-KEY')
  assert.match(seen.at(-1)!.path, /share_url=/)
  assert.equal(await balance(), 76)
  setTikhubBaseUrlOverride(null)
  assert.match(tikhubFetchOneUrl(), /^https:\/\/api\.tikhub\.io\//)
  // ---- 不扣点但有成本的调用：每天有上限；一次多份按份扣
  const usedTik = app.db.prepare("SELECT calls FROM ai_proxy_usage WHERE kind = 'tikhub'").get() as { calls: number }
  assert.ok(usedTik.calls >= 1, 'tikhub calls are counted')
  app.db.prepare("UPDATE ai_proxy_usage SET calls = 500 WHERE kind = 'tikhub'").run()
  assert.equal((await fetch(tikUrl, { headers: { Authorization: `Bearer ${creds.tikhubApiKey}` } })).status, 429)
  await owner.admin.adjustCredits((await desk.client.me()).user.id, 50, '份数')
  const beforeMulti = await balance()
  const multiRes = await post('ai666', '/v1/images/generations', { model: 'gpt-image-1', prompt: 'x', n: 3 })
  assert.equal(multiRes.status, 200)
  assert.equal(beforeMulti - (await balance()), 6, 'n=3 costs three images')
  assert.equal((await post('ai666', '/v1/images/generations', { model: 'gpt-image-1', prompt: 'x', n: 99 })).status, 400)
  console.log('  ✓ TikHub / 对话每天有上限，一次多份按份扣点')

  console.log('  ✓ TikHub 走云端代理，不扣点，Key 只在服务器')

  // ---- 服务器复刻引擎的代理令牌：不绑设备，只扣一次点，统计记为网页，子进程会话撤销后失效
  const aliceId = app.repo.getUserByAccount('alice@example.com')!.id
  const engineSession = app.service.issueEngineSession(aliceId)
  const engineToken = app.service.issueEngineProxyToken(aliceId, engineSession)
  const balanceBeforeEngine = await balance()
  res = await proxy('ai666', '/v1/images/generations', { method: 'POST', body: JSON.stringify({ model: 'gpt-image-1', prompt: 'x' }), headers: { 'x-vg-client': 'web' } }, engineToken)
  assert.equal(res.status, 200)
  await res.text()
  assert.equal(seen.at(-1)!.auth, 'Bearer sk-REAL-VE-KEY', '平台看到的是后台 Key，引擎只有代理令牌')
  assert.equal(await balance(), balanceBeforeEngine - 2, '引擎生成只在代理扣一次点')
  const engineHold = app.db.prepare("SELECT client FROM usage_holds WHERE user_id = ? AND feature = 'ai-proxy' ORDER BY created_at DESC LIMIT 1").get(aliceId) as { client: string }
  assert.equal(engineHold.client, 'web')
  const engineGrant = app.service.engineQiniuUploadGrant(aliceId, { fileName: 'a.png', keyPrefix: 'grsai-input/images' })
  assert.match(engineGrant.key, /^vg\/grsai-input\/images\//, '引擎不用设备也能拿七牛单次凭证')
  app.service.revokeSessionToken(engineSession)
  res = await proxy('ai666', '/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'gpt-4o-mini', messages: [] }) }, engineToken)
  assert.equal(res.status, 401, '子进程退出（会话撤销）后引擎令牌失效')
  await res.text()
  console.log('  ✓ 服务器复刻引擎走代理：不绑设备、只扣一次点、会话撤销即失效')

  // ---- 退出登录 / 解绑后令牌立即失效
  await desk.client.logout()
  res = await post('ai666', '/v1/chat/completions', { model: 'gpt-4o-mini', messages: [] })
  assert.equal(res.status, 401)
  console.log('  ✓ 退出登录后代理令牌立即失效')

  // ---- 路径分类表
  const c = (method: string, path: string, model = '', platform: any = 'ai666') => classifyProxyRequest({ platform, method, path, model })
  assert.deepEqual(c('POST', '/vidu/ent/v2/img2video'), { kind: 'charge', capability: 'video', track: true })
  assert.deepEqual(c('POST', '/api/v1/model/generateVideo'), { kind: 'charge', capability: 'video', track: true })
  assert.deepEqual(c('POST', '/model/generateVideo'), { kind: 'charge', capability: 'video', track: true })
  assert.deepEqual(c('POST', '/api/v1/model/prediction'), { kind: 'charge', capability: 'video', track: true })
  assert.deepEqual(c('GET', '/api/v1/model/prediction/abc'), { kind: 'free' })
  assert.deepEqual(c('POST', '/v1/videos'), { kind: 'charge', capability: 'video', track: true })
  assert.deepEqual(c('POST', '/v1/video/create'), { kind: 'charge', capability: 'video', track: true })
  assert.deepEqual(c('POST', '/api/v3/contents/generations/tasks'), { kind: 'charge', capability: 'video', track: true })
  assert.deepEqual(c('POST', '/v1/draw/completions'), { kind: 'charge', capability: 'image', track: true })
  assert.deepEqual(c('POST', '/v1/draw/result'), { kind: 'free' })
  assert.deepEqual(c('POST', '/mj/submit/imagine'), { kind: 'charge', capability: 'image', track: true })
  assert.deepEqual(c('POST', '/v1/images/edits'), { kind: 'charge', capability: 'image', track: true })
  assert.deepEqual(c('POST', '/api/v1/model/generateImage'), { kind: 'charge', capability: 'image', track: true })
  assert.deepEqual(c('POST', '/api/v1/model/uploadMedia'), { kind: 'free' })
  assert.deepEqual(c('POST', '/v1beta/models/gemini-2.5-flash-image:generateContent', 'gemini-2.5-flash-image'), { kind: 'charge', capability: 'image', track: false })
  assert.deepEqual(c('POST', '/v1beta/models/gemini-2.5-pro:generateContent', 'gemini-2.5-pro'), { kind: 'free', metered: 'chat' })
  assert.deepEqual(c('POST', '/v1/chat/completions', 'veo3-fast'), { kind: 'charge', capability: 'video', track: false })
  assert.deepEqual(c('POST', '/v1/messages', 'claude-sonnet'), { kind: 'free', metered: 'chat' })
  assert.deepEqual(c('POST', '/v1/chat/completions', ''), { kind: 'unknown' }, '对话不写模型不能当免费')
  assert.deepEqual(extractModelCandidates('/v1/chat/completions', '', Buffer.from('{"model":"gpt-image-1"}')), ['gpt-image-1'])
  assert.deepEqual(extractModelCandidates('/v1/videos', 'application/json', Buffer.from('{"model":"cheap","model_name":"kling-v2-master"}')), ['cheap', 'kling-v2-master'])
  const multipart = Buffer.from('--b\r\nContent-Disposition: form-data; name=model\r\n\r\ngpt-image-1\r\n--b--\r\n', 'latin1')
  assert.deepEqual(extractModelCandidates('/v1/chat/completions', 'multipart/form-data; boundary=b', multipart), ['gpt-image-1'])
  assert.deepEqual(c('DELETE', '/v1/videos/abc'), { kind: 'unknown' })
  assert.deepEqual(c('GET', '/api/v1/tiktok/app/v3/fetch_one_video_by_share_url', '', 'tikhub'), { kind: 'free', metered: 'tikhub' })
  assert.deepEqual(c('GET', '/api/v1/xiaohongshu/app_v2/get_video_note_detail', '', 'tikhub'), { kind: 'free', metered: 'tikhub' })
  assert.equal(c('GET', '/api/v1/anything', '', 'tikhub').kind, 'blocked', 'other TikHub endpoints are not open')
  assert.equal(c('GET', '/api/v1/tikhub/user/get_user_info', '', 'tikhub').kind, 'blocked', 'TikHub account info is not exposed')
  console.log('  ✓ 各平台提交 / 查询接口分类正确')

  console.log('\ncloud ai-proxy smoke passed')
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
