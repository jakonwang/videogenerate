'use client'

import { useState } from 'react'
import { Copy, KeyRound, Sparkles } from 'lucide-react'

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

export default function AdminRedeemCodesPage() {
  const plans = useAdminData(() => adminClient.admin.listPlans(), [])
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState({ keyword: '', status: '', batchId: '', page: 1 })
  const codes = useAdminData(() => adminClient.admin.listRedeemCodes(query), [query])
  const [form, setForm] = useState({ planCode: '', days: '', count: '10', note: '' })
  const [generated, setGenerated] = useState<{ batchId: string; codes: string[] } | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const generate = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const planCode = form.planCode || plans.data?.plans[0]?.code || ''
      const result = await adminClient.admin.generateRedeemCodes({
        planCode,
        days: form.days === '' ? undefined : Number(form.days),
        count: Number(form.count),
        note: form.note,
      })
      setGenerated(result)
      setNotice({ tone: 'success', text: `已生成 ${result.codes.length} 个兑换码` })
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

  const toggle = async (code: string, status: 'unused' | 'disabled') => {
    try {
      await adminClient.admin.setRedeemStatus(code, status)
      await codes.reload()
    } catch (err) {
      setNotice({ tone: 'danger', text: (err as Error).message })
    }
  }

  const planName = (code: string) => plans.data?.plans.find((p) => p.code === code)?.name ?? code

  return (
    <AdminPage>
      <AdminPageHeader icon={KeyRound} title="兑换码" description="用于线下销售、渠道分发或赠送。用户在客户端或用户中心输入即可开通会员。" />
      {notice ? <AdminNotice tone={notice.tone}>{notice.text}</AdminNotice> : null}

      <AdminPanel icon={Sparkles} title="批量生成">
        <form onSubmit={generate} className="grid gap-3">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-start gap-3">
            <AdminField label="套餐">
              <select className={selectClass} value={form.planCode} onChange={(e) => setForm({ ...form, planCode: e.target.value })}>
                {plans.data?.plans.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </AdminField>
            <AdminField label="天数" hint="留空按套餐，0 为永久">
              <Input type="number" min="0" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
            </AdminField>
            <AdminField label="数量" hint="单次 1–1000 个">
              <Input type="number" min="1" max="1000" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} required />
            </AdminField>
            <AdminField label="备注" hint="渠道或用途，方便对账">
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </AdminField>
          </div>
          <div className="admin-form-actions">
            <Button type="submit" disabled={busy || !plans.data?.plans.length}>
              <Sparkles size={15} /> {busy ? '生成中…' : '生成兑换码'}
            </Button>
          </div>
        </form>
        {generated ? (
          <div className="mt-4 grid gap-2 border-t border-[var(--theme-divider)] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="vg-muted text-[12px]">
                批次 <span className="admin-mono">{generated.batchId}</span> · 完整列表只在此显示一次，请及时保存
              </span>
              <Button size="sm" variant="soft" onClick={() => void copyCodes()}>
                <Copy size={13} /> 复制全部
              </Button>
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
          <AdminSearch value={keyword} onChange={setKeyword} placeholder="兑换码或备注" />
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
            <span className="vg-chip ml-auto">
              批次 {query.batchId.slice(0, 10)}…
              <button type="button" className="vg-link ml-1" onClick={() => setQuery({ ...query, batchId: '', page: 1 })}>
                清除
              </button>
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
            <AdminTable head={['兑换码', '套餐', '天数', '状态', '备注', '创建时间', '使用时间', { label: '', align: 'right' }]} empty={!codes.data.items.length} emptyText="暂无兑换码">
              {codes.data.items.map((c) => (
                <tr key={c.code}>
                  <td className="admin-mono font-semibold tracking-wide">{c.code}</td>
                  <td>{planName(c.planCode)}</td>
                  <td className="vg-num">{c.days === 0 ? '永久' : c.days}</td>
                  <td>
                    {c.status === 'unused' ? (
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
                  <td className="text-[var(--theme-text-secondary)]">{c.note || '—'}</td>
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
              ))}
            </AdminTable>
            <AdminPager page={codes.data.page} pageSize={codes.data.pageSize} total={codes.data.total} onChange={(page) => setQuery({ ...query, page })} />
          </>
        ) : null}
      </AdminPanel>
    </AdminPage>
  )
}
