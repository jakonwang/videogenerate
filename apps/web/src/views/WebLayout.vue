<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { useWebSessionStore } from '../stores/webSession'

const router = useRouter()
const session = useWebSessionStore()

const planName = computed(() => session.subscription?.planName || '未开通')
const credits = computed(() => session.wallet?.balanceCredits ?? 0)
const displayName = computed(() => session.user?.displayName || '访客')
const phone = computed(() => session.user?.phone || '--')

async function logout() {
  await session.logout()
  await router.push('/login')
}

onMounted(() => {
  void session.restoreSession()
})
</script>

<template>
  <div class="web-shell layout-shell">
    <aside class="layout-sidebar">
      <div class="web-card sidebar-card sidebar-brand">
        <span class="page-tag">VideoGen Web</span>
        <strong>商业化复刻工作台</strong>
        <small>面向浏览器访问、任务化执行和会员算力体系的独立前端入口。</small>
      </div>

      <nav class="web-card sidebar-card sidebar-nav">
        <RouterLink to="/clone" class="sidebar-link">
          <span>任务中心</span>
          <small>多任务管理与复刻执行</small>
        </RouterLink>
        <RouterLink to="/billing" class="sidebar-link">
          <span>会员与算力</span>
          <small>订阅、充值和消耗流水</small>
        </RouterLink>
        <RouterLink to="/account" class="sidebar-link">
          <span>账户设置</span>
          <small>用户资料与登录信息</small>
        </RouterLink>
      </nav>

      <div class="web-card web-card--soft sidebar-card sidebar-meta">
        <div>
          <span>当前套餐</span>
          <strong>{{ planName }}</strong>
        </div>
        <div>
          <span>算力余额</span>
          <strong>{{ credits }}</strong>
        </div>
      </div>
    </aside>

    <section class="layout-main">
      <header class="web-card layout-topbar">
        <div class="topbar-copy">
          <strong>{{ displayName }}</strong>
          <small>{{ phone }}</small>
        </div>
        <div class="topbar-actions">
          <button class="web-button web-button--ghost" type="button" @click="logout">退出登录</button>
        </div>
      </header>

      <main class="layout-content">
        <RouterView />
      </main>
    </section>
  </div>
</template>

<style scoped>
.layout-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 268px minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
}

.layout-sidebar {
  display: grid;
  align-content: start;
  gap: 12px;
}

.sidebar-card {
  padding: 14px;
  display: grid;
  gap: 8px;
}

.sidebar-brand strong {
  font-size: 18px;
  line-height: 1.2;
}

.sidebar-brand small,
.sidebar-link small,
.sidebar-meta span,
.topbar-copy small {
  color: var(--web-text-soft);
  font-size: 12px;
  line-height: 1.55;
}

.sidebar-nav {
  gap: 8px;
}

.sidebar-link {
  display: grid;
  gap: 3px;
  padding: 12px;
  border-radius: 12px;
  color: var(--web-text);
  text-decoration: none;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.04);
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
}

.sidebar-link:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
}

.sidebar-link.router-link-active {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.22), rgba(0, 232, 255, 0.12));
  border-color: rgba(124, 58, 237, 0.34);
}

.sidebar-link span,
.sidebar-meta strong,
.topbar-copy strong {
  color: #f3f6ff;
}

.sidebar-meta {
  grid-template-columns: 1fr;
}

.layout-main {
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
}

.layout-topbar {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.topbar-copy {
  display: grid;
  gap: 3px;
}

.topbar-actions {
  display: flex;
  gap: 8px;
}

.layout-content {
  min-width: 0;
}

@media (max-width: 1080px) {
  .layout-shell {
    grid-template-columns: 1fr;
  }
}
</style>
