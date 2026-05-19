import {
  createWebCloneWorkspaceClient,
  type CloneWorkspaceClient,
} from '@shared/clone-workspace/client'
import { apiClient } from '@/lib/api-client'

export const cloneWorkspaceClient = createWebCloneWorkspaceClient(apiClient) as CloneWorkspaceClient<any>
