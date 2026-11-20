<script setup lang="ts">
import { isWeb } from '@/lib/platform'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, HardDrive, KeyRound, LogOut, RefreshCw, Server, ShieldCheck, Smartphone, AlarmClock } from 'lucide-vue-next'
import type { SyncUsageResponse } from '@shared/cloud/sync'
import PageHeader from '@/components/PageHeader.vue'
import SyncStatus from '@/components/SyncStatus.vue'
import { clearFileCache } from '@/lib/files'
import { APP_VERSION, cloud, refreshAccount, session, signOut } from '@/lib/session'
import { requestSync } from '@/lib/sync'
import { toast } from '@/lib/toast'
import { useInWebShell } from '@/lib/layout'
import WebStep from '@/components/web/WebStep.vue'
import WebResults from '@/components/web/WebResults.vue'
import { Brain, Check, Cloud, Layers, Palette, Settings2 } from 'lucide-vue-next'
import WebModelSettings from '@/components/web/WebModelSettings.vue'
import WebAiService from '@/components/web/WebAiService.vue'
import { Sparkles } from 'lucide-vue-next'
import WebAutomationSettings from '@/components/web/WebAutomationSettings.vue'
import BrandMemoryForm from '@/components/BrandMemoryForm.vue'
import { APP_THEMES, applyTheme, currentTheme, type AppTheme } from '@/lib/theme'
const settingsSection = ref<'appearance' | 'platforms' | 'capabilities' | 'ai' | 'brand' | 'automation' | 'account' | 'storage' | 'qiniu' | 'about'>('appearance')
const theme = ref<AppTheme>(currentTheme())
function setTheme(value: AppTheme) {
  theme.value = value
  applyTheme(value)
}
const ALL_SETTINGS_NAV = [
  { title: '常规', items: [{ key: 'appearance' as const, label: '外观', desc: '皮肤与主题', icon: Palette }] },
  { title: 'AI 平台与模型', items: [{ key: 'platforms' as const, label: 'AI 平台', desc: '电脑端的平台密钥与地址', icon: Server }, { key: 'capabilities' as const, label: '模型能力', desc: '视频 / 图片 / 对话用哪个模型', icon: Layers }] },
  { title: 'AI 制片人', items: [{ key: 'brand' as const, label: '品牌记忆', desc: '语气、人群、禁用词', icon: Brain }, { key: 'automation' as const, label: '体检与自动化', desc: '系统体检、每日简报、每周复盘', icon: AlarmClock }] },
  { title: '账号', items: [{ key: 'account' as const, label: '账号与安全', desc: '会员、密码、退出登录', icon: KeyRound }] },
  { title: '数据', items: [{ key: 'storage' as const, label: '同步与存储', desc: '云端空间、同步、缓存', icon: HardDrive }, { key: 'qiniu' as const, label: '七牛云', desc: '电脑端的七牛存储配置', icon: Cloud }, { key: 'about' as const, label: '服务器与版本', desc: '连接的服务器和版本号', icon: Server }] },
]
/**
 * 后台统一配置 AI 平台时（Key 只在服务器），普通用户不需要「AI 平台 / 模型能力 / 七牛云」，
 * 换成一个「AI 服务」说明页：不用填 Key、生成怎么计费。
 */
const managedAi = ref(true)
const SETTINGS_NAV = computed(() =>
  managedAi.value
    ? ALL_SETTINGS_NAV.map((group) =>
        group.title === 'AI 平台与模型'
          ? { title: 'AI', items: [{ key: 'ai' as const, label: 'AI 服务', desc: '平台统一提供，无需填写 Key', icon: Sparkles }] }
          : { ...group, items: group.items.filter((item) => item.key !== 'qiniu') },
      )
    : ALL_SETTINGS_NAV,
)
const inWebShell = useInWebShell()

const router = useRouter()
const usage = ref<SyncUsageResponse | null>(null)

const account = computed(() => session.user?.account || '')
const initial = computed(() => (session.user?.displayName || account.value || 'T').slice(0, 1).toUpperCase())
const planText = computed(() => {
  const e = session.entitlement
  if (!e) return session.offlineReason || '正在获取…'
  if (e.unlimited) return '不受限账号'
  if (!e.active) return '会员已过期'
  return `${e.planName || '会员'}${e.expiresAt ? ` · ${new Date(e.expiresAt).toLocaleDateString('zh-CN')} 到期` : ''}`
})
const storageText = computed(() => {
  if (!usage.value) return '—'
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)
  return `${mb(usage.value.fileBytes)} MB / ${mb(usage.value.quotaBytes)} MB`
})
const storagePct = computed(() => (usage.value ? Math.min(100, (usage.value.fileBytes / usage.value.quotaBytes) * 100) : 0))

onMounted(async () => {
  void refreshAccount()
  void cloud
    .getConfig()
    .then((config) => {
      managedAi.value = config.managedAi !== false
    })
    .catch(() => {})
  try {
    usage.value = await cloud.sync.usage()
  } catch {
    usage.value = null
  }
})

async function syncNow() {
  await requestSync()
  toast('同步完成')
}

async function clearCache() {
  await clearFileCache()
  toast('图片缓存已清理')
}

async function logout() {
  if (!window.confirm('退出登录？本机数据会保留，下次登录同一账号可继续使用。')) return
  await signOut()
  router.replace('/login')
}
</script>

<template>
  <template v-if="inWebShell">
    <PageHeader title="设置" description="外观、账号安全、同步与存储。" :icon="Settings2">
      <template #actions>
        <button type="button" class="vg-btn" @click="syncNow"><RefreshCw :size="14" /> 立即同步</button>
        <button type="button" class="vg-btn" @click="router.push('/membership')"><ShieldCheck :size="14" /> 账号与会员</button>
      </template>
    </PageHeader>
    <main class="vg-page st" data-testid="web-settings">
      <div class="st-stats">
        <div class="st-stat"><span class="st-stat__icon"><ShieldCheck :size="16" /></span><span><small>会员</small><strong>{{ planText }}</strong></span></div>
        <div class="st-stat"><span class="st-stat__icon is-blue"><HardDrive :size="16" /></span><span><small>云端空间</small><strong>{{ storageText }}</strong></span></div>
        <div class="st-stat"><span class="st-stat__icon is-violet"><RefreshCw :size="16" /></span><span><small>同步</small><strong><SyncStatus /></strong></span></div>
        <div class="st-stat"><span class="st-stat__icon is-amber"><KeyRound :size="16" /></span><span><small>账号</small><strong>{{ account }}</strong></span></div>
      </div>

      <div class="st-body">
        <nav class="st-nav">
          <template v-for="group in SETTINGS_NAV" :key="group.title">
            <span class="st-nav__group">{{ group.title }}</span>
            <button v-for="item in group.items" :key="item.key" type="button" class="st-nav__item" :class="{ 'is-active': settingsSection === item.key }" @click="settingsSection = item.key">
              <span class="st-nav__icon"><component :is="item.icon" :size="15" /></span>
              <span class="st-nav__text"><strong>{{ item.label }}</strong><small>{{ item.desc }}</small></span>
            </button>
          </template>
        </nav>

        <section class="st-panel">
          <template v-if="settingsSection === 'appearance'">
            <h2 class="vg-section-title"><Palette :size="16" /> 皮肤设置 <small>切换后立即生效，并在下次打开时保留</small></h2>
            <div class="st-themes">
              <button v-for="item in APP_THEMES" :key="item.key" type="button" class="st-theme" :class="[`st-theme--${item.key}`, { 'is-active': theme === item.key }]" @click="setTheme(item.key)">
                <span class="st-theme__preview"><i></i><i></i><b></b></span>
                <span class="st-theme__label">{{ item.label }}<Check v-if="theme === item.key" :size="14" /></span>
              </button>
            </div>
          </template>

          <template v-else-if="settingsSection === 'platforms' || settingsSection === 'capabilities' || settingsSection === 'qiniu'">
            <h2 class="vg-section-title">
              <component :is="settingsSection === 'platforms' ? Server : settingsSection === 'capabilities' ? Layers : Cloud" :size="16" />
              {{ settingsSection === 'platforms' ? 'AI 平台' : settingsSection === 'capabilities' ? '模型能力' : '七牛云' }}
              <small>和电脑端设置同一份配置</small>
            </h2>
            <WebModelSettings :key="settingsSection" :section="settingsSection" />
          </template>

          <template v-else-if="settingsSection === 'ai'">
            <WebAiService />
          </template>

          <template v-else-if="settingsSection === 'automation'">
            <WebAutomationSettings />
          </template>
          <template v-else-if="settingsSection === 'brand'">
            <h2 class="vg-section-title"><Brain :size="16" /> 品牌记忆 <small>让 AI 规划和文案遵守这些要求</small></h2>
            <BrandMemoryForm variant="web" />
          </template>

          <template v-else-if="settingsSection === 'account'">
            <h2 class="vg-section-title"><KeyRound :size="16" /> 账号与安全</h2>
            <div class="vg-list">
              <div class="vg-list__item"><span class="vg-list__main"><span class="vg-list__title">登录账号</span><span class="vg-list__sub">{{ account }}</span></span></div>
              <button type="button" class="vg-list__item vg-list__item--button" @click="router.push('/membership')"><span class="vg-list__main"><span class="vg-list__title">会员中心</span><span class="vg-list__sub">{{ planText }}</span></span><ChevronRight :size="15" /></button>
              <button type="button" class="vg-list__item vg-list__item--button" @click="router.push('/password')"><span class="vg-list__main"><span class="vg-list__title">修改密码</span><span class="vg-list__sub">修改后其它已登录的设备需要重新登录</span></span><ChevronRight :size="15" /></button>
            </div>
            <div><button type="button" class="vg-btn vg-btn--danger" @click="logout"><LogOut :size="14" /> 退出登录</button></div>
          </template>

          <template v-else-if="settingsSection === 'storage'">
            <h2 class="vg-section-title"><HardDrive :size="16" /> 同步与存储</h2>
            <div class="st-meter"><div class="st-meter__bar"><span :style="{ width: `${storagePct}%` }"></span></div><small>已用 {{ storageText }}</small></div>
            <div class="vg-list">
              <button type="button" class="vg-list__item vg-list__item--button" @click="syncNow"><span class="vg-list__main"><span class="vg-list__title">立即同步</span><span class="vg-list__sub">拉取电脑端和手机端的最新改动</span></span><RefreshCw :size="15" /></button>
              <button type="button" class="vg-list__item vg-list__item--button" @click="clearCache"><span class="vg-list__main"><span class="vg-list__title">清理图片缓存</span><span class="vg-list__sub">释放浏览器缓存，图片会在需要时重新下载</span></span><ChevronRight :size="15" /></button>
            </div>
          </template>

          <template v-else>
            <h2 class="vg-section-title"><Server :size="16" /> 服务器与版本</h2>
            <dl class="vg-kv">
              <dt>服务器</dt><dd>{{ session.baseUrl }}</dd>
              <dt>本机标识</dt><dd>{{ session.deviceId }}</dd>
              <dt>版本</dt><dd>Vidloom 网页版 v{{ APP_VERSION }}</dd>
            </dl>
          </template>
        </section>
      </div>
    </main>
  </template>
  <template v-else>
  <PageHeader title="我的" />
  <main class="m-page">
    <section class="profile m-card">
      <span class="profile__avatar">{{ initial }}</span>
      <div class="profile__main">
        <strong>{{ session.user?.displayName || account }}</strong>
        <span>{{ account }}</span>
      </div>
      <span class="m-badge" :class="session.entitlement?.active ? 'm-badge--green' : 'm-badge--amber'">{{ session.entitlement?.active ? '有效' : '未激活' }}</span>
    </section>

    <section class="m-section">
      <div class="m-card m-list">
        <button type="button" class="m-row" @click="router.push('/membership')">
          <ShieldCheck :size="20" class="m-muted" />
          <span class="m-row__main"><span class="m-row__title">会员中心</span><span class="m-row__sub">{{ planText }}</span></span>
          <ChevronRight :size="18" class="m-muted" />
        </button>
        <div class="m-row">
          <HardDrive :size="20" class="m-muted" />
          <span class="m-row__main">
            <span class="m-row__title">云端空间</span>
            <span class="m-row__sub">{{ storageText }}</span>
            <span class="bar"><span :style="{ width: `${storagePct}%` }" /></span>
          </span>
        </div>
        <button type="button" class="m-row" @click="syncNow">
          <RefreshCw :size="20" class="m-muted" />
          <span class="m-row__main"><span class="m-row__title">立即同步</span><span class="m-row__sub"><SyncStatus /></span></span>
        </button>
      </div>
    </section>

    <section class="m-section">
      <div class="m-card m-list">
        <div class="m-row">
          <Server :size="20" class="m-muted" />
          <span class="m-row__main"><span class="m-row__title">服务器</span><span class="m-row__sub">{{ session.baseUrl }}</span></span>
        </div>
        <div class="m-row">
          <Smartphone :size="20" class="m-muted" />
          <span class="m-row__main"><span class="m-row__title">本机设备</span><span class="m-row__sub">{{ session.deviceId.slice(0, 18) }}…</span></span>
        </div>
        <button type="button" class="m-row" @click="router.push('/brand')">
          <Brain :size="20" class="m-muted" />
          <span class="m-row__main"><span class="m-row__title">品牌记忆</span><span class="m-row__sub">AI 写文案时遵守的语气和禁用词</span></span>
          <ChevronRight :size="18" class="m-muted" />
        </button>
        <button type="button" class="m-row" @click="router.push('/password')">
          <KeyRound :size="20" class="m-muted" />
          <span class="m-row__main"><span class="m-row__title">修改密码</span></span>
          <ChevronRight :size="18" class="m-muted" />
        </button>
        <button type="button" class="m-row" @click="clearCache">
          <HardDrive :size="20" class="m-muted" />
          <span class="m-row__main"><span class="m-row__title">清理图片缓存</span><span class="m-row__sub">{{ isWeb ? '释放浏览器缓存' : '释放手机空间' }}，图片会在需要时重新下载</span></span>
        </button>
      </div>
    </section>

    <section class="m-section">
      <button type="button" class="m-btn m-btn--danger m-btn--block" @click="logout"><LogOut :size="18" /> 退出登录</button>
    </section>
    <p class="version">Vidloom {{ isWeb ? '网页版' : '手机版' }} v{{ APP_VERSION }}</p>
  </main>
  </template>
</template>

<style scoped>
.profile { display: flex; align-items: center; gap: 14px; padding: 18px; }
.profile__avatar { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 16px; background: linear-gradient(135deg, var(--m-accent), var(--m-accent-2)); color: #04201c; font-size: 22px; font-weight: 800; }
.profile__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.profile__main strong { font-size: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.profile__main span { color: var(--theme-text-muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar { display: block; height: 4px; margin-top: 8px; border-radius: 999px; background: var(--theme-control-hover); overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--m-accent), var(--m-accent-2)); }
.version { margin: 20px 0 0; color: var(--theme-text-muted); font-size: 12px; text-align: center; }
</style>
