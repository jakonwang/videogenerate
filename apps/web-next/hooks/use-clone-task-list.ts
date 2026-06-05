'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CloneRunMode } from '@shared/web-api/types'

import { readAppSettings } from '@/lib/app-settings'
import { apiClient } from '@/lib/api-client'

export function useCloneTaskList() {
  const queryClient = useQueryClient()

  const projectsQuery = useQuery({
    queryKey: ['clone-projects'],
    queryFn: () => apiClient.listCloneProjects(),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  })

  const createMutation = useMutation({
    mutationFn: (runMode: CloneRunMode) => {
      const settings = readAppSettings()
      return apiClient.createCloneProject({
        locale: settings.locale === 'vi-VN' ? 'vi-VN' : 'zh-CN',
        runMode,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['clone-projects'] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (projectId: string) => apiClient.removeCloneProject(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['clone-projects'] })
    },
  })

  const renameMutation = useMutation({
    mutationFn: (input: { projectId: string; title: string }) =>
      apiClient.updateCloneProjectMeta(input.projectId, {
        title: input.title,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['clone-projects'] })
    },
  })

  return {
    projectsQuery,
    createMutation,
    removeMutation,
    renameMutation,
  }
}
