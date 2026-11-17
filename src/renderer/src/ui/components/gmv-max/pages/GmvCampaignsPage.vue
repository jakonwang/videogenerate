<script lang="ts">
// Ads manager / campaigns page. State and handlers come from TiktokGmvMaxOptimizerView via provide/inject;
// edits, bulk changes, columns and saved views live in useCampaignManager.
import { computed, defineComponent, nextTick } from "vue";
import { Bookmark, Check, ChevronDown, Columns3, Film, Filter, Package, Pencil, Search, SlidersHorizontal, Trash2, X, Zap } from "lucide-vue-next";
import { useGmvWorkspace } from "./workspaceContext";
import { periodChange as change } from "./periodChange";
import { CAMPAIGN_COLUMNS, useCampaignManager } from "./useCampaignManager";
import GmvKpiStrip, { type GmvKpi } from "../GmvKpiStrip.vue";
import GmvChangeDialog from "../GmvChangeDialog.vue";

type Totals = { cost: number; revenue: number; orders: number };

export default defineComponent({
  name: "GmvCampaignsPage",
  components: { Bookmark, Check, ChevronDown, Columns3, Film, Filter, GmvChangeDialog, GmvKpiStrip, Package, Pencil, Search, SlidersHorizontal, Trash2, X, Zap },
  setup() {
    const ws = useGmvWorkspace();
    const manager = useCampaignManager(ws);
    // Totals are in the store currency; with several stores the first store's currency is used for display.
    const totalsStore = computed(() =>
      ws.selectedStore.value !== "all" ? ws.selectedStore.value : ws.uniqueStores.value[0]?.storeId,
    );
    const kpis = computed<GmvKpi[]>(() => {
      const page = ws.campaignDataPage.value as { summary: Totals; previousSummary?: Totals };
      const now = page.summary;
      const before = page.previousSummary;
      const roi = now.cost > 0 ? now.revenue / now.cost : null;
      const roiBefore = before && before.cost > 0 ? before.revenue / before.cost : null;
      const label = (key: string) => ws.t(`gmvV2.compare.${key}`);
      return [
        { key: "spend", label: label("spend"), value: ws.formatCny(now.cost, totalsStore.value), change: change(now.cost, before?.cost), goodWhenUp: null },
        { key: "gmv", label: label("gmv"), value: ws.formatCny(now.revenue, totalsStore.value), change: change(now.revenue, before?.revenue), goodWhenUp: true },
        { key: "roi", label: label("roi"), value: roi === null ? "—" : ws.formatRoi(roi), change: change(roi, roiBefore), goodWhenUp: true },
        { key: "orders", label: label("orders"), value: ws.formatInteger(now.orders), change: change(now.orders, before?.orders), goodWhenUp: true },
      ];
    });
    function changeTone(value: number | null, goodWhenUp: boolean | null) {
      if (value === null || Math.abs(value) < 0.005 || goodWhenUp === null) return "is-flat";
      return value > 0 === goodWhenUp ? "is-up" : "is-down";
    }
    function changeText(value: number | null) {
      if (value === null) return "";
      if (Math.abs(value) < 0.005) return "0%";
      return `${value > 0 ? "▲" : "▼"} ${Math.min(999, Math.abs(value * 100)).toFixed(1)}%`;
    }
    function rowChange(campaign: { metrics: Totals & { roi: number }; previousMetrics?: (Totals & { roi: number }) | null }, key: "cost" | "revenue" | "roi") {
      return change(campaign.metrics[key], campaign.previousMetrics?.[key]);
    }
    const perOrder = (amount: number, orders: number) => (orders > 0 ? amount / orders : null);
    const activeFilterCount = computed(
      () =>
        [ws.minCampaignSpend.value, ws.minCampaignOrders.value, ws.minCampaignRoi.value, ws.minCampaignUtilization.value].filter(
          (value) => Number(value) > 0,
        ).length,
    );
    const isEnabled = (status: string) => String(status).toUpperCase() === "ENABLE";
    function beginEdit(campaign: Parameters<typeof manager.startEdit>[0], field: "budget" | "roi") {
      manager.startEdit(campaign, field);
      void nextTick(() => (document.querySelector('[data-testid="gmv-inline-input"]') as HTMLInputElement | null)?.select());
    }
    function closeMenu(event: Event) {
      (event.target as HTMLElement).closest("details")?.removeAttribute("open");
    }
    return { ...ws, ...manager, CAMPAIGN_COLUMNS, closeMenu, kpis, changeTone, changeText, rowChange, perOrder, activeFilterCount, isEnabled, beginEdit };
  },
});
</script>

<template>
  <section class="gmv-section gmv-campaigns-section gmv-dash-page gmv-am" data-testid="gmv-campaigns-page">
    <GmvKpiStrip :items="kpis" :compare="compareEnabled" data-testid="gmv-campaign-kpis" />

    <!-- Bulk bar replaces the toolbar while campaigns are selected -->
    <div v-if="selected.length" class="gmv-am__toolbar gmv-am__bulk" data-testid="gmv-bulk-bar">
      <strong class="gmv-am__bulk-count">{{ t("gmvV2.edit.selected", { count: selected.length }) }}</strong>
      <button class="gmv-button gmv-button--secondary" data-testid="gmv-bulk-enable" @click="bulkStatus('ENABLE')">{{ t("gmvV2.edit.enable") }}</button>
      <button class="gmv-button gmv-button--secondary" data-testid="gmv-bulk-pause" @click="bulkStatus('DISABLE')">{{ t("gmvV2.edit.pause") }}</button>
      <details class="gmv-dfilter gmv-am__adjust" data-testid="gmv-bulk-budget">
        <summary>{{ t("gmvV2.edit.adjustBudget") }}<ChevronDown class="gmv-icon" /></summary>
        <div class="gmv-filter-panel gmv-am__adjust-panel">
          <select v-model="bulkBudget.mode">
            <option value="up">{{ t("gmvV2.edit.modes.up") }}</option>
            <option value="down">{{ t("gmvV2.edit.modes.down") }}</option>
            <option value="set">{{ t("gmvV2.edit.modes.setBudget") }}</option>
          </select>
          <label><input v-model.number="bulkBudget.value" type="number" min="0" step="1" /><span>{{ bulkBudget.mode === "set" ? "" : "%" }}</span></label>
          <button class="gmv-button gmv-button--primary" data-testid="gmv-bulk-budget-apply" @click="closeMenu($event); bulkBudgetApply()">{{ t("gmvV2.edit.preview") }}</button>
        </div>
      </details>
      <details class="gmv-dfilter gmv-am__adjust" data-testid="gmv-bulk-roi">
        <summary>{{ t("gmvV2.edit.adjustRoi") }}<ChevronDown class="gmv-icon" /></summary>
        <div class="gmv-filter-panel gmv-am__adjust-panel">
          <select v-model="bulkRoi.mode">
            <option value="set">{{ t("gmvV2.edit.modes.setRoi") }}</option>
            <option value="up">{{ t("gmvV2.edit.modes.up") }}</option>
            <option value="down">{{ t("gmvV2.edit.modes.down") }}</option>
          </select>
          <label><input v-model.number="bulkRoi.value" type="number" min="0" step="0.1" /><span>{{ bulkRoi.mode === "set" ? "x" : "%" }}</span></label>
          <button class="gmv-button gmv-button--primary" data-testid="gmv-bulk-roi-apply" @click="closeMenu($event); bulkRoiApply()">{{ t("gmvV2.edit.preview") }}</button>
        </div>
      </details>
      <div class="gmv-am__spacer"></div>
      <button class="gmv-button gmv-button--secondary" data-testid="gmv-bulk-clear" @click="clearSelection"><X class="gmv-icon" />{{ t("gmvV2.edit.clear") }}</button>
    </div>

    <div v-else class="gmv-am__toolbar" data-testid="gmv-campaign-command">
      <label class="gmv-am__search">
        <Search />
        <input v-model="searchText" :placeholder="t('gmvV2.compare.search')" @keydown.enter="loadCampaignPage(1)" />
      </label>
      <div class="gmv-am__seg" data-testid="gmv-pacing-overview" role="group" :aria-label="t('gmvMaxConsole.pacing')">
        <button type="button" :class="{ 'is-active': campaignPacingState === 'all' }" @click="campaignPacingState = 'all'; loadCampaignPage(1)">
          {{ t("gmvV2.compare.allPacing") }}
        </button>
        <button
          v-for="state in pacingStates"
          :key="state"
          type="button"
          :class="{ 'is-active': campaignPacingState === state }"
          :title="t(`gmvMaxPacing.hint.${state}`)"
          @click="togglePacingFilter(state)"
        >
          {{ t(`gmvMaxPacing.state.${state}`) }}<em v-if="pacingSummary[state]">{{ pacingSummary[state] }}</em>
        </button>
      </div>
      <div class="gmv-am__spacer"></div>

      <details class="gmv-dfilter gmv-am__menu" data-testid="gmv-views">
        <summary><Bookmark class="gmv-icon" /><span>{{ views.find((view) => view.id === activeViewId)?.name || t("gmvV2.views.title") }}</span><ChevronDown class="gmv-icon" /></summary>
        <div class="gmv-filter-panel gmv-am__menu-panel">
          <p v-if="!views.length" class="gmv-am__menu-empty">{{ t("gmvV2.views.empty") }}</p>
          <div v-for="view in views" :key="view.id" class="gmv-am__view">
            <button type="button" :class="{ 'is-active': view.id === activeViewId }" data-testid="gmv-view-apply" @click="applyView(view)">
              <Check v-if="view.id === activeViewId" class="gmv-icon" />{{ view.name }}
            </button>
            <button type="button" class="gmv-am__view-remove" :aria-label="t('gmvV2.views.remove')" :title="t('gmvV2.views.remove')" @click="removeView(view.id)"><Trash2 class="gmv-icon" /></button>
          </div>
          <form class="gmv-am__view-save" @submit.prevent="saveView">
            <input v-model="viewName" data-testid="gmv-view-name" :placeholder="t('gmvV2.views.namePlaceholder')" maxlength="24" />
            <button class="gmv-button gmv-button--secondary" type="submit" data-testid="gmv-view-save" :disabled="!viewName.trim()">{{ t("gmvV2.views.save") }}</button>
          </form>
        </div>
      </details>

      <details class="gmv-dfilter gmv-am__menu" data-testid="gmv-columns">
        <summary><Columns3 class="gmv-icon" /><span>{{ t("gmvV2.columns.title") }}</span><ChevronDown class="gmv-icon" /></summary>
        <div class="gmv-filter-panel gmv-am__menu-panel">
          <label v-for="column in CAMPAIGN_COLUMNS" :key="column" class="gmv-am__check">
            <input type="checkbox" :checked="showColumn(column)" :data-testid="`gmv-column-${column}`" @change="toggleColumn(column)" />
            <span>{{ t(`gmvV2.columns.${column}`) }}</span>
          </label>
          <button type="button" class="gmv-dlink" @click="resetColumns">{{ t("gmvV2.columns.reset") }}</button>
        </div>
      </details>

      <details class="gmv-dfilter gmv-campaign-filter-toggle">
        <summary :title="t('gmvMaxTaskUi.details.metricFiltersHint')">
          <Filter class="gmv-icon" /><span>{{ t("gmvMaxTaskUi.details.metricFilters") }}</span
          ><b v-if="activeFilterCount" class="gmv-am__count">{{ activeFilterCount }}</b><ChevronDown class="gmv-icon" />
        </summary>
        <div class="gmv-filter-panel">
          <select v-model="campaignStatus">
            <option value="all">{{ t("gmvMaxData.allStatuses") }}</option>
            <option v-for="status in campaignStatuses" :key="status" :value="status">{{ operationStatusLabel(status) }}</option>
          </select>
          <label
            ><span>{{ t("gmvMaxData.minSpend") }} ({{ t("gmvMaxCurrency.cnyUnit") }})</span
            ><input v-model.number="minCampaignSpend" type="number" min="0" :disabled="moneyFilterDisabled()"
          /></label>
          <label><span>{{ t("gmvMaxData.minOrders") }}</span><input v-model.number="minCampaignOrders" type="number" min="0" /></label>
          <label><span>{{ t("gmvMaxData.minRoi") }}</span><input v-model.number="minCampaignRoi" type="number" min="0" step="0.01" /></label>
          <label><span>{{ t("gmvMaxData.minUtilization") }}</span><input v-model.number="minCampaignUtilization" type="number" min="0" max="100" /></label>
          <button class="gmv-button gmv-button--secondary" :disabled="campaignDataLoading" @click="loadCampaignPage(1)">
            <Filter class="gmv-icon" />{{ t("gmvMaxData.applyMetrics") }}
          </button>
        </div>
      </details>
      <button class="gmv-button gmv-button--secondary" :title="t('gmvV2.compare.evaluateHint')" @click="evaluate">
        <Zap class="gmv-icon" />{{ t("gmvMax.actions.evaluate") }}
      </button>
    </div>

    <div class="gmv-dcard" :class="{ 'is-loading': campaignDataLoading }" :aria-busy="campaignDataLoading">
      <div class="gmv-dscroll">
        <table class="gmv-dtable gmv-table--campaigns gmv-am__table">
          <thead>
            <tr>
              <th class="gmv-am__pick">
                <input type="checkbox" :checked="allSelected" :aria-label="t('gmvV2.edit.selectAll')" data-testid="gmv-select-all" @change="toggleSelectAll" />
              </th>
              <th>
                <button class="gmv-sort-button" @click="toggleCampaignSort('name')">
                  {{ t("gmvMax.fields.campaign") }}<small>{{ sortMark("name", campaignSortBy, campaignSortDirection) }}</small>
                </button>
              </th>
              <th v-if="showColumn('status')">{{ t("gmvMax.fields.status") }}</th>
              <th v-if="showColumn('budget')" class="is-num">
                <button class="gmv-sort-button" @click="toggleCampaignSort('budget')">
                  {{ t("gmvMax.fields.budget") }}<small>{{ sortMark("budget", campaignSortBy, campaignSortDirection) }}</small>
                </button>
              </th>
              <th v-if="showColumn('spend')" class="is-num">
                <button class="gmv-sort-button" @click="toggleCampaignSort('cost')">
                  {{ t("gmvMaxConsole.spend") }}<small>{{ sortMark("cost", campaignSortBy, campaignSortDirection) }}</small>
                </button>
              </th>
              <th v-if="showColumn('gmv')" class="is-num">{{ t("gmvV2.compare.gmv") }}</th>
              <th v-if="showColumn('roi')" class="is-num">
                <button class="gmv-sort-button" @click="toggleCampaignSort('roi')">
                  {{ t("gmvMaxConsole.actualRoi") }}<small>{{ sortMark("roi", campaignSortBy, campaignSortDirection) }}</small>
                </button>
              </th>
              <th v-if="showColumn('orders')" class="is-num">
                <button class="gmv-sort-button" @click="toggleCampaignSort('orders')">
                  {{ t("gmvMax.fields.orders") }}<small>{{ sortMark("orders", campaignSortBy, campaignSortDirection) }}</small>
                </button>
              </th>
              <th v-if="showColumn('cpa')" class="is-num">{{ t("gmvV2.columns.cpa") }}</th>
              <th v-if="showColumn('aov')" class="is-num">{{ t("gmvV2.columns.aov") }}</th>
              <th v-if="showColumn('protection')">{{ t("gmvV2.columns.protection") }}</th>
              <th><span class="gmv-visually-hidden">{{ t("gmvMaxConsole.editPolicy") }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="campaign in pagedCampaigns" :key="campaign.id" :class="{ 'is-selected': selected.includes(campaign.id) }">
              <td class="gmv-am__pick">
                <input type="checkbox" :checked="selected.includes(campaign.id)" :aria-label="campaign.name" data-testid="gmv-select-row" @change="toggleSelect(campaign.id)" />
              </td>
              <td class="gmv-dtable__name">
                <button class="gmv-campaign-link" data-testid="gmv-open-campaign-workspace" :title="campaign.name" @click="openCampaignWorkspace(campaign.id)">
                  <strong>{{ campaign.name }}</strong>
                </button>
                <small>
                  {{ campaign.binding?.storeName || campaign.binding?.advertiserName }} · {{ t(`gmvMax.types.${campaign.campaignType.toLowerCase()}`)
                  }}<template v-if="campaign.learning"> · {{ t(`gmvMaxLearning.stages.${campaign.learning.stage}`) }}</template>
                </small>
              </td>
              <td v-if="showColumn('status')">
                <button
                  type="button"
                  role="switch"
                  class="gmv-am__switch"
                  :class="{ 'is-on': isEnabled(campaign.operationStatus) }"
                  :aria-checked="isEnabled(campaign.operationStatus)"
                  :title="isEnabled(campaign.operationStatus) ? t('gmvV2.edit.pause') : t('gmvV2.edit.enable')"
                  data-testid="gmv-status-switch"
                  @click="toggleStatus(campaign)"
                >
                  <i></i><span>{{ operationStatusLabel(campaign.operationStatus) }}</span>
                </button>
                <button
                  v-if="campaign.recommendationCount"
                  class="gmv-dlink gmv-am__suggest"
                  type="button"
                  data-testid="gmv-open-campaign-recommendations"
                  :title="t('gmvMaxCampaignRecommendations.open')"
                  @click.stop="openCampaignRecommendations(campaign.id)"
                >
                  {{ t("gmvV2.compare.suggestions", { count: campaign.recommendationCount }) }}
                </button>
              </td>
              <td v-if="showColumn('budget')" class="is-num">
                <form v-if="editing?.campaignId === campaign.id && editing.field === 'budget'" class="gmv-am__inline" @submit.prevent="submitEdit(campaign)">
                  <input v-model="editing.value" type="number" min="0" step="1" data-testid="gmv-inline-input" @keydown.esc="cancelEdit" @blur="cancelEdit" />
                  <small>{{ t("gmvV2.edit.enterHint") }}</small>
                </form>
                <template v-else>
                  <span class="gmv-am__editable">
                    <strong :title="t('gmvMaxConsole.dailyBudget')">{{ formatCny(campaign.budget, campaign.storeId) }}</strong>
                    <button type="button" class="gmv-am__pen" data-testid="gmv-edit-budget" :aria-label="t('gmvV2.edit.editBudget')" :title="t('gmvV2.edit.editBudget')" @click="beginEdit(campaign, 'budget')"><Pencil /></button>
                  </span>
                  <small
                    v-if="campaign.pacing"
                    :class="['gmv-am__pacing', pacingTone(campaign.pacing.state)]"
                    :title="`${t('gmvMaxPacing.actualExpected')} ${percentage(campaign.pacing.actualSpendRatio)} / ${percentage(campaign.pacing.expectedSpendRatio)}`"
                    >{{ t(`gmvMaxPacing.state.${campaign.pacing.state}`) }} · {{ percentage(campaign.pacing.actualSpendRatio) }}</small
                  >
                </template>
              </td>
              <td v-if="showColumn('spend')" class="is-num">
                <strong>{{ campaign.metrics.samples ? formatCny(campaign.metrics.cost, campaign.storeId) : "—" }}</strong>
                <small v-if="compareEnabled && rowChange(campaign, 'cost') !== null" class="gmv-kpistrip__change is-flat">{{ changeText(rowChange(campaign, "cost")) }}</small>
              </td>
              <td v-if="showColumn('gmv')" class="is-num">
                <strong>{{ campaign.metrics.samples ? formatCny(campaign.metrics.revenue, campaign.storeId) : "—" }}</strong>
                <small v-if="compareEnabled && rowChange(campaign, 'revenue') !== null" :class="['gmv-kpistrip__change', changeTone(rowChange(campaign, 'revenue'), true)]">{{
                  changeText(rowChange(campaign, "revenue"))
                }}</small>
              </td>
              <td v-if="showColumn('roi')" class="is-num">
                <strong
                  :class="['gmv-dot', 'gmv-dot--end', campaignRoiTone(campaign)]"
                  :title="`${t('gmvMaxLearning.profitFloor')} ${formatRoi(campaign.profitGuard.effectiveRoiFloor)}`"
                  >{{ campaign.metrics.samples && campaign.metrics.cost > 0 ? formatRoi(campaign.metrics.roi) : "—" }}</strong
                >
                <form v-if="editing?.campaignId === campaign.id && editing.field === 'roi'" class="gmv-am__inline" @submit.prevent="submitEdit(campaign)">
                  <input v-model="editing.value" type="number" min="0" step="0.1" data-testid="gmv-inline-input" @keydown.esc="cancelEdit" @blur="cancelEdit" />
                </form>
                <small v-else class="gmv-am__editable">
                  {{ t("gmvV2.lines.target") }} {{ formatRoi(campaign.roasBid) }}
                  <button type="button" class="gmv-am__pen" data-testid="gmv-edit-roi" :aria-label="t('gmvV2.edit.editRoi')" :title="t('gmvV2.edit.editRoi')" @click="beginEdit(campaign, 'roi')"><Pencil /></button>
                </small>
              </td>
              <td v-if="showColumn('orders')" class="is-num">
                <strong>{{ campaign.metrics.samples ? formatInteger(campaign.metrics.orders) : "—" }}</strong>
              </td>
              <td v-if="showColumn('cpa')" class="is-num">
                <strong>{{ perOrder(campaign.metrics.cost, campaign.metrics.orders) === null ? "—" : formatCny(perOrder(campaign.metrics.cost, campaign.metrics.orders), campaign.storeId) }}</strong>
              </td>
              <td v-if="showColumn('aov')" class="is-num">
                <strong>{{ perOrder(campaign.metrics.revenue, campaign.metrics.orders) === null ? "—" : formatCny(perOrder(campaign.metrics.revenue, campaign.metrics.orders), campaign.storeId) }}</strong>
              </td>
              <td v-if="showColumn('protection')">
                <span :class="['gmv-dot', campaign.profitGuard.complete ? (campaign.metrics.roi < metricNumber(campaign.profitGuard.effectiveRoiFloor) ? 'gvt-critical' : 'gvt-good') : 'gvt-warning']">{{
                  t(`gmvMaxOfficial.protection.${campaign.profitGuard.complete ? (campaign.metrics.roi < metricNumber(campaign.profitGuard.effectiveRoiFloor) ? "risk" : "eligible") : "incomplete"}`)
                }}</span>
                <small>{{ t("gmvMaxLearning.profitFloor") }} {{ formatRoi(campaign.profitGuard.effectiveRoiFloor) }}</small>
              </td>
              <td>
                <div class="gmv-row__actions gmv-am__actions">
                  <button class="gmv-icon-button" data-testid="gmv-open-campaign-creatives" :title="t('gmvMaxCampaignLinks.creatives')" :aria-label="t('gmvMaxCampaignLinks.creatives')" @click="openCampaignCreatives(campaign.id)">
                    <Film class="gmv-icon" /></button
                  ><button class="gmv-icon-button" data-testid="gmv-open-campaign-products" :title="t('gmvMaxCampaignLinks.products')" :aria-label="t('gmvMaxCampaignLinks.products')" @click="openCampaignProducts(campaign.id)">
                    <Package class="gmv-icon" /></button
                  ><button class="gmv-icon-button" data-testid="gmv-open-policy" :title="t('gmvMaxConsole.editPolicy')" :aria-label="t('gmvMaxConsole.editPolicy')" @click="openPolicy(campaign.id)">
                    <SlidersHorizontal class="gmv-icon" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="campaignDataLoading && !campaignDataPage.items.length" class="gmv-empty">{{ t("gmvMaxData.loadingPage") }}</div>
        <div v-else-if="!campaignDataPage.total" class="gmv-empty">{{ t("gmvMax.empty.campaigns") }}</div>
      </div>
      <div class="gmv-pagination">
        <span>{{ t("gmvMaxData.pageSummary", { current: campaignPage, total: campaignPageCount, count: campaignDataPage.total }) }}</span
        ><select v-model.number="campaignPageSize">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option></select
        ><button class="gmv-button gmv-button--secondary" :disabled="campaignPage <= 1 || campaignDataLoading" @click="loadCampaignPage(campaignPage - 1)">
          {{ t("gmvMaxData.previous") }}</button
        ><button class="gmv-button gmv-button--secondary" :disabled="campaignPage >= campaignPageCount || campaignDataLoading" @click="loadCampaignPage(campaignPage + 1)">
          {{ t("gmvMaxData.next") }}
        </button>
      </div>
    </div>

    <GmvChangeDialog
      v-if="dialog.open"
      :rows="dialog.rows"
      :phase="dialog.phase"
      :results="dialog.results"
      :blocked-reason="blockedReason"
      @confirm="confirmDialog"
      @close="closeDialog"
      @undo="undo"
    />
  </section>
</template>
