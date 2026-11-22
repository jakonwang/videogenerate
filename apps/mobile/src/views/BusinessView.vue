<script setup lang="ts">
import { useInWebShell } from '@/lib/layout'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, Clock, Lightbulb, LoaderCircle, Monitor, PackageX, TrendingDown, TrendingUp } from 'lucide-vue-next'
import { BUSINESS_DIGEST_ID, type SyncBusinessDigest } from '@shared/cloud/selling'
import { SYNC_COLLECTIONS } from '@shared/cloud/sync'
import PageHeader from '@/components/PageHeader.vue'
import { relativeTime } from '@/lib/library'
import { getRecord, syncState } from '@/lib/sync'

/**
 * 经营数据（手机版，只读）：数据复盘、达人中心、店小秘库存、tk创意室。
 * 数据来自电脑端（持有店铺 / 后台登录），每次同步时更新。
 */
type Tab = 'shops' | 'insights' | 'creators' | 'inventory' | 'creative'
const route = useRoute()
const router = useRouter()
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'shops', label: '店铺' },
  { key: 'insights', label: '复盘' },
  { key: 'creators', label: '达人' },
  { key: 'inventory', label: '库存' },
  { key: 'creative', label: '创意室' },
]
const tab = ref<Tab>(TABS.some((t) => t.key === route.query.tab) ? (route.query.tab as Tab) : 'shops')
// Sidebar entries (数据复盘 / 达人 / 库存 / tk创意室) switch tabs on the same page: follow the URL.
watch(() => route.query.tab, (value) => {
  if (TABS.some((t) => t.key === value)) tab.value = value as Tab
})
const inWebShell = useInWebShell()
const WEB_TITLE: Record<Tab, [string, string]> = {
  shops: ['店铺', '每个店铺的今日经营、近 7 天利润和要处理的事（电脑端同步）。'],
  insights: ['数据复盘', '看看每条生产线产出了多少、通过了多少、发出去多少，再决定下一步。'],
  creators: ['达人管理', '多店铺寄样、达人履约与带货数据（电脑端同步）。'],
  inventory: ['店小秘库存', '缺货与需补货的 SKU（电脑端同步）。'],
  creative: ['tk创意室', '创意视频任务进度（电脑端生成，结果同步到这里）。'],
}
watch(tab, (value) => router.replace({ query: { tab: value } }))

const digest = ref<SyncBusinessDigest | null>(null)
const loaded = ref(false)
watch(
  () => syncState.version,
  async () => {
    digest.value = (await getRecord<SyncBusinessDigest>(SYNC_COLLECTIONS.businessDigest, BUSINESS_DIGEST_ID))?.data ?? null
    loaded.value = true
  },
  { immediate: true },
)

const LINE_LABEL: Record<string, string> = { clone: '复刻', creative: 'tk创意室', livephoto: '图生视频', production: '批量混剪', publish: '发布' }
const CREATIVE_STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: '草稿', tone: 'muted' },
  running: { label: '生成中', tone: 'blue' },
  requires_manual: { label: '需处理', tone: 'amber' },
  completed: { label: '已完成', tone: 'green' },
  failed: { label: '失败', tone: 'red' },
}
const EMPTY_TEXT: Record<Tab, string> = {
  shops: '电脑端还没有同步店铺数据（在电脑上打开「店铺」添加店铺并同步）',
  insights: '电脑端还没有生产数据，用复刻、图生视频等生成内容后会出现在这里',
  creators: '电脑端还没有接入达人中心店铺',
  inventory: '电脑端还没有在店小秘库存里添加 SKU',
  creative: '电脑端还没有 tk创意室任务',
}

const LEVEL_TONE: Record<string, string> = { error: 'lvl-bad', warning: 'lvl-warn', growth: 'lvl-good', ok: 'lvl-good' }
const pctText = (value?: number) => (value === undefined || !Number.isFinite(value) ? '' : `${value >= 0 ? '+' : ''}${Math.round(value * 1000) / 10}%`)
const money = (value: number) => (value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }))
function trend(now: number, before?: number) {
  if (before === undefined || before === 0) return null
  const pct = Math.round(((now - before) / before) * 100)
  return { pct, up: pct >= 0 }
}
const gmvTrend = computed(() => (digest.value?.creators ? trend(digest.value.creators.gmv, digest.value.creators.previousGmv) : null))
const ordersTrend = computed(() => (digest.value?.creators ? trend(digest.value.creators.orders, digest.value.creators.previousOrders) : null))
const hasSection = computed(() => Boolean(digest.value?.[tab.value]))
</script>

<template>
  <PageHeader :title="inWebShell ? WEB_TITLE[tab][0] : '经营数据'" :description="inWebShell ? WEB_TITLE[tab][1] : undefined" back="/create" />
  <main class="m-page m-page--no-tabs">
    <div v-if="!inWebShell" class="seg">
      <button v-for="t in TABS" :key="t.key" type="button" :class="{ 'is-active': tab === t.key }" @click="tab = t.key">{{ t.label }}</button>
    </div>

    <div v-if="loaded && digest" class="meta"><Clock :size="13" /> 电脑端 {{ relativeTime(digest.generatedAt) }}更新</div>

    <div v-if="loaded && !hasSection" class="m-card m-empty">
      <span class="m-empty__icon"><Monitor :size="28" /></span>
      <span class="m-empty__title">暂无数据</span>
      <span class="m-empty__text">{{ EMPTY_TEXT[tab] }}。数据在电脑端产生，登录同一账号后自动同步。</span>
    </div>

    <!-- 店铺 -->
    <template v-else-if="tab === 'shops' && digest?.shops">
      <section v-for="shop in digest.shops.shops" :key="shop.shopKey" class="m-card shop">
        <div class="shop__head">
          <strong>{{ shop.name }}</strong>
          <span v-if="shop.loginExpired" class="shop__tag bad">登录失效</span>
          <span v-else-if="shop.urgentShip" class="shop__tag bad">{{ shop.urgentShip }} 单快超时发货</span>
        </div>
        <div class="kpis">
          <div class="kpi"><small>今日 GMV</small><strong>{{ shop.today ? money(shop.today.gmv) : '—' }}</strong><small v-if="shop.yesterdayGmv !== undefined">昨日 {{ money(shop.yesterdayGmv) }}<template v-if="shop.gmvChangeDay !== undefined"> · 比上周同日 {{ pctText(shop.gmvChangeDay) }}</template></small></div>
          <div class="kpi"><small>近 7 天 GMV</small><strong>{{ money(shop.gmv7) }}</strong><small v-if="shop.gmvChange7 !== undefined" :class="shop.gmvChange7 >= 0 ? 'good' : 'bad'">{{ pctText(shop.gmvChange7) }}</small></div>
          <div v-if="shop.profit7 !== undefined" class="kpi"><small>近 7 天利润</small><strong :class="shop.profit7 >= 0 ? 'good' : 'bad'">{{ money(shop.profit7) }}</strong><small v-if="shop.margin7 !== undefined">利润率 {{ pctText(shop.margin7).replace('+', '') }}</small></div>
          <div v-if="shop.today" class="kpi"><small>今日订单 / 访客</small><strong>{{ shop.today.orders }} / {{ shop.today.visitors }}</strong><small>转化 {{ (shop.today.conversion * 100).toFixed(2) }}%</small></div>
        </div>
        <ul class="shop__findings">
          <li v-for="(finding, index) in shop.findings" :key="index" :class="LEVEL_TONE[finding.level]">
            <span>{{ finding.text }}</span>
            <small v-if="finding.action" class="m-muted">→ {{ finding.action }}</small>
          </li>
        </ul>
      </section>
      <p class="m-muted small note">今天和昨天是实时数据；利润按平台费率、成本价和广告费估算。详细数据和设置在电脑端或网页的「店铺」。</p>
    </template>

    <!-- 数据复盘 -->
    <template v-else-if="tab === 'insights' && digest?.insights">
      <section class="kpis">
        <div class="kpi"><small>发布（近 {{ digest.insights.rangeDays }} 天）</small><strong>{{ digest.insights.publish.published }}</strong></div>
        <div class="kpi"><small>发布失败</small><strong :class="{ bad: digest.insights.publish.failed > 0 }">{{ digest.insights.publish.failed }}</strong></div>
      </section>
      <section class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">各生产线</h2></div>
        <div class="m-card m-list">
          <div v-for="line in digest.insights.lines.filter((l) => l.produced > 0)" :key="line.line" class="m-row">
            <span class="m-row__main">
              <span class="m-row__title">{{ LINE_LABEL[line.line] || line.line }}</span>
              <span class="m-row__sub">产出 {{ line.produced }} · 通过 {{ line.approved }} · 重做 {{ line.redo }} · 发布 {{ line.published }}</span>
            </span>
            <span class="rate" :class="{ good: line.approvalRate >= 70, bad: line.approvalRate < 40 }">{{ line.approvalRate }}%</span>
          </div>
        </div>
      </section>
      <section v-if="digest.insights.recommendations.length" class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">建议</h2></div>
        <div class="m-card m-card--pad tips">
          <p v-for="text in digest.insights.recommendations" :key="text"><Lightbulb :size="14" /> {{ text }}</p>
        </div>
      </section>
      <section v-if="digest.insights.topProducts.length" class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">产出最多的商品</h2></div>
        <div class="m-card m-list">
          <div v-for="product in digest.insights.topProducts" :key="product.productName" class="m-row">
            <span class="m-row__main"><span class="m-row__title">{{ product.productName }}</span><span class="m-row__sub">产出 {{ product.produced }} · 通过 {{ product.approved }} · 发布 {{ product.published }}</span></span>
          </div>
        </div>
      </section>
      <section v-if="digest.insights.topRedoReasons.length" class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">重做原因</h2></div>
        <div class="chips"><span v-for="r in digest.insights.topRedoReasons" :key="r.reason" class="m-tag">{{ r.reason }} × {{ r.count }}</span></div>
      </section>
    </template>

    <!-- 达人中心 -->
    <template v-else-if="tab === 'creators' && digest?.creators">
      <section class="kpis">
        <div class="kpi">
          <small>达人带货 GMV</small><strong>{{ money(digest.creators.gmv) }}</strong>
          <em v-if="gmvTrend" :class="gmvTrend.up ? 'good' : 'bad'"><TrendingUp v-if="gmvTrend.up" :size="12" /><TrendingDown v-else :size="12" /> {{ gmvTrend.pct }}%</em>
        </div>
        <div class="kpi">
          <small>订单</small><strong>{{ digest.creators.orders }}</strong>
          <em v-if="ordersTrend" :class="ordersTrend.up ? 'good' : 'bad'"><TrendingUp v-if="ordersTrend.up" :size="12" /><TrendingDown v-else :size="12" /> {{ ordersTrend.pct }}%</em>
        </div>
        <div class="kpi"><small>佣金</small><strong>{{ money(digest.creators.commission) }}</strong></div>
        <div class="kpi"><small>出单达人</small><strong>{{ digest.creators.creatorsWithSales }}</strong></div>
      </section>
      <section class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">待办</h2><span class="m-muted small">{{ digest.creators.shopCount }} 个店铺</span></div>
        <div class="todo">
          <div class="todo__item" :class="{ warn: digest.creators.pendingReview > 0 }"><strong>{{ digest.creators.pendingReview }}</strong><small>样品申请待审核</small></div>
          <div class="todo__item" :class="{ warn: digest.creators.awaitingContent > 0 }"><strong>{{ digest.creators.awaitingContent }}</strong><small>等达人发视频</small></div>
          <div class="todo__item" :class="{ bad: digest.creators.overdueSamples > 0 }"><strong>{{ digest.creators.overdueSamples }}</strong><small>样品超期未履约</small></div>
        </div>
      </section>
      <section class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">样品漏斗</h2><span v-if="digest.creators.fulfillmentRate !== undefined" class="m-muted small">履约率 {{ Math.round(digest.creators.fulfillmentRate * 100) }}%</span></div>
        <div class="m-card m-card--pad funnel">
          <div v-for="[label, value] in [['申请', digest.creators.sampleFunnel.applications], ['已寄', digest.creators.sampleFunnel.shipped], ['已发视频', digest.creators.sampleFunnel.fulfilled], ['已出单', digest.creators.sampleFunnel.withSales]] as const" :key="label" class="funnel__row">
            <span>{{ label }}</span>
            <span class="funnel__bar"><span :style="{ width: `${digest.creators.sampleFunnel.applications ? Math.max(4, (Number(value) / digest.creators.sampleFunnel.applications) * 100) : 0}%` }" /></span>
            <b>{{ value }}</b>
          </div>
        </div>
        <p class="m-muted small note">视频 {{ digest.creators.videos }} 条 · 直播 {{ digest.creators.lives }} 场 · 发内容的达人 {{ digest.creators.creatorsPosting }} 位</p>
      </section>
    </template>

    <!-- 店小秘库存 -->
    <template v-else-if="tab === 'inventory' && digest?.inventory">
      <p v-if="!digest.inventory.authenticated" class="m-notice m-notice--amber"><AlertTriangle :size="16" /> 电脑端店小秘登录已失效，库存可能不是最新</p>
      <section class="kpis three">
        <div class="kpi"><small>SKU</small><strong>{{ digest.inventory.skuCount }}</strong></div>
        <div class="kpi"><small>缺货</small><strong :class="{ bad: digest.inventory.outOfStockCount > 0 }">{{ digest.inventory.outOfStockCount }}</strong></div>
        <div class="kpi"><small>需补货</small><strong :class="{ warn: digest.inventory.reorderCount > 0 }">{{ digest.inventory.reorderCount }}</strong></div>
      </section>
      <section class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">需要处理的 SKU</h2></div>
        <div v-if="digest.inventory.atRisk.length" class="m-card m-list">
          <div v-for="item in digest.inventory.atRisk" :key="item.sku" class="m-row">
            <span class="sku-img"><img v-if="item.imageUrl" :src="item.imageUrl" alt="" /><PackageX v-else :size="18" /></span>
            <span class="m-row__main">
              <span class="m-row__title">{{ item.sku }}</span>
              <span class="m-row__sub">库存 {{ item.currentStock }} · 日均出货 {{ item.averageDaily }}<template v-if="item.daysToStockout !== undefined && item.risk === 'reorder'"> · 约 {{ item.daysToStockout }} 天卖完</template></span>
            </span>
            <span class="m-badge" :class="item.risk === 'out_of_stock' ? 'm-badge--red' : 'm-badge--amber'">{{ item.risk === 'out_of_stock' ? '缺货' : '补货' }}</span>
          </div>
        </div>
        <div v-else class="m-card m-empty"><span class="m-empty__title">库存都正常</span></div>
      </section>
    </template>

    <!-- tk创意室 -->
    <template v-else-if="tab === 'creative' && digest?.creative">
      <section class="kpis three">
        <div class="kpi"><small>生成中</small><strong>{{ digest.creative.running }}</strong></div>
        <div class="kpi"><small>需处理</small><strong :class="{ warn: digest.creative.needsAttention > 0 }">{{ digest.creative.needsAttention }}</strong></div>
        <div class="kpi"><small>已完成</small><strong>{{ digest.creative.completed }}</strong></div>
      </section>
      <section class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">最近任务</h2></div>
        <div class="m-card m-list">
          <div v-for="task in digest.creative.recent" :key="task.id" class="m-row">
            <span class="m-row__main">
              <span class="m-row__title">{{ task.productName }}</span>
              <span class="m-row__sub">{{ task.completedShots }}/{{ task.totalShots }} 镜完成<template v-if="task.failedShots"> · {{ task.failedShots }} 镜失败</template> · {{ relativeTime(task.createdAt) }}</span>
              <span v-if="task.lastError && task.status !== 'completed'" class="err">{{ task.lastError }}</span>
            </span>
            <span class="m-badge" :class="`m-badge--${(CREATIVE_STATUS[task.status] || CREATIVE_STATUS.draft).tone}`">
              <LoaderCircle v-if="task.status === 'running'" :size="11" class="m-spin" />{{ (CREATIVE_STATUS[task.status] || { label: task.status }).label }}
            </span>
          </div>
        </div>
        <p class="m-muted small note">创意室要用电脑上登录的 TikTok 账号生成，需要处理的任务请在电脑端操作。</p>
      </section>
    </template>
  </main>
</template>

<style scoped>
.small { font-size: 12px; }
.shop { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.shop__head { display: flex; align-items: center; gap: 8px; }
.shop__head strong { font-size: 16px; flex: 1; }
.shop__tag { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--vg-red, #ef4444) 15%, transparent); }
.shop__findings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.shop__findings li { display: flex; flex-direction: column; gap: 2px; padding-left: 10px; border-left: 3px solid var(--theme-border); font-size: 13px; line-height: 1.5; }
.shop__findings li.lvl-bad { border-left-color: var(--vg-red, #ef4444); }
.shop__findings li.lvl-warn { border-left-color: var(--vg-amber, #f59e0b); }
.shop__findings li.lvl-good { border-left-color: var(--vg-green, #16a34a); }
.shop__findings small { font-size: 12px; }
.note { margin: 10px 2px 0; line-height: 1.6; }
.seg { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-bottom: 10px; padding: 4px; border-radius: 14px; background: var(--theme-panel); border: 1px solid var(--theme-border); }
.seg button { height: 36px; border: 0; border-radius: 10px; background: none; color: var(--theme-text-muted); font-size: 13px; font-weight: 700; }
.seg button.is-active { background: var(--theme-control-hover); color: var(--theme-text); }
.meta { display: flex; align-items: center; gap: 4px; margin: 0 2px 10px; color: var(--theme-text-muted); font-size: 12px; }
.m-notice { margin: 0 0 10px; }
.kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.kpis.three { grid-template-columns: repeat(3, 1fr); }
.kpi { display: flex; flex-direction: column; gap: 4px; padding: 14px; border: 1px solid var(--theme-border); border-radius: 14px; background: var(--theme-panel); }
.kpi small { color: var(--theme-text-muted); font-size: 12px; }
.kpi strong { font-size: 22px; font-variant-numeric: tabular-nums; }
.kpi em { display: inline-flex; align-items: center; gap: 2px; font-size: 11px; font-style: normal; font-weight: 700; }
.good { color: var(--m-green); }
.bad { color: var(--m-red); }
.warn { color: var(--m-amber); }
.rate { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
.tips p { display: flex; gap: 6px; margin: 0 0 8px; font-size: 13px; line-height: 1.6; }
.tips p:last-child { margin-bottom: 0; }
.tips svg { flex: none; margin-top: 3px; color: var(--m-amber); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.todo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.todo__item { display: flex; flex-direction: column; gap: 4px; padding: 12px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); }
.todo__item strong { font-size: 20px; }
.todo__item small { color: var(--theme-text-muted); font-size: 11px; }
.todo__item.warn strong { color: var(--m-amber); }
.todo__item.bad strong { color: var(--m-red); }
.funnel { display: flex; flex-direction: column; gap: 10px; }
.funnel__row { display: grid; grid-template-columns: 64px 1fr 36px; align-items: center; gap: 8px; font-size: 12px; }
.funnel__row b { text-align: right; font-variant-numeric: tabular-nums; }
.funnel__bar { height: 8px; border-radius: 999px; background: var(--theme-control-hover); overflow: hidden; }
.funnel__bar span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--m-accent), var(--m-accent-2)); }
.sku-img { flex: none; display: grid; place-items: center; width: 40px; height: 40px; overflow: hidden; border-radius: 8px; background: var(--theme-control); color: var(--theme-text-muted); }
.sku-img img { width: 100%; height: 100%; object-fit: cover; }
.err { display: block; margin-top: 2px; color: var(--theme-danger-text); font-size: 11px; white-space: normal; }
</style>
