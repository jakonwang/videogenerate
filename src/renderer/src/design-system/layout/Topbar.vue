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

<style scoped>
.ds-topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  min-height: 88px;
}

.ds-topbar__spacer {
  flex: 1 1 auto;
  min-width: 0;
}

.ds-topbar__actions {
  flex: 0 0 auto;
  min-width: 0;
  width: auto;
}
</style>

