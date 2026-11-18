<script setup lang="ts">
withDefaults(
  defineProps<{
    as?: string
  }>(),
  {
    as: 'div',
  },
)
</script>

<template>
  <component :is="as" class="media-card">
    <slot />
  </component>
</template>

<style scoped>
.media-card {
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-blue) 18%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-panel-soft) 96%, transparent), color-mix(in srgb, var(--theme-panel) 96%, transparent)),
    color-mix(in srgb, var(--theme-panel) 94%, transparent);
}
</style>
