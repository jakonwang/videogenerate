'use client'

import { useState } from 'react'
import { KeyRound, LoaderCircle } from 'lucide-react'

import { AdminField, AdminNotice, AdminPage, AdminPageHeader, AdminPanel } from '@/components/admin/admin-ui'
import { Button, Input } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'

/** 修改管理员密码。forced：首次部署自动创建的账号，改密码前不能使用后台 */
export function AdminPasswordPanel({ forced, onDone, onCancel }: { forced?: boolean; onDone: () => void; onCancel?: () => void }) {
  const [form, setForm] = useState({ old: '', next: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (form.next !== form.confirm) {
      setError('两次输入的新密码不一致')
      return
    }
    setBusy(true)
    try {
      await adminClient.changePassword(form.old, form.next)
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={KeyRound}
        title={forced ? '请先修改初始密码' : '修改密码'}
        description={forced ? '这是部署时自动创建的管理员账号，改成你自己的密码后才能使用后台。' : '修改后，其它电脑和浏览器上的登录会全部退出。'}
      />
      <div className="max-w-[440px]">
        <AdminPanel icon={KeyRound} title="新密码">
          <form onSubmit={submit} className="grid gap-4">
            {forced ? <AdminNotice tone="warning">初始密码在服务器数据目录的 initial-admin-password.txt 里（也打印在服务日志中），改完后该文件会自动删除。</AdminNotice> : null}
            <AdminField label={forced ? '初始密码' : '当前密码'}>
              <Input type="password" value={form.old} onChange={(e) => setForm({ ...form, old: e.target.value })} autoComplete="current-password" required className="!h-10" />
            </AdminField>
            <AdminField label="新密码" hint="至少 8 位，不能和原密码相同">
              <Input type="password" minLength={8} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} autoComplete="new-password" required className="!h-10" />
            </AdminField>
            <AdminField label="再输一次新密码">
              <Input type="password" minLength={8} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" required className="!h-10" />
            </AdminField>
            {error ? <div className="vg-field__error">{error}</div> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? <LoaderCircle size={16} className="vg-spin" /> : null} 保存新密码
              </Button>
              {!forced && onCancel ? (
                <Button type="button" variant="ghost" onClick={onCancel}>
                  取消
                </Button>
              ) : null}
            </div>
          </form>
        </AdminPanel>
      </div>
    </AdminPage>
  )
}
