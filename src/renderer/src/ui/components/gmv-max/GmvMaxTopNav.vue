<script setup lang="ts">
import { computed, type Component } from 'vue'
import { BarChart3, CircleHelp, GraduationCap, Settings2 } from 'lucide-vue-next'

/**
 * GMV MAX navigation: one row of main modules, and below it the pages of the active module when it has more
 * than one. Every page stays one click away from its module, with no drop-down menus.
 */
export type GmvNavPage = { tab: string; label: string; count?: number }
export type GmvNavModule = { id: string; label: string; icon: Component; pages: GmvNavPage[] }

const props = defineProps<{
  modules: GmvNavModule[]
  activeTab: string
  connected: boolean
  connectionLabel: string
  helpLabel: string
  settingsLabel?: string
  academyLabel?: string
  simple: boolean
  simpleLabel: string
  proLabel: string
  modeHint: string
}>()

const emit = defineEmits<{ select: [tab: string]; help: []; mode: [mode: 'simple' | 'pro'] }>()

const activeModule = computed(() => props.modules.find((module) => module.pages.some((page) => page.tab === props.activeTab)))
const moduleCount = (module: GmvNavModule) => module.pages.reduce((sum, page) => sum + (page.count || 0), 0)
const badge = (count: number) => (count > 99 ? '99+' : String(count))
</script>

<template>
  <header class="gmv-topnav vg-scope" data-testid="gmv-feature-nav">
    <div class="gmv-topnav__bar">
      <div class="gmv-topnav__brand" aria-hidden="true">
        <span><BarChart3 /></span>
        <strong>GMV MAX</strong>
      </div>

      <nav class="gmv-topnav__tabs" aria-label="GMV MAX">
        <button
          v-for="module in modules"
          :key="module.id"
          type="button"
          class="gmv-topnav__tab"
          :class="{ 'is-active': activeModule?.id === module.id }"
          :aria-current="activeModule?.id === module.id ? 'page' : undefined"
          :data-testid="module.pages.length === 1 ? `gmv-tab-${module.pages[0].tab}` : `gmv-module-${module.id}`"
          @click="emit('select', module.pages[0].tab)"
        >
          <component :is="module.icon" />
          <span>{{ module.label }}</span>
          <em v-if="moduleCount(module)">{{ badge(moduleCount(module)) }}</em>
        </button>
      </nav>

      <div class="gmv-topnav__tools">
        <span class="gmv-topnav__status" :title="connectionLabel">
          <i :class="{ 'is-connected': connected }"></i><span>{{ connectionLabel }}</span>
        </span>
        <div class="gmv-topnav__mode" role="group" :aria-label="modeHint" :title="modeHint">
          <button type="button" :class="{ 'is-active': simple }" :aria-pressed="simple" data-testid="gmv-mode-simple" @click="!simple && emit('mode', 'simple')">{{ simpleLabel }}</button>
          <button type="button" :class="{ 'is-active': !simple }" :aria-pressed="!simple" data-testid="gmv-mode-pro" @click="simple && emit('mode', 'pro')">{{ proLabel }}</button>
        </div>
        <slot name="tools" />
        <button
          v-if="academyLabel"
          type="button"
          class="gmv-topnav__icon"
          :class="{ 'is-active': activeTab === 'academy' }"
          data-testid="gmv-tab-academy"
          :title="academyLabel"
          :aria-label="academyLabel"
          @click="emit('select', 'academy')"
        >
          <GraduationCap />
        </button>
        <button
          v-if="settingsLabel"
          type="button"
          class="gmv-topnav__icon"
          :class="{ 'is-active': activeTab === 'settings' }"
          data-testid="gmv-tab-settings"
          :title="settingsLabel"
          :aria-label="settingsLabel"
          @click="emit('select', 'settings')"
        >
          <Settings2 />
        </button>
        <button
          type="button"
          class="gmv-topnav__icon"
          :class="{ 'is-active': activeTab === 'help' }"
          data-testid="gmv-tab-help"
          :title="helpLabel"
          :aria-label="helpLabel"
          @click="emit('help')"
        >
          <CircleHelp />
        </button>
      </div>
    </div>

    <nav v-if="activeModule && activeModule.pages.length > 1" class="gmv-topnav__sub" :aria-label="activeModule.label" data-testid="gmv-subnav">
      <button
        v-for="page in activeModule.pages"
        :key="page.tab"
        type="button"
        :class="{ 'is-active': page.tab === activeTab }"
        :aria-current="page.tab === activeTab ? 'page' : undefined"
        :data-testid="`gmv-tab-${page.tab}`"
        @click="emit('select', page.tab)"
      >
        {{ page.label }}<em v-if="page.count">{{ badge(page.count) }}</em>
      </button>
    </nav>
  </header>
</template>

<style scoped>
.gmv-topnav {
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid var(--theme-divider);
  background: var(--theme-sidebar, var(--theme-panel));
}
.gmv-topnav__bar { height: 52px; padding: 0 24px; display: flex; align-items: stretch; gap: 28px; }
.gmv-topnav__brand { display: flex; align-items: center; gap: 9px; flex-shrink: 0; }
.gmv-topnav__brand > span { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 7px; background: var(--theme-tone-red); color: #fff; }
.gmv-topnav__brand svg { width: 16px; height: 16px; }
.gmv-topnav__brand strong { color: var(--theme-text); font-size: 14px; font-weight: 700; letter-spacing: .02em; white-space: nowrap; }
.gmv-topnav__tabs { min-width: 0; flex: 1; display: flex; align-items: stretch; gap: 4px; overflow-x: auto; scrollbar-width: none; }
.gmv-topnav__tabs::-webkit-scrollbar { display: none; }
.gmv-topnav__tools { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.gmv-topnav__status { margin-right: 8px; display: inline-flex; align-items: center; gap: 7px; color: var(--theme-text-muted); font-size: 12px; white-space: nowrap; }
.gmv-topnav__status i { width: 7px; height: 7px; border-radius: 50%; background: var(--theme-danger); }
.gmv-topnav__status i.is-connected { background: var(--theme-success-text); box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-success-text) 14%, transparent); }
.gmv-topnav__sub { height: 40px; padding: 0 24px; display: flex; align-items: stretch; gap: 24px; border-top: 1px solid var(--theme-divider); overflow-x: auto; scrollbar-width: none; }
@media (max-width: 1280px) {
  .gmv-topnav__bar { gap: 16px; padding: 0 16px; }
  .gmv-topnav__sub { padding: 0 16px; gap: 18px; }
  .gmv-topnav__brand strong, .gmv-topnav__status span { display: none; }
}
</style>

<style>
/* Unscoped part: buttons need the #app prefix to outrank the app-wide button theme. */
html[data-app-theme] body #app .gmv-topnav button { font: inherit; cursor: pointer; box-shadow: none !important; }
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__tab {
  position: relative;
  height: auto !important;
  min-height: 0 !important;
  padding: 0 12px !important;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: var(--theme-text-secondary) !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  white-space: nowrap;
}
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__tab svg { width: 16px; height: 16px; color: var(--theme-text-muted); }
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__tab:hover { color: var(--theme-text) !important; }
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__tab.is-active { color: var(--theme-text) !important; }
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__tab.is-active::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: -1px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--theme-accent);
}
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__tab.is-active svg { color: var(--theme-accent); }
html[data-app-theme] body #app .gmv-topnav em {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--theme-tone-red);
  color: #fff;
  font-size: 10.5px;
  font-style: normal;
  font-weight: 700;
}
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__sub button {
  position: relative;
  height: auto !important;
  min-height: 0 !important;
  padding: 0 !important;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: var(--theme-text-muted) !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  white-space: nowrap;
}
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__sub button:hover { color: var(--theme-text) !important; }
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__sub button.is-active { color: var(--theme-text) !important; font-weight: 600 !important; }
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__sub button.is-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--theme-text);
}
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__mode {
  margin-right: 6px;
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
}
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__mode button {
  height: 26px !important;
  min-height: 26px !important;
  padding: 0 11px !important;
  border: 0 !important;
  border-radius: 6px !important;
  background: transparent !important;
  color: var(--theme-text-muted) !important;
  font-size: 12.5px !important;
  font-weight: 600 !important;
}
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__mode button.is-active { background: color-mix(in srgb, var(--theme-text) 11%, transparent) !important; color: var(--theme-text) !important; }
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__icon {
  width: 32px !important;
  height: 32px !important;
  min-height: 32px !important;
  padding: 0 !important;
  display: grid;
  place-items: center;
  border: 1px solid transparent !important;
  border-radius: 8px !important;
  background: transparent !important;
  color: var(--theme-text-secondary) !important;
}
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__icon:hover,
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__icon.is-active { border-color: var(--theme-border) !important; color: var(--theme-text) !important; }
html[data-app-theme] body #app .gmv-topnav .gmv-topnav__icon svg { width: 17px; height: 17px; }
</style>
