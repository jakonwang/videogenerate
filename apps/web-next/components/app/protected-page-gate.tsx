'use client'

import { AuthRedirectScreen } from '@/components/app/auth-redirect-screen'

type AuthState = {
  ready: boolean
  authed: boolean
  redirecting: boolean
  sessionRestoring?: boolean
}

export function ProtectedPageGate({
  auth,
  restoringTitle = '正在恢复工作台会话',
  restoringDescription = '系统正在校验登录状态并准备当前页面。',
}: {
  auth: AuthState
  restoringTitle?: string
  restoringDescription?: string
}) {
  if (auth.sessionRestoring || (!auth.ready && !auth.authed)) {
    return <AuthRedirectScreen title={restoringTitle} description={restoringDescription} />
  }

  if (auth.redirecting || !auth.authed) {
    return <AuthRedirectScreen />
  }

  return null
}
