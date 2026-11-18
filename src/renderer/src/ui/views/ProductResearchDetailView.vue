<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Check, ChevronsRight, Loader2, Pencil, RefreshCw, Save } from 'lucide-vue-next'
import { provideSchemeWorkspace } from './product-research/useSchemeWorkspace'
import StepCollect from './product-research/StepCollect.vue'
import StepAnalyze from './product-research/StepAnalyze.vue'
import StepConfirm from './product-research/StepConfirm.vue'
import StepLiveTest from './product-research/StepLiveTest.vue'
import StepWinners from './product-research/StepWinners.vue'
import PrSchemeFormDialog from './product-research/PrSchemeFormDialog.vue'
import PrToast from './product-research/PrToast.vue'
import { SOP_STEPS, formatDate, marketOf, schemeStatusLabel, type SchemeFormValue } from './product-research/productResearchUtils'
import './product-research/product-research.css'

const route = useRoute()
const router = useRouter()
const schemeId = computed(() => String(route.params.schemeId || ''))
const ws = provideSchemeWorkspace(schemeId)
const { scheme, loading, loadError, saving, dirty, lastSavedAt, currentStep, toast } = ws

const editOpen = ref(false)
const editBusy = ref(false)

const statusTone = computed(() => {
  const status = scheme.value?.status
  return status === 'active' ? 'green' : status === 'pending' ? 'amber' : status === 'completed' ? 'blue' : ''
})
const market = computed(() => marketOf(scheme.value?.market))
const saveHint = computed(() => {
  if (saving.value) return '保存中…'
  if (dirty.value) return '有未保存的修改'
  return lastSavedAt.value ? `已自动保存 ${formatDate(lastSavedAt.value).slice(11)}` : ''
})
const stepComponent = computed(() => [StepCollect, StepAnalyze, StepConfirm, StepLiveTest, StepWinners][currentStep.value - 1])

function stepState(index: number) {
  const step = index + 1
  if (step === currentStep.value) return 'active'
  return step < currentStep.value ? 'done' : 'todo'
}

async function submitEdit(value: SchemeFormValue) {
  editBusy.value = true
  const next = await ws.updateScheme({ name: value.name, need: value.need, market: value.market, note: value.note })
  editBusy.value = false
  if (next) {
    editOpen.value = false
    ws.notify('方案信息已更新', 'success')
  }
}

function back() {
  router.push({ name: 'product-research' })
}

watch(schemeId, (id, previous) => {
  if (id && id !== previous) void ws.load()
})

onMounted(async () => {
  await ws.load()
  ws.startPolling()
})
</script>

<template>
  <div class="vg-scope prd-page prd-detail">
    <div v-if="loading" class="prd-empty prd-detail__state"><Loader2 :size="26" class="prd-spin" /><p>正在加载方案…</p></div>
    <div v-else-if="loadError || !scheme" class="prd-empty prd-detail__state">
      <h3>无法打开方案</h3>
      <p>{{ loadError || '方案不存在' }}</p>
      <div class="prd-card__actions">
        <button class="prd-btn prd-btn--sm" @click="ws.load()"><RefreshCw :size="13" />重新加载</button>
        <button class="prd-btn prd-btn--sm prd-btn--primary" @click="back"><ArrowLeft :size="13" />返回方案列表</button>
      </div>
    </div>

    <template v-else>
      <header class="prd-detail__head">
        <button class="prd-btn prd-btn--outline" @click="back"><ArrowLeft :size="15" />返回方案列表</button>
        <div class="prd-detail__title">
          <div class="prd-detail__title-row">
            <h1>方案详情：{{ scheme.name }}</h1>
            <span class="prd-pill prd-pill--dot" :class="statusTone && `prd-pill--${statusTone}`">{{ schemeStatusLabel(scheme.status) }}</span>
          </div>
          <p>
            <span class="prd-detail__need" :title="scheme.need">客户需求：{{ scheme.need || '-' }}</span>
            <span class="prd-detail__sep">|</span>
            <span class="nowrap">目标市场：{{ market.flag }} {{ market.label }}（TikTok Shop）</span>
            <span class="prd-detail__sep">|</span>
            <span class="nowrap">创建时间：{{ formatDate(scheme.createdAt) }}</span>
          </p>
        </div>
        <div class="prd-detail__actions">
          <span class="prd-detail__saved" :class="{ 'is-dirty': dirty }">{{ saveHint }}</span>
          <button class="prd-btn prd-btn--outline" @click="editOpen = true"><Pencil :size="14" />编辑方案</button>
          <button class="prd-btn prd-btn--primary" :disabled="saving" @click="ws.save()"><Save :size="14" />{{ saving ? '保存中…' : '保存草稿' }}</button>
        </div>
      </header>

      <nav class="prd-stepper" aria-label="选品 SOP 步骤">
        <template v-for="(step, index) in SOP_STEPS" :key="step.name">
          <button class="prd-stepper__item" :class="`is-${stepState(index)}`" :aria-current="stepState(index) === 'active' ? 'step' : undefined" @click="ws.goStep(index + 1)">
            <span class="prd-stepper__num"><Check v-if="stepState(index) === 'done'" :size="15" :stroke-width="3" /><template v-else>{{ index + 1 }}</template></span>
            <span class="prd-stepper__text"><b>{{ step.name }}</b><small>{{ step.hint }}</small></span>
          </button>
          <ChevronsRight v-if="index < SOP_STEPS.length - 1" class="prd-stepper__arrow" :size="16" />
        </template>
      </nav>

      <KeepAlive>
        <component :is="stepComponent" :key="currentStep" />
      </KeepAlive>
    </template>

    <PrSchemeFormDialog
      :open="editOpen"
      mode="edit"
      :initial="scheme ? { name: scheme.name, need: scheme.need, market: scheme.market, note: scheme.note || '' } : null"
      :busy="editBusy"
      @close="editOpen = false"
      @submit="submitEdit"
    />
    <PrToast :toast="toast" />
  </div>
</template>

<style scoped>
.prd-detail__state { min-height: 320px; }
.prd-detail__head { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.prd-detail__title { flex: 1; min-width: 280px; display: flex; flex-direction: column; gap: 4px; }
.prd-detail__title-row { display: flex; align-items: center; gap: 10px; }
.prd-detail__title h1 { margin: 0; font-size: 20px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prd-detail__title p { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--theme-text-secondary); min-width: 0; }
.prd-detail__need { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; max-width: 520px; }
.prd-detail__sep { color: var(--theme-divider); }
.prd-detail__actions { display: inline-flex; align-items: center; gap: 8px; }
.prd-detail__saved { font-size: 11px; color: var(--theme-text-muted); }
.prd-detail__saved.is-dirty { color: #fbbf24; }
.nowrap { white-space: nowrap; }

.prd-stepper { display: flex; align-items: center; gap: 4px; }
.prd-stepper__item { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 10px; height: 52px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--theme-border); background: var(--theme-panel); color: var(--theme-text-secondary); cursor: pointer; font-family: inherit; text-align: left; transition: all .15s; clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%); padding-left: 20px; }
.prd-stepper__item:first-of-type { clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%); padding-left: 12px; }
.prd-stepper__item:hover { color: var(--theme-text); background: var(--theme-panel-soft); }
.prd-stepper__num { width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; background: var(--theme-panel-soft); border: 1px solid var(--theme-border-control); flex-shrink: 0; }
.prd-stepper__text { display: flex; flex-direction: column; min-width: 0; }
.prd-stepper__text b { font-size: 14px; white-space: nowrap; }
.prd-stepper__text small { font-size: 11px; color: var(--theme-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prd-stepper__item.is-done { color: var(--theme-text); background: color-mix(in srgb, var(--theme-accent) 9%, var(--theme-panel)); }
.prd-stepper__item.is-done .prd-stepper__num { background: color-mix(in srgb, var(--theme-accent) 22%, transparent); border-color: var(--theme-accent); color: var(--theme-accent); }
.prd-stepper__item.is-active { color: var(--theme-text); background: color-mix(in srgb, var(--theme-accent) 26%, var(--theme-panel)); border-color: var(--theme-accent); }
.prd-stepper__item.is-active .prd-stepper__num { background: var(--theme-accent); border-color: var(--theme-accent); color: var(--theme-on-accent, #04120d); }
.prd-stepper__item.is-active small { color: var(--theme-text-secondary); }
.prd-stepper__arrow { color: var(--theme-accent); flex-shrink: 0; opacity: .7; }
@media (max-width: 1180px) { .prd-stepper__text small { display: none; } }
</style>
