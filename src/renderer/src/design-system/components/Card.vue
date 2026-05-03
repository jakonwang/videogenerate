<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'default' | 'raised' | 'recessed'
    selected?: boolean
    interactive?: boolean
  }>(),
  {
    tone: 'default',
  },
)
</script>

<template>
  <section class="ds-card" :class="[`ds-card--${tone}`, { 'is-selected': selected, 'is-interactive': interactive }]">
    <slot />
  </section>
</template>
