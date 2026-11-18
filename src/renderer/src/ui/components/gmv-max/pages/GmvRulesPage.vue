<script lang="ts">
// rules page of the GMV MAX workspace. State and handlers come from TiktokGmvMaxOptimizerView via provide/inject.
import { defineComponent } from "vue";
import { Gavel, CheckCircle2, Clock3, Pencil, ShieldAlert, CircleDollarSign, Gauge, Target, Database, ShieldCheck, BarChart3, Plus, Trash2, Check, ChevronRight, ChevronDown } from "lucide-vue-next";
import { useGmvWorkspace } from "./workspaceContext";

export default defineComponent({
  name: "GmvRulesPage",
  components: { Gavel, CheckCircle2, Clock3, Pencil, ShieldAlert, CircleDollarSign, Gauge, Target, Database, ShieldCheck, BarChart3, Plus, Trash2, Check, ChevronRight, ChevronDown },
  setup() {
    return useGmvWorkspace();
  },
});
</script>

<template>
<section class="gmv-section gmv-dash-page">
  <div class="gmv-dkpis" data-testid="gmv-rule-kpis">
    <article class="gmv-dkpi gmv-dkpi--static">
      <span class="gmv-dkpi__label"><Gavel :class="['gmv-dkpi__icon', 'gvt-info']" />{{ t("gmvV2.rules.groups") }}</span>
      <strong>{{ dashboard.ruleGroups.length }}</strong>
      <small>{{ t("gmvV2.rules.groupsHint") }}</small>
    </article>
    <article class="gmv-dkpi gmv-dkpi--static">
      <span class="gmv-dkpi__label"><CheckCircle2 :class="['gmv-dkpi__icon', 'gvt-good']" />{{ t("gmvV2.rules.auto") }}</span>
      <strong>{{ policyModeCounts.auto }}</strong>
      <small>{{ t("gmvV2.rules.autoHint") }}</small>
    </article>
    <article class="gmv-dkpi gmv-dkpi--static">
      <span class="gmv-dkpi__label"><Clock3 :class="['gmv-dkpi__icon', 'gvt-info']" />{{ t("gmvMaxAdvanced.shadow") }}</span>
      <strong>{{ policyModeCounts.shadow }}</strong>
      <small>{{ t("gmvV2.rules.shadowHint") }}</small>
    </article>
    <article class="gmv-dkpi gmv-dkpi--static">
      <span class="gmv-dkpi__label"><Pencil :class="['gmv-dkpi__icon', 'gvt-neutral']" />{{ t("gmvMaxConsole.manual") }}</span>
      <strong>{{ policyModeCounts.manual }}</strong>
      <small>{{ t("gmvV2.rules.manualHint") }}</small>
    </article>
    <article class="gmv-dkpi gmv-dkpi--static">
      <span class="gmv-dkpi__label"><ShieldAlert :class="['gmv-dkpi__icon', policyModeCounts.unbound ? 'gvt-warning' : 'gvt-good']" />{{ t("gmvV2.rules.unbound") }}</span>
      <strong>{{ policyModeCounts.unbound }}</strong>
      <small>{{ t("gmvV2.rules.unboundHint") }}</small>
    </article>
  </div>

  <ul class="gmv-dguards" data-testid="gmv-protection-goals" :aria-label="t('gmvV2.rules.guards')">
    <li :title="t('gmvMaxV2.strategy.profitHint')"><CircleDollarSign />{{ t("gmvMaxV2.strategy.profit") }}</li>
    <li :title="t('gmvMaxV2.strategy.budgetHint')"><Gauge />{{ t("gmvMaxV2.strategy.budget") }}</li>
    <li :title="t('gmvMaxV2.strategy.roiHint')"><Target />{{ t("gmvMaxV2.strategy.roi") }}</li>
    <li :title="t('gmvMaxV2.strategy.dataHint')"><Database />{{ t("gmvMaxV2.strategy.data") }}</li>
    <li :title="t('gmvMaxV2.strategy.permissionHint')"><ShieldCheck />{{ t("gmvMaxV2.strategy.permission") }}</li>
  </ul>

  <div class="gmv-dtoolbar">
    <div class="gmv-dtoolbar__title">
      <h2>{{ t("gmvV2.rules.groupsTitle") }}</h2>
      <span>{{ t("gmvV2.rules.groupsSubtitle") }}</span>
    </div>
    <div class="gmv-dtoolbar__actions">
      <button class="gmv-button gmv-button--secondary" data-testid="gmv-run-backtest" :disabled="!!busyAction" @click="runBacktest">
        <BarChart3 class="gmv-icon" />{{ t("gmvMaxAdvanced.actions.backtest") }}
      </button>
      <button class="gmv-button gmv-button--primary" data-testid="gmv-new-rule" @click="openRule()">
        <Plus class="gmv-icon" />{{ t("gmvMaxConsole.newRule") }}
      </button>
    </div>
  </div>
  <div class="gmv-dcard">
    <div class="gmv-dscroll">
      <table class="gmv-dtable gmv-dtable--auto">
        <thead>
          <tr>
            <th>{{ t("gmvV2.rules.ruleCol") }}</th>
            <th>{{ t("gmvV2.rules.scopeCol") }}</th>
            <th class="is-num">{{ t("gmvMax.fields.minRoi") }}</th>
            <th class="is-num">{{ t("gmvMaxAdvanced.fields.targetCpa") }}</th>
            <th class="is-num">{{ t("gmvMaxAdvanced.fields.testBudget") }}</th>
            <th class="is-num">{{ t("gmvV2.rules.boundCol") }}</th>
            <th><span class="gmv-visually-hidden">{{ t("gmvMaxConsole.configure") }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="group in dashboard.ruleGroups" :key="group.id" class="gmv-rule-card">
            <td><strong>{{ group.name }}</strong></td>
            <td>
              {{ uniqueStores.find((store) => store.storeId === group.storeId)?.storeName || t("gmvMaxCurrency.legacyScope") }}
              <small>{{ t(`gmvMax.presets.${group.preset}`) }}</small>
            </td>
            <td class="is-num"><strong>{{ formatRoi(group.minRoi) }}</strong></td>
            <td class="is-num">{{ formatCny(group.targetCpa, group.storeId) }}</td>
            <td class="is-num">{{ formatCny(group.creativeTestBudget, group.storeId) }}</td>
            <td class="is-num">{{ formatInteger(dashboard.ruleBindings.filter((item) => item.ruleGroupId === group.id).length) }}</td>
            <td>
              <div class="gmv-row__actions">
                <button class="gmv-icon-button" :title="t('gmvMaxConsole.configure')" :aria-label="t('gmvMaxConsole.configure')" @click="openRule(group)"><Pencil class="gmv-icon" /></button
                ><button class="gmv-icon-button is-danger-text" :title="t('gmvV2.rules.delete')" :aria-label="t('gmvV2.rules.delete')" @click="removeRule(group)"><Trash2 class="gmv-icon" /></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!dashboard.ruleGroups.length" class="gmv-empty">
        {{ t("gmvV2.rules.noGroups") }}
        <button class="gmv-button gmv-button--secondary gmv-empty__action" @click="openRule()"><Plus class="gmv-icon" />{{ t("gmvMaxConsole.newRule") }}</button>
      </div>
    </div>
  </div>

  <div class="gmv-dtoolbar">
    <div class="gmv-dtoolbar__title">
      <h2>{{ t("gmvMaxConsole.campaignAssignments") }}</h2>
      <span>{{ filteredCampaigns.length }} {{ t("gmvMax.metrics.campaigns") }} · {{ t("gmvV2.rules.assignHint") }}</span>
    </div>
  </div>
  <div class="gmv-dcard gmv-policy-list">
    <div class="gmv-dscroll">
      <table class="gmv-dtable gmv-dtable--auto">
        <thead>
          <tr>
            <th>{{ t("gmvMax.fields.campaign") }}</th>
            <th>{{ t("gmvV2.rules.ruleCol") }}</th>
            <th>{{ t("gmvMaxConsole.permissions") }}</th>
            <th>{{ t("gmvV2.rules.modeCol") }}</th>
            <th><span class="gmv-visually-hidden">{{ t("gmvMaxConsole.configure") }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="campaign in filteredCampaigns" :key="campaign.id" class="gmv-policy">
            <td class="gmv-dtable__name">
              <strong>{{ campaign.name }}</strong>
              <small>{{ bindingForCampaign(campaign)?.storeName || bindingForCampaign(campaign)?.advertiserName }}</small>
            </td>
            <td>
              <select
                class="gmv-dselect"
                :aria-label="t('gmvV2.rules.ruleCol')"
                :value="dashboard.ruleBindings.find((item) => item.campaignId === campaign.id)?.ruleGroupId || ''"
                @change="setRuleBinding(campaign.id, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">{{ t("gmvMaxConsole.noRule") }}</option>
                <option
                  v-for="group in dashboard.ruleGroups.filter((item) => !item.storeId || item.storeId === campaign.storeId)"
                  :key="group.id"
                  :value="group.id"
                >
                  {{ group.name }}
                </option>
              </select>
            </td>
            <td>
              <div class="gmv-dperms gmv-permission-strip">
                <span
                  v-for="key in ['budgetPermission', 'roiPermission', 'creativePermission', 'statusPermission', 'sessionPermission'] as const"
                  :key="key"
                  :class="{ 'is-on': policyDrafts[campaign.id][key] }"
                  :title="`${t(`gmvMaxConsole.permission.${key}`)}: ${policyDrafts[campaign.id][key] ? t('gmvV2.rules.allowed') : t('gmvV2.rules.notAllowed')}`"
                >
                  <Check v-if="policyDrafts[campaign.id][key]" /><X v-else />{{ t(`gmvMaxConsole.permission.${key}`) }}
                </span>
              </div>
            </td>
            <td>
              <span :class="['gmv-dot', policyDrafts[campaign.id].shadowMode ? 'gvt-info' : policyDrafts[campaign.id].automationEnabled ? 'gvt-good' : 'gvt-neutral']">{{
                policyDrafts[campaign.id].shadowMode
                  ? t("gmvMaxAdvanced.shadow")
                  : policyDrafts[campaign.id].automationEnabled
                    ? t("gmvMaxConsole.enabled")
                    : t("gmvMaxConsole.manual")
              }}</span>
            </td>
            <td>
              <div class="gmv-row__actions">
                <button class="gmv-button gmv-button--secondary gmv-button--sm" @click="openPolicy(campaign.id)">
                  {{ t("gmvMaxConsole.configure") }}<ChevronRight class="gmv-icon" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!dashboard.campaigns.length" class="gmv-empty">
        {{ t("gmvMax.empty.policies") }}
      </div>
    </div>
  </div>

  <details class="gmv-advanced-details" data-testid="gmv-backtest-results">
    <summary><BarChart3 /><span><strong>{{ t("gmvMaxTaskUi.details.backtest") }}</strong><small>{{ t("gmvMaxTaskUi.details.backtestHint", { count: dashboard.backtests.length }) }}</small></span><ChevronDown /></summary>
  <section
    class="gmv-panel gmv-backtest-panel"
  >
    <div class="gmv-panel__heading">
      <div>
        <h2>{{ t("gmvMaxBacktest.title") }}</h2>
        <p>{{ t("gmvMaxBacktest.subtitle") }}</p>
      </div>
      <span class="gmv-status is-blue"
        >{{ formatInteger(dashboard.backtests.length) }}
        {{ t("gmvMaxBacktest.runs") }}</span
      >
    </div>
    <div class="gmv-table-wrap">
      <table class="gmv-table gmv-table--backtest">
        <thead>
          <tr>
            <th>{{ t("gmvMax.fields.dataRange") }}</th>
            <th>{{ t("gmvMaxBacktest.scope") }}</th>
            <th>{{ t("gmvMaxBacktest.scaleUp") }}</th>
            <th>{{ t("gmvMaxBacktest.scaleDown") }}</th>
            <th>{{ t("gmvMaxBacktest.hold") }}</th>
            <th>{{ t("gmvMaxBacktest.transitions") }}</th>
            <th>{{ t("gmvMaxBacktest.productProof") }}</th>
            <th>{{ t("gmvMaxBacktest.productGateBlocks") }}</th>
            <th>{{ t("gmvMaxIntelligence.projectedProfit") }}</th>
            <th>{{ t("gmvMaxBacktest.coverageBlocks") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in dashboard.backtests.slice(0, 5)"
            :key="item.id"
          >
            <td>
              <strong>{{ item.startDate }} - {{ item.endDate }}</strong
              ><small>{{ formatDate(item.createdAt) }}</small>
            </td>
            <td>
              {{
                item.campaignId
                  ? campaignName(item.campaignId)
                  : t("gmvMaxConsole.allStores")
              }}
            </td>
            <td class="is-positive">
              {{ formatInteger(item.scaleUpCount || 0) }}
            </td>
            <td class="is-negative">
              {{ formatInteger(item.scaleDownCount || 0) }}
            </td>
            <td>{{ formatInteger(item.holdCount || 0) }}</td>
            <td>{{ formatInteger(item.stageTransitions || 0) }}</td>
            <td>
              <strong
                >{{ formatInteger(item.productQualifiedDays || 0) }} /
                {{ formatInteger(item.productTestingDays || 0) }} /
                {{ formatInteger(item.productRiskDays || 0) }}</strong
              ><small
                >{{ formatInteger(item.productCostBlockedDays || 0) }}
                {{ t("gmvMaxBacktest.costBlockedDays") }} /
                {{
                  formatInteger(item.productEvidenceMissingDays || 0)
                }}
                {{ t("gmvMaxBacktest.missingEvidenceDays") }}</small
              >
            </td>
            <td class="is-negative">
              {{ formatInteger(item.productGateBlockCount || 0) }}
            </td>
            <td
              :class="
                metricNumber(item.projectedProfitDelta) >= 0
                  ? 'is-positive'
                  : 'is-negative'
              "
            >
              {{
                backtestStoreId(item)
                  ? formatCny(
                      item.projectedProfitDelta,
                      backtestStoreId(item),
                    )
                  : t("gmvMaxCurrency.pending")
              }}
            </td>
            <td>{{ formatInteger(item.blockedCount) }}</td>
          </tr>
        </tbody>
      </table>
      <div
        v-if="!dashboard.backtests.length"
        class="gmv-empty gmv-empty--small"
      >
        {{ t("gmvMaxBacktest.empty") }}
      </div>
    </div>
  </section>
  </details>
</section>
</template>
