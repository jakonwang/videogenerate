export type StageItem = {
  key: string
  title: string
  desc: string
  done: boolean
  active: boolean
}

export type RuntimeLogItem = {
  id: string
  level: 'info' | 'success' | 'error'
  message: string
  time: number
}
