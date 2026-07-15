import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { productImageMaterialsService } from '../product-image-materials/service'
import { productsRepo } from '../products/repo'
import { livePhotoService } from './service'

type HermesLivePhotoSessionStatus =
  | 'awaiting_reference'
  | 'awaiting_product'
  | 'awaiting_material'
  | 'awaiting_delivery_count'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'

type HermesLivePhotoSelectionMode = 'product' | 'material' | 'delivery'

type HermesMaterialOption = {
  id: string
  index: number
  category: string
  thumbnailUrl: string
  materialOrigin?: 'original' | 'derived'
  boundProductId?: string
  localImagePath: string
  derivedFromMaterialId?: string
}

type HermesLivePhotoSession = {
  id: string
  channel: string
  userId: string
  status: HermesLivePhotoSessionStatus
  selectionMode: HermesLivePhotoSelectionMode
  referenceImagePaths: string[]
  presentedProducts?: HermesProductOption[]
  presentedMaterials?: HermesMaterialOption[]
  availableLivePhotoItemIds?: string[]
  availableLivePhotoCount?: number
  requestedLivePhotoCount?: number
  selectedProductId?: string
  selectedMaterialId?: string
  selectedMaterialIds?: string[]
  livePhotoItemIds: string[]
  generatedVideoPath?: string
  error?: string
  closedAt?: number
  closeReason?: string
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

const CATEGORY_NAME_ALIASES: Record<string, string[]> = {
  necklace: ['necklace', 'necklaces', '椤归摼'],
  ring: ['ring', 'rings', '鎴掓寚'],
  earring: ['earring', 'earrings', '鑰崇幆'],
  bracelet: ['bracelet', 'bracelets', '鎵嬮摼'],
}

function extractPositiveIntegers(text: string) {
  const matches = String(text || '').match(/\d+/g) || []
  return Array.from(new Set(matches.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)))
}

function normalizeLookupText(text: string) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-.,，。:：/\\|()[\]{}]+/g, '')
}

function isDeleteIntent(text: string) {
  const normalized = String(text || '').trim().toLowerCase()
  return /\u5220\u9664|\u5220\u6389|\u4e0d\u8981|\u79fb\u9664|\u53bb\u6389|delete|remove|drop/.test(normalized)
}

function isChooseIntent(text: string) {
  const normalized = String(text || '').trim().toLowerCase()
  return /\u9009\u62e9|\u9009\u7528|\u4fdd\u7559|choose|pick|use|keep|select/.test(normalized)
}

function resolveProductIdFromOptions(text: string, products: HermesProductOption[] | undefined) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const options = Array.isArray(products) ? products : []
  const exactIdMatch = options.find((item) => item.id === raw)
  if (exactIdMatch) return exactIdMatch.id

  const normalized = normalizeLookupText(raw)
  if (!normalized) return ''

  const exactNameMatches = options.filter((item) => normalizeLookupText(item.name) === normalized)
  if (exactNameMatches.length === 1) return exactNameMatches[0].id

  const partialNameMatches = options.filter((item) => normalizeLookupText(item.name).includes(normalized))
  if (partialNameMatches.length === 1) return partialNameMatches[0].id

  return ''
}

function resolveDeliveryCount(text: string, totalAvailable: number) {
  const numericSelections = extractPositiveIntegers(text)
  if (numericSelections.length > 0) return numericSelections[0]

  const normalized = String(text || '').trim().toLowerCase()
  if (
    totalAvailable > 0 &&
    /^(all|all please|send all|\u5168\u90e8|\u5168\u90e8\u53d1|\u90fd\u53d1|\u5168\u53d1|\u5168\u8981|\u90fd\u8981)$/.test(normalized)
  ) {
    return totalAvailable
  }

  const parsed = Number(normalized)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
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
      .filter((item) => item.channel === channel && item.userId === userId && !item.closedAt)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null
  )
}

async function findLatestSessionIncludingClosed(channel: string, userId: string) {
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
      .filter((item) => item.channel === channel && item.userId === userId && item.status === 'awaiting_product' && !item.closedAt)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null
  )
}

async function findLatestAwaitingMaterialSession(channel: string, userId: string) {
  const db = await readDb()
  return (
    db.sessions
      .filter((item) => item.channel === channel && item.userId === userId && item.status === 'awaiting_material' && !item.closedAt)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null
  )
}

async function findLatestAwaitingDeliveryCountSession(channel: string, userId: string) {
  const db = await readDb()
  return (
    db.sessions
      .filter((item) => item.channel === channel && item.userId === userId && item.status === 'awaiting_delivery_count' && !item.closedAt)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null
  )
}

async function findLatestPendingSelectionSession(channel: string, userId: string) {
  const db = await readDb()
  return (
    db.sessions
      .filter(
        (item) =>
          item.channel === channel &&
          item.userId === userId &&
          !item.closedAt &&
          (item.status === 'awaiting_product' ||
            item.status === 'awaiting_material' ||
            item.status === 'awaiting_delivery_count'),
      )
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null
  )
}

async function getSessionOrThrow(sessionId: string) {
  const db = await readDb()
  const session = db.sessions.find((item) => item.id === sessionId) || null
  if (!session) throw new Error('Hermes Live Photo session does not exist')
  return session
}

async function closeSessionById(sessionId: string, reason: string) {
  const db = await readDb()
  const index = db.sessions.findIndex((item) => item.id === sessionId)
  if (index < 0) throw new Error('Hermes Live Photo session does not exist')
  const session = db.sessions[index]
  if (session.closedAt) return session
  const ts = now()
  const nextSession: HermesLivePhotoSession = {
    ...session,
    closedAt: ts,
    closeReason: String(reason || '').trim() || 'session_closed',
    updatedAt: ts,
  }
  db.sessions[index] = nextSession
  await writeDb(db)
  const shouldHideGeneratedItems =
    nextSession.closeReason !== 'final_sent' &&
    nextSession.selectionMode !== 'delivery' &&
    Array.isArray(nextSession.livePhotoItemIds) &&
    nextSession.livePhotoItemIds.length > 0
  if (shouldHideGeneratedItems) {
    await Promise.allSettled(
      nextSession.livePhotoItemIds.map(async (itemId) => {
        const normalizedId = String(itemId || '').trim()
        if (!normalizedId) return
        await livePhotoService.markItemUsed({
          id: normalizedId,
          channel: nextSession.channel,
          userId: nextSession.userId,
        })
      }),
    )
  }
  return nextSession
}

function assertSessionOpenForMutation(session: HermesLivePhotoSession) {
  if (session.closedAt) {
    throw new Error('Current session has been closed')
  }
}

async function refreshPresentedMaterials(session: HermesLivePhotoSession) {
  if (session.status !== 'awaiting_material') return session
  const presented = Array.isArray(session.presentedMaterials) ? session.presentedMaterials : []
  if (!presented.length) return session

  const refreshed = (
    await Promise.all(
      presented.map(async (item) => {
        const material = await productImageMaterialsService.getMaterialAny(item.id)
        if (!material || material.usageStatus !== 'unused') return null
        return {
          id: material.id,
          index: item.index,
          category: material.category,
          thumbnailUrl: material.qiniuUrl,
          materialOrigin: material.materialOrigin,
          boundProductId: material.boundProductId,
          localImagePath: material.localImagePath,
          derivedFromMaterialId: material.derivedFromMaterialId,
        } as HermesMaterialOption
      }),
    )
  ).filter(Boolean) as HermesMaterialOption[]

  const normalized = refreshed.map((item, index) => ({
    ...item,
    index: index + 1,
  }))

  const changed =
    normalized.length !== presented.length ||
    normalized.some((item, index) => {
      const prev = presented[index]
      return (
        !prev ||
        prev.id !== item.id ||
        prev.index !== item.index ||
        prev.thumbnailUrl !== item.thumbnailUrl ||
        prev.materialOrigin !== item.materialOrigin ||
        prev.boundProductId !== item.boundProductId ||
        prev.localImagePath !== item.localImagePath ||
        prev.derivedFromMaterialId !== item.derivedFromMaterialId ||
        prev.category !== item.category
      )
    })

  if (!changed) return session

  const nextSession: HermesLivePhotoSession = {
    ...session,
    presentedMaterials: normalized,
    updatedAt: now(),
  }
  await saveSession(nextSession)
  return nextSession
}

function normalizeImagePaths(paths: string[]) {
  return Array.from(new Set((paths || []).map((item) => String(item || '').trim()).filter(Boolean)))
}

function looksLikeCategoryPlaceholder(input: { name?: string; type?: string }) {
  const type = String(input.type || '').trim().toLowerCase()
  const name = String(input.name || '').trim().toLowerCase()
  if (!name) return true
  const aliases = CATEGORY_NAME_ALIASES[type] || []
  return aliases.includes(name)
}

async function listProductOptions(
  limit = 12,
  selectionMode: HermesLivePhotoSelectionMode = 'product',
): Promise<HermesProductOption[]> {
  const products = (await productsRepo.list()).filter((item) => !looksLikeCategoryPlaceholder(item))
  const base = products.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    coverImagePath: item.coverImagePath,
    analysisBoardPath: item.analysisBoardPath,
  }))

  if (selectionMode === 'material') {
    const withMaterials = await Promise.all(
      base.map(async (item) => {
        try {
          const result = await productImageMaterialsService.listHermesMaterialOptionsForProduct({
            productId: item.id,
            limit: 1,
          })
          return result.options.length > 0 ? item : null
        } catch {
          return null
        }
      }),
    )
    return withMaterials.filter(Boolean).slice(0, limit) as HermesProductOption[]
  }

  if (selectionMode === 'delivery') {
    const withDeliveries = await Promise.all(
      base.map(async (item) => {
        try {
          const reusable = await livePhotoService.listReusableCompletedItemsByProduct({
            productId: item.id,
            limit: 1,
          })
          return reusable.length > 0 ? item : null
        } catch {
          return null
        }
      }),
    )
    return withDeliveries.filter(Boolean).slice(0, limit) as HermesProductOption[]
  }

  return base.slice(0, limit)
}

export const hermesLivePhotoService = {
  async closeSessionsForChat(input: {
    channel: string
    userId: string
    includeProcessing?: boolean
    includeFinished?: boolean
    reason?: string
  }) {
    const channel = String(input.channel || '').trim() || 'unknown'
    const userId = String(input.userId || '').trim()
    const includeProcessing = Boolean(input.includeProcessing)
    const includeFinished = Boolean(input.includeFinished)
    const reason = String(input.reason || '').trim() || 'chat_reset'
    const db = await readDb()
    const ts = now()
    let changed = false
    const hiddenItemIds: string[] = []
    db.sessions = db.sessions.map((item) => {
      if (item.channel !== channel || item.userId !== userId || item.closedAt) return item
      const shouldClose =
        item.status === 'awaiting_product' ||
        item.status === 'awaiting_material' ||
        item.status === 'awaiting_delivery_count' ||
        (includeProcessing && item.status === 'processing') ||
        (includeFinished && (item.status === 'completed' || item.status === 'failed'))
      if (!shouldClose) return item
      changed = true
      if (
        reason !== 'final_sent' &&
        item.selectionMode !== 'delivery' &&
        Array.isArray(item.livePhotoItemIds) &&
        item.livePhotoItemIds.length > 0
      ) {
        for (const itemId of item.livePhotoItemIds) {
          const normalizedId = String(itemId || '').trim()
          if (normalizedId) hiddenItemIds.push(normalizedId)
        }
      }
      return {
        ...item,
        closedAt: ts,
        closeReason: reason,
        updatedAt: ts,
      }
    })
    if (changed) await writeDb(db)
    if (hiddenItemIds.length > 0) {
      await Promise.allSettled(
        hiddenItemIds.map(async (itemId) => {
          await livePhotoService.markItemUsed({
            id: itemId,
            channel,
            userId,
          })
        }),
      )
    }
    return { closedAt: ts }
  },

  async startReferenceSession(input: {
    channel: string
    userId: string
    referenceImagePaths?: string[]
    selectionMode?: HermesLivePhotoSelectionMode
  }) {
    const selectionMode: HermesLivePhotoSelectionMode =
      input.selectionMode === 'material' ? 'material' : input.selectionMode === 'delivery' ? 'delivery' : 'product'
    const referenceImagePaths = normalizeImagePaths(Array.isArray(input.referenceImagePaths) ? input.referenceImagePaths : [])
    if (!referenceImagePaths.length && selectionMode === 'product') throw new Error('referenceImagePaths is required')
    if (selectionMode === 'product' && referenceImagePaths.length) {
      const existingAwaitingProduct = await findLatestAwaitingProductSession(
        String(input.channel || '').trim() || 'unknown',
        String(input.userId || '').trim(),
      )
      if (existingAwaitingProduct && !existingAwaitingProduct.closedAt) {
        const mergedReferenceImagePaths = normalizeImagePaths([
          ...(Array.isArray(existingAwaitingProduct.referenceImagePaths) ? existingAwaitingProduct.referenceImagePaths : []),
          ...referenceImagePaths,
        ])
        const nextSession: HermesLivePhotoSession = {
          ...existingAwaitingProduct,
          referenceImagePaths: mergedReferenceImagePaths,
          updatedAt: now(),
        }
        await saveSession(nextSession)
        const nextProducts = Array.isArray(nextSession.presentedProducts) ? nextSession.presentedProducts : []
        return {
          session: nextSession,
          products: nextProducts,
          message:
            nextProducts.length > 0
              ? '已继续收到参考图片，请选择商品编号。'
              : '已继续收到参考图片，但当前暂无可选商品。',
        }
      }
    }
    await this.closeSessionsForChat({
      channel: input.channel,
      userId: input.userId,
      includeProcessing: true,
      includeFinished: true,
      reason: `switch_to_${selectionMode}`,
    })
    const products = await listProductOptions(12, selectionMode)
    const ts = now()
    const session: HermesLivePhotoSession = {
      id: randomUUID(),
      channel: String(input.channel || '').trim() || 'unknown',
      userId: String(input.userId || '').trim(),
      status: 'awaiting_product',
      selectionMode,
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
          ? '\u5df2\u6536\u5230\u53c2\u8003\u56fe\u7247\uff0c\u8bf7\u9009\u62e9\u5546\u54c1\u7f16\u53f7\u3002'
          : '\u5df2\u6536\u5230\u53c2\u8003\u56fe\u7247\uff0c\u4f46\u5f53\u524d\u6682\u65e0\u53ef\u9009\u5546\u54c1\u3002',
    }
  },

  async getLatestSession(input: { channel: string; userId: string }) {
    return await findLatestSession(String(input.channel || '').trim() || 'unknown', String(input.userId || '').trim())
  },

  async getLatestSessionIncludingClosed(input: { channel: string; userId: string }) {
    return await findLatestSessionIncludingClosed(
      String(input.channel || '').trim() || 'unknown',
      String(input.userId || '').trim(),
    )
  },

  async getLatestSessionStatus(input: { channel: string; userId: string }) {
    const session = await findLatestSession(String(input.channel || '').trim() || 'unknown', String(input.userId || '').trim())
    if (!session) return null
    return await this.getSessionStatus(session.id)
  },

  async getLatestAwaitingProductSession(input: { channel: string; userId: string }) {
    return await findLatestAwaitingProductSession(
      String(input.channel || '').trim() || 'unknown',
      String(input.userId || '').trim(),
    )
  },

  async getLatestAwaitingMaterialSession(input: { channel: string; userId: string }) {
    const session = await findLatestAwaitingMaterialSession(
      String(input.channel || '').trim() || 'unknown',
      String(input.userId || '').trim(),
    )
    if (!session) return null
    return await refreshPresentedMaterials(session)
  },

  async listProductOptions() {
    return await listProductOptions()
  },

  async resolveSelection(input: {
    channel: string
    userId: string
    text?: string
    sessionId?: string
  }): Promise<
    | { sessionId: string; selectionType: 'product'; productId: string }
    | { sessionId: string; selectionType: 'material'; materialId: string }
    | { sessionId: string; selectionType: 'material_batch'; materialIds: string[] }
    | { sessionId: string; selectionType: 'delivery_count'; count: number }
    | null
  > {
    const rawText = String(input.text || '').trim()
    if (!rawText) return null

    const explicitSessionId = String(input.sessionId || '').trim()
    const session = explicitSessionId
      ? await getSessionOrThrow(explicitSessionId)
      : (() => undefined)()
    if (session?.closedAt) return null

    const resolvedSession =
      session ||
      (await findLatestPendingSelectionSession(
        String(input.channel || '').trim() || 'unknown',
        String(input.userId || '').trim(),
      ))

    if (!resolvedSession) return null

    const hydratedSession =
      resolvedSession.status === 'awaiting_material' ? await refreshPresentedMaterials(resolvedSession) : resolvedSession

    if (hydratedSession.status === 'awaiting_delivery_count') {
      const count = resolveDeliveryCount(rawText, Number(hydratedSession.availableLivePhotoCount || 0))
      if (!Number.isInteger(count) || count <= 0) return null
      return {
        sessionId: hydratedSession.id,
        selectionType: 'delivery_count',
        count,
      }
    }

    if (hydratedSession.status === 'awaiting_material') {
      if (isDeleteIntent(rawText)) {
        return null
      }
      const numericSelections = extractPositiveIntegers(rawText)
      if (numericSelections.length > 1) {
        const materialIds = numericSelections
          .map((selection) => String(hydratedSession.presentedMaterials?.[selection - 1]?.id || '').trim())
          .filter(Boolean)
        return {
          sessionId: hydratedSession.id,
          selectionType: 'material_batch',
          materialIds,
        }
      }
      if (/^\d+$/.test(rawText) || (numericSelections.length === 1 && isChooseIntent(rawText))) {
        const index = (numericSelections[0] || Number(rawText)) - 1
        const materialId = String(hydratedSession.presentedMaterials?.[index]?.id || '').trim()
        return {
          sessionId: hydratedSession.id,
          selectionType: 'material',
          materialId,
        }
      }
      return {
        sessionId: hydratedSession.id,
        selectionType: 'material',
        materialId: rawText,
      }
    }

    const numericSelections = extractPositiveIntegers(rawText)
    if (/^\d+$/.test(rawText) || (numericSelections.length === 1 && isChooseIntent(rawText))) {
      const index = (numericSelections[0] || Number(rawText)) - 1
      const productId = String(hydratedSession.presentedProducts?.[index]?.id || '').trim()
      return {
        sessionId: hydratedSession.id,
        selectionType: 'product',
        productId,
      }
    }

    const matchedProductId = resolveProductIdFromOptions(rawText, hydratedSession.presentedProducts)
    if (matchedProductId) {
      return {
        sessionId: hydratedSession.id,
        selectionType: 'product',
        productId: matchedProductId,
      }
    }

    return explicitSessionId
      ? {
          sessionId: hydratedSession.id,
          selectionType: 'product',
          productId: rawText,
        }
      : null
  },

  async selectProduct(input: { sessionId: string; productId: string }) {
    const session = await getSessionOrThrow(String(input.sessionId || '').trim())
    assertSessionOpenForMutation(session)
    if (session.status !== 'awaiting_product') {
      throw new Error(`Current session is not awaiting product selection: ${session.status}`)
    }
    const products = Array.isArray(session.presentedProducts) && session.presentedProducts.length
      ? session.presentedProducts
      : await listProductOptions(500, session.selectionMode)
    const selected = products.find((item) => item.id === String(input.productId || '').trim())
    if (!selected) throw new Error('Selected product does not exist')

    if (session.selectionMode === 'material') {
      const materialOptions = await productImageMaterialsService.listHermesMaterialOptionsForProduct({
        productId: selected.id,
      })
      const nextSession: HermesLivePhotoSession = {
        ...session,
        selectedProductId: selected.id,
        status: 'awaiting_material',
        presentedMaterials: materialOptions.options,
        updatedAt: now(),
        error: undefined,
      }
      await saveSession(nextSession)
      return {
        session: nextSession,
        product: selected,
        createdItems: [],
        materials: materialOptions.options,
        message:
          materialOptions.options.length > 0
            ? '\u5df2\u9009\u62e9\u5546\u54c1\uff0c\u8bf7\u7ee7\u7eed\u9009\u62e9\u7d20\u6750\u56fe\u7247\u7f16\u53f7\u3002'
            : '\u5df2\u9009\u62e9\u5546\u54c1\uff0c\u4f46\u8be5\u5206\u7c7b\u5f53\u524d\u6682\u65e0\u672a\u4f7f\u7528\u7d20\u6750\u56fe\u7247\u3002',
      }
    }

    if (session.selectionMode === 'delivery') {
      const availableItems = await livePhotoService.listReusableCompletedItemsByProduct({
        productId: selected.id,
        limit: 50,
      })
      const nextSession: HermesLivePhotoSession = {
        ...session,
        selectedProductId: selected.id,
        status: 'awaiting_delivery_count',
        availableLivePhotoItemIds: availableItems.map((item) => item.id),
        availableLivePhotoCount: availableItems.length,
        updatedAt: now(),
        error: undefined,
      }
      await saveSession(nextSession)
        return {
          session: nextSession,
          product: selected,
          createdItems: [],
          materials: [],
          message:
            availableItems.length > 0
            ? `\u5df2\u9009\u62e9\u5546\u54c1\uff0c\u5f53\u524d\u6709 ${availableItems.length} \u4e2a\u672a\u4f7f\u7528\u7684 Live Photo \u89c6\u9891\u3002\u8bf7\u8f93\u5165\u4f60\u8981\u53d1\u9001\u7684\u6570\u91cf\uff0c\u4e5f\u53ef\u4ee5\u76f4\u63a5\u56de all \u5168\u90e8\u53d1\u9001\u3002`
            : '\u5df2\u9009\u62e9\u5546\u54c1\uff0c\u4f46\u5f53\u524d\u6682\u65e0\u672a\u4f7f\u7528\u7684 Live Photo \u89c6\u9891\u3002',
        }
      }

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
      message: '\u5df2\u9009\u62e9\u5546\u54c1\uff0c\u5df2\u5f00\u59cb\u751f\u6210 Live Photo\u3002',
    }
  },

  async selectDeliveryCount(input: { sessionId: string; count: number }) {
    const session = await getSessionOrThrow(String(input.sessionId || '').trim())
    assertSessionOpenForMutation(session)
    if (session.status !== 'awaiting_delivery_count') {
      throw new Error(`Current session is not awaiting live photo quantity selection: ${session.status}`)
    }
    if (!session.selectedProductId) throw new Error('Selected product is missing from current session')
    const count = Math.max(1, Number(input.count || 0))
    const availableItems = await livePhotoService.listReusableCompletedItemsByProduct({
      productId: session.selectedProductId,
      limit: 50,
    })
    if (!availableItems.length) throw new Error('There are no unused Live Photo videos available for this product')
    if (count > availableItems.length) {
      throw new Error(`Only ${availableItems.length} unused Live Photo videos are available for this product`)
    }
    const selectedItems = availableItems.slice(0, count)
    const generatedVideoPath =
      String(selectedItems[0]?.livePhotoVideoPath || '').trim() ||
      String(selectedItems[0]?.previewVideoPath || '').trim() ||
      String(selectedItems[0]?.motionVideoPath || '').trim() ||
      undefined
    const nextSession: HermesLivePhotoSession = {
      ...session,
      status: 'completed',
      livePhotoItemIds: selectedItems.map((item) => item.id),
      requestedLivePhotoCount: count,
      availableLivePhotoItemIds: selectedItems.map((item) => item.id),
      availableLivePhotoCount: availableItems.length,
      generatedVideoPath,
      updatedAt: now(),
      error: undefined,
    }
    await saveSession(nextSession)
    return {
      session: nextSession,
      items: selectedItems,
      message: `\u6b63\u5728\u51c6\u5907\u53d1\u9001 ${selectedItems.length} \u4e2a\u672a\u4f7f\u7528\u7684 Live Photo \u89c6\u9891\u3002`,
    }
  },

  async selectMaterial(input: { sessionId: string; materialId: string }) {
    const current = await getSessionOrThrow(String(input.sessionId || '').trim())
    assertSessionOpenForMutation(current)
    const session = await refreshPresentedMaterials(current)
    if (session.status !== 'awaiting_material') {
      throw new Error(`Current session is not awaiting material selection: ${session.status}`)
    }
    const materialId = String(input.materialId || '').trim()
    const selectedMaterial = session.presentedMaterials?.find((item) => item.id === materialId)
    if (!selectedMaterial) throw new Error('Selected material does not exist')
    if (!session.selectedProductId) throw new Error('Selected product is missing from current session')

    const created = await livePhotoService.enqueueReferenceItems({
      referenceImagePaths: [selectedMaterial.localImagePath],
      productId: session.selectedProductId,
      motionTemplate: 'push_in',
    })
    const createdItems = (Array.isArray(created) ? created : [created]).filter(Boolean)
    await livePhotoService.startReferenceItems({
      ids: createdItems.map((item) => item.id),
      motionTemplate: 'push_in',
    })
    try {
      await productImageMaterialsService.markMaterialUsed(selectedMaterial.id)
    } catch (error) {
      const message = String((error as Error)?.message || error || '').trim()
      if (message && message !== 'Material does not exist') throw error
    }

    const nextSession: HermesLivePhotoSession = {
      ...session,
      selectedMaterialId: selectedMaterial.id,
      status: 'processing',
      livePhotoItemIds: createdItems.map((item) => item.id),
      updatedAt: now(),
      error: undefined,
    }
    await saveSession(nextSession)
    return {
      session: nextSession,
      material: selectedMaterial,
      createdItems,
      message: '\u5df2\u9009\u62e9\u7d20\u6750\u56fe\u7247\uff0c\u5df2\u5f00\u59cb\u751f\u6210 Live Photo\u3002',
    }
  },

  async selectMaterials(input: { sessionId: string; materialIds: string[] }) {
    const current = await getSessionOrThrow(String(input.sessionId || '').trim())
    assertSessionOpenForMutation(current)
    const session = await refreshPresentedMaterials(current)
    if (session.status !== 'awaiting_material') {
      throw new Error(`Current session is not awaiting material selection: ${session.status}`)
    }
    if (!session.selectedProductId) throw new Error('Selected product is missing from current session')
    const requestedIds = Array.isArray(input.materialIds)
      ? Array.from(new Set(input.materialIds.map((item) => String(item || '').trim()).filter(Boolean)))
      : []
    if (!requestedIds.length) throw new Error('Selected materials do not exist')
    const selectedMaterials = (session.presentedMaterials || []).filter((item) => requestedIds.includes(item.id))
    if (!selectedMaterials.length) throw new Error('Selected materials do not exist')

    const created = await livePhotoService.enqueueReferenceItems({
      referenceImagePaths: selectedMaterials.map((item) => item.localImagePath),
      productId: session.selectedProductId,
      motionTemplate: 'push_in',
    })
    const createdItems = (Array.isArray(created) ? created : [created]).filter(Boolean)
    await livePhotoService.startReferenceItems({
      ids: createdItems.map((item) => item.id),
      motionTemplate: 'push_in',
    })

    for (const selectedMaterial of selectedMaterials) {
      try {
        await productImageMaterialsService.markMaterialUsed(selectedMaterial.id)
      } catch (error) {
        const message = String((error as Error)?.message || error || '').trim()
        if (message && message !== 'Material does not exist') throw error
      }
    }

    const nextSession: HermesLivePhotoSession = {
      ...session,
      selectedMaterialId: selectedMaterials[0]?.id,
      selectedMaterialIds: selectedMaterials.map((item) => item.id),
      status: 'processing',
      livePhotoItemIds: createdItems.map((item) => item.id),
      updatedAt: now(),
      error: undefined,
    }
    await saveSession(nextSession)
    return {
      session: nextSession,
      materials: selectedMaterials,
      createdItems,
      message: `\u5df2\u9009\u62e9 ${selectedMaterials.length} \u5f20\u7d20\u6750\u56fe\u7247\uff0c\u5df2\u6279\u91cf\u5f00\u59cb\u751f\u6210 Live Photo\u3002`,
    }
  },

  async deleteMaterials(input: { sessionId: string; materialIds?: string[]; indexes?: number[] }) {
    const current = await getSessionOrThrow(String(input.sessionId || '').trim())
    assertSessionOpenForMutation(current)
    const session = await refreshPresentedMaterials(current)
    if (session.status !== 'awaiting_material') {
      throw new Error(`Current session is not awaiting material selection: ${session.status}`)
    }
    const presented = Array.isArray(session.presentedMaterials) ? session.presentedMaterials : []
    const byIds = Array.isArray(input.materialIds) ? input.materialIds.map((item) => String(item || '').trim()).filter(Boolean) : []
    const byIndexes = Array.isArray(input.indexes) ? input.indexes.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0) : []
    const resolvedIds = new Set<string>()
    for (const id of byIds) resolvedIds.add(id)
    for (const index of byIndexes) {
      const materialId = String(presented[index - 1]?.id || '').trim()
      if (materialId) resolvedIds.add(materialId)
    }
    if (!resolvedIds.size) throw new Error('No materials were matched for deletion')

    const matched = presented.filter((item) => resolvedIds.has(item.id))
    if (!matched.length) throw new Error('Selected materials do not exist')

    const deleted: Array<{ id: string; index: number; thumbnailUrl: string }> = []
    for (const item of matched) {
      try {
        await productImageMaterialsService.deleteMaterialAny(item.id)
      } catch (error) {
        const message = String((error as Error)?.message || error || '').trim()
        if (message && message !== 'Material does not exist') throw error
      }
      deleted.push({ id: item.id, index: item.index, thumbnailUrl: item.thumbnailUrl })
    }

    const remaining = presented
      .filter((item) => !resolvedIds.has(item.id))
      .map((item, index) => ({
        ...item,
        index: index + 1,
      }))

    const nextSession: HermesLivePhotoSession = {
      ...session,
      presentedMaterials: remaining,
      updatedAt: now(),
      error: undefined,
    }
    await saveSession(nextSession)
    return {
      session: nextSession,
      deleted,
      materials: remaining,
      message: remaining.length
        ? '\u5df2\u5220\u9664\u6240\u9009\u7d20\u6750\u56fe\u7247\uff0c\u8bf7\u4ece\u5269\u4f59\u56fe\u7247\u4e2d\u7ee7\u7eed\u9009\u62e9\u3002'
        : '\u5df2\u5220\u9664\u6240\u9009\u7d20\u6750\u56fe\u7247\uff0c\u5f53\u524d\u4f1a\u8bdd\u5df2\u6ca1\u6709\u53ef\u9009\u56fe\u7247\u3002',
    }
  },

  parseMaterialAction(input: { channel: string; userId: string; text?: string; sessionId?: string }) {
    const rawText = String(input.text || '').trim()
    if (!rawText || !isDeleteIntent(rawText)) return null
    const numericSelections = extractPositiveIntegers(rawText)
    return {
      sessionId: String(input.sessionId || '').trim(),
      indexes: numericSelections,
    }
  },

  async getSessionStatus(sessionId: string) {
    const session = await getSessionOrThrow(String(sessionId || '').trim())
    if (!session.livePhotoItemIds.length) return { session, items: [], completed: false }
    const items = (
      await Promise.all(session.livePhotoItemIds.map((itemId) => livePhotoService.get(itemId)))
    ).filter(Boolean)
    const completedItems = items.filter((item) => item?.packagingStatus === 'completed')
    const failedItems = items.filter((item) => item?.packagingStatus === 'failed')
    const activeItems = items.filter((item) => item?.packagingStatus !== 'completed' && item?.packagingStatus !== 'failed')
    const generatedVideoPath =
      String(completedItems[0]?.livePhotoVideoPath || '').trim() ||
      String(completedItems[0]?.previewVideoPath || '').trim() ||
      String(completedItems[0]?.motionVideoPath || '').trim() ||
      undefined

    let nextStatus = session.status
    let nextError = session.error
    if (activeItems.length > 0) {
      nextStatus = 'processing'
      nextError = undefined
    } else if (completedItems.length > 0) {
      nextStatus = 'completed'
      if (failedItems.length > 0) {
        const failureReasons = Array.from(
          new Set(
            failedItems
              .map((item) => String(item?.error || '').trim())
              .filter(Boolean),
          ),
        )
        const suffix = failureReasons.length ? `：${failureReasons.slice(0, 2).join('；')}` : ''
        nextError = `${failedItems.length} 个任务生成失败${suffix}`
      } else {
        nextError = undefined
      }
    } else if (failedItems.length > 0) {
      nextStatus = 'failed'
      nextError = String(failedItems[0]?.error || 'Live Photo generation failed').trim()
    } else if (items.length > 0) {
      nextStatus = 'processing'
      nextError = undefined
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

  async closeSession(input: { sessionId: string; reason?: string }) {
    return await closeSessionById(String(input.sessionId || '').trim(), String(input.reason || '').trim() || 'session_closed')
  },
}
