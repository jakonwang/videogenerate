<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Check, Copy, Crosshair, Eye, FileCode2, Wand2, X } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useDesignInspectorStore } from '@/stores/designInspector'
import { getDesignInspectorNode } from '@/ui/design-inspector/design-inspector-map'

type OverlayRect = {
  top: number
  left: number
  width: number
  height: number
}

const route = useRoute()
const inspector = useDesignInspectorStore()
const { enabled, hoveredId, selectedId } = storeToRefs(inspector)
const isDevMode = import.meta.env.DEV

const hoverRect = ref<OverlayRect | null>(null)
const selectedRect = ref<OverlayRect | null>(null)
const copied = ref(false)
const panelRef = ref<HTMLElement | null>(null)
const promptRef = ref<HTMLTextAreaElement | null>(null)

const activeNode = computed(() => getDesignInspectorNode(selectedId.value || hoveredId.value, route.path))
const hoverNode = computed(() => getDesignInspectorNode(hoveredId.value, route.path))
const codexPrompt = computed(() => {
  const node = activeNode.value
  if (!node) return ''
  const classText = node.classes.length ? node.classes.join('、') : '无'
  const suggestText = node.suggestedEdits?.length ? node.suggestedEdits.join('；') : '请先按设计稿精修这个区域。'
  return [
    `请修改 ${node.label}。`,
    `designId: ${node.designId}`,
    `页面: ${node.routeScope}`,
    `组件: ${node.component}`,
    `文件: ${node.file}`,
    `关键类名: ${classText}`,
    `当前问题: 这里和设计稿不一致，请按设计稿继续精修，保持现有业务逻辑不变。`,
    `建议修改点: ${suggestText}`,
  ].join('\n')
})

let copiedTimer: number | null = null

function findDesignElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return null
  return target.closest('[data-design-id]') as HTMLElement | null
}

function readRect(el: HTMLElement | null) {
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

function refreshSelectionRect() {
  if (!selectedId.value) {
    selectedRect.value = null
    return
  }
  const el = document.querySelector(`[data-design-id="${selectedId.value}"]`) as HTMLElement | null
  selectedRect.value = readRect(el)
}

function clearHover() {
  inspector.setHoveredId(null)
  hoverRect.value = null
}

function onPointerMove(event: MouseEvent) {
  if (!enabled.value) return
  const el = findDesignElement(event.target)
  const nextId = el?.dataset.designId || null
  inspector.setHoveredId(nextId)
  hoverRect.value = readRect(el)
}

function onDocumentClick(event: MouseEvent) {
  if (!enabled.value) return
  if (panelRef.value && event.target instanceof Node && panelRef.value.contains(event.target)) {
    return
  }
  const el = findDesignElement(event.target)
  if (!el) {
    inspector.clearDesignSelection()
    selectedRect.value = null
    return
  }
  const designId = el.dataset.designId || null
  if (!designId) return
  inspector.selectDesignNode(designId)
  selectedRect.value = readRect(el)
  event.preventDefault()
  event.stopPropagation()
}

function onWindowRefresh() {
  if (hoveredId.value) {
    const el = document.querySelector(`[data-design-id="${hoveredId.value}"]`) as HTMLElement | null
    hoverRect.value = readRect(el)
  }
  refreshSelectionRect()
}

async function copyPromptForCodex() {
  if (!codexPrompt.value) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(codexPrompt.value)
    } else {
      throw new Error('clipboard unavailable')
    }
    copied.value = true
    if (copiedTimer) window.clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => {
      copied.value = false
    }, 1600)
  } catch {
    try {
      const textarea = promptRef.value
      if (!textarea) throw new Error('prompt textarea unavailable')
      textarea.focus()
      textarea.select()
      textarea.setSelectionRange(0, textarea.value.length)
      const ok = document.execCommand('copy')
      copied.value = ok
      if (ok) {
        if (copiedTimer) window.clearTimeout(copiedTimer)
        copiedTimer = window.setTimeout(() => {
          copied.value = false
        }, 1600)
      }
    } catch {
      copied.value = false
    }
  }
}

watch(enabled, (next) => {
  if (!next) {
    clearHover()
    inspector.clearDesignSelection()
    selectedRect.value = null
  }
})

watch(
  () => route.path,
  () => {
    clearHover()
    inspector.clearDesignSelection()
    selectedRect.value = null
  },
)

watch(selectedId, () => {
  refreshSelectionRect()
})

onMounted(() => {
  window.addEventListener('mousemove', onPointerMove, true)
  window.addEventListener('click', onDocumentClick, true)
  window.addEventListener('resize', onWindowRefresh, true)
  window.addEventListener('scroll', onWindowRefresh, true)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onPointerMove, true)
  window.removeEventListener('click', onDocumentClick, true)
  window.removeEventListener('resize', onWindowRefresh, true)
  window.removeEventListener('scroll', onWindowRefresh, true)
  if (copiedTimer) window.clearTimeout(copiedTimer)
})
</script>

<template>
  <div v-if="isDevMode && enabled" class="design-inspector">
    <div
      v-if="hoverRect"
      class="design-inspector__outline design-inspector__outline--hover"
      :style="{
        top: `${hoverRect.top}px`,
        left: `${hoverRect.left}px`,
        width: `${hoverRect.width}px`,
        height: `${hoverRect.height}px`,
      }"
    >
      <div v-if="hoverNode" class="design-inspector__tooltip">
        <strong>{{ hoverNode.label }}</strong>
        <span>{{ hoverNode.component }}</span>
      </div>
    </div>

    <div
      v-if="selectedRect"
      class="design-inspector__outline design-inspector__outline--selected"
      :style="{
        top: `${selectedRect.top}px`,
        left: `${selectedRect.left}px`,
        width: `${selectedRect.width}px`,
        height: `${selectedRect.height}px`,
      }"
    />

    <aside ref="panelRef" class="design-inspector__panel">
      <div class="design-inspector__panel-head">
        <div>
          <span>设计联调模式</span>
          <strong>{{ activeNode?.label || '点击页面中的标记区域' }}</strong>
        </div>
        <div class="design-inspector__panel-actions">
          <button
            type="button"
            class="design-inspector__copy"
            :disabled="!activeNode"
            @click="copyPromptForCodex"
          >
            <Check v-if="copied" class="h-4 w-4" />
            <Copy v-else class="h-4 w-4" />
            <span>{{ copied ? '已复制' : '复制给 Codex' }}</span>
          </button>
          <button type="button" @click="inspector.clearDesignSelection()">
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="design-inspector__panel-body">
        <div class="design-inspector__meta">
          <div class="design-inspector__meta-row">
            <Crosshair class="h-4 w-4" />
            <div>
              <label>designId</label>
              <strong>{{ selectedId || hoveredId || '--' }}</strong>
            </div>
          </div>
          <div class="design-inspector__meta-row">
            <Eye class="h-4 w-4" />
            <div>
              <label>组件</label>
              <strong>{{ activeNode?.component || '--' }}</strong>
            </div>
          </div>
          <div class="design-inspector__meta-row">
            <FileCode2 class="h-4 w-4" />
            <div>
              <label>文件</label>
              <a v-if="activeNode?.file" :href="activeNode.file">{{ activeNode.file }}</a>
              <strong v-else>--</strong>
            </div>
          </div>
        </div>

        <section class="design-inspector__section">
          <h4>发送给 Codex</h4>
          <textarea ref="promptRef" class="design-inspector__prompt" :value="codexPrompt" readonly />
        </section>

        <section class="design-inspector__section">
          <h4>关键类名</h4>
          <div class="design-inspector__chips">
            <span v-for="item in activeNode?.classes || []" :key="item">{{ item }}</span>
          </div>
        </section>

        <section class="design-inspector__section">
          <h4>区域说明</h4>
          <p>{{ activeNode?.notes || '当前没有选中区域。先点击 /clone 分析页或顶部工作栏的高亮块。' }}</p>
        </section>

        <section class="design-inspector__section">
          <h4>建议修改点</h4>
          <ul v-if="activeNode?.suggestedEdits?.length" class="design-inspector__list">
            <li v-for="item in activeNode.suggestedEdits" :key="item">{{ item }}</li>
          </ul>
          <p v-else>暂无建议。</p>
        </section>

        <section class="design-inspector__section">
          <h4>关注 Token</h4>
          <div class="design-inspector__chips">
            <span v-for="item in activeNode?.tokens || []" :key="item">{{ item }}</span>
          </div>
        </section>

        <section class="design-inspector__section">
          <h4>备注</h4>
          <div class="design-inspector__note-box">
            <Wand2 class="h-4 w-4" />
            <span>这里先做只读联调。后续可以继续加“本轮修改建议记录”。</span>
          </div>
        </section>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.design-inspector {
  position: fixed;
  inset: 0;
  z-index: 140;
  pointer-events: none;
}

.design-inspector__outline {
  position: fixed;
  border-radius: 16px;
  box-sizing: border-box;
}

.design-inspector__outline--hover {
  border: 1px solid rgba(34, 211, 238, 0.9);
  box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.3), 0 0 0 8px rgba(34, 211, 238, 0.08);
}

.design-inspector__outline--selected {
  border: 1px solid rgba(109, 93, 255, 1);
  box-shadow: 0 0 0 1px rgba(109, 93, 255, 0.36), 0 0 0 10px rgba(109, 93, 255, 0.1);
}

.design-inspector__tooltip {
  position: absolute;
  left: 0;
  top: -42px;
  display: grid;
  gap: 2px;
  min-width: 140px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(34, 211, 238, 0.22);
  background: rgba(6, 11, 22, 0.96);
  color: #f8fafc;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
}

.design-inspector__tooltip strong {
  font-size: 12px;
  font-weight: 700;
}

.design-inspector__tooltip span {
  color: #94a3b8;
  font-size: 10px;
}

.design-inspector__panel {
  position: fixed;
  top: 84px;
  right: 14px;
  bottom: 14px;
  width: 360px;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid rgba(109, 93, 255, 0.24);
  background: linear-gradient(180deg, rgba(9, 15, 28, 0.98), rgba(7, 12, 22, 0.98));
  box-shadow: 0 26px 70px rgba(0, 0, 0, 0.42);
  pointer-events: auto;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.design-inspector__panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.design-inspector__panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.design-inspector__panel-head span {
  color: #8b5cf6;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.design-inspector__panel-head strong {
  display: block;
  margin-top: 6px;
  color: #f8fafc;
  font-size: 15px;
  line-height: 1.35;
}

.design-inspector__panel-head button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(13, 23, 41, 0.56);
  color: #cbd5e1;
}

.design-inspector__copy {
  gap: 6px;
  width: auto !important;
  min-width: 110px;
  padding: 0 12px;
  color: #e9ddff !important;
  border-color: rgba(109, 93, 255, 0.28) !important;
  background: rgba(109, 93, 255, 0.12) !important;
}

.design-inspector__copy:disabled {
  opacity: 0.45;
}

.design-inspector__panel-body {
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 14px;
  padding: 14px 16px 18px;
}

.design-inspector__meta {
  display: grid;
  gap: 10px;
}

.design-inspector__meta-row {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(13, 23, 41, 0.42);
}

.design-inspector__meta-row label,
.design-inspector__section h4 {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.design-inspector__meta-row strong,
.design-inspector__meta-row a {
  display: block;
  margin-top: 4px;
  color: #f8fafc;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.design-inspector__section {
  display: grid;
  gap: 10px;
}

.design-inspector__section p,
.design-inspector__list li,
.design-inspector__note-box span {
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1.6;
}

.design-inspector__prompt {
  min-height: 140px;
  resize: vertical;
  width: 100%;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(13, 23, 41, 0.58);
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.6;
}

.design-inspector__list {
  display: grid;
  gap: 8px;
  padding-left: 18px;
  margin: 0;
}

.design-inspector__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.design-inspector__chips span {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(109, 93, 255, 0.18);
  background: rgba(109, 93, 255, 0.12);
  color: #ddd6fe;
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
}

.design-inspector__note-box {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(34, 211, 238, 0.14);
  background: rgba(34, 211, 238, 0.06);
}
</style>
