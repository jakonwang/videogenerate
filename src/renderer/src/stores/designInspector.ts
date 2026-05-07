import { defineStore } from 'pinia'

export type DesignInspectorState = {
  enabled: boolean
  hoveredId: string | null
  selectedId: string | null
}

const STORAGE_KEY = 'videogen.design-inspector.enabled'

function readInitialEnabled() {
  if (!import.meta.env.DEV) return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const useDesignInspectorStore = defineStore('designInspector', {
  state: (): DesignInspectorState => ({
    enabled: readInitialEnabled(),
    hoveredId: null,
    selectedId: null,
  }),
  actions: {
    toggleDesignInspector(enabled: boolean) {
      this.enabled = enabled
      if (!enabled) {
        this.hoveredId = null
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
      } catch {
        // ignore
      }
    },
    setHoveredId(designId: string | null) {
      this.hoveredId = designId
    },
    selectDesignNode(designId: string | null) {
      this.selectedId = designId
    },
    clearDesignSelection() {
      this.selectedId = null
    },
  },
})
