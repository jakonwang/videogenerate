<script setup lang="ts">
/**
 * 标题内容：统一标题 / 随机标题池、写法提示、常用表情、AI 帮我写标题。
 * 「视频批量字幕」页面和各模块的「批量添加字幕」弹窗共用。
 */
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { LoaderCircle, Sparkles } from 'lucide-vue-next'
import { webApiClient } from '@/lib/webApiClient'
import { SUBTITLE_EMOJIS, splitTitlePool, type SubtitleTitleStrategy } from '@/lib/subtitleStyle'

const props = withDefaults(defineProps<{ strategy: SubtitleTitleStrategy; titleText: string; poolText: string; hint?: string; showAi?: boolean }>(), { hint: '', showAi: true })
const emit = defineEmits<{
  'update:strategy': [value: SubtitleTitleStrategy]
  'update:titleText': [value: string]
  'update:poolText': [value: string]
  error: [message: string]
  notice: [message: string]
}>()
const { t: tr } = useI18n()

const poolItems = computed(() => splitTitlePool(props.poolText))
const singleRef = ref<HTMLTextAreaElement | null>(null)
const poolRef = ref<HTMLTextAreaElement | null>(null)
let lastFocused: HTMLTextAreaElement | null = null
function markFocused(event: FocusEvent) {
  lastFocused = event.target as HTMLTextAreaElement
}

/** 表情插到光标处；随机标题池没点进输入框时给每条末尾都加 */
function insertEmoji(emoji: string) {
  const pool = props.strategy === 'random_pool'
  const target = pool ? poolRef.value : singleRef.value
  const focused = target && lastFocused === target
  if (pool && !focused) {
    emit('update:poolText', poolItems.value.map((line) => `${line} ${emoji}`).join('\n'))
    return
  }
  const value = pool ? props.poolText : props.titleText
  const at = focused ? (target!.selectionStart ?? value.length) : value.length
  const spacer = at && !/\s$/.test(value.slice(0, at)) ? ' ' : ''
  const next = `${value.slice(0, at)}${spacer}${emoji}${value.slice(at)}`
  if (pool) emit('update:poolText', next)
  else emit('update:titleText', next)
  void nextTick(() => {
    if (!target) return
    target.focus()
    const pos = at + spacer.length + emoji.length
    target.setSelectionRange(pos, pos)
  })
}

/* AI 写标题：填进随机标题池 */
const aiOpen = ref(false)
const aiPrompt = ref('')
const aiLanguage = ref<'vi' | 'en' | 'zh'>('vi')
const aiBusy = ref(false)
async function generateTitles() {
  const prompt = aiPrompt.value.trim()
  if (!prompt || aiBusy.value) return
  aiBusy.value = true
  try {
    const languageName = aiLanguage.value === 'vi' ? 'Vietnamese' : aiLanguage.value === 'en' ? 'English' : 'Chinese'
    const result = await webApiClient.generateBatchSubtitleTitles({ prompt, count: 10, contentLanguage: languageName })
    const titles = (result.titles || []).map((item) => String(item).trim()).filter(Boolean)
    if (!titles.length) throw new Error(tr('bsx.aiEmpty'))
    const existing = poolItems.value
    emit('update:poolText', [...existing, ...titles.filter((item) => !existing.includes(item))].join('\n'))
    emit('update:strategy', 'random_pool')
    aiOpen.value = false
    emit('notice', tr('bsx.aiDone', { n: titles.length }))
  } catch (error) {
    emit('error', String((error as Error)?.message ?? error))
  } finally {
    aiBusy.value = false
  }
}
</script>

<template>
  <div class="stf">
    <div class="stf__tip">{{ tr('bsx.titleTip') }}</div>
    <div class="stf__row">
      <div class="vg-seg vg-seg--sm">
        <button class="vg-seg__btn" :class="{ 'is-active': strategy === 'single_for_all' }" type="button" @click="emit('update:strategy', 'single_for_all')">{{ tr('autoUi.k_73e18b3f4a29') }}</button>
        <button class="vg-seg__btn" :class="{ 'is-active': strategy === 'random_pool' }" type="button" @click="emit('update:strategy', 'random_pool')">{{ tr('autoUi.k_84ba3e6f5cfb') }}</button>
      </div>
      <button v-if="showAi" type="button" class="vg-btn vg-btn--sm vg-btn--soft" @click="aiOpen = !aiOpen"><Sparkles :size="14" />{{ tr('bsx.aiWrite') }}</button>
    </div>

    <div v-if="aiOpen" class="stf__ai">
      <textarea v-model="aiPrompt" class="vg-textarea" rows="2" :placeholder="tr('bsx.aiPlaceholder')"></textarea>
      <div class="stf__row">
        <div class="vg-seg vg-seg--sm">
          <button v-for="lang in (['vi', 'en', 'zh'] as const)" :key="lang" type="button" class="vg-seg__btn" :class="{ 'is-active': aiLanguage === lang }" @click="aiLanguage = lang">{{ tr(`bsx.lang_${lang}`) }}</button>
        </div>
        <button type="button" class="vg-btn vg-btn--sm vg-btn--primary" :disabled="!aiPrompt.trim() || aiBusy" @click="generateTitles">
          <LoaderCircle v-if="aiBusy" :size="14" class="vg-spin" /><Sparkles v-else :size="14" />{{ tr('bsx.aiGenerate') }}
        </button>
      </div>
    </div>

    <template v-if="strategy === 'single_for_all'">
      <textarea
        ref="singleRef"
        class="vg-textarea stf__input"
        rows="2"
        :value="titleText"
        :placeholder="tr('bsx.sharedPlaceholder')"
        @input="emit('update:titleText', ($event.target as HTMLTextAreaElement).value)"
        @focus="markFocused"
      ></textarea>
      <p v-if="hint" class="stf__help">{{ hint }}</p>
    </template>
    <template v-else>
      <textarea
        ref="poolRef"
        class="vg-textarea stf__input"
        rows="5"
        :value="poolText"
        :placeholder="tr('autoUi.k_8b5a652b83d0')"
        @input="emit('update:poolText', ($event.target as HTMLTextAreaElement).value)"
        @focus="markFocused"
      ></textarea>
      <p class="stf__help">{{ tr('bsx.poolHint') }} · <b>{{ tr('bsx.titleCount', { n: poolItems.length }) }}</b></p>
    </template>

    <div class="stf__emojis">
      <span>{{ tr('bsx.addEmoji') }}</span>
      <button v-for="emoji in SUBTITLE_EMOJIS" :key="emoji" type="button" class="stf__emoji" @mousedown.prevent @click="insertEmoji(emoji)">{{ emoji }}</button>
    </div>
  </div>
</template>

<style scoped>
.stf { display: grid; gap: 10px; }
.stf__tip { padding: 8px 10px; border-radius: var(--vg-radius-sm, 8px); background: var(--vg-accent-soft); color: var(--theme-text-secondary); font-size: 12px; line-height: 1.5; }
.stf__row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.stf__ai { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--vg-accent-line); border-radius: var(--vg-radius-sm, 8px); background: var(--vg-accent-soft); }
.stf__ai textarea, .stf__input { display: block; width: 100%; resize: vertical; }
.stf__input { font-size: 14px; line-height: 1.5; }
.stf__help { margin: 0; font-size: 12px; color: var(--theme-text-muted); }
.stf__help b { color: var(--theme-text); }
.stf__emojis { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 12px; color: var(--theme-text-muted); }
.stf__emojis > span { margin-right: 4px; }
.stf__emoji { width: 30px; height: 28px; border: 1px solid var(--theme-border); border-radius: 7px; background: var(--theme-panel); font-size: 15px; line-height: 1; cursor: pointer; }
.stf__emoji:hover { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); }
</style>
