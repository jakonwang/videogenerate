<script setup lang="ts">
/** 工具箱 — same layout as the desktop PluginsView: grouped tool cards with search. */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, BarChart3, Boxes, Captions, Download, Droplets, Film, ImagePlus, PackageSearch, Replace, Rocket, Scissors, Search, Stamp, Store, Warehouse, Wrench } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'

const router = useRouter()
const query = ref('')

const GROUPS = [
  {
    title: '素材获取',
    tools: [
      { name: '视频解析下载', desc: '粘贴 TikTok / 抖音分享链接，解析并下载无水印视频', icon: Download, tone: 'blue', to: '/tools/download' },
      { name: '直播切片', desc: '把直播录像或长视频切成可复用的短片段', icon: Scissors, tone: 'amber', to: '/tools/slice' },
    ],
  },
  {
    title: '图片加工',
    tools: [
      { name: '商品图素材', desc: 'AI 生成商品主图、上身图和细节特写', icon: ImagePlus, tone: 'blue', to: '/product-images' },
      { name: '商品替换', desc: '把场景图里的商品批量换成你的商品', icon: Replace, tone: 'green', to: '/product-replace' },
      { name: '商品品牌水印', desc: '商品图裁成正方形并加上品牌水印', icon: Stamp, tone: 'violet', to: '/product-watermark' },
    ],
  },
  {
    title: '视频后期',
    tools: [
      { name: '视频批量字幕', desc: '自动识别语音，批量生成并烧录字幕', icon: Captions, tone: 'green', to: '/tools/subtitle' },
      { name: '视频批量水印', desc: '给多条视频统一加文字或图片水印', icon: Droplets, tone: 'violet', to: '/tools/watermark' },
      { name: '模板随机混剪', desc: '素材池随机组合成片，自动去重（云端）', icon: Film, tone: 'blue', to: '/tools/mix' },
    ],
  },
  {
    title: '店铺运营',
    tools: [
      { name: 'TikTok 上架助手', desc: '生成商品标题、卖点和图片，导出上架表格', icon: Store, tone: 'amber', to: '/listings' },
      { name: '达人管理', desc: '多店铺寄样管理与达人履约跟进', icon: PackageSearch, tone: 'violet', to: '/creators' },
      { name: 'GMV MAX 优化器', desc: '分析投放数据，给出预算与 ROI 调整建议', icon: Rocket, tone: 'green', to: '/gmv' },
      { name: '销售与库存', desc: '多店铺按统一 SKU 看每日销量、库存预警和爆款', icon: Boxes, tone: 'green', to: '/sales' },
      { name: '店小秘库存分析', desc: '同步发货量，预测断货并提示补货', icon: Warehouse, tone: 'amber', to: '/inventory' },
      { name: '数据复盘', desc: '生产线产出、通过率和发布复盘', icon: BarChart3, tone: 'blue', to: '/business?tab=insights' },
    ],
  },
]

const groups = computed(() => {
  const word = query.value.trim().toLowerCase()
  if (!word) return GROUPS
  return GROUPS.map((group) => ({ ...group, tools: group.tools.filter((tool) => `${tool.name}${tool.desc}`.toLowerCase().includes(word)) })).filter((group) => group.tools.length)
})
</script>

<template>
  <PageHeader title="工具箱" description="素材获取、图片加工、视频后期和店铺运营工具，点开即用。" :icon="Wrench">
    <template #actions>
      <label class="vg-search tb-search">
        <Search :size="14" />
        <input v-model="query" class="vg-input" placeholder="搜索工具" />
      </label>
    </template>
  </PageHeader>
  <main class="m-page tb" data-testid="web-toolbox">
    <section v-for="group in groups" :key="group.title" class="tb-group">
      <h2 class="tb-group__title">{{ group.title }}</h2>
      <div class="tb-grid">
        <button v-for="tool in group.tools" :key="tool.to" type="button" class="tb-card" :class="`tb-card--${tool.tone}`" @click="router.push(tool.to)">
          <span class="tb-card__icon"><component :is="tool.icon" :size="18" /></span>
          <span class="tb-card__copy"><strong>{{ tool.name }}</strong><small>{{ tool.desc }}</small></span>
          <ArrowRight :size="16" class="tb-card__arrow" />
        </button>
      </div>
    </section>
    <div v-if="!groups.length" class="vg-empty">
      <span class="vg-empty__icon"><Wrench :size="22" /></span>
      <h3>没有找到「{{ query }}」</h3>
      <p>换个关键词试试</p>
    </div>
  </main>
</template>

<style scoped>
.tb { display: flex; flex-direction: column; gap: 22px; }
.tb-search { width: 280px; }
.tb-group__title { margin: 0 0 12px; font-size: 14px; font-weight: 700; }
.tb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 12px; }
.tb-card { --tone: var(--vg-accent); display: flex; align-items: flex-start; gap: 14px; min-width: 0; min-height: 90px; padding: 16px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); color: var(--theme-text); text-align: left; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.tb-card:hover { border-color: color-mix(in srgb, var(--tone) 45%, transparent); box-shadow: var(--theme-shadow-float); }
.tb-card--blue { --tone: var(--vg-blue); }
.tb-card--amber { --tone: var(--vg-amber); }
.tb-card--violet { --tone: var(--vg-violet); }
.tb-card--green { --tone: var(--vg-green); }
.tb-card__icon { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; flex-shrink: 0; border-radius: 10px; background: color-mix(in srgb, var(--tone) 14%, transparent); border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent); color: var(--tone); }
.tb-card__copy { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; }
.tb-card__copy strong { font-size: 14px; font-weight: 700; }
.tb-card__copy small { font-size: 12.5px; line-height: 1.55; color: var(--theme-text-secondary); }
.tb-card__arrow { margin-top: 4px; color: var(--theme-text-muted); flex-shrink: 0; transition: transform .15s, color .15s; }
.tb-card:hover .tb-card__arrow { color: var(--tone); transform: translateX(2px); }
</style>
