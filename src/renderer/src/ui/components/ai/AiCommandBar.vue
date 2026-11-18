<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ArrowRight, Box, CornerDownLeft, FileImage, FolderKanban, LayoutGrid, Search, Sparkles, Wand2 } from 'lucide-vue-next'
import { useAiProducerStore } from '@/stores/aiProducer'
import { AI_RECIPES } from '@/lib/aiRecipes'

type Entry = {
  id: string
  group: 'ai' | 'recipe' | 'page' | 'product' | 'project' | 'asset'
  title: string
  subtitle?: string
  run: () => void
}

const { t } = useI18n()
const router = useRouter()
const ai = useAiProducerStore()
const { commandOpen } = storeToRefs(ai)

const query = ref('')
const activeIndex = ref(0)
const input = ref<HTMLInputElement | null>(null)
const products = ref<Array<{ id: string; name: string }>>([])
const projects = ref<Array<{ ref: string; title: string; line: string; route: string; productName?: string }>>([])
const assets = ref<Array<{ id: string; name: string; type: string }>>([])
let assetTimer = 0

const pages = computed(() => [
  { to: '/home', label: t('nav.home') },
  { to: '/inbox', label: t('ai.nav.inbox') },
  { to: '/product-research', label: t('nav.productResearch') },
  { to: '/clone', label: t('nav.clone') },
  { to: '/plugins/tiktok-creative-studio', label: t('ai.nav.creativeStudio') },
  { to: '/plugins/live-photo-generator', label: t('ai.nav.livePhoto') },
  { to: '/production', label: t('ai.nav.production') },
  { to: '/publish', label: t('nav.publish') },
  { to: '/insights', label: t('ai.nav.insights') },
  { to: '/products', label: t('nav.productLibrary') },
  { to: '/models', label: t('nav.models') },
  { to: '/asset-library', label: t('nav.assets') },
  { to: '/templates', label: t('nav.templates') },
  { to: '/live-slicer', label: t('nav.liveSlicer') },
  { to: '/plugins', label: t('ai.nav.tools') },
  { to: '/settings', label: t('nav.settings') },
])

const lineLabel = (line: string) => t(`ai.line.${line}`)

function matches(text: string, needle: string) {
  return text.toLowerCase().includes(needle)
}

const entries = computed<Entry[]>(() => {
  const needle = query.value.trim().toLowerCase()
  const list: Entry[] = []
  if (needle) {
    list.push({
      id: 'ai-ask',
      group: 'ai',
      title: t('ai.command.ask', { text: query.value.trim() }),
      subtitle: t('ai.command.askHint'),
      run: () => void ai.open({ prompt: query.value.trim(), send: true }),
    })
  }
  for (const recipe of AI_RECIPES) {
    const title = t(recipe.titleKey)
    if (!needle || matches(`${title} ${t(recipe.descKey)}`, needle)) {
      list.push({ id: `recipe-${recipe.id}`, group: 'recipe', title, subtitle: t(recipe.outputKey), run: () => void ai.open({ recipeId: recipe.id }) })
    }
  }
  for (const page of pages.value) {
    if (!needle || matches(page.label, needle)) list.push({ id: `page-${page.to}`, group: 'page', title: page.label, run: () => void router.push(page.to) })
  }
  if (needle) {
    for (const product of products.value.filter((item) => matches(item.name, needle)).slice(0, 6)) {
      list.push({ id: `product-${product.id}`, group: 'product', title: product.name, subtitle: t('ai.command.productSpace'), run: () => void router.push(`/products/${product.id}`) })
    }
    for (const project of projects.value.filter((item) => matches(`${item.title} ${item.productName || ''}`, needle)).slice(0, 6)) {
      list.push({ id: `project-${project.ref}`, group: 'project', title: project.title, subtitle: lineLabel(project.line), run: () => void router.push(project.route) })
    }
    for (const asset of assets.value.slice(0, 5)) {
      list.push({ id: `asset-${asset.id}`, group: 'asset', title: asset.name, subtitle: t('nav.assets'), run: () => void router.push({ path: '/asset-library', query: { q: asset.name } }) })
    }
  }
  return list
})

const groupLabel = (group: Entry['group']) => t(`ai.command.groups.${group}`)
const groupIcon = { ai: Wand2, recipe: Sparkles, page: LayoutGrid, product: Box, project: FolderKanban, asset: FileImage }

watch(commandOpen, async (open) => {
  if (!open) return
  query.value = ''
  activeIndex.value = 0
  await nextTick()
  input.value?.focus()
  try {
    const [productRows, projectRows] = await Promise.all([window.api.products.list(), window.api.contentHub.recentProjects(40)])
    products.value = (productRows as any[]).map((item) => ({ id: item.id, name: item.name }))
    projects.value = projectRows as any[]
  } catch {
    // search still works for pages and AI
  }
})

watch(query, (value) => {
  activeIndex.value = 0
  window.clearTimeout(assetTimer)
  const needle = value.trim()
  if (needle.length < 2) {
    assets.value = []
    return
  }
  assetTimer = window.setTimeout(async () => {
    try {
      assets.value = ((await window.api.assetLibrary.list({ query: needle, type: 'all' })) as any[]).slice(0, 5)
    } catch {
      assets.value = []
    }
  }, 180)
})

function close() {
  commandOpen.value = false
}

function choose(entry?: Entry) {
  if (!entry) return
  close()
  entry.run()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(entries.value.length - 1, activeIndex.value + 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(0, activeIndex.value - 1)
  } else if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    choose(entries.value[activeIndex.value])
  } else if (event.key === 'Escape') {
    close()
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="commandOpen" class="vg-scope vg-backdrop ai-cmd__backdrop" @click.self="close">
      <div class="ai-cmd" role="dialog" aria-modal="true" data-testid="ai-command-bar">
        <label class="ai-cmd__search">
          <Search :size="17" />
          <input
            ref="input"
            v-model="query"
            data-testid="ai-command-input"
            :placeholder="t('ai.command.placeholder')"
            @keydown="onKeydown"
          />
          <kbd>Esc</kbd>
        </label>
        <div class="ai-cmd__list">
          <template v-for="(entry, index) in entries" :key="entry.id">
            <div v-if="index === 0 || entries[index - 1].group !== entry.group" class="ai-cmd__group">{{ groupLabel(entry.group) }}</div>
            <button
              type="button"
              class="ai-cmd__item"
              :class="{ 'is-active': index === activeIndex, 'is-ai': entry.group === 'ai' }"
              @mouseenter="activeIndex = index"
              @click="choose(entry)"
            >
              <span class="ai-cmd__icon"><component :is="groupIcon[entry.group]" :size="15" /></span>
              <span class="ai-cmd__copy">
                <span class="vg-ellipsis">{{ entry.title }}</span>
                <small v-if="entry.subtitle" class="vg-ellipsis">{{ entry.subtitle }}</small>
              </span>
              <CornerDownLeft v-if="index === activeIndex" :size="14" class="ai-cmd__enter" />
              <ArrowRight v-else :size="14" class="ai-cmd__arrow" />
            </button>
          </template>
          <p v-if="!entries.length" class="ai-cmd__empty">{{ t('ai.command.empty') }}</p>
        </div>
        <footer class="ai-cmd__foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> {{ t('ai.command.navigate') }}</span>
          <span><kbd>Enter</kbd> {{ t('ai.command.open') }}</span>
          <span><kbd>Ctrl</kbd><kbd>J</kbd> {{ t('ai.producer') }}</span>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ai-cmd__backdrop { align-items: flex-start; padding-top: 12vh; }
.ai-cmd { width: min(620px, calc(100vw - 32px)); max-height: 70vh; display: flex; flex-direction: column; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-lg); background: var(--theme-panel); box-shadow: 0 24px 60px rgba(0, 0, 0, .35); overflow: hidden; }
.ai-cmd__search { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--theme-divider); color: var(--theme-text-muted); }
.ai-cmd__search input { flex: 1; border: 0; outline: 0; background: transparent; color: var(--theme-text); font-size: 15px; }
.ai-cmd__list { flex: 1; overflow: auto; padding: 6px; }
.ai-cmd__group { padding: 8px 10px 4px; font-size: 11px; font-weight: 600; letter-spacing: .04em; color: var(--theme-text-muted); }
.ai-cmd__item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--theme-text); text-align: left; cursor: pointer; }
.ai-cmd__item.is-active { background: var(--theme-panel-soft); }
.ai-cmd__item.is-ai.is-active { background: var(--vg-accent-soft); }
.ai-cmd__icon { width: 28px; height: 28px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 7px; background: var(--theme-panel-soft); color: var(--theme-text-secondary); }
.ai-cmd__item.is-ai .ai-cmd__icon { background: var(--vg-accent-soft); color: var(--vg-accent); }
.ai-cmd__copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; font-size: 13.5px; }
.ai-cmd__copy small { font-size: 11.5px; color: var(--theme-text-muted); }
.ai-cmd__enter, .ai-cmd__arrow { color: var(--theme-text-muted); flex-shrink: 0; }
.ai-cmd__arrow { opacity: 0; }
.ai-cmd__empty { padding: 24px; text-align: center; color: var(--theme-text-muted); font-size: 13px; }
.ai-cmd__foot { display: flex; gap: 16px; padding: 8px 14px; border-top: 1px solid var(--theme-divider); font-size: 11.5px; color: var(--theme-text-muted); }
kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 4px; margin-right: 2px; border: 1px solid var(--theme-border); border-radius: 4px; background: var(--theme-panel-soft); font-size: 10.5px; font-family: inherit; color: var(--theme-text-secondary); }
</style>
