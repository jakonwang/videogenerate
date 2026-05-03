<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'

const { t } = useI18n()

const props = defineProps<{
  open: boolean
  src: string | null
  title?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const videoEl = ref<HTMLVideoElement | null>(null)
const effectiveSrc = computed(() => (props.open ? props.src : null))

function close() {
  emit('close')
}

function stopPlayback() {
  try {
    videoEl.value?.pause()
    if (videoEl.value) videoEl.value.currentTime = 0
    if (videoEl.value) videoEl.value.removeAttribute('src')
    videoEl.value?.load()
  } catch {
    // ignore
  }
}

watch(
  () => props.open,
  (v) => {
    if (!v) stopPlayback()
  },
)

onBeforeUnmount(() => stopPlayback())
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50">
    <!-- 遮罩：点击空白关闭 -->
    <div class="absolute inset-0 bg-black/80" @click="close"></div>

    <!-- 内容 -->
    <div class="absolute inset-0 flex items-center justify-center p-6">
      <div class="relative w-full max-w-[520px]">
        <button
          class="absolute -top-10 right-0 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-white/80 transition hover:bg-black/60 hover:text-white"
          :title="t('preview.close')"
          @click="close"
        >
          <X class="h-4 w-4" />
        </button>

        <div class="overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-lg shadow-black/40">
          <div v-if="title" class="border-b border-white/10 px-4 py-2 text-[12px] text-white/80">
            <div class="truncate">{{ title }}</div>
          </div>

          <div class="flex items-center justify-center p-3">
            <video
              ref="videoEl"
              class="max-h-[85vh] w-auto max-w-full rounded-xl bg-black"
              :src="effectiveSrc ?? undefined"
              controls
              autoplay
              playsinline
              @click.stop
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

