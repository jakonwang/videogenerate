<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TrendChart from '../../components/home/TrendChart.vue'

/**
 * One metric per day, with the previous period dashed behind it. Drawn by the same chart as the home
 * page and the data overview so every trend in the app looks alike; this keeps the shop pages' props.
 */
const props = defineProps<{
  points: Array<{ date: string; value: number }>
  previous?: number[]
  format: (value: number) => string
  height?: number
}>()

const { t } = useI18n()

const chartPoints = computed(() => props.points.map((point, index) => ({
  label: point.date.slice(5).replace('-', '/'),
  current: point.value,
  previous: props.previous && props.previous[index] !== undefined ? props.previous[index] : null,
})))
</script>

<template>
  <div class="shop-trend" :style="{ height: `${height ?? 200}px` }">
    <TrendChart
      :points="chartPoints"
      :format="format"
      :current-label="t('ai.home.trend.current', { metric: '' }).trim()"
      :previous-label="t('ai.home.trend.previous', { metric: '' }).trim()"
    />
  </div>
</template>

<style scoped>
.shop-trend { position: relative; width: 100%; }
</style>
