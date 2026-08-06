import type { InventoryDailyShipment, InventorySku, InventorySkuSummary } from './types'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function formatLocalDate(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

export function todayLocalDate(now = Date.now()) {
  return formatLocalDate(new Date(now))
}

export function shiftLocalDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00`)
  value.setDate(value.getDate() + Math.trunc(days))
  return formatLocalDate(value)
}

export function inclusiveDayCount(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`).getTime()
  const end = new Date(`${endDate}T00:00:00`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0
  return Math.floor((end - start) / 86400000) + 1
}

export function normalizeDateInput(value: unknown) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const date = new Date(`${text}T00:00:00`)
  return formatLocalDate(date) === text ? text : ''
}

function sumShipments(shipments: InventoryDailyShipment[], startDate: string, endDate: string) {
  return shipments
    .filter((item) => item.date >= startDate && item.date <= endDate)
    .reduce((total, item) => total + Math.max(0, Number(item.quantity) || 0), 0)
}

export function computeInventorySkuSummary(sku: InventorySku, shipments: InventoryDailyShipment[], now = Date.now()): InventorySkuSummary {
  const endDate = todayLocalDate(now)
  const configuredWindow = Math.min(365, Math.max(1, Math.trunc(Number(sku.forecastWindowDays) || 30)))
  const analysisStartDate = shiftLocalDate(endDate, -(configuredWindow - 1)) < sku.baselineDate
    ? sku.baselineDate
    : shiftLocalDate(endDate, -(configuredWindow - 1))
  const availableDays = inclusiveDayCount(analysisStartDate, endDate)
  const totalShipmentQuantity = sumShipments(shipments, sku.baselineDate, endDate)
  const windowShipmentQuantity = sumShipments(shipments, analysisStartDate, endDate)
  const currentStock = Math.trunc(Number(sku.baselineStock) || 0) - totalShipmentQuantity
  const averageDaily = availableDays > 0 ? windowShipmentQuantity / availableDays : 0
  const hasSync = Boolean(sku.lastSyncAt)
  let daysToStockout: number | undefined
  let risk: InventorySkuSummary['risk'] = 'not_synced'

  if (hasSync && currentStock <= 0) {
    daysToStockout = 0
    risk = 'out_of_stock'
  } else if (hasSync && averageDaily > 0) {
    daysToStockout = currentStock / averageDaily
    risk = daysToStockout <= sku.warningDays ? 'reorder' : 'healthy'
  } else if (hasSync) {
    risk = 'no_sales'
  }

  return {
    ...sku,
    currentStock,
    totalShipmentQuantity,
    windowShipmentQuantity,
    averageDaily,
    daysToStockout,
    risk,
    analysisStartDate,
    analysisEndDate: endDate,
    availableDays,
  }
}

export function buildZeroFilledShipments(input: {
  skuId: string
  startDate: string
  endDate: string
  quantities: Map<string, { quantity: number; orderCount: number }>
  syncedAt: number
}) {
  const rows: InventoryDailyShipment[] = []
  const totalDays = inclusiveDayCount(input.startDate, input.endDate)
  for (let index = 0; index < totalDays; index += 1) {
    const date = shiftLocalDate(input.startDate, index)
    const value = input.quantities.get(date)
    rows.push({
      id: `${input.skuId}:${date}`,
      skuId: input.skuId,
      date,
      quantity: Math.max(0, Math.trunc(Number(value?.quantity) || 0)),
      orderCount: Math.max(0, Math.trunc(Number(value?.orderCount) || 0)),
      syncedAt: input.syncedAt,
    })
  }
  return rows
}
