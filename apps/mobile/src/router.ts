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
    { path: '/product-images', component: () => import('./views/ProductImagesView.vue'), meta: { tabs: false } },
    { path: '/image-to-video', component: () => import('./views/ImageToVideoView.vue'), meta: { tabs: false } },
    { path: '/review', component: () => import('./views/ReviewView.vue'), meta: { tabs: false } },
    { path: '/clone', component: () => import('./views/CloneListView.vue'), meta: { tabs: false } },
    { path: '/clone/:id', component: () => import('./views/CloneProjectView.vue'), meta: { tabs: false } },
    { path: '/producer', component: () => import('./views/ProducerView.vue'), meta: { tabs: false } },
    { path: '/tools/:tool', component: () => import('./views/VideoToolView.vue'), meta: { tabs: false } },
    { path: '/publish', component: () => import('./views/PublishView.vue'), meta: { tabs: false } },
    { path: '/gmv', component: () => import('./views/GmvView.vue'), meta: { tabs: false } },
    { path: '/business', component: () => import('./views/BusinessView.vue'), meta: { tabs: false } },
    { path: '/product-replace', component: () => import('./views/ProductReplaceView.vue'), meta: { tabs: false } },
    { path: '/product-watermark', component: () => import('./views/ProductWatermarkView.vue'), meta: { tabs: false } },
    { path: '/works', component: () => import('./views/WorksView.vue'), meta: { tabs: false } },
    { path: '/tasks', component: () => import('./views/TasksView.vue'), meta: { tabs: false } },
    { path: '/membership', component: () => import('./views/MembershipView.vue'), meta: { tabs: false } },
    { path: '/password', component: () => import('./views/PasswordView.vue'), meta: { tabs: false } },
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
