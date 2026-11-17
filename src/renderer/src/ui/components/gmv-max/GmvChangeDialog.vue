<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-vue-next'
import type { GmvChangeResult, GmvChangeRow } from './gmvChangeTypes'

/**
 * Confirms budget / target ROI / on-off changes before they are written to TikTok, then shows what happened.
 * Every row lists the old and new value, the size of the change and anything risky about it.
 */

const props = defineProps<{
  rows: GmvChangeRow[]
  phase: 'confirm' | 'running' | 'done'
  results: GmvChangeResult[]
  blockedReason?: string
}>()
const emit = defineEmits<{ confirm: []; close: []; undo: [id: string] }>()
const { t } = useI18n()

const warningCount = computed(() => props.rows.reduce((sum, row) => sum + row.warnings.length, 0))
const resultFor = (campaignId: string) => props.results.find((item) => item.campaignId === campaignId)
const succeeded = computed(() => props.results.filter((item) => item.ok).length)
const failed = computed(() => props.results.filter((item) => !item.ok).length)
const changeText = (value?: number | null) =>
  value == null ? '' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%`
</script>

<template>
  <Teleport to="body">
    <div class="gcd vg-scope" role="dialog" aria-modal="true" data-testid="gmv-change-dialog" @keydown.esc="phase !== 'running' && emit('close')">
      <div class="gcd__backdrop" @click="phase !== 'running' && emit('close')"></div>
      <section class="gcd__card">
        <header class="gcd__head">
          <h2>{{ phase === 'done' ? t('gmvV2.edit.doneTitle') : t('gmvV2.edit.confirmTitle', { count: rows.length }) }}</h2>
          <p v-if="phase === 'done'">{{ t('gmvV2.edit.doneSummary', { ok: succeeded, failed }) }}</p>
          <p v-else>{{ t('gmvV2.edit.confirmHint') }}</p>
        </header>

        <div class="gcd__rows">
          <div v-for="row in rows" :key="`${row.campaignId}-${row.field}`" class="gcd__row" data-testid="gmv-change-row">
            <div class="gcd__main">
              <div class="gcd__name">
                <strong :title="row.campaignName">{{ row.campaignName }}</strong>
                <small>{{ t(`gmvV2.edit.fields.${row.field}`) }}</small>
              </div>
              <div class="gcd__values">
                <span class="gcd__before">{{ row.before }}</span>
                <ArrowRight />
                <strong>{{ row.after }}</strong>
                <em v-if="row.change != null" :class="{ 'is-big': Math.abs(row.change) > 0.3 }">{{ changeText(row.change) }}</em>
              </div>
              <div v-if="phase !== 'confirm'" class="gcd__state">
                <Loader2 v-if="phase === 'running' && !resultFor(row.campaignId)" class="is-spin" />
                <CheckCircle2 v-else-if="resultFor(row.campaignId)?.ok" class="is-ok" />
                <XCircle v-else-if="resultFor(row.campaignId)" class="is-fail" />
              </div>
            </div>
            <ul v-if="row.warnings.length && phase === 'confirm'" class="gcd__warnings">
              <li v-for="warning in row.warnings" :key="warning"><AlertTriangle />{{ warning }}</li>
            </ul>
            <p v-if="resultFor(row.campaignId)?.error" class="gcd__error" data-testid="gmv-change-error">{{ resultFor(row.campaignId)?.error }}</p>
            <button
              v-if="resultFor(row.campaignId)?.undoId"
              type="button"
              class="gcd__undo"
              data-testid="gmv-change-undo"
              @click="emit('undo', resultFor(row.campaignId)!.undoId!)"
            >
              <RotateCcw />{{ t('gmvV2.edit.undo') }}
            </button>
          </div>
        </div>

        <p v-if="blockedReason" class="gcd__blocked">{{ blockedReason }}</p>

        <footer class="gcd__foot">
          <span v-if="phase === 'confirm' && warningCount" class="gcd__note"><AlertTriangle />{{ t('gmvV2.edit.warningCount', { count: warningCount }) }}</span>
          <span v-else class="gcd__note gcd__note--plain">{{ phase === 'confirm' ? t('gmvV2.edit.safety') : '' }}</span>
          <template v-if="phase === 'done'">
            <button type="button" class="gcd__primary" data-testid="gmv-change-close" @click="emit('close')">{{ t('gmvV2.edit.close') }}</button>
          </template>
          <template v-else>
            <button type="button" class="gcd__secondary" :disabled="phase === 'running'" @click="emit('close')">{{ t('gmvV2.edit.cancel') }}</button>
            <button type="button" class="gcd__primary" data-testid="gmv-change-confirm" :disabled="phase === 'running' || !!blockedReason" @click="emit('confirm')">
              <Loader2 v-if="phase === 'running'" class="is-spin" />{{ t('gmvV2.edit.confirm', { count: rows.length }) }}
            </button>
          </template>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.gcd { position: fixed; inset: 0; z-index: 10060; display: grid; place-items: center; padding: 24px; }
.gcd__backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, .55); }
.gcd__card {
  position: relative;
  width: min(620px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  background: var(--theme-panel);
  color: var(--theme-text);
  box-shadow: 0 24px 64px rgba(0, 0, 0, .45);
}
.gcd__head { padding: 22px 24px 14px; }
.gcd__head h2 { margin: 0; font-size: 17px; font-weight: 650; }
.gcd__head p { margin: 6px 0 0; color: var(--theme-text-muted); font-size: 13px; line-height: 1.5; }
.gcd__rows { padding: 0 24px; overflow-y: auto; }
.gcd__row { padding: 14px 0; border-top: 1px solid var(--theme-divider); }
.gcd__main { display: grid; grid-template-columns: minmax(0, 1fr) auto 22px; gap: 16px; align-items: center; }
.gcd__name { min-width: 0; display: grid; gap: 2px; }
.gcd__name strong { overflow: hidden; font-size: 13.5px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.gcd__name small { color: var(--theme-text-muted); font-size: 12px; }
.gcd__values { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.gcd__values svg { width: 14px; height: 14px; color: var(--theme-text-muted); }
.gcd__before { color: var(--theme-text-muted); text-decoration: line-through; }
.gcd__values strong { font-weight: 650; }
.gcd__values em { color: var(--theme-text-muted); font-size: 12px; font-style: normal; }
.gcd__values em.is-big { color: var(--status-warning, #fab219); font-weight: 600; }
.gcd__state svg { width: 18px; height: 18px; }
.is-ok { color: var(--status-good, #0ca30c); }
.is-fail { color: var(--status-critical, #d03b3b); }
.is-spin { animation: gcd-spin 1s linear infinite; }
@keyframes gcd-spin { to { transform: rotate(360deg); } }
.gcd__warnings { margin: 8px 0 0; padding: 0; display: grid; gap: 4px; list-style: none; }
.gcd__warnings li { display: flex; align-items: flex-start; gap: 6px; color: var(--status-warning, #fab219); font-size: 12.5px; line-height: 1.45; }
.gcd__warnings svg, .gcd__note svg { width: 14px; height: 14px; flex-shrink: 0; margin-top: 2px; }
.gcd__error { margin: 8px 0 0; color: var(--status-critical, #d03b3b); font-size: 12.5px; line-height: 1.45; }
.gcd__blocked { margin: 12px 24px 0; padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, var(--status-critical, #d03b3b) 14%, transparent); color: var(--theme-text); font-size: 13px; }
.gcd__foot { padding: 16px 24px 20px; display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--theme-divider); margin-top: 8px; }
.gcd__note { flex: 1; display: inline-flex; align-items: flex-start; gap: 6px; color: var(--status-warning, #fab219); font-size: 12.5px; }
.gcd__note--plain { color: var(--theme-text-muted); }
.gcd button { font: inherit; cursor: pointer; }
.gcd__secondary, .gcd__primary, .gcd__undo {
  height: 34px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
}
.gcd__secondary { border: 1px solid var(--theme-border); background: transparent; color: var(--theme-text); }
.gcd__primary { border: 0; background: var(--theme-accent); color: #fff; }
.gcd__primary:disabled, .gcd__secondary:disabled { opacity: .5; cursor: not-allowed; }
.gcd__primary svg { width: 15px; height: 15px; }
.gcd__undo { height: 28px; margin-top: 8px; padding: 0 10px; border: 1px solid var(--theme-border); background: transparent; color: var(--theme-text-secondary); font-size: 12.5px; }
.gcd__undo svg { width: 13px; height: 13px; }
</style>
