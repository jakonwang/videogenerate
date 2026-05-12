<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
})

import DsButton from '../../design-system/components/Button.vue'

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

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
  <DsButton
    v-bind="$attrs"
    :variant="variantMap[props.variant]"
    :disabled="props.disabled"
    size="md"
    @click="emit('click', $event)"
  >
    <slot />
  </DsButton>
</template>
