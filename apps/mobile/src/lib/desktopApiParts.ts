/**
 * 网页上显示电脑端页面时，页面打开期间把 window.api 的部分换成这个页面专用的网页版（lib/desktopApi/*），离开时还原。
 * 命名空间按「合并」处理：网页版没替换的方法照旧走原来的对象（经电脑代办的命名空间是 Proxy，没有可复制的属性，只能转查）。
 */
export type ApiParts = Record<string, unknown>

export function installDesktopApiParts(parts: ApiParts): () => void {
  const w = window as unknown as { api: Record<string, unknown> }
  const previous: ApiParts = {}
  for (const [key, value] of Object.entries(parts)) {
    const before = w.api[key]
    previous[key] = before
    w.api[key] =
      value && typeof value === 'object' && before && typeof before === 'object'
        ? new Proxy(value as Record<string | symbol, unknown>, { get: (target, prop) => (prop in target ? target[prop] : (before as Record<string | symbol, unknown>)[prop]) })
        : value
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) w.api[key] = value
  }
}
