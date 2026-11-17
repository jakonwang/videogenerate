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
