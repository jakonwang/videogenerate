import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'

import { isWeb } from './platform'

/**
 * The web version on a computer always gets the desktop software's shell and page designs, whatever the
 * window width (the desktop app is the reference). Only a real phone browser (touch + narrow) and the
 * native App keep the phone layout.
 */
export const WIDE_QUERY = '(min-width: 1024px)'
const PHONE_QUERY = '(pointer: coarse) and (max-width: 767px)'

const wide = typeof window !== 'undefined' ? window.matchMedia(WIDE_QUERY) : null
const phone = typeof window !== 'undefined' ? window.matchMedia(PHONE_QUERY) : null
const compute = () => (isWeb ? !phone?.matches : Boolean(wide?.matches))
export const isWideScreen = ref(compute())
wide?.addEventListener('change', () => { isWideScreen.value = compute() })
phone?.addEventListener('change', () => { isWideScreen.value = compute() })

/** True inside the desktop-style web shell (pages render desktop page heads instead of the phone header). */
const WEB_SHELL: InjectionKey<Ref<boolean>> = Symbol('web-shell')
export function provideWebShell(active: Ref<boolean>) {
  provide(WEB_SHELL, active)
}
export function useInWebShell() {
  return inject(WEB_SHELL, ref(false))
}
