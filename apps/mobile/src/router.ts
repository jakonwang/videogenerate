import { defineAsyncComponent, h, type Component } from 'vue'
import { isWideScreen } from './lib/layout'
import { isWeb } from './lib/platform'
import { createRouter, createWebHashHistory, type LocationQueryRaw } from 'vue-router'
import { cloud, session } from './lib/session'

/**
 * 网页上原样显示的电脑端页面（window.api 由网页版替身提供）。
 * `api`：这个页面专用的网页版接口（lib/desktopApi/*），只在页面打开期间替换 window.api 的对应部分。
 */
const desktopPage = (load: () => Promise<{ default: Component }>, api?: () => Promise<{ default: Record<string, unknown> }>) => ({
  component: () => import('./components/web/DesktopPage.vue').then((m) => m.default as Component),
  props: { load, api },
})

/** 电脑网页显示电脑端页面，手机浏览器显示手机页面 */
const byScreen = (desktop: ReturnType<typeof desktopPage>, phone: () => Promise<{ default: Component }>) => {
  const Desktop = defineAsyncComponent(desktop.component)
  const Phone = defineAsyncComponent(phone)
  return { component: () => (isWideScreen.value ? h(Desktop, desktop.props) : h(Phone)) }
}

/**
 * 批量混剪：网页上电脑在线时显示电脑端页面（WebProductionPage），不在线时显示网页的页面；手机 App 只用网页的页面。
 */
const productionPage = (load: () => Promise<{ default: Component }>, web: () => Promise<{ default: Component }>) =>
  isWeb
    ? { component: () => import('./views/web/WebProductionPage.vue').then((m) => m.default as Component), props: { load, fallback: defineAsyncComponent(web) } }
    : { component: web }

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
  ['/plugins/muse-creative-studio', '/muse'],
  ['/plugins/product-image-materials', '/product-images'],
  ['/plugins/product-replacement', '/product-replace'],
  ['/plugins/product-watermark', '/product-watermark'],
  ['/plugins/tiktok-listing-helper', '/listings'],
  ['/plugins/tiktok-gmv-max-optimizer', '/gmv'],
  ['/plugins/tiktok-creator-hub', '/creators'],
  ['/plugins/dianxiaomi-inventory', '/inventory'],
  ['/plugins/seller-inventory', '/sales'],
  ['/plugins/video-parser-download', '/tools/download'],
  ['/plugins/video-batch-watermark', '/tools/watermark'],
  ['/plugins/video-batch-subtitle', '/tools/subtitle'],
]

/**
 * 网页上的旧商品链接（/library/products/<云端 id>）→ 电脑端商品详情页。详情页按服务器引擎里的商品 id 查找，
 * 同一个商品在引擎里的 id 可能和云端 id 不同：先换算。
 */
async function webProductLink(to: { params: Record<string, unknown> }) {
  const id = String(to.params.id || '')
  if (!id || id === 'new') return '/products'
  const local = await cloud.relay.call<string>('products', 'localIdOf', [id], 'server').catch(() => id)
  return `/products/${encodeURIComponent(local || id)}`
}

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true, tabs: false } },
    // Web: 工作台 / 审核收件箱 / 数据复盘 / 账号与会员 are the desktop pages themselves; the App keeps its own.
    // 手机浏览器用手机首页（电脑页面没有侧边栏，找不到功能入口）
    isWeb
      ? { path: '/', ...byScreen(desktopPage(() => import('@desktop-views/HomeView.vue')), () => import('./views/HomeView.vue')) }
      : { path: '/', component: () => import('./views/HomeView.vue') },
    { path: '/research', component: () => import('./views/ResearchView.vue') },
    { path: '/research/:id', component: () => import('./views/ResearchTaskView.vue'), meta: { tabs: false } },
    { path: '/create', component: () => import('./views/CreateView.vue') },
    // Web: 商品库 / 模特库 are the desktop pages themselves (/products, /models); the old library links lead there.
    { path: '/library', component: () => import('./views/LibraryView.vue'), beforeEnter: (to: { query: Record<string, unknown> }) => (!isWeb ? true : to.query.tab === 'models' ? '/models' : '/products') },
    isWeb
      ? { path: '/library/products/:id', component: () => import('./views/LibraryView.vue'), beforeEnter: webProductLink }
      : { path: '/library/products/:id', component: () => import('./views/ProductFormView.vue'), meta: { tabs: false } },
    // Web: the desktop 商品库 / 商品详情 pages; products live in the server engine (lib/desktopApi/products).
    ...(isWeb
      ? [
          { path: '/products', name: 'products', ...desktopPage(() => import('@desktop-views/ProductLibraryView.vue'), () => import('./lib/desktopApi/products')), meta: { tabs: false } },
          { path: '/products/:productId', name: 'product-detail', ...desktopPage(() => import('@desktop-views/ProductDetailView.vue'), () => import('./lib/desktopApi/products')), meta: { tabs: false } },
        ]
      : []),
    isWeb
      ? { path: '/library/models/:id', redirect: '/models' }
      : { path: '/library/models/:id', component: () => import('./views/ModelFormView.vue'), meta: { tabs: false } },
    // Web: the desktop 模特库 page itself; model methods run on the server engine (lib/desktopApi/models only covers the keys).
    ...(isWeb ? [{ path: '/models', ...desktopPage(() => import('@desktop-views/ModelLibraryView.vue'), () => import('./lib/desktopApi/models')), meta: { tabs: false } }] : []),
    // Web: the desktop 上架助手 page (list / editor tabs, export config, 店小秘 Excel); the App keeps list + form.
    // Web: the desktop 上架助手 page itself, backed by the web tiktokListing API (cloud generation, Excel in the browser).
    isWeb
      ? { path: '/listings', ...desktopPage(() => import('@desktop-views/TiktokListingHelperView.vue'), () => import('./lib/desktopApi/tiktokListing')), meta: { tabs: false } }
      : { path: '/listings', component: () => import('./views/ListingsView.vue'), meta: { tabs: false } },
    isWeb
      ? { path: '/listings/:id', redirect: (to: { params: Record<string, unknown> }) => ({ path: '/listings', query: to.params.id === 'new' ? {} : { id: String(to.params.id) } }) }
      : { path: '/listings/:id', component: () => import('./views/ListingFormView.vue'), meta: { tabs: false } },
    // Web: the desktop 图生图 tool (split videos into frames → AI variants → material library); the App keeps the quick product-image flow.
    // Web: the desktop 商品图片素材 (图生图) page itself, backed by the web productImageMaterials API (cloud frames / variants).
    isWeb
      ? { path: '/product-images', ...desktopPage(() => import('@desktop-views/ProductImageMaterialsView.vue'), () => import('./lib/desktopApi/productImageMaterials')), meta: { tabs: false } }
      : { path: '/product-images', component: () => import('./views/ProductImagesView.vue'), meta: { tabs: false } },
    /** 商品详情「生成深层多角度图」：给一个商品出主图、上身图、特写 */
    { path: '/product-images/angles', component: () => import('./views/ProductImagesView.vue'), meta: { tabs: false } },
    // Web: the desktop 图生视频 flow (reference image + product → replaced image → video); the App keeps the quick product-image flow.
    // Web: the desktop 图生视频 page itself, run on the server engine (services/cloud/engine/cloneWorker.ts) like 复刻.
    isWeb
      ? { path: '/image-to-video', ...desktopPage(() => import('@desktop-views/LivePhotoGeneratorView.vue'), () => import('./lib/desktopApi/livePhoto')), meta: { tabs: false } }
      : { path: '/image-to-video', component: () => import('./views/ImageToVideoView.vue'), meta: { tabs: false } },
    isWeb ? { path: '/review', ...desktopPage(() => import('@desktop-views/ReviewInboxView.vue')), meta: { tabs: false } } : { path: '/review', component: () => import('./views/ReviewView.vue'), meta: { tabs: false } },
    { path: '/insights', ...desktopPage(() => import('@desktop-views/InsightsView.vue')), meta: { tabs: false }, beforeEnter: () => (isWeb ? true : '/business?tab=insights') },
    // Web: 复刻 is the desktop page through the computer when it is online (cloud 复刻 when it is not).
    { path: '/clone', component: isWeb ? () => import('./views/web/WebClone.vue') : () => import('./views/CloneListView.vue'), meta: { tabs: false } },
    { path: '/clone/cloud', component: () => import('./views/web/WebCloneList.vue').then((m) => m.default as Component), meta: { tabs: false } },
    isWeb
      ? { path: '/clone/:projectId', component: () => import('./views/web/WebCloneProject.vue').then((m) => m.default as Component), meta: { tabs: false } }
      : { path: '/clone/:id', component: () => import('./views/CloneProjectView.vue'), meta: { tabs: false } },
    { path: '/producer', component: () => import('./views/ProducerView.vue'), meta: { tabs: false } },
    // Web: each video tool has its own desktop-style page; the App keeps the shared VideoToolView.
    // Web: the desktop 直播切片 page itself, backed by the web liveSlicer API (cloud analyze / export).
    isWeb
      ? { path: '/tools/slice', ...desktopPage(() => import('@desktop-views/LiveSlicerView.vue'), () => import('./lib/desktopApi/liveSlicer')), meta: { tabs: false } }
      : { path: '/tools/slice', component: () => import('./views/VideoToolView.vue'), meta: { tabs: false } },
    // Web: the desktop 视频解析下载 page itself, backed by the web videoParserDownload API (cloud TikHub download).
    isWeb
      ? { path: '/tools/download', ...desktopPage(() => import('@desktop-views/VideoParserDownloadView.vue'), () => import('./lib/desktopApi/videoParserDownload')), meta: { tabs: false } }
      : { path: '/tools/download', component: () => import('./views/VideoToolView.vue'), meta: { tabs: false } },
    // Web: the desktop 视频批量字幕 page itself; its local Web API calls run on the server engine (Remotion rendering there).
    isWeb
      ? { path: '/tools/subtitle', ...desktopPage(() => import('@desktop-views/VideoBatchSubtitleView.vue'), () => import('./lib/desktopApi/batchSubtitle')), meta: { tabs: false } }
      : { path: '/tools/subtitle', component: () => import('./views/VideoToolView.vue'), meta: { tabs: false } },
    // Web: the desktop 视频批量水印 page itself, backed by the web videoWatermark API (cloud ffmpeg queue).
    isWeb
      ? { path: '/tools/watermark', ...desktopPage(() => import('@desktop-views/VideoBatchWatermarkView.vue'), () => import('./lib/desktopApi/videoWatermark')), meta: { tabs: false } }
      : { path: '/tools/watermark', component: () => import('./views/VideoToolView.vue'), meta: { tabs: false } },
    { path: '/tools/:tool', component: () => import('./views/VideoToolView.vue'), meta: { tabs: false } },
    { path: '/publish', component: isWeb ? () => import('./views/web/WebPublish.vue') : () => import('./views/PublishView.vue'), meta: { tabs: false } },
    // Web: the desktop GMV Max / 达人中心 pages, run on the user's computer in real time (lib/desktopRelay).
    { path: '/gmv', component: isWeb ? () => import('./views/web/WebGmvMax.vue') : () => import('./views/GmvView.vue'), meta: { tabs: false } },
    { path: '/creators', component: () => import('./views/web/WebCreatorHub.vue').then((m) => m.default as Component), meta: { tabs: false }, beforeEnter: () => (isWeb ? true : '/business?tab=creators') },
    { path: '/plugins', redirect: '/toolbox' },
    { path: '/business', component: () => import('./views/BusinessView.vue'), meta: { tabs: false } },
    // Web: the desktop 商品替换 page itself, backed by the web productReplacement API (cloud generation); the App keeps its own.
    isWeb
      ? { path: '/product-replace', ...desktopPage(() => import('@desktop-views/ProductReplacementView.vue'), () => import('./lib/desktopApi/productReplacement')), meta: { tabs: false } }
      : { path: '/product-replace', component: () => import('./views/ProductReplaceView.vue'), meta: { tabs: false } },
    // Web: the desktop 商品图水印 page itself, backed by the web productWatermark API (canvas in the browser); the App keeps its own.
    isWeb
      ? { path: '/product-watermark', ...desktopPage(() => import('@desktop-views/ProductWatermarkView.vue'), () => import('./lib/desktopApi/productWatermark')), meta: { tabs: false } }
      : { path: '/product-watermark', component: () => import('./views/ProductWatermarkView.vue'), meta: { tabs: false } },
    // AI 修图 · 批量换景：电脑网页是电脑端页面（批次在云端），手机 App 和手机浏览器用手机页面
    isWeb
      ? { path: '/garment-studio', ...desktopPage(() => import('@desktop-views/GarmentStudioView.vue'), () => import('./lib/desktopApi/sceneSwap')), meta: { tabs: false }, beforeEnter: (to: { query: LocationQueryRaw }) => isWideScreen.value || { path: '/scene-swap', query: to.query } }
      : { path: '/garment-studio', redirect: '/scene-swap' },
    { path: '/scene-swap', component: () => import('./views/SceneSwapView.vue'), meta: { tabs: false }, beforeEnter: (to: { query: LocationQueryRaw }) => (isWeb && isWideScreen.value ? { path: '/garment-studio', query: to.query } : true) },
    { path: '/works', component: () => import('./views/WorksView.vue'), meta: { tabs: false } },
    // Web: the desktop 素材库 page itself, backed by the web assetLibrary API (cloud assets; images and videos only).
    isWeb
      ? { path: '/assets', ...desktopPage(() => import('@desktop-views/AssetLibraryView.vue'), () => import('./lib/desktopApi/assetLibrary')), meta: { tabs: false } }
      : { path: '/assets', component: () => import('./views/AssetsView.vue'), meta: { tabs: false } },
    { path: '/toolbox', component: () => import('./views/web/WebToolbox.vue'), meta: { tabs: false } },
    // Web: the desktop tk创意室 page through the computer when it is online (the web order form when it is not).
    { path: '/creative', component: isWeb ? () => import('./views/web/WebCreativeStudio.vue') : () => import('./views/CreativeView.vue'), meta: { tabs: false } },
    { path: '/muse', component: isWeb ? () => import('./views/web/WebMuseStudio.vue') : () => import('./views/MuseView.vue'), meta: { tabs: false } },
    { path: '/tasks', component: () => import('./views/TasksView.vue'), meta: { tabs: false } },
    isWeb ? { path: '/membership', ...desktopPage(() => import('@desktop-views/BillingView.vue')), meta: { tabs: false } } : { path: '/membership', component: () => import('./views/MembershipView.vue'), meta: { tabs: false } },
    { path: '/product-research', name: 'product-research', component: () => import('@desktop-views/ProductResearchView.vue').then((m) => m.default as Component), meta: { tabs: false } },
    { path: '/product-research/:schemeId', name: 'product-research-detail', component: () => import('@desktop-views/ProductResearchDetailView.vue').then((m) => m.default as Component), meta: { tabs: false } },
    // Web: the desktop 批量混剪 pages through the computer when it is online (the web pages when it is not).
    { path: '/production', ...productionPage(() => import('@desktop-views/ProductionHomeView.vue'), () => import('./views/production/ProductionHome.vue')), meta: { tabs: false } },
    ...(isWeb
      ? [
          { path: '/production/create', ...productionPage(() => import('@desktop-views/ProductionCreateTaskView.vue'), () => import('./views/production/ProductionMix.vue')), meta: { tabs: false } },
          { path: '/production/tasks/:taskId', ...productionPage(() => import('@desktop-views/TaskDetailView.vue'), () => import('./views/production/ProductionTasks.vue')), meta: { tabs: false } },
        ]
      : []),
    { path: '/production/mix/insights', component: () => import('./views/production/ProductionMixInsights.vue').then((m) => m.default as Component), meta: { tabs: false } },
    { path: '/shops', component: () => import('./views/web/WebShops.vue').then((m) => m.default as Component), meta: { tabs: false }, beforeEnter: () => (isWeb ? true : '/business?tab=shops') },
    { path: '/shops/:shopKey', component: () => import('./views/web/WebShops.vue').then((m) => m.default as Component), props: { detail: true }, meta: { tabs: false }, beforeEnter: () => (isWeb ? true : '/business?tab=shops') },
    { path: '/sales', component: () => import('./views/web/WebSales.vue').then((m) => m.default as Component), meta: { tabs: false }, beforeEnter: () => (isWeb ? true : '/business?tab=shops') },
    { path: '/inventory', component: () => import('./views/web/WebInventory.vue').then((m) => m.default as Component), meta: { tabs: false }, beforeEnter: () => (isWeb ? true : '/business?tab=inventory') },
    { path: '/production/pool', ...productionPage(() => import('@desktop-views/ProductionClipPoolView.vue'), () => import('./views/production/ProductionPool.vue')), meta: { tabs: false } },
    { path: '/production/mix', ...productionPage(() => import('@desktop-views/ProductionMixStudioView.vue'), () => import('./views/production/ProductionMix.vue')), meta: { tabs: false } },
    { path: '/production/tasks', ...productionPage(() => import('@desktop-views/TasksView.vue'), () => import('./views/production/ProductionTasks.vue')), meta: { tabs: false } },
    // Web: the desktop 模板库 page itself; templates live in the server engine and sync with the computer (lib/desktopApi/templates).
    isWeb
      ? { path: '/templates', ...desktopPage(() => import('@desktop-views/TemplatesView.vue'), () => import('./lib/desktopApi/templates')), meta: { tabs: false } }
      : { path: '/templates', component: () => import('./views/TemplatesView.vue'), meta: { tabs: false } },
    { path: '/brand', component: () => import('./views/BrandView.vue'), meta: { tabs: false } },
    { path: '/password', component: () => import('./views/PasswordView.vue'), meta: { tabs: false } },
    { path: '/me', component: () => import('./views/MeView.vue') },
    ...DESKTOP_PATHS.filter(([from]) => !(isWeb && (from === '/models' || from === '/products'))).map(([from, to]) => ({ path: from, redirect: to })),
    ...(isWeb ? [] : [{ path: '/products/:id', redirect: (to: { params: Record<string, unknown> }) => `/library/products/${String(to.params.id)}` }]),
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (_to, _from, saved) => saved || { top: 0 },
})

router.beforeEach((to) => {
  if (!to.meta.public && !session.token) return { path: '/login', query: { next: to.fullPath } }
  if (to.path === '/login' && session.token) return '/'
  return true
})
