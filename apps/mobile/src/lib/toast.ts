import { ref } from 'vue'

export const toastMessage = ref('')
let timer: ReturnType<typeof setTimeout> | undefined

/** 提示停留时间随字数增加，错误说明不会一闪而过 */
export function toast(message: string, ms = Math.min(6000, Math.max(2200, message.length * 160))) {
  toastMessage.value = message
  clearTimeout(timer)
  timer = setTimeout(() => {
    toastMessage.value = ''
  }, ms)
}
