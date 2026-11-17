<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Clapperboard, LoaderCircle } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncProduct } from '@shared/cloud/sync'
import GenerationTile from '@/components/GenerationTile.vue'
import PageHeader from '@/components/PageHeader.vue'
import SourcePicker, { type Source } from '@/components/SourcePicker.vue'
import { generateVideo, startPolling, useGenerations, VIDEO_MOTIONS } from '@/lib/generate'
import { errorMessage } from '@/lib/session'
import { getRecord } from '@/lib/sync'
import { toast } from '@/lib/toast'

const route = useRoute()
const router = useRouter()
const source = ref<Source | null>(null)
const motion = ref<(typeof VIDEO_MOTIONS)[number]['key']>('subtle')
const duration = ref(6)
const submitting = ref(false)
const results = useGenerations((item) => item.purpose === 'image-to-video')

onMounted(async () => {
  startPolling()
  const productId = route.query.product ? String(route.query.product) : ''
  if (!productId) return
  const record = await getRecord<SyncProduct>(SYNC_COLLECTIONS.products, productId)
  const first = record?.data && (record.data.coverFileId || record.data.images[0]?.fileId)
  if (record?.data && first) source.value = { fileId: first, product: { ...record.data, id: productId } }
})

async function start() {
  if (!source.value) {
    toast('请先选择一张商品图')
    return
  }
  submitting.value = true
  try {
    await generateVideo({ productId: source.value.product?.id, productName: source.value.product?.name, sourceFileId: source.value.fileId, motion: motion.value, durationSec: duration.value })
    toast('已提交，视频约 3–8 分钟生成好，可以先离开')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <PageHeader title="图生视频" back="/create" />
  <main class="m-page m-page--no-tabs">
    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">1. 选商品图</h2></div>
      <SourcePicker v-model="source" />
      <p class="m-muted small note">这张图会作为视频第一帧，最好是商品清晰、构图完整的图。</p>
    </section>

    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">2. 运动方式</h2></div>
      <div class="chips">
        <button v-for="item in VIDEO_MOTIONS" :key="item.key" type="button" class="m-chip" :class="{ 'is-active': motion === item.key }" @click="motion = item.key">{{ item.label }}</button>
      </div>
      <div class="duration">
        <span class="m-muted">时长</span>
        <button v-for="value in [5, 6, 8]" :key="value" type="button" class="m-chip" :class="{ 'is-active': duration === value }" @click="duration = value">{{ value }} 秒</button>
      </div>
    </section>

    <section class="m-section">
      <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="submitting || !source" @click="start">
        <LoaderCircle v-if="submitting" :size="18" class="m-spin" /><Clapperboard v-else :size="18" /> 生成竖屏视频
      </button>
      <p class="m-muted small note">生成在云端进行，关掉 App 也会继续；完成后在下方和「审核收件箱」里查看。</p>
    </section>

    <section v-if="results.length" class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">最近生成</h2><button type="button" class="m-section__link" @click="router.push('/review')">去审核</button></div>
      <div class="grid">
        <GenerationTile v-for="item in results.slice(0, 9)" :key="item.id" :item="item" tall @click="router.push(`/review?focus=${item.id}`)" />
      </div>
    </section>
  </main>
</template>

<style scoped>
.small { font-size: 12px; }
.note { margin: 10px 2px 0; line-height: 1.6; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.duration { display: flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 13px; }
.duration span { margin-right: 4px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
</style>
