import { hermesLivePhotoService } from './hermes'
import { getLanIPv4 } from '../../lib/lanAddress'
import { ensureWebApiServer } from '../../lib/webApiServer'

type HermesReplyAction =
  | { type: 'text'; text: string }
  | { type: 'product_options'; sessionId: string; text: string; options: Array<{ id: string; label: string }> }
  | { type: 'material_options'; sessionId: string; text: string; options: Array<{ id: string; label: string; thumbnailUrl: string }> }
  | { type: 'video'; text: string; videoPath: string; videoUrl?: string; livePhotoItemId?: string; channel?: 'feishu' | 'wecom'; userId?: string }

function buildProductOptionsText(options: Array<{ id: string; label: string }>, mode: 'product' | 'material' | 'delivery' = 'product') {
  if (!options.length) return '\u5f53\u524d\u6682\u65e0\u53ef\u9009\u5546\u54c1\u3002'
  const guide =
    mode === 'material'
      ? '\u4f7f\u7528\u8bf4\u660e\uff1a1. \u5148\u56de\u590d\u5546\u54c1\u7f16\u53f7 2. \u7cfb\u7edf\u4f1a\u8fd4\u56de\u5bf9\u5e94\u7d20\u6750\u56fe 3. \u518d\u56de\u590d\u56fe\u7247\u7f16\u53f7\u5f00\u59cb\u751f\u6210'
      : mode === 'delivery'
        ? '\u4f7f\u7528\u8bf4\u660e\uff1a1. \u5148\u56de\u590d\u5546\u54c1\u7f16\u53f7 2. \u7cfb\u7edf\u4f1a\u63d0\u793a\u53ef\u53d1\u9001\u6570\u91cf 3. \u518d\u56de\u590d\u4f60\u9700\u8981\u7684\u6570\u91cf'
        : '\u4f7f\u7528\u8bf4\u660e\uff1a\u56de\u590d\u5546\u54c1\u7f16\u53f7\u540e\uff0c\u7cfb\u7edf\u4f1a\u5f00\u59cb\u751f\u6210 Live Photo'
  return [guide, '\u8bf7\u9009\u62e9\u5546\u54c1\u7f16\u53f7\uff1a', ...options.map((item, index) => `${index + 1}. ${item.label}`)].join('\n')
}

function buildMaterialOptionsText(options: Array<{ id: string; label: string; thumbnailUrl: string }>) {
  if (!options.length) return '\u8be5\u5546\u54c1\u5f53\u524d\u6682\u65e0\u53ef\u7528\u7684\u672a\u4f7f\u7528\u7d20\u6750\u56fe\u7247\u3002'
  return [
    '\u4f7f\u7528\u8bf4\u660e\uff1a\u56de\u590d\u56fe\u7247\u7f16\u53f7\u5373\u53ef\u5f00\u59cb\u751f\u6210\uff0c\u5982\u679c\u4e0d\u60f3\u8981\u67d0\u4e9b\u56fe\uff0c\u53ef\u4ee5\u76f4\u63a5\u56de\u590d\u201c\u5220\u9664 2 5\u201d',
    '\u8bf7\u9009\u62e9\u7d20\u6750\u56fe\u7247\u7f16\u53f7\uff1a',
    '\u5982\u9700\u5220\u9664\u4e0d\u8981\u7684\u56fe\u7247\uff0c\u8bf7\u56de\u590d\uff1a\u5220\u9664 2 5',
    ...options.map((item, index) => `${index + 1}. ${item.label} ${item.thumbnailUrl}`),
  ].join('\n')
}

async function buildStatusReply(sessionId: string): Promise<HermesReplyAction[]> {
  const result = await hermesLivePhotoService.getSessionStatus(sessionId)
  if (result.session.status === 'completed' && result.session.generatedVideoPath) {
    let videoUrl: string | undefined
    try {
      const port = await ensureWebApiServer()
      const ip = getLanIPv4()
      if (ip) {
        videoUrl = `http://${ip}:${port}/hermes/live-photo/media?path=${encodeURIComponent(result.session.generatedVideoPath)}`
      }
    } catch {
      videoUrl = undefined
    }
    return [
      {
        type: 'video',
        text: '\u4f60\u7684 Live Photo \u89c6\u9891\u5df2\u751f\u6210\u5b8c\u6210\u3002',
        videoPath: result.session.generatedVideoPath,
        videoUrl,
      },
    ]
  }
  if (result.session.status === 'failed') {
    return [{ type: 'text', text: `Live Photo \u751f\u6210\u5931\u8d25\uff1a${String(result.session.error || '\u672a\u77e5\u9519\u8bef').trim()}` }]
  }
  return [{ type: 'text', text: 'Live Photo \u4ecd\u5728\u751f\u6210\u4e2d\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002' }]
}

async function buildSelectionReply(input: {
  channel: 'feishu' | 'wecom'
  userId: string
  text: string
  sessionId?: string
}): Promise<HermesReplyAction[]> {
  const selection = await hermesLivePhotoService.resolveSelection({
    channel: input.channel,
    userId: input.userId,
    text: input.text,
    sessionId: input.sessionId,
  })

  if (!selection) {
    const deleteAction = hermesLivePhotoService.parseMaterialAction({
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
      const result = await hermesLivePhotoService.deleteMaterials({
        sessionId: targetSession,
        indexes: deleteAction.indexes,
      })
      const options = (result.materials || []).map((item) => ({
        id: item.id,
        label: `${item.category}${item.boundProductId ? ` / ${item.boundProductId}` : ''}`,
        thumbnailUrl: item.thumbnailUrl,
      }))
      return options.length
        ? [
            { type: 'text', text: result.message },
            {
              type: 'material_options',
              sessionId: result.session.id,
              text: buildMaterialOptionsText(options),
              options,
            },
          ]
        : [{ type: 'text', text: result.message }]
    }
    if (/^\d+$/.test(String(input.text || '').trim())) {
      return [{ type: 'text', text: '\u8bf7\u5148\u53d1\u9001\u53c2\u8003\u56fe\u7247\uff0c\u6216\u5148\u8f93\u5165\u7d20\u6750\u5e93 / material\u3002' }]
    }
    return []
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
        },
      ]
    }
    const result = await hermesLivePhotoService.selectMaterial({
      sessionId: selection.sessionId,
      materialId: selection.materialId,
    })
    return [{ type: 'text', text: `${result.message}\n\u4f1a\u8bddID\uff1a${result.session.id}` }]
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
      label: `${item.category}${item.boundProductId ? ` / ${item.boundProductId}` : ''}`,
      thumbnailUrl: item.thumbnailUrl,
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
  return [{ type: 'text', text: `${result.message}\n\u4f1a\u8bddID\uff1a${result.session.id}` }]
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

    if (imagePaths.length) {
      const result = await hermesLivePhotoService.startReferenceSession({
        channel: 'feishu',
        userId: input.userId,
        referenceImagePaths: imagePaths,
        selectionMode: input.selectionMode,
      })
      const options = result.products.map((item) => ({ id: item.id, label: item.name }))
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
      const options = result.products.map((item) => ({ id: item.id, label: item.name }))
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
      actions: [{ type: 'text', text: '\u8bf7\u5148\u53d1\u9001\u53c2\u8003\u56fe\u7247\u3002' }],
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

    if (imagePaths.length) {
      const result = await hermesLivePhotoService.startReferenceSession({
        channel: 'wecom',
        userId: input.userId,
        referenceImagePaths: imagePaths,
        selectionMode: input.selectionMode,
      })
      const options = result.products.map((item) => ({ id: item.id, label: item.name }))
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
      const options = result.products.map((item) => ({ id: item.id, label: item.name }))
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
      actions: [{ type: 'text', text: '\u8bf7\u5148\u53d1\u9001\u53c2\u8003\u56fe\u7247\u3002' }],
    }
  },
}
