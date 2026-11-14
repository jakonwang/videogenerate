<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    description: string
    tone?: 'empty' | 'pending' | 'danger'
  }>(),
  {
    tone: 'empty',
  },
)
</script>

<template>
  <div class="state-card" :class="`state-card--${tone}`">
    <strong>{{ title }}</strong>
    <span>{{ description }}</span>
    <div v-if="$slots.default" class="state-card__extra">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.state-card {
  display: grid;
  align-content: center;
  gap: 6px;
}

.state-card strong {
  color: var(--theme-text);
  font-size: 13px;
  font-weight: 700;
}

.state-card span {
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.state-card__extra {
  margin-top: 4px;
}

.state-card--empty {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 3%, transparent), color-mix(in srgb, var(--theme-text) 2%, transparent)),
    color-mix(in srgb, var(--theme-text) 2%, transparent);
  border: 1px dashed color-mix(in srgb, var(--theme-tone-blue) 18%, transparent);
}

.state-card--pending {
  background: color-mix(in srgb, var(--theme-tone-blue) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-tone-blue) 16%, transparent);
}

.state-card--danger {
  background: color-mix(in srgb, var(--theme-tone-red) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--theme-tone-red) 18%, transparent);
}
</style>
