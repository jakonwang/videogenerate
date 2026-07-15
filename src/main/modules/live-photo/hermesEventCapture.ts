import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'

function safeSegment(input: string, fallback: string) {
  const value = String(input || '')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return value || fallback
}

function captureRoot() {
  return join(getAppPaths().dataDir, 'hermes-live-photo-replay', 'feishu')
}

async function writeCaptureFile(input: {
  prefix: string
  userId?: string
  messageType?: string
  messageId?: string
  payload: Record<string, unknown>
}) {
  const ts = Date.now()
  const prefix = safeSegment(String(input.prefix || '').trim(), 'capture')
  const messageType = safeSegment(String(input.messageType || '').trim(), 'unknown')
  const userId = safeSegment(String(input.userId || '').trim(), 'anonymous')
  const messageId = safeSegment(String(input.messageId || '').trim(), 'no_message_id')
  const dir = captureRoot()
  const filename = `${ts}_${prefix}_${userId}_${messageType}_${messageId}.json`
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, filename), JSON.stringify(input.payload, null, 2), 'utf-8')
}

export const hermesEventCapture = {
  async captureFeishuOfficialEvent(input: {
    userId: string
    messageId?: string
    messageType?: string
    rawContent?: string
    text?: string
    parsedSessionId?: string
    parsedProductText?: string
    inferredSelectionMode?: string
    imageKey?: string
    imagePaths?: string[]
    actions?: Array<{ type?: string; sessionId?: string }>
  }) {
    const ts = Date.now()
    const payload = {
      capturedAt: ts,
      route: '/hermes/live-photo/feishu/official-event',
      userId: String(input.userId || '').trim(),
      messageId: String(input.messageId || '').trim(),
      messageType: String(input.messageType || '').trim(),
      rawContent: String(input.rawContent || '').trim(),
      text: String(input.text || '').trim(),
      parsedSessionId: String(input.parsedSessionId || '').trim(),
      parsedProductText: String(input.parsedProductText || '').trim(),
      inferredSelectionMode: String(input.inferredSelectionMode || '').trim(),
      imageKey: String(input.imageKey || '').trim(),
      imagePaths: Array.isArray(input.imagePaths) ? input.imagePaths.map(String) : [],
      actions: Array.isArray(input.actions)
        ? input.actions.map((item) => ({
            type: String(item?.type || '').trim(),
            sessionId: String(item?.sessionId || '').trim(),
          }))
        : [],
    }
    try {
      await writeCaptureFile({
        prefix: 'official_event',
        userId: input.userId,
        messageType: input.messageType,
        messageId: input.messageId,
        payload,
      })
    } catch {
      // Ignore capture failures so chat flow is never blocked by logging.
    }
  },

  async captureFeishuWebhookEvent(input: {
    userId: string
    text?: string
    sessionId?: string
    selectionMode?: string
    imagePaths?: string[]
    actions?: Array<{ type?: string; sessionId?: string }>
  }) {
    const ts = Date.now()
    const payload = {
      capturedAt: ts,
      route: '/hermes/live-photo/feishu/webhook',
      userId: String(input.userId || '').trim(),
      text: String(input.text || '').trim(),
      sessionId: String(input.sessionId || '').trim(),
      selectionMode: String(input.selectionMode || '').trim(),
      imagePaths: Array.isArray(input.imagePaths) ? input.imagePaths.map(String) : [],
      actions: Array.isArray(input.actions)
        ? input.actions.map((item) => ({
            type: String(item?.type || '').trim(),
            sessionId: String(item?.sessionId || '').trim(),
          }))
        : [],
    }
    try {
      await writeCaptureFile({
        prefix: 'webhook',
        userId: input.userId,
        messageType: 'text',
        messageId: String(input.sessionId || '').trim() || 'no_session',
        payload,
      })
    } catch {
      // Ignore capture failures so chat flow is never blocked by logging.
    }
  },

  async captureFeishuSendFinal(input: {
    sessionId: string
    userId?: string
    receiveId?: string
    receiveIdType?: string
    actionCount?: number
    resultCount?: number
    status?: string
  }) {
    const ts = Date.now()
    const payload = {
      capturedAt: ts,
      route: '/hermes/live-photo/feishu/send-final',
      sessionId: String(input.sessionId || '').trim(),
      userId: String(input.userId || '').trim(),
      receiveId: String(input.receiveId || '').trim(),
      receiveIdType: String(input.receiveIdType || '').trim(),
      actionCount: Number(input.actionCount || 0),
      resultCount: Number(input.resultCount || 0),
      status: String(input.status || '').trim(),
    }
    try {
      await writeCaptureFile({
        prefix: 'send_final',
        userId: input.userId,
        messageType: 'delivery',
        messageId: String(input.sessionId || '').trim(),
        payload,
      })
    } catch {
      // Ignore capture failures so chat flow is never blocked by logging.
    }
  },
}
