import type { Metadata } from 'next'

// 与桌面客户端共用的组件样式（.vg-*）
import '../../../../src/renderer/src/design-system/ui-kit.css'
import './admin-theme.css'

import { AdminThemeRoot } from '@/components/admin/admin-theme'

export const metadata: Metadata = {
  title: 'Vidloom 管理后台',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminThemeRoot>{children}</AdminThemeRoot>
}
