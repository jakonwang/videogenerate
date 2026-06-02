import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './ui/App.vue'
import { i18n } from './i18n'
import { router } from './router'
import './styles.css'

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

