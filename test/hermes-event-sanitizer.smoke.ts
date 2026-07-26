import assert from 'node:assert/strict'
import { sanitizeHermesEvent } from '../src/main/modules/hermes/eventSanitizer'

const event = sanitizeHermesEvent({
  sequence: 1,
  type: 'tool.complete',
  sessionId: 'session-1',
  createdAt: Date.now(),
  payload: {
    tool_id: 'tool-1',
    name: 'terminal',
    args: {
      command: 'curl -H "Authorization: Bearer token-value-123456" https://example.com?token=query-secret',
      apiKey: 'direct-secret',
      nested: { client_secret: 'nested-secret', normal: 'visible' },
    },
    result: {
      success: true,
      output: 'OPENAI_API_KEY=sk-examplevalue1234567890',
      rows: Array.from({ length: 120 }, (_, index) => index),
    },
  },
})

const serialized = JSON.stringify(event)
for (const secret of ['token-value-123456', 'query-secret', 'direct-secret', 'nested-secret', 'sk-examplevalue1234567890']) {
  assert.doesNotMatch(serialized, new RegExp(secret))
}
assert.match(serialized, /\[redacted\]/)
assert.match(serialized, /\[truncated\] 20 items/)
assert.match(serialized, /visible/)
assert.equal(event.payload.tool_id, 'tool-1')

console.log('hermes-event-sanitizer.smoke: ok')
