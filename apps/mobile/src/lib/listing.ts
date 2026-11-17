import type { SyncFileRef } from '@shared/cloud/sync'
import {
  buildTiktokListingDescriptionPrompt,
  buildTiktokListingTitlePrompt,
  type TiktokListingCategory,
  type TiktokListingLanguage,
} from '@shared/tiktokListingPrompts'
import { cloud } from './session'

/** 上架文案生成（上架助手页面和 AI 制片人共用） */

export function cleanTitle(text: string) {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean)
      ?.replace(/^["'“”「」《》]+|["'“”「」《》]+$/g, '')
      .replace(/^(title|标题)\s*[:：]\s*/i, '')
      .slice(0, 200) || ''
  )
}

export async function writeListingCopy(input: {
  images: SyncFileRef[]
  coverFileId?: string
  category: TiktokListingCategory
  language: TiktokListingLanguage
  sku?: string
  price?: string
}) {
  // The cover first, so the model looks at the main product shot.
  const ordered = [...input.images].sort((a, b) => Number(b.fileId === input.coverFileId) - Number(a.fileId === input.coverFileId))
  const imageFileIds = ordered.slice(0, 2).map((image) => image.fileId)
  const detailText = input.price ? `Price: ${input.price}` : undefined
  const sku = input.sku || ''
  const [title, description] = await Promise.all([
    cloud.ai.chat({
      system: 'Only output the final title.',
      prompt: buildTiktokListingTitlePrompt({ category: input.category, language: input.language, sku, detailText }),
      imageFileIds,
      purpose: 'listing-title',
    }),
    cloud.ai.chat({
      system: 'Only output the final description.',
      prompt: buildTiktokListingDescriptionPrompt({ category: input.category, language: input.language, sku, detailText }),
      imageFileIds,
      purpose: 'listing-description',
    }),
  ])
  return { title: cleanTitle(title.content), description: description.content.trim() }
}
