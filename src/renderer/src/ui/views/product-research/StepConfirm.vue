<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowDown, ArrowLeft, ArrowRight, Box, Check, CheckCircle2, Circle, Hash, Info, Layers, PenLine, Plus, Tag, Trash2 } from 'lucide-vue-next'
import { useSchemeWorkspace } from './useSchemeWorkspace'
import { isValidProductCode, normalizeProductCode, nextCodes, splitCode, type ProductCodeOverview } from '../../../../../shared/productCode'
import PrPager from './PrPager.vue'
import PrSource from './PrSource.vue'
import PrThumb from './PrThumb.vue'
import PrPromptDialog from './PrPromptDialog.vue'
import PrConfirmDialog from './PrConfirmDialog.vue'
import { CATEGORY_PRESETS, formatNumber, formatPrice, marketOf } from './productResearchUtils'

const ws = useSchemeWorkspace()
const { scheme, candidateRows, keptCount, productEdits } = ws

const checked = ref<string[]>([])
const filter = ref<'all' | 'kept' | 'pending'>('all')
const salesDesc = ref(true)
const page = ref(1)
const pageSize = ref(20)
const prompt = ref<null | 'category' | 'price' | 'selling' | 'customCategory' | 'code'>(null)
const confirmRemove = ref<string[] | null>(null)

const currency = computed(() => marketOf(scheme.value?.market).currency || '本币')
const editMap = computed(() => new Map(productEdits.value.map((item) => [item.resultId, item])))
const edit = (id: string) => editMap.value.get(id) || ws.editFor(id)

// ===== 款号 =====
const codeOverview = ref<ProductCodeOverview | null>(null)
onMounted(async () => { codeOverview.value = await window.api.productCodes?.overview().catch(() => null) ?? null })
const codeCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const row of candidateRows.value) {
    const code = edit(row.id).code
    if (code) counts.set(code, (counts.get(code) || 0) + 1)
  }
  return counts
})
/** 方案一打开时就存在的款号来自别的商品；本方案自己填的不算占用 */
const initialOwn = ref(new Set<string>())
watch(codeOverview, () => { initialOwn.value = new Set(productEdits.value.map((item) => item.code || '').filter(Boolean)) })
function codeProblem(id: string) {
  const code = edit(id).code
  if (!code) return ''
  if (!isValidProductCode(code)) return '款号要同时有字母和数字'
  if ((codeCounts.value.get(code) || 0) > 1) return '和本方案的其他商品重复'
  if (codeOverview.value?.used.includes(code) && !initialOwn.value.has(code)) return '已有这个款号，会关联到现有的款'
  return ''
}
function setCode(id: string, value: string) {
  ws.setEdits([id], { code: normalizeProductCode(value) })
}
async function autoNumber(value: string) {
  const start = normalizeProductCode(value)
  if (!splitCode(start)) { ws.notify('起始款号要像 A-281 这样，字母加数字', 'error'); return }
  const ids = rows.value.filter((item) => checked.value.includes(item.id) && !edit(item.id).code).map((item) => item.id)
  if (!ids.length) { ws.notify('勾选的商品都已有款号'); return }
  const reserved = productEdits.value.map((item) => item.code || '').filter(Boolean)
  const codes = window.api.productCodes
    ? await window.api.productCodes.next({ start, count: ids.length, reserved })
    : nextCodes(start, ids.length, reserved)
  ids.forEach((id, index) => ws.setEdits([id], { code: codes[index] }))
  ws.notify(`已编号 ${codes[0]}${codes.length > 1 ? ` ~ ${codes[codes.length - 1]}` : ''}`, 'success')
}
const prefixHint = computed(() => (codeOverview.value?.prefixes || []).filter((item) => item.prefix.endsWith('-')).slice(0, 8).map((item) => `${item.prefix}${item.last}`).join('、'))
const startCode = computed(() => {
  const own = productEdits.value.map((item) => splitCode(item.code)).filter((item): item is NonNullable<typeof item> => Boolean(item))
  const prefix = own[own.length - 1]?.prefix || codeOverview.value?.prefixes[0]?.prefix || 'A-'
  const last = codeOverview.value?.prefixes.find((item) => item.prefix === prefix)?.last || 0
  return `${prefix}${Math.max(last, ...own.filter((item) => item.prefix === prefix).map((item) => item.number)) + 1}`
})

const categories = computed(() => {
  const list = CATEGORY_PRESETS.map((item) => ({ ...item }))
  const known = new Set(list.map((item) => item.value))
  for (const item of productEdits.value) {
    if (item.category && !known.has(item.category)) { known.add(item.category); list.push({ value: item.category, icon: '🏷' }) }
  }
  if (scheme.value?.category && !known.has(scheme.value.category)) list.push({ value: scheme.value.category, icon: '🏷' })
  return list
})

const rows = computed(() => {
  const list = candidateRows.value.filter((item) => {
    if (filter.value === 'kept') return edit(item.id).kept
    if (filter.value === 'pending') return !edit(item.id).kept
    return true
  })
  return list.sort((a, b) => ((b.salesValue || 0) - (a.salesValue || 0)) * (salesDesc.value ? 1 : -1))
})
const paged = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const pageAllChecked = computed(() => paged.value.length > 0 && paged.value.every((item) => checked.value.includes(item.id)))
const targets = computed(() => (checked.value.length ? checked.value : []))

watch(candidateRows, (list) => {
  const ids = new Set(list.map((item) => item.id))
  checked.value = checked.value.filter((id) => ids.has(id))
})
watch(filter, () => { page.value = 1 })

function togglePage() {
  const ids = paged.value.map((item) => item.id)
  checked.value = pageAllChecked.value ? checked.value.filter((id) => !ids.includes(id)) : [...new Set([...checked.value, ...ids])]
}

function requireChecked() {
  if (checked.value.length) return true
  ws.notify('请先勾选商品')
  return false
}

function openPrompt(kind: 'category' | 'price' | 'selling' | 'code') {
  if (requireChecked()) prompt.value = kind
}

function applyPrompt(value: string) {
  if (prompt.value === 'category') ws.setEdits(targets.value, { category: value })
  if (prompt.value === 'price') ws.setEdits(targets.value, { targetPrice: value })
  if (prompt.value === 'selling') ws.setEdits(targets.value, { sellingPoint: value })
  if (prompt.value === 'code') {
    prompt.value = null
    autoNumber(value).catch((error) => ws.notify(`编号失败：${error instanceof Error ? error.message : String(error)}`, 'error'))
    return
  }
  if (prompt.value === 'customCategory') {
    void pickCategory(value)
    prompt.value = null
    return
  }
  ws.notify(`已更新 ${targets.value.length} 个商品`, 'success')
  prompt.value = null
}

function batchKeep(kept: boolean) {
  if (!requireChecked()) return
  ws.setEdits(checked.value, { kept })
  ws.notify(`${kept ? '已保留' : '已取消保留'} ${checked.value.length} 个商品`, 'success')
}

function doRemove() {
  if (!confirmRemove.value) return
  ws.removeCandidates(confirmRemove.value)
  ws.notify(`已移出候选 ${confirmRemove.value.length} 个商品`)
  checked.value = checked.value.filter((id) => !confirmRemove.value!.includes(id))
  confirmRemove.value = null
}

/** 类目参考：设置为方案默认类目；若有勾选商品，同时应用到勾选商品。 */
async function pickCategory(value: string) {
  await ws.updateScheme({ category: value })
  const blank = candidateRows.value.filter((item) => !edit(item.id).category).map((item) => item.id)
  const apply = checked.value.length ? checked.value : blank
  if (apply.length) ws.setEdits(apply, { category: value })
  ws.notify(checked.value.length ? `已为 ${apply.length} 个勾选商品设置类目` : `已设为默认类目${blank.length ? `，并填充 ${blank.length} 个未设置类目的商品` : ''}`, 'success')
}

function matchClass(score: number) {
  return score >= 95 ? 'prd-match--high' : score >= 85 ? 'prd-match--mid' : 'prd-match--low'
}

const keptReady = computed(() => keptCount.value > 0)
const missingInfo = computed(() => candidateRows.value.filter((item) => edit(item.id).kept && (!edit(item.id).category || !edit(item.id).targetPrice)).length)
const promptConfig = computed(() => {
  switch (prompt.value) {
    case 'category': return { title: '批量设置类目', label: `为 ${checked.value.length} 个商品设置类目`, kind: 'select' as const, options: categories.value.map((item) => ({ value: item.value, label: item.value })) }
    case 'price': return { title: '批量设置目标售价', label: `目标售价（${currency.value}）`, kind: 'input' as const, placeholder: '例如 89000' }
    case 'selling': return { title: '批量设置卖点', label: '商品卖点', kind: 'textarea' as const, placeholder: '例如：花朵设计、闪亮锆石、韩式简约' }
    case 'code': return { title: '自动编号', label: `从哪个款号开始（给勾选里没款号的依次编，用过的号自动跳过）`, kind: 'input' as const, placeholder: '例如 A-281' }
    case 'customCategory': return { title: '自定义类目', label: '类目名称', kind: 'input' as const, placeholder: '例如：发饰 (Phụ kiện tóc)' }
    default: return { title: '', label: '', kind: 'input' as const }
  }
})
</script>

<template>
  <div class="scf">
    <div class="scf-layout">
      <section class="prd-card scf-main">
        <div class="prd-section-head">
          <h2><Box :size="22" />确定商品</h2>
          <p>查看候选商品并完善商品信息，确定最终保留的选品。</p>
          <div class="prd-section-head__right scf-counts">候选商品：<b>{{ candidateRows.length }}</b> 条<span>已保留：<b>{{ keptCount }}</b> 条</span></div>
        </div>

        <div class="scf-toolbar">
          <label class="scf-checked"><input type="checkbox" :checked="pageAllChecked" @change="togglePage" />已选 <b>{{ checked.length }}</b> 项</label>
          <button class="prd-btn prd-btn--sm" @click="openPrompt('code')"><Hash :size="13" />自动编号</button>
          <button class="prd-btn prd-btn--sm" @click="openPrompt('category')"><Layers :size="13" />设类目</button>
          <button class="prd-btn prd-btn--sm" @click="openPrompt('price')"><Tag :size="13" />设售价</button>
          <button class="prd-btn prd-btn--sm" @click="openPrompt('selling')"><PenLine :size="13" />设卖点</button>
          <div class="prd-seg scf-filter">
            <button class="prd-seg__btn" :class="{ 'is-active': filter === 'all' }" @click="filter = 'all'">全部</button>
            <button class="prd-seg__btn" :class="{ 'is-active': filter === 'kept' }" @click="filter = 'kept'">已保留</button>
            <button class="prd-seg__btn" :class="{ 'is-active': filter === 'pending' }" @click="filter = 'pending'">未保留</button>
          </div>
          <button class="prd-btn prd-btn--sm prd-btn--success" @click="batchKeep(true)"><Check :size="13" />批量保留</button>
          <button class="prd-btn prd-btn--sm prd-btn--danger" @click="requireChecked() && (confirmRemove = [...checked])"><Trash2 :size="13" />批量移除</button>
        </div>

        <div v-if="candidateRows.length" class="prd-table-wrap">
          <table class="prd-table">
            <thead>
              <tr>
                <th class="chk"><input type="checkbox" :checked="pageAllChecked" aria-label="全选本页" @change="togglePage" /></th>
                <th>#</th><th>商品图片</th><th>商品名称</th>
                <th class="num">采集价</th>
                <th class="num"><span class="prd-th-sort is-active" @click="salesDesc = !salesDesc">销量<ArrowDown :size="11" :style="{ transform: salesDesc ? '' : 'rotate(180deg)' }" /></span></th>
                <th>类目</th><th>售价（{{ currency }}）</th><th>商品卖点</th><th class="center">匹配度</th><th class="center">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!paged.length"><td colspan="11" class="prd-empty-cell">当前筛选下没有商品</td></tr>
              <tr v-for="(item, index) in paged" :key="item.id" :class="{ 'is-selected': checked.includes(item.id) }">
                <td class="chk"><input v-model="checked" type="checkbox" :value="item.id" /></td>
                <td class="muted">{{ (page - 1) * pageSize + index + 1 }}</td>
                <td><PrThumb :result="item" /></td>
                <td>
                  <div class="prd-product__meta">
                    <span class="prd-product__name scf-name" :title="item.title">{{ item.title }}</span>
                    <span class="prd-product__chips"><PrSource :item="item" class="scf-source" /><input class="prd-input prd-input--sm scf-code" :class="{ 'is-warn': codeProblem(item.id) }" :value="edit(item.id).code || ''" maxlength="80" placeholder="款号" aria-label="款号" :title="codeProblem(item.id) || `来源搜索词：${item.keyword}`" @change="setCode(item.id, ($event.target as HTMLInputElement).value)" /></span>
                    <small v-if="codeProblem(item.id)" class="scf-code-tip">{{ codeProblem(item.id) }}</small>
                  </div>
                </td>
                <td class="num">{{ formatPrice(item) }}</td>
                <td class="num prd-num-green">{{ item.salesValue !== undefined ? formatNumber(item.salesValue) : item.salesText || '-' }}</td>
                <td>
                  <select class="prd-select prd-select--sm scf-cat" :value="edit(item.id).category" @change="ws.setEdits([item.id], { category: ($event.target as HTMLSelectElement).value })">
                    <option value="">请选择</option>
                    <option v-for="cat in categories" :key="cat.value" :value="cat.value">{{ cat.value }}</option>
                  </select>
                </td>
                <td><input class="prd-input prd-input--sm scf-price" :value="edit(item.id).targetPrice" placeholder="目标售价" inputmode="numeric" @change="ws.setEdits([item.id], { targetPrice: ($event.target as HTMLInputElement).value.trim() })" /></td>
                <td><textarea class="prd-textarea scf-selling" rows="2" :value="edit(item.id).sellingPoint" placeholder="商品卖点" @change="ws.setEdits([item.id], { sellingPoint: ($event.target as HTMLTextAreaElement).value.trim() })" /></td>
                <td class="center"><span class="prd-match" :class="matchClass(item.match)">{{ item.match }}%</span></td>
                <td class="center nowrap">
                  <button class="prd-btn prd-btn--xs" :class="edit(item.id).kept ? 'prd-btn--success' : 'prd-btn--outline'" @click="ws.setEdits([item.id], { kept: !edit(item.id).kept })">
                    <Check v-if="edit(item.id).kept" :size="12" />{{ edit(item.id).kept ? '已保留' : '保留' }}
                  </button>
                  <button class="prd-icon-btn prd-icon-btn--danger" title="移出候选" @click="confirmRemove = [item.id]"><Trash2 :size="14" /></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <PrPager v-if="candidateRows.length" v-model:page="page" v-model:page-size="pageSize" :total="rows.length" :page-sizes="[10, 20, 50]" />

        <div v-if="!candidateRows.length" class="prd-empty scf-empty">
          <div class="prd-empty__icon"><Box :size="26" /></div>
          <h3>暂无候选商品</h3>
          <p>请先完成「分析商品」阶段，或返回上一步调整筛选条件。</p>
          <button class="prd-btn prd-btn--sm" @click="ws.goStep(2)"><ArrowLeft :size="13" />去分析商品</button>
        </div>
      </section>

      <aside class="scf-side">
        <section class="prd-card">
          <div class="prd-card__head"><div class="prd-card__title"><Tag :size="16" />类目参考（TikTok Shop {{ marketOf(scheme?.market).label }}）</div></div>
          <div class="scf-cats">
            <button v-for="cat in categories" :key="cat.value" class="scf-cat-item" :class="{ 'is-active': scheme?.category === cat.value }" :title="checked.length ? '应用到勾选商品' : '设为默认类目'" @click="pickCategory(cat.value)">
              <span class="scf-cat-item__icon">{{ cat.icon }}</span>
              <span class="scf-cat-item__name">{{ cat.value }}</span>
              <CheckCircle2 v-if="scheme?.category === cat.value" :size="16" class="scf-cat-item__on" /><Circle v-else :size="16" class="scf-cat-item__off" />
            </button>
            <button class="scf-cat-item scf-cat-item--add" @click="prompt = 'customCategory'"><Plus :size="14" />自定义类目</button>
          </div>
          <p class="scf-cat-tip">点击类目：未勾选商品时设为方案默认类目并填充空白项；勾选商品时直接应用到勾选商品。</p>
        </section>
        <section class="prd-card">
          <div class="prd-card__head"><div class="prd-card__title"><Info :size="16" />匹配度提示</div></div>
          <div class="scf-hints">
            <div><span class="prd-match prd-match--high">≥ 95%</span>高度匹配，建议保留</div>
            <div><span class="prd-match prd-match--mid">85% – 94%</span>基本匹配，可结合卖点判断</div>
            <div><span class="prd-match prd-match--low">&lt; 85%</span>匹配度较低，建议移除</div>
          </div>
          <p class="scf-cat-tip">匹配度根据商品标题与客户需求、搜索词的重合度以及销量综合估算。</p>
        </section>
      </aside>
    </div>

    <footer class="prd-footer">
      <div class="prd-footer__left">已选 <b>{{ checked.length }}</b> 项 <span class="muted">|</span> 共 <b>{{ candidateRows.length }}</b> 条（已保留 <b>{{ keptCount }}</b> 条）
        <span v-if="missingInfo" class="scf-warn">{{ missingInfo }} 个保留商品未填写类目或目标售价</span>
      </div>
      <div class="prd-footer__right">
        <span v-if="!keptReady" class="prd-footer__hint">请至少保留 1 个商品</span>
        <button class="prd-btn prd-btn--outline prd-btn--lg" @click="ws.goStep(2)"><ArrowLeft :size="16" />上一步：分析商品</button>
        <button class="prd-btn prd-btn--primary prd-btn--lg" :disabled="!keptReady" @click="ws.goStep(4)">保存并下一步：直播测试<ArrowRight :size="16" /></button>
      </div>
    </footer>

    <PrPromptDialog
      :open="Boolean(prompt)"
      :title="promptConfig.title"
      :label="promptConfig.label"
      :kind="promptConfig.kind"
      :options="'options' in promptConfig ? promptConfig.options : []"
      :placeholder="'placeholder' in promptConfig ? promptConfig.placeholder : ''"
      :initial-value="prompt === 'category' ? scheme?.category || '' : prompt === 'code' ? startCode : ''"
      :description="prompt === 'code' && prefixHint ? `目前用到：${prefixHint}` : undefined"
      @close="prompt = null"
      @confirm="applyPrompt"
    />
    <PrConfirmDialog :open="Boolean(confirmRemove)" title="移出候选" :message="`确定将 ${confirmRemove?.length || 0} 个商品移出候选吗？采集结果仍会保留，可在「分析商品」重新加入。`" confirm-text="移出" @close="confirmRemove = null" @confirm="doRemove" />
  </div>
</template>

<style scoped>
.scf-code { width: 92px; text-transform: uppercase; }
.scf-code::placeholder { text-transform: none; }
.scf-code.is-warn { border-color: var(--theme-tone-amber); }
.scf-code-tip { font-size: 11px; color: var(--theme-tone-amber); }
.scf-main .prd-table th:last-child, .scf-main .prd-table td:last-child { position: sticky; right: 0; background: var(--theme-panel); }
.scf-main .prd-table th:last-child { z-index: 2; }
.scf-main .prd-table th, .scf-main .prd-table td { padding-left: 7px; padding-right: 7px; }
.scf-source { font-size: 12px; color: var(--theme-text-secondary); }
.scf { display: flex; flex-direction: column; gap: 12px; }
.scf-layout { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 12px; align-items: start; }
.scf-main { display: flex; flex-direction: column; gap: 12px; }
.scf-counts { font-size: 13px; color: var(--theme-text-secondary); gap: 14px; }
.scf-counts b { color: var(--theme-accent); }
.scf-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.scf-checked { display: inline-flex; align-items: center; gap: 7px; margin-right: 6px; font-size: 13px; cursor: pointer; }
.scf-checked b { color: var(--theme-accent); }
.scf-filter { margin-left: auto; }
.scf-filter .prd-seg__btn { height: 28px; font-size: 12px; padding: 0 10px; }
.scf-name { display: -webkit-box; min-width: 124px; max-width: 220px; }
.scf-cat { width: 104px; }
.scf-price { width: 80px; text-align: right; }
.scf-selling { width: 100px; min-height: 34px; padding: 5px 8px; font-size: 12px; line-height: 1.4; resize: vertical; }
.scf-empty { border: 1px dashed var(--theme-border-control); border-radius: 10px; }
.scf-side { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 0; }
.scf-cats { display: flex; flex-direction: column; gap: 6px; }
.scf-cat-item { display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--theme-border); background: transparent; color: var(--theme-text); font-size: 12px; cursor: pointer; text-align: left; font-family: inherit; }
.scf-cat-item:hover { border-color: color-mix(in srgb, var(--theme-accent) 45%, transparent); }
.scf-cat-item.is-active { background: color-mix(in srgb, var(--theme-accent) 14%, transparent); border-color: var(--theme-accent); }
.scf-cat-item__icon { width: 18px; text-align: center; }
.scf-cat-item__name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scf-cat-item__on { color: var(--theme-accent); }
.scf-cat-item__off { color: var(--theme-text-muted); }
.scf-cat-item--add { justify-content: center; border-style: dashed; color: var(--theme-text-secondary); }
.scf-cat-tip { margin: 10px 0 0; font-size: 11px; color: var(--theme-text-muted); line-height: 1.5; }
.scf-hints { display: flex; flex-direction: column; gap: 10px; font-size: 12px; color: var(--theme-text-secondary); }
.scf-hints > div { display: flex; align-items: center; gap: 10px; }
.scf-hints .prd-match { min-width: 86px; white-space: nowrap; flex-shrink: 0; }
.scf-warn { font-size: 12px; color: #fbbf24; }
.muted { color: var(--theme-text-muted); }
@media (max-width: 1360px) { .scf-layout { grid-template-columns: 1fr; } .scf-side { position: static; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
