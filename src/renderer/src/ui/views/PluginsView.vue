<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Captions,
  Download,
  FolderInput,
  History,
  Image,
  Images,
  Film,
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

type Tool = { id: string; route: string; icon: any; group: 'source' | 'image' | 'video' | 'operations' }

const RECENT_KEY = 'videogenerate:toolbox-recent:v1'
const { t } = useI18n()
const router = useRouter()
const cloudAuth = useCloudAuthStore()
const keyword = ref('')
const recentIds = ref<string[]>([])

const TOOLS: Tool[] = [
  { id: 'video-parser-download', route: '/plugins/video-parser-download', icon: Download, group: 'source' },
  { id: 'live-slicer', route: '/live-slicer', icon: Scissors, group: 'source' },
  { id: 'product-image-materials', route: '/plugins/product-image-materials', icon: Images, group: 'source' },
  { id: 'product-replacement', route: '/plugins/product-replacement', icon: Replace, group: 'image' },
  { id: 'product-watermark', route: '/plugins/product-watermark', icon: Tag, group: 'image' },
  { id: 'video-batch-subtitle', route: '/plugins/video-batch-subtitle', icon: Captions, group: 'video' },
  { id: 'video-batch-watermark', route: '/plugins/video-batch-watermark', icon: Stamp, group: 'video' },
  { id: 'tiktok-gmv-max-optimizer', route: '/plugins/tiktok-gmv-max-optimizer', icon: BarChart3, group: 'operations' },
  { id: 'tiktok-listing-helper', route: '/plugins/tiktok-listing-helper', icon: ShoppingBag, group: 'operations' },
  { id: 'tiktok-creator-hub', route: '/plugins/tiktok-creator-hub', icon: Users, group: 'operations' },
  { id: 'seller-inventory', route: '/plugins/seller-inventory', icon: Boxes, group: 'operations' },
  { id: 'dianxiaomi-inventory', route: '/plugins/dianxiaomi-inventory', icon: Package, group: 'operations' },
]

// Each group has its own icon and tint, so the four panels read apart at a glance.
const GROUPS = [
  { id: 'source', icon: FolderInput },
  { id: 'image', icon: Image },
  { id: 'video', icon: Film },
  { id: 'operations', icon: Store },
] as const

const available = computed(() => TOOLS.filter((tool) => cloudAuth.hasFeature(featureForPath(tool.route))))
const filtered = computed(() => {
  const needle = keyword.value.trim().toLowerCase()
  if (!needle) return available.value
  return available.value.filter((tool) => `${name(tool)} ${desc(tool)}`.toLowerCase().includes(needle))
})
const recent = computed(() => recentIds.value.map((id) => available.value.find((tool) => tool.id === id)).filter((tool): tool is Tool => Boolean(tool)).slice(0, 4))
const panels = computed(() => GROUPS
  .map((group) => ({ ...group, tools: filtered.value.filter((tool) => tool.group === group.id) }))
  .filter((group) => group.tools.length))

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

    <section v-if="recent.length && !keyword" class="toolbox__recent" data-testid="toolbox-recent">
      <span class="toolbox__recent-label"><History :size="14" /> {{ t('ai.tools.recent') }}</span>
      <button v-for="tool in recent" :key="`recent-${tool.id}`" type="button" class="toolbox__chip" :class="`toolbox--${tool.group}`" @click="open(tool)">
        <component :is="tool.icon" :size="14" /> {{ name(tool) }}
      </button>
    </section>

    <div v-if="panels.length" class="toolbox__panels">
      <section v-for="group in panels" :key="group.id" class="toolbox__panel" :class="[`toolbox--${group.id}`, `toolbox__panel--${group.id}`]">
        <header class="toolbox__panel-head">
          <svg class="toolbox__art" viewBox="0 0 200 96" fill="none" aria-hidden="true">
            <g v-if="group.id === 'source'" stroke="currentColor">
              <rect x="68" y="20" width="44" height="60" rx="7" opacity=".28" />
              <rect x="94" y="14" width="48" height="68" rx="8" opacity=".5" class="toolbox__art-fill" />
              <rect x="124" y="8" width="54" height="78" rx="9" opacity=".95" class="toolbox__art-fill" />
              <path d="M151 30v26m-10-10 10 10 10-10M139 68h24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </g>
            <g v-else-if="group.id === 'image'" stroke="currentColor">
              <rect x="84" y="24" width="62" height="54" rx="8" opacity=".38" transform="rotate(-8 115 51)" />
              <rect x="108" y="14" width="72" height="62" rx="9" opacity=".95" class="toolbox__art-fill" />
              <circle cx="161" cy="32" r="6" opacity=".9" />
              <path d="m108 66 20-22 17 17 11-10 24 21" stroke-width="1.6" stroke-linejoin="round" />
            </g>
            <g v-else-if="group.id === 'video'" stroke="currentColor">
              <rect x="56" y="18" width="124" height="28" rx="7" opacity=".6" class="toolbox__art-fill" />
              <path d="M87 18v28m31-28v28m31-28v28" opacity=".45" />
              <path d="M58 70v6m7-12v18m7-13v8m7-18v28m7-20v12m7-16v20m7-25v30m7-19v8m7-14v20m7-24v28m7-18v8m7-13v18m7-23v28m7-20v12m7-14v16m7-11v6m7-9v12m7-8v4" stroke-width="2" stroke-linecap="round" opacity=".6" />
              <path d="M124 8v80" stroke-width="1.6" /><circle cx="124" cy="9" r="4" fill="currentColor" />
            </g>
            <g v-else stroke="currentColor">
              <path d="M30 82h150M30 60h150M30 38h150" opacity=".16" />
              <path d="M30 76c18-2 22-18 40-18s20 10 38 4 22-34 40-34 18-6 32-14V86H30Z" class="toolbox__art-fill" stroke="none" />
              <path d="M30 76c18-2 22-18 40-18s20 10 38 4 22-34 40-34 18-6 32-14" stroke-width="2" stroke-linecap="round" />
              <circle cx="180" cy="14" r="4" fill="currentColor" /><circle cx="180" cy="14" r="8" opacity=".35" />
            </g>
          </svg>
          <span class="toolbox__panel-icon"><component :is="group.icon" :size="18" /></span>
          <div class="toolbox__panel-text">
            <h2>{{ t(`ai.tools.groups.${group.id}`) }}</h2>
            <p>{{ t(`ai.tools.groupDesc.${group.id}`) }}</p>
          </div>
        </header>
        <div class="toolbox__list">
          <button v-for="(tool, index) in group.tools" :key="tool.id" type="button" class="toolbox__tool" :class="{ 'is-wide': index === 0 && group.tools.length % 3 === 2 }" :data-testid="`tool-${tool.id}`" @click="open(tool)">
            <span class="toolbox__icon"><component :is="tool.icon" :size="18" /></span>
            <span class="toolbox__copy"><strong>{{ name(tool) }}</strong><small>{{ desc(tool) }}</small></span>
            <span class="toolbox__arrow"><ArrowRight :size="14" /></span>
          </button>
        </div>
      </section>
    </div>

    <div v-if="!filtered.length" class="vg-empty">
      <span class="vg-empty__icon"><Search :size="22" /></span>
      <p>{{ t('ai.tools.noMatch') }}</p>
    </div>
  </main>
</template>

<style scoped>
.toolbox { width: min(1400px, 100%); margin: 0 auto; gap: 18px; }
.toolbox__search { width: 280px; }

/* One tint per group, pulled towards the text colour so it stays an accent instead of a fill. */
.toolbox--source { --tone: var(--vg-accent); }
.toolbox--image { --tone: color-mix(in oklab, var(--vg-violet) 84%, var(--theme-text)); }
.toolbox--video { --tone: color-mix(in oklab, var(--vg-blue) 84%, var(--theme-text)); }
.toolbox--operations { --tone: color-mix(in oklab, var(--vg-amber) 80%, var(--theme-text)); }

.toolbox__recent { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.toolbox__recent-label { display: inline-flex; align-items: center; gap: 6px; margin-right: 6px; font-size: 12.5px; color: var(--theme-text-muted); }
.toolbox__chip { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 13px; border: 1px solid var(--theme-border); border-radius: 9px; background: var(--theme-panel); color: var(--theme-text-secondary); font: inherit; font-size: 12.5px; cursor: pointer; transition: border-color .18s, color .18s; }
.toolbox__chip svg { color: var(--tone); }
.toolbox__chip:hover { border-color: color-mix(in srgb, var(--tone) 45%, transparent); color: var(--theme-text); }

.toolbox__panels { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px; }
.toolbox__panel { position: relative; display: flex; flex-direction: column; grid-column: span 2; min-width: 0; overflow: hidden; border: 1px solid var(--theme-border); border-radius: 16px; background: radial-gradient(420px 190px at 100% 0, color-mix(in srgb, var(--tone) 13%, transparent), transparent 72%), var(--theme-panel); }
.toolbox__panel::before { content: ''; position: absolute; inset: 0 0 auto; height: 1px; background: linear-gradient(90deg, transparent 10%, color-mix(in srgb, var(--tone) 60%, transparent) 78%, transparent); }
.toolbox__panel--operations, .toolbox__panel:only-child { grid-column: 1 / -1; }

.toolbox__panel-head { position: relative; display: flex; align-items: center; gap: 13px; min-height: 96px; padding: 16px 20px; }
.toolbox__art { position: absolute; top: 0; right: 6px; width: 200px; height: 96px; color: var(--tone); opacity: .5; pointer-events: none; -webkit-mask-image: linear-gradient(90deg, transparent 12%, #000 72%); mask-image: linear-gradient(90deg, transparent 12%, #000 72%); transition: opacity .25s; }
.toolbox__art-fill { fill: color-mix(in srgb, var(--tone) 12%, var(--theme-panel)); }
.toolbox__panel:hover .toolbox__art { opacity: .85; }
.toolbox__panel-icon { position: relative; display: grid; place-items: center; width: 42px; height: 42px; flex-shrink: 0; border: 1px solid color-mix(in srgb, var(--tone) 38%, transparent); border-radius: 12px; background: linear-gradient(160deg, color-mix(in srgb, var(--tone) 30%, var(--theme-panel)), color-mix(in srgb, var(--tone) 8%, var(--theme-panel))); box-shadow: inset 0 1px 0 rgb(255 255 255 / .1), 0 6px 18px -8px color-mix(in srgb, var(--tone) 60%, transparent); color: var(--tone); }
.toolbox__panel-text { position: relative; min-width: 0; }
.toolbox__panel-text h2 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: .01em; color: var(--theme-text); }
.toolbox__panel-text p { margin: 3px 0 0; font-size: 12px; color: var(--theme-text-muted); }

.toolbox__list { display: grid; flex: 1; grid-auto-rows: 1fr; gap: 8px; padding: 0 12px 12px; }
.toolbox__panel--operations .toolbox__list { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.toolbox__panel--operations .toolbox__tool.is-wide { grid-column: span 2; }
.toolbox__tool { display: flex; align-items: center; gap: 13px; width: 100%; min-width: 0; min-height: 72px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--theme-border) 70%, transparent); border-radius: 12px; background: color-mix(in srgb, var(--theme-panel-soft) 55%, transparent); color: var(--theme-text); font: inherit; text-align: left; cursor: pointer; transition: border-color .18s, background .18s; }
.toolbox__tool:hover { border-color: color-mix(in srgb, var(--tone) 42%, transparent); background: color-mix(in srgb, var(--tone) 7%, var(--theme-panel-soft)); }
.toolbox__tool:focus-visible, .toolbox__chip:focus-visible { outline: 2px solid var(--tone); outline-offset: 2px; }
.toolbox__icon { display: grid; place-items: center; width: 38px; height: 38px; flex-shrink: 0; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel); color: var(--tone); transition: border-color .18s; }
.toolbox__tool:hover .toolbox__icon { border-color: color-mix(in srgb, var(--tone) 42%, transparent); }
.toolbox__copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.toolbox__copy strong { font-size: 14px; font-weight: 600; }
.toolbox__copy small { font-size: 12px; color: var(--theme-text-secondary); line-height: 1.5; }
.toolbox__arrow { display: grid; place-items: center; width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; color: var(--theme-text-muted); transition: transform .18s, background .18s, color .18s; }
.toolbox__tool:hover .toolbox__arrow { background: color-mix(in srgb, var(--tone) 18%, transparent); color: var(--tone); transform: translateX(2px); }

@media (max-width: 1120px) {
  .toolbox__panel { grid-column: span 3; }
  .toolbox__panel--source, .toolbox__panel--operations { grid-column: 1 / -1; }
  .toolbox__panel--operations .toolbox__list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .toolbox__panel { grid-column: 1 / -1; }
  .toolbox__panel--operations .toolbox__list { grid-template-columns: minmax(0, 1fr); }
  .toolbox__panel--operations .toolbox__tool.is-wide { grid-column: auto; }
}
@media (prefers-reduced-motion: reduce) {
  .toolbox * { transition: none; }
}
</style>
