/** 把保存款号的错误变成普通话 */
export function productCodeError(reason: unknown, t: (key: string, params?: Record<string, unknown>) => string) {
  const message = reason instanceof Error ? reason.message : String(reason)
  const taken = /PRODUCT_CODE_TAKEN:(.*)$/.exec(message)
  if (taken) return t('productLibrary.code.taken', { name: taken[1] })
  if (message.includes('PRODUCT_CODE_INVALID')) return t('productLibrary.code.invalid')
  return message
}
