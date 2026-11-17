import { createRouter, createWebHashHistory } from 'vue-router'
import { session } from './lib/session'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true, tabs: false } },
    { path: '/', component: () => import('./views/HomeView.vue') },
    { path: '/research', component: () => import('./views/ResearchView.vue') },
    { path: '/research/:id', component: () => import('./views/ResearchTaskView.vue'), meta: { tabs: false } },
    { path: '/create', component: () => import('./views/CreateView.vue') },
    { path: '/library', component: () => import('./views/LibraryView.vue') },
    { path: '/library/products/:id', component: () => import('./views/ProductFormView.vue'), meta: { tabs: false } },
    { path: '/library/models/:id', component: () => import('./views/ModelFormView.vue'), meta: { tabs: false } },
    { path: '/listings', component: () => import('./views/ListingsView.vue'), meta: { tabs: false } },
    { path: '/listings/:id', component: () => import('./views/ListingFormView.vue'), meta: { tabs: false } },
    { path: '/me', component: () => import('./views/MeView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (_to, _from, saved) => saved || { top: 0 },
})

router.beforeEach((to) => {
  if (!to.meta.public && !session.token) return { path: '/login', query: { next: to.fullPath } }
  if (to.path === '/login' && session.token) return '/'
  return true
})
