# VideoGen Studio 组件规范 + Vue 代码版

> 适用范围：VideoGen Studio / 复刻工坊 / 素材库 / 模特库 / 任务中心  
> 技术栈：Vue 3 + Tailwind CSS  
> 目标：让 Codex / Cursor 不再随意设计 UI，统一组件、排版、按钮、卡片和工作流页面结构。

---

# 0. 全局设计 Token

```ts
export const designTokens = {
  colors: {
    bgMain: '#0F1115',
    bgCard: '#161920',
    bgCardHover: '#1B1F29',
    primary: '#7C3AED',
    primaryHover: '#6D28D9',
    border: 'rgba(255,255,255,0.06)',
    textHigh: '#F8FAFC',
    textLow: '#94A3B8',
    logBg: '#050505',
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
  },
  radius: {
    card: '16px',
    inner: '8px',
    pill: '999px',
  },
  layout: {
    sidebarWidth: '220px',
    topbarHeight: '64px',
    pagePadding: '24px',
    gap: '16px',
    statusPanelWidth: '360px',
  },
}
```

---

# 1. 全局样式约束

所有页面必须遵守：

- 背景色：`#0F1115`
- 卡片背景：`#161920`
- 边框：`1px solid rgba(255,255,255,0.06)`
- 主容器圆角：`16px`
- 内部元素圆角：`8px`
- 间距必须是 `8px` 的倍数
- 禁止厚重阴影
- 禁止全局页面滚动，核心内容使用局部滚动

---

# 2. Button 组件规范

## 2.1 使用规则

### Primary Button
用于页面唯一主操作：

- 生成视频
- 下一步
- 上传视频
- 使用模特
- 添加素材

每个页面 / 每个区域只能出现一个 Primary Button。

### Secondary Button
用于辅助操作：

- 重新选择
- 查看详情
- 导入素材
- 保存草稿

### Ghost Button
用于弱操作：

- 取消
- 展开
- 查看日志
- 更多

---

## 2.2 BaseButton.vue

```vue
<template>
  <button
    :class="buttonClass"
    :disabled="disabled || loading"
    @click="$emit('click')"
  >
    <span v-if="loading" class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"></span>
    <span>{{ loading ? loadingText : label }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  label: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
  loadingText?: string
  disabled?: boolean
}>(), {
  variant: 'primary',
  size: 'md',
  loading: false,
  loadingText: '处理中',
  disabled: false,
})

defineEmits<{
  click: []
}>()

const baseClass =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50'

const sizeClass = computed(() => {
  return props.size === 'sm'
    ? 'h-8 px-3 text-xs'
    : 'h-10 px-4 text-sm'
})

const variantClass = computed(() => {
  if (props.variant === 'primary') {
    return 'bg-gradient-to-r from-violet-600 to-violet-500 text-white hover:from-violet-500 hover:to-violet-400'
  }

  if (props.variant === 'secondary') {
    return 'border border-white/[0.06] bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]'
  }

  if (props.variant === 'danger') {
    return 'bg-red-500/15 text-red-300 hover:bg-red-500/25'
  }

  return 'bg-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
})

const buttonClass = computed(() => [
  baseClass,
  sizeClass.value,
  variantClass.value,
])
</script>
```

---

# 3. Card 组件规范

## 3.1 使用规则

卡片只用于承载独立信息块，不允许一个页面里出现大量不同样式卡片。

统一结构：

```txt
Card
 ├── Header
 ├── Content
 └── Footer / Action
```

---

## 3.2 BaseCard.vue

```vue
<template>
  <section class="rounded-2xl border border-white/[0.06] bg-[#161920]">
    <header v-if="$slots.header || title" class="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
      <div>
        <h3 v-if="title" class="text-sm font-semibold text-slate-50">{{ title }}</h3>
        <p v-if="desc" class="mt-1 text-xs text-slate-400">{{ desc }}</p>
      </div>
      <slot name="action" />
    </header>

    <div class="p-4">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="border-t border-white/[0.06] px-4 py-3">
      <slot name="footer" />
    </footer>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  desc?: string
}>()
</script>
```

---

# 4. Panel 组件规范

Panel 用于页面主区域，通常比 Card 更大。

## BasePanel.vue

```vue
<template>
  <section class="flex min-h-0 flex-col rounded-2xl border border-white/[0.06] bg-[#161920]">
    <header v-if="title || $slots.header" class="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-5">
      <div>
        <h2 v-if="title" class="text-sm font-semibold text-slate-50">{{ title }}</h2>
        <p v-if="desc" class="text-xs text-slate-400">{{ desc }}</p>
      </div>
      <slot name="action" />
    </header>

    <div class="min-h-0 flex-1 p-5">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="shrink-0 border-t border-white/[0.06] px-5 py-4">
      <slot name="footer" />
    </footer>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  desc?: string
}>()
</script>
```

---

# 5. StepBar 组件规范

用于 `/clone` 工作流。

## 5.1 状态

```ts
type StepState = 'done' | 'active' | 'locked'
```

## 5.2 CloneStepBar.vue

```vue
<template>
  <div class="rounded-2xl border border-white/[0.06] bg-[#161920] px-4 py-3">
    <div class="flex items-center gap-2">
      <button
        v-for="(step, index) in steps"
        :key="step.key"
        :disabled="step.state === 'locked'"
        class="group flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left transition"
        :class="stepClass(step.state)"
        @click="$emit('select', step.key)"
      >
        <span
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          :class="badgeClass(step.state)"
        >
          <template v-if="step.state === 'done'">✓</template>
          <template v-else>{{ index + 1 }}</template>
        </span>

        <div class="min-w-0">
          <p class="truncate text-xs font-semibold">{{ step.title }}</p>
          <p class="hidden truncate text-[11px] text-slate-500 xl:block">{{ step.desc }}</p>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
type StepState = 'done' | 'active' | 'locked'

defineProps<{
  steps: Array<{
    key: string
    title: string
    desc: string
    state: StepState
  }>
}>()

defineEmits<{
  select: [key: string]
}>()

function stepClass(state: StepState) {
  if (state === 'active') return 'bg-violet-500/12 text-slate-50'
  if (state === 'done') return 'text-slate-200 hover:bg-white/[0.04]'
  return 'cursor-not-allowed text-slate-600'
}

function badgeClass(state: StepState) {
  if (state === 'active') return 'bg-violet-500 text-white'
  if (state === 'done') return 'bg-emerald-500/15 text-emerald-300'
  return 'bg-white/[0.04] text-slate-600'
}
</script>
```

---

# 6. StatusPanel 组件规范

右侧运行反馈区是 `/clone` 高级感的核心。

必须展示：

- 当前步骤
- 当前状态
- 百分比进度
- 日志流
- 报错信息
- 重新生成入口

## CloneStatusPanel.vue

```vue
<template>
  <aside class="flex min-h-0 w-[360px] shrink-0 flex-col rounded-2xl border border-white/[0.06] bg-[#161920]">
    <header class="shrink-0 border-b border-white/[0.06] px-5 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-slate-50">运行反馈</h3>
          <p class="mt-1 text-xs text-slate-400">{{ currentStep }}</p>
        </div>

        <span
          class="rounded-full px-2.5 py-1 text-xs"
          :class="statusClass"
        >
          {{ statusLabel }}
        </span>
      </div>

      <div class="mt-4">
        <div class="mb-2 flex items-center justify-between text-xs">
          <span class="text-slate-400">进度</span>
          <span class="font-medium text-slate-200">{{ progress }}%</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-white/[0.05]">
          <div
            class="h-full rounded-full bg-violet-500 transition-all duration-500"
            :style="{ width: `${progress}%` }"
          />
        </div>
      </div>
    </header>

    <section class="min-h-0 flex-1 p-4">
      <div class="h-full overflow-y-auto rounded-xl bg-[#050505] p-3 font-mono text-xs leading-5 text-slate-400">
        <p v-for="(log, index) in logs" :key="index">
          <span class="text-slate-600">{{ log.time }}</span>
          <span class="ml-2">{{ log.message }}</span>
        </p>
      </div>
    </section>

    <footer v-if="error" class="shrink-0 border-t border-white/[0.06] p-4">
      <div class="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
        <p class="text-xs font-semibold text-red-300">任务失败</p>
        <p class="mt-1 break-words text-xs leading-5 text-red-200/80">
          {{ error }}
        </p>
        <button
          class="mt-3 h-8 rounded-lg bg-red-500/15 px-3 text-xs font-medium text-red-200 hover:bg-red-500/25"
          @click="$emit('retry')"
        >
          重新生成
        </button>
      </div>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  currentStep: string
  status: 'idle' | 'running' | 'success' | 'error'
  progress: number
  logs: Array<{ time: string; message: string }>
  error?: string
}>()

defineEmits<{
  retry: []
}>()

const statusLabel = computed(() => {
  const map = {
    idle: '空闲',
    running: '运行中',
    success: '完成',
    error: '失败',
  }

  return map[props.status]
})

const statusClass = computed(() => {
  if (props.status === 'running') return 'bg-violet-500/15 text-violet-200'
  if (props.status === 'success') return 'bg-emerald-500/15 text-emerald-300'
  if (props.status === 'error') return 'bg-red-500/15 text-red-300'
  return 'bg-white/[0.05] text-slate-400'
})
</script>
```

---

# 7. Clone 页面布局代码

这是 `/clone` 页面推荐结构，Codex 必须按这个结构开发。

## CloneView.vue

```vue
<template>
  <main class="flex h-full min-h-0 flex-col gap-4 bg-[#0F1115] p-6 text-slate-100">
    <CloneStepBar
      :steps="steps"
      @select="handleSelectStep"
    />

    <section class="flex min-h-0 flex-1 gap-4">
      <BasePanel
        class="min-w-0 flex-1"
        :title="activeStepTitle"
        :desc="activeStepDesc"
      >
        <template #action>
          <BaseButton
            v-if="activeStepKey !== 'compose'"
            label="下一步"
            variant="secondary"
            size="sm"
            :disabled="!canGoNext"
            @click="goNext"
          />
        </template>

        <div class="flex h-full min-h-0 flex-col">
          <div class="min-h-0 flex-1 overflow-y-auto pr-1">
            <component
              :is="activeStepComponent"
              :status="runtimeStatus"
              @run="runCurrentStep"
            />
          </div>

          <div class="mt-4 flex shrink-0 justify-end border-t border-white/[0.06] pt-4">
            <BaseButton
              :label="primaryActionLabel"
              :loading="runtimeStatus === 'running'"
              :disabled="runtimeStatus === 'running'"
              @click="runCurrentStep"
            />
          </div>
        </div>
      </BasePanel>

      <CloneStatusPanel
        :current-step="activeStepTitle"
        :status="runtimeStatus"
        :progress="progress"
        :logs="logs"
        :error="errorMessage"
        @retry="runCurrentStep"
      />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BasePanel from '@/components/ui/BasePanel.vue'
import CloneStepBar from '@/components/clone/CloneStepBar.vue'
import CloneStatusPanel from '@/components/clone/CloneStatusPanel.vue'

import StepAnalyzeVideo from '@/components/clone/steps/StepAnalyzeVideo.vue'
import StepScriptScore from '@/components/clone/steps/StepScriptScore.vue'
import StepStoryboardImage from '@/components/clone/steps/StepStoryboardImage.vue'
import StepStoryboardVideo from '@/components/clone/steps/StepStoryboardVideo.vue'
import StepComposePreview from '@/components/clone/steps/StepComposePreview.vue'

type RuntimeStatus = 'idle' | 'running' | 'success' | 'error'

const activeStepKey = ref('analyze')
const completedSteps = ref<string[]>([])
const runtimeStatus = ref<RuntimeStatus>('idle')
const progress = ref(0)
const errorMessage = ref('')
const logs = ref<Array<{ time: string; message: string }>>([
  { time: '00:00', message: '等待开始任务' },
])

const stepConfigs = [
  {
    key: 'analyze',
    title: '参考视频分析',
    desc: '上传爆款视频并分析脚本结构',
    component: StepAnalyzeVideo,
    action: '分析视频',
  },
  {
    key: 'script',
    title: '脚本评分',
    desc: '生成脚本变体并选择最优方案',
    component: StepScriptScore,
    action: '生成脚本',
  },
  {
    key: 'storyboardImage',
    title: '分镜拼图',
    desc: '生成 6/9 宫格分镜图片',
    component: StepStoryboardImage,
    action: '生成分镜',
  },
  {
    key: 'storyboardVideo',
    title: '分镜视频生成',
    desc: '逐镜生成可合成的视频片段',
    component: StepStoryboardVideo,
    action: '生成视频',
  },
  {
    key: 'compose',
    title: '合成预览',
    desc: '检查片段并导出完整成片',
    component: StepComposePreview,
    action: '合成视频',
  },
]

const activeIndex = computed(() => stepConfigs.findIndex(step => step.key === activeStepKey.value))
const activeStep = computed(() => stepConfigs[activeIndex.value])
const activeStepTitle = computed(() => activeStep.value.title)
const activeStepDesc = computed(() => activeStep.value.desc)
const activeStepComponent = computed(() => activeStep.value.component)
const primaryActionLabel = computed(() => activeStep.value.action)
const canGoNext = computed(() => completedSteps.value.includes(activeStepKey.value))

const steps = computed(() => {
  return stepConfigs.map((step, index) => {
    if (completedSteps.value.includes(step.key)) {
      return { ...step, state: 'done' as const }
    }

    if (step.key === activeStepKey.value) {
      return { ...step, state: 'active' as const }
    }

    if (index < activeIndex.value) {
      return { ...step, state: 'done' as const }
    }

    return { ...step, state: 'locked' as const }
  })
})

function handleSelectStep(key: string) {
  if (completedSteps.value.includes(key) || key === activeStepKey.value) {
    activeStepKey.value = key
  }
}

function goNext() {
  const next = stepConfigs[activeIndex.value + 1]
  if (next) {
    runtimeStatus.value = 'idle'
    progress.value = 0
    errorMessage.value = ''
    activeStepKey.value = next.key
  }
}

async function runCurrentStep() {
  runtimeStatus.value = 'running'
  progress.value = 5
  errorMessage.value = ''
  logs.value.push({ time: getTime(), message: `开始：${activeStepTitle.value}` })

  try {
    for (const value of [20, 45, 70, 90, 100]) {
      await wait(350)
      progress.value = value
      logs.value.push({ time: getTime(), message: `${activeStepTitle.value} 进度 ${value}%` })
    }

    runtimeStatus.value = 'success'
    if (!completedSteps.value.includes(activeStepKey.value)) {
      completedSteps.value.push(activeStepKey.value)
    }

    logs.value.push({ time: getTime(), message: `${activeStepTitle.value} 完成` })
  } catch (error: any) {
    runtimeStatus.value = 'error'
    errorMessage.value = error?.message || '未知错误'
    logs.value.push({ time: getTime(), message: `失败：${errorMessage.value}` })
  }
}

function getTime() {
  const now = new Date()
  return `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
</script>
```

---

# 8. Step 内容组件模板

每个步骤都必须使用统一结构：左侧操作，右侧结果，底部交给 CloneView 统一主按钮。

## StepAnalyzeVideo.vue

```vue
<template>
  <div class="grid h-full min-h-0 grid-cols-[360px_1fr] gap-4">
    <section class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <h3 class="text-sm font-semibold text-slate-50">上传参考视频</h3>
      <p class="mt-1 text-xs text-slate-400">上传 TikTok 爆款视频，系统将自动提取脚本、镜头与卖点。</p>

      <div class="mt-4 flex h-56 items-center justify-center rounded-xl border border-dashed border-white/[0.12] bg-black/20">
        <div class="text-center">
          <p class="text-sm font-medium text-slate-200">拖拽视频到这里</p>
          <p class="mt-1 text-xs text-slate-500">支持 mp4 / mov</p>
        </div>
      </div>
    </section>

    <section class="min-h-0 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <h3 class="text-sm font-semibold text-slate-50">分析结果</h3>

      <div class="mt-4 grid grid-cols-3 gap-3">
        <div class="rounded-xl bg-white/[0.03] p-3">
          <p class="text-xs text-slate-500">视频时长</p>
          <p class="mt-1 text-sm font-semibold text-slate-100">00:32</p>
        </div>
        <div class="rounded-xl bg-white/[0.03] p-3">
          <p class="text-xs text-slate-500">分镜数量</p>
          <p class="mt-1 text-sm font-semibold text-slate-100">9</p>
        </div>
        <div class="rounded-xl bg-white/[0.03] p-3">
          <p class="text-xs text-slate-500">爆点类型</p>
          <p class="mt-1 text-sm font-semibold text-slate-100">展示成交</p>
        </div>
      </div>

      <div class="mt-4 h-[260px] overflow-y-auto rounded-xl bg-black/20 p-4 text-sm leading-6 text-slate-300">
        等待分析结果...
      </div>
    </section>
  </div>
</template>
```

---

# 9. 资源页三栏模板

用于 `/models`、`/products`、`/templates`。

## ResourceLayout.vue

```vue
<template>
  <main class="grid h-full min-h-0 grid-cols-[220px_1fr_320px] gap-4 bg-[#0F1115] p-6 text-slate-100">
    <aside class="min-h-0 rounded-2xl border border-white/[0.06] bg-[#161920] p-4">
      <slot name="left" />
    </aside>

    <section class="min-h-0 rounded-2xl border border-white/[0.06] bg-[#161920] p-4">
      <slot name="center" />
    </section>

    <aside class="min-h-0 rounded-2xl border border-white/[0.06] bg-[#161920] p-4">
      <slot name="right" />
    </aside>
  </main>
</template>
```

---

# 10. 模特卡片组件

## ModelCard.vue

```vue
<template>
  <button
    class="group overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] text-left transition hover:bg-white/[0.05]"
    :class="{ 'border-violet-500/60 bg-violet-500/10': selected }"
    @click="$emit('select')"
  >
    <div class="aspect-[3/4] overflow-hidden bg-black/30">
      <img :src="cover" class="h-full w-full object-cover transition group-hover:scale-105" />
    </div>

    <div class="p-3">
      <div class="flex items-center justify-between gap-2">
        <p class="truncate text-sm font-medium text-slate-100">{{ name }}</p>
        <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
          可用
        </span>
      </div>

      <p class="mt-1 truncate text-xs text-slate-500">{{ modelId }}</p>
    </div>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  cover: string
  name: string
  modelId: string
  selected?: boolean
}>()

defineEmits<{
  select: []
}>()
</script>
```

---

# 11. Codex / Cursor 强制提示词

复制下面这段，每次让 Codex 改 UI 前先贴进去。

```md
你现在是 VideoGen Studio 的首席前端 UI 工程师。

你必须严格遵守 DESIGN.md 和本组件规范，不允许自由发挥。

全局规则：
1. 背景必须使用 #0F1115。
2. 卡片必须使用 #161920。
3. 边框必须使用 1px solid rgba(255,255,255,0.06)。
4. 主容器圆角必须是 16px。
5. 所有间距必须是 8px 的倍数。
6. 禁止全局页面滚动，使用局部滚动。
7. 每个页面只能有一个主按钮。
8. 所有 AI 任务必须显示 idle / running / success / error。
9. 失败时必须展示 provider / model / responseSnippet，不允许静默 fallback。
10. 不允许新增未定义样式、未定义布局、未定义组件。

/clone 页面必须使用：
- CloneStepBar
- BasePanel
- CloneStatusPanel
- BaseButton

资源页必须使用：
- ResourceLayout
- ModelCard / ProductCard
- BaseButton
- BaseCard

输出代码时：
- 优先修改现有组件
- 不要新建重复组件
- 不要把样式写散
- 不要改变页面主结构
```

---

# 12. 落地顺序

建议按这个顺序让 Codex 执行：

1. 新增 `BaseButton.vue`
2. 新增 `BaseCard.vue`
3. 新增 `BasePanel.vue`
4. 新增 `CloneStepBar.vue`
5. 新增 `CloneStatusPanel.vue`
6. 重构 `/clone` 使用 `CloneLayout`
7. 重构 `/models` 和 `/products` 使用 `ResourceLayout`
8. 删除旧页面里重复的按钮、卡片和自定义样式

---

# 13. 最终验收标准

界面必须满足：

- 不出现页面级长滚动
- 不出现多个 Primary Button
- 不出现 3 种以上卡片风格
- 不出现随机渐变和随机发光
- 所有 AI 操作都能看到当前状态
- 所有错误都能看到供应商、模型和报错片段
- `/clone` 的 5 步流程清晰可见
- `/models`、`/products` 使用稳定三栏结构

