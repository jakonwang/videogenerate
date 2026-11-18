/**
 * 电脑代办（实时转交）：网页调用电脑端功能的请求 / 结果格式。
 * 只开放需要电脑上的登录 / 数据、且页面已在网页上复用的功能；每个模块声明它的 IPC 前缀，
 * 以及「禁止」（会在电脑上弹窗口 / 选文件）或「只允许」的方法。
 */
export const RELAY_MODULES = {
  tiktokGmvMax: { channel: 'plugin:tiktokGmvMax:', blocked: ['selectEvidenceAttachment', 'onSyncProgress'] },
  tiktokCreatorHub: { channel: 'plugin:tiktokCreatorHub:', blocked: ['openBackend', 'openCreatorBackend'] },
  dianxiaomiInventory: { channel: 'plugin:dianxiaomiInventory:', blocked: ['openLogin'] },
  /** 混剪数据洞察：成片台账、效果分析、关联投放素材、送去发布 */
  mixStudio: { channel: 'mixStudio:', only: ['insights', 'ledger', 'refreshPerformance', 'listCreatives', 'linkCreative', 'sendToPublish', 'removeLedgerEntry'] },
  /** tk创意室右栏：账号调度（只有 cookie 数量，不含 cookie）、提示词版本、设置（只读） */
  tiktokCreative: { channel: 'plugin:tiktokCreative:', only: ['listAccounts', 'listPromptVersions', 'getSettings', 'listSummary'] },
  /** 发布中心（CreatOK）：电脑上的发布凭证和店铺连接；网页选的云端视频由电脑先下载再建草稿（见 CLOUD_FILE_PREFIX） */
  tiktokPublisher: { channel: 'plugin:tiktokPublisher:' },
  /** 设置 → 体检与自动化：电脑上的系统体检、每日简报 / 每周复盘定时、飞书推送 */
  contentHub: { channel: 'contentHub:', only: ['getAutomationSettings', 'saveAutomationSettings', 'testFeishuPush', 'healthCheck'] },
  /** 发布中心「关联商品」：电脑端商品库（只读） */
  products: { channel: 'products:', only: ['list'] },
  /** 设置 → 模型与 AI：电脑端的模型密钥（托管字段只返回掩码） */
  clone: { channel: 'clone:', blocked: ['debugLog'] },
  /** 网页显示电脑端页面里的本地图片 / 视频：电脑把文件传到云端（只限软件数据目录） */
  media: { channel: 'relayMedia:', only: ['publish'] },
} as const satisfies Record<string, { channel: string; blocked?: readonly string[]; only?: readonly string[] }>

export type RelayNamespace = keyof typeof RELAY_MODULES

/**
 * 网页传给电脑的「云端文件」：`cloudfile:<fileId>/<文件名>`。电脑执行前先把文件下载到本地，
 * 再把参数里的这个字符串换成本地路径（发布中心从网页选视频建草稿就靠它）。
 */
export const CLOUD_FILE_PREFIX = 'cloudfile:'
export function cloudFileRef(fileId: string, name: string) {
  return `${CLOUD_FILE_PREFIX}${fileId}/${String(name || 'video.mp4').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)}`
}
export function parseCloudFileRef(value: string): { fileId: string; name: string } | null {
  if (!value.startsWith(CLOUD_FILE_PREFIX)) return null
  const [fileId, ...rest] = value.slice(CLOUD_FILE_PREFIX.length).split('/')
  return fileId ? { fileId, name: rest.join('/') || `${fileId}.mp4` } : null
}
export const RELAY_NAMESPACES = Object.keys(RELAY_MODULES) as RelayNamespace[]

/** Whether the web may run this method on the computer. */
export function relayAllows(ns: string, method: string): boolean {
  const mod = (RELAY_MODULES as Record<string, { blocked?: readonly string[]; only?: readonly string[] }>)[ns]
  if (!mod) return false
  if (mod.only) return mod.only.includes(method)
  return !(mod.blocked ?? []).includes(method)
}

export function relayChannel(ns: RelayNamespace, method: string) {
  return `${RELAY_MODULES[ns].channel}${method}`
}

export type RelayCall = { id: string; ns: string; method: string; args: unknown[] }
export type RelayResult = { id: string; ok: boolean; result?: unknown; error?: string }
