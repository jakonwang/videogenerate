import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-hermes-delivery-'))
  const videoPath = path.join(root, 'preview.mp4')
  await writeFile(videoPath, 'mock-video', 'utf-8')

  const { hermesDeliveryService } = await import('../src/main/modules/live-photo/hermesDelivery')

  const calls: Array<{ url: string; method: string; bodyText?: string }> = []

  hermesDeliveryService.setTestDependencies({
    fetch: (async (input: any, init?: any) => {
      const url = String(input || '')
      const method = String(init?.method || 'GET').toUpperCase()
      let bodyText = ''
      if (typeof init?.body === 'string') bodyText = init.body
      calls.push({ url, method, bodyText })

      if (url.includes('/auth/v3/tenant_access_token/internal')) {
        return new Response(JSON.stringify({ tenant_access_token: 'tenant-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/im/v1/files')) {
        return new Response(JSON.stringify({ data: { file_key: 'file-key-1' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/im/v1/messages')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/cgi-bin/gettoken')) {
        return new Response(JSON.stringify({ access_token: 'wecom-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/cgi-bin/media/upload')) {
        return new Response(JSON.stringify({ media_id: 'media-id-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/cgi-bin/message/send')) {
        return new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response('not found', { status: 404 })
    }) as any,
  })

  try {
    const feishuResult = await hermesDeliveryService.sendFinalToFeishu({
      appId: 'app-id',
      appSecret: 'app-secret',
      receiveId: 'ou_xxx',
      receiveIdType: 'open_id',
      actions: [
        { type: 'text', text: 'processing done' },
        { type: 'video', text: 'video ready', videoPath },
      ],
    })
    assert.equal(Array.isArray(feishuResult), true)
    assert.ok(calls.some((item) => item.url.includes('/auth/v3/tenant_access_token/internal')))
    assert.ok(calls.some((item) => item.url.includes('/im/v1/files')))
    assert.ok(calls.filter((item) => item.url.includes('/im/v1/messages')).length >= 2)

    const wecomResult = await hermesDeliveryService.sendFinalToWecom({
      corpId: 'corp-id',
      corpSecret: 'corp-secret',
      agentId: '1000002',
      toUser: 'zhangsan',
      actions: [
        { type: 'text', text: 'processing done' },
        { type: 'video', text: 'video ready', videoPath },
      ],
    })
    assert.equal(Array.isArray(wecomResult), true)
    assert.ok(calls.some((item) => item.url.includes('/cgi-bin/gettoken')))
    assert.ok(calls.some((item) => item.url.includes('/cgi-bin/media/upload')))
    assert.ok(calls.filter((item) => item.url.includes('/cgi-bin/message/send')).length >= 2)

    console.log('live photo hermes delivery smoke test passed')
  } finally {
    hermesDeliveryService.resetTestDependencies()
    await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
