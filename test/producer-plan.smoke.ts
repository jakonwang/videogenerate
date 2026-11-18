/**
 * AI 制片人计划校验冒烟测试：模型给出的计划只能用目录里的工具、只能引用真实存在的商品，
 * 不合格时降级为追问，绝不执行编造的东西。
 * 运行：npx tsx test/producer-plan.smoke.ts
 */
import assert from 'node:assert/strict'
import { brandGuidance, buildProducerUserPrompt, parseProducerDecision, PRODUCER_TOOLS, type ProducerContext } from '../src/shared/cloud/producer'

const context: ProducerContext = {
  products: [
    { id: 'prod_a', name: '法式珍珠耳环', type: 'earring', images: 3 },
    { id: 'prod_b', name: '极简戒指', type: 'ring', images: 1 },
  ],
  models: [{ id: 'model_1', name: '欧美女模 A' }],
  hasReferenceVideo: false,
  pendingReview: 2,
}

// a valid plan passes through, with titles kept
let d = parseProducerDecision(
  JSON.stringify({
    action: 'plan',
    response: '好的，开始安排',
    summary: '耳环：商品图 + 视频 + 英文文案',
    steps: [
      { tool: 'product-images', title: '生成商品图', params: { productId: 'prod_a', shots: [0, 1, 3] } },
      { tool: 'image-to-video', title: '做一条视频', params: { productId: 'prod_a', motion: 'rotate' } },
      { tool: 'listing', title: '写文案', params: { productId: 'prod_a', language: 'en-US' } },
    ],
  }),
  context,
)
assert.equal(d.action, 'plan')
if (d.action === 'plan') {
  assert.equal(d.steps.length, 3)
  assert.deepEqual(d.steps.map((s) => s.tool), ['product-images', 'image-to-video', 'listing'])
  assert.equal(d.summary, '耳环：商品图 + 视频 + 英文文案')
}

// fenced JSON is accepted
d = parseProducerDecision('```json\n{"action":"reply","response":"你好"}\n```', context)
assert.deepEqual(d, { action: 'reply', response: '你好' })

// an invented product id is dropped; nothing valid left → clarify instead of running
d = parseProducerDecision(JSON.stringify({ action: 'plan', steps: [{ tool: 'product-images', params: { productId: 'prod_fake' } }] }), context)
assert.equal(d.action, 'clarify')
assert.match(d.response, /商品/)

// unknown tools are ignored, valid ones kept
d = parseProducerDecision(JSON.stringify({ action: 'plan', steps: [{ tool: 'delete-everything', params: {} }, { tool: 'research', params: { keyword: '耳环', count: 50 } }] }), context)
assert.equal(d.action, 'plan')
if (d.action === 'plan') assert.deepEqual(d.steps.map((s) => s.tool), ['research'])

// clone needs a reference video in the conversation
d = parseProducerDecision(JSON.stringify({ action: 'plan', steps: [{ tool: 'clone', params: { productId: 'prod_a' } }] }), context)
assert.equal(d.action, 'clarify')
assert.match(d.response, /对标视频/)
d = parseProducerDecision(JSON.stringify({ action: 'plan', steps: [{ tool: 'clone', params: { productId: 'prod_a' } }] }), { ...context, hasReferenceVideo: true })
assert.equal(d.action, 'plan')

// research needs a keyword
d = parseProducerDecision(JSON.stringify({ action: 'plan', steps: [{ tool: 'research', params: {} }] }), context)
assert.equal(d.action, 'clarify')

// plain text from a model that ignored the JSON rule becomes a reply
d = parseProducerDecision('当然可以！你想用哪个商品？', context)
assert.equal(d.action, 'reply')

// at most 8 steps
d = parseProducerDecision(JSON.stringify({ action: 'plan', steps: Array.from({ length: 12 }, () => ({ tool: 'listing', params: { productId: 'prod_b' } })) }), context)
if (d.action === 'plan') assert.equal(d.steps.length, 8)

// the prompt carries the tool catalog and real product ids, no secrets
const prompt = JSON.parse(buildProducerUserPrompt({ message: '做图', context, history: [] }))
assert.equal(prompt.tools.length, PRODUCER_TOOLS.length)
assert.deepEqual(prompt.context.products.map((p: any) => p.id), ['prod_a', 'prod_b'])

// video tools: only ids from context.videos survive; too few videos → clarify
const withVideos: ProducerContext = { ...context, videos: [{ id: 'gen_v1', label: '旋转', approved: true }, { id: 'gen_v2', label: '推近', approved: false }] }
d = parseProducerDecision(
  JSON.stringify({
    action: 'plan',
    summary: '加字幕再混剪',
    steps: [
      { tool: 'subtitle', title: '加字幕', params: { videoIds: ['gen_v1', 'made_up'] } },
      { tool: 'mix', title: '混剪', params: { videoIds: ['gen_v1', 'gen_v2'], count: 3 } },
      { tool: 'watermark', title: '加水印', params: { videoIds: ['gen_v1'] } },
      { tool: 'model', title: '新模特', params: { name: '越南女模', gender: '女' } },
    ],
  }),
  withVideos,
)
assert.equal(d.action, 'plan')
if (d.action === 'plan') {
  assert.deepEqual(d.steps.map((s) => s.tool), ['subtitle', 'mix', 'model'], 'watermark without text is dropped')
  assert.deepEqual(d.steps[0]!.params.videoIds, ['gen_v1'], 'invented video ids removed')
}
d = parseProducerDecision(JSON.stringify({ action: 'plan', steps: [{ tool: 'mix', params: { videoIds: ['gen_v1'] } }] }), withVideos)
assert.equal(d.action, 'clarify')
assert.match(d.response, /至少需要 2 条视频/)


// 品牌记忆 goes into the prompt only when filled in
{
  assert.equal(brandGuidance(null), '')
  assert.equal(brandGuidance({ brandName: ' ', bannedWords: [] }), '')
  const withBrand = JSON.parse(buildProducerUserPrompt({ message: '写文案', context: { ...context, brand: { brandName: '小饰', bannedWords: ['最便宜', ' '], tone: '轻松' } }, history: [] }))
  assert.match(withBrand.context.brand, /Brand: 小饰/)
  assert.match(withBrand.context.brand, /Never use these words: 最便宜$/m)
  assert.equal(JSON.parse(buildProducerUserPrompt({ message: '写文案', context, history: [] })).context.brand, undefined)
}

console.log('producer plan smoke: ok')
