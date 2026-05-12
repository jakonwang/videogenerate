import type http from 'node:http'
import { webPlatformService } from './service'

type JsonObject = Record<string, unknown>

export function json(res: http.ServerResponse, status: number, payload: JsonObject) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(payload))
}

export async function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
}

export function authTokenOf(req: http.IncomingMessage) {
  const header = String(req.headers.authorization || '').trim()
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() || ''
}

function isUnauthorizedError(error: unknown) {
  const message = String((error as { message?: string } | undefined)?.message ?? error ?? '').trim()
  return message === '登录已失效' || message === '登录已过期' || message === '账号不可用'
}

export async function handleWebApiRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method === 'OPTIONS') {
    json(res, 204, {})
    return
  }

  const host = req.headers.host ?? '127.0.0.1'
  const url = new URL(req.url ?? '/', `http://${host}`)
  const pathname = url.pathname
  const token = authTokenOf(req)

  try {
    if (req.method === 'POST' && pathname === '/auth/login') {
      const body = await readBody(req)
      const result = await webPlatformService.login({
        phone: String(body.phone ?? ''),
        code: String(body.code ?? ''),
        displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'POST' && pathname === '/auth/logout') {
      const result = await webPlatformService.logout(token)
      json(res, 200, result as JsonObject)
      return
    }

    if (req.method === 'GET' && pathname === '/me') {
      const result = await webPlatformService.getProfile(token)
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'GET' && pathname === '/me/subscription') {
      const result = await webPlatformService.getProfile(token)
      json(res, 200, { ok: true, subscription: result.subscription })
      return
    }

    if (req.method === 'GET' && pathname === '/me/wallet') {
      const result = await webPlatformService.getProfile(token)
      json(res, 200, { ok: true, wallet: result.wallet })
      return
    }

    if (req.method === 'GET' && pathname === '/billing/plans') {
      const result = await webPlatformService.listPlans()
      json(res, 200, { ok: true, plans: result })
      return
    }

    if (req.method === 'GET' && pathname === '/billing/orders') {
      const result = await webPlatformService.listBillingOrders(token)
      json(res, 200, { ok: true, orders: result })
      return
    }

    if (req.method === 'GET' && pathname === '/billing/transactions') {
      const result = await webPlatformService.listWalletTransactions(token)
      json(res, 200, { ok: true, transactions: result })
      return
    }

    if (req.method === 'POST' && pathname === '/billing/orders') {
      const body = await readBody(req)
      const result = await webPlatformService.createOrder({
        token,
        type: body.type === 'subscription' ? 'subscription' : 'compute_pack',
        planId: typeof body.planId === 'string' ? body.planId : undefined,
        paymentChannel: body.paymentChannel === 'mock_alipay' ? 'mock_alipay' : 'mock_wechat',
        credits: Number(body.credits ?? 0),
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'POST' && pathname.startsWith('/payments/notify/')) {
      const orderId = pathname.split('/').pop() || ''
      const result = await webPlatformService.payOrder(orderId)
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'GET' && pathname === '/clone/projects') {
      const result = await webPlatformService.listCloneProjectSummaries(token)
      json(res, 200, { ok: true, projects: result })
      return
    }

    if (req.method === 'GET' && pathname === '/clone/model-identities') {
      const result = await webPlatformService.listCloneModelIdentities(token)
      json(res, 200, { ok: true, items: result })
      return
    }

    if (req.method === 'POST' && pathname === '/clone/projects') {
      const body = await readBody(req)
      const result = await webPlatformService.createCloneProject(token, {
        title: typeof body.title === 'string' ? body.title : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
        locale: body.locale === 'vi-VN' ? 'vi-VN' : 'zh-CN',
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const projectMatch = /^\/clone\/projects\/([^/]+)$/.exec(pathname)
    if (req.method === 'GET' && projectMatch) {
      const result = await webPlatformService.getCloneProject(token, decodeURIComponent(projectMatch[1]))
      json(res, 200, { ok: true, project: result })
      return
    }
    if (req.method === 'DELETE' && projectMatch) {
      const result = await webPlatformService.removeCloneProject(token, decodeURIComponent(projectMatch[1]))
      json(res, 200, result as JsonObject)
      return
    }

    const stageMatch = /^\/clone\/projects\/([^/]+)\/stage$/.exec(pathname)
    if (req.method === 'POST' && stageMatch) {
      const body = await readBody(req)
      const currentStep = String(body.currentStep ?? '')
      const allowedSteps = new Set([
        'upload_analyze_script',
        'model_product_consistency',
        'storyboard_video_generation',
        'export_final',
        'generate_script_variants',
        'select_script_variant',
        'generate_storyboard_grids',
        'generate_shot_videos',
        'review_replace_shots',
        'compose_final_video',
      ])
      if (!allowedSteps.has(currentStep)) {
        throw new Error('无效的项目阶段')
      }
      const result = await webPlatformService.updateCloneProjectStage(token, {
        cloneProjectId: decodeURIComponent(stageMatch[1]),
        currentStep: currentStep as any,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const analyzeMatch = /^\/clone\/projects\/([^/]+)\/analyze$/.exec(pathname)
    if (req.method === 'POST' && analyzeMatch) {
      const body = await readBody(req)
      const result = await webPlatformService.analyzeReference(token, {
        cloneProjectId: decodeURIComponent(analyzeMatch[1]),
        videoPath: String(body.videoPath ?? ''),
        locale: body.locale === 'vi-VN' ? 'vi-VN' : 'zh-CN',
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const uploadReferenceMatch = /^\/clone\/projects\/([^/]+)\/reference-video\/upload$/.exec(pathname)
    if (req.method === 'POST' && uploadReferenceMatch) {
      const body = await readBody(req)
      const result = await webPlatformService.uploadCloneReferenceVideo(token, {
        cloneProjectId: decodeURIComponent(uploadReferenceMatch[1]),
        file: {
          fileName: String(body.fileName ?? ''),
          base64Data: String(body.base64Data ?? ''),
          mimeType: typeof body.mimeType === 'string' ? body.mimeType : undefined,
        },
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const variantsMatch = /^\/clone\/projects\/([^/]+)\/script-variants$/.exec(pathname)
    if (req.method === 'POST' && variantsMatch) {
      const body = await readBody(req)
      const result = await webPlatformService.generateScriptVariants(token, {
        cloneProjectId: decodeURIComponent(variantsMatch[1]),
        variantCount: Math.max(1, Math.min(6, Number(body.variantCount ?? 3))),
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const selectVariantMatch = /^\/clone\/projects\/([^/]+)\/select-script-variant$/.exec(pathname)
    if (req.method === 'POST' && selectVariantMatch) {
      const body = await readBody(req)
      const result = await webPlatformService.selectScriptVariant(token, {
        cloneProjectId: decodeURIComponent(selectVariantMatch[1]),
        variantId: String(body.variantId ?? ''),
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const productImagesMatch = /^\/clone\/projects\/([^/]+)\/product-images$/.exec(pathname)
    if (req.method === 'POST' && productImagesMatch) {
      const body = await readBody(req)
      const result = await webPlatformService.saveCloneProjectProductImages(token, {
        cloneProjectId: decodeURIComponent(productImagesMatch[1]),
        productReferenceImagePaths: Array.isArray(body.productReferenceImagePaths)
          ? body.productReferenceImagePaths.map(String)
          : [],
      })
      json(res, 200, { ok: true, project: result })
      return
    }

    const uploadProductImagesMatch = /^\/clone\/projects\/([^/]+)\/product-images\/upload$/.exec(pathname)
    if (req.method === 'POST' && uploadProductImagesMatch) {
      const body = await readBody(req)
      const files = Array.isArray(body.files)
        ? body.files.map((item) => ({
            fileName: String((item as Record<string, unknown>)?.fileName ?? ''),
            base64Data: String((item as Record<string, unknown>)?.base64Data ?? ''),
            mimeType:
              typeof (item as Record<string, unknown>)?.mimeType === 'string'
                ? String((item as Record<string, unknown>).mimeType)
                : undefined,
          }))
        : []
      const result = await webPlatformService.uploadCloneProductImages(token, {
        cloneProjectId: decodeURIComponent(uploadProductImagesMatch[1]),
        files,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const selectModelMatch = /^\/clone\/projects\/([^/]+)\/select-model-identity$/.exec(pathname)
    if (req.method === 'POST' && selectModelMatch) {
      const body = await readBody(req)
      const result = await webPlatformService.selectCloneProjectModelIdentity(token, {
        cloneProjectId: decodeURIComponent(selectModelMatch[1]),
        identityId: String(body.identityId ?? ''),
      })
      json(res, 200, { ok: true, project: result })
      return
    }

    const storyboardMatch = /^\/clone\/projects\/([^/]+)\/storyboard-images$/.exec(pathname)
    if (req.method === 'POST' && storyboardMatch) {
      const body = await readBody(req)
      const result = await webPlatformService.generateStoryboardImages(token, {
        cloneProjectId: decodeURIComponent(storyboardMatch[1]),
        productReferenceImagePaths: Array.isArray(body.productReferenceImagePaths)
          ? body.productReferenceImagePaths.map(String)
          : [],
        selectedModelIdentityId:
          typeof body.selectedModelIdentityId === 'string' ? body.selectedModelIdentityId : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const regenerateStoryboardMatch =
      /^\/clone\/projects\/([^/]+)\/storyboard-images\/([^/]+)\/regenerate$/.exec(pathname)
    if (req.method === 'POST' && regenerateStoryboardMatch) {
      const body = await readBody(req)
      const result = await webPlatformService.regenerateStoryboardImage(token, {
        cloneProjectId: decodeURIComponent(regenerateStoryboardMatch[1]),
        shotId: decodeURIComponent(regenerateStoryboardMatch[2]),
        productReferenceImagePaths: Array.isArray(body.productReferenceImagePaths)
          ? body.productReferenceImagePaths.map(String)
          : [],
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const shotUpdateMatch = /^\/clone\/projects\/([^/]+)\/shots\/([^/]+)$/.exec(pathname)
    if (req.method === 'POST' && shotUpdateMatch) {
      const body = await readBody(req)
      const result = await webPlatformService.updateCloneShot(token, {
        cloneProjectId: decodeURIComponent(shotUpdateMatch[1]),
        shotId: decodeURIComponent(shotUpdateMatch[2]),
        locked: typeof body.locked === 'boolean' ? body.locked : undefined,
        scriptText: typeof body.scriptText === 'string' ? body.scriptText : undefined,
        narrationText: typeof body.narrationText === 'string' ? body.narrationText : undefined,
        onScreenText: typeof body.onScreenText === 'string' ? body.onScreenText : undefined,
        visualDescription: typeof body.visualDescription === 'string' ? body.visualDescription : undefined,
        actionDescription: typeof body.actionDescription === 'string' ? body.actionDescription : undefined,
        cameraDescription: typeof body.cameraDescription === 'string' ? body.cameraDescription : undefined,
        durationSec: typeof body.durationSec === 'number' ? body.durationSec : undefined,
        cameraMovement: typeof body.cameraMovement === 'string' ? body.cameraMovement : undefined,
        subtitleSuggestion: typeof body.subtitleSuggestion === 'string' ? body.subtitleSuggestion : undefined,
        materialNeed: typeof body.materialNeed === 'string' ? body.materialNeed : undefined,
        order: typeof body.order === 'number' ? body.order : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }
    if (req.method === 'DELETE' && shotUpdateMatch) {
      const result = await webPlatformService.removeCloneShot(token, {
        cloneProjectId: decodeURIComponent(shotUpdateMatch[1]),
        shotId: decodeURIComponent(shotUpdateMatch[2]),
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const shotCreateMatch = /^\/clone\/projects\/([^/]+)\/shots$/.exec(pathname)
    if (req.method === 'POST' && shotCreateMatch) {
      const body = await readBody(req)
      const result = await webPlatformService.createCloneShot(token, {
        cloneProjectId: decodeURIComponent(shotCreateMatch[1]),
        afterShotId: typeof body.afterShotId === 'string' ? body.afterShotId : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const shotReorderMatch = /^\/clone\/projects\/([^/]+)\/shots\/reorder$/.exec(pathname)
    if (req.method === 'POST' && shotReorderMatch) {
      const body = await readBody(req)
      const result = await webPlatformService.reorderCloneShots(token, {
        cloneProjectId: decodeURIComponent(shotReorderMatch[1]),
        shotIds: Array.isArray(body.shotIds) ? body.shotIds.map(String) : [],
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const shotVideoMatch = /^\/clone\/projects\/([^/]+)\/shot-videos$/.exec(pathname)
    if (req.method === 'POST' && shotVideoMatch) {
      const result = await webPlatformService.generateShotVideos(token, {
        cloneProjectId: decodeURIComponent(shotVideoMatch[1]),
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const syncShotVideoMatch = /^\/clone\/projects\/([^/]+)\/shot-videos\/([^/]+)\/sync$/.exec(pathname)
    if (req.method === 'POST' && syncShotVideoMatch) {
      const result = await webPlatformService.syncCloneShotVideoTask(token, {
        cloneProjectId: decodeURIComponent(syncShotVideoMatch[1]),
        shotId: decodeURIComponent(syncShotVideoMatch[2]),
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const regenerateShotVideoMatch =
      /^\/clone\/projects\/([^/]+)\/shot-videos\/([^/]+)\/regenerate$/.exec(pathname)
    if (req.method === 'POST' && regenerateShotVideoMatch) {
      const result = await webPlatformService.regenerateCloneShotVideo(token, {
        cloneProjectId: decodeURIComponent(regenerateShotVideoMatch[1]),
        shotId: decodeURIComponent(regenerateShotVideoMatch[2]),
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const composeMatch = /^\/clone\/projects\/([^/]+)\/compose$/.exec(pathname)
    if (req.method === 'POST' && composeMatch) {
      const body = await readBody(req)
      const result = await webPlatformService.composeFinalVideo(token, {
        cloneProjectId: decodeURIComponent(composeMatch[1]),
        outputDir: typeof body.outputDir === 'string' ? body.outputDir : undefined,
      })
      json(res, 200, { ok: true, ...result })
      return
    }

    const runtimeMatch = /^\/clone\/projects\/([^/]+)\/runtime$/.exec(pathname)
    if (req.method === 'GET' && runtimeMatch) {
      const result = await webPlatformService.getCloneRuntime(token, decodeURIComponent(runtimeMatch[1]))
      json(res, 200, { ok: true, ...result })
      return
    }

    if (req.method === 'GET' && pathname === '/media/file') {
      const filePath = String(url.searchParams.get('path') || '').trim()
      await webPlatformService.streamMediaFile(token, filePath, req, res)
      return
    }

    json(res, 404, { ok: false, error: '接口不存在' })
  } catch (error: any) {
    json(res, isUnauthorizedError(error) ? 401 : 400, {
      ok: false,
      error: String(error?.message ?? error),
    })
  }
}
