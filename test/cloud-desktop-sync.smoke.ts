/**
 * 桌面端多端同步冒烟测试：真实云端服务 + 临时桌面数据目录 + 模拟手机端。
 * 覆盖：桌面商品 / 模特（含图片）推到云端；手机新建、修改、删除拉回桌面；不回声；桌面再次修改只推一条。
 * 运行：npx tsx test/cloud-desktop-sync.smoke.ts
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
    const assets: Array<{ path: string; name: string; folderPath?: string[] }> = []
    const listings: any[] = []
    sync.setCloudSyncPhoneImportTargets({
      importAsset: async (path, name, folderPath) => { assets.push({ path, name, folderPath }) },
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

    // ---- 网页素材库 → 电脑素材库 (imported once, folder kept; re-uploads re-import)
    const clip = await phone.sync.uploadFile(PNG(11), 'image/png')
    await phone.sync.push([
      { collection: 'assets', id: 'as1', updatedAt: Date.now(), deleted: false, data: { name: '开箱', kind: 'image', fileId: clip.fileId, mime: 'image/png', size: 10, folder: '耳环', createdAt: Date.now() } },
      { collection: 'assets', id: 'as2', updatedAt: Date.now(), deleted: false, data: { name: 'logo.png', kind: 'image', fileId: photo.fileId, mime: 'image/png', size: 10, createdAt: Date.now() } },
    ])
    const beforeAssets = assets.length
    result = await sync.runCloudSync()
    assert.equal(result.lastError, '', result.lastError)
    const webAssets = assets.slice(beforeAssets)
    assert.equal(webAssets.length, 2, 'both web assets imported')
    const unboxing = webAssets.find((item) => item.name === '开箱.png')
    assert.ok(unboxing, 'extension added from mime')
    assert.deepEqual(unboxing!.folderPath, ['网页素材库', '耳环'])
    assert.deepEqual(webAssets.find((item) => item.name === 'logo.png')!.folderPath, ['网页素材库'])
    assert.ok(existsSync(unboxing!.path))
    await phone.sync.push([{ collection: 'assets', id: 'as1', updatedAt: Date.now() + 1000, deleted: false, data: { name: '开箱-改名', kind: 'image', fileId: clip.fileId, mime: 'image/png', size: 10, folder: '耳环', createdAt: Date.now() } }])
    await sync.runCloudSync()
    assert.equal(assets.length, beforeAssets + 2, 'renaming in the web library does not import a second copy')

    // ---- 品牌记忆: both ways, newest edit wins, no ping-pong
    let localBrand = { brandName: '', tone: '', audience: '', bannedWords: [] as string[], subtitleStyle: '', watermarkText: '', notes: '', updatedAt: 0 }
    let brandSaves = 0
    sync.setCloudSyncBrandSource(async () => ({
      read: async () => ({ ...localBrand }),
      save: async (brand) => { brandSaves += 1; localBrand = { ...brand, updatedAt: Date.now() }; return { updatedAt: localBrand.updatedAt } },
    }))
    await phone.sync.push([{ collection: 'brand', id: 'brand', updatedAt: Date.now(), deleted: false, data: { brandName: '小饰', tone: '轻松', audience: '', bannedWords: ['最便宜'], subtitleStyle: '', watermarkText: '', notes: '' } }])
    await sync.runCloudSync()
    assert.equal(localBrand.brandName, '小饰', 'web edit reaches this computer')
    assert.deepEqual(localBrand.bannedWords, ['最便宜'])
    await sync.runCloudSync()
    assert.equal(brandSaves, 1, 'no re-apply when nothing changed')
    const brandSeq = (await phone.sync.pull(0, ['brand'])).changes[0]!.seq
    assert.equal((await phone.sync.pull(0, ['brand'])).changes[0]!.seq, brandSeq)
    localBrand = { ...localBrand, tone: '专业', updatedAt: Date.now() + 5000 }
    await sync.runCloudSync()
    const cloudBrand = (await phone.sync.pull(0, ['brand'])).changes[0]!
    assert.equal((cloudBrand.data as any).tone, '专业', 'desktop edit reaches the web')
    assert.ok(cloudBrand.seq > brandSeq)
    await sync.runCloudSync()
    assert.equal((await phone.sync.pull(0, ['brand'])).changes[0]!.seq, cloudBrand.seq, 'own push is not echoed back')
    assert.equal(brandSaves, 1)

    // ---- 模板库: desktop templates go up (desktop-only settings kept), web edits come back, deletes travel both ways
    const songPath = join(imgDir, 'song.mp3')
    writeFileSync(songPath, Buffer.from('ID3fake-song-bytes'))
    let localTemplates: any[] = [{
      id: 'local-t1', name: '基础模板', structure: ['hook', 'show'], totalDurationSec: { min: 7, max: 15 },
      segmentDurationSec: { hook: { min: 2, max: 3 }, show: { min: 2, max: 5 } }, segmentFx: { hook: { zoom: { min: 1, max: 1.06 } } },
      bgm: { filePaths: [songPath], volume: 0.25 }, tts: { enabled: true, textPool: ['你好'], voice: 'v', mixVolume: 1, keepOriginal: true },
      transition: { enabled: true, pool: ['fade'], durationSec: { min: 0.1, max: 0.2 } }, titleOverlay: { enabled: true, textPool: ['新品'] },
      aspectUnifyMode: 'contain_pad', createdAt: 1, updatedAt: Date.now(),
    }]
    let tick = Date.now() + 100000
    sync.setCloudSyncTemplateSource(async () => ({
      list: async () => localTemplates.map((t) => ({ ...t })),
      upsert: async (payload: any) => {
        tick += 10
        const prev = localTemplates.find((t) => t.id === payload.id)
        const saved = { ...(prev ?? {}), ...payload, id: payload.id ?? `local-${localTemplates.length + 1}`, createdAt: prev?.createdAt ?? tick, updatedAt: tick }
        localTemplates = [...localTemplates.filter((t) => t.id !== saved.id), saved]
        return saved
      },
      remove: async (id: string) => { localTemplates = localTemplates.filter((t) => t.id !== id) },
    }))
    result = await sync.runCloudSync()
    assert.equal(result.lastError, '', result.lastError)
    let cloudTemplates = (await phone.sync.pull(0, ['templates'])).changes
    assert.equal(cloudTemplates.length, 1)
    const t1 = cloudTemplates[0]!
    const t1Data = t1.data as any
    assert.equal(t1Data.name, '基础模板')
    assert.deepEqual(t1Data.pieceSec, { min: 2, max: 5 })
    assert.deepEqual(t1Data.titles, ['新品'])
    assert.equal(t1Data.bgmFileIds.length, 1, 'music uploaded')
    assert.ok(t1Data.desktopOnly.includes('配音') && t1Data.desktopOnly.includes('转场'))
    assert.equal(t1Data.desktop.bgm.filePaths, undefined, 'no local paths in the cloud')

    // web edits the title and duration → desktop gets them, TTS / transition untouched
    await phone.sync.push([{ collection: 'templates', id: t1.id, updatedAt: t1.updatedAt + 5000, deleted: false, data: { ...t1Data, titles: ['今日上新'], durationSec: { min: 10, max: 12 } } }])
    await sync.runCloudSync()
    let local1 = localTemplates.find((t) => t.id === 'local-t1')
    assert.deepEqual(local1.titleOverlay.textPool, ['今日上新'])
    assert.deepEqual(local1.totalDurationSec, { min: 10, max: 12 })
    assert.equal(local1.tts.enabled, true, 'desktop-only TTS kept')
    assert.deepEqual(local1.segmentDurationSec.show, { min: 2, max: 5 }, 'per-segment lengths kept when shot length unchanged')
    assert.ok(existsSync(local1.bgm.filePaths[0]), 'music downloaded')
    const seqAfterWebEdit = (await phone.sync.pull(0, ['templates'])).changes[0]!.seq
    await sync.runCloudSync()
    assert.equal((await phone.sync.pull(0, ['templates'])).changes[0]!.seq, seqAfterWebEdit, 'applying the web edit is not echoed back')

    // web edits the 分镜结构 (adds a segment, reorders, per-segment length + zoom) → desktop structure follows
    assert.deepEqual(t1Data.segments.map((x: any) => x.key), ['hook', 'show'], 'segments go up with the template')
    const t1Now = (await phone.sync.pull(0, ['templates'])).changes[0]!
    const segs = [{ key: 'show', min: 1.5, max: 2.5, zoomMin: 1, zoomMax: 1.1 }, { key: 'hook', min: 2, max: 3, zoomMin: 1, zoomMax: 1.06 }, { key: 'cta', min: 1, max: 2, zoomMin: 1.02, zoomMax: 1.04 }]
    await phone.sync.push([{ collection: 'templates', id: t1.id, updatedAt: t1Now.updatedAt + 5000, deleted: false, data: { ...(t1Now.data as any), segments: segs, structure: segs.map((x) => x.key), pieceSec: { min: 1, max: 3 } } }])
    await sync.runCloudSync()
    local1 = localTemplates.find((t) => t.id === 'local-t1')
    assert.deepEqual(local1.structure, ['show', 'hook', 'cta'])
    assert.deepEqual(local1.segmentDurationSec.cta, { min: 1, max: 2 })
    assert.deepEqual(local1.segmentFx.show.zoom, { min: 1, max: 1.1 })
    assert.equal(local1.tts.enabled, true, 'desktop-only TTS still kept')

    // a template created on the web appears on the computer
    await phone.sync.push([{ collection: 'templates', id: 'tpl_web1', updatedAt: Date.now() + 200000, deleted: false, data: { name: '网页模板', durationSec: { min: 8, max: 9 }, pieceSec: { min: 1.5, max: 2 }, titles: [], bgmFileIds: [], bgmVolume: 0.3, aspect: 'cover_crop', colorGrade: { enabled: false, brightness: 0, contrast: 1, saturation: 1 }, hflip: true, createdAt: Date.now() } }])
    await sync.runCloudSync()
    const webMade = localTemplates.find((t) => t.name === '网页模板')
    assert.ok(webMade, 'web template created locally')
    assert.equal(webMade.aspectUnifyMode, 'cover_crop')
    assert.deepEqual(webMade.segmentDurationSec.hook, { min: 1.5, max: 2 })
    assert.equal(webMade.segmentFx.hook.allowHflip, true)

    // deleted on the computer → deleted for the web; deleted on the web → removed here
    localTemplates = localTemplates.filter((t) => t.id !== 'local-t1')
    await sync.runCloudSync()
    cloudTemplates = (await phone.sync.pull(0, ['templates'])).changes
    assert.equal(cloudTemplates.find((c) => c.id === t1.id)!.deleted, true)
    await phone.sync.push([{ collection: 'templates', id: 'tpl_web1', updatedAt: Date.now() + 300000, deleted: true, data: null }])
    await sync.runCloudSync()
    assert.equal(localTemplates.length, 0, 'web delete removes the local copy')

    // ---- 生产中心: pool published, web edits / uploads applied, web orders rendered here and reported back
    const thumbPath = join(imgDir, 'clip-thumb.jpg')
    writeFileSync(thumbPath, PNG(21))
    const sourcePath = join(imgDir, 'pool-source.mp4')
    writeFileSync(sourcePath, Buffer.from('0000001866747970-pool-source', 'utf8'))
    const poolClips: any[] = [
      { id: 'c1', productId: product.id, sourceId: 's1', filePath: sourcePath, startSec: 0, endSec: 2, durationSec: 2, origin: 'real', framePaths: [], thumbnailPath: thumbPath, tagStatus: 'tagged', tags: { role: 'hook', secondaryRoles: [], description: '开箱', hasProduct: true, hasHand: true, hasFace: false, hasText: false, looksAi: false, shotScale: 'close', motion: 'slow', quality: 80, hookScore: 70, issues: [] }, createdAt: 1, updatedAt: 1 },
      { id: 'c2', productId: product.id, sourceId: 's1', filePath: sourcePath, startSec: 2, endSec: 5, durationSec: 3, origin: 'real', framePaths: [], thumbnailPath: thumbPath, tagStatus: 'tagged', tags: { role: 'detail', secondaryRoles: [], description: '细节', hasProduct: true, hasHand: false, hasFace: false, hasText: false, looksAi: false, shotScale: 'close', motion: 'static', quality: 70, hookScore: 20, issues: [] }, createdAt: 1, updatedAt: 1 },
    ]
    const poolSources: any[] = [{ id: 's1', productId: product.id, kind: 'import', filePath: sourcePath, fileName: 'pool-source.mp4', origin: 'real', status: 'ready', clipCount: 2, durationSec: 5, createdAt: 1, updatedAt: 1 }]
    const clipUpdates: any[] = []
    const imported: any[] = []
    const enqueued: any[] = []
    const renderTasks: any[] = []
    sync.setCloudSyncProductionSource(async () => ({
      pool: async (id: string) => (id === product.id ? { sources: poolSources, clips: poolClips, busy: false } : { sources: [], clips: [], busy: false }),
      formulas: async () => [{ id: 'custom1', name: '我的公式', angle: 'custom', description: '', beats: [], source: 'custom', createdAt: 1, updatedAt: 1 }],
      updateClip: async (id: string, patch: any) => {
        clipUpdates.push({ id, ...patch })
        const clip = poolClips.find((c) => c.id === id)
        Object.assign(clip, { roleOverride: patch.roleOverride ?? undefined, disabled: patch.disabled, updatedAt: clip.updatedAt + 1 })
      },
      importFiles: async (id: string, paths: string[], origin: string) => { imported.push({ id, paths, origin }) },
      enqueue: async (input: any, drafts: any[]) => {
        enqueued.push({ input, drafts })
        for (const draft of drafts) renderTasks.push({ outDir: input.outDir, status: 'queued', progress: 0, outPath: join(input.outDir, `${draft.id}.mp4`), formulaName: draft.formulaName })
        return { enqueued: drafts.length, skipped: 0 }
      },
      tasks: (outDir: string) => renderTasks.filter((t) => t.outDir === outDir),
    }))
    result = await sync.runCloudSync()
    assert.equal(result.lastError, '', result.lastError)
    const pools = (await phone.sync.pull(0, ['mix-pools'])).changes
    const myPool = pools.find((c) => c.id === product.id)!.data as any
    assert.equal(myPool.clips.length, 2)
    assert.ok(myPool.clips[0].thumbFileId, 'clip thumbnails uploaded')
    assert.ok(myPool.sources[0].fileId, 'small source videos uploaded for cloud renders')
    assert.equal(myPool.clips[0].filePath, undefined, 'no local paths in the cloud')
    assert.equal(((await phone.sync.pull(0, ['mix-formulas'])).changes[0]!.data as any).formulas[0].id, 'custom1')
    assert.ok(((await phone.sync.pull(0, ['desktop-status'])).changes[0]!.data as any).at > 0, 'computer reports it is online')
    const poolSeq = pools.find((c) => c.id === product.id)!.seq
    await sync.runCloudSync()
    assert.equal((await phone.sync.pull(0, ['mix-pools'])).changes.find((c) => c.id === product.id)!.seq, poolSeq, 'unchanged pool is not re-published')

    // web edits a clip and uploads a video into the pool
    const upload = await phone.sync.uploadFile(Buffer.from('fake-video-bytes'), 'video/mp4')
    await phone.sync.push([
      { collection: 'mix-pool-edits', id: product.id, updatedAt: Date.now(), deleted: false, data: { clips: { c2: { roleOverride: 'proof', disabled: false } } } },
      { collection: 'mix-pool-imports', id: 'imp1', updatedAt: Date.now(), deleted: false, data: { productId: product.id, fileId: upload.fileId, name: '手机拍的.mp4', mime: 'video/mp4', origin: 'real', state: 'pending', createdAt: Date.now() } },
    ])
    await sync.runCloudSync()
    assert.deepEqual(clipUpdates, [{ id: 'c2', roleOverride: 'proof', disabled: false }])
    assert.equal(imported.length, 1)
    assert.equal(imported[0].id, product.id)
    assert.ok(existsSync(imported[0].paths[0]), 'uploaded video downloaded for splitting')
    assert.equal(((await phone.sync.pull(0, ['mix-pool-imports'])).changes[0]!.data as any).state, 'done')
    const republished = (await phone.sync.pull(0, ['mix-pools'])).changes.find((c) => c.id === product.id)!.data as any
    assert.equal(republished.clips.find((c: any) => c.id === 'c2').roleOverride, 'proof', 'edited pool re-published')

    // web order: rendered here, progress and the finished video reported back
    const mixShot = (clipId: string) => ({ clipId, role: 'hook', filePath: 'web:s1', thumbnailPath: 'web', startSec: 0, durationSec: 1.5, clipStartSec: 0, clipEndSec: 2, sourceDurationSec: 5, origin: 'real' })
    const mixOrder = {
      productId: product.id, productName: '电脑上的戒指', runner: 'desktop', state: 'pending', createdAt: Date.now(),
      input: { mode: 'auto', formulaIds: ['builtin:unboxing'], count: 2, language: 'zh-CN', voice: 'zh-CN-XiaoxiaoNeural', keepOriginalAudio: false, allowAiClips: true },
      drafts: [
        { id: 'd1', formulaId: 'builtin:unboxing', formulaName: '开箱', shots: [mixShot('c1'), mixShot('c2')], title: '到货了', voiceover: '终于到了', totalDurationSec: 3, scriptSource: 'pool', warnings: [] },
        { id: 'd2', formulaId: 'builtin:unboxing', formulaName: '开箱', shots: [mixShot('c1'), mixShot('gone')], title: 'x', voiceover: '', totalDurationSec: 3, scriptSource: 'none', warnings: [] },
      ],
    }
    await phone.sync.push([{ collection: 'mix-orders', id: 'mo1', updatedAt: Date.now(), deleted: false, data: mixOrder }])
    await sync.runCloudSync()
    assert.equal(enqueued.length, 1)
    assert.equal(enqueued[0].drafts.length, 1, 'draft with a missing clip is not rendered')
    assert.equal(enqueued[0].drafts[0].shots[0].filePath, sourcePath, 'web clip ids swapped for local files')
    assert.equal(enqueued[0].input.productId, product.id)
    let mo = (await phone.sync.pull(0, ['mix-orders'])).changes[0]!.data as any
    assert.equal(mo.state, 'running')
    assert.deepEqual(mo.results.map((r: any) => r.status), ['queued', 'skipped'])
    const outPath = renderTasks[0].outPath
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, Buffer.from('0000001866747970-rendered-mix', 'utf8'))
    renderTasks[0].status = 'done'
    await sync.runCloudSync()
    mo = (await phone.sync.pull(0, ['mix-orders'])).changes[0]!.data as any
    assert.equal(mo.state, 'completed')
    assert.ok(mo.results[0].outputFileId, 'finished video uploaded')
    const mixWorks = (await phone.sync.pull(0, ['generations'])).changes.filter((c) => (c.data as any)?.purpose === 'mix')
    assert.equal(mixWorks.length, 1, 'finished mix appears in 作品库 / 审核收件箱')
    const orderSeq = (await phone.sync.pull(0, ['mix-orders'])).changes[0]!.seq
    await sync.runCloudSync()
    assert.equal((await phone.sync.pull(0, ['mix-orders'])).changes[0]!.seq, orderSeq, 'finished order not reported again')

    // ---- 选品方案: schemes both ways, tasks / results published, web requests run here
    const resImg = join(imgDir, 'research.jpg')
    writeFileSync(resImg, PNG(31))
    const rs: any = {
      schemes: [{ id: 'sch1', name: '耳环选品', need: '通勤耳环', market: 'vn', status: 'active', sopStage: 2, keywordCount: 1, resultCount: 0, candidateCount: 0, createdAt: 1, updatedAt: Date.now() }],
      states: { sch1: { keywords: [{ id: 'k1', value: '耳环', status: 'collected' }], candidateIds: [], productEdits: [], liveTestRecords: [] } },
      tasks: [{ id: 't1', schemeId: 'sch1', keyword: '耳环', sort: 'sales', targetCount: 50, status: 'completed', collectedCount: 1, createdAt: 1 }],
      results: [{ id: 'r1', taskId: 't1', schemeId: 'sch1', keyword: '耳环', title: '珍珠耳环', priceText: '¥29', salesText: '1万', shopName: '', rank: 1, imagePath: resImg, capturedAt: 1, confidence: 0.9 }],
      created: [] as any[], cancelled: [] as string[], removedResults: [] as string[], phoneOnline: false,
    }
    sync.setCloudSyncResearchSource(async () => ({
      exportForSync: async () => ({ schemes: rs.schemes.map((x: any) => ({ ...x })), schemeStates: rs.states, tasks: [...rs.tasks], results: [...rs.results], devices: [{ id: 'ph1', name: '红米', platform: 'android', connected: rs.phoneOnline, pairedAt: 1, lastSeenAt: 1 }], serverRunning: true, endpoint: 'http://192.168.1.5:41688' }),
      applySchemeFromSync: async (scheme: any, state: any) => { rs.schemes = [...rs.schemes.filter((x: any) => x.id !== scheme.id), scheme]; rs.states[scheme.id] = state },
      deleteScheme: async (id: string) => { rs.schemes = rs.schemes.filter((x: any) => x.id !== id) },
      createTask: async (input: any) => {
        if (!rs.phoneOnline) throw new Error('No paired phone is online.')
        const task = { id: `t${rs.tasks.length + 1}`, ...input, sort: 'sales', targetCount: input.targetCount ?? 100, status: 'queued', collectedCount: 0, createdAt: Date.now() }
        rs.tasks.push(task); rs.created.push(input); return task
      },
      cancelTask: async (id: string) => { rs.cancelled.push(id) },
      removeTask: async (id: string) => { rs.tasks = rs.tasks.filter((t: any) => t.id !== id) },
      removeResults: async (ids: string[]) => { rs.removedResults.push(...ids); rs.results = rs.results.filter((r: any) => !ids.includes(r.id)) },
    }))
    result = await sync.runCloudSync()
    assert.equal(result.lastError, '', result.lastError)
    const schemeRec = (await phone.sync.pull(0, ['pr-schemes'])).changes.find((c) => c.id === 'sch1')!
    assert.equal((schemeRec.data as any).scheme.name, '耳环选品')
    assert.equal((schemeRec.data as any).state.keywords[0].value, '耳环')
    const prResult = (await phone.sync.pull(0, ['pr-results'])).changes[0]!.data as any
    assert.ok(prResult.imageFileId, 'result image uploaded')
    assert.equal(prResult.imagePath, undefined)
    assert.equal(((await phone.sync.pull(0, ['pr-tasks'])).changes[0]!.data as any).keyword, '耳环')
    assert.equal(((await phone.sync.pull(0, ['pr-status'])).changes[0]!.data as any).devices[0].name, '红米')

    // web edits the scheme (moves to step 3, marks a candidate) → applied here; no echo back
    const webScheme = { scheme: { ...(schemeRec.data as any).scheme, sopStage: 3, updatedAt: Date.now() + 60_000 }, state: { ...(schemeRec.data as any).state, candidateIds: ['r1'] } }
    await phone.sync.push([{ collection: 'pr-schemes', id: 'sch1', updatedAt: Date.now() + 60_000, deleted: false, data: webScheme }])
    await sync.runCloudSync()
    assert.equal(rs.schemes.find((x: any) => x.id === 'sch1').sopStage, 3)
    assert.deepEqual(rs.states.sch1.candidateIds, ['r1'])
    const schemeSeq = (await phone.sync.pull(0, ['pr-schemes'])).changes.find((c) => c.id === 'sch1')!.seq
    await sync.runCloudSync()
    assert.equal((await phone.sync.pull(0, ['pr-schemes'])).changes.find((c) => c.id === 'sch1')!.seq, schemeSeq, 'applied web edit not echoed')

    // web asks for a collection while no phone is online → explained failure; then phone online → task created and published
    await phone.sync.push([{ collection: 'pr-requests', id: 'req1', updatedAt: Date.now(), deleted: false, data: { action: 'createTask', keyword: '戒指', schemeId: 'sch1', targetCount: 30, state: 'pending', createdAt: Date.now() } }])
    await sync.runCloudSync()
    let req = (await phone.sync.pull(0, ['pr-requests'])).changes.find((c) => c.id === 'req1')!.data as any
    assert.equal(req.state, 'failed')
    assert.match(req.error, /没有在线的采集手机/)
    rs.phoneOnline = true
    await phone.sync.push([
      { collection: 'pr-requests', id: 'req2', updatedAt: Date.now(), deleted: false, data: { action: 'createTask', keyword: '戒指', schemeId: 'sch1', targetCount: 30, state: 'pending', createdAt: Date.now() } },
      { collection: 'pr-requests', id: 'req3', updatedAt: Date.now(), deleted: false, data: { action: 'removeResults', resultIds: ['r1'], schemeId: 'sch1', state: 'pending', createdAt: Date.now() } },
    ])
    await sync.runCloudSync()
    req = (await phone.sync.pull(0, ['pr-requests'])).changes.find((c) => c.id === 'req2')!.data as any
    assert.equal(req.state, 'done')
    assert.ok((await phone.sync.pull(0, ['pr-tasks'])).changes.some((c) => c.id === req.taskId && !c.deleted), 'new task published in the same sync')
    assert.deepEqual(rs.removedResults, ['r1'])
    assert.equal((await phone.sync.pull(0, ['pr-results'])).changes.find((c) => c.id === 'r1')!.deleted, true, 'removed result deleted for the web')

    // scheme deleted on the web → deleted here
    await phone.sync.push([{ collection: 'pr-schemes', id: 'sch1', updatedAt: Date.now() + 120_000, deleted: true, data: null }])
    await sync.runCloudSync()
    assert.equal(rs.schemes.length, 0)

    // ---- 商品记忆: per product, both ways, newest edit wins
    const memories: Record<string, any> = { [product.id]: { sellingPoints: '925 银不过敏', audience: '', avoid: '', notes: '', updatedAt: Date.now() } }
    let memorySaves = 0
    sync.setCloudSyncBrandSource(async () => ({
      read: async () => ({ ...localBrand }),
      save: async (brand: any) => { localBrand = { ...brand, updatedAt: Date.now() }; return { updatedAt: localBrand.updatedAt } },
      readProducts: async () => ({ ...memories }),
      saveProduct: async (id: string, memory: any) => { memorySaves += 1; memories[id] = { ...memory, updatedAt: Date.now() }; return { updatedAt: memories[id].updatedAt } },
    }))
    await sync.runCloudSync()
    let mem = (await phone.sync.pull(0, ['product-memory'])).changes.find((c) => c.id === product.id)!
    assert.equal((mem.data as any).sellingPoints, '925 银不过敏', 'desktop product memory reaches the web')
    await phone.sync.push([{ collection: 'product-memory', id: product.id, updatedAt: mem.updatedAt + 60_000, deleted: false, data: { ...(mem.data as any), audience: '通勤女生' } }])
    await sync.runCloudSync()
    assert.equal(memories[product.id].audience, '通勤女生', 'web edit reaches this computer')
    const memSeq = (await phone.sync.pull(0, ['product-memory'])).changes.find((c) => c.id === product.id)!.seq
    await sync.runCloudSync()
    assert.equal((await phone.sync.pull(0, ['product-memory'])).changes.find((c) => c.id === product.id)!.seq, memSeq, 'no echo')
    assert.equal(memorySaves, 1)

    // ---- tk创意室: the web orders, this computer runs it and reports back
    const created: any[] = []
    const tasks = new Map<string, { id: string; shots: Array<{ shotId: string; status: string; resultVideoPath?: string; lastError?: string }> }>()
    sync.setCloudSyncCreativeSource(async () => ({
      createFromReference: async (input) => {
        created.push(input)
        const task = { id: `task-${created.length}`, shots: input.referenceImagePaths.map((_, i) => ({ shotId: `s${i}`, status: 'running' })) }
        tasks.set(task.id, task)
        return { id: task.id }
      },
      get: async (taskId) => tasks.get(taskId) ?? null,
    }))
    const scene = await phone.sync.uploadFile(PNG(9), 'image/png')
    const orderAt = Date.now() + 20000
    await phone.sync.push([
      { collection: 'creative-requests', id: 'cr1', updatedAt: orderAt, deleted: false, data: { productId: product.id, productName: '电脑上的戒指', referenceFileIds: [scene.fileId, photo.fileId], state: 'pending', createdAt: orderAt } },
      { collection: 'creative-requests', id: 'cr-missing', updatedAt: orderAt, deleted: false, data: { productId: 'not-on-this-computer', referenceFileIds: [scene.fileId], state: 'pending', createdAt: orderAt } },
    ])
    result = await sync.runCloudSync()
    assert.equal(result.lastError, '', result.lastError)
    assert.equal(created.length, 1, 'only the order whose product exists here is started')
    assert.equal(created[0].productId, product.id)
    assert.equal(created[0].referenceImagePaths.length, 2)
    assert.ok(created[0].referenceImagePaths.every((path: string) => existsSync(path)), 'reference images downloaded')
    let orders = Object.fromEntries((await phone.sync.pull(0, ['creative-requests'])).changes.map((c) => [c.id, c.data as any]))
    assert.equal(orders.cr1.state, 'running')
    assert.equal(orders.cr1.taskId, 'task-1')
    assert.equal(orders['cr-missing'].state, 'failed')
    assert.match(orders['cr-missing'].error, /找不到这个商品/)

    // one shot finishes, the other fails → video uploaded, shown in 作品库, order completed
    const videoPath = join(imgDir, 'creative.mp4')
    writeFileSync(videoPath, Buffer.from('0000001866747970', 'hex'))
    tasks.get('task-1')!.shots = [{ shotId: 's0', status: 'completed', resultVideoPath: videoPath }, { shotId: 's1', status: 'failed', lastError: '账号额度不足' }]
    result = await sync.runCloudSync()
    assert.equal(result.lastError, '', result.lastError)
    orders = Object.fromEntries((await phone.sync.pull(0, ['creative-requests'])).changes.map((c) => [c.id, c.data as any]))
    assert.equal(orders.cr1.state, 'completed')
    assert.equal(orders.cr1.shots[0].status, 'completed')
    assert.ok(orders.cr1.shots[0].outputFileId)
    assert.equal(orders.cr1.shots[1].status, 'failed')
    assert.equal(orders.cr1.shots[1].error, '账号额度不足')
    const works = (await phone.sync.pull(0, ['generations'])).changes.filter((c) => (c.data as any)?.purpose === 'creative')
    assert.equal(works.length, 1, 'finished creative video appears as a work for review')
    assert.equal((works[0].data as any).outputFileId, orders.cr1.shots[0].outputFileId)
    assert.ok((await phone.sync.downloadFile(orders.cr1.shots[0].outputFileId)).size > 0)
    const assetsBefore = assets.length
    const seqBefore = (await phone.sync.pull(0, ['creative-requests'])).changes.find((c) => c.id === 'cr1')!.seq
    await sync.runCloudSync()
    assert.equal(assets.length, assetsBefore, 'our own output is not re-imported into this computer')
    assert.equal((await phone.sync.pull(0, ['creative-requests'])).changes.find((c) => c.id === 'cr1')!.seq, seqBefore, 'finished order is not reported again')

    // a computer without tk创意室 tells the web instead of leaving the order hanging
    sync.setCloudSyncCreativeSource(async () => null)
    await phone.sync.push([{ collection: 'creative-requests', id: 'cr2', updatedAt: Date.now() + 30000, deleted: false, data: { productId: product.id, referenceFileIds: [scene.fileId], state: 'pending', createdAt: Date.now() } }])
    await sync.runCloudSync()
    orders = Object.fromEntries((await phone.sync.pull(0, ['creative-requests'])).changes.map((c) => [c.id, c.data as any]))
    assert.equal(orders.cr2.state, 'skipped')


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
