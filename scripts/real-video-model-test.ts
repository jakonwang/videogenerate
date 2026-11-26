/**
 * 用真实平台 Key 跑图生视频（走 src/shared/videoModels.ts + catalogVideo.ts 同一套代码）。
 *
 * 用法：
 *   npx tsx scripts/real-video-model-test.ts <keys.json | services/cloud/data/cloud.sqlite> <首帧图片公网URL> <模型id,模型id,...> [尾帧推近%]
 *
 * keys.json（不要提交到仓库）：
 *   { "gaorui": { "baseUrl": "https://gaorui.cc", "apiKey": "sk-..." },
 *     "xibapi": { "baseUrl": "https://5208.ai", "apiKey": "sk-..." },
 *     "grsai":  { "baseUrl": "https://grsaiapi.com", "apiKey": "sk-..." } }
 *
 * 不打印任何 Key。每个模型会真实扣费一次。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { findVideoModelSpec } from '../src/shared/videoModels'
import { queryCatalogVideoTask, submitCatalogVideoTask } from '../src/main/modules/clone/catalogVideo'

/** 直接读本地云端（services/cloud/data/cloud.sqlite）后台「软件设置」里的平台 Key，不打印 */
async function readKeysFromCloudDb(dbPath: string) {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const row = db.prepare("SELECT value FROM app_config WHERE key LIKE '%managed%' LIMIT 1").get() as { value?: string } | undefined
  db.close()
  if (!row?.value) throw new Error('本地后台还没有保存软件设置')
  const settings = JSON.parse(row.value)
  const pick = (key: string, fallback: string) => {
    const p = settings.platforms?.[key]
    return p?.apiKey ? { apiKey: p.apiKey, baseUrl: p.baseUrl || fallback } : undefined
  }
  return { gaorui: pick('gaorui', 'https://gaorui.cc'), xibapi: pick('xibapi', 'https://5208.ai'), grsai: pick('grsai', 'https://grsaiapi.com') }
}

async function main() {
  const [keysPath, firstFrameArg, modelArg, zoomArg] = process.argv.slice(2)
  let firstFrameUrl = String(firstFrameArg || '')
  if (!keysPath || !firstFrameArg || !modelArg) {
    console.error('用法：npx tsx scripts/real-video-model-test.ts <keys.json> <首帧URL> <模型id,...> [尾帧推近%]')
    process.exit(2)
  }
  // 首帧写成 file:<本地路径> 时，读本地图片转 base64（小扳手、GRS 收 base64；高瑞只收 URL）
  if (firstFrameUrl.startsWith('file:')) {
    const buffer = await readFile(firstFrameUrl.slice(5))
    const mime = /\.png$/i.test(firstFrameUrl) ? 'image/png' : 'image/jpeg'
    firstFrameUrl = `data:${mime};base64,${buffer.toString('base64')}`
  }
  // 首帧写成 b64:<URL> 时，先下载再转成 base64 data URI（排查平台是否不认外链）
  if (firstFrameUrl.startsWith('b64:')) {
    const res = await fetch(firstFrameUrl.slice(4))
    const mime = res.headers.get('content-type') || 'image/jpeg'
    firstFrameUrl = `data:${mime};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
  }
  const keys = keysPath.endsWith('.sqlite') ? await readKeysFromCloudDb(keysPath) : JSON.parse(await readFile(keysPath, 'utf8'))
  const credentials: any = {
    gaoruiHub: keys.gaorui ? { apiKey: keys.gaorui.apiKey, baseUrl: keys.gaorui.baseUrl || 'https://gaorui.cc' } : undefined,
    xibapiHub: keys.xibapi ? { apiKey: keys.xibapi.apiKey, baseUrl: keys.xibapi.baseUrl || 'https://5208.ai' } : undefined,
    grsaiApiKey: keys.grsai?.apiKey,
    grsaiHost: keys.grsai?.baseUrl || 'https://grsaiapi.com',
  }
  const outDir = join(process.cwd(), 'test', 'artifacts', 'real-video-model-test')
  await mkdir(outDir, { recursive: true })
  // 环境变量 VIDEO_PROMPT 可以换提示词；OUT_TAG 用来区分同一模型的多次对照
  const prompt = process.env.VIDEO_PROMPT || 'The product stays still and sharp; soft daylight; very slow gentle camera push-in; no new objects.'
  const outTag = process.env.OUT_TAG ? `_${process.env.OUT_TAG}` : ''
  const results: any[] = []

  for (const modelId of modelArg.split(',').map((item) => item.trim()).filter(Boolean)) {
    const spec = findVideoModelSpec(modelId)
    if (!spec) {
      results.push({ modelId, ok: false, error: '清单里没有这个模型' })
      continue
    }
    // 尾帧：这里不能本地放大（图在网上），传了推近比例就直接把首帧当尾帧，只验证首尾帧字段平台收不收
    const lastFrameUrl = spec.lastFrame && Number(zoomArg) > 0 ? firstFrameUrl : undefined
    const startedAt = Date.now()
    const row: any = { modelId, label: spec.label, platform: spec.platform, lastFrame: Boolean(lastFrameUrl) }
    try {
      const created = await submitCatalogVideoTask({
        credentials,
        spec,
        params: { prompt, firstFrameUrl, lastFrameUrl, aspectRatio: '9:16', durationSec: spec.defaultDuration, resolution: spec.defaultResolution },
      })
      row.taskId = created.taskId
      row.submitMs = Date.now() - startedAt
      console.log(`[${modelId}] 已提交 taskId=${created.taskId} 请求体字段=${Object.keys(created.request.body).join(',')}`)
      let snapshot = created.snapshot
      const deadline = Date.now() + 25 * 60 * 1000
      while (snapshot.status === 'running' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10_000))
        snapshot = await queryCatalogVideoTask({ credentials, modelId, taskId: String(created.taskId) })
        console.log(`[${modelId}] ${snapshot.status}${snapshot.progress !== undefined ? ` ${snapshot.progress}%` : ''}`)
      }
      row.status = snapshot.status
      row.totalSec = Math.round((Date.now() - startedAt) / 1000)
      if (snapshot.status === 'succeeded' && snapshot.url) {
        const res = await fetch(snapshot.url)
        const file = join(outDir, `${modelId.replace(/[:/]/g, '_')}${outTag}.mp4`)
        await writeFile(file, Buffer.from(await res.arrayBuffer()))
        row.ok = true
        row.file = file
        row.url = snapshot.url
      } else {
        row.ok = false
        row.error = snapshot.error || (snapshot.status === 'running' ? '25 分钟内没出结果' : '失败')
      }
    } catch (error: any) {
      row.ok = false
      row.error = String(error?.message || error).slice(0, 400)
      row.totalSec = Math.round((Date.now() - startedAt) / 1000)
    }
    console.log(`[${modelId}] 结果：${row.ok ? '成功' : '失败'} ${row.error || row.file || ''}`)
    results.push(row)
  }
  await writeFile(join(outDir, 'results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
