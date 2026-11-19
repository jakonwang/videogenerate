<script setup lang="ts">
/**
 * 「批量添加字幕」弹窗：复刻、图生视频、tk创意室共用，和「视频批量字幕」页面同一套标题 / 样式 / 实时预览。
 * 只负责收集标题和样式；点「开始生成字幕」把 titleConfig + captionStyle 交给调用的页面去提交。
 * 设置和批量字幕页面共用（本机记住），一处改了各处一致。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Captions, LoaderCircle, X } from 'lucide-vue-next'
import { thumbnailUrl } from '@/lib/localMedia'
import {
  loadSubtitleSettings,
  saveSubtitleSettings,
  splitTitlePool,
  type SubtitleCaptionStyle,
  type SubtitlePresetId,
  type SubtitleTitleStrategy,
} from '@/lib/subtitleStyle'
import SubtitleLivePreview from './SubtitleLivePreview.vue'
import SubtitleStyleFields from './SubtitleStyleFields.vue'
import SubtitleTitleFields from './SubtitleTitleFields.vue'

export type SubtitleDialogSubmit = {
  titleConfig: { strategy: SubtitleTitleStrategy; singleText: string; titlePool: string[] }
  captionStyle: SubtitleCaptionStyle
  /** 兼容旧的提交代码：同样的内容拆开给 */
  titleStrategy: SubtitleTitleStrategy
  titleText: string
  titlePoolText: string
}

const props = withDefaults(
  defineProps<{
    open: boolean
    mode?: 'batch' | 'single'
    count: number
    busy?: boolean
    /** 预览底图（第一条视频的封面路径） */
    previewImage?: string
    /** 没记住标题时的默认标题 */
    initialTitle?: string
  }>(),
  { mode: 'batch', busy: false, previewImage: '', initialTitle: '' },
)
const emit = defineEmits<{ close: []; submit: [payload: SubtitleDialogSubmit] }>()
const { t: tr } = useI18n()

const strategy = ref<SubtitleTitleStrategy>('single_for_all')
const titleText = ref('')
const poolText = ref('')
const captionStyle = ref<SubtitleCaptionStyle>(loadSubtitleSettings().captionStyle)
const preset = ref<SubtitlePresetId>('tiktok-native')
const error = ref('')
const notice = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const saved = loadSubtitleSettings()
    strategy.value = saved.titleStrategy
    titleText.value = saved.titleText || props.initialTitle
    poolText.value = saved.titlePoolText
    captionStyle.value = saved.captionStyle
    preset.value = saved.preset
    error.value = ''
    notice.value = ''
  },
  { immediate: true },
)
watch([strategy, titleText, poolText, captionStyle, preset], () => {
  if (!props.open) return
  saveSubtitleSettings({ captionStyle: captionStyle.value, titleStrategy: strategy.value, titleText: titleText.value, titlePoolText: poolText.value, preset: preset.value })
}, { deep: true })

const poolItems = computed(() => splitTitlePool(poolText.value))
const previewTitle = computed(() => (strategy.value === 'random_pool' ? poolItems.value[0] || '' : titleText.value.trim()))
const imageSrc = computed(() => (props.previewImage ? thumbnailUrl(props.previewImage, 640) : ''))

function submit() {
  if (props.busy) return
  error.value = ''
  if (strategy.value === 'random_pool' && !poolItems.value.length) {
    error.value = tr('bsx.needPool')
    return
  }
  if (strategy.value === 'single_for_all' && !titleText.value.trim()) {
    error.value = tr('bsx.needTitle')
    return
  }
  emit('submit', {
    titleConfig:
      strategy.value === 'random_pool'
        ? { strategy: 'random_pool', singleText: '', titlePool: poolItems.value }
        : { strategy: 'single_for_all', singleText: titleText.value.trim(), titlePool: [] },
    captionStyle: { ...captionStyle.value },
    titleStrategy: strategy.value,
    titleText: titleText.value.trim(),
    titlePoolText: poolText.value,
  })
}
function close() {
  if (!props.busy) emit('close')
}
</script>

<template>
  <div v-if="open" class="vg-scope vg-backdrop" @click.self="close">
    <section class="vg-dialog vg-dialog--xl ssd" role="dialog" aria-modal="true" @click.stop>
      <header class="vg-dialog__head">
        <div class="vg-dialog__title">
          <span class="vg-dialog__title-icon"><Captions :size="20" /></span>
          <div>
            <h2>{{ mode === 'batch' ? tr('autoUi.k_c6f0209a1cfa') : tr('autoUi.k_6e4c3e5ffee8') }}</h2>
            <p>{{ tr('bsx.dialogDesc', { n: count }) }}</p>
          </div>
        </div>
        <button type="button" class="vg-icon-btn" :disabled="busy" @click="close"><X :size="18" /></button>
      </header>
      <div class="vg-dialog__body ssd__body">
        <div class="ssd__editor">
          <section class="ssd__section">
            <h3>{{ tr('bsx.stepTitle') }}</h3>
            <SubtitleTitleFields
              v-model:strategy="strategy"
              v-model:title-text="titleText"
              v-model:pool-text="poolText"
              :hint="tr('bsx.dialogSharedHint')"
              @error="error = $event"
              @notice="notice = $event"
            />
          </section>
          <section class="ssd__section">
            <h3>{{ tr('bsx.stepStyle') }}</h3>
            <SubtitleStyleFields v-model="captionStyle" v-model:preset="preset" :title="previewTitle" />
          </section>
        </div>
        <aside class="ssd__preview">
          <SubtitleLivePreview v-model:caption-style="captionStyle" :title="previewTitle" :image-src="imageSrc" :empty-text="tr('bsx.previewEmpty')" />
          <p class="ssd__hint">{{ tr('bsx.dragHint') }}</p>
        </aside>
      </div>
      <footer class="vg-dialog__foot">
        <span v-if="error" class="ssd__error">{{ error }}</span>
        <span v-else-if="notice" class="ssd__notice">{{ notice }}</span>
        <div class="vg-dialog__foot-actions">
          <!-- 页面自己的额外按钮（如单条视频的「撤销字幕」） -->
          <slot name="actions" />
          <button type="button" class="vg-btn" :disabled="busy" @click="close">{{ tr('autoUi.k_4d0b4688c787') }}</button>
          <button type="button" class="vg-btn vg-btn--primary" :disabled="busy" @click="submit">
            <LoaderCircle v-if="busy" :size="15" class="vg-spin" />{{ busy ? tr('autoUi.k_dde1db57718c') : tr('bsx.dialogStart', { n: count }) }}
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.ssd { width: min(1080px, calc(100vw - 32px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column; }
.ssd__body { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 18px; overflow: hidden; min-height: 0; flex: 1; }
.ssd__editor { display: grid; gap: 18px; align-content: start; overflow-y: auto; min-height: 0; padding-right: 6px; }
.ssd__section { display: grid; gap: 10px; }
.ssd__section h3 { margin: 0; font-size: 14px; font-weight: 700; color: var(--theme-text); }
.ssd__preview { display: grid; align-content: start; gap: 8px; }
.ssd__hint { margin: 0; font-size: 12px; color: var(--theme-text-muted); }
.ssd__error { margin-right: auto; font-size: 12.5px; color: var(--vg-red); }
.ssd__notice { margin-right: auto; font-size: 12.5px; color: var(--vg-accent); }
@media (max-width: 860px) {
  .ssd__body { grid-template-columns: minmax(0, 1fr); overflow-y: auto; }
  .ssd__editor { overflow: visible; }
  .ssd__preview { max-width: 240px; margin: 0 auto; }
}
</style>
