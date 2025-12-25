<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">{{ t('notification.title') }}</h1>
    </div>

    <n-card>
      <n-form label-placement="left" label-width="180">
        <!-- 邮件通知 -->
        <n-form-item :label="t('notification.emailNotifications')">
          <n-switch v-model:value="settings.emailEnabled" @update:value="handleSave" />
        </n-form-item>

        <!-- 风险预警 -->
        <n-form-item :label="t('notification.riskAlerts')">
          <n-switch v-model:value="settings.riskAlerts" :disabled="!settings.emailEnabled" @update:value="handleSave" />
        </n-form-item>

        <!-- 系统通知 -->
        <n-form-item :label="t('notification.systemAlerts')">
          <n-switch v-model:value="settings.systemAlerts" :disabled="!settings.emailEnabled" @update:value="handleSave" />
        </n-form-item>

        <!-- 交易提醒 -->
        <n-form-item :label="t('notification.tradingAlerts')">
          <n-switch v-model:value="settings.tradingAlerts" :disabled="!settings.emailEnabled" @update:value="handleSave" />
        </n-form-item>
      </n-form>

      <n-divider />

      <n-alert type="info" :show-icon="true">
        {{ t('notification.alertNotifications') }}
      </n-alert>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NForm,
  NFormItem,
  NSwitch,
  NDivider,
  NAlert,
  useMessage,
} from 'naive-ui'
import { settingsApi } from '@/api/settings'

const { t } = useI18n()
const message = useMessage()

const settings = reactive({
  emailEnabled: true,
  riskAlerts: true,
  systemAlerts: true,
  tradingAlerts: false,
})

const loadSettings = async () => {
  try {
    const data = await settingsApi.getNotificationSettings()
    if (data) {
      settings.emailEnabled = data.emailEnabled ?? true
      settings.riskAlerts = data.riskAlerts ?? true
      settings.systemAlerts = data.systemAlerts ?? true
      settings.tradingAlerts = data.tradingAlerts ?? false
    }
  } catch (error) {
    // 使用默认设置
    console.error('Failed to load notification settings:', error)
  }
}

const handleSave = async () => {
  try {
    await settingsApi.updateNotificationSettings(settings)
    message.success(t('notification.saveSuccess'))
  } catch (error: any) {
    message.error(error.message || t('notification.saveFailed'))
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<style scoped>
</style>
