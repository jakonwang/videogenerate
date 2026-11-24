import type { Directive } from 'vue'

const GAP = 4
const MARGIN = 8
const cleanups = new WeakMap<HTMLElement, () => void>()

/**
 * 把下拉菜单放到浏览器顶层，不被表格滚动区裁掉，也不会撑出滚动条。
 * 以父元素（.prd-menu-wrap）定位：默认在下方右对齐，下方放不下就翻到上方。
 */
export const vFloatMenu: Directive<HTMLElement> = {
  mounted(el) {
    const anchor = el.parentElement
    if (!anchor || typeof el.showPopover !== 'function') return
    const preferUp = el.classList.contains('prd-menu--up')
    const alignLeft = el.classList.contains('prd-menu--left')
    el.classList.add('prd-menu--float')
    el.setAttribute('popover', 'manual')
    el.showPopover()

    const place = () => {
      const rect = anchor.getBoundingClientRect()
      const width = el.offsetWidth
      const height = el.offsetHeight
      const below = window.innerHeight - MARGIN - rect.bottom - GAP
      const above = rect.top - GAP - MARGIN
      const up = preferUp ? above >= height || above > below : below < height && above > below
      const top = up ? rect.top - GAP - height : rect.bottom + GAP
      const left = alignLeft ? rect.left : rect.right - width
      el.style.top = `${Math.max(MARGIN, Math.min(top, window.innerHeight - MARGIN - height))}px`
      el.style.left = `${Math.max(MARGIN, Math.min(left, window.innerWidth - MARGIN - width))}px`
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    cleanups.set(el, () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    })
  },
  beforeUnmount(el) {
    cleanups.get(el)?.()
    cleanups.delete(el)
  },
}
