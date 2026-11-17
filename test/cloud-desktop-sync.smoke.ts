/**
 * 桌面端多端同步冒烟测试：真实云端服务 + 临时桌面数据目录 + 模拟手机端。
 * 覆盖：桌面商品 / 模特（含图片）推到云端；手机新建、修改、删除拉回桌面；不回声；桌面再次修改只推一条。
 * 运行：npx tsx test/cloud-desktop-sync.smoke.ts
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

const root = mkdtempSync(join(tmpdir(), 'vg-desktop-sync-'))
process.env.VIDEOGENERATE_DATA_DIR = join(root, 'desktop')
process.env.VIDEOGENERATE_USER_DATA_DIR = join(root, 'desktop-user')

// A real (tiny) PNG so file type checks pass.
const PNG = (seed: number) => {
  const base = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64')
  return Buffer.concat([base, Buffer.from([seed])])
}

async function main() {
  const { createCloudApp } = await import('../services/cloud/src/app')
  const { createCloudClient } = await import('../src/shared/cloud/client')
  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const sync = await import('../src/main/modules/cloud-sync/service')

  const keyPath = join(root, 'ent.pem')
  writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
  const cloudDir = join(root, 'cloud')
  const app = createCloudApp({ dataDir: cloudDir, dbPath: join(cloudDir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true })
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`

  try {
    // account with a membership
    let desktopToken = ''
    const desktop = createCloudClient({ getBaseUrl: () => base, getToken: () => desktopToken })
    await desktop.register({ account: 'sync@example.com', password: 'password-123' })
    desktopToken = (await desktop.login({ account: 'sync@example.com', password: 'password-123', client: 'desktop', machineId: 'pc' })).sessionToken
    const plans = await desktop.listPlans()
    const order = await desktop.createOrder({ planCode: plans.plans[0].code, channel: 'mock' })
    await desktop.mockPay(order.order.orderNo)
    const me = await desktop.me()

    let phoneToken = ''
    const phone = createCloudClient({ getBaseUrl: () => base, getToken: () => phoneToken })
    phoneToken = (await phone.login({ account: 'sync@example.com', password: 'password-123', client: 'mobile', machineId: 'phone' })).sessionToken

    sync.setCloudSyncSessionSource(() => ({ client: desktop, userId: me.user.id, canWrite: true }))
    sync.setCloudSyncGmvSource(async () => null)
    sync.setCloudSyncBusinessSources({})

    // ---- desktop → cloud
    const imgDir = join(root, 'src-images')
    mkdirSync(imgDir, { recursive: true })
    writeFileSync(join(imgDir, 'ring.png'), PNG(1))
    writeFileSync(join(imgDir, 'model.png'), PNG(2))
    const product = await productsRepo.upsert({ name: '电脑上的戒指', type: 'ring', remark: '925 银', images: [{ filePath: join(imgDir, 'ring.png') } as any] })
    await cloneRepo.upsertModelIdentity({ id: 'model-desk-1', name: '模特 A', gender: 'female', ageRange: '20-28', imagePaths: [join(imgDir, 'model.png')] } as any)

    let result = await sync.runCloudSync()
    assert.equal(result.lastError, '', result.lastError)
    assert.equal(result.pushed, 2)
    let changes = (await phone.sync.pull(0)).changes
    const cloudProduct = changes.find((c) => c.collection === 'products' && c.id === product.id)!
    assert.equal((cloudProduct.data as any).name, '电脑上的戒指')
    assert.equal((cloudProduct.data as any).type, 'ring')
    assert.equal((cloudProduct.data as any).images.length, 1)
    const cloudModel = changes.find((c) => c.collection === 'models')!
    assert.equal((cloudModel.data as any).gender, '女')
    // the phone can download the desktop's image
    assert.ok((await phone.sync.downloadFile((cloudProduct.data as any).images[0].fileId)).size > 0)

    // ---- no echo: a second run pushes nothing
    result = await sync.runCloudSync()
    assert.equal(result.pushed, 0)
    assert.equal(result.pulled, 0)

    // ---- phone → desktop: new product with photo, rename, delete model
    const photo = await phone.sync.uploadFile(PNG(3), 'image/png')
    const later = Date.now() + 1000
    await phone.sync.push([
      { collection: 'products', id: 'prod_from_phone', updatedAt: later, deleted: false, data: { name: '手机拍的耳环', type: 'earring', remark: '', images: [{ fileId: photo.fileId, mime: 'image/png' }], coverFileId: photo.fileId, createdAt: later } },
      { collection: 'products', id: product.id, updatedAt: later, deleted: false, data: { ...(cloudProduct.data as any), name: '戒指（手机改名）' } },
      { collection: 'models', id: cloudModel.id, updatedAt: later, deleted: true, data: null },
    ])
    result = await sync.runCloudSync()
    assert.equal(result.lastError, '', result.lastError)
    assert.equal(result.pulled, 3)
    const local = await productsRepo.list()
    const fromPhone = local.find((p) => p.name === '手机拍的耳环')
    assert.ok(fromPhone, 'phone product created on desktop')
    assert.equal(fromPhone!.type, 'earring')
    assert.equal(fromPhone!.images?.length, 1)
    assert.ok(existsSync(fromPhone!.images![0].filePath), 'phone photo downloaded to desktop')
    assert.equal(local.find((p) => p.id === product.id)?.name, '戒指（手机改名）')
    assert.equal((await cloneRepo.listModelIdentityLibrary()).length, 0, 'model deleted on phone is removed on desktop')

    // ---- applying phone changes must not bounce back
    result = await sync.runCloudSync()
    assert.equal(result.pushed, 0)

    // ---- desktop edit → exactly one push, phone sees it under the phone's own id
    await productsRepo.upsert({ id: fromPhone!.id, name: '手机拍的耳环（电脑补充）', type: 'earring' })
    result = await sync.runCloudSync()
    assert.equal(result.pushed, 1)
    changes = (await phone.sync.pull(0)).changes
    assert.equal((changes.find((c) => c.id === 'prod_from_phone')!.data as any).name, '手机拍的耳环（电脑补充）')

    // ---- phone research collection → desktop 「手机采集」 scheme
    const { productResearchService } = await import('../src/main/modules/product-research/service')
    const shot = await phone.sync.uploadFile(PNG(4), 'image/png')
    const t = Date.now()
    await phone.sync.push([
      { collection: 'research-tasks', id: 'local-task-1', updatedAt: t, deleted: false, data: { keyword: '耳环', targetCount: 20, collected: 2, status: 'completed', source: 'mobile', startedAt: t - 60_000, finishedAt: t } },
      { collection: 'research-results', id: 'local-task-1-1', updatedAt: t, deleted: false, data: { taskId: 'local-task-1', keyword: '耳环', title: '法式珍珠耳环', priceText: '¥19.9', priceValue: 19.9, salesText: '已售1.2万', salesValue: 12000, rank: 1, capturedAt: t, image: { fileId: shot.fileId, mime: 'image/png' } } },
      { collection: 'research-results', id: 'local-task-1-2', updatedAt: t, deleted: false, data: { taskId: 'local-task-1', keyword: '耳环', title: '极简金属耳圈', priceText: '¥9.9', salesText: '已售800', salesValue: 800, rank: 2, capturedAt: t } },
    ])
    result = await sync.runCloudSync()
    assert.equal(result.lastError, '', result.lastError)
    const schemes = await productResearchService.listSchemes()
    const mobileScheme = schemes.find((item) => item.id === 'mobile-collect')
    assert.ok(mobileScheme, 'phone collections get their own scheme')
    assert.equal(mobileScheme!.resultCount, 2)
    // read the saved state directly: snapshot() would start the phone pairing server (port 41688)
    const { readFileSync } = await import('node:fs')
    const saved = JSON.parse(readFileSync(join(process.env.VIDEOGENERATE_DATA_DIR!, 'product-research.json'), 'utf8'))
    const snap = { tasks: saved.tasks.filter((x: any) => x.schemeId === 'mobile-collect'), results: saved.results.filter((x: any) => x.schemeId === 'mobile-collect') }
    assert.equal(snap.tasks[0].keyword, '耳环')
    assert.equal(snap.tasks[0].status, 'completed')
    const pearl = snap.results.find((item: any) => item.title === '法式珍珠耳环')!
    assert.equal(pearl.salesValue, 12000)
    assert.ok(pearl.imagePath && existsSync(pearl.imagePath), 'product image downloaded')
    assert.deepEqual((await productResearchService.getSchemeState('mobile-collect'))!.keywords.map((k: any) => k.value), ['耳环'])
    // re-running does not duplicate
    await sync.runCloudSync()
    assert.equal((await productResearchService.listSchemes()).find((item) => item.id === 'mobile-collect')!.resultCount, 2)

    // ---- GMV Max: desktop publishes a digest; phone decisions run on the desktop
    const calls: string[] = []
    let emergency = false
    sync.setCloudSyncGmvSource(async () => ({
      getDashboard: async () => ({
        connection: { name: '越南店', state: 'connected' },
        campaigns: [
          { id: 'c1', name: '耳环-主推', campaignType: 'PRODUCT', operationStatus: 'ENABLE', budget: '100', roasBid: '3' },
          { id: 'c2', name: '戒指-测试', campaignType: 'PRODUCT', operationStatus: 'ENABLE', budget: '50', roasBid: '2.5' },
        ],
        dailyMetrics: [
          { campaignId: 'c1', statDate: '2026-11-15', cost: '80', grossRevenue: '320', orders: '12' },
          { campaignId: 'c1', statDate: '2026-11-16', cost: '90', grossRevenue: '300', orders: '10' },
          { campaignId: 'c2', statDate: '2026-11-16', cost: '30', grossRevenue: '45', orders: '2' },
        ],
        recommendations: [
          { id: 'rec1', campaignId: 'c1', kind: 'scale_up', actionType: 'budget', status: 'pending', risk: 'low', currentBudget: '100', proposedBudget: '130', currentRoasBid: '3', proposedRoasBid: '3', reason: 'ROI 稳定在 3.5 以上', createdAt: 2 },
          { id: 'rec2', campaignId: 'c2', kind: 'scale_down', actionType: 'budget', status: 'pending', risk: 'medium', currentBudget: '50', proposedBudget: '30', currentRoasBid: '2.5', proposedRoasBid: '2.5', reason: 'ROI 低于目标', createdAt: 1 },
          { id: 'rec0', campaignId: 'c1', kind: 'scale_up', status: 'executed', risk: 'low', currentBudget: '80', proposedBudget: '100', currentRoasBid: '3', proposedRoasBid: '3', reason: 'old', createdAt: 0 },
        ],
        scheduler: { emergencyStopped: emergency },
      }),
      approveRecommendation: async (rid: string) => {
        calls.push(`approve:${rid}`)
        if (emergency) throw new Error('GMV MAX write operations are paused by the emergency stop.')
        return { status: 'executed' }
      },
      rejectRecommendation: async (rid: string) => {
        calls.push(`reject:${rid}`)
        return { status: 'rejected' }
      },
    }))
    await sync.runCloudSync()
    const digestChange = (await phone.sync.pull(0, ['gmv-digest'])).changes[0]!
    const digest = digestChange.data as any
    assert.equal(digest.connected, true)
    assert.deepEqual(digest.totals, { spend: 200, gmv: 665, orders: 24, roi: 3.33 })
    assert.equal(digest.campaigns[0].name, '耳环-主推', 'sorted by spend')
    assert.equal(digest.campaigns[0].roi, 3.65)
    assert.deepEqual(digest.pending.map((r: any) => r.id), ['rec1', 'rec2'], 'only pending, newest first')
    assert.equal(digest.pending[1].campaignName, '戒指-测试')
    // unchanged digest is not uploaded again
    await sync.runCloudSync()
    assert.equal((await phone.sync.pull(0, ['gmv-digest'])).changes[0]!.seq, digestChange.seq)

    const d = Date.now()
    await phone.sync.push([
      { collection: 'gmv-decisions', id: 'rec1', updatedAt: d, deleted: false, data: { decision: 'approve', decidedAt: d } },
      { collection: 'gmv-decisions', id: 'rec2', updatedAt: d, deleted: false, data: { decision: 'reject', decidedAt: d } },
    ])
    await sync.runCloudSync()
    assert.deepEqual(calls, ['approve:rec1', 'reject:rec2'])
    let decided = Object.fromEntries((await phone.sync.pull(0, ['gmv-decisions'])).changes.map((c) => [c.id, c.data as any]))
    assert.equal(decided.rec1.result, 'executed')
    assert.equal(decided.rec2.result, 'rejected')
    // results are not re-applied on the next sync
    await sync.runCloudSync()
    assert.equal(calls.length, 2)

    // emergency stop on the desktop: the phone sees a clear reason
    emergency = true
    await phone.sync.push([{ collection: 'gmv-decisions', id: 'rec3', updatedAt: Date.now(), deleted: false, data: { decision: 'approve', decidedAt: Date.now() } }])
    await sync.runCloudSync()
    decided = Object.fromEntries((await phone.sync.pull(0, ['gmv-decisions'])).changes.map((c) => [c.id, c.data as any]))
    assert.equal(decided.rec3.result, 'failed')
    assert.match(decided.rec3.error, /急停/)

    // ---- business digest: insights / creators / inventory / creative studio; a broken module is skipped
    sync.setCloudSyncGmvSource(async () => null)
    sync.setCloudSyncBusinessSources({
      insights: async () => ({
        rangeDays: 7,
        lines: [{ line: 'clone', produced: 12, approved: 9, redo: 2, published: 6, approvalRate: 75 }],
        topProducts: [{ productName: '珍珠耳环', produced: 8, approved: 7, published: 5 }],
        topRedoReasons: [{ reason: '商品变形', count: 2 }],
        publish: { total: 8, published: 6, failed: 1, draft: 1 },
        recommendations: ['复刻线通过率高，可以加量'],
      }),
      creators: async () => { throw new Error('creator hub not configured') },
      inventory: async () => ({
        items: [
          { sku: 'EAR-001', currentStock: 0, averageDaily: 12.34, daysToStockout: 0, risk: 'out_of_stock' },
          { sku: 'EAR-002', currentStock: 40, averageDaily: 10, daysToStockout: 4, risk: 'reorder' },
          { sku: 'RING-01', currentStock: 300, averageDaily: 2, daysToStockout: 150, risk: 'healthy' },
        ],
        auth: { authenticated: true },
        summary: { skuCount: 3, outOfStockCount: 1, reorderCount: 1, lastSyncAt: 123 },
      }),
      creative: async () => [
        { id: 't1', productName: '耳环', status: 'running', totalShots: 4, completedShots: 2, failedShots: 0, createdAt: 2 },
        { id: 't2', productName: '戒指', status: 'requires_manual', totalShots: 3, completedShots: 1, failedShots: 1, lastError: '账号额度不足', createdAt: 1 },
      ],
    })
    await sync.runCloudSync()
    const business = (await phone.sync.pull(0, ['business-digest'])).changes[0]!
    const b = business.data as any
    assert.equal(b.insights.publish.published, 6)
    assert.equal(b.creators, undefined, 'failing module is skipped')
    assert.deepEqual(b.inventory.atRisk.map((x: any) => x.sku), ['EAR-001', 'EAR-002'], 'only at-risk SKUs, most urgent first')
    assert.equal(b.inventory.atRisk[0].averageDaily, 12.3)
    assert.equal(b.creative.running, 1)
    assert.equal(b.creative.needsAttention, 1)
    await sync.runCloudSync()
    assert.equal((await phone.sync.pull(0, ['business-digest'])).changes[0]!.seq, business.seq, 'unchanged digest not re-uploaded')

    // ---- phone output → desktop: approved works go to the asset library, listings to the listing helper
    sync.setCloudSyncBusinessSources({})
    const assets: Array<{ path: string; name: string }> = []
    const listings: any[] = []
    sync.setCloudSyncPhoneImportTargets({
      importAsset: async (path, name) => { assets.push({ path, name }) },
      saveListing: async (input) => { listings.push(input) },
    })
    const work = await phone.sync.uploadFile(PNG(7), 'image/png')
    const now2 = Date.now() + 5000
    await phone.sync.push([
      { collection: 'generations', id: 'gen-ok', updatedAt: now2, deleted: false, data: { kind: 'image', label: '主图 1', productName: '耳环', status: 'done', review: 'approved', outputFileId: work.fileId, outputMime: 'image/png', createdAt: now2 } },
      { collection: 'generations', id: 'gen-pending', updatedAt: now2, deleted: false, data: { kind: 'image', label: '主图 2', status: 'done', review: 'pending', outputFileId: work.fileId, outputMime: 'image/png', createdAt: now2 } },
      { collection: 'listings', id: 'lst1', updatedAt: now2, deleted: false, data: { category: 'earring', sku: 'EAR-9', price: '9.99', language: 'en', title: 'Pearl earrings', description: 'Nice', images: [{ fileId: work.fileId, mime: 'image/png' }, { fileId: photo.fileId, mime: 'image/png' }], createdAt: now2 } },
    ])
    result = await sync.runCloudSync()
    assert.equal(result.lastError, '', result.lastError)
    assert.equal(assets.length, 1, 'only approved works are imported')
    assert.equal(assets[0]!.name, '耳环-主图 1.png')
    assert.ok(existsSync(assets[0]!.path))
    assert.equal(listings.length, 1)
    assert.equal(listings[0].id, 'mobile-lst1')
    assert.equal(listings[0].generatedTitle, 'Pearl earrings')
    assert.equal(listings[0].referenceImagePaths.length, 1)
    // approving the pending one later imports it once; re-saving the approved one does not re-import
    await phone.sync.push([
      { collection: 'generations', id: 'gen-pending', updatedAt: now2 + 10, deleted: false, data: { kind: 'image', label: '主图 2', status: 'done', review: 'approved', outputFileId: work.fileId, outputMime: 'image/png', createdAt: now2 } },
      { collection: 'generations', id: 'gen-ok', updatedAt: now2 + 10, deleted: false, data: { kind: 'image', label: '主图 1', status: 'done', review: 'approved', outputFileId: work.fileId, outputMime: 'image/png', createdAt: now2 } },
    ])
    await sync.runCloudSync()
    assert.equal(assets.length, 2)

    console.log('cloud desktop sync smoke: ok')
  } finally {
    app.server.close()
    app.db.close()
    // The clone repo keeps its SQLite file open until the process exits; Windows cannot delete it before then.
    try {
      rmSync(root, { recursive: true, force: true })
    } catch {
      /* temp dir is cleaned up by the OS */
    }
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error)
  process.exit(1)
})
