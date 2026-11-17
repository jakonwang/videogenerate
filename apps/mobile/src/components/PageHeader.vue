<script setup lang="ts">
import { ChevronLeft } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

const props = defineProps<{ title: string; back?: boolean | string }>()
const router = useRouter()

function goBack() {
  if (typeof props.back === 'string') router.replace(props.back)
  else if (window.history.length > 1) router.back()
  else router.replace('/')
}
</script>

<template>
  <header class="m-header" :class="{ 'm-header--back': back }">
    <button v-if="back" class="m-icon-btn" type="button" aria-label="返回" @click="goBack"><ChevronLeft :size="24" /></button>
    <h1 class="m-header__title">{{ title }}</h1>
    <div class="m-header__actions"><slot name="actions" /></div>
  </header>
</template>
