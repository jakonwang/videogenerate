<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { AlertCircle, Sparkles, Tv, X } from 'lucide-vue-next'
import type { ProductResearchLiveTestRecord } from '../../../../../shared/productResearch'
import type { ProductRow } from './useSchemeWorkspace'
import PrThumb from './PrThumb.vue'
import { CONCLUSIONS, formatPercent, ratio } from './productResearchUtils'

type Draft = Omit<ProductResearchLiveTestRecord, 'id' | 'schemeId' | 'updatedAt'> & { id?: string }

const props = defineProps<{
  open: boolean
  record?: ProductResearchLiveTestRecord | null
  products: ProductRow[]
  records: ProductResearchLiveTestRecord[]
  currency: string
  codes?: Map<string, string>
}>()
const emit = defineEmits<{ close: []; save: [draft: Draft] }>()

const form = reactive({ resultId: '', sessions: 1, views: 0, clicks: 0, orders: 0, revenue: 0, refundPercent: 0, hostFeedback: '', conclusion: '' as ProductResearchLiveTestRecord['conclusion'] })
const editingId = ref('')

watch(() => props.open, (open) => {
  if (!open) return
  const record = props.record
  editingId.value = record?.id || ''
  Object.assign(form, {
    resultId: record?.resultId || '',
    sessions: record?.sessions ?? 1,
    views: record?.views ?? 0,
    clicks: record?.clicks ?? 0,
    orders: record?.orders ?? 0,
    revenue: record?.revenue ?? 0,
    refundPercent: record ? Number((record.refundRate * 100).toFixed(2)) : 0,
    hostFeedback: record?.hostFeedback || '',
    conclusion: record?.conclusion || '',
  })
})

/** Selecting a product that already has a record switches the dialog to edit that record (one record per product). */
watch(() => form.resultId, (resultId) => {
  if (!props.open || !resultId || editingId.value) return
  const existing = props.records.find((item) => item.resultId === resultId)
  if (!existing) return
  editingId.value = existing.id
  Object.assign(form, {
    sessions: existing.sessions, views: existing.views, clicks: existing.clicks, orders: existing.orders, revenue: existing.revenue,
    refundPercent: Number((existing.refundRate * 100).toFixed(2)), hostFeedback: existing.hostFeedback, conclusion: existing.conclusion,
  })
})

const product = computed(() => props.products.find((item) => item.id === form.resultId))
const ctr = computed(() => ratio(form.clicks, form.views))
const cvr = computed(() => ratio(form.orders, form.clicks))
const suggestion = computed<ProductResearchLiveTestRecord['conclusion']>(() => {
  if (!form.views) return ''
  if (form.refundPercent >= 6 || (form.views >= 3000 && cvr.value < 2)) return 'eliminate'
  if (cvr.value >= 5 && ctr.value >= 7 && form.refundPercent < 3) return 'excellent'
  if (cvr.value >= 3.5) return 'potential'
  return 'observe'
})

const errors = computed(() => {
  const list: string[] = []
  if (!form.resultId) list.push('请选择测试商品')
  if ([form.sessions, form.views, form.clicks, form.orders, form.revenue, form.refundPercent].some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) list.push('数值不能为负数')
  if (Number(form.clicks) > Number(form.views)) list.push('点击人数不能大于曝光人数')
  if (Number(form.orders) > Number(form.clicks) && Number(form.clicks) > 0) list.push('成交订单不能大于点击人数')
  if (Number(form.refundPercent) > 100) list.push('退款率不能超过 100%')
  return list
})

function save() {
  if (errors.value.length) return
  emit('save', {
    id: editingId.value || undefined,
    resultId: form.resultId,
    sessions: Math.round(Number(form.sessions) || 0),
    views: Math.round(Number(form.views) || 0),
    clicks: Math.round(Number(form.clicks) || 0),
    orders: Math.round(Number(form.orders) || 0),
    revenue: Number(form.revenue) || 0,
    refundRate: (Number(form.refundPercent) || 0) / 100,
    hostFeedback: form.hostFeedback.trim(),
    conclusion: form.conclusion,
  })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="vg-scope prd-backdrop" @click.self="emit('close')">
      <div class="prd-dialog prd-dialog--wide" role="dialog" aria-modal="true">
        <div class="prd-dialog__head">
          <div class="prd-dialog__title">
            <span class="prd-dialog__title-icon"><Tv :size="20" /></span>
            <div><h2>{{ editingId ? '编辑测试记录' : '新增测试记录' }}</h2><p>录入单品直播测试数据，每个商品维护一条累计记录。</p></div>
          </div>
          <button class="prd-icon-btn" aria-label="关闭" @click="emit('close')"><X :size="16" /></button>
        </div>
        <div class="prd-dialog__body">
          <div class="prd-field">
            <label>测试商品<span class="prd-req">*</span></label>
            <div class="lt-product">
              <PrThumb :result="product" />
              <select v-model="form.resultId" class="prd-select lt-product__select" :disabled="Boolean(record)">
                <option value="">请选择商品（来自已保留商品）</option>
                <option v-for="item in products" :key="item.id" :value="item.id">{{ codes?.get(item.id) ? `${codes.get(item.id)} · ` : '' }}{{ item.title }}{{ records.some((r) => r.resultId === item.id) && item.id !== record?.resultId ? '（已有记录）' : '' }}</option>
              </select>
            </div>
          </div>
          <div class="prd-form-grid prd-form-grid--3">
            <div class="prd-field"><label>测试场次</label><input v-model.number="form.sessions" type="number" min="0" class="prd-input" /></div>
            <div class="prd-field"><label>曝光人数</label><input v-model.number="form.views" type="number" min="0" class="prd-input" /></div>
            <div class="prd-field"><label>点击人数</label><input v-model.number="form.clicks" type="number" min="0" class="prd-input" /></div>
            <div class="prd-field"><label>成交订单</label><input v-model.number="form.orders" type="number" min="0" class="prd-input" /></div>
            <div class="prd-field"><label>成交金额（{{ currency }}）</label><input v-model.number="form.revenue" type="number" min="0" class="prd-input" /></div>
            <div class="prd-field"><label>退款 / 负反馈率（%）</label><input v-model.number="form.refundPercent" type="number" min="0" max="100" step="0.01" class="prd-input" /></div>
          </div>
          <div class="lt-metrics">
            <span>点击率 <b>{{ formatPercent(ctr) }}</b></span>
            <span>转化率 <b>{{ formatPercent(cvr) }}</b></span>
            <span>客单价 <b>{{ form.orders ? Math.round(form.revenue / form.orders).toLocaleString('en-US') : '-' }}</b></span>
          </div>
          <div class="prd-field"><label>主播反馈</label><textarea v-model="form.hostFeedback" rows="2" maxlength="300" class="prd-textarea" placeholder="例如：观众咨询多，佩戴效果好，互动积极…" /></div>
          <div class="prd-field">
            <label>测试结论</label>
            <div class="lt-conclusions">
              <button v-for="item in CONCLUSIONS" :key="item.value" class="lt-conclusion" :class="[`lt-conclusion--${item.value}`, { 'is-active': form.conclusion === item.value }]" @click="form.conclusion = item.value">
                <span>{{ item.icon }}</span>{{ item.label }}
              </button>
              <button class="lt-conclusion" :class="{ 'is-active': !form.conclusion }" @click="form.conclusion = ''">暂不下结论</button>
            </div>
            <button v-if="suggestion && suggestion !== form.conclusion" class="prd-link lt-suggest" @click="form.conclusion = suggestion">
              <Sparkles :size="12" />按数据建议：{{ CONCLUSIONS.find((item) => item.value === suggestion)?.label }}（点击采用）
            </button>
          </div>
          <div v-if="errors.length && form.resultId" class="lt-errors"><AlertCircle :size="14" />{{ errors.join('；') }}</div>
        </div>
        <div class="prd-dialog__foot">
          <span class="prd-dialog__tip">建议规则：转化率 ≥ 5% 且点击率 ≥ 7%、退款率 &lt; 3% 为值得放量。</span>
          <div class="prd-dialog__foot-actions">
            <button class="prd-btn prd-btn--outline" @click="emit('close')">取消</button>
            <button class="prd-btn prd-btn--primary" :disabled="errors.length > 0" @click="save">保存</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.lt-product { display: flex; align-items: center; gap: 10px; }
.lt-product__select { flex: 1; }
.lt-metrics { display: flex; gap: 20px; padding: 10px 12px; border-radius: 8px; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); font-size: 12px; color: var(--theme-text-muted); }
.lt-metrics b { color: var(--theme-accent); font-size: 14px; margin-left: 4px; }
.lt-conclusions { display: flex; gap: 8px; flex-wrap: wrap; }
.lt-conclusion { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--theme-border); background: transparent; color: var(--theme-text-secondary); cursor: pointer; font-size: 12px; font-family: inherit; }
.lt-conclusion.is-active { border-color: var(--theme-accent); color: var(--theme-text); background: color-mix(in srgb, var(--theme-accent) 14%, transparent); }
.lt-conclusion--eliminate.is-active { border-color: #f87171; background: color-mix(in srgb, #f87171 14%, transparent); }
.lt-conclusion--observe.is-active { border-color: #60a5fa; background: color-mix(in srgb, #60a5fa 14%, transparent); }
.lt-conclusion--potential.is-active { border-color: #fbbf24; background: color-mix(in srgb, #fbbf24 14%, transparent); }
.lt-suggest { display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; margin-top: 4px; }
.lt-errors { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #f87171; }
</style>
