import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, stat, writeFile } from 'node:fs/promises'
import type * as http from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { cloneRepo } from '../clone/repo'
import { cloneService } from '../clone/service'
import type { CloneProject, CloneProjectSummary, CloneRunMode } from '../clone/types'
import { analyzeProductStructureWithGrs } from '../clone/aiScriptAnalyzer'
import { generateChatCompletion } from '../clone/unifiedChat'
import { isDevelopmentEnv, isProductionEnv } from '../../lib/appEnv'
import { listAvailableSubtitleRenderFonts } from '../../lib/fontResolve'
import { getAppPaths } from '../../lib/paths'
import { webPlatformRepo } from './repo'
import { installWebPlatformAuthRuntime } from './authRuntime'
import { buildPluginDetail, buildPluginSummary, findPluginDefinition, pluginDefinitions } from './plugins'
import { geelarkPublisher } from './geelark'
import {
  enrichBatchSubtitleSourceItem,
  buildBatchSubtitlePublishCandidates,
  createBatchSubtitleJob,
  exportBatchSubtitleJobWithCapcut,
  generateBatchSubtitleTitles,
  generateBatchSubtitleViralTitles,
  listBatchSubtitleOutputs,
  normalizeBatchSubtitleJob,
  pauseBatchSubtitleJob,
  previewBatchSubtitleFrame,
  pushBatchSubtitleOutputsToGeelarkPool,
  reflowBatchSubtitleJob,
  resumeBatchSubtitleJob,
  runBatchSubtitleJob,
  transcribeBatchSubtitleJob,
  updateBatchSubtitleDraft,
} from './batchSubtitle'
import { sendSmsCode } from './sms'
import type {
  BillingAction,
  BillingOrder,
  BillingPaymentProvider,
  BillingOrderType,
  CloneModelIdentitySummary,
  GeelarkClonePublishCandidate,
  GeelarkMusicPreset,
  GeelarkPluginConfigPayload,
  PluginDetail,
  SubscriptionPlan,
  UserSubscription,
  WalletAccount,
  WalletTransaction,
  WebAuthCodeRecord,
  WebAuthSendCodeInput,
  WebAuthLoginInput,
  WebUploadFileInput,
  WebUploadPurpose,
} from './types'

function now() {
  return Date.now()
}

function normalizePhone(input: string) {
  return String(input || '').replace(/\D+/g, '')
}

function defaultDevCode() {
  return String(process.env.VG_DEV_LOGIN_CODE || '123456').trim()
}

function isLiveAuthEnv() {
  return !isDevelopmentEnv()
}

function sendCodeCooldownMs() {
  return 60 * 1000
}

function buildPaymentReference(provider: BillingPaymentProvider) {
  return `${provider}_${randomUUID().replace(/-/g, '')}`
}

function assertSmsCodeClean(record: WebAuthCodeRecord | null, code: string) {
  const normalized = String(code || '').trim()
  if (!normalized) throw new Error('验证码不能为空')
  if (!record) {
    throw new Error(isDevelopmentEnv() ? `请先发送验证码，开发环境默认验证码为 ${defaultDevCode()}` : '请先发送验证码')
  }
  if (Number(record.expiresAt || 0) <= now()) {
    throw new Error('验证码已过期，请重新发送')
  }
  if (normalized !== String(record.code || '').trim()) {
    throw new Error(isDevelopmentEnv() ? `验证码错误，当前开发环境默认验证码为 ${defaultDevCode()}` : '验证码错误')
  }
}

function assertPhonePresent(phone: string) {
  if (!phone) throw new Error('手机号不能为空')
}

function assertSendCodeCooldown(updatedAt?: number) {
  const retryAfterMs = Number(updatedAt || 0) + sendCodeCooldownMs() - now()
  if (retryAfterMs > 0) {
    throw new Error(`验证码发送过于频繁，请 ${Math.ceil(retryAfterMs / 1000)} 秒后重试`)
  }
}

function buildSendCodeMessage() {
  return isLiveAuthEnv() ? '验证码已发送，请查收短信' : '开发环境验证码已生成，可直接使用'
}

async function authByTokenClean(token: string) {
  const session = await webPlatformRepo.getSession(String(token || '').trim())
  if (!session) throw new Error('登录已失效')
  if (session.expiresAt <= now()) {
    await webPlatformRepo.removeSession(session.token)
    throw new Error('登录已过期')
  }
  const user = await webPlatformRepo.getUserById(session.userId)
  if (!user || user.status !== 'active') throw new Error('账号不可用')
  return {
    user,
    session,
    subscription: await ensureSubscription(user.id),
    wallet: await ensureWallet(user.id),
  }
}

function assertSmsCode(record: WebAuthCodeRecord | null, code: string) {
  const normalized = String(code || '').trim()
  if (!normalized) throw new Error('验证码不能为空')
  if (!record) {
    throw new Error(isDevelopmentEnv() ? `请先发送验证码，开发环境默认验证码为 ${defaultDevCode()}` : '请先发送验证码')
  }
  if (Number(record.expiresAt || 0) <= now()) {
    throw new Error('验证码已过期，请重新发送')
  }
  if (normalized !== String(record.code || '').trim()) {
    throw new Error(isDevelopmentEnv() ? `验证码错误，当前开发环境默认验证码为 ${defaultDevCode()}` : '验证码错误')
  }
}

function sanitizeUploadName(input: string) {
  return String(input || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '-')
}

function inferUploadExtension(fileName: string, mimeType?: string, purpose?: WebUploadPurpose) {
  const direct = extname(String(fileName || '').trim())
  if (direct) return direct.toLowerCase()
  const mime = String(mimeType || '').toLowerCase()
  if (mime.includes('png')) return '.png'
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg'
  if (mime.includes('webp')) return '.webp'
  if (mime.includes('gif')) return '.gif'
  if (mime.includes('mp4')) return '.mp4'
  if (mime.includes('quicktime')) return '.mov'
  if (mime.includes('webm')) return '.webm'
  return purpose === 'clone_reference_video' ? '.mp4' : '.png'
}

function mediaCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  }
}

function mediaMimeType(filePath: string) {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.webm')) return 'video/webm'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  if (lower.endsWith('.mkv')) return 'video/x-matroska'
  return 'application/octet-stream'
}

async function assertFileReadableSafe(filePath: string) {
  await access(filePath)
  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) throw new Error('媒体文件不存在')
  return fileStat
}

async function persistUploadedAssetSafe(input: {
  userId: string
  cloneProjectId?: string
  purpose: WebUploadPurpose
  file: WebUploadFileInput
}) {
  const raw = String(input.file.base64Data || '').trim()
  if (!raw) throw new Error('上传文件内容不能为空')
  const cleanBase64 = raw.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(cleanBase64, 'base64')
  if (!buffer.length) throw new Error('上传文件内容无效')
  const ext = inferUploadExtension(input.file.fileName, input.file.mimeType, input.purpose)
  const fileName = `${Date.now()}-${randomUUID()}${ext}`
  const root = join(
    getAppPaths().dataDir,
    'web-uploads',
    input.userId,
    input.cloneProjectId || 'shared',
    input.purpose,
  )
  await mkdir(root, { recursive: true })
  const outputPath = join(root, sanitizeUploadName(fileName))
  await writeFile(outputPath, buffer)
  return {
    filePath: outputPath,
    fileName: sanitizeUploadName(String(input.file.fileName || '').trim()) || fileName,
    mimeType: input.file.mimeType,
    size: buffer.length,
  }
}

async function assertFileReadable(filePath: string) {
  await access(filePath)
  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) throw new Error('媒体文件不存在')
  return fileStat
}

async function persistUploadedAsset(input: {
  userId: string
  cloneProjectId?: string
  purpose: WebUploadPurpose
  file: WebUploadFileInput
}) {
  const raw = String(input.file.base64Data || '').trim()
  if (!raw) throw new Error('上传文件内容不能为空')
  const cleanBase64 = raw.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(cleanBase64, 'base64')
  if (!buffer.length) throw new Error('上传文件内容无效')
  const ext = inferUploadExtension(input.file.fileName, input.file.mimeType, input.purpose)
  const fileName = `${Date.now()}-${randomUUID()}${ext}`
  const root = join(
    getAppPaths().dataDir,
    'web-uploads',
    input.userId,
    input.cloneProjectId || 'shared',
    input.purpose,
  )
  await mkdir(root, { recursive: true })
  const outputPath = join(root, sanitizeUploadName(fileName))
  await writeFile(outputPath, buffer)
  return {
    filePath: outputPath,
    fileName: sanitizeUploadName(String(input.file.fileName || '').trim()) || fileName,
    mimeType: input.file.mimeType,
    size: buffer.length,
  }
}

async function ensureWallet(userId: string): Promise<WalletAccount> {
  const current = await webPlatformRepo.getWallet(userId)
  if (current) return current
  return await webPlatformRepo.upsertWallet({
    userId,
    balanceCredits: 0,
    totalChargedCredits: 0,
    totalRefundedCredits: 0,
    updatedAt: now(),
  })
}

async function ensureSubscription(userId: string): Promise<UserSubscription> {
  const current = await webPlatformRepo.getSubscription(userId)
  if (current) return current
  return await webPlatformRepo.upsertSubscription({
    userId,
    planId: 'free',
    planName: '免费版',
    status: 'inactive',
    updatedAt: now(),
  })
}

async function appendWalletTransaction(input: Omit<WalletTransaction, 'id' | 'createdAt'>) {
  return await webPlatformRepo.appendWalletTransaction({
    id: randomUUID(),
    createdAt: now(),
    ...input,
  })
}

async function chargeCredits(input: {
  userId: string
  action: BillingAction
  note: string
  relatedProjectId?: string
}) {
  const wallet = await ensureWallet(input.userId)
  const rule = await webPlatformRepo.getComputeRule(input.action)
  const amount = Number(rule?.credits || 0)
  if (amount <= 0) {
    return {
      chargedCredits: 0,
      wallet,
    }
  }
  if (wallet.balanceCredits < amount) {
    throw new Error(`算力点不足，当前余额 ${wallet.balanceCredits}，需要 ${amount}`)
  }
  const nextWallet = await webPlatformRepo.upsertWallet({
    ...wallet,
    balanceCredits: wallet.balanceCredits - amount,
    totalChargedCredits: wallet.totalChargedCredits + amount,
  })
  await appendWalletTransaction({
    userId: input.userId,
    type: 'compute_charge',
    amountCredits: -amount,
    balanceAfter: nextWallet.balanceCredits,
    note: input.note,
    relatedProjectId: input.relatedProjectId,
    relatedAction: input.action,
  })
  return {
    chargedCredits: amount,
    wallet: nextWallet,
  }
}

async function patchProjectOwnership(project: CloneProject, input: { userId: string; planId?: string; estimatedCost?: number; actualCost?: number; deductionStatus?: CloneProject['deductionStatus']; billingStatus?: CloneProject['billingStatus'] }) {
  project.userId = input.userId
  project.subscriptionPlanId = input.planId ?? project.subscriptionPlanId
  project.billingStatus = input.billingStatus ?? project.billingStatus ?? 'pending'
  if (typeof input.estimatedCost === 'number') project.estimatedCost = input.estimatedCost
  if (typeof input.actualCost === 'number') project.actualCost = input.actualCost
  project.deductionStatus = input.deductionStatus ?? project.deductionStatus ?? 'none'
  project.assetStorageProvider = project.assetStorageProvider ?? 'local_fs'
  return await cloneRepo.upsertProject(project)
}

async function assertProjectOwnership(projectId: string, userId: string) {
  const project = await cloneRepo.getProject(projectId)
  if (!project) throw new Error('复刻项目不存在')
  if (project.userId && project.userId !== userId) throw new Error('无权访问该任务')
  return project
}

function isProjectAccessibleToUser(project: { userId?: string | null }, userId: string) {
  const ownerId = String(project.userId || '').trim()
  return !ownerId || ownerId === userId
}

async function ensureGeelarkPluginRecord(userId: string, runtimeState: 'enabled' | 'disabled' = 'enabled') {
  const current = await webPlatformRepo.ensurePluginRecord(userId, 'geelark-publisher')
  if (current.status === 'installed' && current.runtimeState === runtimeState) return current
  return await webPlatformRepo.upsertPluginRecord({
    ...current,
    status: 'installed',
    runtimeState,
    installedAt: current.installedAt || Date.now(),
    updatedAt: Date.now(),
  })
}

function buildPublishTitlePrompt(input: {
  title: string
  referenceVideoName?: string
  productTitle?: string
  productId?: string
}) {
  const parts = [
    '你是一个短视频电商发布助手。',
    '请为即将发布到 TikTok 的视频生成 3 个中文标题候选。',
    '要求：每条 18 到 40 个中文字符；避免夸张违规承诺；更像真实电商短视频标题；不要加编号；每行一条。',
    `项目标题：${input.title}`,
    input.referenceVideoName ? `参考视频文件名：${input.referenceVideoName}` : '',
    input.productTitle ? `商品展示标题：${input.productTitle}` : '',
    input.productId ? `商品ID：${input.productId}` : '',
  ]
  return parts.filter(Boolean).join('\n')
}

function buildPublishTitlePromptByLanguage(input: {
  title: string
  contentLanguage?: string
  referenceVideoName?: string
  productTitle?: string
  productId?: string
}) {
  const language = String(input.contentLanguage || 'zh-CN').trim()
  const languageLabel =
    language === 'en-US'
      ? 'English'
      : language === 'vi-VN'
        ? 'Vietnamese'
        : language === 'th-TH'
          ? 'Thai'
          : language === 'id-ID'
            ? 'Indonesian'
            : language === 'ms-MY'
              ? 'Malay'
              : 'Simplified Chinese'
  const requirementLine =
    language === 'en-US'
      ? 'Generate 3 natural TikTok ecommerce title candidates in English. No numbering, no explanation, one title per line.'
      : language === 'vi-VN'
        ? 'Generate 3 natural TikTok ecommerce title candidates in Vietnamese. No numbering, no explanation, one title per line.'
        : language === 'th-TH'
          ? 'Generate 3 natural TikTok ecommerce title candidates in Thai. No numbering, no explanation, one title per line.'
          : language === 'id-ID'
            ? 'Generate 3 natural TikTok ecommerce title candidates in Indonesian. No numbering, no explanation, one title per line.'
            : language === 'ms-MY'
              ? 'Generate 3 natural TikTok ecommerce title candidates in Malay. No numbering, no explanation, one title per line.'
              : '生成 3 个适合 TikTok 电商发布的简体中文标题候选。不要编号，不要解释，每行一条。'

  return [
    'You are a TikTok ecommerce publishing assistant.',
    `Output language: ${languageLabel}.`,
    requirementLine,
    `Project title: ${input.title}`,
    input.referenceVideoName ? `Reference video: ${input.referenceVideoName}` : '',
    input.productTitle ? `Product title: ${input.productTitle}` : '',
    input.productId ? `Product ID: ${input.productId}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function parseTitleCandidates(raw: string) {
  return String(raw || '')
    .split(/\r?\n/)
    .map((item) => item.replace(/^[\-\d.\s、]+/, '').trim())
    .filter(Boolean)
    .slice(0, 3)
}

function buildPublishTitlePromptByLanguageV2(input: {
  title: string
  contentLanguage?: string
  referenceVideoName?: string
  productTitle?: string
  productId?: string
  productReferenceContext?: string
}) {
  const language = String(input.contentLanguage || 'zh-CN').trim()
  const languageLabel =
    language === 'en-US'
      ? 'English'
      : language === 'vi-VN'
        ? 'Vietnamese'
        : language === 'th-TH'
          ? 'Thai'
          : language === 'id-ID'
            ? 'Indonesian'
            : language === 'ms-MY'
              ? 'Malay'
              : 'Simplified Chinese'
  const requirementLine =
    language === 'en-US'
      ? 'Generate 3 natural TikTok ecommerce title candidates in English. No numbering, no explanation, one title per line.'
      : language === 'vi-VN'
        ? 'Generate 3 natural TikTok ecommerce title candidates in Vietnamese. No numbering, no explanation, one title per line.'
        : language === 'th-TH'
          ? 'Generate 3 natural TikTok ecommerce title candidates in Thai. No numbering, no explanation, one title per line.'
          : language === 'id-ID'
            ? 'Generate 3 natural TikTok ecommerce title candidates in Indonesian. No numbering, no explanation, one title per line.'
            : language === 'ms-MY'
              ? 'Generate 3 natural TikTok ecommerce title candidates in Malay. No numbering, no explanation, one title per line.'
              : 'Generate 3 natural TikTok ecommerce title candidates in Simplified Chinese. No numbering, no explanation, one title per line.'

  return [
    'You are a TikTok ecommerce publishing assistant.',
    `Output language: ${languageLabel}.`,
    requirementLine,
    'The title must stay tightly aligned with the actual product shown in the product reference images.',
    'Avoid generic viral-copy language that does not describe the product itself.',
    `Project title: ${input.title}`,
    input.referenceVideoName ? `Reference video: ${input.referenceVideoName}` : '',
    input.productTitle ? `Product title: ${input.productTitle}` : '',
    input.productId ? `Product ID: ${input.productId}` : '',
    input.productReferenceContext ? `Product image context: ${input.productReferenceContext}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function normalizePublishLanguageLocale(contentLanguage?: string): 'zh-CN' | 'vi-VN' {
  return String(contentLanguage || '').trim() === 'vi-VN' ? 'vi-VN' : 'zh-CN'
}

function collectProjectProductReferenceImagePaths(project: CloneProject, extraPaths?: string[]) {
  return Array.from(
    new Set(
      [
        ...(extraPaths ?? []),
        ...(project.blueprint?.consistencyAssets?.productReferenceImages ?? []),
        ...(project.baseBlueprint?.consistencyAssets?.productReferenceImages ?? []),
        ...(project.blueprint?.shots?.flatMap((shot) => shot.productReferenceImagePaths ?? []) ?? []),
        ...(project.baseBlueprint?.shots?.flatMap((shot) => shot.productReferenceImagePaths ?? []) ?? []),
      ]
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, 6)
}

function buildProductReferenceContextV2(input: {
  productReferenceImagePaths?: string[]
  productAnalysis?: {
    category?: string
    summary?: string
    coreSubject?: string
    connectionStructure?: string
    materialDetails?: string
    wearingPosition?: string
    surfaceDetails?: string
    colorDetails?: string
    geometryDetails?: string
    sizeScale?: string
    matchingRules?: string[]
  } | null
}) {
  const refs = (input.productReferenceImagePaths ?? []).map((item) => String(item || '').trim()).filter(Boolean)
  const analysis = input.productAnalysis
  const fileHints = refs
    .slice(0, 3)
    .map((item) => item.split(/[\\/]/).filter(Boolean).at(-1) || item)
    .filter(Boolean)
  return [
    `image_count=${refs.length}`,
    analysis?.category ? `category=${String(analysis.category).trim()}` : '',
    analysis?.summary ? `summary=${String(analysis.summary).trim()}` : '',
    analysis?.coreSubject ? `core_subject=${String(analysis.coreSubject).trim()}` : '',
    analysis?.connectionStructure ? `connection=${String(analysis.connectionStructure).trim()}` : '',
    analysis?.materialDetails ? `material=${String(analysis.materialDetails).trim()}` : '',
    analysis?.wearingPosition ? `position=${String(analysis.wearingPosition).trim()}` : '',
    analysis?.surfaceDetails ? `surface=${String(analysis.surfaceDetails).trim()}` : '',
    analysis?.colorDetails ? `color=${String(analysis.colorDetails).trim()}` : '',
    analysis?.geometryDetails ? `geometry=${String(analysis.geometryDetails).trim()}` : '',
    analysis?.sizeScale ? `size=${String(analysis.sizeScale).trim()}` : '',
    Array.isArray(analysis?.matchingRules) && analysis.matchingRules.length
      ? `rules=${analysis.matchingRules.slice(0, 4).map((item) => String(item || '').trim()).filter(Boolean).join(' | ')}`
      : '',
    fileHints.length ? `files=${fileHints.join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('; ')
}

async function buildPublishTitleProductReferenceContext(input: {
  project: CloneProject
  contentLanguage?: string
  productReferenceImagePaths?: string[]
}) {
  const refs = collectProjectProductReferenceImagePaths(input.project, input.productReferenceImagePaths)
  if (!refs.length) return ''
  const existingAnalysis =
    input.project.blueprint?.consistencyAssets?.productAnalysis ??
    input.project.baseBlueprint?.consistencyAssets?.productAnalysis ??
    null
  if (existingAnalysis) {
    return buildProductReferenceContextV2({
      productReferenceImagePaths: refs,
      productAnalysis: existingAnalysis,
    })
  }

  const credentials = await cloneRepo.getCredentials()
  if (String(credentials.grsaiApiKey || '').trim()) {
    try {
      const analyzed = await analyzeProductStructureWithGrs({
        credentials,
        productReferenceImagePaths: refs,
        productCategory: String(input.project.baseBlueprint?.productCategory || input.project.blueprint?.productCategory || 'general'),
        locale: normalizePublishLanguageLocale(input.contentLanguage),
      })
      return buildProductReferenceContextV2({
        productReferenceImagePaths: refs,
        productAnalysis: analyzed,
      })
    } catch {
      // Fall through to filename-based fallback when image analysis is unavailable.
    }
  }

  return buildProductReferenceContextV2({
    productReferenceImagePaths: refs,
    productAnalysis: null,
  })
}

export const webPlatformService = {
  async sendLoginCode(input: WebAuthSendCodeInput) {
    const phone = normalizePhone(input.phone)
    if (!phone) throw new Error('手机号不能为空')
    const existing = await webPlatformRepo.getLoginCode(phone)
    const cooldownMs = sendCodeCooldownMs()
    const retryAfterMs = Number(existing?.updatedAt || 0) + cooldownMs - now()
    if (retryAfterMs > 0) {
      throw new Error(`验证码发送过于频繁，请 ${Math.ceil(retryAfterMs / 1000)} 秒后重试`)
    }
    if (!phone) throw new Error('手机号不能为空')
    const code = isLiveAuthEnv()
      ? String(Math.floor(100000 + Math.random() * 900000))
      : defaultDevCode()
    const expiresAt = now() + 5 * 60 * 1000
    await webPlatformRepo.saveLoginCode({
      phone,
      code,
      channel: input.channel === 'sms' ? 'sms' : 'sms',
      expiresAt,
    })
    const smsResult = await sendSmsCode({ phone, code })
    return {
      ok: true as const,
      message: isLiveAuthEnv() ? '验证码已发送，请查收短信' : '开发环境验证码已生成，可直接使用',
      provider: smsResult.provider,
      devCode: isLiveAuthEnv() ? undefined : code,
      expiresInSec: 300,
    }
    return {
      ok: true as const,
      message: isProductionEnv() ? '验证码已发送，请查收短信' : '开发环境验证码已生成，可直接使用',
      devCode: isProductionEnv() ? undefined : code,
      expiresInSec: 300,
    }
  },

  async login(input: WebAuthLoginInput) {
    const phone = normalizePhone(input.phone)
    if (!phone) throw new Error('手机号不能为空')
    const loginCode = await webPlatformRepo.getLoginCode(phone)
    assertSmsCodeClean(loginCode, input.code)
    await webPlatformRepo.removeLoginCode(phone)
    const existing = await webPlatformRepo.getUserByPhone(phone)
    const user =
      existing ??
      (await webPlatformRepo.createUser({
        phone,
        displayName: input.displayName,
      }))
    const subscription = await ensureSubscription(user.id)
    const wallet = await ensureWallet(user.id)
    const session = await webPlatformRepo.createSession({
      userId: user.id,
      expiresAt: now() + 30 * 24 * 60 * 60 * 1000,
    })
    return {
      token: session.token,
      user,
      subscription,
      wallet,
    }
  },

  async logout(token: string) {
    await webPlatformRepo.removeSession(String(token || '').trim())
    return { ok: true as const }
  },

  async authByToken(token: string) {
    const session = await webPlatformRepo.getSession(String(token || '').trim())
    if (!session) throw new Error('登录已失效')
    if (session.expiresAt <= now()) {
      await webPlatformRepo.removeSession(session.token)
      throw new Error('登录已过期')
    }
    const user = await webPlatformRepo.getUserById(session.userId)
    if (!user || user.status !== 'active') throw new Error('账号不可用')
    return {
      user,
      session,
      subscription: await ensureSubscription(user.id),
      wallet: await ensureWallet(user.id),
    }
  },

  async getProfile(token: string) {
    const auth = await this.authByToken(token)
    return {
      user: auth.user,
      subscription: auth.subscription,
      wallet: auth.wallet,
    }
  },

  async listPlans() {
    return await webPlatformRepo.listSubscriptionPlans()
  },

  async listBillingOrders(token: string) {
    const auth = await this.authByToken(token)
    return await webPlatformRepo.listOrders(auth.user.id)
  },

  async listWalletTransactions(token: string) {
    const auth = await this.authByToken(token)
    return await webPlatformRepo.listWalletTransactions(auth.user.id)
  },

  async createOrder(input: {
    token: string
    type: BillingOrderType
    planId?: string
    paymentChannel?: BillingPaymentProvider
    credits?: number
  }) {
    const auth = await this.authByToken(input.token)
    const paymentChannel = input.paymentChannel ?? 'wechat_native'
    let amountCny = 0
    let credits = 0
    let plan: SubscriptionPlan | null = null
    if (input.type === 'subscription') {
      plan = input.planId ? await webPlatformRepo.getSubscriptionPlan(input.planId) : null
      if (!plan) throw new Error('会员套餐不存在')
      amountCny = plan.priceCny
    } else {
      credits = Math.max(10, Math.floor(Number(input.credits || 0)))
      amountCny = Math.ceil(credits * 0.35)
    }
    const createdAt = now()
    const order: BillingOrder = {
      id: randomUUID(),
      userId: auth.user.id,
      type: input.type,
      planId: plan?.id,
      planName: plan?.name,
      amountCny,
      credits: input.type === 'compute_pack' ? credits : undefined,
      paymentChannel,
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
      paymentReference: buildPaymentReference(paymentChannel),
    }
    await webPlatformRepo.createOrder(order)
    return {
      order,
      payment: {
        provider: paymentChannel,
        payUrl: `/payments/${paymentChannel}/pay?orderId=${order.id}`,
        qrText: `videogen://${paymentChannel}/pay/${order.id}`,
        reference: String(order.paymentReference || ''),
      },
    }
  },

  async payOrder(orderId: string, input?: { paymentReference?: string }) {
    const order = await webPlatformRepo.getOrder(orderId)
    if (!order) throw new Error('订单不存在')
    if (order.status === 'paid') return { order }
    if (input?.paymentReference && order.paymentReference && input.paymentReference !== order.paymentReference) {
      throw new Error('支付回调凭证不匹配')
    }
    order.status = 'paid'
    order.paidAt = now()
    const savedOrder = await webPlatformRepo.upsertOrder(order)
    const wallet = await ensureWallet(order.userId)

    if (order.type === 'subscription') {
      const plan = order.planId ? await webPlatformRepo.getSubscriptionPlan(order.planId) : null
      if (!plan) throw new Error('会员套餐不存在')
      const startedAt = now()
      const nextSubscription = await webPlatformRepo.upsertSubscription({
        userId: order.userId,
        planId: plan.id,
        planName: plan.name,
        status: 'active',
        startedAt,
        expiresAt: startedAt + plan.durationDays * 24 * 60 * 60 * 1000,
        updatedAt: startedAt,
      })
      const nextWallet = await webPlatformRepo.upsertWallet({
        ...wallet,
        balanceCredits: wallet.balanceCredits + plan.monthlyComputeCredits,
      })
      await appendWalletTransaction({
        userId: order.userId,
        type: 'subscription_purchase',
        amountCredits: plan.monthlyComputeCredits,
        balanceAfter: nextWallet.balanceCredits,
        note: `购买会员：${plan.name}`,
        relatedOrderId: order.id,
      })
      return {
        order: savedOrder,
        subscription: nextSubscription,
        wallet: nextWallet,
      }
    }

    const rechargeCredits = Math.max(0, Number(order.credits || 0))
    const nextWallet = await webPlatformRepo.upsertWallet({
      ...wallet,
      balanceCredits: wallet.balanceCredits + rechargeCredits,
    })
    await appendWalletTransaction({
      userId: order.userId,
      type: 'topup',
      amountCredits: rechargeCredits,
      balanceAfter: nextWallet.balanceCredits,
      note: `充值算力包 ${rechargeCredits} 点`,
      relatedOrderId: order.id,
    })
    return {
      order: savedOrder,
      wallet: nextWallet,
    }
  },

  async listMyCloneProjects(token: string) {
    const auth = await this.authByToken(token)
    const rows = await cloneService.listProjectSummaries()
    const projects = await cloneRepo.listProjects()
    const ownedIds = new Set(projects.filter((item) => isProjectAccessibleToUser(item, auth.user.id)).map((item) => item.id))
    return rows.filter((item) => ownedIds.has(item.id))
  },

  async createCloneProject(
    token: string,
    input?: { title?: string; description?: string; locale?: 'vi-VN' | 'zh-CN'; runMode?: CloneRunMode },
  ) {
    const auth = await this.authByToken(token)
    const res = await cloneService.createDraftProject({
      locale: input?.locale ?? 'zh-CN',
      strength: 'structure',
      title: input?.title,
      description: input?.description,
      runMode: input?.runMode,
    })
    const saved = await patchProjectOwnership(res.project, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      billingStatus: 'not_required',
      deductionStatus: 'none',
    })
    return {
      project: saved,
      summary: res.summary,
    }
  },

  async uploadCloneAsset(
    token: string,
    input: {
      cloneProjectId?: string
      purpose: WebUploadPurpose
      file: WebUploadFileInput
    },
  ) {
    const auth = await this.authByToken(token)
    if (input.cloneProjectId) {
      await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    }
    const saved = await persistUploadedAssetSafe({
      userId: auth.user.id,
      cloneProjectId: input.cloneProjectId,
      purpose: input.purpose,
      file: input.file,
    })
    return {
      asset: {
        purpose: input.purpose,
        filePath: saved.filePath,
        fileName: saved.fileName,
        mimeType: saved.mimeType,
        size: saved.size,
      },
    }
  },

  async getCloneProject(token: string, cloneProjectId: string) {
    const auth = await this.authByToken(token)
    return await assertProjectOwnership(cloneProjectId, auth.user.id)
  },

  async listCloneProjectSummaries(token: string): Promise<CloneProjectSummary[]> {
    const auth = await this.authByToken(token)
    const projects = await cloneRepo.listProjects()
    const owned = projects.filter((item) => isProjectAccessibleToUser(item, auth.user.id))
    const summaries = await cloneService.listProjectSummaries()
    return summaries.filter((summary) => owned.some((project) => project.id === summary.id))
  },

  async listPlugins(token: string) {
    const auth = await this.authByToken(token)
    const records = await webPlatformRepo.listPluginRecords(auth.user.id)
    return pluginDefinitions.map((definition) => {
      const record = records.find((item) => item.pluginId === definition.id) ?? {
        pluginId: definition.id,
        userId: auth.user.id,
        status: 'uninstalled' as const,
        runtimeState: 'disabled' as const,
        config: {},
        updatedAt: Date.now(),
      }
      return buildPluginSummary(definition, record)
    })
  },

  async listInstalledPlugins(token: string) {
    const plugins = await this.listPlugins(token)
    return plugins.filter((item) => item.status === 'installed')
  },

  async getPlugin(token: string, pluginId: string): Promise<PluginDetail> {
    const auth = await this.authByToken(token)
    const definition = findPluginDefinition(pluginId)
    if (!definition) throw new Error('插件不存在')
    const record = await webPlatformRepo.ensurePluginRecord(auth.user.id, pluginId)
    return buildPluginDetail(definition, record)
  },

  async installPlugin(token: string, pluginId: string) {
    const auth = await this.authByToken(token)
    const definition = findPluginDefinition(pluginId)
    if (!definition) throw new Error('插件不存在')
    const current = await webPlatformRepo.ensurePluginRecord(auth.user.id, pluginId)
    const next = await webPlatformRepo.upsertPluginRecord({
      ...current,
      status: 'installed',
      installedAt: current.installedAt || Date.now(),
    })
    return buildPluginDetail(definition, next)
  },

  async uninstallPlugin(token: string, pluginId: string) {
    const auth = await this.authByToken(token)
    const definition = findPluginDefinition(pluginId)
    if (!definition) throw new Error('插件不存在')
    const current = await webPlatformRepo.ensurePluginRecord(auth.user.id, pluginId)
    const next = await webPlatformRepo.upsertPluginRecord({
      ...current,
      status: 'uninstalled',
      runtimeState: 'disabled',
    })
    return buildPluginDetail(definition, next)
  },

  async enablePlugin(token: string, pluginId: string) {
    const auth = await this.authByToken(token)
    const definition = findPluginDefinition(pluginId)
    if (!definition) throw new Error('插件不存在')
    const current = await webPlatformRepo.ensurePluginRecord(auth.user.id, pluginId)
    if (current.status !== 'installed') throw new Error('请先安装插件后再启用')
    const next = await webPlatformRepo.upsertPluginRecord({
      ...current,
      runtimeState: 'enabled',
    })
    return buildPluginDetail(definition, next)
  },

  async disablePlugin(token: string, pluginId: string) {
    const auth = await this.authByToken(token)
    const definition = findPluginDefinition(pluginId)
    if (!definition) throw new Error('插件不存在')
    const current = await webPlatformRepo.ensurePluginRecord(auth.user.id, pluginId)
    if (current.status !== 'installed') throw new Error('当前插件尚未安装')
    const next = await webPlatformRepo.upsertPluginRecord({
      ...current,
      runtimeState: 'disabled',
    })
    return buildPluginDetail(definition, next)
  },

  async setPluginConfig(token: string, pluginId: string, input: Record<string, unknown>) {
    const auth = await this.authByToken(token)
    const definition = findPluginDefinition(pluginId)
    if (!definition) throw new Error('插件不存在')
    const current = await webPlatformRepo.ensurePluginRecord(auth.user.id, pluginId)
    const next = await webPlatformRepo.upsertPluginRecord({
      ...current,
      config: {
        ...(current.config || {}),
        ...(input || {}),
      },
    })
    return buildPluginDetail(definition, next)
  },

  async getGeelarkPluginConfig(token: string) {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    return await geelarkPublisher.getConfig(auth.user.id)
  },

  async setGeelarkPluginConfig(token: string, input: GeelarkPluginConfigPayload) {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    return await geelarkPublisher.setConfig(auth.user.id, input)
  },

  async listGeelarkCloudPhones(token: string) {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    return await geelarkPublisher.listCloudPhones(auth.user.id)
  },

  async listGeelarkPublisherAccounts(token: string) {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    return await geelarkPublisher.listAccounts(auth.user.id)
  },

  async listGeelarkPublishCandidates(token: string): Promise<GeelarkClonePublishCandidate[]> {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    const projects = await cloneRepo.listProjects()
    const ownedIds = new Set(projects.filter((item) => isProjectAccessibleToUser(item, auth.user.id)).map((item) => item.id))
    const owned = (await cloneService.listProjectSummaries()).filter((item) => ownedIds.has(item.id))
    const tasks = await geelarkPublisher.listTasks(auth.user.id)
    const candidates = geelarkPublisher.buildPublishCandidates(owned, tasks)
    const subtitleCandidates = await buildBatchSubtitlePublishCandidates(auth.user.id)
    const merged = [...subtitleCandidates, ...candidates].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    return merged.filter((item) => item.publishedStatus !== 'published')
  },

  async listGeelarkMusicPresets(token: string): Promise<GeelarkMusicPreset[]> {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    return await geelarkPublisher.listMusicPresets(auth.user.id)
  },

  async upsertGeelarkMusicPreset(
    token: string,
    input: { id?: string; label: string; refVideoId: string; remark?: string },
  ) {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    return await geelarkPublisher.upsertMusicPreset(auth.user.id, input)
  },

  async deleteGeelarkMusicPreset(token: string, id: string) {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    await geelarkPublisher.deleteMusicPreset(auth.user.id, id)
    return { ok: true as const }
  },

  async generateGeelarkPublishTitles(
    token: string,
    input: {
      cloneProjectId: string
      contentLanguage?: string
      productTitle?: string
      productId?: string
      productReferenceImagePaths?: string[]
    },
  ) {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const credentials = await cloneRepo.getCredentials()
    const productReferenceContext = await buildPublishTitleProductReferenceContext({
      project,
      contentLanguage: input.contentLanguage,
      productReferenceImagePaths: input.productReferenceImagePaths,
    })
    const result = await generateChatCompletion({
      credentials,
      system: '请仅输出标题候选，每行一条，不要解释。',
      prompt: buildPublishTitlePromptByLanguageV2({
        title: String(project.title || project.id || '').trim(),
        contentLanguage: typeof input.contentLanguage === 'string' ? input.contentLanguage : undefined,
        referenceVideoName: String(project.referenceVideoName || '').trim() || undefined,
        productTitle: typeof input.productTitle === 'string' ? input.productTitle : undefined,
        productId: typeof input.productId === 'string' ? input.productId : undefined,
        productReferenceContext: productReferenceContext || undefined,
      }),
    })
    const candidates = parseTitleCandidates(result.content)
    return {
      candidates,
      content: result.content,
      provider: result.provider,
      model: result.model,
    }
  },

  async upsertGeelarkPublisherAccount(
    token: string,
    input: {
      id?: string
      name: string
      geelarkAccountId?: string
      cloudPhoneId: string
      cloudPhoneName: string
      remark?: string
      status?: 'active' | 'disabled'
    },
  ) {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    return await geelarkPublisher.upsertAccount(auth.user.id, input)
  },

  async deleteGeelarkPublisherAccount(token: string, id: string) {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    await geelarkPublisher.deleteAccount(auth.user.id, id)
    return { ok: true as const }
  },

  async publishGeelarkVideo(
    token: string,
    input: {
      cloneProjectId?: string
      videoPath: string
      publishAccountId: string
      videoDesc?: string
      productId?: string
      productTitle?: string
      refVideoId?: string
      sameVideoVolume?: number
      sourceVideoVolume?: number
      markAI?: boolean
      musicMode?: 'library_ref' | 'manual_ref' | 'volume_only'
      musicLabel?: string
      scheduleAt?: number
      needShareLink?: boolean
    },
  ) {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'geelark-publisher')
    if (pluginRecord.status !== 'installed') throw new Error('请先安装 Geelark 插件')
    if (pluginRecord.runtimeState !== 'enabled') throw new Error('请先启用 Geelark 插件')
    if (input.cloneProjectId) {
      await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    }
    return await geelarkPublisher.publish(auth.user.id, input)
  },

  async listGeelarkPublishTasks(token: string) {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    return await geelarkPublisher.listTasks(auth.user.id)
  },

  async getGeelarkPublishTask(token: string, id: string) {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    const item = await geelarkPublisher.getTask(auth.user.id, id)
    if (!item) throw new Error('发布记录不存在')
    return item
  },

  async syncGeelarkPublishTask(token: string, id: string) {
    const auth = await this.authByToken(token)
    await ensureGeelarkPluginRecord(auth.user.id, 'enabled')
    return await geelarkPublisher.syncTask(auth.user.id, id)
  },

  async listBatchSubtitleJobs(token: string) {
    const auth = await this.authByToken(token)
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'video-batch-subtitle')
    if (pluginRecord.status !== 'installed') throw new Error('请先安装视频批量加字幕插件')
    return (await webPlatformRepo.listBatchSubtitleJobs(auth.user.id)).map((item) => normalizeBatchSubtitleJob(item))
  },

  async createBatchSubtitleJob(
    token: string,
    input: {
      name: string
      sourceItems: Array<{
        id?: string
        sourceType: 'upload' | 'clone_final'
        sourceVideoPath: string
        sourceProjectId?: string
        sourceProjectTitle?: string
        fileName?: string
        coverImagePath?: string
        durationSec?: number
        width?: number
        height?: number
      }>
      subtitleMode?: 'static_title' | 'timed_caption' | 'hybrid'
      subtitleSource?: 'whisper_compatible' | 'manual'
      exportEngine?: 'capcut_mate' | 'ass_fallback'
      titleRenderMode?: 'overlay_image' | 'ass_text'
      titleConfig?: Record<string, unknown>
      titleItems?: Array<{ sourceItemId: string; text: string; updatedAt?: number }>
      titleStyleMode?: 'default' | 'vn_tiktok_viral'
      viralTitleConfig?: {
        language?: 'vi' | 'en' | 'zh'
        tone?: 'hook' | 'conversion' | 'emotional'
        sellingPoints?: string
        symbolIntensity?: 'low' | 'medium' | 'high'
        generationMode?: 'video_content'
      }
      titleAnalysisItems?: Array<{
        sourceItemId: string
        summary: string
        subject?: string
        action?: string
        scene?: string
        durationSec?: number
        updatedAt?: number
      }>
      overlayImageConfig?: Record<string, unknown>
      styleConfig?: Record<string, unknown>
      captionStyle?: Record<string, unknown>
      layoutPolicy?: Record<string, unknown>
    },
  ) {
    const auth = await this.authByToken(token)
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'video-batch-subtitle')
    if (pluginRecord.status !== 'installed') throw new Error('请先安装视频批量加字幕插件')
    const sourceItems = await Promise.all(
      (input.sourceItems || []).map(async (item) => {
        return await enrichBatchSubtitleSourceItem({
          id: String(item.id || randomUUID()),
          sourceType: item.sourceType,
          sourceVideoPath: String(item.sourceVideoPath || '').trim(),
          sourceProjectId: typeof item.sourceProjectId === 'string' ? item.sourceProjectId : undefined,
          sourceProjectTitle: typeof item.sourceProjectTitle === 'string' ? item.sourceProjectTitle : undefined,
          fileName: typeof item.fileName === 'string' ? item.fileName : undefined,
          coverImagePath: typeof item.coverImagePath === 'string' ? item.coverImagePath : undefined,
          durationSec: typeof item.durationSec === 'number' ? item.durationSec : undefined,
          width: typeof item.width === 'number' ? item.width : undefined,
          height: typeof item.height === 'number' ? item.height : undefined,
        })
      }),
    )
    return await createBatchSubtitleJob({
      userId: auth.user.id,
      name: input.name,
      sourceItems,
      subtitleMode: input.subtitleMode,
      subtitleSource: input.subtitleSource,
      exportEngine: input.exportEngine,
      titleRenderMode: input.titleRenderMode,
      titleConfig: input.titleConfig as any,
      titleItems: input.titleItems as any,
      titleStyleMode: input.titleStyleMode,
      viralTitleConfig: input.viralTitleConfig as any,
      titleAnalysisItems: input.titleAnalysisItems as any,
      overlayImageConfig: input.overlayImageConfig as any,
      styleConfig: input.styleConfig as any,
      captionStyle: input.captionStyle as any,
      layoutPolicy: input.layoutPolicy as any,
    })
  },

  async updateBatchSubtitleDraft(
    token: string,
    input: {
      jobId: string
      patch: {
        name?: string
        sourceItems?: any[]
        subtitleMode?: 'static_title' | 'timed_caption' | 'hybrid'
        subtitleSource?: 'whisper_compatible' | 'manual'
        exportEngine?: 'capcut_mate' | 'ass_fallback'
        titleConfig?: Record<string, unknown>
        titleItems?: Array<{ sourceItemId: string; text: string; updatedAt?: number }>
        titleStyleMode?: 'default' | 'vn_tiktok_viral'
        viralTitleConfig?: {
          language?: 'vi' | 'en' | 'zh'
          tone?: 'hook' | 'conversion' | 'emotional'
          sellingPoints?: string
          symbolIntensity?: 'low' | 'medium' | 'high'
          generationMode?: 'video_content'
        }
        titleAnalysisItems?: Array<{
          sourceItemId: string
          summary: string
          subject?: string
          action?: string
          scene?: string
          durationSec?: number
          updatedAt?: number
        }>
        styleConfig?: Record<string, unknown>
        captionStyle?: Record<string, unknown>
        layoutPolicy?: Record<string, unknown>
        subtitleTracks?: any[]
        capcutDraft?: any
      }
    },
  ) {
    const auth = await this.authByToken(token)
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'video-batch-subtitle')
    if (pluginRecord.status !== 'installed') throw new Error('请先安装视频批量加字幕插件')
    return await updateBatchSubtitleDraft({
      userId: auth.user.id,
      jobId: input.jobId,
      patch: input.patch as any,
    })
  },

  async reflowBatchSubtitleJob(
    token: string,
    input: {
      jobId: string
      sourceItemId?: string
    },
  ) {
    const auth = await this.authByToken(token)
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'video-batch-subtitle')
    if (pluginRecord.status !== 'installed') throw new Error('?????????????')
    return await reflowBatchSubtitleJob({
      userId: auth.user.id,
      jobId: input.jobId,
      sourceItemId: input.sourceItemId,
    })
  },

  async runBatchSubtitleJob(token: string, input: { jobId: string }) {
    const auth = await this.authByToken(token)
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'video-batch-subtitle')
    if (pluginRecord.status !== 'installed') throw new Error('请先安装视频批量加字幕插件')
    return await runBatchSubtitleJob({
      userId: auth.user.id,
      jobId: input.jobId,
    })
  },

  async pauseBatchSubtitleJob(token: string, input: { jobId: string }) {
    const auth = await this.authByToken(token)
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'video-batch-subtitle')
    if (pluginRecord.status !== 'installed') throw new Error('请先安装视频批量加字幕插件')
    return await pauseBatchSubtitleJob({
      userId: auth.user.id,
      jobId: input.jobId,
    })
  },

  async resumeBatchSubtitleJob(token: string, input: { jobId: string; retryFailedOnly?: boolean }) {
    const auth = await this.authByToken(token)
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'video-batch-subtitle')
    if (pluginRecord.status !== 'installed') throw new Error('请先安装视频批量加字幕插件')
    return await resumeBatchSubtitleJob({
      userId: auth.user.id,
      jobId: input.jobId,
      retryFailedOnly: input.retryFailedOnly === true,
    })
  },

  async transcribeBatchSubtitleJob(token: string, input: { jobId: string; sourceItemId?: string }) {
    const auth = await this.authByToken(token)
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'video-batch-subtitle')
    if (pluginRecord.status !== 'installed') throw new Error('?????????????')
    return await transcribeBatchSubtitleJob({
      userId: auth.user.id,
      jobId: input.jobId,
      sourceItemId: input.sourceItemId,
    })
  },

  async exportBatchSubtitleJobWithCapcut(token: string, input: { jobId: string }) {
    const auth = await this.authByToken(token)
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'video-batch-subtitle')
    if (pluginRecord.status !== 'installed') throw new Error('?????????????')
    return await exportBatchSubtitleJobWithCapcut({
      userId: auth.user.id,
      jobId: input.jobId,
    })
  },

  async listBatchSubtitleOutputs(token: string) {
    const auth = await this.authByToken(token)
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'video-batch-subtitle')
    if (pluginRecord.status !== 'installed') throw new Error('请先安装视频批量加字幕插件')
    return await listBatchSubtitleOutputs(auth.user.id)
  },

  async previewBatchSubtitleFrame(
    token: string,
    input: {
      sourceItem: any
      titleConfig?: Record<string, unknown>
      titleItems?: Array<{ sourceItemId: string; text: string; updatedAt?: number }>
      titleRenderMode?: 'overlay_image' | 'ass_text'
      overlayImageConfig?: Record<string, unknown>
      styleConfig?: Record<string, unknown>
      subtitleMode?: 'static_title' | 'timed_caption' | 'hybrid'
      captionStyle?: Record<string, unknown>
      layoutPolicy?: Record<string, unknown>
      subtitleTrack?: any
      previewAtSec?: number
      includeVideo?: boolean
    },
  ) {
    const auth = await this.authByToken(token)
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'video-batch-subtitle')
    if (pluginRecord.status !== 'installed') throw new Error('?????????????')
    return await previewBatchSubtitleFrame({
      userId: auth.user.id,
      sourceItem: input.sourceItem,
      subtitleMode: input.subtitleMode as any,
      titleConfig: input.titleConfig as any,
      titleItems: input.titleItems as any,
      titleRenderMode: input.titleRenderMode as any,
      overlayImageConfig: input.overlayImageConfig as any,
      styleConfig: input.styleConfig as any,
      captionStyle: input.captionStyle as any,
      layoutPolicy: input.layoutPolicy as any,
      subtitleTrack: input.subtitleTrack as any,
      previewAtSec: input.previewAtSec,
      includeVideo: input.includeVideo,
    })
  },

  async pushBatchSubtitleOutputsToGeelarkPool(token: string, input: { jobId: string }) {
    const auth = await this.authByToken(token)
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'video-batch-subtitle')
    if (pluginRecord.status !== 'installed') throw new Error('请先安装视频批量加字幕插件')
    return await pushBatchSubtitleOutputsToGeelarkPool({
      userId: auth.user.id,
      jobId: input.jobId,
    })
  },

  async generateBatchSubtitleTitles(
    token: string,
    input: {
      prompt: string
      count?: number
      contentLanguage?: string
    },
  ) {
    const auth = await this.authByToken(token)
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'video-batch-subtitle')
    if (pluginRecord.status !== 'installed') throw new Error('请先安装视频批量加字幕插件')
    return await generateBatchSubtitleTitles({
      userId: auth.user.id,
      prompt: input.prompt,
      count: input.count,
      contentLanguage: input.contentLanguage,
    })
  },

  async generateBatchSubtitleViralTitles(
    token: string,
    input: {
      jobId?: string
      sourceItems: Array<{
        id?: string
        sourceType: 'upload' | 'clone_final'
        sourceVideoPath: string
        sourceProjectId?: string
        sourceProjectTitle?: string
        fileName?: string
        coverImagePath?: string
        durationSec?: number
        width?: number
        height?: number
      }>
      language?: 'vi' | 'en' | 'zh'
      tone?: 'hook' | 'conversion' | 'emotional'
      sellingPoints?: string
      symbolIntensity?: 'low' | 'medium' | 'high'
    },
  ) {
    const auth = await this.authByToken(token)
    const pluginRecord = await webPlatformRepo.ensurePluginRecord(auth.user.id, 'video-batch-subtitle')
    if (pluginRecord.status !== 'installed') throw new Error('请先安装视频批量加字幕插件')
    return await generateBatchSubtitleViralTitles({
      userId: auth.user.id,
      jobId: input.jobId,
      sourceItems: input.sourceItems as any,
      language: input.language,
      tone: input.tone,
      sellingPoints: input.sellingPoints,
      symbolIntensity: input.symbolIntensity,
    })
  },

  async removeCloneProject(token: string, cloneProjectId: string) {
    const auth = await this.authByToken(token)
    await assertProjectOwnership(cloneProjectId, auth.user.id)
    return await cloneService.removeProject({ cloneProjectId })
  },

  async analyzeReference(token: string, input: { cloneProjectId: string; videoPath: string; locale?: 'vi-VN' | 'zh-CN' }) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const billing = await chargeCredits({
      userId: auth.user.id,
      action: 'analyze_reference',
      relatedProjectId: project.id,
      note: '分析参考视频',
    })
    const result = await cloneService.createCloneBlueprintFromReference({
      cloneProjectId: project.id,
      videoPath: input.videoPath,
      locale: input.locale ?? 'zh-CN',
      strength: 'structure',
    })
    if (result?.project) {
      await patchProjectOwnership(result.project, {
        userId: auth.user.id,
        planId: auth.subscription.planId,
        actualCost: billing.chargedCredits,
        estimatedCost: billing.chargedCredits,
        billingStatus: 'paid',
        deductionStatus: billing.chargedCredits > 0 ? 'charged' : 'none',
      })
    }
    return result
  },

  async uploadCloneReferenceVideo(
    token: string,
    input: { cloneProjectId: string; file: WebUploadFileInput },
  ) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const uploaded = await persistUploadedAssetSafe({
      userId: auth.user.id,
      cloneProjectId: input.cloneProjectId,
      purpose: 'clone_reference_video',
      file: input.file,
    })
    const saved = await patchProjectOwnership(
      await cloneRepo.upsertProject({
        ...project,
        referenceVideoPath: uploaded.filePath,
        referenceVideoName: uploaded.fileName,
        assetStorageProvider: 'web_object_storage',
      }),
      {
        userId: auth.user.id,
        planId: auth.subscription.planId,
        actualCost: project.actualCost || 0,
        billingStatus: project.billingStatus || 'not_required',
        deductionStatus: project.deductionStatus || 'none',
      },
    )
    return {
      project: saved,
      asset: {
        purpose: 'clone_reference_video' as const,
        filePath: uploaded.filePath,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
      },
    }
  },

  async generateScriptVariants(token: string, input: { cloneProjectId: string; variantCount: number }) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const billing = await chargeCredits({
      userId: auth.user.id,
      action: 'generate_script_variants',
      relatedProjectId: project.id,
      note: '生成脚本变体',
    })
    const result = await cloneService.generateScriptVariantsForProject(input)
    if (result?.project) {
      await patchProjectOwnership(result.project, {
        userId: auth.user.id,
        planId: auth.subscription.planId,
        actualCost: (result.project.actualCost || 0) + billing.chargedCredits,
        billingStatus: 'paid',
        deductionStatus: billing.chargedCredits > 0 ? 'charged' : 'none',
      })
    }
    return result
  },

  async selectScriptVariant(token: string, input: { cloneProjectId: string; variantId: string }) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const result = await cloneService.selectScriptVariantForProject(input)
    if (result?.project) {
      await patchProjectOwnership(result.project, {
        userId: auth.user.id,
        planId: auth.subscription.planId,
        actualCost: result.project.actualCost || project.actualCost || 0,
        billingStatus: 'paid',
        deductionStatus: result.project.deductionStatus || project.deductionStatus || 'none',
      })
    }
    return result
  },

  async saveCloneProjectProductImages(
    token: string,
    input: { cloneProjectId: string; productReferenceImagePaths?: string[] },
  ) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const result = await cloneService.saveProjectProductImages(input)
    await patchProjectOwnership(result, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      actualCost: result.actualCost || project.actualCost || 0,
      billingStatus: result.billingStatus || project.billingStatus || 'not_required',
      deductionStatus: result.deductionStatus || project.deductionStatus || 'none',
    })
    return result
  },

  async uploadCloneProductImages(
    token: string,
    input: { cloneProjectId: string; files: WebUploadFileInput[] },
  ) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const uploads = await Promise.all(
      (input.files || []).map((file) =>
        persistUploadedAssetSafe({
          userId: auth.user.id,
          cloneProjectId: input.cloneProjectId,
          purpose: 'clone_product_image',
          file,
        }),
      ),
    )
    const existingPaths = Array.isArray((project as any).productReferenceImagePaths)
      ? ((project as any).productReferenceImagePaths as string[])
      : []
    const nextPaths = Array.from(new Set([...existingPaths, ...uploads.map((item) => item.filePath)]))
    const result = await cloneService.saveProjectProductImages({
      cloneProjectId: input.cloneProjectId,
      productReferenceImagePaths: nextPaths,
    })
    const saved = await patchProjectOwnership(result, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      actualCost: result.actualCost || project.actualCost || 0,
      billingStatus: result.billingStatus || project.billingStatus || 'not_required',
      deductionStatus: result.deductionStatus || project.deductionStatus || 'none',
    })
    return {
      project: saved,
      assets: uploads.map((item) => ({
        purpose: 'clone_product_image' as const,
        filePath: item.filePath,
        fileName: item.fileName,
        mimeType: item.mimeType,
        size: item.size,
      })),
    }
  },

  async selectCloneProjectModelIdentity(
    token: string,
    input: { cloneProjectId: string; identityId: string },
  ) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const result = await cloneService.selectProjectModelIdentity(input)
    await patchProjectOwnership(result, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      actualCost: result.actualCost || project.actualCost || 0,
      billingStatus: result.billingStatus || project.billingStatus || 'not_required',
      deductionStatus: result.deductionStatus || project.deductionStatus || 'none',
    })
    return result
  },

  async listCloneModelIdentities(token: string): Promise<CloneModelIdentitySummary[]> {
    const auth = await this.authByToken(token)
    void auth
    const items = await cloneService.listModelIdentityLibrary()
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      productType: item.productType,
      coverImagePath: item.coverImagePath,
      imagePaths: item.imagePaths,
      description: item.description,
      updatedAt: item.updatedAt,
    }))
  },

  async getCloneModelCredentials(token: string) {
    const auth = await this.authByToken(token)
    void auth
    return await cloneRepo.getCredentials()
  },

  async setCloneModelCredentials(
    token: string,
    input: import('../clone/types').ModelCredentials,
  ) {
    const auth = await this.authByToken(token)
    void auth
    await cloneRepo.setCredentials(input)
    return await cloneRepo.getCredentials()
  },

  async createCloneModelIdentity(
    token: string,
    input: {
      cloneProjectId: string
      productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
      productPoints?: string
      modelProfileOptions?: import('../../../shared/modelProfileOptions').ModelProfileOptions
      productReferenceImagePaths?: string[]
      imageProviderPrimary?: 'openai' | 'kling' | 'grsai' | 'apifox_hub'
      openaiApiKey?: string
      openaiImageModel?: string
      openaiImageQuality?: 'low' | 'medium' | 'high'
      grsaiApiKey?: string
      grsaiHost?: string
      grsaiImageModel?: string
      apifoxHub?: {
        enabled?: boolean
        baseUrl?: string
        apiKey?: string
        imageModel?: string
      }
    },
  ) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const currentCredentials = await cloneRepo.getCredentials()

    const result = (await cloneService.generateModelIdentityPack({
      cloneProjectId: input.cloneProjectId,
      productType: input.productType,
      productPoints: input.productPoints,
      modelProfileOptions: input.modelProfileOptions,
      productReferenceImagePaths: (input.productReferenceImagePaths ?? []).map(String).filter(Boolean),
      imageProviderPrimary: input.imageProviderPrimary,
      openaiApiKey: input.openaiApiKey,
      openaiImageModel: input.openaiImageModel,
      openaiImageQuality: input.openaiImageQuality,
      grsaiApiKey: input.grsaiApiKey,
      grsaiHost: input.grsaiHost,
      grsaiImageModel: input.grsaiImageModel,
      imageProviderCredentials: input.apifoxHub
        ? {
            apifoxHub: {
              enabled: input.apifoxHub.enabled ?? currentCredentials.apifoxHub?.enabled ?? true,
              baseUrl: input.apifoxHub.baseUrl ?? currentCredentials.apifoxHub?.baseUrl ?? '',
              apiKey: input.apifoxHub.apiKey ?? currentCredentials.apifoxHub?.apiKey,
              chatProvider: currentCredentials.apifoxHub?.chatProvider ?? 'openai',
              chatModel: currentCredentials.apifoxHub?.chatModel ?? 'gpt-4.1-mini',
              chatEndpointStyle: currentCredentials.apifoxHub?.chatEndpointStyle ?? 'openai_chat',
              imageProvider: currentCredentials.apifoxHub?.imageProvider ?? 'openai',
              imageModel: input.apifoxHub.imageModel ?? currentCredentials.apifoxHub?.imageModel ?? 'gpt-image-1',
              imageEditModel: currentCredentials.apifoxHub?.imageEditModel,
              imageEndpointStyle: currentCredentials.apifoxHub?.imageEndpointStyle ?? 'openai_images',
              videoProvider: currentCredentials.apifoxHub?.videoProvider ?? 'veo',
              textToVideoModel: currentCredentials.apifoxHub?.textToVideoModel ?? 'veo_3_1-lite',
              imageToVideoModel: currentCredentials.apifoxHub?.imageToVideoModel ?? 'veo_3_1-lite',
              startEndVideoModel: currentCredentials.apifoxHub?.startEndVideoModel ?? 'veo_3_1-lite',
              referenceVideoModel: currentCredentials.apifoxHub?.referenceVideoModel ?? 'veo_3_1-lite',
              videoEndpointStyle: currentCredentials.apifoxHub?.videoEndpointStyle ?? 'official_rest',
              defaultPollIntervalMs: currentCredentials.apifoxHub?.defaultPollIntervalMs ?? 2000,
              defaultTimeoutMs: currentCredentials.apifoxHub?.defaultTimeoutMs ?? 600000,
            },
          }
        : undefined,
    })) as CloneProject

    const saved = await patchProjectOwnership(result, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      actualCost: result.actualCost || project.actualCost || 0,
      billingStatus: result.billingStatus || project.billingStatus || 'not_required',
      deductionStatus: result.deductionStatus || project.deductionStatus || 'none',
    })

    const modelId = String(saved.selectedModelIdentityId || '').trim()
    const model = modelId ? await cloneRepo.getModelIdentity(modelId) : null

    return {
      project: {
        id: saved.id,
        selectedModelIdentityId: modelId || undefined,
      },
      model: model
        ? {
            id: model.id,
            name: model.name,
            status: model.status,
            productType: model.productType,
            coverImagePath: model.coverImagePath,
            imagePaths: model.imagePaths,
            description: model.description,
            updatedAt: model.updatedAt,
          }
        : undefined,
    }
  },

  async generateStoryboardImages(
    token: string,
    input: {
      cloneProjectId: string
      productReferenceImagePaths?: string[]
      selectedModelIdentityId?: string
      shotIds?: string[]
      onlyMissing?: boolean
    },
  ) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const shouldBatchQueryOnly = input.onlyMissing === true || (Array.isArray(input.shotIds) && input.shotIds.length > 0)
    const billing = await chargeCredits({
      userId: auth.user.id,
      action: 'generate_storyboard_images',
      relatedProjectId: project.id,
      note: '生成分镜图片',
    })
    const result = shouldBatchQueryOnly
      ? await cloneService.batchQueryStoryboardImages({
          cloneProjectId: input.cloneProjectId,
          shotIds: input.shotIds,
          productReferenceImagePaths: input.productReferenceImagePaths,
        })
      : await cloneService.generateStoryboardGridsForProject(input)
    if (result?.project) {
      await patchProjectOwnership(result.project, {
        userId: auth.user.id,
        planId: auth.subscription.planId,
        actualCost: (result.project.actualCost || 0) + billing.chargedCredits,
        billingStatus: 'paid',
        deductionStatus: billing.chargedCredits > 0 ? 'charged' : 'none',
      })
    }
    return result
  },

  async regenerateStoryboardImage(
    token: string,
    input: { cloneProjectId: string; shotId: string; productReferenceImagePaths?: string[] },
  ) {
    console.log('[web-platform-debug] regenerate-storyboard-image:requested', {
      cloneProjectId: input.cloneProjectId,
      shotId: input.shotId,
      hasToken: Boolean(String(token || '').trim()),
      productReferenceImageCount: input.productReferenceImagePaths?.length ?? 0,
    })
    const auth = await this.authByToken(token)
    console.log('[web-platform-debug] regenerate-storyboard-image:authed', {
      cloneProjectId: input.cloneProjectId,
      shotId: input.shotId,
      userId: auth.user.id,
    })
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    console.log('[web-platform-debug] regenerate-storyboard-image:ownership-confirmed', {
      cloneProjectId: input.cloneProjectId,
      shotId: input.shotId,
      projectId: project.id,
    })
    const billing = await chargeCredits({
      userId: auth.user.id,
      action: 'generate_storyboard_images',
      relatedProjectId: project.id,
      note: '重生成单镜分镜图片',
    })
    const result = await cloneService.generateGptShotFrames({
      cloneProjectId: input.cloneProjectId,
      shotId: input.shotId,
      which: 'both',
      productReferenceImagePaths: input.productReferenceImagePaths,
    })
    console.log('[web-platform-debug] regenerate-storyboard-image:clone-service-returned', {
      cloneProjectId: input.cloneProjectId,
      shotId: input.shotId,
      resultProjectId: result.id,
    })
    const saved = await patchProjectOwnership(result, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      actualCost: (result.actualCost || project.actualCost || 0) + billing.chargedCredits,
      billingStatus: 'paid',
      deductionStatus: billing.chargedCredits > 0 ? 'charged' : 'none',
    })
    return { project: saved }
  },

  async updateCloneShot(
    token: string,
    input: {
      cloneProjectId: string
      shotId: string
      locked?: boolean
      scriptText?: string
      narrationText?: string
      onScreenText?: string
      visualDescription?: string
      actionDescription?: string
      cameraDescription?: string
      durationSec?: number
      cameraMovement?: string
      subtitleSuggestion?: string
      materialNeed?: string
      order?: number
    },
  ) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const result = await cloneService.updateShotEnhanced(input)
    const saved = await patchProjectOwnership(result, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      actualCost: result.actualCost || project.actualCost || 0,
      billingStatus: result.billingStatus || project.billingStatus || 'not_required',
      deductionStatus: result.deductionStatus || project.deductionStatus || 'none',
    })
    return { project: saved }
  },

  async updateCloneProjectStage(
    token: string,
    input: { cloneProjectId: string; currentStep: NonNullable<CloneProject['workflowV2']>['currentStep'] },
  ) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const result = await cloneService.updateProjectWorkflowStep({
      cloneProjectId: project.id,
      currentStep: input.currentStep,
    })
    const saved = await patchProjectOwnership(result, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      actualCost: result.actualCost || project.actualCost || 0,
      billingStatus: result.billingStatus || project.billingStatus || 'not_required',
      deductionStatus: result.deductionStatus || project.deductionStatus || 'none',
    })
    return { project: saved }
  },

  async updateCloneProjectMeta(
    token: string,
    input: { cloneProjectId: string; title?: string; description?: string },
  ) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const result = await cloneService.updateProjectMeta({
      cloneProjectId: project.id,
      title: input.title,
      description: input.description,
    })
    if (result?.project) {
      await patchProjectOwnership(result.project, {
        userId: auth.user.id,
        planId: auth.subscription.planId,
        actualCost: result.project.actualCost || project.actualCost || 0,
        billingStatus: result.project.billingStatus || project.billingStatus || 'not_required',
        deductionStatus: result.project.deductionStatus || project.deductionStatus || 'none',
      })
    }
    return result
  },

  async reorderCloneShots(token: string, input: { cloneProjectId: string; shotIds: string[] }) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const result = await cloneService.reorderProjectShots(input)
    const saved = await patchProjectOwnership(result, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      actualCost: result.actualCost || project.actualCost || 0,
      billingStatus: result.billingStatus || project.billingStatus || 'not_required',
      deductionStatus: result.deductionStatus || project.deductionStatus || 'none',
    })
    return { project: saved }
  },

  async createCloneShot(token: string, input: { cloneProjectId: string; afterShotId?: string }) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const result = await cloneService.createProjectShot(input)
    const saved = await patchProjectOwnership(result, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      actualCost: result.actualCost || project.actualCost || 0,
      billingStatus: result.billingStatus || project.billingStatus || 'not_required',
      deductionStatus: result.deductionStatus || project.deductionStatus || 'none',
    })
    return { project: saved }
  },

  async removeCloneShot(token: string, input: { cloneProjectId: string; shotId: string }) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const result = await cloneService.removeProjectShot(input)
    const saved = await patchProjectOwnership(result, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      actualCost: result.actualCost || project.actualCost || 0,
      billingStatus: result.billingStatus || project.billingStatus || 'not_required',
      deductionStatus: result.deductionStatus || project.deductionStatus || 'none',
    })
    return { project: saved }
  },

  async generateShotVideos(token: string, input: { cloneProjectId: string }) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const billing = await chargeCredits({
      userId: auth.user.id,
      action: 'generate_shot_videos',
      relatedProjectId: project.id,
      note: '生成分镜视频',
    })
    const result = await cloneService.generateShotVideosFromStoryboardFrames(input)
    if (result?.project) {
      await patchProjectOwnership(result.project, {
        userId: auth.user.id,
        planId: auth.subscription.planId,
        actualCost: (result.project.actualCost || 0) + billing.chargedCredits,
        billingStatus: 'paid',
        deductionStatus: billing.chargedCredits > 0 ? 'charged' : 'none',
      })
    }
    return result
  },

  async syncCloneShotVideoTask(token: string, input: { cloneProjectId: string; shotId: string }) {
    const auth = await this.authByToken(token)
    await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    return await cloneService.syncShotVideoTask(input)
  },

  async regenerateCloneShotVideo(token: string, input: { cloneProjectId: string; shotId: string }) {
    console.log('[web-platform-debug] regenerate-clone-shot-video:requested', {
      cloneProjectId: input.cloneProjectId,
      shotId: input.shotId,
      hasToken: Boolean(String(token || '').trim()),
    })
    const auth = await this.authByToken(token)
    console.log('[web-platform-debug] regenerate-clone-shot-video:authed', {
      cloneProjectId: input.cloneProjectId,
      shotId: input.shotId,
      userId: auth.user.id,
    })
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    console.log('[web-platform-debug] regenerate-clone-shot-video:ownership-confirmed', {
      cloneProjectId: input.cloneProjectId,
      shotId: input.shotId,
      projectId: project.id,
      ownerUserId: auth.user.id,
    })
    const result = (await cloneService.generateShotClip({
      cloneProjectId: input.cloneProjectId,
      shotId: input.shotId,
      forceRegenerate: true,
    })) as CloneProject
    console.log('[web-platform-debug] regenerate-clone-shot-video:clone-service-returned', {
      cloneProjectId: input.cloneProjectId,
      shotId: input.shotId,
      resultProjectId: result.id,
    })
    const saved = await patchProjectOwnership(result, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      actualCost: result.actualCost || project.actualCost || 0,
      billingStatus: result.billingStatus || project.billingStatus || 'paid',
      deductionStatus: result.deductionStatus || project.deductionStatus || 'none',
    })
    console.log('[web-platform-debug] regenerate-clone-shot-video:completed', {
      cloneProjectId: input.cloneProjectId,
      shotId: input.shotId,
      savedProjectId: saved.id,
    })
    console.log('[web-platform-debug] regenerate-storyboard-image:completed', {
      cloneProjectId: input.cloneProjectId,
      shotId: input.shotId,
      savedProjectId: saved.id,
    })
    return { project: saved }
  },

  async getCloneShotConsistencyReport(token: string, input: { cloneProjectId: string; shotId: string }) {
    const auth = await this.authByToken(token)
    await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    return await cloneService.getShotConsistencyReport(input)
  },

  async getCloneShotImagePromptPreview(token: string, input: { cloneProjectId: string; shotId: string }) {
    const auth = await this.authByToken(token)
    await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    return await cloneService.getShotImagePromptPreview(input)
  },

  async recompileCloneShotConsistency(token: string, input: { cloneProjectId: string; shotId: string }) {
    const auth = await this.authByToken(token)
    await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    return await cloneService.recompileShotConsistency(input)
  },

  async listCloneShotConsistencyAnchors(token: string, input: { cloneProjectId: string; shotId: string }) {
    const auth = await this.authByToken(token)
    await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    return await cloneService.listShotConsistencyAnchors(input)
  },

  async listCloneShotConsistencyPatches(token: string, input: { cloneProjectId: string; shotId: string }) {
    const auth = await this.authByToken(token)
    await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    return await cloneService.listShotConsistencyPatches(input)
  },

  async composeFinalVideo(token: string, input: { cloneProjectId: string; outputDir?: string }) {
    const auth = await this.authByToken(token)
    await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const directResult = await cloneService.composeCloneFinalVideo(input)
    if (directResult?.project) {
      await patchProjectOwnership(directResult.project, {
        userId: auth.user.id,
        planId: auth.subscription.planId,
        actualCost: directResult.project.actualCost || 0,
        billingStatus: directResult.project.billingStatus || 'pending',
        deductionStatus: directResult.project.deductionStatus || 'none',
      })
    }
    return directResult
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const billing = await chargeCredits({
      userId: auth.user.id,
      action: 'compose_final_video',
      relatedProjectId: project.id,
      note: '合成最终成片',
    })
    const result = await cloneService.composeCloneFinalVideo(input)
    if (result?.project) {
      await patchProjectOwnership(result.project, {
        userId: auth.user.id,
        planId: auth.subscription.planId,
        actualCost: (result.project.actualCost || 0) + billing.chargedCredits,
        billingStatus: 'paid',
        deductionStatus: billing.chargedCredits > 0 ? 'charged' : 'none',
      })
    }
    return result
  },


  async streamMediaFile(token: string, filePath: string, req: http.IncomingMessage, res: http.ServerResponse) {
    const auth = await this.authByToken(token)
    const normalized = String(filePath || '').trim()
    if (!normalized) throw new Error('媒体路径不能为空')

    const resolved = resolve(normalized)
    const dataDir = resolve(getAppPaths().dataDir)
    const uploadsRoot = resolve(join(dataDir, 'web-uploads', auth.user.id))
    const cloneRoot = resolve(join(dataDir, 'viral-clone'))
    const outputRoot = resolve(join(dataDir, 'outputs'))
    const isAllowed = [uploadsRoot, cloneRoot, outputRoot].some((root) => {
      const withSep = `${root}${sep}`
      return resolved === root || resolved.startsWith(withSep)
    })
    if (!isAllowed) throw new Error('无权访问该媒体文件')

    const info = await assertFileReadableSafe(resolved)
    const size = info.size
    const mimeType = mediaMimeType(resolved)
    const range = req.headers.range

    if (req.method === 'OPTIONS') {
      res.writeHead(204, mediaCorsHeaders())
      res.end()
      return
    }

    if (range) {
      const parts = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (parts) {
        let start = parts[1] ? parseInt(parts[1], 10) : 0
        let end = parts[2] ? parseInt(parts[2], 10) : size - 1
        if (Number.isNaN(start)) start = 0
        if (Number.isNaN(end) || end >= size) end = size - 1
        if (start > end || start >= size) {
          res.writeHead(416, { ...mediaCorsHeaders(), 'Content-Range': `bytes */${size}` }).end()
          return
        }
        res.writeHead(206, {
          ...mediaCorsHeaders(),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
          'Content-Type': mimeType,
        })
        createReadStream(resolved, { start, end }).on('error', () => res.destroy()).pipe(res)
        return
      }
    }

    res.writeHead(200, {
      ...mediaCorsHeaders(),
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
      'Content-Type': mimeType,
    })
    createReadStream(resolved).on('error', () => res.destroy()).pipe(res)
  },

  async getCloneRuntime(token: string, cloneProjectId: string) {
    const auth = await this.authByToken(token)
    await assertProjectOwnership(cloneProjectId, auth.user.id)
    const pipeline = await cloneService.getClonePipelineStatus({ cloneProjectId })
    const wallet = await ensureWallet(auth.user.id)
    const transactions = await webPlatformRepo.listWalletTransactions(auth.user.id)
    return {
      pipeline,
      wallet,
      recentBillingLogs: transactions.slice(0, 20),
    }
  },
}

async function ensureSubscriptionSafe(userId: string): Promise<UserSubscription> {
  const current = await webPlatformRepo.getSubscription(userId)
  if (current) return current
  return await webPlatformRepo.upsertSubscription({
    userId,
    planId: 'free',
    planName: '免费版',
    status: 'inactive',
    updatedAt: now(),
  })
}

// Runtime overrides for auth endpoints are installed from a clean UTF-8 module.
// The legacy methods above contain historical mojibake text and are intentionally bypassed.
installWebPlatformAuthRuntime(webPlatformService, {
  now,
  normalizePhone,
  defaultDevCode,
  isDevelopmentEnv,
  isLiveAuthEnv,
  sendCodeCooldownMs,
  ensureSubscription: ensureSubscriptionSafe,
  ensureWallet,
})

webPlatformService.streamMediaFile = async function streamMediaFileSafe(
  token: string,
  filePath: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const auth = await this.authByToken(token)
  const normalized = String(filePath || '').trim()
  if (!normalized) throw new Error('媒体路径不能为空')

  const resolved = resolve(normalized)
  const dataDir = resolve(getAppPaths().dataDir)
  const uploadsRoot = resolve(join(dataDir, 'web-uploads', auth.user.id))
  const cloneRoot = resolve(join(dataDir, 'viral-clone'))
  const outputRoot = resolve(join(dataDir, 'outputs'))
  const isAllowed = [uploadsRoot, cloneRoot, outputRoot].some((root) => {
    const withSep = `${root}${sep}`
    return resolved === root || resolved.startsWith(withSep)
  })
  if (!isAllowed) throw new Error('无权访问该媒体文件')

  const info = await assertFileReadableSafe(resolved)
  const size = info.size
  const mimeType = mediaMimeType(resolved)
  const range = req.headers.range

  if (req.method === 'OPTIONS') {
    res.writeHead(204, mediaCorsHeaders())
    res.end()
    return
  }

  if (range) {
    const parts = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (parts) {
      let start = parts[1] ? parseInt(parts[1], 10) : 0
      let end = parts[2] ? parseInt(parts[2], 10) : size - 1
      if (Number.isNaN(start)) start = 0
      if (Number.isNaN(end) || end >= size) end = size - 1
      if (start > end || start >= size) {
        res.writeHead(416, { ...mediaCorsHeaders(), 'Content-Range': `bytes */${size}` }).end()
        return
      }
      res.writeHead(206, {
        ...mediaCorsHeaders(),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Type': mimeType,
      })
      createReadStream(resolved, { start, end }).on('error', () => res.destroy()).pipe(res)
      return
    }
  }

  res.writeHead(200, {
    ...mediaCorsHeaders(),
    'Content-Length': String(size),
    'Accept-Ranges': 'bytes',
    'Content-Type': mimeType,
  })
  createReadStream(resolved).on('error', () => res.destroy()).pipe(res)
}

webPlatformService.composeFinalVideo = async function composeFinalVideoSafe(
  token: string,
  input: { cloneProjectId: string; outputDir?: string },
) {
  const auth = await this.authByToken(token)
  await assertProjectOwnership(input.cloneProjectId, auth.user.id)
  const directResult = await cloneService.composeCloneFinalVideo(input)
  if (directResult?.project) {
    await patchProjectOwnership(directResult.project, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      actualCost: directResult.project.actualCost || 0,
      billingStatus: directResult.project.billingStatus || 'pending',
      deductionStatus: directResult.project.deductionStatus || 'none',
    })
  }
  return directResult
  const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
  const billing = await chargeCredits({
    userId: auth.user.id,
    action: 'compose_final_video',
    relatedProjectId: project.id,
    note: '合成最终成片',
  })
  const result = await cloneService.composeCloneFinalVideo(input)
  if (result?.project) {
    await patchProjectOwnership(result.project, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      actualCost: (result.project.actualCost || 0) + billing.chargedCredits,
      billingStatus: 'paid',
      deductionStatus: billing.chargedCredits > 0 ? 'charged' : 'none',
    })
  }
  return result
}
