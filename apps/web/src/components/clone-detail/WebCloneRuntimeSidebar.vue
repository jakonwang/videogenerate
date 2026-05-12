<script setup lang="ts">
defineProps<{
  loading: boolean
  polling: boolean
  runtime: any | null
  project: any | null
  productImages: string[]
  storyboardFrames: any[]
  shotVideoOutputs: any[]
  consoleLines: string[]
}>()

defineEmits<{
  refresh: []
  togglePolling: []
}>()
</script>

<template>
  <aside class="web-card detail-side">
    <div class="detail-section-head">
      <strong>运行概览</strong>
      <span>{{ loading ? '同步中...' : polling ? '自动刷新中' : '已连接' }}</span>
    </div>

    <div class="runtime-list">
      <article class="summary-tile">
        <span>算力余额</span>
        <strong>{{ runtime?.wallet?.balanceCredits ?? '--' }}</strong>
      </article>
      <article class="summary-tile">
        <span>最近计费日志</span>
        <strong>{{ runtime?.recentBillingLogs?.length ?? 0 }} 条</strong>
      </article>
      <article class="summary-tile">
        <span>已选模特</span>
        <strong>{{ project?.selectedModelIdentitySnapshot?.name || '未选择' }}</strong>
      </article>
      <article class="summary-tile">
        <span>商品图数量</span>
        <strong>{{ productImages.length }}</strong>
      </article>
      <article class="summary-tile">
        <span>分镜图片</span>
        <strong>{{ storyboardFrames.length }}</strong>
      </article>
      <article class="summary-tile">
        <span>分镜视频</span>
        <strong>{{ shotVideoOutputs.length }}</strong>
      </article>
    </div>

    <div class="detail-section-head">
      <strong>任务控制台</strong>
      <div class="console-actions">
        <button class="web-button web-button--ghost" type="button" @click="$emit('refresh')">
          刷新
        </button>
        <button class="web-button web-button--ghost" type="button" @click="$emit('togglePolling')">
          {{ polling ? '暂停轮询' : '开启轮询' }}
        </button>
      </div>
    </div>

    <div class="console-panel">
      <div v-for="line in consoleLines" :key="line" class="console-line">
        {{ line }}
      </div>
      <div v-if="!consoleLines.length" class="console-line console-line--placeholder">
        等待任务日志...
      </div>
    </div>
  </aside>
</template>

<style scoped>
.detail-side {
  padding: 14px;
  display: grid;
  gap: 10px;
}

.detail-section-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.detail-section-head span {
  color: var(--web-text-soft);
  font-size: 12px;
}

.runtime-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.summary-tile {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.summary-tile span {
  color: var(--web-text-soft);
  font-size: 12px;
}

.summary-tile strong {
  color: #f2f6ff;
}

.console-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.console-panel {
  display: grid;
  gap: 8px;
  min-height: 220px;
  max-height: 360px;
  overflow: auto;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: #0f0d14;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
}

.console-line {
  color: #bfd0ff;
  line-height: 1.5;
  word-break: break-word;
}

.console-line--placeholder {
  color: #7183aa;
}

@media (max-width: 1240px) {
  .runtime-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .runtime-list {
    grid-template-columns: 1fr;
  }
}
</style>
