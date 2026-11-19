import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { builtInEmployeeManifests } from './manifests'
import type { AgentDomainEvent, AgentOsDb } from './types'

type EventInput = Omit<AgentDomainEvent, 'id' | 'sequence' | 'schemaVersion' | 'createdAt'>
type StoreListener = (events: AgentDomainEvent[]) => void

function dbPath() {
  return join(getAppPaths().dbDir, 'agent-os.json')
}

function emptyDb(): AgentOsDb {
  return {
    schemaVersion: 1,
    nextEventSequence: 1,
    employees: builtInEmployeeManifests.map((item) => ({ ...item })),
    conversations: [],
    messages: [],
    runs: [],
    steps: [],
    attempts: [],
    artifacts: [],
    approvals: [],
    events: [],
  }
}

// Retired with the Geelark publisher plugin; stripped from previously saved data.
const removedEmployeeIds = new Set(['employee.publish'])
const removedIds = new Set<string>(['Intent.VideoPublish', 'Intent.PublishingManage', 'Video.Publish', 'Publishing.Manage'])

function normalizeDb(input: AgentOsDb | null | undefined): AgentOsDb {
  const fallback = emptyDb()
  const db = input && typeof input === 'object' ? input : fallback
  const persistedEmployees = (Array.isArray(db.employees) ? db.employees : [])
    .filter((item) => !removedEmployeeIds.has(item.id))
    .map((item) => ({
      ...item,
      allowedIntents: (item.allowedIntents || []).filter((id) => !removedIds.has(id)),
      allowedCapabilities: (item.allowedCapabilities || []).filter((id) => !removedIds.has(id)),
    }))
  const persistedById = new Map(persistedEmployees.map((item) => [item.id, item]))
  const employees = builtInEmployeeManifests.map((manifest) => {
    const persisted = persistedById.get(manifest.id)
    const shouldUpgrade = Boolean(persisted && Number(persisted.version || 0) < manifest.version)
    return {
      ...manifest,
      ...persisted,
      ...(shouldUpgrade ? {
        version: manifest.version,
        allowedIntents: Array.from(new Set([...(persisted?.allowedIntents || []), ...manifest.allowedIntents])),
        allowedCapabilities: Array.from(new Set([...(persisted?.allowedCapabilities || []), ...manifest.allowedCapabilities])),
      } : {}),
      builtIn: true,
    }
  })
  for (const item of persistedEmployees) {
    if (!employees.some((employee) => employee.id === item.id)) employees.push(item)
  }
  const events = Array.isArray(db.events) ? db.events : []
  const maxSequence = events.reduce((max, item) => Math.max(max, Number(item.sequence || 0)), 0)
  return {
    schemaVersion: 1,
    nextEventSequence: Math.max(maxSequence + 1, Number(db.nextEventSequence || 1)),
    employees,
    conversations: Array.isArray(db.conversations) ? db.conversations : [],
    messages: Array.isArray(db.messages) ? db.messages : [],
    runs: Array.isArray(db.runs) ? db.runs : [],
    steps: Array.isArray(db.steps) ? db.steps : [],
    attempts: Array.isArray(db.attempts) ? db.attempts : [],
    artifacts: Array.isArray(db.artifacts) ? db.artifacts : [],
    approvals: Array.isArray(db.approvals) ? db.approvals : [],
    events,
  }
}

/**
 * 事件只追加不删除，整个文件每次读写都要完整解析 / 序列化（在主进程上）。
 * 只留最近的一批；带 deliveryKey 的投递记录用于防重复发送，始终保留。
 */
const MAX_EVENTS = 2000

function trimEvents(db: AgentOsDb) {
  if (db.events.length <= MAX_EVENTS) return
  const cutoff = db.events.length - MAX_EVENTS
  db.events = db.events.filter((item, index) => index >= cutoff || Boolean(item.payload?.deliveryKey))
}

let mutationQueue = Promise.resolve()
const listeners = new Set<StoreListener>()

async function readDb() {
  return normalizeDb(await readJsonFile<AgentOsDb>(dbPath(), emptyDb()))
}

export const agentOsStore = {
  async read() {
    return await readDb()
  },

  async mutate<T>(mutator: (db: AgentOsDb, emit: (event: EventInput) => AgentDomainEvent) => T | Promise<T>): Promise<T> {
    const task = mutationQueue
      .catch(() => undefined)
      .then(async () => {
        const db = await readDb()
        const emitted: AgentDomainEvent[] = []
        const emit = (input: EventInput) => {
          const event: AgentDomainEvent = {
            ...input,
            id: randomUUID(),
            sequence: db.nextEventSequence,
            schemaVersion: 1,
            createdAt: Date.now(),
          }
          db.nextEventSequence += 1
          db.events.push(event)
          emitted.push(event)
          return event
        }
        const result = await mutator(db, emit)
        trimEvents(db)
        await writeJsonFile(dbPath(), db)
        if (emitted.length) {
          for (const listener of listeners) {
            try {
              listener(emitted.map((item) => ({ ...item })))
            } catch (error) {
              console.error('[agent-os] event listener failed', error)
            }
          }
        }
        return result
      })
    mutationQueue = task.then(() => undefined, () => undefined)
    return await task
  },

  subscribe(listener: StoreListener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  async listEvents(afterSequence = 0, limit = 200) {
    const db = await readDb()
    return db.events
      .filter((item) => item.sequence > Math.max(0, Number(afterSequence || 0)))
      .slice(0, Math.max(1, Math.min(1000, Number(limit || 200))))
  },
}
