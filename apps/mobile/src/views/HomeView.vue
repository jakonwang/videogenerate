<script setup lang="ts">
import { isWeb } from '@/lib/platform'
import { useInWebShell } from '@/lib/layout'
import WebHome from './web/WebHome.vue'
// Public assets live under the build base (/ in the App, /app/ on the web).
const brandLogo = `${import.meta.env.BASE_URL}brand-logo.png`
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, Plus } from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import SyncStatus from '@/components/SyncStatus.vue'
import { coverOf, relativeTime, useModels, useProducts } from '@/lib/library'
import { MODULES, PHASE_LABEL, type MobileModule } from '@/lib/modules'
import { session } from '@/lib/session'
import { toast } from '@/lib/toast'
import { useGenerations } from '@/lib/generate'
import { useTasks } from '@/lib/tasks'

const router = useRouter()
const inWebShell = useInWebShell()
const { items: products } = useProducts()
const { items: models } = useModels()

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
})
const displayName = computed(() => session.user?.displayName || (session.user?.account || '').split('@')[0])
const plan = computed(() => {
  const e = session.entitlement
  if (!e) return { label: '离线', tone: 'muted' }
  if (e.unlimited) return { label: '不受限账号', tone: 'green' }
  if (!e.active) return { label: '会员已过期', tone: 'red' }
  const days = e.expiresAt ? Math.ceil((e.expiresAt - Date.now()) / 86_400_000) : null
  return { label: `${e.planName || '会员'}${days !== null ? ` · 剩 ${days} 天` : ''}`, tone: days !== null && days <= 7 ? 'amber' : 'green' }
})
const recent = computed(() => products.value.slice(0, 6))
const tasks = useTasks()
const running = computed(() => tasks.value.filter((task) => task.state === 'running'))
const failedCount = computed(() => tasks.value.filter((task) => task.state === 'failed').length)
const toReview = useGenerations((item) => item.status === 'succeeded' && item.review === 'pending')
const featured = MODULES.filter((m) => ['research', 'producer', 'listing', 'clone', 'product-images', 'live-photo', 'publish', 'review'].includes(m.key))

function open(module: MobileModule) {
  if (module.route) router.push(module.route)
  else toast(`「${module.name}」将在${PHASE_LABEL[module.phase]}上线`)
}
</script>

<template>
  <WebHome v-if="inWebShell" />
  <template v-else>
  <header class="m-header home-header">
    <img :src="brandLogo" alt="" class="home-header__logo" />
    <h1 class="m-header__title">TiktokCut</h1>
  </header>

  <main class="m-page">
    <section class="hero m-card">
      <div class="hero__top">
        <div>
          <p class="hero__hello">{{ greeting }}{{ displayName ? `，${displayName}` : '' }}</p>
          <SyncStatus />
        </div>
        <span class="m-badge" :class="`m-badge--${plan.tone}`">{{ plan.label }}</span>
      </div>
      <div class="hero__stats">
        <button type="button" class="stat" @click="router.push('/library?tab=products')">
          <strong>{{ products.length }}</strong><span>商品</span>
        </button>
        <button type="button" class="stat" @click="router.push('/library?tab=models')">
          <strong>{{ models.length }}</strong><span>模特</span>
        </button>
        <button type="button" class="stat" @click="router.push(running.length || failedCount || !toReview.length ? '/tasks' : '/review')">
          <strong>{{ running.length }}</strong><span>{{ failedCount ? `进行中 · ${failedCount} 失败` : toReview.length ? `进行中 · ${toReview.length} 待审` : '进行中' }}</span>
        </button>
      </div>
    </section>

    <section class="m-section">
      <div class="quick">
        <button type="button" class="quick__item quick__item--primary" @click="router.push('/library/products/new')">
          <Plus :size="18" /> 新建商品
        </button>
        <button type="button" class="quick__item" @click="router.push('/library/models/new')">
          <Plus :size="18" /> 新建模特
        </button>
      </div>
    </section>

    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">常用功能</h2></div>
      <div class="grid">
        <button v-for="module in featured" :key="module.key" type="button" class="grid__item" :class="{ 'is-soon': !module.route }" @click="open(module)">
          <span class="grid__icon"><component :is="module.icon" :size="22" /></span>
          <span class="grid__name">{{ module.name }}</span>
          <span v-if="!module.route" class="grid__soon">即将上线</span>
        </button>
      </div>
    </section>

    <section class="m-section">
      <div class="m-section__head">
        <h2 class="m-section__title">最近的商品</h2>
        <button v-if="products.length" type="button" class="m-section__link" @click="router.push('/library?tab=products')">全部</button>
      </div>
      <div v-if="recent.length" class="m-card m-list">
        <button v-for="item in recent" :key="item.id" type="button" class="m-row" @click="router.push(`/library/products/${item.id}`)">
          <span class="thumb"><CloudImage :file-id="coverOf(item)" :alt="item.name" /></span>
          <span class="m-row__main">
            <span class="m-row__title">{{ item.name }}</span>
            <span class="m-row__sub">{{ item.images.length }} 张图 · {{ relativeTime(item.updatedAt) }}{{ item.pending ? ' · 待同步' : '' }}</span>
          </span>
          <ChevronRight :size="18" class="m-muted" />
        </button>
      </div>
      <div v-else class="m-card m-empty">
        <span class="m-empty__title">还没有商品</span>
        <span class="m-empty__text">在电脑端添加的商品会自动出现在这里，也可以{{ isWeb ? '上传图片' : '直接用手机拍照' }}新建</span>
      </div>
    </section>
  </main>
  </template>
</template>

<style scoped>
.home-header { gap: 10px; }
.home-header__logo { width: 28px; height: 28px; }
.hero { padding: 18px; background: linear-gradient(140deg, color-mix(in srgb, var(--m-accent) 18%, var(--theme-panel)) 0%, var(--theme-panel) 62%); border-color: color-mix(in srgb, var(--m-accent) 24%, var(--theme-border)); }
.hero__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.hero__top > div { min-width: 0; }
.hero__hello { margin: 0 0 6px; overflow: hidden; font-size: 20px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.hero__stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 18px; }
.stat { display: flex; flex-direction: column; gap: 2px; padding: 12px; border: 1px solid color-mix(in srgb, var(--theme-border) 80%, transparent); border-radius: 12px; background: color-mix(in srgb, var(--theme-root) 45%, transparent); text-align: left; }
.stat strong { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.stat span { color: var(--theme-text-muted); font-size: 12px; }
.quick { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.quick__item { display: flex; align-items: center; justify-content: center; gap: 6px; height: 48px; border: 1px solid var(--theme-border-control); border-radius: 14px; background: var(--theme-control); font-size: 15px; font-weight: 700; }
.quick__item--primary { border: 0; background: linear-gradient(90deg, var(--m-accent), var(--m-accent-2)); color: #04201c; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 6px; }
.grid__item { position: relative; display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 6px 0; border: 0; background: none; }
.grid__icon { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 16px; background: var(--m-accent-soft); color: var(--m-accent-2); border: 1px solid var(--m-accent-line); }
.grid__item.is-soon .grid__icon { background: var(--theme-panel); color: var(--theme-text-secondary); border-color: var(--theme-border); }
.grid__name { font-size: 12px; font-weight: 600; white-space: nowrap; }
.grid__soon { position: absolute; top: 0; right: 4px; padding: 1px 5px; border-radius: 6px; background: var(--theme-control-hover); color: var(--theme-text-muted); font-size: 9px; font-weight: 700; }
.thumb { flex: none; width: 48px; height: 48px; border-radius: 10px; overflow: hidden; }
</style>
