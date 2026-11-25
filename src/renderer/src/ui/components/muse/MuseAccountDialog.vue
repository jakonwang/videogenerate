<script setup lang="ts">
/** Account manager of Muse 创意室. Layout and classes follow the tk创意室 one (design-system/creative-studio.css). */
import { m } from './museText'
import { computed, reactive, ref, watch } from 'vue'
import { Activity, ArrowDown, ArrowUp, Check, Gauge, KeyRound, LoaderCircle, LogIn, Pencil, Plus, Power, Search, ShieldCheck, Trash2, X } from 'lucide-vue-next'
import type { MuseAccount } from '../../../../../main/modules/muse-creative-studio/types'
import { MUSE_ACCOUNT_STATES, museError, museQuotaPaused } from './museLabels'

const props = defineProps<{ open: boolean; accounts: MuseAccount[]; encryptionAvailable: boolean; remote?: boolean }>()
const emit = defineEmits<{ close: []; changed: [] }>()

type Work = 'test' | 'login' | 'quota' | 'other'
type Filter = 'all' | 'enabled' | 'disabled'

const api = window.api.museCreative
const work = reactive<Record<string, Work | undefined>>({})
const error = ref('')
const search = ref('')
const filter = ref<Filter>('all')
const removing = ref<MuseAccount | null>(null)
const form = reactive({ id: '', name: '', proxy: '', cookieJson: '', saving: false })

const editing = computed(() => props.accounts.find((item) => item.id === form.id))
const formLocked = computed(() => form.saving || Boolean(form.id && work[form.id]))
const visible = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return props.accounts.filter((item) =>
    (filter.value === 'all' || item.enabled === (filter.value === 'enabled'))
    && (!keyword || `${item.name} ${item.proxy?.host || ''} ${item.exit?.ip || ''}`.toLowerCase().includes(keyword)))
})
const ready = computed(() => props.accounts.filter((item) => item.enabled && item.state === 'ready').length)
const abnormal = computed(() => props.accounts.filter((item) => !['ready', 'disabled', 'unchecked'].includes(item.state)).length)
const off = computed(() => props.accounts.filter((item) => !item.enabled).length)

watch(() => props.open, (open) => {
  if (!open) return
  error.value = ''
  resetForm()
})

function resetForm() {
  Object.assign(form, { id: '', name: '', proxy: '', cookieJson: '', saving: false })
}

function edit(account: MuseAccount) {
  Object.assign(form, { id: account.id, name: account.name, proxy: '', cookieJson: '', saving: false })
}

async function run(id: string, kind: Work, action: () => Promise<unknown>) {
  if (work[id]) return false
  work[id] = kind
  error.value = ''
  try {
    await action()
    return true
  } catch (e) {
    error.value = museError(e)
    return false
  } finally {
    work[id] = undefined
    emit('changed')
  }
}

const test = (id: string) => run(id, 'test', () => api.testAccount(id))
const queryQuota = (id: string) => run(id, 'quota', () => api.queryQuota(id))
async function queryAll() {
  for (const account of props.accounts) if (['ready', 'disabled'].includes(account.state)) await queryQuota(account.id)
}
const login = (id: string) => run(id, 'login', () => api.login(id))
const acceptExit = (id: string) => run(id, 'test', () => api.acceptExit(id))
const toggle = (account: MuseAccount) => run(account.id, 'other', () => api.setEnabled({ id: account.id, enabled: !account.enabled }))
const moveAccount = (id: string, step: -1 | 1) => run(id, 'other', () => api.moveAccount({ id, step }))
const isFirst = (id: string) => props.accounts[0]?.id === id
const isLast = (id: string) => props.accounts[props.accounts.length - 1]?.id === id
const cancelLogin = (id: string) => api.cancelLogin(id)

async function save() {
  form.saving = true
  error.value = ''
  const { proxy, cookieJson } = form
  try {
    const saved = form.id
      ? await api.updateAccount({ id: form.id, name: form.name, proxy })
      : await api.createAccount({ name: form.name, proxy })
    resetForm()
    emit('changed')
    if (cookieJson.trim()) await run(saved.id, 'test', () => api.importCookies({ id: saved.id, cookieJson }))
    else if (proxy.trim()) await test(saved.id)
  } catch (e) {
    error.value = museError(e)
  } finally {
    form.saving = false
  }
}

async function confirmRemove() {
  const account = removing.value
  removing.value = null
  if (!account) return
  if (form.id === account.id) resetForm()
  await run(account.id, 'other', () => api.removeAccount(account.id))
}
</script>

<template>
  <div v-if="open" class="vg-scope vg-backdrop ts-acct-mask" @click.self="emit('close')">
    <section class="ts-acct" role="dialog" aria-modal="true" :aria-label="m('账号管理')" data-testid="muse-accounts">
      <header class="ts-acct__head">
        <span class="ts-acct__icon"><KeyRound :size="20" /></span>
        <div class="ts-acct__title">
          <h2>{{ m('账号管理') }}</h2>
          <p>{{ m('每个账号只通过自己的美国代理访问 Muse，代理不通就暂停') }}</p>
        </div>
        <div class="ts-acct__sum">
          <span class="ts-state ts-state--ok"><i />{{ ready }} {{ m('可用') }}</span>
          <span class="ts-state ts-state--err"><i />{{ abnormal }} {{ m('异常') }}</span>
          <span class="ts-state"><i />{{ off }} {{ m('已停用') }}</span>
        </div>
        <button class="vg-icon-btn" type="button" :aria-label="m('关闭')" @click="emit('close')"><X :size="18" /></button>
      </header>

      <div class="ts-acct__body" :class="{ 'is-remote': remote }">
        <div class="ts-acct__list">
          <div class="ts-acct__toolbar">
            <label class="vg-search ts-acct__search"><Search :size="15" /><input v-model="search" class="vg-input vg-input--sm" type="search" :placeholder="m('搜索名称或 IP')" /></label>
            <div class="ts-seg">
              <button type="button" :class="{ 'is-on': filter === 'all' }" @click="filter = 'all'">{{ m('全部') }}</button>
              <button type="button" :class="{ 'is-on': filter === 'enabled' }" @click="filter = 'enabled'">{{ m('已启用') }}</button>
              <button type="button" :class="{ 'is-on': filter === 'disabled' }" @click="filter = 'disabled'">{{ m('已停用') }}</button>
            </div>
            <span class="ts-acct__spacer" />
            <button v-if="!remote" class="vg-btn vg-btn--sm" type="button" :disabled="!accounts.length || Object.values(work).some(Boolean)" :title="m('会依次打开每个账号的 Muse 页面，不消耗额度')" data-testid="muse-quota-all" @click="queryAll"><Gauge :size="14" />{{ m('查询全部额度') }}</button>
            <button v-if="!remote" class="vg-btn vg-btn--sm vg-btn--primary" type="button" data-testid="muse-add" @click="resetForm"><Plus :size="14" />{{ m('添加账号') }}</button>
          </div>

          <p v-if="remote" class="vg-notice vg-notice--accent mu-acct__notice">{{ m('账号的添加、登录、代理和额度查询请在电脑端操作，代理和登录信息不会离开电脑。') }}</p>
          <p v-if="!encryptionAvailable" class="vg-notice vg-notice--danger mu-acct__notice">{{ m('本机安全存储不可用，无法保存代理和登录信息。') }}</p>
          <p v-if="error" class="vg-notice vg-notice--danger mu-acct__notice" role="alert" data-testid="muse-error">{{ m(error) }}</p>

          <div class="ts-acct__rows">
            <article v-for="account in visible" :key="account.id" class="ts-acct-row mu-acct-row" :class="{ 'is-off': !account.enabled, 'is-editing': form.id === account.id }" data-testid="muse-account">
              <div class="ts-acct-row__order">
                <button v-if="!remote" type="button" :title="m('提前')" :aria-label="m('提前')" :disabled="isFirst(account.id) || Boolean(work[account.id])" @click="moveAccount(account.id, -1)"><ArrowUp :size="12" /></button>
                <b>{{ accounts.indexOf(account) + 1 }}</b>
                <button v-if="!remote" type="button" :title="m('推后')" :aria-label="m('推后')" :disabled="isLast(account.id) || Boolean(work[account.id])" @click="moveAccount(account.id, 1)"><ArrowDown :size="12" /></button>
              </div>
              <span class="ts-acct-row__avatar">{{ account.name.slice(0, 1).toUpperCase() || '#' }}</span>
              <div class="ts-acct-row__main">
                <strong :title="account.name">{{ account.name }}</strong>
                <small v-if="!remote">{{ account.proxy ? `${account.proxy.protocol.toUpperCase()} ${account.proxy.host}:${account.proxy.port}` : m('未设置代理') }}</small>
                <small v-if="!remote">{{ account.exit ? m('出口 {0} · {1} · Muse {2}', account.exit.ip, account.exit.country, account.exit.museReachable ? m('可达') : m('不可达')) : m('出口未检测') }}</small>
                <small v-if="account.quota" :title="[m('查询于 {0}', new Date(account.quota.checkedAt).toLocaleString()), ...(account.quota.lines || [])].join('\n')" data-testid="muse-quota">{{ account.quota.plan ? `${account.quota.plan} · ` : '' }}{{ m('本周已用') }} {{ account.quota.weeklyUsedPct }}%{{ account.quota.weeklyReset ? m('，{0} 重置', account.quota.weeklyReset) : '' }}{{ account.quota.extraUsedPct !== undefined ? m(' · 额外已用 {0}%{1}', account.quota.extraUsedPct, account.quota.extraLeft ? `（${account.quota.extraLeft}）` : '') : '' }}</small>
                <small v-else>{{ m('额度未查询') }}</small>
              </div>
              <div class="ts-acct-row__state">
                <span class="ts-state" :class="museQuotaPaused(account) ? 'ts-state--warn' : MUSE_ACCOUNT_STATES[account.state].tone"><i />{{ museQuotaPaused(account) ? m('额度不足') : m(MUSE_ACCOUNT_STATES[account.state].label) }}</span>
                <small v-if="account.lastError" class="is-err" :title="m(account.lastError)">{{ m(account.lastError) }}</small>
                <small v-else-if="museQuotaPaused(account)">{{ new Date(account.quotaUntil!).toLocaleString() }} {{ m('后恢复，点检测可提前') }}</small>
                <small v-else>{{ account.hasSession ? m('登录已保存') : m('未登录') }}</small>
              </div>
              <div v-if="!remote" class="ts-acct-row__actions">
                <template v-if="work[account.id] === 'login'">
                  <span class="vg-muted mu-acct__wait"><LoaderCircle :size="13" class="vg-spin" />{{ m('请在窗口中登录') }}</span>
                  <button class="vg-btn vg-btn--sm" type="button" @click="cancelLogin(account.id)">{{ m('取消') }}</button>
                </template>
                <template v-else>
                  <button v-if="account.state === 'ip_changed'" class="vg-btn vg-btn--sm vg-btn--primary" type="button" :disabled="Boolean(work[account.id])" @click="acceptExit(account.id)"><Check :size="13" />{{ m('确认新 IP') }}</button>
                  <button class="vg-btn vg-btn--sm" type="button" :disabled="Boolean(work[account.id])" @click="login(account.id)"><LogIn :size="13" />{{ m('登录') }}</button>
                  <button class="vg-icon-btn vg-icon-btn--sm" type="button" :title="m('检测')" :aria-label="m('检测')" :disabled="Boolean(work[account.id])" data-testid="muse-test" @click="test(account.id)"><LoaderCircle v-if="work[account.id] === 'test'" :size="14" class="vg-spin" /><Activity v-else :size="14" /></button>
                  <button class="vg-icon-btn vg-icon-btn--sm" type="button" :title="m('查询额度')" :aria-label="m('查询额度')" :disabled="Boolean(work[account.id]) || !account.hasSession" data-testid="muse-query-quota" @click="queryQuota(account.id)"><LoaderCircle v-if="work[account.id] === 'quota'" :size="14" class="vg-spin" /><Gauge v-else :size="14" /></button>
                  <button class="vg-icon-btn vg-icon-btn--sm" type="button" :title="m('编辑')" :aria-label="m('编辑')" :disabled="Boolean(work[account.id])" @click="edit(account)"><Pencil :size="14" /></button>
                  <button class="vg-icon-btn vg-icon-btn--sm" :class="{ 'is-on': account.enabled }" type="button" :title="account.enabled ? m('停用') : m('启用')" :aria-label="account.enabled ? m('停用') : m('启用')" :disabled="Boolean(work[account.id])" data-testid="muse-toggle" @click="toggle(account)"><Power :size="14" /></button>
                  <button class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" type="button" :title="m('删除')" :aria-label="m('删除')" :disabled="Boolean(work[account.id])" @click="removing = account"><Trash2 :size="14" /></button>
                </template>
              </div>
            </article>
            <div v-if="!visible.length" class="ts-acct__empty">
              <span><KeyRound :size="22" /></span>
              <strong>{{ accounts.length ? m('没有匹配的账号') : m('还没有 Muse 账号') }}</strong>
            </div>
          </div>
        </div>

        <form v-if="!remote" class="ts-acct__form" @submit.prevent="save">
          <div class="ts-acct__form-head">
            <h3>{{ editing ? m('编辑账号') : m('添加账号') }}</h3>
            <span class="ts-state" :class="editing ? 'ts-state--run' : 'ts-state--ok'"><i />{{ editing ? m('编辑') : m('新增') }}</span>
          </div>
          <label class="vg-field"><span class="vg-field__label">{{ m('账号名称') }}</span><input v-model="form.name" class="vg-input" :placeholder="m('例如 muse-01')" data-testid="muse-name" /></label>
          <label class="vg-field"><span class="vg-field__label">{{ m('美国代理（HTTP / SOCKS5）') }}</span><input v-model="form.proxy" class="vg-input" type="password" autocomplete="off" :placeholder="editing ? m('留空不修改') : m('socks5://地址:端口:用户名:密码')" data-testid="muse-proxy" /></label>
          <label class="vg-field ts-acct__cookie"><span class="vg-field__label">{{ m('Cookie JSON（可选，登录窗口被拒绝时用）') }}</span>
            <textarea v-model="form.cookieJson" class="vg-textarea" spellcheck="false" :placeholder="m('Cookie-Editor 导出的 JSON，只保留 muse.ai 的 Cookie')" />
          </label>
          <p class="ts-acct__hint"><ShieldCheck :size="13" />{{ m('请用静态 IP。代理密码和登录信息只加密保存在本机。') }} {{ editing ? m('更换代理会先停用账号。') : m('保存后自动检测出口，再点「登录」。') }}</p>
          <div class="ts-acct__form-actions">
            <button class="vg-btn" type="button" @click="resetForm">{{ editing ? m('取消') : m('清空') }}</button>
            <button class="vg-btn vg-btn--primary" type="submit" :disabled="formLocked || (!editing && !form.proxy.trim())" data-testid="muse-save"><Check :size="15" />{{ editing ? m('保存') : m('保存并检测') }}</button>
          </div>
        </form>
      </div>
    </section>

    <div v-if="removing" class="vg-scope vg-backdrop mu-acct__confirm" @click.self="removing = null">
      <section class="vg-dialog mu-acct__remove" role="alertdialog" aria-modal="true" aria-labelledby="mu-remove-title">
        <header class="vg-dialog__head"><div class="vg-dialog__title"><div><h2 id="mu-remove-title">{{ m('删除「{0}」？', removing.name) }}</h2><p>{{ m('会删除本机保存的代理和登录信息，不影响 Muse 账号本身。') }}</p></div></div></header>
        <footer class="vg-dialog__foot"><span />
          <div class="vg-dialog__foot-actions">
            <button class="vg-btn" type="button" @click="removing = null">{{ m('取消') }}</button>
            <button class="vg-btn vg-btn--danger" type="button" @click="confirmRemove">{{ m('删除') }}</button>
          </div>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.mu-acct-row { grid-template-columns: 30px 36px minmax(0, 1fr) minmax(130px, .8fr) auto; }
.ts-acct__toolbar { flex-wrap: wrap; }
.ts-acct__toolbar .ts-seg button, .ts-acct__toolbar .vg-btn { white-space: nowrap; }
.ts-acct__body.is-remote { grid-template-columns: minmax(0, 1fr); }
.mu-acct__notice { margin: 10px 16px 0; }
.mu-acct__wait { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap; }
.mu-acct__confirm { z-index: 2300; }
.mu-acct__remove { width: min(460px, 100%); }
@media (max-width: 1000px) { .mu-acct-row { grid-template-columns: 30px 36px minmax(0, 1fr) auto; } }
</style>
