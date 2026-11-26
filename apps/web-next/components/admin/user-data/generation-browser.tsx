'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FileText, Film, ImageIcon, X } from 'lucide-react'

import { ADMIN_GENERATION_SOURCE_LABELS, type AdminGeneration, type AdminGenerationQuery } from '@shared/cloud/adminData'
import { AdminError, AdminLoading, AdminPager, AdminSearch, AdminTag, formatDateTime, useAdminData } from '@/components/admin/admin-ui'
import { Button } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'
import { cn } from '@/lib/utils'
import { MediaPreview, MediaThumb, useFileLinks } from './file-links'

const SOURCES: Array<{ value: AdminGenerationQuery['source']; label: string }> = [
  { value: '', label: '全部来源' },
  { value: 'proxy', label: ADMIN_GENERATION_SOURCE_LABELS.proxy },
  { value: 'job', label: ADMIN_GENERATION_SOURCE_LABELS.job },
  { value: 'scene-swap', label: ADMIN_GENERATION_SOURCE_LABELS['scene-swap'] },
]
const KINDS: Array<{ value: AdminGenerationQuery['kind']; label: string }> = [
  { value: '', label: '图片和视频' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
]
const STATUSES: Array<{ value: AdminGenerationQuery['status']; label: string }> = [
  { value: '', label: '全部状态' },
  { value: 'succeeded', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'running', label: '进行中' },
]
/** 经 AI 代理的生成：x-vg-client=web 是服务器复刻引擎发的 */
const PROXY_CLIENT_LABELS: Record<string, string> = { desktop: '电脑端生成', web: '服务器复刻', mobile: '手机端生成' }

function sourceLabel(item: AdminGeneration) {
  return item.source === 'proxy' ? PROXY_CLIENT_LABELS[item.client] ?? ADMIN_GENERATION_SOURCE_LABELS.proxy : ADMIN_GENERATION_SOURCE_LABELS[item.source]
}

/** 弹窗按 Esc 关闭 */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

/** 结果超过 12 小时还没回来：电脑端没再查询进度（关了软件等），结果不得而知 */
const STALE_MS = 12 * 60 * 60 * 1000

function StatusTag({ item }: { item: AdminGeneration }) {
  if (item.status === 'succeeded')
    return (
      <AdminTag tone="success" dot>
        成功
      </AdminTag>
    )
  if (item.status === 'failed')
    return (
      <AdminTag tone="danger" dot>
        失败
      </AdminTag>
    )
  if (Date.now() - item.createdAt > STALE_MS) return <AdminTag tone="idle">结果未回传</AdminTag>
  return (
    <AdminTag tone="info" dot>
      进行中
    </AdminTag>
  )
}

/** 封面用哪个文件：电脑端生成用服务器截的缩略图，其余用产出文件 */
function coverOf(item: AdminGeneration) {
  if (item.thumbFileId) return { userId: item.userId, fileId: item.thumbFileId, mime: 'image/jpeg' }
  if (item.outputFileId) return { userId: item.userId, fileId: item.outputFileId, mime: item.outputMime || (item.kind === 'video' ? 'video/mp4' : 'image/png') }
  return null
}

/** 没有产出文件时的封面：失败 / 进行中 / 本来就不产出文件（拆解、分析） */
function NoOutput({ item }: { item: AdminGeneration }) {
  const Icon = item.kind === 'video' ? Film : item.kind === 'image' ? ImageIcon : FileText
  const text = item.status === 'failed' ? '生成失败' : item.status === 'running' ? (item.source === 'proxy' ? '等结果回传' : '生成中') : item.source === 'proxy' ? '没有截到缩略图' : '没有产出文件'
  return (
    <div className="ud-thumb ud-thumb--empty flex-col gap-1">
      <Icon size={20} />
      <span className="text-[11px]">{text}</span>
    </div>
  )
}

function Seg<T extends string | undefined>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="vg-seg w-fit">
      {options.map((option) => (
        <button key={option.label} type="button" className={cn('vg-seg__btn', value === option.value && 'is-active')} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function GenerationBrowser({ userId, showAccount = !userId }: { userId?: string; showAccount?: boolean }) {
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState<AdminGenerationQuery>({ userId, source: '', kind: '', status: '', keyword: '', page: 1, pageSize: 24 })
  const list = useAdminData(() => adminClient.admin.listGenerations(query), [query])
  const [open, setOpen] = useState<AdminGeneration | null>(null)

  const items = list.data?.items ?? []
  const refs = useMemo(
    () =>
      items.flatMap((item) => {
        const cover = coverOf(item)
        const out = item.outputFileId ? [{ userId: item.userId, fileId: item.outputFileId }] : []
        return [...(cover ? [cover] : []), ...out]
      }),
    [items],
  )
  const linkOf = useFileLinks(refs)

  return (
    <div className="grid gap-3">
      <div className="ud-filters">
        <Seg value={query.source} options={SOURCES} onChange={(source) => setQuery({ ...query, source, page: 1 })} />
        <Seg value={query.kind} options={KINDS} onChange={(kind) => setQuery({ ...query, kind, page: 1 })} />
        <Seg value={query.status} options={STATUSES} onChange={(status) => setQuery({ ...query, status, page: 1 })} />
        <form
          className="flex min-w-[240px] flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery({ ...query, keyword, page: 1 })
          }}
        >
          <AdminSearch value={keyword} onChange={setKeyword} placeholder={showAccount ? '提示词、模型或账号' : '提示词或模型'} />
          <Button type="submit" variant="secondary">
            搜索
          </Button>
        </form>
      </div>

      {list.error ? <AdminError message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.loading && !list.data ? <AdminLoading rows={4} /> : null}
      {list.data ? (
        <>
          {items.length ? (
            <div className="ud-grid">
              {items.map((item) => {
                const cover = coverOf(item)
                return (
                  <button key={item.key} type="button" className="ud-card" onClick={() => setOpen(item)}>
                    {cover ? <MediaThumb url={linkOf(cover)} mime={cover.mime} /> : <NoOutput item={item} />}
                    <div className="ud-card__body">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold">{item.label}</span>
                        <StatusTag item={item} />
                      </div>
                      <p className="ud-card__prompt">{item.prompt || item.error || <span className="vg-muted">没有提示词</span>}</p>
                      <div className="ud-card__meta">
                        <span>{sourceLabel(item)}</span>
                        {showAccount ? <span className="truncate">{item.account}</span> : null}
                        <span>{formatDateTime(item.createdAt)}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="vg-empty">
              <p>没有符合条件的生成记录</p>
            </div>
          )}
          <AdminPager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={(page) => setQuery({ ...query, page })} />
        </>
      ) : null}

      {open ? <GenerationDialog item={open} linkOf={linkOf} showAccount={showAccount} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}

function GenerationDialog({ item, linkOf, showAccount, onClose }: { item: AdminGeneration; linkOf: ReturnType<typeof useFileLinks>; showAccount: boolean; onClose: () => void }) {
  useEscape(onClose)
  const cover = coverOf(item)
  const main = item.outputFileId ? { userId: item.userId, fileId: item.outputFileId, mime: item.outputMime || cover?.mime || '' } : cover
  const rows: Array<[string, React.ReactNode]> = [
    ['来源', sourceLabel(item)],
    ['账号', <Link key="a" href={`/admin/users/${item.userId}?tab=data`} className="text-[var(--theme-accent)] hover:underline">{item.account}</Link>],
    ['时间', formatDateTime(item.createdAt)],
    ['模型', item.model ? `${item.model}${item.platform ? ` · ${item.platform}` : ''}` : '—'],
    ['记录号', <span key="id" className="admin-mono">{item.id}</span>],
  ]
  return (
    <div className="vg-backdrop" onClick={onClose}>
      <section className="vg-dialog vg-dialog--wide" role="dialog" aria-modal="true" aria-label={item.label} onClick={(e) => e.stopPropagation()}>
        <header className="vg-dialog__head">
          <div className="min-w-0">
            <h2 className="truncate">{item.label}</h2>
            <p>
              <StatusTag item={item} />
            </p>
          </div>
          <button type="button" className="vg-icon-btn" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </header>
        <div className="vg-dialog__body">
          {main ? <MediaPreview url={linkOf(main)} mime={main.mime} /> : <div className="ud-preview ud-thumb--empty">{item.status === 'failed' ? '生成失败，没有产出' : '没有可预览的文件'}</div>}
          {item.thumbFileId && !item.outputFileId ? <p className="text-[12px] text-[var(--theme-text-muted)]">电脑端生成的原图 / 原视频在用户电脑上，这里是服务器截的缩略图。</p> : null}
          {item.error ? <div className="ud-error">{item.error}</div> : null}
          {item.prompt ? (
            <div>
              <div className="mb-1 text-[12px] font-semibold text-[var(--theme-text-muted)]">提示词</div>
              <pre className="ud-pre">{item.prompt}</pre>
            </div>
          ) : null}
          <dl className="ud-dl">
            {rows
              .filter(([label]) => showAccount || label !== '账号')
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          {item.outputUrl ? (
            <a href={item.outputUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[13px] text-[var(--theme-accent)] hover:underline">
              <ExternalLink size={14} /> 平台原始链接（可能已过期）
            </a>
          ) : null}
        </div>
      </section>
    </div>
  )
}
