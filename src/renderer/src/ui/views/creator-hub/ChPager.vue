<script setup lang="ts">
import { computed, watch } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { pageItems } from '../product-research/productResearchUtils'

const props = withDefaults(defineProps<{ total: number; page: number; pageSize: number; pageSizes?: number[] }>(), { pageSizes: () => [20, 50, 100] })
const emit = defineEmits<{ 'update:page': [value: number]; 'update:pageSize': [value: number] }>()
const { t } = useI18n()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const items = computed(() => pageItems(props.page, totalPages.value))
watch(totalPages, (pages) => { if (props.page > pages) emit('update:page', pages) })

function go(page: number) { emit('update:page', Math.min(totalPages.value, Math.max(1, page))) }
function changeSize(event: Event) {
  emit('update:pageSize', Number((event.target as HTMLSelectElement).value))
  emit('update:page', 1)
}
</script>

<template>
  <div class="vg-pager">
    <div class="vg-pager__group"><slot /></div>
    <div class="vg-pager__group">
      <span>{{ t('creatorHub.pager.total', { count: total.toLocaleString('en-US') }) }}</span>
      <button class="vg-pg" :disabled="page <= 1" :aria-label="t('creatorHub.pager.prev')" @click="go(page - 1)"><ChevronLeft :size="14" /></button>
      <template v-for="(item, index) in items" :key="`${item}-${index}`">
        <button v-if="item === '…'" class="vg-pg is-gap" disabled>…</button>
        <button v-else class="vg-pg" :class="{ 'is-active': item === page }" @click="go(Number(item))">{{ item }}</button>
      </template>
      <button class="vg-pg" :disabled="page >= totalPages" :aria-label="t('creatorHub.pager.next')" @click="go(page + 1)"><ChevronRight :size="14" /></button>
      <select class="vg-select vg-select--sm" :value="pageSize" @change="changeSize">
        <option v-for="size in pageSizes" :key="size" :value="size">{{ t('creatorHub.pager.perPage', { size }) }}</option>
      </select>
    </div>
  </div>
</template>
