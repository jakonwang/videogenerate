import { statfs } from 'node:fs/promises'
import { cloneRepo } from '../clone/repo'
import { resolveApifoxHubCredentials } from '../clone/apifoxProfile'
import { tiktokCreativeStudioService } from '../tiktok-creative-studio/service'
import { creatokPublisherService } from '../tiktok-publisher/service'
import { getAppPaths } from '../../lib/paths'
import type { HealthCheckItem, HealthLevel, HealthReport } from './types'

const LOW_DISK_BYTES = 5 * 1024 ** 3
const CRITICAL_DISK_BYTES = 1 * 1024 ** 3

function worst(levels: HealthLevel[]): HealthLevel {
  if (levels.includes('error')) return 'error'
  if (levels.includes('warning')) return 'warning'
  return 'ok'
}

function gb(bytes: number) {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

let lastReport: HealthReport | null = null

export async function runHealthCheck(): Promise<HealthReport> {
  const items: HealthCheckItem[] = []

  try {
    const credentials = await cloneRepo.getCredentials()
    const capabilities: Array<{ key: 'chat' | 'image' | 'video'; title: string; model: (cfg: any) => string }> = [
      { key: 'chat', title: '对话模型（AI 制片人大脑、脚本分析）', model: (cfg) => String(cfg?.chatModel || '') },
      { key: 'image', title: '图片模型（分镜图、商品换图）', model: (cfg) => String(cfg?.imageModel || cfg?.imageEditModel || '') },
      { key: 'video', title: '视频模型（分镜视频、图生视频）', model: (cfg) => String(cfg?.videoModel || cfg?.imageToVideoModel || cfg?.textToVideoModel || '') },
    ]
    for (const capability of capabilities) {
      const cfg = resolveApifoxHubCredentials(credentials, capability.key) as any
      const configured = Boolean(cfg?.apiKey && cfg?.baseUrl)
      const model = capability.model(cfg)
      items.push({
        key: `model.${capability.key}`,
        level: configured ? 'ok' : 'error',
        title: capability.title,
        detail: configured ? `已配置${model ? ` · ${model}` : ''}` : '未配置接口地址或密钥，相关功能无法运行',
        route: '/settings',
      })
    }
  } catch (error) {
    items.push({ key: 'model', level: 'error', title: '模型配置', detail: `读取失败：${String((error as Error)?.message || error)}`, route: '/settings' })
  }

  try {
    const accounts = ((await tiktokCreativeStudioService.listAccounts()) as { accounts?: any[] }).accounts || []
    const enabled = accounts.filter((account) => account.enabled)
    const ready = enabled.filter((account) => account.state === 'ready' || account.state === 'unknown')
    const lowCredit = enabled.filter((account) => account.state === 'insufficient_credit' || (typeof account.credit === 'number' && account.credit <= 0))
    const broken = enabled.filter((account) => account.state === 'expired' || account.state === 'error')
    let level: HealthLevel = 'ok'
    let detail = `${ready.length} 个账号可用`
    if (!enabled.length) {
      level = 'warning'
      detail = '没有启用的 TikTok 创意账号，tk创意室无法出片'
    } else if (!ready.length) {
      level = 'error'
      detail = '所有账号都不可用（过期 / 额度不足 / 异常）'
    } else if (lowCredit.length || broken.length) {
      level = 'warning'
      detail = `${ready.length} 个可用，${lowCredit.length} 个额度不足，${broken.length} 个过期或异常`
    }
    const credits = enabled.map((account) => Number(account.credit)).filter((value) => Number.isFinite(value))
    if (credits.length) detail += ` · 剩余额度合计 ${credits.reduce((sum, value) => sum + value, 0)}`
    items.push({ key: 'creative.accounts', level, title: 'TikTok 创意账号', detail, route: '/plugins/tiktok-creative-studio' })
  } catch {
    items.push({ key: 'creative.accounts', level: 'warning', title: 'TikTok 创意账号', detail: '无法读取账号状态', route: '/plugins/tiktok-creative-studio' })
  }

  try {
    const { museCreativeStudioService } = await import('../muse-creative-studio/service')
    const { accounts } = await museCreativeStudioService.list()
    // Not set up is not a problem: the line is optional.
    if (accounts.length) {
      const enabled = accounts.filter((account) => account.enabled)
      const ready = enabled.filter((account) => account.state === 'ready')
      const resting = ready.filter((account) => Number(account.quotaUntil) > Date.now())
      const usable = ready.length - resting.length
      const detail = !enabled.length
        ? '没有启用的 Muse 账号'
        : `${usable} 个可用，${resting.length} 个额度不足，${enabled.length - ready.length} 个代理或登录异常`
      items.push({ key: 'muse.accounts', level: !enabled.length ? 'warning' : !usable ? 'error' : usable < enabled.length ? 'warning' : 'ok', title: 'Muse 账号', detail, route: '/plugins/muse-creative-studio' })
    }
  } catch {
    items.push({ key: 'muse.accounts', level: 'warning', title: 'Muse 账号', detail: '无法读取账号状态', route: '/plugins/muse-creative-studio' })
  }

  try {
    const status = await creatokPublisherService.credentialStatus()
    items.push({
      key: 'publish.credential',
      level: status.configured ? 'ok' : 'warning',
      title: '发布渠道（CreatOK）',
      detail: status.configured ? '已配置发布密钥' : '未配置发布密钥，只能生成发布草稿',
      route: '/publish',
    })
  } catch {
    items.push({ key: 'publish.credential', level: 'warning', title: '发布渠道（CreatOK）', detail: '无法读取发布配置', route: '/publish' })
  }

  try {
    const stats = await statfs(getAppPaths().dataDir)
    const free = Number(stats.bavail) * Number(stats.bsize)
    items.push({
      key: 'disk',
      level: free < CRITICAL_DISK_BYTES ? 'error' : free < LOW_DISK_BYTES ? 'warning' : 'ok',
      title: '磁盘空间',
      detail: `数据目录剩余 ${gb(free)}`,
      route: '/settings',
    })
  } catch {
    // statfs is unavailable on some file systems; skip silently.
  }

  lastReport = { checkedAt: Date.now(), level: worst(items.map((item) => item.level)), items }
  return lastReport
}

/** Cached report for cheap callers (cost estimates, briefs); refreshes after 5 minutes. */
export async function getHealthReport(maxAgeMs = 5 * 60_000): Promise<HealthReport> {
  if (lastReport && Date.now() - lastReport.checkedAt < maxAgeMs) return lastReport
  return await runHealthCheck()
}
