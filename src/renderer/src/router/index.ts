import { createRouter, createWebHashHistory } from 'vue-router'
import { validateStoredWebSession } from '@/lib/webApiClient'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/auth',
      name: 'auth',
      component: () => import('@/ui/views/AuthView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/ui/MainLayout.vue'),
      meta: { requiresLicense: true },
      children: [
        { path: '', redirect: { name: 'home' } },
        { path: 'home', name: 'home', component: () => import('@/ui/views/HomeView.vue') },
        { path: 'production', name: 'production', redirect: { name: 'products' } },
        { path: 'models', name: 'models', component: () => import('@/ui/views/ModelLibraryView.vue') },
        { path: 'clone', name: 'clone', component: () => import('@/ui/views/CloneTaskListView.vue') },
        { path: 'clone/:projectId', name: 'clone-project', component: () => import('@/ui/views/CloneView.vue') },
        { path: 'billing', name: 'billing', component: () => import('@/ui/views/BillingView.vue') },
        { path: 'plugins', name: 'plugins', component: () => import('@/ui/views/PluginsView.vue') },
        { path: 'plugins/geelark-publisher', name: 'plugin-geelark-publisher', component: () => import('@/ui/views/GeelarkPublisherView.vue') },
        {
          path: 'plugins/geelark-publisher/publish-center',
          name: 'plugin-geelark-publish-center',
          component: () => import('@/ui/views/GeelarkPublishCenterView.vue'),
        },
        { path: 'plugins/video-parser-download', name: 'plugin-video-parser-download', component: () => import('@/ui/views/PluginWorkspacePlaceholderView.vue') },
        { path: 'plugins/video-batch-watermark', name: 'plugin-video-batch-watermark', component: () => import('@/ui/views/PluginWorkspacePlaceholderView.vue') },
        { path: 'plugins/video-batch-subtitle', name: 'plugin-video-batch-subtitle', component: () => import('@/ui/views/VideoBatchSubtitleView.vue') },
        { path: 'settings', name: 'settings', component: () => import('@/ui/views/SettingsView.vue') },
        { path: 'products', name: 'products', component: () => import('@/ui/views/ProductsView.vue') },
        { path: 'templates', name: 'templates', component: () => import('@/ui/views/TemplatesView.vue') },
        { path: 'live-slicer', name: 'live-slicer', component: () => import('@/ui/views/LiveSlicerView.vue') },
        { path: 'tasks', name: 'tasks', component: () => import('@/ui/views/TasksView.vue') },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  if (await validateStoredWebSession()) return true
  return { name: 'auth', replace: true }
})

export { router }
