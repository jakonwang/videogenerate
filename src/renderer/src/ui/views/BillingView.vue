<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { CalendarClock, Crown, LaptopMinimal, LoaderCircle, LogOut, ReceiptText, RefreshCw, ShieldCheck, UserRound, WifiOff } from 'lucide-vue-next'
import type { CloudDevice, CloudOrder } from '../../../../shared/cloud/types'
import CloudPurchasePanel from '../components/cloud/CloudPurchasePanel.vue'
import { useCloudAuthStore } from '@/stores/cloudAuth'

const PERMANENT_AT = 253402214400000

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const cloudAuth = useCloudAuthStore()

const loading = ref(false)
const devices = ref<CloudDevice[]>([])
const maxDevices = ref(0)
const maxMobileDevices = ref(1)
const orders = ref<CloudOrder[]>([])
const supportContact = ref('')
const message = ref<{ tone: 'accent' | 'danger'; text: string } | null>(null)
const unbinding = ref('')

const status = computed(() => cloudAuth.status)
const lockedFeature = computed(() => (typeof route.query.feature === 'string' ? route.query.feature : ''))

function formatTime(value?: number | null) {
  if (!value) return '—'
  if (value >= PERMANENT_AT) return t('cloud.membership.permanent')
  return new Date(value).toLocaleString(locale.value)
}

const planLabel = computed(() => {
  const s = status.value
  if (!s) return '—'
  if (s.mode === 'off' && !s.loggedIn) return t('cloud.membership.internalBuild')
  if (s.unlimited) return t('cloud.membership.unlimited')
  return s.planName || t('cloud.membership.none')
})

const expiresLabel = computed(() => {
  const s = status.value
  if (!s) return '—'
  if (s.unlimited) return t('cloud.membership.unlimited')
  return formatTime(s.planExpiresAt)
})

async function load() {
  loading.value = true
  try {
    await cloudAuth.refresh()
    if (!status.value?.loggedIn) return
    const [me, orderList, config] = await Promise.all([window.api.cloud.me(), window.api.cloud.listOrders(), window.api.cloud.getConfig()])
    if (me.ok) {
      devices.value = me.devices
      maxDevices.value = me.entitlement.maxDevices
      maxMobileDevices.value = me.entitlement.maxMobileDevices ?? 1
    }
    if (orderList.ok) orders.value = orderList.items
    if (config.ok) supportContact.value = String(config.values['support.contact'] ?? '')
  } finally {
    loading.value = false
  }
}

async function unbind(device: CloudDevice) {
  if (!window.confirm(t('cloud.membership.unbindConfirm'))) return
  unbinding.value = device.id
  message.value = null
  try {
    const result = await window.api.cloud.unbindDevice(device.id)
    if (!result.ok) {
      message.value = { tone: 'danger', text: result.error }
      return
    }
    devices.value = result.devices
    cloudAuth.setStatus(result.status)
    if (device.machineId === status.value?.machineId && status.value.mode === 'enforced') void router.replace('/login')
  } finally {
    unbinding.value = ''
  }
}

async function logout() {
  if (!window.confirm(t('cloud.membership.logoutConfirm'))) return
  const result = await window.api.cloud.logout()
  if (result.ok) cloudAuth.setStatus(result.status)
  devices.value = []
  orders.value = []
  if (result.ok && result.status.mode === 'enforced') void router.replace('/login')
}

onMounted(() => void load())
</script>

<template>
  <div class="vg-scope vg-page membership" data-testid="membership-page">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><ShieldCheck :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('cloud.membership.title') }}</h1>
        <p>{{ t('cloud.membership.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button class="vg-btn" type="button" :disabled="loading" @click="load">
          <LoaderCircle v-if="loading" :size="15" class="vg-spin" />
          <RefreshCw v-else :size="15" />
          {{ t('cloud.membership.refresh') }}
        </button>
        <button v-if="status?.loggedIn" class="vg-btn vg-btn--ghost" type="button" data-testid="membership-logout" @click="logout">
          <LogOut :size="15" /> {{ t('cloud.membership.logout') }}
        </button>
        <RouterLink v-else class="vg-btn vg-btn--primary" to="/login">{{ t('cloud.login.submitLogin') }}</RouterLink>
      </div>
    </header>

    <div v-if="lockedFeature" class="vg-notice vg-notice--warning"><span>{{ t('cloud.membership.featureLocked') }}</span></div>
    <div v-if="status?.offline && status.tokenExpiresAt" class="vg-notice vg-notice--warning">
      <WifiOff :size="15" /><span>{{ t('cloud.membership.offline', { time: formatTime(status.tokenExpiresAt) }) }}</span>
    </div>
    <div v-if="status?.mode === 'off'" class="vg-notice"><span>{{ t('cloud.membership.internalBuild') }}</span></div>
    <div v-if="message" class="vg-notice" :class="message.tone === 'danger' ? 'vg-notice--danger' : 'vg-notice--accent'"><span>{{ message.text }}</span></div>

    <section class="vg-stats">
      <div class="vg-stat">
        <span class="vg-stat__icon"><UserRound :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('cloud.membership.account') }}</span><span class="vg-stat__value membership__stat-text">{{ status?.account || '—' }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--violet"><Crown :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('cloud.membership.plan') }}</span><span class="vg-stat__value membership__stat-text" data-testid="membership-plan">{{ planLabel }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--amber"><CalendarClock :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('cloud.membership.expires') }}</span><span class="vg-stat__value membership__stat-text">{{ expiresLabel }}</span></span>
      </div>
    </section>

    <div class="vg-split membership__layout">
      <div class="vg-stack">
        <CloudPurchasePanel v-if="status?.loggedIn && !status.unlimited" @activated="load" />

        <section v-if="status?.loggedIn" class="vg-card vg-card--flush">
          <div class="vg-card__head">
            <span class="vg-card__title"><ReceiptText :size="16" /> {{ t('cloud.membership.ordersTitle') }}</span>
          </div>
          <table v-if="orders.length" class="vg-table">
            <tbody>
              <tr v-for="order in orders.slice(0, 12)" :key="order.orderNo">
                <td>{{ order.planName }}</td>
                <td class="num">¥{{ (order.amountFen / 100).toFixed(2) }}</td>
                <td>
                  <span class="vg-pill vg-pill--dot" :class="order.status === 'paid' ? 'vg-pill--green' : order.status === 'refunded' ? 'vg-pill--red' : 'vg-pill--amber'">
                    {{ t(`cloud.orderStatus.${order.status}`) }}
                  </span>
                </td>
                <td class="vg-secondary vg-num">{{ formatTime(order.paidAt || order.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="vg-empty"><p>{{ t('cloud.membership.noOrders') }}</p></div>
        </section>
      </div>

      <aside class="vg-stack">
        <section v-if="status?.loggedIn" class="vg-card">
          <div class="vg-card__head">
            <span class="vg-card__title">
              <LaptopMinimal :size="16" /> {{ t('cloud.membership.devices') }}
              <small>{{ maxDevices === 0 ? t('cloud.membership.devicesUnlimited') : t('cloud.membership.devicesDesc', { max: maxDevices, mobile: maxMobileDevices }) }}</small>
            </span>
          </div>
          <div class="vg-list">
            <div v-for="device in devices" :key="device.id" class="vg-list__item">
              <span class="vg-list__main">
                <span class="vg-list__title">
                  {{ device.name || device.id }}
                  <span v-if="device.machineId === status?.machineId" class="vg-pill vg-pill--accent">{{ t('cloud.membership.thisDevice') }}</span>
                </span>
                <span class="vg-list__sub">{{ device.platform }} · {{ t('cloud.membership.lastSeen', { time: formatTime(device.lastSeenAt) }) }}</span>
              </span>
              <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" :disabled="unbinding === device.id" @click="unbind(device)">{{ t('cloud.membership.unbind') }}</button>
            </div>
            <div v-if="!devices.length" class="vg-empty"><p>—</p></div>
          </div>
        </section>
        <p v-if="supportContact" class="vg-muted membership__support">{{ t('cloud.membership.support', { contact: supportContact }) }}</p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.membership { width: min(1408px, 100%); margin: 0 auto; }
.membership__stat-text { font-size: 16px; overflow: hidden; text-overflow: ellipsis; }
.membership__support { font-size: 12px; }
</style>
