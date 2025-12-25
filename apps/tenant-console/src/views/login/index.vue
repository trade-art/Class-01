<template>
  <div class="login-container">
    <div class="login-card">
      <!-- Logo & Title -->
      <div class="login-header">
        <img
          v-if="tenantStore.logoUrl"
          :src="tenantStore.logoUrl"
          alt="Logo"
          class="login-logo"
        />
        <div v-else class="login-logo-placeholder">
          <span class="i-carbon-enterprise text-3xl"></span>
        </div>
        <h1 class="login-title">{{ tenantStore.companyName }}</h1>
        <p class="login-subtitle">{{ t('auth.tenantLogin') }}</p>
      </div>

      <!-- Login Form -->
      <n-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-placement="left"
        label-width="0"
        size="large"
      >
        <n-form-item path="email">
          <n-input
            v-model:value="formData.email"
            :placeholder="t('auth.emailPlaceholder')"
            @keyup.enter="handleLogin"
          >
            <template #prefix>
              <span class="i-carbon-email text-secondary"></span>
            </template>
          </n-input>
        </n-form-item>

        <n-form-item path="password">
          <n-input
            v-model:value="formData.password"
            type="password"
            show-password-on="click"
            :placeholder="t('auth.passwordPlaceholder')"
            @keyup.enter="handleLogin"
          >
            <template #prefix>
              <span class="i-carbon-password text-secondary"></span>
            </template>
          </n-input>
        </n-form-item>

        <n-form-item>
          <div class="login-options">
            <n-checkbox v-model:checked="formData.rememberMe">
              {{ t('auth.rememberMe') }}
            </n-checkbox>
          </div>
        </n-form-item>

        <n-form-item>
          <n-button
            type="primary"
            block
            :loading="loading"
            @click="handleLogin"
          >
            {{ t('auth.login') }}
          </n-button>
        </n-form-item>
      </n-form>
    </div>

    <!-- Theme & Language Toggle -->
    <div class="login-footer">
      <n-button quaternary circle @click="settingsStore.toggleTheme">
        <template #icon>
          <span :class="settingsStore.isDark ? 'i-carbon-sun' : 'i-carbon-moon'"></span>
        </template>
      </n-button>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  NForm,
  NFormItem,
  NInput,
  NButton,
  NCheckbox,
  NDropdown,
  useMessage,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useTenantStore } from '@/stores/tenant'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const message = useMessage()

const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const tenantStore = useTenantStore()

const formRef = ref<FormInst | null>(null)
const loading = ref(false)

const formData = reactive({
  email: '',
  password: '',
  rememberMe: false,
})

const rules: FormRules = {
  email: [
    { required: true, message: () => t('auth.pleaseEnterEmail'), trigger: 'blur' },
    { type: 'email', message: () => t('auth.invalidEmail'), trigger: 'blur' },
  ],
  password: [
    { required: true, message: () => t('auth.pleaseEnterPassword'), trigger: 'blur' },
  ],
}

const languageOptions = [
  { label: '简体中文', key: 'zh-CN' },
  { label: 'English', key: 'en-US' },
]

const handleLogin = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  loading.value = true
  try {
    // 邮箱全局唯一，无需租户代码
    await authStore.login(formData.email, formData.password, undefined, formData.rememberMe)

    // Update tenant store with login response
    if (authStore.tenant) {
      tenantStore.setTenant(authStore.tenant)
    }

    message.success(t('auth.loginSuccess'))

    // Redirect to intended page or dashboard
    const redirect = route.query.redirect as string
    router.push(redirect || '/')
  } catch (error: any) {
    const errorMessage = error.message || t('auth.invalidCredentials')
    message.error(errorMessage)
  } finally {
    loading.value = false
  }
}

const handleLanguageSelect = (key: string) => {
  settingsStore.setLanguage(key as 'zh-CN' | 'en-US')
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-color-pressed) 100%);
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 40px;
  background-color: var(--card-color);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-logo {
  width: 64px;
  height: 64px;
  object-fit: contain;
  margin-bottom: 16px;
}

.login-logo-placeholder {
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--primary-color);
  color: white;
  border-radius: 12px;
}

.login-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text-color-base);
}

.login-subtitle {
  font-size: 14px;
  color: var(--text-color-secondary);
  margin: 0;
}

.login-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.login-footer {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  gap: 8px;
}

.login-footer .n-button {
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
}

.login-footer .n-button:hover {
  background-color: rgba(255, 255, 255, 0.3);
}
</style>
