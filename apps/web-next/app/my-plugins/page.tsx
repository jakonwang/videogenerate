'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, CircleOff, Power, Puzzle, Store } from 'lucide-react'

import { AppShell } from '@/components/app/app-shell'
import { EmptyState, ErrorState, LoadingState } from '@/components/app/page-state'
import { ProtectedPageGate } from '@/components/app/protected-page-gate'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import type { PluginSummary } from '@shared/web-api/types'

export default function MyPluginsPage() {
  const auth = useAuthGuard()
  const queryClient = useQueryClient()

  const gate = ProtectedPageGate({
    auth,
    restoringTitle: '正在恢复我的插件',
    restoringDescription: '系统正在同步当前账号已安装的插件列表。',
  })

  const pluginsQuery = useQuery({
    queryKey: ['installed-plugins'],
    queryFn: () => apiClient.listInstalledPlugins(),
    enabled: auth.ready && auth.authed,
  })

  async function refreshPlugins(pluginId?: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['installed-plugins'] }),
      queryClient.invalidateQueries({ queryKey: ['plugins'] }),
      pluginId ? queryClient.invalidateQueries({ queryKey: ['plugin-detail', pluginId] }) : Promise.resolve(),
    ])
  }

  const enableMutation = useMutation({
    mutationFn: (pluginId: string) => apiClient.enablePlugin(pluginId),
    onSuccess: async ({ plugin }) => {
      await refreshPlugins(plugin.id)
    },
  })

  const disableMutation = useMutation({
    mutationFn: (pluginId: string) => apiClient.disablePlugin(pluginId),
    onSuccess: async ({ plugin }) => {
      await refreshPlugins(plugin.id)
    },
  })

  const uninstallMutation = useMutation({
    mutationFn: (pluginId: string) => apiClient.uninstallPlugin(pluginId),
    onSuccess: async ({ plugin }) => {
      await refreshPlugins(plugin.id)
    },
  })

  const actionBusy = enableMutation.isPending || disableMutation.isPending || uninstallMutation.isPending
  const plugins = pluginsQuery.data || []
  const pluginStats = useMemo(
    () => ({
      total: plugins.length,
      enabled: plugins.filter((item) => item.enabled).length,
      disabled: plugins.filter((item) => !item.enabled).length,
    }),
    [plugins],
  )

  if (gate) return gate

  return (
    <AppShell headerSearchPlaceholder="搜索已安装插件、配置项或工作台...">
      <div className="page-shell grid gap-4">
        <section className="panel rounded-[16px] border border-white/6 bg-[linear-gradient(180deg,rgba(11,18,31,0.96),rgba(7,13,23,0.98))] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-2">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[12px] font-medium text-cyan-200">
                <Puzzle className="h-3.5 w-3.5" />
                我的插件
              </div>
              <div className="grid gap-1">
                <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-white">已安装插件与使用入口</h1>
                <p className="max-w-[860px] text-[13px] leading-6 text-slate-300">
                  这里集中展示当前账号已安装的插件。启用后的插件可以直接进入工作台，当前版本先完成安装后的产品入口闭环。
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="grid min-w-[220px] gap-2 rounded-[14px] border border-white/6 bg-white/[0.03] px-4 py-3 text-[12px] text-slate-300">
                <StatRow label="已安装" value={String(pluginStats.total)} valueClassName="text-white" />
                <StatRow label="已启用" value={String(pluginStats.enabled)} valueClassName="text-emerald-300" />
                <StatRow label="已停用" value={String(pluginStats.disabled)} valueClassName="text-slate-200" />
              </div>
              <Link href="/plugins" className={buttonVariants({ variant: 'secondary' })}>
                  <Store className="h-4 w-4" />
                  返回插件市场
              </Link>
            </div>
          </div>
        </section>

        {pluginsQuery.isLoading ? (
          <LoadingState title="正在加载我的插件" description="请稍候，系统正在读取已安装插件列表。" compact />
        ) : pluginsQuery.isError ? (
          <ErrorState title="我的插件加载失败" description="当前无法读取已安装插件，请稍后重试。" onRetry={() => pluginsQuery.refetch()} compact />
        ) : !plugins.length ? (
          <EmptyState title="你还没有安装插件" description="先去插件市场安装插件，安装后就能在这里直接点击使用。" actionLabel="前往插件市场" href="/plugins" compact />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {plugins.map((plugin) => (
              <InstalledPluginCard
                key={plugin.id}
                plugin={plugin}
                busy={actionBusy}
                onEnable={() => enableMutation.mutate(plugin.id)}
                onDisable={() => disableMutation.mutate(plugin.id)}
                onUninstall={() => uninstallMutation.mutate(plugin.id)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}

function InstalledPluginCard({
  plugin,
  busy,
  onEnable,
  onDisable,
  onUninstall,
}: {
  plugin: PluginSummary
  busy: boolean
  onEnable: () => void
  onDisable: () => void
  onUninstall: () => void
}) {
  const canUse = plugin.enabled

  return (
    <Card className="grid gap-4 border border-white/6 bg-[linear-gradient(180deg,rgba(11,18,30,0.98),rgba(8,13,23,0.98))] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <strong className="text-[16px] text-white">{plugin.name}</strong>
            <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-slate-300">
              {plugin.entryType}
            </span>
          </div>
          <p className="text-[13px] leading-6 text-slate-400">{plugin.description}</p>
        </div>
        {plugin.enabled ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-300" />
        ) : (
          <CircleOff className="h-5 w-5 text-slate-500" />
        )}
      </div>

      <div className="grid gap-3 rounded-[14px] border border-white/6 bg-white/[0.03] p-4 text-[12px] text-slate-300">
        <StatusRow label="安装状态" value="已安装" />
        <StatusRow label="运行状态" value={plugin.enabled ? '已启用' : '已停用'} />
        <StatusRow label="工作台入口" value={plugin.workspacePath} mono />
      </div>

      <div className="rounded-[14px] border border-dashed border-cyan-400/25 bg-cyan-400/[0.06] px-4 py-3 text-[12px] leading-6 text-cyan-100">
        {canUse ? '当前已启用，可直接进入插件工作台。' : '当前已安装但未启用，点击使用前请先启用插件。'}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={plugin.workspacePath}
          className={buttonVariants({
            variant: 'default',
            className: !canUse ? 'pointer-events-none opacity-50' : '',
          })}
        >
            使用
            <ArrowRight className="h-4 w-4" />
        </Link>
        {plugin.enabled ? (
          <Button size="sm" variant="secondary" onClick={onDisable} disabled={busy}>
            <Power className="h-4 w-4" />
            停用
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={onEnable} disabled={busy}>
            <Power className="h-4 w-4" />
            启用
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onUninstall} disabled={busy}>
          卸载
        </Button>
      </div>
    </Card>
  )
}

function StatusRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <strong className={cn(mono ? 'font-mono text-[12px]' : '', 'text-white')}>{value}</strong>
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
