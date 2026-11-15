<script setup lang="ts">
import { ref, watch } from 'vue'
import { UserCog, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { CreatorHubCrmRow } from '@/../../shared/creatorHub'

const props = defineProps<{ row: CreatorHubCrmRow | null; busy: boolean; knownTags: string[] }>()
const emit = defineEmits<{ close: []; save: [payload: { tags: string[]; note: string; blocked: boolean }] }>()
const { t } = useI18n()

const tagsText = ref('')
const note = ref('')
const blocked = ref(false)

watch(() => props.row, (row) => {
  if (!row) return
  tagsText.value = row.tags.join(', ')
  note.value = row.note || ''
  blocked.value = row.blocked
}, { immediate: true })

function addTag(tag: string) {
  const tags = tagsText.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
  if (!tags.includes(tag)) tags.push(tag)
  tagsText.value = tags.join(', ')
}
function save() {
  emit('save', { tags: tagsText.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean), note: note.value, blocked: blocked.value })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="row" class="vg-scope vg-backdrop" @click.self="!busy && emit('close')">
      <div class="vg-dialog" role="dialog" aria-modal="true" data-testid="creator-hub-profile-dialog">
        <div class="vg-dialog__head">
          <div class="vg-dialog__title">
            <span class="vg-dialog__title-icon"><UserCog :size="19" /></span>
            <div>
              <h2>{{ row.creatorNickname || row.creatorHandle }}</h2>
              <p>@{{ row.creatorHandle }}</p>
            </div>
          </div>
          <button class="vg-icon-btn" :disabled="busy" :aria-label="t('creatorHub.actions.close')" @click="emit('close')"><X :size="16" /></button>
        </div>
        <div class="vg-dialog__body">
          <div class="vg-field">
            <label for="ch-profile-tags">{{ t('creatorHub.crm.tags') }}</label>
            <input id="ch-profile-tags" v-model="tagsText" class="vg-input" :placeholder="t('creatorHub.crm.tagsPlaceholder')" />
            <div v-if="knownTags.length" class="vg-row">
              <button v-for="tag in knownTags" :key="tag" class="vg-chip ch-chip-btn" type="button" @click="addTag(tag)">+ {{ tag }}</button>
            </div>
          </div>
          <div class="vg-field">
            <label for="ch-profile-note">{{ t('creatorHub.crm.note') }}</label>
            <textarea id="ch-profile-note" v-model="note" class="vg-textarea" rows="4" maxlength="500" :placeholder="t('creatorHub.crm.notePlaceholder')" />
          </div>
          <label class="vg-switch" :class="{ 'is-on': blocked }" @click.prevent="blocked = !blocked">
            <span class="vg-switch__track" />{{ t('creatorHub.crm.blocked') }}<small>{{ t('creatorHub.crm.blockedHint') }}</small>
          </label>
        </div>
        <div class="vg-dialog__foot">
          <div class="vg-dialog__foot-actions">
            <button class="vg-btn vg-btn--outline" :disabled="busy" @click="emit('close')">{{ t('creatorHub.actions.cancel') }}</button>
            <button class="vg-btn vg-btn--primary" :disabled="busy" data-testid="creator-hub-profile-save" @click="save">{{ t('creatorHub.actions.save') }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
