<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  BarChart3,
  Captions,
  Download,
  Images,
  Package,
  Replace,
  Scissors,
  Search,
  ShoppingBag,
  Stamp,
  Store,
  Tag,
  Users,
  Wrench,
} from 'lucide-vue-next'
import { featureForPath, useCloudAuthStore } from '@/stores/cloudAuth'

type Tool = { id: string; route: string; icon: any; tone: string; group: 'source' | 'image' | 'video' | 'operations' }

const RECENT_KEY = 'videogenerate:toolbox-recent:v1'
const { t } = useI18n()
const router = useRouter()
const cloudAuth = useCloudAuthStore()
const keyword = ref('')
const recentIds = ref<string[]>([])

const TOOLS: Tool[] = [
  { id: 'video-parser-download', route: '/plugins/video-parser-download', icon: Download, tone: 'blue', group: 'source' },
  { id: 'live-slicer', route: '/live-slicer', icon: Scissors, tone: 'amber', group: 'source' },
  { id: 'product-image-materials', route: '/plugins/product-image-materials', icon: Images, tone: 'blue', group: 'source' },
  { id: 'product-replacement', route: '/plugins/product-replacement', icon: Replace, tone: 'green', group: 'image' },
  { id: 'product-watermark', route: '/plugins/product-watermark', icon: Tag, tone: 'violet', group: 'image' },
  { id: 'video-batch-subtitle', route: '/plugins/video-batch-subtitle', icon: Captions, tone: 'green', group: 'video' },
  { id: 'video-batch-watermark', route: '/plugins/video-batch-watermark', icon: Stamp, tone: 'violet', group: 'video' },
  { id: 'tiktok-listing-helper', route: '/plugins/tiktok-listing-helper', icon: ShoppingBag, tone: 'amber', group: 'operations' },
  { id: 'tiktok-creator-hub', route: '/plugins/tiktok-creator-hub', icon: Users, tone: 'violet', group: 'operations' },
  { id: 'tiktok-gmv-max-optimizer', route: '/plugins/tiktok-gmv-max-optimizer', icon: BarChart3, tone: 'accent', group: 'operations' },
  { id: 'dianxiaomi-inventory', route: '/plugins/dianxiaomi-inventory', icon: Package, tone: 'amber', group: 'operations' },
]

const groups = ['source', 'image', 'video', 'operations'] as const

const available = computed(() => TOOLS.filter((tool) => cloudAuth.hasFeature(featureForPath(tool.route))))
const filtered = computed(() => {
  const needle = keyword.value.trim().toLowerCase()
  if (!needle) return available.value
  return available.value.filter((tool) => `${name(tool)} ${desc(tool)}`.toLowerCase().includes(needle))
})
const recent = computed(() => recentIds.value.map((id) => available.value.find((tool) => tool.id === id)).filter((tool): tool is Tool => Boolean(tool)).slice(0, 4))

function name(tool: Tool) {
  return t(`ai.tools.items.${tool.id}.name`)
}

function desc(tool: Tool) {
  return t(`ai.tools.items.${tool.id}.desc`)
}

function open(tool: Tool) {
  recentIds.value = [tool.id, ...recentIds.value.filter((id) => id !== tool.id)].slice(0, 8)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds.value))
  } catch {
    // Recent list is a convenience only.
  }
  void router.push(tool.route)
}

onMounted(() => {
  void cloudAuth.ensureLoaded()
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    recentIds.value = Array.isArray(stored) ? stored.map(String) : []
  } catch {
    recentIds.value = []
  }
})
</script>

<template>
  <main class="vg-scope vg-page toolbox" data-testid="toolbox">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><Wrench :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('ai.tools.title') }}</h1>
        <p>{{ t('ai.tools.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <label class="vg-search toolbox__search">
          <Search :size="15" />
          <input v-model="keyword" class="vg-input" :placeholder="t('ai.tools.search')" />
        </label>
      </div>
    </header>

    <section v-if="recent.length && !keyword" class="vg-stack">
      <h2 class="vg-section-title"><Store :size="16" /> {{ t('ai.tools.recent') }}</h2>
      <div class="toolbox__grid">
        <button v-for="tool in recent" :key="`recent-${tool.id}`" type="button" class="vg-card vg-card--interactive toolbox__tool" :class="`toolbox__tool--${tool.tone}`" @click="open(tool)">
          <span class="toolbox__icon"><component :is="tool.icon" :size="18" /></span>
          <span class="toolbox__copy"><strong>{{ name(tool) }}</strong><small>{{ desc(tool) }}</small></span>
          <ArrowRight :size="15" class="toolbox__arrow" />
        </button>
      </div>
    </section>

    <template v-for="group in groups" :key="group">
      <section v-if="filtered.some((tool) => tool.group === group)" class="vg-stack">
        <h2 class="vg-section-title">{{ t(`ai.tools.groups.${group}`) }}</h2>
        <div class="toolbox__grid">
          <button
            v-for="tool in filtered.filter((item) => item.group === group)"
            :key="tool.id"
            type="button"
            class="vg-card vg-card--interactive toolbox__tool"
            :class="`toolbox__tool--${tool.tone}`"
            :data-testid="`tool-${tool.id}`"
            @click="open(tool)"
          >
            <span class="toolbox__icon"><component :is="tool.icon" :size="18" /></span>
            <span class="toolbox__copy"><strong>{{ name(tool) }}</strong><small>{{ desc(tool) }}</small></span>
            <ArrowRight :size="15" class="toolbox__arrow" />
          </button>
        </div>
      </section>
    </template>

    <div v-if="!filtered.length" class="vg-empty">
      <span class="vg-empty__icon"><Search :size="22" /></span>
      <p>{{ t('ai.tools.noMatch') }}</p>
    </div>
  </main>
</template>

<style scoped>
.toolbox { width: min(1400px, 100%); margin: 0 auto; gap: 18px; }
.toolbox__search { width: 280px; }
.toolbox__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.toolbox__tool { --tone: var(--vg-accent); display: flex; align-items: flex-start; gap: 12px; padding: 14px; color: var(--theme-text); text-align: left; min-width: 0; }
.toolbox__tool--blue { --tone: var(--vg-blue); }
.toolbox__tool--amber { --tone: var(--vg-amber); }
.toolbox__tool--violet { --tone: var(--vg-violet); }
.toolbox__tool--green { --tone: var(--vg-green); }
.toolbox__icon { width: 38px; height: 38px; flex-shrink: 0; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--tone) 14%, transparent); border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent); color: var(--tone); }
.toolbox__copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.toolbox__copy strong { font-size: 14px; }
.toolbox__copy small { font-size: 12px; color: var(--theme-text-secondary); line-height: 1.5; }
.toolbox__arrow { color: var(--theme-text-muted); flex-shrink: 0; margin-top: 10px; transition: transform .15s, color .15s; }
.toolbox__tool:hover .toolbox__arrow { color: var(--tone); transform: translateX(2px); }
</style>
