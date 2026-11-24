<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, Cookie, ExternalLink, FileUp, Loader2, Pencil, Plus, RefreshCcw, ShieldCheck, Trash2, Tv, X } from 'lucide-vue-next'
import type { LiveAccount, LiveSyncState } from '../../../../../shared/liveAccounts'
import ChActionDialog from '../creator-hub/ChActionDialog.vue'
import '../creator-hub/creator-hub.css'
import { liveErrorText } from './liveText'

/** 店铺 → 账号 里的直播账号：和店铺一样用 Cookie 登录，可加多个。 */
const { t, locale } = useI18n()
const api = window.api.liveAccounts
const accounts = ref<LiveAccount[]>([])
const progress = ref<LiveSyncState[]>([])
const busyId = ref('')
const error = ref('')
const notice = ref('')
const dialog = ref<{ open: boolean; account: LiveAccount | null }>({ open: false, account: null })
const cookieJson = ref('')
const name = ref('')
const importing = ref(false)
const importError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const action = ref<{ kind: 'rename' | 'remove'; account: LiveAccount } | null>(null)

const time = (ms?: number) => (ms ? new Intl.DateTimeFormat(locale.value, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)) : '—')
const jobOf = (id: string) => progress.value.find((item) => item.accountId === id && item.status === 'running')

async function load() {
  accounts.value = await api.list()
}
let timer: ReturnType<typeof setInterval> | null = null
async function poll() {
  const before = progress.value.some((item) => item.status === 'running')
  progress.value = await api.getProgress()
  if (before && !progress.value.some((item) => item.status === 'running')) await load()
}
onMounted(() => {
  void load().catch((reason) => { error.value = liveErrorText(reason, t) })
  void poll()
  timer = setInterval(() => void poll().catch(() => undefined), 2500)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

function flash(text: string) {
  notice.value = text
  setTimeout(() => { if (notice.value === text) notice.value = '' }, 4000)
}
async function run(id: string, task: () => Promise<unknown>) {
  busyId.value = id
  error.value = ''
  try {
    await task()
  } catch (reason) {
    error.value = liveErrorText(reason, t)
  } finally {
    busyId.value = ''
  }
}
function openDialog(account: LiveAccount | null) {
  cookieJson.value = ''
  name.value = ''
  importError.value = ''
  dialog.value = { open: true, account }
}
function closeDialog() {
  if (importing.value) return
  cookieJson.value = ''
  dialog.value = { open: false, account: null }
}
async function pickFile(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.[0]) cookieJson.value = await input.files[0].text()
  input.value = ''
}
async function submit() {
  if (!cookieJson.value.trim() || importing.value) return
  importing.value = true
  importError.value = ''
  try {
    const result = await api.importCookies({ cookieJson: cookieJson.value, accountId: dialog.value.account?.id, name: name.value.trim() || undefined })
    cookieJson.value = ''
    dialog.value = { open: false, account: null }
    flash(t('shops.live.saved', { name: result.account.name }))
    await load()
    await api.sync({ accountId: result.account.id })
    await poll()
  } catch (reason) {
    importError.value = liveErrorText(reason, t)
  } finally {
    importing.value = false
  }
}
const verify = (account: LiveAccount) => run(account.id, async () => {
  const result = await api.verify(account.id)
  flash(result.loginState === 'valid' ? t('shops.verifyOk', { name: account.name }) : t('shops.verifyExpired', { name: account.name }))
  await load()
})
const sync = (account: LiveAccount) => run(account.id, async () => { await api.sync({ accountId: account.id }); await poll() })
const openBackend = (account: LiveAccount) => run(account.id, () => api.openBackend(account.id))
async function confirmAction(value: string) {
  const current = action.value
  action.value = null
  if (!current) return
  await run(current.account.id, async () => {
    if (current.kind === 'rename') await api.rename({ id: current.account.id, name: value })
    else await api.remove(current.account.id)
    await load()
  })
}
</script>

<template>
  <section class="lva" data-testid="live-accounts">
    <div class="lva-head">
      <h3><Tv :size="16" />{{ t('shops.live.accounts') }}</h3>
      <p class="vg-muted">{{ t('shops.live.accountsHint') }}</p>
      <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" data-testid="live-add" @click="openDialog(null)"><Plus :size="14" />{{ t('shops.live.add') }}</button>
    </div>
    <div v-if="error" class="vg-notice vg-notice--danger"><AlertTriangle :size="16" /><span>{{ error }}</span></div>
    <div v-if="notice" class="vg-notice vg-notice--accent"><ShieldCheck :size="16" /><span>{{ notice }}</span></div>
    <p v-if="!accounts.length" class="vg-card lva-empty">{{ t('shops.live.empty') }}</p>
    <div v-else class="lva-grid">
      <article v-for="account in accounts" :key="account.id" class="vg-card lva-card">
        <header>
          <span class="lva-avatar">{{ (account.name || '?').slice(0, 1).toUpperCase() }}</span>
          <div><strong>{{ account.name }}</strong><small>@{{ account.handle }} · {{ account.region }}</small></div>
          <span class="vg-pill vg-pill--dot" :class="account.loginState === 'valid' ? 'vg-pill--green' : 'vg-pill--red'">{{ t(account.loginState === 'valid' ? 'shops.live.valid' : 'shops.live.expired') }}</span>
        </header>
        <p class="lva-meta">
          <template v-if="jobOf(account.id)"><Loader2 :size="12" class="vg-spin" /> {{ t('shops.live.syncing', { done: jobOf(account.id)!.done, total: jobOf(account.id)!.total }) }}</template>
          <template v-else>{{ t('shops.lastSync', { time: time(account.lastSyncAt) }) }} · {{ t('shops.cookieExpires') }} {{ time(account.cookieExpiresAt) }}</template>
        </p>
        <p v-if="account.lastSyncError && !jobOf(account.id)" class="lva-error">{{ liveErrorText(account.lastSyncError, t) }}</p>
        <footer>
          <button type="button" class="vg-btn vg-btn--sm" :class="{ 'vg-btn--primary': account.loginState !== 'valid' }" @click="openDialog(account)"><Cookie :size="13" />{{ t('shops.updateCookie') }}</button>
          <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" :disabled="Boolean(jobOf(account.id)) || busyId === account.id" @click="sync(account)"><RefreshCcw :size="13" />{{ t('shops.live.sync') }}</button>
          <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" :disabled="busyId === account.id" @click="verify(account)"><ShieldCheck :size="13" />{{ t('shops.live.verify') }}</button>
          <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" @click="openBackend(account)"><ExternalLink :size="13" />{{ t('shops.live.open') }}</button>
          <span class="vg-toolbar__spacer"></span>
          <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('shops.rename')" @click="action = { kind: 'rename', account }"><Pencil :size="13" /></button>
          <button type="button" class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" :title="t('shops.remove')" @click="action = { kind: 'remove', account }"><Trash2 :size="13" /></button>
        </footer>
      </article>
    </div>

    <Teleport to="body">
      <div v-if="dialog.open" class="vg-scope vg-backdrop" @click.self="closeDialog">
        <div class="vg-dialog vg-dialog--wide" role="dialog" aria-modal="true" data-testid="live-cookie-dialog">
          <div class="vg-dialog__head">
            <div class="vg-dialog__title"><span class="vg-dialog__title-icon"><Cookie :size="19" /></span><div><h2>{{ dialog.account ? t('creatorHub.cookie.updateTitle', { name: dialog.account.name }) : t('shops.live.add') }}</h2><p>{{ t('shops.live.cookieSubtitle') }}</p></div></div>
            <button class="vg-icon-btn" type="button" :disabled="importing" :aria-label="t('creatorHub.actions.close')" @click="closeDialog"><X :size="16" /></button>
          </div>
          <div class="vg-dialog__body">
            <ol class="ch-steps"><li>{{ t('shops.live.step1') }}</li><li>{{ t('shops.live.step2') }}</li><li>{{ t('creatorHub.cookie.step3') }}</li><li>{{ t('shops.live.step4') }}</li></ol>
            <div v-if="!dialog.account" class="vg-field"><label for="lv-name">{{ t('shops.live.nameLabel') }}</label><input id="lv-name" v-model="name" class="vg-input" maxlength="80" /></div>
            <div class="vg-field">
              <div class="ch-field-head">
                <label for="lv-cookie">{{ t('creatorHub.cookie.jsonLabel') }}<span class="vg-req">*</span></label>
                <button class="vg-btn vg-btn--xs vg-btn--outline" type="button" :disabled="importing" @click="fileInput?.click()"><FileUp :size="12" />{{ t('creatorHub.cookie.fromFile') }}</button>
                <input ref="fileInput" type="file" accept=".json,application/json,text/plain" hidden @change="pickFile" />
              </div>
              <textarea id="lv-cookie" v-model="cookieJson" class="vg-textarea ch-cookie-text" rows="8" spellcheck="false" autocomplete="off" :placeholder="t('creatorHub.cookie.jsonPlaceholder')" />
            </div>
            <div class="vg-notice vg-notice--warning"><ShieldCheck :size="16" /><span>{{ t('shops.live.security') }}</span></div>
            <div v-if="importError" class="vg-notice vg-notice--danger"><AlertTriangle :size="16" /><span>{{ importError }}</span></div>
          </div>
          <div class="vg-dialog__foot">
            <span class="vg-muted">{{ importing ? t('shops.live.verifying') : '' }}</span>
            <div class="vg-dialog__foot-actions">
              <button class="vg-btn vg-btn--outline" type="button" :disabled="importing" @click="closeDialog">{{ t('creatorHub.actions.cancel') }}</button>
              <button class="vg-btn vg-btn--primary" type="button" :disabled="importing || !cookieJson.trim()" data-testid="live-cookie-submit" @click="submit"><Loader2 v-if="importing" :size="14" class="vg-spin" />{{ t('creatorHub.cookie.submit') }}</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
    <ChActionDialog
      :open="Boolean(action)"
      :title="action?.kind === 'remove' ? t('shops.live.removeTitle') : t('shops.rename')"
      :message="action?.kind === 'remove' ? t('shops.live.removeConfirm', { name: action?.account.name }) : ''"
      :confirm-text="action?.kind === 'remove' ? t('shops.remove') : t('shops.save')"
      :danger="action?.kind === 'remove'"
      :input="action?.kind === 'rename' ? action.account.name : null"
      :busy="false"
      @close="action = null"
      @confirm="confirmAction"
    />
  </section>
</template>

<style scoped>
.lva { display: flex; flex-direction: column; gap: 12px; margin-top: 22px; }
.lva-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.lva-head h3 { display: inline-flex; align-items: center; gap: 8px; margin: 0; font-size: 15px; }
.lva-head p { flex: 1; min-width: 200px; margin: 0; font-size: 12px; }
.lva-empty { padding: 22px; text-align: center; font-size: 13px; color: var(--theme-text-muted); }
.lva-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 14px; }
.lva-card { display: flex; flex-direction: column; gap: 10px; }
.lva-card header { display: flex; align-items: center; gap: 10px; }
.lva-card header > div { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.lva-card small, .lva-meta { font-size: 12px; color: var(--theme-text-muted); }
.lva-meta, .lva-error { display: flex; align-items: center; gap: 6px; margin: 0; }
.lva-error { font-size: 12px; color: var(--theme-tone-red); }
.lva-avatar { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 9px; font-weight: 700; color: var(--vg-accent); background: var(--vg-accent-soft); }
.lva-card footer { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
@media (max-width: 700px) { .lva-grid { grid-template-columns: 1fr; } }
</style>
