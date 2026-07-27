<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CheckCircle2, CreditCard, LoaderCircle, Wallet, Zap } from 'lucide-vue-next'
import UiCard from '../components/UiCard.vue'
import UiButton from '../components/UiButton.vue'
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
  <div class="billing-page">
    <section class="billing-hero">
      <div class="billing-hero__copy">
        <span class="panel-tag">Billing</span>
        <h1>{{ t('billing.title') }}</h1>
        <p>{{ t('billing.desc') }}</p>
      </div>
      <UiButton variant="ghost" :disabled="loading" @click="refresh">
        <LoaderCircle v-if="loading" class="h-4 w-4 is-spinning" />
        <Wallet v-else class="h-4 w-4" />
        {{ t('billing.refresh') }}
      </UiButton>
    </section>

    <section class="billing-summary">
      <UiCard class="billing-summary-card">
        <span>{{ t('billing.currentAccount') }}</span>
        <strong>{{ webSession.displayName }}</strong>
      </UiCard>
      <UiCard class="billing-summary-card">
        <span>{{ t('billing.currentPlan') }}</span>
        <strong>{{ activePlan }}</strong>
      </UiCard>
      <UiCard class="billing-summary-card">
        <span>{{ t('billing.balance') }}</span>
        <strong>{{ walletBalance }}</strong>
      </UiCard>
    </section>

    <section class="billing-grid">
      <div class="billing-main">
        <UiCard class="billing-panel">
          <div class="billing-panel__head">
            <strong>{{ t('billing.plans.title') }}</strong>
            <small>{{ t('billing.plans.desc') }}</small>
          </div>
          <div class="plan-grid">
            <article v-for="plan in plans" :key="plan.id" class="plan-card">
              <div class="plan-card__price">
                <strong>{{ plan.name }}</strong>
                <span>¥{{ plan.priceCny }} / {{ t('billing.days', { count: plan.durationDays }) }}</span>
              </div>
              <div class="plan-card__meta">
                <span>{{ t('billing.plans.credits', { count: plan.monthlyComputeCredits }) }}</span>
              </div>
              <UiButton :disabled="paying === plan.id" @click="createAndPayOrder({ type: 'subscription', planId: plan.id })">
                <CreditCard class="h-4 w-4" />
                {{ paying === plan.id ? t('billing.paying') : t('billing.subscribe') }}
              </UiButton>
            </article>
          </div>
        </UiCard>

        <UiCard class="billing-panel">
          <div class="billing-panel__head">
            <strong>{{ t('billing.packs.title') }}</strong>
            <small>{{ t('billing.packs.desc') }}</small>
          </div>
          <div class="plan-grid pack-grid">
            <article v-for="pack in computePackOptions" :key="pack.credits" class="plan-card pack-card">
              <div class="plan-card__price">
                <strong>{{ t('billing.creditCount', { count: pack.credits }) }}</strong>
                <span>{{ pack.priceHint }}</span>
              </div>
              <UiButton :disabled="paying === String(pack.credits)" @click="createAndPayOrder({ type: 'compute_pack', credits: pack.credits })">
                <Zap class="h-4 w-4" />
                {{ paying === String(pack.credits) ? t('billing.recharging') : t('billing.recharge') }}
              </UiButton>
            </article>
          </div>
        </UiCard>

        <UiCard class="billing-panel">
          <div class="billing-panel__head">
            <strong>{{ t('billing.order.title') }}</strong>
            <small>{{ t('billing.order.desc') }}</small>
          </div>
          <div class="billing-table">
            <div class="billing-table__head">
              <span>{{ t('billing.order.type') }}</span>
              <span>{{ t('billing.order.amount') }}</span>
              <span>{{ t('billing.order.status') }}</span>
              <span>{{ t('billing.order.time') }}</span>
            </div>
            <div v-if="orders.length" class="billing-table__body">
              <article v-for="order in orders.slice(0, 12)" :key="order.id" class="billing-table__row">
                <span>{{ orderTypeLabel(order.type) }}</span>
                <span>¥{{ order.amountCny }}</span>
                <span>{{ order.status }}</span>
                <span>{{ formatTime(order.paidAt || order.createdAt) }}</span>
              </article>
            </div>
            <div v-else class="billing-empty">{{ t('billing.order.empty') }}</div>
          </div>
        </UiCard>
      </div>

      <aside class="billing-side">
        <UiCard class="billing-panel">
          <div class="billing-panel__head">
            <strong>{{ t('billing.transactions.title') }}</strong>
            <small>{{ t('billing.transactions.desc') }}</small>
          </div>
          <div v-if="transactions.length" class="transaction-list">
            <article v-for="item in transactions.slice(0, 12)" :key="item.id" class="transaction-item">
              <div>
                <strong>{{ item.note }}</strong>
                <small>{{ formatTime(item.createdAt) }}</small>
              </div>
              <em :class="transactionTone(item.type)">{{ item.amountCredits > 0 ? `+${item.amountCredits}` : item.amountCredits }}</em>
            </article>
          </div>
          <div v-else class="billing-empty">{{ t('billing.transactions.empty') }}</div>
        </UiCard>

        <UiCard class="billing-panel">
          <div class="billing-panel__head">
            <strong>{{ t('billing.notes.title') }}</strong>
          </div>
          <div class="billing-note-list">
            <article class="billing-note">
              <CheckCircle2 class="h-4 w-4" />
              <span>{{ t('billing.notes.membership') }}</span>
            </article>
            <article class="billing-note">
              <CheckCircle2 class="h-4 w-4" />
              <span>{{ t('billing.notes.payment') }}</span>
            </article>
          </div>
          <p v-if="feedback" class="billing-feedback">{{ feedback }}</p>
        </UiCard>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.billing-page {
  min-height: 100%;
  padding: 6px 10px 18px;
  display: grid;
  gap: 10px;
  color: #eef3ff;
}

.billing-hero,
.billing-summary,
.billing-grid,
.plan-grid,
.billing-table__head,
.billing-table__row {
  display: grid;
}

.billing-hero {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid rgba(119, 137, 198, 0.14);
  background: linear-gradient(180deg, rgba(12, 18, 34, 0.96), rgba(10, 15, 27, 0.94));
}

.billing-hero__copy {
  display: grid;
  gap: 4px;
}

.billing-hero__copy h1 {
  margin: 0;
  font-size: 24px;
}

.billing-hero__copy p {
  margin: 0;
  color: #97a5c4;
  font-size: 12px;
}

.panel-tag {
  display: inline-block;
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #8ea6ff;
  font-weight: 700;
}

.billing-summary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.billing-summary-card,
.billing-panel {
  padding: 12px 14px;
  background: rgba(9, 15, 28, 0.94);
  border: 1px solid rgba(119, 137, 198, 0.1);
}

.billing-summary-card span {
  color: #92a1c3;
  font-size: 11px;
}

.billing-summary-card strong {
  display: block;
  margin-top: 6px;
  font-size: 20px;
}

.billing-grid {
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 10px;
  align-items: start;
}

.billing-main,
.billing-side {
  display: grid;
  gap: 10px;
}

.billing-panel__head {
  display: grid;
  gap: 4px;
  margin-bottom: 10px;
}

.billing-panel__head strong {
  font-size: 13px;
}

.billing-panel__head small {
  color: #8ea0c7;
  font-size: 11px;
}

.plan-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.pack-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.plan-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.plan-card__price {
  display: grid;
  gap: 4px;
}

.plan-card__price strong {
  font-size: 14px;
}

.plan-card__price span,
.plan-card__meta span {
  color: #8ea0c7;
  font-size: 11px;
}

.billing-table {
  display: grid;
  gap: 8px;
}

.billing-table__head,
.billing-table__row {
  grid-template-columns: 1.2fr 0.7fr 0.7fr 0.9fr;
  gap: 10px;
  align-items: center;
}

.billing-table__head {
  color: #7f93bf;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.billing-table__body {
  display: grid;
  gap: 6px;
}

.billing-table__row {
  padding: 10px 0;
  border-top: 1px solid rgba(148, 163, 184, 0.08);
  font-size: 12px;
}

.transaction-list {
  display: grid;
  gap: 8px;
}

.transaction-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.transaction-item strong {
  display: block;
  font-size: 12px;
}

.transaction-item small {
  color: #8ea0c7;
  font-size: 11px;
}

.transaction-item em {
  font-style: normal;
  font-weight: 700;
  font-size: 12px;
}

.transaction-item em.is-positive {
  color: #86efac;
}

.transaction-item em.is-negative {
  color: #fca5a5;
}

.billing-note-list {
  display: grid;
  gap: 8px;
}

.billing-note {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  color: #9aaccc;
  font-size: 11px;
  line-height: 1.6;
}

.billing-feedback {
  margin: 10px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(109, 93, 255, 0.12);
  border: 1px solid rgba(109, 93, 255, 0.2);
  color: #ddd6fe;
  font-size: 12px;
}

.billing-empty {
  color: #8ea0c7;
  font-size: 12px;
  padding: 8px 0;
}

.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1100px) {
  .billing-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .billing-hero,
  .billing-summary,
  .plan-grid,
  .pack-grid {
    grid-template-columns: 1fr;
  }
}
</style>
