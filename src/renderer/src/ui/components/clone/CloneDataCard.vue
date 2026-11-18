<script setup lang="ts">
withDefaults(
  defineProps<{
    as?: string
    tone?: 'default' | 'danger' | 'context'
    size?: 'default' | 'large'
  }>(),
  {
    as: 'div',
    tone: 'default',
    size: 'default',
  },
)
</script>

<template>
  <component :is="as" class="data-card" :class="[`data-card--${tone}`, { 'data-card--large': size === 'large' }]">
    <slot />
  </component>
</template>

<style scoped>
.data-card {
  border-radius: 12px;
  border: 1px solid var(--theme-border);
  background: var(--theme-panel-soft);
}

.data-card--large {
  min-height: 132px;
}

.data-card--danger {
  border-color: color-mix(in srgb, var(--theme-tone-red) 28%, transparent);
  background: color-mix(in srgb, var(--theme-tone-red) 12%, transparent);
}

.data-card--context {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 20%, transparent);
  background: color-mix(in srgb, var(--theme-tone-blue) 18%, transparent);
}
</style>
