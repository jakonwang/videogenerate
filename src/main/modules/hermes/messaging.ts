import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, normalize } from 'node:path'
import { promisify } from 'node:util'
import { hermesProfileDirectory, hermesRuntimeRoot } from './installation'

const execFileAsync = promisify(execFile)
const SUPPORTED_PLATFORMS = new Set(['feishu', 'wecom', 'weixin'])
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g
const DIRECT_SEND_PATTERNS = [
  /^\s*hermes\s+send\s+(?:--to\s+)?(feishu|wecom|weixin)\s+([\s\S]+?)\s*$/i,
  /^\s*(?:please\s+)?send\s+(?:a\s+)?message\s+(?:to|through)\s+(feishu|wecom|weixin)\s*[:\uFF1A]\s*([\s\S]+?)\s*$/i,
  /^\s*(?:\u8BF7|\u5E2E\u6211)?(?:\u7ED9|\u5411|\u901A\u8FC7)(?:\u6211\u7684)?(\u98DE\u4E66|\u4F01\u4E1A\u5FAE\u4FE1|\u5FAE\u4FE1)(?:\u7528\u6237|\u673A\u5668\u4EBA|\u8D26\u53F7)?(?:\u53D1\u9001|\u53D1)(?:\u4E00\u6761)?\u6D88\u606F\s*[:\uFF1A]\s*([\s\S]+?)\s*$/,
]
const ATTACHMENT_SEND_PATTERNS = [
  /\b(?:send|share|deliver)\b[\s\S]*\b(?:image|photo|file|attachment)\b[\s\S]*\b(?:feishu|wecom|weixin)\b/i,
  /\b(?:send|share|deliver)\b[\s\S]*\b(?:feishu|wecom|weixin)\b[\s\S]*\b(?:image|photo|file|attachment)\b/i,
  /(?:\u53D1\u9001|\u53D1\u7ED9|\u4F20\u7ED9|\u5206\u4EAB)[\s\S]*(?:\u56FE\u7247|\u56FE\u7247|\u7167\u7247|\u6587\u4EF6|\u9644\u4EF6)[\s\S]*(?:\u98DE\u4E66|\u4F01\u4E1A\u5FAE\u4FE1|\u5FAE\u4FE1)/,
  /(?:\u53D1\u9001|\u53D1\u7ED9|\u4F20\u7ED9|\u5206\u4EAB)[\s\S]*(?:\u98DE\u4E66|\u4F01\u4E1A\u5FAE\u4FE1|\u5FAE\u4FE1)[\s\S]*(?:\u56FE\u7247|\u56FE\u7247|\u7167\u7247|\u6587\u4EF6|\u9644\u4EF6)/,
]

export const hermesMessagingDeps = {
  execFile: execFileAsync,
}

function cleanOutput(value: string) {
  return String(value || '').replace(ANSI_PATTERN, '').trim()
}

function normalizePlatform(value: string) {
  const normalized = String(value || '').trim().toLowerCase()
  const platform = normalized === '\u98DE\u4E66'
    ? 'feishu'
    : normalized === '\u4F01\u4E1A\u5FAE\u4FE1'
      ? 'wecom'
      : normalized === '\u5FAE\u4FE1'
        ? 'weixin'
        : normalized
  if (!SUPPORTED_PLATFORMS.has(platform)) throw new Error('This messaging platform is not supported for application delivery.')
  return platform
}

function unquoteMessage(value: string) {
  const message = String(value || '').trim()
  if (message.length >= 2 && ((message.startsWith('"') && message.endsWith('"')) || (message.startsWith("'") && message.endsWith("'")))) {
    return message.slice(1, -1).trim()
  }
  return message
}

export function parseHermesMessagingSend(text: string) {
  const value = String(text || '')
  for (const pattern of DIRECT_SEND_PATTERNS) {
    const match = pattern.exec(value)
    if (!match) continue
    const message = unquoteMessage(match[2])
    if (!message) return undefined
    return { platform: normalizePlatform(match[1]), message }
  }
  return undefined
}

export function parseHermesMessagingAttachmentSend(text: string) {
  const value = String(text || '').trim()
  if (!value || !ATTACHMENT_SEND_PATTERNS.some((pattern) => pattern.test(value))) return undefined
  if (/\bfeishu\b/i.test(value) || value.includes('\u98DE\u4E66')) return { platform: 'feishu' }
  if (/\bwecom\b/i.test(value) || value.includes('\u4F01\u4E1A\u5FAE\u4FE1')) return { platform: 'wecom' }
  if (/\bweixin\b/i.test(value) || value.includes('\u5FAE\u4FE1')) return { platform: 'weixin' }
  return undefined
}

async function approvedRecipientIds(platform: string) {
  const path = join(hermesProfileDirectory(), 'pairing', `${platform}-approved.json`)
  if (!existsSync(path)) return []
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    return Object.keys(value).map((item) => item.trim()).filter(Boolean)
  } catch {
    return []
  }
}

async function resolveRecipient(platform: string, target?: string) {
  const explicit = String(target || '').trim()
  if (explicit) return explicit.replace(new RegExp(`^${platform}:`, 'i'), '')
  const approved = await approvedRecipientIds(platform)
  if (approved.length === 1) return approved[0]
  if (!approved.length) throw new Error(`No approved ${platform} recipient is available.`)
  throw new Error(`Multiple approved ${platform} recipients are available. Specify the recipient ID.`)
}

function normalizeMediaPaths(value: unknown) {
  const mediaPaths = (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => normalize(item))
  const uniquePaths = mediaPaths.filter((item, index) => mediaPaths.findIndex((candidate) => candidate.toLocaleLowerCase() === item.toLocaleLowerCase()) === index)
  if (uniquePaths.length > 8) throw new Error('A message can include at most 8 media files.')
  for (const mediaPath of uniquePaths) {
    if (/[\r\n]/.test(mediaPath)) throw new Error('Media file paths must not contain line breaks.')
    if (!isAbsolute(mediaPath)) throw new Error('Media files must use absolute local paths.')
    if (!existsSync(mediaPath)) throw new Error(`Media file not found: ${mediaPath}`)
  }
  return uniquePaths
}

export async function sendHermesMessage(input: { platform: string; message?: string; target?: string; mediaPaths?: string[] }) {
  const platform = normalizePlatform(input.platform)
  const message = String(input.message || '').trim()
  const mediaPaths = normalizeMediaPaths(input.mediaPaths)
  if (!message && !mediaPaths.length) throw new Error('A message or media file is required.')
  if (message.length > 10_000) throw new Error('The message must not exceed 10000 characters.')
  const recipient = await resolveRecipient(platform, input.target)
  if (/\s|[\r\n]/.test(recipient)) throw new Error('The messaging recipient ID is invalid.')

  const root = hermesRuntimeRoot()
  const executable = join(root, 'venv', 'Scripts', 'hermes.exe')
  if (!existsSync(executable)) throw new Error('The Hermes runtime is not installed.')
  try {
    const deliveryBody = [message, ...mediaPaths.map((mediaPath) => `MEDIA:${mediaPath}`)].filter(Boolean).join('\n')
    const result = await hermesMessagingDeps.execFile(executable, [
      'send',
      '--to',
      `${platform}:${recipient}`,
      '--json',
      deliveryBody,
    ], {
      cwd: root,
      env: {
        ...process.env,
        HERMES_HOME: hermesProfileDirectory(),
        HERMES_NONINTERACTIVE: '1',
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
      },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60_000,
    })
    const output = cleanOutput(`${result.stdout || ''}\n${result.stderr || ''}`)
    const detail = output ? JSON.parse(output) as Record<string, unknown> : {}
    if (detail.success !== true) throw new Error(String(detail.error || detail.message || 'Hermes did not confirm message delivery.'))
    return {
      success: true,
      platform,
      recipient,
      messageId: String(detail.message_id || ''),
      mediaCount: mediaPaths.length,
    }
  } catch (error) {
    const detail = error as Error & { stdout?: string; stderr?: string }
    const output = cleanOutput(`${detail.stderr || ''}\n${detail.stdout || ''}`)
    if (output) {
      try {
        const parsed = JSON.parse(output) as Record<string, unknown>
        throw new Error(String(parsed.error || parsed.message || output))
      } catch (parseError) {
        if (parseError instanceof SyntaxError) throw new Error(output)
        throw parseError
      }
    }
    throw new Error(cleanOutput(detail.message) || 'Hermes message delivery failed.')
  }
}
