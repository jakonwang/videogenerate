<script setup lang="ts">
import { useRouter } from 'vue-router'

type NavItem = { to: string; label: string; active?: boolean; icon?: any; badge?: number }

defineProps<{
  items: NavItem[]
  sections?: Array<{ title: string; items: NavItem[] }>
  collapsed?: boolean
}>()

const router = useRouter()

function navigate(to: string) {
  void router.push(to)
}
</script>

<template>
  <aside class="vg-scope vg-nav" data-testid="app-sidebar" :class="{ 'is-collapsed': collapsed }">
    <nav class="vg-nav__list" aria-label="main">
      <button
        v-for="item in items"
        :key="item.to"
        type="button"
        class="vg-nav__item"
        :class="{ 'is-active': item.active }"
        :title="item.label"
        :aria-current="item.active ? 'page' : undefined"
        @click="navigate(item.to)"
      >
        <span v-if="item.icon" class="vg-nav__tile">
          <component :is="item.icon" class="vg-nav__icon" />
        </span>
        <span class="vg-nav__label">{{ item.label }}</span><span v-if="item.badge" class="vg-nav__badge">{{ item.badge > 99 ? '99+' : item.badge }}</span>
      </button>

      <div v-for="(section, index) in sections || []" :key="section.title || index" class="vg-nav__section" :class="{ 'is-untitled': !section.title }">
        <!-- 没有标题的分组（如工具箱）只留一条分隔线 -->
        <div v-if="section.title" class="vg-nav__section-title"><span>{{ section.title }}</span></div>
        <button
          v-for="item in section.items"
          :key="item.to"
          type="button"
          class="vg-nav__item"
          :class="{ 'is-active': item.active }"
          :title="item.label"
          :aria-current="item.active ? 'page' : undefined"
          @click="navigate(item.to)"
        >
          <span v-if="item.icon" class="vg-nav__tile">
            <component :is="item.icon" class="vg-nav__icon" />
          </span>
          <span class="vg-nav__label">{{ item.label }}</span><span v-if="item.badge" class="vg-nav__badge">{{ item.badge > 99 ? '99+' : item.badge }}</span>
        </button>
      </div>
    </nav>
    <div class="vg-nav__footer">
      <slot name="footer" />
    </div>
  </aside>
</template>

<style scoped>
.vg-nav { position: relative; display: flex; flex-direction: column; min-height: 0; height: 100%; padding: 12px 12px 12px; overflow: hidden; border-right: 1px solid var(--theme-border); background: linear-gradient(180deg, color-mix(in srgb, var(--theme-accent) 4%, var(--theme-sidebar)), var(--theme-sidebar) 60%); }
.vg-nav__list { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 1px; overflow-y: auto; scrollbar-width: none; }
.vg-nav__list::-webkit-scrollbar { display: none; }
.vg-nav__item { position: relative; display: flex; align-items: center; gap: 12px; width: 100%; height: 39px; flex-shrink: 0; padding: 0 9px; border: 1px solid transparent; border-radius: 10px; background: transparent; color: color-mix(in srgb, var(--theme-text) 92%, transparent); font-size: 14.5px; font-weight: 400; text-align: left; cursor: pointer; transition: background .14s, color .14s; -webkit-app-region: no-drag; }
.vg-nav__item:hover { background: color-mix(in srgb, var(--theme-text) 5%, transparent); }
.vg-nav__item:focus-visible { outline: 2px solid var(--vg-accent-line); outline-offset: -2px; }
.vg-nav__tile { display: grid; place-items: center; width: 28px; height: 28px; flex-shrink: 0; border: 1px solid color-mix(in srgb, var(--theme-text) 5%, transparent); border-radius: 7px; background: color-mix(in srgb, var(--theme-text) 7%, transparent); color: color-mix(in srgb, var(--theme-text) 88%, transparent); }
.vg-nav__icon { width: 15px; height: 15px; stroke-width: 1.9; }
.vg-nav__item.is-active { border-color: color-mix(in srgb, var(--theme-accent) 20%, transparent); background: linear-gradient(90deg, color-mix(in srgb, var(--theme-accent) 24%, transparent), color-mix(in srgb, var(--theme-accent) 7%, transparent)); color: var(--theme-text); font-weight: 600; }
.vg-nav__item.is-active .vg-nav__tile { border-color: transparent; background: linear-gradient(145deg, color-mix(in srgb, var(--theme-accent) 94%, #fff), color-mix(in srgb, var(--theme-accent) 78%, #003d31)); color: #fff; box-shadow: 0 0 12px color-mix(in srgb, var(--theme-accent) 40%, transparent); }
.vg-nav__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vg-nav__badge { margin-left: auto; min-width: 18px; padding: 0 5px; flex-shrink: 0; border-radius: 999px; background: var(--theme-tone-red, #f87171); color: #fff; font-size: 10.5px; line-height: 17px; text-align: center; }
.vg-nav__section { display: flex; flex-direction: column; gap: 1px; margin-top: 10px; }
.vg-nav__section-title { display: flex; align-items: center; gap: 8px; padding: 0 0 5px 9px; color: var(--theme-text-muted); font-size: 12px; line-height: 16px; white-space: nowrap; }
.vg-nav__section-title::after { content: ''; flex: 1; height: 1px; background: var(--theme-divider); }
.vg-nav__section.is-untitled { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--theme-divider); }
.vg-nav__footer { display: flex; flex-direction: column; gap: 1px; margin-top: 8px; padding-top: 10px; border-top: 1px solid var(--theme-divider); }
/* Collapsed: icon rail */
.vg-nav.is-collapsed { padding-inline: 10px; }
.vg-nav.is-collapsed .vg-nav__item { justify-content: center; padding: 0; }
.vg-nav.is-collapsed .vg-nav__label, .vg-nav.is-collapsed .vg-nav__section-title { display: none; }
.vg-nav.is-collapsed .vg-nav__badge { position: absolute; top: 0; right: 2px; min-width: 14px; padding: 0 3px; font-size: 9px; line-height: 14px; }
.vg-nav.is-collapsed .vg-nav__section { margin-top: 9px; padding-top: 9px; border-top: 1px solid var(--theme-divider); }
/* Narrow windows always use the icon rail. */
@media (max-width: 1180px) {
  .vg-nav { padding-inline: 10px; }
  .vg-nav__item { justify-content: center; padding: 0; }
  .vg-nav__label, .vg-nav__section-title { display: none; }
  .vg-nav__section, .vg-nav__section.is-untitled { margin-top: 9px; padding-top: 9px; border-top: 1px solid var(--theme-divider); }
}
</style>
