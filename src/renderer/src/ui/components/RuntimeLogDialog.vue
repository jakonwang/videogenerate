<script setup lang="ts">
import { computed, ref } from 'vue'

type RuntimeLogItem = {
  id: string
  level: 'info' | 'success' | 'error'
  message: string
  time: number
}

type RuntimeLogCategory = 'all' | 'generation' | 'export' | 'sync' | 'stage' | 'model' | 'error' | 'other'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    logs: RuntimeLogItem[]
    title?: string
    description?: string
    hint?: string
    fabLabel?: string
    emptyTitle?: string
    emptyDescription?: string
    showAll?: boolean
  }>(),
  {
    title: '运行日志',
    description: '实时查看提交日志、接口返回、阶段切换与错误信息。',
    hint: '',
    showAll: false,
    fabLabel: '运行日志',
    emptyTitle: '暂无日志',
    emptyDescription: '执行操作后，这里会显示最新的运行记录。',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const runtimeNoisePatterns = [/runtime console ready/i, /open export config dialog/i, /view item/i, /remove listing image/i, /refresh list$/i]

const cloneDebugNoisePatterns = [
  /\[clone-debug\]\s+repo-upsert-project/i,
  /\[clone-debug\]\s+stage-state/i,
]

const runtimeImportantPatterns = [
  /model-routing/i,
  /start generate/i,
  /retry/i,
  /generate/i,
  /export/i,
  /save export/i,
  /save item/i,
  /remove item/i,
  /error/i,
  /failed/i,
  /success/i,
  /completed/i,
]

function isImportantRuntimeLog(item: RuntimeLogItem) {
  const text = String(item.message || '').trim()
  if (!text) return false
  if (item.level === 'error' || item.level === 'success') return true
  if (runtimeNoisePatterns.some((pattern) => pattern.test(text))) return false
  if (cloneDebugNoisePatterns.some((pattern) => pattern.test(text))) return false
  return runtimeImportantPatterns.some((pattern) => pattern.test(text))
}

function resolveRuntimeCategory(item: RuntimeLogItem): Exclude<RuntimeLogCategory, 'all'> {
  const text = String(item.message || '').toLowerCase()
  if (item.level === 'error' || /error|failed|timeout|warning/.test(text)) return 'error'
  if (/model-routing|provider|profile|baseurl|model=/.test(text)) return 'model'
  if (/stage|step|retry/.test(text)) return 'stage'
  if (/export|excel/.test(text)) return 'export'
  if (/sync|upload|download|query/.test(text)) return 'sync'
  if (/generate|save item|remove item/.test(text)) return 'generation'
  return 'other'
}

const categoryOptions: Array<{ value: RuntimeLogCategory; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'generation', label: '生成' },
  { value: 'export', label: '导出' },
  { value: 'sync', label: '同步' },
  { value: 'stage', label: '阶段' },
  { value: 'model', label: '模型' },
  { value: 'error', label: '错误' },
  { value: 'other', label: '其他' },
]

const activeCategory = ref<RuntimeLogCategory>('all')
const importantLogs = computed(() =>
  (Array.isArray(props.logs) ? props.logs : []).filter((item) =>
    props.showAll ? Boolean(String(item.message || '').trim()) : isImportantRuntimeLog(item),
  ),
)
const visibleLogs = computed(() =>
  importantLogs.value.filter((item) => activeCategory.value === 'all' || resolveRuntimeCategory(item) === activeCategory.value),
)
const countLabel = computed(() => `${visibleLogs.value.length} 条`)

const categoryCountMap = computed(() => {
  const counts: Record<RuntimeLogCategory, number> = {
    all: importantLogs.value.length,
    generation: 0,
    export: 0,
    sync: 0,
    stage: 0,
    model: 0,
    error: 0,
    other: 0,
  }
  for (const item of importantLogs.value) {
    counts[resolveRuntimeCategory(item)] += 1
  }
  return counts
})

function openDialog() {
  emit('update:modelValue', true)
}

function closeDialog() {
  emit('update:modelValue', false)
}

function formatRuntimeTime(value: number) {
  const date = new Date(value)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function levelLabel(level: RuntimeLogItem['level']) {
  if (level === 'error') return '错误'
  if (level === 'success') return '成功'
  return '日志'
}

function extractField(text: string, key: string) {
  const match = text.match(new RegExp(`${key}=([^\\s]+)`))
  return match?.[1] || ''
}

function extractJsonValue(text: string, key: string) {
  const match = text.match(new RegExp(`"${key}"\\s*:\\s*("([^"]*)"|\\d+|true|false|null)`))
  if (!match) return ''
  return String(match[2] ?? match[1] ?? '').replace(/^"|"$/g, '')
}

function resolveRuntimeAction(item: RuntimeLogItem) {
  const text = String(item.message || '').toLowerCase()
  if (item.level === 'error') return '失败'
  if (text.includes('model-routing')) return '模型'
  if (text.includes('export')) return '导出'
  if (text.includes('retry')) return '重试'
  if (text.includes('stage')) return '阶段'
  if (text.includes('generate')) return '生成'
  if (item.level === 'success') return '完成'
  return '日志'
}

function formatRuntimeMessage(message: string) {
  const text = String(message || '').replace(/\u001b\[[0-9;]*m/g, '').trim()
  if (!text) return ''

  if (cloneDebugNoisePatterns.some((pattern) => pattern.test(text))) return ''

  if (text.includes('tiktok-listing-model-routing')) {
    const provider = extractJsonValue(text, 'provider') || '未知平台'
    const model = extractJsonValue(text, 'model') || '未知模型'
    return `模型路由已确认，当前使用 ${provider} / ${model}`
  }
  if (text.includes('[tiktok-listing] start generate')) {
    const sku = extractField(text, 'sku')
    return sku ? `开始为 SKU ${sku} 生成标题并准备商品图` : '开始生成商品标题并准备商品图'
  }
  if (text.includes('[tiktok-listing] stage title')) {
    const sku = extractField(text, 'sku')
    return sku ? `正在为 SKU ${sku} 生成标题` : '正在生成标题'
  }
  if (text.includes('[tiktok-listing] stage analysis-board')) {
    const sku = extractField(text, 'sku')
    return sku ? `正在为 SKU ${sku} 生成临时多角度图` : '正在生成临时多角度图'
  }
  if (text.includes('[tiktok-listing] stage images')) {
    const sku = extractField(text, 'sku')
    return sku ? `正在为 SKU ${sku} 生成商品图` : '正在生成商品图'
  }
  if (text.includes('[tiktok-listing] stage description-html')) {
    const sku = extractField(text, 'sku')
    return sku ? `正在为 SKU ${sku} 拼接 HTML 图片描述` : '正在拼接 HTML 图片描述'
  }
  if (text.includes('[tiktok-listing] retry title')) {
    const sku = extractField(text, 'sku')
    const attempt = extractField(text, 'attempt')
    return sku ? `SKU ${sku} 标题生成失败，正在第 ${attempt} 次重试` : `标题生成失败，正在第 ${attempt} 次重试`
  }
  if (text.includes('[tiktok-listing] retry analysis-board')) {
    const sku = extractField(text, 'sku')
    const attempt = extractField(text, 'attempt')
    return sku ? `SKU ${sku} 临时多角度图生成失败，正在第 ${attempt} 次重试` : `临时多角度图生成失败，正在第 ${attempt} 次重试`
  }
  if (text.includes('[tiktok-listing] retry images')) {
    const sku = extractField(text, 'sku')
    const attempt = extractField(text, 'attempt')
    return sku ? `SKU ${sku} 商品图生成失败，正在第 ${attempt} 次重试` : `商品图生成失败，正在第 ${attempt} 次重试`
  }
  if (text.includes('[tiktok-listing] save item sku=')) {
    const sku = extractField(text, 'sku')
    return sku ? `商品记录已保存，SKU：${sku}` : '商品记录已保存'
  }
  if (text.includes('[tiktok-listing] remove item completed')) {
    const sku = extractField(text, 'sku')
    return sku ? `商品记录已删除，SKU：${sku}` : '商品记录已删除'
  }
  if (text.includes('[tiktok-listing] export excel path=')) return 'Excel 模板导出成功'
  if (text.includes('[tiktok-listing] save export category configs')) return '导出分类配置已保存'

  return text.replace(/^\[[^\]]+\]\s*/, '')
}
</script>

<template>
  <button class="runtime-fab" type="button" @click="openDialog">
    <span class="runtime-fab__dot" :class="{ active: visibleLogs.length > 0 }"></span>
    <span>{{ fabLabel }}</span>
    <strong>{{ visibleLogs.length }}</strong>
  </button>

  <div v-if="modelValue" class="runtime-dialog">
    <button class="runtime-dialog__backdrop" type="button" @click="closeDialog"></button>
    <div class="runtime-dialog__panel">
      <div class="runtime-dialog__head">
        <div>
          <strong>{{ title }}</strong>
          <p>{{ description }}</p>
        </div>
        <button class="runtime-dialog__close" type="button" @click="closeDialog">关闭</button>
      </div>

      <div class="runtime-summary">
        <span class="runtime-summary__count">{{ countLabel }}</span>
        <span v-if="hint" class="runtime-summary__hint">{{ hint }}</span>
      </div>

      <div class="runtime-filters">
        <button
          v-for="option in categoryOptions"
          :key="option.value"
          class="runtime-filter-chip"
          :class="{ 'runtime-filter-chip--active': activeCategory === option.value }"
          type="button"
          @click="activeCategory = option.value"
        >
          <span>{{ option.label }}</span>
          <strong>{{ categoryCountMap[option.value] }}</strong>
        </button>
      </div>

      <div class="runtime-log-board">
        <div v-if="visibleLogs.length" class="runtime-log-list">
          <article v-for="item in visibleLogs" :key="item.id" class="runtime-log-card" :class="`runtime-log-card--${item.level}`">
            <div class="runtime-log-card__meta">
              <div class="runtime-log-card__badges">
                <span class="runtime-log-card__badge">{{ resolveRuntimeAction(item) }}</span>
                <span class="runtime-log-card__badge runtime-log-card__badge--level">{{ levelLabel(item.level) }}</span>
              </div>
              <time>{{ formatRuntimeTime(item.time) }}</time>
            </div>
            <p>{{ formatRuntimeMessage(item.message) }}</p>
          </article>
        </div>

        <div v-else class="runtime-empty">
          <strong>{{ emptyTitle }}</strong>
          <p>{{ emptyDescription }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.runtime-fab {
  position: fixed;
  right: 24px;
  bottom: 28px;
  z-index: 60;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 14px;
  border: 1px solid rgba(126, 146, 255, 0.22);
  border-radius: 999px;
  background: rgba(10, 15, 28, 0.94);
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.28);
  color: #f4f7ff;
  backdrop-filter: blur(14px);
}

.runtime-fab strong {
  min-width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(124, 92, 255, 0.24);
  color: #cdbfff;
  font-size: 11px;
  font-weight: 800;
}

.runtime-fab__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.8);
  box-shadow: 0 0 0 5px rgba(148, 163, 184, 0.12);
}

.runtime-fab__dot.active {
  background: #34d399;
  box-shadow: 0 0 0 5px rgba(52, 211, 153, 0.14);
}

.runtime-dialog {
  position: fixed;
  inset: 0;
  z-index: 150;
}

.runtime-dialog__backdrop {
  position: absolute;
  inset: 0;
  border: none;
  background: rgba(4, 8, 16, 0.62);
  backdrop-filter: blur(8px);
}

.runtime-dialog__panel {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  width: min(720px, calc(100vw - 40px));
  height: min(720px, calc(100vh - 56px));
  margin: 28px 20px 28px auto;
  padding: 18px 18px 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(10, 16, 30, 0.98), rgba(7, 12, 24, 0.98));
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.42);
  overflow: hidden;
}

.runtime-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 14px;
}

.runtime-dialog__head strong {
  display: block;
  color: #ffffff;
  font-size: 16px;
  font-weight: 800;
}

.runtime-dialog__head p {
  margin: 6px 0 0;
  color: rgba(207, 215, 232, 0.72);
  font-size: 12px;
  line-height: 1.6;
}

.runtime-dialog__close {
  min-width: 72px;
  height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: #f4f7ff;
  font-size: 12px;
  font-weight: 700;
}

.runtime-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: rgba(207, 215, 232, 0.74);
  font-size: 12px;
}

.runtime-summary__count {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(124, 92, 255, 0.2);
  background: rgba(124, 92, 255, 0.12);
  color: #d7ccff;
  font-weight: 700;
}

.runtime-summary__hint {
  color: rgba(161, 173, 198, 0.74);
}

.runtime-filters {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  margin-bottom: 12px;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
}

.runtime-filter-chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(226, 232, 240, 0.88);
  font-size: 12px;
}

.runtime-filter-chip strong {
  min-width: 18px;
  color: rgba(255, 255, 255, 0.96);
  font-size: 11px;
  font-weight: 800;
  text-align: center;
}

.runtime-filter-chip--active {
  border-color: rgba(124, 92, 255, 0.24);
  background: rgba(124, 92, 255, 0.14);
  color: #f4edff;
}

.runtime-log-board {
  min-height: 0;
  height: 100%;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 18px;
  background: rgba(16, 22, 38, 0.72);
  overflow: hidden;
}

.runtime-log-list {
  display: grid;
  gap: 10px;
  height: 100%;
  padding: 14px;
  overflow: auto;
}

.runtime-log-card {
  display: grid;
  gap: 10px;
  padding: 12px 13px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
}

.runtime-log-card--success {
  border-color: rgba(52, 211, 153, 0.2);
  background: rgba(16, 185, 129, 0.08);
}

.runtime-log-card--error {
  border-color: rgba(248, 113, 113, 0.22);
  background: rgba(239, 68, 68, 0.08);
}

.runtime-log-card--info {
  border-color: rgba(96, 165, 250, 0.16);
}

.runtime-log-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.runtime-log-card__badges {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.runtime-log-card__meta time {
  color: rgba(161, 173, 198, 0.76);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.runtime-log-card__badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #eef2ff;
  font-size: 11px;
  font-weight: 700;
}

.runtime-log-card__badge--level {
  background: rgba(124, 92, 255, 0.12);
  color: #d9cdff;
}

.runtime-log-card p {
  margin: 0;
  color: #eef2ff;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.runtime-empty {
  display: grid;
  place-content: center;
  gap: 8px;
  height: 100%;
  padding: 24px;
  text-align: center;
}

.runtime-empty strong {
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
}

.runtime-empty p {
  margin: 0;
  color: rgba(177, 188, 208, 0.72);
  font-size: 12px;
  line-height: 1.7;
}

@media (max-width: 1024px) {
  .runtime-fab {
    right: 14px;
    bottom: 16px;
  }

  .runtime-dialog__panel {
    width: calc(100vw - 24px);
    height: calc(100vh - 24px);
    margin: 12px;
    padding: 16px 14px 14px;
  }

  .runtime-dialog__head,
  .runtime-summary {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
