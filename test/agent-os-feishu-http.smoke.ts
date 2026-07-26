import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-agent-os-feishu-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { agentOsService } = await import('../src/main/modules/agent-os/service')
  const { hermesDeliveryService } = await import('../src/main/modules/live-photo/hermesDelivery')
  const { handleWebApiRequest } = await import('../src/main/modules/web-platform/webApiRouter')
  const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')

  const deliveryCalls: string[] = []
  hermesDeliveryService.setTestDependencies({
    fetch: (async (input: any) => {
      deliveryCalls.push(String(input || ''))
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as any,
  })

  const server = http.createServer((req, res) => void handleWebApiRequest(req, res))
  try {
    await agentOsService.initialize()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('HTTP test server did not bind')
    const baseUrl = `http://127.0.0.1:${address.port}`

    const post = async (pathname: string, body: Record<string, unknown>) => {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      })
      return { response, payload: await response.json() as any }
    }

    const challenge = await post('/hermes/agent/feishu/official-event', { challenge: 'challenge-1' })
    assert.equal(challenge.response.status, 200)
    assert.equal(challenge.payload.challenge, 'challenge-1')

    const unavailable = await post('/hermes/agent/feishu/official-event', {
      text: 'AI\u5458\u5de5: \u68c0\u67e5\u5546\u54c1',
      userId: 'user-1',
      conversationId: 'chat-1',
    })
    assert.equal(unavailable.response.status, 503)
    assert.equal(unavailable.payload.error, 'hermes_unavailable')
    assert.equal(unavailable.payload.retryable, true)

    const conversation = await agentOsService.createConversation({
      employeeId: 'employee.supervisor',
      channel: 'feishu',
      externalUserId: 'user-1',
      externalConversationId: 'chat-1',
    })
    const run = await agentOsService.createIntentRun({
      conversationId: conversation.id,
      employeeId: 'employee.supervisor',
      intentType: 'Intent.ProductInspect',
      request: 'Inspect product data.',
      context: {},
      requireApproval: false,
    })
    await agentOsService.waitForRun(run.run.id, 10_000)

    const delivered = await post('/hermes/agent/feishu/send-final', {
      runId: run.run.id,
      tenantAccessToken: 'test-token',
      receiveId: 'user-1',
      receiveIdType: 'open_id',
    })
    assert.equal(delivered.response.status, 200)
    assert.equal(delivered.payload.ok, true)
    assert.ok(deliveryCalls.some((url) => url.includes('/im/v1/messages')))
    const deliveryCallCount = deliveryCalls.length
    const duplicate = await post('/hermes/agent/feishu/send-final', {
      runId: run.run.id,
      tenantAccessToken: 'test-token',
      receiveId: 'user-1',
      receiveIdType: 'open_id',
    })
    assert.equal(duplicate.response.status, 200)
    assert.equal(duplicate.payload.alreadySent, true)
    assert.equal(deliveryCalls.length, deliveryCallCount)

    console.log('agent-os-feishu-http.smoke: ok')
  } finally {
    hermesDeliveryService.resetTestDependencies()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    closeCloneSqlite()
    await rm(root, { recursive: true, force: true })
  }
}

void main()
