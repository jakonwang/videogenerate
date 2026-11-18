<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Copy, ExternalLink, Info, MessageCircle, Save, Trash2, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { CreatorHubContact, CreatorHubMessageTemplate } from '../../../../../shared/creatorHub'
import { normalizeVnPhone, renderTemplate, zaloLink, zaloNumber } from '../../../../../shared/creatorHubContacts'
import { formatCount, formatDateTime, type CreatorDetailTarget } from './creatorHubFormat'

const props = defineProps<{
  target: (CreatorDetailTarget & { followers?: number }) | null
  contact?: CreatorHubContact
  templates: CreatorHubMessageTemplate[]
  shopName: string
  busy: boolean
}>()
const emit = defineEmits<{
  close: []
  sent: [payload: { zalo?: string }]
  saveTemplate: [payload: { id?: string; name: string; body: string }]
  removeTemplate: [id: string]
  copied: []
}>()
const { t } = useI18n()
const TEMPLATE_KEY = 'creatorHub.zaloTemplate'

const number = ref('')
const templateId = ref('')
const message = ref('')
const templateName = ref('')
const copyFailed = ref(false)

const normalized = computed(() => normalizeVnPhone(number.value))
const currentTemplate = computed(() => props.templates.find((item) => item.id === templateId.value))
const vars = computed(() => ({ name: props.target?.nickname || props.target?.handle, handle: props.target?.handle, shop: props.shopName, followers: props.target?.followers != null ? formatCount(props.target.followers) : undefined }))

function pickTemplate(id: string) {
  templateId.value = id
  const template = props.templates.find((item) => item.id === id)
  message.value = template ? renderTemplate(template.body, vars.value) : ''
  templateName.value = template?.name || ''
  try { localStorage.setItem(TEMPLATE_KEY, id) } catch { /* storage unavailable */ }
}

watch(() => props.target, (target) => {
  if (!target) return
  number.value = zaloNumber(props.contact) || ''
  copyFailed.value = false
  let stored = ''
  try { stored = localStorage.getItem(TEMPLATE_KEY) || '' } catch { /* storage unavailable */ }
  pickTemplate(props.templates.some((item) => item.id === stored) ? stored : props.templates[0]?.id || '')
}, { immediate: true })
watch(() => props.templates, (list) => {
  if (props.target && !list.some((item) => item.id === templateId.value)) pickTemplate(list[0]?.id || '')
})

async function copyMessage() {
  try {
    await navigator.clipboard.writeText(message.value)
    copyFailed.value = false
    return true
  } catch {
    copyFailed.value = true
    return false
  }
}
async function copyOnly() {
  if (await copyMessage()) emit('copied')
}
async function send() {
  const phone = normalized.value
  if (!phone) return
  await copyMessage()
  void window.api.shell.openExternal(zaloLink(phone))
  emit('sent', { zalo: phone !== zaloNumber(props.contact) ? phone : undefined })
}
function saveAsTemplate(update: boolean) {
  // Store the template with placeholders: swap the creator's own values back for {name} / {handle} / {shop}.
  let body = message.value
  for (const [key, value] of Object.entries(vars.value)) if (value) body = body.split(String(value)).join(`{${key}}`)
  emit('saveTemplate', { id: update ? currentTemplate.value?.id : undefined, name: templateName.value.trim() || t('creatorHub.zalo.newTemplate'), body })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="target" class="vg-scope vg-backdrop" @click.self="!busy && emit('close')">
      <div class="vg-dialog vg-dialog--wide ch-zalo" role="dialog" aria-modal="true" data-testid="creator-hub-zalo-dialog">
        <div class="vg-dialog__head">
          <div class="vg-dialog__title">
            <span class="vg-dialog__title-icon"><MessageCircle :size="19" /></span>
            <div>
              <h2>{{ t('creatorHub.zalo.title', { name: target.nickname || target.handle }) }}</h2>
              <p>@{{ target.handle }}<template v-if="contact?.lastContactAt"> · {{ t('creatorHub.zalo.lastContact', { time: formatDateTime(contact.lastContactAt) }) }}</template></p>
            </div>
          </div>
          <button class="vg-icon-btn" :disabled="busy" :aria-label="t('creatorHub.actions.close')" @click="emit('close')"><X :size="16" /></button>
        </div>
        <div class="vg-dialog__body">
          <div class="vg-field">
            <label for="ch-zalo-number">{{ t('creatorHub.zalo.number') }}</label>
            <input id="ch-zalo-number" v-model="number" class="vg-input" :class="{ 'vg-input--error': number && !normalized }" inputmode="tel" :placeholder="t('creatorHub.zalo.numberPlaceholder')" />
            <span v-if="number && !normalized" class="vg-field__error">{{ t('creatorHub.errors.PHONE_INVALID') }}</span>
            <span v-else-if="!number" class="vg-field__hint">{{ contact?.contactInfoAvailable ? t('creatorHub.zalo.onBackendHint') : t('creatorHub.zalo.noNumberHint') }}</span>
          </div>

          <div class="vg-field">
            <label for="ch-zalo-template">{{ t('creatorHub.zalo.template') }}</label>
            <div class="vg-row">
              <select id="ch-zalo-template" :value="templateId" class="vg-select ch-zalo__select" @change="pickTemplate(($event.target as HTMLSelectElement).value)">
                <option v-for="item in templates" :key="item.id" :value="item.id">{{ item.name }}</option>
              </select>
              <button v-if="currentTemplate" class="vg-icon-btn vg-icon-btn--danger" :title="t('creatorHub.zalo.deleteTemplate')" :disabled="busy" @click="emit('removeTemplate', currentTemplate.id)"><Trash2 :size="14" /></button>
            </div>
          </div>

          <div class="vg-field">
            <label for="ch-zalo-message">{{ t('creatorHub.zalo.message') }}</label>
            <textarea id="ch-zalo-message" v-model="message" class="vg-textarea" rows="6" maxlength="2000" data-testid="creator-hub-zalo-message" />
            <span class="vg-field__hint">{{ t('creatorHub.zalo.variables') }}</span>
          </div>
          <div class="vg-row">
            <input v-model="templateName" class="vg-input vg-input--sm ch-zalo__name" :placeholder="t('creatorHub.zalo.templateName')" :aria-label="t('creatorHub.zalo.templateName')" />
            <button class="vg-btn vg-btn--xs vg-btn--outline" :disabled="busy || !message.trim() || !currentTemplate" @click="saveAsTemplate(true)"><Save :size="12" />{{ t('creatorHub.zalo.updateTemplate') }}</button>
            <button class="vg-btn vg-btn--xs vg-btn--outline" :disabled="busy || !message.trim()" @click="saveAsTemplate(false)">{{ t('creatorHub.zalo.saveTemplate') }}</button>
          </div>

          <div class="vg-notice"><Info :size="16" /><span>{{ t('creatorHub.zalo.howItWorks') }}</span></div>
          <div v-if="copyFailed" class="vg-notice vg-notice--warning"><Info :size="16" /><span>{{ t('creatorHub.zalo.copyFailed') }}</span></div>
        </div>
        <div class="vg-dialog__foot">
          <button class="vg-btn vg-btn--outline" :disabled="busy || !message.trim()" @click="copyOnly"><Copy :size="14" />{{ t('creatorHub.zalo.copyOnly') }}</button>
          <div class="vg-dialog__foot-actions">
            <button class="vg-btn vg-btn--outline" :disabled="busy" @click="emit('close')">{{ t('creatorHub.actions.cancel') }}</button>
            <button class="vg-btn vg-btn--primary" :disabled="busy || !normalized || !message.trim()" data-testid="creator-hub-zalo-send" @click="send"><ExternalLink :size="14" />{{ t('creatorHub.zalo.send') }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
