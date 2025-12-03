<template>
  <n-config-provider
    :theme="theme"
    :locale="locale"
    :date-locale="dateLocale"
    :theme-overrides="themeOverrides"
  >
    <n-loading-bar-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <n-message-provider>
            <router-view />
          </n-message-provider>
        </n-notification-provider>
      </n-dialog-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import {
  NConfigProvider,
  NLoadingBarProvider,
  NDialogProvider,
  NNotificationProvider,
  NMessageProvider,
  darkTheme,
  zhCN,
  dateZhCN,
  enUS,
  dateEnUS,
  type GlobalThemeOverrides,
} from 'naive-ui'
import { useSettingsStore } from '@/stores/settings'
import { useTenantStore } from '@/stores/tenant'

const settingsStore = useSettingsStore()
const tenantStore = useTenantStore()

const theme = computed(() => {
  return settingsStore.isDark ? darkTheme : null
})

const locale = computed(() => {
  return settingsStore.language === 'zh-CN' ? zhCN : enUS
})

const dateLocale = computed(() => {
  return settingsStore.language === 'zh-CN' ? dateZhCN : dateEnUS
})

// Apply theme class to html element
watchEffect(() => {
  if (settingsStore.isDark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
})

// Apply tenant branding primary color
watchEffect(() => {
  const primaryColor = tenantStore.branding?.primaryColor
  if (primaryColor) {
    document.documentElement.style.setProperty('--tenant-primary-color', primaryColor)
  }
})

// Naive UI theme overrides - supports tenant branding
const themeOverrides = computed<GlobalThemeOverrides>(() => {
  const brandColor = tenantStore.branding?.primaryColor
  const defaultLight = '#18a058'
  const defaultDark = '#63e2b7'

  const primary = brandColor || (settingsStore.isDark ? defaultDark : defaultLight)

  return {
    common: {
      primaryColor: primary,
      primaryColorHover: adjustColor(primary, 15),
      primaryColorPressed: adjustColor(primary, -15),
      primaryColorSuppl: adjustColor(primary, 15),
      borderRadius: '6px',
    },
  }
})

// Helper function to adjust color brightness
function adjustColor(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const R = (num >> 16) + amt
  const G = (num >> 8 & 0x00FF) + amt
  const B = (num & 0x0000FF) + amt
  return '#' + (0x1000000 +
    (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)
  ).toString(16).slice(1)
}
</script>
