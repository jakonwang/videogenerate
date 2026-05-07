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
  border: 1px solid rgba(134, 149, 205, 0.18);
  background:
    linear-gradient(180deg, rgba(17, 24, 40, 0.96), rgba(12, 19, 34, 0.96)),
    rgba(12, 19, 34, 0.94);
}
</style>
