/**
 * 电脑代办（实时转交）：网页调用电脑端的 GMV Max / 达人中心功能，由电脑用同样的 IPC 处理函数执行。
 * Real cloud server + the desktop relay worker + a web client.
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

const root = mkdtempSync(join(tmpdir(), 'vg-relay-'))
process.env.VIDEOGENERATE_DATA_DIR = join(root, 'desktop')

async function main() {
  const { createCloudApp } = await import('../services/cloud/src/app')
  const { createCloudClient, CloudClientError } = await import('../src/shared/cloud/client')
  const worker = await import('../src/main/modules/cloud-sync/relayWorker')

  const keyPath = join(root, 'ent.pem')
  writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
  const app = createCloudApp({ dataDir: join(root, 'cloud'), dbPath: join(root, 'cloud', 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true })
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  try {
    let desktopToken = ''
    const desktop = createCloudClient({ getBaseUrl: () => base, getToken: () => desktopToken })
    await desktop.register({ account: 'relay@example.com', password: 'password-123' })
    desktopToken = (await desktop.login({ account: 'relay@example.com', password: 'password-123', client: 'desktop', machineId: 'pc' })).sessionToken
    const plans = await desktop.listPlans()
    const order = await desktop.createOrder({ planCode: plans.plans[0].code, channel: 'mock' })
    await desktop.mockPay(order.order.orderNo)
    let webToken = ''
    const web = createCloudClient({ getBaseUrl: () => base, getToken: () => webToken })
    webToken = (await web.login({ account: 'relay@example.com', password: 'password-123', client: 'web' } as any)).sessionToken

    // Broken requests are the caller's fault (400), not a server error (500).
    const badUrl = await fetch(`${base}/api/v1/orders/%E0%A4%A`, { headers: { authorization: `Bearer ${webToken}` } })
    assert.equal(badUrl.status, 400, 'malformed %-escape in a route parameter → 400')
    const badJson = await fetch(`${base}/api/v1/relay/result`, { method: 'POST', headers: { authorization: `Bearer ${desktopToken}`, 'content-type': 'application/json' }, body: '{"id":' })
    assert.equal(badJson.status, 400, 'broken relay result JSON → 400')

    // computer not running yet → the web gets a clear "offline" answer immediately
    await assert.rejects(web.relay.call('tiktokGmvMax', 'getAlerts', []), (error: any) => error instanceof CloudClientError && /电脑端不在线/.test(error.message))
    assert.equal((await web.relay.status()).online, false)

    // the computer's handlers: same functions the desktop page calls over IPC
    const seen: unknown[] = []
    worker.registerRelayHandlerForTest('plugin:tiktokGmvMax:getAlerts', async (_event, ...args) => {
      seen.push(args)
      return { alerts: [{ id: 'a1', title: 'ROI 跌破保本线', at: new Date(0) }] }
    })
    worker.registerRelayHandlerForTest('plugin:tiktokCreatorHub:listShops', async () => {
      throw new Error('店铺 Cookie 已过期')
    })
    worker.registerRelayHandlerForTest('plugin:tiktokCreatorHub:openBackend', async () => ({ url: 'x' }))
    worker.setRelayClientSource(async () => desktop.relay)
    worker.startRelayWorker()
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal((await web.relay.status()).online, true)

    const started = Date.now()
    const alerts = await web.relay.call<any>('tiktokGmvMax', 'getAlerts', [{ storeId: 's1' }])
    assert.equal(alerts.alerts[0].title, 'ROI 跌破保本线')
    assert.equal(alerts.alerts[0].at, '1970-01-01T00:00:00.000Z', 'results arrive JSON-serialised')
    assert.deepEqual(seen, [[{ storeId: 's1' }]], 'arguments passed through')
    assert.ok(Date.now() - started < 3000, 'answered in real time, not on the next sync')

    // errors on the computer come back as readable messages
    await assert.rejects(web.relay.call('tiktokCreatorHub', 'listShops', []), (error: any) => /店铺 Cookie 已过期/.test(error.message))
    // methods that would open a window on the computer are refused
    await assert.rejects(web.relay.call('tiktokCreatorHub', 'openBackend', [{ id: 'x' }]), (error: any) => /需要在电脑端完成/.test(error.message))
    // allow-listed modules only expose their listed methods
    worker.registerRelayHandlerForTest('clone:getModelCredentials', async () => ({ grsaiHost: 'https://grs.example.com', grsaiApiKey: '••••managed' }))
    assert.equal((await web.relay.call<any>('clone', 'getModelCredentials', [])).grsaiHost, 'https://grs.example.com')
    await assert.rejects(web.relay.call('clone', 'debugLog', ['x']), (error: any) => /需要在电脑端完成/.test(error.message))
    await assert.rejects(web.relay.call('dianxiaomiInventory', 'openLogin', []), (error: any) => /需要在电脑端完成/.test(error.message))
    // unknown methods / other modules never reach the computer
    await assert.rejects(web.relay.call('tiktokGmvMax', 'noSuchMethod', []), (error: any) => /不支持/.test(error.message))
    await assert.rejects(web.relay.call('assetLibrary', 'list', []), (error: any) => /不支持的功能/.test(error.message))

    // several calls at once
    const many = await Promise.all([1, 2, 3, 4].map((n) => web.relay.call<any>('tiktokGmvMax', 'getAlerts', [n])))
    assert.equal(many.length, 4)

    // another account cannot reach this computer
    let otherToken = ''
    const other = createCloudClient({ getBaseUrl: () => base, getToken: () => otherToken })
    await other.register({ account: 'other@example.com', password: 'password-123' })
    otherToken = (await other.login({ account: 'other@example.com', password: 'password-123', client: 'web' } as any)).sessionToken
    await assert.rejects(other.relay.call('tiktokGmvMax', 'getAlerts', []), (error: any) => error instanceof CloudClientError)

    worker.stopRelayWorker()
    // 发布中心: files the web picked from the cloud reach the computer's handler as downloaded local paths
    const downloads: string[] = []
    worker.setCloudFileDownloaderForTest(async (fileId, name) => {
      downloads.push(fileId)
      return `C:/vg-data/web-files/${fileId}/${name}`
    })
    let seenPaths: unknown = null
    worker.registerRelayHandlerForTest('plugin:tiktokPublisher:createDraftsFromPaths', async (_event, payload: any) => {
      seenPaths = payload.paths
      return { created: payload.paths.length }
    })
    const drafts = await web.relay.call<any>('tiktokPublisher', 'createDraftsFromPaths', [{ paths: ['cloudfile:file_a/耳环.mp4', 'D:/local/kept.mp4'], defaults: { caption: 'x' } }])
    assert.equal(drafts.created, 2)
    assert.deepEqual(seenPaths, ['C:/vg-data/web-files/file_a/耳环.mp4', 'D:/local/kept.mp4'], 'cloud refs become local paths, local paths stay')
    assert.deepEqual(downloads, ['file_a'])
    worker.setCloudFileDownloaderForTest(null)

    console.log('cloud relay smoke: ok')
  } finally {
    worker.stopRelayWorker()
    await new Promise<void>((resolve) => app.server.close(() => resolve()))
    app.close?.()
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error)
  process.exit(1)
})
