<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileSpreadsheet, X } from 'lucide-vue-next'
import type { CodeImportPreview } from '../../../../../shared/productCodeStats'

const props = defineProps<{ preview: CodeImportPreview | null }>()
const emit = defineEmits<{ close: []; done: [] }>()
const { t } = useI18n()
const busy = ref(false)
const message = ref('')
const done = ref(false)
watch(() => props.preview, () => { message.value = ''; done.value = false })

async function apply() {
  if (!props.preview || busy.value) return
  busy.value = true
  try {
    const result = await window.api.productCodes.importApply(props.preview.token)
    message.value = t('productLibrary.sheet.result', result)
    done.value = true
    emit('done')
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}
function close() {
  if (!busy.value) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="preview" class="vg-scope vg-backdrop" data-testid="product-import-dialog" @click.self="close">
      <section class="vg-dialog" role="dialog" aria-modal="true" :aria-label="t('productLibrary.sheet.importTitle')">
        <header class="vg-dialog__head">
          <div class="vg-dialog__title">
            <span class="vg-dialog__title-icon"><FileSpreadsheet :size="19" /></span>
            <div><h2>{{ t('productLibrary.sheet.importTitle') }}</h2><p>{{ preview.fileName }} · {{ preview.sheets.join('、') || t('productLibrary.sheet.noSheet') }}</p></div>
          </div>
          <button class="vg-icon-btn" type="button" :aria-label="t('productLibrary.promptSettings.close')" @click="close"><X :size="18" /></button>
        </header>
        <div class="vg-dialog__body">
          <dl class="pid-list">
            <dt>{{ t('productLibrary.sheet.total') }}</dt><dd>{{ preview.total }}</dd>
            <dt>{{ t('productLibrary.sheet.create') }}</dt><dd class="is-accent">{{ preview.create }}</dd>
            <dt>{{ t('productLibrary.sheet.update') }}</dt><dd>{{ preview.update }}</dd>
            <dt>{{ t('productLibrary.sheet.withImage') }}</dt><dd>{{ preview.withImage }}</dd>
            <dt>{{ t('productLibrary.sheet.inShop') }}</dt><dd>{{ preview.inShop }}</dd>
            <template v-if="preview.hotTypes.length"><dt>{{ t('productLibrary.sheet.hotTypes') }}</dt><dd>{{ preview.hotTypes.map((item) => `${item.name} ${item.count}`).join('、') }}</dd></template>
            <template v-if="preview.reserved"><dt>{{ t('productLibrary.sheet.reserved') }}</dt><dd>{{ preview.reserved }}</dd></template>
            <template v-if="preview.skippedCount"><dt>{{ t('productLibrary.sheet.skipped') }}</dt><dd :title="preview.skipped.map((item) => `${item.sheet} ${item.row}: ${item.value}`).join('\n')">{{ preview.skippedCount }}</dd></template>
          </dl>
          <p class="pid-tip">{{ t('productLibrary.sheet.tip') }}</p>
          <p v-if="message" class="pid-message" role="status">{{ message }}</p>
        </div>
        <footer class="vg-dialog__foot">
          <span></span>
          <div class="vg-dialog__foot-actions">
            <button class="vg-btn" type="button" :disabled="busy" @click="close">{{ t('productLibrary.promptSettings.close') }}</button>
            <button v-if="!done" class="vg-btn vg-btn--primary" type="button" data-testid="product-import-apply" :disabled="busy || !(preview.create + preview.update)" @click="apply">{{ busy ? t('productLibrary.sheet.importing') : t('productLibrary.sheet.apply') }}</button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.pid-list { display: grid; grid-template-columns: 1fr auto; gap: 9px 16px; margin: 0; font-size: 13px; }
.pid-list dt { color: var(--theme-text-muted); }
.pid-list dd { margin: 0; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
.is-accent { color: var(--vg-accent); }
.pid-tip, .pid-message { margin: 14px 0 0; font-size: 12px; line-height: 1.6; color: var(--theme-text-muted); }
.pid-message { color: var(--vg-accent); }
</style>
