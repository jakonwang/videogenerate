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
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
}

.data-card--large {
  min-height: 132px;
}

.data-card--danger {
  border-color: rgba(255, 120, 120, 0.28);
  background: rgba(120, 22, 22, 0.12);
}

.data-card--context {
  border-color: rgba(120, 144, 255, 0.2);
  background: rgba(36, 54, 105, 0.18);
}
</style>
