/**
 * 图生视频（参考图替换）流水线发出的模型调用：
 * 1. 定位参考图里的商品：一次对话模型视觉调用（/v1/chat/completions，后台「对话」模型），同一张参考图只调一次；
 * 2. 图片生成：图片模型（/v1/draw/completions，gpt-image-2），绝不能落到对话模型上；
 * 3. 定位失败（网络错误）不能被标成「已提交远端，等待结果」无限循环，要计入重试次数。
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { configureAppPathRuntime } from '../src/main/lib/paths'

type Call = { url: string; model: string; kind: 'chat' | 'image_submit' | 'image_query' | 'upload' | 'other' }

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-calls-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { livePhotoService } = await import('../src/main/modules/live-photo/service')

  async function waitFor(id: string, predicate: (item: any) => boolean, timeoutMs = 15000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const current = await livePhotoService.get(id)
      if (current && predicate(current)) return current
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const last = await livePhotoService.get(id)
    throw new Error(`Timed out waiting for ${id}: ${JSON.stringify({ error: last?.error, auto: last?.autoFlowStatus })}`)
  }

  livePhotoService.setTestDependencies({
    runFfmpeg: async (input: { args: string[] }) => {
      const outPath = String(input.args[input.args.length - 1] || '').trim()
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, 'mock', 'utf-8')
    },
  })

  await cloneRepo.setCredentials({
    imageProviderPrimary: 'grsai',
    grsaiApiKey: 'test-grsai-key',
    grsaiHost: 'https://proxy.test/api/v1/ai-proxy/grsai',
    grsaiImageModel: 'gpt-image-2',
    grsaiAnalysisModel: 'gpt-5.6-sol',
    chatProviderPrimary: 'grsai',
    videoProviderPrimary: 'grsai',
    grsaiVideoModel: 'veo3.1-fast',
    qiniuAccessKey: 'test-ak',
    qiniuSecretKey: 'test-sk',
    qiniuBucket: 'test-bucket',
    qiniuDomain: 'https://example.com',
    qiniuUploadHost: 'https://upload.qiniup.com',
  } as any)

  const assetsDir = path.join(root, 'fixtures')
  await mkdir(assetsDir, { recursive: true })
  const productImage = path.join(assetsDir, 'product.jpg')
  const refImage = path.join(assetsDir, 'reference.jpg')
  const brokenRefImage = path.join(assetsDir, 'reference-broken.jpg')
  await sharp({ create: { width: 96, height: 128, channels: 3, background: '#c8b89f' } }).jpeg().toFile(productImage)
  await sharp({ create: { width: 96, height: 128, channels: 3, background: '#829ab3' } }).jpeg().toFile(refImage)
  await sharp({ create: { width: 96, height: 128, channels: 3, background: '#a08070' } }).jpeg().toFile(brokenRefImage)

  const product = await productsRepo.upsert({
    name: 'Demo Ring',
    type: 'general',
    images: [{ id: 'img-1', productId: 'pending', filePath: productImage, fileName: 'product.jpg', fileSize: 12, createdAt: Date.now(), updatedAt: Date.now(), isCover: true }],
    coverImagePath: productImage,
    analysisBoardPath: productImage,
    analysisBoardStatus: 'done',
    canonicalSourcePath: productImage,
    canonicalSourceStatus: 'done',
  } as any)

  const calls: Call[] = []
  let failLocate = false
  let imageTaskCounter = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url || input || '')
    const body = String(init?.body || '')
    let model = ''
    try {
      model = String(JSON.parse(body)?.model || '')
    } catch {
      model = ''
    }
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (url.includes('/v1/chat/completions')) {
      calls.push({ url, model, kind: 'chat' })
      if (failLocate && body.includes('Locate the existing product')) throw new TypeError('fetch failed')
      return json({ choices: [{ message: { content: '{"x":0.3,"y":0.3,"width":0.3,"height":0.25,"confidence":0.95,"interaction":{"mode":"held","confidence":0.9}}' } }] })
    }
    if (url.includes('/v1/draw/completions')) {
      calls.push({ url, model, kind: 'image_submit' })
      imageTaskCounter += 1
      return json({ id: `img-task-${imageTaskCounter}`, status: 'submitted' })
    }
    if (url.includes('/v1/draw/result')) {
      calls.push({ url, model, kind: 'image_query' })
      return json({ status: 'running' })
    }
    if (url.startsWith('https://upload.qiniup.com')) {
      calls.push({ url, model, kind: 'upload' })
      return json({ key: 'uploaded/mock.png' })
    }
    calls.push({ url, model, kind: 'other' })
    return await originalFetch(input, init)
  }) as typeof fetch

  try {
    // —— 正常流程：先定位（对话模型一次），再提交图片模型
    const first = await livePhotoService.createFromReference({ referenceImagePath: refImage, productId: product.id, motionTemplate: 'push_in' })
    const firstPending = await waitFor(first.id, (item) => Boolean(item?.imageTaskId))
    const chatCalls = calls.filter((call) => call.kind === 'chat')
    const imageSubmits = calls.filter((call) => call.kind === 'image_submit')
    assert.equal(chatCalls.length, 1, `exactly one chat call (product localization), got ${JSON.stringify(calls)}`)
    assert.equal(chatCalls[0]!.model, 'gpt-5.6-sol')
    assert.equal(imageSubmits.length, 1, 'image model submitted once')
    assert.equal(imageSubmits[0]!.model, 'gpt-image-2', 'image generation must use the image model')
    assert.ok(calls.indexOf(chatCalls[0]!) < calls.indexOf(imageSubmits[0]!), 'localization happens before image generation')
    assert.ok(imageSubmits[0]!.url.startsWith('https://proxy.test/api/v1/ai-proxy/grsai/'), 'image call goes through the cloud proxy')
    assert.equal(firstPending.imageTaskModel, 'gpt-image-2')
    const firstLogs = (firstPending.logs || []).map((log: any) => String(log.message)).join('\n')
    assert.match(firstLogs, /model call: step=locate_product provider=grsai model=gpt-5\.6-sol endpoint=\/v1\/chat\/completions/)
    assert.match(firstLogs, /model call: step=image_generation provider=grsai model=gpt-image-2 endpoint=\/v1\/draw\/completions/)
    assert.match(String(firstPending.error || ''), /\[remote_pending\].*taskId=img-task-1/)

    // 代理路径表：这条流水线用到的接口都能被正确计费
    const { classifyProxyRequest } = await import('../services/cloud/src/aiProxy')
    assert.deepEqual(classifyProxyRequest({ platform: 'grsai', method: 'POST', path: '/v1/draw/completions', model: 'gpt-image-2' }), { kind: 'charge', capability: 'image', track: true })
    assert.deepEqual(classifyProxyRequest({ platform: 'grsai', method: 'POST', path: '/v1/draw/result', model: '' }), { kind: 'free' })
    assert.deepEqual(classifyProxyRequest({ platform: 'grsai', method: 'POST', path: '/v1/chat/completions', model: 'gpt-5.6-sol' }), { kind: 'free', metered: 'chat' })
    assert.deepEqual(classifyProxyRequest({ platform: 'grsai', method: 'POST', path: '/v1/video/veo', model: 'veo3.1-fast' }), { kind: 'charge', capability: 'video', track: true })

    // —— 同一张参考图再建一个任务：定位结果复用，不再调用对话模型
    const chatBefore = calls.filter((call) => call.kind === 'chat').length
    const second = await livePhotoService.createFromReference({ referenceImagePath: refImage, productId: product.id, motionTemplate: 'push_in' })
    const secondPending = await waitFor(second.id, (item) => Boolean(item?.imageTaskId))
    assert.equal(calls.filter((call) => call.kind === 'chat').length, chatBefore, 'same reference image must not trigger another chat call')
    assert.match((secondPending.logs || []).map((log: any) => String(log.message)).join('\n'), /step=locate_product .*cached=1/)

    // —— 定位请求网络失败：不能显示成「已提交远端」，要计入重试次数并最终停下
    failLocate = true
    const submitsBefore = calls.filter((call) => call.kind === 'image_submit').length
    const broken = await livePhotoService.createFromReference({ referenceImagePath: brokenRefImage, productId: product.id, motionTemplate: 'push_in' })
    const failed = await waitFor(broken.id, (item) => item?.autoFlowStatus?.status === 'failed_terminal', 30000)
    assert.doesNotMatch(String(failed.error || ''), /\[remote_pending\]/)
    assert.match(String(failed.error || failed.autoFlowStatus?.lastError || ''), /\[locate_failed\]/)
    assert.equal(failed.imageTaskId, undefined)
    assert.equal(calls.filter((call) => call.kind === 'image_submit').length, submitsBefore, 'no image submit when localization fails')
    const locateAttempts = calls.filter((call) => call.kind === 'chat').length - chatBefore
    assert.ok(locateAttempts <= Number(failed.autoFlowStatus?.retryLimit || 2) + 1, `bounded retries, got ${locateAttempts}`)

    console.log('live-photo pipeline model calls: ok', { calls: calls.map((call) => `${call.kind}:${call.model}`) })
  } finally {
    globalThis.fetch = originalFetch
    await livePhotoService.resetTestDependencies()
  }
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
