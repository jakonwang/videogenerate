/**
 * 服务器复刻引擎的每日生成上限：复刻代码向 AI 平台发起的生成请求按账号每天计数，超过上限的请求不会发出去。
 * Real cloud server + engine worker + a fake AI platform (local HTTP server) configured as the managed chat platform.
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import http from 'node:http'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

const root = mkdtempSync(join(tmpdir(), 'vg-clone-cap-'))

async function main() {
  const { isMeteredRequest } = await import('../services/cloud/engine/meterRule')
  const cloud = 'http://127.0.0.1:18300'
  assert.equal(isMeteredRequest('https://api.example.com/v1/chat/completions', 'POST', cloud), true, 'chat counts')
  assert.equal(isMeteredRequest('https://api.example.com/v1/video/create', 'post', cloud), true, 'video task counts')
  assert.equal(isMeteredRequest('https://api.example.com/v1/draw/result', 'POST', cloud), false, 'polling a result does not count')
  assert.equal(isMeteredRequest('https://api.example.com/api/v1/jobs/recordInfo', 'POST', cloud), false)
  assert.equal(isMeteredRequest('https://api.example.com/v1/video/query', 'POST', cloud), false)
  assert.equal(isMeteredRequest('https://api.example.com/api/v1/model/uploadMedia', 'POST', cloud), false, 'uploading material does not count')
  assert.equal(isMeteredRequest('https://api.example.com/v1/videos/abc', 'GET', cloud), false, 'GET never counts')
  assert.equal(isMeteredRequest('https://up-z2.qiniup.com/', 'POST', cloud), false, 'storage upload does not count')
  assert.equal(isMeteredRequest(`${cloud}/api/v1/sync/push`, 'POST', cloud), false, 'the cloud itself does not count')
  assert.equal(isMeteredRequest(`${cloud}/api/v1/ai-proxy/vectorengine/v1/chat/completions`, 'POST', cloud), true, 'generation through the cloud AI proxy counts')
  assert.equal(isMeteredRequest(`${cloud}/api/v1/ai-proxy/grsai/v1/draw/result`, 'POST', cloud), false, 'polling through the proxy does not count')
  console.log('✓ only generation requests to AI platforms are counted')

  // Fake AI platform: counts what reaches it.
  let hits = 0
  const auths: string[] = []
  const fake = http.createServer((req, res) => {
    hits += 1
    auths.push(String(req.headers.authorization || ''))
    req.resume()
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { content: '{}' } }] }))
  })
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve))
  const fakeBase = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`

  const { createCloudApp } = await import('../services/cloud/src/app')
  const { MANAGED_SETTINGS_KEY } = await import('../services/cloud/src/service')
  const { createCloudClient, CloudClientError } = await import('../src/shared/cloud/client')
  const { createDefaultManagedSettings } = await import('../src/shared/cloud/managedSettings')
  const { cloudFileRef } = await import('../src/shared/cloud/relay')
  const { getFfmpegExecutable } = await import('../src/main/lib/binariesPath')
  const keyPath = join(root, 'ent.pem')
  writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
  const app = createCloudApp({ dataDir: join(root, 'cloud'), dbPath: join(root, 'cloud', 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true, port: 0, cloneEnginePerDay: 2 })
  const settings = createDefaultManagedSettings()
  settings.enabled = true
  for (const key of ['grsai', 'ai666', 'vectorengine'] as const) settings.platforms[key] = { apiKey: 'test-key', baseUrl: fakeBase }
  settings.capabilities.chat = { platform: 'vectorengine', model: 'gpt-4.1-mini' }
  settings.capabilities.image = { platform: 'vectorengine', model: 'gpt-image-1', quality: 'high' }
  settings.capabilities.video = { platform: 'vectorengine', model: 'veo_3_1-fast' }
  app.repo.upsertConfig({ key: MANAGED_SETTINGS_KEY, value: settings, scope: 'private', description: '', updatedBy: null, now: Date.now() })
  let proxied = 0
  app.server.on('request', (req) => {
    if (String(req.url || '').startsWith('/api/v1/ai-proxy/vectorengine/')) proxied += 1
  })
  await app.listen()
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  try {
    let token = ''
    const web = createCloudClient({ getBaseUrl: () => base, getToken: () => token })
    await web.register({ account: 'cap@example.com', password: 'password-123' })
    token = (await web.login({ account: 'cap@example.com', password: 'password-123', client: 'web' } as any)).sessionToken
    const plans = await web.listPlans()
    await web.mockPay((await web.createOrder({ planCode: plans.plans[0].code, channel: 'mock' })).order.orderNo)

    const video = join(root, 'ref.mp4')
    const ff = spawnSync(getFfmpegExecutable(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=25', '-t', '3', '-pix_fmt', 'yuv420p', video])
    assert.equal(ff.status, 0)
    const { fileId } = await web.sync.uploadFile(readFileSync(video), 'video/mp4')
    const created = await web.relay.call<any>('clone', 'createDraftProject', [{ locale: 'zh-CN', title: '上限测试' }])
    const projectId = created.project?.id ?? created.id
    const bound = await web.relay.call<any>('clone', 'bindProjectReferenceVideo', [{ cloneProjectId: projectId, videoPath: cloudFileRef(fileId, 'ref.mp4') }])
    const referencePath = String((bound.project ?? bound).referenceVideoPath)

    // Reference analysis talks to the (fake) chat platform; run it until the day's allowance is gone.
    const errors: string[] = []
    for (let round = 0; round < 4; round++) {
      try {
        await web.relay.call('clone', 'createBlueprint', [{ cloneProjectId: projectId, videoPath: referencePath, locale: 'zh-CN' }])
      } catch (error) {
        errors.push(error instanceof CloudClientError ? error.message : String(error))
      }
    }
    const after: any = await web.relay.call('clone', 'getProject', [{ cloneProjectId: projectId }])
    const projectText = JSON.stringify(after)
    const usage = await web.ai.usage()
    console.log('fake platform hits:', hits, '| counted today:', usage.cloneEngine?.usedToday, '| errors:', errors.map((e) => e.slice(0, 60)))
    assert.ok(hits >= 1, 'the analysis reached the AI platform')
    assert.ok(hits <= 2, `no more than the daily cap reached the AI platform (got ${hits})`)
    assert.equal(usage.cloneEngine?.dailyLimit, 2)
    assert.equal(usage.cloneEngine?.usedToday, hits, 'every request that went out was counted')
    // Analysis keeps going with what it has and records why AI was skipped; generation steps fail with the same message.
    assert.ok(/今天服务器复刻的 AI 生成次数已用完（每天 2 次）/.test(projectText) || errors.some((message) => /今天服务器复刻的 AI 生成次数已用完/.test(message)), 'the project says why AI stopped')
    assert.equal(usage.usedToday, 0, 'clone engine calls do not use up the general AI allowance')
    // The engine never holds the administrator's key: it talks to the cloud AI proxy, which swaps in the real key.
    assert.ok(auths.length && auths.every((auth) => auth === 'Bearer test-key'), 'the platform only sees the real key, added by the proxy')
    assert.equal(proxied, hits, `every platform request went through the cloud AI proxy (proxy ${proxied}, platform ${hits})`)
    console.log('✓ the engine reaches AI platforms only through the cloud AI proxy (no real key in the worker)')
    console.log('✓ the daily cap stops further generation requests and says why')
    console.log('cloud clone engine cap smoke test passed')
  } finally {
    await app.close()
    fake.close()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
