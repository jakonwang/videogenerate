import { normalizeDateInput } from './calculator'
import type { ParsedShipmentLine } from './types'

const skuKeys = ['productDisplaySku', 'displaySku', 'sellerSku', 'seller_sku', 'itemSku', 'item_sku', 'skuCode', 'productSku', 'product_sku', 'sku']
const imageKeys = ['productImg', 'oriProductImg', 'productImage', 'product_image', 'imageUrl', 'image_url', 'imgUrl', 'img_url', 'thumbnailUrl', 'thumbnail_url', 'pictureUrl', 'picture_url']
const fallbackImageKeys = ['oriProductImg', 'originalProductImg', 'original_product_img', 'originalImageUrl', 'original_image_url']
const quantityKeys = ['quantity', 'qty', 'productNum', 'product_num', 'productCount', 'product_count', 'itemCount', 'item_count', 'itemQuantity', 'item_quantity', 'count', 'num', 'number']
const dateKeys = ['shippedTimeStr', 'shippedAt', 'shipped_at', 'shippedDate', 'shipped_date', 'shippedTime', 'shipped_time', 'shipTime', 'ship_time', 'shipDate', 'ship_date', 'deliveryTime', 'delivery_time', 'deliveryDate', 'delivery_date', 'deliverTime', 'deliver_time', 'deliveredAt', 'delivered_at']
const orderKeys = ['packageId', 'package_id', 'orderId', 'order_id', 'orderNo', 'order_no', 'orderNumber', 'order_number', 'packageNo', 'package_no', 'packageNumber', 'package_number', 'number']
const lineKeys = ['lineId', 'line_id', 'itemId', 'item_id', 'id', 'productId', 'product_id']
const statusKeys = ['status', 'state', 'orderState', 'order_state', 'orderStatus', 'order_status', 'packageState', 'package_state', 'packageStatus', 'package_status', 'commitPlatformStatus', 'commitPlatform', 'commit_platform', 'shippingStatus', 'shipping_status']
const recordArrayKeys = ['rows', 'records', 'items', 'orders', 'packages', 'list', 'lists', 'data']

type WalkContext = {
  date?: string
  orderKey?: string
  excluded: boolean
  statusAllowed: boolean
}

function textValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
  return ''
}

function directValue(object: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = textValue(object[key])
    if (value) return value
  }
  return ''
}

function directImageUrl(object: Record<string, unknown>, keys = imageKeys) {
  for (const key of keys) {
    const value = textValue(object[key])
    if (/^https?:\/\//i.test(value)) return value.slice(0, 4096)
  }
  return ''
}

function firstDate(value: unknown) {
  const text = textValue(value)
  const match = /\d{4}-\d{2}-\d{2}/.exec(text)
  if (match) return normalizeDateInput(match[0])
  if (!/^\d{10,13}$/.test(text)) return ''
  const numeric = Number(text)
  const date = new Date(text.length === 10 ? numeric * 1000 : numeric)
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function excludedStatus(value: unknown) {
  const text = textValue(value)
  if (!text) return false
  return /refund|refunded|void|cancel|fail|closed|\u9000\u6b3e|\u6401\u7f6e|\u5931\u8d25|\u53d6\u6d88|\u5173\u95ed/i.test(text)
}

function truthyFlag(value: unknown) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function directQuantity(object: Record<string, unknown>) {
  const value = Number(directValue(object, quantityKeys))
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function directDate(object: Record<string, unknown>) {
  for (const key of dateKeys) {
    const date = firstDate(object[key])
    if (date) return date
  }
  return ''
}

function directOrderKey(object: Record<string, unknown>) {
  return directValue(object, orderKeys)
}

function directLineKey(object: Record<string, unknown>) {
  return directValue(object, lineKeys)
}

function directExcluded(object: Record<string, unknown>) {
  if (truthyFlag(object.isVoided) || truthyFlag(object.isRemoved) || truthyFlag(object.refunded) || truthyFlag(object.isRefunded)) return true
  return statusKeys.some((key) => excludedStatus(object[key]))
}

function successfulStatus(value: unknown) {
  const text = textValue(value).toLowerCase()
  if (!text) return true
  return /success|shipped|shipping_success|delivered|finished|finish|completed|complete|\u5df2\u53d1\u8d27|\u53d1\u8d27\u6210\u529f|\u5df2\u5b8c\u6210|\u5b8c\u6210|\u6210\u529f/i.test(text)
}

function hasOnlySuccessfulStatus(object: Record<string, unknown>) {
  const statuses = statusKeys.map((key) => textValue(object[key])).filter(Boolean)
  return statuses.length === 0 || statuses.every(successfulStatus)
}

function walkResponse(value: unknown, targetSku: string, context: WalkContext, output: ParsedShipmentLine[], counter: { value: number }) {
  if (Array.isArray(value)) {
    for (const entry of value) walkResponse(entry, targetSku, context, output, counter)
    return
  }
  if (!value || typeof value !== 'object') return
  const object = value as Record<string, unknown>
  const date = directDate(object) || context.date
  const orderKey = context.orderKey || directOrderKey(object)
  const excluded = context.excluded || directExcluded(object)
  const statusAllowed = context.statusAllowed && hasOnlySuccessfulStatus(object)
  const sku = directValue(object, skuKeys)
  const quantity = directQuantity(object)
  if (sku && sku.toLowerCase() === targetSku.toLowerCase() && quantity > 0 && date && !excluded && statusAllowed) {
    output.push({
      sku,
      imageUrl: directImageUrl(object) || undefined,
      imageFallbackUrl: directImageUrl(object, fallbackImageKeys) || undefined,
      date,
      quantity,
      orderKey: orderKey || `row-${counter.value}`,
      lineKey: directLineKey(object) || undefined,
    })
  }
  counter.value += 1
  for (const child of Object.values(object)) {
    walkResponse(child, targetSku, { date, orderKey, excluded, statusAllowed }, output, counter)
  }
}

export function parseDianxiaomiShipmentLines(payload: unknown, sku: string) {
  const output: ParsedShipmentLine[] = []
  walkResponse(payload, String(sku || '').trim(), { excluded: false, statusAllowed: true }, output, { value: 0 })
  return output
}

export function aggregateShipmentLines(lines: ParsedShipmentLine[]) {
  const deduped = new Map<string, ParsedShipmentLine>()
  for (const line of lines) {
    const key = `${line.date}|${line.orderKey}|${line.lineKey || line.sku}`
    if (!deduped.has(key)) deduped.set(key, line)
  }
  const byDate = new Map<string, { quantity: number; orderKeys: Set<string> }>()
  for (const line of deduped.values()) {
    const current = byDate.get(line.date) || { quantity: 0, orderKeys: new Set<string>() }
    current.quantity += Math.max(0, Math.trunc(line.quantity))
    current.orderKeys.add(line.orderKey)
    byDate.set(line.date, current)
  }
  return new Map([...byDate.entries()].map(([date, value]) => [date, { quantity: value.quantity, orderCount: value.orderKeys.size }]))
}

export function responseRecordCount(payload: unknown) {
  if (Array.isArray(payload)) return payload.length
  let best = 0
  const visit = (value: unknown, key = '') => {
    if (Array.isArray(value)) {
      if (recordArrayKeys.includes(key)) best = Math.max(best, value.length)
      for (const item of value) visit(item)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) visit(child, childKey)
  }
  visit(payload)
  return best
}

export function responseTotalCount(payload: unknown) {
  const keys = ['total', 'totalCount', 'total_count', 'totalRecord', 'totalRecords', 'recordCount', 'record_count', 'totalSize', 'total_size']
  let found = 0
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const object = value as Record<string, unknown>
    for (const key of keys) {
      const candidate = Number(object[key])
      if (Number.isFinite(candidate) && candidate >= 0) found = Math.max(found, Math.trunc(candidate))
    }
    for (const child of Object.values(object)) visit(child)
  }
  visit(payload)
  return found
}
