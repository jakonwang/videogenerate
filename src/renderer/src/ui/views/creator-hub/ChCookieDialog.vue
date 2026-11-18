<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, Cookie, FileUp, Loader2, ShieldCheck, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { CreatorHubShop } from '../../../../../shared/creatorHub'
import { creatorHubError } from './creatorHubFormat'

const props = defineProps<{ open: boolean; shop?: CreatorHubShop | null }>()
const emit = defineEmits<{ close: []; imported: [payload: { shop: CreatorHubShop; merged: boolean }] }>()
const { t } = useI18n()

const cookieJson = ref('')
const name = ref('')
const busy = ref(false)
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const isUpdate = computed(() => Boolean(props.shop))

watch(() => props.open, (open) => {
  if (!open) return
  cookieJson.value = ''
  name.value = props.shop?.name || ''
  error.value = ''
  busy.value = false
})

async function pickFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  cookieJson.value = await file.text()
  ;(event.target as HTMLInputElement).value = ''
}

async function submit() {
  if (!cookieJson.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await window.api.tiktokCreatorHub.importCookies({ cookieJson: cookieJson.value, shopId: props.shop?.id, name: isUpdate.value ? undefined : name.value.trim() || undefined })
    cookieJson.value = ''
    emit('imported', { shop: result.shop, merged: result.merged })
  } catch (err) {
    error.value = creatorHubError(err, t)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="vg-scope vg-backdrop" @click.self="!busy && emit('close')">
      <div class="vg-dialog vg-dialog--wide" role="dialog" aria-modal="true" data-testid="creator-hub-cookie-dialog">
        <div class="vg-dialog__head">
          <div class="vg-dialog__title">
            <span class="vg-dialog__title-icon"><Cookie :size="19" /></span>
            <div>
              <h2>{{ isUpdate ? t('creatorHub.cookie.updateTitle', { name: shop?.name }) : t('creatorHub.cookie.addTitle') }}</h2>
              <p>{{ t('creatorHub.cookie.subtitle') }}</p>
            </div>
          </div>
          <button class="vg-icon-btn" :disabled="busy" :aria-label="t('creatorHub.actions.close')" @click="emit('close')"><X :size="16" /></button>
        </div>
        <div class="vg-dialog__body">
          <ol class="ch-steps">
            <li>{{ t('creatorHub.cookie.step1') }}</li>
            <li>{{ t('creatorHub.cookie.step2') }}</li>
            <li>{{ t('creatorHub.cookie.step3') }}</li>
            <li>{{ t('creatorHub.cookie.step4') }}</li>
          </ol>
          <div v-if="!isUpdate" class="vg-field">
            <label for="ch-shop-name">{{ t('creatorHub.cookie.nameLabel') }}</label>
            <input id="ch-shop-name" v-model="name" class="vg-input" maxlength="80" :placeholder="t('creatorHub.cookie.namePlaceholder')" />
          </div>
          <div class="vg-field">
            <div class="ch-field-head">
              <label for="ch-cookie-json">{{ t('creatorHub.cookie.jsonLabel') }}<span class="vg-req">*</span></label>
              <button class="vg-btn vg-btn--xs vg-btn--outline" type="button" :disabled="busy" @click="fileInput?.click()"><FileUp :size="12" />{{ t('creatorHub.cookie.fromFile') }}</button>
              <input ref="fileInput" type="file" accept=".json,application/json,text/plain" hidden @change="pickFile" />
            </div>
            <textarea id="ch-cookie-json" v-model="cookieJson" class="vg-textarea ch-cookie-text" rows="8" spellcheck="false" autocomplete="off" :placeholder="t('creatorHub.cookie.jsonPlaceholder')" />
          </div>
          <div class="vg-notice vg-notice--warning"><ShieldCheck :size="16" /><span>{{ t('creatorHub.cookie.security') }}</span></div>
          <div v-if="error" class="vg-notice vg-notice--danger"><AlertTriangle :size="16" /><span>{{ error }}</span></div>
        </div>
        <div class="vg-dialog__foot">
          <span class="vg-muted">{{ busy ? t('creatorHub.cookie.verifying') : '' }}</span>
          <div class="vg-dialog__foot-actions">
            <button class="vg-btn vg-btn--outline" :disabled="busy" @click="emit('close')">{{ t('creatorHub.actions.cancel') }}</button>
            <button class="vg-btn vg-btn--primary" :disabled="busy || !cookieJson.trim()" data-testid="creator-hub-cookie-submit" @click="submit">
              <Loader2 v-if="busy" :size="14" class="vg-spin" />{{ t('creatorHub.cookie.submit') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
