/**
 * 电脑代办（实时转交）：网页调用电脑端功能的请求 / 结果格式。
 * 只开放需要电脑上的登录 / 数据、且页面已在网页上复用的功能；每个模块声明它的 IPC 前缀，
 * 以及「禁止」（会在电脑上弹窗口 / 选文件）或「只允许」的方法。
 */
export const RELAY_MODULES = {
  tiktokGmvMax: { channel: 'plugin:tiktokGmvMax:', blocked: ['selectEvidenceAttachment', 'onSyncProgress'] },
  tiktokCreatorHub: { channel: 'plugin:tiktokCreatorHub:', blocked: ['openBackend', 'openCreatorBackend'] },
  dianxiaomiInventory: { channel: 'plugin:dianxiaomiInventory:', blocked: ['openLogin'] },
  /** 店铺 / 销售与库存：经营、利润、早报、库存都在电脑上（商家后台登录在电脑上）；打开商家后台窗口只能在电脑端 */
  sellerInventory: { channel: 'plugin:sellerInventory:', blocked: ['openSellerCenter'] },
  /** 混剪数据洞察：成片台账、效果分析、关联投放素材、送去发布 */
  /**
   * 批量混剪（网页上是电脑端同一组页面，电脑在线时）：方案、预览、成片台账和下单在电脑上执行。
   * 「从参考视频生成公式」会在电脑上弹选择框，网页改用 formulaFromReferencePath（网页上传的视频）。
   */
  mixStudio: { channel: 'mixStudio:', blocked: ['formulaFromReference'] },
  /** 素材池：电脑上的素材切分打标；「导入」会在电脑上弹选择框，网页改用 importPaths；进度用 latestProgress 读 */
  mixPool: { channel: 'mixPool:', blocked: ['importFiles'] },
  /** 生产任务队列（电脑上成片） */
  tasks: { channel: 'tasks:' },
  /** 电脑上的软件目录（混剪成片默认输出到电脑的数据目录） */
  app: { channel: 'app:', only: ['getPaths'] },
  /**
   * tk创意室：网页上是电脑端同一个页面，用电脑上的 TikTok 创意账号执行。账号的添加 / 修改 / 测试 / 删除（带 cookie）
   * 只能在电脑上做；导出由网页自己下载（不写电脑上的文件夹）。
   */
  tiktokCreative: { channel: 'plugin:tiktokCreative:', blocked: ['importAccount', 'updateAccount', 'testAccount', 'removeAccount', 'exportItems'] },
  /**
   * Muse创意室：网页 / 手机经电脑代办，用电脑上的 Muse 账号和代理执行。账号、代理、登录只能在电脑上看和改
   * （网页只拿不含代理的 listAccountSummaries）；导出由网页自己下载。
   */
  museCreative: {
    channel: 'plugin:museCreative:',
    only: [
      'listAccountSummaries', 'listJobs', 'getJob', 'createJobs', 'retryJob', 'dismissJob', 'collectJob', 'cancelJob', 'cancelQueuedJobs', 'removeJobs',
      'approveImages', 'redoImage', 'setQueuePaused', 'setQueueConcurrency', 'saveSettings', 'addSubtitles', 'revertSubtitles',
      'listPrompts', 'updatePrompt', 'copyPrompt', 'activatePrompt', 'rollbackPrompt',
    ],
  },
  /** tk创意室「同款参考视频」：在电脑上分析参考视频（网页上传的视频由电脑先下载） */
  styleReference: { channel: 'plugin:styleReference:', only: ['analyze', 'list'] },
  /** 发布中心（CreatOK）：电脑上的发布凭证和店铺连接；网页选的云端视频由电脑先下载再建草稿（见 CLOUD_FILE_PREFIX） */
  tiktokPublisher: { channel: 'plugin:tiktokPublisher:' },
  /** 设置 → 体检与自动化（系统体检、每日简报 / 每周复盘定时、飞书推送）；每日自动驾驶：网页 / 手机上也能看今日计划、批准或跳过（执行仍在电脑上） */
  contentHub: { channel: 'contentHub:', only: ['getAutomationSettings', 'saveAutomationSettings', 'testFeishuPush', 'healthCheck', 'autopilotToday', 'autopilotGenerate', 'autopilotApprove', 'autopilotSkip', 'autopilotSaveSettings', 'radarState', 'radarAdd', 'radarRemove', 'radarDismiss', 'radarRefresh', 'productOverview', 'saveProductMemory', 'downloadCreativeVideo', 'creativeGenes', 'analyzeCreativeGenes', 'linkContentPerformance', 'unlinkContentPerformance', 'linkProductChannels'] },
  /** 发布中心「关联商品」：电脑端商品库（只读） */
  products: { channel: 'products:', only: ['list'] },
  /** 设置 → 模型与 AI：电脑端的模型密钥（托管字段只返回掩码） */
  clone: { channel: 'clone:', blocked: ['debugLog'] },
  /** 图生视频：网页上由服务器引擎执行（cloneEngine.ts 总是转给引擎，不会到电脑） */
  livePhoto: { channel: 'plugin:livePhoto:' },
  /** 一键上新：网页上由服务器引擎执行（出图、写文案、图生视频都在服务器；tk创意室 只在电脑端） */
  productLaunch: { channel: 'productLaunch:' },
  /** 批量字幕：电脑端页面调用的本地 Web API，网页上由服务器引擎里的同一个 API 处理（总是交给引擎） */
  webApi: { channel: 'webApi:', only: ['request'] },
  /** 网页显示电脑端页面里的本地图片 / 视频：电脑把文件传到云端（只限软件数据目录） */
  media: { channel: 'relayMedia:', only: ['publish'] },
  /** 模板：模板库页面指定服务器（模板在服务器引擎里编辑）；批量混剪页面不指定，读电脑上的模板（下单要用电脑上的模板 id） */
  templates: { channel: 'templates:', only: ['list', 'upsert', 'remove', 'analyzeVideo'] },
  /** 模板库的 LUT / 贴纸 / 字体下拉：电脑在线时用电脑上的列表（含用户导入的），否则用服务器引擎的内置列表 */
  luts: { channel: 'luts:', only: ['list'] },
  stickers: { channel: 'stickers:', only: ['list', 'listUser'] },
  fonts: { channel: 'fonts:', only: ['list'] },
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
