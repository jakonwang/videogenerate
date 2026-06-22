import { hermesLivePhotoService } from './hermes'
import { getLanIPv4 } from '../../lib/lanAddress'
import { ensureWebApiServer } from '../../lib/webApiServer'

type HermesReplyAction =
  | { type: 'text'; text: string }
  | { type: 'product_options'; sessionId: string; text: string; options: Array<{ id: string; label: string }> }
  | { type: 'video'; text: string; videoPath: string; videoUrl?: string }

function buildProductOptionsText(options: Array<{ id: string; label: string }>) {
  if (!options.length) return 'No products are currently available.'
  return ['Please choose a product by replying with its number:', ...options.map((item, index) => `${index + 1}. ${item.label}`)].join('\n')
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
        text: 'Your Live Photo video is ready.',
        videoPath: result.session.generatedVideoPath,
        videoUrl,
      },
    ]
  }
  if (result.session.status === 'failed') {
    return [{ type: 'text', text: `Live Photo generation failed: ${String(result.session.error || 'unknown error').trim()}` }]
  }
  return [{ type: 'text', text: 'Live Photo is still processing.' }]
}

async function buildSelectionReply(input: {
  channel: 'feishu' | 'wecom'
  userId: string
  text: string
  sessionId?: string
}): Promise<HermesReplyAction[]> {
  const selection = await hermesLivePhotoService.resolveProductSelection({
    channel: input.channel,
    userId: input.userId,
    text: input.text,
    sessionId: input.sessionId,
  })

  if (!selection) {
    if (/^\d+$/.test(String(input.text || '').trim())) {
      return [{ type: 'text', text: 'Please send a reference image first.' }]
    }
    return []
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
            ? `Invalid selection. Please reply with a number between 1 and ${total}.`
            : 'Invalid selection. Please send a reference image first.',
      },
    ]
  }

  const result = await hermesLivePhotoService.selectProduct({
    sessionId: selection.sessionId,
    productId: selection.productId,
  })
  return [{ type: 'text', text: `${result.message} Session: ${result.session.id}` }]
}

export const hermesLivePhotoAdapters = {
  async handleFeishuEvent(input: {
    userId: string
    imagePaths?: string[]
    text?: string
    sessionId?: string
  }): Promise<{ ok: true; actions: HermesReplyAction[] }> {
    const imagePaths = Array.isArray(input.imagePaths) ? input.imagePaths.map(String).filter(Boolean) : []
    const text = String(input.text || '').trim()
    const sessionId = String(input.sessionId || '').trim()

    if (imagePaths.length) {
      const result = await hermesLivePhotoService.startReferenceSession({
        channel: 'feishu',
        userId: input.userId,
        referenceImagePaths: imagePaths,
      })
      const options = result.products.map((item) => ({ id: item.id, label: `${item.name} (${item.type})` }))
      return {
        ok: true,
        actions: [
          {
            type: 'product_options',
            sessionId: result.session.id,
            text: buildProductOptionsText(options),
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
      actions: [{ type: 'text', text: 'Please send a reference image first.' }],
    }
  },

  async handleWecomEvent(input: {
    userId: string
    imagePaths?: string[]
    text?: string
    sessionId?: string
  }): Promise<{ ok: true; actions: HermesReplyAction[] }> {
    const imagePaths = Array.isArray(input.imagePaths) ? input.imagePaths.map(String).filter(Boolean) : []
    const text = String(input.text || '').trim()
    const sessionId = String(input.sessionId || '').trim()

    if (imagePaths.length) {
      const result = await hermesLivePhotoService.startReferenceSession({
        channel: 'wecom',
        userId: input.userId,
        referenceImagePaths: imagePaths,
      })
      const options = result.products.map((item) => ({ id: item.id, label: `${item.name} (${item.type})` }))
      return {
        ok: true,
        actions: [
          {
            type: 'product_options',
            sessionId: result.session.id,
            text: buildProductOptionsText(options),
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
      actions: [{ type: 'text', text: 'Please send a reference image first.' }],
    }
  },
}
