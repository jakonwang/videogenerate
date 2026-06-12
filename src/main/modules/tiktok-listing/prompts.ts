import type { TiktokListingCategory, TiktokListingLanguage } from './types'

export type TiktokListingPromptCategory = TiktokListingCategory

export type TiktokListingImagePromptTemplate = {
  key: 'hero' | 'angle_2' | 'angle_3' | 'angle_4' | 'angle_5'
  shotTitle: string
  composition: string
  focus: string
  styling: string
}

export type TiktokListingImagePromptPreset = {
  category: TiktokListingPromptCategory
  subject: string
  wearArea: string
  detailFocus: string
  templates: TiktokListingImagePromptTemplate[]
}

export type TiktokListingTextPromptPreset = {
  category: TiktokListingPromptCategory
  categoryLabel: string
  titleKeywords: string[]
  titleFocus: string
  descriptionFocus: string
  visibleConstraints: string[]
}

const GLOBAL_PROMPT_RULES = [
  'Reference image priority is highest.',
  'Keep the exact same product identity as the reference image.',
  'Lock exact product structure, silhouette, shape, material, finish, color, proportion, and attachment details.',
  'Keep the product at a believable real-world size relative to the body part or carrier object.',
  'Do not enlarge, magnify, or exaggerate the product size for dramatic effect.',
  'Maintain normal wearing or usage scale so the product never looks oversized compared with the ear, hand, neck, wrist, phone, or body anchor.',
  'Do not redesign the product.',
  'Do not add text, watermark, logo, packaging copy, or graphic overlay.',
  'Do not introduce extra props or styling that steals attention from the product.',
  'Cinematic styling must not override identity.',
  'Photorealistic TikTok ecommerce listing image.',
  'High-conversion product presentation.',
  'Square 1:1 composition.',
  'Clean premium social-commerce output.',
]

const promptPresets: Record<TiktokListingPromptCategory, TiktokListingImagePromptPreset> = {
  earring: {
    category: 'earring',
    subject: 'a model ear wearing the exact same earrings from the reference image',
    wearArea: 'ear and earlobe close-up',
    detailFocus: 'earring structure, drop shape, clasp, pendant relationship, metal finish, and visible texture',
    templates: [
      {
        key: 'hero',
        shotTitle: 'main hero listing image',
        composition: 'clean hero product shot, centered composition, premium ecommerce cover image',
        focus: 'show the full earring pair clearly while keeping exact structure and polish readable',
        styling: 'soft studio lighting, clean complementary background, minimalist fashion feel',
      },
      {
        key: 'angle_2',
        shotTitle: 'side-profile wear shot',
        composition: 'side-profile close-up on the model ear',
        focus: 'focus on how the earring hangs from the ear with the full silhouette readable',
        styling: 'soft studio lighting, clean skin texture, sharp jewelry focus, pinterest-worthy fashion look',
      },
      {
        key: 'angle_3',
        shotTitle: 'slightly forward-facing wear shot',
        composition: 'slightly forward-facing side-profile showing the earring from the front and side',
        focus: 'show how the earring rests on the earlobe and how the front face catches light',
        styling: 'cinematic but restrained lighting, gentle shadows, clean background, minimalist chic style',
      },
      {
        key: 'angle_4',
        shotTitle: 'dynamic texture close-up',
        composition: 'extreme close-up ear shot with subtle natural motion feeling',
        focus: 'highlight the main pendant, dangling element, texture, polish, and exact attachment structure',
        styling: 'high-fashion detail image, photorealistic texture capture, premium editorial restraint',
      },
      {
        key: 'angle_5',
        shotTitle: 'wearing detail macro shot',
        composition: 'macro shot of the earring being carefully worn on the ear',
        focus: 'show the attachment mechanism and how the earring looks once in place',
        styling: 'warm inviting light, soft shadows, clean skin, high-end ecommerce realism',
      },
    ],
  },
  ring: {
    category: 'ring',
    subject: 'a model hand wearing the exact same ring from the reference image',
    wearArea: 'finger and hand close-up',
    detailFocus: 'ring profile, top design, band thickness, setting details, metal finish, and any gem structure',
    templates: [
      {
        key: 'hero',
        shotTitle: 'main hero listing image',
        composition: 'clean hero product shot, centered composition, premium ecommerce cover image',
        focus: 'show the exact same ring clearly with full top view design and polished structure readable',
        styling: 'soft studio lighting, clean background, premium social-commerce feel',
      },
      {
        key: 'angle_2',
        shotTitle: 'top-down wear shot',
        composition: 'classic top-down macro shot of a hand wearing the ring',
        focus: 'show the main ring design from above with sharp detail on metal and gem surfaces',
        styling: 'cinematic lighting with soft shadows, elegant fashion styling, clean manicured hand',
      },
      {
        key: 'angle_3',
        shotTitle: 'side-profile wear shot',
        composition: 'extreme side-profile close-up of the ring worn on the finger',
        focus: 'show side height, band shape, and the exact structural profile of the ring',
        styling: 'soft natural lighting, blurred premium background, elegant trendy look',
      },
      {
        key: 'angle_4',
        shotTitle: 'stackable gesture shot',
        composition: 'close-up from a slight angle of a natural hand gesture',
        focus: 'keep the target ring dominant while showing how it looks in a styled hand pose',
        styling: 'warm cinematic light, fashion-forward but product-first styling, textured clean background',
      },
      {
        key: 'angle_5',
        shotTitle: 'wearing process macro shot',
        composition: 'macro shot of the ring being slipped onto a finger',
        focus: 'show the ring in place around the finger joint with exact metal polish and structure',
        styling: 'high-contrast polish detail, minimalist aesthetic, photorealistic finish',
      },
    ],
  },
  necklace: {
    category: 'necklace',
    subject: 'a model neck and clavicle wearing the exact same necklace from the reference image',
    wearArea: 'neck and clavicle close-up',
    detailFocus: 'chain texture, pendant structure, center placement, clasp logic, metal finish, and pendant proportion',
    templates: [
      {
        key: 'hero',
        shotTitle: 'main hero listing image',
        composition: 'clean hero product shot, centered composition, premium ecommerce cover image',
        focus: 'show the exact same necklace clearly with the pendant and chain structure easy to read',
        styling: 'soft premium studio light, clean background, luxury social-commerce mood',
      },
      {
        key: 'angle_2',
        shotTitle: 'front clavicle wear shot',
        composition: 'front close-up shot of neck and clavicle with pendant centered',
        focus: 'show how the necklace sits naturally against the skin with chain and pendant highlights readable',
        styling: 'soft flattering studio lighting, minimalist neckline, clean high-end fashion presentation',
      },
      {
        key: 'angle_3',
        shotTitle: 'three-quarter wear shot',
        composition: 'slightly turned side-profile of the neck and clavicle from a three-quarter view',
        focus: 'show how the chain rests and how the pendant reads from an angled perspective',
        styling: 'cinematic light streak restraint, textured elegant background, statement but product-first look',
      },
      {
        key: 'angle_4',
        shotTitle: 'layered styling detail shot',
        composition: 'close-up necklace wear shot with subtle layered styling context',
        focus: 'keep the target necklace dominant while emphasizing pendant scale, chain texture, and metal interplay',
        styling: 'soft social-media-trending aesthetic, minimalist outfit, refined background texture',
      },
      {
        key: 'angle_5',
        shotTitle: 'pendant detail macro shot',
        composition: 'macro shot focused on pendant and a section of the chain while worn',
        focus: 'show pendant detail, chain texture, skin contact, and exact finish under close inspection',
        styling: 'warm inviting lighting, detailed focus, clean luxury realism',
      },
    ],
  },
  phone_case: {
    category: 'phone_case',
    subject: 'the exact same phone case from the reference image displayed on a matching smartphone',
    wearArea: 'phone back and case surface close-up',
    detailFocus: 'camera cutout, case edge shape, print layout, texture finish, corner profile, and exact graphic placement',
    templates: [
      {
        key: 'hero',
        shotTitle: 'main hero listing image',
        composition: 'clean hero product shot, centered composition, premium ecommerce cover image',
        focus: 'show the full phone case design clearly with the exact artwork, cutouts, and edges readable',
        styling: 'soft studio lighting, clean minimal background, product-first social-commerce look',
      },
      {
        key: 'angle_2',
        shotTitle: 'straight back display shot',
        composition: 'straight-on close-up of the phone back with the case installed',
        focus: 'show the full printed surface, camera opening, and color fidelity of the exact same case',
        styling: 'clean studio lighting, crisp surface detail, minimalist premium background',
      },
      {
        key: 'angle_3',
        shotTitle: 'three-quarter angle shot',
        composition: 'three-quarter angled close-up of the phone case on the device',
        focus: 'show side thickness, raised edge profile, and how the case wraps around the phone corners',
        styling: 'refined ecommerce lighting, subtle shadow separation, premium product display',
      },
      {
        key: 'angle_4',
        shotTitle: 'handheld lifestyle-clean shot',
        composition: 'clean handheld product shot with the phone case naturally held in one hand',
        focus: 'keep the case design dominant while showing real scale and exact surface appearance',
        styling: 'soft natural-commercial lighting, clean uncluttered background, high-conversion social feel',
      },
      {
        key: 'angle_5',
        shotTitle: 'macro detail shot',
        composition: 'macro close-up of the phone case surface and camera area',
        focus: 'show print texture, finish quality, cutout precision, and exact graphic detail under close inspection',
        styling: 'sharp photorealistic detail, premium lighting, minimalist background',
      },
    ],
  },
  bracelet: {
    category: 'bracelet',
    subject: 'a model wrist wearing the exact same bracelet from the reference image',
    wearArea: 'wrist and bracelet close-up',
    detailFocus: 'bracelet structure, clasp, chain or bangle profile, charm placement, metal finish, and fit on wrist',
    templates: [
      {
        key: 'hero',
        shotTitle: 'main hero listing image',
        composition: 'clean hero product shot, centered composition, premium ecommerce cover image',
        focus: 'show the exact same bracelet clearly with the full structure and finish readable',
        styling: 'soft studio lighting, clean premium background, elegant ecommerce presentation',
      },
      {
        key: 'angle_2',
        shotTitle: 'top wrist wear shot',
        composition: 'close-up top view of the bracelet worn on a wrist',
        focus: 'show how the bracelet sits around the wrist and how the exact design reads when worn',
        styling: 'soft flattering lighting, clean skin texture, minimalist fashion look',
      },
      {
        key: 'angle_3',
        shotTitle: 'side wrist profile shot',
        composition: 'slight side-profile close-up of the wrist and bracelet',
        focus: 'show bracelet thickness, curvature, clasp area, and exact structural profile from the side',
        styling: 'cinematic but restrained product lighting, elegant background, product-first styling',
      },
      {
        key: 'angle_4',
        shotTitle: 'gesture styling shot',
        composition: 'natural wrist gesture close-up with the bracelet as the dominant subject',
        focus: 'highlight how the bracelet moves and catches light while preserving exact charm or link placement',
        styling: 'warm commercial lighting, refined social-media-ready styling, uncluttered background',
      },
      {
        key: 'angle_5',
        shotTitle: 'clasp and detail macro shot',
        composition: 'macro shot focused on the bracelet clasp and key detail section while worn',
        focus: 'show exact attachment mechanism, metal finish, texture, and small structural details',
        styling: 'high-detail photorealistic lighting, luxury close-up feel, minimal background',
      },
    ],
  },
}

const textPromptPresets: Record<TiktokListingPromptCategory, TiktokListingTextPromptPreset> = {
  earring: {
    category: 'earring',
    categoryLabel: 'Earring',
    titleKeywords: ['earring', 'drop', 'hoop', 'stud', 'fashion jewelry'],
    titleFocus: 'style, silhouette, wearing scene, and visible metal or pendant characteristics',
    descriptionFocus: 'how the earrings look when worn, the visible structure, everyday styling use, and aesthetic appeal',
    visibleConstraints: [
      'Only mention visible structure, shape, finish, and styling cues.',
      'Do not invent gemstone grade, metal purity, or hypoallergenic claims unless visible in the image.',
    ],
  },
  ring: {
    category: 'ring',
    categoryLabel: 'Ring',
    titleKeywords: ['ring', 'band', 'open ring', 'stackable', 'fashion accessory'],
    titleFocus: 'top design, band profile, visible finish, and styling suitability',
    descriptionFocus: 'how the ring looks on hand, the visible shape and finish, and everyday or gifting appeal',
    visibleConstraints: [
      'Only mention visible structure, shape, finish, and styling cues.',
      'Do not invent gemstone grade, metal purity, size range, or adjustable claims unless visible in the image.',
    ],
  },
  necklace: {
    category: 'necklace',
    categoryLabel: 'Necklace',
    titleKeywords: ['necklace', 'pendant', 'chain', 'clavicle jewelry', 'layering accessory'],
    titleFocus: 'pendant shape, chain look, visible finish, and fashion styling context',
    descriptionFocus: 'how the necklace sits on the neck, visible pendant and chain details, and styling appeal',
    visibleConstraints: [
      'Only mention visible structure, shape, finish, and styling cues.',
      'Do not invent gemstone grade, chain length, or metal purity unless visible in the image.',
    ],
  },
  phone_case: {
    category: 'phone_case',
    categoryLabel: 'Phone Case',
    titleKeywords: ['phone case', 'protective cover', 'printed case', 'minimalist case', 'fashion accessory'],
    titleFocus: 'surface design, visible cutouts, edge profile, and overall style',
    descriptionFocus: 'visible pattern or texture, camera cutout design, edge shape, and everyday aesthetic',
    visibleConstraints: [
      'Only mention visible print, shape, texture, and cutout features.',
      'Do not invent anti-drop, anti-yellowing, magnetic, or material claims unless visible in the image.',
    ],
  },
  bracelet: {
    category: 'bracelet',
    categoryLabel: 'Bracelet',
    titleKeywords: ['bracelet', 'wrist jewelry', 'chain bracelet', 'bangle', 'fashion accessory'],
    titleFocus: 'bracelet silhouette, visible charm or chain structure, finish, and styling use',
    descriptionFocus: 'how the bracelet looks on wrist, the visible structure and finish, and styling appeal',
    visibleConstraints: [
      'Only mention visible structure, shape, finish, and styling cues.',
      'Do not invent gemstone grade, metal purity, size range, or adjustable claims unless visible in the image.',
    ],
  },
}

function detailPlaceholder(category: TiktokListingCategory, sku?: string, detailText?: string) {
  return [detailText, `Category: ${category}`, sku ? `SKU: ${sku}` : '']
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('. ')
}

function languageLabel(language: TiktokListingLanguage) {
  if (language === 'en-US') return 'English'
  if (language === 'vi-VN') return 'Vietnamese'
  return 'Simplified Chinese'
}

export function buildTiktokListingImagePrompt(input: {
  category: TiktokListingCategory
  index: number
  sku?: string
  detailText?: string
  anchorMode?: 'source_only' | 'source_plus_hero'
}) {
  const preset = promptPresets[input.category]
  const globalRules = GLOBAL_PROMPT_RULES.join(' ')
  const detail = detailPlaceholder(input.category, input.sku, input.detailText)
  const template = preset.templates[input.index] || preset.templates[0]
  const anchorRules =
    input.anchorMode === 'source_plus_hero'
      ? [
          'Reference image 1 is the original product truth source and has the highest priority.',
          'Reference image 2 is the approved hero result that must be matched for the exact same product identity.',
          'All later images must keep the exact same product as both references with no redesign, no structural drift, and no detail substitution.',
          'Use reference image 2 to preserve the same product appearance consistency across the full 5-image set.',
          'Keep the same believable product scale as the references and do not progressively enlarge the item across later images.',
        ].join(' ')
      : 'Reference image 1 is the original product truth source and has the highest priority.'
  return [
    `Create a TikTok ecommerce product image for ${preset.category}.`,
    globalRules,
    anchorRules,
    `Subject: ${preset.subject}.`,
    `Wear area: ${preset.wearArea}.`,
    `Detail focus: ${preset.detailFocus}.`,
    `Shot intent: ${template.shotTitle}.`,
    `Composition: ${template.composition}.`,
    `Focus: ${template.focus}.`,
    `Styling: ${template.styling}.`,
    detail ? `Product detail placeholder: ${detail}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildTiktokListingTitlePrompt(input: {
  category: TiktokListingCategory
  language: TiktokListingLanguage
  sku: string
  detailText?: string
}) {
  const preset = textPromptPresets[input.category]
  const detail = detailPlaceholder(input.category, input.sku, input.detailText)
  return [
    'You are a TikTok ecommerce listing assistant.',
    `Output language: ${languageLabel(input.language)}.`,
    'Generate exactly 1 product title.',
    'Requirements:',
    '- Keep it within 200 characters.',
    '- Follow TikTok ecommerce title habits.',
    '- Keep the product identity exact to the reference image.',
    '- Do not redesign the product.',
    '- Output title only.',
    `Category: ${preset.categoryLabel}.`,
    `Title focus: ${preset.titleFocus}.`,
    `Helpful keyword direction: ${preset.titleKeywords.join(', ')}.`,
    ...preset.visibleConstraints.map((item) => `- ${item}`),
    detail ? `Visible product detail placeholder: ${detail}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildTiktokListingDescriptionPrompt(input: {
  category: TiktokListingCategory
  language: TiktokListingLanguage
  sku: string
  detailText?: string
}) {
  const preset = textPromptPresets[input.category]
  const detail = detailPlaceholder(input.category, input.sku, input.detailText)
  return [
    'You are a TikTok ecommerce listing assistant.',
    `Output language: ${languageLabel(input.language)}.`,
    'Generate exactly 1 concise product description for ecommerce import.',
    'Requirements:',
    '- 1 paragraph.',
    '- Focus on visible appearance, wearing or usage scene, and selling points.',
    '- Keep the product identity exact to the reference image.',
    '- Do not redesign the product.',
    '- Do not invent packaging, certifications, hidden materials, or non-visible features.',
    '- Output description only.',
    `Category: ${preset.categoryLabel}.`,
    `Description focus: ${preset.descriptionFocus}.`,
    ...preset.visibleConstraints.map((item) => `- ${item}`),
    detail ? `Visible product detail placeholder: ${detail}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
