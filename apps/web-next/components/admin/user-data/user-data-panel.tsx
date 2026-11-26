'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Clock3, Database, FolderOpen, HardDrive, Sparkles } from 'lucide-react'

import { ADMIN_DATA_GROUPS, ADMIN_GENERATION_SOURCE_LABELS, adminCollectionLabel, adminGroupOf, type AdminDataRecord, type AdminGenerationSource } from '@shared/cloud/adminData'
import { AdminError, AdminLoading, AdminPager, AdminPanel, AdminSearch, AdminTag, formatDateTime, useAdminData } from '@/components/admin/admin-ui'
import { Button, Switch } from '@/components/admin/controls'
import { adminClient } from '@/lib/admin-client'
import { cn } from '@/lib/utils'
import { formatBytes, MediaPreview, MediaThumb, useFileLinks } from './file-links'
import { GenerationBrowser, useEscape } from './generation-browser'

type View = 'works' | 'records' | 'files'

/** 用户详情页「生成数据」：只读查看该用户在云端的全部数据 */
export function UserDataPanel({ userId }: { userId: string }) {
  const summary = useAdminData(() => adminClient.admin.userDataSummary(userId).then((r) => r.summary), [userId])
  const [view, setView] = useState<View>('works')
  const s = summary.data

  return (
    <div className="grid gap-4">
      <p className="text-[12px] text-[var(--theme-text-muted)]">只读查看，不能修改用户数据；每次查看都会记进操作日志。电脑端只保存在本机、没同步到云端的内容这里看不到。</p>
      {summary.error ? <AdminError message={summary.error} onRetry={() => void summary.reload()} /> : null}
      {s ? (
        <section className="vg-stats">
          <Stat icon={Sparkles} tone="" label="生成次数" value={(Object.keys(s.generations) as AdminGenerationSource[]).reduce((sum, key) => sum + s.generations[key].total, 0)}
            hint={(Object.keys(s.generations) as AdminGenerationSource[]).filter((key) => s.generations[key].total).map((key) => `${ADMIN_GENERATION_SOURCE_LABELS[key]} ${s.generations[key].total}${s.generations[key].failed ? `（失败 ${s.generations[key].failed}）` : ''}`).join(' · ') || '还没有生成过'} />
          <Stat icon={Database} tone="blue" label="同步数据" value={s.collections.reduce((sum, c) => sum + c.count, 0)} hint={`${s.collections.filter((c) => c.count).length} 类`} />
          <Stat icon={HardDrive} tone="violet" label="云端文件" value={formatBytes(s.files.bytes)} hint={`图片 ${s.files.images} · 视频 ${s.files.videos} · 音频 ${s.files.audios}`} />
          <Stat icon={Clock3} tone="amber" label="最近活动" value={s.lastActivityAt ? formatDateTime(s.lastActivityAt) : '—'} />
        </section>
      ) : summary.loading ? (
        <AdminLoading rows={2} />
      ) : null}

      <AdminPanel flush>
        <div className="vg-tabs px-3">
          {(
            [
              ['works', '作品'],
              ['records', '全部数据'],
              ['files', '文件'],
            ] as Array<[View, string]>
          ).map(([value, label]) => (
            <button key={value} type="button" className={cn('vg-tabs__btn', view === value && 'is-active')} onClick={() => setView(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {view === 'works' ? <GenerationBrowser userId={userId} /> : null}
          {view === 'records' && s ? <RecordBrowser userId={userId} collections={s.collections} /> : null}
          {view === 'files' ? <FileBrowser userId={userId} /> : null}
        </div>
      </AdminPanel>
    </div>
  )
}

function Stat({ icon: Icon, tone, label, value, hint }: { icon: typeof Sparkles; tone: '' | 'blue' | 'violet' | 'amber'; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="vg-stat">
      <span className={cn('vg-stat__icon', tone && `vg-stat__icon--${tone}`)}>
        <Icon size={17} />
      </span>
      <span className="vg-stat__body">
        <span className="vg-stat__label">{label}</span>
        <span className="vg-stat__value text-[16px]">{value}</span>
        {hint ? <span className="admin-sub truncate" title={hint}>{hint}</span> : null}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ 全部数据：按业务分组浏览同步记录 */

const FILE_ID_RE = /\b[a-f0-9]{64}\b/g
const TITLE_KEYS = ['name', 'title', 'label', 'productName', 'sourceName', 'prompt', 'text', 'summary', 'kind']

function titleOf(record: AdminDataRecord) {
  const data = record.data as Record<string, unknown> | null
  if (data && typeof data === 'object') {
    for (const key of TITLE_KEYS) {
      const value = data[key]
      if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80)
    }
  }
  return record.id
}

function filesIn(record: AdminDataRecord) {
  return [...new Set(JSON.stringify(record.data ?? '').match(FILE_ID_RE) || [])].slice(0, 8)
}

function RecordBrowser({ userId, collections }: { userId: string; collections: Array<{ collection: string; count: number; deleted: number }> }) {
  const counts = useMemo(() => new Map(collections.map((c) => [c.collection, c])), [collections])
  const groups = useMemo(() => {
    const known = ADMIN_DATA_GROUPS.map((group) => ({ ...group, collections: group.collections.filter((c) => counts.has(c.collection)) }))
    const other = collections.filter((c) => adminGroupOf(c.collection) === 'other').map((c) => ({ collection: c.collection as never, label: c.collection }))
    return [...known, ...(other.length ? [{ key: 'other', title: '其他', collections: other }] : [])].filter((group) => group.collections.length)
  }, [collections, counts])
  const first = groups[0]?.collections[0]?.collection ?? ''
  const [collection, setCollection] = useState<string>(first)
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState({ keyword: '', includeDeleted: '' as '1' | '', page: 1 })
  const records = useAdminData(
    () => (collection ? adminClient.admin.userDataRecords(userId, { collection, ...query }) : Promise.resolve(null)),
    [userId, collection, query],
  )
  const [expanded, setExpanded] = useState<string | null>(null)
  const pageItems = records.data?.items
  const refs = useMemo(() => (pageItems ?? []).flatMap((record) => filesIn(record).map((fileId) => ({ userId, fileId }))), [pageItems, userId])
  const linkOf = useFileLinks(refs)

  if (!groups.length) return <div className="vg-empty"><p>这个用户还没有同步到云端的数据</p></div>

  return (
    <div className="ud-records">
      <nav className="ud-records__nav" aria-label="数据类型">
        {groups.map((group) => (
          <div key={group.key} className="mb-3">
            <div className="ud-records__group">{group.title}</div>
            {group.collections.map((item) => {
              const stat = counts.get(item.collection)
              return (
                <button
                  key={item.collection}
                  type="button"
                  className={cn('ud-records__item', collection === item.collection && 'is-active')}
                  onClick={() => {
                    setCollection(item.collection)
                    setExpanded(null)
                    setQuery({ ...query, page: 1 })
                  }}
                >
                  <span className="truncate">{item.label}</span>
                  <small>{stat?.count ?? 0}</small>
                </button>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="grid min-w-0 content-start gap-3">
        <div className="ud-filters">
          <form
            className="flex min-w-[220px] flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setQuery({ ...query, keyword, page: 1 })
            }}
          >
            <AdminSearch value={keyword} onChange={setKeyword} placeholder={`在「${adminCollectionLabel(collection)}」里搜索`} />
            <Button type="submit" variant="secondary">
              搜索
            </Button>
          </form>
          <Switch checked={query.includeDeleted === '1'} onChange={(v) => setQuery({ ...query, includeDeleted: v ? '1' : '', page: 1 })} label="显示已删除" />
        </div>
        {records.error ? <AdminError message={records.error} onRetry={() => void records.reload()} /> : null}
        {records.loading && !records.data ? <AdminLoading rows={4} /> : null}
        {records.data ? (
          <>
            {records.data.items.length ? (
              <div className="ud-list">
                {records.data.items.map((record) => (
                  <RecordRow key={record.id} userId={userId} record={record} linkOf={linkOf} open={expanded === record.id} onToggle={() => setExpanded(expanded === record.id ? null : record.id)} />
                ))}
              </div>
            ) : (
              <div className="vg-empty">
                <p>没有记录</p>
              </div>
            )}
            <AdminPager page={records.data.page} pageSize={records.data.pageSize} total={records.data.total} onChange={(page) => setQuery({ ...query, page })} />
          </>
        ) : null}
      </div>
    </div>
  )
}

function RecordRow({ userId, record, linkOf, open, onToggle }: { userId: string; record: AdminDataRecord; linkOf: ReturnType<typeof useFileLinks>; open: boolean; onToggle: () => void }) {
  const fileIds = useMemo(() => filesIn(record), [record])
  const refs = useMemo(() => fileIds.map((fileId) => ({ userId, fileId })), [fileIds, userId])
  return (
    <div className={cn('ud-row', open && 'is-open')}>
      <button type="button" className="ud-row__head" onClick={onToggle}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className="min-w-0 flex-1 truncate text-left font-medium">{titleOf(record)}</span>
        {fileIds.length ? (
          <span className="ud-row__thumbs">
            {refs.slice(0, 4).map((ref) => (
              <MediaThumb key={ref.fileId} url={linkOf(ref)} mime={linkOf.mime(ref)} className="ud-thumb--xs" />
            ))}
          </span>
        ) : null}
        {record.deleted ? <AdminTag tone="danger">已删除</AdminTag> : null}
        <span className="whitespace-nowrap text-[12px] text-[var(--theme-text-muted)]">{formatDateTime(record.updatedAt)}</span>
      </button>
      {open ? (
        <div className="ud-row__body">
          {refs.length ? (
            <div className="ud-row__media">
              {refs.map((ref) => (
                <a key={ref.fileId} href={linkOf(ref) || undefined} target="_blank" rel="noreferrer noopener" title={ref.fileId}>
                  <MediaThumb url={linkOf(ref)} mime={linkOf.mime(ref)} />
                </a>
              ))}
            </div>
          ) : null}
          <pre className="ud-pre">{record.deleted ? '（已删除，内容已清空）' : JSON.stringify(record.data, null, 2)}</pre>
          <span className="admin-mono text-[11px] text-[var(--theme-text-muted)]">id: {record.id}</span>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ 文件 */

function FileBrowser({ userId }: { userId: string }) {
  const [query, setQuery] = useState({ kind: '', page: 1 })
  const files = useAdminData(() => adminClient.admin.userDataFiles(userId, query), [userId, query])
  const items = files.data?.items ?? []
  const refs = useMemo(() => items.map((file) => ({ userId, fileId: file.fileId })), [items, userId])
  const linkOf = useFileLinks(refs)
  const [open, setOpen] = useState<{ fileId: string; mime: string } | null>(null)

  return (
    <div className="grid gap-3">
      <div className="vg-seg w-fit">
        {[
          ['', '全部'],
          ['image', '图片'],
          ['video', '视频'],
          ['audio', '音频'],
        ].map(([value, label]) => (
          <button key={value} type="button" className={cn('vg-seg__btn', query.kind === value && 'is-active')} onClick={() => setQuery({ kind: value, page: 1 })}>
            {label}
          </button>
        ))}
      </div>
      {files.error ? <AdminError message={files.error} onRetry={() => void files.reload()} /> : null}
      {files.loading && !files.data ? <AdminLoading rows={3} /> : null}
      {files.data ? (
        <>
          {items.length ? (
            <div className="ud-grid ud-grid--files">
              {items.map((file) => (
                <button key={file.fileId} type="button" className="ud-card" onClick={() => setOpen(file)}>
                  <MediaThumb url={linkOf({ userId, fileId: file.fileId })} mime={file.mime} />
                  <div className="ud-card__meta px-2 pb-2">
                    <span>{formatBytes(file.size)}</span>
                    <span>{formatDateTime(file.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="vg-empty">
              <FolderOpen size={22} />
              <p>没有文件</p>
            </div>
          )}
          <AdminPager page={files.data.page} pageSize={files.data.pageSize} total={files.data.total} onChange={(page) => setQuery({ ...query, page })} />
        </>
      ) : null}
      {open ? <FilePreviewDialog url={linkOf({ userId, fileId: open.fileId })} file={open} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}

function FilePreviewDialog({ url, file, onClose }: { url: string | undefined; file: { fileId: string; mime: string }; onClose: () => void }) {
  useEscape(onClose)
  return (
    <div className="vg-backdrop" onClick={onClose}>
      <section className="vg-dialog vg-dialog--wide" role="dialog" aria-modal="true" aria-label="文件预览" onClick={(e) => e.stopPropagation()}>
        <div className="vg-dialog__body">
          <MediaPreview url={url} mime={file.mime} />
          <span className="admin-mono text-[11px] text-[var(--theme-text-muted)]">{file.fileId}</span>
        </div>
      </section>
    </div>
  )
}
