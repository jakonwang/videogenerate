<script setup lang="ts">
import DsButton from '../../design-system/components/Button.vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'danger' | 'accent'
    disabled?: boolean
  }>(),
  { variant: 'primary', disabled: false },
)

const variantMap = {
  primary: 'primary',
  accent: 'primary',
  ghost: 'secondary',
  danger: 'danger',
} as const
</script>

<template>
  <DsButton :variant="variantMap[props.variant]" :disabled="props.disabled" size="md">
    <slot />
  </DsButton>
</template>
