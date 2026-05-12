import Link from 'next/link'
import {
  ArrowRight,
  Bot,
  Boxes,
  Clapperboard,
  FolderKanban,
  MonitorPlay,
  Settings2,
  Sparkles,
  Stars,
} from 'lucide-react'

import { MarketingShell } from '@/components/marketing/marketing-shell'

const capabilityCards = [
  { title: '爆款复刻', copy: '基于参考视频快速抽取结构、节奏与镜头逻辑，形成可复用生产起点。', icon: Sparkles },
  { title: '模板驱动生产', copy: '把高转化结构沉淀为模板，支持团队重复调用与批量派生。', icon: Boxes },
  { title: '模特与商品资产库', copy: '让模特身份、商品图和产出结果形成长期复用资产。', icon: Bot },
  { title: '批量任务调度', copy: '用统一任务中心查看进度、异常、结果与阶段切换。', icon: FolderKanban },
  { title: '直播切片', copy: '自动识别直播高价值片段，适合内容二次分发和矩阵运营。', icon: MonitorPlay },
  { title: '统一设置与治理', copy: '规范 API 地址、默认参数、账号状态和运行边界。', icon: Settings2 },
] as const

const workflow = [
  ['参考分析', 'Web 可驱动', '识别内容结构、节奏节点和镜头拆解逻辑。'],
  ['脚本生成', 'Web 可驱动', '输出可执行脚本候选，方便团队快速选型。'],
  ['分镜图', 'Web 可驱动', '生成镜头级视觉参考和素材缺口说明。'],
  ['分镜视频', 'Web 可驱动', '推进镜头级视频生成和替换决策。'],
  ['成片合成', '需桌面客户端', '依赖本机环境执行批量合成与本地输出。'],
  ['发布导出', '需桌面客户端', '连接本地目录、素材盘与桌面交付链路。'],
] as const

const scenarioCards = [
  {
    title: '品牌团队',
    copy: '用统一模板和任务状态管理多条产品线的视频投放节奏。',
  },
  {
    title: '代运营机构',
    copy: '复用成熟结构批量交付客户内容，降低制作与沟通成本。',
  },
  {
    title: '矩阵工作室',
    copy: '快速复制爆款视频逻辑，形成多账号、高频次的稳定产能。',
  },
] as const

export default function ProductPage() {
  return (
    <MarketingShell active="product">
      <section className="marketing-panel-surface grid gap-8 rounded-[28px] p-8 max-[960px]:p-6 lg:grid-cols-[minmax(0,1.08fr)_360px]">
        <div className="grid gap-5">
          <div className="marketing-kicker-chip inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold">
            <Stars className="h-3.5 w-3.5" />
            Product Narrative
          </div>
          <div className="grid gap-4">
            <h1 className="m-0 max-w-4xl text-[clamp(38px,4.8vw,62px)] font-bold leading-[1.04] tracking-[-0.07em] text-[var(--text-main)]">
              重新定义 AI 视频生产的产品展示页
            </h1>
            <p className="m-0 max-w-4xl text-sm leading-8 text-[var(--text-secondary)] md:text-[15px]">
              VideoGen 不是单点内容工具，而是一套围绕参考分析、脚本、分镜、成片与资产沉淀构建的视频生产基础设施。产品页重点讲清模块组成、执行边界和适用场景，帮助外部用户快速理解平台价值。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/pricing" className="inline-flex min-h-[46px] items-center gap-2 rounded-2xl border border-[rgba(109,93,255,0.42)] bg-[linear-gradient(135deg,#7c6bff,#9b6bff)] px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(109,93,255,0.35)]">
              查看定价
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/download" className="marketing-ghost-button inline-flex min-h-[46px] items-center rounded-2xl px-5 text-sm font-semibold">
              下载客户端
            </Link>
          </div>
        </div>

        <div className="marketing-product-highlight">
          <span>Production Stack</span>
          <strong>一套界面覆盖从灵感到导出的全流程</strong>
          <p>公开页负责讲清价值和结构，登录工作台负责推进任务与协同，桌面客户端负责承接重计算与本地导出。</p>
          <div className="marketing-product-highlight-grid">
            <div>
              <em>Web</em>
              <span>任务驱动</span>
            </div>
            <div>
              <em>Desktop</em>
              <span>本机执行</span>
            </div>
            <div>
              <em>Assets</em>
              <span>长期沉淀</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {capabilityCards.map((item) => {
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

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <div className="marketing-panel-surface grid gap-4 rounded-[28px] p-8 max-[960px]:p-6">
          <div className="marketing-kicker-chip inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold">Workflow</div>
          <h2 className="m-0 text-2xl font-semibold text-[var(--text-main)]">从参考分析到发布导出的完整链路</h2>
          <div className="grid gap-3">
            {workflow.map(([title, tag, copy], index) => (
              <div key={title} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-3 border-b border-[var(--border-base)] py-3 last:border-b-0 max-[640px]:grid-cols-1">
                <div className="grid h-11 w-11 place-items-center rounded-[14px] border border-[rgba(109,93,255,0.22)] bg-[rgba(109,93,255,0.12)] text-sm font-bold text-[var(--text-main)]">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="grid gap-1">
                  <strong className="text-sm text-[var(--text-main)]">{title}</strong>
                  <span className="text-sm leading-6 text-[var(--text-secondary)]">{copy}</span>
                </div>
                <span className={`inline-flex min-h-7 items-center rounded-full border px-3 text-xs ${tag.includes('客户端') ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300' : 'border-[var(--border-base)] bg-[rgba(255,255,255,0.05)] text-[var(--text-secondary)]'}`}>{tag}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="marketing-panel-surface grid gap-4 rounded-[28px] p-8 max-[960px]:p-6">
            <div className="marketing-kicker-chip inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold">Scenario</div>
            <h2 className="m-0 text-2xl font-semibold text-[var(--text-main)]">适用场景</h2>
            <div className="grid gap-3">
              {scenarioCards.map((item) => (
                <div key={item.title} className="marketing-card-surface grid gap-2 rounded-[20px] p-5">
                  <strong className="text-sm text-[var(--text-main)]">{item.title}</strong>
                  <p className="m-0 text-sm leading-7 text-[var(--text-secondary)]">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="marketing-panel-surface grid gap-4 rounded-[28px] p-8 max-[960px]:p-6">
            <div className="marketing-kicker-chip inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold">Desktop Client</div>
            <h2 className="m-0 text-2xl font-semibold text-[var(--text-main)]">为什么需要桌面客户端</h2>
            <div className="grid gap-3 text-sm leading-7 text-[var(--text-secondary)]">
              <div className="marketing-card-surface rounded-[20px] p-5">
                直播切片需要处理本地回放文件、转码链路和较重的视频计算任务，因此通过桌面客户端执行。
              </div>
              <div className="marketing-card-surface rounded-[20px] p-5">
                成片生产需要访问本地素材目录、输出目录和 GPU 环境，更适合桌面客户端拉起本机任务。
              </div>
              <div className="marketing-card-surface rounded-[20px] p-5">
                Web 负责配置、查看、分发；桌面客户端负责执行、导出、回写，边界明确且更稳定。
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-panel-surface grid gap-4 rounded-[28px] p-8 max-[960px]:p-6">
        <div className="marketing-kicker-chip inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold">
          <Clapperboard className="h-3.5 w-3.5" />
          Product Positioning
        </div>
        <h2 className="m-0 text-2xl font-semibold text-[var(--text-main)]">兼顾融资叙事、销售介绍与真实生产能力边界</h2>
        <p className="m-0 max-w-4xl text-sm leading-8 text-[var(--text-secondary)]">
          产品展示页采用与首页一致的深色渐变视觉语言，但更聚焦模块解释和场景说明，既能对外展示平台能力，也能避免把依赖本机环境的能力误导为纯 Web 功能。
        </p>
      </section>
    </MarketingShell>
  )
}
