<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

type RuntimeLogItem = {
  id: string
  level: 'info' | 'success' | 'error'
  message: string
  time: number
}

const props = defineProps<{
  logs: RuntimeLogItem[]
  collapsed: boolean
}>()

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
}>()

const logListRef = ref<HTMLElement | null>(null)

watch(
  () => props.logs.length,
  async () => {
    await nextTick()
    if (logListRef.value) logListRef.value.scrollTop = 0
  },
)
</script>

<template>
  <section class="runtime-console" :class="{ 'is-collapsed': collapsed }">
    <div class="runtime-log-head">
      <div>
        <strong>&#36816;&#34892;&#25511;&#21046;&#21488;</strong>
        <span>&#23454;&#26102;&#26597;&#30475;&#25552;&#20132;&#26085;&#24535;&#12289;&#25509;&#21475;&#36820;&#22238;&#12289;&#38454;&#27573;&#20999;&#25442;&#19982;&#38169;&#35823;&#20449;&#24687;</span>
      </div>
      <div class="runtime-log-head__actions">
        <em>{{ logs.length }} &#26465;</em>
        <button class="ghost-button small" type="button" @click="emit('update:collapsed', !collapsed)">
          {{ collapsed ? '\u6253\u5f00' : '\u5173\u95ed' }}
        </button>
      </div>
    </div>
    <div v-if="!collapsed" ref="logListRef" class="runtime-log-list">
      <article v-for="item in logs" :key="item.id" class="runtime-log-item" :class="item.level">
        <strong>{{ item.level === 'error' ? '\u9519\u8bef' : item.level === 'success' ? '\u6210\u529f' : '\u65e5\u5fd7' }}</strong>
        <span>{{ item.message }}</span>
      </article>
    </div>
  </section>

  <button v-if="collapsed" class="runtime-console-toggle" type="button" @click="emit('update:collapsed', false)">
    &#25171;&#24320;&#36816;&#34892;&#25511;&#21046;&#21488;
  </button>
</template>

<style scoped>
.runtime-console {
  position: relative;
  z-index: 20;
  display: grid;
  gap: 8px;
  min-height: 0;
  margin-top: 10px;
  padding: 8px 10px 10px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-blue) 16%, transparent);
  background: color-mix(in srgb, var(--theme-panel) 94%, transparent);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
}

.runtime-console.is-collapsed {
  padding-bottom: 10px;
}

.runtime-log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--theme-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.runtime-log-head__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.runtime-log-list {
  max-height: 260px;
  overflow: auto;
  display: grid;
  gap: 8px;
  padding-right: 4px;
}

.runtime-log-item {
  display: grid;
  gap: 4px;
  padding: 10px 11px;
  border-radius: 14px;
  border: 1px solid var(--theme-border);
  background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  word-break: break-word;
  overflow-wrap: anywhere;
}

.runtime-log-item strong {
  font-size: 11px;
  color: var(--theme-text-secondary);
}

.runtime-log-item span {
  color: var(--theme-text);
  font-size: 12px;
  line-height: 1.55;
}

.runtime-log-item.success {
  border-color: color-mix(in srgb, var(--theme-accent) 18%, transparent);
  background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
}

.runtime-log-item.error {
  border-color: color-mix(in srgb, var(--theme-tone-red) 22%, transparent);
  background: color-mix(in srgb, var(--theme-tone-red) 8%, transparent);
}

.runtime-log-item.info {
  border-color: color-mix(in srgb, var(--theme-tone-blue) 16%, transparent);
}

.runtime-console-toggle {
  position: fixed;
  right: 12px;
  bottom: 10px;
  z-index: 41;
  height: 34px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--theme-tone-blue) 18%, transparent);
  background: color-mix(in srgb, var(--theme-panel) 96%, transparent);
  color: var(--theme-text);
  font-size: 12px;
  cursor: pointer;
}
</style>
