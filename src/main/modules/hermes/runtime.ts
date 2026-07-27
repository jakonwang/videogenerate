import { randomBytes } from 'node:crypto'
import { spawn, execFile, type ChildProcessByStdio } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Readable } from 'node:stream'
import { promisify } from 'node:util'
import { parseDocument } from 'yaml'
import { HermesGatewayClient } from './gatewayClient'
import { hermesInstallation, hermesInstallLockPath, hermesProfileDirectory, hermesRuntimeRoot } from './installation'
import { ensureVideoGenerateMcpServer, stopVideoGenerateMcpServer } from './mcpServer'
import { ensureApplicationModelBridge, stopApplicationModelBridge } from './modelBridge'
import type { HermesRuntimeStatus } from './types'

const execFileAsync = promisify(execFile)
const PROFILE_NAME = 'videogenerate'
const MODEL_BRIDGE_PROVIDER = 'videogenerate-bridge'
const MODEL_BRIDGE_TOKEN_ENV = 'VIDEOGENERATE_MODEL_BRIDGE_TOKEN'
const MINIMUM_VERSION = [0, 17, 0] as const
const READY_PATTERN = /HERMES_DASHBOARD_READY port=(\d+)/
const TOKEN_PATTERN = /window\.__HERMES_SESSION_TOKEN__\s*=\s*("(?:\\.|[^"\\])*")/

type RuntimeListener = (status: HermesRuntimeStatus) => void
type DashboardProcess = ChildProcessByStdio<null, Readable, Readable>
type GatewayProcess = ChildProcessByStdio<null, Readable, Readable>

function hermesChildEnvironment(extra: Record<string, string> = {}) {
  return {
    ...process.env,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    ...extra,
  }
}

function parseVersion(output: string) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(output)
  if (!match) throw new Error(`Unable to parse Hermes version: ${output.trim() || 'empty output'}`)
  return `${match[1]}.${match[2]}.${match[3]}`
}

function isSupportedVersion(version: string) {
  const parts = version.split('.').map((value) => Number(value))
  for (let index = 0; index < MINIMUM_VERSION.length; index += 1) {
    if (parts[index] > MINIMUM_VERSION[index]) return true
    if (parts[index] < MINIMUM_VERSION[index]) return false
  }
  return true
}

export function applicationModelSupportsVision(model: string) {
  const normalized = String(model || '').trim().toLowerCase()
  if (!normalized) return false
  return [
    /(?:^|[/_-])gpt-4o(?:$|[/_.-])/,
    /(?:^|[/_-])gpt-4\.1(?:$|[/_.-])/,
    /(?:^|[/_-])gpt-5(?:$|[/_.-])/,
    /(?:^|[/_-])claude-(?:3|4)(?:$|[/_.-])/,
    /(?:^|[/_-])gemini(?:$|[/_.-])/,
    /(?:qwen|qwq).*(?:vl|vision)/,
    /(?:^|[/_-])(?:llava|pixtral)(?:$|[/_.-])/,
    /(?:kimi|minimax).*(?:vl|vision)/,
  ].some((pattern) => pattern.test(normalized))
}

function publicStatus(status: HermesRuntimeStatus): HermesRuntimeStatus {
  return {
    state: status.state,
    version: status.version,
    profile: status.profile,
    error: status.error,
    logs: [...status.logs],
  }
}

function readEnvValue(source: string, key: string) {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm')
  const match = pattern.exec(source)
  if (!match) return ''
  const value = String(match[1] || '').trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).trim()
  }
  return value
}

function writeEnvValue(source: string, key: string, value: string) {
  const nextLine = `${key}=${JSON.stringify(value)}`
  const lines = source.split(/\r?\n/)
  const index = lines.findIndex((line) => new RegExp(`^\\s*${key}\\s*=`).test(line))
  if (index >= 0) lines[index] = nextLine
  else lines.push(nextLine)
  return `${lines.filter((line, lineIndex) => lineIndex < lines.length - 1 || line).join('\n')}\n`
}

export function parseHermesConfig(source: string): Record<string, unknown> {
  const value = parseDocument(source).toJS()
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

class HermesRuntimeManager {
  readonly gateway = new HermesGatewayClient()
  private process: DashboardProcess | null = null
  private gatewayProcess: GatewayProcess | null = null
  private gatewayEnvironment: Record<string, string> = {}
  private startPromise: Promise<HermesRuntimeStatus> | null = null
  private listeners = new Set<RuntimeListener>()
  private endpoint = ''
  private dashboardBaseUrl = ''
  private dashboardToken = ''
  private status: HermesRuntimeStatus = {
    state: 'stopped',
    profile: PROFILE_NAME,
    logs: [],
  }

  getStatus() {
    const status = publicStatus(this.status)
    if (status.state === 'stopped' && !existsSync(join(hermesRuntimeRoot(), 'venv', 'Scripts', 'hermes.exe'))) {
      status.state = 'missing'
    }
    return status
  }

  getProfileDirectory() {
    return hermesProfileDirectory()
  }

  getRuntimeRoot() {
    return hermesRuntimeRoot()
  }

  async getInstallationStatus() {
    return await hermesInstallation.inspect()
  }

  async install() {
    await this.stop()
    this.update({ state: 'installing', error: undefined })
    await hermesInstallation.install()
    this.assertRuntimeInstalled()
    return await this.start()
  }

  async updateRuntime() {
    await this.stop()
    this.update({ state: 'updating', error: undefined })
    await hermesInstallation.update()
    this.assertRuntimeInstalled()
    return await this.start()
  }

  async repair() {
    await this.stop()
    this.update({ state: 'installing', error: undefined })
    await hermesInstallation.repair()
    this.assertRuntimeInstalled()
    return await this.start()
  }

  private assertRuntimeInstalled() {
    const executable = join(hermesRuntimeRoot(), 'venv', 'Scripts', 'hermes.exe')
    if (!existsSync(executable)) {
      throw new Error(`Hermes installation did not create the expected executable at ${executable}`)
    }
  }

  async dashboardRequest(path: string, init: RequestInit = {}) {
    await this.ensureReady()
    if (!this.dashboardBaseUrl || !this.dashboardToken) throw new Error('Hermes Dashboard management is unavailable.')
    const headers = new Headers(init.headers)
    headers.set('X-Hermes-Session-Token', this.dashboardToken)
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const response = await fetch(`${this.dashboardBaseUrl}${path}`, {
      ...init,
      headers,
      signal: init.signal || AbortSignal.timeout(60_000),
    })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error(String(body.detail || body.message || `Hermes Dashboard returned HTTP ${response.status}.`))
    return body
  }

  async getManagedGatewayStatus() {
    const status = await this.dashboardRequest('/api/status')
    return {
      running: Boolean(status.gateway_running),
      pid: Number(status.gateway_pid || 0) || this.gatewayProcess?.pid || undefined,
      state: String(status.gateway_state || (status.gateway_running ? 'running' : 'stopped')),
    }
  }

  async startManagedGateway() {
    await this.ensureReady()
    const current = await this.getManagedGatewayStatus()
    if (current.running) return current

    const root = hermesRuntimeRoot()
    const executable = join(root, 'venv', 'Scripts', 'hermes.exe')
    const pythonExecutable = join(root, 'venv', 'Scripts', 'python.exe')
    if (!existsSync(executable)) throw new Error(`Hermes executable was not found at ${executable}`)
    if (!existsSync(pythonExecutable)) throw new Error(`Hermes Python runtime was not found at ${pythonExecutable}`)

    await this.stopOtherGatewayProcesses(executable, root)

    const child = spawn(pythonExecutable, ['-m', 'hermes_cli.main', 'gateway', 'run', '--replace'], {
      cwd: root,
      env: hermesChildEnvironment({
        HERMES_HOME: hermesProfileDirectory(),
        HERMES_NONINTERACTIVE: '1',
        ...this.gatewayEnvironment,
      }),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.gatewayProcess = child
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.appendLog(chunk))
    child.stderr.on('data', (chunk: string) => this.appendLog(chunk))
    child.once('exit', (code, signal) => {
      if (this.gatewayProcess !== child) return
      this.gatewayProcess = null
      if (code && code !== 0) this.appendLog(`Hermes Gateway stopped unexpectedly (${signal || code}).`)
    })

    return await this.waitForManagedGatewayState(true, child)
  }

  async stopManagedGateway() {
    await this.ensureReady()
    const root = hermesRuntimeRoot()
    const executable = join(root, 'venv', 'Scripts', 'hermes.exe')
    if (existsSync(executable)) {
      try {
        await execFileAsync(executable, ['gateway', 'stop'], {
          cwd: root,
          env: hermesChildEnvironment({
            HERMES_HOME: hermesProfileDirectory(),
            HERMES_NONINTERACTIVE: '1',
          }),
          windowsHide: true,
          timeout: 20_000,
        })
      } catch (error) {
        const message = String((error as Error)?.message || error)
        if (!/not running|no gateway/i.test(message)) throw error
      }
    }

    const child = this.gatewayProcess
    this.gatewayProcess = null
    if (child && child.exitCode === null) await this.terminateProcessTree(child.pid)
    return await this.waitForManagedGatewayState(false)
  }

  async restartManagedGateway() {
    await this.stopManagedGateway()
    return await this.startManagedGateway()
  }

  async getCustomModelSettings() {
    const profileDir = hermesProfileDirectory()
    const configPath = join(profileDir, 'config.yaml')
    const envPath = join(profileDir, '.env')
    const configSource = existsSync(configPath) ? await readFile(configPath, 'utf8') : ''
    const config = parseHermesConfig(configSource)
    const modelConfig = config.model && typeof config.model === 'object'
      ? config.model as Record<string, unknown>
      : { default: config.model }
    const envSource = existsSync(envPath) ? await readFile(envPath, 'utf8') : ''
    return {
      model: String(modelConfig.default || ''),
      baseUrl: String(modelConfig.base_url || ''),
      apiKeyConfigured: Boolean(readEnvValue(envSource, 'OPENAI_API_KEY')),
    }
  }

  async getApplicationModelBridgeSelection() {
    const configPath = join(hermesProfileDirectory(), 'config.yaml')
    if (!existsSync(configPath)) return undefined
    const config = parseHermesConfig(await readFile(configPath, 'utf8'))
    const modelConfig = config.model && typeof config.model === 'object'
      ? config.model as Record<string, unknown>
      : {}
    if (modelConfig.videogenerate_bridge !== true) return undefined
    const model = String(modelConfig.default || '').trim()
    if (!model) return undefined
    return {
      model,
      provider: `custom:${MODEL_BRIDGE_PROVIDER}`,
      baseUrl: String(modelConfig.base_url || '').trim(),
    }
  }

  async saveCustomModelSettings(input: { model: string; baseUrl: string; apiKey?: string }) {
    const model = String(input.model || '').trim()
    const baseUrl = String(input.baseUrl || '').trim().replace(/\/$/, '')
    const apiKey = String(input.apiKey || '').trim()
    if (!model) throw new Error('A model name is required.')
    let parsedUrl: URL
    try {
      parsedUrl = new URL(baseUrl)
    } catch {
      throw new Error('The model endpoint URL is invalid.')
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('The model endpoint must use HTTP or HTTPS.')
    if (/[\r\n]/.test(apiKey)) throw new Error('The API key contains invalid characters.')

    const profileDir = hermesProfileDirectory()
    await mkdir(profileDir, { recursive: true })
    const configPath = join(profileDir, 'config.yaml')
    const configSource = existsSync(configPath) ? await readFile(configPath, 'utf8') : ''
    const document = parseDocument(configSource)
    document.set('model', { default: model, provider: 'custom', base_url: baseUrl })
    await writeFile(configPath, document.toString(), { encoding: 'utf8' })

    if (apiKey) {
      const envPath = join(profileDir, '.env')
      const envSource = existsSync(envPath) ? await readFile(envPath, 'utf8') : ''
      await writeFile(envPath, writeEnvValue(envSource, 'OPENAI_API_KEY', apiKey), { encoding: 'utf8' })
    }
    return await this.getCustomModelSettings()
  }

  async saveApplicationModelBridge(model: string) {
    const normalizedModel = String(model || '').trim()
    if (!normalizedModel) throw new Error('The application model name is missing.')
    const bridge = await ensureApplicationModelBridge(normalizedModel)
    const profileDir = hermesProfileDirectory()
    await this.writeApplicationModelBridgeProfile(profileDir, bridge)
    return await this.getCustomModelSettings()
  }

  subscribe(listener: RuntimeListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async ensureReady() {
    if (this.status.state === 'ready' && this.gateway.connected) return this.getStatus()
    return await this.start()
  }

  async start() {
    if (this.startPromise) return await this.startPromise
    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null
    })
    return await this.startPromise
  }

  async restart() {
    await this.stop()
    return await this.start()
  }

  async stop() {
    const gatewayChild = this.gatewayProcess
    this.gatewayProcess = null
    if (gatewayChild && gatewayChild.exitCode === null) await this.terminateProcessTree(gatewayChild.pid)
    this.gatewayEnvironment = {}
    const child = this.process
    this.process = null
    this.endpoint = ''
    this.dashboardBaseUrl = ''
    this.dashboardToken = ''
    await this.gateway.close()
    if (child && child.exitCode === null) {
      await new Promise<void>((resolveStop) => {
        const timer = setTimeout(() => {
          resolveStop()
        }, 2_000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolveStop()
        })
        void this.terminateProcessTree(child.pid)
      })
    }
    await stopVideoGenerateMcpServer()
    await stopApplicationModelBridge()
    this.update({ state: 'stopped', error: undefined })
  }

  private async startInternal() {
    await this.stop()
    this.update({ state: 'starting', logs: [] })
    try {
      if (existsSync(hermesInstallLockPath())) {
        throw new Error('Hermes cannot start while an installation operation is running.')
      }
      const root = hermesRuntimeRoot()
      const executable = join(root, 'venv', 'Scripts', 'hermes.exe')
      const pythonExecutable = join(root, 'venv', 'Scripts', 'python.exe')
      if (!existsSync(executable)) throw new Error(`Hermes executable was not found at ${executable}`)
      if (!existsSync(pythonExecutable)) throw new Error(`Hermes Python runtime was not found at ${pythonExecutable}`)

      const versionResult = await execFileAsync(executable, ['--version'], {
        cwd: root,
        env: hermesChildEnvironment(),
        windowsHide: true,
        timeout: 15_000,
      })
      const version = parseVersion(`${versionResult.stdout}\n${versionResult.stderr}`)
      if (!isSupportedVersion(version)) {
        throw new Error(`Hermes ${version} is incompatible. Version 0.17.0 or newer is required.`)
      }
      this.update({ version })

      const hermesHome = join(homedir(), '.hermes')
      const profileDir = hermesProfileDirectory()
      const profileWasMissing = !existsSync(profileDir)
      if (profileWasMissing) {
        await execFileAsync(executable, ['profile', 'create', PROFILE_NAME, '--clone-from', 'default', '--no-alias'], {
          cwd: root,
          env: hermesChildEnvironment(),
          windowsHide: true,
          timeout: 120_000,
        })
        this.appendLog('Created the dedicated Hermes profile.')
      }
      await this.ensureProfileDefaults(hermesHome, profileDir)
      const applicationModelBridge = await this.prepareApplicationModelBridge(profileDir)

      const mcp = await ensureVideoGenerateMcpServer()
      await this.configureMcp(profileDir, mcp.url)
      this.gatewayEnvironment = {
        VIDEOGENERATE_MCP_TOKEN: mcp.token,
        ...(applicationModelBridge ? { [MODEL_BRIDGE_TOKEN_ENV]: applicationModelBridge.token } : {}),
      }

      const dashboardToken = randomBytes(32).toString('hex')
      const child = spawn(pythonExecutable, ['-m', 'hermes_cli.main', 'dashboard', '--no-open', '--host', '127.0.0.1', '--port', '0'], {
        cwd: root,
        env: hermesChildEnvironment({
          HERMES_HOME: profileDir,
          HERMES_DESKTOP: '1',
          TERMINAL_CWD: process.cwd(),
          HERMES_DASHBOARD_SESSION_TOKEN: dashboardToken,
          VIDEOGENERATE_MCP_TOKEN: mcp.token,
          ...(applicationModelBridge ? { [MODEL_BRIDGE_TOKEN_ENV]: applicationModelBridge.token } : {}),
        }),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      this.process = child
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => this.appendLog(chunk))
      child.stderr.on('data', (chunk: string) => this.appendLog(chunk))
      child.once('exit', (code, signal) => {
        if (this.process !== child) return
        this.process = null
        this.endpoint = ''
        void this.gateway.close()
        this.update({
          state: 'error',
          error: `Hermes stopped unexpectedly (${signal || code || 'unknown'}).`,
        })
      })

      const port = await this.waitForDashboardPort(child)
      await this.verifyDashboardToken(port, dashboardToken)
      this.dashboardBaseUrl = `http://127.0.0.1:${port}`
      this.dashboardToken = dashboardToken
      this.endpoint = `ws://127.0.0.1:${port}/api/ws?token=${encodeURIComponent(dashboardToken)}`
      await this.gateway.connect(this.endpoint)
      this.update({ state: 'ready', error: undefined })
      if (await this.shouldAutoStartManagedGateway()) {
        try {
          await this.startManagedGateway()
          this.appendLog('Hermes Gateway started for an enabled messaging channel.')
        } catch (error) {
          this.appendLog(`Hermes Gateway automatic startup failed: ${String((error as Error)?.message || error)}`)
        }
      }
      return this.getStatus()
    } catch (error) {
      const message = String((error as Error)?.message || error)
      this.appendLog(message)
      this.update({ state: 'error', error: message })
      await this.gateway.close()
      await stopVideoGenerateMcpServer()
      throw error
    }
  }

  private async configureMcp(profileDir: string, url: string) {
    await mkdir(profileDir, { recursive: true })
    const configPath = join(profileDir, 'config.yaml')
    let source = existsSync(configPath) ? await readFile(configPath, 'utf8') : ''
    let document = parseDocument(source)
    if (document.get('model') == null) {
      const defaultConfigPath = join(homedir(), '.hermes', 'config.yaml')
      source = existsSync(defaultConfigPath) ? await readFile(defaultConfigPath, 'utf8') : source
      document = parseDocument(source)
    }
    document.setIn(['mcp_servers', 'videogenerate'], {
      url,
      headers: { Authorization: 'Bearer ${VIDEOGENERATE_MCP_TOKEN}' },
      enabled: true,
      timeout: 7200,
    })
    const config = parseHermesConfig(document.toString())
    const servers = config.mcp_servers && typeof config.mcp_servers === 'object'
      ? config.mcp_servers as Record<string, unknown>
      : {}
    for (const [serverId, value] of Object.entries(servers)) {
      if (serverId === 'videogenerate' || !value || typeof value !== 'object') continue
      const server = value as Record<string, unknown>
      const env = server.env && typeof server.env === 'object' ? server.env as Record<string, unknown> : {}
      if (String(env.HERMES_WEB_UI_MANAGED_MCP || '') !== '1') continue
      document.setIn(['mcp_servers', serverId, 'enabled'], false)
    }
    await writeFile(configPath, document.toString(), { encoding: 'utf8' })
  }

  private async prepareApplicationModelBridge(profileDir: string) {
    const configPath = join(profileDir, 'config.yaml')
    if (!existsSync(configPath)) return undefined
    const config = parseHermesConfig(await readFile(configPath, 'utf8'))
    const modelConfig = config.model && typeof config.model === 'object' ? config.model as Record<string, unknown> : {}
    if (modelConfig.videogenerate_bridge !== true) return undefined
    const model = String(modelConfig.default || '').trim()
    const bridge = await ensureApplicationModelBridge(model)
    await this.writeApplicationModelBridgeProfile(profileDir, bridge)
    return bridge
  }

  private async writeApplicationModelBridgeProfile(profileDir: string, bridge: { url: string; token: string; model: string }) {
    await mkdir(profileDir, { recursive: true })
    const configPath = join(profileDir, 'config.yaml')
    const configSource = existsSync(configPath) ? await readFile(configPath, 'utf8') : ''
    const document = parseDocument(configSource)
    const config = parseHermesConfig(configSource)
    const customProviders = Array.isArray(config.custom_providers)
      ? config.custom_providers.filter((entry) => {
          if (!entry || typeof entry !== 'object') return true
          return String((entry as Record<string, unknown>).name || '') !== MODEL_BRIDGE_PROVIDER
        })
      : []
    customProviders.push({
      name: MODEL_BRIDGE_PROVIDER,
      base_url: bridge.url,
      api_key: `\${${MODEL_BRIDGE_TOKEN_ENV}}`,
      api_mode: 'chat_completions',
      model: bridge.model,
    })
    document.set('custom_providers', customProviders)
    document.set('model', {
      default: bridge.model,
      provider: `custom:${MODEL_BRIDGE_PROVIDER}`,
      base_url: bridge.url,
      api_mode: 'chat_completions',
      supports_vision: applicationModelSupportsVision(bridge.model),
      videogenerate_bridge: true,
    })
    await writeFile(configPath, document.toString(), { encoding: 'utf8' })
    const envPath = join(profileDir, '.env')
    const envSource = existsSync(envPath) ? await readFile(envPath, 'utf8') : ''
    await writeFile(envPath, writeEnvValue(envSource, MODEL_BRIDGE_TOKEN_ENV, bridge.token), { encoding: 'utf8' })
  }

  private async ensureProfileDefaults(hermesHome: string, profileDir: string) {
    await mkdir(profileDir, { recursive: true })
    const soulSource = join(hermesHome, 'SOUL.md')
    const soulTarget = join(profileDir, 'SOUL.md')
    if (!existsSync(soulTarget) && existsSync(soulSource)) await copyFile(soulSource, soulTarget)
    const envSource = join(hermesHome, '.env')
    const envTarget = join(profileDir, '.env')
    if (!existsSync(envTarget) && existsSync(envSource)) await copyFile(envSource, envTarget)
    const skillsSource = join(hermesHome, 'skills')
    const skillsTarget = join(profileDir, 'skills')
    if (!existsSync(skillsTarget) && existsSync(skillsSource)) {
      await cp(skillsSource, skillsTarget, { recursive: true, errorOnExist: false })
    }
  }

  private async terminateProcessTree(pid: number | undefined) {
    if (!pid) return
    if (process.platform === 'win32') {
      try {
        await execFileAsync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
          windowsHide: true,
          timeout: 10_000,
        })
      } catch {
        return
      }
      return
    }
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      return
    }
  }

  private async waitForDashboardPort(child: DashboardProcess) {
    return await new Promise<number>((resolvePort, rejectPort) => {
      let buffer = ''
      const timeout = setTimeout(() => {
        cleanup()
        rejectPort(new Error('Hermes Dashboard did not become ready within 60 seconds.'))
      }, 60_000)
      const onData = (chunk: Buffer | string) => {
        buffer = `${buffer}${String(chunk)}`.slice(-16_000)
        const match = READY_PATTERN.exec(buffer)
        if (!match) return
        cleanup()
        resolvePort(Number(match[1]))
      }
      const onExit = (code: number | null) => {
        cleanup()
        rejectPort(new Error(`Hermes Dashboard exited before startup completed (${code ?? 'unknown'}).`))
      }
      const cleanup = () => {
        clearTimeout(timeout)
        child.stdout.off('data', onData)
        child.stderr.off('data', onData)
        child.off('exit', onExit)
      }
      child.stdout.on('data', onData)
      child.stderr.on('data', onData)
      child.once('exit', onExit)
    })
  }

  private async waitForManagedGatewayState(running: boolean, child?: GatewayProcess) {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      if (child && child.exitCode !== null) {
        throw new Error(`Hermes Gateway exited before startup completed (${child.exitCode}).`)
      }
      const status = await this.getManagedGatewayStatus()
      if (status.running === running) {
        if (!running || !child) return status
        await new Promise((resolveWait) => setTimeout(resolveWait, 1_200))
        if (child.exitCode !== null) {
          throw new Error(`Hermes Gateway exited before startup completed (${child.exitCode}).`)
        }
        const stableStatus = await this.getManagedGatewayStatus()
        if (stableStatus.running) return stableStatus
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 300))
    }
    throw new Error(`Hermes Gateway did not ${running ? 'start' : 'stop'} within 30 seconds.`)
  }

  private async stopOtherGatewayProcesses(executable: string, root: string) {
    await this.stopExternalHermesWebUiSupervisor()
    try {
      await execFileAsync(executable, ['gateway', 'stop', '--all'], {
        cwd: root,
        env: hermesChildEnvironment({
          HERMES_HOME: hermesProfileDirectory(),
          HERMES_NONINTERACTIVE: '1',
        }),
        windowsHide: true,
        timeout: 20_000,
      })
    } catch (error) {
      const message = String((error as Error)?.message || error)
      if (!/not running|no gateway/i.test(message)) throw error
    }
  }

  private async stopExternalHermesWebUiSupervisor() {
    if (process.platform !== 'win32') return
    const script = [
      "$targets = Get-CimInstance Win32_Process | Where-Object {",
      "  $_.Name -eq 'node.exe' -and $_.CommandLine -match 'hermes-web-ui.+dist[\\\\/]server[\\\\/]index\\.js'",
      '}',
      '$targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    ].join('\n')
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: hermesChildEnvironment(),
      windowsHide: true,
      timeout: 15_000,
    })
  }

  private async shouldAutoStartManagedGateway() {
    const result = await this.dashboardRequest('/api/messaging/platforms')
    const platforms = Array.isArray(result.platforms) ? result.platforms : []
    return platforms.some((value) => {
      if (!value || typeof value !== 'object') return false
      const platform = value as Record<string, unknown>
      return Boolean(platform.enabled) && Boolean(platform.configured)
    })
  }

  private async verifyDashboardToken(port: number, expectedToken: string) {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`Hermes Dashboard returned HTTP ${response.status}.`)
    const html = await response.text()
    const match = TOKEN_PATTERN.exec(html)
    if (!match) throw new Error('Hermes Dashboard did not expose the expected authentication contract.')
    const actualToken = JSON.parse(match[1]) as string
    if (actualToken !== expectedToken) throw new Error('Hermes Dashboard authentication token did not match the launched process.')
  }

  private appendLog(value: string) {
    const lines = String(value)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    if (!lines.length) return
    this.update({ logs: [...this.status.logs, ...lines].slice(-100) })
  }

  private update(patch: Partial<HermesRuntimeStatus>) {
    this.status = { ...this.status, ...patch }
    const status = this.getStatus()
    for (const listener of this.listeners) listener(status)
  }
}

export const hermesRuntime = new HermesRuntimeManager()
