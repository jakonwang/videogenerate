/** 商品替换的默认提示词（电脑端「商品替换」和手机端共用） */
export const PRODUCT_REPLACEMENT_PROMPT = [
  'Image 1 is the scene to edit. Images 2 and onward show the target product from different angles.',
  'Replace only the original product in Image 1 with the target product. Keep the scene composition, camera angle, background, people, hands, and unrelated objects unchanged.',
  'Match the target product identity across the reference images, including its shape, proportions, color, material, and visible details. Do not blend features from the original product.',
  'Fit the replacement naturally into the scene with accurate perspective, size, lighting, reflections, and contact shadows. Keep the output photorealistic and preserve the original image aspect ratio.',
  'Do not add or remove unrelated objects, text, logos, watermarks, or extra products.',
].join('\n')
