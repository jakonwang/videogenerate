import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { hermesProfileDirectory, hermesRuntimeRoot } from './installation'

const execFileAsync = promisify(execFile)
const SUPPORTED_PLATFORMS = new Set(['feishu', 'wecom', 'weixin'])
const PAIRING_APPROVE_PATTERN = /^\s*hermes\s+pairing\s+approve\s+([a-z0-9_-]+)\s+([a-z0-9]{6,32})\s*$/i
const PAIRING_LIST_PATTERN = /^\s*hermes\s+pairing\s+list\s*$/i
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g

export const hermesPairingDeps = {
  execFile: execFileAsync,
}

export type HermesPairingCommand =
  | { action: 'list' }
  | { action: 'approve'; platform: string; code: string }

function cleanOutput(value: string) {
  return String(value || '').replace(ANSI_PATTERN, '').trim()
}

export function parseHermesPairingCommand(text: string): HermesPairingCommand | undefined {
  const value = String(text || '')
  if (PAIRING_LIST_PATTERN.test(value)) return { action: 'list' }
  const match = PAIRING_APPROVE_PATTERN.exec(value)
  if (!match) return undefined
  return {
    action: 'approve',
    platform: String(match[1] || '').toLowerCase(),
    code: String(match[2] || '').toUpperCase(),
  }
}

async function runHermesPairing(args: string[]) {
  const root = hermesRuntimeRoot()
  const executable = join(root, 'venv', 'Scripts', 'hermes.exe')
  if (!existsSync(executable)) throw new Error('The Hermes runtime is not installed.')
  try {
    const result = await hermesPairingDeps.execFile(executable, ['pairing', ...args], {
      cwd: root,
      env: {
        ...process.env,
        HERMES_HOME: hermesProfileDirectory(),
        HERMES_NONINTERACTIVE: '1',
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
      },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20_000,
    })
    return cleanOutput(`${result.stdout || ''}\n${result.stderr || ''}`)
  } catch (error) {
    const detail = error as Error & { stdout?: string; stderr?: string }
    const output = cleanOutput(`${detail.stderr || ''}\n${detail.stdout || ''}`)
    throw new Error(output || cleanOutput(detail.message) || 'Hermes pairing command failed.')
  }
}

export async function listHermesPairings() {
  const output = await runHermesPairing(['list'])
  return {
    success: true,
    message: output || 'No pairing records were returned.',
  }
}

export async function approveHermesPairing(input: { platform: string; code: string }) {
  const platform = String(input.platform || '').trim().toLowerCase()
  const code = String(input.code || '').trim().toUpperCase()
  if (!SUPPORTED_PLATFORMS.has(platform)) throw new Error('This messaging platform is not supported for application pairing approval.')
  if (!/^[A-Z0-9]{6,32}$/.test(code)) throw new Error('The pairing code format is invalid.')
  const output = await runHermesPairing(['approve', platform, code])
  return {
    success: true,
    platform,
    message: output || 'Pairing approved.',
  }
}
