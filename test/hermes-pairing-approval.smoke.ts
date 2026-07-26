import assert from 'node:assert/strict'
import {
  approveHermesPairing,
  hermesPairingDeps,
  listHermesPairings,
  parseHermesPairingCommand,
} from '../src/main/modules/hermes/pairing'

async function main() {
  assert.deepEqual(parseHermesPairingCommand('hermes pairing approve feishu JVY3XR7V'), {
    action: 'approve',
    platform: 'feishu',
    code: 'JVY3XR7V',
  })
  assert.deepEqual(parseHermesPairingCommand('hermes pairing list'), { action: 'list' })
  assert.equal(parseHermesPairingCommand('confirm pairing'), undefined)

  const originalExecFile = hermesPairingDeps.execFile
  let capturedArgs: string[] = []
  hermesPairingDeps.execFile = (async (_file: string, args: string[]) => {
    capturedArgs = args
    return { stdout: 'Approved feishu pairing.', stderr: '' }
  }) as typeof originalExecFile
  try {
    const result = await approveHermesPairing({ platform: 'feishu', code: 'JVY3XR7V' })
    assert.equal(result.success, true)
    assert.deepEqual(capturedArgs, ['pairing', 'approve', 'feishu', 'JVY3XR7V'])
    const listed = await listHermesPairings()
    assert.equal(listed.success, true)
    assert.deepEqual(capturedArgs, ['pairing', 'list'])
  } finally {
    hermesPairingDeps.execFile = originalExecFile
  }

  await assert.rejects(
    approveHermesPairing({ platform: 'telegram', code: 'JVY3XR7V' }),
    /not supported/i,
  )
  console.log('hermes-pairing-approval.smoke: ok')
}

void main()
