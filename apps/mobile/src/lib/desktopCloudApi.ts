import type { CloudPayChannel } from '@shared/cloud/types'
import { statusFromSession } from './desktopShims/cloudAuth'
import { cloud, errorMessage, refreshAccount, session, signOut } from './session'

/**
 * 网页版的 window.api.cloud（电脑端「账号与会员」页原样复用）：同样的方法和 `{ ok, ... }` 返回格式，
 * 直接调用网页已登录的云端接口。
 */

async function wrap<T extends object>(run: () => Promise<T>): Promise<({ ok: true } & T) | { ok: false; error: string }> {
  try {
    return { ok: true, ...(await run()) }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

export function installDesktopCloudApi() {
  const w = window as unknown as { api?: Record<string, unknown> }
  w.api ??= {}
  w.api.cloud = {
    getStatus: async () => statusFromSession(),
    refresh: async () => {
      await refreshAccount()
      return statusFromSession()
    },
    me: () => wrap(() => cloud.me()),
    listPlans: () => wrap(() => cloud.listPlans()),
    listOrders: () => wrap(() => cloud.listOrders()),
    getConfig: () => wrap(() => cloud.getConfig()),
    createOrder: (input: { planCode: string; channel: CloudPayChannel }) => wrap(() => cloud.createOrder(input)),
    getOrder: (orderNo: string) =>
      wrap(async () => {
        const { order } = await cloud.getOrder(orderNo)
        if (order.status === 'paid') await refreshAccount()
        return { order, status: statusFromSession() }
      }),
    mockPay: (orderNo: string) =>
      wrap(async () => {
        const { order } = await cloud.mockPay(orderNo)
        await refreshAccount()
        return { order, status: statusFromSession() }
      }),
    redeem: (code: string) =>
      wrap(async () => {
        const result = await cloud.redeem(code)
        await refreshAccount()
        return { status: statusFromSession(), redeemed: result.redeemed, credits: result.credits }
      }),
    credits: (page?: number) => wrap(() => cloud.credits(page ?? 1)),
    unbindDevice: (deviceId: string) =>
      wrap(async () => {
        const { devices } = await cloud.unbindDevice(deviceId)
        return { devices, activation: null, status: statusFromSession() }
      }),
    logout: () =>
      wrap(async () => {
        await signOut(true)
        return { status: statusFromSession() }
      }),
    onStatusChanged: () => () => undefined,
  }
  void session
}
