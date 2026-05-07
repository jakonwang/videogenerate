<script setup lang="ts">
import type { StageItem } from './types'

type VariantCard = {
  id: string
  rank: string
  title: string
  summary: string
  scoreLabel: number
  metrics: Array<{ label: string; value: number }>
}

defineProps<{
  loading: boolean
  currentProjectId: string
  stageItems: StageItem[]
  activeStageKey: string
  selectedVariantId: string
  selectedVariantTitle: string
  variantCards: VariantCard[]
  variantSuggestionList: string[]
  variantReferenceLines: Array<{ time: string; text: string }>
  variantAiStructureRefs: Array<{ title: string; usage: string }>
  languageText: string
}>()

const emit = defineEmits<{
  'refresh-project': []
  'generate-variants': []
  'select-variant': [variantId: string]
  'select-stage': [key: string]
}>()
</script>

<template>
  <div class="clone-stage">
    <section class="stage-panel stage-panel--hero">
      <div class="stage-hero">
        <div>
          <div class="stage-eyebrow">Clone / Variant</div>
          <h2>脚本变体评分工作台</h2>
          <p>左侧配置生成方向，中间比较版本评分，右侧用参考脚本和结构模板做决策。</p>
        </div>
        <div class="stage-actions">
          <button class="ghost-button small" type="button" :disabled="loading" @click="emit('refresh-project')">刷新状态</button>
          <button class="primary-button small" type="button" :disabled="loading || !currentProjectId" @click="emit('generate-variants')">
            {{ loading ? '生成中' : variantCards.length ? '重新生成' : '开始生成' }}
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

    <section class="stage-grid stage-grid--variant">
      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>参数配置</h3>
            <p>脚本模式、生成方向、高级项和 AI 灵感建议。</p>
          </div>
        </div>

        <div class="tab-strip">
          <button class="is-active" type="button">智能生成</button>
          <button type="button">自定义主题</button>
          <button type="button">导入文案</button>
        </div>

        <div class="soft-card">
          <div class="panel-subhead">
            <strong>生成方向</strong>
            <small>{{ languageText }}</small>
          </div>
          <p>围绕参考视频提炼高转化脚本版本，优先保留强钩子、场景展示和明确转化收口。</p>
        </div>

        <div class="info-list">
          <div class="info-row"><span>目标人群</span><strong>18-35 岁女性</strong></div>
          <div class="info-row"><span>视频时长</span><strong>60-90s</strong></div>
          <div class="info-row"><span>风格语气</span><strong>轻快 / 种草 / 专业</strong></div>
          <div class="info-row"><span>卖点焦点</span><strong>场景感 / 对比感 / 转化力</strong></div>
        </div>

        <div class="soft-card">
          <div class="panel-subhead">
            <strong>AI 灵感推荐</strong>
          </div>
          <div class="bullet-list">
            <div v-for="item in variantSuggestionList" :key="item" class="bullet-item">{{ item }}</div>
          </div>
        </div>
      </article>

      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>脚本版本列表</h3>
            <p>版本对比、推荐位和评分条都集中在中间工作区。</p>
          </div>
          <div class="tab-strip">
            <button class="is-active" type="button">全部版本</button>
            <button type="button">收藏</button>
          </div>
        </div>

        <div v-if="!variantCards.length" class="stage-empty stage-empty--large">脚本版本尚未生成，点击右上角主按钮开始生成。</div>

        <div v-else class="variant-card-list">
          <article
            v-for="item in variantCards"
            :key="item.id"
            class="variant-score-card"
            :class="{ 'is-selected': selectedVariantId === item.id }"
          >
            <div class="variant-score-card__main">
              <div>
                <div class="panel-subhead panel-subhead--between">
                  <strong>{{ item.title || `脚本版本 ${item.rank}` }}</strong>
                  <span v-if="selectedVariantId === item.id" class="status-chip status-chip--primary">已选中</span>
                </div>
                <p>{{ item.summary }}</p>
              </div>
              <div class="score-ring score-ring--small">
                <strong>{{ item.scoreLabel }}</strong>
              </div>
            </div>

            <div class="metric-list">
              <div v-for="metric in item.metrics" :key="metric.label" class="metric-row">
                <span>{{ metric.label }}</span>
                <div><em :style="{ width: `${metric.value}%` }"></em></div>
                <strong>{{ metric.value }}</strong>
              </div>
            </div>

            <div class="card-actions">
              <button class="ghost-button tiny" type="button">预览</button>
              <button class="primary-button tiny" type="button" :disabled="loading" @click="emit('select-variant', item.id)">应用</button>
              <button class="ghost-button tiny" type="button">收藏</button>
            </div>
          </article>
        </div>
      </article>

      <article class="stage-panel">
        <div class="panel-head">
          <div>
            <h3>分析参考</h3>
            <p>雷达位、参考脚本片段和热门结构模板。</p>
          </div>
        </div>

        <div class="soft-card">
          <div class="panel-subhead">
            <strong>AI 脚本分析</strong>
            <small>{{ selectedVariantTitle || '等待选择版本' }}</small>
          </div>
          <div class="radar-shell">
            <div class="radar-shell__core"></div>
          </div>
        </div>

        <div class="soft-card">
          <div class="panel-subhead">
            <strong>参考视频脚本片段</strong>
          </div>
          <div class="snippet-list">
            <div v-for="item in variantReferenceLines" :key="`${item.time}-${item.text}`" class="snippet-row">
              <span>{{ item.time }}</span>
              <strong>{{ item.text }}</strong>
            </div>
          </div>
        </div>

        <div class="soft-card">
          <div class="panel-subhead">
            <strong>热门结构模板</strong>
          </div>
          <div class="bullet-list">
            <div v-for="item in variantAiStructureRefs" :key="item.title" class="bullet-item bullet-item--between">
              <span>{{ item.title }}</span>
              <strong>{{ item.usage }}</strong>
            </div>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>
