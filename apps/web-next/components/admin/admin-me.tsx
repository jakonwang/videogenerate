'use client'

import { createContext, useContext } from 'react'
import type { CloudUser } from '@shared/cloud/types'

/** 当前登录的管理员（由 AdminShell 提供） */
export const AdminMeContext = createContext<CloudUser | null>(null)

export function useAdminMe() {
  return useContext(AdminMeContext)
}
