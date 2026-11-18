/**
 * 模特库：生成一个新虚拟模特的 3x3 多角度参考图提示词。
 * 电脑端「模特库」和手机端「AI 模特」共用。
 */
export type ModelLibraryProfile = {
  market: string
  gender: string
  ageRange: string
  faceShape?: string
  hairStyle: string
  hairColor?: string
  skinTone: string
  bodyType?: string
  outfitStyle: string
  mood: string
  sceneStyle: string
  languageStyle?: string
  cameraPresence?: string
  styleBias?: string
}

export function buildModelLibraryPrompt(input: {
  productType?: string
  productPoints?: string
  profile: ModelLibraryProfile
  hasModelReference?: boolean
}) {
  return [
    'Create one single-image multi-angle reference sheet for a new virtual model identity package for short-form social commerce videos.',
    'Generate the model only. Do not add, hold, wear, present, or interact with any product, accessory, prop, package, phone, jewelry, clothing item, or branded object.',
    'The model must be a new person and must not copy any person from the reference video.',
    `Market: ${input.profile.market}. Gender: ${input.profile.gender}. Age range: ${input.profile.ageRange}.`,
    `Face shape: ${input.profile.faceShape || 'oval face shape'}. Hair: ${input.profile.hairStyle}. Hair color: ${input.profile.hairColor || 'natural dark black hair color'}.`,
    `Skin tone: ${input.profile.skinTone}. Body type: ${input.profile.bodyType || 'slim build'}. Outfit: ${input.profile.outfitStyle}.`,
    `Mood: ${input.profile.mood}. Scene: ${input.profile.sceneStyle}. Language style: ${input.profile.languageStyle || 'Chinese-speaking social-commerce expression style'}.`,
    `Camera presence: ${input.profile.cameraPresence || 'natural social-commerce camera presence'}. Style bias: ${input.profile.styleBias || 'conversion-focused product demo style'}.`,
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
    'Show the model alone in a simple, practical, reusable everyday reference set.',
    'No product, no prop, no handbag, no jewelry showcase, no package, no phone, no bottle, no text, no subtitle, no watermark, no logo, no UI overlay, no random letters.',
    'Realistic smartphone photo style, natural skin texture, ordinary home lighting, and authentic everyday framing.',
    'Single person only. One collage image only.',
  ]
    .filter(Boolean)
    .join('\n')
}
