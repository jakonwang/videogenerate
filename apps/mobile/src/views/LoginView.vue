<script setup lang="ts">
// Public assets live under the build base (/ in the App, /app/ on the web).
const brandLogo = `${import.meta.env.BASE_URL}brand-logo.png`
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Eye, EyeOff, LoaderCircle, Server, ShieldCheck } from 'lucide-vue-next'
import { isWideScreen } from '@/lib/layout'
import WebTitleBar from '@/components/web/WebTitleBar.vue'
import { errorMessage, registerAccount, session, setBaseUrl, signIn } from '@/lib/session'
import { isWeb } from '@/lib/platform'
import { clearLocalData, getMeta, setMeta } from '@/lib/localDb'
import { clearFileCache } from '@/lib/files'
import { requestSync } from '@/lib/sync'

const router = useRouter()
const route = useRoute()
const form = reactive({ account: '', password: '', confirmPassword: '', displayName: '' })
/** 网页版（电脑浏览器）用电脑端的登录页样式，并支持注册 */
const tab = ref<'login' | 'register'>('login')
const busy = ref(false)
const error = ref('')
const showPassword = ref(false)
const editingServer = ref(!session.baseUrl)
const serverDraft = ref(session.baseUrl)

async function saveServer() {
  const value = serverDraft.value.trim()
  if (!/^https?:\/\/.+/i.test(value)) {
    error.value = '服务器地址需要以 http:// 或 https:// 开头'
    return
  }
  await setBaseUrl(value)
  editingServer.value = false
  error.value = ''
}

async function submit() {
  if (!form.account.trim() || !form.password) {
    error.value = '请输入账号和密码'
    return
  }
  if (tab.value === 'register' && form.password !== form.confirmPassword) {
    error.value = '两次输入的密码不一致'
    return
  }
  busy.value = true
  error.value = ''
  try {
    if (tab.value === 'register') await registerAccount(form.account.trim(), form.password, form.displayName.trim())
    else await signIn(form.account.trim(), form.password)
    // Different account than last time on this phone: drop the previous account's local copy.
    const owner = await getMeta<string>('owner')
    if (owner && owner !== session.user?.id) {
      await clearLocalData()
      await clearFileCache()
    }
    await setMeta('owner', session.user?.id)
    void requestSync()
    router.replace(String(route.query.next || '/'))
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="isWideScreen" class="cloud-login" data-testid="web-login">
    <WebTitleBar minimal />
    <div class="cloud-login__body vg-scope">
      <div class="cloud-login__column">
        <header class="cloud-login__brand">
          <span class="vg-page-head__icon"><ShieldCheck :size="20" /></span>
          <div>
            <h1>{{ tab === 'login' ? '登录 Klipmill' : '注册账号' }}</h1>
            <p class="vg-muted">{{ tab === 'login' ? '登录账号后即可使用全部已开通的功能' : '注册后购买会员或使用兑换码即可开始使用' }}</p>
          </div>
        </header>

        <form class="vg-card cloud-login__form" @submit.prevent="submit">
          <div class="vg-field">
            <label for="web-account">手机号或邮箱</label>
            <input id="web-account" v-model="form.account" class="vg-input" autocomplete="username" required />
          </div>
          <div class="vg-field">
            <label for="web-password">密码</label>
            <input id="web-password" v-model="form.password" class="vg-input" type="password" :autocomplete="tab === 'login' ? 'current-password' : 'new-password'" required />
            <span v-if="tab === 'register'" class="vg-field__hint">至少 8 位</span>
          </div>
          <div v-if="tab === 'register'" class="vg-field">
            <label for="web-confirm-password">确认密码</label>
            <input id="web-confirm-password" v-model="form.confirmPassword" class="vg-input" type="password" autocomplete="new-password" required />
          </div>
          <div v-if="tab === 'register'" class="vg-field">
            <label for="web-display-name">昵称（可选）</label>
            <input id="web-display-name" v-model="form.displayName" class="vg-input" autocomplete="nickname" />
          </div>
          <div v-if="error" class="vg-field__error">{{ error }}</div>
          <button type="submit" class="vg-btn vg-btn--primary vg-btn--block vg-btn--lg" :disabled="busy || !session.baseUrl">
            <LoaderCircle v-if="busy" :size="16" class="vg-spin" />
            {{ busy ? (tab === 'login' ? '登录中…' : '注册中…') : tab === 'login' ? '登录' : '注册并登录' }}
          </button>
          <button type="button" class="vg-link cloud-login__switch" @click="(tab = tab === 'login' ? 'register' : 'login'), (error = ''), (form.confirmPassword = '')">
            {{ tab === 'login' ? '没有账号？注册' : '已有账号？登录' }}
          </button>
        </form>

        <p class="vg-muted cloud-login__server">
          <template v-if="editingServer">
            <input v-model="serverDraft" class="vg-input vg-input--sm" type="url" placeholder="https://api.example.com" />
            <button class="vg-btn vg-btn--sm" type="button" @click="saveServer">保存</button>
          </template>
          <button v-else type="button" class="cloud-login__server-btn" @click="editingServer = true">云端服务：{{ session.baseUrl || '点此设置' }}</button>
        </p>
      </div>
    </div>
  </div>
  <main v-else class="login">
    <div class="login__glow" aria-hidden="true" />
    <div class="login__brand">
      <img :src="brandLogo" alt="" class="login__logo" />
      <h1>Klipmill</h1>
      <p>智能视频生产工作台 · {{ isWeb ? '网页版' : '手机版' }}</p>
    </div>

    <form class="login__card m-card" @submit.prevent="submit">
      <label class="m-field">
        <span class="m-field__label">账号</span>
        <input v-model="form.account" class="m-input" type="text" autocomplete="username" inputmode="email" placeholder="手机号或邮箱" />
      </label>
      <label class="m-field">
        <span class="m-field__label">密码</span>
        <span class="login__password">
          <input v-model="form.password" class="m-input" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="请输入密码" />
          <button type="button" class="m-icon-btn" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword">
            <EyeOff v-if="showPassword" :size="18" /><Eye v-else :size="18" />
          </button>
        </span>
      </label>
      <p v-if="error" class="m-notice m-notice--red">{{ error }}</p>
      <button class="m-btn m-btn--primary m-btn--block login__submit" type="submit" :disabled="busy || !session.baseUrl">
        <LoaderCircle v-if="busy" :size="18" class="m-spin" />
        {{ busy ? '登录中…' : '登录' }}
      </button>
      <p class="login__hint">{{ isWeb ? '使用软件的同一个账号登录，商品库、模特库、作品会自动同步' : '使用电脑端同一个账号登录，商品库、模特库会自动同步' }}</p>
    </form>

    <div class="login__server">
      <template v-if="editingServer">
        <input v-model="serverDraft" class="m-input" type="url" inputmode="url" placeholder="https://api.example.com" />
        <button class="m-btn m-btn--sm" type="button" @click="saveServer">保存</button>
      </template>
      <button v-else type="button" class="login__server-link" @click="editingServer = true">
        <Server :size="14" /> {{ session.baseUrl || '设置服务器地址' }}
      </button>
    </div>
  </main>
</template>

<style scoped>
/* Web: same as the desktop CloudLoginView */
.cloud-login { height: 100vh; display: flex; flex-direction: column; background: var(--theme-bg, var(--theme-app-bg)); color: var(--theme-text); }
.cloud-login__body { flex: 1; min-height: 0; overflow: auto; display: flex; justify-content: center; padding: 48px 16px; }
.cloud-login__column { width: min(400px, 100%); display: flex; flex-direction: column; gap: 16px; margin: auto 0; }
.cloud-login__brand { display: flex; align-items: center; gap: 12px; }
.cloud-login__brand h1 { font-size: 20px; font-weight: 700; }
.cloud-login__brand p { font-size: 13px; margin-top: 2px; }
.cloud-login__form { display: flex; flex-direction: column; gap: 14px; }
.cloud-login__switch { align-self: center; font-size: 13px; background: none; border: 0; cursor: pointer; }
.cloud-login__server { display: flex; justify-content: center; gap: 8px; font-size: 11px; text-align: center; }
.cloud-login__server-btn { border: 0; background: none; color: inherit; font-size: 11px; cursor: pointer; }

.login > :not(.login__glow) { width: 100%; max-width: 440px; margin-left: auto; margin-right: auto; }
.login { position: relative; display: flex; flex-direction: column; justify-content: center; min-height: 100vh; padding: calc(var(--m-safe-top) + 32px) 24px calc(var(--m-safe-bottom) + 32px); overflow: hidden; }
.login__glow { position: absolute; top: -160px; left: 50%; width: 520px; height: 420px; transform: translateX(-50%); background: radial-gradient(closest-side, color-mix(in srgb, var(--m-accent) 26%, transparent), transparent); pointer-events: none; }
.login__brand { position: relative; display: flex; flex-direction: column; align-items: center; margin-bottom: 28px; text-align: center; }
.login__logo { width: 72px; height: 72px; padding: 14px; border-radius: 22px; background: var(--theme-panel); border: 1px solid var(--theme-border); box-shadow: 0 16px 40px rgba(0, 0, 0, .35); }
.login__brand h1 { margin: 18px 0 4px; font-size: 28px; font-weight: 800; letter-spacing: .01em; }
.login__brand p { margin: 0; color: var(--theme-text-muted); font-size: 14px; }
.login__card { position: relative; padding: 22px 18px 18px; }
.login__password { position: relative; display: block; }
.login__password .m-input { padding-right: 48px; }
.login__password .m-icon-btn { position: absolute; top: 4px; right: 4px; }
.login__submit { margin-top: 6px; }
.login__hint { margin: 14px 0 0; color: var(--theme-text-muted); font-size: 12px; text-align: center; }
.login__server { position: relative; display: flex; gap: 8px; justify-content: center; margin-top: 20px; }
.login__server .m-input { flex: 1; min-width: 0; height: 36px; font-size: 13px; }
.login__server .m-btn { flex: none; white-space: nowrap; }
.login__server-link { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; color: var(--theme-text-muted); font-size: 12px; }
</style>
