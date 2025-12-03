import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import i18n from '@/locales'

export type ThemeMode = 'light' | 'dark' | 'system'
export type Language = 'zh-CN' | 'en-US'

export const useSettingsStore = defineStore(
  'settings',
  () => {
    // State
    const themeMode = ref<ThemeMode>('light')
    const language = ref<Language>('zh-CN')
    const sidebarCollapsed = ref(false)

    // Alias for themeMode (for backward compatibility)
    const theme = computed(() => themeMode.value)

    // Getters
    const isDark = computed(() => {
      if (themeMode.value === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches
      }
      return themeMode.value === 'dark'
    })

    // Actions
    const setThemeMode = (mode: ThemeMode) => {
      themeMode.value = mode
      applyTheme()
    }

    // Alias for setThemeMode (for backward compatibility)
    const setTheme = (mode: ThemeMode) => {
      setThemeMode(mode)
    }

    const toggleTheme = () => {
      if (themeMode.value === 'light') {
        themeMode.value = 'dark'
      } else {
        themeMode.value = 'light'
      }
      applyTheme()
    }

    const applyTheme = () => {
      if (isDark.value) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }

    const setLanguage = (lang: Language) => {
      language.value = lang
      i18n.global.locale.value = lang
      localStorage.setItem('language', lang)
    }

    const toggleSidebar = () => {
      sidebarCollapsed.value = !sidebarCollapsed.value
    }

    const setSidebarCollapsed = (collapsed: boolean) => {
      sidebarCollapsed.value = collapsed
    }

    // Watch for system theme changes
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQuery.addEventListener('change', () => {
        if (themeMode.value === 'system') {
          applyTheme()
        }
      })
    }

    // Initial theme application
    applyTheme()

    return {
      // State
      themeMode,
      language,
      sidebarCollapsed,
      theme,

      // Getters
      isDark,

      // Actions
      setThemeMode,
      setTheme,
      toggleTheme,
      setLanguage,
      toggleSidebar,
      setSidebarCollapsed,
    }
  },
  {
    persist: {
      key: 'tenant-settings',
      paths: ['themeMode', 'language', 'sidebarCollapsed'],
    },
  }
)
