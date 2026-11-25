/**
 * 复刻项目的并发保存：多个任务各自拿着一份项目慢慢改（出脚本、出分镜图、查视频、界面刷新），
 * 整份写回会把别人刚写的内容盖掉。这里记住「读出来时的样子」，保存时只合并自己改过的部分。
 */

/** 可枚举的 Symbol：`{ ...project }` 会带上，JSON 和 IPC 会忽略 */
const BASE = Symbol('clone-project-base')

type Tracked = { [BASE]?: string }

/** 读出来 / 存完后调用：之后的改动都相对这一刻计算 */
export function trackProject<T extends object>(project: T): T {
  ;(project as Tracked)[BASE] = JSON.stringify(project)
  return project
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/** 列表按 shotId / id 对应；有没有键的、重复的就不逐条合并 */
function keyed(list: unknown[]): Map<string, unknown> | null {
  const map = new Map<string, unknown>()
  for (const item of list) {
    if (!isObject(item)) return null
    const key = String(item.shotId || item.id || '')
    if (!key || map.has(key)) return null
    map.set(key, item)
  }
  return map
}

/** base 是读出来时的，mine 是我改过的，theirs 是现在库里的；两边都改了同一处以 mine 为准 */
export function mergeThreeWay(base: unknown, mine: unknown, theirs: unknown): unknown {
  if (same(mine, base)) return theirs
  if (same(theirs, base) || same(mine, theirs)) return mine
  if (isObject(mine) && isObject(theirs)) {
    const from = isObject(base) ? base : {}
    const out: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
      const value = mergeThreeWay(from[key], mine[key], theirs[key])
      // 明确写成 undefined 是要清空（重新生成时的重置），要保留下来
      if (value !== undefined || Object.prototype.hasOwnProperty.call(mine, key)) out[key] = value
    }
    return out
  }
  if (Array.isArray(mine) && Array.isArray(theirs) && Array.isArray(base)) {
    const b = keyed(base)
    const m = keyed(mine)
    const t = keyed(theirs)
    if (!b || !m || !t) return mine
    const out: unknown[] = []
    for (const [key, item] of m) {
      // 我没动、别人删了的就不再写回
      if (!t.has(key) && b.has(key) && same(item, b.get(key))) continue
      out.push(t.has(key) ? mergeThreeWay(b.get(key), item, t.get(key)) : item)
    }
    // 别人新加的保留；我删掉的不留
    for (const [key, item] of t) if (!m.has(key) && !b.has(key)) out.push(item)
    return out
  }
  return mine
}

/** 把 input 里真正改过的部分合到 current 上；input 不是从库里读出来的就返回 null（按整份保存） */
export function mergeProjectChanges<T extends object>(input: T, current: T): T | null {
  const raw = (input as Tracked)[BASE]
  if (!raw) return null
  const base = JSON.parse(raw) as Record<string, unknown>
  const mine = input as Record<string, unknown>
  const theirs = current as Record<string, unknown>
  const out: Record<string, unknown> = { ...theirs }
  for (const key of Object.keys(mine)) {
    const value = mergeThreeWay(base[key], mine[key], theirs[key])
    out[key] = value
  }
  return out as T
}
