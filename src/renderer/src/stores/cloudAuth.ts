import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CloudFeature } from '../../../shared/cloud/types'

export type CloudLicenseStatus = Awaited<ReturnType<typeof window.api.cloud.getStatus>>

/** 路由 → 功能模块。套餐 features 不包含时，进入该页面会被引导到会员页 */
const ROUTE_FEATURES: Array<{ prefix: string; feature: CloudFeature }> = [
  { prefix: '/clone', feature: 'clone' },
  { prefix: '/production', feature: 'production' },
  { prefix: '/models', feature: 'models' },
  { prefix: '/asset-library', feature: 'asset-library' },
  { prefix: '/product-research', feature: 'product-research' },
  { prefix: '/plugins/tiktok-gmv-max-optimizer', feature: 'gmv-max' },
  { prefix: '/plugins/tiktok-creator-hub', feature: 'creator-hub' },
  { prefix: '/plugins', feature: 'plugins' },
]

export function featureForPath(path: string): CloudFeature | null {
  return ROUTE_FEATURES.find((item) => path === item.prefix || path.startsWith(`${item.prefix}/`) || path.startsWith(`${item.prefix}?`))?.feature ?? null
}

export const useCloudAuthStore = defineStore('cloudAuth', () => {
  const status = ref<CloudLicenseStatus | null>(null)
  let unsubscribe: (() => void) | null = null
  let loading: Promise<CloudLicenseStatus> | null = null

  async function ensureLoaded(): Promise<CloudLicenseStatus> {
    if (status.value) return status.value
    loading ??= window.api.cloud.getStatus().then((value) => {
      status.value = value
      unsubscribe ??= window.api.cloud.onStatusChanged((next) => {
        status.value = next
      })
      return value
    })
    return loading
  }

  async function refresh() {
    status.value = await window.api.cloud.refresh()
    return status.value
  }

  function setStatus(next: CloudLicenseStatus) {
    status.value = next
  }

  function hasFeature(feature: CloudFeature | null): boolean {
    const s = status.value
    if (!s || s.mode === 'off' || !feature) return true
    if (s.disabledFeatures?.includes(feature)) return false
    return s.licensed && (s.features.includes('*') || s.features.includes(feature))
  }

  const enforced = computed(() => status.value?.mode === 'enforced')
  const licensed = computed(() => Boolean(status.value?.licensed))

  return { status, enforced, licensed, ensureLoaded, refresh, setStatus, hasFeature }
})
