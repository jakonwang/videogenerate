<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { webApiClient } from '../services/webApi'

const loading = ref(false)
const profile = ref<any | null>(null)

async function refresh() {
  loading.value = true
  try {
    profile.value = await webApiClient.getProfile()
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <section class="account-page">
    <header class="web-card page-card">
      <span class="page-tag">Account Center</span>
      <h1>账户设置</h1>
      <p>查看当前登录用户、会员状态和钱包信息。</p>
    </header>

    <section class="content-grid">
      <article class="web-card page-card">
        <strong>基础资料</strong>
        <div class="info-grid">
          <div class="info-item">
            <span>显示名称</span>
            <strong>{{ profile?.user?.displayName || '--' }}</strong>
          </div>
          <div class="info-item">
            <span>手机号</span>
            <strong>{{ profile?.user?.phone || '--' }}</strong>
          </div>
          <div class="info-item">
            <span>用户状态</span>
            <strong>{{ profile?.user?.status || '--' }}</strong>
          </div>
        </div>
      </article>

      <article class="web-card page-card">
        <strong>会员与钱包</strong>
        <div class="info-grid">
          <div class="info-item">
            <span>当前套餐</span>
            <strong>{{ profile?.subscription?.planName || '未开通' }}</strong>
          </div>
          <div class="info-item">
            <span>套餐状态</span>
            <strong>{{ profile?.subscription?.status || '--' }}</strong>
          </div>
          <div class="info-item">
            <span>算力余额</span>
            <strong>{{ profile?.wallet?.balanceCredits ?? 0 }}</strong>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.account-page,
.content-grid,
.info-grid {
  display: grid;
  gap: 12px;
}

.page-card {
  padding: 16px;
}

h1,
p {
  margin: 0;
}

h1 {
  font-size: 28px;
  line-height: 1.16;
}

p,
.info-item span {
  color: var(--web-text-soft);
  font-size: 13px;
  line-height: 1.6;
}

.info-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.info-item {
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  display: grid;
  gap: 4px;
}

@media (max-width: 960px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
}
</style>
