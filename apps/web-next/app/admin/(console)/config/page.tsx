'use client'

import { useEffect, useMemo, useState } from 'react'
import { Braces, Download, Megaphone, Save, ToggleRight } from 'lucide-react'

import { CLOUD_FEATURES } from '@shared/cloud/types'
import type { CloudConfigEntry } from '@shared/cloud/types'
import { AdminError, AdminField, AdminLoading, AdminNotice, AdminPage, AdminPageHeader, AdminPanel, AdminTag, formatDateTime, textareaClass, useAdminData } from '@/components/admin/admin-ui'
import { Button, Input, Switch } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'

const FEATURE_LABELS: Record<string, string> = {
  clone: '爆款复刻',
  production: '批量生产',
  models: '模特库',
  'asset-library': '素材库',
  'product-research': '选品调研',
  plugins: '插件',
  'gmv-max': 'GMV Max',
  'creator-hub': '达人中心',
}

/** 页面上以表单形式编辑的配置项 */
const TEXT_KEYS = ['client.announcement', 'support.contact', 'client.minVersion', 'client.downloadUrl', 'client.latestVersion', 'client.releaseNotes', 'mac.downloadUrlArm64', 'mac.downloadUrlX64', 'mobile.androidDownloadUrl', 'mobile.androidVersion'] as const
const FLAGS_KEY = 'client.featureFlags'
const MANAGED_KEYS = new Set<string>([...TEXT_KEYS, FLAGS_KEY])

type Draft = Record<(typeof TEXT_KEYS)[number], string> & { flags: Record<string, boolean> }

function toDraft(entries: CloudConfigEntry[]): Draft {
  const get = (key: string) => {
    const v = entries.find((e) => e.key === key)?.value
    return v === null || v === undefined ? '' : String(v)
  }
  const flagsRaw = (entries.find((e) => e.key === FLAGS_KEY)?.value ?? {}) as Record<string, unknown>
  const flags: Record<string, boolean> = {}
  for (const f of CLOUD_FEATURES) flags[f] = flagsRaw[f] !== false
  return {
    'client.announcement': get('client.announcement'),
    'support.contact': get('support.contact'),
    'client.minVersion': get('client.minVersion'),
    'client.downloadUrl': get('client.downloadUrl'),
    'client.latestVersion': get('client.latestVersion'),
    'client.releaseNotes': get('client.releaseNotes'),
    'mac.downloadUrlArm64': get('mac.downloadUrlArm64'),
    'mac.downloadUrlX64': get('mac.downloadUrlX64'),
    'mobile.androidDownloadUrl': get('mobile.androidDownloadUrl'),
    'mobile.androidVersion': get('mobile.androidVersion'),
    flags,
  }
}

export default function AdminConfigPage() {
  const config = useAdminData(() => adminClient.admin.listConfig(), [])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [advancedKey, setAdvancedKey] = useState('')
  const [advancedValue, setAdvancedValue] = useState('')

  useEffect(() => {
    if (config.data) setDraft(toDraft(config.data.entries))
  }, [config.data])

  const original = useMemo(() => (config.data ? toDraft(config.data.entries) : null), [config.data])
  const dirty = Boolean(draft && original && JSON.stringify(draft) !== JSON.stringify(original))
  const extraEntries = config.data?.entries.filter((e) => !MANAGED_KEYS.has(e.key)) ?? []

  const save = async () => {
    if (!draft || !original) return
    setSaving(true)
    setNotice(null)
    try {
      for (const key of TEXT_KEYS) {
        if (draft[key] !== original[key]) await adminClient.admin.saveConfig({ key, value: draft[key].trim() })
      }
      if (JSON.stringify(draft.flags) !== JSON.stringify(original.flags)) {
        // 只记录被关闭的模块，默认全部开启
        const disabled = Object.fromEntries(Object.entries(draft.flags).filter(([, on]) => !on).map(([k]) => [k, false]))
        await adminClient.admin.saveConfig({ key: FLAGS_KEY, value: disabled })
      }
      await config.reload()
      setNotice({ tone: 'success', text: '已保存，客户端与官网下次读取配置时生效' })
    } catch (err) {
      setNotice({ tone: 'danger', text: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const saveAdvanced = async () => {
    try {
      const value = JSON.parse(advancedValue)
      await adminClient.admin.saveConfig({ key: advancedKey.trim(), value, scope: 'public' })
      setAdvancedKey('')
      setAdvancedValue('')
      await config.reload()
      setNotice({ tone: 'success', text: `自定义配置 ${advancedKey} 已保存` })
    } catch (err) {
      setNotice({ tone: 'danger', text: err instanceof SyntaxError ? '值必须是合法 JSON，例如 "文本"、123、true、{"a":1}' : (err as Error).message })
    }
  }

  const set = (key: (typeof TEXT_KEYS)[number], value: string) => draft && setDraft({ ...draft, [key]: value })

  return (
    <AdminPage>
      <AdminPageHeader
        icon={Megaphone}
        title="公告与开关"
        description="下发给所有客户端与官网的公开配置。平台密钥等敏感信息请在「软件设置」中配置。"
        actions={
          <Button variant={dirty ? 'default' : 'secondary'} onClick={() => void save()} disabled={!dirty || saving}>
            <Save size={15} /> {saving ? '保存中…' : dirty ? '保存更改' : '已保存'}
          </Button>
        }
      />
      {notice ? <AdminNotice tone={notice.tone}>{notice.text}</AdminNotice> : null}
      {config.error ? <AdminError message={config.error} onRetry={() => void config.reload()} /> : null}
      {config.loading && !draft ? <AdminLoading rows={6} /> : null}

      {draft ? (
        <>
          <div className="vg-grid vg-grid--2">
            <AdminPanel icon={Megaphone} title="公告与客服">
              <div className="grid gap-4">
                <AdminField label="客户端公告" hint="显示在客户端顶部，留空则不显示">
                  <textarea className="vg-textarea w-full" rows={3} value={draft['client.announcement']} onChange={(e) => set('client.announcement', e.target.value)} />
                </AdminField>
                <AdminField label="客服联系方式" hint="显示在会员页与官网下载页，例如微信号或电话">
                  <Input value={draft['support.contact']} onChange={(e) => set('support.contact', e.target.value)} />
                </AdminField>
              </div>
            </AdminPanel>

            <AdminPanel icon={Download} title="版本与下载">
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <AdminField label="最新版本" hint="官网下载页展示">
                    <Input value={draft['client.latestVersion']} placeholder="5.0.129" onChange={(e) => set('client.latestVersion', e.target.value)} />
                  </AdminField>
                  <AdminField label="最低可用版本" hint="低于此版本提示强制更新">
                    <Input value={draft['client.minVersion']} placeholder="留空不限制" onChange={(e) => set('client.minVersion', e.target.value)} />
                  </AdminField>
                </div>
                <AdminField label="安装包下载地址" hint="只支持 http(s) 链接">
                  <Input value={draft['client.downloadUrl']} placeholder="https://" onChange={(e) => set('client.downloadUrl', e.target.value)} />
                </AdminField>
                <AdminField label="更新说明">
                  <textarea className="vg-textarea w-full" rows={3} value={draft['client.releaseNotes']} onChange={(e) => set('client.releaseNotes', e.target.value)} />
                </AdminField>
                <div className="grid grid-cols-2 gap-3">
                  <AdminField label="Mac 版下载地址（Apple 芯片）" hint=".dmg 安装包链接，版本号同上">
                    <Input value={draft['mac.downloadUrlArm64']} placeholder="https://" onChange={(e) => set('mac.downloadUrlArm64', e.target.value)} />
                  </AdminField>
                  <AdminField label="Mac 版下载地址（Intel 芯片）" hint="留空则只提供 Apple 芯片版">
                    <Input value={draft['mac.downloadUrlX64']} placeholder="https://" onChange={(e) => set('mac.downloadUrlX64', e.target.value)} />
                  </AdminField>
                </div>
                <div className="grid grid-cols-[2fr_1fr] gap-3">
                  <AdminField label="安卓 App 下载地址" hint="APK 安装包链接，官网下载页会显示按钮和二维码">
                    <Input value={draft['mobile.androidDownloadUrl']} placeholder="https://" onChange={(e) => set('mobile.androidDownloadUrl', e.target.value)} />
                  </AdminField>
                  <AdminField label="安卓 App 版本" hint="官网下载页展示">
                    <Input value={draft['mobile.androidVersion']} placeholder="1.0.0" onChange={(e) => set('mobile.androidVersion', e.target.value)} />
                  </AdminField>
                </div>
              </div>
            </AdminPanel>
          </div>

          <AdminPanel icon={ToggleRight} title="功能开关" subtitle="关闭后所有客户端隐藏对应模块（优先于套餐权限）">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {CLOUD_FEATURES.map((f) => (
                <div key={f} className="admin-tile py-3">
                  <Switch checked={draft.flags[f]} onChange={(v) => setDraft({ ...draft, flags: { ...draft.flags, [f]: v } })} label={FEATURE_LABELS[f] ?? f} hint={draft.flags[f] ? '已开启' : '已关闭'} />
                </div>
              ))}
            </div>
          </AdminPanel>

          <AdminPanel icon={Braces} title="自定义配置" subtitle="高级：以 JSON 形式下发的其它公开配置">
            {extraEntries.length ? (
              <div className="vg-list -mx-3 mb-4">
                {extraEntries.map((entry) => (
                  <div key={entry.key} className="vg-list__item">
                    <span className="vg-list__main">
                      <span className="vg-list__title admin-mono">{entry.key}</span>
                      <span className="vg-list__sub admin-mono">{JSON.stringify(entry.value)}</span>
                    </span>
                    <AdminTag tone={entry.scope === 'public' ? 'info' : 'warning'}>{entry.scope === 'public' ? '公开' : '私有'}</AdminTag>
                    <span className="vg-muted whitespace-nowrap text-[12px]">{formatDateTime(entry.updatedAt)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAdvancedKey(entry.key)
                        setAdvancedValue(JSON.stringify(entry.value, null, 2))
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        window.confirm(`确定删除 ${entry.key}？`) &&
                        void adminClient.admin.deleteConfig(entry.key).then(() => config.reload())
                      }
                    >
                      删除
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-[260px_1fr_auto] md:items-end">
              <AdminField label="键">
                <Input value={advancedKey} placeholder="例如 client.banner" onChange={(e) => setAdvancedKey(e.target.value)} />
              </AdminField>
              <AdminField label="值（JSON）">
                <textarea className={textareaClass} rows={1} value={advancedValue} placeholder='"文本" / 123 / {"a":1}' onChange={(e) => setAdvancedValue(e.target.value)} />
              </AdminField>
              <Button variant="secondary" disabled={!advancedKey.trim() || !advancedValue.trim()} onClick={() => void saveAdvanced()}>
                保存
              </Button>
            </div>
          </AdminPanel>
        </>
      ) : null}
    </AdminPage>
  )
}
