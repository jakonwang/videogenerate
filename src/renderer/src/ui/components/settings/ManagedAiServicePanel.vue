<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Coins, Image as ImageIcon, LoaderCircle, MessageSquare, Sparkles, Video } from 'lucide-vue-next'
import type { CapabilityUsage, CreditsSummary } from '../../../../../shared/cloud/billing'

/**
 * 商业版托管模式下的「AI 服务」：平台 Key、模型、存储都由后台统一配置（Key 只在服务器），
 * 普通用户不需要也看不到这些设置，这里只说明「不用填 Key」和每种生成怎么计费。
 * 电脑端设置页和网页版设置页共用这个组件。
 */
const emit = defineEmits<{ (e: 'open-billing'): void }>()
const { t } = useI18n()
const summary = ref<CreditsSummary | null>(null)
const loading = ref(false)
const error = ref('')

async function load() {
  if (typeof window.api?.cloud?.credits !== 'function') return
  loading.value = true
  error.value = ''
  try {
    const result = await window.api.cloud.credits(1)
    if (result.ok) summary.value = result
    else error.value = result.error
  } finally {
    loading.value = false
  }
}
onMounted(() => void load())

function ruleText(usage: CapabilityUsage) {
  const { rule } = usage
  if (rule.mode === 'unlimited') return t('cloud.membership.modeUnlimited')
  if (rule.mode === 'disabled') return t('cloud.membership.modeDisabled')
  if (rule.mode === 'free_then_credits') return t('cloud.membership.modeFree', { free: rule.freePerMonth, used: usage.freeUsed, points: usage.points })
  return t('cloud.membership.modeCredits', { points: usage.points })
}
</script>

<template>
  <section class="vg-card ai-service" data-testid="managed-ai-service">
    <div class="vg-card__head">
      <span class="vg-card__title"><Sparkles :size="16" /> {{ t('cloud.settings.aiServiceTitle') }} <small>{{ t('cloud.settings.aiServiceSubtitle') }}</small></span>
      <LoaderCircle v-if="loading" :size="15" class="vg-spin" />
    </div>

    <div class="vg-notice vg-notice--accent"><Sparkles :size="15" /><span>{{ t('cloud.settings.aiServiceNotice') }}</span></div>

    <div v-if="error" class="vg-notice vg-notice--warning"><span>{{ t('cloud.settings.aiServiceLoginFirst') }}</span></div>

    <div class="vg-list">
      <template v-if="summary">
        <div v-if="!summary.unlimited" class="vg-list__item">
          <span class="vg-list__main">
            <span class="vg-list__title ai-service__title"><Coins :size="14" /> {{ t('cloud.membership.creditsBalance') }}</span>
          </span>
          <strong class="vg-num ai-service__balance" data-testid="managed-ai-balance">{{ summary.balance }}</strong>
        </div>
        <div v-for="usage in summary.usage" :key="usage.capability" class="vg-list__item">
          <span class="vg-list__main">
            <span class="vg-list__title ai-service__title">
              <Video v-if="usage.capability === 'video'" :size="14" />
              <ImageIcon v-else :size="14" />
              {{ usage.capability === 'video' ? t('cloud.membership.capVideo') : t('cloud.membership.capImage') }}
            </span>
            <span class="vg-list__sub">{{ summary.unlimited ? t('cloud.membership.modeUnlimited') : ruleText(usage) }}</span>
          </span>
          <span class="vg-muted ai-service__count">{{ t('cloud.membership.usedThisMonth', { count: usage.usedThisMonth }) }}</span>
        </div>
      </template>
      <div class="vg-list__item">
        <span class="vg-list__main">
          <span class="vg-list__title ai-service__title"><MessageSquare :size="14" /> {{ t('cloud.settings.aiServiceChat') }}</span>
        </span>
      </div>
    </div>

    <div>
      <button type="button" class="vg-btn vg-btn--sm" data-testid="managed-ai-open-billing" @click="emit('open-billing')"><Coins :size="14" /> {{ t('cloud.settings.aiServiceOpenBilling') }}</button>
    </div>
  </section>
</template>

<style scoped>
.ai-service { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.ai-service .vg-card__title { flex-wrap: wrap; white-space: normal; min-width: 0; }
.ai-service .vg-list__item { flex-wrap: wrap; }
.ai-service__title { display: inline-flex; align-items: center; gap: 6px; }
.ai-service__balance { font-size: 20px; line-height: 1; }
.ai-service__count { font-size: 12px; white-space: nowrap; }
</style>
