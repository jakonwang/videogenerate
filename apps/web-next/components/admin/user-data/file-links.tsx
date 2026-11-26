'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileText, FileX2, Film, Music } from 'lucide-react'

import { adminClient, getCloudApiBaseUrl } from '@/lib/admin-client'
import { cn } from '@/lib/utils'

export type FileRef = { userId: string; fileId: string }

const keyOf = (ref: FileRef) => `${ref.userId}:${ref.fileId}`

/**
 * 一次给一页里所有文件签链接（签名链接有效 2 小时，打开图片 / 视频不需要带登录）。
 * 返回 key（userId:fileId）→ 完整地址；undefined 表示还在签，'' 表示文件已不存在。
 */
export function useFileLinks(refs: FileRef[]) {
  const [links, setLinks] = useState<Record<string, string>>({})
  const [mimes, setMimes] = useState<Record<string, string>>({})
  const signature = useMemo(() => [...new Set(refs.filter((r) => r.userId && r.fileId).map(keyOf))].sort().join(','), [refs])

  useEffect(() => {
    if (!signature) return
    const wanted = signature.split(',').map((key) => {
      const [userId, fileId] = key.split(':')
      return { userId, fileId }
    })
    let cancelled = false
    adminClient.admin
      .fileLinks(wanted)
      .then((result) => {
        if (cancelled) return
        const base = getCloudApiBaseUrl().replace(/\/+$/, '')
        const next: Record<string, string> = {}
        for (const ref of wanted) next[keyOf(ref)] = result.links[keyOf(ref)] ? `${base}${result.links[keyOf(ref)]}` : ''
        setLinks((prev) => ({ ...prev, ...next }))
        setMimes((prev) => ({ ...prev, ...result.mimes }))
      })
      .catch(() => {
        if (!cancelled) setLinks((prev) => ({ ...prev, ...Object.fromEntries(wanted.map((ref) => [keyOf(ref), ''])) }))
      })
    return () => {
      cancelled = true
    }
  }, [signature])

  const linkOf = (ref: FileRef | null | undefined): string | undefined => (ref && ref.fileId ? links[keyOf(ref)] : '')
  /** 文件类型（签完链接才知道） */
  linkOf.mime = (ref: FileRef | null | undefined): string => (ref && ref.fileId ? mimes[keyOf(ref)] ?? '' : '')
  return linkOf
}

/** 缩略图：图片直接显示，视频显示第一帧，音频 / 已删除给图标 */
export function MediaThumb({ url, mime, className, alt = '' }: { url: string | undefined; mime: string; className?: string; alt?: string }) {
  const box = cn('ud-thumb', className)
  if (url === undefined) return <div className={cn(box, 'vg-skeleton')} />
  if (!url)
    return (
      <div className={cn(box, 'ud-thumb--empty')} title="文件已被清理">
        <FileX2 size={20} />
      </div>
    )
  if (mime.startsWith('video/'))
    return (
      <div className={box}>
        <video src={`${url}#t=0.5`} preload="metadata" muted playsInline />
        <span className="ud-thumb__badge">
          <Film size={12} />
        </span>
      </div>
    )
  if (mime.startsWith('audio/'))
    return (
      <div className={cn(box, 'ud-thumb--empty')}>
        <Music size={20} />
      </div>
    )
  if (mime && !mime.startsWith('image/'))
    return (
      <div className={cn(box, 'ud-thumb--empty flex-col gap-1')} title={mime}>
        <FileText size={20} />
        <span className="text-[10px]">{mime.split('/')[1] || mime}</span>
      </div>
    )
  return (
    <div className={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} loading="lazy" />
    </div>
  )
}

/** 大图 / 可播放的视频 */
export function MediaPreview({ url, mime }: { url: string | undefined; mime: string }) {
  if (url === undefined) return <div className="ud-preview vg-skeleton" />
  if (!url) return <div className="ud-preview ud-thumb--empty">文件已被清理</div>
  if (mime.startsWith('video/')) return <video className="ud-preview" src={url} controls preload="metadata" playsInline />
  if (mime.startsWith('audio/')) return <audio src={url} controls className="w-full" />
  if (mime && !mime.startsWith('image/'))
    return (
      <a className="ud-preview" href={url} target="_blank" rel="noreferrer noopener">
        下载查看（{mime}）
      </a>
    )
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="ud-preview" src={url} alt="" />
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
