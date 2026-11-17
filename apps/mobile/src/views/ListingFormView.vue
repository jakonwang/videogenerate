<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Boxes, Copy, LoaderCircle, Sparkles, Trash2 } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncListing } from '@shared/cloud/sync'
import {
  buildTiktokListingDescriptionPrompt,
  buildTiktokListingTitlePrompt,
  TIKTOK_LISTING_CATEGORY_LABELS,
  TIKTOK_LISTING_LANGUAGE_LABELS,
  type TiktokListingCategory,
  type TiktokListingLanguage,
} from '@shared/tiktokListingPrompts'
import ImageGrid from '@/components/ImageGrid.vue'
import PageHeader from '@/components/PageHeader.vue'
import ProductPicker from '@/components/ProductPicker.vue'
import type { ProductItem } from '@/lib/library'
import { cloud, errorMessage } from '@/lib/session'
import { deleteRecord, getRecord, newId, saveRecord } from '@/lib/sync'
import { toast } from '@/lib/toast'

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const id = isNew ? newId('listing') : String(route.params.id)

const form = reactive<SyncListing>({ images: [], category: 'earring', language: 'en-US', sku: '', price: '', title: '', description: '', createdAt: Date.now() })
const cover = ref<string | undefined>()
const loaded = ref(isNew)
const picking = ref(false)
const generating = ref(false)
const usage = ref<{ usedToday: number; dailyLimit: number } | null>(null)
const categories = Object.entries(TIKTOK_LISTING_CATEGORY_LABELS) as [TiktokListingCategory, string][]
const languages = Object.entries(TIKTOK_LISTING_LANGUAGE_LABELS) as [TiktokListingLanguage, string][]
const canGenerate = computed(() => form.images.length > 0 && !generating.value)

/** 商品库里的品类对应到上架助手支持的品类 */
const CATEGORY_FROM_PRODUCT: Partial<Record<string, TiktokListingCategory>> = { earring: 'earring', ring: 'ring', necklace: 'necklace', phone_case: 'phone_case', bracelet: 'bracelet' }

onMounted(async () => {
  void cloud.ai.usage().then((value) => (usage.value = value)).catch(() => undefined)
  if (isNew) {
    if (route.query.product) await pickProductById(String(route.query.product))
    return
  }
  const record = await getRecord<SyncListing>(SYNC_COLLECTIONS.listings, id)
  if (record?.data) Object.assign(form, record.data)
  loaded.value = true
})

async function pickProductById(productId: string) {
  const record = await getRecord<ProductItem>(SYNC_COLLECTIONS.products, productId)
  if (record?.data) applyProduct({ ...record.data, id: productId })
}

function applyProduct(product: Pick<ProductItem, 'id' | 'images' | 'type' | 'coverFileId'>) {
  form.productId = product.id
  form.images = [...product.images]
  cover.value = product.coverFileId
  const category = CATEGORY_FROM_PRODUCT[product.type]
  if (category) form.category = category
  picking.value = false
}

function cleanTitle(text: string) {
  return text.split('\n').map((line) => line.trim()).find(Boolean)?.replace(/^["'“”「」《》]+|["'“”「」《》]+$/g, '').replace(/^(title|标题)\s*[:：]\s*/i, '').slice(0, 200) || ''
}

async function generate() {
  if (!form.images.length) {
    toast('请先添加商品图片')
    return
  }
  generating.value = true
  // The selected cover first, so the model looks at the main product shot.
  const ordered = [...form.images].sort((a, b) => Number(b.fileId === cover.value) - Number(a.fileId === cover.value))
  const imageFileIds = ordered.slice(0, 2).map((image) => image.fileId)
  const detailText = form.price ? `Price: ${form.price}` : undefined
  try {
    const [title, description] = await Promise.all([
      cloud.ai.chat({
        system: 'Only output the final title.',
        prompt: buildTiktokListingTitlePrompt({ category: form.category, language: form.language, sku: form.sku, detailText }),
        imageFileIds,
        purpose: 'listing-title',
      }),
      cloud.ai.chat({
        system: 'Only output the final description.',
        prompt: buildTiktokListingDescriptionPrompt({ category: form.category, language: form.language, sku: form.sku, detailText }),
        imageFileIds,
        purpose: 'listing-description',
      }),
    ])
    form.title = cleanTitle(title.content)
    form.description = description.content.trim()
    form.generatedAt = Date.now()
    await save(false)
    toast('已生成，可以直接修改')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    generating.value = false
    void cloud.ai.usage().then((value) => (usage.value = value)).catch(() => undefined)
  }
}

async function save(leave = true) {
  await saveRecord<SyncListing>(SYNC_COLLECTIONS.listings, id, { ...form, sku: form.sku.trim(), price: form.price.trim() })
  if (leave) {
    toast('已保存')
    router.back()
  }
}

async function copy(text: string, label: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast(`${label}已复制`)
  } catch {
    toast('复制失败，请长按文字手动复制')
  }
}

async function remove() {
  if (!window.confirm('删除这条上架文案？')) return
  await deleteRecord(SYNC_COLLECTIONS.listings, id)
  router.back()
}
</script>

<template>
  <PageHeader :title="isNew ? '新建上架文案' : '上架文案'" back="/listings">
    <template v-if="!isNew" #actions>
      <button type="button" class="m-icon-btn" aria-label="删除" @click="remove"><Trash2 :size="20" /></button>
    </template>
  </PageHeader>

  <main v-if="loaded" class="m-page m-page--no-tabs">
    <section class="m-section">
      <div class="m-section__head">
        <h2 class="m-section__title">商品图片</h2>
        <button type="button" class="m-section__link" @click="picking = true"><Boxes :size="14" /> 从商品库选择</button>
      </div>
      <ImageGrid v-model:images="form.images" v-model:cover="cover" />
    </section>

    <section class="m-section">
      <div class="m-field">
        <span class="m-field__label">品类</span>
        <div class="chips">
          <button v-for="[value, label] in categories" :key="value" type="button" class="m-chip" :class="{ 'is-active': form.category === value }" @click="form.category = value">{{ label }}</button>
        </div>
      </div>
      <div class="m-field">
        <span class="m-field__label">文案语言</span>
        <div class="chips">
          <button v-for="[value, label] in languages" :key="value" type="button" class="m-chip" :class="{ 'is-active': form.language === value }" @click="form.language = value">{{ label }}</button>
        </div>
      </div>
      <div class="row">
        <label class="m-field">
          <span class="m-field__label">SKU</span>
          <input v-model="form.sku" class="m-input" type="text" maxlength="60" placeholder="选填" />
        </label>
        <label class="m-field">
          <span class="m-field__label">售价</span>
          <input v-model="form.price" class="m-input" type="text" inputmode="decimal" maxlength="30" placeholder="选填，如 $9.99" />
        </label>
      </div>
      <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="!canGenerate" @click="generate">
        <LoaderCircle v-if="generating" :size="18" class="m-spin" /><Sparkles v-else :size="18" />
        {{ generating ? 'AI 正在写文案…' : form.title ? '重新生成标题和描述' : 'AI 生成标题和描述' }}
      </button>
      <p class="hint">
        AI 会看商品图片写文案，约 10–30 秒。<template v-if="usage">今天已用 {{ usage.usedToday }} / {{ usage.dailyLimit }} 次。</template>
      </p>
    </section>

    <section v-if="form.title || form.description" class="m-section">
      <label class="m-field">
        <span class="m-field__label field-head">商品标题<button type="button" class="copy" @click.prevent="copy(form.title, '标题')"><Copy :size="14" /> 复制</button></span>
        <textarea v-model="form.title" class="m-textarea title" maxlength="255" />
        <span class="count">{{ form.title.length }} / 200</span>
      </label>
      <label class="m-field">
        <span class="m-field__label field-head">商品描述<button type="button" class="copy" @click.prevent="copy(form.description, '描述')"><Copy :size="14" /> 复制</button></span>
        <textarea v-model="form.description" class="m-textarea desc" />
      </label>
    </section>
  </main>

  <div v-if="loaded" class="m-footer-bar">
    <button type="button" class="m-btn" @click="router.back()">取消</button>
    <button type="button" class="m-btn m-btn--primary" :disabled="!form.images.length" @click="save()">保存</button>
  </div>

  <ProductPicker v-if="picking" @close="picking = false" @pick="applyProduct" />
</template>

<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.hint { margin: 10px 2px 0; color: var(--theme-text-muted); font-size: 12px; line-height: 1.6; }
.m-section__link { display: inline-flex; align-items: center; gap: 4px; }
.field-head { display: flex; align-items: center; justify-content: space-between; }
.copy { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border: 1px solid var(--m-accent-line); border-radius: 999px; background: var(--m-accent-soft); color: var(--m-accent-2); font-size: 12px; font-weight: 700; }
.title { min-height: 84px; font-weight: 600; }
.desc { min-height: 180px; }
.count { display: block; margin: 6px 2px 0; color: var(--theme-text-muted); font-size: 11px; text-align: right; }
</style>
