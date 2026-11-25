/**
 * Reads the usage panel in the muse.ai settings dialog. Nothing is sent to Muse and no quota is used.
 * Menu labels and wording are adapted from MUSE2API (MIT, notice in musePage.ts).
 */
import { launchMuseBrowser, MuseProxyError } from './browser'
import { READY_SCRIPT } from './musePage'
import type { MuseProxy } from './proxy'
import { isMuseDomain, museSessionValue, type MuseCookie } from './session'
import type { MuseQuota } from './types'

const VISIBLE = "const visible = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';"
const LABELS = "const labels = ['Settings', '設定', '设置'];"
const SETTINGS_SCRIPT = `(() => { ${VISIBLE} ${LABELS}
  return Array.from(document.querySelectorAll('[data-testid="hatch-dock-more"]')).find(visible)
    || Array.from(document.querySelectorAll('button,[role="button"]')).find((e) => visible(e) && labels.includes((e.getAttribute('aria-label') || '').trim())) || null; })()`
const MENU_SCRIPT = `(() => { ${VISIBLE} ${LABELS}
  const exact = (e) => labels.includes((e.textContent || '').trim());
  return Array.from(document.querySelectorAll('[role="menuitem"]')).find((e) => visible(e) && (exact(e) || Array.from(e.querySelectorAll('span,div')).some(exact)))
    || Array.from(document.querySelectorAll('[role="menu"] button,[role="menu"] span,[role="menu"] div')).find((e) => visible(e) && exact(e)) || null; })()`
const DIALOG_SCRIPT = `(() => { ${VISIBLE}
  const d = Array.from(document.querySelectorAll('[role="dialog"],[aria-modal="true"]')).find(visible);
  return d ? d.innerText || '' : ''; })()`

/** Null unless a weekly percentage was found: a plan name alone proves nothing. */
export function parseMuseQuota(input: string): Omit<MuseQuota, 'checkedAt'> | null {
  let lines = String(input || '').normalize('NFKC').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  // Leaves out profile and language settings around the usage section.
  const start = lines.findIndex((line) => /^(?:usage|用量|使用量)$/i.test(line))
  lines = lines.slice(start + 1)
  const end = lines.findIndex((line) => /^(?:language|语言|語言)$/i.test(line))
  if (end >= 0) lines = lines.slice(0, end)
  const percent = (line: string) => {
    const match = /(\d+(?:\.\d+)?)\s*%\s*(?:used\b|已(?:使)?用)/i.exec(line) || /已(?:使)?用\s*(\d+(?:\.\d+)?)\s*%/.exec(line)
    const value = match ? Number(match[1]) : NaN
    return value >= 0 && value <= 100 ? value : undefined
  }
  const extraAt = lines.findIndex((line) => /^(?:(?:additional|extra)\s+tokens|(?:額外|额外)(?:的)?(?:符元|符記|代幣|代币|令牌|憑證|凭证|tokens))/i.test(line))
  const weekly = extraAt < 0 ? lines : lines.slice(0, extraAt)
  const extra = extraAt < 0 ? [] : lines.slice(extraAt)
  const weeklyUsedPct = weekly.map(percent).find((value) => value !== undefined)
  if (weeklyUsedPct === undefined) return null
  const extraLine = extra.find((line) => percent(line) !== undefined)
  const text = lines.join('\n')
  const at = lines.findIndex((line) => percent(line) !== undefined)
  const reset = /weekly limit resets? on ([^\n]+)/i.exec(text)
    || /(?:每(?:週|周|星期)|週|周)(?:上限|限額|限额|額度|额度)(?:會|会|將|将)?(?:於|于|在)\s*([^\n]+?)\s*(?:重設|重置)/.exec(text)
  return {
    // Never account details: only short lines next to the number, without addresses or handles.
    lines: lines.slice(Math.max(0, at - 3), at + 4).filter((line) => line.length <= 80 && !line.includes('@')),
    plan: lines.find((line) => line.length <= 70 && /(?:\s+plan|計劃|计划|方案)$/i.test(line)),
    weeklyUsedPct,
    weeklyReset: reset?.[1].trim(),
    extraUsedPct: extraLine === undefined ? undefined : percent(extraLine),
    extraLeft: extraLine === undefined ? undefined : /\(([^)]+)\)/.exec(extraLine)?.[1].trim(),
  }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DAY_MS = 24 * 60 * 60_000

/**
 * Start of the reset day in local time, as the panel names a day without year. Undefined when it cannot be read,
 * or is not within the coming week: then the caller's fixed pause applies.
 */
export function museResetAt(label: string | undefined, now = Date.now()): number | undefined {
  const text = String(label || '').normalize('NFKC').toLowerCase()
  const zh = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]/.exec(text)
  const en = /\b([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?!\d)/.exec(text) ?? null
  const enDayFirst = /\b(\d{1,2})\s+([a-z]{3})[a-z]*/.exec(text)
  let month = zh ? Number(zh[1]) - 1 : en ? MONTHS.indexOf(en[1]) : -1
  let day = zh ? Number(zh[2]) : en ? Number(en[2]) : 0
  if (month < 0 && enDayFirst) { month = MONTHS.indexOf(enDayFirst[2]); day = Number(enDayFirst[1]) }
  if (month < 0 || month > 11) return undefined
  const year = new Date(now).getFullYear()
  for (const candidate of [year, year + 1]) {
    const date = new Date(candidate, month, day)
    if (date.getMonth() !== month || date.getDate() !== day) continue
    if (date.getTime() > now && date.getTime() <= now + 8 * DAY_MS) return date.getTime()
  }
  return undefined
}

/** Weekly allowance gone, and no extra tokens to fall back on. */
export const museQuotaUsedUp = (quota: Pick<MuseQuota, 'weeklyUsedPct' | 'extraUsedPct'>) =>
  quota.weeklyUsedPct >= 100 && (quota.extraUsedPct === undefined || quota.extraUsedPct >= 100)

export async function readMuseQuota(
  proxy: MuseProxy,
  cookies: MuseCookie[],
  options: { museUrl?: string; headless?: boolean; readyMs?: number; stepMs?: number; pollMs?: number } = {},
): Promise<{ quota: MuseQuota; cookies?: MuseCookie[] }> {
  const o = { museUrl: 'https://muse.ai/', headless: false, readyMs: 120_000, stepMs: 15_000, pollMs: 250, ...options }
  const browser = await launchMuseBrowser(proxy, { headless: o.headless })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: { cookies, origins: [] } })
    const page: any = await context.newPage()
    const until = async <T>(ms: number, read: () => Promise<T | null | undefined | false | ''>, message: string): Promise<T> => {
      for (const end = Date.now() + ms; Date.now() < end;) {
        const value = await read()
        if (value) return value
        await new Promise((resolve) => setTimeout(resolve, o.pollMs))
      }
      throw new Error(message)
    }
    const click = async (script: string, message: string) => {
      const element = await until<any>(o.stepMs, async () => (await page.evaluateHandle(script)).asElement(), message)
      await element.click({ timeout: 10_000 })
    }
    try {
      await page.goto(new URL('/thread/new', o.museUrl).href, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    } catch (error) {
      if (/ERR_(?:PROXY|TUNNEL|SOCKS|CONNECTION|EMPTY|TIMED)/.test(String(error))) throw new MuseProxyError('代理连接失败，未使用本机网络')
      throw new Error('Muse 页面打不开')
    }
    await until(o.readyMs, async () => (await page.evaluate(READY_SCRIPT).catch(() => '')) === 'ready', 'Muse 页面没有就绪')
    await click(SETTINGS_SCRIPT, '找不到 Muse 的设置入口')
    await click(MENU_SCRIPT, '找不到 Muse 设置菜单里的设置项')
    const parsed = await until(o.stepMs, async () => parseMuseQuota(await page.evaluate(DIALOG_SCRIPT).catch(() => '')), '额度面板里没有读到用量')
    const current = ((await context.cookies()) as MuseCookie[]).filter((cookie) => isMuseDomain(cookie.domain))
    return { quota: { ...parsed, checkedAt: Date.now() }, cookies: museSessionValue(current) ? current : undefined }
  } catch (error) {
    if (error instanceof MuseProxyError || /^(?:Muse|找不到|额度)/.test(error instanceof Error ? error.message : '')) throw error
    throw new Error('读取额度失败')
  } finally {
    await browser.close().catch(() => undefined)
  }
}
