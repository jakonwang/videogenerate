<script setup lang="ts">
/**
 * tk创意室 ordering (web + phone): pick a product and scene images; the user's computer runs the job
 * with its TikTok creative accounts and the videos come back here, in 作品库 and in 审核收件箱.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, Boxes, ImagePlus, Inbox, LoaderCircle, Monitor, Send, Wand2, X } from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import PageHeader from '@/components/PageHeader.vue'
import ProductPicker from '@/components/ProductPicker.vue'
import WebStep from '@/components/web/WebStep.vue'
import { CREATIVE_REQUEST_MAX_IMAGES, CREATIVE_STATE_LABEL, submitCreativeOrder, useCreativeOrders } from '@/lib/creative'
import { useAssets } from '@/lib/assets'
import { uploadImage } from '@/lib/files'
import { useMuseAvailable } from '@/lib/muse'
import { relativeTime, type ProductItem } from '@/lib/library'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'

const router = useRouter()
const orders = useCreativeOrders()
const { items: libraryImages } = useAssets((item) => item.kind === 'image')
const product = ref<ProductItem | null>(null)
const scenes = ref<string[]>([])
const mode = ref<'reference_to_video' | 'image_to_video'>('reference_to_video')
const picking = ref(false)
const museAvailable = useMuseAvailable()
const uploading = ref(0)
const submitting = ref(false)
const input = ref<HTMLInputElement>()
const pendingCount = computed(() => orders.value.filter((o) => o.state === 'pending').length)

async function onFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || []).slice(0, CREATIVE_REQUEST_MAX_IMAGES - scenes.value.length)
  ;(event.target as HTMLInputElement).value = ''
  for (const file of files) {
    uploading.value += 1
    try {
      scenes.value = [...scenes.value, (await uploadImage(file)).fileId]
    } catch (error) {
      toast(`上传失败：${errorMessage(error)}`)
    } finally {
      uploading.value -= 1
    }
  }
}

function toggleLibrary(fileId: string) {
  if (scenes.value.includes(fileId)) scenes.value = scenes.value.filter((id) => id !== fileId)
  else if (scenes.value.length < CREATIVE_REQUEST_MAX_IMAGES) scenes.value = [...scenes.value, fileId]
}

async function submit() {
  if (!product.value) return
  submitting.value = true
  try {
    await submitCreativeOrder({ productId: product.value.id, productName: product.value.name, referenceFileIds: scenes.value, mode: mode.value })
    scenes.value = []
    toast('已下单，电脑端同步后会开始出片')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <PageHeader title="tk创意室" back="/create" description="场景图换上你的商品，用 TikTok 创意账号批量出短视频。由你的电脑执行（需开着 Klipmill 并已登录同一账号）。">
    <template #actions>
      <button v-if="museAvailable" type="button" class="vg-btn" data-testid="muse-entry" @click="router.push('/muse')"><Wand2 :size="14" /> Muse创意室</button>
      <button type="button" class="vg-btn" @click="router.push('/business?tab=creative')"><Monitor :size="14" /> 电脑端任务进度</button>
      <button type="button" class="vg-btn" @click="router.push('/review')"><Inbox :size="14" /> 审核收件箱</button>
    </template>
  </PageHeader>
  <main class="vg-page wt-page cr" data-testid="creative-orders">
    <div class="wt-grid">
      <WebStep :index="1" title="商品" subtitle="要换上的商品，需已同步到电脑端">
        <button v-if="!product" type="button" class="wis-drop-like" @click="picking = true">
          <span class="wis-drop-like__icon"><Boxes :size="20" /></span>
          <strong>选择商品</strong>
          <small>从商品库选择</small>
        </button>
        <div v-else class="pr-product">
          <strong>{{ product.name }}</strong>
          <button type="button" class="vg-btn vg-btn--sm" @click="picking = true">更换</button>
        </div>
        <div class="wt-field">
          <span class="vg-field__label">出片方式</span>
          <div class="vg-seg vg-seg--sm">
            <button type="button" class="vg-seg__btn" :class="{ 'is-active': mode === 'reference_to_video' }" @click="mode = 'reference_to_video'">参考图生视频</button>
            <button type="button" class="vg-seg__btn" :class="{ 'is-active': mode === 'image_to_video' }" @click="mode = 'image_to_video'">首帧生视频</button>
          </div>
        </div>
        <div class="vg-notice vg-notice--accent wt-note"><Monitor :size="14" /> 订单会在电脑端下一次同步时开始（约 1 分钟内）；电脑关着时会等它打开再执行。</div>
      </WebStep>

      <WebStep :index="2" title="场景图" subtitle="每张出一条视频" :meta="`${scenes.length}/${CREATIVE_REQUEST_MAX_IMAGES}`">
        <div class="pr-scenes">
          <div v-for="(fileId, index) in scenes" :key="fileId" class="pr-scene">
            <CloudImage :file-id="fileId" />
            <button type="button" class="pr-scene__remove" aria-label="移除" @click="scenes.splice(index, 1)"><X :size="13" /></button>
          </div>
          <button v-if="scenes.length < CREATIVE_REQUEST_MAX_IMAGES" type="button" class="pr-scene pr-scene--add" :disabled="uploading > 0" @click="input?.click()">
            <LoaderCircle v-if="uploading" :size="20" class="vg-spin" /><ImagePlus v-else :size="20" />
            <span>{{ uploading ? '上传中' : '上传' }}</span>
          </button>
        </div>
        <input ref="input" type="file" accept="image/*" multiple hidden @change="onFiles" />
        <div v-if="libraryImages.length" class="vt-lib">
          <span class="vg-field__label">从素材库选</span>
          <div class="vt-lib__row">
            <button v-for="item in libraryImages.slice(0, 12)" :key="item.id" type="button" class="vt-lib__img" :class="{ 'is-active': scenes.includes(item.fileId) }" :title="item.name" @click="toggleLibrary(item.fileId)"><CloudImage :file-id="item.fileId" /></button>
          </div>
        </div>
        <template #foot>
          <span class="vg-muted wt-foot-hint">{{ !product ? '先选商品' : !scenes.length ? '再添加场景图' : `将出 ${scenes.length} 条视频` }}</span>
          <button type="button" class="vg-btn vg-btn--primary" data-testid="creative-submit" :disabled="submitting || !product || !scenes.length" @click="submit">
            <LoaderCircle v-if="submitting" :size="14" class="vg-spin" /><Send v-else :size="14" /> 交给电脑出片
          </button>
        </template>
      </WebStep>

      <WebStep :index="3" title="我的订单" :meta="pendingCount ? `${pendingCount} 单等电脑接单` : orders.length ? `${orders.length} 单` : undefined">
        <div v-if="orders.length" class="cr-orders">
          <div v-for="order in orders.slice(0, 20)" :key="order.id" class="cr-order">
            <div class="cr-order__head">
              <strong>{{ order.productName || '商品' }} · {{ order.styleVideoFileId ? '同款视频' : `${order.referenceFileIds.length} 张` }}</strong>
              <span class="vg-pill vg-pill--dot" :class="order.state === 'completed' ? 'vg-pill--green' : order.state === 'failed' || order.state === 'skipped' ? 'vg-pill--red' : order.state === 'running' ? 'vg-pill--blue' : 'vg-pill--amber'">{{ CREATIVE_STATE_LABEL[order.state] }}</span>
            </div>
            <small class="vg-muted">{{ relativeTime(order.createdAt) }}<template v-if="order.reportedAt"> · 电脑 {{ relativeTime(order.reportedAt) }}更新</template></small>
            <p v-if="order.error" class="cr-order__error"><AlertTriangle :size="12" /> {{ order.error }}</p>
            <div v-if="order.shots?.length" class="vt-run__outputs">
              <div v-for="(shot, index) in order.shots" :key="index" class="vt-run__video cr-shot">
                <CloudVideo v-if="shot.outputFileId" :file-id="shot.outputFileId" controls />
                <span v-else class="cr-shot__state" :title="shot.error">
                  <LoaderCircle v-if="shot.status === 'running'" :size="14" class="vg-spin" /><AlertTriangle v-else :size="14" />
                </span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="vg-empty pw-empty">
          <span class="vg-empty__icon"><Wand2 :size="20" /></span>
          <p>还没有订单。完成的视频也会出现在作品库和审核收件箱。</p>
        </div>
      </WebStep>
    </div>
    <ProductPicker v-if="picking" @close="picking = false" @pick="(item: ProductItem) => { product = item; picking = false }" />
  </main>
</template>

<style scoped>
.cr-orders { display: flex; flex-direction: column; gap: 10px; }
.cr-order { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); }
.cr-order__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.cr-order__head strong { overflow: hidden; font-size: 12.5px; text-overflow: ellipsis; white-space: nowrap; }
.cr-order small { font-size: 11px; }
.cr-order__error { display: flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--vg-red); }
.cr-shot { display: grid; place-items: center; }
.cr-shot__state { color: rgba(255, 255, 255, .8); }
</style>
