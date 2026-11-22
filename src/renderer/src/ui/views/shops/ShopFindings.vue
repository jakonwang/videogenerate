<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, CircleAlert, CircleCheck, TrendingUp, TriangleAlert } from 'lucide-vue-next'
import type { Finding } from '../../../../../shared/shopAnalysis'
import { actionText, findingText } from '../../../../../shared/shopReportText'

/**
 * Analysis findings in plain language. `grouped` splits them into 需要处理 / 机会 with a count each;
 * long groups show the first few and expand on demand. `compact` is a single quiet line (cards).
 */
const props = withDefaults(defineProps<{ findings: Finding[]; grouped?: boolean; compact?: boolean; perGroup?: number }>(), { grouped: false, compact: false, perGroup: 5 })
const { t, locale } = useI18n()
const expanded = ref<Record<string, boolean>>({})

const groups = computed(() => {
  if (!props.grouped) return [{ key: 'all', title: '', items: props.findings }]
  const problems = props.findings.filter((item) => item.level === 'error' || item.level === 'warning')
  const chances = props.findings.filter((item) => item.level === 'growth')
  const ok = props.findings.filter((item) => item.level === 'ok')
  return [
    { key: 'problems', title: t('shops.findings.problems'), items: problems },
    { key: 'chances', title: t('shops.findings.chances'), items: chances },
    { key: 'ok', title: '', items: ok },
  ].filter((group) => group.items.length)
})

function visible(group: { key: string; items: Finding[] }) {
  return props.grouped && !expanded.value[group.key] ? group.items.slice(0, props.perGroup) : group.items
}
</script>

<template>
  <div class="findings" :class="{ 'findings--compact': compact }">
    <section v-for="group in groups" :key="group.key" class="findings__group">
      <header v-if="group.title" class="findings__head">
        <span>{{ group.title }}</span>
        <span class="findings__count">{{ group.items.length }}</span>
      </header>
      <ul class="findings__list">
        <li v-for="finding in visible(group)" :key="finding.id" class="finding" :class="`finding--${finding.level}`">
          <span class="finding__icon">
            <CircleAlert v-if="finding.level === 'error'" :size="15" />
            <TriangleAlert v-else-if="finding.level === 'warning'" :size="15" />
            <TrendingUp v-else-if="finding.level === 'growth'" :size="15" />
            <CircleCheck v-else :size="15" />
          </span>
          <span class="finding__text">
            <span class="finding__title">{{ findingText(finding, locale) }}</span>
            <span v-if="!compact && actionText(finding, locale)" class="finding__action">→ {{ actionText(finding, locale) }}</span>
          </span>
        </li>
      </ul>
      <button v-if="grouped && group.items.length > perGroup" type="button" class="findings__more" @click="expanded[group.key] = !expanded[group.key]">
        {{ expanded[group.key] ? t('shops.findings.less') : t('shops.findings.more', { n: group.items.length - perGroup }) }}
        <ChevronDown :size="13" :class="{ 'is-open': expanded[group.key] }" />
      </button>
    </section>
  </div>
</template>

<style scoped>
.findings { display: flex; flex-direction: column; gap: 16px; }
.findings__group { display: flex; flex-direction: column; gap: 6px; }
.findings__head { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--theme-text-muted); letter-spacing: 0.02em; }
.findings__count { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; background: var(--theme-panel-soft); color: var(--theme-text-secondary); font-size: 11px; font-variant-numeric: tabular-nums; }
.findings__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.finding { position: relative; display: flex; gap: 10px; align-items: flex-start; padding: 9px 10px 9px 12px; border-radius: 8px; font-size: 13px; line-height: 1.5; }
.finding::before { content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 2px; background: var(--theme-border); }
.finding:hover { background: color-mix(in srgb, var(--theme-panel-soft) 70%, transparent); }
.finding__icon { flex-shrink: 0; margin-top: 2px; display: inline-flex; }
.finding__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.finding__title { color: var(--theme-text); }
.finding__action { font-size: 12px; color: var(--theme-text-muted); }
.finding--error::before { background: var(--vg-red); }
.finding--error .finding__icon { color: var(--vg-red); }
.finding--warning::before { background: var(--vg-amber); }
.finding--warning .finding__icon { color: var(--vg-amber); }
.finding--growth::before { background: var(--vg-green, #16a34a); }
.finding--growth .finding__icon, .finding--ok .finding__icon { color: var(--vg-green, #16a34a); }
.finding--ok::before { background: var(--vg-green, #16a34a); }
.findings__more { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; margin-left: 12px; padding: 2px 0; border: 0; background: none; color: var(--vg-accent); font: inherit; font-size: 12px; cursor: pointer; }
.findings__more svg { transition: transform .15s; }
.findings__more svg.is-open { transform: rotate(180deg); }
.findings--compact .finding { padding: 6px 8px 6px 10px; font-size: 12.5px; }
.findings--compact .finding::before { top: 7px; bottom: 7px; }
.findings--compact .finding:hover { background: none; }
</style>
