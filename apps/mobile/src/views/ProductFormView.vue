<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Clapperboard, ImagePlus, Store, Trash2 } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, SYNC_PRODUCT_TYPE_LABELS, type SyncProduct, type SyncProductType } from '@shared/cloud/sync'
import ImageGrid from '@/components/ImageGrid.vue'
import PageHeader from '@/components/PageHeader.vue'
import { deleteRecord, getRecord, newId, saveRecord } from '@/lib/sync'
import { toast } from '@/lib/toast'

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const id = isNew ? newId('prod') : String(route.params.id)

const form = reactive<SyncProduct>({ name: '', type: 'general', remark: '', tiktokProductIds: [], images: [], coverFileId: undefined, createdAt: Date.now() })
const tiktokIds = ref('')
const loaded = ref(isNew)
const missing = ref(false)
const types = Object.entries(SYNC_PRODUCT_TYPE_LABELS) as [SyncProductType, string][]
const canSave = computed(() => form.name.trim().length > 0)

onMounted(async () => {
  if (isNew) return
  const record = await getRecord<SyncProduct>(SYNC_COLLECTIONS.products, id)
  if (!record?.data || record.deleted) {
    missing.value = true
  } else {
    Object.assign(form, { remark: '', tiktokProductIds: [], ...record.data, images: record.data.images || [] })
    tiktokIds.value = (record.data.tiktokProductIds || []).join('\n')
  }
  loaded.value = true
})

async function save() {
  if (!canSave.value) {
    toast('请填写商品名称')
    return
  }
  const data: SyncProduct = {
    ...form,
    name: form.name.trim(),
    remark: form.remark?.trim() || '',
    tiktokProductIds: tiktokIds.value.split(/[\s,，]+/).map((value) => value.trim()).filter(Boolean),
    coverFileId: form.coverFileId || form.images[0]?.fileId,
  }
  await saveRecord(SYNC_COLLECTIONS.products, id, data)
  toast(isNew ? '商品已创建' : '已保存')
  router.back()
}

async function remove() {
  if (!window.confirm(`删除商品「${form.name}」？电脑端也会同步删除。`)) return
  await deleteRecord(SYNC_COLLECTIONS.products, id)
  toast('已删除')
  router.back()
}
</script>

<template>
  <PageHeader :title="isNew ? '新建商品' : '编辑商品'" back="/library?tab=products">
    <template v-if="!isNew && !missing" #actions>
      <button type="button" class="m-icon-btn" aria-label="删除商品" @click="remove"><Trash2 :size="20" /></button>
    </template>
  </PageHeader>

  <main v-if="loaded" class="m-page m-page--no-tabs">
    <div v-if="missing" class="m-empty">
      <span class="m-empty__title">商品不存在</span>
      <span class="m-empty__text">可能已在其他设备上删除</span>
    </div>
    <template v-else>
      <section class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">商品图片</h2><span class="m-muted hint">{{ form.images.length }} 张</span></div>
        <ImageGrid v-model:images="form.images" v-model:cover="form.coverFileId" />
        <p class="m-muted hint tip">建议拍白底正面图、细节图和佩戴图，复刻和生成图片时会用到</p>
        <button v-if="!isNew && form.images.length" type="button" class="m-btn m-btn--block listing-btn" @click="router.push({ path: '/listings/new', query: { product: id } })">
          <Store :size="18" /> 用这个商品写上架文案
        </button>
        <div v-if="!isNew && form.images.length" class="ai-row">
          <button type="button" class="m-btn" @click="router.push({ path: '/product-images', query: { product: id } })"><ImagePlus :size="18" /> 生成商品图</button>
          <button type="button" class="m-btn" @click="router.push({ path: '/image-to-video', query: { product: id } })"><Clapperboard :size="18" /> 图生视频</button>
        </div>
      </section>

      <section class="m-section">
        <label class="m-field">
          <span class="m-field__label">商品名称</span>
          <input v-model="form.name" class="m-input" type="text" maxlength="80" placeholder="例如：法式珍珠耳环" />
        </label>

        <div class="m-field">
          <span class="m-field__label">品类</span>
          <div class="types">
            <button v-for="[value, label] in types" :key="value" type="button" class="m-chip" :class="{ 'is-active': form.type === value }" @click="form.type = value">{{ label }}</button>
          </div>
        </div>

        <label class="m-field">
          <span class="m-field__label">备注</span>
          <textarea v-model="form.remark" class="m-textarea" maxlength="500" placeholder="材质、尺寸、卖点等，选填" />
        </label>

        <label class="m-field">
          <span class="m-field__label">TikTok 商品 ID</span>
          <textarea v-model="tiktokIds" class="m-textarea ids" placeholder="每行一个，用于关联广告和达人数据，选填" />
        </label>
      </section>
    </template>
  </main>

  <div v-if="loaded && !missing" class="m-footer-bar">
    <button type="button" class="m-btn" @click="router.back()">取消</button>
    <button type="button" class="m-btn m-btn--primary" :disabled="!canSave" @click="save">{{ isNew ? '创建商品' : '保存' }}</button>
  </div>
</template>

<style scoped>
.hint { font-size: 12px; }
.tip { margin: 10px 2px 0; }
.listing-btn { margin-top: 14px; }
.ai-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.ai-row .m-btn { height: 44px; font-size: 14px; }
.types { display: flex; flex-wrap: wrap; gap: 8px; }
.ids { min-height: 72px; font-family: ui-monospace, monospace; font-size: 13px; }
</style>
