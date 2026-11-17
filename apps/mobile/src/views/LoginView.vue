<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Eye, EyeOff, LoaderCircle, Server } from 'lucide-vue-next'
import { errorMessage, session, setBaseUrl, signIn } from '@/lib/session'
import { clearLocalData, getMeta, setMeta } from '@/lib/localDb'
import { clearFileCache } from '@/lib/files'
import { requestSync } from '@/lib/sync'

const router = useRouter()
const route = useRoute()
const form = reactive({ account: '', password: '' })
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
  busy.value = true
  error.value = ''
  try {
    await signIn(form.account.trim(), form.password)
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
  <main class="login">
    <div class="login__glow" aria-hidden="true" />
    <div class="login__brand">
      <img src="/brand-logo.png" alt="" class="login__logo" />
      <h1>TiktokCut</h1>
      <p>智能视频生产工作台 · 手机版</p>
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
      <p class="login__hint">使用电脑端同一个账号登录，商品库、模特库会自动同步</p>
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
