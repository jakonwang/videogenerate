<script setup lang="ts">
/** 设置 → AI 平台 / 模型能力 / 七牛云（电脑端设置页和网页版设置共用，数据见 useModelSettings）。 */
import { useI18n } from 'vue-i18n'
import { Clapperboard, Cloud, Image as ImageIcon, KeyRound, Layers, MessagesSquare, Server } from 'lucide-vue-next'
import type { ModelSettings } from '../../composables/useModelSettings'

const props = defineProps<{ ms: ModelSettings; section: string }>()
const { t } = useI18n()
const {
  modelVisibleSecrets,
  modelCredentials,
  providerMeta,
  videoPrimaryPlatformBinding,
  imagePrimaryPlatformBinding,
  chatPrimaryPlatformBinding,
  videoPlatformOptions,
  imagePlatformOptions,
  chatPlatformOptions,
  videoPrimaryModelBinding,
  imagePrimaryModelBinding,
  chatPrimaryModelBinding,
  platformCards,
  toggleModelSecret,
  modelSecretType,
  providerApiKey,
  providerHost,
  assignProviderApiKey,
  assignProviderHost,
} = props.ms
</script>

<template>
  <section v-if="section === 'platforms'" class="vg-stack">
    <div class="vg-card__head settings__section-head">
      <span class="vg-card__title"><Server :size="16" /> {{ t('settings.platforms.title') }} <small>{{ t('settings.platforms.subtitle') }}</small></span>
    </div>
    <div class="vg-grid settings__platforms">
      <article class="vg-card">
        <div class="settings__card-head">
          <span class="settings__card-icon"><KeyRound :size="16" /></span>
          <div>
            <h3>TikHub</h3>
            <p>TikTok share-link parsing and download access token.</p>
          </div>
        </div>
        <div class="vg-field">
          <label>API Key</label>
          <div class="vg-row settings__inline">
            <input v-model="modelCredentials.tikhubApiKey" class="vg-input" :type="modelSecretType('tikhubApiKey')" placeholder="TikHub bearer token" />
            <button class="vg-btn vg-btn--sm" type="button" @click="toggleModelSecret('tikhubApiKey')">
              {{ modelVisibleSecrets.tikhubApiKey ? t('settings.common.hide') : t('settings.common.show') }}
            </button>
          </div>
        </div>
      </article>

      <article v-for="card in platformCards" :key="card.provider" class="vg-card">
        <div class="settings__card-head">
          <span class="settings__card-icon"><component :is="card.icon" :size="16" /></span>
          <div>
            <h3>{{ card.title }}</h3>
            <p>{{ card.desc }}</p>
          </div>
        </div>
        <div class="vg-stack settings__fields">
          <div class="vg-field">
            <label>{{ t('settings.platforms.fields.apiKey') }}</label>
            <div class="vg-row settings__inline">
              <input
                class="vg-input"
                :value="providerApiKey(card.provider)"
                :type="modelSecretType(providerMeta[card.provider].keyName)"
                @input="assignProviderApiKey(card.provider, ($event.target as HTMLInputElement).value)"
              />
              <button class="vg-btn vg-btn--sm" type="button" @click="toggleModelSecret(providerMeta[card.provider].keyName)">
                {{ modelVisibleSecrets[providerMeta[card.provider].keyName] ? t('settings.common.hide') : t('settings.common.show') }}
              </button>
            </div>
          </div>
          <div class="vg-field">
            <label>{{ providerMeta[card.provider].hostLabel }}</label>
            <input
              class="vg-input"
              :value="providerHost(card.provider)"
              :placeholder="providerMeta[card.provider].hostPlaceholder"
              @input="assignProviderHost(card.provider, ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
      </article>
    </div>
  </section>

  <section v-else-if="section === 'capabilities'" class="vg-stack">
    <div class="vg-card__head settings__section-head">
      <span class="vg-card__title"><Layers :size="16" /> {{ t('settings.capabilities.title') }} <small>{{ t('settings.capabilities.subtitle') }}</small></span>
    </div>

    <article class="vg-card">
      <div class="settings__card-head">
        <span class="settings__card-icon settings__card-icon--violet"><Clapperboard :size="16" /></span>
        <div>
          <h3>{{ t('settings.capabilities.video.title') }}</h3>
          <p>{{ t('settings.capabilities.video.desc') }}</p>
        </div>
      </div>
      <div class="vg-form-grid">
        <div class="vg-field">
          <label>{{ t('settings.capabilities.fields.primaryPlatform') }}</label>
          <select v-model="videoPrimaryPlatformBinding" class="vg-select">
            <option v-for="option in videoPlatformOptions" :key="`video-${option.id}`" :value="option.id">{{ option.label }}</option>
          </select>
        </div>
        <div class="vg-field">
          <label>{{ t('settings.capabilities.fields.primaryModel') }}</label>
          <input v-model="videoPrimaryModelBinding" class="vg-input" :placeholder="t('settings.capabilities.placeholders.videoPrimaryModel')" />
        </div>
      </div>
    </article>

    <article class="vg-card">
      <div class="settings__card-head">
        <span class="settings__card-icon settings__card-icon--blue"><ImageIcon :size="16" /></span>
        <div>
          <h3>{{ t('settings.capabilities.image.title') }}</h3>
          <p>{{ t('settings.capabilities.image.desc') }}</p>
        </div>
      </div>
      <div class="vg-form-grid vg-form-grid--3">
        <div class="vg-field">
          <label>{{ t('settings.capabilities.fields.primaryPlatform') }}</label>
          <select v-model="imagePrimaryPlatformBinding" class="vg-select">
            <option v-for="option in imagePlatformOptions" :key="`image-${option.id}`" :value="option.id">{{ option.label }}</option>
          </select>
        </div>
        <div class="vg-field">
          <label>{{ t('settings.capabilities.fields.primaryModel') }}</label>
          <input v-model="imagePrimaryModelBinding" class="vg-input" :placeholder="t('settings.capabilities.placeholders.imagePrimaryModel')" />
        </div>
        <div class="vg-field">
          <label>{{ t('settings.capabilities.fields.imageQuality') }}</label>
          <select v-model="modelCredentials.openaiImageQuality" class="vg-select">
            <option value="low">{{ t('settings.capabilities.quality.low') }}</option>
            <option value="medium">{{ t('settings.capabilities.quality.medium') }}</option>
            <option value="high">{{ t('settings.capabilities.quality.high') }}</option>
          </select>
        </div>
      </div>
    </article>

    <article class="vg-card">
      <div class="settings__card-head">
        <span class="settings__card-icon"><MessagesSquare :size="16" /></span>
        <div>
          <h3>{{ t('settings.capabilities.chat.title') }}</h3>
          <p>{{ t('settings.capabilities.chat.desc') }}</p>
        </div>
      </div>
      <div class="vg-form-grid">
        <div class="vg-field">
          <label>{{ t('settings.capabilities.fields.primaryPlatform') }}</label>
          <select v-model="chatPrimaryPlatformBinding" class="vg-select">
            <option v-for="option in chatPlatformOptions" :key="`chat-${option.id}`" :value="option.id">{{ option.label }}</option>
          </select>
        </div>
        <div class="vg-field">
          <label>{{ t('settings.capabilities.fields.primaryModel') }}</label>
          <input v-model="chatPrimaryModelBinding" class="vg-input" :placeholder="t('settings.capabilities.placeholders.chatPrimaryModel')" />
        </div>
      </div>
    </article>
  </section>
  <section v-else-if="section === 'qiniu'" class="vg-card">
    <div class="vg-card__head">
      <span class="vg-card__title"><Cloud :size="16" /> {{ t('settings.qiniu.title') }} <small>{{ t('settings.qiniu.subtitle') }}</small></span>
    </div>
    <div class="vg-form-grid">
      <div class="vg-field">
        <label>{{ t('settings.qiniu.fields.accessKey') }}</label>
        <div class="vg-row settings__inline">
          <input v-model="modelCredentials.qiniuAccessKey" class="vg-input" :type="modelSecretType('qiniuAccessKey')" />
          <button class="vg-btn vg-btn--sm" type="button" @click="toggleModelSecret('qiniuAccessKey')">
            {{ modelVisibleSecrets.qiniuAccessKey ? t('settings.common.hide') : t('settings.common.show') }}
          </button>
        </div>
      </div>
      <div class="vg-field">
        <label>{{ t('settings.qiniu.fields.secretKey') }}</label>
        <div class="vg-row settings__inline">
          <input v-model="modelCredentials.qiniuSecretKey" class="vg-input" :type="modelSecretType('qiniuSecretKey')" />
          <button class="vg-btn vg-btn--sm" type="button" @click="toggleModelSecret('qiniuSecretKey')">
            {{ modelVisibleSecrets.qiniuSecretKey ? t('settings.common.hide') : t('settings.common.show') }}
          </button>
        </div>
      </div>
      <div class="vg-field"><label>{{ t('settings.qiniu.fields.bucket') }}</label><input v-model="modelCredentials.qiniuBucket" class="vg-input" /></div>
      <div class="vg-field"><label>{{ t('settings.qiniu.fields.domain') }}</label><input v-model="modelCredentials.qiniuDomain" class="vg-input" /></div>
      <div class="vg-field"><label>{{ t('settings.qiniu.fields.uploadHost') }}</label><input v-model="modelCredentials.qiniuUploadHost" class="vg-input" /></div>
      <div class="vg-field"><label>{{ t('settings.qiniu.fields.prefix') }}</label><input v-model="modelCredentials.qiniuPrefix" class="vg-input" /></div>
    </div>
  </section>
</template>

<style scoped>
.settings__section-head { margin-bottom: 0; }
.settings__platforms { --vg-grid-min: 300px; }
.settings__card-head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
.settings__card-head h3 { font-size: 14px; font-weight: 700; }
.settings__card-head p { font-size: 12px; color: var(--theme-text-muted); margin-top: 2px; }
.settings__card-icon { width: 34px; height: 34px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--vg-accent-soft); color: var(--vg-accent); }
.settings__card-icon--violet { background: color-mix(in srgb, var(--vg-violet) 14%, transparent); color: var(--vg-violet); }
.settings__card-icon--blue { background: color-mix(in srgb, var(--vg-blue) 14%, transparent); color: var(--vg-blue); }
.settings__fields { gap: 10px; }
.settings__inline { flex-wrap: nowrap; }
.settings__inline .vg-input { flex: 1; }
.settings__summary { grid-template-columns: 1fr; gap: 2px 0; }
.settings__summary dd { margin-bottom: 8px; font-size: 12px; }
.settings__notes { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: var(--theme-text-secondary); line-height: 1.55; }
</style>
