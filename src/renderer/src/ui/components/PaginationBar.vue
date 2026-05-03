<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiButton from './UiButton.vue'

const { t } = useI18n()

const props = defineProps<{
  page: number
  totalPages: number
  pageSize: number
  pageSizeOptions?: number[]
}>()

const emit = defineEmits<{
  (e: 'update:page', v: number): void
  (e: 'update:pageSize', v: number): void
}>()

const opts = props.pageSizeOptions ?? [12, 24, 48]

function prev() {
  emit('update:page', Math.max(1, props.page - 1))
}
function next() {
  emit('update:page', Math.min(props.totalPages || 1, props.page + 1))
}
</script>

<template>
  <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
    <div class="flex items-center gap-2 text-[11px] text-white/60">
      <UiButton class="h-8 px-3" variant="ghost" :disabled="page <= 1" @click="prev">{{ t('common.prevPage') }}</UiButton>
      <UiButton class="h-8 px-3" variant="ghost" :disabled="page >= (totalPages || 1)" @click="next">{{ t('common.nextPage') }}</UiButton>
      <div class="ml-1 tabular-nums">
        <span class="text-white/90">{{ page }}</span>
        <span class="opacity-70">/</span>
        <span>{{ totalPages || 1 }}</span>
      </div>
    </div>

    <div class="flex items-center gap-2 text-[11px] text-white/60">
      <span>{{ t('common.perPage') }}</span>
      <select
        class="h-8 rounded-lg border border-white/10 bg-black/20 px-2 text-white/90 outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10"
        :value="pageSize"
        @change="emit('update:pageSize', Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="n in opts" :key="n" :value="n">{{ n }}</option>
      </select>
      <span>{{ t('common.itemsSuffix') }}</span>
    </div>
  </div>
</template>

