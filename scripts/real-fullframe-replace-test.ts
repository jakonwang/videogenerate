/**
 * 对照实验：不框选、不裁图，把整张参考图和商品图直接交给图片模型（同一套替换提示词、同一个 GRS 出图模型），
 * 看能不能直接生成。
 *
 * 用法：npx tsx scripts/real-fullframe-replace-test.ts <参考图> <商品图> <输出文件.png> [宽高比，默认按参考图]
 * Key 读本地后台 services/cloud/data/cloud.sqlite，不打印。会真实扣一次出图费用。
 */
import { mkdtemp, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

function nearestAspect(width: number, height: number) {
  const options = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9']
  const ratio = width / height
  return options.reduce((best, item) => {
    const [w, h] = item.split(':').map(Number)
    const [bw, bh] = best.split(':').map(Number)
    return Math.abs(w / h - ratio) < Math.abs(bw / bh - ratio) ? item : best
  })
}

async function main() {
  const [referencePath, productPath, outputPath, aspectArg] = process.argv.slice(2)
  if (!referencePath || !productPath || !outputPath) {
    console.error('用法：npx tsx scripts/real-fullframe-replace-test.ts <参考图> <商品图> <输出文件.png> [宽高比]')
    process.exit(2)
  }
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-fullframe-'))
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
  const credentials = normalizeCredentials({ ...applyManagedSettings({}, settings), openaiImageQuality: settings.capabilities.image.quality } as any) as any

  const sharp = (await import('sharp')).default
  const meta = await sharp(referencePath).metadata()
  const aspectRatio = aspectArg || nearestAspect(meta.width || 1, meta.height || 1)

  const { buildReferenceReplacementPrompt } = await import('../src/main/modules/live-photo/service')
  const { toPublicUrlViaQiniu } = await import('../src/main/modules/clone/qiniu')
  const { createGrsImageTask, queryGrsTask } = await import('../src/main/modules/clone/grsai')
  const product = { name: 'A-36', type: 'earring', authoritativeProductReferencePath: productPath, imagePaths: [productPath], coverImagePath: productPath } as any
  const prompt = buildReferenceReplacementPrompt({ product, productReferenceImagePaths: [productPath], referenceImagePath: referencePath })

  const urls = [
    await toPublicUrlViaQiniu(credentials, referencePath, 'grsai-input/live-photo/base-scene'),
    await toPublicUrlViaQiniu(credentials, productPath, 'grsai-input/live-photo/product-reference'),
  ]
  const startedAt = Date.now()
  const created = await createGrsImageTask({ credentials: { ...credentials, imageProviderPrimary: 'grsai' }, prompt, aspectRatio, urls } as any)
  console.log(`已提交 模型=${created.model} 宽高比=${aspectRatio} taskId=${created.taskId || '(直接出图)'}`)
  let url = created.directUrl as string | undefined
  while (!url && Date.now() - startedAt < 10 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    const snapshot = await queryGrsTask(credentials, String(created.taskId))
    if (snapshot.status === 'failed' || snapshot.status === 'error') throw new Error(snapshot.errorMessage || '出图失败')
    url = snapshot.outputUrl || undefined
  }
  if (!url) throw new Error('10 分钟内没出结果')
  const res = await fetch(url)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await sharp(Buffer.from(await res.arrayBuffer())).png().toFile(outputPath)
  console.log(`完成 用时 ${Math.round((Date.now() - startedAt) / 1000)} 秒 → ${outputPath}`)
  process.exit(0)
}

main().catch((error) => {
  console.error(String(error?.message || error).replace(/sk-[A-Za-z0-9]{6,}/g, 'sk-***'))
  process.exit(1)
})
