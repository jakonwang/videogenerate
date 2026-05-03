<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    busy?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    type: 'button',
  },
)
</script>

<template>
  <button
    :type="type"
    class="ds-button"
    :class="[`ds-button--${variant}`, `ds-button--${size}`, { 'is-busy': busy }]"
    :disabled="disabled || busy"
  >
    <span class="ds-button__content"><slot /></span>
  </button>
</template>
