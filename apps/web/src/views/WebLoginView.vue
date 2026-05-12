<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWebSessionStore } from '../stores/webSession'

const router = useRouter()
const session = useWebSessionStore()

const phone = ref('13800138000')
const code = ref('123456')
const displayName = ref('测试用户')

const submitDisabled = computed(
  () => session.loading || !phone.value.trim() || !code.value.trim() || !displayName.value.trim(),
)

async function submit() {
  const ok = await session.login({
    phone: phone.value,
    code: code.value,
    displayName: displayName.value,
  })
  if (ok) {
    await router.push('/clone')
  }
}
</script>

<template>
  <main class="login-shell">
    <section class="login-shell__intro">
      <span class="page-tag">VideoGen SaaS</span>
      <h1>AI 视频复刻工作台</h1>
      <p>
        面向商业化验证的 Web 工作台。当前版本已支持账号登录、复刻任务列表、五阶段复刻执行和算力状态查看。
      </p>

      <div class="login-highlights">
        <article class="login-highlight web-card web-card--soft">
          <strong>任务化执行</strong>
          <span>一个账号可同时管理多条爆款复刻任务，浏览器关闭后仍可恢复状态。</span>
        </article>
        <article class="login-highlight web-card web-card--soft">
          <strong>五阶段工作流</strong>
          <span>从参考分析到最终成片保持同一条生产链路，不再依赖桌面端单工作台切换。</span>
        </article>
        <article class="login-highlight web-card web-card--soft">
          <strong>计费与算力</strong>
          <span>会员、算力和任务执行已接入统一接口，为后续商业化付费体系预留结构。</span>
        </article>
      </div>
    </section>

    <section class="web-card login-panel">
      <div class="login-panel__head">
        <span class="login-tag">Secure Access</span>
        <h2>登录到 Web 工作台</h2>
        <p>当前演示环境固定验证码为 `123456`，后续会替换为正式短信登录链路。</p>
      </div>

      <div class="login-form">
        <label class="field">
          <span>手机号</span>
          <input v-model="phone" class="web-input" type="text" placeholder="请输入手机号" />
        </label>
        <label class="field">
          <span>验证码</span>
          <input v-model="code" class="web-input" type="text" placeholder="请输入验证码" />
        </label>
        <label class="field">
          <span>显示名称</span>
          <input v-model="displayName" class="web-input" type="text" placeholder="请输入显示名称" />
        </label>

        <button class="web-button web-button--lg" type="button" :disabled="submitDisabled" @click="submit">
          {{ session.loading ? '登录中...' : '登录并进入任务列表' }}
        </button>

        <div class="login-footnote">
          <span>默认手机号：{{ phone }}</span>
          <span>默认验证码：{{ code }}</span>
        </div>

        <div v-if="session.error" class="login-error">
          {{ session.error }}
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(420px, 520px);
  gap: 18px;
  padding: 20px;
}

.login-shell__intro {
  display: grid;
  align-content: center;
  gap: 16px;
  padding: 18px;
}

.login-shell__intro h1,
.login-shell__intro p,
.login-panel__head h2,
.login-panel__head p {
  margin: 0;
}

.login-shell__intro h1 {
  font-size: 44px;
  line-height: 1.08;
  letter-spacing: -0.03em;
}

.login-shell__intro p,
.login-panel__head p,
.login-highlight span,
.field span,
.login-footnote,
.login-error {
  color: var(--web-text-soft);
  font-size: 13px;
  line-height: 1.65;
}

.login-highlights {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.login-highlight {
  padding: 14px;
  display: grid;
  gap: 8px;
  min-height: 132px;
}

.login-highlight strong {
  color: #f4f7ff;
  font-size: 15px;
}

.login-panel {
  align-self: center;
  padding: 22px;
  display: grid;
  gap: 18px;
  backdrop-filter: blur(22px);
}

.login-panel__head {
  display: grid;
  gap: 6px;
}

.login-panel__head h2 {
  font-size: 28px;
  line-height: 1.16;
}

.login-tag {
  color: #7ce7ff;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-weight: 700;
}

.login-form {
  display: grid;
  gap: 12px;
}

.field {
  display: grid;
  gap: 6px;
}

.login-footnote {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.login-error {
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 116, 143, 0.22);
  background: rgba(111, 20, 37, 0.36);
  color: #ffb2c1;
}

@media (max-width: 1180px) {
  .login-shell {
    grid-template-columns: 1fr;
  }

  .login-highlights {
    grid-template-columns: 1fr;
  }

  .login-panel {
    max-width: 560px;
  }
}
</style>
