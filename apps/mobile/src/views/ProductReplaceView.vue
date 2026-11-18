<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Boxes, Check, ImagePlus, Inbox, LoaderCircle, Replace, X } from 'lucide-vue-next'
import type { SyncFileRef } from '@shared/cloud/sync'
import CloudImage from '@/components/CloudImage.vue'
import GenerationTile from '@/components/GenerationTile.vue'
import PageHeader from '@/components/PageHeader.vue'
import ProductPicker from '@/components/ProductPicker.vue'
import { uploadImage } from '@/lib/files'
import { closestAspect, generateProductReplacement, startPolling, useGenerations } from '@/lib/generate'
import type { ProductItem } from '@/lib/library'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'
import { useInWebShell } from '@/lib/layout'
import WebStep from '@/components/web/WebStep.vue'
import WebResults from '@/components/web/WebResults.vue'
const inWebShell = useInWebShell()

/** 商品替换：把场景图里原来的商品换成我的商品（构图、人物、背景不变） */

const MAX_SCENES = 10
const router = useRouter()
const product = ref<ProductItem | null>(null)
const refs = ref<string[]>([])
const scenes = ref<SyncFileRef[]>([])
const note = ref('')
const picking = ref(false)
const uploading = ref(0)
const submitting = ref(false)
const input = ref<HTMLInputElement>()
const results = useGenerations((item) => item.purpose === 'product-replace')
const pendingReview = computed(() => results.value.filter((item) => item.status === 'succeeded' && item.review === 'pending').length)

onMounted(startPolling)

function pickProduct(item: ProductItem) {
  picking.value = false
  if (!item.images.length) return toast('这个商品还没有图片')
  product.value = item
  refs.value = item.images.slice(0, 3).map((image) => image.fileId)
}

function toggleRef(fileId: string) {
  if (refs.value.includes(fileId)) refs.value = refs.value.filter((id) => id !== fileId)
  else if (refs.value.length >= 3) toast('最多选 3 张商品图')
  else refs.value = [...refs.value, fileId]
}

async function onFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? []).slice(0, MAX_SCENES - scenes.value.length)
  ;(event.target as HTMLInputElement).value = ''
  uploading.value = files.length
  for (const file of files) {
    try {
      scenes.value = [...scenes.value, await uploadImage(file)]
    } catch (error) {
      toast(`上传失败：${errorMessage(error)}`)
    } finally {
      uploading.value -= 1
    }
  }
}

async function start() {
  if (!product.value || !refs.value.length) return toast('先选我的商品')
  if (!scenes.value.length) return toast('至少上传一张场景图')
  submitting.value = true
  try {
    await generateProductReplacement({
      productId: product.value.id,
      productName: product.value.name,
      productFileIds: refs.value,
      scenes: scenes.value.map((scene) => ({ fileId: scene.fileId, aspectRatio: closestAspect(scene.width, scene.height) })),
      note: note.value,
    })
    toast(`已提交 ${scenes.value.length} 张，约 1–2 分钟生成好，可以先离开`)
    scenes.value = []
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <template v-if="inWebShell">
    <PageHeader title="商品替换" description="上传别人的场景图（上身图、摆拍图），AI 把里面的商品换成你的，构图、人物、背景都不变。">
      <template #actions>
        <button type="button" class="vg-btn" @click="router.push('/review')"><Inbox :size="15" /> 审核收件箱 <span v-if="pendingReview" class="vg-count">{{ pendingReview }}</span></button>
      </template>
    </PageHeader>
    <main class="vg-page wt-page" data-testid="web-product-replace">
      <div class="wt-grid">
        <WebStep :index="1" title="目标商品" subtitle="选商品后勾选 1–3 张参考图" :meta="product ? `${refs.length}/3` : undefined">
          <button v-if="!product" type="button" class="wis-drop-like" @click="picking = true">
            <span class="wis-drop-like__icon"><Boxes :size="20" /></span>
            <strong>选择商品</strong>
            <small>从商品库选择要换上的商品</small>
          </button>
          <template v-else>
            <div class="pr-product">
              <strong>{{ product.name }}</strong>
              <button type="button" class="vg-btn vg-btn--sm" @click="picking = true">更换</button>
            </div>
            <div class="pr-refs">
              <button v-for="image in product.images" :key="image.fileId" type="button" class="pr-ref" :class="{ 'is-active': refs.includes(image.fileId) }" @click="toggleRef(image.fileId)">
                <CloudImage :file-id="image.fileId" />
                <span v-if="refs.includes(image.fileId)" class="pr-ref__check"><Check :size="12" /></span>
              </button>
            </div>
          </template>
        </WebStep>
        <WebStep :index="2" title="待替换图片" subtitle="每张场景图生成 1 张" :meta="`${scenes.length}/${MAX_SCENES} 张`">
          <div class="pr-scenes">
            <div v-for="(scene, index) in scenes" :key="scene.fileId" class="pr-scene">
              <CloudImage :file-id="scene.fileId" />
              <button type="button" class="pr-scene__remove" aria-label="移除" @click="scenes.splice(index, 1)"><X :size="13" /></button>
            </div>
            <button v-if="scenes.length < MAX_SCENES" type="button" class="pr-scene pr-scene--add" :disabled="uploading > 0" @click="input?.click()">
              <LoaderCircle v-if="uploading" :size="20" class="vg-spin" /><ImagePlus v-else :size="20" />
              <span>{{ uploading ? '上传中' : '上传图片' }}</span>
            </button>
          </div>
          <p class="vg-muted wt-note">点击上传或把图片拖到这里，支持 JPG、PNG、WEBP</p>
          <input ref="input" type="file" accept="image/*" multiple hidden @change="onFiles" />
          <label class="vg-field">
            <span class="vg-field__label">补充要求（选填）</span>
            <textarea v-model="note" class="vg-textarea" rows="3" maxlength="300" placeholder="例如：保持模特手势不变，商品大小和原来一样" />
          </label>
          <template #foot>
            <span class="vg-muted wt-foot-hint">{{ !refs.length ? '先选商品参考图' : !scenes.length ? '再上传场景图' : `将生成 ${scenes.length} 张` }}</span>
            <button type="button" class="vg-btn vg-btn--primary" :disabled="submitting || !refs.length || !scenes.length" @click="start">
              <LoaderCircle v-if="submitting" :size="15" class="vg-spin" /><Replace v-else :size="15" /> 开始批量替换
            </button>
          </template>
        </WebStep>
        <WebResults :index="3" :items="results" title="批次记录" />
      </div>
      <ProductPicker v-if="picking" @close="picking = false" @pick="pickProduct" />
    </main>
  </template>
  <template v-else>
  <PageHeader title="商品替换" back="/create">
    <template #actions>
      <button type="button" class="m-icon-btn inbox" aria-label="审核收件箱" @click="router.push('/review')">
        <Inbox :size="20" /><span v-if="pendingReview" class="dot">{{ pendingReview }}</span>
      </button>
    </template>
  </PageHeader>
  <main class="m-page m-page--no-tabs wb">
    <p class="intro">上传别人的场景图（上身图、摆拍图），AI 把里面的商品换成你的，构图、人物、背景都不变。</p>

    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">1. 我的商品</h2><span v-if="product" class="m-muted small">选 1–3 张参考图</span></div>
      <button v-if="!product" type="button" class="m-btn m-btn--block" @click="picking = true"><Boxes :size="18" /> 从商品库选择</button>
      <template v-else>
        <div class="m-card product">
          <strong>{{ product.name }}</strong>
          <button type="button" class="m-btn m-btn--sm" @click="picking = true">换一个</button>
        </div>
        <div class="refs">
          <button v-for="image in product.images" :key="image.fileId" type="button" class="ref" :class="{ 'is-active': refs.includes(image.fileId) }" @click="toggleRef(image.fileId)">
            <CloudImage :file-id="image.fileId" />
            <span v-if="refs.includes(image.fileId)" class="ref__check"><Check :size="12" /></span>
          </button>
        </div>
      </template>
    </section>

    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">2. 场景图</h2><span class="m-muted small">{{ scenes.length }}/{{ MAX_SCENES }}，每张生成 1 张</span></div>
      <div class="scenes">
        <div v-for="(scene, index) in scenes" :key="scene.fileId" class="scene">
          <CloudImage :file-id="scene.fileId" />
          <button type="button" class="scene__remove" aria-label="移除" @click="scenes.splice(index, 1)"><X :size="14" /></button>
        </div>
        <button v-if="scenes.length < MAX_SCENES" type="button" class="scene scene--add" :disabled="uploading > 0" @click="input?.click()">
          <LoaderCircle v-if="uploading" :size="22" class="m-spin" /><ImagePlus v-else :size="22" />
          <span>{{ uploading ? '上传中' : '添加' }}</span>
        </button>
      </div>
      <input ref="input" type="file" accept="image/*" multiple hidden @change="onFiles" />
    </section>

    <section class="m-section">
      <label class="m-field">
        <span class="m-field__label">补充要求（选填）</span>
        <textarea v-model="note" class="m-textarea" maxlength="300" placeholder="例如：保持模特手势不变，商品大小和原来一样" />
      </label>
    </section>

    <section class="m-section">
      <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="submitting || !refs.length || !scenes.length" @click="start">
        <LoaderCircle v-if="submitting" :size="18" class="m-spin" /><Replace v-else :size="18" /> 开始替换{{ scenes.length ? ` ${scenes.length} 张` : '' }}
      </button>
    </section>

    <section v-if="results.length" class="m-section wb-results">
      <div class="m-section__head"><h2 class="m-section__title">最近结果</h2><button type="button" class="m-section__link" @click="router.push('/review')">去审核</button></div>
      <div class="results">
        <GenerationTile v-for="item in results.slice(0, 12)" :key="item.id" :item="item" @click="router.push(`/review?focus=${item.id}`)" />
      </div>
    </section>
    <section v-else class="m-section wb-results wb-results--empty"><div class="m-card m-empty"><span class="m-empty__title">生成结果会出现在这里</span><span class="m-empty__text">在云端生成，完成后也会进入「审核收件箱」</span></div></section>
  </main>
  <ProductPicker v-if="picking" @close="picking = false" @pick="pickProduct" />
  </template>
</template>

<style scoped>
.intro { margin: 4px 2px 0; color: var(--theme-text-muted); font-size: 13px; line-height: 1.6; }
.small { font-size: 12px; }
.product { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; }
.product strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.refs { display: flex; gap: 8px; overflow-x: auto; margin-top: 10px; padding-bottom: 2px; }
.ref { position: relative; flex: none; width: 72px; height: 72px; overflow: hidden; padding: 0; border: 2px solid transparent; border-radius: 12px; background: var(--theme-control-hover); opacity: 0.55; }
.ref.is-active { border-color: var(--m-accent); opacity: 1; }
.ref :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.ref__check { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 999px; background: var(--m-accent); color: #04201c; }
.scenes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.scene { position: relative; aspect-ratio: 3 / 4; overflow: hidden; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-control-hover); }
.scene :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.scene__remove { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 999px; background: rgba(0, 0, 0, 0.6); color: #fff; }
.scene--add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border-style: dashed; color: var(--theme-text-muted); font-size: 12px; }
.results { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.inbox { position: relative; }
.dot { position: absolute; top: 2px; right: 0; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; background: var(--m-red); color: #fff; font-size: 10px; font-weight: 800; line-height: 16px; }
</style>
