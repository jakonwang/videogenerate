import { createRouter, createWebHistory } from 'vue-router'
import { hasStoredWebToken, validateStoredWebSession } from './services/webApi'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/WebLoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('./views/WebLayout.vue'),
      children: [
        { path: '', redirect: '/clone' },
        { path: 'clone', name: 'clone-list', component: () => import('./views/WebCloneTaskListView.vue') },
        { path: 'clone/:projectId', name: 'clone-detail', component: () => import('./views/WebCloneDetailView.vue') },
        { path: 'billing', name: 'billing', component: () => import('./views/WebBillingView.vue') },
        { path: 'account', name: 'account', component: () => import('./views/WebAccountView.vue') },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  if (!hasStoredWebToken()) return '/login'
  const ok = await validateStoredWebSession()
  if (!ok) return '/login'
  return true
})
