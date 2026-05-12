'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Download, FolderArchive, HardDrive, Monitor, Sparkles } from 'lucide-react'

import { EmptyState, ErrorState } from '@/components/app/page-state'
import { MarketingShell } from '@/components/marketing/marketing-shell'
import { apiClient } from '@/lib/api-client'

export default function DownloadPage() {
  const releaseQuery = useQuery({
    queryKey: ['desktop-release'],
    queryFn: () => apiClient.getDesktopLatestRelease(),
  })

  const latest = releaseQuery.data?.latest
  const items = releaseQuery.data?.items || []
  const hasDownload = Boolean(latest?.downloadUrl)

  return (
    <MarketingShell active="download">
      <section className="marketing-panel-surface grid gap-4 rounded-[24px] p-8 max-[960px]:p-6">
        <div className="marketing-kicker-chip inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold">Desktop Download</div>
        <h1 className="m-0 text-[clamp(36px,4.4vw,56px)] font-bold leading-[1.06] tracking-[-0.06em] text-[var(--text-main)]">下载桌面客户端，承接本机执行能力</h1>
        <p className="m-0 max-w-4xl text-sm leading-8 text-[var(--text-secondary)]">
          当前桌面客户端优先支持 Windows。直播切片、本机生产、素材目录访问和 GPU 相关执行链路，统一通过桌面客户端落地。Linux 主要作为部署环境，不作为普通终端用户下载页主叙事。
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="marketing-panel-surface grid gap-5 rounded-[24px] p-8 max-[960px]:p-6">
          <div className="grid gap-2">
            <h2 className="m-0 text-2xl font-semibold text-[var(--text-main)]">Windows 客户端</h2>
            <p className="m-0 text-sm leading-7 text-[var(--text-secondary)]">适合需要本机生产、直播切片、本地素材访问与导出交付的业务团队。</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="marketing-card-surface grid gap-2 rounded-[18px] p-[22px]">
              <Monitor className="h-5 w-5 text-violet-500" />
              <strong className="text-base text-[var(--text-main)]">当前支持平台</strong>
              <p className="m-0 text-sm leading-7 text-[var(--text-secondary)]">{latest?.platform || 'Windows x64'}</p>
            </div>
            <div className="marketing-card-surface grid gap-2 rounded-[18px] p-[22px]">
              <CalendarClock className="h-5 w-5 text-cyan-500" />
              <strong className="text-base text-[var(--text-main)]">最新版本</strong>
              <p className="m-0 text-sm leading-7 text-[var(--text-secondary)]">{latest?.version || '0.1.20'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={latest?.downloadUrl || '/login?next=/workspace'}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[rgba(109,93,255,0.4)] bg-[linear-gradient(135deg,#6d5dff,#8b5cf6)] px-5 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(109,93,255,0.28)]"
              target={hasDownload ? '_blank' : undefined}
              aria-disabled={!hasDownload}
            >
              <Download className="h-4 w-4" />
              {hasDownload ? '下载 Windows 客户端' : '先进入工作台'}
            </Link>
            <Link href="/login" className="marketing-ghost-button inline-flex min-h-[44px] items-center rounded-xl px-5 text-sm font-semibold">
              登录 Web 工作台
            </Link>
            <Link href="/pricing" className="marketing-ghost-button inline-flex min-h-[44px] items-center rounded-xl px-5 text-sm font-semibold">
              查看套餐与算力说明
            </Link>
          </div>
          {releaseQuery.isPending ? (
            <div className="skeleton min-h-[110px] rounded-[18px] border border-[var(--border-base)] bg-[var(--marketing-card-bg)]" />
          ) : releaseQuery.isError ? (
            <div className="marketing-card-surface rounded-[18px] p-0">
              <ErrorState
                compact
                title="远端版本信息读取失败"
                description={releaseQuery.error instanceof Error ? `${releaseQuery.error.message}，页面已回退为本地参考版本信息。` : '当前无法读取远端版本信息，页面已回退为本地参考版本信息。'}
                onRetry={() => void releaseQuery.refetch()}
              />
            </div>
          ) : !latest ? (
            <div className="marketing-card-surface rounded-[18px] p-0">
              <EmptyState
                compact
                title="暂未发布可读取的客户端版本"
                description="下载页仍可用于查看安装流程与桌面端能力边界。待版本接口可用后，这里会自动展示最新下载入口。"
                actionLabel="进入工作台"
                href="/login?next=/workspace"
              />
            </div>
          ) : (
            <div className="marketing-card-surface grid gap-2 rounded-[18px] p-[22px]">
              <strong className="text-base text-[var(--text-main)]">版本说明</strong>
              <p className="m-0 text-sm leading-7 text-[var(--text-secondary)]">{latest?.releaseNotes || '当前未读取到远端版本说明，页面已使用本地版本信息作为回退展示。'}</p>
            </div>
          )}
          {latest && !hasDownload ? (
            <div className="rounded-[16px] border border-dashed border-[var(--border-base)] px-5 py-4 text-sm text-[var(--text-muted)]">
              当前版本信息已同步，但暂未提供可直接下载的安装包链接。你可以先登录工作台，或联系交付同学获取安装包。
            </div>
          ) : null}
        </div>

        <div className="marketing-panel-surface grid gap-4 rounded-[24px] p-8 max-[960px]:p-6" id="install">
          <div className="marketing-kicker-chip inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold">Install Steps</div>
          <h2 className="m-0 text-2xl font-semibold text-[var(--text-main)]">安装与使用步骤</h2>
          <div className="grid gap-3">
            {[
              ['01', '下载客户端', '从当前页面获取 Windows 安装包。'],
              ['02', '完成安装', '按安装向导完成桌面客户端部署。'],
              ['03', '登录账号', '使用同一账号登录客户端与 Web 工作台。'],
              ['04', '返回工作台协同', '在 Web 中配置任务，在桌面端执行并回写结果。'],
            ].map(([step, title, copy]) => (
              <div key={step} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-3 border-b border-[var(--border-base)] py-3 last:border-b-0">
                <div className="grid h-11 w-11 place-items-center rounded-[14px] border border-[rgba(109,93,255,0.22)] bg-[rgba(109,93,255,0.12)] text-sm font-bold text-[var(--text-main)]">{step}</div>
                <div className="grid gap-1">
                  <strong className="text-sm text-[var(--text-main)]">{title}</strong>
                  <span className="text-sm leading-6 text-[var(--text-secondary)]">{copy}</span>
                </div>
                <span className="inline-flex min-h-7 items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 text-xs text-cyan-600">桌面端参与</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="marketing-card-surface grid gap-2 rounded-[18px] p-[22px]">
          <Sparkles className="h-5 w-5 text-violet-500" />
          <strong className="text-base text-[var(--text-main)]">直播切片</strong>
          <p className="m-0 text-sm leading-7 text-[var(--text-secondary)]">依赖视频文件读取、切片转码和本机执行链路。</p>
        </div>
        <div className="marketing-card-surface grid gap-2 rounded-[18px] p-[22px]">
          <HardDrive className="h-5 w-5 text-cyan-500" />
          <strong className="text-base text-[var(--text-main)]">本地素材访问</strong>
          <p className="m-0 text-sm leading-7 text-[var(--text-secondary)]">适用于大体量素材盘、缓存目录和导出目录协同。</p>
        </div>
        <div className="marketing-card-surface grid gap-2 rounded-[18px] p-[22px]">
          <FolderArchive className="h-5 w-5 text-emerald-500" />
          <strong className="text-base text-[var(--text-main)]">历史版本与包管理</strong>
          <p className="m-0 text-sm leading-7 text-[var(--text-secondary)]">{items.length > 1 ? `当前可读取 ${items.length} 个版本记录。` : '已预留历史版本区域；当前接口未返回更多版本。'}</p>
        </div>
      </section>
    </MarketingShell>
  )
}
