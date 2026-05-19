'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ExternalLink, Power, Puzzle, Settings2 } from 'lucide-react'

import { AppShell } from '@/components/app/app-shell'
import { EmptyState, ErrorState, LoadingState } from '@/components/app/page-state'
import { ProtectedPageGate } from '@/components/app/protected-page-gate'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuthGuard } from '@/hooks/use-auth-guard'
import { apiClient } from '@/lib/api-client'
import type { PluginConfigField, PluginDetail } from '@shared/web-api/types'

function formatConfigValue(field: PluginConfigField, value: unknown) {
  if (value === undefined || value === null || value === '') return '未设置'
  if (field.type === 'boolean') return Boolean(value) ? '已开启' : '已关闭'
  if (field.type === 'select') {
    const matched = field.options?.find((item) => item.value === String(value))
    return matched?.label || String(value)
  }
  return String(value)
}

export function PluginWorkspaceShell({ pluginId }: { pluginId: string }) {
  const auth = useAuthGuard()
  const gate = ProtectedPageGate({
    auth,
    restoringTitle: '正在恢复插件工作台',
    restoringDescription: '系统正在校验登录状态并读取当前插件配置。',
  })

  const pluginQuery = useQuery({
    queryKey: ['plugin-workspace', pluginId],
    queryFn: () => apiClient.getPlugin(pluginId),
    enabled: auth.ready && auth.authed,
  })

  if (gate) return gate

  return (
    <AppShell headerSearchPlaceholder="搜索插件配置、工作台说明或相关能力...">
      <div className="page-shell grid gap-4">
        {pluginQuery.isLoading ? (
          <LoadingState title="正在加载插件工作台" description="请稍候，系统正在同步插件状态和配置。" compact />
        ) : pluginQuery.isError ? (
          <ErrorState title="插件工作台加载失败" description="当前无法读取插件详情，请稍后重试。" onRetry={() => pluginQuery.refetch()} compact />
        ) : !pluginQuery.data ? (
          <EmptyState title="插件不存在" description="当前插件定义不存在或暂时不可用。" actionLabel="返回我的插件" href="/my-plugins" compact />
        ) : (
          <PluginWorkspaceContent plugin={pluginQuery.data} />
        )}
      </div>
    </AppShell>
  )
}

function PluginWorkspaceContent({ plugin }: { plugin: PluginDetail }) {
  const installed = plugin.status === 'installed'
  const canUse = installed && plugin.runtimeState === 'enabled'

  return (
    <>
      <section className="panel rounded-[16px] border border-white/6 bg-[linear-gradient(180deg,rgba(11,18,31,0.96),rgba(7,13,23,0.98))] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[12px] font-medium text-cyan-200">
              <Puzzle className="h-3.5 w-3.5" />
              插件工作台
            </div>
            <div className="grid gap-1">
              <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-white">{plugin.name}</h1>
              <p className="max-w-[860px] text-[13px] leading-6 text-slate-300">{plugin.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/my-plugins" className={buttonVariants({ variant: 'ghost' })}>
                <ArrowLeft className="h-4 w-4" />
                返回我的插件
            </Link>
            <Link href="/plugins" className={buttonVariants({ variant: 'secondary' })}>
                <ExternalLink className="h-4 w-4" />
                返回插件市场
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <Card className="grid gap-4 border border-white/6 bg-[linear-gradient(180deg,rgba(12,20,33,0.96),rgba(8,14,24,0.98))] p-5">
          <div className="flex items-center gap-2 text-[12px] text-slate-400">
            <Settings2 className="h-3.5 w-3.5" />
            当前配置
          </div>

          {plugin.configSchema.length ? (
            <div className="grid gap-3">
              {plugin.configSchema.map((field) => (
                <div key={field.key} className="rounded-[14px] border border-white/6 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="grid gap-1">
                      <strong className="text-[14px] text-white">{field.label}</strong>
                      {field.description ? <p className="text-[12px] leading-5 text-slate-400">{field.description}</p> : null}
                    </div>
                    <span className="text-[13px] font-medium text-cyan-100">{formatConfigValue(field, plugin.config[field.key])}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="当前插件没有配置项" description="这个插件暂时不需要额外配置。" compact />
          )}
        </Card>

        <div className="grid gap-4">
          <Card className="grid gap-3 border border-white/6 bg-[linear-gradient(180deg,rgba(12,20,33,0.96),rgba(8,14,24,0.98))] p-5">
            <div className="flex items-center gap-2 text-[12px] text-slate-400">
              <Power className="h-3.5 w-3.5" />
              当前状态
            </div>
            <StatusRow label="安装状态" value={installed ? '已安装' : '未安装'} />
            <StatusRow label="运行状态" value={plugin.runtimeState === 'enabled' ? '已启用' : '已停用'} />
            <StatusRow label="工作台路径" value={plugin.workspacePath} mono />
          </Card>

          <Card className="grid gap-3 border border-dashed border-amber-400/25 bg-amber-400/[0.06] p-5">
            <div className="flex items-center gap-2 text-[12px] text-amber-100">
              <AlertTriangle className="h-3.5 w-3.5" />
              当前阶段说明
            </div>
            <p className="text-[13px] leading-6 text-amber-50/90">{plugin.usageHint}</p>
            <div className="rounded-[12px] border border-white/8 bg-black/10 px-4 py-3 text-[12px] leading-6 text-slate-200">
              {canUse
                ? '当前工作台只完成产品入口和配置闭环。后续再接真实执行链路时，这里将继续承接输入、执行和输出。'
                : '当前插件尚不可直接使用。若已安装但停用，请先回到“我的插件”启用后再进入。'}
            </div>
          </Card>
        </div>
      </section>
    </>
  )
}

function StatusRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-white/6 bg-white/[0.03] px-4 py-3">
      <span className="text-[12px] text-slate-400">{label}</span>
      <strong className={mono ? 'font-mono text-[12px] text-white' : 'text-[13px] text-white'}>{value}</strong>
    </div>
  )
}
