<script setup lang="ts">
defineProps<{
  loading: boolean
  currentProjectId: string
  modelName: string
  productCount: number
  batchCount: number
  storyboardFrames: Array<{ id: string; imagePath?: string; frameIndex: number; status: string }>
  previewImage: (value?: string) => string
}>()

const emit = defineEmits<{
  'pick-model': []
  'pick-products': []
  'generate-storyboards': []
}>()
</script>

<template>
  <div class="clone-stage">
    <section class="stage-grid stage-grid--triple">
      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>输入资产</h3>
            <p>选择脚本版本、模特、产品素材和分镜参数。</p>
          </div>
        </div>
        <div class="info-list">
          <div class="info-row"><span>模特</span><strong>{{ modelName || '未选择' }}</strong></div>
          <div class="info-row"><span>产品素材</span><strong>{{ productCount ? `${productCount} 张` : '未上传' }}</strong></div>
          <div class="info-row"><span>项目状态</span><strong>{{ currentProjectId ? '可生成分镜' : '请先完成前置步骤' }}</strong></div>
        </div>
        <div class="card-actions">
          <button class="ghost-button small" type="button" @click="emit('pick-model')">选择模特</button>
          <button class="ghost-button small" type="button" @click="emit('pick-products')">上传素材</button>
          <button class="primary-button small" type="button" :disabled="loading || !currentProjectId" @click="emit('generate-storyboards')">生成分镜</button>
        </div>
      </article>

      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>分镜结果</h3>
            <p>中间工作区展示批次结果与镜头卡。</p>
          </div>
          <strong>{{ batchCount ? `${batchCount} 批次` : '未生成' }}</strong>
        </div>
        <div class="frame-grid">
          <div v-for="frame in storyboardFrames.slice(0, 9)" :key="frame.id" class="frame-card">
            <img v-if="frame.imagePath" :src="previewImage(frame.imagePath)" alt="" />
            <div v-else class="stage-empty stage-empty--inline">待生成</div>
            <strong>镜头 {{ frame.frameIndex + 1 }}</strong>
            <small>{{ frame.status }}</small>
          </div>
        </div>
      </article>

      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>规则与摘要</h3>
            <p>右侧固定展示生成规则、批次摘要和错误提示入口。</p>
          </div>
        </div>
        <div class="bullet-list">
          <div class="bullet-item">默认按 9:16 竖屏镜头输出，聚焦商品与模特关系。</div>
          <div class="bullet-item">脚本节拍会映射到分镜批次，支持 6 宫格和 9 宫格输出。</div>
          <div class="bullet-item">如需重做镜头，后续在合成前检查阶段执行替换。</div>
        </div>
      </article>
    </section>
  </div>
</template>
