import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-hermes-skill-auto-'))
  let server: http.Server | null = null

  async function removeDirWithRetry(target: string, timeoutMs = 5000) {
    const startedAt = Date.now()
    let lastError: unknown
    while (Date.now() - startedAt < timeoutMs) {
      try {
        await rm(target, { recursive: true, force: true })
        return
      } catch (error) {
        lastError = error
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
    const code = String((lastError as { code?: unknown } | null)?.code || '').trim()
    if (code === 'EBUSY' || code === 'ENOTEMPTY') return
    throw lastError
  }

  try {
    const artifactsDir = path.join(root, 'artifacts')
    await mkdir(artifactsDir, { recursive: true })

    const generatedVideoPath = path.join(artifactsDir, 'auto-final.mp4')
    await writeFile(generatedVideoPath, 'mock-video', 'utf-8')

    const fetchLogPath = path.join(root, 'fetch-log.json')
    const mockFetchPath = path.join(root, 'mock-fetch.cjs')
    const configPath = path.join(root, 'config.json')
    const eventProcessingPath = path.join(root, 'event-processing.json')
    const eventAwaitingPath = path.join(root, 'event-awaiting.json')
    const eventClosedPath = path.join(root, 'event-closed.json')
    const eventRetryReadyPath = path.join(root, 'event-retry-ready.json')

    await writeFile(
      mockFetchPath,
      `
const fs = require('node:fs')

const originalFetch = global.fetch
const logPath = process.env.FEISHU_TEST_LOG_PATH
const localBaseUrl = String(process.env.FEISHU_LOCAL_BASE_URL || '').trim()

function appendLog(entry) {
  const payload = fs.existsSync(logPath)
    ? JSON.parse(fs.readFileSync(logPath, 'utf-8'))
    : { calls: [] }
  payload.calls.push(entry)
  fs.writeFileSync(logPath, JSON.stringify(payload, null, 2), 'utf-8')
}

global.fetch = async (input, init) => {
  const url = String(input || '')
  const method = String(init && init.method ? init.method : 'GET').trim().toUpperCase()
  if (localBaseUrl && url.startsWith(localBaseUrl)) {
    return await originalFetch(input, init)
  }
  appendLog({ url, method })
  if (url.includes('/auth/v3/tenant_access_token/internal')) {
    return new Response(JSON.stringify({ tenant_access_token: 'tenant-token' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (url.includes('/im/v1/files')) {
    return new Response(JSON.stringify({ data: { file_key: 'file-key-auto-1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (url.includes('/im/v1/messages')) {
    return new Response(JSON.stringify({ data: { message_id: 'om_auto_1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return await originalFetch(input, init)
}
      `.trim(),
      'utf-8',
    )

    await writeFile(
      configPath,
      JSON.stringify(
        {
          baseUrl: 'http://127.0.0.1:0',
          receiveIdType: 'open_id',
          appId: 'app-id',
          appSecret: 'app-secret',
          downloadDir: path.join(root, 'downloads'),
        },
        null,
        2,
      ),
      'utf-8',
    )

    await writeFile(
      eventProcessingPath,
      JSON.stringify(
        {
          event: {
            sender: {
              sender_id: {
                open_id: 'auto-user-processing',
              },
            },
            message: {
              message_type: 'text',
              content: JSON.stringify({
                text: '1',
              }),
            },
          },
        },
        null,
        2,
      ),
      'utf-8',
    )

    await writeFile(
      eventAwaitingPath,
      JSON.stringify(
        {
          event: {
            sender: {
              sender_id: {
                open_id: 'auto-user-awaiting',
              },
            },
            message: {
              message_type: 'text',
              content: JSON.stringify({
                text: 'materials',
              }),
            },
          },
        },
        null,
        2,
      ),
      'utf-8',
    )

    await writeFile(
      eventClosedPath,
      JSON.stringify(
        {
          event: {
            sender: {
              sender_id: {
                open_id: 'auto-user-closed',
              },
            },
            message: {
              message_type: 'text',
              content: JSON.stringify({
                text: '1',
              }),
            },
          },
        },
        null,
        2,
      ),
      'utf-8',
    )

    await writeFile(
      eventRetryReadyPath,
      JSON.stringify(
        {
          event: {
            sender: {
              sender_id: {
                open_id: 'auto-user-retry-ready',
              },
            },
            message: {
              message_type: 'text',
              content: JSON.stringify({
                text: '1',
              }),
            },
          },
        },
        null,
        2,
      ),
      'utf-8',
    )

    const sessionPollCounts: Record<string, number> = {}
    const sendFinalCalls: Array<{ sessionId: string; userId: string; receiveId: string; receiveIdType: string }> = []
    const sendFinalAttemptCounts: Record<string, number> = {}

    server = http.createServer((req, res) => {
      const host = req.headers.host || '127.0.0.1'
      const url = new URL(req.url || '/', `http://${host}`)
      const pathname = url.pathname

      const sendJson = (status: number, payload: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(payload))
      }

      if (req.method === 'POST' && pathname === '/hermes/live-photo/feishu/webhook') {
        const chunks: Buffer[] = []
        req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        req.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}') as any
          const userId = String(body?.userId || '').trim()
          if (userId === 'auto-user-processing') {
            sendJson(200, {
              ok: true,
              actions: [
                {
                  type: 'text',
                  text: 'started processing',
                  sessionId: 'session-auto-processing',
                },
              ],
            })
            return
          }
          if (userId === 'auto-user-awaiting') {
            sendJson(200, {
              ok: true,
              actions: [
                {
                  type: 'product_options',
                  text: 'pick product',
                  sessionId: 'session-auto-awaiting',
                  options: [{ id: 'p1', label: 'Demo Product' }],
                },
              ],
            })
            return
          }
          if (userId === 'auto-user-closed') {
            sendJson(200, {
              ok: true,
              actions: [
                {
                  type: 'text',
                  text: 'started but later closed',
                  sessionId: 'session-auto-closed',
                },
              ],
            })
            return
          }
          if (userId === 'auto-user-retry-ready') {
            sendJson(200, {
              ok: true,
              actions: [
                {
                  type: 'text',
                  text: 'started and may need retry',
                  sessionId: 'session-auto-retry-ready',
                },
              ],
            })
            return
          }
          sendJson(404, { ok: false, error: 'unexpected user' })
        })
        return
      }

      if (req.method === 'POST' && pathname === '/hermes/live-photo/feishu/send-final') {
        const chunks: Buffer[] = []
        req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        req.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}') as any
          const sessionId = String(body?.sessionId || '').trim()
          sendFinalAttemptCounts[sessionId] = Number(sendFinalAttemptCounts[sessionId] || 0) + 1
          if (sessionId === 'session-auto-retry-ready' && sendFinalAttemptCounts[sessionId] === 1) {
            sendJson(409, {
              ok: false,
              retryable: true,
              error: 'Live Photo final assets are not ready yet',
              session: {
                id: sessionId,
                status: 'completed',
              },
            })
            return
          }
          sendFinalCalls.push({
            sessionId,
            userId: String(body?.userId || '').trim(),
            receiveId: String(body?.receiveId || '').trim(),
            receiveIdType: String(body?.receiveIdType || '').trim(),
          })
          sendJson(200, {
            ok: true,
            session: {
              id: sessionId,
              status: 'completed',
              closeReason: sessionId === 'session-auto-closed' ? 'switch_to_product' : 'final_sent',
            },
            result: [],
            skippedClosed: sessionId === 'session-auto-closed',
          })
        })
        return
      }

      const sessionMatch = /^\/hermes\/live-photo\/session\/([^/]+)$/.exec(pathname)
      if (req.method === 'GET' && sessionMatch) {
        const sessionId = decodeURIComponent(sessionMatch[1] || '')
        sessionPollCounts[sessionId] = Number(sessionPollCounts[sessionId] || 0) + 1
        if (sessionId === 'session-auto-processing') {
          const pollCount = sessionPollCounts[sessionId]
          if (pollCount < 2) {
            sendJson(200, {
              ok: true,
              session: {
                id: sessionId,
                status: 'processing',
                generatedVideoPath: '',
              },
              items: [],
            })
            return
          }
          sendJson(200, {
            ok: true,
            session: {
              id: sessionId,
              status: 'completed',
              generatedVideoPath,
            },
            items: [],
          })
          return
        }
        if (sessionId === 'session-auto-awaiting') {
          sendJson(200, {
            ok: true,
            session: {
              id: sessionId,
              status: 'awaiting_product',
              generatedVideoPath: '',
            },
            items: [],
          })
          return
        }
        if (sessionId === 'session-auto-closed') {
          sendJson(200, {
            ok: true,
            session: {
              id: sessionId,
              status: 'completed',
              generatedVideoPath,
              closeReason: 'switch_to_product',
              closedAt: Date.now(),
            },
            items: [],
          })
          return
        }
        if (sessionId === 'session-auto-retry-ready') {
          sendJson(200, {
            ok: true,
            session: {
              id: sessionId,
              status: 'completed',
              generatedVideoPath,
            },
            items: [],
          })
          return
        }
        sendJson(404, { ok: false, error: 'unexpected session' })
        return
      }

      sendJson(404, { ok: false, error: 'unexpected route' })
    })

    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Failed to bind skill auto smoke server')
    const baseUrl = `http://127.0.0.1:${address.port}`

    await writeFile(
      configPath,
      JSON.stringify(
        {
          baseUrl,
          receiveIdType: 'open_id',
          appId: 'app-id',
          appSecret: 'app-secret',
          downloadDir: path.join(root, 'downloads'),
        },
        null,
        2,
      ),
      'utf-8',
    )

    await writeFile(fetchLogPath, JSON.stringify({ calls: [] }, null, 2), 'utf-8')

    const scriptPath = path.join(process.cwd(), 'automation', 'hermes-skills', 'feishu-live-photo', 'scripts', 'feishu_live_photo.js')

    await execFile(
      process.execPath,
      ['--require', mockFetchPath, scriptPath, 'auto', '--config', configPath, '--event-file', eventProcessingPath, '--poll-interval-ms', '10', '--poll-timeout-ms', '2000'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          FEISHU_TEST_LOG_PATH: fetchLogPath,
          FEISHU_LOCAL_BASE_URL: baseUrl,
        },
      },
    )

    const processingLog = JSON.parse(await readFile(fetchLogPath, 'utf-8')) as { calls: Array<{ url: string; method: string }> }
    assert.equal(processingLog.calls.length, 0)
    assert.equal(sendFinalCalls.length, 1)
    assert.deepEqual(sendFinalCalls[0], {
      sessionId: 'session-auto-processing',
      userId: 'auto-user-processing',
      receiveId: 'auto-user-processing',
      receiveIdType: 'open_id',
    })

    await writeFile(fetchLogPath, JSON.stringify({ calls: [] }, null, 2), 'utf-8')

    await execFile(
      process.execPath,
      ['--require', mockFetchPath, scriptPath, 'auto', '--config', configPath, '--event-file', eventAwaitingPath, '--poll-interval-ms', '10', '--poll-timeout-ms', '2000'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          FEISHU_TEST_LOG_PATH: fetchLogPath,
          FEISHU_LOCAL_BASE_URL: baseUrl,
        },
      },
    )

    const awaitingLog = JSON.parse(await readFile(fetchLogPath, 'utf-8')) as { calls: Array<{ url: string; method: string }> }
    assert.equal(awaitingLog.calls.length, 0)
    assert.equal(sendFinalCalls.length, 1)
    assert.equal(sessionPollCounts['session-auto-awaiting'] >= 1, true)

    await writeFile(fetchLogPath, JSON.stringify({ calls: [] }, null, 2), 'utf-8')

    const closedRun = await execFile(
      process.execPath,
      ['--require', mockFetchPath, scriptPath, 'auto', '--config', configPath, '--event-file', eventClosedPath, '--poll-interval-ms', '10', '--poll-timeout-ms', '2000'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          FEISHU_TEST_LOG_PATH: fetchLogPath,
          FEISHU_LOCAL_BASE_URL: baseUrl,
        },
      },
    )

    const closedLog = JSON.parse(await readFile(fetchLogPath, 'utf-8')) as { calls: Array<{ url: string; method: string }> }
    assert.equal(closedLog.calls.length, 0)
    assert.equal(sendFinalCalls.length, 2)
    assert.deepEqual(sendFinalCalls[1], {
      sessionId: 'session-auto-closed',
      userId: 'auto-user-closed',
      receiveId: 'auto-user-closed',
      receiveIdType: 'open_id',
    })
    assert.match(String(closedRun.stdout || ''), /skippedClosed/i)

    await writeFile(fetchLogPath, JSON.stringify({ calls: [] }, null, 2), 'utf-8')

    await execFile(
      process.execPath,
      ['--require', mockFetchPath, scriptPath, 'auto', '--config', configPath, '--event-file', eventRetryReadyPath, '--poll-interval-ms', '10', '--poll-timeout-ms', '2000'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          FEISHU_TEST_LOG_PATH: fetchLogPath,
          FEISHU_LOCAL_BASE_URL: baseUrl,
        },
      },
    )

    const retryReadyLog = JSON.parse(await readFile(fetchLogPath, 'utf-8')) as { calls: Array<{ url: string; method: string }> }
    assert.equal(retryReadyLog.calls.length, 0)
    assert.equal(sendFinalAttemptCounts['session-auto-retry-ready'], 2)
    assert.equal(sendFinalCalls.length, 3)
    assert.deepEqual(sendFinalCalls[2], {
      sessionId: 'session-auto-retry-ready',
      userId: 'auto-user-retry-ready',
      receiveId: 'auto-user-retry-ready',
      receiveIdType: 'open_id',
    })

    console.log('live photo hermes feishu skill auto smoke test passed')
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    await removeDirWithRetry(root)
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
