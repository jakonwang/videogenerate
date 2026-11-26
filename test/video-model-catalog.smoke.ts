import assert from 'node:assert/strict'

/**
 * 图生视频模型清单：每种请求格式拼出来的请求体、各家返回值解析、后台开关、按模型提交 / 查询、云端代理分类。
 * 请求体字段以 2026-11 的三家文档为准（高瑞 / 小扳手 5208.ai / GRS.AI）。
 */
async function main() {
  const models = await import('../src/shared/videoModels')
  const { VIDEO_MODEL_CATALOG, findVideoModelSpec, buildVideoSubmitRequest, resolveVideoParams, parseVideoTaskResponse, resolveEnabledVideoModelIds, buildVideoQueryPath } = models

  // 清单 id 唯一，默认值都在可选范围里
  const ids = new Set(VIDEO_MODEL_CATALOG.map((spec) => spec.id))
  assert.equal(ids.size, VIDEO_MODEL_CATALOG.length, 'catalog ids must be unique')
  for (const spec of VIDEO_MODEL_CATALOG) {
    assert.ok(spec.durations.includes(spec.defaultDuration), `${spec.id} default duration`)
    assert.ok(spec.resolutions.includes(spec.defaultResolution), `${spec.id} default resolution`)
    assert.ok(spec.aspectRatios.includes('9:16'), `${spec.id} must support 9:16 (live photo is vertical)`)
    const req = buildVideoSubmitRequest(spec, resolveVideoParams(spec, { prompt: 'p', firstFrameUrl: 'https://img/a.png', aspectRatio: '9:16' }))
    assert.equal(req.body.model, spec.model)
  }

  const build = (id: string, extra: Record<string, unknown> = {}) => {
    const spec = findVideoModelSpec(id)!
    assert.ok(spec, id)
    return buildVideoSubmitRequest(spec, resolveVideoParams(spec, { prompt: 'move', firstFrameUrl: 'https://img/first.png', aspectRatio: '9:16', ...extra }))
  }

  // 高瑞 Veo：images，没有时长参数
  const veo = build('gaorui:veo_3_1-fl', { durationSec: 6 })
  assert.deepEqual(veo.body, { model: 'veo_3_1-fl', prompt: 'move', images: ['https://img/first.png'], aspect_ratio: '9:16', resolution: '720p' })

  // 高瑞 Kling：operation + duration_seconds（整数）+ media_inputs，时长收敛到 5 / 10
  const kling = build('gaorui:kling-v2.6', { durationSec: 7 })
  assert.equal(kling.body.operation, 'image_to_video')
  assert.equal(kling.body.duration_seconds, 5)
  assert.deepEqual(kling.body.media_inputs, [{ kind: 'image', role: 'first_frame', url: 'https://img/first.png' }])
  assert.equal('images' in kling.body, false)

  // 高瑞 Grok：size 写比例、seconds、image_urls
  const grok = build('gaorui:grok-imagine-video-1.5', { durationSec: 9 })
  assert.equal(grok.body.size, '9:16')
  assert.equal(grok.body.seconds, 9)
  assert.deepEqual(grok.body.image_urls, ['https://img/first.png'])

  // 高瑞 Omni：input_reference + first_last_frame；固定时长型号不发 seconds
  const omni = build('gaorui:omni_flash_10s')
  assert.deepEqual(omni.body.input_reference, ['https://img/first.png'])
  assert.equal(omni.body.first_last_frame, true)
  assert.equal('seconds' in omni.body, false)
  // Omni 1.2 首尾帧最长 10 秒
  const omni12 = build('gaorui:omni_flash-1.2', { durationSec: 15, lastFrameUrl: 'https://img/last.png' })
  assert.equal(omni12.body.seconds, 10)

  // 高瑞 MiniMax：metadata.first_frame
  const minimax = build('gaorui:minimax-h3')
  assert.deepEqual(minimax.body.metadata, { first_frame: 'https://img/first.png' })

  // 高瑞 Seedance：火山格式 content[]，role first_frame
  const seedance = build('gaorui:seedance-2.0-fast', { durationSec: 5 })
  assert.deepEqual((seedance.body.content as any[])[1], { type: 'image_url', image_url: { url: 'https://img/first.png' }, role: 'first_frame' })
  assert.equal(seedance.body.ratio, '9:16')
  assert.equal(seedance.body.generate_audio, false)

  // 小扳手 Seedance：seconds 是字符串，first_last_frame
  const xibSeedance = build('xibapi:seedance-2.0-mini', { durationSec: 8 })
  assert.deepEqual(xibSeedance.body, {
    model: 'seedance-2.0-mini',
    prompt: 'move',
    images: ['https://img/first.png'],
    aspect_ratio: '9:16',
    resolution: '480p', // 小扳手 Seedance 只收 480p（2026-11-26 实测 720p 被拒）
    seconds: '8',
    first_last_frame: true,
  })
  // 小扳手 Veo / Omni：用 size（宽x高），不发 seconds
  const xibVeo = build('xibapi:veo_3_1-lite-hd-fl')
  assert.equal(xibVeo.body.size, '1080x1920')
  assert.equal('seconds' in xibVeo.body, false)
  const xibOmni = build('xibapi:omni_flash-10s-fl')
  assert.equal(xibOmni.body.size, '720x1280')
  // 小扳手 Muse：不用 size，不发 first_last_frame
  const muse = build('xibapi:muse-video-fl', { durationSec: 20 })
  assert.equal(muse.body.seconds, '20')
  assert.equal('size' in muse.body, false)
  assert.equal('first_last_frame' in muse.body, false)

  // GRS：/v1/api/generate，驼峰字段，replyType async
  const grs = build('grsai:wan-3.0', { durationSec: 12 })
  assert.equal(grs.path, '/v1/api/generate')
  assert.deepEqual(grs.body, { model: 'wan-3.0', prompt: 'move', aspectRatio: '9:16', resolution: '720p', duration: 12, firstFrame: 'https://img/first.png', replyType: 'async' })
  assert.equal(buildVideoQueryPath(findVideoModelSpec('grsai:wan-3.0')!, 'a b'), '/v1/api/result?id=a%20b')
  assert.equal(buildVideoQueryPath(findVideoModelSpec('xibapi:minimax-h3')!, 'task_1'), '/v1/videos/task_1')

  // 清晰度：支持的就用，不支持退回默认
  assert.equal(build('gaorui:veo_3_1-fl', { resolution: '1080p' }).body.resolution, '1080p')
  assert.equal(build('gaorui:veo_3_1-fl', { resolution: '4k' }).body.resolution, '720p')
  assert.equal(build('grsai:agnes-video-2.5', { resolution: '2k' }).body.resolution, '2k')
  // 首尾帧：各格式的尾帧位置
  const last = { lastFrameUrl: 'https://img/last.png' }
  assert.deepEqual(build('gaorui:veo_3_1-fl', last).body.images, ['https://img/first.png', 'https://img/last.png'])
  assert.deepEqual((build('gaorui:kling-v3.0', last).body.media_inputs as any[])[1], { kind: 'image', role: 'last_frame', url: 'https://img/last.png' })
  assert.equal((build('gaorui:kling-v2.6', last).body.media_inputs as any[]).length, 1, 'kling 2.6 has no last frame')
  assert.equal((build('gaorui:minimax-h3', last).body.metadata as any).last_frame, 'https://img/last.png')
  assert.equal((build('gaorui:seedance-2.0-mini', last).body.content as any[])[2].role, 'last_frame')
  assert.deepEqual(build('xibapi:muse-video-fl', last).body.images, ['https://img/first.png', 'https://img/last.png'])
  assert.equal(build('grsai:agnes-video-2.5', last).body.lastFrame, 'https://img/last.png')

  // 返回值解析
  // 同步返回只有视频地址、没有状态：算完成
  assert.equal(parseVideoTaskResponse({ url: 'https://v/direct.mp4' }).status, 'succeeded')
  assert.deepEqual(parseVideoTaskResponse({ id: 't1', status: 'queued', progress: 0 }), { taskId: 't1', status: 'running', url: undefined, progress: 0, error: undefined })
  assert.equal(parseVideoTaskResponse({ id: 't1', status: 'completed', url: 'https://v/1.mp4' }).url, 'https://v/1.mp4')
  assert.equal(parseVideoTaskResponse({ id: 't1', status: 'in_progress' }).status, 'running')
  assert.equal(parseVideoTaskResponse({ id: 'cgt-1', task_id: 'tk', status: 'succeeded', content: { video_url: 'https://v/s.mp4' } }).url, 'https://v/s.mp4')
  assert.equal(parseVideoTaskResponse({ id: 'cgt-1', task_id: 'tk', status: 'succeeded' }).taskId, 'tk')
  assert.equal(parseVideoTaskResponse({ id: 'g', status: 'succeeded', results: [{ url: 'https://v/g.mp4' }] }).status, 'succeeded')
  assert.equal(parseVideoTaskResponse({ status: 'SUCCESS', video_url: 'https://v/m.mp4' }).status, 'succeeded')
  const violation = parseVideoTaskResponse({ id: 'g', status: 'violation', error: 'nsfw' })
  assert.equal(violation.status, 'failed')
  assert.match(violation.error!, /内容违规/)
  assert.equal(parseVideoTaskResponse({ id: 'x', status: 'failed', error: { message: 'boom', code: 'task_failed' } }).error, 'boom')
  // 完成但还没地址：继续等
  assert.equal(parseVideoTaskResponse({ id: 'x', status: 'completed' }).status, 'running')

  // 后台开关：没设置 = 清单默认值；设置了就按设置
  const defaults = resolveEnabledVideoModelIds(undefined)
  assert.ok(defaults.includes('gaorui:kling-v2.6'))
  assert.ok(!defaults.includes('gaorui:wan3.0'), 'gaorui wan is off by default')
  const switched = resolveEnabledVideoModelIds({ 'gaorui:kling-v2.6': false, 'gaorui:wan3.0': true })
  assert.ok(!switched.includes('gaorui:kling-v2.6'))
  assert.ok(switched.includes('gaorui:wan3.0'))

  // 后台设置下发到客户端
  const { applyManagedSettings, normalizeManagedSettings } = await import('../src/shared/cloud/managedSettings')
  const managed = normalizeManagedSettings({
    enabled: true,
    platforms: { gaorui: { apiKey: 'k', baseUrl: 'https://gaorui.cc' } },
    capabilities: { video: { platform: 'gaorui', model: '', modelSwitches: { 'gaorui:kling-v2.6': false, 'bogus:model': true }, defaultModelId: 'gaorui:veo_3_1-fl' } },
  })
  assert.deepEqual(managed.capabilities.video.modelSwitches, { 'gaorui:kling-v2.6': false })
  const applied = applyManagedSettings({}, managed)
  assert.deepEqual(applied.videoModelSwitches, { 'gaorui:kling-v2.6': false })
  assert.equal(applied.videoDefaultModelId, 'gaorui:veo_3_1-fl')
  assert.equal(normalizeManagedSettings({ capabilities: { video: { defaultModelId: 'nope' } } }).capabilities.video.defaultModelId, '')

  // 图片、对话都可以走小扳手 / 高瑞；不认识的平台落回默认 GRS.AI
  const hubManaged = normalizeManagedSettings({
    enabled: true,
    platforms: { xibapi: { apiKey: 'k1', baseUrl: 'https://5208.ai' }, gaorui: { apiKey: 'k2', baseUrl: 'https://gaorui.cc' } },
    capabilities: {
      image: { platform: 'xibapi', model: 'gpt-image-2.6', quality: 'high' },
      chat: { platform: 'gaorui', model: 'gemini-3.1-pro' },
      video: { platform: 'gaorui', model: 'veo_3_1-fl' },
    },
  })
  assert.equal(hubManaged.capabilities.image.platform, 'xibapi')
  assert.equal(hubManaged.capabilities.chat.platform, 'gaorui')
  assert.equal(normalizeManagedSettings({ capabilities: { chat: { platform: 'xibapi', model: 'x' } } }).capabilities.chat.platform, 'xibapi')
  assert.equal(normalizeManagedSettings({ capabilities: { chat: { platform: 'vectorengine', model: 'x' } } }).capabilities.chat.platform, 'grsai')
  const { normalizeCredentials: normalizeCreds } = await import('../src/main/modules/clone/credentials')
  const hubCreds = normalizeCreds(applyManagedSettings({}, hubManaged))
  assert.equal(hubCreds.imageProviderPrimary, 'apifox_hub')
  assert.equal(hubCreds.imageApifoxHubProfile, 'xibapi')
  assert.equal(hubCreds.xibapiHub?.imageModel, 'gpt-image-2.6')
  assert.equal(hubCreds.chatProviderPrimary, 'apifox_hub')
  assert.equal(hubCreds.chatApifoxHubProfile, 'gaorui')
  assert.equal(hubCreds.gaoruiHub?.chatModel, 'gemini-3.1-pro')
  const { resolveApifoxHubCredentials } = await import('../src/main/modules/clone/apifoxProfile')
  assert.equal(resolveApifoxHubCredentials(hubCreds, 'image')?.baseUrl, 'https://5208.ai')
  assert.equal(resolveApifoxHubCredentials(hubCreds, 'chat')?.baseUrl, 'https://gaorui.cc')

  // 本地凭据保存时不丢
  const { normalizeCredentials } = await import('../src/main/modules/clone/credentials')
  const creds = normalizeCredentials({ videoModelSwitches: { 'xibapi:minimax-h3': false }, videoDefaultModelId: 'xibapi:seedance-2.0' })
  assert.deepEqual(creds.videoModelSwitches, { 'xibapi:minimax-h3': false })
  assert.equal(creds.videoDefaultModelId, 'xibapi:seedance-2.0')

  // 按模型提交 / 查询（打桩 fetch）
  const catalog = await import('../src/main/modules/clone/catalogVideo')
  const credentials = {
    gaoruiHub: { apiKey: 'sk-gaorui', baseUrl: 'https://gaorui.cc/' },
    xibapiHub: { apiKey: '', baseUrl: 'https://5208.ai' },
    grsaiApiKey: 'sk-grs',
    grsaiHost: 'https://grsaiapi.com',
    videoModelSwitches: { 'gaorui:kling-v2.1': false },
  } as any
  const available = catalog.listAvailableCatalogVideoModels(credentials)
  assert.ok(available.models.some((item) => item.id === 'gaorui:kling-v2.6'))
  assert.ok(!available.models.some((item) => item.id === 'gaorui:kling-v2.1'), 'switched off')
  assert.ok(!available.models.some((item) => item.platform === 'xibapi'), 'xibapi has no key')
  assert.throws(() => catalog.pickCatalogVideoModel(credentials, 'gaorui:kling-v2.1'), /已被关闭/)
  assert.throws(() => catalog.pickCatalogVideoModel(credentials, 'xibapi:minimax-h3'), /已被关闭或平台未配置/)
  assert.equal(catalog.pickCatalogVideoModel(credentials), findVideoModelSpec(available.defaultModelId))

  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; method: string; auth: string; body?: any }> = []
  let nextResponses: Array<{ status: number; json: unknown }> = []
  globalThis.fetch = (async (input: any, init?: any) => {
    calls.push({ url: String(input), method: init?.method, auth: init?.headers?.Authorization, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const next = nextResponses.shift() ?? { status: 200, json: {} }
    return { ok: next.status >= 200 && next.status < 300, status: next.status, text: async () => JSON.stringify(next.json) } as any
  }) as any
  try {
    nextResponses = [{ status: 200, json: { id: 'k1', status: 'queued' } }]
    const submitted = await catalog.submitCatalogVideoTask({
      credentials,
      spec: findVideoModelSpec('gaorui:kling-v2.6')!,
      params: { prompt: 'go', firstFrameUrl: 'https://img/f.png', durationSec: 10, aspectRatio: '9:16' },
    })
    assert.equal(submitted.taskId, 'k1')
    assert.equal(calls[0].url, 'https://gaorui.cc/v1/videos')
    assert.equal(calls[0].auth, 'Bearer sk-gaorui', 'sk- keys still need Bearer')
    assert.equal(calls[0].body.duration_seconds, 10)

    // 高瑞只收 URL
    await assert.rejects(
      catalog.submitCatalogVideoTask({ credentials, spec: findVideoModelSpec('gaorui:kling-v2.6')!, params: { prompt: 'go', firstFrameUrl: 'data:image/png;base64,AAA' } }),
      /公网图片地址/,
    )

    nextResponses = [{ status: 200, json: { id: 'k1', status: 'completed', url: 'https://cdn/k1.mp4' } }]
    const done = await catalog.queryCatalogVideoTask({ credentials, modelId: 'gaorui:kling-v2.6', taskId: 'k1' })
    assert.deepEqual([done.status, done.url], ['succeeded', 'https://cdn/k1.mp4'])

    // GRS：违规时 HTTP 400 也带 status
    calls.length = 0
    nextResponses = [{ status: 400, json: { id: 'g1', status: 'violation', error: 'blocked' } }]
    const grsResult = await catalog.queryCatalogVideoTask({ credentials, modelId: 'grsai:wan-3.0', taskId: 'g1' })
    assert.equal(calls[0].url, 'https://grsaiapi.com/v1/api/result?id=g1')
    assert.equal(grsResult.status, 'failed')
    assert.match(grsResult.error!, /内容违规/)

    // 查询 5xx：当作还在跑
    nextResponses = [{ status: 502, json: {} }]
    assert.equal((await catalog.queryCatalogVideoTask({ credentials, modelId: 'grsai:wan-3.0', taskId: 'g1' })).status, 'running')
    // 查询 404：任务过期
    nextResponses = [{ status: 404, json: {} }]
    assert.equal((await catalog.queryCatalogVideoTask({ credentials, modelId: 'gaorui:kling-v2.6', taskId: 'zz' })).status, 'failed')

    // 提交时平台报错：带上平台的错误信息
    nextResponses = [{ status: 400, json: { error: { message: 'invalid duration', code: 'invalid_duration' } } }]
    await assert.rejects(
      catalog.submitCatalogVideoTask({ credentials, spec: findVideoModelSpec('gaorui:minimax-h3')!, params: { prompt: 'go', firstFrameUrl: 'https://img/f.png' } }),
      /invalid_duration.*invalid duration/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }

  // 云端代理：/v1/videos 按模型分图片 / 视频；GRS /v1/api/generate 要扣点
  const { classifyProxyRequest, pickTaskStatus } = await import('../services/cloud/src/aiProxy')
  const classify = (path: string, model: string) => classifyProxyRequest({ platform: 'gaorui', method: 'POST', path, model })
  assert.deepEqual(classify('/v1/videos', 'kling-v2.6'), { kind: 'charge', capability: 'video', track: true })
  assert.deepEqual(classify('/v1/videos', 'gpt-image-2'), { kind: 'charge', capability: 'image', track: true })
  assert.deepEqual(classify('/v1/videos', 'grok-imagine-video-1.5'), { kind: 'charge', capability: 'video', track: true })
  assert.deepEqual(classify('/v1/api/generate', 'wan-3.0'), { kind: 'charge', capability: 'video', track: true })
  assert.deepEqual(classify('/v1/api/generate', 'nano-banana-2'), { kind: 'charge', capability: 'image', track: true })
  assert.deepEqual(classify('/v1/api/generate', ''), { kind: 'unknown' })
  assert.equal(pickTaskStatus({ status: 'violation' }), 'failed')

  console.log('video-model-catalog smoke passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
