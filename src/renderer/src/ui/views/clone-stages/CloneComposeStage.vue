<script setup lang="ts">
defineProps<{
  loading: boolean
  currentProjectId: string
  finalOutputPath: string
  workflowStepText: string
  finalButtonLabel: string
  shotOutputs: Array<{ shotId: string; status: string; videoPath?: string; error?: string }>
  shotLabel: (shotId: string) => string
  shortPath: (value: string) => string
  mediaUrl: (value?: string) => string
}>()

const emit = defineEmits<{
  'compose-final': []
}>()
</script>

<template>
  <div class="clone-stage">
    <section class="stage-grid stage-grid--triple">
      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>待合成镜头</h3>
            <p>左侧作为最终门槛，核查待合成镜头清单。</p>
          </div>
        </div>
        <div class="shot-grid">
          <div v-for="item in shotOutputs" :key="item.shotId" class="shot-card">
            <strong>{{ shotLabel(item.shotId) }}</strong>
            <span>{{ item.status }}</span>
          </div>
        </div>
      </article>

      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>成片预览</h3>
            <p>突出当前输出文件与最终预览。</p>
          </div>
        </div>
        <div class="video-preview video-preview--large">
          <video v-if="finalOutputPath" :src="mediaUrl(finalOutputPath)" controls preload="metadata"></video>
          <div v-else class="stage-empty">合成完成后在这里预览最终成片</div>
        </div>
      </article>

      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>导出参数与历史</h3>
            <p>显示输出路径、合成状态和导出提示。</p>
          </div>
        </div>
        <div class="info-list">
          <div class="info-row"><span>输出文件</span><strong>{{ shortPath(finalOutputPath) }}</strong></div>
          <div class="info-row"><span>流程阶段</span><strong>{{ workflowStepText }}</strong></div>
          <div class="info-row"><span>当前状态</span><strong>{{ finalOutputPath ? '可导出' : '等待合成' }}</strong></div>
        </div>
        <div class="card-actions">
          <button class="primary-button small" type="button" :disabled="loading || !currentProjectId" @click="emit('compose-final')">
            {{ loading ? '合成中' : finalButtonLabel }}
          </button>
        </div>
      </article>
    </section>
  </div>
</template>
