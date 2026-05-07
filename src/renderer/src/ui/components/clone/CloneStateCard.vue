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
  color: #eef3ff;
  font-size: 13px;
  font-weight: 700;
}

.state-card span {
  color: #93a2c1;
  font-size: 12px;
  line-height: 1.6;
}

.state-card__extra {
  margin-top: 4px;
}

.state-card--empty {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.028), rgba(255, 255, 255, 0.015)),
    rgba(255, 255, 255, 0.02);
  border: 1px dashed rgba(142, 166, 255, 0.18);
}

.state-card--pending {
  background: rgba(142, 166, 255, 0.08);
  border: 1px solid rgba(142, 166, 255, 0.16);
}

.state-card--danger {
  background: rgba(255, 120, 120, 0.08);
  border: 1px solid rgba(255, 120, 120, 0.18);
}
</style>
