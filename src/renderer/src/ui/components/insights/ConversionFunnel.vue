<script setup lang="ts">
import { BadgeCheck, Image, Send, ShoppingBag } from 'lucide-vue-next'

/**
 * Content funnel drawn as tapering bars: material made → approved → published → orders.
 * Each share is measured against the first step, so the page reads "how much of what we made got through".
 */
export type FunnelRow = { key: string; label: string; value: number; share: number | null; route?: string }

defineProps<{ rows: FunnelRow[]; locale: string }>()
const emit = defineEmits<{ open: [route: string] }>()

const ICONS: Record<string, unknown> = { produced: Image, approved: BadgeCheck, published: Send, orders: ShoppingBag }

function shareText(share: number | null, locale: string) {
  if (share === null) return ''
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: share >= 10 ? 0 : 1 }).format(share)}%`
}
</script>

<template>
  <div class="funnel">
    <button
      v-for="(row, index) in rows"
      :key="row.key"
      type="button"
      class="funnel__row"
      :class="`funnel__row--${index}`"
      :style="{ '--inset': `${index * 4}%` }"
      :disabled="!row.route"
      @click="row.route && emit('open', row.route)"
    >
      <span class="funnel__icon"><component :is="ICONS[row.key] || Image" :size="15" /></span>
      <span class="funnel__label">{{ row.label }}</span>
      <strong class="funnel__value vg-num">{{ new Intl.NumberFormat(locale).format(row.value) }}</strong>
      <span class="funnel__share vg-num">{{ shareText(row.share, locale) }}</span>
    </button>
  </div>
</template>

<style scoped>
.funnel { display: flex; flex-direction: column; gap: 8px; flex: 1; justify-content: center; }
.funnel__row {
  --tone: var(--vg-accent);
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto 64px;
  align-items: center;
  gap: 12px;
  height: 38px;
  margin: 0 0 0 var(--inset);
  padding: 0 14px 0 calc(14px + var(--inset) * 0.6);
  border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent);
  border-radius: 6px 10px 10px 6px;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 10px 50%);
  background: linear-gradient(90deg, color-mix(in srgb, var(--tone) 62%, var(--theme-panel)), color-mix(in srgb, var(--tone) 10%, var(--theme-panel)) 70%);
  color: var(--theme-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: filter .15s;
}
.funnel__row:hover:not(:disabled) { filter: brightness(1.12); }
.funnel__row:disabled { cursor: default; }
.funnel__row--1 { --tone: color-mix(in srgb, var(--vg-accent) 80%, #22d3ee); }
.funnel__row--2 { --tone: color-mix(in srgb, var(--vg-accent) 55%, #3b82f6); }
.funnel__row--3 { --tone: #8b5cf6; }
.funnel__icon { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 7px; background: color-mix(in srgb, #fff 16%, transparent); color: #fff; }
.funnel__label { font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff; }
.funnel__value { font-size: 15px; font-weight: 800; }
.funnel__share { font-size: 12px; text-align: right; color: var(--theme-text-secondary); }
</style>
