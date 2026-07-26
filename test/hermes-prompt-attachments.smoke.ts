import assert from 'node:assert/strict'
import { stageHermesPromptAttachments } from '../src/main/modules/hermes/service'

async function main() {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = []
  const request = async (method: string, params: Record<string, unknown>) => {
    calls.push({ method, params })
    if (method === 'image.attach') {
      return { attached: true, path: params.path }
    }
    if (method === 'file.attach') {
      return { attached: true, ref_text: '@file:.hermes/desktop-attachments/report.txt' }
    }
    if (method === 'image.detach') return { detached: true }
    throw new Error(`Unexpected method: ${method}`)
  }

  const staged = await stageHermesPromptAttachments({
    sessionId: 'session-1',
    text: 'Summarize these attachments.',
    attachments: [
      { path: 'C:\\Temp\\product.png', name: 'product.png', mediaType: 'image' },
      { path: 'C:\\Temp\\report.txt', name: 'report.txt', mediaType: 'file' },
      { path: 'c:\\temp\\PRODUCT.PNG', name: 'duplicate.png', mediaType: 'image' },
    ],
  }, request)

  assert.deepEqual(calls.map((item) => item.method), ['image.attach', 'file.attach'])
  assert.equal(calls[0]?.params.session_id, 'session-1')
  assert.equal(calls[1]?.params.name, 'report.txt')
  assert.deepEqual(staged.attachedImagePaths, ['C:\\Temp\\product.png'])
  assert.equal(staged.text, '@file:.hermes/desktop-attachments/report.txt\n\nSummarize these attachments.')

  calls.length = 0
  const imageOnly = await stageHermesPromptAttachments({
    sessionId: 'session-2',
    text: '',
    attachments: [{ path: 'C:\\Temp\\image.jpg', mediaType: 'image' }],
  }, request)
  assert.equal(imageOnly.text, 'What do you see in the attached image?')
  assert.deepEqual(calls.map((item) => item.method), ['image.attach'])

  calls.length = 0
  const failingRequest = async (method: string, params: Record<string, unknown>) => {
    calls.push({ method, params })
    if (method === 'image.attach') return { attached: true, path: params.path }
    if (method === 'file.attach') throw new Error('File staging failed.')
    if (method === 'image.detach') return { detached: true }
    throw new Error(`Unexpected method: ${method}`)
  }
  await assert.rejects(async () => await stageHermesPromptAttachments({
    sessionId: 'session-3',
    text: 'Inspect these files.',
    attachments: [
      { path: 'C:\\Temp\\image.png', mediaType: 'image' },
      { path: 'C:\\Temp\\missing.txt', mediaType: 'file' },
    ],
  }, failingRequest), /File staging failed/)
  assert.deepEqual(calls.map((item) => item.method), ['image.attach', 'file.attach', 'image.detach'])

  console.log('hermes-prompt-attachments.smoke: ok')
}

void main()
