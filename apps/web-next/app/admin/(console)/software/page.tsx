'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clapperboard, HardDrive, ImageIcon, KeyRound, MessagesSquare, Save, Scissors, ShieldAlert, SlidersHorizontal } from 'lucide-react'

import {
  MANAGED_PLATFORM_KEYS,
  MANAGED_PLATFORM_LABELS,
  MATTING_TYPES,
  SECRET_MASK_PREFIX,
  type ManagedPlatformKey,
  type ManagedSoftwareSettings,
} from '@shared/cloud/managedSettings'
import { AdminError, AdminField, AdminLoading, AdminNotice, AdminPage, AdminPageHeader, AdminPanel, AdminTag, formatDateTime, selectClass, useAdminData } from '@/components/admin/admin-ui'
import { Button, Input, Switch } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'

const VIDEO_PLATFORMS: ManagedPlatformKey[] = ['grsai', 'ai666', 'vectorengine', 'xibapi', 'gaorui']
const IMAGE_CHAT_PLATFORMS: ManagedPlatformKey[] = ['grsai', 'ai666', 'vectorengine']

const MATTING_LABELS: Record<ManagedSoftwareSettings['matting']['type'], string> = {
  AIPicMatting: '通用抠图（0.02 元/张）',
  AIPortraitMatting: '人像抠图（0.02 元/张）',
  GoodsMatting: '商品抠图（0.01 元/张）',
}

/** 密钥输入框：显示掩码，聚焦时全选方便直接粘贴新值；保留掩码表示不修改 */
function SecretInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const masked = value.startsWith(SECRET_MASK_PREFIX)
  return (
    <Input
      value={value}
      placeholder="未设置"
      autoComplete="off"
      spellCheck={false}
      className="admin-mono"
      onFocus={(e) => masked && e.currentTarget.select()}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function KeyState({ value }: { value: string }) {
  return value ? (
    <AdminTag tone="success" dot>
      已配置
    </AdminTag>
  ) : (
    <AdminTag dot>未配置</AdminTag>
  )
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

  const setPlatform = (key: ManagedPlatformKey, field: 'apiKey' | 'baseUrl', value: string) =>
    setForm((f) => (f ? { ...f, platforms: { ...f.platforms, [key]: { ...f.platforms[key], [field]: value } } } : f))

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

          <AdminPanel icon={KeyRound} title="AI 平台密钥" subtitle="显示为 •••• 的表示已设置，保持不动即不修改">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
              {MANAGED_PLATFORM_KEYS.map((key) => (
                <div key={key} className="admin-tile">
                  <div className="admin-tile__head">
                    <b>{MANAGED_PLATFORM_LABELS[key].label}</b>
                    <small>{MANAGED_PLATFORM_LABELS[key].desc}</small>
                    <KeyState value={form.platforms[key].apiKey} />
                  </div>
                  <AdminField label="API Key">
                    <SecretInput value={form.platforms[key].apiKey} onChange={(v) => setPlatform(key, 'apiKey', v)} />
                  </AdminField>
                  <AdminField label="Base URL">
                    <Input value={form.platforms[key].baseUrl} placeholder={MANAGED_PLATFORM_LABELS[key].hostPlaceholder} onChange={(e) => setPlatform(key, 'baseUrl', e.target.value)} />
                  </AdminField>
                </div>
              ))}
              <div className="admin-tile content-start">
                <div className="admin-tile__head">
                  <b>TikHub</b>
                  <small>TikTok 链接解析与下载</small>
                  <KeyState value={form.tikhubApiKey} />
                </div>
                <AdminField label="Bearer Token">
                  <SecretInput value={form.tikhubApiKey} onChange={(v) => setForm({ ...form, tikhubApiKey: v })} />
                </AdminField>
              </div>
            </div>
          </AdminPanel>

          <AdminPanel icon={Clapperboard} title="默认平台与模型" subtitle="模型留空则沿用客户端默认值">
            <div className="vg-table-wrap">
              <table className="vg-table">
                <thead>
                  <tr>
                    <th className="w-[200px]">能力</th>
                    <th>平台</th>
                    <th>模型</th>
                    <th className="w-[160px]">图片质量</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      { cap: 'video' as const, title: '视频生成', icon: Clapperboard, platforms: VIDEO_PLATFORMS, placeholder: '例如 veo3-fast' },
                      { cap: 'image' as const, title: '图片生成', icon: ImageIcon, platforms: IMAGE_CHAT_PLATFORMS, placeholder: '例如 gpt-image-1' },
                      { cap: 'chat' as const, title: '脚本分析 / 对话', icon: MessagesSquare, platforms: IMAGE_CHAT_PLATFORMS, placeholder: '例如 gemini-2.5-pro' },
                    ]
                  ).map(({ cap, title, icon: Icon, platforms, placeholder }) => (
                    <tr key={cap}>
                      <td>
                        <span className="inline-flex items-center gap-2 font-semibold">
                          <span className="vg-stat__icon !h-7 !w-7">
                            <Icon size={14} />
                          </span>
                          {title}
                        </span>
                      </td>
                      <td>
                        <select
                          className={selectClass}
                          value={form.capabilities[cap].platform}
                          onChange={(e) =>
                            setForm({ ...form, capabilities: { ...form.capabilities, [cap]: { ...form.capabilities[cap], platform: e.target.value } } } as ManagedSoftwareSettings)
                          }
                        >
                          {platforms.map((p) => (
                            <option key={p} value={p}>
                              {MANAGED_PLATFORM_LABELS[p].label}
                              {form.platforms[p].apiKey ? '' : '（未配置 Key）'}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <Input
                          value={form.capabilities[cap].model}
                          placeholder={placeholder}
                          className="admin-mono"
                          onChange={(e) =>
                            setForm({ ...form, capabilities: { ...form.capabilities, [cap]: { ...form.capabilities[cap], model: e.target.value } } } as ManagedSoftwareSettings)
                          }
                        />
                      </td>
                      <td>
                        {cap === 'image' ? (
                          <select
                            className={selectClass}
                            value={form.capabilities.image.quality}
                            onChange={(e) => setForm({ ...form, capabilities: { ...form.capabilities, image: { ...form.capabilities.image, quality: e.target.value as 'low' | 'medium' | 'high' } } })}
                          >
                            <option value="high">高</option>
                            <option value="medium">中</option>
                            <option value="low">低</option>
                          </select>
                        ) : (
                          <span className="vg-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminPanel>

          <AdminPanel icon={HardDrive} title="七牛云存储" subtitle="用于素材上传与分发">
            <div className="admin-form-grid">
              <AdminField label="AccessKey">
                <SecretInput value={form.qiniu.accessKey} onChange={(v) => setForm({ ...form, qiniu: { ...form.qiniu, accessKey: v } })} />
              </AdminField>
              <AdminField label="SecretKey">
                <SecretInput value={form.qiniu.secretKey} onChange={(v) => setForm({ ...form, qiniu: { ...form.qiniu, secretKey: v } })} />
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
                <SecretInput value={form.matting.secretId} onChange={(v) => setForm({ ...form, matting: { ...form.matting, secretId: v } })} />
              </AdminField>
              <AdminField label="SecretKey">
                <SecretInput value={form.matting.secretKey} onChange={(v) => setForm({ ...form, matting: { ...form.matting, secretKey: v } })} />
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
