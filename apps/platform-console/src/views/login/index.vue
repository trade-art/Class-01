<template>
  <div class="min-h-screen flex-center bg-gradient-to-br from-[#18a058] to-[#0c7a43]">
    <div class="w-100 p-10 bg-card rounded-lg shadow-lg">
      <!-- Header -->
      <div class="text-center mb-8">
        <h1 class="text-2xl font-semibold text-[var(--text-color-base)] mb-2">
          MT5 Platform
        </h1>
        <p class="text-secondary">
          {{ t('auth.subtitle') }}
        </p>
      </div>

      <!-- Login Form -->
      <n-form ref="formRef" :model="form" :rules="rules" @submit.prevent="handleSubmit">
        <n-form-item path="email" :label="t('auth.email')">
          <n-input
            v-model:value="form.email"
            :placeholder="t('auth.emailPlaceholder')"
            size="large"
          >
            <template #prefix>
              <n-icon><i class="i-carbon-user" /></n-icon>
            </template>
          </n-input>
        </n-form-item>

        <n-form-item path="password" :label="t('auth.password')">
          <n-input
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            :placeholder="t('auth.passwordPlaceholder')"
            size="large"
          >
            <template #prefix>
              <n-icon><i class="i-carbon-locked" /></n-icon>
            </template>
          </n-input>
        </n-form-item>

        <n-form-item :show-label="false">
          <n-button
            type="primary"
            block
            size="large"
            :loading="loading"
            @click="handleSubmit"
          >
            {{ t('auth.login') }}
          </n-button>
        </n-form-item>
      </n-form>

      <!-- Footer -->
      <div class="text-center mt-4">
        <p class="text-xs text-tertiary">
          {{ t('auth.platformAdminLogin') }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  NForm,
  NFormItem,
  NInput,
  NButton,
  NIcon,
  useMessage,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import { useUserStore } from '@/stores/user'

const { t } = useI18n()
const router = useRouter()
const userStore = useUserStore()
const message = useMessage()

const formRef = ref<FormInst | null>(null)
const loading = ref(false)

const form = reactive({
  email: '',
  password: '',
})

const rules = computed<FormRules>(() => ({
  email: [
    { required: true, message: t('auth.emailRequired'), trigger: 'blur' },
    { type: 'email', message: t('auth.emailInvalid'), trigger: 'blur' },
  ],
  password: [
    { required: true, message: t('auth.passwordRequired'), trigger: 'blur' },
    { min: 6, message: t('auth.passwordMinLength'), trigger: 'blur' },
  ],
}))

async function handleSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  loading.value = true

  try {
    await userStore.login(form.email, form.password, 'platform_admin')
    message.success(t('auth.loginSuccess'))
    router.push('/dashboard')
  } catch (error: any) {
    message.error(error.message || t('auth.loginFailed'))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.text-tertiary {
  color: var(--text-color-tertiary);
}
</style>
