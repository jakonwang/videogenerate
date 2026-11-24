import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './ui/App.vue'
import { i18n } from './i18n'
import { router } from './router'
import './styles.css'
import './design-system/themes.css'
import './design-system/theme-components.css'
import './design-system/ui-kit.css'
import './design-system/clone-workspace.css'
import './design-system/clone-studio.css'
import './design-system/creative-studio.css'
import './design-system/product-materials.css'
import './design-system/publisher.css'
import './design-system/live-photo.css'
import './design-system/live-slicer.css'
import './design-system/unified.css'
import './design-system/unified-modules.css'

window.addEventListener('error', (event) => {
  console.error('[renderer-error]', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error ? String(event.error?.stack || event.error?.message || event.error) : '',
  })
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as any
  console.error('[renderer-unhandledrejection]', {
    message: String(reason?.message || reason || ''),
    stack: String(reason?.stack || ''),
  })
})

router.onError((error) => {
  console.error('[router-error]', String((error as any)?.stack || (error as any)?.message || error))
})

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(i18n)
app.use(router)
app.mount('#app')

