'use client'

import { useMutation } from '@tanstack/react-query'
import { ArrowRight, LockKeyhole, MonitorPlay, ShieldCheck, Smartphone, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiClient, getSessionToken, setSessionToken } from '@/lib/api-client'
import { useSessionStore } from '@/store/session-store'

const valuePoints = [
  {
    title: '任务驱动工作台',
    copy: '围绕每一次视频任务精细分析，从脚本、素材、分镜到成片生成，形成不可或缺的流程化自动化。',
    icon: ShieldCheck,
  },
  {
    title: '公开站与工作台分层',
    copy: '产品介绍、定价和下载保留在公开站，登录后的工作台只负责执行与协同。',
    icon: MonitorPlay,
  },
  {
    title: '桌面客户端协同执行',
    copy: '帮助创作者与团队依赖稳定的客户端，Web 端与移动端互通，任务查看和状态追踪。',
    icon: MonitorPlay,
  },
] as const

function BrandMark() {
  return (
    <div className="relative h-12 w-12 rounded-2xl bg-[linear-gradient(160deg,#6d57ff,#5b44ff)] shadow-[0_18px_44px_rgba(91,68,255,0.34)]">
      <span className="absolute left-[14px] top-[10px] h-6 w-6 rotate-45 rounded-[8px] border-[3px] border-white/95 border-l-transparent border-b-transparent" />
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const setSession = useSessionStore((state) => state.setSession)
  const ready = useSessionStore((state) => state.ready)
  const token = useSessionStore((state) => state.token)
  const [phone, setPhone] = useState('13800138000')
  const [code, setCode] = useState('123456')
  const [displayName, setDisplayName] = useState('测试用户')
  const [nextTarget, setNextTarget] = useState('/workspace')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setNextTarget(params.get('next') || '/workspace')
  }, [])

  useEffect(() => {
    const localToken = getSessionToken()
    if (ready && (token || localToken)) {
      router.replace(nextTarget)
    }
  }, [nextTarget, ready, router, token])

  const loginMutation = useMutation({
    mutationFn: () => apiClient.login({ phone, code, displayName }),
    onSuccess: async (result) => {
      setSessionToken(result.token)
      setSession({
        token: result.token,
        user: result.user,
        subscription: result.subscription,
        wallet: result.wallet,
      })
      router.push(nextTarget)
    },
  })

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040814] px-8 py-8 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(91,68,255,0.16),transparent_30%),radial-gradient(circle_at_82%_80%,rgba(87,107,255,0.12),transparent_28%),linear-gradient(180deg,#050915_0%,#040813_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.015),transparent_28%,transparent_72%,rgba(255,255,255,0.012))]" />
      <div className="pointer-events-none absolute bottom-[-48px] left-[-120px] h-[380px] w-[1180px] bg-[radial-gradient(circle_at_60%_40%,rgba(106,86,255,0.12),transparent_36%),radial-gradient(circle_at_18%_60%,rgba(38,63,156,0.16),transparent_26%)] opacity-90" />
      <div className="pointer-events-none absolute bottom-[118px] left-[64px] h-[198px] w-[930px] bg-[radial-gradient(circle_at_center,rgba(96,76,255,0.16),transparent_58%)] blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[1440px] flex-col">
        <header className="flex items-center justify-between pb-7">
          <div className="flex items-center gap-4">
            <BrandMark />
            <div>
              <div className="flex items-center gap-3">
                <strong className="text-[25px] font-semibold tracking-[-0.03em] text-white">VideoGen</strong>
                <span className="rounded-full bg-violet-500/22 px-2.5 py-1 text-[12px] font-semibold text-violet-100">AI</span>
              </div>
              <p className="mt-1 text-[13px] text-slate-400">AI 视频生产工作台</p>
            </div>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_460px]">
          <section className="grid gap-8 pr-4">
            <div className="grid gap-4">
              <span className="text-[13px] font-semibold uppercase tracking-[0.28em] text-violet-300">VIDEOGEN WORKSPACE ACCESS</span>
              <div className="grid gap-4">
                <h1 className="max-w-[900px] text-[74px] font-semibold leading-[0.98] tracking-[-0.07em] text-white xl:text-[80px]">
                  进入 <span className="text-violet-400">AI</span> 视频生产工作台
                </h1>
                <p className="max-w-[760px] text-[18px] leading-[2.05] text-slate-300">
                  登录后可进入爆款复刻、任务中心、模板库、素材库、直播切片和生产中心，分层、工作台及数据看板等核心功能。
                </p>
              </div>
            </div>

            <div className="grid gap-7 md:grid-cols-3">
              {valuePoints.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.title} className="grid gap-3.5">
                    <div className="grid h-16 w-16 place-items-center rounded-full bg-[linear-gradient(180deg,rgba(103,83,255,0.24),rgba(91,68,255,0.1))] text-violet-300 shadow-[0_12px_32px_rgba(78,63,176,0.18)]">
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="grid gap-2.5">
                      <strong className="text-[17px] font-semibold leading-8 text-white">{item.title}</strong>
                      <p className="max-w-[280px] text-[14px] leading-7 text-slate-400">{item.copy}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-8 pt-1 text-[16px] font-medium text-violet-300">
              <Link href="/product" className="transition hover:text-white">
                查看产品介绍
              </Link>
              <span className="text-slate-700">/</span>
              <Link href="/download" className="inline-flex items-center gap-2 transition hover:text-white">
                下载桌面客户端
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>

          <section className="flex items-center justify-center lg:justify-end">
            <Card className="w-full max-w-[456px] rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,18,30,0.97),rgba(9,14,24,0.985))] px-10 py-9 shadow-[0_28px_72px_rgba(2,6,16,0.44)]">
              <div className="grid gap-6">
                <div className="grid gap-3.5">
                  <span className="text-[13px] font-semibold uppercase tracking-[0.26em] text-violet-300">SECURE ACCESS</span>
                  <div className="grid gap-3">
                    <h2 className="text-[34px] font-semibold tracking-[-0.05em] text-white">登录工作台</h2>
                    <p className="text-[15px] leading-8 text-slate-400">
                      请输入系统分配的账号进行登录，原始初始账号由管理员在系统内分配。
                    </p>
                  </div>
                </div>

                <div className="grid gap-4.5">
                  <label className="grid gap-3">
                    <span className="text-[15px] font-medium text-white">手机号</span>
                    <div className="flex h-14 items-center gap-3 rounded-[17px] border border-white/10 bg-white/[0.03] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                      <Smartphone className="h-5 w-5 text-slate-500" />
                      <Input
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="请输入手机号"
                        className="h-auto border-0 bg-transparent px-0 text-[15px] text-white shadow-none placeholder:text-slate-500 focus-visible:ring-0"
                      />
                    </div>
                  </label>

                  <label className="grid gap-3">
                    <span className="text-[15px] font-medium text-white">验证码</span>
                    <div className="flex h-14 items-center gap-3 rounded-[17px] border border-white/10 bg-white/[0.03] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                      <LockKeyhole className="h-5 w-5 text-slate-500" />
                      <Input
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        placeholder="请输入验证码"
                        className="h-auto border-0 bg-transparent px-0 text-[15px] text-white shadow-none placeholder:text-slate-500 focus-visible:ring-0"
                      />
                    </div>
                  </label>

                  <label className="grid gap-3">
                    <span className="text-[15px] font-medium text-white">显示名称</span>
                    <div className="flex h-14 items-center gap-3 rounded-[17px] border border-white/10 bg-white/[0.03] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                      <UserRound className="h-5 w-5 text-slate-500" />
                      <Input
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="请输入显示名称"
                        className="h-auto border-0 bg-transparent px-0 text-[15px] text-white shadow-none placeholder:text-slate-500 focus-visible:ring-0"
                      />
                    </div>
                  </label>
                </div>

                <Button
                  size="lg"
                  className="h-16 rounded-[18px] bg-[linear-gradient(90deg,#614bff,#755cff)] text-[16px] font-semibold shadow-[0_18px_38px_rgba(98,75,255,0.34)]"
                  disabled={!phone.trim() || !code.trim() || !displayName.trim() || loginMutation.isPending}
                  onClick={() => loginMutation.mutate()}
                >
                  <LockKeyhole className="h-5 w-5" />
                  {loginMutation.isPending ? '登录中...' : '进入工作台'}
                  <ArrowRight className="h-5 w-5" />
                </Button>

                <div className="grid gap-1.5 text-[14px] leading-7 text-slate-400">
                  <span>默认手机号：13800138000</span>
                  <span>默认验证码：123456</span>
                </div>

                {loginMutation.error ? (
                  <div className="rounded-[16px] border border-rose-400/18 bg-rose-500/10 px-4 py-3.5 text-[14px] text-rose-100">
                    {loginMutation.error.message}
                  </div>
                ) : null}
              </div>
            </Card>
          </section>
        </div>

        <footer className="flex items-end justify-between pt-6 text-[13px] text-slate-500">
          <button
            type="button"
            aria-label="theme-toggle-placeholder"
            className="grid h-11 w-11 place-items-center rounded-full border border-white/8 bg-white/[0.03] text-slate-300"
          >
            ✦
          </button>
          <span>© 2024 VideoGen AI. All rights reserved.</span>
          <span className="w-11" />
        </footer>
      </div>
    </main>
  )
}
