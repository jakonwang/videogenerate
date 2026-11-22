<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Flame, LoaderCircle, Users, X } from "lucide-vue-next";
import { MATRIX_ACCOUNT_DEFAULTS, WARMUP_MINUTES_DEFAULT, normalizeMatrixAccount, type MatrixAccountSettings } from "../../../../../shared/publishMatrix";
import { parseGeelarkAccountUid } from "../../../../../shared/geelark";
import { formatProfit, type PublishProfitReport } from "../../../../../shared/publishProfit";

const props = defineProps<{ open: boolean; connections: Array<{ uid: string; name?: string }>; profit?: PublishProfitReport | null }>();
const profitOf = (uid: string) => props.profit?.byAccount.find((row) => row.uid === uid);
const emit = defineEmits<{ (e: "close"): void; (e: "saved", list: MatrixAccountSettings[]): void }>();

const rows = ref<MatrixAccountSettings[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const showAdvanced = ref(false);
// 云手机自动养号：今天的任务情况
type WarmupInfo = { today?: { state: "scheduled" | "running" | "done" | "failed"; scheduleAt: number; action: string; minutes: number; error?: string }; doneDays: number };
const warmup = ref<Record<string, WarmupInfo>>({});
const warmupBusy = ref(false);
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const isWarming = (row: MatrixAccountSettings) => Boolean(row.warmupUntil && row.warmupUntil >= todayKey());
const isCloudTiktok = (uid: string) => parseGeelarkAccountUid(uid)?.platform === "tiktok";
function warmupText(uid: string) {
  const info = warmup.value[uid];
  const done = info?.doneDays ? `，已养 ${info.doneDays} 天` : "";
  const today = info?.today;
  if (!today) return `今天的养号任务会在可发时段里自动安排${done}`;
  const time = new Date(today.scheduleAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  const what = today.action === "search video" ? "搜关键词刷视频" : "随机刷视频";
  if (today.state === "done") return `今天已养号：${what} ${today.minutes} 分钟${done}`;
  if (today.state === "running") return `正在养号：${what}${done}`;
  if (today.state === "failed") return `今天的养号失败：${today.error || "未知原因"}`;
  return `今天 ${time} ${what} ${today.minutes} 分钟${done}`;
}
async function loadWarmup() {
  try { warmup.value = await window.api.tiktokPublisher.warmupStatus(); } catch { warmup.value = {}; }
}
async function warmupNow() {
  warmupBusy.value = true;
  try {
    await window.api.tiktokPublisher.matrixSaveAccounts(rows.value.map((r) => ({ ...r, group: r.group || "", warmupUntil: r.warmupUntil || "", warmupKeywords: r.warmupKeywords || "" })));
    warmup.value = (await window.api.tiktokPublisher.warmupRunNow()).status;
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally {
    warmupBusy.value = false;
  }
}

const GAP_OPTIONS = [30, 60, 120, 180, 240, 360];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const nameOf = (uid: string) => props.connections.find((c) => c.uid === uid)?.name || uid;
const groups = computed(() => [...new Set(rows.value.map((r) => r.group).filter(Boolean))] as string[]);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const saved = await window.api.tiktokPublisher.matrixAccounts();
    const byUid = new Map(saved.map((s) => [s.uid, s]));
    rows.value = props.connections.map((c) => ({ ...normalizeMatrixAccount(c.uid, byUid.get(c.uid) || {}) }));
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally {
    loading.value = false;
  }
}
watch(() => props.open, (open) => { if (open) { void load(); void loadWarmup(); } }, { immediate: true });

function gapLabel(minutes: number) {
  return minutes < 60 ? `${minutes} 分钟` : `${minutes / 60} 小时`;
}
function statusOf(row: MatrixAccountSettings) {
  if (row.paused) return { text: "已暂停", tone: "gray" };
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (row.warmupUntil && row.warmupUntil >= key) return { text: `养号到 ${row.warmupUntil.slice(5)}`, tone: "amber" };
  return { text: "正常", tone: "green" };
}

async function save() {
  saving.value = true;
  error.value = "";
  try {
    const list = await window.api.tiktokPublisher.matrixSaveAccounts(rows.value.map((r) => ({ ...r, group: r.group || "", warmupUntil: r.warmupUntil || "", warmupKeywords: r.warmupKeywords || "" })));
    emit("saved", list);
    emit("close");
  } catch (e: any) {
    error.value = e?.message || String(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="vg-scope vg-backdrop" @click.self="emit('close')">
    <section class="vg-dialog vg-dialog--xl pma" role="dialog" aria-modal="true" aria-labelledby="pma-title" data-testid="publish-matrix-accounts">
      <header class="vg-dialog__head">
        <div class="vg-dialog__title">
          <span class="vg-dialog__title-icon"><Users :size="20" /></span>
          <div>
            <h2 id="pma-title">账号矩阵</h2>
            <p>给每个号定好发布规则，分发时自动按规则错峰排时间</p>
          </div>
        </div>
        <button type="button" class="vg-icon-btn" aria-label="关闭" @click="emit('close')"><X :size="18" /></button>
      </header>

      <div class="vg-dialog__body pma__body">
        <p v-if="error" class="vg-notice vg-notice--danger">{{ error }}</p>
        <div v-if="loading" class="pma__empty"><LoaderCircle :size="16" class="vg-spin" />正在读取账号…</div>
        <div v-else-if="!rows.length" class="pma__empty">还没有可用的发布账号。先在 CreatOK 里授权 TikTok 账号，再回来设置。</div>
        <template v-else>
          <datalist id="pma-groups"><option v-for="g in groups" :key="g" :value="g" /></datalist>
          <div class="pma__table" role="table">
            <div class="pma__row pma__row--head" :class="{ 'is-advanced': showAdvanced }" role="row">
              <span>账号</span><span>分组</span><span>每天最多</span><span>两条间隔</span>
              <template v-if="showAdvanced"><span>可发时段</span><span>养号到</span></template>
              <span>暂停</span><span>状态</span><span>近 {{ profit?.windowDays || 30 }} 天利润</span>
            </div>
            <template v-for="row in rows" :key="row.uid">
            <div class="pma__row" :class="{ 'is-advanced': showAdvanced, 'is-paused': row.paused }" role="row">
              <span class="pma__name" :title="row.uid">{{ nameOf(row.uid) }}</span>
              <input v-model="row.group" class="vg-input vg-input--sm" list="pma-groups" maxlength="40" placeholder="例如 美妆号" />
              <label class="pma__inline">
                <input v-model.number="row.dailyLimit" class="vg-input vg-input--sm pma__num" type="number" min="1" max="50" />条
              </label>
              <select v-model.number="row.minGapMinutes" class="vg-select vg-select--sm">
                <option v-for="g in GAP_OPTIONS" :key="g" :value="g">{{ gapLabel(g) }}</option>
                <option v-if="!GAP_OPTIONS.includes(row.minGapMinutes)" :value="row.minGapMinutes">{{ gapLabel(row.minGapMinutes) }}</option>
              </select>
              <template v-if="showAdvanced">
                <span class="pma__inline">
                  <select v-model.number="row.activeStartHour" class="vg-select vg-select--sm"><option v-for="h in HOURS" :key="h" :value="h">{{ h }}:00</option></select>
                  –
                  <select v-model.number="row.activeEndHour" class="vg-select vg-select--sm"><option v-for="h in HOURS" :key="h" :value="h + 1">{{ h + 1 }}:00</option></select>
                </span>
                <input v-model="row.warmupUntil" class="vg-input vg-input--sm" type="date" title="新号养号期间不排发布" />
              </template>
              <label class="vg-switch" :class="{ 'is-on': row.paused }">
                <input v-model="row.paused" type="checkbox" class="pma__sr" :aria-label="`暂停 ${nameOf(row.uid)}`" />
                <span class="vg-switch__track" />
              </label>
              <span class="vg-pill vg-pill--dot" :class="`vg-pill--${statusOf(row).tone}`">{{ statusOf(row).text }}</span>
              <span
                class="pma__profit"
                :class="{ 'is-loss': (profitOf(row.uid)?.profit ?? 0) < 0, 'is-gain': (profitOf(row.uid)?.profit ?? 0) > 0 }"
                :title="profitOf(row.uid) ? `已发布 ${profitOf(row.uid)!.published} 条，对上投放 ${profitOf(row.uid)!.matched} 条 · 花费 ${profitOf(row.uid)!.spend} · 成交 ${profitOf(row.uid)!.revenue} · ROI ${profitOf(row.uid)!.roi}` : '还没有已发布并投放的视频'"
                :data-testid="`matrix-profit-${row.uid}`"
              >
                <template v-if="!profitOf(row.uid)?.matched">—</template>
                <template v-else>{{ formatProfit(profitOf(row.uid)!.profit) }}<small v-if="profitOf(row.uid)!.matched < profitOf(row.uid)!.published"> · {{ profitOf(row.uid)!.matched }}/{{ profitOf(row.uid)!.published }} 条</small></template>
              </span>
            </div>
            <div v-if="isWarming(row) && !row.paused" class="pma__warm" :data-testid="`warmup-${row.uid}`">
              <Flame :size="13" />
              <template v-if="isCloudTiktok(row.uid)">
                <span class="pma__warm-label">自动养号</span>
                <input v-model="row.warmupKeywords" class="vg-input vg-input--sm pma__warm-kw" maxlength="120" placeholder="搜索关键词，逗号分隔，比如 耳环, jewelry（不填就只随机刷）" />
                <label class="pma__inline">每天<input v-model.number="row.warmupMinutes" class="vg-input vg-input--sm pma__num" type="number" min="5" max="60" :placeholder="String(WARMUP_MINUTES_DEFAULT)" />分钟</label>
                <span class="pma__warm-state" :class="`is-${warmup[row.uid]?.today?.state || 'none'}`" :data-testid="`warmup-state-${row.uid}`">{{ warmupText(row.uid) }}</span>
              </template>
              <span v-else class="vg-muted">养号到 {{ row.warmupUntil }}，这期间不排发布。这个号不在云手机上，没法自动养号，请用手机自己刷一刷。</span>
            </div>
            </template>
          </div>
          <button v-if="rows.some((r) => isWarming(r) && !r.paused && isCloudTiktok(r.uid))" type="button" class="vg-btn vg-btn--sm pma__warm-now" :disabled="warmupBusy" data-testid="warmup-run-now" @click="warmupNow">
            <LoaderCircle v-if="warmupBusy" :size="13" class="vg-spin" /><Flame v-else :size="13" />保存并安排今天的养号
          </button>
          <button type="button" class="vg-link pma__adv" @click="showAdvanced = !showAdvanced">
            {{ showAdvanced ? "收起高级设置" : "高级设置：可发时段、养号期" }}
          </button>
          <p class="vg-muted pma__hint">
            默认每天最多 {{ MATRIX_ACCOUNT_DEFAULTS.dailyLimit }} 条、两条至少隔 {{ gapLabel(MATRIX_ACCOUNT_DEFAULTS.minGapMinutes) }}、
            {{ MATRIX_ACCOUNT_DEFAULTS.activeStartHour }}:00–{{ MATRIX_ACCOUNT_DEFAULTS.activeEndHour }}:00 之间发（按电脑时间）。
            同一个号短时间发太多、多个号同一分钟发同一条，最容易被限流。
          </p>
        </template>
      </div>

      <footer class="vg-dialog__foot">
        <span class="vg-muted">共 {{ rows.length }} 个号</span>
        <div class="vg-dialog__foot-actions">
          <button type="button" class="vg-btn" @click="emit('close')">取消</button>
          <button type="button" class="vg-btn vg-btn--primary" :disabled="saving || loading || !rows.length" data-testid="publish-matrix-accounts-save" @click="save">
            <LoaderCircle v-if="saving" :size="14" class="vg-spin" />保存
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.pma__body { display: flex; flex-direction: column; gap: 10px; }
.pma__empty { display: flex; align-items: center; gap: 8px; padding: 28px 8px; color: var(--theme-text-muted); font-size: 13px; justify-content: center; text-align: center; }
.pma__table { display: flex; flex-direction: column; gap: 4px; max-height: 56vh; overflow-y: auto; }
.pma__row { display: grid; grid-template-columns: minmax(120px, 1.4fr) minmax(110px, 1fr) 90px 110px 56px 110px 120px; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); font-size: 12.5px; }
.pma__row.is-advanced { grid-template-columns: minmax(120px, 1.4fr) minmax(110px, 1fr) 90px 110px 170px 140px 56px 110px 120px; }
.pma__row > .vg-pill, .pma__row > .vg-switch { justify-self: start; }
.pma__profit { font-variant-numeric: tabular-nums; color: var(--theme-text-muted); white-space: nowrap; }
.pma__profit.is-gain { color: var(--vg-green); font-weight: 600; }
.pma__profit.is-loss { color: var(--vg-red); font-weight: 600; }
.pma__profit small { font-weight: 400; color: var(--theme-text-muted); }
.pma__row--head { background: transparent; border-color: transparent; color: var(--theme-text-muted); font-size: 12px; padding-block: 2px; }
.pma__row.is-paused { opacity: 0.6; }
.pma__name { font-weight: 600; color: var(--theme-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pma__inline { display: inline-flex; align-items: center; gap: 4px; color: var(--theme-text-muted); }
.pma__num { width: 56px; }
.pma__sr { position: absolute; opacity: 0; width: 1px; height: 1px; }
.pma__adv { align-self: flex-start; font-size: 12.5px; }
.pma__warm { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: -2px 0 4px 18px; padding: 6px 10px; border-left: 2px solid var(--vg-amber, #d99a1e); border-radius: 0 var(--vg-radius-sm) var(--vg-radius-sm) 0; background: var(--theme-panel-soft); font-size: 12px; color: var(--theme-text); }
.pma__warm > svg { color: var(--vg-amber, #d99a1e); }
.pma__warm-label { font-weight: 600; }
.pma__warm-kw { flex: 1; min-width: 220px; }
.pma__warm-state { color: var(--theme-text-muted); }
.pma__warm-state.is-done { color: var(--vg-green); }
.pma__warm-state.is-failed { color: var(--vg-red); }
.pma__warm-now { align-self: flex-start; }
.pma__hint { margin: 0; font-size: 12px; line-height: 1.6; }
@media (max-width: 760px) {
  .pma__row, .pma__row.is-advanced { grid-template-columns: 1fr 1fr; }
  .pma__row--head { display: none; }
}
</style>
