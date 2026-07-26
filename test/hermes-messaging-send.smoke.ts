import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogenerate-hermes-messaging-'))
  const profile = path.join(root, 'profile')
  const runtime = path.join(root, 'runtime')
  process.env.VIDEOGENERATE_HERMES_ROOT = runtime
  process.env.VIDEOGENERATE_HERMES_PROFILE_DIR = profile
  await mkdir(path.join(runtime, 'venv', 'Scripts'), { recursive: true })
  await mkdir(path.join(profile, 'pairing'), { recursive: true })
  await writeFile(path.join(runtime, 'venv', 'Scripts', 'hermes.exe'), '', 'utf8')
  await writeFile(path.join(profile, 'pairing', 'feishu-approved.json'), JSON.stringify({ 'ou-test-user': {} }), 'utf8')

  const { hermesMessagingDeps, parseHermesMessagingSend, sendHermesMessage } = await import('../src/main/modules/hermes/messaging')
  assert.deepEqual(parseHermesMessagingSend('\u7ED9\u6211\u7684\u98DE\u4E66\u7528\u6237\u53D1\u9001\u6D88\u606F\uFF1A\u4F60\u597D'), {
    platform: 'feishu',
    message: '\u4F60\u597D',
  })
  assert.deepEqual(parseHermesMessagingSend('hermes send --to feishu "hello"'), {
    platform: 'feishu',
    message: 'hello',
  })
  assert.equal(parseHermesMessagingSend('Why did Feishu not send my message?'), undefined)

  const { parseHermesMessagingAttachmentSend } = await import('../src/main/modules/hermes/messaging')
  assert.deepEqual(parseHermesMessagingAttachmentSend('\u53D1\u9001\u8FD9\u5F20\u56FE\u7247\u7ED9\u6211\u7684\u98DE\u4E66\u673A\u5668\u4EBA'), { platform: 'feishu' })
  assert.deepEqual(parseHermesMessagingAttachmentSend('Send this image to my Feishu bot'), { platform: 'feishu' })
  assert.equal(parseHermesMessagingAttachmentSend('Why did Feishu not send this image?'), undefined)

  const originalExecFile = hermesMessagingDeps.execFile
  let capturedArgs: string[] = []
  hermesMessagingDeps.execFile = (async (_file: string, args: string[]) => {
    capturedArgs = args
    return {
      stdout: JSON.stringify({ success: true, message_id: 'om-test-message' }),
      stderr: '',
    }
  }) as typeof originalExecFile
  try {
    const result = await sendHermesMessage({ platform: 'feishu', message: 'hello' })
    assert.equal(result.success, true)
    assert.equal(result.recipient, 'ou-test-user')
    assert.equal(result.messageId, 'om-test-message')
    assert.deepEqual(capturedArgs, ['send', '--to', 'feishu:ou-test-user', '--json', 'hello'])

    const imagePath = path.join(root, 'test image.png')
    await writeFile(imagePath, 'image-bytes', 'utf8')
    const mediaResult = await sendHermesMessage({ platform: 'feishu', mediaPaths: [imagePath] })
    assert.equal(mediaResult.success, true)
    assert.equal(mediaResult.mediaCount, 1)
    assert.deepEqual(capturedArgs, ['send', '--to', 'feishu:ou-test-user', '--json', `MEDIA:${imagePath}`])
  } finally {
    hermesMessagingDeps.execFile = originalExecFile
    await rm(root, { recursive: true, force: true })
  }
  console.log('hermes-messaging-send.smoke: ok')
}

void main()
