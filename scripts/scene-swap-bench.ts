/**
 * 批量换景真实效果测试：把批发图放进 tmp/scene-bench/photos，场景图放进 tmp/scene-bench/scenes，
 * 跑完在 tmp/scene-bench/out/report.html 里逐张对比。
 *
 *   npx tsx scripts/scene-swap-bench.ts                 只抠图、合成到场景原图上，不调用付费接口
 *   npx tsx scripts/scene-swap-bench.ts --paid --max 20 调用图片平台，最多 20 次
 *
 * 付费时从环境变量读：BENCH_IMAGE_KEY、BENCH_IMAGE_BASE_URL、BENCH_IMAGE_MODEL（默认 gpt-image-2），不写进任何文件。
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import sharp from 'sharp'
import { checkKeep, composeKeep, maskStats, normalizeSource, readMask } from '../services/cloud/src/sceneSwap/compose'
import { createMatting } from '../services/cloud/src/sceneSwap/matting'
import { blendPrompt, platePrompt } from '../services/cloud/src/sceneSwap/prompts'
import { normalizeCredentials } from '../src/main/modules/clone/credentials'
import { generateImage } from '../src/main/modules/clone/unifiedImage'
import { applyManagedSettings, createDefaultManagedSettings } from '../src/shared/cloud/managedSettings'

const root = resolve('tmp/scene-bench')
const paid = process.argv.includes('--paid')
const maxAt = process.argv.indexOf('--max')
const maxCalls = maxAt > 0 ? Math.max(0, Number(process.argv[maxAt + 1]) || 0) : 20

async function images(dir: string) {
  await mkdir(dir, { recursive: true })
  return (await readdir(dir)).filter((name) => /\.(jpe?g|png|webp)$/i.test(name)).sort().map((name) => join(dir, name))
}

function credentials() {
  const apiKey = process.env.BENCH_IMAGE_KEY?.trim()
  const baseUrl = process.env.BENCH_IMAGE_BASE_URL?.trim()
  if (!apiKey || !baseUrl) throw new Error('缺少 BENCH_IMAGE_KEY 或 BENCH_IMAGE_BASE_URL')
  const settings = createDefaultManagedSettings()
  settings.enabled = true
  settings.platforms.vectorengine = { apiKey, baseUrl }
  settings.capabilities.image = { platform: 'vectorengine', model: process.env.BENCH_IMAGE_MODEL?.trim() || 'gpt-image-2', quality: 'medium' }
  return normalizeCredentials({ ...applyManagedSettings({}, settings), allowMockWhenNoKey: false, openaiImageQuality: 'medium' })
}

async function main() {
  const photos = await images(join(root, 'photos'))
  const scenes = await images(join(root, 'scenes'))
  if (!photos.length || !scenes.length) {
    console.log(`请先放图：批发图 ${photos.length} 张（${join(root, 'photos')}），场景图 ${scenes.length} 张（${join(root, 'scenes')}）`)
    return
  }
  const out = join(root, 'out')
  await mkdir(out, { recursive: true })
  const creds = paid ? credentials() : null
  const matting = createMatting(resolve('services/cloud/data/models/birefnet_lite_fp16.onnx'))
  if (!matting.available()) throw new Error('抠图模型不在 services/cloud/data/models')
  console.log(`${photos.length} 张 × 每张 1 个场景；${paid ? `保真 + 融合各 1 次，共 ${photos.length * 2} 次调用，上限 ${maxCalls}` : '不调用付费接口'}`)

  const scenePaths: string[] = []
  for (const [index, scene] of scenes.entries()) {
    const path = join(out, `scene_${index}.png`)
    await normalizeSource(await readFile(scene), path)
    scenePaths.push(path)
  }

  let calls = 0
  const rows: string[] = []
  const render = async (prompt: string, refs: string[], width: number, height: number) => {
    if (!creds || calls >= maxCalls) return ''
    calls += 1
    const ratio = width / height
    const size = ratio > 1.2 ? '1536x1024' : ratio > 0.83 ? '1024x1024' : '1024x1536'
    return (await generateImage({ credentials: creds, prompt, outDir: out, filePrefix: 'r', capability: 'image_edit', imagePaths: refs, size })).outputPath
  }
  const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
  const cell = async (path: string, label: string) => {
    if (!path || !existsSync(path)) return `<td>${escape(label)}<br>—</td>`
    const thumb = await sharp(path).resize(520, 700, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 88 }).toBuffer()
    return `<td>${escape(label)}<br><a href="${escape(basename(path))}"><img src="data:image/jpeg;base64,${thumb.toString('base64')}"></a></td>`
  }

  try {
    for (const [index, photo] of photos.entries()) {
      const source = join(out, `${index}_source.png`)
      const maskPath = join(out, `${index}_mask.png`)
      const keep = join(out, `${index}_keep.jpg`)
      const scene = scenePaths[index % scenePaths.length]!
      const t = Date.now()
      let blend = ''
      let note = ''
      try {
        const { width, height } = await normalizeSource(await readFile(photo), source)
        if (!existsSync(maskPath)) await matting.run(source, maskPath)
        const mask = await readMask(maskPath, width, height)
        const stats = maskStats(mask, width, height)
        const plate = (await render(platePrompt({ stats, width, height, variation: index, reasons: [] }), [scene], width, height)) || scene
        const made = await composeKeep({ source, mask, plate, width, height, size: 'original', matchLight: true, output: keep })
        const checks = checkKeep(made.stats, made.canvas, width, height)
        note = `${checks.filter((check) => check.level === 'warn').map((check) => check.key).join('、') || '自动检查通过'} · ${plate === scene ? '背景 = 场景原图' : '背景 = AI 生成'}`
        blend = await render(blendPrompt([]), [source, scene], width, height)
      } catch (error) {
        note = `${note} 失败：${String((error as Error).message).slice(0, 200)}`
      }
      const seconds = Math.round((Date.now() - t) / 1000)
      console.log(`${index + 1}/${photos.length} ${basename(photo)} ${seconds}s ${note}`)
      rows.push(`<tr><th colspan="4">${escape(basename(photo))} · ${seconds} 秒 · ${escape(note)}</th></tr><tr>${await cell(source, '原图')}${await cell(maskPath, '抠图')}${await cell(keep, '保真')}${await cell(blend, '融合')}</tr>`)
      await writeFile(join(out, 'report.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>换景测试</title><style>body{font:14px sans-serif;margin:20px}table{border-spacing:8px}td{vertical-align:top}img{max-width:320px}th{text-align:left;padding-top:20px}</style><p>已调用付费接口 ${calls} 次</p><table>${rows.join('')}</table></html>`)
    }
  } finally {
    matting.close()
  }
  console.log(`完成，付费调用 ${calls} 次，结果：${join(out, 'report.html')}`)
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exit(1)
})
