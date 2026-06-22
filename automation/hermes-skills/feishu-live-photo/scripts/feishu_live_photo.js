#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/feishu_live_photo.js event --config <path> --event-file <path>',
    '  node scripts/feishu_live_photo.js status --config <path> --session-id <id>',
    '  node scripts/feishu_live_photo.js send-final --config <path> --session-id <id> --receive-id <open_id> [--receive-id-type open_id]',
    '  node scripts/feishu_live_photo.js auto --config <path> --event-file <path> [--poll-interval-ms 4000] [--poll-timeout-ms 900000]',
    '',
    'Environment:',
    '  FEISHU_LIVE_PHOTO_BASE_URL can override the config baseUrl',
  ].join('\n'))
}

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
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
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

function getImageKey(eventBody) {
  const content = getContentObject(eventBody)
  return String(content.image_key || content.file_key || '').trim()
}

function getReceiveId(eventBody) {
  const senderId = eventBody && eventBody.event && eventBody.event.sender && eventBody.event.sender.sender_id
  return String(senderId?.open_id || senderId?.user_id || senderId?.union_id || '').trim()
}

function getSessionIdFromResult(result) {
  const actions = Array.isArray(result?.actions) ? result.actions : []
  for (const action of actions) {
    const sessionId = String(action?.sessionId || '').trim()
    if (sessionId) return sessionId
  }
  return ''
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
  const localImagePath = await downloadFeishuImage(config, normalized)
  normalized.event = normalized.event || {}
  normalized.event.message = normalized.event.message || {}
  normalized.event.message.content = JSON.stringify({
    image_paths: [localImagePath],
  })
  return normalized
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
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
  throw new Error(`Timed out waiting for session ${sessionId}`)
}

async function handleEvent(config, args) {
  const eventFile = String(args['event-file'] || '').trim()
  if (!eventFile) throw new Error('Missing --event-file')
  const eventBody = readJson(eventFile)
  const normalized = await normalizeFeishuEvent(config, eventBody)
  const result = await requestJson('POST', `${config.baseUrl}/hermes/live-photo/feishu/official-event`, normalized)
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
  if (!sessionId) throw new Error('Missing --session-id')
  if (!receiveId) throw new Error('Missing --receive-id')

  const statusResult = await requestJson('GET', `${config.baseUrl}/hermes/live-photo/session/${encodeURIComponent(sessionId)}`)
  const status = String(statusResult?.session?.status || '').trim()
  const videoPath = String(statusResult?.session?.generatedVideoPath || '').trim()
  if (status !== 'completed' || !videoPath) {
    throw new Error(`Session ${sessionId} is not completed yet`)
  }

  const tenantAccessToken = await getTenantAccessToken(config)
  await sendFeishuMessage(tenantAccessToken, receiveIdType, receiveId, 'text', {
    text: 'Your Live Photo video is ready.',
  })
  const fileKey = await uploadFeishuFile(tenantAccessToken, videoPath)
  const result = await sendFeishuMessage(tenantAccessToken, receiveIdType, receiveId, 'file', {
    file_key: fileKey,
  })
  console.log(JSON.stringify(result, null, 2))
  return result
}

async function handleAuto(config, args) {
  const eventFile = String(args['event-file'] || '').trim()
  if (!eventFile) throw new Error('Missing --event-file')
  const originalEvent = readJson(eventFile)
  const eventResult = await handleEvent(config, args)
  const sessionId = getSessionIdFromResult(eventResult)
  if (!sessionId) return eventResult

  const finalStatus = await pollSession(
    config,
    sessionId,
    Math.max(1000, Number(args['poll-interval-ms'] || 4000)),
    Math.max(30000, Number(args['poll-timeout-ms'] || 900000)),
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
  if (command === 'status') return await handleStatus(config, args)
  if (command === 'send-final') return await handleSendFinal(config, args)
  if (command === 'auto') return await handleAuto(config, args)

  throw new Error(`Unknown command: ${command}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
