/**
 * 图生视频「贴真实商品」替换的测试集：固定一批参考图 × 商品，按软件里同样的步骤跑到融合好的成品图（不生成视频），
 * 出一张对比总图 + 每条的结果，用来量成功率、比较每次改动前后。
 *
 *   npx tsx scripts/live-photo-eval.ts --cases test-artifacts/live-photo-eval/cases.json --out test-artifacts/live-photo-eval/run-<名字>
 *     [--only c01,c02] [--concurrency 3] [--analysis-model gpt-5.6-sol]
 *
 * cases.json：[{ id, reference（参考图路径）, product（商品库里的名字/编号） }]
 * 同一个输出目录重跑时，已经做好的步骤（定位、擦图、挑图、融合）直接复用，不重复花钱；要重做某一步就删掉对应文件。
 *
 * 抠图：软件里走服务器的腾讯云抠图（要登录）。测试时本机没有服务器的密钥，改用本地按背景色抠图代替，
 * 走的仍是 ensureProductCutout 同一套后处理（补半透明、只留一只、裁边）；结果里记了用的是哪种。
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

type EvalCase = { id: string; reference: string; product: string; category?: string }
type CaseResult = {
  id: string
  product: string
  status: 'done' | 'rejected' | 'error'
  reason?: string
  view?: string
  sizePx?: number
  interaction?: string
  cutoutSource?: string
  pair?: boolean
  fellBack?: boolean
  drift?: number
  seconds?: number
}

function arg(name: string, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback
}

const DATA_DIR = 'E:/VideoGenerate/userData/.videogenerate'

async function main() {
  const casesPath = resolve(arg('cases', 'test-artifacts/live-photo-eval/cases.json'))
  const outDir = resolve(arg('out', `test-artifacts/live-photo-eval/run-${new Date().toISOString().slice(0, 10)}`))
  const only = arg('only').split(',').map((s) => s.trim()).filter(Boolean)
  const concurrency = Math.max(1, Number(arg('concurrency', '3')) || 3)
  // 抠图缓存等写到测试目录，不碰软件自己的缓存
  process.env.VIDEOGENERATE_DATA_DIR = join(outDir, '.data')

  const paste = await import('../src/main/modules/live-photo/pasteReplace')
  const { normalizeAutoLocatedLivePhotoReplacementRegion } = await import('../src/main/modules/live-photo/replacementRegion')
  const { extractJsonObjectText, extractModelMessageContent } = await import('../src/main/modules/clone/aiResponse')
  const sharp = (await import('sharp')).default

  const settings = JSON.parse(await readFile(join(DATA_DIR, 'db/clone-settings.json'), 'utf8'))
  // clone-settings.json 里的分析模型可能是旧的，软件实际用的由 --analysis-model 指定
  const credentials = { ...settings.plaintextCredentials, grsaiAnalysisModel: arg('analysis-model', 'gpt-5.6-sol') }
  const products = JSON.parse(await readFile(join(DATA_DIR, 'db/products.json'), 'utf8')).products as any[]
  const cases = (JSON.parse(await readFile(casesPath, 'utf8')) as EvalCase[]).filter((c) => !only.length || only.includes(c.id))
  await mkdir(outDir, { recursive: true })

  // 本地抠图：按四周背景色算每个像素和背景差多少，差得越多越不透明
  paste.setProductCutoutProvider(async ({ image }) => {
    const { data, info } = await sharp(Buffer.from(image, 'base64')).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const W = info.width
    const H = info.height
    const border: number[][] = [[], [], []]
    for (let x = 0; x < W; x += 1) for (const y of [0, 1, H - 2, H - 1]) for (let c = 0; c < 3; c += 1) border[c].push(data[(y * W + x) * 3 + c])
    for (let y = 0; y < H; y += 1) for (const x of [0, 1, W - 2, W - 1]) for (let c = 0; c < 3; c += 1) border[c].push(data[(y * W + x) * 3 + c])
    const bg = border.map((values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)])
    const mask = Buffer.alloc(W * H)
    for (let i = 0; i < W * H; i += 1) {
      const d = Math.hypot(data[i * 3] - bg[0], data[i * 3 + 1] - bg[1], data[i * 3 + 2] - bg[2])
      mask[i] = Math.max(0, Math.min(255, Math.round(((d - 22) / 48) * 255)))
    }
    const png = await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).median(3).png().toBuffer()
    return { mask: png.toString('base64') }
  })

  async function chat(text: string, imagePath: string) {
    const img = await sharp(imagePath).rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
    const res = await fetch(`${String(credentials.grsaiHost || 'https://grsaiapi.com').replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${credentials.grsaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: credentials.grsaiAnalysisModel,
        stream: false,
        temperature: 0,
        messages: [
          { role: 'system', content: 'You are a precise JSON-only product localization system.' },
          { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img.toString('base64')}` } }] },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    })
    const body = await res.text()
    if (!res.ok) throw new Error(`locate HTTP ${res.status} ${body.slice(0, 160)}`)
    return JSON.parse(extractJsonObjectText(extractModelMessageContent(body)))
  }

  // 和 service.ts 里 locateLivePhotoReplacementRegion 的提示词保持一致
  function locatePrompt(type: string) {
    const span = /neck|pendant|chain/.test(type)
      ? ['This is a necklace: the rectangle must include the WHOLE visible necklace — the pendant AND the entire visible chain on both sides of the neck up to where it leaves the frame or goes behind the neck — not only the pendant.']
      : /brace|bangle/.test(type)
        ? ['This is a bracelet: the rectangle must include the whole visible bracelet around the wrist, not only one charm.']
        : []
    return [
      'Locate the existing product that must be replaced in the supplied scene image.',
      'Return JSON only with this exact shape:',
      '{"x":0,"y":0,"width":0,"height":0,"confidence":0,"interaction":{"mode":"held","confidence":0,"support":"","occlusion":""}}',
      'All coordinates must be normalized to the full image range from 0 to 1.',
      'The rectangle must tightly include the complete visible product and its contact point.',
      ...span,
      'Do not include unrelated hands, face, body, clothing, or background unless required to include the product contact point.',
      'Classify interaction.mode as exactly one of: worn, held, placed, hanging, attached, none, unknown.',
      'Use held when fingers or a hand pinch, grip, support, or present the product without wearing it.',
      'Use worn only when the product is actually attached around or through a body part in its normal wearing position.',
      'Describe the physical support and which parts occlude each other.',
      `Product category: ${type}.`,
    ].join('\n')
  }

  async function readJson<T>(path: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as T
    } catch {
      return null
    }
  }

  async function runCase(c: EvalCase): Promise<CaseResult> {
    const started = Date.now()
    const dir = join(outDir, c.id)
    await mkdir(dir, { recursive: true })
    const product = products.find((p) => p.name === c.product || p.code === c.product)
    if (!product) return { id: c.id, product: c.product, status: 'error', reason: `商品库里没有 ${c.product}` }
    const type = String(product.type || 'product')
    const base = { id: c.id, product: c.product }
    try {
      // 1. 定位旧商品
      let located = await readJson<any>(join(dir, 'locate.json'))
      if (!located) {
        located = await chat(locatePrompt(type), c.reference)
        await writeFile(join(dir, 'locate.json'), JSON.stringify(located, null, 1))
      }
      const region = normalizeAutoLocatedLivePhotoReplacementRegion(located, Date.now())
      if (!region) return { ...base, status: 'error', reason: '没定位到旧商品' }
      // 2. 参考图能不能换
      let check = await readJson<any>(join(dir, 'check.json'))
      if (!check) {
        check = await paste.checkReferenceSuitability({ credentials, referenceScenePath: c.reference, region, productType: type })
        await writeFile(join(dir, 'check.json'), JSON.stringify(check, null, 1))
      }
      const meta = { view: check.view, sizePx: check.sizePx, interaction: located?.interaction?.mode }
      if (!check.suitable) return { ...base, ...meta, status: 'rejected', reason: check.reason, seconds: Math.round((Date.now() - started) / 1000) }
      // 3. 擦掉旧商品
      const erased = join(dir, 'erased.png')
      if (!existsSync(erased)) await paste.eraseRegionProduct({ credentials, scenePath: c.reference, region, outputPath: erased })
      // 4. 按角度挑商品图：商品图 + 六视图（去掉背面两格）
      let pick = await readJson<any>(join(dir, 'pick.json'))
      if (!pick) {
        // 和 service.ts 的 collectLivePhotoProductViews 保持一致
        const candidates = [...(product.images || []).map((image: any) => image.filePath)].filter((p: string) => p && existsSync(p))
        const board = String(product.analysisBoardPath || '')
        if (board && existsSync(board)) {
          const views = await paste.splitAnalysisBoard(board, join(dir, 'views'))
          candidates.push(...paste.pasteUsableBoardViews(views))
        }
        const picked = await paste.pickProductViewByAngle({ credentials, referenceScenePath: c.reference, region, candidatePaths: candidates, workDir: dir })
        pick = { path: picked?.path || candidates[0], pair: picked ? paste.resolveCutoutPair(picked.pair, located?.interaction?.mode) : ['held', 'placed', 'none'].includes(String(located?.interaction?.mode || '')), index: picked?.index }
        await writeFile(join(dir, 'pick.json'), JSON.stringify(pick, null, 1))
      }
      const cutout = await paste.ensureProductCutout(pick.path, { keepPair: Boolean(pick.pair) })
      // 5. 默认摆放 → 贴上 → 融合
      const scene = await paste.readImageSize(erased)
      const placement = paste.defaultProductPlacement({
        region, sceneWidth: scene.width, sceneHeight: scene.height, cutoutWidth: cutout.width, cutoutHeight: cutout.height,
        foreshortened: check.view === 'flat',
      })
      const guidePath = join(dir, 'guide.png')
      const guide = await paste.renderPlacementGuide({ erasedScenePath: erased, cutoutPath: cutout.path, placement, outputPath: guidePath })
      // 融合一次出几张（软件里由用户挑）；final.png 放第一张，cand-*.png 是全部
      let integrated = await readJson<any>(join(dir, 'integrate.json'))
      if (!integrated || !existsSync(join(dir, 'final.png'))) {
        const views = [pick.path, ...(product.images || []).map((image: any) => image.filePath)]
          .filter((p: string, i: number, all: string[]) => p && existsSync(p) && all.indexOf(p) === i).slice(0, 3)
        integrated = await paste.integratePlacedProduct({
          credentials, referenceScenePath: c.reference, guidePath, erasedScenePath: erased, productMaskPath: guide.maskPath,
          productViewPaths: views, productType: type, productBounds: guide.bounds, region,
          interactionMode: located?.interaction?.mode, outputDir: join(dir, 'integrate'),
        })
        for (const [i, candidate] of integrated.candidates.entries()) await writeFile(join(dir, `cand-${i + 1}.png`), await readFile(candidate.path))
        await writeFile(join(dir, 'final.png'), await readFile(integrated.candidates[0].path))
        await writeFile(join(dir, 'integrate.json'), JSON.stringify(integrated, null, 1))
      }
      await writeFile(join(dir, 'region.json'), JSON.stringify({ region, placement }, null, 1))
      return {
        ...base, ...meta, status: 'done', cutoutSource: 'local', pair: Boolean(pick.pair),
        drift: integrated.candidates[0]?.drift, seconds: Math.round((Date.now() - started) / 1000),
      }
    } catch (error) {
      return { ...base, status: 'error', reason: String((error as Error)?.message || error).slice(0, 300) }
    }
  }

  const results: CaseResult[] = []
  const queue = [...cases]
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const c = queue.shift()!
      const r = await runCase(c)
      results.push(r)
      console.log(`${r.id} ${r.product} ${r.status}${r.view ? ` view=${r.view}` : ''}${r.reason ? ` · ${r.reason}` : ''}${r.seconds ? ` · ${r.seconds}s` : ''}`)
    }
  }))
  results.sort((a, b) => a.id.localeCompare(b.id))
  await writeFile(join(outDir, 'results.json'), JSON.stringify(results, null, 1))

  // 对比总图：每条一格（左参考图、右成品，都裁到商品附近放大），下面一行字
  const T = 300
  const tiles: any[] = []
  for (const [i, r] of results.entries()) {
    const c = cases.find((x) => x.id === r.id)!
    const dir = join(outDir, r.id)
    const located = await readJson<any>(join(dir, 'locate.json'))
    const refMeta = await sharp(c.reference).rotate().metadata()
    const W = Number(refMeta.width)
    const H = Number(refMeta.height)
    const box = located ? { x: located.x * W, y: located.y * H, w: located.width * W, h: located.height * H } : { x: 0, y: 0, w: W, h: H }
    const side = Math.round(Math.min(W, H, Math.max(Math.max(box.w, box.h) * 2.4, Math.min(W, H) * 0.35)))
    const crop = {
      left: Math.round(Math.min(W - side, Math.max(0, box.x + box.w / 2 - side / 2))),
      top: Math.round(Math.min(H - side, Math.max(0, box.y + box.h / 2 - side / 2))),
      width: side,
      height: side,
    }
    const cut = async (path: string) => sharp(await sharp(path).rotate().resize(W, H, { fit: 'fill' }).png().toBuffer()).extract(crop).resize(T, T).png().toBuffer()
    const left = await cut(c.reference)
    const finalPath = join(dir, 'final.png')
    const right = existsSync(finalPath) ? await cut(finalPath) : await sharp({ create: { width: T, height: T, channels: 3, background: '#333' } }).png().toBuffer()
    const label = `${r.id} ${r.product} ${r.status}${r.view ? ' ' + r.view : ''}${r.fellBack ? ' FALLBACK' : ''}`
    const text = Buffer.from(`<svg width="${T * 2 + 4}" height="28"><rect width="100%" height="100%" fill="${r.status === 'done' ? '#1d3b2f' : r.status === 'rejected' ? '#4a3a12' : '#4a1515'}"/><text x="8" y="20" font-size="16" font-family="Arial" fill="#fff">${label}</text></svg>`)
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = col * (T * 2 + 16)
    const y = row * (T + 36)
    tiles.push({ input: left, left: x, top: y + 28 }, { input: right, left: x + T + 4, top: y + 28 }, { input: text, left: x, top: y })
  }
  const rows = Math.ceil(results.length / 3)
  await sharp({ create: { width: 3 * (T * 2 + 16), height: rows * (T + 36), channels: 3, background: '#111' } }).composite(tiles).jpeg({ quality: 84 }).toFile(join(outDir, 'sheet.jpg'))
  const count = (s: string) => results.filter((r) => r.status === s).length
  console.log(`\n共 ${results.length} 条：完成 ${count('done')}，被拒 ${count('rejected')}，出错 ${count('error')}。总图：${join(outDir, 'sheet.jpg')}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
