'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Coins, Cpu, Pencil, Plus, Trash2, X } from 'lucide-react'

import {
  BILLING_CAPABILITIES,
  BILLING_CAPABILITY_LABELS,
  type AiModelEntry,
  type BillingCapability,
  type BillingDefaults,
} from '@shared/cloud/billing'
import { MANAGED_PLATFORM_KEYS, MANAGED_PLATFORM_LABELS } from '@shared/cloud/managedSettings'
import { AdminError, AdminField, AdminLoading, AdminNotice, AdminPage, AdminPageHeader, AdminPanel, AdminTable, AdminTag, selectClass, useAdminData } from '@/components/admin/admin-ui'
import { Button, Input, Switch } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'
import { cn } from '@/lib/utils'

type ModelForm = {
  id?: string
  capability: BillingCapability
  platform: string
  model: string
  label: string
  points: string
  costYuan: string
  enabled: boolean
  planCodes: string[]
  sort: string
  note: string
}

const emptyModel: ModelForm = { capability: 'video', platform: '*', model: '', label: '', points: '10', costYuan: '', enabled: true, planCodes: [], sort: '0', note: '' }

const yuanToFen = (value: string) => Math.max(0, Math.round((Number(value) || 0) * 10000) / 100)
const yuan = (fen: number) => `¥${(fen / 100).toFixed(2)}`

const platformLabel = (key: string) => (key === '*' ? '任意平台' : MANAGED_PLATFORM_LABELS[key as keyof typeof MANAGED_PLATFORM_LABELS]?.label ?? key)

export default function AdminBillingPage() {
  const billing = useAdminData(() => adminClient.admin.getBilling(), [])
  const plans = useAdminData(() => adminClient.admin.listPlans(), [])
  const software = useAdminData(() => adminClient.admin.getSoftwareSettings(), [])
  const [days, setDays] = useState(30)
  const usage = useAdminData(() => adminClient.admin.usageStats(days), [days])
  const [defaults, setDefaults] = useState<BillingDefaults | null>(null)
  const [form, setForm] = useState<ModelForm | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (billing.data && !defaults) setDefaults(billing.data.defaults)
  }, [billing.data, defaults])

  const run = async (task: () => Promise<void>, success: string) => {
    setBusy(true)
    setNotice(null)
    try {
      await task()
      setNotice({ tone: 'success', text: success })
    } catch (err) {
      setNotice({ tone: 'danger', text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const saveDefaults = (event: React.FormEvent) => {
    event.preventDefault()
    if (!defaults) return
    void run(async () => {
      const next = await adminClient.admin.saveBillingDefaults(defaults)
      billing.setData(next)
      setDefaults(next.defaults)
    }, '默认价格已保存，下一次生成开始生效')
  }

  const saveModel = (event: React.FormEvent) => {
    event.preventDefault()
    if (!form) return
    void run(async () => {
      const points = Math.floor(Number(form.points))
      if (!Number.isFinite(points) || points < 0) throw new Error('点数必须是 0 或正整数')
      billing.setData(
        await adminClient.admin.saveModel({
          id: form.id,
          capability: form.capability,
          platform: form.platform,
          model: form.model.trim(),
          label: form.label.trim(),
          points,
          costFen: yuanToFen(form.costYuan),
          enabled: form.enabled,
          planCodes: form.planCodes,
          sort: Number(form.sort) || 0,
          note: form.note,
        }),
      )
      setForm(null)
    }, `模型「${form.label || form.model}」已保存`)
  }

  const removeModel = (model: AiModelEntry) => {
    if (!window.confirm(`删除「${model.label}」？删除后这个模型按默认价格扣点。`)) return
    void run(async () => billing.setData(await adminClient.admin.deleteModel(model.id)), '已删除')
  }

  const toggleModel = (model: AiModelEntry) =>
    void run(async () => billing.setData(await adminClient.admin.saveModel({ ...model, enabled: !model.enabled })), model.enabled ? `已停用「${model.label}」` : `已启用「${model.label}」`)

  const editModel = (model: AiModelEntry) =>
    setForm({ id: model.id, capability: model.capability, platform: model.platform, model: model.model, label: model.label, points: String(model.points), costYuan: model.costFen ? String(model.costFen / 100) : '', enabled: model.enabled, planCodes: model.planCodes, sort: String(model.sort), note: model.note })

  const planName = (code: string) => plans.data?.plans.find((p) => p.code === code)?.name ?? code
  const current = software.data?.settings
  const isCurrent = (m: Pick<AiModelEntry, 'capability' | 'platform' | 'model'>) => {
    if (!current?.enabled) return false
    const cap = current.capabilities[m.capability]
    return cap.model === m.model && (m.platform === '*' || m.platform === cap.platform)
  }
  const saved = billing.data?.defaults
  const pointFen = saved?.pointFen ?? 0
  const costOf = (m: Pick<AiModelEntry, 'capability' | 'costFen'>) => m.costFen || (saved?.costFen[m.capability] ?? 0)
  const totalCost = usage.data?.models.reduce((sum, m) => sum + m.costFen, 0) ?? 0
  const totalPoints = usage.data?.models.reduce((sum, m) => sum + m.points, 0) ?? 0
  const unknownCost = usage.data?.models.reduce((sum, m) => sum + m.unknownCost, 0) ?? 0
  const openPlans = plans.data?.plans.filter((p) => p.active && BILLING_CAPABILITIES.some((cap) => p.quotas[cap].mode === 'unlimited')) ?? []
  const unlistedCurrent = current?.enabled
    ? BILLING_CAPABILITIES.filter((cap) => current.capabilities[cap].model && !billing.data?.models.some((m) => m.capability === cap && isCurrent(m)))
    : []

  return (
    <AdminPage>
      <AdminPageHeader
        icon={Coins}
        title="计费与模型"
        description="每次视频 / 图片生成扣多少点。套餐决定是否扣点（在「套餐与价格」里设置），这里决定扣多少。客户端实际用哪个模型，在「软件设置」里选。"
      />
      {notice ? <AdminNotice tone={notice.tone}>{notice.text}</AdminNotice> : null}
      {openPlans.length ? (
        <AdminNotice tone="danger">在售套餐{openPlans.map((p) => `「${p.name}」`).join('、')}有「不限次数」的生成，只受每天上限约束，可能亏本。建议到「套餐与价格」改成扣点。</AdminNotice>
      ) : null}
      {billing.error ? <AdminError message={billing.error} onRetry={() => void billing.reload()} /> : null}
      {billing.loading && !billing.data ? <AdminLoading /> : null}

      {defaults ? (
        <AdminPanel icon={Coins} title="默认价格" subtitle="没有列在下面模型价目里的模型，按这个价格扣点">
          <form onSubmit={saveDefaults} className="grid gap-3">
            <div className="admin-form-grid">
              {BILLING_CAPABILITIES.map((cap) => (
                <AdminField key={cap} label={`${BILLING_CAPABILITY_LABELS[cap]}（点 / 次）`}>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={String(defaults.points[cap])}
                    onChange={(e) => setDefaults({ ...defaults, points: { ...defaults.points, [cap]: Math.max(0, Math.floor(Number(e.target.value) || 0)) } })}
                  />
                </AdminField>
              ))}
              <AdminField label="每天失败自动退点次数" hint="每个账号 24 小时内；超出后失败不再退点，防止刷退款">
                <Input type="number" min="0" step="1" value={String(defaults.refundPerDay)} onChange={(e) => setDefaults({ ...defaults, refundPerDay: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
              </AdminField>
              {BILLING_CAPABILITIES.map((cap) => (
                <AdminField key={`cap-${cap}`} label={`「不限」套餐每天上限 · ${BILLING_CAPABILITY_LABELS[cap]}`} hint="每个账号 24 小时内最多几次；0 = 不封顶（可能亏本）">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={String(defaults.includedPerDay[cap])}
                    onChange={(e) => setDefaults({ ...defaults, includedPerDay: { ...defaults.includedPerDay, [cap]: Math.max(0, Math.floor(Number(e.target.value) || 0)) } })}
                  />
                </AdminField>
              ))}
              {BILLING_CAPABILITIES.map((cap) => (
                <AdminField key={`cost-${cap}`} label={`默认成本 · ${BILLING_CAPABILITY_LABELS[cap]}（元 / 次）`} hint="没有单独填成本的模型按这个算">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    defaultValue={defaults.costFen[cap] ? String(defaults.costFen[cap] / 100) : ''}
                    onChange={(e) => setDefaults({ ...defaults, costFen: { ...defaults.costFen, [cap]: yuanToFen(e.target.value) } })}
                  />
                </AdminField>
              ))}
              <AdminField label="1 点卖多少元" hint="例如 ¥99 送 500 点约 0.198，用来估算收入">
                <Input type="number" min="0" step="any" defaultValue={defaults.pointFen ? String(defaults.pointFen / 100) : ''} onChange={(e) => setDefaults({ ...defaults, pointFen: yuanToFen(e.target.value) })} />
              </AdminField>
            </div>
            <div className="admin-form-actions">
              <Button type="submit" disabled={busy}>
                保存默认价格
              </Button>
            </div>
          </form>
        </AdminPanel>
      ) : null}

      <AdminPanel
        flush
        icon={Cpu}
        title="模型价目"
        subtitle="按模型单独定价、停用或限定套餐。模型 ID 要和平台接口里的一致"
        actions={
          <Button size="sm" onClick={() => setForm(form && !form.id ? null : { ...emptyModel })}>
            {form && !form.id ? <X size={14} /> : <Plus size={14} />} {form && !form.id ? '取消' : '添加模型'}
          </Button>
        }
      >
        {unlistedCurrent.length ? (
          <div className="px-4 pt-4">
            <AdminNotice tone="info">
              软件设置里正在用的
              {unlistedCurrent.map((cap) => `${BILLING_CAPABILITY_LABELS[cap]}模型「${current!.capabilities[cap].model}」`).join('、')}
              还没有单独定价，按默认价格扣点。
            </AdminNotice>
          </div>
        ) : null}
        {form ? (
          <form onSubmit={saveModel} className="grid gap-3 border-b border-[var(--theme-divider)] p-4">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-start gap-3">
              <AdminField label="类型">
                <select className={selectClass} value={form.capability} onChange={(e) => setForm({ ...form, capability: e.target.value as BillingCapability })}>
                  {BILLING_CAPABILITIES.map((cap) => (
                    <option key={cap} value={cap}>
                      {BILLING_CAPABILITY_LABELS[cap]}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="平台" hint="「任意平台」对所有平台的同名模型生效">
                <select className={selectClass} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                  {['*', ...MANAGED_PLATFORM_KEYS].map((key) => (
                    <option key={key} value={key}>
                      {platformLabel(key)}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="模型 ID">
                <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="如 veo3.1-fast" required />
              </AdminField>
              <AdminField label="显示名称" hint="用户看到的名字，留空用模型 ID">
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </AdminField>
              <AdminField label="点数 / 次">
                <Input type="number" min="0" step="1" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} required />
              </AdminField>
              <AdminField label="平台成本（元 / 次）" hint="平台每次实际收多少钱；留空用默认成本">
                <Input type="number" min="0" step="any" value={form.costYuan} onChange={(e) => setForm({ ...form, costYuan: e.target.value })} />
              </AdminField>
              <AdminField label="排序">
                <Input type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value })} />
              </AdminField>
            </div>
            <div className="vg-field">
              <span className="vg-field__label">可用套餐（都不选 = 所有套餐都能用）</span>
              <div className="vg-seg flex-wrap">
                {plans.data?.plans.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    className={cn('vg-seg__btn', form.planCodes.includes(p.code) && 'is-active')}
                    onClick={() => setForm({ ...form, planCodes: form.planCodes.includes(p.code) ? form.planCodes.filter((c) => c !== p.code) : [...form.planCodes, p.code] })}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <AdminField label="备注" hint="例如成本价，只有后台能看到">
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </AdminField>
            <div className="flex flex-wrap items-center gap-4">
              <Switch checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="启用" hint="停用后用这个模型生成会被拒绝" />
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" type="button" onClick={() => setForm(null)}>
                  取消
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? '保存中…' : '保存模型'}
                </Button>
              </div>
            </div>
          </form>
        ) : null}
        {billing.data ? (
          <AdminTable head={['模型', '类型', '平台', { label: '点数 / 次', align: 'right' }, { label: '成本 / 次', align: 'right' }, '可用套餐', '状态', { label: '', align: 'right' }]} empty={!billing.data.models.length} emptyText="还没有单独定价的模型，全部按默认价格扣点">
            {billing.data.models.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="flex items-center gap-1.5 font-semibold">
                    {m.label}
                    {isCurrent(m) ? <AdminTag tone="violet">正在使用</AdminTag> : null}
                  </div>
                  <span className="admin-sub">
                    <span className="admin-mono">{m.model}</span>
                    {m.note ? ` · ${m.note}` : ''}
                  </span>
                </td>
                <td>{BILLING_CAPABILITY_LABELS[m.capability]}</td>
                <td>{platformLabel(m.platform)}</td>
                <td className="num text-[15px] font-bold">{m.points}</td>
                <td className="num">
                  {costOf(m) ? yuan(costOf(m)) : '未填'}
                  {costOf(m) && pointFen && m.points * pointFen < costOf(m) ? <AdminTag tone="danger">亏本</AdminTag> : null}
                </td>
                <td>{m.planCodes.length ? m.planCodes.map(planName).join('、') : '全部'}</td>
                <td>
                  {m.enabled ? (
                    <AdminTag tone="success" dot>
                      启用
                    </AdminTag>
                  ) : (
                    <AdminTag dot>已停用</AdminTag>
                  )}
                </td>
                <td className="num whitespace-nowrap">
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => toggleModel(m)}>
                    {m.enabled ? '停用' : '启用'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => editModel(m)}>
                    <Pencil size={13} /> 编辑
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => removeModel(m)} aria-label="删除">
                    <Trash2 size={13} />
                  </Button>
                </td>
              </tr>
            ))}
          </AdminTable>
        ) : null}
      </AdminPanel>

      <AdminPanel
        flush
        icon={BarChart3}
        title="生成用量"
        subtitle={usage.data ? `平台成本 ${yuan(totalCost)}${pointFen ? ` · 扣点折合收入 ${yuan(totalPoints * pointFen)}` : ''}${unknownCost ? ` · ${unknownCost} 次没填成本` : ''} · 用户剩余点数 ${usage.data.outstandingCredits}` : undefined}
        actions={
          <select className="vg-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
            <option value={90}>近 90 天</option>
          </select>
        }
      >
        {usage.error ? (
          <div className="p-4">
            <AdminError message={usage.error} onRetry={() => void usage.reload()} />
          </div>
        ) : null}
        {usage.data ? (
          <AdminTable
            head={['模型', '类型', { label: '成功次数', align: 'right' }, { label: '失败退回', align: 'right' }, { label: '扣点', align: 'right' }, { label: '平台成本', align: 'right' }, { label: '使用人数', align: 'right' }]}
            empty={!usage.data.models.length}
            emptyText="这段时间还没有生成"
          >
            {usage.data.models.map((m) => (
              <tr key={`${m.capability}-${m.platform}-${m.model}`}>
                <td>
                  <span className="admin-mono">{m.model || '（未知）'}</span>
                  <span className="admin-sub">{platformLabel(m.platform)}</span>
                </td>
                <td>{BILLING_CAPABILITY_LABELS[m.capability] ?? m.capability}</td>
                <td className="num">{m.calls}</td>
                <td className="num">{m.failed}</td>
                <td className="num font-semibold">{m.points}</td>
                <td className="num">{m.costFen ? yuan(m.costFen) : '未填'}</td>
                <td className="num">{m.users}</td>
              </tr>
            ))}
          </AdminTable>
        ) : null}
      </AdminPanel>

      <AdminPanel flush icon={BarChart3} title="用得最多的账号" subtitle={`近 ${days} 天，按平台成本从高到低`}>
        {usage.data ? (
          <AdminTable head={['账号', '套餐', { label: '生成次数', align: 'right' }, { label: '扣点', align: 'right' }, { label: '平台成本', align: 'right' }]} empty={!usage.data.topUsers.length} emptyText="这段时间还没有生成">
            {usage.data.topUsers.map((u) => (
              <tr key={u.userId}>
                <td>{u.account}</td>
                <td>{u.planCode ? planName(u.planCode) : '—'}</td>
                <td className="num">{u.calls}</td>
                <td className="num">{u.points}</td>
                <td className="num font-semibold">{u.costFen ? yuan(u.costFen) : '未填'}</td>
              </tr>
            ))}
          </AdminTable>
        ) : null}
      </AdminPanel>
    </AdminPage>
  )
}
