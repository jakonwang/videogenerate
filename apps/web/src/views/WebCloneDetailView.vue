<script setup lang="ts">
import WebCloneRuntimeSidebar from '../components/clone-detail/WebCloneRuntimeSidebar.vue'
import WebCloneStageCard from '../components/clone-detail/WebCloneStageCard.vue'
import { useWebCloneDetailWorkspace } from '../composables/useWebCloneDetailWorkspace'

const workspace = useWebCloneDetailWorkspace()
</script>

<template>
  <section class="detail-page">
    <header class="web-card detail-hero">
      <div class="detail-hero__copy">
        <span class="page-tag">Clone Workspace</span>
        <h1>{{ workspace.project?.title || '复刻任务详情' }}</h1>
        <p>
          {{
            workspace.project?.description ||
            '浏览器工作台已接入五阶段主链路，可直接完成参考分析、脚本筛选、分镜出图、分镜视频和最终成片合成。'
          }}
        </p>
      </div>
      <div class="detail-hero__meta">
        <strong>{{ workspace.project?.workflowV2?.currentStep || 'upload_analyze_script' }}</strong>
        <small>{{ workspace.project?.status || '--' }}</small>
      </div>
    </header>

    <div class="detail-grid">
      <section class="detail-main">
        <WebCloneStageCard
          title="分析参考视频"
          description="上传参考视频后，生成逐分镜时间段分析与反推脚本。"
        >
          <template #action>
            <button
              class="web-button"
              type="button"
              :disabled="workspace.submitting || !workspace.localReferenceBase64"
              @click="workspace.submitAnalyze"
            >
              {{ workspace.submitting ? '处理中...' : '上传并开始分析' }}
            </button>
          </template>

          <label class="upload-field">
            <span>参考视频</span>
            <input type="file" accept="video/*" @change="workspace.onReferenceChange" />
          </label>

          <div class="stage-summary-grid">
            <article class="summary-tile">
              <span>当前文件</span>
              <strong>{{ workspace.localReferenceName || workspace.project?.referenceVideoName || '未选择' }}</strong>
            </article>
            <article class="summary-tile">
              <span>已分析分镜</span>
              <strong>{{ workspace.shots.length }}</strong>
            </article>
            <article class="summary-tile">
              <span>最近提示</span>
              <strong>{{ workspace.analyzeMessage || '等待上传参考视频' }}</strong>
            </article>
          </div>

          <div v-if="workspace.shots.length" class="shot-list">
            <article v-for="shot in workspace.shots" :key="shot.id" class="shot-row">
              <div class="shot-row__time">{{ workspace.formatTimeRange(shot) }}</div>
              <div class="shot-row__copy">
                <strong>分镜 {{ shot.index + 1 }}</strong>
                <span>{{ workspace.summarizeShotText(shot) }}</span>
              </div>
            </article>
          </div>
        </WebCloneStageCard>

        <WebCloneStageCard
          title="脚本变体评分"
          description="先绑定商品图和模特，再基于参考分析生成多套逐分镜脚本候选。"
        >
          <template #action>
            <button
              class="web-button"
              type="button"
              :disabled="workspace.submitting || !workspace.canGenerateVariants"
              @click="workspace.generateVariants"
            >
              {{ workspace.submitting ? '处理中...' : '生成脚本候选' }}
            </button>
          </template>

          <div class="stage-body--split">
            <div class="stage-side-panel">
              <div class="field-group">
                <label class="upload-field">
                  <span>商品图片</span>
                  <input type="file" accept="image/*" multiple @change="workspace.onProductChange" />
                </label>
                <small v-if="workspace.productUploadNames.length" class="helper-text">
                  最近上传：{{ workspace.productUploadNames.join('、') }}
                </small>
                <div class="chip-list">
                  <span v-for="path in workspace.productImages" :key="path" class="asset-chip">
                    {{ workspace.basename(path) }}
                  </span>
                </div>
              </div>

              <div class="field-group">
                <div class="section-subhead">
                  <strong>选择模特</strong>
                  <small>{{ workspace.models.length }} 个可选</small>
                </div>
                <div class="model-list">
                  <button
                    v-for="item in workspace.models"
                    :key="item.id"
                    class="model-item"
                    :class="{ 'is-active': workspace.selectedModelId === item.id }"
                    type="button"
                    @click="workspace.selectModel(item.id)"
                  >
                    <strong>{{ item.name }}</strong>
                    <span>{{ item.productType }}</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="stage-main-panel">
              <div class="section-subhead">
                <strong>脚本候选</strong>
                <label class="variant-count">
                  <span>候选数</span>
                  <input
                    v-model.number="workspace.variantCount"
                    class="web-input count-input"
                    type="number"
                    min="1"
                    max="6"
                  />
                </label>
              </div>

              <small class="helper-text">{{ workspace.scriptMessage || '绑定素材后生成多个逐分镜脚本候选。' }}</small>

              <div v-if="workspace.scriptCandidates.length" class="candidate-list">
                <article
                  v-for="item in workspace.scriptCandidates"
                  :key="item.id || item.variantId"
                  class="candidate-card"
                  :class="{ 'is-active': workspace.selectedVariantId === (item.id || item.variantId) }"
                >
                  <div class="candidate-head">
                    <div>
                      <strong>{{ item.title || item.name || `候选 ${item.id || item.variantId}` }}</strong>
                      <small>{{ item.summary || item.fullScript || '暂无摘要' }}</small>
                    </div>
                    <button
                      class="web-button web-button--ghost"
                      type="button"
                      @click="workspace.chooseVariant(item.id || item.variantId)"
                    >
                      {{ workspace.selectedVariantId === (item.id || item.variantId) ? '已选中' : '选中此脚本' }}
                    </button>
                  </div>

                  <div class="candidate-shots">
                    <article
                      v-for="shot in item.shotScripts || []"
                      :key="shot.shotId || `${item.id}-${shot.shotIndex}`"
                      class="candidate-shot"
                    >
                      <span>{{ shot.timeRange || `分镜 ${shot.shotIndex + 1}` }}</span>
                      <strong>{{ shot.scriptText || shot.visualDescription || '暂无脚本' }}</strong>
                    </article>
                  </div>
                </article>
              </div>

              <div v-else class="empty-panel">
                <strong>还没有脚本候选</strong>
                <span>先上传商品图并选择模特，再生成脚本候选。</span>
              </div>
            </div>
          </div>
        </WebCloneStageCard>

        <WebCloneStageCard
          title="分镜图片生成"
          description="使用已选脚本、模特与商品图，为每个分镜生成独立图片。"
        >
          <template #action>
            <button
              class="web-button"
              type="button"
              :disabled="workspace.submitting || !workspace.canGenerateImages"
              @click="workspace.generateStoryboardImages"
            >
              {{ workspace.submitting ? '处理中...' : '生成分镜图片' }}
            </button>
          </template>

          <small class="helper-text">{{ workspace.imageMessage || '支持单镜重生与锁定，不再使用九宫格裁切。' }}</small>

          <div class="shot-workbench">
            <article v-for="shot in workspace.shots" :key="`frame-${shot.id}`" class="work-row">
              <div class="work-row__meta">
                <strong>分镜 {{ shot.index + 1 }}</strong>
                <span>{{ workspace.formatTimeRange(shot) }}</span>
                <span>{{ workspace.summarizeShotText(shot) }}</span>
              </div>
              <div class="work-row__asset">
                <strong>{{ workspace.basename(workspace.resolveFrameForShot(shot.id)?.imagePath || '') || '未生成图片' }}</strong>
                <span>状态：{{ workspace.resolveFrameForShot(shot.id)?.status || 'idle' }}</span>
                <span v-if="workspace.resolveFrameForShot(shot.id)?.error" class="danger-text">
                  {{ workspace.resolveFrameForShot(shot.id)?.error }}
                </span>
              </div>
              <div class="work-row__actions">
                <button class="web-button web-button--ghost" type="button" @click="workspace.regenerateStoryboardImage(shot.id)">
                  重生成图片
                </button>
                <button class="web-button web-button--ghost" type="button" @click="workspace.toggleShotLock(shot)">
                  {{ shot.locked ? '解除锁定' : '锁定分镜' }}
                </button>
              </div>
            </article>
          </div>
        </WebCloneStageCard>

        <WebCloneStageCard
          title="分镜视频生成"
          description="基于当前分镜脚本、分镜图和产品约束生成对应视频。"
        >
          <template #action>
            <button
              class="web-button"
              type="button"
              :disabled="workspace.submitting || !workspace.canGenerateVideos"
              @click="workspace.generateShotVideos"
            >
              {{ workspace.submitting ? '处理中...' : '继续生成分镜视频' }}
            </button>
          </template>

          <small class="helper-text">{{ workspace.videoMessage || '可对失败或效果不佳的单镜视频继续查询或重新生成。' }}</small>

          <div class="shot-workbench">
            <article v-for="shot in workspace.shots" :key="`video-${shot.id}`" class="work-row">
              <div class="work-row__meta">
                <strong>分镜 {{ shot.index + 1 }}</strong>
                <span>{{ workspace.formatTimeRange(shot) }}</span>
                <span>{{ workspace.summarizeShotText(shot) }}</span>
              </div>
              <div class="work-row__asset">
                <strong>{{ workspace.basename(workspace.resolveVideoForShot(shot.id)?.videoPath || workspace.resolveVideoForShot(shot.id)?.localPath || '') || '未生成视频' }}</strong>
                <span>状态：{{ workspace.resolveVideoForShot(shot.id)?.status || 'idle' }}</span>
                <span v-if="workspace.resolveVideoForShot(shot.id)?.taskId">
                  任务：{{ workspace.resolveVideoForShot(shot.id)?.taskId }}
                </span>
                <span v-if="workspace.resolveVideoForShot(shot.id)?.error" class="danger-text">
                  {{ workspace.resolveVideoForShot(shot.id)?.error }}
                </span>
              </div>
              <div class="work-row__actions">
                <button class="web-button web-button--ghost" type="button" @click="workspace.syncShotVideo(shot.id)">
                  查询状态
                </button>
                <button class="web-button web-button--ghost" type="button" @click="workspace.regenerateShotVideo(shot.id)">
                  重生成视频
                </button>
              </div>
            </article>
          </div>
        </WebCloneStageCard>

        <WebCloneStageCard
          title="合成最终成片"
          description="仅显示与本地合成相关的信息，生成完成后保留输出结果路径。"
        >
          <template #action>
            <button
              class="web-button"
              type="button"
              :disabled="workspace.submitting || !workspace.canCompose"
              @click="workspace.composeFinalVideo"
            >
              {{ workspace.submitting ? '处理中...' : '合成最终成片' }}
            </button>
          </template>

          <small class="helper-text">{{ workspace.composeMessage || '当每个分镜都具备可用视频后，即可执行最终合成。' }}</small>

          <div class="stage-summary-grid">
            <article class="summary-tile">
              <span>已选脚本</span>
              <strong>{{ workspace.selectedCandidate?.title || workspace.selectedCandidate?.name || workspace.selectedVariantId || '未选择' }}</strong>
            </article>
            <article class="summary-tile">
              <span>图片 / 视频</span>
              <strong>{{ workspace.storyboardFrames.length }} / {{ workspace.shotVideoOutputs.length }}</strong>
            </article>
            <article class="summary-tile">
              <span>成片路径</span>
              <strong>{{ workspace.finalOutputPath || '尚未生成' }}</strong>
            </article>
          </div>
        </WebCloneStageCard>
      </section>

      <WebCloneRuntimeSidebar
        :console-lines="workspace.consoleLines"
        :loading="workspace.loading"
        :polling="workspace.polling"
        :product-images="workspace.productImages"
        :project="workspace.project"
        :runtime="workspace.runtime"
        :shot-video-outputs="workspace.shotVideoOutputs"
        :storyboard-frames="workspace.storyboardFrames"
        @refresh="workspace.refresh()"
        @toggle-polling="workspace.polling ? workspace.stopPolling() : workspace.startPolling()"
      />
    </div>
  </section>
</template>

<style scoped>
.detail-page {
  display: grid;
  gap: 12px;
}

.detail-hero {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.detail-hero__copy,
.detail-hero__meta {
  display: grid;
  gap: 4px;
}

.detail-hero__copy h1,
.detail-hero__copy p {
  margin: 0;
}

.detail-hero__copy h1 {
  font-size: 30px;
  line-height: 1.14;
}

.detail-hero__copy p,
.detail-hero__meta small,
.helper-text,
.summary-tile span,
.shot-row__copy span,
.model-item span,
.work-row__meta span,
.work-row__asset span,
.section-subhead small {
  color: var(--web-text-soft);
  font-size: 12px;
  line-height: 1.6;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 12px;
}

.detail-main,
.stage-summary-grid,
.shot-list,
.field-group,
.chip-list,
.model-list,
.candidate-list,
.candidate-shots,
.shot-workbench {
  display: grid;
  gap: 10px;
}

.stage-body--split {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 10px;
}

.stage-side-panel,
.stage-main-panel {
  display: grid;
  gap: 10px;
}

.upload-field {
  display: grid;
  gap: 6px;
}

.upload-field input[type='file'] {
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.03);
  color: var(--web-text);
}

.stage-summary-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.summary-tile {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.summary-tile strong,
.shot-row__copy strong,
.candidate-head strong,
.candidate-shot strong,
.work-row__meta strong,
.work-row__asset strong,
.section-subhead strong,
.detail-hero__meta strong {
  color: #f4f7ff;
}

.shot-row,
.candidate-shot {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.shot-row__time {
  color: #cbd6f3;
  font-size: 12px;
  font-weight: 700;
}

.asset-chip {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: #dfe7ff;
  font-size: 12px;
}

.model-item {
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: var(--web-text);
  text-align: left;
}

.model-item.is-active {
  border-color: rgba(124, 58, 237, 0.4);
  background: rgba(124, 58, 237, 0.14);
}

.section-subhead {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.variant-count {
  display: flex;
  align-items: center;
  gap: 8px;
}

.count-input {
  width: 84px;
}

.candidate-card,
.work-row {
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  display: grid;
  gap: 10px;
}

.candidate-card.is-active {
  border-color: rgba(0, 232, 255, 0.3);
  box-shadow: inset 0 0 0 1px rgba(0, 232, 255, 0.12);
}

.candidate-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.candidate-head small {
  color: var(--web-text-soft);
  font-size: 12px;
}

.work-row {
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) auto;
  align-items: center;
}

.work-row__meta,
.work-row__asset {
  display: grid;
  gap: 6px;
}

.work-row__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.danger-text {
  color: #ffb4ab;
}

.empty-panel {
  min-height: 180px;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 6px;
}

@media (max-width: 1240px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .stage-body--split,
  .work-row {
    grid-template-columns: 1fr;
  }

  .stage-summary-grid {
    grid-template-columns: 1fr 1fr;
  }

  .work-row__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 860px) {
  .detail-hero {
    flex-direction: column;
  }

  .stage-summary-grid {
    grid-template-columns: 1fr;
  }

  .candidate-head,
  .section-subhead {
    flex-direction: column;
  }
}
</style>
