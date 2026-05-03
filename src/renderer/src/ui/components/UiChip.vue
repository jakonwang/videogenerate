<script setup lang="ts">
import DsTag from '../../design-system/components/Tag.vue'

const props = withDefaults(
  defineProps<{
    tone?: 'neutral' | 'accent' | 'danger' | 'info'
  }>(),
  { tone: 'neutral' },
)

const toneMap = {
  neutral: 'default',
  accent: 'success',
  danger: 'error',
  info: 'processing',
} as const
</script>

<template>
  <DsTag :tone="toneMap[props.tone]">
    <slot />
  </DsTag>
</template>
