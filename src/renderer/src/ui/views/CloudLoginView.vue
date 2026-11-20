<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { LoaderCircle, LogOut, ShieldCheck } from 'lucide-vue-next'
import TitleBar from '../components/TitleBar.vue'
import UiLocaleSelect from '../components/UiLocaleSelect.vue'
import CloudPurchasePanel from '../components/cloud/CloudPurchasePanel.vue'
import { useCloudAuthStore } from '@/stores/cloudAuth'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const cloudAuth = useCloudAuthStore()

const tab = ref<'login' | 'register'>('login')
const account = ref('')
const password = ref('')
const confirmPassword = ref('')
const displayName = ref('')
const submitting = ref(false)
const error = ref('')
const devices = ref<Array<{ id: string; name: string; platform: string; lastSeenAt: number }>>([])
const unbinding = ref('')

const status = computed(() => cloudAuth.status)
/** 已登录但没有有效会员 → 展示购买 / 兑换 */
const needsPurchase = computed(() => Boolean(status.value?.loggedIn) && !status.value?.licensed && status.value?.reason === 'no_entitlement')
const needsUnbind = computed(() => Boolean(status.value?.loggedIn) && status.value?.reason === 'device_limit')

function goNext() {
  const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') && !route.query.next.startsWith('/login') ? route.query.next : '/home'
  void router.replace(next)
}

async function submit() {
  error.value = ''
  if (tab.value === 'register' && password.value !== confirmPassword.value) {
    error.value = t('cloud.login.passwordMismatch')
    return
  }
  submitting.value = true
  try {
    const result =
      tab.value === 'login'
        ? await window.api.cloud.login({ account: account.value, password: password.value })
        : await window.api.cloud.register({ account: account.value, password: password.value, displayName: displayName.value || undefined })
    if (!result.ok) {
      error.value = result.error
      return
    }
    cloudAuth.setStatus(result.status)
    password.value = ''
    confirmPassword.value = ''
    if (!result.activation.ok && result.activation.reason === 'device_limit') {
      devices.value = (result.activation.devices ?? []) as typeof devices.value
    }
    if (result.status.licensed) goNext()
  } finally {
    submitting.value = false
  }
}

async function loadDevices() {
  const me = await window.api.cloud.me()
  if (me.ok) devices.value = me.devices
}

async function unbind(deviceId: string) {
  if (!window.confirm(t('cloud.membership.unbindConfirm'))) return
  unbinding.value = deviceId
  try {
    const result = await window.api.cloud.unbindDevice(deviceId)
    if (!result.ok) {
      error.value = result.error
      return
    }
    devices.value = result.devices
    cloudAuth.setStatus(result.status)
    if (result.status.licensed) goNext()
  } finally {
    unbinding.value = ''
  }
}

async function logout() {
  const result = await window.api.cloud.logout()
  if (result.ok) cloudAuth.setStatus(result.status)
  devices.value = []
}

function onActivated() {
  if (cloudAuth.licensed) goNext()
}

// 支付 / 兑换 / 解绑后授权变为有效时自动进入（购买面板此时可能已卸载，不能只依赖它的事件）
watch(
  () => cloudAuth.licensed,
  (licensed) => {
    if (licensed && route.name === 'login') goNext()
  },
)

onMounted(async () => {
  const current = await cloudAuth.ensureLoaded()
  if (current.licensed) {
    goNext()
    return
  }
  if (current.reason === 'device_limit') await loadDevices()
})
</script>

<template>
  <div class="ui-app cloud-login">
    <TitleBar />
    <div class="cloud-login__body vg-scope">
      <div class="cloud-login__column" :class="{ 'is-wide': needsPurchase }">
        <header class="cloud-login__brand">
          <span class="vg-page-head__icon"><ShieldCheck :size="20" /></span>
          <div>
            <h1>{{ needsPurchase || needsUnbind ? status?.account : tab === 'login' ? t('cloud.login.title') : t('cloud.login.registerTitle') }}</h1>
            <p class="vg-muted">
              {{ needsPurchase || needsUnbind ? t(`cloud.reason.${status?.reason}`) : tab === 'login' ? t('cloud.login.subtitle') : t('cloud.login.registerSubtitle') }}
            </p>
          </div>
          <div class="cloud-login__tools">
            <UiLocaleSelect />
            <button v-if="status?.loggedIn" type="button" class="vg-btn vg-btn--ghost vg-btn--sm" data-testid="cloud-login-logout" @click="logout">
              <LogOut :size="14" /> {{ t('cloud.membership.logout') }}
            </button>
          </div>
        </header>

        <CloudPurchasePanel v-if="needsPurchase" @activated="onActivated" />

        <section v-else-if="needsUnbind" class="vg-card">
          <div class="vg-card__head">
            <span class="vg-card__title">{{ t('cloud.membership.devices') }}</span>
          </div>
          <div v-if="error" class="vg-notice vg-notice--danger"><span>{{ error }}</span></div>
          <div class="vg-list">
            <div v-for="device in devices" :key="device.id" class="vg-list__item">
              <span class="vg-list__main">
                <span class="vg-list__title">{{ device.name || device.id }}</span>
                <span class="vg-list__sub">{{ device.platform }} · {{ t('cloud.membership.lastSeen', { time: new Date(device.lastSeenAt).toLocaleString() }) }}</span>
              </span>
              <button type="button" class="vg-btn vg-btn--sm" :disabled="unbinding === device.id" @click="unbind(device.id)">{{ t('cloud.membership.unbind') }}</button>
            </div>
          </div>
        </section>

        <form v-else class="vg-card cloud-login__form" data-testid="cloud-login-form" @submit.prevent="submit">
          <div v-if="status && !['ok', 'not_logged_in'].includes(status.reason)" class="vg-notice vg-notice--warning">
            <span>{{ t(`cloud.reason.${status.reason}`) }}</span>
          </div>
          <div class="vg-field">
            <label for="cloud-account">{{ t('cloud.login.account') }}</label>
            <input id="cloud-account" v-model="account" class="vg-input" autocomplete="username" required data-testid="cloud-login-account" />
          </div>
          <div class="vg-field">
            <label for="cloud-password">{{ t('cloud.login.password') }}</label>
            <input
              id="cloud-password"
              v-model="password"
              class="vg-input"
              type="password"
              :autocomplete="tab === 'login' ? 'current-password' : 'new-password'"
              required
              data-testid="cloud-login-password"
            />
            <span v-if="tab === 'register'" class="vg-field__hint">{{ t('cloud.login.passwordHint') }}</span>
          </div>
          <div v-if="tab === 'register'" class="vg-field">
            <label for="cloud-confirm-password">{{ t('cloud.login.confirmPassword') }}</label>
            <input id="cloud-confirm-password" v-model="confirmPassword" class="vg-input" type="password" autocomplete="new-password" required data-testid="cloud-login-confirm-password" />
          </div>
          <div v-if="tab === 'register'" class="vg-field">
            <label for="cloud-display-name">{{ t('cloud.login.displayName') }}</label>
            <input id="cloud-display-name" v-model="displayName" class="vg-input" autocomplete="nickname" />
          </div>
          <div v-if="error" class="vg-field__error">{{ error }}</div>
          <button type="submit" class="vg-btn vg-btn--primary vg-btn--block vg-btn--lg" :disabled="submitting" data-testid="cloud-login-submit">
            <LoaderCircle v-if="submitting" :size="16" class="vg-spin" />
            {{
              submitting
                ? tab === 'login' ? t('cloud.login.loggingIn') : t('cloud.login.registering')
                : tab === 'login' ? t('cloud.login.submitLogin') : t('cloud.login.submitRegister')
            }}
          </button>
          <button type="button" class="vg-link cloud-login__switch" @click="(tab = tab === 'login' ? 'register' : 'login'), (error = ''), (confirmPassword = '')">
            {{ tab === 'login' ? t('cloud.login.toRegister') : t('cloud.login.toLogin') }}
          </button>
        </form>

        <p class="vg-muted cloud-login__server">{{ t('cloud.login.server', { url: status?.cloudApiBase ?? '' }) }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cloud-login { height: 100vh; display: flex; flex-direction: column; background: var(--theme-bg, var(--theme-app-bg)); color: var(--theme-text); }
.cloud-login__body { flex: 1; min-height: 0; overflow: auto; display: flex; justify-content: center; padding: 48px 16px; }
.cloud-login__column { width: min(400px, 100%); display: flex; flex-direction: column; gap: 16px; margin: auto 0; }
.cloud-login__column.is-wide { width: min(880px, 100%); }
.cloud-login__brand { display: flex; align-items: center; gap: 12px; }
.cloud-login__brand h1 { font-size: 20px; font-weight: 700; }
.cloud-login__brand p { font-size: 13px; margin-top: 2px; }
.cloud-login__tools { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.cloud-login__form { display: flex; flex-direction: column; gap: 14px; }
.cloud-login__switch { align-self: center; font-size: 13px; background: none; border: 0; cursor: pointer; }
.cloud-login__server { font-size: 11px; text-align: center; }
</style>
