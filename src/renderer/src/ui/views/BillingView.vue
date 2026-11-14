<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CheckCircle2, Coins, CreditCard, Crown, History, Info, LoaderCircle, ReceiptText, RefreshCw, UserRound, Wallet, Zap } from 'lucide-vue-next'
import {
  type BillingOrder,
  type SubscriptionPlan,
  type WalletTransaction,
  webApiClient,
} from '@/lib/webApiClient'
import { useWebSessionStore } from '@/stores/webSession'
import { useI18n } from 'vue-i18n'

const webSession = useWebSessionStore()
const { t, locale } = useI18n()

const loading = ref(false)
const paying = ref('')
const plans = ref<SubscriptionPlan[]>([])
const orders = ref<BillingOrder[]>([])
const transactions = ref<WalletTransaction[]>([])
const feedback = ref('')

const walletBalance = computed(() => webSession.wallet?.balanceCredits ?? 0)
const activePlan = computed(() => webSession.subscription?.planName || t('billing.notActive'))

const computePackOptions = computed(() => [
  { credits: 100, priceHint: t('billing.packs.light') },
  { credits: 300, priceHint: t('billing.packs.regular') },
  { credits: 1000, priceHint: t('billing.packs.batch') },
])

function formatTime(value?: number) {
  if (!value) return '--'
  return new Date(value).toLocaleString(locale.value)
}

function orderTypeLabel(type: BillingOrder['type']) {
  return type === 'subscription' ? t('billing.order.subscription') : t('billing.order.compute')
}

function transactionTone(type: WalletTransaction['type']) {
  return type === 'compute_charge' ? 'is-negative' : 'is-positive'
}

async function refresh() {
  loading.value = true
  try {
    const [planRows, orderRows, transactionRows] = await Promise.all([
      webApiClient.listPlans(),
      webApiClient.listOrders(),
      webApiClient.listTransactions(),
      webSession.refreshProfile(),
    ])
    plans.value = planRows
    orders.value = orderRows
    transactions.value = transactionRows
  } finally {
    loading.value = false
  }
}

async function createAndPayOrder(input: { type: 'subscription' | 'compute_pack'; planId?: string; credits?: number }) {
  paying.value = input.planId || String(input.credits || input.type)
  feedback.value = ''
  try {
    const created = await webApiClient.createOrder({
      ...input,
      paymentChannel: 'mock_wechat',
    })
    await webApiClient.payMockOrder(created.order.id)
    feedback.value = input.type === 'subscription' ? t('billing.messages.subscribed') : t('billing.messages.recharged')
    await refresh()
  } catch (error: any) {
    feedback.value = error?.message ?? String(error)
  } finally {
    paying.value = ''
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="vg-scope vg-page billing">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><Wallet :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('billing.title') }}</h1>
        <p>{{ t('billing.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button class="vg-btn" type="button" :disabled="loading" @click="refresh">
          <LoaderCircle v-if="loading" :size="15" class="vg-spin" />
          <RefreshCw v-else :size="15" />
          {{ t('billing.refresh') }}
        </button>
      </div>
    </header>

    <div v-if="feedback" class="vg-notice vg-notice--accent"><CheckCircle2 :size="16" /><span>{{ feedback }}</span></div>

    <section class="vg-stats">
      <div class="vg-stat">
        <span class="vg-stat__icon"><UserRound :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('billing.currentAccount') }}</span><span class="vg-stat__value billing__stat-text">{{ webSession.displayName }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--violet"><Crown :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('billing.currentPlan') }}</span><span class="vg-stat__value billing__stat-text">{{ activePlan }}</span></span>
      </div>
      <div class="vg-stat">
        <span class="vg-stat__icon vg-stat__icon--amber"><Coins :size="17" /></span>
        <span class="vg-stat__body"><span class="vg-stat__label">{{ t('billing.balance') }}</span><span class="vg-stat__value">{{ walletBalance }}</span></span>
      </div>
    </section>

    <div class="vg-split billing__layout">
      <div class="vg-stack">
        <section class="vg-card">
          <div class="vg-card__head">
            <span class="vg-card__title"><Crown :size="16" /> {{ t('billing.plans.title') }} <small>{{ t('billing.plans.desc') }}</small></span>
          </div>
          <div class="vg-grid billing__plans">
            <article v-for="plan in plans" :key="plan.id" class="vg-card vg-card--soft billing-plan">
              <strong class="billing-plan__name">{{ plan.name }}</strong>
              <div class="billing-plan__price"><b>¥{{ plan.priceCny }}</b> <span>/ {{ t('billing.days', { count: plan.durationDays }) }}</span></div>
              <span class="vg-chip">{{ t('billing.plans.credits', { count: plan.monthlyComputeCredits }) }}</span>
              <button class="vg-btn vg-btn--primary vg-btn--block" type="button" :disabled="paying === plan.id" @click="createAndPayOrder({ type: 'subscription', planId: plan.id })">
                <CreditCard :size="15" /> {{ paying === plan.id ? t('billing.paying') : t('billing.subscribe') }}
              </button>
            </article>
            <div v-if="!plans.length" class="vg-empty"><p>--</p></div>
          </div>
        </section>

        <section class="vg-card">
          <div class="vg-card__head">
            <span class="vg-card__title"><Zap :size="16" /> {{ t('billing.packs.title') }} <small>{{ t('billing.packs.desc') }}</small></span>
          </div>
          <div class="vg-grid vg-grid--3">
            <article v-for="pack in computePackOptions" :key="pack.credits" class="vg-card vg-card--soft billing-plan">
              <strong class="billing-plan__name">{{ t('billing.creditCount', { count: pack.credits }) }}</strong>
              <span class="vg-muted">{{ pack.priceHint }}</span>
              <button class="vg-btn vg-btn--soft vg-btn--block" type="button" :disabled="paying === String(pack.credits)" @click="createAndPayOrder({ type: 'compute_pack', credits: pack.credits })">
                <Zap :size="15" /> {{ paying === String(pack.credits) ? t('billing.recharging') : t('billing.recharge') }}
              </button>
            </article>
          </div>
        </section>

        <section class="vg-card vg-card--flush">
          <div class="vg-card__head">
            <span class="vg-card__title"><ReceiptText :size="16" /> {{ t('billing.order.title') }} <small>{{ t('billing.order.desc') }}</small></span>
          </div>
          <table v-if="orders.length" class="vg-table">
            <thead>
              <tr>
                <th>{{ t('billing.order.type') }}</th>
                <th class="num">{{ t('billing.order.amount') }}</th>
                <th>{{ t('billing.order.status') }}</th>
                <th>{{ t('billing.order.time') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="order in orders.slice(0, 12)" :key="order.id">
                <td>{{ orderTypeLabel(order.type) }}</td>
                <td class="num">¥{{ order.amountCny }}</td>
                <td><span class="vg-pill vg-pill--dot" :class="order.status === 'paid' ? 'vg-pill--green' : 'vg-pill--amber'">{{ order.status }}</span></td>
                <td class="vg-secondary vg-num">{{ formatTime(order.paidAt || order.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="vg-empty"><p>{{ t('billing.order.empty') }}</p></div>
        </section>
      </div>

      <aside class="vg-stack">
        <section class="vg-card">
          <div class="vg-card__head">
            <span class="vg-card__title"><History :size="16" /> {{ t('billing.transactions.title') }}</span>
          </div>
          <p class="vg-muted billing__desc">{{ t('billing.transactions.desc') }}</p>
          <div v-if="transactions.length" class="vg-list">
            <div v-for="item in transactions.slice(0, 12)" :key="item.id" class="vg-list__item">
              <span class="vg-list__main">
                <span class="vg-list__title">{{ item.note }}</span>
                <span class="vg-list__sub">{{ formatTime(item.createdAt) }}</span>
              </span>
              <b class="vg-num" :class="transactionTone(item.type)">{{ item.amountCredits > 0 ? `+${item.amountCredits}` : item.amountCredits }}</b>
            </div>
          </div>
          <div v-else class="vg-empty"><p>{{ t('billing.transactions.empty') }}</p></div>
        </section>

        <section class="vg-card">
          <div class="vg-card__head">
            <span class="vg-card__title"><Info :size="16" /> {{ t('billing.notes.title') }}</span>
          </div>
          <div class="vg-stack billing__notes">
            <div class="vg-notice"><CheckCircle2 :size="15" /><span>{{ t('billing.notes.membership') }}</span></div>
            <div class="vg-notice"><CheckCircle2 :size="15" /><span>{{ t('billing.notes.payment') }}</span></div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.billing { width: min(1408px, 100%); margin: 0 auto; }
.billing__stat-text { font-size: 16px; overflow: hidden; text-overflow: ellipsis; }
.billing__plans { --vg-grid-min: 200px; }
.billing-plan { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
.billing-plan__name { font-size: 15px; font-weight: 700; }
.billing-plan__price b { font-size: 22px; font-weight: 800; color: var(--vg-accent); }
.billing-plan__price span { font-size: 12px; color: var(--theme-text-muted); }
.billing__desc { font-size: 12px; margin-bottom: 8px; }
.billing__notes { gap: 8px; }
.is-positive { color: var(--vg-green); }
.is-negative { color: var(--vg-red); }
</style>
