import type http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { webPlatformService } from './service'
import { hermesLivePhotoService } from '../live-photo/hermes'
import { hermesLivePhotoAdapters } from '../live-photo/hermesAdapters'
import { hermesPlatformFormatters } from '../live-photo/hermesPlatformFormatters'
import { hermesDeliveryService } from '../live-photo/hermesDelivery'

type JsonObject = Record<string, unknown>

function isUnauthorizedErrorClean(error: unknown) {
  const message = String((error as { message?: string } | undefined)?.message ?? error ?? '').trim()
  return message === '登录已失效' || message === '登录已过期' || message === '账号不可用'
}

export function json(res: http.ServerResponse, status: number, payload: JsonObject) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(payload))
}

function mediaHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  }
}

function mediaMimeOf(filePath: string) {
  const value = String(filePath || '').trim().toLowerCase()
  if (value.endsWith('.mp4')) return 'video/mp4'
  if (value.endsWith('.mov')) return 'video/quicktime'
  if (value.endsWith('.webm')) return 'video/webm'
  if (value.endsWith('.jpg') || value.endsWith('.jpeg')) return 'image/jpeg'
  if (value.endsWith('.png')) return 'image/png'
  return 'application/octet-stream'
}

export async function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
}

export function authTokenOf(req: http.IncomingMessage) {
  const header = String(req.headers.authorization || '').trim()
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() || ''
}

export async function readBodyClean(req: http.IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
}

function isUnauthorizedError(error: unknown) {
  const message = String((error as { message?: string } | undefined)?.message ?? error ?? '').trim()
  return message === '登录已失效' || message === '登录已过期' || message === '账号不可用'
}

export async function handleWebApiRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method === 'OPTIONS') {
    json(res, 204, {})
    return
  }

  const host = req.headers.host ?? '127.0.0.1'
  const url = new URL(req.url ?? '/', `http://${host}`)
  const pathname = url.pathname
  const token = authTokenOf(req)

  try {
    if (req.method === 'GET' && pathname === '/health') {
      json(res, 200, {
        ok: true,
        service: 'videogen-web-api',
        env: String(process.env.VG_APP_ENV || process.env.NODE_ENV || 'development').trim().toLowerCase(),
        timestamp: Date.now(),
        dataDir: String(process.env.VIDEOGENERATE_DATA_DIR || '').trim() || undefined,
      })
      return
    }

    if (req.method === 'GET' && pathname === '/hermes/live-photo/media') {
      const filePath = String(url.searchParams.get('path') || '').trim()
      if (!filePath) {
        res.writeHead(400, mediaHeaders()).end('missing path')
        return
      }
      let fileStat: Awaited<ReturnType<typeof stat>>
      try {
        fileStat = await stat(filePath)
      } catch {
        res.writeHead(404, mediaHeaders()).end('not found')
        return
      }
      if (!fileStat.isFile()) {
        res.writeHead(404, mediaHeaders()).end('not found')
        return
      }
      const size = fileStat.size
      const mime = mediaMimeOf(filePath)
      const range = req.headers.range
      if (range) {
        const parts = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (parts) {
          let start = parts[1] ? parseInt(parts[1], 10) : 0
          let end = parts[2] ? parseInt(parts[2], 10) : size - 1
          if (Number.isNaN(start)) start = 0
          if (Number.isNaN(end) || end >= size) end = size - 1
          if (start > end || start >= size) {
            res.writeHead(416, { ...mediaHeaders(), 'Content-Range': `bytes */${size}` }).end()
            return
          }
          const chunkSize = end - start + 1
          res.writeHead(206, {
            ...mediaHeaders(),
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': mime,
          })
          createReadStream(filePath, { start, end }).on('error', () => res.destroy()).pipe(res)
          return
        }
      }
      res.writeHead(200, {
        ...mediaHeaders(),
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Content-Type': mime,
      })
      createReadStream(filePath).on('error', () => res.destroy()).pipe(res)
      return
    }

    if (req.method === 'POST' && pathname === '/hermes/live-photo/session/start') {
      const body = await readBodyClean(req)
      const result = await hermesLivePhotoService.startReferenceSession({
        channel: typeof body.channel === 'string' ? body.channel : 'unknown',
        userId: typeof body.userId === 'string' ? body.userId : '',
        referenceImagePaths: Array.isArray(body.referenceImagePaths) ? body.referenceImagePaths.map(String) : [],
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'POST' && pathname === '/hermes/live-photo/session/select-product') {
      const body = await readBodyClean(req)
      const result = await hermesLivePhotoService.selectProduct({
        sessionId: typeof body.sessionId === 'string' ? body.sessionId : '',
        productId: typeof body.productId === 'string' ? body.productId : '',
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const hermesSessionMatch = /^\/hermes\/live-photo\/session\/([^/]+)$/.exec(pathname)
    if (hermesSessionMatch && req.method === 'GET') {
      const result = await hermesLivePhotoService.getSessionStatus(decodeURIComponent(hermesSessionMatch[1] || ''))
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'POST' && pathname === '/hermes/live-photo/feishu/webhook') {
      const body = await readBodyClean(req)
      const result = await hermesLivePhotoAdapters.handleFeishuEvent({
        userId: typeof body.userId === 'string' ? body.userId : '',
        imagePaths: Array.isArray(body.imagePaths) ? body.imagePaths.map(String) : [],
        text: typeof body.text === 'string' ? body.text : undefined,
        sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
      })
      json(res, 200, result as JsonObject)
      return
    }

    if (req.method === 'POST' && pathname === '/hermes/live-photo/feishu/official-event') {
      const body = await readBodyClean(req)
      const result = await hermesPlatformFormatters.handleFeishuOfficialEvent(body as any)
      json(res, 200, result as JsonObject)
      return
    }

    if (req.method === 'POST' && pathname === '/hermes/live-photo/feishu/send-final') {
      const body = await readBodyClean(req)
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
      const status = await hermesLivePhotoService.getSessionStatus(sessionId)
      const actions = await hermesLivePhotoAdapters.handleFeishuEvent({
        userId: typeof body.userId === 'string' ? body.userId : '',
        sessionId,
      })
      const result = await hermesDeliveryService.sendFinalToFeishu({
        appId: typeof body.appId === 'string' ? body.appId : undefined,
        appSecret: typeof body.appSecret === 'string' ? body.appSecret : undefined,
        tenantAccessToken: typeof body.tenantAccessToken === 'string' ? body.tenantAccessToken : undefined,
        receiveId: typeof body.receiveId === 'string' ? body.receiveId : '',
        receiveIdType:
          body.receiveIdType === 'user_id' ||
          body.receiveIdType === 'union_id' ||
          body.receiveIdType === 'chat_id' ||
          body.receiveIdType === 'email'
            ? body.receiveIdType
            : 'open_id',
        actions: actions.actions as any,
      })
      json(res, 200, { ok: true, session: status.session, result } as JsonObject)
      return
    }

    if (req.method === 'POST' && pathname === '/hermes/live-photo/wecom/webhook') {
      const body = await readBodyClean(req)
      const result = await hermesLivePhotoAdapters.handleWecomEvent({
        userId: typeof body.userId === 'string' ? body.userId : '',
        imagePaths: Array.isArray(body.imagePaths) ? body.imagePaths.map(String) : [],
        text: typeof body.text === 'string' ? body.text : undefined,
        sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
      })
      json(res, 200, result as JsonObject)
      return
    }

    if (req.method === 'POST' && pathname === '/hermes/live-photo/wecom/official-event') {
      const body = await readBodyClean(req)
      const result = await hermesPlatformFormatters.handleWecomOfficialEvent(body as any)
      json(res, 200, result as JsonObject)
      return
    }

    if (req.method === 'POST' && pathname === '/hermes/live-photo/wecom/send-final') {
      const body = await readBodyClean(req)
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
      const status = await hermesLivePhotoService.getSessionStatus(sessionId)
      const actions = await hermesLivePhotoAdapters.handleWecomEvent({
        userId: typeof body.userId === 'string' ? body.userId : '',
        sessionId,
      })
      const result = await hermesDeliveryService.sendFinalToWecom({
        corpId: typeof body.corpId === 'string' ? body.corpId : undefined,
        corpSecret: typeof body.corpSecret === 'string' ? body.corpSecret : undefined,
        accessToken: typeof body.accessToken === 'string' ? body.accessToken : undefined,
        agentId: typeof body.agentId === 'string' ? body.agentId : '',
        toUser: typeof body.toUser === 'string' ? body.toUser : '',
        actions: actions.actions as any,
      })
      json(res, 200, { ok: true, session: status.session, result } as JsonObject)
      return
    }

    if (req.method === 'POST' && pathname === '/auth/login') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.login({
        phone: String(body.phone ?? ''),
        code: String(body.code ?? ''),
        displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'POST' && pathname === '/auth/send-code') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.sendLoginCode({
        phone: String(body.phone ?? ''),
        channel: body.channel === 'sms' ? 'sms' : 'sms',
      })
      json(res, 200, result as JsonObject)
      return
    }

    if (req.method === 'POST' && pathname === '/auth/logout') {
      const result = await webPlatformService.logout(token)
      json(res, 200, result as JsonObject)
      return
    }

    if (req.method === 'GET' && pathname === '/me') {
      const result = await webPlatformService.getProfile(token)
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'GET' && pathname === '/me/subscription') {
      const result = await webPlatformService.getProfile(token)
      json(res, 200, { ok: true, subscription: result.subscription })
      return
    }

    if (req.method === 'GET' && pathname === '/me/wallet') {
      const result = await webPlatformService.getProfile(token)
      json(res, 200, { ok: true, wallet: result.wallet })
      return
    }

    if (req.method === 'GET' && pathname === '/billing/plans') {
      const result = await webPlatformService.listPlans()
      json(res, 200, { ok: true, plans: result })
      return
    }

    if (req.method === 'GET' && pathname === '/billing/orders') {
      const result = await webPlatformService.listBillingOrders(token)
      json(res, 200, { ok: true, orders: result })
      return
    }

    if (req.method === 'GET' && pathname === '/billing/transactions') {
      const result = await webPlatformService.listWalletTransactions(token)
      json(res, 200, { ok: true, transactions: result })
      return
    }

    if (req.method === 'POST' && pathname === '/billing/orders') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.createOrder({
        token,
        type: body.type === 'subscription' ? 'subscription' : 'compute_pack',
        planId: typeof body.planId === 'string' ? body.planId : undefined,
        paymentChannel: body.paymentChannel === 'alipay_native' ? 'alipay_native' : 'wechat_native',
        credits: Number(body.credits ?? 0),
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'POST' && pathname.startsWith('/payments/notify/')) {
      const orderId = pathname.split('/').pop() || ''
      const body = await readBodyClean(req)
      const result = await webPlatformService.payOrder(orderId, {
        paymentReference: typeof body.paymentReference === 'string' ? body.paymentReference : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'GET' && pathname === '/clone/projects') {
      const result = await webPlatformService.listCloneProjectSummaries(token)
      json(res, 200, { ok: true, projects: result })
      return
    }

    if (req.method === 'GET' && pathname === '/plugins') {
      const result = await webPlatformService.listPlugins(token)
      json(res, 200, { ok: true, plugins: result })
      return
    }

    if (req.method === 'GET' && pathname === '/plugins/installed') {
      const result = await webPlatformService.listInstalledPlugins(token)
      json(res, 200, { ok: true, plugins: result })
      return
    }

    if (pathname === '/plugins/geelark-publisher/config' && req.method === 'GET') {
      const result = await webPlatformService.getGeelarkPluginConfig(token)
      json(res, 200, { ok: true, config: result })
      return
    }

    if (pathname === '/plugins/geelark-publisher/config' && req.method === 'POST') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.setGeelarkPluginConfig(token, {
        baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
        appId: typeof body.appId === 'string' ? body.appId : undefined,
        appSecret: typeof body.appSecret === 'string' ? body.appSecret : undefined,
        accessToken: typeof body.accessToken === 'string' ? body.accessToken : undefined,
        requestTimeoutMs: typeof body.requestTimeoutMs === 'number' ? Number(body.requestTimeoutMs) : undefined,
      })
      json(res, 200, { ok: true, config: result })
      return
    }

    if (req.method === 'GET' && pathname === '/plugins/geelark-publisher/cloud-phones') {
      const result = await webPlatformService.listGeelarkCloudPhones(token)
      json(res, 200, { ok: true, items: result })
      return
    }

    if (req.method === 'GET' && pathname === '/plugins/geelark-publisher/accounts') {
      const result = await webPlatformService.listGeelarkPublisherAccounts(token)
      json(res, 200, { ok: true, items: result })
      return
    }

    if (req.method === 'GET' && pathname === '/plugins/geelark-publisher/publish-candidates') {
      const result = await webPlatformService.listGeelarkPublishCandidates(token)
      json(res, 200, { ok: true, items: result })
      return
    }

    if (req.method === 'GET' && pathname === '/plugins/geelark-publisher/music-presets') {
      const result = await webPlatformService.listGeelarkMusicPresets(token)
      json(res, 200, { ok: true, items: result })
      return
    }

    if (req.method === 'POST' && pathname === '/plugins/geelark-publisher/music-presets') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.upsertGeelarkMusicPreset(token, {
        id: typeof body.id === 'string' ? body.id : undefined,
        label: typeof body.label === 'string' ? body.label : '',
        refVideoId: typeof body.refVideoId === 'string' ? body.refVideoId : '',
        remark: typeof body.remark === 'string' ? body.remark : undefined,
      })
      json(res, 200, { ok: true, item: result })
      return
    }

    const geelarkMusicPresetMatch = /^\/plugins\/geelark-publisher\/music-presets\/([^/]+)$/.exec(pathname)
    if (geelarkMusicPresetMatch && req.method === 'DELETE') {
      await webPlatformService.deleteGeelarkMusicPreset(token, decodeURIComponent(geelarkMusicPresetMatch[1] || ''))
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && pathname === '/plugins/geelark-publisher/publish-title') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.generateGeelarkPublishTitles(token, {
        cloneProjectId: typeof body.cloneProjectId === 'string' ? body.cloneProjectId : '',
        contentLanguage: typeof body.contentLanguage === 'string' ? body.contentLanguage : undefined,
        productTitle: typeof body.productTitle === 'string' ? body.productTitle : undefined,
        productId: typeof body.productId === 'string' ? body.productId : undefined,
        productReferenceImagePaths: Array.isArray(body.productReferenceImagePaths)
          ? body.productReferenceImagePaths.map(String)
          : [],
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'POST' && pathname === '/plugins/geelark-publisher/accounts') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.upsertGeelarkPublisherAccount(token, {
        id: typeof body.id === 'string' ? body.id : undefined,
        name: typeof body.name === 'string' ? body.name : '',
        geelarkAccountId: typeof body.geelarkAccountId === 'string' ? body.geelarkAccountId : undefined,
        cloudPhoneId: typeof body.cloudPhoneId === 'string' ? body.cloudPhoneId : '',
        cloudPhoneName: typeof body.cloudPhoneName === 'string' ? body.cloudPhoneName : '',
        remark: typeof body.remark === 'string' ? body.remark : undefined,
        status: body.status === 'disabled' ? 'disabled' : 'active',
      })
      json(res, 200, { ok: true, item: result })
      return
    }

    const geelarkAccountMatch = /^\/plugins\/geelark-publisher\/accounts\/([^/]+)$/.exec(pathname)
    if (geelarkAccountMatch && req.method === 'POST') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.upsertGeelarkPublisherAccount(token, {
        id: decodeURIComponent(geelarkAccountMatch[1] || ''),
        name: typeof body.name === 'string' ? body.name : '',
        geelarkAccountId: typeof body.geelarkAccountId === 'string' ? body.geelarkAccountId : undefined,
        cloudPhoneId: typeof body.cloudPhoneId === 'string' ? body.cloudPhoneId : '',
        cloudPhoneName: typeof body.cloudPhoneName === 'string' ? body.cloudPhoneName : '',
        remark: typeof body.remark === 'string' ? body.remark : undefined,
        status: body.status === 'disabled' ? 'disabled' : 'active',
      })
      json(res, 200, { ok: true, item: result })
      return
    }

    if (geelarkAccountMatch && req.method === 'DELETE') {
      await webPlatformService.deleteGeelarkPublisherAccount(token, decodeURIComponent(geelarkAccountMatch[1] || ''))
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'GET' && pathname === '/plugins/geelark-publisher/tasks') {
      const result = await webPlatformService.listGeelarkPublishTasks(token)
      json(res, 200, { ok: true, items: result })
      return
    }

    const geelarkTaskMatch = /^\/plugins\/geelark-publisher\/tasks\/([^/]+)$/.exec(pathname)
    if (geelarkTaskMatch && req.method === 'GET') {
      const result = await webPlatformService.getGeelarkPublishTask(token, decodeURIComponent(geelarkTaskMatch[1] || ''))
      json(res, 200, { ok: true, item: result })
      return
    }

    const geelarkTaskSyncMatch = /^\/plugins\/geelark-publisher\/tasks\/([^/]+)\/sync$/.exec(pathname)
    if (geelarkTaskSyncMatch && req.method === 'POST') {
      const result = await webPlatformService.syncGeelarkPublishTask(token, decodeURIComponent(geelarkTaskSyncMatch[1] || ''))
      json(res, 200, { ok: true, item: result })
      return
    }

    if (req.method === 'POST' && pathname === '/plugins/geelark-publisher/publish') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.publishGeelarkVideo(token, {
        cloneProjectId: typeof body.cloneProjectId === 'string' ? body.cloneProjectId : undefined,
        videoPath: typeof body.videoPath === 'string' ? body.videoPath : '',
        publishAccountId: typeof body.publishAccountId === 'string' ? body.publishAccountId : '',
        videoDesc: typeof body.videoDesc === 'string' ? body.videoDesc : undefined,
        productId: typeof body.productId === 'string' ? body.productId : undefined,
        productTitle: typeof body.productTitle === 'string' ? body.productTitle : undefined,
        refVideoId: typeof body.refVideoId === 'string' ? body.refVideoId : undefined,
        sameVideoVolume: typeof body.sameVideoVolume === 'number' ? Number(body.sameVideoVolume) : undefined,
        sourceVideoVolume: typeof body.sourceVideoVolume === 'number' ? Number(body.sourceVideoVolume) : undefined,
        markAI: typeof body.markAI === 'boolean' ? Boolean(body.markAI) : undefined,
        musicMode:
          body.musicMode === 'library_ref' || body.musicMode === 'manual_ref' || body.musicMode === 'volume_only'
            ? body.musicMode
            : undefined,
        musicLabel: typeof body.musicLabel === 'string' ? body.musicLabel : undefined,
        scheduleAt: typeof body.scheduleAt === 'number' ? Number(body.scheduleAt) : undefined,
        needShareLink: typeof body.needShareLink === 'boolean' ? Boolean(body.needShareLink) : undefined,
      })
      json(res, 200, { ok: true, item: result })
      return
    }

    if (req.method === 'GET' && pathname === '/plugins/video-batch-subtitle/jobs') {
      const result = await webPlatformService.listBatchSubtitleJobs(token)
      json(res, 200, { ok: true, items: result })
      return
    }

    if (req.method === 'POST' && pathname === '/plugins/video-batch-subtitle/jobs') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.createBatchSubtitleJob(token, {
        name: typeof body.name === 'string' ? body.name : '',
        sourceItems: Array.isArray(body.sourceItems) ? (body.sourceItems as any[]) : [],
        subtitleMode:
          body.subtitleMode === 'static_title' || body.subtitleMode === 'timed_caption' || body.subtitleMode === 'hybrid'
            ? body.subtitleMode
            : undefined,
        subtitleSource:
          body.subtitleSource === 'manual' || body.subtitleSource === 'whisper_compatible' ? body.subtitleSource : undefined,
        exportEngine:
          body.exportEngine === 'ass_fallback' || body.exportEngine === 'capcut_mate' ? body.exportEngine : undefined,
        titleRenderMode:
          body.titleRenderMode === 'overlay_image' || body.titleRenderMode === 'ass_text'
            ? body.titleRenderMode
            : undefined,
        titleConfig: body.titleConfig && typeof body.titleConfig === 'object' ? (body.titleConfig as Record<string, unknown>) : undefined,
        titleItems: Array.isArray(body.titleItems) ? (body.titleItems as any[]) : undefined,
        titleStyleMode:
          body.titleStyleMode === 'vn_tiktok_viral' || body.titleStyleMode === 'default'
            ? body.titleStyleMode
            : undefined,
        viralTitleConfig:
          body.viralTitleConfig && typeof body.viralTitleConfig === 'object'
            ? (body.viralTitleConfig as Record<string, unknown>)
            : undefined,
        titleAnalysisItems: Array.isArray(body.titleAnalysisItems) ? (body.titleAnalysisItems as any[]) : undefined,
        overlayImageConfig:
          body.overlayImageConfig && typeof body.overlayImageConfig === 'object'
            ? (body.overlayImageConfig as Record<string, unknown>)
            : undefined,
        styleConfig: body.styleConfig && typeof body.styleConfig === 'object' ? (body.styleConfig as Record<string, unknown>) : undefined,
        captionStyle:
          body.captionStyle && typeof body.captionStyle === 'object' ? (body.captionStyle as Record<string, unknown>) : undefined,
        layoutPolicy:
          body.layoutPolicy && typeof body.layoutPolicy === 'object' ? (body.layoutPolicy as Record<string, unknown>) : undefined,
      })
      json(res, 200, { ok: true, item: result })
      return
    }

    const batchSubtitleJobMatch = /^\/plugins\/video-batch-subtitle\/jobs\/([^/]+)$/.exec(pathname)
    if (batchSubtitleJobMatch && req.method === 'POST') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.updateBatchSubtitleDraft(token, {
        jobId: decodeURIComponent(batchSubtitleJobMatch[1] || ''),
        patch: body && typeof body === 'object' ? (body as any) : {},
      })
      json(res, 200, { ok: true, item: result })
      return
    }

    const batchSubtitleAsrMatch = /^\/plugins\/video-batch-subtitle\/jobs\/([^/]+)\/asr$/.exec(pathname)
    if (batchSubtitleAsrMatch && req.method === 'POST') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.transcribeBatchSubtitleJob(token, {
        jobId: decodeURIComponent(batchSubtitleAsrMatch[1] || ''),
        sourceItemId: typeof body.sourceItemId === 'string' ? body.sourceItemId : undefined,
      })
      json(res, 200, { ok: true, item: result })
      return
    }

    const batchSubtitleRunMatch = /^\/plugins\/video-batch-subtitle\/jobs\/([^/]+)\/run$/.exec(pathname)
    if (batchSubtitleRunMatch && req.method === 'POST') {
      const result = await webPlatformService.runBatchSubtitleJob(token, {
        jobId: decodeURIComponent(batchSubtitleRunMatch[1] || ''),
      })
      json(res, 200, { ok: true, item: result })
      return
    }

    const batchSubtitlePauseMatch = /^\/plugins\/video-batch-subtitle\/jobs\/([^/]+)\/pause$/.exec(pathname)
    if (batchSubtitlePauseMatch && req.method === 'POST') {
      const result = await webPlatformService.pauseBatchSubtitleJob(token, {
        jobId: decodeURIComponent(batchSubtitlePauseMatch[1] || ''),
      })
      json(res, 200, { ok: true, item: result })
      return
    }

    const batchSubtitleResumeMatch = /^\/plugins\/video-batch-subtitle\/jobs\/([^/]+)\/resume$/.exec(pathname)
    if (batchSubtitleResumeMatch && req.method === 'POST') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.resumeBatchSubtitleJob(token, {
        jobId: decodeURIComponent(batchSubtitleResumeMatch[1] || ''),
        retryFailedOnly: body.retryFailedOnly === true,
      })
      json(res, 200, { ok: true, item: result })
      return
    }

    const batchSubtitleCapcutMatch = /^\/plugins\/video-batch-subtitle\/jobs\/([^/]+)\/export-capcut$/.exec(pathname)
    if (batchSubtitleCapcutMatch && req.method === 'POST') {
      const result = await webPlatformService.exportBatchSubtitleJobWithCapcut(token, {
        jobId: decodeURIComponent(batchSubtitleCapcutMatch[1] || ''),
      })
      json(res, 200, { ok: true, item: result })
      return
    }

    const batchSubtitleReflowMatch = /^\/plugins\/video-batch-subtitle\/jobs\/([^/]+)\/reflow$/.exec(pathname)
    if (batchSubtitleReflowMatch && req.method === 'POST') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.reflowBatchSubtitleJob(token, {
        jobId: decodeURIComponent(batchSubtitleReflowMatch[1] || ''),
        sourceItemId: typeof body.sourceItemId === 'string' ? body.sourceItemId : undefined,
      })
      json(res, 200, { ok: true, item: result })
      return
    }

    if (req.method === 'GET' && pathname === '/plugins/video-batch-subtitle/outputs') {
      const result = await webPlatformService.listBatchSubtitleOutputs(token)
      json(res, 200, { ok: true, items: result })
      return
    }

    if (req.method === 'POST' && pathname === '/plugins/video-batch-subtitle/preview-frame') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.previewBatchSubtitleFrame(token, {
        sourceItem: body.sourceItem && typeof body.sourceItem === 'object' ? (body.sourceItem as any) : {},
        subtitleMode:
          body.subtitleMode === 'static_title' || body.subtitleMode === 'timed_caption' || body.subtitleMode === 'hybrid'
            ? body.subtitleMode
            : undefined,
        titleConfig: body.titleConfig && typeof body.titleConfig === 'object' ? (body.titleConfig as Record<string, unknown>) : undefined,
        titleItems: Array.isArray(body.titleItems) ? (body.titleItems as any[]) : undefined,
        titleRenderMode:
          body.titleRenderMode === 'overlay_image' || body.titleRenderMode === 'ass_text'
            ? body.titleRenderMode
            : undefined,
        overlayImageConfig:
          body.overlayImageConfig && typeof body.overlayImageConfig === 'object'
            ? (body.overlayImageConfig as Record<string, unknown>)
            : undefined,
        styleConfig: body.styleConfig && typeof body.styleConfig === 'object' ? (body.styleConfig as Record<string, unknown>) : undefined,
        captionStyle:
          body.captionStyle && typeof body.captionStyle === 'object' ? (body.captionStyle as Record<string, unknown>) : undefined,
        layoutPolicy:
          body.layoutPolicy && typeof body.layoutPolicy === 'object' ? (body.layoutPolicy as Record<string, unknown>) : undefined,
        subtitleTrack: body.subtitleTrack && typeof body.subtitleTrack === 'object' ? (body.subtitleTrack as Record<string, unknown>) : undefined,
        previewAtSec: typeof body.previewAtSec === 'number' ? Number(body.previewAtSec) : undefined,
        includeVideo: body.includeVideo === true,
      })
      json(res, 200, { ok: true, item: result })
      return
    }

    const batchSubtitlePushMatch = /^\/plugins\/video-batch-subtitle\/jobs\/([^/]+)\/push-to-geelark$/.exec(pathname)
    if (batchSubtitlePushMatch && req.method === 'POST') {
      const result = await webPlatformService.pushBatchSubtitleOutputsToGeelarkPool(token, {
        jobId: decodeURIComponent(batchSubtitlePushMatch[1] || ''),
      })
      json(res, 200, { ok: true, item: result })
      return
    }

    if (req.method === 'POST' && pathname === '/plugins/video-batch-subtitle/generate-titles') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.generateBatchSubtitleTitles(token, {
        prompt: typeof body.prompt === 'string' ? body.prompt : '',
        count: typeof body.count === 'number' ? Number(body.count) : undefined,
        contentLanguage: typeof body.contentLanguage === 'string' ? body.contentLanguage : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'POST' && pathname === '/plugins/video-batch-subtitle/generate-viral-titles') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.generateBatchSubtitleViralTitles(token, {
        jobId: typeof body.jobId === 'string' ? body.jobId : undefined,
        sourceItems: Array.isArray(body.sourceItems) ? (body.sourceItems as any[]) : [],
        language: body.language === 'en' || body.language === 'zh' || body.language === 'vi' ? body.language : undefined,
        tone:
          body.tone === 'conversion' || body.tone === 'emotional' || body.tone === 'hook' ? body.tone : undefined,
        sellingPoints: typeof body.sellingPoints === 'string' ? body.sellingPoints : undefined,
        symbolIntensity:
          body.symbolIntensity === 'low' || body.symbolIntensity === 'medium' || body.symbolIntensity === 'high'
            ? body.symbolIntensity
            : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const pluginMatch = /^\/plugins\/([^/]+)$/.exec(pathname)
    if (req.method === 'GET' && pluginMatch) {
      const pluginId = decodeURIComponent(pluginMatch[1] || '')
      const result = await webPlatformService.getPlugin(token, pluginId)
      json(res, 200, { ok: true, plugin: result })
      return
    }

    const pluginInstallMatch = /^\/plugins\/([^/]+)\/install$/.exec(pathname)
    if (req.method === 'POST' && pluginInstallMatch) {
      const pluginId = decodeURIComponent(pluginInstallMatch[1] || '')
      const result = await webPlatformService.installPlugin(token, pluginId)
      json(res, 200, { ok: true, plugin: result })
      return
    }

    const pluginUninstallMatch = /^\/plugins\/([^/]+)\/uninstall$/.exec(pathname)
    if (req.method === 'POST' && pluginUninstallMatch) {
      const pluginId = decodeURIComponent(pluginUninstallMatch[1] || '')
      const result = await webPlatformService.uninstallPlugin(token, pluginId)
      json(res, 200, { ok: true, plugin: result })
      return
    }

    const pluginEnableMatch = /^\/plugins\/([^/]+)\/enable$/.exec(pathname)
    if (req.method === 'POST' && pluginEnableMatch) {
      const pluginId = decodeURIComponent(pluginEnableMatch[1] || '')
      const result = await webPlatformService.enablePlugin(token, pluginId)
      json(res, 200, { ok: true, plugin: result })
      return
    }

    const pluginDisableMatch = /^\/plugins\/([^/]+)\/disable$/.exec(pathname)
    if (req.method === 'POST' && pluginDisableMatch) {
      const pluginId = decodeURIComponent(pluginDisableMatch[1] || '')
      const result = await webPlatformService.disablePlugin(token, pluginId)
      json(res, 200, { ok: true, plugin: result })
      return
    }

    const pluginConfigMatch = /^\/plugins\/([^/]+)\/config$/.exec(pathname)
    if (req.method === 'POST' && pluginConfigMatch) {
      const pluginId = decodeURIComponent(pluginConfigMatch[1] || '')
      const body = await readBodyClean(req)
      const result = await webPlatformService.setPluginConfig(token, pluginId, body)
      json(res, 200, { ok: true, plugin: result })
      return
    }

    if (req.method === 'GET' && pathname === '/clone/model-identities') {
      const result = await webPlatformService.listCloneModelIdentities(token)
      json(res, 200, { ok: true, items: result })
      return
    }

    if (req.method === 'GET' && pathname === '/clone/model-credentials') {
      const result = await webPlatformService.getCloneModelCredentials(token)
      json(res, 200, { ok: true, credentials: result })
      return
    }

    if (req.method === 'POST' && pathname === '/clone/model-credentials') {
      const body = await readBodyClean(req)
      const parseApifoxHubInput = (input: unknown): import('../clone/types').ModelCredentials['apifoxHub'] =>
        input && typeof input === 'object'
          ? {
              enabled:
                typeof (input as Record<string, unknown>).enabled === 'boolean'
                  ? Boolean((input as Record<string, unknown>).enabled)
                  : true,
              baseUrl:
                typeof (input as Record<string, unknown>).baseUrl === 'string'
                  ? String((input as Record<string, unknown>).baseUrl)
                  : '',
              apiKey:
                typeof (input as Record<string, unknown>).apiKey === 'string'
                  ? String((input as Record<string, unknown>).apiKey)
                  : undefined,
              chatProvider:
                (input as Record<string, unknown>).chatProvider === 'anthropic' ||
                (input as Record<string, unknown>).chatProvider === 'gemini'
                  ? ((input as Record<string, unknown>).chatProvider as 'anthropic' | 'gemini')
                  : 'openai',
              chatModel:
                typeof (input as Record<string, unknown>).chatModel === 'string'
                  ? String((input as Record<string, unknown>).chatModel)
                  : 'gpt-4.1-mini',
              chatEndpointStyle:
                (input as Record<string, unknown>).chatEndpointStyle === 'anthropic_native' ||
                (input as Record<string, unknown>).chatEndpointStyle === 'gemini_native'
                  ? ((input as Record<string, unknown>).chatEndpointStyle as 'anthropic_native' | 'gemini_native')
                  : 'openai_chat',
              imageProvider:
                (input as Record<string, unknown>).imageProvider === 'gemini' ||
                (input as Record<string, unknown>).imageProvider === 'jimeng' ||
                (input as Record<string, unknown>).imageProvider === 'midjourney'
                  ? ((input as Record<string, unknown>).imageProvider as 'gemini' | 'jimeng' | 'midjourney')
                  : 'openai',
              imageModel:
                typeof (input as Record<string, unknown>).imageModel === 'string'
                  ? String((input as Record<string, unknown>).imageModel)
                  : 'gpt-image-1',
              imageEditModel:
                typeof (input as Record<string, unknown>).imageEditModel === 'string'
                  ? String((input as Record<string, unknown>).imageEditModel)
                  : undefined,
              imageEndpointStyle:
                (input as Record<string, unknown>).imageEndpointStyle === 'official_rest' ||
                (input as Record<string, unknown>).imageEndpointStyle === 'midjourney_task'
                  ? ((input as Record<string, unknown>).imageEndpointStyle as 'official_rest' | 'midjourney_task')
                  : 'openai_images',
              videoProvider:
                (input as Record<string, unknown>).videoProvider === 'sora' ||
                (input as Record<string, unknown>).videoProvider === 'veo' ||
                (input as Record<string, unknown>).videoProvider === 'grok' ||
                (input as Record<string, unknown>).videoProvider === 'jimeng' ||
                (input as Record<string, unknown>).videoProvider === 'vidu' ||
                (input as Record<string, unknown>).videoProvider === 'kling' ||
                (input as Record<string, unknown>).videoProvider === 'seedance2'
                  ? ((input as Record<string, unknown>).videoProvider as 'sora' | 'veo' | 'grok' | 'jimeng' | 'vidu' | 'kling' | 'seedance2')
                  : 'openai_video',
              textToVideoModel:
                typeof (input as Record<string, unknown>).textToVideoModel === 'string'
                  ? String((input as Record<string, unknown>).textToVideoModel)
                  : 'veo_3_1-lite',
              imageToVideoModel:
                typeof (input as Record<string, unknown>).imageToVideoModel === 'string'
                  ? String((input as Record<string, unknown>).imageToVideoModel)
                  : 'veo_3_1-lite',
              startEndVideoModel:
                typeof (input as Record<string, unknown>).startEndVideoModel === 'string'
                  ? String((input as Record<string, unknown>).startEndVideoModel)
                  : 'veo_3_1-lite',
              referenceVideoModel:
                typeof (input as Record<string, unknown>).referenceVideoModel === 'string'
                  ? String((input as Record<string, unknown>).referenceVideoModel)
                  : 'veo_3_1-lite',
              videoEndpointStyle:
                (input as Record<string, unknown>).videoEndpointStyle === 'official_rest'
                  ? 'official_rest'
                  : 'openai_video',
              defaultPollIntervalMs:
                typeof (input as Record<string, unknown>).defaultPollIntervalMs === 'number'
                  ? Number((input as Record<string, unknown>).defaultPollIntervalMs)
                  : 2000,
              defaultTimeoutMs:
                typeof (input as Record<string, unknown>).defaultTimeoutMs === 'number'
                  ? Number((input as Record<string, unknown>).defaultTimeoutMs)
                  : 600000,
            }
          : undefined
      const result = await webPlatformService.setCloneModelCredentials(token, {
        seedanceApiKey: typeof body.seedanceApiKey === 'string' ? body.seedanceApiKey : undefined,
        seedanceHost: typeof body.seedanceHost === 'string' ? body.seedanceHost : undefined,
        grsaiApiKey: typeof body.grsaiApiKey === 'string' ? body.grsaiApiKey : undefined,
        grsaiHost: typeof body.grsaiHost === 'string' ? body.grsaiHost : undefined,
        qiniuAccessKey: typeof body.qiniuAccessKey === 'string' ? body.qiniuAccessKey : undefined,
        qiniuSecretKey: typeof body.qiniuSecretKey === 'string' ? body.qiniuSecretKey : undefined,
        qiniuBucket: typeof body.qiniuBucket === 'string' ? body.qiniuBucket : undefined,
        qiniuDomain: typeof body.qiniuDomain === 'string' ? body.qiniuDomain : undefined,
        qiniuUploadHost: typeof body.qiniuUploadHost === 'string' ? body.qiniuUploadHost : undefined,
        qiniuPrefix: typeof body.qiniuPrefix === 'string' ? body.qiniuPrefix : undefined,
        allowMockWhenNoKey: typeof body.allowMockWhenNoKey === 'boolean' ? body.allowMockWhenNoKey : true,
        keyframeModel: typeof body.keyframeModel === 'string' ? body.keyframeModel : undefined,
        videoModelPrimary: typeof body.videoModelPrimary === 'string' ? body.videoModelPrimary : undefined,
        videoModelFallback: typeof body.videoModelFallback === 'string' ? body.videoModelFallback : undefined,
        grsaiVideoModel: typeof body.grsaiVideoModel === 'string' ? body.grsaiVideoModel : undefined,
        grsaiAnalysisModel: typeof body.grsaiAnalysisModel === 'string' ? body.grsaiAnalysisModel : undefined,
        chatProviderPrimary: body.chatProviderPrimary === 'grsai' ? 'grsai' : 'apifox_hub',
        videoProviderPrimary:
          body.videoProviderPrimary === 'seedance' || body.videoProviderPrimary === 'grsai' || body.videoProviderPrimary === 'apifox_hub'
            ? body.videoProviderPrimary
            : undefined,
        videoProviderFallback:
          body.videoProviderFallback === 'seedance' || body.videoProviderFallback === 'grsai' || body.videoProviderFallback === 'apifox_hub'
            ? body.videoProviderFallback
            : undefined,
        openaiApiKey: typeof body.openaiApiKey === 'string' ? body.openaiApiKey : undefined,
        openaiImageModel: typeof body.openaiImageModel === 'string' ? body.openaiImageModel : undefined,
        openaiImageQuality:
          body.openaiImageQuality === 'low' || body.openaiImageQuality === 'medium' || body.openaiImageQuality === 'high'
            ? body.openaiImageQuality
            : undefined,
        imageProviderPrimary:
          body.imageProviderPrimary === 'openai' || body.imageProviderPrimary === 'grsai' || body.imageProviderPrimary === 'apifox_hub'
            ? body.imageProviderPrimary
            : undefined,
        grsaiImageModel: typeof body.grsaiImageModel === 'string' ? body.grsaiImageModel : undefined,
        apifoxHubProfile:
          body.apifoxHubProfile === 'ai666' || body.apifoxHubProfile === 'vectorengine'
            ? body.apifoxHubProfile
            : undefined,
        apifoxHub: parseApifoxHubInput(body.apifoxHub),
        ai666Hub: parseApifoxHubInput(body.ai666Hub),
        vectorEngineHub: parseApifoxHubInput(body.vectorEngineHub),
      })
      json(res, 200, { ok: true, credentials: result })
      return
    }

    if (req.method === 'POST' && pathname === '/clone/model-identities') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.createCloneModelIdentity(token, {
        cloneProjectId: String(body.cloneProjectId ?? ''),
        productType:
          body.productType === 'earrings' ||
          body.productType === 'phone_case' ||
          body.productType === 'clothes' ||
          body.productType === 'toy'
            ? body.productType
            : 'general',
        productPoints: typeof body.productPoints === 'string' ? body.productPoints : undefined,
        modelProfileOptions:
          body.modelProfileOptions && typeof body.modelProfileOptions === 'object' && !Array.isArray(body.modelProfileOptions)
            ? (body.modelProfileOptions as any)
            : undefined,
        productReferenceImagePaths: Array.isArray(body.productReferenceImagePaths)
          ? body.productReferenceImagePaths.map(String)
          : [],
        imageProviderPrimary:
          body.imageProviderPrimary === 'grsai' || body.imageProviderPrimary === 'apifox_hub'
            ? body.imageProviderPrimary
            : 'openai',
        openaiApiKey: typeof body.openaiApiKey === 'string' ? body.openaiApiKey : undefined,
        openaiImageModel: typeof body.openaiImageModel === 'string' ? body.openaiImageModel : undefined,
        openaiImageQuality:
          body.openaiImageQuality === 'low' || body.openaiImageQuality === 'medium'
            ? body.openaiImageQuality
            : 'high',
        grsaiApiKey: typeof body.grsaiApiKey === 'string' ? body.grsaiApiKey : undefined,
        grsaiHost: typeof body.grsaiHost === 'string' ? body.grsaiHost : undefined,
        grsaiImageModel: typeof body.grsaiImageModel === 'string' ? body.grsaiImageModel : undefined,
        apifoxHub:
          body.apifoxHub && typeof body.apifoxHub === 'object'
            ? {
                enabled:
                  typeof (body.apifoxHub as Record<string, unknown>).enabled === 'boolean'
                    ? Boolean((body.apifoxHub as Record<string, unknown>).enabled)
                    : true,
                baseUrl:
                  typeof (body.apifoxHub as Record<string, unknown>).baseUrl === 'string'
                    ? String((body.apifoxHub as Record<string, unknown>).baseUrl)
                    : undefined,
                apiKey:
                  typeof (body.apifoxHub as Record<string, unknown>).apiKey === 'string'
                    ? String((body.apifoxHub as Record<string, unknown>).apiKey)
                    : undefined,
                imageModel:
                  typeof (body.apifoxHub as Record<string, unknown>).imageModel === 'string'
                    ? String((body.apifoxHub as Record<string, unknown>).imageModel)
                    : undefined,
              }
            : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'POST' && pathname === '/clone/projects') {
      const body = await readBodyClean(req)
      const result = await webPlatformService.createCloneProject(token, {
        title: typeof body.title === 'string' ? body.title : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
        locale: body.locale === 'vi-VN' ? 'vi-VN' : 'zh-CN',
        runMode: body.runMode === 'auto' ? 'auto' : body.runMode === 'manual' ? 'manual' : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const projectMatch = /^\/clone\/projects\/([^/]+)$/.exec(pathname)
    if (req.method === 'GET' && projectMatch) {
      const result = await webPlatformService.getCloneProject(token, decodeURIComponent(projectMatch[1]))
      json(res, 200, { ok: true, project: result })
      return
    }
    if (req.method === 'POST' && projectMatch) {
      const body = await readBodyClean(req)
      const result = await webPlatformService.updateCloneProjectMeta(token, {
        cloneProjectId: decodeURIComponent(projectMatch[1]),
        title: typeof body.title === 'string' ? body.title : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }
    if (req.method === 'DELETE' && projectMatch) {
      const result = await webPlatformService.removeCloneProject(token, decodeURIComponent(projectMatch[1]))
      json(res, 200, result as JsonObject)
      return
    }

    const stageMatch = /^\/clone\/projects\/([^/]+)\/stage$/.exec(pathname)
    if (req.method === 'POST' && stageMatch) {
      const body = await readBodyClean(req)
      const currentStep = String(body.currentStep ?? '')
      const allowedSteps = new Set([
        'upload_analyze_script',
        'model_product_consistency',
        'storyboard_video_generation',
        'export_final',
        'generate_script_variants',
        'select_script_variant',
        'generate_storyboard_grids',
        'generate_shot_videos',
        'review_replace_shots',
        'compose_final_video',
      ])
      if (!allowedSteps.has(currentStep)) {
        throw new Error('无效的项目阶段')
      }
      const result = await webPlatformService.updateCloneProjectStage(token, {
        cloneProjectId: decodeURIComponent(stageMatch[1]),
        currentStep: currentStep as any,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const analyzeMatch = /^\/clone\/projects\/([^/]+)\/analyze$/.exec(pathname)
    if (req.method === 'POST' && analyzeMatch) {
      const body = await readBodyClean(req)
      const result = await webPlatformService.analyzeReference(token, {
        cloneProjectId: decodeURIComponent(analyzeMatch[1]),
        videoPath: String(body.videoPath ?? ''),
        locale: body.locale === 'vi-VN' ? 'vi-VN' : 'zh-CN',
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const uploadReferenceMatch = /^\/clone\/projects\/([^/]+)\/reference-video\/upload$/.exec(pathname)
    if (req.method === 'POST' && uploadReferenceMatch) {
      const body = await readBodyClean(req)
      const result = await webPlatformService.uploadCloneReferenceVideo(token, {
        cloneProjectId: decodeURIComponent(uploadReferenceMatch[1]),
        file: {
          fileName: String(body.fileName ?? ''),
          base64Data: String(body.base64Data ?? ''),
          mimeType: typeof body.mimeType === 'string' ? body.mimeType : undefined,
        },
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const variantsMatch = /^\/clone\/projects\/([^/]+)\/script-variants$/.exec(pathname)
    if (req.method === 'POST' && variantsMatch) {
      const body = await readBodyClean(req)
      const result = await webPlatformService.generateScriptVariants(token, {
        cloneProjectId: decodeURIComponent(variantsMatch[1]),
        variantCount: Math.max(1, Math.min(6, Number(body.variantCount ?? 3))),
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const selectVariantMatch = /^\/clone\/projects\/([^/]+)\/select-script-variant$/.exec(pathname)
    if (req.method === 'POST' && selectVariantMatch) {
      const body = await readBodyClean(req)
      const result = await webPlatformService.selectScriptVariant(token, {
        cloneProjectId: decodeURIComponent(selectVariantMatch[1]),
        variantId: String(body.variantId ?? ''),
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const productImagesMatch = /^\/clone\/projects\/([^/]+)\/product-images$/.exec(pathname)
    if (req.method === 'POST' && productImagesMatch) {
      const body = await readBodyClean(req)
      const result = await webPlatformService.saveCloneProjectProductImages(token, {
        cloneProjectId: decodeURIComponent(productImagesMatch[1]),
        productReferenceImagePaths: Array.isArray(body.productReferenceImagePaths)
          ? body.productReferenceImagePaths.map(String)
          : [],
      })
      json(res, 200, { ok: true, project: result })
      return
    }

    const uploadProductImagesMatch = /^\/clone\/projects\/([^/]+)\/product-images\/upload$/.exec(pathname)
    if (req.method === 'POST' && uploadProductImagesMatch) {
      const body = await readBodyClean(req)
      const files = Array.isArray(body.files)
        ? body.files.map((item) => ({
            fileName: String((item as Record<string, unknown>)?.fileName ?? ''),
            base64Data: String((item as Record<string, unknown>)?.base64Data ?? ''),
            mimeType:
              typeof (item as Record<string, unknown>)?.mimeType === 'string'
                ? String((item as Record<string, unknown>).mimeType)
                : undefined,
          }))
        : []
      const result = await webPlatformService.uploadCloneProductImages(token, {
        cloneProjectId: decodeURIComponent(uploadProductImagesMatch[1]),
        files,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const selectModelMatch = /^\/clone\/projects\/([^/]+)\/select-model-identity$/.exec(pathname)
    if (req.method === 'POST' && selectModelMatch) {
      const body = await readBodyClean(req)
      const result = await webPlatformService.selectCloneProjectModelIdentity(token, {
        cloneProjectId: decodeURIComponent(selectModelMatch[1]),
        identityId: String(body.identityId ?? ''),
      })
      json(res, 200, { ok: true, project: result })
      return
    }

    const storyboardMatch = /^\/clone\/projects\/([^/]+)\/storyboard-images$/.exec(pathname)
    if (req.method === 'POST' && storyboardMatch) {
      const body = await readBodyClean(req)
      const result = await webPlatformService.generateStoryboardImages(token, {
        cloneProjectId: decodeURIComponent(storyboardMatch[1]),
        productReferenceImagePaths: Array.isArray(body.productReferenceImagePaths)
          ? body.productReferenceImagePaths.map(String)
          : [],
        shotIds: Array.isArray(body.shotIds) ? body.shotIds.map(String) : undefined,
        onlyMissing: body.onlyMissing === true,
        selectedModelIdentityId:
          typeof body.selectedModelIdentityId === 'string' ? body.selectedModelIdentityId : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const regenerateStoryboardMatch =
      /^\/clone\/projects\/([^/]+)\/storyboard-images\/([^/]+)\/regenerate$/.exec(pathname)
    if (req.method === 'POST' && regenerateStoryboardMatch) {
      const body = await readBodyClean(req)
      const result = await webPlatformService.regenerateStoryboardImage(token, {
        cloneProjectId: decodeURIComponent(regenerateStoryboardMatch[1]),
        shotId: decodeURIComponent(regenerateStoryboardMatch[2]),
        productReferenceImagePaths: Array.isArray(body.productReferenceImagePaths)
          ? body.productReferenceImagePaths.map(String)
          : [],
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const shotUpdateMatch = /^\/clone\/projects\/([^/]+)\/shots\/([^/]+)$/.exec(pathname)
    if (req.method === 'POST' && shotUpdateMatch) {
      const body = await readBodyClean(req)
      const result = await webPlatformService.updateCloneShot(token, {
        cloneProjectId: decodeURIComponent(shotUpdateMatch[1]),
        shotId: decodeURIComponent(shotUpdateMatch[2]),
        locked: typeof body.locked === 'boolean' ? body.locked : undefined,
        scriptText: typeof body.scriptText === 'string' ? body.scriptText : undefined,
        narrationText: typeof body.narrationText === 'string' ? body.narrationText : undefined,
        onScreenText: typeof body.onScreenText === 'string' ? body.onScreenText : undefined,
        visualDescription: typeof body.visualDescription === 'string' ? body.visualDescription : undefined,
        actionDescription: typeof body.actionDescription === 'string' ? body.actionDescription : undefined,
        cameraDescription: typeof body.cameraDescription === 'string' ? body.cameraDescription : undefined,
        durationSec: typeof body.durationSec === 'number' ? body.durationSec : undefined,
        cameraMovement: typeof body.cameraMovement === 'string' ? body.cameraMovement : undefined,
        subtitleSuggestion: typeof body.subtitleSuggestion === 'string' ? body.subtitleSuggestion : undefined,
        materialNeed: typeof body.materialNeed === 'string' ? body.materialNeed : undefined,
        order: typeof body.order === 'number' ? body.order : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }
    if (req.method === 'DELETE' && shotUpdateMatch) {
      const result = await webPlatformService.removeCloneShot(token, {
        cloneProjectId: decodeURIComponent(shotUpdateMatch[1]),
        shotId: decodeURIComponent(shotUpdateMatch[2]),
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const shotCreateMatch = /^\/clone\/projects\/([^/]+)\/shots$/.exec(pathname)
    if (req.method === 'POST' && shotCreateMatch) {
      const body = await readBodyClean(req)
      const result = await webPlatformService.createCloneShot(token, {
        cloneProjectId: decodeURIComponent(shotCreateMatch[1]),
        afterShotId: typeof body.afterShotId === 'string' ? body.afterShotId : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const shotReorderMatch = /^\/clone\/projects\/([^/]+)\/shots\/reorder$/.exec(pathname)
    if (req.method === 'POST' && shotReorderMatch) {
      const body = await readBodyClean(req)
      const result = await webPlatformService.reorderCloneShots(token, {
        cloneProjectId: decodeURIComponent(shotReorderMatch[1]),
        shotIds: Array.isArray(body.shotIds) ? body.shotIds.map(String) : [],
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const shotVideoMatch = /^\/clone\/projects\/([^/]+)\/shot-videos$/.exec(pathname)
    if (req.method === 'POST' && shotVideoMatch) {
      const result = await webPlatformService.generateShotVideos(token, {
        cloneProjectId: decodeURIComponent(shotVideoMatch[1]),
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const syncShotVideoMatch = /^\/clone\/projects\/([^/]+)\/shot-videos\/([^/]+)\/sync$/.exec(pathname)
    if (req.method === 'POST' && syncShotVideoMatch) {
      const result = await webPlatformService.syncCloneShotVideoTask(token, {
        cloneProjectId: decodeURIComponent(syncShotVideoMatch[1]),
        shotId: decodeURIComponent(syncShotVideoMatch[2]),
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const regenerateShotVideoMatch =
      /^\/clone\/projects\/([^/]+)\/shot-videos\/([^/]+)\/regenerate$/.exec(pathname)
    if (req.method === 'POST' && regenerateShotVideoMatch) {
      const result = await webPlatformService.regenerateCloneShotVideo(token, {
        cloneProjectId: decodeURIComponent(regenerateShotVideoMatch[1]),
        shotId: decodeURIComponent(regenerateShotVideoMatch[2]),
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const consistencyMatch = /^\/clone\/projects\/([^/]+)\/shot-videos\/([^/]+)\/consistency$/.exec(pathname)
    if (req.method === 'GET' && consistencyMatch) {
      const result = await webPlatformService.getCloneShotConsistencyReport(token, {
        cloneProjectId: decodeURIComponent(consistencyMatch[1]),
        shotId: decodeURIComponent(consistencyMatch[2]),
      })
      json(res, 200, { ok: true, result })
      return
    }

    const imagePromptPreviewMatch = /^\/clone\/projects\/([^/]+)\/shot-videos\/([^/]+)\/image-prompt-preview$/.exec(pathname)
    if (req.method === 'GET' && imagePromptPreviewMatch) {
      const result = await webPlatformService.getCloneShotImagePromptPreview(token, {
        cloneProjectId: decodeURIComponent(imagePromptPreviewMatch[1]),
        shotId: decodeURIComponent(imagePromptPreviewMatch[2]),
      })
      json(res, 200, { ok: true, result })
      return
    }

    const consistencyRecompileMatch = /^\/clone\/projects\/([^/]+)\/shot-videos\/([^/]+)\/consistency\/recompile$/.exec(pathname)
    if (req.method === 'POST' && consistencyRecompileMatch) {
      const result = await webPlatformService.recompileCloneShotConsistency(token, {
        cloneProjectId: decodeURIComponent(consistencyRecompileMatch[1]),
        shotId: decodeURIComponent(consistencyRecompileMatch[2]),
      })
      json(res, 200, { ok: true, result })
      return
    }

    const consistencyAnchorsMatch = /^\/clone\/projects\/([^/]+)\/shot-videos\/([^/]+)\/consistency\/anchors$/.exec(pathname)
    if (req.method === 'GET' && consistencyAnchorsMatch) {
      const result = await webPlatformService.listCloneShotConsistencyAnchors(token, {
        cloneProjectId: decodeURIComponent(consistencyAnchorsMatch[1]),
        shotId: decodeURIComponent(consistencyAnchorsMatch[2]),
      })
      json(res, 200, { ok: true, result })
      return
    }

    const consistencyPatchesMatch = /^\/clone\/projects\/([^/]+)\/shot-videos\/([^/]+)\/consistency\/patches$/.exec(pathname)
    if (req.method === 'GET' && consistencyPatchesMatch) {
      const result = await webPlatformService.listCloneShotConsistencyPatches(token, {
        cloneProjectId: decodeURIComponent(consistencyPatchesMatch[1]),
        shotId: decodeURIComponent(consistencyPatchesMatch[2]),
      })
      json(res, 200, { ok: true, result })
      return
    }

    const composeMatch = /^\/clone\/projects\/([^/]+)\/compose$/.exec(pathname)
    if (req.method === 'POST' && composeMatch) {
      const body = await readBodyClean(req)
      const result = await webPlatformService.composeFinalVideo(token, {
        cloneProjectId: decodeURIComponent(composeMatch[1]),
        outputDir: typeof body.outputDir === 'string' ? body.outputDir : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const runtimeMatch = /^\/clone\/projects\/([^/]+)\/runtime$/.exec(pathname)
    if (req.method === 'GET' && runtimeMatch) {
      const result = await webPlatformService.getCloneRuntime(token, decodeURIComponent(runtimeMatch[1]))
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'GET' && pathname === '/media/file') {
      const filePath = String(url.searchParams.get('path') || '').trim()
      await webPlatformService.streamMediaFile(token, filePath, req, res)
      return
    }

    json(res, 404, { ok: false, error: '接口不存在' })
  } catch (error: any) {
    json(res, isUnauthorizedErrorClean(error) ? 401 : 400, {
      ok: false,
      error: String(error?.message ?? error),
    })
  }
}
