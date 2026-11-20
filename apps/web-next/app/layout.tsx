import type { Metadata } from 'next'

import './globals.css'

import { ThemeProvider } from '@/components/theme/theme-provider'
import { QueryProvider } from '@/providers/query-provider'

export const metadata: Metadata = {
  title: 'Klipmill',
  description: 'Klipmill：出海工厂的 AI 带货视频系统，选品、出片、发布、投放、复盘一站完成。',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <QueryProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
