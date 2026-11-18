export {}

/** $t used by desktop pages reused on the web (see WEB_I18N in main.ts). */
declare module 'vue' {
  interface ComponentCustomProperties {
    $t: (key: string) => string
  }
}
