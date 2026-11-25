'use client'

import { useState } from 'react'
import { Package, Pencil, Plus, X } from 'lucide-react'

import { formatFen } from '@shared/cloud/client'
import { CLOUD_FEATURES, type CloudFeature, type CloudPlan } from '@shared/cloud/types'
import {
  BILLING_CAPABILITIES,
  BILLING_CAPABILITY_LABELS,
  BILLING_MODE_LABELS,
  defaultPlanQuotas,
  newPlanQuotas,
  type BillingMode,
  type PlanQuotas,
} from '@shared/cloud/billing'
import { AdminError, AdminField, AdminLoading, AdminNotice, AdminPage, AdminPageHeader, AdminPanel, AdminTable, AdminTag, selectClass, useAdminData } from '@/components/admin/admin-ui'
import { Button, Input, Switch } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'
import { cn } from '@/lib/utils'

const FEATURE_LABELS: Record<string, string> = {
  '*': '全部功能',
  clone: '爆款复刻',
  production: '批量生产',
  models: '模特库',
  'asset-library': '素材库',
  'product-research': '选品调研',
  plugins: '插件',
  'gmv-max': 'GMV Max',
  'creator-hub': '达人中心',
}

type PlanForm = {
  code: string
  name: string
  description: string
  days: string
  price: string
  maxDevices: string
  features: CloudFeature[]
  active: boolean
  sort: string
  credits: string
  quotas: PlanQuotas
  isNew: boolean
}

const emptyForm: PlanForm = { code: '', name: '', description: '', days: '30', price: '', maxDevices: '1', features: ['*'], active: true, sort: '0', credits: '0', quotas: newPlanQuotas(), isNew: true }

const MODES = Object.keys(BILLING_MODE_LABELS) as BillingMode[]

/** 表格里的一行计费说明，例如「视频：每次扣点 · 图片：每月免费 20 次」 */
function describeQuotas(quotas: PlanQuotas) {
  return BILLING_CAPABILITIES.map((cap) => {
    const rule = quotas[cap]
    const text = rule.mode === 'free_then_credits' ? `每月免费 ${rule.freePerMonth} 次，超出扣点` : BILLING_MODE_LABELS[rule.mode]
    return { cap, label: BILLING_CAPABILITY_LABELS[cap], text, mode: rule.mode }
  })
}

function toForm(plan: CloudPlan): PlanForm {
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description,
    days: String(plan.days),
    price: (plan.amountFen / 100).toFixed(2),
    maxDevices: String(plan.maxDevices),
    features: plan.features,
    active: plan.active,
    sort: String(plan.sort),
    credits: String(plan.credits ?? 0),
    quotas: plan.quotas ?? defaultPlanQuotas(),
    isNew: false,
  }
}

export default function AdminPlansPage() {
  const plans = useAdminData(() => adminClient.admin.listPlans(), [])
  const [form, setForm] = useState<PlanForm | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const toggleFeature = (feature: CloudFeature) => {
    if (!form) return
    if (feature === '*') {
      setForm({ ...form, features: form.features.includes('*') ? [] : ['*'] })
      return
    }
    const without = form.features.filter((f) => f !== '*' && f !== feature)
    setForm({ ...form, features: form.features.includes(feature) ? without : [...without, feature] })
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    setNotice(null)
    try {
      const amountFen = Math.round(Number(form.price) * 100)
      if (!Number.isFinite(amountFen) || amountFen <= 0) throw new Error('请填写正确的价格')
      const credits = Math.floor(Number(form.credits || 0))
      if (!Number.isFinite(credits) || credits < 0) throw new Error('赠送点数必须是 0 或正整数')
      await adminClient.admin.savePlan({
        code: form.code.trim(),
        name: form.name,
        description: form.description,
        days: Number(form.days),
        amountFen,
        maxDevices: Number(form.maxDevices),
        features: form.features,
        active: form.active,
        sort: Number(form.sort),
        credits,
        quotas: form.quotas,
      })
      setNotice({ tone: 'success', text: `套餐「${form.name}」已保存` })
      setForm(null)
      await plans.reload()
    } catch (err) {
      setNotice({ tone: 'danger', text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={Package}
        title="套餐与价格"
        description="客户端与官网展示的套餐。改价只影响新订单；下架后不再出售，已购用户不受影响。"
        actions={
          <Button onClick={() => setForm(form?.isNew ? null : { ...emptyForm })}>
            {form?.isNew ? <X size={15} /> : <Plus size={15} />} {form?.isNew ? '取消' : '新建套餐'}
          </Button>
        }
      />
      {notice ? <AdminNotice tone={notice.tone}>{notice.text}</AdminNotice> : null}

      {form ? (
        <AdminPanel icon={form.isNew ? Plus : Pencil} title={form.isNew ? '新建套餐' : `编辑套餐 · ${form.name}`} actions={<Button size="sm" variant="ghost" onClick={() => setForm(null)}>关闭</Button>}>
          <form onSubmit={save} className="grid gap-4">
            <div className="admin-form-grid">
              <AdminField label="编码" hint="小写字母 / 数字 / - _，创建后不可改">
                <Input value={form.code} disabled={!form.isNew} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
              </AdminField>
              <AdminField label="名称">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </AdminField>
              <AdminField label="价格（元）">
                <Input type="number" step="0.01" min="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </AdminField>
              <AdminField label="时长（天）" hint="0 为永久">
                <Input type="number" min="0" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} required />
              </AdminField>
              <AdminField label="设备数上限" hint="0 为不限">
                <Input type="number" min="0" value={form.maxDevices} onChange={(e) => setForm({ ...form, maxDevices: e.target.value })} required />
              </AdminField>
              <AdminField label="排序" hint="数字越小越靠前">
                <Input type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value })} />
              </AdminField>
            </div>
            <div className="vg-divider" />
            <div className="grid gap-3">
              <div>
                <div className="font-semibold">生成计费</div>
                <span className="admin-sub">每次视频 / 图片生成怎么算。扣点的价格在「计费与模型」里按模型设置。</span>
              </div>
              <div className="admin-form-grid">
                <AdminField label="购买 / 兑换赠送点数" hint="每买一次或兑换一张该套餐卡，送这么多点">
                  <Input type="number" min="0" step="1" value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} />
                </AdminField>
                {BILLING_CAPABILITIES.map((cap) => {
                  const rule = form.quotas[cap]
                  const setRule = (next: Partial<typeof rule>) => setForm({ ...form, quotas: { ...form.quotas, [cap]: { ...rule, ...next } } })
                  return (
                    <AdminField key={cap} label={BILLING_CAPABILITY_LABELS[cap]}>
                      <div className="grid gap-2">
                        <select className={selectClass} value={rule.mode} onChange={(e) => setRule({ mode: e.target.value as BillingMode })}>
                          {MODES.map((mode) => (
                            <option key={mode} value={mode}>
                              {BILLING_MODE_LABELS[mode]}
                            </option>
                          ))}
                        </select>
                        {rule.mode === 'free_then_credits' ? (
                          <label className="flex items-center gap-2 text-[13px]">
                            每月免费
                            <Input
                              type="number"
                              min="0"
                              className="w-24"
                              aria-label="每月免费次数"
                              value={String(rule.freePerMonth)}
                              onChange={(e) => setRule({ freePerMonth: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                            />
                            次
                          </label>
                        ) : null}
                      </div>
                    </AdminField>
                  )
                })}
              </div>
            </div>
            <div className="vg-divider" />
            <AdminField label="描述" hint="展示在价格卡片上">
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </AdminField>
            <div className="vg-field">
              <span className="vg-field__label">包含功能</span>
              <div className="vg-seg">
                {(['*', ...CLOUD_FEATURES] as CloudFeature[]).map((feature) => (
                  <button key={feature} type="button" className={cn('vg-seg__btn', form.features.includes(feature) && 'is-active')} onClick={() => toggleFeature(feature)}>
                    {FEATURE_LABELS[feature] ?? feature}
                  </button>
                ))}
              </div>
            </div>
            <div className="vg-divider" />
            <div className="flex flex-wrap items-center gap-4">
              <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="上架销售" />
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" onClick={() => setForm(null)}>
                  取消
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? '保存中…' : '保存套餐'}
                </Button>
              </div>
            </div>
          </form>
        </AdminPanel>
      ) : null}

      <AdminPanel flush>
        {plans.error ? (
          <div className="p-4">
            <AdminError message={plans.error} onRetry={() => void plans.reload()} />
          </div>
        ) : null}
        {plans.loading && !plans.data ? <AdminLoading /> : null}
        {plans.data ? (
          <AdminTable
            head={['套餐', { label: '价格', align: 'right' }, '时长', '设备', '生成计费', '功能', '状态', { label: '', align: 'right' }]}
            empty={!plans.data.plans.length}
            emptyText="还没有套餐"
          >
            {plans.data.plans.map((p) => (
              <tr key={p.code}>
                <td>
                  <div className="font-semibold">{p.name}</div>
                  <span className="admin-sub">
                    <span className="admin-mono">{p.code}</span>
                    {p.description ? ` · ${p.description}` : ''}
                  </span>
                </td>
                <td className="num text-[15px] font-bold">{formatFen(p.amountFen)}</td>
                <td>{p.days === 0 ? '永久' : `${p.days} 天`}</td>
                <td>{p.maxDevices === 0 ? '不限' : `${p.maxDevices} 台`}</td>
                <td>
                  <div className="grid gap-0.5 text-[13px]">
                    {describeQuotas(p.quotas).map((q) => (
                      <span key={q.cap} className={q.mode === 'disabled' ? 'admin-sub' : undefined}>
                        {q.label}：{q.text}
                      </span>
                    ))}
                    {p.credits > 0 ? <span className="admin-sub">送 {p.credits} 点</span> : null}
                  </div>
                </td>
                <td>
                  <div className="flex max-w-[280px] flex-wrap gap-1">
                    {p.features.map((f) => (
                      <span key={f} className="vg-chip">
                        {FEATURE_LABELS[f] ?? f}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  {p.active ? (
                    <AdminTag tone="success" dot>
                      销售中
                    </AdminTag>
                  ) : (
                    <AdminTag dot>已下架</AdminTag>
                  )}
                </td>
                <td className="num">
                  <Button size="sm" variant="secondary" onClick={() => setForm(toForm(p))}>
                    <Pencil size={13} /> 编辑
                  </Button>
                </td>
              </tr>
            ))}
          </AdminTable>
        ) : null}
      </AdminPanel>
    </AdminPage>
  )
}
