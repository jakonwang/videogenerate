import {
  SYNC_COLLECTIONS,
  type SyncGeneration,
  type SyncListing,
  type SyncModel,
  type SyncProducerChat,
  type SyncProducerMessage,
  type SyncProducerStepState,
  type SyncProduct,
} from '@shared/cloud/sync'
import { buildProducerSystemPrompt, buildProducerUserPrompt, parseProducerDecision, type ProducerContext } from '@shared/cloud/producer'
import type { TiktokListingCategory, TiktokListingLanguage } from '@shared/tiktokListingPrompts'
import { createProjectFromVideo, uploadVideo } from './clone'
import { categoryForProduct, generateModelImage, generateProductImages, generateVideo, VIDEO_MOTIONS } from './generate'
import { coverOf } from './library'
import { writeListingCopy } from './listing'
import { startLocalTask } from './research'
import { cloud } from './session'
import { getRecord, listRecords, newId, saveRecord } from './sync'
import { runMix, runPerVideo } from './videoTools'

/**
 * AI 制片人：把一句话变成计划，用户确认后逐步调用 App 里已有的功能。
 * 对话（含计划和每一步的进度）存在 producer-chats 集合，多端同步。
 */

export type ProducerChatItem = SyncProducerChat & { id: string }

const msgId = () => newId('msg')

export async function loadChat(id: string): Promise<SyncProducerChat | null> {
  return (await getRecord<SyncProducerChat>(SYNC_COLLECTIONS.producerChats, id))?.data ?? null
}

async function save(id: string, chat: SyncProducerChat) {
  await saveRecord<SyncProducerChat>(SYNC_COLLECTIONS.producerChats, id, chat)
}

export function newChat(): { id: string; chat: SyncProducerChat } {
  return { id: newId('chat'), chat: { title: '新对话', messages: [], createdAt: Date.now() } }
}

async function buildContext(chat: SyncProducerChat): Promise<ProducerContext> {
  const [products, models, generations] = await Promise.all([
    listRecords<SyncProduct>(SYNC_COLLECTIONS.products),
    listRecords<SyncModel>(SYNC_COLLECTIONS.models),
    listRecords<SyncGeneration>(SYNC_COLLECTIONS.generations),
  ])
  return {
    products: products
      .filter((record) => record.data)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((record) => ({ id: record.id, name: record.data!.name, type: record.data!.type, images: record.data!.images.length })),
    models: models.filter((record) => record.data).map((record) => ({ id: record.id, name: record.data!.name })),
    videos: generations
      .filter((record) => record.data?.kind === 'video' && record.data.status === 'succeeded' && record.data.outputFileId && record.data.review !== 'rejected')
      .sort((a, b) => b.data!.createdAt - a.data!.createdAt)
      .slice(0, 30)
      .map((record) => ({ id: record.id, label: record.data!.label, productName: record.data!.productName, approved: record.data!.review === 'approved' })),
    hasReferenceVideo: Boolean(chat.referenceVideoFileId),
    pendingReview: generations.filter((record) => record.data?.status === 'succeeded' && record.data.review === 'pending').length,
  }
}

/** 发一条消息，让 AI 回复 / 追问 / 给出计划 */
export async function send(id: string, chat: SyncProducerChat, text: string): Promise<SyncProducerChat> {
  const userMessage: SyncProducerMessage = { id: msgId(), role: 'user', text, at: Date.now() }
  let next: SyncProducerChat = {
    ...chat,
    title: chat.messages.length ? chat.title : text.slice(0, 24),
    messages: [...chat.messages, userMessage],
  }
  await save(id, next)
  const context = await buildContext(next)
  const history = chat.messages.slice(-8).map((message) => ({ role: message.role, text: message.plan ? `${message.text}（计划：${message.plan.summary}）` : message.text }))
  const reply = await cloud.ai.chat({
    system: buildProducerSystemPrompt(),
    prompt: buildProducerUserPrompt({ message: text, context, history }),
    purpose: 'producer',
  })
  const decision = parseProducerDecision(reply.content, context)
  const assistant: SyncProducerMessage = {
    id: msgId(),
    role: 'assistant',
    text: decision.response,
    at: Date.now(),
    plan:
      decision.action === 'plan'
        ? { summary: decision.summary, state: 'proposed', steps: decision.steps.map((step) => ({ ...step, status: 'pending' })) }
        : undefined,
  }
  next = { ...next, messages: [...next.messages, assistant] }
  await save(id, next)
  return next
}

/** 附上对标视频（复刻用） */
export async function attachReferenceVideo(id: string, chat: SyncProducerChat, file: File): Promise<SyncProducerChat> {
  const uploaded = await uploadVideo(file)
  const next: SyncProducerChat = {
    ...chat,
    referenceVideoFileId: uploaded.fileId,
    messages: [...chat.messages, { id: msgId(), role: 'user', text: `📎 已附上对标视频「${file.name}」`, at: Date.now() }],
  }
  await save(id, next)
  return next
}

/* ------------------------------------------------------------------ 执行计划 */

async function productOf(productId: unknown) {
  const id = String(productId || '')
  const record = await getRecord<SyncProduct>(SYNC_COLLECTIONS.products, id)
  if (!record?.data) throw new Error('商品不存在，可能已被删除')
  const cover = coverOf(record.data)
  if (!cover) throw new Error(`「${record.data.name}」还没有图片`)
  return { id, data: record.data, cover }
}

async function videoFiles(ids: unknown) {
  const files: string[] = []
  for (const id of Array.isArray(ids) ? ids.map(String) : []) {
    const record = await getRecord<SyncGeneration>(SYNC_COLLECTIONS.generations, id)
    if (record?.data?.kind === 'video' && record.data.outputFileId) files.push(record.data.outputFileId)
  }
  if (!files.length) throw new Error('选的视频不存在，可能已被删除')
  return files
}

const LANGUAGES: TiktokListingLanguage[] = ['zh-CN', 'en-US', 'vi-VN']
const CATEGORIES: TiktokListingCategory[] = ['earring', 'ring', 'necklace', 'phone_case', 'bracelet']

async function runStep(chat: SyncProducerChat, step: SyncProducerStepState): Promise<string | undefined> {
  const p = step.params
  switch (step.tool) {
    case 'product-images': {
      const product = await productOf(p.productId)
      const shots = Array.isArray(p.shots) ? p.shots.map(Number).filter((n) => n >= 0 && n <= 4) : [0, 1, 3]
      await generateProductImages({
        productId: product.id,
        productName: product.data.name,
        category: categoryForProduct(String(p.category || product.data.type)),
        sourceFileId: product.cover,
        shots: shots.length ? shots : [0, 1, 3],
      })
      return '/review'
    }
    case 'image-to-video': {
      const product = await productOf(p.productId)
      const motion = VIDEO_MOTIONS.find((item) => item.key === p.motion)?.key ?? 'subtle'
      const durationSec = [5, 6, 8].includes(Number(p.durationSec)) ? Number(p.durationSec) : 6
      await generateVideo({ productId: product.id, productName: product.data.name, sourceFileId: product.cover, motion, durationSec })
      return '/review'
    }
    case 'listing': {
      const product = await productOf(p.productId)
      const language = LANGUAGES.includes(p.language as TiktokListingLanguage) ? (p.language as TiktokListingLanguage) : 'en-US'
      const category = CATEGORIES.includes(p.category as TiktokListingCategory) ? (p.category as TiktokListingCategory) : categoryForProduct(product.data.type) ?? 'earring'
      const copy = await writeListingCopy({ images: product.data.images, coverFileId: product.cover, category, language })
      const listingId = newId('listing')
      await saveRecord<SyncListing>(SYNC_COLLECTIONS.listings, listingId, {
        productId: product.id,
        images: product.data.images,
        category,
        language,
        sku: '',
        price: '',
        title: copy.title,
        description: copy.description,
        generatedAt: Date.now(),
        createdAt: Date.now(),
      })
      return `/listings/${listingId}`
    }
    case 'clone': {
      if (!chat.referenceVideoFileId) throw new Error('请先附上对标视频')
      const product = await productOf(p.productId)
      const locale = LANGUAGES.includes(p.locale as TiktokListingLanguage) ? (p.locale as TiktokListingLanguage) : 'zh-CN'
      const projectId = await createProjectFromVideo({
        videoFileId: chat.referenceVideoFileId,
        name: `复刻 · ${product.data.name}`,
        locale,
        product: { productId: product.id, productName: product.data.name, productImageFileId: product.cover },
      })
      return `/clone/${projectId}`
    }
    case 'research': {
      const count = [20, 50, 100].includes(Number(p.count)) ? Number(p.count) : 50
      await startLocalTask(String(p.keyword).trim(), count)
      return '/research'
    }
    case 'model': {
      const gender = p.gender === '男' ? '男' : '女'
      const ageRange = ['18-24', '25-30', '31-40', '40+'].includes(String(p.ageRange)) ? String(p.ageRange) : ''
      const modelId = newId('model')
      const model: SyncModel = { name: String(p.name || '').trim().slice(0, 40) || `AI 模特（${gender}）`, gender, ageRange, style: String(p.style || '').slice(0, 40), description: '', tags: [], images: [], createdAt: Date.now() }
      await saveRecord<SyncModel>(SYNC_COLLECTIONS.models, modelId, model)
      await generateModelImage({ modelId, model })
      return `/library/models/${modelId}`
    }
    case 'watermark':
    case 'subtitle':
    case 'mix': {
      const files = await videoFiles(p.videoIds)
      if (step.tool === 'watermark') {
        const text = String(p.text || '').trim().slice(0, 40)
        const position = ['tl', 'tr', 'bl', 'br', 'bottom'].includes(String(p.position)) ? (p.position as 'br') : 'br'
        await runPerVideo('watermark', files, { text, position, opacity: 0.8 }, `文字水印：${text}`)
      } else if (step.tool === 'subtitle') {
        const language = ['zh', 'en', 'vi'].includes(String(p.language)) ? String(p.language) : undefined
        await runPerVideo('subtitle', files, { language }, '自动字幕')
      } else {
        if (files.length < 2) throw new Error('混剪至少需要 2 条视频')
        const count = Math.min(10, Math.max(1, Number(p.count) || 3))
        const durationSec = Math.min(60, Math.max(10, Number(p.durationSec) || 15))
        await runMix(files, { count, durationSec, pieceSec: 3 })
      }
      return `/tools/${step.tool}`
    }
    default:
      throw new Error('不支持的步骤')
  }
}

/** 执行计划：逐步运行，任一步失败不影响后面的步骤；每一步的结果都写回对话 */
export async function runPlan(id: string, messageId: string, onUpdate: (chat: SyncProducerChat) => void) {
  let chat = await loadChat(id)
  const update = async (mutate: (message: SyncProducerMessage) => SyncProducerMessage) => {
    chat = { ...chat!, messages: chat!.messages.map((message) => (message.id === messageId ? mutate(message) : message)) }
    await save(id, chat)
    onUpdate(chat)
  }
  const message = chat?.messages.find((item) => item.id === messageId)
  if (!chat || !message?.plan || message.plan.state !== 'proposed') return
  await update((m) => ({ ...m, plan: { ...m.plan!, state: 'running' } }))
  for (let index = 0; index < message.plan.steps.length; index += 1) {
    await update((m) => ({ ...m, plan: { ...m.plan!, steps: m.plan!.steps.map((s, i) => (i === index ? { ...s, status: 'running', error: undefined } : s)) } }))
    let patch: Partial<SyncProducerStepState>
    try {
      const route = await runStep(chat, message.plan.steps[index]!)
      patch = { status: 'done', route }
    } catch (error) {
      patch = { status: 'failed', error: (error as Error).message }
    }
    await update((m) => ({ ...m, plan: { ...m.plan!, steps: m.plan!.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) } }))
  }
  await update((m) => ({ ...m, plan: { ...m.plan!, state: 'done' } }))
}

export async function cancelPlan(id: string, messageId: string) {
  const chat = await loadChat(id)
  if (!chat) return
  await save(id, {
    ...chat,
    messages: chat.messages.map((message) =>
      message.id === messageId && message.plan?.state === 'proposed'
        ? { ...message, plan: { ...message.plan, state: 'cancelled', steps: message.plan.steps.map((step) => ({ ...step, status: 'skipped' as const })) } }
        : message,
    ),
  })
}
