import {
  PRODUCT_RESEARCH_SOURCES,
  researchCurrencyOf,
  researchSourceOf,
  type ProductResearchSource,
} from '../../../../../shared/productResearch'
import type {
  ProductResearchLiveTestRecord,
  ProductResearchResult,
  ProductResearchSchemeStatus,
  ProductResearchTaskStatus,
} from '../../../../../shared/productResearch'

export type SchemeFormValue = { name: string; need: string; market: string; keywords: string[]; note: string }

export type MarketOption = { value: string; label: string; flag: string; currency: string }

export const MARKET_OPTIONS: MarketOption[] = [
  { value: 'VN', label: '越南', flag: '🇻🇳', currency: 'VND' },
  { value: 'TH', label: '泰国', flag: '🇹🇭', currency: 'THB' },
  { value: 'ID', label: '印尼', flag: '🇮🇩', currency: 'IDR' },
  { value: 'MY', label: '马来西亚', flag: '🇲🇾', currency: 'MYR' },
  { value: 'PH', label: '菲律宾', flag: '🇵🇭', currency: 'PHP' },
]

export function marketOf(code?: string): MarketOption {
  return MARKET_OPTIONS.find((item) => item.value === code) || { value: code || '', label: code || '-', flag: '🌐', currency: '' }
}

export const SOP_STEPS = [
  { name: '商品采集', hint: '搜索词采集商品' },
  { name: '分析商品', hint: '筛选与对比分析' },
  { name: '确定商品', hint: '类目、售价与卖点' },
  { name: '直播测试', hint: '单品直播测试数据' },
  { name: '获得爆款商品', hint: '分层结论与输出' },
]

export const SCHEME_STATUS_OPTIONS: { value: ProductResearchSchemeStatus; label: string }[] = [
  { value: 'draft', label: '草稿' },
  { value: 'active', label: '进行中' },
  { value: 'pending', label: '待验证' },
  { value: 'completed', label: '已完成' },
]

export function schemeStatusLabel(status?: string) {
  return SCHEME_STATUS_OPTIONS.find((item) => item.value === status)?.label || status || '-'
}

export function stageLabel(stage?: number) {
  return SOP_STEPS[(stage || 1) - 1]?.name || `步骤 ${stage}`
}

export const TASK_STATUS_LABEL: Record<ProductResearchTaskStatus, string> = {
  queued: '排队中',
  running: '采集中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

export const KEYWORD_STATUS_LABEL: Record<string, string> = {
  pending: '待采集',
  running: '采集中',
  collected: '已采集',
  failed: '失败',
}

export type Conclusion = Exclude<ProductResearchLiveTestRecord['conclusion'], ''>

export const CONCLUSIONS: { value: Conclusion; label: string; tier: string; advice: string; icon: string }[] = [
  { value: 'excellent', label: '值得放量', tier: '爆款商品', advice: '数据优秀，建议重点放量', icon: '🏆' },
  { value: 'potential', label: '潜力商品', tier: '潜力商品', advice: '转化稳定，可加大投放测试', icon: '💎' },
  { value: 'observe', label: '继续观察', tier: '待观察商品', advice: '表现一般，建议优化直播场景', icon: '👁' },
  { value: 'eliminate', label: '淘汰', tier: '淘汰商品', advice: '表现不佳，移出选品池', icon: '✕' },
]

export function conclusionMeta(value?: string) {
  return CONCLUSIONS.find((item) => item.value === value)
}

export const CATEGORY_PRESETS = [
  { value: '耳饰 (Bông tai)', icon: '🎧' },
  { value: '项链 (Dây chuyền)', icon: '📿' },
  { value: '手链 (Vòng tay)', icon: '⭕' },
  { value: '戒指 (Nhẫn)', icon: '💍' },
  { value: '饰品套装 (Bộ trang sức)', icon: '🎁' },
  { value: '包袋 (Túi xách)', icon: '👜' },
  { value: '手机配件 (Phụ kiện điện thoại)', icon: '📱' },
  { value: '家居小物 (Đồ gia dụng)', icon: '🏠' },
]

export function pad2(value: number) {
  return String(value).padStart(2, '0')
}

export function formatDate(ts?: number) {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function formatDay(ts?: number) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function formatDuration(ms?: number) {
  if (!ms || ms < 0) return '-'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}分${pad2(seconds % 60)}秒`
}

export function formatNumber(value?: number) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '-'
  return Math.round(value).toLocaleString('en-US')
}

export function formatPercent(value: number, digits = 2) {
  if (!Number.isFinite(value)) return '0%'
  return `${value.toFixed(digits)}%`
}

export function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0
}

const CURRENCY_SYMBOLS: Record<string, string> = { CNY: '¥', USD: '$', VND: '₫', THB: '฿', PHP: '₱', MYR: 'RM', IDR: 'Rp', SGD: 'S$' }
const NO_DECIMALS = new Set(['VND', 'IDR'])
const CURRENCY_NAMES: Record<string, string> = { CNY: '人民币', USD: '美元', VND: '越南盾', THB: '泰铢', PHP: '比索', MYR: '林吉特', IDR: '印尼盾', SGD: '新加坡元' }

/** 带货币符号的金额；保留分（¥5.9），越南盾等没有小数的币种取整。 */
export function formatMoney(value: number | undefined, currency: string) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '-'
  const text = value.toLocaleString('en-US', { maximumFractionDigits: NO_DECIMALS.has(currency) || Math.abs(value) >= 10000 ? 0 : 2 })
  const symbol = CURRENCY_SYMBOLS[currency]
  if (symbol) return currency === 'VND' ? `${text}${symbol}` : `${symbol}${text}`
  return currency ? `${text} ${currency}` : text
}

export function currencyName(currency: string) {
  return currency ? CURRENCY_NAMES[currency] || currency : '币种未知'
}

/** 价格数值：没识别出数值时从文字里取（手机有时只采到 "39"）。 */
export function priceOf(result: Pick<ProductResearchResult, 'priceValue' | 'priceText'>) {
  if (typeof result.priceValue === 'number' && Number.isFinite(result.priceValue)) return result.priceValue
  const match = /^\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*$/.exec((result.priceText || '').replace(/,/g, ''))
  return match ? Number(match[1]) : undefined
}

export function formatPrice(result: ProductResearchResult) {
  const value = priceOf(result)
  return value !== undefined ? formatMoney(value, researchCurrencyOf(result)) : result.priceText || '-'
}

export function gmvOf(result: ProductResearchResult) {
  const price = priceOf(result)
  return price && result.salesValue ? price * result.salesValue : 0
}

export function sourceLabel(source: ProductResearchSource) {
  return PRODUCT_RESEARCH_SOURCES[source].label
}

/** 商品里出现过的来源平台 / 币种（保持出现顺序） */
export function sourcesOf(results: ProductResearchResult[]) {
  return [...new Set(results.map((item) => researchSourceOf(item)))]
}

export function currenciesOf(results: ProductResearchResult[]) {
  return [...new Set(results.map((item) => researchCurrencyOf(item)))]
}

/** 不同币种的金额不能相加：按币种分别合计，"¥1,200 + 35,000₫" 分行展示。 */
export function sumByCurrency(results: ProductResearchResult[], pick: (item: ProductResearchResult) => number) {
  const totals = new Map<string, number>()
  for (const item of results) {
    const value = pick(item)
    if (value) totals.set(researchCurrencyOf(item), (totals.get(researchCurrencyOf(item)) || 0) + value)
  }
  return [...totals].map(([currency, value]) => ({ currency, value }))
}

export function ratingOf(result: ProductResearchResult) {
  return typeof result.rating === 'number' && Number.isFinite(result.rating) ? result.rating : undefined
}

export function imageSrc(result?: Pick<ProductResearchResult, 'imagePath' | 'imageDataUrl'>) {
  if (!result) return ''
  if (result.imagePath) return `vg://file?path=${encodeURIComponent(result.imagePath)}`
  return result.imageDataUrl || ''
}

/** Splits a free-text keyword blob (one per line, or comma separated) into unique keywords. */
export function splitKeywords(text: string) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/[\n,，;；\t]/)) {
    const value = raw.replace(/^["'\s]+|["'\s]+$/g, '').trim()
    if (!value || seen.has(value.toLowerCase())) continue
    seen.add(value.toLowerCase())
    out.push(value)
  }
  return out
}

/** Reads keywords from a .txt / .csv / .xlsx file, one per row (first non-empty cell). */
export async function readKeywordFile(file: File): Promise<string[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const rows: string[] = []
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
      for (const row of data) {
        const cell = (row || []).find((value) => String(value ?? '').trim())
        if (cell !== undefined) rows.push(String(cell))
      }
    }
    return splitKeywords(rows.slice(0, 10000).join('\n'))
  }
  const text = await file.text()
  const lines = text.replace(/^﻿/, '').replace(/\r/g, '').split('\n').slice(0, 10000)
  const firstCells = name.endsWith('.csv') ? lines.map((line) => line.split(',')[0] || '') : lines
  return splitKeywords(firstCells.join('\n'))
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] || null)
    input.click()
  })
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function csvCell(value: unknown) {
  const text = value === undefined || value === null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Downloads a UTF-8 (BOM) CSV so Excel opens Vietnamese / Chinese text correctly. */
export function downloadCsv(fileName: string, headers: string[], rows: unknown[][]) {
  const body = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'export'
}

/** Builds a compact page list with ellipsis, e.g. [1, 2, 3, 4, 5, '…', 27]. */
export function pageItems(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const items: (number | '…')[] = [1]
  const start = Math.max(2, Math.min(current - 1, total - 4))
  const end = Math.min(total - 1, Math.max(current + 1, 5))
  if (start > 2) items.push('…')
  for (let page = start; page <= end; page += 1) items.push(page)
  if (end < total - 1) items.push('…')
  items.push(total)
  return items
}

/**
 * 需求匹配度（60-99）：商品本身来自方案搜索词，基础分 80；
 * 标题命中搜索词、命中客户需求中的关键词、销量与搜索排名靠前分别加分。
 */
export function matchScore(title: string, keyword: string, need: string, sales = 0, rank = 0) {
  const text = title.toLowerCase()
  const tokens = need
    .toLowerCase()
    .split(/[\s,，、。;；/|:：()（）]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !/^\d/.test(item))
  let score = 80
  if (keyword && text.includes(keyword.toLowerCase())) score += 6
  if (tokens.length) score += Math.round((tokens.filter((token) => text.includes(token)).length / tokens.length) * 8)
  if (sales >= 1000) score += 3
  if (sales >= 5000) score += 3
  if (sales >= 10000) score += 2
  if (rank > 0 && rank <= 10) score += 3
  else if (rank > 0 && rank <= 30) score += 1
  return Math.max(60, Math.min(99, score))
}
