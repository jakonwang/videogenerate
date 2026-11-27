/**
 * 用真实平台 Key 跑一次「从参考图替换商品」的出图（走 live-photo 真实流程：定位 → 裁图 → 出图 → 贴回 → 位置大小检查），
 * 到视频这一步拦住，不生成视频。
 *
 * 用法：
 *   npx tsx scripts/real-replacement-still-test.ts <参考图> <商品图> [商品类型=earring] [输出目录]
 *
 * Key 读本地后台 services/cloud/data/cloud.sqlite 的「软件设置」，不打印。会真实扣费（出图 + 定位 + 检查）。
 */
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const [referenceArg, productArg, typeArg, outArg] = process.argv.slice(2)
  if (!referenceArg || !productArg) {
    console.error('用法：npx tsx scripts/real-replacement-still-test.ts <参考图> <商品图> [商品类型] [输出目录]')
    process.exit(2)
  }
  const outDir = path.resolve(outArg || path.join('test', 'artifacts', 'real-replacement-still-test'))
  await mkdir(outDir, { recursive: true })
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-real-replace-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(path.resolve('services/cloud/data/cloud.sqlite'), { readOnly: true })
  const row = db.prepare("SELECT value FROM app_config WHERE key = 'software.managedSettings'").get() as { value?: string } | undefined
  db.close()
  if (!row?.value) throw new Error('本地后台还没有保存软件设置')
  const { applyManagedSettings, normalizeManagedSettings } = await import('../src/shared/cloud/managedSettings')
  const { normalizeCredentials } = await import('../src/main/modules/clone/credentials')
  const settings = normalizeManagedSettings(JSON.parse(row.value))
  const credentials = normalizeCredentials({ ...applyManagedSettings({}, settings), allowMockWhenNoKey: false, openaiImageQuality: settings.capabilities.image.quality } as any)

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')
  await cloneRepo.setCredentials(credentials as any)

  // 贴真实商品的抠图：脚本里直接用本地后台配的腾讯云（正式环境是桌面端经云端接口代办）
  if (settings.matting?.secretId) {
    const { createMatting } = await import('../services/cloud/src/sceneSwap/matting')
    const { setProductCutoutProvider } = await import('../src/main/modules/live-photo/pasteReplace')
    const { mkdtemp: mkTmp, readFile: readTmp, writeFile: writeTmp } = await import('node:fs/promises')
    const matting = createMatting({ settings: () => settings.matting })
    setProductCutoutProvider(async (input) => {
      const dir = await mkTmp(path.join(os.tmpdir(), 'videogen-cutout-'))
      await writeTmp(path.join(dir, 'in'), Buffer.from(input.image, 'base64'))
      await matting.run(path.join(dir, 'in'), path.join(dir, 'mask.png'))
      return { mask: (await readTmp(path.join(dir, 'mask.png'))).toString('base64') }
    })
  }

  // 拦住所有视频请求：这次只验证替换图
  const originalFetch = globalThis.fetch
  let blockedVideo = 0
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url || input || '')
    if (/video/i.test(url)) {
      blockedVideo += 1
      return new Response(JSON.stringify({ error: { message: 'video blocked by real-replacement-still-test' } }), { status: 400 })
    }
    return await originalFetch(input, init)
  }) as typeof fetch

  const reference = path.join(root, 'fixtures', `reference${path.extname(referenceArg) || '.png'}`)
  const productImage = path.join(root, 'fixtures', `product${path.extname(productArg) || '.png'}`)
  await mkdir(path.dirname(reference), { recursive: true })
  await copyFile(referenceArg, reference)
  await copyFile(productArg, productImage)
  const now = Date.now()
  const product = await productsRepo.upsert({
    name: 'real-test-product',
    type: (typeArg || 'earring') as any,
    images: [{ id: 'img-1', productId: 'pending', filePath: productImage, fileName: path.basename(productImage), fileSize: 1, createdAt: now, updatedAt: now, isCover: true }],
    coverImagePath: productImage,
    canonicalSourcePath: productImage,
    canonicalSourceStatus: 'done',
    // PRODUCT_BOARD：商品的六视图分析板（测试按角度挑商品图）
    ...(process.env.PRODUCT_BOARD ? { analysisBoardPath: process.env.PRODUCT_BOARD, analysisBoardStatus: 'done' } : {}),
  } as any)

  const created: any = await livePhotoService.createFromReference({ referenceImagePath: reference, productId: product.id, motionTemplate: 'push_in', placementMode: 'auto' } as any)
  console.log('任务已创建', created.id)
  const deadline = Date.now() + 15 * 60 * 1000
  let item: any = null
  let lastLog = 0
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    item = await livePhotoService.get(created.id)
    const logs = item?.logs || []
    for (const entry of logs.slice(lastLog)) console.log(' ', entry.message.slice(0, 300))
    lastLog = logs.length
    const step = item?.workflow?.currentStep
    if (step === 'video_generation' || item?.autoFlowStatus?.status === 'failed_terminal') break
  }
  globalThis.fetch = originalFetch

  const attempts = (item?.generationAttempts || []) as any[]
  const result: any = {
    taskId: created.id,
    region: item?.replacementRegion,
    attempts: attempts.map((a) => ({ output: a.outputPath, decision: a.quality?.decision, failures: a.quality?.hardFailures })),
    finalStill: item?.generatedStillPath,
    stage: item?.workflow?.currentStep,
    error: item?.error,
    blockedVideo,
  }
  // 结果图拷到输出目录（临时目录会删掉）
  for (const [index, attempt] of attempts.entries()) {
    if (attempt.outputPath && existsSync(attempt.outputPath)) {
      const target = path.join(outDir, `attempt-${index + 1}.png`)
      await copyFile(attempt.outputPath, target)
      result.attempts[index].copied = target
    }
  }
  if (item?.generatedStillPath && existsSync(item.generatedStillPath)) {
    result.finalCopied = path.join(outDir, 'final-still.png')
    await copyFile(item.generatedStillPath, result.finalCopied)
  }
  await copyFile(reference, path.join(outDir, `reference${path.extname(reference)}`))
  await writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  await livePhotoService.resetTestDependencies().catch(() => undefined)
  await rm(root, { recursive: true, force: true }).catch(() => undefined)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
