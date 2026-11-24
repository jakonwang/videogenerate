<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Activity, Inbox, Loader2, Search, Wand2 } from 'lucide-vue-next'
import { useAiProducerStore } from '@/stores/aiProducer'
import AiPlanCard from './AiPlanCard.vue'

const { t } = useI18n()
const router = useRouter()
const ai = useAiProducerStore()
const { activeTrayRuns, trayRuns, pendingReviews, waitingCount, panelOpen } = storeToRefs(ai)
const trayOpen = ref(false)
const root = ref<HTMLElement | null>(null)

const recentRuns = computed(() => trayRuns.value.slice(0, 6))

function onDocumentClick(event: MouseEvent) {
  if (trayOpen.value && root.value && !root.value.contains(event.target as Node)) trayOpen.value = false
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))

async function openRun(conversationId: string) {
  trayOpen.value = false
  await ai.open()
  await ai.selectConversation(conversationId)
}
</script>

<template>
  <div ref="root" class="ai-tb">
    <button type="button" class="ai-tb__search" data-testid="ai-open-command" :title="t('ai.command.placeholder')" @click="ai.commandOpen = true">
      <Search :size="14" />
      <span>{{ t('ai.command.short') }}</span>
      <kbd>Ctrl K</kbd>
    </button>

    <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm ai-tb__btn" data-testid="ai-open-inbox" :title="t('ai.nav.inbox')" @click="router.push('/inbox')">
      <Inbox :size="15" />
      <span>{{ t('ai.nav.inbox') }}</span>
      <span v-if="pendingReviews" class="ai-tb__badge">{{ pendingReviews > 99 ? '99+' : pendingReviews }}</span>
    </button>

    <div class="ai-tb__tray">
      <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm ai-tb__btn" data-testid="ai-open-tray" :title="t('ai.tray.title')" @click="trayOpen = !trayOpen">
        <Loader2 v-if="activeTrayRuns.length" :size="15" class="vg-spin" />
        <Activity v-else :size="15" />
        <span>{{ t('ai.tray.title') }}</span>
        <span v-if="waitingCount" class="ai-tb__badge ai-tb__badge--amber">{{ waitingCount }}</span>
        <span v-else-if="activeTrayRuns.length" class="ai-tb__badge ai-tb__badge--blue">{{ activeTrayRuns.length }}</span>
      </button>
      <div v-if="trayOpen" class="ai-tb__popover vg-scope">
        <header>
          <strong>{{ t('ai.tray.title') }}</strong>
          <small>{{ t('ai.tray.desc') }}</small>
        </header>
        <div class="ai-tb__runs">
          <button v-for="detail in recentRuns" :key="detail.run.id" type="button" class="ai-tb__run" @click="openRun(detail.run.conversationId)">
            <AiPlanCard :detail="detail" compact />
          </button>
          <p v-if="!recentRuns.length" class="vg-muted ai-tb__empty">{{ t('ai.tray.empty') }}</p>
        </div>
      </div>
    </div>

    <button
      type="button"
      class="vg-btn vg-btn--primary vg-btn--sm ai-tb__ai"
      data-testid="ai-open-panel"
      :class="{ 'is-open': panelOpen }"
      :title="`${t('ai.producer')} (Ctrl+J)`"
      @click="panelOpen ? ai.close() : ai.open()"
    >
      <Wand2 :size="15" />
      <span>{{ t('ai.producer') }}</span>
    </button>
  </div>
</template>

<style scoped>
.ai-tb { display: flex; align-items: center; gap: 6px; -webkit-app-region: no-drag; }
.ai-tb__search { display: inline-flex; align-items: center; gap: 8px; height: 30px; min-width: 200px; padding: 0 8px 0 10px; border: 1px solid var(--theme-border-control); border-radius: 9px; background: var(--theme-panel-soft); color: var(--theme-text-muted); font-size: 12.5px; cursor: pointer; }
.ai-tb__search span { flex: 1; text-align: left; }
.ai-tb__search:hover { border-color: var(--theme-border-control); color: var(--theme-text); }
.ai-tb__search kbd { font-family: inherit; font-size: 10.5px; padding: 1px 5px; border: 1px solid var(--theme-border); border-radius: 4px; background: var(--theme-panel); }
.ai-tb__btn { position: relative; }
.ai-tb__badge { min-width: 17px; height: 17px; padding: 0 5px; border-radius: 999px; background: var(--vg-red); color: #fff; font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.ai-tb__badge--amber { background: var(--vg-amber); color: #1a1a1a; }
.ai-tb__badge--blue { background: var(--vg-blue); }
.ai-tb__tray { position: relative; }
.ai-tb__popover { position: absolute; top: calc(100% + 8px); right: 0; z-index: 120; width: 380px; max-height: 70vh; display: flex; flex-direction: column; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-lg); background: var(--theme-shell); box-shadow: 0 18px 48px rgba(0, 0, 0, .3); overflow: hidden; }
.ai-tb__popover header { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px 8px; }
.ai-tb__popover header small { font-size: 11.5px; color: var(--theme-text-muted); }
.ai-tb__runs { overflow: auto; padding: 0 10px 10px; display: flex; flex-direction: column; gap: 8px; }
.ai-tb__run { border: 0; padding: 0; background: transparent; text-align: left; cursor: pointer; color: inherit; }
.ai-tb__empty { padding: 20px; text-align: center; font-size: 12.5px; }
@media (max-width: 1180px) {
  .ai-tb__btn span:not(.ai-tb__badge), .ai-tb__search span { display: none; }
  .ai-tb__search { min-width: 0; }
}
</style>
