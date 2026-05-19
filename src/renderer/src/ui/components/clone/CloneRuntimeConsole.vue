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
        <strong>运行控制台</strong>
        <span>实时查看提交日志、接口返回、阶段切换与错误信息</span>
      </div>
      <div class="runtime-log-head__actions">
        <em>{{ logs.length }} 条</em>
        <button class="ghost-button small" type="button" @click="emit('update:collapsed', !collapsed)">
          {{ collapsed ? '打开' : '关闭' }}
        </button>
      </div>
    </div>
    <div v-if="!collapsed" ref="logListRef" class="runtime-log-list">
      <article v-for="item in logs" :key="item.id" class="runtime-log-item" :class="item.level">
        <strong>{{ item.level === 'error' ? '错误' : item.level === 'success' ? '成功' : '日志' }}</strong>
        <span>{{ item.message }}</span>
      </article>
    </div>
  </section>

  <button v-if="collapsed" class="runtime-console-toggle" type="button" @click="emit('update:collapsed', false)">
    打开运行控制台
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
  border: 1px solid rgba(119, 137, 198, 0.16);
  background: rgba(11, 17, 30, 0.94);
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
  color: #93a2c1;
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
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  word-break: break-word;
  overflow-wrap: anywhere;
}

.runtime-log-item strong {
  font-size: 11px;
  color: #7e90bb;
}

.runtime-log-item span {
  color: #edf2ff;
  font-size: 12px;
  line-height: 1.55;
}

.runtime-log-item.success {
  border-color: rgba(88, 214, 154, 0.18);
  background: rgba(88, 214, 154, 0.08);
}

.runtime-log-item.error {
  border-color: rgba(255, 120, 120, 0.22);
  background: rgba(255, 120, 120, 0.08);
}

.runtime-log-item.info {
  border-color: rgba(142, 166, 255, 0.16);
}

.runtime-console-toggle {
  position: fixed;
  right: 12px;
  bottom: 10px;
  z-index: 41;
  height: 34px;
  padding: 0 14px;
  border: 1px solid rgba(119, 137, 198, 0.18);
  background: rgba(11, 17, 30, 0.96);
  color: #eef3ff;
  font-size: 12px;
  cursor: pointer;
}
</style>
