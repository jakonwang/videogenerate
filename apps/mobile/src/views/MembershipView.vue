<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import QRCode from 'qrcode'
import { CheckCircle2, Crown, ExternalLink, KeyRound, LoaderCircle, Receipt, X } from 'lucide-vue-next'
import { describeDeviceAllowance, type CloudOrder, type CloudPayChannel, type CloudPlan } from '@shared/cloud/types'
import PageHeader from '@/components/PageHeader.vue'
import { cloud, errorMessage, refreshAccount, session } from '@/lib/session'
import { toast } from '@/lib/toast'

/** 会员中心：看套餐、下单付款（扫码 / 打开支付宝）、兑换码、我的订单 */

const CHANNEL_LABEL: Record<CloudPayChannel, string> = { wechat: '微信支付', alipay: '支付宝', mock: '测试支付' }
const STATUS_LABEL: Record<CloudOrder['status'], string> = { pending: '待支付', paid: '已支付', closed: '已关闭', refunded: '已退款' }

const plans = ref<CloudPlan[]>([])
const channels = ref<CloudPayChannel[]>([])
const mobileSlots = ref(1)
const channel = ref<CloudPayChannel | ''>('')
const loading = ref(true)
const loadError = ref('')
const busyPlan = ref('')
const order = ref<CloudOrder | null>(null)
const qr = ref('')
const orders = ref<CloudOrder[]>([])
const code = ref('')
const redeeming = ref(false)
let timer: number | null = null

const status = computed(() => {
  const e = session.entitlement
  if (!e) return { title: '未开通会员', sub: '开通后手机和电脑都能用全部功能', active: false }
  if (e.unlimited) return { title: '不受限账号', sub: '所有功能可用', active: true }
  if (!e.active) return { title: '会员已过期', sub: '续费后立即恢复', active: false }
  return { title: e.planName || '会员', sub: e.expiresAt ? `${new Date(e.expiresAt).toLocaleDateString('zh-CN')} 到期` : '永久有效', active: true }
})
const isLink = computed(() => !!order.value && /^https?:\/\//i.test(order.value.qrContent))

const yuan = (fen: number) => `¥${(fen / 100).toFixed(fen % 100 ? 2 : 0)}`
const daysText = (days: number) => (days === 0 ? '永久' : days >= 365 && days % 365 === 0 ? `${days / 365} 年` : days >= 30 && days % 30 === 0 ? `${days / 30} 个月` : `${days} 天`)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await cloud.listPlans()
    plans.value = result.plans.filter((plan) => plan.active !== false)
    channels.value = result.channels
    mobileSlots.value = result.maxMobileDevices ?? 1
    channel.value = channels.value.find((c) => c !== 'mock') ?? channels.value[0] ?? ''
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
  }
  void loadOrders()
}

async function loadOrders() {
  try {
    orders.value = (await cloud.listOrders(1)).items
  } catch {
    orders.value = []
  }
}

function stop() {
  if (timer !== null) window.clearInterval(timer)
  timer = null
}

function closeOrder() {
  stop()
  order.value = null
  qr.value = ''
  void loadOrders()
}

async function paid() {
  stop()
  await refreshAccount()
  toast('付款成功，会员已开通')
  void loadOrders()
}

async function poll() {
  if (!order.value) return
  try {
    const next = (await cloud.getOrder(order.value.orderNo)).order
    order.value = next
    if (next.status === 'paid') await paid()
    else if (next.status !== 'pending') stop()
  } catch {
    /* keep polling */
  }
}

async function buy(plan: CloudPlan) {
  if (!channel.value) return toast('管理员还没有开通付款方式，可以用兑换码')
  busyPlan.value = plan.code
  try {
    const created = (await cloud.createOrder({ planCode: plan.code, channel: channel.value })).order
    order.value = created
    qr.value = created.qrContent ? await QRCode.toDataURL(created.qrContent, { width: 240, margin: 1 }) : ''
    stop()
    timer = window.setInterval(() => void poll(), 2500)
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    busyPlan.value = ''
  }
}

function openPay() {
  // Capacitor 会把站外链接交给系统（支付宝 App / 浏览器）打开
  if (order.value) window.location.href = order.value.qrContent
}

async function mockPay() {
  if (!order.value) return
  try {
    order.value = (await cloud.mockPay(order.value.orderNo)).order
    if (order.value.status === 'paid') await paid()
  } catch (error) {
    toast(errorMessage(error))
  }
}

async function redeem() {
  const value = code.value.trim()
  if (!value) return
  redeeming.value = true
  try {
    await cloud.redeem(value)
    code.value = ''
    await refreshAccount()
    toast('兑换成功')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    redeeming.value = false
  }
}

onMounted(() => {
  void refreshAccount()
  void load()
})
onBeforeUnmount(stop)
</script>

<template>
  <PageHeader title="会员中心" back />
  <main class="m-page m-page--no-tabs">
    <section class="hero" :class="{ 'is-active': status.active }">
      <Crown :size="26" />
      <div>
        <strong>{{ status.title }}</strong>
        <span>{{ status.sub }}</span>
      </div>
    </section>

    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">选择套餐</h2></div>
      <p v-if="loading" class="m-muted hint"><LoaderCircle :size="16" class="m-spin" /> 正在加载…</p>
      <p v-else-if="loadError" class="m-notice m-notice--red">{{ loadError }}</p>
      <p v-else-if="!plans.length" class="m-muted hint">暂无可购买的套餐</p>
      <template v-else>
        <div v-if="channels.length > 1" class="m-chips">
          <button v-for="c in channels" :key="c" type="button" class="m-chip" :class="{ 'is-active': channel === c }" @click="channel = c">{{ CHANNEL_LABEL[c] }}</button>
        </div>
        <div class="plans">
          <article v-for="plan in plans" :key="plan.code" class="plan m-card">
            <div class="plan__top">
              <strong>{{ plan.name }}</strong>
              <span class="plan__price">{{ yuan(plan.amountFen) }}<small> / {{ daysText(plan.days) }}</small></span>
            </div>
            <p v-if="plan.description" class="plan__desc">{{ plan.description }}</p>
            <p class="plan__devices">{{ describeDeviceAllowance(plan.maxDevices, mobileSlots) }}</p>
            <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="!!busyPlan" @click="buy(plan)">
              <LoaderCircle v-if="busyPlan === plan.code" :size="16" class="m-spin" />
              {{ status.active ? '续费' : '开通' }}
            </button>
          </article>
        </div>
      </template>
    </section>

    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">兑换码</h2></div>
      <form class="redeem" @submit.prevent="redeem">
        <input v-model="code" class="m-input" placeholder="输入兑换码" autocapitalize="characters" />
        <button type="submit" class="m-btn" :disabled="redeeming || !code.trim()"><KeyRound :size="16" /> 兑换</button>
      </form>
    </section>

    <section v-if="orders.length" class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">我的订单</h2></div>
      <div class="m-card m-list">
        <div v-for="item in orders" :key="item.orderNo" class="m-row">
          <Receipt :size="20" class="m-muted" />
          <span class="m-row__main">
            <span class="m-row__title">{{ item.planName }} · {{ yuan(item.amountFen) }}</span>
            <span class="m-row__sub">{{ new Date(item.createdAt).toLocaleString('zh-CN') }} · {{ CHANNEL_LABEL[item.channel] }}</span>
          </span>
          <span class="m-badge" :class="item.status === 'paid' ? 'm-badge--green' : item.status === 'pending' ? 'm-badge--amber' : 'm-badge--muted'">{{ STATUS_LABEL[item.status] }}</span>
        </div>
      </div>
    </section>

    <div v-if="order" class="sheet" @click.self="closeOrder">
      <div class="sheet__card m-card">
        <button type="button" class="m-icon-btn sheet__close" aria-label="关闭" @click="closeOrder"><X :size="20" /></button>
        <template v-if="order.status === 'paid'">
          <CheckCircle2 :size="48" class="ok" />
          <strong class="sheet__title">付款成功</strong>
          <p class="m-muted">{{ order.planName }} 已开通，手机和电脑立即可用</p>
          <button type="button" class="m-btn m-btn--primary m-btn--block" @click="closeOrder">完成</button>
        </template>
        <template v-else-if="order.status === 'pending'">
          <strong class="sheet__title">{{ order.planName }} · {{ yuan(order.amountFen) }}</strong>
          <img v-if="qr" :src="qr" alt="付款二维码" class="qr" />
          <p class="m-muted">
            {{ order.channel === 'wechat' ? '截图保存后在微信「扫一扫」里从相册选取，或用另一台手机扫码付款' : order.channel === 'alipay' ? '点下面按钮打开支付宝付款，或扫码付款' : '测试环境：点下面按钮模拟付款' }}
          </p>
          <button v-if="isLink" type="button" class="m-btn m-btn--primary m-btn--block" @click="openPay"><ExternalLink :size="16" /> 打开{{ CHANNEL_LABEL[order.channel] }}</button>
          <button v-if="order.channel === 'mock'" type="button" class="m-btn m-btn--primary m-btn--block" @click="mockPay">模拟付款</button>
          <p class="waiting"><LoaderCircle :size="14" class="m-spin" /> 付款后自动开通</p>
        </template>
        <template v-else>
          <strong class="sheet__title">订单{{ STATUS_LABEL[order.status] }}</strong>
          <p class="m-muted">请重新选择套餐下单</p>
          <button type="button" class="m-btn m-btn--block" @click="closeOrder">关闭</button>
        </template>
      </div>
    </div>
  </main>
</template>

<style scoped>
.hero { display: flex; align-items: center; gap: 14px; padding: 18px; border-radius: 18px; background: var(--theme-control-hover); color: var(--theme-text-muted); }
.hero.is-active { background: linear-gradient(135deg, var(--m-accent), var(--m-accent-2)); color: #04201c; }
.hero div { display: flex; flex-direction: column; gap: 2px; }
.hero strong { font-size: 18px; color: inherit; }
.hero span { font-size: 13px; opacity: 0.85; }
.hint { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.plans { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.plan { display: flex; flex-direction: column; gap: 8px; padding: 16px; }
.plan__top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.plan__top strong { font-size: 16px; }
.plan__price { color: var(--m-accent-2); font-size: 22px; font-weight: 800; white-space: nowrap; }
.plan__price small { color: var(--theme-text-muted); font-size: 12px; font-weight: 500; }
.plan__desc, .plan__devices { margin: 0; color: var(--theme-text-muted); font-size: 13px; line-height: 1.5; }
.redeem { display: flex; gap: 8px; }
.redeem .m-input { flex: 1; min-width: 0; }
.sheet { position: fixed; inset: 0; z-index: 50; display: grid; place-items: end center; background: rgba(0, 0, 0, 0.55); }
.sheet__card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; padding: 24px var(--m-gutter) calc(24px + env(safe-area-inset-bottom)); border-radius: 22px 22px 0 0; text-align: center; }
.sheet__card p { margin: 0; font-size: 13px; line-height: 1.5; }
.sheet__close { position: absolute; top: 10px; right: 10px; }
.sheet__title { font-size: 17px; }
.qr { width: 220px; height: 220px; border-radius: 12px; background: #fff; padding: 8px; }
.ok { color: var(--m-accent-2); }
.waiting { display: flex; align-items: center; gap: 6px; color: var(--theme-text-muted); }
</style>
