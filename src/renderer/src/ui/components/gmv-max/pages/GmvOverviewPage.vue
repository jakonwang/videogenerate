<script lang="ts">
// Account overview page. State and handlers come from TiktokGmvMaxOptimizerView via provide/inject.
import { computed, defineComponent } from "vue";
import { Gauge, ArrowUpRight, Clock3, Store, ChevronRight, RefreshCw, Unlink, ClipboardCheck } from "lucide-vue-next";
import { useGmvWorkspace } from "./workspaceContext";
import { periodChange } from "./periodChange";
import GmvKpiStrip, { type GmvKpi } from "../GmvKpiStrip.vue";

type Totals = { cost: number; revenue: number; orders: number };

export default defineComponent({
  name: "GmvOverviewPage",
  components: { Gauge, ArrowUpRight, Clock3, Store, ChevronRight, RefreshCw, Unlink, ClipboardCheck, GmvKpiStrip },
  setup() {
    const ws = useGmvWorkspace();
    /**
     * Five headline numbers. Money is shown in CNY when every store has a rate, otherwise in the store currency
     * (from the campaign page totals); the period change always comes from the campaign page totals.
     */
    const overviewKpis = computed<GmvKpi[]>(() => {
      const t = ws.t;
      const performance = ws.performanceSummary.value;
      const profit = ws.executiveProfit.value;
      const page = ws.campaignDataPage.value as { summary: Totals; previousSummary?: Totals };
      const now = page.summary;
      const before = page.previousSummary;
      const store = ws.selectedStore.value !== "all" ? ws.selectedStore.value : ws.uniqueStores.value[0]?.storeId;
      const money = (cny: number, native: number) => (performance.moneyReady ? ws.formatCny(cny, undefined, true) : ws.formatCny(native, store));
      const roi = performance.cost > 0 ? performance.revenue / performance.cost : null;
      const roiNow = now.cost > 0 ? now.revenue / now.cost : null;
      const roiBefore = before && before.cost > 0 ? before.revenue / before.cost : null;
      return [
        { key: "gmv", label: t("gmvMaxV2.overview.gmv"), value: money(performance.revenue, now.revenue), change: periodChange(now.revenue, before?.revenue), goodWhenUp: true },
        { key: "spend", label: t("gmvMaxV2.overview.spend"), value: money(performance.cost, now.cost), change: periodChange(now.cost, before?.cost), goodWhenUp: null },
        { key: "roi", label: t("gmvMaxV2.overview.actualRoi"), value: (roi ?? roiNow) === null ? "—" : ws.formatRoi(roi ?? roiNow), change: periodChange(roiNow, roiBefore), goodWhenUp: true },
        {
          key: "profit",
          label: t("gmvMaxV2.overview.estimatedProfit"),
          value: profit.profitReady && profit.moneyReady ? ws.formatCny(profit.netProfit, undefined, true) : "—",
          hint: t("gmvMaxV2.overview.estimatedHint"),
        },
        {
          key: "todo",
          label: t("gmvMaxV2.overview.risk"),
          value: String(ws.commandCenter.value.actionSummary.mustFix),
          hint: `${t("gmvMaxV2.overview.opportunity")} ${ws.commandCenter.value.actionSummary.recommended}`,
        },
      ];
    });
    return { ...ws, overviewKpis };
  },
});
</script>

<template>
<section class="gmv-section">
  <GmvKpiStrip :items="overviewKpis" :compare="compareEnabled" data-testid="gmv-control-strip" />
  <section
    class="gmv-panel gmv-priority-panel gmv-v2-priority-panel"
    data-testid="gmv-today-actions"
  >
    <div class="gmv-panel__heading">
      <div>
        <h2>{{ t("gmvMaxV2.overview.topActions") }}</h2>
        <p>{{ t("gmvMaxV2.overview.topActionsHint") }}</p>
      </div>
      <button
        class="gmv-button gmv-button--ghost"
        @click="activeTab = 'actions'"
      >
        {{ t("gmvMaxConsole.viewAll")
        }}<ArrowUpRight class="gmv-icon" />
      </button>
    </div>
    <div v-if="commandCenter.topActions.length" class="gmv-v2-action-list">
      <button
        v-for="(item, index) in commandCenter.topActions"
        :key="item.id"
        @click="handleCommandCenterAction(item)"
      >
        <em>{{ index + 1 }}</em>
        <div class="gmv-v2-action-list__main">
          <span :class="['gmv-status', item.category === 'high_risk' ? 'is-danger' : item.category === 'high_opportunity' ? 'is-success' : item.category === 'observing' ? 'is-blue' : 'is-warning']">{{ t(`gmvMaxV2.action.category.${item.category}`) }}</span>
          <strong>{{ item.productName || item.campaignName }}</strong>
          <small>{{ recommendationReasonLabel(item.reason) }}</small>
        </div>
        <div class="gmv-v2-action-list__impact">
          <span>{{ t("gmvMaxV2.action.impact") }}</span>
          <strong>{{ item.projectionSource === "modeled" ? formatCny(item.projectedNetProfitDelta, item.storeId) : t("gmvMaxV2.action.unavailable") }}</strong>
          <small>{{ t(`gmvMaxV2.action.status.${item.status}`) }}</small>
        </div>
        <ArrowUpRight />
      </button>
    </div>
    <div v-else class="gmv-empty gmv-empty--small">
      {{ t("gmvMaxOperations.noTodayActions") }}
    </div>
  </section>
  <div class="gmv-ops-grid">
    <section class="gmv-panel gmv-flow-panel">
      <div class="gmv-panel__heading">
        <div>
          <h2>{{ t("gmvMaxConsole.flowTitle") }}</h2>
          <p>{{ t("gmvMaxConsole.flowSubtitle") }}</p>
        </div>
        <span class="gmv-status is-blue"
          ><Clock3 class="gmv-icon" />{{
            t("gmvMaxConsole.completeData")
          }}</span
        >
      </div>
      <div v-if="dailyFlow.length" class="gmv-flow-chart">
        <div
          v-for="item in dailyFlow"
          :key="item.date"
          class="gmv-flow-day"
        >
          <div class="gmv-flow-bars">
            <span
              class="gmv-flow-bar is-cost"
              :style="{
                height: `${Math.max(5, (item.cost / maxDailyCost) * 100)}%`,
              }"
            ></span
            ><span
              class="gmv-flow-bar is-revenue"
              :style="{
                height: `${Math.max(5, (Math.min(item.revenue, maxDailyCost * 4) / (maxDailyCost * 4)) * 100)}%`,
              }"
            ></span>
          </div>
          <strong>{{ formatRoi(item.roi) }}</strong
          ><small>{{ flowDateLabel(item.date) }}</small>
        </div>
      </div>
      <div v-else class="gmv-empty gmv-empty--small">
        {{ t("gmvMaxConsole.noFlowData") }}
      </div>
      <div class="gmv-chart-legend">
        <span
          ><i class="is-cost"></i>{{ t("gmvMaxConsole.spend") }}</span
        ><span
          ><i class="is-revenue"></i
          >{{ t("gmvMaxConsole.grossRevenue") }}</span
        ><span>{{ t("gmvMaxConsole.barValueRoi") }}</span>
      </div>
    </section>
    <section class="gmv-panel gmv-store-panel">
      <div class="gmv-panel__heading">
        <div>
          <h2>{{ t("gmvMaxConsole.storeControl") }}</h2>
          <p>{{ t("gmvMaxConsole.storeControlSubtitle") }}</p>
        </div>
        <Store class="gmv-heading-icon" />
      </div>
      <div class="gmv-store-list">
        <button
          v-for="store in storeHealth"
          :key="store.storeId"
          @click="selectedStore = store.storeId"
        >
          <span class="gmv-store-avatar">{{
            store.storeName.slice(0, 2).toUpperCase()
          }}</span>
          <span
            ><strong>{{ store.storeName }}</strong
            ><small
              >{{
                formatPercent(
                  storeProfitSummary(store.storeId)
                    ?.spendCoveragePercent ?? 0,
                  true,
                )
              }}
              {{ t("gmvMaxOperations.spendCoverage") }} /
              {{ formatInteger(store.automatic) }}
              {{ t("gmvMaxConsole.automatic") }}</small
            ></span
          >
          <span class="gmv-store-value"
            ><strong
              :class="
                storeProfitSummary(store.storeId)
                  ?.profitEstimateAvailable
                  ? metricNumber(
                      storeProfitSummary(store.storeId)
                        ?.estimatedNetProfit,
                    ) >= 0
                    ? 'is-positive'
                    : 'is-negative'
                  : ''
              "
              >{{
                storeProfitValue(storeProfitSummary(store.storeId))
              }}</strong
            ><small>{{ t("gmvMaxProfit.netProfit") }}</small></span
          >
          <ChevronRight class="gmv-icon" />
        </button>
      </div>
    </section>
  </div>
  <div class="gmv-grid gmv-grid--overview">
    <section class="gmv-panel">
      <div class="gmv-panel__heading">
        <div>
          <h2>{{ t("gmvMax.connection.title") }}</h2>
          <p>{{ t("gmvMax.connection.subtitle") }}</p>
        </div>
      </div>
      <div v-if="dashboard.connections.length" class="gmv-stack">
        <div
          v-for="connection in dashboard.connections"
          :key="connection.id"
          class="gmv-row"
        >
          <div>
            <strong>{{ connection.name }}</strong
            ><small>{{ formatDate(connection.expiresAt) }}</small>
          </div>
          <div class="gmv-row__actions">
            <span
              :class="['gmv-status', statusClass(connection.state)]"
              >{{
                t(`gmvMax.status.${connection.state}`, connection.state)
              }}</span
            >
            <button
              v-if="connection.state === 'error'"
              class="gmv-icon-button"
              :title="t('gmvMax.actions.refresh')"
              :disabled="!!busyAction"
              @click="reconnect(connection.id)"
            >
              <RefreshCw class="gmv-icon" />
            </button>
            <button
              class="gmv-icon-button"
              :title="t('gmvMax.actions.disconnect')"
              :disabled="!!busyAction"
              @click="disconnect(connection.id)"
            >
              <Unlink class="gmv-icon" />
            </button>
          </div>
        </div>
      </div>
      <div v-else class="gmv-empty">
        {{ t("gmvMax.empty.connections") }}
      </div>
    </section>
    <section class="gmv-panel">
      <div class="gmv-panel__heading">
        <div>
          <h2>{{ t("gmvMax.scheduler.title") }}</h2>
          <p>{{ t("gmvMax.scheduler.subtitle") }}</p>
        </div>
        <span
          :class="[
            'gmv-status',
            dashboard.scheduler.running ? 'is-warning' : 'is-success',
          ]"
          >{{
            dashboard.scheduler.running
              ? t("gmvMax.status.running")
              : t("gmvMax.status.ready")
          }}</span
        >
      </div>
      <dl class="gmv-details">
        <div>
          <dt>{{ t("gmvMax.scheduler.lastRun") }}</dt>
          <dd>{{ formatDate(dashboard.scheduler.lastRunAt) }}</dd>
        </div>
        <div>
          <dt>{{ t("gmvMaxOperations.lastSuccess") }}</dt>
          <dd>
            {{ formatDate(dashboard.scheduler.lastSuccessfulRunAt) }}
          </dd>
        </div>
        <div>
          <dt>{{ t("gmvMax.scheduler.nextRun") }}</dt>
          <dd>{{ formatDate(dashboard.scheduler.nextRunAt) }}</dd>
        </div>
        <div>
          <dt>{{ t("gmvMaxOperations.failures") }}</dt>
          <dd>
            {{ formatInteger(dashboard.scheduler.consecutiveFailures) }}
          </dd>
        </div>
        <div>
          <dt>{{ t("gmvMaxOperations.recoveryTasks") }}</dt>
          <dd>
            {{ formatInteger(dashboard.scheduler.recoveryTaskCount) }}
          </dd>
        </div>
        <div>
          <dt>{{ t("gmvMax.scheduler.dataCutoff") }}</dt>
          <dd>{{ t("gmvMax.scheduler.previousDay") }}</dd>
        </div>
      </dl>
      <button
        class="gmv-button gmv-button--secondary"
        :disabled="!connected || !!busyAction"
        @click="evaluate"
      >
        <ClipboardCheck class="gmv-icon" />{{
          t("gmvMax.actions.evaluate")
        }}
      </button>
    </section>
  </div>
  <section class="gmv-panel gmv-overview-table">
    <div class="gmv-panel__heading">
      <div>
        <h2>{{ t("gmvMaxConsole.readiness") }}</h2>
        <p>{{ t("gmvMaxConsole.readinessSubtitle") }}</p>
      </div>
      <button
        class="gmv-button gmv-button--ghost"
        @click="activeTab = 'campaigns'"
      >
        {{ t("gmvMaxConsole.viewAll")
        }}<ArrowUpRight class="gmv-icon" />
      </button>
    </div>
    <div class="gmv-health-list">
      <button
        v-for="(campaign, index) in filteredCampaigns.slice(0, 8)"
        :key="campaign.id"
        class="gmv-health-row"
        @click="openPolicy(campaign.id)"
      >
        <span class="gmv-health-rank">{{
          String(index + 1).padStart(2, "0")
        }}</span
        ><span
          class="gmv-health-dot"
          :class="
            policyMap.get(campaign.id)?.automationEnabled ? 'is-on' : ''
          "
        ></span
        ><span class="gmv-health-name"
          ><strong :title="campaign.name">{{
            compactCampaignName(campaign.name)
          }}</strong
          ><small
            ><b>{{ campaignIdentityCode(campaign.name) }}</b
            ><i>·</i
            >{{
              bindingForCampaign(campaign)?.storeName ||
              t("gmvMaxSopUi.notAvailable")
            }}</small
          ></span
        ><span class="gmv-health-state"
          ><strong>{{
            policyMap.get(campaign.id)?.automationEnabled
              ? t("gmvMaxConsole.automatic")
              : t("gmvMaxConsole.manual")
          }}</strong
          ><small>{{
            policyPresetLabel(policyMap.get(campaign.id)?.preset)
          }}</small></span
        ><span class="gmv-health-metric"
          ><small>{{ t("gmvMax.fields.budget") }}</small
          ><strong>{{
            formatCny(campaign.budget, campaign.storeId)
          }}</strong></span
        ><span class="gmv-health-metric"
          ><small>{{ t("gmvMax.fields.targetRoi") }}</small
          ><strong>ROI {{ formatRoi(campaign.roasBid) }}</strong></span
        ><ChevronRight class="gmv-icon" />
      </button>
    </div>
  </section>
</section>
</template>
