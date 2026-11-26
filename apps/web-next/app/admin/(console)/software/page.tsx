'use client'

import { useEffect, useMemo, useState } from 'react'
import { HardDrive, Save, Scissors, ShieldAlert, SlidersHorizontal } from 'lucide-react'

import {
  MANAGED_PLATFORM_KEYS,
  MATTING_TYPES,
  type ManagedSoftwareSettings,
} from '@shared/cloud/managedSettings'
import { DefaultModelsSection, PlatformSection, SecretInput, VideoModelMatrix } from './ai-sections'
import { AdminError, AdminField, AdminLoading, AdminNotice, AdminPage, AdminPageHeader, AdminPanel, AdminTag, formatDateTime, selectClass, useAdminData } from '@/components/admin/admin-ui'
import { Button, Input, Switch } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'

const MATTING_LABELS: Record<ManagedSoftwareSettings['matting']['type'], string> = {
  AIPicMatting: '通用抠图（0.02 元/张）',
  AIPortraitMatting: '人像抠图（0.02 元/张）',
  GoodsMatting: '商品抠图（0.01 元/张）',
}

export default function AdminSoftwareSettingsPage() {
  const remote = useAdminData(() => adminClient.admin.getSoftwareSettings(), [])
  const [form, setForm] = useState<ManagedSoftwareSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  useEffect(() => {
    if (remote.data) setForm(structuredClone(remote.data.settings))
  }, [remote.data])

  const dirty = useMemo(() => Boolean(form && remote.data && JSON.stringify(form) !== JSON.stringify(remote.data.settings)), [form, remote.data])
  const configuredCount = form ? MANAGED_PLATFORM_KEYS.filter((k) => form.platforms[k].apiKey).length : 0

  const save = async () => {
    if (!form) return
    setSaving(true)
    setNotice(null)
    try {
      const result = await adminClient.admin.saveSoftwareSettings(form)
      remote.setData(result)
      setNotice({
        tone: 'success',
        text: form.enabled ? '已保存。已登录的客户端会在下次同步（启动时或 6 小时内）自动应用。' : '已保存。统一下发处于关闭状态，客户端继续使用各自的本地配置。',
      })
    } catch (err) {
      setNotice({ tone: 'danger', text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminPage>
      <AdminPageHeader
        icon={SlidersHorizontal}
        title="软件设置"
        description="统一配置所有客户端使用的 AI 平台、默认模型和存储。开启后，用户无需自己填写 Key，客户端对应设置变为只读；Key 只在服务器，生成请求经云端转发。"
        actions={
          <>
            {remote.data?.updatedAt ? <span className="vg-muted text-[12px]">最近保存 {formatDateTime(remote.data.updatedAt)}</span> : null}
            <Button variant={dirty ? 'default' : 'secondary'} onClick={() => void save()} disabled={saving || !form || !dirty}>
              <Save size={15} /> {saving ? '保存中…' : dirty ? '保存设置' : '已保存'}
            </Button>
          </>
        }
      />
      {notice ? <AdminNotice tone={notice.tone}>{notice.text}</AdminNotice> : null}
      {remote.error ? <AdminError message={remote.error} onRetry={() => void remote.reload()} /> : null}
      {remote.loading && !form ? <AdminLoading rows={6} /> : null}

      {form ? (
        <>
          <section className="vg-card flex flex-wrap items-center gap-4">
            <Switch
              checked={form.enabled}
              onChange={(v) => setForm({ ...form, enabled: v })}
              label={<b>统一下发到客户端</b>}
              hint="只对会员有效且已激活的设备生效；退出登录、解绑或会员失效时立即停用"
            />
            <div className="ml-auto flex items-center gap-2">
              <AdminTag tone={configuredCount ? 'success' : 'idle'}>{configuredCount} / {MANAGED_PLATFORM_KEYS.length} 个平台已配置</AdminTag>
              {form.enabled ? (
                <AdminTag tone="success" dot>
                  下发中
                </AdminTag>
              ) : (
                <AdminTag dot>未下发</AdminTag>
              )}
            </div>
          </section>

          <div className="vg-notice vg-notice--warning">
            <ShieldAlert size={15} />
            <span>Key 只保存在服务器，不会发到用户电脑：电脑端的生成请求由云端带上 Key 转发并扣点。仍建议在平台侧设置额度上限，并定期轮换。</span>
          </div>

          <PlatformSection form={form} setForm={setForm} />
          <DefaultModelsSection form={form} setForm={setForm} />
          <VideoModelMatrix form={form} setForm={setForm} />

          <AdminPanel icon={HardDrive} title="七牛云存储" subtitle="用于素材上传与分发">
            <div className="admin-form-grid">
              <AdminField label="AccessKey">
                <SecretInput field="qiniu.accessKey" value={form.qiniu.accessKey} onChange={(v) => setForm({ ...form, qiniu: { ...form.qiniu, accessKey: v } })} />
              </AdminField>
              <AdminField label="SecretKey">
                <SecretInput field="qiniu.secretKey" value={form.qiniu.secretKey} onChange={(v) => setForm({ ...form, qiniu: { ...form.qiniu, secretKey: v } })} />
              </AdminField>
              <AdminField label="空间（Bucket）">
                <Input value={form.qiniu.bucket} onChange={(e) => setForm({ ...form, qiniu: { ...form.qiniu, bucket: e.target.value } })} />
              </AdminField>
              <AdminField label="访问域名">
                <Input value={form.qiniu.domain} placeholder="https://cdn.example.com" onChange={(e) => setForm({ ...form, qiniu: { ...form.qiniu, domain: e.target.value } })} />
              </AdminField>
              <AdminField label="上传域名" hint="可选">
                <Input value={form.qiniu.uploadHost} onChange={(e) => setForm({ ...form, qiniu: { ...form.qiniu, uploadHost: e.target.value } })} />
              </AdminField>
              <AdminField label="路径前缀" hint="可选">
                <Input value={form.qiniu.prefix} placeholder="videogen/" onChange={(e) => setForm({ ...form, qiniu: { ...form.qiniu, prefix: e.target.value } })} />
              </AdminField>
            </div>
          </AdminPanel>

          <AdminPanel icon={Scissors} title="腾讯云抠图" subtitle="AI 修图「保真」模式用，按张收费；密钥只在服务器使用">
            <div className="admin-form-grid">
              <AdminField label="SecretId" hint="建议用只授权这个存储桶的子账号">
                <SecretInput field="matting.secretId" value={form.matting.secretId} onChange={(v) => setForm({ ...form, matting: { ...form.matting, secretId: v } })} />
              </AdminField>
              <AdminField label="SecretKey">
                <SecretInput field="matting.secretKey" value={form.matting.secretKey} onChange={(v) => setForm({ ...form, matting: { ...form.matting, secretKey: v } })} />
              </AdminField>
              <AdminField label="存储桶" hint="私有读写，已绑定数据万象">
                <Input value={form.matting.bucket} placeholder="matting-1250000000" onChange={(e) => setForm({ ...form, matting: { ...form.matting, bucket: e.target.value } })} />
              </AdminField>
              <AdminField label="地域">
                <Input value={form.matting.region} placeholder="ap-guangzhou" onChange={(e) => setForm({ ...form, matting: { ...form.matting, region: e.target.value } })} />
              </AdminField>
              <AdminField label="抠图类型">
                <select className={selectClass} value={form.matting.type} onChange={(e) => setForm({ ...form, matting: { ...form.matting, type: e.target.value as ManagedSoftwareSettings['matting']['type'] } })}>
                  {MATTING_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {MATTING_LABELS[type]}
                    </option>
                  ))}
                </select>
              </AdminField>
            </div>
          </AdminPanel>
        </>
      ) : null}
    </AdminPage>
  )
}

