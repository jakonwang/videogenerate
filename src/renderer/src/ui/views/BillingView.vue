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

const webSession = useWebSessionStore()

const loading = ref(false)
const paying = ref('')
const plans = ref<SubscriptionPlan[]>([])
const orders = ref<BillingOrder[]>([])
const transactions = ref<WalletTransaction[]>([])
const feedback = ref('')

const walletBalance = computed(() => webSession.wallet?.balanceCredits ?? 0)
const activePlan = computed(() => webSession.subscription?.planName || '未开通')

const computePackOptions = [
  { credits: 100, priceHint: '适合轻量测试' },
  { credits: 300, priceHint: '适合常规生产' },
  { credits: 1000, priceHint: '适合高频批量任务' },
]

function formatTime(value?: number) {
  if (!value) return '--'
  const d = new Date(value)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function orderTypeLabel(type: BillingOrder['type']) {
  return type === 'subscription' ? '会员订单' : '算力包订单'
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
    feedback.value = input.type === 'subscription' ? '会员已开通并到账算力。' : '算力包已充值到账。'
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
        <h1>会员与钱包中心</h1>
        <p>管理 Web 商业化账号的会员状态、算力余额、订单与扣费流水。当前为本地演示支付链路，便于后续切正式微信 / 支付宝。</p>
      </div>
      <UiButton variant="ghost" :disabled="loading" @click="refresh">
        <LoaderCircle v-if="loading" class="h-4 w-4 is-spinning" />
        <Wallet v-else class="h-4 w-4" />
        刷新数据
      </UiButton>
    </section>

    <section class="billing-summary">
      <UiCard class="billing-summary-card">
        <span>当前账号</span>
        <strong>{{ webSession.displayName }}</strong>
      </UiCard>
      <UiCard class="billing-summary-card">
        <span>会员套餐</span>
        <strong>{{ activePlan }}</strong>
      </UiCard>
      <UiCard class="billing-summary-card">
        <span>算力余额</span>
        <strong>{{ walletBalance }}</strong>
      </UiCard>
    </section>

    <section class="billing-grid">
      <div class="billing-main">
        <UiCard class="billing-panel">
          <div class="billing-panel__head">
            <strong>会员套餐</strong>
            <small>购买成功后自动开通并赠送月度算力。</small>
          </div>
          <div class="plan-grid">
            <article v-for="plan in plans" :key="plan.id" class="plan-card">
              <div class="plan-card__price">
                <strong>{{ plan.name }}</strong>
                <span>¥{{ plan.priceCny }} / {{ plan.durationDays }} 天</span>
              </div>
              <div class="plan-card__meta">
                <span>每期赠送 {{ plan.monthlyComputeCredits }} 算力点</span>
              </div>
              <UiButton :disabled="paying === plan.id" @click="createAndPayOrder({ type: 'subscription', planId: plan.id })">
                <CreditCard class="h-4 w-4" />
                {{ paying === plan.id ? '支付中...' : '立即开通' }}
              </UiButton>
            </article>
          </div>
        </UiCard>

        <UiCard class="billing-panel">
          <div class="billing-panel__head">
            <strong>算力包充值</strong>
            <small>按包补充算力点，用于高成本生成动作。</small>
          </div>
          <div class="plan-grid pack-grid">
            <article v-for="pack in computePackOptions" :key="pack.credits" class="plan-card pack-card">
              <div class="plan-card__price">
                <strong>{{ pack.credits }} 算力点</strong>
                <span>{{ pack.priceHint }}</span>
              </div>
              <UiButton :disabled="paying === String(pack.credits)" @click="createAndPayOrder({ type: 'compute_pack', credits: pack.credits })">
                <Zap class="h-4 w-4" />
                {{ paying === String(pack.credits) ? '充值中...' : '立即充值' }}
              </UiButton>
            </article>
          </div>
        </UiCard>

        <UiCard class="billing-panel">
          <div class="billing-panel__head">
            <strong>订单记录</strong>
            <small>当前演示环境使用模拟支付回调。</small>
          </div>
          <div class="billing-table">
            <div class="billing-table__head">
              <span>订单类型</span>
              <span>金额</span>
              <span>状态</span>
              <span>时间</span>
            </div>
            <div v-if="orders.length" class="billing-table__body">
              <article v-for="order in orders.slice(0, 12)" :key="order.id" class="billing-table__row">
                <span>{{ orderTypeLabel(order.type) }}</span>
                <span>¥{{ order.amountCny }}</span>
                <span>{{ order.status }}</span>
                <span>{{ formatTime(order.paidAt || order.createdAt) }}</span>
              </article>
            </div>
            <div v-else class="billing-empty">暂无订单记录</div>
          </div>
        </UiCard>
      </div>

      <aside class="billing-side">
        <UiCard class="billing-panel">
          <div class="billing-panel__head">
            <strong>算力流水</strong>
            <small>展示最近的充值与扣费明细。</small>
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
          <div v-else class="billing-empty">暂无流水</div>
        </UiCard>

        <UiCard class="billing-panel">
          <div class="billing-panel__head">
            <strong>状态说明</strong>
          </div>
          <div class="billing-note-list">
            <article class="billing-note">
              <CheckCircle2 class="h-4 w-4" />
              <span>会员负责功能权限与基础额度，算力包负责超额消耗补充。</span>
            </article>
            <article class="billing-note">
              <CheckCircle2 class="h-4 w-4" />
              <span>当前支付链路为本地模拟模式，后续可平滑替换为真实微信 / 支付宝回调。</span>
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
