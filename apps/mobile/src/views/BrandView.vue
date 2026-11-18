<script setup lang="ts">
/** 手机上的品牌记忆页；网页版在「设置 → 品牌记忆」，这里在宽屏下也直接可用。 */
import { Brain } from 'lucide-vue-next'
import BrandMemoryForm from '@/components/BrandMemoryForm.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useInWebShell } from '@/lib/layout'

const inWebShell = useInWebShell()
</script>

<template>
  <PageHeader title="品牌记忆" back="/me" :icon="Brain" description="让 AI 规划和文案遵守这些要求，和电脑端同步。" />
  <main v-if="inWebShell" class="vg-page"><section class="st-panel"><BrandMemoryForm variant="web" /></section></main>
  <main v-else class="m-page m-page--no-tabs"><BrandMemoryForm variant="phone" /></main>
</template>
