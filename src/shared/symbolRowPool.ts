import rawPool from './symbolRowPool.json'

/** UTF-8 符号行候选（女性向可爱装饰行，与成片标题第二行搭配） */
export const SYMBOL_ROW_POOL: readonly string[] = rawPool as readonly string[]

/** 从池中随机取一条；池为空时返回空串 */
export function pickRandomSymbolRow(): string {
  if (!SYMBOL_ROW_POOL.length) return ''
  const i = Math.floor(Math.random() * SYMBOL_ROW_POOL.length)
  return SYMBOL_ROW_POOL[i] ?? ''
}
