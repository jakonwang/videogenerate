import { createRouter, createWebHashHistory } from 'vue-router'
import MainLayout from '@/ui/MainLayout.vue'
import HomeView from '@/ui/views/HomeView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/auth',
      redirect: { name: 'home' },
    },
    {
      path: '/',
      component: MainLayout,
      children: [
        { path: '', redirect: { name: 'home' } },
        { path: 'home', name: 'home', component: HomeView },
        { path: 'production', name: 'production', component: () => import('@/ui/views/ProductionHomeView.vue') },
        { path: 'production/create', name: 'production-create', component: () => import('@/ui/views/ProductionCreateTaskView.vue') },
        { path: 'production/tasks', name: 'production-tasks', component: () => import('@/ui/views/TasksView.vue') },
        { path: 'production/tasks/:taskId', name: 'production-task-detail', component: () => import('@/ui/views/TaskDetailView.vue') },
        { path: 'models', name: 'models', component: () => import('@/ui/views/ModelLibraryView.vue') },
        { path: 'clone', name: 'clone', component: () => import('@/ui/views/CloneTaskListView.vue') },
        { path: 'clone/:projectId', name: 'clone-project', component: () => import('@/ui/views/CloneView.vue') },
        { path: 'billing', name: 'billing', component: () => import('@/ui/views/BillingView.vue') },
        { path: 'plugins', name: 'plugins', component: () => import('@/ui/views/PluginsView.vue') },
        { path: 'plugins/geelark-publisher', name: 'plugin-geelark-publisher', component: () => import('@/ui/views/GeelarkPublisherView.vue') },
        { path: 'plugins/live-photo-generator', name: 'plugin-live-photo-generator', component: () => import('@/ui/views/LivePhotoGeneratorView.vue') },
        { path: 'plugins/product-image-materials', name: 'plugin-product-image-materials', component: () => import('@/ui/views/ProductImageMaterialsView.vue') },
        { path: 'plugins/tiktok-creative-studio', name: 'plugin-tiktok-creative-studio', component: () => import('@/ui/views/TiktokCreativeStudioView.vue') },
        { path: 'plugins/tiktok-listing-helper', name: 'plugin-tiktok-listing-helper', component: () => import('@/ui/views/TiktokListingHelperView.vue') },
        {
          path: 'plugins/geelark-publisher/publish-center',
          name: 'plugin-geelark-publish-center',
          component: () => import('@/ui/views/GeelarkPublishCenterView.vue'),
        },
        { path: 'plugins/video-parser-download', name: 'plugin-video-parser-download', component: () => import('@/ui/views/PluginWorkspacePlaceholderView.vue') },
        { path: 'plugins/video-batch-watermark', name: 'plugin-video-batch-watermark', component: () => import('@/ui/views/PluginWorkspacePlaceholderView.vue') },
        { path: 'plugins/video-batch-subtitle', name: 'plugin-video-batch-subtitle', component: () => import('@/ui/views/VideoBatchSubtitleView.vue') },
        { path: 'settings', name: 'settings', component: () => import('@/ui/views/SettingsView.vue') },
        { path: 'products', name: 'products', component: () => import('@/ui/views/ProductLibraryView.vue') },
        { path: 'products/:productId', name: 'product-detail', component: () => import('@/ui/views/ProductDetailView.vue') },
        { path: 'templates', name: 'templates', component: () => import('@/ui/views/TemplatesView.vue') },
        { path: 'live-slicer', name: 'live-slicer', component: () => import('@/ui/views/LiveSlicerView.vue') },
        { path: 'tasks', redirect: { name: 'production-tasks' } },
        { path: 'tasks/:taskId', redirect: (to) => ({ name: 'production-task-detail', params: { taskId: to.params.taskId } }) },
      ],
    },
  ],
})

export { router }
