<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ClipboardPen, CloudUpload, Folder, FolderOpen, Loader2, Scissors, Sparkles } from 'lucide-vue-next'

type SplitPhase = 'idle' | 'ffmpeg' | 'collect' | 'done' | 'error'
type AnalysisMode = 'smart' | 'manual' | 'custom'

const inputPath = ref('')
const minSegmentSec = ref(15)
const maxSegmentSec = ref(60)
const outputFormat = ref<'source' | 'mp4'>('mp4')
const quality = ref('1080P')
const outputDir = ref('')
const splitPhase = ref<SplitPhase>('idle')
const splitError = ref('')
const outputPaths = ref<string[]>([])
const analysisMode = ref<AnalysisMode>('smart')

const inputName = computed(() => basename(inputPath.value) || '未选择视频')
const outputDirText = computed(() => outputDir.value || (outputPaths.value[0] ? parentDir(outputPaths.value[0]) : '切片完成后显示输出目录'))
const segmentTimeSec = computed(() => Math.max(3, Math.min(600, Math.round(Number(minSegmentSec.value) || 15))))
const isWorking = computed(() => splitPhase.value === 'ffmpeg' || splitPhase.value === 'collect')
const canSplit = computed(() => Boolean(inputPath.value) && !isWorking.value)
const phaseText = computed(() => {
  if (splitPhase.value === 'ffmpeg') return '正在调用 FFmpeg 切片'
  if (splitPhase.value === 'collect') return '正在整理输出片段'
  if (splitPhase.value === 'done') return `已生成 ${outputPaths.value.length} 个片段`
  if (splitPhase.value === 'error') return splitError.value || '切片失败'
  return inputPath.value ? '已导入视频，等待分析' : '等待导入'
})

function basename(p: string) {
  return String(p || '').split(/[/\\]/).pop() || p
}

function parentDir(p: string) {
  const normalized = String(p || '')
  const idx = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return idx > 0 ? normalized.slice(0, idx) : normalized
}

async function initDefaultOutputDir() {
  try {
    const paths = (await window.api.getPaths()) as { dataDir?: string }
    const base = String(paths?.dataDir || '').trim()
    if (base) outputDir.value = `${base}\\exports\\live_slicer`
  } catch {
    /* keep empty */
  }
}

async function pickVideo() {
  const files = await window.api.pickFiles({
    title: '选择直播录像或长视频',
    multiple: false,
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] }],
  })
  const first = files?.[0]
  if (!first) return
  inputPath.value = first
  outputPaths.value = []
  splitError.value = ''
  splitPhase.value = 'idle'
}

async function pickOutputDir() {
  const dir = await window.api.pickDir({ title: '选择切片输出目录' })
  if (dir) outputDir.value = String(dir)
}

async function splitVideo() {
  if (!inputPath.value) return
  splitError.value = ''
  outputPaths.value = []
  splitPhase.value = 'ffmpeg'
  let offProgress: (() => void) | null = null
  try {
    offProgress = window.api.media.onSegmentSplitProgress((p) => {
      const phase = String(p.phase || '')
      if (phase === 'ffmpeg' || phase === 'collect') splitPhase.value = phase
    })
    const res = await window.api.media.segmentSplit({
      inputPath: inputPath.value,
      segmentTimeSec: segmentTimeSec.value,
      outputDir: outputDir.value || undefined,
      outputFormat: outputFormat.value,
    })
    if (!res.ok) {
      splitError.value = res.error
      splitPhase.value = 'error'
      return
    }
    outputPaths.value = res.outputPaths
    if (!outputDir.value && res.outputPaths[0]) outputDir.value = parentDir(res.outputPaths[0])
    splitPhase.value = 'done'
  } catch (e: any) {
    splitError.value = e?.message ?? String(e)
    splitPhase.value = 'error'
  } finally {
    offProgress?.()
  }
}

async function openPath(path: string) {
  if (!path) return
  await window.api.shell.openPath(path)
}

async function showInFolder(path: string) {
  if (!path) return
  await window.api.shell.showItemInFolder(path)
}

onMounted(initDefaultOutputDir)
</script>

<template>
  <div class="live-slicer-workbench">
    <header class="live-slicer-head">
      <div>
        <div class="live-kicker">Live Slicer</div>
        <h1>直播切片</h1>
        <p>导入直播录制或长视频，智能识别精彩片段并一键切片。</p>
      </div>
      <span class="live-status">{{ phaseText }}</span>
    </header>

    <div class="live-slicer-grid">
      <main class="live-main">
        <section class="live-upload-card">
          <div class="live-drop-zone" @click="pickVideo">
            <template v-if="!inputPath">
              <div class="live-upload-icon"><CloudUpload class="h-11 w-11" /></div>
              <h2>导入直播录像或长视频</h2>
              <p>支持 MP4 / MOV / MKV / WEBM 格式<br />文件大小建议小于 10GB</p>
              <button class="live-primary" type="button">选择视频文件</button>
            </template>
            <template v-else>
              <div class="live-upload-icon"><CloudUpload class="h-11 w-11" /></div>
              <h2>{{ inputName }}</h2>
              <p class="live-path">{{ inputPath }}</p>
              <div class="live-file-actions">
                <button class="live-primary" type="button">重新选择视频</button>
                <button class="live-secondary" type="button" @click.stop="openPath(inputPath)">打开原视频</button>
              </div>
            </template>
          </div>
        </section>

        <section class="live-results-card">
          <div class="live-card-head">
            <div>
              <h2>切片结果</h2>
              <p>{{ outputPaths.length }} 个片段</p>
            </div>
            <button class="live-small-button" :disabled="!outputPaths[0]" @click="showInFolder(outputPaths[0])">打开目录</button>
          </div>

          <div v-if="!outputPaths.length" class="live-empty-result">
            请先导入视频并开始智能分析，切片结果会显示在这里。
          </div>
          <div v-else class="live-result-list">
            <button v-for="path in outputPaths" :key="path" class="live-result-item" @click="openPath(path)">
              <span>{{ basename(path) }}</span>
              <small>{{ path }}</small>
            </button>
          </div>
        </section>
      </main>

      <aside class="live-side">
        <section class="live-panel">
          <div class="live-panel-head">
            <h2>分析设置</h2>
            <span>推荐设置</span>
          </div>

          <label class="live-label">识别模式</label>
          <div class="live-mode-grid">
            <button class="live-mode-card" :class="{ active: analysisMode === 'smart' }" @click="analysisMode = 'smart'">
              <Sparkles class="h-5 w-5" />
              <strong>智能识别</strong>
              <small>自动识别精彩片段</small>
            </button>
            <button class="live-mode-card" :class="{ active: analysisMode === 'manual' }" @click="analysisMode = 'manual'">
              <ClipboardPen class="h-5 w-5" />
              <strong>人工标记</strong>
              <small>手动标记片段</small>
            </button>
            <button class="live-mode-card" :class="{ active: analysisMode === 'custom' }" @click="analysisMode = 'custom'">
              <Scissors class="h-5 w-5" />
              <strong>自定义</strong>
              <small>设置识别规则</small>
            </button>
          </div>

          <div class="live-two-cols">
            <label>
              <span>最小片段时长（秒）</span>
              <input v-model.number="minSegmentSec" class="live-input" min="3" max="600" type="number" />
              <small>建议 15-60 秒</small>
            </label>
            <label>
              <span>最大片段时长（秒）</span>
              <input v-model.number="maxSegmentSec" class="live-input" min="3" max="600" type="number" disabled />
              <small>当前 FFmpeg 按固定时长切片</small>
            </label>
          </div>

          <button class="live-primary live-wide" :disabled="!canSplit" @click="splitVideo">
            <Loader2 v-if="isWorking" class="h-4 w-4 animate-spin" />
            <Scissors v-else class="h-4 w-4" />
            {{ isWorking ? '正在智能分析' : '开始智能分析' }}
          </button>
          <div v-if="splitError" class="live-error">{{ splitError }}</div>
        </section>

        <section class="live-panel">
          <div class="live-panel-head">
            <h2>导出设置</h2>
          </div>

          <div class="live-two-cols">
            <label>
              <span>输出格式</span>
              <select v-model="outputFormat" class="live-input">
                <option value="mp4">MP4</option>
                <option value="source">原格式</option>
              </select>
            </label>
            <label>
              <span>画质</span>
              <select v-model="quality" class="live-input">
                <option value="1080P">1080P</option>
                <option value="source">保持原画</option>
              </select>
            </label>
          </div>

          <label class="live-dir-field">
            <span>输出目录</span>
            <div class="live-dir-row">
              <input v-model="outputDir" class="live-input" />
              <button type="button" @click="pickOutputDir"><Folder class="h-4 w-4" /></button>
            </div>
          </label>

          <button class="live-primary live-wide" :disabled="!outputPaths[0]" @click="showInFolder(outputPaths[0] || outputDir)">
            <FolderOpen class="h-4 w-4" />
            批量导出所有片段
          </button>
          <p class="live-note">当前导出目录：{{ outputDirText }}</p>
        </section>
      </aside>
    </div>
  </div>
</template>
