<script lang="ts">
// Creatives page of the GMV MAX workspace. State and handlers come from TiktokGmvMaxOptimizerView via provide/inject.
// Default view answers one question at a glance: which videos make money and which only spend.
// Segments come from the ad data itself (see listCreativeMetricAggregatePage), so they work before costs are entered.
// Funnel, experiment pool, creator view, allow/deny lists and the full suggestion history sit under "advanced".
import { computed, defineComponent, onBeforeUnmount, ref, watch } from "vue";
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Film,
  Filter,
  Flame,
  Inbox,
  Play,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  X,
} from "lucide-vue-next";
import { useGmvWorkspace } from "./workspaceContext";
import GmvCreativePushDialog, { type GmvCreativePushResult, type GmvCreativePushRow } from "../GmvCreativePushDialog.vue";

type Segment = "all" | "earning" | "average" | "no_orders" | "new";
const SEGMENTS: Segment[] = ["all", "earning", "average", "no_orders", "new"];
const SEGMENT_TONE: Record<Exclude<Segment, "all">, string> = {
  earning: "good",
  average: "neutral",
  no_orders: "critical",
  new: "info",
};

type CreativeRow = {
  campaignId: string;
  creativeId: string;
  itemGroupId?: string;
  storeId: string;
  source?: string;
  creativeName?: string;
  creatorName?: string;
  productName?: string;
  productImageUrl?: string;
  cost: string;
  grossRevenue: string;
  roi: string;
  orders: string;
  days?: number;
  campaignName?: string;
  status?: string;
  segment?: Exclude<Segment, "all">;
  raw?: Record<string, unknown>;
};

export default defineComponent({
  name: "GmvCreativesPage",
  components: {
    GmvCreativePushDialog,
    AlertTriangle,
    ArrowRightLeft,
    Check,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Film,
    Filter,
    Flame,
    Inbox,
    Play,
    RotateCcw,
    ShieldAlert,
    SlidersHorizontal,
    Trash2,
    TrendingUp,
    X,
  },
  setup() {
    const ws = useGmvWorkspace();
    const showSuggestions = ref(false);
    const expandedRow = ref("");

    const totalsStore = computed(() =>
      ws.selectedStore.value !== "all" ? ws.selectedStore.value : ws.uniqueStores.value[0]?.storeId,
    );

    // Segment counts and totals for the whole scope; kept from the last answer while a new page loads.
    const lastSegments = ref<Record<string, number> | null>(null);
    const lastOverall = ref<{ count: number; cost: number; revenue: number; orders: number; roi: number } | null>(null);
    watch(
      () => ws.creativePage.value,
      (page: { segments?: Record<string, number>; overall?: typeof lastOverall.value }) => {
        if (page?.segments) lastSegments.value = page.segments;
        if (page?.overall) lastOverall.value = page.overall;
      },
      { immediate: true },
    );
    function segmentCount(key: Segment) {
      if (key === "all") return lastOverall.value?.count ?? null;
      return lastSegments.value ? lastSegments.value[key] ?? 0 : null;
    }

    const activeSegment = computed<Segment>(() =>
      SEGMENTS.includes(ws.creativeSegment.value) ? (ws.creativeSegment.value as Segment) : "all",
    );
    function selectSegment(key: Segment) {
      ws.creativeSegment.value = key;
      ws.creativeState.value = "all";
      // Wasted spend reads best biggest-first; everything else by revenue.
      ws.creativeSortBy.value = key === "no_orders" ? "cost" : "grossRevenue";
      ws.creativeSortDirection.value = "desc";
      expandedRow.value = "";
      void ws.loadCreativePage(1);
    }
    function showSegment(key: Segment) {
      selectSegment(key);
      document.querySelector('[data-testid="gmv-creative-list"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    function reload() {
      expandedRow.value = "";
      void ws.loadCreativePage(1);
    }

    // The two at-a-glance lists: top earners by revenue and the biggest spend without orders.
    const topEarners = ref<CreativeRow[]>([]);
    const topWasters = ref<CreativeRow[]>([]);
    const topsLoading = ref(false);
    let topsRequest = 0;
    const topsScope = computed(() =>
      JSON.stringify({
        startDate: ws.startDate.value,
        endDate: ws.endDate.value,
        storeId: ws.selectedStore.value,
        campaignId: ws.creativeCampaign.value,
        source: ws.creativeSource.value,
        search: ws.searchText.value,
        loaded: ws.creativePage.value?.startDate,
      }),
    );
    async function loadTops() {
      const request = ++topsRequest;
      topsLoading.value = true;
      const base = {
        page: 1,
        pageSize: 10,
        startDate: ws.startDate.value,
        endDate: ws.endDate.value,
        storeId: ws.selectedStore.value,
        campaignId: ws.creativeCampaign.value,
        source: ws.creativeSource.value,
        search: ws.searchText.value,
        sortDirection: "desc" as const,
      };
      try {
        const [earners, wasters] = await Promise.all([
          window.api.tiktokGmvMax.getCreativePage({ ...base, segment: "earning", sortBy: "grossRevenue" }),
          window.api.tiktokGmvMax.getCreativePage({ ...base, segment: "no_orders", sortBy: "cost" }),
        ]);
        if (request !== topsRequest) return;
        topEarners.value = ((earners as { items?: CreativeRow[] })?.items || []).slice(0, 3);
        topWasters.value = ((wasters as { items?: CreativeRow[] })?.items || []).slice(0, 3);
      } catch {
        if (request !== topsRequest) return;
        topEarners.value = [];
        topWasters.value = [];
      } finally {
        if (request === topsRequest) topsLoading.value = false;
      }
    }
    let topsTimer: ReturnType<typeof setTimeout> | undefined;
    watch(topsScope, () => {
      clearTimeout(topsTimer);
      topsTimer = setTimeout(() => void loadTops(), 250);
    }, { immediate: true });
    onBeforeUnmount(() => clearTimeout(topsTimer));

    const summaryLine = computed(() => {
      const overall = lastOverall.value;
      if (!overall) return "";
      return ws.t("gmvMaxCreativesSimple.summaryLine", {
        count: ws.formatInteger(overall.count),
        spend: ws.formatCny(overall.cost, totalsStore.value),
        revenue: ws.formatCny(overall.revenue, totalsStore.value),
        roi: overall.cost > 0 ? ws.formatRoi(overall.roi) : "—",
        orders: ws.formatInteger(overall.orders),
      });
    });

    const pendingSuggestions = computed(() =>
      (ws.creativeActionQueue.value as Array<{ status: string }>).filter((item) => item.status === "pending"),
    );
    const setupMissing = computed(
      () => Number(ws.incompleteCreativeCostCount.value) > 0 || Number(ws.missingCreativeTestBudgetCount.value) > 0,
    );

    // Spend bar: share of the largest spend on this page, in CNY so mixed-currency stores compare fairly.
    const maxPageSpend = computed(() =>
      Math.max(0, ...(ws.filteredCreatives.value as CreativeRow[]).map((item) => spendCny(item))),
    );
    function spendCny(item: CreativeRow) {
      const converted = ws.convertToCny(item.cost, item.storeId);
      return converted === null ? ws.metricNumber(item.cost) : converted;
    }
    function spendShare(item: CreativeRow) {
      return maxPageSpend.value > 0 ? Math.max(2, Math.round((spendCny(item) / maxPageSpend.value) * 100)) : 0;
    }
    function segmentTone(item: CreativeRow) {
      return item.segment ? SEGMENT_TONE[item.segment] : "neutral";
    }

    function rowKey(item: { campaignId: string; creativeId: string; itemGroupId?: string }) {
      return `${item.campaignId}:${item.creativeId}:${item.itemGroupId || "unscoped"}`;
    }
    function toggleRow(key: string) {
      expandedRow.value = expandedRow.value === key ? "" : key;
    }

    // Synced video assets carry cover, caption and the posting account under raw; metrics alone only have the ID.
    const brokenImages = ref(new Set<string>());
    const record = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
    function httpUrl(...values: unknown[]) {
      return values.map((value) => String(value || "").trim()).find((value) => /^https?:\/\//i.test(value)) || "";
    }
    function coverUrl(item: CreativeRow) {
      const raw = record(item.raw);
      const video = record(raw.video_info);
      const url = httpUrl(video.video_cover_url, raw.video_cover_url, video.poster_url, raw.poster_url, raw.cover_url);
      return url && !brokenImages.value.has(url) ? url : "";
    }
    // TikTok only returns real covers for a few videos; the product being sold is the next best picture.
    function productImage(item: CreativeRow) {
      const url = httpUrl(item.productImageUrl);
      return !coverUrl(item) && url && !brokenImages.value.has(url) ? url : "";
    }
    function markBroken(url: string) {
      brokenImages.value = new Set(brokenImages.value).add(url);
    }
    function shortId(id: string) {
      return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
    }
    // Product-card entries carry a "product-card:<id>" creative ID; name them as product cards, not videos.
    function idLabel(item: CreativeRow) {
      const match = /^product-card:(.+)$/.exec(item.creativeId);
      if (match) return `${ws.t("gmvMaxCreativesSimple.sources.product_card")} ${shortId(match[1])}`;
      return ws.t("gmvMaxCreativesSimple.untitled", { id: shortId(item.creativeId) });
    }
    // Title: the caption when TikTok gave one, otherwise the short video ID (product goes on the second line).
    function videoTitle(item: CreativeRow) {
      const caption = String(record(item.raw).text || "").replace(/\s+/g, " ").trim();
      if (caption) return caption;
      const name = String(item.creativeName || "").trim();
      if (name && name !== item.creativeId) return name;
      return idLabel(item);
    }
    // Product names are long marketing titles; keep the part before the first separator.
    function productShort(item: CreativeRow) {
      const name = String(item.productName || "").trim();
      if (!name || name === "-" || /^\d+$/.test(name)) return "";
      const head = name.replace(/^\[[^\]]*\]\s*/, "").split(/\s[-–|]\s|,|，/)[0].trim();
      return head.length > 28 ? `${head.slice(0, 28)}…` : head;
    }
    function creatorLabel(item: CreativeRow) {
      const name = String(item.creatorName || "").trim();
      if (name && name !== "-") return name;
      const identity = String(record(record(item.raw).identity_info).display_name || "").trim();
      if (identity) return identity;
      const source = String(item.source || "");
      return ["owned", "affiliate", "product_card"].includes(source)
        ? ws.t(`gmvMaxCreativesSimple.sources.${source}`)
        : ws.t("gmvMaxCreativesSimple.unknownCreator");
    }
    function subtitle(item: CreativeRow) {
      return [productShort(item), creatorLabel(item), ws.t("gmvMaxCreativesSimple.days", { count: ws.formatInteger(item.days || 0) })]
        .filter(Boolean)
        .join(" · ");
    }
    function topLabel(item: CreativeRow) {
      const product = productShort(item);
      const id = item.creativeId.startsWith("product-card:") ? idLabel(item) : shortId(item.creativeId);
      return product ? `${id} · ${product}` : id;
    }

    // ---- Exclude / restore and push to TikTok ----
    const MAX_PUSH = 25;
    const selected = ref(new Map<string, CreativeRow>());
    const selectionNotice = ref("");
    function isSelected(item: CreativeRow) {
      return selected.value.has(rowKey(item));
    }
    function toggleSelect(item: CreativeRow) {
      const next = new Map(selected.value);
      selectionNotice.value = "";
      if (next.has(rowKey(item))) next.delete(rowKey(item));
      else if (next.size >= MAX_PUSH) selectionNotice.value = ws.t("gmvMaxCreativesSimple.push.limit", { count: MAX_PUSH });
      else next.set(rowKey(item), item);
      selected.value = next;
    }
    const pageRows = computed(() => (ws.filteredCreatives.value as CreativeRow[]).filter((item) => rowPush(item).action === "exclude"));
    const allPageSelected = computed(() => pageRows.value.length > 0 && pageRows.value.every((item) => selected.value.has(rowKey(item))));
    function toggleSelectPage() {
      const next = new Map(selected.value);
      selectionNotice.value = "";
      if (allPageSelected.value) pageRows.value.forEach((item) => next.delete(rowKey(item)));
      else {
        for (const item of pageRows.value) {
          if (next.size >= MAX_PUSH) {
            selectionNotice.value = ws.t("gmvMaxCreativesSimple.push.limit", { count: MAX_PUSH });
            break;
          }
          next.set(rowKey(item), item);
        }
      }
      selected.value = next;
    }
    function clearSelection() {
      selected.value = new Map();
      selectionNotice.value = "";
    }

    // Latest manual or automatic creative change per campaign + video, from the recommendations the view already holds.
    type PushState = { operation: "REMOVE" | "ADD"; state: "pending" | "failed" | "done"; error?: string; at: number };
    const pushStates = computed(() => {
      const map = new Map<string, PushState>();
      for (const rec of (ws.dashboard.value?.recommendations || []) as Array<Record<string, any>>) {
        if (rec.actionType !== "creative") continue;
        const operation = String(rec.actionPayload?.operation || "").toUpperCase();
        if (operation !== "REMOVE" && operation !== "ADD") continue;
        const ids: string[] = Array.isArray(rec.actionPayload?.creativeIds)
          ? rec.actionPayload.creativeIds.map(String)
          : rec.actionPayload?.creativeId ? [String(rec.actionPayload.creativeId)] : [];
        let state: PushState["state"] | "" = "";
        if (rec.status === "failed") state = "failed";
        else if (["approved", "executing"].includes(rec.status) || (rec.status === "executed" && !rec.platformStateVerified)) state = "pending";
        else if (rec.status === "executed") state = "done";
        if (!state) continue;
        const at = Number(rec.updatedAt) || 0;
        for (const id of ids) {
          const key = `${rec.campaignId}:${id}`;
          const current = map.get(key);
          if (!current || current.at < at) map.set(key, { operation: operation as PushState["operation"], state, error: rec.lastError, at });
        }
      }
      return map;
    });
    const pausedCampaigns = computed(
      () =>
        new Set(
          ((ws.dashboard.value?.campaigns || []) as Array<{ id: string; operationStatus?: string }>)
            .filter((campaign) => String(campaign.operationStatus || "").toUpperCase() !== "ENABLE")
            .map((campaign) => campaign.id),
        ),
    );
    // What the row shows: its TikTok state and the one action that makes sense next.
    function rowPush(item: CreativeRow) {
      const latest = pushStates.value.get(`${item.campaignId}:${item.creativeId}`);
      const reportedExcluded = String(item.status || "").toUpperCase() === "EXCLUDED";
      if (latest?.state === "pending") {
        return { tag: latest.operation === "REMOVE" ? "excluding" : "restoring", tone: "warning", action: "", error: "" };
      }
      // A paused campaign spends nothing, and TikTok refuses creative changes in it.
      if (pausedCampaigns.value.has(item.campaignId)) {
        return { tag: "paused", tone: "neutral", action: "", error: "" };
      }
      const excluded = latest?.state === "done" ? latest.operation === "REMOVE" : reportedExcluded;
      const failed = latest?.state === "failed";
      return {
        tag: failed ? "failed" : excluded ? "excluded" : "",
        tone: failed ? "critical" : "neutral",
        action: excluded ? "restore" : "exclude",
        error: failed ? latest?.error || "" : "",
      };
    }

    const pushDialog = ref<{
      operation: "REMOVE" | "ADD";
      rows: GmvCreativePushRow[];
      items: CreativeRow[];
      summary: string;
      phase: "confirm" | "running" | "done";
      results: GmvCreativePushResult[];
      error: string;
    } | null>(null);
    function openPush(operation: "REMOVE" | "ADD", items: CreativeRow[]) {
      if (!items.length) return;
      const spend = items.reduce((sum, item) => sum + spendCny(item), 0);
      const orders = items.reduce((sum, item) => sum + ws.metricNumber(item.orders), 0);
      pushDialog.value = {
        operation,
        items,
        rows: items.map((item) => ({
          key: rowKey(item),
          campaignId: item.campaignId,
          creativeId: item.creativeId,
          title: topLabel(item),
          campaignName: item.campaignName || item.campaignId,
          spend: ws.formatCny(item.cost, item.storeId),
        })),
        summary: ws.t("gmvMaxCreativesSimple.push.totals", { spend: ws.formatCny(spend, undefined, true), orders: ws.formatInteger(orders) }),
        phase: "confirm",
        results: [],
        error: ws.connected.value ? "" : ws.t("gmvMaxCreativesSimple.push.notConnected"),
      };
    }
    async function confirmPush() {
      const dialog = pushDialog.value;
      if (!dialog || dialog.phase !== "confirm") return;
      dialog.phase = "running";
      dialog.error = "";
      try {
        const response = (await window.api.tiktokGmvMax.pushCreativeChanges({
          operation: dialog.operation,
          items: dialog.items.map((item) => ({ campaignId: item.campaignId, creativeId: item.creativeId, label: topLabel(item) })),
        })) as { results?: GmvCreativePushResult[] };
        dialog.results = (response?.results || []).map((result) => ({ ...result, error: result.error ? pushErrorText(result.error) : undefined }));
        if (dialog.results.some((result) => result.status === "pushed")) clearSelection();
      } catch (error) {
        dialog.error = pushErrorText(error instanceof Error ? error.message : String(error));
      } finally {
        dialog.phase = "done";
        void ws.refreshWorkspace(false);
        void ws.loadCreativePage(ws.creativePage.value.page);
      }
    }
    function closePush() {
      if (pushDialog.value?.phase === "running") return;
      pushDialog.value = null;
    }
    // Detail panel helpers.
    const copiedId = ref("");
    let copiedTimer: ReturnType<typeof setTimeout> | undefined;
    async function copyText(value: string) {
      try {
        await navigator.clipboard.writeText(value);
        copiedId.value = value;
        clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => (copiedId.value = ""), 1500);
      } catch {
        copiedId.value = "";
      }
    }
    onBeforeUnmount(() => clearTimeout(copiedTimer));
    // Authorization is often empty ("-") in the report; only show it when TikTok said something.
    function authLabel(item: CreativeRow & { authorizationType?: string; authorizationStatus?: string }) {
      const parts = [item.authorizationType, item.authorizationStatus].map((value) => String(value || "").trim()).filter((value) => value && value !== "-");
      return parts.join(" ");
    }

    // TikTok and guard errors in words a seller can act on.
    function pushErrorText(message: string) {
      if (/GMV_MAX_ACTION_PENDING_VERIFICATION/.test(message)) return ws.t("gmvMaxCreativesSimple.push.errors.locked");
      if (/GMV_MAX_CAMPAIGN_NOT_ENABLED|Campaign is not enabled/i.test(message)) return ws.t("gmvMaxCreativesSimple.push.errors.paused");
      if (/emergency stop/i.test(message)) return ws.t("gmvMaxCreativesSimple.push.errors.emergency");
      if (/capability is unavailable|creative_write/i.test(message)) return ws.t("gmvMaxCreativesSimple.push.errors.permission");
      if (/authorization is required|AUTH_EXPIRED/i.test(message)) return ws.t("gmvMaxCreativesSimple.push.notConnected");
      return message;
    }

    // Plain-language name of a creative suggestion.
    function suggestionLabel(item: { actionType?: string; actionPayload?: Record<string, unknown> }) {
      if (String(item.actionType) === "session") return ws.t("gmvMaxCreativesSimple.operation.BOOST");
      const operation = String(item.actionPayload?.operation || "REMOVE").toUpperCase();
      return ["ADD", "REMOVE", "ROTATE"].includes(operation)
        ? ws.t(`gmvMaxCreativesSimple.operation.${operation}`)
        : operation;
    }
    function suggestionTarget(item: { actionPayload?: Record<string, unknown> }) {
      const payload = item.actionPayload || {};
      if (String(payload.operation).toUpperCase() === "ROTATE")
        return `${String(payload.removeCreativeId || "-")} → ${String(payload.addCreativeId || "-")}`;
      return String(payload.creativeId || "-");
    }

    return {
      ...ws,
      SEGMENTS,
      activeSegment,
      coverUrl,
      expandedRow,
      markBroken,
      pendingSuggestions,
      productImage,
      reload,
      rowKey,
      segmentCount,
      segmentTone,
      selectSegment,
      setupMissing,
      showSegment,
      showSuggestions,
      spendShare,
      subtitle,
      suggestionLabel,
      suggestionTarget,
      summaryLine,
      toggleRow,
      topEarners,
      topLabel,
      topWasters,
      topsLoading,
      videoTitle,
      allPageSelected,
      authLabel,
      copiedId,
      copyText,
      clearSelection,
      closePush,
      confirmPush,
      isSelected,
      openPush,
      pushDialog,
      rowPush,
      selected,
      selectionNotice,
      toggleSelect,
      toggleSelectPage,
    };
  },
});
</script>

<template>
<section class="gmv-section gmv-dash-page gmv-am gmv-cx" data-testid="gmv-creatives-page">
  <!-- 1. At a glance: what earns, what only spends -->
  <div class="gmv-cx-tops" data-testid="gmv-creative-tops">
    <section class="gmv-cx-top" data-testid="gmv-creative-top-earners">
      <header>
        <span class="gmv-cx-top__title gvt-good"><TrendingUp class="gmv-icon" />{{ t("gmvMaxCreativesSimple.tops.earners") }}</span>
        <button class="gmv-cx-link" type="button" @click="showSegment('earning')">{{ t("gmvMaxCreativesSimple.tops.all") }}</button>
      </header>
      <ol v-if="topEarners.length">
        <li v-for="(item, index) in topEarners" :key="rowKey(item)">
          <span class="gmv-cx-top__rank">{{ index + 1 }}</span>
          <span class="gmv-cx-top__name" :title="item.productName">{{ topLabel(item) }}</span>
          <span class="gmv-cx-top__value">
            ROI {{ formatRoi(item.roi) }} · {{ formatCny(item.grossRevenue, item.storeId) }}
          </span>
        </li>
      </ol>
      <p v-else class="gmv-cx-top__empty">
        {{ topsLoading ? t("gmvMaxData.loadingPage") : t("gmvMaxCreativesSimple.tops.noEarners") }}
      </p>
    </section>
    <section class="gmv-cx-top is-waste" data-testid="gmv-creative-top-wasters">
      <header>
        <span class="gmv-cx-top__title gvt-critical"><Flame class="gmv-icon" />{{ t("gmvMaxCreativesSimple.tops.wasters") }}</span>
        <button class="gmv-cx-link" type="button" @click="showSegment('no_orders')">{{ t("gmvMaxCreativesSimple.tops.all") }}</button>
      </header>
      <ol v-if="topWasters.length">
        <li v-for="(item, index) in topWasters" :key="rowKey(item)">
          <span class="gmv-cx-top__rank">{{ index + 1 }}</span>
          <span class="gmv-cx-top__name" :title="item.productName">{{ topLabel(item) }}</span>
          <span class="gmv-cx-top__value is-waste">
            {{ t("gmvMaxCreativesSimple.tops.spentNoOrders", { spend: formatCny(item.cost, item.storeId) }) }}
          </span>
        </li>
      </ol>
      <p v-else class="gmv-cx-top__empty">
        {{ topsLoading ? t("gmvMaxData.loadingPage") : t("gmvMaxCreativesSimple.tops.noWasters") }}
      </p>
    </section>
  </div>

  <!-- 2. Segment chips + one-line summary; suggestions and setup as quiet links -->
  <div class="gmv-cx-list" data-testid="gmv-creative-list">
    <div class="gmv-cx-bar">
      <div class="gmv-cx-chips" role="group" :aria-label="t('gmvMaxCreativesSimple.tabs.label')" data-testid="gmv-creative-status-tabs">
        <button
          v-for="key in SEGMENTS"
          :key="key"
          type="button"
          :class="['gmv-cx-chip', key !== 'all' ? `gvt-${key === 'earning' ? 'good' : key === 'no_orders' ? 'critical' : key === 'new' ? 'info' : 'neutral'}` : '', { 'is-active': activeSegment === key }]"
          :data-testid="`gmv-creative-tab-${key}`"
          :title="t(`gmvMaxCreativesSimple.segments.${key}Hint`)"
          @click="selectSegment(key)"
        >
          <i v-if="key !== 'all'" class="gmv-cx-chip__dot"></i>{{ t(`gmvMaxCreativesSimple.segments.${key}`) }}
          <em v-if="segmentCount(key) !== null">{{ formatInteger(segmentCount(key)) }}</em>
        </button>
      </div>
      <div class="gmv-am__spacer"></div>
      <button
        v-if="pendingSuggestions.length"
        class="gmv-cx-link"
        type="button"
        data-testid="gmv-creative-review-suggestions"
        @click="showSuggestions = !showSuggestions"
      >
        <Inbox class="gmv-icon" />{{ t("gmvMaxCreativesSimple.suggestionsLink", { count: pendingSuggestions.length }) }}
      </button>
      <button
        v-else
        class="gmv-cx-link"
        type="button"
        data-testid="gmv-optimize-creatives"
        :disabled="!connected || !!busyAction"
        @click="optimizeCreatives"
      >
        <Inbox class="gmv-icon" />{{
          busyAction === "optimize-creatives" ? t("gmvMaxCreativesSimple.todo.generating") : t("gmvMaxCreativesSimple.todo.generate")
        }}
      </button>
      <button
        v-if="setupMissing"
        class="gmv-cx-link is-warning"
        type="button"
        data-testid="gmv-creative-open-setup"
        :title="t('gmvMaxCreativesSimple.todo.setupHint', { costs: incompleteCreativeCostCount, budgets: missingCreativeTestBudgetCount })"
        @click="activeTab = 'rules'"
      >
        <AlertTriangle class="gmv-icon" />{{ t("gmvMaxCreativesSimple.setupLink") }}
      </button>
      <select v-model="creativeSource" class="gmv-cx-select" :aria-label="t('gmvMaxCreativesSimple.source')" @change="reload">
        <option v-for="source in ['all', 'owned', 'affiliate', 'product_card']" :key="source" :value="source">
          {{ t(`gmvMaxCreativesSimple.sources.${source}`) }}
        </option>
      </select>
    </div>
    <p v-if="summaryLine" class="gmv-cx-summary" data-testid="gmv-creative-summary">{{ summaryLine }}</p>

    <!-- Pending suggestions, opened from the link above -->
    <section v-if="showSuggestions && pendingSuggestions.length" class="gmv-dcard gmv-cx-suggestions" data-testid="gmv-creative-suggestions">
      <header>
        <strong>{{ t("gmvMaxCreativesSimple.suggestions.title") }}</strong>
        <small>{{ t("gmvMaxCreativesSimple.suggestions.hint") }}</small>
      </header>
      <div v-for="item in pendingSuggestions" :key="item.id" class="gmv-cx-suggestion">
        <div class="gmv-cx-suggestion__main">
          <strong>{{ suggestionLabel(item) }}</strong>
          <span>{{ suggestionTarget(item) }} · {{ campaignName(item.campaignId) }}</span>
          <small v-if="item.reason">{{ item.reason }}</small>
        </div>
        <div class="gmv-cx-suggestion__actions">
          <button class="gmv-button gmv-button--secondary" @click="openAction(item.id)">{{ t("gmvMaxCreativesSimple.actions.detail") }}</button>
          <button class="gmv-button gmv-button--secondary" :disabled="!!busyAction" @click="reject(item.id)">{{ t("gmvMaxCreativesSimple.actions.ignore") }}</button>
          <button class="gmv-button gmv-button--primary" :disabled="!!busyAction" @click="approve(item.id)">
            <Check class="gmv-icon" />{{ t("gmvMaxCreativesSimple.actions.accept") }}
          </button>
        </div>
      </div>
    </section>

    <!-- Bulk bar: shown while videos are selected -->
    <div v-if="selected.size" class="gmv-cx-bulk" data-testid="gmv-creative-bulk-bar">
      <strong>{{ t("gmvMaxCreativesSimple.push.selected", { count: selected.size }) }}</strong>
      <span v-if="selectionNotice" class="gmv-cx-bulk__notice">{{ selectionNotice }}</span>
      <div class="gmv-am__spacer"></div>
      <button class="gmv-cx-link" type="button" @click="clearSelection">{{ t("gmvMaxCreativesSimple.push.clear") }}</button>
      <button class="gmv-cx-danger-button" type="button" data-testid="gmv-creative-bulk-exclude" @click="openPush('REMOVE', [...selected.values()])">
        {{ t("gmvMaxCreativesSimple.push.bulkExclude") }}
      </button>
    </div>

    <!-- 3. The list -->
    <div :class="['gmv-table-wrap', { 'is-loading': creativeLoading }]">
      <table class="gmv-table gmv-cx-table">
        <thead>
          <tr>
            <th class="gmv-cx-table__check">
              <input
                type="checkbox"
                :checked="allPageSelected"
                :aria-label="t('gmvMaxCreativesSimple.push.selectPage')"
                :title="t('gmvMaxCreativesSimple.push.selectPage')"
                data-testid="gmv-creative-select-page"
                @change="toggleSelectPage"
              />
            </th>
            <th>{{ t("gmvMaxCreativesSimple.columns.video") }}</th>
            <th class="gmv-cx-table__spend">
              <button class="gmv-sort-button" @click="toggleCreativeSort('cost')">
                {{ t("gmvMaxCreativesSimple.columns.spendShare") }}<small>{{ sortMark("cost", creativeSortBy, creativeSortDirection) }}</small>
              </button>
            </th>
            <th class="is-num">
              <button class="gmv-sort-button" @click="toggleCreativeSort('grossRevenue')">
                {{ t("gmvMaxCreativesSimple.kpi.revenue") }}<small>{{ sortMark("grossRevenue", creativeSortBy, creativeSortDirection) }}</small>
              </button>
            </th>
            <th class="is-num">
              <button class="gmv-sort-button" @click="toggleCreativeSort('roi')">
                ROI<small>{{ sortMark("roi", creativeSortBy, creativeSortDirection) }}</small>
              </button>
            </th>
            <th class="is-num">
              <button class="gmv-sort-button" @click="toggleCreativeSort('orders')">
                {{ t("gmvMaxCreativesSimple.kpi.orders") }}<small>{{ sortMark("orders", creativeSortBy, creativeSortDirection) }}</small>
              </button>
            </th>
            <th class="gmv-cx-table__actions"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="item in filteredCreatives" :key="rowKey(item)">
            <tr
              :class="['gmv-cx-row', { 'is-expanded': expandedRow === rowKey(item), 'is-selected': isSelected(item), 'is-excluded': rowPush(item).tag === 'excluded' }]"
              @click="toggleRow(rowKey(item))"
            >
              <td class="gmv-cx-table__check" @click.stop>
                <input
                  v-if="rowPush(item).action === 'exclude'"
                  type="checkbox"
                  :checked="isSelected(item)"
                  :aria-label="t('gmvMaxCreativesSimple.push.selectRow')"
                  data-testid="gmv-creative-select-row"
                  @change="toggleSelect(item)"
                />
              </td>
              <td>
                <div class="gmv-cx-video">
                  <button
                    class="gmv-cx-video__thumb"
                    type="button"
                    :disabled="!creativeVideoAvailable(item)"
                    data-testid="gmv-creative-video-preview-button"
                    :title="creativeVideoAvailable(item) ? t('gmvMaxVideoPreview.open') : ''"
                    @click.stop="openCreativeVideo(item)"
                  >
                    <img v-if="coverUrl(item)" :src="coverUrl(item)" alt="" loading="lazy" referrerpolicy="no-referrer" @error="markBroken(coverUrl(item))" />
                    <img
                      v-else-if="productImage(item)"
                      :src="productImage(item)"
                      :alt="t('gmvMaxCreativesSimple.productBadge')"
                      :title="t('gmvMaxCreativesSimple.productImageHint')"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                      class="is-product"
                      @error="markBroken(productImage(item))"
                    />
                    <Film v-else class="gmv-cx-video__placeholder" />
                    <Play v-if="creativeVideoAvailable(item)" class="gmv-cx-video__play" />
                  </button>
                  <div class="gmv-cx-video__text">
                    <span class="gmv-cx-video__title" :title="videoTitle(item)">
                      {{ videoTitle(item) }}
                      <em
                        v-if="rowPush(item).tag"
                        :class="['gmv-cx-tag', `gvt-${rowPush(item).tone}`]"
                        :title="rowPush(item).error || t(`gmvMaxCreativesSimple.push.tags.${rowPush(item).tag}Hint`)"
                        data-testid="gmv-creative-push-tag"
                      >{{ t(`gmvMaxCreativesSimple.push.tags.${rowPush(item).tag}`) }}</em>
                    </span>
                    <small :title="item.productName">{{ subtitle(item) }}</small>
                  </div>
                </div>
              </td>
              <td class="gmv-cx-table__spend">
                <span class="gmv-cx-spend">{{ formatCny(item.cost, item.storeId) }}</span>
                <span class="gmv-cx-bar-track"><i :style="{ width: `${spendShare(item)}%` }"></i></span>
              </td>
              <td class="is-num">{{ formatCny(item.grossRevenue, item.storeId) }}</td>
              <td class="is-num">
                <span v-if="item.segment === 'no_orders'" class="gmv-cx-pill gvt-critical">{{ t("gmvMaxCreativesSimple.zeroOrders") }}</span>
                <span v-else :class="['gmv-cx-pill', `gvt-${segmentTone(item)}`]">{{ formatRoi(item.roi) }}</span>
              </td>
              <td class="is-num">{{ formatInteger(item.orders) }}</td>
              <td class="gmv-cx-table__actions">
                <button
                  v-if="rowPush(item).action === 'exclude'"
                  class="gmv-cx-row-button"
                  type="button"
                  data-testid="gmv-creative-exclude"
                  :title="t('gmvMaxCreativesSimple.push.excludeHint')"
                  @click.stop="openPush('REMOVE', [item])"
                >{{ t("gmvMaxCreativesSimple.push.exclude") }}</button>
                <button
                  v-else-if="rowPush(item).action === 'restore'"
                  class="gmv-cx-row-button"
                  type="button"
                  data-testid="gmv-creative-restore"
                  :title="t('gmvMaxCreativesSimple.push.restoreHint')"
                  @click.stop="openPush('ADD', [item])"
                >{{ t("gmvMaxCreativesSimple.push.restore") }}</button>
                <button
                  class="gmv-cx-chevron"
                  type="button"
                  :aria-expanded="expandedRow === rowKey(item)"
                  :aria-label="t('gmvMaxCreativesSimple.actions.detail')"
                  :title="t('gmvMaxCreativesSimple.actions.detail')"
                  @click.stop="toggleRow(rowKey(item))"
                >
                  <ChevronUp v-if="expandedRow === rowKey(item)" class="gmv-icon" /><ChevronDown v-else class="gmv-icon" />
                </button>
              </td>
            </tr>
            <tr v-if="expandedRow === rowKey(item)" class="gmv-cx-detail-row">
              <td colspan="7">
                <div class="gmv-cx-detail" data-testid="gmv-creative-detail">
                  <div class="gmv-cx-detail__product">
                    <img v-if="coverUrl(item) || productImage(item)" :src="coverUrl(item) || productImage(item)" alt="" referrerpolicy="no-referrer" />
                    <div class="gmv-cx-detail__product-text">
                      <span class="gmv-cx-detail__label">{{ t("gmvMaxCreativesSimple.detail.product") }}</span>
                      <p :title="item.productName">{{ item.productName && item.productName !== "-" ? item.productName : "-" }}</p>
                      <span class="gmv-cx-detail__meta" :title="item.campaignName">
                        {{ t("gmvMaxCreativesSimple.detail.campaign") }} · {{ item.campaignName }}
                      </span>
                    </div>
                  </div>
                  <dl class="gmv-cx-detail__stats">
                    <div><dt>{{ t("gmvMaxCreativesSimple.detail.cpa") }}</dt><dd>{{ formatCny(item.cpa, item.storeId) }}</dd></div>
                    <div><dt>{{ t("gmvMaxCreativesSimple.detail.ctr") }}</dt><dd>{{ formatPercent(item.ctr) }}</dd></div>
                    <div><dt>{{ t("gmvMaxCreativesSimple.detail.cvr") }}</dt><dd>{{ formatPercent(item.conversionRate) }}</dd></div>
                    <div><dt>{{ t("gmvMaxCreativesSimple.detail.play2s") }}</dt><dd>{{ formatPercent(item.play2sRate) }}</dd></div>
                    <div><dt>{{ t("gmvMaxCreativesSimple.detail.play6s") }}</dt><dd>{{ formatPercent(item.playDepth) }}</dd></div>
                  </dl>
                  <div class="gmv-cx-detail__foot">
                    <span class="gmv-cx-detail__meta">
                      {{ t("gmvMaxCreativesSimple.detail.id") }} {{ item.creativeId }}
                      <button class="gmv-cx-link" type="button" @click.stop="copyText(item.creativeId)">
                        {{ copiedId === item.creativeId ? t("gmvMaxCreativesSimple.detail.copied") : t("gmvMaxCreativesSimple.detail.copy") }}
                      </button>
                    </span>
                    <span v-if="authLabel(item)" class="gmv-cx-detail__meta">{{ t("gmvMaxCreativesSimple.detail.authorization") }} · {{ authLabel(item) }}</span>
                    <div class="gmv-am__spacer"></div>
                    <button v-if="creativeVideoAvailable(item)" class="gmv-cx-row-button is-plain" type="button" @click.stop="openCreativeVideo(item)">
                      {{ t("gmvMaxCreativesSimple.detail.preview") }}
                    </button>
                    <button
                      v-if="rowPush(item).action === 'exclude'"
                      class="gmv-cx-row-button"
                      type="button"
                      @click.stop="openPush('REMOVE', [item])"
                    >{{ t("gmvMaxCreativesSimple.push.exclude") }}</button>
                    <button
                      v-else-if="rowPush(item).action === 'restore'"
                      class="gmv-cx-row-button"
                      type="button"
                      data-testid="gmv-creative-restore"
                      @click.stop="openPush('ADD', [item])"
                    >{{ t("gmvMaxCreativesSimple.push.restore") }}</button>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <div v-if="creativeLoading && !creativePage.items.length" class="gmv-empty">{{ t("gmvMaxData.loadingPage") }}</div>
      <div v-else-if="!filteredCreatives.length" class="gmv-empty">
        {{ activeSegment !== "all" ? t("gmvMaxCreativesSimple.emptyTab") : t("gmvMaxAdvanced.empty.creatives") }}
      </div>
      <div class="gmv-pagination">
        <span>{{
          t("gmvMaxData.pageSummary", {
            current: creativePage.page,
            total: Math.max(1, Math.ceil(creativePage.total / creativePage.pageSize)),
            count: creativePage.total,
          })
        }}</span
        ><select v-model.number="creativePage.pageSize" @change="loadCreativePage(1)">
          <option :value="10">10</option>
          <option :value="25">25</option>
          <option :value="50">50</option>
          <option :value="100">100</option></select
        ><button
          class="gmv-button gmv-button--secondary"
          :disabled="creativePage.page <= 1 || creativeLoading"
          @click="loadCreativePage(creativePage.page - 1)"
        >
          {{ t("gmvMaxData.previous") }}</button
        ><button
          class="gmv-button gmv-button--secondary"
          :disabled="creativePage.page >= Math.ceil(creativePage.total / creativePage.pageSize) || creativeLoading"
          @click="loadCreativePage(creativePage.page + 1)"
        >
          {{ t("gmvMaxData.next") }}
        </button>
      </div>
    </div>
  </div>

  <!-- 4. Advanced tools, collapsed by default -->
  <details
    class="gmv-advanced-details gmv-cx-advanced"
    data-testid="gmv-creative-advanced"
    :open="creativeCampaign !== 'all' || undefined"
  >
    <summary>
      <SlidersHorizontal /><span
        ><strong>{{ t("gmvMaxCreativesSimple.advanced.title") }}</strong
        ><small>{{ t("gmvMaxCreativesSimple.advanced.hint") }}</small></span
      ><ChevronDown />
    </summary>
    <div class="gmv-cx-advanced__body">
      <!-- Metric filters -->
      <section class="gmv-cx-block" data-testid="gmv-creative-filters">
        <h3><Filter class="gmv-icon" />{{ t("gmvMaxCreativesSimple.advanced.filters") }}</h3>
        <div class="gmv-filter-panel gmv-filter-panel--creative">
          <label
            ><span>{{ t("gmvMax.fields.campaign") }}</span
            ><select v-model="creativeCampaign" @change="loadCreativeContext">
              <option value="all">{{ t("gmvMaxData.allCampaigns") }}</option>
              <option v-for="campaign in filteredCampaigns" :key="campaign.id" :value="campaign.id">{{ campaign.name }}</option>
            </select></label
          >
          <label
            ><span>{{ t("gmvMaxData.minSpend") }} ({{ t("gmvMaxCurrency.cnyUnit") }})</span
            ><input v-model.number="minCreativeSpend" type="number" min="0" :disabled="moneyFilterDisabled()"
          /></label>
          <label
            ><span>{{ t("gmvMaxData.minOrders") }}</span
            ><input v-model.number="minCreativeOrders" type="number" min="0"
          /></label>
          <label
            ><span>{{ t("gmvMaxData.minRoi") }}</span
            ><input v-model.number="minCreativeRoi" type="number" min="0" step="0.01"
          /></label>
          <label
            ><span>{{ t("gmvMaxData.maxCpa") }} ({{ t("gmvMaxCurrency.cnyUnit") }})</span
            ><input v-model.number="maxCreativeCpa" type="number" min="0" :disabled="moneyFilterDisabled()"
          /></label>
          <label
            ><span>{{ t("gmvMaxData.minCtr") }}</span
            ><input v-model.number="minCreativeCtr" type="number" min="0" step="0.01"
          /></label>
          <button class="gmv-button gmv-button--primary" :disabled="creativeLoading" @click="loadCreativePage(1)">
            <Filter class="gmv-icon" />{{ t("gmvMaxData.applyMetrics") }}
          </button>
        </div>
      </section>

      <!-- Funnel + traffic signals -->
      <section class="gmv-creative-command" data-testid="gmv-creative-command">
        <div class="gmv-creative-funnel">
          <div class="gmv-subheading">
            <div>
              <h3>{{ t("gmvMaxOfficial.creativeFunnel") }}</h3>
              <p>{{ t("gmvMaxOfficial.creativeFunnelHint") }}</p>
            </div>
          </div>
          <div class="gmv-funnel-track">
            <article v-for="stage in creativeFunnel" :key="stage.key">
              <span>{{ t(`gmvMaxOfficial.funnel.${stage.key}`) }}</span
              ><strong>{{ stage.value }}</strong
              ><i
                :style="{
                  width: `${creativeFunnel[0].value ? Math.max(4, (stage.value / creativeFunnel[0].value) * 100) : 0}%`,
                }"
              ></i>
            </article>
          </div>
        </div>
        <div class="gmv-signal-board">
          <div class="gmv-subheading">
            <div>
              <h3>{{ t("gmvMaxOfficial.trafficSignals") }}</h3>
              <p>{{ t("gmvMaxOfficial.trafficSignalsHint") }}</p>
            </div>
          </div>
          <div class="gmv-signal-grid">
            <article><span>CTR</span><strong>{{ percentage(String(creativeSignalSummary.ctr)) }}</strong></article>
            <article><span>CVR</span><strong>{{ percentage(String(creativeSignalSummary.conversionRate)) }}</strong></article>
            <article><span>2s</span><strong>{{ percentage(String(creativeSignalSummary.play2sRate)) }}</strong></article>
            <article><span>6s</span><strong>{{ percentage(String(creativeSignalSummary.playDepth)) }}</strong></article>
          </div>
          <p class="gmv-signal-note"><ShieldAlert class="gmv-icon" />{{ t("gmvMaxOfficial.todayGuard") }}</p>
        </div>
      </section>

      <!-- Test pool of the selected campaign -->
      <section v-if="creativeExperimentWorkspace" class="gmv-experiment-board" data-testid="gmv-creative-experiment-board">
        <header>
          <div>
            <span>{{ t("gmvMaxCreativeExperiment.eyebrow") }}</span>
            <h3>{{ creativeExperimentWorkspace.campaign.name }}</h3>
            <p>{{ t("gmvMaxCreativeExperiment.subtitle") }}</p>
          </div>
          <div class="gmv-row__actions">
            <span
              :class="[
                'gmv-status',
                creativeExperimentWorkspace.creativeExperiment.state === 'ready'
                  ? 'is-success'
                  : creativeExperimentWorkspace.creativeExperiment.state === 'blocked'
                    ? 'is-danger'
                    : 'is-warning',
              ]"
              >{{ t(`gmvMaxCreativeExperiment.states.${creativeExperimentWorkspace.creativeExperiment.state}`) }}</span
            ><button class="gmv-button gmv-button--secondary" @click="openPolicy(creativeExperimentWorkspace.campaign.id)">
              <SlidersHorizontal class="gmv-icon" />{{ t("gmvMaxConsole.configure") }}
            </button>
          </div>
        </header>
        <div class="gmv-experiment-kpis">
          <article>
            <span>{{ t("gmvMaxCreativeExperiment.activePool") }}</span
            ><strong
              >{{ formatInteger(creativeExperimentWorkspace.creativeExperiment.activeCreativeCount) }} /
              {{ formatInteger(creativeExperimentWorkspace.creativeExperiment.targetPoolSize) }}</strong
            ><small
              >{{ formatInteger(creativeExperimentWorkspace.creativeExperiment.missingCreativeCount) }}
              {{ t("gmvMaxCreativeExperiment.missing") }}</small
            >
          </article>
          <article>
            <span>{{ t("gmvMaxCreativeExperiment.testBudget") }}</span
            ><strong>{{
              formatCny(creativeExperimentWorkspace.creativeExperiment.testBudget, creativeExperimentWorkspace.campaign.storeId)
            }}</strong
            ><small>{{ t("gmvMaxCreativeExperiment.perCreative") }}</small>
          </article>
          <article>
            <span>{{ t("gmvMaxCreativeExperiment.explorationBudget") }}</span
            ><strong>{{
              formatCny(creativeExperimentWorkspace.creativeExperiment.explorationBudget, creativeExperimentWorkspace.campaign.storeId)
            }}</strong
            ><small
              >{{ formatPercent(creativeExperimentWorkspace.creativeExperiment.explorationSharePercent, true) }}
              {{ t("gmvMaxCreativeExperiment.ofCampaignBudget") }}</small
            >
          </article>
          <article>
            <span>{{ t("gmvMaxCreativeExperiment.winnerCap") }}</span
            ><strong>{{ formatPercent(creativeExperimentWorkspace.creativeExperiment.winnerTrafficCapPercent, true) }}</strong
            ><small>{{ t("gmvMaxCreativeExperiment.advisoryCap") }}</small>
          </article>
          <article>
            <span>{{ t("gmvMaxConsole.winners") }}</span
            ><strong>{{ formatInteger(creativeExperimentWorkspace.creativeExperiment.winnerCount) }}</strong
            ><small
              >{{ formatInteger(creativeExperimentWorkspace.creativeExperiment.testingCount) }}
              {{ t("gmvMaxCreativeExperiment.testing") }}</small
            >
          </article>
          <article>
            <span>{{ t("gmvMaxCreativeExperiment.candidateSupply") }}</span
            ><strong>{{ formatInteger(creativeExperimentWorkspace.creativeExperiment.availableCandidateCount) }}</strong
            ><small
              >{{
                formatInteger(
                  creativeExperimentWorkspace.creativeExperiment.fatiguedCount +
                    creativeExperimentWorkspace.creativeExperiment.wasteCount,
                )
              }}
              {{ t("gmvMaxCreativeExperiment.toReplace") }}</small
            >
          </article>
        </div>
        <div class="gmv-experiment-flow">
          <article>
            <span>{{ t("gmvMaxCreativeExperiment.candidate") }}</span
            ><strong>{{
              creativeExperimentWorkspace.creativeExperiment.candidate?.name ||
              creativeExperimentWorkspace.creativeExperiment.candidate?.creativeId ||
              "-"
            }}</strong
            ><small>{{
              creativeExperimentWorkspace.creativeExperiment.candidate
                ? structuredValueLabel(creativeExperimentWorkspace.creativeExperiment.candidate.status)
                : t("gmvMaxCreativeExperiment.noCandidate")
            }}</small>
          </article>
          <ArrowRightLeft class="gmv-icon" />
          <article>
            <span>{{ t("gmvMaxCreativeExperiment.retiring") }}</span
            ><strong>{{
              creativeExperimentWorkspace.creativeExperiment.retiring?.name ||
              creativeExperimentWorkspace.creativeExperiment.retiring?.creativeId ||
              "-"
            }}</strong
            ><small>{{
              creativeExperimentWorkspace.creativeExperiment.retiring
                ? t(`gmvMaxIntelligence.creativeStates.${creativeExperimentWorkspace.creativeExperiment.retiring.state}`)
                : t("gmvMaxCreativeExperiment.noRetiring")
            }}</small>
          </article>
          <button
            v-if="creativeExperimentWorkspace.creativeExperiment.pendingActionId"
            class="gmv-button gmv-button--primary"
            @click="openAction(creativeExperimentWorkspace.creativeExperiment.pendingActionId)"
          >
            {{ t("gmvMaxCreativeExperiment.reviewAction") }}
          </button>
        </div>
        <div class="gmv-experiment-signals">
          <span v-for="signal in creativeExperimentWorkspace.creativeExperiment.signals" :key="signal">{{
            t(`gmvMaxCreativeExperiment.signals.${signal}`)
          }}</span>
        </div>
        <div class="gmv-experiment-outcomes">
          <header>
            <strong>{{ t("gmvMaxCreativeOutcome.title") }}</strong
            ><span
              >{{ creativeExperimentWorkspace.creativeOutcomes.filter((item) => item.successful).length }}
              / {{ creativeExperimentWorkspace.creativeOutcomes.length }} {{ t("gmvMaxCreativeOutcome.successful") }}</span
            >
          </header>
          <div v-if="creativeExperimentWorkspace.creativeOutcomes.length" class="gmv-outcome-rail">
            <article v-for="item in creativeExperimentWorkspace.creativeOutcomes.slice(0, 5)" :key="item.id">
              <span :class="['gmv-status', item.successful ? 'is-success' : 'is-warning']">{{ item.operation || item.actionType }}</span
              ><strong :title="`${item.comparisonCreativeId || '-'} > ${item.primaryCreativeId || '-'}`"
                >{{ item.comparisonCreativeId || "-" }} &gt; {{ item.primaryCreativeId || "-" }}</strong
              ><small
                >ROI {{ formatRoi(item.preRoi) }} &gt; {{ formatRoi(item.postRoi) }} /
                {{ formatPercent(item.profitDeltaPercent, true) }}</small
              >
            </article>
          </div>
          <div v-else class="gmv-empty gmv-empty--small">{{ t("gmvMaxCreativeOutcome.empty") }}</div>
        </div>
      </section>

      <div class="gmv-cx-advanced__split">
        <!-- Creator view -->
        <section class="gmv-cx-block">
          <h3>{{ t("gmvMaxCreativesSimple.advanced.creators") }}</h3>
          <div class="gmv-table-wrap">
            <table class="gmv-table">
              <thead>
                <tr>
                  <th>{{ t("gmvMaxConsole.creator") }}</th>
                  <th class="is-num">{{ t("gmvMaxConsole.posts") }}</th>
                  <th class="is-num">{{ t("gmvMaxCreativesSimple.kpi.revenue") }}</th>
                  <th class="is-num">{{ t("gmvMaxCreativesSimple.kpi.spend") }}</th>
                  <th class="is-num">{{ t("gmvMaxCreativesSimple.kpi.orders") }}</th>
                  <th class="is-num">ROI</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="creator in creatorPerformance" :key="creator.name">
                  <td><strong>{{ creator.name }}</strong></td>
                  <td class="is-num">{{ formatInteger(creator.creativeCount) }}</td>
                  <td class="is-num">{{ creator.moneyReady ? formatCny(creator.revenue, undefined, true) : t("gmvMaxCurrency.pending") }}</td>
                  <td class="is-num">{{ creator.moneyReady ? formatCny(creator.cost, undefined, true) : t("gmvMaxCurrency.pending") }}</td>
                  <td class="is-num">{{ formatInteger(creator.orders) }}</td>
                  <td class="is-num"><strong>{{ formatRoi(creator.roi) }}</strong></td>
                </tr>
              </tbody>
            </table>
            <div v-if="!creatorPerformance.length" class="gmv-empty gmv-empty--small">{{ t("gmvMaxConsole.noCreators") }}</div>
          </div>
        </section>

        <!-- Keep / stop lists -->
        <aside class="gmv-cx-block gmv-list-panel" data-testid="gmv-list-entry-page">
          <h3>{{ t("gmvMaxCreativesSimple.advanced.lists") }}</h3>
          <div class="gmv-list-filters">
            <select v-model="listEntryMode" @change="loadListEntryPage(1)">
              <option value="all">{{ t("gmvMaxConsole.status.all") }}</option>
              <option value="allow">{{ t("gmvMaxCreativesSimple.actions.keep") }}</option>
              <option value="deny">{{ t("gmvMaxCreativesSimple.actions.stop") }}</option></select
            ><input v-model="listEntrySearch" :placeholder="t('gmvMaxConsole.search')" @keyup.enter="loadListEntryPage(1)" />
          </div>
          <div class="gmv-stack">
            <div v-for="item in listEntryPage.items" :key="item.id" class="gmv-list-entry">
              <span :class="['gmv-dot', item.mode === 'allow' ? 'gvt-good' : 'gvt-critical']">{{
                item.mode === "allow" ? t("gmvMaxCreativesSimple.actions.keep") : t("gmvMaxCreativesSimple.actions.stop")
              }}</span>
              <div>
                <strong>{{ item.label || item.entityId }}</strong><small>{{ item.entityId }}</small>
              </div>
              <button class="gmv-icon-button" :title="t('gmvMaxCreativesSimple.actions.remove')" @click="removeListEntry(item)">
                <Trash2 class="gmv-icon" />
              </button>
            </div>
            <div v-if="listEntryLoading" class="gmv-empty gmv-empty--small">{{ t("gmvMaxData.loadingPage") }}</div>
            <div v-else-if="!listEntryPage.items.length" class="gmv-empty gmv-empty--small">{{ t("gmvMaxConsole.noEntries") }}</div>
          </div>
          <div class="gmv-pagination gmv-pagination--compact">
            <span>{{ listEntryPage.page }} / {{ Math.max(1, Math.ceil(listEntryPage.total / listEntryPage.pageSize)) }}</span
            ><button
              class="gmv-icon-button"
              :disabled="listEntryPage.page <= 1 || listEntryLoading"
              @click="loadListEntryPage(listEntryPage.page - 1)"
            >
              -</button
            ><button
              class="gmv-icon-button"
              :disabled="listEntryPage.page >= Math.ceil(listEntryPage.total / listEntryPage.pageSize) || listEntryLoading"
              @click="loadListEntryPage(listEntryPage.page + 1)"
            >
              +
            </button>
          </div>
        </aside>
      </div>

      <!-- Full suggestion history, including executed ones that can be undone -->
      <section class="gmv-cx-block" data-testid="gmv-creative-queue">
        <h3>{{ t("gmvMaxCreativesSimple.advanced.history") }}</h3>
        <div class="gmv-table-wrap">
          <table class="gmv-table">
            <thead>
              <tr>
                <th>{{ t("gmvMaxCreativesSimple.columns.suggestion") }}</th>
                <th>{{ t("gmvMaxCreativesSimple.detail.campaign") }}</th>
                <th>{{ t("gmvMaxCreativesSimple.columns.status") }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in creativeActionQueue" :key="item.id">
                <td>
                  <strong>{{ suggestionLabel(item) }}</strong><small>{{ suggestionTarget(item) }}</small>
                </td>
                <td>
                  {{ campaignName(item.campaignId) }}<small>{{ item.evidence.startDate }}</small>
                </td>
                <td>
                  <span :class="['gmv-status', statusClass(item.status)]">{{ t(`gmvMax.status.${item.status}`) }}</span>
                </td>
                <td>
                  <div class="gmv-row__actions">
                    <button class="gmv-icon-button" :title="t('gmvMaxConsole.actionDetail')" @click="openAction(item.id)">
                      <ChevronRight class="gmv-icon" /></button
                    ><button
                      v-if="['pending', 'failed'].includes(item.status)"
                      class="gmv-icon-button"
                      :title="item.status === 'failed' ? t('gmvMaxRecovery.acknowledge') : t('gmvMax.actions.reject')"
                      :disabled="!!busyAction"
                      @click="reject(item.id)"
                    >
                      <X class="gmv-icon" /></button
                    ><button
                      v-if="item.status === 'pending'"
                      class="gmv-icon-button"
                      :title="t('gmvMax.actions.approve')"
                      :disabled="!!busyAction"
                      @click="approve(item.id)"
                    >
                      <Check class="gmv-icon" /></button
                    ><button
                      v-if="item.status === 'executed' && item.reversible"
                      class="gmv-icon-button"
                      :title="t('gmvMaxAdvanced.actions.restore')"
                      :disabled="!!busyAction"
                      @click="rollback(item.id)"
                    >
                      <RotateCcw class="gmv-icon" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!creativeActionQueue.length" class="gmv-empty gmv-empty--small">{{ t("gmvMax.empty.recommendations") }}</div>
        </div>
        <button class="gmv-button gmv-button--secondary gmv-cx-regenerate" :disabled="!connected || !!busyAction" @click="optimizeCreatives">
          {{ t("gmvMaxCreativesSimple.todo.generate") }}
        </button>
      </section>
    </div>
  </details>
  <GmvCreativePushDialog
    v-if="pushDialog"
    :operation="pushDialog.operation"
    :rows="pushDialog.rows"
    :summary="pushDialog.summary"
    :phase="pushDialog.phase"
    :results="pushDialog.results"
    :error="pushDialog.error"
    @confirm="confirmPush"
    @close="closePush"
  />
</section>
</template>
