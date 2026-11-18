<script setup lang="ts">
/**
 * 视频批量字幕（网页版，按电脑端 VideoBatchSubtitleView）：选择素材 → 配置标题 → 实时预览 → 批量渲染。
 * 标题按样式画成透明图（预览和成片是同一张），云端叠到每条视频上；另保留「AI 识别口播字幕」。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle2, ChevronLeft, Film, Loader2, Play, Save, Upload, X } from 'lucide-vue-next'
import type { VideoJobOptions } from '@shared/cloud/videoTools'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import AssetPickerDialog from '@/components/web/AssetPickerDialog.vue'
import ToolBatchHistory from '@/components/web/ToolBatchHistory.vue'
import { formatDuration, uploadVideo, type AssetItem } from '@/lib/assets'
import { CAPTION_PRESETS, captionBlob, defaultCaptionStyle, drawCaption, type CaptionStyle } from '@/lib/caption'
import { uploadRaw } from '@/lib/files'
import { useGenerations } from '@/lib/generate'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'
import { runVideoBatch, startToolPolling, useToolRuns } from '@/lib/videoTools'

type Source = { fileId: string; name: string; durationSec?: number; width?: number; height?: number; posterFileId?: string }
type Strategy = 'single_for_all' | 'random_pool' | 'speech'

const router = useRouter()
const runs = useToolRuns('subtitle')
const library = useGenerations((item) => item.kind === 'video' && item.status === 'succeeded' && Boolean(item.outputFileId))
onMounted(startToolPolling)

/* ---------------------------------------------------------------- 草稿（和电脑端「保存配置」一样，记在这台电脑的浏览器里） */
const DRAFT_KEY = 'tiktokcut:web-subtitle-draft'
const style = reactive<CaptionStyle>(defaultCaptionStyle())
const strategy = ref<Strategy>('single_for_all')
const titleText = ref('')
const titlePoolText = ref('')
const overrides = reactive<Record<string, string>>({})
const speechLanguage = ref('')
const selectedPreset = ref('')
try {
  const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
  if (saved) {
    Object.assign(style, saved.style ?? {})
    strategy.value = saved.strategy ?? strategy.value
    titleText.value = saved.titleText ?? ''
    titlePoolText.value = saved.titlePoolText ?? ''
    selectedPreset.value = saved.preset ?? ''
  }
} catch {
  // first visit / storage unavailable
}
function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ style: { ...style }, strategy: strategy.value, titleText: titleText.value, titlePoolText: titlePoolText.value, preset: selectedPreset.value }))
    toast('配置已保存')
  } catch {
    toast('浏览器不允许保存，下次需要重新设置')
  }
}
function applyPreset(id: string) {
  const preset = CAPTION_PRESETS.find((p) => p.id === id)
  if (!preset) return
  Object.assign(style, preset.style)
  selectedPreset.value = id
}

/* ---------------------------------------------------------------- 1 素材 */
const sourceTab = ref<'upload' | 'clone'>('upload')
const sources = ref<Source[]>([])
const selectedId = ref('')
const uploading = ref(0)
const picking = ref(false)
const fileInput = ref<HTMLInputElement>()
const dragging = ref(false)
const PAGE = 8
const page = ref(1)
const pageCount = computed(() => Math.max(1, Math.ceil(sources.value.length / PAGE)))
const pagedSources = computed(() => sources.value.slice((page.value - 1) * PAGE, page.value * PAGE))
watch(sources, () => {
  if (!sources.value.some((s) => s.fileId === selectedId.value)) selectedId.value = sources.value[0]?.fileId ?? ''
  page.value = Math.min(page.value, pageCount.value)
})
function addSource(source: Source) {
  if (sources.value.some((s) => s.fileId === source.fileId)) return
  sources.value = [...sources.value, source]
}
async function addFiles(files: File[]) {
  for (const file of files) {
    uploading.value += 1
    try {
      addSource(await uploadVideo(file))
    } catch (error) {
      toast(errorMessage(error))
    } finally {
      uploading.value -= 1
    }
  }
}
function onFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? [])
  ;(event.target as HTMLInputElement).value = ''
  void addFiles(files)
}
function onDrop(event: DragEvent) {
  dragging.value = false
  void addFiles(Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('video/')))
}
function toggleAsset(item: AssetItem) {
  if (sources.value.some((s) => s.fileId === item.fileId)) sources.value = sources.value.filter((s) => s.fileId !== item.fileId)
  else addSource({ fileId: item.fileId, name: item.name, durationSec: item.durationSec, width: item.width, height: item.height, posterFileId: item.posterFileId })
}
const pickedLibrary = ref<string[]>([])
function toggleLibrary(fileId: string) {
  pickedLibrary.value = pickedLibrary.value.includes(fileId) ? pickedLibrary.value.filter((id) => id !== fileId) : [...pickedLibrary.value, fileId]
}
function applyLibrary() {
  for (const item of library.value.filter((g) => pickedLibrary.value.includes(g.outputFileId!))) addSource({ fileId: item.outputFileId!, name: item.label || '成片', posterFileId: undefined })
  pickedLibrary.value = []
  sourceTab.value = 'upload'
}
function removeSource(fileId: string) {
  sources.value = sources.value.filter((s) => s.fileId !== fileId)
  delete overrides[fileId]
}

/* ---------------------------------------------------------------- 2 标题 */
const pool = computed(() => titlePoolText.value.split('\n').map((t) => t.trim()).filter(Boolean))
function titleFor(source: Source, index = 0) {
  if (strategy.value === 'random_pool') return pool.value.length ? pool.value[index % pool.value.length]! : ''
  return (overrides[source.fileId] ?? '').trim() || titleText.value.trim()
}

/* ---------------------------------------------------------------- 3 预览 */
const previewMode = ref<'fast' | 'video'>('fast')
const previewSource = computed(() => sources.value.find((s) => s.fileId === selectedId.value) ?? sources.value[0] ?? null)
const aspectOf = (s: Source | null) => (s?.width && s.height ? s.width / s.height : 9 / 16)
const previewTitle = computed(() => (previewSource.value ? (strategy.value === 'random_pool' ? pool.value[0] ?? '' : titleFor(previewSource.value)) : ''))
const overlayUrl = ref('')
let overlayTimer = 0
watch(
  [previewTitle, () => ({ ...style }), previewSource, strategy],
  () => {
    window.clearTimeout(overlayTimer)
    overlayTimer = window.setTimeout(() => {
      overlayUrl.value = strategy.value === 'speech' || !previewTitle.value ? '' : drawCaption(previewTitle.value, style, aspectOf(previewSource.value)).toDataURL('image/png')
    }, 120)
  },
  { deep: true, immediate: true },
)

/* ---------------------------------------------------------------- 4 渲染 */
const rendering = ref(false)
const stepStates = computed(() => {
  const hasSources = sources.value.length > 0
  const configured = strategy.value === 'speech' || (strategy.value === 'random_pool' ? pool.value.length > 0 : sources.value.some((s) => titleFor(s)))
  const running = runs.value.some((r) => r.status === 'queued' || r.status === 'running')
  return { source: hasSources ? 'done' : 'active', config: !hasSources ? 'idle' : configured ? 'done' : 'active', preview: configured && hasSources ? (overlayUrl.value || strategy.value === 'speech' ? 'done' : 'active') : 'idle', render: running ? 'active' : runs.value.length ? 'done' : 'idle' }
})
const kpis = computed(() => {
  const batches = new Set(runs.value.map((r) => r.batchId || r.id)).size
  return [
    { label: '草稿 / 全部任务', value: String(batches).padStart(2, '0') },
    { label: '处理中', value: String(runs.value.filter((r) => r.status === 'queued' || r.status === 'running').length).padStart(2, '0') },
    { label: '成功输出', value: String(runs.value.filter((r) => r.status === 'succeeded').length).padStart(2, '0') },
  ]
})
async function render() {
  if (!sources.value.length || rendering.value) return
  rendering.value = true
  try {
    if (strategy.value === 'speech') {
      const options: VideoJobOptions = { language: speechLanguage.value || undefined, position: style.position === 'center' ? 'middle' : 'bottom' }
      await runVideoBatch('subtitle', sources.value.map((s) => ({ fileId: s.fileId, name: s.name, options })), '自动字幕')
    } else {
      const missing = sources.value.filter((s, i) => !titleFor(s, i))
      if (missing.length) return toast(`有 ${missing.length} 条视频未设置标题`)
      const items: Array<{ fileId: string; name: string; options: VideoJobOptions }> = []
      for (const [index, source] of sources.value.entries()) {
        const blob = await captionBlob(titleFor(source, index), style, aspectOf(source))
        const image = await uploadRaw(blob, 'image/png')
        items.push({ fileId: source.fileId, name: source.name, options: { logoFileId: image.fileId, fullFrame: true, opacity: 1, text: titleFor(source, index) } })
      }
      await runVideoBatch('subtitle', items, (video) => `标题：${(items.find((i) => i.name === video.name)?.options.text ?? '').slice(0, 20)}`, { jobKind: 'watermark' })
    }
    toast(`已开始批量渲染 ${sources.value.length} 条`)
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    rendering.value = false
  }
}
const rightTab = ref<'content' | 'style'>('content')
</script>

<template>
  <main class="sub-page" data-testid="web-batch-subtitle">
    <section class="glass-panel hero-panel">
      <button class="vg-icon-btn" type="button" title="返回工具箱" @click="router.push('/toolbox')"><ChevronLeft :size="18" /></button>
      <div class="hero-copy"><h1>视频批量字幕</h1><p>批量导入素材，实时预览字幕效果并输出可发布成片。</p></div>
      <div class="hero-kpis"><div v-for="item in kpis" :key="item.label" class="hero-kpi"><strong>{{ item.value }}</strong><span>{{ item.label }}</span></div></div>
    </section>

    <section class="glass-panel stepbar">
      <div v-for="(step, i) in ([['source', '选择素材'], ['config', '配置标题'], ['preview', '实时预览'], ['render', '批量渲染']] as const)" :key="step[0]" class="step-chip" :class="`is-${stepStates[step[0]]}`">
        <span class="step-chip__index">{{ i + 1 }}</span><strong>{{ step[1] }}</strong><CheckCircle2 v-if="stepStates[step[0]] === 'done'" :size="16" class="step-chip__done" />
      </div>
    </section>

    <section class="workspace-grid">
      <!-- 1 素材 -->
      <article class="glass-panel work-card">
        <div class="section-heading"><div><span class="section-kicker">Source Intake</span><strong>素材选择</strong></div><span class="section-note">支持大批量导入，列表分页显示</span></div>
        <div class="segmented-tabs">
          <button :class="{ 'is-active': sourceTab === 'upload' }" type="button" @click="sourceTab = 'upload'">本地上传</button>
          <button :class="{ 'is-active': sourceTab === 'clone' }" type="button" @click="sourceTab = 'clone'">成片库选择</button>
        </div>
        <div v-if="sourceTab === 'upload'" class="upload-zone" :class="{ 'is-drag': dragging }" @click="fileInput?.click()" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
          <div class="upload-zone__icon"><Loader2 v-if="uploading" :size="26" class="vg-spin" /><Upload v-else :size="26" /></div>
          <strong>{{ uploading ? `正在上传 ${uploading} 个视频` : '点击或拖拽视频到这里' }}</strong>
          <span>支持 mp4 / mov / m4v / webm</span>
          <button class="minor-button" type="button" @click.stop="picking = true">从素材库选择视频</button>
          <input ref="fileInput" type="file" accept="video/*" multiple hidden data-testid="sub-video-input" @change="onFiles" />
        </div>
        <div v-else class="clone-picker">
          <div class="picker-tip"><p>从作品库复用成片，适合批量做统一封面标题字幕。</p><button class="minor-button minor-button--full" type="button" :disabled="!pickedLibrary.length" @click="applyLibrary">应用已选成片到当前任务（{{ pickedLibrary.length }}）</button></div>
          <div class="clone-picker__list">
            <button v-for="item in library" :key="item.id" class="clone-picker__item" :class="{ 'is-selected': pickedLibrary.includes(item.outputFileId!) }" type="button" @click="toggleLibrary(item.outputFileId!)">
              <span class="clone-picker__thumb"><Film :size="16" /></span>
              <span class="clone-picker__copy"><strong>{{ item.label || '未命名成片' }}</strong><small>{{ item.productName || '作品库' }}</small></span>
            </button>
            <p v-if="!library.length" class="vg-muted">作品库里还没有成片</p>
          </div>
        </div>
        <div class="card-head"><strong>已选视频 {{ sources.length }}</strong><button class="text-button" type="button" @click="sources = []">清空</button></div>
        <div class="sources-list">
          <button v-for="item in pagedSources" :key="item.fileId" class="source-list-item" :class="{ 'is-active': previewSource?.fileId === item.fileId }" type="button" data-testid="sub-source" @click="selectedId = item.fileId">
            <span class="source-thumb"><CloudImage v-if="item.posterFileId" :file-id="item.posterFileId" /><Film v-else :size="16" /></span>
            <span class="source-list-item__copy"><strong>{{ item.name }}</strong><small>{{ formatDuration(item.durationSec || 0) || '--' }} · {{ item.width || 1080 }}×{{ item.height || 1920 }}</small></span>
            <span class="source-list-item__remove" @click.stop="removeSource(item.fileId)"><X :size="15" /></span>
          </button>
        </div>
        <div v-if="sources.length > PAGE" class="source-pager"><span>第 {{ page }} / {{ pageCount }} 页</span><div><button class="toolbar-pill" type="button" :disabled="page <= 1" @click="page -= 1">上一页</button><button class="toolbar-pill" type="button" :disabled="page >= pageCount" @click="page += 1">下一页</button></div></div>
        <div class="capacity-card">
          <div class="capacity-head"><span>素材队列概览</span><strong>{{ sources.length }} 条</strong></div>
          <div class="capacity-bar"><div :style="{ width: `${Math.min(100, sources.length)}%` }"></div></div>
          <p>预览与列表只聚焦当前页和当前选中项，适合几百条素材连续排队渲染。</p>
        </div>
      </article>

      <!-- 3 预览 -->
      <article class="glass-panel work-card preview-card">
        <div class="card-head">
          <div><span class="section-kicker">Live Preview</span><strong>9:16 预览舞台</strong></div>
          <div class="preview-toolbar">
            <span class="toolbar-pill is-active">9:16</span>
            <button class="toolbar-pill" :class="{ 'is-active': previewMode === 'fast' }" type="button" @click="previewMode = 'fast'">快速预览</button>
            <button class="toolbar-pill" :class="{ 'is-active': previewMode === 'video' }" type="button" @click="previewMode = 'video'">真实视频预览</button>
          </div>
        </div>
        <div class="preview-stage">
          <div class="preview-stage__frame" :style="{ aspectRatio: String(aspectOf(previewSource)) }">
            <template v-if="previewSource">
              <CloudVideo v-if="previewMode === 'video'" :key="previewSource.fileId" :file-id="previewSource.fileId" controls muted class="preview-stage__media" />
              <CloudImage v-else-if="previewSource.posterFileId" :file-id="previewSource.posterFileId" class="preview-stage__media" />
              <div v-else class="preview-stage__blank"></div>
              <img v-if="overlayUrl" :src="overlayUrl" class="preview-stage__overlay" alt="" data-testid="sub-overlay" />
            </template>
            <div v-else class="preview-stage__empty"><strong>等待生成预览</strong><span>先选中一个视频并输入标题</span></div>
          </div>
        </div>
        <p class="preview-note">{{ previewSource ? (strategy === 'speech' ? 'AI 识别口播字幕在渲染时生成，这里只显示原视频。' : previewMode === 'video' ? '当前为真实视频预览，标题和成片完全一致。' : '当前为快速预览，优先保证大批量任务下的页面流畅度。') : '尚未选择视频' }}</p>
        <div class="render-bar">
          <button class="ghost-button" type="button" @click="saveDraft"><Save :size="15" /> 保存配置</button>
          <button class="primary-button" type="button" data-testid="sub-render" :disabled="!sources.length || rendering || uploading > 0" @click="render">
            <Loader2 v-if="rendering" :size="15" class="vg-spin" /><Play v-else :size="15" /> {{ rendering ? '批量渲染中…' : `开始批量渲染（${sources.length} 条）` }}
          </button>
        </div>
      </article>

      <!-- 2 标题与样式 -->
      <article class="glass-panel work-card">
        <div class="section-heading"><div><span class="section-kicker">Control Panel</span><strong>标题与样式面板</strong></div></div>
        <div class="segmented-tabs">
          <button :class="{ 'is-active': rightTab === 'content' }" type="button" @click="rightTab = 'content'">字幕内容</button>
          <button :class="{ 'is-active': rightTab === 'style' }" type="button" @click="rightTab = 'style'">样式设置</button>
        </div>
        <template v-if="rightTab === 'content'">
          <section class="form-section">
            <div class="section-heading"><div><span class="section-kicker">Title Mode</span><strong>标题配置</strong></div></div>
            <div class="strategy-grid">
              <button class="strategy-card" :class="{ 'is-active': strategy === 'single_for_all' }" type="button" @click="strategy = 'single_for_all'"><strong>统一标题</strong><small>整批视频共用同一条标题。</small></button>
              <button class="strategy-card" :class="{ 'is-active': strategy === 'random_pool' }" type="button" @click="strategy = 'random_pool'"><strong>随机标题池</strong><small>每条视频从标题池中随机选择一条标题。</small></button>
              <button class="strategy-card" :class="{ 'is-active': strategy === 'speech' }" type="button" @click="strategy = 'speech'"><strong>AI 识别口播</strong><small>听写视频里说的话，自动压上字幕。</small></button>
            </div>
            <input v-if="strategy === 'single_for_all'" v-model="titleText" class="dark-input" type="text" placeholder="输入统一标题" data-testid="sub-title" />
            <template v-else-if="strategy === 'random_pool'">
              <textarea v-model="titlePoolText" class="dark-textarea" rows="5" placeholder="每行输入一条随机标题"></textarea>
              <p class="helper-copy">当前可用标题数：{{ pool.length }}（按顺序轮流分配给每条视频）</p>
            </template>
            <label v-else class="field-block"><span>说话语言</span><select v-model="speechLanguage" class="dark-input"><option value="">自动</option><option value="zh">中文</option><option value="en">英语</option><option value="vi">越南语</option></select></label>
          </section>
          <section v-if="strategy === 'single_for_all' && sources.length" class="form-section">
            <div class="section-heading"><div><span class="section-kicker">Per Video Titles</span><strong>逐视频覆盖</strong></div></div>
            <div class="title-item-list">
              <div v-for="item in sources" :key="item.fileId" class="title-item-card">
                <div class="title-item-card__head"><strong>{{ item.name }}</strong><span>{{ formatDuration(item.durationSec || 0) || '--' }}</span></div>
                <textarea v-model="overrides[item.fileId]" class="dark-textarea" rows="2" placeholder="为当前视频输入单独标题"></textarea>
              </div>
              <p class="helper-copy">留空时会回退到统一标题。</p>
            </div>
          </section>
        </template>
        <template v-else>
          <section class="form-section">
            <div class="section-heading"><div><span class="section-kicker">Typeface</span><strong>字体与模板</strong></div></div>
            <div class="template-preset-grid">
              <button v-for="preset in CAPTION_PRESETS" :key="preset.id" class="template-preset" :class="{ 'is-active': selectedPreset === preset.id }" type="button" @click="applyPreset(preset.id)"><strong>{{ preset.name }}</strong><span>{{ preset.summary }}</span></button>
            </div>
          </section>
          <section class="form-section">
            <div class="form-grid form-grid--triple">
              <label class="field-block field-block--wide"><span>字体</span><input v-model="style.fontName" class="dark-input" type="text" placeholder="例如：Noto Sans SC" /></label>
              <label class="field-block"><span>字号</span><input v-model.number="style.fontSize" class="dark-input" type="number" min="18" max="120" /></label>
              <label class="field-block"><span>描边</span><input v-model.number="style.strokeWidth" class="dark-input" type="number" min="0" max="12" /></label>
            </div>
            <div class="form-grid form-grid--dual">
              <label class="field-block"><span>文字颜色</span><div class="color-field"><input v-model="style.fontColor" class="dark-input" type="text" /><input v-model="style.fontColor" class="dark-input dark-input--color" type="color" /></div></label>
              <label class="field-block"><span>描边颜色</span><div class="color-field"><input v-model="style.strokeColor" class="dark-input" type="text" /><input v-model="style.strokeColor" class="dark-input dark-input--color" type="color" /></div></label>
              <label class="field-block"><span>阴影颜色</span><div class="color-field"><input v-model="style.shadowColor" class="dark-input" type="text" /></div></label>
              <label class="field-block"><span>阴影模糊</span><input v-model.number="style.shadowBlur" class="dark-input" type="number" min="0" max="40" /></label>
            </div>
            <div class="form-grid form-grid--dual">
              <label class="field-block"><span>位置</span><select v-model="style.position" class="dark-input"><option value="top">顶部</option><option value="center">居中</option><option value="bottom">底部</option></select></label>
              <label class="field-block"><span>安全边距</span><input v-model.number="style.safeMargin" class="dark-input" type="number" min="0" max="40" /></label>
              <label class="field-block"><span>最大行数</span><input v-model.number="style.maxLines" class="dark-input" type="number" min="1" max="6" /></label>
              <div class="field-block"><span>对齐方式</span><div class="align-segment"><button v-for="a in ([['left', '左'], ['center', '中'], ['right', '右']] as const)" :key="a[0]" type="button" :class="{ 'is-active': style.textAlign === a[0] }" @click="style.textAlign = a[0]">{{ a[1] }}</button></div></div>
              <label class="field-block"><span>最大宽度比例</span><input v-model.number="style.maxWidthRatio" class="dark-input" type="number" min="0.4" max="0.92" step="0.02" /></label>
              <label class="field-block"><span>底部偏移</span><input v-model.number="style.bottomMargin" class="dark-input" type="number" min="48" max="600" /></label>
            </div>
          </section>
        </template>
      </article>
    </section>

    <ToolBatchHistory kind="subtitle" title="任务队列" />
    <AssetPickerDialog v-if="picking" kind="video" :picked="sources.map((s) => s.fileId)" @toggle="toggleAsset" @close="picking = false" />
  </main>
</template>

<style scoped>
.sub-page { display: flex; flex-direction: column; gap: 14px; padding: 12px 16px 40px; color: var(--theme-text); }
.glass-panel { border: 1px solid var(--theme-border); border-radius: 16px; background: var(--theme-panel); }
.hero-panel { display: flex; align-items: center; gap: 14px; padding: 16px 18px; }
.hero-copy { flex: 1; }
.hero-copy h1 { margin: 0; font-size: 24px; font-weight: 800; }
.hero-copy p { margin: 4px 0 0; color: var(--theme-text-muted); font-size: 13px; }
.hero-kpis { display: flex; gap: 8px; }
.hero-kpi { display: flex; flex-direction: column; gap: 2px; min-width: 88px; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel-soft); }
.hero-kpi strong { font-size: 16px; }
.hero-kpi span { color: var(--theme-text-muted); font-size: 11px; }
.stepbar { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding: 8px; }
.step-chip { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 14px; border-radius: 999px; background: var(--theme-panel-soft); color: var(--theme-text-muted); font-size: 13.5px; }
.step-chip.is-active { background: var(--vg-accent-soft); color: var(--theme-text); }
.step-chip.is-done { color: var(--theme-text); }
.step-chip__index { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--theme-panel); font-size: 12px; font-weight: 800; }
.step-chip__done { margin-left: auto; color: var(--vg-accent); }
.workspace-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.work-card { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
.section-heading > div { display: flex; flex-direction: column; gap: 2px; }
.section-kicker { color: var(--theme-text-muted); font-size: 10.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.section-heading strong { font-size: 16px; }
.section-note { color: var(--theme-text-muted); font-size: 12px; }
.segmented-tabs { display: grid; grid-auto-flow: column; gap: 6px; padding: 4px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel-soft); }
.segmented-tabs button { height: 36px; border: 0; border-radius: 9px; background: transparent; color: var(--theme-text-muted); font-weight: 700; cursor: pointer; }
.segmented-tabs button.is-active { background: var(--vg-accent-soft); color: var(--theme-text); }
.upload-zone { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 22px 12px; border: 1px dashed var(--theme-border); border-radius: 14px; background: var(--theme-panel-soft); text-align: center; cursor: pointer; }
.upload-zone.is-drag { border-color: var(--vg-accent); }
.upload-zone__icon { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 14px; background: var(--vg-accent-soft); color: var(--vg-accent); }
.upload-zone span { color: var(--theme-text-muted); font-size: 12px; }
.minor-button, .toolbar-pill, .ghost-button { height: 34px; padding: 0 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel); color: var(--theme-text); font-size: 12.5px; font-weight: 700; cursor: pointer; }
.minor-button--full { width: 100%; }
.minor-button:disabled, .toolbar-pill:disabled { opacity: .5; cursor: not-allowed; }
.toolbar-pill.is-active { border-color: var(--vg-accent); background: var(--vg-accent-soft); color: var(--vg-accent); }
.clone-picker { display: flex; flex-direction: column; gap: 8px; }
.picker-tip p { margin: 0 0 8px; color: var(--theme-text-muted); font-size: 12px; }
.clone-picker__list { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow: auto; }
.clone-picker__item { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); color: var(--theme-text); text-align: left; cursor: pointer; }
.clone-picker__item.is-selected { border-color: var(--vg-accent); }
.clone-picker__thumb, .source-thumb { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; overflow: hidden; border-radius: 8px; background: #000; color: var(--theme-text-muted); }
.source-thumb :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.clone-picker__copy, .source-list-item__copy { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
.clone-picker__copy strong, .source-list-item__copy strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.clone-picker__copy small, .source-list-item__copy small { color: var(--theme-text-muted); font-size: 11.5px; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.card-head > div:first-child { display: flex; flex-direction: column; gap: 2px; }
.text-button { border: 0; background: none; color: var(--vg-accent); font-size: 12.5px; cursor: pointer; }
.sources-list { display: flex; flex-direction: column; gap: 6px; }
.source-list-item { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); color: var(--theme-text); text-align: left; cursor: pointer; }
.source-list-item.is-active { border-color: var(--vg-accent); }
.source-list-item__remove { color: var(--theme-text-muted); }
.source-pager { display: flex; align-items: center; justify-content: space-between; color: var(--theme-text-muted); font-size: 12px; }
.source-pager > div { display: flex; gap: 6px; }
.capacity-card { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel-soft); }
.capacity-head { display: flex; justify-content: space-between; color: var(--theme-text-muted); font-size: 12.5px; }
.capacity-head strong { color: var(--theme-text); font-size: 16px; }
.capacity-bar { height: 6px; overflow: hidden; border-radius: 3px; background: var(--theme-panel); }
.capacity-bar div { height: 100%; background: var(--vg-accent); }
.capacity-card p, .helper-copy, .preview-note { margin: 0; color: var(--theme-text-muted); font-size: 12px; line-height: 1.5; }
.preview-card .card-head { flex-wrap: wrap; align-items: flex-end; }
.preview-toolbar { display: flex; flex-wrap: wrap; gap: 6px; }
.preview-toolbar .toolbar-pill { white-space: nowrap; }
.preview-stage { display: grid; place-items: center; padding: 8px; border-radius: 14px; background: #05070b; }
.preview-stage__frame { position: relative; width: min(100%, 320px); max-height: 560px; overflow: hidden; border-radius: 12px; background: linear-gradient(160deg, #2b3a55, #10151f 70%); }
.preview-stage__media, .preview-stage__media :deep(img), .preview-stage__media :deep(video) { width: 100%; height: 100%; object-fit: cover; }
.preview-stage__media { position: absolute; inset: 0; }
.preview-stage__blank { position: absolute; inset: 0; }
.preview-stage__overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.preview-stage__empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 20px; color: rgba(255, 255, 255, .7); font-size: 12.5px; text-align: center; }
.render-bar { display: flex; justify-content: space-between; gap: 8px; }
.primary-button { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border: 0; border-radius: 10px; background: var(--vg-accent); color: #fff; font-weight: 800; cursor: pointer; }
.primary-button:disabled { opacity: .5; cursor: not-allowed; }
.ghost-button { display: inline-flex; align-items: center; gap: 6px; height: 40px; }
.form-section { display: flex; flex-direction: column; gap: 10px; padding-top: 12px; border-top: 1px solid var(--theme-divider); }
.strategy-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.strategy-card { display: flex; flex-direction: column; gap: 4px; padding: 10px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel-soft); color: var(--theme-text); text-align: left; cursor: pointer; }
.strategy-card.is-active { border-color: var(--vg-accent); background: var(--vg-accent-soft); }
.strategy-card small { color: var(--theme-text-muted); font-size: 11.5px; line-height: 1.4; }
.dark-input, .dark-textarea { width: 100%; min-height: 38px; padding: 8px 10px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); color: var(--theme-text); font-size: 13px; outline: none; }
.dark-input option { background: var(--theme-panel); }
.dark-input--color { width: 48px; flex-shrink: 0; padding: 2px; }
.title-item-list { display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow: auto; }
.title-item-card { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel-soft); }
.title-item-card__head { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; }
.title-item-card__head strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title-item-card__head span { color: var(--theme-text-muted); }
.template-preset-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.template-preset { display: flex; flex-direction: column; gap: 4px; padding: 10px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel-soft); color: var(--theme-text); text-align: left; cursor: pointer; }
.template-preset.is-active { border-color: var(--vg-accent); background: var(--vg-accent-soft); }
.template-preset span { color: var(--theme-text-muted); font-size: 11.5px; line-height: 1.4; }
.form-grid { display: grid; gap: 10px; }
.form-grid--triple { grid-template-columns: 2fr 1fr 1fr; }
.form-grid--dual { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.field-block { display: flex; flex-direction: column; gap: 6px; color: var(--theme-text-muted); font-size: 12px; font-weight: 700; }
.color-field { display: flex; gap: 6px; }
.align-segment { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.align-segment button { height: 38px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); color: var(--theme-text); cursor: pointer; }
.align-segment button.is-active { border-color: var(--vg-accent); color: var(--vg-accent); }
@media (max-width: 1280px) { .workspace-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
@media (max-width: 900px) { .workspace-grid, .stepbar { grid-template-columns: minmax(0, 1fr); } .hero-kpis { display: none; } }
</style>
