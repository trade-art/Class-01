import { defineStore } from 'pinia'
import { ref } from 'vue'
import i18n from '@/locales'

export type ThemeMode = 'light' | 'dark' | 'system'
export type Language = 'zh-CN' | 'en-US'

export const useSettingsStore = defineStore('settings', () => {
  // Theme
  const themeMode = ref<ThemeMode>('system')
  const isDark = ref(false)

  // Language
  const language = ref<Language>('zh-CN')

  // Sidebar
  const sidebarCollapsed = ref(false)

  // Initialize theme based on system preference
  const initTheme = () => {
    const savedTheme = localStorage.getItem('theme-mode') as ThemeMode | null
    if (savedTheme) {
      themeMode.value = savedTheme
    }
    updateTheme()
  }

  // Update theme based on mode
  const updateTheme = () => {
    if (themeMode.value === 'system') {
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
    } else {
      isDark.value = themeMode.value === 'dark'
    }

    // Update document class
    if (isDark.value) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  // Set theme mode
  const setThemeMode = (mode: ThemeMode) => {
    themeMode.value = mode
    localStorage.setItem('theme-mode', mode)
    updateTheme()
  }

  // Toggle theme
  const toggleTheme = () => {
    if (themeMode.value === 'light') {
      setThemeMode('dark')
    } else if (themeMode.value === 'dark') {
      setThemeMode('system')
    } else {
      setThemeMode('light')
    }
  }

  // Set language
  const setLanguage = (lang: Language) => {
    language.value = lang
    i18n.global.locale.value = lang
    localStorage.setItem('language', lang)
  }

  // Toggle sidebar
  const toggleSidebar = () => {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  // Listen for system theme changes
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (themeMode.value === 'system') {
        updateTheme()
      }
    })
  }

  // Initialize on store creation
  initTheme()

  return {
    themeMode,
    isDark,
    language,
    sidebarCollapsed,
    setThemeMode,
    toggleTheme,
    setLanguage,
    toggleSidebar,
  }
}, {
  persist: {
    paths: ['themeMode', 'language', 'sidebarCollapsed'],
  },
})
