<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowUp, Check, ChevronRight, CircleDashed, History, LoaderCircle, Paperclip, Plus, Wand2, X, XCircle } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncProducerChat, type SyncProducerMessage } from '@shared/cloud/sync'
import PageHeader from '@/components/PageHeader.vue'
import { relativeTime } from '@/lib/library'
import { attachReferenceVideo, cancelPlan, loadChat, newChat, runPlan, send } from '@/lib/producer'
import { errorMessage } from '@/lib/session'
import { listRecords, syncState } from '@/lib/sync'
import { toast } from '@/lib/toast'

const router = useRouter()
const route = useRoute()
const chatId = ref('')
const chat = ref<SyncProducerChat | null>(null)
const input = ref('')
const thinking = ref(false)
const attaching = ref(false)
const running = ref('')
const showHistory = ref(false)
const history = ref<(SyncProducerChat & { id: string; updatedAt: number })[]>([])
const fileInput = ref<HTMLInputElement>()
const scroller = ref<HTMLElement>()
const LAST_KEY = 'producer.lastChat'

const suggestions = [
  '给最新的商品生成 3 张商品图，再做一条图生视频',
  '帮我写一份英文上架文案',
  '去抖音采集 50 个耳环爆款',
  '我附上一条爆款视频，用我的耳环复刻',
  '把最近 3 条视频加上字幕，再混剪出 3 条新的',
  '生成一个 25 岁左右的越南女模特',
]

async function open(id: string) {
  const loaded = await loadChat(id)
  if (!loaded) return startNew()
  chatId.value = id
  chat.value = loaded
  localStorage.setItem(LAST_KEY, id)
  showHistory.value = false
  await scrollToEnd()
}

function startNew() {
  const created = newChat()
  chatId.value = created.id
  chat.value = created.chat
  localStorage.setItem(LAST_KEY, created.id)
  showHistory.value = false
}

async function loadHistory() {
  const records = await listRecords<SyncProducerChat>(SYNC_COLLECTIONS.producerChats)
  history.value = records
    .filter((record) => record.data && record.data.messages.length)
    .map((record) => ({ ...(record.data as SyncProducerChat), id: record.id, updatedAt: record.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
watch(() => syncState.version, loadHistory, { immediate: true })

onMounted(() => {
  // 「交给 AI」/ 搜索框带来的目标：开一个新对话并把目标放进输入框，用户确认后再发送
  const prompt = String(route.query.prompt || '').trim()
  if (prompt) {
    startNew()
    input.value = prompt.slice(0, 500)
    void router.replace({ path: route.path })
    return
  }
  const last = localStorage.getItem(LAST_KEY)
  if (last) void open(last)
  else startNew()
})

async function scrollToEnd() {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
}

async function submit(text = input.value.trim()) {
  if (!text || !chat.value || thinking.value) return
  input.value = ''
  thinking.value = true
  // Show the user's message straight away while the AI thinks.
  chat.value = { ...chat.value, messages: [...chat.value.messages, { id: 'pending', role: 'user', text, at: Date.now() }] }
  await scrollToEnd()
  try {
    const base = { ...chat.value, messages: chat.value.messages.filter((message) => message.id !== 'pending') }
    chat.value = await send(chatId.value, base, text)
  } catch (error) {
    toast(errorMessage(error))
    chat.value = { ...chat.value, messages: chat.value.messages.filter((message) => message.id !== 'pending') }
    input.value = text
  } finally {
    thinking.value = false
    await scrollToEnd()
  }
}

async function onVideo(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file || !chat.value) return
  attaching.value = true
  try {
    chat.value = await attachReferenceVideo(chatId.value, chat.value, file)
    toast('视频已附上，可以说「用 XX 商品复刻这条」')
    await scrollToEnd()
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    attaching.value = false
  }
}

async function execute(message: SyncProducerMessage) {
  running.value = message.id
  try {
    await runPlan(chatId.value, message.id, (updated) => (chat.value = updated))
    toast('计划已执行，生成结果会陆续出现')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    running.value = ''
  }
}

async function cancel(message: SyncProducerMessage) {
  await cancelPlan(chatId.value, message.id)
  chat.value = await loadChat(chatId.value)
}

const empty = computed(() => !chat.value?.messages.length)
</script>

<template>
  <PageHeader title="AI 制片人" back="/create">
    <template #actions>
      <button type="button" class="m-icon-btn" aria-label="历史对话" @click="showHistory = true"><History :size="20" /></button>
      <button type="button" class="m-icon-btn" aria-label="新对话" @click="startNew"><Plus :size="22" /></button>
    </template>
  </PageHeader>

  <main ref="scroller" class="m-page producer">
    <section v-if="empty" class="hello">
      <span class="hello__icon"><Wand2 :size="28" /></span>
      <h2>一句话安排生产</h2>
      <p>告诉我想做什么，我会排好步骤给你确认，再自动去生成商品图、视频、文案、复刻、模特，或给视频加字幕水印、混剪。</p>
      <div class="suggest">
        <button v-for="item in suggestions" :key="item" type="button" @click="submit(item)">{{ item }}</button>
      </div>
    </section>

    <template v-for="message in chat?.messages ?? []" :key="message.id">
      <div class="bubble" :class="message.role === 'user' ? 'bubble--me' : 'bubble--ai'">{{ message.text }}</div>
      <div v-if="message.plan" class="plan m-card">
        <div class="plan__head">
          <strong>{{ message.plan.summary }}</strong>
          <span class="m-badge" :class="{ 'm-badge--blue': message.plan.state === 'running', 'm-badge--green': message.plan.state === 'done', 'm-badge--muted': message.plan.state === 'cancelled' || message.plan.state === 'proposed' }">
            {{ { proposed: '待确认', running: '执行中', done: '已完成', cancelled: '已取消' }[message.plan.state] }}
          </span>
        </div>
        <ol class="plan__steps">
          <li v-for="(step, index) in message.plan.steps" :key="index" :class="`is-${step.status}`">
            <span class="plan__icon">
              <LoaderCircle v-if="step.status === 'running'" :size="16" class="m-spin" />
              <Check v-else-if="step.status === 'done'" :size="16" :stroke-width="3" />
              <XCircle v-else-if="step.status === 'failed'" :size="16" />
              <CircleDashed v-else :size="16" />
            </span>
            <span class="plan__text">
              {{ step.title }}
              <small v-if="step.error">{{ step.error }}</small>
            </span>
            <button v-if="step.route" type="button" class="plan__go" @click="router.push(step.route)">查看<ChevronRight :size="14" /></button>
          </li>
        </ol>
        <div v-if="message.plan.state === 'proposed'" class="plan__actions">
          <button type="button" class="m-btn m-btn--sm" @click="cancel(message)"><X :size="14" /> 不用了</button>
          <button type="button" class="m-btn m-btn--sm m-btn--primary" :disabled="running === message.id" @click="execute(message)">
            <LoaderCircle v-if="running === message.id" :size="14" class="m-spin" /><Check v-else :size="14" /> 执行
          </button>
        </div>
      </div>
    </template>
    <div v-if="thinking" class="bubble bubble--ai thinking"><LoaderCircle :size="16" class="m-spin" /> 正在安排…</div>
  </main>

  <div class="composer">
    <button type="button" class="m-icon-btn" :disabled="attaching" aria-label="附上对标视频" @click="fileInput?.click()">
      <LoaderCircle v-if="attaching" :size="20" class="m-spin" /><Paperclip v-else :size="20" />
    </button>
    <textarea v-model="input" rows="1" placeholder="想做什么？比如：给耳环生成商品图" @keydown.enter.exact.prevent="submit()" />
    <button type="button" class="send" :disabled="!input.trim() || thinking" aria-label="发送" @click="submit()"><ArrowUp :size="20" :stroke-width="2.6" /></button>
    <input ref="fileInput" type="file" accept="video/*" hidden @change="onVideo" />
  </div>

  <Teleport to="body">
    <div v-if="showHistory" class="sheet-backdrop" @click.self="showHistory = false">
      <section class="sheet">
        <header class="sheet__head"><h2>历史对话</h2><button type="button" class="m-icon-btn" aria-label="关闭" @click="showHistory = false"><X :size="20" /></button></header>
        <div v-if="history.length" class="m-card m-list">
          <button v-for="item in history" :key="item.id" type="button" class="m-row" @click="open(item.id)">
            <span class="m-row__main"><span class="m-row__title">{{ item.title }}</span><span class="m-row__sub">{{ item.messages.length }} 条消息 · {{ relativeTime(item.updatedAt) }}</span></span>
            <ChevronRight :size="18" class="m-muted" />
          </button>
        </div>
        <p v-else class="m-muted empty">还没有历史对话</p>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.producer { display: flex; flex-direction: column; gap: 10px; padding-bottom: calc(var(--m-safe-bottom) + 96px); }
.hello { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px 8px 8px; text-align: center; }
.hello__icon { display: grid; place-items: center; width: 60px; height: 60px; border-radius: 18px; background: var(--m-accent-soft); color: var(--m-accent-2); }
.hello h2 { margin: 8px 0 0; font-size: 19px; }
.hello p { margin: 0; color: var(--theme-text-muted); font-size: 13px; line-height: 1.6; }
.suggest { display: flex; flex-direction: column; gap: 8px; width: 100%; margin-top: 14px; }
.suggest button { padding: 12px 14px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); color: var(--theme-text-secondary); font-size: 13px; text-align: left; }
.bubble { max-width: 86%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.bubble--me { align-self: flex-end; border-bottom-right-radius: 4px; background: linear-gradient(135deg, var(--m-accent), var(--m-accent-2)); color: #04201c; }
.bubble--ai { align-self: flex-start; border-bottom-left-radius: 4px; background: var(--theme-panel); border: 1px solid var(--theme-border); }
.thinking { display: inline-flex; align-items: center; gap: 8px; color: var(--theme-text-muted); }
.plan { align-self: stretch; padding: 14px; border-color: var(--m-accent-line); }
.plan__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.plan__head strong { font-size: 14px; line-height: 1.5; }
.plan__steps { display: flex; flex-direction: column; gap: 8px; margin: 12px 0 0; padding: 0; list-style: none; }
.plan__steps li { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.plan__icon { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--theme-control); color: var(--theme-text-muted); }
.is-done .plan__icon { background: var(--m-accent); color: #04201c; }
.is-running .plan__icon { color: var(--m-blue); }
.is-failed .plan__icon { color: var(--m-red); background: color-mix(in srgb, var(--m-red) 12%, transparent); }
.is-skipped { opacity: .5; }
.plan__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.plan__text small { color: var(--theme-danger-text); font-size: 11px; }
.plan__go { display: inline-flex; align-items: center; padding: 0; border: 0; background: none; color: var(--m-accent-2); font-size: 12px; font-weight: 700; }
.plan__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.composer { position: fixed; inset: auto 0 0; z-index: 20; display: flex; align-items: flex-end; gap: 6px; padding: 10px 10px calc(10px + var(--m-safe-bottom)); background: color-mix(in srgb, var(--theme-root) 92%, transparent); backdrop-filter: blur(14px); border-top: 1px solid var(--theme-border); }
.composer textarea { flex: 1; min-height: 44px; max-height: 120px; padding: 11px 14px; border: 1px solid var(--theme-border-control); border-radius: 14px; background: var(--theme-input); color: var(--theme-text); font-size: 15px; resize: none; outline: none; }
.composer textarea:focus { border-color: var(--m-accent); }
.send { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 14px; background: linear-gradient(135deg, var(--m-accent), var(--m-accent-2)); color: #04201c; }
.send:disabled { opacity: .4; }
.sheet-backdrop { position: fixed; inset: 0; z-index: 60; display: flex; align-items: flex-end; background: var(--theme-overlay); }
.sheet { width: 100%; max-height: 78vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 8px var(--m-gutter) calc(16px + var(--m-safe-bottom)); border-radius: 22px 22px 0 0; background: var(--theme-panel); }
.sheet__head { display: flex; align-items: center; justify-content: space-between; }
.sheet__head h2 { margin: 0; font-size: 17px; }
.empty { padding: 24px; text-align: center; font-size: 13px; }
</style>
