'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { readAppSettings } from '@/lib/app-settings'
import { apiClient } from '@/lib/api-client'

export function useCloneTaskList() {
  const queryClient = useQueryClient()

  const projectsQuery = useQuery({
    queryKey: ['clone-projects'],
    queryFn: () => apiClient.listCloneProjects(),
  })

  const createMutation = useMutation({
    mutationFn: () => {
      const settings = readAppSettings()
      return apiClient.createCloneProject({
        locale: settings.locale === 'vi-VN' ? 'vi-VN' : 'zh-CN',
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

  return {
    projectsQuery,
    createMutation,
    removeMutation,
  }
}
