import type { HermesGatewayEvent } from './types'

const REDACTED = '[redacted]'
const TRUNCATED = '[truncated]'
const MAX_DEPTH = 8
const MAX_ARRAY_ITEMS = 100
const MAX_OBJECT_KEYS = 100
const MAX_STRING_LENGTH = 64 * 1024

function normalizedKey(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

function isSensitiveKey(value: string) {
  return /(^|[_-])(api[_-]?key|token|secret|password|passwd|authorization|cookie|credential|private[_-]?key|access[_-]?key|refresh[_-]?token|client[_-]?secret)($|[_-])/.test(normalizedKey(value))
}

function sanitizeText(value: string) {
  const redacted = value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, `$1${REDACTED}`)
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, REDACTED)
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|authorization)\s*[:=]\s*)[^\s,;}\]]+/gi, `$1${REDACTED}`)
    .replace(/([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|signature)=)[^&\s]+/gi, `$1${REDACTED}`)
  return redacted.length > MAX_STRING_LENGTH
    ? `${redacted.slice(0, MAX_STRING_LENGTH)}\n${TRUNCATED}`
    : redacted
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return sanitizeText(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return value
  if (depth >= MAX_DEPTH) return TRUNCATED
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    const rows = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, depth + 1, seen))
    if (value.length > MAX_ARRAY_ITEMS) rows.push(`${TRUNCATED} ${value.length - MAX_ARRAY_ITEMS} items`)
    return rows
  }

  const output: Record<string, unknown> = {}
  const entries = Object.entries(value as Record<string, unknown>)
  for (const [key, item] of entries.slice(0, MAX_OBJECT_KEYS)) {
    output[key] = isSensitiveKey(key) ? REDACTED : sanitizeValue(item, depth + 1, seen)
  }
  if (entries.length > MAX_OBJECT_KEYS) output.__truncated__ = `${entries.length - MAX_OBJECT_KEYS} keys`
  return output
}

export function sanitizeHermesValue(value: unknown) {
  return sanitizeValue(value, 0, new WeakSet<object>())
}

export function sanitizeHermesEvent(event: HermesGatewayEvent): HermesGatewayEvent {
  return {
    ...event,
    payload: sanitizeHermesValue(event.payload) as Record<string, unknown>,
  }
}
