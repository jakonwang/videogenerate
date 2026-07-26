import { randomBytes } from 'node:crypto'
import http from 'node:http'
import { cloneService } from '../clone/service'
import { resolveApifoxHubCredentials } from '../clone/apifoxProfile'

type ModelBridgeRuntime = {
  url: string
  token: string
  model: string
}

const MAX_OUTPUT_TOKENS = 32_768

let server: http.Server | null = null
let runtime: ModelBridgeRuntime | null = null

function writeJson(res: http.ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readJson(req: http.IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += value.length
    if (size > 4 * 1024 * 1024) throw new Error('Model bridge request is too large.')
    chunks.push(value)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>
}

function writeCompletionStream(res: http.ServerResponse, completion: Record<string, any>, model: string) {
  const id = String(completion.id || `chatcmpl-${Date.now()}`)
  const created = Number(completion.created || Math.floor(Date.now() / 1000))
  const choice = completion.choices?.[0] || {}
  const message = choice.message || {}
  const base = { id, object: 'chat.completion.chunk', created, model: String(completion.model || model) }
  const send = (delta: Record<string, unknown>, finishReason: string | null = null) => {
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`)
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  send({ role: 'assistant' })
  const delta: Record<string, unknown> = {}
  if (message.content !== undefined && message.content !== null) delta.content = message.content
  if (message.reasoning_content) delta.reasoning_content = message.reasoning_content
  if (Array.isArray(message.tool_calls)) delta.tool_calls = message.tool_calls
  if (Object.keys(delta).length) send(delta)
  send({}, String(choice.finish_reason || (message.tool_calls?.length ? 'tool_calls' : 'stop')))
  res.write('data: [DONE]\n\n')
  res.end()
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const active = runtime
  if (!active || req.headers.authorization !== `Bearer ${active.token}`) {
    writeJson(res, 401, { error: { message: 'Unauthorized model bridge request.' } })
    return
  }
  const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
  if (req.method === 'GET' && pathname === '/v1/models') {
    writeJson(res, 200, { object: 'list', data: [{ id: active.model, object: 'model', owned_by: 'videogenerate' }] })
    return
  }
  if (req.method !== 'POST' || pathname !== '/v1/chat/completions') {
    writeJson(res, 404, { error: { message: 'Model bridge route not found.' } })
    return
  }

  try {
    const payload = await readJson(req)
    const credentials = await cloneService.getModelCredentials()
    const hub = resolveApifoxHubCredentials(credentials, 'chat')
    if (!hub?.enabled || !hub.baseUrl || !hub.apiKey) throw new Error('The application chat model is not configured.')
    if (hub.chatEndpointStyle !== 'openai_chat') throw new Error('The application chat model is not OpenAI compatible.')
    const upstreamBody: Record<string, unknown> = { ...payload, model: active.model, stream: false }
    delete upstreamBody.stream_options
    for (const key of ['max_tokens', 'max_completion_tokens']) {
      const value = Number(upstreamBody[key])
      if (Number.isFinite(value) && value > MAX_OUTPUT_TOKENS) upstreamBody[key] = MAX_OUTPUT_TOKENS
    }
    const response = await fetch(`${String(hub.baseUrl).trim().replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hub.apiKey}`,
        'x-api-key': String(hub.apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(180_000),
    })
    const text = await response.text()
    if (!response.ok) {
      res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8' })
      res.end(text)
      return
    }
    const completion = JSON.parse(text) as Record<string, any>
    if (payload.stream === true) writeCompletionStream(res, completion, active.model)
    else writeJson(res, 200, completion)
  } catch (error) {
    writeJson(res, 502, { error: { message: String((error as Error)?.message || error) } })
  }
}

export async function ensureApplicationModelBridge(model: string): Promise<ModelBridgeRuntime> {
  const normalizedModel = String(model || '').trim()
  if (!normalizedModel) throw new Error('The application model name is missing.')
  if (server && runtime) {
    runtime.model = normalizedModel
    return runtime
  }
  const token = randomBytes(32).toString('hex')
  server = http.createServer((req, res) => void handleRequest(req, res))
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('The application model bridge did not start.')
  runtime = { url: `http://127.0.0.1:${address.port}/v1`, token, model: normalizedModel }
  return runtime
}

export async function stopApplicationModelBridge() {
  const active = server
  server = null
  runtime = null
  if (!active) return
  await new Promise<void>((resolve) => active.close(() => resolve()))
}
