import { ref, watch } from 'vue'
import { BRAND_RECORD_ID, emptySyncBrand, SYNC_COLLECTIONS, type SyncBrand } from '@shared/cloud/sync'
import { getRecord, saveRecord, syncState } from './sync'

/**
 * 品牌记忆：全账号一条记录，网页 / 手机 / 电脑同步。AI 制片人和上架文案都会按它写。
 */

export async function loadBrand(): Promise<SyncBrand> {
  const record = await getRecord<SyncBrand>(SYNC_COLLECTIONS.brand, BRAND_RECORD_ID)
  return { ...emptySyncBrand(), ...(record?.data ?? {}) }
}

export function useBrand() {
  const brand = ref<SyncBrand>(emptySyncBrand())
  const updatedAt = ref(0)
  watch(
    () => syncState.version,
    async () => {
      const record = await getRecord<SyncBrand>(SYNC_COLLECTIONS.brand, BRAND_RECORD_ID)
      brand.value = { ...emptySyncBrand(), ...(record?.data ?? {}) }
      updatedAt.value = record?.updatedAt ?? 0
    },
    { immediate: true },
  )
  return { brand, updatedAt }
}

export function cleanBrand(input: SyncBrand): SyncBrand {
  const text = (value: string, max: number) => String(value ?? '').trim().slice(0, max)
  return {
    brandName: text(input.brandName, 80),
    tone: text(input.tone, 500),
    audience: text(input.audience, 500),
    bannedWords: [...new Set(input.bannedWords.map((word) => text(word, 40)).filter(Boolean))].slice(0, 200),
    subtitleStyle: text(input.subtitleStyle, 300),
    watermarkText: text(input.watermarkText, 80),
    notes: text(input.notes, 2000),
  }
}

export async function saveBrand(input: SyncBrand) {
  await saveRecord<SyncBrand>(SYNC_COLLECTIONS.brand, BRAND_RECORD_ID, cleanBrand(input))
}

/** 「最便宜, 第一；全网」→ 词表（逗号、顿号、分号、换行都算分隔） */
export function parseWords(text: string): string[] {
  return text
    .split(/[,，、;；\n]+/)
    .map((word) => word.trim())
    .filter(Boolean)
}
