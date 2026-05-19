import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import http from 'node:http'
import path from 'node:path'

const cwd = process.cwd()
const require = createRequire(import.meta.url)
const tsxPackagePath = require.resolve('tsx/package.json')
const tsxCliPath = path.join(path.dirname(tsxPackagePath), 'dist', 'cli.mjs')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

function httpRequestJson(url, input) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(input)
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let parsed = {}
          try {
            parsed = raw ? JSON.parse(raw) : {}
          } catch {
            reject(new Error(`invalid json response: ${raw}`))
            return
          }
          resolve({
            status: Number(res.statusCode || 0),
            body: parsed,
          })
        })
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function waitForHealth(url, timeoutMs = 25000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const payload = await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          const chunks = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8')
            if (Number(res.statusCode || 0) !== 200) {
              reject(new Error(`unexpected status ${res.statusCode}: ${raw}`))
              return
            }
            resolve(raw ? JSON.parse(raw) : {})
          })
        })
        req.on('error', reject)
      })
      return payload
    } catch {
      await sleep(800)
    }
  }
  throw new Error(`health check timeout: ${url}`)
}

async function withApiServer(envOverrides, port, runner) {
  const uniqueDataDir = path.join(cwd, `.videogenerate-auth-smoke-${port}-${Date.now()}`)
  const env = {
    ...process.env,
    VG_APP_ENV: String(envOverrides.VG_APP_ENV || 'development').trim(),
    VG_ALLOW_MOCK_GENERATION: String(envOverrides.VG_ALLOW_MOCK_GENERATION || 'true').trim(),
    VG_SMS_PROVIDER: String(envOverrides.VG_SMS_PROVIDER || '').trim(),
    VG_DEV_LOGIN_CODE: String(envOverrides.VG_DEV_LOGIN_CODE || '123456').trim(),
    VIDEOGENERATE_WEB_API_HOST: '127.0.0.1',
    VIDEOGENERATE_WEB_API_PORT: String(port),
    VIDEOGENERATE_DATA_DIR: String(envOverrides.VIDEOGENERATE_DATA_DIR || uniqueDataDir).trim(),
  }

  const child = spawn(process.execPath, [tsxCliPath, 'services/api/server.ts'], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  attachLogs(child, `auth-send-code-smoke:${env.VG_APP_ENV}`)

  try {
    await waitForHealth(`http://127.0.0.1:${port}/health`)
    return await runner()
  } finally {
    child.kill()
    await waitForExit(child)
  }
}

async function run() {
  const devResult = await withApiServer(
    {
      VG_APP_ENV: 'development',
      VG_ALLOW_MOCK_GENERATION: 'true',
    },
    19131,
    async () => {
      const first = await httpRequestJson('http://127.0.0.1:19131/auth/send-code', {
        phone: '13800138000',
        channel: 'sms',
      })
      const second = await httpRequestJson('http://127.0.0.1:19131/auth/send-code', {
        phone: '13800138000',
        channel: 'sms',
      })
      return { first, second }
    },
  )

  const stagingResult = await withApiServer(
    {
      VG_APP_ENV: 'staging',
      VG_ALLOW_MOCK_GENERATION: 'false',
      VG_SMS_PROVIDER: 'console',
    },
    19132,
    async () =>
      await httpRequestJson('http://127.0.0.1:19132/auth/send-code', {
        phone: '13900139000',
        channel: 'sms',
      }),
  )

  if (devResult.first.status !== 200 || devResult.first.body.provider !== 'mock') {
    throw new Error(`dev send-code unexpected: ${JSON.stringify(devResult.first)}`)
  }
  if (devResult.second.status === 200) {
    throw new Error(`dev cooldown missing: ${JSON.stringify(devResult.second)}`)
  }
  if (!String(devResult.second.body?.error || '').includes('频繁')) {
    throw new Error(`dev cooldown message unexpected: ${JSON.stringify(devResult.second)}`)
  }
  if (stagingResult.status !== 200 || stagingResult.body.provider !== 'console') {
    throw new Error(`staging send-code unexpected: ${JSON.stringify(stagingResult)}`)
  }
  if (typeof stagingResult.body.devCode !== 'undefined') {
    throw new Error(`staging devCode should be hidden: ${JSON.stringify(stagingResult)}`)
  }
  if (String(stagingResult.body.message || '').includes('开发环境')) {
    throw new Error(`staging message should not look like development: ${JSON.stringify(stagingResult)}`)
  }

  console.log(`[auth-send-code-smoke] DEV FIRST: ${JSON.stringify(devResult.first.body)}`)
  console.log(`[auth-send-code-smoke] DEV COOLDOWN: ${JSON.stringify(devResult.second.body)}`)
  console.log(`[auth-send-code-smoke] STAGING FIRST: ${JSON.stringify(stagingResult.body)}`)
}

run().catch((error) => {
  console.error(`[auth-send-code-smoke] FAIL: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
