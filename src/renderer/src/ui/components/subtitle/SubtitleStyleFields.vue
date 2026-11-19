<script setup lang="ts">
/**
 * 标题样式：模板、字体、颜色、字号 / 描边 / 阴影 / 宽度、粗细、位置（含自定义）、对齐、最大行数、
 * 各行一样大、每条视频位置微调。「视频批量字幕」页面和各模块的「批量添加字幕」弹窗共用。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { layoutTitle } from '../../../../../shared/subtitleTitleLayout'
import {
  SUBTITLE_FONT_OPTIONS,
  applySubtitlePreset,
  measureSubtitleText,
  subtitlePresets,
  type SubtitleCaptionStyle,
  type SubtitlePresetId,
} from '@/lib/subtitleStyle'

const props = defineProps<{ modelValue: SubtitleCaptionStyle; preset: SubtitlePresetId; title?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: SubtitleCaptionStyle]; 'update:preset': [value: SubtitlePresetId] }>()
const { t: tr } = useI18n()

const style = computed(() => props.modelValue)
const presets = computed(() => subtitlePresets(tr))
const fontListId = `stsf-fonts-${Math.random().toString(36).slice(2, 8)}`

function set<K extends keyof SubtitleCaptionStyle>(key: K, value: SubtitleCaptionStyle[K]) {
  emit('update:modelValue', { ...style.value, [key]: value })
}
function num(event: Event) {
  return Number((event.target as HTMLInputElement).value)
}
function pickPreset(id: SubtitlePresetId) {
  const preset = presets.value.find((item) => item.id === id)
  if (!preset) return
  emit('update:preset', id)
  emit('update:modelValue', applySubtitlePreset(style.value, preset))
}

const isCustomPosition = computed(() => style.value.offsetYRatio !== null && style.value.offsetYRatio !== undefined)
function setPosition(pos: 'top' | 'center' | 'bottom' | 'custom') {
  if (pos === 'custom') {
    if (!isCustomPosition.value) emit('update:modelValue', { ...style.value, offsetYRatio: 0.42 })
    return
  }
  emit('update:modelValue', { ...style.value, position: pos, offsetYRatio: null, offsetXRatio: null })
}

/** 标题超过最大行数时缩小到的比例（提示用） */
const shrink = computed(() =>
  props.title ? layoutTitle(props.title, { ...style.value, lineMode: 'multi' }, (text, size) => measureSubtitleText(style.value.fontName, text, size)).scale : 1,
)
/** 颜色框只认 #RRGGBB；模板里的 rgba 阴影色显示成黑色 */
function hexOf(color: string | undefined) {
  return /^#[0-9a-f]{6}$/i.test(String(color || '')) ? String(color) : '#000000'
}
</script>

<template>
  <div class="stsf">
    <div class="stsf__presets">
      <button
        v-for="preset in presets"
        :key="preset.id"
        class="stsf__preset"
        :class="{ 'is-active': props.preset === preset.id }"
        type="button"
        :title="preset.summary"
        @click="pickPreset(preset.id)"
      >
        <span
          class="stsf__sample"
          :style="{
            color: preset.style.fontColor,
            WebkitTextStroke: `${Math.min(3, (preset.style.strokeWidth || 0) / 2)}px ${preset.style.strokeColor}`,
            fontFamily: `'${preset.style.fontName}', sans-serif`,
            fontWeight: preset.style.fontWeight ?? 900,
            fontSize: preset.id === 'tiktok-native' ? '13px' : undefined,
            textShadow: preset.id === 'tiktok-native' ? '0 2px 6px rgba(0,0,0,.8)' : undefined,
          }"
        >{{ preset.id === 'tiktok-native' ? 'Sáng lấp lánh ✨' : 'Aa 爆款' }}</span>
        <strong>{{ preset.name }}</strong>
      </button>
    </div>

    <div class="vg-form-grid stsf__form">
      <label class="vg-field">
        <span class="vg-field__label">{{ tr('autoUi.k_b50d4d8352f5') }}</span>
        <input :value="style.fontName" class="vg-input" :list="fontListId" @input="set('fontName', ($event.target as HTMLInputElement).value)" />
        <datalist :id="fontListId"><option v-for="font in SUBTITLE_FONT_OPTIONS" :key="font" :value="font" /></datalist>
      </label>
      <div class="vg-field">
        <span class="vg-field__label">{{ tr('bsx.colors') }}</span>
        <div class="stsf__colors">
          <label><input :value="hexOf(style.fontColor)" type="color" @input="set('fontColor', ($event.target as HTMLInputElement).value)" /><span>{{ tr('bsx.colorText') }}</span></label>
          <label><input :value="hexOf(style.strokeColor)" type="color" @input="set('strokeColor', ($event.target as HTMLInputElement).value)" /><span>{{ tr('bsx.colorStroke') }}</span></label>
          <label><input :value="hexOf(style.shadowColor)" type="color" @input="set('shadowColor', ($event.target as HTMLInputElement).value)" /><span>{{ tr('bsx.colorShadow') }}</span></label>
        </div>
      </div>
      <label class="vg-field"><span class="vg-field__label">{{ tr('autoUi.k_576ccdb1f1c7') }} · {{ style.fontSize }}</span><input :value="style.fontSize" type="range" min="24" max="120" step="1" @input="set('fontSize', num($event))" /></label>
      <div class="vg-field">
        <span class="vg-field__label">{{ tr('bsx.weight') }}</span>
        <div class="stsf__chips">
          <button v-for="weight in [400, 600, 700, 900]" :key="weight" type="button" class="vg-chip stsf__chip" :class="{ 'is-on': (style.fontWeight ?? 900) === weight }" @click="set('fontWeight', weight)">{{ tr(`bsx.weight_${weight}`) }}</button>
        </div>
      </div>
      <label class="vg-field"><span class="vg-field__label">{{ tr('bsx.strokeWidth') }} · {{ style.strokeWidth }}</span><input :value="style.strokeWidth" type="range" min="0" max="12" step="1" @input="set('strokeWidth', num($event))" /></label>
      <label class="vg-field"><span class="vg-field__label">{{ tr('autoUi.k_7f36b37b3b4f') }} · {{ style.shadowBlur }}</span><input :value="style.shadowBlur" type="range" min="0" max="40" step="1" @input="set('shadowBlur', num($event))" /></label>
      <div class="vg-field">
        <span class="vg-field__label">{{ tr('autoUi.k_88c34452cc46') }}</span>
        <div class="stsf__chips">
          <button v-for="pos in (['top', 'center', 'bottom'] as const)" :key="pos" type="button" class="vg-chip stsf__chip" :class="{ 'is-on': !isCustomPosition && style.position === pos }" @click="setPosition(pos)">{{ tr(`bsx.pos_${pos}`) }}</button>
          <button type="button" class="vg-chip stsf__chip" :class="{ 'is-on': isCustomPosition }" @click="setPosition('custom')">{{ tr('bsx.pos_custom') }}</button>
        </div>
      </div>
      <div class="vg-field">
        <span class="vg-field__label">{{ tr('autoUi.k_47b8b7519755') }}</span>
        <div class="stsf__chips">
          <button v-for="align in (['left', 'center', 'right'] as const)" :key="align" type="button" class="vg-chip stsf__chip" :class="{ 'is-on': style.textAlign === align }" @click="set('textAlign', align)">{{ tr(`bsx.align_${align}`) }}</button>
        </div>
      </div>
      <template v-if="isCustomPosition">
        <label class="vg-field"><span class="vg-field__label">{{ tr('bsx.posY') }} · {{ Math.round((style.offsetYRatio ?? 0.42) * 100) }}%</span><input :value="style.offsetYRatio ?? 0.42" type="range" min="0.05" max="0.95" step="0.01" @input="set('offsetYRatio', num($event))" /></label>
        <label class="vg-field">
          <span class="vg-field__label">{{ tr('bsx.posX') }} · {{ style.offsetXRatio == null ? tr('bsx.posXAuto') : `${Math.round(style.offsetXRatio * 100)}%` }}</span>
          <input :value="style.offsetXRatio ?? 0.5" type="range" min="0.1" max="0.9" step="0.01" @input="set('offsetXRatio', num($event))" />
        </label>
      </template>
      <label v-else-if="style.position === 'bottom'" class="vg-field"><span class="vg-field__label">{{ tr('autoUi.k_d36447206aaa') }} · {{ style.bottomMargin }}</span><input :value="style.bottomMargin" type="range" min="48" max="600" step="4" @input="set('bottomMargin', num($event))" /></label>
      <label v-else-if="style.position === 'top'" class="vg-field"><span class="vg-field__label">{{ tr('bsx.topMargin') }} · {{ style.safeMargin }}</span><input :value="style.safeMargin" type="range" min="0" max="40" step="1" @input="set('safeMargin', num($event))" /></label>
      <label class="vg-field"><span class="vg-field__label">{{ tr('bsx.widthRatio') }} · {{ Math.round((style.maxWidthRatio || 0.72) * 100) }}%</span><input :value="style.maxWidthRatio" type="range" min="0.4" max="0.92" step="0.02" @input="set('maxWidthRatio', num($event))" /></label>
      <div class="vg-field">
        <span class="vg-field__label">{{ tr('autoUi.k_3ca120ca0195') }}</span>
        <div class="stsf__chips">
          <button v-for="n in [1, 2, 3, 4]" :key="n" type="button" class="vg-chip stsf__chip" :class="{ 'is-on': style.maxLines === n }" @click="set('maxLines', n)">{{ n }}</button>
        </div>
      </div>
    </div>

    <div class="stsf__switches">
      <button type="button" class="vg-switch" :class="{ 'is-on': (style.secondaryScale ?? 0.68) >= 1 }" @click="set('secondaryScale', (style.secondaryScale ?? 0.68) >= 1 ? 0.68 : 1)"><span class="vg-switch__track"></span>{{ tr('bsx.sameSize') }}</button>
      <button type="button" class="vg-switch" :class="{ 'is-on': (style.positionJitter ?? 0) > 0 }" @click="set('positionJitter', (style.positionJitter ?? 0) > 0 ? 0 : 0.04)"><span class="vg-switch__track"></span>{{ tr('bsx.jitter') }}</button>
    </div>
    <p v-if="(style.positionJitter ?? 0) > 0" class="stsf__help">{{ tr('bsx.jitterHint') }}</p>
    <p v-if="shrink < 1" class="stsf__help stsf__help--warn">{{ tr('bsx.shrunk', { p: Math.round(shrink * 100) }) }}</p>
  </div>
</template>

<style scoped>
.stsf { display: grid; gap: 12px; }
.stsf input[type='range'] { accent-color: var(--vg-accent); width: 100%; }
.stsf__presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
.stsf__preset { display: grid; justify-items: center; gap: 6px; padding: 10px 8px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm, 8px); background: #10151f; cursor: pointer; transition: all .15s; }
.stsf__preset:hover { border-color: var(--theme-border-control, var(--theme-border)); }
.stsf__preset.is-active { border-color: var(--vg-accent); box-shadow: 0 0 0 1px var(--vg-accent); }
.stsf__sample { font-size: 20px; font-weight: 900; line-height: 1.1; paint-order: stroke fill; white-space: nowrap; }
.stsf__preset strong { font-size: 11.5px; font-weight: 600; color: rgba(255, 255, 255, .85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.stsf__form { row-gap: 14px; }
.stsf__colors { display: flex; gap: 12px; flex-wrap: wrap; }
.stsf__colors label { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--theme-text-secondary); cursor: pointer; }
.stsf__colors input[type='color'] { width: 30px; height: 30px; padding: 2px; border: 1px solid var(--theme-border); border-radius: 7px; background: var(--theme-panel); cursor: pointer; }
.stsf__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.stsf__chip { cursor: pointer; height: 28px; padding: 0 12px; font-size: 12px; }
.stsf__chip.is-on { background: var(--vg-accent-soft); border-color: var(--vg-accent-line); color: var(--vg-accent); }
.stsf__switches { display: flex; flex-wrap: wrap; gap: 8px 20px; }
.stsf__switches .vg-switch { border: 0; background: transparent; padding: 0; }
.stsf__help { margin: 0; font-size: 12px; color: var(--theme-text-muted); }
.stsf__help--warn { color: var(--vg-amber); }
</style>
