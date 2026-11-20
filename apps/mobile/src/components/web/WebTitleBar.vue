<script setup lang="ts">
/**
 * Web version title bar — same layout and tokens as the desktop TitleBar (brand, Ctrl K search,
 * 审核收件箱, 任务, AI 制片人), without the window controls a browser already has.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Activity, Inbox, Loader2, Search, Wand2 } from 'lucide-vue-next'
import { MODULES } from '@/lib/modules'
import { useGenerations } from '@/lib/generate'
import { useTasks } from '@/lib/tasks'

/** minimal: brand only (login page, before signing in) */
defineProps<{ minimal?: boolean }>()
const router = useRouter()
const brandLogo = `${import.meta.env.BASE_URL}brand-logo.png`
const pending = useGenerations((item) => item.status === 'succeeded' && item.review === 'pending')
const tasks = useTasks()
const running = computed(() => tasks.value.filter((task) => task.state === 'running').length)
const failed = computed(() => tasks.value.filter((task) => task.state === 'failed').length)

const searchOpen = ref(false)
const query = ref('')
const cursor = ref(0)
const searchInput = ref<HTMLInputElement>()
const results = computed(() => {
  const word = query.value.trim().toLowerCase()
  const list = MODULES.filter((item) => item.route)
  return (word ? list.filter((item) => `${item.name}${item.description}${item.key}`.toLowerCase().includes(word)) : list).slice(0, 8)
})

async function openSearch() {
  searchOpen.value = true
  query.value = ''
  cursor.value = 0
  await nextTick()
  searchInput.value?.focus()
}

function go(route: string) {
  searchOpen.value = false
  void router.push(route)
}

function onSearchKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') cursor.value = Math.min(results.value.length - 1, cursor.value + 1)
  else if (event.key === 'ArrowUp') cursor.value = Math.max(0, cursor.value - 1)
  else if (event.key === 'Escape') searchOpen.value = false
  else if (event.key === 'Enter') {
    const hit = results.value[cursor.value]
    if (hit?.route) go(hit.route)
    // Anything that isn't a page becomes an instruction for the AI producer.
    else if (query.value.trim()) go(`/producer?prompt=${encodeURIComponent(query.value.trim())}`)
    return
  } else return
  event.preventDefault()
}

function onGlobalKey(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
  if (event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (searchOpen.value) searchOpen.value = false
    else void openSearch()
  } else if (event.key.toLowerCase() === 'j') {
    event.preventDefault()
    void router.push('/producer')
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))
</script>

<template>
  <header class="vg-scope vg-titlebar">
    <router-link to="/" class="vg-titlebar__brand">
      <img :src="brandLogo" alt="" class="vg-titlebar__logo" />
      <strong class="vg-titlebar__name">Vidloom</strong>
      <span class="vg-titlebar__divider" aria-hidden="true"></span>
      <span class="vg-titlebar__subtitle">智能视频生产工作台</span>
    </router-link>

    <div class="vg-titlebar__drag"></div>

    <div v-if="!minimal" class="vg-titlebar__actions">
      <div class="tb-search">
        <button type="button" class="tb-search__btn" data-testid="web-search" title="搜索功能，或直接输入要交给 AI 的事" @click="openSearch">
          <Search :size="14" />
          <span>搜索或下指令</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div v-if="searchOpen" class="tb-search__pop" @mousedown.stop>
          <div class="tb-search__field">
            <Search :size="15" />
            <input ref="searchInput" v-model="query" placeholder="搜索功能，或输入要交给 AI 制片人的事" @keydown="onSearchKey" @blur="searchOpen = false" @input="cursor = 0" />
          </div>
          <button
            v-for="(item, index) in results"
            :key="item.key"
            type="button"
            class="tb-search__item"
            :class="{ 'is-active': index === cursor }"
            @mousedown.prevent="go(item.route!)"
            @mouseenter="cursor = index"
          >
            <span class="tb-search__icon"><component :is="item.icon" :size="15" /></span>
            <span class="tb-search__text"><strong>{{ item.name }}</strong><small>{{ item.description }}</small></span>
          </button>
          <button v-if="query.trim()" type="button" class="tb-search__item tb-search__ai" @mousedown.prevent="go(`/producer?prompt=${encodeURIComponent(query.trim())}`)">
            <span class="tb-search__icon"><Wand2 :size="15" /></span>
            <span class="tb-search__text"><strong>交给 AI 制片人</strong><small>{{ query.trim() }}</small></span>
          </button>
        </div>
      </div>

      <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm tb-btn" title="审核收件箱" @click="router.push('/review')">
        <Inbox :size="15" />
        <span>审核收件箱</span>
        <span v-if="pending.length" class="tb-badge">{{ pending.length > 99 ? '99+' : pending.length }}</span>
      </button>
      <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm tb-btn" title="任务中心" @click="router.push('/tasks')">
        <Loader2 v-if="running" :size="15" class="vg-spin" />
        <Activity v-else :size="15" />
        <span>任务</span>
        <span v-if="failed" class="tb-badge">{{ failed }}</span>
        <span v-else-if="running" class="tb-badge tb-badge--blue">{{ running }}</span>
      </button>
      <button type="button" class="vg-btn vg-btn--primary vg-btn--sm tb-ai" data-testid="web-open-producer" title="AI 制片人（Ctrl J）" @click="router.push('/producer')">
        <Wand2 :size="15" /> <span>AI 制片人</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.vg-titlebar { position: relative; z-index: 100; display: flex; align-items: center; height: 48px; flex-shrink: 0; padding-left: 16px; background: var(--theme-sidebar); border-bottom: 1px solid var(--theme-border); color: var(--theme-text); user-select: none; }
.vg-titlebar__brand { display: flex; align-items: center; gap: 10px; min-width: 0; color: inherit; text-decoration: none; }
.vg-titlebar__logo { width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0; }
.vg-titlebar__name { font-size: 14px; font-weight: 800; letter-spacing: -.01em; white-space: nowrap; }
.vg-titlebar__divider { width: 1px; height: 14px; background: var(--theme-border-control); }
.vg-titlebar__subtitle { font-size: 12px; color: var(--theme-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vg-titlebar__drag { flex: 1; align-self: stretch; }
.vg-titlebar__actions { display: flex; align-items: center; gap: 6px; padding-right: 14px; }

.tb-search { position: relative; }
.tb-search__btn { display: inline-flex; align-items: center; gap: 8px; height: 30px; min-width: 200px; padding: 0 8px 0 10px; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-panel-soft); color: var(--theme-text-muted); font-size: 12.5px; cursor: pointer; }
.tb-search__btn span { flex: 1; text-align: left; }
.tb-search__btn:hover { border-color: var(--theme-border-control); color: var(--theme-text); }
.tb-search__btn kbd { font-family: inherit; font-size: 10.5px; padding: 1px 5px; border: 1px solid var(--theme-border); border-radius: 4px; background: var(--theme-panel); }
.tb-search__pop { position: absolute; top: -4px; right: 0; z-index: 130; width: 420px; display: flex; flex-direction: column; gap: 2px; padding: 6px; border: 1px solid var(--theme-border-control); border-radius: var(--vg-radius-lg); background: var(--theme-shell); box-shadow: 0 18px 48px rgba(0, 0, 0, .35); }
.tb-search__field { display: flex; align-items: center; gap: 8px; height: 38px; margin-bottom: 4px; padding: 0 10px; border-bottom: 1px solid var(--theme-divider); color: var(--theme-text-muted); }
.tb-search__field input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--theme-text); font-size: 13.5px; }
.tb-search__item { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border: 0; border-radius: 8px; background: transparent; color: var(--theme-text); text-align: left; cursor: pointer; }
.tb-search__item.is-active { background: var(--theme-control-hover); }
.tb-search__icon { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex-shrink: 0; border-radius: 8px; background: var(--vg-accent-soft); color: var(--vg-accent); }
.tb-search__text { display: flex; flex-direction: column; min-width: 0; }
.tb-search__text strong { font-size: 13px; font-weight: 600; }
.tb-search__text small { font-size: 11.5px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb-search__ai { border-top: 1px solid var(--theme-divider); border-radius: 0 0 8px 8px; margin-top: 2px; }

.tb-btn { position: relative; }
.tb-badge { min-width: 17px; height: 17px; padding: 0 5px; border-radius: 999px; background: var(--vg-red); color: #fff; font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.tb-badge--blue { background: var(--vg-blue); }

@media (max-width: 1180px) {
  .vg-titlebar__subtitle, .vg-titlebar__divider, .tb-btn span:not(.tb-badge), .tb-search__btn span { display: none; }
  .tb-search__btn { min-width: 0; }
}
</style>
