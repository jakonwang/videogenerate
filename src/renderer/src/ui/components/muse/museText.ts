import { i18n } from '@/i18n'
import { translateMuse } from '@/locales/muse/dictionary'

/** Text of Muse 创意室 in the current language, keyed by the Chinese source. */
export const m = (text: string, ...args: unknown[]) => translateMuse(text, i18n.global.locale.value, args)
