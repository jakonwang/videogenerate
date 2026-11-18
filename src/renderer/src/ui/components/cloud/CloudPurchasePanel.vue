<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { CheckCircle2, Crown, KeyRound, LoaderCircle, QrCode, X } from 'lucide-vue-next'
import type { CloudOrder, CloudPayChannel, CloudPlan } from '../../../../../shared/cloud/types'
import { useCloudAuthStore } from '@/stores/cloudAuth'

const emit = defineEmits<{ (e: 'activated'): void }>()

const { t } = useI18n()
const cloudAuth = useCloudAuthStore()

const plans = ref<CloudPlan[]>([])
const mobileSlots = ref(1)
const channels = ref<CloudPayChannel[]>([])
const selectedChannel = ref<CloudPayChannel | ''>('')
const loadError = ref('')
const message = ref<{ tone: 'accent' | 'danger'; text: string } | null>(null)
const busyPlan = ref('')

const order = ref<CloudOrder | null>(null)
const qrDataUrl = ref('')
const orderState = ref<'waiting' | 'paid' | 'closed'>('waiting')
let pollTimer: number | null = null

const redeemCode = ref('')
const redeeming = ref(false)

const payChannels = computed(() => channels.value.filter((c) => c !== 'mock'))
const mockEnabled = computed(() => channels.value.includes('mock'))

function formatFen(fen: number) {
  return `¥${(fen / 100).toFixed(2)}`
}

async function loadPlans() {
  loadError.value = ''
  const result = await window.api.cloud.listPlans()
  if (!result.ok) {
    loadError.value = result.error
    return
  }
  plans.value = result.plans
  mobileSlots.value = result.maxMobileDevices ?? 1
  channels.value = result.channels
  selectedChannel.value = payChannels.value[0] ?? (mockEnabled.value ? 'mock' : '')
}

function stopPolling() {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

function closeOrder() {
  stopPolling()
  order.value = null
  qrDataUrl.value = ''
}

async function onPaid() {
  stopPolling()
  orderState.value = 'paid'
  await cloudAuth.refresh()
  message.value = { tone: 'accent', text: t('cloud.membership.paid') }
  emit('activated')
}

async function poll() {
  if (!order.value) return
  const result = await window.api.cloud.getOrder(order.value.orderNo)
  if (!result.ok) return
  order.value = result.order
  if (result.order.status === 'paid') await onPaid()
  else if (result.order.status === 'closed') {
    orderState.value = 'closed'
    stopPolling()
  }
}

async function buy(plan: CloudPlan) {
  const channel = selectedChannel.value
  if (!channel) return
  busyPlan.value = plan.code
  message.value = null
  try {
    const result = await window.api.cloud.createOrder({ planCode: plan.code, channel })
    if (!result.ok) {
      message.value = { tone: 'danger', text: result.error }
      return
    }
    order.value = result.order
    orderState.value = 'waiting'
    qrDataUrl.value = await QRCode.toDataURL(result.order.qrContent, { width: 220, margin: 1 })
    stopPolling()
    pollTimer = window.setInterval(() => void poll(), 2500)
  } finally {
    busyPlan.value = ''
  }
}

async function mockPay() {
  if (!order.value) return
  const result = await window.api.cloud.mockPay(order.value.orderNo)
  if (result.ok && result.order.status === 'paid') {
    order.value = result.order
    await onPaid()
  } else if (!result.ok) {
    message.value = { tone: 'danger', text: result.error }
  }
}

async function redeem() {
  const code = redeemCode.value.trim()
  if (!code) return
  redeeming.value = true
  message.value = null
  try {
    const result = await window.api.cloud.redeem(code)
    if (!result.ok) {
      message.value = { tone: 'danger', text: result.error }
      return
    }
    cloudAuth.setStatus(result.status)
    redeemCode.value = ''
    message.value = { tone: 'accent', text: t('cloud.membership.redeemed') }
    emit('activated')
  } finally {
    redeeming.value = false
  }
}

onMounted(() => void loadPlans())
onBeforeUnmount(stopPolling)
</script>

<template>
  <div class="vg-stack cloud-purchase">
    <div v-if="message" class="vg-notice" :class="message.tone === 'danger' ? 'vg-notice--danger' : 'vg-notice--accent'">
      <CheckCircle2 v-if="message.tone === 'accent'" :size="16" />
      <span>{{ message.text }}</span>
    </div>

    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><Crown :size="16" /> {{ t('cloud.membership.buyTitle') }} <small>{{ t('cloud.membership.buyDesc') }}</small></span>
        <div v-if="channels.length > 1" class="vg-seg vg-seg--sm" role="tablist">
          <button
            v-for="channel in channels"
            :key="channel"
            type="button"
            class="vg-seg__btn"
            :class="{ 'is-active': selectedChannel === channel }"
            @click="selectedChannel = channel"
          >
            {{ t(`cloud.channel.${channel}`) }}
          </button>
        </div>
      </div>
      <div v-if="loadError" class="vg-notice vg-notice--danger"><span>{{ loadError }}</span></div>
      <div v-else-if="!channels.length && plans.length" class="vg-notice vg-notice--warning"><span>{{ t('cloud.membership.noChannels') }}</span></div>
      <div class="vg-grid cloud-purchase__plans">
        <article v-for="plan in plans" :key="plan.code" class="vg-card vg-card--soft cloud-plan" :data-testid="`cloud-plan-${plan.code}`">
          <strong class="cloud-plan__name">{{ plan.name }}</strong>
          <span class="vg-muted cloud-plan__desc">{{ plan.description }}</span>
          <div class="cloud-plan__price">
            <b>{{ formatFen(plan.amountFen) }}</b>
            <span>/ {{ plan.days === 0 ? t('cloud.membership.forever') : t('cloud.membership.days', { count: plan.days }) }}</span>
          </div>
          <span class="vg-chip">{{ plan.maxDevices === 0 ? t('cloud.membership.deviceUnlimited', { mobile: mobileSlots }) : t('cloud.membership.deviceCount', { count: plan.maxDevices, mobile: mobileSlots }) }}</span>
          <button class="vg-btn vg-btn--primary vg-btn--block" type="button" :disabled="!selectedChannel || busyPlan === plan.code" @click="buy(plan)">
            <LoaderCircle v-if="busyPlan === plan.code" :size="15" class="vg-spin" />
            <QrCode v-else :size="15" />
            {{ t('cloud.membership.buy') }}
          </button>
        </article>
      </div>
    </section>

    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><KeyRound :size="16" /> {{ t('cloud.membership.redeemTitle') }}</span>
      </div>
      <form class="vg-row cloud-purchase__redeem" @submit.prevent="redeem">
        <input v-model="redeemCode" class="vg-input" data-testid="cloud-redeem-input" :placeholder="t('cloud.membership.redeemPlaceholder')" autocomplete="off" />
        <button class="vg-btn" type="submit" :disabled="redeeming || !redeemCode.trim()">
          <LoaderCircle v-if="redeeming" :size="15" class="vg-spin" />
          {{ t('cloud.membership.redeem') }}
        </button>
      </form>
    </section>

    <div v-if="order" class="vg-backdrop cloud-pay" @click.self="closeOrder">
      <div class="vg-dialog cloud-pay__dialog" role="dialog" aria-modal="true">
        <button type="button" class="vg-icon-btn vg-icon-btn--sm cloud-pay__close" :aria-label="t('cloud.membership.cancel')" @click="closeOrder"><X :size="16" /></button>
        <h3>{{ t('cloud.membership.scanTitle', { amount: formatFen(order.amountFen) }) }}</h3>
        <p class="vg-muted">{{ order.planName }} · {{ t('cloud.membership.scanHint', { channel: t(`cloud.channel.${order.channel}`) }) }}</p>
        <div class="cloud-pay__qr">
          <img v-if="qrDataUrl && orderState === 'waiting'" :src="qrDataUrl" alt="QR" />
          <CheckCircle2 v-else-if="orderState === 'paid'" :size="64" class="cloud-pay__ok" />
        </div>
        <div class="cloud-pay__state" data-testid="cloud-pay-state">
          <template v-if="orderState === 'waiting'"><LoaderCircle :size="14" class="vg-spin" /> {{ t('cloud.membership.waiting') }}</template>
          <template v-else-if="orderState === 'paid'">{{ t('cloud.membership.paid') }}</template>
          <template v-else>{{ t('cloud.membership.closed') }}</template>
        </div>
        <span class="vg-muted cloud-pay__no">{{ order.orderNo }}</span>
        <div class="vg-row cloud-pay__actions">
          <button v-if="order.channel === 'mock' && orderState === 'waiting'" type="button" class="vg-btn vg-btn--soft" data-testid="cloud-mock-pay" @click="mockPay">
            {{ t('cloud.membership.mockPay') }}
          </button>
          <button type="button" class="vg-btn" @click="closeOrder">{{ t('cloud.membership.cancel') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cloud-purchase__plans { --vg-grid-min: 200px; }
.cloud-plan { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.cloud-plan__name { font-size: 15px; font-weight: 700; }
.cloud-plan__desc { font-size: 12px; min-height: 16px; }
.cloud-plan__price b { font-size: 22px; font-weight: 800; color: var(--vg-accent); }
.cloud-plan__price span { font-size: 12px; color: var(--theme-text-muted); }
.cloud-purchase__redeem { gap: 8px; }
.cloud-purchase__redeem .vg-input { flex: 1; font-family: var(--vg-font-mono, monospace); letter-spacing: 0.04em; }
.cloud-pay__dialog { position: relative; width: min(360px, calc(100vw - 32px)); display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 24px; }
.cloud-pay__dialog h3 { font-size: 16px; font-weight: 700; }
.cloud-pay__close { position: absolute; top: 10px; right: 10px; }
.cloud-pay__qr { width: 220px; height: 220px; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: #fff; }
.cloud-pay__qr img { width: 220px; height: 220px; border-radius: 12px; }
.cloud-pay__ok { color: var(--vg-green); }
.cloud-pay__state { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
.cloud-pay__no { font-size: 11px; font-family: var(--vg-font-mono, monospace); }
.cloud-pay__actions { gap: 8px; justify-content: center; }
</style>
