<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

/** Compact pager on the vg- kit: prev / page x of y / next, plus a page-size select. */
const props = defineProps<{
  page: number
  totalPages: number
  pageSize: number
  sizes: number[]
  total: number
  labels: { prev: string; next: string; perPage: string; items: string }
}>()

const emit = defineEmits<{
  'update:page': [value: number]
  'update:pageSize': [value: number]
}>()

function go(next: number) {
  emit('update:page', Math.min(Math.max(1, next), Math.max(1, props.totalPages)))
}
</script>

<template>
  <footer class="vg-pager pm-pager">
    <span class="vg-num">{{ total }} {{ labels.items }}</span>
    <div class="vg-pager__group">
      <button class="vg-pg" type="button" :title="labels.prev" :aria-label="labels.prev" :disabled="page <= 1" @click="go(page - 1)">
        <ChevronLeft :size="14" />
      </button>
      <span class="vg-num pm-pager__pos">{{ page }} / {{ Math.max(1, totalPages) }}</span>
      <button class="vg-pg" type="button" :title="labels.next" :aria-label="labels.next" :disabled="page >= totalPages" @click="go(page + 1)">
        <ChevronRight :size="14" />
      </button>
      <span class="pm-pager__size">{{ labels.perPage }}</span>
      <select class="vg-select vg-select--sm" :value="pageSize" @change="emit('update:pageSize', Number(($event.target as HTMLSelectElement).value))">
        <option v-for="n in sizes" :key="n" :value="n">{{ n }}</option>
      </select>
    </div>
  </footer>
</template>
