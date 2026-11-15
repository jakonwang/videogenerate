<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-vue-next";
import { storeToRefs } from "pinia";
import TitleBar from "./components/TitleBar.vue";
import UiLocaleSelect from "./components/UiLocaleSelect.vue";
import DsMainLayout from "../design-system/layout/MainLayout.vue";
import AssetLibraryPickerHost from "./components/AssetLibraryPickerHost.vue";
import { useCloneTopbarStore } from "@/stores/cloneTopbar";
import { useDesignInspectorStore } from "@/stores/designInspector";
import { useWebSessionStore } from "@/stores/webSession";
import { featureForPath, useCloudAuthStore } from "@/stores/cloudAuth";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const APP_SIDEBAR_STORAGE_KEY = "videogenerate:app-sidebar-collapsed:v1";
const helpOpen = ref(false);
const moreOpen = ref(false);
const appSidebarCollapsed = ref(false);
const cloneTopbar = useCloneTopbarStore();
const designInspector = useDesignInspectorStore();
const webSession = useWebSessionStore();
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

const allNavItems = computed(() => [
  {
    to: "/home",
    icon: House,
    label: t("nav.home"),
    active: route.path.includes("/home"),
  },
  {
    to: "/product-research",
    icon: SearchCheck,
    label: t("nav.productResearch"),
    active: route.path.includes("/product-research"),
  },
  {
    to: "/models",
    icon: Sparkles,
    label: t("nav.models"),
    active: route.path.includes("/models"),
  },
  {
    to: "/asset-library",
    icon: Images,
    label: t("nav.assets"),
    active: route.path.includes("/asset-library"),
  },
  {
    to: "/products",
    icon: FolderOpen,
    label: t("nav.productLibrary"),
    active: route.path.includes("/products"),
  },
  {
    to: "/clone",
    icon: CopyPlus,
    label: t("nav.clone"),
    active: route.path.includes("/clone"),
  },
  {
    to: "/publish",
    icon: Send,
    label: t("nav.publish"),
    active: route.path.includes("/publish"),
  },
]);

/** 后台关闭的模块不出现在导航里 */
const navItems = computed(() => allNavItems.value.filter((item) => cloudAuth.hasFeature(featureForPath(item.to))));

const helpItems = computed(() => [
  { to: "/models", title: t("nav.models"), desc: t("shell.helpModels") },
  {
    to: "/products",
    title: t("nav.productLibrary"),
    desc: t("shell.helpProducts"),
  },
  { to: "/clone", title: t("nav.clone"), desc: t("shell.helpClone") },
  { to: "/publish", title: t("nav.publish"), desc: t("nav.publish") },
]);

const sidebarSections = computed(() => [
  {
    title: t("nav.plugins"),
    items: [
      {
        to: "/plugins",
        icon: Store,
        label: t("plugins.tabs.market"),
        active: route.path.includes("/plugins") && !route.query.tab,
      },
      {
        to: "/plugins?tab=installed",
        icon: Puzzle,
        label: t("plugins.tabs.installed"),
        active:
          route.path.includes("/plugins") && route.query.tab === "installed",
      },
    ],
  },
]);

function go(path: string, query?: Record<string, string>) {
  void router.push({ path, query });
}

function openCloudWorkspace() {
  go("/production");
}

function quickExport() {
  go("/production/tasks", { ws: "media", quickStart: String(Date.now()) });
}

function openHelpModal() {
  helpOpen.value = true;
}

function onTopMenuClick(key: string) {
  moreOpen.value = false;
  if (key === "project") {
    go("/products");
    return;
  }
  if (key === "edit") {
    go("/production");
    return;
  }
  if (key === "view") {
    go("/production");
    return;
  }
  if (key === "export") quickExport();
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
});
</script>

<template>
  <div class="ui-app app-shell" :class="{ 'is-sidebar-collapsed': appSidebarCollapsed }">
    <AssetLibraryPickerHost />
    <TitleBar />
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
            <Settings class="shell-foot__icon" />
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
            <div class="app-topbar-clone">
              <div class="app-topbar-clone__nav">
                <template v-for="(item, index) in cloneTopbarItems" :key="item.key">
                  <button
                    class="app-topbar-clone__step"
                    :class="{ 'is-done': item.done, 'is-active': item.active }"
                    type="button"
                    @click="requestCloneStage(item.key)"
                  >
                    <span class="app-topbar-clone__index">{{ item.done ? "✓" : index + 1 }}</span>
                    <span class="app-topbar-clone__label">{{ item.title }}</span>
                  </button>
                  <span v-if="index < cloneTopbarItems.length - 1" class="app-topbar-clone__arrow"></span>
                </template>
              </div>
            </div>
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

    <Teleport to="body">
      <div v-if="helpOpen" class="vg-scope vg-backdrop" @click.self="helpOpen = false">
        <div class="vg-dialog" role="dialog" aria-modal="true">
          <div class="vg-dialog__head">
            <div class="vg-dialog__title">
              <div>
                <h2>{{ t("shell.helpTitle") }}</h2>
                <p>{{ t("shell.helpDesc") }}</p>
              </div>
            </div>
            <button class="vg-icon-btn" type="button" :aria-label="t('common.cancel')" @click="helpOpen = false">
              <X class="shell-foot__icon" />
            </button>
          </div>
          <div class="vg-dialog__body">
            <div class="vg-list">
              <button
                v-for="item in helpItems"
                :key="item.to"
                class="vg-list__item vg-list__item--button"
                type="button"
                @click="helpOpen = false; go(item.to)"
              >
                <span class="vg-list__main">
                  <span class="vg-list__title">{{ item.title }}</span>
                  <span class="vg-list__sub">{{ item.desc }}</span>
                </span>
              </button>
            </div>
          </div>
          <div class="vg-dialog__foot">
            <div class="vg-dialog__foot-actions">
              <button class="vg-btn" type="button" @click="helpOpen = false">{{ t("common.cancel") }}</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
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
  gap: 10px;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background .15s, color .15s;
}
.shell-foot__btn:hover { background: var(--theme-control-hover); color: var(--theme-text); }
.shell-foot__btn.is-active { background: var(--vg-accent-soft); color: var(--vg-accent); font-weight: 600; }
.shell-foot__icon { width: 17px; height: 17px; flex-shrink: 0; }

.shell-foot__user {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 6px 2px 8px;
}
.shell-foot__avatar { width: 30px; height: 30px; font-size: 13px; }
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
  font-size: 11px;
  color: var(--theme-text-muted);
}

/* Collapsed rail */
.app-shell.is-sidebar-collapsed .shell-foot__btn { justify-content: center; padding: 0; }
.app-shell.is-sidebar-collapsed .shell-foot__label,
.app-shell.is-sidebar-collapsed .shell-foot__user-copy { display: none; }
.shell-foot__user--link { cursor: pointer; border-radius: 10px; transition: background-color .15s; }
.shell-foot__user--link:hover { background: var(--theme-hover, rgba(127, 127, 127, 0.08)); }
.app-shell.is-sidebar-collapsed .shell-foot__user { flex-direction: column; gap: 8px; padding: 6px 0 0; }

@media (max-width: 1180px) {
  .shell-foot__btn { justify-content: center; padding: 0; }
  .shell-foot__label,
  .shell-foot__user-copy,
  .app-shell :deep(.locale-select) { display: none; }
  .shell-foot__user { flex-direction: column; gap: 8px; padding: 6px 0 0; }
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
</style>
