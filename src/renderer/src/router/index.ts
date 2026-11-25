import { createRouter, createWebHashHistory } from "vue-router";
import MainLayout from "@/ui/MainLayout.vue";
import HomeView from "@/ui/views/HomeView.vue";
import { featureForPath, useCloudAuthStore } from "@/stores/cloudAuth";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/auth",
      redirect: { name: "home" },
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/ui/views/CloudLoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/",
      component: MainLayout,
      children: [
        { path: "", redirect: { name: "home" } },
        { path: "home", name: "home", component: HomeView },
        {
          path: "inbox",
          name: "inbox",
          component: () => import("@/ui/views/ReviewInboxView.vue"),
        },
        {
          path: "insights",
          name: "insights",
          component: () => import("@/ui/views/InsightsView.vue"),
        },
        {
          path: "product-research",
          name: "product-research",
          component: () => import("@/ui/views/ProductResearchView.vue"),
        },
        {
          path: "product-research/:schemeId",
          name: "product-research-detail",
          component: () => import("@/ui/views/ProductResearchDetailView.vue"),
        },
        {
          path: "production",
          name: "production",
          component: () => import("@/ui/views/ProductionHomeView.vue"),
        },
        {
          path: "production/create",
          name: "production-create",
          component: () => import("@/ui/views/ProductionCreateTaskView.vue"),
        },
        {
          path: "production/mix/insights",
          name: "production-mix-insights",
          component: () => import("@/ui/views/ProductionMixInsightsView.vue"),
        },
        {
          path: "production/mix",
          name: "production-mix",
          component: () => import("@/ui/views/ProductionMixStudioView.vue"),
        },
        {
          path: "production/pool",
          name: "production-pool",
          component: () => import("@/ui/views/ProductionClipPoolView.vue"),
        },
        {
          path: "production/tasks",
          name: "production-tasks",
          component: () => import("@/ui/views/TasksView.vue"),
        },
        {
          path: "production/tasks/:taskId",
          name: "production-task-detail",
          component: () => import("@/ui/views/TaskDetailView.vue"),
        },
        {
          path: "models",
          name: "models",
          component: () => import("@/ui/views/ModelLibraryView.vue"),
        },
        {
          path: "asset-library",
          name: "asset-library",
          component: () => import("@/ui/views/AssetLibraryView.vue"),
        },
        {
          path: "clone",
          name: "clone",
          component: () => import("@/ui/views/CloneTaskListView.vue"),
        },
        {
          path: "clone/:projectId",
          name: "clone-project",
          component: () => import("@/ui/views/CloneView.vue"),
        },
        {
          path: "billing",
          name: "billing",
          component: () => import("@/ui/views/BillingView.vue"),
        },
        {
          path: "plugins",
          name: "plugins",
          component: () => import("@/ui/views/PluginsView.vue"),
        },
        {
          path: "plugins/live-photo-generator",
          name: "plugin-live-photo-generator",
          component: () => import("@/ui/views/LivePhotoGeneratorView.vue"),
        },
        {
          path: "plugins/product-image-materials",
          name: "plugin-product-image-materials",
          component: () => import("@/ui/views/ProductImageMaterialsView.vue"),
        },
        {
          path: "garment-studio",
          name: "garment-studio",
          component: () => import("@/ui/views/GarmentStudioView.vue"),
        },
        {
          path: "plugins/product-replacement",
          name: "plugin-product-replacement",
          component: () => import("@/ui/views/ProductReplacementView.vue"),
        },
        {
          path: "plugins/product-watermark",
          name: "plugin-product-watermark",
          component: () => import("@/ui/views/ProductWatermarkView.vue"),
        },
        {
          path: "shops",
          name: "shops",
          component: () => import("@/ui/views/ShopsView.vue"),
        },
        {
          path: "shops/:shopKey",
          name: "shop-detail",
          component: () => import("@/ui/views/ShopDetailView.vue"),
        },
        {
          path: "plugins/seller-inventory",
          name: "plugin-seller-inventory",
          component: () => import("@/ui/views/SellerInventoryView.vue"),
        },
        {
          path: "plugins/dianxiaomi-inventory",
          name: "plugin-dianxiaomi-inventory",
          component: () => import("@/ui/views/DianxiaomiInventoryView.vue"),
        },
        {
          path: "plugins/tiktok-creative-studio",
          name: "plugin-tiktok-creative-studio",
          component: () => import("@/ui/views/TiktokCreativeStudioView.vue"),
        },
        {
          path: "plugins/muse-creative-studio",
          name: "plugin-muse-creative-studio",
          component: () => import("@/ui/views/MuseCreativeStudioView.vue"),
        },
        {
          path: "plugins/tiktok-creator-hub",
          name: "plugin-tiktok-creator-hub",
          component: () => import("@/ui/views/TiktokCreatorHubView.vue"),
        },
        {
          path: "publish",
          name: "publish",
          component: () => import("@/ui/views/TiktokBatchPublisherView.vue"),
        },
        {
          path: "plugins/tiktok-listing-helper",
          name: "plugin-tiktok-listing-helper",
          component: () => import("@/ui/views/TiktokListingHelperView.vue"),
        },
        {
          path: "plugins/tiktok-gmv-max-optimizer",
          name: "plugin-tiktok-gmv-max-optimizer",
          component: () => import("@/ui/views/TiktokGmvMaxOptimizerView.vue"),
        },
        {
          path: "plugins/video-parser-download",
          name: "plugin-video-parser-download",
          component: () => import("@/ui/views/VideoParserDownloadView.vue"),
        },
        {
          path: "plugins/video-batch-watermark",
          name: "plugin-video-batch-watermark",
          component: () => import("@/ui/views/VideoBatchWatermarkView.vue"),
        },
        {
          path: "plugins/video-batch-subtitle",
          name: "plugin-video-batch-subtitle",
          component: () => import("@/ui/views/VideoBatchSubtitleView.vue"),
        },
        {
          path: "settings",
          name: "settings",
          component: () => import("@/ui/views/SettingsView.vue"),
        },
        {
          path: "products",
          name: "products",
          component: () => import("@/ui/views/ProductLibraryView.vue"),
        },
        {
          path: "products/:productId",
          name: "product-detail",
          component: () => import("@/ui/views/ProductDetailView.vue"),
        },
        {
          path: "templates",
          name: "templates",
          component: () => import("@/ui/views/TemplatesView.vue"),
        },
        {
          path: "live-slicer",
          name: "live-slicer",
          component: () => import("@/ui/views/LiveSlicerView.vue"),
        },
        { path: "tasks", redirect: { name: "production-tasks" } },
        {
          path: "tasks/:taskId",
          redirect: (to) => ({
            name: "production-task-detail",
            params: { taskId: to.params.taskId },
          }),
        },
      ],
    },
  ],
});

/**
 * 商业版授权守卫：未登录 / 会员无效 → 登录页；套餐不含该功能 → 会员页。
 * 真正的限制在主进程（IPC 与本地 API 守卫），这里负责引导用户。
 */
router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const cloudAuth = useCloudAuthStore();
  const status = await cloudAuth.ensureLoaded();
  if (status.mode !== "enforced") return true;
  if (!status.licensed) return { name: "login", query: { next: to.fullPath } };
  if (to.name !== "billing" && !cloudAuth.hasFeature(featureForPath(to.path))) {
    return { name: "billing", query: { feature: featureForPath(to.path) ?? "" } };
  }
  return true;
});

export { router };

