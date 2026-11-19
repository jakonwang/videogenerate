/**
 * 电脑端 window.api 的类型（src/preload/index.ts 的 PreloadApi）。网页版接口（本目录）用 `satisfies` 对齐它：
 * 电脑端加了方法、改了参数，网页版类型检查就会报错，不会悄悄不一致。
 */
export type DesktopApi = import('../../../../../src/preload/index').PreloadApi
