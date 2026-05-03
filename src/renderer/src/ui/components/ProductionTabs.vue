<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Boxes, LayoutTemplate, ListVideo } from 'lucide-vue-next'

const route = useRoute()

const items = [
  { to: '/products', label: '产品素材', desc: '管理商品与分镜素材', icon: Boxes },
  { to: '/templates', label: '模板结构', desc: '配置分镜、字幕、音频', icon: LayoutTemplate },
  { to: '/tasks', label: '批量任务', desc: '生成、进度与导出', icon: ListVideo },
]

const currentPath = computed(() => route.path)
</script>

<template>
  <nav class="production-tabs" aria-label="生产模块导航">
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="production-tab"
      :class="{ 'is-active': currentPath === item.to }"
    >
      <component :is="item.icon" class="h-4 w-4" />
      <span class="production-tab__text">
        <span class="production-tab__label">{{ item.label }}</span>
        <span class="production-tab__desc">{{ item.desc }}</span>
      </span>
    </RouterLink>
  </nav>
</template>
