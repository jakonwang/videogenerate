import assert from 'node:assert/strict'
import { parseHermesConfig } from '../src/main/modules/hermes/runtime'
import { isApplicationModelBridgeProviderError } from '../src/main/modules/hermes/service'

assert.deepEqual(parseHermesConfig(''), {})
assert.deepEqual(parseHermesConfig('null\n'), {})
assert.deepEqual(parseHermesConfig('model:\n  default: gpt-5.4\n'), {
  model: { default: 'gpt-5.4' },
})
assert.equal(isApplicationModelBridgeProviderError(new Error("Unknown provider 'custom:videogenerate-bridge'.")), true)
assert.equal(isApplicationModelBridgeProviderError(new Error("Unknown provider 'openrouter'.")), false)

console.log('hermes-empty-config.smoke: ok')
