<script setup lang="ts">
defineProps<{
  title?: string
  subtitle?: string
}>()
</script>

<template>
  <header class="ds-topbar">
    <div class="ds-topbar__spacer">
      <div v-if="subtitle" class="ds-topbar__subtitle">{{ subtitle }}</div>
      <div v-if="title" class="ds-topbar__title">{{ title }}</div>
    </div>
    <div class="ds-topbar__actions">
      <slot />
    </div>
  </header>
</template>

