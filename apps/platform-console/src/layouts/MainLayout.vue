<template>
  <n-layout has-sider class="h-screen">
    <!-- Sidebar -->
    <n-layout-sider
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      :collapsed="settingsStore.sidebarCollapsed"
      show-trigger
      @collapse="settingsStore.sidebarCollapsed = true"
      @expand="settingsStore.sidebarCollapsed = false"
      :native-scrollbar="false"
      class="bg-card"
    >
      <!-- Logo -->
      <div class="h-14 flex-center border-b border-base px-4">
        <span v-if="!settingsStore.sidebarCollapsed" class="text-lg font-semibold text-primary">
          MT5 Platform
        </span>
        <span v-else class="text-lg font-bold text-primary">MT5</span>
      </div>

      <!-- Menu -->
      <n-menu
        :value="currentRoute"
        :collapsed="settingsStore.sidebarCollapsed"
        :collapsed-width="64"
        :collapsed-icon-size="20"
        :options="menuOptions"
        @update:value="handleMenuClick"
      />
    </n-layout-sider>

    <!-- Main Content -->
    <n-layout>
      <!-- Header -->
      <n-layout-header bordered class="h-14 flex-between px-6 bg-card">
        <!-- Breadcrumb -->
        <n-breadcrumb>
          <n-breadcrumb-item>
            <n-icon><i class="i-carbon-home" /></n-icon>
          </n-breadcrumb-item>
          <n-breadcrumb-item v-if="$route.meta.title">
            {{ t(`menu.${$route.name?.toString().toLowerCase()}`) || $route.meta.title }}
          </n-breadcrumb-item>
        </n-breadcrumb>

        <!-- Header Actions -->
        <div class="flex items-center gap-4">
          <!-- Language Switcher -->
          <n-dropdown :options="languageOptions" @select="handleLanguageChange">
            <n-button quaternary circle>
              <template #icon>
                <n-icon><i class="i-carbon-language" /></n-icon>
              </template>
            </n-button>
          </n-dropdown>

          <!-- Theme Toggle -->
          <n-tooltip>
            <template #trigger>
              <n-button quaternary circle @click="settingsStore.toggleTheme">
                <template #icon>
                  <n-icon>
                    <i v-if="settingsStore.isDark" class="i-carbon-sun" />
                    <i v-else class="i-carbon-moon" />
                  </n-icon>
                </template>
              </n-button>
            </template>
            {{ t('settings.toggleTheme') }}
          </n-tooltip>

          <!-- User Dropdown -->
          <n-dropdown :options="userDropdownOptions" @select="handleUserAction">
            <n-avatar
              round
              size="small"
              class="cursor-pointer"
              :style="{ backgroundColor: 'var(--primary-color)' }"
            >
              {{ userStore.user?.name?.[0] || 'U' }}
            </n-avatar>
          </n-dropdown>
        </div>
      </n-layout-header>

      <!-- Content -->
      <n-layout-content class="p-6 bg-base">
        <router-view v-slot="{ Component }">
          <transition name="slide-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<script setup lang="ts">
import { h, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NBreadcrumb,
  NBreadcrumbItem,
  NDropdown,
  NAvatar,
  NButton,
  NIcon,
  NTooltip,
  type MenuOption,
  type DropdownOption,
} from 'naive-ui'
import { useUserStore } from '@/stores/user'
import { useSettingsStore, type Language } from '@/stores/settings'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const settingsStore = useSettingsStore()

const currentRoute = computed(() => {
  const name = route.name as string
  if (name === 'TenantDetail') return 'tenants'
  if (name === 'InstanceDetail') return 'instances'
  if (name === 'MiddlewareDetail') return 'middleware'
  return name?.toLowerCase() || 'dashboard'
})

// Language options
const languageOptions: DropdownOption[] = [
  { label: '简体中文', key: 'zh-CN' },
  { label: 'English', key: 'en-US' },
]

function handleLanguageChange(key: string) {
  settingsStore.setLanguage(key as Language)
}

// Menu options
const menuOptions = computed<MenuOption[]>(() => [
  {
    label: t('menu.dashboard'),
    key: 'dashboard',
    icon: () => h('i', { class: 'i-carbon-dashboard' }),
  },
  {
    label: t('menu.tenants'),
    key: 'tenants',
    icon: () => h('i', { class: 'i-carbon-enterprise' }),
  },
  {
    label: t('menu.instances'),
    key: 'instances',
    icon: () => h('i', { class: 'i-carbon-bare-metal-server' }),
  },
  {
    label: t('menu.admins'),
    key: 'admins',
    icon: () => h('i', { class: 'i-carbon-user-admin' }),
  },
  {
    label: t('menu.subscriptions'),
    key: 'subscriptions',
    icon: () => h('i', { class: 'i-carbon-catalog' }),
  },
  {
    label: t('menu.invoices'),
    key: 'invoices',
    icon: () => h('i', { class: 'i-carbon-document' }),
  },
  {
    label: t('menu.trading'),
    key: 'trading',
    icon: () => h('i', { class: 'i-carbon-chart-line' }),
  },
  {
    label: t('menu.middleware'),
    key: 'middleware',
    icon: () => h('i', { class: 'i-carbon-cloud-services' }),
  },
])

// User dropdown options
const userDropdownOptions = computed<DropdownOption[]>(() => [
  {
    label: userStore.user?.name || t('common.user'),
    key: 'profile',
    icon: () => h('i', { class: 'i-carbon-user' }),
  },
  {
    type: 'divider',
    key: 'd1',
  },
  {
    label: t('common.logout'),
    key: 'logout',
    icon: () => h('i', { class: 'i-carbon-logout' }),
  },
])

function handleMenuClick(key: string) {
  router.push({ name: key.charAt(0).toUpperCase() + key.slice(1) })
}

function handleUserAction(key: string) {
  if (key === 'logout') {
    userStore.logout()
    router.push('/login')
  } else if (key === 'profile') {
    router.push('/profile')
  }
}

onMounted(async () => {
  if (userStore.isLoggedIn && !userStore.user) {
    try {
      await userStore.fetchProfile()
    } catch {
      router.push('/login')
    }
  }
})
</script>
