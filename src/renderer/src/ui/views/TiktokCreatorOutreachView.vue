<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  Check,
  Copy,
  ChevronRight,
  ExternalLink,
  History,
  LayoutDashboard,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from "lucide-vue-next";

type Account = {
  id: string;
  name: string;
  shopRegion: string;
  shopId: string;
  storeType?: "cross_border" | "local";
  affiliateHost?: string;
};
type Creator = {
  id: string;
  name: string;
  followers?: string;
  gmv?: string;
  selected?: boolean;
  invited?: boolean;
};
type Batch = {
  index: number;
  total: number;
  creatorIds: string[];
  creatorNames?: string[];
};
type ShopProduct = {
  id: string;
  name: string;
  status?: string;
  skuCount?: number;
};

const { t, locale } = useI18n();
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function friendlyError(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  if (code.includes("OUTREACH_SHOP_NOT_AUTHORIZED")) {
    return t("tiktokCreatorOutreach.errors.shopNotAuthorized");
  }
  if (code.includes("OUTREACH_API_CREDENTIALS_NOT_CONFIGURED")) {
    return t("tiktokCreatorOutreach.errors.apiNotConfigured");
  }
  if (code.includes("OUTREACH_APP_KEY_INVALID")) {
    return t("tiktokCreatorOutreach.errors.invalidAppKey");
  }
  if (code.includes("OUTREACH_REDIRECT_URI_INVALID")) {
    return t("tiktokCreatorOutreach.errors.invalidCallback");
  }
  if (code.includes("OUTREACH_APP_SECRET_REQUIRED")) {
    return t("tiktokCreatorOutreach.errors.appSecretRequired");
  }
  if (code.includes("OUTREACH_OAUTH_SHOP_MISMATCH")) {
    return t("tiktokCreatorOutreach.errors.shopNotAuthorized");
  }
  if (code.includes("OUTREACH_OAUTH_REGION_MISMATCH")) {
    return t("tiktokCreatorOutreach.errors.shopNotAuthorized");
  }
  if (code.includes("OUTREACH_OAUTH_MARKET_UNAVAILABLE")) {
    return t("tiktokCreatorOutreach.errors.shopNotAuthorized");
  }
  if (code.includes("OUTREACH_OAUTH_FAILED")) {
    return t("tiktokCreatorOutreach.errors.shopNotAuthorized");
  }
  return code;
}
async function copyCallbackUrl() {
  await navigator.clipboard.writeText(apiForm.value.redirectUri);
  notice.value = uiCopy.value.callbackCopied;
}
const activeTab = ref<
  "overview" | "creators" | "library" | "campaign" | "messages" | "activity" | "stats" | "settings"
>("overview");

const accounts = ref<Account[]>([]);
const accountId = ref("");
const creators = ref<Creator[]>([]);
const template = ref(
  "Hi {{creatorName}}, we would love to work with you on {{productName}}.",
);
const action = ref<"invite" | "message">("invite");
const productName = ref("");
const invitationForm = ref({
  name: "",
  expiresAt: "",
  contentType: "video",
  productIds: "",
  commissionRate: "",
  adCommissionRate: "",
});
const notice = ref("");
const errorText = ref("");
const loading = ref(false);
const savingAccount = ref(false);
const showAccountModal = ref(false);
const accountForm = ref({
  name: "",
  shopRegion: "VN",
  shopId: "",
  storeType: "local" as "cross_border" | "local",
});
const authState = ref<"unknown" | "connected" | "signed-out">("unknown");
const apiConfigured = ref(false);
const appSecretSaved = ref(false);
const apiForm = ref({
  appKey: "",
  appSecret: "",
  redirectUri: "",
  apiBaseUrl: "https://open-api.tiktokglobalshop.com",
  apiVersion: "202508",
});
const apiBusy = ref(false);
const filterForm = ref({
  keyword: "",
  category: "",
  language: "",
  agency: "",
  minFollowers: "",
  minCommission: "",
  creatorStar: false,
  notContactedDays: "90",
});
const shopProducts = ref<ShopProduct[]>([]);
const productSearch = ref("");
const productsLoading = ref(false);
const creatorFilterOptions = ref<{
  categories: string[];
  languages: string[];
  agencies: string[];
}>({ categories: [], languages: [], agencies: [] });
const quota = ref<{ used?: number; total?: number; remaining?: number } | null>(
  null,
);
const inboxCounts = ref<Record<string, unknown> | null>(null);
const audits = ref<any[]>([]);
const dashboardBusy = ref(false);
const preview = ref<{
  campaignId?: string;
  count: number;
  body: string;
  requiresConfirmation: boolean;
} | null>(null);
const targetCount = ref(50);
const batchSize = ref(50);
const batches = ref<Batch[]>([]);
const batchCursor = ref(0);
const invitedOnly = ref(true);
const creatorSource = ref<"marketplace" | "specified" | "library">("marketplace");
const specifiedCreators = ref("");
const outreachTasks = ref<any[]>([]);
const activeTask = ref<any | null>(null);
const statistics = ref({ total: 0, success: 0, failed: 0, skipped: 0, inviteAcceptanceRate: 0, messageSuccessRate: 0, taskCount: 0 });
const regionOptions = [
  { code: "VN", name: "Vietnam" },
  { code: "US", name: "United States" },
  { code: "UK", name: "United Kingdom" },
  { code: "TH", name: "Thailand" },
  { code: "MY", name: "Malaysia" },
  { code: "PH", name: "Philippines" },
  { code: "SG", name: "Singapore" },
  { code: "ID", name: "Indonesia" },
];
const affiliateLoginUrl = computed(
  () =>
    `https://affiliate.tiktok.com/affiliate/creator?shop_region=${encodeURIComponent(accountForm.value.shopRegion)}&shop_id=${encodeURIComponent(accountForm.value.shopId || "<SHOP_ID>")}`,
);
function buildSystemAffiliateUrl(path = "platform/homepage") {
  const account = currentAccount.value;
  if (!account) return "";
  const params = new URLSearchParams({
    shop_region: account.shopRegion,
    tab: "0",
    shop_id: account.shopId,
  });
  return `https://affiliate.tiktok.com/affiliate/${path.replace(/^\/+/, "")}?${params.toString()}`;
}

const selected = computed(() => creators.value.filter((item) => item.selected));
const invitedCreators = computed(() =>
  creators.value.filter((item) => item.invited),
);
const currentAccount = computed(() =>
  accounts.value.find((item) => item.id === accountId.value),
);
const currentBatch = computed(() => batches.value[batchCursor.value]);
const eligibleCount = computed(() =>
  action.value === "message" && invitedOnly.value
    ? invitedCreators.value.length
    : selected.value.length,
);
const selectedProductIds = computed(() =>
  invitationForm.value.productIds
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean),
);
const filteredProducts = computed(() => {
  const query = productSearch.value.trim().toLowerCase();
  if (!query) return shopProducts.value;
  return shopProducts.value.filter((item) =>
    `${item.id} ${item.name}`.toLowerCase().includes(query),
  );
});
const uiCopy = computed(() =>
  locale.value.startsWith("zh")
    ? {
        catalog: "商品目录",
        libraryKicker: "达人资产", libraryTitle: "我的达人库", libraryHint: "复用已保存达人，统一管理标签、备注和建联状态。", noLibraryData: "暂无已保存达人", statsKicker: "数据中心", statsTitle: "建联统计", statsTotal: "任务达人总数", statsSuccess: "成功建联人数", statsInviteRate: "邀约成功率", statsMessageRate: "私信成功率",
        searchProducts: "搜索商品名称或 ID",
        loadingProducts: "正在加载商品",
        noProducts: "暂无可用商品",
        productLimit: "最多选择 100 个商品",
        shops: "店铺",
        marketplace: "达人筛选",
        creatorList: "达人列表",
        quickStart: "快速开始",
        shopConnections: "店铺连接",
        noShop: "未连接店铺",
        connectHint: "添加 TikTok Shop 店铺开始操作。",
        connectShop: "连接店铺",
        applyFilters: "应用筛选",
        keyword: "关键词",
        category: "类目",
        language: "语言",
        agency: "机构",
        allCategories: "全部类目",
        allLanguages: "全部语言",
        allAgencies: "全部机构",
        minFollowers: "最低粉丝数",
        minCommission: "最低佣金",
        creatorStar: "仅 Creator Star",
        notContacted: "90 天内未联系",
        findCreators: "精准查找达人",
        creatorCount: "加载达人数据",
        readPage: "读取达人",
        reading: "读取中...",
        startTitle: "从官方达人页面开始",
        startHint: "打开达人发现页，然后将结果读取到工作台。",
        openDiscover: "打开达人发现页",
        selectAll: "全选",
        selected: "已选择",
        invited: "已邀约",
        creator: "达人",
        followers: "粉丝",
        gmv: "GMV",
        state: "状态",
        discover: "待发现",
        accounts: "账号",
        addAccount: "添加账号",
        removeAccount: "移除账号",
        authorizeShop: "授权店铺",
        checkingAuth: "正在检查授权",
        accountsKicker: "账号",
        filtersKicker: "达人筛选",
        listKicker: "达人列表",
        batchKicker: "批次构建器",
        countryRegion: "国家/地区",
        storeType: "店铺类型",
        shopId: "店铺 ID",
        affiliateUrl: "达人后台地址",
        officialHint: "登录使用官方达人后台地址。",
        cancel: "取消",
        adding: "添加中...",
        creatorPlaceholder: "达人名称或领域",
        accountName: "账号名称",
        accountPlaceholder: "越南旗舰店",
        video: "视频",
        live: "直播",
        both: "视频和直播",
        productPlaceholder: "商品 ID，例如 product_1",
        appKey: "App Key",
        appKeyHint: "在 TikTok Partner Center 创建应用后获取的 App Key。",
        appSecret: "App Secret",
        appSecretHint: "用于签名和店铺授权的应用密钥。",
        appSecretSaved: "已加密保存，可留空以继续使用",
        callbackUrl: "OAuth 回调地址",
        callbackHint: "必须与 Partner Center 应用设置中的 HTTPS 地址完全一致。",
        callbackCopied: "已复制回调地址",
        copy: "复制",
        callbackGuide: "请先上传 examples/tiktok-affiliate-oauth-callback/index.html 到你的 HTTPS 网站，再把完整网址填入这里。该网址必须与 Partner Center 中注册的地址完全一致。示例：",
        baseUrl: "API 基础地址",
        baseUrlHint: "TikTok Partner Center 的开放平台 API 地址。",
        apiVersion: "API 版本",
        apiVersionHint: "当前应用使用的 Affiliate API 版本。",
        apiSettingsHint: "配置 TikTok Partner Center API，用于达人授权、数据同步和邀约管理。",
          confirmTask: "确认任务",
          confirmTaskPrompt: "确认这个包含 {count} 位达人的任务？确认后才允许提交官方 API 请求。",
          taskConfirmed: "已确认",
      }
    : locale.value.startsWith("vi")
      ? {
          catalog: "Danh muc san pham",
          libraryKicker: "Tai san nha sang tao", libraryTitle: "Thu vien cua toi", libraryHint: "Tai su dung nha sang tao da luu va quan ly nhan, ghi chu, trang thai.", noLibraryData: "Chua co nha sang tao da luu", statsKicker: "Phan tich", statsTitle: "Thong ke ket noi", statsTotal: "Nha sang tao trong nhiem vu", statsSuccess: "Ket noi thanh cong", statsInviteRate: "Ty le moi thanh cong", statsMessageRate: "Ty le nhan tin thanh cong",
          searchProducts: "Tim ten hoac ID san pham",
          loadingProducts: "Dang tai san pham",
          noProducts: "Chua co san pham kha dung",
          productLimit: "Toi da 100 san pham",
          shops: "Cua hang",
          marketplace: "Bo loc nha sang tao",
          creatorList: "Danh sach nha sang tao",
          quickStart: "Bat dau nhanh",
          shopConnections: "Ket noi cua hang",
          noShop: "Chua ket noi cua hang",
          connectHint: "Them cua hang TikTok Shop de bat dau.",
          connectShop: "Ket noi cua hang",
          applyFilters: "Ap dung bo loc",
          keyword: "Tu khoa",
          category: "Danh muc",
          language: "Ngon ngu",
          agency: "Agency",
          allCategories: "Tat ca danh muc",
          allLanguages: "Tat ca ngon ngu",
          allAgencies: "Tat ca agency",
          minFollowers: "Nguoi theo doi toi thieu",
          minCommission: "Hoa hong toi thieu",
          creatorStar: "Chi Creator Star",
          notContacted: "Chua lien he trong 90 ngay",
          findCreators: "Tim nha sang tao chinh xac",
          creatorCount: "Tai du lieu nha sang tao",
          readPage: "Doc danh sach",
          reading: "Dang doc...",
          startTitle: "Bat dau tu trang nha sang tao chinh thuc",
          startHint:
            "Mo trang Discover creators, sau do doc ket qua vao trung tam.",
          openDiscover: "Mo trang Discover creators",
          selectAll: "Chon tat ca",
          selected: "Da chon",
          invited: "Da moi",
          creator: "Nha sang tao",
          followers: "Nguoi theo doi",
          gmv: "GMV",
          state: "Trang thai",
          discover: "Kham pha",
          accounts: "Tai khoan",
          addAccount: "Them tai khoan",
          removeAccount: "Xoa tai khoan",
          authorizeShop: "Uy quyen cua hang",
          checkingAuth: "Dang kiem tra uy quyen",
          accountsKicker: "Tai khoan",
          filtersKicker: "Bo loc nha sang tao",
          listKicker: "Danh sach nha sang tao",
          batchKicker: "Trinh tao lo",
          countryRegion: "Quoc gia / khu vuc",
          storeType: "Loai cua hang",
          shopId: "ID cua hang",
          affiliateUrl: "Dia chi Affiliate",
          officialHint: "Dang nhap bang dia chi Affiliate chinh thuc.",
          cancel: "Huy",
          adding: "Dang them...",
          creatorPlaceholder: "Ten nha sang tao hoac linh vuc",
          accountName: "Ten tai khoan",
          accountPlaceholder: "Cua hang chu luc Viet Nam",
          video: "Video",
          live: "Phat truc tiep",
          both: "Video va phat truc tiep",
          productPlaceholder: "ID san pham, vi du product_1",
          appKey: "App Key",
          appKeyHint: "Lay tu ung dung da tao trong TikTok Partner Center.",
          appSecret: "App Secret",
          appSecretHint: "Bi mat dung de ky yeu cau va uy quyen cua hang.",
          appSecretSaved: "Da ma hoa va luu an toan, co the de trong",
          callbackUrl: "URL callback OAuth",
          callbackHint: "Phai trung khop voi dia chi HTTPS trong Partner Center.",
          callbackCopied: "Da sao chep URL callback",
          copy: "Sao chep",
          callbackGuide: "Hay tai examples/tiktok-affiliate-oauth-callback/index.html len website HTTPS cua ban, sau do nhap day du URL tai day. URL phai trung khop voi Partner Center. Vi du:",
          baseUrl: "URL API co so",
          baseUrlHint: "Dia chi API mo cua TikTok Partner Center.",
          apiVersion: "Phien ban API",
          apiVersionHint: "Phien ban Affiliate API dang duoc su dung.",
          apiSettingsHint: "Cau hinh TikTok Partner Center API de uy quyen va dong bo du lieu.",
          confirmTask: "Xac nhan nhiem vu",
          confirmTaskPrompt: "Xac nhan nhiem vu cho {count} nha sang tao? Sau khi xac nhan, nhiem vu moi duoc phep gui yeu cau API chinh thuc.",
          taskConfirmed: "Da xac nhan",
        }
      : {
          catalog: "Product catalog",
          libraryKicker: "Creator assets", libraryTitle: "My creator library", libraryHint: "Reuse saved creators and manage tags, notes, and outreach status.", noLibraryData: "No saved creators", statsKicker: "Analytics", statsTitle: "Outreach statistics", statsTotal: "Task creators", statsSuccess: "Successful outreach", statsInviteRate: "Invitation success rate", statsMessageRate: "Message success rate",
          searchProducts: "Search product name or ID",
          loadingProducts: "Loading products",
          noProducts: "No products available",
          productLimit: "Up to 100 products",
          shops: "Shops",
          marketplace: "Marketplace filters",
          creatorList: "Creator list",
          quickStart: "Quick start",
          shopConnections: "Shop connections",
          noShop: "No shop connected",
          connectHint: "Add a TikTok Shop account to begin.",
          connectShop: "Connect shop",
          applyFilters: "Apply filters",
          keyword: "Keyword",
          category: "Category",
          language: "Language",
          agency: "Agency",
          allCategories: "All categories",
          allLanguages: "All languages",
          allAgencies: "All agencies",
          minFollowers: "Min followers",
          minCommission: "Min commission",
          creatorStar: "Creator Star only",
          notContacted: "Not contacted in 90 days",
          findCreators: "Find creators with precision",
          creatorCount: "Load creators from Affiliate",
          readPage: "Read page",
          reading: "Reading...",
          startTitle: "Start with the official creator page",
          startHint:
            "Open Discover creators, then read the visible results into this workspace.",
          openDiscover: "Open Discover creators",
          selectAll: "Select all",
          selected: "selected",
          invited: "invited",
          creator: "Creator",
          followers: "Followers",
          gmv: "GMV",
          state: "State",
          discover: "Discover",
          accounts: "Accounts",
          addAccount: "Add account",
          removeAccount: "Remove account",
          authorizeShop: "Authorize shop",
          checkingAuth: "Checking authorization",
          accountsKicker: "ACCOUNTS",
          filtersKicker: "MARKETPLACE FILTERS",
          listKicker: "CREATOR LIST",
          batchKicker: "BATCH BUILDER",
          countryRegion: "Country / region",
          storeType: "Store type",
          shopId: "Shop ID",
          affiliateUrl: "Affiliate login URL",
          officialHint: "Sign in with the official Affiliate host.",
          cancel: "Cancel",
          adding: "Adding...",
          creatorPlaceholder: "Creator or niche",
          accountName: "Account name",
          accountPlaceholder: "Vietnam flagship",
          video: "Video",
          live: "LIVE",
          both: "Video and LIVE",
          productPlaceholder: "Product ID, for example product_1",
          appKey: "App Key",
          appKeyHint: "The key generated when you create the app in Partner Center.",
          appSecret: "App Secret",
          appSecretHint: "The app secret used to sign requests and authorize shops.",
          appSecretSaved: "Encrypted and saved. Leave blank to keep it.",
          callbackUrl: "OAuth callback URL",
          callbackHint: "Must exactly match the HTTPS address registered in Partner Center.",
          callbackCopied: "Callback URL copied",
          copy: "Copy",
          callbackGuide: "Upload examples/tiktok-affiliate-oauth-callback/index.html to your HTTPS website, then enter the complete URL here. It must exactly match the URL registered in Partner Center. Example:",
          baseUrl: "API base URL",
          baseUrlHint: "The open platform API address provided by Partner Center.",
          apiVersion: "API version",
          apiVersionHint: "The Affiliate API version used by this workspace.",
          apiSettingsHint: "Configure the TikTok Partner Center API for authorization and data sync.",
          confirmTask: "Confirm task",
          confirmTaskPrompt: "Confirm this {count}-creator task? The task will be allowed to submit official API requests.",
          taskConfirmed: "Confirmed",
        },
);
function toggleProduct(id: string) {
  const ids = [...selectedProductIds.value];
  const index = ids.indexOf(id);
  if (index >= 0) ids.splice(index, 1);
  else if (ids.length < 100) ids.push(id);
  invitationForm.value.productIds = ids.join(",");
}
function productSelected(id: string) {
  return selectedProductIds.value.includes(id);
}
function normalizeFilterOptions(result: any) {
  const source = result?.data || result || {};
  const values = (keys: string[]) => {
    for (const key of keys) {
      const value = source[key];
      if (Array.isArray(value))
        return value
          .map((item: any) =>
            typeof item === "string"
              ? item
              : String(item.value || item.id || item.name || item.label || ""),
          )
          .filter(Boolean);
    }
    return [];
  };
  creatorFilterOptions.value = {
    categories: values(["categories", "category_list", "category_options"]),
    languages: values(["languages", "language_list", "language_options"]),
    agencies: values(["agencies", "agency_list", "agency_options"]),
  };
}
async function loadCreatorFilterOptions() {
  if (!accountId.value || !apiConfigured.value) return;
  try {
    normalizeFilterOptions(
      await window.api.tiktokCreatorOutreach.getCreatorFilters(accountId.value),
    );
  } catch {
    creatorFilterOptions.value = {
      categories: [],
      languages: [],
      agencies: [],
    };
  }
}
async function loadShopProducts() {
  if (
    !accountId.value ||
    !apiConfigured.value ||
    authState.value !== "connected"
  )
    return;
  productsLoading.value = true;
  try {
    const result = (await window.api.tiktokCreatorOutreach.listShopProducts({
      accountId: accountId.value,
    })) as { products?: ShopProduct[] };
    shopProducts.value = (result.products || []).filter((item) => item.id);
  } catch (error) {
    shopProducts.value = [];
    errorText.value = error instanceof Error ? error.message : String(error);
  } finally {
    productsLoading.value = false;
  }
}

async function load() {
  const apiStatus =
    (await window.api.tiktokCreatorOutreach.getApiConfigStatus()) as {
      configured: boolean;
      appKey?: string;
      redirectUri?: string;
      apiBaseUrl?: string;
      apiVersion?: string;
      hasAppSecret?: boolean;
    };
  apiConfigured.value = apiStatus.configured;
  appSecretSaved.value = Boolean(apiStatus.hasAppSecret);
  apiForm.value.appKey = apiStatus.appKey || "";
  apiForm.value.redirectUri = apiStatus.redirectUri || "";
  apiForm.value.apiBaseUrl = apiStatus.apiBaseUrl || apiForm.value.apiBaseUrl;
  apiForm.value.apiVersion = apiStatus.apiVersion || apiForm.value.apiVersion;
  accounts.value =
    (await window.api.tiktokCreatorOutreach.listAccounts()) as Account[];
  if (!accountId.value && accounts.value[0])
    accountId.value = (
      accounts.value.find((account) => account.shopRegion === "VN") ||
      accounts.value[0]
    ).id;
  await refreshAuth();
  await Promise.all([loadCreatorFilterOptions(), loadShopProducts()]);
  await loadDashboard();
}
async function loadDashboard() {
  if (
    !accountId.value ||
    !apiConfigured.value ||
    authState.value !== "connected"
  ) {
    quota.value = null;
    inboxCounts.value = null;
    audits.value = accountId.value
      ? ((await window.api.tiktokCreatorOutreach.listAudits(accountId.value)) as any[])
          .slice(0, 8)
      : [];
    return;
  }
  dashboardBusy.value = true;
  try {
    const [quotaResult, inboxResult, auditResult, taskResult, statisticsResult] = await Promise.all([
      window.api.tiktokCreatorOutreach.getWeeklyOutreachQuota(accountId.value),
      window.api.tiktokCreatorOutreach.getInboxCounts(accountId.value),
      window.api.tiktokCreatorOutreach.listAudits(accountId.value),
      window.api.tiktokCreatorOutreach.listOutreachTasks(accountId.value),
      window.api.tiktokCreatorOutreach.getOutreachStatistics(accountId.value),
    ]);
    quota.value = quotaResult?.data || quotaResult || null;
    inboxCounts.value = inboxResult?.data || inboxResult || null;
    audits.value = Array.isArray(auditResult) ? auditResult.slice(0, 8) : [];
    outreachTasks.value = Array.isArray(taskResult) ? taskResult : [];
    statistics.value = statisticsResult as typeof statistics.value;
  } catch (error) {
    errorText.value = friendlyError(error);
  } finally {
    dashboardBusy.value = false;
  }
}
async function refreshAuth() {
  if (!accountId.value) {
    authState.value = "unknown";
    return;
  }
  try {
    authState.value = (
      (await window.api.tiktokCreatorOutreach.authStatus(accountId.value)) as {
        authenticated: boolean;
      }
    ).authenticated
      ? "connected"
      : "signed-out";
    if (authState.value === "connected") await loadShopProducts();
  } catch {
    authState.value = "unknown";
  }
}
async function saveApiConfig() {
  if (
    !apiForm.value.appKey.trim() ||
    !apiForm.value.appSecret.trim() && !appSecretSaved.value ||
    !apiForm.value.redirectUri.trim()
  ) {
    errorText.value = "App Key, App Secret and OAuth callback are required.";
    return;
  }
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(apiForm.value.appKey.trim())) {
    errorText.value = "App Key must be the Partner Center App Key, not a product title or URL.";
    return;
  }
  try {
    const callback = new URL(apiForm.value.redirectUri.trim());
    if (callback.protocol !== "https:") throw new Error("invalid protocol");
  } catch {
    errorText.value = "OAuth callback must be a valid HTTPS URL registered in Partner Center.";
    return;
  }
  apiBusy.value = true;
  errorText.value = "";
  try {
    await window.api.tiktokCreatorOutreach.configureApi(plain(apiForm.value));
    apiConfigured.value = true;
    appSecretSaved.value = true;
    apiForm.value.appSecret = "";
    notice.value = "TikTok Shop API configuration saved securely.";
  } catch (error) {
    errorText.value = friendlyError(error);
  } finally {
    apiBusy.value = false;
  }
}
async function authorizeShop() {
  if (!accountId.value) {
    openAddAccount();
    return;
  }
  try {
    await window.api.tiktokCreatorOutreach.startOAuth(accountId.value);
    notice.value =
      "OAuth authorization opened. Complete authorization in the browser, then refresh status.";
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error);
  }
}
function openAddAccount() {
  accountForm.value = {
    name: "",
    shopRegion: "VN",
    shopId: "",
    storeType: "local",
  };
  errorText.value = "";
  showAccountModal.value = true;
}
async function addAccount() {
  const form = accountForm.value;
  if (!form.name.trim() || !form.shopId.trim()) {
    errorText.value = "Account name and Shop ID are required.";
    return;
  }
  savingAccount.value = true;
  errorText.value = "";
  try {
    const item = (await window.api.tiktokCreatorOutreach.createAccount({
      name: form.name.trim(),
      shopId: form.shopId.trim(),
      shopRegion: form.shopRegion.trim().toUpperCase(),
      storeType: form.storeType,
    })) as Account;
    accounts.value = [
      item,
      ...accounts.value.filter((entry) => entry.id !== item.id),
    ];
    accountId.value = item.id;
    showAccountModal.value = false;
    notice.value =
      "Account added. Open Affiliate to sign in with its isolated session.";
    await refreshAuth();
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error);
  } finally {
    savingAccount.value = false;
  }
}
async function removeAccount() {
  if (
    !currentAccount.value ||
    !window.confirm(
      `Remove ${currentAccount.value.name}? Its saved local session will be closed.`,
    )
  )
    return;
  const removedId = currentAccount.value.id;
  await window.api.tiktokCreatorOutreach.removeAccount(removedId);
  accounts.value = accounts.value.filter((item) => item.id !== removedId);
  accountId.value =
    (
      accounts.value.find((account) => account.shopRegion === "VN") ||
      accounts.value[0]
    )?.id || "";
  creators.value = [];
  preview.value = null;
  await refreshAuth();
}
async function openPage(path = "platform/homepage") {
  if (!accountId.value) {
    openAddAccount();
    return;
  }
  const result = (await window.api.tiktokCreatorOutreach.open({
    accountId: accountId.value,
    path,
  })) as {
    finalUrl?: string;
    finalHost?: string;
    finalTitle?: string;
    requestedRegion?: string;
    shopId?: string;
    isAffiliateBackend?: boolean;
    fallbackUsed?: boolean;
    redirected?: boolean;
  };
  const finalRegion = result.finalUrl
    ?.match(/[?&]shop_region=([^&]+)/i)?.[1]
    ?.toUpperCase();
  const expectedRegion = currentAccount.value?.shopRegion;
  if (result.finalUrl?.includes("/errorpage")) {
    errorText.value = `TikTok rejected the ${expectedRegion} Affiliate URL. Check that Shop ID ${result.shopId || currentAccount.value?.shopId || "unknown"} belongs to ${expectedRegion} and that the shop has Creator Affiliate access. Final URL: ${result.finalUrl}`;
  } else if (
    !result.isAffiliateBackend ||
    (finalRegion && finalRegion !== expectedRegion)
  ) {
    errorText.value = `TikTok did not keep the requested ${expectedRegion} session. Final host: ${result.finalHost || "unknown"}; title: ${result.finalTitle || "unknown"}; URL: ${result.finalUrl || "unknown"}`;
  } else if (result.fallbackUsed) {
    notice.value = `TikTok rejected the saved Shop ID, so the ${expectedRegion} login opened without Shop ID. Sign in and select the correct ${expectedRegion} shop in TikTok.`;
  } else {
    notice.value = `Affiliate window opened for ${expectedRegion}. Sign in there if needed.`;
  }
  await refreshAuth();
}
async function openSystemBrowser(path = "platform/homepage") {
  if (!accountId.value) {
    openAddAccount();
    return;
  }
  const url = buildSystemAffiliateUrl(path);
  if (!url) return;
  await window.shell.openExternal(url);
  notice.value = `Opened ${currentAccount.value?.shopRegion} Affiliate in your system browser. Use the existing Chrome login session there.`;
}
async function readCreators() {
  if (!accountId.value) return;
  loading.value = true;
  notice.value = "";
  errorText.value = "";
  try {
    const result = (await window.api.tiktokCreatorOutreach.searchCreators({
      accountId: accountId.value,
      filters: {
        page_size: 50,
        targetCount: targetCount.value,
        ...filterForm.value,
      },
    })) as { creators?: Creator[] };
    creators.value = (result.creators || []).map((item) => ({
      ...item,
      selected: false,
    }));
    notice.value = `Loaded ${creators.value.length} creators from TikTok Shop API.`;
    await loadDashboard();
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}
function selectAll(value: boolean) {
  creators.value.forEach((item) => {
    item.selected = value;
  });
}
async function makePreview() {
  if (!accountId.value) {
    openAddAccount();
    return;
  }
  const pool =
    action.value === "message" && invitedOnly.value
      ? invitedCreators.value
      : selected.value;
  if (!pool.length) {
    errorText.value = "Select creators or load invited creators first.";
    return;
  }
  errorText.value = "";
  try {
    const count = Math.max(1, Math.trunc(Number(targetCount.value) || 1));
    const ids = pool.slice(0, count).map((item) => item.id);
    const productIds = invitationForm.value.productIds
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 100);
    if (action.value === "invite" && !productIds.length) {
      errorText.value = "Select at least one product for an invitation plan.";
      return;
    }
    if (
      action.value === "invite" &&
      invitationForm.value.commissionRate === ""
    ) {
      errorText.value = "Set a base commission for the invitation plan.";
      return;
    }
    const invitation = {
      name:
        invitationForm.value.name ||
        `${currentAccount.value?.name || "Shop"} ${action.value}`,
      expiresAt: invitationForm.value.expiresAt,
      message: template.value,
      contentType: invitationForm.value.contentType,
      productIds,
      commissionRate: Number(invitationForm.value.commissionRate),
      adCommissionRate:
        invitationForm.value.adCommissionRate === ""
          ? undefined
          : Number(invitationForm.value.adCommissionRate),
    };
    const result = await window.api.tiktokCreatorOutreach.preview({
      accountId: accountId.value,
      action: action.value,
      creatorIds: ids,
      creatorNames: pool.slice(0, ids.length).map((item) => item.name),
      batchSize: Math.min(50, Math.max(1, Number(batchSize.value) || 50)),
      template: template.value,
      variables: {
        productName: productName.value,
        shopName: currentAccount.value?.name || "",
        commissionRate: invitationForm.value.commissionRate,
      },
      filters: plain(filterForm.value),
      invitation,
    });
    preview.value = result;
    batches.value = result.batches || [];
    batchCursor.value = 0;
    notice.value =
      ids.length < count
        ? `Only ${ids.length} eligible creators are available.`
        : "Preview ready. Confirm each batch before sending.";
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error);
  }
}
async function createTaskFromWorkspace() {
  if (!accountId.value) return;
  const pool = action.value === "message" && invitedOnly.value ? invitedCreators.value : selected.value;
  const payload: Record<string, unknown> = {
    accountId: accountId.value,
    source: creatorSource.value,
    mode: action.value,
    targetCount: targetCount.value,
    batchSize: batchSize.value,
    creators: creatorSource.value === "specified" ? [] : plain(pool),
    input: specifiedCreators.value,
    filters: plain(filterForm.value),
    messageTemplate: template.value,
    invitation: { name: invitationForm.value.name, expiresAt: invitationForm.value.expiresAt, message: template.value, contentType: invitationForm.value.contentType, productIds: selectedProductIds.value, commissionRate: Number(invitationForm.value.commissionRate), adCommissionRate: invitationForm.value.adCommissionRate === "" ? undefined : Number(invitationForm.value.adCommissionRate) },
    messageFilters: { historyMode: "all", skipCreatorReply: false },
  };
  try {
    const result = await window.api.tiktokCreatorOutreach.createOutreachTask(payload);
    activeTask.value = result.task;
    outreachTasks.value = [result.task, ...outreachTasks.value.filter((item) => item.id !== result.task.id)];
    notice.value = `Task created with ${result.task.targetCount} creators in ${result.batches.length} batches.`;
  } catch (error) { errorText.value = error instanceof Error ? error.message : String(error); }
}
async function runTask(task: any) {
  try { activeTask.value = await window.api.tiktokCreatorOutreach.startOutreachTask(task.id); await loadDashboard(); } catch (error) { errorText.value = error instanceof Error ? error.message : String(error); }
}
async function confirmTask(task: any) {
  if (!window.confirm(uiCopy.value.confirmTaskPrompt.replace("{count}", String(task.targetCount)))) return;
  try { activeTask.value = await window.api.tiktokCreatorOutreach.confirmOutreachTask(task.id); await loadDashboard(); } catch (error) { errorText.value = error instanceof Error ? error.message : String(error); }
}
async function addSelectedToLibrary() {
  if (!accountId.value || !selected.value.length) return;
  try {
    await window.api.tiktokCreatorOutreach.addCreatorsToLibrary({ accountId: accountId.value, creators: selected.value.map((creator) => ({ creatorId: creator.id, creatorName: creator.name })) });
    notice.value = `Added ${selected.value.length} creators to your library.`;
  } catch (error) { errorText.value = error instanceof Error ? error.message : String(error); }
}
async function addCreatorToLibrary(creator: Creator) {
  if (!accountId.value) return;
  await window.api.tiktokCreatorOutreach.addCreatorsToLibrary({ accountId: accountId.value, creators: [{ creatorId: creator.id, creatorName: creator.name }] });
  notice.value = uiCopy.value.saveSelected;
}
async function controlTask(actionName: "pause" | "resume" | "cancel" | "retry", task: any) {
  try {
    const fn = actionName === "pause" ? window.api.tiktokCreatorOutreach.pauseOutreachTask : actionName === "resume" ? window.api.tiktokCreatorOutreach.resumeOutreachTask : actionName === "cancel" ? window.api.tiktokCreatorOutreach.cancelOutreachTask : window.api.tiktokCreatorOutreach.retryFailedCreators;
    activeTask.value = await fn(task.id); await loadDashboard();
  } catch (error) { errorText.value = error instanceof Error ? error.message : String(error); }
}
async function confirmBatch() {
  if (!preview.value || !accountId.value || !currentBatch.value) return;
  if (
    !window.confirm(
      `Confirm batch ${currentBatch.value.index + 1}/${currentBatch.value.total} for ${currentBatch.value.creatorIds.length} creators?`,
    )
  )
    return;
  try {
    if (preview.value.campaignId)
      await window.api.tiktokCreatorOutreach.updateCampaignStatus({
        id: preview.value.campaignId,
        status: "running",
      });
    const result = await window.api.tiktokCreatorOutreach.confirm({
      accountId: accountId.value,
      action: action.value,
      count: currentBatch.value.creatorIds.length,
      creatorIds: currentBatch.value.creatorIds,
      creatorNames: currentBatch.value.creatorNames,
      body: preview.value.body,
      invitation: {
        name:
          invitationForm.value.name ||
          `${currentAccount.value?.name || "Shop"} outreach`,
        expiresAt: invitationForm.value.expiresAt,
        message: preview.value.body,
        contentType: invitationForm.value.contentType,
        productIds: invitationForm.value.productIds
          .split(/[\s,]+/)
          .filter(Boolean)
          .slice(0, 100),
        commissionRate:
          Number(invitationForm.value.commissionRate) || undefined,
        adCommissionRate:
          Number(invitationForm.value.adCommissionRate) || undefined,
      },
    });
    batchCursor.value += 1;
    notice.value = result.note;
    if (batchCursor.value >= batches.value.length) {
      if (preview.value.campaignId)
        await window.api.tiktokCreatorOutreach.updateCampaignStatus({
          id: preview.value.campaignId,
          status: "completed",
        });
      preview.value = null;
      notice.value = "All batches completed.";
    }
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error);
  }
}
watch(accountId, () => {
  creators.value = [];
  preview.value = null;
  notice.value = "";
  shopProducts.value = [];
  void refreshAuth();
  void loadCreatorFilterOptions();
  void loadDashboard();
});
watch(action, () => {
  preview.value = null;
  errorText.value = "";
});
onMounted(load);
</script>

<template>
  <main class="outreach-page">
    <header class="workspace-header">
      <div class="brand-block">
        <span class="eyebrow">TIKTOK AFFILIATE</span>
        <h1>{{ t("tiktokCreatorOutreach.title") }}</h1>
        <p>{{ t("tiktokCreatorOutreach.subtitle") }}</p>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <span class="hero-node hero-node--primary"><Users :size="18" /></span>
        <span class="hero-node hero-node--secondary"><Send :size="15" /></span>
        <span class="hero-node hero-node--tertiary"><MessageSquare :size="15" /></span>
        <span class="hero-orbit hero-orbit--one"></span>
        <span class="hero-orbit hero-orbit--two"></span>
      </div>
      <div class="header-actions">
        <div class="shop-chip">
          <span class="status-dot" :class="authState"></span
          ><span>{{
            currentAccount?.name || t("tiktokCreatorOutreach.noShop")
          }}</span
          ><small>{{
            currentAccount
              ? `${currentAccount.shopRegion} / ${currentAccount.shopId}`
              : ""
          }}</small>
        </div>
        <button
          class="button button--secondary"
          type="button"
          @click="openAddAccount"
        >
          <Plus :size="15" /> {{ t("tiktokCreatorOutreach.addAccount") }}
        </button>
      </div>
    </header>
    <div v-if="notice" class="banner banner--success">
      <Check :size="16" /><span>{{ notice }}</span
      ><button type="button" aria-label="Dismiss" @click="notice = ''">
        <X :size="15" />
      </button>
    </div>
    <div v-if="errorText" class="banner banner--error">
      <span>{{ errorText }}</span
      ><button type="button" aria-label="Dismiss" @click="errorText = ''">
        <X :size="15" />
      </button>
    </div>
    <nav class="workspace-tabs panel" aria-label="Workspace navigation">
      <button
        v-for="tab in [
          ['overview', 'LayoutDashboard'],
          ['creators', 'Users'],
          ['library', 'Users'],
          ['campaign', 'Send'],
          ['messages', 'MessageSquare'],
          ['activity', 'History'],
          ['stats', 'History'],
          ['settings', 'Settings2'],
        ] as const"
        :key="tab[0]"
        class="tab"
        :class="{ active: activeTab === tab[0] }"
        type="button"
        @click="activeTab = tab[0]"
      >
        <component
          :is="
            {
              LayoutDashboard,
              Users,
              Send,
              MessageSquare,
              History,
              Settings2,
              SlidersHorizontal,
            }[tab[1]]
          "
          :size="15"
        />
        {{ tab[0] === 'library' ? uiCopy.libraryTitle : tab[0] === 'stats' ? uiCopy.statsTitle : t(`tiktokCreatorOutreach.tabs.${tab[0]}`) }}</button
      ><span class="tab-spacer"></span
      ><button
        class="text-button"
        type="button"
        :disabled="!accountId"
        @click="loadDashboard"
      >
        <RefreshCw :size="14" /> {{ t("tiktokCreatorOutreach.refresh") }}
      </button>
    </nav>
    <section v-if="activeTab === 'overview' && outreachTasks.length" class="panel task-strip">
      <div class="panel-heading">
        <div><span class="eyebrow">{{ t("tiktokCreatorOutreach.taskQueueKicker") }}</span><h2>{{ t("tiktokCreatorOutreach.queue") }}</h2></div>
        <button class="button button--secondary" type="button" @click="createTaskFromWorkspace" :disabled="!accountId"><Plus :size="14" /> {{ t("tiktokCreatorOutreach.createTask") }}</button>
      </div>
      <div class="task-builder">
        <label class="field-label">{{ t("tiktokCreatorOutreach.taskSource") }}<select v-model="creatorSource"><option value="marketplace">{{ t("tiktokCreatorOutreach.sourceMarketplace") }}</option><option value="specified">{{ t("tiktokCreatorOutreach.sourceSpecified") }}</option><option value="library">{{ t("tiktokCreatorOutreach.sourceLibrary") }}</option></select></label>
        <label v-if="creatorSource === 'specified'" class="field-label">{{ t("tiktokCreatorOutreach.specifiedCreatorsLabel") }}<textarea v-model="specifiedCreators" :placeholder="t('tiktokCreatorOutreach.specifiedCreatorsHint')"></textarea></label>
      </div>
      <div v-if="outreachTasks.length" class="task-list">
        <div v-for="task in outreachTasks.slice(0, 5)" :key="task.id" class="task-row">
          <div><strong>{{ task.mode === 'invite' ? t("tiktokCreatorOutreach.tabs.campaign") : t("tiktokCreatorOutreach.tabs.messages") }}</strong><small>{{ task.progress?.completed || 0 }}/{{ task.progress?.total || task.targetCount }} {{ t("tiktokCreatorOutreach.taskCompleted") }}</small></div>
          <span class="state-pill" :class="task.status">{{ task.status === 'ready' ? uiCopy.taskConfirmed : t(`tiktokCreatorOutreach.taskStatus.${task.status}`) }}</span>
          <button v-if="task.status === 'preview'" class="text-button" type="button" @click="confirmTask(task)">{{ uiCopy.confirmTask }}</button>
          <button v-if="task.status === 'ready' || task.status === 'paused'" class="text-button" type="button" @click="runTask(task)">{{ task.status === 'paused' ? t("tiktokCreatorOutreach.resumeTask") : t("tiktokCreatorOutreach.startTask") }}</button>
          <button v-if="task.status === 'running'" class="text-button" type="button" @click="controlTask('pause', task)">{{ t("tiktokCreatorOutreach.pauseTask") }}</button>
          <button v-if="task.progress?.failed" class="text-button" type="button" @click="controlTask('retry', task)">{{ t("tiktokCreatorOutreach.retryFailed") }}</button>
          <button v-if="!['completed','cancelled'].includes(task.status)" class="text-button danger-text" type="button" @click="controlTask('cancel', task)">{{ t("tiktokCreatorOutreach.cancelTask") }}</button>
        </div>
      </div>
    </section>
    <section v-if="activeTab === 'library'" class="library-shell">
      <div class="library-metrics">
        <div class="library-metric library-metric--violet"><Users :size="19" /><span>{{ uiCopy.statsTotal }}</span><strong>{{ creators.length }}</strong><small>{{ uiCopy.libraryHint }}</small></div>
        <div class="library-metric library-metric--mint"><Send :size="19" /><span>{{ t("tiktokCreatorOutreach.tabs.campaign") }}</span><strong>{{ statistics.success }}</strong><small>{{ uiCopy.statsSuccess }}</small></div>
        <div class="library-metric library-metric--amber"><MessageSquare :size="19" /><span>{{ t("tiktokCreatorOutreach.tabs.messages") }}</span><strong>{{ statistics.skipped }}</strong><small>{{ t("tiktokCreatorOutreach.metrics.attention") }}</small></div>
        <div class="library-metric library-metric--blue"><Check :size="19" /><span>{{ t("tiktokCreatorOutreach.connected") }}</span><strong>{{ statistics.taskCount }}</strong><small>{{ uiCopy.statsTitle }}</small></div>
      </div>
      <section class="panel library-panel">
        <div class="library-heading">
          <div><span class="eyebrow">{{ uiCopy.libraryKicker }}</span><h2>{{ uiCopy.libraryTitle }} <em>{{ creators.length }}</em></h2><p>{{ uiCopy.libraryHint }}</p></div>
          <div class="library-toolbar"><label class="toolbar-search"><Users :size="15" /><input type="search" :placeholder="uiCopy.creatorPlaceholder" /></label><select><option>{{ uiCopy.allAgencies }}</option></select><select><option>{{ uiCopy.allCategories }}</option></select><button class="button button--secondary" type="button"><SlidersHorizontal :size="14" />{{ uiCopy.applyFilters }}</button></div>
        </div>
        <div class="creator-table" v-if="creators.length"><div v-for="creator in creators" :key="creator.id" class="creator-row"><span><strong>{{ creator.name }}</strong><small>{{ creator.id }}</small></span><span>{{ creator.followers || "-" }}</span><button class="text-button" type="button" @click="addCreatorToLibrary(creator)">{{ t("tiktokCreatorOutreach.saveSelected") }}</button></div></div>
        <div v-else class="library-empty"><div class="empty-illustration"><Users :size="34" /><span class="empty-spark empty-spark--one"></span><span class="empty-spark empty-spark--two"></span></div><strong>{{ uiCopy.noLibraryData }}</strong><p>{{ uiCopy.libraryHint }}</p><div class="empty-actions"><button class="button button--primary" type="button" @click="activeTab = 'creators'"><Plus :size="15" />{{ t("tiktokCreatorOutreach.tabs.creators") }}</button><button class="button button--secondary" type="button" @click="activeTab = 'creators'"><Users :size="15" />{{ uiCopy.findCreators }}</button></div></div>
      </section>
    </section>
    <section v-if="activeTab === 'stats'" class="panel stats-panel">
      <div class="panel-heading"><div><span class="eyebrow">{{ uiCopy.statsKicker }}</span><h2>{{ uiCopy.statsTitle }}</h2></div></div>
      <div class="stats-grid"><div><strong>{{ statistics.total }}</strong><span>{{ uiCopy.statsTotal }}</span></div><div><strong>{{ statistics.success }}</strong><span>{{ uiCopy.statsSuccess }}</span></div><div><strong>{{ Math.round(statistics.inviteAcceptanceRate * 100) }}%</strong><span>{{ uiCopy.statsInviteRate }}</span></div><div><strong>{{ Math.round(statistics.messageSuccessRate * 100) }}%</strong><span>{{ uiCopy.statsMessageRate }}</span></div></div>
    </section>

    <section v-if="activeTab === 'overview'" class="overview-layout">
      <section class="metrics-grid">
        <div class="metric-card">
          <span>{{ t("tiktokCreatorOutreach.metrics.authorization") }}</span
          ><strong>{{
            authState === "connected"
              ? t("tiktokCreatorOutreach.connected")
              : t("tiktokCreatorOutreach.actionRequired")
          }}</strong
          ><small
            >{{ currentAccount?.shopRegion || "-" }} /
            {{ currentAccount?.shopId || "-" }}</small
          >
        </div>
        <div class="metric-card">
          <span>{{ t("tiktokCreatorOutreach.metrics.quota") }}</span
          ><strong>{{ quota?.remaining ?? "-" }}</strong
          ><small>{{ t("tiktokCreatorOutreach.metrics.remaining") }}</small>
        </div>
        <div class="metric-card">
          <span>{{ t("tiktokCreatorOutreach.metrics.inbox") }}</span
          ><strong>{{
            inboxCounts
              ? Object.values(inboxCounts).reduce(
                  (sum: number, value: any) => sum + (Number(value) || 0),
                  0,
                )
              : "-"
          }}</strong
          ><small>{{ t("tiktokCreatorOutreach.metrics.attention") }}</small>
        </div>
        <div class="metric-card">
          <span>{{ t("tiktokCreatorOutreach.metrics.sync") }}</span
          ><strong>{{
            dashboardBusy
              ? t("tiktokCreatorOutreach.syncing")
              : t("tiktokCreatorOutreach.ready")
          }}</strong
          ><small>{{ t("tiktokCreatorOutreach.metrics.official") }}</small>
        </div>
        <div class="metric-card">
          <span>{{ uiCopy.statsTotal }}</span>
          <strong>{{ statistics.total || creators.length || 0 }}</strong>
          <small>{{ uiCopy.statsSuccess }}: {{ statistics.success || 0 }}</small>
        </div>
      </section>
      <div class="overview-grid">
        <aside class="sidebar panel">
          <div class="panel-heading">
            <div>
              <span class="section-kicker">{{ uiCopy.shops }}</span>
              <h2>{{ t("tiktokCreatorOutreach.shopConnections") }}</h2>
            </div>
            <button
              class="icon-button"
              type="button"
              :title="t('tiktokCreatorOutreach.addAccount')"
              @click="openAddAccount"
            >
              <Plus :size="17" />
            </button>
          </div>
          <div v-if="!accounts.length" class="empty-account">
            <Users :size="26" /><strong>{{
              t("tiktokCreatorOutreach.noShop")
            }}</strong
            ><span>{{ t("tiktokCreatorOutreach.connectHint") }}</span
            ><button
              class="button button--secondary"
              type="button"
              @click="openAddAccount"
            >
              {{ t("tiktokCreatorOutreach.connectShop") }}
            </button>
          </div>
          <div v-else class="account-list">
            <button
              v-for="account in accounts"
              :key="account.id"
              type="button"
              class="account-item"
              :class="{ active: account.id === accountId }"
              @click="accountId = account.id"
            >
              <span class="account-avatar">{{
                account.name.slice(0, 1).toUpperCase()
              }}</span
              ><span class="account-copy"
                ><strong>{{ account.name }}</strong
                ><small
                  >{{ account.shopRegion }} -
                  {{
                    account.storeType === "local"
                      ? t("tiktokCreatorOutreach.local")
                      : t("tiktokCreatorOutreach.crossBorder")
                  }}</small
                ></span
              ><ChevronRight :size="15" />
            </button>
          </div>
          <div v-if="currentAccount" class="connection-card">
            <div class="connection-title">
              <span class="status-dot" :class="authState"></span
              ><strong>{{
                authState === "connected"
                  ? t("tiktokCreatorOutreach.apiConnected")
                  : t("tiktokCreatorOutreach.authorizationRequired")
              }}</strong
              ><button
                class="icon-button icon-button--small"
                type="button"
                @click="refreshAuth"
              >
                <RefreshCw :size="14" />
              </button>
            </div>
            <span>{{ t("tiktokCreatorOutreach.oauthHint") }}</span
            ><button
              class="button button--primary button--full"
              type="button"
              :disabled="!apiConfigured"
              @click="authorizeShop"
            >
              <ExternalLink :size="15" />
              {{ t("tiktokCreatorOutreach.authorize") }}
            </button>
          </div>
        </aside>
        <section class="quick-actions panel">
          <span class="section-kicker">{{ uiCopy.quickStart }}</span>
          <h2>{{ t("tiktokCreatorOutreach.quickTitle") }}</h2>
          <p>{{ t("tiktokCreatorOutreach.quickHint") }}</p>
          <div class="quick-grid">
            <button type="button" @click="activeTab = 'creators'">
              <Users :size="20" /><strong>{{
                t("tiktokCreatorOutreach.tabs.creators")
              }}</strong
              ><small>{{
                t("tiktokCreatorOutreach.quickCreators")
              }}</small></button
            ><button
              type="button"
              @click="
                activeTab = 'campaign';
                action = 'invite';
              "
            >
              <Send :size="20" /><strong>{{
                t("tiktokCreatorOutreach.tabs.campaign")
              }}</strong
              ><small>{{
                t("tiktokCreatorOutreach.quickInvite")
              }}</small></button
            ><button
              type="button"
              @click="
                activeTab = 'messages';
                action = 'message';
              "
            >
              <MessageSquare :size="20" /><strong>{{
                t("tiktokCreatorOutreach.tabs.messages")
              }}</strong
              ><small>{{ t("tiktokCreatorOutreach.quickMessage") }}</small>
            </button>
          </div>
        </section>
      </div>
    </section>
    <section v-if="activeTab === 'creators'" class="tab-layout">
      <aside class="sidebar panel">
        <div class="panel-heading">
          <div>
            <span class="section-kicker">{{ uiCopy.accountsKicker }}</span>
            <h2>{{ uiCopy.shopConnections }}</h2>
          </div>
          <button
            class="icon-button"
            type="button"
            :title="uiCopy.addAccount"
            @click="openAddAccount"
          >
            <Plus :size="17" />
          </button>
        </div>
        <div v-if="!accounts.length" class="empty-account">
          <Users :size="26" /><strong>{{ uiCopy.noShop }}</strong
          ><span>{{ uiCopy.connectHint }}</span
          ><button
            class="button button--secondary"
            type="button"
            @click="openAddAccount"
          >
            {{ uiCopy.connectShop }}
          </button>
        </div>
        <div v-else class="account-list">
          <button
            v-for="account in accounts"
            :key="account.id"
            type="button"
            class="account-item"
            :class="{ active: account.id === accountId }"
            @click="accountId = account.id"
          >
            <span class="account-avatar">{{
              account.name.slice(0, 1).toUpperCase()
            }}</span
            ><span class="account-copy"
              ><strong>{{ account.name }}</strong
              ><small
                >{{ account.shopRegion }} -
                {{
                  account.storeType === "local"
                    ? t("tiktokCreatorOutreach.local")
                    : t("tiktokCreatorOutreach.crossBorder")
                }}</small
              ></span
            ><ChevronRight :size="15" />
          </button>
        </div>
        <div v-if="currentAccount" class="connection-card">
          <div class="connection-title">
            <span class="status-dot" :class="authState"></span
            ><strong>{{
              authState === "connected"
                ? t("tiktokCreatorOutreach.apiConnected")
                : authState === "signed-out"
                  ? t("tiktokCreatorOutreach.authorizationRequired")
                  : uiCopy.checkingAuth
            }}</strong
            ><button
              class="icon-button icon-button--small"
              type="button"
              :title="t('tiktokCreatorOutreach.refresh')"
              @click="refreshAuth"
            >
              <RefreshCw :size="14" />
            </button>
          </div>
          <span
            >{{ currentAccount.name }} uses its own official OAuth token.</span
          ><span class="region-note"
            >{{ uiCopy.countryRegion }}: {{ currentAccount.shopRegion }} ·
            {{
              currentAccount.storeType === "local"
                ? t("tiktokCreatorOutreach.local")
                : t("tiktokCreatorOutreach.crossBorder")
            }}</span
          ><button
            class="button button--primary button--full"
            type="button"
            :disabled="!apiConfigured"
            @click="authorizeShop"
          >
            <ExternalLink :size="15" /> {{ uiCopy.authorizeShop }}</button
          ><button
            class="text-button danger-text"
            type="button"
            @click="removeAccount"
          >
            <Trash2 :size="14" /> {{ uiCopy.removeAccount }}
          </button>
        </div>
      </aside>
      <section class="content-column">
        <div class="panel filters-panel">
          <div class="panel-heading">
            <div>
              <span class="section-kicker">{{ uiCopy.filtersKicker }}</span>
              <h2>{{ uiCopy.findCreators }}</h2>
            </div>
            <button
              class="text-button"
              type="button"
              :disabled="loading || !accountId"
              @click="readCreators"
            >
              {{ uiCopy.applyFilters }} <ChevronRight :size="14" />
            </button>
          </div>
          <div class="filter-grid">
            <label class="field-label"
              >{{ uiCopy.keyword
              }}<input
                v-model="filterForm.keyword"
                type="text"
                :placeholder="uiCopy.creatorPlaceholder" /></label
            ><label class="field-label"
              >{{ uiCopy.category
              }}<select v-model="filterForm.category">
                <option value="">{{ uiCopy.allCategories }}</option>
                <option
                  v-for="item in creatorFilterOptions.categories"
                  :key="item"
                  :value="item"
                >
                  {{ item }}
                </option>
              </select></label
            ><label class="field-label"
              >{{ uiCopy.language
              }}<select v-model="filterForm.language">
                <option value="">{{ uiCopy.allLanguages }}</option>
                <option
                  v-for="item in creatorFilterOptions.languages"
                  :key="item"
                  :value="item"
                >
                  {{ item }}
                </option>
              </select></label
            ><label class="field-label"
              >{{ uiCopy.agency
              }}<select v-model="filterForm.agency">
                <option value="">{{ uiCopy.allAgencies }}</option>
                <option
                  v-for="item in creatorFilterOptions.agencies"
                  :key="item"
                  :value="item"
                >
                  {{ item }}
                </option>
              </select></label
            ><label class="field-label"
              >{{ uiCopy.minFollowers
              }}<input
                v-model="filterForm.minFollowers"
                type="number"
                min="0" /></label
            ><label class="field-label"
              >{{ uiCopy.minCommission
              }}<input
                v-model="filterForm.minCommission"
                type="number"
                min="0"
                step="0.1" /></label
            ><label class="check-label filter-check"
              ><input v-model="filterForm.creatorStar" type="checkbox" />
              {{ uiCopy.creatorStar }}</label
            ><label class="check-label filter-check"
              ><input
                v-model="filterForm.notContactedDays"
                type="checkbox"
                true-value="90"
                false-value=""
              />
              {{ uiCopy.notContacted }}</label
            >
          </div>
        </div>
        <div class="panel creator-panel">
          <div class="panel-heading">
            <div>
              <span class="section-kicker">{{ uiCopy.listKicker }}</span>
              <h2>
                {{
                  creators.length
                    ? `${creators.length} visible creators`
                    : uiCopy.creatorCount
                }}
              </h2>
            </div>
            <div class="heading-actions">
              <button
                class="button button--secondary"
                type="button"
                :disabled="loading || !accountId"
                @click="readCreators"
              >
                <RefreshCw :size="15" :class="{ spin: loading }" />
                {{ loading ? uiCopy.reading : uiCopy.readPage }}
              </button>
              <button class="button button--secondary" type="button" :disabled="!selected.length" @click="addSelectedToLibrary"><Users :size="14" /> {{ t("tiktokCreatorOutreach.saveSelected") }}</button>
            </div>
          </div>
          <div v-if="!creators.length" class="empty-creators">
            <Users :size="30" /><strong>{{ uiCopy.startTitle }}</strong
            ><span>{{ uiCopy.startHint }}</span
            ><button
              class="button button--secondary"
              type="button"
              :disabled="!accountId"
              @click="openPage('platform/homepage')"
            >
              {{ uiCopy.openDiscover }} <ExternalLink :size="15" />
            </button>
          </div>
          <template v-else
            ><div class="list-toolbar">
              <label class="check-label"
                ><input
                  type="checkbox"
                  :checked="selected.length === creators.length"
                  @change="
                    selectAll(($event.target as HTMLInputElement).checked)
                  "
                />
                {{ uiCopy.selectAll }}</label
              ><span
                >{{ selected.length }} {{ uiCopy.selected }} -
                {{ invitedCreators.length }} {{ uiCopy.invited }}</span
              >
            </div>
            <div class="creator-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th class="check-cell"></th>
                    <th>{{ uiCopy.creator }}</th>
                    <th>{{ uiCopy.followers }}</th>
                    <th>{{ uiCopy.gmv }}</th>
                    <th>{{ uiCopy.state }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="creator in creators" :key="creator.id">
                    <td class="check-cell">
                      <input v-model="creator.selected" type="checkbox" />
                    </td>
                    <td>
                      <strong>{{ creator.name }}</strong>
                    </td>
                    <td>{{ creator.followers || "-" }}</td>
                    <td>{{ creator.gmv || "-" }}</td>
                    <td>
                      <span
                        class="state-pill"
                        :class="{ invited: creator.invited }"
                        >{{
                          creator.invited ? uiCopy.invited : uiCopy.discover
                        }}</span
                      >
                    </td>
                  </tr>
                </tbody>
              </table>
            </div></template
          >
        </div>
      </section>
      <aside class="composer panel">
        <div class="panel-heading">
          <div>
            <span class="section-kicker">{{ uiCopy.batchKicker }}</span>
            <h2>
              {{
                action === "invite"
                  ? t("tiktokCreatorOutreach.prepareInvites")
                  : t("tiktokCreatorOutreach.prepareMessages")
              }}
            </h2>
          </div>
          <Settings2 :size="18" class="muted-icon" />
        </div>
        <label class="field-label"
          >{{ t("tiktokCreatorOutreach.totalCreators")
          }}<input
            v-model.number="targetCount"
            type="number"
            min="1"
            max="10000"
          /><small>{{ t("tiktokCreatorOutreach.batchHint") }}</small></label
        ><label class="field-label"
          >{{ t("tiktokCreatorOutreach.batchSize")
          }}<input
            v-model.number="batchSize"
            type="number"
            min="1"
            max="50" /></label
        ><label v-if="action === 'message'" class="switch-row"
          ><input v-model="invitedOnly" type="checkbox" /><span
            ><strong>{{ t("tiktokCreatorOutreach.invitedOnly") }}</strong
            ><small>{{
              t("tiktokCreatorOutreach.invitedOnlyHint")
            }}</small></span
          ></label
        ><template v-if="action === 'invite'"
          ><label class="field-label"
            >{{ t("tiktokCreatorOutreach.invitationName")
            }}<input v-model="invitationForm.name" type="text" /></label
          ><label class="field-label"
            >{{ t("tiktokCreatorOutreach.expiry")
            }}<input v-model="invitationForm.expiresAt" type="date" /></label
          ><label class="field-label"
            >{{ t("tiktokCreatorOutreach.contentType")
            }}<select v-model="invitationForm.contentType">
              <option value="video">{{ uiCopy.video }}</option>
              <option value="live">{{ uiCopy.live }}</option>
              <option value="both">{{ uiCopy.both }}</option>
            </select></label
          ><label class="field-label"
            >{{ t("tiktokCreatorOutreach.productIds")
            }}<textarea v-model="invitationForm.productIds" rows="3"></textarea>
          </label>
          <div class="commission-grid">
            <label class="field-label"
              >{{ t("tiktokCreatorOutreach.baseCommission")
              }}<input
                v-model="invitationForm.commissionRate"
                type="number"
                min="0"
                step="0.1" /></label
            ><label class="field-label"
              >{{ t("tiktokCreatorOutreach.adCommission")
              }}<input
                v-model="invitationForm.adCommissionRate"
                type="number"
                min="0"
                step="0.1"
            /></label></div></template
        ><label class="field-label"
          >{{ t("tiktokCreatorOutreach.productLabel")
          }}<input v-model="productName" type="text" /></label
        ><label class="field-label"
          >{{
            action === "invite"
              ? t("tiktokCreatorOutreach.invitationMessage")
              : t("tiktokCreatorOutreach.messageTemplate")
          }}<textarea v-model="template" rows="5"></textarea
          ><small>{{ t("tiktokCreatorOutreach.variables") }}</small></label
        ><button
          class="button button--primary button--full"
          type="button"
          :disabled="!eligibleCount"
          @click="makePreview"
        >
          <Send :size="16" /> {{ t("tiktokCreatorOutreach.preview") }}
          {{ eligibleCount }}
        </button>
        <div v-if="preview && currentBatch" class="preview-card">
          <div class="preview-meta">
            <span>{{
              t("tiktokCreatorOutreach.batchOf", {
                current: currentBatch.index + 1,
                total: currentBatch.total,
              })
            }}</span
            ><strong>{{ currentBatch.creatorIds.length }}</strong>
          </div>
          <p>{{ preview.body }}</p>
          <button
            class="button button--danger button--full"
            type="button"
            @click="confirmBatch"
          >
            {{ t("tiktokCreatorOutreach.confirmBatch") }}
          </button>
        </div>
      </aside>
    </section>
    <section
      v-if="activeTab === 'campaign' || activeTab === 'messages'"
      class="outreach-workbench"
    >
      <header class="workbench-toolbar">
        <div class="toolbar-title">
          <span class="section-kicker">{{ uiCopy.batchKicker }}</span>
          <strong>{{ action === "invite" ? t("tiktokCreatorOutreach.prepareInvites") : t("tiktokCreatorOutreach.prepareMessages") }}</strong>
        </div>
        <label class="toolbar-field">
          <span>{{ t("tiktokCreatorOutreach.taskSource") }}</span>
          <select v-model="creatorSource">
            <option value="marketplace">{{ t("tiktokCreatorOutreach.sourceMarketplace") }}</option>
            <option value="specified">{{ t("tiktokCreatorOutreach.sourceSpecified") }}</option>
            <option value="library">{{ t("tiktokCreatorOutreach.sourceLibrary") }}</option>
          </select>
        </label>
        <label class="toolbar-field toolbar-field--number">
          <span>{{ t("tiktokCreatorOutreach.totalCreators") }}</span>
          <input v-model.number="targetCount" type="number" min="1" max="10000" />
        </label>
        <label class="toolbar-field toolbar-field--number">
          <span>{{ t("tiktokCreatorOutreach.batchSize") }}</span>
          <input v-model.number="batchSize" type="number" min="1" max="50" />
        </label>
        <button class="button button--secondary toolbar-action" type="button" :disabled="!accountId" @click="createTaskFromWorkspace">
          <Plus :size="14" /> {{ t("tiktokCreatorOutreach.createTask") }}
        </button>
      </header>
      <label v-if="creatorSource === 'specified'" class="specified-input field-label">
        {{ t("tiktokCreatorOutreach.specifiedCreatorsLabel") }}
        <textarea v-model="specifiedCreators" :placeholder="t('tiktokCreatorOutreach.specifiedCreatorsHint')"></textarea>
      </label>
      <div class="workbench-main">
        <aside class="campaign-mode">
        <button
          class="mode-button"
          :class="{ active: action === 'invite' }"
          type="button"
          @click="action = 'invite'"
        >
          <Send :size="18" /><span
            ><strong>{{ t("tiktokCreatorOutreach.tabs.campaign") }}</strong
            ><small>{{ t("tiktokCreatorOutreach.quickInvite") }}</small></span
          ></button
        ><button
          class="mode-button"
          :class="{ active: action === 'message' }"
          type="button"
          @click="action = 'message'"
        >
          <MessageSquare :size="18" /><span
            ><strong>{{ t("tiktokCreatorOutreach.tabs.messages") }}</strong
            ><small>{{ t("tiktokCreatorOutreach.quickMessage") }}</small></span
          >
        </button>
        </aside>
        <section class="composer">
        <div class="panel-heading">
          <div><span class="section-kicker">{{ action === "invite" ? t("tiktokCreatorOutreach.tabs.campaign") : t("tiktokCreatorOutreach.tabs.messages") }}</span><h2>{{ action === "invite" ? t("tiktokCreatorOutreach.invitationName") : t("tiktokCreatorOutreach.messageTemplate") }}</h2></div>
          <span class="composer-hint">{{ eligibleCount }} {{ t("tiktokCreatorOutreach.creators") }}</span>
        </div>
        <div class="composer-grid">
          <template v-if="action === 'invite'">
            <label class="field-label">
              {{ t("tiktokCreatorOutreach.invitationName") }}
              <input v-model="invitationForm.name" type="text" />
            </label>
            <label class="field-label">
              {{ t("tiktokCreatorOutreach.expiry") }}
              <input v-model="invitationForm.expiresAt" type="date" />
            </label>
            <label class="field-label">
              {{ t("tiktokCreatorOutreach.contentType") }}
              <select v-model="invitationForm.contentType">
              <option value="video">{{ uiCopy.video }}</option>
              <option value="live">{{ uiCopy.live }}</option>
              <option value="both">{{ uiCopy.both }}</option>
              </select>
            </label>
            <div class="commission-grid">
              <label class="field-label">
                {{ t("tiktokCreatorOutreach.baseCommission") }}
                <input
                v-model="invitationForm.commissionRate"
                type="number"
                min="0"
                max="100"
                step="0.1" />
              </label>
              <label class="field-label">
                {{ t("tiktokCreatorOutreach.adCommission") }}
                <input
                v-model="invitationForm.adCommissionRate"
                type="number"
                min="0"
                max="100"
                step="0.1"
                />
              </label>
            </div>
          </template>
        </div>
        <label class="field-label message-field"
          >{{
            action === "invite"
              ? t("tiktokCreatorOutreach.invitationMessage")
              : t("tiktokCreatorOutreach.messageTemplate")
          }}<textarea v-model="template" rows="7"></textarea></label
        ><button
          class="button button--primary button--full"
          type="button"
          :disabled="!eligibleCount"
          @click="makePreview"
        >
          <Send :size="16" /> {{ t("tiktokCreatorOutreach.preview") }}
        </button>
        <div v-if="preview && currentBatch" class="preview-card">
          <p>{{ preview.body }}</p>
          <button
            class="button button--danger button--full"
            type="button"
            @click="confirmBatch"
          >
            {{ t("tiktokCreatorOutreach.confirmBatch") }}
          </button>
        </div>
        </section>
        <aside class="workbench-side">
          <section v-if="action === 'invite'" class="product-picker">
            <div class="panel-heading"><div><span class="section-kicker">{{ uiCopy.catalog }}</span><h2>{{ t("tiktokCreatorOutreach.productIds") }}</h2></div><span class="state-pill">{{ selectedProductIds.length }}/100</span></div>
            <label class="field-label product-search"><input v-model="productSearch" type="search" :placeholder="uiCopy.searchProducts" /></label>
            <div v-if="!accountId || authState !== 'connected'" class="product-picker-state">{{ t("tiktokCreatorOutreach.authorizationRequired") }}</div>
            <div v-else-if="productsLoading" class="product-picker-state">{{ uiCopy.loadingProducts }}</div>
            <div v-else-if="!filteredProducts.length" class="product-picker-state">{{ uiCopy.noProducts }}</div>
            <div v-else class="product-options">
              <label v-for="product in filteredProducts" :key="product.id" class="product-option">
                <input type="checkbox" :checked="productSelected(product.id)" :disabled="!productSelected(product.id) && selectedProductIds.length >= 100" @change="toggleProduct(product.id)" />
                <span><strong>{{ product.name || product.id }}</strong><small>{{ product.id }}<template v-if="product.status"> · {{ product.status }}</template></small></span>
              </label>
            </div>
          </section>
          <section class="queue-card">
            <div class="panel-heading"><div><span class="section-kicker">{{ t("tiktokCreatorOutreach.taskQueueKicker") }}</span><h2>{{ t("tiktokCreatorOutreach.queue") }}</h2></div><span class="state-pill">{{ eligibleCount }}</span></div>
            <div class="queue-metrics"><div><strong>{{ batches.length || 0 }}</strong><span>{{ t("tiktokCreatorOutreach.batchesReady") }}</span></div><div><strong>{{ currentBatch ? currentBatch.creatorIds.length : 0 }}</strong><span>{{ t("tiktokCreatorOutreach.creators") }}</span></div></div>
            <div v-if="currentBatch" class="queue-current"><span>{{ t("tiktokCreatorOutreach.currentBatch") }}</span><strong>{{ currentBatch.index + 1 }} / {{ currentBatch.total }}</strong></div>
          </section>
        </aside>
      </div>
    </section>
    <section v-if="activeTab === 'activity'" class="panel audit-panel">
      <div class="panel-heading">
        <div>
          <span class="section-kicker">{{
            t("tiktokCreatorOutreach.activityTitle")
          }}</span>
          <h2>{{ t("tiktokCreatorOutreach.activityTitle") }}</h2>
        </div>
        <span class="muted-icon">{{ audits.length }}</span>
      </div>
      <div v-if="!audits.length" class="audit-empty">
        {{ t("tiktokCreatorOutreach.noActivity") }}
      </div>
      <div v-else class="audit-list">
        <div v-for="event in audits" :key="event.id" class="audit-row">
          <span class="audit-dot" :class="event.status"></span
          ><span class="audit-action">{{ event.action }}</span
          ><span class="audit-detail">{{ event.detail || "-" }}</span
          ><time>{{ new Date(event.createdAt).toLocaleString() }}</time>
        </div>
      </div>
    </section>
    <section v-if="activeTab === 'settings'" class="panel api-config">
      <div class="panel-heading">
        <div>
          <span class="settings-header-line"><span class="settings-header-icon"><Settings2 :size="20" /></span><span><span class="section-kicker">{{
            t("tiktokCreatorOutreach.apiSettings")
          }}</span>
          <h2>{{ t("tiktokCreatorOutreach.apiSettings") }}</h2><p class="settings-header-copy">{{ uiCopy.apiSettingsHint }}</p></span></span>
        </div>
        <span class="state-pill" :class="{ invited: apiConfigured }">{{
          apiConfigured
            ? t("tiktokCreatorOutreach.configured")
            : t("tiktokCreatorOutreach.setupRequired")
        }}</span>
      </div>
      <div class="api-grid settings-grid">
        <div class="settings-card settings-card--mint"><div class="settings-card-title"><span class="settings-icon"><Settings2 :size="17" /></span><div><strong>{{ uiCopy.appKey }}</strong><small>{{ uiCopy.appKeyHint }}</small></div></div><label class="field-label"><input v-model="apiForm.appKey" type="text" /></label></div>
        <div class="settings-card settings-card--violet"><div class="settings-card-title"><span class="settings-icon"><Settings2 :size="17" /></span><div><strong>{{ uiCopy.appSecret }}</strong><small>{{ uiCopy.appSecretHint }}</small></div></div><label class="field-label"><input v-model="apiForm.appSecret" type="password" :placeholder="appSecretSaved ? uiCopy.appSecretSaved : ''" /><small v-if="appSecretSaved" class="secret-status">{{ uiCopy.appSecretSaved }}</small></label></div>
        <div class="settings-card settings-card--blue callback-field"><div class="settings-card-title"><span class="settings-icon"><ExternalLink :size="17" /></span><div><strong>{{ uiCopy.callbackUrl }}</strong><small>{{ uiCopy.callbackHint }}</small></div></div><label class="field-label"><div class="callback-control"><input v-model="apiForm.redirectUri" type="url" placeholder="https://your-domain.example/tiktok-affiliate-oauth-callback/" /><button class="button button--secondary" type="button" :disabled="!apiForm.redirectUri" @click="copyCallbackUrl"><Copy :size="15" />{{ uiCopy.copy }}</button></div><small>{{ uiCopy.callbackGuide }}</small></label></div>
        <div class="settings-card settings-card--amber"><div class="settings-card-title"><span class="settings-icon"><ExternalLink :size="17" /></span><div><strong>{{ uiCopy.baseUrl }}</strong><small>{{ uiCopy.baseUrlHint }}</small></div></div><label class="field-label"><input v-model="apiForm.apiBaseUrl" type="url" /></label></div>
        <div class="settings-card settings-card--blue settings-version"><div class="settings-card-title"><span class="settings-icon"><SlidersHorizontal :size="17" /></span><div><strong>{{ uiCopy.apiVersion }}</strong><small>{{ uiCopy.apiVersionHint }}</small></div></div><label class="field-label"><input v-model="apiForm.apiVersion" type="text" /></label></div>
        <div class="api-actions settings-actions">
          <button
            class="button button--primary"
            type="button"
            :disabled="apiBusy"
            @click="saveApiConfig"
          >
            <Check :size="15" />{{ t("tiktokCreatorOutreach.saveSettings") }}</button
          ><button
            class="button button--secondary"
            type="button"
            :disabled="!apiConfigured || !accountId"
            @click="authorizeShop"
          >
            <ExternalLink :size="15" />{{ t("tiktokCreatorOutreach.authorize") }}
          </button>
        </div>
      </div>
    </section>
    <div
      v-if="showAccountModal"
      class="modal-backdrop"
      @click.self="showAccountModal = false"
    >
      <section
        class="modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
      >
        <div class="modal-header">
          <div>
            <span class="section-kicker">{{ uiCopy.connectShop }}</span>
            <h2 id="account-modal-title">{{ uiCopy.addAccount }}</h2>
          </div>
          <button
            class="icon-button"
            type="button"
            aria-label="Close"
            @click="showAccountModal = false"
          >
            <X :size="18" />
          </button>
        </div>
        <p class="modal-copy">
          Each account gets its own local browser session. No plain-text cookies
          are imported.
        </p>
        <label class="field-label"
          >{{ uiCopy.accountName
          }}<input
            v-model="accountForm.name"
            type="text"
            :placeholder="uiCopy.accountPlaceholder"
        /></label>
        <div class="form-row">
          <label class="field-label"
            >{{ uiCopy.countryRegion
            }}<select v-model="accountForm.shopRegion">
              <option
                v-for="region in regionOptions"
                :key="region.code"
                :value="region.code"
              >
                {{ region.name }} ({{ region.code }})
              </option>
            </select></label
          ><label class="field-label"
            >{{ uiCopy.storeType
            }}<select v-model="accountForm.storeType">
              <option value="cross_border">
                {{ t("tiktokCreatorOutreach.crossBorder") }}
              </option>
              <option value="local">
                {{ t("tiktokCreatorOutreach.local") }}
              </option>
            </select></label
          >
        </div>
        <label class="field-label field-label--spaced"
          >{{ uiCopy.shopId
          }}<input
            v-model="accountForm.shopId"
            type="text"
            placeholder="7495886406403393880"
        /></label>
        <div class="url-preview">
          <span>{{ uiCopy.affiliateUrl }}</span
          ><code>{{ affiliateLoginUrl }}</code>
        </div>
        <p class="modal-copy modal-copy--compact">
          {{ uiCopy.officialHint }}
        </p>
        <div class="modal-actions">
          <button
            class="button button--secondary"
            type="button"
            @click="showAccountModal = false"
          >
            {{ uiCopy.cancel }}</button
          ><button
            class="button button--primary"
            type="button"
            :disabled="savingAccount"
            @click="addAccount"
          >
            {{ savingAccount ? uiCopy.adding : uiCopy.addAccount }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.outreach-page {
  min-height: 100%;
  padding: 22px 26px 34px;
  color: var(--theme-text);
  background: var(--theme-panel);
}

/* Keep the creator workspace readable when it is mounted after a tab switch. */
.outreach-page > .tab-layout {
  display: grid;
  min-height: 520px;
  visibility: visible;
  opacity: 1;
  background: var(--theme-shell, var(--theme-panel));
  color: var(--theme-text, var(--theme-text));
}
.outreach-page > .tab-layout > .panel,
.outreach-page > .tab-layout .filters-panel,
.outreach-page > .tab-layout .creator-panel {
  background: var(--theme-panel, var(--theme-panel));
  border-color: var(--theme-border, var(--theme-border));
  color: var(--theme-text, var(--theme-text));
}
.outreach-page > .tab-layout .content-column {
  min-width: 0;
  background: transparent;
}
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 22px;
}
.eyebrow,
.section-kicker {
  color: var(--theme-accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
}
.page-header h1 {
  margin: 7px 0 5px;
  color: var(--theme-text);
  font-size: 29px;
}
.page-header p {
  margin: 0;
  color: var(--theme-text-secondary);
  font-size: 13px;
}
.panel {
  border: 1px solid var(--theme-tone-blue);
  border-radius: 12px;
  background: var(--theme-panel-soft);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.2);
}
.api-config {
  padding: 17px;
  margin-bottom: 14px;
}
.api-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 15px;
}
.api-actions {
  display: flex;
  align-items: end;
  gap: 8px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}
.stats-grid > div {
  display: grid;
  gap: 5px;
  padding: 16px;
  border: 1px solid var(--theme-border-control);
  border-radius: 8px;
  background: var(--theme-panel-soft);
}
.library-shell { display: grid; gap: 14px; }
.library-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.library-metric { position: relative; display: grid; grid-template-columns: 32px 1fr; align-items: center; column-gap: 10px; min-height: 92px; padding: 14px 16px; overflow: hidden; border: 1px solid var(--theme-border-control); border-radius: 12px; background: var(--theme-panel-soft); }
.library-metric::after { position: absolute; right: 14px; bottom: 14px; width: 62px; height: 22px; border-bottom: 1px solid currentColor; border-radius: 50%; content: ""; opacity: 0.4; transform: rotate(-10deg); }
.library-metric > svg { grid-row: 1 / span 3; display: grid; place-items: center; width: 32px; height: 32px; padding: 7px; border-radius: 9px; background: color-mix(in srgb, var(--theme-text) 8%, transparent); }
.library-metric span { color: var(--theme-text-secondary); font-size: 11px; }
.library-metric strong { color: var(--theme-text); font-size: 25px; line-height: 1; }
.library-metric small { color: var(--theme-text-secondary); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.library-metric--violet { color: var(--theme-tone-violet); border-color: var(--theme-border-control); background: linear-gradient(145deg, var(--theme-panel-soft), var(--theme-panel-soft)); }
.library-metric--mint { color: var(--theme-accent); border-color: var(--theme-accent); background: linear-gradient(145deg, var(--theme-panel-soft), var(--theme-panel-soft)); }
.library-metric--amber { color: var(--theme-tone-amber); border-color: var(--theme-tone-amber); background: linear-gradient(145deg, var(--theme-panel-soft), var(--theme-panel-soft)); }
.library-metric--blue { color: var(--theme-tone-blue); border-color: var(--theme-tone-blue); background: linear-gradient(145deg, var(--theme-tone-blue), var(--theme-panel-soft)); }
.library-panel { padding: 22px; min-height: 430px; }
.library-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; }
.library-heading h2 { margin: 6px 0 5px; color: var(--theme-text); font-size: 18px; }
.library-heading h2 em { display: inline-grid; place-items: center; min-width: 25px; height: 22px; padding: 0 6px; border-radius: 999px; background: var(--theme-tone-blue); color: var(--theme-text-secondary); font-size: 11px; font-style: normal; vertical-align: 2px; }
.library-heading p { margin: 0; color: var(--theme-text-secondary); font-size: 12px; }
.library-toolbar { display: flex; align-items: center; gap: 8px; }
.library-toolbar select { min-width: 118px; }
.toolbar-search { display: flex; align-items: center; gap: 7px; width: 240px; padding: 0 10px; border: 1px solid var(--theme-border-control); border-radius: 8px; background: var(--theme-panel); color: var(--theme-text-secondary); }
.toolbar-search input { min-width: 0; width: 100%; border: 0; background: transparent; }
.library-empty { display: grid; justify-items: center; align-content: center; min-height: 300px; padding: 28px 16px; text-align: center; }
.library-empty > strong { margin-top: 13px; color: var(--theme-text); font-size: 16px; }
.library-empty > p { max-width: 380px; margin: 8px 0 16px; color: var(--theme-text-secondary); font-size: 12px; }
.empty-illustration { position: relative; display: grid; place-items: center; width: 92px; height: 72px; border: 1px solid var(--theme-tone-violet); border-radius: 13px; background: linear-gradient(145deg, var(--theme-tone-violet), var(--theme-tone-blue)); color: var(--theme-tone-violet); box-shadow: 0 10px 28px rgba(120, 73, 224, 0.2); transform: rotate(-5deg); }
.empty-illustration::after { position: absolute; right: -17px; bottom: -6px; width: 31px; height: 31px; border: 1px solid var(--theme-accent); border-radius: 8px; background: var(--theme-accent); content: ""; }
.empty-spark { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: var(--theme-tone-violet); box-shadow: 0 0 9px #ae7cff; }
.empty-spark--one { left: -17px; top: 16px; }
.empty-spark--two { right: -27px; top: 11px; }
.empty-actions { display: flex; gap: 9px; }
.stats-grid strong { font-size: 24px; color: var(--theme-text); }
.stats-grid span, .muted-copy { color: var(--theme-text-secondary); font-size: 12px; }
.creator-table { display: grid; gap: 6px; margin-top: 14px; }
.creator-row { display: grid; grid-template-columns: minmax(0, 1fr) 120px auto; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid var(--theme-border-control); border-radius: 7px; }
.creator-row span:first-child { display: grid; gap: 3px; }
.creator-row small { color: var(--theme-text-secondary); }
.callback-control {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.callback-control input {
  min-width: 0;
  flex: 1;
}
.callback-control button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.workspace-grid {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 310px;
  gap: 14px;
  align-items: start;
}
.sidebar,
.composer,
.creator-panel,
.page-tabs {
  padding: 17px;
}
.content-column {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.panel-heading h2 {
  margin: 5px 0 0;
  color: var(--theme-text);
  font-size: 15px;
}
.icon-button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--theme-border-control);
  border-radius: 8px;
  background: var(--theme-tone-blue);
  color: var(--theme-text);
  cursor: pointer;
}
.icon-button:hover {
  border-color: var(--theme-border-control);
  color: var(--theme-text);
}
.icon-button--small {
  width: 26px;
  height: 26px;
  margin-left: auto;
}
.muted-icon {
  color: var(--theme-text-muted);
}
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.button--primary {
  background: var(--theme-accent);
  border-color: var(--theme-accent);
  color: var(--theme-text);
}
.button--secondary {
  background: var(--theme-panel-soft);
  border-color: var(--theme-border-control);
  color: var(--theme-text);
}
.button--danger {
  background: var(--theme-tone-red);
  border-color: var(--theme-tone-red);
  color: var(--theme-text);
}
.button--full {
  width: 100%;
}
.text-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 0;
  border: 0;
  background: transparent;
  color: var(--theme-text-secondary);
  font-size: 11px;
  cursor: pointer;
}
.text-button:hover {
  color: var(--theme-text);
}
.danger-text {
  color: var(--theme-tone-red);
  margin-top: 10px;
}
.banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 14px;
  border-radius: 9px;
  font-size: 12px;
}
.banner button {
  display: grid;
  place-items: center;
  margin-left: auto;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.banner--success {
  background: var(--theme-accent);
  border: 1px solid var(--theme-accent);
  color: var(--theme-accent);
}
.banner--error {
  background: var(--theme-panel-soft);
  border: 1px solid var(--theme-border-control);
  color: var(--theme-tone-red);
}
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.metric-card {
  position: relative;
  overflow: hidden;
  display: grid;
  gap: 5px;
  min-height: 86px;
  padding: 15px 16px;
  border: 1px solid var(--theme-border);
  border-radius: 11px;
  background: var(--theme-panel-soft);
}
.metric-card::after { position: absolute; right: 12px; bottom: 12px; width: 54px; height: 22px; border-bottom: 1px solid var(--theme-accent); border-radius: 50%; content: ""; opacity: 0.65; transform: rotate(-7deg); }
.metric-card:nth-child(2)::after { border-color: var(--theme-tone-blue); }
.metric-card:nth-child(3)::after { border-color: var(--theme-tone-amber); }
.metric-card:nth-child(4)::after { border-color: var(--theme-accent); }
.metric-card:nth-child(5)::after { border-color: var(--theme-tone-violet); }
.metric-card:first-child { border-color: var(--theme-border-control); }
.metric-card:nth-child(2) { border-color: var(--theme-tone-blue); }
.metric-card:nth-child(3) { border-color: var(--theme-tone-amber); }
.metric-card:nth-child(4) { border-color: var(--theme-accent); }
.metric-card:nth-child(5) { border-color: var(--theme-border-control); }
.metric-card span {
  color: var(--theme-text-muted);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
}
.metric-card strong {
  color: var(--theme-text);
  font-size: 18px;
}
.metric-card small {
  color: var(--theme-text-secondary);
  font-size: 10px;
}
.filters-panel {
  padding: 17px;
}
.filter-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 15px;
}
.filter-check {
  align-self: end;
  min-height: 36px;
}
.audit-panel {
  padding: 17px;
  margin-top: 14px;
}
.audit-empty {
  padding: 18px 0 4px;
  color: var(--theme-text-secondary);
  font-size: 11px;
}
.audit-list {
  display: grid;
  margin-top: 12px;
}
.audit-row {
  display: grid;
  grid-template-columns: 9px 150px minmax(0, 1fr) 150px;
  align-items: center;
  gap: 9px;
  padding: 9px 0;
  border-top: 1px solid var(--theme-border);
  color: var(--theme-text-secondary);
  font-size: 11px;
}
.audit-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-control-hover);
}
.audit-dot.success {
  background: var(--theme-accent);
}
.audit-dot.failed {
  background: var(--theme-tone-red);
}
.audit-action {
  color: var(--theme-text);
  font-weight: 700;
}
.audit-detail {
  overflow: hidden;
  color: var(--theme-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.audit-row time {
  color: var(--theme-text-secondary);
  font-size: 10px;
  text-align: right;
}
.account-list {
  display: grid;
  gap: 5px;
  margin-top: 16px;
}
.account-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 9px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--theme-text);
  text-align: left;
  cursor: pointer;
}
.account-item:hover {
  background: var(--theme-tone-blue);
}
.account-item.active {
  border-color: var(--theme-accent);
  background: var(--theme-accent);
}
.account-avatar {
  display: grid;
  place-items: center;
  width: 29px;
  height: 29px;
  border-radius: 8px;
  background: var(--theme-accent);
  color: var(--theme-accent);
  font-size: 12px;
  font-weight: 800;
}
.account-copy {
  display: grid;
  flex: 1;
  min-width: 0;
}
.account-copy strong {
  overflow: hidden;
  color: var(--theme-text);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-copy small {
  overflow: hidden;
  color: var(--theme-text-secondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty-account {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 32px 6px 18px;
  color: var(--theme-text-secondary);
  text-align: center;
}
.empty-account strong {
  color: var(--theme-text);
  font-size: 12px;
}
.empty-account span {
  font-size: 11px;
  line-height: 1.5;
}
.connection-card {
  display: grid;
  gap: 8px;
  margin-top: 18px;
  padding: 11px;
  border: 1px solid var(--theme-border-control);
  border-radius: 10px;
  background: var(--theme-panel-soft);
  color: var(--theme-text-secondary);
  font-size: 10px;
  line-height: 1.45;
}
.connection-title {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--theme-text);
  font-size: 11px;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-control-hover);
}
.status-dot.connected {
  background: var(--theme-accent);
  box-shadow: 0 0 0 3px rgba(84, 201, 135, 0.12);
}
.status-dot.signed-out {
  background: var(--theme-tone-red);
}
.empty-creators {
  display: grid;
  justify-items: center;
  gap: 9px;
  padding: 58px 20px;
  color: var(--theme-text-secondary);
  text-align: center;
}
.empty-creators strong {
  color: var(--theme-text);
  font-size: 14px;
}
.empty-creators span {
  max-width: 340px;
  font-size: 12px;
  line-height: 1.5;
}
.page-tabs {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: auto;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-text-secondary);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}
.tab.active {
  border-color: var(--theme-accent);
  background: var(--theme-accent);
  color: var(--theme-accent);
}
.tab-spacer {
  flex: 1;
  min-width: 8px;
}
.creator-panel {
  min-height: 426px;
}
.heading-actions {
  display: flex;
  gap: 8px;
}
.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding: 9px 10px;
  border-top: 1px solid var(--theme-border);
  border-bottom: 1px solid var(--theme-border);
  color: var(--theme-text-secondary);
  font-size: 11px;
}
.check-label {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--theme-text);
}
.check-label input,
.switch-row input {
  accent-color: var(--theme-accent);
}
.creator-table-wrap {
  overflow: auto;
  max-height: 470px;
}
.creator-table-wrap table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.creator-table-wrap th {
  padding: 11px 8px;
  color: var(--theme-text-secondary);
  font-size: 10px;
  font-weight: 700;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.creator-table-wrap td {
  padding: 11px 8px;
  border-top: 1px solid var(--theme-border);
  color: var(--theme-text-secondary);
}
.creator-table-wrap td strong {
  color: var(--theme-text);
  font-weight: 600;
}
.check-cell {
  width: 30px;
}
.state-pill {
  display: inline-flex;
  padding: 4px 7px;
  border-radius: 5px;
  background: var(--theme-panel-soft);
  color: var(--theme-text-secondary);
  font-size: 10px;
}
.state-pill.invited {
  background: var(--theme-accent);
  color: var(--theme-accent);
}
.composer {
  display: grid;
  gap: 14px;
}
.commission-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.field-label {
  display: grid;
  gap: 6px;
  color: var(--theme-text-secondary);
  font-size: 11px;
  font-weight: 700;
}
.field-label input,
.field-label textarea,
.field-label select {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 10px;
  border: 1px solid var(--theme-border-control);
  border-radius: 7px;
  outline: none;
  background: var(--theme-panel);
  color: var(--theme-text);
  font: inherit;
  font-size: 12px;
}
.field-label textarea {
  min-height: 80px;
  resize: vertical;
  line-height: 1.5;
}
.field-label small,
.switch-row small {
  color: var(--theme-text-muted);
  font-size: 10px;
  font-weight: 400;
  line-height: 1.4;
}
.switch-row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px;
  border: 1px solid var(--theme-border-control);
  border-radius: 8px;
  background: var(--theme-panel-soft);
}
.switch-row span {
  display: grid;
  gap: 4px;
  color: var(--theme-accent);
  font-size: 11px;
}
.preview-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--theme-border-control);
  border-radius: 9px;
  background: var(--theme-panel-soft);
}
.preview-meta {
  display: flex;
  justify-content: space-between;
  color: var(--theme-accent);
  font-size: 10px;
}
.preview-meta strong {
  color: var(--theme-text);
}
.preview-card p {
  margin: 0;
  color: var(--theme-text);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in srgb, var(--theme-input) 72%, transparent);
  backdrop-filter: blur(4px);
}
.modal {
  width: min(480px, 100%);
  padding: 20px;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.modal-header h2 {
  margin: 6px 0 0;
  color: var(--theme-text);
  font-size: 18px;
}
.modal-copy {
  margin: 9px 0 20px;
  color: var(--theme-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.form-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 10px;
  margin-top: 14px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 22px;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 1180px) {
  .metrics-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .library-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .library-heading { flex-direction: column; }
  .library-toolbar { width: 100%; }
  .workspace-grid,
  .tab-layout {
    grid-template-columns: 210px minmax(0, 1fr);
  }
  .tab-layout > .composer {
    grid-column: 1 / -1;
  }
  .campaign-layout {
    grid-template-columns: 160px minmax(0, 1fr);
  }
  .campaign-layout > .creator-panel {
    grid-column: 1 / -1;
  }
  .composer {
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .composer .panel-heading,
  .composer .field-label:nth-of-type(3),
  .composer .button--full,
  .composer .preview-card {
    grid-column: 1 / -1;
  }
  .overview-grid {
    grid-template-columns: 220px minmax(0, 1fr);
  }
}
.form-row {
  min-width: 0;
}
@media (max-width: 760px) {
  .outreach-page {
    padding: 20px 14px 30px;
  }
  .workspace-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .hero-visual {
    display: none !important;
  }
  .header-actions {
    width: 100%;
    justify-content: space-between;
  }
  .workspace-grid,
  .tab-layout,
  .overview-grid,
  .campaign-layout {
    grid-template-columns: 1fr;
  }
  .composer {
    grid-template-columns: 1fr;
  }
  .metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .brand-block h1 { font-size: 28px; }
  .composer .panel-heading,
  .composer .field-label:nth-of-type(3),
  .composer .button--full,
  .composer .preview-card {
    grid-column: auto;
  }
  .workspace-tabs {
    flex-wrap: wrap;
  }
  .tab-spacer {
    display: none;
  }
  .form-row,
  .api-grid {
    grid-template-columns: 1fr;
  }
  .metrics-grid,
  .filter-grid,
  .quick-grid {
    grid-template-columns: 1fr 1fr;
  }
  .library-metrics { grid-template-columns: 1fr 1fr; }
  .library-toolbar { flex-wrap: wrap; }
  .toolbar-search { flex: 1 1 100%; width: auto; }
  .campaign-mode {
    display: flex;
  }
  .audit-row {
    grid-template-columns: 9px 1fr;
  }
  .audit-detail,
  .audit-row time {
    grid-column: 2;
    text-align: left;
  }
}
.field-label select {
  appearance: auto;
}
.field-label--spaced {
  margin-top: 14px;
}
.modal-copy--compact {
  margin: 8px 0 0;
  font-size: 10px;
}
.url-preview {
  display: grid;
  gap: 5px;
  margin-top: 12px;
  padding: 9px 10px;
  border: 1px solid var(--theme-border-control);
  border-radius: 7px;
  background: var(--theme-panel);
}
.url-preview span {
  color: var(--theme-text-secondary);
  font-size: 10px;
  font-weight: 700;
}
.url-preview code {
  overflow-wrap: anywhere;
  color: var(--theme-accent);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 10px;
}
.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 112px;
  padding: 2px 4px 10px;
  margin-bottom: 8px;
}
.hero-visual {
  position: relative;
  display: block;
  flex: 1;
  min-width: 190px;
  max-width: 330px;
  height: 84px;
  overflow: hidden;
  opacity: 0.92;
}
.hero-visual::before {
  position: absolute;
  inset: 15px 10px 9px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 28%, transparent);
  border-radius: 50%;
  content: "";
  transform: rotate(-12deg) skewX(-14deg);
}
.hero-visual::after {
  position: absolute;
  right: 24px;
  top: 37px;
  width: 120px;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--theme-accent) 80%, transparent), transparent);
  content: "";
  transform: rotate(-18deg);
}
.hero-node {
  position: absolute;
  z-index: 2;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 65%, transparent);
  border-radius: 12px;
  background: var(--theme-accent);
  color: var(--theme-accent);
  box-shadow: 0 0 22px rgba(56, 192, 148, 0.2);
}
.hero-node--primary {
  left: 42%;
  top: 14px;
  width: 48px;
  height: 48px;
  border-color: color-mix(in srgb, var(--theme-tone-blue) 72%, transparent);
  background: var(--theme-tone-blue);
  color: var(--theme-tone-blue);
  transform: rotate(-9deg);
}
.hero-node--secondary {
  left: 16%;
  top: 12px;
  width: 30px;
  height: 30px;
  color: var(--theme-tone-violet);
  border-color: color-mix(in srgb, var(--theme-tone-violet) 58%, transparent);
  background: var(--theme-panel-soft);
}
.hero-node--tertiary {
  right: 9%;
  bottom: 9px;
  width: 32px;
  height: 32px;
  color: var(--theme-tone-amber);
  border-color: color-mix(in srgb, var(--theme-tone-amber) 55%, transparent);
  background: var(--theme-panel-soft);
}
.hero-orbit {
  position: absolute;
  border: 1px dashed color-mix(in srgb, var(--theme-accent) 30%, transparent);
  border-radius: 50%;
}
.hero-orbit--one {
  left: 27%;
  top: -10px;
  width: 170px;
  height: 110px;
  transform: rotate(17deg);
}
.hero-orbit--two {
  left: 34%;
  top: 25px;
  width: 130px;
  height: 58px;
  border-color: color-mix(in srgb, var(--theme-tone-blue) 28%, transparent);
  transform: rotate(-22deg);
}
.brand-block h1 {
  margin: 8px 0 6px;
  color: var(--theme-text);
  font-size: 34px;
  letter-spacing: -0.02em;
}
.brand-block p {
  margin: 0;
  color: var(--theme-text-secondary);
  font-size: 13px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.shop-chip {
  display: grid;
  grid-template-columns: 8px auto;
  column-gap: 7px;
  align-items: center;
  min-width: 178px;
  padding: 10px 13px;
  border: 1px solid var(--theme-border-control);
  border-radius: 9px;
  background: var(--theme-panel-soft);
  color: var(--theme-text);
  font-size: 11px;
}
.shop-chip small {
  grid-column: 2;
  color: var(--theme-text-secondary);
  font-size: 9px;
}
.shop-chip .status-dot {
  grid-row: 1 / span 2;
}
.workspace-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 8px;
  margin-bottom: 12px;
  position: sticky;
  top: 0;
  z-index: 4;
}
.overview-layout,
.tab-layout,
.campaign-layout {
  min-height: 520px;
}
.overview-grid {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 14px;
}
.quick-actions {
  padding: 22px;
}
.quick-actions h2 {
  margin: 7px 0 6px;
  font-size: 19px;
  color: var(--theme-text);
}
.quick-actions p {
  margin: 0 0 22px;
  color: var(--theme-text-secondary);
  font-size: 12px;
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.quick-grid button {
  display: grid;
  gap: 8px;
  min-height: 130px;
  padding: 16px;
  border: 1px solid var(--theme-border-control);
  border-radius: 11px;
  background: var(--theme-tone-blue);
  color: var(--theme-accent);
  text-align: left;
  cursor: pointer;
}
.quick-grid button:hover {
  border-color: var(--theme-accent);
  background: var(--theme-panel-soft);
}
.quick-grid strong {
  color: var(--theme-text);
  font-size: 13px;
}
.quick-grid small {
  color: var(--theme-text-secondary);
  font-size: 10px;
  line-height: 1.45;
}
.tab-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 310px;
  gap: 14px;
}
.campaign-layout {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) 300px;
  gap: 14px;
}
.campaign-mode {
  display: grid;
  align-content: start;
  gap: 5px;
  padding: 8px;
}
.mode-button {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 13px 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--theme-text-secondary);
  text-align: left;
  cursor: pointer;
}
.mode-button.active {
  border-color: var(--theme-accent);
  background: var(--theme-accent);
  color: var(--theme-tone-green);
}
.mode-button span {
  display: grid;
  gap: 4px;
}
.mode-button strong {
  font-size: 11px;
}
.mode-button small {
  color: var(--theme-text-secondary);
  font-size: 9px;
  line-height: 1.4;
}
.queue-summary {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 35px 10px 20px;
  border-bottom: 1px solid var(--theme-border);
}
.task-strip {
  padding: 14px 16px;
  margin-bottom: 14px;
}
.task-builder {
  display: grid;
  grid-template-columns: minmax(180px, 0.65fr) minmax(260px, 1.35fr);
  gap: 10px;
  margin-top: 12px;
}
.task-builder textarea {
  min-height: 48px;
}
.task-list {
  display: grid;
  margin-top: 8px;
}
.task-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 42px;
  border-top: 1px solid var(--theme-border);
  font-size: 11px;
}
.task-row > div {
  display: grid;
  flex: 1;
  gap: 3px;
}
.task-row strong {
  color: var(--theme-text);
}
.task-row small {
  color: var(--theme-text-secondary);
}
.state-pill.running {
  color: var(--theme-accent);
  background: var(--theme-accent);
}
.state-pill.failed,
.state-pill.cancelled {
  color: var(--theme-tone-red);
  background: var(--theme-panel-soft);
}
.queue-summary strong {
  color: var(--theme-text);
  font-size: 38px;
}
.queue-summary span,
.queue-current {
  color: var(--theme-text-secondary);
  font-size: 11px;
}
.queue-current {
  display: grid;
  gap: 8px;
  padding: 16px;
}
.queue-current strong {
  color: var(--theme-accent);
  font-size: 22px;
}
.queue-current small {
  color: var(--theme-text-secondary);
}
.api-config {
  margin-bottom: 0;
}
.settings-grid { align-items: stretch; }
.settings-header-line { display: flex; align-items: center; gap: 13px; }
.settings-header-icon { display: grid; place-items: center; width: 46px; height: 46px; border: 1px solid var(--theme-accent); border-radius: 12px; background: var(--theme-accent); color: var(--theme-accent); }
.settings-header-copy { margin: 5px 0 0; color: var(--theme-text-secondary); font-size: 11px; }
.settings-card { display: grid; gap: 13px; padding: 17px; border: 1px solid var(--theme-border-control); border-radius: 12px; background: var(--theme-panel-soft); }
.settings-card-title { display: flex; align-items: center; gap: 10px; color: var(--theme-text); font-size: 13px; }
.settings-card-title > div { display: grid; gap: 4px; min-width: 0; }
.settings-card-title small { color: var(--theme-text-secondary); font-size: 10px; font-weight: 400; line-height: 1.35; }
.settings-icon { display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid currentColor; border-radius: 9px; background: color-mix(in srgb, var(--theme-text) 7%, transparent); }
.settings-card .field-label { display: grid; gap: 6px; }
.settings-card--mint { border-color: var(--theme-accent); background: linear-gradient(145deg, var(--theme-panel-soft), var(--theme-panel-soft)); color: var(--theme-accent); }
.settings-card--violet { border-color: var(--theme-tone-violet); background: linear-gradient(145deg, var(--theme-panel-soft), var(--theme-tone-blue)); color: var(--theme-tone-violet); }
.settings-card--blue { border-color: var(--theme-tone-blue); background: linear-gradient(145deg, var(--theme-tone-blue), var(--theme-panel-soft)); color: var(--theme-tone-blue); }
.settings-card--amber { border-color: var(--theme-tone-amber); background: linear-gradient(145deg, var(--theme-panel-soft), var(--theme-panel-soft)); color: var(--theme-tone-amber); }
.settings-card input { color: var(--theme-text); }
.settings-actions { align-self: end; display: flex; gap: 9px; padding: 17px; border: 1px solid var(--theme-border-control); border-radius: 12px; background: linear-gradient(145deg, var(--theme-accent), var(--theme-tone-blue)); }
.settings-actions .button { flex: 1; }
.tab-layout .content-column {
  min-width: 0;
}
.campaign-products {
  padding: 14px 17px;
  margin-bottom: 14px;
}
.product-search {
  margin-top: 12px;
}
.product-picker-state {
  padding: 12px;
  margin-top: 8px;
  border: 1px dashed var(--theme-border-control);
  border-radius: 7px;
  color: var(--theme-text-secondary);
  font-size: 11px;
  text-align: center;
}
.product-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  max-height: 190px;
  overflow: auto;
  margin-top: 8px;
}
.product-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--theme-border);
  border-radius: 7px;
  background: var(--theme-panel);
  cursor: pointer;
}
.product-option:has(input:checked) {
  border-color: var(--theme-accent);
  background: var(--theme-accent);
}
.product-option span {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.product-option strong {
  overflow: hidden;
  color: var(--theme-text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.product-option small {
  overflow: hidden;
  color: var(--theme-text-secondary);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.outreach-page {
  background:
    radial-gradient(circle at 92% 0%, color-mix(in srgb, var(--theme-accent) 12%, transparent), transparent 32%),
    var(--theme-panel);
}
.workspace-header {
  padding: 4px 0 18px;
  border-bottom: 1px solid var(--theme-border);
}
.brand-block h1 {
  letter-spacing: -0.01em;
}
.metrics-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
.metric-card {
  min-height: 92px;
  align-content: space-between;
  background: linear-gradient(145deg, var(--theme-panel-soft), var(--theme-panel));
}
.workspace-tabs {
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(12px);
}
.tab.active {
  box-shadow: inset 0 0 0 1px rgba(84, 201, 135, 0.12);
}
.campaign-products {
  background: linear-gradient(145deg, var(--theme-panel-soft), var(--theme-panel-soft));
}
.product-options {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.product-option {
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    transform 0.15s ease;
}
.product-option:hover {
  border-color: var(--theme-border-control);
  transform: translateY(-1px);
}
.filter-grid .field-label input,
.filter-grid .field-label select {
  background: var(--theme-panel-soft);
}
.creator-table-wrap {
  border: 1px solid var(--theme-border);
  border-radius: 9px;
  background: var(--theme-panel);
}
.creator-table-wrap th {
  background: var(--theme-panel-soft);
  position: sticky;
  top: 0;
  z-index: 1;
}
.queue-summary {
  background: linear-gradient(180deg, var(--theme-panel-soft), transparent);
}
.preview-card {
  box-shadow: 0 10px 24px rgba(26, 125, 82, 0.12);
}
.campaign-layout > .campaign-products {
  grid-column: 1 / -1;
}
.campaign-layout > .campaign-mode {
  grid-column: 1;
}
.campaign-layout > .composer {
  grid-column: 2;
}
.campaign-layout > .creator-panel {
  grid-column: 3;
}
.campaign-products {
  margin-bottom: 0;
}
.campaign-products .product-options {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  max-height: 170px;
}
@media (max-width: 1180px) {
  .campaign-layout > .campaign-mode {
    grid-column: 1;
  }
  .campaign-layout > .composer {
    grid-column: 2;
  }
  .campaign-layout > .creator-panel {
    grid-column: 1 / -1;
  }
  .campaign-products .product-options {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .campaign-layout > .campaign-mode,
  .campaign-layout > .composer,
  .campaign-layout > .creator-panel,
  .campaign-layout > .campaign-products {
    grid-column: auto;
  }
  .campaign-products .product-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .task-builder {
    grid-template-columns: 1fr;
  }
  .task-row {
    flex-wrap: wrap;
    padding: 8px 0;
  }
}

/* Compact campaign workspace. Keep task controls and configuration visible together. */
.outreach-workbench {
  display: grid;
  gap: 12px;
  min-height: 0;
}
.workbench-toolbar {
  display: grid;
  grid-template-columns: minmax(170px, 1fr) minmax(150px, 1fr) 112px 112px auto;
  align-items: end;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--theme-border);
  border-radius: 10px;
  background: var(--theme-panel-soft);
}
.toolbar-title {
  display: grid;
  gap: 5px;
  padding: 0 4px 3px;
}
.toolbar-title strong {
  color: var(--theme-text);
  font-size: 14px;
}
.toolbar-field {
  display: grid;
  gap: 5px;
  color: var(--theme-text-secondary);
  font-size: 10px;
  font-weight: 700;
}
.toolbar-field select,
.toolbar-field input {
  width: 100%;
  height: 34px;
  padding: 0 9px;
  border: 1px solid var(--theme-border-control);
  border-radius: 6px;
  background: var(--theme-panel);
  color: var(--theme-text);
  font: inherit;
}
.toolbar-action {
  min-height: 34px;
  white-space: nowrap;
}
.specified-input {
  max-width: 720px;
  padding: 12px 14px;
  border: 1px dashed var(--theme-border-control);
  border-radius: 9px;
  background: var(--theme-panel);
}
.specified-input textarea {
  min-height: 65px;
}
.workbench-main {
  display: grid;
  grid-template-columns: 150px minmax(480px, 1fr) minmax(280px, 340px);
  gap: 12px;
  align-items: start;
}
.outreach-workbench .campaign-mode,
.outreach-workbench .composer,
.outreach-workbench .workbench-side {
  border: 1px solid var(--theme-border);
  border-radius: 10px;
  background: var(--theme-panel-soft);
  box-shadow: none;
}
.outreach-workbench .campaign-mode {
  display: grid;
  align-content: start;
  gap: 4px;
  padding: 7px;
}
.outreach-workbench .mode-button {
  min-height: 76px;
  padding: 12px 10px;
  border-radius: 7px;
}
.outreach-workbench .composer {
  padding: 16px;
}
.outreach-workbench .composer-hint {
  padding: 5px 8px;
  border-radius: 5px;
  background: var(--theme-accent);
  color: var(--theme-accent);
  font-size: 10px;
  font-weight: 700;
}
.composer-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.composer-grid .commission-grid {
  grid-column: 1 / -1;
  margin-top: 0;
}
.message-field {
  margin-top: 12px;
}
.message-field textarea {
  min-height: 128px;
  resize: vertical;
}
.outreach-workbench .button--full {
  margin-top: 12px;
}
.workbench-side {
  display: grid;
  overflow: hidden;
}
.product-picker,
.queue-card {
  padding: 14px;
}
.product-picker + .queue-card {
  border-top: 1px solid var(--theme-border);
}
.product-picker .panel-heading h2,
.queue-card .panel-heading h2 {
  font-size: 13px;
}
.product-search {
  margin-top: 10px;
}
.product-search input {
  height: 34px;
}
.outreach-workbench .product-options {
  grid-template-columns: 1fr;
  max-height: 248px;
  padding-right: 2px;
}
.outreach-workbench .product-option {
  padding: 8px;
  border-radius: 6px;
}
.outreach-workbench .product-picker-state {
  min-height: 72px;
  display: grid;
  place-items: center;
}
.queue-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 14px;
}
.queue-metrics div {
  display: grid;
  gap: 4px;
  padding: 11px;
  border: 1px solid var(--theme-border);
  border-radius: 7px;
  background: var(--theme-panel);
}
.queue-metrics strong {
  color: var(--theme-text);
  font-size: 20px;
}
.queue-metrics span {
  color: var(--theme-text-secondary);
  font-size: 10px;
}
.outreach-workbench .queue-current {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding: 10px 0 0;
  border-top: 1px solid var(--theme-border);
}
.outreach-workbench .queue-current strong {
  color: var(--theme-accent);
  font-size: 13px;
}
@media (max-width: 1080px) {
  .workbench-toolbar {
    grid-template-columns: 1fr 1fr 100px 100px;
  }
  .toolbar-title,
  .toolbar-action {
    grid-column: span 2;
  }
  .workbench-main {
    grid-template-columns: 140px minmax(0, 1fr);
  }
  .workbench-side {
    grid-column: 1 / -1;
    grid-template-columns: 1fr 1fr;
  }
  .product-picker + .queue-card {
    border-top: 0;
    border-left: 1px solid var(--theme-border);
  }
}
@media (max-width: 700px) {
  .workbench-toolbar,
  .workbench-main,
  .workbench-side {
    grid-template-columns: 1fr;
  }
  .toolbar-title,
  .toolbar-action {
    grid-column: auto;
  }
  .outreach-workbench .campaign-mode {
    grid-template-columns: 1fr 1fr;
  }
  .product-picker + .queue-card {
    border-top: 1px solid var(--theme-border);
    border-left: 0;
  }
  .composer-grid {
    grid-template-columns: 1fr;
  }
}
</style>
