<script setup lang="ts">
withDefaults(
  defineProps<{
    tag: string
    title: string
    history?: boolean
  }>(),
  {
    history: false,
  },
)
</script>

<template>
  <article class="panel sticky-panel console-sidebar" :class="{ 'console-sidebar--history': history }">
    <div class="panel-head">
      <div class="console-sidebar__heading">
        <span class="panel-tag">{{ tag }}</span>
        <h2>{{ title }}</h2>
      </div>
      <div v-if="$slots.actions" class="panel-actions">
        <slot name="actions" />
      </div>
    </div>
    <div class="console-sidebar__body">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.sticky-panel {
  position: relative;
}

.console-sidebar {
  padding: 14px;
  background: linear-gradient(180deg, rgba(13, 20, 36, 0.98), rgba(9, 15, 27, 0.98));
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 2px;
}

.console-sidebar__heading {
  display: grid;
  gap: 8px;
}

.console-sidebar__heading h2 {
  margin: 0;
}

.console-sidebar__body {
  display: grid;
  gap: 10px;
}

.console-sidebar--history {
  padding-top: 12px;
}

@media (max-width: 1460px) {
  .sticky-panel {
    position: static;
  }
}
</style>
