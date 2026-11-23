<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  AlertTriangle,
  Captions,
  Clock3,
  FileImage,
  FileJson,
  FolderOpen,
  Logs,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCcw,
  ScanLine,
  Trash2,
  Undo2,
} from 'lucide-vue-next'
import type { LivePhotoItem } from './types'
import { livePhotoProgress, useNow } from './progress'
import { useProgressText } from './useProgressText'

/**
 * 库 / 导出里的一张任务卡：一句话说清进行到哪、在等什么、等了多久；
 * 底部只放一个当下最该点的按钮 + 详情，其余操作收进「更多」菜单。
 */
export type LivePhotoCardAction =
  | 'select' | 'details' | 'play' | 'retry' | 'retryImage' | 'continueVideo' | 'region' | 'resume' | 'pause'
  | 'logs' | 'subtitle' | 'revertSubtitle' | 'reveal' | 'metadata' | 'delete'

export type LivePhotoCardCaps = {
  thumb: string
  hasVideo: boolean
  hasSubtitle: boolean
  hasAppliedSubtitle: boolean
  hasMetadata: boolean
  canRegion: boolean
  canRetryImage: boolean
  canContinueVideo: boolean
  subtitleBusy?: boolean
}

const props = defineProps<{ item: LivePhotoItem; caps: LivePhotoCardCaps; selected: boolean; list?: boolean; time: string }>()
const emit = defineEmits<{ action: [name: LivePhotoCardAction] }>()
const text = useProgressText()
const { t } = text
const now = useNow()
const menuOpen = ref(false)

const p = computed(() => livePhotoProgress(props.item))
const title = computed(() => props.item.sourceShotLabel || props.item.productSnapshot?.name || props.item.id)
const sub = computed(() => {
  const kind = t(`lpTask.detail.kind.${props.item.sourceType}`)
  const name = props.item.sourceType === 'clone_shot' ? props.item.sourceProjectTitle : props.item.productSnapshot?.name
  return name && name !== title.value ? `${kind} · ${name}` : kind
})
const tone = computed(() => {
  const state = p.value.state
  if (state === 'done') return 'is-ok'
  if (state === 'failed') return 'is-err'
  if (state === 'retrying' || state === 'paused') return 'is-warn'
  if (state === 'running' || state === 'waiting') return 'is-run'
  return ''
})
const line = computed(() => {
  const progress = p.value
  if (progress.failure) {
    const reason = text.failureLabel(progress)
    return progress.state === 'retrying' ? `${reason} · ${text.nextLabel(progress)}` : reason
  }
  if (progress.state === 'running' || progress.state === 'waiting') {
    const waited = progress.startedAt ? t('lpTask.waited', { d: text.duration(now.value - progress.startedAt) }) : ''
    return [text.shortLabel(progress), waited].filter(Boolean).join(' · ')
  }
  if (progress.state === 'done') return props.time
  return text.stateLabel(progress)
})

/** 当下最该点的按钮（最多两个） */
const primary = computed<Array<{ action: LivePhotoCardAction; label: string; icon: any; strong?: boolean }>>(() => {
  const progress = p.value
  if (props.caps.canContinueVideo || props.caps.canRetryImage) {
    return [
      ...(props.caps.canContinueVideo ? [{ action: 'continueVideo' as const, label: t('lpTask.action.continueVideo'), icon: Play, strong: true }] : []),
      ...(props.caps.canRetryImage ? [{ action: 'retryImage' as const, label: t('lpTask.action.retryImage'), icon: RefreshCcw }] : []),
    ]
  }
  if (progress.state === 'done' && props.caps.hasVideo) return [{ action: 'play', label: t('lpTask.action.play'), icon: Play, strong: true }]
  if (progress.next === 'region' && props.caps.canRegion) return [{ action: 'region', label: t('lpTask.action.region'), icon: ScanLine, strong: true }]
  if (progress.state === 'paused') return [{ action: 'resume', label: t('lpTask.action.resume'), icon: Play, strong: true }]
  if (progress.state === 'failed') return [{ action: 'retry', label: t('lpTask.action.retry'), icon: RefreshCcw, strong: true }]
  return []
})

const processing = computed(() => props.item.packagingStatus === 'processing')
const menu = computed(() =>
  [
    { action: 'logs' as const, label: t('lpTask.action.logs'), icon: Logs, show: true },
    { action: 'play' as const, label: t('lpTask.action.play'), icon: Play, show: props.caps.hasVideo && !primary.value.some((x) => x.action === 'play'), testid: `live-photo-preview-${props.item.id}` },
    { action: 'subtitle' as const, label: t('lpTask.action.subtitle'), icon: Captions, show: props.caps.hasVideo },
    { action: 'revertSubtitle' as const, label: t('lpTask.action.revertSubtitle'), icon: Undo2, show: props.caps.hasAppliedSubtitle, disabled: props.caps.subtitleBusy },
    { action: 'reveal' as const, label: t('lpTask.action.reveal'), icon: FolderOpen, show: props.caps.hasVideo, testid: `live-photo-reveal-${props.item.id}` },
    { action: 'metadata' as const, label: t('lpTask.action.metadata'), icon: FileJson, show: props.caps.hasMetadata, testid: `live-photo-metadata-${props.item.id}` },
    { action: 'region' as const, label: t('lpTask.action.region'), icon: ScanLine, show: props.caps.canRegion && !primary.value.some((x) => x.action === 'region'), testid: `live-photo-region-${props.item.id}` },
    { action: 'retry' as const, label: t('lpTask.action.regenerate'), icon: RefreshCcw, show: !primary.value.some((x) => x.action === 'retry'), disabled: processing.value, testid: `live-photo-retry-${props.item.id}` },
    {
      action: (props.item.autoFlowStatus?.paused ? 'resume' : 'pause') as LivePhotoCardAction,
      label: props.item.autoFlowStatus?.paused ? t('lpTask.action.resume') : t('lpTask.action.pause'),
      icon: props.item.autoFlowStatus?.paused ? Play : Pause,
      show: props.item.packagingStatus !== 'completed' && !primary.value.some((x) => x.action === 'resume'),
    },
  ].filter((entry) => entry.show),
)

function run(action: LivePhotoCardAction) {
  menuOpen.value = false
  emit('action', action)
}

function onDocClick(event: MouseEvent) {
  if (!(event.target as HTMLElement)?.closest?.(`[data-lpc-menu="${props.item.id}"]`)) menuOpen.value = false
}
function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) setTimeout(() => document.addEventListener('click', onDocClick, { once: true }), 0)
}
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <article class="lpc" :class="[tone, { 'is-on': selected, 'is-list': list }]" :data-testid="`live-photo-item-${item.id}`">
    <div class="lpc__media">
      <button class="lpc__thumb" type="button" :aria-label="caps.hasVideo ? t('lpTask.action.play') : t('lpTask.action.details')" @click="run(caps.hasVideo ? 'play' : 'details')">
        <img v-if="caps.thumb" :src="caps.thumb" alt="" loading="lazy" decoding="async" />
        <FileImage v-else :size="22" />
        <span v-if="caps.hasVideo" class="lpc__play" aria-hidden="true"><Play :size="16" /></span>
      </button>
      <label class="lpc__check" :title="t('lpTask.action.select')">
        <input :data-testid="`live-photo-select-${item.id}`" type="checkbox" :checked="selected" @change="run('select')" />
      </label>
      <span v-if="caps.hasSubtitle" class="lpc__badge">{{ t('lpTask.detail.withSubtitle') }}</span>
    </div>

    <div class="lpc__body">
      <div class="lpc__head">
        <h3 :title="title">{{ title }}</h3>
        <span class="lpc__state"><i />{{ text.stateLabel(p) }}</span>
      </div>
      <p class="lpc__sub" :title="sub">{{ sub }}</p>
      <ol class="lpc__steps" :aria-label="p.steps.map((s) => t(`lpTask.step.${s.key}`)).join(' → ')">
        <li v-for="step in p.steps" :key="step.key" :class="`is-${step.state}`" :title="t(`lpTask.step.${step.key}`)" />
      </ol>
      <p class="lpc__line" :class="{ 'is-err': p.failure && p.state === 'failed', 'is-warn': p.failure && p.state !== 'failed' }" :title="p.failure?.detail || line">
        <AlertTriangle v-if="p.failure" :size="12" /><Clock3 v-else :size="12" />
        <span>{{ line }}</span>
      </p>
    </div>

    <footer class="lpc__foot">
      <button
        v-for="btn in primary"
        :key="btn.action"
        class="vg-btn vg-btn--xs"
        :class="btn.strong ? 'vg-btn--primary' : ''"
        type="button"
        :data-testid="btn.action === 'retry' || btn.action === 'retryImage' ? `live-photo-retry-${item.id}` : btn.action === 'play' ? `live-photo-preview-${item.id}` : undefined"
        :disabled="(btn.action === 'retry' || btn.action === 'retryImage') && processing"
        @click.stop="run(btn.action)"
      >
        <component :is="btn.icon" :size="12" />{{ btn.label }}
      </button>
      <button v-if="primary.length < 2" class="vg-btn vg-btn--xs vg-btn--ghost" type="button" :data-testid="`live-photo-details-${item.id}`" @click.stop="run('details')">{{ t('lpTask.action.details') }}</button>
      <span class="lpc__spacer" />
      <div class="vg-menu-wrap" :data-lpc-menu="item.id">
        <button class="vg-icon-btn vg-icon-btn--sm" type="button" :aria-label="t('lpTask.action.more')" :title="t('lpTask.action.more')" :aria-expanded="menuOpen" :data-testid="`live-photo-more-${item.id}`" @click.stop="toggleMenu">
          <MoreHorizontal :size="15" />
        </button>
        <div v-if="menuOpen" class="vg-menu vg-menu--up lpc__menu" role="menu">
          <button v-if="primary.length >= 2" type="button" role="menuitem" @click="run('details')"><FileImage :size="14" />{{ t('lpTask.action.details') }}</button>
          <button v-for="entry in menu" :key="entry.action" type="button" role="menuitem" :data-testid="entry.testid" :disabled="entry.disabled" @click="run(entry.action)">
            <component :is="entry.icon" :size="14" />{{ entry.label }}
          </button>
          <span class="lpc__menu-sep" />
          <button type="button" role="menuitem" class="danger" :data-testid="`live-photo-remove-${item.id}`" @click="run('delete')"><Trash2 :size="14" />{{ t('lpTask.action.delete') }}</button>
        </div>
      </div>
    </footer>
  </article>
</template>

<style scoped>
.lpc { position: relative; display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); transition: border-color .15s, box-shadow .15s; }
.lpc:hover { border-color: var(--theme-border-control); }
.lpc.is-on { border-color: var(--vg-accent); box-shadow: 0 0 0 3px var(--vg-accent-soft); }
.lpc__media { position: relative; border-radius: 11px 11px 0 0; overflow: hidden; }
.lpc__thumb { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 4 / 3; padding: 0; border: 0; background: var(--theme-panel-soft); color: var(--theme-text-muted); cursor: pointer; }
.lpc__thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.lpc__play { position: relative; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: rgba(0, 0, 0, .55); color: #fff; backdrop-filter: blur(4px); transition: background .15s; }
.lpc__thumb:hover .lpc__play { background: var(--vg-accent); color: var(--theme-on-accent); }
.lpc__check { position: absolute; top: 8px; left: 8px; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; background: rgba(0, 0, 0, .45); cursor: pointer; }
.lpc__badge { position: absolute; top: 8px; right: 8px; padding: 2px 7px; border-radius: 6px; background: rgba(0, 0, 0, .55); color: #fff; font-size: 10.5px; }

.lpc__body { display: flex; flex-direction: column; gap: 6px; padding: 11px 13px 10px; min-width: 0; flex: 1; }
.lpc__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.lpc__head h3 { min-width: 0; margin: 0; font-size: 14px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lpc__state { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; font-size: 11.5px; font-weight: 600; color: var(--theme-text-muted); white-space: nowrap; }
.lpc__state i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.is-ok .lpc__state { color: var(--vg-green, #16a34a); }
.is-err .lpc__state { color: var(--vg-red); }
.is-warn .lpc__state { color: var(--vg-amber); }
.is-run .lpc__state { color: var(--vg-blue); }
.is-run .lpc__state i { animation: lpc-pulse 1.6s ease-in-out infinite; }
@keyframes lpc-pulse { 50% { opacity: .35; } }
.lpc__sub { margin: 0; font-size: 11.5px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.lpc__steps { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3px; margin: 4px 0 0; padding: 0; list-style: none; }
.lpc__steps li { height: 4px; border-radius: 2px; background: var(--theme-divider); }
.lpc__steps li.is-done { background: var(--vg-accent); }
.lpc__steps li.is-active { background: linear-gradient(90deg, var(--vg-blue) 0 50%, color-mix(in srgb, var(--vg-blue) 30%, transparent) 50%); background-size: 200% 100%; animation: lpc-flow 1.8s linear infinite; }
.lpc__steps li.is-failed { background: var(--vg-red); }
.is-warn .lpc__steps li.is-failed { background: var(--vg-amber); }
@keyframes lpc-flow { from { background-position: 100% 0; } to { background-position: 0 0; } }

.lpc__line { display: flex; align-items: center; gap: 5px; min-width: 0; margin: 0; font-size: 11.5px; color: var(--theme-text-secondary); font-variant-numeric: tabular-nums; }
.lpc__line svg { flex-shrink: 0; color: var(--theme-text-muted); }
.lpc__line span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lpc__line.is-err, .lpc__line.is-err svg { color: var(--vg-red); }
.lpc__line.is-warn, .lpc__line.is-warn svg { color: var(--vg-amber); }

.lpc__foot { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--theme-divider); }
.lpc__spacer { flex: 1; }
.lpc__menu { min-width: 170px; }
.lpc__menu-sep { height: 1px; margin: 4px 2px; background: var(--theme-divider); }

.lpc.is-list { flex-direction: row; align-items: stretch; }
.lpc.is-list .lpc__media { width: 148px; flex-shrink: 0; border-radius: 11px 0 0 11px; }
.lpc.is-list .lpc__thumb { height: 100%; aspect-ratio: auto; min-height: 96px; }
.lpc.is-list .lpc__foot { border-top: 0; border-left: 1px solid var(--theme-divider); align-self: stretch; }
</style>
