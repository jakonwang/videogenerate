'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Apple, Download, LogIn, MonitorDown, ShieldCheck, Smartphone } from 'lucide-react'
import QRCode from 'qrcode'

import { SectionHeading, SiteShell } from '@/components/site/site-shell'
import { userClient } from '@/lib/cloud-user'

type ReleaseInfo = { url: string; version: string; notes: string; support: string; androidUrl: string; androidVersion: string; macArm64: string; macX64: string }

/** 只接受 http(s) 链接，防止配置里出现 javascript: 之类的地址 */
const httpUrl = (value: unknown) => (/^https?:\/\//i.test(String(value ?? '')) ? String(value) : '')

const STEPS = [
  { title: '下载并安装', desc: '运行安装包，按提示完成安装。' },
  { title: '注册 / 登录', desc: '打开客户端，用手机号或邮箱注册登录。' },
  { title: '开通会员', desc: '扫码购买或输入兑换码，立即开始使用。' },
]

export default function DownloadPage() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null)

  useEffect(() => {
    userClient
      .getConfig()
      .then(({ values }) =>
        setRelease({
          url: httpUrl(values['client.downloadUrl']),
          version: String(values['client.latestVersion'] ?? ''),
          notes: String(values['client.releaseNotes'] ?? ''),
          support: String(values['support.contact'] ?? ''),
          androidUrl: httpUrl(values['mobile.androidDownloadUrl']),
          androidVersion: String(values['mobile.androidVersion'] ?? ''),
          macArm64: httpUrl(values['mac.downloadUrlArm64']),
          macX64: httpUrl(values['mac.downloadUrlX64']),
        }),
      )
      .catch(() => setRelease({ url: '', version: '', notes: '', support: '', androidUrl: '', androidVersion: '', macArm64: '', macX64: '' }))
  }, [])

  // 手机扫码直接下载安卓安装包
  const [androidQr, setAndroidQr] = useState('')
  useEffect(() => {
    if (!release?.androidUrl) return
    QRCode.toDataURL(release.androidUrl, { width: 320, margin: 1 }).then(setAndroidQr).catch(() => setAndroidQr(''))
  }, [release?.androidUrl])

  return (
    <SiteShell>
      <section className="mx-auto grid w-full max-w-[960px] gap-10 px-4 py-16 sm:px-6 lg:py-20">
        <SectionHeading center eyebrow="下载" title="下载 Klipmill 客户端" desc="AI 视频生产需要本地合成与浏览器自动化，所以核心功能在 Windows 客户端里运行。" />

        <div className="grid gap-6 rounded-2xl border border-[var(--border-base)] bg-[var(--bg-panel)] p-8 text-center">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <MonitorDown className="h-7 w-7" />
          </span>
          <div className="grid gap-1">
            <h2 className="text-xl font-semibold">Windows 版</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Windows 10 / 11 · 64 位{release?.version ? ` · 最新版本 ${release.version}` : ''}
            </p>
          </div>
          {release === null ? (
            <div className="mx-auto h-12 w-56 animate-pulse rounded-xl bg-[var(--bg-panel-soft)]" />
          ) : release.url ? (
            <a
              href={release.url}
              className="mx-auto inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--primary)] px-8 font-semibold text-white transition hover:bg-[var(--primary-hover)]"
              rel="noopener"
            >
              <Download className="h-4 w-4" /> 下载安装包
            </a>
          ) : (
            <p className="mx-auto max-w-md text-sm text-[var(--text-secondary)]">
              安装包即将上线{release.support ? `，如需提前获取请联系客服：${release.support}` : '，请联系客服获取。'}
            </p>
          )}
          {release?.notes ? (
            <div className="mx-auto max-w-xl whitespace-pre-line rounded-xl bg-[var(--bg-panel-soft)] p-4 text-left text-sm leading-relaxed text-[var(--text-secondary)]">
              {release.notes}
            </div>
          ) : null}
          <p className="flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)]">
            <ShieldCheck className="h-3.5 w-3.5" /> 请只从本页下载，安装时如遇系统提示请选择「仍要运行」
          </p>
        </div>

        <div className="grid gap-6 rounded-2xl border border-[var(--border-base)] bg-[var(--bg-panel)] p-8 text-center" data-testid="download-mac">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <Apple className="h-7 w-7" />
          </span>
          <div className="grid gap-1">
            <h2 className="text-xl font-semibold">Mac 版</h2>
            <p className="text-sm text-[var(--text-muted)]">
              macOS 11 及以上{release?.version ? ` · 最新版本 ${release.version}` : ''}
            </p>
          </div>
          {release === null ? (
            <div className="mx-auto h-12 w-56 animate-pulse rounded-xl bg-[var(--bg-panel-soft)]" />
          ) : release.macArm64 || release.macX64 ? (
            <div className="grid justify-items-center gap-3">
              <div className="flex flex-wrap justify-center gap-3">
                {release.macArm64 ? (
                  <a href={release.macArm64} rel="noopener" className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--primary)] px-6 font-semibold text-white transition hover:bg-[var(--primary-hover)]">
                    <Download className="h-4 w-4" /> Apple 芯片（M1 / M2 / M3 / M4）
                  </a>
                ) : null}
                {release.macX64 ? (
                  <a href={release.macX64} rel="noopener" className="inline-flex h-12 items-center gap-2 rounded-xl border border-[var(--primary)] px-6 font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-soft)]">
                    <Download className="h-4 w-4" /> Intel 芯片
                  </a>
                ) : null}
              </div>
              <p className="text-xs text-[var(--text-muted)]">不知道是哪种芯片：点屏幕左上角苹果图标 →「关于本机」，看「芯片」一栏</p>
              <div className="mx-auto max-w-xl rounded-xl bg-[var(--bg-panel-soft)] p-4 text-left text-sm leading-relaxed text-[var(--text-secondary)]">
                <p className="font-medium text-[var(--text-main)]">第一次打开提示「无法验证开发者」？</p>
                <p className="mt-1">打开 .dmg，把 Klipmill 拖进「应用程序」。第一次打开如被拦下，到「系统设置 → 隐私与安全性」，在下方点「仍要打开」即可，之后不会再提示。新版本需要在这里重新下载安装。</p>
              </div>
            </div>
          ) : (
            <p className="mx-auto max-w-md text-sm text-[var(--text-secondary)]">
              Mac 版即将上线{release.support ? `，如需提前获取请联系客服：${release.support}` : '，请联系客服获取。'}
            </p>
          )}
        </div>

        <div className="grid gap-6 rounded-2xl border border-[var(--border-base)] bg-[var(--bg-panel)] p-8 text-center" data-testid="download-android">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <Smartphone className="h-7 w-7" />
          </span>
          <div className="grid gap-1">
            <h2 className="text-xl font-semibold">安卓手机版</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Android 8.0 及以上 · 和电脑登录同一账号，数据自动同步{release?.androidVersion ? ` · 最新版本 ${release.androidVersion}` : ''}
            </p>
          </div>
          {release === null ? (
            <div className="mx-auto h-12 w-56 animate-pulse rounded-xl bg-[var(--bg-panel-soft)]" />
          ) : release.androidUrl ? (
            <div className="grid justify-items-center gap-4">
              {androidQr ? (
                <img src={androidQr} alt="扫码下载安卓 App" className="h-40 w-40 rounded-xl border border-[var(--border-base)] bg-white p-2" />
              ) : null}
              <p className="text-sm text-[var(--text-secondary)]">用手机浏览器扫码下载，或在手机上点下面的按钮</p>
              <a
                href={release.androidUrl}
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-[var(--primary)] px-8 font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-soft)]"
                rel="noopener"
              >
                <Download className="h-4 w-4" /> 下载安卓 App
              </a>
              <p className="text-xs text-[var(--text-muted)]">安装时如提示「未知来源」，请在手机设置里允许浏览器安装应用</p>
            </div>
          ) : (
            <p className="mx-auto max-w-md text-sm text-[var(--text-secondary)]">
              安卓 App 即将上线{release.support ? `，如需提前获取请联系客服：${release.support}` : '，请联系客服获取。'}
            </p>
          )}
        </div>

        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="grid gap-2 rounded-2xl border border-[var(--border-base)] p-5">
              <span className="text-sm font-semibold text-[var(--primary)]">第 {index + 1} 步</span>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-[var(--text-secondary)]">{step.desc}</p>
            </li>
          ))}
        </ol>

        <p className="text-center text-sm text-[var(--text-muted)]">
          想先开通会员？
          <Link href="/login?mode=register&next=/account/buy" className="ml-1 inline-flex items-center gap-1 font-medium text-[var(--primary)] hover:underline">
            <LogIn className="h-3.5 w-3.5" /> 注册并购买
          </Link>
        </p>
      </section>
    </SiteShell>
  )
}
