<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Clapperboard, Image as ImageIcon, MessagesSquare, Server, Cloud } from 'lucide-vue-next'

const settingsBusy = ref(false)
const settingsMessage = ref('')
const modelSettingsBusy = ref(false)
const modelSettingsSection = ref<'video' | 'image' | 'chat' | 'qiniu'>('video')
const settingsMode = ref<'simple' | 'pro'>('pro')
const modelVisibleSecrets = ref<Record<string, boolean>>({
  klingApiKey: false,
  grsaiApiKey: false,
  apifoxApiKey: false,
  qiniuAccessKey: false,
  qiniuSecretKey: false,
})

const modelCredentials = ref({
  klingApiKey: '',
  klingHost: '',
  grsaiApiKey: '',
  grsaiHost: '',
  qiniuAccessKey: '',
  qiniuSecretKey: '',
  qiniuBucket: '',
  qiniuDomain: '',
  qiniuUploadHost: '',
  qiniuPrefix: '',
  allowMockWhenNoKey: false,
  keyframeModel: '',
  videoProviderPrimary: 'kling',
  videoModelPrimary: 'veo_3_1-lite',
  videoProviderFallback: 'kling',
  videoModelFallback: 'google/veo3.1-lite/image-to-video',
  grsaiVideoModel: 'grok-video-3',
  imageProviderPrimary: 'apifox_hub',
  chatProviderPrimary: 'apifox_hub' as 'apifox_hub' | 'grsai',
  klingImageModel: '',
  grsaiImageModel: '',
  grsaiAnalysisModel: '',
  apifoxHub: {
    enabled: false,
    baseUrl: '',
    apiKey: '',
    chatProvider: 'openai',
    chatModel: '',
    chatEndpointStyle: 'openai_chat',
    imageProvider: 'openai',
    imageModel: '',
    imageEditModel: '',
    imageEndpointStyle: 'openai_images',
    videoProvider: 'veo',
    textToVideoModel: '',
    imageToVideoModel: '',
    startEndVideoModel: '',
    referenceVideoModel: 'google/veo3.1-lite/image-to-video',
    videoEndpointStyle: 'official_rest',
    defaultPollIntervalMs: 2000,
    defaultTimeoutMs: 600000,
  },
})

const sectionMeta = [
  { key: 'video', label: '视频模型', desc: '主视频 provider、模型与调用方式', icon: Clapperboard },
  { key: 'image', label: '图片模型', desc: '文生图和图像编辑链路', icon: ImageIcon },
  { key: 'chat', label: '对话模型', desc: '脚本分析和通用问答模型', icon: MessagesSquare },
  { key: 'qiniu', label: '云存储', desc: '七牛上传、外链和资源前缀', icon: Cloud },
] as const

const settingsMessageTone = computed(() => {
  const text = String(settingsMessage.value || '').trim()
  if (!text) return 'neutral'
  if (text.includes('已') || text.includes('开始')) return 'success'
  return 'error'
})

const activeVideoProviderLabel = computed(() => (modelCredentials.value.videoProviderPrimary === 'apifox_hub' ? 'ai666' : modelCredentials.value.videoProviderPrimary === 'grsai' ? 'GRS.AI' : 'AtlasCloud'))
const activeImageProviderLabel = computed(() => (modelCredentials.value.imageProviderPrimary === 'apifox_hub' ? 'ai666' : modelCredentials.value.imageProviderPrimary === 'grsai' ? 'GRS.AI' : 'AtlasCloud'))
const activeChatProviderLabel = computed(() => (modelCredentials.value.chatProviderPrimary === 'apifox_hub' ? 'ai666' : 'GRS.AI'))

const videoPrimaryModelBinding = computed({
  get: () => {
    const creds = modelCredentials.value
    if (creds.videoProviderPrimary === 'apifox_hub') return creds.apifoxHub.referenceVideoModel || creds.apifoxHub.imageToVideoModel || creds.apifoxHub.textToVideoModel || ''
    if (creds.videoProviderPrimary === 'grsai') return creds.grsaiVideoModel || ''
    return creds.videoModelFallback || creds.videoModelPrimary || ''
  },
  set: (value: string) => {
    const creds = modelCredentials.value
    if (creds.videoProviderPrimary === 'apifox_hub') {
      creds.apifoxHub.referenceVideoModel = value
      creds.apifoxHub.imageToVideoModel = value
      creds.apifoxHub.textToVideoModel = value
      return
    }
    if (creds.videoProviderPrimary === 'grsai') {
      creds.grsaiVideoModel = value
      return
    }
    creds.videoModelFallback = value
    creds.videoModelPrimary = value
  },
})

const imagePrimaryModelBinding = computed({
  get: () => {
    const creds = modelCredentials.value
    if (creds.imageProviderPrimary === 'apifox_hub') return creds.apifoxHub.imageModel || ''
    if (creds.imageProviderPrimary === 'grsai') return creds.grsaiImageModel || ''
    return creds.klingImageModel || ''
  },
  set: (value: string) => {
    const creds = modelCredentials.value
    if (creds.imageProviderPrimary === 'apifox_hub') {
      creds.apifoxHub.imageModel = value
      return
    }
    if (creds.imageProviderPrimary === 'grsai') {
      creds.grsaiImageModel = value
      return
    }
    creds.klingImageModel = value
  },
})

const chatPrimaryModelBinding = computed({
  get: () => (modelCredentials.value.chatProviderPrimary === 'apifox_hub' ? modelCredentials.value.apifoxHub.chatModel || '' : modelCredentials.value.grsaiAnalysisModel || ''),
  set: (value: string) => {
    if (modelCredentials.value.chatProviderPrimary === 'apifox_hub') {
      modelCredentials.value.apifoxHub.chatModel = value
      return
    }
    modelCredentials.value.grsaiAnalysisModel = value
  },
})

const summaryCards = computed(() => [
  { title: '视频 provider', value: activeVideoProviderLabel.value, meta: videoPrimaryModelBinding.value || '未设置', tone: 'violet', icon: Clapperboard },
  { title: '图片 provider', value: activeImageProviderLabel.value, meta: imagePrimaryModelBinding.value || '未设置', tone: 'cyan', icon: ImageIcon },
  { title: '脚本 provider', value: activeChatProviderLabel.value, meta: chatPrimaryModelBinding.value || '未设置', tone: 'green', icon: MessagesSquare },
  { title: '配置状态', value: settingsMessage.value || '待同步', meta: modelSettingsBusy.value ? '处理中' : '可保存', tone: 'slate', icon: Server },
])

function toggleModelSecret(key: string) {
  modelVisibleSecrets.value[key] = !modelVisibleSecrets.value[key]
}

function modelSecretType(key: string) {
  return modelVisibleSecrets.value[key] ? 'text' : 'password'
}

async function refreshModelSettings() {
  modelSettingsBusy.value = true
  try {
    const next = (await window.api.clone.getModelCredentials()) as typeof modelCredentials.value
    modelCredentials.value = { ...modelCredentials.value, ...next }
    settingsMessage.value = '已读取当前配置'
  } catch (e: any) {
    settingsMessage.value = `读取配置失败：${e?.message ?? String(e)}`
  } finally {
    modelSettingsBusy.value = false
  }
}

async function saveModelSettings() {
  modelSettingsBusy.value = true
  settingsMessage.value = ''
  try {
    const payload = JSON.parse(JSON.stringify(modelCredentials.value))
    await window.api.clone.setModelCredentials(payload)
    const confirmed = (await window.api.clone.getModelCredentials()) as typeof modelCredentials.value
    modelCredentials.value = { ...modelCredentials.value, ...confirmed }
    settingsMessage.value = '模型配置已保存并重新加载'
  } catch (e: any) {
    settingsMessage.value = `保存失败：${e?.message ?? String(e)}`
  } finally {
    modelSettingsBusy.value = false
  }
}

async function openDataDir() {
  try {
    const paths = (await window.api.getPaths()) as { dataDir?: string }
    const dir = String(paths?.dataDir ?? '').trim()
    if (!dir) {
      settingsMessage.value = '未找到本地数据目录'
      return
    }
    await window.api.shell.openPath(dir)
    settingsMessage.value = '已打开本地数据目录'
  } catch (e: any) {
    settingsMessage.value = `打开数据目录失败：${e?.message ?? String(e)}`
  }
}

async function checkUpdatesNow() {
  if (settingsBusy.value) return
  settingsBusy.value = true
  settingsMessage.value = ''
  try {
    const res = (await window.api.updater.checkForUpdates()) as { ok: true } | { ok: false; reason?: string; message?: string }
    settingsMessage.value = res?.ok ? '已开始检查更新' : `检查更新失败：${res?.message ?? res?.reason ?? 'unknown'}`
  } catch (e: any) {
    settingsMessage.value = `检查更新失败：${e?.message ?? String(e)}`
  } finally {
    settingsBusy.value = false
  }
}

onMounted(() => {
  void refreshModelSettings()
})
</script>

<template>
  <div class="settings-console">
    <section class="settings-shell">
      <div class="settings-shell__hero">
        <div>
          <div class="settings-kicker">Settings / Control Center</div>
          <h1>统一模型与云配置入口</h1>
          <p>设置页不再作为普通后台表单，而是统一纳入工作台骨架，所有 provider 与模型都在这里显式透传管理。</p>
        </div>
        <div class="settings-shell__actions">
          <div class="mode-switch">
            <button type="button" :class="{ active: settingsMode === 'simple' }" @click="settingsMode = 'simple'">简洁</button>
            <button type="button" :class="{ active: settingsMode === 'pro' }" @click="settingsMode = 'pro'">专业</button>
          </div>
          <button class="ghost-button small" :disabled="settingsBusy" @click="checkUpdatesNow">检查更新</button>
          <button class="ghost-button small" @click="openDataDir">打开数据目录</button>
          <button class="ghost-button small" @click="refreshModelSettings">刷新</button>
          <button class="primary-button small" :disabled="modelSettingsBusy" @click="saveModelSettings">{{ modelSettingsBusy ? '保存中' : '保存配置' }}</button>
        </div>
      </div>

      <div class="settings-summary-grid">
        <article v-for="item in summaryCards" :key="item.title" class="summary-card" :class="`tone-${item.tone}`">
          <div class="summary-card__icon">
            <component :is="item.icon" :size="16" />
          </div>
          <div>
            <span>{{ item.title }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.meta }}</small>
          </div>
        </article>
      </div>
    </section>

    <section class="settings-layout">
      <aside class="settings-nav-panel">
        <button
          v-for="item in sectionMeta"
          :key="item.key"
          class="nav-item"
          :class="{ active: modelSettingsSection === item.key }"
          @click="modelSettingsSection = item.key"
        >
          <span class="nav-item__icon"><component :is="item.icon" :size="16" /></span>
          <div>
            <strong>{{ item.label }}</strong>
            <small>{{ item.desc }}</small>
          </div>
        </button>
      </aside>

      <main class="settings-form-panel">
        <div v-if="settingsMessage" class="settings-message" :class="settingsMessageTone">{{ settingsMessage }}</div>

        <section v-if="modelSettingsSection === 'video'" class="form-section">
          <div class="section-head">
            <div>
              <h2>视频模型</h2>
              <p>控制视频生成主链路，禁止 silent fallback。</p>
            </div>
          </div>
          <div class="form-grid">
            <label>
              <span>视频 provider</span>
              <select v-model="modelCredentials.videoProviderPrimary">
                <option value="kling">AtlasCloud</option>
                <option value="grsai">GRS.AI</option>
                <option value="apifox_hub">ai666</option>
              </select>
            </label>
            <label>
              <span>视频模型</span>
              <input v-model="videoPrimaryModelBinding" />
            </label>
            <label v-if="modelCredentials.videoProviderPrimary === 'kling'">
              <span>AtlasCloud API Key</span>
              <div class="field-inline">
                <input v-model="modelCredentials.klingApiKey" :type="modelSecretType('klingApiKey')" />
                <button class="ghost-button tiny" type="button" @click="toggleModelSecret('klingApiKey')">{{ modelVisibleSecrets.klingApiKey ? '隐藏' : '显示' }}</button>
              </div>
            </label>
            <label v-if="modelCredentials.videoProviderPrimary === 'kling'">
              <span>AtlasCloud Host</span>
              <input v-model="modelCredentials.klingHost" />
            </label>
            <label v-if="modelCredentials.videoProviderPrimary === 'grsai'">
              <span>GRS.AI API Key</span>
              <div class="field-inline">
                <input v-model="modelCredentials.grsaiApiKey" :type="modelSecretType('grsaiApiKey')" />
                <button class="ghost-button tiny" type="button" @click="toggleModelSecret('grsaiApiKey')">{{ modelVisibleSecrets.grsaiApiKey ? '隐藏' : '显示' }}</button>
              </div>
            </label>
            <label v-if="modelCredentials.videoProviderPrimary === 'grsai'">
              <span>GRS.AI Host</span>
              <input v-model="modelCredentials.grsaiHost" />
            </label>
            <template v-if="modelCredentials.videoProviderPrimary === 'apifox_hub'">
              <label>
                <span>ai666 Base URL</span>
                <input v-model="modelCredentials.apifoxHub.baseUrl" />
              </label>
              <label>
                <span>ai666 API Key</span>
                <div class="field-inline">
                  <input v-model="modelCredentials.apifoxHub.apiKey" :type="modelSecretType('apifoxApiKey')" />
                  <button class="ghost-button tiny" type="button" @click="toggleModelSecret('apifoxApiKey')">{{ modelVisibleSecrets.apifoxApiKey ? '隐藏' : '显示' }}</button>
                </div>
              </label>
            </template>
          </div>
        </section>

        <section v-else-if="modelSettingsSection === 'image'" class="form-section">
          <div class="section-head">
            <div>
              <h2>图片模型</h2>
              <p>控制文生图、图像编辑与分镜图生成链路。</p>
            </div>
          </div>
          <div class="form-grid">
            <label>
              <span>图片 provider</span>
              <select v-model="modelCredentials.imageProviderPrimary">
                <option value="kling">AtlasCloud</option>
                <option value="grsai">GRS.AI</option>
                <option value="apifox_hub">ai666</option>
              </select>
            </label>
            <label>
              <span>图片模型</span>
              <input v-model="imagePrimaryModelBinding" />
            </label>
            <label v-if="modelCredentials.imageProviderPrimary === 'apifox_hub'">
              <span>图片 Base URL</span>
              <input v-model="modelCredentials.apifoxHub.baseUrl" />
            </label>
            <label v-if="modelCredentials.imageProviderPrimary === 'apifox_hub'">
              <span>图片 API Key</span>
              <div class="field-inline">
                <input v-model="modelCredentials.apifoxHub.apiKey" :type="modelSecretType('apifoxApiKey')" />
                <button class="ghost-button tiny" type="button" @click="toggleModelSecret('apifoxApiKey')">{{ modelVisibleSecrets.apifoxApiKey ? '隐藏' : '显示' }}</button>
              </div>
            </label>
          </div>
        </section>

        <section v-else-if="modelSettingsSection === 'chat'" class="form-section">
          <div class="section-head">
            <div>
              <h2>对话模型</h2>
              <p>控制脚本分析、工作流辅助和通用问答。</p>
            </div>
          </div>
          <div class="form-grid">
            <label>
              <span>对话 provider</span>
              <select v-model="modelCredentials.chatProviderPrimary">
                <option value="apifox_hub">ai666</option>
                <option value="grsai">GRS.AI</option>
              </select>
            </label>
            <label>
              <span>对话模型</span>
              <input v-model="chatPrimaryModelBinding" />
            </label>
            <label v-if="modelCredentials.chatProviderPrimary === 'apifox_hub'">
              <span>对话 Base URL</span>
              <input v-model="modelCredentials.apifoxHub.baseUrl" />
            </label>
            <label v-if="modelCredentials.chatProviderPrimary === 'apifox_hub'">
              <span>对话 API Key</span>
              <div class="field-inline">
                <input v-model="modelCredentials.apifoxHub.apiKey" :type="modelSecretType('apifoxApiKey')" />
                <button class="ghost-button tiny" type="button" @click="toggleModelSecret('apifoxApiKey')">{{ modelVisibleSecrets.apifoxApiKey ? '隐藏' : '显示' }}</button>
              </div>
            </label>
            <label v-if="modelCredentials.chatProviderPrimary === 'grsai'">
              <span>GRS.AI API Key</span>
              <div class="field-inline">
                <input v-model="modelCredentials.grsaiApiKey" :type="modelSecretType('grsaiApiKey')" />
                <button class="ghost-button tiny" type="button" @click="toggleModelSecret('grsaiApiKey')">{{ modelVisibleSecrets.grsaiApiKey ? '隐藏' : '显示' }}</button>
              </div>
            </label>
            <label v-if="modelCredentials.chatProviderPrimary === 'grsai'">
              <span>GRS.AI Host</span>
              <input v-model="modelCredentials.grsaiHost" />
            </label>
          </div>
        </section>

        <section v-else class="form-section">
          <div class="section-head">
            <div>
              <h2>七牛云配置</h2>
              <p>统一资源上传、外链回显与前缀策略。</p>
            </div>
          </div>
          <div class="form-grid">
            <label>
              <span>Access Key</span>
              <div class="field-inline">
                <input v-model="modelCredentials.qiniuAccessKey" :type="modelSecretType('qiniuAccessKey')" />
                <button class="ghost-button tiny" type="button" @click="toggleModelSecret('qiniuAccessKey')">{{ modelVisibleSecrets.qiniuAccessKey ? '隐藏' : '显示' }}</button>
              </div>
            </label>
            <label>
              <span>Secret Key</span>
              <div class="field-inline">
                <input v-model="modelCredentials.qiniuSecretKey" :type="modelSecretType('qiniuSecretKey')" />
                <button class="ghost-button tiny" type="button" @click="toggleModelSecret('qiniuSecretKey')">{{ modelVisibleSecrets.qiniuSecretKey ? '隐藏' : '显示' }}</button>
              </div>
            </label>
            <label><span>Bucket</span><input v-model="modelCredentials.qiniuBucket" /></label>
            <label><span>Domain</span><input v-model="modelCredentials.qiniuDomain" /></label>
            <label><span>Upload Host</span><input v-model="modelCredentials.qiniuUploadHost" /></label>
            <label><span>Prefix</span><input v-model="modelCredentials.qiniuPrefix" /></label>
          </div>
        </section>
      </main>

      <aside class="settings-side-panel">
        <section class="side-card">
          <div class="side-card__head">
            <h3>当前生效摘要</h3>
          </div>
          <div class="side-list">
            <div class="side-row"><span>视频</span><strong>{{ activeVideoProviderLabel }} / {{ videoPrimaryModelBinding || '未设置' }}</strong></div>
            <div class="side-row"><span>图片</span><strong>{{ activeImageProviderLabel }} / {{ imagePrimaryModelBinding || '未设置' }}</strong></div>
            <div class="side-row"><span>脚本</span><strong>{{ activeChatProviderLabel }} / {{ chatPrimaryModelBinding || '未设置' }}</strong></div>
          </div>
        </section>

        <section class="side-card">
          <div class="side-card__head">
            <h3>测试状态</h3>
          </div>
          <div class="bullet-list">
            <div class="bullet-item">所有模型配置保持用户透传，不做静默 fallback。</div>
            <div class="bullet-item">保存后立即重新读取配置，避免前端假回显。</div>
            <div class="bullet-item">开发环境 Windows，部署 Linux，避免写死本地路径规则。</div>
          </div>
        </section>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.settings-console {
  display: grid;
  gap: 12px;
  min-height: 100%;
  padding: 16px;
  background:
    radial-gradient(circle at 16% 0, rgba(109, 93, 255, 0.12), transparent 24%),
    radial-gradient(circle at 84% 10%, rgba(34, 211, 238, 0.08), transparent 18%),
    linear-gradient(180deg, #060b16 0%, #08111f 100%);
  color: #f8fafc;
}

.settings-shell,
.settings-nav-panel,
.settings-form-panel,
.settings-side-panel,
.side-card,
.summary-card,
.nav-item,
.settings-message,
.bullet-item {
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(17, 28, 49, 0.92), rgba(8, 17, 31, 0.94));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.settings-shell {
  padding: 18px;
  display: grid;
  gap: 14px;
}

.settings-shell__hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.settings-kicker {
  color: #8ea0c7;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.settings-shell__hero h1 {
  margin: 6px 0 8px;
  font-size: 28px;
}

.settings-shell__hero p,
.section-head p,
.nav-item small,
.summary-card small,
.side-row span {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
}

.settings-shell__actions,
.mode-switch,
.field-inline,
.side-row,
.side-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-shell__actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.mode-switch {
  padding: 4px;
  border-radius: 14px;
  background: rgba(10, 19, 36, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.mode-switch button {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  color: #cbd5e1;
}

.mode-switch .active {
  background: rgba(109, 93, 255, 0.14);
  color: #f8fafc;
}

.settings-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.summary-card {
  padding: 12px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 10px;
}

.summary-card__icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
}

.summary-card span {
  color: #94a3b8;
  font-size: 11px;
}

.summary-card strong {
  display: block;
  margin-top: 4px;
}

.settings-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 320px;
  gap: 12px;
  min-height: 0;
}

.settings-nav-panel,
.settings-form-panel,
.settings-side-panel {
  padding: 14px;
  min-height: 0;
}

.settings-nav-panel,
.settings-side-panel,
.settings-form-panel,
.side-card,
.form-section {
  display: grid;
  gap: 12px;
  align-content: start;
}

.nav-item {
  padding: 12px;
  text-align: left;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 10px;
  background: rgba(10, 19, 36, 0.78);
}

.nav-item.active {
  border-color: rgba(109, 93, 255, 0.42);
  box-shadow: 0 0 0 1px rgba(109, 93, 255, 0.12);
}

.nav-item__icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(109, 93, 255, 0.16);
  color: #d8deff;
}

.settings-message {
  padding: 12px;
  font-size: 12px;
}

.settings-message.success {
  border-color: rgba(34, 197, 94, 0.24);
  background: rgba(34, 197, 94, 0.12);
  color: #d1fae5;
}

.settings-message.error {
  border-color: rgba(239, 68, 68, 0.24);
  background: rgba(239, 68, 68, 0.12);
  color: #fee2e2;
}

.section-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.section-head h2,
.side-card__head h3 {
  margin: 0;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.form-grid label,
.side-list {
  display: grid;
  gap: 6px;
}

.form-grid label span {
  color: #94a3b8;
  font-size: 11px;
}

.form-grid input,
.form-grid select {
  height: 42px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: #0a1324;
  padding: 0 12px;
  color: #f8fafc;
}

.field-inline input {
  flex: 1;
}

.side-card {
  padding: 14px;
}

.side-row {
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.side-row:last-child {
  border-bottom: 0;
}

.bullet-list {
  display: grid;
  gap: 10px;
}

.bullet-item {
  padding: 12px;
  background: rgba(10, 19, 36, 0.78);
  font-size: 12px;
  color: #cbd5e1;
}

.primary-button,
.ghost-button {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.primary-button {
  background: linear-gradient(135deg, #6d5dff, #8b5cf6);
  border: 1px solid rgba(109, 93, 255, 0.42);
  color: #fff;
  box-shadow: 0 12px 32px rgba(109, 93, 255, 0.24);
}

.ghost-button {
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
  color: #cbd5e1;
}

.tiny {
  min-height: 30px;
  padding: 0 10px;
}

@media (max-width: 1440px) {
  .settings-layout,
  .settings-summary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 960px) {
  .settings-shell__hero,
  .form-grid {
    grid-template-columns: 1fr;
    display: grid;
  }
}
</style>
