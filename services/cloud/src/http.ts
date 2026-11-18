import { createRelay, type RelayService } from './relay'
import { routesToCloneEngine, type CloneEngine } from './cloneEngine'
import http from 'node:http'
import { createWebApp } from './webApp'
import type { CloudConfig } from './config'
import type { CloudService } from './service'
import type { SyncService } from './sync'
import type { AiService } from './ai'
import type { GenerationService } from './generate'
import { SYNC_MAX_FILE_BYTES } from '../../../src/shared/cloud/sync'
import { CloudError, badRequest } from './security'
import type { AiProxy } from './aiProxy'

const MAX_BODY_BYTES = 1024 * 1024

type Ctx = {
  req: http.IncomingMessage
  url: URL
  params: Record<string, string>
  ip: string
  token: string | null
  rawBody: string
  /** 原始请求体（仅 binary 路由） */
  bodyBuffer: Buffer
  body: Record<string, any>
}

type Handler = (ctx: Ctx) => Promise<unknown> | unknown

/** 处理器返回此类型时按原样输出（支付回调需要特定的响应格式） */
type RawResponse = { __raw: true; status: number; body: string | Buffer; contentType: string; headers?: Record<string, string> }
const raw = (status: number, body: string | Buffer, contentType = 'text/plain; charset=utf-8', headers?: Record<string, string>): RawResponse => ({ __raw: true, status, body, contentType, headers })

type RouteOptions = { maxBodyBytes?: number }

function readBody(req: http.IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(badRequest('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function clientIp(req: http.IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    if (forwarded) return forwarded.slice(0, 64)
  }
  return String(req.socket.remoteAddress || '').slice(0, 64)
}

export function createCloudHttpHandler(config: CloudConfig, service: CloudService, sync: SyncService, ai: AiService, generation: GenerationService, relay: RelayService = createRelay(), cloneEngine?: CloneEngine, aiProxy?: AiProxy) {
  const routes: Array<{ method: string; pattern: RegExp; keys: string[]; handler: Handler; options: RouteOptions }> = []

  function route(method: string, path: string, handler: Handler, options: RouteOptions = {}) {
    const keys: string[] = []
    const pattern = new RegExp(
      `^${path.replace(/:([a-zA-Z]+)/g, (_m, key: string) => {
        keys.push(key)
        return '([^/]+)'
      })}$`,
    )
    routes.push({ method, pattern, keys, handler, options })
  }

  const user = (ctx: Ctx) => service.authenticate(ctx.token).user
  const admin = (ctx: Ctx) => {
    const current = service.authenticate(ctx.token, { admin: true }).user
    if (current.mustChangePassword) throw new CloudError('FORBIDDEN', '请先修改初始密码再使用管理后台', 403, { reason: 'password_change_required' })
    return { user: current, ip: ctx.ip }
  }
  const query = (ctx: Ctx) => Object.fromEntries(ctx.url.searchParams.entries())

  /* ---------------------------------------------------------------- 公共 */
  route('GET', '/api/v1/health', () => ({ status: 'up', time: Date.now() }))
  route('GET', '/api/v1/client/config', () => service.publicConfig())
  route('GET', '/api/v1/plans', () => service.listPlans())
  route('GET', '/api/v1/client/managed-settings', (ctx) => {
    const auth = service.authenticate(ctx.token)
    return service.clientManagedSettings(auth.user, String(ctx.url.searchParams.get('machineId') || ''), auth.tokenHash)
  })
  route('POST', '/api/v1/client/qiniu-upload-grant', (ctx) => service.qiniuUploadGrant(user(ctx), String(ctx.body.machineId || ''), ctx.body))

  /* ---------------------------------------------------------------- 账号 */
  route('POST', '/api/v1/auth/register', (ctx) => service.register(ctx.body as any, ctx.ip))
  route('POST', '/api/v1/auth/login', (ctx) => service.login(ctx.body as any, ctx.ip))
  route('POST', '/api/v1/auth/logout', (ctx) => {
    const { tokenHash } = service.authenticate(ctx.token)
    service.logout(tokenHash)
    return {}
  })
  route('GET', '/api/v1/me', (ctx) => service.me(user(ctx)))
  route('POST', '/api/v1/me/password', async (ctx) => {
    const auth = service.authenticate(ctx.token)
    await service.changePassword(auth.user, ctx.body.oldPassword, ctx.body.newPassword, auth.tokenHash)
    return {}
  })

  /* ---------------------------------------------------------------- 设备 */
  route('POST', '/api/v1/devices/activate', (ctx) => service.activateDevice(user(ctx), ctx.body as any))
  route('DELETE', '/api/v1/devices/:id', (ctx) => {
    const current = user(ctx)
    service.unbindOwnDevice(current, ctx.params.id, ctx.ip)
    return { devices: service.me(current).devices }
  })

  /* ---------------------------------------------------------------- 多端同步 */
  route('GET', '/api/v1/sync/changes', (ctx) => sync.pull(user(ctx).id, query(ctx)))
  // 写入（占用云端存储）需要有效会员；读取不限，会员过期后仍能看到自己的数据
  const member = (ctx: Ctx) => {
    const current = user(ctx)
    if (!service.entitlementFor(current).active) throw new CloudError('NO_ENTITLEMENT', '会员已过期，续费后才能继续同步新数据', 402)
    return current
  }
  route('POST', '/api/v1/sync/push', (ctx) => sync.push(member(ctx).id, ctx.body))
  // 电脑代办：网页调电脑端功能（GMV Max、达人中心），云端只在内存里转交
  // 复刻：网页和电脑端同一个页面，但在服务器复刻引擎上执行（不需要电脑开着），见 cloneEngine.ts
  route('POST', '/api/v1/relay/call', (ctx) => {
    const id = member(ctx).id
    const body = ctx.body as { ns?: string; method?: string; args?: unknown[] }
    if (cloneEngine && routesToCloneEngine(cloneEngine, id, body)) return cloneEngine.call(id, String(body.ns), String(body.method), Array.isArray(body.args) ? body.args : [])
    return relay.call(id, body as any)
  })
  route('GET', '/api/v1/relay/status', (ctx) => relay.online(user(ctx).id))
  route('GET', '/api/v1/relay/next', (ctx) => relay.next(member(ctx).id, Number(ctx.url.searchParams.get('wait')) || undefined))
  // Large results allowed: the body is read raw (custom size), so parse it here.
  route('POST', '/api/v1/relay/result', (ctx) => relay.result(member(ctx).id, JSON.parse(ctx.bodyBuffer.toString('utf8') || '{}')), { maxBodyBytes: 16 * 1024 * 1024 })
  route('GET', '/api/v1/sync/usage', (ctx) => sync.usage(user(ctx).id))
  route('PUT', '/api/v1/files', (ctx) => sync.uploadFile(member(ctx).id, ctx.bodyBuffer, String(ctx.req.headers['content-type'] || '')), { maxBodyBytes: SYNC_MAX_FILE_BYTES })
  route('GET', '/api/v1/files/:id', (ctx) => {
    const file = sync.readFile(user(ctx).id, ctx.params.id)
    // Content-addressed: the bytes behind an id never change.
    return raw(200, file.body, file.mime, { 'Cache-Control': 'private, max-age=31536000, immutable' })
  })

  /* ---------------------------------------------------------------- AI 网关（手机 App） */
  route('POST', '/api/v1/ai/chat', (ctx) => ai.chat(member(ctx).id, ctx.body as any))
  route('GET', '/api/v1/ai/usage', (ctx) => ai.usage(user(ctx).id))
  route('POST', '/api/v1/ai/jobs', (ctx) => ({ job: generation.create(member(ctx).id, ctx.body as any) }))
  route('GET', '/api/v1/ai/jobs', (ctx) => generation.list(user(ctx).id, String(ctx.url.searchParams.get('ids') || '').split(',')))
  route('GET', '/api/v1/ai/jobs/:id', (ctx) => ({ job: generation.get(user(ctx).id, ctx.params.id) }))
  // 上架助手导出 Excel：图片的对外链接
  // 网页显示自己的图片 / 视频用的签名链接
  route('POST', '/api/v1/sync/file-links', (ctx) => generation.fileLinks(user(ctx).id, ctx.body as any))
  route('POST', '/api/v1/ai/public-urls', (ctx) => generation.publicUrls(member(ctx).id, ctx.body as any))
  // 平台下载参考图用的签名链接（不需要登录，靠签名和有效期）
  route('GET', '/api/v1/public-files/:id', (ctx) => {
    const file = generation.readPublicFile(ctx.params.id, query(ctx))
    return raw(200, file.body, file.mime, { 'Cache-Control': 'private, max-age=600' })
  })

  /* ---------------------------------------------------------------- 订单 / 兑换 */
  route('POST', '/api/v1/orders', async (ctx) => ({ order: await service.createOrder(user(ctx), ctx.body as any) }))
  route('GET', '/api/v1/orders', (ctx) => service.listOwnOrders(user(ctx), ctx.url.searchParams.get('page'), ctx.url.searchParams.get('pageSize')))
  route('GET', '/api/v1/orders/:orderNo', async (ctx) => ({ order: await service.getOwnOrder(user(ctx), ctx.params.orderNo) }))
  route('POST', '/api/v1/orders/:orderNo/mock-pay', (ctx) => ({ order: service.mockPay(user(ctx), ctx.params.orderNo) }))
  route('POST', '/api/v1/redeem', (ctx) => service.redeemDetailed(user(ctx), ctx.body.code, ctx.ip))

  /* ---------------------------------------------------------------- 点数计费 */
  route('GET', '/api/v1/pricing', () => service.billing.pricing())
  route('GET', '/api/v1/credits', (ctx) => {
    const page = Math.max(1, Number.parseInt(String(ctx.url.searchParams.get('page') || '1'), 10) || 1)
    return service.billing.credits(user(ctx), page, 20)
  })
  // 电脑端 / 服务器复刻引擎每次向 AI 平台发起视频 / 图片生成前冻结点数，结束后结算
  route('POST', '/api/v1/usage/hold', (ctx) => ({ hold: service.billing.hold(user(ctx).id, ctx.body as any) }))
  route('POST', '/api/v1/usage/holds/:id/settle', (ctx) => ({
    hold: service.billing.settle(user(ctx).id, ctx.params.id, ctx.body.ok === true, String(ctx.body.reason || '')),
  }))

  /* ---------------------------------------------------------------- 支付回调（不鉴权，靠验签） */
  route('POST', '/api/v1/pay/notify/wechat', (ctx) => {
    const h = (name: string) => String(ctx.req.headers[name] || '')
    const result = service.handleWechatNotify(
      { timestamp: h('wechatpay-timestamp'), nonce: h('wechatpay-nonce'), signature: h('wechatpay-signature'), serial: h('wechatpay-serial') },
      ctx.rawBody,
    )
    return raw(result.status, result.body, 'application/json; charset=utf-8')
  })
  route('POST', '/api/v1/pay/notify/alipay', (ctx) => raw(200, service.handleAlipayNotify(ctx.rawBody)))

  /* ---------------------------------------------------------------- 管理后台 */
  route('GET', '/api/v1/admin/stats', (ctx) => (admin(ctx), { stats: service.admin.stats(), channels: service.admin.channels() }))
  route('GET', '/api/v1/admin/users', (ctx) => (admin(ctx), service.admin.listUsers(query(ctx))))
  route('POST', '/api/v1/admin/users', async (ctx) => service.admin.createUser(admin(ctx), ctx.body as any))
  route('GET', '/api/v1/admin/users/:id', (ctx) => (admin(ctx), service.admin.userDetail(ctx.params.id)))
  route('PATCH', '/api/v1/admin/users/:id', async (ctx) => service.admin.patchUser(admin(ctx), ctx.params.id, ctx.body as any))
  route('DELETE', '/api/v1/admin/users/:id/devices/:deviceId', (ctx) => service.admin.revokeDevice(admin(ctx), ctx.params.id, ctx.params.deviceId))
  route('GET', '/api/v1/admin/plans', (ctx) => (admin(ctx), { plans: service.admin.listPlans() }))
  route('PUT', '/api/v1/admin/plans/:code', (ctx) => ({ plan: service.admin.upsertPlan(admin(ctx), { ...ctx.body, code: ctx.params.code }) }))
  route('GET', '/api/v1/admin/orders', (ctx) => (admin(ctx), service.admin.listOrders(query(ctx))))
  route('POST', '/api/v1/admin/orders/:orderNo/refund', (ctx) => ({
    order: service.admin.refundOrder(admin(ctx), ctx.params.orderNo, { revokeDays: Boolean(ctx.body.revokeDays), note: ctx.body.note }),
  }))
  route('GET', '/api/v1/admin/redeem-codes', (ctx) => (admin(ctx), service.admin.listRedeemCodes(query(ctx))))
  route('POST', '/api/v1/admin/redeem-codes', (ctx) => service.admin.generateRedeemCodes(admin(ctx), ctx.body as any))
  route('GET', '/api/v1/admin/redeem-batches/:batchId', (ctx) => (admin(ctx), service.admin.exportRedeemBatch(ctx.params.batchId)))
  route('PATCH', '/api/v1/admin/redeem-batches/:batchId', (ctx) => service.admin.setRedeemBatchStatus(admin(ctx), ctx.params.batchId, ctx.body.status === 'disabled' ? 'disabled' : 'unused'))
  route('POST', '/api/v1/admin/users/:id/credits', (ctx) => service.admin.adjustCredits(admin(ctx), ctx.params.id, ctx.body as any))
  route('GET', '/api/v1/admin/billing', (ctx) => (admin(ctx), service.admin.billing()))
  route('PUT', '/api/v1/admin/billing/defaults', (ctx) => service.admin.saveBillingDefaults(admin(ctx), ctx.body))
  route('POST', '/api/v1/admin/billing/models', (ctx) => service.admin.upsertModel(admin(ctx), ctx.body))
  route('DELETE', '/api/v1/admin/billing/models/:id', (ctx) => service.admin.deleteModel(admin(ctx), ctx.params.id))
  route('GET', '/api/v1/admin/billing/usage', (ctx) => (admin(ctx), service.admin.usageStats(ctx.url.searchParams.get('days'))))
  route('PATCH', '/api/v1/admin/redeem-codes/:code',(ctx) => ({ code: service.admin.setRedeemStatus(admin(ctx), ctx.params.code, ctx.body.status === 'disabled' ? 'disabled' : 'unused') }))
  route('GET', '/api/v1/admin/config', (ctx) => (admin(ctx), { entries: service.admin.listConfig() }))
  route('PUT', '/api/v1/admin/config/:key', (ctx) => ({ entry: service.admin.upsertConfig(admin(ctx), { value: ctx.body.value, scope: ctx.body.scope, description: ctx.body.description, key: ctx.params.key }) }))
  route('DELETE', '/api/v1/admin/config/:key', (ctx) => (service.admin.deleteConfig(admin(ctx), ctx.params.key), {}))
  route('GET', '/api/v1/admin/software-settings', (ctx) => (admin(ctx), service.admin.getManagedSettings()))
  route('PUT', '/api/v1/admin/software-settings', (ctx) => service.admin.saveManagedSettings(admin(ctx), ctx.body.settings))
  route('GET', '/api/v1/admin/audit', (ctx) => (admin(ctx), service.admin.listAudit(query(ctx))))

  function applyCors(req: http.IncomingMessage, res: http.ServerResponse) {
    const origin = String(req.headers.origin || '')
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
      res.setHeader('Access-Control-Max-Age', '600')
    }
  }

  function sendJson(res: http.ServerResponse, status: number, payload: unknown) {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(payload))
  }

  const webApp = createWebApp(config.webAppDir)

  return async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      const pathname = new URL(req.url || '/', 'http://cloud.local').pathname
      if (await webApp(req, res, pathname)) return
      // 电脑端 AI 请求代理（自己处理请求体与流式响应，不走下面的 JSON 路由）
      if (aiProxy && (await aiProxy.handle(req, res, pathname))) return
    } catch (error) {
      console.error('[cloud] 网页版文件读取失败', error)
      if (!res.headersSent) {
        res.statusCode = 500
        res.end()
      }
      return
    }
    applyCors(req, res)
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      const url = new URL(req.url || '/', 'http://cloud.local')
      const method = String(req.method || 'GET').toUpperCase()
      let matched: { handler: Handler; params: Record<string, string>; options: RouteOptions } | null = null
      let pathMatched = false
      for (const r of routes) {
        const m = r.pattern.exec(url.pathname)
        if (!m) continue
        pathMatched = true
        if (r.method !== method) continue
        matched = { handler: r.handler, options: r.options, params: Object.fromEntries(r.keys.map((key, i) => [key, decodeURIComponent(m[i + 1])])) }
        break
      }
      if (!matched) {
        sendJson(res, pathMatched ? 405 : 404, { ok: false, code: 'NOT_FOUND', error: pathMatched ? '方法不允许' : '接口不存在' })
        return
      }
      const bodyBuffer = method === 'GET' || method === 'HEAD' ? Buffer.alloc(0) : await readBody(req, matched.options.maxBodyBytes)
      const rawBody = matched.options.maxBodyBytes ? '' : bodyBuffer.toString('utf8')
      let body: Record<string, any> = {}
      const contentType = String(req.headers['content-type'] || '')
      if (rawBody && contentType.includes('application/json')) {
        try {
          const parsed = JSON.parse(rawBody)
          body = parsed && typeof parsed === 'object' ? parsed : {}
        } catch {
          throw badRequest('JSON 格式错误')
        }
      }
      const auth = String(req.headers.authorization || '')
      const ctx: Ctx = {
        req,
        url,
        params: matched.params,
        ip: clientIp(req, config.trustProxy),
        token: auth.startsWith('Bearer ') ? auth.slice(7).trim() || null : null,
        rawBody,
        bodyBuffer,
        body,
      }
      const result = await matched.handler(ctx)
      if (result && typeof result === 'object' && (result as RawResponse).__raw) {
        const r = result as RawResponse
        res.statusCode = r.status
        res.setHeader('Content-Type', r.contentType)
        for (const [name, value] of Object.entries(r.headers || {})) res.setHeader(name, value)
        res.end(r.body)
        return
      }
      sendJson(res, 200, { ok: true, ...(result as object) })
    } catch (error) {
      if (error instanceof CloudError) {
        sendJson(res, error.status, { ok: false, code: error.code, error: error.message, details: error.details })
        return
      }
      console.error('[cloud] 未处理的错误', error)
      sendJson(res, 500, { ok: false, code: 'INTERNAL', error: '服务器内部错误' })
    }
  }
}
