import { spawn } from 'node:child_process'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'

const cwd = process.cwd()
const webNextCwd = path.join(cwd, 'apps', 'web-next')
const require = createRequire(import.meta.url)
const tsxPackagePath = require.resolve('tsx/package.json')
const tsxCliPath = path.join(path.dirname(tsxPackagePath), 'dist', 'cli.mjs')
const nextBinPath = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next')

const env = {
  ...process.env,
  VG_APP_ENV: String(process.env.VG_APP_ENV || 'staging').trim(),
  VG_ALLOW_MOCK_GENERATION: String(process.env.VG_ALLOW_MOCK_GENERATION || 'false').trim(),
  VIDEOGENERATE_WEB_API_HOST: String(process.env.VIDEOGENERATE_WEB_API_HOST || '127.0.0.1').trim(),
  VIDEOGENERATE_WEB_API_PORT: String(process.env.VIDEOGENERATE_WEB_API_PORT || '19080').trim(),
  VIDEOGENERATE_DATA_DIR: String(
    process.env.VIDEOGENERATE_DATA_DIR || path.join(cwd, '.videogenerate-web-stack-smoke'),
  ).trim(),
  WEB_API_BASE_URL: String(process.env.WEB_API_BASE_URL || 'http://127.0.0.1:19080').trim(),
  NEXT_PUBLIC_WEB_API_BASE_URL: String(
    process.env.NEXT_PUBLIC_WEB_API_BASE_URL || 'http://127.0.0.1:19080',
  ).trim(),
}

const apiHost = env.VIDEOGENERATE_WEB_API_HOST
const apiPort = Number(env.VIDEOGENERATE_WEB_API_PORT)
const webHost = '127.0.0.1'
const webPort = Number(process.env.WEB_STACK_SMOKE_PORT || '19180')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8')
          if (Number(res.statusCode || 0) < 200 || Number(res.statusCode || 0) >= 300) {
            reject(new Error(`unexpected status ${res.statusCode}: ${raw}`))
            return
          }
          resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : {} })
        } catch (error) {
          reject(error)
        }
      })
    })
    req.on('error', reject)
  })
}

function httpGetText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        if (Number(res.statusCode || 0) < 200 || Number(res.statusCode || 0) >= 300) {
          reject(new Error(`unexpected status ${res.statusCode}: ${raw.slice(0, 240)}`))
          return
        }
        resolve({ status: res.statusCode, body: raw })
      })
    })
    req.on('error', reject)
  })
}

async function waitFor(checker, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      return await checker()
    } catch {
      await sleep(1000)
    }
  }
  throw new Error(`${label} timeout`)
}

function attachLogs(child, prefix) {
  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${prefix}][stdout] ${chunk}`)
  })
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${prefix}][stderr] ${chunk}`)
  })
}

function waitForExit(child, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve(undefined)
    }
    child.once('exit', done)
    setTimeout(done, timeoutMs)
  })
}

async function run() {
  const apiChild = spawn(process.execPath, [tsxCliPath, 'services/api/server.ts'], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  attachLogs(apiChild, 'web-stack-smoke:api')

  const webChild = spawn(process.execPath, [nextBinPath, 'start', '--hostname', webHost, '--port', String(webPort)], {
    cwd: webNextCwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  attachLogs(webChild, 'web-stack-smoke:web')

  try {
    const apiHealth = await waitFor(
      () => httpGetJson(`http://${apiHost}:${apiPort}/health`),
      25000,
      'api health check',
    )
    const webHealth = await waitFor(
      () => httpGetJson(`http://${webHost}:${webPort}/api/health`),
      45000,
      'web health check',
    )
    const loginPage = await waitFor(
      () => httpGetText(`http://${webHost}:${webPort}/login`),
      45000,
      'login page check',
    )

    console.log(`[web-stack-smoke] API HEALTH: ${JSON.stringify(apiHealth.body)}`)
    console.log(`[web-stack-smoke] WEB HEALTH: ${JSON.stringify(webHealth.body)}`)
    console.log(`[web-stack-smoke] LOGIN OK: status=${loginPage.status} bodyLength=${loginPage.body.length}`)
    await sleep(1200)
  } finally {
    apiChild.kill()
    webChild.kill()
    await Promise.all([waitForExit(apiChild), waitForExit(webChild)])
  }
}

run().catch((error) => {
  console.error(`[web-stack-smoke] FAIL: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
