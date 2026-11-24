<script setup lang="ts">
import { computed } from 'vue'
import { PRODUCT_RESEARCH_SOURCES, researchSourceOf } from '../../../../../shared/productResearch'

/** 商品来源平台：图标 + 名称 */
const props = defineProps<{ item: { source?: string } }>()
const meta = computed(() => PRODUCT_RESEARCH_SOURCES[researchSourceOf(props.item)])
</script>

<template>
  <span class="prd-source"><i class="prd-source__mark" :style="{ background: meta.color }" aria-hidden="true">{{ meta.mark }}</i>{{ meta.label }}</span>
</template>

<style scoped>
.prd-source { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.prd-source__mark { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 5px; color: #fff; font-size: 10px; font-style: normal; font-weight: 800; box-shadow: 0 0 0 1px color-mix(in srgb, #fff 14%, transparent); }
</style>
