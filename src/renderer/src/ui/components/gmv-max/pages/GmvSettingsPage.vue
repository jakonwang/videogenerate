<script lang="ts">
// settings page of the GMV MAX workspace. State and handlers come from TiktokGmvMaxOptimizerView via provide/inject.
import { defineComponent } from "vue";
import { Link2, RefreshCw, CircleDollarSign, Gauge, ShieldCheck, Bell, ShieldAlert } from "lucide-vue-next";
import { useGmvWorkspace } from "./workspaceContext";

export default defineComponent({
  name: "GmvSettingsPage",
  components: { Link2, RefreshCw, CircleDollarSign, Gauge, ShieldCheck, Bell, ShieldAlert },
  setup() {
    return useGmvWorkspace();
  },
});
</script>

<template>
<section
  class="gmv-section gmv-v2-settings"
  data-testid="gmv-settings-workspace"
>
  <div class="gmv-section__heading">
    <div>
      <h2>{{ t("gmvMaxV2.navigation.settings") }}</h2>
      <p>{{ t("gmvMaxV2.settings.subtitle") }}</p>
    </div>
  </div>
  <div class="gmv-v2-settings-grid">
    <article>
      <Link2 /><div><strong>{{ t("gmvMaxV2.settings.connection") }}</strong><span :class="['gmv-status', connected ? 'is-success' : 'is-danger']">{{ connected ? t("gmvMaxV2.settings.configured") : t("gmvMaxV2.settings.notConfigured") }}</span><small>{{ dashboard.connection?.advertiserName || selectedStoreLabel }}</small></div>
      <button class="gmv-button gmv-button--secondary" @click="connected ? refreshWorkspace(false) : connect()">{{ connected ? t("gmvMax.actions.refresh") : t("gmvMax.actions.connect") }}</button>
    </article>
    <article>
      <RefreshCw /><div><strong>{{ t("gmvMaxV2.settings.sync") }}</strong><span>{{ workspaceFreshness }}</span><small>{{ commandCenter.freshness?.stale || 0 }} {{ t("gmvMaxV2.settings.staleItems") }}</small></div>
      <button class="gmv-button gmv-button--secondary" :disabled="!connected || !!busyAction" @click="syncData">{{ t("gmvMaxV2.settings.syncNow") }}</button>
    </article>
    <article>
      <CircleDollarSign /><div><strong>{{ t("gmvMaxV2.settings.cost") }}</strong><span>{{ dashboard.catalog.configuredProducts }} / {{ dashboard.catalog.products }}</span><small>{{ t("gmvMaxV2.settings.costHint") }}</small></div>
      <button class="gmv-button gmv-button--secondary" @click="selectFeatureTab('profit')">{{ t("gmvMaxV2.settings.open") }}</button>
    </article>
    <article>
      <Gauge /><div><strong>{{ t("gmvMaxV2.settings.strategy") }}</strong><span>{{ dashboard.ruleGroups.length }}</span><small>{{ t("gmvMaxV2.settings.strategyHint") }}</small></div>
      <button class="gmv-button gmv-button--secondary" @click="selectFeatureTab('rules')">{{ t("gmvMaxV2.settings.open") }}</button>
    </article>
    <article>
      <ShieldCheck /><div><strong>{{ t("gmvMaxV2.settings.permissions") }}</strong><span>{{ capabilityRows.filter((item) => item.enabled).length }} / {{ capabilityRows.length }}</span><small>{{ t("gmvMaxV2.settings.permissionHint", { enabled: capabilityRows.filter((item) => item.enabled).length, total: capabilityRows.length }) }}</small></div>
      <details><summary>{{ t("gmvMaxV2.settings.open") }}</summary><ul><li v-for="item in capabilityRows" :key="item.name">{{ t(`gmvMaxCapabilities.${item.name}`) }}: {{ item.enabled ? t("gmvMaxConsole.available") : t("gmvMaxConsole.unavailable") }}</li></ul></details>
    </article>
    <article>
      <Bell /><div><strong>{{ t("gmvMaxV2.settings.notifications") }}</strong><span>{{ notificationDraft.enabled ? t("gmvMaxV2.settings.configured") : t("gmvMaxV2.settings.notConfigured") }}</span><small>{{ notificationDraft.target || "-" }}</small></div>
      <button class="gmv-button gmv-button--secondary" @click="saveNotification">{{ t("gmvMax.actions.save") }}</button>
    </article>
    <article class="is-danger">
      <ShieldAlert /><div><strong>{{ t("gmvMaxV2.settings.emergency") }}</strong><span>{{ dashboard.scheduler.emergencyStopped ? t("gmvMaxOperations.stopActive") : t("gmvMaxConsole.available") }}</span><small>{{ dashboard.scheduler.pausedReason || t("gmvMaxV2.settings.emergencyHint") }}</small></div>
      <button :class="['gmv-button', dashboard.scheduler.emergencyStopped ? 'gmv-button--primary' : 'gmv-button--secondary']" :disabled="!connected || !!busyAction" @click="setEmergencyStop(!dashboard.scheduler.emergencyStopped)">{{ dashboard.scheduler.emergencyStopped ? t("gmvMaxOperations.resume") : t("gmvMaxOperations.stop") }}</button>
    </article>
  </div>
</section>
</template>
