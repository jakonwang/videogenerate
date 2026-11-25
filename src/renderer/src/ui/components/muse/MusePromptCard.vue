<script setup lang="ts">
/** Versioned prompts. The video text being edited is what new jobs use; the swap text used is the active version. */
import { m } from './museText'
import { computed, onMounted, ref } from 'vue'
import type { MusePromptKind, MusePromptVersion } from '../../../../../main/modules/muse-creative-studio/types'
import { museError } from './museLabels'

const prompt = defineModel<string>({ required: true })
defineProps<{ styleActive?: boolean }>()

const api = window.api.museCreative
const kind = ref<MusePromptKind>('video')
const versions = ref<MusePromptVersion[]>([])
const selectedId = ref('')
const name = ref('')
const imageText = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')

const text = computed({
  get: () => (kind.value === 'video' ? prompt.value : imageText.value),
  set: (value: string) => { if (kind.value === 'video') prompt.value = value; else imageText.value = value },
})
const selected = computed(() => versions.value.find((item) => item.id === selectedId.value))
const changed = computed(() => Boolean(selected.value && (selected.value.prompt !== text.value || selected.value.name !== name.value)))

function apply(id: string, keepText = false) {
  const item = versions.value.find((entry) => entry.id === id)
  if (!item) return
  selectedId.value = id
  name.value = item.name
  if (!keepText) text.value = item.prompt
}

async function load(id?: string, keepText = false) {
  versions.value = await api.listPrompts(kind.value)
  const target = versions.value.find((item) => item.id === id) || versions.value.find((item) => item.active) || versions.value[0]
  if (target) apply(target.id, keepText)
}

async function run(work: () => Promise<MusePromptVersion>, done: string) {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const saved = await work()
    await load(saved.id)
    notice.value = done
  } catch (e) {
    error.value = museError(e)
  } finally {
    busy.value = false
  }
}

const update = () => run(() => api.updatePrompt({ id: selectedId.value, name: name.value, prompt: text.value }), m('已更新'))
const copy = () => run(() => api.copyPrompt({ kind: kind.value, name: name.value, prompt: text.value }), m('已存为新版本'))
const activate = () => run(() => api.activatePrompt(selectedId.value), m('已启用'))
const rollback = () => run(() => api.rollbackPrompt(selectedId.value), m('已回滚到这个版本'))

async function switchKind(next: MusePromptKind) {
  kind.value = next
  notice.value = ''
  // Coming back to the video tab must not throw away unsaved text.
  await load(undefined, next === 'video' && Boolean(prompt.value.trim())).catch((e) => { error.value = museError(e) })
}

onMounted(() => load(undefined, Boolean(prompt.value.trim())).catch((e) => { error.value = museError(e) }))
</script>

<template>
  <section class="ts-card ts-block ts-prompt" data-testid="muse-prompts">
    <header class="ts-block__head"><div class="ts-block__title"><h2>{{ m('提示词版本') }}</h2><p>{{ kind === 'video' ? (styleActive ? m('使用同款参考时，视频提示词由参考视频生成') : m('写清镜头和必须保持的商品细节')) : m('换图时使用「启用」的版本') }}</p></div></header>
    <div class="ts-seg ts-seg--full" role="tablist">
      <button type="button" role="tab" :class="{ 'is-on': kind === 'image' }" :aria-selected="kind === 'image'" :disabled="busy" data-testid="muse-prompt-image" @click="switchKind('image')">{{ m('换图') }}</button>
      <button type="button" role="tab" :class="{ 'is-on': kind === 'video' }" :aria-selected="kind === 'video'" :disabled="busy" @click="switchKind('video')">{{ m('视频') }}</button>
    </div>
    <div class="ts-prompt__grid">
      <label class="vg-field"><span class="vg-field__label">{{ m('版本') }}</span>
        <select class="vg-input vg-select" :value="selectedId" :disabled="busy" @change="apply(($event.target as HTMLSelectElement).value)"><option v-for="item in versions" :key="item.id" :value="item.id">V{{ item.version }} · {{ item.name }}{{ item.active ? m(' · 当前启用') : '' }}</option></select>
      </label>
      <label class="vg-field"><span class="vg-field__label">{{ m('版本名称') }}</span><input v-model="name" class="vg-input" /></label>
    </div>
    <label class="vg-field"><span class="vg-field__label">{{ kind === 'video' ? m('视频提示词') : m('商品替换提示词') }}</span><textarea v-model="text" class="vg-textarea ts-prompt__text" rows="9" maxlength="4000" spellcheck="false" data-testid="muse-prompt" /></label>
    <p v-if="kind === 'image' && changed" class="vg-muted mp__hint">{{ m('修改后要「更新版本」才会用于换图') }}</p>
    <p v-if="error" class="vg-notice vg-notice--danger" role="alert">{{ m(error) }}</p>
    <p v-else-if="notice" class="vg-muted mp__hint">{{ notice }}</p>
    <div class="ts-prompt__actions">
      <button class="vg-btn vg-btn--sm vg-btn--ghost" type="button" :disabled="busy || !selectedId" @click="rollback">{{ m('回滚到此') }}</button>
      <span class="ts-prompt__spacer" />
      <button class="vg-btn vg-btn--sm" type="button" :disabled="busy || !text.trim()" data-testid="muse-prompt-copy" @click="copy">{{ m('存为新版本') }}</button>
      <button class="vg-btn vg-btn--sm" type="button" :disabled="busy || !selectedId || selected?.active" data-testid="muse-prompt-activate" @click="activate">{{ m('启用版本') }}</button>
      <button class="vg-btn vg-btn--sm vg-btn--primary" type="button" :disabled="busy || !changed" @click="update">{{ m('更新版本') }}</button>
    </div>
  </section>
</template>

<style scoped>
.mp__hint { margin: 0; font-size: 12px; }
</style>
