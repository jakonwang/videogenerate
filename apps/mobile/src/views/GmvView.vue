<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Check, Clock, LoaderCircle, Monitor, OctagonPause, X } from 'lucide-vue-next'
import { GMV_DIGEST_ID, type SyncGmvDecision, type SyncGmvDigest } from '@shared/cloud/selling'
import { SYNC_COLLECTIONS } from '@shared/cloud/sync'
import PageHeader from '@/components/PageHeader.vue'
import { relativeTime } from '@/lib/library'
import { getRecord, listRecords, requestSync, saveRecord, syncState } from '@/lib/sync'
import { toast } from '@/lib/toast'

/**
 * GMV Max（手机版）：看电脑端同步过来的投放摘要，批准 / 拒绝 AI 建议。
 * 决定写进云端，由电脑端按原有流程执行（含急停等保护），手机不直接操作 TikTok。
 */
const digest = ref<SyncGmvDigest | null>(null)
const decisions = ref<Record<string, SyncGmvDecision>>({})
const loaded = ref(false)
const busy = ref('')

async function load() {
  digest.value = (await getRecord<SyncGmvDigest>(SYNC_COLLECTIONS.gmvDigest, GMV_DIGEST_ID))?.data ?? null
  const records = await listRecords<SyncGmvDecision>(SYNC_COLLECTIONS.gmvDecisions)
  decisions.value = Object.fromEntries(records.filter((r) => r.data).map((r) => [r.id, r.data as SyncGmvDecision]))
  loaded.value = true
}
watch(() => syncState.version, load, { immediate: true })

const money = (value: number) => (value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }))
const stale = computed(() => (digest.value ? Date.now() - digest.value.generatedAt > 6 * 3600_000 : false))
const RISK = { low: { label: '低风险', tone: 'green' }, medium: { label: '中风险', tone: 'amber' }, high: { label: '高风险', tone: 'red' } } as const

function stateOf(id: string) {
  const decision = decisions.value[id]
  if (!decision) return null
  if (!decision.result) return { label: decision.decision === 'approve' ? '已批准，等电脑执行' : '已拒绝，等电脑同步', tone: 'blue' }
  if (decision.result === 'executed') return { label: '电脑已执行', tone: 'green' }
  if (decision.result === 'rejected') return { label: '已拒绝', tone: 'muted' }
  return { label: decision.error || '执行失败', tone: 'red' }
}

async function decide(id: string, decision: 'approve' | 'reject') {
  if (decision === 'approve' && !window.confirm('批准后，电脑端下次同步（约 1 分钟内）会自动执行这个调整。确定？')) return
  busy.value = id
  try {
    const recommendation = digest.value?.pending.find((item) => item.id === id)
    await saveRecord<SyncGmvDecision>(SYNC_COLLECTIONS.gmvDecisions, id, {
      decision,
      decidedAt: Date.now(),
      campaignName: recommendation?.campaignName,
      summary: recommendation ? `预算 ${recommendation.currentBudget} → ${recommendation.proposedBudget}` : undefined,
    })
    await requestSync()
    toast(decision === 'approve' ? '已批准，电脑端会自动执行' : '已拒绝')
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <PageHeader title="GMV Max" back="/create" />
  <main class="m-page m-page--no-tabs">
    <div v-if="loaded && !digest" class="m-card m-empty">
      <span class="m-empty__icon"><Monitor :size="28" /></span>
      <span class="m-empty__title">还没有投放数据</span>
      <span class="m-empty__text">在电脑端登录同一个账号并连接 GMV Max，数据会自动同步到这里</span>
    </div>

    <template v-else-if="digest">
      <div class="meta">
        <span><Clock :size="13" /> 电脑端 {{ relativeTime(digest.generatedAt) }}更新</span>
        <span v-if="digest.accountName">{{ digest.accountName }}</span>
      </div>
      <p v-if="stale" class="m-notice m-notice--amber"><AlertTriangle :size="16" /> 数据超过 6 小时没更新，请确认电脑端开着软件</p>
      <p v-if="digest.emergencyStopped" class="m-notice m-notice--red"><OctagonPause :size="16" /> 电脑端开启了急停，批准的建议暂不会执行</p>

      <section class="kpis">
        <div class="kpi"><small>近 7 天花费</small><strong>{{ money(digest.totals.spend) }}</strong></div>
        <div class="kpi"><small>GMV</small><strong>{{ money(digest.totals.gmv) }}</strong></div>
        <div class="kpi"><small>ROI</small><strong :class="{ good: digest.totals.roi >= 2, bad: digest.totals.roi > 0 && digest.totals.roi < 1 }">{{ digest.totals.roi.toFixed(2) }}</strong></div>
        <div class="kpi"><small>订单</small><strong>{{ digest.totals.orders }}</strong></div>
      </section>

      <section class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">待处理的 AI 建议</h2><span class="m-muted small">{{ digest.pendingCount }} 条</span></div>
        <div v-if="digest.pending.length" class="recs">
          <div v-for="rec in digest.pending" :key="rec.id" class="rec m-card">
            <div class="rec__head">
              <span class="rec__icon" :class="rec.kind === 'scale_up' ? 'up' : 'down'"><ArrowUpRight v-if="rec.kind === 'scale_up'" :size="18" /><ArrowDownRight v-else :size="18" /></span>
              <strong>{{ rec.campaignName }}</strong>
              <span class="m-badge" :class="`m-badge--${RISK[rec.risk].tone}`">{{ RISK[rec.risk].label }}</span>
            </div>
            <div class="rec__change">
              <span v-if="rec.currentBudget !== rec.proposedBudget">预算 {{ rec.currentBudget }} → <b>{{ rec.proposedBudget }}</b></span>
              <span v-if="rec.currentRoasBid !== rec.proposedRoasBid">ROI 目标 {{ rec.currentRoasBid }} → <b>{{ rec.proposedRoasBid }}</b></span>
              <span v-if="rec.projectedGmvDelta" class="m-muted">预计 GMV {{ rec.projectedGmvDelta }}</span>
            </div>
            <p class="rec__reason">{{ rec.reason }}</p>
            <div v-if="stateOf(rec.id)" class="rec__state" :class="`is-${stateOf(rec.id)!.tone}`">{{ stateOf(rec.id)!.label }}</div>
            <div v-else class="rec__actions">
              <button type="button" class="m-btn m-btn--sm" :disabled="busy === rec.id" @click="decide(rec.id, 'reject')"><X :size="14" /> 拒绝</button>
              <button type="button" class="m-btn m-btn--sm m-btn--primary" :disabled="busy === rec.id" @click="decide(rec.id, 'approve')">
                <LoaderCircle v-if="busy === rec.id" :size="14" class="m-spin" /><Check v-else :size="14" /> 批准
              </button>
            </div>
          </div>
        </div>
        <div v-else class="m-card m-empty"><span class="m-empty__title">没有待处理的建议</span></div>
      </section>

      <section class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">计划（按花费）</h2></div>
        <div class="m-card m-list">
          <div v-for="campaign in digest.campaigns" :key="campaign.id" class="m-row camp">
            <span class="m-row__main">
              <span class="m-row__title">{{ campaign.name }}</span>
              <span class="m-row__sub">花费 {{ money(campaign.spend) }} · GMV {{ money(campaign.gmv) }} · {{ campaign.orders }} 单 · 预算 {{ campaign.budget }}</span>
            </span>
            <span class="camp__roi" :class="{ good: campaign.roi >= 2, bad: campaign.roi > 0 && campaign.roi < 1 }">{{ campaign.roi.toFixed(2) }}</span>
          </div>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.small { font-size: 12px; }
.meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 2px 2px 10px; color: var(--theme-text-muted); font-size: 12px; }
.meta span { display: inline-flex; align-items: center; gap: 4px; }
.m-notice { margin: 0 0 10px; }
.kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.kpi { display: flex; flex-direction: column; gap: 4px; padding: 14px; border: 1px solid var(--theme-border); border-radius: 14px; background: var(--theme-panel); }
.kpi small { color: var(--theme-text-muted); font-size: 12px; }
.kpi strong { font-size: 22px; font-variant-numeric: tabular-nums; }
.good { color: var(--m-green); }
.bad { color: var(--m-red); }
.recs { display: flex; flex-direction: column; gap: 10px; }
.rec { padding: 14px; }
.rec__head { display: flex; align-items: center; gap: 8px; }
.rec__head strong { flex: 1; min-width: 0; overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.rec__icon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; }
.rec__icon.up { background: color-mix(in srgb, var(--m-green) 14%, transparent); color: var(--m-green); }
.rec__icon.down { background: color-mix(in srgb, var(--m-amber) 14%, transparent); color: var(--m-amber); }
.rec__change { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 10px; font-size: 13px; }
.rec__reason { margin: 8px 0 0; color: var(--theme-text-secondary); font-size: 12px; line-height: 1.6; }
.rec__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.rec__state { margin-top: 12px; padding: 8px 10px; border-radius: 10px; font-size: 12px; font-weight: 700; }
.rec__state.is-blue { background: color-mix(in srgb, var(--m-blue) 12%, transparent); color: var(--m-blue); }
.rec__state.is-green { background: color-mix(in srgb, var(--m-green) 12%, transparent); color: var(--m-green); }
.rec__state.is-red { background: var(--theme-danger-soft); color: var(--theme-danger-text); }
.rec__state.is-muted { background: var(--theme-control); color: var(--theme-text-muted); }
.camp__roi { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
</style>
