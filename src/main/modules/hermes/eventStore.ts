import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type { HermesGatewayEvent, HermesPendingInput } from './types'

const EVENT_LIMIT = 1000
const PENDING_INPUT_MAX_AGE_MS = 10 * 60 * 1000
const REQUEST_TYPES = new Set(['approval.request', 'clarify.request', 'sudo.request', 'secret.request'])

type HermesEventDb = {
  schemaVersion: 1
  nextSequence: number
  events: HermesGatewayEvent[]
}

type EventInput = Omit<HermesGatewayEvent, 'sequence'>

function storePath() {
  return join(getAppPaths().dbDir, 'hermes-events.json')
}

function emptyDb(): HermesEventDb {
  return { schemaVersion: 1, nextSequence: 1, events: [] }
}

function normalizeDb(input: HermesEventDb | null | undefined): HermesEventDb {
  const events = Array.isArray(input?.events) ? input.events.slice(-EVENT_LIMIT) : []
  const maxSequence = events.reduce((max, event) => Math.max(max, Number(event.sequence || 0)), 0)
  return {
    schemaVersion: 1,
    nextSequence: Math.max(maxSequence + 1, Number(input?.nextSequence || 1)),
    events,
  }
}

function sessionKey(event: Pick<HermesGatewayEvent, 'sessionId' | 'storedSessionId'>) {
  return String(event.storedSessionId || event.sessionId || '')
}

function requestKind(type: string): HermesPendingInput['kind'] | '' {
  if (type === 'approval.request') return 'approval'
  if (type === 'clarify.request') return 'clarification'
  if (type === 'sudo.request') return 'sudo'
  if (type === 'secret.request') return 'secret'
  return ''
}

let mutationQueue = Promise.resolve()

async function readDb() {
  return normalizeDb(await readJsonFile<HermesEventDb>(storePath(), emptyDb()))
}

export const hermesEventStore = {
  async append(input: EventInput) {
    const task = mutationQueue
      .catch(() => undefined)
      .then(async () => {
        const db = await readDb()
        const event: HermesGatewayEvent = { ...input, sequence: db.nextSequence }
        db.nextSequence += 1
        db.events.push(event)
        if (db.events.length > EVENT_LIMIT) db.events.splice(0, db.events.length - EVENT_LIMIT)
        await writeJsonFile(storePath(), db)
        return event
      })
    mutationQueue = task.then(() => undefined, () => undefined)
    return await task
  },

  async list(afterSequence = 0, limit = 1000) {
    const db = await readDb()
    return db.events
      .filter((event) => event.sequence > Math.max(0, Number(afterSequence || 0)))
      .slice(0, Math.max(1, Math.min(EVENT_LIMIT, Number(limit || EVENT_LIMIT))))
  },

  async listSession(input: { sessionId?: string; storedSessionId?: string; limit?: number }) {
    const liveId = String(input.sessionId || '')
    const storedId = String(input.storedSessionId || '')
    const db = await readDb()
    const rows = db.events.filter((event) =>
      Boolean((liveId && event.sessionId === liveId) || (storedId && event.storedSessionId === storedId)),
    )
    return rows.slice(-Math.max(1, Math.min(EVENT_LIMIT, Number(input.limit || 300))))
  },

  async listPendingInputs() {
    const db = await readDb()
    const pending = new Map<string, HermesPendingInput>()
    for (const event of db.events) {
      const key = sessionKey(event)
      if (!key) continue
      if (REQUEST_TYPES.has(event.type)) {
        const kind = requestKind(event.type)
        if (!kind) continue
        pending.set(key, {
          kind,
          requestId: String(event.payload.request_id || '') || undefined,
          sessionId: event.sessionId,
          storedSessionId: event.storedSessionId,
          payload: event.payload,
          createdAt: event.createdAt,
        })
        continue
      }
      if (event.type === 'input.resolved' || event.type === 'session.interrupted' || event.type === 'session.closed') {
        pending.delete(key)
      }
    }
    const cutoff = Date.now() - PENDING_INPUT_MAX_AGE_MS
    return Array.from(pending.values()).filter((item) => item.createdAt >= cutoff)
  },

  async removeSession(storedSessionId: string) {
    const id = String(storedSessionId || '').trim()
    if (!id) return
    const task = mutationQueue
      .catch(() => undefined)
      .then(async () => {
        const db = await readDb()
        db.events = db.events.filter((event) => event.storedSessionId !== id)
        await writeJsonFile(storePath(), db)
      })
    mutationQueue = task.then(() => undefined, () => undefined)
    await task
  },
}
