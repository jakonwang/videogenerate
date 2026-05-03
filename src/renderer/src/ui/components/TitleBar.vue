<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Minus, Square, X } from 'lucide-vue-next'

const { t } = useI18n()

const maximized = ref(false)

async function sync() {
  const res = await window.api.window.isMaximized()
  maximized.value = Boolean(res?.maximized)
}

onMounted(sync)

async function minimize() {
  await window.api.window.minimize()
}

async function toggleMax() {
  const res = await window.api.window.maximizeToggle()
  if (typeof res?.maximized === 'boolean') maximized.value = res.maximized
  else await sync()
}

async function close() {
  await window.api.window.close()
}
</script>

<template>
  <div class="ui-topbar flex h-10 items-center border-b">
    <!-- 可拖拽区 -->
    <div class="flex min-w-0 flex-1 items-center gap-2 px-3" style="-webkit-app-region: drag">
      <div class="h-2 w-2 rounded-full bg-teal-500"></div>
      <!-- 左侧导航已展示品牌文案；此处仅保留小状态点，避免重复 -->
      <div class="truncate text-[11px] text-white/60">{{ t('titleBar.ready') }}</div>
    </div>

    <!-- 窗口按钮（不可拖拽） -->
    <div class="flex items-stretch" style="-webkit-app-region: no-drag">
      <button class="grid w-12 place-items-center transition hover:bg-white/5" @click="minimize" :title="t('titleBar.minimize')">
        <Minus class="h-4 w-4 text-white/60" />
      </button>
      <button class="grid w-12 place-items-center transition hover:bg-white/5" @click="toggleMax" :title="t('titleBar.maximize')">
        <Square class="h-4 w-4 text-white/60" />
      </button>
      <button class="grid w-12 place-items-center transition hover:bg-red-500/20" @click="close" :title="t('titleBar.close')">
        <X class="h-4 w-4" style="color: #fecaca" />
      </button>
    </div>
  </div>
</template>

