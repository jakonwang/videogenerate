'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'

import { BrandMark } from '@/components/site/site-shell'
import { setUserToken, useCloudUser, userClient } from '@/lib/cloud-user'
import { cn } from '@/lib/utils'

function safeNext(raw: string | null) {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login') && !raw.startsWith('/admin') ? raw : '/account'
}

const inputClass =
  'h-12 w-full rounded-xl border border-[var(--border-base)] bg-[var(--bg-input)] px-4 text-[15px] text-[var(--text-main)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--primary-border)] focus:shadow-[0_0_0_3px_var(--primary-soft)]'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get('next'))
  const { load, setMe } = useCloudUser()
  const [mode, setMode] = useState<'login' | 'register'>(params.get('mode') === 'register' ? 'register' : 'login')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void load().then((me) => {
      if (me) router.replace(next)
    })
  }, [load, next, router])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (mode === 'register' && password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setSubmitting(true)
    try {
      const result =
        mode === 'login' ? await userClient.login({ account, password, client: 'web' }) : await userClient.register({ account, password })
      setUserToken(result.sessionToken)
      setMe(await userClient.me())
      router.replace(next)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid w-full max-w-[400px] gap-8">
      <div className="grid gap-2">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{mode === 'login' ? '登录' : '注册账号'}</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">
          {mode === 'login' ? '与客户端使用同一个账号。' : '注册后可购买会员或使用兑换码，客户端直接用这个账号登录。'}
        </p>
      </div>

      <div className="grid grid-cols-2 rounded-xl border border-[var(--border-base)] p-1" role="tablist">
        {(['login', 'register'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m)
              setError('')
            }}
            className={cn('h-10 rounded-lg text-sm font-medium transition', mode === m ? 'bg-[var(--bg-panel)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]')}
          >
            {m === 'login' ? '登录' : '注册'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-2 text-sm font-medium">
          手机号或邮箱
          <input className={inputClass} value={account} onChange={(e) => setAccount(e.target.value)} autoComplete="username" inputMode="email" required />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          密码
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 8 : undefined}
            required
          />
          {mode === 'register' ? <span className="text-xs font-normal text-[var(--text-muted)]">至少 8 位</span> : null}
        </label>
        {mode === 'register' ? (
          <label className="grid gap-2 text-sm font-medium">
            确认密码
            <input className={inputClass} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </label>
        ) : null}
        {error ? <p className="rounded-lg bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] text-[15px] font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-60"
        >
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          {mode === 'login' ? '登录' : '注册并登录'}
        </button>
      </form>

      {mode === 'login' ? <p className="text-sm text-[var(--text-muted)]">忘记密码？请联系客服重置。</p> : null}
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen bg-[var(--bg-root)] text-[var(--text-main)] lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden border-r border-[var(--border-base)] bg-[var(--bg-shell)] p-12 lg:flex lg:flex-col">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark size={32} />
          <span className="text-[17px] font-semibold">TiktokCut</span>
        </Link>
        <div className="my-auto grid max-w-[440px] gap-5">
          <h2 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.03em]">一条爆款，批量变成你的带货视频</h2>
          <ul className="grid gap-3 text-[15px] text-[var(--text-secondary)]">
            <li>· 自动拆脚本、出分镜、合成成片</li>
            <li>· 模型与 Key 统一配置，登录即用</li>
            <li>· 微信 / 支付宝扫码开通，时长可叠加</li>
          </ul>
        </div>
        <p className="text-sm text-[var(--text-muted)]">© {new Date().getFullYear()} TiktokCut</p>
      </aside>
      <main className="flex flex-col px-4 py-8 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 lg:hidden">
          <BrandMark size={28} />
          <span className="font-semibold">TiktokCut</span>
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
