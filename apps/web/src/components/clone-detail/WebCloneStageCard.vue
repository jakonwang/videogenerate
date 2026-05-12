<script setup lang="ts">
defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <article class="web-card stage-card">
    <div class="stage-head">
      <div class="stage-copy">
        <strong>{{ title }}</strong>
        <small>{{ description }}</small>
      </div>
      <div class="stage-action">
        <slot name="action" />
      </div>
    </div>
    <div class="stage-body">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.stage-card {
  padding: 14px;
  display: grid;
  gap: 10px;
}

.stage-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.stage-copy {
  display: grid;
  gap: 4px;
}

.stage-copy strong {
  display: block;
  color: #f4f7ff;
}

.stage-copy small {
  color: var(--web-text-soft);
  font-size: 12px;
  line-height: 1.6;
}

.stage-action {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stage-body {
  display: grid;
  gap: 10px;
}

@media (max-width: 860px) {
  .stage-head {
    flex-direction: column;
  }
}
</style>
