import { hermesLivePhotoAdapters } from './hermesAdapters'
import { hermesMediaIngressService } from './hermesMediaIngress'

type FeishuEventInput = {
  tenantAccessToken?: string
  appId?: string
  appSecret?: string
  event?: {
    sender?: {
      sender_id?: {
        open_id?: string
        union_id?: string
        user_id?: string
      }
    }
    message?: {
      message_id?: string
      message_type?: string
      content?: string
    }
  }
}

type WecomEventInput = {
  accessToken?: string
  corpId?: string
  corpSecret?: string
  FromUserName?: string
  MsgType?: string
  Content?: string
  PicUrl?: string
  MediaId?: string
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function extractFeishuUserId(input: FeishuEventInput) {
  return String(
    input?.event?.sender?.sender_id?.open_id ||
      input?.event?.sender?.sender_id?.union_id ||
      input?.event?.sender?.sender_id?.user_id ||
      '',
  ).trim()
}

function extractFeishuText(input: FeishuEventInput) {
  const rawContent = String(input?.event?.message?.content || '').trim()
  const parsed = safeJsonParse(rawContent)
  if (parsed && typeof parsed.text === 'string') return parsed.text.trim()
  return rawContent
}

function extractFeishuImagePaths(input: FeishuEventInput) {
  const rawContent = String(input?.event?.message?.content || '').trim()
  const parsed = safeJsonParse(rawContent)
  if (parsed && typeof parsed.image_path === 'string') return [parsed.image_path.trim()].filter(Boolean)
  if (parsed && Array.isArray(parsed.image_paths)) {
    return parsed.image_paths
      .map(String)
      .map((item: string) => item.trim())
      .filter(Boolean)
  }
  return []
}

function extractFeishuImageKey(input: FeishuEventInput) {
  const rawContent = String(input?.event?.message?.content || '').trim()
  const parsed = safeJsonParse(rawContent)
  return String(parsed?.image_key || parsed?.file_key || '').trim()
}

function extractWecomUserId(input: WecomEventInput) {
  return String(input?.FromUserName || '').trim()
}

function extractWecomText(input: WecomEventInput) {
  return String(input?.Content || '').trim()
}

function extractWecomImagePaths(input: WecomEventInput) {
  const picUrl = String(input?.PicUrl || '').trim()
  return picUrl ? [picUrl] : []
}

function extractWecomMediaId(input: WecomEventInput) {
  return String(input?.MediaId || '').trim()
}

function parseSessionAndText(rawText: string) {
  const text = String(rawText || '').trim()
  if (!text) return { sessionId: '', productId: '', text: '' }
  const sessionMatch = text.match(/session[:=]\s*([a-z0-9-]+)/i)
  const productMatch = text.match(/product[:=]\s*([a-z0-9-]+)/i)
  return {
    sessionId: String(sessionMatch?.[1] || '').trim(),
    productId: String(productMatch?.[1] || '').trim(),
    text,
  }
}

function inferSelectionModeFromText(rawText: string): {
  selectionMode?: 'material' | 'delivery'
  consumeText: boolean
} {
  const text = String(rawText || '').trim()
  if (!text) return { consumeText: false }
  const normalized = text.toLowerCase()

  const materialIntent =
    /(^|\s)(material|materials|image material|image materials)(\s|$)/i.test(text) ||
    /\u7d20\u6750\u5e93|\u7d20\u6750|\u9009\u56fe|\u56fe\u7247\u5e93|\u56fe\u5e93|\u5546\u54c1\u9009\u56fe/.test(text)
  if (materialIntent) {
    return {
      selectionMode: 'material',
      consumeText: true,
    }
  }

  const deliveryIntent =
    /live\s*photo/.test(normalized) ||
    /unused.*live\s*photo/.test(normalized) ||
    /\u672a\u4f7f\u7528.*live\s*photo/.test(text) ||
    /\u672a\u4f7f\u7528\u89c6\u9891|\u672a\u4f7f\u7528\u6210\u54c1|\u53d1\u9001\u6210\u54c1|\u53d1\u9001\u89c6\u9891|\u53d1\u89c6\u9891|\u6210\u54c1\u89c6\u9891/.test(text)
  if (deliveryIntent) {
    return {
      selectionMode: 'delivery',
      consumeText: true,
    }
  }

  return { consumeText: false }
}

function toFeishuReply(actions: Array<any>) {
  return actions.map((action) => {
    if (action.type === 'video') {
      return {
        msg_type: 'text',
        content: JSON.stringify({
          text: action.videoUrl
            ? `${action.text}\n${action.videoUrl}\n${action.videoPath}`
            : `${action.text}\n${action.videoPath}`,
        }),
      }
    }
    return {
      msg_type: 'text',
      content: JSON.stringify({
        text: action.text,
      }),
    }
  })
}

function toWecomReply(actions: Array<any>) {
  return actions.map((action) => {
    if (action.type === 'video') {
      return {
        msgtype: 'text',
        text: {
          content: action.videoUrl
            ? `${action.text}\n${action.videoUrl}\n${action.videoPath}`
            : `${action.text}\n${action.videoPath}`,
        },
      }
    }
    return {
      msgtype: 'text',
      text: {
        content: action.text,
      },
    }
  })
}

export const hermesPlatformFormatters = {
  async handleFeishuOfficialEvent(input: FeishuEventInput) {
    const userId = extractFeishuUserId(input)
    let imagePaths = extractFeishuImagePaths(input)
    if (!imagePaths.length && String(input?.event?.message?.message_type || '').trim() === 'image') {
      const messageId = String(input?.event?.message?.message_id || '').trim()
      const imageKey = extractFeishuImageKey(input)
      if (messageId && imageKey) {
        imagePaths = [
          await hermesMediaIngressService.downloadFeishuImage({
            tenantAccessToken: typeof input.tenantAccessToken === 'string' ? input.tenantAccessToken : undefined,
            appId: typeof input.appId === 'string' ? input.appId : undefined,
            appSecret: typeof input.appSecret === 'string' ? input.appSecret : undefined,
            messageId,
            fileKey: imageKey,
            fileName: `${imageKey}.jpg`,
          }),
        ]
      }
    }
    const text = extractFeishuText(input)
    const parsed = parseSessionAndText(text)
    const startIntent = !parsed.sessionId ? inferSelectionModeFromText(parsed.text) : { consumeText: false as const }
    const adapterResult = await hermesLivePhotoAdapters.handleFeishuEvent({
      userId,
      imagePaths,
      text:
        startIntent.consumeText
          ? ''
          : parsed.productId || (!parsed.sessionId || /^\d+$/.test(parsed.text) ? parsed.text : ''),
      sessionId: parsed.sessionId,
      selectionMode: startIntent.selectionMode,
    })
    return {
      ok: true as const,
      actions: adapterResult.actions,
      replies: toFeishuReply(adapterResult.actions),
    }
  },

  async handleWecomOfficialEvent(input: WecomEventInput) {
    const userId = extractWecomUserId(input)
    let imagePaths = extractWecomImagePaths(input)
    if (!imagePaths.length && String(input?.MsgType || '').trim() === 'image') {
      const mediaId = extractWecomMediaId(input)
      if (mediaId) {
        imagePaths = [
          await hermesMediaIngressService.downloadWecomImage({
            accessToken: typeof input.accessToken === 'string' ? input.accessToken : undefined,
            corpId: typeof input.corpId === 'string' ? input.corpId : undefined,
            corpSecret: typeof input.corpSecret === 'string' ? input.corpSecret : undefined,
            mediaId,
            fileName: `${mediaId}.jpg`,
          }),
        ]
      }
    }
    const text = extractWecomText(input)
    const parsed = parseSessionAndText(text)
    const startIntent = !parsed.sessionId ? inferSelectionModeFromText(parsed.text) : { consumeText: false as const }
    const adapterResult = await hermesLivePhotoAdapters.handleWecomEvent({
      userId,
      imagePaths,
      text:
        startIntent.consumeText
          ? ''
          : parsed.productId || (!parsed.sessionId || /^\d+$/.test(parsed.text) ? parsed.text : ''),
      sessionId: parsed.sessionId,
      selectionMode: startIntent.selectionMode,
    })
    return {
      ok: true as const,
      actions: adapterResult.actions,
      replies: toWecomReply(adapterResult.actions),
    }
  },
}
