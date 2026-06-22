import { basename } from 'node:path'
import { readFile } from 'node:fs/promises'
import { cloneRepo } from '../clone/repo'

type HermesReplyAction =
  | { type: 'text'; text: string }
  | { type: 'video'; text: string; videoPath: string; videoUrl?: string }

type FeishuDeliveryConfig = {
  appId?: string
  appSecret?: string
  tenantAccessToken?: string
  receiveId: string
  receiveIdType?: 'open_id' | 'user_id' | 'union_id' | 'chat_id' | 'email'
}

type WecomDeliveryConfig = {
  corpId?: string
  corpSecret?: string
  accessToken?: string
  agentId: string
  toUser: string
}

type HermesDeliveryDeps = {
  fetch: typeof fetch
}

const hermesDeliveryDeps: HermesDeliveryDeps = {
  fetch,
}

async function ensureOk(response: Response, label: string) {
  if (response.ok) return
  const text = await response.text().catch(() => '')
  throw new Error(`${label} failed HTTP ${response.status}: ${text}`)
}

async function getFeishuTenantAccessToken(input: FeishuDeliveryConfig) {
  if (String(input.tenantAccessToken || '').trim()) return String(input.tenantAccessToken || '').trim()
  const integration = await cloneRepo.getHermesIntegrationSettings().catch(() => undefined)
  const appId = String(input.appId || integration?.feishu?.appId || process.env.FEISHU_APP_ID || '').trim()
  const appSecret = String(input.appSecret || integration?.feishu?.appSecret || process.env.FEISHU_APP_SECRET || '').trim()
  if (!appId || !appSecret) {
    throw new Error('Feishu app credentials are required')
  }
  const response = await hermesDeliveryDeps.fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
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

async function uploadFeishuFile(input: { tenantAccessToken: string; filePath: string }) {
  const fileBuffer = await readFile(input.filePath)
  const form = new FormData()
  form.set('file_type', 'stream')
  form.set('file_name', basename(input.filePath))
  form.set('file', new Blob([fileBuffer]), basename(input.filePath))
  const response = await hermesDeliveryDeps.fetch('https://open.feishu.cn/open-apis/im/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.tenantAccessToken}`,
    },
    body: form,
  })
  await ensureOk(response, 'Feishu file upload')
  const json = (await response.json()) as { data?: { file_key?: string }; msg?: string; code?: number }
  const fileKey = String(json.data?.file_key || '').trim()
  if (!fileKey) throw new Error(`Feishu file_key missing: ${json.msg || json.code || 'unknown error'}`)
  return fileKey
}

async function sendFeishuMessage(input: {
  tenantAccessToken: string
  receiveId: string
  receiveIdType: string
  msgType: 'text' | 'file'
  content: Record<string, unknown>
}) {
  const response = await hermesDeliveryDeps.fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(input.receiveIdType)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.tenantAccessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        receive_id: input.receiveId,
        msg_type: input.msgType,
        content: JSON.stringify(input.content),
      }),
    },
  )
  await ensureOk(response, 'Feishu send message')
  return await response.json()
}

async function getWecomAccessToken(input: WecomDeliveryConfig) {
  if (String(input.accessToken || '').trim()) return String(input.accessToken || '').trim()
  const integration = await cloneRepo.getHermesIntegrationSettings().catch(() => undefined)
  const corpId = String(input.corpId || integration?.wecom?.corpId || process.env.WECOM_CORP_ID || '').trim()
  const corpSecret = String(input.corpSecret || integration?.wecom?.corpSecret || process.env.WECOM_CORP_SECRET || '').trim()
  if (!corpId || !corpSecret) {
    throw new Error('WeCom corp credentials are required')
  }
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`
  const response = await hermesDeliveryDeps.fetch(url)
  await ensureOk(response, 'WeCom access token')
  const json = (await response.json()) as { access_token?: string; errmsg?: string; errcode?: number }
  const token = String(json.access_token || '').trim()
  if (!token) throw new Error(`WeCom access token missing: ${json.errmsg || json.errcode || 'unknown error'}`)
  return token
}

async function uploadWecomMedia(input: { accessToken: string; filePath: string }) {
  const fileBuffer = await readFile(input.filePath)
  const form = new FormData()
  form.set('media', new Blob([fileBuffer]), basename(input.filePath))
  const response = await hermesDeliveryDeps.fetch(`https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${encodeURIComponent(input.accessToken)}&type=file`, {
    method: 'POST',
    body: form,
  })
  await ensureOk(response, 'WeCom media upload')
  const json = (await response.json()) as { media_id?: string; errmsg?: string; errcode?: number }
  const mediaId = String(json.media_id || '').trim()
  if (!mediaId) throw new Error(`WeCom media_id missing: ${json.errmsg || json.errcode || 'unknown error'}`)
  return mediaId
}

async function sendWecomMessage(input: {
  accessToken: string
  agentId: string
  toUser: string
  msgtype: 'text' | 'file'
  payload: Record<string, unknown>
}) {
  const response = await hermesDeliveryDeps.fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(input.accessToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      touser: input.toUser,
      msgtype: input.msgtype,
      agentid: Number(input.agentId),
      safe: 0,
      enable_id_trans: 0,
      enable_duplicate_check: 0,
      duplicate_check_interval: 1800,
      ...(input.msgtype === 'text' ? { text: input.payload } : { file: input.payload }),
    }),
  })
  await ensureOk(response, 'WeCom send message')
  return await response.json()
}

export const hermesDeliveryService = {
  setTestDependencies(input: Partial<HermesDeliveryDeps>) {
    if (input.fetch) hermesDeliveryDeps.fetch = input.fetch
  },

  resetTestDependencies() {
    hermesDeliveryDeps.fetch = fetch
  },

  async sendFinalToFeishu(input: FeishuDeliveryConfig & { actions: HermesReplyAction[] }) {
    const integration = await cloneRepo.getHermesIntegrationSettings().catch(() => undefined)
    const tenantAccessToken = await getFeishuTenantAccessToken(input)
    const receiveId = String(input.receiveId || integration?.feishu?.defaultReceiveId || '').trim()
    const receiveIdType = input.receiveIdType || integration?.feishu?.receiveIdType || 'open_id'
    if (!receiveId) throw new Error('Feishu receiveId is required')
    const results: unknown[] = []
    for (const action of input.actions) {
      results.push(
        await sendFeishuMessage({
          tenantAccessToken,
          receiveId,
          receiveIdType,
          msgType: 'text',
          content: {
            text: action.text,
          },
        }),
      )
      if (action.type === 'video') {
        const fileKey = await uploadFeishuFile({
          tenantAccessToken,
          filePath: action.videoPath,
        })
        results.push(
          await sendFeishuMessage({
            tenantAccessToken,
            receiveId,
            receiveIdType,
            msgType: 'file',
            content: {
              file_key: fileKey,
            },
          }),
        )
      }
    }
    return results
  },

  async sendFinalToWecom(input: WecomDeliveryConfig & { actions: HermesReplyAction[] }) {
    const integration = await cloneRepo.getHermesIntegrationSettings().catch(() => undefined)
    const accessToken = await getWecomAccessToken(input)
    const agentId = String(input.agentId || integration?.wecom?.agentId || '').trim()
    const toUser = String(input.toUser || integration?.wecom?.defaultToUser || '').trim()
    if (!agentId || !toUser) throw new Error('WeCom agentId and toUser are required')
    const results: unknown[] = []
    for (const action of input.actions) {
      results.push(
        await sendWecomMessage({
          accessToken,
          agentId,
          toUser,
          msgtype: 'text',
          payload: {
            content: action.text,
          },
        }),
      )
      if (action.type === 'video') {
        const mediaId = await uploadWecomMedia({
          accessToken,
          filePath: action.videoPath,
        })
        results.push(
          await sendWecomMessage({
            accessToken,
            agentId,
            toUser,
            msgtype: 'file',
            payload: {
              media_id: mediaId,
            },
          }),
        )
      }
    }
    return results
  },
}
