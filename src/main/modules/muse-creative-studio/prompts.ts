import { randomUUID } from 'node:crypto'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT } from '../live-photo/promptVersions'
import type { MusePromptKind, MusePromptVersion } from './types'

/** Learnt from the trial runs: detailed product lists and one continuous shot keep the product intact. */
const VIDEO_SEEDS = [
  ['缓慢推近 · 一镜到底', '从参考图的画面开始，镜头缓慢推近商品，一镜到底，不切换场景，不出现人物。严格保持商品原样：颜色、材质、形状、数量和所有细节部件都要与参考图一致，清楚可见。'],
  ['环绕展示 · 一镜到底', '从参考图的画面开始，镜头围绕商品缓慢小幅环绕，一镜到底，不切换场景，不出现人物，光线自然变化。严格保持商品原样：颜色、材质、形状、数量和所有细节部件都要与参考图一致。'],
  ['自然光微动', '从参考图的画面开始，镜头固定，商品在自然光下有轻微的光影流动，不切换场景，不出现人物，不添加文字。严格保持商品原样，与参考图完全一致。'],
] as const

const kindOf = (value: unknown): MusePromptKind => (value === 'image' ? 'image' : 'video')

/** Independent of the tk创意室 and 图生视频 prompt libraries. */
export function createMusePrompts(path: () => string) {
  let queue: Promise<unknown> = Promise.resolve()

  async function read() {
    const db = await readJsonFile<{ versions: MusePromptVersion[] }>(path(), { versions: [] })
    const now = Date.now()
    const seed = (kind: MusePromptKind, name: string, prompt: string, version: number): MusePromptVersion => ({ id: randomUUID(), kind, name, prompt, version, active: version === 1, createdAt: now, updatedAt: now })
    if (!db.versions.some((item) => item.kind === 'video')) db.versions.push(...VIDEO_SEEDS.map(([name, prompt], index) => seed('video', name, prompt, index + 1)))
    if (!db.versions.some((item) => item.kind === 'image')) db.versions.push(seed('image', '商品替换', DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT, 1))
    return db
  }
  const mutate = <T>(change: (versions: MusePromptVersion[]) => T): Promise<T> => {
    const run = queue.then(async () => {
      const db = await read()
      const result = change(db.versions)
      await writeJsonFile(path(), db)
      return result
    })
    queue = run.catch(() => undefined)
    return run
  }
  const add = (versions: MusePromptVersion[], kind: MusePromptKind, name: string, prompt: string) => {
    const now = Date.now()
    const version = Math.max(0, ...versions.filter((item) => item.kind === kind).map((item) => item.version)) + 1
    const item: MusePromptVersion = { id: randomUUID(), kind, name: name.trim() || `提示词 V${version}`, prompt, version, active: false, createdAt: now, updatedAt: now }
    versions.push(item)
    return item
  }
  const find = (versions: MusePromptVersion[], id: string) => {
    const item = versions.find((entry) => entry.id === id)
    if (!item) throw new Error('提示词版本不存在')
    return item
  }
  const activate = (versions: MusePromptVersion[], target: MusePromptVersion) => {
    for (const item of versions) if (item.kind === target.kind) item.active = item === target
  }
  const content = (value: unknown) => {
    const prompt = String(value || '').trim()
    if (!prompt) throw new Error('提示词不能为空')
    if (prompt.length > 8000) throw new Error('提示词过长')
    return prompt
  }

  return {
    // Written back once, so the seeded ids stay the same between calls.
    list: (kind?: MusePromptKind) => mutate((versions) => versions.filter((item) => item.kind === kindOf(kind)).sort((a, b) => b.version - a.version)),
    active: (kind: MusePromptKind) => mutate((versions) => versions.find((item) => item.kind === kind && item.active) ?? versions.find((item) => item.kind === kind)!),
    update: async (input: { id: string; name?: string; prompt: string }) => {
      const prompt = content(input.prompt)
      return await mutate((versions) => Object.assign(find(versions, input.id), { name: String(input.name || '').trim() || find(versions, input.id).name, prompt, updatedAt: Date.now() }))
    },
    copy: async (input: { kind: MusePromptKind; name?: string; prompt: string }) => {
      const prompt = content(input.prompt)
      return await mutate((versions) => add(versions, kindOf(input.kind), String(input.name || ''), prompt))
    },
    activate: (id: string) => mutate((versions) => {
      const item = find(versions, id)
      activate(versions, item)
      return item
    }),
    /** A new version with the old text becomes active; history is kept. */
    rollback: (id: string) => mutate((versions) => {
      const source = find(versions, id)
      const item = add(versions, source.kind, `${source.name} 回滚`, source.prompt)
      activate(versions, item)
      return item
    }),
  }
}
