/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
interface ImportMetaEnv {
  /** 打包时写死的云端地址，如 https://api.example.com */
  readonly VITE_CLOUD_API_BASE?: string
}

/** 网页上由 lib/researchApi 等提供的电脑端 API 替身（让复用的电脑端页面能运行） */
interface Window {
  /** Web stand-ins for the desktop preload API (lib/researchApi, lib/desktopRelay). */
  api: Record<string, any>
}

/**
 * Desktop pages / modules reused on the web (vite aliases in vite.config.ts). They are type-checked by the
 * desktop build; here they are opaque so the web typecheck doesn't pull in the desktop app.
 */
declare module '@desktop-views/*' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
declare module '@desktop-src/i18n' {
  export const i18n: import('vue').Plugin
}
declare module '@desktop-src/ui/composables/useModelSettings' {
  export const useModelSettings: (options: { t: (key: string, values?: Record<string, unknown>) => string; message: import('vue').Ref<string> }) => any
}
declare module '@desktop-src/ui/components/*' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
/** 侧边栏合并入口和页面标签（电脑端和网页共用，src/renderer/src/ui/navigation/） */
declare module '@desktop-src/ui/navigation/SectionTabs.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{ translate?: (key: string, fallback: string) => string }, object, unknown>
  export default component
}
declare module '@desktop-src/ui/navigation/sectionTabs' {
  type GroupKey = 'aiVideo' | 'production' | 'library'
  export const lastSectionTab: (key: GroupKey) => { key: string; to: string }
  export const sectionActive: (key: GroupKey, path: string) => boolean
}
declare module '@desktop-src/stores/cloneTopbar' {
  /** 电脑端复刻页面的步骤条 store（pinia），网页顶栏的步骤条读同一个 */
  export const useCloneTopbarStore: () => any
}

/** 电脑端主进程代码里用到、网页类型检查经 lib/desktopApi/contract.ts 间接读到的无类型包 */
declare module 'fontkit' {
  const fontkit: any
  export default fontkit
}
