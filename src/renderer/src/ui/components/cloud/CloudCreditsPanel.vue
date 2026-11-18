<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Coins, Image as ImageIcon, LoaderCircle, Video } from 'lucide-vue-next'
import type { CapabilityUsage, CreditLedgerEntry, CreditsResponse } from '../../../../../shared/cloud/billing'

/** 账号与会员页：点数余额、本月各类生成的计费方式与用量、点数明细 */
const props = defineProps<{ refreshKey: number; membershipActive: boolean }>()

const { t, locale } = useI18n()
const data = ref<CreditsResponse | null>(null)
const ledger = ref<CreditLedgerEntry[]>([])
const page = ref(1)
const loading = ref(false)
const error = ref('')

const hasMore = computed(() => (data.value ? ledger.value.length < data.value.ledger.total : false))

async function load(reset = true) {
  // 电脑端旧版本的预加载里没有 credits（例如还没重启），直接不显示
  if (typeof window.api?.cloud?.credits !== 'function') return
  loading.value = true
  error.value = ''
  try {
    const next = reset ? 1 : page.value + 1
    const result = await window.api.cloud.credits(next)
    if (!result.ok) {
      error.value = result.error
      return
    }
    data.value = result
    page.value = next
    ledger.value = reset ? result.ledger.items : [...ledger.value, ...result.ledger.items]
  } finally {
    loading.value = false
  }
}

watch(() => props.refreshKey, () => void load(), { immediate: true })

function ruleText(usage: CapabilityUsage) {
  const { rule } = usage
  if (rule.mode === 'unlimited') return t('cloud.membership.modeUnlimited')
  if (rule.mode === 'disabled') return t('cloud.membership.modeDisabled')
  if (rule.mode === 'free_then_credits') return t('cloud.membership.modeFree', { free: rule.freePerMonth, used: usage.freeUsed, points: usage.points })
  return t('cloud.membership.modeCredits', { points: usage.points })
}

function formatTime(value: number) {
  return new Date(value).toLocaleString(locale.value)
}
</script>

<template>
  <section class="vg-card cloud-credits" data-testid="cloud-credits">
    <div class="vg-card__head">
      <span class="vg-card__title">
        <Coins :size="16" /> {{ t('cloud.membership.creditsTitle') }}
        <small>{{ t('cloud.membership.creditsDesc') }}</small>
      </span>
      <LoaderCircle v-if="loading" :size="15" class="vg-spin" />
    </div>

    <div v-if="error" class="vg-notice vg-notice--danger"><span>{{ error }}</span></div>

    <template v-if="data">
      <div class="cloud-credits__balance">
        <span class="vg-muted">{{ t('cloud.membership.creditsBalance') }}</span>
        <strong class="vg-num" data-testid="cloud-credits-balance">{{ data.unlimited ? '∞' : data.balance }}</strong>
        <span v-if="data.unlimited" class="vg-pill vg-pill--accent">{{ t('cloud.membership.creditsUnlimited') }}</span>
        <span v-else-if="!membershipActive" class="vg-pill vg-pill--amber">{{ t('cloud.membership.creditsNeedMembership') }}</span>
      </div>

      <div v-if="!data.unlimited" class="vg-list">
        <div v-for="usage in data.usage" :key="usage.capability" class="vg-list__item">
          <span class="vg-list__main">
            <span class="vg-list__title">
              <Video v-if="usage.capability === 'video'" :size="14" />
              <ImageIcon v-else :size="14" />
              {{ usage.capability === 'video' ? t('cloud.membership.capVideo') : t('cloud.membership.capImage') }}
            </span>
            <span class="vg-list__sub">{{ ruleText(usage) }}</span>
          </span>
          <span class="vg-muted cloud-credits__count">{{ t('cloud.membership.usedThisMonth', { count: usage.usedThisMonth }) }}</span>
        </div>
      </div>

      <div class="cloud-credits__ledger-title">{{ t('cloud.membership.ledgerTitle') }}</div>
      <table v-if="ledger.length" class="vg-table">
        <tbody>
          <tr v-for="entry in ledger" :key="entry.id">
            <td>{{ t(`cloud.membership.ledgerKind.${entry.kind}`) }}<span v-if="entry.note" class="vg-secondary cloud-credits__note"> · {{ entry.note }}</span></td>
            <td class="num" :class="entry.delta > 0 ? 'cloud-credits__plus' : ''">{{ entry.delta > 0 ? `+${entry.delta}` : entry.delta }}</td>
            <td class="vg-secondary vg-num">{{ formatTime(entry.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="vg-empty"><p>{{ t('cloud.membership.noLedger') }}</p></div>
      <button v-if="hasMore" type="button" class="vg-btn vg-btn--sm vg-btn--ghost" :disabled="loading" @click="load(false)">{{ t('cloud.membership.ledgerMore') }}</button>
    </template>
  </section>
</template>

<style scoped>
.cloud-credits { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.cloud-credits .vg-card__title { flex-wrap: wrap; white-space: normal; min-width: 0; }
.cloud-credits .vg-list__item { flex-wrap: wrap; }
.cloud-credits .vg-table td { white-space: normal; overflow-wrap: anywhere; }
.cloud-credits__balance { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; }
.cloud-credits__balance strong { font-size: 28px; line-height: 1; }
.cloud-credits__count { font-size: 12px; white-space: nowrap; }
.cloud-credits__ledger-title { font-weight: 600; font-size: 13px; }
.cloud-credits__note { font-size: 12px; }
.cloud-credits__plus { color: var(--theme-success, #16a34a); font-weight: 600; }
</style>
