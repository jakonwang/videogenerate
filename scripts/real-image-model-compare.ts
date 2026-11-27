/**
 * 商品替换：多个图片模型横向对比（GRS /v1/api/generate，同一张参考图 + 同一张商品图 + 同一段提示词）。
 *
 * 用法：npx tsx scripts/real-image-model-compare.ts <参考图> <商品图> <输出目录> <模型,模型,...> [每个模型次数=1]
 * Key 读本地后台 services/cloud/data/cloud.sqlite，不打印。每次都会真实扣费。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

function nearestAspect(width: number, height: number) {
  const options = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '4:5', '5:4']
  const ratio = width / height
  return options.reduce((best, item) => {
    const [w, h] = item.split(':').map(Number)
    const [bw, bh] = best.split(':').map(Number)
    return Math.abs(w / h - ratio) < Math.abs(bw / bh - ratio) ? item : best
  })
}

const PROMPT = [
  'Image 1 is the scene photo. Image 2 is the product: a single silver huggie hoop earring with a star charm set with stones.',
  'Replace the white flower stud earring on the ear lobe in Image 1 with the exact earring from Image 2.',
  'The earring goes through the same piercing and is worn naturally: the hoop hugs the ear lobe, wraps around its bottom edge, and the star charm faces the camera.',
  'Copy the earring exactly from Image 2: same star shape and number of points, same stones, same stone-set front band, same plain back band, same silver color. Do not invent a different design.',
  'Size it realistically for a small huggie (about 11-12 mm) relative to the ear lobe.',
  'Remove the flower stud completely. Keep everything else in Image 1 exactly the same: ear, skin, hair, hands, background, lighting, framing.',
].join('\n')

async function main() {
  // PROMPT_FILE 可以换一段提示词做对照
  const prompt = process.env.PROMPT_FILE ? await readFile(process.env.PROMPT_FILE, 'utf8') : PROMPT
  const [referencePath, productPath, outDir, modelArg, countArg] = process.argv.slice(2)
  if (!referencePath || !productPath || !outDir || !modelArg) {
    console.error('用法：npx tsx scripts/real-image-model-compare.ts <参考图> <商品图> <输出目录> <模型,...> [次数]')
    process.exit(2)
  }
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(path.resolve('services/cloud/data/cloud.sqlite'), { readOnly: true })
  const row = db.prepare("SELECT value FROM app_config WHERE key = 'software.managedSettings'").get() as { value?: string } | undefined
  db.close()
  const settings = JSON.parse(String(row?.value || '{}'))
  const key = String(settings.platforms?.grsai?.apiKey || '')
  const host = String(settings.platforms?.grsai?.baseUrl || 'https://grsaiapi.com').replace(/\/+$/, '')
  if (!key) throw new Error('本地后台没有 GRS.AI Key')

  const sharp = (await import('sharp')).default
  const meta = await sharp(referencePath).metadata()
  const aspectRatio = nearestAspect(meta.width || 1, meta.height || 1)
  const toDataUrl = async (file: string) => `data:image/png;base64,${(await sharp(await readFile(file)).png().toBuffer()).toString('base64')}`
  const images = [await toDataUrl(referencePath), await toDataUrl(productPath)]
  await mkdir(outDir, { recursive: true })
  const count = Math.max(1, Number(countArg || 1))

  const jobs: Array<{ model: string; run: number }> = []
  for (const model of modelArg.split(',').map((item) => item.trim()).filter(Boolean)) for (let run = 1; run <= count; run += 1) jobs.push({ model, run })

  const results = await Promise.all(jobs.map(async ({ model, run }) => {
    const startedAt = Date.now()
    const tag = `${model}_${run}`
    try {
      const body: Record<string, unknown> = { model, prompt, images, aspectRatio, replyType: 'async' }
      if (/banana/i.test(model)) body.imageSize = '2K'
      const res = await fetch(`${host}/v1/api/generate`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const created: any = await res.json().catch(() => ({}))
      if (!res.ok || !created?.id) throw new Error(`提交失败 HTTP ${res.status} ${JSON.stringify(created).slice(0, 200)}`)
      let snapshot: any = created
      while (Date.now() - startedAt < 10 * 60 * 1000) {
        if (snapshot?.results?.[0]?.url || ['failed', 'violation'].includes(snapshot?.status)) break
        await new Promise((resolve) => setTimeout(resolve, 5000))
        snapshot = await (await fetch(`${host}/v1/api/result?id=${encodeURIComponent(created.id)}`, { headers: { Authorization: `Bearer ${key}` } })).json().catch(() => ({}))
        snapshot = snapshot?.data ?? snapshot
      }
      const url = snapshot?.results?.[0]?.url
      if (!url) throw new Error(`没出图：status=${snapshot?.status} ${String(snapshot?.error || '').slice(0, 200)}`)
      const file = path.join(outDir, `${(process.env.OUT_TAG ? `${process.env.OUT_TAG}_` : '') + tag.replace(/[^a-z0-9._-]/gi, '_')}.png`)
      await sharp(Buffer.from(await (await fetch(url)).arrayBuffer())).png().toFile(file)
      const seconds = Math.round((Date.now() - startedAt) / 1000)
      console.log(`[${tag}] 成功 ${seconds}s`)
      return { model, run, ok: true, file, seconds }
    } catch (error: any) {
      console.log(`[${tag}] 失败 ${String(error?.message || error).slice(0, 300)}`)
      return { model, run, ok: false, error: String(error?.message || error).slice(0, 300) }
    }
  }))
  await writeFile(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}

main().catch((error) => {
  console.error(String(error?.message || error).replace(/sk-[A-Za-z0-9]{6,}/g, 'sk-***'))
  process.exit(1)
})
