<script setup lang="ts">
import { useCloudAuthStore } from '@/stores/cloudAuth'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Check,
  Clapperboard,
  Cloud,
  Eye,
  EyeOff,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  MessagesSquare,
  Palette,
  Server,
  ClipboardList,
  DownloadCloud,
  FolderOpen,
  Info,
  Layers,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  Brain,
  AlarmClock,
} from 'lucide-vue-next'
import { useAppSettingsStore, type AppTheme } from '@/stores/appSettings'
import StorageManagementPanel from '../components/StorageManagementPanel.vue'
import BrandMemorySettings from '../components/ai/BrandMemorySettings.vue'
import AiAutomationSettings from '../components/ai/AiAutomationSettings.vue'
import { useModelSettings } from '../composables/useModelSettings'
import ModelSettingsSection from '../components/settings/ModelSettingsSection.vue'
import ModelSettingsSummary from '../components/settings/ModelSettingsSummary.vue'

const settingsBusy = ref(false)
const settingsMessage = ref('')
type SettingsSection =
  | 'appearance'
  | 'platforms'
  | 'capabilities'
  | 'storage-management'
  | 'qiniu'
  | 'brand'
  | 'automation'

const settingsSection = ref<SettingsSection>('appearance')
const settingsNavPanel = ref<HTMLElement | null>(null)
const { t } = useI18n()
const route = useRoute()
const appSettings = useAppSettingsStore()

watch(() => route.query.section, (value) => {
  const section = String(Array.isArray(value) ? value[0] : value || '') as SettingsSection
  if (['appearance', 'platforms', 'capabilities', 'storage-management', 'qiniu', 'brand', 'automation'].includes(section)) settingsSection.value = section
}, { immediate: true })

function revealActiveSettingsSection() {
  void nextTick(() => {
    settingsNavPanel.value?.querySelector<HTMLElement>('.settings-nav__item.is-active')?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
    })
  })
}

watch(settingsSection, revealActiveSettingsSection)
const accessKeyInput = ref(appSettings.accessKey)
const accessKeyVisible = ref(false)
const accessKeyMessage = ref('')
const themeOptions: Array<{ value: AppTheme; labelKey: string }> = [
  { value: 'dark-teal', labelKey: 'settings.appearance.themes.darkTeal' },
  { value: 'light-teal', labelKey: 'settings.appearance.themes.lightTeal' },
  { value: 'mono', labelKey: 'settings.appearance.themes.mono' },
]
const modelSettings = useModelSettings({ t, message: settingsMessage })
const {
  modelSettingsBusy,
  modelCredentials,
  capabilityProviderLabel,
  videoPrimaryModelBinding,
  imagePrimaryModelBinding,
  chatPrimaryModelBinding,
  imageQualityLabel,
  summaryToneClass,
  summaryCards,
  refreshModelSettings,
  saveModelSettings,
} = modelSettings
const sectionGroups = [
  {
    key: 'general',
    labelKey: 'settings.navigation.groups.general',
    items: [
      { key: 'appearance', labelKey: 'settings.sections.appearance.label', descKey: 'settings.sections.appearance.desc', icon: Palette },
    ],
  },
  {
    key: 'ai',
    labelKey: 'settings.navigation.groups.ai',
    items: [
      { key: 'platforms', labelKey: 'settings.sections.platforms.label', descKey: 'settings.sections.platforms.desc', icon: KeyRound },
      { key: 'capabilities', labelKey: 'settings.sections.capabilities.label', descKey: 'settings.sections.capabilities.desc', icon: Server },
    ],
  },
  {
    key: 'producer',
    labelKey: 'ai.settingsGroup',
    items: [
      { key: 'brand', labelKey: 'ai.brand.title', descKey: 'ai.brand.navDesc', icon: Brain },
      { key: 'automation', labelKey: 'ai.automation.navTitle', descKey: 'ai.automation.navDesc', icon: AlarmClock },
    ],
  },
  {
    key: 'storage',
    labelKey: 'settings.navigation.groups.storage',
    items: [
      { key: 'storage-management', labelKey: 'settings.sections.storageManagement.label', descKey: 'settings.sections.storageManagement.desc', icon: HardDrive },
      { key: 'qiniu', labelKey: 'settings.sections.qiniu.label', descKey: 'settings.sections.qiniu.desc', icon: Cloud },
    ],
  },
] as const

const isModelSettingsSection = computed(() => ['platforms', 'capabilities', 'qiniu'].includes(settingsSection.value))
const cloudAuth = useCloudAuthStore()
void cloudAuth.ensureLoaded()
/** 平台 Key / 模型 / 七牛由后台统一下发时，这几个分区只读 */
const managedLocked = computed(() => Boolean(cloudAuth.status?.managedSettings) && isModelSettingsSection.value)

const settingsMessageTone = computed(() => {
  const text = String(settingsMessage.value || '').trim().toLowerCase()
  if (!text) return 'neutral'
  // Messages are localized, so match both English and Chinese wording.
  if (/fail|error|invalid|失败|错误|无效/.test(text)) return 'error'
  return /saved|loaded|opened|started|success|已保存|已加载|已打开|已开始|成功/.test(text) ? 'success' : 'neutral'
})

async function openDataDir() {
  try {
    const paths = (await window.api.getPaths()) as { dataDir?: string }
    const dir = String(paths?.dataDir ?? '').trim()
    if (!dir) {
      settingsMessage.value = t('settings.messages.dataDirNotFound')
      return
    }
    await window.api.shell.openPath(dir)
    settingsMessage.value = t('settings.messages.dataDirOpened')
  } catch (e: any) {
    settingsMessage.value = `${t('settings.messages.openDataDirFailed')}: ${e?.message ?? String(e)}`
  }
}

async function checkUpdatesNow() {
  if (settingsBusy.value) return
  settingsBusy.value = true
  settingsMessage.value = ''
  try {
    const res = (await window.api.updater.checkForUpdates()) as { ok: true } | { ok: false; reason?: string; message?: string }
    settingsMessage.value = res?.ok ? t('settings.messages.updateCheckStarted') : `${t('settings.messages.updateCheckFailed')}: ${res?.message ?? res?.reason ?? 'unknown'}`
  } catch (e: any) {
    settingsMessage.value = `${t('settings.messages.updateCheckFailed')}: ${e?.message ?? String(e)}`
  } finally {
    settingsBusy.value = false
  }
}

function selectTheme(theme: AppTheme) {
  appSettings.setTheme(theme)
}

function saveAccessKey() {
  appSettings.saveAccessKey(accessKeyInput.value)
  accessKeyInput.value = appSettings.accessKey
  accessKeyMessage.value = appSettings.accessKey
    ? t('settings.access.savedLocally')
    : t('settings.access.cleared')
}

onMounted(() => {
  void refreshModelSettings()
  window.addEventListener('resize', revealActiveSettingsSection)
  revealActiveSettingsSection()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', revealActiveSettingsSection)
})
</script>

<template>
  <div class="vg-scope vg-page settings" data-testid="settings-page" :class="{ 'is-storage-section': settingsSection === 'storage-management' }">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><SettingsIcon :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('settings.hero.title') }}</h1>
        <p>{{ t('settings.hero.subtitle') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button class="vg-btn vg-btn--sm" type="button" :disabled="settingsBusy" @click="checkUpdatesNow">
          <DownloadCloud :size="14" /> {{ t('settings.actions.checkUpdates') }}
        </button>
        <button class="vg-btn vg-btn--sm" type="button" @click="openDataDir">
          <FolderOpen :size="14" /> {{ t('settings.actions.openDataDir') }}
        </button>
        <button class="vg-btn vg-btn--sm" type="button" @click="refreshModelSettings">
          <RefreshCw :size="14" /> {{ t('settings.actions.refresh') }}
        </button>
        <button v-if="isModelSettingsSection" class="vg-btn vg-btn--primary vg-btn--sm" type="button" :disabled="modelSettingsBusy || managedLocked" @click="saveModelSettings">
          <Save :size="14" /> {{ modelSettingsBusy ? t('settings.actions.saving') : t('settings.actions.saveSettings') }}
        </button>
      </div>
    </header>

    <section class="vg-stats">
      <div v-for="item in summaryCards" :key="item.title" class="vg-stat">
        <span class="vg-stat__icon" :class="summaryToneClass(item.tone)"><component :is="item.icon" :size="17" /></span>
        <span class="vg-stat__body">
          <span class="vg-stat__label">{{ item.title }}</span>
          <span class="settings__stat-value" :title="item.value">{{ item.value }}</span>
          <span class="settings__stat-meta" :title="item.meta">{{ item.meta }}</span>
        </span>
      </div>
    </section>

    <div v-if="settingsMessage" class="vg-notice" :class="settingsMessageTone === 'success' ? 'vg-notice--accent' : settingsMessageTone === 'error' ? 'vg-notice--danger' : ''">
      <Info :size="16" /><span>{{ settingsMessage }}</span>
    </div>

    <section class="settings__layout" :class="{ 'has-side-panel': isModelSettingsSection }">
      <aside ref="settingsNavPanel" class="vg-card settings-nav">
        <div v-for="group in sectionGroups" :key="group.key" class="settings-nav__group">
          <div class="settings-nav__label">{{ t(group.labelKey) }}</div>
          <button
            v-for="item in group.items"
            :key="item.key"
            type="button"
            class="vg-list__item vg-list__item--button settings-nav__item"
            :class="{ 'is-active': settingsSection === item.key }"
            :data-settings-section="item.key"
            @click="settingsSection = item.key"
          >
            <span class="settings-nav__icon"><component :is="item.icon" :size="16" /></span>
            <span class="vg-list__main">
              <span class="vg-list__title">{{ t(item.labelKey) }}</span>
              <span class="vg-list__sub">{{ t(item.descKey) }}</span>
            </span>
          </button>
        </div>
      </aside>

      <main class="settings__main" :class="{ 'is-managed-locked': managedLocked }" :inert="managedLocked || undefined">
        <div v-if="managedLocked" class="vg-notice vg-notice--accent settings__managed-notice" data-testid="settings-managed-notice">
          <Info :size="16" /><span>{{ t('cloud.settings.managedNotice') }}</span>
        </div>
        <!-- Appearance -->
        <template v-if="settingsSection === 'appearance'">
          <section class="vg-card">
            <div class="vg-card__head">
              <span class="vg-card__title"><Palette :size="16" /> {{ t('settings.appearance.title') }} <small>{{ t('settings.appearance.subtitle') }}</small></span>
            </div>
            <div class="theme-grid">
              <button
                v-for="theme in themeOptions"
                :key="theme.value"
                type="button"
                class="theme-option"
                :class="[`theme-option--${theme.value}`, { 'is-active': appSettings.theme === theme.value }]"
                @click="selectTheme(theme.value)"
              >
                <span class="theme-option__preview">
                  <i class="theme-option__line"></i>
                  <i class="theme-option__dot"></i>
                  <i class="theme-option__field"></i>
                </span>
                <span class="theme-option__label">
                  {{ t(theme.labelKey) }}
                  <Check v-if="appSettings.theme === theme.value" :size="14" />
                </span>
              </button>
            </div>
          </section>

          
        </template>

        <!-- Platforms -->
        <ModelSettingsSection v-else-if="settingsSection === 'platforms' || settingsSection === 'capabilities'" :ms="modelSettings" :section="settingsSection" />

        <!-- Storage -->
        <StorageManagementPanel v-else-if="settingsSection === 'storage-management'" />

        <BrandMemorySettings v-else-if="settingsSection === 'brand'" />

        <AiAutomationSettings v-else-if="settingsSection === 'automation'" />

        <!-- Qiniu -->
        <ModelSettingsSection v-else-if="settingsSection === 'qiniu'" :ms="modelSettings" section="qiniu" />
      </main>

      <aside v-if="isModelSettingsSection" class="vg-stack settings__side">
        <ModelSettingsSummary :ms="modelSettings" />
      </aside>
    </section>
  </div>
</template>

<style scoped>
.settings { width: min(1408px, 100%); margin: 0 auto; }
.settings__stat-value { display: block; font-size: 14px; font-weight: 700; color: var(--theme-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings__stat-meta { display: block; font-size: 11px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings .vg-stat__icon--gray { background: color-mix(in srgb, var(--vg-gray) 14%, transparent); color: var(--vg-gray); }

.settings__layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 14px; align-items: start; }
.settings__layout.has-side-panel { grid-template-columns: 260px minmax(0, 1fr) 300px; }
.settings__main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.settings__side { position: sticky; top: 0; }

/* Section navigation */
.settings-nav { position: sticky; top: 0; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
.settings-nav__group { display: flex; flex-direction: column; gap: 2px; }
.settings-nav__label { padding: 4px 10px; font-size: 11px; font-weight: 600; letter-spacing: .04em; color: var(--theme-text-muted); }
.settings-nav__item { border-top: 0 !important; padding: 9px 10px; }
.settings-nav__item.is-active .vg-list__title { color: var(--vg-accent); }
.settings-nav__icon { width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--theme-panel-soft); color: var(--theme-text-secondary); }
.settings-nav__item.is-active .settings-nav__icon { background: var(--vg-accent); color: var(--theme-on-accent); }

/* Cards */
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
.settings__hint { font-size: 12px; }
.settings__summary { grid-template-columns: 1fr; gap: 2px 0; }
.settings__summary dd { margin-bottom: 8px; font-size: 12px; }
.settings__notes { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: var(--theme-text-secondary); line-height: 1.55; }

/* Theme picker: previews deliberately use each theme's real colours. */
.theme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.theme-option { display: flex; flex-direction: column; padding: 0; overflow: hidden; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); color: var(--theme-text); cursor: pointer; text-align: left; transition: border-color .15s, box-shadow .15s; }
.theme-option:hover { border-color: var(--vg-accent-line); }
.theme-option.is-active { border-color: var(--vg-accent); box-shadow: 0 0 0 3px var(--vg-accent-soft); }
.theme-option__preview { position: relative; display: block; width: 100%; height: 92px; background: #090e18; border-bottom: 1px solid var(--theme-border); }
.theme-option__preview i { position: absolute; display: block; }
.theme-option__line { left: 10px; top: 12px; width: 48%; height: 8px; border-radius: 99px; background: #14b8a6; }
.theme-option__dot { left: 10px; bottom: 10px; width: 14px; height: 14px; border-radius: 999px; background: #14b8a6; }
.theme-option__field { left: 30px; right: 10px; bottom: 10px; height: 22px; border-radius: 8px; background: #151827; }
.theme-option--mono .theme-option__preview { background: #ffffff; }
.theme-option--mono .theme-option__line { background: #171717; }
.theme-option--mono .theme-option__dot { background: #171717; }
.theme-option--mono .theme-option__field { background: #f7f7f8; }
.theme-option--light-teal .theme-option__preview { background: #f7f9f8; }
.theme-option--light-teal .theme-option__line { background: #066b4d; }
.theme-option--light-teal .theme-option__dot { background: #087f5b; }
.theme-option--light-teal .theme-option__field { background: #e8f5ef; }
.theme-option__label { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 6px; padding: 10px 12px; font-size: 13px; font-weight: 600; }
.theme-option__label svg { color: var(--vg-accent); }

@media (max-width: 1280px) {
  .settings__layout.has-side-panel { grid-template-columns: 240px minmax(0, 1fr); }
  .settings__side { grid-column: 2; position: static; }
}
@media (max-width: 900px) {
  .settings__layout, .settings__layout.has-side-panel { grid-template-columns: 1fr; }
  .settings-nav, .settings__side { position: static; grid-column: auto; }
}
.settings__main.is-managed-locked > :not(.settings__managed-notice) { opacity: .55; }
.settings__managed-notice { margin-bottom: 12px; }
</style>
