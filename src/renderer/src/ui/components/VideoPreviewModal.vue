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
  background: color-mix(in srgb, var(--theme-root, #070910) 82%, transparent);
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
  border: 1px solid var(--theme-border, #1d2633);
  background: var(--theme-panel, #11131e);
  box-shadow: 0 24px 64px color-mix(in srgb, var(--theme-text, #000) 18%, transparent);
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
  border: 1px solid var(--theme-border-control, #344154);
  background: var(--theme-control, #171c2a);
  color: var(--theme-text-secondary, #c6cfdb);
  cursor: pointer;
  transition: 0.2s ease;
}

.preview-close:hover {
  background: var(--theme-control-hover, #20283a);
  color: var(--theme-text, #eef2f7);
}

.preview-titlebar {
  padding: 16px 56px 14px 18px;
  border-bottom: 1px solid var(--theme-divider, #202a38);
}

.preview-title {
  font-size: 14px;
  color: var(--theme-text, #eef2f7);
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
  background: var(--theme-panel-soft, #151827);
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
  background: var(--theme-root, #070910);
}

.preview-status {
  position: absolute;
  inset: 0;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--theme-text-secondary, #c6cfdb);
  text-align: center;
  pointer-events: none;
}

.preview-status--error {
  gap: 12px;
  padding: 0 28px;
  color: var(--theme-danger-text, #fecaca);
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
