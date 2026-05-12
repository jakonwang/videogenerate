import { computed } from 'vue'
import { useRoute } from 'vue-router'

export function useCloneRouteProject() {
  const route = useRoute()

  const routeProjectId = computed(() => String(route.params.projectId || '').trim())

  function resolveActiveProjectId(currentProjectId?: string | null) {
    return String(currentProjectId || routeProjectId.value || '').trim()
  }

  return {
    routeProjectId,
    resolveActiveProjectId,
  }
}
