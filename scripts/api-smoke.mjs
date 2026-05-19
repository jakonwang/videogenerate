import { spawn } from 'node:child_process'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'

const cwd = process.cwd()
const require = createRequire(import.meta.url)
const tsxPackagePath = require.resolve('tsx/package.json')
const tsxCliPath = path.join(path.dirname(tsxPackagePath), 'dist', 'cli.mjs')
const env = {
  ...process.env,
  VG_APP_ENV: String(process.env.VG_APP_ENV || 'staging').trim(),
  VIDEOGENERATE_WEB_API_HOST: String(process.env.VIDEOGENERATE_WEB_API_HOST || '127.0.0.1').trim(),
  VIDEOGENERATE_WEB_API_PORT: String(process.env.VIDEOGENERATE_WEB_API_PORT || '19080').trim(),
  VIDEOGENERATE_DATA_DIR: String(
    process.env.VIDEOGENERATE_DATA_DIR || path.join(cwd, '.videogenerate-smoke'),
  ).trim(),
}

const host = env.VIDEOGENERATE_WEB_API_HOST
const port = Number(env.VIDEOGENERATE_WEB_API_PORT)
const healthUrl = `http://${host}:${port}/health`

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForHealth(timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const payload = await new Promise((resolve, reject) => {
        const req = http.get(healthUrl, (res) => {
          const chunks = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf8')
              if (res.statusCode !== 200) {
                reject(new Error(`unexpected status ${res.statusCode}: ${raw}`))
                return
              }
              resolve(JSON.parse(raw))
            } catch (error) {
              reject(error)
            }
          })
        })
        req.on('error', reject)
      })
      return payload
    } catch {
      // wait and retry
    }
    await sleep(800)
  }
  throw new Error(`health check timeout: ${healthUrl}`)
}

async function run() {
  const child = spawn(
    process.execPath,
    [tsxCliPath, 'services/api/server.ts'],
    {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[api-smoke][stdout] ${chunk}`)
  })
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[api-smoke][stderr] ${chunk}`)
  })

  try {
    const payload = await waitForHealth()
    console.log(`[api-smoke] SUCCESS: ${JSON.stringify(payload)}`)
    child.kill()
  } catch (error) {
    child.kill()
    throw error
  }
}

run().catch((error) => {
  console.error(`[api-smoke] FAIL: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
