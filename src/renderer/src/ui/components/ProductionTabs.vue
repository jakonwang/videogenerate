<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Boxes, LayoutTemplate, ListVideo } from 'lucide-vue-next'

const route = useRoute()

const items = [
  {
    to: '/products',
    label: '商品库',
    desc: '先选商品，再进入详情管理图片与产品标准源。',
    icon: Boxes,
  },
  {
    to: '/templates',
    label: '模板中心',
    desc: '只维护模板结构、字幕、音频和视觉输出规则。',
    icon: LayoutTemplate,
  },
  {
    to: '/production/tasks',
    label: '任务中心',
    desc: '查看生产进度、失败原因和导出结果。',
    icon: ListVideo,
  },
]

const isActive = (to: string) => {
  if (to === '/products') return route.path === '/products' || route.path.startsWith('/products/')
  if (to === '/production/tasks') return route.path === '/production/tasks' || route.path.startsWith('/production/tasks/')
  return route.path === to
}
</script>

<template>
  <nav class="production-tabs" aria-label="生产模块导航">
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="production-tab"
      :class="{ 'is-active': isActive(item.to) }"
    >
      <component :is="item.icon" class="h-4 w-4" />
      <span class="production-tab__text">
        <span class="production-tab__label">{{ item.label }}</span>
        <span class="production-tab__desc">{{ item.desc }}</span>
      </span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.production-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.production-tab {
  display: flex;
  min-width: 0;
  flex: 1 1 220px;
  align-items: flex-start;
  gap: 10px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: 12px 14px;
  color: #d6ddf3;
  text-decoration: none;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;
}

.production-tab:hover {
  border-color: rgba(139, 92, 246, 0.28);
  background: rgba(109, 93, 255, 0.08);
  transform: translateY(-1px);
}

.production-tab.is-active {
  border-color: rgba(139, 92, 246, 0.42);
  background: rgba(109, 93, 255, 0.14);
  color: #f6f8ff;
}

.production-tab__text {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.production-tab__label {
  color: inherit;
  font-size: 13px;
  font-weight: 800;
}

.production-tab__desc {
  color: rgba(214, 221, 243, 0.72);
  font-size: 11px;
  line-height: 1.45;
}
</style>
