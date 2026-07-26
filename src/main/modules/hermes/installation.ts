import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { HermesInstallationStatus } from './types'

const execFileAsync = promisify(execFile)
const PROFILE_NAME = 'videogenerate'
const INSTALL_STATUS_FILE = 'hermes-install-status.json'
const RUNTIME_MARKER_FILE = '.videogenerate-runtime.json'
const INSTALL_LOCK_FILE = 'hermes-install.lock'

type RuntimeManifest = {
  schemaVersion: number
  version: string
  commit: string
  branch: string
  installScriptUrl: string
  installScriptSha256: string
  minimumInstallerProtocol: number
  requiredFiles: string[]
}

type InstallationListener = (status: HermesInstallationStatus) => void

function localAppData() {
  return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
}

export function hermesRuntimeRoot() {
  return resolve(process.env.VIDEOGENERATE_HERMES_ROOT || join(localAppData(), 'hermes', 'hermes-agent'))
}

export function hermesProfileDirectory() {
  return resolve(process.env.VIDEOGENERATE_HERMES_PROFILE_DIR || join(homedir(), '.hermes', 'profiles', PROFILE_NAME))
}

function resourceRoot() {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const packagedRoot = resourcesPath ? join(resourcesPath, 'hermes') : ''
  if (packagedRoot && existsSync(join(packagedRoot, 'runtime-manifest.json'))) return packagedRoot
  return join(process.cwd(), 'resources', 'hermes')
}

function installStatePath() {
  return join(localAppData(), 'VideoGenerate', INSTALL_STATUS_FILE)
}

export function hermesInstallLockPath() {
  return join(localAppData(), 'VideoGenerate', INSTALL_LOCK_FILE)
}

function runtimeExecutable(root = hermesRuntimeRoot()) {
  return join(root, 'venv', 'Scripts', 'hermes.exe')
}

async function readJson<T>(path: string): Promise<T | undefined> {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')) as T
  } catch {
    return undefined
  }
}

async function readManifest(): Promise<RuntimeManifest> {
  const manifestPath = join(resourceRoot(), 'runtime-manifest.json')
  const manifest = await readJson<RuntimeManifest>(manifestPath)
  if (!manifest || manifest.schemaVersion !== 1 || !/^[a-f0-9]{40}$/i.test(manifest.commit)) {
    throw new Error('The bundled Hermes runtime manifest is invalid.')
  }
  if (!/^https:\/\//i.test(manifest.installScriptUrl) || !/^[a-f0-9]{64}$/i.test(manifest.installScriptSha256)) {
    throw new Error('The bundled Hermes installer identity is invalid.')
  }
  return manifest
}

async function readRepositoryCommit(root: string) {
  const gitDirectory = join(root, '.git')
  const head = await readFile(join(gitDirectory, 'HEAD'), 'utf8').catch(() => '')
  const normalizedHead = head.trim()
  if (/^[a-f0-9]{40}$/i.test(normalizedHead)) return normalizedHead
  const reference = /^ref:\s+(.+)$/.exec(normalizedHead)?.[1]
  if (!reference || reference.includes('..')) return ''
  const looseReference = await readFile(join(gitDirectory, ...reference.split('/')), 'utf8').catch(() => '')
  if (/^[a-f0-9]{40}$/i.test(looseReference.trim())) return looseReference.trim()
  const packedReferences = await readFile(join(gitDirectory, 'packed-refs'), 'utf8').catch(() => '')
  const packed = packedReferences
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/, 2))
    .find((entry) => entry[1] === reference)?.[0] || ''
  return /^[a-f0-9]{40}$/i.test(packed) ? packed : ''
}

async function adoptCompatibleRuntime(root: string, manifest: RuntimeManifest) {
  if (!manifest.requiredFiles.every((relativePath) => existsSync(join(root, relativePath)))) return undefined
  const commit = await readRepositoryCommit(root)
  if (commit.toLowerCase() !== manifest.commit.toLowerCase()) return undefined
  const marker = {
    schemaVersion: 1,
    version: manifest.version,
    commit: manifest.commit,
    adoptedAt: Date.now(),
  }
  await writeFile(join(root, RUNTIME_MARKER_FILE), JSON.stringify(marker), { encoding: 'utf8' })
  return marker
}

class HermesInstallationManager {
  private listeners = new Set<InstallationListener>()
  private operation: Promise<HermesInstallationStatus> | null = null
  private status: HermesInstallationStatus = {
    state: existsSync(runtimeExecutable()) ? 'ready' : 'missing',
    logs: [],
  }

  subscribe(listener: InstallationListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async inspect(): Promise<HermesInstallationStatus> {
    const manifest = await readManifest()
    const root = hermesRuntimeRoot()
    let marker = await readJson<{ version?: string; commit?: string }>(join(root, RUNTIME_MARKER_FILE))
    const handoff = await readJson<{ state?: string; message?: string; version?: string; commit?: string; updatedAt?: number }>(installStatePath())
    const installed = existsSync(runtimeExecutable(root))
    if (installed && !marker?.commit) marker = await adoptCompatibleRuntime(root, manifest)
    const state = this.operation
      ? this.status.state
      : !installed
        ? handoff?.state === 'error' ? 'repair_required' : 'missing'
        : !marker?.commit || marker.commit !== manifest.commit
          ? 'update_available'
          : 'ready'
    this.setStatus({
      state,
      installedVersion: marker?.version || handoff?.version,
      installedCommit: marker?.commit || handoff?.commit,
      targetVersion: manifest.version,
      targetCommit: manifest.commit,
      root,
      profileDir: hermesProfileDirectory(),
      error: state === 'repair_required' ? handoff?.message : undefined,
      updatedAt: handoff?.updatedAt,
    })
    return this.getStatus()
  }

  install() {
    return this.run('installing')
  }

  update() {
    return this.run('updating')
  }

  repair() {
    return this.run('repairing')
  }

  getStatus() {
    return { ...this.status, logs: [...this.status.logs] }
  }

  private async run(state: 'installing' | 'updating' | 'repairing') {
    if (this.operation) return await this.operation
    this.operation = this.runInternal(state).finally(() => {
      this.operation = null
    })
    return await this.operation
  }

  private async runInternal(state: 'installing' | 'updating' | 'repairing') {
    const manifest = await readManifest()
    const bootstrapPath = join(resourceRoot(), 'bootstrap.ps1')
    if (!existsSync(bootstrapPath)) throw new Error('The bundled Hermes bootstrap script is missing.')
    this.setStatus({
      state,
      targetVersion: manifest.version,
      targetCommit: manifest.commit,
      error: undefined,
      logs: [],
    })
    try {
      await this.stopGatewayBeforeRuntimeChange()
      const systemRoot = process.env.SystemRoot || 'C:\\Windows'
      const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const manifestPath = join(resourceRoot(), 'runtime-manifest.json')
      await new Promise<void>((resolveRun, rejectRun) => {
        const child = spawn(powershell, [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-File', bootstrapPath,
          '-ManifestPath', manifestPath,
        ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        const onData = (value: Buffer | string) => this.appendLog(String(value))
        child.stdout.on('data', onData)
        child.stderr.on('data', onData)
        child.once('error', rejectRun)
        child.once('exit', (code) => {
          if (code === 0) resolveRun()
          else rejectRun(new Error(`Hermes bootstrap exited with code ${code ?? 'unknown'}.`))
        })
      })
      const inspected = await this.inspect()
      if (inspected.state !== 'ready') throw new Error(inspected.error || 'Hermes runtime validation failed after installation.')
      return inspected
    } catch (error) {
      const message = String((error as Error)?.message || error)
      this.setStatus({ state: 'repair_required', error: message })
      throw error
    }
  }

  private async stopGatewayBeforeRuntimeChange() {
    if (!existsSync(runtimeExecutable())) return
    try {
      await execFileAsync(runtimeExecutable(), ['gateway', 'stop'], {
        cwd: hermesRuntimeRoot(),
        env: { ...process.env, HERMES_HOME: hermesProfileDirectory() },
        windowsHide: true,
        timeout: 60_000,
      })
      this.appendLog('Stopped the Hermes gateway before changing the runtime.')
    } catch (error) {
      const message = String((error as Error)?.message || error)
      if (!/not running|no gateway|not installed/i.test(message)) this.appendLog(`Gateway stop warning: ${message}`)
    }
  }

  private appendLog(value: string) {
    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length) this.setStatus({ logs: [...this.status.logs, ...lines].slice(-200) })
  }

  private setStatus(patch: Partial<HermesInstallationStatus>) {
    this.status = { ...this.status, ...patch }
    const snapshot = this.getStatus()
    for (const listener of this.listeners) listener(snapshot)
  }
}

export const hermesInstallation = new HermesInstallationManager()
