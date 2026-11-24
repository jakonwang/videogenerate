<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowLeft, Check, Download, Loader2, PackagePlus, Pencil, Save, Trophy } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import type { ProductResearchLiveTestRecord, ProductResearchProductEdit, ProductResearchResult } from '../../../../../shared/productResearch'
import { useSchemeWorkspace } from './useSchemeWorkspace'
import PrThumb from './PrThumb.vue'
import { researchSourceOf } from '../../../../../shared/productResearch'
import { CONCLUSIONS, conclusionMeta, downloadCsv, formatNumber, formatPercent, formatPrice, sourceLabel, marketOf, ratio, safeFileName, type Conclusion } from './productResearchUtils'

const ws = useSchemeWorkspace()
const router = useRouter()
const { scheme, liveTestRecords, resultMap, productEdits } = ws

const tab = ref<Conclusion>('excellent')
const libraryNames = ref(new Set<string>())
const libraryCodes = ref(new Set<string>())
const inLibrary = (result?: ProductResearchResult) => Boolean(result) && (libraryNames.value.has(productName(result!.title)) || libraryCodes.value.has(editMap.value.get(result!.id)?.code || '-'))
const adding = ref<string[]>([])
const completing = ref(false)

const currency = computed(() => marketOf(scheme.value?.market).currency || '本币')
const editMap = computed(() => new Map(productEdits.value.map((item) => [item.resultId, item])))

type TierRow = { record: ProductResearchLiveTestRecord; result?: ProductResearchResult; edit?: ProductResearchProductEdit }

const tiers = computed(() => Object.fromEntries(CONCLUSIONS.map((meta) => [
  meta.value,
  liveTestRecords.value
    .filter((record) => record.conclusion === meta.value)
    .map((record): TierRow => ({ record, result: resultMap.value.get(record.resultId), edit: editMap.value.get(record.resultId) }))
    .sort((a, b) => b.record.revenue - a.record.revenue),
])) as Record<Conclusion, TierRow[]>)

const rows = computed(() => tiers.value[tab.value] || [])
const tierRevenue = (key: Conclusion) => (tiers.value[key] || []).reduce((sum, item) => sum + item.record.revenue, 0)

function tone(value: string) {
  return value === 'excellent' ? 'green' : value === 'potential' ? 'amber' : value === 'observe' ? 'blue' : 'red'
}

function adviceFor(conclusion: Conclusion, cvr: number) {
  if (conclusion === 'excellent') return cvr >= 8 ? '数据优秀，建议重点放量并备货' : '数据优秀，建议重点放量'
  if (conclusion === 'potential') return '转化稳定，可加大投放继续测试'
  if (conclusion === 'observe') return '有潜力，建议优化直播场景后复测'
  return '表现不佳，移出选品池'
}

function guessType(category = '', title = '') {
  const text = `${category} ${title}`.toLowerCase()
  if (/耳|bông tai|earring/.test(text)) return 'earring'
  if (/项链|dây chuyền|necklace/.test(text)) return 'necklace'
  if (/戒指|nhẫn|ring/.test(text)) return 'ring'
  if (/手链|手镯|vòng tay|bracelet/.test(text)) return 'bracelet'
  if (/包|túi|bag/.test(text)) return 'bag'
  if (/手机壳|ốp|phone/.test(text)) return 'phone_case'
  return 'general'
}

async function loadLibrary() {
  try {
    const products = await window.api.products.list() as { name: string; code?: string }[]
    libraryCodes.value = new Set(products.map((item) => item.code || '').filter(Boolean))
    libraryNames.value = new Set(products.map((item) => item.name))
  } catch { /* product library unavailable */ }
}

function codeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const taken = /PRODUCT_CODE_TAKEN:(.*)$/.exec(message)
  if (taken) return `款号已经用在「${taken[1]}」上`
  return message.includes('PRODUCT_CODE_INVALID') ? '款号要同时有字母和数字' : message
}

function productName(title: string) {
  return title.trim().slice(0, 80)
}

async function addToLibrary(resultIds: string[]) {
  const pending = resultIds.filter((id) => {
    const result = resultMap.value.get(id)
    return result && !inLibrary(result)
  })
  if (!pending.length) { ws.notify('所选商品已全部在商品库中'); return }
  adding.value = pending
  let created = 0
  for (const id of pending) {
    const result = resultMap.value.get(id)!
    const record = liveTestRecords.value.find((item) => item.resultId === id)
    const edit = editMap.value.get(id)
    const now = Date.now()
    const remark = [
      `来源：选品方案「${scheme.value?.name || ''}」`,
      edit?.category ? `类目：${edit.category}` : '',
      edit?.targetPrice ? `目标售价：${edit.targetPrice} ${currency.value}` : '',
      edit?.sellingPoint ? `卖点：${edit.sellingPoint}` : '',
      record ? `直播测试：${record.sessions} 场，成交 ${formatNumber(record.revenue)} ${currency.value}，转化率 ${formatPercent(ratio(record.orders, record.clicks))}` : '',
      `采集价格：${formatPrice(result)}（${sourceLabel(researchSourceOf(result))}），销量：${result.salesText || '-'}`,
    ].filter(Boolean).join('\n')
    try {
      await window.api.products.upsert({
        name: productName(result.title),
        type: guessType(edit?.category, result.title),
        remark,
        ...(edit?.code ? { code: edit.code } : {}),
        images: result.imagePath ? [{ id: `pr-${result.id}`, productId: '', filePath: result.imagePath, fileName: result.imagePath.split(/[\\/]/).pop() || 'cover.jpg', fileSize: 0, createdAt: now, updatedAt: now, isCover: true }] : [],
      })
      libraryNames.value.add(productName(result.title))
      if (edit?.code) libraryCodes.value.add(edit.code)
      created += 1
    } catch (error) {
      ws.notify(`「${result.title.slice(0, 20)}」加入商品库失败：${codeError(error)}`, 'error')
    }
  }
  adding.value = []
  if (created) ws.notify(`已将 ${created} 个商品加入商品库`, 'success')
}

async function completeScheme() {
  completing.value = true
  const saved = await ws.save({ silent: true })
  const next = saved ? await ws.updateScheme({ status: 'completed', sopStage: 5 }) : null
  completing.value = false
  if (next) ws.notify('方案已保存并标记为已完成', 'success')
}

function exportAll() {
  const list = CONCLUSIONS.flatMap((meta) => (tiers.value[meta.value] || []).map((item) => ({ ...item, meta })))
  if (!list.length) { ws.notify('暂无可导出的结果'); return }
  downloadCsv(`${safeFileName(scheme.value?.name || '选品')}_爆款结果`, ['分层', '商品名称', '款号', '类目', `目标售价(${currency.value})`, '卖点', '测试场次', `成交金额(${currency.value})`, '点击率', '转化率', '退款率', '主播反馈', '推荐动作'],
    list.map(({ record, result, edit, meta }) => [meta.tier, result?.title || record.resultId, edit?.code || '', edit?.category || '', edit?.targetPrice || '', edit?.sellingPoint || '', record.sessions, record.revenue,
      formatPercent(ratio(record.clicks, record.views)), formatPercent(ratio(record.orders, record.clicks)), formatPercent(record.refundRate * 100), record.hostFeedback, adviceFor(meta.value, ratio(record.orders, record.clicks))]))
}

onMounted(loadLibrary)
</script>

<template>
  <div class="sw">
    <section class="prd-card sw-main">
      <div class="prd-section-head">
        <h2><Trophy :size="22" />获得爆款商品</h2>
        <p>根据直播测试结论，分层输出爆款商品结果。</p>
        <div class="prd-section-head__right">
          <button class="prd-btn prd-btn--outline" :disabled="completing" @click="completeScheme"><Loader2 v-if="completing" :size="14" class="prd-spin" /><Save v-else :size="14" />保存商品方案</button>
          <button class="prd-btn prd-btn--outline" :disabled="!tiers.excellent.length || adding.length > 0" @click="addToLibrary(tiers.excellent.map((item) => item.record.resultId))"><PackagePlus :size="14" />爆款加入商品库</button>
          <button class="prd-btn prd-btn--outline" @click="exportAll"><Download :size="14" />导出结果</button>
        </div>
      </div>

      <div class="sw-tiers">
        <button v-for="meta in CONCLUSIONS" :key="meta.value" class="sw-tier" :class="[`sw-tier--${tone(meta.value)}`, { 'is-active': tab === meta.value }]" @click="tab = meta.value">
          <span class="sw-tier__icon">{{ meta.icon }}</span>
          <span class="sw-tier__text"><b>{{ meta.tier }}（{{ tiers[meta.value]?.length || 0 }}）</b><small>成交 {{ formatNumber(tierRevenue(meta.value)) }} {{ currency }}</small></span>
        </button>
      </div>

      <div class="prd-table-wrap">
        <table class="prd-table">
          <thead>
            <tr><th>#</th><th>商品信息</th><th>最终状态</th><th>类目 / 目标售价</th><th class="num">测试场次</th><th class="num">成交金额（{{ currency }}）</th><th class="num">转化率</th><th>结论</th><th class="center">推荐动作</th></tr>
          </thead>
          <tbody>
            <tr v-if="!rows.length"><td colspan="9" class="prd-empty-cell">暂无「{{ conclusionMeta(tab)?.tier }}」，可在「直播测试」中调整测试结论</td></tr>
            <tr v-for="({ record, result, edit }, index) in rows" :key="record.id">
              <td class="muted">{{ index + 1 }}</td>
              <td>
                <div class="prd-product">
                  <PrThumb :result="result" />
                  <div class="prd-product__meta">
                    <span class="prd-product__name" :title="result?.title">{{ result?.title || '商品已删除' }}</span>
                    <span class="prd-product__sub">款号：{{ edit?.code || '未填' }}<template v-if="edit?.sellingPoint"> | {{ edit.sellingPoint }}</template></span>
                  </div>
                </div>
              </td>
              <td><span class="prd-pill" :class="`prd-pill--solid-${tone(record.conclusion)}`">{{ conclusionMeta(record.conclusion)?.tier }}</span></td>
              <td class="nowrap"><span>{{ edit?.category || '-' }}</span><br /><small class="muted">{{ edit?.targetPrice ? `${edit.targetPrice} ${currency}` : '未设置售价' }}</small></td>
              <td class="num">{{ record.sessions }}</td>
              <td class="num nowrap">{{ formatNumber(record.revenue) }}</td>
              <td class="num prd-num-green">{{ formatPercent(ratio(record.orders, record.clicks)) }}</td>
              <td><span class="sw-advice">{{ adviceFor(record.conclusion as Conclusion, ratio(record.orders, record.clicks)) }}</span></td>
              <td class="center nowrap">
                <template v-if="record.conclusion === 'excellent' || record.conclusion === 'potential'">
                  <span v-if="inLibrary(result)" class="prd-pill prd-pill--green"><Check :size="11" />已在商品库</span>
                  <button v-else class="prd-btn prd-btn--xs prd-btn--soft" :disabled="adding.includes(record.resultId) || !result" @click="addToLibrary([record.resultId])">
                    <Loader2 v-if="adding.includes(record.resultId)" :size="11" class="prd-spin" /><PackagePlus v-else :size="11" />加入商品库
                  </button>
                </template>
                <button v-else class="prd-btn prd-btn--xs prd-btn--outline" @click="ws.goStep(4)"><Pencil :size="11" />调整结论</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <footer class="prd-footer">
      <div class="prd-footer__left">
        共测试 <b>{{ liveTestRecords.length }}</b> 个商品，爆款 <b>{{ tiers.excellent.length }}</b> 个，潜力 <b>{{ tiers.potential.length }}</b> 个
        <span v-if="scheme?.status === 'completed'" class="prd-pill prd-pill--blue"><Check :size="11" />方案已完成</span>
      </div>
      <div class="prd-footer__right">
        <button class="prd-btn prd-btn--outline prd-btn--lg" @click="ws.goStep(4)"><ArrowLeft :size="16" />上一步：直播测试</button>
        <button class="prd-btn prd-btn--primary prd-btn--lg" @click="router.push({ name: 'product-research' })">返回方案列表</button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.sw { display: flex; flex-direction: column; gap: 12px; }
.sw-main { display: flex; flex-direction: column; gap: 14px; }
.sw-tiers { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.sw-tier { --tone: var(--theme-accent); display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); color: var(--theme-text); cursor: pointer; text-align: left; font-family: inherit; transition: all .15s; }
.sw-tier--amber { --tone: #fbbf24; } .sw-tier--blue { --tone: #60a5fa; } .sw-tier--red { --tone: #f87171; }
.sw-tier:hover { border-color: color-mix(in srgb, var(--tone) 50%, transparent); }
.sw-tier.is-active { border-color: var(--tone); background: color-mix(in srgb, var(--tone) 14%, var(--theme-panel)); }
.sw-tier__icon { width: 36px; height: 36px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; background: color-mix(in srgb, var(--tone) 18%, transparent); color: var(--tone); flex-shrink: 0; }
.sw-tier__text { display: flex; flex-direction: column; gap: 2px; }
.sw-tier__text b { font-size: 14px; }
.sw-tier__text small { font-size: 11px; color: var(--theme-text-muted); }
.sw-advice { font-size: 12px; color: var(--theme-text-secondary); }
.sw-main td small { font-size: 11px; }
.muted { color: var(--theme-text-muted); }
@media (max-width: 1100px) { .sw-tiers { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
