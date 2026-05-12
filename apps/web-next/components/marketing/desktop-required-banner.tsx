import Link from 'next/link'
import { ArrowRight, Cpu, Download, HardDrive, MonitorSmartphone } from 'lucide-react'

type DesktopRequiredBannerProps = {
  title: string
  description: string
}

const tags = [
  { icon: Cpu, label: '依赖本机 GPU / 算力' },
  { icon: HardDrive, label: '需要本地文件系统' },
  { icon: MonitorSmartphone, label: '需桌面客户端运行' },
] as const

export function DesktopRequiredBanner({ title, description }: DesktopRequiredBannerProps) {
  return (
    <section className="grid gap-4 rounded-[20px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_24%),linear-gradient(180deg,rgba(10,20,36,0.94),rgba(8,17,31,0.94))] p-5">
      <div className="grid gap-3">
        <div className="inline-flex w-fit items-center rounded-full border border-[rgba(109,93,255,0.22)] bg-[rgba(109,93,255,0.12)] px-3 py-1 text-xs font-semibold text-[#d8d4ff]">
          Desktop Required
        </div>
        <div className="grid gap-2">
          <h1 className="page-title">{title}</h1>
          <p className="body-copy max-w-3xl">{description}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map((item) => {
          const Icon = item.icon
          return (
            <span
              key={item.label}
              className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 text-xs font-semibold text-cyan-200"
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </span>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/download"
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-[rgba(109,93,255,0.4)] bg-[linear-gradient(135deg,#6d5dff,#8b5cf6)] px-4 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(109,93,255,0.28)]"
        >
          <Download className="h-4 w-4" />
          下载桌面客户端
        </Link>
        <Link
          href="/download#install"
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-[rgba(17,28,49,0.78)] px-4 text-sm font-semibold text-slate-200"
        >
          查看安装说明
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}
