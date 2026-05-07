# VideoGen UI Design System

VideoGen 是 AI 视频生产工作台，不是普通后台系统。  
设计目标是：高级、智能、自动化、商业化、适合短视频批量生产。

产品覆盖爆款复刻、脚本生成、分镜设计、分镜视频、成片合成、发布导出、任务中心、素材库等完整闭环。

---

## 1. 产品视觉定位

### 核心关键词

- AI Production Console
- 自动化剪辑系统
- 视频生产流水线
- 商业级内容工厂
- 深色科技感
- 高级但不复杂
- 一屏完成核心操作

### 禁止风格

- 禁止普通后台管理系统风格
- 禁止大面积纯黑
- 禁止廉价渐变
- 禁止杂乱信息堆叠
- 禁止所有功能同时暴露
- 禁止页面长滚动承载核心流程

### 用户感知目标

用户看到 VideoGen 的第一感觉必须是：

- 这是一个可以自动赚钱的视频生产系统
- 这是一个我下达任务、AI 自动生产视频的工作台

而不是：

- 我来手动编辑视频
- 这是一个普通后台管理页面

---

## 2. 全局色彩系统

### 背景色

```css
--bg-root: #060B16;
--bg-shell: #08111F;
--bg-panel: #0D1729;
--bg-panel-soft: #111C31;
--bg-card: #121F35;
--bg-card-hover: #172642;
--bg-input: #0A1324;
```

### 主色

```css
--primary: #6D5DFF;
--primary-hover: #7C6BFF;
--primary-active: #5948E8;
--primary-soft: rgba(109, 93, 255, 0.14);
--primary-border: rgba(109, 93, 255, 0.42);
```

### AI 能量色

```css
--ai-blue: #22D3EE;
--ai-purple: #8B5CF6;
--ai-glow: rgba(124, 92, 255, 0.45);
```

### 状态色

```css
--success: #22C55E;
--warning: #F59E0B;
--danger: #EF4444;
--info: #38BDF8;
```

### 文本色

```css
--text-main: #F8FAFC;
--text-secondary: #CBD5E1;
--text-muted: #64748B;
--text-disabled: #475569;
```

### 边框

```css
--border-base: rgba(148, 163, 184, 0.16);
--border-strong: rgba(148, 163, 184, 0.28);
--border-glow: rgba(109, 93, 255, 0.55);
```

### 使用原则

- 整体以深色专业工作台为基底
- 主色只用于当前主操作、高亮节点和关键任务状态
- AI 能量色用于增强“智能运行中”的感知，不可滥用
- 成功、失败、警告必须明确区分
- 不允许多个主色并列竞争注意力

---

## 3. 字体规范

### 字体栈

```css
font-family:
  Inter,
  "HarmonyOS Sans SC",
  "PingFang SC",
  "Microsoft YaHei",
  sans-serif;
```

### 字号

```css
--text-xs: 12px;
--text-sm: 13px;
--text-base: 14px;
--text-md: 16px;
--text-lg: 20px;
--text-xl: 24px;
--text-2xl: 32px;
```

### 使用规则

- 页面标题：24px / 32px / 600
- 模块标题：16px / 24px / 600
- 正文：14px / 22px / 400
- 辅助说明：13px / 20px / 400
- 数据数字：优先使用 Inter 或 monospace，突出科技感

### 禁止事项

- 禁止大字标题堆满页面
- 禁止同一页面出现多套标题系统
- 禁止出现“老人机式”的粗大字重

---

## 4. 全局布局框架

### 桌面端主框架

```txt
┌─────────────────────────────────────────────┐
│ TopBar：搜索 / GPU / API / 通知 / 用户       │
├──────────────┬──────────────────────────────┤
│ Sidebar      │ Main Workspace               │
│ 240px        │                              │
│              │ 页面内容区                    │
└──────────────┴──────────────────────────────┘
```

### 尺寸

```css
--sidebar-width: 240px;
--topbar-height: 72px;
--page-padding: 24px;
--panel-radius: 16px;
--card-radius: 14px;
```

### 页面原则

- 左侧导航固定
- 顶部状态栏固定
- 主内容区域只允许内部局部滚动
- 核心操作必须首屏可见
- 每个页面只允许一个主按钮

---

## 5. 页面背景效果

### 应用背景

```css
.app-bg {
  background:
    radial-gradient(circle at 20% 10%, rgba(109, 93, 255, 0.16), transparent 32%),
    radial-gradient(circle at 80% 20%, rgba(34, 211, 238, 0.10), transparent 28%),
    linear-gradient(180deg, #060B16 0%, #08111F 100%);
}
```

### 面板玻璃感

```css
.panel {
  background: linear-gradient(
    180deg,
    rgba(17, 28, 49, 0.92),
    rgba(8, 17, 31, 0.92)
  );
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(18px);
  border-radius: 16px;
}
```

### 使用原则

- 背景需要有层次，但不能花哨
- 玻璃感必须克制，服务于工作台气质
- 不允许使用廉价彩虹渐变或高饱和背景块

---

## 6. 核心组件规范

### 6.1 Button

#### Primary Button

用于当前页面唯一主操作。

```css
.btn-primary {
  height: 44px;
  padding: 0 20px;
  border-radius: 12px;
  background: linear-gradient(135deg, #6D5DFF, #8B5CF6);
  color: #FFFFFF;
  font-weight: 600;
  box-shadow: 0 12px 32px rgba(109, 93, 255, 0.35);
}
```

#### Secondary Button

```css
.btn-secondary {
  height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
  color: #CBD5E1;
}
```

#### Danger Button

```css
.btn-danger {
  background: rgba(239, 68, 68, 0.14);
  color: #FCA5A5;
  border: 1px solid rgba(239, 68, 68, 0.32);
}
```

### 6.2 Card

```css
.card {
  background: rgba(17, 28, 49, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 14px;
  padding: 16px;
}

.card:hover {
  border-color: rgba(109, 93, 255, 0.42);
  box-shadow:
    0 0 0 1px rgba(109, 93, 255, 0.16),
    0 18px 50px rgba(0, 0, 0, 0.28);
}
```

### 6.3 Input

```css
.input {
  height: 42px;
  background: rgba(8, 17, 31, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  color: #F8FAFC;
  padding: 0 14px;
}

.input:focus {
  border-color: #6D5DFF;
  box-shadow: 0 0 0 3px rgba(109, 93, 255, 0.18);
}
```

### 6.4 Badge

```css
.badge-ai {
  background: rgba(109, 93, 255, 0.16);
  color: #A78BFA;
  border: 1px solid rgba(109, 93, 255, 0.32);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
}
```

### 6.5 Progress

```css
.progress-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.14);
}

.progress-bar {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #6D5DFF, #22D3EE);
  box-shadow: 0 0 18px rgba(109, 93, 255, 0.55);
}
```

---

## 7. 工作流步骤条

### 爆款复刻流程

固定为：

1. 参考分析
2. 脚本生成
3. 分镜设计
4. 分镜视频
5. 成片合成
6. 发布导出

### Step 状态

```ts
type StepStatus = 'idle' | 'running' | 'success' | 'error' | 'locked'
```

### 规则

- 当前步骤高亮发光
- 已完成步骤显示 check
- 未开始步骤降低透明度
- 错误步骤红色提示
- 未激活步骤不可点击
- 每一步只允许一个主要 CTA

---

## 8. AI 状态规范

所有 AI 任务必须显示真实状态，不允许静默失败。

### AI 状态字段

```ts
interface AiTaskStatus {
  provider: string
  model: string
  status: 'idle' | 'running' | 'success' | 'error'
  progress: number
  responseSnippet?: string
  startedAt?: string
  duration?: number
}
```

### 失败展示规则

失败时必须显示：

- 供应商名称
- 模型名称
- 失败阶段
- 错误片段 `responseSnippet`
- 重试按钮
- 查看日志按钮

---

## 9. 页面设计规范

### 9.1 首页 Dashboard

首页是控制中心，不是欢迎页。

#### 必须包含

- 今日生成视频数
- 今日消耗时长
- 成功率
- 任务总数
- 预计收益
- 进行中的任务
- 任务流程可视化
- 推荐模板
- AI 助手
- 系统通知

#### 布局

- 左侧：导航
- 中间：Hero + 数据卡 + 任务列表 + 推荐模板
- 右侧：快速创建 + AI 助手 + 通知

### 9.2 爆款复刻 `/clone`

这是系统核心页面。

#### 必须包含

- 顶部流程步骤条
- 当前步骤主操作区
- 右侧项目设置
- 当前项目卡片
- 任务队列
- AI 引擎状态

#### 交互原则

- 当前步骤优先
- 其他步骤弱化
- 支持断点续跑
- 支持失败镜头单独重试
- 支持云端任务恢复

### 9.3 参考分析页

#### 主区域

- 参考视频播放器
- 视频基础信息
- 分析中状态
- 内容结构分析
- 脚本识别结果
- 爆款潜力评分

#### 右侧

- 项目信息
- 复刻模式
- 关联模特
- 关联产品素材包
- AI 引擎状态

### 9.4 脚本生成页

#### 主区域

- 脚本模式切换
- 脚本生成方向
- 高级选项折叠
- AI 灵感推荐
- 多版本脚本卡片

#### 脚本卡片必须包含

- 脚本版本编号
- 推荐标记
- 脚本文案摘要
- 综合评分
- 爆款潜力
- 内容结构
- 情绪感染
- 商业价值
- 预览按钮
- 应用按钮
- 收藏按钮

### 9.5 分镜设计页

#### 主区域

- 分镜列表
- 分镜画面
- 提示词
- 时长
- 景别
- 运镜
- 台词 / 旁白
- 操作按钮

#### 右侧

- 分镜预览
- AI 优化建议
- 分镜素材库

#### 操作

- 智能生成分镜
- 批量替换
- 镜头模板
- 调色风格
- 画幅比例
- 缩略图大小

### 9.6 分镜视频页

必须突出自动化生成。

#### 主区域

- 总进度
- 已完成数量
- 生成中数量
- 等待中数量
- 失败数量
- 预计剩余时间
- 分镜生成队列
- 每个镜头状态

```ts
type ShotVideoStatus =
  | 'waiting'
  | 'generating'
  | 'success'
  | 'error'
  | 'paused'
```

#### 右侧

- 实时预览
- 生成信息
- 资源占用
- 镜头级提示词

### 9.7 成片合成页

#### 主区域

- 成片播放器
- 时间线编辑
- 视频轨道
- 转场轨道
- 字幕轨道
- 音频轨道
- 背景音乐轨道

#### 右侧

- 合成参数
- AI 合成分析
- 成片预览
- 导出队列

#### 合成参数

- 输出比例
- 分辨率
- 帧率
- 码率
- 编码格式
- 智能优化开关

### 9.8 发布导出页

#### 主区域

- 成片预览
- 精彩片段
- 导出队列
- 数据预测
- 历史导出记录

#### 右侧

- 导出设置
- 一键发布平台
- 发布文案
- 高级设置
- 发布历史

#### 平台

- 抖音
- 快手
- 视频号
- 小红书
- B站
- YouTube
- TikTok

---

## 10. 导航规范

### Sidebar 菜单

- 首页
- 爆款复刻
- 任务中心
- 模板库
- 模特库
- 产品素材库
- 直播切片
- AI 创作
- 数据分析
- 团队协作
- 设置中心

### 菜单规则

- 当前页面使用紫色渐变背景
- 图标统一线性风格
- 二级标签使用小 Badge
- 底部展示系统状态 / 企业版信息

---

## 11. 动效规范

### Hover

- 卡片轻微上浮 2px
- 边框变亮
- 发光增强

```css
transition: all 180ms ease;
```

### AI Running

```css
.ai-running {
  animation: pulseGlow 1.8s ease-in-out infinite;
}

@keyframes pulseGlow {
  0%, 100% {
    box-shadow: 0 0 18px rgba(109, 93, 255, 0.35);
  }
  50% {
    box-shadow: 0 0 36px rgba(34, 211, 238, 0.45);
  }
}
```

### Skeleton

所有 AI 生成中内容必须有骨架屏，不允许空白。

---

## 12. 信息密度规则

### 第一屏必须看到

- 当前步骤
- 当前任务状态
- 当前主操作按钮
- 当前预览
- 当前进度
- 错误 / 成功状态

### 默认折叠

- 高级参数
- 低频设置
- 原始日志
- 模型细节
- 批量高级配置

### 默认展开

- 当前步骤核心内容
- 当前任务状态
- AI 推荐
- 预览区域

---

## 13. 空状态

没有任务时：

- 显示轻量 AI 图标
- 显示一句说明
- 显示一个主按钮

### 示例

还没有复刻任务  
上传一个参考视频，AI 将自动完成分析、脚本、分镜和成片生成。  
[开始新任务]

---

## 14. 错误状态

错误提示必须明确。

### 示例

视频生成失败

- 供应商：AtlasCloud
- 模型：Runway Gen-3
- 阶段：分镜视频生成
- 错误片段：task timeout after 180s

[重试当前镜头] [查看日志]

---

## 15. Codex 开发要求

### 必须

- 使用 Vue 3 Composition API
- 使用 Tailwind CSS
- 所有页面组件化
- 不要写死业务数据
- 使用 mock data 驱动界面
- 所有状态必须可切换
- 页面不能长滚动承载核心流程
- 右侧面板内部可滚动
- 主区域高度适配屏幕

Tailwind 支持 dark variant 和 theme token，可用 CSS variables 统一管理深色主题和设计变量。

---

## 16. 推荐组件目录

```txt
src/
  components/
    layout/
      AppShell.vue
      Sidebar.vue
      TopBar.vue
      PageHeader.vue
    ui/
      Button.vue
      Card.vue
      Badge.vue
      Progress.vue
      Tabs.vue
      EmptyState.vue
      ErrorState.vue
      AiStatus.vue
    workflow/
      WorkflowSteps.vue
      PipelineNode.vue
      TaskQueue.vue
      ShotList.vue
      VideoPreview.vue
      TimelineEditor.vue
    clone/
      CloneLayout.vue
      ReferenceAnalysis.vue
      ScriptGeneration.vue
      StoryboardDesign.vue
      ShotVideoGeneration.vue
      FinalComposition.vue
      PublishExport.vue
```

---

## 17. 最终设计原则

VideoGen 的 UI 必须让用户一眼感觉：

这是一个可以自动赚钱的视频生产系统。

不是：

“我来编辑视频”

而是：

“我下达任务，AI 自动生产视频”
