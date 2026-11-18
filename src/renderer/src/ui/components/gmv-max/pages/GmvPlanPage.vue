<script lang="ts">
// sop page of the GMV MAX workspace. State and handlers come from TiktokGmvMaxOptimizerView via provide/inject.
import { defineComponent } from "vue";
import { Store, Filter, Package, Activity, CheckCircle2, PauseCircle, ChevronRight, CalendarRange, Settings2, ChevronDown, ShieldAlert, ArrowUpRight, RefreshCw, Check, Clock3, Film, Plus, Copy, Rocket, BookOpen, ExternalLink, ShieldCheck, Save, FileSpreadsheet, Download, Upload, PlayCircle } from "lucide-vue-next";
import { useGmvWorkspace } from "./workspaceContext";

export default defineComponent({
  name: "GmvPlanPage",
  components: { Store, Filter, Package, Activity, CheckCircle2, PauseCircle, ChevronRight, CalendarRange, Settings2, ChevronDown, ShieldAlert, ArrowUpRight, RefreshCw, Check, Clock3, Film, Plus, Copy, Rocket, BookOpen, ExternalLink, ShieldCheck, Save, FileSpreadsheet, Download, Upload, PlayCircle },
  setup() {
    return useGmvWorkspace();
  },
});
</script>

<template>
<section
  class="gmv-section gmv-sop"
  data-testid="gmv-sop-workspace"
>
  <div class="gmv-growth-cycle-actions">
    <div class="gmv-growth-cycle-actions__context">
      <span class="gmv-kicker">{{ t("gmvMaxCockpit.lifecycle") }}</span>
      <strong>{{
        selectedSop
          ? selectedSop.productName ||
            selectedSop.productId ||
            t("gmvMaxSop.liveScope")
          : t("gmvMaxSop.empty")
      }}</strong>
      <small v-if="selectedSop"
        >{{ selectedSop.storeName }} / {{ selectedSop.campaignName }}</small
      ><small v-else>{{ t("gmvMaxSop.emptyHint") }}</small>
    </div>
    <div class="gmv-row__actions">
      <button
        v-if="selectedSop"
        class="gmv-button gmv-button--secondary"
        data-testid="gmv-sop-toggle-status"
        :title="
          t(
            `gmvMaxSopActionLabels.${selectedSop.status === 'paused' ? 'resumeCurrentHint' : 'pauseCurrentHint'}`,
          )
        "
        :disabled="!!busyAction"
        @click="toggleSopStatus"
      >
        <component
          :is="
            selectedSop.status === 'paused' ? PlayCircle : PauseCircle
          "
          class="gmv-icon"
        />{{
          t(
            `gmvMaxSopActionLabels.${selectedSop.status === "paused" ? "resumeCurrent" : "pauseCurrent"}`,
          )
        }}
      </button>
      <button
        v-if="selectedSop"
        class="gmv-button gmv-button--primary"
        data-testid="gmv-sop-toggle-start"
        :title="
          t(
            sopLaunchExpanded
              ? 'common.cancel'
              : 'gmvMaxSopActionLabels.startCycleHint',
          )
        "
        :disabled="!!busyAction"
        @click="sopLaunchExpanded = !sopLaunchExpanded"
      >
        <component
          :is="sopLaunchExpanded ? X : Plus"
          class="gmv-icon"
        />{{
          sopLaunchExpanded
            ? t("common.cancel")
            : t("gmvMaxSopActionLabels.startCycle")
        }}
      </button>
    </div>
  </div>

  <section
    class="gmv-decision-center"
    data-testid="gmv-decision-center"
  >
    <section
      class="gmv-decision-scope"
      data-testid="gmv-decision-scope"
    >
      <div class="gmv-decision-scope__stores">
        <div class="gmv-decision-scope__label">
          <Store /><span
            ><strong>{{ t("gmvMaxConsole.storeControl") }}</strong
            ><small
              >{{ decisionStoreOptions.length }}
              {{ t("gmvMaxOfficial.storeCount") }}</small
            ></span
          >
          <button
            type="button"
            class="gmv-icon-button"
            data-testid="gmv-decision-scope-toggle"
            :title="t('gmvMaxSimpleNav.filters')"
            :aria-expanded="decisionScopeExpanded"
            @click="decisionScopeExpanded = !decisionScopeExpanded"
          >
            <Filter class="gmv-icon" />
          </button>
        </div>
        <div
          class="gmv-decision-store-tabs"
          role="tablist"
          :aria-label="t('gmvMaxConsole.storeControl')"
        >
          <button
            type="button"
            role="tab"
            data-testid="gmv-decision-store-all"
            :aria-selected="decisionStoreFilter === 'all'"
            :class="{ 'is-active': decisionStoreFilter === 'all' }"
            @click="setDecisionStoreFilter('all')"
          >
            <Store /><span
              ><strong>{{ t("gmvMaxConsole.allStores") }}</strong
              ><small
                >{{ decisionRowsByTypeAndStatus.length }}
                {{ t("gmvMax.metrics.campaigns") }}</small
              ></span
            >
          </button>
          <button
            v-for="store in decisionStoreOptions"
            :key="store.id"
            type="button"
            role="tab"
            :data-store-id="store.id"
            :aria-selected="decisionStoreFilter === store.id"
            :class="{ 'is-active': decisionStoreFilter === store.id }"
            @click="setDecisionStoreFilter(store.id)"
          >
            <Store /><span
              ><strong>{{ store.name }}</strong
              ><small
                >{{ store.count }}
                {{ t("gmvMax.metrics.campaigns") }}</small
              ></span
            >
          </button>
        </div>
      </div>
      <div
        v-if="decisionScopeExpanded"
        class="gmv-decision-scope__filters"
        data-testid="gmv-decision-advanced-filters"
      >
        <div
          class="gmv-decision-scope-filter"
          data-testid="gmv-decision-type-filter"
        >
          <span>{{ t("gmvMax.fields.type") }}</span>
          <div role="group" :aria-label="t('gmvMax.fields.type')">
            <button
              type="button"
              data-type="all"
              :class="{ 'is-active': decisionTypeFilter === 'all' }"
              @click="setDecisionTypeFilter('all')"
            >
              <Filter />{{ t("gmvMaxConsole.allTypes") }}
            </button>
            <button
              type="button"
              data-type="PRODUCT"
              :class="{ 'is-active': decisionTypeFilter === 'PRODUCT' }"
              @click="setDecisionTypeFilter('PRODUCT')"
            >
              <Package />{{ t("gmvMax.types.product") }}
            </button>
            <button
              type="button"
              data-type="LIVE"
              :class="{ 'is-active': decisionTypeFilter === 'LIVE' }"
              @click="setDecisionTypeFilter('LIVE')"
            >
              <Activity />{{ t("gmvMax.types.live") }}
            </button>
          </div>
        </div>
        <div
          class="gmv-decision-scope-filter"
          data-testid="gmv-decision-status-filter"
        >
          <span>{{ t("gmvMax.fields.status") }}</span>
          <div role="group" :aria-label="t('gmvMax.fields.status')">
            <button
              type="button"
              data-status="all"
              :class="{ 'is-active': decisionStatusFilter === 'all' }"
              @click="setDecisionStatusFilter('all')"
            >
              {{ t("gmvMaxConsole.status.all") }}
            </button>
            <button
              type="button"
              data-status="enabled"
              class="is-enabled"
              :class="{
                'is-active': decisionStatusFilter === 'enabled',
              }"
              @click="setDecisionStatusFilter('enabled')"
            >
              <CheckCircle2 />{{ t("gmvMaxConsole.enabled") }}
            </button>
            <button
              type="button"
              data-status="disabled"
              class="is-disabled"
              :class="{
                'is-active': decisionStatusFilter === 'disabled',
              }"
              @click="setDecisionStatusFilter('disabled')"
            >
              <PauseCircle />{{ t("gmvMaxOperationStatus.disable") }}
            </button>
          </div>
        </div>
        <span class="gmv-decision-scope__total"
          ><strong>{{ scopedDecisionRows.length }}</strong
          >{{ t("gmvMax.metrics.campaigns") }}</span
        >
      </div>
    </section>
    <div
      class="gmv-today-status"
      data-testid="gmv-today-status-summary"
    >
      <article class="is-action">
        <span>{{ t("gmvMaxCoach.actionRequired") }}</span
        ><strong>{{ sopWorkspace.coachSummary.actionRequired }}</strong
        ><small>{{ t("gmvMaxDecision.priority.p0Hint") }}</small>
      </article>
      <article class="is-observing">
        <span>{{ t("gmvMaxCoach.observing") }}</span
        ><strong>{{ sopWorkspace.coachSummary.observing }}</strong
        ><small>{{ t("gmvMaxDecision.priority.p1Hint") }}</small>
      </article>
      <article class="is-normal">
        <span>{{ t("gmvMaxCoach.normal") }}</span
        ><strong>{{ sopWorkspace.coachSummary.normal }}</strong
        ><small>{{ t("gmvMaxDecision.priority.p2Hint") }}</small>
      </article>
      <article class="is-suggested">
        <span>{{ t("gmvMaxCoach.suggestedActions") }}</span
        ><strong>{{
          sopWorkspace.coachSummary.suggestedActions
        }}</strong
        ><small>{{ t("gmvMaxOfficial.pendingSuggestions") }}</small>
      </article>
    </div>
    <div class="gmv-decision-workbench">
      <div class="gmv-panel gmv-decision-table-panel">
        <div class="gmv-decision-panel-heading">
          <div>
            <h2>{{ t("gmvMaxDecisionScope.queue") }}</h2>
            <p>{{ t("gmvMaxDecisionScope.queueHint") }}</p>
          </div>
          <div
            class="gmv-decision-filters"
            role="group"
            :aria-label="t('gmvMaxDecision.productDecisions')"
          >
            <button
              type="button"
              :class="{ 'is-active': decisionPriorityFilter === 'all' }"
              @click="setDecisionPriorityFilter('all')"
            >
              {{ t("gmvMaxConsole.status.all") }}
            </button>
            <button
              v-for="priority in ['P0', 'P1', 'P2'] as const"
              :key="priority"
              type="button"
              :class="[
                `is-${priority.toLowerCase()}`,
                { 'is-active': decisionPriorityFilter === priority },
              ]"
              @click="setDecisionPriorityFilter(priority)"
            >
              {{ priority }}
            </button>
            <span
              >{{ filteredDecisionRows.length }}
              {{ t("gmvMaxDecisionScope.items") }}</span
            >
          </div>
        </div>
        <div
          v-if="pagedDecisionRows.length"
          class="gmv-decision-grid"
          data-testid="gmv-decision-grid"
        >
          <button
            v-for="item in pagedDecisionRows"
            :key="item.decision.id"
            type="button"
            :data-store-id="item.instance.storeId"
            :data-campaign-type="item.instance.campaignType"
            :data-campaign-enabled="
              isDecisionCampaignEnabled(
                item.instance.campaignOperationStatus,
              )
            "
            :class="[
              'gmv-decision-card',
              `is-${item.decision.priority.toLowerCase()}`,
              { 'is-selected': item.instance.id === selectedSopId },
            ]"
            :title="t('gmvMaxDecision.viewReason')"
            @click="selectSopInstance(item.instance.id)"
          >
            <span class="gmv-decision-card__media">
              <Package />
              <img
                v-if="item.decision.productImageUrl"
                :src="item.decision.productImageUrl"
                :alt="
                  item.decision.productName ||
                  item.decision.productId ||
                  item.instance.campaignName
                "
                loading="lazy"
                @error="hideBrokenSopImage"
              />
              <i>{{ item.decision.priority }}</i>
            </span>
            <span class="gmv-decision-card__content">
              <span class="gmv-decision-card__identity">
                <span
                  :class="[
                    'gmv-decision-status',
                    `is-${item.decision.status.toLowerCase()}`,
                  ]"
                  >{{ item.decision.status }}
                  {{
                    t(`gmvMaxDecision.status.${item.decision.status}`)
                  }}</span
                >
                <span class="gmv-decision-card__scope">
                  <i class="is-type"
                    ><component
                      :is="
                        item.instance.campaignType === 'LIVE'
                          ? Activity
                          : Package
                      "
                    />{{
                      t(
                        `gmvMax.types.${item.instance.campaignType.toLowerCase()}`,
                      )
                    }}</i
                  >
                  <i
                    :class="
                      isDecisionCampaignEnabled(
                        item.instance.campaignOperationStatus,
                      )
                        ? 'is-enabled'
                        : 'is-disabled'
                    "
                    ><component
                      :is="
                        isDecisionCampaignEnabled(
                          item.instance.campaignOperationStatus,
                        )
                          ? CheckCircle2
                          : PauseCircle
                      "
                    />{{
                      operationStatusLabel(
                        item.instance.campaignOperationStatus,
                      )
                    }}</i
                  >
                </span>
                <small><Store />{{ item.instance.storeName }}</small>
              </span>
              <strong class="gmv-decision-card__title">{{
                item.decision.productName ||
                item.decision.productId ||
                item.instance.campaignName
              }}</strong>
              <span class="gmv-decision-card__metrics">
                <span
                  ><small>ROI</small
                  ><strong>{{
                    formatRoi(item.decision.actualRoi)
                  }}</strong
                  ><em
                    >{{ formatRoi(item.decision.targetRoi) }} /
                    {{ formatRoi(item.decision.breakEvenRoi) }}</em
                  ></span
                >
                <span
                  ><small>{{ t("gmvMaxConsole.spend") }}</small
                  ><strong>{{
                    formatCny(
                      item.decision.spend,
                      item.decision.storeId,
                    )
                  }}</strong
                  ><em>{{
                    item.decision.budgetUtilization
                      ? formatPercent(item.decision.budgetUtilization)
                      : "-"
                  }}</em></span
                >
                <span
                  ><small>GMV</small
                  ><strong>{{
                    formatCny(
                      item.decision.grossRevenue,
                      item.decision.storeId,
                    )
                  }}</strong
                  ><em>{{
                    item.decision.spendVelocity
                      ? Number(item.decision.spendVelocity).toFixed(2)
                      : "-"
                  }}</em></span
                >
                <span
                  ><small>{{ t("gmvMax.fields.orders") }}</small
                  ><strong>{{
                    formatInteger(item.instance.metrics.orders)
                  }}</strong
                  ><em
                    >{{ t("gmvMaxDecision.health") }}
                    {{
                      item.decision.healthScore
                        ? formatInteger(item.decision.healthScore)
                        : "-"
                    }}</em
                  ></span
                >
              </span>
              <span class="gmv-decision-card__action"
                ><span
                  :class="[
                    'gmv-decision-action',
                    `is-${item.decision.priority.toLowerCase()}`,
                  ]"
                  >{{
                    t(
                      `gmvMaxDecision.actions.${item.decision.recommendedAction}`,
                    )
                  }}</span
                ><small v-if="item.decision.blockedReasons.length">{{
                  t("gmvMaxDecision.diagnosisOnly")
                }}</small></span
              >
            </span>
            <ChevronRight class="gmv-decision-card__arrow" />
          </button>
        </div>
        <div
          v-if="filteredDecisionRows.length"
          class="gmv-decision-pagination"
        >
          <span>{{
            t("gmvMaxData.pageSummary", {
              current: decisionPage,
              total: decisionPageCount,
              count: filteredDecisionRows.length,
            })
          }}</span>
          <div>
            <button
              type="button"
              :title="t('gmvMaxData.previous')"
              :disabled="decisionPage <= 1"
              @click="changeDecisionPage(decisionPage - 1)"
            >
              <ChevronRight /></button
            ><button
              type="button"
              :title="t('gmvMaxData.next')"
              :disabled="decisionPage >= decisionPageCount"
              @click="changeDecisionPage(decisionPage + 1)"
            >
              <ChevronRight />
            </button>
          </div>
        </div>
        <div v-else class="gmv-empty gmv-empty--small">
          {{ t("gmvMaxDecision.empty") }}
        </div>
      </div>
      <aside
        class="gmv-panel gmv-today-plan"
        data-testid="gmv-today-plan"
      >
        <header class="gmv-today-plan__header">
          <div>
            <span class="gmv-kicker">{{
              t("gmvMaxDetailDrawer.todayPlan")
            }}</span>
            <h2>
              {{ cockpitTodayPlan.length }}
              {{ t("gmvMaxSopUi.itemsPending") }}
            </h2>
            <p>{{ t("gmvMaxDecision.productDecisionsHint") }}</p>
          </div>
          <span class="gmv-today-plan__date"
            ><CalendarRange />{{
              cockpitTodayPlanDate || t("gmvMaxSopUi.notAvailable")
            }}</span
          >
        </header>
        <div
          v-if="cockpitTodayPlan.length"
          class="gmv-today-plan__list"
        >
          <button
            v-for="item in cockpitTodayPlan"
            :key="item.task.id"
            type="button"
            :data-sop-instance-id="item.instance.id"
            :class="[
              `is-${item.task.priority || item.decision?.priority || 'P2'}`,
            ]"
            @click="selectSopInstance(item.instance.id)"
          >
            <span class="gmv-today-plan__priority">{{
              item.task.priority || item.decision?.priority || "P2"
            }}</span>
            <span class="gmv-today-plan__copy"
              ><small
                >{{ item.task.scheduledTime }} /
                {{ item.instance.storeName }}</small
              ><strong>{{ sopTaskTitle(item.task) }}</strong
              ><em>{{
                item.instance.productName ||
                item.instance.productId ||
                item.instance.campaignName
              }}</em></span
            >
            <ChevronRight />
          </button>
        </div>
        <div v-else class="gmv-empty gmv-empty--small">
          {{ t("gmvMaxSopUi.todayComplete") }}
        </div>
      </aside>
    </div>
  </section>

  <button
    v-if="selectedSop"
    type="button"
    class="gmv-today-details-toggle"
    data-testid="gmv-today-details-toggle"
    :aria-expanded="todayDetailsExpanded"
    @click="todayDetailsExpanded = !todayDetailsExpanded"
  >
    <span
      ><Settings2 /><strong>{{
        t("gmvMaxSimpleNav.fullWorkspace")
      }}</strong
      ><small>{{ t("gmvMaxSimpleNav.fullWorkspaceHint") }}</small></span
    ><ChevronDown :class="{ 'is-open': todayDetailsExpanded }" />
  </button>

  <Teleport to="body">
    <div
      v-if="selectedSop && sopDetailOpen"
      class="gmv-command-drawer-backdrop"
      data-testid="gmv-command-center-drawer-backdrop"
      @click.self="closeSopDetail"
    >
      <aside
        class="gmv-command-drawer"
        data-testid="gmv-command-center-drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="t('gmvMaxDetailDrawer.title')"
      >
        <header class="gmv-command-drawer__header">
          <div class="gmv-command-drawer__identity">
            <span class="gmv-command-drawer__image"
              ><Package /><img
                v-if="selectedSop.productImageUrl"
                :src="selectedSop.productImageUrl"
                :alt="
                  selectedSop.productName ||
                  selectedSop.productId ||
                  selectedSop.campaignName
                "
                @error="hideBrokenSopImage"
            /></span>
            <span
              ><small
                >{{ selectedSop.storeName }} /
                {{
                  t(
                    `gmvMax.types.${selectedSop.campaignType.toLowerCase()}`,
                  )
                }}</small
              ><strong
                :title="
                  selectedSop.productName ||
                  selectedSop.productId ||
                  selectedSop.campaignName
                "
                >{{
                  selectedSop.productName ||
                  selectedSop.productId ||
                  t("gmvMaxSop.liveScope")
                }}</strong
              ><em :title="selectedSop.campaignName">{{
                selectedSop.campaignName
              }}</em></span
            >
          </div>
          <button
            type="button"
            class="gmv-icon-button"
            :title="t('gmvMaxDetailDrawer.close')"
            @click="closeSopDetail"
          >
            <X />
          </button>
        </header>
        <div class="gmv-command-drawer__context">
          <span
            :class="[
              'gmv-status',
              selectedSop.status === 'blocked'
                ? 'is-danger'
                : selectedSop.status === 'paused'
                  ? 'is-warning'
                  : 'is-success',
            ]"
            >{{ t(`gmvMaxSop.status.${selectedSop.status}`) }}</span
          ><span
            :class="[
              'gmv-status',
              isDecisionCampaignEnabled(
                selectedSop.campaignOperationStatus,
              )
                ? 'is-success'
                : 'is-neutral',
            ]"
            >{{
              operationStatusLabel(selectedSop.campaignOperationStatus)
            }}</span
          ><span
            >{{ t("gmvMaxSop.currentDay") }}
            {{ selectedSop.currentDay }}</span
          ><span
            >{{ t("gmvMaxCockpit.freshness") }}
            {{
              selectedSop.dataFreshness || t("gmvMaxSopUi.notAvailable")
            }}</span
          >
        </div>
        <nav
          class="gmv-command-drawer__tabs"
          role="tablist"
          :aria-label="t('gmvMaxDetailDrawer.tabsLabel')"
        >
          <button
            v-for="tab in [
              ['decision', 'decision'],
              ['tasks', 'tasks'],
              ['metrics', 'metrics'],
              ['creative', 'creative'],
              ['history', 'history'],
            ] as const"
            :key="tab[0]"
            type="button"
            role="tab"
            :aria-selected="sopDetailTab === tab[0]"
            :class="{ 'is-active': sopDetailTab === tab[0] }"
            @click="sopDetailTab = tab[0]"
          >
            {{ t(`gmvMaxDetailDrawer.tabs.${tab[1]}`) }}
          </button>
        </nav>
        <div class="gmv-command-drawer__body">
          <section
            v-if="sopDetailTab === 'decision'"
            class="gmv-command-drawer__section"
          >
            <span class="gmv-kicker">{{
              t("gmvMaxDetailDrawer.systemJudgement")
            }}</span>
            <h3>
              {{
                selectedSop.track === "mature_product" &&
                selectedSop.matureAssessment
                  ? t(
                      `gmvMaxMature.states.${selectedSop.matureAssessment.state}`,
                    )
                  : t(`gmvMaxSop.phases.${selectedSop.phase}`)
              }}
            </h3>
            <p>
              {{
                primarySopIssue
                  ? issueText(primarySopIssue, "reason")
                  : t("gmvMaxDetailDrawer.noIssue")
              }}
            </p>
            <div
              v-if="primarySopIssue"
              class="gmv-command-drawer__issue"
            >
              <ShieldAlert /><span
                ><strong>{{
                  issueText(primarySopIssue, "title")
                }}</strong
                ><small>{{
                  primarySopIssue.blockedReasons?.join(" / ") ||
                  issueText(primarySopIssue, "solution")
                }}</small></span
              >
            </div>
            <div class="gmv-command-drawer__facts">
              <span
                ><small>ROI</small
                ><strong>{{
                  formatRoi(selectedSop.metrics.roi)
                }}</strong
                ><em
                  >{{ t("gmvMaxDetailDrawer.target") }}
                  {{ formatRoi(selectedSop.targetRoi) }}</em
                ></span
              ><span
                ><small>{{ t("gmvMaxSop.metrics.gmv") }}</small
                ><strong>{{
                  formatCny(
                    selectedSop.metrics.gmv,
                    selectedSop.storeId,
                  )
                }}</strong
                ><em
                  >{{ t("gmvMaxSop.metrics.orders") }}
                  {{ selectedSop.metrics.orders }}</em
                ></span
              ><span
                ><small>{{ t("gmvMaxSopUi.profitFloorLabel") }}</small
                ><strong>{{
                  formatRoi(selectedSop.profitFloor)
                }}</strong
                ><em
                  >{{ t("gmvMaxDetailDrawer.freshness") }}
                  {{
                    selectedSop.dataFreshness ||
                    t("gmvMaxSopUi.notAvailable")
                  }}</em
                ></span
              >
            </div>
            <button
              v-if="primarySopIssue"
              type="button"
              class="gmv-button gmv-button--primary gmv-command-drawer__primary"
              :data-action-target="primarySopIssue.actionTarget"
              @click="handleSopIssue(primarySopIssue)"
            >
              <ArrowUpRight class="gmv-icon" />{{
                t("gmvMaxDetailDrawer.handleIssue")
              }}
            </button>
            <section
              class="gmv-command-coach"
              data-testid="gmv-coach-panel"
            >
              <header class="gmv-command-coach__header">
                <div>
                  <span class="gmv-kicker">{{
                    t("gmvMaxCoach.title")
                  }}</span>
                  <h3>{{ t("gmvMaxCoach.diagnosis") }}</h3>
                </div>
                <button
                  type="button"
                  class="gmv-icon-button"
                  :title="t('gmvMaxCoach.refresh')"
                  :disabled="!!busyAction"
                  @click="refreshCoachDecision"
                >
                  <RefreshCw class="gmv-icon" />
                </button>
              </header>
              <p class="gmv-command-coach__diagnosis">
                {{
                  selectedCoachDecision?.diagnosis ||
                  t("gmvMaxCoach.unavailable")
                }}
              </p>
              <div
                v-if="selectedCoachProfile"
                class="gmv-coach-profile"
              >
                <span
                  ><small>{{ t("gmvMaxCoach.stage") }}</small
                  ><strong>{{
                    selectedCoachProfile.stageLabel
                  }}</strong></span
                >
                <span
                  ><small>{{ t("gmvMaxCoach.historyPeak") }}</small
                  ><strong>{{
                    formatCny(
                      selectedCoachProfile.historicalPeakGmv,
                      selectedSop.storeId,
                    )
                  }}</strong></span
                >
                <span
                  ><small>{{ t("gmvMaxCoach.recentBaseline") }}</small
                  ><strong>{{
                    formatCny(
                      selectedCoachProfile.recentBaselineGmv,
                      selectedSop.storeId,
                    )
                  }}</strong></span
                >
                <span
                  ><small>{{ t("gmvMaxCoach.recovery") }}</small
                  ><strong
                    >{{
                      selectedCoachProfile.recoveryRate || "-"
                    }}%</strong
                  ></span
                >
                <span
                  ><small>ROI</small
                  ><strong>{{
                    formatRoi(selectedCoachProfile.currentRoi)
                  }}</strong
                  ><em>{{
                    formatRoi(selectedCoachProfile.breakEvenRoi)
                  }}</em></span
                >
                <span
                  ><small>{{
                    t("gmvMaxCoach.budgetUtilization")
                  }}</small
                  ><strong
                    >{{
                      selectedCoachProfile.budgetUtilization || "-"
                    }}%</strong
                  ></span
                >
              </div>
              <div
                v-if="selectedCoachDecision"
                class="gmv-coach-detail"
              >
                <div>
                  <span class="gmv-kicker">{{
                    t("gmvMaxCoach.evidence")
                  }}</span>
                  <ul>
                    <li
                      v-for="item in selectedCoachDecision.evidence.slice(
                        0,
                        4,
                      )"
                      :key="item.metric"
                    >
                      <strong
                        >{{ coachEvidenceMetricLabel(item) }}
                        {{ item.value }}</strong
                      ><small>{{ coachEvidenceDetail(item) }}</small>
                    </li>
                  </ul>
                </div>
                <div>
                  <span class="gmv-kicker">{{
                    t("gmvMaxCoach.plan")
                  }}</span>
                  <ol>
                    <li
                      v-for="item in selectedCoachDecision.plan"
                      :key="item.day"
                    >
                      <strong
                        >{{
                          t("gmvMaxCoach.dayLabel", { day: item.day })
                        }}：{{
                          coachPlanActionLabel(item.action)
                        }}</strong
                      ><small
                        >{{ item.objective
                        }}<template v-if="item.trigger"
                          >。{{ item.trigger }}</template
                        ></small
                      >
                    </li>
                  </ol>
                </div>
                <div v-if="selectedCoachDecision.guardrails.length">
                  <span class="gmv-kicker">{{
                    t("gmvMaxCoach.guardrails")
                  }}</span>
                  <ul>
                    <li
                      v-for="item in selectedCoachDecision.guardrails"
                      :key="item"
                    >
                      <small>{{ coachGuardrailLabel(item) }}</small>
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          </section>
          <section
            v-else-if="sopDetailTab === 'tasks'"
            class="gmv-command-drawer__section"
          >
            <div class="gmv-command-drawer__section-heading">
              <span
                ><span class="gmv-kicker">{{
                  t("gmvMaxDetailDrawer.todayPlan")
                }}</span>
                <h3>
                  {{ selectedSopPendingTasks.length }}
                  {{ t("gmvMaxSopUi.itemsPending") }}
                </h3></span
              ><small>{{
                selectedSopTaskDate || t("gmvMaxSopUi.notAvailable")
              }}</small>
            </div>
            <div class="gmv-command-timeline">
              <article
                v-for="task in selectedSopTasks.slice(0, 8)"
                :key="task.id"
                :class="[`is-${task.status}`]"
              >
                <span class="gmv-command-timeline__dot"
                  ><Check v-if="task.status === 'completed'" /><Clock3
                    v-else
                /></span>
                <div>
                  <small
                    >{{ task.scheduledTime }} /
                    {{
                      task.executionMode === "manual_external"
                        ? t("gmvMaxSopUi.sellerCenterRequired")
                        : task.priority || "P2"
                    }}</small
                  ><strong>{{ sopTaskTitle(task) }}</strong>
                  <p>{{ sopTaskDescription(task) }}</p>
                  <button
                    v-if="['pending', 'blocked'].includes(task.status)"
                    type="button"
                    class="gmv-button gmv-button--secondary"
                    :disabled="!!busyAction"
                    @click="completeSopTask(task)"
                  >
                    {{ t("gmvMaxSopUi.markComplete") }}
                  </button>
                </div>
              </article>
              <div
                v-if="!selectedSopTasks.length"
                class="gmv-empty gmv-empty--small"
              >
                {{ t("gmvMaxSopUi.todayComplete") }}
              </div>
            </div>
          </section>
          <section
            v-else-if="sopDetailTab === 'metrics'"
            class="gmv-command-drawer__section"
          >
            <span class="gmv-kicker">{{
              t("gmvMaxDetailDrawer.metricsTitle")
            }}</span>
            <h3>{{ t("gmvMaxDetailDrawer.metricsSubtitle") }}</h3>
            <div class="gmv-command-metrics">
              <span
                v-for="metric in sopKeyMetricCards"
                :key="metric.key"
                ><small>{{
                  te(`gmvMaxSop.metrics.${metric.key}`)
                    ? t(`gmvMaxSop.metrics.${metric.key}`)
                    : metric.key
                }}</small
                ><strong>{{ metric.value }}</strong
                ><em>{{
                  t("gmvMaxDetailDrawer.metricSignal")
                }}</em></span
              >
            </div>
            <div class="gmv-command-drawer__freshness">
              <Clock3 /><span
                ><strong>{{
                  t("gmvMaxDetailDrawer.dataFreshness")
                }}</strong
                ><small
                  >{{
                    selectedSop.lastDeliveryDate ||
                    t("gmvMaxSopUi.noActiveDelivery")
                  }}
                  /
                  {{
                    selectedSop.dataFreshness ||
                    t("gmvMaxSopUi.notAvailable")
                  }}</small
                ></span
              >
            </div>
          </section>
          <section
            v-else-if="sopDetailTab === 'creative'"
            class="gmv-command-drawer__section"
          >
            <span class="gmv-kicker">{{
              t("gmvMaxDetailDrawer.creativeTitle")
            }}</span>
            <h3>
              {{ selectedSopCreativeVideos.length }}
              {{ t("gmvMaxSopVideo.videoList") }}
            </h3>
            <div class="gmv-command-creative-grid">
              <article
                v-for="video in selectedSopCreativeVideos.slice(0, 6)"
                :key="video.id"
              >
                <span class="gmv-command-creative-grid__cover"
                  ><img
                    v-if="video.coverUrl"
                    :src="video.coverUrl"
                    :alt="video.name"
                    @error="hideBrokenSopVideoCover(video)"
                  /><Film v-else /><i v-if="!video.coverUrl">{{
                    t(`gmvMaxSopVideo.freshness.${video.freshness}`)
                  }}</i></span
                ><strong :title="video.name">{{ video.name }}</strong
                ><small
                  >{{ video.grade }} /
                  {{
                    video.performance.roi
                      ? formatRoi(video.performance.roi)
                      : t("gmvMaxSopVideo.noData")
                  }}</small
                >
              </article>
              <div
                v-if="!selectedSopCreativeVideos.length"
                class="gmv-empty gmv-empty--small"
              >
                {{ t("gmvMaxSopVideo.empty") }}
              </div>
            </div>
          </section>
          <section v-else class="gmv-command-drawer__section">
            <span class="gmv-kicker">{{
              t("gmvMaxDetailDrawer.historyTitle")
            }}</span>
            <h3>{{ t("gmvMaxDetailDrawer.historySubtitle") }}</h3>
            <div class="gmv-command-history">
              <article
                v-for="run in sopWorkspace.automationRuns
                  .filter(
                    (item) => item.sopInstanceId === selectedSop.id,
                  )
                  .slice(0, 8)"
                :key="run.id"
              >
                <span>{{ formatDate(run.updatedAt) }}</span
                ><strong>{{ run.action }}</strong
                ><small>{{ run.message }}</small
                ><b :class="`is-${run.status}`">{{ run.status }}</b>
              </article>
              <div
                v-if="
                  !sopWorkspace.automationRuns.some(
                    (item) => item.sopInstanceId === selectedSop.id,
                  )
                "
                class="gmv-empty gmv-empty--small"
              >
                {{ t("gmvMaxDetailDrawer.noHistory") }}
              </div>
            </div>
          </section>
        </div>
        <footer class="gmv-command-drawer__footer">
          <button
            type="button"
            class="gmv-button gmv-button--secondary"
            :disabled="!!busyAction"
            @click="toggleSopStatus"
          >
            <component
              :is="
                selectedSop.status === 'paused'
                  ? PlayCircle
                  : PauseCircle
              "
              class="gmv-icon"
            />{{
              selectedSop.status === "paused"
                ? t("gmvMaxSopActionLabels.resumeCurrent")
                : t("gmvMaxSopActionLabels.pauseCurrent")
            }}</button
          ><button
            type="button"
            class="gmv-button gmv-button--primary"
            :disabled="!!busyAction"
            @click="
              sopLaunchExpanded = true;
              closeSopDetail();
            "
          >
            <Plus class="gmv-icon" />{{
              t("gmvMaxSopActionLabels.startCycle")
            }}
          </button>
        </footer>
      </aside>
    </div>
  </Teleport>

  <section
    v-if="selectedSop && todayDetailsExpanded"
    class="gmv-sop-object-bar"
    data-testid="gmv-sop-current-object"
  >
    <button
      type="button"
      class="gmv-sop-object-bar__selector"
      data-testid="gmv-sop-open-picker"
      @click="openSopPicker"
    >
      <span class="gmv-sop-object-bar__image">
        <Package />
        <img
          v-if="selectedSop.productImageUrl"
          :src="selectedSop.productImageUrl"
          :alt="
            selectedSop.productName ||
            selectedSop.productId ||
            selectedSop.campaignName
          "
          @error="hideBrokenSopImage"
        />
      </span>
      <span class="gmv-sop-object-bar__copy">
        <small>{{ t("gmvMaxSopUi.currentObject") }}</small>
        <strong
          :title="
            selectedSop.productName ||
            selectedSop.productId ||
            t('gmvMaxSop.liveScope')
          "
          >{{
            selectedSop.productName ||
            selectedSop.productId ||
            t("gmvMaxSop.liveScope")
          }}</strong
        >
        <span
          ><b>{{ t("gmvMaxSopUi.campaignLabel") }}</b
          ><em :title="selectedSop.campaignName">{{
            selectedSop.campaignName
          }}</em></span
        >
        <span class="gmv-sop-object-bar__meta"
          ><i>{{ selectedSop.storeName }}</i
          ><i>{{
            t(
              `gmvMaxMature.tracks.${selectedSop.track || "new_product"}`,
            )
          }}</i
          ><i>{{
            operationStatusLabel(selectedSop.campaignOperationStatus)
          }}</i
          ><i>{{
            t(`gmvMaxSop.status.${selectedSop.status}`)
          }}</i></span
        >
      </span>
      <span class="gmv-sop-object-bar__change"
        >{{ t("gmvMaxSopUi.changeObject") }}<ChevronDown
      /></span>
    </button>
    <button
      v-if="selectedSop.productId"
      type="button"
      class="gmv-icon-button"
      :title="t('gmvMaxSopUi.copyProductId')"
      @click="copySopIdentifier(selectedSop.productId)"
    >
      <Copy />
    </button>
  </section>

  <section
    v-if="!selectedSop || sopLaunchExpanded"
    class="gmv-sop-launch"
    data-testid="gmv-sop-start"
  >
    <div class="gmv-sop-launch__route">
      <div class="gmv-sop-launch__eyebrow">
        <Rocket /><span
          ><small>PROTECTED LAUNCH</small
          ><strong>{{ t("gmvMaxSop.start.title") }}</strong></span
        >
      </div>
      <p>{{ t("gmvMaxSop.start.hint") }}</p>
      <div class="gmv-sop-launch__phases">
        <div v-for="(item, index) in sopPhases" :key="item.phase">
          <span>{{ String(index + 1).padStart(2, "0") }}</span
          ><strong>{{ item.label }}</strong
          ><small>{{ item.days }}</small>
        </div>
      </div>
    </div>
    <div class="gmv-sop-launch__form">
      <header>
        <div>
          <span>{{ t("gmvMaxSop.start.title") }}</span
          ><strong>{{
            selectedSopCampaign
              ? t(
                  `gmvMax.types.${selectedSopCampaign.campaignType.toLowerCase()}`,
                )
              : t("gmvMaxSop.start.campaign")
          }}</strong>
        </div>
      </header>
      <div class="gmv-sop-launch__fields">
        <label
          ><span>{{ t("gmvMaxSop.start.campaign") }}</span
          ><select
            v-model="sopStartDraft.campaignId"
            data-testid="gmv-sop-campaign"
          >
            <option value="">
              {{ t("gmvMaxSop.start.campaign") }}
            </option>
            <option
              v-for="campaign in sopCampaignOptions"
              :key="campaign.id"
              :value="campaign.id"
            >
              {{ campaign.name }} /
              {{
                t(`gmvMax.types.${campaign.campaignType.toLowerCase()}`)
              }}
            </option>
          </select></label
        >
        <label v-if="sopRequiresHeroSku"
          ><span>{{ t("gmvMaxSop.start.productId") }}</span
          ><select
            v-model="sopStartDraft.productId"
            data-testid="gmv-sop-product-id"
            :disabled="sopProductLoading || !sopProductOptions.length"
            @change="selectSopProduct"
          >
            <option value="">
              {{
                sopProductLoading
                  ? t("gmvMaxData.loadingPage")
                  : t("gmvMaxSop.start.productName")
              }}
            </option>
            <option
              v-for="product in sopProductOptions"
              :key="product.productId"
              :value="product.productId"
            >
              {{ product.productName || product.productId }} /
              {{ product.productId }}
            </option>
          </select></label
        >
        <label
          ><span>{{ t("gmvMaxData.startDate") }}</span
          ><input v-model="sopStartDraft.startDate" type="date"
        /></label>
        <label
          ><span>{{ t("gmvMaxMature.track") }}</span
          ><select v-model="sopStartDraft.track">
            <option value="">{{ t("gmvMaxMature.autoTrack") }}</option>
            <option value="new_product">
              {{ t("gmvMaxMature.tracks.new_product") }}
            </option>
            <option value="mature_product">
              {{ t("gmvMaxMature.tracks.mature_product") }}
            </option>
            <option value="live">
              {{ t("gmvMaxMature.tracks.live") }}
            </option>
          </select></label
        >
        <label v-if="sopStartDraft.track"
          ><span>{{ t("gmvMaxMature.overrideReason") }}</span
          ><input v-model="sopStartDraft.trackOverrideReason"
        /></label>
      </div>
      <div class="gmv-sop-launch__footer">
        <span :class="{ 'is-ready': sopCanStart }"
          ><CheckCircle2 v-if="sopCanStart" /><ShieldAlert v-else />{{
            sopStartRequirement
          }}</span
        ><button
          class="gmv-button gmv-button--primary"
          data-testid="gmv-sop-start-button"
          :title="t('gmvMaxSopActionLabels.startCycleHint')"
          :disabled="!sopCanStart || !!busyAction || sopProductLoading"
          @click="startSop"
        >
          <Rocket class="gmv-icon" />{{
            t("gmvMaxSopActionLabels.startCycle")
          }}
        </button>
      </div>
    </div>
  </section>

  <div
    v-if="sopLoading"
    class="gmv-empty"
    data-testid="gmv-sop-loading"
  >
    {{ t("gmvMaxData.loadingPage") }}
  </div>
  <section v-else-if="!selectedSop" class="gmv-sop-readiness">
    <div>
      <CalendarRange /><span
        ><strong>{{ t("gmvMaxSop.empty") }}</strong
        ><small>{{ t("gmvMaxSop.emptyHint") }}</small></span
      >
    </div>
    <dl>
      <div>
        <dt>{{ t("gmvMax.metrics.campaigns") }}</dt>
        <dd>{{ sopCampaignOptions.length }}</dd>
      </div>
      <div>
        <dt>{{ t("gmvMaxCatalog.configured") }}</dt>
        <dd>
          {{ dashboard.catalog.configuredProducts }} /
          {{ dashboard.catalog.products }}
        </dd>
      </div>
      <div>
        <dt>{{ t("gmvMaxCatalog.videos") }}</dt>
        <dd>{{ dashboard.catalog.videos }}</dd>
      </div>
    </dl>
  </section>
  <template v-else-if="todayDetailsExpanded">
    <details
      v-if="sopWorkspace.issueQueue.length"
      class="gmv-store-issue-center"
      data-testid="gmv-store-issue-center"
    >
      <summary>
        <span
          ><ShieldAlert /><strong>{{
            t("gmvMaxOperations.storeIssues")
          }}</strong></span
        ><small
          >{{
            sopWorkspace.issueQueue.filter(
              (item) => item.severity === "must_fix",
            ).length
          }}
          {{ t("gmvMaxOperations.mustFix") }}</small
        >
      </summary>
      <div>
        <button
          v-for="issue in sopWorkspace.issueQueue.slice(0, 5)"
          :key="issue.id"
          type="button"
          @click="handleGlobalSopIssue(issue)"
        >
          <span
            ><strong>{{ issueText(issue, "title") }}</strong
            ><small
              >{{
                issue.productName ||
                issue.productId ||
                issue.campaignName
              }}
              / {{ issue.storeName }}</small
            ></span
          ><ChevronRight />
        </button>
      </div>
    </details>

    <div class="gmv-sop-main-grid">
      <div class="gmv-sop-main-grid__diagnosis">
        <section
          class="gmv-sop-decision"
          data-testid="gmv-sop-decision"
        >
          <div class="gmv-sop-decision__main">
            <span>{{ t("gmvMaxSopUi.systemDecision") }}</span>
            <h3>
              {{
                selectedSop.track === "mature_product" &&
                selectedSop.matureAssessment
                  ? t(
                      `gmvMaxMature.states.${selectedSop.matureAssessment.state}`,
                    )
                  : t(`gmvMaxSop.phases.${selectedSop.phase}`)
              }}
            </h3>
            <p>
              {{
                selectedSop.track === "mature_product" &&
                selectedSop.matureAssessment
                  ? t(
                      `gmvMaxMature.actions.${selectedSop.matureAssessment.recommendedAction}`,
                    )
                  : t("gmvMaxSopUi.phaseGuidance", {
                      phase: t(`gmvMaxSop.phases.${selectedSop.phase}`),
                    })
              }}
            </p>
            <div>
              <span
                :class="[
                  'gmv-status',
                  selectedSop.status === 'blocked'
                    ? 'is-danger'
                    : selectedSop.status === 'paused'
                      ? 'is-warning'
                      : 'is-success',
                ]"
                >{{ t(`gmvMaxSop.status.${selectedSop.status}`) }}</span
              ><small
                >{{
                  selectedSop.track === "mature_product"
                    ? t("gmvMaxMature.productAge")
                    : t("gmvMaxSop.currentDay")
                }}
                {{ selectedSop.currentDay }}</small
              ><small
                >{{ t("gmvMaxSopUi.profitFloorLabel") }}
                {{ formatRoi(selectedSop.profitFloor) }}</small
              >
            </div>
          </div>
          <div
            class="gmv-sop-decision__automation"
            data-testid="gmv-sop-automation-status"
          >
            <div>
              <component
                :is="
                  selectedSop.automationEnabled === false
                    ? PauseCircle
                    : CheckCircle2
                "
              /><span
                ><strong>{{
                  t(
                    `gmvMaxSopAutomation.${selectedSop.automationEnabled === false ? "disabled" : "enabled"}`,
                  )
                }}</strong
                ><small>{{
                  t(
                    selectedSop.automationEnabled === false
                      ? "gmvMaxSopUi.automationPausedHint"
                      : "gmvMaxSopUi.automationEnabledHint",
                  )
                }}</small></span
              >
            </div>
            <button
              type="button"
              class="gmv-button gmv-button--secondary"
              data-testid="gmv-sop-automation-settings-toggle"
              :aria-expanded="sopAutomationSettingsExpanded"
              @click="
                sopAutomationSettingsExpanded =
                  !sopAutomationSettingsExpanded
              "
            >
              <Settings2 class="gmv-icon" />{{
                t("gmvMaxSopUi.automationSettings")
              }}
            </button>
          </div>
          <div
            v-if="sopAutomationSettingsExpanded"
            class="gmv-sop-decision__settings"
            data-testid="gmv-sop-automation-settings"
          >
            <button
              data-testid="gmv-sop-automation-toggle"
              :class="[
                'gmv-button',
                selectedSop.automationEnabled === false
                  ? 'gmv-button--primary'
                  : 'gmv-button--secondary',
              ]"
              :disabled="!!busyAction"
              @click="toggleSopAutomation"
            >
              <component
                :is="
                  selectedSop.automationEnabled === false
                    ? PlayCircle
                    : PauseCircle
                "
                class="gmv-icon"
              />{{
                t(
                  `gmvMaxSopAutomation.${selectedSop.automationEnabled === false ? "enable" : "disable"}`,
                )
              }}
            </button>
            <label
              ><span>{{ t("gmvMaxSopUi.automationMode") }}</span
              ><select
                data-testid="gmv-sop-automation-mode"
                :value="selectedSop.automationMode || 'draft_actions'"
                :disabled="
                  selectedSop.automationEnabled === false ||
                  !!busyAction
                "
                @change="changeSopAutomationMode"
              >
                <option value="diagnostic_only">
                  {{ t("gmvMaxSopAutomation.modes.diagnostic_only") }}
                </option>
                <option value="draft_actions">
                  {{ t("gmvMaxSopAutomation.modes.draft_actions") }}
                </option>
              </select></label
            >
            <button
              class="gmv-button gmv-button--secondary"
              data-testid="gmv-sop-automation-run"
              :disabled="
                selectedSop.automationEnabled === false || !!busyAction
              "
              @click="runSopAutomation"
            >
              <RefreshCw class="gmv-icon" />{{
                t("gmvMaxSopUi.recalculateNow")
              }}
            </button>
            <label v-if="selectedSop.track === 'mature_product'"
              ><span>{{ t("gmvMaxMature.track") }}</span
              ><select
                :value="selectedSop.track"
                :title="t('gmvMaxMature.overrideTrack')"
                @change="overrideSopTrack"
              >
                <option value="new_product">
                  {{ t("gmvMaxMature.tracks.new_product") }}
                </option>
                <option value="mature_product">
                  {{ t("gmvMaxMature.tracks.mature_product") }}
                </option>
                <option value="live">
                  {{ t("gmvMaxMature.tracks.live") }}
                </option>
              </select></label
            >
            <small
              >{{ sopAutomationResult(selectedSopAutomationRun) }} ·
              {{ t("gmvMaxSopAutomation.nextRun") }}
              {{ formatDate(selectedSop.nextAutomationAt) }}</small
            >
          </div>
        </section>

        <section
          v-if="primarySopIssue"
          class="gmv-sop-resolution"
          data-testid="gmv-sop-resolution-center"
          :data-issue-code="primarySopIssue.code"
        >
          <header>
            <span
              :class="[
                'gmv-status',
                primarySopIssue.severity === 'must_fix'
                  ? 'is-danger'
                  : primarySopIssue.severity === 'observing'
                    ? 'is-blue'
                    : primarySopIssue.severity === 'resolved'
                      ? 'is-success'
                      : 'is-warning',
              ]"
              >{{
                t(
                  `gmvMaxIssueResolutions.severity.${primarySopIssue.severity}`,
                )
              }}</span
            ><small>{{
              t("gmvMaxIssueResolutions.objectContext", {
                product:
                  selectedSop.productName ||
                  selectedSop.productId ||
                  t("gmvMaxSop.liveScope"),
                campaign: selectedSop.campaignName,
              })
            }}</small>
          </header>
          <div class="gmv-sop-resolution__main">
            <div>
              <h3>{{ issueText(primarySopIssue, "title") }}</h3>
              <p>{{ issueText(primarySopIssue, "reason") }}</p>
            </div>
            <div class="gmv-row__actions">
              <button
                class="gmv-button gmv-button--ghost"
                data-testid="gmv-sop-help-action"
                @click="openHelpIssue(primarySopIssue.code)"
              >
                <BookOpen class="gmv-icon" />{{
                  t("gmvMaxHelp.viewResolution")
                }}</button
              ><button
                v-if="primarySopIssue.actionTarget !== 'none'"
                class="gmv-button gmv-button--primary"
                data-testid="gmv-sop-primary-action"
                :disabled="!!busyAction"
                @click="handleSopIssue(primarySopIssue)"
              >
                {{ issueActionLabel(primarySopIssue)
                }}<ArrowUpRight class="gmv-icon" />
              </button>
            </div>
          </div>
          <dl>
            <div>
              <dt>{{ t("gmvMaxIssueResolutions.currentValue") }}</dt>
              <dd>
                {{ structuredValueLabel(primarySopIssue.currentValue) }}
              </dd>
            </div>
            <div>
              <dt>{{ t("gmvMaxIssueResolutions.targetValue") }}</dt>
              <dd>
                {{ structuredValueLabel(primarySopIssue.targetValue) }}
              </dd>
            </div>
            <div>
              <dt>{{ t("gmvMaxIssueResolutions.evidenceSource") }}</dt>
              <dd>
                {{
                  structuredValueLabel(primarySopIssue.evidenceSource)
                }}
              </dd>
            </div>
          </dl>
          <div class="gmv-sop-resolution__solution">
            <strong>{{ t("gmvMaxIssueResolutions.solution") }}</strong
            ><span>{{ issueText(primarySopIssue, "solution") }}</span
            ><small>{{
              issueText(primarySopIssue, "completion")
            }}</small>
          </div>
          <details v-if="selectedSopIssues.length > 1">
            <summary>
              {{ t("gmvMaxIssueResolutions.allIssues")
              }}<span
                >{{ sopIssueSummary.mustFix }} /
                {{ sopIssueSummary.recommended }} /
                {{ sopIssueSummary.observing }} /
                {{ sopIssueSummary.resolved }}</span
              >
            </summary>
            <div class="gmv-sop-resolution-groups">
              <section
                v-for="group in groupedSopIssues"
                :key="group.severity"
              >
                <header>
                  <span
                    :class="[
                      'gmv-sop-resolution-list__mark',
                      `is-${group.severity}`,
                    ]"
                  ></span
                  ><strong>{{
                    t(
                      `gmvMaxIssueResolutions.severity.${group.severity}`,
                    )
                  }}</strong
                  ><small>{{ group.items.length }}</small>
                </header>
                <div class="gmv-sop-resolution-list">
                  <details
                    v-for="issue in group.items"
                    :key="issue.id"
                    class="gmv-sop-resolution-item"
                    :data-issue-code="issue.code"
                  >
                    <summary>
                      <div>
                        <strong>{{ issueText(issue, "title") }}</strong
                        ><small
                          >{{
                            structuredValueLabel(issue.currentValue)
                          }}
                          /
                          {{
                            structuredValueLabel(issue.targetValue)
                          }}</small
                        >
                      </div>
                      <div class="gmv-row__actions">
                        <button
                          class="gmv-button gmv-button--ghost"
                          @click.prevent.stop="
                            openHelpIssue(issue.code)
                          "
                        >
                          <BookOpen class="gmv-icon" />{{
                            t("gmvMaxHelp.viewResolution")
                          }}</button
                        ><button
                          v-if="issue.actionTarget !== 'none'"
                          class="gmv-button gmv-button--ghost"
                          @click.prevent.stop="handleSopIssue(issue)"
                        >
                          {{ issueActionLabel(issue) }}
                        </button>
                      </div>
                    </summary>
                    <div class="gmv-sop-resolution-item__body">
                      <p>{{ issueText(issue, "reason") }}</p>
                      <dl>
                        <div>
                          <dt>
                            {{ t("gmvMaxIssueResolutions.solution") }}
                          </dt>
                          <dd>{{ issueText(issue, "solution") }}</dd>
                        </div>
                        <div>
                          <dt>
                            {{
                              t("gmvMaxIssueResolutions.evidenceSource")
                            }}
                          </dt>
                          <dd>
                            {{
                              structuredValueLabel(issue.evidenceSource)
                            }}
                          </dd>
                        </div>
                        <div>
                          <dt>
                            {{
                              t("gmvMaxIssueResolutions.targetValue")
                            }}
                          </dt>
                          <dd>{{ issueText(issue, "completion") }}</dd>
                        </div>
                      </dl>
                    </div>
                  </details>
                </div>
              </section>
            </div>
          </details>
        </section>
      </div>

      <section
        class="gmv-panel gmv-sop-tasks gmv-sop-tasks--focus"
        data-testid="gmv-sop-today-tasks"
      >
        <div class="gmv-panel__heading">
          <div>
            <h2>{{ t("gmvMaxSopUi.todayTasks") }}</h2>
            <p>
              {{ selectedSopTaskDate || t("gmvMaxSop.tasks.empty") }}
            </p>
          </div>
          <span class="gmv-status is-blue"
            >{{ selectedSopPendingTasks.length }}
            {{ t("gmvMaxSopUi.itemsPending") }}</span
          >
        </div>
        <div
          v-if="selectedSopPendingTasks.length"
          class="gmv-sop-task-list"
        >
          <article
            v-for="task in selectedSopPendingTasks"
            :key="task.id"
            :class="{
              'is-external': task.executionMode === 'manual_external',
              'is-blocked': task.status === 'blocked',
            }"
          >
            <time
              >{{ task.scheduledTime
              }}<small>{{ task.localDate }}</small></time
            >
            <div>
              <strong
                ><b
                  v-if="task.priority"
                  :class="[
                    'gmv-task-priority',
                    `is-${task.priority.toLowerCase()}`,
                  ]"
                  >{{ task.priority }}</b
                >{{ sopTaskTitle(task) }}</strong
              >
              <p>{{ sopTaskDescription(task) }}</p>
              <span v-if="task.executionMode === 'manual_external'"
                ><ExternalLink />{{
                  t("gmvMaxSopUi.sellerCenterRequired")
                }}</span
              >
            </div>
            <button
              v-if="
                task.status === 'pending' &&
                task.executionMode === 'manual_external' &&
                issueForTask(task)
              "
              class="gmv-button gmv-button--primary"
              :disabled="!!busyAction"
              @click="handleSopIssue(issueForTask(task))"
            >
              <ExternalLink class="gmv-icon" />{{
                t("gmvMaxIssueResolutions.actions.seller_center")
              }}
            </button>
            <button
              v-else-if="task.status === 'pending' && task.experimentId"
              class="gmv-button gmv-button--primary"
              :disabled="!!busyAction"
              @click="approveExperimentTask(task)"
            >
              <ShieldCheck class="gmv-icon" />{{
                task.recommendedAction === "rollback_roi"
                  ? t("gmvMaxDecision.actions.rollback_roi")
                  : t("gmvMaxExecutionTruth.approveAndExecute")
              }}
            </button>
            <button
              v-else-if="
                task.status === 'pending' &&
                task.executionMode !== 'manual_external'
              "
              class="gmv-button gmv-button--secondary"
              :disabled="!!busyAction"
              @click="completeSopTask(task)"
            >
              <Check class="gmv-icon" />{{
                t("gmvMaxSopUi.markComplete")
              }}
            </button>
            <span v-else class="gmv-status is-warning">{{
              t("gmvMaxSop.status.blocked")
            }}</span>
          </article>
        </div>
        <div v-else class="gmv-sop-task-empty">
          <CheckCircle2 /><span
            ><strong>{{ t("gmvMaxSopUi.todayComplete") }}</strong
            ><small>{{
              t("gmvMaxSopUi.todayCompleteHint")
            }}</small></span
          >
        </div>
        <button
          v-if="selectedSopCompletedTasks.length"
          type="button"
          class="gmv-sop-inline-toggle"
          :aria-expanded="sopCompletedTasksExpanded"
          @click="
            sopCompletedTasksExpanded = !sopCompletedTasksExpanded
          "
        >
          <span
            >{{ t("gmvMaxSopUi.completedTasks") }} ({{
              selectedSopCompletedTasks.length
            }})</span
          ><ChevronDown
            :class="{ 'is-open': sopCompletedTasksExpanded }"
          />
        </button>
        <div
          v-if="sopCompletedTasksExpanded"
          class="gmv-sop-task-list is-completed-list"
        >
          <article
            v-for="task in selectedSopCompletedTasks"
            :key="task.id"
            class="is-complete"
          >
            <time
              >{{ task.scheduledTime
              }}<small>{{ task.localDate }}</small></time
            >
            <div>
              <strong>{{ sopTaskTitle(task) }}</strong>
              <p>{{ sopTaskDescription(task) }}</p>
            </div>
            <CheckCircle2 class="gmv-sop-task-done" />
          </article>
        </div>
      </section>
    </div>

    <div class="gmv-sop-insight-grid">
      <section
        class="gmv-sop-key-section"
        data-testid="gmv-sop-key-metrics"
      >
        <header>
          <div>
            <span>{{ t("gmvMaxSopUi.keyData") }}</span
            ><strong>{{ t("gmvMaxSopUi.keyDataHint") }}</strong>
          </div>
          <button
            type="button"
            class="gmv-button gmv-button--ghost"
            :aria-expanded="sopMetricsExpanded"
            @click="sopMetricsExpanded = !sopMetricsExpanded"
          >
            {{
              t(
                sopMetricsExpanded
                  ? "gmvMaxSopUi.hideAllMetrics"
                  : "gmvMaxSopUi.viewAllMetrics",
              )
            }}<ChevronDown
              class="gmv-icon"
              :class="{ 'is-open': sopMetricsExpanded }"
            />
          </button>
        </header>
        <div class="gmv-sop-metrics">
          <article
            v-for="metric in sopMetricsExpanded
              ? sopMetricCards
              : sopKeyMetricCards"
            :key="metric.key"
            :class="`is-${metric.key}`"
          >
            <span>{{ t(`gmvMaxSop.metrics.${metric.key}`) }}</span
            ><strong>{{ metric.value }}</strong>
          </article>
        </div>
      </section>

      <section class="gmv-sop-phase-section">
        <header>
          <span>{{ t("gmvMaxSopUi.sopProgress") }}</span
          ><strong>{{
            t("gmvMaxSopUi.currentStep", {
              current:
                sopPhases.findIndex(
                  (item) => item.phase === selectedSop.phase,
                ) + 1,
              total: sopPhases.length,
            })
          }}</strong>
        </header>
        <div class="gmv-sop-rail" data-testid="gmv-sop-phase-rail">
          <div
            v-for="(item, index) in sopPhases"
            :key="item.phase"
            :class="{
              'is-active': item.phase === selectedSop.phase,
              'is-complete':
                sopPhases.findIndex(
                  (entry) => entry.phase === selectedSop.phase,
                ) > index,
            }"
          >
            <span>{{ index + 1 }}</span
            ><strong>{{ item.label }}</strong
            ><small>{{ item.days }}</small>
          </div>
        </div>
      </section>
    </div>

    <div class="gmv-sop-detail-grid">
      <section
        v-if="
          selectedSop.track === 'mature_product' &&
          selectedSop.matureAssessment
        "
        :class="[
          'gmv-sop-disclosure',
          { 'is-expanded': sopHistoryExpanded },
        ]"
        data-testid="gmv-mature-console"
      >
        <button
          type="button"
          class="gmv-sop-disclosure__header"
          :aria-expanded="sopHistoryExpanded"
          @click="sopHistoryExpanded = !sopHistoryExpanded"
        >
          <span
            ><strong>{{ t("gmvMaxSopUi.fullDiagnosis") }}</strong
            ><small>{{
              t("gmvMaxSopUi.fullDiagnosisHint")
            }}</small></span
          ><ChevronDown :class="{ 'is-open': sopHistoryExpanded }" />
        </button>
        <div v-if="sopHistoryExpanded" class="gmv-sop-disclosure__body">
          <div class="gmv-mature-console__signals">
            <article>
              <span>{{ t("gmvMaxMatureLabels.lastReport") }}</span
              ><strong>{{
                selectedSop.matureAssessment.lastReportDate ||
                t("gmvMaxSopUi.notAvailable")
              }}</strong
              ><small>{{
                t(
                  `gmvMaxMature.freshness.${selectedSop.matureAssessment.dataFreshness}`,
                )
              }}</small>
            </article>
            <article>
              <span>{{ t("gmvMaxMature.lastDelivery") }}</span
              ><strong>{{
                selectedSop.matureAssessment.lastDeliveryDate ||
                t("gmvMaxSopUi.noActiveDelivery")
              }}</strong
              ><small>{{
                t("gmvMaxMatureLabels.explicitZeroSeparated")
              }}</small>
            </article>
            <article>
              <span>{{ t("gmvMaxMature.health") }}</span
              ><strong>{{
                selectedSop.matureAssessment.healthScore
                  ? Number(
                      selectedSop.matureAssessment.healthScore,
                    ).toFixed(0)
                  : t("gmvMaxSopUi.insufficientData")
              }}</strong
              ><small
                >{{ t("gmvMaxMature.coverage") }}
                {{
                  formatPercent(
                    selectedSop.matureAssessment.healthCoverage,
                  )
                }}</small
              >
            </article>
            <article>
              <span>{{ t("gmvMaxMature.dataCoverage") }}</span
              ><strong>{{
                formatPercent(selectedSop.matureAssessment.dataCoverage)
              }}</strong
              ><small>{{
                selectedSop.matureAssessment.writeActionsAllowed
                  ? t("gmvMaxMature.writeReady")
                  : t("gmvMaxMature.diagnosisOnly")
              }}</small>
            </article>
            <article>
              <span>{{ t("gmvMaxMature.observation") }}</span
              ><strong>{{
                selectedSop.observationDaysRemaining
              }}</strong
              ><small>{{
                t("gmvMaxMature.deliveryDaysRemaining")
              }}</small>
            </article>
            <article>
              <span>{{ t("gmvMaxSopUi.historicalWinners") }}</span
              ><strong
                >{{ selectedSop.protectedWinnerCount }}
                {{ t("gmvMaxSopUi.itemsUnit") }}</strong
              ><small>{{ t("gmvMaxSopUi.winnerRatioHint") }}</small>
            </article>
          </div>
          <div class="gmv-mature-console__baselines">
            <article
              v-for="(baseline, key) in {
                baseline30d: selectedSop.matureAssessment.baseline30d,
                recent7d: selectedSop.matureAssessment.recent7d,
                previous7d: selectedSop.matureAssessment.previous7d,
              }"
              :key="key"
            >
              <span>{{ t(`gmvMaxMature.baselines.${key}`) }}</span
              ><strong>{{ formatMatureBaselineRoi(baseline) }}</strong>
              <dl>
                <div>
                  <dt>GMV</dt>
                  <dd>
                    {{
                      baseline.deliveryDays > 0
                        ? formatCny(baseline.gmv, selectedSop.storeId)
                        : t("gmvMaxSopUi.notAvailable")
                    }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t("gmvMaxSop.metrics.orders") }}</dt>
                  <dd>
                    {{
                      baseline.deliveryDays > 0
                        ? formatInteger(baseline.orders)
                        : t("gmvMaxSopUi.notAvailable")
                    }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t("gmvMaxMature.deliveryDays") }}</dt>
                  <dd>{{ baseline.deliveryDays }}</dd>
                </div>
                <div>
                  <dt>{{ t("gmvMaxMature.missingDays") }}</dt>
                  <dd>{{ baseline.missingDays }}</dd>
                </div>
              </dl>
            </article>
          </div>
        </div>
      </section>

      <section
        :class="[
          'gmv-sop-disclosure',
          { 'is-expanded': sopSupplementalExpanded },
        ]"
        data-testid="gmv-sop-supplemental"
      >
        <button
          type="button"
          class="gmv-sop-disclosure__header"
          :aria-expanded="sopSupplementalExpanded"
          @click="sopSupplementalExpanded = !sopSupplementalExpanded"
        >
          <span
            ><strong>{{ t("gmvMaxSop.input.title") }}</strong
            ><small>{{
              t("gmvMaxSopUi.supplementalHint")
            }}</small></span
          ><ChevronDown
            :class="{ 'is-open': sopSupplementalExpanded }"
          />
        </button>
        <div
          v-if="sopSupplementalExpanded"
          class="gmv-sop-disclosure__body gmv-sop-input"
        >
          <div class="gmv-sop-input__bound-scope">
            <span
              ><small>{{ t("gmvMaxSopUi.dataObject") }}</small
              ><strong>{{
                selectedSop.productName ||
                selectedSop.productId ||
                t("gmvMaxSop.liveScope")
              }}</strong
              ><em
                >{{ t("gmvMaxSopUi.campaignLabel") }}
                {{ selectedSop.campaignName }}</em
              ></span
            ><label
              ><small>{{ t("gmvMaxSopUi.dataDate") }}</small
              ><input v-model="supplementalDraft.statDate" type="date"
            /></label>
          </div>
          <div class="gmv-sop-input__fields">
            <label
              v-for="field in supplementalMetricFields"
              :key="field"
              ><span>{{ t(`gmvMaxSop.input.${field}`) }}</span
              ><input
                v-model="(supplementalDraft as any)[field]"
                type="number"
                min="0"
                step="0.01"
            /></label>
          </div>
          <div class="gmv-sop-input__controls">
            <label
              ><span>{{ t("gmvMaxSop.input.deliveryMode") }}</span
              ><select v-model="supplementalDraft.deliveryMode">
                <option value="">
                  {{ t("gmvMaxSop.input.notProvided") }}
                </option>
                <option value="target_roi">
                  {{ t("gmvMaxSop.input.deliveryModes.targetRoi") }}
                </option>
                <option value="max_delivery">
                  {{ t("gmvMaxSop.input.deliveryModes.maxDelivery") }}
                </option>
              </select></label
            ><label
              v-for="field in [
                'autoBudgetEnabled',
                'inventoryReady',
                'liveReady',
              ]"
              :key="field"
              ><span>{{ t(`gmvMaxSop.input.${field}`) }}</span
              ><select v-model="(supplementalDraft as any)[field]">
                <option value="">
                  {{ t("gmvMaxSop.input.notProvided") }}
                </option>
                <option value="true">
                  {{ t("gmvMaxSop.input.yes") }}
                </option>
                <option value="false">
                  {{ t("gmvMaxSop.input.no") }}
                </option>
              </select></label
            >
          </div>
          <div class="gmv-sop-input__actions">
            <button
              class="gmv-button gmv-button--primary"
              :disabled="!!busyAction"
              @click="saveSupplementalMetrics"
            >
              <Save class="gmv-icon" />{{
                t("gmvMax.actions.save")
              }}</button
            ><button
              type="button"
              class="gmv-button gmv-button--ghost"
              :aria-expanded="sopBulkToolsExpanded"
              @click="sopBulkToolsExpanded = !sopBulkToolsExpanded"
            >
              <FileSpreadsheet class="gmv-icon" />{{
                t("gmvMaxSopUi.batchTools")
              }}<ChevronDown
                class="gmv-icon"
                :class="{ 'is-open': sopBulkToolsExpanded }"
              />
            </button>
          </div>
          <div v-if="sopBulkToolsExpanded" class="gmv-sop-input__bulk">
            <button
              class="gmv-button gmv-button--secondary"
              @click="exportSupplementalTemplate"
            >
              <Download class="gmv-icon" />{{
                t("gmvMaxSop.actions.template")
              }}</button
            ><label class="gmv-button gmv-button--secondary"
              ><Upload class="gmv-icon" />{{
                t("gmvMaxAdvanced.actions.import")
              }}<input
                type="file"
                accept=".csv,text/csv"
                hidden
                @change="importSupplementalMetrics"
            /></label>
          </div>
          <p class="gmv-sop-source-note">
            <ShieldCheck />{{ t("gmvMaxSop.input.sourcePriority") }}
          </p>
        </div>
      </section>

      <section
        :class="[
          'gmv-sop-disclosure',
          { 'is-expanded': sopDnaExpanded },
        ]"
        data-testid="gmv-sop-winner-dna"
      >
        <button
          type="button"
          class="gmv-sop-disclosure__header"
          :aria-expanded="sopDnaExpanded"
          @click="sopDnaExpanded = !sopDnaExpanded"
        >
          <span
            ><strong>{{ t("gmvMaxSopVideo.title") }}</strong
            ><small>{{ t("gmvMaxSopVideo.subtitle") }}</small></span
          >
          <span class="gmv-sop-grade-summary"
            ><i
              v-for="grade in ['S', 'A', 'B', 'C']"
              :key="grade"
              :class="`is-${grade.toLowerCase()}`"
              ><b
                >{{ grade }}
                {{ t(`gmvMaxSopUi.grades.${grade.toLowerCase()}`) }}</b
              >{{
                selectedSopVideoGradeSummary[
                  grade as "S" | "A" | "B" | "C"
                ]
              }}</i
            ><ChevronDown :class="{ 'is-open': sopDnaExpanded }"
          /></span>
        </button>
        <div
          v-if="sopDnaExpanded"
          class="gmv-sop-disclosure__body gmv-sop-video-insights"
        >
          <div
            v-if="selectedSopCreativeVideos.length"
            class="gmv-sop-video-toolbar"
          >
            <div
              class="gmv-sop-video-grades"
              role="tablist"
              :aria-label="t('gmvMaxSopVideoWorkbench.gradeFilter')"
            >
              <button
                v-for="grade in ['S', 'A', 'B', 'C'] as SopVideoGrade[]"
                :key="grade"
                type="button"
                role="tab"
                :data-testid="`gmv-sop-video-grade-${grade.toLowerCase()}`"
                :aria-selected="selectedSopVideoGrade === grade"
                :class="[
                  `is-${grade.toLowerCase()}`,
                  { 'is-active': selectedSopVideoGrade === grade },
                ]"
                @click="selectSopVideoGrade(grade)"
              >
                <span
                  ><b>{{ grade }}</b
                  >{{
                    t(`gmvMaxSopUi.grades.${grade.toLowerCase()}`)
                  }}</span
                ><strong>{{
                  selectedSopVideoGradeSummary[grade]
                }}</strong>
              </button>
            </div>
            <label class="gmv-sop-video-sort"
              ><span>{{ t("gmvMaxSopVideoWorkbench.sort.label") }}</span
              ><select
                v-model="sopVideoSort"
                data-testid="gmv-sop-video-sort"
              >
                <option value="profit">
                  {{ t("gmvMaxSopVideoWorkbench.sort.profit") }}
                </option>
                <option value="score">
                  {{ t("gmvMaxSopVideoWorkbench.sort.score") }}
                </option>
                <option value="roi">
                  {{ t("gmvMaxSopVideoWorkbench.sort.roi") }}
                </option>
                <option value="gmv">
                  {{ t("gmvMaxSopVideoWorkbench.sort.gmv") }}
                </option>
                <option value="spend">
                  {{ t("gmvMaxSopVideoWorkbench.sort.spend") }}
                </option>
                <option value="orders">
                  {{ t("gmvMaxSopVideoWorkbench.sort.orders") }}
                </option>
                <option value="latest">
                  {{ t("gmvMaxSopVideoWorkbench.sort.latest") }}
                </option>
              </select></label
            >
          </div>
          <div
            v-if="selectedSopCreativeVideo"
            class="gmv-sop-video-workspace"
          >
            <aside
              class="gmv-sop-video-list"
              :aria-label="t('gmvMaxSopVideo.videoList')"
            >
              <div class="gmv-sop-video-list__items">
                <button
                  v-for="item in pagedSopCreativeVideos"
                  :key="item.id"
                  type="button"
                  :data-creative-id="item.creativeId"
                  :class="{
                    'is-active':
                      item.id === selectedSopCreativeVideo.id,
                  }"
                  @click="selectedSopVideoId = item.id"
                >
                  <span class="gmv-sop-video-list__cover">
                    <img
                      v-if="item.coverUrl"
                      :src="item.coverUrl"
                      alt=""
                      @error="hideBrokenSopVideoCover(item)"
                    />
                    <Film
                      v-else
                      :title="t('gmvMaxSopVideo.previewUnavailable')"
                    />
                    <i v-if="sopVideoPlayable(item)"><PlayCircle /></i>
                  </span>
                  <span class="gmv-sop-video-list__copy"
                    ><strong :title="item.name">{{ item.name }}</strong
                    ><small
                      >{{ shortSopIdentifier(item.creativeId) }} /
                      {{
                        item.performance.available
                          ? `${item.performance.days} ${t("gmvMaxSopVideo.days")}`
                          : t("gmvMaxSopVideo.noData")
                      }}</small
                    ><em
                      ><b :class="`is-${item.grade.toLowerCase()}`">{{
                        item.grade
                      }}</b
                      ><span v-if="item.performance.roi">{{
                        formatRoi(item.performance.roi)
                      }}</span
                      ><span v-else>{{
                        t("gmvMaxSopVideo.noData")
                      }}</span></em
                    ></span
                  >
                </button>
              </div>
              <footer class="gmv-sop-video-pagination">
                <span>{{
                  t("gmvMaxSopVideoWorkbench.page", {
                    current: sopVideoPage,
                    total: sopVideoPageCount,
                    count: selectedSopVideoGradeItems.length,
                  })
                }}</span>
                <div>
                  <button
                    type="button"
                    :title="t('gmvMaxData.previous')"
                    :disabled="sopVideoPage <= 1"
                    @click="changeSopVideoPage(sopVideoPage - 1)"
                  >
                    <ChevronRight /></button
                  ><button
                    type="button"
                    :title="t('gmvMaxData.next')"
                    :disabled="sopVideoPage >= sopVideoPageCount"
                    @click="changeSopVideoPage(sopVideoPage + 1)"
                  >
                    <ChevronRight />
                  </button>
                </div>
              </footer>
            </aside>

            <article class="gmv-sop-video-detail">
              <div class="gmv-sop-video-detail__preview">
                <img
                  v-if="selectedSopCreativeVideo.coverUrl"
                  :src="selectedSopCreativeVideo.coverUrl"
                  :alt="selectedSopCreativeVideo.name"
                  @error="
                    hideBrokenSopVideoCover(selectedSopCreativeVideo)
                  "
                />
                <div v-else>
                  <Film /><span>{{
                    t("gmvMaxSopVideo.previewUnavailable")
                  }}</span
                  ><small>{{ t("gmvMaxSopVideo.previewHint") }}</small>
                </div>
                <button
                  v-if="sopVideoPlayable(selectedSopCreativeVideo)"
                  type="button"
                  data-testid="gmv-sop-video-preview-button"
                  :title="t('gmvMaxSopVideo.preview')"
                  @click="
                    openSopCreativeVideo(selectedSopCreativeVideo)
                  "
                >
                  <PlayCircle /><span>{{
                    t("gmvMaxSopVideo.preview")
                  }}</span>
                </button>
                <span class="gmv-sop-video-detail__duration">{{
                  sopVideoDuration(
                    selectedSopCreativeVideo.durationSeconds,
                  )
                }}</span>
              </div>
              <div class="gmv-sop-video-detail__content">
                <header>
                  <div>
                    <span>{{
                      t("gmvMaxSopVideo.performanceLabel")
                    }}</span>
                    <h3 :title="selectedSopCreativeVideo.name">
                      {{ selectedSopCreativeVideo.name }}
                    </h3>
                    <p>
                      {{ t("gmvMaxSopVideo.videoId") }}
                      {{
                        shortSopIdentifier(
                          selectedSopCreativeVideo.creativeId,
                        )
                      }}
                    </p>
                  </div>
                  <span
                    :class="[
                      'gmv-sop-grade',
                      `is-${selectedSopCreativeVideo.grade.toLowerCase()}`,
                    ]"
                    >{{ selectedSopCreativeVideo.grade }}</span
                  >
                </header>
                <dl class="gmv-sop-video-meta">
                  <div>
                    <dt>{{ t("gmvMaxSopVideo.source") }}</dt>
                    <dd>
                      {{
                        sopVideoSource(selectedSopCreativeVideo.source)
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt>{{ t("gmvMaxSopVideo.authorization") }}</dt>
                    <dd>
                      {{
                        structuredValueLabel(
                          selectedSopCreativeVideo.authorizationStatus ||
                            selectedSopCreativeVideo.authorizationType,
                        )
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt>{{ t("gmvMaxSopVideo.delivery") }}</dt>
                    <dd>
                      {{
                        structuredValueLabel(
                          selectedSopCreativeVideo.deliveryStatus,
                        )
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt>{{ t("gmvMaxSopVideo.period") }}</dt>
                    <dd>
                      {{
                        selectedSopCreativeVideo.reportingStartDate &&
                        selectedSopCreativeVideo.reportingEndDate
                          ? `${selectedSopCreativeVideo.reportingStartDate} - ${selectedSopCreativeVideo.reportingEndDate}`
                          : t("gmvMaxSopVideo.noData")
                      }}
                    </dd>
                  </div>
                </dl>
                <div class="gmv-sop-video-primary-metrics">
                  <article>
                    <span>{{ t("gmvMaxSop.metrics.spend") }}</span
                    ><strong>{{
                      selectedSopCreativeVideo.performance.spend !==
                      undefined
                        ? formatCny(
                            selectedSopCreativeVideo.performance.spend,
                            selectedSop.storeId,
                          )
                        : t("gmvMaxSopVideo.noData")
                    }}</strong>
                  </article>
                  <article>
                    <span>GMV</span
                    ><strong>{{
                      selectedSopCreativeVideo.performance.gmv !==
                      undefined
                        ? formatCny(
                            selectedSopCreativeVideo.performance.gmv,
                            selectedSop.storeId,
                          )
                        : t("gmvMaxSopVideo.noData")
                    }}</strong>
                  </article>
                  <article>
                    <span>ROI</span
                    ><strong>{{
                      selectedSopCreativeVideo.performance.roi !==
                      undefined
                        ? formatRoi(
                            selectedSopCreativeVideo.performance.roi,
                          )
                        : t("gmvMaxSopVideo.noData")
                    }}</strong>
                  </article>
                  <article>
                    <span>{{ t("gmvMaxSop.metrics.orders") }}</span
                    ><strong>{{
                      selectedSopCreativeVideo.performance.orders !==
                      undefined
                        ? formatInteger(
                            selectedSopCreativeVideo.performance.orders,
                          )
                        : t("gmvMaxSopVideo.noData")
                    }}</strong>
                  </article>
                </div>
                <div class="gmv-sop-video-secondary-metrics">
                  <span
                    ><small>CTR</small
                    ><strong>{{
                      selectedSopCreativeVideo.performance.ctr !==
                      undefined
                        ? formatPercent(
                            selectedSopCreativeVideo.performance.ctr,
                          )
                        : t("gmvMaxSopVideo.noData")
                    }}</strong></span
                  ><span
                    ><small>CVR</small
                    ><strong>{{
                      selectedSopCreativeVideo.performance.cvr !==
                      undefined
                        ? formatPercent(
                            selectedSopCreativeVideo.performance.cvr,
                          )
                        : t("gmvMaxSopVideo.noData")
                    }}</strong></span
                  ><span
                    ><small>CPA</small
                    ><strong>{{
                      selectedSopCreativeVideo.performance.cpa !==
                      undefined
                        ? formatCny(
                            selectedSopCreativeVideo.performance.cpa,
                            selectedSop.storeId,
                          )
                        : t("gmvMaxSopVideo.noData")
                    }}</strong></span
                  ><span
                    ><small>{{ t("gmvMaxSopVideo.playDepth") }}</small
                    ><strong>{{
                      selectedSopCreativeVideo.performance.playDepth !==
                      undefined
                        ? formatPercent(
                            selectedSopCreativeVideo.performance
                              .playDepth,
                          )
                        : t("gmvMaxSopVideo.noData")
                    }}</strong></span
                  >
                </div>
                <section
                  class="gmv-sop-video-actions"
                  data-testid="gmv-sop-video-actions"
                >
                  <div>
                    <strong>{{
                      t("gmvMaxSopVideoWorkbench.actions.title")
                    }}</strong
                    ><span>{{
                      sopCreativeActionBlocked ||
                      t("gmvMaxSopVideoWorkbench.actions.approvalHint")
                    }}</span>
                  </div>
                  <div>
                    <button
                      v-if="selectedSopCreativeVideo.grade !== 'C'"
                      type="button"
                      class="gmv-button gmv-button--primary"
                      :disabled="
                        !!busyAction || !!sopCreativeActionBlocked
                      "
                      :title="
                        sopCreativeActionBlocked ||
                        t('gmvMaxSopVideoWorkbench.actions.heatHint')
                      "
                      @click="
                        createSopCreativeAction(
                          selectedSopCreativeVideo,
                          'ADD',
                        )
                      "
                    >
                      <Rocket class="gmv-icon" />{{
                        t(
                          selectedSopCreativeVideo.grade === "B"
                            ? "gmvMaxSopVideoWorkbench.actions.heatTest"
                            : "gmvMaxSopVideoWorkbench.actions.heat",
                        )
                      }}</button
                    ><button
                      v-if="selectedSopCreativeVideo.grade !== 'S'"
                      type="button"
                      class="gmv-button gmv-button--secondary gmv-sop-video-actions__exclude"
                      :disabled="
                        !!busyAction || !!sopCreativeActionBlocked
                      "
                      :title="
                        sopCreativeActionBlocked ||
                        t('gmvMaxSopVideoWorkbench.actions.excludeHint')
                      "
                      @click="
                        createSopCreativeAction(
                          selectedSopCreativeVideo,
                          'REMOVE',
                        )
                      "
                    >
                      <ShieldAlert class="gmv-icon" />{{
                        t("gmvMaxSopVideoWorkbench.actions.exclude")
                      }}</button
                    ><span
                      v-else
                      class="gmv-sop-video-actions__protected"
                      ><ShieldCheck />{{
                        t("gmvMaxSopVideoWorkbench.actions.protected")
                      }}</span
                    >
                  </div>
                </section>
                <section class="gmv-sop-video-analysis">
                  <header>
                    <strong>{{
                      t("gmvMaxSopVideo.analysisTitle")
                    }}</strong
                    ><span
                      :class="`is-${selectedSopCreativeVideo.freshness}`"
                      >{{
                        t(
                          `gmvMaxSopVideo.freshness.${selectedSopCreativeVideo.freshness}`,
                        )
                      }}</span
                    >
                  </header>
                  <ul>
                    <li
                      v-for="code in selectedSopCreativeVideo.analysisCodes"
                      :key="code"
                    >
                      {{ sopVideoAnalysis(code) }}
                    </li>
                  </ul>
                </section>
                <details class="gmv-sop-video-evidence">
                  <summary>{{ t("gmvMaxSopVideo.details") }}</summary>
                  <dl>
                    <div>
                      <dt>
                        {{ t("gmvMaxSopVideo.intelligenceScore") }}
                      </dt>
                      <dd>
                        {{
                          formatInteger(
                            selectedSopCreativeVideo.intelligence.score,
                          )
                        }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t("gmvMaxSopVideo.roiTrend") }}</dt>
                      <dd>
                        {{
                          selectedSopCreativeVideo.intelligence
                            .roiTrendPercent !== undefined
                            ? formatPercent(
                                selectedSopCreativeVideo.intelligence
                                  .roiTrendPercent,
                                true,
                              )
                            : t("gmvMaxSopVideo.noData")
                        }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t("gmvMaxSopVideo.samples") }}</dt>
                      <dd>
                        {{
                          selectedSopCreativeVideo.performance.samples
                        }}
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t("gmvMaxSopVideo.lastSynced") }}</dt>
                      <dd>
                        {{
                          selectedSopCreativeVideo.syncedAt
                            ? formatDate(
                                selectedSopCreativeVideo.syncedAt,
                              )
                            : t("gmvMaxSopVideo.notAvailable")
                        }}
                      </dd>
                    </div>
                  </dl>
                </details>
              </div>
            </article>
          </div>
          <div v-else class="gmv-empty gmv-empty--small">
            {{
              selectedSopCreativeVideos.length
                ? t("gmvMaxSopVideoWorkbench.gradeEmpty")
                : t("gmvMaxSopVideo.empty")
            }}
          </div>
        </div>
      </section>
    </div>
  </template>
</section>
</template>
