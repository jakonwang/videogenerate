import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clapperboard,
  Download,
  FileText,
  Film,
  Images,
  Layers,
  Sparkles,
  UsersRound,
  Wand2,
} from 'lucide-react'

import { PlanCards } from '@/components/site/plan-cards'
import { SectionHeading, SiteShell } from '@/components/site/site-shell'

const FEATURES = [
  {
    icon: Sparkles,
    title: '爆款视频复刻',
    desc: '丢进一条爆款视频，自动拆解脚本结构，生成多个改写版本，再出分镜图、分镜视频，合成完整成片。',
  },
  {
    icon: Layers,
    title: '批量生产',
    desc: '一个商品一次出几十条不同版本，排队生成、失败自动重试，关掉电脑也不会丢任务。',
  },
  {
    icon: UsersRound,
    title: 'AI 模特与素材库',
    desc: '把 AI 模特、商品图、视频片段沉淀成可复用资产，保证同一商品的人物与外观一致。',
  },
  {
    icon: BarChart3,
    title: 'TikTok 运营插件',
    desc: 'GMV Max 投放诊断、达人建联管理、商品上架助手，生产和运营在一个软件里完成。',
  },
]

const STEPS = [
  { icon: Film, title: '上传参考视频', desc: '支持本地文件或 TikTok 链接' },
  { icon: FileText, title: '生成脚本变体', desc: '保留爆款节奏，换成你的商品' },
  { icon: Images, title: '分镜图与分镜视频', desc: '锁定商品外观，逐镜头生成' },
  { icon: Clapperboard, title: '一键合成成片', desc: '字幕、配乐、转场自动完成' },
]

const FAQ = [
  { q: '需要自己准备 AI 平台的 Key 吗？', a: '不需要。会员登录客户端后，模型和存储由我们统一配置并自动同步，打开就能用。' },
  { q: '一个会员能在几台电脑上用？', a: '按套餐不同可绑定 1–3 台电脑。换电脑时可以在用户中心自助解绑旧设备。' },
  { q: '没网的时候能用吗？', a: '登录过的电脑在会员有效期内可以离线使用数天，联网后自动续期。AI 生成本身需要联网。' },
  { q: '怎么付款？', a: '支持微信、支付宝扫码支付，到账后自动开通；也可以使用兑换码开通。续费时长自动叠加。' },
]

function PipelinePreview() {
  return (
    <div className="relative rounded-2xl border border-[var(--border-base)] bg-[var(--bg-panel)] p-5 shadow-[0_40px_100px_rgba(0,0,0,0.25)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wand2 className="h-4 w-4 text-[var(--primary)]" /> 复刻任务 · 夏季连衣裙
        </div>
        <span className="rounded-full bg-[color-mix(in_srgb,var(--success)_14%,transparent)] px-2.5 py-1 text-xs font-medium text-[var(--success)]">生成中 68%</span>
      </div>
      <div className="grid gap-2.5">
        {[
          { label: '脚本分析', state: 'done' },
          { label: '脚本变体 × 6', state: 'done' },
          { label: '分镜图 24 / 24', state: 'done' },
          { label: '分镜视频 15 / 24', state: 'running' },
          { label: '成片合成', state: 'waiting' },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-3 rounded-xl border border-[var(--border-base)] bg-[var(--bg-panel-soft)] px-3.5 py-3 text-sm">
            {row.state === 'done' ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
            ) : row.state === 'running' ? (
              <span className="relative flex h-4 w-4 items-center justify-center">
                <span className="absolute h-3 w-3 animate-ping rounded-full bg-[var(--primary)] opacity-40" />
                <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
              </span>
            ) : (
              <span className="h-4 w-4 rounded-full border border-[var(--border-strong)]" />
            )}
            <span className={row.state === 'waiting' ? 'text-[var(--text-muted)]' : ''}>{row.label}</span>
            {row.state === 'running' ? (
              <span className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-[var(--border-base)]">
                <span className="block h-full w-[62%] rounded-full bg-[var(--primary)]" />
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="aspect-[9/16] rounded-lg border border-[var(--border-base)] bg-[linear-gradient(160deg,var(--bg-card),var(--bg-panel-soft))]"
            style={{ opacity: 1 - i * 0.18 }}
          />
        ))}
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <SiteShell>
      <section className="mx-auto grid w-full max-w-[1200px] items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
        <div className="grid gap-7">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border-base)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" /> 面向 TikTok 商家与内容团队
          </span>
          <h1 className="text-[clamp(2.2rem,5vw,3.6rem)] font-semibold leading-[1.08] tracking-[-0.035em]">
            一条爆款视频，
            <br />
            批量变成你的带货视频
          </h1>
          <p className="max-w-[520px] text-[17px] leading-relaxed text-[var(--text-secondary)]">
            Vidloom 自动拆解爆款脚本、生成分镜与视频、合成成片。你只负责选品和挑片，剩下的交给 AI 流水线。
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/download" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--primary)] px-6 text-[15px] font-semibold text-white transition hover:bg-[var(--primary-hover)]">
              <Download className="h-4 w-4" /> 免费下载客户端
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-[var(--border-strong)] px-6 text-[15px] font-semibold transition hover:border-[var(--primary-border)]"
            >
              查看价格 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--text-muted)]">
            <span>✓ 无需配置 AI Key</span>
            <span>✓ 微信 / 支付宝扫码开通</span>
            <span>✓ Windows 客户端</span>
          </div>
        </div>
        <PipelinePreview />
      </section>

      <section id="features" className="scroll-mt-20 border-t border-[var(--border-base)] bg-[var(--bg-shell)]">
        <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="核心功能" title="从找爆款到出成片，一个软件搞定" desc="不是视频编辑器，而是一条替你干活的视频生产线。" />
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <article key={title} className="grid gap-3 rounded-2xl border border-[var(--border-base)] bg-[var(--bg-panel)] p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-[15px] leading-relaxed text-[var(--text-secondary)]">{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[1200px] gap-10 px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="工作流程" title="四步出片" />
        <ol className="grid gap-4 md:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, desc }, index) => (
            <li key={title} className="relative grid gap-3 rounded-2xl border border-[var(--border-base)] bg-[var(--bg-panel)] p-5">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-panel-soft)] text-[var(--ai-blue)]">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="text-sm font-semibold tabular-nums text-[var(--text-muted)]">0{index + 1}</span>
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-[var(--text-secondary)]">{desc}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-[var(--border-base)] bg-[var(--bg-shell)]">
        <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-4 py-20 sm:px-6">
          <SectionHeading center eyebrow="价格" title="按时长订阅，功能全开" desc="所有套餐都包含全部功能，区别只在时长和可绑定的电脑数量。" />
          <PlanCards />
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[880px] gap-8 px-4 py-20 sm:px-6">
        <SectionHeading center title="常见问题" />
        <div className="grid gap-3">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-xl border border-[var(--border-base)] bg-[var(--bg-panel)] px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {item.q}
                <span className="text-xl leading-none text-[var(--text-muted)] transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1200px] px-4 pb-20 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-[var(--primary-border)] bg-[var(--primary-soft)] px-8 py-10">
          <div className="grid gap-2">
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">今天就开始批量出片</h2>
            <p className="text-[var(--text-secondary)]">下载客户端，注册账号，扫码开通会员即可使用。</p>
          </div>
          <Link href="/download" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--primary)] px-6 font-semibold text-white transition hover:bg-[var(--primary-hover)]">
            <Download className="h-4 w-4" /> 下载客户端
          </Link>
        </div>
      </section>
    </SiteShell>
  )
}
