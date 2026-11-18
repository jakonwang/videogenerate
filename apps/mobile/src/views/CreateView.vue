<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { MODULES, PHASE_LABEL, type MobileModule } from '@/lib/modules'
import { toast } from '@/lib/toast'

const router = useRouter()
const groups: { key: MobileModule['group']; title: string }[] = [
  { key: 'create', title: '内容生产' },
  { key: 'sell', title: '发布与经营' },
  { key: 'research', title: '选品' },
  { key: 'library', title: '素材管理' },
]

function open(module: MobileModule) {
  if (module.route) router.push(module.route)
  else toast(`「${module.name}」将在${PHASE_LABEL[module.phase]}上线`)
}
</script>

<template>
  <PageHeader title="创作" />
  <main class="m-page">
    <section v-for="group in groups" :key="group.key" class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">{{ group.title }}</h2></div>
      <div class="m-card m-list">
        <button v-for="module in MODULES.filter((m) => m.group === group.key)" :key="module.key" type="button" class="m-row" @click="open(module)">
          <span class="icon" :class="{ 'is-ready': module.route }"><component :is="module.icon" :size="20" /></span>
          <span class="m-row__main">
            <span class="m-row__title">{{ module.name }}</span>
            <span class="m-row__sub">{{ module.description }}</span>
          </span>
          <span v-if="module.route" class="m-badge m-badge--green">可用</span>
          <span v-else class="m-badge m-badge--muted">{{ PHASE_LABEL[module.phase] }}</span>
          <ChevronRight v-if="module.route" :size="18" class="m-muted" />
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.icon { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--theme-control); color: var(--theme-text-secondary); }
.icon.is-ready { background: var(--m-accent-soft); color: var(--m-accent-2); }
</style>
