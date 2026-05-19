import { defineStore } from 'pinia'

export type CloneTopbarStageItem = {
  key: string
  title: string
  desc: string
  done: boolean
  active: boolean
}

type CloneTopbarState = {
  visible: boolean
  items: CloneTopbarStageItem[]
  requestedStageKey: string
}

export const useCloneTopbarStore = defineStore('cloneTopbar', {
  state: (): CloneTopbarState => ({
    visible: false,
    items: [],
    requestedStageKey: '',
  }),
  actions: {
    show(items: CloneTopbarStageItem[]) {
      this.visible = true
      this.items = items
    },
    requestStage(key: string) {
      this.requestedStageKey = String(key || '').trim()
    },
    consumeRequestedStage() {
      const key = this.requestedStageKey
      this.requestedStageKey = ''
      return key
    },
    hide() {
      this.visible = false
      this.items = []
      this.requestedStageKey = ''
    },
  },
})
