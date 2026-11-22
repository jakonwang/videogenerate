<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { CircleAlert, CircleCheck, TrendingUp, TriangleAlert } from 'lucide-vue-next'
import type { Finding } from '../../../../../shared/shopAnalysis'
import { actionText, findingText } from '../../../../../shared/shopReportText'

/** Analysis findings in plain language, most severe first, each with what to do next. */
withDefaults(defineProps<{ findings: Finding[]; limit?: number; compact?: boolean }>(), { limit: 50, compact: false })
const { locale } = useI18n()
</script>

<template>
  <ul class="findings" :class="{ 'findings--compact': compact }">
    <li v-for="finding in findings.slice(0, limit)" :key="finding.id" class="finding" :class="`finding--${finding.level}`">
      <span class="finding__icon">
        <CircleAlert v-if="finding.level === 'error'" :size="15" />
        <TriangleAlert v-else-if="finding.level === 'warning'" :size="15" />
        <TrendingUp v-else-if="finding.level === 'growth'" :size="15" />
        <CircleCheck v-else :size="15" />
      </span>
      <span class="finding__text">
        <span>{{ findingText(finding, locale) }}</span>
        <small v-if="!compact && actionText(finding, locale)" class="vg-muted">→ {{ actionText(finding, locale) }}</small>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.findings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.findings--compact { gap: 4px; }
.finding { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; line-height: 1.45; }
.findings--compact .finding { font-size: 12px; }
.finding__icon { flex-shrink: 0; margin-top: 2px; display: inline-flex; }
.finding__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.finding__text small { font-size: 12px; }
.finding--error .finding__icon { color: var(--vg-red); }
.finding--warning .finding__icon { color: var(--vg-amber); }
.finding--growth .finding__icon { color: var(--vg-green, #16a34a); }
.finding--ok .finding__icon { color: var(--vg-green, #16a34a); }
</style>
