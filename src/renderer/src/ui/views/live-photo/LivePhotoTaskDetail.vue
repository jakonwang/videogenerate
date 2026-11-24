<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { Captions, Check, ChevronDown, FileImage, FolderOpen, Logs, Play, RefreshCcw, ScanLine, X } from 'lucide-vue-next'
import type { LivePhotoItem } from './types'
import type { LivePhotoCardAction, LivePhotoCardCaps } from './LivePhotoTaskCard.vue'
import { livePhotoProgress, useNow, type LpStepKey } from './progress'
import { useProgressText } from './useProgressText'

/**
 * 任务详情：先回答普通用户关心的「现在在干什么、要多久、结果在哪、下一步做什么」，
 * 模型调用、远端任务号、提示词、质量门禁这些技术字段统一收进底部的「技术详情」。
 */
const props = defineProps<{
  item: LivePhotoItem
  caps: LivePhotoCardCaps & { videoPath: string }
  fileSrc: (path?: string) => string
  formatTime: (value?: number) => string
}>()
const emit = defineEmits<{ close: []; action: [name: LivePhotoCardAction]; open: [path: string]; reveal: [path: string] }>()
const text = useProgressText()
const { t } = text
const now = useNow()

const p = computed(() => livePhotoProgress(props.item))
const title = computed(() => props.item.sourceShotLabel || props.item.productSnapshot?.name || props.item.id)
const subtitle = computed(() =>
  [
    t(`lpTask.detail.kind.${props.item.sourceType}`),
    props.item.productSnapshot?.name ? t('lpTask.detail.product', { name: props.item.productSnapshot.name }) : props.item.sourceProjectTitle,
    props.item.createdAt ? t('lpTask.detail.created', { time: props.formatTime(props.item.createdAt) }) : '',
  ]
    .filter(Boolean)
    .join(' · '),
)
const tone = computed(() => {
  const state = p.value.state
  if (state === 'done') return 'is-ok'
  if (state === 'failed') return 'is-err'
  if (state === 'retrying' || state === 'paused') return 'is-warn'
  if (state === 'running' || state === 'waiting') return 'is-run'
  return ''
})

const stepTimes = computed<Record<LpStepKey, number | undefined>>(() => {
  const status = props.item.workflow?.stepStatus
  const locateCall = p.value.modelCalls.find((call) => call.step === 'locate_product')
  return {
    locate: locateCall?.at || props.item.replacementRegion?.updatedAt,
    image: status?.image_validation?.status === 'done' ? status.image_validation.updatedAt : status?.image_generation?.updatedAt,
    video: status?.video_generation?.updatedAt,
    package: status?.live_photo_packaging?.updatedAt,
  }
})

function stepSub(key: LpStepKey, state: string) {
  if (state === 'done') return props.formatTime(stepTimes.value[key])
  if (state === 'active') return text.shortLabel(p.value)
  if (state === 'failed') return text.stateLabel(p.value)
  return ''
}

const primary = computed<Array<{ action: LivePhotoCardAction; label: string; icon: any; strong?: boolean }>>(() => {
  const progress = p.value
  const list: Array<{ action: LivePhotoCardAction; label: string; icon: any; strong?: boolean }> = []
  if (props.caps.canContinueVideo) list.push({ action: 'continueVideo', label: t('lpTask.action.continueVideo'), icon: Play, strong: true })
  if (props.caps.canRetryImage) list.push({ action: 'retryImage', label: t('lpTask.action.retryImage'), icon: RefreshCcw })
  if (list.length) return list
  if (progress.state === 'done' && props.caps.hasVideo) {
    list.push({ action: 'play', label: t('lpTask.action.play'), icon: Play, strong: true })
    list.push({ action: 'subtitle', label: t('lpTask.action.subtitle'), icon: Captions })
    return list
  }
  if (progress.next === 'region' && props.caps.canRegion) return [{ action: 'region', label: t('lpTask.action.region'), icon: ScanLine, strong: true }]
  if (progress.state === 'paused') return [{ action: 'resume', label: t('lpTask.action.resume'), icon: Play, strong: true }]
  if (progress.state === 'failed') return [{ action: 'retry', label: t('lpTask.action.retry'), icon: RefreshCcw, strong: true }]
  return list
})

const results = computed(() => [
  { key: 'reference', label: t('lpTask.detail.reference'), path: String(props.item.referenceImagePath || props.item.imagePromptPreview?.referenceImagePaths?.[0] || '').trim(), kind: 'image' as const },
  { key: 'still', label: t('lpTask.detail.still'), path: String(props.item.generatedStillPath || '').trim(), kind: 'image' as const },
  { key: 'video', label: t('lpTask.detail.video'), path: props.caps.videoPath, kind: 'video' as const },
])

const remoteTasks = computed(() =>
  [
    { label: t('lpTask.detail.imageTask'), id: props.item.imageTaskId, provider: props.item.imageTaskProvider, model: props.item.imageTaskModel },
    { label: t('lpTask.detail.videoTask'), id: props.item.videoTaskId, provider: props.item.videoTaskProvider, model: props.item.videoTaskModel },
  ].filter((entry) => String(entry.id || '').trim()),
)

const quality = computed(() => {
  const report = props.item.qualityReport
  if (!report) return t('lpTask.detail.qualityNone')
  return `${report.decision} · ${Number(report.score || 0).toFixed(2)}`
})

const exportSpec = computed(() => {
  const logs = Array.isArray(props.item.logs) ? [...props.item.logs].reverse() : []
  const hit = logs.find((log) => String(log.message || '').includes('export settings used:'))
  const match = hit ? String(hit.message).match(/resolution=([^\s]+)\s+frameRate=([^\s]+)\s+quality=([^\s]+)/i) : null
  return match ? `${match[1]} / ${match[2]} fps / ${match[3]}` : ''
})

const rawError = computed(() => String(props.item.error || props.item.autoFlowStatus?.lastError || '').trim())
const recentLogs = computed(() => (Array.isArray(props.item.logs) ? [...props.item.logs].slice(-8).reverse() : []))

function modelStepLabel(step: string) {
  const key = `lpTask.detail.modelStep.${step}`
  const label = t(key)
  return label === key ? step : label
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="vg-scope vg-backdrop" data-testid="live-photo-detail" @click.self="emit('close')">
    <section class="vg-dialog vg-dialog--xl lpd" :class="tone" role="dialog" aria-modal="true" :aria-label="title">
      <header class="vg-dialog__head lpd__head">
        <div class="lpd__title">
          <h2>{{ title }}</h2>
          <p>{{ subtitle }}</p>
        </div>
        <span class="lpd__state"><i />{{ text.stateLabel(p) }}</span>
        <button class="vg-icon-btn" type="button" :aria-label="t('lpTask.action.close')" data-testid="live-photo-detail-close" @click="emit('close')"><X :size="16" /></button>
      </header>

      <div class="vg-dialog__body lpd__body">
        <!-- 现在：一句话 + 要多久 + 下一步 + 当下的操作 -->
        <section class="lpd__now" data-testid="live-photo-detail-now">
          <div class="lpd__now-text">
            <strong>{{ text.nowLabel(p) }}</strong>
            <span v-if="text.timingLabel(p, now)" class="lpd__timing">{{ text.timingLabel(p, now) }}</span>
            <span v-if="text.nextLabel(p)" class="lpd__next">{{ text.nextLabel(p) }}</span>
          </div>
          <div v-if="primary.length" class="lpd__now-actions">
            <button
              v-for="btn in primary"
              :key="btn.action"
              class="vg-btn vg-btn--sm"
              :class="btn.strong ? 'vg-btn--primary' : ''"
              type="button"
              :disabled="(btn.action === 'retry' || btn.action === 'retryImage') && item.packagingStatus === 'processing'"
              @click="emit('action', btn.action)"
            >
              <component :is="btn.icon" :size="13" />{{ btn.label }}
            </button>
          </div>
        </section>

        <!-- 步骤 -->
        <ol class="lpd__steps" data-testid="live-photo-detail-steps">
          <li v-for="(step, index) in p.steps" :key="step.key" :class="`is-${step.state}`">
            <span class="lpd__dot">
              <Check v-if="step.state === 'done'" :size="12" />
              <X v-else-if="step.state === 'failed'" :size="12" />
              <template v-else>{{ index + 1 }}</template>
            </span>
            <span class="lpd__step-text">
              <strong>{{ t(`lpTask.step.${step.key}`) }}</strong>
              <small>{{ stepSub(step.key, step.state) }}</small>
            </span>
          </li>
        </ol>

        <!-- 结果 -->
        <section class="lpd__section">
          <h3 class="lpd__h">{{ t('lpTask.detail.results') }}</h3>
          <div class="lpd__results">
            <figure v-for="res in results" :key="res.key" class="lpd__result" :data-testid="`live-photo-detail-result-${res.key}`">
              <div class="lpd__frame">
                <video v-if="res.kind === 'video' && res.path" :src="fileSrc(res.path)" :poster="caps.thumb || undefined" controls playsinline preload="metadata" />
                <button v-else-if="res.path" type="button" class="lpd__img" @click="emit('open', res.path)"><img :src="fileSrc(res.path)" :alt="res.label" /></button>
                <span v-else class="lpd__empty"><FileImage :size="18" />{{ t('lpTask.detail.notYet') }}</span>
              </div>
              <figcaption>
                <span>{{ res.label }}<em v-if="res.key === 'video' && caps.hasSubtitle"> · {{ t('lpTask.detail.withSubtitle') }}</em></span>
                <span v-if="res.path" class="lpd__links">
                  <button v-if="res.kind === 'video'" type="button" @click="emit('action', 'play')">{{ t('lpTask.action.play') }}</button>
                  <button v-else type="button" @click="emit('open', res.path)">{{ t('lpTask.action.open') }}</button>
                  <button type="button" :title="t('lpTask.action.reveal')" @click="emit('reveal', res.path)"><FolderOpen :size="12" /></button>
                </span>
              </figcaption>
            </figure>
          </div>
        </section>

        <!-- 技术详情（默认收起） -->
        <details class="lpd__tech" data-testid="live-photo-detail-tech">
          <summary>
            <span>{{ t('lpTask.detail.tech') }}</span>
            <small>{{ t('lpTask.detail.techHint') }}</small>
            <ChevronDown :size="14" class="lpd__chev" />
          </summary>

          <dl class="lpd__kv">
            <div class="lpd__kv-row lpd__kv-row--top">
              <dt>{{ t('lpTask.detail.modelCalls') }}</dt>
              <dd>
                <ul v-if="p.modelCalls.length" class="lpd__calls" data-testid="live-photo-detail-model-calls">
                  <li v-for="(call, index) in p.modelCalls" :key="index">
                    <span class="lpd__call-step">{{ modelStepLabel(call.step) }}</span>
                    <code>{{ call.model }}</code>
                    <span class="lpd__muted">{{ call.provider }} {{ call.endpoint }}</span>
                    <span v-if="call.cached" class="lpd__muted">{{ t('lpTask.detail.cached') }}</span>
                    <span class="lpd__muted vg-num">{{ formatTime(call.at) }}</span>
                  </li>
                </ul>
                <span v-else class="lpd__muted">{{ t('lpTask.detail.noModelCalls') }}</span>
              </dd>
            </div>
            <div class="lpd__kv-row">
              <dt>{{ t('lpTask.detail.remoteTasks') }}</dt>
              <dd>
                <template v-if="remoteTasks.length">
                  <span v-for="task in remoteTasks" :key="task.label" class="lpd__task">{{ task.label }} <code>{{ task.id }}</code> <span class="lpd__muted">{{ task.provider }} / {{ task.model }}</span></span>
                </template>
                <span v-else class="lpd__muted">—</span>
              </dd>
            </div>
            <div class="lpd__kv-row"><dt>{{ t('lpTask.detail.retries') }}</dt><dd class="vg-num">{{ p.retryCount }} / {{ p.retryLimit }}</dd></div>
            <div class="lpd__kv-row"><dt>{{ t('lpTask.detail.promptVersion') }}</dt><dd>{{ item.promptVersion ? `V${item.promptVersion}` : '—' }}</dd></div>
            <div class="lpd__kv-row"><dt>{{ t('lpTask.detail.quality') }}</dt><dd>{{ quality }}</dd></div>
            <div class="lpd__kv-row"><dt>{{ t('lpTask.detail.cache') }}</dt><dd>{{ item.cacheHit ? t('lpTask.detail.cacheHit') : t('lpTask.detail.cacheMiss') }}</dd></div>
            <div v-if="item.checkerFallbackReason || item.qualityReport?.fallbackReason" class="lpd__kv-row"><dt>{{ t('lpTask.detail.fallback') }}</dt><dd>{{ item.checkerFallbackReason || item.qualityReport?.fallbackReason }}</dd></div>
            <div v-if="item.qualityReport?.hardFailures?.length" class="lpd__kv-row"><dt>{{ t('lpTask.detail.hardFailures') }}</dt><dd>{{ item.qualityReport.hardFailures.join(', ') }}</dd></div>
            <div v-if="exportSpec" class="lpd__kv-row"><dt>{{ t('lpTask.detail.exportSpec') }}</dt><dd>{{ exportSpec }}</dd></div>
            <div v-if="item.packagingAssetIdentifier" class="lpd__kv-row"><dt>{{ t('lpTask.detail.assetId') }}</dt><dd><code>{{ item.packagingAssetIdentifier }}</code></dd></div>
            <div v-if="rawError" class="lpd__kv-row lpd__kv-row--top"><dt>{{ t('lpTask.detail.rawError') }}</dt><dd><code class="lpd__wrap">{{ rawError }}</code></dd></div>
          </dl>

          <div class="lpd__prompts">
            <div v-if="item.imagePromptPreview?.prompt">
              <h4>{{ t('lpTask.detail.imagePrompt') }} <span class="lpd__muted">{{ item.imagePromptPreview.provider || '' }} / {{ item.imagePromptPreview.model || '' }}</span></h4>
              <pre>{{ item.imagePromptPreview.prompt }}</pre>
              <template v-if="item.imagePromptPreview.negativePrompt">
                <h4>{{ t('lpTask.detail.negative') }}</h4>
                <pre>{{ item.imagePromptPreview.negativePrompt }}</pre>
              </template>
            </div>
            <div v-if="item.videoPromptPreview?.prompt">
              <h4>{{ t('lpTask.detail.videoPrompt') }} <span class="lpd__muted">{{ item.videoPromptPreview.provider || '' }} / {{ item.videoPromptPreview.model || '' }}</span></h4>
              <pre>{{ item.videoPromptPreview.prompt }}</pre>
            </div>
          </div>

          <div class="lpd__logs">
            <div class="lpd__logs-head">
              <h4>{{ t('lpTask.detail.recentLogs') }}</h4>
              <button class="vg-btn vg-btn--xs vg-btn--ghost" type="button" @click="emit('action', 'logs')"><Logs :size="12" />{{ t('lpTask.action.openLogs') }}</button>
            </div>
            <ul v-if="recentLogs.length">
              <li v-for="log in recentLogs" :key="log.id" :class="`is-${log.level}`"><span class="vg-num">{{ formatTime(log.time) }}</span>{{ log.message }}</li>
            </ul>
            <p v-else class="lpd__muted">{{ t('lpTask.detail.noLogs') }}</p>
          </div>
        </details>
      </div>
    </section>
  </div>
</template>

<style scoped>
.lpd { max-height: 90vh; }
.lpd__head { align-items: center; }
.lpd__title { flex: 1; min-width: 0; }
.lpd__title h2 { margin: 0; font-size: 17px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lpd__title p { margin: 3px 0 0; font-size: 12px; color: var(--theme-text-muted); }
.lpd__state { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--theme-text-muted); white-space: nowrap; }
.lpd__state i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.is-ok .lpd__state { color: var(--vg-green, #16a34a); }
.is-err .lpd__state { color: var(--vg-red); }
.is-warn .lpd__state { color: var(--vg-amber); }
.is-run .lpd__state { color: var(--vg-blue); }

.lpd__body { display: flex; flex-direction: column; gap: 18px; padding: 18px 20px 20px; overflow-y: auto; }

.lpd__now { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border: 1px solid var(--theme-border); border-left: 3px solid var(--theme-border-control); border-radius: 10px; }
.is-run .lpd__now { border-left-color: var(--vg-blue); }
.is-ok .lpd__now { border-left-color: var(--vg-green, #16a34a); }
.is-err .lpd__now { border-left-color: var(--vg-red); }
.is-warn .lpd__now { border-left-color: var(--vg-amber); }
.lpd__now-text { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.lpd__now-text strong { font-size: 16px; font-weight: 650; }
.lpd__timing { font-size: 12.5px; color: var(--theme-text-secondary); font-variant-numeric: tabular-nums; }
.lpd__next { font-size: 12.5px; color: var(--theme-text-muted); }
.lpd__now-actions { display: flex; gap: 8px; flex-shrink: 0; }

.lpd__steps { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; margin: 0; padding: 0; list-style: none; border: 1px solid var(--theme-border); border-radius: 10px; overflow: hidden; }
.lpd__steps li { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-left: 1px solid var(--theme-divider); min-width: 0; }
.lpd__steps li:first-child { border-left: 0; }
.lpd__dot { display: grid; place-items: center; width: 22px; height: 22px; flex-shrink: 0; border-radius: 50%; border: 1px solid var(--theme-border-control); color: var(--theme-text-muted); font-size: 11px; font-weight: 600; }
.lpd__steps li.is-done .lpd__dot { border-color: transparent; background: var(--vg-accent); color: var(--theme-on-accent); }
.lpd__steps li.is-active .lpd__dot { border-color: var(--vg-blue); color: var(--vg-blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--vg-blue) 18%, transparent); }
.lpd__steps li.is-failed .lpd__dot { border-color: transparent; background: var(--vg-red); color: #fff; }
.is-warn .lpd__steps li.is-failed .lpd__dot { background: var(--vg-amber); }
.lpd__step-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lpd__step-text strong { font-size: 12.5px; font-weight: 600; }
.lpd__steps li.is-todo .lpd__step-text strong { color: var(--theme-text-muted); font-weight: 500; }
.lpd__step-text small { font-size: 11px; color: var(--theme-text-muted); min-height: 14px; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.lpd__section { display: flex; flex-direction: column; gap: 10px; }
.lpd__h { margin: 0; font-size: 13px; font-weight: 600; }
.lpd__results { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.lpd__result { margin: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.lpd__frame { position: relative; aspect-ratio: 3 / 4; max-height: 300px; border: 1px solid var(--theme-border); border-radius: 9px; overflow: hidden; background: var(--theme-panel-soft); display: grid; place-items: center; }
.lpd__frame video, .lpd__img img { width: 100%; height: 100%; object-fit: contain; background: #000; display: block; }
/* 铺满画框：网格居中时子元素没有确定高度，图片会按原比例撑开、底部被裁掉（商品常在画面下方） */
.lpd__frame > video, .lpd__img { position: absolute; inset: 0; }
.lpd__img { width: 100%; height: 100%; padding: 0; border: 0; background: transparent; cursor: zoom-in; }
.lpd__empty { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px; color: var(--theme-text-muted); }
.lpd__result figcaption { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--theme-text-secondary); }
.lpd__result figcaption em { font-style: normal; color: var(--theme-text-muted); }
.lpd__links { display: inline-flex; align-items: center; gap: 2px; }
.lpd__links button { display: inline-flex; align-items: center; height: 22px; padding: 0 6px; border: 0; border-radius: 5px; background: transparent; color: var(--vg-accent); font: inherit; font-size: 12px; cursor: pointer; }
.lpd__links button:hover { background: var(--theme-panel-soft); }

.lpd__tech { border-top: 1px solid var(--theme-divider); padding-top: 4px; }
.lpd__tech summary { display: flex; align-items: center; gap: 10px; padding: 8px 2px; cursor: pointer; list-style: none; font-size: 13px; font-weight: 600; }
.lpd__tech summary::-webkit-details-marker { display: none; }
.lpd__tech summary small { flex: 1; font-size: 11.5px; font-weight: 400; color: var(--theme-text-muted); }
.lpd__chev { color: var(--theme-text-muted); transition: transform .15s; }
.lpd__tech[open] .lpd__chev { transform: rotate(180deg); }
.lpd__kv { margin: 4px 0 0; }
.lpd__kv-row { display: grid; grid-template-columns: 120px 1fr; gap: 12px; align-items: center; padding: 8px 2px; border-bottom: 1px solid var(--theme-divider); font-size: 12.5px; }
.lpd__kv-row--top { align-items: start; }
.lpd__kv-row dt { color: var(--theme-text-muted); }
.lpd__kv-row dd { margin: 0; min-width: 0; color: var(--theme-text); }
.lpd__calls { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.lpd__calls li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
.lpd__call-step { font-weight: 600; min-width: 64px; }
.lpd__task { display: block; }
.lpd__task + .lpd__task { margin-top: 4px; }
.lpd__muted { color: var(--theme-text-muted); font-size: 11.5px; }
.lpd code { font-family: var(--vg-font-mono, ui-monospace, monospace); font-size: 11.5px; padding: 1px 5px; border-radius: 4px; background: var(--theme-panel-soft); }
.lpd__wrap { display: block; white-space: pre-wrap; word-break: break-all; }
.lpd__prompts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; }
.lpd__prompts h4, .lpd__logs h4 { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
.lpd__prompts pre { margin: 0 0 10px; max-height: 180px; overflow: auto; padding: 10px; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-panel-soft); font-size: 11.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.lpd__logs { margin-top: 14px; }
.lpd__logs-head { display: flex; align-items: center; justify-content: space-between; }
.lpd__logs ul { margin: 0; padding: 0; list-style: none; }
.lpd__logs li { display: flex; gap: 10px; padding: 5px 2px; border-bottom: 1px solid var(--theme-divider); font-size: 11.5px; color: var(--theme-text-secondary); word-break: break-all; }
.lpd__logs li span { flex-shrink: 0; color: var(--theme-text-muted); }
.lpd__logs li.is-error { color: var(--vg-red); }

@media (max-width: 900px) {
  .lpd__results, .lpd__prompts { grid-template-columns: 1fr; }
  .lpd__steps { grid-auto-flow: row; }
  .lpd__steps li { border-left: 0; border-top: 1px solid var(--theme-divider); }
  .lpd__steps li:first-child { border-top: 0; }
  .lpd__now { flex-direction: column; align-items: stretch; }
}
</style>
