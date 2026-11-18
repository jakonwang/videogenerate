<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  House,
  SearchCheck,
  Sparkles,
  CopyPlus,
  FolderOpen,
  Send,
  Puzzle,
  Store,
  Images,
  Settings,
  Inbox,
  Wand2,
  PlaySquare,
  Scissors,
  BarChart3,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  ArrowLeft,
  Check,
} from "lucide-vue-next";
import { storeToRefs } from "pinia";
import TitleBar from "./components/TitleBar.vue";
import UiLocaleSelect from "./components/UiLocaleSelect.vue";
import DsMainLayout from "../design-system/layout/MainLayout.vue";
import AssetLibraryPickerHost from "./components/AssetLibraryPickerHost.vue";
import AiProducerPanel from "./components/ai/AiProducerPanel.vue";
import AiCommandBar from "./components/ai/AiCommandBar.vue";
import AiNotices from "./components/ai/AiNotices.vue";
import { useAiProducerStore } from "@/stores/aiProducer";
import { useCloneTopbarStore } from "@/stores/cloneTopbar";
import { useDesignInspectorStore } from "@/stores/designInspector";
import { useWebSessionStore } from "@/stores/webSession";
import { featureForPath, useCloudAuthStore } from "@/stores/cloudAuth";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const APP_SIDEBAR_STORAGE_KEY = "videogenerate:app-sidebar-collapsed:v1";
const appSidebarCollapsed = ref(false);
const cloneTopbar = useCloneTopbarStore();
const designInspector = useDesignInspectorStore();
const webSession = useWebSessionStore();
const aiProducer = useAiProducerStore();
const { visible: cloneTopbarVisible, items: cloneTopbarItems } =
  storeToRefs(cloneTopbar);
const { enabled: designInspectorEnabled } = storeToRefs(designInspector);
const showDesignInspectorToggle = computed(() => import.meta.env.DEV);
const showCloneWorkflowTopbar = computed(
  () =>
    route.path.includes("/clone/") &&
    cloneTopbarVisible.value &&
    cloneTopbarItems.value.length > 0,
);
const cloudAuth = useCloudAuthStore();
void cloudAuth.ensureLoaded();
const topUserName = computed(() => cloudAuth.status?.displayName || cloudAuth.status?.account || "TiktokCut");
const topUserPlan = computed(() => {
  const status = cloudAuth.status;
  if (!status?.loggedIn) return status?.mode === "enforced" ? t("cloud.reason.not_logged_in") : t("shell.localMode");
  if (status.unlimited) return t("cloud.membership.unlimited");
  return status.planName || t("cloud.membership.none");
});

const isToolRoute = computed(() =>
  route.path === '/plugins' ||
  route.path === '/live-slicer' ||
  (route.path.startsWith('/plugins/') && !route.path.startsWith('/plugins/tiktok-creative-studio') && !route.path.startsWith('/plugins/live-photo-generator')),
)

const allNavItems = computed(() => [
  {
    to: "/home",
    icon: House,
    label: t("ai.nav.workbench"),
    active: route.path.startsWith("/home"),
  },
  {
    to: "/inbox",
    icon: Inbox,
    label: t("ai.nav.inbox"),
    active: route.path.startsWith("/inbox"),
    badge: aiProducer.pendingReviews,
  },
]);

const allSections = computed(() => [
  {
    title: t("ai.nav.groupCreate"),
    items: [
      { to: "/product-research", icon: SearchCheck, label: t("nav.productResearch"), active: route.path.startsWith("/product-research") },
      { to: "/clone", icon: CopyPlus, label: t("nav.clone"), active: route.path.startsWith("/clone") },
      { to: "/plugins/tiktok-creative-studio", icon: Wand2, label: t("ai.nav.creativeStudio"), active: route.path.startsWith("/plugins/tiktok-creative-studio") },
      { to: "/plugins/live-photo-generator", icon: PlaySquare, label: t("ai.nav.livePhoto"), active: route.path.startsWith("/plugins/live-photo-generator") },
      { to: "/production", icon: Scissors, label: t("ai.nav.production"), active: route.path.startsWith("/production") },
      { to: "/publish", icon: Send, label: t("ai.nav.publish"), active: route.path.startsWith("/publish") },
      { to: "/insights", icon: BarChart3, label: t("ai.nav.insights"), active: route.path.startsWith("/insights") },
    ],
  },
  {
    title: t("ai.nav.groupAssets"),
    items: [
      { to: "/products", icon: FolderOpen, label: t("ai.nav.products"), active: route.path.startsWith("/products") },
      { to: "/models", icon: Sparkles, label: t("ai.nav.models"), active: route.path.startsWith("/models") },
      { to: "/asset-library", icon: Images, label: t("ai.nav.assets"), active: route.path.startsWith("/asset-library") },
      { to: "/templates", icon: LayoutTemplate, label: t("ai.nav.templates"), active: route.path.startsWith("/templates") },
    ],
  },
  {
    title: t("ai.nav.tools"),
    items: [
      { to: "/plugins", icon: Store, label: t("ai.tools.title"), active: isToolRoute.value },
    ],
  },
]);

/** 后台关闭的模块不出现在导航里 */
const navItems = computed(() => allNavItems.value.filter((item) => cloudAuth.hasFeature(featureForPath(item.to))));
const sidebarSections = computed(() =>
  allSections.value
    .map((section) => ({ ...section, items: section.items.filter((item) => cloudAuth.hasFeature(featureForPath(item.to.split("?")[0]))) }))
    .filter((section) => section.items.length),
);

function onGlobalKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
  const key = event.key.toLowerCase()
  if (key === "k") {
    event.preventDefault()
    aiProducer.commandOpen = !aiProducer.commandOpen
  } else if (key === "j") {
    event.preventDefault()
    if (aiProducer.panelOpen) aiProducer.close()
    else void aiProducer.open()
  }
}

function go(path: string, query?: Record<string, string>) {
  void router.push({ path, query });
}

function requestCloneStage(key: string) {
  cloneTopbar.requestStage(key);
}

function toggleAppSidebar() {
  appSidebarCollapsed.value = !appSidebarCollapsed.value;
  localStorage.setItem(
    APP_SIDEBAR_STORAGE_KEY,
    String(appSidebarCollapsed.value),
  );
}

onMounted(() => {
  appSidebarCollapsed.value =
    localStorage.getItem(APP_SIDEBAR_STORAGE_KEY) === "true";
  window.addEventListener("keydown", onGlobalKeydown);
  void aiProducer.init();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
});
</script>

<template>
  <div class="ui-app app-shell" :class="{ 'is-sidebar-collapsed': appSidebarCollapsed }">
    <AssetLibraryPickerHost />
    <TitleBar />
    <AiProducerPanel />
    <AiCommandBar />
    <AiNotices />
    <div class="app-shell__body">
      <DsMainLayout
        :nav-items="navItems"
        :sections="sidebarSections"
        title=""
        subtitle=""
        :topbar-enabled="showCloneWorkflowTopbar"
        :collapsed="appSidebarCollapsed"
        :class="['app-shell__layout', { 'models-route-shell': route.path.includes('/models') }]"
      >
        <template #sidebar-footer>
          <UiLocaleSelect v-if="!appSidebarCollapsed" />
          <button
            class="shell-foot__btn"
            data-testid="app-settings-button"
            :class="{ 'is-active': route.path.startsWith('/settings') }"
            type="button"
            :title="appSidebarCollapsed ? t('nav.settings') : undefined"
            @click="go('/settings')"
          >
            <span class="shell-foot__tile"><Settings class="shell-foot__icon" /></span>
            <span class="shell-foot__label">{{ t("nav.settings") }}</span>
          </button>
          <div
            class="shell-foot__user shell-foot__user--link"
            data-testid="app-account-entry"
            role="button"
            tabindex="0"
            :title="appSidebarCollapsed ? `${topUserName} · ${topUserPlan}` : t('cloud.membership.title')"
            @click="go('/billing')"
            @keydown.enter="go('/billing')"
          >
            <span class="vg-avatar shell-foot__avatar">{{ topUserName.slice(0, 1).toUpperCase() }}</span>
            <span class="shell-foot__user-copy">
              <strong>{{ topUserName }}</strong>
              <small>{{ topUserPlan }}</small>
            </span>
            <button
              class="vg-icon-btn vg-icon-btn--sm shell-foot__collapse"
              data-testid="app-sidebar-toggle"
              type="button"
              :title="appSidebarCollapsed ? t('appNavigation.expand') : t('appNavigation.collapse')"
              :aria-label="appSidebarCollapsed ? t('appNavigation.expand') : t('appNavigation.collapse')"
              :aria-expanded="!appSidebarCollapsed"
              @click.stop="toggleAppSidebar"
              @keydown.enter.stop
            >
              <component :is="appSidebarCollapsed ? PanelLeftOpen : PanelLeftClose" class="shell-foot__icon" />
            </button>
          </div>
        </template>

        <template v-if="showCloneWorkflowTopbar" #topbar>
          <div class="app-topbar-shell has-clone-workflow">
            <nav class="vg-scope cwf" aria-label="clone workflow">
              <button type="button" class="cwf-back" :title="t('cloneUi.backToList')" @click="router.push('/clone')">
                <ArrowLeft class="cwf-back__icon" />
                <span>{{ t("cloneUi.backToList") }}</span>
              </button>
              <span class="cwf-divider" />
              <ol class="cwf-steps">
                <li v-for="(item, index) in cloneTopbarItems" :key="item.key" class="cwf-steps__item">
                  <button
                    class="cwf-step"
                    :class="{ 'is-done': item.done, 'is-active': item.active }"
                    type="button"
                    :title="item.desc || item.title"
                    :aria-current="item.active ? 'step' : undefined"
                    @click="requestCloneStage(item.key)"
                  >
                    <span class="cwf-step__index">
                      <Check v-if="item.done && !item.active" class="cwf-step__check" />
                      <template v-else>{{ index + 1 }}</template>
                    </span>
                    <span class="cwf-step__label">{{ item.title }}</span>
                  </button>
                  <span v-if="index < cloneTopbarItems.length - 1" class="cwf-line" :class="{ 'is-done': item.done }" />
                </li>
              </ol>
            </nav>
          </div>
        </template>

        <div v-if="cloudAuth.status?.updateRequired || cloudAuth.status?.announcement" class="vg-scope app-cloud-banners">
          <div v-if="cloudAuth.status?.updateRequired" class="vg-notice vg-notice--warning" data-testid="app-update-required">
            <span>{{ t("cloud.banner.updateRequired", { version: cloudAuth.status.minVersion }) }}</span>
          </div>
          <div v-if="cloudAuth.status?.announcement" class="vg-notice vg-notice--accent" data-testid="app-announcement">
            <span>{{ cloudAuth.status.announcement }}</span>
          </div>
        </div>
        <RouterView />
      </DsMainLayout>
    </div>

  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--theme-shell);
  color: var(--theme-text);
}

.app-shell__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.app-shell__layout {
  height: 100%;
}

/* Legacy pages expect a little breathing room around them; vg pages pad themselves. */
.app-shell :deep(.ds-workspace) {
  padding: 10px 14px 12px;
}
.app-shell :deep(.ds-workspace:has(> .vg-page)) {
  padding: 0;
}

/* ===== Sidebar footer ===== */
.shell-foot__btn {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  height: 40px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: color-mix(in srgb, var(--theme-text) 86%, transparent);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: .02em;
  cursor: pointer;
  transition: background .15s, color .15s, border-color .15s;
}
.shell-foot__tile {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--theme-text) 8%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-text) 5%, transparent);
  color: var(--theme-text-secondary);
  transition: all .15s;
}
.shell-foot__btn:hover { background: color-mix(in srgb, var(--theme-text) 5%, transparent); color: var(--theme-text); }
.shell-foot__btn:hover .shell-foot__tile { color: var(--theme-text); border-color: color-mix(in srgb, var(--theme-text) 14%, transparent); }
.shell-foot__btn.is-active {
  background: linear-gradient(90deg, color-mix(in srgb, var(--theme-accent) 18%, transparent), color-mix(in srgb, var(--theme-accent) 4%, transparent));
  border-color: color-mix(in srgb, var(--theme-accent) 24%, transparent);
  color: var(--theme-text);
  font-weight: 600;
}
.shell-foot__btn.is-active .shell-foot__tile {
  border-color: transparent;
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-accent) 38%, transparent);
}
.shell-foot__icon { width: 16px; height: 16px; flex-shrink: 0; stroke-width: 1.9; }

/* Language picker rendered as a nav row with an icon tile */
.app-shell :deep(.vg-nav__footer .locale-select::before) {
  content: '';
  position: absolute;
  left: 8px;
  width: 28px;
  height: 28px;
  border: 1px solid color-mix(in srgb, var(--theme-text) 8%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-text) 5%, transparent);
  pointer-events: none;
}
.app-shell :deep(.vg-nav__footer .locale-select__icon) {
  left: 15px;
  z-index: 1;
  width: 16px;
  height: 16px;
  color: var(--theme-text-secondary);
}
.app-shell :deep(.vg-nav__footer .locale-select__control) {
  height: 40px;
  padding-left: 47px;
  border-color: transparent;
  border-radius: 10px;
  background-color: transparent;
  box-shadow: none;
  color: color-mix(in srgb, var(--theme-text) 86%, transparent);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: .02em;
  cursor: pointer;
}
.app-shell :deep(.vg-nav__footer .locale-select__control:hover) {
  background-color: color-mix(in srgb, var(--theme-text) 5%, transparent);
  color: var(--theme-text);
}

.shell-foot__user {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  margin-top: 6px;
  padding: 8px 6px 8px 8px;
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-text) 4%, transparent), color-mix(in srgb, var(--theme-text) 1.5%, transparent));
}
.shell-foot__avatar {
  width: 30px;
  height: 30px;
  font-size: 13px;
  font-weight: 700;
  border-radius: 9px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--theme-accent) 100%, #ffffff 12%), color-mix(in srgb, var(--theme-accent) 100%, #000000 30%));
  color: var(--theme-on-accent);
}
.shell-foot__user-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  line-height: 1.3;
}
.shell-foot__user-copy strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shell-foot__user-copy small {
  font-size: 11.5px;
  color: var(--theme-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shell-foot__collapse { color: var(--theme-text-secondary); }

/* Collapsed rail */
.app-shell.is-sidebar-collapsed .shell-foot__btn { justify-content: center; padding: 0; }
.app-shell.is-sidebar-collapsed .shell-foot__label,
.app-shell.is-sidebar-collapsed .shell-foot__user-copy { display: none; }
.shell-foot__user--link { cursor: pointer; transition: background-color .12s, border-color .12s; }
.shell-foot__user--link:hover { background: color-mix(in srgb, var(--theme-text) 5%, transparent); }
.app-shell.is-sidebar-collapsed .shell-foot__user { flex-direction: column; gap: 6px; padding: 6px 0; border-color: transparent; background: transparent; }

@media (max-width: 1180px) {
  .shell-foot__btn { justify-content: center; padding: 0; }
  .shell-foot__label,
  .shell-foot__user-copy,
  .app-shell :deep(.locale-select) { display: none; }
  .shell-foot__user { flex-direction: column; gap: 6px; padding: 6px 0; border-color: transparent; background: transparent; }
}

/* ===== Clone workflow topbar (kept until the clone workspace is migrated) ===== */
.app-shell :deep(.ds-topbar) {
  min-height: 0 !important;
  height: auto !important;
  padding: 0 !important;
  border-bottom: 0 !important;
  background: transparent !important;
}

.app-topbar-shell {
  display: grid;
  width: 100%;
  gap: 0;
  padding: 0;
}

.app-topbar-shell.has-clone-workflow {
  padding: 4px 0 0;
}

.app-topbar-clone {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  width: 100%;
  min-height: 56px;
  padding: 8px 12px;
  border: 1px solid rgba(90, 107, 146, 0.2);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(11, 18, 31, 0.98), rgba(7, 13, 24, 0.98)),
    radial-gradient(
      circle at top left,
      rgba(109, 93, 255, 0.1),
      transparent 34%
    );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 14px 28px rgba(0, 0, 0, 0.22);
}

.app-topbar-clone__nav {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 0 1 auto;
}

.app-topbar-clone__step {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 38px;
  padding: 0 6px 0 0;
  text-align: left;
  color: rgba(208, 219, 241, 0.72);
  border: 0;
  background: transparent;
  transition: color 160ms ease;
}

.app-topbar-clone__step:hover {
  color: #f8fbff;
}

.app-topbar-clone__step.is-active {
  color: #ffffff;
}

.app-topbar-clone__arrow {
  position: relative;
  width: 18px;
  height: 1px;
  background: linear-gradient(
    90deg,
    rgba(89, 182, 255, 0.14),
    rgba(111, 88, 255, 0.58)
  );
  flex: 0 0 auto;
}

.app-topbar-clone__arrow::after {
  content: "";
  position: absolute;
  right: 0;
  top: 50%;
  width: 6px;
  height: 6px;
  border-top: 1px solid rgba(111, 88, 255, 0.72);
  border-right: 1px solid rgba(111, 88, 255, 0.72);
  transform: translateY(-50%) rotate(45deg);
}

.app-topbar-clone__index {
  position: relative;
  z-index: 1;
  width: 26px;
  height: 26px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 17, 31, 0.72);
  color: rgba(147, 162, 193, 0.92);
  border: 1px solid rgba(77, 98, 135, 0.38);
  font-size: 11px;
  font-weight: 700;
  flex: 0 0 auto;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.app-topbar-clone__label {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-size: 12px;
  line-height: 1.3;
  font-weight: 700;
  white-space: nowrap;
}

.app-topbar-clone__step.is-done .app-topbar-clone__index,
.app-topbar-clone__step.is-active .app-topbar-clone__index {
  color: #ffffff;
  border-color: rgba(109, 93, 255, 0.42);
  background: linear-gradient(
    135deg,
    rgba(111, 88, 255, 0.2),
    rgba(89, 182, 255, 0.14)
  );
}

.app-topbar-clone__step.is-active .app-topbar-clone__index {
  background: linear-gradient(
    135deg,
    rgba(111, 88, 255, 0.96),
    rgba(89, 182, 255, 0.88)
  );
  box-shadow:
    0 0 0 3px rgba(111, 88, 255, 0.08),
    0 0 18px rgba(111, 88, 255, 0.26);
}

.app-topbar-clone__step.is-done .app-topbar-clone__label {
  color: #eef3ff;
}

.app-topbar-clone__spacer {
  flex: 1 1 auto;
  min-width: 40px;
}

.app-topbar-clone__status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0;
  flex: 0 0 auto;
  border-left: 1px solid rgba(82, 106, 136, 0.18);
}

.app-topbar-clone__metric {
  display: grid;
  gap: 2px;
  min-width: 0;
  min-height: 40px;
  padding: 0 16px;
  align-content: center;
  border-left: 1px solid rgba(255, 255, 255, 0.04);
}

.app-topbar-clone__metric:first-child {
  border-left: 0;
}

.app-topbar-clone__metric strong {
  color: #dbe5f2;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.app-topbar-clone__metric small {
  color: #a9b7d3;
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
}

.app-topbar-clone__metric--account {
  min-width: 168px;
}

.app-shell :deep(.ds-topbar__spacer) {
  flex: 1 1 auto;
}

.app-cloud-banners { display: flex; flex-direction: column; gap: 8px; padding: 12px 20px 0; }

/* ---------- clone workflow step bar ---------- */
.cwf { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 6px 14px 6px 8px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-lg, 14px); background: var(--theme-panel); }
.cwf-back { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px 0 8px; border: 0; border-radius: 9px; background: transparent; color: var(--theme-text-secondary); font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background .15s, color .15s; }
.cwf-back:hover { background: var(--theme-panel-soft); color: var(--theme-text); }
.cwf-back__icon { width: 16px; height: 16px; }
.cwf-divider { width: 1px; height: 22px; background: var(--theme-divider); flex-shrink: 0; }
.cwf-steps { display: flex; align-items: center; flex: 1; min-width: 0; margin: 0; padding: 0; list-style: none; }
.cwf-steps__item { display: flex; align-items: center; flex: 1 1 0; min-width: 0; }
.cwf-steps__item:last-child { flex: 0 0 auto; }
.cwf-step { display: inline-flex; align-items: center; gap: 8px; min-width: 0; height: 36px; padding: 0 12px 0 6px; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--theme-text-muted); cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
.cwf-step:hover { background: var(--theme-panel-soft); color: var(--theme-text); }
.cwf-step__index { display: grid; place-items: center; width: 24px; height: 24px; flex-shrink: 0; border: 1.5px solid var(--theme-border-control); border-radius: 50%; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; transition: all .15s; }
.cwf-step__check { width: 13px; height: 13px; stroke-width: 3; }
.cwf-step__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
.cwf-step.is-done { color: var(--theme-text-secondary); }
.cwf-step.is-done .cwf-step__index { border-color: transparent; background: var(--vg-accent-soft); color: var(--vg-accent); }
.cwf-step.is-active { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); color: var(--theme-text); }
.cwf-step.is-active .cwf-step__index { border-color: var(--vg-accent); background: var(--vg-accent); color: var(--theme-on-accent); box-shadow: 0 0 0 4px var(--vg-accent-soft); }
.cwf-step.is-active .cwf-step__label { font-weight: 700; }
.cwf-line { flex: 1; min-width: 12px; height: 2px; margin: 0 6px; border-radius: 2px; background: var(--theme-divider); }
.cwf-line.is-done { background: color-mix(in srgb, var(--vg-accent) 55%, transparent); }
@media (max-width: 1280px) {
  .cwf-back span { display: none; }
  .cwf-step:not(.is-active) .cwf-step__label { display: none; }
  .cwf-step { padding-right: 6px; }
}
</style>
