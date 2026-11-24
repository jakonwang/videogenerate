import { createApp } from 'vue'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor } from '@capacitor/core'
import '@design/themes.css'
// Desktop UI kit (vg-*): the web shell and desktop-style pages use the same classes as the desktop app.
import '@design/ui-kit.css'
import './styles/mobile.css'
import './styles/wide.css'
import './styles/web-tools.css'
import './styles/web-pages.css'
import './styles/web-clone.css'
import '@design/unified.css'
import '@design/unified-modules.css'
import App from './App.vue'
import { router } from './router'
import { installChunkReload } from './lib/chunkReload'
import { initSession } from './lib/session'
import { requestSync } from './lib/sync'
import { refreshResearch } from './lib/research'
import { startPolling } from './lib/generate'
import './lib/livePhoto'
import { startToolPolling } from './lib/videoTools'
import { installFileDrop } from './lib/fileDrop'
import { applyTheme } from './lib/theme'
import { isWeb } from './lib/platform'
import { installResearchApi } from './lib/researchApi'
import { installDesktopRelayApi } from './lib/desktopRelay'
import { createPinia } from 'pinia'
import { installDesktopMediaRewriter } from './lib/desktopShims/localMedia'
import { installContentHubApi } from './lib/contentHubApi'
import { installDesktopCloudApi } from './lib/desktopCloudApi'

/** Strings the reused desktop pages look up with $t (the web version has no i18n). */
const WEB_I18N: Record<string, string> = { 'ai.pages.productResearch': '选品' }

async function boot() {
  // Same themes as the desktop app (dark-teal by default); the choice is kept per browser.
  applyTheme()
  if (Capacitor.isNativePlatform()) {
    await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined)
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined)
  }
  await initSession()
  installFileDrop()
  const app = createApp(App)
  if (isWeb) {
    // 电脑端的选品方案页面在网页上原样复用：window.api 换成走云同步的网页版。
    installResearchApi()
    installDesktopRelayApi()
    // 工作台 / 审核收件箱 / 数据复盘 / 账号与会员：电脑端页面原样复用，数据来自网页同步
    installContentHubApi()
    // 电脑端复刻页面用 pinia 的 store
    app.use(createPinia())
    // 电脑端页面里直接写的 vg:// 本地文件地址，换成经云端的链接
    installDesktopMediaRewriter()
    installDesktopCloudApi()
    app.config.globalProperties.$t = (key: string) => WEB_I18N[key] ?? key
  }
  installChunkReload(app, router)
  app.use(router).mount('#app')
  void requestSync()
  // 选品：恢复配对连接，取走后台采集到的商品
  void refreshResearch().catch(() => undefined)
  // 回到前台时同步一次，拿到电脑端的最新改动
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    void requestSync()
    void refreshResearch().catch(() => undefined)
    // 查一下云端生成任务有没有完成
    startPolling()
    startToolPolling()
  })
}

void boot()
