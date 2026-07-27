<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ClipboardPen, CloudUpload, Folder, FolderOpen, Loader2, Scissors, Sparkles } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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

const inputName = computed(() => basename(inputPath.value) || t('slicer.noVideo'))
const outputDirText = computed(() => outputDir.value || (outputPaths.value[0] ? parentDir(outputPaths.value[0]) : t('slicer.outputAfterSplit')))
const segmentTimeSec = computed(() => Math.max(3, Math.min(600, Math.round(Number(minSegmentSec.value) || 15))))
const isWorking = computed(() => splitPhase.value === 'ffmpeg' || splitPhase.value === 'collect')
const canSplit = computed(() => Boolean(inputPath.value) && !isWorking.value)
const phaseText = computed(() => {
  if (splitPhase.value === 'ffmpeg') return t('slicer.phase.ffmpeg')
  if (splitPhase.value === 'collect') return t('slicer.phase.collect')
  if (splitPhase.value === 'done') return t('slicer.phase.done', { count: outputPaths.value.length })
  if (splitPhase.value === 'error') return splitError.value || t('slicer.phase.failed')
  return inputPath.value ? t('slicer.phase.ready') : t('slicer.phase.idle')
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
    title: t('slicer.pickers.video'),
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
  const dir = await window.api.pickDir({ title: t('slicer.pickers.outputDir') })
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
        <h1>{{ t('slicer.title') }}</h1>
        <p>{{ t('slicer.desc') }}</p>
      </div>
      <span class="live-status">{{ phaseText }}</span>
    </header>

    <div class="live-slicer-grid">
      <main class="live-main">
        <section class="live-upload-card">
          <div class="live-drop-zone" @click="pickVideo">
            <template v-if="!inputPath">
              <div class="live-upload-icon"><CloudUpload class="h-11 w-11" /></div>
              <h2>{{ t('slicer.upload.title') }}</h2>
              <p>{{ t('slicer.upload.formats') }}<br />{{ t('slicer.upload.sizeHint') }}</p>
              <button class="live-primary" type="button">{{ t('slicer.upload.choose') }}</button>
            </template>
            <template v-else>
              <div class="live-upload-icon"><CloudUpload class="h-11 w-11" /></div>
              <h2>{{ inputName }}</h2>
              <p class="live-path">{{ inputPath }}</p>
              <div class="live-file-actions">
                <button class="live-primary" type="button">{{ t('slicer.upload.reselect') }}</button>
                <button class="live-secondary" type="button" @click.stop="openPath(inputPath)">{{ t('slicer.upload.openOriginal') }}</button>
              </div>
            </template>
          </div>
        </section>

        <section class="live-results-card">
          <div class="live-card-head">
            <div>
              <h2>{{ t('slicer.results.title') }}</h2>
              <p>{{ t('slicer.results.count', { count: outputPaths.length }) }}</p>
            </div>
            <button class="live-small-button" :disabled="!outputPaths[0]" @click="showInFolder(outputPaths[0])">{{ t('slicer.results.openDir') }}</button>
          </div>

          <div v-if="!outputPaths.length" class="live-empty-result">
            {{ t('slicer.results.empty') }}
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
            <h2>{{ t('slicer.analysis.title') }}</h2>
            <span>{{ t('slicer.analysis.recommended') }}</span>
          </div>

          <label class="live-label">{{ t('slicer.analysis.mode') }}</label>
          <div class="live-mode-grid">
            <button class="live-mode-card" :class="{ active: analysisMode === 'smart' }" @click="analysisMode = 'smart'">
              <Sparkles class="h-5 w-5" />
              <strong>{{ t('slicer.analysis.smart') }}</strong>
              <small>{{ t('slicer.analysis.smartDesc') }}</small>
            </button>
            <button class="live-mode-card" :class="{ active: analysisMode === 'manual' }" @click="analysisMode = 'manual'">
              <ClipboardPen class="h-5 w-5" />
              <strong>{{ t('slicer.analysis.manual') }}</strong>
              <small>{{ t('slicer.analysis.manualDesc') }}</small>
            </button>
            <button class="live-mode-card" :class="{ active: analysisMode === 'custom' }" @click="analysisMode = 'custom'">
              <Scissors class="h-5 w-5" />
              <strong>{{ t('slicer.analysis.custom') }}</strong>
              <small>{{ t('slicer.analysis.customDesc') }}</small>
            </button>
          </div>

          <div class="live-two-cols">
            <label>
              <span>{{ t('slicer.analysis.minDuration') }}</span>
              <input v-model.number="minSegmentSec" class="live-input" min="3" max="600" type="number" />
              <small>{{ t('slicer.analysis.durationHint') }}</small>
            </label>
            <label>
              <span>{{ t('slicer.analysis.maxDuration') }}</span>
              <input v-model.number="maxSegmentSec" class="live-input" min="3" max="600" type="number" disabled />
              <small>{{ t('slicer.analysis.fixedDuration') }}</small>
            </label>
          </div>

          <button class="live-primary live-wide" :disabled="!canSplit" @click="splitVideo">
            <Loader2 v-if="isWorking" class="h-4 w-4 animate-spin" />
            <Scissors v-else class="h-4 w-4" />
            {{ isWorking ? t('slicer.analysis.working') : t('slicer.analysis.start') }}
          </button>
          <div v-if="splitError" class="live-error">{{ splitError }}</div>
        </section>

        <section class="live-panel">
          <div class="live-panel-head">
            <h2>{{ t('slicer.export.title') }}</h2>
          </div>

          <div class="live-two-cols">
            <label>
              <span>{{ t('slicer.export.format') }}</span>
              <select v-model="outputFormat" class="live-input">
                <option value="mp4">MP4</option>
                <option value="source">{{ t('slicer.export.sourceFormat') }}</option>
              </select>
            </label>
            <label>
              <span>{{ t('slicer.export.quality') }}</span>
              <select v-model="quality" class="live-input">
                <option value="1080P">1080P</option>
                <option value="source">{{ t('slicer.export.sourceQuality') }}</option>
              </select>
            </label>
          </div>

          <label class="live-dir-field">
            <span>{{ t('slicer.export.outputDir') }}</span>
            <div class="live-dir-row">
              <input v-model="outputDir" class="live-input" />
              <button type="button" @click="pickOutputDir"><Folder class="h-4 w-4" /></button>
            </div>
          </label>

          <button class="live-primary live-wide" :disabled="!outputPaths[0]" @click="showInFolder(outputPaths[0] || outputDir)">
            <FolderOpen class="h-4 w-4" />
            {{ t('slicer.export.all') }}
          </button>
          <p class="live-note">{{ t('slicer.export.currentDir') }}: {{ outputDirText }}</p>
        </section>
      </aside>
    </div>
  </div>
</template>
