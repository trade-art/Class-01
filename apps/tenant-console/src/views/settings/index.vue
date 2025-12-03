<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">{{ t('settings.title') }}</h1>
    </div>

    <!-- Settings Menu -->
    <div class="settings-grid">
      <n-card hoverable class="settings-card" @click="navigateTo('/settings/profile')">
        <div class="settings-icon" style="background-color: var(--primary-color);">
          <span class="i-carbon-user-avatar text-white text-2xl"></span>
        </div>
        <div class="settings-content">
          <h3 class="settings-title">{{ t('settings.profile') }}</h3>
          <p class="settings-desc">{{ t('settings.profileDesc') }}</p>
        </div>
        <div class="settings-arrow">
          <span class="i-carbon-chevron-right"></span>
        </div>
      </n-card>

      <n-card
        v-if="authStore.hasPermission('owner')"
        hoverable
        class="settings-card"
        @click="navigateTo('/settings/branding')"
      >
        <div class="settings-icon" style="background-color: var(--info-color);">
          <span class="i-carbon-color-palette text-white text-2xl"></span>
        </div>
        <div class="settings-content">
          <h3 class="settings-title">{{ t('settings.branding') }}</h3>
          <p class="settings-desc">{{ t('settings.brandingDesc') }}</p>
        </div>
        <div class="settings-arrow">
          <span class="i-carbon-chevron-right"></span>
        </div>
      </n-card>

      <n-card
        v-if="authStore.hasPermission('owner')"
        hoverable
        class="settings-card"
        @click="navigateTo('/settings/admins')"
      >
        <div class="settings-icon" style="background-color: var(--warning-color);">
          <span class="i-carbon-user-admin text-white text-2xl"></span>
        </div>
        <div class="settings-content">
          <h3 class="settings-title">{{ t('settings.admins') }}</h3>
          <p class="settings-desc">{{ t('settings.adminsDesc') }}</p>
        </div>
        <div class="settings-arrow">
          <span class="i-carbon-chevron-right"></span>
        </div>
      </n-card>

      <n-card
        v-if="authStore.hasPermission('admin')"
        hoverable
        class="settings-card"
        @click="navigateTo('/settings/api-keys')"
      >
        <div class="settings-icon" style="background-color: var(--success-color);">
          <span class="i-carbon-api text-white text-2xl"></span>
        </div>
        <div class="settings-content">
          <h3 class="settings-title">{{ t('settings.apiKeys') }}</h3>
          <p class="settings-desc">{{ t('settings.apiKeysDesc') }}</p>
        </div>
        <div class="settings-arrow">
          <span class="i-carbon-chevron-right"></span>
        </div>
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NCard } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const navigateTo = (path: string) => {
  router.push(path)
}
</script>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.settings-card {
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.settings-card:hover {
  transform: translateY(-2px);
}

.settings-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.settings-content {
  flex: 1;
}

.settings-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--text-color-base);
}

.settings-desc {
  font-size: 13px;
  color: var(--text-color-secondary);
  margin: 0;
}

.settings-arrow {
  font-size: 20px;
  color: var(--text-color-secondary);
  transition: transform 0.2s ease;
}

.settings-card:hover .settings-arrow {
  transform: translateX(4px);
}
</style>
