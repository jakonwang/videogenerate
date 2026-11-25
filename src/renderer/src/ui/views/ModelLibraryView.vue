<script setup lang="ts">
import { thumbnailUrl } from '@/lib/localMedia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  getModelProfileOptionGroups,
  getModelProfileOptionLabel,
  getModelProfileOptionPrompt,
  getRecommendedModelProfileOptions,
  type ModelProfileOptionValue,
  type ModelProfileOptions,
} from '../../../../shared/modelProfileOptions'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  AlertCircle,
  Users,
  Download,
  Grid2x2,
  ImagePlus,
  LayoutList,
  LoaderCircle,
  MoreHorizontal,
  Search,
  Wand2,
  X,
  Pencil,
  Sparkles,
  Trash2, UserRound
} from 'lucide-vue-next'

type CloneProject = {
  id: string
  referenceVideoName?: string
  referenceVideoPath?: string
  selectedModelIdentityId?: string
}

type ModelTask = {
  id: string
  status: 'draft' | 'generating' | 'done' | 'failed'
  title: string
  description?: string
  sourceProjectId?: string
  productType?: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
  modelReferenceImagePaths?: string[]
}

type ModelIdentityLibraryItem = {
  id: string
  status: 'idle' | 'generating' | 'done' | 'failed'
  name: string
  productType: 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'
  market: string
  gender: string
  ageRange: string
  hairStyle: string
  skinTone: string
  outfitStyle: string
  mood: string
  sceneStyle: string
  description: string
  imagePaths: string[]
  coverImagePath?: string
  model?: string
  error?: string
  createdAt?: number
  updatedAt?: number
}

type LibraryStatusFilter = 'all' | 'done' | 'generating' | 'failed'
type ViewMode = 'grid' | 'list'
type LibraryTab = 'all' | 'mine'
type DropdownKey = 'status' | 'project' | 'productType' | 'pageSize' | null
type ModelActionMenuKey = string | null
type ModelDialogMode = 'rename' | 'delete' | null
type ModelProfileSectionKey = 'identity' | 'appearance' | 'style' | 'scene'
type ModelPromptPreview = {
  profile: Record<string, string>
  description: string
  prompt: string
  productType: string
  productPoints: string
  modelProfileOptions: Record<string, string>
  productReferenceImageCount: number
  productReferenceImagePaths: string[]
  modelReferenceImageCount?: number
  modelReferenceImagePaths?: string[]
}

const router = useRouter()
const { t, locale } = useI18n()
const busy = ref(false)
const message = ref('')
const library = ref<ModelIdentityLibraryItem[]>([])
const projects = ref<CloneProject[]>([])
const modelTasks = ref<ModelTask[]>([])
const search = ref('')
const statusFilter = ref<LibraryStatusFilter>('all')
const selectedId = ref('')
const selectedIds = ref<string[]>([])
const modelTaskId = ref('')
const productType = ref<'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'>('general')
const modelProfileOptions = ref<ModelProfileOptions>(getRecommendedModelProfileOptions('general'))
const modelReferenceImages = ref<string[]>([])
const openaiKey = ref('')
const openaiImageModel = ref('gpt-image-2')
const openaiImageQuality = ref<'low' | 'medium' | 'high'>('high')
const klingKey = ref('')
const klingHost = ref('https://api.atlascloud.ai')
const klingImageModel = ref('openai/gpt-image-1/edit')
const grsaiKey = ref('')
const grsaiHost = ref('https://grsaiapi.com')
const grsaiImageModel = ref('gpt-image-2')
const qiniuAccessKey = ref('')
const qiniuSecretKey = ref('')
const qiniuBucket = ref('')
const qiniuDomain = ref('')
const qiniuUploadHost = ref('https://upload.qiniup.com')
const qiniuPrefix = ref('videogenerate/clone')
const imageProviderPrimary = ref<'openai' | 'kling' | 'grsai' | 'apifox_hub'>('apifox_hub')
const apifoxImageApiKey = ref('')
const apifoxImageBaseUrl = ref('')
const apifoxImageModel = ref('')

const viewMode = ref<ViewMode>('grid')
const activeTab = ref<LibraryTab>('all')
const page = ref(1)
const pageSize = ref(8)
const openDropdown = ref<DropdownKey>(null)
const openActionMenu = ref<ModelActionMenuKey>(null)
const dialogMode = ref<ModelDialogMode>(null)
const createPanelOpen = ref(false)
const activeProfileSection = ref<ModelProfileSectionKey>('identity')
const dialogTarget = ref<ModelIdentityLibraryItem | null>(null)
const renameDraft = ref('')
const dialogBusy = ref(false)
const promptPreview = ref<ModelPromptPreview | null>(null)
const promptPreviewBusy = ref(false)
const batchGenerateCount = ref(3)
const batchGenerateOptions = computed(() => [1, 3, 5].map((value) => ({ value, label: t('modelLibrary.itemCount', { count: value }) })))

const hasModelReferenceInput = computed(() => modelReferenceImages.value.length > 0)
const imageProviderReady = computed(() =>
  imageProviderPrimary.value === 'kling'
    ? Boolean(klingKey.value.trim())
    : imageProviderPrimary.value === 'grsai'
      ? Boolean(grsaiKey.value.trim())
      : imageProviderPrimary.value === 'apifox_hub'
        ? Boolean(apifoxImageApiKey.value.trim())
        : Boolean(openaiKey.value.trim()),
)

const counts = computed(() => ({
  all: library.value.length,
  mine: library.value.filter((item) => item.status === 'done').length,
}))

const tabItems = computed(() => [
  { key: 'all' as const, label: t('modelLibrary.tabs.all'), count: counts.value.all },
  { key: 'mine' as const, label: t('modelLibrary.tabs.ready'), count: counts.value.mine },
])

const activeModelTask = computed(() => modelTasks.value.find((item) => item.id === modelTaskId.value) || null)

const statusOptions = computed(() => [
  { value: 'all' as const, label: t('modelLibrary.filters.allStatuses') },
  { value: 'done' as const, label: t('modelLibrary.status.ready') },
  { value: 'generating' as const, label: t('modelLibrary.status.generating') },
  { value: 'failed' as const, label: t('modelLibrary.status.failed') },
])

const productTypeOptions = computed(() => [
  { value: 'earrings' as const, label: t('modelLibrary.styles.all') },
  { value: 'phone_case' as const, label: t('modelLibrary.styles.urban') },
  { value: 'clothes' as const, label: t('modelLibrary.styles.fashion') },
  { value: 'toy' as const, label: t('modelLibrary.styles.girl') },
  { value: 'general' as const, label: t('modelLibrary.styles.general') },
])

const pageSizeOptions = computed(() => [8, 12, 16].map((value) => ({ value, label: t('modelLibrary.perPage', { count: value }) })))

const statusFilterLabel = computed(() => statusOptions.value.find((item) => item.value === statusFilter.value)?.label ?? t('modelLibrary.filters.allStatuses'))
const productTypeLabel = computed(() => productTypeOptions.value.find((item) => item.value === productType.value)?.label ?? t('modelLibrary.styles.all'))
const pageSizeLabel = computed(() => pageSizeOptions.value.find((item) => item.value === pageSize.value)?.label ?? t('modelLibrary.perPage', { count: 8 }))
const modelProfileGroups = getModelProfileOptionGroups()
const modelProfileSummaryItems = computed(() =>
  modelProfileGroups
    .map((group) => getModelProfileOptionLabel(group.key, modelProfileOptions.value[group.key]))
    .filter(Boolean)
    .slice(0, 7),
)
const modelProfileSummaryText = computed(() => {
  if (!modelProfileSummaryItems.value.length) return t('modelLibrary.profile.autoRecommendation')
  return modelProfileSummaryItems.value.join(' / ')
})
const modelProfileSections = computed(() => [
  {
    key: 'identity' as const,
    label: t('modelLibrary.profile.identity'),
    description: t('modelLibrary.profile.identityDesc'),
    groups: modelProfileGroups.filter((group) => ['market', 'gender', 'ageRange'].includes(group.key)),
  },
  {
    key: 'appearance' as const,
    label: t('modelLibrary.profile.appearance'),
    description: t('modelLibrary.profile.appearanceDesc'),
    groups: modelProfileGroups.filter((group) => ['faceShape', 'hairStyle', 'hairColor', 'skinTone', 'bodyType'].includes(group.key)),
  },
  {
    key: 'style' as const,
    label: t('modelLibrary.profile.style'),
    description: t('modelLibrary.profile.styleDesc'),
    groups: modelProfileGroups.filter((group) => ['outfitStyle', 'mood', 'languageStyle', 'cameraPresence'].includes(group.key)),
  },
  {
    key: 'scene' as const,
    label: t('modelLibrary.profile.scene'),
    description: t('modelLibrary.profile.sceneDesc'),
    groups: modelProfileGroups.filter((group) => ['sceneStyle', 'styleBias'].includes(group.key)),
  },
])
const imageProviderMissingText = computed(() => {
  if (imageProviderReady.value) return ''
  return imageProviderPrimary.value === 'kling'
    ? t('modelLibrary.missingKey.atlas')
    : imageProviderPrimary.value === 'grsai'
      ? t('modelLibrary.missingKey.grsai')
      : imageProviderPrimary.value === 'apifox_hub'
        ? t('modelLibrary.missingKey.vector')
        : t('modelLibrary.missingKey.image')
})

function defaultModelPromptProfile(type: typeof productType.value, gender?: 'female' | 'male') {
  const resolvedGender = gender === 'male' ? 'male' : 'female'
  if (resolvedGender === 'male') {
    return {
      market: 'Global social-commerce market',
      gender: 'male',
      ageRange: '23-32',
      faceShape: 'ordinary natural face shape',
      hairStyle: type === 'earrings' ? 'hair tied back or tucked cleanly away from product area' : 'natural straight hair',
      hairColor: 'natural dark black hair color',
      skinTone: 'healthy neutral skin tone',
      bodyType: 'balanced natural build',
      outfitStyle: type === 'clothes' ? 'casual short-sleeve lifestyle outfit' : type === 'earrings' ? 'minimal clean short-sleeve top that does not compete with the product' : 'clean casual short-sleeve outfit',
      mood: 'calm natural everyday expression',
      sceneStyle: 'real home daylight daily life setting',
      languageStyle: 'casual everyday short-video expression style',
      cameraPresence: type === 'earrings' ? 'close-up product-led camera presence' : 'natural social-commerce camera presence',
      styleBias: 'authentic everyday UGC style',
    }
  }
  if (type === 'earrings') {
    return {
      market: 'Southeast Asian market',
      gender: 'female',
      ageRange: '23-32',
      faceShape: 'ordinary natural face shape',
      hairStyle: 'natural dark hair tucked behind one ear',
      hairColor: 'natural dark black hair color',
      skinTone: 'natural warm skin tone',
      bodyType: 'balanced natural build',
      outfitStyle: 'simple daily short-sleeve casual top that does not compete with the product',
      mood: 'friendly natural everyday expression',
      sceneStyle: 'real home daylight daily life setting',
      languageStyle: 'casual everyday short-video expression style',
      cameraPresence: 'close-up product-led camera presence',
      styleBias: 'authentic everyday UGC style',
    }
  }
  if (type === 'clothes') {
    return {
      market: 'Southeast Asian market',
      gender: 'female',
      ageRange: '23-32',
      faceShape: 'ordinary natural face shape',
      hairStyle: 'natural dark hair, tidy styling',
      hairColor: 'natural dark brown hair color',
      skinTone: 'natural warm skin tone',
      bodyType: 'balanced natural build',
      outfitStyle: 'simple short-sleeve daily styling that does not compete with the product clothing',
      mood: 'relaxed natural everyday expression',
      sceneStyle: 'real home daylight daily life setting',
      languageStyle: 'casual everyday short-video expression style',
      cameraPresence: 'natural amateur smartphone camera presence',
      styleBias: 'authentic everyday UGC style',
    }
  }
  return {
    market: 'Southeast Asian market',
    gender: 'female',
    ageRange: '20-30',
    faceShape: 'ordinary natural face shape',
    hairStyle: 'natural dark hair',
    hairColor: 'natural dark black hair color',
    skinTone: 'natural warm skin tone',
    bodyType: 'average everyday build',
    outfitStyle: 'simple daily short-sleeve casual outfit',
    mood: 'friendly natural everyday amateur model',
    sceneStyle: 'real home daylight daily life setting',
    languageStyle: 'casual everyday short-video expression style',
    cameraPresence: 'natural amateur smartphone camera presence',
    styleBias: 'authentic everyday UGC style',
  }
}

function recommendedMaleProfileOptions(type: typeof productType.value): ModelProfileOptions {
  return {
    market: 'global_female',
    gender: 'male',
    ageRange: '25_32',
    faceShape: 'soft_round',
    hairStyle: type === 'earrings' ? 'tied_back' : 'dark_straight',
    hairColor: 'dark_black',
    skinTone: 'healthy_neutral',
    bodyType: 'balanced',
    outfitStyle: type === 'earrings' ? 'clean_minimal' : 'casual_lifestyle',
    mood: 'friendly_natural',
    sceneStyle: 'home_daylight',
    languageStyle: 'chinese_fluent',
    cameraPresence: type === 'earrings' ? 'closeup_product_led' : 'natural_social_commerce',
    styleBias: 'conversion_focus',
  }
}

function buildLocalModelPromptPreview(input: {
  productType: typeof productType.value
  productPoints?: string
  modelProfileOptions?: ModelProfileOptions
  productReferenceImagePaths: string[]
  modelReferenceImagePaths?: string[]
}): ModelPromptPreview {
  const explicitGender = input.modelProfileOptions?.gender === 'male' ? 'male' : input.modelProfileOptions?.gender === 'female' ? 'female' : undefined
  const base = defaultModelPromptProfile(input.productType, explicitGender)
  const femaleRecommended = getRecommendedModelProfileOptions(input.productType)
  const maleRecommended = recommendedMaleProfileOptions(input.productType)
  const merged: ModelProfileOptions = { ...(explicitGender === 'male' ? maleRecommended : femaleRecommended), ...(input.modelProfileOptions ?? {}) }
  if (explicitGender === 'male') {
    for (const [key, value] of Object.entries(merged) as Array<[keyof ModelProfileOptions, ModelProfileOptionValue | undefined]>) {
      if (key === 'gender' || !value) continue
      if (value === femaleRecommended[key]) merged[key] = maleRecommended[key]
    }
  }
  const promptValue = (key: keyof ModelProfileOptions, fallback: string) => {
    const value = merged[key]
    return value ? getModelProfileOptionPrompt(key, value) || fallback : fallback
  }
  const profile = {
    market: promptValue('market', base.market),
    gender: promptValue('gender', base.gender),
    ageRange: promptValue('ageRange', base.ageRange),
    faceShape: promptValue('faceShape', base.faceShape),
    hairStyle: promptValue('hairStyle', base.hairStyle),
    hairColor: promptValue('hairColor', base.hairColor),
    skinTone: promptValue('skinTone', base.skinTone),
    bodyType: promptValue('bodyType', base.bodyType),
    outfitStyle: promptValue('outfitStyle', base.outfitStyle),
    mood: promptValue('mood', base.mood),
    sceneStyle: promptValue('sceneStyle', base.sceneStyle),
    languageStyle: promptValue('languageStyle', base.languageStyle),
    cameraPresence: promptValue('cameraPresence', base.cameraPresence),
    styleBias: promptValue('styleBias', base.styleBias),
  }
  const genderHardRule =
    profile.gender === 'male'
      ? 'CRITICAL GENDER LOCK: male only. The model must read clearly as a real adult man. Do not generate a woman, feminine face, feminine styling, feminine body shape, or female-presenting identity.'
      : 'CRITICAL GENDER LOCK: female only. The model must read clearly as a real adult woman. Do not generate a man, masculine face, masculine styling, masculine body shape, or male-presenting identity.'
  const description = [
    'New virtual model for this clone project',
    `${profile.market}, ${profile.gender}, ${profile.ageRange}`,
    `${profile.faceShape}, ${profile.hairStyle}, ${profile.hairColor}`,
    `${profile.skinTone}, ${profile.bodyType}`,
    `${profile.outfitStyle}, ${profile.mood}`,
    `${profile.sceneStyle}`,
    `${profile.languageStyle}`,
    `${profile.cameraPresence}, ${profile.styleBias}`,
  ].join('. ')
  const prompt = [
    'Create one single-image multi-angle reference sheet for a new virtual model identity package for short-form social commerce videos.',
    'Generate the model only. Do not add, hold, wear, present, or interact with any product, accessory, prop, package, phone, jewelry, clothing item, or branded object.',
    'The model must be a new person and must not copy any person from the reference video.',
    genderHardRule,
    `Market: ${profile.market}. Gender: ${profile.gender}. Age range: ${profile.ageRange}.`,
    `Face shape: ${profile.faceShape}. Hair: ${profile.hairStyle}. Hair color: ${profile.hairColor}.`,
    `Skin tone: ${profile.skinTone}. Body type: ${profile.bodyType}. Outfit: ${profile.outfitStyle}.`,
    `Mood: ${profile.mood}. Scene: ${profile.sceneStyle}. Language style: ${profile.languageStyle}.`,
    `Camera presence: ${profile.cameraPresence}. Style bias: ${profile.styleBias}.`,
    'For Southeast Asian hot-weather everyday styling, prefer short-sleeve tops, light breathable casual clothing, and simple daily outfits unless the user explicitly requests otherwise.',
    'The model should look like a real ordinary person, not a fashion model, celebrity, luxury campaign face, or highly polished influencer.',
    'Prefer natural facial features, realistic proportions, light everyday grooming, and believable skin texture. Avoid overly sharp jawlines, glamorous makeup, dramatic styling, or high-end editorial beauty treatment.',
    'The face should feel ordinary and believable, not exceptionally beautiful or commercially perfected.',
    'Allow mild asymmetry, normal pores, light under-eye presence, natural smile lines, and small everyday skin texture details.',
    'Do not beautify the face into a luxury ad look. Do not generate flawless skin, porcelain skin, perfect symmetry, sculpted editorial cheekbones, or overly polished influencer makeup.',
    'Output format: one single image only, arranged as a practical 3x3 multi-angle contact sheet with 9 panels.',
    'The 9 panels must show the same exact model identity from different reusable angles and framings such as front portrait, left 45 degree, right 45 degree, left profile, right profile, half body, hands-near-face pose, seated natural pose, and one simple close detail angle.',
    'Keep the same face, hair, outfit, lighting, age impression, and scene style fully consistent across all 9 panels.',
    'Do not make every panel front-facing. The purpose is reusable multi-angle identity coverage, not a single hero portrait repeated 9 times.',
    'Show the model alone in a simple, practical, reusable everyday reference set. Keep face, outfit, lighting and scene style stable and reusable.',
    'No product, no prop, no text, no subtitles, no watermark, no logo, no UI overlay, no random letters.',
    'Realistic smartphone photo style, natural skin texture, ordinary home lighting, and authentic everyday framing.',
    'Single person only. One collage image only.',
  ].join('\n')
  return {
    profile,
    description,
    prompt,
    productType: input.productType,
    productPoints: input.productPoints || '',
    modelProfileOptions: { ...(input.modelProfileOptions ?? {}) } as Record<string, string>,
    productReferenceImageCount: input.productReferenceImagePaths.length,
    productReferenceImagePaths: input.productReferenceImagePaths,
    modelReferenceImageCount: (input.modelReferenceImagePaths ?? []).length,
    modelReferenceImagePaths: input.modelReferenceImagePaths ?? [],
  }
}

const uploadPreviewHero = computed(() => modelReferenceImages.value[0] || '')

const filteredLibrary = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return library.value.filter((item, index) => {
    if (statusFilter.value !== 'all' && item.status !== statusFilter.value) return false
    if (activeTab.value === 'mine' && item.status !== 'done') return false
    if (!keyword) return true
    const text = [
      item.name,
      item.description,
      item.market,
      item.sceneStyle,
      item.productType,
      item.gender,
      item.ageRange,
      item.outfitStyle,
      item.mood,
      item.skinTone,
      item.hairStyle,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return text.includes(keyword)
  })
})

const sortedLibrary = computed(() => {
  const rows = [...filteredLibrary.value]
  rows.sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))
  return rows
})

const selectedSet = computed(() => new Set(selectedIds.value))
const selectedModels = computed(() => sortedLibrary.value.filter((item) => selectedSet.value.has(item.id)))

const totalPages = computed(() => Math.max(1, Math.ceil(sortedLibrary.value.length / pageSize.value)))
const pagedLibrary = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return sortedLibrary.value.slice(start, start + pageSize.value)
})
const allCurrentPageSelected = computed(() => pagedLibrary.value.length > 0 && pagedLibrary.value.every((item) => selectedSet.value.has(item.id)))

const selectedModel = computed(() => {
  return library.value.find((item) => item.id === selectedId.value) ?? pagedLibrary.value[0] ?? sortedLibrary.value[0] ?? null
})

const statusStats = computed(() => {
  const rows = library.value
  return [
    { key: 'all' as const, label: t('modelLibrary.spec.total'), value: rows.length, tone: 'total' },
    { key: 'done' as const, label: t('modelLibrary.spec.ready'), value: rows.filter((item) => item.status === 'done').length, tone: 'ready' },
    { key: 'generating' as const, label: t('modelLibrary.spec.generating'), value: rows.filter((item) => item.status === 'generating').length, tone: 'generating' },
    { key: 'failed' as const, label: t('modelLibrary.spec.failed'), value: rows.filter((item) => item.status === 'failed').length, tone: 'failed' },
  ]
})

const activeImageIndex = ref(0)
watch(selectedId, () => {
  activeImageIndex.value = 0
})
const selectedImages = computed(() => {
  const item = selectedModel.value
  if (!item) return [] as string[]
  const list = [item.coverImagePath, ...(item.imagePaths || [])].map((p) => String(p || '').trim()).filter(Boolean)
  return Array.from(new Set(list))
})
const selectedHeroImage = computed(() => selectedImages.value[activeImageIndex.value] || selectedImages.value[0] || '')
const selectedSpecs = computed(() => {
  const item = selectedModel.value
  if (!item) return []
  return [
    { key: 'gender', label: t('modelLibrary.spec.gender'), value: item.gender },
    { key: 'age', label: t('modelLibrary.spec.age'), value: item.ageRange },
    { key: 'market', label: t('modelLibrary.spec.market'), value: item.market },
    { key: 'skin', label: t('modelLibrary.spec.skin'), value: item.skinTone },
    { key: 'hair', label: t('modelLibrary.spec.hair'), value: item.hairStyle },
    { key: 'outfit', label: t('modelLibrary.spec.outfit'), value: item.outfitStyle },
    { key: 'mood', label: t('modelLibrary.spec.mood'), value: item.mood },
    { key: 'scene', label: t('modelLibrary.spec.scene'), value: item.sceneStyle },
  ].filter((row) => String(row.value || '').trim())
})

function setStatusFilter(value: LibraryStatusFilter) {
  activeTab.value = 'all'
  statusFilter.value = value
}

function cardMeta(item: ModelIdentityLibraryItem) {
  return [item.ageRange, item.market].map((v) => String(v || '').trim()).filter(Boolean).join(' · ') || productTypeTag(item.productType)
}

function relativeDate(timestamp?: number) {
  if (!timestamp) return '--'
  return new Date(timestamp).toLocaleDateString(locale.value)
}

const pages = computed(() => Array.from({ length: Math.min(totalPages.value, 4) }, (_, index) => index + 1))

watch([sortedLibrary, pageSize], () => {
  page.value = Math.min(page.value, totalPages.value)
  const available = new Set(sortedLibrary.value.map((item) => item.id))
  selectedIds.value = selectedIds.value.filter((id) => available.has(id))
})

function normalizeAtlasCloudHost(v: unknown) {
  const raw = String(v ?? '')
    .trim()
    .replace(/\/+$/, '')
  if (!raw || /kling/i.test(raw)) return 'https://api.atlascloud.ai'
  return raw
}

function mediaUrl(path?: string) {
  return path ? `vg://file?path=${encodeURIComponent(path)}` : ''
}


function primaryMediaPath(item?: ModelIdentityLibraryItem | null) {
  if (!item) return ''
  return String(item.coverImagePath || item.imagePaths?.[0] || '').trim()
}

function modelStatusText(status?: string) {
  if (status === 'done') return t('modelLibrary.status.ready')
  if (status === 'generating') return t('modelLibrary.status.generating')
  if (status === 'failed') return t('modelLibrary.status.failed')
  return t('modelLibrary.status.incomplete')
}

function statusPill(status?: string) {
  if (status === 'done') return 'vg-pill--green'
  if (status === 'generating') return 'vg-pill--blue'
  if (status === 'failed') return 'vg-pill--red'
  return ''
}

function modelStatusTone(status?: string) {
  if (status === 'done') return 'is-done'
  if (status === 'generating') return 'is-generating'
  if (status === 'failed') return 'is-failed'
  return 'is-idle'
}

function modelTitle(item: ModelIdentityLibraryItem, index: number) {
  const name = String(item.name || '').trim()
  if (name) return name
  return t('modelLibrary.defaultName', { index: String(index + 1).padStart(3, '0') })
}

function modelDescriptionPreview(text?: string) {
  const content = String(text || '').replace(/\s+/g, ' ').trim()
  if (!content) return t('modelLibrary.defaultDescription')
  return content.length > 110 ? `${content.slice(0, 110)}...` : content
}

function productTypeTag(type: ModelIdentityLibraryItem['productType']) {
  return t(`modelLibrary.typeTags.${type}`)
}

function formatDate(timestamp?: number) {
  if (!timestamp) return '--'
  return new Date(timestamp).toLocaleString(locale.value)
}

function modelMetrics(item?: ModelIdentityLibraryItem | null) {
  if (!item) return '--'
  return [item.ageRange, item.market, item.outfitStyle].filter(Boolean).join(' | ') || '--'
}

function languageText(item?: ModelIdentityLibraryItem | null) {
  return String(item?.model || '').trim() || '--'
}

function toggleDropdown(key: Exclude<DropdownKey, null>) {
  openDropdown.value = openDropdown.value === key ? null : key
}

function closeDropdown() {
  openDropdown.value = null
}

function toggleActionMenu(key: string) {
  openActionMenu.value = openActionMenu.value === key ? null : key
}

function closeActionMenu() {
  openActionMenu.value = null
}

function toggleSelected(id: string) {
  if (!id) return
  if (selectedSet.value.has(id)) {
    selectedIds.value = selectedIds.value.filter((item) => item !== id)
    return
  }
  selectedIds.value = [...selectedIds.value, id]
}

function toggleSelectCurrentPage() {
  if (!pagedLibrary.value.length) return
  if (allCurrentPageSelected.value) {
    const currentPageIds = new Set(pagedLibrary.value.map((item) => item.id))
    selectedIds.value = selectedIds.value.filter((id) => !currentPageIds.has(id))
    return
  }
  const merged = new Set(selectedIds.value)
  for (const item of pagedLibrary.value) merged.add(item.id)
  selectedIds.value = Array.from(merged)
}

function openRenameDialog(item: ModelIdentityLibraryItem) {
  closeActionMenu()
  dialogTarget.value = item
  renameDraft.value = String(item.name || '').trim()
  dialogMode.value = 'rename'
}

function openDeleteDialog(item: ModelIdentityLibraryItem) {
  closeActionMenu()
  dialogTarget.value = item
  dialogMode.value = 'delete'
}

function closeDialog() {
  if (dialogBusy.value) return
  dialogMode.value = null
  dialogTarget.value = null
  renameDraft.value = ''
}

function closeCreatePanel() {
  createPanelOpen.value = false
  promptPreview.value = null
}

function openCreatePanel() {
  activeProfileSection.value = 'identity'
  promptPreview.value = null
  modelReferenceImages.value = []
  productType.value = 'general'
  modelProfileOptions.value = getRecommendedModelProfileOptions('general')
  createPanelOpen.value = true
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.models-custom-select') || target?.closest('.models-action-menu')) return
  closeDropdown()
  closeActionMenu()
}

async function copyText(text: string, successMessage: string) {
  const value = String(text || '').trim()
  if (!value) return
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      message.value = successMessage
      return
    }
  } catch {}
  const ok = window.prompt('请复制以下内容', value)
  if (ok !== null) {
    message.value = successMessage
  }
}

async function openModelImage(item: ModelIdentityLibraryItem) {
  const path = primaryMediaPath(item)
  if (!path) {
    message.value = '当前模特没有可打开的封面图'
    return
  }
  await window.api.shell.openPath(path)
}

async function revealModelImage(item: ModelIdentityLibraryItem) {
  const path = primaryMediaPath(item)
  if (!path) {
    message.value = '当前模特没有可定位的封面图'
    return
  }
  await window.api.shell.showItemInFolder(path)
}

async function renameModel(item: ModelIdentityLibraryItem) {
  const name = String(renameDraft.value || item.name || '').trim()
  if (!name || name === item.name) return
  try {
    dialogBusy.value = true
    await window.api.clone.renameModelIdentity({ id: item.id, name })
    await refreshLibrary()
    message.value = '模特名称已更新'
    closeDialog()
  } catch (e: any) {
    message.value = `重命名失败：${String(e?.message ?? e)}`
  } finally {
    dialogBusy.value = false
  }
}

async function deleteModel(item: ModelIdentityLibraryItem) {
  try {
    dialogBusy.value = true
    await window.api.clone.deleteModelIdentity({ id: item.id })
    if (selectedId.value === item.id) selectedId.value = ''
    selectedIds.value = selectedIds.value.filter((id) => id !== item.id)
    await refreshLibrary()
    message.value = '模特已删除'
    closeDialog()
  } catch (e: any) {
    message.value = `删除失败：${String(e?.message ?? e)}`
  } finally {
    dialogBusy.value = false
  }
}

async function deleteModelsBatch() {
  if (dialogBusy.value) return
  if (!selectedModels.value.length) {
    message.value = '请先选择要删除的模特'
    return
  }
  const total = selectedModels.value.length
  const ok = window.confirm(`确认批量删除已选的 ${total} 个模特吗？这会删除角色库记录和素材目录，但不会删除历史项目产物。`)
  if (!ok) return
  dialogBusy.value = true
  try {
    const targets = [...selectedModels.value]
    for (const item of targets) {
      await window.api.clone.deleteModelIdentity({ id: item.id })
      if (selectedId.value === item.id) selectedId.value = ''
    }
    selectedIds.value = []
    await refreshLibrary()
    message.value = `已批量删除 ${total} 个模特`
  } catch (e: any) {
    message.value = `批量删除失败：${String(e?.message ?? e)}`
  } finally {
    dialogBusy.value = false
  }
}

async function assignModelToProject(item: ModelIdentityLibraryItem) {
  closeActionMenu()
  const targetProjectId = projects.value[0]?.id
  if (!targetProjectId) {
    message.value = '请先选择来源项目'
    return
  }
  try {
    await window.api.clone.selectProjectModelIdentity({
      cloneProjectId: targetProjectId,
      identityId: item.id,
    })
    message.value = '已绑定到当前复刻项目'
  } catch (e: any) {
    message.value = `绑定失败：${String(e?.message ?? e)}`
  }
}

async function openCloneWithModel(item: ModelIdentityLibraryItem) {
  const targetProjectId = projects.value[0]?.id
  if (targetProjectId) {
    try {
      await window.api.clone.selectProjectModelIdentity({
        cloneProjectId: targetProjectId,
        identityId: item.id,
      })
    } catch {}
  }
  closeActionMenu()
  void router.push('/clone')
}

async function loadCredentials() {
  const c = await window.api.clone.getModelCredentials()
  openaiKey.value = String((c as any)?.openaiApiKey ?? '')
  openaiImageModel.value = String((c as any)?.openaiImageModel ?? 'gpt-image-2')
  openaiImageQuality.value =
    (c as any)?.openaiImageQuality === 'low' || (c as any)?.openaiImageQuality === 'medium'
      ? (c as any).openaiImageQuality
      : 'high'
  klingKey.value = String((c as any)?.klingApiKey ?? '')
  klingHost.value = normalizeAtlasCloudHost((c as any)?.klingHost)
  klingImageModel.value = String((c as any)?.klingImageModel ?? 'openai/gpt-image-1/edit')
  grsaiKey.value = String((c as any)?.grsaiApiKey ?? '')
  grsaiHost.value = String((c as any)?.grsaiHost ?? 'https://grsaiapi.com')
  grsaiImageModel.value = String((c as any)?.grsaiImageModel ?? 'gpt-image-2')
  apifoxImageApiKey.value = String((c as any)?.apifoxHub?.apiKey ?? '')
  apifoxImageBaseUrl.value = String((c as any)?.apifoxHub?.baseUrl ?? '')
  apifoxImageModel.value = String((c as any)?.apifoxHub?.imageModel ?? '')
  qiniuAccessKey.value = String((c as any)?.qiniuAccessKey ?? '')
  qiniuSecretKey.value = String((c as any)?.qiniuSecretKey ?? '')
  qiniuBucket.value = String((c as any)?.qiniuBucket ?? '')
  qiniuDomain.value = String((c as any)?.qiniuDomain ?? '')
  qiniuUploadHost.value = String((c as any)?.qiniuUploadHost ?? 'https://upload.qiniup.com')
  qiniuPrefix.value = String((c as any)?.qiniuPrefix ?? 'videogenerate/clone')
  imageProviderPrimary.value =
    (c as any)?.imageProviderPrimary === 'kling' ||
    (c as any)?.imageProviderPrimary === 'grsai' ||
    (c as any)?.imageProviderPrimary === 'apifox_hub'
      ? (c as any).imageProviderPrimary
      : 'openai'
}

async function saveCredentials() {
  await window.api.clone.setModelCredentials({
    openaiApiKey: openaiKey.value.trim() || undefined,
    openaiImageModel: openaiImageModel.value.trim() || 'gpt-image-2',
    openaiImageQuality: openaiImageQuality.value,
    imageProviderPrimary: imageProviderPrimary.value as any,
    klingApiKey: klingKey.value.trim() || undefined,
    klingHost: normalizeAtlasCloudHost(klingHost.value),
    klingImageModel: klingImageModel.value.trim() || 'openai/gpt-image-1/edit',
    grsaiApiKey: grsaiKey.value.trim() || undefined,
    grsaiHost: grsaiHost.value.trim() || 'https://grsaiapi.com',
    grsaiImageModel: grsaiImageModel.value.trim() || 'gpt-image-2',
    apifoxHub:
      imageProviderPrimary.value === 'apifox_hub' || apifoxImageApiKey.value.trim() || apifoxImageBaseUrl.value.trim() || apifoxImageModel.value.trim()
        ? {
            enabled: true,
            baseUrl: apifoxImageBaseUrl.value.trim() || undefined,
            apiKey: apifoxImageApiKey.value.trim() || undefined,
            imageModel: apifoxImageModel.value.trim() || undefined,
          }
        : undefined,
    qiniuAccessKey: qiniuAccessKey.value.trim() || undefined,
    qiniuSecretKey: qiniuSecretKey.value.trim() || undefined,
    qiniuBucket: qiniuBucket.value.trim() || undefined,
    qiniuDomain: qiniuDomain.value.trim() || undefined,
    qiniuUploadHost: qiniuUploadHost.value.trim() || 'https://upload.qiniup.com',
    qiniuPrefix: qiniuPrefix.value.trim() || 'videogenerate/clone',
    allowMockWhenNoKey: false,
    keyframeModel: 'local-product-frame',
  })
}

function currentImageProviderCredentials() {
  return {
    imageProviderPrimary: imageProviderPrimary.value as any,
    openaiApiKey: openaiKey.value.trim() || undefined,
    openaiImageModel: openaiImageModel.value.trim() || 'gpt-image-2',
    openaiImageQuality: openaiImageQuality.value,
    klingApiKey: klingKey.value.trim() || undefined,
    klingHost: normalizeAtlasCloudHost(klingHost.value),
    klingImageModel: klingImageModel.value.trim() || 'openai/gpt-image-1/edit',
    grsaiApiKey: grsaiKey.value.trim() || undefined,
    grsaiHost: grsaiHost.value.trim() || 'https://grsaiapi.com',
    grsaiImageModel: grsaiImageModel.value.trim() || 'gpt-image-2',
    apifoxHub:
      imageProviderPrimary.value === 'apifox_hub' || apifoxImageApiKey.value.trim() || apifoxImageBaseUrl.value.trim() || apifoxImageModel.value.trim()
        ? {
            enabled: true,
            baseUrl: apifoxImageBaseUrl.value.trim() || undefined,
            apiKey: apifoxImageApiKey.value.trim() || undefined,
            imageModel: apifoxImageModel.value.trim() || undefined,
          }
        : undefined,
    qiniuAccessKey: qiniuAccessKey.value.trim() || undefined,
    qiniuSecretKey: qiniuSecretKey.value.trim() || undefined,
    qiniuBucket: qiniuBucket.value.trim() || undefined,
    qiniuDomain: qiniuDomain.value.trim() || undefined,
    qiniuUploadHost: qiniuUploadHost.value.trim() || 'https://upload.qiniup.com',
    qiniuPrefix: qiniuPrefix.value.trim() || 'videogenerate/clone',
  }
}

async function refreshLibrary() {
  const rows = await window.api.clone.listModelIdentityLibrary()
  library.value = Array.isArray(rows) ? (rows as ModelIdentityLibraryItem[]) : []
  if (!selectedId.value && library.value[0]) selectedId.value = library.value[0].id
  if (selectedId.value && !library.value.some((item) => item.id === selectedId.value)) {
    selectedId.value = library.value[0]?.id ?? ''
  }
}

async function refreshProjects() {
  const rows = await window.api.clone.listProjects()
  projects.value = Array.isArray(rows) ? (rows as CloneProject[]) : []
}

async function refreshModelTasks() {
  const rows = await window.api.clone.listModelTasks()
  modelTasks.value = Array.isArray(rows) ? (rows as ModelTask[]) : []
  if (!modelTaskId.value && modelTasks.value[0]) modelTaskId.value = modelTasks.value[0].id
}

async function createModelTask(options?: { selectAsActive?: boolean }) {
  const created = await window.api.clone.createModelTask({
    title: '模特生成任务',
    description: '用于桌面端模特生成的独立任务',
    productType: productType.value,
  })
  const nextTaskId = String((created as any)?.id || '').trim()
  if (!nextTaskId) throw new Error('自动创建模特任务失败')
  if (options?.selectAsActive !== false) {
    modelTaskId.value = nextTaskId
  }
  await refreshModelTasks()
  return modelTaskId.value
}

async function pickModelReferenceImage() {
  const pickFilesOverride = (window as any).__VG_TEST_pickFiles as
    | ((input: { title: string; multiple: boolean; filters: Array<{ name: string; extensions: string[] }> }) => Promise<string[]>)
    | undefined
  const files = await (pickFilesOverride ?? window.api.pickFiles)({
    title: '选择参考模特图',
    filters: [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    multiple: false,
  })
  const next = (files ?? []).map((x: string) => String(x)).filter(Boolean)
  modelReferenceImages.value = next.slice(0, 1)
}

async function generateModel() {
  if (!hasModelReferenceInput.value) {
    message.value = '请先上传一张参考模特图'
    return
  }
  if (!imageProviderReady.value) {
    message.value =
      imageProviderPrimary.value === 'kling'
        ? '请先配置 AtlasCloud API Key'
        : imageProviderPrimary.value === 'grsai'
          ? '请先配置 GRS.AI API Key'
          : imageProviderPrimary.value === 'apifox_hub'
            ? '请先配置 VectorEngine 图片 API Key'
            : '请先配置 OpenAI API Key'
    return
  }
  message.value = '正在准备生成模特...'
  busy.value = true
  let pollTimer: ReturnType<typeof setInterval> | undefined
  try {
    const nextModelTaskId = await createModelTask()
    const plainModelProfileOptions = JSON.parse(JSON.stringify(modelProfileOptions.value || {}))
    const plainReferenceImagePaths = modelReferenceImages.value.map((item) => String(item || '')).filter(Boolean)
    const plainImageProviderCredentials = JSON.parse(JSON.stringify(currentImageProviderCredentials() || {}))
    await saveCredentials()
    pollTimer = setInterval(() => {
      refreshModelTasks().catch(() => {})
      refreshLibrary().catch(() => {})
    }, 2000)
    await window.api.clone.generateModelIdentityPack({
      modelTaskId: nextModelTaskId,
      productType: productType.value,
      productPoints: undefined,
      purpose: 'model_library',
      modelProfileOptions: plainModelProfileOptions,
      productReferenceImagePaths: [],
      modelReferenceImagePaths: plainReferenceImagePaths,
      imageProviderPrimary: imageProviderPrimary.value,
      openaiApiKey: openaiKey.value.trim() || undefined,
      openaiImageModel: openaiImageModel.value.trim() || 'gpt-image-2',
      openaiImageQuality: openaiImageQuality.value,
      klingApiKey: klingKey.value.trim() || undefined,
      klingHost: normalizeAtlasCloudHost(klingHost.value),
      klingImageModel: klingImageModel.value.trim() || 'openai/gpt-image-1/edit',
      grsaiApiKey: grsaiKey.value.trim() || undefined,
      grsaiHost: grsaiHost.value.trim() || 'https://grsaiapi.com',
      grsaiImageModel: grsaiImageModel.value.trim() || 'gpt-image-2',
      imageProviderCredentials: plainImageProviderCredentials,
    })
    await refreshLibrary()
    activeTab.value = 'all'
    statusFilter.value = 'all'
    page.value = 1
    selectedId.value = sortedLibrary.value[0]?.id ?? library.value[0]?.id ?? ''
    createPanelOpen.value = false
    modelProfileOptions.value = getRecommendedModelProfileOptions('general')
    modelReferenceImages.value = []
    message.value = '新模特已加入全局模特库'
  } catch (e: any) {
    console.error('[model-library] generateModel failed', e)
    message.value = `生成失败：${String(e?.message ?? e)}`
  } finally {
    if (pollTimer) clearInterval(pollTimer)
    busy.value = false
  }
}

async function generateModelsBatch() {
  const total = Math.max(1, Math.min(5, Math.floor(Number(batchGenerateCount.value) || 1)))
  if (total <= 1) {
    await generateModel()
    return
  }
  if (!hasModelReferenceInput.value) {
    message.value = '请先上传一张参考模特图'
    return
  }
  if (!imageProviderReady.value) {
    message.value =
      imageProviderPrimary.value === 'kling'
        ? '请先配置 AtlasCloud API Key'
        : imageProviderPrimary.value === 'grsai'
          ? '请先配置 GRS.AI API Key'
          : imageProviderPrimary.value === 'apifox_hub'
            ? '请先配置 VectorEngine 图片 API Key'
            : '请先配置 OpenAI API Key'
    return
  }
  message.value = `正在批量生成 ${total} 个模特...`
  busy.value = true
  let pollTimer: ReturnType<typeof setInterval> | undefined
  try {
    const plainModelProfileOptions = JSON.parse(JSON.stringify(modelProfileOptions.value || {}))
    const plainReferenceImagePaths = modelReferenceImages.value.map((item) => String(item || '')).filter(Boolean)
    const plainImageProviderCredentials = JSON.parse(JSON.stringify(currentImageProviderCredentials() || {}))
    await saveCredentials()
    pollTimer = setInterval(() => {
      refreshModelTasks().catch(() => {})
      refreshLibrary().catch(() => {})
    }, 2000)
    const concurrency = 2
    const jobs = Array.from({ length: total }, () => async () => {
      const nextModelTaskId = await createModelTask({ selectAsActive: false })
      return await window.api.clone.generateModelIdentityPack({
        modelTaskId: nextModelTaskId,
        productType: productType.value,
        productPoints: undefined,
        purpose: 'model_library' as const,
        modelProfileOptions: plainModelProfileOptions,
        productReferenceImagePaths: [],
        modelReferenceImagePaths: plainReferenceImagePaths,
        imageProviderPrimary: imageProviderPrimary.value,
        openaiApiKey: openaiKey.value.trim() || undefined,
        openaiImageModel: openaiImageModel.value.trim() || 'gpt-image-2',
        openaiImageQuality: openaiImageQuality.value,
        klingApiKey: klingKey.value.trim() || undefined,
        klingHost: normalizeAtlasCloudHost(klingHost.value),
        klingImageModel: klingImageModel.value.trim() || 'openai/gpt-image-1/edit',
        grsaiApiKey: grsaiKey.value.trim() || undefined,
        grsaiHost: grsaiHost.value.trim() || 'https://grsaiapi.com',
        grsaiImageModel: grsaiImageModel.value.trim() || 'gpt-image-2',
        imageProviderCredentials: plainImageProviderCredentials,
      })
    })
    const results: PromiseSettledResult<unknown>[] = []
    for (let start = 0; start < jobs.length; start += concurrency) {
      const chunk = jobs.slice(start, start + concurrency).map((job) => job())
      results.push(...(await Promise.allSettled(chunk)))
    }
    await refreshLibrary()
    activeTab.value = 'all'
    statusFilter.value = 'all'
    page.value = 1
    selectedId.value = sortedLibrary.value[0]?.id ?? library.value[0]?.id ?? ''
    createPanelOpen.value = false
    modelProfileOptions.value = getRecommendedModelProfileOptions('general')
    modelReferenceImages.value = []
    const successCount = results.filter((item) => item.status === 'fulfilled').length
    const failedCount = results.length - successCount
    message.value = `批量生成完成：成功 ${successCount} 个${failedCount ? `，失败 ${failedCount} 个` : ''}`
  } catch (e: any) {
    console.error('[model-library] generateModelsBatch failed', e)
    message.value = `批量生成失败：${String(e?.message ?? e)}`
  } finally {
    if (pollTimer) clearInterval(pollTimer)
    busy.value = false
  }
}

async function previewModelPrompt() {
  promptPreviewBusy.value = true
  try {
    const nextModelTaskId = modelTaskId.value || (await createModelTask())
    const plainModelProfileOptions = JSON.parse(JSON.stringify(modelProfileOptions.value || {}))
    const plainReferenceImagePaths = modelReferenceImages.value.map((item) => String(item || '')).filter(Boolean)
    const previewApi = window.api.clone.getModelIdentityPromptPreview
    if (typeof previewApi === 'function') {
      const result = await previewApi({
        modelTaskId: nextModelTaskId,
        productType: productType.value,
        productPoints: undefined,
        modelProfileOptions: plainModelProfileOptions,
        productReferenceImagePaths: [],
        modelReferenceImagePaths: plainReferenceImagePaths,
      })
      promptPreview.value = (result as ModelPromptPreview) || null
      message.value = '已生成当前创建模特的提示词预览'
      return
    }
    promptPreview.value = buildLocalModelPromptPreview({
      productType: productType.value,
      productPoints: undefined,
      modelProfileOptions: plainModelProfileOptions,
      productReferenceImagePaths: [],
      modelReferenceImagePaths: plainReferenceImagePaths,
    })
    message.value = '已使用本地兜底生成提示词预览，重启桌面端后会切换为主进程真实预览'
    return
  } catch (e: any) {
    console.error('[model-library] previewModelPrompt failed', e)
    message.value = `提示词预览失败：${String(e?.message ?? e)}`
  } finally {
    promptPreviewBusy.value = false
  }
}

function selectModelProfileOption(key: keyof ModelProfileOptions, value: NonNullable<ModelProfileOptions[keyof ModelProfileOptions]>) {
  modelProfileOptions.value = {
    ...modelProfileOptions.value,
    [key]: value,
  }
}

function closeMessage() {
  message.value = ''
}

function prevPage() {
  page.value = Math.max(1, page.value - 1)
}

function nextPage() {
  page.value = Math.min(totalPages.value, page.value + 1)
}

function setPage(value: number) {
  page.value = Math.min(totalPages.value, Math.max(1, value))
}

onMounted(async () => {
  document.addEventListener('click', handleDocumentClick)
  await loadCredentials()
  await Promise.all([refreshLibrary(), refreshProjects(), refreshModelTasks()])
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
})

watch(productType, (value) => {
  modelProfileOptions.value = getRecommendedModelProfileOptions(value)
  promptPreview.value = null
})

watch([activeTab, statusFilter, search], () => {
  page.value = 1
})
</script>

<template>
  <div class="vg-scope vg-page ml" data-testid="models-library-page">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><UserRound :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('modelLibrary.title') }}</h1>
        <p>{{ t('modelLibrary.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button type="button" class="vg-btn" @click="openCreatePanel"><Download :size="15" /> {{ t('modelLibrary.import') }}</button>
        <button type="button" class="vg-btn vg-btn--primary" data-testid="models-open-create" @click="openCreatePanel">
          <Wand2 :size="15" /> {{ t('modelLibrary.create') }}
        </button>
      </div>
    </header>

    <div class="ml-stats">
      <button
        v-for="stat in statusStats"
        :key="stat.key"
        type="button"
        class="ml-stat"
        :class="[`is-${stat.tone}`, { 'is-active': statusFilter === stat.key && activeTab === 'all' }]"
        @click="setStatusFilter(stat.key)"
      >
        <span class="ml-stat__icon">
          <Users v-if="stat.tone === 'total'" :size="16" />
          <CheckCircle2 v-else-if="stat.tone === 'ready'" :size="16" />
          <LoaderCircle v-else-if="stat.tone === 'generating'" :size="16" />
          <AlertCircle v-else :size="16" />
        </span>
        <span class="ml-stat__body">
          <b class="vg-num">{{ stat.value }}</b>
          <small>{{ stat.label }}</small>
        </span>
      </button>
    </div>

    <div class="ml-layout" :class="{ 'has-detail': selectedModel }">
      <!-- Catalog -->
      <section class="ml-catalog">
        <div class="ml-toolbar">
          <label class="vg-search ml-search">
            <Search :size="15" />
            <input v-model="search" class="vg-input" type="text" :placeholder="t('modelLibrary.searchPlaceholder')" />
          </label>
          <span class="ml-toolbar__count"><b class="vg-num">{{ sortedLibrary.length }}</b> {{ t('modelLibrary.modelsUnit') }}</span>
          <span class="vg-toolbar__spacer"></span>
          <template v-if="selectedIds.length">
            <span class="ml-toolbar__selected">{{ t('modelLibrary.selectedCount', { count: selectedIds.length }) }}</span>
            <button type="button" class="vg-btn vg-btn--danger vg-btn--sm" :disabled="dialogBusy" @click="deleteModelsBatch">
              <Trash2 :size="14" /> {{ dialogBusy ? t('modelLibrary.deleting') : t('modelLibrary.batchDelete', { count: selectedIds.length }) }}
            </button>
          </template>
          <button type="button" class="vg-btn vg-btn--ghost vg-btn--sm" @click="toggleSelectCurrentPage">
            {{ allCurrentPageSelected ? t('modelLibrary.unselectPage') : t('modelLibrary.selectPage') }}
          </button>
          <div class="ml-view">
            <button type="button" class="ml-view__btn" :class="{ 'is-active': viewMode === 'grid' }" @click="viewMode = 'grid'"><Grid2x2 :size="15" /></button>
            <button type="button" class="ml-view__btn" :class="{ 'is-active': viewMode === 'list' }" @click="viewMode = 'list'"><LayoutList :size="15" /></button>
          </div>
        </div>

        <div v-if="pagedLibrary.length" class="ml-grid" :class="{ 'is-list': viewMode === 'list' }">
          <article
            v-for="(item, index) in pagedLibrary"
            :key="item.id"
            class="ml-card"
            :class="{ 'is-active': selectedModel?.id === item.id, 'is-checked': selectedSet.has(item.id) }"
            @click="selectedId = item.id"
          >
            <div class="ml-card__media">
              <img v-if="item.coverImagePath || item.imagePaths?.[0]" :src="thumbnailUrl(item.coverImagePath || item.imagePaths?.[0], 360)" :alt="item.name" loading="lazy" decoding="async" />
              <span v-else class="ml-card__fallback">AI</span>
              <span v-if="item.status !== 'done'" class="ml-card__badge" :class="modelStatusTone(item.status)">
                <LoaderCircle v-if="item.status === 'generating'" :size="12" class="vg-spin" />
                {{ modelStatusText(item.status) }}
              </span>
              <label class="ml-card__check" @click.stop>
                <input type="checkbox" :checked="selectedSet.has(item.id)" @change="toggleSelected(item.id)" />
              </label>
            </div>

            <div class="ml-card__body">
              <div class="ml-card__main">
                <h3 :title="modelTitle(item, index)">
                  <span class="ml-dot" :class="modelStatusTone(item.status)"></span>
                  <span class="vg-ellipsis">{{ modelTitle(item, index) }}</span>
                </h3>
                <p class="ml-card__meta" :title="cardMeta(item)">{{ cardMeta(item) }}</p>
              </div>
              <span v-if="viewMode === 'list'" class="ml-card__date vg-num">{{ relativeDate(item.updatedAt || item.createdAt) }}</span>
              <div class="vg-menu-wrap">
                <button type="button" class="vg-icon-btn vg-icon-btn--sm" @click.stop="toggleActionMenu(item.id)"><MoreHorizontal :size="15" /></button>
                <div v-if="openActionMenu === item.id" class="vg-menu" @click.stop>
                  <button type="button" @click="assignModelToProject(item)">{{ t('modelLibrary.actions.assign') }}</button>
                  <button type="button" @click="openRenameDialog(item)">{{ t('modelLibrary.actions.rename') }}</button>
                  <button type="button" @click="copyText(item.name || modelTitle(item, index), t('modelLibrary.messages.nameCopied')); closeActionMenu()">{{ t('modelLibrary.actions.copyName') }}</button>
                  <button type="button" @click="revealModelImage(item); closeActionMenu()">{{ t('modelLibrary.actions.revealCover') }}</button>
                  <button type="button" class="danger" @click="openDeleteDialog(item)">{{ t('modelLibrary.actions.delete') }}</button>
                </div>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="vg-empty ml-empty">
          <span class="vg-empty__icon"><Sparkles :size="24" /></span>
          <p>{{ t('modelLibrary.empty') }}</p>
          <button type="button" class="vg-btn vg-btn--primary" @click="openCreatePanel"><Wand2 :size="15" /> {{ t('modelLibrary.create') }}</button>
        </div>

        <footer v-if="sortedLibrary.length" class="vg-pager ml-pager">
          <div class="vg-pager__group">
            <span>{{ t('modelLibrary.totalCount', { count: sortedLibrary.length }) }}</span>
            <select v-model="pageSize" class="vg-select vg-select--sm" :aria-label="pageSizeLabel">
              <option v-for="option in pageSizeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>
          <div class="vg-pager__group">
            <button type="button" class="vg-pg" :disabled="page <= 1" @click="prevPage"><ArrowLeft :size="14" /></button>
            <button v-for="n in pages" :key="n" type="button" class="vg-pg" :class="{ 'is-active': page === n }" @click="setPage(n)">{{ n }}</button>
            <button type="button" class="vg-pg" :disabled="page >= totalPages" @click="nextPage"><ArrowRight :size="14" /></button>
          </div>
        </footer>
      </section>

      <!-- Detail -->
      <aside v-if="selectedModel" class="ml-detail">
        <div class="ml-detail__hero">
          <img v-if="selectedHeroImage" :src="thumbnailUrl(selectedHeroImage, 720)" :alt="selectedModel.name" decoding="async" @dblclick="openModelImage(selectedModel)" />
          <span v-else class="ml-card__fallback">AI</span>
          <button type="button" class="ml-detail__close" :aria-label="t('common.cancel')" @click="selectedId = ''"><X :size="15" /></button>
        </div>
        <div v-if="selectedImages.length > 1" class="ml-detail__thumbs">
          <button
            v-for="(image, imageIndex) in selectedImages.slice(0, 6)"
            :key="`${selectedModel.id}-${imageIndex}`"
            type="button"
            class="ml-detail__thumb"
            :class="{ 'is-active': selectedHeroImage === image }"
            @click="activeImageIndex = imageIndex"
          >
            <img :src="thumbnailUrl(image, 160)" :alt="`${selectedModel.name}-${imageIndex}`" decoding="async" />
          </button>
        </div>

        <div class="ml-detail__title">
          <div class="ml-detail__name">
            <h2>{{ selectedModel.name || t('modelLibrary.unnamed') }}</h2>
            <span class="vg-pill vg-pill--dot" :class="statusPill(selectedModel.status)">{{ modelStatusText(selectedModel.status) }}</span>
          </div>
          <p>{{ t('modelLibrary.spec.updated', { time: formatDate(selectedModel.updatedAt || selectedModel.createdAt) }) }}</p>
        </div>

        <div class="ml-detail__actions">
          <button type="button" class="vg-btn vg-btn--primary" @click="openCloneWithModel(selectedModel)">{{ t('modelLibrary.actions.use') }}</button>
          <button type="button" class="vg-btn" @click="openRenameDialog(selectedModel)"><Pencil :size="14" /> {{ t('modelLibrary.actions.edit') }}</button>
          <div class="vg-menu-wrap">
            <button type="button" class="vg-btn ml-detail__more" @click.stop="toggleActionMenu(`detail:${selectedModel.id}`)"><MoreHorizontal :size="16" /></button>
            <div v-if="openActionMenu === `detail:${selectedModel.id}`" class="vg-menu" @click.stop>
              <button type="button" @click="assignModelToProject(selectedModel)">{{ t('modelLibrary.actions.assign') }}</button>
              <button type="button" @click="openModelImage(selectedModel); closeActionMenu()">{{ t('modelLibrary.actions.openCover') }}</button>
              <button type="button" @click="revealModelImage(selectedModel); closeActionMenu()">{{ t('modelLibrary.actions.revealCover') }}</button>
              <button type="button" class="danger" @click="openDeleteDialog(selectedModel)">{{ t('modelLibrary.actions.delete') }}</button>
            </div>
          </div>
        </div>

        <div v-if="selectedModel.error" class="vg-notice vg-notice--danger"><span>{{ selectedModel.error }}</span></div>

        <section v-if="selectedSpecs.length" class="ml-detail__section">
          <h4>{{ t('modelLibrary.spec.profile') }}</h4>
          <dl class="ml-spec">
            <div v-for="row in selectedSpecs" :key="row.key" class="ml-spec__item">
              <dt>{{ row.label }}</dt>
              <dd :title="row.value">{{ row.value }}</dd>
            </div>
          </dl>
        </section>

        <section class="ml-detail__section">
          <h4>{{ t('modelLibrary.details.description') }}</h4>
          <p class="ml-detail__desc">{{ modelDescriptionPreview(selectedModel.description) }}</p>
        </section>

        <section class="ml-detail__section">
          <h4>{{ t('modelLibrary.spec.meta') }}</h4>
          <dl class="ml-meta">
            <dt>{{ t('modelLibrary.details.id') }}</dt>
            <dd class="ml-meta__id">
              <code :title="selectedModel.id">{{ selectedModel.id || '--' }}</code>
              <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('modelLibrary.spec.copyId')" @click="copyText(selectedModel.id, t('modelLibrary.messages.idCopied'))"><Copy :size="13" /></button>
            </dd>
            <dt>{{ t('modelLibrary.modelProvider') }}</dt><dd>{{ languageText(selectedModel) }}</dd>
            <dt>{{ t('modelLibrary.details.createdAt') }}</dt><dd class="vg-num">{{ formatDate(selectedModel.createdAt) }}</dd>
            <dt>{{ t('modelLibrary.spec.gallery') }}</dt><dd>{{ t('modelLibrary.spec.images', { count: selectedImages.length }) }}</dd>
          </dl>
        </section>
      </aside>
    </div>

    <!-- Create dialog -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="createPanelOpen" class="vg-scope vg-backdrop" @click="closeCreatePanel">
          <div class="vg-dialog vg-dialog--xl ml-create" data-testid="models-create-dialog" @click.stop>
            <header class="vg-dialog__head">
              <div class="vg-dialog__title">
                <span class="vg-dialog__title-icon"><Wand2 :size="19" /></span>
                <div>
                  <h2>{{ t('modelLibrary.createDialog.title') }}</h2>
                  <p>{{ t('modelLibrary.createDialog.desc') }}</p>
                </div>
              </div>
              <button type="button" class="vg-icon-btn" @click="closeCreatePanel"><X :size="18" /></button>
            </header>

            <div class="vg-dialog__body ml-create__body">
              <section class="vg-stack">
                <div>
                  <div class="vg-section-title">{{ t('modelLibrary.createDialog.basic') }}</div>
                  <p class="vg-muted ml-create__hint">{{ t('modelLibrary.createDialog.basicDesc') }}</p>
                </div>

                <div class="vg-notice vg-notice--accent ml-create__summary">
                  <Sparkles :size="16" />
                  <div>
                    <b>{{ t('modelLibrary.createDialog.summary') }}</b> <span class="vg-muted">{{ t('modelLibrary.createDialog.summaryHint') }}</span>
                    <p>{{ modelProfileSummaryText }}</p>
                    <div v-if="modelProfileSummaryItems.length" class="vg-row ml-create__chips">
                      <span v-for="item in modelProfileSummaryItems" :key="item" class="vg-chip">{{ item }}</span>
                    </div>
                  </div>
                </div>

                <div class="vg-tabs">
                  <button
                    v-for="section in modelProfileSections"
                    :key="section.key"
                    type="button"
                    class="vg-tabs__btn"
                    :class="{ 'is-active': activeProfileSection === section.key }"
                    :title="section.description"
                    @click="activeProfileSection = section.key"
                  >
                    {{ section.label }}
                  </button>
                </div>

                <div class="vg-stack ml-create__groups">
                  <div
                    v-for="group in modelProfileSections.find((section) => section.key === activeProfileSection)?.groups || []"
                    :key="group.key"
                    class="ml-group"
                  >
                    <div class="ml-group__head"><strong>{{ group.label }}</strong> <small class="vg-muted">{{ group.description }}</small></div>
                    <div class="vg-row ml-group__options">
                      <button
                        v-for="option in group.options"
                        :key="option.value"
                        type="button"
                        class="vg-btn vg-btn--sm"
                        :class="{ 'is-active': modelProfileOptions[group.key] === option.value }"
                        @click="selectModelProfileOption(group.key, option.value)"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>
                </div>

                <div class="ml-group">
                  <div class="ml-group__head"><strong>{{ t('modelLibrary.createDialog.batchCount') }}</strong></div>
                  <div class="vg-seg">
                    <button
                      v-for="option in batchGenerateOptions"
                      :key="option.value"
                      type="button"
                      class="vg-seg__btn"
                      :class="{ 'is-active': batchGenerateCount === option.value }"
                      :disabled="busy"
                      @click="batchGenerateCount = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
              </section>

              <section class="vg-card vg-card--soft vg-stack ml-create__side">
                <div>
                  <div class="vg-section-title">{{ t('modelLibrary.createDialog.reference') }} <span class="vg-count">{{ modelReferenceImages.length }}</span></div>
                  <p class="vg-muted ml-create__hint">{{ t('modelLibrary.createDialog.referenceDesc') }}</p>
                </div>

                <div class="ml-upload">
                  <div class="ml-upload__preview">
                    <img v-if="uploadPreviewHero" :src="mediaUrl(uploadPreviewHero)" alt="upload-preview" />
                    <span v-else class="vg-muted">{{ t('modelLibrary.createDialog.previewHint') }}</span>
                  </div>
                  <div class="ml-upload__copy">
                    <strong>{{ t('modelLibrary.createDialog.uploadPanel') }}</strong>
                    <p class="vg-muted">{{ t('modelLibrary.createDialog.uploadDesc') }}</p>
                    <button type="button" class="vg-btn vg-btn--soft vg-btn--sm" data-testid="models-upload-main" @click="pickModelReferenceImage">
                      <ImagePlus :size="14" /> {{ t('modelLibrary.createDialog.upload') }}
                    </button>
                  </div>
                </div>

                <div v-if="activeModelTask" class="vg-notice"><LoaderCircle :size="15" class="vg-spin" /><span>{{ t('modelLibrary.createDialog.currentTask') }}: {{ activeModelTask.title }} · {{ activeModelTask.status }}</span></div>
                <div v-if="message" class="vg-notice vg-notice--accent"><span>{{ message }}</span></div>
                <div v-if="imageProviderMissingText" class="vg-notice vg-notice--danger"><span>{{ imageProviderMissingText }}</span></div>

                <div class="ml-prompt">
                  <div class="ml-prompt__head">
                    <div>
                      <strong>{{ t('modelLibrary.createDialog.promptTitle') }}</strong>
                      <small class="vg-muted">{{ t('modelLibrary.createDialog.promptDesc') }}</small>
                    </div>
                    <div class="vg-row">
                      <button type="button" class="vg-btn vg-btn--sm" :disabled="promptPreviewBusy" @click="previewModelPrompt">
                        {{ promptPreviewBusy ? t('modelLibrary.status.generating') : t('modelLibrary.createDialog.viewPrompt') }}
                      </button>
                      <button
                        type="button"
                        class="vg-btn vg-btn--sm"
                        :disabled="!(promptPreview?.prompt || '')"
                        @click="copyText(promptPreview?.prompt || '', t('modelLibrary.messages.promptCopied'))"
                      >
                        {{ t('modelLibrary.createDialog.copyPrompt') }}
                      </button>
                    </div>
                  </div>
                  <template v-if="promptPreview">
                    <div class="vg-row ml-create__chips">
                      <span class="vg-chip">{{ promptPreview.profile.gender || t('modelLibrary.createDialog.unsetGender') }}</span>
                      <span class="vg-chip">{{ promptPreview.profile.market || t('modelLibrary.createDialog.unsetMarket') }}</span>
                      <span class="vg-chip">{{ promptPreview.profile.outfitStyle || t('modelLibrary.createDialog.unsetOutfit') }}</span>
                      <span class="vg-chip">{{ promptPreview.profile.sceneStyle || t('modelLibrary.createDialog.unsetScene') }}</span>
                      <span class="vg-chip">{{ t('modelLibrary.createDialog.referenceCount', { count: (promptPreview as any).modelReferenceImageCount || 0 }) }}</span>
                    </div>
                    <p class="vg-secondary ml-prompt__summary">{{ promptPreview.description }}</p>
                    <textarea :value="promptPreview.prompt" readonly class="vg-textarea ml-prompt__text"></textarea>
                  </template>
                  <p v-else class="vg-muted ml-prompt__empty">{{ t('modelLibrary.createDialog.promptEmpty') }}</p>
                </div>
              </section>
            </div>

            <footer class="vg-dialog__foot">
              <span class="vg-muted ml-create__hint">{{ t('modelLibrary.createDialog.batchCount') }}: {{ batchGenerateCount }}</span>
              <div class="vg-dialog__foot-actions">
                <button type="button" class="vg-btn" @click="closeCreatePanel">{{ t('common.cancel') }}</button>
                <button class="vg-btn vg-btn--primary" data-testid="models-generate-submit" type="button" :disabled="busy || !hasModelReferenceInput" @click="generateModelsBatch">
                  <LoaderCircle v-if="busy" :size="15" class="vg-spin" /><Wand2 v-else :size="15" />
                  {{ busy ? t('modelLibrary.createDialog.generating') : t('modelLibrary.createDialog.generate') }}
                </button>
              </div>
            </footer>
          </div>
        </div>
      </transition>

      <!-- Rename / delete -->
      <transition name="fade">
        <div v-if="dialogMode && dialogTarget" class="vg-scope vg-backdrop" @click="closeDialog">
          <div class="vg-dialog" role="dialog" aria-modal="true" @click.stop>
            <header class="vg-dialog__head">
              <div class="vg-dialog__title">
                <span class="vg-dialog__title-icon" :class="{ 'ml-danger-icon': dialogMode !== 'rename' }">
                  <Pencil v-if="dialogMode === 'rename'" :size="18" /><Trash2 v-else :size="18" />
                </span>
                <div>
                  <h2>{{ dialogMode === 'rename' ? t('modelLibrary.renameDialog.title') : t('modelLibrary.deleteDialog.title') }}</h2>
                  <p v-if="dialogMode === 'rename'">{{ t('modelLibrary.renameDialog.desc') }}</p>
                </div>
              </div>
              <button type="button" class="vg-icon-btn" @click="closeDialog"><X :size="18" /></button>
            </header>
            <div class="vg-dialog__body">
              <div v-if="dialogMode === 'rename'" class="vg-field">
                <label for="ml-rename">{{ t('modelLibrary.renameDialog.name') }}</label>
                <input id="ml-rename" v-model="renameDraft" class="vg-input" type="text" :placeholder="t('modelLibrary.renameDialog.placeholder')" />
              </div>
              <p v-else class="vg-secondary">{{ t('modelLibrary.deleteDialog.desc', { name: dialogTarget.name || t('modelLibrary.unnamed') }) }}</p>
            </div>
            <footer class="vg-dialog__foot">
              <div class="vg-dialog__foot-actions">
                <button type="button" class="vg-btn" :disabled="dialogBusy" @click="closeDialog">{{ t('common.cancel') }}</button>
                <button
                  v-if="dialogMode === 'rename'"
                  type="button"
                  class="vg-btn vg-btn--primary"
                  :disabled="dialogBusy || !renameDraft.trim()"
                  @click="renameModel(dialogTarget)"
                >
                  <LoaderCircle v-if="dialogBusy" :size="15" class="vg-spin" />
                  {{ dialogBusy ? t('modelLibrary.renameDialog.saving') : t('modelLibrary.renameDialog.save') }}
                </button>
                <button v-else type="button" class="vg-btn vg-btn--danger" :disabled="dialogBusy" @click="deleteModel(dialogTarget)">
                  {{ dialogBusy ? t('modelLibrary.deleting') : t('modelLibrary.deleteDialog.confirm') }}
                </button>
              </div>
            </footer>
          </div>
        </div>
      </transition>

      <transition name="vg-toast">
        <div v-if="message" class="vg-scope vg-toast vg-toast--success models-toast">
          <span>{{ message }}</span>
          <button type="button" class="vg-icon-btn vg-icon-btn--sm" @click="closeMessage"><X :size="14" /></button>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.ml { width: min(1560px, 100%); margin: 0 auto; gap: 18px; padding-top: 22px; }

/* Header */
.ml-head { display: flex; align-items: flex-end; gap: 20px; flex-wrap: wrap; }
.ml-head__text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ml-head__eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--vg-accent); }
.ml-head h1 { font-size: 26px; font-weight: 700; line-height: 1.2; letter-spacing: -.01em; color: var(--theme-text); }
.ml-head p { font-size: 13px; color: var(--theme-text-muted); }
.ml-head__actions { margin-left: auto; display: inline-flex; gap: 10px; }
.ml-head__actions .vg-btn { height: 38px; padding: 0 18px; border-radius: 10px; }

/* Stats */
.ml-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.ml-stat { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); color: var(--theme-text); text-align: left; cursor: pointer; transition: border-color .15s, background .15s; --tone: var(--theme-text-secondary); }
.ml-stat.is-total { --tone: var(--vg-accent); }
.ml-stat.is-ready { --tone: var(--vg-green); }
.ml-stat.is-generating { --tone: var(--vg-blue); }
.ml-stat.is-failed { --tone: var(--vg-red); }
.ml-stat:hover { border-color: var(--theme-border-control); }
.ml-stat.is-active { border-color: color-mix(in srgb, var(--tone) 55%, transparent); background: color-mix(in srgb, var(--tone) 7%, var(--theme-panel)); }
.ml-stat__icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; color: var(--tone); background: color-mix(in srgb, var(--tone) 12%, transparent); flex-shrink: 0; }
.ml-stat__body { display: flex; flex-direction: column; line-height: 1.2; min-width: 0; }
.ml-stat__body b { font-size: 20px; font-weight: 700; }
.ml-stat__body small { font-size: 12px; color: var(--theme-text-muted); margin-top: 3px; }

/* Layout */
.ml-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; }
.ml-layout.has-detail { grid-template-columns: minmax(0, 1fr) 360px; }

/* Catalog */
.ml-catalog { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.ml-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ml-search { width: 300px; }
.ml-search .vg-input { height: 36px; border-radius: 10px; background: var(--theme-panel); }
.ml-toolbar__count { font-size: 12px; color: var(--theme-text-muted); }
.ml-toolbar__count b { font-size: 14px; color: var(--theme-text); margin-right: 2px; }
.ml-toolbar__selected { font-size: 12px; color: var(--vg-accent); font-weight: 600; }
.ml-view { display: inline-flex; padding: 3px; gap: 2px; border: 1px solid var(--theme-border); border-radius: 9px; background: var(--theme-panel); }
.ml-view__btn { display: grid; place-items: center; width: 28px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-muted); cursor: pointer; }
.ml-view__btn:hover { color: var(--theme-text); }
.ml-view__btn.is-active { background: var(--theme-panel-soft); color: var(--theme-text); box-shadow: inset 0 0 0 1px var(--theme-border); }

/* Grid cards */
.ml-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 22px 18px; }
.ml-card { display: flex; flex-direction: column; gap: 10px; min-width: 0; cursor: pointer; }
.ml-card__media { position: relative; aspect-ratio: 3 / 4; border-radius: 14px; overflow: hidden; background: var(--theme-panel-soft); outline: 1px solid var(--theme-border); outline-offset: -1px; transition: box-shadow .2s, outline-color .2s; }
.ml-card__media img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .35s ease; }
.ml-card:hover .ml-card__media img { transform: scale(1.03); }
.ml-card:hover .ml-card__media { box-shadow: var(--theme-shadow-float); }
.ml-card.is-active .ml-card__media { outline: 2px solid var(--vg-accent); outline-offset: 2px; }
.ml-card__fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; color: var(--vg-accent); background: var(--vg-accent-soft); }
.ml-card__badge { position: absolute; left: 10px; bottom: 10px; display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px; border-radius: 999px; font-size: 11px; font-weight: 600; color: #fff; background: rgba(15, 18, 24, .62); backdrop-filter: blur(8px); }
.ml-card__badge.is-failed { background: color-mix(in srgb, var(--vg-red) 82%, #000); }
.ml-card__check { position: absolute; top: 10px; right: 10px; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 8px; background: rgba(15, 18, 24, .5); backdrop-filter: blur(8px); cursor: pointer; opacity: 0; transition: opacity .15s; }
.ml-card:hover .ml-card__check, .ml-card.is-checked .ml-card__check { opacity: 1; }
.ml-card.is-checked .ml-card__media { outline: 2px solid var(--vg-accent); outline-offset: 2px; }
.ml-card__body { display: flex; align-items: flex-start; gap: 8px; padding: 0 2px; min-width: 0; }
.ml-card__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ml-card__main h3 { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; color: var(--theme-text); min-width: 0; }
.ml-card__meta { font-size: 12px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ml-card__date { font-size: 12px; color: var(--theme-text-muted); white-space: nowrap; }
.ml-card .vg-menu-wrap .vg-icon-btn { margin-top: -3px; }
.ml-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--vg-gray); }
.ml-dot.is-done { background: var(--vg-green); box-shadow: 0 0 0 3px color-mix(in srgb, var(--vg-green) 18%, transparent); }
.ml-dot.is-generating { background: var(--vg-blue); }
.ml-dot.is-failed { background: var(--vg-red); }

/* List view */
.ml-grid.is-list { grid-template-columns: 1fr; gap: 0; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); overflow: visible; }
.ml-grid.is-list .ml-card { flex-direction: row; align-items: center; gap: 14px; padding: 10px 14px; border-bottom: 1px solid var(--theme-divider); }
.ml-grid.is-list .ml-card:last-child { border-bottom: 0; }
.ml-grid.is-list .ml-card:hover { background: var(--theme-panel-soft); }
.ml-grid.is-list .ml-card.is-active { background: var(--vg-accent-soft); }
.ml-grid.is-list .ml-card__media { width: 48px; border-radius: 8px; flex-shrink: 0; }
.ml-grid.is-list .ml-card.is-active .ml-card__media { outline-width: 1px; outline-offset: -1px; }
.ml-grid.is-list .ml-card__badge, .ml-grid.is-list .ml-card__check { display: none; }
.ml-grid.is-list .ml-card__body { flex: 1; align-items: center; }

.ml-empty { border: 1px dashed var(--theme-border-control); border-radius: 14px; padding: 60px 16px; }
.ml-pager { padding-top: 14px; border-top: 1px solid var(--theme-divider); }

/* Detail */
.ml-detail { position: sticky; top: 0; display: flex; flex-direction: column; gap: 16px; padding: 14px; border: 1px solid var(--theme-border); border-radius: 16px; background: var(--theme-panel); max-height: calc(100vh - var(--app-titlebar-height) - 40px); overflow-y: auto; }
.ml-detail > * { flex-shrink: 0; }
.ml-detail__hero { position: relative; aspect-ratio: 4 / 5; border-radius: 12px; overflow: hidden; background: var(--theme-panel-soft); }
.ml-detail__hero img { width: 100%; height: 100%; object-fit: cover; display: block; cursor: zoom-in; }
.ml-detail__close { position: absolute; top: 10px; right: 10px; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 9px; color: #fff; background: rgba(15, 18, 24, .5); backdrop-filter: blur(8px); cursor: pointer; }
.ml-detail__close:hover { background: rgba(15, 18, 24, .75); }
.ml-detail__thumbs { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; margin-top: -6px; }
.ml-detail__thumb { padding: 0; aspect-ratio: 1; border: 0; border-radius: 7px; overflow: hidden; background: var(--theme-panel-soft); cursor: pointer; opacity: .6; outline: 1px solid var(--theme-border); outline-offset: -1px; transition: opacity .15s; }
.ml-detail__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ml-detail__thumb:hover { opacity: 1; }
.ml-detail__thumb.is-active { opacity: 1; outline: 2px solid var(--vg-accent); }
.ml-detail__title { display: flex; flex-direction: column; gap: 4px; padding: 0 2px; }
.ml-detail__name { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ml-detail__name h2 { font-size: 19px; font-weight: 700; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ml-detail__title p { font-size: 12px; color: var(--theme-text-muted); }
.ml-detail__actions { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; }
.ml-detail__actions .vg-btn { height: 38px; border-radius: 10px; }
.ml-detail__more { width: 38px; padding: 0; }
.ml-detail__section { display: flex; flex-direction: column; gap: 10px; padding: 14px 2px 0; border-top: 1px solid var(--theme-divider); }
.ml-detail__section h4 { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--theme-text-muted); }
.ml-spec { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
.ml-spec__item { display: flex; flex-direction: column; gap: 3px; padding: 9px 11px; border-radius: 9px; background: var(--theme-panel-soft); min-width: 0; }
.ml-spec__item dt { font-size: 11px; color: var(--theme-text-muted); }
.ml-spec__item dd { margin: 0; font-size: 12.5px; font-weight: 500; color: var(--theme-text); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ml-detail__desc { font-size: 12.5px; line-height: 1.7; color: var(--theme-text-secondary); }
.ml-meta { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 9px 16px; margin: 0; font-size: 12.5px; }
.ml-meta dt { color: var(--theme-text-muted); }
.ml-meta dd { margin: 0; text-align: right; color: var(--theme-text); min-width: 0; }
.ml-meta__id { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
.ml-meta__id code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 12px ui-monospace, SFMono-Regular, Consolas, monospace; color: var(--theme-text-secondary); }
.ml-meta__id .vg-icon-btn { margin: -4px -4px -4px 0; }

/* Create dialog */
.ml-create { max-height: 92vh; }
.ml-create__body { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.ml-create__hint { font-size: 12px; margin-top: 2px; }
.ml-create__summary p { margin-top: 4px; color: var(--theme-text); }
.ml-create__chips { gap: 4px; margin-top: 6px; }
.ml-group { display: flex; flex-direction: column; gap: 8px; }
.ml-group__head strong { font-size: 13px; }
.ml-group__head small { font-size: 11px; margin-left: 4px; }
.ml-group__options { gap: 6px; }
.ml-create__side { gap: 12px; }
.ml-upload { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 12px; align-items: center; }
.ml-upload__preview { display: flex; align-items: center; justify-content: center; aspect-ratio: 3 / 4; border: 1px dashed var(--theme-border-control); border-radius: var(--vg-radius-sm); background: var(--theme-panel); overflow: hidden; padding: 6px; text-align: center; font-size: 11px; }
.ml-upload__preview img { width: 100%; height: 100%; object-fit: cover; border-radius: 6px; }
.ml-upload__copy { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.ml-upload__copy p { font-size: 12px; }
.ml-prompt { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px solid var(--theme-divider); }
.ml-prompt__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.ml-prompt__head strong { display: block; font-size: 13px; }
.ml-prompt__head small { font-size: 11px; }
.ml-prompt__summary { font-size: 12px; }
.ml-prompt__text { min-height: 140px; font: 12px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; }
.ml-prompt__empty { font-size: 12px; }
.ml-danger-icon { background: color-mix(in srgb, var(--vg-red) 14%, transparent); border-color: color-mix(in srgb, var(--vg-red) 40%, transparent); color: var(--vg-red); }

.fade-enter-active, .fade-leave-active { transition: opacity .18s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 1180px) {
  .ml-layout.has-detail { grid-template-columns: minmax(0, 1fr); }
  .ml-detail { position: static; max-height: none; }
  .ml-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ml-create__body { grid-template-columns: 1fr; }
}
</style>
