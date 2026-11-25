import type { LiveRoomView } from '../../../../../shared/liveAccounts'

/** 直播页面的汇总：都从场次算，方便按账号和时间段切换、和上一段比较。 */

export type LiveKpis = {
  rooms: number
  hours: number
  gmv: number
  sales: number
  views: number
  impressions: number
  /** 商品曝光、点击（次数） */
  exposures: number
  clicks: number
  carts: number
  orders: number
  assigned: number
  productGmv: number
}

export function sumRooms(rooms: LiveRoomView[]): LiveKpis {
  const out: LiveKpis = { rooms: rooms.length, hours: 0, gmv: 0, sales: 0, views: 0, impressions: 0, exposures: 0, clicks: 0, carts: 0, orders: 0, assigned: 0, productGmv: 0 }
  for (const room of rooms) {
    out.hours += (room.endAt - room.startAt) / 3_600_000
    out.gmv += room.gmv
    out.sales += room.sales
    out.views += room.views
    out.impressions += room.impressions
    for (const product of room.products) {
      out.exposures += product.exposures
      out.clicks += product.clicks
      out.carts += product.carts
      out.orders += product.orders
      out.productGmv += product.gmv
      out.assigned += Math.min(product.gmv, product.codes.reduce((sum, item) => sum + item.gmv, 0))
    }
  }
  return out
}

export const per = (part: number, whole: number) => (whole > 0 ? part / whole : undefined)

export type LiveStyle = { code: string; image?: string; name: string; /** 有出单的场次 */ soldRooms: number; exposures: number; clicks: number; carts: number; /** 直播实测的成交，算比率用 */ measuredOrders: number; measuredGmv: number; orders: number; sales: number; gmv: number; estimated: boolean; share: number }

export function stylesOf(rooms: LiveRoomView[]): LiveStyle[] {
  const map = new Map<string, LiveStyle & { ids: Set<string>; best: number }>()
  let total = 0
  for (const room of rooms) {
    for (const product of room.products) {
      total += product.gmv
      for (const share of product.codes) {
        const entry = map.get(share.code) || { code: share.code, name: product.name, image: product.image, soldRooms: 0, exposures: 0, clicks: 0, carts: 0, measuredOrders: 0, measuredGmv: 0, orders: 0, sales: 0, gmv: 0, estimated: false, share: 0, ids: new Set<string>(), best: -1 }
        if (share.sales > 0) entry.ids.add(room.id)
        entry.exposures += share.exposures
        entry.clicks += share.clicks
        entry.carts += share.carts
        if (!share.estimated) { entry.measuredOrders += share.orders; entry.measuredGmv += share.gmv }
        entry.orders += share.orders
        entry.sales += share.sales
        entry.gmv += share.gmv
        entry.estimated ||= share.estimated
        // 图和标题用这个款自己的链接，不用多款共用的链接
        const rank = (share.estimated ? 0 : 1e12) + share.gmv
        if (rank > entry.best) { entry.best = rank; entry.image = product.image; entry.name = product.name }
        map.set(share.code, entry)
      }
    }
  }
  return [...map.values()].map(({ ids, best: _best, ...item }) => ({ ...item, soldRooms: ids.size, share: total ? item.gmv / total : 0 })).sort((a, b) => b.gmv - a.gmv || b.clicks - a.clicks)
}

export type LiveLoose = { productId: string; name: string; image?: string; sessions: number; sales: number; gmv: number; share: number; generic: boolean }

/** 归不到款的链接：只列有成交的在前 */
export function looseOf(rooms: LiveRoomView[], generic: Map<string, boolean>): LiveLoose[] {
  const map = new Map<string, LiveLoose & { ids: Set<string> }>()
  let total = 0
  for (const room of rooms) {
    for (const product of room.products) {
      total += product.gmv
      if (!generic.has(product.productId)) continue
      const entry = map.get(product.productId) || { productId: product.productId, name: product.name, image: product.image, sessions: 0, sales: 0, gmv: 0, share: 0, generic: generic.get(product.productId)!, ids: new Set<string>() }
      entry.ids.add(room.id)
      entry.sales += product.sales
      entry.gmv += product.gmv
      map.set(product.productId, entry)
    }
  }
  return [...map.values()].map(({ ids, ...item }) => ({ ...item, sessions: ids.size, share: total ? item.gmv / total : 0 })).sort((a, b) => b.gmv - a.gmv)
}

export type LiveSlot = { hour: number; rooms: number; gmv: number; hours: number; perHour: number }

/** 按开播钟点（账号所在时区）看每小时成交额 */
export function slotsOf(rooms: LiveRoomView[], hourOf: (ms: number) => number): LiveSlot[] {
  const map = new Map<number, LiveSlot>()
  for (const room of rooms) {
    const hour = hourOf(room.startAt)
    const slot = map.get(hour) || { hour, rooms: 0, gmv: 0, hours: 0, perHour: 0 }
    slot.rooms += 1
    slot.gmv += room.gmv
    slot.hours += (room.endAt - room.startAt) / 3_600_000
    map.set(hour, slot)
  }
  return [...map.values()].map((slot) => ({ ...slot, perHour: slot.hours > 0 ? slot.gmv / slot.hours : 0 })).sort((a, b) => a.hour - b.hour)
}

export type LiveDay = { date: string; gmv: number; sales: number; views: number; hours: number }

/** 连续日期，没直播的那天是 0 */
export function daysOf(rooms: LiveRoomView[], dates: string[], dateOf: (ms: number) => string): LiveDay[] {
  const map = new Map(dates.map((date): [string, LiveDay] => [date, { date, gmv: 0, sales: 0, views: 0, hours: 0 }]))
  for (const room of rooms) {
    const day = map.get(dateOf(room.startAt))
    if (!day) continue
    day.gmv += room.gmv
    day.sales += room.sales
    day.views += room.views
    day.hours += (room.endAt - room.startAt) / 3_600_000
  }
  return [...map.values()]
}
