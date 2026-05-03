import { createRouter, createWebHashHistory } from 'vue-router'
import { ensureLicensed } from '@/lib/licenseSession'

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
        { path: 'clone', name: 'clone', component: () => import('@/ui/views/CloneView.vue') },
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
  const ok = await ensureLicensed()
  if (!ok) {
    return { name: 'auth', replace: true }
  }
  return true
})

export { router }
