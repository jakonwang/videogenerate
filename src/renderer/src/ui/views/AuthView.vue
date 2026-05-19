<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import TitleBar from '../components/TitleBar.vue'
import { useWebSessionStore } from '@/stores/webSession'
import { webApiClient } from '@/lib/webApiClient'

const router = useRouter()
const webSession = useWebSessionStore()

const phone = ref('')
const code = ref('')
const displayName = ref('')
const sending = ref(false)
const sendHint = ref('')

const errorMsg = computed(() => webSession.error || '')
const loginBusy = computed(() => webSession.loading)

async function sendCode() {
  sendHint.value = ''
  webSession.error = ''
  const normalizedPhone = phone.value.trim()
  if (!normalizedPhone) {
    webSession.error = '请输入手机号'
    return
  }
  sending.value = true
  try {
    const result = await webApiClient.sendLoginCode({ phone: normalizedPhone, channel: 'sms' })
    sendHint.value = result.devCode ? `验证码已发送，当前开发环境验证码：${result.devCode}` : '验证码已发送，请查收短信'
  } catch (error: any) {
    webSession.error = error?.message ?? String(error)
  } finally {
    sending.value = false
  }
}

async function login() {
  const ok = await webSession.login({
    phone: phone.value.trim(),
    code: code.value.trim(),
    displayName: displayName.value.trim() || undefined,
  })
  if (!ok) return
  await router.replace({ name: 'home' })
}
</script>

<template>
  <div class="ui-app auth-page">
    <TitleBar />
    <div class="auth-shell">
      <section class="auth-card">
        <div class="auth-copy">
          <div class="auth-copy__eyebrow">桌面端登录</div>
          <h1>手机号验证码登录</h1>
          <p>桌面端现在统一使用账号登录进入工作台，不再依赖授权码激活页。</p>
        </div>

        <div class="auth-form">
          <label class="auth-field">
            <span>手机号</span>
            <input v-model="phone" type="text" placeholder="请输入手机号" />
          </label>

          <label class="auth-field">
            <span>显示名称（可选）</span>
            <input v-model="displayName" type="text" placeholder="首次登录可填写昵称" />
          </label>

          <div class="auth-code-row">
            <label class="auth-field auth-field--code">
              <span>验证码</span>
              <input v-model="code" type="text" placeholder="请输入验证码" @keyup.enter="login" />
            </label>
            <button class="ghost-button" type="button" :disabled="sending" @click="sendCode">
              {{ sending ? '发送中...' : '发送验证码' }}
            </button>
          </div>

          <p v-if="sendHint" class="auth-hint auth-hint--success">{{ sendHint }}</p>
          <p v-if="errorMsg" class="auth-hint auth-hint--error">{{ errorMsg }}</p>

          <button class="primary-button" type="button" :disabled="loginBusy" @click="login">
            {{ loginBusy ? '登录中...' : '登录并进入桌面端' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at top, rgba(14, 165, 233, 0.14), transparent 28%),
    linear-gradient(180deg, #09111c 0%, #070d18 100%);
}

.auth-shell {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 32px 20px;
}

.auth-card {
  width: min(460px, 100%);
  display: grid;
  gap: 20px;
  padding: 28px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 24px;
  background: rgba(8, 13, 21, 0.82);
  box-shadow: 0 28px 60px rgba(0, 0, 0, 0.28);
}

.auth-copy__eyebrow {
  color: #7dd3fc;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.auth-copy h1 {
  margin: 10px 0 0;
  color: #fff;
  font-size: 30px;
  font-weight: 800;
}

.auth-copy p {
  margin: 10px 0 0;
  color: rgba(205, 218, 236, 0.76);
  line-height: 1.7;
}

.auth-form {
  display: grid;
  gap: 14px;
}

.auth-field {
  display: grid;
  gap: 6px;
}

.auth-field span {
  color: #dbe7f7;
  font-size: 12px;
  font-weight: 700;
}

.auth-field input {
  min-height: 46px;
  padding: 0 14px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: #f8fbff;
  outline: 0;
}

.auth-code-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.auth-field--code {
  min-width: 0;
}

.primary-button,
.ghost-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 800;
}

.primary-button {
  border: 1px solid rgba(59, 130, 246, 0.32);
  background: linear-gradient(135deg, #0ea5e9, #2563eb);
  color: #fff;
}

.ghost-button {
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.04);
  color: #eef5ff;
}

.primary-button:disabled,
.ghost-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.auth-hint {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
}

.auth-hint--success {
  border: 1px solid rgba(74, 222, 128, 0.18);
  background: rgba(34, 197, 94, 0.12);
  color: #ddffe7;
}

.auth-hint--error {
  border: 1px solid rgba(248, 113, 113, 0.18);
  background: rgba(239, 68, 68, 0.12);
  color: #ffd8d8;
}

@media (max-width: 720px) {
  .auth-code-row {
    grid-template-columns: 1fr;
  }
}
</style>
