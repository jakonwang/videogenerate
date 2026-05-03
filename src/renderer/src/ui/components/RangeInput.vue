<script setup lang="ts">
import { computed } from 'vue'

type RangeValue = { min: number; max: number }

const props = withDefaults(
  defineProps<{
    modelValue: RangeValue
    step?: number
    min?: number
    max?: number
    separator?: string // "~" or "-"
    unit?: string // e.g. "s"
    disabled?: boolean
  }>(),
  {
    step: 1,
    separator: '~',
    disabled: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: RangeValue): void
}>()

const minValue = computed({
  get: () => props.modelValue.min,
  set: (v: number) => emit('update:modelValue', { min: v, max: Math.max(v, props.modelValue.max) }),
})

const maxValue = computed({
  get: () => props.modelValue.max,
  set: (v: number) => emit('update:modelValue', { min: Math.min(props.modelValue.min, v), max: v }),
})
</script>

<template>
  <div class="inline-flex items-stretch overflow-hidden rounded-lg border border-white/10 bg-black/20 shadow-lg shadow-black/40">
    <input
      v-model.number="minValue"
      type="number"
      :step="step"
      :min="min"
      :max="max"
      :disabled="disabled"
      class="w-20 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:ring-1 focus:ring-white/10 disabled:opacity-50"
    />
    <span class="grid place-items-center bg-white/[0.04] px-2 text-xs font-medium text-white/70">
      {{ separator }}
    </span>
    <input
      v-model.number="maxValue"
      type="number"
      :step="step"
      :min="min"
      :max="max"
      :disabled="disabled"
      class="w-20 bg-black/20 px-2 py-1.5 text-sm text-white/90 outline-none focus:ring-1 focus:ring-white/10 disabled:opacity-50"
    />
    <span v-if="unit" class="grid place-items-center bg-white/[0.03] px-2 text-xs text-white/45">
      {{ unit }}
    </span>
  </div>
</template>

