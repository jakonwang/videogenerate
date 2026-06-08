<script setup lang="ts">
import { computed, useSlots } from 'vue'

const props = defineProps<{
  title?: string
  subtitle?: string
}>()

const slots = useSlots()
const hasContent = computed(() => {
  const title = String(props.title || '').trim()
  const subtitle = String(props.subtitle || '').trim()
  return Boolean(title || subtitle || slots.default)
})
</script>

<template>
  <header v-if="hasContent" class="ds-topbar">
    <div class="ds-topbar__spacer">
      <div v-if="props.subtitle" class="ds-topbar__subtitle">{{ props.subtitle }}</div>
      <div v-if="props.title" class="ds-topbar__title">{{ props.title }}</div>
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
