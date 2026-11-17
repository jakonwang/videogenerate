<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import {
  Clapperboard,
  Flame,
  Rocket,
  FolderOpen,
  History,
  Images,
  Link2,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Send,
  SendHorizontal,
  Sparkles,
  Trophy,
  Wand2,
  X,
} from 'lucide-vue-next'
import { attachmentFromPath, useAiProducerStore, type AiMessage } from '@/stores/aiProducer'
import { AI_RECIPES, recipeById, type Recipe, type RecipeBuild } from '@/lib/aiRecipes'
import { openAssetLibraryPicker } from '@/lib/assetLibraryPicker'
import AiPlanCard from './AiPlanCard.vue'
import AiRecipeForm from './AiRecipeForm.vue'

const { t, te } = useI18n()

/** Canned server replies carry a responseCode; show them in the UI language instead of the English fallback. */
function messageText(message: AiMessage) {
  const key = message.responseCode ? `agentOs.reply.${message.responseCode}` : ''
  return key && te(key) ? t(key, (message.responseParams || {}) as Record<string, unknown>) : message.content
}
const ai = useAiProducerStore()
const { panelOpen, messages, draft, draftAttachments, sending, error, conversations, conversationId, runs, recipeId, draftContext } = storeToRefs(ai)

const tab = ref<'chat' | 'recipes'>('chat')
const historyOpen = ref(false)
const scroller = ref<HTMLElement | null>(null)
const composer = ref<HTMLTextAreaElement | null>(null)
const dragging = ref(false)

const recipeIcons = { rocket: Rocket, clapperboard: Clapperboard, images: Images, flame: Flame, trophy: Trophy, send: SendHorizontal, link: Link2 }
const activeRecipe = computed<Recipe | null>(() => (recipeId.value ? recipeById(recipeId.value) : null))
const recipePreset = computed(() => (draftContext.value?.recipePreset as Record<string, unknown>) || {})

const suggestions = computed(() => [
  t('ai.suggest.health'),
  t('ai.suggest.weekly'),
  t('ai.suggest.failed'),
  t('ai.suggest.publish'),
])

/** Interleave messages and plan cards: a run's card follows the last message that belongs to it. */
const timeline = computed(() => {
  const lastIndexByRun = new Map<string, number>()
  messages.value.forEach((message, index) => {
    if (message.runId) lastIndexByRun.set(message.runId, index)
  })
  const rows: Array<{ key: string; kind: 'message' | 'run'; message?: (typeof messages.value)[number]; runId?: string }> = []
  messages.value.forEach((message, index) => {
    // Server-side plan / completion templates are replaced by the plan card.
    const isPlanTemplate = message.role === 'assistant' && Boolean(message.runId) && (/\nRun: [A-Z0-9]+\s*$/.test(message.content) || /^Run [A-Z0-9]+ (completed|failed)/.test(message.content))
    if (!isPlanTemplate) rows.push({ key: message.id, kind: 'message', message })
    if (message.runId && lastIndexByRun.get(message.runId) === index && runs.value[message.runId]) {
      rows.push({ key: `run-${message.runId}`, kind: 'run', runId: message.runId })
    }
  })
  return rows
})

watch(
  () => [timeline.value.length, panelOpen.value],
  async () => {
    await nextTick()
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  },
)

watch(recipeId, (value) => {
  if (value) tab.value = 'recipes'
})

watch(panelOpen, async (open) => {
  if (open && tab.value === 'chat') {
    await nextTick()
    composer.value?.focus()
  }
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    void ai.send()
  }
}

async function attachFromDisk() {
  const picked = (await window.api.pickFiles({ multiple: true })) as string[]
  if (picked?.length) draftAttachments.value = [...draftAttachments.value, ...picked.map(attachmentFromPath)]
}

async function attachFromLibrary() {
  const picked = await openAssetLibraryPicker({ type: 'all', multiple: true })
  if (picked?.length) draftAttachments.value = [...draftAttachments.value, ...picked.map((item) => attachmentFromPath(item.filePath))]
}

function removeAttachment(id: string) {
  draftAttachments.value = draftAttachments.value.filter((item) => item.id !== id)
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const files = Array.from(event.dataTransfer?.files || [])
  const paths = files.map((file) => window.api.getPathForFile(file)).filter(Boolean)
  if (paths.length) draftAttachments.value = [...draftAttachments.value, ...paths.map(attachmentFromPath)]
}

function useSuggestion(text: string) {
  draft.value = text
  composer.value?.focus()
}

function startRecipe(recipe: Recipe) {
  recipeId.value = recipe.id
}

async function submitRecipe(build: RecipeBuild) {
  const id = recipeId.value
  recipeId.value = ''
  draftContext.value = {}
  tab.value = 'chat'
  await ai.newConversation({ recipeId: id })
  await ai.send({ content: build.prompt, context: build.context, plan: build.plan })
}

function toggleHistory() {
  historyOpen.value = !historyOpen.value
  if (historyOpen.value) void ai.loadConversations()
}

async function newChat() {
  historyOpen.value = false
  recipeId.value = ''
  tab.value = 'chat'
  await ai.newConversation()
}

async function pickConversation(id: string) {
  historyOpen.value = false
  tab.value = 'chat'
  await ai.selectConversation(id)
}

function formatTime(value: number) {
  return new Date(value).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <Transition name="ai-drawer">
    <aside
      v-if="panelOpen"
      class="vg-scope ai-panel"
      data-testid="ai-producer-panel"
      :class="{ 'is-dragging': dragging }"
      @dragover.prevent="dragging = true"
      @dragleave.self="dragging = false"
      @drop.prevent="onDrop"
    >
      <header class="ai-panel__head">
        <span class="ai-panel__logo"><Wand2 :size="16" /></span>
        <div class="ai-panel__title">
          <strong>{{ t('ai.producer') }}</strong>
          <small>{{ t('ai.producerTagline') }}</small>
        </div>
        <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('ai.history')" @click="toggleHistory"><History :size="15" /></button>
        <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('ai.newChat')" @click="newChat"><MessageSquarePlus :size="15" /></button>
        <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('common.close')" data-testid="ai-panel-close" @click="ai.close()"><X :size="15" /></button>
      </header>

      <div class="vg-tabs ai-panel__tabs">
        <button type="button" class="vg-tabs__btn" :class="{ 'is-active': tab === 'chat' }" @click="tab = 'chat'">{{ t('ai.tabs.chat') }}</button>
        <button type="button" class="vg-tabs__btn" :class="{ 'is-active': tab === 'recipes' }" data-testid="ai-tab-recipes" @click="tab = 'recipes'">{{ t('ai.tabs.recipes') }}</button>
      </div>

      <div v-if="historyOpen" class="ai-panel__history">
        <button
          v-for="conversation in conversations"
          :key="conversation.id"
          type="button"
          class="ai-panel__history-item"
          :class="{ 'is-active': conversation.id === conversationId }"
          @click="pickConversation(conversation.id)"
        >
          <span class="vg-ellipsis">{{ conversation.title && conversation.title !== 'New work task' ? conversation.title : t('ai.untitled') }}</span>
          <small>{{ formatTime(conversation.updatedAt) }}</small>
        </button>
        <p v-if="!conversations.length" class="vg-muted">{{ t('ai.noHistory') }}</p>
      </div>

      <template v-if="tab === 'chat'">
        <div ref="scroller" class="ai-panel__body">
          <div v-if="!timeline.length" class="ai-panel__welcome">
            <span class="ai-panel__welcome-icon"><Sparkles :size="22" /></span>
            <h3>{{ t('ai.welcomeTitle') }}</h3>
            <p>{{ t('ai.welcomeDesc') }}</p>
            <div class="ai-panel__suggestions">
              <button v-for="item in suggestions" :key="item" type="button" class="ai-panel__suggestion" @click="useSuggestion(item)">{{ item }}</button>
            </div>
            <button type="button" class="vg-btn vg-btn--soft vg-btn--sm" @click="tab = 'recipes'"><Sparkles :size="14" /> {{ t('ai.browseRecipes') }}</button>
          </div>

          <template v-for="row in timeline" :key="row.key">
            <div v-if="row.kind === 'message' && row.message" class="ai-msg" :class="`is-${row.message.role}`">
              <div class="ai-msg__bubble">{{ messageText(row.message) }}</div>
              <div v-if="row.message.attachments?.length" class="ai-msg__attachments">
                <span v-for="attachment in row.message.attachments" :key="attachment.id" class="vg-chip">{{ attachment.name }}</span>
              </div>
            </div>
            <AiPlanCard v-else-if="row.kind === 'run' && row.runId && runs[row.runId]" :detail="runs[row.runId]" />
          </template>

          <div v-if="sending" class="ai-msg is-assistant">
            <div class="ai-msg__bubble ai-msg__thinking"><Loader2 :size="14" class="vg-spin" /> {{ t('ai.thinking') }}</div>
          </div>
        </div>

        <footer class="ai-panel__composer">
          <div v-if="error" class="vg-notice vg-notice--danger ai-panel__error">{{ error }}</div>
          <div v-if="draftAttachments.length" class="ai-panel__attachments">
            <span v-for="attachment in draftAttachments" :key="attachment.id" class="vg-chip ai-panel__attachment">
              <span class="vg-ellipsis">{{ attachment.name }}</span>
              <button type="button" :aria-label="t('common.remove')" @click="removeAttachment(attachment.id)"><X :size="11" /></button>
            </span>
          </div>
          <textarea
            ref="composer"
            v-model="draft"
            class="vg-textarea ai-panel__input"
            rows="3"
            data-testid="ai-composer"
            :placeholder="t('ai.composerPlaceholder')"
            @keydown="onKeydown"
          ></textarea>
          <div class="ai-panel__composer-actions">
            <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('ai.attachFile')" @click="attachFromDisk"><Paperclip :size="15" /></button>
            <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('ai.attachAsset')" @click="attachFromLibrary"><FolderOpen :size="15" /></button>
            <span class="ai-panel__hint">{{ t('ai.composerHint') }}</span>
            <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" data-testid="ai-send" :disabled="!draft.trim() || sending" @click="ai.send()">
              <Send :size="14" /> {{ t('ai.send') }}
            </button>
          </div>
        </footer>
      </template>

      <div v-else class="ai-panel__body">
        <AiRecipeForm v-if="activeRecipe" :key="activeRecipe.id" :recipe="activeRecipe" :preset="recipePreset" @back="recipeId = ''" @submit="submitRecipe" />
        <div v-else class="ai-recipes">
          <p class="ai-recipes__intro">{{ t('ai.recipes.intro') }}</p>
          <button
            v-for="recipe in AI_RECIPES"
            :key="recipe.id"
            type="button"
            class="ai-recipe"
            :class="`ai-recipe--${recipe.tone}`"
            :data-testid="`ai-recipe-${recipe.id}`"
            @click="startRecipe(recipe)"
          >
            <span class="ai-recipe__icon"><component :is="recipeIcons[recipe.icon]" :size="18" /></span>
            <span class="ai-recipe__copy">
              <strong>{{ t(recipe.titleKey) }}</strong>
              <small>{{ t(recipe.descKey) }}</small>
              <em>{{ t(recipe.outputKey) }}</em>
            </span>
          </button>
        </div>
      </div>

      <div v-if="dragging" class="ai-panel__drop">{{ t('ai.dropHere') }}</div>
    </aside>
  </Transition>
</template>

<style scoped>
.ai-panel {
  position: fixed;
  top: 48px;
  right: 0;
  bottom: 0;
  z-index: 90;
  width: min(460px, 100vw);
  display: flex;
  flex-direction: column;
  background: var(--theme-shell);
  border-left: 1px solid var(--theme-border);
  box-shadow: -18px 0 40px rgba(0, 0, 0, .18);
}
.ai-panel__head { display: flex; align-items: center; gap: 8px; padding: 12px 14px 8px; }
.ai-panel__logo { width: 30px; height: 30px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); }
.ai-panel__title { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.ai-panel__title strong { font-size: 14px; }
.ai-panel__title small { font-size: 11.5px; color: var(--theme-text-muted); }
.ai-panel__tabs { padding: 0 10px; overflow: visible; }
.ai-panel__history { max-height: 260px; overflow: auto; border-bottom: 1px solid var(--theme-divider); padding: 6px 10px; display: flex; flex-direction: column; gap: 2px; }
.ai-panel__history-item { display: flex; justify-content: space-between; gap: 10px; padding: 7px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--theme-text-secondary); font-size: 12.5px; text-align: left; cursor: pointer; }
.ai-panel__history-item:hover, .ai-panel__history-item.is-active { background: var(--theme-panel-soft); color: var(--theme-text); }
.ai-panel__history-item small { flex-shrink: 0; color: var(--theme-text-muted); }
.ai-panel__body { flex: 1; min-height: 0; overflow: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.ai-panel__welcome { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 18px 8px; }
.ai-panel__welcome-icon { width: 46px; height: 46px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; background: var(--vg-accent-soft); color: var(--vg-accent); }
.ai-panel__welcome h3 { margin: 4px 0 0; font-size: 16px; }
.ai-panel__welcome p { margin: 0; font-size: 12.5px; color: var(--theme-text-secondary); line-height: 1.6; }
.ai-panel__suggestions { display: flex; flex-direction: column; gap: 6px; width: 100%; margin: 8px 0; }
.ai-panel__suggestion { padding: 9px 12px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel); color: var(--theme-text); font-size: 12.5px; text-align: left; cursor: pointer; }
.ai-panel__suggestion:hover { border-color: var(--vg-accent-line); }
.ai-msg { display: flex; flex-direction: column; gap: 4px; max-width: 92%; }
.ai-msg.is-user { align-self: flex-end; align-items: flex-end; }
.ai-msg.is-assistant, .ai-msg.is-system { align-self: flex-start; }
.ai-msg__bubble { padding: 9px 12px; border-radius: 12px; font-size: 13px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.ai-msg.is-user .ai-msg__bubble { background: var(--vg-accent); color: var(--theme-on-accent); border-bottom-right-radius: 4px; }
.ai-msg.is-assistant .ai-msg__bubble, .ai-msg.is-system .ai-msg__bubble { background: var(--theme-panel); border: 1px solid var(--theme-border); border-bottom-left-radius: 4px; }
.ai-msg__thinking { display: inline-flex; align-items: center; gap: 6px; color: var(--theme-text-secondary); }
.ai-msg__attachments { display: flex; flex-wrap: wrap; gap: 4px; }
.ai-panel__composer { border-top: 1px solid var(--theme-divider); padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.ai-panel__error { font-size: 12px; }
.ai-panel__attachments { display: flex; flex-wrap: wrap; gap: 4px; }
.ai-panel__attachment { max-width: 180px; }
.ai-panel__attachment button { border: 0; background: transparent; color: inherit; cursor: pointer; display: inline-flex; padding: 0; }
.ai-panel__input { resize: none; min-height: 68px; }
.ai-panel__composer-actions { display: flex; align-items: center; gap: 6px; }
.ai-panel__hint { flex: 1; font-size: 11px; color: var(--theme-text-muted); }
.ai-recipes { display: flex; flex-direction: column; gap: 8px; }
.ai-recipes__intro { margin: 0 0 4px; font-size: 12.5px; color: var(--theme-text-secondary); line-height: 1.6; }
.ai-recipe { display: flex; gap: 12px; padding: 12px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); text-align: left; cursor: pointer; color: var(--theme-text); transition: border-color .15s, transform .15s; }
.ai-recipe:hover { border-color: var(--vg-accent-line); transform: translateY(-1px); }
.ai-recipe__icon { width: 36px; height: 36px; flex-shrink: 0; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: var(--vg-accent-soft); color: var(--vg-accent); }
.ai-recipe--violet .ai-recipe__icon { background: color-mix(in srgb, var(--vg-violet) 16%, transparent); color: var(--vg-violet); }
.ai-recipe--red .ai-recipe__icon { background: color-mix(in srgb, var(--vg-red) 16%, transparent); color: var(--vg-red); }
.ai-recipe--amber .ai-recipe__icon { background: color-mix(in srgb, var(--vg-amber) 16%, transparent); color: var(--vg-amber); }
.ai-recipe--blue .ai-recipe__icon { background: color-mix(in srgb, var(--vg-blue) 16%, transparent); color: var(--vg-blue); }
.ai-recipe--green .ai-recipe__icon { background: color-mix(in srgb, var(--vg-green) 16%, transparent); color: var(--vg-green); }
.ai-recipe__copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ai-recipe__copy strong { font-size: 13.5px; }
.ai-recipe__copy small { font-size: 12px; color: var(--theme-text-secondary); line-height: 1.5; }
.ai-recipe__copy em { font-style: normal; font-size: 11.5px; color: var(--vg-accent); }
.ai-panel__drop { position: absolute; inset: 8px; border: 2px dashed var(--vg-accent-line); border-radius: var(--vg-radius-lg); background: color-mix(in srgb, var(--theme-shell) 85%, transparent); display: flex; align-items: center; justify-content: center; font-weight: 600; color: var(--vg-accent); pointer-events: none; }
.ai-drawer-enter-active, .ai-drawer-leave-active { transition: transform .22s ease, opacity .22s ease; }
.ai-drawer-enter-from, .ai-drawer-leave-to { transform: translateX(24px); opacity: 0; }
</style>
