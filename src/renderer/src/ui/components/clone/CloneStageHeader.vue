<script setup lang="ts">
defineProps<{
  tag: string
  title: string
  description?: string
}>()
</script>

<template>
  <div class="clone-stage-header">
    <div class="panel-head stage-head">
      <div class="stage-head__main">
        <span v-if="tag" class="panel-tag">{{ tag }}</span>
        <h2>{{ title }}</h2>
        <p v-if="description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="panel-actions stage-head__actions">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.aux" class="stage-head__aux">
      <slot name="aux" />
    </div>
  </div>
</template>

<style scoped>
.clone-stage-header {
  display: grid;
  gap: 0;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.stage-head {
  margin-bottom: 0;
}

.stage-head__main {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 0;
}

.stage-head__main h2 {
  margin: 0;
  font-size: 16px;
  line-height: 1.15;
}

.stage-head__main p {
  margin: 0;
  color: #93a2c1;
  font-size: 10px;
  line-height: 1.4;
  max-width: 520px;
}

.stage-head__actions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 0;
  margin-left: auto;
  padding-left: 10px;
}

.stage-head__aux {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 22px;
  padding: 2px 2px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.stage-head__aux :deep(span) {
  color: #8fa0c4;
  font-size: 10px;
  line-height: 1.4;
}

@media (max-width: 1220px) {
  .stage-head__actions {
    margin-left: 0;
    padding-left: 0;
  }

  .stage-head__aux {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
