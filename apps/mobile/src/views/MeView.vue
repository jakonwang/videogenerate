<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, HardDrive, KeyRound, LogOut, RefreshCw, Server, ShieldCheck, Smartphone } from 'lucide-vue-next'
import type { SyncUsageResponse } from '@shared/cloud/sync'
import PageHeader from '@/components/PageHeader.vue'
import SyncStatus from '@/components/SyncStatus.vue'
import { clearFileCache } from '@/lib/files'
import { APP_VERSION, cloud, refreshAccount, session, signOut } from '@/lib/session'
import { requestSync } from '@/lib/sync'
import { toast } from '@/lib/toast'

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
        <button type="button" class="m-row" @click="router.push('/password')">
          <KeyRound :size="20" class="m-muted" />
          <span class="m-row__main"><span class="m-row__title">修改密码</span></span>
          <ChevronRight :size="18" class="m-muted" />
        </button>
        <button type="button" class="m-row" @click="clearCache">
          <HardDrive :size="20" class="m-muted" />
          <span class="m-row__main"><span class="m-row__title">清理图片缓存</span><span class="m-row__sub">释放手机空间，图片会在需要时重新下载</span></span>
        </button>
      </div>
    </section>

    <section class="m-section">
      <button type="button" class="m-btn m-btn--danger m-btn--block" @click="logout"><LogOut :size="18" /> 退出登录</button>
    </section>
    <p class="version">TiktokCut 手机版 v{{ APP_VERSION }}</p>
  </main>
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
