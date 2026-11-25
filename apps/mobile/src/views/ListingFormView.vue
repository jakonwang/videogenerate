<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Boxes, Copy, LoaderCircle, Sparkles, Trash2 } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncListing } from '@shared/cloud/sync'
import {
  TIKTOK_LISTING_LANGUAGE_LABELS,
  type TiktokListingLanguage,
} from '@shared/tiktokListingPrompts'
import CategoryChips from '@/components/CategoryChips.vue'
import ImageGrid from '@/components/ImageGrid.vue'
import PageHeader from '@/components/PageHeader.vue'
import ProductPicker from '@/components/ProductPicker.vue'
import type { ProductItem } from '@/lib/library'
import { cloud, errorMessage } from '@/lib/session'
import { writeListingCopy } from '@/lib/listing'
import { deleteRecord, getRecord, newId, saveRecord } from '@/lib/sync'
import { toast } from '@/lib/toast'
import { useInWebShell } from '@/lib/layout'
import WebStep from '@/components/web/WebStep.vue'
import WebResults from '@/components/web/WebResults.vue'
import { FileText, Image as ImageIcon } from 'lucide-vue-next'
const inWebShell = useInWebShell()

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const id = isNew ? newId('listing') : String(route.params.id)

const form = reactive<SyncListing>({ images: [], category: 'general', language: 'en-US', sku: '', price: '', title: '', description: '', createdAt: Date.now() })
const cover = ref<string | undefined>()
const loaded = ref(isNew)
const picking = ref(false)
const generating = ref(false)
const usage = ref<{ usedToday: number; dailyLimit: number } | null>(null)
const languages = Object.entries(TIKTOK_LISTING_LANGUAGE_LABELS) as [TiktokListingLanguage, string][]
const canGenerate = computed(() => form.images.length > 0 && !generating.value)

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
  if (product.type && product.type !== 'general') form.category = product.type
  picking.value = false
}

async function generate() {
  if (!form.images.length) {
    toast('请先添加商品图片')
    return
  }
  generating.value = true
  try {
    const copy = await writeListingCopy({ images: form.images, coverFileId: cover.value, category: form.category, language: form.language, sku: form.sku, price: form.price })
    form.title = copy.title
    form.description = copy.description
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
  <template v-if="inWebShell">
    <PageHeader :title="isNew ? '添加商品' : form.title || '商品编辑'" back="/listings" description="TikTok 上架助手 · AI 看商品图写标题和描述">
      <template #actions>
        <button v-if="!isNew" type="button" class="vg-btn vg-btn--danger" @click="remove"><Trash2 :size="14" /> 删除</button>
        <button type="button" class="vg-btn vg-btn--primary" :disabled="!form.images.length" @click="save()">保存</button>
      </template>
    </PageHeader>
    <main v-if="loaded" class="vg-page pd" data-testid="web-listing-form">
      <div class="pd-form">
        <div class="mf-left">
          <section class="pd-card">
            <h2 class="vg-section-title"><ImageIcon :size="16" /> 商品图片 <small>第一张或带星号的图作为主图</small></h2>
            <ImageGrid v-model:images="form.images" v-model:cover="cover" />
            <div><button type="button" class="vg-btn vg-btn--sm" @click="picking = true"><Boxes :size="14" /> 从商品库选择</button></div>
          </section>
          <section class="pd-card">
            <h2 class="vg-section-title"><FileText :size="16" /> 商品信息</h2>
            <div class="vg-field"><span class="vg-field__label">品类</span><CategoryChips v-model="form.category" web /></div>
            <div class="vg-field"><span class="vg-field__label">文案语言</span><div class="vg-seg vg-seg--sm"><button v-for="[value, label] in languages" :key="value" type="button" class="vg-seg__btn" :class="{ 'is-active': form.language === value }" @click="form.language = value">{{ label }}</button></div></div>
            <div class="lf-row">
              <label class="vg-field"><span class="vg-field__label">SKU</span><input v-model="form.sku" class="vg-input" type="text" maxlength="60" placeholder="选填" /></label>
              <label class="vg-field"><span class="vg-field__label">售价</span><input v-model="form.price" class="vg-input" type="text" inputmode="decimal" maxlength="30" placeholder="选填，如 $9.99" /></label>
            </div>
          </section>
        </div>
        <section class="pd-card">
          <div class="lf-head">
            <h2 class="vg-section-title"><Sparkles :size="16" /> 标题与描述 <small v-if="usage">今天已用 {{ usage.usedToday }} / {{ usage.dailyLimit }} 次</small></h2>
            <button type="button" class="vg-btn vg-btn--primary" :disabled="!canGenerate" @click="generate">
              <LoaderCircle v-if="generating" :size="14" class="vg-spin" /><Sparkles v-else :size="14" /> {{ generating ? 'AI 正在写…' : form.title ? '重新生成' : 'AI 生成' }}
            </button>
          </div>
          <label class="vg-field">
            <span class="vg-field__label lf-label">商品标题 <span class="vg-muted">{{ form.title.length }} / 200</span><button type="button" class="vg-btn vg-btn--xs" @click.prevent="copy(form.title, '标题')"><Copy :size="12" /> 复制</button></span>
            <textarea v-model="form.title" class="vg-textarea" rows="3" maxlength="255" placeholder="AI 生成后可以直接修改" />
          </label>
          <label class="vg-field">
            <span class="vg-field__label lf-label">商品描述<button type="button" class="vg-btn vg-btn--xs" @click.prevent="copy(form.description, '描述')"><Copy :size="12" /> 复制</button></span>
            <textarea v-model="form.description" class="vg-textarea" rows="14" placeholder="AI 会看商品图片写描述，约 10–30 秒" />
          </label>
        </section>
      </div>
      <ProductPicker v-if="picking" @close="picking = false" @pick="applyProduct" />
    </main>
  </template>
  <template v-else>
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
        <CategoryChips v-model="form.category" />
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
