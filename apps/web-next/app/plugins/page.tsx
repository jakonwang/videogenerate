'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, CircleOff, Download, Puzzle, Settings2, SlidersHorizontal } from 'lucide-react'

import { AppShell } from '@/components/app/app-shell'
import { ProtectedPageGate } from '@/components/app/protected-page-gate'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import type { PluginConfigField, PluginDetail, PluginSummary } from '@shared/web-api/types'

type FilterKey = 'all' | 'installed' | 'uninstalled'

const filters: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: '全部插件' },
  { key: 'installed', label: '已安装' },
  { key: 'uninstalled', label: '未安装' },
]

function defaultValueForField(field: PluginConfigField) {
  if (field.type === 'boolean') return false
  return ''
}

export default function PluginsPage() {
  const auth = useAuthGuard()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedPluginId, setSelectedPluginId] = useState('')
  const [configDraft, setConfigDraft] = useState<Record<string, unknown>>({})
  const [notice, setNotice] = useState('')

  const gate = ProtectedPageGate({
    auth,
    restoringTitle: '正在恢复插件市场',
    restoringDescription: '系统正在校验登录状态并同步当前插件列表。',
  })

  const pluginsQuery = useQuery({
    queryKey: ['plugins'],
    queryFn: () => apiClient.listPlugins(),
    enabled: auth.ready && auth.authed,
  })

  const detailQuery = useQuery({
    queryKey: ['plugin-detail', selectedPluginId],
    queryFn: () => apiClient.getPlugin(selectedPluginId),
    enabled: Boolean(selectedPluginId),
  })

  async function refreshPlugins(pluginId?: string) {
    await queryClient.invalidateQueries({ queryKey: ['plugins'] })
    await queryClient.invalidateQueries({ queryKey: ['installed-plugins'] })
    if (pluginId) {
      await queryClient.invalidateQueries({ queryKey: ['plugin-detail', pluginId] })
    }
  }

  const installMutation = useMutation({
    mutationFn: (pluginId: string) => apiClient.installPlugin(pluginId),
    onSuccess: async ({ plugin }) => {
      setSelectedPluginId(plugin.id)
      setNotice(`“${plugin.name}”已安装，可前往“我的插件”继续使用。`)
      await refreshPlugins(plugin.id)
    },
  })

  const uninstallMutation = useMutation({
    mutationFn: (pluginId: string) => apiClient.uninstallPlugin(pluginId),
    onSuccess: async ({ plugin }) => {
      setSelectedPluginId(plugin.id)
      await refreshPlugins(plugin.id)
    },
  })

  const enableMutation = useMutation({
    mutationFn: (pluginId: string) => apiClient.enablePlugin(pluginId),
    onSuccess: async ({ plugin }) => {
      setSelectedPluginId(plugin.id)
      await refreshPlugins(plugin.id)
    },
  })

  const disableMutation = useMutation({
    mutationFn: (pluginId: string) => apiClient.disablePlugin(pluginId),
    onSuccess: async ({ plugin }) => {
      setSelectedPluginId(plugin.id)
      await refreshPlugins(plugin.id)
    },
  })

  const saveConfigMutation = useMutation({
    mutationFn: ({ pluginId, payload }: { pluginId: string; payload: Record<string, unknown> }) =>
      apiClient.setPluginConfig(pluginId, payload),
    onSuccess: async ({ plugin }) => {
      setSelectedPluginId(plugin.id)
      await refreshPlugins(plugin.id)
    },
  })

  const plugins = pluginsQuery.data || []
  const selectedPlugin = detailQuery.data || null

  useEffect(() => {
    if (!selectedPluginId && plugins.length) {
      setSelectedPluginId(plugins[0].id)
    }
  }, [plugins, selectedPluginId])

  useEffect(() => {
    if (!selectedPlugin) return
    const nextDraft: Record<string, unknown> = {}
    for (const field of selectedPlugin.configSchema) {
      nextDraft[field.key] = selectedPlugin.config[field.key] ?? defaultValueForField(field)
    }
    setConfigDraft(nextDraft)
  }, [selectedPlugin])

  const filteredPlugins = useMemo(() => {
    return plugins.filter((item) => {
      if (filter === 'installed') return item.status === 'installed'
      if (filter === 'uninstalled') return item.status === 'uninstalled'
      return true
    })
  }, [filter, plugins])

  const pluginStats = useMemo(
    () => ({
      total: plugins.length || 3,
      installed: plugins.filter((item) => item.status === 'installed').length,
      enabled: plugins.filter((item) => item.enabled).length,
    }),
    [plugins],
  )

  const actionBusy =
    installMutation.isPending ||
    uninstallMutation.isPending ||
    enableMutation.isPending ||
    disableMutation.isPending ||
    saveConfigMutation.isPending

  if (gate) return gate

  return (
    <AppShell headerSearchPlaceholder="搜索插件名称、功能或配置项...">
      <div className="page-shell grid gap-4">
        <section className="panel rounded-[16px] border border-white/6 bg-[linear-gradient(180deg,rgba(11,18,31,0.96),rgba(7,13,23,0.98))] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-2">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[12px] font-medium text-cyan-200">
                <Puzzle className="h-3.5 w-3.5" />
                插件市场
              </div>
              <div className="grid gap-1">
                <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-white">发现并安装插件，扩展你的创作能力</h1>
                <p className="max-w-[860px] text-[13px] leading-6 text-slate-300">
                  当前版本先完成插件注册、安装、启用、停用和配置闭环，不直接执行真实媒体处理任务，优先把工具中心结构稳定下来。
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="grid min-w-[220px] gap-2 rounded-[14px] border border-white/6 bg-white/[0.03] px-4 py-3 text-[12px] text-slate-300">
                <StatRow label="预置插件" value={String(pluginStats.total)} valueClassName="text-white" />
                <StatRow label="已安装" value={String(pluginStats.installed)} valueClassName="text-emerald-300" />
                <StatRow label="已启用" value={String(pluginStats.enabled)} valueClassName="text-cyan-300" />
              </div>
              <Link href="/my-plugins" className={buttonVariants({ variant: 'secondary' })}>
                  <Download className="h-4 w-4" />
                  我的插件
              </Link>
            </div>
          </div>
        </section>

        {notice ? (
          <div className="rounded-[14px] border border-cyan-400/25 bg-cyan-400/[0.06] px-4 py-3 text-[13px] leading-6 text-cyan-100">
            {notice}
          </div>
        ) : null}

        <section className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_380px]">
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[12px] transition',
                    filter === item.key
                      ? 'border-cyan-400/40 bg-cyan-400/12 text-cyan-200'
                      : 'border-white/8 bg-white/[0.03] text-slate-300 hover:bg-white/[0.05]',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="flex items-center gap-2 rounded-[14px] border border-white/6 bg-white/[0.03] px-4 py-3 text-[12px] text-slate-400">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  当前只完成“发现 - 安装 - 我的插件 - 使用”闭环，真实执行仍由工作台页承接。
                </div>
              </div>

              {pluginsQuery.isLoading
                ? Array.from({ length: 3 }).map((_, index) => <PluginSkeleton key={index} />)
                : filteredPlugins.map((plugin) => (
                    <PluginCard
                      key={plugin.id}
                      plugin={plugin}
                      active={selectedPluginId === plugin.id}
                      busy={actionBusy}
                      onSelect={() => setSelectedPluginId(plugin.id)}
                      onInstall={() => installMutation.mutate(plugin.id)}
                      onUninstall={() => uninstallMutation.mutate(plugin.id)}
                      onEnable={() => enableMutation.mutate(plugin.id)}
                      onDisable={() => disableMutation.mutate(plugin.id)}
                    />
                  ))}
            </div>
          </div>

          <Card className="grid h-fit gap-4 border border-white/6 bg-[linear-gradient(180deg,rgba(12,20,33,0.96),rgba(8,14,24,0.98))] p-5">
            {!selectedPlugin ? (
              <div className="grid gap-2 text-sm text-slate-300">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] text-slate-200">
                  <Settings2 className="h-5 w-5" />
                </div>
                <strong className="text-white">选择一个插件查看详情</strong>
                <p className="leading-6 text-slate-400">当前面板用于查看状态、保存配置，并预留后续真实能力的接入位置。</p>
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <div className="flex items-center gap-2 text-[12px] text-slate-400">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    工具详情
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <h2 className="text-[18px] font-semibold text-white">{selectedPlugin.name}</h2>
                      <p className="text-[13px] leading-6 text-slate-300">{selectedPlugin.description}</p>
                    </div>
                    <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-200">
                      v{selectedPlugin.version}
                    </span>
                  </div>
                </div>

                <div className="grid gap-2 rounded-[14px] border border-white/6 bg-white/[0.03] p-4 text-[12px] text-slate-300">
                  <StatusRow label="安装状态" value={selectedPlugin.status === 'installed' ? '已安装' : '未安装'} />
                  <StatusRow label="运行状态" value={selectedPlugin.runtimeState === 'enabled' ? '已启用' : '已停用'} />
                  <StatusRow label="入口形态" value="插件工作台" />
                  <StatusRow label="当前阶段" value="仅完成产品入口闭环，暂不执行真实任务" />
                </div>

                <div className="rounded-[14px] border border-dashed border-cyan-400/25 bg-cyan-400/[0.06] px-4 py-3 text-[12px] leading-6 text-cyan-100">
                  {selectedPlugin.usageHint}
                </div>

                <div className="grid gap-3">
                  <div className="text-[13px] font-medium text-white">插件配置</div>
                  {selectedPlugin.configSchema.map((field) => (
                    <PluginConfigFieldInput
                      key={field.key}
                      field={field}
                      value={configDraft[field.key]}
                      onChange={(value) => setConfigDraft((current) => ({ ...current, [field.key]: value }))}
                    />
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => saveConfigMutation.mutate({ pluginId: selectedPlugin.id, payload: configDraft })}
                    disabled={saveConfigMutation.isPending}
                  >
                    保存配置
                  </Button>
                  <Link
                    href={selectedPlugin.workspacePath}
                    className={buttonVariants({
                      variant: 'default',
                      className: !(selectedPlugin.status === 'installed' && selectedPlugin.enabled) ? 'pointer-events-none opacity-50' : '',
                    })}
                  >
                    使用插件
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </>
            )}
          </Card>
        </section>
      </div>
    </AppShell>
  )
}

function PluginCard({
  plugin,
  active,
  busy,
  onSelect,
  onInstall,
  onUninstall,
  onEnable,
  onDisable,
}: {
  plugin: PluginSummary
  active: boolean
  busy: boolean
  onSelect: () => void
  onInstall: () => void
  onUninstall: () => void
  onEnable: () => void
  onDisable: () => void
}) {
  const installed = plugin.status === 'installed'

  return (
    <Card
      className={cn(
        'grid gap-4 border border-white/6 bg-[linear-gradient(180deg,rgba(11,18,30,0.98),rgba(8,13,23,0.98))] p-4 transition',
        active && 'border-cyan-400/30 shadow-[0_18px_40px_rgba(8,145,178,0.14)]',
      )}
    >
      <button type="button" onClick={onSelect} className="grid gap-3 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <div className="flex items-center gap-2">
              <strong className="text-[15px] text-white">{plugin.name}</strong>
              <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-slate-300">
                {plugin.entryType}
              </span>
            </div>
            <p className="text-[12px] leading-5 text-slate-400">{plugin.description}</p>
          </div>
          {plugin.enabled ? (
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-300" />
          ) : (
            <CircleOff className="h-4.5 w-4.5 text-slate-500" />
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
          <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-1">{installed ? '已安装' : '未安装'}</span>
          <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-1">{plugin.enabled ? '已启用' : '已停用'}</span>
          <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-1">v{plugin.version}</span>
        </div>
      </button>

      <div className="flex flex-wrap gap-2">
        {!installed ? (
          <Button size="sm" onClick={onInstall} disabled={busy}>
            安装
          </Button>
        ) : (
          <>
            {plugin.enabled ? (
              <Button size="sm" variant="secondary" onClick={onDisable} disabled={busy}>
                停用
              </Button>
            ) : (
              <Button size="sm" onClick={onEnable} disabled={busy}>
                启用
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onUninstall} disabled={busy}>
              卸载
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

function PluginConfigFieldInput({
  field,
  value,
  onChange,
}: {
  field: PluginConfigField
  value: unknown
  onChange: (value: unknown) => void
}) {
  return (
    <label className="grid gap-1.5 text-[12px] text-slate-300">
      <span className="font-medium text-white">{field.label}</span>
      {field.type === 'select' ? (
        <select
          className="h-[42px] rounded-xl border border-white/10 bg-[var(--bg-input)] px-4 text-sm text-white outline-none"
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">请选择</option>
          {(field.options || []).map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea
          className="min-h-[110px] rounded-xl border border-white/10 bg-[var(--bg-input)] px-4 py-3 text-sm text-white outline-none"
          placeholder={field.placeholder}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === 'boolean' ? (
        <button
          type="button"
          className={cn(
            'flex h-[42px] items-center rounded-xl border px-4 text-sm transition',
            value ? 'border-cyan-400/40 bg-cyan-400/12 text-cyan-100' : 'border-white/10 bg-white/[0.02] text-slate-300',
          )}
          onClick={() => onChange(!Boolean(value))}
        >
          {Boolean(value) ? '已开启' : '已关闭'}
        </button>
      ) : (
        <Input
          type={field.type === 'number' ? 'number' : 'text'}
          placeholder={field.placeholder}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.description ? <span className="leading-5 text-slate-500">{field.description}</span> : null}
    </label>
  )
}

function StatusRow({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <strong className={cn('text-white', valueClassName)}>{value}</strong>
    </div>
  )
}

function StatRow({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <strong className={cn('text-white', valueClassName)}>{value}</strong>
    </div>
  )
}

function PluginSkeleton() {
  return <div className="h-[220px] animate-pulse rounded-[16px] border border-white/6 bg-white/[0.03]" />
}
