import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { cloneRepo } from '../clone/repo'

type HermesMediaIngressDeps = {
  fetch: typeof fetch
}

const hermesMediaIngressDeps: HermesMediaIngressDeps = {
  fetch,
}

type FeishuMediaConfig = {
  appId?: string
  appSecret?: string
  tenantAccessToken?: string
  messageId: string
  fileKey: string
  fileName?: string
}

type WecomMediaConfig = {
  corpId?: string
  corpSecret?: string
  accessToken?: string
  mediaId: string
  fileName?: string
}

async function ensureOk(response: Response, label: string) {
  if (response.ok) return
  const text = await response.text().catch(() => '')
  throw new Error(`${label} failed HTTP ${response.status}: ${text}`)
}

async function ensureIngressDir() {
  const dir = join(getAppPaths().tmpDir, 'hermes-live-photo-ingress')
  await mkdir(dir, { recursive: true })
  return dir
}

function safeFileName(input: string, fallbackExt = '.bin') {
  const base = String(input || '').trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').slice(0, 80)
  if (!base) return `${randomUUID()}${fallbackExt}`
  return base
}

async function getFeishuTenantAccessToken(input: FeishuMediaConfig) {
  if (String(input.tenantAccessToken || '').trim()) return String(input.tenantAccessToken || '').trim()
  const integration = await cloneRepo.getHermesIntegrationSettings().catch(() => undefined)
  const appId = String(input.appId || integration?.feishu?.appId || process.env.FEISHU_APP_ID || '').trim()
  const appSecret = String(input.appSecret || integration?.feishu?.appSecret || process.env.FEISHU_APP_SECRET || '').trim()
  if (!appId || !appSecret) throw new Error('Feishu app credentials are required')
  const response = await hermesMediaIngressDeps.fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  })
  await ensureOk(response, 'Feishu tenant access token')
  const json = (await response.json()) as { tenant_access_token?: string; msg?: string; code?: number }
  const token = String(json.tenant_access_token || '').trim()
  if (!token) throw new Error(`Feishu tenant access token missing: ${json.msg || json.code || 'unknown error'}`)
  return token
}

async function getWecomAccessToken(input: WecomMediaConfig) {
  if (String(input.accessToken || '').trim()) return String(input.accessToken || '').trim()
  const integration = await cloneRepo.getHermesIntegrationSettings().catch(() => undefined)
  const corpId = String(input.corpId || integration?.wecom?.corpId || process.env.WECOM_CORP_ID || '').trim()
  const corpSecret = String(input.corpSecret || integration?.wecom?.corpSecret || process.env.WECOM_CORP_SECRET || '').trim()
  if (!corpId || !corpSecret) throw new Error('WeCom corp credentials are required')
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`
  const response = await hermesMediaIngressDeps.fetch(url)
  await ensureOk(response, 'WeCom access token')
  const json = (await response.json()) as { access_token?: string; errmsg?: string; errcode?: number }
  const token = String(json.access_token || '').trim()
  if (!token) throw new Error(`WeCom access token missing: ${json.errmsg || json.errcode || 'unknown error'}`)
  return token
}

export const hermesMediaIngressService = {
  setTestDependencies(input: Partial<HermesMediaIngressDeps>) {
    if (input.fetch) hermesMediaIngressDeps.fetch = input.fetch
  },

  resetTestDependencies() {
    hermesMediaIngressDeps.fetch = fetch
  },

  async downloadFeishuImage(input: FeishuMediaConfig) {
    const tenantAccessToken = await getFeishuTenantAccessToken(input)
    const dir = await ensureIngressDir()
    const ext = extname(String(input.fileName || '').trim()) || '.jpg'
    const fileName = safeFileName(input.fileName || `${input.fileKey}${ext}`, ext)
    const targetPath = join(dir, fileName)
    const response = await hermesMediaIngressDeps.fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages/${encodeURIComponent(input.messageId)}/resources/${encodeURIComponent(input.fileKey)}?type=image`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tenantAccessToken}`,
        },
      },
    )
    await ensureOk(response, 'Feishu image download')
    const buffer = Buffer.from(await response.arrayBuffer())
    await writeFile(targetPath, buffer)
    return targetPath
  },

  async downloadWecomImage(input: WecomMediaConfig) {
    const accessToken = await getWecomAccessToken(input)
    const dir = await ensureIngressDir()
    const ext = extname(String(input.fileName || '').trim()) || '.jpg'
    const fileName = safeFileName(input.fileName || `${input.mediaId}${ext}`, ext)
    const targetPath = join(dir, fileName)
    const response = await hermesMediaIngressDeps.fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/media/get?access_token=${encodeURIComponent(accessToken)}&media_id=${encodeURIComponent(input.mediaId)}`,
      {
        method: 'GET',
      },
    )
    await ensureOk(response, 'WeCom image download')
    const contentType = String(response.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('application/json')) {
      const text = await response.text().catch(() => '')
      throw new Error(`WeCom image download returned JSON: ${text}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await writeFile(targetPath, buffer)
    return targetPath
  },
}
