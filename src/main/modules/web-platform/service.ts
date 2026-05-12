import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, stat, writeFile } from 'node:fs/promises'
import type * as http from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { cloneRepo } from '../clone/repo'
import { cloneService } from '../clone/service'
import type { CloneProject, CloneProjectSummary } from '../clone/types'
import { getAppPaths } from '../../lib/paths'
import { webPlatformRepo } from './repo'
import type {
  BillingAction,
  BillingOrder,
  BillingOrderType,
  CloneModelIdentitySummary,
  SubscriptionPlan,
  UserSubscription,
  WalletAccount,
  WalletTransaction,
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

function assertSmsCode(code: string) {
  const normalized = String(code || '').trim()
  if (normalized !== '123456') {
    throw new Error('验证码错误，当前演示环境固定验证码为 123456')
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

export const webPlatformService = {
  async login(input: WebAuthLoginInput) {
    const phone = normalizePhone(input.phone)
    if (!phone) throw new Error('手机号不能为空')
    assertSmsCode(input.code)
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
    paymentChannel?: 'mock_wechat' | 'mock_alipay'
    credits?: number
  }) {
    const auth = await this.authByToken(input.token)
    const paymentChannel = input.paymentChannel ?? 'mock_wechat'
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
    }
    await webPlatformRepo.createOrder(order)
    return {
      order,
      paymentMock: {
        payUrl: `/payments/mock/pay?orderId=${order.id}`,
        qrText: `videogen://${paymentChannel}/pay/${order.id}`,
      },
    }
  },

  async payOrder(orderId: string) {
    const order = await webPlatformRepo.getOrder(orderId)
    if (!order) throw new Error('订单不存在')
    if (order.status === 'paid') return { order }
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
    const ownedIds = new Set(projects.filter((item) => item.userId === auth.user.id).map((item) => item.id))
    return rows.filter((item) => ownedIds.has(item.id))
  },

  async createCloneProject(token: string, input?: { title?: string; description?: string; locale?: 'vi-VN' | 'zh-CN' }) {
    const auth = await this.authByToken(token)
    const res = await cloneService.createDraftProject({
      locale: input?.locale ?? 'zh-CN',
      strength: 'structure',
      title: input?.title,
      description: input?.description,
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
    const saved = await persistUploadedAsset({
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
    const owned = projects.filter((item) => item.userId === auth.user.id)
    const summaries = await cloneService.listProjectSummaries()
    return summaries.filter((summary) => owned.some((project) => project.id === summary.id))
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
    const uploaded = await persistUploadedAsset({
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
        persistUploadedAsset({
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

  async generateStoryboardImages(token: string, input: { cloneProjectId: string; productReferenceImagePaths?: string[]; selectedModelIdentityId?: string }) {
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const billing = await chargeCredits({
      userId: auth.user.id,
      action: 'generate_storyboard_images',
      relatedProjectId: project.id,
      note: '生成分镜图片',
    })
    const result = await cloneService.generateStoryboardGridsForProject(input)
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
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const billing = await chargeCredits({
      userId: auth.user.id,
      action: 'generate_storyboard_images',
      relatedProjectId: project.id,
      note: '重生成单镜分镜图片',
    })
    const result = await cloneService.generateShotFrames(input)
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

  async updateCloneProjectStage(token: string, input: { cloneProjectId: string; currentStep: CloneProject['workflowV2']['currentStep'] }) {
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
    const auth = await this.authByToken(token)
    const project = await assertProjectOwnership(input.cloneProjectId, auth.user.id)
    const result = (await cloneService.generateShotClip({
      cloneProjectId: input.cloneProjectId,
      shotId: input.shotId,
      forceRegenerate: true,
    })) as CloneProject
    const saved = await patchProjectOwnership(result, {
      userId: auth.user.id,
      planId: auth.subscription.planId,
      actualCost: result.actualCost || project.actualCost || 0,
      billingStatus: result.billingStatus || project.billingStatus || 'paid',
      deductionStatus: result.deductionStatus || project.deductionStatus || 'none',
    })
    return { project: saved }
  },

  async composeFinalVideo(token: string, input: { cloneProjectId: string; outputDir?: string }) {
    const auth = await this.authByToken(token)
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

    const info = await assertFileReadable(resolved)
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
