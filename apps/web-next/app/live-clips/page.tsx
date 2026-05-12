'use client'

import Link from 'next/link'
import { Film, ScissorsLineDashed, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

import { AppShell } from '@/components/app/app-shell'
import { ProtectedPageGate } from '@/components/app/protected-page-gate'
import { DesktopRequiredBanner } from '@/components/marketing/desktop-required-banner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuthGuard } from '@/hooks/use-auth-guard'

type ClipConfig = {
  source: string
  duration: string
  count: string
  highlight: string
}

const STORAGE_KEY = 'web-next-live-clip-config'

export default function LiveClipsPage() {
  const auth = useAuthGuard()
  const [config, setConfig] = useState<ClipConfig>({
    source: '',
    duration: '30',
    count: '5',
    highlight: '高互动片段优先',
  })
  const [submitted, setSubmitted] = useState<ClipConfig | null>(null)

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      setConfig(JSON.parse(raw))
    } catch {}
  }, [])

  const save = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    setSubmitted(config)
  }

  const gate = ProtectedPageGate({
    auth,
    restoringTitle: '正在恢复直播切片配置',
    restoringDescription: '系统正在读取本地切片参数和会话状态。',
  })

  if (gate) return gate

  return (
    <AppShell>
      <div className="page-shell">
        <DesktopRequiredBanner
          title="直播切片"
          description="直播切片需要读取本地回放文件、执行切片与转码任务，并根据本机环境调度处理过程。Web 页面保留配置和查看能力，正式执行请通过桌面客户端完成。"
        />

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="grid gap-4 p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[rgba(109,93,255,0.12)] text-violet-200">
                <ScissorsLineDashed className="h-5 w-5" />
              </div>
              <h2 className="section-title">切片配置</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
                <span>直播回放地址 / 本地文件</span>
                <Input value={config.source} onChange={(event) => setConfig((current) => ({ ...current, source: event.target.value }))} placeholder="输入直播回放地址或本地文件标识" />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>单条时长（秒）</span>
                <Input value={config.duration} onChange={(event) => setConfig((current) => ({ ...current, duration: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>输出数量</span>
                <Input value={config.count} onChange={(event) => setConfig((current) => ({ ...current, count: event.target.value }))} />
              </label>
              <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
                <span>高光识别策略</span>
                <Input value={config.highlight} onChange={(event) => setConfig((current) => ({ ...current, highlight: event.target.value }))} />
              </label>
            </div>
            <div className="flex gap-2">
              <Button onClick={save}>
                <Sparkles className="h-4 w-4" />
                保存配置
              </Button>
              <Link href="/download#install">
                <Button variant="secondary">查看客户端安装说明</Button>
              </Link>
            </div>
          </Card>

          <aside className="grid gap-4">
            <Card className="grid gap-4 p-5">
              <h2 className="section-title">当前状态</h2>
              <div className="soft-card soft-card--panel meta-list">
                <strong>模块定位</strong>
                <span>Web 侧提供配置、状态查看和下载引导；正式切片执行通过桌面客户端完成。</span>
              </div>
              <div className="soft-card soft-card--panel meta-list">
                <strong>执行依赖</strong>
                <span>本机 GPU / CPU、本地文件系统、桌面客户端运行环境。</span>
              </div>
              {submitted ? (
                <div className="soft-card soft-card--panel meta-list">
                  <strong>最近保存</strong>
                  <span>{submitted.source || '未填写来源'} / {submitted.duration}s / {submitted.count} 条</span>
                </div>
              ) : null}
              {!submitted ? (
                <div className="soft-card soft-card--panel meta-list">
                  <strong>下一步建议</strong>
                  <span>先保存切片策略，再到桌面客户端执行直播回放切片，执行结果会回到工作台中查看。</span>
                </div>
              ) : null}
            </Card>

            <Card className="grid gap-4 p-5">
              <h2 className="section-title">适用场景</h2>
              <div className="grid gap-3">
                <div className="soft-card soft-card--panel flex items-start gap-3">
                  <Film className="mt-0.5 h-4 w-4 text-cyan-200" />
                  <span className="text-sm text-slate-300">直播回放自动切出高互动、高停留或可二次分发的短视频片段。</span>
                </div>
              </div>
            </Card>
          </aside>
        </section>
      </div>
    </AppShell>
  )
}
