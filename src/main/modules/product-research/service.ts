import { DEFAULT_PRODUCT_RESEARCH_SOURCE, normalizeResearchSource, researchSourceOf } from '../../../shared/productResearch'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { execFile } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import QRCode from 'qrcode'
import { WebSocket, WebSocketServer } from 'ws'
import { getAppPaths } from '../../lib/paths'
import type {
  ProductResearchDevice,
  ProductResearchFirewall,
  ProductResearchPairing,
  ProductResearchResult, ProductResearchSource,
  ProductResearchSnapshot,
  ProductResearchTask,
  ProductResearchScheme,
  ProductResearchSchemeState,
  ProductResearchSchemeStatus,
  ProductResearchTaskStatus,
} from '../../../shared/productResearch'

type PersistedState = {
  /** 这台电脑的固定标识：手机或电脑换了 IP 后，手机靠它在局域网里重新找到电脑 */
  serverId?: string
  devices: ProductResearchDevice[]
  deviceTokens: Record<string, string>
  tasks: ProductResearchTask[]
  results: ProductResearchResult[]
  schemes: ProductResearchScheme[]
  schemeStates: Record<string, ProductResearchSchemeState>
}

type PairingSession = {
  code: string
  expiresAt: number
}

type SocketMessage = {
  type?: string
  taskId?: string
  deviceId?: string
  result?: Partial<ProductResearchResult>
  error?: string
}

const MAX_BODY_BYTES = 2 * 1024 * 1024
const PAIRING_TTL_MS = 5 * 60 * 1000
/** 手机连接端口；测试时可用环境变量换一个，避免和正在运行的软件冲突 */
const PRODUCT_RESEARCH_PORT = Number(process.env.KLIPMILL_RESEARCH_PORT) || 41688
/** 手机 App 采集结果统一归入的方案 */
const MOBILE_SCHEME_ID = 'mobile-collect'

const FIREWALL_RULE_NAME = 'Klipmill Product Research'
const VIRTUAL_ADAPTER = /(virtual|vmware|vethernet|virtualbox|tailscale|zerotier|wireguard|tap|tun|clash|meta|vpn|loopback|docker|wsl|hyper-v|bluetooth)/i
/** 手机回传的「已有任务在跑」：断线重连后电脑重发了手机上正在跑的同一个任务，不算失败 */
const PHONE_BUSY_ERROR = /Another task is already running/i

/** 电脑所有局域网 IPv4，真实网卡在前（VPN、虚拟网卡放后面），手机会挨个试 */
function localIpv4Addresses() {
  const physical: string[] = []
  const others: string[] = []
  for (const [name, rows] of Object.entries(networkInterfaces())) {
    for (const row of rows || []) {
      if (row.family !== 'IPv4' || row.internal || !isPrivateIpv4(row.address)) continue
      ;(VIRTUAL_ADAPTER.test(name) ? others : physical).push(row.address)
    }
  }
  // 家用路由器最常见的 192.168.x 排最前
  physical.sort((a, b) => Number(!a.startsWith('192.168.')) - Number(!b.startsWith('192.168.')))
  const all = [...new Set([...physical, ...others])]
  return all.length ? all : ['127.0.0.1']
}

function runCommand(file: string, args: string[]) {
  return new Promise<string>((resolve) => {
    execFile(file, args, { windowsHide: true }, (_error, stdout) => resolve(String(stdout || '')))
  })
}

function isPrivateIpv4(address: string) {
  if (/^10\./.test(address) || /^192\.168\./.test(address)) return true
  const match = /^172\.(\d+)\./.exec(address)
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31)
}

function json(response: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  response.end(body)
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += value.length
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large.')
    chunks.push(value)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

class ProductResearchService {
  private state: PersistedState = { devices: [], deviceTokens: {}, tasks: [], results: [], schemes: [], schemeStates: {} }
  private loaded = false
  private server: ReturnType<typeof createServer> | null = null
  private socketServer: WebSocketServer | null = null
  private port = 0
  private pairing: PairingSession | null = null
  private readonly sockets = new Map<string, WebSocket>()
  private persistTimer: NodeJS.Timeout | null = null
  private messageQueue = Promise.resolve()

  private get stateFile() {
    return join(getAppPaths().dataDir, 'product-research.json')
  }

  private get imageDirectory() {
    return join(getAppPaths().dataDir, 'product-research-images')
  }

  private async ensureLoaded() {
    if (this.loaded) return
    this.loaded = true
    try {
      const parsed = JSON.parse(await readFile(this.stateFile, 'utf8')) as Partial<PersistedState>
      this.state = {
        serverId: typeof parsed.serverId === 'string' && parsed.serverId ? parsed.serverId : undefined,
        devices: Array.isArray(parsed.devices) ? parsed.devices.map((item) => ({ ...item, connected: false })) : [],
        deviceTokens: parsed.deviceTokens && typeof parsed.deviceTokens === 'object' ? parsed.deviceTokens : {},
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        results: Array.isArray(parsed.results) ? parsed.results : [],
        schemes: Array.isArray(parsed.schemes) ? parsed.schemes : [],
        schemeStates: parsed.schemeStates && typeof parsed.schemeStates === 'object' ? parsed.schemeStates : {},
      }
      await this.migrateResults()
    } catch {
      this.state = { devices: [], deviceTokens: {}, tasks: [], results: [], schemes: [], schemeStates: {} }
    }
    if (!this.state.serverId) this.state.serverId = randomUUID()
    // 上次关软件时没跑完的任务：放回排队，手机连上后接着采
    for (const task of this.state.tasks) {
      if (task.status === 'running' || (task.status === 'queued' && task.dispatchedAt)) {
        task.status = 'queued'
        task.dispatchedAt = undefined
        task.startedAt = undefined
      }
    }
  }

  /** 这台手机手上是否已有任务（已下发、还没结束） */
  private deviceBusy(deviceId: string) {
    return this.state.tasks.some((item) => item.deviceId === deviceId && (item.status === 'running' || (item.status === 'queued' && Boolean(item.dispatchedAt))))
  }

  /**
   * 手机一次只能跑一个任务：每台在线且空闲的手机领最早排队的一个。
   * 新建任务、任务结束 / 取消、手机连上时都会调一次。
   */
  private pump() {
    const waiting = this.state.tasks.filter((item) => item.status === 'queued' && !item.dispatchedAt).sort((a, b) => a.createdAt - b.createdAt)
    let dispatched = false
    for (const deviceId of this.sockets.keys()) {
      if (this.deviceBusy(deviceId)) continue
      const next = waiting.find((item) => !item.dispatchedAt && (!item.deviceId || item.deviceId === deviceId || !this.sockets.has(item.deviceId)))
      if (next && this.dispatchTask(next, deviceId)) dispatched = true
    }
    if (dispatched) this.schedulePersist()
    return dispatched
  }

  private async persist() {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = null
    await writeFile(this.stateFile, JSON.stringify(this.state, null, 2), 'utf8')
  }

  private schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => void this.persist(), 300)
  }

  private resultKey(title: string) {
    return title.normalize('NFKC').replace(/[\s\u200b-\u200d\ufeff]/g, '').toLowerCase()
  }

  private async storeImage(resultId: string, dataUrl: string) {
    const match = /^data:image\/(jpeg|jpg|png|webp);base64,([a-z0-9+/=]+)$/i.exec(dataUrl)
    if (!match) return undefined
    const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()
    await mkdir(this.imageDirectory, { recursive: true })
    const imagePath = join(this.imageDirectory, `${resultId}.${extension}`)
    await writeFile(imagePath, Buffer.from(match[2], 'base64'))
    return imagePath
  }

  private async removeImage(imagePath?: string) {
    if (!imagePath) return
    try {
      await unlink(imagePath)
    } catch {
      /* Ignore missing images. */
    }
  }

  private async migrateResults() {
    let modified = false
    for (const result of this.state.results) {
      if (result.imageDataUrl && !result.imagePath) {
        result.imagePath = await this.storeImage(result.id, result.imageDataUrl)
        delete result.imageDataUrl
        modified = true
      }
    }
    if (modified) await this.persist()
  }

  private endpoints() {
    return this.port ? localIpv4Addresses().map((address) => `http://${address}:${this.port}`) : []
  }

  private endpoint() {
    return this.endpoints()[0] || ''
  }

  private handleDeviceRequest(request: IncomingMessage, response: ServerResponse) {
    this.messageQueue = this.messageQueue.then(async () => {
      try {
        const body = await readJson(request)
        const action = String(body.action || '')
        if (action === 'pair') {
          if (!this.pairing || Date.now() > this.pairing.expiresAt) return json(response, 403, { error: 'No active pairing session.' })
          if (body.pairingCode !== this.pairing.code) return json(response, 403, { error: 'Invalid pairing code.' })
          const deviceId = String(body.deviceId || '').trim()
          const deviceName = String(body.deviceName || '').trim()
          if (!deviceId || !deviceName) return json(response, 400, { error: 'Missing device info.' })
          const token = randomBytes(24).toString('base64url')
          this.state.deviceTokens[deviceId] = token
          const device = this.state.devices.find((item) => item.id === deviceId)
          const now = Date.now()
          const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined
          if (device) {
            device.name = deviceName
            device.lastSeenAt = now
            if (model) device.model = model
          } else {
            this.state.devices.push({ id: deviceId, name: deviceName, model, platform: 'android', connected: false, pairedAt: now, lastSeenAt: now })
          }
          this.pairing = null
          await this.persist()
          return json(response, 200, { token, serverId: this.state.serverId, endpoints: this.endpoints() })
        }
        const deviceId = String(body.deviceId || '').trim()
        const token = String(body.token || '').trim()
        if (!deviceId || !token || this.state.deviceTokens[deviceId] !== token) return json(response, 403, { error: 'Invalid credentials.' })
        const device = this.state.devices.find((item) => item.id === deviceId)
        if (device) device.lastSeenAt = Date.now()
        if (action === 'heartbeat') {
          if (device && typeof body.batteryLevel === 'number') device.batteryLevel = Math.max(0, Math.min(100, Math.round(body.batteryLevel)))
          if (device && typeof body.model === 'string' && body.model.trim()) device.model = body.model.trim()
          this.schedulePersist()
          return json(response, 200, { ok: true, serverId: this.state.serverId, endpoints: this.endpoints() })
        }
        return json(response, 400, { error: 'Unknown action.' })
      } catch (error) {
        json(response, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    })
  }

  private handleSocketMessage(deviceId: string, message: SocketMessage) {
    this.messageQueue = this.messageQueue.then(async () => {
      try {
        if (message.type === 'task_progress') {
          const task = this.state.tasks.find((item) => item.id === message.taskId)
          if (task && task.deviceId === deviceId) {
            if (task.status === 'queued') task.status = 'running'
            if (!task.startedAt) task.startedAt = Date.now()
            this.schedulePersist()
          }
        } else if (message.type === 'task_result') {
          const task = this.state.tasks.find((item) => item.id === message.taskId)
          if (!task || task.deviceId !== deviceId || !message.result) return
          const partial = message.result
          const resultId = randomUUID()
          const result: ProductResearchResult = {
            id: resultId,
            taskId: task.id,
            schemeId: task.schemeId,
            keyword: task.keyword,
            source: normalizeResearchSource(partial.source) || researchSourceOf(task),
            currency: partial.currency ? String(partial.currency).toUpperCase() : undefined,
            title: String(partial.title || ''),
            priceText: String(partial.priceText || ''),
            priceValue: typeof partial.priceValue === 'number' ? partial.priceValue : undefined,
            salesText: String(partial.salesText || ''),
            salesValue: typeof partial.salesValue === 'number' ? partial.salesValue : undefined,
            shopName: String(partial.shopName || ''),
            rating: typeof partial.rating === 'number' && Number.isFinite(partial.rating) ? partial.rating : undefined,
            productUrl: partial.productUrl ? String(partial.productUrl) : undefined,
            productId: partial.productId ? String(partial.productId) : undefined,
            rank: Number(partial.rank || 0),
            capturedAt: Date.now(),
            confidence: Number(partial.confidence ?? 1),
          }
          if (partial.imageDataUrl) result.imagePath = await this.storeImage(resultId, String(partial.imageDataUrl))
          const key = this.resultKey(result.title)
          const duplicate = this.state.results.find((item) => item.taskId === task.id && this.resultKey(item.title) === key)
          if (!duplicate) {
            this.state.results.push(result)
            task.collectedCount += 1
          }
          await this.persist()
        } else if (message.type === 'task_complete') {
          const task = this.state.tasks.find((item) => item.id === message.taskId)
          if (task && task.deviceId === deviceId && task.status !== 'cancelled') {
            task.status = 'completed'
            task.completedAt = Date.now()
          }
          this.pump()
          await this.persist()
        } else if (message.type === 'task_error') {
          const task = this.state.tasks.find((item) => item.id === message.taskId)
          if (task && PHONE_BUSY_ERROR.test(String(message.error || ''))) return
          if (task && task.deviceId === deviceId && task.status !== 'cancelled') {
            task.status = 'failed'
            task.error = String(message.error || 'Unknown error')
            task.completedAt = Date.now()
          }
          this.pump()
          await this.persist()
        }
      } catch {
        /* Ignore malformed messages. */
      }
    })
  }

  async ensureServer() {
    if (this.server) return this.endpoint()
    await this.ensureLoaded()
    this.server = createServer((request, response) => {
      if (request.method === 'POST' && request.url === '/device') return this.handleDeviceRequest(request, response)
      // 手机或电脑换了 IP 后，手机扫局域网靠这个认出配对过的电脑
      if (request.method === 'GET' && request.url === '/hello') return json(response, 200, { app: 'klipmill-research', serverId: this.state.serverId })
      json(response, 404, { error: 'Not found.' })
    })
    this.socketServer = new WebSocketServer({ server: this.server })
    this.socketServer.on('connection', (socket, request) => {
      const url = new URL(String(request.url), 'ws://localhost')
      const deviceId = url.searchParams.get('deviceId') || ''
      const token = url.searchParams.get('token') || ''
      if (!deviceId || !token || this.state.deviceTokens[deviceId] !== token) return socket.close(4003, 'Invalid credentials')
      const previous = this.sockets.get(deviceId)
      if (previous && previous !== socket) previous.terminate()
      this.sockets.set(deviceId, socket)
      const device = this.state.devices.find((item) => item.id === deviceId)
      if (device) {
        device.connected = true
        device.lastSeenAt = Date.now()
      }
      socket.on('message', (data) => {
        try {
          const message = JSON.parse(String(data)) as SocketMessage
          this.handleSocketMessage(deviceId, message)
        } catch {
          /* Ignore invalid messages. */
        }
      })
      socket.on('close', () => {
        if (this.sockets.get(deviceId) !== socket) return
        this.sockets.delete(deviceId)
        const device = this.state.devices.find((item) => item.id === deviceId)
        if (device) device.connected = false
      })
      // 断线前手上的任务重新下发（手机还在跑同一个任务时会忽略），然后接着领排队的任务
      const inFlight = this.state.tasks.filter((item) => item.deviceId === deviceId && (item.status === 'running' || (item.status === 'queued' && item.dispatchedAt)))
      for (const task of inFlight) this.dispatchTask(task, deviceId)
      this.pump()
    })
    await new Promise<void>((resolve) => {
      this.server!.listen(PRODUCT_RESEARCH_PORT, '0.0.0.0', () => resolve())
    })
    const address = this.server.address()
    this.port = typeof address === 'object' && address ? address.port : 0
    return this.endpoint()
  }

  async createPairing(): Promise<ProductResearchPairing> {
    const endpoint = await this.ensureServer()
    const pairingCode = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = Date.now() + PAIRING_TTL_MS
    this.pairing = { code: pairingCode, expiresAt }
    const endpoints = this.endpoints()
    // endpoints：电脑有多块网卡（VPN、虚拟机）时手机挨个试；旧版 App 只读 endpoint
    const value = JSON.stringify({ version: 2, endpoint, endpoints, serverId: this.state.serverId, pairingCode, expiresAt })
    const qrDataUrl = await QRCode.toDataURL(value, { width: 320, margin: 1 })
    return { qrDataUrl, endpoint, endpoints, pairingCode, expiresAt }
  }

  /** Windows 防火墙是否已放行手机连接端口（非 Windows 视为已放行） */
  async firewallStatus(): Promise<ProductResearchFirewall> {
    if (process.platform !== 'win32') return { supported: false, allowed: true }
    const output = await runCommand('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${FIREWALL_RULE_NAME}`])
    return { supported: true, allowed: output.includes(String(PRODUCT_RESEARCH_PORT)) }
  }

  /** 弹出 Windows 管理员确认，添加放行连接端口的入站规则（专用和公用网络都放行） */
  async allowFirewall(): Promise<ProductResearchFirewall> {
    if (process.platform !== 'win32') return { supported: false, allowed: true }
    const current = await this.firewallStatus()
    if (current.allowed) return current
    const args = `advfirewall firewall add rule name="${FIREWALL_RULE_NAME}" dir=in action=allow protocol=TCP localport=${PRODUCT_RESEARCH_PORT} profile=private,public`
    const script = `Start-Process -FilePath netsh -ArgumentList '${args}' -Verb RunAs -WindowStyle Hidden -Wait`
    await runCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
    return this.firewallStatus()
  }

  async snapshot(schemeId?: string): Promise<ProductResearchSnapshot> {
    await this.ensureServer()
    for (const device of this.state.devices) {
      device.connected = this.sockets.has(device.id)
    }
    return {
      serverRunning: Boolean(this.server),
      endpoint: this.endpoint(),
      endpoints: this.endpoints(),
      devices: [...this.state.devices].sort((a, b) => b.lastSeenAt - a.lastSeenAt),
      tasks: [...this.state.tasks].filter((item) => !schemeId || item.schemeId === schemeId).sort((a, b) => b.createdAt - a.createdAt),
      results: [...this.state.results].filter((item) => !schemeId || item.schemeId === schemeId).sort((a, b) => b.capturedAt - a.capturedAt),
    }
  }

  async createTask(input: { keyword: string; schemeId?: string; source?: ProductResearchSource; sort?: 'comprehensive' | 'sales'; targetCount?: number }) {
    await this.ensureServer()
    const keyword = String(input.keyword || '').trim()
    if (!keyword) throw new Error('Keyword is required.')
    // 没有手机在线也先排队：手机连上后按顺序自动开始
    const task: ProductResearchTask = {
      id: randomUUID(),
      schemeId: input.schemeId,
      keyword,
      source: normalizeResearchSource(input.source) || DEFAULT_PRODUCT_RESEARCH_SOURCE,
      sort: input.sort === 'comprehensive' ? 'comprehensive' : 'sales',
      targetCount: Math.min(1000, Math.max(1, Number(input.targetCount || 100))),
      status: 'queued',
      collectedCount: 0,
      createdAt: Date.now(),
    }
    this.state.tasks.push(task)
    this.pump()
    await this.persist()
    return task
  }

  private dispatchTask(task: ProductResearchTask, deviceId: string) {
    const socket = this.sockets.get(deviceId)
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    task.deviceId = deviceId
    task.dispatchedAt = Date.now()
    socket.send(JSON.stringify({ type: 'collect_task', task }))
    return true
  }

  async cancelTask(taskId: string) {
    await this.ensureLoaded()
    const task = this.state.tasks.find((item) => item.id === taskId)
    if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) return task
    task.status = 'cancelled'
    task.completedAt = Date.now()
    if (task.deviceId && task.dispatchedAt) this.sockets.get(task.deviceId)?.send(JSON.stringify({ type: 'cancel_task', taskId }))
    this.pump()
    await this.persist()
    return task
  }

  async removeResult(resultId: string, schemeId?: string) {
    await this.ensureLoaded()
    const index = this.state.results.findIndex((item) => item.id === resultId)
    if (index < 0 || (schemeId && this.state.results[index].schemeId !== schemeId)) return false
    const [removed] = this.state.results.splice(index, 1)
    await this.removeImage(removed.imagePath)
    await this.persist()
    return true
  }

  async removeResults(resultIds: string[], schemeId?: string) {
    await this.ensureLoaded()
    const ids = new Set(Array.isArray(resultIds) ? resultIds.map(String) : [])
    const removed = this.state.results.filter((item) => ids.has(item.id) && (!schemeId || item.schemeId === schemeId))
    if (!removed.length) return 0
    const removedIds = new Set(removed.map((item) => item.id))
    this.state.results = this.state.results.filter((item) => !removedIds.has(item.id))
    for (const task of this.state.tasks) {
      const lost = removed.filter((item) => item.taskId === task.id).length
      if (lost) task.collectedCount = Math.max(0, task.collectedCount - lost)
    }
    if (schemeId && this.state.schemeStates[schemeId]) {
      const state = this.state.schemeStates[schemeId]
      state.candidateIds = state.candidateIds.filter((id) => !removedIds.has(id))
      state.productEdits = state.productEdits.filter((item) => !removedIds.has(item.resultId))
    }
    await Promise.all(removed.map((item) => this.removeImage(item.imagePath)))
    await this.persist()
    return removed.length
  }

  async clearResults(schemeId?: string) {
    await this.ensureLoaded()
    const removed = schemeId ? this.state.results.filter((item) => item.schemeId === schemeId) : this.state.results.splice(0)
    if (schemeId) this.state.results = this.state.results.filter((item) => item.schemeId !== schemeId)
    await Promise.all(removed.map((item) => this.removeImage(item.imagePath)))
    await this.persist()
    return removed.length
  }

  async removeTask(taskId: string) {
    await this.ensureLoaded()
    const task = this.state.tasks.find((item) => item.id === taskId)
    if (!task || ['queued', 'running'].includes(task.status)) return false
    this.state.tasks = this.state.tasks.filter((item) => item.id !== taskId)
    const removedResults = this.state.results.filter((item) => item.taskId === taskId)
    this.state.results = this.state.results.filter((item) => item.taskId !== taskId)
    await Promise.all(removedResults.map((item) => this.removeImage(item.imagePath)))
    await this.persist()
    return true
  }

  async createScheme(input: { name: string; need: string; market: string; keywords: string[]; note?: string }): Promise<ProductResearchScheme> {
    await this.ensureLoaded()
    const scheme: ProductResearchScheme = {
      id: randomUUID(),
      name: String(input.name || '').trim(),
      need: String(input.need || '').trim(),
      market: String(input.market || '').trim(),
      note: input.note ? String(input.note).trim() : undefined,
      status: 'draft',
      sopStage: 1,
      keywordCount: Array.isArray(input.keywords) ? input.keywords.length : 0,
      resultCount: 0,
      candidateCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.state.schemes.push(scheme)
    this.state.schemeStates[scheme.id] = {
      keywords: Array.isArray(input.keywords) ? input.keywords.map((value, index) => ({ id: `${scheme.id}-kw-${index}`, value: String(value).trim(), status: 'pending' })) : [],
      candidateIds: [],
      productEdits: [],
      liveTestRecords: [],
    }
    await this.persist()
    return scheme
  }

  /**
   * 导入手机 App 上直接采集的结果（经云端同步而来），统一放进「手机采集」方案，
   * 之后可以和电脑下发的采集一样走分析、确定商品的流程。重复导入同一条会跳过。
   */
  async importMobileCollection(input: {
    tasks: Array<{ id: string; keyword: string; targetCount: number; collected: number; status: string; error?: string; startedAt: number; finishedAt?: number }>
    results: Array<Omit<ProductResearchResult, 'schemeId' | 'shopName' | 'confidence' | 'imageDataUrl'> & { imagePath?: string }>
  }): Promise<{ tasks: number; results: number }> {
    await this.ensureLoaded()
    if (!input.tasks.length && !input.results.length) return { tasks: 0, results: 0 }
    let scheme = this.state.schemes.find((item) => item.id === MOBILE_SCHEME_ID)
    if (!scheme) {
      const ts = Date.now()
      scheme = { id: MOBILE_SCHEME_ID, name: '手机采集', need: '在 Klipmill 手机 App 上直接采集的抖音商品', market: '抖音', status: 'active', sopStage: 2, keywordCount: 0, resultCount: 0, candidateCount: 0, createdAt: ts, updatedAt: ts }
      this.state.schemes.push(scheme)
    }
    const schemeState = (this.state.schemeStates[MOBILE_SCHEME_ID] ??= { keywords: [], candidateIds: [], productEdits: [], liveTestRecords: [] })
    const statusOf = (value: string): ProductResearchTaskStatus =>
      value === 'completed' || value === 'failed' || value === 'cancelled' || value === 'running' ? value : 'completed'

    let tasks = 0
    for (const item of input.tasks) {
      const existing = this.state.tasks.find((task) => task.id === item.id)
      const next: ProductResearchTask = {
        id: item.id,
        schemeId: MOBILE_SCHEME_ID,
        keyword: item.keyword,
        sort: 'sales',
        targetCount: item.targetCount,
        status: statusOf(item.status),
        collectedCount: item.collected,
        createdAt: item.startedAt,
        startedAt: item.startedAt,
        completedAt: item.finishedAt,
        error: item.error,
      }
      if (existing) Object.assign(existing, next)
      else this.state.tasks.push(next)
      tasks += 1
      if (item.keyword && !schemeState.keywords.some((keyword) => keyword.value === item.keyword)) {
        schemeState.keywords.push({ id: `${MOBILE_SCHEME_ID}-kw-${randomUUID()}`, value: item.keyword, status: 'collected' })
      }
    }

    let results = 0
    for (const item of input.results) {
      if (this.state.results.some((result) => result.id === item.id)) continue
      this.state.results.push({ ...item, source: researchSourceOf(item), schemeId: MOBILE_SCHEME_ID, shopName: '', confidence: 0.88 })
      results += 1
    }
    scheme.keywordCount = schemeState.keywords.length
    scheme.updatedAt = Date.now()
    await this.persist()
    return { tasks, results }
  }

  /** 各方案里填过的款号 */
  async listCodes(): Promise<string[]> {
    await this.ensureLoaded()
    return Object.values(this.state.schemeStates).flatMap((item) => (item.productEdits || []).map((edit) => edit.code || '')).filter(Boolean)
  }

  async listSchemes(): Promise<ProductResearchScheme[]> {
    await this.ensureLoaded()
    return this.state.schemes.map((scheme) => {
      const resultCount = this.state.results.filter((item) => item.schemeId === scheme.id).length
      const candidateCount = this.state.schemeStates[scheme.id]?.candidateIds.length || 0
      return { ...scheme, resultCount, candidateCount }
    }).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async updateScheme(id: string, patch: Partial<Pick<ProductResearchScheme, 'name' | 'need' | 'market' | 'note' | 'status' | 'sopStage' | 'starred' | 'category'>>): Promise<ProductResearchScheme | null> {
    await this.ensureLoaded()
    const scheme = this.state.schemes.find((item) => item.id === id)
    if (!scheme) return null
    if (patch.name !== undefined) scheme.name = String(patch.name).trim()
    if (patch.need !== undefined) scheme.need = String(patch.need).trim()
    if (patch.market !== undefined) scheme.market = String(patch.market).trim()
    if (patch.note !== undefined) scheme.note = patch.note ? String(patch.note).trim() : undefined
    if (patch.status !== undefined) scheme.status = patch.status
    if (patch.sopStage !== undefined) scheme.sopStage = Math.min(5, Math.max(1, Number(patch.sopStage) || 1))
    if (patch.starred !== undefined) scheme.starred = Boolean(patch.starred)
    if (patch.category !== undefined) scheme.category = patch.category ? String(patch.category).trim() : undefined
    scheme.updatedAt = Date.now()
    await this.persist()
    return scheme
  }

  async deleteScheme(id: string): Promise<boolean> {
    await this.ensureLoaded()
    const index = this.state.schemes.findIndex((item) => item.id === id)
    if (index < 0) return false
    this.state.schemes.splice(index, 1)
    delete this.state.schemeStates[id]
    this.state.tasks = this.state.tasks.filter((item) => item.schemeId !== id)
    const removedResults = this.state.results.filter((item) => item.schemeId === id)
    this.state.results = this.state.results.filter((item) => item.schemeId !== id)
    await Promise.all(removedResults.map((item) => this.removeImage(item.imagePath)))
    await this.persist()
    return true
  }

  async getSchemeState(id: string): Promise<ProductResearchSchemeState | null> {
    await this.ensureLoaded()
    if (!this.state.schemes.find((item) => item.id === id)) return null
    if (!this.state.schemeStates[id]) {
      this.state.schemeStates[id] = { keywords: [], candidateIds: [], productEdits: [], liveTestRecords: [] }
    }
    return this.state.schemeStates[id]
  }

  async saveSchemeState(id: string, patch: Partial<ProductResearchSchemeState>): Promise<boolean> {
    await this.ensureLoaded()
    const scheme = this.state.schemes.find((item) => item.id === id)
    if (!scheme) return false
    if (!this.state.schemeStates[id]) {
      this.state.schemeStates[id] = { keywords: [], candidateIds: [], productEdits: [], liveTestRecords: [] }
    }
    const state = this.state.schemeStates[id]
    if (patch.keywords !== undefined) state.keywords = patch.keywords
    if (patch.candidateIds !== undefined) state.candidateIds = patch.candidateIds
    if (patch.productEdits !== undefined) state.productEdits = patch.productEdits
    if (patch.liveTestRecords !== undefined) state.liveTestRecords = patch.liveTestRecords
    scheme.keywordCount = state.keywords.length
    scheme.candidateCount = state.candidateIds.length
    scheme.updatedAt = Date.now()
    await this.persist()
    return true
  }

  /* ---------------------------------------------------------------- 网页同步（cloud-sync/researchBridge） */

  /** Everything the web version mirrors. Does not start the LAN server. */
  async exportForSync() {
    await this.ensureLoaded()
    for (const device of this.state.devices) device.connected = this.sockets.has(device.id)
    return {
      schemes: await this.listSchemes(),
      schemeStates: this.state.schemeStates,
      tasks: [...this.state.tasks],
      results: [...this.state.results],
      devices: [...this.state.devices],
      serverRunning: Boolean(this.server),
      endpoint: this.server ? this.endpoint() : '',
    }
  }

  /** A scheme edited on the web: replace ours (keeps the web's updatedAt so both sides agree on the version). */
  async applySchemeFromSync(scheme: ProductResearchScheme, schemeState: ProductResearchSchemeState) {
    await this.ensureLoaded()
    const index = this.state.schemes.findIndex((item) => item.id === scheme.id)
    if (index >= 0) this.state.schemes[index] = { ...scheme }
    else this.state.schemes.push({ ...scheme })
    this.state.schemeStates[scheme.id] = {
      keywords: Array.isArray(schemeState?.keywords) ? schemeState.keywords : [],
      candidateIds: Array.isArray(schemeState?.candidateIds) ? schemeState.candidateIds : [],
      productEdits: Array.isArray(schemeState?.productEdits) ? schemeState.productEdits : [],
      liveTestRecords: Array.isArray(schemeState?.liveTestRecords) ? schemeState.liveTestRecords : [],
    }
    await this.persist()
  }

  async stop() {
    for (const socket of this.sockets.values()) socket.close(1001, 'Server stopping')
    this.sockets.clear()
    this.socketServer?.close()
    this.socketServer = null
    if (this.server) await new Promise<void>((resolve) => this.server?.close(() => resolve()))
    this.server = null
    this.port = 0
  }
}

export const productResearchService = new ProductResearchService()
