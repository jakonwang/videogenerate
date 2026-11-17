import { createApp } from 'vue'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor } from '@capacitor/core'
import '@design/themes.css'
import './styles/mobile.css'
import App from './App.vue'
import { router } from './router'
import { initSession } from './lib/session'
import { requestSync } from './lib/sync'
import { refreshResearch } from './lib/research'
import { startPolling } from './lib/generate'
import { startToolPolling } from './lib/videoTools'

async function boot() {
  if (Capacitor.isNativePlatform()) {
    await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined)
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined)
  }
  await initSession()
  createApp(App).use(router).mount('#app')
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
