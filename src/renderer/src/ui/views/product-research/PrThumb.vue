<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ImageOff } from 'lucide-vue-next'
import type { ProductResearchResult } from '@/../../shared/productResearch'
import { imageSrc } from './productResearchUtils'

const props = withDefaults(defineProps<{
  result?: Pick<ProductResearchResult, 'imagePath' | 'imageDataUrl' | 'title'> | null
  size?: 'sm' | 'md' | 'lg'
}>(), { size: 'md' })

const failed = ref(false)
const src = computed(() => imageSrc(props.result || undefined))
watch(src, () => { failed.value = false })
const sizeClass = computed(() => (props.size === 'md' ? '' : `prd-thumb--${props.size}`))
</script>

<template>
  <img v-if="src && !failed" :src="src" :alt="result?.title || ''" class="prd-thumb" :class="sizeClass" loading="lazy" @error="failed = true" />
  <span v-else class="prd-thumb" :class="sizeClass"><ImageOff :size="size === 'sm' ? 13 : 16" /></span>
</template>
