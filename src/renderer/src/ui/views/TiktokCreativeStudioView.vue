<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import BatchDeleteDialog from "../components/BatchDeleteDialog.vue";
import ProductSelectDialog from "../components/ProductSelectDialog.vue";
import RuntimeLogDialog from "../components/RuntimeLogDialog.vue";
import {
  AlertTriangle,
  Captions,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Code2,
  Download,
  FileImage,
  Filter,
  FolderOpen,
  Grid2x2,
  Headphones,
  Heart,
  ImagePlus,
  KeyRound,
  LayoutGrid,
  List,
  LoaderCircle,
  Logs,
  Music2,
  Package,
  PanelBottomOpen,
  Pause,
  Pencil,
  Play,
  RefreshCcw,
  ScanLine,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-vue-next";
const props = withDefaults(defineProps<{ publisherOnly?: boolean }>(), {
  publisherOnly: false,
});
type Account = {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  state: string;
  credit?: number;
  cookieCount: number;
  lastError?: string;
  updatedAt: number;
};
type Product = {
  id: string;
  name: string;
  coverImagePath?: string;
  livePhotoReferenceImagePath?: string;
};
type Material = {
  id: string;
  localImagePath: string;
  boundProductId?: string;
  usageStatus: string;
  materialOrigin?: "original" | "derived";
};
type PromptVersion = {
  id: string;
  name: string;
  version: number;
  prompt: string;
  promptHash: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};
type LogItem = {
  id: string;
  level: "info" | "success" | "error";
  message: string;
  time: number;
};
type RequestTrace = {
  stage: "upload" | "create" | "check";
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  capturedAt: number;
};
type ReplacementRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  source?: "auto" | "manual";
  revision?: number;
  updatedAt?: number;
};
type QualityReport = {
  score?: number;
  decision?: string;
  hardFailures?: string[];
};
type SubtitlePresetId = "viral-hook" | "deal-punch" | "premium-drop";
type SubtitleCaptionStyle = {
  fontName: string;
  fontSize: number;
  fontColor: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  position: "top" | "center" | "bottom";
  textAlign: "left" | "center" | "right";
  safeMargin: number;
  maxLines: number;
  maxWidthRatio: number;
  lineGap: number;
  bottomMargin: number;
};
type Shot = {
  shotId: string;
  shotIndex: number;
  imagePath: string;
  referenceImagePath?: string;
  preparedImagePath?: string;
  imagePreparation?: {
    promptVersion?: number;
    promptVersionId?: string;
    promptHash?: string;
    imagePromptPreview?: unknown;
    replacementRegion?: ReplacementRegion;
    generationAttempts?: unknown[];
    qualityReport?: QualityReport;
    generatedStillPath?: string;
  };
  imageRetryCount?: number;
  imageRetryLimit?: number;
  imageRetryMode?: 'auto' | 'manual_once';
  imageValidationBypassed?: boolean;
  accountId?: string;
  officialTaskId?: string;
  officialVideoId?: string;
  remoteStatus?: string;
  status: string;
  resultVideoPath?: string;
  posterPath?: string;
  lastError?: string;
  logs: LogItem[];
  requestTrace?: RequestTrace[];
  subtitleVideoPath?: string;
  subtitleCoverImagePath?: string;
  subtitleJobId?: string;
  subtitleAppliedAt?: number;
  exportedAt?: number;
  exportedVideoPath?: string;
  createdAt: number;
  updatedAt: number;
};
type Task = {
  id: string;
  productId?: string;
  productName?: string;
  status: string;
  totalShots: number;
  completedShots: number;
  failedShots: number;
  waitingShots: number;
  shots: Shot[];
  logs: LogItem[];
  updatedAt: number;
};

const router = useRouter();
const { t: tr } = useI18n();
const activeTab = ref<"reference" | "library" | "publish">(
  props.publisherOnly ? "publish" : "reference",
);
const loading = ref(false);
const creating = ref(false);
const notice = ref("");
const errorText = ref("");
const products = ref<Product[]>([]);
const materials = ref<Material[]>([]);
const tasks = ref<Task[]>([]);
const accounts = ref<Account[]>([]);
const promptVersions = ref<PromptVersion[]>([]);
const selectedPromptVersionId = ref("");
const promptEditorName = ref("");
const promptEditorText = ref("");
const promptVersionBusy = ref(false);
const referenceImagePaths = ref<string[]>([]);
const selectedProductId = ref("");
const productPickerOpen = ref(false);
const accountDialogOpen = ref(false);
const materialDialogOpen = ref(false);
const retrySettingsOpen = ref(false);
const retrySettingsBusy = ref(false);
const creativeSettings = ref({ imageRetryLimit: 2 });
const accountName = ref("");
const accountCookieJson = ref("");
const editingAccountId = ref("");
const selectedMaterialIds = ref<string[]>([]);
const selectedShotIds = ref<string[]>([]);
const publisherTasks = ref<any[]>([]);
const publisherKey = ref("");
const publisherConfigured = ref(false);
const publisherMaskedKey = ref("");
const publisherSyncError = ref("");
const publisherConnection = ref("");
const publisherProduct = ref("");
const publisherTitle = ref("");
const publisherDescription = ref("");
const publisherTags = ref<string[]>([
  "#TikTok",
  "#好物推荐",
  "#生活分享",
  "#fyp",
  "#viral",
]);
const publisherTagInputOpen = ref(false);
const publisherTagDraft = ref("");
const publisherSchedule = ref("");
const publisherUnifiedSchedule = ref("");
const publisherScheduleMode = ref<"keep" | "unified" | "sequence">("keep");
const publisherSequenceInterval = ref(10);
const publisherConnections = ref<any[]>([]);
const publisherProducts = ref<any[]>([]);
const publisherProductsLoading = ref(false);
const publisherMusicQuery = ref("");
const publisherMusic = ref<any[]>([]);
const publisherFavoriteMusic = ref<any[]>([]);
const publisherSelectedMusic = ref<any | null>(null);
const publisherMusicLibraryOpen = ref(false);
const publisherMusicPlayingId = ref("");
let publisherMusicAudio: HTMLAudioElement | null = null;
const publisherEditId = ref("");
const publisherBusy = ref(false);
const publisherLoadedAt = ref(0);
let publisherRefreshPromise: Promise<void> | null = null;
const publisherPrecheckState = ref<"idle" | "running" | "passed" | "failed">("idle");
const publisherPrecheckMessage = ref("");
const publisherPrecheckEnabled = ref(false);
const publisherPickerOpen = ref(false);
const publisherPickerProduct = ref("");
const publisherPickerSelected = ref<string[]>([]);
const publisherPickerSource = ref<"clone" | "live-photo" | "creative">("clone");
const publisherLivePhotoItems = ref<any[]>([]);
const publisherCloneItems = ref<any[]>([]);
const publisherPickerLoading = ref(false);
const publisherPickerPage = ref(1);
const publisherPickerPageSize = 12;
const publisherStep = ref(1);
const publisherRowSelection = ref<string[]>([]);
const publisherPage = ref(1);
const publisherPageSize = ref(20);
const publisherFilterStatus = ref("all");
const publisherFilterAccount = ref("all");
const publisherFilterProduct = ref("all");
const publisherFilterDate = ref("");
const publisherAppliedFilters = reactive({
  status: "all",
  account: "all",
  product: "all",
  date: "",
});
const publisherOverviewFilter = ref<
  "all" | "video" | "pending" | "draft" | "published"
>("pending");
const publisherDateInput = ref<HTMLInputElement | null>(null);
const publisherSearch = ref("");
const publisherCredentialOpen = ref(false);
const publisherDrawerOpen = ref(false);
const publisherDeleteTarget = ref<any | null>(null);
const publisherStatusDetail = ref<any | null>(null);
const publisherConfirmOpen = ref(false);
const publisherConfirmCount = ref(0);
const publisherOverwriteTitle = ref(false);
const publisherOverwriteDescription = ref(false);
const publisherInlineEditId = ref("");
const publisherEditorFields = reactive({
  title: true,
  description: false,
  tags: true,
  product: false,
  schedule: false,
  music: false,
});
const publisherApplyMode = ref<"empty" | "all">("empty");
const publisherSelector = ref<
  "account" | "product" | "music" | "videoProduct" | ""
>("");
const publisherSelectorAfterAccount = ref<"product" | "music" | "">("");
const publisherSelectorQuery = ref("");
const libraryFilter = ref<
  | "all"
  | "completed"
  | "running"
  | "failed"
  | "paused"
  | "success_not_exported"
  | "success_exported"
  | "success_not_subtitled"
>("all");
const libraryViewMode = ref<"grid" | "list">("grid");
const libraryPage = ref(1);
const libraryPageSize = 12;
const detailTask = ref<Task | null>(null);
const detailShot = ref<Shot | null>(null);
const detailTab = ref<"overview" | "request">("overview");
const runtimeTask = ref<Task | null>(null);
const runtimeShot = ref<Shot | null>(null);
const liveSubtitleDialogOpen = ref(false);
const subtitleDialogBusy = ref(false);
const subtitleDialogMode = ref<"batch" | "single">("batch");
const subtitleDialogTab = ref<"title" | "template" | "style">("title");
const subtitleTitleStrategy = ref<"single_for_all" | "random_pool">(
  "single_for_all",
);
const subtitleTitleText = ref("");
const subtitleTitlePoolText = ref("");
const subtitleSelectedPreset = ref<SubtitlePresetId>("viral-hook");
const subtitleCaptionStyle = reactive<SubtitleCaptionStyle>({
  fontName: "SimHei",
  fontSize: 68,
  fontColor: "#FFFFFF",
  strokeColor: "#101116",
  strokeWidth: 8,
  shadowColor: "rgba(0, 0, 0, 0.34)",
  shadowBlur: 10,
  position: "bottom",
  textAlign: "center",
  safeMargin: 10,
  maxLines: 2,
  maxWidthRatio: 0.8,
  lineGap: 6,
  bottomMargin: 188,
});
const subtitleDialogTargets = ref<Array<{ taskId: string; shotId: string }>>(
  [],
);
const videoDialog = ref<{ task: Task; shot: Shot } | null>(null);
const deleteTarget = ref<{ task: Task; shot: Shot } | null>(null);
const deleteBusy = ref(false);
const batchDeleteOpen = ref(false);
const batchDeleteBusy = ref(false);
const regionDialogTarget = ref<{ task: Task; shot: Shot } | null>(null);
const regionStage = ref<HTMLElement | null>(null);
const regionBusy = ref(false);
const regionDraft = ref({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
const regionCorners = ["nw", "ne", "sw", "se"] as const;
const regionInteraction = ref<{
  mode: "draw" | "move" | "resize";
  corner?: "nw" | "ne" | "sw" | "se";
  startX: number;
  startY: number;
  initial: { x: number; y: number; width: number; height: number };
} | null>(null);
const runtimeDialogOpen = computed({
  get: () => Boolean(runtimeTask.value),
  set: (value: boolean) => {
    if (!value) {
      runtimeTask.value = null;
      runtimeShot.value = null;
    }
  },
});
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const selectedProduct = computed(() =>
  products.value.find((item) => item.id === selectedProductId.value),
);
const enabledAccounts = computed(() =>
  accounts.value.filter((item) => item.enabled),
);
const derivedMaterials = computed(() =>
  materials.value.filter(
    (item) =>
      item.materialOrigin === "derived" && Boolean(item.localImagePath?.trim()),
  ),
);
const allShots = computed(() =>
  tasks.value
    .flatMap((task) => task.shots.map((shot) => ({ task, shot })))
    .sort(
      (a, b) =>
        Number(b.shot.createdAt || b.shot.updatedAt || b.task.updatedAt || 0) -
          Number(
            a.shot.createdAt || a.shot.updatedAt || a.task.updatedAt || 0,
          ) ||
        Number(b.shot.updatedAt || b.task.updatedAt || 0) -
          Number(a.shot.updatedAt || a.task.updatedAt || 0) ||
        String(b.shot.shotId).localeCompare(String(a.shot.shotId)),
    ),
);
const filteredItems = computed(() =>
  allShots.value.filter(({ shot }) => {
    if (libraryFilter.value === "all") return true;
    if (libraryFilter.value === "completed") return shot.status === "completed";
    if (libraryFilter.value === "running")
      return (
        shot.status === "running" ||
        shot.remoteStatus === "processing" ||
        shot.remoteStatus === "queued"
      );
    if (libraryFilter.value === "failed") return shot.status === "failed";
    if (libraryFilter.value === "success_exported")
      return shot.status === "completed" && Boolean(shot.exportedVideoPath);
    if (libraryFilter.value === "success_not_exported")
      return shot.status === "completed" && !shot.exportedVideoPath;
    if (libraryFilter.value === "success_not_subtitled")
      return (
        shot.status === "completed" &&
        !shot.subtitleVideoPath &&
        !shot.subtitleAppliedAt
      );
    return (
      shot.status === "requires_manual" ||
      shot.remoteStatus === "paused_auth" ||
      shot.remoteStatus === "paused_error"
    );
  }),
);
const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredItems.value.length / libraryPageSize)),
);
const pagedItems = computed(() =>
  filteredItems.value.slice(
    (libraryPage.value - 1) * libraryPageSize,
    libraryPage.value * libraryPageSize,
  ),
);
const completedCount = computed(
  () => allShots.value.filter(({ shot }) => shot.status === "completed").length,
);
const runningCount = computed(
  () =>
    allShots.value.filter(
      ({ shot }) =>
        shot.status === "running" || shot.remoteStatus === "processing",
    ).length,
);
const selectedPromptVersion = computed(() =>
  promptVersions.value.find(
    (item) => item.id === selectedPromptVersionId.value,
  ),
);
const publishedShotMap = computed(
  () =>
    new Map(
      publisherTasks.value
        .filter((item) => item.sourceShotId && item.state === "published")
        .map((item) => [item.sourceShotId, item]),
    ),
);
const publisherPickerItems = computed(() =>
  allShots.value.filter(
    ({ task, shot }) =>
      shot.status === "completed" &&
      Boolean(shot.resultVideoPath || shot.subtitleVideoPath) &&
      !publishedShotMap.value.has(shot.shotId) &&
      (!publisherPickerProduct.value ||
        task.productId === publisherPickerProduct.value),
  ),
);
const publisherPublishedPaths = computed(
  () =>
    new Set(
      publisherTasks.value
        .filter((item) => item.state === "published")
        .map((item) => String(item.sourceVideoPath || "").toLowerCase()),
    ),
);
const publisherSourceItems = computed(() => {
  if (publisherPickerSource.value === "creative") {
    return publisherPickerItems.value.map(({ task, shot }) => ({
      key: `creative:${shot.shotId}`,
      taskId: task.id,
      shotId: shot.shotId,
      title: task.productName || "Unassigned product",
      filePath: shot.subtitleVideoPath || shot.resultVideoPath || "",
      posterPath: shot.posterPath || shot.imagePath || "",
      productId: task.productId || "",
      createdAt: shot.createdAt,
    }));
  }
  if (publisherPickerSource.value === "live-photo") {
    return publisherLivePhotoItems.value.map((item) => ({
      key: `live-photo:${item.id}`,
      title:
        item.productSnapshot?.name ||
        fileName(publisherLivePhotoPath(item)) ||
        "Unassigned product",
      filePath: publisherLivePhotoPath(item),
      posterPath:
        item.livePhotoImagePath ||
        item.previewImagePath ||
        item.referenceImagePath ||
        "",
      productId: item.productId || item.productSnapshot?.id || "",
      createdAt: item.createdAt,
    }));
  }
  return publisherCloneItems.value.map((item) => ({
    key: `clone:${item.id}`,
    title: item.boundProductSnapshot?.name || item.productName || item.title,
    filePath: item.finalOutputPath,
    posterPath: item.coverAssetPath || "",
    productId: item.productId || item.boundProductSnapshot?.id || "",
    createdAt: item.updatedAt,
  }));
});
const publisherFilteredSourceItems = computed(() =>
  publisherSourceItems.value.filter(
    (item) =>
      !publisherPublishedPaths.value.has(String(item.filePath).toLowerCase()) &&
      (!publisherPickerProduct.value ||
        item.productId === publisherPickerProduct.value),
  ),
);
const publisherPickerPageCount = computed(() =>
  Math.max(
    1,
    Math.ceil(
      publisherFilteredSourceItems.value.length / publisherPickerPageSize,
    ),
  ),
);
const publisherPagedSourceItems = computed(() => {
  const start = (publisherPickerPage.value - 1) * publisherPickerPageSize;
  return publisherFilteredSourceItems.value.slice(
    start,
    start + publisherPickerPageSize,
  );
});
const publisherConnectionItem = computed(() =>
  publisherConnections.value.find(
    (item) => item.uid === publisherConnection.value,
  ),
);
const publisherProductItem = computed(() =>
  publisherProducts.value.find((item) => item.id === publisherProduct.value),
);
const publisherMusicItems = computed(() => {
  const items = [...publisherFavoriteMusic.value, ...publisherMusic.value];
  const uniqueItems = items.filter(
    (item, index) =>
      items.findIndex((candidate) => String(candidate.id) === String(item.id)) ===
      index,
  );
  return uniqueItems.filter((item) =>
    `${item.title || ""} ${item.author || ""}`
      .toLowerCase()
      .includes(publisherSelectorQuery.value.toLowerCase()),
  );
});
const publisherFilteredConnections = computed(() =>
  publisherConnections.value.filter((item) =>
    String(item.name || "")
      .toLowerCase()
      .includes(publisherSelectorQuery.value.toLowerCase()),
  ),
);
const publisherFilteredProducts = computed(() =>
  publisherProducts.value.filter((item) =>
    String(item.title || item.name || "")
      .toLowerCase()
      .includes(publisherSelectorQuery.value.toLowerCase()),
  ),
);
const publisherPreviewTask = computed(() => publisherTasks.value[0]);
const publisherPendingTasks = computed(() =>
  publisherTasks.value.filter((item) => item.state !== "published"),
);
const publisherSelectedTasks = computed(() => {
  const selected = publisherPendingTasks.value.filter((item) =>
    publisherRowSelection.value.includes(String(item.id)),
  );
  return selected.length ? selected : publisherPendingTasks.value;
});
const filteredPublisherTasks = computed(() =>
  publisherTasks.value.filter((item) => {
    if (
      publisherOverviewFilter.value === "pending" &&
      item.state === "published"
    )
      return false;
    if (
      publisherOverviewFilter.value === "draft" &&
      item.state !== "draft"
    )
      return false;
    if (
      publisherOverviewFilter.value === "published" &&
      item.state !== "published"
    )
      return false;
    if (
      publisherAppliedFilters.status === "pending" &&
      item.state === "published"
    )
      return false;
    if (
      publisherAppliedFilters.status !== "all" &&
      publisherAppliedFilters.status !== "pending" &&
      item.state !== publisherAppliedFilters.status
    )
      return false;
    if (
      publisherAppliedFilters.account !== "all" &&
      item.connectionUid !== publisherAppliedFilters.account
    )
      return false;
    if (
      publisherAppliedFilters.product !== "all" &&
      item.productId !== publisherAppliedFilters.product
    )
      return false;
    if (publisherAppliedFilters.date) {
      const rawDate = item.scheduleAt || item.createdAt || item.updatedAt;
      const itemDate = rawDate
        ? new Date(rawDate).toLocaleDateString("en-CA")
        : "";
      if (itemDate !== publisherAppliedFilters.date) return false;
    }
    const q = publisherSearch.value.trim().toLowerCase();
    return (
      !q ||
      `${item.sourceVideoPath || ""} ${item.videoTitle || ""} ${item.productTitle || ""}`
        .toLowerCase()
        .includes(q)
    );
  }).sort((a, b) => {
    const createdA = new Date(a.createdAt || 0).getTime();
    const createdB = new Date(b.createdAt || 0).getTime();
    return createdB - createdA;
  }),
);
const publisherPageCount = computed(() =>
  Math.max(
    1,
    Math.ceil(filteredPublisherTasks.value.length / publisherPageSize.value),
  ),
);
const publisherPaginationItems = computed<Array<number | "ellipsis-left" | "ellipsis-right">>(
  () => {
    const total = publisherPageCount.value;
    const current = publisherPage.value;
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

    const pages: Array<number | "ellipsis-left" | "ellipsis-right"> = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) pages.push("ellipsis-left");
    for (let page = start; page <= end; page += 1) pages.push(page);
    if (end < total - 1) pages.push("ellipsis-right");
    pages.push(total);
    return pages;
  },
);
const pagedPublisherTasks = computed(() =>
  filteredPublisherTasks.value.slice(
    (publisherPage.value - 1) * publisherPageSize.value,
    publisherPage.value * publisherPageSize.value,
  ),
);
const runtimeLogs = computed<LogItem[]>(() => {
  const task = runtimeTask.value;
  const shot = runtimeShot.value;
  if (!task) return [];
  const requestLogs: LogItem[] = (shot?.requestTrace || []).map(
    (trace, index) => ({
      id: `request-${shot?.shotId || task.id}-${trace.capturedAt}-${index}`,
      level: "info",
      message: `[tiktok-creative] ${trace.stage} request: ${trace.method} ${trace.url}`,
      time: trace.capturedAt,
    }),
  );
  return [...(task.logs || []), ...(shot?.logs || []), ...requestLogs]
    .filter((item) => item && String(item.message || "").trim())
    .sort((a, b) => Number(a.time || 0) - Number(b.time || 0));
});
const subtitleEligibleItems = computed(() =>
  allShots.value.filter(
    ({ shot }) =>
      selectedShotIds.value.includes(shot.shotId) &&
      Boolean(shot.resultVideoPath),
  ),
);
const subtitleDialogItems = computed(() =>
  subtitleDialogTargets.value.length
    ? allShots.value.filter(
        ({ task, shot }) =>
          subtitleDialogTargets.value.some(
            (item) => item.taskId === task.id && item.shotId === shot.shotId,
          ) && Boolean(shot.resultVideoPath),
      )
    : subtitleEligibleItems.value,
);

const subtitlePresets = computed<
  Array<{
    id: SubtitlePresetId;
    name: string;
    summary: string;
    style: Partial<SubtitleCaptionStyle>;
  }>
>(() => [
  {
    id: "viral-hook",
    name: tr("autoUi.k_469e324ba51b"),
    summary: tr("autoUi.k_4590ac4b0a19"),
    style: {
      fontName: "SimHei",
      fontSize: 68,
      fontColor: "#FFFFFF",
      strokeColor: "#101116",
      strokeWidth: 8,
      shadowColor: "rgba(0, 0, 0, 0.34)",
      shadowBlur: 10,
      position: "bottom",
      textAlign: "center",
      safeMargin: 10,
      maxLines: 2,
      maxWidthRatio: 0.8,
      lineGap: 6,
      bottomMargin: 188,
    },
  },
  {
    id: "deal-punch",
    name: tr("autoUi.k_16d824cf7aac"),
    summary: tr("autoUi.k_e11f729375a4"),
    style: {
      fontName: "Microsoft YaHei",
      fontSize: 64,
      fontColor: "#FFF7D6",
      strokeColor: "#17181F",
      strokeWidth: 6,
      shadowColor: "rgba(4, 6, 12, 0.42)",
      shadowBlur: 12,
      position: "bottom",
      textAlign: "center",
      safeMargin: 11,
      maxLines: 2,
      maxWidthRatio: 0.76,
      lineGap: 6,
      bottomMargin: 194,
    },
  },
  {
    id: "premium-drop",
    name: tr("autoUi.k_f958549b03fe"),
    summary: tr("autoUi.k_7d570b2ce11a"),
    style: {
      fontName: "Noto Sans SC",
      fontSize: 58,
      fontColor: "#F8FAFF",
      strokeColor: "#12131A",
      strokeWidth: 2,
      shadowColor: "rgba(5, 8, 16, 0.56)",
      shadowBlur: 16,
      position: "bottom",
      textAlign: "center",
      safeMargin: 14,
      maxLines: 2,
      maxWidthRatio: 0.68,
      lineGap: 8,
      bottomMargin: 212,
    },
  },
]);

function previewSrc(path?: string) {
  const value = String(path || "").trim();
  if (!value) return "";
  if (/^(https?:|data:|blob:|vg:)/i.test(value)) return value;
  return `vg://file?path=${encodeURIComponent(value)}`;
}
function publisherPosterSrc(item: any) {
  const poster = String(item?.posterPath || '').trim()
  return poster ? previewSrc(poster) : ''
}
function fileName(path?: string) {
  return (
    String(path || "")
      .replace(/\\/g, "/")
      .split("/")
      .pop() || "--"
  );
}
function formatTime(value?: number) {
  return value
    ? new Date(value).toLocaleString("zh-CN", { hour12: false })
    : "--";
}
function toPublisherDateTimeInput(value?: string | number) {
  const date = value ? new Date(value) : new Date(Date.now() + 3600000);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function formatPublisherSchedule(value?: string | number) {
  if (!value) return "立即发布";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "立即发布";
  return date
    .toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(/\//g, "-");
}
function publisherStateLabel(state?: string) {
  if (state === "published") return "已发布";
  if (state === "draft") return "草稿";
  if (state === "failed" || state === "result_unknown") return "发布失败";
  return "待发布";
}
function publisherErrorText(item: any) {
  const error = item?.error;
  if (!error) return "";
  return [
    error.message,
    error.reason,
    error.stage,
    error.request_id || error.requestId
      ? `request_id: ${error.request_id || error.requestId}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
function openPublisherStatusDetail(item: any) {
  publisherStatusDetail.value = item;
}
function closePublisherStatusDetail() {
  publisherStatusDetail.value = null;
}
function toPlainPublisherMusic(value: any) {
  if (!value || typeof value !== "object") return undefined;
  return {
    id: String(value.id || ""),
    title: String(value.title || ""),
    ...(value.author ? { author: String(value.author) } : {}),
    ...(value.url ? { url: String(value.url) } : {}),
    ...(value.duration !== undefined ? { duration: value.duration } : {}),
    ...(value.cover_url ? { cover_url: String(value.cover_url) } : {}),
    ...(value.play_url ? { play_url: String(value.play_url) } : {}),
  };
}
function toPlainPublisherTags(value: any) {
  return Array.isArray(value)
    ? value.map((tag) => String(tag)).filter(Boolean)
    : undefined;
}
function statusLabel(shot: Shot) {
  if (shot.status === "completed") return tr("autoUi.k_e99b48a29bdf");
  if (shot.status === "failed") return tr("autoUi.k_3e3c8068bb0e");
  if (shot.lastError?.includes("[image_retry_exhausted]"))
    return tr("autoUi.k_5b6a2e788b38");
  if (shot.remoteStatus === "paused_auth") return tr("autoUi.k_507c5e3e12fd");
  if (
    shot.remoteStatus === "paused_error" &&
    shot.lastError?.includes("[official_create_unconfirmed]")
  )
    return tr("autoUi.k_61001db409bf");
  if (shot.remoteStatus === "paused_error") return tr("autoUi.k_fcbae46bf890");
  if (shot.remoteStatus === "processing") return tr("autoUi.k_dbaa2b826577");
  if (shot.remoteStatus === "queued") return tr("autoUi.k_4dcbbcfa6154");
  return tr("autoUi.k_4f1f8aa3ffd7");
}
function statusTone(shot: Shot) {
  return shot.status === "completed"
    ? "status-completed"
    : shot.status === "failed"
      ? "status-failed"
      : shot.remoteStatus?.startsWith("paused")
        ? "status-paused"
        : "status-processing";
}
function libraryFilterLabel() {
  const labels: Record<string, string> = {
    all: tr("autoUi.k_778fc8f99453"),
    failed: tr("autoUi.k_3e3c8068bb0e"),
    success_not_exported: "成功未导出",
    success_exported: "成功已导出",
    success_not_subtitled: "成功未加字幕",
    completed: tr("autoUi.k_e99b48a29bdf"),
    running: tr("autoUi.k_fcb979ef0b91"),
    paused: tr("autoUi.k_130448bce675"),
  };
  return labels[libraryFilter.value] || labels.all;
}
function accountState(account: Account) {
  if (!account.enabled) return tr("autoUi.k_6c7dcbb73a59");
  if (account.state === "ready")
    return account.credit === undefined
      ? tr("autoUi.k_e91365cf9ed9")
      : tr("autoUi.k_01f834e6a36a", { p0: account.credit });
  if (account.state === "expired") return tr("autoUi.k_5ec33b304674");
  if (account.state === "insufficient_credit")
    return tr("autoUi.k_c10f1b66bbbd", {
      p0: account.credit === undefined ? "" : ` · ${account.credit}`,
    });
  if (account.state === "error") return tr("autoUi.k_92d705e913f9");
  return tr("autoUi.k_b681ca1274b8");
}
function setPromptVersion(id: string) {
  const item = promptVersions.value.find((version) => version.id === id);
  if (!item) return;
  promptEditorName.value = item.name;
  promptEditorText.value = item.prompt;
}
function syncRuntimeSelection() {
  if (!runtimeTask.value) return;
  const task = tasks.value.find((item) => item.id === runtimeTask.value?.id);
  if (!task) {
    runtimeTask.value = null;
    runtimeShot.value = null;
    return;
  }
  const shotId = runtimeShot.value?.shotId;
  runtimeTask.value = task;
  runtimeShot.value =
    task.shots.find((item) => item.shotId === shotId) || task.shots[0] || null;
}

async function refresh(silent = false) {
  if (!silent) loading.value = true;
  try {
    const [taskRows, productRows, accountResult, versions, settings] = await Promise.all([
      window.api.tiktokCreative.list(),
      window.api.products.list(),
      window.api.tiktokCreative.listAccounts(),
      window.api.tiktokCreative.listPromptVersions(),
      window.api.tiktokCreative.getSettings(),
    ]);
    tasks.value = Array.isArray(taskRows) ? taskRows : [];
    syncRuntimeSelection();
    products.value = Array.isArray(productRows) ? productRows : [];
    accounts.value = Array.isArray(accountResult?.accounts)
      ? accountResult.accounts
      : [];
    promptVersions.value = Array.isArray(versions) ? versions : [];
    creativeSettings.value.imageRetryLimit = Math.max(
      0,
      Math.min(20, Math.floor(Number(settings?.imageRetryLimit) || 0)),
    );
    if (!selectedProductId.value && products.value[0])
      selectedProductId.value = products.value[0].id;
    if (!selectedPromptVersionId.value && promptVersions.value[0]) {
      selectedPromptVersionId.value = (
        promptVersions.value.find((item) => item.active) ||
        promptVersions.value[0]
      ).id;
      setPromptVersion(selectedPromptVersionId.value);
    }
    if (libraryPage.value > totalPages.value)
      libraryPage.value = totalPages.value;
  } catch (error: any) {
    if (!silent) errorText.value = error?.message || String(error);
  } finally {
    if (!silent) loading.value = false;
  }
}
async function loadMaterials() {
  const rows = await window.api.productImageMaterials.listMaterials({
    userId: "desktop-local",
    filters: { category: "all", usageStatus: "all" },
  });
  materials.value = Array.isArray(rows) ? rows : [];
}
async function pickReferenceImages() {
  const paths = await window.api.pickFiles({
    title: tr("autoUi.k_7a2304707046"),
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    multiple: true,
  });
  referenceImagePaths.value = Array.from(
    new Set([
      ...referenceImagePaths.value,
      ...(Array.isArray(paths) ? paths : []),
    ]),
  );
}
async function openMaterialPicker() {
  await loadMaterials();
  selectedMaterialIds.value = [];
  materialDialogOpen.value = true;
}
function toggleMaterial(id: string) {
  if (!derivedMaterials.value.some((item) => item.id === id)) return;
  selectedMaterialIds.value = selectedMaterialIds.value.includes(id)
    ? selectedMaterialIds.value.filter((item) => item !== id)
    : [...selectedMaterialIds.value, id];
}
function addMaterials() {
  referenceImagePaths.value = Array.from(
    new Set([
      ...referenceImagePaths.value,
      ...derivedMaterials.value
        .filter((item) => selectedMaterialIds.value.includes(item.id))
        .map((item) => item.localImagePath),
    ]),
  );
  materialDialogOpen.value = false;
}
async function saveRetrySettings() {
  retrySettingsBusy.value = true;
  errorText.value = "";
  try {
    const imageRetryLimit = Math.max(
      0,
      Math.min(20, Math.floor(Number(creativeSettings.value.imageRetryLimit) || 0)),
    );
    const saved = await window.api.tiktokCreative.saveSettings({ imageRetryLimit });
    creativeSettings.value.imageRetryLimit = Number(saved?.imageRetryLimit) || 0;
    retrySettingsOpen.value = false;
    notice.value = tr("tiktokCreative.retry.saved");
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  } finally {
    retrySettingsBusy.value = false;
  }
}
async function createTasks() {
  if (!referenceImagePaths.value.length || !selectedProductId.value) return;
  if (!enabledAccounts.value.length) {
    accountDialogOpen.value = true;
    errorText.value = tr("autoUi.k_e13c090fda1b");
    return;
  }
  const imagePaths = [...referenceImagePaths.value];
  creating.value = true;
  notice.value = "";
  errorText.value = "";
  try {
    await window.api.tiktokCreative.createFromReference({
      referenceImagePaths: imagePaths,
      productId: selectedProductId.value,
      durationSec: 10,
    });
    notice.value = tr("autoUi.k_43510a9cf14d", { p0: imagePaths.length });
    referenceImagePaths.value = [];
    libraryPage.value = 1;
    setActiveTab("library");
    await refresh();
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  } finally {
    creating.value = false;
  }
}
async function savePrompt(mode: "update" | "copy" | "activate" | "rollback") {
  if (!selectedPromptVersionId.value) return;
  promptVersionBusy.value = true;
  try {
    if (mode === "update")
      await window.api.tiktokCreative.updatePromptVersion({
        id: selectedPromptVersionId.value,
        name: promptEditorName.value,
        prompt: promptEditorText.value,
      });
    if (mode === "copy") {
      const created = await window.api.tiktokCreative.createPromptVersion({
        name: promptEditorName.value || "TikTok Prompt Copy",
        prompt: promptEditorText.value,
      });
      selectedPromptVersionId.value = created.id;
    }
    if (mode === "activate")
      await window.api.tiktokCreative.activatePromptVersion({
        id: selectedPromptVersionId.value,
      });
    if (mode === "rollback") {
      const created = await window.api.tiktokCreative.rollbackPromptVersion({
        id: selectedPromptVersionId.value,
      });
      selectedPromptVersionId.value = created.id;
    }
    await refresh(true);
    setPromptVersion(selectedPromptVersionId.value);
    notice.value = tr("autoUi.k_8a527575cb30");
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  } finally {
    promptVersionBusy.value = false;
  }
}
async function importCookieFile() {
  const paths = await window.api.pickFiles({
    title: tr("autoUi.k_104146c36850"),
    filters: [{ name: "JSON", extensions: ["json", "txt"] }],
    multiple: false,
  });
  const path = String(paths?.[0] || "").trim();
  if (!path) return;
  const result = await window.api.readFileAsBase64({ path });
  accountCookieJson.value = decodeURIComponent(
    escape(atob(String(result || ""))),
  );
  if (!accountName.value)
    accountName.value = fileName(path).replace(/\.(json|txt)$/i, "");
}
function resetAccountForm() {
  editingAccountId.value = "";
  accountName.value = "";
  accountCookieJson.value = "";
}
function editAccount(account: Account) {
  editingAccountId.value = account.id;
  accountName.value = account.name;
  accountCookieJson.value = "";
}
async function saveAccount() {
  const accountId = editingAccountId.value;
  const cookieJson = accountCookieJson.value.trim();
  if (!accountId && !cookieJson) return;
  try {
    if (accountId && !cookieJson)
      await window.api.tiktokCreative.updateAccount({
        id: accountId,
        name: accountName.value,
      });
    else
      await window.api.tiktokCreative.importAccount({
        id: accountId || undefined,
        name: accountName.value,
        cookieJson,
      });
    resetAccountForm();
    await refresh(true);
    notice.value = accountId
      ? tr("autoUi.k_cd03db685a54")
      : tr("autoUi.k_9bd43c5d51d0");
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  }
}
async function testAccount(account: Account) {
  try {
    await window.api.tiktokCreative.testAccount(account.id);
    await refresh(true);
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  }
}
async function removeAccount(account: Account) {
  if (!window.confirm(tr("autoUi.k_75152608946f", { p0: account.name })))
    return;
  await window.api.tiktokCreative.removeAccount(account.id);
  await refresh(true);
}
async function toggleAccount(account: Account) {
  await window.api.tiktokCreative.updateAccount({
    id: account.id,
    enabled: !account.enabled,
  });
  await refresh(true);
}
async function moveAccount(account: Account, direction: -1 | 1) {
  const ordered = [...accounts.value].sort((a, b) => a.priority - b.priority);
  const index = ordered.findIndex((item) => item.id === account.id);
  const target = ordered[index + direction];
  if (!target) return;
  await window.api.tiktokCreative.updateAccount({
    id: account.id,
    priority: target.priority,
  });
  await window.api.tiktokCreative.updateAccount({
    id: target.id,
    priority: account.priority,
  });
  await refresh(true);
}
async function retryShot(task: Task, shot: Shot) {
  await window.api.tiktokCreative.retryShot({
    id: task.id,
    shotId: shot.shotId,
    retryMode: 'manual_once',
  });
  await refresh(true);
}
async function continueWithVideo(task: Task, shot: Shot) {
  errorText.value = '';
  try {
    await window.api.tiktokCreative.continueWithVideo({ id: task.id, shotId: shot.shotId });
    notice.value = tr('tiktokCreative.retry.continueWithVideoStarted');
    await refresh(true);
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  }
}
function canContinueWithVideo(shot: Shot) {
  return Boolean(
    shot.status === 'requires_manual' &&
      !shot.officialTaskId &&
      (shot.imageRetryMode === 'manual_once' || Number(shot.imageRetryCount || 0) >= Number(shot.imageRetryLimit || 0)) &&
      String(shot.lastError || '').includes('[image_retry_exhausted]') &&
      (shot.preparedImagePath || shot.imagePreparation?.generatedStillPath),
  );
}
function canRetryImageOnce(shot: Shot) {
  return Boolean(
    shot.status === 'requires_manual' &&
      !shot.officialTaskId &&
      String(shot.lastError || '').includes('[image_retry_exhausted]') &&
      (shot.referenceImagePath || shot.imagePath),
  )
}
function canCorrectRegion(shot: Shot) {
  return (
    !shot.officialTaskId &&
    Boolean(shot.referenceImagePath || shot.imagePath) &&
    Boolean(shot.lastError?.includes("[image_retry_exhausted]"))
  );
}
function imageAttemptCount(shot: Shot) {
  return shot.imagePreparation?.generationAttempts?.length || 0;
}
function qualityScore(shot: Shot) {
  const score = Number(shot.imagePreparation?.qualityReport?.score);
  return Number.isFinite(score) ? score.toFixed(3) : "--";
}
function qualityFailures(shot: Shot) {
  return shot.imagePreparation?.qualityReport?.hardFailures?.join(", ") || "--";
}
function clampRegion(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
function regionStyle() {
  return {
    left: `${regionDraft.value.x * 100}%`,
    top: `${regionDraft.value.y * 100}%`,
    width: `${regionDraft.value.width * 100}%`,
    height: `${regionDraft.value.height * 100}%`,
  };
}
function openRegionEditor(task: Task, shot: Shot) {
  const region = shot.imagePreparation?.replacementRegion;
  regionDraft.value = {
    x: Number(region?.x ?? 0.25),
    y: Number(region?.y ?? 0.25),
    width: Number(region?.width ?? 0.5),
    height: Number(region?.height ?? 0.5),
  };
  regionDialogTarget.value = { task, shot };
}
function closeRegionEditor() {
  if (regionBusy.value) return;
  regionInteraction.value = null;
  regionDialogTarget.value = null;
}
function normalizedRegionPointer(event: PointerEvent) {
  const bounds = regionStage.value?.getBoundingClientRect();
  if (!bounds) return { x: 0, y: 0 };
  return {
    x: clampRegion(
      (event.clientX - bounds.left) / Math.max(1, bounds.width),
      0,
      1,
    ),
    y: clampRegion(
      (event.clientY - bounds.top) / Math.max(1, bounds.height),
      0,
      1,
    ),
  };
}
function beginRegionInteraction(
  event: PointerEvent,
  mode: "draw" | "move" | "resize",
  corner?: "nw" | "ne" | "sw" | "se",
) {
  const point = normalizedRegionPointer(event);
  regionStage.value?.setPointerCapture(event.pointerId);
  const initial = { ...regionDraft.value };
  if (mode === "draw")
    regionDraft.value = { x: point.x, y: point.y, width: 0.02, height: 0.02 };
  regionInteraction.value = {
    mode,
    corner,
    startX: point.x,
    startY: point.y,
    initial:
      mode === "draw"
        ? { x: point.x, y: point.y, width: 0, height: 0 }
        : initial,
  };
}
function updateRegionInteraction(event: PointerEvent) {
  const interaction = regionInteraction.value;
  if (!interaction) return;
  const point = normalizedRegionPointer(event);
  const dx = point.x - interaction.startX;
  const dy = point.y - interaction.startY;
  const initial = interaction.initial;
  if (interaction.mode === "draw") {
    regionDraft.value = {
      x: Math.min(initial.x, point.x),
      y: Math.min(initial.y, point.y),
      width: Math.max(0.02, Math.abs(point.x - initial.x)),
      height: Math.max(0.02, Math.abs(point.y - initial.y)),
    };
    return;
  }
  if (interaction.mode === "move") {
    regionDraft.value = {
      ...initial,
      x: clampRegion(initial.x + dx, 0, 1 - initial.width),
      y: clampRegion(initial.y + dy, 0, 1 - initial.height),
    };
    return;
  }
  let left = initial.x;
  let top = initial.y;
  let right = initial.x + initial.width;
  let bottom = initial.y + initial.height;
  if (interaction.corner?.includes("w"))
    left = clampRegion(initial.x + dx, 0, right - 0.02);
  if (interaction.corner?.includes("e"))
    right = clampRegion(initial.x + initial.width + dx, left + 0.02, 1);
  if (interaction.corner?.includes("n"))
    top = clampRegion(initial.y + dy, 0, bottom - 0.02);
  if (interaction.corner?.includes("s"))
    bottom = clampRegion(initial.y + initial.height + dy, top + 0.02, 1);
  regionDraft.value = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}
function endRegionInteraction(event: PointerEvent) {
  regionInteraction.value = null;
  if (regionStage.value?.hasPointerCapture(event.pointerId))
    regionStage.value.releasePointerCapture(event.pointerId);
}
async function saveRegionAndRetry() {
  const target = regionDialogTarget.value;
  if (!target || regionBusy.value) return;
  regionBusy.value = true;
  errorText.value = "";
  try {
    await window.api.tiktokCreative.retryShot({
      id: target.task.id,
      shotId: target.shot.shotId,
      retryMode: 'manual_once',
      replacementRegion: { ...regionDraft.value },
    });
    notice.value = tr("autoUi.k_e1033307612d");
    closeRegionEditor();
    detailTask.value = null;
    detailShot.value = null;
    await refresh(true);
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  } finally {
    regionBusy.value = false;
    if (!errorText.value) closeRegionEditor();
  }
}
async function exportSelected() {
  const selected = allShots.value.filter(
    ({ shot }) =>
      selectedShotIds.value.includes(shot.shotId) &&
      shot.status === "completed",
  );
  if (!selected.length) return;
  const outputDir = await window.api.pickDir({
    title: tr("autoUi.k_8cd94ee8381b"),
  });
  if (!outputDir) return;
  const grouped = new Map<string, string[]>();
  for (const { task, shot } of selected)
    grouped.set(task.id, [...(grouped.get(task.id) || []), shot.shotId]);
  let count = 0;
  for (const [taskId, shotIds] of grouped) {
    const result = await window.api.tiktokCreative.exportItems({
      taskId,
      shotIds,
      outputDir,
    });
    count += Number(result?.exported?.length || 0);
  }
  await refresh(true);
  notice.value = tr("autoUi.k_fcf3224925c7", { p0: count });
  selectedShotIds.value = [];
}
async function removeTask(task: Task) {
  if (!window.confirm(tr("autoUi.k_802a9330758b"))) return;
  await window.api.tiktokCreative.remove(task.id);
  await refresh(true);
}
function openDetail(task: Task, shot?: Shot) {
  detailTask.value = task;
  detailShot.value = shot || task.shots[0] || null;
  detailTab.value = "overview";
}
function openLogs(task: Task, shot: Shot) {
  runtimeTask.value = task;
  runtimeShot.value = shot;
}
function openVideo(path?: string) {
  const value = String(path || "").trim();
  if (!value) return;
  const match = allShots.value.find(
    ({ shot }) =>
      shot.subtitleVideoPath === value || shot.resultVideoPath === value,
  );
  if (match) videoDialog.value = match;
}
function applySubtitlePreset(presetId: SubtitlePresetId) {
  const preset = subtitlePresets.value.find((item) => item.id === presetId);
  if (!preset) return;
  subtitleSelectedPreset.value = preset.id;
  Object.assign(subtitleCaptionStyle, preset.style);
}
function defaultSubtitleTitleForItems(
  items: Array<{ task: Task; shot: Shot }>,
) {
  return (
    items
      .map(({ task, shot }) =>
        String(task.productName || shot.shotId || "").trim(),
      )
      .find(Boolean) || "TikTok Creative Studio"
  );
}
function buildSubtitleTitleConfig() {
  const pool = subtitleTitlePoolText.value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (subtitleTitleStrategy.value === "random_pool") {
    if (!pool.length) throw new Error(tr("autoUi.k_83cd75f8d97e"));
    return {
      strategy: "random_pool" as const,
      singleText: "",
      titlePool: pool,
    };
  }
  const singleText = String(subtitleTitleText.value || "").trim();
  if (!singleText) throw new Error(tr("autoUi.k_7c43db8ada86"));
  return { strategy: "single_for_all" as const, singleText, titlePool: [] };
}
function openSingleSubtitleDialog(task: Task, shot: Shot) {
  subtitleDialogTargets.value = [{ taskId: task.id, shotId: shot.shotId }];
  subtitleDialogMode.value = "single";
  subtitleDialogTab.value = "title";
  subtitleTitleText.value =
    subtitleTitleText.value || defaultSubtitleTitleForItems([{ task, shot }]);
  applySubtitlePreset(subtitleSelectedPreset.value);
  liveSubtitleDialogOpen.value = true;
}
async function revertSubtitles(task: Task, shot: Shot) {
  if (!shot.subtitleVideoPath) return;
  if (!window.confirm(tr("autoUi.k_ceb6710c577d"))) return;
  subtitleDialogBusy.value = true;
  try {
    await window.api.tiktokCreative.revertSubtitles({
      taskId: task.id,
      shotId: shot.shotId,
    });
    videoDialog.value = null;
    liveSubtitleDialogOpen.value = false;
    await refresh(true);
    notice.value = tr("autoUi.k_a627e305d3eb");
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  } finally {
    subtitleDialogBusy.value = false;
  }
}
function toggleSelected(shotId: string) {
  selectedShotIds.value = selectedShotIds.value.includes(shotId)
    ? selectedShotIds.value.filter((id) => id !== shotId)
    : [...selectedShotIds.value, shotId];
}
function selectAllFiltered() {
  const ids = filteredItems.value.map(({ shot }) => shot.shotId);
  selectedShotIds.value =
    selectedShotIds.value.length === ids.length ? [] : ids;
}
function requestRemoveShot(task: Task, shot: Shot) {
  deleteTarget.value = { task, shot };
}
function removeShot(task: Task, shot: Shot) {
  requestRemoveShot(task, shot);
}
async function confirmRemoveShot() {
  const target = deleteTarget.value;
  if (!target || deleteBusy.value) return;
  deleteBusy.value = true;
  errorText.value = "";
  notice.value = "";
  try {
    await window.api.tiktokCreative.removeShot({
      taskId: target.task.id,
      shotId: target.shot.shotId,
    });
    selectedShotIds.value = selectedShotIds.value.filter(
      (id) => id !== target.shot.shotId,
    );
    if (detailShot.value?.shotId === target.shot.shotId) {
      detailTask.value = null;
      detailShot.value = null;
    }
    deleteTarget.value = null;
    await refresh(true);
    notice.value = tr("autoUi.k_b6088630021d");
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  } finally {
    deleteBusy.value = false;
  }
}
function openBatchDelete() {
  if (selectedShotIds.value.length) batchDeleteOpen.value = true;
}
async function revertSelectedSubtitles() {
  const items = allShots.value
    .filter(
      ({ shot }) =>
        selectedShotIds.value.includes(shot.shotId) && shot.subtitleVideoPath,
    )
    .map(({ task, shot }) => ({ taskId: task.id, shotId: shot.shotId }));
  if (!items.length || !window.confirm(tr("autoUi.k_ceb6710c577d"))) return;
  subtitleDialogBusy.value = true;
  try {
    const result = await window.api.tiktokCreative.revertSubtitlesBatch({
      items,
    });
    selectedShotIds.value = [];
    await refresh(true);
    notice.value = `${Number(result?.reverted || 0)} subtitles reverted`;
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  } finally {
    subtitleDialogBusy.value = false;
  }
}
async function confirmBatchDelete() {
  if (!selectedShotIds.value.length || batchDeleteBusy.value) return;
  batchDeleteBusy.value = true;
  errorText.value = "";
  notice.value = "";
  const selected = allShots.value.filter(({ shot }) =>
    selectedShotIds.value.includes(shot.shotId),
  );
  const failedIds: string[] = [];
  let deletedCount = 0;
  for (const { task, shot } of selected) {
    try {
      await window.api.tiktokCreative.removeShot({
        taskId: task.id,
        shotId: shot.shotId,
      });
      deletedCount += 1;
    } catch {
      failedIds.push(shot.shotId);
    }
  }
  selectedShotIds.value = failedIds;
  batchDeleteOpen.value = false;
  await refresh(true);
  if (deletedCount)
    notice.value = tr("autoUi.k_5116727f3f58", { p0: deletedCount });
  if (failedIds.length)
    errorText.value = tr("autoUi.k_2e4898151fcc", { p0: failedIds.length });
  batchDeleteBusy.value = false;
}
function requestTraceJson(shot?: Shot | null) {
  return JSON.stringify(
    {
      imagePreparation: shot?.imagePreparation || null,
      officialRequests: shot?.requestTrace || [],
    },
    null,
    2,
  );
}
function openSubtitleDialog() {
  if (!subtitleEligibleItems.value.length) return;
  subtitleDialogTargets.value = [];
  subtitleDialogMode.value = "batch";
  subtitleDialogTab.value = "title";
  subtitleTitleText.value =
    subtitleTitleText.value ||
    defaultSubtitleTitleForItems(subtitleEligibleItems.value);
  applySubtitlePreset(subtitleSelectedPreset.value);
  liveSubtitleDialogOpen.value = true;
}
async function generateSubtitles() {
  if (!subtitleDialogItems.value.length) return;
  subtitleDialogBusy.value = true;
  errorText.value = "";
  try {
    const result = await window.api.tiktokCreative.generateSubtitles({
      items: subtitleDialogItems.value.map(({ task, shot }) => ({
        taskId: task.id,
        shotId: shot.shotId,
      })),
      titleConfig: buildSubtitleTitleConfig(),
      captionStyle: { ...subtitleCaptionStyle },
      overlayImageConfig: {
        canvasWidth: 1080,
        canvasHeight: 1920,
        ...subtitleCaptionStyle,
      },
      layoutPolicy: {
        maxLines: subtitleCaptionStyle.maxLines,
        maxWidthRatio: subtitleCaptionStyle.maxWidthRatio,
        reflowStrategy: "balanced",
        avoidPosition: "auto",
      },
    });
    notice.value = tr("autoUi.k_66b02273ec31", {
      p0: Number(result?.outputCount || 0),
    });
    liveSubtitleDialogOpen.value = false;
    subtitleDialogTargets.value = [];
    selectedShotIds.value = [];
    await refresh(true);
  } catch (error: any) {
    errorText.value = error?.message || String(error);
  } finally {
    subtitleDialogBusy.value = false;
  }
}
function cycleFilter() {
  const filters: (typeof libraryFilter.value)[] = [
    "all",
    "failed",
    "success_not_exported",
    "success_exported",
    "success_not_subtitled",
    "running",
    "paused",
  ];
  libraryFilter.value =
    filters[(filters.indexOf(libraryFilter.value) + 1) % filters.length];
  libraryPage.value = 1;
}
function setActiveTab(tab: "reference" | "library" | "publish") {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  if (tab === "publish") {
    if (!publisherTags.value.length)
      publisherTags.value = [
        "#TikTok",
        "#好物推荐",
        "#生活分享",
        "#fyp",
        "#viral",
      ];
    void refreshPublisher();
  }
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(".tiktok-page")?.scrollTo({ top: 0 }),
  );
}
async function refreshPublisher() {
  const now = Date.now();
  if (publisherRefreshPromise) return publisherRefreshPromise;
  if (publisherLoadedAt.value && now - publisherLoadedAt.value < 15000) return;
  publisherSyncError.value = "";
  publisherRefreshPromise = (async () => { try {
    publisherTasks.value = await window.api.tiktokPublisher.refresh();
    const status = await window.api.tiktokPublisher.credentialStatus();
    publisherConfigured.value = Boolean(status?.configured);
    publisherMaskedKey.value = status?.masked || "";
    if (publisherConfigured.value) {
      try {
        publisherConnections.value =
          await window.api.tiktokPublisher.connections();
      } catch (error: any) {
        publisherConnections.value = [];
        publisherSyncError.value = error?.message || String(error);
      }
    } else {
      publisherConnections.value = [];
      publisherProducts.value = [];
    }
      publisherLoadedAt.value = Date.now();
  } catch (error: any) {
    publisherSyncError.value = error?.message || String(error);
  } finally { publisherRefreshPromise = null; } })();
  return publisherRefreshPromise;
}
async function refreshPublisherTasks() {
  if (publisherBusy.value) return;
  try {
    publisherTasks.value = await window.api.tiktokPublisher.refresh();
    publisherLoadedAt.value = Date.now();
  } catch (error: any) {
    publisherSyncError.value = error?.message || String(error);
  }
}
function setPublisherPage(page: number) {
  publisherPage.value = Math.max(1, Math.min(publisherPageCount.value, page));
}
function setPublisherOverviewFilter(
  filter: "all" | "video" | "pending" | "draft" | "published",
) {
  publisherOverviewFilter.value = filter;
  publisherPage.value = 1;
}
function openPublisherDatePicker() {
  const input = publisherDateInput.value;
  if (!input) return;
  if (typeof input.showPicker === "function") input.showPicker();
  else input.click();
}
function applyPublisherFilters() {
  publisherAppliedFilters.status = publisherFilterStatus.value;
  publisherAppliedFilters.account = publisherFilterAccount.value;
  publisherAppliedFilters.product = publisherFilterProduct.value;
  publisherAppliedFilters.date = publisherFilterDate.value;
  publisherPage.value = 1;
}
function resetPublisherFilters() {
  publisherSearch.value = "";
  publisherFilterStatus.value = "all";
  publisherFilterAccount.value = "all";
  publisherFilterProduct.value = "all";
  publisherFilterDate.value = "";
  publisherAppliedFilters.status = "all";
  publisherAppliedFilters.account = "all";
  publisherAppliedFilters.product = "all";
  publisherAppliedFilters.date = "";
  publisherOverviewFilter.value = "pending";
  publisherPage.value = 1;
}
function openPublisherDrawer() {
  if (!publisherRowSelection.value.length && !publisherEditId.value) return;
  publisherDrawerOpen.value = true;
}
function beginPublisherInlineEdit(id: string) {
  publisherInlineEditId.value = id;
}
function cancelPublisherInlineEdit() {
  publisherInlineEditId.value = "";
}
async function commitPublisherInlineEdit(item: any) {
  await savePublisherRow(item);
  publisherInlineEditId.value = "";
}
function handlePublisherInlineKey(event: KeyboardEvent, item: any) {
  if (event.key === "Enter") {
    event.preventDefault();
    void commitPublisherInlineEdit(item);
  } else if (event.key === "Escape") cancelPublisherInlineEdit();
}
function togglePublisherRow(id: string) {
  const item = publisherTasks.value.find((row) => String(row.id) === String(id));
  if (item?.state === "published") return;
  publisherEditId.value = "";
  publisherRowSelection.value = publisherRowSelection.value.includes(id)
    ? publisherRowSelection.value.filter((item) => item !== id)
    : [...publisherRowSelection.value, id];
}
function toggleAllPublisherRows() {
  publisherEditId.value = "";
  const visibleIds = filteredPublisherTasks.value.map((item) => String(item.id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) =>
    publisherRowSelection.value.includes(id),
  );
  publisherRowSelection.value = allVisibleSelected
    ? publisherRowSelection.value.filter((id) => !visibleIds.includes(id))
    : Array.from(new Set([...publisherRowSelection.value, ...visibleIds]));
}
function setPublisherRowSchedule(item: any) {
  if (!item.scheduleAt)
    item.scheduleAt = toPublisherDateTimeInput();
  void savePublisherRow(item);
}
async function applyPublisherDefaults(ids?: string[]) {
  const targetIds = ids?.length
    ? ids
    : publisherRowSelection.value.length
      ? publisherRowSelection.value
      : publisherPendingTasks.value.map((item) => String(item.id));
  const targetItems = publisherTasks.value.filter((row) =>
    targetIds.includes(String(row.id)) && row.state !== "published",
  );
  if (
    publisherEditorFields.schedule &&
    publisherScheduleMode.value !== "keep" &&
    !publisherUnifiedSchedule.value
  ) {
    publisherSyncError.value = "请先设置发布时间";
    return;
  }
  publisherSyncError.value = "";
  for (const [index, item] of targetItems.entries()) {
    item.connectionUid = publisherConnection.value || item.connectionUid;
    if (
      publisherEditorFields.product &&
      (publisherApplyMode.value === "all" || !item.productId)
    ) {
      item.productId = publisherProduct.value || item.productId;
      item.productTitle = publisherProductItem.value?.title || item.productTitle;
    }
    if (
      publisherEditorFields.music &&
      (publisherApplyMode.value === "all" || !item.music)
    ) {
      item.music = publisherSelectedMusic.value || undefined;
    }
    if (
      publisherEditorFields.title &&
      publisherTitle.value &&
      (publisherApplyMode.value === "all" || !item.videoTitle)
    ) {
      item.videoTitle = publisherTitle.value;
    }
    if (
      publisherEditorFields.description &&
      publisherDescription.value.trim() &&
      (publisherApplyMode.value === "all" || !item.description)
    ) {
      item.description = publisherDescription.value.trim();
    }
    if (publisherEditorFields.schedule && publisherScheduleMode.value !== "keep") {
      const baseTime = new Date(publisherUnifiedSchedule.value).getTime();
      const offset =
        publisherScheduleMode.value === "sequence"
          ? index * Math.max(1, publisherSequenceInterval.value) * 60000
          : 0;
      item.scheduleAt = new Date(baseTime + offset).toISOString();
    }
    await savePublisherRow(item, false);
  }
  publisherTasks.value = await window.api.tiktokPublisher.refresh();
  notice.value = `已应用到 ${targetItems.length} 个视频`;
}
async function applyPublisherProductToSelection() {
  if (!publisherProduct.value || !publisherRowSelection.value.length) {
    publisherSyncError.value = "请先选择商品和视频";
    return;
  }
  const product = publisherProductItem.value;
  for (const item of publisherTasks.value.filter((row) =>
    publisherRowSelection.value.includes(String(row.id)),
  )) {
    item.productId = publisherProduct.value;
    item.productTitle = product?.title || product?.name || item.productTitle;
    await savePublisherRow(item, false);
  }
  publisherTasks.value = await window.api.tiktokPublisher.refresh();
  notice.value = `商品已应用到 ${publisherRowSelection.value.length} 个视频`;
}
function preparePublisherScheduleSelection() {
  if (!publisherRowSelection.value.length) {
    publisherSyncError.value = "请先选择视频";
    return;
  }
  publisherSyncError.value = "";
  publisherEditorFields.schedule = true;
  publisherScheduleMode.value = "unified";
  if (!publisherUnifiedSchedule.value) {
    publisherUnifiedSchedule.value = toPublisherDateTimeInput();
  }
  notice.value = "请在右侧设置发布时间后应用修改";
}
async function removePublisherRow(id: string) {
  const item = publisherTasks.value.find(
    (row) => String(row.id) === String(id),
  );
  if (!item) return;
  publisherDeleteTarget.value = item;
}
function cancelPublisherDelete() {
  publisherDeleteTarget.value = null;
}
async function confirmPublisherDelete() {
  const item = publisherDeleteTarget.value;
  if (!item) return;
  const id = String(item.id);
  publisherDeleteTarget.value = null;
  try {
    await window.api.tiktokPublisher.removeTask(id);
    publisherTasks.value = publisherTasks.value.filter(
      (row) => String(row.id) !== String(id),
    );
    publisherRowSelection.value = publisherRowSelection.value.filter(
      (rowId) => String(rowId) !== String(id),
    );
    publisherPage.value = Math.min(publisherPage.value, publisherPageCount.value);
    notice.value = "发布任务已删除";
  } catch (error: any) {
    publisherSyncError.value = error?.message || String(error);
  }
}
async function savePublisherRow(item: any, refresh = true) {
  try {
    await window.api.tiktokPublisher.updateTask(item.id, {
      connectionUid: item.connectionUid || undefined,
      productId: item.productId || undefined,
      productTitle: item.productTitle || undefined,
      videoTitle: item.videoTitle || undefined,
      description: item.description || undefined,
      tags: toPlainPublisherTags(item.tags),
      scheduleAt: item.scheduleAt || undefined,
      music: toPlainPublisherMusic(item.music),
    });
    notice.value = "任务配置已保存";
    if (refresh) publisherTasks.value = await window.api.tiktokPublisher.refresh();
  } catch (error: any) {
    publisherSyncError.value = error?.message || String(error);
  }
}
async function publishSelectedRows() {
  await submitPublisher();
}
async function savePublisherKey() {
  if (!publisherKey.value.trim()) return;
  try {
    const status = await window.api.tiktokPublisher.saveCredential(
      publisherKey.value,
    );
    publisherKey.value = "";
    publisherConfigured.value = Boolean(status?.configured);
    publisherMaskedKey.value = status?.masked || "";
    await refreshPublisher();
  } catch (error: any) {
    publisherSyncError.value = error?.message || String(error);
  }
}
async function clearPublisherKey() {
  await window.api.tiktokPublisher.clearCredential();
  publisherConfigured.value = false;
  publisherMaskedKey.value = "";
  publisherConnections.value = [];
  publisherProducts.value = [];
}
async function testPublisherKey() {
  try {
    await window.api.tiktokPublisher.testCredential();
    publisherSyncError.value = "";
    notice.value = "Creatok connection verified";
  } catch (error: any) {
    publisherSyncError.value = error?.message || String(error);
  }
}
async function pickPublisherVideos() {
  publisherPickerSelected.value = [];
  publisherPickerProduct.value = "";
  publisherPickerSource.value = "clone";
  publisherPickerPage.value = 1;
  publisherPickerOpen.value = true;
  await Promise.all([loadPublisherLivePhotos(), loadPublisherCloneVideos()]);
}
async function loadPublisherCloneVideos() {
  publisherPickerLoading.value = true;
  try {
    const summaries = await window.api.clone.listProjects();
    const ready = Array.isArray(summaries)
      ? summaries.filter((item: any) => Boolean(item?.finalOutputPath))
      : [];
    publisherCloneItems.value = await Promise.all(
      ready.map(async (item: any) => {
        try {
          const detail = await window.api.clone.getProject({
            cloneProjectId: item.id,
          });
          return { ...item, ...(detail || {}) };
        } catch {
          return item;
        }
      }),
    );
  } catch (error: any) {
    publisherSyncError.value = error?.message || String(error);
    publisherCloneItems.value = [];
  } finally {
    publisherPickerLoading.value = false;
  }
}
async function loadPublisherLivePhotos() {
  publisherPickerLoading.value = true;
  try {
    const result = await window.api.livePhoto.listSummaries({
      page: 1,
      pageSize: 200,
      filter: "all",
    });
    publisherLivePhotoItems.value = Array.isArray(result?.items)
      ? result.items.filter((item: any) =>
          Boolean(publisherLivePhotoPath(item)),
        )
      : [];
  } catch (error: any) {
    publisherSyncError.value = error?.message || String(error);
    publisherLivePhotoItems.value = [];
  } finally {
    publisherPickerLoading.value = false;
  }
}
function publisherLivePhotoPath(item: any) {
  return String(
    item?.subtitleVideoPath ||
      item?.livePhotoVideoPath ||
      item?.previewVideoPath ||
      item?.motionVideoPath ||
      "",
  ).trim();
}
async function uploadPublisherVideos() {
  const paths = await window.api.pickFiles({
    title: "Select local videos",
    filters: [{ name: "Videos", extensions: ["mp4", "mov", "mkv", "webm"] }],
    multiple: true,
  });
  if (!paths?.length) return;
  try {
    const created = await window.api.tiktokPublisher.createDraftsFromPaths({
      paths,
      defaults: {
        connectionUid: publisherConnection.value || undefined,
        productId: publisherProduct.value || undefined,
        videoTitle: publisherTitle.value || undefined,
        scheduleAt: publisherSchedule.value || undefined,
        music: toPlainPublisherMusic(publisherSelectedMusic.value),
      },
    });
    publisherTasks.value = [...publisherTasks.value, ...created];
    publisherRowSelection.value = created.map((item: any) => item.id);
    if (created[0]) await editPublisherTask(created[0]);
    notice.value = `Imported ${created.length} local videos`;
  } catch (error: any) {
    publisherSyncError.value = error?.message || String(error);
  }
}
function togglePublisherPickerShot(shotId: string) {
  publisherPickerSelected.value = publisherPickerSelected.value.includes(shotId)
    ? publisherPickerSelected.value.filter((id) => id !== shotId)
    : [...publisherPickerSelected.value, shotId];
}
async function confirmPublisherPicker() {
  if (publisherPickerSource.value !== "creative") {
    const paths = publisherSourceItems.value
      .filter((item) => publisherPickerSelected.value.includes(item.key))
      .map((item) => item.filePath)
      .filter(Boolean);
    if (!paths.length) return;
    try {
      const created = await window.api.tiktokPublisher.createDraftsFromPaths({
        paths,
        defaults: {
          connectionUid: publisherConnection.value || undefined,
          productId: publisherProduct.value || undefined,
          videoTitle: publisherTitle.value || undefined,
          scheduleAt: publisherSchedule.value || undefined,
          music: toPlainPublisherMusic(publisherSelectedMusic.value),
        },
      });
      publisherTasks.value = [...publisherTasks.value, ...created];
      publisherRowSelection.value = created.map((item: any) => item.id);
      publisherPickerOpen.value = false;
      if (created[0]) await editPublisherTask(created[0]);
    } catch (error: any) {
      publisherSyncError.value = error?.message || String(error);
    }
    return;
  }
  const items = publisherSourceItems.value
    .filter((item) => publisherPickerSelected.value.includes(item.key))
    .map((item) => ({ taskId: item.taskId, shotId: item.shotId }));
  if (!items.length) return;
  await addSelectedToPublisher(items);
  publisherPickerOpen.value = false;
}
function restorePublisherFavoriteMusic() {
  try {
    const raw = localStorage.getItem("videogenerate.publisherFavoriteMusic");
    const items = raw ? JSON.parse(raw) : [];
    publisherFavoriteMusic.value = Array.isArray(items) ? items : [];
  } catch {
    publisherFavoriteMusic.value = [];
  }
}
function persistPublisherFavoriteMusic() {
  localStorage.setItem(
    "videogenerate.publisherFavoriteMusic",
    JSON.stringify(publisherFavoriteMusic.value),
  );
}
function isPublisherMusicFavorite(item: any) {
  return publisherFavoriteMusic.value.some(
    (favorite) => String(favorite.id) === String(item.id),
  );
}
function togglePublisherMusicFavorite(item: any) {
  publisherFavoriteMusic.value = isPublisherMusicFavorite(item)
    ? publisherFavoriteMusic.value.filter(
        (favorite) => String(favorite.id) !== String(item.id),
      )
    : [...publisherFavoriteMusic.value, item];
  persistPublisherFavoriteMusic();
}
function publisherMusicUrl(item: any) {
  return String(item?.play_url || item?.url || item?.preview_url || "").trim();
}
async function togglePublisherMusicPlayback(item: any) {
  const id = String(item?.id || "");
  if (publisherMusicPlayingId.value === id && publisherMusicAudio) {
    publisherMusicAudio.pause();
    publisherMusicAudio = null;
    publisherMusicPlayingId.value = "";
    return;
  }
  publisherMusicAudio?.pause();
  publisherMusicAudio = null;
  publisherMusicPlayingId.value = "";
  const url = publisherMusicUrl(item);
  if (!url) {
    publisherSyncError.value = "当前音乐没有可用的试听地址";
    return;
  }
  try {
    const audio = new Audio(url);
    publisherMusicAudio = audio;
    publisherMusicPlayingId.value = id;
    audio.addEventListener("ended", () => {
      if (publisherMusicAudio === audio) {
        publisherMusicAudio = null;
        publisherMusicPlayingId.value = "";
      }
    });
    await audio.play();
    publisherSyncError.value = "";
  } catch (error: any) {
    publisherMusicAudio = null;
    publisherMusicPlayingId.value = "";
    publisherSyncError.value = error?.message || "音乐试听失败";
  }
}
function openPublisherMusicLibrary() {
  publisherEditId.value = "";
  if (!publisherConnection.value && publisherConnections.value.length === 1) {
    publisherConnection.value = publisherConnections.value[0].uid;
  }
  publisherMusicLibraryOpen.value = true;
  publisherSyncError.value = "";
}
function closePublisherMusicLibrary() {
  publisherMusicAudio?.pause();
  publisherMusicAudio = null;
  publisherMusicPlayingId.value = "";
  publisherMusicLibraryOpen.value = false;
}
async function searchPublisherMusic() {
  const task = publisherEditId.value
    ? publisherTasks.value.find(
        (row) => String(row.id) === String(publisherEditId.value),
      )
    : null;
  const connectionUid = task?.connectionUid || publisherConnection.value;
  const query = publisherMusicLibraryOpen.value
    ? publisherMusicQuery.value.trim()
    : publisherSelectorQuery.value.trim();
  publisherMusicQuery.value = query;
  if (!publisherMusicQuery.value || !connectionUid) {
    publisherSyncError.value = connectionUid
      ? "请输入音乐名称后搜索"
      : "请先为当前视频选择 TikTok Shop 账号";
    return;
  }
  try {
    publisherMusic.value = await window.api.tiktokPublisher.music(
      query,
      connectionUid,
    );
    publisherSyncError.value = "";
  } catch (error: any) {
    publisherSyncError.value = error?.message || String(error);
  }
}
function openPublisherSelector(
  kind: "account" | "product" | "music" | "videoProduct",
) {
  const task = publisherEditId.value
    ? publisherTasks.value.find(
        (row) => String(row.id) === String(publisherEditId.value),
      )
    : null;
  if (task) {
    publisherConnection.value = task.connectionUid || publisherConnection.value;
    publisherProduct.value = task.productId || publisherProduct.value;
    publisherSelectedMusic.value = task.music || null;
  }
  if (kind === "product" && !publisherConnection.value) {
    publisherSelectorAfterAccount.value = kind;
    publisherSelector.value = "account";
    publisherSelectorQuery.value = "";
    publisherSyncError.value = "请先选择发布账号";
    return;
  }
  publisherSelectorAfterAccount.value = "";
  publisherSelector.value = kind;
  publisherSelectorQuery.value = "";
  if (kind === "product" && publisherConnection.value)
    void loadPublisherProducts();
}
function openPublisherBatchSelector(kind: "account" | "product" | "music") {
  publisherEditId.value = "";
  openPublisherSelector(kind);
}
async function choosePublisherConnection(uid: string) {
  publisherConnection.value = uid;
  if (publisherEditId.value) {
    const item = publisherTasks.value.find(
      (row) => String(row.id) === String(publisherEditId.value),
    );
    if (item) {
      item.connectionUid = uid;
      await savePublisherRow(item);
    }
  }
  const nextSelector = publisherSelectorAfterAccount.value;
  publisherSelectorAfterAccount.value = "";
  publisherSyncError.value = "";
  publisherSelector.value = nextSelector;
  publisherSelectorQuery.value = nextSelector === "music" ? publisherMusicQuery.value : "";
  if (nextSelector === "product") await loadPublisherProducts();
  else void loadPublisherProducts();
}
async function choosePublisherProduct(id: string) {
  publisherProduct.value = id;
  publisherSyncError.value = "";
  if (publisherEditId.value) {
    const item = publisherTasks.value.find(
      (row) => String(row.id) === String(publisherEditId.value),
    );
    if (item) {
      item.productId = id;
      item.productTitle =
        publisherProducts.value.find(
          (product) => String(product.id) === String(id),
        )?.title || item.productTitle;
      await savePublisherRow(item);
    }
  }
  publisherSelector.value = "";
  if (!publisherEditId.value && publisherRowSelection.value.length)
    await applyPublisherProductToSelection();
}
function choosePublisherVideoProduct(id: string) {
  publisherPickerProduct.value = id;
  publisherSelector.value = "";
}
async function choosePublisherMusic(item: any | null) {
  publisherSelectedMusic.value = item;
  publisherSyncError.value = "";
  if (publisherEditId.value) {
    const task = publisherTasks.value.find(
      (row) => String(row.id) === String(publisherEditId.value),
    );
    if (task) {
      task.music = item || undefined;
      await savePublisherRow(task);
    }
  }
  publisherSelector.value = "";
  if (item) publisherMusicQuery.value = item.title || "";
}
function togglePublisherTag(tag: string) {
  publisherTags.value = publisherTags.value.includes(tag)
    ? publisherTags.value.filter((item) => item !== tag)
    : [...publisherTags.value, tag];
}
function insertPublisherTag(tag: string) {
  const current = publisherDescription.value.trim();
  if (current.includes(tag)) {
    notice.value = `${tag} 已在描述中`;
    return;
  }
  publisherDescription.value = current ? `${current} ${tag}` : tag;
  notice.value = `${tag} 已添加到描述`;
}
function addPublisherTag() {
  publisherTagInputOpen.value = true;
  publisherTagDraft.value = "";
}
function confirmPublisherTag() {
  const tag = publisherTagDraft.value.trim();
  if (!tag) return;
  const normalized = tag.startsWith("#") ? tag : `#${tag}`;
  if (!publisherTags.value.includes(normalized))
    publisherTags.value = [...publisherTags.value, normalized];
  insertPublisherTag(normalized);
  publisherTagDraft.value = "";
  publisherTagInputOpen.value = false;
}
function cancelPublisherTag() {
  publisherTagDraft.value = "";
  publisherTagInputOpen.value = false;
}
function savePublisherDraft() {
  localStorage.setItem(
    "videogenerate.publisherDraft",
    JSON.stringify({
      title: publisherTitle.value,
      description: publisherDescription.value,
      schedule: publisherSchedule.value,
      connection: publisherConnection.value,
      product: publisherProduct.value,
      tags: publisherTags.value,
    }),
  );
  notice.value = "当前发布配置已保存为草稿";
}
function restorePublisherDraft() {
  try {
    const raw = localStorage.getItem("videogenerate.publisherDraft");
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (typeof draft.title === "string") publisherTitle.value = draft.title;
    if (typeof draft.description === "string")
      publisherDescription.value = draft.description;
    if (typeof draft.schedule === "string")
      publisherSchedule.value = draft.schedule;
    if (typeof draft.connection === "string")
      publisherConnection.value = draft.connection;
    if (typeof draft.product === "string")
      publisherProduct.value = draft.product;
    if (Array.isArray(draft.tags) && draft.tags.length)
      publisherTags.value = draft.tags.filter(
        (item: unknown): item is string => typeof item === "string",
      );
  } catch {
    /* Ignore malformed local draft. */
  }
}
function openPublisherHelp() {
  notice.value = "请先验证 Creatok API Key，再选择发布账号和商品";
}
function handlePublishUiClick(event: Event) {
  const target = event.target as HTMLElement;
  const headerButton = target.closest(
    ".publish-help, .publish-guide, .publish-link",
  ) as HTMLElement | null;
  if (headerButton && !headerButton.textContent?.includes("返回成片库")) {
    openPublisherHelp();
    return;
  }
  if (target.closest(".publish-draft")) {
    savePublisherDraft();
    return;
  }
  if (target.closest(".publish-info-head button")) {
    notice.value = "请在左侧视频信息区域编辑内容";
    return;
  }
  if (target.closest(".publish-demo-row button")) {
    notice.value = "演示队列任务不可取消";
    return;
  }
  const queueRow = target.closest(".publisher-row") as HTMLElement | null;
  if (queueRow && !target.closest("button")) {
    const item = publisherTasks.value.find(
      (entry) => String(entry.id) === queueRow.dataset.taskId,
    );
    if (item) {
      void editPublisherTask(item);
      return;
    }
  }
}
function handlePublishUiInput(event: Event) {
  const target = event.target as HTMLTextAreaElement;
  if (target.matches(".publish-field textarea"))
    publisherDescription.value = target.value;
}
async function editPublisherTask(item: any) {
  publisherEditId.value = item.id;
  publisherConnection.value = item.connectionUid || "";
  publisherProduct.value = item.productId || "";
  publisherTitle.value = item.videoTitle || "";
  publisherDescription.value = item.description || "";
  publisherSchedule.value = item.scheduleAt
    ? toPublisherDateTimeInput(item.scheduleAt)
    : "";
  publisherScheduleMode.value = item.scheduleAt ? "unified" : "keep";
  publisherUnifiedSchedule.value = publisherSchedule.value;
  publisherSelectedMusic.value = item.music || null;
  if (publisherConnection.value) await loadPublisherProducts();
}
async function applyPublisherEdit() {
  if (!publisherEditId.value) return;
  try {
    const scheduleValue =
      publisherScheduleMode.value === "keep"
        ? ""
        : publisherUnifiedSchedule.value || publisherSchedule.value;
    const scheduleDate = scheduleValue ? new Date(scheduleValue) : null;
    if (scheduleDate && Number.isNaN(scheduleDate.getTime())) {
      publisherSyncError.value = "请选择有效的发布时间";
      return;
    }
    await window.api.tiktokPublisher.updateTask(publisherEditId.value, {
      connectionUid: publisherConnection.value || undefined,
      productId: publisherProduct.value || undefined,
      videoTitle: publisherTitle.value || undefined,
      description: publisherDescription.value || undefined,
      scheduleAt: scheduleDate ? scheduleDate.toISOString() : undefined,
      music: toPlainPublisherMusic(publisherSelectedMusic.value),
    });
    publisherTasks.value = await window.api.tiktokPublisher.refresh();
    publisherEditId.value = "";
    notice.value = "发布任务已更新";
  } catch (error: any) {
    publisherSyncError.value = error?.message || String(error);
  }
}
async function loadPublisherProducts() {
  if (!publisherConnection.value) {
    publisherProducts.value = [];
    publisherProduct.value = "";
    return;
  }
  publisherProductsLoading.value = true;
  try {
    publisherProducts.value = await window.api.tiktokPublisher.products(
      publisherConnection.value,
    );
  } catch (error: any) {
    publisherProducts.value = [];
    publisherSyncError.value = error?.message || String(error);
  } finally {
    publisherProductsLoading.value = false;
  }
}
async function addSelectedToPublisher(
  presetItems?: Array<{ taskId: string; shotId: string }>,
) {
  const items =
    presetItems ||
    allShots.value
      .filter(
        ({ shot }) =>
          selectedShotIds.value.includes(shot.shotId) &&
          shot.status === "completed" &&
          !publishedShotMap.value.has(shot.shotId),
      )
      .map(({ task, shot }) => ({ taskId: task.id, shotId: shot.shotId }));
  if (!items.length) {
    setActiveTab("library");
    return;
  }
  try {
    const created = await window.api.tiktokPublisher.createDrafts({
      items,
      defaults: {
        connectionUid: publisherConnection.value || undefined,
        productId: publisherProduct.value || undefined,
        videoTitle: publisherTitle.value || undefined,
        scheduleAt: publisherSchedule.value || undefined,
        music: toPlainPublisherMusic(publisherSelectedMusic.value),
      },
    });
    publisherTasks.value = [...publisherTasks.value, ...created];
    selectedShotIds.value = [];
    publisherPickerSelected.value = [];
    if (created[0]) await editPublisherTask(created[0]);
    setActiveTab("publish");
  } catch (error: any) {
    publisherSyncError.value = error?.message || String(error);
  }
}
async function precheckPublisher(ids?: string[]) {
  publisherPrecheckState.value = "running";
  publisherPrecheckMessage.value = "正在预检...";
  publisherBusy.value = true;
  publisherSyncError.value = "";
  try {
    const targetIds = (ids?.length
      ? ids
      : publisherTasks.value
          .filter((item) => item.state === "draft")
          .map((item) => String(item.id)))
      .map(String);
    if (!targetIds.length) {
      publisherPrecheckState.value = "failed";
      publisherPrecheckMessage.value = "没有可预检的视频";
      publisherSyncError.value = "当前选中的视频没有可预检任务";
      return;
    }
    const checked = await window.api.tiktokPublisher.precheck(targetIds);
    const checkedById = new Map(
      checked.map((item: any) => [String(item.id), item]),
    );
    publisherTasks.value = publisherTasks.value.map(
      (item) => checkedById.get(String(item.id)) || item,
    );
    const failed = checked.some(
      (item: any) =>
        item.state === "failed" || item.precheck?.ok === false || item.error,
    );
    publisherPrecheckState.value = failed ? "failed" : "passed";
    publisherPrecheckMessage.value = failed ? "预检未通过，请检查任务配置" : "预检通过";
  } catch (error: any) {
    publisherPrecheckState.value = "failed";
    publisherPrecheckMessage.value = "预检失败";
    publisherSyncError.value = error?.message || String(error);
  } finally {
    publisherBusy.value = false;
  }
}
async function nextPublisherStep() {
  if (!publisherTasks.value.length) {
    await pickPublisherVideos();
    publisherSyncError.value = "请先选择要发布的视频素材";
    return;
  }
  if (!publisherConnection.value) {
    publisherSyncError.value = "请先选择发布账号";
    return;
  }
  if (!publisherProduct.value) {
    publisherSyncError.value = "请先选择 TikTok Shop 商品";
    return;
  }
  if (!publisherTitle.value.trim()) {
    publisherSyncError.value = "请先填写视频标题";
    return;
  }
  if (publisherPrecheckEnabled.value) {
    await precheckPublisher();
    notice.value = "发布配置预检完成，请在页面底部确认提交";
  } else {
    notice.value = "发布配置已准备完成，可直接提交发布";
  }
}
async function submitPublisher(confirmed = false) {
  const ids = publisherRowSelection.value.length
    ? publisherRowSelection.value.map(String)
    : publisherPendingTasks.value.map((item) => String(item.id));
  const selectedTasks = publisherTasks.value.filter((item) =>
    ids.includes(String(item.id)) && item.state !== "published",
  );
  const missing = new Set<string>();
  for (const item of selectedTasks) {
    if (!item.sourceVideoPath) missing.add("视频素材");
    if (!item.connectionUid) missing.add("发布账号");
    if (!item.productId) missing.add("TikTok Shop 商品");
    if (!item.videoTitle?.trim()) missing.add("视频标题");
  }
  if (missing.size) {
    publisherPrecheckState.value = "failed";
    publisherPrecheckMessage.value = `缺少${Array.from(missing).join("、")}`;
    publisherSyncError.value = `无法发布：请先设置${Array.from(missing).join("、")}`;
    return;
  }
  const ready = publisherTasks.value.filter(
    (item) =>
      ids.includes(String(item.id)) &&
      !["published", "queued", "scheduled", "publishing", "result_unknown"].includes(
        String(item.state),
      ),
  );
  if (!ready.length) {
    publisherSyncError.value = "当前选中的视频没有可提交任务";
    return;
  }
  if (!confirmed) {
    publisherConfirmCount.value = ready.length;
    publisherConfirmOpen.value = true;
    return;
  }
  publisherBusy.value = true;
  publisherSyncError.value = "";
  try {
    const submitted: any[] = [];
    publisherPrecheckState.value = "running";
    publisherPrecheckMessage.value = `正在提交 ${ready.length} 个视频`;
    const current = await window.api.tiktokPublisher.submit(
      ready.map((item) => String(item.id)),
    );
    submitted.push(...current);
    const currentById = new Map(
      current.map((item: any) => [String(item.id), item]),
    );
    publisherTasks.value = publisherTasks.value.map(
      (item) => currentById.get(String(item.id)) || item,
    );
    const successCount = submitted.filter((item: any) =>
      ["queued", "scheduled", "publishing", "published"].includes(
        String(item.state),
      ),
    ).length;
    const failedItems = submitted.filter((item: any) =>
      ["failed", "result_unknown", "cancelled"].includes(String(item.state)),
    );
    if (failedItems.length) {
      const failedError = failedItems[0]?.error;
      const failureDetails = [
        failedError?.message,
        failedError?.reason,
        failedError?.stage,
        failedError?.request_id || failedError?.requestId
          ? `request_id: ${failedError.request_id || failedError.requestId}`
          : "",
      ].filter(Boolean).join(" · ");
      publisherSyncError.value = failureDetails || "部分视频提交失败";
      publisherPrecheckState.value = "failed";
      publisherPrecheckMessage.value = `提交完成：成功 ${successCount}，失败 ${failedItems.length}`;
      notice.value = successCount
        ? `已提交 ${successCount} 个视频，${failedItems.length} 个失败`
        : "提交失败，请检查错误信息";
    } else {
      publisherPrecheckState.value = "passed";
      publisherPrecheckMessage.value = `提交完成：成功 ${successCount}/${ready.length}`;
      notice.value = `已提交 ${successCount} 个视频`;
    }
  } catch (error: any) {
    publisherPrecheckState.value = "failed";
    publisherPrecheckMessage.value = "批量提交已中断";
    publisherSyncError.value = error?.message || String(error);
  } finally {
    publisherBusy.value = false;
  }
}
function cancelPublisherConfirm() {
  if (publisherBusy.value) return;
  publisherConfirmOpen.value = false;
}
async function confirmPublisherSubmit() {
  publisherConfirmOpen.value = false;
  await submitPublisher(true);
}
onMounted(async () => {
  document.addEventListener("click", handlePublishUiClick);
  document.addEventListener("input", handlePublishUiInput);
  restorePublisherDraft();
  restorePublisherFavoriteMusic();
  await refresh();
  if (props.publisherOnly) await refreshPublisher();
  refreshTimer = setInterval(() => {
    if (props.publisherOnly || activeTab.value === "publish") {
      void refreshPublisherTasks();
      return;
    }
    void refresh(true);
  }, 5000);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", handlePublishUiClick);
  document.removeEventListener("input", handlePublishUiInput);
  if (refreshTimer) clearInterval(refreshTimer);
  publisherMusicAudio?.pause();
  publisherMusicAudio = null;
});
</script>

<template>
  <div
    class="tiktok-page plugin-workspace-standard"
    :class="{ 'publish-mode': activeTab === 'publish' }"
  >
    <section v-if="!props.publisherOnly" class="live-workspace-head">
      <div class="live-workspace-intro">
        <div class="live-workspace-icon"><Sparkles class="h-5 w-5" /></div>
        <div class="live-workspace-copy">
          <h1>TikTok Creative Studio</h1>
          <p>{{ tr("autoUi.k_c5d1c075a08a") }}</p>
        </div>
        <div class="live-workspace-actions">
          <button
            class="ghost-button back-button"
            type="button"
            @click="router.push('/plugins')"
          >
            <ChevronLeft class="h-4 w-4" />{{
              tr("autoUi.k_3966f952c1c0")
            }}</button
          ><button
            class="ghost-button refresh-button"
            type="button"
            :disabled="loading"
            @click="refresh()"
          >
            <RefreshCcw class="h-4 w-4" />{{ tr("autoUi.k_38108eaa1d32") }}
          </button>
        </div>
      </div>
      <section class="tab-bar live-workspace-tabs">
        <button
          class="tab-button"
          :class="{ active: activeTab === 'reference' }"
          type="button"
          @click="setActiveTab('reference')"
        >
          <ImagePlus class="h-4 w-4" />{{ tr("autoUi.k_3a73e3f67a57") }}</button
        ><button
          class="tab-button"
          :class="{ active: activeTab === 'library' }"
          type="button"
          @click="setActiveTab('library')"
        >
          <FolderOpen class="h-4 w-4" />{{ tr("autoUi.k_21eb39d9da89") }}
          <span class="live-tab-count">{{ completedCount }}</span></button
        ><button
          class="tab-button account-tab"
          type="button"
          @click="accountDialogOpen = true"
        >
          <KeyRound class="h-4 w-4" />{{ tr("autoUi.k_9d4ca7f307e7") }}
          <span class="live-tab-count">{{ accounts.length }}</span>
        </button>
        <button class="tab-button" type="button" @click="retrySettingsOpen = true">
          <Settings class="h-4 w-4" />{{ tr("tiktokCreative.retry.guard") }}
          <span class="live-tab-count">{{ creativeSettings.imageRetryLimit }}</span>
        </button>
      </section>
    </section>
    <div v-if="notice" class="publisher-toast publisher-toast-success" role="status">
      <CheckCircle2 class="h-4 w-4" /><span>{{ notice }}</span>
      <button type="button" aria-label="关闭提示" @click="notice = ''">
        <X class="h-4 w-4" />
      </button>
    </div>
    <div v-if="errorText" class="publisher-toast publisher-toast-error">
      <AlertTriangle class="h-4 w-4" />{{ errorText }}
    </div>
    <div
      v-if="publisherCredentialOpen"
      class="publisher-credential-modal"
      @click.self="publisherCredentialOpen = false"
    >
      <section class="publisher-credential-modal__panel" role="dialog" aria-modal="true" aria-labelledby="publisher-credential-title">
        <header class="publisher-credential-modal__head">
          <div class="publisher-credential-modal__icon"><KeyRound class="h-5 w-5" /></div>
          <div>
            <h2 id="publisher-credential-title">CreatOK API 连接</h2>
            <p>管理发布账号连接和 TikTok Shop 发布权限。</p>
          </div>
          <button
            class="publisher-credential-modal__close"
            type="button"
            aria-label="关闭"
            @click="publisherCredentialOpen = false"
          ><X class="h-4 w-4" /></button>
        </header>
        <div class="publisher-credential-modal__status" :class="{ ready: publisherConfigured }">
          <span class="publisher-credential-modal__status-dot"></span>
          <div>
            <strong>{{ publisherConfigured ? "已连接" : "未连接" }}</strong>
            <small>{{ publisherConfigured ? (publisherMaskedKey || "API Key 已安全保存") : "请输入 CreatOK API Key 以连接发布服务" }}</small>
          </div>
        </div>
        <label class="publisher-credential-modal__field">
          <span>CreatOK API Key</span>
          <input
            v-model="publisherKey"
            type="password"
            autocomplete="new-password"
            placeholder="粘贴 API Key"
          />
        </label>
        <p class="publisher-credential-modal__hint">密钥只保存在本机安全存储中，不会显示完整内容。</p>
        <footer class="publisher-credential-modal__actions">
          <button
            v-if="publisherConfigured"
            class="publisher-credential-modal__danger"
            type="button"
            @click="clearPublisherKey"
          >清除密钥</button>
          <span></span>
          <button class="publisher-credential-modal__secondary" type="button" @click="testPublisherKey">测试连接</button>
          <button class="publisher-credential-modal__primary" type="button" @click="savePublisherKey">保存并验证</button>
        </footer>
      </section>
    </div>
    <section v-if="activeTab === 'publish'" class="publisher-design-page">
      <header class="publisher-design-head">
        <div class="publisher-design-title">
          <div class="publisher-design-logo"><Send class="h-5 w-5" /></div>
          <div>
            <h1>批量发布</h1>
            <p>批量管理与发布 TikTok 视频</p>
          </div>
        </div>
        <div class="publisher-design-actions">
          <div class="publisher-api-chip publisher-design-api-chip">
            <KeyRound class="h-4 w-4" /><span>Creatok API</span>
            <i :class="{ ready: publisherConfigured }"></i>
            <em>{{ publisherConfigured ? "已连接" : "未连接" }}</em>
            <button
              type="button"
              @click="publisherCredentialOpen = !publisherCredentialOpen"
            >{{ publisherConfigured ? "管理" : "连接" }}</button>
          </div>
          <button
            class="publisher-music-library-button"
            type="button"
            @click="openPublisherMusicLibrary"
          >
            <Headphones class="h-4 w-4" />音乐库
            <span v-if="publisherFavoriteMusic.length">{{
              publisherFavoriteMusic.length
            }}</span>
          </button>
          <button
            class="publisher-design-secondary"
            type="button"
            @click="uploadPublisherVideos"
          >
            <FolderOpen class="h-4 w-4" />导入视频</button
          ><button
            class="publisher-design-secondary"
            type="button"
            @click="pickPublisherVideos"
          >
            <FolderOpen class="h-4 w-4" />从素材库选择</button
          ><button
            class="publisher-design-primary"
            type="button"
            @click="uploadPublisherVideos"
          >
            <ImagePlus class="h-4 w-4" />上传视频 <b>+</b>
          </button>
        </div>
      </header>
      <div v-if="publisherSyncError" class="publisher-design-error">
        <AlertTriangle class="h-4 w-4" />{{ publisherSyncError }}
      </div>
      <div class="publisher-design-body">
        <div class="publisher-design-left">
          <div class="publisher-design-stats">
            <button
              type="button"
              :class="{ active: publisherOverviewFilter === 'all' }"
              @click="setPublisherOverviewFilter('all')"
            >
              <span
                >全部视频 <strong>{{ publisherTasks.length }}</strong></span
              >
            </button>
            <button
              type="button"
              :class="{ active: publisherOverviewFilter === 'video' }"
              @click="setPublisherOverviewFilter('video')"
            >
              <span
                >视频 <strong>{{ publisherTasks.length }}</strong></span
              >
            </button>
            <button
              type="button"
              :class="{ active: publisherOverviewFilter === 'pending' }"
              @click="setPublisherOverviewFilter('pending')"
            >
              <span
                >待发布
                <strong>{{
                  publisherPendingTasks.length
                }}</strong></span
              >
            </button>
            <button
              type="button"
              :class="{ active: publisherOverviewFilter === 'draft' }"
              @click="setPublisherOverviewFilter('draft')"
            >
              <span
                >草稿
                <strong>{{
                  publisherTasks.filter((item) => item.state === "draft").length
                }}</strong></span
              >
            </button>
            <button
              type="button"
              :class="{ active: publisherOverviewFilter === 'published' }"
              @click="setPublisherOverviewFilter('published')"
            >
              <span
                >已发布
                <strong>{{
                  publisherTasks.filter((item) => item.state === "published")
                    .length
                }}</strong></span
              >
            </button>
          </div>
          <div class="publisher-design-filters">
            <div class="publisher-design-search">
              <Search class="h-4 w-4" /><input
                v-model="publisherSearch"
                placeholder="搜索视频、标题、标签..."
                @input="publisherPage = 1"
              />
            </div>
            <select
              v-model="publisherFilterAccount"
            >
              <option value="all">全部账号</option>
              <option
                v-for="account in publisherConnections"
                :key="account.uid"
                :value="account.uid"
              >
                {{ account.name || account.uid }}
              </option></select
            ><select
              v-model="publisherFilterProduct"
            >
              <option value="all">全部商品</option>
              <option
                v-for="product in publisherProducts"
                :key="product.id"
                :value="product.id"
              >
                {{ product.title || product.name }}
              </option></select
            ><select
              v-model="publisherFilterStatus"
            >
              <option value="all">全部状态</option>
              <option value="pending">待发布</option>
              <option value="draft">草稿</option>
              <option value="published">已发布</option></select
            >
            <div class="publisher-filter-actions">
              <button
                class="publisher-date-button"
                :class="{ active: publisherFilterDate }"
                type="button"
                @click="openPublisherDatePicker"
              >
                <Clock3 class="h-4 w-4" />{{
                  publisherFilterDate || "选择日期"
                }}
              </button>
              <input
                ref="publisherDateInput"
                v-model="publisherFilterDate"
                class="publisher-date-input"
                type="date"
              />
              <button
                class="publisher-filter-apply"
                type="button"
                @click="applyPublisherFilters"
              >
                <Filter class="h-4 w-4" />筛选
              </button>
              <button type="button" @click="resetPublisherFilters">
                <RefreshCcw class="h-4 w-4" />重置
              </button>
            </div>
          </div>
          <div
            v-if="publisherRowSelection.length"
            class="publisher-design-selection"
          >
            <button
              class="publisher-selection-toggle"
              type="button"
              @click="toggleAllPublisherRows"
            >
              <CheckCircle2 class="h-4 w-4" />
              {{
                publisherRowSelection.length === filteredPublisherTasks.length
                  ? "取消全选"
                  : "全选"
              }}
            </button>
            <span
              >已选择
              {{ publisherRowSelection.length }} 个视频</span
            >
            <span
              v-if="publisherPrecheckState !== 'idle'"
              class="publisher-precheck-status"
              :class="`is-${publisherPrecheckState}`"
            >{{ publisherPrecheckMessage }}</span>
            <div>
              <button type="button" @click="openPublisherDrawer">
                批量编辑</button
              ><button
                type="button"
                @click="openPublisherBatchSelector('product')"
              >
                设置商品</button
              ><button type="button" @click="preparePublisherScheduleSelection">
                设置发布时间</button>
              <label class="publisher-precheck-toggle">
                <input v-model="publisherPrecheckEnabled" type="checkbox" />
                发布前预检
              </label>
              <button
                v-if="publisherPrecheckEnabled"
                type="button"
                @click="precheckPublisher"
              >预检</button>
            </div>
            <button
              class="publisher-design-primary publisher-submit-button"
              type="button"
              :disabled="publisherBusy"
              @click="publishSelectedRows"
            >
              <Send class="h-4 w-4" />提交发布
              ({{ publisherRowSelection.length }})
            </button>
          </div>
          <main class="publisher-design-list">
            <div class="publisher-design-list-head">
              <span>选择</span><span>视频</span><span>标题</span
              ><span>关联商品</span><span>发布时间</span><span>状态</span
              ><span>操作</span>
            </div>
            <div class="publisher-design-rows">
              <div
                v-for="(item, index) in pagedPublisherTasks"
                :key="item.id"
                class="publisher-design-row"
                :class="{ 'is-published': item.state === 'published' }"
              >
                <label
                  ><input
                    type="checkbox"
                    :disabled="item.state === 'published'"
                    :checked="publisherRowSelection.includes(item.id)"
                    @change="togglePublisherRow(item.id)"
                  /><b>{{ index + 1 }}</b></label
                >
                <div class="publisher-design-video">
                  <span class="publisher-design-thumb"
                  ><img
                    v-if="publisherPosterSrc(item)"
                    :src="publisherPosterSrc(item)"
                    alt="video poster"
                    loading="lazy"
                  /><span v-else class="publisher-poster-placeholder"><Play class="h-4 w-4" /></span
                    ><small>00:18</small></span
                  ><span
                    ><strong>{{ fileName(item.sourceVideoPath) }}</strong
                    ><small>1080 x 1920 · 24.5MB</small></span
                  >
                </div>
                <div class="publisher-design-title-cell">
                  <span>{{ item.videoTitle || "未设置标题" }}</span
                  ><button
                    type="button"
                    title="编辑"
                    :disabled="item.state === 'published'"
                    @click="
                      editPublisherTask(item);
                      openPublisherDrawer();
                    "
                  >
                    <Pencil class="h-3 w-3" />
                  </button>
                </div>
                <button
                  class="publisher-design-product"
                  type="button"
                  :disabled="item.state === 'published'"
                  @click="
                    publisherEditId = item.id;
                    openPublisherSelector('product');
                  "
                >
                  <span class="publisher-design-product-thumb"
                    ><Package class="h-3 w-3" /></span
                  ><span>{{ item.productTitle || "选择商品" }}</span>
                </button>
                <span class="publisher-design-time">{{
                  formatPublisherSchedule(item.scheduleAt)
                }}</span
                ><button
                  type="button"
                  class="publisher-design-state"
                  :class="`state-${item.state}`"
                  :title="publisherStateLabel(item.state)"
                  @click="openPublisherStatusDetail(item)"
                  ><i></i>{{ publisherStateLabel(item.state) }}</button
                >
                <div class="publisher-design-row-actions">
                  <button
                    type="button"
                    title="编辑"
                    :disabled="item.state === 'published'"
                    @click="
                      editPublisherTask(item);
                      openPublisherDrawer();
                    "
                  >
                    <Pencil class="h-4 w-4" /></button
                  ><button
                    type="button"
                    title="删除发布任务"
                    aria-label="删除发布任务"
                    @click="removePublisherRow(item.id)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div
                v-if="!pagedPublisherTasks.length"
                class="publisher-design-empty"
              >
                <Package class="h-6 w-6" /><strong>还没有发布任务</strong
                ><span>点击顶部按钮导入或选择视频</span>
              </div>
            </div>
            <div class="publisher-design-pager">
              <button
                type="button"
                :disabled="publisherPage <= 1"
                @click="setPublisherPage(publisherPage - 1)"
              >
              <ChevronLeft class="h-4 w-4" /></button
              ><template v-for="page in publisherPaginationItems" :key="page">
                <button
                  v-if="typeof page === 'number'"
                  :class="{ active: publisherPage === page }"
                  type="button"
                  @click="setPublisherPage(page)"
                >
                  {{ page }}
                </button>
                <span v-else class="publisher-design-pager__ellipsis" aria-hidden="true">...</span>
              </template><button
                type="button"
                :disabled="publisherPage >= publisherPageCount"
                @click="setPublisherPage(publisherPage + 1)"
              >
                <ChevronRight class="h-4 w-4" /></button
              ><select
                v-model.number="publisherPageSize"
                @change="publisherPage = 1"
              >
                <option :value="20">每页 20 条</option>
                <option :value="50">每页 50 条</option></select
              ><span
                >共 {{ filteredPublisherTasks.length }} 个视频，已选择
                {{ publisherRowSelection.length }} 个</span
              >
            </div>
          </main>
        </div>
        <aside class="publisher-design-editor">
          <div class="publisher-design-editor-head">
            <div>
              <Sparkles class="h-5 w-5" />
              <div>
                <h2>批量编辑</h2>
                <p>已选择 {{ publisherRowSelection.length }} 个视频</p>
              </div>
            </div>
            <button class="publisher-editor-preview-button" type="button">
              <Play class="h-4 w-4" />预览选中
            </button>
          </div>
          <div class="publisher-design-preview">
            <div
              v-for="item in publisherSelectedTasks.slice(0, 3)"
              :key="item.id"
              class="publisher-design-preview-thumb"
            >
              <video
                :src="previewSrc(item.sourceVideoPath)"
                muted
                preload="metadata"
              ></video>
            </div>
            <span v-if="publisherSelectedTasks.length > 3"
              >+{{ publisherSelectedTasks.length - 3 }}</span
            >
          </div>
          <div class="publisher-editor-tabs publisher-editor-tabs-single">
            <span class="active">批量设置</span>
          </div>
          <p class="publisher-design-hint">
            选择要修改的内容 <small>未选择的字段不会被修改</small>
          </p>
          <label class="publisher-design-check"
            ><input
              v-model="publisherEditorFields.title"
              type="checkbox"
            />标题</label
          >
          <div
            v-if="publisherEditorFields.title"
            class="publisher-design-field"
          >
            <input
              v-model="publisherTitle"
              maxlength="150"
              placeholder="输入新的标题"
            /><small>将应用到 {{ publisherRowSelection.length }} 个视频</small>
            <div class="publisher-design-radio">
              <label
                ><input
                  v-model="publisherOverwriteTitle"
                  type="radio"
                  :value="false"
                />仅修改空白标题</label
              ><label
                ><input
                  v-model="publisherOverwriteTitle"
                  type="radio"
                  :value="true"
                />覆盖所有选中视频</label
              >
            </div>
          </div>
          <label class="publisher-design-check"
            ><input
              v-model="publisherEditorFields.description"
              type="checkbox"
            />描述</label
          >
          <div
            v-if="publisherEditorFields.description"
            class="publisher-design-field"
          >
            <textarea
              v-model="publisherDescription"
              rows="3"
              maxlength="500"
              placeholder="输入视频描述..."
            ></textarea
            ><small>{{ publisherDescription.length }}/500</small>
            <div class="publisher-description-tags">
              <button
                v-for="tag in publisherTags"
                :key="tag"
                type="button"
                @click="insertPublisherTag(tag)"
              >{{ tag }}</button>
              <button type="button" @click="addPublisherTag">+ 添加标签</button>
            </div>
            <div v-if="publisherTagInputOpen" class="publisher-description-tag-input">
              <input
                v-model="publisherTagDraft"
                placeholder="输入标签，例如 jewelry"
                @keyup.enter="confirmPublisherTag"
                @keyup.esc="cancelPublisherTag"
              />
              <button type="button" @click="confirmPublisherTag">添加</button>
            </div>
          </div>
          <label class="publisher-design-check"
            ><input
              v-model="publisherEditorFields.product"
              type="checkbox"
            />商品</label
          >
          <div
            v-if="publisherEditorFields.product || publisherEditorFields.music"
            class="publisher-design-field"
          >
            <span>发布账号</span>
            <button
              class="publisher-design-select"
              type="button"
              @click="openPublisherBatchSelector('account')"
            >
              <UserRound class="h-4 w-4" />{{
                publisherConnectionItem?.name || "选择发布账号"
              }}
            </button>
            <small>商品和音乐将使用此账号的数据</small>
          </div>
          <div
            v-if="publisherEditorFields.product"
            class="publisher-design-field"
          >
            <button
              class="publisher-design-select"
              type="button"
              @click="openPublisherBatchSelector('product')"
            >
              <Package class="h-4 w-4" />{{
                publisherProductItem?.title || "选择商品"
              }}
            </button>
          </div>
          <label class="publisher-design-check"
            ><input
              v-model="publisherEditorFields.schedule"
              type="checkbox"
            />发布时间</label
          >
          <div
            v-if="publisherEditorFields.schedule"
            class="publisher-design-field"
          >
            <div class="publisher-design-radio">
              <label
                ><input
                  type="radio"
                  value="keep"
                  v-model="publisherScheduleMode"
                />保持原时间</label
              ><label
                ><input
                  type="radio"
                  value="unified"
                  v-model="publisherScheduleMode"
                />统一发布时间</label
              ><label
                ><input
                  type="radio"
                  value="sequence"
                  v-model="publisherScheduleMode"
                />按顺序发布</label
              >
            </div>
            <div
              v-if="publisherScheduleMode !== 'keep'"
              class="publisher-schedule-input"
            >
              <Clock3 class="h-4 w-4" />
              <input
                v-model="publisherUnifiedSchedule"
                type="datetime-local"
                @input="publisherSyncError = ''"
              />
            </div>
            <label
              v-if="publisherScheduleMode === 'sequence'"
              class="publisher-sequence-interval"
            >
              <span>发布间隔</span>
              <input
                v-model.number="publisherSequenceInterval"
                type="number"
                min="1"
                max="1440"
              />
              <small>分钟</small>
            </label>
          </div>
          <label class="publisher-design-check"
            ><input
              v-model="publisherEditorFields.music"
              type="checkbox"
            />音乐</label
          >
          <div
            v-if="publisherEditorFields.music"
            class="publisher-design-field"
          >
            <button
              class="publisher-design-select"
              type="button"
              @click="openPublisherBatchSelector('music')"
            >
              <Music2 class="h-4 w-4" />{{
                publisherSelectedMusic?.title || "选择音乐"
              }}
            </button>
          </div>
          <div class="publisher-editor-apply-mode">
            <strong>应用方式</strong>
            <div class="publisher-design-radio">
              <label
                ><input
                  v-model="publisherApplyMode"
                  type="radio"
                  value="empty"
                />仅填充空白字段</label
              >
              <label
                ><input
                  v-model="publisherApplyMode"
                  type="radio"
                  value="all"
                />覆盖全部选中视频</label
              >
            </div>
          </div>
          <div class="publisher-design-apply">
            <button type="button" @click="publisherRowSelection = []">
              取消
            </button>
            <button type="button" @click="applyPublisherDefaults()">
              应用修改
            </button>
          </div>
        </aside>
      </div>
    </section>
    <section v-if="activeTab === 'publish'" class="publisher-single-page">
      <div class="publisher-single-head">
        <div class="publisher-single-brand">
          <div class="publisher-single-icon"><Send class="h-5 w-5" /></div>
          <div>
            <h1>批量发布</h1>
            <p>批量管理与发布 TikTok 视频</p>
          </div>
        </div>
        <div class="publisher-single-head-actions">
          <div class="publisher-api-chip">
            <KeyRound class="h-4 w-4" /><span>Creatok API</span
            ><i :class="{ ready: publisherConfigured }"></i
            ><em>{{ publisherConfigured ? "已连接" : "未连接" }}</em
            ><button
              type="button"
              @click="publisherCredentialOpen = !publisherCredentialOpen"
            >
              {{ publisherConfigured ? "管理" : "连接" }}
            </button>
          </div>
          <button
            class="toolbar-button"
            type="button"
            @click="pickPublisherVideos"
          >
            <FolderOpen class="h-4 w-4" />导入视频</button
          ><button
            class="toolbar-button"
            type="button"
            @click="pickPublisherVideos"
          >
            <FolderOpen class="h-4 w-4" />从素材库选择</button
          ><button
            class="primary-button"
            type="button"
            @click="pickPublisherVideos"
          >
            <ImagePlus class="h-4 w-4" />上传视频
          </button>
        </div>
      </div>
      <div class="publisher-single-stats">
        <div class="selected">
          <CheckCircle2 class="h-4 w-4" /><span
            >已选 <strong>{{ publisherRowSelection.length }}</strong></span
          >
        </div>
        <div>
          <span
            >视频 <strong>{{ publisherTasks.length }}</strong></span
          >
        </div>
        <div>
          <span
            >待发布
            <strong>{{
              publisherPendingTasks.length
            }}</strong></span
          >
        </div>
        <div>
          <span
            >草稿
            <strong>{{
              publisherTasks.filter((item) => item.state === "draft").length
            }}</strong></span
          >
        </div>
        <div>
          <span
            >已发布
            <strong>{{
              publisherTasks.filter((item) => item.state === "published").length
            }}</strong></span
          >
        </div>
      </div>
      <div class="publisher-single-filters">
        <select v-model="publisherFilterStatus" @change="publisherPage = 1">
          <option value="all">全部状态</option>
          <option value="pending">待发布</option>
          <option value="draft">草稿</option>
          <option value="published">已发布</option></select
        ><select v-model="publisherFilterAccount" @change="publisherPage = 1">
          <option value="all">全部账号</option>
          <option v-for="account in publisherConnections" :key="account.uid">
            {{ account.name || account.uid }}
          </option></select
        ><select v-model="publisherFilterProduct" @change="publisherPage = 1">
          <option value="all">全部商品</option>
          <option v-for="product in publisherProducts" :key="product.id">
            {{ product.title || product.name }}
          </option></select
        ><select>
          <option>选择分类</option>
        </select>
        <div class="publisher-search">
          <Search class="h-4 w-4" /><input
            v-model="publisherSearch"
            placeholder="搜索视频标题、标签或商品..."
            @input="publisherPage = 1"
          />
        </div>
        <button class="toolbar-button"><Filter class="h-4 w-4" />筛选</button
        ><button class="toolbar-button" @click="refreshPublisher">
          <RefreshCcw class="h-4 w-4" />重置
        </button>
      </div>
      <div v-if="publisherRowSelection.length" class="publisher-single-toolbar">
        <span
          ><CheckCircle2 class="h-4 w-4" />已选择
          {{ publisherRowSelection.length }} 个</span
        >
        <div>
          <button class="toolbar-button" @click="openPublisherDrawer">
            批量编辑</button
          ><button
            class="toolbar-button"
            @click="openPublisherSelector('product')"
          >
            商品</button
          ><button class="toolbar-button" @click="addPublisherTag">标签</button
          ><button class="toolbar-button" @click="openPublisherDrawer">
            发布时间</button
          ><button class="toolbar-button">更多</button>
        </div>
        <button
          class="primary-button"
          :disabled="publisherBusy"
          @click="publishSelectedRows"
        >
          <Send class="h-4 w-4" />批量发布 {{ publisherRowSelection.length }}
        </button>
      </div>
      <div class="publisher-single-main">
        <div class="publisher-single-list">
          <div class="publisher-single-list-head">
            <span>选择</span><span>视频信息</span><span>时长</span
            ><span>标题</span><span>关联商品</span><span>标签</span
            ><span>发布时间</span><span>状态</span><span>操作</span>
          </div>
          <div
            v-if="filteredPublisherTasks.length"
            class="publisher-single-rows"
          >
            <div
              v-for="(item, index) in pagedPublisherTasks"
              :key="item.id"
              class="publisher-single-row"
            >
              <label
                ><input
                  type="checkbox"
                  :checked="publisherRowSelection.includes(item.id)"
                  @change="togglePublisherRow(item.id)"
                /><b>{{ index + 1 }}</b></label
              >
              <div class="single-video-info">
                <span class="single-video-thumb"
                  ><img
                    v-if="publisherPosterSrc(item)"
                    :src="publisherPosterSrc(item)"
                    alt="video poster"
                    loading="lazy"
                  /><span v-else class="publisher-poster-placeholder"><Play class="h-4 w-4" /></span></span
                ><span
                  ><strong>{{ fileName(item.sourceVideoPath) }}</strong
                  ><small>1080 x 1920 · 视频素材</small></span
                >
              </div>
              <span class="single-duration">00:18</span
              ><input
                v-model="item.videoTitle"
                @blur="savePublisherRow(item)"
                placeholder="视频标题"
              /><button
                class="single-product single-product-button"
                type="button"
                @click="openPublisherSelector('product')"
              >
                {{
                  item.productTitle ||
                  publisherProducts.find((p) => p.id === item.productId)
                    ?.title ||
                  "选择商品"
                }}
              </button>
              <div class="single-tags">
                <span>#TikTok</span><span>#fyp</span><b>+2</b>
              </div>
              <div class="single-time">{{ item.scheduleAt || "立即发布" }}</div>
              <span class="single-state" :class="`state-${item.state}`">{{
                item.state === "published"
                  ? "已发布"
                  : item.state === "draft"
                    ? "草稿"
                    : item.state === "failed" || item.state === "result_unknown"
                      ? "发布失败"
                    : "待发布"
              }}</span>
              <div class="single-actions">
                <button
                  class="ghost-button small action-icon"
                  type="button"
                  title="编辑视频"
                  aria-label="编辑视频"
                  @click="editPublisherTask(item)"
                >
                  <Pencil class="h-4 w-4" /></button
                ><button
                  class="ghost-button small action-icon"
                  type="button"
                  title="应用批量配置"
                  aria-label="应用批量配置"
                  @click="applyPublisherDefaults([item.id])"
                >
                  <CheckCircle2 class="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div v-else class="publisher-batch-empty">
            <Package class="h-7 w-7" /><strong>还没有发布任务</strong
            ><span>点击顶部按钮导入或选择视频</span
            ><button class="primary-button" @click="pickPublisherVideos">
              添加视频
            </button>
          </div>
          <div class="publisher-single-pager">
            <button
              class="ghost-button small"
              type="button"
              :disabled="publisherPage <= 1"
              @click="setPublisherPage(publisherPage - 1)"
            >
              ‹</button
            ><template v-for="page in publisherPaginationItems" :key="page">
              <button
                v-if="typeof page === 'number'"
                class="ghost-button small"
                :class="{ active: publisherPage === page }"
                type="button"
                @click="setPublisherPage(page)"
              >
                {{ page }}
              </button>
              <span v-else class="publisher-single-pager__ellipsis" aria-hidden="true">...</span>
            </template>
            ><button
              class="ghost-button small"
              type="button"
              :disabled="publisherPage >= publisherPageCount"
              @click="setPublisherPage(publisherPage + 1)"
            >
              ›</button
            ><select
              v-model.number="publisherPageSize"
              @change="publisherPage = 1"
            >
              <option :value="20">每页 20 条</option>
              <option :value="50">每页 50 条</option></select
            ><span
              >共 {{ filteredPublisherTasks.length }} 个视频，已选择
              {{ publisherRowSelection.length }} 个</span
            >
          </div>
        </div>
        <aside class="publisher-single-edit">
          <div class="publisher-single-edit-head">
            <Sparkles class="h-5 w-5" />
            <div>
              <strong>批量编辑</strong><small>快速修改选中视频的内容</small>
            </div>
          </div>
          <div class="publisher-edit-tabs">
            <button class="active">视频信息</button><button>商品设置</button
            ><button>发布设置</button><button>高级选项</button>
          </div>
          <div v-if="publisherPreviewTask" class="publisher-edit-preview">
            <video
              :src="previewSrc(publisherPreviewTask.sourceVideoPath)"
              muted
              controls
            ></video
            ><button
              class="ghost-button small"
              @click="editPublisherTask(publisherPreviewTask)"
            >
              预览 ({{ publisherTasks.length }})
            </button>
          </div>
          <label class="publisher-editor-field"
            ><span
              >标题
              <small
                >将应用到
                {{ publisherRowSelection.length || publisherTasks.length }}
                个视频</small
              ></span
            ><input
              v-model="publisherTitle"
              maxlength="150"
              placeholder="请输入视频标题" /></label
          ><label class="publisher-editor-field"
            ><span>描述</span
            ><textarea
              v-model="publisherDescription"
              rows="4"
              maxlength="500"
              placeholder="输入视频描述和话题标签"
            ></textarea>
          </label>
          <div class="publisher-editor-tags">
            <button
              v-for="tag in publisherTags"
              :key="tag"
              @click="insertPublisherTag(tag)"
            >
              {{ tag }}</button
            ><button class="tag-add" @click="addPublisherTag">
              + 添加话题
            </button>
          </div>
          <div class="publisher-editor-media-actions">
            <button
              class="toolbar-button"
              type="button"
              @click="openPublisherSelector('product')"
            >
              <Package class="h-4 w-4" />{{
                publisherProductItem?.title || "选择商品"
              }}</button
            ><button
              class="toolbar-button"
              type="button"
              @click="openPublisherSelector('music')"
            >
              <Music2 class="h-4 w-4" />{{
                publisherSelectedMusic?.title || "选择音乐"
              }}
            </button>
          </div>
          <button
            class="primary-button publisher-apply-button"
            @click="applyPublisherDefaults"
          >
            应用到选中视频 ({{
              publisherRowSelection.length || publisherTasks.length
            }})</button
          ><button
            class="ghost-button publisher-reset-button"
            @click="savePublisherDraft"
          >
            保存为草稿
          </button>
        </aside>
      </div>
    </section>
    <div
      v-if="publisherDrawerOpen"
      class="publisher-drawer-backdrop"
      @click.self="publisherDrawerOpen = false"
    >
      <aside class="publisher-drawer">
        <div class="publisher-drawer-head">
          <div>
            <strong>{{ publisherEditId ? "编辑视频" : "批量编辑" }}</strong
            ><small>已选择 {{ publisherRowSelection.length }} 个视频</small>
          </div>
          <button
            class="ghost-button small action-icon"
            type="button"
            aria-label="关闭"
            title="关闭"
            @click="publisherDrawerOpen = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="publisher-drawer-body">
          <div class="publisher-editor-field">
            <span>音乐</span
            ><button
              class="publisher-select-button"
              type="button"
              @click="openPublisherSelector('music')"
            >
              <Music2 class="h-4 w-4" /><span>{{
                publisherSelectedMusic?.title || "选择音乐"
              }}</span
              ><ChevronDown class="h-4 w-4" />
            </button>
          </div>
          <label class="publisher-editor-field"
            ><span>标题</span
            ><input
              v-model="publisherTitle"
              maxlength="150"
              placeholder="输入标题"
            /><span class="publisher-drawer-check"
              ><input
                v-model="publisherOverwriteTitle"
                type="checkbox"
              />覆盖原有标题</span
            ></label
          ><label class="publisher-editor-field"
            ><span>描述</span
            ><textarea
              v-model="publisherDescription"
              rows="4"
              maxlength="500"
              placeholder="输入描述"
            ></textarea
            ><span class="publisher-drawer-check"
              ><input
                v-model="publisherOverwriteDescription"
                type="checkbox"
              />覆盖原有描述</span
            ></label
          >
          <div class="publisher-editor-field">
            <span>标签</span>
            <div class="publisher-editor-tags">
              <button
                v-for="tag in publisherTags"
                :key="tag"
                type="button"
                @click="insertPublisherTag(tag)"
              >
                {{ tag }}</button
              ><button class="tag-add" type="button" @click="addPublisherTag">
                + 添加
              </button>
            </div>
            <div v-if="publisherTagInputOpen" class="publisher-drawer-tag-input">
              <input
                v-model="publisherTagDraft"
                type="text"
                placeholder="输入标签，例如 jewelry"
                @keyup.enter="confirmPublisherTag"
                @keyup.esc="cancelPublisherTag"
              />
              <button type="button" @click="confirmPublisherTag">添加</button>
            </div>
          </div>
          <label class="publisher-editor-field"
            ><span>商品</span
            ><button
              class="publisher-select-button"
              type="button"
              @click="openPublisherSelector('product')"
            >
              <span>{{ publisherProductItem?.title || "选择商品" }}</span
              ><ChevronDown class="h-4 w-4" /></button
          ></label>
          <div class="publisher-editor-field">
            <span>发布时间</span>
            <div class="publisher-drawer-radios">
              <label
                ><input
                  type="radio"
                  value="keep"
                  v-model="publisherScheduleMode"
                />保持原时间</label
              ><label
                ><input
                  type="radio"
                  value="sequence"
                  v-model="publisherScheduleMode"
                />按顺序发布</label
              ><label
                ><input
                  type="radio"
                  value="unified"
                  v-model="publisherScheduleMode"
                />统一发布时间</label
              >
            </div>
            <input
              v-if="publisherScheduleMode !== 'keep'"
              v-model="publisherUnifiedSchedule"
              type="datetime-local"
            />
          </div>
        </div>
        <div class="publisher-drawer-actions">
          <button
            class="ghost-button"
            type="button"
            @click="publisherDrawerOpen = false"
          >
            取消</button
          ><button
            class="primary-button"
            type="button"
            @click="
              publisherEditId ? applyPublisherEdit() : applyPublisherDefaults();
              publisherDrawerOpen = false;
            "
          >
            {{ publisherEditId ? "保存修改" : `应用到 ${publisherRowSelection.length} 个视频` }}
          </button>
        </div>
      </aside>
    </div>
    <section
      v-if="activeTab === 'publish'"
      class="publisher-batch-workspace panel-card"
    >
      <div class="publisher-batch-toolbar">
        <div class="publisher-batch-title">
          <Package class="h-5 w-5" />
          <div>
            <h2>批量编辑设置</h2>
            <p>统一配置后应用到右侧选中的视频任务</p>
          </div>
        </div>
        <div class="publisher-batch-actions">
          <button
            class="toolbar-button"
            type="button"
            @click="pickPublisherVideos"
          >
            <FolderOpen class="h-4 w-4" />添加视频</button
          ><button
            class="toolbar-button"
            type="button"
            :disabled="!publisherTasks.length"
            @click="toggleAllPublisherRows"
          >
            {{
              publisherRowSelection.length === publisherTasks.length
                ? "取消全选"
                : "全选"
            }}</button
          ><button
            class="primary-button"
            type="button"
            :disabled="publisherBusy || !publisherTasks.length"
            @click="publishSelectedRows"
          >
            <Send class="h-4 w-4" />批量发布
          </button>
        </div>
      </div>
      <div class="publisher-batch-body">
        <aside class="publisher-batch-editor">
          <div class="publisher-editor-head">
            <strong>批量编辑设置</strong
            ><span
              >{{
                publisherRowSelection.length || publisherTasks.length
              }}
              个视频</span
            >
          </div>
          <label class="publisher-editor-field"
            ><span>发布账号</span
            ><button
              class="publisher-select-button"
              type="button"
              @click="openPublisherSelector('account')"
            >
              <span>{{
                publisherConnectionItem?.name || "请选择 TikTok Shop 账号"
              }}</span
              ><ChevronDown class="h-4 w-4" /></button
          ></label>
          <label class="publisher-editor-field"
            ><span>关联商品</span
            ><button
              class="publisher-select-button"
              type="button"
              :disabled="!publisherConnection"
              @click="openPublisherSelector('product')"
            >
              <span>{{ publisherProductItem?.title || "请选择商品" }}</span
              ><ChevronDown class="h-4 w-4" /></button
          ></label>
          <label class="publisher-editor-field"
            ><span>商品标题</span
            ><input
              v-model="publisherTitle"
              maxlength="150"
              placeholder="输入商品标题"
          /></label>
          <label class="publisher-editor-field"
            ><span>视频描述</span
            ><textarea
              v-model="publisherDescription"
              maxlength="500"
              rows="5"
              placeholder="输入视频描述和话题标签"
            ></textarea
            ><small>{{ publisherDescription.length }}/500</small></label
          >
          <div class="publisher-editor-tags">
            <button
              v-for="tag in publisherTags"
              :key="tag"
              type="button"
              @click="insertPublisherTag(tag)"
            >
              {{ tag }}</button
            ><button type="button" class="tag-add" @click="addPublisherTag">
              + 添加话题
            </button>
          </div>
          <div class="publisher-editor-publish-time">
            <span>发布时间</span
            ><label
              ><input
                type="radio"
                name="batch-publish-time"
                :checked="!publisherSchedule"
                @change="publisherSchedule = ''"
              />立即发布</label
            ><label
              ><input
                type="radio"
                name="batch-publish-time"
                :checked="Boolean(publisherSchedule)"
                @change="
                  publisherSchedule = new Date(Date.now() + 3600000)
                    .toISOString()
                    .slice(0, 16)
                "
              />定时发布</label
            ><input
              v-if="publisherSchedule"
              v-model="publisherSchedule"
              type="datetime-local"
            />
          </div>
          <button
            class="primary-button publisher-apply-button"
            type="button"
            :disabled="!publisherTasks.length"
            @click="applyPublisherDefaults"
          >
            应用到选中视频 ({{
              publisherRowSelection.length || publisherTasks.length
            }})
          </button>
          <button
            class="ghost-button publisher-reset-button"
            type="button"
            @click="savePublisherDraft"
          >
            保存为草稿
          </button>
        </aside>
        <div class="publisher-batch-table-wrap">
          <div class="publisher-batch-head">
            <span>选择</span><span>视频</span><span>TikTok Shop账号</span
            ><span>商品</span><span>商品标题</span><span>视频标题</span
            ><span>发布时间</span><span>预检</span><span>操作</span>
          </div>
          <div v-if="filteredPublisherTasks.length" class="publisher-batch-list">
            <div
              v-for="(item, index) in filteredPublisherTasks"
              :key="item.id"
              class="publisher-batch-row"
            >
              <label class="publisher-batch-check"
                ><input
                  type="checkbox"
                  :checked="publisherRowSelection.includes(item.id)"
                  @change="togglePublisherRow(item.id)"
                /><b>{{ index + 1 }}</b></label
              >
              <div class="publisher-batch-video">
                <span class="publisher-batch-thumb"
                  ><img
                    v-if="publisherPosterSrc(item)"
                    :src="publisherPosterSrc(item)"
                    alt="video poster"
                    loading="lazy"
                  /><span v-else class="publisher-poster-placeholder"><Play class="h-4 w-4" /></span></span
                ><span>{{ fileName(item.sourceVideoPath) }}</span>
              </div>
              <select
                v-model="item.connectionUid"
                class="publisher-batch-select"
                @change="savePublisherRow(item)"
              >
                <option value="">请选择账号</option>
                <option
                  v-for="account in publisherConnections"
                  :key="account.uid"
                  :value="account.uid"
                >
                  {{ account.name || account.uid }}
                </option></select
              ><select
                v-model="item.productId"
                class="publisher-batch-select"
                @change="savePublisherRow(item)"
              >
                <option value="">选择商品</option>
                <option
                  v-for="product in publisherProducts"
                  :key="product.id"
                  :value="product.id"
                >
                  {{ product.title || product.name }}
                </option></select
              ><input
                v-model="item.productTitle"
                class="publisher-batch-input"
                placeholder="商品标题"
                @blur="savePublisherRow(item)"
              /><input
                v-model="item.videoTitle"
                class="publisher-batch-input"
                placeholder="视频标题"
                @blur="savePublisherRow(item)"
              />
              <div class="publisher-batch-schedule">
                <label
                  ><input
                    type="radio"
                    :name="`publish-now-${item.id}`"
                    :checked="!item.scheduleAt"
                    @change="
                      item.scheduleAt = '';
                      savePublisherRow(item);
                    "
                  />立即</label
                ><label
                  ><input
                    type="radio"
                    :name="`publish-at-${item.id}`"
                    :checked="Boolean(item.scheduleAt)"
                    @click="setPublisherRowSchedule(item)"
                  />定时</label
                ><input
                  v-if="item.scheduleAt"
                  v-model="item.scheduleAt"
                  type="datetime-local"
                  @change="savePublisherRow(item)"
                />
              </div>
              <span
                class="publisher-batch-state"
                :class="`state-${item.state}`"
                >{{ item.state || "draft" }}</span
              >
              <div class="publisher-batch-actions-cell">
                <button
                  class="ghost-button small"
                  type="button"
                  title="应用左侧配置"
                  @click="applyPublisherDefaults([item.id])"
                >
                  <CheckCircle2 class="h-4 w-4" /></button
                ><button
                  class="ghost-button small danger"
                  type="button"
                  title="移除任务"
                  @click="removePublisherRow(item.id)"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div v-else class="publisher-batch-empty">
            <Package class="h-7 w-7" /><strong>还没有发布任务</strong
            ><span>点击“添加视频”选择多个已完成视频，开始批量发布</span
            ><button
              class="primary-button"
              type="button"
              @click="pickPublisherVideos"
            >
              添加视频任务
            </button>
          </div>
        </div>
      </div>
    </section>
    <section v-if="activeTab === 'publish'" class="publish-layout">
      <div class="publish-left panel-card publisher-config-card">
        <div class="publish-section-head">
          <div class="publish-section-icon"><KeyRound class="h-5 w-5" /></div>
          <div>
            <h2>连接设置</h2>
            <p>请输入 Creatok API Key，用于连接 TikTok Shop 发布视频。</p>
          </div>
          <button class="publish-link" type="button" @click="openPublisherHelp">
            ? 如何获取 API Key?
          </button>
        </div>
        <div class="publish-key-row">
          <input
            v-model="publisherKey"
            type="password"
            placeholder="输入 Creatok API Key"
          /><button
            class="publish-save"
            type="button"
            @click="savePublisherKey"
          >
            保存并验证</button
          ><button
            v-if="publisherConfigured"
            class="publish-clear"
            type="button"
            @click="clearPublisherKey"
          >
            清除</button
          ><button class="publish-test" type="button" @click="testPublisherKey">
            测试
          </button>
        </div>
        <div class="publish-divider"></div>
        <div class="publish-section-head">
          <div class="publish-section-icon"><UserRound class="h-5 w-5" /></div>
          <div>
            <h2>账号与商品配置</h2>
            <p>选择要发布的账号与关联商品，支持多账号统一管理。</p>
          </div>
        </div>
        <div class="publish-form-grid">
          <label
            ><span>发布账号 <em>*</em></span
            ><button
              class="publisher-select-button"
              type="button"
              @click="openPublisherSelector('account')"
            >
              <span>{{
                publisherConnectionItem?.name || "请选择 TikTok 账号"
              }}</span
              ><ChevronDown class="h-4 w-4" /></button></label
          ><label
            ><span>关联商品</span
            ><button
              class="publisher-select-button"
              type="button"
              :disabled="!publisherConnection"
              @click="openPublisherSelector('product')"
            >
              <span>{{
                publisherProductItem?.title || "选择商品（可选）"
              }}</span
              ><ChevronDown class="h-4 w-4" /></button
          ></label>
        </div>
        <div class="publish-divider"></div>
        <div class="publish-section-head">
          <div class="publish-section-icon"><FileImage class="h-5 w-5" /></div>
          <div>
            <h2>视频信息</h2>
            <p>填写视频标题与描述，支持话题标签、@提及，提升曝光。</p>
          </div>
        </div>
        <label class="publish-field"
          ><span>视频标题 <em>*</em></span
          ><input
            v-model="publisherTitle"
            maxlength="150"
            placeholder="输入视频标题，吸引更多用户观看..."
          /><small>{{ publisherTitle.length }}/150</small></label
        ><label class="publish-field"
          ><span>视频描述</span
          ><textarea
            v-model="publisherDescription"
            maxlength="500"
            rows="3"
            placeholder="输入视频描述，支持 #话题 @账号 ..."
          ></textarea
          ><small>{{ publisherDescription.length }}/500</small></label
        >
        <div class="publish-tags">
          <button
            v-for="tag in publisherTags"
            :key="tag"
            type="button"
            @click="insertPublisherTag(tag)"
          >
            {{ tag }}</button
          ><template v-if="publisherTagInputOpen"
            ><input
              v-model="publisherTagDraft"
              class="publish-tag-input"
              placeholder="输入话题"
              @keyup.enter="confirmPublisherTag"
              @keyup.esc="cancelPublisherTag"
            /><button
              type="button"
              class="publish-tag-confirm"
              @click="confirmPublisherTag"
            >
              确定</button
            ><button
              type="button"
              class="publish-tag-cancel"
              @click="cancelPublisherTag"
            >
              取消
            </button></template
          ><button v-else type="button" @click="addPublisherTag">
            + 添加话题
          </button>
        </div>
        <label class="publish-field publish-date"
          ><span>发布日期 <em>*</em></span
          ><input v-model="publisherSchedule" type="datetime-local" /><small
            >立即发布或设置未来 60 天内的时间</small
          ></label
        >
        <div class="publish-actions">
          <button
            class="publish-draft"
            type="button"
            @click="savePublisherDraft"
          >
            保存草稿</button
          ><button
            class="publish-pick"
            type="button"
            @click="pickPublisherVideos"
          >
            <FolderOpen class="h-4 w-4" />选择视频素材</button
          ><button
            class="publish-next"
            type="button"
            :disabled="publisherBusy"
            @click="nextPublisherStep"
          >
            下一步 <ChevronRight class="h-4 w-4" />
          </button>
        </div>
      </div>
      <div class="publish-right">
        <div class="publish-preview panel-card">
          <div class="publish-card-title">
            <div>
              <h2>发布预览</h2>
              <p>实时预览你的短视频效果</p>
            </div>
            <span class="publish-live-dot">●</span>
          </div>
          <div class="publish-preview-body">
            <div class="publish-phone">
              <video
                v-if="publisherPreviewTask?.sourceVideoPath"
                :src="previewSrc(publisherPreviewTask.sourceVideoPath)"
                muted
                controls
              ></video>
              <div v-else>
                <Play class="h-5 w-5" /><span>添加视频后预览</span>
              </div>
            </div>
            <div class="publish-info-card">
              <div class="publish-info-head">
                <h3>视频信息</h3>
                <button type="button">编辑</button>
              </div>
              <div class="publish-info-row">
                <span>标题</span
                ><strong>{{ publisherTitle || "遇见更好的自己 ✨" }}</strong>
              </div>
              <div class="publish-info-row">
                <span>描述</span
                ><strong>{{
                  publisherDescription ||
                  "精致饰品，点亮你的每一天 #Jewelry #Fashion #OOTD"
                }}</strong>
              </div>
              <div class="publish-info-row">
                <span>发布时间</span
                ><strong>{{ publisherSchedule || "2026-09-04 12:00" }}</strong>
              </div>
              <div class="publish-info-row">
                <span>关联账号</span
                ><strong
                  >♪
                  {{ publisherConnectionItem?.name || "@your_brand" }}</strong
                >
              </div>
              <div class="publish-info-row">
                <span>关联商品</span
                ><strong
                  >{{ publisherProductItem?.title || "四叶草项链" }}<br />◉
                  199,000</strong
                >
              </div>
            </div>
          </div>
        </div>
        <div class="publish-queue panel-card">
          <div class="publish-card-title">
            <div>
              <h2>工作流 · 发布队列</h2>
              <p>任务将按顺序上传与发布</p>
            </div>
            <strong class="publish-count"
              >{{ publisherTasks.length || 5 }} <small>项</small></strong
            >
          </div>
          <div v-if="publisherTasks.length" class="publisher-queue-list">
            <div
              v-for="item in publisherTasks"
              :key="item.id"
              class="publisher-row"
              :data-task-id="item.id"
            >
              <div class="publisher-row-icon"><Play class="h-4 w-4" /></div>
              <div class="publisher-row-main">
                <strong>{{ fileName(item.sourceVideoPath) }}</strong
                ><span>00:18 · 12.4 MB</span>
              </div>
              <span
                class="publisher-row-state"
                :class="`state-${item.state}`"
                >{{ item.state }}</span
              >
            </div>
          </div>
          <div v-else class="publish-demo-queue">
            <div
              v-for="(state, index) in [
                '上传中',
                '等待中',
                '处理中',
                '等待中',
                '草稿',
              ]"
              :key="state + index"
              class="publish-demo-row"
            >
              <div class="publish-thumb"></div>
              <div>
                <strong>result.mp4</strong><small>00:18 · 12.4 MB</small>
              </div>
              <span :class="`demo-${index}`">{{ state }}</span
              ><i v-if="index === 0"></i
              ><button v-if="index === 0" type="button">取消</button><b>⋮</b>
            </div>
          </div>
        </div>
      </div>
    </section>
    <div
      v-if="publisherMusicLibraryOpen"
      class="live-subtitle-dialog"
      @click.self="closePublisherMusicLibrary"
    >
      <div class="live-subtitle-dialog__panel publisher-music-library-dialog">
        <div class="live-subtitle-dialog__head">
          <div class="live-subtitle-dialog__titleblock">
            <strong>音乐库</strong>
            <p>提前搜索、试听并收藏发布时需要使用的音乐。</p>
          </div>
          <button
            class="live-subtitle-dialog__close"
            type="button"
            title="关闭"
            @click="closePublisherMusicLibrary"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="publisher-music-library-toolbar">
          <select v-model="publisherConnection">
            <option value="">选择发布账号</option>
            <option
              v-for="item in publisherConnections"
              :key="item.uid"
              :value="item.uid"
            >
              {{ item.name || item.uid }}
            </option>
          </select>
          <div class="publisher-selector-search">
            <Search class="h-4 w-4" />
            <input
              v-model="publisherMusicQuery"
              placeholder="搜索音乐名称、作者或链接"
              @keydown.enter="searchPublisherMusic"
            />
            <button type="button" @click="searchPublisherMusic">搜索</button>
          </div>
        </div>
        <div class="publisher-music-library-content">
          <section v-if="publisherFavoriteMusic.length" class="publisher-music-group">
            <div class="publisher-music-group-head">
              <strong>已收藏</strong><span>{{ publisherFavoriteMusic.length }} 首</span>
            </div>
            <div class="publisher-music-list">
              <div
                v-for="item in publisherFavoriteMusic"
                :key="`favorite-${item.id}`"
                class="publisher-music-row"
              >
                <img v-if="item.cover_url" :src="item.cover_url" alt="music" />
                <span v-else class="publisher-music-cover"><Music2 class="h-4 w-4" /></span>
                <span class="publisher-music-meta">
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.author || "未知作者" }} · {{ item.duration || "--" }} 秒</small>
                </span>
                <button
                  class="publisher-music-icon-button"
                  type="button"
                  :title="publisherMusicPlayingId === String(item.id) ? '暂停' : '播放'"
                  @click="togglePublisherMusicPlayback(item)"
                >
                  <Pause v-if="publisherMusicPlayingId === String(item.id)" class="h-4 w-4" />
                  <Play v-else class="h-4 w-4" />
                </button>
                <button
                  class="publisher-music-icon-button favorite active"
                  type="button"
                  title="取消收藏"
                  @click="togglePublisherMusicFavorite(item)"
                >
                  <Heart class="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
          <section class="publisher-music-group">
            <div class="publisher-music-group-head">
              <strong>搜索结果</strong><span>{{ publisherMusic.length }} 首</span>
            </div>
            <div v-if="publisherMusic.length" class="publisher-music-list">
              <div
                v-for="item in publisherMusic"
                :key="`result-${item.id}`"
                class="publisher-music-row"
              >
                <img v-if="item.cover_url" :src="item.cover_url" alt="music" />
                <span v-else class="publisher-music-cover"><Music2 class="h-4 w-4" /></span>
                <span class="publisher-music-meta">
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.author || "未知作者" }} · {{ item.duration || "--" }} 秒</small>
                </span>
                <button
                  class="publisher-music-icon-button"
                  type="button"
                  :title="publisherMusicPlayingId === String(item.id) ? '暂停' : '播放'"
                  @click="togglePublisherMusicPlayback(item)"
                >
                  <Pause v-if="publisherMusicPlayingId === String(item.id)" class="h-4 w-4" />
                  <Play v-else class="h-4 w-4" />
                </button>
                <button
                  class="publisher-music-icon-button favorite"
                  :class="{ active: isPublisherMusicFavorite(item) }"
                  type="button"
                  :title="isPublisherMusicFavorite(item) ? '取消收藏' : '收藏'"
                  @click="togglePublisherMusicFavorite(item)"
                >
                  <Heart class="h-4 w-4" />
                </button>
              </div>
            </div>
            <div v-else class="publisher-picker-empty">
              输入关键词或音乐链接后开始搜索。
            </div>
          </section>
        </div>
      </div>
    </div>
    <div
      v-if="publisherSelector"
      class="live-subtitle-dialog publisher-selector-overlay"
      @click.self="publisherSelector = ''"
    >
      <div class="live-subtitle-dialog__panel publisher-selector-dialog">
        <div class="live-subtitle-dialog__head">
          <div class="live-subtitle-dialog__titleblock">
            <strong>{{
              publisherSelector === "account"
                ? "选择发布账号"
                : publisherSelector === "product"
                  ? "选择关联商品"
                  : "选择背景音乐"
            }}</strong>
            <p>
              {{
                publisherSelector === "music"
                  ? "搜索名称、作者或 TikTok 音乐链接。未选择时保留原声。"
                  : "点击卡片即可应用到批量默认配置。"
              }}
            </p>
          </div>
          <button
            class="live-subtitle-dialog__close"
            type="button"
            @click="publisherSelector = ''"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="publisher-selector-search">
          <Search class="h-4 w-4" /><input
            v-model="publisherSelectorQuery"
            :placeholder="
              publisherSelector === 'music'
                ? '搜索音乐名称或作者'
                : '输入关键词筛选'
            "
            @keydown.enter="
              publisherSelector === 'music' && searchPublisherMusic()
            "
          />
          <button
            v-if="publisherSelector === 'music'"
            type="button"
            @click="searchPublisherMusic"
          >
            搜索
          </button>
        </div>
        <div
          v-if="publisherSelector === 'account'"
          class="publisher-option-grid"
        >
          <button
            v-for="item in publisherFilteredConnections"
            :key="item.uid"
            class="publisher-option-card"
            type="button"
            @click="choosePublisherConnection(item.uid)"
          >
            <span class="publisher-option-icon"
              ><UserRound class="h-5 w-5" /></span
            ><span
              ><strong>{{ item.name || item.uid }}</strong
              ><small>{{ item.timezone || "TikTok Shop 账号" }}</small></span
            ><CheckCircle2
              v-if="publisherConnection === item.uid"
              class="publisher-option-check h-4 w-4"
            />
          </button>
          <div v-if="!publisherFilteredConnections.length" class="publisher-picker-empty">
            没有可用的发布账号，请先检查 Creatok API 连接。
          </div>
        </div>
        <div
          v-else-if="publisherSelector === 'product'"
          class="publisher-option-grid"
        >
          <button
            v-for="item in publisherFilteredProducts"
            :key="item.id"
            class="publisher-option-card"
            type="button"
            @click="choosePublisherProduct(item.id)"
          >
            <span class="publisher-option-icon"
              ><img
                v-if="item.coverImagePath || item.imageUrl || item.image || item.cover_url || item.image_url"
                :src="previewSrc(item.coverImagePath || item.imageUrl || item.image || item.cover_url || item.image_url)"
                alt="product" /><Package v-else class="h-5 w-5" /></span
            ><span
              ><strong>{{ item.title || item.name }}</strong
              ><small>{{ item.id }}</small></span
            ><CheckCircle2
              v-if="publisherProduct === item.id"
              class="publisher-option-check h-4 w-4"
            />
          </button>
          <div v-if="!publisherFilteredProducts.length" class="publisher-picker-empty">
            {{ publisherProductsLoading ? "正在加载商品..." : "当前账号没有可选择的商品。" }}
          </div>
        </div>
        <div v-else class="publisher-option-grid">
          <button
            class="publisher-option-card"
            type="button"
            @click="choosePublisherMusic(null)"
          >
            <span class="publisher-option-icon"><Music2 class="h-5 w-5" /></span
            ><span
              ><strong>保留原声</strong
              ><small>不覆盖视频原有口播与声音</small></span
            ><CheckCircle2
              v-if="!publisherSelectedMusic"
              class="publisher-option-check h-4 w-4"
            />
          </button>
          <div
            v-for="item in publisherMusicItems"
            :key="item.id"
            class="publisher-music-option"
          >
            <button
              class="publisher-music-option-main"
              type="button"
              @click="choosePublisherMusic(item)"
            >
              <img v-if="item.cover_url" :src="item.cover_url" alt="music" />
              <span v-else class="publisher-option-icon">
                <Music2 class="h-5 w-5" />
              </span>
              <span>
                <strong>{{ item.title }}</strong>
                <small>
                  {{ item.author || "未知作者" }}
                  <b v-if="isPublisherMusicFavorite(item)">已收藏</b>
                </small>
              </span>
              <CheckCircle2
                v-if="publisherSelectedMusic?.id === item.id"
                class="publisher-option-check h-4 w-4"
              />
            </button>
            <button
              class="publisher-music-icon-button"
              type="button"
              :title="publisherMusicPlayingId === String(item.id) ? '暂停' : '播放'"
              @click="togglePublisherMusicPlayback(item)"
            >
              <Pause
                v-if="publisherMusicPlayingId === String(item.id)"
                class="h-4 w-4"
              />
              <Play v-else class="h-4 w-4" />
            </button>
          </div>
        </div>
        <div
          v-if="publisherSelector === 'music' && !publisherMusicItems.length"
          class="publisher-picker-empty"
        >
          输入关键词后按回车搜索音乐。
        </div>
      </div>
    </div>
    <div
      v-if="publisherPickerOpen"
      class="live-subtitle-dialog publisher-selector-overlay"
      @click.self="publisherPickerOpen = false"
    >
      <div class="live-subtitle-dialog__panel publisher-picker-dialog">
        <div class="live-subtitle-dialog__head">
          <div class="live-subtitle-dialog__titleblock">
            <strong>从素材库选择视频</strong>
            <p>仅显示未发布视频，可按来源和商品分类选择。</p>
          </div>
          <button
            class="live-subtitle-dialog__close"
            type="button"
            @click="publisherPickerOpen = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="publisher-source-tabs">
          <button
            type="button"
            :class="{ active: publisherPickerSource === 'clone' }"
            @click="
              publisherPickerSource = 'clone';
              publisherPickerSelected = [];
              publisherPickerPage = 1;
            "
          >
            复刻视频
          </button>
          <button
            type="button"
            :class="{ active: publisherPickerSource === 'live-photo' }"
            @click="
              publisherPickerSource = 'live-photo';
              publisherPickerSelected = [];
              publisherPickerPage = 1;
            "
          >
            动态照片
          </button>
          <button
            type="button"
            :class="{ active: publisherPickerSource === 'creative' }"
            @click="
              publisherPickerSource = 'creative';
              publisherPickerSelected = [];
              publisherPickerPage = 1;
            "
          >
            创意工作室
          </button>
        </div>
        <div class="publisher-picker-filter">
          <span>按商品筛选</span>
          <div class="publisher-filter-pills">
            <button
              type="button"
              :class="{ active: !publisherPickerProduct }"
              @click="
                choosePublisherVideoProduct('');
                publisherPickerPage = 1;
              "
            >
              全部商品</button
            ><button
              v-for="product in products"
              :key="product.id"
              type="button"
              :class="{ active: publisherPickerProduct === product.id }"
              @click="
                choosePublisherVideoProduct(product.id);
                publisherPickerPage = 1;
              "
            >
              {{ product.name }}
            </button>
          </div>
        </div>
        <div
          v-if="publisherPagedSourceItems.length"
          class="publisher-picker-list"
        >
          <button
            v-for="item in publisherPagedSourceItems"
            :key="item.key"
            class="publisher-picker-row"
            :class="{ selected: publisherPickerSelected.includes(item.key) }"
            type="button"
            @click="togglePublisherPickerShot(item.key)"
          >
            <span class="publisher-picker-check"
              ><CheckCircle2
                v-if="publisherPickerSelected.includes(item.key)"
                class="h-4 w-4" /><span v-else></span></span
            ><img
              v-if="item.posterPath"
              :src="previewSrc(item.posterPath)"
              alt="video poster"
            />
            <div>
              <strong>{{ item.title || "未关联商品" }}</strong
              ><span>{{ fileName(item.filePath) }}</span
              ><small>创建于 {{ formatTime(item.createdAt) }}</small>
            </div>
          </button>
        </div>
        <div v-else class="publisher-picker-empty">
          <LoaderCircle
            v-if="publisherPickerLoading"
            class="h-5 w-5 animate-spin"
          />
          没有符合条件的未发布视频。
        </div>
        <div
          v-if="publisherFilteredSourceItems.length"
          class="publisher-picker-pagination"
        >
          <span>共 {{ publisherFilteredSourceItems.length }} 个视频</span>
          <div>
            <button
              type="button"
              :disabled="publisherPickerPage <= 1"
              @click="publisherPickerPage--"
            >
              <ChevronLeft class="h-4 w-4" />
            </button>
            <span
              >{{ publisherPickerPage }} / {{ publisherPickerPageCount }}</span
            >
            <button
              type="button"
              :disabled="publisherPickerPage >= publisherPickerPageCount"
              @click="publisherPickerPage++"
            >
              <ChevronRight class="h-4 w-4" />
            </button>
          </div>
        </div>
        <div class="dialog-actions">
          <button
            class="ghost-button"
            type="button"
            @click="publisherPickerOpen = false"
          >
            取消</button
          ><button
            class="primary-button"
            type="button"
            :disabled="!publisherPickerSelected.length"
            @click="confirmPublisherPicker"
          >
            加入发布队列
            {{
              publisherPickerSelected.length
                ? `(${publisherPickerSelected.length})`
                : ""
            }}
          </button>
        </div>
      </div>
    </div>
    <section v-if="activeTab === 'reference'" class="workspace-grid">
      <article class="panel-card reference-card">
        <div class="panel-head">
          <div class="panel-title-wrap">
            <div class="step-badge">1</div>
            <strong>{{ tr("autoUi.k_70076b55a369") }}</strong>
          </div>
          <span class="panel-head-note">{{ tr("autoUi.k_e6f568ddd540") }}</span>
        </div>
        <div class="field-stack">
          <div class="field">
            <span>{{ tr("autoUi.k_2132324c5c89") }}</span>
            <div class="reference-source-grid">
              <button
                class="reference-source-card"
                type="button"
                data-testid="tiktok-pick-reference"
                @click="pickReferenceImages"
              >
                <template v-if="referenceImagePaths[0]"
                  ><img
                    class="reference-source-card__preview"
                    :src="previewSrc(referenceImagePaths[0])"
                    alt="reference"
                  />
                  <div class="reference-source-card__copy">
                    <strong>{{ tr("autoUi.k_a2256c3c5407") }}</strong
                    ><small>{{ fileName(referenceImagePaths[0]) }}</small
                    ><span
                      >{{ referenceImagePaths.length }}
                      {{ tr("autoUi.k_279cc8e03fe0") }}</span
                    >
                  </div></template
                ><template v-else
                  ><div class="reference-source-card__icon">
                    <ImagePlus class="h-7 w-7" />
                  </div>
                  <div class="reference-source-card__copy">
                    <strong>{{ tr("autoUi.k_f961c4d8b29f") }}</strong
                    ><small>{{ tr("autoUi.k_4b7af20133a5") }}</small>
                  </div></template
                ></button
              ><button
                class="reference-source-card"
                type="button"
                @click="openMaterialPicker"
              >
                <div class="reference-source-card__icon">
                  <LayoutGrid class="h-7 w-7" />
                </div>
                <div class="reference-source-card__copy">
                  <strong>{{ tr("autoUi.k_f94d4eba3cbe") }}</strong
                  ><small>{{ tr("autoUi.k_64b63cea9090") }}</small
                  ><span
                    >{{ materials.length }}
                    {{ tr("autoUi.k_2aac253f0f33") }}</span
                  >
                </div>
              </button>
            </div>
          </div>
          <div v-if="referenceImagePaths.length" class="clone-shot-list">
            <div
              v-for="path in referenceImagePaths"
              :key="path"
              class="clone-shot-row reference-task-row"
            >
              <div class="clone-shot-copy">
                <strong>{{ fileName(path) }}</strong
                ><small>{{ path }}</small>
              </div>
              <button
                class="ghost-button small danger"
                type="button"
                @click="
                  referenceImagePaths = referenceImagePaths.filter(
                    (item) => item !== path,
                  )
                "
              >
                <Trash2 class="h-4 w-4" />{{ tr("autoUi.k_3755f56f2f83") }}
              </button>
            </div>
          </div>
          <label class="field"
            ><span>{{ tr("autoUi.k_004922066efd") }}</span
            ><button
              class="product-picker product-picker-button"
              type="button"
              @click="productPickerOpen = true"
            >
              <div v-if="selectedProduct?.coverImagePath" class="product-thumb">
                <img
                  :src="previewSrc(selectedProduct.coverImagePath)"
                  alt="product"
                />
              </div>
              <div v-else class="product-thumb">
                <Package class="h-4 w-4" />
              </div>
              <span class="product-picker-name">{{
                selectedProduct?.name || tr("autoUi.k_f4d8d03ce5b4")
              }}</span
              ><ChevronDown class="picker-arrow h-4 w-4" /></button
          ></label>
          <button
            class="primary-button create-button"
            type="button"
            data-testid="tiktok-create-reference"
            :disabled="
              creating || !referenceImagePaths.length || !selectedProductId
            "
            @click="createTasks"
          >
            <LoaderCircle
              v-if="creating"
              class="h-4 w-4 animate-spin"
            /><Sparkles v-else class="h-4 w-4" />{{
              creating
                ? tr("autoUi.k_14b16d7121c1")
                : tr("autoUi.k_dbb37b794ab3", {
                    p0: referenceImagePaths.length,
                  })
            }}
          </button>
          <div class="safe-note">
            <ShieldCheck class="h-4 w-4" />{{ tr("autoUi.k_b8ef551f9203") }}
          </div>
        </div>
      </article>
      <article class="panel-card rules-card">
        <div class="panel-head">
          <div class="panel-title-wrap">
            <div class="step-badge">2</div>
            <strong>{{ tr("autoUi.k_491d668880f6") }}</strong>
          </div>
          <span class="panel-head-note">{{ tr("autoUi.k_f25fdbd62c22") }}</span>
        </div>
        <div class="rules-box">
          <div class="rule-row">
            <div class="rule-icon">A</div>
            <p>{{ tr("autoUi.k_8d16eb3cd4d4") }}</p>
          </div>
          <div class="rule-row">
            <div class="rule-icon">+</div>
            <p>{{ tr("autoUi.k_98daa93daba9") }}</p>
          </div>
          <div class="rule-row">
            <div class="rule-icon">O</div>
            <p>{{ tr("autoUi.k_d6908a205702") }}</p>
          </div>
          <div class="rule-row">
            <div class="rule-icon">*</div>
            <p>{{ tr("autoUi.k_9b8309e541c9") }}</p>
          </div>
        </div>
        <div class="output-note">
          <div class="output-note-head">{{ tr("autoUi.k_d0117a565ea2") }}</div>
          <p>{{ tr("autoUi.k_606d9a364dc7") }}</p>
          <strong
            >{{ enabledAccounts.length }} {{ tr("autoUi.k_95cab73b3bfa") }}
            {{ runningCount }} {{ tr("autoUi.k_81897da3eeee") }}</strong
          >
        </div>
        <div class="quality-control-card">
          <div class="quality-control-card__head">
            <div>
              <strong>{{ tr("autoUi.k_e81f36aaa278") }}</strong
              ><small>{{ tr("autoUi.k_467d65d2340b") }}</small>
            </div>
            <ShieldCheck class="h-5 w-5" />
          </div>
          <div class="prompt-version-editor">
            <label class="field"
              ><span>{{ tr("autoUi.k_e3ba534bb0ab") }}</span
              ><select
                v-model="selectedPromptVersionId"
                @change="setPromptVersion(selectedPromptVersionId)"
              >
                <option
                  v-for="version in promptVersions"
                  :key="version.id"
                  :value="version.id"
                >
                  V{{ version.version }} · {{ version.name
                  }}{{ version.active ? tr("autoUi.k_b34ff6018a6b") : "" }}
                </option>
              </select></label
            ><label class="field"
              ><span>{{ tr("autoUi.k_ebb9cdd84ccb") }}</span
              ><input v-model="promptEditorName" type="text" /></label
            ><label class="field prompt-version-editor__prompt"
              ><span>{{ tr("autoUi.k_b077056206b1") }}</span
              ><textarea
                v-model="promptEditorText"
                rows="7"
                spellcheck="false"
              />
            </label>
            <div class="prompt-version-actions">
              <button
                class="ghost-button small"
                type="button"
                :disabled="promptVersionBusy"
                @click="savePrompt('update')"
              >
                {{ tr("autoUi.k_f89efe3911d8") }}</button
              ><button
                class="ghost-button small"
                type="button"
                :disabled="promptVersionBusy"
                @click="savePrompt('copy')"
              >
                {{ tr("autoUi.k_e13a96ddf104") }}</button
              ><button
                class="ghost-button small"
                type="button"
                :disabled="promptVersionBusy"
                @click="savePrompt('activate')"
              >
                {{ tr("autoUi.k_05bfda1ea7be") }}</button
              ><button
                class="ghost-button small"
                type="button"
                :disabled="promptVersionBusy"
                @click="savePrompt('rollback')"
              >
                {{ tr("autoUi.k_cb9de5c45477") }}
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>

    <section v-if="activeTab === 'library'" class="library-layout">
      <div class="library-headline">
        <div class="library-summary-row">
          <div class="library-heading-cluster">
            <div class="library-title-row">
              <FolderOpen class="h-5 w-5" /><strong>{{
                tr("autoUi.k_21eb39d9da89")
              }}</strong
              ><span class="library-count"
                >{{ filteredItems.length }}
                {{ tr("autoUi.k_64728a772742") }}</span
              >
            </div>
            <span class="library-subtitle">{{
              tr("autoUi.k_ec4fb1482924")
            }}</span>
          </div>
          <div class="library-head-tools">
            <div class="library-view-toggle">
              <button
                class="toolbar-icon"
                :class="{ active: libraryViewMode === 'grid' }"
                type="button"
                @click="libraryViewMode = 'grid'"
              >
                <Grid2x2 class="h-4 w-4" /></button
              ><button
                class="toolbar-icon"
                :class="{ active: libraryViewMode === 'list' }"
                type="button"
                @click="libraryViewMode = 'list'"
              >
                <List class="h-4 w-4" />
              </button>
            </div>
            <div class="library-pagination">
              <button
                class="library-page-button"
                type="button"
                :disabled="libraryPage <= 1"
                @click="libraryPage--"
              >
                <ChevronLeft class="h-4 w-4" /></button
              ><span>{{ libraryPage }} / {{ totalPages }}</span
              ><button
                class="library-page-button"
                type="button"
                :disabled="libraryPage >= totalPages"
                @click="libraryPage++"
              >
                <ChevronRight class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        <div class="library-toolbar">
          <div class="library-action-group">
            <button class="toolbar-button" type="button" @click="cycleFilter">
              <Filter class="h-4 w-4" />{{ tr("autoUi.k_21bd315911db") }}
              {{
                libraryFilter === "all"
                  ? tr("autoUi.k_778fc8f99453")
                  : libraryFilter === "completed"
                    ? tr("autoUi.k_e99b48a29bdf")
                    : libraryFilter === "running"
                      ? tr("autoUi.k_fcb979ef0b91")
                      : libraryFilter === "failed"
                        ? tr("autoUi.k_3e3c8068bb0e")
                        : tr("autoUi.k_130448bce675")
              }}</button
            ><button
              class="toolbar-button"
              type="button"
              :disabled="!filteredItems.length"
              @click="selectAllFiltered"
            >
              <CheckCircle2 class="h-4 w-4" />{{
                selectedShotIds.length &&
                selectedShotIds.length === filteredItems.length
                  ? tr("autoUi.k_f02e9439542f")
                  : tr("autoUi.k_3fca9c80cc8a")
              }}
            </button>
          </div>
          <div class="library-output-actions">
            <button
              class="toolbar-button batch-delete-button"
              type="button"
              :disabled="!selectedShotIds.length"
              @click="openBatchDelete"
            >
              <Trash2 class="h-4 w-4" />{{ tr("autoUi.k_4edb066d4627")
              }}{{ selectedShotIds.length }})</button
            ><button
              class="toolbar-button"
              type="button"
              :disabled="!subtitleEligibleItems.length"
              @click="openSubtitleDialog"
            >
              <Captions class="h-4 w-4" />{{ tr("autoUi.k_4d25c03db6e0")
              }}{{ subtitleEligibleItems.length }})</button
            ><button
              class="primary-button"
              type="button"
              :disabled="!selectedShotIds.length"
              @click="exportSelected"
            >
              <Download class="h-4 w-4" />{{ tr("autoUi.k_6bd41d31e000")
              }}{{ selectedShotIds.length }})
            </button><button
              v-if="selectedShotIds.length"
              class="toolbar-button"
              type="button"
              @click="revertSelectedSubtitles"
            >
              <Captions class="h-4 w-4" />{{ tr("tiktokCreative.revertSubtitles") }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="!pagedItems.length" class="panel-card empty-card">
        <FileImage class="h-8 w-8" /><strong>{{
          tr("autoUi.k_15652e6de74c")
        }}</strong>
        <p>{{ tr("autoUi.k_54226874b463") }}</p>
      </div>
      <div v-else-if="libraryViewMode === 'grid'" class="live-console-grid">
        <article
          v-for="{ task, shot } in pagedItems"
          :key="shot.shotId"
          class="live-console-card"
          :class="{ selected: selectedShotIds.includes(shot.shotId) }"
        >
          <div class="live-console-card__head">
            <label class="live-console-row__check"
              ><input
                type="checkbox"
                :checked="selectedShotIds.includes(shot.shotId)"
                @change="toggleSelected(shot.shotId)" /><span
            /></label>
            <div class="live-console-card__badges">
              <span
                class="live-console-row__status"
                :class="statusTone(shot)"
                >{{ statusLabel(shot) }}</span
              ><span
                v-if="publishedShotMap.has(shot.shotId)"
                class="publisher-published-badge"
                >已发布 ·
                {{
                  formatTime(publishedShotMap.get(shot.shotId).updatedAt)
                }}</span
              ><span
                v-if="shot.exportedAt"
                class="exported-badge"
                :title="formatTime(shot.exportedAt)"
                ><Download class="h-3 w-3" />{{
                  tr("autoUi.k_d3eaaf60ed1c")
                }}</span
              >
            </div>
          </div>
          <button
            class="live-console-card__preview"
            type="button"
            :disabled="shot.status !== 'completed' || !shot.resultVideoPath"
            @click="openVideo(shot.subtitleVideoPath || shot.resultVideoPath)"
          >
            <div class="live-console-row__thumb">
              <img
                v-if="
                  shot.subtitleCoverImagePath ||
                  shot.posterPath ||
                  shot.preparedImagePath ||
                  shot.referenceImagePath
                "
                :src="
                  previewSrc(
                    shot.subtitleCoverImagePath ||
                      shot.posterPath ||
                      shot.preparedImagePath ||
                      shot.referenceImagePath,
                  )
                "
                alt="poster"
              />
              <div v-else class="live-console-row__thumb-empty">
                <FileImage class="h-5 w-5" />
              </div>
              <span v-if="shot.status === 'completed'" class="preview-play"
                ><Play class="h-4 w-4"
              /></span>
            </div>
          </button>
          <div class="live-console-card__metrics">
            <div :title="tr('autoUi.k_d0d81b3ff3b0')">
              <span>{{ tr("autoUi.k_e2d53a6d3a6a") }}</span
              ><strong
                >{{ shot.imageRetryCount || 0 }}/{{
                  shot.imageRetryLimit ?? 2
                }}</strong
              >
            </div>
            <div :title="tr('autoUi.k_7b260b7dc1e5')">
              <span>{{ tr("autoUi.k_82f516820cfe") }}</span
              ><strong>{{ qualityScore(shot) }}</strong>
            </div>
          </div>
          <div class="live-console-card__body">
            <div class="live-console-row__titleline">
              <h3>{{ task.productName || tr("autoUi.k_0c5cc87ef67f") }}</h3>
              <span class="live-console-row__source">{{
                tr("autoUi.k_5149ae9c3017")
              }}</span
              ><span
                v-if="shot.subtitleVideoPath"
                class="live-console-row__source"
                >{{ tr("autoUi.k_83e422384f7f") }}</span
              >
            </div>
            <div class="live-console-row__meta">
              <Clock3 class="h-3 w-3" /><span
                >{{ tr("autoUi.k_fcbd0932929e") }}
                {{ formatTime(shot.createdAt) }}</span
              >
            </div>
            <div class="live-console-row__subtitle">
              {{ fileName(shot.referenceImagePath || shot.imagePath) }}
            </div>
            <div v-if="shot.lastError" class="live-console-row__error">
              <AlertTriangle class="h-3 w-3" /><span
                class="live-console-row__error-text"
                >{{ shot.lastError }}</span
              >
            </div>
          </div>
          <div class="live-console-row__actions">
            <button
              class="live-console-row__link live-console-row__link--primary"
              :title="tr('autoUi.k_faea8c1db9cc')"
              type="button"
              @click.stop="openDetail(task, shot)"
            >
              <PanelBottomOpen class="h-4 w-4" />{{
                tr("autoUi.k_faea8c1db9cc")
              }}</button
            ><button
              class="live-console-row__link"
              :title="tr('autoUi.k_1f9ac54b152b')"
              type="button"
              @click.stop="
                detailTask = task;
                detailShot = shot;
                detailTab = 'request';
              "
            >
              <Code2 class="h-4 w-4" />{{ tr("autoUi.k_1f9ac54b152b") }}</button
            ><button
              class="live-console-row__link"
              :title="tr('autoUi.k_b923b26d335a')"
              type="button"
              @click.stop="openLogs(task, shot)"
            >
              <Logs class="h-4 w-4" />{{ tr("autoUi.k_4de50894b8c1") }}</button
            ><button
              v-if="shot.resultVideoPath"
              class="live-console-row__action live-console-row__action--play"
              :title="tr('autoUi.k_21925350deba')"
              type="button"
              @click.stop="
                openVideo(shot.subtitleVideoPath || shot.resultVideoPath)
              "
            >
              <Play class="h-4 w-4" /></button
            ><button
              v-if="canContinueWithVideo(shot)"
              class="live-console-row__link live-console-row__link--primary"
              :title="tr('tiktokCreative.retry.continueWithVideo')"
              type="button"
              @click.stop="continueWithVideo(task, shot)"
            >
              <Play class="h-4 w-4" />{{ tr('tiktokCreative.retry.continueWithVideo') }}</button
            ><button
              v-if="canRetryImageOnce(shot)"
              class="live-console-row__link"
              type="button"
              @click.stop="retryShot(task, shot)"
            >
              <RefreshCcw class="h-4 w-4" />{{ tr('autoUi.k_031c7e12ddae') }}</button
            ><button
              v-if="canCorrectRegion(shot)"
              class="live-console-row__action live-console-row__action--region"
              :title="tr('autoUi.k_323968104a8c')"
              type="button"
              @click.stop="openRegionEditor(task, shot)"
            >
              <ScanLine class="h-4 w-4" /></button
            ><button
              v-else-if="shot.status !== 'completed' && !canRetryImageOnce(shot)"
              class="live-console-row__action"
              :title="tr('autoUi.k_e2d53a6d3a6a')"
              type="button"
              @click.stop="retryShot(task, shot)"
            >
              <RefreshCcw class="h-4 w-4" /></button
            ><button
              class="live-console-row__action live-console-row__action--danger"
              :title="tr('autoUi.k_3755f56f2f83')"
              type="button"
              @click.stop="removeShot(task, shot)"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </article>
      </div>
      <div v-else class="live-console-list">
        <article
          v-for="{ task, shot } in pagedItems"
          :key="shot.shotId"
          class="live-console-row"
          :class="{ selected: selectedShotIds.includes(shot.shotId) }"
        >
          <label class="live-console-row__check"
            ><input
              type="checkbox"
              :checked="selectedShotIds.includes(shot.shotId)"
              @change="toggleSelected(shot.shotId)" /><span
          /></label>
          <div class="live-console-row__preview">
            <div class="live-console-row__thumb">
              <img
                v-if="
                  shot.subtitleCoverImagePath ||
                  shot.posterPath ||
                  shot.preparedImagePath ||
                  shot.referenceImagePath
                "
                :src="
                  previewSrc(
                    shot.subtitleCoverImagePath ||
                      shot.posterPath ||
                      shot.preparedImagePath ||
                      shot.referenceImagePath,
                  )
                "
                alt="poster"
              /><FileImage v-else class="h-5 w-5" />
            </div>
          </div>
          <div class="live-console-row__main">
            <div class="live-console-row__task">
              <div class="live-console-row__titleline">
                <h3>{{ task.productName || tr("autoUi.k_0c5cc87ef67f") }}</h3>
                <span class="live-console-row__source">{{
                  tr("autoUi.k_5149ae9c3017")
                }}</span
                ><span
                  v-if="shot.subtitleVideoPath"
                  class="live-console-row__source"
                  >{{ tr("autoUi.k_83e422384f7f") }}</span
                >
              </div>
              <div class="live-console-row__meta">
                <Clock3 class="h-3 w-3" /><span
                  >{{ tr("autoUi.k_fcbd0932929e") }}
                  {{ formatTime(shot.createdAt) }}</span
                >
              </div>
              <div class="live-console-row__subtitle">
                {{ fileName(shot.referenceImagePath || shot.imagePath) }}
              </div>
              <div class="live-console-list__metrics">
                <span
                  >{{ tr("autoUi.k_e2d53a6d3a6a") }}
                  {{ shot.imageRetryCount || 0 }}/{{
                    shot.imageRetryLimit ?? 2
                  }}</span
                ><span
                  >{{ tr("autoUi.k_82f516820cfe") }}
                  {{ qualityScore(shot) }}</span
                >
              </div>
              <div v-if="shot.lastError" class="live-console-row__error">
                <AlertTriangle class="h-3 w-3" /><span
                  class="live-console-row__error-text"
                  >{{ shot.lastError }}</span
                >
              </div>
            </div>
            <div class="live-console-row__side">
              <span
                class="live-console-row__status"
                :class="statusTone(shot)"
                >{{ statusLabel(shot) }}</span
              >
            </div>
          </div>
          <div class="live-console-row__bottom">
            <div class="live-console-row__quickrefs">
              <span class="live-console-row__quickchip">{{
                shot.resultVideoPath
                  ? tr("autoUi.k_d50aa9bb954a")
                  : tr("autoUi.k_e528ba2c704f")
              }}</span
              ><span
                v-if="shot.exportedAt"
                class="exported-badge"
                :title="formatTime(shot.exportedAt)"
                ><Download class="h-3 w-3" />{{
                  tr("autoUi.k_d3eaaf60ed1c")
                }}</span
              ><span
                v-if="shot.subtitleAppliedAt"
                class="live-console-row__quickchip"
                >{{ tr("autoUi.k_aaa5f2e9f006") }}
                {{ formatTime(shot.subtitleAppliedAt) }}</span
              >
            </div>
            <div class="live-console-row__actions">
              <button
                class="live-console-row__link live-console-row__link--primary"
                type="button"
                @click="openDetail(task, shot)"
              >
                {{ tr("autoUi.k_faea8c1db9cc") }}</button
              ><button
                class="live-console-row__link"
                type="button"
                @click="
                  detailTask = task;
                  detailShot = shot;
                  detailTab = 'request';
                "
              >
                <Code2 class="h-4 w-4" />{{
                  tr("autoUi.k_1f9ac54b152b")
                }}</button
              ><button
                class="live-console-row__link"
                type="button"
                @click="openLogs(task, shot)"
              >
                <Logs class="h-4 w-4" />{{
                  tr("autoUi.k_b923b26d335a")
                }}</button
              ><button
                v-if="shot.resultVideoPath"
                class="live-console-row__action live-console-row__action--play"
                type="button"
                @click="
                  openVideo(shot.subtitleVideoPath || shot.resultVideoPath)
                "
              >
                <Play class="h-4 w-4" /></button
              ><button
                v-if="canContinueWithVideo(shot)"
                class="live-console-row__link live-console-row__link--primary"
                :title="tr('tiktokCreative.retry.continueWithVideo')"
                type="button"
                @click.stop="continueWithVideo(task, shot)"
              >
                <Play class="h-4 w-4" />{{ tr('tiktokCreative.retry.continueWithVideo') }}</button
              ><button
                v-if="canRetryImageOnce(shot)"
                class="live-console-row__link"
                type="button"
                @click.stop="retryShot(task, shot)"
              >
                <RefreshCcw class="h-4 w-4" />{{ tr('autoUi.k_031c7e12ddae') }}</button
              ><button
                v-if="canCorrectRegion(shot)"
                class="live-console-row__action live-console-row__action--region"
                :title="tr('autoUi.k_323968104a8c')"
                type="button"
                @click="openRegionEditor(task, shot)"
              >
                <ScanLine class="h-4 w-4" /></button
              ><button
              v-else-if="shot.status !== 'completed' && !canRetryImageOnce(shot)"
                class="live-console-row__action"
                :title="tr('autoUi.k_e2d53a6d3a6a')"
                type="button"
                @click="retryShot(task, shot)"
              >
                <RefreshCcw class="h-4 w-4" /></button
              ><button
                class="live-console-row__action live-console-row__action--danger"
                type="button"
                @click="removeShot(task, shot)"
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <div v-if="accountDialogOpen" class="live-subtitle-dialog">
      <div class="live-subtitle-dialog__panel account-dialog">
        <div class="live-subtitle-dialog__head">
          <div class="live-subtitle-dialog__titleblock">
            <strong>{{ tr("autoUi.k_9d4ca7f307e7") }}</strong>
            <p>{{ tr("autoUi.k_630c37504d70") }}</p>
          </div>
          <button
            class="live-subtitle-dialog__close"
            type="button"
            @click="accountDialogOpen = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="account-layout">
          <div class="account-list">
            <article
              v-for="(account, index) in accounts"
              :key="account.id"
              class="account-row"
              :class="{
                disabled: !account.enabled,
                editing: editingAccountId === account.id,
              }"
            >
              <div class="account-order">
                <button
                  type="button"
                  :disabled="index === 0"
                  @click="moveAccount(account, -1)"
                >
                  ↑</button
                ><button
                  type="button"
                  :disabled="index === accounts.length - 1"
                  @click="moveAccount(account, 1)"
                >
                  ↓
                </button>
              </div>
              <div class="account-main">
                <strong>{{ account.name }}</strong
                ><small
                  >{{ account.cookieCount }} {{ tr("autoUi.k_69fd1d0af720") }}
                  {{ account.priority + 1 }}</small
                ><span class="account-state" :class="account.state">{{
                  accountState(account)
                }}</span
                ><small v-if="account.lastError" class="account-error">{{
                  account.lastError
                }}</small>
              </div>
              <div class="account-actions">
                <button
                  class="ghost-button small"
                  type="button"
                  @click="editAccount(account)"
                >
                  <Pencil class="h-3 w-3" />{{
                    tr("autoUi.k_a7f814c0a40d")
                  }}</button
                ><button
                  class="ghost-button small"
                  type="button"
                  @click="testAccount(account)"
                >
                  {{ tr("autoUi.k_0b5d7ed54bee") }}</button
                ><button
                  class="ghost-button small"
                  type="button"
                  @click="toggleAccount(account)"
                >
                  {{
                    account.enabled
                      ? tr("autoUi.k_d989e55188c9")
                      : tr("autoUi.k_d4e9ca3dd494")
                  }}</button
                ><button
                  class="ghost-button small danger"
                  type="button"
                  @click="removeAccount(account)"
                >
                  {{ tr("autoUi.k_3755f56f2f83") }}
                </button>
              </div>
            </article>
            <div v-if="!accounts.length" class="account-empty">
              {{ tr("autoUi.k_e610551a276a") }}
            </div>
          </div>
          <div class="account-form">
            <strong>{{
              editingAccountId
                ? tr("autoUi.k_0009f81b767d")
                : tr("autoUi.k_0d153e759c07")
            }}</strong
            ><label
              >{{ tr("autoUi.k_3f2da24264f0")
              }}<input
                v-model="accountName"
                type="text"
                :placeholder="tr('autoUi.k_60ee315308b4')" /></label
            ><label
              >Cookie JSON<textarea
                v-model="accountCookieJson"
                rows="10"
                :placeholder="
                  editingAccountId
                    ? tr('autoUi.k_bcb70996dabc')
                    : tr('autoUi.k_70105d955b7f')
                "
              /></label
            ><small v-if="editingAccountId" class="account-form-hint">{{
              tr("autoUi.k_e75603d5853b")
            }}</small
            ><button
              class="ghost-button small"
              type="button"
              @click="importCookieFile"
            >
              {{ tr("autoUi.k_58333db9405c") }}
            </button>
            <div class="dialog-actions">
              <button
                class="ghost-button"
                type="button"
                @click="resetAccountForm"
              >
                {{
                  editingAccountId
                    ? tr("autoUi.k_c698df948dd9")
                    : tr("autoUi.k_84fcd70d4280")
                }}</button
              ><button
                class="primary-button"
                type="button"
                :disabled="!editingAccountId && !accountCookieJson.trim()"
                @click="saveAccount"
              >
                {{
                  editingAccountId
                    ? tr("autoUi.k_60b4ae9082a3")
                    : tr("autoUi.k_dea49eba6b37")
                }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="materialDialogOpen" class="live-subtitle-dialog">
      <div class="live-subtitle-dialog__panel">
        <div class="live-subtitle-dialog__head">
          <div class="live-subtitle-dialog__titleblock">
            <strong>{{ tr("autoUi.k_2d9e0489e21f") }}</strong>
            <p>{{ tr("tiktokCreative.material.derivedOnly") }}</p>
          </div>
          <button
            class="live-subtitle-dialog__close"
            type="button"
            @click="materialDialogOpen = false"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="material-grid">
          <button
            v-for="material in derivedMaterials"
            :key="material.id"
            :class="{ active: selectedMaterialIds.includes(material.id) }"
            type="button"
            @click="toggleMaterial(material.id)"
          >
            <img
              :src="previewSrc(material.localImagePath)"
              alt="material"
            /><span>{{ fileName(material.localImagePath) }}</span>
          </button>
        </div>
        <div v-if="!derivedMaterials.length" class="material-grid-empty">{{ tr("tiktokCreative.material.empty") }}</div>
        <div class="dialog-actions">
          <button
            class="ghost-button"
            type="button"
            @click="materialDialogOpen = false"
          >
            {{ tr("autoUi.k_4d0b4688c787") }}</button
          ><button class="primary-button" type="button" @click="addMaterials">
            {{ tr("autoUi.k_556b607baa1d") }}
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="retrySettingsOpen"
      class="live-subtitle-dialog"
      @click.self="!retrySettingsBusy && (retrySettingsOpen = false)"
    >
      <section class="live-subtitle-dialog__panel retry-settings-panel" role="dialog" aria-modal="true" aria-labelledby="retry-settings-title">
        <div class="live-subtitle-dialog__head">
          <div class="live-subtitle-dialog__titleblock">
            <strong id="retry-settings-title">{{ tr("tiktokCreative.retry.title") }}</strong>
            <p>{{ tr("tiktokCreative.retry.description") }}</p>
          </div>
          <button class="live-subtitle-dialog__close" type="button" :disabled="retrySettingsBusy" @click="retrySettingsOpen = false">
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="retry-settings-hero">
          <div class="retry-settings-icon"><RefreshCcw class="h-5 w-5" /></div>
          <div>
            <span>{{ tr("tiktokCreative.retry.automaticRecovery") }}</span>
            <strong>{{ creativeSettings.imageRetryLimit }} {{ tr("tiktokCreative.retry.attemptUnit") }}</strong>
          </div>
          <small>{{ tr("tiktokCreative.retry.manualOnly") }}</small>
        </div>
        <label class="retry-settings-field">
          <span>{{ tr("tiktokCreative.retry.maximum") }}</span>
          <input v-model.number="creativeSettings.imageRetryLimit" type="number" min="0" max="20" step="1" inputmode="numeric" />
          <small>{{ tr("tiktokCreative.retry.rangeHint") }}</small>
        </label>
        <div class="dialog-actions retry-settings-actions">
          <button class="ghost-button" type="button" :disabled="retrySettingsBusy" @click="retrySettingsOpen = false">{{ tr("common.cancel") }}</button>
          <button class="primary-button" type="button" :disabled="retrySettingsBusy" @click="saveRetrySettings">
            {{ retrySettingsBusy ? tr("tiktokCreative.retry.saving") : tr("tiktokCreative.retry.save") }}
          </button>
        </div>
      </section>
    </div>
    <div v-if="detailTask && detailShot" class="live-subtitle-dialog">
      <div class="live-subtitle-dialog__panel detail-dialog">
        <div class="live-subtitle-dialog__head">
          <div class="live-subtitle-dialog__titleblock">
            <strong>{{ tr("autoUi.k_6b6b728583aa") }}</strong>
            <p>
              {{ detailTask.productName || tr("autoUi.k_389d39a28bbe") }}
              {{ tr("autoUi.k_c392241e0aa1") }}
              {{ formatTime(detailShot.createdAt) }}
            </p>
          </div>
          <button
            class="live-subtitle-dialog__close"
            type="button"
            @click="
              detailTask = null;
              detailShot = null;
            "
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="detail-tabs">
          <button
            :class="{ active: detailTab === 'overview' }"
            type="button"
            @click="detailTab = 'overview'"
          >
            {{ tr("autoUi.k_b19fb2fe5dc6") }}</button
          ><button
            :class="{ active: detailTab === 'request' }"
            type="button"
            @click="detailTab = 'request'"
          >
            <Code2 class="h-4 w-4" />{{ tr("autoUi.k_1f9ac54b152b") }}
          </button>
        </div>
        <div v-if="detailTab === 'overview'" class="detail-shot">
          <img
            :src="
              previewSrc(
                detailShot.subtitleCoverImagePath ||
                  detailShot.posterPath ||
                  detailShot.preparedImagePath ||
                  detailShot.referenceImagePath,
              )
            "
            alt="shot"
          />
          <div class="detail-grid">
            <div>
              <span>{{ tr("autoUi.k_045859e7926b") }}</span
              ><strong>{{ statusLabel(detailShot) }}</strong>
            </div>
            <div>
              <span>{{ tr("autoUi.k_84e3802f60a7") }}</span
              ><strong>{{ formatTime(detailShot.createdAt) }}</strong>
            </div>
            <div>
              <span>{{ tr("autoUi.k_093dea88c930") }}</span
              ><strong>{{ formatTime(detailShot.updatedAt) }}</strong>
            </div>
            <div>
              <span>{{ tr("autoUi.k_4cdb77d778be") }}</span
              ><strong>{{
                accounts.find((item) => item.id === detailShot?.accountId)
                  ?.name || "--"
              }}</strong>
            </div>
            <div>
              <span>{{ tr("autoUi.k_79fe8678b761") }}</span
              ><strong>{{ imageAttemptCount(detailShot) }}</strong>
            </div>
            <div>
              <span>{{ tr("autoUi.k_d0d81b3ff3b0") }}</span
              ><strong
                >{{ detailShot.imageRetryCount || 0 }} /
                {{ detailShot.imageRetryLimit ?? 2 }}</strong
              >
            </div>
            <div>
              <span>{{ tr("autoUi.k_9e007ad36f88") }}</span
              ><strong>{{
                detailShot.imagePreparation?.qualityReport?.decision || "--"
              }}</strong>
            </div>
            <div>
              <span>{{ tr("autoUi.k_7b260b7dc1e5") }}</span
              ><strong>{{ qualityScore(detailShot) }}</strong>
            </div>
            <div>
              <span>{{ tr("autoUi.k_14d57646d352") }}</span
              ><strong>{{
                detailShot.imagePreparation?.replacementRegion?.source ===
                "manual"
                  ? tr("autoUi.k_a9cf8adca920")
                  : detailShot.imagePreparation?.replacementRegion
                    ? tr("autoUi.k_34f7dc93a8d7")
                    : "--"
              }}</strong>
            </div>
            <div>
              <span>{{ tr("autoUi.k_223bacf5d4b9") }}</span
              ><strong>{{
                detailShot.imagePreparation?.replacementRegion?.revision || "--"
              }}</strong>
            </div>
            <div class="detail-wide">
              <span>{{ tr("autoUi.k_608051c3be9d") }}</span
              ><strong>{{ detailShot.officialTaskId || "--" }}</strong>
            </div>
            <div class="detail-wide">
              <span>{{ tr("autoUi.k_fc8d133a2c7e") }}</span
              ><strong>{{ qualityFailures(detailShot) }}</strong>
            </div>
            <div class="detail-wide">
              <span>{{ tr("autoUi.k_2132324c5c89") }}</span
              ><strong>{{
                detailShot.referenceImagePath || detailShot.imagePath
              }}</strong>
            </div>
            <div class="detail-wide">
              <span>{{ tr("autoUi.k_aa3f9dea3280") }}</span
              ><strong>{{
                detailShot.resultVideoPath || tr("autoUi.k_a911364f9fde")
              }}</strong>
            </div>
            <div v-if="detailShot.subtitleVideoPath" class="detail-wide">
              <span>{{ tr("autoUi.k_c32181e58b53") }}</span
              ><strong>{{ detailShot.subtitleVideoPath }}</strong>
            </div>
            <div
              v-if="canCorrectRegion(detailShot)"
              class="detail-wide detail-region-action"
            >
              <span>{{ tr("autoUi.k_442c3cfae6ff") }}</span
              ><button
                class="primary-button"
                type="button"
                @click="openRegionEditor(detailTask, detailShot)"
              >
                <ScanLine class="h-4 w-4" />{{ tr("autoUi.k_e24cb2a63e93") }}
              </button>
            </div>
          </div>
        </div>
        <div v-else class="request-parameter-panel">
          <div class="request-parameter-head">
            <div>
              <strong>{{ tr("autoUi.k_125f82fc28d6") }}</strong>
              <p>{{ tr("autoUi.k_d3d17e466cec") }}</p>
            </div>
            <span
              >{{ detailShot.requestTrace?.length || 0 }}
              {{ tr("autoUi.k_9788a29c8270") }}</span
            >
          </div>
          <pre>{{ requestTraceJson(detailShot) }}</pre>
        </div>
      </div>
    </div>
    <div
      v-if="regionDialogTarget"
      class="live-subtitle-dialog"
      @click.self="closeRegionEditor"
    >
      <div class="live-subtitle-dialog__panel region-dialog">
        <div class="live-subtitle-dialog__head">
          <div class="live-subtitle-dialog__titleblock">
            <strong>{{ tr("autoUi.k_323968104a8c") }}</strong>
            <p>{{ tr("autoUi.k_6b6454d249df") }}</p>
          </div>
          <button
            class="live-subtitle-dialog__close"
            type="button"
            :disabled="regionBusy"
            @click="closeRegionEditor"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div
          ref="regionStage"
          class="region-stage"
          @pointerdown.self="beginRegionInteraction($event, 'draw')"
          @pointermove="updateRegionInteraction"
          @pointerup="endRegionInteraction"
          @pointercancel="endRegionInteraction"
        >
          <img
            :src="
              previewSrc(
                regionDialogTarget.shot.referenceImagePath ||
                  regionDialogTarget.shot.imagePath,
              )
            "
            alt="region source"
            draggable="false"
          />
          <div
            class="region-box"
            :style="regionStyle()"
            @pointerdown.stop="beginRegionInteraction($event, 'move')"
          >
            <span
              v-for="corner in regionCorners"
              :key="corner"
              class="region-handle"
              :class="`is-${corner}`"
              @pointerdown.stop="
                beginRegionInteraction($event, 'resize', corner)
              "
            />
          </div>
        </div>
        <div class="region-meta">
          <span
            >{{ tr("autoUi.k_223bacf5d4b9") }}
            {{
              regionDialogTarget.shot.imagePreparation?.replacementRegion
                ?.revision || 0
            }}</span
          ><span
            >{{ Math.round(regionDraft.width * 100) }}% x
            {{ Math.round(regionDraft.height * 100) }}%</span
          >
        </div>
        <div class="dialog-actions">
          <button
            class="ghost-button"
            type="button"
            :disabled="regionBusy"
            @click="closeRegionEditor"
          >
            {{ tr("autoUi.k_4d0b4688c787") }}</button
          ><button
            class="primary-button"
            type="button"
            :disabled="regionBusy"
            @click="saveRegionAndRetry"
          >
            <LoaderCircle
              v-if="regionBusy"
              class="h-4 w-4 animate-spin"
            /><ScanLine v-else class="h-4 w-4" />{{
              regionBusy
                ? tr("autoUi.k_d70d425039f2")
                : tr("autoUi.k_7219420300d1")
            }}
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="videoDialog"
      class="live-subtitle-dialog"
      @click.self="videoDialog = null"
    >
      <div class="live-subtitle-dialog__panel video-dialog">
        <div class="live-subtitle-dialog__head">
          <div class="live-subtitle-dialog__titleblock">
            <strong>{{
              videoDialog.task.productName || tr("autoUi.k_9355dd64fd86")
            }}</strong>
            <p>
              {{
                videoDialog.shot.subtitleVideoPath
                  ? tr("autoUi.k_6d27a746c36c")
                  : tr("autoUi.k_1a73a0bbb20c")
              }}
              · {{ formatTime(videoDialog.shot.createdAt) }}
            </p>
          </div>
          <button
            class="live-subtitle-dialog__close"
            type="button"
            @click="videoDialog = null"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <video
          class="video-dialog__player"
          controls
          autoplay
          playsinline
          :src="
            previewSrc(
              videoDialog.shot.subtitleVideoPath ||
                videoDialog.shot.resultVideoPath,
            )
          "
        />
        <div class="video-dialog__meta">
          <span>{{
            fileName(
              videoDialog.shot.subtitleVideoPath ||
                videoDialog.shot.resultVideoPath,
            )
          }}</span
          ><span v-if="videoDialog.shot.officialVideoId"
            >{{ tr("autoUi.k_18dc60d000ef") }}
            {{ videoDialog.shot.officialVideoId }}</span
          >
        </div>
        <div class="dialog-actions">
          <button
            class="ghost-button"
            type="button"
            @click="
              openSingleSubtitleDialog(videoDialog.task, videoDialog.shot)
            "
          >
            <Captions class="h-4 w-4" />{{
              tr("autoUi.k_9475af4a63e9")
            }}</button
          ><button
            v-if="videoDialog.shot.subtitleVideoPath"
            class="ghost-button"
            type="button"
            :disabled="subtitleDialogBusy"
            @click="revertSubtitles(videoDialog.task, videoDialog.shot)"
          >
            <RefreshCcw class="h-4 w-4" />{{
              tr("autoUi.k_6d32dea55ea6")
            }}</button
          ><button
            class="primary-button"
            type="button"
            @click="videoDialog = null"
          >
            {{ tr("autoUi.k_6c14bd7f6f9e") }}
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="liveSubtitleDialogOpen"
      class="live-subtitle-dialog"
      @click.self="liveSubtitleDialogOpen = false"
    >
      <div
        class="live-subtitle-dialog__panel live-subtitle-dialog__panel--copied"
      >
        <div class="live-subtitle-dialog__head">
          <div class="live-subtitle-dialog__titleblock">
            <strong>{{
              subtitleDialogMode === "batch"
                ? tr("autoUi.k_c6f0209a1cfa")
                : tr("autoUi.k_6e4c3e5ffee8")
            }}</strong>
            <p>
              {{ tr("autoUi.k_b7a385ec00d6") }} {{ subtitleDialogItems.length }}
              {{ tr("autoUi.k_6730e4ed011c") }}
            </p>
          </div>
          <button
            class="live-subtitle-dialog__close"
            type="button"
            :disabled="subtitleDialogBusy"
            @click="liveSubtitleDialogOpen = false"
          >
            {{ tr("autoUi.k_6c14bd7f6f9e") }}
          </button>
        </div>
        <div class="live-subtitle-dialog__summary">
          <div class="live-subtitle-dialog__summary-item">
            <span>{{ tr("autoUi.k_11a2736ed3c4") }}</span
            ><strong>{{
              subtitleDialogMode === "batch"
                ? tr("autoUi.k_50e078e7f961", {
                    p0: subtitleDialogItems.length,
                  })
                : tr("autoUi.k_bda3ae2da55b")
            }}</strong>
          </div>
          <div class="live-subtitle-dialog__summary-item">
            <span>{{ tr("autoUi.k_5d9ef99b61c5") }}</span
            ><strong>{{
              subtitlePresets.find(
                (preset) => preset.id === subtitleSelectedPreset,
              )?.name || tr("autoUi.k_469e324ba51b")
            }}</strong>
          </div>
        </div>
        <div class="live-subtitle-dialog__tabs">
          <button
            type="button"
            :class="{ active: subtitleDialogTab === 'title' }"
            @click="subtitleDialogTab = 'title'"
          >
            {{ tr("autoUi.k_748d7dc7e321") }}</button
          ><button
            type="button"
            :class="{ active: subtitleDialogTab === 'template' }"
            @click="subtitleDialogTab = 'template'"
          >
            {{ tr("autoUi.k_06d0f38dd26c") }}</button
          ><button
            type="button"
            :class="{ active: subtitleDialogTab === 'style' }"
            @click="subtitleDialogTab = 'style'"
          >
            {{ tr("autoUi.k_393a6c9117bc") }}
          </button>
        </div>
        <section
          v-if="subtitleDialogTab === 'title'"
          class="live-subtitle-dialog__section"
        >
          <div class="live-subtitle-dialog__section-head">
            <span class="live-subtitle-dialog__kicker">Title Mode</span
            ><strong>{{ tr("autoUi.k_7f39a0d9ffad") }}</strong>
          </div>
          <div class="live-subtitle-dialog__mode-pills">
            <button
              :class="{
                'is-active': subtitleTitleStrategy === 'single_for_all',
              }"
              type="button"
              @click="subtitleTitleStrategy = 'single_for_all'"
            >
              {{ tr("autoUi.k_73e18b3f4a29") }}</button
            ><button
              :class="{ 'is-active': subtitleTitleStrategy === 'random_pool' }"
              type="button"
              @click="subtitleTitleStrategy = 'random_pool'"
            >
              {{ tr("autoUi.k_84ba3e6f5cfb") }}
            </button>
          </div>
          <label
            v-if="subtitleTitleStrategy === 'single_for_all'"
            class="live-subtitle-dialog__field"
            ><span>{{ tr("autoUi.k_7e33e07fd936") }}</span
            ><input
              v-model.trim="subtitleTitleText"
              type="text"
              maxlength="120"
              :placeholder="tr('autoUi.k_169a71f2d82c')"
              @keydown.enter.prevent="generateSubtitles" /></label
          ><label v-else class="live-subtitle-dialog__field"
            ><span>{{ tr("autoUi.k_84ba3e6f5cfb") }}</span
            ><textarea
              v-model.trim="subtitleTitlePoolText"
              class="live-subtitle-dialog__textarea"
              :placeholder="tr('autoUi.k_60e49a8dd0a0')"
            />
          </label>
          <div class="live-subtitle-dialog__inline-tip">
            {{
              subtitleTitleStrategy === "single_for_all"
                ? tr("autoUi.k_fb5b47107a9b")
                : tr("autoUi.k_70164720b604")
            }}
          </div>
        </section>
        <section
          v-else-if="subtitleDialogTab === 'template'"
          class="live-subtitle-dialog__section"
        >
          <div class="live-subtitle-dialog__section-head">
            <span class="live-subtitle-dialog__kicker">Template</span
            ><strong>{{ tr("autoUi.k_f84c2e382440") }}</strong>
          </div>
          <div class="live-subtitle-dialog__preset-grid">
            <button
              v-for="preset in subtitlePresets"
              :key="preset.id"
              class="live-subtitle-dialog__preset"
              :class="{ active: subtitleSelectedPreset === preset.id }"
              type="button"
              @click="applySubtitlePreset(preset.id)"
            >
              <strong>{{ preset.name }}</strong
              ><span>{{ preset.summary }}</span>
            </button>
          </div>
          <div class="live-subtitle-dialog__preset-note">
            {{ tr("autoUi.k_5439950aec35") }}
          </div>
        </section>
        <section v-else class="live-subtitle-dialog__section">
          <div class="live-subtitle-dialog__section-head">
            <span class="live-subtitle-dialog__kicker">Style</span
            ><strong>{{ tr("autoUi.k_856e405fcf39") }}</strong>
          </div>
          <div class="live-subtitle-dialog__style-panel">
            <div
              class="live-subtitle-dialog__form-grid live-subtitle-dialog__form-grid--compact"
            >
              <label class="live-subtitle-dialog__field"
                ><span>{{ tr("autoUi.k_b50d4d8352f5") }}</span
                ><input
                  v-model.trim="subtitleCaptionStyle.fontName"
                  type="text" /></label
              ><label class="live-subtitle-dialog__field"
                ><span>{{ tr("autoUi.k_576ccdb1f1c7") }}</span
                ><input
                  v-model.number="subtitleCaptionStyle.fontSize"
                  type="number"
                  min="18"
                  max="120" /></label
              ><label class="live-subtitle-dialog__field"
                ><span>{{ tr("autoUi.k_a48b15a6de71") }}</span
                ><input
                  v-model.number="subtitleCaptionStyle.strokeWidth"
                  type="number"
                  min="0"
                  max="16" /></label
              ><label class="live-subtitle-dialog__field"
                ><span>{{ tr("autoUi.k_3ca120ca0195") }}</span
                ><input
                  v-model.number="subtitleCaptionStyle.maxLines"
                  type="number"
                  min="1"
                  max="6"
              /></label>
            </div>
            <div
              class="live-subtitle-dialog__form-grid live-subtitle-dialog__form-grid--dual"
            >
              <label class="live-subtitle-dialog__field"
                ><span>{{ tr("autoUi.k_07f568dada4d") }}</span>
                <div class="live-subtitle-dialog__color-field">
                  <input
                    v-model.trim="subtitleCaptionStyle.fontColor"
                    type="text"
                  /><input
                    v-model="subtitleCaptionStyle.fontColor"
                    type="color"
                  /></div></label
              ><label class="live-subtitle-dialog__field"
                ><span>{{ tr("autoUi.k_eaa98f95ba53") }}</span>
                <div class="live-subtitle-dialog__color-field">
                  <input
                    v-model.trim="subtitleCaptionStyle.strokeColor"
                    type="text"
                  /><input
                    v-model="subtitleCaptionStyle.strokeColor"
                    type="color"
                  /></div
              ></label>
            </div>
            <div
              class="live-subtitle-dialog__form-grid live-subtitle-dialog__form-grid--compact"
            >
              <label class="live-subtitle-dialog__field"
                ><span>{{ tr("autoUi.k_88c34452cc46") }}</span
                ><select v-model="subtitleCaptionStyle.position">
                  <option value="top">{{ tr("autoUi.k_a9d35ab0a675") }}</option>
                  <option value="center">
                    {{ tr("autoUi.k_910253ea0c16") }}
                  </option>
                  <option value="bottom">
                    {{ tr("autoUi.k_435b2d8982fd") }}
                  </option>
                </select></label
              ><label class="live-subtitle-dialog__field"
                ><span>{{ tr("autoUi.k_6ff4e8934c7f") }}</span
                ><select v-model="subtitleCaptionStyle.textAlign">
                  <option value="left">
                    {{ tr("autoUi.k_413f8db65f69") }}
                  </option>
                  <option value="center">
                    {{ tr("autoUi.k_5009324782b9") }}
                  </option>
                  <option value="right">
                    {{ tr("autoUi.k_70fe40dec2fa") }}
                  </option>
                </select></label
              ><label class="live-subtitle-dialog__field"
                ><span>{{ tr("autoUi.k_fa0119023442") }}</span
                ><input
                  v-model.number="subtitleCaptionStyle.bottomMargin"
                  type="number"
                  min="48"
                  max="600"
              /></label>
            </div>
          </div>
        </section>
        <div class="live-subtitle-dialog__actions">
          <button
            v-if="
              subtitleDialogMode === 'single' &&
              videoDialog?.shot.subtitleVideoPath
            "
            type="button"
            class="ghost-button"
            :disabled="subtitleDialogBusy"
            @click="revertSubtitles(videoDialog.task, videoDialog.shot)"
          >
            {{ tr("autoUi.k_5d2a55f19c91") }}</button
          ><button
            type="button"
            class="ghost-button"
            :disabled="subtitleDialogBusy"
            @click="liveSubtitleDialogOpen = false"
          >
            {{ tr("autoUi.k_4d0b4688c787") }}</button
          ><button
            type="button"
            class="primary-button"
            :disabled="subtitleDialogBusy"
            @click="generateSubtitles"
          >
            {{
              subtitleDialogBusy
                ? tr("autoUi.k_dde1db57718c")
                : tr("autoUi.k_c0b013507133")
            }}
          </button>
        </div>
      </div>
    </div>
    <div v-if="deleteTarget" class="live-subtitle-dialog">
      <div class="live-subtitle-dialog__panel delete-dialog">
        <div class="live-subtitle-dialog__head">
          <div class="live-subtitle-dialog__titleblock">
            <strong>{{ tr("autoUi.k_4647e4a087a9") }}</strong>
            <p>{{ tr("autoUi.k_3877e6a6b5e2") }}</p>
          </div>
          <button
            class="live-subtitle-dialog__close"
            type="button"
            :disabled="deleteBusy"
            @click="deleteTarget = null"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="delete-dialog__body">
          <div class="delete-dialog__icon"><Trash2 class="h-5 w-5" /></div>
          <div>
            <strong>{{
              deleteTarget.task.productName || tr("autoUi.k_0c5cc87ef67f")
            }}</strong>
            <p>
              {{ tr("autoUi.k_4c01f3eb14ec")
              }}{{ formatTime(deleteTarget.shot.createdAt) }}
            </p>
            <p>{{ tr("autoUi.k_104afca4e63e") }}</p>
          </div>
        </div>
        <div class="dialog-actions">
          <button
            class="ghost-button"
            type="button"
            :disabled="deleteBusy"
            @click="deleteTarget = null"
          >
            {{ tr("autoUi.k_4d0b4688c787") }}</button
          ><button
            class="primary-button delete-confirm-button"
            type="button"
            :disabled="deleteBusy"
            @click="confirmRemoveShot"
          >
            <LoaderCircle
              v-if="deleteBusy"
              class="h-4 w-4 animate-spin"
            /><Trash2 v-else class="h-4 w-4" />{{
              deleteBusy
                ? tr("autoUi.k_ac8071a63a9d")
                : tr("autoUi.k_3c06abe11651")
            }}
          </button>
        </div>
      </div>
    </div>
    <BatchDeleteDialog
      :open="batchDeleteOpen"
      :count="selectedShotIds.length"
      :busy="batchDeleteBusy"
      @close="batchDeleteOpen = false"
      @confirm="confirmBatchDelete"
    />
    <ProductSelectDialog
      :open="productPickerOpen"
      :products="products"
      :selected-id="selectedProductId"
      @close="productPickerOpen = false"
      @select="selectedProductId = $event"
    />
    <RuntimeLogDialog
      v-if="runtimeTask"
      v-model="runtimeDialogOpen"
      :logs="runtimeLogs"
      :show-all="true"
      :title="tr('autoUi.k_d841dc903a0d')"
      :description="tr('autoUi.k_fac813ad269e')"
      :hint="tr('autoUi.k_2709a3d55ec4')"
    />
  </div>
  <section
    v-if="activeTab === 'publish' && publisherEditId"
    class="publisher-edit-dock"
  >
    <div class="publisher-edit-dock__title">正在编辑</div>
    <div class="publisher-edit-dock__file">
      {{
        fileName(
          publisherTasks.find((item) => item.id === publisherEditId)
            ?.sourceVideoPath,
        )
      }}
    </div>
    <button class="primary-button" type="button" @click="applyPublisherEdit">
      保存修改</button
    ><button class="ghost-button" type="button" @click="publisherEditId = ''">
      取消
    </button>
    </section>
    <div
      v-if="publisherConfirmOpen"
      class="publisher-confirm-modal"
      @click.self="cancelPublisherConfirm"
    >
      <div
        class="publisher-confirm-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publisher-confirm-title"
      >
        <div class="publisher-confirm-modal__glow"></div>
        <div class="publisher-confirm-modal__icon">
          <Send class="h-5 w-5" />
        </div>
        <div class="publisher-confirm-modal__content">
          <div class="publisher-confirm-modal__eyebrow">PUBLISH REVIEW</div>
          <h3 id="publisher-confirm-title">确认提交发布？</h3>
          <p>即将提交 <strong>{{ publisherConfirmCount }}</strong> 个视频。提交后，已接受的任务会从待发布列表中移除。</p>
          <div class="publisher-confirm-modal__notice">
            <Clock3 class="h-4 w-4" />
            <span>排期任务也会立即标记为已发布，实际发布时间以 TikTok 设置为准。</span>
          </div>
        </div>
        <div class="publisher-confirm-modal__actions">
          <button type="button" @click="cancelPublisherConfirm">返回检查</button>
          <button type="button" class="primary" @click="confirmPublisherSubmit">
            <Send class="h-4 w-4" />确认提交
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="publisherDeleteTarget"
      class="publisher-delete-modal"
      @click.self="cancelPublisherDelete"
    >
      <div class="publisher-delete-modal__panel" role="dialog" aria-modal="true">
        <div class="publisher-delete-modal__icon">
          <Trash2 class="h-5 w-5" />
        </div>
        <div class="publisher-delete-modal__content">
          <h3>删除发布任务？</h3>
          <p>删除后将从批量发布列表中移除该任务，此操作无法撤销。</p>
          <small>{{ fileName(publisherDeleteTarget.sourceVideoPath) }}</small>
        </div>
        <div class="publisher-delete-modal__actions">
          <button type="button" @click="cancelPublisherDelete">取消</button>
          <button type="button" class="danger" @click="confirmPublisherDelete">
            确认删除
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="publisherStatusDetail"
      class="publisher-status-modal"
      @click.self="closePublisherStatusDetail"
    >
      <div
        class="publisher-status-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publisher-status-title"
      >
        <div class="publisher-status-modal__header">
          <div
            class="publisher-status-modal__icon"
            :class="`state-${publisherStatusDetail.state}`"
          >
            <AlertTriangle
              v-if="publisherStatusDetail.state === 'failed' || publisherStatusDetail.state === 'result_unknown'"
              class="h-5 w-5"
            />
            <CheckCircle2
              v-else-if="publisherStatusDetail.state === 'published'"
              class="h-5 w-5"
            />
            <Clock3 v-else class="h-5 w-5" />
          </div>
          <div>
            <div class="publisher-status-modal__eyebrow">PUBLISH STATUS</div>
            <h3 id="publisher-status-title">{{ publisherStateLabel(publisherStatusDetail.state) }}</h3>
          </div>
          <button
            type="button"
            class="publisher-status-modal__close"
            aria-label="关闭状态详情"
            title="关闭"
            @click="closePublisherStatusDetail"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="publisher-status-modal__file">
          {{ fileName(publisherStatusDetail.sourceVideoPath) }}
        </div>
        <dl class="publisher-status-modal__details">
          <div>
            <dt>发布时间</dt>
            <dd>{{ formatPublisherSchedule(publisherStatusDetail.scheduleAt) }}</dd>
          </div>
          <div v-if="publisherStatusDetail.remoteJobId">
            <dt>远端任务</dt>
            <dd>{{ publisherStatusDetail.remoteJobId }}</dd>
          </div>
          <div v-if="publisherStatusDetail.connectionUid">
            <dt>发布账号</dt>
            <dd>{{ publisherStatusDetail.connectionUid }}</dd>
          </div>
        </dl>
        <div v-if="publisherErrorText(publisherStatusDetail)" class="publisher-status-modal__error">
          <AlertTriangle class="h-4 w-4" />
          <p>{{ publisherErrorText(publisherStatusDetail) }}</p>
        </div>
        <div class="publisher-status-modal__actions">
          <button type="button" @click="closePublisherStatusDetail">关闭</button>
        </div>
      </div>
    </div>
</template>

<style scoped>
.publisher-batch-workspace {
  border-radius: 16px;
  box-shadow: 0 18px 40px rgba(2, 7, 15, 0.28);
}
.publisher-batch-toolbar {
  padding: 18px 20px;
  background: linear-gradient(180deg, #152337, #111c2c);
}
.publisher-batch-title {
  color: #6ce8d2;
}
.publisher-batch-title svg {
  width: 22px;
  height: 22px;
}
.publisher-batch-title h2 {
  font-size: 19px;
  letter-spacing: 0.2px;
}
.publisher-batch-title p {
  color: #95a8c2;
}
.publisher-batch-actions .toolbar-button,
.publisher-batch-actions .primary-button {
  height: 36px;
  border-radius: 9px;
  font-size: 11px;
}
.publisher-batch-actions .toolbar-button {
  border-color: #3c526d;
  background: #172438;
  color: #d8e5f3;
}
.publisher-batch-actions .primary-button {
  min-width: 86px;
  background: linear-gradient(135deg, #53e0c5, #3bc7b4);
  border: 0;
  color: #06231f;
  box-shadow: 0 8px 18px rgba(52, 212, 186, 0.18);
}
.publisher-batch-head {
  padding: 12px 18px;
  background: #0c1624;
  color: #7f94ae;
  font-size: 10px;
  letter-spacing: 0.2px;
}
.publisher-batch-list {
  background: #0c1522;
  padding: 6px 10px 10px;
}
.publisher-batch-row {
  margin: 4px 0;
  padding: 12px 10px;
  border: 1px solid rgba(76, 104, 136, 0.28);
  border-radius: 12px;
  background: linear-gradient(100deg, #111e2e, #0f1928);
  box-shadow: 0 5px 15px rgba(2, 8, 16, 0.2);
  transition:
    border-color 0.16s,
    background 0.16s;
}
.publisher-batch-row:hover {
  border-color: rgba(79, 214, 195, 0.55);
  background: linear-gradient(100deg, #14263a, #101d2d);
}
.publisher-batch-select,
.publisher-batch-input {
  height: 36px;
  border-radius: 8px;
  border-color: #3a526d;
  background: #0d1827;
  color: #eaf2fb;
  outline: none;
}
.publisher-batch-select:focus,
.publisher-batch-input:focus {
  border-color: #4edfc7;
  box-shadow: 0 0 0 3px rgba(78, 223, 199, 0.1);
}
.publisher-batch-video {
  font-size: 11px;
}
.publisher-batch-thumb {
  width: 34px;
  height: 38px;
  border-radius: 8px;
  background: linear-gradient(145deg, #29245d, #1d1a45);
  color: #c8b7ff;
}
.publisher-batch-schedule {
  padding: 6px 8px;
  border: 1px solid rgba(71, 97, 126, 0.25);
  border-radius: 8px;
  background: rgba(9, 18, 30, 0.5);
}
.publisher-batch-state {
  justify-self: center;
  min-width: 48px;
  text-align: center;
  background: rgba(28, 43, 60, 0.75);
}
.publisher-batch-actions-cell .ghost-button {
  height: 30px;
  min-height: 30px;
  padding: 0 9px;
  border-radius: 7px;
  border-color: #405872;
  background: #17263a;
  color: #cddbea;
}
.publisher-batch-actions-cell .ghost-button:hover {
  border-color: #53ddc5;
  color: #8bf0dd;
}
.publisher-batch-empty {
  margin: 10px;
  border: 1px dashed #3d5871;
  border-radius: 12px;
  background: #0e1a29;
}
.publish-mode .publisher-stepper {
  opacity: 0.78;
}
.publisher-step {
  color: #8ea2bb !important;
}
.publisher-step.active {
  color: #62e2cb !important;
}
.publisher-step.active b {
  background: #36cbb4 !important;
}
.publisher-stepper > i {
  background: linear-gradient(90deg, #2c485e, #1b2a3c) !important;
}
.tiktok-page {
  display: grid;
  gap: 10px;
  min-height: 100vh;
  padding: 10px;
  box-sizing: border-box;
  align-content: start;
  color: #f8fbff;
  background:
    radial-gradient(
      circle at top left,
      rgba(83, 58, 152, 0.12),
      transparent 28%
    ),
    linear-gradient(180deg, #111521 0%, #171a29 42%, #111624 100%);
}
.tiktok-page.publish-mode {
  padding: 8px 10px 14px;
  background:
    radial-gradient(
      circle at 75% 20%,
      rgba(23, 105, 108, 0.1),
      transparent 30%
    ),
    linear-gradient(180deg, #0b1420 0%, #101a27 52%, #0d1723 100%);
}
.live-workspace-head,
.panel-card,
.library-export-card {
  border: 1px solid rgba(111, 123, 170, 0.2);
  border-radius: 16px;
  background: linear-gradient(
    180deg,
    rgba(17, 21, 35, 0.98),
    rgba(13, 17, 30, 0.98)
  );
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}
.live-workspace-head {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.45fr);
  align-items: stretch;
  background: transparent;
  border: 0;
  box-shadow: none;
  padding: 0;
}
.live-workspace-intro,
.live-workspace-tabs {
  border: 1px solid rgba(111, 123, 170, 0.2);
  border-radius: 16px;
  background: linear-gradient(
    180deg,
    rgba(17, 21, 35, 0.98),
    rgba(13, 17, 30, 0.98)
  );
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}
.live-workspace-intro {
  padding: 14px 16px;
}
.live-workspace-tabs {
  align-items: center;
  padding: 14px;
}
.live-workspace-head {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
}
.live-workspace-intro {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.live-workspace-icon {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #d8c8ff;
  background: linear-gradient(180deg, #5c45ae, #392978);
}
.live-workspace-copy {
  min-width: 0;
  flex: 1;
}
.live-workspace-copy h1 {
  margin: 0;
  font-size: 18px;
  line-height: 1.28;
}
.live-workspace-copy p {
  margin: 6px 0 0;
  color: rgba(197, 205, 225, 0.82);
  font-size: 12px;
}
.live-workspace-actions {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}
.tab-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.tab-button,
.primary-button,
.ghost-button,
.toolbar-button,
.toolbar-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
}
.tab-button,
.ghost-button,
.toolbar-button,
.toolbar-icon {
  border: 1px solid rgba(111, 123, 170, 0.2);
  background: rgba(18, 23, 38, 0.8);
  color: #eef5ff;
}
.tab-button.active,
.toolbar-icon.active {
  border-color: rgba(119, 92, 255, 0.38);
  background: linear-gradient(
    180deg,
    rgba(85, 68, 167, 0.78),
    rgba(67, 49, 138, 0.78)
  );
}
.primary-button {
  border: 1px solid rgba(145, 106, 255, 0.4);
  background: linear-gradient(90deg, #6d5cff, #9b52ff);
  color: #fff;
}
.live-tab-count,
.library-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(13, 148, 136, 0.14);
  color: #70e2d0;
  font-size: 11px;
}
.banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
}
.banner-success {
  border: 1px solid rgba(34, 197, 94, 0.2);
  background: rgba(34, 197, 94, 0.12);
  color: #d1fae5;
}
.banner-error {
  border: 1px solid rgba(239, 68, 68, 0.2);
  background: rgba(239, 68, 68, 0.12);
  color: #fecaca;
}
.publisher-toast {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 150;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(360px, calc(100vw - 44px));
  padding: 10px 14px;
  border-radius: 10px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.28);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
  transform: translate(-50%, -50%);
  pointer-events: auto;
}
.publisher-toast-success {
  border: 1px solid rgba(50, 215, 192, 0.48);
  background: #102c32;
  color: #8af0df;
}
.publisher-toast-error {
  border: 1px solid rgba(255, 117, 117, 0.5);
  background: #351b25;
  color: #ffb4b4;
}
.publisher-toast > span {
  flex: 1;
}
.publisher-toast > button {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: currentColor;
  opacity: 0.78;
}
.publisher-toast > button:hover {
  background: rgba(255, 255, 255, 0.12);
  opacity: 1;
}
.publish-mode .publisher-toast {
  top: 76px;
  transform: translateX(-50%);
}
.publish-mode .publisher-design-error {
  top: 76px;
  z-index: 160;
}
.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(330px, 0.92fr);
  gap: 10px;
  align-items: start;
}
.panel-card {
  display: grid;
  gap: 10px;
  padding: 12px;
}
.panel-head,
.library-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.panel-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.panel-title-wrap strong {
  font-size: 18px;
}
.panel-head-note {
  color: #9097bd;
  font-size: 12px;
}
.step-badge {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: linear-gradient(180deg, #7568e8, #5a4fd0);
  color: #fff;
  font-weight: 700;
}
.field-stack,
.field {
  display: grid;
  gap: 10px;
}
.field > span {
  font-size: 13px;
  font-weight: 700;
}
.reference-source-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.reference-source-card {
  min-width: 0;
  min-height: 164px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(111, 123, 170, 0.22);
  border-radius: 16px;
  background: linear-gradient(
    180deg,
    rgba(18, 23, 38, 0.82),
    rgba(14, 19, 31, 0.92)
  );
  color: #eef5ff;
  text-align: left;
  cursor: pointer;
}
.reference-source-card__icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #bba2ff;
  background: rgba(106, 79, 209, 0.16);
}
.reference-source-card__preview {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 12px;
}
.reference-source-card__copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.reference-source-card__copy strong {
  font-size: 14px;
}
.reference-source-card__copy small,
.reference-source-card__copy span {
  color: #9fb1d8;
  font-size: 11px;
}
.clone-shot-list {
  display: grid;
  gap: 8px;
  max-height: 240px;
  overflow: auto;
}
.clone-shot-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 11px;
  border-radius: 12px;
  border: 1px solid rgba(111, 123, 170, 0.18);
  background: rgba(18, 23, 38, 0.74);
}
.clone-shot-copy {
  min-width: 0;
}
.clone-shot-copy strong,
.clone-shot-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.clone-shot-copy small {
  color: #9fb1d8;
  font-size: 10px;
}
.ghost-button.small {
  min-height: 32px;
  padding: 0 10px;
  font-size: 11px;
}
.danger {
  color: #fecaca !important;
}
.field input,
.field select,
.field textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 40px;
  padding: 9px 12px;
  border: 1px solid rgba(111, 123, 170, 0.24);
  border-radius: 12px;
  background: rgba(19, 24, 38, 0.92);
  color: #fff;
  font-size: 13px;
}
.field textarea {
  resize: vertical;
  line-height: 1.5;
}
.product-picker {
  position: relative;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 16px;
  gap: 10px;
  align-items: center;
  min-height: 50px;
  padding: 0 12px;
  border: 1px solid rgba(111, 123, 170, 0.22);
  border-radius: 14px;
  background: rgba(19, 24, 38, 0.92);
}
.product-picker select {
  appearance: none;
  border: 0;
  background: transparent;
  min-height: 50px;
  padding: 0;
  font-size: 14px;
}
.product-thumb {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  display: grid;
  place-items: center;
}
.product-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.picker-arrow {
  pointer-events: none;
}
.create-button {
  width: 100%;
  min-height: 48px;
  border-radius: 14px;
  font-size: 15px;
}
.safe-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(214, 223, 246, 0.78);
  font-size: 12px;
  line-height: 1.55;
}
.rules-box {
  display: grid;
  border: 1px solid rgba(111, 123, 170, 0.2);
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(
    180deg,
    rgba(18, 22, 36, 0.86),
    rgba(15, 18, 31, 0.9)
  );
}
.rule-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(111, 123, 170, 0.14);
}
.rule-row:last-child {
  border: 0;
}
.rule-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #c39bff;
  border: 1px solid rgba(164, 115, 255, 0.34);
  background: rgba(122, 82, 255, 0.1);
  font-size: 13px;
  font-weight: 700;
}
.rule-row p {
  margin: 0;
  line-height: 1.55;
  font-size: 13px;
  color: rgba(233, 238, 251, 0.9);
}
.output-note {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 14px;
  background: linear-gradient(
    180deg,
    rgba(72, 54, 133, 0.82),
    rgba(58, 44, 108, 0.94)
  );
  border: 1px solid rgba(135, 102, 255, 0.24);
}
.output-note-head {
  font-size: 15px;
  font-weight: 700;
  color: #dfd5ff;
}
.output-note p {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(220, 228, 246, 0.84);
}
.quality-control-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(79, 194, 168, 0.22);
  background: linear-gradient(
    180deg,
    rgba(19, 61, 58, 0.36),
    rgba(12, 28, 35, 0.6)
  );
}
.quality-control-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  color: #8ef0c8;
}
.quality-control-card__head strong,
.quality-control-card__head small {
  display: block;
}
.quality-control-card__head small {
  margin-top: 5px;
  color: #98cfc0;
  font-size: 11px;
  line-height: 1.5;
}
.prompt-version-editor {
  display: grid;
  gap: 9px;
}
.prompt-version-editor__prompt textarea {
  min-height: 138px;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
}
.prompt-version-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.library-layout {
  display: grid;
  gap: 14px;
}
.library-headline {
  display: grid;
  gap: 18px;
  padding: 8px 0 16px;
  border-bottom: 1px solid rgba(111, 123, 170, 0.14);
}
.library-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.library-heading-cluster,
.library-title-row,
.library-head-tools,
.library-toolbar,
.library-action-group,
.library-output-actions,
.library-view-toggle,
.library-pagination {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.library-title-row strong {
  font-size: 18px;
}
.library-subtitle {
  color: #9fb1d8;
  font-size: 12px;
}
.library-head-tools {
  margin-left: auto;
}
.library-view-toggle {
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: rgba(111, 123, 170, 0.08);
}
.library-pagination {
  font-size: 12px;
  color: #aeb9d2;
}
.library-page-button {
  width: 30px;
  height: 30px;
  border: 1px solid rgba(111, 123, 170, 0.2);
  border-radius: 9px;
  background: rgba(18, 23, 38, 0.8);
  color: #fff;
}
.library-page-button:disabled {
  opacity: 0.35;
}
.live-console-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.live-console-card,
.live-console-row {
  border: 1px solid rgba(111, 123, 170, 0.2);
  border-radius: 16px;
  background: linear-gradient(
    180deg,
    rgba(17, 21, 35, 0.98),
    rgba(13, 17, 30, 0.98)
  );
  overflow: hidden;
}
.live-console-card.selected,
.live-console-row.selected {
  border-color: rgba(124, 92, 255, 0.72);
}
.live-console-card__head,
.live-console-card__body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
}
.live-console-card__preview {
  display: block;
  width: 100%;
  height: 190px;
  border: 0;
  padding: 0;
  background: rgba(5, 8, 16, 0.4);
}
.live-console-row__thumb {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.04);
}
.live-console-row__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.live-console-row__thumb-empty {
  display: grid;
  place-items: center;
  color: #72809c;
}
.preview-play {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(10, 14, 25, 0.58);
  color: #fff;
}
.live-console-row__titleline {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.live-console-row__titleline h3 {
  margin: 0;
  min-width: 0;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.live-console-row__source,
.status-pill,
.live-console-row__status,
.live-console-row__quickchip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(122, 82, 255, 0.12);
  color: #c9bdff;
  font-size: 10px;
  white-space: nowrap;
}
.live-console-row__meta,
.live-console-row__quickrefs {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: #9fb1d8;
  font-size: 11px;
}
.live-console-row__meta {
  margin-top: 6px;
}
.live-console-row__dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #72809c;
}
.live-console-row__quickrefs {
  margin-top: 8px;
  flex-wrap: wrap;
}
.status-completed {
  background: rgba(16, 101, 78, 0.18);
  color: #68f0b9;
}
.status-failed,
.status-paused {
  background: rgba(239, 68, 68, 0.18);
  color: #fecaca;
}
.status-processing {
  background: rgba(91, 118, 255, 0.18);
  color: #cfd8ff;
}
.live-console-row__actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  padding: 0 10px 10px;
}
.live-console-row__link,
.live-console-row__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid rgba(111, 123, 170, 0.2);
  border-radius: 9px;
  background: rgba(18, 23, 38, 0.8);
  color: #eef5ff;
  font-size: 11px;
}
.live-console-row__action {
  width: 30px;
  padding: 0;
}
.live-console-row__link--primary {
  color: #d7cdff;
}
.live-console-list {
  display: grid;
  gap: 8px;
}
.live-console-row {
  display: grid;
  grid-template-columns: 30px 84px minmax(0, 1fr);
  gap: 12px;
  padding: 10px;
}
.live-console-row__check {
  display: grid;
  place-items: center;
}
.live-console-row__preview {
  width: 84px;
  height: 84px;
  border-radius: 12px;
  overflow: hidden;
}
.live-console-row__main {
  min-width: 0;
}
.live-console-row__main .live-console-row__actions {
  padding: 8px 0 0;
}
.live-console-row__side {
  display: grid;
  justify-items: end;
  gap: 8px;
}
.live-console-row__updated-inline {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #9fb1d8;
  font-size: 10px;
}
.live-console-row__bottom {
  grid-column: 2 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid rgba(111, 123, 170, 0.12);
  padding-top: 8px;
}
.live-console-row__error {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin-top: 7px;
  color: #fecaca;
  font-size: 11px;
}
.live-console-row__error-text {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.empty-card {
  min-height: 280px;
  place-items: center;
  text-align: center;
  color: #9fb1d8;
}
.empty-card strong {
  font-size: 16px;
}
.empty-card p {
  margin: 0;
  font-size: 12px;
}
.live-subtitle-dialog {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(5, 8, 16, 0.72);
  backdrop-filter: blur(8px);
}
.live-subtitle-dialog__panel {
  width: min(760px, 100%);
  max-height: calc(100vh - 32px);
  overflow: auto;
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid rgba(111, 123, 170, 0.24);
  border-radius: 16px;
  background: linear-gradient(
    180deg,
    rgba(15, 19, 31, 0.98),
    rgba(12, 16, 27, 0.99)
  );
}
.live-subtitle-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.live-subtitle-dialog__titleblock {
  display: grid;
  gap: 4px;
}
.live-subtitle-dialog__titleblock strong {
  font-size: 20px;
}
.live-subtitle-dialog__titleblock p {
  margin: 0;
  color: #9fb1d8;
  font-size: 12px;
}
.live-subtitle-dialog__close {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(111, 123, 170, 0.24);
  background: rgba(19, 24, 38, 0.92);
  color: #fff;
}
.account-layout {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 14px;
}
.account-list {
  display: grid;
  gap: 8px;
  align-content: start;
}
.account-row {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 10px;
  border: 1px solid rgba(111, 123, 170, 0.18);
  border-radius: 12px;
  background: rgba(18, 23, 38, 0.74);
}
.account-row.disabled {
  opacity: 0.55;
}
.account-order {
  display: grid;
}
.account-order button {
  border: 0;
  background: transparent;
  color: #9fb1d8;
}
.account-main strong,
.account-main small,
.account-state {
  display: block;
}
.account-main small {
  color: #9fb1d8;
  font-size: 10px;
  overflow-wrap: anywhere;
}
.account-state {
  width: max-content;
  margin: 4px 0;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(16, 101, 78, 0.18);
  color: #68f0b9;
  font-size: 10px;
}
.account-state.expired,
.account-state.insufficient_credit,
.account-state.error {
  background: rgba(239, 68, 68, 0.18);
  color: #fecaca;
}
.account-actions {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.account-form {
  display: grid;
  align-content: start;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(111, 123, 170, 0.18);
  border-radius: 12px;
  background: rgba(18, 23, 38, 0.74);
}
.account-form label {
  display: grid;
  gap: 5px;
  color: #9fb1d8;
  font-size: 11px;
}
.account-form input,
.account-form textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 9px;
  border: 1px solid rgba(111, 123, 170, 0.24);
  border-radius: 10px;
  background: rgba(19, 24, 38, 0.92);
  color: #fff;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.material-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  max-height: 58vh;
  overflow: auto;
}
.material-grid button {
  border: 2px solid transparent;
  border-radius: 11px;
  padding: 6px;
  color: #bcc7d4;
  background: #151d2a;
}
.material-grid button.active {
  border-color: #55dfca;
}
.material-grid img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 7px;
}
.material-grid span {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
}
.material-grid-empty {
  padding: 24px;
  border: 1px dashed rgba(111, 123, 170, 0.3);
  border-radius: 12px;
  color: #9fb1d8;
  font-size: 12px;
  text-align: center;
}
.retry-settings-panel {
  width: min(500px, 100%);
}
.retry-settings-hero {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 14px;
  border: 1px solid rgba(115, 212, 199, 0.26);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(35, 102, 104, 0.32), rgba(49, 42, 110, 0.4));
}
.retry-settings-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 12px;
  background: rgba(109, 232, 212, 0.14);
  color: #7ee5d5;
}
.retry-settings-hero div:nth-child(2) {
  display: grid;
  gap: 3px;
}
.retry-settings-hero span,
.retry-settings-hero small,
.retry-settings-field small {
  color: #9fb1d8;
  font-size: 11px;
}
.retry-settings-hero strong {
  color: #f3f6ff;
  font-size: 17px;
}
.retry-settings-field {
  display: grid;
  gap: 7px;
  padding: 14px;
  border: 1px solid rgba(111, 123, 170, 0.2);
  border-radius: 14px;
  background: rgba(18, 23, 38, 0.74);
  color: #dce5f6;
  font-size: 12px;
  font-weight: 700;
}
.retry-settings-field input {
  width: 100%;
  box-sizing: border-box;
  min-height: 46px;
  padding: 9px 12px;
  border: 1px solid rgba(115, 212, 199, 0.34);
  border-radius: 11px;
  outline: 0;
  background: rgba(9, 16, 27, 0.78);
  color: #ffffff;
  font-size: 18px;
  font-weight: 700;
}
.retry-settings-field input:focus {
  border-color: #70e2d0;
  box-shadow: 0 0 0 3px rgba(112, 226, 208, 0.12);
}
.retry-settings-actions {
  padding-top: 2px;
}
.detail-shot {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 12px;
  padding: 10px;
  border: 1px solid rgba(111, 123, 170, 0.18);
  border-radius: 12px;
  background: rgba(18, 23, 38, 0.74);
}
.detail-shot img {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 10px;
}
.detail-shot p {
  margin: 5px 0;
  color: #9fb1d8;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.account-error {
  color: #fecaca !important;
  overflow-wrap: anywhere;
}
@media (max-width: 1080px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }
  .live-console-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .account-layout {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 700px) {
  .live-workspace-head {
    grid-template-columns: 1fr;
  }
  .live-workspace-intro,
  .library-summary-row {
    align-items: flex-start;
    flex-direction: column;
  }
  .live-workspace-actions,
  .library-head-tools {
    margin-left: 0;
  }
  .reference-source-grid,
  .live-console-grid {
    grid-template-columns: 1fr;
  }
  .live-console-row {
    grid-template-columns: 26px 64px minmax(0, 1fr);
  }
  .live-console-row__preview {
    width: 64px;
    height: 64px;
  }
  .live-console-row__bottom {
    grid-column: 2 / -1;
    align-items: flex-start;
    flex-direction: column;
  }
  .account-row {
    grid-template-columns: 24px minmax(0, 1fr);
  }
  .account-actions {
    grid-column: 2;
  }
  .material-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.live-console-row__thumb img {
  object-fit: contain;
}
.live-console-row__preview {
  background: rgba(5, 8, 16, 0.4);
}
.action-icon {
  width: 32px !important;
  min-width: 32px !important;
  height: 32px !important;
  min-height: 32px !important;
  padding: 0 !important;
}
.publish-mode .single-actions {
  gap: 5px;
}
.publish-mode .single-actions button {
  white-space: nowrap;
}
.publisher-credential-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(73, 209, 190, 0.3);
  border-radius: 9px;
  background: #0d2130;
}
.publisher-credential-bar > input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #304963;
  border-radius: 7px;
  background: #0b1522;
  color: #eef5ff;
  font-size: 11px;
}
.publisher-credential-bar .toolbar-button {
  min-height: 32px;
  padding: 0 10px;
  font-size: 10px;
}
.publisher-credential-ok {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #65e9c7;
  font-size: 10px;
  white-space: nowrap;
}
.single-product-button {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: #9fb3ca;
  text-align: left;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.single-product-button:hover {
  color: #5ce4ce;
}
.publisher-editor-media-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}
.publisher-editor-media-actions button {
  min-width: 0;
  padding: 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tiktok-page.publish-mode,
.publish-mode .publisher-single-page,
.publish-mode .publisher-single-head,
.publish-mode .publisher-single-stats,
.publish-mode .publisher-single-filters,
.publish-mode .publisher-single-toolbar,
.publish-mode .publisher-single-main,
.publish-mode .publisher-single-list,
.publish-mode .publisher-single-edit {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
.tiktok-page.publish-mode {
  overflow-x: hidden;
}
.publish-mode .publisher-single-page {
  overflow: hidden;
}
.publish-mode .publisher-credential-bar {
  min-height: 34px;
  padding: 4px 8px;
}
.publish-mode .publisher-single-head {
  padding: 2px 6px;
}
.publish-mode .publisher-single-icon {
  width: 34px;
  height: 34px;
}
.publish-mode .publisher-single-brand h1 {
  font-size: 18px;
}
.publish-mode .publisher-single-brand p {
  margin-top: 2px;
  font-size: 10px;
}
.publish-mode .publisher-single-head-actions button {
  min-height: 32px;
}
.publish-mode .publisher-single-stats {
  gap: 6px;
}
.publish-mode .publisher-single-stats > div {
  min-height: 46px;
  padding: 0 10px;
}
.publish-mode .publisher-single-stats svg {
  width: 16px;
  height: 16px;
}
.publish-mode .publisher-single-stats span {
  font-size: 9px;
}
.publish-mode .publisher-single-stats strong {
  font-size: 14px;
}
.publish-mode .publisher-single-filters {
  gap: 6px;
}
.publish-mode .publisher-single-filters select,
.publish-mode .publisher-search {
  height: 30px;
  padding: 0 8px;
  font-size: 10px;
}
.publish-mode .publisher-single-toolbar {
  padding: 5px 8px;
}
.publish-mode .publisher-single-toolbar .toolbar-button {
  min-height: 28px;
  padding: 0 8px;
}
.publish-mode .publisher-single-main {
  gap: 7px;
}
.publish-mode .publisher-single-edit {
  padding: 10px;
  gap: 8px;
}
.publish-mode .publisher-single-list-head {
  min-height: 36px;
}
.publish-mode .publisher-single-row {
  min-height: 68px;
  padding: 7px 8px;
}
.publish-mode .publisher-single-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
}
.publish-mode .publisher-single-brand {
  min-width: 0;
}
.publish-mode .publisher-single-brand > div:last-child {
  min-width: 0;
}
.publish-mode .publisher-single-brand p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publish-mode .publisher-single-head-actions {
  min-width: 0;
  display: flex;
  justify-content: flex-end;
}
.publish-mode .publisher-single-head-actions button {
  min-width: 0;
  padding-left: 12px;
  padding-right: 12px;
  white-space: nowrap;
}
.publish-mode .publisher-single-stats {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
.publish-mode .publisher-single-filters {
  display: grid;
  grid-template-columns:
    110px 140px minmax(140px, 1fr) 110px minmax(180px, 1.6fr)
    auto auto;
}
.publish-mode .publisher-single-filters select,
.publish-mode .publisher-search,
.publish-mode .publisher-single-filters button {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.publish-mode .publisher-single-toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
}
.publish-mode .publisher-single-toolbar > div {
  display: flex;
  min-width: 0;
  overflow: hidden;
}
.publish-mode .publisher-single-main {
  grid-template-columns: minmax(0, 1fr) 280px;
}
.publish-mode .publisher-single-list-head,
.publish-mode .publisher-single-row {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  grid-template-columns:
    40px minmax(0, 1.35fr) 46px minmax(0, 1.05fr) minmax(0, 1.05fr)
    92px 112px 60px 62px;
  gap: 7px;
}
.publish-mode .publisher-single-list-head > *,
.publish-mode .publisher-single-row > * {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.publish-mode .single-product,
.publish-mode .single-time,
.publish-mode .single-duration {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publish-mode .single-tags {
  min-width: 0;
  max-width: 100%;
}
.publish-mode .single-actions {
  min-width: 0;
}
.publish-mode .publisher-single-edit {
  width: 280px;
  max-width: 280px;
}
.publish-mode .publisher-edit-tabs {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.publish-mode .publisher-edit-tabs button {
  min-width: 0;
  padding: 0 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publish-mode .publisher-single-pager {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.publish-mode .publisher-single-pager select {
  min-width: 88px;
  max-width: 100px;
}
@media (max-width: 1200px) {
  .publish-mode .publisher-single-main {
    grid-template-columns: minmax(0, 1fr) 250px;
  }
  .publish-mode .publisher-single-edit {
    width: 250px;
    max-width: 250px;
  }
  .publish-mode .publisher-single-filters {
    grid-template-columns:
      100px 120px minmax(120px, 1fr) 100px minmax(150px, 1.4fr)
      auto auto;
  }
  .publish-mode .publisher-single-list-head,
  .publish-mode .publisher-single-row {
    grid-template-columns:
      36px minmax(0, 1.25fr) 42px minmax(0, 1fr) minmax(0, 0.95fr)
      80px 100px 56px 58px;
    gap: 5px;
  }
}
.tiktok-page.publish-mode {
  position: relative;
  width: 100%;
  height: auto;
  min-height: 0;
  display: block;
  box-sizing: border-box;
  padding: 10px;
  overflow: visible;
  background: #07111d;
}
.publish-mode > .live-workspace-head {
  display: none !important;
}
.publish-mode > .banner {
  margin: 0 0 8px;
}
.publish-mode .publisher-single-page {
  height: calc(100vh - 20px);
  max-height: calc(100vh - 20px);
  min-height: 0;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: 10px;
  overflow: hidden;
  padding: 14px;
  border-radius: 16px;
}
.publish-mode .publisher-single-head {
  min-height: 58px;
  padding: 4px 8px;
}
.publish-mode .publisher-single-stats {
  min-height: 58px;
}
.publish-mode .publisher-single-filters {
  min-height: 34px;
}
.publish-mode .publisher-single-toolbar {
  min-height: 40px;
}
.publish-mode .publisher-single-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  min-height: 0;
  overflow: hidden;
  gap: 10px;
}
.publish-mode .publisher-single-list {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
}
.publish-mode .publisher-single-list-head {
  min-width: 0;
}
.publish-mode .publisher-single-rows {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.publish-mode .publisher-single-row {
  min-width: 0;
}
.publish-mode .publisher-single-edit {
  display: flex;
  min-width: 0;
  min-height: 0;
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
}
.publish-mode .publisher-single-pager {
  min-height: 38px;
  box-sizing: border-box;
  overflow: hidden;
  white-space: nowrap;
}
.publish-mode .publisher-single-pager span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
}
.publish-mode .publisher-single-toolbar > div {
  min-width: 0;
  overflow: hidden;
}
.publish-mode .publisher-single-toolbar > div .toolbar-button {
  white-space: nowrap;
}
.publish-mode .publisher-single-stats > div {
  min-width: 0;
}
.publish-mode .publisher-single-stats span {
  min-width: 0;
  overflow: hidden;
}
.publish-mode .publisher-single-stats strong {
  white-space: nowrap;
}
@media (max-width: 1100px) {
  .publish-mode .publisher-single-main {
    grid-template-columns: minmax(0, 1fr) 270px;
  }
}
@media (max-width: 820px) {
  .publish-mode .publisher-single-main {
    grid-template-columns: 1fr;
  }
  .publish-mode .publisher-single-edit {
    max-height: 300px;
  }
  .publish-mode .publisher-single-head-actions {
    flex-wrap: wrap;
  }
}
.publish-mode > .publisher-batch-workspace,
.publish-mode > .publish-layout {
  display: none !important;
}
.publisher-single-page {
  height: calc(100vh - 24px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
  padding: 10px;
  border: 1px solid rgba(101, 137, 171, 0.24);
  border-radius: 16px;
  background: #0b1725;
  color: #eef5ff;
}
.publisher-single-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 10px 12px;
}
.publisher-single-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.publisher-single-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(145deg, #23cdbb, #126c77);
  color: #d9fffa;
}
.publisher-single-brand h1 {
  margin: 0;
  font-size: 22px;
}
.publisher-single-brand p {
  margin: 5px 0 0;
  color: #91a8c0;
  font-size: 11px;
}
.publisher-single-head-actions {
  display: flex;
  gap: 8px;
}
.publisher-single-head-actions button {
  min-height: 38px;
}
.publisher-single-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 9px;
}
.publisher-single-stats > div {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 58px;
  padding: 0 14px;
  border: 1px solid rgba(78, 112, 145, 0.24);
  border-radius: 10px;
  background: #0f1e2d;
}
.publisher-single-stats svg {
  color: #51e2ce;
}
.publisher-single-stats span {
  display: grid;
  gap: 3px;
  color: #93a8c1;
  font-size: 10px;
}
.publisher-single-stats strong {
  color: #f5f8ff;
  font-size: 16px;
}
.publisher-single-filters {
  display: flex;
  gap: 8px;
  align-items: center;
}
.publisher-single-filters select,
.publisher-search {
  height: 34px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid #304964;
  border-radius: 8px;
  background: #0d1827;
  color: #dce8f5;
  font-size: 11px;
}
.publisher-search {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1;
}
.publisher-search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #fff;
  font-size: 11px;
}
.publisher-single-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(73, 209, 190, 0.45);
  border-radius: 9px;
  background: #102536;
}
.publisher-single-toolbar > span {
  display: flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
  color: #bfd0e2;
  font-size: 11px;
}
.publisher-single-toolbar > div {
  display: flex;
  gap: 6px;
  flex: 1;
}
.publisher-single-toolbar .toolbar-button {
  min-height: 30px;
  padding: 0 10px;
  font-size: 10px;
}
.publisher-single-toolbar > .primary-button {
  min-height: 36px;
}
.publisher-single-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 10px;
  min-height: 0;
  flex: 1;
}
.publisher-single-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border: 1px solid rgba(74, 107, 139, 0.3);
  border-radius: 11px;
  overflow: hidden;
  background: #091522;
}
.publisher-single-list-head,
.publisher-single-row {
  display: grid;
  grid-template-columns:
    48px minmax(145px, 1.2fr) 50px minmax(130px, 1fr)
    minmax(120px, 1fr) 100px 125px 72px 70px;
  gap: 8px;
  align-items: center;
}
.publisher-single-list-head {
  flex: none;
  min-height: 42px;
  padding: 0 10px;
  background: #0f2030;
  color: #8ba3bd;
  font-size: 10px;
}
.publisher-single-rows {
  min-height: 0;
  overflow: auto;
  padding: 6px;
}
.publisher-single-row {
  min-height: 78px;
  margin-bottom: 6px;
  padding: 9px 10px;
  border: 1px solid rgba(68, 100, 131, 0.35);
  border-radius: 9px;
  background: #0b1826;
  font-size: 10px;
}
.publisher-single-row > label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.publisher-single-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #35d5bf;
}
.single-video-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.single-video-info > span:last-child {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.single-video-info strong,
.single-video-info small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.single-video-info strong {
  font-size: 11px;
}
.single-video-info small {
  color: #7189a4;
  font-size: 9px;
}
.single-video-thumb {
  width: 40px;
  height: 52px;
  flex: none;
  border-radius: 7px;
  overflow: hidden;
  background: #1a2c43;
}
.single-video-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.single-duration,
.single-product,
.single-time {
  color: #9fb3ca;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-single-row > input {
  width: 100%;
  height: 32px;
  box-sizing: border-box;
  padding: 0 8px;
  border: 1px solid #304963;
  border-radius: 7px;
  background: #0b1522;
  color: #eef5ff;
  font-size: 10px;
}
.single-tags {
  display: flex;
  gap: 4px;
  align-items: center;
  overflow: hidden;
}
.single-tags span,
.single-tags b {
  padding: 3px 6px;
  border-radius: 9px;
  background: #1b2b40;
  color: #bfd0e4;
  font-size: 9px;
  white-space: nowrap;
}
.single-tags b {
  background: #24364e;
  color: #8ea6bf;
}
.single-state {
  justify-self: start;
  padding: 4px 7px;
  border-radius: 9px;
  background: #233247;
  color: #bccbdd;
  font-size: 9px;
  white-space: nowrap;
}
.single-state.state-published {
  background: #123f38;
  color: #68efc8;
}
.single-actions {
  display: flex;
  gap: 4px;
}
.single-actions button {
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
}
.publisher-single-edit {
  display: flex;
  flex-direction: column;
  gap: 11px;
  min-height: 0;
  padding: 14px;
  border: 1px solid rgba(74, 107, 139, 0.3);
  border-radius: 11px;
  background: #0e1c2b;
  overflow: auto;
}
.publisher-single-edit-head {
  display: flex;
  align-items: center;
  gap: 9px;
}
.publisher-single-edit-head svg {
  color: #5ce4ce;
}
.publisher-single-edit-head strong,
.publisher-single-edit-head small {
  display: block;
}
.publisher-single-edit-head small {
  margin-top: 3px;
  color: #839bb5;
  font-size: 10px;
}
.publisher-edit-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  border-bottom: 1px solid #263d56;
}
.publisher-edit-tabs button {
  height: 30px;
  border: 0;
  background: transparent;
  color: #8fa6bf;
  font-size: 10px;
}
.publisher-edit-tabs button.active {
  color: #5ce4ce;
  border-bottom: 2px solid #3fd5bd;
}
.publisher-edit-preview {
  display: flex;
  align-items: center;
  gap: 8px;
}
.publisher-edit-preview video {
  width: 66px;
  height: 88px;
  object-fit: cover;
  border-radius: 7px;
  background: #08111c;
}
.publisher-single-edit .publisher-editor-field input {
  min-height: 36px;
}
.publisher-single-edit .publisher-editor-field textarea {
  min-height: 92px;
}
.publisher-single-pager {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  color: #829ab3;
  font-size: 10px;
}
.publisher-single-pager button {
  min-width: 28px;
}
.pager-active {
  width: 28px;
  height: 28px;
  border: 1px solid #39d5bf;
  border-radius: 7px;
  background: #123e3d;
  color: #7ef3de;
}
.publisher-single-pager select {
  margin-left: 10px;
  height: 30px;
  border: 1px solid #304963;
  border-radius: 7px;
  background: #0d1827;
  color: #dce8f5;
  font-size: 10px;
}
@media (max-width: 1100px) {
  .publisher-single-main {
    grid-template-columns: minmax(0, 1fr) 250px;
  }
  .publisher-single-list-head,
  .publisher-single-row {
    grid-template-columns:
      40px minmax(130px, 1.1fr) 44px minmax(110px, 1fr)
      minmax(110px, 1fr) 90px 110px 62px 58px;
  }
}
@media (max-width: 800px) {
  .publisher-single-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .publisher-single-filters {
    flex-wrap: wrap;
  }
  .publisher-single-filters select {
    flex: 1;
  }
  .publisher-single-main {
    grid-template-columns: 1fr;
  }
  .publisher-single-edit {
    max-height: 420px;
  }
}
.tiktok-page.publish-mode {
  height: 100vh;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
}
.tiktok-page.publish-mode > .live-workspace-head {
  display: none !important;
}
.tiktok-page.publish-mode > .banner {
  flex: none;
}
.publish-mode .publisher-batch-workspace {
  height: calc(100vh - 24px);
  max-height: calc(100vh - 24px);
  min-height: 0;
  margin: 0;
  box-sizing: border-box;
}
.publish-mode .publisher-batch-body {
  min-height: 0;
  overflow: hidden;
}
.publish-mode .publisher-batch-editor {
  min-height: 0;
}
.publish-mode .publisher-batch-table-wrap {
  min-width: 0;
  min-height: 0;
}
.publish-mode .publisher-batch-head,
.publish-mode .publisher-batch-row {
  grid-template-columns:
    44px minmax(145px, 1.15fr) minmax(140px, 1.15fr)
    minmax(120px, 1fr) minmax(120px, 1fr) minmax(145px, 1.15fr)
    145px 58px 70px;
  column-gap: 8px;
  min-width: 0;
}
.publish-mode .publisher-batch-head {
  padding-left: 14px;
  padding-right: 14px;
  font-size: 11px;
}
.publish-mode .publisher-batch-list {
  padding: 8px 10px 12px;
  overflow-y: auto;
  overflow-x: hidden;
}
.publish-mode .publisher-batch-row {
  min-height: 96px;
  margin-bottom: 6px;
  padding: 11px 12px;
  border-radius: 11px;
}
.publish-mode .publisher-batch-video {
  gap: 8px;
  min-width: 0;
  font-size: 12px;
}
.publish-mode .publisher-batch-video > span:last-child,
.publish-mode .publisher-batch-select,
.publish-mode .publisher-batch-input {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publish-mode .publisher-batch-thumb {
  width: 32px;
  height: 42px;
}
.publish-mode .publisher-batch-select,
.publish-mode .publisher-batch-input {
  height: 36px;
  padding: 0 9px;
  font-size: 11px;
}
.publish-mode .publisher-batch-schedule {
  min-width: 0;
  font-size: 11px;
}
.publish-mode .publisher-batch-schedule input[type="datetime-local"] {
  width: 100%;
  min-width: 0;
  height: 30px;
  font-size: 10px;
}
.publish-mode .publisher-batch-actions-cell {
  min-width: 0;
}
.publish-mode .publisher-batch-actions-cell button {
  width: 30px;
  height: 30px;
  min-height: 30px;
}
.publish-mode .publisher-editor-field input {
  min-height: 38px;
}
.publish-mode .publisher-editor-field textarea {
  min-height: 92px;
}
.publish-mode .publisher-editor-tags button {
  min-height: 26px;
  padding: 0 9px;
  font-size: 10px;
}
.publish-mode .publisher-apply-button {
  min-height: 40px;
}
.publish-mode .publisher-reset-button {
  min-height: 36px;
}
.tiktok-page.publish-mode {
  display: block;
  min-height: 100vh;
  padding: 12px 10px 14px;
  background: #07111d;
  overflow: hidden;
}
.publish-mode .live-workspace-head {
  display: none;
}
.publish-mode .banner {
  margin-bottom: 8px;
}
.publish-mode .publisher-batch-workspace {
  height: calc(100vh - 28px);
  min-height: 620px;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: #0b1725;
  border: 1px solid rgba(104, 133, 166, 0.28);
  box-shadow: 0 18px 46px rgba(1, 7, 14, 0.34);
}
.publish-mode .publisher-batch-toolbar {
  flex: none;
  min-height: 96px;
  box-sizing: border-box;
  padding: 20px 26px;
  background: #152338;
  border-bottom: 1px solid rgba(114, 144, 178, 0.26);
}
.publish-mode .publisher-batch-title {
  gap: 12px;
}
.publish-mode .publisher-batch-title h2 {
  font-size: 20px;
}
.publish-mode .publisher-batch-title p {
  margin-top: 6px;
  font-size: 12px;
  color: #8ea7c4;
}
.publish-mode .publisher-batch-actions {
  gap: 10px;
}
.publish-mode .publisher-batch-actions button {
  min-height: 42px;
  padding: 0 18px;
  border-radius: 10px;
  font-size: 12px;
}
.publish-mode .publisher-batch-actions .primary-button {
  min-width: 130px;
}
.publish-mode .publisher-batch-body {
  min-height: 0;
  flex: 1;
  grid-template-columns: 325px minmax(0, 1fr);
}
.publish-mode .publisher-batch-editor {
  gap: 14px;
  padding: 22px 20px;
  background: #0e1b2a;
  border-right: 1px solid rgba(114, 144, 178, 0.24);
  overflow: auto;
}
.publish-mode .publisher-editor-head {
  padding-bottom: 14px;
}
.publish-mode .publisher-editor-head strong {
  font-size: 16px;
  color: #edf5ff;
}
.publish-mode .publisher-editor-head span {
  font-size: 12px;
}
.publish-mode .publisher-editor-field {
  gap: 8px;
}
.publish-mode .publisher-editor-field > span,
.publish-mode .publisher-editor-publish-time > span {
  font-size: 12px;
  color: #c3d1e3;
}
.publish-mode .publisher-editor-field input,
.publish-mode .publisher-editor-field textarea {
  min-height: 42px;
  padding: 0 13px;
  border-radius: 10px;
  background: #111c2c;
  border-color: #2c4561;
  font-size: 12px;
}
.publish-mode .publisher-editor-field textarea {
  padding-top: 11px;
  min-height: 124px;
}
.publish-mode .publisher-editor-tags {
  gap: 7px;
}
.publish-mode .publisher-editor-tags button {
  min-height: 30px;
  padding: 0 11px;
  border-radius: 14px;
  font-size: 11px;
}
.publish-mode .publisher-editor-publish-time {
  gap: 10px;
  font-size: 12px;
}
.publish-mode .publisher-editor-publish-time input[type="datetime-local"] {
  height: 40px;
  border-radius: 9px;
  font-size: 12px;
}
.publish-mode .publisher-apply-button {
  min-height: 44px;
  border-radius: 10px;
  font-size: 12px;
}
.publish-mode .publisher-reset-button {
  min-height: 40px;
  border-radius: 10px;
  font-size: 12px;
}
.publish-mode .publisher-batch-table-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: #091421;
}
.publish-mode .publisher-batch-head,
.publish-mode .publisher-batch-row {
  grid-template-columns: 64px 170px 190px 150px 170px 210px 190px 74px 86px;
  column-gap: 12px;
}
.publish-mode .publisher-batch-head {
  flex: none;
  min-height: 56px;
  box-sizing: border-box;
  padding: 0 22px;
  align-items: center;
  background: #0d1928;
  color: #8fa7c3;
  font-size: 12px;
}
.publish-mode .publisher-batch-list {
  min-height: 0;
  flex: 1;
  padding: 10px 14px 18px;
  overflow: auto;
  background: #091421;
}
.publish-mode .publisher-batch-row {
  min-height: 118px;
  box-sizing: border-box;
  margin: 0 0 8px;
  padding: 16px 18px;
  border: 1px solid rgba(76, 108, 141, 0.34);
  border-radius: 14px;
  background: #0a1421;
  box-shadow: none;
}
.publish-mode .publisher-batch-row:hover {
  background: #0d1b2b;
  border-color: rgba(78, 218, 198, 0.52);
}
.publish-mode .publisher-batch-check {
  gap: 8px;
}
.publish-mode .publisher-batch-check input {
  width: 20px;
  height: 20px;
}
.publish-mode .publisher-batch-check b {
  font-size: 12px;
  color: #7792ad;
}
.publish-mode .publisher-batch-video {
  gap: 10px;
  font-size: 14px;
}
.publish-mode .publisher-batch-thumb {
  width: 38px;
  height: 48px;
  border-radius: 8px;
  background: #172944;
}
.publish-mode .publisher-batch-select,
.publish-mode .publisher-batch-input {
  height: 42px;
  padding: 0 12px;
  border-radius: 10px;
  border-color: #304a66;
  background: #0d1726;
  font-size: 12px;
}
.publish-mode .publisher-batch-schedule {
  gap: 7px;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 12px;
}
.publish-mode .publisher-batch-schedule label {
  gap: 7px;
}
.publish-mode .publisher-batch-schedule input[type="radio"] {
  width: 16px;
  height: 16px;
}
.publish-mode .publisher-batch-schedule input[type="datetime-local"] {
  width: 100%;
  height: 34px;
  padding: 0 7px;
  border: 1px solid #304a66;
  border-radius: 8px;
  background: #0d1726;
  color: #e9f1fb;
  font-size: 11px;
}
.publish-mode .publisher-batch-state {
  justify-self: start;
  padding: 5px 8px;
  border-radius: 12px;
  font-size: 11px;
}
.publish-mode .publisher-batch-actions-cell {
  gap: 6px;
}
.publish-mode .publisher-batch-actions-cell button {
  width: 34px;
  height: 34px;
  min-height: 34px;
  padding: 0;
  border-radius: 8px;
}
.publish-mode .publisher-batch-empty {
  min-height: 300px;
  margin: 10px;
  border-radius: 14px;
}
@media (max-width: 1100px) {
  .publish-mode .publisher-batch-body {
    grid-template-columns: 280px minmax(1120px, 1fr);
  }
}
.publisher-batch-body {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  min-height: 560px;
}
.publisher-batch-editor {
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 16px;
  border-right: 1px solid rgba(108, 135, 167, 0.2);
  background: linear-gradient(180deg, #101d2b, #0c1725);
}
.publisher-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(108, 135, 167, 0.18);
}
.publisher-editor-head strong {
  font-size: 14px;
}
.publisher-editor-head span {
  color: #6ee7d4;
  font-size: 10px;
}
.publisher-editor-field {
  position: relative;
  display: grid;
  gap: 6px;
}
.publisher-editor-field > span,
.publisher-editor-publish-time > span {
  color: #aebbd0;
  font-size: 10px;
  font-weight: 700;
}
.publisher-editor-field input,
.publisher-editor-field textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 9px;
  border: 1px solid #354e68;
  border-radius: 8px;
  background: #0b1726;
  color: #edf4ff;
  font-size: 11px;
  outline: none;
}
.publisher-editor-field textarea {
  resize: vertical;
  line-height: 1.45;
}
.publisher-editor-field small {
  position: absolute;
  right: 8px;
  bottom: 8px;
  color: #7387a1;
  font-size: 9px;
}
.publisher-editor-tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.publisher-editor-tags button {
  padding: 4px 8px;
  border: 1px solid #354e68;
  border-radius: 10px;
  background: #17283c;
  color: #cbd8e8;
  font-size: 9px;
}
.publisher-editor-tags .tag-add {
  border-style: dashed;
  color: #78e4d0;
}
.publisher-editor-publish-time {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  color: #b8c7d9;
  font-size: 10px;
}
.publisher-editor-publish-time > span {
  grid-column: 1/-1;
}
.publisher-editor-publish-time label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.publisher-editor-publish-time input[type="datetime-local"] {
  grid-column: 1/-1;
  width: 100%;
  box-sizing: border-box;
  height: 32px;
  border: 1px solid #354e68;
  border-radius: 7px;
  background: #0b1726;
  color: #edf4ff;
  font-size: 10px;
}
.publisher-apply-button {
  width: 100%;
  min-height: 38px;
  font-size: 11px;
}
.publisher-reset-button {
  width: 100%;
  min-height: 34px;
  font-size: 10px;
}
.publisher-batch-table-wrap {
  min-width: 0;
  overflow: auto;
}
.publisher-batch-head,
.publisher-batch-row {
  grid-template-columns:
    46px 150px 150px 140px 145px minmax(145px, 1fr)
    180px 70px 80px;
}
.publisher-batch-thumb {
  overflow: hidden;
}
.publisher-batch-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.publisher-batch-check {
  display: flex;
  align-items: center;
  gap: 7px;
}
.publisher-batch-check b {
  color: #7890aa;
  font-size: 10px;
  font-weight: 500;
}
@media (max-width: 980px) {
  .publisher-batch-body {
    grid-template-columns: 220px minmax(1000px, 1fr);
  }
}
@media (max-width: 700px) {
  .publisher-batch-body {
    display: block;
  }
  .publisher-batch-editor {
    border-right: 0;
    border-bottom: 1px solid rgba(108, 135, 167, 0.2);
  }
  .publisher-batch-table-wrap {
    overflow-x: auto;
  }
  .publisher-batch-head {
    display: grid;
  }
  .publisher-batch-row {
    display: grid;
  }
}
.live-console-list__metrics {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
  color: #9fb1d8;
  font-size: 10px;
  flex-wrap: wrap;
}
.live-console-grid {
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}
.live-console-grid .live-console-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 20px;
  overflow: hidden;
  background:
    radial-gradient(
      circle at top right,
      rgba(120, 96, 255, 0.12),
      transparent 28%
    ),
    linear-gradient(180deg, rgba(17, 21, 35, 0.98), rgba(13, 17, 30, 0.98));
  box-shadow: 0 18px 40px rgba(6, 10, 20, 0.22);
}
.live-console-grid .live-console-card__head,
.live-console-grid .live-console-card__body {
  padding: 0;
}
.live-console-card__badges {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
}
.exported-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid rgba(74, 222, 128, 0.28);
  border-radius: 999px;
  background: rgba(22, 163, 74, 0.16);
  color: #8df2ae;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.live-console-grid .live-console-card__body {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.live-console-grid .live-console-card__preview {
  height: auto;
  aspect-ratio: 9/16;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.live-console-grid .live-console-card__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid rgba(111, 123, 170, 0.14);
  border-radius: 10px;
  background: rgba(8, 13, 23, 0.52);
}
.live-console-grid .live-console-card__metrics > div {
  display: grid;
  gap: 1px;
  min-width: 0;
  padding: 5px 1px;
  text-align: center;
  border-right: 1px solid rgba(111, 123, 170, 0.12);
}
.live-console-grid .live-console-card__metrics > div:last-child {
  border-right: 0;
}
.live-console-grid .live-console-card__metrics span {
  color: #8290ad;
  font-size: 9px;
  white-space: nowrap;
}
.live-console-grid .live-console-card__metrics strong {
  color: #70e2d0;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.live-console-grid .live-console-row__titleline {
  align-items: flex-start;
  flex-wrap: wrap;
}
.live-console-grid .live-console-row__titleline h3 {
  width: 100%;
  font-size: 13px;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.live-console-grid .live-console-row__meta {
  align-items: flex-start;
  white-space: normal;
  line-height: 1.45;
}
.live-console-grid .live-console-row__subtitle {
  color: #9fb1d8;
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.live-console-grid .live-console-row__quickchip {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.live-console-grid .live-console-row__error-text {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.live-console-grid .live-console-row__actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  padding: 0;
}
.live-console-grid .live-console-row__link,
.live-console-grid .live-console-row__action {
  width: 100%;
  padding: 0;
  font-size: 0;
}
.live-console-grid .live-console-row__link svg,
.live-console-grid .live-console-row__action svg {
  width: 15px;
  height: 15px;
}
.live-console-row__action--danger {
  color: #fecaca;
  border-color: rgba(239, 68, 68, 0.2);
}
.detail-dialog {
  width: min(980px, 100%);
}
.detail-tabs {
  display: flex;
  gap: 6px;
  padding: 4px;
  border: 1px solid rgba(111, 123, 170, 0.14);
  border-radius: 12px;
  background: rgba(18, 23, 38, 0.82);
}
.detail-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #9fb1d8;
}
.detail-tabs button.active {
  color: #fff;
  background: rgba(102, 88, 232, 0.24);
}
.detail-shot {
  grid-template-columns: 220px minmax(0, 1fr);
  align-items: start;
}
.detail-shot > img {
  width: 220px;
  height: auto;
  aspect-ratio: 9/16;
  object-fit: contain;
  background: rgba(5, 8, 16, 0.4);
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.detail-grid > div {
  display: grid;
  gap: 5px;
  padding: 11px;
  border: 1px solid rgba(111, 123, 170, 0.16);
  border-radius: 11px;
  background: rgba(9, 16, 28, 0.48);
  min-width: 0;
}
.detail-grid span {
  color: #9fb1d8;
  font-size: 10px;
}
.detail-grid strong {
  font-size: 12px;
  overflow-wrap: anywhere;
}
.detail-grid .detail-wide {
  grid-column: 1/-1;
}
.request-parameter-panel {
  display: grid;
  gap: 12px;
}
.request-parameter-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.request-parameter-head p {
  margin: 4px 0 0;
  color: #9fb1d8;
  font-size: 11px;
}
.request-parameter-head span {
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(13, 148, 136, 0.14);
  color: #70e2d0;
  font-size: 10px;
}
.request-parameter-panel pre {
  max-height: 56vh;
  margin: 0;
  overflow: auto;
  padding: 14px;
  border: 1px solid rgba(111, 123, 170, 0.2);
  border-radius: 12px;
  background: #090e18;
  color: #c9d6ef;
  font:
    11px/1.6 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.subtitle-dialog {
  width: min(720px, 100%);
}
.subtitle-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.subtitle-summary > div {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid rgba(111, 123, 170, 0.16);
  border-radius: 12px;
  background: rgba(18, 23, 38, 0.72);
}
.subtitle-summary span {
  color: #9fb1d8;
  font-size: 11px;
}
.subtitle-summary strong {
  font-size: 15px;
}
.video-dialog {
  width: min(900px, 100%);
}
.video-dialog__player {
  display: block;
  width: 100%;
  max-height: 68vh;
  min-height: 280px;
  object-fit: contain;
  border-radius: 12px;
  background: #050810;
}
.video-dialog__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #9fb1d8;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.live-subtitle-dialog__panel--copied {
  width: min(760px, 100%);
}
.live-subtitle-dialog__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 6px;
  border-top: 1px solid rgba(111, 123, 170, 0.12);
}
.live-subtitle-dialog__summary {
  display: flex;
  gap: 12px;
}
.live-subtitle-dialog__summary-item {
  flex: 1;
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid rgba(111, 123, 170, 0.18);
  border-radius: 12px;
  background: rgba(18, 23, 38, 0.72);
}
.live-subtitle-dialog__summary-item span,
.live-subtitle-dialog__field span {
  color: #9fb1d8;
  font-size: 12px;
}
.live-subtitle-dialog__summary-item strong {
  font-size: 14px;
  color: #eef5ff;
}
.live-subtitle-dialog__tabs {
  display: inline-flex;
  gap: 4px;
  width: fit-content;
  padding: 4px;
  border-radius: 12px;
  background: rgba(18, 23, 38, 0.82);
  border: 1px solid rgba(111, 123, 170, 0.14);
}
.live-subtitle-dialog__tabs button {
  min-height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #9fb1d8;
}
.live-subtitle-dialog__tabs button.active {
  color: #fff;
  background: rgba(102, 88, 232, 0.24);
}
.live-subtitle-dialog__section {
  display: grid;
  gap: 12px;
}
.live-subtitle-dialog__section-head {
  display: grid;
  gap: 4px;
}
.live-subtitle-dialog__kicker {
  color: #9fb1d8;
  font-size: 11px;
  text-transform: uppercase;
}
.live-subtitle-dialog__section-head strong {
  color: #eef5ff;
  font-size: 14px;
}
.live-subtitle-dialog__mode-pills {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.live-subtitle-dialog__mode-pills button {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(111, 123, 170, 0.18);
  background: rgba(18, 23, 38, 0.72);
  color: #eef5ff;
}
.live-subtitle-dialog__mode-pills button.is-active {
  border-color: rgba(124, 92, 255, 0.6);
  background: rgba(65, 51, 145, 0.18);
}
.live-subtitle-dialog__field {
  display: grid;
  gap: 6px;
}
.live-subtitle-dialog__section textarea,
.live-subtitle-dialog__section input,
.live-subtitle-dialog__section select {
  width: 100%;
  min-height: 38px;
  padding: 10px 12px;
  border: 1px solid rgba(111, 123, 170, 0.22);
  border-radius: 10px;
  background: rgba(19, 24, 38, 0.92);
  color: #fff;
}
.live-subtitle-dialog__textarea {
  min-height: 120px;
  resize: vertical;
}
.live-subtitle-dialog__inline-tip {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(18, 23, 38, 0.68);
  color: #b8c7e8;
  font-size: 12px;
  line-height: 1.55;
}
.live-subtitle-dialog__preset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.live-subtitle-dialog__preset {
  display: grid;
  gap: 4px;
  text-align: left;
  padding: 12px 14px;
  border: 1px solid rgba(111, 123, 170, 0.16);
  border-radius: 12px;
  background: rgba(18, 23, 38, 0.7);
  color: #eef5ff;
}
.live-subtitle-dialog__preset.active {
  border-color: rgba(124, 92, 255, 0.6);
  background: rgba(65, 51, 145, 0.18);
}
.live-subtitle-dialog__preset span,
.live-subtitle-dialog__preset-note {
  color: #9fb1d8;
  font-size: 11px;
  line-height: 1.45;
}
.live-subtitle-dialog__style-panel,
.live-subtitle-dialog__form-grid {
  display: grid;
  gap: 10px;
}
.live-subtitle-dialog__form-grid--compact,
.live-subtitle-dialog__form-grid--dual {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.live-subtitle-dialog__color-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px;
  gap: 8px;
  align-items: center;
}
.account-row.editing {
  border-color: rgba(145, 106, 255, 0.64);
  box-shadow: inset 0 0 0 1px rgba(145, 106, 255, 0.16);
}
.account-form-hint {
  color: #9fb1d8;
  font-size: 10px;
  line-height: 1.5;
}
.product-picker-button {
  width: 100%;
  color: #fff;
  text-align: left;
  cursor: pointer;
}
.product-picker-button:hover {
  border-color: rgba(85, 223, 202, 0.44);
}
.product-picker-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}
.batch-delete-button {
  color: #fecaca;
  border-color: rgba(239, 68, 68, 0.24);
}
.delete-dialog {
  width: min(520px, 100%);
}
.delete-dialog__body {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 14px;
  border: 1px solid rgba(239, 68, 68, 0.18);
  border-radius: 12px;
  background: rgba(127, 29, 29, 0.12);
}
.delete-dialog__icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.16);
  color: #fecaca;
}
.delete-dialog__body p {
  margin: 5px 0 0;
  color: #9fb1d8;
  font-size: 11px;
  line-height: 1.5;
}
.delete-confirm-button {
  border-color: rgba(239, 68, 68, 0.38);
  background: linear-gradient(90deg, #b42332, #dc3545);
}
.account-tab {
  margin-left: auto;
}
.live-console-row__action--region {
  color: #8ef0c8;
  border-color: rgba(79, 194, 168, 0.32);
  background: rgba(19, 61, 58, 0.42);
}
.detail-region-action {
  align-items: start;
}
.detail-region-action .primary-button {
  width: max-content;
  max-width: 100%;
  margin-top: 4px;
}
.region-dialog {
  width: min(820px, 100%);
}
.region-stage {
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid rgba(111, 123, 170, 0.24);
  border-radius: 12px;
  background: #090e18;
  touch-action: none;
  user-select: none;
  cursor: crosshair;
}
.region-stage > img {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: min(64vh, 640px);
  display: block;
  pointer-events: none;
}
.region-box {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid #55dfca;
  background: rgba(85, 223, 202, 0.12);
  box-shadow: 0 0 0 9999px rgba(5, 8, 16, 0.46);
  cursor: move;
}
.region-handle {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid #07121a;
  border-radius: 50%;
  background: #55dfca;
}
.region-handle.is-nw {
  left: -8px;
  top: -8px;
  cursor: nwse-resize;
}
.region-handle.is-ne {
  right: -8px;
  top: -8px;
  cursor: nesw-resize;
}
.region-handle.is-sw {
  left: -8px;
  bottom: -8px;
  cursor: nesw-resize;
}
.region-handle.is-se {
  right: -8px;
  bottom: -8px;
  cursor: nwse-resize;
}
.region-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #9fb1d8;
  font-size: 11px;
}
.publisher-panel {
  grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
  gap: 14px;
  align-items: stretch;
}
.publish-mode .publish-layout {
  display: none;
}
.publisher-batch-workspace {
  padding: 0;
  overflow: hidden;
  background: #101925;
  border-color: rgba(103, 143, 175, 0.3);
}
.publisher-batch-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(108, 135, 167, 0.22);
}
.publisher-batch-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #59e6ce;
}
.publisher-batch-title h2 {
  margin: 0;
  color: #f0f5ff;
  font-size: 18px;
}
.publisher-batch-title p {
  margin: 4px 0 0;
  color: #8fa1ba;
  font-size: 11px;
}
.publisher-batch-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.publisher-batch-head,
.publisher-batch-row {
  display: grid;
  grid-template-columns:
    42px 150px 170px 150px 150px minmax(180px, 1fr)
    180px 90px 130px;
  gap: 8px;
  align-items: center;
}
.publisher-batch-head {
  padding: 10px 14px;
  color: #8093ad;
  font-size: 10px;
  border-bottom: 1px solid rgba(108, 135, 167, 0.18);
}
.publisher-batch-list {
  overflow: auto;
}
.publisher-batch-row {
  min-width: 1180px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(108, 135, 167, 0.14);
  background: rgba(8, 15, 26, 0.34);
}
.publisher-batch-row:hover {
  background: rgba(24, 47, 64, 0.38);
}
.publisher-batch-check {
  display: grid;
  place-items: center;
}
.publisher-batch-check input {
  width: 16px;
  height: 16px;
  accent-color: #50ddc5;
}
.publisher-batch-select,
.publisher-batch-input {
  width: 100%;
  height: 34px;
  box-sizing: border-box;
  padding: 0 8px;
  border: 1px solid #344b66;
  border-radius: 7px;
  background: #111d2c;
  color: #e6eef8;
  font-size: 10px;
}
.publisher-batch-video {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #e6eef8;
  font-size: 10px;
}
.publisher-batch-video > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-batch-thumb {
  display: grid;
  place-items: center;
  width: 30px;
  height: 34px;
  flex: none;
  border-radius: 6px;
  background: #221f4b;
  color: #bea8ff;
}
.publisher-batch-schedule {
  display: grid;
  gap: 5px;
  color: #afbdd0;
  font-size: 9px;
}
.publisher-batch-schedule label {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.publisher-batch-schedule input {
  accent-color: #50ddc5;
}
.publisher-batch-state {
  justify-self: start;
  padding: 4px 8px;
  border: 1px solid #3e536c;
  border-radius: 10px;
  color: #b8c6d7;
  font-size: 9px;
}
.publisher-batch-state.state-ready {
  border-color: #299b84;
  color: #67e8d1;
}
.publisher-batch-actions-cell {
  display: flex;
  gap: 5px;
}
.publisher-batch-empty {
  display: grid;
  place-items: center;
  gap: 9px;
  min-height: 240px;
  color: #8fa1ba;
  font-size: 12px;
}
.publisher-batch-empty strong {
  color: #e7eef8;
  font-size: 15px;
}
.publisher-batch-empty .primary-button {
  margin-top: 5px;
}
@media (max-width: 700px) {
  .publisher-batch-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .publisher-batch-actions button {
    flex: 1;
  }
  .publisher-batch-head {
    display: none;
  }
}
.publish-page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 6px 4px;
}
.publish-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.publish-brand-icon {
  width: 46px;
  height: 46px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  color: #54ead1;
  background: linear-gradient(145deg, #123f47, #0d292f);
  box-shadow: inset 0 0 0 1px rgba(72, 226, 201, 0.22);
}
.publish-brand h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
}
.publish-brand p {
  margin: 5px 0 0;
  color: #9aa9c0;
  font-size: 12px;
}
.publish-head-actions {
  display: flex;
  gap: 10px;
}
.publish-help,
.publish-guide {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 13px;
  border-radius: 9px;
  border: 1px solid rgba(79, 217, 195, 0.55);
  background: rgba(18, 56, 63, 0.52);
  color: #d8f9f1;
  font-size: 11px;
}
.publish-guide {
  border-color: rgba(122, 144, 180, 0.4);
  background: rgba(22, 31, 47, 0.8);
  color: #d3dced;
}
.publish-help span {
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  border: 1px solid currentColor;
  border-radius: 50%;
  font-size: 10px;
}
.publish-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(380px, 0.9fr);
  gap: 12px;
  align-items: stretch;
}
.publish-left {
  padding: 0;
  overflow: hidden;
  background: linear-gradient(180deg, #101d2b, #0e1927);
  border-color: rgba(103, 143, 175, 0.28);
}
.publish-section-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 17px 19px 10px;
}
.publish-section-head h2 {
  margin: 0;
  font-size: 14px;
}
.publish-section-head p {
  margin: 5px 0 0;
  color: #8fa1ba;
  font-size: 11px;
}
.publish-section-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: #59e6ce;
  background: rgba(24, 157, 139, 0.22);
}
.publish-link {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: #77b7de;
  font-size: 10px;
}
.publish-key-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0 19px 17px;
}
.publish-key-row input {
  height: 36px;
  padding: 0 11px;
  border: 1px solid #3a506c;
  border-radius: 7px;
  background: #101b29;
  color: #edf4ff;
  font-size: 11px;
}
.publish-save {
  border: 0;
  border-radius: 7px;
  background: linear-gradient(90deg, #52e4ca, #54efd3);
  color: #06241f;
  font-weight: 800;
  font-size: 11px;
}
.publish-clear {
  padding: 0 14px;
  border: 1px solid #6c4250;
  border-radius: 7px;
  background: #2a1a25;
  color: #ffb2c0;
  font-size: 11px;
}
.publish-test {
  padding: 0 14px;
  background: #18263a;
  color: #d7e3f1;
  border: 1px solid #405571;
}
.publish-credential {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 19px 14px;
  color: #bdeed0;
  font-size: 11px;
}
.publish-credential code {
  color: #8df2ae;
}
.publish-credential button {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: #ffadb9;
  font-size: 10px;
}
.publish-error {
  padding: 0 19px 12px;
  color: #fca5a5;
  font-size: 10px;
}
.publish-divider {
  height: 1px;
  background: rgba(108, 135, 167, 0.22);
}
.publish-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 0 19px 17px;
}
.publish-form-grid label,
.publish-field {
  position: relative;
  display: grid;
  gap: 6px;
}
.publish-form-grid label > span,
.publish-field > span {
  color: #c2ccdc;
  font-size: 11px;
  font-weight: 700;
}
.publish-form-grid em,
.publish-field em {
  color: #ff6d8f;
  font-style: normal;
}
.publish-field {
  padding: 0 19px 12px;
}
.publish-field input,
.publish-field textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #3a506c;
  border-radius: 7px;
  background: #101b29;
  color: #edf4ff;
  font-size: 11px;
  padding: 9px;
}
.publish-field textarea {
  resize: none;
}
.publish-field small {
  position: absolute;
  right: 24px;
  bottom: 18px;
  color: #7789a3;
  font-size: 10px;
}
.publish-tags {
  display: flex;
  gap: 7px;
  padding: 0 19px 15px;
  flex-wrap: wrap;
}
.publish-tags button {
  border: 1px solid rgba(95, 119, 151, 0.35);
  border-radius: 12px;
  padding: 4px 10px;
  background: #1b2a3d;
  color: #d5deeb;
  font-size: 10px;
}
.publish-tags button:last-child {
  border-style: dashed;
  color: #9fb2c9;
}
.publish-date {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 18px;
}
.publish-date input {
  flex: 0 0 55%;
}
.publish-date small {
  position: static;
  white-space: nowrap;
}
.publish-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 13px 19px;
  background: rgba(8, 16, 26, 0.5);
}
.publish-draft {
  height: 35px;
  padding: 0 14px;
  border: 1px solid #405571;
  border-radius: 7px;
  background: #152236;
  color: #d8e2ef;
  font-size: 11px;
}
.publish-next {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 30px;
  border: 0;
  border-radius: 7px;
  background: linear-gradient(90deg, #50ddc5, #50e8cb);
  color: #05251f;
  font-weight: 800;
  font-size: 12px;
}
.publish-right {
  display: grid;
  gap: 12px;
}
.publish-preview,
.publish-queue {
  padding: 0;
  overflow: hidden;
  background: linear-gradient(180deg, #101d2b, #0d1724);
  border-color: rgba(103, 143, 175, 0.28);
}
.publish-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 17px;
  border-bottom: 1px solid rgba(108, 135, 167, 0.22);
}
.publish-card-title h2 {
  margin: 0;
  font-size: 14px;
}
.publish-card-title p {
  margin: 4px 0 0;
  color: #8fa1ba;
  font-size: 10px;
}
.publish-live-dot {
  color: #4fe3c9;
  font-size: 20px;
}
.publish-preview-body {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  gap: 14px;
  padding: 14px;
}
.publish-phone {
  height: 292px;
  border-radius: 15px;
  overflow: hidden;
  background: #070d16;
  display: grid;
  place-items: center;
  color: #91a1b7;
  font-size: 10px;
  text-align: center;
}
.publish-phone video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.publish-info-card {
  border-radius: 10px;
  padding: 10px;
  background: rgba(26, 39, 57, 0.78);
  display: grid;
  align-content: start;
  gap: 9px;
}
.publish-info-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.publish-info-head h3 {
  margin: 0;
  font-size: 12px;
}
.publish-info-head button {
  border: 0;
  background: transparent;
  color: #aabbd0;
  font-size: 10px;
}
.publish-info-row {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr);
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid rgba(111, 136, 164, 0.18);
  font-size: 10px;
}
.publish-info-row span {
  color: #8ea0b8;
}
.publish-info-row strong {
  color: #dce6f2;
  font-weight: 500;
  line-height: 1.4;
}
.publish-count {
  font-size: 22px;
  color: #f2f8ff;
}
.publish-count small {
  font-size: 10px;
  color: #8fa1ba;
}
.publish-demo-queue {
  padding: 10px 14px;
  display: grid;
  gap: 4px;
}
.publish-demo-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto 18px 20px;
  gap: 9px;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid rgba(72, 98, 126, 0.24);
  border-radius: 8px;
  background: rgba(8, 17, 28, 0.58);
}
.publish-thumb {
  width: 30px;
  height: 34px;
  border-radius: 5px;
  background: linear-gradient(145deg, #d7c2b5, #877268);
}
.publish-demo-row strong,
.publish-demo-row small {
  display: block;
}
.publish-demo-row strong {
  font-size: 10px;
  color: #e6edf7;
}
.publish-demo-row small {
  margin-top: 3px;
  color: #7288a2;
  font-size: 9px;
}
.publish-demo-row span {
  padding: 4px 8px;
  border-radius: 10px;
  background: #263548;
  color: #b8c5d5;
  font-size: 9px;
}
.publish-demo-row .demo-0 {
  background: rgba(22, 155, 133, 0.24);
  color: #66e8d1;
}
.publish-demo-row .demo-2 {
  background: rgba(128, 66, 193, 0.4);
  color: #e2c2ff;
}
.publish-demo-row i {
  width: 54px;
  height: 4px;
  border-radius: 3px;
  background: linear-gradient(90deg, #50e2c5 68%, #223447 68%);
}
.publish-demo-row button {
  height: 23px;
  border: 1px solid #3e516a;
  border-radius: 5px;
  background: #182537;
  color: #c9d4e2;
  font-size: 9px;
}
.publish-demo-row b {
  color: #a6b5c8;
  font-size: 16px;
  font-weight: 400;
  text-align: center;
}
.publish-tag-input {
  height: 28px;
  width: 100px;
  padding: 0 8px;
  border: 1px solid #3bdbc5;
  border-radius: 8px;
  background: #101b29;
  color: #edf4ff;
  font-size: 10px;
}
.publish-tag-confirm,
.publish-tag-cancel {
  height: 28px;
  padding: 0 9px;
  border-radius: 8px;
  font-size: 10px;
}
.publish-tag-confirm {
  border: 1px solid #3bdbc5;
  background: #163b3b;
  color: #8cf3df;
}
.publish-tag-cancel {
  border: 1px solid #405571;
  background: #152236;
  color: #b9c6d7;
}
.publish-step-dialog {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(3, 8, 16, 0.72);
  backdrop-filter: blur(8px);
}
.publish-step-dialog__panel {
  width: min(620px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
  padding: 20px;
  border: 1px solid rgba(85, 220, 200, 0.28);
  border-radius: 16px;
  background: #111b2a;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
}
.publish-step-dialog__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.publish-step-dialog__head h2 {
  margin: 0;
  color: #f1f6ff;
  font-size: 20px;
}
.publish-step-dialog__head p {
  margin: 6px 0 0;
  color: #8fa1ba;
  font-size: 12px;
}
.publish-step-dialog__head button {
  border: 1px solid #405571;
  border-radius: 8px;
  background: #152236;
  color: #d8e2ef;
  padding: 7px 12px;
}
.publish-step-dialog__body {
  display: grid;
  gap: 12px;
  padding: 18px 0;
}
.publish-step-dialog__body .publish-field {
  padding: 0;
}
.publish-step-dialog__body .publish-field small {
  right: 4px;
}
.publish-step-dialog .dialog-actions {
  padding-top: 14px;
  border-top: 1px solid rgba(108, 135, 167, 0.22);
}
.publish-key-row input {
  flex: 1;
  min-width: 0;
}
.publish-key-row .publish-save,
.publish-key-row .publish-test,
.publish-key-row .publish-clear {
  min-height: 38px;
  white-space: nowrap;
  transition:
    transform 0.16s,
    filter 0.16s,
    box-shadow 0.16s;
}
.publish-key-row .publish-save {
  min-width: 118px;
  box-shadow: 0 8px 18px rgba(56, 213, 187, 0.18);
}
.publish-key-row .publish-save:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}
.publish-key-row .publish-test:hover,
.publish-key-row .publish-clear:hover {
  filter: brightness(1.12);
  transform: translateY(-1px);
}
@media (max-width: 1080px) {
  .publish-layout {
    grid-template-columns: 1fr;
  }
  .publish-right {
    grid-template-columns: 1fr 1fr;
  }
  .publish-phone {
    height: 250px;
  }
}
@media (max-width: 700px) {
  .publish-page-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .publish-head-actions {
    width: 100%;
  }
  .publish-head-actions button {
    flex: 1;
  }
  .publish-form-grid {
    grid-template-columns: 1fr;
  }
  .publish-date {
    align-items: stretch;
    flex-direction: column;
  }
  .publish-date input {
    flex-basis: auto;
  }
  .publish-right {
    grid-template-columns: 1fr;
  }
  .publish-preview-body {
    grid-template-columns: 130px minmax(0, 1fr);
  }
  .publish-phone {
    height: 220px;
  }
}
.publisher-stepper {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  margin: 2px 0 14px;
  border: 1px solid rgba(128, 145, 190, 0.18);
  border-radius: 12px;
  background: rgba(11, 19, 32, 0.74);
}
.publisher-step {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #7f8daf;
  font-size: 11px;
  font-weight: 700;
}
.publisher-step b {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #1a2638;
  color: #9eacd0;
  font-size: 11px;
}
.publisher-step.active {
  color: #70e2d0;
}
.publisher-step.active b {
  background: #32c8b1;
  color: #06151a;
  box-shadow: 0 0 0 4px rgba(50, 200, 177, 0.12);
}
.publisher-stepper > i {
  height: 1px;
  flex: 1;
  background: linear-gradient(
    90deg,
    rgba(103, 215, 196, 0.35),
    rgba(128, 145, 190, 0.12)
  );
}
.publisher-step {
  border: 0;
  cursor: pointer;
  padding: 0;
  background: transparent;
  font: inherit;
}
.publish-pick {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #405571;
  border-radius: 8px;
  background: #152236;
  color: #d8e2ef;
  font-size: 11px;
}
.publish-pick:hover {
  border-color: #50ddc5;
  color: #8cf3df;
}
.publisher-preview-strip {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  padding: 14px;
  margin-bottom: 14px;
  border: 1px solid rgba(128, 145, 190, 0.18);
  border-radius: 12px;
  background: linear-gradient(
    120deg,
    rgba(20, 29, 47, 0.9),
    rgba(12, 18, 31, 0.9)
  );
}
.publisher-preview-strip__phone {
  width: 150px;
  height: 180px;
  overflow: hidden;
  border-radius: 10px;
  background: #070d17;
  display: grid;
  place-items: center;
  color: #8190ad;
  font-size: 10px;
  text-align: center;
}
.publisher-preview-strip__phone video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.publisher-preview-strip__phone > div {
  display: grid;
  gap: 7px;
  place-items: center;
}
.publisher-preview-strip__info {
  display: grid;
  gap: 7px;
  min-width: 0;
}
.publisher-preview-strip__info h2 {
  margin: 0;
  font-size: 20px;
}
.publisher-preview-strip__info p {
  margin: 0;
  color: #9eacd0;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-preview-strip__info > div {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: #8290ad;
  font-size: 10px;
}
.publisher-preview-strip__info strong {
  color: #eef5ff;
  font-size: 11px;
  margin-right: 12px;
}
.publisher-overview {
  display: grid;
  gap: 18px;
  margin: 4px 0 16px;
}
.publisher-overview-title {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
}
.publisher-overview-title h1 {
  margin: 5px 0 0;
  font-size: 30px;
  line-height: 1.15;
}
.publisher-overview-title p {
  margin: 8px 0 0;
  color: #9eacd0;
  font-size: 12px;
}
.publisher-overview-actions {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
}
.publisher-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.publisher-stat {
  display: grid;
  gap: 5px;
  min-height: 82px;
  padding: 15px 16px;
  border: 1px solid rgba(128, 145, 190, 0.18);
  border-radius: 12px;
  background: linear-gradient(
    140deg,
    rgba(20, 29, 47, 0.88),
    rgba(12, 18, 31, 0.9)
  );
}
.publisher-stat span {
  color: #8290ad;
  font-size: 10px;
  font-weight: 700;
}
.publisher-stat strong {
  font-size: 24px;
  line-height: 1;
  color: #f5f8ff;
}
.publisher-stat small {
  color: #8e9aba;
  font-size: 10px;
}
.publisher-stat--status strong {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 16px;
}
.publisher-stat--status i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #64748b;
}
.publisher-stat--status i.ready {
  background: #4ade80;
  box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.13);
}
.publisher-select-button {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(128, 145, 190, 0.24);
  border-radius: 10px;
  background: rgba(8, 14, 26, 0.72);
  color: #f5f8ff;
  text-align: left;
  font-size: 12px;
}
.publisher-select-button span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-select-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.publisher-select-button:hover {
  border-color: rgba(103, 215, 196, 0.58);
}
.publisher-selector-dialog {
  width: min(680px, 100%);
}
.publisher-selector-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(128, 145, 190, 0.24);
  border-radius: 10px;
  background: rgba(8, 14, 26, 0.72);
  color: #7f8daf;
}
.publisher-selector-search input {
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: #f5f8ff;
  font-size: 12px;
}
.publisher-selector-search button {
  height: 30px;
  padding: 0 14px;
  border: 1px solid #2fd8c0;
  border-radius: 6px;
  background: #25d5bd;
  color: #06231f;
  font-size: 11px;
  font-weight: 700;
}
.publisher-design-error {
  position: fixed;
  top: 88px;
  left: 50%;
  z-index: 120;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(520px, calc(100vw - 32px));
  padding: 10px 14px;
  border: 1px solid rgba(244, 118, 118, 0.48);
  border-radius: 7px;
  background: #2a1720;
  color: #ffd8dd;
  font-size: 12px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.32);
  transform: translateX(-50%);
}
.publisher-option-grid {
  display: grid;
  gap: 8px;
  max-height: 52vh;
  overflow: auto;
  margin-top: 12px;
}
.publisher-option-card {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 58px;
  padding: 10px 12px;
  border: 1px solid rgba(111, 123, 170, 0.18);
  border-radius: 11px;
  background: rgba(18, 23, 38, 0.72);
  color: #eef5ff;
  text-align: left;
}
.publisher-option-card:hover {
  border-color: rgba(85, 223, 202, 0.55);
  background: rgba(19, 61, 58, 0.24);
}
.publisher-option-card strong,
.publisher-option-card small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-option-card small {
  margin-top: 4px;
  color: #9fb1d8;
  font-size: 10px;
}
.publisher-option-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 9px;
  background: rgba(106, 79, 209, 0.16);
  color: #bba2ff;
  overflow: hidden;
}
.publisher-option-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.publisher-option-card > span:nth-child(2) {
  min-width: 0;
  flex: 1;
}
.publisher-option-card {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
}
.publisher-option-card > span:nth-child(2),
.publisher-option-card > span:nth-child(2) strong,
.publisher-option-card > span:nth-child(2) small {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-option-check {
  color: #55dfca;
}
.publisher-filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.publisher-filter-pills button {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(128, 145, 190, 0.22);
  border-radius: 999px;
  background: rgba(8, 14, 26, 0.6);
  color: #aebbd5;
  font-size: 10px;
}
.publisher-filter-pills button.active {
  border-color: rgba(85, 223, 202, 0.62);
  background: rgba(19, 61, 58, 0.34);
  color: #d7fff5;
}
.publisher-published-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid rgba(74, 222, 128, 0.3);
  border-radius: 999px;
  background: rgba(22, 101, 52, 0.16);
  color: #8df2ae;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.publisher-picker-dialog {
  width: min(720px, 100%);
}
.publisher-picker-filter {
  display: grid;
  gap: 7px;
  color: #aab8d7;
  font-size: 11px;
  font-weight: 700;
}
.publisher-picker-filter select {
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(128, 145, 190, 0.24);
  border-radius: 10px;
  background: rgba(8, 14, 26, 0.72);
  color: #f5f8ff;
}
.publisher-picker-list {
  display: grid;
  gap: 8px;
  max-height: 52vh;
  overflow: auto;
}
.publisher-picker-row {
  display: grid;
  grid-template-columns: 24px 56px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 9px;
  border: 1px solid rgba(111, 123, 170, 0.18);
  border-radius: 11px;
  background: rgba(18, 23, 38, 0.72);
  color: #eef5ff;
  text-align: left;
}
.publisher-picker-row.selected {
  border-color: rgba(85, 223, 202, 0.7);
  background: rgba(19, 61, 58, 0.32);
}
.publisher-picker-row img {
  width: 56px;
  height: 70px;
  object-fit: cover;
  border-radius: 7px;
  background: #090e18;
}
.publisher-picker-row strong,
.publisher-picker-row span,
.publisher-picker-row small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-picker-row span,
.publisher-picker-row small {
  margin-top: 4px;
  color: #9fb1d8;
  font-size: 10px;
}
.publisher-picker-check {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid rgba(111, 123, 170, 0.35);
  border-radius: 6px;
  color: #55dfca;
}
.publisher-picker-empty {
  display: grid;
  place-items: center;
  min-height: 180px;
  color: #9fb1d8;
  font-size: 12px;
}
.publisher-config-card,
.publisher-queue-card {
  min-height: 540px;
  gap: 0;
  padding: 0;
  overflow: hidden;
  background: linear-gradient(
    180deg,
    rgba(20, 25, 42, 0.98),
    rgba(13, 18, 31, 0.98)
  );
  border-color: rgba(128, 145, 190, 0.22);
  box-shadow:
    0 16px 34px rgba(5, 9, 18, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
.publisher-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 22px 22px 18px;
  border-bottom: 1px solid rgba(128, 145, 190, 0.14);
}
.publisher-card-head h2 {
  margin: 5px 0 0;
  font-size: 22px;
  line-height: 1.2;
  letter-spacing: 0;
}
.publisher-card-head p {
  margin: 7px 0 0;
  color: #9eacd0;
  font-size: 12px;
  line-height: 1.5;
}
.publisher-eyebrow {
  color: #67d7c4;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.2px;
}
.publisher-connection-state {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.55);
  color: #aebbd5;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.publisher-connection-state.ready {
  border-color: rgba(74, 222, 128, 0.3);
  background: rgba(22, 101, 52, 0.16);
  color: #8df2ae;
}
.publisher-state-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #64748b;
  box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.12);
}
.publisher-connection-state.ready .publisher-state-dot {
  background: #4ade80;
  box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.14);
}
.publisher-section {
  display: grid;
  gap: 13px;
  padding: 19px 22px;
  border-bottom: 1px solid rgba(128, 145, 190, 0.12);
}
.publisher-section-title {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}
.publisher-section-title strong {
  font-size: 13px;
  color: #edf3ff;
}
.publisher-section-title small {
  margin-left: auto;
  color: #7f8daf;
  font-size: 10px;
  font-weight: 500;
}
.publisher-section-index {
  display: grid;
  place-items: center;
  width: 23px;
  height: 23px;
  border: 1px solid rgba(103, 215, 196, 0.35);
  border-radius: 7px;
  background: rgba(31, 117, 108, 0.16);
  color: #6ee7d4;
  font:
    700 10px ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
.publisher-key-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
}
.publisher-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 13px;
}
.publisher-form-grid label {
  display: grid;
  gap: 7px;
  min-width: 0;
}
.publisher-form-grid label > span {
  color: #aab8d7;
  font-size: 11px;
  font-weight: 700;
}
.publisher-form-grid input,
.publisher-form-grid select,
.publisher-key-row input {
  width: 100%;
  min-width: 0;
  height: 40px;
  box-sizing: border-box;
  padding: 0 12px;
  border: 1px solid rgba(128, 145, 190, 0.24);
  border-radius: 10px;
  background: rgba(8, 14, 26, 0.72);
  color: #f5f8ff;
  font-size: 12px;
  outline: none;
  transition:
    border-color 0.18s,
    box-shadow 0.18s,
    background 0.18s;
}
.publisher-form-grid input:focus,
.publisher-form-grid select:focus,
.publisher-key-row input:focus {
  border-color: rgba(103, 215, 196, 0.68);
  background: rgba(10, 22, 34, 0.86);
  box-shadow: 0 0 0 3px rgba(85, 223, 202, 0.1);
}
.publisher-form-grid select {
  appearance: auto;
}
.publisher-field-wide {
  grid-column: 1/-1;
}
.publisher-time-hint {
  align-self: end;
  padding: 0 2px 3px;
  color: #7f8daf;
  font-size: 10px;
  line-height: 1.45;
}
.publisher-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding: 18px 22px;
  background: rgba(8, 13, 24, 0.34);
}
.publisher-action-primary {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.publisher-action-primary button,
.publisher-action-bar > button {
  min-height: 38px;
}
.publisher-queue-head {
  align-items: center;
}
.publisher-queue-count {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  color: #f3f6ff;
  font-size: 24px;
  font-weight: 800;
  line-height: 1;
}
.publisher-queue-count small {
  color: #7f8daf;
  font-size: 10px;
  font-weight: 600;
}
.publisher-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 330px;
  padding: 28px;
  text-align: center;
  flex-direction: column;
  color: #f0f4ff;
}
.publisher-empty strong {
  font-size: 15px;
}
.publisher-empty > span {
  max-width: 230px;
  color: #8795b5;
  font-size: 11px;
  line-height: 1.5;
}
.publisher-empty-icon {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  margin-bottom: 3px;
  border: 1px solid rgba(103, 215, 196, 0.25);
  border-radius: 17px;
  background: rgba(31, 117, 108, 0.14);
  color: #6ee7d4;
}
.publisher-empty .ghost-button {
  margin-top: 4px;
}
.publisher-queue-list {
  display: grid;
  gap: 8px;
  padding: 16px 18px;
  overflow: auto;
  max-height: 440px;
}
.publisher-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 11px 12px;
  border: 1px solid rgba(128, 145, 190, 0.15);
  border-radius: 11px;
  background: rgba(9, 16, 29, 0.64);
}
.publisher-row-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: rgba(106, 79, 209, 0.16);
  color: #bba2ff;
}
.publisher-row-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.publisher-row-main strong,
.publisher-row-main span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-row-main strong {
  font-size: 12px;
  color: #eef3ff;
}
.publisher-row-main span {
  color: #8795b5;
  font-size: 10px;
}
.publisher-row-state {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid rgba(128, 145, 190, 0.22);
  border-radius: 999px;
  color: #aebbd5;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.publisher-row-state.state-published {
  border-color: rgba(74, 222, 128, 0.3);
  background: rgba(22, 101, 52, 0.16);
  color: #8df2ae;
}
.publisher-row-state.state-failed {
  border-color: rgba(248, 113, 113, 0.3);
  background: rgba(127, 29, 29, 0.16);
  color: #fecaca;
}
.publisher-row-error {
  grid-column: 2/-1;
  color: #fca5a5;
  font-size: 10px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.publisher-design-row-error {
  display: block;
  grid-column: 6/8;
  margin-top: 4px;
  color: #fca5a5;
  font-size: 10px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.publisher-credential-strip {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid rgba(74, 222, 128, 0.22);
  border-radius: 12px;
  background: rgba(22, 101, 52, 0.1);
  color: #bdeed0;
  font-size: 11px;
}
.publisher-credential-strip code {
  padding: 3px 7px;
  border-radius: 6px;
  background: rgba(5, 20, 14, 0.45);
  color: #8df2ae;
  font:
    11px ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
.publisher-credential-strip .ghost-button {
  min-height: 30px;
  padding: 0 10px;
  margin-left: auto;
}
.publisher-credential-strip .ghost-button + .ghost-button {
  margin-left: 0;
}
.publisher-sync-error {
  color: #fca5a5;
  font-size: 10px;
  line-height: 1.4;
}
.publisher-key-status {
  display: flex;
  align-items: center;
  gap: 8px;
  grid-column: 1/-1;
  min-height: 38px;
  color: #bdeed0;
  font-size: 11px;
}
.publisher-key-status code {
  color: #8df2ae;
  font:
    11px ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
@media (max-width: 1080px) {
  .publisher-panel {
    grid-template-columns: 1fr;
  }
  .publisher-config-card,
  .publisher-queue-card {
    min-height: 0;
  }
  .publisher-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 700px) {
  .publisher-stepper {
    gap: 5px;
    padding: 8px;
  }
  .publisher-step span {
    display: none;
  }
  .publisher-stepper > i {
    min-width: 8px;
  }
}
@media (max-width: 700px) {
  .publisher-card-head {
    padding: 18px 16px 15px;
    flex-direction: column;
  }
  .publisher-section {
    padding: 16px;
  }
  .publisher-section-title {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .publisher-section-title small {
    width: 100%;
    margin: 0 0 0 32px;
  }
  .publisher-key-row {
    grid-template-columns: 1fr 1fr;
  }
  .publisher-key-row input {
    grid-column: 1/-1;
  }
  .publisher-form-grid {
    grid-template-columns: 1fr;
  }
  .publisher-field-wide {
    grid-column: auto;
  }
  .publisher-action-bar {
    align-items: stretch;
    flex-direction: column;
    padding: 16px;
  }
  .publisher-action-primary {
    margin-left: 0;
  }
  .publisher-action-primary button,
  .publisher-action-bar > button {
    flex: 1;
  }
  .publisher-queue-list {
    padding: 12px;
  }
  .publisher-row {
    grid-template-columns: 30px minmax(0, 1fr);
  }
  .publisher-row-icon {
    width: 30px;
    height: 30px;
  }
  .publisher-row-state {
    grid-column: 2;
    justify-self: start;
  }
  .publisher-row-error {
    grid-column: 1/-1;
  }
}
@media (max-width: 700px) {
  .region-stage > img {
    max-height: 56vh;
  }
  .detail-shot {
    grid-template-columns: 1fr;
  }
  .detail-shot > img {
    width: 100%;
    height: auto;
    aspect-ratio: 9/16;
  }
  .detail-grid {
    grid-template-columns: 1fr;
  }
  .detail-grid .detail-wide {
    grid-column: auto;
  }
}
.publisher-quick-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid rgba(128, 145, 190, 0.18);
  border-radius: 12px;
  background: rgba(16, 23, 38, 0.72);
}
.publisher-music-search {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto minmax(180px, 1fr);
  gap: 8px;
  flex: 1;
}
.publisher-music-search input,
.publisher-music-search select {
  height: 36px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid rgba(128, 145, 190, 0.24);
  border-radius: 9px;
  background: rgba(8, 14, 26, 0.72);
  color: #eef5ff;
  font-size: 11px;
}
.publisher-music-search select {
  min-width: 0;
}
@media (max-width: 700px) {
  .publisher-quick-tools {
    align-items: stretch;
    flex-direction: column;
  }
  .publisher-music-search {
    grid-template-columns: 1fr;
  }
  .publisher-music-search button {
    width: 100%;
  }
}
@media (max-width: 700px) {
  .publisher-overview-title {
    align-items: stretch;
    flex-direction: column;
  }
  .publisher-overview-title h1 {
    font-size: 25px;
  }
  .publisher-overview-actions button {
    flex: 1;
  }
  .publisher-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.publisher-edit-dock {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid rgba(103, 215, 196, 0.25);
  border-radius: 12px;
  background: rgba(14, 39, 43, 0.35);
}
.publisher-edit-dock__title {
  font-size: 12px;
  font-weight: 700;
  color: #d7fff5;
}
.publisher-edit-dock__file {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #aebbd5;
  font-size: 11px;
}
@media (max-width: 700px) {
  .publisher-edit-dock {
    align-items: stretch;
    flex-direction: column;
  }
}
.publisher-api-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(128, 145, 190, 0.2);
  border-radius: 8px;
  background: rgba(8, 14, 26, 0.55);
  color: #aebbd5;
  font-size: 10px;
  white-space: nowrap;
}
.publisher-api-chip i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #64748b;
}
.publisher-api-chip i.ready {
  background: #4ade80;
}
.publisher-api-chip em {
  font-style: normal;
  color: #8d9db7;
}
.publisher-api-chip button {
  min-height: 24px !important;
  padding: 0 7px !important;
  border: 0;
  background: transparent;
  color: #67d7c4;
  font-size: 10px;
}
.publisher-credential-popover {
  display: flex;
  align-items: center;
  gap: 8px;
  align-self: end;
  margin: -4px 8px 0 auto;
  padding: 8px 10px;
  width: min(520px, 100%);
  box-sizing: border-box;
  border: 1px solid rgba(128, 145, 190, 0.24);
  border-radius: 9px;
  background: #101c2b;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
}
.publisher-credential-popover input {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 9px;
  border: 1px solid #304963;
  border-radius: 7px;
  background: #0b1522;
  color: #eef5ff;
  font-size: 10px;
}
.publisher-credential-modal {
  position: fixed;
  inset: 0;
  z-index: 260;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(3, 8, 16, 0.68);
  backdrop-filter: blur(12px);
}
.publisher-credential-modal__panel {
  width: min(460px, calc(100vw - 32px));
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--theme-accent, #32d8c0) 22%, var(--theme-border, #304963));
  border-radius: 18px;
  background: linear-gradient(180deg, var(--theme-panel-soft, #101b2a), var(--theme-panel, #0c1522));
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.48);
  color: var(--theme-text, #eef5ff);
}
.publisher-credential-modal__head {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 36px;
  align-items: start;
  gap: 12px;
  padding: 22px 22px 18px;
  border-bottom: 1px solid var(--theme-divider, rgba(128, 145, 190, 0.16));
}
.publisher-credential-modal__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--theme-accent-soft, rgba(50, 216, 192, 0.13));
  color: var(--theme-control-selected-text, #75f0dc);
}
.publisher-credential-modal__head h2 {
  margin: 1px 0 4px;
  font-size: 17px;
}
.publisher-credential-modal__head p {
  margin: 0;
  color: var(--theme-text-muted, #8fa1ba);
  font-size: 11px;
}
.publisher-credential-modal__close {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--theme-border-control, #304963);
  border-radius: 9px;
  background: var(--theme-control, #101f30);
  color: var(--theme-text-secondary, #c8d6e4);
}
.publisher-credential-modal__status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 22px 0;
  padding: 11px 12px;
  border: 1px solid rgba(255, 184, 91, 0.24);
  border-radius: 10px;
  background: rgba(117, 72, 28, 0.16);
}
.publisher-credential-modal__status.ready {
  border-color: rgba(70, 220, 176, 0.25);
  background: rgba(20, 103, 86, 0.16);
}
.publisher-credential-modal__status-dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: #f2b35e;
}
.publisher-credential-modal__status.ready .publisher-credential-modal__status-dot {
  background: #4ade80;
  box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.12);
}
.publisher-credential-modal__status strong,
.publisher-credential-modal__status small {
  display: block;
}
.publisher-credential-modal__status strong { font-size: 12px; }
.publisher-credential-modal__status small {
  margin-top: 3px;
  color: var(--theme-text-muted, #8fa1ba);
  font-size: 10px;
}
.publisher-credential-modal__field {
  display: grid;
  gap: 8px;
  margin: 20px 22px 0;
}
.publisher-credential-modal__field span {
  color: var(--theme-text-secondary, #c8d6e4);
  font-size: 11px;
  font-weight: 650;
}
.publisher-credential-modal__field input {
  width: 100%;
  box-sizing: border-box;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--theme-border-control, #304963);
  border-radius: 9px;
  outline: 0;
  background: var(--theme-input, #0b1522);
  color: var(--theme-text, #eef5ff);
}
.publisher-credential-modal__field input:focus {
  border-color: var(--theme-accent, #32d8c0);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent, #32d8c0) 16%, transparent);
}
.publisher-credential-modal__hint {
  margin: 9px 22px 0;
  color: var(--theme-text-muted, #8fa1ba);
  font-size: 10px;
}
.publisher-credential-modal__actions {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 8px;
  margin-top: 22px;
  padding: 14px 22px 18px;
  border-top: 1px solid var(--theme-divider, rgba(128, 145, 190, 0.16));
}
.publisher-credential-modal__actions button {
  min-height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 11px;
}
.publisher-credential-modal__danger {
  border: 1px solid rgba(255, 117, 117, 0.35);
  background: transparent;
  color: #ff9eaa;
}
.publisher-credential-modal__secondary {
  border: 1px solid var(--theme-border-control, #304963);
  background: var(--theme-control, #101f30);
  color: var(--theme-text-secondary, #c8d6e4);
}
.publisher-credential-modal__primary {
  border: 1px solid var(--theme-accent, #32d8c0);
  background: var(--theme-accent, #32d8c0);
  color: var(--theme-on-accent, #06231f);
  font-weight: 700;
}
@media (max-width: 560px) {
  .publisher-credential-modal__actions {
    grid-template-columns: 1fr 1fr;
  }
  .publisher-credential-modal__actions span { display: none; }
  .publisher-credential-modal__danger { grid-column: 1 / -1; }
}
.publisher-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  background: rgba(2, 7, 14, 0.48);
  backdrop-filter: blur(3px);
}
.publisher-drawer {
  display: flex;
  flex-direction: column;
  width: min(560px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 48px));
  background: var(--theme-panel, #0e1a29);
  border: 1px solid var(--theme-border-control, rgba(128, 145, 190, 0.28));
  border-radius: 16px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
  overflow: hidden;
}
.publisher-drawer-head,
.publisher-drawer-actions {
  flex: 0 0 auto;
}
.publisher-drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid rgba(128, 145, 190, 0.16);
}
.publisher-drawer-head strong,
.publisher-drawer-head small {
  display: block;
}
.publisher-drawer-head strong {
  font-size: 17px;
  color: #f1f6ff;
}
.publisher-drawer-tag-input {
  display: flex;
  gap: 7px;
}
.publisher-drawer-tag-input input {
  min-width: 0;
  flex: 1;
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--theme-border-control, #304963);
  border-radius: 7px;
  background: var(--theme-input, #0d1b2b);
  color: var(--theme-text, #eef5ff);
}
.publisher-drawer-tag-input button {
  min-width: 56px;
  border: 1px solid var(--theme-accent, #32d8c0);
  border-radius: 7px;
  background: var(--theme-accent, #32d8c0);
  color: var(--theme-on-accent, #ffffff);
}
.publisher-selector-overlay {
  z-index: 180 !important;
}
.publisher-precheck-status {
  color: var(--theme-text-muted, #8fa1ba);
  font-size: 11px;
  white-space: nowrap;
}
.publisher-precheck-status.is-passed { color: #45d7b8; }
.publisher-precheck-status.is-failed { color: #ff9ba5; }
.publisher-precheck-status.is-running { color: #f3c969; }
.publisher-precheck-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--theme-text-muted, #8fa1ba);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}
.publisher-precheck-toggle input {
  width: 14px;
  height: 14px;
  accent-color: var(--theme-accent, #32d8c0);
}
.publisher-design-api-chip {
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 8px 0 10px;
}
.publisher-design-api-chip button {
  min-width: 38px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid rgba(111, 123, 170, 0.28);
  border-radius: 6px;
  background: rgba(18, 27, 43, 0.9);
  color: #dce9f4;
  font-size: 10px;
}
.publisher-design-api-chip button:hover {
  border-color: rgba(85, 223, 202, 0.56);
  color: #75f0dc;
}
.publisher-selector-overlay .live-subtitle-dialog__panel {
  position: relative;
  z-index: 181;
}
.publisher-selector-dialog {
  box-sizing: border-box;
  min-width: 0;
  overflow-x: hidden;
}
.publisher-selector-dialog .publisher-selector-search,
.publisher-selector-dialog .publisher-option-grid {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.publisher-selector-dialog .publisher-option-grid {
  overflow-x: hidden;
}
.publisher-drawer-head small {
  margin-top: 5px;
  color: #8fa1ba;
  font-size: 11px;
}
.publisher-drawer-body {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  gap: 16px;
  padding: 18px 20px;
  overflow: auto;
  overflow-x: hidden;
}
.publisher-drawer-body .publisher-editor-field {
  display: grid;
  gap: 7px;
  min-width: 0;
}
.publisher-drawer,
.publisher-drawer-body,
.publisher-drawer-body .publisher-select-button,
.publisher-drawer-body .publisher-editor-field {
  box-sizing: border-box;
  min-width: 0;
}
.publisher-drawer-body .publisher-select-button {
  max-width: 100%;
  overflow: hidden;
}
.publisher-drawer-body .publisher-select-button span {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-drawer-check {
  display: flex !important;
  align-items: center;
  gap: 7px;
  color: #8fa1ba;
  font-size: 10px;
}
.publisher-drawer-check input,
.publisher-drawer-radios input {
  accent-color: #35d5bf;
}
.publisher-drawer-radios {
  display: grid;
  gap: 8px;
  color: #b8c6d8;
  font-size: 11px;
}
.publisher-drawer-radios label {
  display: flex;
  align-items: center;
  gap: 7px;
}
.publisher-drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid rgba(128, 145, 190, 0.16);
  margin-top: auto;
}
.publisher-drawer-actions .primary-button {
  min-height: 38px;
}
.publisher-drawer-body .publisher-editor-field input[type="datetime-local"] {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
.publish-mode .publisher-single-page,
.publish-mode .publisher-batch-workspace {
  display: none !important;
}
.publisher-design-page {
  height: calc(100vh - 24px);
  display: grid;
  grid-template-rows: 64px 48px 42px 48px minmax(0, 1fr);
  gap: 8px;
  padding: 8px;
  border: 1px solid rgba(64, 96, 126, 0.42);
  border-radius: 12px;
  background: #091522;
  color: #eef5ff;
  overflow: hidden;
}
.publisher-design-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 8px;
}
.publisher-design-title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.publisher-design-logo {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: linear-gradient(145deg, #1ecbb9, #146f7d);
  color: #d7fffa;
}
.publisher-design-title h1 {
  margin: 0;
  font-size: 22px;
}
.publisher-design-title p {
  margin: 4px 0 0;
  color: #8fa8bf;
  font-size: 11px;
}
.publisher-design-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.publisher-design-api {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid #27415a;
  border-radius: 8px;
  background: #0c1928;
  color: #c9d7e7;
  font-size: 11px;
}
.publisher-design-api i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #64748b;
}
.publisher-design-api i.ready {
  background: #35d5bf;
}
.publisher-design-api small {
  color: #8fa8bf;
}
.publisher-design-api button {
  border: 0;
  background: transparent;
  color: #6ce6d2;
  font-size: 11px;
}
.publisher-design-secondary,
.publisher-design-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 38px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 11px;
  white-space: nowrap;
}
.publisher-design-secondary {
  border: 1px solid #2d465f;
  background: #111f30;
  color: #dce7f3;
}
.publisher-design-primary {
  border: 1px solid #32d7c0;
  background: #1ed4c0;
  color: #06201f;
  font-weight: 700;
  box-shadow: 0 6px 18px rgba(31, 212, 192, 0.18);
}
.publisher-design-primary:disabled {
  opacity: 0.5;
}
.publisher-design-stats {
  display: flex;
  border-top: 1px solid rgba(64, 96, 126, 0.35);
  border-bottom: 1px solid rgba(64, 96, 126, 0.35);
}
.publisher-design-stats > div {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  padding: 0 14px;
  border-right: 1px solid rgba(64, 96, 126, 0.35);
  color: #90a7bd;
  font-size: 11px;
}
.publisher-design-stats > div:last-child {
  border-right: 0;
}
.publisher-design-stats strong {
  margin-left: 4px;
  color: #f4f8ff;
  font-size: 16px;
}
.publisher-design-stats .active,
.publisher-design-stats .active strong {
  color: #32dbc3;
}
.publisher-design-filters {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 130px 130px 120px auto auto;
  gap: 8px;
}
.publisher-design-filters select,
.publisher-design-filters button,
.publisher-design-search {
  height: 36px;
  border: 1px solid #29425a;
  border-radius: 7px;
  background: #0d1928;
  color: #dbe7f4;
  font-size: 11px;
}
.publisher-design-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
}
.publisher-design-search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #fff;
}
.publisher-design-filters button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 12px;
}
.publisher-design-selection {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border: 1px solid rgba(55, 211, 190, 0.35);
  border-radius: 8px;
  background: #0e2230;
}
.publisher-design-selection > span {
  display: flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
  color: #d8e8f3;
  font-size: 11px;
}
.publisher-design-selection > div {
  display: flex;
  gap: 6px;
  flex: 1;
}
.publisher-design-selection button:not(.publisher-design-primary) {
  height: 30px;
  padding: 0 10px;
  border: 1px solid #29465f;
  border-radius: 6px;
  background: #132538;
  color: #c7d6e6;
  font-size: 10px;
}
.publisher-design-workspace {
  display: grid;
  grid-template-columns: minmax(0, 3fr) 360px;
  gap: 8px;
  min-height: 0;
}
.publisher-design-list {
  display: grid;
  grid-template-rows: 40px minmax(0, 1fr) 38px;
  min-width: 0;
  min-height: 0;
  border: 1px solid rgba(64, 96, 126, 0.42);
  border-radius: 9px;
  overflow: hidden;
  background: #091522;
}
.publisher-design-list-head,
.publisher-design-row {
  display: grid;
  grid-template-columns:
    42px minmax(150px, 1.25fr) minmax(120px, 1fr) minmax(120px, 1fr)
    108px 112px 88px;
  gap: 8px;
  align-items: center;
}
.publisher-design-list-head {
  padding: 0 10px;
  background: #102236;
  color: #87a5c1;
  font-size: 10px;
}
.publisher-design-rows {
  min-height: 0;
  overflow: auto;
  padding: 4px;
}
.publisher-design-row {
  min-height: 72px;
  margin-bottom: 4px;
  padding: 6px 8px;
  border: 1px solid rgba(56, 91, 121, 0.42);
  border-radius: 8px;
  background: #0b1a29;
  font-size: 10px;
}
.publisher-design-row > label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.publisher-design-row input[type="checkbox"] {
  accent-color: #30ddc4;
}
.publisher-design-video {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.publisher-design-thumb {
  position: relative;
  width: 40px;
  height: 54px;
  flex: none;
  overflow: hidden;
  border-radius: 6px;
  background: #1b2e44;
}
.publisher-design-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.publisher-design-thumb small {
  position: absolute;
  right: 2px;
  bottom: 2px;
  padding: 1px 3px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 8px;
}
.publisher-design-video strong,
.publisher-design-video span > small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-design-video strong {
  color: #edf5ff;
  font-size: 11px;
}
.publisher-design-video span > small {
  margin-top: 4px;
  color: #8098af;
  font-size: 9px;
}
.publisher-design-title-cell {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.publisher-design-title-cell span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #dbe7f2;
}
.publisher-design-title-cell button,
.publisher-design-row-actions button {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid #2e4862;
  border-radius: 6px;
  background: #102237;
  color: #aec0d1;
}
.publisher-design-product {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  border: 0;
  background: transparent;
  color: #dbe7f2;
  text-align: left;
  font-size: 10px;
}
.publisher-design-product span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-design-product-thumb {
  display: grid;
  place-items: center;
  width: 30px;
  height: 38px;
  flex: none;
  border-radius: 5px;
  background: #1d334b;
  color: #8ea7bc;
}
.publisher-design-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}
.publisher-design-tags span,
.publisher-design-tags b {
  padding: 4px 6px;
  border-radius: 10px;
  background: #172d44;
  color: #bdd0e2;
  font-size: 9px;
  white-space: nowrap;
}
.publisher-design-tags b {
  background: #223a55;
}
.publisher-design-tags .publisher-design-tags-empty {
  background: transparent;
  color: #71869a;
}
.publisher-design-time {
  color: #9bb1c5;
  line-height: 1.35;
}
.publisher-design-state {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  padding: 0 4px;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #bdcddd;
}
.publisher-design-state:hover {
  color: #f0f8ff;
}
.publisher-design-state i {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #f5c542;
}
.publisher-design-state.state-published {
  color: #4fe0c5;
}
.publisher-design-state.state-published i {
  background: #29d9b9;
}
.publisher-design-state.state-failed,
.publisher-design-state.state-result_unknown {
  color: #ff9b9b;
}
.publisher-design-state.state-failed i,
.publisher-design-state.state-result_unknown i {
  background: #f06d77;
}
.publisher-design-state.state-draft {
  color: #b6c6d8;
}
.publisher-design-row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  gap: 5px;
}
.publisher-design-row-actions button {
  border: 0;
  background: transparent;
}
.publisher-design-pager {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  color: #829ab2;
  font-size: 10px;
}
.publisher-design-pager button,
.publisher-design-pager select {
  height: 30px;
  border: 1px solid #29445d;
  border-radius: 6px;
  background: #0f2031;
  color: #c7d6e5;
}
.publisher-design-pager button {
  width: 30px;
  display: grid;
  place-items: center;
}
.publisher-design-pager button.active {
  border-color: #2fd8c0;
  background: #123e3d;
  color: #58e7d1;
}
.publisher-design-pager__ellipsis,
.publisher-single-pager__ellipsis {
  display: inline-grid;
  width: 20px;
  height: 30px;
  place-items: center;
  color: #829ab2;
  letter-spacing: 0;
}
.publisher-design-pager select {
  margin-left: 8px;
  padding: 0 8px;
}
.publisher-design-pager span {
  margin-left: auto;
}
.publisher-design-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 14px;
  border: 1px solid rgba(64, 96, 126, 0.42);
  border-radius: 9px;
  background: #0b1a29;
  overflow: auto;
}
.publisher-design-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(64, 96, 126, 0.3);
}
.publisher-design-editor-head > div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.publisher-design-editor-head h2 {
  margin: 0;
  font-size: 16px;
}
.publisher-design-editor-head p {
  margin: 4px 0 0;
  color: #8fa8bf;
  font-size: 10px;
}
.publisher-design-preview {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 12px 0;
}
.publisher-design-preview-thumb {
  width: 42px;
  height: 52px;
  overflow: hidden;
  border-radius: 5px;
  background: #1b2e44;
}
.publisher-design-preview-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.publisher-design-preview > span {
  padding: 12px 8px;
  border-radius: 5px;
  background: #13283e;
  color: #b9ccdd;
  font-size: 11px;
}
.publisher-design-preview button {
  margin-left: auto;
  height: 30px;
  padding: 0 12px;
  border: 1px solid #2c4963;
  border-radius: 6px;
  background: #102237;
  color: #dbe7f2;
  font-size: 10px;
}
.publisher-design-hint {
  margin: 2px 0 10px;
  color: #d7e4ef;
  font-size: 11px;
}
.publisher-design-hint small {
  margin-left: 5px;
  color: #7f98ae;
  font-size: 9px;
}
.publisher-design-check {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  color: #d4e1ec;
  font-size: 11px;
  border-top: 1px solid rgba(64, 96, 126, 0.18);
}
.publisher-design-check input {
  accent-color: #32d8c0;
}
.publisher-design-field {
  display: grid;
  gap: 6px;
  padding: 4px 0 8px;
}
.publisher-design-field input,
.publisher-design-field textarea,
.publisher-design-select {
  width: 100%;
  box-sizing: border-box;
  min-height: 34px;
  padding: 0 9px;
  border: 1px solid #2b4862;
  border-radius: 6px;
  background: #0d1b2b;
  color: #eef5ff;
  font-size: 10px;
}
.publisher-design-field textarea {
  padding-top: 8px;
  resize: vertical;
}
.publisher-design-field small {
  color: #7f98ae;
  font-size: 9px;
}
.publisher-sequence-interval {
  display: grid;
  grid-template-columns: auto 72px auto;
  align-items: center;
  justify-content: start;
  gap: 8px;
  color: #96abc0;
  font-size: 10px;
}
.publisher-sequence-interval input {
  min-height: 30px;
}
.publisher-design-radio {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: #96abc0;
  font-size: 9px;
}
.publisher-design-radio label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.publisher-design-tags.editor {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.publisher-design-tags.editor button {
  padding: 5px 7px;
  border: 1px solid #29445d;
  border-radius: 6px;
  background: #14283c;
  color: #c8d7e5;
  font-size: 9px;
}
.publisher-design-select {
  display: flex;
  align-items: center;
  gap: 7px;
  justify-content: flex-start;
}
.publisher-design-apply {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid rgba(64, 96, 126, 0.3);
}
.publisher-design-apply button:first-child {
  width: 88px;
  height: 40px;
  border: 1px solid #2b4862;
  border-radius: 7px;
  background: #102133;
  color: #d4e1ec;
}
.publisher-design-apply .publisher-design-primary {
  flex: 1;
}
.publish-mode .publisher-single-main {
  grid-template-columns: minmax(0, 3fr) minmax(320px, 1fr) !important;
}
.publish-mode .publisher-single-stats {
  display: flex !important;
  gap: 0 !important;
  min-height: 52px !important;
  border-bottom: 1px solid rgba(74, 107, 139, 0.24);
  background: transparent !important;
}
.publish-mode .publisher-single-stats > div {
  flex: 1;
  min-height: 52px !important;
  border: 0 !important;
  border-right: 1px solid rgba(74, 107, 139, 0.24) !important;
  border-radius: 0 !important;
  background: transparent !important;
  padding: 0 14px !important;
}
.publish-mode .publisher-single-stats > div:last-child {
  border-right: 0 !important;
}
.publish-mode .publisher-single-stats > div.selected {
  color: #61e6d0 !important;
}
.publish-mode .publisher-single-filters {
  grid-template-columns:
    minmax(180px, 1.5fr)
    130px 130px 120px 110px auto auto !important;
  display: grid !important;
}
.publish-mode .publisher-single-list-head,
.publish-mode .publisher-single-row {
  grid-template-columns:
    38px minmax(150px, 1.2fr) 48px minmax(120px, 1fr)
    minmax(120px, 1fr) 96px 108px 64px 64px !important;
}
.publish-mode .publisher-single-row {
  min-height: 72px !important;
}
.publish-mode .publisher-single-row > input {
  height: 32px !important;
}
.publish-mode .publisher-single-edit {
  border-left: 1px solid rgba(74, 107, 139, 0.24);
  border-top: 0;
  border-right: 0;
  border-bottom: 0;
  border-radius: 0;
  background: #0b1725 !important;
}
.publish-mode .publisher-single-edit-head {
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(74, 107, 139, 0.2);
}
.publish-mode .publisher-edit-tabs button {
  font-size: 10px;
}
.publish-mode .publisher-single-row > input {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  color: #dbe8f5 !important;
}
.publish-mode .publisher-single-row > input:hover,
.publish-mode .publisher-single-row > input:focus {
  background: #0b1522 !important;
  border-color: #304963 !important;
  padding-left: 8px !important;
  padding-right: 8px !important;
}
.publish-mode .publisher-single-page {
  background: #091522 !important;
  border-color: rgba(64, 96, 126, 0.42) !important;
  gap: 8px !important;
  padding: 8px !important;
}
.publish-mode .publisher-single-head {
  min-height: 62px !important;
  padding: 2px 8px !important;
}
.publish-mode .publisher-single-icon {
  width: 42px !important;
  height: 42px !important;
  border-radius: 10px !important;
}
.publish-mode .publisher-single-brand h1 {
  font-size: 22px !important;
  letter-spacing: -0.3px;
}
.publish-mode .publisher-single-head-actions {
  gap: 8px !important;
}
.publish-mode .publisher-single-head-actions > .toolbar-button,
.publish-mode .publisher-single-head-actions > .primary-button {
  height: 38px !important;
  min-height: 38px !important;
  border-radius: 8px !important;
}
.publish-mode .publisher-single-stats {
  height: 48px !important;
  min-height: 48px !important;
  display: flex !important;
  align-items: stretch !important;
  border-top: 1px solid rgba(64, 96, 126, 0.32) !important;
  border-bottom: 1px solid rgba(64, 96, 126, 0.32) !important;
}
.publish-mode .publisher-single-stats > div {
  height: 48px !important;
  min-height: 48px !important;
  justify-content: flex-start !important;
  gap: 8px !important;
  padding: 0 14px !important;
  color: #9bb0c6 !important;
}
.publish-mode .publisher-single-stats > div.selected {
  color: #39e1c7 !important;
}
.publish-mode .publisher-single-stats span {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  font-size: 11px !important;
  color: inherit !important;
}
.publish-mode .publisher-single-stats strong {
  font-size: 16px !important;
  color: #f1f7ff !important;
}
.publish-mode .publisher-single-filters {
  height: 42px !important;
  min-height: 42px !important;
  gap: 8px !important;
}
.publish-mode .publisher-single-filters select,
.publish-mode .publisher-search,
.publish-mode .publisher-single-filters button {
  height: 36px !important;
  min-height: 36px !important;
  border-radius: 7px !important;
}
.publish-mode .publisher-single-main {
  grid-template-columns: minmax(0, 3fr) 360px !important;
  gap: 8px !important;
}
.publish-mode .publisher-single-list {
  border-color: rgba(64, 96, 126, 0.42) !important;
  border-radius: 9px !important;
}
.publish-mode .publisher-single-list-head {
  min-height: 40px !important;
  background: #102236 !important;
  color: #87a5c1 !important;
}
.publish-mode .publisher-single-row {
  min-height: 72px !important;
  margin-bottom: 4px !important;
  padding: 6px 8px !important;
  border-color: rgba(56, 91, 121, 0.42) !important;
  border-radius: 8px !important;
  background: #0b1a29 !important;
}
.publish-mode .publisher-single-row > input {
  background: transparent !important;
  border: 1px solid transparent !important;
  box-shadow: none !important;
  color: #e5eef9 !important;
}
.publish-mode .publisher-single-edit {
  display: flex !important;
  width: 360px !important;
  max-width: 360px !important;
  min-width: 360px !important;
  padding: 14px !important;
  border: 1px solid rgba(64, 96, 126, 0.42) !important;
  border-radius: 9px !important;
  background: #0b1a29 !important;
}
.publish-mode .publisher-single-edit-head strong {
  font-size: 16px !important;
}
.publish-mode .publisher-single-edit-head small {
  font-size: 11px !important;
}
.publish-mode .publisher-edit-preview video {
  width: 52px !important;
  height: 64px !important;
}
.publish-mode .publisher-single-toolbar {
  min-height: 48px !important;
  padding: 6px 8px !important;
  border-radius: 8px !important;
  background: #0e2230 !important;
  border-color: rgba(55, 211, 190, 0.34) !important;
}
.publisher-design-radio label,
.publisher-drawer-radios label {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}
.publisher-design-radio input[type="radio"],
.publisher-drawer-radios input[type="radio"] {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  min-width: 1px !important;
  min-height: 1px !important;
  margin: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
.publisher-design-radio label::before,
.publisher-drawer-radios label::before {
  content: "";
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  border: 1px solid #70849a;
  border-radius: 50%;
  background: #0d1b2b;
  box-shadow: none;
}
.publisher-design-radio label:has(input[type="radio"]:checked)::before,
.publisher-drawer-radios label:has(input[type="radio"]:checked)::before {
  border-color: #32d8c0 !important;
  background: radial-gradient(circle, #32d8c0 0 3px, #0d1b2b 4px) !important;
}
.publisher-design-radio label:has(input[type="radio"]:checked),
.publisher-drawer-radios label:has(input[type="radio"]:checked) {
  color: #dce9f4;
}
.publisher-design-radio input[type="radio"]:focus-visible,
.publisher-drawer-radios input[type="radio"]:focus-visible {
  outline: 0;
}
.publisher-design-radio label:has(input[type="radio"]:focus-visible)::before,
.publisher-drawer-radios label:has(input[type="radio"]:focus-visible)::before {
  outline: 2px solid rgba(50, 216, 192, 0.45);
  outline-offset: 2px;
}
.publisher-design-check input[type="checkbox"],
.publisher-drawer-check input[type="checkbox"] {
  width: 14px !important;
  height: 14px !important;
  min-width: 14px !important;
  min-height: 14px !important;
  margin: 0;
}
.publisher-design-page ~ .publisher-drawer-backdrop {
  display: none !important;
}
.publish-mode {
  overflow: hidden !important;
}
.publish-mode .publisher-design-page {
  height: calc(100vh - 104px) !important;
  max-height: calc(100vh - 104px) !important;
  min-height: 0 !important;
  overflow: hidden !important;
}
.publish-mode .publisher-design-page {
  display: flex !important;
  flex-direction: column !important;
}
.publish-mode .publisher-design-head,
.publish-mode .publisher-design-stats,
.publish-mode .publisher-design-filters,
.publish-mode .publisher-design-selection {
  flex: none !important;
}
.publish-mode .publisher-design-workspace {
  display: grid !important;
  flex: 1 1 auto !important;
  height: auto !important;
  min-height: 0 !important;
}
.publish-mode .publisher-design-list {
  display: grid !important;
  height: 100% !important;
  min-height: 0 !important;
}
.publish-mode .publisher-design-editor {
  display: flex !important;
  height: 100% !important;
  min-height: 0 !important;
}
.publish-mode .publisher-design-editor {
  position: relative !important;
  padding-bottom: 72px !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
}
.publish-mode .publisher-design-apply {
  position: absolute !important;
  left: 14px !important;
  right: 14px !important;
  bottom: 0 !important;
  margin: 0 !important;
  padding: 12px 0 !important;
  background: #0b1a29 !important;
  z-index: 5 !important;
}
.publish-mode .publisher-design-editor-head,
.publish-mode .publisher-design-preview,
.publish-mode .publisher-design-hint,
.publish-mode .publisher-design-check,
.publish-mode .publisher-design-field {
  flex: none !important;
}
.publish-mode .publisher-design-editor .publisher-design-apply {
  flex: none !important;
  position: sticky !important;
  bottom: 0 !important;
}
.publish-mode .publisher-design-workspace {
  min-height: 0 !important;
  height: auto !important;
  overflow: hidden !important;
}
.publish-mode .publisher-design-list,
.publish-mode .publisher-design-editor {
  min-height: 0 !important;
  height: 100% !important;
  max-height: 100% !important;
}
.publish-mode .publisher-design-editor {
  overflow: hidden !important;
}
.publish-mode .publisher-design-editor > *:not(.publisher-design-apply) {
  flex-shrink: 0;
}
.publish-mode .publisher-design-apply {
  position: sticky;
  bottom: 0;
  background: #0b1a29;
  z-index: 3;
}
.publish-mode .publisher-design-rows {
  min-height: 0 !important;
  overflow-y: auto !important;
}
.tiktok-page.publish-mode {
  height: calc(100vh - 76px) !important;
  min-height: 0 !important;
  padding: 8px 10px !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}
.publish-mode .publisher-design-page {
  height: 100% !important;
  max-height: none !important;
  min-height: 0 !important;
  margin: 0 !important;
}
.publish-mode .publisher-design-workspace {
  min-height: 0 !important;
  overflow: hidden !important;
}
.publish-mode .publisher-design-list {
  min-height: 0 !important;
}
.publish-mode .publisher-design-editor {
  min-height: 0 !important;
}
.publisher-design-page {
  position: relative;
  z-index: 2;
}
.publisher-design-workspace {
  min-height: 420px !important;
  height: auto !important;
}
.publisher-design-list,
.publisher-design-editor {
  min-height: 420px !important;
}
.publisher-design-rows {
  min-height: 320px !important;
}
.publisher-editor-preview-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #2c4963;
  border-radius: 7px;
  background: #102237;
  color: #dbe7f2;
  font-size: 10px;
}
.publisher-editor-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 0 -6px 8px;
  border-radius: 6px;
  background: #10243a;
}
.publisher-editor-tabs button {
  height: 34px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #8fa7bd;
  font-size: 11px;
}
.publisher-editor-tabs button.active {
  border-bottom-color: #2fe0c5;
  color: #39e7cd;
}
.publisher-editor-apply-mode {
  display: grid;
  gap: 8px;
  margin-top: 8px;
  padding: 12px 0 8px;
  border-top: 1px solid rgba(64, 96, 126, 0.3);
}
.publisher-editor-apply-mode > strong {
  font-size: 11px;
  color: #d8e5ef;
}
.publish-mode .publisher-design-editor {
  padding-bottom: 76px !important;
}
.publish-mode .publisher-design-editor {
  padding-bottom: 14px !important;
  overflow-y: auto !important;
}
.publish-mode .publisher-design-apply {
  position: static !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  margin-top: 12px !important;
  flex-shrink: 0 !important;
}
.publish-mode .publisher-design-apply {
  display: grid !important;
  grid-template-columns: 80px 96px minmax(0, 1fr) !important;
  gap: 8px !important;
  left: 8px !important;
  right: 8px !important;
  padding: 10px 0 !important;
}
.publish-mode .publisher-design-apply > button {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  box-sizing: border-box !important;
  width: auto !important;
  height: 40px !important;
  min-height: 40px !important;
  min-width: 0 !important;
  padding: 0 8px !important;
  border: 1px solid #2b4862;
  border-radius: 7px;
  background: #102133;
  color: #d4e1ec;
  font-size: 11px !important;
  font-weight: 600 !important;
  line-height: 1 !important;
  box-shadow: none !important;
  white-space: nowrap;
}
.publish-mode .publisher-design-apply > button:hover {
  border-color: #426681;
  background: #14283b;
}
.publish-mode .publisher-design-apply .publisher-submit-button {
  border-color: #2fe0c5 !important;
  background: #28dac3 !important;
  color: #061e1d !important;
  font-weight: 700 !important;
}
.publish-mode .publisher-design-apply .publisher-submit-button:hover {
  border-color: #53ead5 !important;
  background: #3ce1ca !important;
}
.publish-mode .publisher-design-apply .publisher-submit-button:disabled {
  opacity: 0.45;
}
.publish-mode .publisher-design-apply .publisher-submit-button {
  min-width: 150px !important;
  width: auto !important;
  height: 36px !important;
  min-height: 36px !important;
  padding: 0 14px !important;
  border-radius: 8px !important;
  font-size: 12px !important;
  gap: 6px !important;
  box-shadow: none !important;
}
.publish-mode .publisher-editor-tabs-single {
  min-height: 34px !important;
  border-bottom: 1px solid rgba(86, 112, 139, 0.28) !important;
}
.publish-mode .publisher-editor-tabs-single span {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 4px;
  color: #72e0cb;
  font-size: 12px;
  font-weight: 700;
}
.publish-mode .publisher-schedule-input {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  margin-top: 8px;
  padding: 0 10px;
  border: 1px solid rgba(86, 112, 139, 0.42);
  border-radius: 7px;
  background: #0d1a28;
  color: #72e0cb;
}
.publish-mode .publisher-schedule-input input[type="datetime-local"] {
  flex: 1;
  min-width: 0;
  height: 32px;
  border: 0;
  background: transparent;
  color: #e5eef6;
  color-scheme: dark;
  font-size: 12px;
}
.publish-mode .publisher-schedule-input input[type="datetime-local"]:focus {
  outline: none;
}
.publisher-delete-modal {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(3, 8, 15, 0.72);
  backdrop-filter: blur(8px);
}
.publisher-confirm-modal {
  position: fixed;
  inset: 0;
  z-index: 121;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(2, 8, 16, 0.76);
  backdrop-filter: blur(10px);
}
.publisher-confirm-modal__panel {
  position: relative;
  width: min(480px, 100%);
  overflow: hidden;
  padding: 26px;
  border: 1px solid rgba(84, 224, 204, 0.32);
  border-radius: 20px;
  background: linear-gradient(145deg, #142c40 0%, #0a1727 72%);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.52), 0 0 0 1px rgba(91, 231, 211, 0.07);
}
.publisher-confirm-modal__glow {
  position: absolute;
  top: -90px;
  right: -50px;
  width: 210px;
  height: 180px;
  border-radius: 50%;
  background: rgba(63, 214, 192, 0.16);
  filter: blur(34px);
  pointer-events: none;
}
.publisher-confirm-modal__icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin-bottom: 18px;
  border: 1px solid rgba(101, 237, 215, 0.36);
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(47, 189, 169, 0.28), rgba(25, 94, 103, 0.18));
  color: #72f2dc;
}
.publisher-confirm-modal__content {
  position: relative;
}
.publisher-confirm-modal__eyebrow {
  margin-bottom: 7px;
  color: #5ee3cc;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
}
.publisher-confirm-modal__content h3 {
  margin: 0;
  color: #f4fbff;
  font-size: 21px;
  font-weight: 750;
}
.publisher-confirm-modal__content p {
  margin: 10px 0 16px;
  color: #b7c9d9;
  font-size: 13px;
  line-height: 1.65;
}
.publisher-confirm-modal__content p strong {
  color: #75f0dc;
  font-size: 16px;
}
.publisher-confirm-modal__notice {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 12px;
  border: 1px solid rgba(94, 157, 177, 0.24);
  border-radius: 10px;
  background: rgba(8, 24, 38, 0.56);
  color: #91aec1;
  font-size: 11px;
  line-height: 1.5;
}
.publisher-confirm-modal__notice svg {
  flex: 0 0 auto;
  margin-top: 1px;
  color: #6ce6d0;
}
.publisher-confirm-modal__actions {
  position: relative;
  display: flex;
  gap: 10px;
  margin-top: 24px;
}
.publisher-confirm-modal__actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex: 1;
  height: 40px;
  border: 1px solid rgba(109, 140, 163, 0.42);
  border-radius: 9px;
  background: rgba(25, 43, 61, 0.86);
  color: #d5e3ed;
  font-size: 12px;
  font-weight: 700;
  transition: 0.18s ease;
}
.publisher-confirm-modal__actions button:hover {
  border-color: rgba(112, 232, 211, 0.6);
  background: rgba(35, 62, 79, 0.96);
}
.publisher-confirm-modal__actions button.primary {
  border-color: rgba(99, 239, 216, 0.72);
  background: linear-gradient(135deg, #32bda9, #198c91);
  color: #f3fffd;
  box-shadow: 0 8px 22px rgba(24, 166, 151, 0.24);
}
.publisher-confirm-modal__actions button.primary:hover {
  background: linear-gradient(135deg, #43d7bf, #20a2a0);
  transform: translateY(-1px);
}
.publisher-delete-modal__panel {
  width: min(420px, 100%);
  padding: 22px;
  border: 1px solid rgba(104, 132, 160, 0.42);
  border-radius: 16px;
  background: linear-gradient(155deg, #13283b 0%, #0b1725 100%);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.44), 0 0 0 1px rgba(50, 224, 196, 0.08);
}
.publisher-delete-modal__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  margin-bottom: 14px;
  border: 1px solid rgba(255, 112, 112, 0.36);
  border-radius: 12px;
  background: rgba(180, 52, 62, 0.16);
  color: #ff8585;
}
.publisher-delete-modal__content h3 {
  margin: 0;
  color: #f3f7fb;
  font-size: 17px;
  font-weight: 700;
}
.publisher-delete-modal__content p {
  margin: 8px 0 6px;
  color: #b9c8d7;
  font-size: 13px;
  line-height: 1.6;
}
.publisher-delete-modal__content small {
  display: block;
  overflow: hidden;
  color: #78dbc9;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-delete-modal__actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}
.publisher-delete-modal__actions button {
  flex: 1;
  height: 38px;
  border: 1px solid rgba(100, 127, 153, 0.45);
  border-radius: 8px;
  background: #172537;
  color: #d9e5ef;
  font-size: 13px;
  font-weight: 650;
}
.publisher-delete-modal__actions button:hover {
  border-color: rgba(123, 224, 207, 0.65);
  background: #1c3045;
}
.publisher-delete-modal__actions button.danger {
  border-color: rgba(255, 112, 112, 0.68);
  background: #b84552;
  color: #fff;
}
.publisher-delete-modal__actions button.danger:hover {
  background: #d25864;
}
.publisher-status-modal {
  position: fixed;
  inset: 0;
  z-index: 122;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(3, 8, 15, 0.68);
  backdrop-filter: blur(7px);
}
.publisher-status-modal__panel {
  width: min(440px, 100%);
  max-height: min(620px, 90vh);
  overflow: auto;
  padding: 20px;
  border: 1px solid rgba(93, 143, 166, 0.42);
  border-radius: 14px;
  background: #102235;
  box-shadow: 0 24px 74px rgba(0, 0, 0, 0.48);
}
.publisher-status-modal__header {
  display: flex;
  align-items: center;
  gap: 11px;
}
.publisher-status-modal__icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid rgba(112, 229, 208, 0.3);
  border-radius: 10px;
  background: rgba(35, 157, 143, 0.16);
  color: #72e7d1;
}
.publisher-status-modal__icon.state-failed,
.publisher-status-modal__icon.state-result_unknown {
  border-color: rgba(255, 126, 126, 0.36);
  background: rgba(180, 52, 62, 0.16);
  color: #ff9696;
}
.publisher-status-modal__icon.state-draft {
  border-color: rgba(126, 163, 194, 0.38);
  background: rgba(76, 111, 142, 0.16);
  color: #aec6dc;
}
.publisher-status-modal__header > div:nth-child(2) {
  min-width: 0;
  flex: 1;
}
.publisher-status-modal__eyebrow {
  margin-bottom: 3px;
  color: #74d8c6;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.15em;
}
.publisher-status-modal__header h3 {
  margin: 0;
  color: #f2f8fc;
  font-size: 18px;
}
.publisher-status-modal__close {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border: 1px solid rgba(108, 143, 165, 0.4);
  border-radius: 7px;
  background: transparent;
  color: #b9cbd8;
}
.publisher-status-modal__close:hover {
  border-color: rgba(116, 226, 207, 0.66);
  color: #f0fffb;
}
.publisher-status-modal__file {
  margin-top: 18px;
  padding: 10px 11px;
  overflow: hidden;
  border: 1px solid rgba(89, 128, 151, 0.28);
  border-radius: 8px;
  background: rgba(8, 20, 33, 0.52);
  color: #e3eef5;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-status-modal__details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  margin: 14px 0 0;
}
.publisher-status-modal__details > div {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid rgba(89, 128, 151, 0.24);
  border-radius: 8px;
  background: rgba(16, 39, 58, 0.7);
}
.publisher-status-modal__details dt {
  color: #87a5b9;
  font-size: 10px;
}
.publisher-status-modal__details dd {
  margin: 4px 0 0;
  overflow: hidden;
  color: #dcebf3;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-status-modal__error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 14px;
  padding: 10px 11px;
  border: 1px solid rgba(255, 126, 126, 0.3);
  border-radius: 8px;
  background: rgba(127, 29, 29, 0.16);
  color: #ffb0b0;
  font-size: 11px;
  line-height: 1.5;
}
.publisher-status-modal__error svg {
  flex: 0 0 auto;
  margin-top: 1px;
}
.publisher-status-modal__error p {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
.publisher-status-modal__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}
.publisher-status-modal__actions button {
  min-width: 82px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid rgba(104, 151, 161, 0.45);
  border-radius: 7px;
  background: #173246;
  color: #d9edf0;
  font-size: 11px;
  font-weight: 650;
}
.publisher-status-modal__actions button:hover {
  border-color: rgba(116, 226, 207, 0.66);
  background: #1c4050;
}
.publish-mode .publisher-design-apply {
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
}
.publish-mode .publisher-design-apply > button {
  width: 100% !important;
}
html[data-app-theme]
  body
  #app
  .app-shell
  .tiktok-page.publish-mode
button.publisher-submit-button {
  border-color: #32d7c0 !important;
  background: #1ed4c0 !important;
  color: #06201f !important;
  box-shadow: 0 6px 16px rgba(31, 212, 192, 0.16) !important;
}
html[data-app-theme]
  body
  #app
  .app-shell
  .tiktok-page.publish-mode
button.publisher-submit-button:hover:not(:disabled) {
  border-color: #70ead9 !important;
  background: #32d7c0 !important;
}
html[data-app-theme]
  body
  #app
  .app-shell
  .tiktok-page.publish-mode
button.publisher-submit-button:disabled {
  border-color: #315b62 !important;
  background: #1a3d43 !important;
  color: #7da9a6 !important;
  box-shadow: none !important;
  opacity: 1 !important;
}
.publish-mode .publisher-design-preview {
  margin: 10px 0 !important;
  padding: 0 !important;
}
.publish-mode .publisher-design-check {
  min-height: 28px !important;
}
.publish-mode .publisher-design-field {
  padding-bottom: 7px !important;
}
.publish-mode .publisher-design-page {
  gap: 6px !important;
  padding: 6px !important;
  border-radius: 10px !important;
}
.publish-mode .publisher-design-head {
  height: 60px !important;
  min-height: 60px !important;
  padding: 0 8px !important;
  border-bottom: 1px solid rgba(64, 96, 126, 0.34);
}
.publisher-design-body {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(320px, 3fr);
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.publisher-design-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.publish-mode .publisher-design-stats {
  flex: none !important;
  height: 40px !important;
  min-height: 40px !important;
  border: 0 !important;
}
.publish-mode .publisher-design-stats > div {
  height: 40px !important;
  min-height: 40px !important;
  padding: 0 10px !important;
  border-right: 1px solid rgba(64, 96, 126, 0.24) !important;
}
.publish-mode .publisher-design-stats > div:first-child {
  border-bottom: 2px solid #2dd8bf !important;
}
.publish-mode .publisher-design-stats strong {
  padding: 2px 7px;
  border-radius: 10px;
  background: #173249;
  font-size: 11px !important;
}
.publish-mode .publisher-design-filters {
  grid-template-columns:
    minmax(190px, 1fr)
    104px 104px 104px 108px 74px 74px !important;
  flex: none !important;
  height: 38px !important;
}
.publish-mode .publisher-design-selection {
  flex: none !important;
  min-height: 44px !important;
  gap: 10px !important;
  padding: 5px 10px !important;
}
.publish-mode .publisher-design-selection > span {
  flex: 0 0 auto;
  margin-right: 2px;
}
.publish-mode .publisher-design-selection > div {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.publish-mode .publisher-design-selection > div button {
  flex: 0 0 auto;
  min-width: 76px;
  white-space: nowrap;
}
.publish-mode .publisher-design-selection .publisher-selection-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 30px;
  min-width: 58px;
  padding: 0 8px;
  border: 1px solid #2d526b;
  border-radius: 6px;
  background: #12293b;
  color: #b9d0df;
  font-size: 10px;
  white-space: nowrap;
}
.publish-mode .publisher-design-selection .publisher-selection-toggle:hover {
  border-color: #3d768d;
  background: #17364a;
  color: #eef7fc;
}
.publish-mode .publisher-design-selection > .publisher-submit-button {
  flex: 0 0 auto;
  min-width: 124px;
  height: 32px;
  margin-left: auto;
  padding: 0 12px;
  border-radius: 6px;
  font-size: 11px !important;
  box-shadow: none !important;
  white-space: nowrap;
}
.publish-mode .publisher-design-list {
  flex: 1 1 auto !important;
  height: auto !important;
  min-height: 0 !important;
  border-radius: 7px !important;
}
.publish-mode .publisher-design-editor {
  width: auto !important;
  max-width: none !important;
  min-width: 0 !important;
  height: 100% !important;
  padding: 10px !important;
  border-radius: 7px !important;
  overflow-y: auto !important;
}
.publish-mode .publisher-design-row {
  min-height: 64px !important;
  margin: 0 !important;
  border: 0 !important;
  border-bottom: 1px solid rgba(64, 96, 126, 0.25) !important;
  border-radius: 0 !important;
  background: transparent !important;
}
.publish-mode .publisher-design-row:hover {
  background: rgba(18, 42, 61, 0.62) !important;
}
@media (max-width: 1180px) {
  .publisher-design-body {
    grid-template-columns: minmax(0, 1fr) 300px;
  }
  .publish-mode .publisher-design-filters {
    grid-template-columns:
      minmax(140px, 1fr)
      78px 78px 78px 82px 54px 54px !important;
    gap: 6px !important;
  }
  .publish-mode .publisher-design-list-head,
  .publish-mode .publisher-design-row {
    grid-template-columns:
      32px minmax(120px, 1.2fr) minmax(85px, 0.8fr) minmax(90px, 0.9fr)
      70px 92px 70px !important;
    gap: 6px !important;
  }
  .publish-mode .publisher-design-row {
    padding-right: 6px !important;
    padding-left: 6px !important;
  }
  .publish-mode .publisher-design-tags {
    gap: 2px;
  }
  .publish-mode .publisher-design-tags span:nth-child(n + 2) {
    display: none;
  }
}
.publish-mode .publisher-design-page {
  background: #08131f !important;
  border-color: rgba(42, 70, 96, 0.58) !important;
}
.publish-mode .publisher-design-logo {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 0;
  background: rgba(18, 201, 183, 0.11);
  color: #1dd6c1;
  box-shadow: none;
}
.publish-mode .publisher-design-title {
  gap: 14px;
}
.publish-mode .publisher-design-title h1 {
  color: #f4f8fc;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0;
}
.publish-mode .publisher-design-title p {
  margin-top: 5px;
  color: #7890a8;
  font-size: 11px;
  line-height: 1.2;
}
.publish-mode .publisher-design-actions {
  gap: 10px;
}
.publish-mode .publisher-design-actions button {
  height: 38px;
  min-width: 108px;
  padding: 0 14px;
  border-radius: 6px;
  font-size: 12px;
}
.publish-mode .publisher-design-actions .publisher-design-secondary {
  border-color: #263b50 !important;
  background: #101d2c !important;
  color: #d8e3ee !important;
  font-weight: 600 !important;
}
.publish-mode .publisher-design-actions .publisher-design-primary {
  min-width: 142px;
  border-color: #19dcca !important;
  background: #21ddcb !important;
  color: #052521 !important;
  box-shadow: none !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-actions .publisher-design-primary {
  border-color: var(--theme-accent) !important;
  background: var(--theme-accent) !important;
  color: var(--theme-on-accent, #ffffff) !important;
  box-shadow: none !important;
}
.publisher-source-tabs {
  display: flex;
  gap: 4px;
  margin: 14px 18px 0;
  padding: 4px;
  border-radius: 6px;
  background: #0b1724;
}
.publisher-source-tabs button {
  flex: 1;
  height: 34px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #8196aa;
  font-size: 12px;
  font-weight: 600;
}
.publisher-source-tabs button.active {
  background: #142738;
  color: #35dfca;
}
.publisher-picker-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 6px 18px;
  border-top: 1px solid rgba(64, 96, 126, 0.28);
  color: #7f95aa;
  font-size: 11px;
}
.publisher-picker-pagination > div {
  display: flex;
  align-items: center;
  gap: 10px;
}
.publisher-picker-pagination button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid #29425a;
  border-radius: 5px;
  background: #0d1928;
  color: #dbe7f4;
}
.publisher-picker-pagination button:disabled {
  opacity: 0.35;
}
.publish-mode .publisher-design-actions .publisher-music-library-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 112px;
  border: 1px solid #8978e8;
  background: #6756c7;
  color: #ffffff;
  font-weight: 700;
  line-height: 1;
}
.publish-mode .publisher-design-actions .publisher-music-library-button:hover {
  border-color: #a497f1;
  background: #7463d4;
}
html[data-app-theme]
  body
  #app
  .app-shell
  .tiktok-page.publish-mode
  .publisher-design-actions
  button.publisher-music-library-button {
  border-color: #8978e8 !important;
  background: #6756c7 !important;
  color: #ffffff !important;
}
html[data-app-theme]
  body
  #app
  .app-shell
  .tiktok-page.publish-mode
  .publisher-design-actions
  button.publisher-music-library-button:hover {
  border-color: #a497f1 !important;
  background: #7463d4 !important;
}
.publisher-music-library-button > svg {
  flex: 0 0 auto;
  display: block;
}
.publisher-music-library-button span {
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
  font-size: 9px;
}
.publisher-music-library-dialog {
  display: flex;
  flex-direction: column;
  width: min(760px, calc(100vw - 40px));
  max-height: min(720px, calc(100vh - 48px));
  overflow: hidden;
}
.publisher-music-library-toolbar {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(64, 96, 126, 0.28);
}
.publisher-music-library-toolbar > select {
  height: 40px;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid #2b4862;
  border-radius: 7px;
  background: #0d1b2b;
  color: #e4edf6;
  font-size: 11px;
}
.publisher-music-library-content {
  min-height: 280px;
  padding: 4px 18px 18px;
  overflow-y: auto;
}
.publisher-music-group {
  padding-top: 14px;
}
.publisher-music-group + .publisher-music-group {
  margin-top: 8px;
  border-top: 1px solid rgba(64, 96, 126, 0.24);
}
.publisher-music-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.publisher-music-group-head strong {
  color: #edf4fb;
  font-size: 12px;
}
.publisher-music-group-head span {
  color: #7f98ae;
  font-size: 10px;
}
.publisher-music-list {
  display: grid;
}
.publisher-music-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 34px 34px;
  align-items: center;
  gap: 10px;
  min-height: 58px;
  padding: 7px 4px;
  border-bottom: 1px solid rgba(64, 96, 126, 0.2);
}
.publisher-music-row > img,
.publisher-music-cover,
.publisher-music-option-main > img {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  background: #14283b;
}
.publisher-music-cover {
  display: grid;
  place-items: center;
  color: #7e91c7;
}
.publisher-music-meta {
  min-width: 0;
}
.publisher-music-meta strong,
.publisher-music-meta small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-music-meta strong {
  color: #edf4fb;
  font-size: 12px;
}
.publisher-music-meta small {
  margin-top: 4px;
  color: #8299ae;
  font-size: 10px;
}
.publisher-music-icon-button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #2a435a;
  border-radius: 6px;
  background: #101f30;
  color: #c8d6e4;
}
.publisher-music-icon-button:hover {
  border-color: #506a83;
  background: #172b3e;
}
.publisher-music-icon-button.favorite.active {
  border-color: #ad5474;
  background: #3a2030;
  color: #ff8caf;
}
.publisher-music-icon-button.favorite.active svg {
  fill: currentColor;
}
.publisher-music-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  align-items: center;
  gap: 8px;
  min-height: 58px;
  padding: 5px 8px 5px 5px;
  border: 1px solid rgba(111, 123, 170, 0.18);
  border-radius: 8px;
  background: rgba(18, 23, 38, 0.72);
}
.publisher-music-option-main {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #eef5ff;
  text-align: left;
}
.publisher-music-option-main > span {
  min-width: 0;
}
.publisher-music-option-main strong,
.publisher-music-option-main small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.publisher-music-option-main small {
  margin-top: 4px;
  color: #8195a9;
  font-size: 10px;
}
.publisher-music-option-main small b {
  margin-left: 6px;
  color: #ff8caf;
  font-size: 9px;
}
@media (max-width: 900px) {
  .publisher-music-library-toolbar {
    grid-template-columns: 1fr;
  }
}
.publish-mode .publisher-design-stats {
  display: flex !important;
  align-items: center;
  gap: 6px;
  height: 42px !important;
  min-height: 42px !important;
  padding: 4px;
  border: 1px solid rgba(45, 70, 94, 0.58) !important;
  border-radius: 7px;
  background: #0a1724;
}
.publish-mode .publisher-design-stats > button {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  height: 32px !important;
  min-height: 32px !important;
  min-width: 0;
  padding: 0 10px !important;
  border: 0 !important;
  border-radius: 5px;
  background: transparent !important;
  color: #8fa7bc !important;
  font-size: 11px;
  cursor: pointer;
}
.publish-mode .publisher-design-stats > button:hover {
  background: #12263a !important;
  color: #dbe7f2 !important;
}
.publish-mode .publisher-design-stats > button.active {
  background: #123a38 !important;
  color: #48dfc9 !important;
  box-shadow: inset 0 0 0 1px rgba(50, 219, 195, 0.28);
}
.publish-mode .publisher-design-stats > button span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  overflow: hidden;
  white-space: nowrap;
}
.publish-mode .publisher-design-stats > button strong {
  display: grid;
  place-items: center;
  min-width: 21px;
  height: 20px;
  margin: 0;
  padding: 0 6px;
  border-radius: 10px;
  background: #173249;
  color: #eaf2fa;
  font-size: 10px !important;
}
.publish-mode .publisher-design-stats > button.active strong {
  background: #1c5952;
  color: #75f0dc;
}
.publish-mode .publisher-design-filters {
  display: grid !important;
  grid-template-columns: minmax(180px, 1fr) 102px 102px 96px auto !important;
  align-items: center;
  gap: 7px !important;
  height: 38px !important;
}
.publisher-filter-actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}
.publish-mode .publisher-design-filters .publisher-filter-actions > button {
  height: 36px;
  min-width: 68px;
  padding: 0 10px;
  white-space: nowrap;
}
.publish-mode .publisher-design-filters .publisher-date-button {
  min-width: 104px;
}
.publish-mode .publisher-design-filters .publisher-date-button.active {
  border-color: #397c76;
  color: #59dfcb;
}
.publish-mode .publisher-design-filters .publisher-filter-apply {
  border-color: #317b72;
  background: #123832;
  color: #54dfca;
}
.publisher-date-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
/* Keep the publisher surface aligned with the active application theme. */
.publish-mode .publisher-design-page,
.publish-mode .publisher-design-list,
.publish-mode .publisher-design-editor {
  border-color: var(--theme-border) !important;
  background: var(--theme-panel) !important;
  color: var(--theme-text) !important;
}
.publish-mode .publisher-design-list-head {
  border-bottom: 1px solid var(--theme-divider) !important;
  background: var(--theme-panel-soft) !important;
  color: var(--theme-text-muted) !important;
}
.publish-mode .publisher-design-row {
  border-bottom-color: var(--theme-divider) !important;
  background: var(--theme-panel) !important;
  color: var(--theme-text-secondary) !important;
}
.publish-mode .publisher-design-row:hover {
  background: var(--theme-panel-soft) !important;
}
.publish-mode .publisher-design-row.is-published {
  border-left: 3px solid var(--theme-accent) !important;
  background: color-mix(in srgb, var(--theme-accent-soft) 42%, var(--theme-panel)) !important;
}
.publish-mode .publisher-design-row.is-published .publisher-design-state {
  font-weight: 700;
}
.publish-mode .publisher-design-row.is-published input[type="checkbox"],
.publish-mode .publisher-design-row.is-published button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.publish-mode .publisher-design-title,
.publish-mode .publisher-design-title h1,
.publish-mode .publisher-design-editor-head h2,
.publish-mode .publisher-design-check,
.publish-mode .publisher-design-time,
.publish-mode .publisher-design-state {
  color: var(--theme-text) !important;
}
.publish-mode .publisher-design-title p,
.publish-mode .publisher-design-editor-head p,
.publish-mode .publisher-design-hint,
.publish-mode .publisher-design-hint small,
.publish-mode .publisher-design-pager {
  color: var(--theme-text-muted) !important;
}
.publish-mode .publisher-design-filters select,
.publish-mode .publisher-design-filters button,
.publish-mode .publisher-design-search,
.publish-mode .publisher-design-selection,
.publish-mode .publisher-design-selection button:not(.publisher-design-primary),
.publish-mode .publisher-design-pager button,
.publish-mode .publisher-design-pager select {
  border-color: var(--theme-border-control) !important;
  background: var(--theme-control) !important;
  color: var(--theme-text-secondary) !important;
}
.publish-mode .publisher-design-selection {
  border-color: color-mix(in srgb, var(--theme-accent) 36%, var(--theme-border)) !important;
  background: var(--theme-accent-soft) !important;
}
.publish-mode .publisher-design-selection .publisher-submit-button,
.publish-mode .publisher-design-primary {
  border-color: var(--theme-accent) !important;
  background: var(--theme-accent) !important;
  color: var(--theme-on-accent, #ffffff) !important;
  box-shadow: none !important;
}
.publish-mode .publisher-design-actions .publisher-design-primary {
  border-color: var(--theme-accent) !important;
  background: var(--theme-accent) !important;
  color: var(--theme-on-accent, #ffffff) !important;
  box-shadow: none !important;
}
.publish-mode .publisher-design-selection .publisher-submit-button:hover,
.publish-mode .publisher-design-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--theme-accent) 86%, #000) !important;
}
.publish-mode .publisher-design-product,
.publish-mode .publisher-design-row-actions button,
.publish-mode .publisher-design-title-cell button {
  border-color: var(--theme-border-control) !important;
  background: var(--theme-control) !important;
  color: var(--theme-text-secondary) !important;
}
.publish-mode .publisher-design-tags span,
.publish-mode .publisher-design-tags b {
  border: 1px solid color-mix(in srgb, var(--theme-accent) 22%, var(--theme-border)) !important;
  background: var(--theme-accent-soft) !important;
  color: var(--theme-control-selected-text) !important;
}
.publish-mode .publisher-design-tags .publisher-design-tags-empty {
  border-color: transparent !important;
  background: transparent !important;
  color: var(--theme-text-muted) !important;
}
.publish-mode .publisher-design-empty {
  display: grid;
  min-height: 280px;
  place-content: center;
  justify-items: center;
  gap: 8px;
  margin: 16px;
  padding: 34px 24px;
  border: 1px dashed var(--theme-border-control);
  border-radius: 12px;
  background: var(--theme-panel-soft);
  color: var(--theme-text-muted);
  text-align: center;
}
.publish-mode .publisher-design-empty svg {
  width: 32px;
  height: 32px;
  margin-bottom: 2px;
  color: var(--theme-control-selected-text);
}
.publish-mode .publisher-design-empty strong {
  color: var(--theme-text);
  font-size: 14px;
}
.publish-mode .publisher-design-empty span {
  color: var(--theme-text-muted);
  font-size: 11px;
}
.publish-mode .publisher-design-editor {
  background: var(--theme-panel-soft) !important;
}
.publish-mode .publisher-design-apply {
  border-top: 1px solid var(--theme-divider) !important;
  background: var(--theme-panel-soft) !important;
}
.publish-mode .publisher-design-apply > button:not(.publisher-design-primary) {
  border-color: var(--theme-border-control) !important;
  background: var(--theme-control) !important;
  color: var(--theme-text-secondary) !important;
}
.publisher-picker-dialog {
  grid-template-rows: auto auto auto minmax(0, 1fr) auto auto;
  height: min(820px, calc(100vh - 32px));
  max-height: calc(100vh - 32px);
  overflow: hidden;
}
.publisher-picker-dialog .publisher-picker-list {
  min-height: 0;
  max-height: none;
  overflow-y: auto;
  padding-right: 4px;
}
.publisher-picker-dialog .publisher-picker-pagination {
  flex: none;
}
.publisher-picker-dialog > .dialog-actions {
  position: relative;
  z-index: 2;
  min-height: 48px;
  padding-top: 10px;
  border-top: 1px solid var(--theme-divider, rgba(100, 120, 140, 0.28));
  background: var(--theme-panel, #ffffff);
}
.publisher-picker-dialog > .dialog-actions button {
  min-width: 120px;
  min-height: 38px;
}
.publisher-picker-dialog > .dialog-actions .primary-button {
  border-color: var(--theme-accent) !important;
  background: var(--theme-accent) !important;
  color: var(--theme-on-accent, #ffffff) !important;
}
.publish-mode .publisher-description-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.publish-mode .publisher-description-tags span,
.publish-mode .publisher-description-tags button {
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--theme-border-control);
  border-radius: 999px;
  background: var(--theme-control);
  color: var(--theme-text-secondary);
  font-size: 10px;
}
.publish-mode .publisher-description-tags span {
  border-color: color-mix(in srgb, var(--theme-accent) 26%, var(--theme-border));
  background: var(--theme-accent-soft);
  color: var(--theme-control-selected-text);
}
.publish-mode .publisher-description-tags button:hover {
  border-color: var(--theme-accent);
  color: var(--theme-text);
}
.publish-mode .publisher-description-tag-input {
  display: flex;
  gap: 6px;
  margin-top: 7px;
}
.publish-mode .publisher-description-tag-input input {
  min-width: 0;
  flex: 1;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--theme-border-control);
  border-radius: 6px;
  background: var(--theme-input);
  color: var(--theme-text);
}
.publish-mode .publisher-description-tag-input button {
  padding: 0 10px;
  border: 1px solid var(--theme-accent);
  border-radius: 6px;
  background: var(--theme-accent);
  color: var(--theme-on-accent, #ffffff);
}
/* Final theme pass for editor text and controls. */
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-video strong,
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-title-cell span,
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-product,
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-row > label {
  color: var(--theme-text) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-video span > small,
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-pager,
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-field small {
  color: var(--theme-text-muted) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-editor-head,
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-editor-tabs-single,
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-editor-apply-mode {
  border-color: var(--theme-divider) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-editor-tabs-single {
  background: var(--theme-panel-soft) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-editor-tabs-single span {
  color: var(--theme-control-selected-text) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-hint,
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-check,
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-editor-apply-mode > strong,
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-radio {
  color: var(--theme-text-secondary) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-hint small {
  color: var(--theme-text-muted) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-field input,
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-field textarea,
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-select {
  border-color: var(--theme-border-control) !important;
  background: var(--theme-input) !important;
  color: var(--theme-text) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-field input::placeholder,
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-field textarea::placeholder {
  color: var(--theme-text-muted) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-radio label::before {
  border-color: var(--theme-border-control) !important;
  background: var(--theme-control) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-radio label:has(input[type="radio"]:checked)::before {
  border-color: var(--theme-accent) !important;
  background: radial-gradient(circle, var(--theme-accent) 0 3px, var(--theme-control) 4px) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-row-actions button,
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-title-cell button {
  border-color: var(--theme-border-control) !important;
  background: var(--theme-control) !important;
  color: var(--theme-text-secondary) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-stats strong {
  background: var(--theme-control-selected) !important;
  color: var(--theme-control-selected-text) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-head {
  border-bottom-color: var(--theme-divider) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-stats {
  border: 1px solid var(--theme-border) !important;
  border-radius: 9px !important;
  background: var(--theme-panel-soft) !important;
  color: var(--theme-text-secondary) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-stats > div {
  border-right-color: var(--theme-divider) !important;
  background: transparent !important;
  color: var(--theme-text-secondary) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-stats > div:first-child {
  border-bottom-color: var(--theme-accent) !important;
  background: var(--theme-accent-soft) !important;
  color: var(--theme-control-selected-text) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-stats strong {
  color: inherit !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-logo {
  border: 1px solid color-mix(in srgb, var(--theme-accent) 28%, var(--theme-border)) !important;
  background: var(--theme-accent-soft) !important;
  color: var(--theme-control-selected-text) !important;
}
html[data-app-theme] body #app .app-shell .tiktok-page.publish-mode .publisher-design-page ~ .publisher-drawer-backdrop {
  display: grid !important;
}
@media (max-width: 1180px) {
  .publish-mode .publisher-design-filters {
    grid-template-columns: minmax(130px, 1fr) 78px 78px 78px auto !important;
  }
  .publish-mode .publisher-design-filters .publisher-filter-actions > button {
    min-width: 46px;
    padding: 0 7px;
    font-size: 10px;
  }
  .publish-mode .publisher-design-filters .publisher-date-button {
    min-width: 82px;
  }
}
/* Compact publishing header: keep the API status control from stretching the toolbar. */
.publish-mode .publisher-design-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  min-width: 0;
}
.publish-mode .publisher-design-actions > .publisher-design-api-chip {
  flex: 0 1 238px;
  width: 238px;
  min-width: 0 !important;
  height: 38px !important;
  box-sizing: border-box;
  padding: 0 6px 0 12px !important;
  gap: 7px;
  border: 1px solid color-mix(in srgb, var(--theme-border-control) 78%, transparent) !important;
  border-radius: 11px !important;
  background: var(--theme-panel-soft) !important;
  color: var(--theme-text-secondary) !important;
  box-shadow: 0 4px 14px rgba(20, 35, 55, 0.08);
}
.publish-mode .publisher-design-actions > .publisher-design-api-chip > span {
  overflow: hidden;
  flex: 1 1 auto;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
}
.publish-mode .publisher-design-actions > .publisher-design-api-chip > em {
  flex: 0 0 auto;
  color: var(--theme-text-muted) !important;
  font-size: 10px;
}
.publish-mode .publisher-design-actions > .publisher-design-api-chip > button {
  flex: 0 0 auto;
  width: 66px !important;
  min-width: 66px !important;
  height: 30px !important;
  min-height: 30px !important;
  padding: 0 10px !important;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 18%, var(--theme-border-control)) !important;
  border-radius: 8px !important;
  background: var(--theme-control) !important;
  color: var(--theme-control-selected-text) !important;
  font-size: 11px !important;
  font-weight: 700 !important;
}
.publish-mode .publisher-design-actions > .publisher-design-api-chip > button:hover {
  border-color: var(--theme-accent) !important;
  background: var(--theme-accent-soft) !important;
}
@media (max-width: 980px) {
  .publish-mode .publisher-design-head {
    height: auto !important;
    min-height: 60px !important;
    padding: 10px 8px !important;
    align-items: flex-start;
  }
  .publish-mode .publisher-design-actions {
    max-width: 62%;
    row-gap: 6px;
  }
  .publish-mode .publisher-design-actions > .publisher-design-api-chip {
    flex-basis: 210px;
    width: 210px;
  }
}
.publisher-poster-placeholder { display: grid; width: 100%; height: 100%; place-items: center; color: var(--theme-text-muted); background: var(--theme-panel-soft); }
</style>
