import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { sanitizeHermesEvent } from '../src/main/modules/hermes/eventSanitizer'
import { hermesEventStore } from '../src/main/modules/hermes/eventStore'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-hermes-events-'))
  configureAppPathRuntime({ dataDir: root })
  try {
    const request = await hermesEventStore.append({
      type: 'approval.request',
      sessionId: 'live-1',
      storedSessionId: 'stored-1',
      payload: { command: 'delete draft', description: 'Approval is required.' },
      createdAt: Date.now(),
    })
    assert.equal(request.sequence, 1)
    assert.equal((await hermesEventStore.listPendingInputs()).length, 1)

    const safeToolEvent = sanitizeHermesEvent({
      sequence: 0,
      type: 'tool.complete',
      sessionId: 'live-1',
      storedSessionId: 'stored-1',
      payload: { apiKey: 'secret-value', output: 'Authorization: Bearer token-value-123456' },
      createdAt: Date.now(),
    })
    const tool = await hermesEventStore.append({
      type: safeToolEvent.type,
      sessionId: safeToolEvent.sessionId,
      storedSessionId: safeToolEvent.storedSessionId,
      payload: safeToolEvent.payload,
      createdAt: safeToolEvent.createdAt,
    })
    assert.equal(tool.sequence, 2)

    const sessionEvents = await hermesEventStore.listSession({ storedSessionId: 'stored-1' })
    assert.deepEqual(sessionEvents.map((event) => event.type), ['approval.request', 'tool.complete'])

    await hermesEventStore.append({
      type: 'input.resolved',
      sessionId: 'live-1',
      storedSessionId: 'stored-1',
      payload: { kind: 'approval', choice: 'once' },
      createdAt: Date.now(),
    })
    assert.equal((await hermesEventStore.listPendingInputs()).length, 0)

    await hermesEventStore.append({
      type: 'clarify.request',
      sessionId: 'live-2',
      storedSessionId: 'stored-2',
      payload: { request_id: 'request-2', question: 'Choose a product.' },
      createdAt: Date.now(),
    })
    assert.equal((await hermesEventStore.listPendingInputs())[0]?.storedSessionId, 'stored-2')
    await hermesEventStore.removeSession('stored-2')
    assert.equal((await hermesEventStore.listSession({ storedSessionId: 'stored-2' })).length, 0)

    await hermesEventStore.append({
      type: 'secret.request',
      sessionId: 'live-expired',
      storedSessionId: 'stored-expired',
      payload: { request_id: 'expired', prompt: 'Expired request' },
      createdAt: Date.now() - 11 * 60 * 1000,
    })
    assert.equal((await hermesEventStore.listPendingInputs()).length, 0)

    const persisted = await readFile(join(root, 'db', 'hermes-events.json'), 'utf8')
    assert.doesNotMatch(persisted, /secret-value|token-value-123456/)
    assert.match(persisted, /\[redacted\]/)
    console.log('hermes-event-store.smoke: ok')
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

void main()
