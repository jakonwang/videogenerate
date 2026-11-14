<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  Power,
  Puzzle,
  Search,
  Store,
  Trash2,
  Wrench,
} from "lucide-vue-next";
import {
  webApiClient,
  type PluginDetail,
  type PluginSummary,
} from "@/lib/webApiClient";

type WorkspaceMode = "market" | "installed";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const loading = ref(false);
const actionBusy = ref(false);
const notice = ref("");
const errorText = ref("");
const searchKeyword = ref("");
const workspace = ref<WorkspaceMode>("market");
const plugins = ref<PluginSummary[]>([]);
const selectedPluginId = ref("");

const fallbackPlugins: PluginSummary[] = [
  {
    id: "product-replacement",
    name: "Product Replacement",
    category: "video_processing",
    description: "Replace products in batches of scene images using saved product references and versioned prompts.",
    version: "0.1.0", entryType: "tool", workspacePath: "/plugins/product-replacement", status: "installed", enabled: true,
  },
  {
    id: "product-watermark",
    name: "Product Brand Watermark",
    category: "video_processing",
    description: "Crop product images to squares and apply reusable transparent brand watermarks.",
    version: "0.1.0", entryType: "tool", workspacePath: "/plugins/product-watermark", status: "uninstalled", enabled: false,
  },
  {
    id: "tiktok-gmv-max-optimizer",
    name: "TikTok GMV MAX Optimizer",
    category: "advertising_optimization",
    description:
      "Guarded GMV MAX campaign optimization through TikTok for Business MCP.",
    version: "0.1.0",
    entryType: "tool",
    workspacePath: "/plugins/tiktok-gmv-max-optimizer",
    status: "uninstalled",
    enabled: false,
  },
  {
    id: "product-image-materials",
    name: "Product Image Materials",
    category: "video_processing",
    description:
      "Batch split videos into reusable product image materials with Qiniu upload and usage tracking.",
    version: "0.1.0",
    entryType: "tool",
    workspacePath: "/plugins/product-image-materials",
    status: "uninstalled",
    enabled: false,
  },
  {
    id: "dianxiaomi-inventory",
    name: "Dianxiaomi Inventory Analytics",
    category: "inventory_analysis",
    description:
      "Track SKU baselines, sync shipped quantities, forecast stockout dates, and surface reorder risks.",
    version: "0.1.0",
    entryType: "tool",
    workspacePath: "/plugins/dianxiaomi-inventory",
    status: "uninstalled",
    enabled: false,
  },
  {
    id: "live-photo-generator",
    name: "Live Photo Generator",
    category: "video_processing",
    description:
      "Create Apple-compatible Live Photo outputs from reference images or clone shots with preview and export tools.",
    version: "0.1.0",
    entryType: "tool",
    workspacePath: "/plugins/live-photo-generator",
    status: "uninstalled",
    enabled: false,
  },
  {
    id: "tiktok-creative-studio",
    name: "TikTok Creative Studio",
    category: "video_processing",
    description:
      "Read clone shot assets and prompts, then execute manual Creative Studio batches in an isolated workspace.",
    version: "0.1.0",
    entryType: "tool",
    workspacePath: "/plugins/tiktok-creative-studio",
    status: "uninstalled",
    enabled: false,
  },
  {
    id: "tiktok-creator-outreach",
    name: "TikTok Creator Outreach",
    category: "ecommerce_listing",
    description: "Prepare reviewed TikTok Affiliate creator invitation and message batches.",
    version: "0.1.0",
    entryType: "tool",
    workspacePath: "/plugins/tiktok-creator-outreach",
    status: "uninstalled",
    enabled: false,
  },
  {
    id: "video-parser-download",
    name: "Video Parser Download",
    category: "video_download",
    description:
      "Plugin entry for short-video link parsing and download workflows.",
    version: "0.1.0",
    entryType: "tool",
    workspacePath: "/plugins/video-parser-download",
    status: "uninstalled",
    enabled: false,
  },
  {
    id: "video-batch-watermark",
    name: "Video Batch Watermark",
    category: "video_processing",
    description:
      "Plugin entry for watermark parameters and batch processing presets.",
    version: "0.1.0",
    entryType: "tool",
    workspacePath: "/plugins/video-batch-watermark",
    status: "uninstalled",
    enabled: false,
  },
  {
    id: "video-batch-subtitle",
    name: "Video Batch Subtitle",
    category: "video_processing",
    description:
      "Subtitle recognition, styling, burn-in, and export workflow plugin.",
    version: "0.1.0",
    entryType: "tool",
    workspacePath: "/plugins/video-batch-subtitle",
    status: "uninstalled",
    enabled: false,
  },
  {
    id: "geelark-publisher",
    name: "Geelark Publisher",
    category: "video_processing",
    description:
      "Publish clone outputs to Geelark cloud-phone workflows from a dedicated plugin workspace.",
    version: "0.1.0",
    entryType: "tool",
    workspacePath: "/plugins/geelark-publisher",
    status: "uninstalled",
    enabled: false,
  },
];

function mergePluginCatalogWithFallback(source: PluginSummary[]) {
  const merged = new Map<string, PluginSummary>();
  for (const item of fallbackPlugins) merged.set(item.id, item);
  for (const item of source)
    merged.set(item.id, { ...(merged.get(item.id) || item), ...item });
  return [...merged.values()];
}

const filteredPlugins = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase();
  const source =
    workspace.value === "installed"
      ? plugins.value.filter((item) => item.status === "installed")
      : plugins.value;
  if (!keyword) return source;
  return source.filter((item) =>
    `${item.name} ${item.description}`.toLowerCase().includes(keyword),
  );
});

const selectedPlugin = computed(
  () =>
    plugins.value.find((item) => item.id === selectedPluginId.value) ??
    filteredPlugins.value[0] ??
    null,
);

function pluginName(plugin: PluginSummary | PluginDetail) {
  const key = `plugins.catalog.${plugin.id}.name`;
  return t(key, plugin.name);
}

function pluginDescription(plugin: PluginSummary | PluginDetail) {
  const key = `plugins.catalog.${plugin.id}.description`;
  return t(key, plugin.description);
}

function syncRoute() {
  void router.replace({
    path: "/plugins",
    query: {
      ...(workspace.value === "installed" ? { tab: "installed" } : {}),
      ...(selectedPluginId.value ? { plugin: selectedPluginId.value } : {}),
    },
  });
}

function pluginStatusText(plugin: PluginSummary | PluginDetail) {
  if (plugin.status !== "installed") return t("plugins.status.notInstalled");
  return plugin.enabled
    ? t("plugins.status.enabled")
    : t("plugins.status.disabled");
}

function pluginCategoryText(plugin: PluginSummary | PluginDetail) {
  if (plugin.id === "product-watermark") return t("plugins.categories.videoProcessing");
  if (plugin.id === "product-replacement") return t("plugins.categories.videoProcessing");
  if (plugin.id === "tiktok-gmv-max-optimizer")
    return t("plugins.categories.advertisingOptimization");
  if (plugin.id === "dianxiaomi-inventory")
    return t("plugins.categories.inventoryAnalysis");
  if (plugin.id === "live-photo-generator")
    return t("plugins.categories.livePhoto");
  if (plugin.id === "product-image-materials")
    return t("plugins.categories.videoProcessing");
  if (plugin.id === "tiktok-creative-studio")
    return t("plugins.categories.creativeStudio");
  if (plugin.id === "geelark-publisher")
    return t("plugins.categories.publishing");
  if (plugin.category === "video_download")
    return t("plugins.categories.download");
  return t("plugins.categories.videoProcessing");
}

function pluginIconText(plugin: PluginSummary | PluginDetail) {
  if (plugin.id === "product-watermark") return "BW";
  if (plugin.id === "product-replacement") return "PR";
  if (plugin.id === "tiktok-gmv-max-optimizer") return "GM";
  if (plugin.id === "dianxiaomi-inventory") return "IA";
  if (plugin.id === "product-image-materials") return "IM";
  if (plugin.id === "live-photo-generator") return "LP";
  if (plugin.id === "tiktok-creative-studio") return "TT";
  if (plugin.id === "geelark-publisher") return "GK";
  if (plugin.id === "video-parser-download") return "DL";
  if (plugin.id === "video-batch-watermark") return "WM";
  if (plugin.id === "video-batch-subtitle") return "CC";
  return "VG";
}

function pluginCardTone(plugin: PluginSummary | PluginDetail) {
  if (plugin.id === "product-watermark") return "tone-blue";
  if (plugin.id === "product-replacement") return "tone-green";
  if (plugin.id === "tiktok-gmv-max-optimizer") return "tone-cyan";
  if (plugin.id === "dianxiaomi-inventory") return "tone-green";
  if (plugin.id === "product-image-materials") return "tone-blue";
  if (plugin.id === "live-photo-generator") return "tone-amber";
  if (plugin.id === "tiktok-creative-studio") return "tone-green";
  if (plugin.id === "geelark-publisher") return "tone-cyan";
  if (plugin.id === "video-parser-download") return "tone-violet";
  if (plugin.id === "video-batch-watermark") return "tone-blue";
  return "tone-green";
}

function isDirectWorkspacePlugin(plugin: PluginSummary | PluginDetail) {
  return [
    "geelark-publisher",
    "tiktok-creative-studio",
    "tiktok-gmv-max-optimizer",
    "live-photo-generator",
    "product-image-materials",
    "video-parser-download",
    "dianxiaomi-inventory",
    "product-watermark",
    "product-replacement",
  ].includes(plugin.id);
}

function primaryActionText(plugin: PluginSummary) {
  if (plugin.id === "product-watermark" || plugin.id === "product-replacement") return t("plugins.actions.openWorkspace");
  if (plugin.status !== "installed") return t("plugins.actions.install");
  if (!plugin.enabled) return t("plugins.actions.enable");
  return isDirectWorkspacePlugin(plugin)
    ? t("plugins.actions.openWorkspace")
    : t("plugins.actions.use");
}

async function loadPlugins() {
  loading.value = true;
  errorText.value = "";
  try {
    plugins.value = mergePluginCatalogWithFallback(
      await webApiClient.listPlugins(),
    );
  } catch (error: any) {
    errorText.value = error?.message ?? String(error);
    plugins.value = fallbackPlugins;
  } finally {
    loading.value = false;
    if (!selectedPlugin.value && filteredPlugins.value.length)
      selectedPluginId.value = filteredPlugins.value[0].id;
  }
}

async function runPluginAction(
  action: () => Promise<{ plugin: PluginDetail }>,
  successMessage: string,
) {
  actionBusy.value = true;
  errorText.value = "";
  notice.value = "";
  try {
    const result = await action();
    notice.value = successMessage;
    selectedPluginId.value = result.plugin.id;
    await loadPlugins();
  } catch (error: any) {
    errorText.value = error?.message ?? String(error);
  } finally {
    actionBusy.value = false;
  }
}

async function installPlugin(pluginId: string) {
  await runPluginAction(
    () => webApiClient.installPlugin(pluginId),
    t("plugins.messages.installed"),
  );
}

async function enablePlugin(pluginId: string) {
  await runPluginAction(
    () => webApiClient.enablePlugin(pluginId),
    t("plugins.messages.enabled"),
  );
}

async function disablePlugin(pluginId: string) {
  await runPluginAction(
    () => webApiClient.disablePlugin(pluginId),
    t("plugins.messages.disabled"),
  );
}

async function uninstallPlugin(pluginId: string) {
  await runPluginAction(
    () => webApiClient.uninstallPlugin(pluginId),
    t("plugins.messages.uninstalled"),
  );
}

function openMarket() {
  workspace.value = "market";
}

function openInstalled() {
  workspace.value = "installed";
}

function selectPlugin(pluginId: string) {
  selectedPluginId.value = pluginId;
}

function usePlugin(plugin: PluginSummary | PluginDetail) {
  if (plugin.id === "product-watermark") {
    void router.push("/plugins/product-watermark");
    return;
  }
  if (plugin.id === "product-replacement") {
    void router.push("/plugins/product-replacement");
    return;
  }
  if (plugin.status !== "installed") {
    errorText.value = t("plugins.errors.installFirst");
    return;
  }
  if (!plugin.enabled) {
    errorText.value = t("plugins.errors.enableFirst");
    return;
  }
  if (plugin.id === "product-image-materials") {
    void router.push("/plugins/product-image-materials");
    return;
  }
  if (plugin.id === "live-photo-generator") {
    void router.push("/plugins/live-photo-generator");
    return;
  }
  if (plugin.id === "tiktok-creative-studio") {
    void router.push("/plugins/tiktok-creative-studio");
    return;
  }
  if (plugin.id === "tiktok-creator-outreach") {
    void router.push("/plugins/tiktok-creator-outreach");
    return;
  }
  if (plugin.id === "geelark-publisher") {
    void router.push("/plugins/geelark-publisher/publish-center");
    return;
  }
  if (plugin.id === "video-parser-download") {
    void router.push("/plugins/video-parser-download");
    return;
  }
  if (plugin.id === "dianxiaomi-inventory") {
    void router.push("/plugins/dianxiaomi-inventory");
    return;
  }
  void router.push(plugin.workspacePath);
}

function onPrimaryAction(plugin: PluginSummary) {
  if (plugin.id === "product-watermark" || plugin.id === "product-replacement") {
    void router.push(plugin.workspacePath);
    return;
  }
  if (plugin.status !== "installed") {
    void installPlugin(plugin.id);
    return;
  }
  if (!plugin.enabled) {
    void enablePlugin(plugin.id);
    return;
  }
  usePlugin(plugin);
}

watch(
  () => route.query,
  () => {
    workspace.value =
      String(route.query.tab || "").trim() === "installed"
        ? "installed"
        : "market";
    const pluginId = String(route.query.plugin || "").trim();
    if (pluginId) selectedPluginId.value = pluginId;
  },
  { immediate: true },
);

watch([workspace, selectedPluginId], () => {
  syncRoute();
});

watch(filteredPlugins, (list) => {
  if (!list.length) return;
  if (!list.some((item) => item.id === selectedPluginId.value))
    selectedPluginId.value = list[0].id;
});

onMounted(async () => {
  await loadPlugins();
  const pluginId = String(route.query.plugin || "").trim();
  if (pluginId) selectedPluginId.value = pluginId;
  else if (filteredPlugins.value.length)
    selectedPluginId.value = filteredPlugins.value[0].id;
});
</script>

<template>
  <div class="vg-scope vg-page plugins">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><Puzzle :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ workspace === "installed" ? t("plugins.hero.installedTitle") : t("plugins.hero.marketTitle") }}</h1>
        <p>{{ workspace === "installed" ? t("plugins.hero.installedDesc") : t("plugins.hero.marketDesc") }}</p>
      </div>
      <div class="vg-page-head__actions">
        <span class="vg-pill vg-pill--accent">{{ t("plugins.hero.eyebrow") }}</span>
      </div>
    </header>

    <div class="vg-toolbar">
      <div class="vg-seg">
        <button class="vg-seg__btn" :class="{ 'is-active': workspace === 'market' }" type="button" @click="openMarket">
          <Store :size="15" /> {{ t("plugins.tabs.market") }}
        </button>
        <button class="vg-seg__btn" :class="{ 'is-active': workspace === 'installed' }" type="button" @click="openInstalled">
          <Download :size="15" /> {{ t("plugins.tabs.installed") }}
        </button>
      </div>
      <span class="vg-toolbar__spacer"></span>
      <label class="vg-search plugins__search">
        <Search :size="15" />
        <input v-model="searchKeyword" class="vg-input" type="text" :placeholder="t('plugins.searchPlaceholder')" />
      </label>
    </div>

    <div v-if="notice" class="vg-notice vg-notice--accent"><Check :size="16" /><span>{{ notice }}</span></div>
    <div v-if="errorText" class="vg-notice vg-notice--danger"><AlertTriangle :size="16" /><span>{{ errorText }}</span></div>

    <section v-if="workspace === 'installed' && !filteredPlugins.length && !loading" class="vg-card">
      <div class="vg-empty">
        <span class="vg-empty__icon"><Puzzle :size="24" /></span>
        <h3>{{ t("plugins.empty.title") }}</h3>
        <p>{{ t("plugins.empty.desc") }}</p>
        <button class="vg-btn vg-btn--primary" type="button" @click="openMarket">{{ t("plugins.empty.backToMarket") }}</button>
      </div>
    </section>

    <div v-else class="plugins__body" :class="{ 'has-detail': selectedPlugin }">
      <section class="vg-grid plugins__grid" :class="{ 'is-loading': loading }">
        <article
          v-for="plugin in filteredPlugins"
          :key="plugin.id"
          class="vg-card vg-card--interactive plugin"
          :class="[pluginCardTone(plugin), { 'is-active': selectedPluginId === plugin.id }]"
          @click="selectPlugin(plugin.id)"
        >
          <div class="plugin__top">
            <span class="plugin__icon">{{ pluginIconText(plugin) }}</span>
            <span class="vg-pill vg-pill--dot" :class="plugin.status === 'installed' ? (plugin.enabled ? 'vg-pill--green' : 'vg-pill--amber') : ''">
              {{ pluginStatusText(plugin) }}
            </span>
          </div>
          <div class="plugin__body">
            <h3>{{ pluginName(plugin) }}</h3>
            <p>{{ pluginDescription(plugin) }}</p>
          </div>
          <div class="plugin__foot">
            <span class="vg-chip">{{ pluginCategoryText(plugin) }}</span>
            <button
              class="vg-btn vg-btn--sm"
              :class="plugin.status === 'installed' && plugin.enabled ? 'vg-btn--soft' : 'vg-btn--primary'"
              type="button"
              :disabled="actionBusy"
              @click.stop="onPrimaryAction(plugin)"
            >
              {{ primaryActionText(plugin) }}
              <ArrowRight v-if="plugin.status === 'installed' && plugin.enabled" :size="14" />
            </button>
          </div>
        </article>
      </section>

      <aside v-if="selectedPlugin" class="vg-card plugin-detail" :class="pluginCardTone(selectedPlugin)">
        <div class="plugin-detail__hero">
          <span class="plugin__icon plugin__icon--lg">{{ pluginIconText(selectedPlugin) }}</span>
          <div class="plugin-detail__copy">
            <span class="vg-muted plugin-detail__eyebrow">{{ t("plugins.detail.eyebrow") }}</span>
            <h2>{{ pluginName(selectedPlugin) }}</h2>
          </div>
        </div>
        <p class="vg-secondary plugin-detail__desc">{{ pluginDescription(selectedPlugin) }}</p>

        <dl class="vg-kv">
          <dt>{{ t("plugins.detail.status") }}</dt>
          <dd><span class="vg-pill vg-pill--dot" :class="selectedPlugin.status === 'installed' ? (selectedPlugin.enabled ? 'vg-pill--green' : 'vg-pill--amber') : ''">{{ pluginStatusText(selectedPlugin) }}</span></dd>
          <dt>{{ t("plugins.detail.category") }}</dt>
          <dd>{{ pluginCategoryText(selectedPlugin) }}</dd>
          <dt>{{ t("plugins.detail.path") }}</dt>
          <dd class="vg-muted plugin-detail__path">{{ selectedPlugin.workspacePath }}</dd>
        </dl>

        <div class="plugin-detail__actions">
          <button
            v-if="selectedPlugin.id === 'product-replacement'"
            class="vg-btn vg-btn--primary vg-btn--block"
            type="button"
            :disabled="actionBusy"
            @click="router.push('/plugins/product-replacement')"
          >
            <Wrench :size="15" /> {{ t("plugins.actions.openWorkspace") }}
          </button>
          <button
            v-else-if="selectedPlugin.status !== 'installed'"
            class="vg-btn vg-btn--primary vg-btn--block"
            type="button"
            :disabled="actionBusy"
            @click="installPlugin(selectedPlugin.id)"
          >
            <Download :size="15" /> {{ t("plugins.actions.installPlugin") }}
          </button>
          <button
            v-else-if="!selectedPlugin.enabled"
            class="vg-btn vg-btn--primary vg-btn--block"
            type="button"
            :disabled="actionBusy"
            @click="enablePlugin(selectedPlugin.id)"
          >
            <Power :size="15" /> {{ t("plugins.actions.enablePlugin") }}
          </button>
          <button
            v-else
            class="vg-btn vg-btn--primary vg-btn--block"
            type="button"
            :disabled="actionBusy"
            @click="usePlugin(selectedPlugin)"
          >
            <Wrench :size="15" /> {{ t("plugins.actions.openWorkspace") }}
          </button>

          <div class="vg-row">
            <button
              v-if="selectedPlugin.status === 'installed' && selectedPlugin.enabled"
              class="vg-btn"
              type="button"
              :disabled="actionBusy"
              @click="disablePlugin(selectedPlugin.id)"
            >
              {{ t("plugins.actions.disable") }}
            </button>
            <button
              v-if="selectedPlugin.status === 'installed' && !selectedPlugin.enabled"
              class="vg-btn"
              type="button"
              :disabled="actionBusy"
              @click="enablePlugin(selectedPlugin.id)"
            >
              {{ t("plugins.actions.enable") }}
            </button>
            <button
              v-if="selectedPlugin.status === 'installed'"
              class="vg-btn vg-btn--danger"
              type="button"
              :disabled="actionBusy"
              @click="uninstallPlugin(selectedPlugin.id)"
            >
              <Trash2 :size="15" /> {{ t("plugins.actions.uninstall") }}
            </button>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.plugins { width: min(1408px, 100%); margin: 0 auto; }
.plugins__search { width: min(320px, 100%); }

.plugins__body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
.plugins__body.has-detail { grid-template-columns: minmax(0, 1fr) 320px; }
.plugins__grid { --vg-grid-min: 260px; transition: opacity .15s; }
.plugins__grid.is-loading { opacity: .55; pointer-events: none; }

/* Tone per plugin, mapped to theme tone tokens */
.plugin, .plugin-detail { --tone: var(--vg-accent); }
.tone-blue { --tone: var(--vg-blue); }
.tone-green { --tone: var(--vg-green); }
.tone-cyan { --tone: var(--vg-accent); }
.tone-amber { --tone: var(--vg-amber); }
.tone-violet { --tone: var(--vg-violet); }

.plugin { display: flex; flex-direction: column; gap: 12px; min-height: 196px; }
.plugin__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.plugin__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--tone) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--tone) 32%, transparent);
  color: var(--tone);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: .02em;
}
.plugin__icon--lg { width: 52px; height: 52px; border-radius: 14px; font-size: 15px; }
.plugin__body { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.plugin__body h3 { font-size: 15px; font-weight: 700; color: var(--theme-text); }
.plugin__body p {
  font-size: 12px;
  line-height: 1.55;
  color: var(--theme-text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.plugin__foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 12px; border-top: 1px solid var(--theme-divider); }

.plugin-detail { position: sticky; top: 0; display: flex; flex-direction: column; gap: 14px; }
.plugin-detail__hero { display: flex; align-items: center; gap: 12px; }
.plugin-detail__copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.plugin-detail__eyebrow { font-size: 11px; }
.plugin-detail__copy h2 { font-size: 17px; font-weight: 800; }
.plugin-detail__desc { font-size: 13px; line-height: 1.6; }
.plugin-detail__path { font-size: 12px; }
.plugin-detail__actions { display: flex; flex-direction: column; gap: 8px; }

@media (max-width: 1100px) {
  .plugins__body.has-detail { grid-template-columns: minmax(0, 1fr); }
  .plugin-detail { position: static; }
}
</style>
