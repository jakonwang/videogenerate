import { hermesLivePhotoService } from './hermes'
import { getLanIPv4 } from '../../lib/lanAddress'
import { ensureWebApiServer } from '../../lib/webApiServer'

type HermesReplyAction =
  | { type: 'text'; text: string; sessionId?: string }
  | { type: 'product_options'; sessionId: string; text: string; options: Array<{ id: string; label: string }> }
  | {
      type: 'material_options'
      sessionId: string
      text: string
      options: Array<{ id: string; label: string; thumbnailUrl: string; materialOrigin?: 'original' | 'derived' }>
    }
  | { type: 'video'; text: string; videoPath: string; videoUrl?: string; livePhotoItemId?: string; channel?: 'feishu' | 'wecom'; userId?: string; sessionId?: string }

type HermesChannel = 'feishu' | 'wecom'

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

function isHelpIntent(text: string) {
  const normalized = String(text || '').trim().toLowerCase()
  return /help|how|what|\u5e2e\u52a9|\u600e\u4e48|\u5982\u4f55|\u600e\u4e48\u7528|\u600e\u4e48\u5f04|\u8bf4\u660e|\u89c4\u5219|\u6d41\u7a0b/.test(normalized)
}

function isStatusIntent(text: string) {
  const normalized = String(text || '').trim().toLowerCase()
  return /status|progress|done|ready|finish|finished|still|\u5728\u5417|\u8fdb\u5ea6|\u597d\u4e86\u6ca1|\u505a\u597d\u6ca1|\u5b8c\u6210\u6ca1|\u51fa\u6765\u6ca1|\u591a\u4e45|\u591a\u957f\u65f6\u95f4/.test(normalized)
}

function isDeleteIntent(text: string) {
  const normalized = String(text || '').trim().toLowerCase()
  return /\u5220\u9664|\u5220\u6389|\u4e0d\u8981|\u79fb\u9664|\u53bb\u6389|delete|remove|drop/.test(normalized)
}

function isRestartIntent(text: string) {
  const normalized = String(text || '').trim().toLowerCase()
  return /\u91cd\u65b0\u5f00\u59cb|\u91cd\u6765|\u91cd\u65b0\u6765|\u91cd\u5f00|\u91cd\u65b0\u4e0b\u5355|\u65b0\u8ba2\u5355|restart|start over|new order|reset/.test(normalized)
}

function isCancelIntent(text: string) {
  const normalized = String(text || '').trim().toLowerCase()
  return /\u53d6\u6d88|\u7ed3\u675f|\u505c\u6b62|\u505c\u4e0b|\u4e0d\u505a\u4e86|cancel|stop|end|abort/.test(normalized)
}

function isChangeProductIntent(text: string) {
  const normalized = String(text || '').trim().toLowerCase()
  return /\u6362\u5546\u54c1|\u6362\u4e00\u4e2a\u5546\u54c1|\u91cd\u9009\u5546\u54c1|\u91cd\u65b0\u9009\u5546\u54c1|\u8fd4\u56de\u5546\u54c1|\u91cd\u65b0\u9009|change product|switch product|pick another product|choose another product|back/.test(normalized)
}

function looksLikeExplicitEntityId(text: string) {
  return /^[a-z0-9-]{20,}$/i.test(String(text || '').trim())
}

function isSendAllIntent(text: string) {
  const normalized = String(text || '').trim().toLowerCase()
  return /^(all|all please|send all|\u5168\u90e8|\u5168\u90e8\u53d1|\u90fd\u53d1|\u5168\u53d1|\u5168\u8981|\u90fd\u8981)$/.test(normalized)
}

function isDirectSendFinalIntent(text: string) {
  const normalized = String(text || '').trim().toLowerCase()
  return /\u53d1\u9001\u6210\u54c1|\u53d1\u9001\u89c6\u9891|\u53d1\u89c6\u9891|\u6210\u54c1\u89c6\u9891|send final|send video|send result/.test(
    normalized,
  )
}

function matchesPresentedProductName(text: string, options: Array<{ id: string; label: string }> | undefined) {
  const normalized = normalizeLookupText(text)
  if (!normalized) return false
  const items = Array.isArray(options) ? options : []
  const exactMatches = items.filter((item) => normalizeLookupText(item.label) === normalized)
  if (exactMatches.length === 1) return true
  const partialMatches = items.filter((item) => normalizeLookupText(item.label).includes(normalized))
  return partialMatches.length === 1
}

function buildPartialFailureText(error: string, failedCount: number) {
  const detail = String(error || '').trim()
  return detail
    ? `\u8fd9\u6b21\u4efb\u52a1\u6709 ${failedCount} \u4e2a\u751f\u6210\u5931\u8d25\uff0c\u6211\u5148\u628a\u5df2\u7ecf\u6210\u529f\u7684\u89c6\u9891\u53d1\u7ed9\u4f60\u3002\n\u5931\u8d25\u8bf4\u660e\uff1a${detail}`
    : `\u8fd9\u6b21\u4efb\u52a1\u6709 ${failedCount} \u4e2a\u751f\u6210\u5931\u8d25\uff0c\u6211\u5148\u628a\u5df2\u7ecf\u6210\u529f\u7684\u89c6\u9891\u53d1\u7ed9\u4f60\u3002`
}

function buildStartGuideText() {
  return '\u8bf7\u5148\u53d1\u9001\u53c2\u8003\u56fe\u7247\u5f00\u59cb\u751f\u6210\uff0c\u6216\u76f4\u63a5\u56de\u590d materials \u8fdb\u5165\u7d20\u6750\u5e93\u9009\u56fe\uff0c\u56de\u590d unused live photo \u8fdb\u5165\u6210\u54c1\u53d1\u9001\u6a21\u5f0f\u3002\n\u9009\u62e9\u9636\u6bb5\u53ef\u4ee5\u76f4\u63a5\u56de\u7f16\u53f7\uff0c\u4e5f\u53ef\u4ee5\u56de\u5546\u54c1\u540d\u79f0\uff0c\u9700\u8981\u5e2e\u52a9\u65f6\u56de help\u3002'
}

function buildGenericHelpText() {
  return [
    '\u6211\u4f1a\u6309\u7167\u4f60\u5f53\u524d\u7684 Live Photo \u4f1a\u8bdd\u7ee7\u7eed\u5904\u7406\u3002',
    '\u6b63\u5e38\u751f\u6210\uff1a\u5148\u53d1\u53c2\u8003\u56fe\uff0c\u518d\u56de\u5546\u54c1\u7f16\u53f7\u3002',
    '\u7d20\u6750\u5e93\u6a21\u5f0f\uff1a\u56de materials\uff0c\u518d\u9009\u5546\u54c1\u548c\u56fe\u7247\u7f16\u53f7\u3002',
    '\u6210\u54c1\u53d1\u9001\u6a21\u5f0f\uff1a\u56de unused live photo\uff0c\u518d\u9009\u5546\u54c1\u548c\u53d1\u9001\u6570\u91cf\u3002',
  ].join('\n')
}

function inferSelectionModeFromText(rawText: string): 'material' | 'delivery' | null {
  const text = String(rawText || '').trim()
  if (!text) return null
  const normalized = text.toLowerCase()
  if (
    /(^|\s)(material|materials|image material|image materials)(\s|$)/i.test(text) ||
    /\u7d20\u6750\u5e93|\u7d20\u6750|\u9009\u56fe|\u56fe\u7247\u5e93|\u56fe\u5e93|\u5546\u54c1\u9009\u56fe/.test(text)
  ) {
    return 'material'
  }
  if (
    /unused.*live\s*photo/.test(normalized) ||
    /\u672a\u4f7f\u7528.*live\s*photo/.test(text) ||
    /\u672a\u4f7f\u7528\u89c6\u9891|\u672a\u4f7f\u7528\u6210\u54c1|\u53d1\u9001\u6210\u54c1|\u53d1\u9001\u89c6\u9891|\u53d1\u89c6\u9891|\u6210\u54c1\u89c6\u9891/.test(text)
  ) {
    return 'delivery'
  }
  return null
}

function buildProductOptionsText(options: Array<{ id: string; label: string }>, mode: 'product' | 'material' | 'delivery' = 'product') {
  if (!options.length) return '\u5f53\u524d\u6682\u65e0\u53ef\u9009\u5546\u54c1\u3002'
  const guide =
    mode === 'material'
      ? '\u4f7f\u7528\u8bf4\u660e\uff1a1. \u5148\u56de\u590d\u5546\u54c1\u7f16\u53f7\u6216\u5546\u54c1\u540d\u79f0 2. \u7cfb\u7edf\u4f1a\u8fd4\u56de\u5bf9\u5e94\u7d20\u6750\u56fe 3. \u518d\u56de\u590d\u56fe\u7247\u7f16\u53f7\u5f00\u59cb\u751f\u6210'
      : mode === 'delivery'
        ? '\u4f7f\u7528\u8bf4\u660e\uff1a1. \u5148\u56de\u590d\u5546\u54c1\u7f16\u53f7\u6216\u5546\u54c1\u540d\u79f0 2. \u7cfb\u7edf\u4f1a\u63d0\u793a\u53ef\u53d1\u9001\u6570\u91cf 3. \u518d\u56de\u590d\u4f60\u9700\u8981\u7684\u6570\u91cf\u6216\u56de all'
        : '\u4f7f\u7528\u8bf4\u660e\uff1a\u56de\u590d\u5546\u54c1\u7f16\u53f7\u6216\u5546\u54c1\u540d\u79f0\u540e\uff0c\u7cfb\u7edf\u4f1a\u5f00\u59cb\u751f\u6210 Live Photo'
  return [guide, '\u8bf7\u9009\u62e9\u5546\u54c1\u7f16\u53f7\uff1a', ...options.map((item, index) => `${index + 1}. ${item.label}`)].join('\n')
}

function buildMaterialOptionsText(options: Array<{ id: string; label: string; thumbnailUrl: string }>) {
  if (!options.length) return '\u8be5\u5546\u54c1\u5f53\u524d\u6682\u65e0\u53ef\u7528\u7684\u672a\u4f7f\u7528\u7d20\u6750\u56fe\u7247\u3002'
  return [
    '\u4f7f\u7528\u8bf4\u660e\uff1a\u56de\u590d\u56fe\u7247\u7f16\u53f7\u5373\u53ef\u5f00\u59cb\u751f\u6210\uff0c\u4e5f\u53ef\u4ee5\u4e00\u6b21\u56de\u590d\u591a\u4e2a\u7f16\u53f7\uff0c\u6bd4\u5982\u201c1 2 3\u201d\u6216\u201c1,2,3\u201d\u6279\u91cf\u751f\u6210',
    '\u8bf7\u9009\u62e9\u7d20\u6750\u56fe\u7247\u7f16\u53f7\uff1a',
    '\u5982\u9700\u5220\u9664\u4e0d\u8981\u7684\u56fe\u7247\uff0c\u8bf7\u56de\u590d\uff1a\u5220\u9664 2 5',
    ...options.map((item, index) => `${index + 1}. ${item.label} ${item.thumbnailUrl}`),
  ].join('\n')
}

function formatMaterialOptionLabel(item: { category: string; boundProductId?: string; materialOrigin?: 'original' | 'derived' }) {
  return `${item.category}${item.materialOrigin === 'derived' ? ' [Derived]' : ''}${item.boundProductId ? ` / ${item.boundProductId}` : ''}`
}

async function buildStatusReply(sessionId: string): Promise<HermesReplyAction[]> {
  const result = await hermesLivePhotoService.getSessionStatus(sessionId)
  if (result.session.closedAt) {
    return [
      {
        type: 'text',
        text: buildSessionClosedReplyText(result.session.closeReason),
        sessionId: result.session.id,
      },
    ]
  }
  if (result.session.status === 'completed' && result.items.length) {
    let videoUrl: string | undefined
    try {
      const port = await ensureWebApiServer()
      const ip = getLanIPv4()
      if (ip && result.session.generatedVideoPath) {
        videoUrl = `http://${ip}:${port}/hermes/live-photo/media?path=${encodeURIComponent(result.session.generatedVideoPath)}`
      }
    } catch {
      videoUrl = undefined
    }
    const completedActions: HermesReplyAction[] = []
    const failedCount = result.items.filter((item) => item?.packagingStatus === 'failed').length
    if (failedCount > 0) {
      completedActions.push({
        type: 'text',
        text: buildPartialFailureText(String(result.session.error || '').trim(), failedCount),
        sessionId: result.session.id,
      })
    }
    for (const [index, item] of result.items.entries()) {
      if (!item) continue
      if (item.packagingStatus !== 'completed') continue
      const itemVideoPath =
        String(item?.livePhotoVideoPath || '').trim() ||
        String(item?.previewVideoPath || '').trim() ||
        String(item?.motionVideoPath || '').trim()
      if (!itemVideoPath) continue
      const itemVideoUrl = videoUrl && result.session.generatedVideoPath === itemVideoPath ? videoUrl : undefined
      completedActions.push({
        type: 'video',
        text:
          result.items.filter((entry) => entry?.packagingStatus === 'completed').length > 1
            ? `\u4f60\u7684 Live Photo \u6279\u91cf\u4efb\u52a1\u5df2\u751f\u6210\u5b8c\u6210\u3002 (${completedActions.filter((entry) => entry.type === 'video').length + 1}/${result.items.filter((entry) => entry?.packagingStatus === 'completed').length})`
            : '\u4f60\u7684 Live Photo \u89c6\u9891\u5df2\u751f\u6210\u5b8c\u6210\u3002',
        videoPath: itemVideoPath,
        videoUrl: itemVideoUrl,
        livePhotoItemId: item.id,
        sessionId: result.session.id,
      })
    }
    if (completedActions.length) return completedActions
  }
  if (result.session.status === 'failed') {
    return [{ type: 'text', text: `Live Photo \u751f\u6210\u5931\u8d25\uff1a${String(result.session.error || '\u672a\u77e5\u9519\u8bef').trim()}`, sessionId: result.session.id }]
  }
  return [
    {
      type: 'text',
      text:
        'Live Photo \u4ecd\u5728\u751f\u6210\u4e2d\uff0c\u4e0d\u9700\u8981\u91cd\u590d\u53d1\u9001\u3002\u4f60\u53ef\u4ee5\u7a0d\u540e\u56de progress \u67e5\u770b\u8fdb\u5ea6\uff0c\u6216\u56de restart \u91cd\u65b0\u5f00\u59cb\u3002',
      sessionId: result.session.id,
    },
  ]
}

function buildClosedSessionText() {
  return `\u8fd9\u4e2a Live Photo \u4f1a\u8bdd\u5df2\u7ed3\u675f\uff0c\u4e0d\u4f1a\u518d\u7ee7\u7eed\u5904\u7406\u65e7\u6307\u4ee4\u3002\n${buildStartGuideText()}`
}

function buildFinalSentSessionText() {
  return `\u8fd9\u4e2a Live Photo \u6210\u54c1\u5df2\u7ecf\u53d1\u9001\u5b8c\u6210\uff0c\u4e0d\u4f1a\u518d\u91cd\u590d\u53d1\u9001\u65e7\u6210\u54c1\u3002\n${buildStartGuideText()}`
}

function buildSessionClosedReplyText(closeReason?: string) {
  return String(closeReason || '').trim() === 'final_sent' ? buildFinalSentSessionText() : buildClosedSessionText()
}

async function buildPendingSessionReply(input: { channel: HermesChannel; userId: string }): Promise<HermesReplyAction[] | null> {
  const latestSession = await hermesLivePhotoService.getLatestSession({
    channel: input.channel,
    userId: input.userId,
  })
  if (!latestSession) return null

  if (latestSession.status === 'awaiting_product') {
    const options = Array.isArray(latestSession.presentedProducts)
      ? latestSession.presentedProducts.map((item) => ({
          id: item.id,
          label: item.name,
        }))
      : []
    return [
      {
        type: 'product_options',
        sessionId: latestSession.id,
        text:
          latestSession.selectionMode === 'material'
            ? `\u5f53\u524d\u5728\u7d20\u6750\u5e93\u9009\u56fe\u6d41\u7a0b\uff0c\u8bf7\u5148\u56de\u590d\u5546\u54c1\u7f16\u53f7\u3002\n${buildProductOptionsText(options, 'material')}`
            : latestSession.selectionMode === 'delivery'
              ? `\u5f53\u524d\u5728\u6210\u54c1\u53d1\u9001\u6d41\u7a0b\uff0c\u8bf7\u5148\u56de\u590d\u5546\u54c1\u7f16\u53f7\u3002\n${buildProductOptionsText(options, 'delivery')}`
              : `\u5f53\u524d\u53c2\u8003\u56fe\u5df2\u6536\u5230\uff0c\u8bf7\u76f4\u63a5\u56de\u590d\u5546\u54c1\u7f16\u53f7\u3002\n${buildProductOptionsText(options, 'product')}`,
        options,
      },
    ]
  }

  if (latestSession.status === 'awaiting_material') {
    const session = await hermesLivePhotoService.getLatestAwaitingMaterialSession({
      channel: input.channel,
      userId: input.userId,
    })
    const options = (session?.presentedMaterials || []).map((item) => ({
      id: item.id,
      label: formatMaterialOptionLabel(item),
      thumbnailUrl: item.thumbnailUrl,
      materialOrigin: item.materialOrigin,
    }))
    return [
      {
        type: 'material_options',
        sessionId: session?.id || latestSession.id,
        text: `\u5f53\u524d\u5728\u9009\u7d20\u6750\u56fe\uff0c\u8bf7\u76f4\u63a5\u56de\u56fe\u7247\u7f16\u53f7\u3002\n${buildMaterialOptionsText(options)}`,
        options,
      },
    ]
  }

  if (latestSession.status === 'awaiting_delivery_count') {
    const total = Number(latestSession.availableLivePhotoCount || 0)
    return [
      {
        type: 'text',
        text:
          total > 0
            ? `\u5f53\u524d\u5728\u53d1\u9001\u6210\u54c1\u89c6\u9891\uff0c\u8bf7\u76f4\u63a5\u56de\u590d\u8981\u53d1\u9001\u7684\u6570\u91cf\u3002\u53ef\u7528 ${total} \u4e2a\uff0c\u4e5f\u53ef\u4ee5\u76f4\u63a5\u56de all \u5168\u90e8\u53d1\u9001\u3002`
            : '\u5f53\u524d\u8fd9\u4e2a\u5546\u54c1\u6ca1\u6709\u53ef\u53d1\u9001\u7684\u6210\u54c1\u89c6\u9891\uff0c\u53ef\u4ee5\u91cd\u65b0\u9009\u5176\u4ed6\u5546\u54c1\u3002',
        sessionId: latestSession.id,
      },
    ]
  }

  if (latestSession.status === 'processing' || latestSession.status === 'completed' || latestSession.status === 'failed') {
    return await buildStatusReply(latestSession.id)
  }

  return null
}

async function buildLatestClosedSessionReply(input: { channel: HermesChannel; userId: string }): Promise<HermesReplyAction[] | null> {
  const latestSession = await hermesLivePhotoService.getLatestSessionIncludingClosed({
    channel: input.channel,
    userId: input.userId,
  })
  if (!latestSession?.closedAt) return null
  return [
    {
      type: 'text',
      text: buildSessionClosedReplyText(latestSession.closeReason),
      sessionId: latestSession.id,
    },
  ]
}

async function buildDirectSendFinalReply(input: {
  channel: HermesChannel
  userId: string
  sessionId?: string
}): Promise<HermesReplyAction[] | null> {
  const scopedSessionId = String(input.sessionId || '').trim()
  const scopedSession = scopedSessionId ? (await hermesLivePhotoService.getSessionStatus(scopedSessionId)).session : null
  const latestOpenSession =
    scopedSession ||
    (await hermesLivePhotoService.getLatestSession({
      channel: input.channel,
      userId: input.userId,
    }))

  if (latestOpenSession) {
    if (latestOpenSession.closedAt) {
      return [{ type: 'text', text: buildSessionClosedReplyText(latestOpenSession.closeReason), sessionId: latestOpenSession.id }]
    }
    if (
      latestOpenSession.status === 'completed' ||
      latestOpenSession.status === 'processing' ||
      latestOpenSession.status === 'failed'
    ) {
      return await buildStatusReply(latestOpenSession.id)
    }
    return await buildSessionScopedReply({
      channel: input.channel,
      userId: input.userId,
      sessionId: latestOpenSession.id,
      text: 'help',
    })
  }

  return await buildLatestClosedSessionReply({
    channel: input.channel,
    userId: input.userId,
  })
}

async function buildSessionScopedReply(input: {
  channel: HermesChannel
  userId: string
  sessionId: string
  text: string
}): Promise<HermesReplyAction[] | null> {
  const rawText = String(input.text || '').trim()
  const result = await hermesLivePhotoService.getSessionStatus(input.sessionId)
  const session = result.session

  if (session.closedAt && !isStatusIntent(rawText)) {
    return [{ type: 'text', text: buildSessionClosedReplyText(session.closeReason), sessionId: session.id }]
  }

  if (isStatusIntent(rawText)) {
    return await buildStatusReply(session.id)
  }

  if (isHelpIntent(rawText)) {
    if (session.status === 'awaiting_product') {
      const options = Array.isArray(session.presentedProducts)
        ? session.presentedProducts.map((item) => ({ id: item.id, label: item.name }))
        : []
      return [
        {
          type: 'product_options',
          sessionId: session.id,
          text:
            session.selectionMode === 'material'
              ? `\u5f53\u524d\u5728\u7d20\u6750\u5e93\u6d41\u7a0b\uff0c\u8bf7\u5148\u9009\u5546\u54c1\u7f16\u53f7\u3002\n${buildProductOptionsText(options, 'material')}`
              : session.selectionMode === 'delivery'
                ? `\u5f53\u524d\u5728\u6210\u54c1\u53d1\u9001\u6d41\u7a0b\uff0c\u8bf7\u5148\u9009\u5546\u54c1\u7f16\u53f7\u3002\n${buildProductOptionsText(options, 'delivery')}`
                : `\u5f53\u524d\u53c2\u8003\u56fe\u5df2\u6536\u5230\uff0c\u8bf7\u76f4\u63a5\u9009\u5546\u54c1\u7f16\u53f7\u3002\n${buildProductOptionsText(options, 'product')}`,
          options,
        },
      ]
    }

    if (session.status === 'awaiting_material') {
      const options = Array.isArray(session.presentedMaterials)
        ? session.presentedMaterials.map((item) => ({
            id: item.id,
            label: formatMaterialOptionLabel(item),
            thumbnailUrl: item.thumbnailUrl,
            materialOrigin: item.materialOrigin,
          }))
        : []
      return [
        {
          type: 'material_options',
          sessionId: session.id,
          text: `\u5f53\u524d\u5728\u7d20\u6750\u9009\u56fe\u6d41\u7a0b\uff0c\u8bf7\u76f4\u63a5\u56de\u56fe\u7247\u7f16\u53f7\uff0c\u6216\u56de\u590d \u5220\u9664 2 5 \u5220\u6389\u4e0d\u8981\u7684\u56fe\u3002\n${buildMaterialOptionsText(options)}`,
          options,
        },
      ]
    }

    if (session.status === 'awaiting_delivery_count') {
      const total = Number(session.availableLivePhotoCount || 0)
      return [
        {
          type: 'text',
          text:
            total > 0
              ? `\u5f53\u524d\u5728\u53d1\u9001\u6210\u54c1\u89c6\u9891\uff0c\u8bf7\u76f4\u63a5\u56de\u590d\u8981\u53d1\u9001\u7684\u6570\u91cf\u3002\u53ef\u7528 ${total} \u4e2a\uff0c\u4e5f\u53ef\u4ee5\u76f4\u63a5\u56de all \u5168\u90e8\u53d1\u9001\u3002`
              : '\u5f53\u524d\u8fd9\u4e2a\u4f1a\u8bdd\u6ca1\u6709\u53ef\u53d1\u9001\u7684\u6210\u54c1\u89c6\u9891\u3002',
          sessionId: session.id,
        },
      ]
    }

    return await buildStatusReply(session.id)
  }

  const hasNumericSelection = extractPositiveIntegers(rawText).length > 0
  const looksLikeResolvableProductName =
    session.status === 'awaiting_product' &&
    matchesPresentedProductName(
      rawText,
      Array.isArray(session.presentedProducts) ? session.presentedProducts.map((item) => ({ id: item.id, label: item.name })) : [],
    )
  const looksLikeResolvableDeliveryCount = session.status === 'awaiting_delivery_count' && isSendAllIntent(rawText)

  if (
    !hasNumericSelection &&
    !isDeleteIntent(rawText) &&
    !looksLikeExplicitEntityId(rawText) &&
    !looksLikeResolvableProductName &&
    !looksLikeResolvableDeliveryCount
  ) {
    if (session.status === 'awaiting_product' || session.status === 'awaiting_material' || session.status === 'awaiting_delivery_count') {
      return await buildSessionScopedReply({ ...input, text: 'help' })
    }
    return await buildStatusReply(session.id)
  }

  return null
}

async function buildSelectionReply(input: {
  channel: HermesChannel
  userId: string
  text: string
  sessionId?: string
}): Promise<HermesReplyAction[]> {
  const explicitSessionId = String(input.sessionId || '').trim()
  if (explicitSessionId) {
    const scopedReply = await buildSessionScopedReply({
      channel: input.channel,
      userId: input.userId,
      sessionId: explicitSessionId,
      text: input.text,
    })
    if (scopedReply) return scopedReply
  }

  const latestSession = await hermesLivePhotoService.getLatestSession({
    channel: input.channel,
    userId: input.userId,
  })
  if (latestSession) {
    const latestScopedReply = await buildSessionScopedReply({
      channel: input.channel,
      userId: input.userId,
      sessionId: latestSession.id,
      text: input.text,
    })
    if (latestScopedReply) return latestScopedReply
  }

  const selection = await hermesLivePhotoService.resolveSelection({
    channel: input.channel,
    userId: input.userId,
    text: input.text,
    sessionId: input.sessionId,
  })

  if (!selection) {
    if (explicitSessionId) {
      const explicitStatus = await hermesLivePhotoService.getSessionStatus(explicitSessionId)
      if (explicitStatus.session.closedAt) {
        return [{ type: 'text', text: buildClosedSessionText() }]
      }
    }
    const deleteAction =
      (isDeleteIntent(input.text)
        ? {
            sessionId: explicitSessionId,
            indexes: Array.from(
              new Set(
                (String(input.text || '').match(/\d+/g) || [])
                  .map((item) => Number(item))
                  .filter((item) => Number.isInteger(item) && item > 0),
              ),
            ),
          }
        : null) ||
      hermesLivePhotoService.parseMaterialAction({
      channel: input.channel,
      userId: input.userId,
      text: input.text,
      sessionId: input.sessionId,
    })
    if (deleteAction) {
      const targetSession =
        deleteAction.sessionId ||
        String(
          (
            await hermesLivePhotoService.getLatestAwaitingMaterialSession({
              channel: input.channel,
              userId: input.userId,
            })
          )?.id || '',
        ).trim()
      if (!targetSession) {
        return [{ type: 'text', text: '\u5f53\u524d\u8fd8\u6ca1\u6709\u53ef\u5220\u9664\u7d20\u6750\u7684\u9009\u56fe\u4f1a\u8bdd\u3002' }]
      }
      let result: Awaited<ReturnType<typeof hermesLivePhotoService.deleteMaterials>>
      try {
        result = await hermesLivePhotoService.deleteMaterials({
          sessionId: targetSession,
          indexes: deleteAction.indexes,
        })
      } catch (error) {
        const message = String((error as Error)?.message || error || '').trim()
        if (message === 'No materials were matched for deletion' || message === 'Selected materials do not exist') {
          const session = await hermesLivePhotoService.getLatestAwaitingMaterialSession({
            channel: input.channel,
            userId: input.userId,
          })
          const remaining = Array.isArray(session?.presentedMaterials) ? session.presentedMaterials : []
          if (remaining.length > 0) {
          const options = remaining.map((item) => ({
            id: item.id,
            label: formatMaterialOptionLabel(item),
            thumbnailUrl: item.thumbnailUrl,
            materialOrigin: item.materialOrigin,
          }))
            return [
              { type: 'text', text: '\u4f60\u521a\u624d\u5220\u9664\u7684\u7d20\u6750\u56fe\u5df2\u7ecf\u4e0d\u5728\u5f53\u524d\u5217\u8868\u91cc\u4e86\uff0c\u8bf7\u4ece\u5269\u4f59\u56fe\u7247\u4e2d\u7ee7\u7eed\u9009\u62e9\u3002', sessionId: session!.id },
              {
                type: 'material_options',
                sessionId: session!.id,
                text: buildMaterialOptionsText(options),
                options,
              },
            ]
          }
          return [{ type: 'text', text: '\u5f53\u524d\u5546\u54c1\u5df2\u6ca1\u6709\u5269\u4f59\u7d20\u6750\u56fe\u7247\u4e86\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9\u5546\u54c1\u7f16\u53f7\u3002' }]
        }
        throw error
      }
      const options = (result.materials || []).map((item) => ({
        id: item.id,
        label: formatMaterialOptionLabel(item),
        thumbnailUrl: item.thumbnailUrl,
        materialOrigin: item.materialOrigin,
      }))
      return options.length
        ? [
            { type: 'text', text: result.message, sessionId: result.session.id },
            {
              type: 'material_options',
              sessionId: result.session.id,
              text: buildMaterialOptionsText(options),
              options,
            },
          ]
        : [{ type: 'text', text: result.message, sessionId: result.session.id }]
    }
    if (/^\d+$/.test(String(input.text || '').trim())) {
      const latestReply = await buildPendingSessionReply({
        channel: input.channel,
        userId: input.userId,
      })
      return latestReply || [{ type: 'text', text: buildStartGuideText() }]
    }
    if (isStatusIntent(input.text)) {
      const latestReply = await buildPendingSessionReply({
        channel: input.channel,
        userId: input.userId,
      })
      const latestClosedReply = await buildLatestClosedSessionReply({
        channel: input.channel,
        userId: input.userId,
      })
      return latestReply || latestClosedReply || [{ type: 'text', text: '\u5f53\u524d\u8fd8\u6ca1\u6709\u6b63\u5728\u8fdb\u884c\u7684 Live Photo \u4efb\u52a1\u3002' }]
    }
    if (isHelpIntent(input.text)) {
      const latestReply = await buildPendingSessionReply({
        channel: input.channel,
        userId: input.userId,
      })
      const latestClosedReply = await buildLatestClosedSessionReply({
        channel: input.channel,
        userId: input.userId,
      })
      return latestReply || latestClosedReply || [{ type: 'text', text: buildGenericHelpText() }]
    }
    const latestReply = await buildPendingSessionReply({
      channel: input.channel,
      userId: input.userId,
    })
    return latestReply || [{ type: 'text', text: buildStartGuideText() }]
  }

  if (selection.selectionType === 'material') {
    if (!selection.materialId) {
      const session = await hermesLivePhotoService.getLatestAwaitingMaterialSession({
        channel: input.channel,
        userId: input.userId,
      })
      const total = Array.isArray(session?.presentedMaterials) ? session.presentedMaterials.length : 0
      return [
        {
          type: 'text',
          text:
            total > 0
              ? `\u9009\u62e9\u65e0\u6548\uff0c\u8bf7\u56de\u590d 1 \u5230 ${total} \u4e4b\u95f4\u7684\u7f16\u53f7\u3002`
              : '\u9009\u62e9\u65e0\u6548\uff0c\u8bf7\u5148\u9009\u62e9\u5546\u54c1\u3002',
          sessionId: session?.id,
        },
      ]
    }
    const result = await hermesLivePhotoService.selectMaterial({
      sessionId: selection.sessionId,
      materialId: selection.materialId,
    })
    return [{ type: 'text', text: result.message, sessionId: result.session.id }]
  }

  if (selection.selectionType === 'material_batch') {
    if (!selection.materialIds.length) {
      const session = await hermesLivePhotoService.getLatestAwaitingMaterialSession({
        channel: input.channel,
        userId: input.userId,
      })
      const total = Array.isArray(session?.presentedMaterials) ? session.presentedMaterials.length : 0
      return [
        {
          type: 'text',
          text:
            total > 0
              ? `\u6279\u91cf\u9009\u62e9\u65e0\u6548\uff0c\u8bf7\u56de\u590d 1 \u5230 ${total} \u4e4b\u95f4\u7684\u56fe\u7247\u7f16\u53f7\u3002`
              : '\u6279\u91cf\u9009\u62e9\u65e0\u6548\uff0c\u8bf7\u5148\u9009\u62e9\u5546\u54c1\u3002',
          sessionId: session?.id,
        },
      ]
    }
    const result = await hermesLivePhotoService.selectMaterials({
      sessionId: selection.sessionId,
      materialIds: selection.materialIds,
    })
    return [{ type: 'text', text: result.message, sessionId: result.session.id }]
  }

  if (selection.selectionType === 'delivery_count') {
    const result = await hermesLivePhotoService.selectDeliveryCount({
      sessionId: selection.sessionId,
      count: selection.count,
    })
    return result.items.map((item, index) => ({
      type: 'video',
      text: `${result.message} (${index + 1}/${result.items.length})`,
      videoPath:
        String(item.livePhotoVideoPath || '').trim() ||
        String(item.previewVideoPath || '').trim() ||
        String(item.motionVideoPath || '').trim(),
      livePhotoItemId: item.id,
      channel: input.channel,
      userId: input.userId,
      sessionId: result.session.id,
    }))
  }

  if (!selection.productId) {
    const session = await hermesLivePhotoService.getLatestAwaitingProductSession({
      channel: input.channel,
      userId: input.userId,
    })
    const total = Array.isArray(session?.presentedProducts) ? session.presentedProducts.length : 0
    return [
      {
        type: 'text',
        text:
          total > 0
            ? `\u9009\u62e9\u65e0\u6548\uff0c\u8bf7\u56de\u590d 1 \u5230 ${total} \u4e4b\u95f4\u7684\u7f16\u53f7\u3002`
            : '\u9009\u62e9\u65e0\u6548\uff0c\u8bf7\u5148\u53d1\u9001\u53c2\u8003\u56fe\u7247\u3002',
        sessionId: session?.id,
      },
    ]
  }

  const result = await hermesLivePhotoService.selectProduct({
    sessionId: selection.sessionId,
    productId: selection.productId,
  })
  if (result.session.status === 'awaiting_material') {
    const options = (result.materials || []).map((item) => ({
      id: item.id,
      label: formatMaterialOptionLabel(item),
      thumbnailUrl: item.thumbnailUrl,
      materialOrigin: item.materialOrigin,
    }))
    return [
      {
        type: 'material_options',
        sessionId: result.session.id,
        text: buildMaterialOptionsText(options),
        options,
      },
    ]
  }
  return [{ type: 'text', text: result.message, sessionId: result.session.id }]
}

async function buildModeStartReply(input: {
  channel: HermesChannel
  userId: string
  selectionMode: 'material' | 'delivery'
  reason: string
}): Promise<HermesReplyAction[]> {
  await hermesLivePhotoService.closeSessionsForChat({
    channel: input.channel,
    userId: input.userId,
    includeProcessing: true,
    includeFinished: true,
    reason: input.reason,
  })
  const result = await hermesLivePhotoService.startReferenceSession({
    channel: input.channel,
    userId: input.userId,
    referenceImagePaths: [],
    selectionMode: input.selectionMode,
  })
  const options = Array.isArray(result.products) ? result.products.map((item) => ({ id: item.id, label: item.name })) : []
  return [
    {
      type: 'product_options',
      sessionId: result.session.id,
      text: buildProductOptionsText(options, input.selectionMode),
      options,
    },
  ]
}

async function buildResetReply(input: {
  channel: HermesChannel
  userId: string
  text: string
  sessionId?: string
  selectionMode?: 'product' | 'material' | 'delivery'
}): Promise<HermesReplyAction[] | null> {
  const rawText = String(input.text || '').trim()
  const inferredMode = input.selectionMode || inferSelectionModeFromText(rawText) || undefined
  const scopedSessionId = String(input.sessionId || '').trim()

  if (scopedSessionId && isDirectSendFinalIntent(rawText)) {
    const directReply = await buildDirectSendFinalReply({
      channel: input.channel,
      userId: input.userId,
      sessionId: scopedSessionId,
    })
    if (directReply?.length) return directReply
  }

  if (isChangeProductIntent(rawText)) {
    const baseSession = scopedSessionId
      ? (await hermesLivePhotoService.getSessionStatus(scopedSessionId)).session
      : await hermesLivePhotoService.getLatestSession({
          channel: input.channel,
          userId: input.userId,
        })
    if (!baseSession) {
      return [{ type: 'text', text: buildStartGuideText() }]
    }
    const targetMode = input.selectionMode || baseSession.selectionMode
    const referenceImagePaths =
      targetMode === 'product' ? (Array.isArray(baseSession.referenceImagePaths) ? baseSession.referenceImagePaths : []) : []
    if (targetMode === 'product' && !referenceImagePaths.length) {
      return [{ type: 'text', text: buildStartGuideText() }]
    }
    await hermesLivePhotoService.closeSessionsForChat({
      channel: input.channel,
      userId: input.userId,
      includeProcessing: true,
      includeFinished: true,
      reason: `reselect_product_${targetMode}`,
    })
    const result = await hermesLivePhotoService.startReferenceSession({
      channel: input.channel,
      userId: input.userId,
      referenceImagePaths,
      selectionMode: targetMode,
    })
    const options = Array.isArray(result.products) ? result.products.map((item) => ({ id: item.id, label: item.name })) : []
    return [
      {
        type: 'product_options',
        sessionId: result.session.id,
        text: buildProductOptionsText(options, targetMode),
        options,
      },
    ]
  }

  if (isCancelIntent(rawText)) {
    await hermesLivePhotoService.closeSessionsForChat({
      channel: input.channel,
      userId: input.userId,
      includeProcessing: true,
      includeFinished: true,
      reason: 'cancel_by_user',
    })
    return [{ type: 'text', text: `\u5df2\u7ed3\u675f\u5f53\u524d Live Photo \u4f1a\u8bdd\u3002\n${buildStartGuideText()}` }]
  }

  if (isRestartIntent(rawText)) {
    await hermesLivePhotoService.closeSessionsForChat({
      channel: input.channel,
      userId: input.userId,
      includeProcessing: true,
      includeFinished: true,
      reason: 'restart_by_user',
    })
    if (inferredMode === 'material' || inferredMode === 'delivery') {
      return await buildModeStartReply({
        channel: input.channel,
        userId: input.userId,
        selectionMode: inferredMode,
        reason: `restart_to_${inferredMode}`,
      })
    }
    return [{ type: 'text', text: `\u5df2\u91cd\u7f6e\u5f53\u524d Live Photo \u4f1a\u8bdd\u3002\n${buildStartGuideText()}` }]
  }

  if (inferredMode === 'material' || inferredMode === 'delivery') {
    return await buildModeStartReply({
      channel: input.channel,
      userId: input.userId,
      selectionMode: inferredMode,
      reason: `switch_to_${inferredMode}`,
    })
  }

  return null
}

export const hermesLivePhotoAdapters = {
  async handleFeishuEvent(input: {
    userId: string
    imagePaths?: string[]
    text?: string
    sessionId?: string
    selectionMode?: 'product' | 'material' | 'delivery'
  }): Promise<{ ok: true; actions: HermesReplyAction[] }> {
    const imagePaths = Array.isArray(input.imagePaths) ? input.imagePaths.map(String).filter(Boolean) : []
    const text = String(input.text || '').trim()
    const sessionId = String(input.sessionId || '').trim()
    const modeOrResetReply =
      !imagePaths.length && text
        ? await buildResetReply({
            channel: 'feishu',
            userId: input.userId,
            text,
            sessionId,
            selectionMode: input.selectionMode,
          })
        : null

    if (modeOrResetReply?.length) {
      return {
        ok: true,
        actions: modeOrResetReply,
      }
    }

    if (imagePaths.length) {
      const result = await hermesLivePhotoService.startReferenceSession({
        channel: 'feishu',
        userId: input.userId,
        referenceImagePaths: imagePaths,
        selectionMode: input.selectionMode,
      })
      const options = Array.isArray(result.products) ? result.products.map((item) => ({ id: item.id, label: item.name })) : []
      return {
        ok: true,
        actions: [
          {
            type: 'product_options',
            sessionId: result.session.id,
            text: buildProductOptionsText(options, input.selectionMode || 'product'),
            options,
          },
        ],
      }
    }

    if ((input.selectionMode === 'material' || input.selectionMode === 'delivery') && !imagePaths.length && !text) {
      const result = await hermesLivePhotoService.startReferenceSession({
        channel: 'feishu',
        userId: input.userId,
        referenceImagePaths: [],
        selectionMode: input.selectionMode,
      })
      const options = Array.isArray(result.products) ? result.products.map((item) => ({ id: item.id, label: item.name })) : []
      return {
        ok: true,
        actions: [
          {
            type: 'product_options',
            sessionId: result.session.id,
            text: buildProductOptionsText(options, input.selectionMode || 'product'),
            options,
          },
        ],
      }
    }

    if (sessionId && text) {
      return {
        ok: true,
        actions: await buildSelectionReply({
          channel: 'feishu',
          userId: input.userId,
          text,
          sessionId,
        }),
      }
    }

    if (text) {
      const selectionActions = await buildSelectionReply({
        channel: 'feishu',
        userId: input.userId,
        text,
      })
      if (selectionActions.length) {
        return {
          ok: true,
          actions: selectionActions,
        }
      }
    }

    if (sessionId) {
      return {
        ok: true,
        actions: await buildStatusReply(sessionId),
      }
    }

    return {
      ok: true,
      actions: [{ type: 'text', text: buildStartGuideText() }],
    }
  },

  async handleWecomEvent(input: {
    userId: string
    imagePaths?: string[]
    text?: string
    sessionId?: string
    selectionMode?: 'product' | 'material' | 'delivery'
  }): Promise<{ ok: true; actions: HermesReplyAction[] }> {
    const imagePaths = Array.isArray(input.imagePaths) ? input.imagePaths.map(String).filter(Boolean) : []
    const text = String(input.text || '').trim()
    const sessionId = String(input.sessionId || '').trim()
    const modeOrResetReply =
      !imagePaths.length && text
        ? await buildResetReply({
            channel: 'wecom',
            userId: input.userId,
            text,
            sessionId,
            selectionMode: input.selectionMode,
          })
        : null

    if (modeOrResetReply?.length) {
      return {
        ok: true,
        actions: modeOrResetReply,
      }
    }

    if (imagePaths.length) {
      const result = await hermesLivePhotoService.startReferenceSession({
        channel: 'wecom',
        userId: input.userId,
        referenceImagePaths: imagePaths,
        selectionMode: input.selectionMode,
      })
      const options = Array.isArray(result.products) ? result.products.map((item) => ({ id: item.id, label: item.name })) : []
      return {
        ok: true,
        actions: [
          {
            type: 'product_options',
            sessionId: result.session.id,
            text: buildProductOptionsText(options, input.selectionMode || 'product'),
            options,
          },
        ],
      }
    }

    if ((input.selectionMode === 'material' || input.selectionMode === 'delivery') && !imagePaths.length && !text) {
      const result = await hermesLivePhotoService.startReferenceSession({
        channel: 'wecom',
        userId: input.userId,
        referenceImagePaths: [],
        selectionMode: input.selectionMode,
      })
      const options = Array.isArray(result.products) ? result.products.map((item) => ({ id: item.id, label: item.name })) : []
      return {
        ok: true,
        actions: [
          {
            type: 'product_options',
            sessionId: result.session.id,
            text: buildProductOptionsText(options, input.selectionMode || 'product'),
            options,
          },
        ],
      }
    }

    if (sessionId && text) {
      return {
        ok: true,
        actions: await buildSelectionReply({
          channel: 'wecom',
          userId: input.userId,
          text,
          sessionId,
        }),
      }
    }

    if (text) {
      const selectionActions = await buildSelectionReply({
        channel: 'wecom',
        userId: input.userId,
        text,
      })
      if (selectionActions.length) {
        return {
          ok: true,
          actions: selectionActions,
        }
      }
    }

    if (sessionId) {
      return {
        ok: true,
        actions: await buildStatusReply(sessionId),
      }
    }

    return {
      ok: true,
      actions: [{ type: 'text', text: buildStartGuideText() }],
    }
  },
}
