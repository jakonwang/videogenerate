import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'

type Runner = (args: string[], apiKey: string) => Promise<any>
function defaultPath() {
  if (process.env.CREATOK_CLI_PATH) return process.env.CREATOK_CLI_PATH
  try {
    if (app?.isPackaged) return join(process.resourcesPath, 'creatok', 'creatok.exe')
    return join(app?.getAppPath?.() || process.cwd(), 'tmp', 'creatok-cli', 'win', 'package', 'bin', 'creatok.exe')
  } catch {
    return join(process.cwd(), 'tmp', 'creatok-cli', 'win', 'package', 'bin', 'creatok.exe')
  }
}
export const runCreatokCli: Runner = (args, apiKey) => new Promise((resolve, reject) => {
  const binary = defaultPath()
  if (!existsSync(binary)) return reject(new Error('Creatok CLI is not installed'))
  const child = spawn(binary, args, { env: { ...process.env, CREATOK_API_KEY: apiKey, CREATOK_SKIP_SKILLS_INSTALL: '1', CREATOK_LOG_DIR: join(process.cwd(), 'tmp', 'creatok-cli', 'logs') }, windowsHide: true })
  let stdout = ''; let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += String(chunk) })
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })
  child.on('error', reject)
  child.on('close', (code) => {
    const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    let parsed: any = null
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        const candidate = JSON.parse(lines[index])
        if (candidate && typeof candidate === 'object') { parsed = candidate; break }
      } catch {}
    }
    if (parsed && code === 0 && parsed.ok !== false) {
      // IPC only receives plain JSON data, never CLI process objects or exotic values.
      return resolve(JSON.parse(JSON.stringify(parsed)))
    }
    const error = parsed?.error && typeof parsed.error === 'object' ? parsed.error : {}
    const message = error.message || stderr.trim() || (parsed?.message ? String(parsed.message) : '') || `Creatok request failed (exit ${code ?? 'unknown'})`
    reject(Object.assign(new Error(message), { metadata: error }))
  })
})

export function createCreatokClient(apiKey: string, runner: Runner = runCreatokCli) {
  const call = (args: string[]) => runner(args, apiKey)
  const operation = () => randomUUID()
  return {
    doctor: () => call(['doctor']),
    connections: (capability = 'publish_shoppable_video') => call(['publish', 'connections', ...(capability ? ['--capability', capability] : []), '--operation-id', operation()]),
    capabilities: (connection: string) => call(['publish', 'capabilities', '--connection', connection, '--operation-id', operation()]),
    products: (connection?: string) => call(['publish', 'products', ...(connection ? ['--connection', connection] : []), '--operation-id', operation()]),
    music: (query: string, connection?: string) => call(['publish', 'music', ...(connection ? ['--connection', connection] : []), ...(query.startsWith('https://www.tiktok.com/music/') || query.startsWith('https://tiktok.com/music/') ? ['--url', query] : ['--keyword', query]), '--operation-id', operation()]),
    asset: (file: string) => call(['assets', 'create', '--type', 'video', '--file', file]),
    prepareVideo: (connection: string, assetJson: string, operationId: string) => call(['publish', 'prepare-video', '--connection', connection, '--json', assetJson, '--operation-id', operationId]),
    precheck: (payload: string, operationId: string) => call(['publish', 'submit', '--dry-run', '--json', payload, '--operation-id', operationId]),
    submit: (payload: string, operationId: string) => call(['publish', 'submit', '--json', payload, '--operation-id', operationId]),
    status: (jobId: string, operationId?: string) => call(['publish', 'status', '--job-id', jobId, ...(operationId ? ['--operation-id', operationId] : [])]),
  }
}

export function newOperationKeys() { return { operationId: randomUUID(), idempotencyKey: randomUUID() } }
