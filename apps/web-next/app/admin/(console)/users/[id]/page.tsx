'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, Coins, Crown, Laptop, ReceiptText, ShieldCheck, UserRound } from 'lucide-react'

import { formatFen } from '@shared/cloud/client'
import type { CloudAdminUserPatch, CloudUserRole } from '@shared/cloud/types'
import { BILLING_CAPABILITY_LABELS, CREDIT_LEDGER_LABELS } from '@shared/cloud/billing'
import {
  AdminAvatar,
  AdminError,
  AdminField,
  AdminLoading,
  AdminNotice,
  AdminPage,
  AdminPanel,
  AdminTable,
  AdminTag,
  OrderStatusTag,
  PERMANENT_AT,
  channelLabel,
  formatDateTime,
  roleLabel,
  selectClass,
  useAdminData,
} from '@/components/admin/admin-ui'
import { Button, Input, Switch } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'

function toDateInput(ms: number | null) {
  if (!ms || ms >= PERMANENT_AT) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>()
  const userId = String(params.id)
  const detail = useAdminData(() => adminClient.admin.getUser(userId), [userId])
  const plans = useAdminData(() => adminClient.admin.listPlans(), [])
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [extendDays, setExtendDays] = useState('30')
  const [expireDate, setExpireDate] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [creditDelta, setCreditDelta] = useState('')
  const [creditNote, setCreditNote] = useState('')

  const adjustCredits = async () => {
    const delta = Math.trunc(Number(creditDelta))
    if (!delta) return
    if (!window.confirm(`${delta > 0 ? '增加' : '扣减'} ${Math.abs(delta)} 点，原因：${creditNote}。确定？`)) return
    setBusy(true)
    setNotice(null)
    try {
      detail.setData(await adminClient.admin.adjustCredits(userId, delta, creditNote))
      setNotice({ tone: 'success', text: `点数已${delta > 0 ? '增加' : '扣减'} ${Math.abs(delta)}` })
      setCreditDelta('')
      setCreditNote('')
    } catch (err) {
      setNotice({ tone: 'danger', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const patch = async (input: CloudAdminUserPatch, success: string) => {
    setBusy(true)
    setNotice(null)
    try {
      detail.setData(await adminClient.admin.patchUser(userId, input))
      setNotice({ tone: 'success', text: success })
    } catch (err) {
      setNotice({ tone: 'danger', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const revokeDevice = async (deviceId: string) => {
    if (!window.confirm('解绑后该设备会立即下线，需要重新登录。确定解绑？')) return
    setBusy(true)
    try {
      detail.setData(await adminClient.admin.revokeDevice(userId, deviceId))
      setNotice({ tone: 'success', text: '设备已解绑' })
    } catch (err) {
      setNotice({ tone: 'danger', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const data = detail.data
  const user = data?.user
  const ent = data?.entitlement

  return (
    <AdminPage>
      <div>
        <Link href="/admin/users" className="vg-btn vg-btn--ghost vg-btn--sm -ml-2">
          <ArrowLeft size={14} /> 用户列表
        </Link>
      </div>

      {detail.error ? <AdminError message={detail.error} onRetry={() => void detail.reload()} /> : null}
      {detail.loading && !data ? <AdminLoading rows={6} /> : null}

      {data && user && ent ? (
        <>
          <header className="vg-page-head">
            <AdminAvatar name={user.displayName || user.account} className="!h-10 !w-10 text-base" />
            <div className="vg-page-head__text">
              <h1>
                {user.account}
                {user.status === 'active' ? (
                  <AdminTag tone="success" dot>
                    正常
                  </AdminTag>
                ) : (
                  <AdminTag tone="danger" dot>
                    已停用
                  </AdminTag>
                )}
              </h1>
              <p>
                {roleLabel(user.role)} · ID <span className="admin-mono">{user.id}</span> · 注册于 {formatDateTime(user.createdAt)} · 最近登录 {formatDateTime(user.lastLoginAt)}
              </p>
            </div>
            <div className="vg-page-head__actions">
              {user.status === 'active' ? (
                <Button variant="danger" disabled={busy} onClick={() => window.confirm('停用后该账号所有设备立即下线，确定？') && void patch({ status: 'disabled' }, '账号已停用')}>
                  停用账号
                </Button>
              ) : (
                <Button variant="secondary" disabled={busy} onClick={() => void patch({ status: 'active' }, '账号已启用')}>
                  启用账号
                </Button>
              )}
            </div>
          </header>

          {notice ? <AdminNotice tone={notice.tone}>{notice.text}</AdminNotice> : null}

          <section className="vg-stats">
            <div className="vg-stat">
              <span className="vg-stat__icon">
                <Crown size={17} />
              </span>
              <span className="vg-stat__body">
                <span className="vg-stat__label">会员状态</span>
                <span className="vg-stat__value text-[16px]">{ent.unlimited ? '不受限' : ent.active ? ent.planName ?? '有效' : '无有效会员'}</span>
              </span>
            </div>
            <div className="vg-stat">
              <span className="vg-stat__icon vg-stat__icon--blue">
                <ReceiptText size={17} />
              </span>
              <span className="vg-stat__body">
                <span className="vg-stat__label">到期时间</span>
                <span className="vg-stat__value text-[16px]">{ent.unlimited ? '不限' : formatDateTime(ent.expiresAt)}</span>
              </span>
            </div>
            <div className="vg-stat">
              <span className="vg-stat__icon vg-stat__icon--violet">
                <Laptop size={17} />
              </span>
              <span className="vg-stat__body">
                <span className="vg-stat__label">设备</span>
                <span className="vg-stat__value text-[16px]">
                  {data.devices.filter((d) => d.kind !== 'mobile').length} <small>/ {ent.maxDevices === 0 ? '不限' : ent.maxDevices} 台电脑</small> · {data.devices.filter((d) => d.kind === 'mobile').length} <small>/ {ent.maxMobileDevices === 0 ? '不限' : (ent.maxMobileDevices ?? 1)} 部手机</small>
                </span>
              </span>
            </div>
            <div className="vg-stat">
              <span className="vg-stat__icon vg-stat__icon--amber">
                <ReceiptText size={17} />
              </span>
              <span className="vg-stat__body">
                <span className="vg-stat__label">累计付费</span>
                <span className="vg-stat__value text-[16px]">{formatFen(data.orders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.amountFen, 0))}</span>
              </span>
            </div>
          </section>

          <div className="vg-grid vg-grid--2">
            <AdminPanel icon={Crown} title="会员" subtitle="修改立即生效，客户端下次刷新时同步">
              <div className="grid gap-4">
                <AdminField label="套餐" hint="只切换套餐，不改变到期时间">
                  <select className={selectClass} value={user.planCode ?? ''} disabled={busy} onChange={(e) => void patch({ planCode: e.target.value || null }, '套餐已更新')}>
                    <option value="">无</option>
                    {plans.data?.plans.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </AdminField>
                <AdminField label="延长天数" hint="在当前到期时间上增加，负数为缩短">
                  <div className="flex gap-2">
                    <Input type="number" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} />
                    <Button variant="secondary" disabled={busy || !Number(extendDays)} onClick={() => void patch({ extendDays: Number(extendDays) }, `已延长 ${extendDays} 天`)}>
                      延长
                    </Button>
                  </div>
                </AdminField>
                <AdminField label="直接设置到期日">
                  <div className="flex gap-2">
                    <Input type="date" value={expireDate || toDateInput(user.planExpiresAt)} onChange={(e) => setExpireDate(e.target.value)} />
                    <Button variant="secondary" disabled={busy || !expireDate} onClick={() => void patch({ planExpiresAt: new Date(`${expireDate}T23:59:59`).getTime() }, '到期时间已更新')}>
                      保存
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={() => void patch({ planExpiresAt: PERMANENT_AT }, '已设为永久')}>
                      永久
                    </Button>
                  </div>
                </AdminField>
              </div>
            </AdminPanel>

            <AdminPanel icon={ShieldCheck} title="权限与安全">
              <div className="grid gap-4">
                <AdminField label="角色" hint="超级管理员自动不受限；仅超级管理员可修改">
                  <select className={selectClass} value={user.role} disabled={busy} onChange={(e) => void patch({ role: e.target.value as CloudUserRole }, `角色已改为 ${roleLabel(e.target.value)}`)}>
                    <option value="user">用户</option>
                    <option value="admin">管理员</option>
                    <option value="super_admin">超级管理员</option>
                  </select>
                </AdminField>
                <Switch
                  checked={user.unlimited || user.role === 'super_admin'}
                  disabled={busy || user.role === 'super_admin'}
                  onChange={(v) => void patch({ unlimited: v }, v ? '已设为不受限账号' : '已取消不受限')}
                  label="不受限账号"
                  hint="不看会员到期、不限设备数、全部功能可用"
                />
                <AdminField label="重置密码" hint="至少 8 位，重置后该账号所有设备下线">
                  <div className="flex gap-2">
                    <Input type="password" value={newPassword} autoComplete="new-password" onChange={(e) => setNewPassword(e.target.value)} />
                    <Button
                      variant="secondary"
                      disabled={busy || newPassword.length < 8}
                      onClick={() => void patch({ password: newPassword }, '密码已重置').then(() => setNewPassword(''))}
                    >
                      重置
                    </Button>
                  </div>
                </AdminField>
              </div>
            </AdminPanel>
          </div>

          <AdminPanel icon={Coins} title="点数" subtitle={`当前余额 ${data.credits} 点`}>
            <div className="grid gap-4">
              <div className="admin-form-grid">
                <AdminField label="调整数量" hint="正数加点，负数扣点（最多扣到 0）。仅超级管理员可操作">
                  <Input type="number" step="1" value={creditDelta} onChange={(e) => setCreditDelta(e.target.value)} placeholder="如 100 或 -50" />
                </AdminField>
                <AdminField label="原因" hint="必填，记在流水和操作日志里">
                  <div className="flex gap-2">
                    <Input value={creditNote} maxLength={200} onChange={(e) => setCreditNote(e.target.value)} placeholder="如：补偿生成失败" />
                    <Button variant="secondary" disabled={busy || !Math.trunc(Number(creditDelta)) || !creditNote.trim()} onClick={() => void adjustCredits()}>
                      调整
                    </Button>
                  </div>
                </AdminField>
              </div>
              <AdminTable head={['时间', '类型', { label: '变动', align: 'right' }, { label: '余额', align: 'right' }, '说明']} empty={!data.ledger.length} emptyText="还没有点数变动">
                {data.ledger.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-[var(--theme-text-muted)]">{formatDateTime(e.createdAt)}</td>
                    <td>{CREDIT_LEDGER_LABELS[e.kind] ?? e.kind}</td>
                    <td className={`num font-semibold ${e.delta > 0 ? 'text-[var(--theme-success,#16a34a)]' : ''}`}>{e.delta > 0 ? `+${e.delta}` : e.delta}</td>
                    <td className="num">{e.balance}</td>
                    <td className="text-[var(--theme-text-secondary)]">{[e.note, e.kind === 'charge' || e.kind === 'refund' ? '' : e.ref].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </AdminTable>
            </div>
          </AdminPanel>

          <AdminPanel flush icon={Coins} title="最近生成" subtitle="每次视频 / 图片生成的计费记录（最近 50 条）">
            <AdminTable head={['时间', '类型', '模型', '来源', '计费', '状态', '说明']} empty={!data.holds.length} emptyText="还没有生成记录">
              {data.holds.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap text-[var(--theme-text-muted)]">{formatDateTime(h.createdAt)}</td>
                  <td>{BILLING_CAPABILITY_LABELS[h.capability] ?? h.capability}</td>
                  <td>
                    <span className="admin-mono">{h.model || '—'}</span>
                    <span className="admin-sub">{h.platform || '—'}</span>
                  </td>
                  <td>{{ desktop: '电脑端', web: '网页', mobile: '手机', server: '云端' }[h.client] ?? h.client}{h.feature ? <span className="admin-sub">{h.feature}</span> : null}</td>
                  <td>{h.source === 'credits' ? `${h.points} 点` : { unlimited: '不受限', included: '套餐包含', free: '每月免费' }[h.source] ?? h.source}</td>
                  <td>
                    {h.status === 'released' ? (
                      <AdminTag tone="warning" dot>
                        失败已退回
                      </AdminTag>
                    ) : h.status === 'held' ? (
                      <AdminTag tone="info" dot>
                        生成中
                      </AdminTag>
                    ) : (
                      <AdminTag tone="success" dot>
                        已完成
                      </AdminTag>
                    )}
                  </td>
                  <td className="max-w-[260px] truncate text-[var(--theme-text-secondary)]" title={h.reason}>
                    {h.reason || '—'}
                  </td>
                </tr>
              ))}
            </AdminTable>
          </AdminPanel>

          <AdminPanel flush icon={Laptop} title="绑定设备" subtitle={`${data.devices.length} 台`}>
            <AdminTable head={['设备', '机器码', '客户端版本', '绑定时间', '最近活跃', { label: '', align: 'right' }]} empty={!data.devices.length} emptyText="还没有设备登录过">
              {data.devices.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.name || '—'}
                    <span className="admin-sub">{d.platform || '—'}</span>
                  </td>
                  <td className="admin-mono text-[var(--theme-text-muted)]">{d.machineId.slice(0, 12)}…</td>
                  <td>{d.appVersion || '—'}</td>
                  <td className="whitespace-nowrap text-[var(--theme-text-muted)]">{formatDateTime(d.createdAt)}</td>
                  <td className="whitespace-nowrap text-[var(--theme-text-muted)]">{formatDateTime(d.lastSeenAt)}</td>
                  <td className="num">
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void revokeDevice(d.id)}>
                      解绑
                    </Button>
                  </td>
                </tr>
              ))}
            </AdminTable>
          </AdminPanel>

          <AdminPanel flush icon={UserRound} title="订单" subtitle={`${data.orders.length} 笔`}>
            <AdminTable head={['订单号', '套餐', { label: '金额', align: 'right' }, '渠道', '状态', '支付时间']} empty={!data.orders.length} emptyText="暂无订单">
              {data.orders.map((o) => (
                <tr key={o.orderNo}>
                  <td className="admin-mono">{o.orderNo}</td>
                  <td>{o.planName}</td>
                  <td className="num">{formatFen(o.amountFen)}</td>
                  <td className="text-[var(--theme-text-secondary)]">{channelLabel(o.channel)}</td>
                  <td>
                    <OrderStatusTag status={o.status} />
                  </td>
                  <td className="whitespace-nowrap text-[var(--theme-text-muted)]">{formatDateTime(o.paidAt)}</td>
                </tr>
              ))}
            </AdminTable>
          </AdminPanel>
        </>
      ) : null}
    </AdminPage>
  )
}
