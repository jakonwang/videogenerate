import Link from 'next/link'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Download,
  FolderKanban,
  Layers3,
  PlayCircle,
  Sparkles,
  Stars,
  Wand2,
} from 'lucide-react'

import { MarketingShell } from '@/components/marketing/marketing-shell'

const quickStats = [
  ['24h', '最新任务回写'],
  ['12+', '推荐视频模板'],
  ['3x', '批量交付提效'],
] as const

const recentTasks = [
  {
    title: '夏季防晒喷雾投放视频',
    stage: '脚本生成完成 · 等待分镜图',
    status: '进行中',
    tone: 'running',
    meta: '负责人 Ava · 2 分钟前更新',
  },
  {
    title: '零食直播切片矩阵',
    stage: '已输出 18 条高光片段',
    status: '桌面端执行',
    tone: 'desktop',
    meta: '任务批次 B-12 · 今日 09:40',
  },
  {
    title: '品牌口播模板升级',
    stage: '模板参数已沉淀，可批量复用',
    status: '已完成',
    tone: 'done',
    meta: '由产品模板库同步',
  },
] as const

const recommendedTemplates = [
  {
    title: '高转化口播模板',
    description: '适合新品卖点拆解、3 段式节奏推进与评论区引导。',
    badge: '转化优先',
  },
  {
    title: '直播切片模板',
    description: '自动抽取高互动片段，适合矩阵号二次分发。',
    badge: '桌面执行',
  },
  {
    title: '达人混剪模板',
    description: '适合参考视频复刻、镜头替换与商品图快速挂载。',
    badge: '批量生产',
  },
] as const

const valueCards = [
  {
    title: '参考视频一键拆解',
    copy: '自动提取爆款结构、镜头节奏与文案逻辑，直接衔接脚本和分镜生产。',
    icon: Sparkles,
  },
  {
    title: '任务中心可视化推进',
    copy: '把脚本、分镜、视频、导出统一纳入同一任务面板，方便团队追踪与协同。',
    icon: FolderKanban,
  },
  {
    title: '模板资产持续复用',
    copy: '高转化结构、模特设定与商品素材沉淀为长期资产，适合商业化规模复制。',
    icon: Layers3,
  },
] as const

export default function MarketingHomePage() {
  return (
    <MarketingShell active="home">
      <section className="marketing-hero-grid">
        <div className="marketing-panel-surface marketing-hero-panel">
          <div className="marketing-kicker-chip inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold">
            <Stars className="h-3.5 w-3.5" />
            AI Video Operating System
          </div>

          <div className="grid gap-4">
            <h1 className="m-0 max-w-4xl text-[clamp(40px,5vw,68px)] font-bold leading-[1.02] tracking-[-0.07em] text-[var(--text-main)]">
              让 AI 帮你生成视频
            </h1>
            <p className="m-0 max-w-3xl text-sm leading-8 text-[var(--text-secondary)] md:text-[15px]">
              从参考分析、脚本生成、分镜设计到成片导出，把视频生产压缩进一套高级感更强、可追踪、可批量复制的工作流中，适合品牌团队、代运营和内容矩阵一起使用。
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/product"
              className="inline-flex min-h-[46px] items-center gap-2 rounded-2xl border border-[rgba(109,93,255,0.42)] bg-[linear-gradient(135deg,#7c6bff,#9b6bff)] px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(109,93,255,0.35)]"
            >
              查看产品能力
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/download" className="marketing-ghost-button inline-flex min-h-[46px] items-center gap-2 rounded-2xl px-5 text-sm font-semibold">
              <Download className="h-4 w-4" />
              下载桌面客户端
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {quickStats.map(([value, label]) => (
              <div key={label} className="marketing-card-surface rounded-[22px] px-5 py-4">
                <div className="text-[30px] font-semibold leading-none text-[var(--text-main)]">{value}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="marketing-dashboard-panel">
          <div className="marketing-dashboard-shell">
            <div className="marketing-dashboard-sidebar">
              <div className="marketing-dashboard-brand">
                <div className="marketing-dashboard-brand-mark" />
                <div>
                  <strong>VideoGen</strong>
                  <span>Public Workspace</span>
                </div>
              </div>

              <div className="marketing-dashboard-menu">
                <div className="is-active">
                  <PlayCircle className="h-4 w-4" />
                  创作中心
                </div>
                <div>
                  <Wand2 className="h-4 w-4" />
                  爆款复刻
                </div>
                <div>
                  <Layers3 className="h-4 w-4" />
                  模板市场
                </div>
                <div>
                  <FolderKanban className="h-4 w-4" />
                  任务回放
                </div>
              </div>
            </div>

            <div className="marketing-dashboard-main">
              <div className="marketing-dashboard-banner">
                <div>
                  <span>Recent Tasks</span>
                  <h2>最近任务</h2>
                </div>
                <div className="marketing-dashboard-banner-chip">
                  <Clock3 className="h-3.5 w-3.5" />
                  实时同步
                </div>
              </div>

              <div className="grid gap-3">
                {recentTasks.map((task) => (
                  <div key={task.title} className="marketing-task-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid gap-1">
                        <strong className="text-sm text-[var(--text-main)]">{task.title}</strong>
                        <p className="m-0 text-xs leading-6 text-[var(--text-secondary)]">{task.stage}</p>
                      </div>
                      <span className={`marketing-status-pill marketing-status-pill--${task.tone}`}>{task.status}</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-muted)]">{task.meta}</span>
                  </div>
                ))}
              </div>

              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Recommended</span>
                    <h3 className="mt-2 text-base font-semibold text-[var(--text-main)]">推荐模板</h3>
                  </div>
                  <Link href="/product" className="text-sm text-[var(--ai-blue)]">
                    查看全部
                  </Link>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {recommendedTemplates.map((template) => (
                    <div key={template.title} className="marketing-template-card">
                      <span className="marketing-template-badge">{template.badge}</span>
                      <strong className="text-sm text-[var(--text-main)]">{template.title}</strong>
                      <p className="m-0 text-xs leading-6 text-[var(--text-secondary)]">{template.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {valueCards.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.title} className="marketing-card-surface grid gap-3 rounded-[22px] p-6">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[linear-gradient(135deg,rgba(124,107,255,0.2),rgba(34,211,238,0.14))] text-violet-300">
                <Icon className="h-5 w-5" />
              </div>
              <strong className="text-base text-[var(--text-main)]">{item.title}</strong>
              <p className="m-0 text-sm leading-7 text-[var(--text-secondary)]">{item.copy}</p>
            </div>
          )
        })}
      </section>

      <section className="marketing-panel-surface grid gap-5 rounded-[28px] p-8 max-[960px]:p-6">
        <div className="grid gap-2">
          <div className="marketing-kicker-chip inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Public Site Positioning
          </div>
          <h2 className="m-0 text-2xl font-semibold text-[var(--text-main)]">公开首页负责建立信任，产品页负责讲清生产方式</h2>
          <p className="m-0 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
            首页聚焦视觉吸引力、最近任务与模板推荐，强化高级感与产品可用性；产品页继续展开链路、模块与桌面端执行边界，形成完整转化叙事。
          </p>
        </div>
      </section>
    </MarketingShell>
  )
}
