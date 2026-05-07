<script setup lang="ts">
defineProps<{
  loading: boolean
  currentProjectId: string
  shotOutputs: Array<{ shotId: string; status: string; error?: string }>
  shotLabel: (shotId: string) => string
  failedCount: number
}>()

const emit = defineEmits<{
  'refresh-remote': []
  'generate-shot-videos': []
}>()
</script>

<template>
  <div class="clone-stage">
    <section class="stage-grid stage-grid--triple">
      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>生成控制</h3>
            <p>左侧保留触发生成、刷新状态与批量恢复入口。</p>
          </div>
        </div>
        <div class="info-list">
          <div class="info-row"><span>当前状态</span><strong>{{ currentProjectId ? '可生成' : '等待前置步骤' }}</strong></div>
          <div class="info-row"><span>失败镜头</span><strong>{{ failedCount }} 个</strong></div>
        </div>
        <div class="card-actions">
          <button class="ghost-button small" type="button" :disabled="loading || !currentProjectId" @click="emit('refresh-remote')">查询结果</button>
          <button class="primary-button small" type="button" :disabled="loading || !currentProjectId" @click="emit('generate-shot-videos')">
            {{ loading ? '生成中' : '生成分镜视频' }}
          </button>
        </div>
      </article>

      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>分镜视频工作区</h3>
            <p>中间仅展示镜头卡流，不混入无关信息。</p>
          </div>
        </div>
        <div class="shot-grid">
          <div v-for="item in shotOutputs" :key="item.shotId" class="shot-card" :class="{ 'is-error': item.error }">
            <strong>{{ shotLabel(item.shotId) }}</strong>
            <span>{{ item.status }}</span>
            <small>{{ item.error || '等待云端回写结果' }}</small>
          </div>
        </div>
      </article>

      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>运行与恢复</h3>
            <p>固定显示云端状态、调用上下文和失败原因摘要。</p>
          </div>
        </div>
        <div class="bullet-list">
          <div class="bullet-item">失败镜头支持单镜查询、单镜重试和后续批量恢复。</div>
          <div class="bullet-item">不要直接静默重新生成，优先查询原任务结果避免重复扣费。</div>
          <div class="bullet-item">详细 provider / model / requestCapability 会在壳层状态区回显。</div>
        </div>
      </article>
    </section>
  </div>
</template>
