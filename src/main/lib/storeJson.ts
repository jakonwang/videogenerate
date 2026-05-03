import { readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'

export async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const buf = await readFile(path, 'utf-8')
    return JSON.parse(buf) as T
  } catch {
    return fallback
  }
}

export async function writeJsonFile<T>(path: string, data: T): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

