import type { Metadata } from 'next'

import './globals.css'

import { SessionBootstrap } from '@/components/app/session-bootstrap'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { QueryProvider } from '@/providers/query-provider'

export const metadata: Metadata = {
  title: 'VideoGen Web',
  description: 'VideoGen 商业化 Web 工作台',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <QueryProvider>
          <ThemeProvider>
            <SessionBootstrap />
            {children}
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
