import type { Component } from 'vue'
import { isWeb } from './lib/platform'
import { createRouter, createWebHashHistory } from 'vue-router'
import { session } from './lib/session'

/** 网页上原样显示的电脑端页面（window.api 由网页版替身提供） */
const desktopPage = (load: () => Promise<{ default: Component }>) => ({
  component: () => import('./components/web/DesktopPage.vue').then((m) => m.default as Component),
  props: { load },
})

/** 电脑端页面里的跳转路径 → 网页版对应的页面 */
const DESKTOP_PATHS: Array<[string, string]> = [
  ['/home', '/'],
  ['/inbox', '/review'],
  ['/billing', '/membership'],
  ['/settings', '/me'],
  ['/products', '/library?tab=products'],
  ['/models', '/library?tab=models'],
  ['/asset-library', '/assets'],
  ['/live-slicer', '/tools/slice'],
  ['/plugins/live-photo-generator', '/image-to-video'],
  ['/plugins/tiktok-creative-studio', '/creative'],
  ['/plugins/product-image-materials', '/product-images'],
  ['/plugins/product-replacement', '/product-replace'],
  ['/plugins/product-watermark', '/product-watermark'],
  ['/plugins/tiktok-listing-helper', '/listings'],
  ['/plugins/tiktok-gmv-max-optimizer', '/gmv'],
  ['/plugins/tiktok-creator-hub', '/creators'],
  ['/plugins/dianxiaomi-inventory', '/inventory'],
  ['/plugins/video-parser-download', '/tools/download'],
  ['/plugins/video-batch-watermark', '/tools/watermark'],
  ['/plugins/video-batch-subtitle', '/tools/subtitle'],
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true, tabs: false } },
    // Web: 工作台 / 审核收件箱 / 数据复盘 / 账号与会员 are the desktop pages themselves; the App keeps its own.
    isWeb ? { path: '/', ...desktopPage(() => import('@desktop-views/HomeView.vue')) } : { path: '/', component: () => import('./views/HomeView.vue') },
    { path: '/research', component: () => import('./views/ResearchView.vue') },
    { path: '/research/:id', component: () => import('./views/ResearchTaskView.vue'), meta: { tabs: false } },
    { path: '/create', component: () => import('./views/CreateView.vue') },
    { path: '/library', component: () => import('./views/LibraryView.vue') },
    { path: '/library/products/:id', component: () => import('./views/ProductFormView.vue'), meta: { tabs: false } },
    { path: '/library/models/:id', component: () => import('./views/ModelFormView.vue'), meta: { tabs: false } },
    // Web: the desktop 上架助手 page (list / editor tabs, export config, 店小秘 Excel); the App keeps list + form.
    { path: '/listings', component: () => (isWeb ? import('./views/web/WebListings.vue') : import('./views/ListingsView.vue')).then((m) => m.default as Component), meta: { tabs: false } },
    { path: '/listings/:id', component: () => (isWeb ? import('./views/web/WebListings.vue') : import('./views/ListingFormView.vue')).then((m) => m.default as Component), meta: { tabs: false } },
    // Web: the desktop 图生图 tool (split videos into frames → AI variants → material library); the App keeps the quick product-image flow.
    { path: '/product-images', component: () => (isWeb ? import('./views/web/WebImageMaterials.vue') : import('./views/ProductImagesView.vue')).then((m) => m.default as Component), meta: { tabs: false } },
    /** 商品详情「生成深层多角度图」：给一个商品出主图、上身图、特写 */
    { path: '/product-images/angles', component: () => import('./views/ProductImagesView.vue'), meta: { tabs: false } },
    // Web: the desktop 图生视频 flow (reference image + product → replaced image → video); the App keeps the quick product-image flow.
    { path: '/image-to-video', component: () => (isWeb ? import('./views/web/WebLivePhoto.vue') : import('./views/ImageToVideoView.vue')).then((m) => m.default as Component), meta: { tabs: false } },
    isWeb ? { path: '/review', ...desktopPage(() => import('@desktop-views/ReviewInboxView.vue')), meta: { tabs: false } } : { path: '/review', component: () => import('./views/ReviewView.vue'), meta: { tabs: false } },
    { path: '/insights', ...desktopPage(() => import('@desktop-views/InsightsView.vue')), meta: { tabs: false }, beforeEnter: () => (isWeb ? true : '/business?tab=insights') },
    // Web: 复刻 is the desktop page through the computer when it is online (cloud 复刻 when it is not).
    { path: '/clone', component: () => (isWeb ? import('./views/web/WebClone.vue') : import('./views/CloneListView.vue')).then((m) => m.default as Component), meta: { tabs: false } },
    { path: '/clone/cloud', component: () => import('./views/web/WebCloneList.vue').then((m) => m.default as Component), meta: { tabs: false } },
    isWeb
      ? { path: '/clone/:projectId', component: () => import('./views/web/WebCloneProject.vue').then((m) => m.default as Component), meta: { tabs: false } }
      : { path: '/clone/:id', component: () => import('./views/CloneProjectView.vue'), meta: { tabs: false } },
    { path: '/producer', component: () => import('./views/ProducerView.vue'), meta: { tabs: false } },
    // Web: each video tool has its own desktop-style page; the App keeps the shared VideoToolView.
    { path: '/tools/slice', component: () => (isWeb ? import('./views/web/WebLiveSlicer.vue') : import('./views/VideoToolView.vue')).then((m) => m.default as Component), meta: { tabs: false } },
    { path: '/tools/download', component: () => (isWeb ? import('./views/web/WebLinkDownload.vue') : import('./views/VideoToolView.vue')).then((m) => m.default as Component), meta: { tabs: false } },
    { path: '/tools/subtitle', component: () => (isWeb ? import('./views/web/WebBatchSubtitle.vue') : import('./views/VideoToolView.vue')).then((m) => m.default as Component), meta: { tabs: false } },
    { path: '/tools/watermark', component: () => (isWeb ? import('./views/web/WebVideoWatermark.vue') : import('./views/VideoToolView.vue')).then((m) => m.default as Component), meta: { tabs: false } },
    { path: '/tools/:tool', component: () => import('./views/VideoToolView.vue'), meta: { tabs: false } },
    { path: '/publish', component: () => (isWeb ? import('./views/web/WebPublish.vue') : import('./views/PublishView.vue')).then((m) => m.default as Component), meta: { tabs: false } },
    // Web: the desktop GMV Max / 达人中心 pages, run on the user's computer in real time (lib/desktopRelay).
    { path: '/gmv', component: () => (isWeb ? import('./views/web/WebGmvMax.vue') : import('./views/GmvView.vue')).then((m) => m.default as Component), meta: { tabs: false } },
    { path: '/creators', component: () => import('./views/web/WebCreatorHub.vue').then((m) => m.default as Component), meta: { tabs: false }, beforeEnter: () => (isWeb ? true : '/business?tab=creators') },
    { path: '/plugins', redirect: '/toolbox' },
    { path: '/business', component: () => import('./views/BusinessView.vue'), meta: { tabs: false } },
    { path: '/product-replace', component: () => (isWeb ? import('./views/web/WebProductReplace.vue') : import('./views/ProductReplaceView.vue')).then((m) => m.default as Component), meta: { tabs: false } },
    { path: '/product-watermark', component: () => import('./views/ProductWatermarkView.vue'), meta: { tabs: false } },
    { path: '/works', component: () => import('./views/WorksView.vue'), meta: { tabs: false } },
    { path: '/assets', component: () => import('./views/AssetsView.vue'), meta: { tabs: false } },
    { path: '/toolbox', component: () => import('./views/web/WebToolbox.vue'), meta: { tabs: false } },
    { path: '/creative', component: () => (isWeb ? import('./views/web/WebCreative.vue') : import('./views/CreativeView.vue')).then((m) => m.default as Component), meta: { tabs: false } },
    { path: '/tasks', component: () => import('./views/TasksView.vue'), meta: { tabs: false } },
    isWeb ? { path: '/membership', ...desktopPage(() => import('@desktop-views/BillingView.vue')), meta: { tabs: false } } : { path: '/membership', component: () => import('./views/MembershipView.vue'), meta: { tabs: false } },
    { path: '/product-research', name: 'product-research', component: () => import('@desktop-views/ProductResearchView.vue').then((m) => m.default as Component), meta: { tabs: false } },
    { path: '/product-research/:schemeId', name: 'product-research-detail', component: () => import('@desktop-views/ProductResearchDetailView.vue').then((m) => m.default as Component), meta: { tabs: false } },
    { path: '/production', component: () => import('./views/production/ProductionHome.vue'), meta: { tabs: false } },
    { path: '/production/mix/insights', component: () => import('./views/production/ProductionMixInsights.vue').then((m) => m.default as Component), meta: { tabs: false } },
    { path: '/inventory', component: () => import('./views/web/WebInventory.vue').then((m) => m.default as Component), meta: { tabs: false }, beforeEnter: () => (isWeb ? true : '/business?tab=inventory') },
    { path: '/production/pool', component: () => import('./views/production/ProductionPool.vue'), meta: { tabs: false } },
    { path: '/production/mix', component: () => import('./views/production/ProductionMix.vue'), meta: { tabs: false } },
    { path: '/production/tasks', component: () => import('./views/production/ProductionTasks.vue'), meta: { tabs: false } },
    { path: '/templates', component: () => import('./views/TemplatesView.vue'), meta: { tabs: false } },
    { path: '/brand', component: () => import('./views/BrandView.vue'), meta: { tabs: false } },
    { path: '/password', component: () => import('./views/PasswordView.vue'), meta: { tabs: false } },
    { path: '/me', component: () => import('./views/MeView.vue') },
    ...DESKTOP_PATHS.map(([from, to]) => ({ path: from, redirect: to })),
    { path: '/products/:id', redirect: (to: { params: Record<string, unknown> }) => `/library/products/${String(to.params.id)}` },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (_to, _from, saved) => saved || { top: 0 },
})

router.beforeEach((to) => {
  if (!to.meta.public && !session.token) return { path: '/login', query: { next: to.fullPath } }
  if (to.path === '/login' && session.token) return '/'
  return true
})
