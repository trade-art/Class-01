import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN'
import enUS from './en-US'

export type Language = 'zh-CN' | 'en-US'

export const messages = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

// Get stored language or browser preference
function getDefaultLanguage(): Language {
  const stored = localStorage.getItem('settings')
  if (stored) {
    try {
      const settings = JSON.parse(stored)
      if (settings.language) {
        return settings.language
      }
    } catch {
      // Ignore parse error
    }
  }

  // Fallback to browser language
  const browserLang = navigator.language
  if (browserLang.startsWith('zh')) {
    return 'zh-CN'
  }
  return 'en-US'
}

const i18n = createI18n({
  legacy: false,
  locale: getDefaultLanguage(),
  fallbackLocale: 'en-US',
  messages,
})

export default i18n
