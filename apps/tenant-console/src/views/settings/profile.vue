<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">{{ t('settings.profile') }}</h1>
    </div>

    <div class="profile-grid">
      <!-- Profile Info -->
      <n-card :title="t('settings.basicInfo')">
        <n-form
          ref="profileFormRef"
          :model="profileData"
          :rules="profileRules"
          label-placement="left"
          label-width="100"
        >
          <n-form-item :label="t('settings.name')" path="name">
            <n-input v-model:value="profileData.name" :placeholder="t('settings.namePlaceholder')" />
          </n-form-item>

          <n-form-item :label="t('settings.email')">
            <n-input :value="authStore.user?.email" disabled />
          </n-form-item>

          <n-form-item :label="t('settings.role')">
            <n-tag :type="roleType">{{ roleLabel }}</n-tag>
          </n-form-item>

          <n-form-item :label="t('settings.phone')" path="phone">
            <n-input v-model:value="profileData.phone" :placeholder="t('settings.phonePlaceholder')" />
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space justify="end">
            <n-button type="primary" :loading="savingProfile" @click="handleSaveProfile">
              {{ t('common.save') }}
            </n-button>
          </n-space>
        </template>
      </n-card>

      <!-- Change Password -->
      <n-card :title="t('settings.changePassword')">
        <n-form
          ref="passwordFormRef"
          :model="passwordData"
          :rules="passwordRules"
          label-placement="left"
          label-width="100"
        >
          <n-form-item :label="t('settings.currentPassword')" path="currentPassword">
            <n-input
              v-model:value="passwordData.currentPassword"
              type="password"
              show-password-on="click"
              :placeholder="t('settings.currentPasswordPlaceholder')"
            />
          </n-form-item>

          <n-form-item :label="t('settings.newPassword')" path="newPassword">
            <n-input
              v-model:value="passwordData.newPassword"
              type="password"
              show-password-on="click"
              :placeholder="t('settings.newPasswordPlaceholder')"
            />
          </n-form-item>

          <n-form-item :label="t('settings.confirmPassword')" path="confirmPassword">
            <n-input
              v-model:value="passwordData.confirmPassword"
              type="password"
              show-password-on="click"
              :placeholder="t('settings.confirmPasswordPlaceholder')"
            />
          </n-form-item>
        </n-form>

        <template #footer>
          <n-space justify="end">
            <n-button type="primary" :loading="savingPassword" @click="handleChangePassword">
              {{ t('settings.updatePassword') }}
            </n-button>
          </n-space>
        </template>
      </n-card>

      <!-- Preferences -->
      <n-card :title="t('settings.preferences')">
        <n-form label-placement="left" label-width="100">
          <n-form-item :label="t('settings.theme')">
            <n-radio-group v-model:value="preferences.theme" @update:value="handleThemeChange">
              <n-space>
                <n-radio value="light">{{ t('settings.lightTheme') }}</n-radio>
                <n-radio value="dark">{{ t('settings.darkTheme') }}</n-radio>
                <n-radio value="system">{{ t('settings.systemTheme') }}</n-radio>
              </n-space>
            </n-radio-group>
          </n-form-item>

          <n-form-item :label="t('settings.language')">
            <n-select
              v-model:value="preferences.language"
              :options="languageOptions"
              style="width: 200px"
              @update:value="handleLanguageChange"
            />
          </n-form-item>

          <n-form-item :label="t('settings.notifications')">
            <n-space vertical>
              <n-checkbox v-model:checked="preferences.emailNotifications">
                {{ t('settings.emailNotifications') }}
              </n-checkbox>
              <n-checkbox v-model:checked="preferences.browserNotifications">
                {{ t('settings.browserNotifications') }}
              </n-checkbox>
            </n-space>
          </n-form-item>
        </n-form>
      </n-card>

      <!-- Session Info -->
      <n-card :title="t('settings.sessionInfo')">
        <n-descriptions :column="1" label-placement="left">
          <n-descriptions-item :label="t('settings.lastLogin')">
            {{ authStore.user?.lastLoginAt ? new Date(authStore.user.lastLoginAt).toLocaleString() : '-' }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('settings.loginIp')">
            {{ authStore.user?.lastLoginIp || '-' }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('settings.accountCreated')">
            {{ authStore.user?.createdAt ? new Date(authStore.user.createdAt).toLocaleString() : '-' }}
          </n-descriptions-item>
        </n-descriptions>

        <template #footer>
          <n-space justify="end">
            <n-button type="error" @click="handleLogoutAll">
              {{ t('settings.logoutAllDevices') }}
            </n-button>
          </n-space>
        </template>
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NSpace,
  NForm,
  NFormItem,
  NInput,
  NTag,
  NRadioGroup,
  NRadio,
  NSelect,
  NCheckbox,
  NDescriptions,
  NDescriptionsItem,
  useMessage,
  useDialog,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { settingsApi } from '@/api/settings'
import type { TenantAdminRole } from '@/types'

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()

const profileFormRef = ref<FormInst | null>(null)
const passwordFormRef = ref<FormInst | null>(null)
const savingProfile = ref(false)
const savingPassword = ref(false)

const profileData = reactive({
  name: '',
  phone: '',
})

const passwordData = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const preferences = reactive({
  theme: 'system' as 'light' | 'dark' | 'system',
  language: 'zh-CN',
  emailNotifications: true,
  browserNotifications: false,
})

const profileRules: FormRules = {
  name: [{ required: true, message: () => t('settings.nameRequired'), trigger: 'blur' }],
}

const passwordRules: FormRules = {
  currentPassword: [{ required: true, message: () => t('settings.currentPasswordRequired'), trigger: 'blur' }],
  newPassword: [
    { required: true, message: () => t('settings.newPasswordRequired'), trigger: 'blur' },
    { min: 8, message: () => t('settings.passwordMinLength'), trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: () => t('settings.confirmPasswordRequired'), trigger: 'blur' },
    {
      validator: (_rule, value) => {
        if (value !== passwordData.newPassword) {
          return new Error(t('settings.passwordMismatch'))
        }
        return true
      },
      trigger: 'blur',
    },
  ],
}

const languageOptions = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
]

const roleType = computed(() => {
  const typeMap: Record<TenantAdminRole, 'error' | 'warning' | 'info'> = {
    owner: 'error',
    admin: 'warning',
    operator: 'info',
  }
  return typeMap[authStore.role] || 'info'
})

const roleLabel = computed(() => {
  const labelMap: Record<TenantAdminRole, string> = {
    owner: t('settings.roleOwner'),
    admin: t('settings.roleAdmin'),
    operator: t('settings.roleOperator'),
  }
  return labelMap[authStore.role] || authStore.role
})

const loadProfile = () => {
  const user = authStore.user
  if (user) {
    profileData.name = user.name
    profileData.phone = user.phone || ''
  }

  preferences.theme = settingsStore.theme
  preferences.language = settingsStore.language
}

const handleSaveProfile = async () => {
  try {
    await profileFormRef.value?.validate()
  } catch {
    return
  }

  savingProfile.value = true
  try {
    await settingsApi.updateProfile(profileData)
    authStore.updateUser({ name: profileData.name, phone: profileData.phone })
    message.success(t('settings.profileUpdated'))
  } catch (error: any) {
    message.error(error.message || t('common.error'))
  } finally {
    savingProfile.value = false
  }
}

const handleChangePassword = async () => {
  try {
    await passwordFormRef.value?.validate()
  } catch {
    return
  }

  savingPassword.value = true
  try {
    await settingsApi.changePassword({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
    })
    message.success(t('settings.passwordChanged'))
    // Reset form
    passwordData.currentPassword = ''
    passwordData.newPassword = ''
    passwordData.confirmPassword = ''
  } catch (error: any) {
    message.error(error.message || t('settings.wrongPassword'))
  } finally {
    savingPassword.value = false
  }
}

const handleThemeChange = (value: 'light' | 'dark' | 'system') => {
  if (value === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    settingsStore.setTheme(isDark ? 'dark' : 'light')
  } else {
    settingsStore.setTheme(value)
  }
}

const handleLanguageChange = (value: 'zh-CN' | 'en-US') => {
  settingsStore.setLanguage(value)
}

const handleLogoutAll = () => {
  dialog.warning({
    title: t('settings.logoutAllDevices'),
    content: t('settings.logoutAllConfirm'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await settingsApi.logoutAllDevices()
        message.success(t('settings.logoutAllSuccess'))
        authStore.logout()
      } catch (error: any) {
        message.error(error.message || t('common.error'))
      }
    },
  })
}

onMounted(() => {
  loadProfile()
})
</script>

<style scoped>
.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

@media (max-width: 1024px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }
}
</style>
