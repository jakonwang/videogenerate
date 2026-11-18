'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Plus, Users, X } from 'lucide-react'

import type { CloudUserRole } from '@shared/cloud/types'
import {
  AdminAvatar,
  AdminError,
  AdminField,
  AdminLoading,
  AdminNotice,
  AdminPage,
  AdminPageHeader,
  AdminPager,
  AdminPanel,
  AdminSearch,
  AdminTable,
  AdminTag,
  formatDateTime,
  roleLabel,
  selectClass,
  useAdminData,
} from '@/components/admin/admin-ui'
import { Button, Input } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'

function membershipTag(user: { role: string; unlimited: boolean; planExpiresAt: number | null }) {
  if (user.role === 'super_admin' || user.unlimited) return <AdminTag tone="info">不受限</AdminTag>
  if (user.planExpiresAt && user.planExpiresAt > Date.now()) return <AdminTag tone="success">至 {formatDateTime(user.planExpiresAt).slice(0, 10)}</AdminTag>
  if (user.planExpiresAt) return <AdminTag tone="danger">已过期</AdminTag>
  return <AdminTag>未开通</AdminTag>
}

export default function AdminUsersPage() {
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState({ keyword: '', status: '', role: '', page: 1 })
  const [showCreate, setShowCreate] = useState(false)
  const [notice, setNotice] = useState('')
  const users = useAdminData(() => adminClient.admin.listUsers(query), [query])
  const plans = useAdminData(() => adminClient.admin.listPlans(), [])

  const [form, setForm] = useState({ account: '', password: '', displayName: '', role: 'user' as CloudUserRole, planCode: '', days: '' })
  const [formError, setFormError] = useState('')
  const [creating, setCreating] = useState(false)

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    setCreating(true)
    setFormError('')
    try {
      const detail = await adminClient.admin.createUser({
        account: form.account,
        password: form.password,
        displayName: form.displayName || undefined,
        role: form.role,
        planCode: form.planCode || undefined,
        days: form.days ? Number(form.days) : undefined,
      })
      setNotice(`已创建账号 ${detail.user.account}`)
      setShowCreate(false)
      setForm({ account: '', password: '', displayName: '', role: 'user', planCode: '', days: '' })
      await users.reload()
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={Users}
        title="用户管理"
        description="查看会员状态与设备，手动开通、延期或停用账号"
        actions={
          <Button onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? <X size={15} /> : <Plus size={15} />} {showCreate ? '取消' : '新建账号'}
          </Button>
        }
      />
      {notice ? <AdminNotice>{notice}</AdminNotice> : null}

      {showCreate ? (
        <AdminPanel icon={Plus} title="新建账号" subtitle="可直接开通套餐，适合线下成交或赠送">
          <form onSubmit={create} className="grid gap-3">
            <div className="admin-form-grid">
              <AdminField label="账号" hint="手机号或邮箱">
                <Input value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} required />
              </AdminField>
              <AdminField label="初始密码" hint="至少 8 位">
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required />
              </AdminField>
              <AdminField label="昵称">
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
              </AdminField>
              <AdminField label="角色" hint="管理员只能由超级管理员创建">
                <select className={selectClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as CloudUserRole })}>
                  <option value="user">用户</option>
                  <option value="admin">管理员</option>
                  <option value="super_admin">超级管理员（不受限）</option>
                </select>
              </AdminField>
              <AdminField label="开通套餐">
                <select className={selectClass} value={form.planCode} onChange={(e) => setForm({ ...form, planCode: e.target.value })}>
                  <option value="">不开通</option>
                  {plans.data?.plans.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="天数" hint="留空按套餐天数，0 为永久">
                <Input type="number" min={0} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
              </AdminField>
            </div>
            <div className="admin-form-actions">
              <Button type="submit" disabled={creating}>
                {creating ? '创建中…' : '创建账号'}
              </Button>
              {formError ? <span className="vg-field__error">{formError}</span> : null}
            </div>
          </form>
        </AdminPanel>
      ) : null}

      <AdminPanel flush>
        <form
          className="admin-filters"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery({ ...query, keyword, page: 1 })
          }}
        >
          <AdminSearch value={keyword} onChange={setKeyword} placeholder="搜索账号、昵称或用户 ID" />
          <select className="vg-select" value={query.status} onChange={(e) => setQuery({ ...query, status: e.target.value, page: 1 })}>
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="disabled">已停用</option>
          </select>
          <select className="vg-select" value={query.role} onChange={(e) => setQuery({ ...query, role: e.target.value, page: 1 })}>
            <option value="">全部角色</option>
            <option value="user">用户</option>
            <option value="admin">管理员</option>
            <option value="super_admin">超级管理员</option>
          </select>
          <Button type="submit" variant="secondary">
            搜索
          </Button>
        </form>
        {users.error ? (
          <div className="p-4">
            <AdminError message={users.error} onRetry={() => void users.reload()} />
          </div>
        ) : null}
        {users.loading && !users.data ? <AdminLoading /> : null}
        {users.data ? (
          <>
            <AdminTable head={['账号', '角色', '会员', '状态', '注册时间', '最近登录']} empty={!users.data.items.length} emptyText="没有符合条件的用户">
              {users.data.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <AdminAvatar name={u.displayName || u.account} />
                      <span className="min-w-0">
                        <Link className="admin-link" href={`/admin/users/${u.id}`}>
                          {u.account}
                        </Link>
                        {u.displayName && u.displayName !== u.account ? <span className="admin-sub">{u.displayName}</span> : null}
                      </span>
                    </div>
                  </td>
                  <td className="text-[var(--theme-text-secondary)]">{roleLabel(u.role)}</td>
                  <td>{membershipTag(u)}</td>
                  <td>
                    {u.status === 'active' ? (
                      <AdminTag tone="success" dot>
                        正常
                      </AdminTag>
                    ) : (
                      <AdminTag tone="danger" dot>
                        已停用
                      </AdminTag>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-[var(--theme-text-muted)]">{formatDateTime(u.createdAt)}</td>
                  <td className="whitespace-nowrap text-[var(--theme-text-muted)]">{formatDateTime(u.lastLoginAt)}</td>
                </tr>
              ))}
            </AdminTable>
            <AdminPager page={users.data.page} pageSize={users.data.pageSize} total={users.data.total} onChange={(page) => setQuery({ ...query, page })} />
          </>
        ) : null}
      </AdminPanel>
    </AdminPage>
  )
}
