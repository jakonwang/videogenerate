<script lang="ts">
// audit page of the GMV MAX workspace. State and handlers come from TiktokGmvMaxOptimizerView via provide/inject.
import { defineComponent } from "vue";
import { Filter, ChevronDown, ShieldCheck } from "lucide-vue-next";
import { useGmvWorkspace } from "./workspaceContext";

export default defineComponent({
  name: "GmvAuditPage",
  components: { Filter, ChevronDown, ShieldCheck },
  setup() {
    return useGmvWorkspace();
  },
});
</script>

<template>
<section class="gmv-section" data-testid="gmv-audit-workspace">
  <div class="gmv-section__heading">
    <div>
      <h2>{{ t("gmvMax.audit.title") }}</h2>
      <p>{{ t("gmvMax.audit.subtitle") }}</p>
    </div>
    <button
      class="gmv-sort-button gmv-sort-button--standalone"
      @click="toggleAuditSort"
    >
      <component
        :is="auditSortDirection === 'asc' ? ArrowUp : ArrowDown"
      />{{ t("gmvMaxActionData.sortTime")
      }}<small>{{
        auditSortDirection === "asc"
          ? t("gmvMaxActionData.ascending")
          : t("gmvMaxActionData.descending")
      }}</small>
    </button>
  </div>
  <div class="gmv-v2-view-tabs" role="tablist">
    <button v-for="view in auditViews" :key="view" :class="{ 'is-active': auditView === view }" @click="auditView = view">{{ t(`gmvMaxV2.audit.${view}`) }}</button>
  </div>
  <section v-if="auditView === 'results'" class="gmv-panel gmv-v2-audit-results" data-testid="gmv-audit-results">
    <div class="gmv-v2-result-summary"><span>{{ t("gmvMaxV2.action.status.observing") }} <strong>{{ commandCenter.resultSummary.observing }}</strong></span><span>{{ t("gmvMaxV2.audit.improved") }} <strong>{{ commandCenter.resultSummary.improved }}</strong></span><span>{{ t("gmvMaxV2.audit.stable") }} <strong>{{ commandCenter.resultSummary.stable }}</strong></span><span>{{ t("gmvMaxV2.audit.invalid") }} <strong>{{ commandCenter.resultSummary.declined }}</strong></span></div>
    <div v-if="dashboard.actionOutcomes.length" class="gmv-table-wrap"><table class="gmv-table"><thead><tr><th>{{ t("gmvMax.fields.time") }}</th><th>{{ t("gmvMax.fields.campaign") }}</th><th>{{ t("gmvMaxV2.audit.before") }} ROI</th><th>{{ t("gmvMaxV2.audit.after") }} ROI</th><th>{{ t("gmvMaxOperations.netProfit") }}</th><th>{{ t("gmvMax.fields.status") }}</th></tr></thead><tbody><tr v-for="item in dashboard.actionOutcomes" :key="item.id"><td>{{ formatDate(item.measuredAt) }}</td><td>{{ campaignName(item.campaignId) }}</td><td>{{ formatRoi(item.preRoi) }}</td><td>{{ formatRoi(item.postRoi) }}</td><td>{{ formatCny(item.postEstimatedProfit, campaignStoreId(item.campaignId)) }}</td><td><span :class="['gmv-status', item.successful ? 'is-success' : 'is-danger']">{{ item.successful ? t("gmvMaxV2.audit.improved") : t("gmvMaxV2.audit.invalid") }}</span></td></tr></tbody></table></div>
    <div v-else class="gmv-empty">{{ t("gmvMaxV2.audit.noResults") }}</div>
  </section>
  <section v-else-if="auditView === 'exceptions'" class="gmv-panel" data-testid="gmv-audit-exceptions">
    <div class="gmv-table-wrap"><table class="gmv-table"><thead><tr><th>{{ t("gmvMax.fields.time") }}</th><th>{{ t("gmvMax.fields.action") }}</th><th>{{ t("gmvMax.fields.campaign") }}</th><th>{{ t("gmvMax.fields.status") }}</th><th>{{ t("gmvMax.fields.requestId") }}</th></tr></thead><tbody><tr v-for="item in filteredAudits.filter((entry) => entry.status === 'failed')" :key="item.id"><td>{{ formatDate(item.createdAt) }}</td><td>{{ structuredValueLabel(item.action) }}</td><td>{{ campaignName(item.campaignId) }}</td><td><span class="gmv-status is-danger">{{ structuredValueLabel(item.status) }}</span><small>{{ structuredValueLabel(item.error || '') }}</small></td><td>{{ item.remoteRequestId || "-" }}</td></tr></tbody></table><div v-if="!filteredAudits.some((item) => item.status === 'failed')" class="gmv-empty">{{ t("gmvMaxV2.audit.noExceptions") }}</div></div>
  </section>
  <details v-if="auditView === 'execution'" class="gmv-advanced-details">
    <summary><Filter /><span><strong>{{ t("gmvMaxTaskUi.details.auditFilters") }}</strong><small>{{ t("gmvMaxTaskUi.details.auditFiltersHint") }}</small></span><ChevronDown /></summary>
  <div class="gmv-filter-panel gmv-filter-panel--audit">
    <select v-model="auditCampaign" @change="loadAuditPage(1)">
      <option value="all">{{ t("gmvMaxData.allCampaigns") }}</option>
      <option
        v-for="campaign in filteredCampaigns"
        :key="campaign.id"
        :value="campaign.id"
      >
        {{ campaign.name }}
      </option></select
    ><select v-model="auditStatus" @change="loadAuditPage(1)">
      <option value="all">{{ t("gmvMaxConsole.status.all") }}</option>
      <option value="succeeded">
        {{ t("gmvMax.status.succeeded") }}
      </option>
      <option value="failed">{{ t("gmvMax.status.failed") }}</option>
      <option value="started">
        {{ t("gmvMax.status.started") }}
      </option></select
    ><input
      v-model="auditAction"
      :placeholder="t('gmvMaxActionData.actionSearch')"
      @change="loadAuditPage(1)"
    /><button
      class="gmv-button gmv-button--primary"
      :disabled="auditLoading"
      @click="loadAuditPage(1)"
    >
      <Filter class="gmv-icon" />{{ t("gmvMaxData.applyFilters") }}
    </button>
  </div>
  </details>
  <details v-if="auditView === 'execution'" class="gmv-advanced-details">
    <summary><ShieldCheck /><span><strong>{{ t("gmvMaxTaskUi.details.capabilities") }}</strong><small>{{ t("gmvMaxTaskUi.details.capabilitiesHint", { enabled: capabilityRows.filter((item) => item.enabled).length, total: capabilityRows.length }) }}</small></span><ChevronDown /></summary>
  <div class="gmv-capabilities">
    <article
      v-for="item in capabilityRows"
      :key="item.name"
      :class="{
        'is-enabled': item.enabled,
        'is-disabled': !item.enabled,
      }"
    >
      <span class="gmv-capability-icon"
        ><component :is="item.enabled ? CheckCircle2 : ShieldAlert"
      /></span>
      <div>
        <strong>{{ t(`gmvMaxCapabilities.${item.name}`) }}</strong
        ><small>{{
          item.enabled
            ? t("gmvMaxConsole.available")
            : t("gmvMaxConsole.unavailable")
        }}</small>
      </div>
      <i></i>
    </article>
  </div>
  </details>
  <div v-if="auditView === 'execution'" class="gmv-table-wrap">
    <table class="gmv-table">
      <thead>
        <tr>
          <th>{{ t("gmvMax.fields.time") }}</th>
          <th>{{ t("gmvMax.fields.action") }}</th>
          <th>{{ t("gmvMax.fields.campaign") }}</th>
          <th>{{ t("gmvMax.fields.status") }}</th>
          <th>{{ t("gmvMax.fields.requestId") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in filteredAudits" :key="item.id">
          <td>{{ formatDate(item.createdAt) }}</td>
          <td>{{ structuredValueLabel(item.action) }}</td>
          <td>{{ campaignName(item.campaignId) }}</td>
          <td>
            <span :class="['gmv-status', statusClass(item.status)]">{{
              structuredValueLabel(item.status)
            }}</span
            ><small v-if="item.error">{{
              structuredValueLabel(item.error)
            }}</small>
          </td>
          <td>{{ item.remoteRequestId || "-" }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="auditLoading && !auditPage.items.length" class="gmv-empty">
      {{ t("gmvMaxData.loadingPage") }}
    </div>
    <div v-else-if="!filteredAudits.length" class="gmv-empty">
      {{ t("gmvMax.empty.audit") }}
    </div>
  </div>
  <div v-if="auditView === 'execution'" class="gmv-pagination">
    <span>{{
      t("gmvMaxData.pageSummary", {
        current: auditPage.page,
        total: Math.max(
          1,
          Math.ceil(auditPage.total / auditPage.pageSize),
        ),
        count: auditPage.total,
      })
    }}</span
    ><select
      v-model.number="auditPage.pageSize"
      @change="loadAuditPage(1)"
    >
      <option :value="10">10</option>
      <option :value="25">25</option>
      <option :value="50">50</option>
      <option :value="100">100</option></select
    ><button
      class="gmv-button gmv-button--secondary"
      :disabled="auditPage.page <= 1 || auditLoading"
      @click="loadAuditPage(auditPage.page - 1)"
    >
      {{ t("gmvMaxData.previous") }}</button
    ><button
      class="gmv-button gmv-button--secondary"
      :disabled="
        auditPage.page >=
          Math.ceil(auditPage.total / auditPage.pageSize) ||
        auditLoading
      "
      @click="loadAuditPage(auditPage.page + 1)"
    >
      {{ t("gmvMaxData.next") }}
    </button>
  </div>
</section>
</template>
