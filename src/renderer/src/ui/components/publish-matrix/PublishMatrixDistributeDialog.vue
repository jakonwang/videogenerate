<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { AlertTriangle, Check, LoaderCircle, Network, Settings, X } from "lucide-vue-next";
import {
  expandMatrixItems,
  normalizeMatrixAccount,
  planMatrixSchedule,
  type MatrixAccountSettings,
} from "../../../../../shared/publishMatrix";

type Conn = { uid: string; name?: string };
const props = defineProps<{ open: boolean; taskIds: string[]; tasks: any[]; connections: Conn[] }>();
const emit = defineEmits<{ (e: "close"): void; (e: "done", result: any): void; (e: "manage-accounts"): void }>();

const settings = ref<Record<string, MatrixAccountSettings>>({});
const picked = ref<string[]>([]);
const startAt = ref("");
const varied = ref(true);
const videoVariants = ref(true);
const captionVariants = ref(true);
const showAdvanced = ref(false);
const busy = ref(false);
const error = ref("");

function localInput(at: number) {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmt(at: number) {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

watch(() => props.open, async (open) => {
  if (!open) return;
  error.value = "";
  startAt.value = localInput(Date.now() + 15 * 60_000);
  // 默认勾上源视频已经选的号
  const own = new Set(props.tasks.filter((t) => props.taskIds.includes(t.id)).map((t) => t.connectionUid).filter(Boolean));
  picked.value = props.connections.filter((c) => own.has(c.uid)).map((c) => c.uid);
  try {
    const list = await window.api.tiktokPublisher.matrixAccounts();
    settings.value = Object.fromEntries(list.map((s) => [s.uid, s]));
  } catch {
    settings.value = {};
  }
}, { immediate: true });

const accountOf = (uid: string) => settings.value[uid] || normalizeMatrixAccount(uid);
const nameOf = (uid: string) => props.connections.find((c) => c.uid === uid)?.name || uid;
const groups = computed(() => {
  const map = new Map<string, string[]>();
  for (const c of props.connections) {
    const g = accountOf(c.uid).group || "未分组";
    map.set(g, [...(map.get(g) || []), c.uid]);
  }
  return [...map.entries()].map(([name, uids]) => ({ name, uids }));
});

function toggle(uid: string) {
  picked.value = picked.value.includes(uid) ? picked.value.filter((u) => u !== uid) : [...picked.value, uid];
}
function toggleGroup(uids: string[]) {
  const all = uids.every((u) => picked.value.includes(u));
  picked.value = all ? picked.value.filter((u) => !uids.includes(u)) : [...new Set([...picked.value, ...uids])];
}
function toggleAll() {
  picked.value = picked.value.length === props.connections.length ? [] : props.connections.map((c) => c.uid);
}

const preview = computed(() => {
  if (!picked.value.length || !props.taskIds.length) return null;
  const requested = Date.parse(startAt.value);
  const start = Math.max(Number.isFinite(requested) ? requested : Date.now(), Date.now() + 10 * 60_000);
  const sourceSet = new Set(props.taskIds);
  const existing = props.tasks
    .filter((t) => !sourceSet.has(t.id) && t.connectionUid && picked.value.includes(t.connectionUid) && t.scheduleAt && !["failed", "cancelled"].includes(t.state))
    .map((t) => ({ uid: t.connectionUid, at: Date.parse(t.scheduleAt) }));
  const plan = planMatrixSchedule({
    items: expandMatrixItems(props.taskIds, picked.value),
    accounts: picked.value.map(accountOf),
    existing,
    startAt: start,
    random: () => 0,
  });
  const ats = plan.slots.map((s) => s.at);
  const perAccount = picked.value.map((uid) => {
    const mine = plan.slots.filter((s) => s.uid === uid).map((s) => s.at);
    const skip = plan.skipped.find((s) => s.uid === uid);
    return { uid, count: mine.length, first: mine[0], skip: skip?.reason };
  });
  return { total: plan.slots.length, first: ats.length ? Math.min(...ats) : 0, last: ats.length ? Math.max(...ats) : 0, perAccount, skipped: plan.skipped.length };
});

const productWarning = computed(() => {
  const withProduct = props.tasks.some((t) => props.taskIds.includes(t.id) && t.productId);
  return withProduct && picked.value.length > 1;
});

async function confirm() {
  if (!picked.value.length) { error.value = "请至少选一个账号"; return; }
  busy.value = true;
  error.value = "";
  try {
    const result = await window.api.tiktokPublisher.matrixDistribute({
      taskIds: [...props.taskIds],
      accounts: picked.value.map((uid) => ({ uid, name: nameOf(uid) })),
      startAt: new Date(startAt.value).toISOString(),
      videoVariants: varied.value && videoVariants.value,
      captionVariants: varied.value && captionVariants.value,
    });
    emit("done", result);
    emit("close");
  } catch (e: any) {
    error.value = String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
  } finally {
    busy.value = false;
  }
}

const reasonText = (reason?: string) => (reason === "paused" ? "已暂停，跳过" : reason === "no_slot" ? "60 天内排不下，跳过" : "");
</script>

<template>
  <div v-if="open" class="vg-scope vg-backdrop" @click.self="emit('close')">
    <section class="vg-dialog vg-dialog--wide pmd" role="dialog" aria-modal="true" aria-labelledby="pmd-title" data-testid="publish-matrix-distribute">
      <header class="vg-dialog__head">
        <div class="vg-dialog__title">
          <span class="vg-dialog__title-icon"><Network :size="20" /></span>
          <div>
            <h2 id="pmd-title">分发到多个号</h2>
            <p>已选 <b>{{ taskIds.length }}</b> 个视频，每个视频会发到每个勾选的号，自动错峰</p>
          </div>
        </div>
        <button type="button" class="vg-icon-btn" aria-label="关闭" @click="emit('close')"><X :size="18" /></button>
      </header>

      <div class="vg-dialog__body pmd__body">
        <section class="pmd__section">
          <div class="pmd__section-head">
            <h3>1. 选账号</h3>
            <span class="vg-toolbar__spacer" />
            <button type="button" class="vg-link" @click="toggleAll">{{ picked.length === connections.length ? "全不选" : "全选" }}</button>
            <button type="button" class="vg-link vg-link--muted pmd__rules" @click="emit('manage-accounts')"><Settings :size="12" />账号规则</button>
          </div>
          <p v-if="!connections.length" class="vg-muted pmd__empty">还没有发布账号。先在右上角连接 CreatOK 并授权 TikTok 账号。</p>
          <div v-for="group in groups" :key="group.name" class="pmd__group">
            <button v-if="groups.length > 1" type="button" class="pmd__group-name" @click="toggleGroup(group.uids)">
              {{ group.name }} <em>{{ group.uids.filter((u) => picked.includes(u)).length }}/{{ group.uids.length }}</em>
            </button>
            <div class="pmd__accounts">
              <button
                v-for="uid in group.uids"
                :key="uid"
                type="button"
                class="pmd__account"
                :class="{ 'is-on': picked.includes(uid), 'is-paused': accountOf(uid).paused }"
                :data-testid="`matrix-account-${uid}`"
                @click="toggle(uid)"
              >
                <span class="pmd__check"><Check v-if="picked.includes(uid)" :size="12" /></span>
                <span class="pmd__account-name">{{ nameOf(uid) }}</span>
                <small v-if="accountOf(uid).paused">暂停中</small>
                <small v-else>每天 ≤{{ accountOf(uid).dailyLimit }} 条</small>
              </button>
            </div>
          </div>
        </section>

        <section class="pmd__section">
          <h3>2. 从什么时候开始发</h3>
          <input v-model="startAt" class="vg-input pmd__time" type="datetime-local" data-testid="matrix-start-at" />
        </section>

        <section class="pmd__section">
          <label class="vg-switch pmd__switch" :class="{ 'is-on': varied }">
            <input v-model="varied" type="checkbox" class="pmd__sr" />
            <span class="vg-switch__track" />
            <span>
              <b>每个号用不同的版本（推荐）</b>
              <small>第一个号发原片；其他号的视频轻微调整画面和速度、文案用 AI 换个说法，避免被判重复内容</small>
            </span>
          </label>
          <button type="button" class="vg-link vg-link--muted pmd__adv" @click="showAdvanced = !showAdvanced">{{ showAdvanced ? "收起" : "高级设置" }}</button>
          <div v-if="showAdvanced && varied" class="pmd__adv-body">
            <label class="pmd__check-line"><input v-model="videoVariants" type="checkbox" />调整视频（需要在电脑上重新编码，每条几十秒）</label>
            <label class="pmd__check-line"><input v-model="captionVariants" type="checkbox" />AI 改写标题和描述（话题标签保留，会消耗少量点数）</label>
          </div>
        </section>

        <section v-if="preview" class="pmd__preview" data-testid="matrix-preview">
          <p>
            将生成 <b>{{ preview.total }}</b> 条发布任务
            <template v-if="preview.total">· {{ fmt(preview.first) }} 开始，{{ fmt(preview.last) }} 发完</template>
          </p>
          <ul>
            <li v-for="row in preview.perAccount" :key="row.uid" :class="{ 'is-skip': row.skip }">
              <span class="pmd__account-name">{{ nameOf(row.uid) }}</span>
              <span v-if="row.skip">{{ reasonText(row.skip) }}</span>
              <span v-else>{{ row.count }} 条 · 第一条 {{ fmt(row.first!) }}</span>
            </li>
          </ul>
          <small class="vg-muted">实际时间会再随机错开几分钟。</small>
        </section>

        <p v-if="productWarning" class="vg-notice pmd__warn"><AlertTriangle :size="14" />不同店铺的号商品不通用。分发后按账号筛选，检查每个号的「关联商品」。</p>
        <p v-if="error" class="vg-notice vg-notice--danger">{{ error }}</p>
      </div>

      <footer class="vg-dialog__foot">
        <span class="vg-muted">已选 {{ picked.length }} 个号</span>
        <div class="vg-dialog__foot-actions">
          <button type="button" class="vg-btn" @click="emit('close')">取消</button>
          <button type="button" class="vg-btn vg-btn--primary" :disabled="busy || !picked.length || !preview?.total" data-testid="matrix-confirm" @click="confirm">
            <LoaderCircle v-if="busy" :size="14" class="vg-spin" />确认分发
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.pmd__body { display: flex; flex-direction: column; gap: 16px; }
.pmd__section { display: flex; flex-direction: column; gap: 8px; }
.pmd__section h3 { margin: 0; font-size: 13.5px; font-weight: 700; color: var(--theme-text); }
.pmd__section-head { display: flex; align-items: center; gap: 12px; }
.pmd__rules { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.pmd__empty { margin: 0; font-size: 12.5px; }
.pmd__group { display: flex; flex-direction: column; gap: 6px; }
.pmd__group-name { align-self: flex-start; padding: 0; border: 0; background: none; color: var(--theme-text-muted); font-size: 12px; font-weight: 600; cursor: pointer; }
.pmd__group-name em { font-style: normal; margin-left: 4px; }
.pmd__accounts { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px; }
.pmd__account { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); color: var(--theme-text); text-align: left; cursor: pointer; font-size: 12.5px; }
.pmd__account.is-on { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); }
.pmd__account.is-paused { opacity: 0.6; }
.pmd__account small { color: var(--theme-text-muted); font-size: 11px; }
.pmd__account-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.pmd__check { width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--theme-border-control); border-radius: 4px; color: var(--vg-accent); }
.pmd__account.is-on .pmd__check { border-color: var(--vg-accent-line); }
.pmd__time { max-width: 260px; }
.pmd__switch { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
.pmd__switch b { display: block; font-size: 13px; color: var(--theme-text); }
.pmd__switch small { display: block; margin-top: 2px; font-size: 12px; color: var(--theme-text-muted); line-height: 1.5; }
.pmd__sr { position: absolute; opacity: 0; width: 1px; height: 1px; }
.pmd__adv { align-self: flex-start; font-size: 12px; }
.pmd__adv-body { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border-radius: var(--vg-radius-sm); background: var(--theme-panel-soft); }
.pmd__check-line { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--theme-text); }
.pmd__preview { padding: 10px 12px; border: 1px solid var(--vg-accent-line); border-radius: var(--vg-radius-sm); background: var(--vg-accent-soft); font-size: 12.5px; }
.pmd__preview p { margin: 0 0 6px; color: var(--theme-text); }
.pmd__preview ul { list-style: none; margin: 0 0 4px; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 140px; overflow-y: auto; }
.pmd__preview li { display: flex; justify-content: space-between; gap: 12px; color: var(--theme-text-muted); }
.pmd__preview li.is-skip { color: var(--theme-danger, #d14343); }
.pmd__warn { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12.5px; }
</style>
