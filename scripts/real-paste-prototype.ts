/**
 * 贴图原型第 1 步：用 AI 只擦掉框里的旧商品（补成皮肤），其余像素原样保留。
 *
 * 用法：npx tsx scripts/real-paste-prototype.ts erase <参考图> <输出.png> <x> <y> <w> <h>
 *   x/y/w/h 是框在整张图里的比例（0~1）。
 * Key 读本地后台 services/cloud/data/cloud.sqlite，不打印。会真实扣一次出图费用。
 */
import { mkdtemp, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const [mode, referencePath, outputPath, ...box] = process.argv.slice(2)
  if ((mode !== 'erase' && mode !== 'harmonize') || !referencePath || !outputPath || box.length < 4) {
    console.error('用法：npx tsx scripts/real-paste-prototype.ts <erase|harmonize> <图片> <输出.png> <x> <y> <w> <h>')
    process.exit(2)
  }
  const [x, y, width, height] = box.map(Number)
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-paste-'))
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

  const { prepareLivePhotoReplacementCrop, compositeLivePhotoReplacementCrop } = await import('../src/main/modules/live-photo/replacementRegion')
  const { toPublicUrlViaQiniu } = await import('../src/main/modules/clone/qiniu')
  const { createGrsImageTask, queryGrsTask } = await import('../src/main/modules/clone/grsai')
  const sharp = (await import('sharp')).default

  const region = { x, y, width, height, source: 'manual', revision: 1, updatedAt: Date.now() } as any
  const cropPath = path.join(root, 'scene-crop.png')
  const crop = await prepareLivePhotoReplacementCrop({ scenePath: referencePath, outputPath: cropPath, region })
  const prompt = mode === 'harmonize' ? [
    'Edit this photo minimally. A small silver huggie hoop earring with a star charm is worn through the ear lobe piercing.',
    'Make it look physically worn: the hoop enters the piercing hole, wraps around the bottom edge of the ear lobe, and its plain back half is behind the lobe and reappears below the lobe edge.',
    'Add a tiny piercing hole shadow, soft contact shadow on the skin, and silver reflections that match the warm sunlight.',
    'Do NOT redesign the earring. Keep the star charm, every stone, and the stone-set front band exactly as they are. Do not change size or position.',
    'Keep the ear, skin, hair, and everything else exactly the same. Same composition, same crop.',
  ].join('\n') : [
    'Edit this photo: completely remove the earring / jewelry from the ear lobe.',
    'Fill the spot with natural ear lobe skin that matches the surrounding skin texture, color, and sunlight.',
    'Do not add any jewelry, piercing stud, or new object. Keep the piercing area looking like bare skin.',
    'Keep everything else (ear shape, hair strands, lighting, framing) exactly the same. Same composition, same crop.',
  ].join('\n')
  const url = await toPublicUrlViaQiniu(credentials, cropPath, 'grsai-input/live-photo/base-scene')
  const startedAt = Date.now()
  const created = await createGrsImageTask({ credentials: { ...credentials, imageProviderPrimary: 'grsai' }, prompt, aspectRatio: '1:1', urls: [url] } as any)
  console.log(`擦除已提交 模型=${created.model} taskId=${created.taskId || '(直接出图)'}`)
  let resultUrl = created.directUrl as string | undefined
  while (!resultUrl && Date.now() - startedAt < 10 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    const snapshot = await queryGrsTask(credentials, String(created.taskId))
    if (snapshot.status === 'failed' || snapshot.status === 'error') throw new Error(snapshot.errorMessage || '擦除失败')
    resultUrl = snapshot.outputUrl || undefined
  }
  if (!resultUrl) throw new Error('10 分钟内没出结果')
  const generatedPath = path.join(root, 'erased-crop.png')
  await sharp(Buffer.from(await (await fetch(resultUrl)).arrayBuffer())).png().toFile(generatedPath)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await compositeLivePhotoReplacementCrop({ scenePath: referencePath, generatedCropPath: generatedPath, outputPath, geometry: crop.geometry })
  // 融合模式：AI 处理完后，把锁住的前半圈（星星 + 碎钻，真实商品像素）原样盖回去
  const frontLayer = process.env.FRONT_LAYER
  if (mode === 'harmonize' && frontLayer) {
    const pos = JSON.parse(await (await import('node:fs/promises')).readFile(frontLayer.replace(/\.png$/, '.json'), 'utf8'))
    const aiOnly = outputPath.replace(/\.png$/, '-ai-only.png')
    await (await import('node:fs/promises')).copyFile(outputPath, aiOnly)
    await sharp(aiOnly).composite([{ input: frontLayer, left: pos.left, top: pos.top }]).png().toFile(outputPath)
    console.log(`已锁回前半圈 → ${outputPath}（AI 原样结果：${aiOnly}）`)
  }
  console.log(`擦除完成 用时 ${Math.round((Date.now() - startedAt) / 1000)} 秒 → ${outputPath}`)
  process.exit(0)
}

main().catch((error) => {
  console.error(String(error?.message || error).replace(/sk-[A-Za-z0-9]{6,}/g, 'sk-***'))
  process.exit(1)
})
