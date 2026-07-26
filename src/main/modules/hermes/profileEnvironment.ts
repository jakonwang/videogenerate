import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hermesProfileDirectory } from './installation'

function decodeEnvValue(input: string) {
  const value = String(input || '').trim()
  if (!value) return ''
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return String(JSON.parse(value) || '').trim()
    } catch {
      return value.slice(1, -1).trim()
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).trim()
  return value
}

export async function readHermesProfileEnvironment(keys: readonly string[]) {
  const requested = new Set(keys.map((key) => String(key || '').trim()).filter(Boolean))
  const result: Record<string, string> = {}
  if (!requested.size) return result

  const envPath = join(hermesProfileDirectory(), '.env')
  if (!existsSync(envPath)) return result
  const source = await readFile(envPath, 'utf8')
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match || !requested.has(match[1])) continue
    result[match[1]] = decodeEnvValue(match[2])
  }
  return result
}

export function inferFeishuReceiveIdType(receiveId: string) {
  const value = String(receiveId || '').trim()
  if (value.startsWith('oc_')) return 'chat_id' as const
  if (value.startsWith('ou_')) return 'open_id' as const
  if (value.startsWith('on_')) return 'union_id' as const
  return undefined
}
