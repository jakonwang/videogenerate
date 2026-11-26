'use client'

import { useState } from 'react'
import { FileClock } from 'lucide-react'

import { AdminError, AdminLoading, AdminPage, AdminPageHeader, AdminPager, AdminPanel, AdminSearch, AdminTable, AdminTag, formatDateTime, useAdminData } from '@/components/admin/admin-ui'
import { Button } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'

const ACTION_LABELS: Record<string, { label: string; tone: 'success' | 'danger' | 'warning' | 'info' | 'violet' | 'idle' }> = {
  'admin.login': { label: '后台登录', tone: 'idle' },
  'admin.user.create': { label: '创建账号', tone: 'info' },
  'admin.user.update': { label: '修改用户', tone: 'info' },
  'admin.device.revoke': { label: '解绑设备', tone: 'warning' },
  'admin.plan.create': { label: '新建套餐', tone: 'violet' },
  'admin.plan.update': { label: '修改套餐', tone: 'violet' },
  'admin.order.refund': { label: '标记退款', tone: 'danger' },
  'admin.redeem.generate': { label: '生成兑换码', tone: 'violet' },
  'admin.redeem.status': { label: '兑换码状态', tone: 'warning' },
  'admin.config.update': { label: '修改配置', tone: 'warning' },
  'admin.config.delete': { label: '删除配置', tone: 'danger' },
  'admin.software.update': { label: '修改软件设置', tone: 'warning' },
  'admin.software.reveal_secret': { label: '查看密钥', tone: 'warning' },
  'admin.userdata.view': { label: '查看用户数据', tone: 'violet' },
  'order.paid': { label: '订单到账', tone: 'success' },
  'redeem.use': { label: '使用兑换码', tone: 'success' },
  'device.unbind': { label: '用户解绑设备', tone: 'idle' },
  'user.register': { label: '用户注册', tone: 'idle' },
  'cli.create-admin': { label: '命令行建管理员', tone: 'danger' },
}

export default function AdminAuditPage() {
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState({ keyword: '', page: 1 })
  const logs = useAdminData(() => adminClient.admin.listAudit(query), [query])

  return (
    <AdminPage>
      <AdminPageHeader icon={FileClock} title="操作日志" description="后台操作、订单到账、兑换等关键事件，只增不改" />
      <AdminPanel flush>
        <form
          className="admin-filters"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery({ keyword, page: 1 })
          }}
        >
          <AdminSearch value={keyword} onChange={setKeyword} placeholder="动作、对象或操作人" />
          <Button type="submit" variant="secondary">
            搜索
          </Button>
        </form>
        {logs.error ? (
          <div className="p-4">
            <AdminError message={logs.error} onRetry={() => void logs.reload()} />
          </div>
        ) : null}
        {logs.loading && !logs.data ? <AdminLoading /> : null}
        {logs.data ? (
          <>
            <AdminTable head={['时间', '操作人', '动作', '对象', '详情', 'IP']} empty={!logs.data.items.length} emptyText="暂无日志">
              {logs.data.items.map((log) => {
                const action = ACTION_LABELS[log.action] ?? { label: log.action, tone: 'idle' as const }
                return (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap text-[var(--theme-text-muted)]">{formatDateTime(log.createdAt)}</td>
                    <td>{log.actorAccount || <span className="vg-muted">系统</span>}</td>
                    <td>
                      <AdminTag tone={action.tone}>{action.label}</AdminTag>
                    </td>
                    <td className="admin-mono max-w-[200px] truncate" title={log.target}>
                      {log.target}
                    </td>
                    <td className="admin-mono max-w-[360px] truncate text-[var(--theme-text-muted)]" title={JSON.stringify(log.detail)}>
                      {log.detail === null ? '—' : JSON.stringify(log.detail)}
                    </td>
                    <td className="admin-mono text-[var(--theme-text-muted)]">{log.ip || '—'}</td>
                  </tr>
                )
              })}
            </AdminTable>
            <AdminPager page={logs.data.page} pageSize={logs.data.pageSize} total={logs.data.total} onChange={(page) => setQuery({ ...query, page })} />
          </>
        ) : null}
      </AdminPanel>
    </AdminPage>
  )
}
