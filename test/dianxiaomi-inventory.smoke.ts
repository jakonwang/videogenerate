import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import {
  buildZeroFilledShipments,
  computeInventorySkuSummary,
  inclusiveDayCount,
  shiftLocalDate,
  todayLocalDate,
} from '../src/main/modules/dianxiaomi-inventory/calculator'
import { buildAdvancedSearchPayload, type DianxiaomiClientLike } from '../src/main/modules/dianxiaomi-inventory/client'
import { dianxiaomiInventoryRepo } from '../src/main/modules/dianxiaomi-inventory/repo'
import {
  aggregateShipmentLines,
  parseDianxiaomiShipmentLines,
  responseRecordCount,
  responseTotalCount,
} from '../src/main/modules/dianxiaomi-inventory/parser'
import {
  dianxiaomiInventoryService,
  setDianxiaomiInventoryDependenciesForTest,
} from '../src/main/modules/dianxiaomi-inventory/service'
import type { DianxiaomiSearchPayload, InventorySku } from '../src/main/modules/dianxiaomi-inventory/types'

const now = Date.UTC(2026, 7, 5, 12, 0, 0)
const endDate = todayLocalDate(now)
const startDate = shiftLocalDate(endDate, -4)

function shipmentRow(input: {
  orderId: string
  shopId: string
  sku: string
  date: string
  quantity: number
  lineId: string
  state?: string
  commitPlatform?: string
  isVoided?: number
  isRemoved?: number
  imageUrl?: string
  imageFallbackUrl?: string
}) {
  return {
    orderId: input.orderId,
    shopId: input.shopId,
    orderState: input.state || 'shipped',
    commitPlatform: input.commitPlatform || 'success',
    shippedTime: `${input.date} 12:00:00`,
    isVoided: input.isVoided || 0,
    isRemoved: input.isRemoved || 0,
    products: [
      {
        productSku: input.sku,
        productCount: input.quantity,
        productId: input.lineId,
        productImg: input.imageUrl,
        oriProductImg: input.imageFallbackUrl,
      },
    ],
  }
}

function makePage(rows: unknown[], total?: number) {
  return { data: { rows, ...(total === undefined ? {} : { total }) } }
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dianxiaomi-inventory-'))
  configureAppPathRuntime({ dataDir: root })

  assert.deepEqual(buildAdvancedSearchPayload({
    sku: 'SKU-ALPHA',
    startDate,
    endDate,
    pageNo: 2,
    history: true,
  }), {
    searchTypes: 'productSku',
    contents: 'SKU-ALPHA',
    orderAdvSearchType: 1,
    state: '',
    isVoided: '-1',
    isRemoved: '-1',
    commitPlatforms: '',
    isOversea: '-1',
    shopId: '-1',
    platform: '',
    orderField: 'order_create_time',
    isDesc: '1',
    timeOut: '0',
    warehouseCode: '',
    isGreen: '0',
    isYellow: '0',
    isOrange: '0',
    isRed: '0',
    isViolet: '0',
    isBlue: '0',
    cornflowerBlue: '0',
    pink: '0',
    teal: '0',
    turquoise: '0',
    unmarked: '0',
    shippedStart: `${startDate} 00:00:00`,
    shippedEnd: `${endDate} 23:59:59`,
    pageNo: 2,
    pageSize: 100,
    history: '1',
    authId: '-1',
    days: '-1',
    isPrintJh: '-1',
    isPrintJhTemp: '-1',
    isPrintMd: '-1',
    signPriorShip: '-1',
    isHasOrderMessage: '-1',
    isHasOrderComment: '-1',
    isHasServiceComment: '-1',
    isHasPickComment: '-1',
    forbiddenStatus: '-1',
    forbiddenReason: '0',
    pickingInstructions: '',
    priceStart: '',
    priceEnd: '',
    orderCreateStart: '',
    orderCreateEnd: '',
    orderPayStart: '',
    orderPayEnd: '',
    applyTimeStart: '',
    applyTimeEnd: '',
    refundedStart: '',
    refundedEnd: '',
    mdSignStart: '',
    mdSignEnd: '',
    jhSignStart: '',
    jhSignEnd: '',
    timeOutQuery: '-1',
    productCountStart: '',
    productCountEnd: '',
    storageIds: '',
    storageId: '0',
    country: '',
    globalCollection: '-1',
    platformOrderStatus: '',
    productStatus: '',
  })

  const directPayload = {
    rows: [
      shipmentRow({ orderId: 'order-a', shopId: 'shop-a', sku: 'SKU-ALPHA', date: startDate, quantity: 2, lineId: 'line-a' }),
      shipmentRow({ orderId: 'order-b', shopId: 'shop-b', sku: 'SKU-ALPHA', date: shiftLocalDate(startDate, 2), quantity: 3, lineId: 'line-b' }),
      shipmentRow({ orderId: 'order-c', shopId: 'shop-c', sku: 'SKU-ALPHA', date: endDate, quantity: 5, lineId: 'line-c' }),
      shipmentRow({ orderId: 'order-refund', shopId: 'shop-a', sku: 'SKU-ALPHA', date: endDate, quantity: 50, lineId: 'line-refund', state: 'refound' }),
      shipmentRow({ orderId: 'order-fail', shopId: 'shop-a', sku: 'SKU-ALPHA', date: endDate, quantity: 50, lineId: 'line-fail', commitPlatform: 'fail' }),
      shipmentRow({ orderId: 'order-void', shopId: 'shop-a', sku: 'SKU-ALPHA', date: endDate, quantity: 50, lineId: 'line-void', isVoided: 1 }),
      shipmentRow({ orderId: 'order-pending', shopId: 'shop-a', sku: 'SKU-ALPHA', date: endDate, quantity: 50, lineId: 'line-pending', state: 'processed', commitPlatform: 'uncommit' }),
      shipmentRow({ orderId: 'order-other', shopId: 'shop-a', sku: 'SKU-OTHER', date: endDate, quantity: 50, lineId: 'line-other' }),
    ],
  }
  const directLines = parseDianxiaomiShipmentLines(directPayload, 'SKU-ALPHA')
  assert.equal(directLines.length, 3)
  assert.deepEqual([...aggregateShipmentLines(directLines).entries()], [
    [startDate, { quantity: 2, orderCount: 1 }],
    [shiftLocalDate(startDate, 2), { quantity: 3, orderCount: 1 }],
    [endDate, { quantity: 5, orderCount: 1 }],
  ])

  const realShapePayload = {
    code: 0,
    data: {
      page: {
        list: [{
          id: 'package-real',
          orderId: 'platform-order-real',
          orderState: 'shipped',
          commitPlatformStatus: 'success',
          shippedTime: new Date(`${endDate}T12:00:00`).getTime(),
          productList: [{
            id: 'line-real',
            productSku: '1735144578999813914',
            productDisplaySku: 'SKU-ALPHA',
            quantity: 2,
            productCount: 2,
            productImg: 'https://cdn.example.com/sku-alpha.jpg',
            oriProductImg: 'https://cdn.example.com/sku-alpha-original.jpg',
            dxmCpr: { sku: 'SKU-ALPHA', orderState: 'shipped' },
          }],
        }],
        pageNo: 1,
        pageSize: 100,
        totalSize: 1,
      },
    },
  }
  const realShapeLines = parseDianxiaomiShipmentLines(realShapePayload, 'SKU-ALPHA')
  assert.deepEqual(realShapeLines, [{
    sku: 'SKU-ALPHA',
    date: endDate,
    quantity: 2,
    orderKey: 'platform-order-real',
    lineKey: 'line-real',
    imageUrl: 'https://cdn.example.com/sku-alpha.jpg',
    imageFallbackUrl: 'https://cdn.example.com/sku-alpha-original.jpg',
  }])
  assert.equal(responseRecordCount(realShapePayload), 1)
  assert.equal(responseTotalCount(realShapePayload), 1)

  const pageOneRows = [
    shipmentRow({ orderId: 'order-a', shopId: 'shop-a', sku: 'SKU-ALPHA', date: startDate, quantity: 2, lineId: 'line-a', imageUrl: 'https://cdn.example.com/sku-alpha.jpg', imageFallbackUrl: 'https://cdn.example.com/sku-alpha-original.jpg' }),
    shipmentRow({ orderId: 'order-a', shopId: 'shop-a', sku: 'SKU-ALPHA', date: startDate, quantity: 2, lineId: 'line-a' }),
    ...Array.from({ length: 98 }, (_, index) => ({ id: `filler-${index}`, state: 'paid' })),
  ]
  const pageTwoRows = [
    shipmentRow({ orderId: 'order-b', shopId: 'shop-b', sku: 'SKU-ALPHA', date: shiftLocalDate(startDate, 2), quantity: 3, lineId: 'line-b' }),
    shipmentRow({ orderId: 'order-c', shopId: 'shop-c', sku: 'SKU-ALPHA', date: endDate, quantity: 5, lineId: 'line-c' }),
  ]

  let failOldSku = false
  const calls: DianxiaomiSearchPayload[] = []
  const client: DianxiaomiClientLike = {
    async getAuthStatus() {
      return { available: true, authenticated: true, checkedAt: now }
    },
    async openLogin() {
      return { ok: true as const }
    },
    async logout() {
      return { ok: true as const }
    },
    async search(payload) {
      calls.push(payload)
      if (payload.contents === 'SKU-OLD' && failOldSku) throw new Error('network timeout')
      if (payload.contents === 'SKU-ALPHA') return payload.pageNo === 1 ? makePage(pageOneRows, 102) : makePage(pageTwoRows, 102)
      if (payload.contents === 'SKU-OLD') return makePage([
        shipmentRow({ orderId: 'old-order', shopId: 'shop-old', sku: 'SKU-OLD', date: endDate, quantity: 4, lineId: 'old-line' }),
      ])
      return makePage([])
    },
    close() {},
  }
  setDianxiaomiInventoryDependenciesForTest({ now: () => now, client })

  await assert.rejects(
    () => dianxiaomiInventoryService.saveSku({ sku: '', baselineDate: startDate, baselineStock: 10 }),
    /SKU is required/,
  )

  const alpha = await dianxiaomiInventoryService.saveSku({
    sku: 'SKU-ALPHA',
    baselineDate: startDate,
    baselineStock: 20,
    forecastWindowDays: 5,
    warningDays: 5,
  })
  await assert.rejects(
    () => dianxiaomiInventoryService.saveSku({ sku: 'sku-alpha', baselineDate: startDate, baselineStock: 20 }),
    /already being tracked/,
  )

  const oldSku = await dianxiaomiInventoryService.saveSku({
    sku: 'SKU-OLD',
    baselineDate: startDate,
    baselineStock: 10,
  })
  const syncResult = await dianxiaomiInventoryService.sync({ skuId: alpha.id })
  assert.equal(syncResult.ok, true)
  assert.deepEqual(syncResult.syncedSkuIds, [alpha.id])
  assert.deepEqual(calls.map((call) => ({ sku: call.contents, page: call.pageNo, history: call.history })), [
    { sku: 'SKU-ALPHA', page: 1, history: '' },
    { sku: 'SKU-ALPHA', page: 2, history: '' },
  ])

  const alphaShipments = await dianxiaomiInventoryRepo.listShipments(alpha.id, startDate, endDate)
  assert.equal(alphaShipments.length, inclusiveDayCount(startDate, endDate))
  assert.deepEqual(alphaShipments.map((row) => row.quantity), [2, 0, 3, 0, 5])
  const alphaSummary = (await dianxiaomiInventoryService.getDashboard()).items.find((item) => item.id === alpha.id)
  assert(alphaSummary)
  assert.equal(alphaSummary.currentStock, 10)
  assert.equal(alphaSummary.imageUrl, 'https://cdn.example.com/sku-alpha.jpg')
  assert.equal(alphaSummary.imageFallbackUrl, 'https://cdn.example.com/sku-alpha-original.jpg')
  assert.equal(alphaSummary.windowShipmentQuantity, 10)
  assert.equal(alphaSummary.availableDays, 5)
  assert.equal(alphaSummary.averageDaily, 2)
  assert.equal(alphaSummary.daysToStockout, 5)
  assert.equal(alphaSummary.risk, 'reorder')

  const updatedAlpha = await dianxiaomiInventoryService.saveSku({
    id: alpha.id,
    sku: alpha.sku,
    baselineDate: alpha.baselineDate,
    baselineStock: 12,
    forecastWindowDays: 5,
    warningDays: 5,
  })
  assert.equal(updatedAlpha.baselineStock, 12)
  assert.equal((await dianxiaomiInventoryRepo.listShipments(alpha.id, startDate, endDate)).length, alphaShipments.length)
  const history = await dianxiaomiInventoryRepo.listBaselineChanges(alpha.id)
  assert.equal(history.length, 1)
  assert.deepEqual(history[0], {
    ...history[0],
    skuId: alpha.id,
    previousDate: startDate,
    previousStock: 20,
    nextDate: startDate,
    nextStock: 12,
  })

  await dianxiaomiInventoryService.sync({ skuId: oldSku.id })
  const oldBeforeFailure = await dianxiaomiInventoryRepo.listShipments(oldSku.id, startDate, endDate)
  failOldSku = true
  const failedSync = await dianxiaomiInventoryService.sync({ skuId: oldSku.id })
  assert.equal(failedSync.ok, false)
  assert.equal(failedSync.authRequired, false)
  assert.equal(failedSync.failed.length, 1)
  const oldAfterFailure = await dianxiaomiInventoryRepo.listShipments(oldSku.id, startDate, endDate)
  assert.deepEqual(oldAfterFailure, oldBeforeFailure)

  const noSalesSku: InventorySku = {
    id: 'no-sales',
    sku: 'NO-SALES',
    baselineDate: startDate,
    baselineStock: 10,
    forecastWindowDays: 5,
    warningDays: 7,
    createdAt: now,
    updatedAt: now,
    lastSyncAt: now,
  }
  const noSalesSummary = computeInventorySkuSummary(noSalesSku, buildZeroFilledShipments({
    skuId: noSalesSku.id,
    startDate,
    endDate,
    quantities: new Map(),
    syncedAt: now,
  }), now)
  assert.equal(noSalesSummary.risk, 'no_sales')
  assert.equal(noSalesSummary.daysToStockout, undefined)

  await rm(root, { recursive: true, force: true })
  console.log('dianxiaomi inventory smoke passed')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
