<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'default' | 'ai' | 'upload' | 'success' | 'error' | 'processing' | 'locked' | 'warning'
  }>(),
  {
    tone: 'default',
  },
)
</script>

<template>
  <span class="ds-tag" :class="`ds-tag--${tone}`"><slot /></span>
</template>
