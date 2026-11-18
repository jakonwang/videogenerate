<script setup lang="ts">
import { computed, watch } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { pageItems } from './productResearchUtils'

const props = withDefaults(defineProps<{
  total: number
  page: number
  pageSize: number
  pageSizes?: number[]
  unit?: string
}>(), { pageSizes: () => [10, 20, 50, 100], unit: '条' })

const emit = defineEmits<{ 'update:page': [value: number]; 'update:pageSize': [value: number] }>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const items = computed(() => pageItems(props.page, totalPages.value))

watch(totalPages, (pages) => { if (props.page > pages) emit('update:page', pages) })

function go(page: number) {
  emit('update:page', Math.min(totalPages.value, Math.max(1, page)))
}
function changeSize(event: Event) {
  emit('update:pageSize', Number((event.target as HTMLSelectElement).value))
  emit('update:page', 1)
}
</script>

<template>
  <div class="prd-pager">
    <div class="prd-pager__left"><slot name="left" /></div>
    <div class="prd-pager__right">
      <span>共 {{ total.toLocaleString('en-US') }} {{ unit }}</span>
      <button class="prd-pg" :disabled="page <= 1" aria-label="上一页" @click="go(page - 1)"><ChevronLeft :size="14" /></button>
      <template v-for="(item, index) in items" :key="`${item}-${index}`">
        <button v-if="item === '…'" class="prd-pg is-gap" disabled>…</button>
        <button v-else class="prd-pg" :class="{ 'is-active': item === page }" @click="go(item)">{{ item }}</button>
      </template>
      <button class="prd-pg" :disabled="page >= totalPages" aria-label="下一页" @click="go(page + 1)"><ChevronRight :size="14" /></button>
      <select class="prd-select prd-select--sm" :value="pageSize" @change="changeSize">
        <option v-for="size in pageSizes" :key="size" :value="size">{{ size }} 条/页</option>
      </select>
    </div>
  </div>
</template>
