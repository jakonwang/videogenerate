<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { AlertTriangle, LoaderCircle, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  open: boolean
  src: string | null
  fallbackSrc?: string | null
  poster?: string | null
  title?: string
  mediaType?: 'video' | 'image'
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const videoEl = ref<HTMLVideoElement | null>(null)
const currentVideoSrc = ref<string | null>(null)
const hasRetriedFallback = ref(false)
const mediaError = ref('')
const isLoading = ref(false)

const effectiveSrc = computed(() => (props.open ? props.src : null))
const effectiveMediaType = computed(() => props.mediaType ?? 'video')
const isVideo = computed(() => effectiveMediaType.value === 'video')
const panelClass = computed(() => (isVideo.value ? 'preview-panel preview-panel--video' : 'preview-panel preview-panel--image'))

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

function resetVideoState() {
  mediaError.value = ''
  hasRetriedFallback.value = false
  isLoading.value = isVideo.value && Boolean(effectiveSrc.value)
  currentVideoSrc.value = effectiveSrc.value
}

function onVideoLoaded() {
  isLoading.value = false
  mediaError.value = ''
}

function onVideoError() {
  if (!hasRetriedFallback.value && props.fallbackSrc && props.fallbackSrc !== currentVideoSrc.value) {
    hasRetriedFallback.value = true
    currentVideoSrc.value = props.fallbackSrc
    isLoading.value = true
    return
  }
  isLoading.value = false
  mediaError.value = t('mediaPreview.errors.unavailable')
}

watch(
  () => props.open,
  (value) => {
    if (value) resetVideoState()
    else stopPlayback()
  },
  { immediate: true },
)

watch(
  () => props.src,
  () => {
    if (props.open) resetVideoState()
  },
)

onBeforeUnmount(() => stopPlayback())
</script>

<template>
  <div v-if="open" class="preview-shell">
    <div class="preview-backdrop" @click="close"></div>

    <div class="preview-layout">
      <div :class="panelClass">
        <button
          class="preview-close"
          :title="t('mediaPreview.close')"
          type="button"
          @click="close"
        >
          <X class="h-4 w-4" />
        </button>

        <div v-if="title" class="preview-titlebar">
          <div class="preview-title">{{ title }}</div>
        </div>

        <div class="preview-stage">
          <img
            v-if="effectiveMediaType === 'image'"
            class="preview-image"
            :src="effectiveSrc ?? undefined"
            :alt="title || 'preview'"
            @click.stop
          />

          <div v-else class="preview-video-wrap" @click.stop>
            <video
              v-if="currentVideoSrc"
              ref="videoEl"
              class="preview-video"
              :src="currentVideoSrc ?? undefined"
              :poster="poster ?? undefined"
              controls
              autoplay
              playsinline
              preload="metadata"
              @loadeddata="onVideoLoaded"
              @canplay="onVideoLoaded"
              @error="onVideoError"
            />

            <div v-if="isLoading" class="preview-status">
              <LoaderCircle class="preview-status__icon spin" />
              <span>{{ t('mediaPreview.loading') }}</span>
            </div>

            <div v-else-if="mediaError" class="preview-status preview-status--error">
              <AlertTriangle class="preview-status__icon" />
              <span>{{ mediaError }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.preview-shell {
  position: fixed;
  inset: 0;
  z-index: 50;
}

.preview-backdrop {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(3, 6, 14, 0.86), rgba(2, 5, 12, 0.94)),
    rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(6px);
}

.preview-layout {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
}

.preview-panel {
  position: relative;
  width: min(96vw, 760px);
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(180deg, rgba(9, 13, 24, 0.96), rgba(5, 9, 18, 0.96)),
    rgba(3, 6, 12, 0.94);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 34px 90px rgba(0, 0, 0, 0.5);
}

.preview-panel--video {
  width: min(96vw, 1120px);
}

.preview-panel--image {
  width: min(96vw, 760px);
}

.preview-close {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 2;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(8, 11, 20, 0.74);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: 0.2s ease;
}

.preview-close:hover {
  background: rgba(13, 17, 28, 0.92);
  color: #ffffff;
}

.preview-titlebar {
  padding: 16px 56px 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.preview-title {
  font-size: 14px;
  color: rgba(240, 244, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  padding: 18px;
}

.preview-image {
  max-height: 82vh;
  width: auto;
  max-width: 100%;
  border-radius: 18px;
  background: #050913;
  object-fit: contain;
}

.preview-video-wrap {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-video {
  width: min(100%, 980px);
  max-height: 78vh;
  border-radius: 18px;
  background: #03060c;
}

.preview-status {
  position: absolute;
  inset: 0;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: rgba(232, 238, 255, 0.82);
  text-align: center;
  pointer-events: none;
}

.preview-status--error {
  gap: 12px;
  padding: 0 28px;
  color: #fecaca;
}

.preview-status__icon {
  width: 22px;
  height: 22px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
