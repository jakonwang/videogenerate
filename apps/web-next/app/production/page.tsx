'use client'

import Link from 'next/link'
import { Cpu, FolderSync, PlayCircle, Rows3 } from 'lucide-react'

import { AppShell } from '@/components/app/app-shell'
import { ProtectedPageGate } from '@/components/app/protected-page-gate'
import { DesktopRequiredBanner } from '@/components/marketing/desktop-required-banner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuthGuard } from '@/hooks/use-auth-guard'

const capabilities = [
  {
    icon: Cpu,
    title: '本机算力调度',
    copy: '成片合成、批量生产和本地渲染任务会直接依赖桌面端机器的 CPU / GPU 环境，不在 Web 侧伪装为可直接执行。',
  },
  {
    icon: FolderSync,
    title: '本地素材与输出目录',
    copy: '桌面客户端负责访问本地素材盘、缓存目录和最终导出路径，Web 侧只保留任务配置与状态协同。',
  },
  {
    icon: Rows3,
    title: '任务队列与回写',
    copy: '工作台里创建的生产任务可在桌面客户端拉取执行，执行结果再回写到 Web 任务中心，形成协同闭环。',
  },
] as const

export default function ProductionPage() {
  const auth = useAuthGuard()

  const gate = ProtectedPageGate({
    auth,
    restoringTitle: '正在恢复生产中心',
    restoringDescription: '系统正在校验会话状态并准备生产协同说明。',
  })

  if (gate) return gate

  return (
    <AppShell>
      <div className="page-shell">
        <DesktopRequiredBanner
          title="生产中心"
          description="该模块用于承接成片合成、本机批量执行和桌面端任务调度。你可以在 Web 中配置任务、查看结果，但正式执行需要安装桌面客户端。"
        />

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="grid gap-4 p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[rgba(109,93,255,0.12)] text-violet-200">
                <PlayCircle className="h-5 w-5" />
              </div>
              <h2 className="section-title">生产协同说明</h2>
            </div>

            <div className="grid gap-3">
              {capabilities.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.title} className="soft-card soft-card--panel grid gap-2">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.04] text-cyan-200">
                        <Icon className="h-4 w-4" />
                      </div>
                      <strong className="text-sm text-[var(--text-main)]">{item.title}</strong>
                    </div>
                    <p className="body-copy text-sm">{item.copy}</p>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/download#install">
                <Button>下载桌面客户端</Button>
              </Link>
              <Link href="/clone">
                <Button variant="secondary">回到任务中心</Button>
              </Link>
            </div>
          </Card>

          <aside className="grid gap-4">
            <Card className="grid gap-4 p-5">
              <h2 className="section-title">当前支持范围</h2>
              <div className="meta-list">
                <strong>Web 工作台</strong>
                <span>任务创建、参数配置、任务状态查看、生产结果回查</span>
              </div>
              <div className="meta-list">
                <strong>桌面客户端</strong>
                <span>本机执行、素材访问、GPU 调度、导出到本地目录</span>
              </div>
            </Card>
            <Card className="grid gap-4 p-5">
              <h2 className="section-title">推荐路径</h2>
              <div className="meta-list">
                <strong>Web 端</strong>
                <span>在复刻任务详情页整理镜头、脚本和输出目录。</span>
              </div>
              <div className="meta-list">
                <strong>桌面端</strong>
                <span>接管本机渲染和导出，完成高负载执行与结果回写。</span>
              </div>
            </Card>
          </aside>
        </section>
      </div>
    </AppShell>
  )
}
