<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CheckCircle2, Loader2, XCircle } from 'lucide-vue-next'

/**
 * Confirms excluding (REMOVE) or restoring (ADD) videos in their GMV MAX campaigns, then shows what TikTok accepted.
 * The page groups videos by campaign; one push per campaign, so results come back per campaign.
 */
export type GmvCreativePushRow = { key: string; campaignId: string; creativeId: string; title: string; campaignName: string; spend: string }
export type GmvCreativePushResult = { campaignId: string; status: 'pushed' | 'failed'; error?: string }

const props = defineProps<{
  operation: 'REMOVE' | 'ADD'
  rows: GmvCreativePushRow[]
  summary: string
  phase: 'confirm' | 'running' | 'done'
  results: GmvCreativePushResult[]
  error?: string
}>()
const emit = defineEmits<{ confirm: []; close: [] }>()
const { t } = useI18n()

const campaignCount = computed(() => new Set(props.rows.map((row) => row.campaignId)).size)
const resultFor = (campaignId: string) => props.results.find((item) => item.campaignId === campaignId)
const pushed = computed(() => props.rows.filter((row) => resultFor(row.campaignId)?.status === 'pushed').length)
const failed = computed(() => props.rows.filter((row) => resultFor(row.campaignId)?.status === 'failed').length)
const verb = computed(() => (props.operation === 'REMOVE' ? 'exclude' : 'restore'))
</script>

<template>
  <Teleport to="body">
    <div class="gcp vg-scope" role="dialog" aria-modal="true" data-testid="gmv-creative-push-dialog" @keydown.esc="phase !== 'running' && emit('close')">
      <div class="gcp__backdrop" @click="phase !== 'running' && emit('close')"></div>
      <section class="gcp__card">
        <header class="gcp__head">
          <h2 v-if="phase === 'done'">{{ t('gmvMaxCreativesSimple.push.doneTitle') }}</h2>
          <h2 v-else>{{ t(`gmvMaxCreativesSimple.push.${verb}Title`, { count: rows.length }) }}</h2>
          <p v-if="phase === 'done'">{{ t('gmvMaxCreativesSimple.push.doneSummary', { pushed, failed }) }}</p>
          <p v-else>{{ t(`gmvMaxCreativesSimple.push.${verb}HintDialog`) }}</p>
          <p v-if="phase !== 'done'" class="gcp__summary">
            {{ t('gmvMaxCreativesSimple.push.scope', { campaigns: campaignCount }) }}<template v-if="summary"> · {{ summary }}</template>
          </p>
        </header>

        <div class="gcp__rows">
          <div v-for="row in rows" :key="row.key" class="gcp__row" data-testid="gmv-creative-push-row">
            <div class="gcp__name">
              <strong :title="row.title">{{ row.title }}</strong>
              <small :title="row.campaignName">{{ row.campaignName }}</small>
            </div>
            <span class="gcp__spend">{{ row.spend }}</span>
            <span class="gcp__state">
              <Loader2 v-if="phase === 'running' && !resultFor(row.campaignId)" class="is-spin" />
              <CheckCircle2 v-else-if="resultFor(row.campaignId)?.status === 'pushed'" class="is-ok" />
              <XCircle v-else-if="resultFor(row.campaignId)" class="is-fail" />
            </span>
            <p v-if="resultFor(row.campaignId)?.error" class="gcp__error">{{ resultFor(row.campaignId)?.error }}</p>
          </div>
        </div>

        <p v-if="error" class="gcp__blocked" data-testid="gmv-creative-push-error">{{ error }}</p>

        <footer class="gcp__foot">
          <span class="gcp__note">{{ phase === 'done' ? t('gmvMaxCreativesSimple.push.doneNote') : t(`gmvMaxCreativesSimple.push.${verb}Note`) }}</span>
          <template v-if="phase === 'done'">
            <button type="button" class="gcp__primary" data-testid="gmv-creative-push-close" @click="emit('close')">{{ t('gmvMaxCreativesSimple.push.close') }}</button>
          </template>
          <template v-else>
            <button type="button" class="gcp__secondary" :disabled="phase === 'running'" @click="emit('close')">{{ t('gmvMaxCreativesSimple.push.cancel') }}</button>
            <button
              type="button"
              :class="['gcp__primary', { 'is-danger': operation === 'REMOVE' }]"
              data-testid="gmv-creative-push-confirm"
              :disabled="phase === 'running'"
              @click="emit('confirm')"
            >
              <Loader2 v-if="phase === 'running'" class="is-spin" />{{ t(`gmvMaxCreativesSimple.push.${verb}Confirm`) }}
            </button>
          </template>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.gcp { position: fixed; inset: 0; z-index: 10060; display: grid; place-items: center; padding: 24px; }
.gcp__backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, .55); }
.gcp__card {
  position: relative;
  width: min(560px, 100%);
  max-height: min(680px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  background: var(--theme-panel);
  color: var(--theme-text);
  box-shadow: 0 24px 64px rgba(0, 0, 0, .45);
}
.gcp__head { padding: 22px 24px 12px; }
.gcp__head h2 { margin: 0; font-size: 17px; font-weight: 650; }
.gcp__head p { margin: 6px 0 0; color: var(--theme-text-muted); font-size: 13px; line-height: 1.5; }
.gcp__head .gcp__summary { color: var(--theme-text); font-variant-numeric: tabular-nums; }
.gcp__rows { padding: 0 24px; overflow-y: auto; }
.gcp__row { display: grid; grid-template-columns: minmax(0, 1fr) auto 20px; gap: 14px; align-items: center; padding: 10px 0; border-top: 1px solid var(--theme-divider); }
.gcp__name { min-width: 0; display: grid; gap: 2px; }
.gcp__name strong, .gcp__name small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gcp__name strong { font-size: 13.5px; font-weight: 600; }
.gcp__name small { color: var(--theme-text-muted); font-size: 12px; }
.gcp__spend { color: var(--theme-text-muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.gcp__state svg { width: 18px; height: 18px; }
.gcp__error { grid-column: 1 / -1; margin: 0; color: var(--status-critical, #d03b3b); font-size: 12.5px; line-height: 1.45; }
.is-ok { color: var(--status-good, #0ca30c); }
.is-fail { color: var(--status-critical, #d03b3b); }
.is-spin { animation: gcp-spin 1s linear infinite; }
@keyframes gcp-spin { to { transform: rotate(360deg); } }
.gcp__blocked { margin: 12px 24px 0; padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, var(--status-critical, #d03b3b) 14%, transparent); color: var(--theme-text); font-size: 13px; }
.gcp__foot { padding: 16px 24px 20px; display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--theme-divider); margin-top: 8px; }
.gcp__note { flex: 1; color: var(--theme-text-muted); font-size: 12.5px; line-height: 1.45; }
.gcp button { font: inherit; cursor: pointer; }
.gcp__secondary, .gcp__primary {
  height: 34px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.gcp__secondary { border: 1px solid var(--theme-border); background: transparent; color: var(--theme-text); }
.gcp__primary { border: 0; background: var(--theme-accent); color: #fff; }
.gcp__primary.is-danger { background: var(--status-critical, #d03b3b); }
.gcp__primary:disabled, .gcp__secondary:disabled { opacity: .5; cursor: not-allowed; }
.gcp__primary svg { width: 15px; height: 15px; }
</style>
