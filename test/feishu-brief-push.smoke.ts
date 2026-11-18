import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { buildBriefCard, normalizeFeishuSettings, pushBriefToFeishu, sendFeishuMessage, signFeishu, validateFeishuWebhook } from '../src/main/modules/content-hub/feishuPush'
import type { Brief } from '../src/main/modules/content-hub/types'

const HOOK = 'https://open.feishu.cn/open-apis/bot/v2/hook/abc-123'

// Only official bot webhook URLs are accepted.
assert.equal(validateFeishuWebhook(HOOK), HOOK)
assert.equal(validateFeishuWebhook(`${HOOK}?x=1#y`), HOOK)
assert.equal(validateFeishuWebhook('https://open.larksuite.com/open-apis/bot/v2/hook/zz'), 'https://open.larksuite.com/open-apis/bot/v2/hook/zz')
assert.equal(validateFeishuWebhook('http://open.feishu.cn/open-apis/bot/v2/hook/abc'), null)
assert.equal(validateFeishuWebhook('https://evil.example.com/open-apis/bot/v2/hook/abc'), null)
assert.equal(validateFeishuWebhook('https://open.feishu.cn.evil.com/open-apis/bot/v2/hook/abc'), null)
assert.equal(validateFeishuWebhook('https://open.feishu.cn/open-apis/other'), null)
assert.equal(validateFeishuWebhook(''), null)

const normalized = normalizeFeishuSettings({ enabled: true, webhookUrl: 'not a url', secret: '  s  ' })
assert.equal(normalized.webhookUrl, '')
assert.equal(normalized.secret, 's')
assert.equal(normalized.daily, true)

// Signature matches Feishu's documented algorithm.
const expected = createHmac('sha256', '1700000000\nsecret').update('').digest('base64')
assert.equal(signFeishu(1700000000, 'secret'), expected)

const brief: Brief = {
  id: 'b1',
  kind: 'daily',
  periodKey: '2026-11-17',
  createdAt: Date.now(),
  headline: '今天有 2 件事需要你处理',
  summary: '先处理失败任务。',
  items: [
    { kind: 'failed_work', level: 'error', title: '2 个任务失败', detail: '复刻 2' },
    { kind: 'review_pending', level: 'warning', title: '3 条内容待你审核', detail: '' },
  ],
}
const card = buildBriefCard(brief) as any
assert.equal(card.msg_type, 'interactive')
assert.equal(card.card.header.template, 'red')
assert.match(JSON.stringify(card), /2 个任务失败/)
assert.match(JSON.stringify(card), /先处理失败任务/)

type Call = { url: string; body: any }
function fakeFetch(reply: { status?: number; json: unknown }, calls: Call[]): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify(reply.json), { status: reply.status ?? 200 })
  }) as unknown as typeof fetch
}

async function main() {
  const calls: Call[] = []
  await sendFeishuMessage({ webhookUrl: HOOK, secret: 'secret' }, { msg_type: 'text', content: { text: 'hi' } }, fakeFetch({ json: { code: 0 } }, calls))
  assert.equal(calls[0].url, HOOK)
  assert.ok(calls[0].body.sign && calls[0].body.timestamp, 'signed payload')
  assert.equal(calls[0].body.sign, signFeishu(Number(calls[0].body.timestamp), 'secret'))

  await assert.rejects(
    sendFeishuMessage({ webhookUrl: HOOK, secret: '' }, { msg_type: 'text' }, fakeFetch({ json: { code: 19021, msg: 'sign match fail' } }, [])),
    /sign match fail/,
  )
  await assert.rejects(sendFeishuMessage({ webhookUrl: 'https://x.com/a', secret: '' }, {}, fakeFetch({ json: {} }, [])), /Webhook/)

  // Respects the enabled / per-kind switches.
  const skipCalls: Call[] = []
  const settings = { enabled: true, webhookUrl: HOOK, secret: '', daily: false, weekly: true }
  assert.deepEqual(await pushBriefToFeishu(settings, brief, fakeFetch({ json: { code: 0 } }, skipCalls)), { skipped: true })
  assert.deepEqual(await pushBriefToFeishu({ ...settings, enabled: false, daily: true }, brief, fakeFetch({ json: { code: 0 } }, skipCalls)), { skipped: true })
  assert.equal(skipCalls.length, 0)
  assert.deepEqual(await pushBriefToFeishu({ ...settings, daily: true }, brief, fakeFetch({ json: { code: 0 } }, skipCalls)), { skipped: false })
  assert.equal(skipCalls.length, 1)

  console.log('feishu-brief-push smoke passed')
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
