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
  gap: 16px;
  align-items: flex-start;
}

.stage-head {
  margin-bottom: 6px;
}

.stage-head__main {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 2px 0;
}

.stage-head__main h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
}

.stage-head__main p {
  margin: 0;
  color: #93a2c1;
  font-size: 12px;
  line-height: 1.5;
  max-width: 620px;
}

.stage-head__actions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 2px;
  margin-left: auto;
  padding-left: 16px;
}

.stage-head__aux {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 34px;
  padding: 0 2px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.stage-head__aux :deep(span) {
  color: #8fa0c4;
  font-size: 11px;
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
