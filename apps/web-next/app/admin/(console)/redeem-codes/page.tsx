'use client'

import { useState } from 'react'
import { Ban, Copy, Download, KeyRound, Sparkles } from 'lucide-react'

import type { CloudRedeemKind } from '@shared/cloud/billing'
import type { CloudRedeemCode } from '@shared/cloud/types'
import {
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
  selectClass,
  textareaClass,
  useAdminData,
} from '@/components/admin/admin-ui'
import { Button, Input } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'
import { cn } from '@/lib/utils'

type GenerateForm = { kind: CloudRedeemKind; planCode: string; days: string; credits: string; count: string; channel: string; expiresOn: string; note: string }

const emptyForm: GenerateForm = { kind: 'plan', planCode: '', days: '', credits: '', count: '10', channel: '', expiresOn: '', note: '' }

/** 下载卡密 CSV（Excel 打开不乱码） */
function downloadCsv(filename: string, rows: string[][]) {
  const escape = (cell: string) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)
  const csv = '﻿' + rows.map((row) => row.map(escape).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const STATUS_LABEL: Record<string, string> = { unused: '未使用', used: '已使用', disabled: '已作废' }

export default function AdminRedeemCodesPage() {
  const plans = useAdminData(() => adminClient.admin.listPlans(), [])
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState({ keyword: '', status: '', batchId: '', page: 1 })
  const codes = useAdminData(() => adminClient.admin.listRedeemCodes(query), [query])
  const [form, setForm] = useState<GenerateForm>(emptyForm)
  const [generated, setGenerated] = useState<{ batchId: string; codes: string[] } | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const selectedPlan = plans.data?.plans.find((p) => p.code === (form.planCode || plans.data?.plans[0]?.code))
  const planName = (code: string) => plans.data?.plans.find((p) => p.code === code)?.name ?? code

  const describe = (c: Pick<CloudRedeemCode, 'kind' | 'planCode' | 'days' | 'credits'>) => {
    if (c.kind === 'credits') return `${c.credits} 点`
    const days = c.days === 0 ? '永久' : `${c.days} 天`
    return `${planName(c.planCode)} · ${days}${c.credits > 0 ? ` · 送 ${c.credits} 点` : ''}`
  }

  const generate = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      // 截止日期当天 23:59:59（和后台其它时间一样按本机时区）
      const expiresAt = form.expiresOn ? new Date(`${form.expiresOn}T23:59:59`).getTime() : null
      const result = await adminClient.admin.generateRedeemCodes({
        kind: form.kind,
        planCode: form.kind === 'plan' ? selectedPlan?.code ?? '' : undefined,
        days: form.kind === 'plan' && form.days !== '' ? Number(form.days) : null,
        credits: form.credits === '' ? null : Number(form.credits),
        count: Number(form.count),
        channel: form.channel,
        expiresAt,
        note: form.note,
      })
      setGenerated(result)
      setNotice({ tone: 'success', text: `已生成 ${result.codes.length} 个卡密` })
      setQuery({ keyword: '', status: '', batchId: result.batchId, page: 1 })
    } catch (err) {
      setNotice({ tone: 'danger', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const copyCodes = async () => {
    if (!generated) return
    try {
      await navigator.clipboard.writeText(generated.codes.join('\n'))
      setNotice({ tone: 'success', text: '已复制到剪贴板' })
    } catch {
      setNotice({ tone: 'danger', text: '复制失败，请手动选择文本复制' })
    }
  }

  const exportBatch = async (batchId: string) => {
    try {
      const { codes: rows } = await adminClient.admin.exportRedeemBatch(batchId)
      downloadCsv(`卡密-${batchId}.csv`, [
        ['卡密', '内容', '状态', '渠道', '兑换截止', '备注', '创建时间', '使用时间'],
        ...rows.map((c) => [c.code, describe(c), STATUS_LABEL[c.status] ?? c.status, c.channel, c.expiresAt ? formatDateTime(c.expiresAt) : '不限', c.note, formatDateTime(c.createdAt), c.usedAt ? formatDateTime(c.usedAt) : '']),
      ])
    } catch (err) {
      setNotice({ tone: 'danger', text: (err as Error).message })
    }
  }

  const voidBatch = async (batchId: string) => {
    if (!window.confirm('作废这个批次里所有还没使用的卡密？已经兑换的不受影响。')) return
    try {
      const { changed } = await adminClient.admin.setRedeemBatchStatus(batchId, 'disabled')
      setNotice({ tone: 'success', text: `已作废 ${changed} 个未使用的卡密` })
      await codes.reload()
    } catch (err) {
      setNotice({ tone: 'danger', text: (err as Error).message })
    }
  }

  const toggle = async (code: string, status: 'unused' | 'disabled') => {
    try {
      await adminClient.admin.setRedeemStatus(code, status)
      await codes.reload()
    } catch (err) {
      setNotice({ tone: 'danger', text: (err as Error).message })
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={KeyRound}
        title="卡密"
        description="在线支付开通前，用卡密卖会员和点数：发卡平台、微信或闲鱼收款后发卡，用户在客户端「账号与会员」里兑换。"
      />
      {notice ? <AdminNotice tone={notice.tone}>{notice.text}</AdminNotice> : null}

      <AdminPanel icon={Sparkles} title="批量生成">
        <form onSubmit={generate} className="grid gap-3">
          <div className="vg-seg w-fit">
            {(
              [
                ['plan', '套餐卡（会员时长 + 套餐送的点数）'],
                ['credits', '点数卡（只加点数）'],
              ] as const
            ).map(([kind, label]) => (
              <button key={kind} type="button" className={cn('vg-seg__btn', form.kind === kind && 'is-active')} onClick={() => setForm({ ...form, kind })}>
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-start gap-3">
            {form.kind === 'plan' ? (
              <>
                <AdminField label="套餐">
                  <select className={selectClass} value={selectedPlan?.code ?? ''} onChange={(e) => setForm({ ...form, planCode: e.target.value })}>
                    {plans.data?.plans.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </AdminField>
                <AdminField label="天数" hint={`留空按套餐（${selectedPlan ? (selectedPlan.days === 0 ? '永久' : `${selectedPlan.days} 天`) : '—'}），0 为永久`}>
                  <Input type="number" min="0" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
                </AdminField>
                <AdminField label="附送点数" hint={`留空按套餐（${selectedPlan?.credits ?? 0} 点）`}>
                  <Input type="number" min="0" value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} />
                </AdminField>
              </>
            ) : (
              <AdminField label="点数" hint="每张卡加多少点">
                <Input type="number" min="1" value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} required />
              </AdminField>
            )}
            <AdminField label="数量" hint="单次 1–1000 个">
              <Input type="number" min="1" max="1000" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} required />
            </AdminField>
            <AdminField label="销售渠道" hint="如：闲鱼、代理张三">
              <Input value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} />
            </AdminField>
            <AdminField label="兑换截止" hint="留空为不限，过期后不能兑换">
              <Input type="date" value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} />
            </AdminField>
            <AdminField label="备注">
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </AdminField>
          </div>
          {form.kind === 'credits' ? <span className="admin-sub">点数卡不含会员时长：用户需要有有效会员才能用点数生成。</span> : null}
          <div className="admin-form-actions">
            <Button type="submit" disabled={busy || (form.kind === 'plan' && !plans.data?.plans.length)}>
              <Sparkles size={15} /> {busy ? '生成中…' : '生成卡密'}
            </Button>
          </div>
        </form>
        {generated ? (
          <div className="mt-4 grid gap-2 border-t border-[var(--theme-divider)] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="vg-muted text-[12px]">
                批次 <span className="admin-mono">{generated.batchId}</span> · 共 {generated.codes.length} 个
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="soft" onClick={() => void copyCodes()}>
                  <Copy size={13} /> 复制全部
                </Button>
                <Button size="sm" variant="soft" onClick={() => void exportBatch(generated.batchId)}>
                  <Download size={13} /> 导出 CSV
                </Button>
              </div>
            </div>
            <textarea className={textareaClass} readOnly value={generated.codes.join('\n')} rows={Math.min(8, generated.codes.length)} />
          </div>
        ) : null}
      </AdminPanel>

      <AdminPanel flush>
        <form
          className="admin-filters"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery({ ...query, keyword, page: 1 })
          }}
        >
          <AdminSearch value={keyword} onChange={setKeyword} placeholder="卡密、渠道或备注" />
          <select className="vg-select" value={query.status} onChange={(e) => setQuery({ ...query, status: e.target.value, page: 1 })}>
            <option value="">全部状态</option>
            <option value="unused">未使用</option>
            <option value="used">已使用</option>
            <option value="disabled">已作废</option>
          </select>
          <Button type="submit" variant="secondary">
            搜索
          </Button>
          {query.batchId ? (
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <span className="vg-chip">
                批次 {query.batchId.slice(0, 10)}…
                <button type="button" className="vg-link ml-1" onClick={() => setQuery({ ...query, batchId: '', page: 1 })}>
                  清除
                </button>
              </span>
              <Button size="sm" variant="secondary" type="button" onClick={() => void exportBatch(query.batchId)}>
                <Download size={13} /> 导出本批
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => void voidBatch(query.batchId)}>
                <Ban size={13} /> 作废本批未用
              </Button>
            </span>
          ) : null}
        </form>
        {codes.error ? (
          <div className="p-4">
            <AdminError message={codes.error} onRetry={() => void codes.reload()} />
          </div>
        ) : null}
        {codes.loading && !codes.data ? <AdminLoading /> : null}
        {codes.data ? (
          <>
            <AdminTable head={['卡密', '内容', '状态', '渠道 / 备注', '兑换截止', '创建时间', '使用时间', { label: '', align: 'right' }]} empty={!codes.data.items.length} emptyText="暂无卡密">
              {codes.data.items.map((c) => {
                const expired = c.status === 'unused' && c.expiresAt !== null && c.expiresAt < Date.now()
                return (
                  <tr key={c.code}>
                    <td className="admin-mono font-semibold tracking-wide">{c.code}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <AdminTag tone={c.kind === 'credits' ? 'warning' : 'info'}>{c.kind === 'credits' ? '点数卡' : '套餐卡'}</AdminTag>
                        <span>{describe(c)}</span>
                      </div>
                    </td>
                    <td>
                      {expired ? (
                        <AdminTag dot>已过期</AdminTag>
                      ) : c.status === 'unused' ? (
                        <AdminTag tone="success" dot>
                          未使用
                        </AdminTag>
                      ) : c.status === 'used' ? (
                        <AdminTag tone="info" dot>
                          已使用
                        </AdminTag>
                      ) : (
                        <AdminTag tone="danger" dot>
                          已作废
                        </AdminTag>
                      )}
                    </td>
                    <td className="text-[var(--theme-text-secondary)]">
                      {[c.channel, c.note].filter(Boolean).join(' · ') || '—'}
                      <button type="button" className="vg-link ml-2 text-[12px]" onClick={() => setQuery({ keyword: '', status: '', batchId: c.batchId, page: 1 })}>
                        同批次
                      </button>
                    </td>
                    <td className="whitespace-nowrap text-[var(--theme-text-muted)]">{c.expiresAt ? formatDateTime(c.expiresAt) : '不限'}</td>
                    <td className="whitespace-nowrap text-[var(--theme-text-muted)]">{formatDateTime(c.createdAt)}</td>
                    <td className="whitespace-nowrap text-[var(--theme-text-muted)]">{formatDateTime(c.usedAt)}</td>
                    <td className="num">
                      {c.status === 'unused' ? (
                        <Button size="sm" variant="ghost" onClick={() => void toggle(c.code, 'disabled')}>
                          作废
                        </Button>
                      ) : c.status === 'disabled' ? (
                        <Button size="sm" variant="ghost" onClick={() => void toggle(c.code, 'unused')}>
                          恢复
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </AdminTable>
            <AdminPager page={codes.data.page} pageSize={codes.data.pageSize} total={codes.data.total} onChange={(page) => setQuery({ ...query, page })} />
          </>
        ) : null}
      </AdminPanel>
    </AdminPage>
  )
}
