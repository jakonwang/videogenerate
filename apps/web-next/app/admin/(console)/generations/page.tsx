'use client'

import { GalleryHorizontalEnd } from 'lucide-react'

import { useAdminMe } from '@/components/admin/admin-me'
import { AdminNotice, AdminPage, AdminPageHeader, AdminPanel } from '@/components/admin/admin-ui'
import { GenerationBrowser } from '@/components/admin/user-data/generation-browser'

export default function AdminGenerationsPage() {
  const me = useAdminMe()
  return (
    <AdminPage>
      <AdminPageHeader
        icon={GalleryHorizontalEnd}
        title="生成记录"
        description="全站用户的图片 / 视频生成：电脑端（经云端 AI 代理）、网页和手机端、AI 修图。只读，查看会记进操作日志。"
      />
      {me?.role !== 'super_admin' ? (
        <AdminNotice tone="warning">仅超级管理员可以查看用户的生成内容。</AdminNotice>
      ) : (
        <AdminPanel>
          <GenerationBrowser />
        </AdminPanel>
      )}
    </AdminPage>
  )
}
