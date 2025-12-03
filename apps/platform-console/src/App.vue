<template>
  <n-config-provider :theme="theme" :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="themeOverrides">
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
import { computed } from 'vue'
import {
  NConfigProvider,
  NLoadingBarProvider,
  NDialogProvider,
  NNotificationProvider,
  NMessageProvider,
  darkTheme,
  zhCN,
  dateZhCN,
  type GlobalThemeOverrides,
} from 'naive-ui'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()

const theme = computed(() => {
  return settingsStore.isDark ? darkTheme : null
})

// Naive UI theme overrides to match CSS variables
const themeOverrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    primaryColor: settingsStore.isDark ? '#63e2b7' : '#18a058',
    primaryColorHover: settingsStore.isDark ? '#7fe7c4' : '#36ad6a',
    primaryColorPressed: settingsStore.isDark ? '#5acea7' : '#0c7a43',
    primaryColorSuppl: settingsStore.isDark ? '#7fe7c4' : '#36ad6a',
    borderRadius: '6px',
  },
}))
</script>
