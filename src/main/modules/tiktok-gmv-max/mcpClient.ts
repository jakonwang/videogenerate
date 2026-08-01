import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { GmvMaxOAuthProvider } from './oauth'
import { gmvMaxAuthStore } from './authStore'
import {
  GMV_MAX_ALL_TOOLS,
  GMV_MAX_CAPABILITY_TOOLS,
  GMV_MAX_SERVER_URL,
  type GmvMaxCapability,
} from './types'

export type GmvMaxClientRuntime = {
  client: Client
  provider: GmvMaxOAuthProvider
  missingTools: string[]
  capabilities: Record<GmvMaxCapability, boolean>
  toolSchemas: Record<string, unknown>
}
type GmvMaxMcpClientOptions = { minIntervalMs?: number; retryDelaysMs?: number[] }

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function parseGmvMaxMcpContent(result: any) {
  if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent
  const text = Array.isArray(result?.content)
    ? result.content.filter((item: any) => item?.type === 'text').map((item: any) => String(item.text || '')).join('\n')
    : ''
  if (!text) return {}
  try { return JSON.parse(text) } catch { return { text } }
}

function gmvMaxMcpErrorMessage(result: any, tool: string) {
  const parsed = parseGmvMaxMcpContent(result) as any
  const detail = parsed?.message
    || parsed?.msg
    || parsed?.error_description
    || parsed?.error?.message
    || parsed?.text
  const code = parsed?.code ?? parsed?.error?.code
  const suffix = [code !== undefined ? `code=${String(code)}` : '', detail ? String(detail) : '']
    .filter(Boolean)
    .join(', ')
    .slice(0, 500)
  return suffix ? `TikTok MCP tool failed: ${tool} (${suffix})` : `TikTok MCP tool failed: ${tool}`
}

function hasGmvMaxBusinessError(result: any) {
  const parsed = parseGmvMaxMcpContent(result) as any
  const code = parsed?.code ?? parsed?.error?.code
  if (code !== undefined && code !== null && String(code).trim() !== '') {
    return String(code).trim() !== '0'
  }
  return Boolean(parsed?.error)
}

async function createRuntime(connectionId: string, interactive: boolean): Promise<GmvMaxClientRuntime> {
  const provider = new GmvMaxOAuthProvider(connectionId, interactive)
  await provider.initialize()
  const client = new Client({ name: 'videogenerate-gmv-max', version: '1.0.0' }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(new URL(GMV_MAX_SERVER_URL), { authProvider: provider })
  try {
    await client.connect(transport)
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) throw error
    if (!interactive) throw new Error('TikTok authorization is required.')
    const callback = await provider.waitForCallback()
    await transport.finishAuth(callback.code)
    await client.close().catch(() => undefined)
    return await createRuntime(connectionId, false)
  }
  const listed = await client.listTools()
  const names = new Set(listed.tools.map((tool) => tool.name))
  const missingTools = GMV_MAX_ALL_TOOLS.filter((name) => !names.has(name))
  const capabilities = Object.fromEntries(Object.entries(GMV_MAX_CAPABILITY_TOOLS).map(([capability, tools]) => [
    capability,
    tools.every((name) => names.has(name)),
  ])) as Record<GmvMaxCapability, boolean>
  const toolSchemas = Object.fromEntries(listed.tools.map((tool) => [tool.name, tool.inputSchema]))
  const secrets = await gmvMaxAuthStore.read(connectionId)
  await gmvMaxAuthStore.write(connectionId, {
    ...secrets,
    discoveryState: { toolSchemas, capabilities, discoveredAt: Date.now() },
  })
  return { client, provider, missingTools, capabilities, toolSchemas }
}

export function createGmvMaxMcpClient(
  runtimeFactory = createRuntime,
  options: GmvMaxMcpClientOptions = {},
) {
  const runtimes = new Map<string, GmvMaxClientRuntime>()
  const queues = new Map<string, Promise<unknown>>()
  const lastCallAt = new Map<string, number>()
  const minIntervalMs = Math.max(0, options.minIntervalMs ?? 750)
  const retryDelaysMs = options.retryDelaysMs ?? [2_000, 5_000, 10_000]

  function enqueue<T>(connectionId: string, task: () => Promise<T>) {
    const previous = queues.get(connectionId) || Promise.resolve()
    const current = previous.catch(() => undefined).then(task)
    queues.set(connectionId, current)
    void current.finally(() => {
      if (queues.get(connectionId) === current) queues.delete(connectionId)
    }).catch(() => undefined)
    return current
  }

  const api = {
    async connect(connectionId: string, interactive = false) {
      const existing = runtimes.get(connectionId)
      if (existing) return existing
      const runtime = await runtimeFactory(connectionId, interactive)
      runtimes.set(connectionId, runtime)
      return runtime
    },

    async call(connectionId: string, tool: string, args: Record<string, unknown>) {
      const callOnce = async () => {
        const elapsed = Date.now() - (lastCallAt.get(connectionId) || 0)
        if (elapsed < minIntervalMs) await wait(minIntervalMs - elapsed)
        lastCallAt.set(connectionId, Date.now())
        const runtime = await api.connect(connectionId, false)
        if (runtime.missingTools.includes(tool)) throw new Error(`TikTok MCP tool is unavailable: ${tool}`)
        const result = await runtime.client.callTool({ name: tool, arguments: args })
        if (result.isError || hasGmvMaxBusinessError(result)) {
          throw new Error(gmvMaxMcpErrorMessage(result, tool))
        }
        return { data: parseGmvMaxMcpContent(result) as Record<string, any>, raw: result }
      }
      return await enqueue(connectionId, async () => {
        for (let attempt = 0; ; attempt += 1) {
          try {
            return await callOnce()
          } catch (error) {
            if (error instanceof UnauthorizedError) {
              await api.disconnect(connectionId)
              return await callOnce()
            }
            const message = error instanceof Error ? error.message : String(error)
            const retryDelay = retryDelaysMs[attempt]
            if (retryDelay === undefined || !/(rate limit|too many requests|\b429\b)/i.test(message)) throw error
            await wait(retryDelay)
          }
        }
      })
    },

    async disconnect(connectionId: string) {
      const runtime = runtimes.get(connectionId)
      runtimes.delete(connectionId)
      lastCallAt.delete(connectionId)
      runtime?.provider.closeCallbackServer()
      await runtime?.client.close().catch(() => undefined)
    },

    async closeAll() {
      const ids = [...runtimes.keys()]
      for (const id of ids) await api.disconnect(id)
    },
  }
  return api
}

export const gmvMaxMcpClient = createGmvMaxMcpClient()
