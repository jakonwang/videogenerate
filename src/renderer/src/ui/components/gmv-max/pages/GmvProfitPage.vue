<script lang="ts">
// profit page of the GMV MAX workspace. State and handlers come from TiktokGmvMaxOptimizerView via provide/inject.
import { defineComponent } from "vue";
import { Upload, Download, Check, Store, Clock3, CircleDollarSign, Plus, Filter, Maximize2, ImageOff, Pencil, Trash2 } from "lucide-vue-next";
import { useGmvWorkspace } from "./workspaceContext";

export default defineComponent({
  name: "GmvProfitPage",
  components: { Upload, Download, Check, Store, Clock3, CircleDollarSign, Plus, Filter, Maximize2, ImageOff, Pencil, Trash2 },
  setup() {
    return useGmvWorkspace();
  },
});
</script>

<template>
<section
  class="gmv-section gmv-profit-task-page gmv-dash-page"
>
  <div class="gmv-dtoolbar gmv-section__heading">
    <div class="gmv-dtoolbar__title">
      <h2>{{ t("gmvMaxAdvanced.profit.title") }}</h2>
      <span>{{ t("gmvMaxAdvanced.profit.subtitle") }}</span>
    </div>
    <div class="gmv-dtoolbar__actions">
      <label
        :class="[
          'gmv-button',
          'gmv-button--secondary',
          { 'is-disabled': !!busyAction },
        ]"
        ><Upload class="gmv-icon" />{{
          t("gmvMaxAdvanced.actions.import")
        }}<input
          class="gmv-file"
          data-testid="gmv-import-product-costs"
          type="file"
          accept=".csv,text/csv"
          :disabled="!!busyAction"
          @change="importCosts" /></label
      ><button
        class="gmv-button gmv-button--secondary"
        :disabled="!!busyAction"
        @click="exportCosts"
      >
        <Download class="gmv-icon" />{{
          t("gmvMaxAdvanced.actions.export")
        }}
      </button>
    </div>
  </div>
  <div class="gmv-profit-grid" data-testid="gmv-store-profit-summary">
    <article
      v-for="item in dashboard.storeProfitSummaries.filter(
        (summary) =>
          selectedStore === 'all' || summary.storeId === selectedStore,
      )"
      :key="item.storeId"
      class="gmv-profit-card"
    >
      <header>
        <div>
          <strong>{{
            uniqueStores.find((store) => store.storeId === item.storeId)
              ?.storeName || item.storeId
          }}</strong
          ><small>{{ item.startDate }} - {{ item.endDate }}</small>
        </div>
        <span
          :class="[
            'gmv-status',
            item.spendCoveragePercent >= 95 &&
            item.exchangeRateCoveragePercent === 100
              ? 'is-success'
              : 'is-warning',
          ]"
          >{{ formatPercent(item.spendCoveragePercent, true) }}
          {{ t("gmvMaxOperations.spendCoverage") }}</span
        >
      </header>
      <div class="gmv-profit-card__primary">
        <span
          ><small>{{ t("gmvMaxProfit.netProfit") }}</small
          ><strong
            :class="
              item.profitEstimateAvailable
                ? metricNumber(item.estimatedNetProfit) >= 0
                  ? 'is-positive'
                  : 'is-negative'
                : ''
            "
            >{{ storeProfitValue(item) }}</strong
          ></span
        >
        <span
          ><small>{{ t("gmvMaxProfit.capitalEfficiency") }}</small
          ><strong>{{
            item.profitEstimateAvailable
              ? formatPercent(item.capitalEfficiency)
              : "-"
          }}</strong></span
        >
        <span
          ><small>ROI</small
          ><strong>{{ formatRoi(item.roi) }}</strong></span
        >
      </div>
      <dl>
        <div>
          <dt>{{ t("gmvMaxConsole.spend") }}</dt>
          <dd>{{ formatCny(item.spend, item.storeId) }}</dd>
        </div>
        <div>
          <dt>{{ t("gmvMaxProfit.atRiskSpend") }}</dt>
          <dd class="is-negative">
            {{ formatCny(item.atRiskSpend, item.storeId) }}
          </dd>
        </div>
        <div>
          <dt>{{ t("gmvMaxProfit.testSpend") }}</dt>
          <dd>{{ formatCny(item.testSpend, item.storeId) }}</dd>
        </div>
        <div>
          <dt>{{ t("gmvMaxProfit.scaleReady") }}</dt>
          <dd class="is-positive">{{ item.scaleReadyCampaigns }}</dd>
        </div>
        <div>
          <dt>{{ t("gmvMaxCoverage.exchange") }}</dt>
          <dd>
            {{ formatPercent(item.exchangeRateCoveragePercent, true) }}
          </dd>
        </div>
      </dl>
    </article>
    <div
      v-if="!dashboard.storeProfitSummaries.length"
      class="gmv-empty"
    >
      {{ t("gmvMaxProfit.empty") }}
    </div>
  </div>
  <section
    v-for="binding in dashboard.bindings.filter(
      (item, index, values) =>
        values.findIndex((entry) => entry.storeId === item.storeId) ===
        index,
    )"
    :key="binding.storeId"
    class="gmv-panel gmv-cost-panel gmv-store-cost-panel"
  >
    <div class="gmv-panel__heading">
      <div>
        <h2>{{ binding.storeName }}</h2>
        <p>{{ binding.storeId }} / {{ t("gmvMaxCurrency.display") }}</p>
      </div>
      <button
        class="gmv-button gmv-button--secondary"
        @click="saveStoreCost(binding.storeId)"
      >
        <Check class="gmv-icon" />{{ t("gmvMax.actions.save") }}
      </button>
    </div>
    <template v-if="storeCostDrafts[binding.storeId]">
      <div
        class="gmv-account-metadata"
        data-testid="gmv-account-metadata"
      >
        <article>
          <Store class="gmv-account-metadata__icon" />
          <div>
            <span>{{ t("gmvMaxCurrency.sourceCurrency") }}</span
            ><strong>{{
              storeCostDrafts[binding.storeId].currency || "-"
            }}</strong
            ><small>{{ t("gmvMaxCurrency.syncedField") }}</small>
          </div>
        </article>
        <article>
          <Clock3 class="gmv-account-metadata__icon" />
          <div>
            <span>{{ t("gmvMaxCurrency.timezone") }}</span
            ><strong>{{
              storeCostDrafts[binding.storeId].timezone || "-"
            }}</strong
            ><small>{{ t("gmvMaxCurrency.timezoneHint") }}</small>
          </div>
        </article>
        <article
          :class="{
            'is-error':
              storeCostDrafts[binding.storeId].exchangeRateError,
          }"
        >
          <CircleDollarSign class="gmv-account-metadata__icon" />
          <div>
            <span>{{ t("gmvMaxCurrency.cnyRate") }}</span
            ><strong>{{
              formatExchangeRate(
                storeCostDrafts[binding.storeId].cnyExchangeRate,
              )
            }}</strong
            ><small
              v-if="
                storeCostDrafts[binding.storeId].exchangeRateUpdatedAt
              "
              >{{
                storeCostDrafts[binding.storeId].exchangeRateSource ||
                t("gmvMaxCurrency.automaticSource")
              }}
              /
              {{
                formatDate(
                  storeCostDrafts[binding.storeId]
                    .exchangeRateUpdatedAt,
                )
              }}</small
            ><small v-else>{{
              storeCostDrafts[binding.storeId].exchangeRateError
                ? t("gmvMaxCurrency.syncFailed")
                : t("gmvMaxCurrency.syncPending")
            }}</small>
          </div>
        </article>
      </div>
      <div class="gmv-form-grid gmv-form-grid--cost">
        <label v-for="field in moneyCostFields" :key="field"
          ><span
            >{{ t(`gmvMaxAdvanced.cost.${field}`) }} ({{
              t("gmvMaxCurrency.cnyUnit")
            }})</span
          ><input
            :value="
              moneyInputValue(
                storeCostDrafts[binding.storeId][field],
                binding.storeId,
              )
            "
            inputmode="decimal"
            :disabled="storeCnyRate(binding.storeId) === null"
            @input="
              setMoneyField(
                storeCostDrafts[binding.storeId] as unknown as Record<
                  string,
                  unknown
                >,
                field,
                $event,
                binding.storeId,
              )
            " /></label
        ><label v-for="field in rateCostFields" :key="field"
          ><span
            >{{ t(`gmvMaxAdvanced.cost.${field}`) }} ({{
              t("gmvMaxRateInput.percentUnit")
            }})</span
          ><input
            :value="
              percentInputValue(storeCostDrafts[binding.storeId][field])
            "
            type="number"
            inputmode="decimal"
            min="0"
            max="100"
            step="0.1"
            :placeholder="t('gmvMaxRateInput.placeholder')"
            @input="
              setPercentField(
                storeCostDrafts[binding.storeId] as unknown as Record<
                  string,
                  unknown
                >,
                field,
                $event,
              )
            "
          /><small>{{ t("gmvMaxRateInput.example") }}</small></label
        >
      </div>
    </template>
    <div
      v-if="storeCnyRate(binding.storeId) === null"
      class="gmv-alert gmv-alert--warning"
    >
      <CircleDollarSign class="gmv-icon" />{{
        storeCostDrafts[binding.storeId]?.exchangeRateError
          ? t("gmvMaxCurrency.syncFailedHint")
          : t("gmvMaxCurrency.missingHint")
      }}
    </div>
  </section>
  <section
    class="gmv-panel gmv-cost-panel"
    data-testid="gmv-product-cost-page"
  >
    <div class="gmv-panel__heading">
      <div>
        <h2>{{ t("gmvMaxAdvanced.profit.productOverride") }}</h2>
        <p>
          {{ productCostPage.total }}
          {{ t("gmvMaxAdvanced.fields.product") }}
        </p>
      </div>
      <button
        class="gmv-button gmv-button--primary"
        data-testid="gmv-add-product-cost"
        @click="openProduct()"
      >
        <Plus class="gmv-icon" />{{ t("gmvMaxConsole.addProductCost") }}
      </button>
    </div>
    <div class="gmv-cost-summary">
      <article>
        <span>{{ t("gmvMaxCostData.campaignOverrides") }}</span
        ><strong>{{
          productCostPage.summary.campaignOverrides
        }}</strong>
      </article>
      <article>
        <span>{{ t("gmvMaxCostData.storeDefaults") }}</span
        ><strong>{{ productCostPage.summary.storeDefaults }}</strong>
      </article>
      <article>
        <span>{{ t("gmvMaxCostData.completeCount") }}</span
        ><strong class="is-positive">{{
          productCostPage.summary.complete
        }}</strong>
      </article>
      <article>
        <span>{{ t("gmvMaxCostData.incompleteCount") }}</span
        ><strong class="is-negative">{{
          productCostPage.summary.incomplete
        }}</strong>
      </article>
    </div>
    <div class="gmv-filter-panel gmv-filter-panel--cost">
      <select
        v-model="productCostCampaign"
        @change="loadProductCostPage(1)"
      >
        <option value="all">{{ t("gmvMaxData.allCampaigns") }}</option>
        <option
          v-for="campaign in filteredCampaigns"
          :key="campaign.id"
          :value="campaign.id"
        >
          {{ campaign.name }}
        </option>
      </select>
      <select
        v-model="productCostScope"
        @change="loadProductCostPage(1)"
      >
        <option value="all">{{ t("gmvMaxCostData.allScopes") }}</option>
        <option value="campaign">
          {{ t("gmvMaxCostData.campaignOverrides") }}
        </option>
        <option value="store_default">
          {{ t("gmvMaxCostData.storeDefaults") }}
        </option>
      </select>
      <select
        v-model="productCostCompleteness"
        data-testid="gmv-product-cost-completeness"
        @change="loadProductCostPage(1)"
      >
        <option value="all">
          {{ t("gmvMaxCostData.allCompleteness") }}
        </option>
        <option value="incomplete">
          {{ t("gmvMaxCostData.incomplete") }}
        </option>
        <option value="complete">
          {{ t("gmvMaxCostData.complete") }}
        </option>
      </select>
      <input
        v-model="productCostSearch"
        :placeholder="t('gmvMaxCostData.search')"
        @keyup.enter="loadProductCostPage(1)"
      />
      <button
        class="gmv-button gmv-button--primary"
        :disabled="productCostLoading"
        @click="loadProductCostPage(1)"
      >
        <Filter class="gmv-icon" />{{ t("gmvMaxData.applyFilters") }}
      </button>
    </div>
    <div class="gmv-table-wrap">
      <table class="gmv-table">
        <thead>
          <tr>
            <th>
              <button
                class="gmv-sort-button"
                @click="toggleProductCostSort('productName')"
              >
                {{ t("gmvMaxAdvanced.fields.product") }}
                <small>{{
                  sortMark(
                    "productName",
                    productCostSortBy,
                    productCostSortDirection,
                  )
                }}</small>
              </button>
            </th>
            <th>{{ t("gmvMaxAdvanced.fields.store") }}</th>
            <th>{{ t("gmvMaxCostScope.campaign") }}</th>
            <th>{{ t("gmvMaxCatalog.status") }}</th>
            <th>
              <button
                class="gmv-sort-button"
                @click="toggleProductCostSort('completeness')"
              >
                {{ t("gmvMaxCostData.completeness") }}
                <small>{{
                  sortMark(
                    "completeness",
                    productCostSortBy,
                    productCostSortDirection,
                  )
                }}</small>
              </button>
            </th>
            <th>
              <button
                class="gmv-sort-button"
                @click="toggleProductCostSort('sellingPrice')"
              >
                {{ t("gmvMaxAdvanced.fields.price") }}
                <small>{{
                  sortMark(
                    "sellingPrice",
                    productCostSortBy,
                    productCostSortDirection,
                  )
                }}</small>
              </button>
            </th>
            <th>
              <button
                class="gmv-sort-button"
                @click="toggleProductCostSort('purchaseCost')"
              >
                {{ t("gmvMaxAdvanced.cost.purchaseCost") }}
                <small>{{
                  sortMark(
                    "purchaseCost",
                    productCostSortBy,
                    productCostSortDirection,
                  )
                }}</small>
              </button>
            </th>
            <th>
              <button
                class="gmv-sort-button"
                @click="toggleProductCostSort('platformCommissionRate')"
              >
                {{ t("gmvMaxAdvanced.cost.platformCommissionRate") }}
                <small>{{
                  sortMark(
                    "platformCommissionRate",
                    productCostSortBy,
                    productCostSortDirection,
                  )
                }}</small>
              </button>
            </th>
            <th>
              <button
                class="gmv-sort-button"
                @click="toggleProductCostSort('expectedReturnRate')"
              >
                {{ t("gmvMaxAdvanced.cost.expectedReturnRate") }}
                <small>{{
                  sortMark(
                    "expectedReturnRate",
                    productCostSortBy,
                    productCostSortDirection,
                  )
                }}</small>
              </button>
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in productCostPage.items" :key="item.id">
            <td>
              <div
                class="gmv-product-identity gmv-product-identity--cost"
              >
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
                  ><small>{{ item.productId }}</small>
                </div>
              </div>
            </td>
            <td>
              {{
                uniqueStores.find(
                  (store) => store.storeId === item.storeId,
                )?.storeName || item.storeId
              }}
            </td>
            <td>
              <span
                :class="[
                  'gmv-status',
                  item.campaignId ? 'is-blue' : 'is-success',
                ]"
                >{{
                  item.campaignId
                    ? campaignName(item.campaignId)
                    : t("gmvMaxCostScope.storeDefault")
                }}</span
              >
            </td>
            <td>
              <span
                :class="[
                  'gmv-status',
                  statusClass(
                    item.gmvMaxAdsStatus || item.catalogStatus || '',
                  ),
                ]"
                >{{
                  item.gmvMaxAdsStatus || item.catalogStatus || "-"
                }}</span
              ><small :title="item.catalogSyncedAt ? `${t('gmvMaxCatalog.syncedAt')} ${formatDate(item.catalogSyncedAt)}` : t('gmvMaxCatalog.notSynced')">{{
                item.catalogSyncedAt ? formatShortDate(item.catalogSyncedAt) : t("gmvMaxCatalog.notSynced")
              }}</small>
            </td>
            <td>
              <span
                :class="[
                  'gmv-status',
                  productCostComplete(item)
                    ? 'is-success'
                    : 'is-warning',
                ]"
                >{{
                  t(
                    `gmvMaxCostData.${productCostComplete(item) ? "complete" : "incomplete"}`,
                  )
                }}</span
              >
            </td>
            <td>
              <strong :title="t('gmvMaxSku.actualPrice')">{{ actualSellingPriceLabel(item) }}</strong>
            </td>
            <td>
              {{
                item.purchaseCost
                  ? formatCny(item.purchaseCost, item.storeId)
                  : "-"
              }}
            </td>
            <td>
              {{
                item.platformCommissionRate
                  ? formatPercent(item.platformCommissionRate)
                  : "-"
              }}
            </td>
            <td>
              {{
                item.expectedReturnRate
                  ? formatPercent(item.expectedReturnRate)
                  : "-"
              }}
            </td>
            <td>
              <div class="gmv-row__actions">
                <button
                  class="gmv-button gmv-button--secondary"
                  @click="openProduct(item)"
                >
                  <Pencil class="gmv-icon" />{{
                    t("gmvMaxTaskEditCost")
                  }}</button
                ><button
                  class="gmv-icon-button is-danger-text"
                  :title="t('gmvMax.actions.delete')"
                  @click="removeProduct(item)"
                >
                  <Trash2 class="gmv-icon" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="productCostLoading && !productCostPage.items.length" class="gmv-empty gmv-empty--small">
        {{ t("gmvMaxData.loadingPage") }}
      </div>
      <div
        v-else-if="!productCostPage.items.length"
        class="gmv-empty gmv-empty--small"
      >
        {{ t("gmvMaxCostData.empty") }}
      </div>
    </div>
    <div class="gmv-pagination">
      <span>{{
        t("gmvMaxData.pageSummary", {
          current: productCostPage.page,
          total: Math.max(
            1,
            Math.ceil(productCostPage.total / productCostPage.pageSize),
          ),
          count: productCostPage.total,
        })
      }}</span
      ><select
        v-model.number="productCostPage.pageSize"
        @change="loadProductCostPage(1)"
      >
        <option :value="10">10</option>
        <option :value="25">25</option>
        <option :value="50">50</option>
        <option :value="100">100</option></select
      ><button
        class="gmv-button gmv-button--secondary"
        :disabled="productCostPage.page <= 1 || productCostLoading"
        @click="loadProductCostPage(productCostPage.page - 1)"
      >
        {{ t("gmvMaxData.previous") }}</button
      ><button
        class="gmv-button gmv-button--secondary"
        :disabled="
          productCostPage.page >=
            Math.ceil(
              productCostPage.total / productCostPage.pageSize,
            ) || productCostLoading
        "
        @click="loadProductCostPage(productCostPage.page + 1)"
      >
        {{ t("gmvMaxData.next") }}
      </button>
    </div>
  </section>
  <section
    class="gmv-panel gmv-cost-panel gmv-notification-panel"
    data-testid="gmv-notification-panel"
  >
    <div class="gmv-panel__heading">
      <div>
        <h2>{{ t("gmvV2.alerts.settingsTitle") }}</h2>
      </div>
    </div>
    <div class="gmv-notification-form">
      <label class="gmv-notification-toggle">
        <input
          :checked="desktopAlertsEnabled"
          data-testid="gmv-notification-enabled"
          type="checkbox"
          @change="setDesktopAlerts(($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t("gmvV2.alerts.desktop") }}</span>
      </label>
      <small>{{ t("gmvV2.alerts.desktopHint") }}</small>
    </div>
  </section>
</section>
</template>
