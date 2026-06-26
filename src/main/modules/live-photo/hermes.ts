import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { productsRepo } from '../products/repo'
import { livePhotoService } from './service'

type HermesLivePhotoSessionStatus =
  | 'awaiting_reference'
  | 'awaiting_product'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'

type HermesLivePhotoSession = {
  id: string
  channel: string
  userId: string
  status: HermesLivePhotoSessionStatus
  referenceImagePaths: string[]
  presentedProducts?: HermesProductOption[]
  selectedProductId?: string
  livePhotoItemIds: string[]
  generatedVideoPath?: string
  error?: string
  createdAt: number
  updatedAt: number
}

type HermesLivePhotoDb = {
  sessions: HermesLivePhotoSession[]
}

type HermesProductOption = {
  id: string
  name: string
  type: string
  coverImagePath?: string
  analysisBoardPath?: string
}

function dbPath() {
  return join(getAppPaths().dbDir, 'live-photo-hermes.json')
}

function now() {
  return Date.now()
}

async function readDb(): Promise<HermesLivePhotoDb> {
  return await readJsonFile<HermesLivePhotoDb>(dbPath(), { sessions: [] })
}

async function writeDb(db: HermesLivePhotoDb) {
  await writeJsonFile(dbPath(), db)
}

async function saveSession(session: HermesLivePhotoSession) {
  const db = await readDb()
  const index = db.sessions.findIndex((item) => item.id === session.id)
  if (index >= 0) db.sessions[index] = session
  else db.sessions.unshift(session)
  await writeDb(db)
  return session
}

async function findLatestSession(channel: string, userId: string) {
  const db = await readDb()
  return (
    db.sessions
      .filter((item) => item.channel === channel && item.userId === userId)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null
  )
}

async function findLatestAwaitingProductSession(channel: string, userId: string) {
  const db = await readDb()
  return (
    db.sessions
      .filter((item) => item.channel === channel && item.userId === userId && item.status === 'awaiting_product')
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null
  )
}

async function getSessionOrThrow(sessionId: string) {
  const db = await readDb()
  const session = db.sessions.find((item) => item.id === sessionId) || null
  if (!session) throw new Error('Hermes Live Photo session does not exist')
  return session
}

function normalizeImagePaths(paths: string[]) {
  return Array.from(new Set((paths || []).map((item) => String(item || '').trim()).filter(Boolean)))
}

async function listProductOptions(limit = 12): Promise<HermesProductOption[]> {
  const products = await productsRepo.list()
  return products.slice(0, limit).map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    coverImagePath: item.coverImagePath,
    analysisBoardPath: item.analysisBoardPath,
  }))
}

export const hermesLivePhotoService = {
  async startReferenceSession(input: { channel: string; userId: string; referenceImagePaths: string[] }) {
    const referenceImagePaths = normalizeImagePaths(input.referenceImagePaths)
    if (!referenceImagePaths.length) throw new Error('referenceImagePaths is required')
    const products = await listProductOptions()
    const ts = now()
    const session: HermesLivePhotoSession = {
      id: randomUUID(),
      channel: String(input.channel || '').trim() || 'unknown',
      userId: String(input.userId || '').trim(),
      status: 'awaiting_product',
      referenceImagePaths,
      presentedProducts: products,
      livePhotoItemIds: [],
      createdAt: ts,
      updatedAt: ts,
    }
    await saveSession(session)
    return {
      session,
      products,
      message:
        products.length > 0
          ? 'Reference image received. Please choose a product.'
          : 'Reference image received, but there are no available products yet.',
    }
  },

  async getLatestSession(input: { channel: string; userId: string }) {
    return await findLatestSession(String(input.channel || '').trim() || 'unknown', String(input.userId || '').trim())
  },

  async getLatestAwaitingProductSession(input: { channel: string; userId: string }) {
    return await findLatestAwaitingProductSession(
      String(input.channel || '').trim() || 'unknown',
      String(input.userId || '').trim(),
    )
  },

  async listProductOptions() {
    return await listProductOptions()
  },

  async resolveProductSelection(input: {
    channel: string
    userId: string
    text?: string
    sessionId?: string
  }): Promise<{ sessionId: string; productId: string } | null> {
    const rawText = String(input.text || '').trim()
    if (!rawText) return null

    if (String(input.sessionId || '').trim()) {
      return {
        sessionId: String(input.sessionId || '').trim(),
        productId: rawText,
      }
    }

    if (!/^\d+$/.test(rawText)) return null
    const session = await findLatestAwaitingProductSession(
      String(input.channel || '').trim() || 'unknown',
      String(input.userId || '').trim(),
    )
    if (!session) return null
    const index = Number(rawText) - 1
    const productId = String(session.presentedProducts?.[index]?.id || '').trim()
    if (!productId) return {
      sessionId: session.id,
      productId: '',
    }
    return {
      sessionId: session.id,
      productId,
    }
  },

  async selectProduct(input: { sessionId: string; productId: string }) {
    const session = await getSessionOrThrow(String(input.sessionId || '').trim())
    if (session.status !== 'awaiting_product') {
      throw new Error(`Current session is not awaiting product selection: ${session.status}`)
    }
    const products = Array.isArray(session.presentedProducts) && session.presentedProducts.length
      ? session.presentedProducts
      : await listProductOptions(500)
    const selected = products.find((item) => item.id === String(input.productId || '').trim())
    if (!selected) throw new Error('Selected product does not exist')

    const created = await livePhotoService.enqueueReferenceItems({
      referenceImagePaths: session.referenceImagePaths,
      productId: selected.id,
      motionTemplate: 'push_in',
    })
    const createdItems = (Array.isArray(created) ? created : [created]).filter(Boolean)
    await livePhotoService.startReferenceItems({
      ids: createdItems.map((item) => item.id),
      motionTemplate: 'push_in',
    })

    const nextSession: HermesLivePhotoSession = {
      ...session,
      selectedProductId: selected.id,
      status: 'processing',
      livePhotoItemIds: createdItems.map((item) => item.id),
      presentedProducts: session.presentedProducts,
      updatedAt: now(),
      error: undefined,
    }
    await saveSession(nextSession)
    return {
      session: nextSession,
      product: selected,
      createdItems,
      message: 'Product selected. Live Photo generation started.',
    }
  },

  async getSessionStatus(sessionId: string) {
    const session = await getSessionOrThrow(String(sessionId || '').trim())
    if (!session.livePhotoItemIds.length) return { session, items: [], completed: false }
    const items = (
      await Promise.all(session.livePhotoItemIds.map((itemId) => livePhotoService.get(itemId)))
    ).filter(Boolean)
    const completedItems = items.filter((item) => item?.packagingStatus === 'completed')
    const failedItem = items.find((item) => item?.packagingStatus === 'failed')
    const generatedVideoPath =
      String(completedItems[0]?.previewVideoPath || '').trim() ||
      String(completedItems[0]?.motionVideoPath || '').trim() ||
      undefined

    let nextStatus = session.status
    let nextError = session.error
    if (failedItem) {
      nextStatus = 'failed'
      nextError = String(failedItem?.error || 'Live Photo generation failed').trim()
    } else if (completedItems.length === session.livePhotoItemIds.length && completedItems.length > 0) {
      nextStatus = 'completed'
    } else if (items.length > 0) {
      nextStatus = 'processing'
    }

    if (
      nextStatus !== session.status ||
      nextError !== session.error ||
      generatedVideoPath !== session.generatedVideoPath
    ) {
      await saveSession({
        ...session,
        status: nextStatus,
        error: nextError,
        generatedVideoPath,
        updatedAt: now(),
      })
      return {
        session: {
          ...session,
          status: nextStatus,
          error: nextError,
          generatedVideoPath,
          updatedAt: now(),
        },
        items,
        completed: nextStatus === 'completed',
      }
    }

    return {
      session,
      items,
      completed: session.status === 'completed',
    }
  },

  async getSessionDelivery(sessionId: string) {
    const result = await this.getSessionStatus(sessionId)
    return {
      session: result.session,
      completed: result.completed,
      generatedVideoPath: result.session.generatedVideoPath,
    }
  },
}
