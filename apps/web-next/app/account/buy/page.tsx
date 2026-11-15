'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { Check, CheckCircle2, LoaderCircle, X } from 'lucide-react'

import type { CloudOrder, CloudPayChannel, CloudPlan } from '@shared/cloud/types'
import { AccountPageTitle, Notice } from '@/components/account-center/account-shell'
import { formatDate, formatYuan, useCloudUser, userClient } from '@/lib/cloud-user'
import { cn } from '@/lib/utils'

const CHANNEL_LABEL: Record<CloudPayChannel, string> = { wechat: '微信支付', alipay: '支付宝', mock: '模拟支付（测试）' }

function BuyContent() {
  const params = useSearchParams()
  const router = useRouter()
  const { me, load } = useCloudUser()
  const [plans, setPlans] = useState<CloudPlan[]>([])
  const [channels, setChannels] = useState<CloudPayChannel[]>([])
  const [selected, setSelected] = useState('')
  const [channel, setChannel] = useState<CloudPayChannel | ''>('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [order, setOrder] = useState<CloudOrder | null>(null)
  const [qr, setQr] = useState('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    userClient
      .listPlans()
      .then((result) => {
        setPlans(result.plans)
        setChannels(result.channels)
        const wanted = params.get('plan')
        setSelected(result.plans.find((p) => p.code === wanted)?.code ?? result.plans[1]?.code ?? result.plans[0]?.code ?? '')
        setChannel(result.channels.find((c) => c !== 'mock') ?? result.channels[0] ?? '')
      })
      .catch((err) => setError((err as Error).message))
  }, [params])

  const stop = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])

  const poll = async (orderNo: string) => {
    try {
      const { order: next } = await userClient.getOrder(orderNo)
      setOrder(next)
      if (next.status !== 'pending') {
        stop()
        if (next.status === 'paid') void load(true)
      }
    } catch {
      // 网络抖动时继续轮询
    }
  }

  const create = async () => {
    if (!selected || !channel) return
    setCreating(true)
    setError('')
    try {
      const { order: created } = await userClient.createOrder({ planCode: selected, channel })
      setOrder(created)
      setQr(await QRCode.toDataURL(created.qrContent, { width: 240, margin: 1 }))
      stop()
      timer.current = setInterval(() => void poll(created.orderNo), 2500)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const mockPay = async () => {
    if (!order) return
    try {
      const { order: paid } = await userClient.mockPay(order.orderNo)
      setOrder(paid)
      stop()
      void load(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const close = () => {
    stop()
    setOrder(null)
    setQr('')
  }

  const plan = plans.find((p) => p.code === selected)
  const currentExpire = me?.entitlement.active && !me.entitlement.unlimited ? me.entitlement.expiresAt : null

  return (
    <div>
      <AccountPageTitle title="购买续费" desc="扫码支付，到账自动开通；会员期内续费时长自动叠加。" />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {me?.entitlement.unlimited ? <Notice tone="info">你的账号是不受限账号，无需购买。</Notice> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-3">
          {plans.map((p) => (
            <button
              key={p.code}
              type="button"
              onClick={() => setSelected(p.code)}
              className={cn(
                'flex items-center gap-4 rounded-2xl border bg-[var(--bg-panel)] p-5 text-left transition',
                selected === p.code ? 'border-[var(--primary)] shadow-[0_0_0_3px_var(--primary-soft)]' : 'border-[var(--border-base)] hover:border-[var(--border-strong)]',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  selected === p.code ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-[var(--border-strong)]',
                )}
              >
                {selected === p.code ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className="grid flex-1 gap-0.5">
                <span className="font-semibold">{p.name}</span>
                <span className="text-sm text-[var(--text-muted)]">
                  {p.days === 0 ? '永久' : `${p.days} 天`} · {p.maxDevices === 0 ? '不限设备' : `${p.maxDevices} 台电脑`}
                </span>
              </span>
              <span className="text-xl font-semibold tabular-nums">{formatYuan(p.amountFen)}</span>
            </button>
          ))}
          {!plans.length && !error ? (
            <div className="flex justify-center py-10 text-[var(--text-muted)]">
              <LoaderCircle className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
        </div>

        <aside className="grid content-start gap-4 rounded-2xl border border-[var(--border-base)] bg-[var(--bg-panel)] p-5">
          <h2 className="font-semibold">确认订单</h2>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>套餐</span>
              <span className="text-[var(--text-main)]">{plan?.name ?? '—'}</span>
            </div>
            {plan && currentExpire ? (
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>续费后到期</span>
                <span className="text-[var(--text-main)]">{plan.days === 0 ? '永久' : formatDate(currentExpire + plan.days * 86400000)}</span>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between border-t border-[var(--border-base)] pt-3">
              <span className="text-[var(--text-secondary)]">应付</span>
              <span className="text-2xl font-semibold tabular-nums">{plan ? formatYuan(plan.amountFen) : '—'}</span>
            </div>
          </div>
          {channels.length ? (
            <div className="grid gap-2">
              <span className="text-sm text-[var(--text-secondary)]">支付方式</span>
              <div className="grid gap-2">
                {channels.map((c) => (
                  <label
                    key={c}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm',
                      channel === c ? 'border-[var(--primary)]' : 'border-[var(--border-base)]',
                    )}
                  >
                    <input type="radio" name="channel" checked={channel === c} onChange={() => setChannel(c)} className="accent-[var(--primary)]" />
                    {CHANNEL_LABEL[c]}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">暂未开通在线支付，请联系客服或使用兑换码。</p>
          )}
          <button
            type="button"
            disabled={!plan || !channel || creating || me?.entitlement.unlimited}
            onClick={() => void create()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {creating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            去支付
          </button>
        </aside>
      </div>

      {order ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="relative grid w-full max-w-[360px] justify-items-center gap-4 rounded-2xl border border-[var(--border-base)] bg-[var(--bg-panel)] p-6 text-center">
            <button type="button" aria-label="关闭" onClick={close} className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)]">
              <X className="h-4 w-4" />
            </button>
            {order.status === 'paid' ? (
              <>
                <CheckCircle2 className="h-14 w-14 text-[var(--success)]" />
                <div className="grid gap-1">
                  <h3 className="text-lg font-semibold">支付成功</h3>
                  <p className="text-sm text-[var(--text-secondary)]">{order.planName} 已开通，客户端重新打开或刷新即可生效。</p>
                </div>
                <button type="button" onClick={() => router.push('/account')} className="inline-flex h-10 items-center rounded-xl bg-[var(--primary)] px-6 text-sm font-semibold text-white">
                  返回概览
                </button>
              </>
            ) : order.status === 'closed' ? (
              <>
                <h3 className="text-lg font-semibold">订单已过期</h3>
                <p className="text-sm text-[var(--text-secondary)]">请关闭后重新下单。</p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold">
                  {CHANNEL_LABEL[order.channel]}扫码支付 {formatYuan(order.amountFen)}
                </h3>
                <div className="rounded-xl bg-white p-2">{qr ? <img src={qr} alt="支付二维码" width={240} height={240} /> : null}</div>
                <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> 支付完成后自动开通
                </p>
                <span className="font-mono text-xs text-[var(--text-muted)]">{order.orderNo}</span>
                {order.channel === 'mock' ? (
                  <button type="button" onClick={() => void mockPay()} className="text-sm font-medium text-[var(--primary)] hover:underline">
                    模拟支付成功（测试环境）
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function BuyPage() {
  return (
    <Suspense>
      <BuyContent />
    </Suspense>
  )
}
