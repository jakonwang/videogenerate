export type ModelProfileOptionValue =
  | 'southeast_asia_female'
  | 'global_female'
  | 'female'
  | 'male'
  | '18_24'
  | '20_28'
  | '25_32'
  | 'oval'
  | 'soft_round'
  | 'defined'
  | 'dark_straight'
  | 'dark_wavy'
  | 'tied_back'
  | 'dark_black'
  | 'natural_brown'
  | 'soft_warm'
  | 'natural_warm'
  | 'healthy_neutral'
  | 'petite'
  | 'slim'
  | 'balanced'
  | 'clean_minimal'
  | 'casual_lifestyle'
  | 'refined_commute'
  | 'friendly_natural'
  | 'calm_confident'
  | 'bright_ugc'
  | 'clean_studio'
  | 'home_daylight'
  | 'retail_lifestyle'
  | 'chinese_fluent'
  | 'bilingual_soft_sell'
  | 'tiktok_ugc'
  | 'closeup_product_led'
  | 'natural_social_commerce'
  | 'wearing_focus'
  | 'styling_focus'
  | 'conversion_focus'

export type ModelProfileOptions = {
  market?: ModelProfileOptionValue
  gender?: ModelProfileOptionValue
  ageRange?: ModelProfileOptionValue
  faceShape?: ModelProfileOptionValue
  hairStyle?: ModelProfileOptionValue
  hairColor?: ModelProfileOptionValue
  skinTone?: ModelProfileOptionValue
  bodyType?: ModelProfileOptionValue
  outfitStyle?: ModelProfileOptionValue
  mood?: ModelProfileOptionValue
  sceneStyle?: ModelProfileOptionValue
  languageStyle?: ModelProfileOptionValue
  cameraPresence?: ModelProfileOptionValue
  styleBias?: ModelProfileOptionValue
}

export type ModelProfileOptionItem = {
  value: ModelProfileOptionValue
  label: string
  prompt: string
}

export type ModelProfileOptionGroup = {
  key: keyof ModelProfileOptions
  label: string
  description: string
  options: ModelProfileOptionItem[]
}

const GROUPS: ModelProfileOptionGroup[] = [
  {
    key: 'market',
    label: '目标市场',
    description: '控制模特整体市场感和面向的电商受众。',
    options: [
      { value: 'southeast_asia_female', label: '东南亚女装感', prompt: 'Southeast Asian market' },
      { value: 'global_female', label: '国际泛商业', prompt: 'global social-commerce market' },
    ],
  },
  {
    key: 'gender',
    label: '性别',
    description: '控制模特的主要性别表达。',
    options: [
      { value: 'female', label: '女性', prompt: 'female' },
      { value: 'male', label: '男性', prompt: 'male' },
    ],
  },
  {
    key: 'ageRange',
    label: '年龄段',
    description: '控制模特年龄区间表达。',
    options: [
      { value: '18_24', label: '18-24岁', prompt: '18-24' },
      { value: '20_28', label: '20-28岁', prompt: '20-28' },
      { value: '25_32', label: '25-32岁', prompt: '25-32' },
    ],
  },
  {
    key: 'faceShape',
    label: '脸型',
    description: '控制人脸轮廓偏向。',
    options: [
      { value: 'oval', label: '鹅蛋脸', prompt: 'oval face shape' },
      { value: 'soft_round', label: '柔和圆脸', prompt: 'soft round face shape' },
      { value: 'defined', label: '轮廓清晰', prompt: 'defined face shape' },
    ],
  },
  {
    key: 'hairStyle',
    label: '发型',
    description: '控制发型结构与佩戴区展示友好度。',
    options: [
      { value: 'dark_straight', label: '自然直发', prompt: 'natural straight hair' },
      { value: 'dark_wavy', label: '自然微卷', prompt: 'natural soft wavy hair' },
      { value: 'tied_back', label: '利落扎发', prompt: 'hair tied back or tucked cleanly away from product area' },
    ],
  },
  {
    key: 'hairColor',
    label: '发色',
    description: '控制发色表达。',
    options: [
      { value: 'dark_black', label: '自然黑发', prompt: 'natural dark black hair color' },
      { value: 'natural_brown', label: '深棕发色', prompt: 'natural dark brown hair color' },
    ],
  },
  {
    key: 'skinTone',
    label: '肤色',
    description: '控制肤色与商业感。',
    options: [
      { value: 'soft_warm', label: '柔暖肤色', prompt: 'soft warm skin tone' },
      { value: 'natural_warm', label: '自然暖肤', prompt: 'natural warm skin tone' },
      { value: 'healthy_neutral', label: '健康中性肤', prompt: 'healthy neutral skin tone' },
    ],
  },
  {
    key: 'bodyType',
    label: '体型',
    description: '控制模特身材表达。',
    options: [
      { value: 'petite', label: '小巧轻盈', prompt: 'petite build' },
      { value: 'slim', label: '纤细修长', prompt: 'slim build' },
      { value: 'balanced', label: '匀称自然', prompt: 'balanced natural build' },
    ],
  },
  {
    key: 'outfitStyle',
    label: '穿搭',
    description: '控制服装与产品竞争关系。',
    options: [
      { value: 'clean_minimal', label: '极简干净', prompt: 'minimal clean outfit that does not compete with the product' },
      { value: 'casual_lifestyle', label: '轻松生活感', prompt: 'casual lifestyle outfit' },
      { value: 'refined_commute', label: '精致通勤感', prompt: 'refined commute outfit' },
    ],
  },
  {
    key: 'mood',
    label: '气质',
    description: '控制表情与人物气质。',
    options: [
      { value: 'friendly_natural', label: '自然亲和', prompt: 'friendly natural expression' },
      { value: 'calm_confident', label: '冷静自信', prompt: 'calm confident expression' },
      { value: 'bright_ugc', label: '轻快UGC感', prompt: 'bright approachable UGC mood' },
    ],
  },
  {
    key: 'sceneStyle',
    label: '场景',
    description: '控制画面场景背景。',
    options: [
      { value: 'clean_studio', label: '干净棚拍', prompt: 'clean soft studio-like background' },
      { value: 'home_daylight', label: '日光居家', prompt: 'soft daylight home setting' },
      { value: 'retail_lifestyle', label: '零售生活感', prompt: 'light retail lifestyle environment' },
    ],
  },
  {
    key: 'languageStyle',
    label: '表达语言',
    description: '控制模特商业表达倾向。',
    options: [
      { value: 'chinese_fluent', label: '中文带货感', prompt: 'Chinese-speaking social-commerce expression style' },
      { value: 'bilingual_soft_sell', label: '中英双语软销', prompt: 'soft bilingual social-sell expression style' },
    ],
  },
  {
    key: 'cameraPresence',
    label: '镜头感',
    description: '控制面对镜头的呈现方式。',
    options: [
      { value: 'tiktok_ugc', label: '短视频UGC', prompt: 'TikTok-style UGC camera presence' },
      { value: 'closeup_product_led', label: '近景产品主导', prompt: 'close-up product-led camera presence' },
      { value: 'natural_social_commerce', label: '自然电商感', prompt: 'natural social-commerce camera presence' },
    ],
  },
  {
    key: 'styleBias',
    label: '风格倾向',
    description: '控制整体身份包的商业重心。',
    options: [
      { value: 'wearing_focus', label: '佩戴展示优先', prompt: 'wearing demonstration focus' },
      { value: 'styling_focus', label: '穿搭风格优先', prompt: 'styling and look focus' },
      { value: 'conversion_focus', label: '转化展示优先', prompt: 'conversion-focused product demo style' },
    ],
  },
]

export const MODEL_PROFILE_OPTION_GROUPS = GROUPS

export function getModelProfileOptionGroups() {
  return GROUPS
}

export function createEmptyModelProfileOptions(): ModelProfileOptions {
  return {}
}

type ProductType = 'earrings' | 'phone_case' | 'clothes' | 'toy' | 'general'

export function getRecommendedModelProfileOptions(productType: ProductType): ModelProfileOptions {
  if (productType === 'earrings') {
    return {
      market: 'southeast_asia_female',
      gender: 'female',
      ageRange: '20_28',
      faceShape: 'oval',
      hairStyle: 'tied_back',
      hairColor: 'dark_black',
      skinTone: 'natural_warm',
      bodyType: 'petite',
      outfitStyle: 'clean_minimal',
      mood: 'calm_confident',
      sceneStyle: 'clean_studio',
      languageStyle: 'bilingual_soft_sell',
      cameraPresence: 'closeup_product_led',
      styleBias: 'wearing_focus',
    }
  }
  if (productType === 'clothes') {
    return {
      market: 'southeast_asia_female',
      gender: 'female',
      ageRange: '20_28',
      faceShape: 'oval',
      hairStyle: 'dark_wavy',
      hairColor: 'natural_brown',
      skinTone: 'natural_warm',
      bodyType: 'balanced',
      outfitStyle: 'casual_lifestyle',
      mood: 'friendly_natural',
      sceneStyle: 'home_daylight',
      languageStyle: 'chinese_fluent',
      cameraPresence: 'natural_social_commerce',
      styleBias: 'styling_focus',
    }
  }
  return {
    market: 'southeast_asia_female',
    gender: 'female',
    ageRange: '20_28',
    faceShape: 'oval',
    hairStyle: 'dark_straight',
    hairColor: 'dark_black',
    skinTone: 'natural_warm',
    bodyType: 'slim',
    outfitStyle: 'clean_minimal',
    mood: 'friendly_natural',
    sceneStyle: 'home_daylight',
    languageStyle: 'chinese_fluent',
    cameraPresence: 'natural_social_commerce',
    styleBias: 'conversion_focus',
  }
}

export function buildModelProfilePromptParts(options?: ModelProfileOptions) {
  const selected = options ?? {}
  const byValue = new Map<ModelProfileOptionValue, ModelProfileOptionItem>()
  for (const group of GROUPS) {
    for (const option of group.options) byValue.set(option.value, option)
  }
  return Object.values(selected)
    .map((value) => (value ? byValue.get(value)?.prompt || '' : ''))
    .filter(Boolean)
}

export function getModelProfileOptionPrompt(groupKey: keyof ModelProfileOptions, value?: ModelProfileOptionValue) {
  if (!value) return ''
  const group = GROUPS.find((item) => item.key === groupKey)
  return group?.options.find((item) => item.value === value)?.prompt || ''
}

export function getModelProfileOptionLabel(groupKey: keyof ModelProfileOptions, value?: ModelProfileOptionValue) {
  if (!value) return ''
  const group = GROUPS.find((item) => item.key === groupKey)
  return group?.options.find((item) => item.value === value)?.label || ''
}
