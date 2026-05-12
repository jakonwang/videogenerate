<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { webApiClient, type BillingOrder, type SubscriptionPlan, type WalletTransaction } from '../services/webApi'

const loading = ref(false)
const plans = ref<SubscriptionPlan[]>([])
const orders = ref<BillingOrder[]>([])
const transactions = ref<WalletTransaction[]>([])

async function refresh() {
  loading.value = true
  try {
    const [planRows, orderRows, transactionRows] = await Promise.all([
      webApiClient.listPlans(),
      webApiClient.listOrders(),
      webApiClient.listTransactions(),
    ])
    plans.value = planRows
    orders.value = orderRows
    transactions.value = transactionRows
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <section class="billing-page">
    <header class="web-card page-card">
      <span class="page-tag">Billing Center</span>
      <h1>会员与算力</h1>
      <p>查看当前套餐、可购买计划、订单记录和算力流水。</p>
    </header>

    <section class="content-grid">
      <article class="web-card page-card">
        <strong>套餐列表</strong>
        <div class="list-grid">
          <div v-for="plan in plans" :key="plan.id" class="row-card">
            <div>
              <strong>{{ plan.name }}</strong>
              <span>{{ plan.durationDays }} 天 · 每月 {{ plan.monthlyComputeCredits }} 算力</span>
            </div>
            <strong>¥{{ plan.priceCny }}</strong>
          </div>
          <div v-if="!plans.length && !loading" class="empty-text">暂无套餐数据</div>
        </div>
      </article>

      <article class="web-card page-card">
        <strong>订单记录</strong>
        <div class="list-grid">
          <div v-for="order in orders" :key="order.id" class="row-card">
            <div>
              <strong>{{ order.planName || order.type }}</strong>
              <span>{{ new Date(order.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
            </div>
            <strong>{{ order.status }}</strong>
          </div>
          <div v-if="!orders.length && !loading" class="empty-text">暂无订单记录</div>
        </div>
      </article>

      <article class="web-card page-card">
        <strong>算力流水</strong>
        <div class="list-grid">
          <div v-for="item in transactions" :key="item.id" class="row-card">
            <div>
              <strong>{{ item.note }}</strong>
              <span>{{ new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
            </div>
            <strong>{{ item.amountCredits }}</strong>
          </div>
          <div v-if="!transactions.length && !loading" class="empty-text">暂无算力流水</div>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.billing-page,
.content-grid,
.list-grid {
  display: grid;
  gap: 12px;
}

.page-card {
  padding: 16px;
}

h1,
p {
  margin: 0;
}

h1 {
  font-size: 28px;
  line-height: 1.16;
}

p,
.row-card span,
.empty-text {
  color: var(--web-text-soft);
  font-size: 13px;
  line-height: 1.6;
}

.row-card {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
}

.row-card > div {
  display: grid;
  gap: 4px;
}
</style>
