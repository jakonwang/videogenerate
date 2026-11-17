<script lang="ts">
// Creatives page of the GMV MAX workspace. State and handlers come from TiktokGmvMaxOptimizerView via provide/inject.
// Default view is task-first for ordinary sellers: what to do now, four numbers, a status-tabbed video list.
// Funnel, experiment pool, creator view, allow/deny lists and the full suggestion history sit under "advanced".
import { computed, defineComponent, ref } from "vue";
import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Filter,
  AlertTriangle,
  CircleCheck,
  Film,
  Inbox,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-vue-next";
import { useGmvWorkspace } from "./workspaceContext";
import GmvKpiStrip, { type GmvKpi } from "../GmvKpiStrip.vue";

type StatusTab = "all" | "good" | "testing" | "replace" | "waste";
type Tone = "good" | "info" | "warning" | "critical" | "neutral";

// One simple tab can cover several intelligence states; the server accepts a comma-separated list.
const STATUS_TABS: Array<{ key: StatusTab; states: string }> = [
  { key: "all", states: "all" },
  { key: "good", states: "winner,stable" },
  { key: "testing", states: "new,testing" },
  { key: "replace", states: "fatigued" },
  { key: "waste", states: "waste" },
];

const STATE_GROUP: Record<string, { key: string; tone: Tone }> = {
  winner: { key: "good", tone: "good" },
  stable: { key: "good", tone: "good" },
  new: { key: "testing", tone: "info" },
  testing: { key: "testing", tone: "info" },
  fatigued: { key: "replace", tone: "warning" },
  waste: { key: "waste", tone: "critical" },
  blocked: { key: "needsCost", tone: "neutral" },
};

export default defineComponent({
  name: "GmvCreativesPage",
  components: {
    ArrowRightLeft,
    Check,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Filter,
    GmvKpiStrip,
    AlertTriangle,
    CircleCheck,
    Film,
    Inbox,
    Play,
    RefreshCw,
    RotateCcw,
    ShieldAlert,
    SlidersHorizontal,
    Trash2,
    X,
  },
  setup() {
    const ws = useGmvWorkspace();
    const showSuggestions = ref(false);
    const expandedRow = ref("");

    const totalsStore = computed(() =>
      ws.selectedStore.value !== "all" ? ws.selectedStore.value : ws.uniqueStores.value[0]?.storeId,
    );
    const kpis = computed<GmvKpi[]>(() => {
      const summary = ws.creativePage.value.summary;
      return [
        { key: "spend", label: ws.t("gmvMaxCreativesSimple.kpi.spend"), value: ws.formatCny(summary.cost, totalsStore.value) },
        { key: "gmv", label: ws.t("gmvMaxCreativesSimple.kpi.revenue"), value: ws.formatCny(summary.revenue, totalsStore.value) },
        { key: "roi", label: "ROI", value: summary.cost > 0 ? ws.formatRoi(summary.roi) : "—" },
        { key: "orders", label: ws.t("gmvMaxCreativesSimple.kpi.orders"), value: ws.formatInteger(summary.orders) },
      ];
    });

    const pendingSuggestions = computed(() =>
      (ws.creativeActionQueue.value as Array<{ status: string }>).filter((item) => item.status === "pending"),
    );
    const setupMissing = computed(
      () => Number(ws.incompleteCreativeCostCount.value) > 0 || Number(ws.missingCreativeTestBudgetCount.value) > 0,
    );

    const statusTab = computed<StatusTab | "">(
      () => STATUS_TABS.find((tab) => tab.states === ws.creativeState.value)?.key ?? "",
    );
    function selectTab(key: StatusTab) {
      const tab = STATUS_TABS.find((item) => item.key === key)!;
      ws.creativeState.value = tab.states;
      expandedRow.value = "";
      void ws.loadCreativePage(1);
    }
    function selectSource() {
      expandedRow.value = "";
      void ws.loadCreativePage(1);
    }
    function showReplace() {
      selectTab("replace");
      document.querySelector('[data-testid="gmv-creative-list"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function stateInfo(state: string) {
      return STATE_GROUP[state] || { key: "testing", tone: "info" as Tone };
    }
    function rowKey(item: { campaignId: string; creativeId: string; itemGroupId?: string }) {
      return `${item.campaignId}:${item.creativeId}:${item.itemGroupId || "unscoped"}`;
    }
    function toggleRow(key: string) {
      expandedRow.value = expandedRow.value === key ? "" : key;
    }
    // Synced video assets carry cover, caption and the posting account under raw; metrics alone only have the ID.
    type RawCreative = {
      creativeId: string;
      creativeName?: string;
      productName?: string;
      productImageUrl?: string;
      raw?: Record<string, unknown>;
    };
    const brokenImages = ref(new Set<string>());
    const record = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
    function httpUrl(...values: unknown[]) {
      return values.map((value) => String(value || "").trim()).find((value) => /^https?:\/\//i.test(value)) || "";
    }
    function coverUrl(item: RawCreative) {
      const raw = record(item.raw);
      const video = record(raw.video_info);
      const url = httpUrl(video.video_cover_url, raw.video_cover_url, video.poster_url, raw.poster_url, raw.cover_url);
      return url && !brokenImages.value.has(url) ? url : "";
    }
    // TikTok only returns real covers for a few videos; the product being sold is the next best picture.
    function productImage(item: RawCreative) {
      const url = httpUrl(item.productImageUrl);
      return !coverUrl(item) && url && !brokenImages.value.has(url) ? url : "";
    }
    function hasCaption(item: RawCreative) {
      return Boolean(String(record(item.raw).text || "").trim());
    }
    function productTitle(item: RawCreative) {
      const name = String(item.productName || "").trim();
      return name && name !== "-" && !/^\d+$/.test(name) ? name : "";
    }
    function avatarUrl(item: RawCreative) {
      const url = httpUrl(record(record(item.raw).identity_info).profile_image);
      return url && !brokenImages.value.has(url) ? url : "";
    }
    function markBroken(url: string) {
      brokenImages.value = new Set(brokenImages.value).add(url);
    }
    function shortId(id: string) {
      return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
    }
    function videoTitle(item: RawCreative) {
      const caption = String(record(item.raw).text || "").replace(/\s+/g, " ").trim();
      if (caption) return caption;
      const name = String(item.creativeName || "").trim();
      if (name && name !== item.creativeId) return name;
      return productTitle(item) || ws.t("gmvMaxCreativesSimple.untitled", { id: shortId(item.creativeId) });
    }
    // When the title is the product name, the video ID moves to the second line so rows selling the same product stay apart.
    function titleIsProduct(item: RawCreative) {
      const name = String(item.creativeName || "").trim();
      return !hasCaption(item) && !(name && name !== item.creativeId) && Boolean(productTitle(item));
    }
    function videoLabel(item: RawCreative) {
      return ws.t("gmvMaxCreativesSimple.untitled", { id: shortId(item.creativeId) });
    }

    // Creator name when known, otherwise the source in plain words.
    function creatorLabel(item: { creatorName?: string; source?: string; raw?: Record<string, unknown> }) {
      const name = String(item.creatorName || "").trim();
      if (name && name !== "-") return name;
      const identity = String(record(record(item.raw).identity_info).display_name || "").trim();
      if (identity) return identity;
      const source = String(item.source || "");
      return ["owned", "affiliate", "product_card"].includes(source)
        ? ws.t(`gmvMaxCreativesSimple.sources.${source}`)
        : ws.t("gmvMaxCreativesSimple.unknownCreator");
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
      STATUS_TABS,
      avatarUrl,
      coverUrl,
      creatorLabel,
      markBroken,
      productImage,
      titleIsProduct,
      videoLabel,
      videoTitle,
      statusTab,
      expandedRow,
      kpis,
      pendingSuggestions,
      rowKey,
      selectSource,
      selectTab,
      setupMissing,
      showReplace,
      showSuggestions,
      stateInfo,
      suggestionLabel,
      suggestionTarget,
      toggleRow,
    };
  },
});
</script>

<template>
<section class="gmv-section gmv-dash-page gmv-am gmv-cx" data-testid="gmv-creatives-page">
  <!-- 1. What to do now -->
  <div class="gmv-cx-todo" data-testid="gmv-creative-todo">
    <div class="gmv-cx-todo__item">
      <Inbox class="gmv-cx-todo__icon" />
      <p v-if="pendingSuggestions.length">
        <b>{{ pendingSuggestions.length }}</b> {{ t("gmvMaxCreativesSimple.todo.pendingText") }}
      </p>
      <p v-else>{{ t("gmvMaxCreativesSimple.todo.noPendingText") }}</p>
      <button
        v-if="pendingSuggestions.length"
        class="gmv-cx-link"
        data-testid="gmv-creative-review-suggestions"
        @click="showSuggestions = !showSuggestions"
      >
        {{ showSuggestions ? t("gmvMaxCreativesSimple.todo.hide") : t("gmvMaxCreativesSimple.todo.review") }}
      </button>
      <button
        v-else
        class="gmv-cx-link"
        data-testid="gmv-optimize-creatives"
        :disabled="!connected || !!busyAction"
        @click="optimizeCreatives"
      >
        {{ busyAction === "optimize-creatives" ? t("gmvMaxCreativesSimple.todo.generating") : t("gmvMaxCreativesSimple.todo.generate") }}
      </button>
    </div>

    <div class="gmv-cx-todo__item">
      <RefreshCw class="gmv-cx-todo__icon" />
      <p>{{ t("gmvMaxCreativesSimple.todo.replaceText") }}</p>
      <button class="gmv-cx-link" data-testid="gmv-creative-show-replace" @click="showReplace">
        {{ t("gmvMaxCreativesSimple.todo.view") }}
      </button>
    </div>

    <div :class="['gmv-cx-todo__item', setupMissing ? 'is-attention' : '']" data-testid="gmv-creative-setup">
      <AlertTriangle v-if="setupMissing" class="gmv-cx-todo__icon" />
      <CircleCheck v-else class="gmv-cx-todo__icon" />
      <p
        :title="
          setupMissing
            ? t('gmvMaxCreativesSimple.todo.setupHint', { costs: incompleteCreativeCostCount, budgets: missingCreativeTestBudgetCount })
            : ''
        "
      >
        {{
          setupMissing
            ? t("gmvMaxCreativesSimple.todo.setupText")
            : connected && dashboard.campaigns.length
              ? t("gmvMaxCreativesSimple.todo.setupDone")
              : t("gmvMaxCreativesSimple.todo.setupUnknown")
        }}
      </p>
      <button class="gmv-cx-link" data-testid="gmv-creative-open-setup" @click="activeTab = 'rules'">
        {{ setupMissing ? t("gmvMaxCreativesSimple.todo.setup") : t("gmvMaxCreativesSimple.todo.viewSetup") }}
      </button>
    </div>
  </div>

  <!-- Pending suggestions, opened from the first card -->
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

  <!-- 2. Four headline numbers -->
  <GmvKpiStrip class="gmv-cx-kpis" :items="kpis" :compare="false" data-testid="gmv-creative-kpis" />

  <!-- 3. Video list -->
  <div class="gmv-cx-list" data-testid="gmv-creative-list">
    <div class="gmv-am__toolbar">
      <div class="gmv-am__seg" role="group" :aria-label="t('gmvMaxCreativesSimple.tabs.label')" data-testid="gmv-creative-status-tabs">
        <button
          v-for="tab in STATUS_TABS"
          :key="tab.key"
          type="button"
          :class="{ 'is-active': statusTab === tab.key }"
          :data-testid="`gmv-creative-tab-${tab.key}`"
          @click="selectTab(tab.key)"
        >
          {{ t(`gmvMaxCreativesSimple.tabs.${tab.key}`) }}<em v-if="statusTab === tab.key && !creativeLoading">{{ creativePage.total }}</em>
        </button>
      </div>
      <div class="gmv-am__spacer"></div>
      <select v-model="creativeSource" class="gmv-cx-select" :aria-label="t('gmvMaxCreativesSimple.source')" @change="selectSource">
        <option v-for="source in ['all', 'owned', 'affiliate', 'product_card']" :key="source" :value="source">
          {{ t(`gmvMaxCreativesSimple.sources.${source}`) }}
        </option>
      </select>
    </div>

    <div class="gmv-table-wrap">
      <table class="gmv-table gmv-cx-table">
        <thead>
          <tr>
            <th>{{ t("gmvMaxCreativesSimple.columns.video") }}</th>
            <th>{{ t("gmvMaxCreativesSimple.columns.status") }}</th>
            <th class="is-num">
              <button class="gmv-sort-button" @click="toggleCreativeSort('cost')">
                {{ t("gmvMaxCreativesSimple.kpi.spend") }}<small>{{ sortMark("cost", creativeSortBy, creativeSortDirection) }}</small>
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
            <tr :class="['gmv-cx-row', { 'is-expanded': expandedRow === rowKey(item) }]" @click="toggleRow(rowKey(item))">
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
                    <template v-else-if="productImage(item)">
                      <img
                        :src="productImage(item)"
                        alt=""
                        loading="lazy"
                        referrerpolicy="no-referrer"
                        class="is-product"
                        @error="markBroken(productImage(item))"
                      />
                      <span class="gmv-cx-video__badge">{{ t("gmvMaxCreativesSimple.productBadge") }}</span>
                    </template>
                    <Film v-else class="gmv-cx-video__placeholder" />
                    <Play v-if="creativeVideoAvailable(item)" class="gmv-cx-video__play" />
                  </button>
                  <div class="gmv-cx-video__text">
                    <strong :title="videoTitle(item)">{{ videoTitle(item) }}</strong>
                    <small>
                      <img v-if="avatarUrl(item)" :src="avatarUrl(item)" alt="" referrerpolicy="no-referrer" @error="markBroken(avatarUrl(item))" />
                      <template v-if="titleIsProduct(item)">{{ videoLabel(item) }} · </template>{{ creatorLabel(item) }} ·
                      {{ t("gmvMaxCreativesSimple.days", { count: formatInteger(item.days) }) }}
                    </small>
                  </div>
                </div>
              </td>
              <td>
                <span
                  v-if="stateInfo(item.intelligenceState).key !== 'needsCost'"
                  :class="['gmv-cx-state', `gvt-${stateInfo(item.intelligenceState).tone}`]"
                  :title="t(`gmvMaxIntelligence.creativeStates.${item.intelligenceState}`)"
                >{{ t(`gmvMaxCreativesSimple.states.${stateInfo(item.intelligenceState).key}`) }}</span>
                <span v-else class="gmv-cx-state is-muted" :title="t('gmvMaxCreativesSimple.states.needsCostHint')">{{
                  t("gmvMaxCreativesSimple.states.needsCost")
                }}</span>
              </td>
              <td class="is-num">{{ formatCny(item.cost, item.storeId) }}</td>
              <td class="is-num"><strong>{{ formatCny(item.grossRevenue, item.storeId) }}</strong></td>
              <td class="is-num"><strong>{{ formatRoi(item.roi) }}</strong></td>
              <td class="is-num">{{ formatInteger(item.orders) }}</td>
              <td class="gmv-cx-table__actions">
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
                <dl class="gmv-cx-detail">
                  <div><dt>{{ t("gmvMaxCreativesSimple.detail.campaign") }}</dt><dd>{{ item.campaignName }}</dd></div>
                  <div><dt>{{ t("gmvMaxCreativesSimple.detail.product") }}</dt><dd>{{ item.productName || "-" }}</dd></div>
                  <div><dt>{{ t("gmvMaxCreativesSimple.detail.authorization") }}</dt><dd>{{ item.authorizationType || "-" }} {{ item.authorizationStatus }}</dd></div>
                  <div><dt>{{ t("gmvMaxCreativesSimple.detail.cpa") }}</dt><dd>{{ formatCny(item.cpa, item.storeId) }}</dd></div>
                  <div><dt>{{ t("gmvMaxCreativesSimple.detail.ctr") }}</dt><dd>{{ formatPercent(item.ctr) }}</dd></div>
                  <div><dt>{{ t("gmvMaxCreativesSimple.detail.cvr") }}</dt><dd>{{ formatPercent(item.conversionRate) }}</dd></div>
                  <div><dt>{{ t("gmvMaxCreativesSimple.detail.play2s") }}</dt><dd>{{ formatPercent(item.play2sRate) }}</dd></div>
                  <div><dt>{{ t("gmvMaxCreativesSimple.detail.play6s") }}</dt><dd>{{ formatPercent(item.playDepth) }}</dd></div>
                  <div><dt>{{ t("gmvMaxCreativesSimple.detail.score") }}</dt><dd>{{ formatInteger(item.intelligenceScore) }}</dd></div>
                  <div>
                    <dt>{{ t("gmvMaxCreativesSimple.detail.roiTrend") }}</dt>
                    <dd :class="metricNumber(item.intelligenceRoiTrend) >= 0 ? 'is-positive' : 'is-negative'">{{ formatPercent(item.intelligenceRoiTrend, true) }}</dd>
                  </div>
                  <div><dt>{{ t("gmvMaxCreativesSimple.detail.id") }}</dt><dd>{{ item.creativeId }}</dd></div>
                </dl>
                <div class="gmv-cx-detail__actions">
                  <button class="gmv-button gmv-button--secondary" @click="addCreativeToList(item, 'allow')">{{ t("gmvMaxCreativesSimple.actions.keep") }}</button>
                  <button class="gmv-button gmv-button--secondary" @click="addCreativeToList(item, 'deny')">{{ t("gmvMaxCreativesSimple.actions.stop") }}</button>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <div v-if="creativeLoading && !creativePage.items.length" class="gmv-empty">{{ t("gmvMaxData.loadingPage") }}</div>
      <div v-else-if="!filteredCreatives.length" class="gmv-empty">
        {{ statusTab && statusTab !== "all" ? t("gmvMaxCreativesSimple.emptyTab") : t("gmvMaxAdvanced.empty.creatives") }}
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
</section>
</template>
