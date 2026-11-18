<script setup lang="ts">
/**
 * 品牌记忆表单（网页设置页 / 手机「品牌记忆」页共用）。和电脑端「设置 → 品牌记忆」是同一份数据。
 */
import { ref, watch } from 'vue'
import { LoaderCircle, Save } from 'lucide-vue-next'
import { emptySyncBrand, type SyncBrand } from '@shared/cloud/sync'
import { parseWords, saveBrand, useBrand } from '@/lib/brand'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'

const props = defineProps<{ variant: 'web' | 'phone' }>()

type Form = Omit<SyncBrand, 'bannedWords'> & { bannedWords: string }
const toForm = (brand: SyncBrand): Form => ({ ...brand, bannedWords: brand.bannedWords.join('，') })

const { brand } = useBrand()
const form = ref<Form>(toForm(emptySyncBrand()))
const dirty = ref(false)
const saving = ref(false)

// Follow the synced copy (e.g. an edit on the computer) unless the user is in the middle of editing.
let applying = false
watch(form, () => { if (!applying) dirty.value = true }, { deep: true, flush: 'sync' })
watch(brand, (value) => {
  if (dirty.value) return
  applying = true
  form.value = toForm(value)
  applying = false
}, { immediate: true })

async function save() {
  saving.value = true
  try {
    await saveBrand({ ...form.value, bannedWords: parseWords(form.value.bannedWords) })
    dirty.value = false
    toast('品牌记忆已保存，电脑和手机会同步')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    saving.value = false
  }
}

const FIELDS = [
  { key: 'tone', label: '品牌调性', placeholder: '例如：高级、简洁、不用夸张词', rows: 3 },
  { key: 'audience', label: '目标人群', placeholder: '例如：18–30 岁、喜欢日常通勤穿搭的女生', rows: 3 },
  { key: 'bannedWords', label: '禁用词', placeholder: '用逗号分隔，例如：最便宜，第一，假货', rows: 2 },
  { key: 'subtitleStyle', label: '字幕风格', placeholder: '例如：白字黑边、每行不超过 12 个字', rows: 2 },
] as const
const web = props.variant === 'web'
</script>

<template>
  <div v-if="web" class="bm" data-testid="brand-memory">
    <div class="vg-form-grid">
      <label class="vg-field"><span class="vg-field__label">品牌名</span><input v-model="form.brandName" class="vg-input" maxlength="80" /></label>
      <label class="vg-field"><span class="vg-field__label">水印文字</span><input v-model="form.watermarkText" class="vg-input" maxlength="80" /></label>
      <label v-for="field in FIELDS" :key="field.key" class="vg-field">
        <span class="vg-field__label">{{ field.label }}</span>
        <textarea v-model="form[field.key]" class="vg-textarea" :rows="field.rows" :placeholder="field.placeholder"></textarea>
      </label>
    </div>
    <label class="vg-field"><span class="vg-field__label">其他要求</span><textarea v-model="form.notes" class="vg-textarea" rows="3" maxlength="2000"></textarea></label>
    <div class="bm__actions">
      <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="saving || !dirty" data-testid="brand-save" @click="save">
        <LoaderCircle v-if="saving" :size="14" class="vg-spin" /><Save v-else :size="14" /> 保存
      </button>
      <span class="vg-muted bm__hint">AI 制片人和上架文案会遵守这些要求；和电脑端「品牌记忆」同步。</span>
    </div>
  </div>
  <div v-else class="m-card m-card--pad bm bm--phone" data-testid="brand-memory">
    <label class="m-field"><span class="m-field__label">品牌名</span><input v-model="form.brandName" class="m-input" maxlength="80" /></label>
    <label class="m-field"><span class="m-field__label">水印文字</span><input v-model="form.watermarkText" class="m-input" maxlength="80" /></label>
    <label v-for="field in FIELDS" :key="field.key" class="m-field">
      <span class="m-field__label">{{ field.label }}</span>
      <textarea v-model="form[field.key]" class="m-textarea" :rows="field.rows" :placeholder="field.placeholder"></textarea>
    </label>
    <label class="m-field"><span class="m-field__label">其他要求</span><textarea v-model="form.notes" class="m-textarea" rows="3" maxlength="2000"></textarea></label>
    <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="saving || !dirty" data-testid="brand-save" @click="save">
      <LoaderCircle v-if="saving" :size="18" class="m-spin" /><Save v-else :size="18" /> 保存
    </button>
    <p class="m-muted bm__hint">AI 制片人和上架文案会遵守这些要求；和电脑端同步。</p>
  </div>
</template>

<style scoped>
.bm { display: flex; flex-direction: column; gap: 12px; }
.bm__actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.bm__hint { font-size: 12px; }
.bm--phone { gap: 14px; }
</style>
