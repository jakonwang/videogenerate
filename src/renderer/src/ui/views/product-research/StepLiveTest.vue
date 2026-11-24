<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  ArrowLeft, ArrowRight, Banknote, Box, CalendarDays, ChevronDown, Download, Eye, Filter, LayoutGrid, List, MoreHorizontal,
  MousePointerClick, Pencil, Percent, Play, Plus, RotateCcw, ShoppingCart, Trash2, Tv, Undo2,
} from 'lucide-vue-next'
import type { ProductResearchLiveTestRecord } from '../../../../../shared/productResearch'
import { useSchemeWorkspace } from './useSchemeWorkspace'
import PrPager from './PrPager.vue'
import { vFloatMenu } from './floatMenu'
import PrThumb from './PrThumb.vue'
import PrLiveTestDialog from './PrLiveTestDialog.vue'
import PrConfirmDialog from './PrConfirmDialog.vue'
import {
  CONCLUSIONS, conclusionMeta, downloadCsv, formatDate, formatDay, formatNumber, formatPercent, marketOf, ratio, safeFileName,
} from './productResearchUtils'

const ws = useSchemeWorkspace()
const { scheme, liveTestRecords, candidateRows, productEdits, resultMap } = ws

const filters = reactive({ conclusion: 'all', from: '', to: '' })
const tab = ref<'list' | 'board'>('list')
const page = ref(1)
const pageSize = ref(10)
const checked = ref<string[]>([])
const dialogOpen = ref(false)
const editing = ref<ProductResearchLiveTestRecord | null>(null)
const rowMenu = ref('')
const batchMenu = ref(false)
const confirmDelete = ref<string[] | null>(null)

const currency = computed(() => marketOf(scheme.value?.market).currency || '本币')

/** 可测试商品：已保留的候选商品；若尚未保留任何商品，则退回全部候选商品。 */
const testableProducts = computed(() => {
  const kept = new Set(productEdits.value.filter((item) => item.kept).map((item) => item.resultId))
  const keptRows = candidateRows.value.filter((item) => kept.has(item.id))
  return keptRows.length ? keptRows : candidateRows.value
})

const codes = computed(() => new Map(productEdits.value.map((item) => [item.resultId, item.code || ''])))
const codeOf = (id: string) => codes.value.get(id) || ''

const filtered = computed(() => {
  const from = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : 0
  const to = filters.to ? new Date(`${filters.to}T23:59:59`).getTime() : 0
  return liveTestRecords.value
    .filter((item) => {
      if (filters.conclusion === 'none' && item.conclusion) return false
      if (filters.conclusion !== 'all' && filters.conclusion !== 'none' && item.conclusion !== filters.conclusion) return false
      if (from && item.updatedAt < from) return false
      if (to && item.updatedAt > to) return false
      return true
    })
    .sort((a, b) => b.revenue - a.revenue)
})
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const allChecked = computed(() => filtered.value.length > 0 && filtered.value.every((item) => checked.value.includes(item.id)))

watch(filters, () => { page.value = 1 }, { deep: true })
watch(liveTestRecords, (list) => {
  const ids = new Set(list.map((item) => item.id))
  checked.value = checked.value.filter((id) => ids.has(id))
}, { deep: true })

const stats = computed(() => {
  const list = filtered.value
  const sum = (key: 'sessions' | 'views' | 'clicks' | 'orders' | 'revenue') => list.reduce((total, item) => total + (Number(item[key]) || 0), 0)
  const views = sum('views')
  const clicks = sum('clicks')
  const orders = sum('orders')
  const weightedRefund = orders ? list.reduce((total, item) => total + item.refundRate * item.orders, 0) / orders : 0
  return {
    products: new Set(list.map((item) => item.resultId)).size,
    sessions: sum('sessions'),
    views,
    clicks,
    orders,
    revenue: sum('revenue'),
    ctr: ratio(clicks, views),
    cvr: ratio(orders, clicks),
    refund: weightedRefund * 100,
  }
})

function toggleAll() {
  checked.value = allChecked.value ? [] : filtered.value.map((item) => item.id)
}

function openNew() {
  if (!testableProducts.value.length) {
    ws.notify('请先在「确定商品」中保留至少 1 个商品', 'error')
    return
  }
  editing.value = null
  dialogOpen.value = true
}
function openEdit(record: ProductResearchLiveTestRecord) {
  rowMenu.value = ''
  editing.value = record
  dialogOpen.value = true
}
function saveRecord(draft: Parameters<typeof ws.upsertTestRecord>[0]) {
  ws.upsertTestRecord(draft)
  dialogOpen.value = false
  ws.notify(draft.id ? '测试记录已更新' : '已新增测试记录', 'success')
}

function setConclusion(ids: string[], conclusion: ProductResearchLiveTestRecord['conclusion']) {
  batchMenu.value = false
  rowMenu.value = ''
  if (!ids.length) { ws.notify('请先勾选测试记录'); return }
  ws.setConclusion(ids, conclusion)
  ws.notify(`已更新 ${ids.length} 条记录的结论`, 'success')
}

function doDelete() {
  if (!confirmDelete.value) return
  ws.removeTestRecords(confirmDelete.value)
  ws.notify(`已删除 ${confirmDelete.value.length} 条测试记录`)
  confirmDelete.value = null
}

function exportData() {
  if (!filtered.value.length) { ws.notify('没有可导出的测试数据'); return }
  downloadCsv(`${safeFileName(scheme.value?.name || '选品')}_直播测试`, ['序号', '商品名称', '款号', '测试场次', '曝光人数', '点击人数', '成交订单', `成交金额(${currency.value})`, '点击率', '转化率', '退款/负反馈率', '主播反馈', '测试结论', '更新时间'],
    filtered.value.map((item, index) => {
      const result = resultMap.value.get(item.resultId)
      return [index + 1, result?.title || item.resultId, codeOf(item.resultId), item.sessions, item.views, item.clicks, item.orders, item.revenue,
        formatPercent(ratio(item.clicks, item.views)), formatPercent(ratio(item.orders, item.clicks)), formatPercent(item.refundRate * 100), item.hostFeedback, conclusionMeta(item.conclusion)?.label || '未下结论', formatDate(item.updatedAt)]
    }))
}

function conclusionTone(value: string) {
  return value === 'excellent' ? 'green' : value === 'potential' ? 'amber' : value === 'observe' ? 'blue' : value === 'eliminate' ? 'red' : ''
}

const boardColumns = computed(() => [
  ...CONCLUSIONS.map((item) => ({ key: item.value as string, label: item.label, icon: item.icon, tone: conclusionTone(item.value) })),
  { key: '', label: '未下结论', icon: '…', tone: '' },
].map((column) => ({ ...column, items: filtered.value.filter((item) => (item.conclusion || '') === column.key) })))

const concluded = computed(() => liveTestRecords.value.filter((item) => item.conclusion).length)
const today = formatDay(Date.now())
</script>

<template>
  <div class="slt">
    <section class="prd-card slt-main">
      <div class="prd-section-head">
        <h2><Tv :size="22" />直播测试</h2>
        <p>通过小规模直播验证商品的实时表现，评估转化效果并确定是否放量。</p>
        <div class="prd-section-head__right">
          <label class="slt-filter"><Filter :size="13" />状态
            <select v-model="filters.conclusion" class="prd-select prd-select--sm">
              <option value="all">全部状态</option>
              <option v-for="item in CONCLUSIONS" :key="item.value" :value="item.value">{{ item.label }}</option>
              <option value="none">未下结论</option>
            </select>
          </label>
          <label class="slt-filter"><CalendarDays :size="13" />测试时间
            <input v-model="filters.from" type="date" class="prd-input prd-input--sm" :max="filters.to || today" />
            <span>–</span>
            <input v-model="filters.to" type="date" class="prd-input prd-input--sm" :min="filters.from" :max="today" />
            <button v-if="filters.from || filters.to" class="prd-icon-btn" title="清除日期" @click="filters.from = ''; filters.to = ''"><RotateCcw :size="12" /></button>
          </label>
          <button class="prd-btn prd-btn--primary" @click="openNew"><Plus :size="15" />新增测试记录</button>
          <button class="prd-btn prd-btn--outline" @click="exportData"><Download :size="14" />导出数据</button>
        </div>
      </div>

      <div class="prd-stats slt-stats">
        <div class="prd-stat"><span class="prd-stat__icon"><Box :size="16" /></span><div><div class="prd-stat__label">测试商品</div><div class="prd-stat__value">{{ stats.products }}<small>个</small></div></div></div>
        <div class="prd-stat"><span class="prd-stat__icon"><Play :size="16" /></span><div><div class="prd-stat__label">测试场次</div><div class="prd-stat__value">{{ stats.sessions }}<small>场</small></div></div></div>
        <div class="prd-stat"><span class="prd-stat__icon"><Eye :size="16" /></span><div><div class="prd-stat__label">总曝光人数</div><div class="prd-stat__value">{{ formatNumber(stats.views) }}</div></div></div>
        <div class="prd-stat"><span class="prd-stat__icon"><MousePointerClick :size="16" /></span><div><div class="prd-stat__label">总点击人数</div><div class="prd-stat__value">{{ formatNumber(stats.clicks) }}</div></div></div>
        <div class="prd-stat"><span class="prd-stat__icon"><ShoppingCart :size="16" /></span><div><div class="prd-stat__label">总成交订单</div><div class="prd-stat__value">{{ formatNumber(stats.orders) }}</div></div></div>
        <div class="prd-stat"><span class="prd-stat__icon"><Banknote :size="16" /></span><div><div class="prd-stat__label">成交金额</div><div class="prd-stat__value">{{ formatNumber(stats.revenue) }}</div></div></div>
        <div class="prd-stat"><span class="prd-stat__icon"><Percent :size="16" /></span><div><div class="prd-stat__label">平均点击率</div><div class="prd-stat__value">{{ formatPercent(stats.ctr) }}</div></div></div>
        <div class="prd-stat"><span class="prd-stat__icon"><Filter :size="16" /></span><div><div class="prd-stat__label">平均转化率</div><div class="prd-stat__value">{{ formatPercent(stats.cvr) }}</div></div></div>
        <div class="prd-stat"><span class="prd-stat__icon"><Undo2 :size="16" /></span><div><div class="prd-stat__label">退款/负反馈率</div><div class="prd-stat__value">{{ formatPercent(stats.refund) }}</div></div></div>
      </div>

      <div class="prd-seg">
        <button class="prd-seg__btn" :class="{ 'is-active': tab === 'list' }" @click="tab = 'list'"><List :size="14" />商品测试列表（{{ filtered.length }}）</button>
        <button class="prd-seg__btn" :class="{ 'is-active': tab === 'board' }" @click="tab = 'board'"><LayoutGrid :size="14" />分组看板</button>
      </div>

      <template v-if="!liveTestRecords.length">
        <div class="prd-empty slt-empty">
          <div class="prd-empty__icon"><Box :size="26" /></div>
          <h3>暂无测试数据</h3>
          <p>当前方案还没有添加直播测试记录</p>
          <button class="prd-btn prd-btn--soft prd-btn--sm" @click="openNew"><Plus :size="13" />新增测试记录</button>
        </div>
      </template>

      <template v-else-if="tab === 'list'">
        <div class="prd-table-wrap">
          <table class="prd-table">
            <thead>
              <tr>
                <th class="chk"><input type="checkbox" :checked="allChecked" aria-label="全选" @change="toggleAll" /></th>
                <th>#</th><th>商品信息</th><th class="num">测试场次</th><th class="num">曝光人数</th><th class="num">点击人数</th><th class="num">成交订单</th>
                <th class="num">成交金额（{{ currency }}）</th><th class="num" title="点击人数 ÷ 曝光人数">点击率</th><th class="num" title="成交订单 ÷ 点击人数">转化率</th>
                <th class="num">退款/负反馈</th><th>主播反馈</th><th>测试结论</th><th>状态</th><th class="center">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!paged.length"><td colspan="15" class="prd-empty-cell">当前筛选条件下没有测试记录</td></tr>
              <tr v-for="(record, index) in paged" :key="record.id" :class="{ 'is-selected': checked.includes(record.id) }">
                <td class="chk"><input v-model="checked" type="checkbox" :value="record.id" /></td>
                <td class="muted">{{ (page - 1) * pageSize + index + 1 }}</td>
                <td>
                  <div class="prd-product">
                    <PrThumb :result="resultMap.get(record.resultId)" />
                    <div class="prd-product__meta">
                      <span class="prd-product__name" :title="resultMap.get(record.resultId)?.title">{{ resultMap.get(record.resultId)?.title || '商品已删除' }}</span>
                      <span class="prd-product__sub">款号：{{ codeOf(record.resultId) || '未填' }}</span>
                    </div>
                  </div>
                </td>
                <td class="num nowrap">{{ record.sessions }} 场</td>
                <td class="num">{{ formatNumber(record.views) }}</td>
                <td class="num">{{ formatNumber(record.clicks) }}</td>
                <td class="num">{{ formatNumber(record.orders) }}</td>
                <td class="num nowrap">{{ formatNumber(record.revenue) }}</td>
                <td class="num prd-num-green">{{ formatPercent(ratio(record.clicks, record.views)) }}</td>
                <td class="num prd-num-green">{{ formatPercent(ratio(record.orders, record.clicks)) }}</td>
                <td class="num" :class="{ 'prd-num-red': record.refundRate >= 0.04 }">{{ formatPercent(record.refundRate * 100) }}</td>
                <td><span class="slt-feedback" :title="record.hostFeedback">{{ record.hostFeedback || '-' }}</span></td>
                <td>
                  <span v-if="record.conclusion" class="prd-pill" :class="`prd-pill--${conclusionTone(record.conclusion)}`">{{ conclusionMeta(record.conclusion)?.icon }} {{ conclusionMeta(record.conclusion)?.label }}</span>
                  <span v-else class="muted">-</span>
                </td>
                <td>
                  <span v-if="record.conclusion" class="prd-pill" :class="`prd-pill--solid-${conclusionTone(record.conclusion)}`">{{ conclusionMeta(record.conclusion)?.label }}</span>
                  <span v-else class="prd-pill">待评估</span>
                </td>
                <td class="center nowrap">
                  <button class="prd-icon-btn" title="编辑" @click="openEdit(record)"><Pencil :size="14" /></button>
                  <div class="prd-menu-wrap">
                    <button class="prd-icon-btn" title="更多" @click="rowMenu = rowMenu === record.id ? '' : record.id"><MoreHorizontal :size="14" /></button>
                    <div v-if="rowMenu === record.id" v-float-menu class="prd-menu">
                      <button v-for="item in CONCLUSIONS" :key="item.value" :disabled="record.conclusion === item.value" @click="setConclusion([record.id], item.value)">{{ item.icon }} 设为{{ item.label }}</button>
                      <button class="danger" @click="rowMenu = ''; confirmDelete = [record.id]"><Trash2 :size="13" />删除记录</button>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <PrPager v-model:page="page" v-model:page-size="pageSize" :total="filtered.length" :page-sizes="[10, 20, 50]">
          <template #left>
            <label class="slt-all"><input type="checkbox" :checked="allChecked" @change="toggleAll" />全选</label>
            <span>已选择 <b class="prd-num-green">{{ checked.length }}</b> 个商品</span>
            <div class="prd-menu-wrap">
              <button class="prd-btn prd-btn--sm" :disabled="!checked.length" @click="batchMenu = !batchMenu">批量设置结论<ChevronDown :size="13" /></button>
              <div v-if="batchMenu" v-float-menu class="prd-menu prd-menu--up prd-menu--left">
                <button v-for="item in CONCLUSIONS" :key="item.value" @click="setConclusion(checked, item.value)">{{ item.icon }} {{ item.label }}</button>
                <button @click="setConclusion(checked, '')">清除结论</button>
              </div>
            </div>
            <button class="prd-btn prd-btn--sm prd-btn--danger" :disabled="!checked.length" @click="confirmDelete = [...checked]"><Trash2 :size="13" />批量删除</button>
          </template>
        </PrPager>
      </template>

      <div v-else class="slt-board">
        <div v-for="column in boardColumns" :key="column.key || 'none'" class="slt-board__col">
          <div class="slt-board__head"><span class="prd-pill" :class="column.tone && `prd-pill--${column.tone}`">{{ column.icon }} {{ column.label }}</span><b>{{ column.items.length }}</b></div>
          <div v-if="!column.items.length" class="slt-board__empty">暂无商品</div>
          <article v-for="record in column.items" :key="record.id" class="slt-card" @click="openEdit(record)">
            <div class="slt-card__top">
              <PrThumb :result="resultMap.get(record.resultId)" size="sm" />
              <span class="prd-product__name" :title="resultMap.get(record.resultId)?.title">{{ resultMap.get(record.resultId)?.title || '商品已删除' }}</span>
            </div>
            <div class="slt-card__metrics">
              <span>成交 <b>{{ formatNumber(record.revenue) }}</b></span>
              <span>转化 <b>{{ formatPercent(ratio(record.orders, record.clicks)) }}</b></span>
              <span>场次 <b>{{ record.sessions }}</b></span>
            </div>
            <div class="slt-card__move" @click.stop>
              <button v-for="item in CONCLUSIONS.filter((c) => c.value !== record.conclusion)" :key="item.value" class="prd-chip" :title="`移到${item.label}`" @click="setConclusion([record.id], item.value)">{{ item.icon }} {{ item.label }}</button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <footer class="prd-footer">
      <div class="prd-footer__left">已测试 <b>{{ new Set(liveTestRecords.map((item) => item.resultId)).size }}</b> 个商品，已下结论 <b>{{ concluded }}</b> 个</div>
      <div class="prd-footer__right">
        <span v-if="!concluded" class="prd-footer__hint">请至少为 1 个商品给出测试结论</span>
        <button class="prd-btn prd-btn--outline prd-btn--lg" @click="ws.goStep(3)"><ArrowLeft :size="16" />上一步：确定商品</button>
        <button class="prd-btn prd-btn--primary prd-btn--lg" :disabled="!concluded" @click="ws.goStep(5)">保存并下一步：获得爆款商品<ArrowRight :size="16" /></button>
      </div>
    </footer>

    <PrLiveTestDialog :open="dialogOpen" :record="editing" :products="testableProducts" :records="liveTestRecords" :currency="currency" :codes="codes" @close="dialogOpen = false" @save="saveRecord" />
    <PrConfirmDialog :open="Boolean(confirmDelete)" title="删除测试记录" :message="`确定删除 ${confirmDelete?.length || 0} 条测试记录吗？`" confirm-text="删除" @close="confirmDelete = null" @confirm="doDelete" />
  </div>
</template>

<style scoped>
.slt { display: flex; flex-direction: column; gap: 12px; }
.slt-main { display: flex; flex-direction: column; gap: 14px; }
.slt-filter { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--theme-text-secondary); white-space: nowrap; }
.slt-filter .prd-input { width: 130px; }
.slt-stats { grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 8px; }
.slt-stats .prd-stat { padding: 10px; gap: 9px; }
.slt-stats .prd-stat__icon { width: 30px; height: 30px; }
.slt-stats .prd-stat__value { font-size: 17px; }
.slt-feedback { display: inline-block; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 3px 8px; border-radius: 6px; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); font-size: 12px; }
.slt-all { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.slt-empty { border: 1px dashed var(--theme-border-control); border-radius: 10px; }
.slt-board { display: grid; grid-template-columns: repeat(5, minmax(200px, 1fr)); gap: 10px; overflow-x: auto; }
.slt-board__col { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 10px; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); min-height: 200px; }
.slt-board__head { display: flex; align-items: center; justify-content: space-between; }
.slt-board__empty { padding: 20px 0; text-align: center; font-size: 12px; color: var(--theme-text-muted); }
.slt-card { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 8px; background: var(--theme-panel); border: 1px solid var(--theme-border); cursor: pointer; }
.slt-card:hover { border-color: color-mix(in srgb, var(--theme-accent) 50%, transparent); }
.slt-card__top { display: flex; gap: 8px; align-items: center; }
.slt-card__top .prd-product__name { font-size: 12px; }
.slt-card__metrics { display: flex; justify-content: space-between; gap: 6px; flex-wrap: wrap; font-size: 11px; color: var(--theme-text-muted); }
.slt-card__metrics b { color: var(--theme-text); }
.slt-card__move { display: flex; flex-wrap: wrap; gap: 4px; }
.slt-card__move .prd-chip { cursor: pointer; }
.slt-card__move .prd-chip:hover { color: var(--theme-accent); border-color: var(--theme-accent); }
.muted { color: var(--theme-text-muted); }
</style>
