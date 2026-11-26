/**
 * 云端 AI 网关冒烟测试：真实 HTTP 服务 + 假的 AI 平台（不产生真实调用）。
 * 覆盖：未配置、需要会员、按后台设置路由到平台、图片只能用自己的、每日额度、平台报错。
 * 运行：npx tsx test/cloud-ai.smoke.ts
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { createCloudApp } from '../services/cloud/src/app'
import { MANAGED_SETTINGS_KEY } from '../services/cloud/src/service'
import { createCloudClient, CloudClientError } from '../src/shared/cloud/client'
import { createDefaultManagedSettings } from '../src/shared/cloud/managedSettings'

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'vg-cloud-ai-'))
  const keyPath = join(dir, 'ent.pem')
  writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())

  const providerCalls: Array<{ url: string; headers: Record<string, string>; body: any }> = []
  let providerStatus = 200
  const fakeFetch = (async (url: string, init: RequestInit) => {
    providerCalls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) })
    const body = providerStatus === 200 ? JSON.stringify({ choices: [{ message: { content: '  法式珍珠耳环 小众高级感  ' } }] }) : 'boom'
    return new Response(body, { status: providerStatus })
  }) as unknown as typeof fetch

  const app = createCloudApp(
    { dataDir: dir, dbPath: join(dir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true, aiPerDay: 3, aiPerMinute: 100 },
    { fetchImpl: fakeFetch },
  )
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  const expectError = async (promise: Promise<unknown>, status: number) => {
    try {
      await promise
      assert.fail(`expected HTTP ${status}`)
    } catch (error) {
      assert.ok(error instanceof CloudClientError, String(error))
      assert.equal(error.status, status, error.message)
    }
  }

  try {
    const makeUser = async (name: string) => {
      let token = ''
      const client = createCloudClient({ getBaseUrl: () => base, getToken: () => token })
      await client.register({ account: `${name}@example.com`, password: 'password-123' })
      token = (await client.login({ account: `${name}@example.com`, password: 'password-123', client: 'mobile', machineId: name })).sessionToken
      return client
    }
    const alice = await makeUser('alice')
    const bob = await makeUser('bob')

    // membership required
    await expectError(alice.ai.chat({ prompt: 'hi' }), 402)
    for (const client of [alice, bob]) {
      const plans = await client.listPlans()
      const order = await client.createOrder({ planCode: plans.plans[0].code, channel: 'mock' })
      await client.mockPay(order.order.orderNo)
    }

    // not configured by the admin yet
    await expectError(alice.ai.chat({ prompt: 'hi' }), 503)

    const settings = createDefaultManagedSettings()
    settings.enabled = true
    settings.platforms.ai666 = { apiKey: 'sk-secret', baseUrl: 'https://ve.example.com/' }
    settings.capabilities.chat = { platform: 'ai666', model: 'gpt-4.1-mini' }
    app.repo.upsertConfig({ key: MANAGED_SETTINGS_KEY, value: settings, scope: 'private', description: '', updatedBy: null, now: Date.now() })

    // routed to the configured platform, with the account's own image attached
    const photo = await alice.sync.uploadFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9]), 'image/png')
    const reply = await alice.ai.chat({ system: 'title only', prompt: '写标题', imageFileIds: [photo.fileId], purpose: 'listing-title' })
    assert.equal(reply.content, '法式珍珠耳环 小众高级感')
    const call = providerCalls.at(-1)!
    assert.equal(call.url, 'https://ve.example.com/v1/chat/completions')
    assert.equal(call.headers.Authorization, 'Bearer sk-secret')
    assert.equal(call.body.model, 'gpt-4.1-mini')
    assert.equal(call.body.messages[0].content, 'title only')
    assert.match(call.body.messages[1].content[1].image_url.url, /^data:image\/png;base64,/)

    // another account's image is not reachable
    await expectError(bob.ai.chat({ prompt: 'x', imageFileIds: [photo.fileId] }), 404)

    // provider failure → 502, counted
    providerStatus = 500
    await expectError(alice.ai.chat({ prompt: 'again' }), 502)
    providerStatus = 200

    // daily limit (3): two used above, one left
    await alice.ai.chat({ prompt: 'third' })
    await expectError(alice.ai.chat({ prompt: 'fourth' }), 429)
    const usage = await alice.ai.usage()
    assert.equal(usage.usedToday, 3)
    assert.equal(usage.dailyLimit, 3)
    const rows = app.db.prepare('SELECT purpose, calls, failures FROM ai_usage ORDER BY purpose').all() as any[]
    assert.deepEqual(rows.map((r) => `${r.purpose}:${r.calls}:${r.failures}`).sort(), ['chat:2:1', 'listing-title:1:0'])

    console.log('cloud ai smoke: ok')
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
