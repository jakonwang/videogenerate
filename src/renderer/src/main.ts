import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './ui/App.vue'
import { i18n } from './i18n'
import { router } from './router'
import './styles.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(i18n)
app.use(router)
app.mount('#app')

