/**
 * Recipes = ready-made plans for the AI producer. Each recipe collects a few inputs and turns them
 * into a fixed intent list; the plan is still shown as a plan card and must be approved.
 */
export type RecipeFieldType = 'product' | 'products' | 'videos' | 'images' | 'links' | 'number' | 'toggle' | 'select' | 'datetime' | 'text' | 'scheme'

export type RecipeField = {
  key: string
  type: RecipeFieldType
  labelKey: string
  hintKey?: string
  required?: boolean
  min?: number
  max?: number
  defaultValue?: unknown
  options?: Array<{ value: string; labelKey: string }>
  /** Only show when another field has this value. */
  when?: { key: string; equals: unknown }
}

export type RecipeValues = Record<string, any>

export type RecipeBuild = {
  prompt: string
  context: Record<string, unknown>
  plan: { intents: string[]; summary: string }
}

export type Recipe = {
  id: string
  icon: 'rocket' | 'clapperboard' | 'images' | 'flame' | 'trophy' | 'send' | 'link'
  tone: 'accent' | 'blue' | 'violet' | 'amber' | 'red' | 'green'
  titleKey: string
  descKey: string
  outputKey: string
  fields: RecipeField[]
  build: (values: RecipeValues, t: (key: string, params?: Record<string, unknown>) => string) => RecipeBuild
}

function paths(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item : String(item?.filePath || item?.path || ''))).filter(Boolean) : []
}

export const AI_RECIPES: Recipe[] = [
  {
    // End-to-end pipeline: products → references → videos → review → publish drafts → insights.
    id: 'autopilot',
    icon: 'rocket',
    tone: 'accent',
    titleKey: 'ai.recipes.autopilot.title',
    descKey: 'ai.recipes.autopilot.desc',
    outputKey: 'ai.recipes.autopilot.output',
    fields: [
      {
        key: 'source',
        type: 'select',
        labelKey: 'ai.fields.autopilotSource',
        defaultValue: 'scheme',
        options: [
          { value: 'scheme', labelKey: 'ai.fields.sourceScheme' },
          { value: 'link', labelKey: 'ai.fields.sourceLink' },
          { value: 'products', labelKey: 'ai.fields.sourceProducts' },
        ],
      },
      { key: 'schemeId', type: 'scheme', labelKey: 'ai.fields.scheme', required: true, when: { key: 'source', equals: 'scheme' } },
      { key: 'url', type: 'text', labelKey: 'ai.fields.productUrl', required: true, when: { key: 'source', equals: 'link' } },
      { key: 'productName', type: 'text', labelKey: 'ai.fields.productNameOptional', when: { key: 'source', equals: 'link' } },
      { key: 'productIds', type: 'products', labelKey: 'ai.fields.products', required: true, when: { key: 'source', equals: 'products' } },
      {
        key: 'referenceMode',
        type: 'select',
        labelKey: 'ai.fields.referenceMode',
        defaultValue: 'auto',
        options: [
          { value: 'auto', labelKey: 'ai.fields.referenceAuto' },
          { value: 'links', labelKey: 'ai.fields.referenceLinks' },
        ],
      },
      { key: 'referenceCount', type: 'number', labelKey: 'ai.fields.referenceCount', hintKey: 'ai.fields.referenceCountHint', min: 1, max: 3, defaultValue: 1, when: { key: 'referenceMode', equals: 'auto' } },
      { key: 'links', type: 'links', labelKey: 'ai.fields.viralLinks', hintKey: 'ai.fields.viralLinksHint', required: true, when: { key: 'referenceMode', equals: 'links' } },
      { key: 'variantCount', type: 'number', labelKey: 'ai.fields.variantCount', hintKey: 'ai.fields.variantCountHint', min: 1, max: 6, defaultValue: 2 },
      { key: 'livePhoto', type: 'toggle', labelKey: 'ai.fields.shotsToLivePhoto', defaultValue: true },
      { key: 'listing', type: 'toggle', labelKey: 'ai.fields.autopilotListing', hintKey: 'ai.fields.autopilotListingHint', defaultValue: false },
      { key: 'listingPrice', type: 'text', labelKey: 'ai.fields.listingPrice', hintKey: 'ai.fields.listingPriceHint', required: true, when: { key: 'listing', equals: true } },
      {
        key: 'titleLanguage',
        type: 'select',
        labelKey: 'ai.fields.listingLanguage',
        defaultValue: 'en-US',
        when: { key: 'listing', equals: true },
        options: [
          { value: 'en-US', labelKey: 'ai.fields.langEn' },
          { value: 'vi-VN', labelKey: 'ai.fields.langVi' },
          { value: 'zh-CN', labelKey: 'ai.fields.langZh' },
        ],
      },
      { key: 'autoApprove', type: 'toggle', labelKey: 'ai.fields.autoApprove', hintKey: 'ai.fields.autoApproveHint', defaultValue: false },
      { key: 'startAt', type: 'datetime', labelKey: 'ai.fields.startAt', hintKey: 'ai.fields.startAtHint', when: { key: 'autoApprove', equals: true } },
      { key: 'intervalHours', type: 'number', labelKey: 'ai.fields.intervalHours', min: 0, max: 72, defaultValue: 4, when: { key: 'autoApprove', equals: true } },
    ],
    build: (values, t) => {
      const links = String(values.links || '').split(/\s+/).map((item) => item.trim()).filter((item) => /^https?:\/\//i.test(item))
      const useLinks = values.referenceMode === 'links'
      const autoApprove = values.autoApprove === true
      const sourceIntent = values.source === 'scheme' ? ['Intent.ProductResearchPromote'] : values.source === 'link' ? ['Intent.ProductImportFromLink'] : []
      const intents = [
        'Intent.SystemHealthCheck',
        ...sourceIntent,
        'Intent.ProductAnalyze',
        useLinks ? 'Intent.SourceVideoImport' : 'Intent.ReferenceDiscover',
        'Intent.CommerceVideoCreate',
        ...(values.livePhoto ? ['Intent.CloneShotsSend'] : []),
        'Intent.OutputsAwait',
        'Intent.ReviewSubmit',
        ...(values.listing ? ['Intent.ListingGenerate'] : []),
        ...(autoApprove ? ['Intent.PublishDraft'] : []),
        'Intent.InsightsRead',
      ]
      const context: Record<string, unknown> = {
        autopilot: true,
        variantCount: Number(values.variantCount || 2),
        targets: values.livePhoto ? ['livephoto'] : [],
        autoApprove,
        // Publish drafts only for what this run produced and approved.
        scope: 'run',
      }
      if (values.source === 'scheme') context.schemeId = values.schemeId
      if (values.source === 'link') {
        context.url = String(values.url || '').trim()
        context.productName = String(values.productName || '').trim()
      }
      if (values.source === 'products') context.productIds = Array.isArray(values.productIds) ? values.productIds : []
      if (values.listing) {
        context.listingPrice = String(values.listingPrice || '').trim()
        context.titleLanguage = String(values.titleLanguage || 'en-US')
      }
      if (useLinks) context.shareUrls = links
      else context.referenceCount = Number(values.referenceCount || 1)
      if (autoApprove) {
        if (values.startAt) context.startAt = new Date(values.startAt).toISOString()
        context.intervalHours = Number(values.intervalHours || 0)
      }
      return {
        prompt: t('ai.recipes.autopilot.prompt'),
        context,
        plan: {
          intents,
          summary: t('ai.recipes.autopilot.summary', {
            publish: (values.listing ? t('ai.recipes.autopilot.summaryListing') : '') + (autoApprove ? t('ai.recipes.autopilot.summaryPublish') : ''),
          }),
        },
      }
    },
  },
  {
    id: 'product-content-pack',
    icon: 'clapperboard',
    tone: 'accent',
    titleKey: 'ai.recipes.pack.title',
    descKey: 'ai.recipes.pack.desc',
    outputKey: 'ai.recipes.pack.output',
    fields: [
      { key: 'productId', type: 'product', labelKey: 'ai.fields.product', required: true },
      { key: 'referenceVideos', type: 'videos', labelKey: 'ai.fields.referenceVideos', hintKey: 'ai.fields.referenceVideosHint', required: true },
      { key: 'variantCount', type: 'number', labelKey: 'ai.fields.variantCount', hintKey: 'ai.fields.variantCountHint', min: 1, max: 6, defaultValue: 2 },
      { key: 'livePhoto', type: 'toggle', labelKey: 'ai.fields.shotsToLivePhoto', defaultValue: true },
      { key: 'creative', type: 'toggle', labelKey: 'ai.fields.shotsToCreative', defaultValue: false },
    ],
    build: (values, t) => {
      const videos = paths(values.referenceVideos)
      const targets = [values.livePhoto ? 'livephoto' : '', values.creative ? 'creative' : ''].filter(Boolean)
      const intents = ['Intent.CommerceVideoCreate', ...(targets.length ? ['Intent.CloneShotsSend'] : []), 'Intent.ReviewSubmit']
      return {
        prompt: t('ai.recipes.pack.prompt', { count: videos.length }),
        context: { productId: values.productId, referenceVideoPaths: videos, variantCount: Number(values.variantCount || 2), targets },
        plan: { intents, summary: t('ai.recipes.pack.summary', { count: videos.length }) },
      }
    },
  },
  {
    id: 'scene-images',
    icon: 'images',
    tone: 'violet',
    titleKey: 'ai.recipes.scene.title',
    descKey: 'ai.recipes.scene.desc',
    outputKey: 'ai.recipes.scene.output',
    fields: [
      { key: 'productId', type: 'product', labelKey: 'ai.fields.product', required: true },
      { key: 'sceneImages', type: 'images', labelKey: 'ai.fields.sceneImages', hintKey: 'ai.fields.sceneImagesHint', required: true },
      {
        key: 'engine',
        type: 'select',
        labelKey: 'ai.fields.engine',
        defaultValue: 'creative',
        options: [
          { value: 'creative', labelKey: 'ai.fields.engineCreative' },
          { value: 'livephoto', labelKey: 'ai.fields.engineLivePhoto' },
        ],
      },
    ],
    build: (values, t) => {
      const images = paths(values.sceneImages)
      const creative = values.engine !== 'livephoto'
      return {
        prompt: t(creative ? 'ai.recipes.scene.promptCreative' : 'ai.recipes.scene.promptLivePhoto', { count: images.length }),
        context: { productId: values.productId, referenceImagePaths: images, imagePaths: images, quantity: images.length },
        plan: {
          intents: [creative ? 'Intent.CreativeFromImages' : 'Intent.LivePhotoCreate', 'Intent.ReviewSubmit'],
          summary: t(creative ? 'ai.recipes.scene.summaryCreative' : 'ai.recipes.scene.summaryLivePhoto', { count: images.length }),
        },
      }
    },
  },
  {
    id: 'follow-viral',
    icon: 'flame',
    tone: 'red',
    titleKey: 'ai.recipes.viral.title',
    descKey: 'ai.recipes.viral.desc',
    outputKey: 'ai.recipes.viral.output',
    fields: [
      { key: 'links', type: 'links', labelKey: 'ai.fields.viralLinks', hintKey: 'ai.fields.viralLinksHint', required: true },
      { key: 'productIds', type: 'products', labelKey: 'ai.fields.products', hintKey: 'ai.fields.productsHint', required: true },
      { key: 'variantCount', type: 'number', labelKey: 'ai.fields.variantCount', min: 1, max: 6, defaultValue: 2 },
    ],
    build: (values, t) => {
      const links = String(values.links || '').split(/\s+/).map((item) => item.trim()).filter((item) => /^https?:\/\//i.test(item))
      const productIds = Array.isArray(values.productIds) ? values.productIds : []
      return {
        prompt: t('ai.recipes.viral.prompt', { links: links.length, products: productIds.length }),
        context: { shareUrls: links, productIds, variantCount: Number(values.variantCount || 2) },
        plan: { intents: ['Intent.SourceVideoImport', 'Intent.CommerceVideoCreate', 'Intent.ReviewSubmit'], summary: t('ai.recipes.viral.summary', { links: links.length, products: productIds.length }) },
      }
    },
  },
  {
    id: 'research-winners',
    icon: 'trophy',
    tone: 'amber',
    titleKey: 'ai.recipes.winners.title',
    descKey: 'ai.recipes.winners.desc',
    outputKey: 'ai.recipes.winners.output',
    fields: [{ key: 'schemeId', type: 'scheme', labelKey: 'ai.fields.scheme', required: true }],
    build: (values, t) => ({
      prompt: t('ai.recipes.winners.prompt'),
      context: { schemeId: values.schemeId },
      plan: { intents: ['Intent.ProductResearchPromote'], summary: t('ai.recipes.winners.summary') },
    }),
  },
  {
    id: 'import-link',
    icon: 'link',
    tone: 'blue',
    titleKey: 'ai.recipes.link.title',
    descKey: 'ai.recipes.link.desc',
    outputKey: 'ai.recipes.link.output',
    fields: [
      { key: 'url', type: 'text', labelKey: 'ai.fields.productUrl', required: true },
      { key: 'productName', type: 'text', labelKey: 'ai.fields.productNameOptional' },
    ],
    build: (values, t) => ({
      prompt: t('ai.recipes.link.prompt', { url: values.url }),
      context: { url: String(values.url || '').trim(), productName: String(values.productName || '').trim() },
      plan: { intents: ['Intent.ProductImportFromLink'], summary: t('ai.recipes.link.summary') },
    }),
  },
  {
    id: 'publish-approved',
    icon: 'send',
    tone: 'green',
    titleKey: 'ai.recipes.publish.title',
    descKey: 'ai.recipes.publish.desc',
    outputKey: 'ai.recipes.publish.output',
    fields: [
      { key: 'productId', type: 'product', labelKey: 'ai.fields.productOptional' },
      { key: 'startAt', type: 'datetime', labelKey: 'ai.fields.startAt', hintKey: 'ai.fields.startAtHint' },
      { key: 'intervalHours', type: 'number', labelKey: 'ai.fields.intervalHours', min: 0, max: 72, defaultValue: 4 },
    ],
    build: (values, t) => ({
      prompt: t('ai.recipes.publish.prompt'),
      context: {
        ...(values.productId ? { productId: values.productId } : {}),
        ...(values.startAt ? { startAt: new Date(values.startAt).toISOString() } : {}),
        intervalHours: Number(values.intervalHours || 0),
        useApproved: true,
      },
      plan: { intents: ['Intent.PublishDraft'], summary: t('ai.recipes.publish.summary') },
    }),
  },
]

export function recipeById(id: string) {
  return AI_RECIPES.find((recipe) => recipe.id === id) || null
}

export function defaultRecipeValues(recipe: Recipe, preset: RecipeValues = {}): RecipeValues {
  const values: RecipeValues = {}
  for (const field of recipe.fields) {
    if (field.defaultValue !== undefined) values[field.key] = field.defaultValue
    else if (field.type === 'videos' || field.type === 'images' || field.type === 'products') values[field.key] = []
    else values[field.key] = ''
  }
  return { ...values, ...preset }
}

export function recipeMissingFields(recipe: Recipe, values: RecipeValues) {
  return recipe.fields.filter((field) => {
    if (!field.required) return false
    // Fields hidden by `when` are not part of the form and cannot be missing.
    if (field.when && values[field.when.key] !== field.when.equals) return false
    const value = values[field.key]
    if (Array.isArray(value)) return value.length === 0
    return !String(value ?? '').trim()
  })
}
