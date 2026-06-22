import { readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'

const writeQueues = new Map<string, Promise<void>>()

async function readJsonFromDisk<T>(path: string): Promise<T> {
  const buf = await readFile(path, 'utf-8')
  return JSON.parse(buf) as T
}

export async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    return await readJsonFromDisk<T>(path)
  } catch {
    try {
      return await readJsonFromDisk<T>(`${path}.bak`)
    } catch {
      return fallback
    }
  }
}

export async function writeJsonFile<T>(path: string, data: T): Promise<void> {
  const previous = writeQueues.get(path) ?? Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dirname(path), { recursive: true })
      const payload = JSON.stringify(data, null, 2)
      const tempPath = `${path}.tmp`
      const backupPath = `${path}.bak`
      await writeFile(tempPath, payload, 'utf-8')
      try {
        await rename(path, backupPath)
      } catch {
        // Ignore missing target or backup rotation failures.
      }
      await rename(tempPath, path)
    })
  writeQueues.set(path, next)
  try {
    await next
  } finally {
    if (writeQueues.get(path) === next) writeQueues.delete(path)
  }
}

