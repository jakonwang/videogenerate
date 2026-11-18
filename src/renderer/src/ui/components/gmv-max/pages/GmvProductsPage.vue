<script lang="ts">
// growth page of the GMV MAX workspace. State and handlers come from TiktokGmvMaxOptimizerView via provide/inject.
import { defineComponent } from "vue";
import { Filter, ChevronDown, Maximize2, ImageOff, Gauge, Pencil, ArrowRightLeft, Check } from "lucide-vue-next";
import { useGmvWorkspace } from "./workspaceContext";

export default defineComponent({
  name: "GmvProductsPage",
  components: { Filter, ChevronDown, Maximize2, ImageOff, Gauge, Pencil, ArrowRightLeft, Check },
  setup() {
    return useGmvWorkspace();
  },
});
</script>

<template>
<section
  class="gmv-section"
  data-testid="gmv-growth-workspace"
>
  <section
    class="gmv-panel gmv-product-lab"
    data-testid="gmv-product-lab"
  >
    <details
      class="gmv-advanced-details gmv-advanced-details--embedded"
    >
      <summary>
        <Filter /><span
          ><strong>{{
            t("gmvMaxTaskUi.details.productFilters")
          }}</strong
          ><small>{{
            t("gmvMaxTaskUi.details.productFiltersHint")
          }}</small></span
        ><ChevronDown />
      </summary>
      <div class="gmv-filter-panel gmv-filter-panel--product">
        <select v-model="productCampaign" @change="loadProductPage(1)">
          <option value="all">
            {{ t("gmvMaxData.allCampaigns") }}
          </option>
          <option
            v-for="campaign in filteredCampaigns"
            :key="campaign.id"
            :value="campaign.id"
          >
            {{ campaign.name }}
          </option>
        </select>
        <select v-model="productState" @change="loadProductPage(1)">
          <option value="all">
            {{ t("gmvMaxProductData.allStates") }}
          </option>
          <option
            v-for="state in [
              'blocked',
              'cold_start',
              'testing',
              'winner',
              'scale_ready',
              'stable',
              'declining',
              'losing',
            ]"
            :key="state"
            :value="state"
          >
            {{ t(`gmvMaxProductLab.states.${state}`) }}
          </option>
        </select>
        <select
          v-model="productAllocation"
          @change="loadProductPage(1)"
        >
          <option value="all">
            {{ t("gmvMaxProductData.allAllocations") }}
          </option>
          <option
            v-for="state in [
              'starved',
              'balanced',
              'overfunded',
              'blocked',
            ]"
            :key="state"
            :value="state"
          >
            {{ t(`gmvMaxProductLab.allocationStates.${state}`) }}
          </option>
        </select>
        <input
          v-model.number="minProductSpend"
          type="number"
          min="0"
          :disabled="moneyFilterDisabled()"
          :placeholder="`${t('gmvMaxData.minSpend')} (${t('gmvMaxCurrency.cnyUnit')})`"
        />
        <input
          v-model.number="minProductOrders"
          type="number"
          min="0"
          :placeholder="t('gmvMaxData.minOrders')"
        />
        <input
          v-model.number="minProductRoi"
          type="number"
          min="0"
          step="0.01"
          :placeholder="t('gmvMaxData.minRoi')"
        />
        <input
          v-model.number="minProductScore"
          type="number"
          min="0"
          max="100"
          :placeholder="t('gmvMaxProductData.minScore')"
        />
        <button
          class="gmv-button gmv-button--primary"
          :disabled="productLoading"
          @click="loadProductPage(1)"
        >
          <Filter class="gmv-icon" />{{ t("gmvMaxData.applyMetrics") }}
        </button>
      </div>
    </details>
    <div class="gmv-table-wrap">
      <table class="gmv-table gmv-table--products">
        <thead>
          <tr>
            <th>
              <button
                class="gmv-sort-button"
                @click="toggleProductSort('productName')"
              >
                {{ t("gmvMaxProductLab.product") }}
                <small>{{
                  sortMark(
                    "productName",
                    productSortBy,
                    productSortDirection,
                  )
                }}</small>
              </button>
            </th>
            <th>{{ t("gmvMax.fields.campaign") }}</th>
            <th>
              <button
                class="gmv-sort-button"
                @click="toggleProductSort('sellingPrice')"
              >
                {{ t("gmvMaxCostData.price") }}
                <small>{{
                  sortMark(
                    "sellingPrice",
                    productSortBy,
                    productSortDirection,
                  )
                }}</small>
              </button>
              /
              <button
                class="gmv-sort-button"
                @click="toggleProductSort('inventory')"
              >
                {{ t("gmvMaxCostData.inventory") }}
                <small>{{
                  sortMark(
                    "inventory",
                    productSortBy,
                    productSortDirection,
                  )
                }}</small>
              </button>
            </th>
            <th>{{ t("gmvMaxProductLab.stage") }}</th>
            <th>
              <button
                class="gmv-sort-button"
                @click="toggleProductSort('score')"
              >
                {{ t("gmvMaxIntelligence.score") }}
                <small>{{
                  sortMark("score", productSortBy, productSortDirection)
                }}</small>
              </button>
            </th>
            <th>
              <button
                class="gmv-sort-button"
                @click="toggleProductSort('spend')"
              >
                {{ t("gmvMaxConsole.spend") }}
                <small>{{
                  sortMark("spend", productSortBy, productSortDirection)
                }}</small>
              </button>
              /
              <button
                class="gmv-sort-button"
                @click="toggleProductSort('grossRevenue')"
              >
                {{ t("gmvMaxConsole.grossRevenue") }}
                <small>{{
                  sortMark(
                    "grossRevenue",
                    productSortBy,
                    productSortDirection,
                  )
                }}</small>
              </button>
            </th>
            <th>
              <button
                class="gmv-sort-button"
                @click="toggleProductSort('roi')"
              >
                ROI
                <small>{{
                  sortMark("roi", productSortBy, productSortDirection)
                }}</small>
              </button>
              / {{ t("gmvMaxLearning.profitFloor") }}
            </th>
            <th>
              <button
                class="gmv-sort-button"
                @click="toggleProductSort('estimatedProfit')"
              >
                {{ t("gmvMaxProductLab.profit") }}
                <small>{{
                  sortMark(
                    "estimatedProfit",
                    productSortBy,
                    productSortDirection,
                  )
                }}</small>
              </button>
            </th>
            <th>
              <button
                class="gmv-sort-button"
                @click="toggleProductSort('spendShare')"
              >
                {{ t("gmvMaxProductLab.allocation") }}
                <small>{{
                  sortMark(
                    "spendShare",
                    productSortBy,
                    productSortDirection,
                  )
                }}</small>
              </button>
            </th>
            <th>
              <button
                class="gmv-sort-button"
                @click="toggleProductSort('creativeCount')"
              >
                {{ t("gmvMaxProductLab.proof") }}
                <small>{{
                  sortMark(
                    "creativeCount",
                    productSortBy,
                    productSortDirection,
                  )
                }}</small>
              </button>
            </th>
            <th>{{ t("gmvMaxProductLab.nextAction") }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredProductInsights" :key="item.id">
            <td>
              <div class="gmv-product-identity">
                <button
                  v-if="item.imageUrl"
                  class="gmv-product-thumb"
                  type="button"
                  :title="t('gmvMaxProductImage.open')"
                  @click="openProductImage(item)"
                >
                  <img
                    :src="item.imageUrl"
                    :alt="item.productName || item.productId"
                    loading="lazy"
                    decoding="async"
                    @error="clearProductImage(item)"
                  /><span><Maximize2 /></span>
                </button>
                <div v-else class="gmv-product-thumb is-placeholder">
                  <ImageOff />
                </div>
                <div>
                  <strong :title="item.productName || item.productId">{{
                    item.productName || item.productId
                  }}</strong
                  ><small>{{ item.productId }} · {{
                    item.categoryName ||
                    t("gmvMaxCostData.uncategorized")
                  }}</small>
                </div>
              </div>
            </td>
            <td>
              <div
                v-if="item.promotionSeries?.length"
                class="gmv-product-series"
                :title="item.promotionSeries.map((series) => series.campaignName).join(' / ')"
              >
                <strong
                  v-for="series in item.promotionSeries.slice(0, 2)"
                  :key="series.campaignId"
                  >{{ series.campaignName }}</strong
                ><small v-if="item.promotionSeries.length > 2" class="gmv-more">{{
                  t("gmvV2.table.moreCampaigns", { count: item.promotionSeries.length - 2 })
                }}</small>
              </div>
              <strong v-else>{{ campaignName(item.campaignId) }}</strong
              ><small>{{
                uniqueStores.find(
                  (store) => store.storeId === item.storeId,
                )?.storeName || item.storeId
              }}</small>
            </td>
            <td>
              <strong :title="t('gmvMaxSku.actualPrice')">{{ actualSellingPriceLabel(item) }}</strong
              ><small :title="structuredValueLabel(item.gmvMaxAdsStatus || item.catalogStatus)"
                >{{ t("gmvMaxCostData.inventory") }}
                {{ item.inventory || "-" }} ·
                {{ t("gmvMaxCostData.skuCount") }}
                {{ formatInteger(item.skuCount || 0) }}</small
              >
            </td>
            <td>
              <span
                :class="['gmv-status', productStateClass(item.state)]"
                >{{ t(`gmvMaxProductLab.states.${item.state}`) }}</span
              ><small v-if="item.protected">{{
                t("gmvMaxProductLab.protected")
              }}</small>
            </td>
            <td>
              <div class="gmv-score">
                <span :style="{ width: `${item.score}%` }"></span>
              </div>
              <strong>{{ item.score }}</strong>
            </td>
            <td>
              <strong
                >{{ formatCny(item.spend, item.storeId) }} /
                {{ formatCny(item.grossRevenue, item.storeId) }}</strong
              ><small
                >{{ formatInteger(item.orders) }}
                {{ t("gmvMax.fields.orders") }}</small
              >
            </td>
            <td>
              <strong
                >{{ formatRoi(item.roi) }} /
                {{ formatRoi(item.profitFloor) }}</strong
              ><small
                :class="
                  metricNumber(item.roiTrendPercent) >= 0
                    ? 'is-positive'
                    : 'is-negative'
                "
                >{{ formatPercent(item.roiTrendPercent, true) }}</small
              >
            </td>
            <td
              :class="
                metricNumber(item.estimatedProfit) >= 0
                  ? 'is-positive'
                  : 'is-negative'
              "
            >
              {{
                item.profitEstimateAvailable
                  ? formatCny(item.estimatedProfit, item.storeId)
                  : "-"
              }}
            </td>
            <td>
              <span
                :class="[
                  'gmv-flow-state',
                  item.allocationState === 'starved'
                    ? 'is-slow'
                    : item.allocationState === 'overfunded'
                      ? 'is-fast'
                      : 'is-stable',
                ]"
                ><Gauge class="gmv-icon" />{{
                  t(
                    `gmvMaxProductLab.allocationStates.${item.allocationState}`,
                  )
                }}</span
              ><small
                >{{ formatPercent(item.spendShare) }} /
                {{ formatPercent(item.revenueShare) }}</small
              >
            </td>
            <td>
              {{ item.creativeCount }}
              {{ t("gmvMaxProductLab.creatives")
              }}<small
                >{{ item.daysObserved }}
                {{ t("gmvMaxConsole.days") }}</small
              >
            </td>
            <td>
              <strong>{{
                t(`gmvMaxProductLab.actions.${item.recommendedAction}`)
              }}</strong
              ><small>{{
                item.signals
                  .slice(0, 2)
                  .map((signal) =>
                    t(`gmvMaxProductLab.signals.${signal}`),
                  )
                  .join(" / ")
              }}</small>
            </td>
            <td>
              <button
                class="gmv-button gmv-button--secondary"
                @click="openProductInsight(item)"
              >
                <Pencil class="gmv-icon" />{{
                  t("gmvMaxConsole.configure")
                }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="productLoading && !productPage.items.length" class="gmv-empty gmv-empty--small">
        {{ t("gmvMaxData.loadingPage") }}
      </div>
      <div
        v-else-if="!filteredProductInsights.length"
        class="gmv-empty gmv-empty--small"
      >
        {{ t("gmvMaxProductLab.empty") }}
      </div>
      <div class="gmv-pagination">
        <span>{{
          t("gmvMaxData.pageSummary", {
            current: productPage.page,
            total: Math.max(
              1,
              Math.ceil(productPage.total / productPage.pageSize),
            ),
            count: productPage.total,
          })
        }}</span
        ><select
          v-model.number="productPage.pageSize"
          @change="loadProductPage(1)"
        >
          <option :value="10">10</option>
          <option :value="25">25</option>
          <option :value="50">50</option>
          <option :value="100">100</option></select
        ><button
          class="gmv-button gmv-button--secondary"
          :disabled="productPage.page <= 1 || productLoading"
          @click="loadProductPage(productPage.page - 1)"
        >
          {{ t("gmvMaxData.previous") }}</button
        ><button
          class="gmv-button gmv-button--secondary"
          :disabled="
            productPage.page >=
              Math.ceil(productPage.total / productPage.pageSize) ||
            productLoading
          "
          @click="loadProductPage(productPage.page + 1)"
        >
          {{ t("gmvMaxData.next") }}
        </button>
      </div>
    </div>
  </section>
  <section
    class="gmv-panel gmv-calibration-panel"
    data-testid="gmv-strategy-calibrations"
  >
    <div class="gmv-panel__heading">
      <div>
        <h2>{{ t("gmvMaxCalibration.title") }}</h2>
        <p>{{ t("gmvMaxCalibration.subtitle") }}</p>
      </div>
      <span class="gmv-status is-blue"
        >{{ activeCalibrations.length }}
        {{ t("gmvMaxCalibration.active") }}</span
      >
    </div>
    <div class="gmv-table-wrap">
      <table class="gmv-table gmv-table--calibration">
        <thead>
          <tr>
            <th>{{ t("gmvMax.fields.campaign") }}</th>
            <th>{{ t("gmvMax.fields.action") }}</th>
            <th>{{ t("gmvMaxCalibration.source") }}</th>
            <th>{{ t("gmvMaxCalibration.samples") }}</th>
            <th>{{ t("gmvMaxCalibration.winRate") }}</th>
            <th>{{ t("gmvMaxCalibration.profitLift") }}</th>
            <th>{{ t("gmvMaxCalibration.step") }}</th>
            <th>{{ t("gmvMaxLearning.confidence") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in filteredCalibrations.slice(0, 50)"
            :key="`${item.campaignId}:${item.kind}`"
          >
            <td>
              <strong>{{ campaignName(item.campaignId) }}</strong
              ><small>{{
                t(`gmvMaxCalibration.state.${item.state}`)
              }}</small>
            </td>
            <td>{{ t(`gmvMax.kinds.${item.kind}`) }}</td>
            <td>
              <span
                :class="[
                  'gmv-status',
                  calibrationStateClass(item.state),
                ]"
                >{{
                  t(`gmvMaxCalibration.sources.${item.source}`)
                }}</span
              >
            </td>
            <td>
              {{ formatInteger(item.successCount) }} /
              {{ formatInteger(item.sampleCount) }}
            </td>
            <td>
              {{
                item.sampleCount
                  ? formatPercent(item.successRate, true)
                  : "-"
              }}
            </td>
            <td
              :class="
                metricNumber(item.averageProfitDeltaPercent) >= 0
                  ? 'is-positive'
                  : 'is-negative'
              "
            >
              {{ formatPercent(item.averageProfitDeltaPercent, true) }}
            </td>
            <td>
              <strong
                >x{{ item.budgetStepMultiplier.toFixed(2) }}</strong
              >
            </td>
            <td>{{ formatPercent(item.confidence, true) }}</td>
          </tr>
        </tbody>
      </table>
      <div
        v-if="!filteredCalibrations.length"
        class="gmv-empty gmv-empty--small"
      >
        {{ t("gmvMaxCalibration.empty") }}
      </div>
    </div>
  </section>
  <section
    class="gmv-panel gmv-portfolio-panel"
    data-testid="gmv-portfolio-plans"
  >
    <div class="gmv-panel__heading">
      <div>
        <h2>{{ t("gmvMaxIntelligence.portfolioTitle") }}</h2>
        <p>{{ t("gmvMaxIntelligence.portfolioSubtitle") }}</p>
      </div>
      <ArrowRightLeft class="gmv-heading-icon" />
    </div>
    <div class="gmv-table-wrap">
      <table class="gmv-table gmv-table--portfolio">
        <thead>
          <tr>
            <th>{{ t("gmvMaxAdvanced.fields.store") }}</th>
            <th>{{ t("gmvMaxIntelligence.donor") }}</th>
            <th>{{ t("gmvMaxIntelligence.receiver") }}</th>
            <th>{{ t("gmvMaxIntelligence.amount") }}</th>
            <th>{{ t("gmvMaxIntelligence.budgetBeforeAfter") }}</th>
            <th>{{ t("gmvMaxIntelligence.projectedProfit") }}</th>
            <th>{{ t("gmvMaxIntelligence.confidence") }}</th>
            <th>{{ t("gmvMax.fields.status") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredPortfolioPlans" :key="item.id">
            <td>
              <strong>{{
                uniqueStores.find(
                  (store) => store.storeId === item.storeId,
                )?.storeName || item.storeId
              }}</strong
              ><small>{{
                item.evidenceEndDate ||
                t(`gmvMaxIntelligence.reason.${item.reason}`)
              }}</small>
            </td>
            <td>
              <strong>{{ campaignName(item.donorCampaignId) }}</strong
              ><small v-if="item.donorCampaignId"
                >{{
                  formatCny(item.donorBudgetBefore, item.storeId)
                }}
                &gt;
                {{
                  formatCny(item.donorBudgetAfter, item.storeId)
                }}</small
              >
            </td>
            <td>
              <strong>{{
                campaignName(item.receiverCampaignId)
              }}</strong
              ><small v-if="item.receiverCampaignId"
                >{{
                  formatCny(item.receiverBudgetBefore, item.storeId)
                }}
                &gt;
                {{
                  formatCny(item.receiverBudgetAfter, item.storeId)
                }}</small
              >
            </td>
            <td>
              <strong>{{
                formatCny(item.transferAmount, item.storeId)
              }}</strong
              ><small>{{
                item.budgetConserved
                  ? t("gmvMaxIntelligence.conserved")
                  : t("gmvMaxIntelligence.notConserved")
              }}</small>
            </td>
            <td>
              <template
                v-if="item.donorCampaignId && item.receiverCampaignId"
                >{{
                  formatCny(
                    metricNumber(item.donorBudgetBefore) +
                      metricNumber(item.receiverBudgetBefore),
                    item.storeId,
                  )
                }}<small>{{
                  formatCny(
                    metricNumber(item.donorBudgetAfter) +
                      metricNumber(item.receiverBudgetAfter),
                    item.storeId,
                  )
                }}</small></template
              ><template v-else>-</template>
            </td>
            <td
              :class="
                metricNumber(item.projectedProfitDelta) > 0
                  ? 'is-positive'
                  : ''
              "
            >
              {{ formatCny(item.projectedProfitDelta, item.storeId) }}
            </td>
            <td>{{ formatPercent(item.confidence, true) }}</td>
            <td>
              <span
                :class="[
                  'gmv-status',
                  item.status === 'proposed'
                    ? 'is-success'
                    : item.status === 'executed'
                      ? 'is-blue'
                      : 'is-warning',
                ]"
                >{{ portfolioStatusLabel(item.status) }}</span
              ><small>{{
                item.lastError ||
                t(`gmvMaxIntelligence.reason.${item.reason}`)
              }}</small>
              <div
                v-if="item.status === 'proposed'"
                class="gmv-row__actions"
              >
                <button
                  class="gmv-icon-button"
                  :title="t('gmvMax.actions.reject')"
                  :disabled="!!busyAction"
                  @click="rejectPortfolio(item.id)"
                >
                  <X class="gmv-icon" /></button
                ><button
                  class="gmv-icon-button"
                  :title="t('gmvMax.actions.approve')"
                  :disabled="!!busyAction"
                  @click="approvePortfolio(item.id)"
                >
                  <Check class="gmv-icon" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div
        v-if="!filteredPortfolioPlans.length"
        class="gmv-empty gmv-empty--small"
      >
        {{ t("gmvMaxIntelligence.noPortfolio") }}
      </div>
    </div>
  </section>
  <div class="gmv-table-wrap">
    <table class="gmv-table gmv-table--learning">
      <thead>
        <tr>
          <th>{{ t("gmvMax.fields.campaign") }}</th>
          <th>{{ t("gmvMaxLearning.stage") }}</th>
          <th>{{ t("gmvMaxLearning.score") }}</th>
          <th>{{ t("gmvMaxLearning.confidence") }}</th>
          <th>{{ t("gmvMaxLearning.recentRoi") }}</th>
          <th>{{ t("gmvMaxLearning.profitFloor") }}</th>
          <th>{{ t("gmvMaxLearning.trend") }}</th>
          <th>{{ t("gmvMaxConsole.pacing") }}</th>
          <th>{{ t("gmvMaxLearning.creativeProof") }}</th>
          <th>{{ t("gmvMaxLearningFeedback.actionProof") }}</th>
          <th>{{ t("gmvMaxLearning.nextFocus") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in filteredLearning" :key="item.snapshot.id">
          <td>
            <strong>{{ item.campaign.name }}</strong
            ><small
              >{{ bindingForCampaign(item.campaign)?.storeName }} /
              {{ formatInteger(item.snapshot.daysObserved) }}
              {{ t("gmvMaxConsole.days") }}</small
            >
          </td>
          <td>
            <span
              :class="['gmv-lifecycle', `is-${item.snapshot.stage}`]"
              :title="
                t(`gmvMaxLearning.stageHint.${item.snapshot.stage}`)
              "
              >{{
                t(`gmvMaxLearning.stages.${item.snapshot.stage}`)
              }}</span
            ><small v-if="item.snapshot.previousStage">{{
              t("gmvMaxLearning.fromStage", {
                stage: t(
                  `gmvMaxLearning.stages.${item.snapshot.previousStage}`,
                ),
              })
            }}</small>
          </td>
          <td>
            <div class="gmv-score">
              <span
                :style="{ width: `${item.snapshot.score}%` }"
              ></span>
            </div>
            <strong>{{ formatInteger(item.snapshot.score) }}</strong>
          </td>
          <td>{{ formatPercent(item.snapshot.confidence, true) }}</td>
          <td>
            <strong>{{ formatRoi(item.snapshot.recentRoi) }}</strong>
          </td>
          <td>{{ formatRoi(item.snapshot.profitFloor) }}</td>
          <td
            :class="
              metricNumber(item.snapshot.roiTrendPercent) >= 0
                ? 'is-positive'
                : 'is-negative'
            "
          >
            {{ formatPercent(item.snapshot.roiTrendPercent, true) }}
          </td>
          <td>{{ formatPercent(item.snapshot.budgetUtilization) }}</td>
          <td>
            {{ formatInteger(item.snapshot.winningCreativeCount) }} /
            {{ formatInteger(item.snapshot.creativeCount) }}
          </td>
          <td>
            {{
              formatInteger(item.snapshot.successfulOutcomeCount || 0)
            }}
            /
            {{ formatInteger(item.snapshot.measuredOutcomeCount || 0) }}
          </td>
          <td>
            <strong>{{
              t(
                `gmvMaxLearning.focus.${item.snapshot.recommendedFocus}`,
              )
            }}</strong
            ><small>{{
              item.snapshot.signals
                .slice(0, 2)
                .map(learningSignalLabel)
                .join(" / ")
            }}</small>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!filteredLearning.length" class="gmv-empty">
      {{ t("gmvMaxLearning.empty") }}
    </div>
  </div>
  <section
    class="gmv-panel gmv-outcome-panel"
    data-testid="gmv-outcome-learning"
  >
    <div class="gmv-panel__heading">
      <div>
        <h2>{{ t("gmvMaxLearningFeedback.outcomesTitle") }}</h2>
        <p>{{ t("gmvMaxLearningFeedback.outcomesSubtitle") }}</p>
      </div>
      <span class="gmv-status is-blue"
        >{{ formatInteger(outcomePage.total) }}
        {{ t("gmvMaxLearningFeedback.measuredActions") }}</span
      >
    </div>
    <div class="gmv-table-wrap">
      <table class="gmv-table">
        <thead>
          <tr>
            <th>{{ t("gmvMax.fields.campaign") }}</th>
            <th>{{ t("gmvMaxLearningFeedback.result") }}</th>
            <th>{{ t("gmvMaxLearningFeedback.roiBeforeAfter") }}</th>
            <th>{{ t("gmvMaxLearningFeedback.profitBeforeAfter") }}</th>
            <th>{{ t("gmvMaxLearningFeedback.roiLift") }}</th>
            <th>{{ t("gmvMaxLearningFeedback.profitLift") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredOutcomes" :key="item.id">
            <td>
              <strong>{{ campaignName(item.campaignId) }}</strong
              ><small>{{ formatDate(item.measuredAt) }}</small>
            </td>
            <td>
              <span
                :class="[
                  'gmv-status',
                  item.successful ? 'is-success' : 'is-warning',
                ]"
                >{{
                  item.successful
                    ? t("gmvMaxLearningFeedback.successful")
                    : t("gmvMaxLearningFeedback.needsAdjustment")
                }}</span
              >
            </td>
            <td>
              {{ formatRoi(item.preRoi) }} &gt;
              {{ formatRoi(item.postRoi) }}
            </td>
            <td>
              {{
                formatCny(
                  item.preEstimatedProfit,
                  campaignStoreId(item.campaignId),
                )
              }}
              &gt;
              {{
                formatCny(
                  item.postEstimatedProfit,
                  campaignStoreId(item.campaignId),
                )
              }}
            </td>
            <td
              :class="
                metricNumber(item.roiDeltaPercent) >= 0
                  ? 'is-positive'
                  : 'is-negative'
              "
            >
              {{ formatPercent(item.roiDeltaPercent, true) }}
            </td>
            <td
              :class="
                metricNumber(item.profitDeltaPercent) >= 0
                  ? 'is-positive'
                  : 'is-negative'
              "
            >
              {{ formatPercent(item.profitDeltaPercent, true) }}
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="outcomeLoading && !outcomePage.items.length" class="gmv-empty gmv-empty--small">
        {{ t("gmvMaxData.loadingPage") }}
      </div>
      <div
        v-else-if="!filteredOutcomes.length"
        class="gmv-empty gmv-empty--small"
      >
        {{ t("gmvMaxLearningFeedback.noOutcomes") }}
      </div>
    </div>
    <div class="gmv-pagination">
      <span>{{
        t("gmvMaxData.pageSummary", {
          current: outcomePage.page,
          total: Math.max(
            1,
            Math.ceil(outcomePage.total / outcomePage.pageSize),
          ),
          count: outcomePage.total,
        })
      }}</span
      ><select
        v-model.number="outcomePage.pageSize"
        @change="loadOutcomePage(1)"
      >
        <option :value="10">10</option>
        <option :value="20">20</option>
        <option :value="50">50</option>
        <option :value="100">100</option></select
      ><button
        class="gmv-button gmv-button--secondary"
        :disabled="outcomePage.page <= 1 || outcomeLoading"
        @click="loadOutcomePage(outcomePage.page - 1)"
      >
        {{ t("gmvMaxData.previous") }}</button
      ><button
        class="gmv-button gmv-button--secondary"
        :disabled="
          outcomePage.page >=
            Math.ceil(outcomePage.total / outcomePage.pageSize) ||
          outcomeLoading
        "
        @click="loadOutcomePage(outcomePage.page + 1)"
      >
        {{ t("gmvMaxData.next") }}
      </button>
    </div>
  </section>
</section>
</template>
