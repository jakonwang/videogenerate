<script setup lang="ts">
import type { StageItem } from './types'

defineProps<{
  loading: boolean
  stageItems: StageItem[]
  activeStageKey: string
  projectDisplayName: string
  analyzeTagList: string[]
  analyzeScore: number
  analyzeEngineRows: Array<{ label: string; value: string; status: string }>
  storyBeats: Array<{ id: string; purpose: string; productRole: string }>
  referenceSourcePath: string
  modelPreviewUrl: string
  modelName: string
  modelId: string
  currentProjectId: string
  durationText: string
  resolutionText: string
  uploadTimeText: string
  statusText: string
  localeText: string
  productThumbs: string[]
  stageLog: string
  queueCountText: string
  safeText: (value: unknown, fallback: string) => string
  shortPath: (value: string) => string
  mediaUrl: (value?: string) => string
  previewImage: (value?: string) => string
}>()

const emit = defineEmits<{
  'pick-reference': []
  'refresh-project': []
  'create-blueprint': []
  'select-stage': [key: string]
}>()

function beatTime(index: number) {
  return ['0-3s', '3-15s', '15-45s', '45-70s', '70-83s'][index] ?? '持续片段'
}
</script>

<template>
  <div class="clone-stage">
    <section class="stage-panel stage-panel--hero">
      <div class="stage-hero">
        <div>
          <div class="stage-eyebrow">Clone / Analyze</div>
          <h2>参考分析工作台</h2>
          <p>先锁定参考视频结构、爆款节奏和当前项目上下文，再进入后续脚本复刻。</p>
        </div>
        <div class="stage-actions">
          <button class="ghost-button small" type="button" :disabled="loading" @click="emit('refresh-project')">刷新状态</button>
          <button class="primary-button small" type="button" :disabled="loading" @click="emit('create-blueprint')">
            {{ loading ? '分析中' : '开始分析' }}
          </button>
        </div>
      </div>

      <div class="stage-rail">
        <button
          v-for="(item, index) in stageItems"
          :key="item.key"
          class="stage-rail__item"
          :class="{ 'is-active': activeStageKey === item.key, 'is-done': item.done }"
          type="button"
          @click="emit('select-stage', item.key)"
        >
          <span>{{ index + 1 }}</span>
          <strong>{{ item.title }}</strong>
          <small>{{ item.done ? '已完成' : item.active ? '进行中' : '待开始' }}</small>
        </button>
      </div>
    </section>

    <section class="stage-grid stage-grid--analyze">
      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>参考视频</h3>
            <p>上传主参考视频，系统将基于内容结构和节奏进行分析。</p>
          </div>
          <button class="ghost-button tiny" type="button" @click="emit('pick-reference')">更换视频</button>
        </div>

        <div class="video-preview">
          <video v-if="referenceSourcePath" :src="mediaUrl(referenceSourcePath)" controls preload="metadata"></video>
          <div v-else class="stage-empty">请先上传参考视频</div>
        </div>

        <div class="info-list">
          <div class="info-row">
            <span>文件</span>
            <strong>{{ safeText(shortPath(referenceSourcePath), '--') }}</strong>
          </div>
          <div class="info-row">
            <span>时长</span>
            <strong>{{ durationText }}</strong>
          </div>
          <div class="info-row">
            <span>分辨率</span>
            <strong>{{ resolutionText }}</strong>
          </div>
          <div class="info-row">
            <span>状态</span>
            <strong>{{ statusText }}</strong>
          </div>
        </div>
      </article>

      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>分析结果</h3>
            <p>中间区聚焦内容结构、脚本摘要与爆款评分。</p>
          </div>
          <div class="tab-strip">
            <button class="is-active" type="button">结构</button>
            <button type="button">节奏</button>
            <button type="button">情绪</button>
          </div>
        </div>

        <div class="beat-grid">
          <article v-for="(item, index) in storyBeats.slice(0, 5)" :key="item.id" class="beat-card">
            <small>{{ beatTime(index) }}</small>
            <strong>{{ safeText(item.purpose, '核心片段') }}</strong>
            <span>{{ safeText(item.productRole, '结构用途') }}</span>
          </article>
          <article v-if="!storyBeats.length" v-for="index in 5" :key="`placeholder-${index}`" class="beat-card beat-card--ghost">
            <small>{{ beatTime(index - 1) }}</small>
            <strong>等待分析结果</strong>
            <span>系统将回填脚本结构与角色目的</span>
          </article>
        </div>

        <div class="analysis-lower">
          <div class="script-snippet">
            <div class="panel-subhead">
              <strong>脚本识别摘要</strong>
              <small>{{ localeText }}</small>
            </div>
            <div class="snippet-list">
              <div v-for="(item, index) in storyBeats.slice(0, 5)" :key="`${item.id}-line`" class="snippet-row">
                <span>{{ beatTime(index) }}</span>
                <strong>{{ safeText(item.purpose, '识别片段') }}</strong>
              </div>
              <div v-if="!storyBeats.length" class="stage-empty stage-empty--inline">分析完成后会在这里展示识别到的脚本摘要。</div>
            </div>
          </div>

          <div class="score-card">
            <span>爆款评分</span>
            <div class="score-ring">
              <strong>{{ analyzeScore }}</strong>
            </div>
            <small>高潜力结构，可继续做脚本变体</small>
          </div>
        </div>
      </article>

      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>项目与资产</h3>
            <p>右侧只保留项目摘要、模特、素材和复刻模式。</p>
          </div>
        </div>

        <div class="info-list">
          <div class="info-row">
            <span>项目名称</span>
            <strong>{{ projectDisplayName }}</strong>
          </div>
          <div class="info-row">
            <span>项目 ID</span>
            <strong>{{ currentProjectId || 'Draft' }}</strong>
          </div>
          <div class="info-row">
            <span>地区 / 语言</span>
            <strong>{{ localeText }}</strong>
          </div>
          <div class="info-row">
            <span>上传时间</span>
            <strong>{{ uploadTimeText }}</strong>
          </div>
        </div>

        <div class="tag-list">
          <span v-for="tag in analyzeTagList" :key="tag">{{ tag }}</span>
        </div>

        <div class="linked-card">
          <img v-if="modelPreviewUrl" :src="modelPreviewUrl" alt="" />
          <div>
            <strong>{{ modelName || '未绑定模特' }}</strong>
            <small>{{ modelId || '请在分镜阶段绑定模特' }}</small>
          </div>
        </div>

        <div class="thumb-strip">
          <img v-for="item in productThumbs.slice(0, 4)" :key="item" :src="previewImage(item)" alt="" />
          <div v-if="!productThumbs.length" class="stage-empty stage-empty--inline">尚未关联产品素材</div>
        </div>
      </article>
    </section>

    <section class="stage-grid stage-grid--footer">
      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>任务队列</h3>
            <p>当前项目与阶段日志。</p>
          </div>
          <strong>{{ queueCountText }}</strong>
        </div>
        <div class="stage-log-card">{{ stageLog }}</div>
      </article>

      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>AI 引擎状态</h3>
            <p>透传展示当前 provider / model / capability。</p>
          </div>
        </div>
        <div class="info-list">
          <div v-for="item in analyzeEngineRows" :key="item.label" class="info-row">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }} · {{ item.status }}</strong>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>
