import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { hermesRuntime } from './runtime'
import { approveHermesPairing } from './pairing'
import type { HermesChannelSummary, HermesPairingStatus } from './types'

const SUPPORTED_CHANNELS = new Set(['feishu', 'wecom', 'wecom_callback', 'weixin'])
const WEIXIN_BASE_URL = 'https://ilinkai.weixin.qq.com'
const WEIXIN_CLIENT_VERSION = String((2 << 16) | (2 << 8))
const pairingSessions = new Map<string, {
  platform: 'wecom' | 'weixin'
  code: string
  baseUrl: string
  expiresAt: number
}>()

function backupDirectory() {
  return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'VideoGenerate', 'hermes-backups')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function assertChannel(value: string) {
  const channel = String(value || '').trim().toLowerCase()
  if (!SUPPORTED_CHANNELS.has(channel)) throw new Error('This Hermes messaging channel is not supported by VideoGenerate.')
  return channel
}

function query(path: string, params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const suffix = search.toString()
  return suffix ? `${path}?${suffix}` : path
}

function normalizeChannel(value: unknown): HermesChannelSummary {
  const row = asRecord(value)
  const fields = (Array.isArray(row.env_vars) ? row.env_vars : []).map((item) => {
    const field = asRecord(item)
    return {
      key: String(field.key || ''),
      prompt: String(field.prompt || field.key || ''),
      description: String(field.description || ''),
      required: Boolean(field.required),
      password: Boolean(field.is_password),
      advanced: Boolean(field.advanced),
      configured: Boolean(field.is_set),
      redactedValue: String(field.redacted_value || ''),
    }
  }).filter((field) => field.key)
  return {
    id: String(row.id || ''),
    name: String(row.name || row.id || ''),
    description: String(row.description || ''),
    docsUrl: String(row.docs_url || ''),
    enabled: Boolean(row.enabled),
    configured: Boolean(row.configured),
    connected: String(row.state || '') === 'connected',
    state: String(row.state || 'disabled'),
    gatewayRunning: Boolean(row.gateway_running),
    fields,
  }
}

class HermesManagementService {
  async migrateLegacyIntegrationSettings() {
    const { cloneService } = await import('../clone/service')
    const legacy = await cloneService.getHermesIntegrationSettings()
    const channels = await this.listChannels()
    const feishu = channels.find((channel) => channel.id === 'feishu')
    const wecom = channels.find((channel) => channel.id === 'wecom_callback')
    if (feishu) {
      const configured = new Set(feishu.fields.filter((field) => field.configured).map((field) => field.key))
      const values: Record<string, string> = {}
      if (!configured.has('FEISHU_APP_ID') && legacy.feishu.appId) values.FEISHU_APP_ID = legacy.feishu.appId
      if (!configured.has('FEISHU_APP_SECRET') && legacy.feishu.appSecret) values.FEISHU_APP_SECRET = legacy.feishu.appSecret
      if (Object.keys(values).length) await this.saveChannel({ id: 'feishu', enabled: legacy.feishu.enabled, values })
    }
    if (wecom) {
      const configured = new Set(wecom.fields.filter((field) => field.configured).map((field) => field.key))
      const values: Record<string, string> = {}
      if (!configured.has('WECOM_CALLBACK_CORP_ID') && legacy.wecom.corpId) values.WECOM_CALLBACK_CORP_ID = legacy.wecom.corpId
      if (!configured.has('WECOM_CALLBACK_CORP_SECRET') && legacy.wecom.corpSecret) values.WECOM_CALLBACK_CORP_SECRET = legacy.wecom.corpSecret
      if (!configured.has('WECOM_CALLBACK_AGENT_ID') && legacy.wecom.agentId) values.WECOM_CALLBACK_AGENT_ID = legacy.wecom.agentId
      if (Object.keys(values).length) await this.saveChannel({ id: 'wecom_callback', enabled: legacy.wecom.enabled, values })
    }
    return { migrated: true }
  }

  async getGatewayStatus() {
    return await hermesRuntime.getManagedGatewayStatus()
  }

  async startGateway() {
    return await hermesRuntime.startManagedGateway()
  }

  async stopGateway() {
    return await hermesRuntime.stopManagedGateway()
  }

  async restartGateway() {
    return await hermesRuntime.restartManagedGateway()
  }

  async approvePairing(input: { platform: string; code: string }) {
    return await approveHermesPairing(input)
  }

  async listSkills() {
    const result = await hermesRuntime.dashboardRequest('/api/skills')
    return Array.isArray(result) ? result : []
  }

  async searchSkills(input: { query: string; source?: string; limit?: number }) {
    const search = String(input.query || '').trim()
    if (!search) return { results: [], source_counts: {}, timed_out: [], installed: {} }
    return await hermesRuntime.dashboardRequest(query('/api/skills/hub/search', {
      q: search,
      source: String(input.source || 'all'),
      limit: Math.min(50, Math.max(1, Number(input.limit || 20))),
    }))
  }

  async inspectSkill(identifier: string) {
    const value = String(identifier || '').trim()
    if (!value) throw new Error('A Hermes skill identifier is required.')
    return await hermesRuntime.dashboardRequest(query('/api/skills/hub/preview', { identifier: value }))
  }

  async auditSkill(identifier: string) {
    const value = String(identifier || '').trim()
    if (!value) throw new Error('A Hermes skill identifier is required.')
    return await hermesRuntime.dashboardRequest(query('/api/skills/hub/scan', { identifier: value }))
  }

  async installSkill(identifier: string) {
    const value = String(identifier || '').trim()
    if (!value) throw new Error('A Hermes skill identifier is required.')
    return await hermesRuntime.dashboardRequest('/api/skills/hub/install', {
      method: 'POST',
      body: JSON.stringify({ identifier: value }),
    })
  }

  async updateSkills() {
    return await hermesRuntime.dashboardRequest('/api/skills/hub/update', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }

  async uninstallSkill(name: string) {
    const value = String(name || '').trim()
    if (!value) throw new Error('A Hermes skill name is required.')
    return await hermesRuntime.dashboardRequest('/api/skills/hub/uninstall', {
      method: 'POST',
      body: JSON.stringify({ name: value }),
    })
  }

  async setSkillEnabled(name: string, enabled: boolean) {
    const value = String(name || '').trim()
    if (!value) throw new Error('A Hermes skill name is required.')
    return await hermesRuntime.dashboardRequest('/api/skills/toggle', {
      method: 'PUT',
      body: JSON.stringify({ name: value, enabled: Boolean(enabled) }),
    })
  }

  async listChannels() {
    const result = await hermesRuntime.dashboardRequest('/api/messaging/platforms')
    return (Array.isArray(result.platforms) ? result.platforms : [])
      .map(normalizeChannel)
      .filter((channel) => SUPPORTED_CHANNELS.has(channel.id))
  }

  async getChannel(id: string) {
    const channel = assertChannel(id)
    const channels = await this.listChannels()
    const result = channels.find((item) => item.id === channel)
    if (!result) throw new Error('The Hermes messaging channel is unavailable in this runtime.')
    return result
  }

  async saveChannel(input: { id: string; enabled?: boolean; values?: Record<string, string>; clear?: string[] }) {
    const channel = assertChannel(input.id)
    const current = await this.getChannel(channel)
    const allowed = new Set(current.fields.map((field) => field.key))
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(input.values || {})) {
      if (!allowed.has(key)) throw new Error(`The Hermes channel field is not allowed: ${key}`)
      const normalized = String(value || '').trim()
      if (/\r|\n/.test(normalized)) throw new Error(`The Hermes channel field contains invalid characters: ${key}`)
      if (normalized) env[key] = normalized
    }
    const clear = (input.clear || []).map(String).filter((key) => allowed.has(key))
    await hermesRuntime.dashboardRequest(`/api/messaging/platforms/${encodeURIComponent(channel)}`, {
      method: 'PUT',
      body: JSON.stringify({ env, clear_env: clear, enabled: input.enabled }),
    })
    return await this.getChannel(channel)
  }

  async testChannel(id: string) {
    const channel = assertChannel(id)
    return await hermesRuntime.dashboardRequest(`/api/messaging/platforms/${encodeURIComponent(channel)}/test`, { method: 'POST' })
  }

  async connectChannel(id: string) {
    const channel = assertChannel(id)
    await this.saveChannel({ id: channel, enabled: true })
    await this.restartGateway()
    return await this.getChannel(channel)
  }

  async disconnectChannel(id: string) {
    const channel = assertChannel(id)
    await this.saveChannel({ id: channel, enabled: false })
    await this.restartGateway()
    return await this.getChannel(channel)
  }

  async startPairing(platformInput: string): Promise<HermesPairingStatus> {
    const platform = assertChannel(platformInput)
    if (platform !== 'wecom' && platform !== 'weixin') throw new Error('This Hermes channel does not support QR pairing.')
    if (platform === 'wecom') {
      const response = await fetch('https://work.weixin.qq.com/ai/qc/generate?source=hermes', {
        headers: { 'User-Agent': 'VideoGenerate-Hermes/1.0' },
        signal: AbortSignal.timeout(15_000),
      })
      const body = asRecord(await response.json())
      const data = asRecord(body.data)
      const code = String(data.scode || '')
      const qrContent = String(data.auth_url || '')
      if (!response.ok || !code || !qrContent) throw new Error('WeCom did not return a valid QR pairing response.')
      const pairingId = randomUUID()
      pairingSessions.set(pairingId, { platform, code, baseUrl: '', expiresAt: Date.now() + 5 * 60_000 })
      return { pairingId, platform, state: 'waiting', qrContent, expiresAt: Date.now() + 5 * 60_000 }
    }

    const response = await fetch(`${WEIXIN_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`, {
      headers: { 'iLink-App-Id': 'bot', 'iLink-App-ClientVersion': WEIXIN_CLIENT_VERSION },
      signal: AbortSignal.timeout(35_000),
    })
    const body = asRecord(await response.json())
    const code = String(body.qrcode || '')
    const qrContent = String(body.qrcode_img_content || code)
    if (!response.ok || !code || !qrContent) throw new Error('Weixin did not return a valid QR pairing response.')
    const pairingId = randomUUID()
    pairingSessions.set(pairingId, { platform, code, baseUrl: WEIXIN_BASE_URL, expiresAt: Date.now() + 8 * 60_000 })
    return { pairingId, platform, state: 'waiting', qrContent, expiresAt: Date.now() + 8 * 60_000 }
  }

  async pollPairing(pairingIdInput: string): Promise<HermesPairingStatus> {
    const pairingId = String(pairingIdInput || '').trim()
    const pairing = pairingSessions.get(pairingId)
    if (!pairing) throw new Error('The Hermes pairing session was not found.')
    if (Date.now() >= pairing.expiresAt) {
      pairingSessions.delete(pairingId)
      return { pairingId, platform: pairing.platform, state: 'expired', expiresAt: pairing.expiresAt }
    }

    if (pairing.platform === 'wecom') {
      const response = await fetch(`https://work.weixin.qq.com/ai/qc/query_result?scode=${encodeURIComponent(pairing.code)}`, {
        headers: { 'User-Agent': 'VideoGenerate-Hermes/1.0' },
        signal: AbortSignal.timeout(15_000),
      })
      const body = asRecord(await response.json())
      const data = asRecord(body.data)
      const state = String(data.status || 'waiting').toLowerCase()
      if (state !== 'success') return { pairingId, platform: pairing.platform, state: state === 'scaned' ? 'scanned' : 'waiting', expiresAt: pairing.expiresAt }
      const credentials = asRecord(data.bot_info)
      const botId = String(credentials.botid || credentials.bot_id || '')
      const secret = String(credentials.secret || '')
      if (!botId || !secret) throw new Error('WeCom pairing completed without valid bot credentials.')
      await this.saveChannel({ id: 'wecom', enabled: true, values: { WECOM_BOT_ID: botId, WECOM_SECRET: secret } })
      pairingSessions.delete(pairingId)
      await this.restartGateway()
      return { pairingId, platform: pairing.platform, state: 'connected', expiresAt: pairing.expiresAt }
    }

    const response = await fetch(`${pairing.baseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(pairing.code)}`, {
      headers: { 'iLink-App-Id': 'bot', 'iLink-App-ClientVersion': WEIXIN_CLIENT_VERSION },
      signal: AbortSignal.timeout(35_000),
    })
    const body = asRecord(await response.json())
    const state = String(body.status || 'waiting').toLowerCase()
    if (state === 'scaned_but_redirect' && body.redirect_host) pairing.baseUrl = `https://${String(body.redirect_host)}`
    if (state !== 'confirmed') {
      return {
        pairingId,
        platform: pairing.platform,
        state: state === 'scaned' || state === 'scaned_but_redirect' ? 'scanned' : state === 'expired' ? 'expired' : 'waiting',
        expiresAt: pairing.expiresAt,
      }
    }
    const accountId = String(body.ilink_bot_id || '')
    const token = String(body.bot_token || '')
    const baseUrl = String(body.baseurl || pairing.baseUrl || WEIXIN_BASE_URL)
    if (!accountId || !token) throw new Error('Weixin pairing completed without valid credentials.')
    await this.saveChannel({
      id: 'weixin',
      enabled: true,
      values: { WEIXIN_ACCOUNT_ID: accountId, WEIXIN_TOKEN: token, WEIXIN_BASE_URL: baseUrl },
    })
    pairingSessions.delete(pairingId)
    await this.restartGateway()
    return { pairingId, platform: pairing.platform, state: 'connected', expiresAt: pairing.expiresAt }
  }

  cancelPairing(pairingId: string) {
    return { cancelled: pairingSessions.delete(String(pairingId || '').trim()) }
  }

  async createBackup() {
    const outputDir = backupDirectory()
    const output = join(outputDir, `manual-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`)
    return await hermesRuntime.dashboardRequest('/api/ops/backup', {
      method: 'POST',
      body: JSON.stringify({ output }),
    })
  }

  async getMemoryStatus() {
    return await hermesRuntime.dashboardRequest('/api/memory')
  }

  async listBackups() {
    const directory = backupDirectory()
    if (!existsSync(directory)) return []
    const rows = await Promise.all((await readdir(directory))
      .filter((name) => name.toLowerCase().endsWith('.zip'))
      .map(async (name) => {
        const path = join(directory, name)
        const details = await stat(path)
        return { name, path, size: details.size, modifiedAt: details.mtimeMs }
      }))
    return rows.sort((a, b) => b.modifiedAt - a.modifiedAt)
  }

  async getDiagnostics() {
    const [installation, runtime, gateway, channels, skills, backups, memory] = await Promise.all([
      hermesRuntime.getInstallationStatus(),
      Promise.resolve(hermesRuntime.getStatus()),
      this.getGatewayStatus().catch((error) => ({ running: false, state: 'error', error: String((error as Error)?.message || error) })),
      this.listChannels().catch(() => []),
      this.listSkills().catch(() => []),
      this.listBackups().catch(() => []),
      this.getMemoryStatus().catch((error) => ({ error: String((error as Error)?.message || error) })),
    ])
    return {
      installation,
      runtime,
      gateway,
      channels,
      skillCount: skills.length,
      backupCount: backups.length,
      memory,
      profileDir: hermesRuntime.getProfileDirectory(),
      runtimeRoot: hermesRuntime.getRuntimeRoot(),
    }
  }
}

export const hermesManagement = new HermesManagementService()
