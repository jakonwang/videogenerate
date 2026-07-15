#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/feishu_live_photo.js event --config <path> --event-file <path>',
    '  node scripts/feishu_live_photo.js text --config <path> --user-id <open_id> --text <message> [--session-id <id>] [--selection-mode material|delivery|product]',
    '  node scripts/feishu_live_photo.js status --config <path> --session-id <id>',
    '  node scripts/feishu_live_photo.js send-final --config <path> --session-id <id> --receive-id <open_id> [--receive-id-type open_id] [--poll-interval-ms 4000] [--poll-timeout-ms 3600000]',
    '  node scripts/feishu_live_photo.js auto --config <path> --event-file <path> [--poll-interval-ms 4000] [--poll-timeout-ms 3600000]',
    '',
    'Environment:',
    '  FEISHU_LIVE_PHOTO_BASE_URL can override the config baseUrl',
  ].join('\n'))
}

const DEFAULT_POLL_INTERVAL_MS = 4000
const DEFAULT_POLL_TIMEOUT_MS = 60 * 60 * 1000

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      args._.push(token)
      continue
    }
    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = next
    i += 1
  }
  return args
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')
  return JSON.parse(raw)
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function loadConfig(configPath) {
  const raw = readJson(configPath)
  const baseUrl = String(process.env.FEISHU_LIVE_PHOTO_BASE_URL || raw.baseUrl || '').trim().replace(/\/+$/, '')
  if (!baseUrl) throw new Error('Missing baseUrl in config and FEISHU_LIVE_PHOTO_BASE_URL')
  const downloadDir = path.resolve(String(raw.downloadDir || path.join(os.tmpdir(), 'hermes-feishu-live-photo')).trim())
  return {
    baseUrl,
    receiveIdType: String(raw.receiveIdType || 'open_id').trim() || 'open_id',
    appId: String(process.env.FEISHU_APP_ID || raw.appId || '').trim(),
    appSecret: String(process.env.FEISHU_APP_SECRET || raw.appSecret || '').trim(),
    encryptKey: String(process.env.FEISHU_ENCRYPT_KEY || raw.encryptKey || '').trim(),
    verificationToken: String(process.env.FEISHU_VERIFICATION_TOKEN || raw.verificationToken || '').trim(),
    downloadDir,
  }
}

async function requestJson(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    return { ok: true, raw: text }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true })
}

function getMessage(eventBody) {
  return eventBody && typeof eventBody === 'object' ? eventBody.event && eventBody.event.message : null
}

function getMessageType(eventBody) {
  return String(getMessage(eventBody)?.message_type || '').trim()
}

function getMessageId(eventBody) {
  return String(getMessage(eventBody)?.message_id || '').trim()
}

function getContentObject(eventBody) {
  const rawContent = String(getMessage(eventBody)?.content || '').trim()
  if (!rawContent) return {}
  const parsed = safeJsonParse(rawContent)
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function getTextContent(eventBody) {
  const content = getContentObject(eventBody)
  return String(content.text || '').trim()
}

function normalizeTriggerText(text) {
  return String(text || '').trim().toLowerCase().replace(/[\s`'",.?!:;(){}\[\]<>/\\\-_]+/g, '')
}

function inferSelectionModeFromText(text) {
  const normalized = normalizeTriggerText(text)
  if (
    normalized === '素材库' ||
    normalized === '选图' ||
    normalized === '商品选图' ||
    normalized === '商品素材库' ||
    normalized === '图片素材库'
  ) {
    return 'material'
  }
  if (
    normalized === '未使用livephoto' ||
    normalized === '未使用视频' ||
    normalized === '未使用成品' ||
    normalized === '发送成品' ||
    normalized === '发送视频' ||
    normalized === '成品视频'
  ) {
    return 'delivery'
  }
  return ''
}

function getImageKey(eventBody) {
  const content = getContentObject(eventBody)
  return String(content.image_key || content.file_key || '').trim()
}

function inferSelectionModeFromRawText(text) {
  const rawText = String(text || '').trim()
  const normalized = normalizeTriggerText(rawText)
  if (
    /素材库|选图|商品选图|商品素材库|图片素材库/u.test(rawText) ||
    ['material', 'materials', 'materiallibrary', 'imagelibrary'].includes(normalized)
  ) {
    return 'material'
  }
  if (
    /未使用.*live photo|未使用.*livephoto|未使用.*视频|未使用.*成品|发送成品|发送视频|成品视频/u.test(rawText) ||
    ['delivery', 'sendvideo', 'unusedlivephoto', 'unusedvideos'].includes(normalized)
  ) {
    return 'delivery'
  }
  return inferSelectionModeFromText(rawText)
}

function getReceiveId(eventBody) {
  const senderId = eventBody && eventBody.event && eventBody.event.sender && eventBody.event.sender.sender_id
  return String(senderId?.open_id || senderId?.user_id || senderId?.union_id || '').trim()
}

function getSessionIdFromResult(result) {
  const topLevelSessionId = String(result?.session?.id || '').trim()
  if (topLevelSessionId) return topLevelSessionId
  const actions = Array.isArray(result?.actions) ? result.actions : []
  for (const action of actions) {
    const sessionId = String(action?.sessionId || '').trim()
    if (sessionId) return sessionId
  }
  return ''
}

function hasVideoAction(result) {
  const actions = Array.isArray(result?.actions) ? result.actions : []
  return actions.some((action) => String(action?.type || '').trim() === 'video')
}

async function getTenantAccessToken(config) {
  if (!config.appId || !config.appSecret) {
    throw new Error('Missing Feishu appId/appSecret. Configure them in Hermes Feishu channel settings or skill config.')
  }
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Failed to get Feishu tenant access token: HTTP ${response.status} ${text}`)
  }
  const json = safeJsonParse(text) || {}
  const token = String(json.tenant_access_token || '').trim()
  if (!token) {
    throw new Error(`Feishu tenant access token missing: ${text}`)
  }
  return token
}

async function downloadFeishuImage(config, eventBody) {
  const messageId = getMessageId(eventBody)
  const imageKey = getImageKey(eventBody)
  if (!messageId || !imageKey) {
    throw new Error('Feishu image event is missing message_id or image_key')
  }
  const tenantAccessToken = await getTenantAccessToken(config)
  await ensureDir(config.downloadDir)
  const targetPath = path.join(config.downloadDir, `${imageKey}.jpg`)
  const response = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/resources/${encodeURIComponent(imageKey)}?type=image`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tenantAccessToken}`,
      },
    },
  )
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Failed to download Feishu image: HTTP ${response.status} ${text}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.promises.writeFile(targetPath, buffer)
  return targetPath
}

async function normalizeFeishuEvent(config, eventBody) {
  const normalized = JSON.parse(JSON.stringify(eventBody || {}))
  if (getMessageType(normalized) !== 'image') return normalized
  const existingImagePaths = getContentObject(normalized)
  if (Array.isArray(existingImagePaths.image_paths) && existingImagePaths.image_paths.some((item) => String(item || '').trim())) {
    return normalized
  }
  const localImagePath = await downloadFeishuImage(config, normalized)
  normalized.event = normalized.event || {}
  normalized.event.message = normalized.event.message || {}
  normalized.event.message.content = JSON.stringify({
    image_paths: [localImagePath],
  })
  return normalized
}

async function sendWebhookText(config, input) {
  const userId = String(input.userId || '').trim()
  const text = String(input.text || '').trim()
  const sessionId = String(input.sessionId || '').trim()
  const selectionMode = String(input.selectionMode || '').trim()
  if (!userId) throw new Error('Missing userId for text webhook request')
  if (!text && !selectionMode) throw new Error('Missing text or selectionMode for text webhook request')
  const payload = {
    userId,
    text,
    sessionId: sessionId || undefined,
    selectionMode:
      selectionMode === 'material' || selectionMode === 'delivery' || selectionMode === 'product'
        ? selectionMode
        : undefined,
  }
  return await requestJson('POST', `${config.baseUrl}/hermes/live-photo/feishu/webhook`, payload)
}

async function sendFeishuMessage(tenantAccessToken, receiveIdType, receiveId, msgType, content) {
  const response = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(receiveIdType)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenantAccessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        receive_id: receiveId,
        msg_type: msgType,
        content: JSON.stringify(content),
      }),
    },
  )
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Failed to send Feishu message: HTTP ${response.status} ${text}`)
  }
  return safeJsonParse(text) || { ok: true, raw: text }
}

async function uploadFeishuFile(tenantAccessToken, filePath) {
  const fileBuffer = await fs.promises.readFile(filePath)
  const form = new FormData()
  form.set('file_type', 'stream')
  form.set('file_name', path.basename(filePath))
  form.set('file', new Blob([fileBuffer]), path.basename(filePath))
  const response = await fetch('https://open.feishu.cn/open-apis/im/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tenantAccessToken}`,
    },
    body: form,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Failed to upload Feishu file: HTTP ${response.status} ${text}`)
  }
  const json = safeJsonParse(text) || {}
  const fileKey = String(json?.data?.file_key || '').trim()
  if (!fileKey) {
    throw new Error(`Feishu file_key missing: ${text}`)
  }
  return fileKey
}

async function pollSession(config, sessionId, pollIntervalMs, pollTimeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < pollTimeoutMs) {
    const result = await requestJson('GET', `${config.baseUrl}/hermes/live-photo/session/${encodeURIComponent(sessionId)}`)
    const status = String(result?.session?.status || '').trim()
    if (status === 'completed' || status === 'failed') return result
    await sleep(pollIntervalMs)
  }
  throw new Error(`Timed out waiting for session ${sessionId}`)
}

async function requestSendFinal(config, input) {
  const response = await fetch(`${config.baseUrl}/hermes/live-photo/feishu/send-final`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const text = await response.text()
  const payload = safeJsonParse(text) || { ok: false, raw: text }
  if (response.ok) {
    return {
      ok: true,
      payload,
    }
  }
  const retryable = Boolean(payload && typeof payload === 'object' && payload.retryable)
  if (retryable) {
    return {
      ok: false,
      retryable: true,
      payload,
    }
  }
  throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`)
}

async function handleEvent(config, args) {
  const eventFile = String(args['event-file'] || '').trim()
  if (!eventFile) throw new Error('Missing --event-file')
  const eventBody = readJson(eventFile)
  const normalized = await normalizeFeishuEvent(config, eventBody)
  const messageType = getMessageType(normalized)
  let result
  if (messageType === 'text') {
    const text = getTextContent(normalized)
    const selectionMode = inferSelectionModeFromRawText(text)
    result = await sendWebhookText(config, {
      userId: getReceiveId(normalized),
      text: selectionMode ? '' : text,
      selectionMode,
    })
  } else {
    result = await requestJson('POST', `${config.baseUrl}/hermes/live-photo/feishu/official-event`, normalized)
  }
  console.log(JSON.stringify(result, null, 2))
  return result
}

async function handleText(config, args) {
  const userId = String(args['user-id'] || '').trim()
  const text = String(args.text || '').trim()
  const sessionId = String(args['session-id'] || '').trim()
  const selectionMode = String(args['selection-mode'] || '').trim()
  if (!userId) throw new Error('Missing --user-id')
  if (!text && !selectionMode) throw new Error('Missing --text or --selection-mode')
  const result = await sendWebhookText(config, {
    userId,
    text,
    sessionId,
    selectionMode,
  })
  console.log(JSON.stringify(result, null, 2))
  return result
}

async function handleStatus(config, args) {
  const sessionId = String(args['session-id'] || '').trim()
  if (!sessionId) throw new Error('Missing --session-id')
  const result = await requestJson('GET', `${config.baseUrl}/hermes/live-photo/session/${encodeURIComponent(sessionId)}`)
  console.log(JSON.stringify(result, null, 2))
  return result
}

async function handleSendFinal(config, args) {
  const sessionId = String(args['session-id'] || '').trim()
  const receiveId = String(args['receive-id'] || '').trim()
  const receiveIdType = String(args['receive-id-type'] || config.receiveIdType || 'open_id').trim() || 'open_id'
  const userId = String(args['user-id'] || receiveId).trim()
  const pollIntervalMs = Math.max(1000, Number(args['poll-interval-ms'] || DEFAULT_POLL_INTERVAL_MS))
  const pollTimeoutMs = Math.max(30000, Number(args['poll-timeout-ms'] || DEFAULT_POLL_TIMEOUT_MS))
  if (!sessionId) throw new Error('Missing --session-id')
  if (!receiveId) throw new Error('Missing --receive-id')

  const startedAt = Date.now()
  while (Date.now() - startedAt < pollTimeoutMs) {
    const statusResult = await requestJson('GET', `${config.baseUrl}/hermes/live-photo/session/${encodeURIComponent(sessionId)}`)
    const status = String(statusResult?.session?.status || '').trim()
    if (status === 'failed') {
      console.log(JSON.stringify(statusResult, null, 2))
      return statusResult
    }
    if (status !== 'completed') {
      await sleep(pollIntervalMs)
      continue
    }

    const finalAttempt = await requestSendFinal(config, {
      sessionId,
      userId,
      receiveId,
      receiveIdType,
      appId: config.appId || undefined,
      appSecret: config.appSecret || undefined,
    })
    if (finalAttempt.ok) {
      console.log(JSON.stringify(finalAttempt.payload, null, 2))
      return finalAttempt.payload
    }

    await sleep(pollIntervalMs)
  }

  throw new Error(`Timed out waiting for final delivery readiness for session ${sessionId}`)
}

async function handleAuto(config, args) {
  const eventFile = String(args['event-file'] || '').trim()
  if (!eventFile) throw new Error('Missing --event-file')
  const originalEvent = readJson(eventFile)
  const eventResult = await handleEvent(config, args)
  if (hasVideoAction(eventResult)) {
    const receiveId = getReceiveId(originalEvent)
    if (!receiveId) {
      throw new Error('Unable to resolve receiveId from Feishu event sender')
    }
    return await handleSendFinal(config, {
      'session-id': getSessionIdFromResult(eventResult),
      'receive-id': receiveId,
      'receive-id-type': config.receiveIdType,
      'user-id': receiveId,
      'poll-interval-ms': args['poll-interval-ms'],
      'poll-timeout-ms': args['poll-timeout-ms'],
    })
  }
  const sessionId = getSessionIdFromResult(eventResult)
  if (!sessionId) return eventResult

  const currentStatus = await requestJson('GET', `${config.baseUrl}/hermes/live-photo/session/${encodeURIComponent(sessionId)}`)
  const currentState = String(currentStatus?.session?.status || '').trim()
  if (currentState === 'awaiting_product' || currentState === 'awaiting_material' || currentState === 'awaiting_delivery_count') {
    console.log(JSON.stringify(currentStatus, null, 2))
    return currentStatus
  }
  if (currentState === 'failed') {
    console.log(JSON.stringify(currentStatus, null, 2))
    return currentStatus
  }
  if (currentState === 'completed') {
    const receiveId = getReceiveId(originalEvent)
    if (!receiveId) {
      throw new Error('Unable to resolve receiveId from Feishu event sender')
    }
    return await handleSendFinal(config, {
      'session-id': sessionId,
      'receive-id': receiveId,
      'receive-id-type': config.receiveIdType,
      'user-id': receiveId,
      'poll-interval-ms': args['poll-interval-ms'],
      'poll-timeout-ms': args['poll-timeout-ms'],
    })
  }

  const finalStatus = await pollSession(
    config,
    sessionId,
    Math.max(1000, Number(args['poll-interval-ms'] || DEFAULT_POLL_INTERVAL_MS)),
    Math.max(30000, Number(args['poll-timeout-ms'] || DEFAULT_POLL_TIMEOUT_MS)),
  )
  if (String(finalStatus?.session?.status || '').trim() !== 'completed') {
    console.log(JSON.stringify(finalStatus, null, 2))
    return finalStatus
  }

  const receiveId = getReceiveId(originalEvent)
  if (!receiveId) {
    throw new Error('Unable to resolve receiveId from Feishu event sender')
  }
  return await handleSendFinal(config, {
    'session-id': sessionId,
    'receive-id': receiveId,
    'receive-id-type': config.receiveIdType,
    'user-id': receiveId,
    'poll-interval-ms': args['poll-interval-ms'],
    'poll-timeout-ms': args['poll-timeout-ms'],
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const command = String(args._[0] || '').trim()
  if (!command || args.help) {
    printUsage()
    process.exit(command ? 1 : 0)
  }

  const configPath = String(args.config || '').trim()
  if (!configPath) throw new Error('Missing --config')
  const config = loadConfig(path.resolve(configPath))

  if (command === 'event') return await handleEvent(config, args)
  if (command === 'text') return await handleText(config, args)
  if (command === 'status') return await handleStatus(config, args)
  if (command === 'send-final') return await handleSendFinal(config, args)
  if (command === 'auto') return await handleAuto(config, args)

  throw new Error(`Unknown command: ${command}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
