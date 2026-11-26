/**
 * AI 对话上游临时忙（429「upstream load is saturated」等）：自动等一会儿重试；还不行就换备用模型；
 * 最后给看得懂的中文提示，而不是一整段 JSON。
 */
import assert from 'node:assert/strict'
import { generateChatCompletion, setChatBusyRetryDelaysForTests } from '../src/main/modules/clone/unifiedChat'

const credentials = { ai666Hub: { enabled: true, baseUrl: 'https://ai.example', apiKey: 'k', chatModel: 'gpt-4.1', chatEndpointStyle: 'openai_compatible' } } as never
const BUSY = JSON.stringify({ error: { message: 'Current group upstream load is saturated, please try again later (request id: x)', type: 'new_api_error' } })
const OK = JSON.stringify({ choices: [{ message: { content: 'Sáng lấp lánh ✨' } }] })

async function main() {
  setChatBusyRetryDelaysForTests([1, 1])
  const calls: string[] = []
  const reply = (status: number, body: string) => new Response(body, { status, headers: { 'Content-Type': 'application/json' } })

  // 忙两次后成功：同一个模型重试，最终拿到结果
  let n = 0
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)).model)
    n += 1
    return n <= 2 ? reply(429, BUSY) : reply(200, OK)
  }) as typeof fetch
  const result = await generateChatCompletion({ credentials, prompt: 'hi' })
  assert.match(result.content, /Sáng lấp lánh/)
  assert.deepEqual(calls, ['gpt-4.1', 'gpt-4.1', 'gpt-4.1'], 'retries the same model while it is busy')
  console.log('✓ busy twice then succeeds on the same model')

  // 一直忙：只重试后台设置的模型（不换成别的模型），最后是中文提示
  calls.length = 0
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)).model)
    return reply(429, BUSY)
  }) as typeof fetch
  await assert.rejects(generateChatCompletion({ credentials, prompt: 'hi' }), (error: Error) => {
    assert.match(error.message, /AI 服务现在太忙（模型 gpt-4\.1，HTTP 429）/)
    assert.match(error.message, /upstream load is saturated/)
    assert.doesNotMatch(error.message, /\{"error"/, 'no raw JSON in the message')
    return true
  })
  assert.deepEqual(calls, ['gpt-4.1', 'gpt-4.1', 'gpt-4.1'], 'only the configured model, 3 tries, no switching to other models')
  console.log('✓ always busy → retries only the configured model, friendly message')

  // 模型通道不存在（原有逻辑）：才换备用模型
  calls.length = 0
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const model = JSON.parse(String(init.body)).model
    calls.push(model)
    return model === 'gpt-4.1' ? reply(503, JSON.stringify({ error: { message: 'no available channel for model gpt-4.1' } })) : reply(200, OK)
  }) as typeof fetch
  await generateChatCompletion({ credentials, prompt: 'hi' })
  assert.deepEqual(calls, ['gpt-4.1', 'gpt-4.1-mini'], 'falls back only when the model has no channel')
  console.log('✓ missing model channel → backup model (unchanged behaviour)')

  // 其它错误（如 401）不重试，直接给出上游的说明
  calls.length = 0
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)).model)
    return reply(401, JSON.stringify({ error: { message: 'invalid api key' } }))
  }) as typeof fetch
  await assert.rejects(generateChatCompletion({ credentials, prompt: 'hi' }), /AI 请求失败（模型 gpt-4\.1，HTTP 401）：invalid api key/)
  assert.equal(calls.length, 1, 'no retry for non-busy errors')
  console.log('✓ non-busy errors are not retried')

  // 后台「脚本分析 / 对话」选了 GRS.AI：对话走 GRS 和后台设的模型，不再去调 AI666
  const grsCredentials = {
    ...(credentials as object),
    chatProviderPrimary: 'grsai',
    grsaiApiKey: 'grs-key',
    grsaiHost: 'https://proxy.example/api/v1/ai-proxy/grsai/',
    grsaiAnalysisModel: 'gpt-5.6-sol',
  } as never
  const grsCalls: Array<{ url: string; model: string; auth: string }> = []
  let grsN = 0
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    grsCalls.push({ url, model: JSON.parse(String(init.body)).model, auth: String((init.headers as Record<string, string>).Authorization) })
    grsN += 1
    return grsN === 1 ? reply(429, BUSY) : reply(200, OK)
  }) as typeof fetch
  const grsResult = await generateChatCompletion({ credentials: grsCredentials, system: 'sys', prompt: 'hi' })
  assert.match(grsResult.content, /Sáng lấp lánh/)
  assert.equal(grsResult.model, 'gpt-5.6-sol')
  assert.deepEqual(grsCalls.map((call) => call.url), ['https://proxy.example/api/v1/ai-proxy/grsai/v1/chat/completions', 'https://proxy.example/api/v1/ai-proxy/grsai/v1/chat/completions'])
  assert.ok(grsCalls.every((call) => call.model === 'gpt-5.6-sol' && call.auth === 'Bearer grs-key'), 'uses the admin model and GRS key, retries while busy')
  console.log('✓ chat follows the admin GRS.AI model')
  console.log('ai chat busy retry smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
