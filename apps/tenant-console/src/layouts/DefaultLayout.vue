<template>
  <n-layout has-sider class="layout">
    <!-- Sidebar -->
    <n-layout-sider
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      :collapsed="settingsStore.sidebarCollapsed"
      show-trigger
      @collapse="settingsStore.setSidebarCollapsed(true)"
      @expand="settingsStore.setSidebarCollapsed(false)"
      class="sidebar"
    >
      <!-- Logo -->
      <div class="logo-container">
        <img
          v-if="tenantStore.logoUrl"
          :src="tenantStore.logoUrl"
          alt="Logo"
          class="logo-image"
        />
        <div v-else class="logo-placeholder">
          <span class="i-carbon-enterprise text-2xl"></span>
        </div>
        <span v-if="!settingsStore.sidebarCollapsed" class="logo-text">
          {{ tenantStore.companyName }}
        </span>
      </div>

      <!-- Menu -->
      <n-menu
        :collapsed="settingsStore.sidebarCollapsed"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="menuOptions"
        :value="activeKey"
        @update:value="handleMenuSelect"
      />
    </n-layout-sider>

    <!-- Main Content -->
    <n-layout>
      <!-- Header -->
      <n-layout-header bordered class="header">
        <div class="header-left">
          <!-- Breadcrumb -->
          <n-breadcrumb>
            <n-breadcrumb-item v-for="item in breadcrumbs" :key="item.path">
              <router-link v-if="item.path" :to="item.path">{{ item.title }}</router-link>
              <span v-else>{{ item.title }}</span>
            </n-breadcrumb-item>
          </n-breadcrumb>
        </div>

        <div class="header-right">
          <!-- Theme Toggle -->
          <n-tooltip>
            <template #trigger>
              <n-button quaternary circle @click="settingsStore.toggleTheme">
                <template #icon>
                  <span :class="settingsStore.isDark ? 'i-carbon-sun' : 'i-carbon-moon'"></span>
                </template>
              </n-button>
            </template>
            {{ t('settings.toggleTheme') }}
          </n-tooltip>

          <!-- Language Switch -->
          <n-dropdown
            trigger="click"
            :options="languageOptions"
            @select="handleLanguageSelect"
          >
            <n-button quaternary circle>
              <template #icon>
                <span class="i-carbon-translate"></span>
              </template>
            </n-button>
          </n-dropdown>

          <!-- User Menu -->
          <n-dropdown
            trigger="click"
            :options="userMenuOptions"
            @select="handleUserMenuSelect"
          >
            <div class="user-info">
              <n-avatar round size="small">
                {{ authStore.admin?.name?.charAt(0) || 'U' }}
              </n-avatar>
              <span class="user-name">{{ authStore.admin?.name }}</span>
              <span class="i-carbon-chevron-down text-xs"></span>
            </div>
          </n-dropdown>
        </div>
      </n-layout-header>

      <!-- Content -->
      <n-layout-content class="content">
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
import { computed, h } from 'vue'
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
  NButton,
  NTooltip,
  NDropdown,
  NAvatar,
  useMessage,
  type MenuOption,
} from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useTenantStore } from '@/stores/tenant'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const message = useMessage()

const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const tenantStore = useTenantStore()

// Menu configuration
const menuOptions = computed<MenuOption[]>(() => {
  const baseMenu: MenuOption[] = [
    {
      label: t('menu.dashboard'),
      key: 'dashboard',
      icon: () => h('span', { class: 'i-carbon-dashboard' }),
    },
    {
      label: t('menu.users'),
      key: 'users',
      icon: () => h('span', { class: 'i-carbon-user-multiple' }),
    },
    {
      label: t('menu.positions'),
      key: 'positions',
      icon: () => h('span', { class: 'i-carbon-activity' }),
    },
    {
      label: t('menu.quotes'),
      key: 'quotes',
      icon: () => h('span', { class: 'i-carbon-chart-line' }),
    },
    {
      label: t('menu.history'),
      key: 'history',
      icon: () => h('span', { class: 'i-carbon-document' }),
    },
    {
      label: t('menu.riskMonitor'),
      key: 'risk',
      icon: () => h('span', { class: 'i-carbon-warning' }),
    },
    {
      type: 'divider',
      key: 'd1',
    },
    {
      label: t('menu.reports'),
      key: 'reports',
      icon: () => h('span', { class: 'i-carbon-analytics' }),
      children: [
        {
          label: t('menu.tradingReport'),
          key: 'trading-report',
        },
        {
          label: t('menu.userReport'),
          key: 'user-report',
        },
        {
          label: t('menu.financeReport'),
          key: 'finance-report',
        },
      ],
    },
    {
      type: 'divider',
      key: 'd2',
    },
    {
      label: t('menu.settings'),
      key: 'settings',
      icon: () => h('span', { class: 'i-carbon-settings' }),
      children: [
        ...(authStore.isAdmin
          ? [
              {
                label: t('menu.branding'),
                key: 'branding',
              },
            ]
          : []),
        ...(authStore.isOwner
          ? [
              {
                label: t('menu.admins'),
                key: 'admins',
              },
            ]
          : []),
        ...(authStore.isAdmin
          ? [
              {
                label: t('menu.apiKeys'),
                key: 'api-keys',
              },
              {
                label: t('menu.mtServers'),
                key: 'mt-servers',
              },
              {
                label: t('menu.mtManagers'),
                key: 'mt-managers',
              },
              {
                label: t('menu.middlewareInstances'),
                key: 'middleware-instances',
              },
            ]
          : []),
        {
          label: t('menu.profile'),
          key: 'profile',
        },
        {
          label: t('menu.notifications'),
          key: 'notifications',
        },
      ],
    },
  ]

  return baseMenu
})

// Active menu key
const activeKey = computed(() => {
  const name = route.name as string
  return name || 'dashboard'
})

// Breadcrumbs
const breadcrumbs = computed(() => {
  const items: { title: string; path?: string }[] = []

  if (route.meta.title) {
    items.push({ title: t(route.meta.title as string) })
  }

  return items
})

// Language options
const languageOptions = [
  { label: '简体中文', key: 'zh-CN' },
  { label: 'English', key: 'en-US' },
]

// User menu options
const userMenuOptions = computed(() => [
  {
    label: t('menu.profile'),
    key: 'profile',
    icon: () => h('span', { class: 'i-carbon-user' }),
  },
  {
    type: 'divider',
    key: 'd1',
  },
  {
    label: t('auth.logout'),
    key: 'logout',
    icon: () => h('span', { class: 'i-carbon-logout' }),
  },
])

// Handlers
const handleMenuSelect = (key: string) => {
  const routeMap: Record<string, string> = {
    dashboard: '/',
    users: '/users',
    positions: '/positions',
    quotes: '/quotes',
    history: '/history',
    risk: '/risk',
    'trading-report': '/reports/trading',
    'user-report': '/reports/users',
    'finance-report': '/reports/finance',
    branding: '/settings/branding',
    admins: '/settings/admins',
    'api-keys': '/settings/api-keys',
    'mt-servers': '/mt-servers',
    'mt-managers': '/mt-managers',
    'middleware-instances': '/settings/middleware-instances',
    profile: '/settings/profile',
    notifications: '/settings/notifications',
  }

  const path = routeMap[key]
  if (path) {
    router.push(path)
  }
}

const handleLanguageSelect = (key: string) => {
  settingsStore.setLanguage(key as 'zh-CN' | 'en-US')
}

const handleUserMenuSelect = async (key: string) => {
  if (key === 'profile') {
    router.push('/settings/profile')
  } else if (key === 'logout') {
    try {
      await authStore.logout()
      tenantStore.clear()
      message.success(t('auth.logout'))
    } catch (error) {
      // 忽略 logout API 错误
      console.error('Logout error:', error)
    } finally {
      // 确保无论如何都跳转到登录页面
      router.push('/login')
    }
  }
}
</script>

<style scoped>
.layout {
  min-height: 100vh;
}

.sidebar {
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05);
}

.logo-container {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color);
  overflow: hidden;
}

.logo-image {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.logo-placeholder {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--primary-color);
  color: white;
  border-radius: 6px;
  flex-shrink: 0;
}

.logo-text {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 24px;
}

.header-left {
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.user-info:hover {
  background-color: var(--border-color);
}

.user-name {
  font-size: 14px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content {
  padding: 16px 24px;
  min-height: calc(100vh - 56px);
}
</style>
