<script lang="ts">
// actions page of the GMV MAX workspace. State and handlers come from TiktokGmvMaxOptimizerView via provide/inject.
import { defineComponent } from "vue";
import { ShieldAlert, Rocket, Gauge, Clock3, Filter, ChevronDown, Check, RotateCcw, ShieldCheck } from "lucide-vue-next";
import { useGmvWorkspace } from "./workspaceContext";

export default defineComponent({
  name: "GmvActionsPage",
  components: { ShieldAlert, Rocket, Gauge, Clock3, Filter, ChevronDown, Check, RotateCcw, ShieldCheck },
  setup() {
    return useGmvWorkspace();
  },
});
</script>

<template>
<section class="gmv-section">
  <div class="gmv-section__heading">
    <div>
      <h2>{{ t("gmvMax.recommendations.title") }}</h2>
      <p>{{ t("gmvMax.recommendations.subtitle") }}</p>
    </div>
    <div class="gmv-segments">
      <button
        v-for="status in ['all', 'pending', 'executed', 'failed']"
        :key="status"
        :class="{ 'is-active': actionStatus === status }"
        @click="
          actionStatus = status;
          loadActionPage(1);
        "
      >
        {{ t(`gmvMaxConsole.status.${status}`) }}
      </button>
    </div>
  </div>
  <section class="gmv-v2-decision-categories" data-testid="gmv-decision-categories">
    <article class="is-danger"><ShieldAlert /><div><span>{{ t("gmvMaxV2.action.category.high_risk") }}</span><strong>{{ commandCenter.topActions.filter((item) => item.category === 'high_risk').length }}</strong><small>{{ t("gmvMaxV2.action.categoryHint.high_risk") }}</small></div></article>
    <article class="is-success"><Rocket /><div><span>{{ t("gmvMaxV2.action.category.high_opportunity") }}</span><strong>{{ commandCenter.topActions.filter((item) => item.category === 'high_opportunity').length }}</strong><small>{{ t("gmvMaxV2.action.categoryHint.high_opportunity") }}</small></div></article>
    <article class="is-warning"><Gauge /><div><span>{{ t("gmvMaxV2.action.category.optimization") }}</span><strong>{{ commandCenter.topActions.filter((item) => item.category === 'optimization').length }}</strong><small>{{ t("gmvMaxV2.action.categoryHint.optimization") }}</small></div></article>
    <article class="is-blue"><Clock3 /><div><span>{{ t("gmvMaxV2.action.category.observing") }}</span><strong>{{ commandCenter.actionSummary.observing }}</strong><small>{{ t("gmvMaxV2.action.categoryHint.observing") }}</small></div></article>
  </section>
  <details class="gmv-advanced-details">
    <summary><Filter /><span><strong>{{ t("gmvMaxTaskUi.details.actionFilters") }}</strong><small>{{ t("gmvMaxTaskUi.details.actionFiltersHint") }}</small></span><ChevronDown /></summary>
  <div class="gmv-filter-panel gmv-filter-panel--action">
    <select v-model="actionCampaign" @change="loadActionPage(1)">
      <option value="all">{{ t("gmvMaxData.allCampaigns") }}</option>
      <option
        v-for="campaign in filteredCampaigns"
        :key="campaign.id"
        :value="campaign.id"
      >
        {{ campaign.name }}
      </option>
    </select>
    <select v-model="actionType" @change="loadActionPage(1)">
      <option value="all">{{ t("gmvMaxActionData.allTypes") }}</option>
      <option
        v-for="type in [
          'budget',
          'roi',
          'creative',
          'status',
          'session',
          'portfolio',
        ]"
        :key="type"
        :value="type"
      >
        {{ actionTypeLabel(type) }}
      </option>
    </select>
    <select v-model="actionRisk" @change="loadActionPage(1)">
      <option value="all">{{ t("gmvMaxActionData.allRisks") }}</option>
      <option value="low">{{ t("gmvMaxActionData.lowRisk") }}</option>
      <option value="medium">
        {{ t("gmvMaxActionData.mediumRisk") }}
      </option>
      <option value="high">{{ t("gmvMaxActionData.highRisk") }}</option>
    </select>
    <div
      class="gmv-action-sort-group"
      role="group"
      :aria-label="t('gmvMaxActionData.sortBy')"
    >
      <span>{{ t("gmvMaxActionData.sortBy") }}</span>
      <button
        :class="{
          'is-active': actionSortBy === 'projectedNetProfitDelta',
        }"
        :aria-pressed="actionSortBy === 'projectedNetProfitDelta'"
        @click="toggleActionSort('projectedNetProfitDelta')"
      >
        <component
          :is="
            actionSortBy === 'projectedNetProfitDelta'
              ? actionSortDirection === 'asc'
                ? ArrowUp
                : ArrowDown
              : ArrowUpDown
          "
        />{{ t("gmvMaxOperations.sortProfit") }}
      </button>
      <button
        :class="{ 'is-active': actionSortBy === 'createdAt' }"
        :aria-pressed="actionSortBy === 'createdAt'"
        @click="toggleActionSort('createdAt')"
      >
        <component
          :is="
            actionSortBy === 'createdAt'
              ? actionSortDirection === 'asc'
                ? ArrowUp
                : ArrowDown
              : ArrowUpDown
          "
        />{{ t("gmvMaxActionData.sortTime") }}
      </button>
      <button
        :class="{ 'is-active': actionSortBy === 'risk' }"
        :aria-pressed="actionSortBy === 'risk'"
        @click="toggleActionSort('risk')"
      >
        <component
          :is="
            actionSortBy === 'risk'
              ? actionSortDirection === 'asc'
                ? ArrowUp
                : ArrowDown
              : ArrowUpDown
          "
        />{{ t("gmvMaxActionData.sortRisk") }}
      </button>
    </div>
  </div>
  </details>
  <div
    v-if="selectedActionIds.length"
    class="gmv-batch-bar"
    data-testid="gmv-batch-bar"
  >
    <span>{{
      t("gmvMaxOperations.selected", {
        count: selectedActionIds.length,
      })
    }}</span
    ><span v-if="!batchRisk" class="gmv-status is-warning">{{
      t("gmvMaxOperations.sameRiskRequired")
    }}</span
    ><button
      class="gmv-button gmv-button--primary"
      :disabled="
        !!busyAction ||
        !batchRisk ||
        dashboard.scheduler.emergencyStopped
      "
      @click="approveSelectedActions"
    >
      <Check class="gmv-icon" />{{
        t("gmvMaxExecutionTruth.batchApproveAndExecute")
      }}</button
    ><button
      class="gmv-icon-button"
      :title="t('gmvMaxOperations.clearSelection')"
      @click="selectedActionIds = []"
    >
      <X class="gmv-icon" />
    </button>
  </div>
  <div class="gmv-recommendations">
    <article
      v-for="item in filteredActions"
      :key="item.id"
      class="gmv-recommendation"
      @click="openAction(item.id)"
    >
      <div class="gmv-recommendation__top">
        <div class="gmv-recommendation__identity">
          <input
            v-if="item.status === 'pending'"
            type="checkbox"
            :checked="selectedActionIds.includes(item.id)"
            :aria-label="t('gmvMaxOperations.selectAction')"
            @click.stop="toggleActionSelection(item)"
          />
          <div>
            <span
              :class="[
                'gmv-status',
                item.kind === 'scale_up' ? 'is-success' : 'is-warning',
              ]"
              >{{ recommendationActionLabel(item) }}</span
            >
            <h3>{{ campaignName(item.campaignId) }}</h3>
          </div>
        </div>
        <div class="gmv-row__actions">
          <span
            v-if="item.status === 'pending' && item.shadow"
            class="gmv-status is-neutral"
            :title="t('gmvMaxExecutionTruth.shadowApprovalHint')"
            >{{ t("gmvMaxExecutionTruth.shadowSuggestion") }}</span
          ><span
            v-else-if="
              item.status === 'executed' && item.platformStateVerified
            "
            class="gmv-status is-success"
            :title="item.remoteRequestId || undefined"
            >{{ t("gmvMaxExecutionTruth.platformVerified") }}</span
          ><span
            v-else-if="
              item.status === 'executed' && item.writeAttempted
            "
            class="gmv-status is-blue"
            :title="item.remoteRequestId || undefined"
            >{{ t("gmvMaxExecutionTruth.platformAccepted") }}</span
          ><span :class="['gmv-status', statusClass(item.status)]">{{
            t(`gmvMax.status.${item.status}`, item.status)
          }}</span>
        </div>
      </div>
      <div class="gmv-recommendation__summary">
        <strong>{{ t("gmvMaxRecommendationUi.suggestion") }}</strong
        ><span>{{ recommendationActionLabel(item) }}</span>
      </div>
      <div class="gmv-diff">
        <div>
          <span>{{ t("gmvMax.fields.budget") }}</span
          ><template
            v-if="
              metricNumber(item.currentBudget) !==
              metricNumber(item.proposedBudget)
            "
            ><strong>{{
              formatCny(
                item.currentBudget,
                campaignStoreId(item.campaignId),
              )
            }}</strong
            ><span class="gmv-arrow">&gt;</span
            ><strong>{{
              formatCny(
                item.proposedBudget,
                campaignStoreId(item.campaignId),
              )
            }}</strong></template
          ><template v-else
            ><strong class="gmv-no-change">{{
              t("gmvMaxRecommendationUi.unchanged")
            }}</strong
            ><small>{{
              formatCny(
                item.currentBudget,
                campaignStoreId(item.campaignId),
              )
            }}</small></template
          >
        </div>
        <div>
          <span>{{ t("gmvMax.fields.targetRoi") }}</span
          ><template
            v-if="
              metricNumber(item.currentRoasBid) !==
              metricNumber(item.proposedRoasBid)
            "
            ><strong>{{ formatRoi(item.currentRoasBid) }}</strong
            ><span class="gmv-arrow">&gt;</span
            ><strong>{{
              formatRoi(item.proposedRoasBid)
            }}</strong></template
          ><template v-else
            ><strong class="gmv-no-change">{{
              t("gmvMaxRecommendationUi.unchanged")
            }}</strong
            ><small>{{
              formatRoi(item.currentRoasBid)
            }}</small></template
          >
        </div>
      </div>
      <p class="gmv-reason">
        <strong>{{ t("gmvMaxRecommendationUi.reason") }}</strong
        >{{ recommendationReasonLabel(item.reason) }}
      </p>
      <div v-if="item.status === 'failed'" class="gmv-action-failure">
        <ShieldAlert />
        <div>
          <strong>{{
            t("gmvMaxIssueResolutions.executionFailed")
          }}</strong
          ><span>{{
            item.lastError || t("gmvMaxIssueResolutions.failureUnknown")
          }}</span
          ><small>{{
            item.writeAttempted && !item.platformStateVerified
              ? t("gmvMaxIssueResolutions.verifyBeforeRetry")
              : item.retryAllowed
                ? t("gmvMaxIssueResolutions.safeToRetry")
                : t("gmvMaxIssueResolutions.reviewAudit")
          }}</small>
        </div>
      </div>
      <dl class="gmv-evidence">
        <div>
          <dt>{{ t("gmvMaxOperations.projectedProfit") }}</dt>
          <dd
            :class="
              item.projectionSource === 'modeled'
                ? metricNumber(item.projectedNetProfitDelta) >= 0
                  ? 'is-positive'
                  : 'is-negative'
                : ''
            "
          >
            {{
              recommendationProjectionLabel(
                item.projectedNetProfitDelta,
                item,
              )
            }}
          </dd>
        </div>
        <div>
          <dt>{{ t("gmvMaxOperations.projectedGmv") }}</dt>
          <dd>
            {{
              recommendationProjectionLabel(
                item.projectedGmvDelta,
                item,
              )
            }}
          </dd>
        </div>
        <div>
          <dt>{{ t("gmvMaxOperations.confidence") }}</dt>
          <dd>{{ recommendationConfidenceLabel(item) }}</dd>
        </div>
        <div>
          <dt>{{ t("gmvMaxRecommendationUi.statisticsPeriod") }}</dt>
          <dd>{{ formatEvidenceRange(item) }}</dd>
        </div>
        <div>
          <dt>{{ t("gmvMax.fields.averageRoi") }}</dt>
          <dd>{{ formatRoi(item.evidence.averageRoi) }}</dd>
        </div>
        <div>
          <dt>{{ t("gmvMaxAdvanced.fields.profitFloor") }}</dt>
          <dd>
            {{
              item.profitGuard?.effectiveRoiFloor
                ? formatRoi(item.profitGuard.effectiveRoiFloor)
                : t("gmvMaxRecommendationUi.notAvailable")
            }}
          </dd>
        </div>
        <div>
          <dt>{{ t("gmvMax.fields.orders") }}</dt>
          <dd>{{ formatInteger(item.evidence.totalOrders) }}</dd>
        </div>
        <div v-if="item.remoteRequestId">
          <dt>{{ t("gmvMaxExecutionTruth.requestId") }}</dt>
          <dd>{{ item.remoteRequestId }}</dd>
        </div>
        <div v-if="item.calibration">
          <dt>{{ t("gmvMaxCalibration.step") }}</dt>
          <dd>
            x{{ item.calibration.budgetStepMultiplier.toFixed(2) }} /
            {{ formatInteger(item.calibration.sampleCount) }}
          </dd>
        </div>
      </dl>
      <div
        v-if="item.status === 'pending'"
        class="gmv-recommendation__actions"
      >
        <button
          class="gmv-button gmv-button--secondary"
          :disabled="!!busyAction"
          @click.stop="reject(item.id)"
        >
          <X class="gmv-icon" />{{ t("gmvMax.actions.reject") }}</button
        ><button
          class="gmv-button gmv-button--primary"
          :disabled="!!busyAction || !canExecute(item)"
          @click.stop="approve(item.id)"
        >
          <Check class="gmv-icon" />{{
            t("gmvMaxExecutionTruth.approveAndExecute")
          }}
        </button>
      </div>
      <div
        v-else-if="item.status === 'failed'"
        class="gmv-recommendation__actions"
      >
        <button
          class="gmv-button gmv-button--secondary"
          :disabled="!!busyAction"
          @click.stop="reject(item.id)"
        >
          <X class="gmv-icon" />{{
            t("gmvMaxRecovery.acknowledge")
          }}</button
        ><button
          v-if="item.retryAllowed"
          class="gmv-button gmv-button--primary"
          :disabled="!!busyAction"
          @click.stop="approve(item.id)"
        >
          <RotateCcw class="gmv-icon" />{{
            t("gmvMaxSop.actions.retry")
          }}</button
        ><button
          v-else
          class="gmv-button gmv-button--secondary"
          @click.stop="
            auditCampaign = item.campaignId;
            activeTab = 'audit';
          "
        >
          <ShieldCheck class="gmv-icon" />{{
            t("gmvMaxIssueResolutions.actions.audit")
          }}
        </button>
      </div>
      <div
        v-else-if="item.status === 'executed' && item.reversible"
        class="gmv-recommendation__actions"
      >
        <button
          class="gmv-button gmv-button--secondary"
          :disabled="!!busyAction"
          @click.stop="rollback(item.id)"
        >
          <RotateCcw class="gmv-icon" />{{
            t("gmvMaxAdvanced.actions.restore")
          }}
        </button>
      </div>
    </article>
    <div v-if="actionLoading && !actionPage.items.length" class="gmv-empty">
      {{ t("gmvMaxData.loadingPage") }}
    </div>
    <div v-else-if="!filteredActions.length" class="gmv-empty">
      {{ t("gmvMax.empty.recommendations") }}
    </div>
  </div>
  <div class="gmv-pagination">
    <span>{{
      t("gmvMaxData.pageSummary", {
        current: actionPage.page,
        total: Math.max(
          1,
          Math.ceil(actionPage.total / actionPage.pageSize),
        ),
        count: actionPage.total,
      })
    }}</span
    ><select
      v-model.number="actionPage.pageSize"
      @change="loadActionPage(1)"
    >
      <option :value="10">10</option>
      <option :value="20">20</option>
      <option :value="50">50</option>
      <option :value="100">100</option></select
    ><button
      class="gmv-button gmv-button--secondary"
      :disabled="actionPage.page <= 1 || actionLoading"
      @click="loadActionPage(actionPage.page - 1)"
    >
      {{ t("gmvMaxData.previous") }}</button
    ><button
      class="gmv-button gmv-button--secondary"
      :disabled="
        actionPage.page >=
          Math.ceil(actionPage.total / actionPage.pageSize) ||
        actionLoading
      "
      @click="loadActionPage(actionPage.page + 1)"
    >
      {{ t("gmvMaxData.next") }}
    </button>
  </div>
</section>
</template>
